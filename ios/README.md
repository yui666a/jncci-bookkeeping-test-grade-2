# iOS アプリ

教材をそのまま同梱し、WKWebView で表示する iOS アプリ。オフラインで動く。

教材本体（リポジトリ直下の HTML と `assets/`・`phase*/`）には手を入れない。
ビルドのたびに `scripts/copy-web.sh` がそれらを `.app` 内の `www/` へ写す。

## ビルド

Mac・Xcode・[XcodeGen](https://github.com/yonaskolb/XcodeGen) が要る。

```
brew install xcodegen
cd ios
xcodegen            # project.yml から Boki2.xcodeproj を生成する
open Boki2.xcodeproj
```

Xcode で Boki2 ターゲットの Signing & Capabilities を開き、Team に自分の
Apple Developer アカウントを選ぶ。Bundle Identifier が他と衝突したら変える。
実機をつないで Run すれば入る。

`project.yml` を変えたら `xcodegen` をやり直す。教材の HTML を変えただけなら
Xcode で Run し直せば反映される。

## しくみ

| 対象 | 振る舞い |
|---|---|
| 教材の配信 | `boki://app/` から配信する（`BundleSchemeHandler.swift`）。`file://` では復習ドリル・横断演習が `drills.json` を読めない |
| 外部リンク | 商工会議所のサイトなどはアプリ内ブラウザ（Safari View Controller）で開く |
| エクスポート | `navigator.clipboard.writeText` をネイティブの `UIPasteboard` につなぐ |
| `alert` / `confirm` | ネイティブのダイアログで出す |
| 戻る | 画面の左端からスワイプ |

## 学習記録の保存場所

学習記録（localStorage）はアプリの中に保存される。Safari や公開サイトで
付けた記録とは共有されず、アプリを削除すると記録も消える。記録を残すには、
`progress.html` のエクスポートでこまめに書き出す。

## 配布

自分の端末で使うだけなら、Xcode から直接入れるか TestFlight の内部テストで足りる。
どちらも App Store の審査を通らない。

App Store に出す場合は App Review Guidelines の 4.2（Minimum Functionality）に
当たる。ウェブサイトを包み直しただけのものを超える機能・コンテンツ・UI を求める
規定で、4.2.2 はマーケティング素材・広告・ウェブクリップ・コンテンツアグリゲータ・
リンク集を主とするアプリを認めない。このアプリは外部サイトを読み込むのではなく
教材を同梱してオフラインで動くが、中身は HTML の表示なので、4.2 を理由に
却下される余地は残る。
