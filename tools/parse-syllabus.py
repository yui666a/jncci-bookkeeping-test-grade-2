"""出題区分表PDFを syllabus.yml に変換する。

pdftotext -layout の出力は級ごとに表示桁の帯へ分かれる。日本語は全角のため、
桁は文字数ではなく東アジア文字幅で数える。1行に複数の級が同居するので、
判定は行単位ではなくセグメント単位で行う。

項目名は桁幅に収まらないと次行へ折り返す。折り返しの断片は title へ連結し、
括弧書きの限定文言はその項目の限定として、書かれていた桁帯の級とともに持つ。
"""
import re
import subprocess
import sys
import unicodedata

# 3個以上の連続空白のみを列の区切りとみなす。2個以下は項目内の字下げ。
SEGMENT = re.compile(r'(?:^|\s{3,})((?:\S|\s{1,2}(?=\S))+)')
SECTION = re.compile(r'^第([一二三四五六七八九十]+)\s+(.+)$')
GROUP = re.compile(r'^([０-９0-9]{1,2})[．.]\s*(.+)$')
ITEM = re.compile(r'^([ア-ン])[．.]\s*(.+)$')
SUBITEM = re.compile(r'^\(([a-z])\)\s*(.+)$')
# 表本体の開始は「科目名」の見出し行。それより前には前文・改定履歴・
# (注)の箇条書きがあり、行頭の全角数字がGROUPと誤認されるため除外する。
TITLE = re.compile(r'^\s*「.+」')
# 工業簿記の各ページ冒頭にある「２級 １級 ２級 １級」ヘッダー行。
# これより前には表題・改定日の自由文があり項目名と誤認されるため、
# ページごとにこの行までを読み飛ばす。
GRADE_HEADER = re.compile(r'^\s*２級\s+１級\s+２級\s+１級\s*$')
# ページヘッダー・ページ番号など、項目名でも項目の続きでもないものを
# 無記号セグメントの中から除外する。
# Why not: 括弧で始まるセグメントをここで捨てない。「(利息法、級数法)」の
# ような級ごとの限定は原本が持つ級判定の根拠であり、捨てると復元できない。
FURNITURE = re.compile(r'^[0-9０-９]+$|^[３２１]級?$|^級$|^商工会議所|^「.+」$|^\(注')
# 括弧書きの限定文言の始まり。全角・半角どちらの括弧でも始まりうる。
QUALIFIER = re.compile(r'^[（(]')

GROUP_NO = re.compile(r'^[（(]?([０-９0-9]{1,2})')
ITEM_NO = re.compile(r'^([ア-ン])[．.]')
SUBITEM_NO = re.compile(r'^[（(]([a-zａ-ｚ])[）)]')
ZEN2HAN = str.maketrans('０１２３４５６７８９', '0123456789')

_state = {'section': None, 'group': None, 'section_heading': None,
          'section_grade': None, 'section_subject': None, 'section_children': 0,
          # 折り返しの続きの受け皿。last は直前に確定した項目。
          # open は桁帯ごとに「書きかけの文字列」の置き場を持つ。1行に
          # 級の違う限定文言が並び、それぞれが独立に折り返すため、帯で分ける。
          'last': None, 'open': {}}


def width(s):
    return sum(2 if unicodedata.east_asian_width(c) in 'WF' else 1 for c in s)


def segments(line):
    """(表示開始桁, 表示幅, 文字列) を返す。"""
    out = []
    for m in SEGMENT.finditer(line):
        text = m.group(1).strip()
        if text:
            col = width(line[:m.start(1)])
            out.append((col, width(line[:m.end(1)]) - col, text))
    return out


def make(section, group_head, title, grade, subject):
    return {
        'subject': subject,
        'section': section or '',
        # Why not: group を文字列で複製しない。項の見出しも折り返しで
        # 伸びるため、複製すると子項目だけ切れた見出しを持つ。
        'group_head': group_head,
        'title': title,
        # この項目が項の見出しそのものか。IDの分岐に使う。
        'is_group_head': False,
        'grade': grade,
        # 級ごとの限定文言。{級: [文言, ...]}。
        'notes': {},
    }


def emit_entry(entry, band, span=None):
    """項目を1件確定し、以後の折り返し・限定文言の係り先として覚える。

    span はその項目がPDF上で占めた表示桁の幅。欄の右端まで達していたかを
    折り返しの判定に使うため、確定時に控える。
    """
    _state['section_children'] += 1
    _state['last'] = entry
    _state['open'][band] = {'owner': entry, 'key': 'title', 'span': span}
    return [entry]


def append_fragment(text, band, full):
    """折り返しの続きを、その帯で書きかけの title または限定文言へ連結する。

    折り返しは、行が級の欄の右端まで達したときにだけ起こる。欄を余して
    終わっている項目の下の無記号の行は、「２０．収益と費用」の下に並ぶ
    勘定科目の列挙のように、項目名の続きではない別の記述である。
    Why not: 字下げの深さでは見分けない。同じ桁のまま折り返す欄もあれば、
    右端で折り返すとかえって左へ寄る欄もあり、深さは向きが定まらない。
    """
    open_ = _state['open'].get(band)
    if not open_:
        return
    if open_['key'] == 'title':
        if open_['span'] is not None and open_['span'] < full:
            return
        open_['owner']['title'] += text
    else:
        open_['owner']['notes'][open_['key']][-1] += text


def add_qualifier(text, grade, band):
    """括弧書きの限定文言を、直前に確定した項目へその級で付ける。

    限定は、それが書かれた桁帯の級に係る。「オ．減価償却(間接法)」の下に
    3級欄「(定額法)」と2級欄「(定率法、生産高比例法)」が並ぶように、
    同じ項目へ級の違う限定が同時に付く。
    """
    target = _state['last']
    if target is None:
        return
    target['notes'].setdefault(grade, []).append(text)
    # 限定文言も桁幅で折り返すため、閉じ括弧が揃うまで続きを受け取る。
    _state['open'][band] = ({'owner': target, 'key': grade}
                            if text.count('(') + text.count('（')
                            > text.count(')') + text.count('）') else None)


def flush_childless_section():
    """子項目を1件も持たないまま終わったセクション見出しを、見出し自体を
    1件の項目として返す。「第十八 工場会計の独立※」のように、区分表の
    原本に本文の箇条書きが存在しないセクションがあり、見出しを捨てる
    通常の扱いのままではそのセクションが構造化データから消えてしまう。
    """
    if _state['section'] and _state['section_children'] == 0:
        return emit_entry(make(_state['section'], None, _state['section_heading'],
                               _state['section_grade'], _state['section_subject']), 0, 0)
    return []


def classify(seg, grade, subject, is_new_band=False, band=0, span=0, full=99):
    """セグメント1つを分類する。新しい項目なら1件、それ以外は0件を返す。

    項目にならないセグメントは捨てずに直前の項目へ吸収させる。括弧書きは
    その級の限定文言として、記号のない断片は折り返しの続きとして扱う。

    is_new_band: このセグメントの表示桁帯が直前の行では空だったか。
    真のとき、ア〜ンの記号を持たない項目名（グループの子要素が記号を
    持たないケース）を新規項目として受理する。
    """
    m = SECTION.match(seg)
    if m:
        flushed = flush_childless_section()
        _state['section'] = '第%s %s' % (m.group(1), m.group(2))
        _state['section_heading'] = m.group(2)
        _state['group'] = None
        _state['section_grade'] = grade
        _state['section_subject'] = subject
        _state['section_children'] = 0
        _state['open'] = {}
        return flushed
    if GROUP.match(seg):
        head = make(_state['section'], None, seg, grade, subject)
        head['group_head'] = head
        head['is_group_head'] = True
        _state['group'] = head
        return emit_entry(head, band, span)
    if ITEM.match(seg) or SUBITEM.match(seg):
        return emit_entry(
            make(_state['section'], _state['group'], seg, grade, subject), band, span)
    if FURNITURE.match(seg):
        return []
    if QUALIFIER.match(seg):
        # 書きかけの限定文言が残っている帯では、括弧で始まっていても続きである。
        # 「(全部純資産直入法)、繰延税金資産…」のように、折り返した先頭が
        # 内側の括弧で始まることがある。
        open_ = _state['open'].get(band)
        if open_ and open_['key'] != 'title':
            append_fragment(seg, band, full)
        else:
            add_qualifier(seg, grade, band)
        return []
    if is_new_band:
        return emit_entry(
            make(_state['section'], _state['group'], seg, grade, subject), band, span)
    append_fragment(seg, band, full)
    return []


def grade_of(col, bounds):
    for limit, grade in bounds:
        if col < limit:
            return grade
    return bounds[-1][1]


def band_of(col, bounds):
    """表示桁からその桁が属する帯の通し番号を返す。grade_of と同じ境界を使う。"""
    for i, (limit, _) in enumerate(bounds):
        if col < limit:
            return i
    return len(bounds) - 1


def parse(pdf, bounds, subject, full):
    text = subprocess.run(
        ['pdftotext', '-layout', pdf, '-'],
        capture_output=True, text=True, check=True).stdout
    _state['section'] = None
    _state['group'] = None
    _state['section_children'] = 0
    _state['last'] = None
    _state['open'] = {}
    entries = []
    started = False
    # 折り返し行の断片を新規項目として拾わないよう、直前行で埋まって
    # いた帯を記憶する。空行はセクション区切りなので継続とみなさない。
    prev_bands = set()
    for line in text.split('\n'):
        if not started:
            if TITLE.match(line):
                started = True
            continue
        if not line.strip():
            prev_bands = set()
            continue
        cur_bands = set()
        for col, span, seg in segments(line):
            b = band_of(col, bounds)
            cur_bands.add(b)
            is_new_band = b not in prev_bands
            entries.extend(classify(seg, grade_of(col, bounds), subject,
                                    is_new_band, b, span, full))
        prev_bands = cur_bands
    entries.extend(flush_childless_section())
    return entries


def yaml_escape(s):
    return '"%s"' % s.replace('\\', '\\\\').replace('"', '\\"')


def clean(s):
    """※は級の注記であり項目名の一部ではないため、表示用の文字列から外す。"""
    return s.replace('※', '').strip()


def group_of(e):
    """項目が属する項の見出し。折り返しを連結し終えた最終形を返す。"""
    return clean(e['group_head']['title']) if e['group_head'] else ''


def topic_id(e):
    """区分表の構造（節・項番号・項目記号）からIDを組む。

    見出し文字列を切り詰めてIDにすると、原本の字句がわずかに変わるだけで
    IDが別物になる。IDは教材の boki-topics メタが指す永続キーであり、
    黙って別の論点を指すと、カバレッジ検証が誤った合格を出す。
    """
    head = e['section'].split()[0] if e['section'] else '無題'
    # 商業簿記と工業簿記は節番号(第一〜)を共有するため、科目を含めないと衝突する。
    m = GROUP_NO.match(group_of(e))
    parts = [e['subject'], head, m.group(1).translate(ZEN2HAN) if m else '0']
    for pat in (ITEM_NO, SUBITEM_NO):
        m = pat.match(clean(e['title']))
        if m:
            parts.append(m.group(1))
            return '-'.join(parts)
    # 行頭記号を持たない項目。※のない項の見出しは見出しとして、上級欄の
    # 無記号項目と※つきの見出しは級で区別する。
    # Why not: title と group の文字列一致で見分けない。見出しも折り返しで
    # 伸びるうえ※の有無で食い違い、同じ項目が別のIDへ落ちる。
    head_of_group = e['is_group_head'] and '※' not in e['title']
    parts.append('0' if head_of_group else 'g%d' % e['grade'])
    return '-'.join(parts)


def emit(entries):
    lines = ['# 出題区分表（2022年度版）を構造化したもの。',
             '# 原本と生成方法は reference/SOURCES.md と tools/parse-syllabus.py を参照。',
             '# 手で編集しない。原本から再生成する。',
             'topics:']
    seen = {}
    for e in entries:
        base = topic_id(e)
        n = seen.get(base, 0) + 1
        seen[base] = n
        tid = base if n == 1 else '%s-%d' % (base, n)
        lines.append('  - id: %s' % yaml_escape(tid))
        lines.append('    subject: %s' % e['subject'])
        lines.append('    section: %s' % yaml_escape(clean(e['section'])))
        lines.append('    group: %s' % yaml_escape(group_of(e)))
        lines.append('    title: %s' % yaml_escape(clean(e['title'])))
        lines.append('    grade: %d' % e['grade'])
        lines.append('    advanced: %s' % ('true' if '※' in e['title'] else 'false'))
        # Why not: 級ごとの入れ子リストにしない。読み手の tools/check.mjs の
        # YAMLリーダは項目1件を平坦なスカラーの並びとして読むため、入れ子を
        # 置くと限定文言の行が別の論点として読まれる。
        for grade in sorted(e['notes']):
            lines.append('    limit_grade%d: %s'
                         % (grade, yaml_escape(clean(' '.join(e['notes'][grade])))))
    return '\n'.join(lines) + '\n'


def parse_kogen(pdf, full):
    """工業簿記の区分表を読む。

    1ページに「2級/1級」の組を横に2つ並べる版面のため、左右の組を分けて
    読み、左を読み切ってから右を読む。右組は左組の続きである。
    """
    text = subprocess.run(
        ['pdftotext', '-layout', pdf, '-'],
        capture_output=True, text=True, check=True).stdout
    _state['section'] = None
    _state['group'] = None
    _state['section_children'] = 0
    _state['last'] = None
    _state['open'] = {}
    entries = []
    for page in text.split('\f'):
        if not page.strip():
            continue
        left, right = [], []
        # 折り返し行の断片を新規項目として拾わないよう、直前行で埋まって
        # いた帯を記憶する。左右の組で独立に判定する。商業簿記と同じ帯
        # 単位の判定を用いる（同一行内で2級と1級の項目が同時に始まる
        # ケースを正しく拾うため、左右の組単位までは緩めない）。
        prev_left_bands = set()
        prev_right_bands = set()
        # (注)の脚注ブロックは表本体の下に列位置を共有して続くため、
        # 一度検出したらそのページのその帯以降は本体ではなく脚注として
        # 読み飛ばす。
        note_bands = set()
        started = False
        for line in page.split('\n'):
            if not started:
                if GRADE_HEADER.match(line):
                    started = True
                continue
            if not line.strip():
                prev_left_bands = set()
                prev_right_bands = set()
                continue
            cur_left_bands = set()
            cur_right_bands = set()
            for col, span, seg in segments(line):
                # 左右の組を分ける境界。ヘッダー実測は26/46だが、本文の
                # セグメント開始桁は26-37が空白でヘッダーより右組が
                # 手前にずれ込む（例: 桁39の項目が右組に属する）ため、
                # 実測分布の空白帯（29と37の間）である33を境界とする。
                is_left = col < 33
                # 帯の境界は級の境界（53）と別に置く。右組の項目は節見出し
                # の内側へ字下げされるため、折り返し（「イ．設備投資の意思
                # 決定モデ」桁57 に続く「ル」桁68）が級の境界をまたぐ。
                # 53で帯を割ると、この続きが新規項目に化ける。
                # 同一行に2項目が並ぶのは桁74以上に限られるので、帯の境界は
                # そこへ置く。
                b = (0 if col < 18 else 1) if is_left else (0 if col < 72 else 1)
                key = ('left' if is_left else 'right', b)
                if key in note_bands:
                    continue
                if seg.startswith('（注'):
                    note_bands.add(key)
                    continue
                if is_left:
                    is_new_band = b not in prev_left_bands
                    cur_left_bands.add(b)
                    left.append((2 if col < 18 else 1, seg, is_new_band, key, span))
                else:
                    is_new_band = b not in prev_right_bands
                    cur_right_bands.add(b)
                    # 級の境界は桁53。右組の2級欄は桁37-52、1級欄は桁54-69に
                    # 分布し、桁53は全ページで空である。
                    # Why not: 桁61で割らない。1級欄の項目名が長いと欄いっぱい
                    # まで書かれて桁54から始まり、61で割ると「エ．繰延法」
                    # 「エ．複数基準配賦法」「イ．設備投資の意思決定モデル」の
                    # ように、項目名の長さで級が決まってしまう。
                    right.append((2 if col < 53 else 1, seg, is_new_band, key, span))
            prev_left_bands = cur_left_bands
            prev_right_bands = cur_right_bands
        for grade, seg, is_new_band, key, span in left + right:
            entries.extend(classify(seg, grade, '工', is_new_band, key, span, full))
    entries.extend(flush_childless_section())
    return entries


def main():
    # 商業簿記：3級 / 2級 / 1級 の3帯。境界は実測の桁分布による。
    # full は「級の欄いっぱいまで書かれた」とみなす表示幅。折り返しの判定に
    # 使う。版面が違えば欄の幅も違うため、区分表ごとに実測値を与える。
    shogyo = parse('reference/shogyouboki_kubun.pdf',
                   [(24, 3), (48, 2), (999, 1)], '商', 36)
    kogen = parse_kogen('reference/kogyoboki_kubun.pdf', 26)
    sys.stdout.write(emit(shogyo + kogen))


if __name__ == '__main__':
    main()
