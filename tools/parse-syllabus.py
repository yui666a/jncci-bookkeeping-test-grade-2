"""出題区分表PDFを syllabus.yml に変換する。

pdftotext -layout の出力は級ごとに表示桁の帯へ分かれる。日本語は全角のため、
桁は文字数ではなく東アジア文字幅で数える。1行に複数の級が同居するので、
判定は行単位ではなくセグメント単位で行う。
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
# ページヘッダー・注記・カッコ書きの補足・ページ番号など、項目名ではない
# ものを無記号セグメントの中から除外する。
FURNITURE = re.compile(r'^[（(]|^[0-9０-９]+$|^[３２１]級?$|^級$|^商工会議所|^「.+」$|^\(注')

_state = {'section': None, 'group': None, 'section_heading': None,
          'section_grade': None, 'section_subject': None, 'section_children': 0}


def width(s):
    return sum(2 if unicodedata.east_asian_width(c) in 'WF' else 1 for c in s)


def segments(line):
    """(表示開始桁, 文字列) を返す。"""
    out = []
    for m in SEGMENT.finditer(line):
        text = m.group(1).strip()
        if text:
            out.append((width(line[:m.start(1)]), text))
    return out


def make(section, group, title, grade, subject):
    return {
        'subject': subject,
        'section': section or '',
        'group': group or '',
        'title': title.replace('※', '').strip(),
        'grade': grade,
        'advanced': '※' in title,
    }


def flush_childless_section():
    """子項目を1件も持たないまま終わったセクション見出しを、見出し自体を
    1件の項目として返す。「第十八 工場会計の独立※」のように、区分表の
    原本に本文の箇条書きが存在しないセクションがあり、見出しを捨てる
    通常の扱いのままではそのセクションが構造化データから消えてしまう。
    """
    if _state['section'] and _state['section_children'] == 0:
        return [make(_state['section'], None, _state['section_heading'],
                     _state['section_grade'], _state['section_subject'])]
    return []


def classify(seg, grade, subject, is_new_band=False):
    """セグメント1つを分類する。項目なら1件、見出しなら0件を返す。

    is_new_band: このセグメントの表示桁帯が直前の行では空だったか。
    真のとき、ア〜ンの記号を持たない項目名（グループの子要素が記号を
    持たないケース）を新規項目として受理する。偽のときは、前の行から
    続く折り返し文の断片とみなし、記号なしセグメントは捨てる。
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
        return flushed
    if GROUP.match(seg):
        _state['group'] = seg
        _state['section_children'] += 1
        return [make(_state['section'], seg, seg, grade, subject)]
    if ITEM.match(seg):
        _state['section_children'] += 1
        return [make(_state['section'], _state['group'], seg, grade, subject)]
    if SUBITEM.match(seg):
        _state['section_children'] += 1
        return [make(_state['section'], _state['group'], seg, grade, subject)]
    if is_new_band and not FURNITURE.match(seg):
        _state['section_children'] += 1
        return [make(_state['section'], _state['group'], seg, grade, subject)]
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


def parse(pdf, bounds, subject):
    text = subprocess.run(
        ['pdftotext', '-layout', pdf, '-'],
        capture_output=True, text=True, check=True).stdout
    _state['section'] = None
    _state['group'] = None
    _state['section_children'] = 0
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
        for col, seg in segments(line):
            b = band_of(col, bounds)
            cur_bands.add(b)
            is_new_band = b not in prev_bands
            entries.extend(classify(seg, grade_of(col, bounds), subject, is_new_band))
        prev_bands = cur_bands
    entries.extend(flush_childless_section())
    return entries


def yaml_escape(s):
    return '"%s"' % s.replace('\\', '\\\\').replace('"', '\\"')


def emit(entries):
    lines = ['# 出題区分表（2022年度版）を構造化したもの。',
             '# 原本と生成方法は reference/SOURCES.md と tools/parse-syllabus.py を参照。',
             '# 手で編集しない。原本から再生成する。',
             'topics:']
    seen = {}
    for e in entries:
        head = e['section'].split()[0] if e['section'] else '無題'
        base = '%s-%s' % (head, e['title'][:12])
        n = seen.get(base, 0) + 1
        seen[base] = n
        tid = base if n == 1 else '%s-%d' % (base, n)
        lines.append('  - id: %s' % yaml_escape(tid))
        lines.append('    subject: %s' % e['subject'])
        lines.append('    section: %s' % yaml_escape(e['section']))
        lines.append('    group: %s' % yaml_escape(e['group']))
        lines.append('    title: %s' % yaml_escape(e['title']))
        lines.append('    grade: %d' % e['grade'])
        lines.append('    advanced: %s' % ('true' if e['advanced'] else 'false'))
    return '\n'.join(lines) + '\n'


def parse_kogen(pdf):
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
            for col, seg in segments(line):
                # 左右の組を分ける境界。ヘッダー実測は26/46だが、本文の
                # セグメント開始桁は26-37が空白でヘッダーより右組が
                # 手前にずれ込む（例: 桁39の項目が右組に属する）ため、
                # 実測分布の空白帯（29と37の間）である33を境界とする。
                is_left = col < 33
                b = (0 if col < 18 else 1) if is_left else (0 if col < 61 else 1)
                key = ('left' if is_left else 'right', b)
                if key in note_bands:
                    continue
                if seg.startswith('（注'):
                    note_bands.add(key)
                    continue
                if is_left:
                    is_new_band = b not in prev_left_bands
                    cur_left_bands.add(b)
                    left.append((2 if col < 18 else 1, seg, is_new_band))
                else:
                    is_new_band = b not in prev_right_bands
                    cur_right_bands.add(b)
                    right.append((2 if col < 61 else 1, seg, is_new_band))
            prev_left_bands = cur_left_bands
            prev_right_bands = cur_right_bands
        for grade, seg, is_new_band in left + right:
            entries.extend(classify(seg, grade, '工', is_new_band))
    entries.extend(flush_childless_section())
    return entries


def main():
    # 商業簿記：3級 / 2級 / 1級 の3帯。境界は実測の桁分布による。
    shogyo = parse('reference/shogyouboki_kubun.pdf',
                   [(24, 3), (48, 2), (999, 1)], '商')
    kogen = parse_kogen('reference/kogyoboki_kubun.pdf')
    sys.stdout.write(emit(shogyo + kogen))


if __name__ == '__main__':
    main()
