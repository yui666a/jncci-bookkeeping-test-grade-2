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
npm install         # 初回のみ。Playwright を入れる
npx playwright install chromium

npm run check       # 貸借一致・勘定科目・解答の再計算・リンク・横スクロール
npm run coverage    # 出題区分表に対する論点カバレッジ
npm test            # 計算式パーサの単体テスト
```

検証は Playwright で `file://` を開き、DOM と JS ランタイムから読む。
教材本体は依存を持たないが、検証側は Playwright だけを使う。

区分表・勘定科目表の再生成には `pdftotext`（poppler）が要る。

## 一次情報

級の境界と勘定科目は `reference/` の構造化データを根拠とする。
原本のPDFと出典は `reference/SOURCES.md`。

`reference/*.yml` はPDFから生成したもので、手で編集しない。
`tools/parse-syllabus.py` / `tools/parse-accounts.py` で再生成する。
