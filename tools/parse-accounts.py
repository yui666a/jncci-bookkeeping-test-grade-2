"""商業簿記標準・許容勘定科目表PDFを accounts.yml に変換する。

A欄が標準科目、B欄が採点上許容される科目。PDF本文の記載により、
2級で使える科目は2級欄と3級欄の和集合である。

列の判定には pdftotext -bbox が返す各単語の xMin 座標を用いる。
-layout のテキスト整形（表示幅を文字数から丸めた桁位置）は
科目名の長さによって同じ列でも桁位置が数桁ぶれることがあり、
境界に近い科目の級を取り違える。xMin は活字の物理座標であり
科目名の内容に左右されないため、境界値を安定して判定できる。
"""
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

NS = {'h': 'http://www.w3.org/1999/xhtml'}
CATEGORY = re.compile(r'^(資産|負債|純資産(?:（資本）)?|収益|費用)$')
NOISE = re.compile(r'^(Ａ\s*欄|Ｂ\s*欄|[３２]\s*級|※|・|＜|この表)')
# 表の欄・級見出しやページ番号は、pdftotextの単語分割によりＡ・欄・３・級のように
# 一文字ずつ独立した単語としても出現するため、完全一致でも除外する。
FURNITURE = {'Ａ', 'Ｂ', '３', '２', '欄', '級',
             '１', '４', '５', '６', '７', '８', '９',
             '1', '2', '3', '4', '5', '6', '7', '8', '9'}

# pdftotext -bbox のxMin座標を実測して求めた4列の中心と、その中間点を境界とする。
# 3級A欄:  33 / 3級B欄: 161 / 2級A欄: 323 / 2級B欄: 451
BOUNDS = [(97, 3), (242, 3), (387, 2), (99999, 2)]

# 同一行内で同じ列に属する単語をまとめる際の許容誤差（pt）。
COLUMN_TOLERANCE = 25.0
# 同一行と見なすyMinの許容誤差（pt）。同一行の単語はyMinがほぼ一致する。
ROW_TOLERANCE = 1.0
# 折り返しの後半は、セル内の行送り（12pt）だけ下に現れる。次の科目は
# 行の高さ（15pt以上）だけ離れるため、yMinの差で両者を区別できる。
# 行番号で数えると、間に別の列の行が挟まる場合に取り違える。
WRAP_LINE_GAP = 13.0
# 折り返しが起きる科目名の最小長。これ未満はセル幅に余裕があり折り返さない。
WRAP_MIN_LEN = 10


def grade_of(x):
    for limit, grade in BOUNDS:
        if x < limit:
            return grade
    return BOUNDS[-1][1]


def group_rows(words):
    """(x, y, text) のリストを、yMinの近い単語ごとに (y, 行) へまとめる。"""
    rows = []
    for x, y, text in sorted(words, key=lambda w: (w[1], w[0])):
        if rows and abs(rows[-1][0] - y) <= ROW_TOLERANCE:
            rows[-1][1].append((x, text))
        else:
            rows.append([y, [(x, text)]])
    return [(r[0], r[1]) for r in rows]


def merge_columns(row):
    """同一行内で、列境界をまたがない近接した単語同士を結合する。"""
    row = sorted(row)
    merged = []
    for x, text in row:
        if merged and grade_of(x) == grade_of(merged[-1][0]) and \
                x - merged[-1][2] < COLUMN_TOLERANCE:
            px, ptext, _ = merged[-1]
            merged[-1] = (px, ptext + text, x)
        else:
            merged.append((x, text, x))
    return [(x, text) for x, text, _ in merged]


# 「前払保険料など前払費用の各勘定」のように、具体的な科目名と、それが
# 属する分類とを1つのセルにまとめた記載がある。前半は実在する科目名なので、
# 分割して両方を登録しないと、正しい科目名が「実在しない」と判定される。
GLOSS = re.compile(r'^(.+?)など(.+?)の各勘定$')


def split_gloss(name):
    """具体例つきの記載を、具体的な科目名と分類名に分ける。"""
    m = GLOSS.match(name)
    return [m.group(1), m.group(2)] if m else [name]


def join_wrapped_cells(rows):
    """セル内で折り返した科目名を、直前の同じ列の科目名に連結する。

    表のセルは幅を超えると次の行へ折り返す。折り返した後半は独立した行に
    現れるため、そのままでは前半が切れた科目名（「法人税、住民税及び事業」）と
    意味をなさない断片（「税」）の2件になる。

    折り返しはセル内の行送り（12pt）だけ下に現れ、次の科目は行の高さ
    （15pt以上）だけ離れる。この差で両者を区別する。行番号で数えると、
    間に別の列の行が挟まる場合に取り違える。
    """
    out = [(y, list(segs)) for y, segs in rows]
    for i, (y, segs) in enumerate(out):
        # 1行に複数の列が同時に折り返すことがある（「車両運搬具減価償却累計」と
        # 「車両減価償却累計額、減価」が同じ行で折り返す）。各セグメントを
        # 独立に見る。後ろから消すのでインデックスがずれない。
        for si in range(len(segs) - 1, -1, -1):
            x, text = out[i][1][si]
            for j in range(i - 1, -1, -1):
                if y - out[j][0] > WRAP_LINE_GAP:
                    break
                same = [k for k, (px, _) in enumerate(out[j][1])
                        if abs(px - x) <= COLUMN_TOLERANCE]
                if not same:
                    continue
                k = same[0]
                if len(out[j][1][k][1]) >= WRAP_MIN_LEN:
                    out[j][1][k] = (out[j][1][k][0], out[j][1][k][1] + text)
                    del out[i][1][si]
                break
    return [segs for _, segs in out if segs]


def main():
    xml_text = subprocess.run(
        ['pdftotext', '-bbox', 'reference/kamokuhyo.pdf', '-'],
        capture_output=True, text=True, check=True).stdout
    root = ET.fromstring(xml_text)

    category = ''
    found = {}
    for page in root.findall('.//h:page', NS):
        words = []
        for w in page.findall('h:word', NS):
            text = (w.text or '').strip()
            if text:
                words.append((float(w.get('xMin')), float(w.get('yMin')), text))
        rows = [(y, merge_columns(r)) for y, r in group_rows(words)]
        rows = join_wrapped_cells(rows)
        for segs in rows:
            if len(segs) == 1 and CATEGORY.match(segs[0][1]):
                category = segs[0][1].replace('（資本）', '')
                continue
            if not category:
                continue
            for x, seg in segs:
                if NOISE.match(seg) or seg in FURNITURE:
                    continue
                grade = grade_of(x)
                for name in split_gloss(seg):
                    # 同名が3級と2級の両方に出た場合、下位の級を採用する
                    if name not in found or grade > found[name]['grade']:
                        found[name] = {'name': name, 'grade': grade,
                                       'category': category}

    lines = ['# 商業簿記標準・許容勘定科目表（2022年度版）を構造化したもの。',
             '# 原本と生成方法は reference/SOURCES.md と tools/parse-accounts.py を参照。',
             '# 手で編集しない。原本から再生成する。',
             '#',
             '# 2級には3級の標準・許容勘定科目がすべて含まれる（原本の記載による）。',
             '# したがって2級の教材で使える科目は grade 2 と grade 3 の和集合である。',
             '#',
             '# 製造業の勘定科目（仕掛品・製品など）は原本に含まれない。',
             '# 工業簿記の科目はこの表で照合できない。',
             'accounts:']
    for v in found.values():
        lines.append('  - name: "%s"' % v['name'].replace('"', '\\"'))
        lines.append('    grade: %d' % v['grade'])
        lines.append('    category: %s' % v['category'])
    sys.stdout.write('\n'.join(lines) + '\n')


if __name__ == '__main__':
    main()
