"""商業簿記標準・許容勘定科目表PDFを accounts.yml に変換する。

A欄が標準科目、B欄が採点上許容される科目。PDF本文の記載により、
2級で使える科目は2級欄と3級欄の和集合である。
"""
import re
import subprocess
import sys
import unicodedata

SEGMENT = re.compile(r'(?:^|\s{3,})((?:\S|\s{1,2}(?=\S))+)')
CATEGORY = re.compile(r'^(資産|負債|純資産(?:（資本）)?|収益|費用)$')
NOISE = re.compile(r'^(Ａ\s*欄|Ｂ\s*欄|[３２]\s*級|※|・|＜|この表)')

# pdftotext -layout の出力を実測して求めた列境界（表示幅基準）。
# 3級A欄:  0-19 / 3級B欄: 20-37 / 2級A欄: 38-58 / 2級B欄: 59-
BOUNDS = [(20, 3), (38, 3), (59, 2), (999, 2)]


def width(s):
    return sum(2 if unicodedata.east_asian_width(c) in 'WF' else 1 for c in s)


def segments(line):
    out = []
    for m in SEGMENT.finditer(line):
        t = m.group(1).strip()
        if t:
            out.append((width(line[:m.start(1)]), t))
    return out


def grade_of(col):
    for limit, grade in BOUNDS:
        if col < limit:
            return grade
    return BOUNDS[-1][1]


def main():
    text = subprocess.run(
        ['pdftotext', '-layout', 'reference/kamokuhyo.pdf', '-'],
        capture_output=True, text=True, check=True).stdout
    category = ''
    found = {}
    for line in text.split('\n'):
        if not line.strip():
            continue
        segs = segments(line)
        if len(segs) == 1 and CATEGORY.match(segs[0][1]):
            category = segs[0][1].replace('（資本）', '')
            continue
        if not category:
            continue
        for col, seg in segs:
            if NOISE.match(seg):
                continue
            grade = grade_of(col)
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
