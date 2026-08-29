# Claude Code セットアップ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 教材の品質ゲート8項目を、機械的検査（スクリプト）と判断的検査（サブエージェント）に分けて自動化する。

**Architecture:** 出題区分表と勘定科目表のPDFを構造化データ（YAML）に変換し、それを唯一の一次情報とする。検証は Playwright で `file://` を開き、DOM と JS ランタイムから読む。サブエージェント4体はプロジェクトスコープで `.claude/agents/` に置く。

**Tech Stack:** Node.js 26（ローカル既存）、Playwright（Chromium はローカルにインストール済み）、Python 3（PDF変換の一度きりの処理にのみ使用）、pdftotext（poppler、`/opt/homebrew/bin/pdftotext` に既存）

**Spec:** `docs/superpowers/specs/2026-08-29-claude-setup-design.md`

## Global Constraints

- 教材HTMLは外部CDN・外部フォント・画像URLを参照しない。オフラインで `file://` から直接開いて動くこと
- 検証スクリプトは npm 依存を追加しない。Playwright のみをローカル既存のものとして使う
- HTMLの解析に正規表現を使わない。DOM から読む
- 絵文字を使わない（教材・スクリプト出力とも）
- 制作過程や検討の経緯を成果物に書かない
- 級の判定は `reference/syllabus.yml` を根拠とする。記憶で答えない
- 本命試験は2026年11月15日 第174回。適用される区分表は2022年度版（2021年12月10日最終改定・2022年4月1日施行）
- 式の評価に `eval` / `new Function` を使わない
- npm スクリプト名は `check` とする。この環境の git hook が別の語を含むコマンドをブロックするため

---

### Task 1: reference/ に一次情報のPDFと出典を置く

**Files:**
- Create: `reference/shogyouboki_kubun.pdf`
- Create: `reference/kogyoboki_kubun.pdf`
- Create: `reference/kamokuhyo.pdf`
- Create: `reference/SOURCES.md`

**Interfaces:**
- Consumes: なし
- Produces: 後続タスクが読む3本のPDF。パスは上記で固定

- [ ] **Step 1: PDFを取得する**

出典ページ https://www.kentei.ne.jp/bookkeeping/exam-list に掲載されたリンクから取得する。

```bash
mkdir -p reference
curl -sSL -A "Mozilla/5.0" -o reference/shogyouboki_kubun.pdf \
  "https://www.kentei.ne.jp/wp/wp-content/uploads/2024/12/shogyouboki_kubun.pdf"
curl -sSL -A "Mozilla/5.0" -o reference/kogyoboki_kubun.pdf \
  "https://www.kentei.ne.jp/wp/wp-content/uploads/2021/12/2022_kogen.pdf"
curl -sSL -A "Mozilla/5.0" -o reference/kamokuhyo.pdf \
  "https://www.kentei.ne.jp/wp/wp-content/uploads/2021/12/2022_kamoku.pdf"
```

- [ ] **Step 2: 取得したPDFが正しいことを確認する**

```bash
file reference/*.pdf
pdftotext -f 1 -l 1 -layout reference/shogyouboki_kubun.pdf - | head -6
pdftotext -f 1 -l 1 -layout reference/kogyoboki_kubun.pdf - | head -3
pdftotext -f 1 -l 1 -layout reference/kamokuhyo.pdf - | head -8
```

期待する結果:
- 3本とも `PDF document` であること（HTMLのエラーページを掴んでいないこと）
- `shogyouboki_kubun.pdf` に「商工会議所簿記検定試験出題区分表」「2021 年 12 月 10 日 最終改定」「（2022 年 ４ 月 １ 日 施行）」が出ること
- `kogyoboki_kubun.pdf` に「「工業簿記・原価計算」」「2021 年 12 月 10 日 最終改定」が出ること
- `kamokuhyo.pdf` に「商業簿記標準・許容勘定科目表」が出ること

**2027年度版を掴んだ場合はやり直す。** ファイル名に `2027` を含むPDFは改定後のもので、本命試験には適用されない。

- [ ] **Step 3: SOURCES.md を書く**

`reference/SOURCES.md` に次を書く。

```markdown
# 一次情報の出典

このディレクトリのPDFは、日本商工会議所の公式サイトから取得した原本である。
級の境界と勘定科目の判定は、テキストや要約ではなくこれらを根拠とする。

取得元ページ：https://www.kentei.ne.jp/bookkeeping/exam-list
取得日：2026-08-29

| ファイル | 内容 | 改定・施行 |
|---|---|---|
| `shogyouboki_kubun.pdf` | 出題区分表「商業簿記・会計学」 | 2021年12月10日 最終改定／2022年4月1日 施行 |
| `kogyoboki_kubun.pdf` | 出題区分表「工業簿記・原価計算」 | 2021年12月10日 最終改定／2022年4月1日 施行 |
| `kamokuhyo.pdf` | 商業簿記標準・許容勘定科目表 | 2021年12月10日 改定／2022年4月1日 施行 |

## 適用範囲

本命の第174回（2026年11月15日）に適用されるのは、上記の2022年度版である。

2027年4月1日から改定版が施行される。同ページには2027年度版のPDFも掲載されているが、
2027年3月31日までの試験には適用されない。取り違えると、紙の手形の廃止や
新リース会計基準への対応など、出題されない論点を教材に含めることになる。
```

- [ ] **Step 4: コミットする**

`git add reference/` のうえで、次のメッセージでコミットする。

```
docs: 出題区分表と勘定科目表の原本を一次情報として追加

級の境界の判定を、テキストの目次や要約メモではなく原本に接地させる。
要約に載っていない論点は「抜けていること」自体を検出できないため、
カバレッジ検証の根拠には原本が要る。

区分表は2027年3月31日まで改定されない。本命の第174回まで内容が変化
しないため、リポジトリに固定して参照の最短経路にする。
```

---

### Task 2: 商業簿記の区分表を syllabus.yml に変換する

**Files:**
- Create: `tools/parse-syllabus.py`
- Create: `reference/syllabus.yml`

**Interfaces:**
- Consumes: `reference/shogyouboki_kubun.pdf`（Task 1）
- Produces: `reference/syllabus.yml`。各項目は `id`（文字列）/ `subject`（`商` または `工`）/ `section` / `group` / `title` / `grade`（整数 3/2/1）/ `advanced`（真偽値、※印）を持つ

**変換方式の根拠（実測値）**

`pdftotext -layout` の出力は、3級・2級・1級が表示桁で3つの帯に分かれる。日本語は全角なので、桁は文字数ではなく**東アジア文字幅**で数える。

セグメント開始桁の実測分布は 0〜10 / 24〜41 / 50〜71 の3つの塊になる。したがって境界は **24** と **48**。

1行に複数の級が同居する（例：`ア．資産、負債、および資本    純資産と資本の関係` は3級と2級）。**行単位ではなく、3個以上の連続空白で区切ったセグメント単位**で級を判定する。空白2個以下は項目内の字下げなので区切らない。

- [ ] **Step 1: 変換スクリプトを書く**

`tools/parse-syllabus.py` に次を書く。

```python
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

_state = {'section': None, 'group': None}


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


def classify(seg, grade, subject):
    """セグメント1つを分類する。項目なら1件、見出しなら0件を返す。"""
    m = SECTION.match(seg)
    if m:
        _state['section'] = '第%s %s' % (m.group(1), m.group(2))
        _state['group'] = None
        return []
    if GROUP.match(seg):
        _state['group'] = seg
        return [make(_state['section'], seg, seg, grade, subject)]
    if ITEM.match(seg):
        return [make(_state['section'], _state['group'], seg, grade, subject)]
    return []


def grade_of(col, bounds):
    for limit, grade in bounds:
        if col < limit:
            return grade
    return bounds[-1][1]


def parse(pdf, bounds, subject):
    text = subprocess.run(
        ['pdftotext', '-layout', pdf, '-'],
        capture_output=True, text=True, check=True).stdout
    _state['section'] = None
    _state['group'] = None
    entries = []
    for line in text.split('\n'):
        if not line.strip():
            continue
        for col, seg in segments(line):
            entries.extend(classify(seg, grade_of(col, bounds), subject))
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


def main():
    # 商業簿記：3級 / 2級 / 1級 の3帯。境界は実測の桁分布による。
    shogyo = parse('reference/shogyouboki_kubun.pdf',
                   [(24, 3), (48, 2), (999, 1)], '商')
    sys.stdout.write(emit(shogyo))


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: 変換して、既知の級境界と一致するか検証する**

`教材制作ルール.md` の「級の境界に関する注意」が、この計画における唯一の検証用の答えである。

```bash
python3 tools/parse-syllabus.py > reference/syllabus.yml
grep -c '  - id:' reference/syllabus.yml
for k in 建設仮勘定 伝票 除却 圧縮記帳 税効果 連結; do
  echo "== $k"
  grep -A5 "title: \"[^\"]*$k" reference/syllabus.yml | grep -E 'title:|grade:|advanced:'
done
```

期待する結果:
- 項目数が200件以上
- `建設仮勘定` が `grade: 2`
- `伝票` が `grade: 3`
- `有形固定資産の除却、廃棄` が `grade: 2`
- `圧縮記帳` が `grade: 2` かつ `advanced: true`
- `税効果会計` が `grade: 2` かつ `advanced: true`
- `連結` に `grade: 2` の項目が存在する

**1件でも食い違ったら、境界値（24 / 48）とセグメント分割を見直す。** 期待に合わせてYAMLを手で直さない。手で直すと、次に再生成したときに戻る。

- [ ] **Step 3: コミットする**

`git add tools/parse-syllabus.py reference/syllabus.yml` のうえで、次のメッセージでコミットする。

```
feat: 商業簿記の出題区分表を構造化データに変換する

カバレッジ検証には、区分表を機械可読な形で持つ必要がある。

級の判定を行単位で行うと誤る。1行に3級と2級が同居する項目があるため、
3個以上の連続空白で区切ったセグメント単位で判定する。日本語は全角なので
桁は文字数ではなく東アジア文字幅で数える。
```

---

### Task 3: 工業簿記の区分表を syllabus.yml に統合する

**Files:**
- Modify: `tools/parse-syllabus.py`
- Modify: `reference/syllabus.yml`

**Interfaces:**
- Consumes: `parse()` / `make()` / `segments()` / `classify()` / `emit()`（Task 2 で定義済み）
- Produces: `syllabus.yml` に `subject: 工` の項目が加わる

**版面の違い（実測値）**

工業簿記の区分表は、1ページに「2級/1級」の組を横に**2つ**並べる。実測のヘッダ位置は左組が桁7と26、右組が桁46と70。セグメント開始桁の分布は 0〜4 / 18〜26 / 40〜50 / 61〜66 の4帯。

したがって境界は **18 / 40 / 61** の3点、級は左から 2級・1級・2級・1級。右組は左組の続きであり、ページ内で左を読み切ってから右を読む。

- [ ] **Step 1: 工業簿記のページを左右に分けて読む関数を追加する**

`tools/parse-syllabus.py` の `main()` の直前に追加する。

```python
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
    entries = []
    for page in text.split('\f'):
        if not page.strip():
            continue
        left, right = [], []
        for line in page.split('\n'):
            if not line.strip():
                continue
            for col, seg in segments(line):
                if col < 40:
                    left.append((2 if col < 18 else 1, seg))
                else:
                    right.append((2 if col < 61 else 1, seg))
        for grade, seg in left + right:
            entries.extend(classify(seg, grade, '工'))
    return entries
```

- [ ] **Step 2: main() で工業簿記を読み込み、商業簿記に連結する**

`main()` を差し替える。

```python
def main():
    # 商業簿記：3級 / 2級 / 1級 の3帯。境界は実測の桁分布による。
    shogyo = parse('reference/shogyouboki_kubun.pdf',
                   [(24, 3), (48, 2), (999, 1)], '商')
    kogen = parse_kogen('reference/kogyoboki_kubun.pdf')
    sys.stdout.write(emit(shogyo + kogen))
```

- [ ] **Step 3: 再生成して検証する**

```bash
python3 tools/parse-syllabus.py > reference/syllabus.yml
grep -c 'subject: 商' reference/syllabus.yml
grep -c 'subject: 工' reference/syllabus.yml
for k in 標準原価 直接原価 部門別 総合原価 材料費 本社工場; do
  echo "== $k"
  grep -A5 "title: \"[^\"]*$k" reference/syllabus.yml | grep -E 'title:|grade:|subject:' | head -6
done
```

期待する結果:
- `subject: 商` が200件以上、`subject: 工` が80件以上
- 標準原価計算・直接原価計算・部門別計算・総合原価計算・材料費・本社工場会計が、いずれも `grade: 2` の項目として存在する

`学習カリキュラム.md` の W1〜W7 が挙げる工業簿記の論点（材料費・労務費・経費・製造間接費・部門別計算・個別原価計算・総合原価計算・標準原価計算・直接原価計算・CVP分析・本社工場会計）がすべて2級として引けることを確認する。**引けない論点があれば境界値を見直す。**

- [ ] **Step 4: コミットする**

`git add tools/parse-syllabus.py reference/syllabus.yml` のうえで、次のメッセージでコミットする。

```
feat: 工業簿記の出題区分表を構造化データに統合する

工業簿記の区分表は1ページに「2級/1級」の組を横に2つ並べる版面で、
商業簿記の3列とは構造が異なる。左右の組を分けて読み、右組を左組の
続きとして連結する。
```

---

### Task 4: 勘定科目表を accounts.yml に変換する

**Files:**
- Create: `tools/parse-accounts.py`
- Create: `reference/accounts.yml`

**Interfaces:**
- Consumes: `reference/kamokuhyo.pdf`（Task 1）
- Produces: `reference/accounts.yml`。各項目は `name` / `grade`（3 または 2）/ `category`（資産・負債・純資産・収益・費用）を持つ

**構造**

PDFは「資産」「負債」などの区分ごとに、3級のA欄・B欄、2級のA欄・B欄が横に並ぶ。A欄が標準科目、B欄が採点上許容される科目。

PDF本文に「２級には、３級の標準・許容勘定科目がすべて含まれます」とある。したがって**2級の教材で使える科目は、2級欄と3級欄の和集合**である。この規則を `accounts.yml` の先頭コメントに明記する。

- [ ] **Step 1: 列位置を実測する**

境界値を推測で決めない。まず測る。

```bash
pdftotext -layout reference/kamokuhyo.pdf - | python3 -c "
import sys, unicodedata, re
from collections import Counter
def w(s): return sum(2 if unicodedata.east_asian_width(c) in 'WF' else 1 for c in s)
c = Counter()
for l in sys.stdin.read().split('\n'):
    if not l.strip(): continue
    for m in re.finditer(r'(?:^|\s{3,})(\S)', l): c[w(l[:m.start(1)])] += 1
for col, n in sorted(c.items()):
    if n >= 3: print('col%3d n=%3d %s' % (col, n, '#' * min(n, 50)))
"
```

出力される桁分布から、3級A欄・3級B欄・2級A欄・2級B欄の4帯の境界を決める。ヘッダ行（`３   級` と `２       級`、`Ａ   欄` と `Ｂ   欄`）の位置も同じ方法で測り、突き合わせる。

- [ ] **Step 2: 変換スクリプトを書く**

`tools/parse-accounts.py` に次を書く。`BOUNDS` の `A3 / B3 / A2` は Step 1 の実測値で置き換える。

```python
"""商業簿記標準・許容勘定科目表PDFを accounts.yml に変換する。

A欄が標準科目、B欄が採点上許容される科目。PDF本文の記載により、
2級で使える科目は2級欄と3級欄の和集合である。
"""
import re
import subprocess
import sys
import unicodedata

SEGMENT = re.compile(r'(?:^|\s{3,})((?:\S|\s{1,2}(?=\S))+)')
CATEGORY = re.compile(r'^(資産|負債|純資産|収益|費用)$')
NOISE = re.compile(r'^(Ａ\s*欄|Ｂ\s*欄|[３２]\s*級|※|・|＜|この表)')

# Step 1 の実測値で置き換える
BOUNDS = [(A3, 3), (B3, 3), (A2, 2), (999, 2)]


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
            category = segs[0][1]
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
```

- [ ] **Step 3: 変換して検証する**

```bash
python3 tools/parse-accounts.py > reference/accounts.yml
grep -c '  - name:' reference/accounts.yml
for k in 現金 契約資産 売買目的有価証券 のれん 繰延税金資産; do
  echo "== $k"; grep -A2 "name: \"$k\"" reference/accounts.yml
done
```

期待する結果:
- 科目数が100件以上
- `現金` が `grade: 3`、`category: 資産`
- `契約資産` が `grade: 2`
- `売買目的有価証券` が `grade: 2`
- 3級の科目（現金・売掛金・買掛金など）と2級の科目（契約資産・のれんなど）が両方入っている

**製造業の科目（仕掛品・製品など）は含まれない。** 原本に「製造業での勘定科目を除く」とあるためで、これは欠落ではない。工業簿記のドリルではこの表を科目の根拠にできない。この制約は Task 7 の検査で扱う。

- [ ] **Step 4: コミットする**

`git add tools/parse-accounts.py reference/accounts.yml` のうえで、次のメッセージでコミットする。

```
feat: 標準・許容勘定科目表を構造化データに変換する

品質ゲートの「正解科目がプールに存在するか」は、プールの中身が
正しい前提でしか機能しない。実在しない科目名を正解にしていれば、
プールにも同じ誤りが入るだけで検出できない。

科目名そのものを原本と照合できるようにして、検査を一段引き上げる。
```

---

### Task 5: check.mjs の骨格とページ読み込みを作る

**Files:**
- Create: `package.json`
- Create: `tools/check.mjs`

**Interfaces:**
- Consumes: なし
- Produces:
  - `loadYaml(path) -> object` — 依存なしの最小YAMLリーダ
  - `report(file, id, expected, actual, message)` — 失敗を1件記録する
  - `withPage(browser, htmlPath, fn)` — Playwright でページを開き `fn(page, errors)` を呼ぶ
  - `CHECKS` — 検査関数の配列。各検査は `(page, file, errors)` を受ける
  - 終了コード：失敗0件なら0、1件以上なら1

- [ ] **Step 1: package.json を作る**

```bash
cat > package.json <<'EOF'
{
  "name": "boki2-materials",
  "private": true,
  "type": "module",
  "scripts": {
    "check": "node tools/check.mjs",
    "coverage": "node tools/coverage.mjs"
  }
}
EOF
```

`dependencies` を持たない。Playwright はローカルに既存のものを使う。

- [ ] **Step 2: Playwright の解決方法を確認する**

```bash
node -e "import('playwright').then(m => console.log('ok', typeof m.chromium)).catch(e => console.log('NG', e.code))"
```

`ok function` と出れば import できる。`NG ERR_MODULE_NOT_FOUND` の場合は、グローバルに入った Playwright の場所を探す。

```bash
ls -d ~/.local/share/mise/installs/node/*/lib/node_modules/playwright 2>/dev/null
find /opt/homebrew/lib/node_modules -maxdepth 1 -name 'playwright*' 2>/dev/null
```

見つかったパスを `NODE_PATH` で渡すか、`createRequire` で絶対パス指定する。**見つからない場合は `npx playwright` を使わない**（ネットワークからの取得が走るため）。その場合はユーザーに Playwright の場所を確認する。

- [ ] **Step 3: 骨格を書く**

`tools/check.mjs` に次を書く。

```javascript
// 教材HTMLの品質ゲート1〜7を検査する。
// HTMLの解析に正規表現を使わない。Playwright で file:// を開き、DOM と
// JS ランタイムから読む。mount() に渡された設定オブジェクトの中身には
// 正規表現では到達できないため。
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';

const failures = [];

export function report(file, id, expected, actual, message) {
  failures.push({ file, id, expected, actual, message });
}

// 依存を増やさないための最小YAMLリーダ。
// 対象は parse-syllabus.py / parse-accounts.py が出力する形だけであり、
// 2階層のリスト・オブジェクトと引用符つき文字列を読めれば足りる。
export function loadYaml(path) {
  const out = {};
  let listKey = null;
  let item = null;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    const top = raw.match(/^([A-Za-z_][\w]*):\s*$/);
    if (top) {
      listKey = top[1];
      out[listKey] = [];
      item = null;
      continue;
    }
    const start = raw.match(/^\s+-\s+(\w+):\s*(.*)$/);
    if (start && listKey) {
      item = {};
      out[listKey].push(item);
      item[start[1]] = unquote(start[2]);
      continue;
    }
    const cont = raw.match(/^\s+(\w+):\s*(.*)$/);
    if (cont && item) item[cont[1]] = unquote(cont[2]);
  }
  return out;
}

function unquote(v) {
  const s = v.trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return s;
}

// mount() に渡された設定を捕捉する。app.js は末尾で window に代入するため、
// setter を仕込んでおけば確実に掴める。
const CAPTURE = () => {
  window.__captured = { journal: [], quiz: [], num: [], fill: [] };
  const slots = { BokiJournal: 'journal', BokiQuiz: 'quiz',
                  BokiNum: 'num', BokiFill: 'fill' };
  for (const [name, slot] of Object.entries(slots)) {
    let real;
    Object.defineProperty(window, name, {
      configurable: true,
      get() { return real; },
      set(v) {
        const orig = v.mount.bind(v);
        v.mount = (sel, cfg) => {
          window.__captured[slot].push({ sel, cfg });
          return orig(sel, cfg);
        };
        real = v;
      },
    });
  }
};

export async function withPage(browser, htmlPath, fn) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(CAPTURE);
  await page.goto('file://' + resolve(htmlPath), { waitUntil: 'load' });
  try {
    return await fn(page, errors);
  } finally {
    await page.close();
  }
}

function targets(args) {
  if (args.length) return args;
  const found = [];
  for (const dir of readdirSync('.', { withFileTypes: true })) {
    if (!dir.isDirectory() || !/^phase\d+$/.test(dir.name)) continue;
    for (const f of readdirSync(dir.name)) {
      if (f.endsWith('.html')) found.push(join(dir.name, f));
    }
  }
  return found.sort();
}

export const CHECKS = [];

async function main() {
  const files = targets(process.argv.slice(2));
  if (!files.length) {
    console.error('検査対象のHTMLが見つからない');
    process.exit(1);
  }
  const browser = await chromium.launch();
  try {
    for (const file of files) {
      await withPage(browser, file, async (page, errors) => {
        for (const check of CHECKS) await check(page, file, errors);
      });
    }
  } finally {
    await browser.close();
  }

  if (!failures.length) {
    console.log('OK ' + files.length + ' ページ、指摘なし');
    process.exit(0);
  }
  for (const f of failures) {
    console.log(f.file + ':' + f.id + '  ' + f.message
      + '  期待=' + f.expected + '  実際=' + f.actual);
  }
  console.log('');
  console.log('NG ' + failures.length + ' 件');
  process.exit(1);
}

main();
```

- [ ] **Step 4: 検査0件の状態で走らせ、全ページを開けることを確認する**

```bash
npm run check
```

期待する結果: `OK 5 ページ、指摘なし`

この時点で `CHECKS` は空なので何も検査していないが、5ページすべてを Playwright で開けたことが確認できる。**ここで落ちるなら Playwright の解決に問題がある。** 検査を足す前に直す。

- [ ] **Step 5: 設定オブジェクトを捕捉できているか確認する**

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
const src = readFileSync('tools/check.mjs', 'utf8').replace(/^main\(\);\$/m, '');
const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
const { chromium } = await import('playwright');
const b = await chromium.launch();
await mod.withPage(b, 'phase0/01_3kyu-review.html', async (page) => {
  console.log(JSON.stringify(await page.evaluate(() => ({
    journal: window.__captured.journal.length,
    quiz: window.__captured.quiz.length,
    num: window.__captured.num.length,
    keys: Object.keys(window.__captured.journal[0]?.cfg || {}),
    q0: window.__captured.journal[0]?.cfg?.questions?.[0] || null,
  })), null, 1));
});
await b.close();
"
```

期待する結果: `journal` が1以上、`keys` に `questions` や `accounts` が並び、`q0` に設問1件の構造（`debit` / `credit` の配列とその要素の形）が見えること。

**ここが0件なら、以降のゲート1〜4がすべて空振りする。** 先に直す。`app.js` の末尾が `window.BokiJournal = BokiJournal;` であることを確認し、`addInitScript` が読み込み前に走っているかを見る。

**この出力で見えた `debit` / `credit` の要素の形（`{account, amount}` かどうか）を、Task 6 以降の実装に反映する。**

- [ ] **Step 6: YAMLリーダが読めることを確認する**

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
const src = readFileSync('tools/check.mjs', 'utf8').replace(/^main\(\);\$/m, '');
const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
const s = mod.loadYaml('reference/syllabus.yml');
const a = mod.loadYaml('reference/accounts.yml');
console.log('topics', s.topics.length, JSON.stringify(s.topics[0]));
console.log('accounts', a.accounts.length, JSON.stringify(a.accounts[0]));
"
```

期待する結果: `topics` が200件以上、`accounts` が100件以上で、各1件目に `id` / `grade` などが入っていること。

- [ ] **Step 7: コミットする**

`git add package.json tools/check.mjs` のうえで、次のメッセージでコミットする。

```
feat: 教材検証スクリプトの骨格を追加

HTMLの解析に正規表現を使わずPlaywrightでDOMを読む。mount()に渡された
設定オブジェクトの正解科目や金額には、正規表現では到達できないため。
設定はmount()の呼び出し後どこにも残らないので、windowへの代入をsetterで
捕捉して引数を記録する。

教材本体が外部依存を持たずオフラインで動くことを要件としている以上、
検証側だけがnpm依存を引き込むのは筋が通らない。YAMLは対象の形が
自分で生成したものに限られるため、最小のリーダを自前で持つ。
```

---

### Task 6: 品質ゲート1（貸借一致）を実装する

**Files:**
- Modify: `tools/check.mjs`

**Interfaces:**
- Consumes: `report()` / `CHECKS` / `window.__captured.journal`（Task 5）
- Produces: `CHECKS` に貸借一致の検査が1件加わる

- [ ] **Step 1: 静的な仕訳表の構造を確認する**

実装の前に、既存教材の `.jnl` が実際にどういう形かを見る。**構造を推測して書かない。**

```bash
node --input-type=module -e "
import { chromium } from 'playwright';
import { resolve } from 'node:path';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('file://' + resolve('phase0/01_3kyu-review.html'));
console.log(await p.evaluate(() => {
  const t = document.querySelector('table.jnl');
  return t ? t.outerHTML.slice(0, 900) : 'なし';
}));
await b.close();
"
```

借方セル `.d` / 貸方セル `.c` / 金額セル `.amt` の入れ子と、金額の表記（カンマ区切りか、単位付きか）を確認する。

- [ ] **Step 2: 貸借一致の検査を書く**

Step 1 と Task 5 Step 5 で確認した実際の構造に合わせて、`tools/check.mjs` の `export const CHECKS = [];` の直後に追加する。

```javascript
// ゲート1：静的な .jnl と BokiJournal の設問、両方の貸借を検算する。
CHECKS.push(async function checkBalance(page, file) {
  const data = await page.evaluate(() => {
    const num = (s) => Number(String(s).replace(/[^\d.-]/g, '')) || 0;
    const tables = [...document.querySelectorAll('table.jnl')].map((t, i) => {
      let debit = 0, credit = 0;
      for (const cell of t.querySelectorAll('td.d.amt, td.d .amt')) debit += num(cell.textContent);
      for (const cell of t.querySelectorAll('td.c.amt, td.c .amt')) credit += num(cell.textContent);
      return { id: t.id || ('jnl[' + i + ']'), debit, credit };
    });
    const drills = [];
    for (const { sel, cfg } of (window.__captured?.journal || [])) {
      (cfg.questions || []).forEach((q, i) => {
        const sum = (rows) => (rows || []).reduce((a, r) => a + (Number(r.amount) || 0), 0);
        drills.push({ id: sel + '#q' + (i + 1), debit: sum(q.debit), credit: sum(q.credit) });
      });
    }
    return { tables, drills };
  });

  for (const e of [...data.tables, ...data.drills]) {
    if (e.debit !== e.credit) {
      report(file, e.id, e.debit, e.credit, '貸借が一致しない');
    }
  }
});
```

- [ ] **Step 3: 走らせて、既存教材で結果を確認する**

```bash
npm run check phase0/01_3kyu-review.html
```

期待する結果: 25個の `.jnl` と仕訳ドリルの全設問について検査が走り、`OK` か、具体的な不一致箇所が出る。

**指摘が出た場合、それが本物の欠陥か検査の誤りかを必ず切り分ける。** 該当箇所のHTMLを開いて目視で確認し、教材が正しければ検査を直す。検査を通すために教材を書き換えない。

**すべての表で借方も貸方も 0 と出る場合は、セレクタが実際の構造と合っていない。** 検査が素通りしているだけなので、Step 1 に戻る。

- [ ] **Step 4: 検査が実際に働くことを確認する（意図的に壊す）**

検査が常に成功を返しているだけの可能性を潰す。

```bash
cp phase0/01_3kyu-review.html /tmp/broken1.html
python3 - <<'PY'
import io, re
p = '/tmp/broken1.html'
s = io.open(p, encoding='utf-8').read()
s = re.sub(r'(class="[^"]*amt[^"]*"[^>]*>)([\d,]+)', lambda m: m.group(1) + '999999', s, count=1)
io.open(p, 'w', encoding='utf-8').write(s)
PY
npm run check /tmp/broken1.html; echo "終了コード=$?"
rm /tmp/broken1.html
```

期待する結果: 貸借不一致が1件以上報告され、終了コードが1になる。**ここで OK が出るなら検査が働いていない。** 置換が効かない場合は、Step 1 で見た実際のセル記法に合わせて置換対象を変える。

- [ ] **Step 5: コミットする**

`git add tools/check.mjs` のうえで、次のメッセージでコミットする。

```
feat: 貸借一致の検査を追加

静的な仕訳表とドリル設問の両方を対象にする。貸借の不一致は表示上は
正常に見えるため、目視では見つからない。
```

---

### Task 7: 品質ゲート2（勘定科目）を実装する

**Files:**
- Modify: `tools/check.mjs`

**Interfaces:**
- Consumes: `loadYaml()` / `report()` / `CHECKS` / `window.__captured.journal`
- Produces: `CHECKS` に科目検査が1件加わる

この検査は2つを見る。プールに正解科目が入っているか（元のゲート2）と、その科目名が原本に実在するか（設計で足した拡張）。

- [ ] **Step 1: 検査を書く**

`tools/check.mjs` の CHECKS に追加する。

```javascript
// 正解科目が accounts プールに入っているか、その科目名が
// 標準・許容勘定科目表に実在するかを見る。
//
// 勘定科目表は製造業の科目を含まない（原本の記載による）。工業簿記の
// 単元では実在チェックを行わず、プール整合だけを見る。
const KNOWN_ACCOUNTS = new Set(
  loadYaml('reference/accounts.yml').accounts.map((a) => a.name));

CHECKS.push(async function checkAccounts(page, file) {
  const data = await page.evaluate(() => {
    const out = [];
    for (const { sel, cfg } of (window.__captured?.journal || [])) {
      (cfg.questions || []).forEach((q, i) => {
        const pool = q.accounts || cfg.accounts || [];
        const used = [...(q.debit || []), ...(q.credit || [])]
          .map((r) => r.account).filter(Boolean);
        out.push({ id: sel + '#q' + (i + 1), pool, used });
      });
    }
    const m = document.querySelector('meta[name="boki-subject"]');
    return { out, subject: m ? m.content : '商' };
  });

  for (const q of data.out) {
    const pool = new Set(q.pool);
    for (const name of q.used) {
      if (!pool.has(name)) {
        report(file, q.id, 'プールに含む', name,
          '正解科目が accounts プールにない（入力できず必ず不正解になる）');
      }
      if (data.subject === '商' && !KNOWN_ACCOUNTS.has(name)) {
        report(file, q.id, '勘定科目表に実在', name,
          '標準・許容勘定科目表にない科目名');
      }
    }
  }
});
```

- [ ] **Step 2: 走らせて結果を確認する**

```bash
npm run check phase0/01_3kyu-review.html
```

`boki-subject` メタは既存教材にないため、既定の `商` として扱われる。3級総復習の科目はすべて勘定科目表にあるはずなので、指摘が出るなら**科目名の表記ゆれか、勘定科目表の変換漏れ**である。どちらかを切り分ける。

```bash
grep -c '  - name:' reference/accounts.yml
```

変換漏れなら Task 4 の `BOUNDS` を見直す。教材側の表記ゆれなら教材を直す。

- [ ] **Step 3: 検査が働くことを確認する**

```bash
cp phase0/01_3kyu-review.html /tmp/broken2.html
python3 - <<'PY'
import io, re
p = '/tmp/broken2.html'
s = io.open(p, encoding='utf-8').read()
s2 = re.sub(r"account:\s*'[^']+'", "account: '存在しない科目'", s, count=1)
if s2 == s:
    s2 = re.sub(r'account:\s*"[^"]+"', 'account: "存在しない科目"', s, count=1)
if s2 == s:
    raise SystemExit('account: の記法が想定と違う。実際の記法を確認する')
io.open(p, 'w', encoding='utf-8').write(s2)
PY
npm run check /tmp/broken2.html; echo "終了コード=$?"
rm /tmp/broken2.html
```

期待する結果: プール不整合と実在チェックの両方で指摘が出る。

- [ ] **Step 4: コミットする**

`git add tools/check.mjs` のうえで、次のメッセージでコミットする。

```
feat: 勘定科目の検査を追加

正解科目がプールにないと、学習者は正解を入力できず必ず不正解になる。
加えて科目名そのものを原本と照合し、プールごと誤っている場合も
検出できるようにする。

勘定科目表は製造業の科目を含まないため、工業簿記の単元では実在チェックを
行わずプール整合のみを見る。
```

---

### Task 8: 品質ゲート3・4（数値の再計算、選択式の解答）を実装する

**Files:**
- Modify: `tools/check.mjs`
- Create: `tools/test-formula.mjs`

**Interfaces:**
- Consumes: `report()` / `CHECKS` / `window.__captured.num` / `window.__captured.quiz`
- Produces: `evalFormula(src) -> number` を export、`CHECKS` に2件の検査

- [ ] **Step 1: 式パーサを書く**

`eval` と `new Function` を使わない。四則演算と括弧のみを受け付ける再帰下降パーサを `tools/check.mjs` に追加する。

```javascript
// 計算式の評価。eval / new Function は使わない。
// 教材のJSは自前で書くものであり、任意コード実行を許す理由がない。
export function evalFormula(src) {
  const tokens = String(src).match(/\d+(?:\.\d+)?|[()+\-*/]/g);
  if (!tokens) throw new Error('式が空: ' + src);
  let i = 0;
  const peek = () => tokens[i];
  const eat = (t) => { if (tokens[i] !== t) throw new Error('想定外: ' + tokens[i]); i++; };

  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = tokens[i++];
      v = op === '+' ? v + term() : v - term();
    }
    return v;
  }
  function term() {
    let v = unary();
    while (peek() === '*' || peek() === '/') {
      const op = tokens[i++];
      const r = unary();
      if (op === '/' && r === 0) throw new Error('ゼロ除算: ' + src);
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function unary() {
    if (peek() === '-') { i++; return -unary(); }
    return atom();
  }
  function atom() {
    if (peek() === '(') { eat('('); const v = expr(); eat(')'); return v; }
    const t = tokens[i++];
    if (!/^\d/.test(t || '')) throw new Error('数値でない: ' + t);
    return Number(t);
  }

  const value = expr();
  if (i !== tokens.length) throw new Error('末尾に余り: ' + src);
  return value;
}
```

- [ ] **Step 2: パーサの単体テストを書く**

`tools/test-formula.mjs` に次を書く。

```javascript
// evalFormula の仕様：四則演算と括弧だけを評価し、それ以外は例外にする。
import { readFileSync } from 'node:fs';
const src = readFileSync('tools/check.mjs', 'utf8').replace(/^main\(\);$/m, '');
const { evalFormula } = await import(
  'data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

let ng = 0;
const ok = [
  ['1+2', 3], ['2*3', 6], ['(50000 - 5000) * 0.25 + 1250', 12500],
  ['10/4', 2.5], ['-5+8', 3], ['2*(3+4)', 14], ['100 - 20 - 30', 50],
];
for (const [expr, want] of ok) {
  const got = evalFormula(expr);
  if (Math.abs(got - want) > 1e-9) { console.log('NG', expr, got, '!=', want); ng++; }
}
for (const bad of ['1+', '(1', 'alert(1)', '1/0', '', 'x*2']) {
  try {
    evalFormula(bad);
    console.log('NG 例外が出ない:', JSON.stringify(bad));
    ng++;
  } catch { /* 期待どおり */ }
}
console.log(ng ? 'NG ' + ng + ' 件' : 'OK 全件');
process.exit(ng ? 1 : 0);
```

- [ ] **Step 3: テストを走らせる**

```bash
node tools/test-formula.mjs
```

期待する結果: `OK 全件`。特に `alert(1)` が例外になることを確認する。これが通ると任意コード実行を許すことになる。

- [ ] **Step 4: 実際の設定オブジェクトの形を確認する**

`BokiNum` の複数欄と `BokiQuiz` の解説プロパティ名を、`app.js` の実装で確認する。**推測したプロパティ名のまま進めない。**

```bash
grep -n 'BokiNum' -A 45 phase0/assets/app.js | grep -nE 'fields|answer|tolerance|q\.|f\.' | head -20
grep -n 'BokiQuiz' -A 45 phase0/assets/app.js | grep -nE 'choices|answer|explain|q\.' | head -20
```

- [ ] **Step 5: ゲート3・4の検査を書く**

Step 4 で確認したプロパティ名に合わせて `tools/check.mjs` に追加する。

```javascript
// ゲート3：BokiNum の解答を計算式から再計算する。
CHECKS.push(async function checkNum(page, file) {
  const items = await page.evaluate(() => {
    const out = [];
    for (const { sel, cfg } of (window.__captured?.num || [])) {
      (cfg.questions || []).forEach((q, i) => {
        const fields = q.fields || [q];
        fields.forEach((f, j) => {
          out.push({
            id: sel + '#q' + (i + 1) + (fields.length > 1 ? '.' + (j + 1) : ''),
            answer: f.answer, formula: f.formula, tol: f.tolerance || 0,
          });
        });
      });
    }
    return out;
  });

  for (const it of items) {
    if (it.formula === undefined) {
      report(file, it.id, 'formula あり', 'なし',
        'BokiNum の設問に計算式がない（再計算できない）');
      continue;
    }
    let got;
    try {
      got = evalFormula(it.formula);
    } catch (e) {
      report(file, it.id, '評価できる式', it.formula, '式を評価できない: ' + e.message);
      continue;
    }
    if (Math.abs(got - Number(it.answer)) > (Number(it.tol) || 1e-9)) {
      report(file, it.id, got, it.answer, '計算式の値と answer が一致しない');
    }
  }
});

// ゲート4：BokiQuiz の answer が範囲内で、解説の言及と整合するか。
CHECKS.push(async function checkQuiz(page, file) {
  const items = await page.evaluate(() => {
    const out = [];
    for (const { sel, cfg } of (window.__captured?.quiz || [])) {
      (cfg.questions || []).forEach((q, i) => {
        out.push({
          id: sel + '#q' + (i + 1),
          answer: q.answer,
          count: (q.choices || []).length,
          explain: String(q.explain || q.explanation || ''),
        });
      });
    }
    return out;
  });

  for (const it of items) {
    if (!Number.isInteger(it.answer) || it.answer < 0 || it.answer >= it.count) {
      report(file, it.id, '0以上' + it.count + '未満の整数', it.answer,
        'answer が選択肢の範囲外');
      continue;
    }
    // 解説が「選択肢N」と番号で言及していれば answer と突き合わせる。
    // .choice はCSSカウンタで1始まりに採番されるため answer+1 と比較する。
    const m = it.explain.match(/選択肢\s*([０-９0-9]+)/);
    if (m) {
      const n = Number(m[1].replace(/[０-９]/g, (c) =>
        String.fromCharCode(c.charCodeAt(0) - 0xFEE0)));
      if (n !== it.answer + 1) {
        report(file, it.id, '選択肢' + (it.answer + 1), '選択肢' + n,
          '解説が指す選択肢と answer が食い違う');
      }
    }
  }
});
```

- [ ] **Step 6: 走らせる**

```bash
npm run check
```

既存の `BokiNum` 12問には `formula` がないため、**12件前後の指摘が出るのが正しい。** これは Task 9 で埋める。この時点では指摘が出ることを確認するに留める。

`BokiQuiz` の指摘が出た場合は、Task 9 を待たずにその場で切り分ける。

- [ ] **Step 7: コミットする**

`git add tools/check.mjs tools/test-formula.mjs` のうえで、次のメッセージでコミットする。

```
feat: 数値ドリルの再計算と選択式の解答検査を追加

数値ドリルは答えの数値だけでは検算できないため、設問に計算式を持たせて
再計算する。式の評価にevalとnew Functionを使わない。教材のJSは自前で
書くものであり、任意コード実行を許す理由がない。四則演算と括弧のみを
受け付ける再帰下降パーサを置く。

選択式は、解説が「選択肢N」と番号で言及している場合にanswerと突き合わせる。
節の追加に伴う番号の振り直し漏れは、この食い違いとして現れる。
```

---

### Task 9: 既存 Phase 0 の数値ドリルに計算式を付与する

**Files:**
- Modify: `phase0/01_3kyu-review.html`
- Modify: `phase0/02_kanjo-renrakuzu.html`
- Modify: `phase0/03_dentaku.html`

**Interfaces:**
- Consumes: Task 8 のゲート3
- Produces: 全 `BokiNum` 設問が `formula` を持つ状態

- [ ] **Step 1: formula が欠けている設問を一覧する**

```bash
npm run check 2>&1 | grep '計算式がない'
```

- [ ] **Step 2: 設問ごとに計算式を書く**

各設問の本文と `answer` を読み、**答えから逆算するのではなく、本文が示す計算過程を式にする。**

```bash
grep -n 'BokiNum.mount' -A 60 phase0/03_dentaku.html | head -80
```

本文が「取得原価50,000円、残存価額5,000円、償却率25%、月割1,250円」と示し `answer: 12500` なら、`formula: '(50000 - 5000) * 0.25 + 1250'` と書く。

**式の値が answer と合わない場合、どちらが誤りかを判断する。** 本文から導いた式が正しければ `answer` のほうが誤りであり、答えを直す。何を直したかを記録し、コミットメッセージに残す。

- [ ] **Step 3: 検証する**

```bash
npm run check
```

期待する結果: `計算式がない` の指摘が0件になる。式と answer の不一致が出た場合は Step 2 に戻る。

- [ ] **Step 4: コミットする**

`git add phase0/` のうえで、次のメッセージでコミットする。答えを直した設問があれば、その旨を本文に追記する。

```
feat: 数値ドリルの設問に計算過程を持たせる

答えの数値だけでは、それが正しいかを機械的に検算できない。
導出過程を式として持たせ、以降は再計算で確認できるようにする。
```

---

### Task 10: 品質ゲート5・6・7（見出し整合、ランタイム、メタ）を実装する

**Files:**
- Modify: `tools/check.mjs`

**Interfaces:**
- Consumes: `loadYaml()` / `report()` / `CHECKS`、`withPage` が渡す `errors`
- Produces: `CHECKS` に3件の検査

- [ ] **Step 1: 3つの検査を書く**

`tools/check.mjs` に追加する。

```javascript
// ゲート5：.toc のアンカーと見出しidの対応。
CHECKS.push(async function checkToc(page, file) {
  const data = await page.evaluate(() => ({
    anchors: [...document.querySelectorAll('.toc a[href^="#"]')]
      .map((a) => a.getAttribute('href').slice(1)),
    ids: [...document.querySelectorAll('h2[id]')].map((h) => h.id),
  }));

  const ids = new Set(data.ids);
  for (const a of data.anchors) {
    if (!ids.has(a)) report(file, '#' + a, '対応する h2[id]', 'なし', '目次のリンク先がない');
  }
  const linked = new Set(data.anchors);
  for (const id of data.ids) {
    if (!linked.has(id)) report(file, '#' + id, '目次に載る', '載っていない', '見出しが目次にない');
  }
});

// ゲート6：JSエラー、id重複、data-key重複、リンク切れ、外部参照、
// 420px幅の横スクロール。
CHECKS.push(async function checkRuntime(page, file, errors) {
  for (const e of errors) report(file, '(runtime)', 'エラーなし', e, 'JSエラー');

  const found = await page.evaluate(() => {
    const dups = (list) => {
      const seen = {}, out = [];
      for (const v of list) {
        if (!v) continue;
        seen[v] = (seen[v] || 0) + 1;
        if (seen[v] === 2) out.push(v);
      }
      return out;
    };
    return {
      ids: dups([...document.querySelectorAll('[id]')].map((e) => e.id)),
      keys: dups([...document.querySelectorAll('[data-key]')].map((e) => e.dataset.key)),
      rel: [...document.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href'))
        .filter((h) => h && !h.startsWith('#') && !/^[a-z]+:/.test(h)),
      deadAnchors: [...document.querySelectorAll('a[href^="#"]')]
        .map((a) => a.getAttribute('href').slice(1))
        .filter((h) => h && !document.getElementById(h)),
      external: [...document.querySelectorAll('[src], link[href]')]
        .map((e) => e.getAttribute('src') || e.getAttribute('href'))
        .filter((u) => u && /^https?:/.test(u)),
    };
  });

  for (const id of found.ids) report(file, id, '一意', '重複', 'id が重複');
  for (const k of found.keys) {
    report(file, k, '一意', '重複', 'data-key が重複（進捗が混線する）');
  }
  for (const a of found.deadAnchors) {
    report(file, '#' + a, '存在する', 'なし', 'ページ内リンクの飛び先がない');
  }
  for (const u of found.external) {
    report(file, u, '外部参照なし', u, '外部URLを参照している（オフラインで壊れる）');
  }

  const { existsSync } = await import('node:fs');
  const { dirname, resolve: res } = await import('node:path');
  for (const href of found.rel) {
    const target = res(dirname(file), decodeURIComponent(href.split('#')[0]));
    if (!existsSync(target)) report(file, href, '存在する', 'なし', 'リンク切れ');
  }

  // 420px 幅での横スクロール。.grid2 内の表が典型的な原因。
  await page.setViewportSize({ width: 420, height: 900 });
  const over = await page.evaluate(() => {
    const d = document.documentElement;
    if (d.scrollWidth <= d.clientWidth) return null;
    const wide = [...document.querySelectorAll('*')]
      .filter((e) => e.getBoundingClientRect().right > d.clientWidth + 1)
      .slice(0, 3)
      .map((e) => e.tagName.toLowerCase()
        + (e.className ? '.' + String(e.className).split(' ')[0] : ''));
    return { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth, wide };
  });
  if (over) {
    report(file, over.wide.join(',') || '(要素不明)', over.clientWidth, over.scrollWidth,
      '420px幅で横スクロールが出る');
  }
  await page.setViewportSize({ width: 1280, height: 900 });
});

// ゲート7：boki-topics メタが存在し、IDが syllabus.yml に実在するか。
const TOPIC_IDS = new Set(loadYaml('reference/syllabus.yml').topics.map((t) => t.id));

CHECKS.push(async function checkTopicsMeta(page, file) {
  // index.html は目次であり論点を扱わない
  if (/(^|\/)index\.html$/.test(file)) return;

  const meta = await page.evaluate(() => {
    const m = document.querySelector('meta[name="boki-topics"]');
    return m ? m.content : null;
  });
  if (meta === null) {
    report(file, '(head)', 'boki-topics あり', 'なし',
      'カバー論点のメタがない（カバレッジ検証で未カバー扱いになる）');
    return;
  }
  for (const id of meta.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!TOPIC_IDS.has(id)) {
      report(file, id, 'syllabus.yml に実在', 'なし', '存在しない論点ID');
    }
  }
});
```

- [ ] **Step 2: 走らせて、既存教材の結果を確認する**

```bash
npm run check
```

`boki-topics` は既存教材にないため、index.html を除く4ページで指摘が出るのが正しい。これは Task 11 で埋める。

**横スクロール・リンク切れ・外部参照の指摘が出た場合は、本物の欠陥である可能性が高い。** `教材制作ルール.md` が 420px での確認と外部参照の禁止を明記しているのは、実際に踏みうるためと読める。出た場合は該当箇所を確認し、教材側を直す。

- [ ] **Step 3: 検査が働くことを確認する**

```bash
cp phase0/01_3kyu-review.html /tmp/broken3.html
python3 - <<'PY'
import io
p = '/tmp/broken3.html'
s = io.open(p, encoding='utf-8').read()
s = s.replace('</body>',
  '<a href="#存在しないアンカー">壊れたリンク</a>'
  '<div id="dup"></div><div id="dup"></div>'
  '<img src="https://example.com/a.png">'
  '</body>', 1)
io.open(p, 'w', encoding='utf-8').write(s)
PY
npm run check /tmp/broken3.html; echo "終了コード=$?"
rm /tmp/broken3.html
```

期待する結果: id重複・アンカー切れ・外部参照の3種すべてが報告される。

- [ ] **Step 4: コミットする**

`git add tools/check.mjs` のうえで、次のメッセージでコミットする。

```
feat: 見出し整合・ランタイム・カバー論点メタの検査を追加

data-keyの重複は、別々のチェック項目が同じlocalStorageキーを共有して
進捗が混線する。表示は正常なので目視では見つからない。

420px幅の横スクロールは実際のビューポートを縮めて確認し、はみ出している
要素まで報告する。原因の特定に時間がかかるため。

外部URLの参照を検出する。オフラインで開けることが教材の要件であり、
参照が混入しても手元では気づけない。
```

---

### Task 11: coverage.mjs と既存教材へのメタ付与

**Files:**
- Create: `tools/coverage.mjs`
- Modify: `phase0/01_3kyu-review.html`
- Modify: `phase0/02_kanjo-renrakuzu.html`
- Modify: `phase0/03_dentaku.html`
- Modify: `phase0/04_junbi.html`

**Interfaces:**
- Consumes: `reference/syllabus.yml`、各HTMLの `meta[name="boki-topics"]`
- Produces: `npm run coverage` が未カバー論点を一覧する

- [ ] **Step 1: coverage.mjs を書く**

`tools/coverage.mjs` に次を書く。

```javascript
// 出題区分表の2級論点と、教材がカバーする論点の差分を出す。
// meta の読み取りに正規表現を使わず、Playwright で DOM から読む。
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

function loadYaml(path) {
  const out = {};
  let listKey = null, item = null;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    const top = raw.match(/^([A-Za-z_][\w]*):\s*$/);
    if (top) { listKey = top[1]; out[listKey] = []; item = null; continue; }
    const start = raw.match(/^\s+-\s+(\w+):\s*(.*)$/);
    if (start && listKey) {
      item = {};
      out[listKey].push(item);
      item[start[1]] = unquote(start[2]);
      continue;
    }
    const cont = raw.match(/^\s+(\w+):\s*(.*)$/);
    if (cont && item) item[cont[1]] = unquote(cont[2]);
  }
  return out;
}
function unquote(v) {
  const s = v.trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/\\"/g, '"');
  return s;
}

const topics = loadYaml('reference/syllabus.yml').topics;
// 2級の教材が扱うべき論点。3級は前提知識であり Phase 0 の総復習で扱う。
const required = topics.filter((t) => t.grade === 2);

const files = [];
for (const d of readdirSync('.', { withFileTypes: true })) {
  if (!d.isDirectory() || !/^phase\d+$/.test(d.name)) continue;
  for (const f of readdirSync(d.name)) {
    if (f.endsWith('.html') && f !== 'index.html') files.push(join(d.name, f));
  }
}

const browser = await chromium.launch();
const covered = new Map();
for (const file of files.sort()) {
  const page = await browser.newPage();
  await page.goto('file://' + resolve(file), { waitUntil: 'load' });
  const meta = await page.evaluate(() => {
    const m = document.querySelector('meta[name="boki-topics"]');
    return m ? m.content : '';
  });
  await page.close();
  for (const id of meta.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!covered.has(id)) covered.set(id, []);
    covered.get(id).push(file);
  }
}
await browser.close();

const missing = required.filter((t) => !covered.has(t.id));
console.log('2級の論点 ' + required.length + ' 件中、カバー済み '
  + (required.length - missing.length) + ' 件');

if (missing.length) {
  console.log('');
  console.log('未カバー:');
  let section = '';
  for (const t of missing) {
    if (t.section !== section) {
      section = t.section;
      console.log('');
      console.log('  [' + section + ']');
    }
    console.log('    ' + t.id + '  ' + t.title + (t.advanced ? '  ※' : ''));
  }
}

const ids = new Set(topics.map((t) => t.id));
const unknown = [...covered.keys()].filter((id) => !ids.has(id));
if (unknown.length) {
  console.log('');
  console.log('区分表にないIDを指している教材:');
  for (const id of unknown) console.log('    ' + id + '  ' + covered.get(id).join(', '));
}
```

- [ ] **Step 2: 走らせて、全論点が未カバーと出ることを確認する**

```bash
npm run coverage
```

期待する結果: 2級の論点数（100件以上）が表示され、メタがないので全件が未カバーと出る。

- [ ] **Step 3: Phase 0 の各単元が扱う論点IDを調べる**

Phase 0 は3級の総復習と工業簿記の導入であり、**2級論点をほとんど扱わない。** 該当するIDだけを正直に書く。カバレッジを高く見せるために無関係なIDを書かない。

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
const y = readFileSync('reference/syllabus.yml', 'utf8');
const blocks = y.split('  - id: ').slice(1);
for (const b of blocks) {
  const id = (b.match(/^\"([^\"]+)\"/) || [])[1];
  const title = (b.match(/title: \"([^\"]+)\"/) || [])[1] || '';
  const section = (b.match(/section: \"([^\"]*)\"/) || [])[1] || '';
  const grade = (b.match(/grade: (\d)/) || [])[1];
  if (grade === '2' && /工業簿記|原価の意義|原価の要素|材料費|労務費|経費/.test(title + section)) {
    console.log(id, '|', section, '|', title);
  }
}
" | head -30
```

`phase0/02_kanjo-renrakuzu.html` は工業簿記の全体像を扱うため、`第一 工業簿記の本質` や `第二 原価` の2級項目が該当する可能性が高い。単元の本文を読み、**実際に説明している論点だけ**を選ぶ。

- [ ] **Step 4: 各HTMLにメタを追加する**

Step 3 の調査結果を `mapping` に反映してから実行する。

```bash
python3 - <<'PY'
import io
# Step 3 の調査結果を反映する。該当しない単元は空文字列のままでよい。
mapping = {
  'phase0/01_3kyu-review.html': '',
  'phase0/02_kanjo-renrakuzu.html': '',
  'phase0/03_dentaku.html': '',
  'phase0/04_junbi.html': '',
}
marker = '<meta name="viewport" content="width=device-width, initial-scale=1">'
for path, topics in mapping.items():
    s = io.open(path, encoding='utf-8').read()
    if 'boki-topics' in s:
        print('skip', path)
        continue
    if marker not in s:
        raise SystemExit('viewport メタが見つからない: ' + path)
    tag = '<meta name="boki-topics" content="%s">' % topics
    s = s.replace(marker, marker + '\n  ' + tag, 1)
    io.open(path, 'w', encoding='utf-8').write(s)
    print('added', path)
PY
```

**2級論点を扱わない単元の `content` は空になる。** それが実態であり、空のまま書く。ゲート7は「メタの存在」と「書かれたIDの実在」を見るので、空文字列は通る。

- [ ] **Step 5: 検証する**

```bash
npm run check
npm run coverage
```

期待する結果: check でメタ関連の指摘が0件、coverage が「区分表にないIDを指している教材」を報告しないこと。

- [ ] **Step 6: コミットする**

`git add tools/coverage.mjs phase0/` のうえで、次のメッセージでコミットする。

```
feat: カバレッジ検証と、単元がカバーする論点のメタを追加

11週間で全論点を1回以上通せているかは、進捗管理そのものである。
対応表を別ファイルに置くと教材と二重管理になりずれるため、単元HTMLに
メタとして持たせる。教材を移動・分割しても対応がついてくる。

Phase 0 は3級の総復習と工業簿記の導入であり、2級論点をほとんど扱わない。
カバレッジを高く見せるために無関係なIDを書かない。
```

---

### Task 12: CLAUDE.md と settings.json を書く

**Files:**
- Create: `CLAUDE.md`
- Create: `.claude/settings.json`

**Interfaces:**
- Consumes: Task 1〜11 で作った検証コマンドと一次情報のパス
- Produces: なし（設定）

- [ ] **Step 1: CLAUDE.md を書く**

3文書の内容を複製しない。ユーザーのグローバルCLAUDE.mdにある原則も再掲しない。次の内容を `CLAUDE.md` に書く。

```markdown
# 日商簿記2級 教材プロジェクト

日商簿記2級の合格教材を作る。学習者は3級合格済み・会計が専門ではない社会人。

## 締切と適用範囲

本命は **2026年11月15日 第174回 統一試験**。

適用される出題区分表は **2022年度版**（2021年12月10日最終改定・2022年4月1日施行）。
2027年4月1日から改定版が施行されるが、**2027年3月31日までの試験には適用されない。**
改定版を根拠にすると、紙の手形の廃止や新リース会計基準など、出題されない論点を
教材に含めることになる。

## 一次情報

級の境界と勘定科目は、記憶やテキストの目次ではなく次のファイルを根拠にする。

| 知りたいこと | 見る場所 |
|---|---|
| 論点が2級か3級か | `reference/syllabus.yml` |
| 使ってよい勘定科目 | `reference/accounts.yml`（2級は grade 2 と 3 の和集合） |
| 原本と出典 | `reference/SOURCES.md`、`reference/*.pdf` |

YAMLは原本のPDFから生成したもので、**手で編集しない。**
直すときは `tools/parse-syllabus.py` / `tools/parse-accounts.py` を直して再生成する。

勘定科目表は製造業の科目を含まない。工業簿記の科目はこの表で照合できない。

## 教材を作るとき

`教材制作ルール.md` を読む。出力形式・執筆方針・共通アセットのAPI・品質ゲートの
定義がすべてそこにある。週次の論点配分は `学習カリキュラム.md`。

## 公開前に必ず通す

```
npm run check       # 品質ゲート1〜7（機械的検査）
npm run coverage    # 論点カバレッジ
```

`npm run check` が落ちている状態で「完了した」と報告しない。

判断が要る検査はサブエージェントに投げる。

| エージェント | 役割 |
|---|---|
| `boki-author` | 単元HTMLの初稿 |
| `boki-drill` | ドリル問題の量産 |
| `boki-reviewer` | 敵対的検証（品質ゲート8） |
| `boki-coverage` | カバレッジ検証（品質ゲート7） |

`boki-reviewer` には執筆時の意図や修正履歴を渡さない。作成時の文脈から
切り離すことが敵対的検証の前提である。

## 間違えやすい級の境界

`教材制作ルール.md` に全項目がある。特に高くつくものだけ再掲する。

- **建設仮勘定は2級。** 3級ではない
- **伝票会計（3伝票制・仕訳日計表）は3級。** 2級テキストに載らないが出題対象
- **消費税（税抜方式）・法人税等・貯蔵品・剰余金の配当と利益準備金の積立は3級。**
  2級テキストに載らないうえ、第3問（決算）・第2問（株主資本等変動計算書）で必修
- **有形固定資産の除却・廃棄、定率法は2級。** 3級へ移るのは2027年度改定から
- **売上諸掛りの「先方負担＝立替金／売掛金」処理は削除済み。**
  現行は送料込みで売上を計上し、支払った送料は発送費とする
```

- [ ] **Step 2: settings.json を書く**

検証コマンドの実行で承認待ちが挟まると、サブエージェントが検証を自走できない。

```bash
mkdir -p .claude
cat > .claude/settings.json <<'EOF'
{
  "permissions": {
    "allow": [
      "Bash(npm run check)",
      "Bash(npm run check:*)",
      "Bash(npm run coverage)",
      "Bash(node tools/check.mjs:*)",
      "Bash(node tools/coverage.mjs:*)",
      "Bash(node tools/test-formula.mjs)",
      "Bash(python3 tools/parse-syllabus.py)",
      "Bash(python3 tools/parse-accounts.py)",
      "Bash(pdftotext:*)"
    ]
  }
}
EOF
```

教材ファイルの書き換えを伴う操作は既定のままにする。

- [ ] **Step 3: 確認する**

```bash
node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json', 'utf8')); console.log('settings.json OK')"
wc -l CLAUDE.md
```

`CLAUDE.md` が70行前後に収まっていること。大きく超えるなら3文書に押し出せる内容が混ざっている。

- [ ] **Step 4: コミットする**

`git add CLAUDE.md .claude/settings.json` のうえで、次のメッセージでコミットする。

```
feat: プロジェクトのClaude設定と作業規約を追加

CLAUDE.mdは毎セッション必ずコンテキストに載るため、既存3文書の内容を
複製せず参照に留める。同じ内容を2箇所に置くと必ずずれる。

適用される区分表が2022年度版であることを明記する。公式サイトには
2027年度版も並んで掲載されており、取り違えると出題されない論点を
教材に含めることになる。

検証コマンドの実行を許可する。サブエージェントが検証を自走する設計であり、
そこで承認待ちが挟まると運用が止まる。
```

---

### Task 13: サブエージェント4体を定義する

**Files:**
- Create: `.claude/agents/boki-author.md`
- Create: `.claude/agents/boki-drill.md`
- Create: `.claude/agents/boki-reviewer.md`
- Create: `.claude/agents/boki-coverage.md`

**Interfaces:**
- Consumes: `npm run check` / `npm run coverage`、`reference/*.yml`、`教材制作ルール.md`
- Produces: なし（設定）

- [ ] **Step 1: boki-author を書く**

`.claude/agents/boki-author.md` に次を書く。

```markdown
---
name: boki-author
description: 日商簿記2級の単元HTMLの初稿を書く。フェーズ・単元番号・扱う論点・想定学習時間を与えて呼ぶ。
tools: Read, Write, Edit, Bash, Grep, Glob
model: opus
---

単元HTMLを1枚書く。

## 書き始める前に必ず読む

1. `教材制作ルール.md` — 出力形式・執筆方針・共通アセットのAPI。全項目に従う
2. `学習カリキュラム.md` — その単元が計画上どこに位置し、何時間を想定しているか
3. `phase0/01_3kyu-review.html` — 完成形の実例。構成と密度の基準にする
4. `reference/syllabus.yml` — 扱う論点の級。2級でない論点を入れない
5. `reference/accounts.yml` — 使ってよい勘定科目。2級は grade 2 と 3 の和集合

## 守ること

- 共通アセット（`assets/style.css` / `assets/app.js`）のクラスとAPIだけを使う。
  新しいCSSやJSを足さない。必要になったら足さずに報告する
- 外部CDN・外部フォント・画像URLを参照しない。`file://` で開いて動くこと
- `<meta name="boki-topics" content="...">` に、その単元がカバーする
  `syllabus.yml` の論点IDを書く。**カバレッジを高く見せるために、扱っていない
  論点のIDを書かない**
- 用語を出す前に「何が困るからこの仕組みがあるのか」を書く。身近な例えを先に置く
- ドリルで問う判断は、必ず本文に根拠がある状態にする
- つまずきやすい所は `.callout--trap` で先回りして警告する
- 絵文字を使わない
- 制作過程や検討の経緯を書かない。最終的な説明だけを提示する

## 書き終えたら

`npm run check <書いたファイル>` を実行し、**指摘が0件になるまで直してから報告する。**
落ちたまま報告しない。

直せない指摘があれば、何が起きているかを報告する。
検査を通すために教材の内容を曲げない。
```

- [ ] **Step 2: boki-drill を書く**

`.claude/agents/boki-drill.md` に次を書く。

```markdown
---
name: boki-drill
description: 日商簿記2級のドリル問題を作る。論点・形式（仕訳/選択/数値/穴埋め）・問題数・難易度を与えて呼ぶ。
tools: Read, Write, Bash, Grep
model: opus
---

ドリル問題を作り、`Boki*.mount()` にそのまま渡せる設定オブジェクトとして出力する。

## 作り始める前に必ず読む

1. `教材制作ルール.md` の「共通アセットが提供するもの」— 各APIの設定の形
2. `reference/accounts.yml` — 使ってよい勘定科目
3. `reference/syllabus.yml` — 出題論点の級
4. `phase0/01_3kyu-review.html` の `BokiJournal.mount` — 実例

## 守ること

- **仕訳は貸借一致を自分で検算してから出す。** 出したあとで機械に見つけてもらわない
- 正解に使う勘定科目は、必ず `accounts` プールに入れる。
  プールにない科目が正解だと、学習者は正解を入力できず必ず不正解になる
- 商業簿記の科目は `accounts.yml` に実在するものだけを使う。
  工業簿記の科目（仕掛品・製品など）は勘定科目表に含まれないため、この照合の対象外
- **`BokiNum` の設問には `formula` を必ず付ける。** 答えの数値だけでは検算できない。
  四則演算と括弧だけで書く（例: `formula: '(50000 - 5000) * 0.25 + 1250'`）
- `BokiQuiz` の解説で選択肢を番号で参照するときは、`.choice` が1始まりで
  自動採番されることに注意する。`answer` は0始まりのインデックス
- 仕訳ドリルの解答欄は常に4行。行数から正解の科目数が読めると本番と条件が変わる
- **本文に根拠のない判断を問わない。** その論点が単元本文で説明されているかを
  確認し、説明がないなら問題にせず報告する

## 難易度

本番の第1問は仕訳5問で20点。1問4点は大きい。奇をてらった出題より、
頻出論点を確実に処理できるかを問う。
```

- [ ] **Step 3: boki-reviewer を書く**

`.claude/agents/boki-reviewer.md` に次を書く。

```markdown
---
name: boki-reviewer
description: 完成した単元HTMLを敵対的に検証する。品質ゲート8。対象ファイルのパスだけを与えて呼ぶ。
tools: Read, Grep, Glob, Bash, Edit
model: opus
---

**この教材には誤りがある。それを見つけるのがあなたの仕事である。**

「よく書けている」で終わる報告は失敗である。健全な成果物にも指摘は出る。

## 前提

執筆時の意図も、どこを直したかも渡されない。それが正しい。
「そう書いた理由」を知ると検証が甘くなる。**書かれているものだけを見る。**

## 根拠にするもの

- `reference/syllabus.yml` — 論点の級。記憶で判断しない
- `reference/accounts.yml` — 勘定科目の実在
- `教材制作ルール.md` の「級の境界に関する注意」
- 同じフェーズの他の単元 — ページ間の矛盾を見るため

## 見るもの

1. **会計処理の誤り** — 仕訳の科目、金額の導出、決算整理の順序
2. **級の境界違反** — 2級で出ない論点を載せていないか。載せるべき論点が抜けていないか
3. **ページ間の矛盾** — 同じ論点を別の単元と違う説明で書いていないか
4. **本文に根拠のないドリル設問** — 本文で説明していないルールを演習で問っていないか
5. **説明の欠落** — 「なぜそうなるのか」が言語化されているか。結論だけ書いていないか

## 直してよいもの

判定が一意に決まるものだけ。直したら**何をどう直したかを必ず列挙する。**

- 貸借不一致。ただし正しい金額が本文の記述から一意に決まる場合のみ
- `BokiJournal` の正解科目がプールにない場合の、プールへの追加
- `BokiQuiz` の `answer` と解説の食い違い。解説が指す選択肢が一意なとき
- `.toc` のアンカーと `<h2 id>` の不一致、`<span class="num">` の番号飛び
- `accounts.yml` にない表記ゆれの、許容表記への修正

## 直さないもの（報告だけする）

- 会計処理そのものの誤り
- **級の境界の誤り** — 修正の実体は論点の追加・削除であり、単元の設計変更にあたる
- 本文に根拠のないドリル設問 — 本文を足すか設問を削るかは執筆判断
- ページ間の矛盾
- 説明の不足・分かりにくさ

## 報告の形式

指摘ごとに次を書く。改善提案ではなく**判定と根拠**を出す。

```
[判定: 誤り / 疑わしい / 問題なし]
場所: ファイル:該当id または見出し
内容: 何が誤っているか
根拠: syllabus.yml の該当項目、または会計処理上の理由
```

採否は人間が決める。断定できないものを断定しない。
```

- [ ] **Step 4: boki-coverage を書く**

`.claude/agents/boki-coverage.md` に次を書く。

```markdown
---
name: boki-coverage
description: 教材の論点カバレッジを検証する。品質ゲート7。フェーズまたは単元のパスを与えて呼ぶ。
tools: Read, Grep, Glob, Bash
model: sonnet
---

出題区分表と教材を突き合わせ、抜けている論点を見つける。

## 手順

1. まず機械的な差分を取る。`npm run coverage` を実行する

2. その出力を起点に、機械では出せない判断を加える

- **メタには書いてあるが、本文の扱いが薄すぎる論点はないか。**
  IDを書けばカバー済みと数えられるが、1行触れただけでは学習者は解けない
- **到達チェックの「N項目を列挙できる」のNは必要十分か。**
  区分表の該当項目数と突き合わせる
- **未カバーの論点は、本当にその単元の担当か。**
  `学習カリキュラム.md` の週次配分を見て、別の週に割り当てられているなら
  それは抜けではない

## 報告の形式

```
未カバー（この単元が扱うべきもの）:
  論点ID  タイトル  — なぜ必要か

扱いが薄い:
  論点ID  タイトル  — 現状どう触れているか、何が足りないか

別の週の担当（抜けではない）:
  論点ID  タイトル  — 学習カリキュラム.md のどこ
```

修正はしない。何を足すかは執筆側の判断である。
```

- [ ] **Step 5: 定義が読めることを確認する**

```bash
ls -la .claude/agents/
for f in .claude/agents/*.md; do
  echo "== $f"; sed -n '1,7p' "$f"
done
```

各ファイルの先頭に `---` で囲まれた frontmatter があり、`name` / `description` / `tools` / `model` が入っていること。

`boki-reviewer` に `Write` が入っていないこと、`boki-coverage` に `Write` と `Edit` が入っていないことを確認する。**指摘者が自由に書き換えられると、指摘の妥当性の検討が飛ばされる。**

- [ ] **Step 6: コミットする**

`git add .claude/agents/` のうえで、次のメッセージでコミットする。

```
feat: 教材制作と検証のサブエージェント4体を追加

敵対的検証には執筆時の意図を渡さず、権限も限定する。判定が一意に決まる
不整合だけを直させ、会計処理と級の境界の誤りは報告に留める。後者の修正は
論点の追加削除、すなわち単元の設計変更にあたり、人間の判断が要るため。

カバレッジ検証にWriteとEditを与えない。指摘者が自由に書き換えられると、
指摘の妥当性を検討する段階が飛ばされる。

本文執筆とドリル作成を分けるのは、必要な思考が異なり、かつ問題作成は
独立性が高く並列に回せるため。
```

---

### Task 14: 全体を通しで検証し、README を書く

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: Task 1〜13 のすべて
- Produces: なし

- [ ] **Step 1: 全ゲートを通す**

```bash
npm run check; echo "check 終了コード=$?"
npm run coverage
node tools/test-formula.mjs
```

期待する結果: check が指摘0件で終了コード0。coverage が2級論点の総数と未カバー一覧を出す（Phase 0 は3級復習中心なので、ほとんどが未カバーで正しい）。式パーサのテストが全件通る。

- [ ] **Step 2: サブエージェントが実際に呼べるか確かめる**

`boki-coverage` サブエージェントに `phase0` を対象として実行させる。
**定義ファイルを置いただけで動作を確認しないまま完了としない。**

期待する結果: `npm run coverage` の出力を起点に、未カバー論点と「別の週の担当」の切り分けが返る。エージェントが `npm run coverage` を承認待ちなく実行できることも同時に確認する。

- [ ] **Step 3: README.md を書く**

`README.md` に次を書く。

```markdown
# 日商簿記2級 教材

日商簿記2級（2026年11月15日 第174回）に向けた学習教材と、その制作環境。

## 構成

| 場所 | 内容 |
|---|---|
| `学習カリキュラム.md` | 11週間の学習計画。週次の論点配分 |
| `教材制作ルール.md` | 教材の出力形式・執筆方針・品質ゲート |
| `出題範囲_最新確認メモ.md` | 出題範囲の確認結果 |
| `phase0/` | 単元教材（HTML1枚／単元） |
| `reference/` | 出題区分表・勘定科目表の原本と構造化データ |
| `tools/` | 検証スクリプト |

## 教材を開く

HTMLをブラウザで直接開く。サーバーは要らない。

```
open phase0/index.html
```

外部CDN・外部フォントを参照しないため、オフラインで動く。

## 検証

```
npm run check       # 貸借一致・勘定科目・解答の再計算・リンク・横スクロール
npm run coverage    # 出題区分表に対する論点カバレッジ
```

Node.js と Playwright が要る。npm パッケージのインストールは不要。

## 一次情報

級の境界と勘定科目は `reference/` の構造化データを根拠とする。
原本のPDFと出典は `reference/SOURCES.md`。

`reference/*.yml` はPDFから生成したもので、手で編集しない。
`tools/parse-syllabus.py` / `tools/parse-accounts.py` で再生成する。
```

- [ ] **Step 4: 最終確認とコミット**

```bash
npm run check && echo "--- check OK ---"
git status --short
```

`git add README.md` のうえで、次のメッセージでコミットする。

```
docs: リポジトリの構成と検証手順のREADMEを追加
```

コミット後に確認する。

```bash
git status --short
git log --oneline
```

期待する結果: check が通り、作業ツリーがクリーンで、Task 1〜14 のコミットが並んでいること。
