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


def grade_of(x):
    for limit, grade in BOUNDS:
        if x < limit:
            return grade
    return BOUNDS[-1][1]


def group_rows(words):
    """(x, y, text) のリストを、yMinの近い単語ごとの行にまとめる。"""
    rows = []
    for x, y, text in sorted(words, key=lambda w: (w[1], w[0])):
        if rows and abs(rows[-1][0] - y) <= ROW_TOLERANCE:
            rows[-1][1].append((x, text))
        else:
            rows.append([y, [(x, text)]])
    return [r[1] for r in rows]


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
        for row in group_rows(words):
            segs = merge_columns(row)
            if len(segs) == 1 and CATEGORY.match(segs[0][1]):
                category = segs[0][1].replace('（資本）', '')
                continue
            if not category:
                continue
            for x, seg in segs:
                if NOISE.match(seg) or seg in FURNITURE:
                    continue
                grade = grade_of(x)
                # 同名が3級と2級の両方に出た場合、下位の級を採用する
                if seg not in found or grade > found[seg]['grade']:
                    found[seg] = {'name': seg, 'grade': grade, 'category': category}

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
