# 学習進捗の記録と書き出し 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 教材を使う操作そのものから学習実績が `localStorage` に貯まり、`progress.html` のボタン1つで JSON として書き出せる状態にする。

**Architecture:** `localStorage` の `boki2:progress` 1キーに全記録を集約する。記録の書き込みは共通アセット `app.js` の内部で完結させ、単元HTMLの著者は記録用のコードを書かない。`progress.html` は読んで集計するだけの一方向にする。共通アセットはリポジトリ直下の `assets/` へ一本化する。

**Tech Stack:** 素の JavaScript（外部ライブラリ不使用、`file://` で動作）、Playwright（検査）、Node.js

**Spec:** `docs/design/2026-08-29-progress-tracking.md`
**決定の背景:** `docs/adr/0001-progress-tracking-source-of-truth.md`

## Global Constraints

- 教材HTMLとアセットは外部CDN・外部フォント・画像URLを参照しない。オフラインで `file://` から直接開いて動くこと
- `app.js` は ES5 相当の構文で書く（既存コードが `var` と `function` で統一されているため、そこに合わせる）
- `localStorage` の読み書きは既存の `LS` ヘルパを通す。例外で処理を止めない
- 記録の書き込みは `app.js` の内部で完結させる。単元HTMLに記録用のコードを書かせない
- 日時は ISO 8601 のローカルタイムゾーン付き文字列で保存する（例 `2026-08-29T13:05:00+09:00`）
- `npm run check` が通らない状態でタスクを完了としない
- コミットメッセージは Why を書く。日本語プレフィックス付き conventional commits

## 用語

- **単元キー** — 拡張子を除いたページパス。例 `phase0/03_dentaku`
- **ドリルID** — `単元キー#要素id/q連番`。例 `phase0/03_dentaku#drill-teisu-1/q3`

---

## タスク一覧

| # | 内容 | 独立して検証できる成果 |
|---|---|---|
| 1 | 共通アセットを `assets/` へ一本化 | 全ページが新パスで動く |
| 2 | `BokiProgress` のストアと単元キー | 記録の読み書きができる |
| 3 | ドリルとチェックの記録配線 | 解くと記録が増える |
| 4 | 学習時間の計測 | 能動時間だけが積算される |
| 5 | メモ欄 | `data-note` から記録できる |
| 6 | `progress.html` ダッシュボード | 集計とエクスポートが動く |
| 7 | 品質ゲート9 | 配線切れを検査で捕まえられる |
| 8 | 転記スキルと `進捗ログ.md` | JSON から MD へ転記できる |
| 9 | ドキュメント更新 | ルールと構成が実態に一致する |

---

### Task 1: 共通アセットを assets/ へ一本化

`phase0/assets/` と `phase1/assets/` はバイト単位で同一の複製である。`BokiProgress` を入れると、以後フェーズが増えるたびに同じ修正を全複製へ適用することになり、いずれ食い違う。単元HTMLを書く前のいまが、統合の最も安いタイミングである。

**Files:**
- Create: `assets/app.js`（`phase0/assets/app.js` を移動）
- Create: `assets/style.css`（`phase0/assets/style.css` を移動）
- Delete: `phase0/assets/`, `phase1/assets/`
- Modify: `phase0/01_3kyu-review.html:8,1261`, `phase0/02_kanjo-renrakuzu.html:8,912`, `phase0/03_dentaku.html:8,608`, `phase0/04_junbi.html:8,517`, `phase0/index.html`, `index.html:8,196`

**Interfaces:**
- Produces: 全ページから参照される単一の `assets/app.js` と `assets/style.css`

- [ ] **Step 1: 現状が通ることを確認する**

```bash
npm run check
```

Expected: `OK 5 ページ、指摘なし`（この時点の基準を記録しておく）

- [ ] **Step 2: アセットを移動する**

```bash
mkdir -p assets
git mv phase0/assets/app.js assets/app.js
git mv phase0/assets/style.css assets/style.css
rm -rf phase0/assets phase1/assets
rmdir phase1 2>/dev/null || true
```

- [ ] **Step 3: 参照パスを書き換える**

`phase0/*.html` は `assets/` を `../assets/` にする。ルート `index.html` は `phase0/assets/` を `assets/` にする。

```bash
sed -i '' 's|href="assets/style.css"|href="../assets/style.css"|; s|src="assets/app.js"|src="../assets/app.js"|' phase0/*.html
sed -i '' 's|href="phase0/assets/style.css"|href="assets/style.css"|; s|src="phase0/assets/app.js"|src="assets/app.js"|' index.html
```

- [ ] **Step 4: 参照漏れがないことを確認する**

```bash
grep -rn "phase0/assets\|phase1/assets" --include="*.html" --include="*.mjs" --include="*.md" . | grep -v node_modules
```

Expected: 何も出力されない（`docs/` 内の設計文書に旧パスが残っていれば、それも直す）

- [ ] **Step 5: 全ページが読み込めることを確認する**

```bash
npm run check
```

Expected: `OK 5 ページ、指摘なし`。ゲート0が mount 数の食い違いを検出するため、アセットの読み込みに失敗していればここで落ちる

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'MSG'
refactor: 共通アセットをフェーズ間で共有する1箇所に集約する

phase0/assets と phase1/assets はバイト単位で同一の複製だった。
このままフェーズを増やすと、共通アセットへの修正を複製の数だけ
適用することになり、いずれ食い違う。単元HTMLが4本しかない
いまが最も安く統合できる。
MSG
)"
```

---

### Task 2: BokiProgress のストアと単元キー

記録の土台を作る。この時点ではまだ何も記録されない。

**Files:**
- Modify: `assets/app.js`（`PAGE`/`NS` の定義部、末尾の `window` 公開部）
- Test: `tools/test-progress.mjs`（新規）

**Interfaces:**
- Produces:
  - `window.BokiProgress.unitKey()` → `string`（例 `'phase0/03_dentaku'`）
  - `window.BokiProgress.dump()` → `{version:number, sessions:Array, drills:Object, checks:Object, notes:Array}`
  - `window.BokiProgress.exportJSON()` → `string`（`dump()` に `exportedAt` を足した JSON）
  - `window.BokiProgress._reset()` → `void`（テスト用。ストアを空に戻す）
  - `window.BokiLS`（既存、変更なし）

- [ ] **Step 1: 失敗するテストを書く**

`tools/test-progress.mjs` を新規作成する。Playwright で空のページに `app.js` を読み込ませ、API を直接叩く。

```js
// BokiProgress の単体テスト。教材HTMLに依存せず、app.js だけを読んで検査する。
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const APP = readFileSync(resolve('assets/app.js'), 'utf8');
let failures = 0;

function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) return;
  failures++;
  console.log('NG ' + label + '  期待=' + e + '  実際=' + a);
}

// 単元キーを検査するため、任意のパスのページを作って app.js を読ませる。
async function withApp(browser, pathname, fn) {
  const page = await browser.newPage();
  await page.route('**/*', (route) => route.fulfill({
    status: 200, contentType: 'text/html',
    body: '<!doctype html><meta charset="utf-8"><body><script>' + APP + '</script>',
  }));
  await page.goto('https://example.test/' + pathname);
  try { return await fn(page); } finally { await page.close(); }
}

const browser = await chromium.launch();
try {
  // 単元キーはディレクトリを含む。ファイル名だけだとフェーズ間で衝突する。
  await withApp(browser, 'phase0/03_dentaku.html', async (page) => {
    eq(await page.evaluate(() => BokiProgress.unitKey()),
       'phase0/03_dentaku', '単元キーがディレクトリを含む');
  });

  await withApp(browser, 'phase1/03_dentaku.html', async (page) => {
    eq(await page.evaluate(() => BokiProgress.unitKey()),
       'phase1/03_dentaku', '同名ファイルがフェーズ違いで衝突しない');
  });

  // 空のストアは、集計側が場合分けせずに読める形で返る。
  await withApp(browser, 'phase0/x.html', async (page) => {
    eq(await page.evaluate(() => { BokiProgress._reset(); const d = BokiProgress.dump();
      return [d.version, Array.isArray(d.sessions), Array.isArray(d.notes),
              typeof d.drills, typeof d.checks]; }),
       [1, true, true, 'object', 'object'], '空のストアの形');
  });

  // 壊れた JSON が入っていても、例外を投げず初期値に戻す。
  await withApp(browser, 'phase0/x.html', async (page) => {
    eq(await page.evaluate(() => {
      localStorage.setItem('boki2:progress', '{壊れた');
      return BokiProgress.dump().version; }),
       1, '壊れたデータから復帰する');
  });

  // エクスポートは exportedAt だけを足した同一構造。
  await withApp(browser, 'phase0/x.html', async (page) => {
    eq(await page.evaluate(() => {
      BokiProgress._reset();
      const o = JSON.parse(BokiProgress.exportJSON());
      return [typeof o.exportedAt, o.version, Array.isArray(o.sessions)]; }),
       ['string', 1, true], 'エクスポートの形');
  });
} finally {
  await browser.close();
}

if (failures) { console.log('\nNG ' + failures + ' 件'); process.exit(1); }
console.log('OK BokiProgress');
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
node tools/test-progress.mjs
```

Expected: FAIL。`BokiProgress is not defined` により全項目が NG になる

- [ ] **Step 3: BokiProgress を実装する**

`assets/app.js` の `var PAGE = ...` から始まる2行を、次で置き換える。

```js
  // 単元キーはディレクトリを含める。ファイル名だけだと phase0/01_... と
  // phase1/01_... が同じキーになり、別単元の記録が混ざる。
  function unitKeyOf(pathname) {
    var p = pathname.replace(/^\/+/, '').replace(/\.html?$/, '');
    var seg = p.split('/').filter(Boolean);
    if (!seg.length) return 'index';
    return seg.slice(-2).join('/');
  }
  var PAGE = unitKeyOf(location.pathname);
  var NS = 'boki2:' + PAGE + ':';
```

`window` 公開部（`window.BokiLS = LS;` の手前）に `BokiProgress` を追加する。

```js
  /* ---------- 学習記録 ---------- */
  var PROGRESS_KEY = 'boki2:progress';
  var PROGRESS_VERSION = 1;

  function emptyProgress() {
    return { version: PROGRESS_VERSION, sessions: [], drills: {}, checks: {}, notes: [] };
  }

  // 保存された値が壊れていても、そこで学習が止まらないようにする。
  // 形が違えば初期値に戻すが、version が未来のものはそのまま保持して
  // 上書きを避ける（新しい版で書かれた記録を古い版が壊さない）。
  function loadProgress() {
    var raw = LS.get(PROGRESS_KEY, null);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyProgress();
    var base = emptyProgress();
    if (typeof raw.version === 'number') base.version = raw.version;
    if (Array.isArray(raw.sessions)) base.sessions = raw.sessions;
    if (Array.isArray(raw.notes)) base.notes = raw.notes;
    if (raw.drills && typeof raw.drills === 'object') base.drills = raw.drills;
    if (raw.checks && typeof raw.checks === 'object') base.checks = raw.checks;
    return base;
  }

  function saveProgress(p) { LS.set(PROGRESS_KEY, p); }

  // ローカルタイムゾーン付きの ISO 8601。toISOString() は UTC になり、
  // 学習した日付が深夜だと前日にずれて見える。
  function nowISO() {
    var d = new Date();
    var off = -d.getTimezoneOffset();
    var sign = off >= 0 ? '+' : '-';
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) +
      'T' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) +
      sign + p2(Math.floor(Math.abs(off) / 60)) + ':' + p2(Math.abs(off) % 60);
  }

  var BokiProgress = {
    unitKey: function () { return PAGE; },
    now: nowISO,
    dump: loadProgress,
    exportJSON: function () {
      var p = loadProgress();
      p.exportedAt = nowISO();
      return JSON.stringify(p);
    },
    _reset: function () { saveProgress(emptyProgress()); }
  };
```

`window.BokiLS = LS;` の直前に次を足す。

```js
  window.BokiProgress = BokiProgress;
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
node tools/test-progress.mjs
```

Expected: `OK BokiProgress`

- [ ] **Step 5: 既存の教材が壊れていないことを確認する**

```bash
npm run check && npm test
```

Expected: どちらも成功。`NS` の値が変わるため既存のチェックボックスの保存先キーが変わるが、Task 3 で移行を入れる

- [ ] **Step 6: package.json にテストを登録する**

`scripts.test` を次に変える。

```json
"test": "node tools/test-formula.mjs && node tools/test-progress.mjs"
```

- [ ] **Step 7: Commit**

```bash
git add assets/app.js tools/test-progress.mjs package.json
git commit -m "$(cat <<'MSG'
feat: 学習記録のストアを単一キーに置く

記録をページ別に散らすと、集計のたびに全ページのキーを走査することに
なり、単元が増えるほど破綻する。boki2:progress の1キーに集約する。

単元キーにディレクトリを含めるのは、phase0/01_... と phase1/01_... が
同じキーになって別単元の記録が混ざるのを避けるため。
MSG
)"
```

---

### Task 3: ドリルとチェックの記録配線

4種のドリルはいずれも `makeScorer` が返す `report(i, ok)` を通って採点を確定している。ここ1箇所に記録を挿せば、既存の4単元も今後の単元も、著者側の変更なしに記録される。

**Files:**
- Modify: `assets/app.js`（`makeScorer`、各 `mount` の `report` 生成、`initChecklists`）
- Test: `tools/test-progress.mjs`（追記）

**Interfaces:**
- Consumes: Task 2 の `BokiProgress.dump()` / `_reset()` / `now()`、`PAGE`
- Produces:
  - `BokiProgress.record(drillId, ok)` → `void`
  - `BokiProgress.check(unitKey, key, checked)` → `void`
  - ドリルIDの形式 `単元キー#要素id/q連番`

- [ ] **Step 1: 失敗するテストを書く**

`tools/test-progress.mjs` の `browser.close()` の手前に足す。

```js
  // ドリルIDは単元キー・要素id・設問番号から決まる。
  await withApp(browser, 'phase0/03_dentaku.html', async (page) => {
    eq(await page.evaluate(() => {
      BokiProgress._reset();
      BokiProgress.record('phase0/03_dentaku#d1/q1', false);
      BokiProgress.record('phase0/03_dentaku#d1/q1', true);
      const a = BokiProgress.dump().drills['phase0/03_dentaku#d1/q1'].attempts;
      return [a.length, a[0].ok, a[1].ok, typeof a[0].at]; }),
       [2, false, true, 'string'], '試行が履歴として積まれる');
  });

  // チェックは単元ごとに入れ子で持つ。
  await withApp(browser, 'phase0/04_junbi.html', async (page) => {
    eq(await page.evaluate(() => {
      BokiProgress._reset();
      BokiProgress.check('phase0/04_junbi', 'moushikomi', true);
      return BokiProgress.dump().checks['phase0/04_junbi'].moushikomi; }),
       true, 'チェックが単元別に入る');
  });

  // 旧キーの記録は初回読み込みで引き継ぐ。消えると学習者が積み上げた
  // チェックが失われる。
  await withApp(browser, 'phase0/04_junbi.html', async (page) => {
    eq(await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('boki2:04_junbi:check', JSON.stringify({ dentaku: true }));
      localStorage.setItem('boki2:phase0/04_junbi:check', JSON.stringify({ moushikomi: true }));
      BokiProgress.migrateLegacy();
      const c = BokiProgress.dump().checks['phase0/04_junbi'] || {};
      return [c.dentaku === true, c.moushikomi === true]; }),
       [true, true], '旧キーからチェックを引き継ぐ');
  });
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
node tools/test-progress.mjs
```

Expected: FAIL。`BokiProgress.record is not a function`

- [ ] **Step 3: 記録APIと移行を実装する**

`BokiProgress` の定義に次のメソッドを足す。

```js
    record: function (drillId, ok) {
      var p = loadProgress();
      if (!p.drills[drillId]) p.drills[drillId] = { attempts: [] };
      p.drills[drillId].attempts.push({ at: nowISO(), ok: !!ok });
      saveProgress(p);
    },
    check: function (unitKey, key, checked) {
      var p = loadProgress();
      if (!p.checks[unitKey]) p.checks[unitKey] = {};
      p.checks[unitKey][key] = !!checked;
      saveProgress(p);
    },
    // ページ別キーで保存されていたチェックを取り込む。旧キーは消さない。
    // 消しても得るものがなく、取り込みに失敗したときの復元手段が絶たれる。
    migrateLegacy: function () {
      var p = loadProgress(), moved = false;
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        var m = k && k.match(/^boki2:(.+):check$/);
        if (!m) continue;
        var unit = m[1].indexOf('/') >= 0 ? m[1] : PAGE;
        var old = LS.get(k, null);
        if (!old || typeof old !== 'object') continue;
        if (!p.checks[unit]) p.checks[unit] = {};
        for (var key in old) {
          if (p.checks[unit][key] === undefined) { p.checks[unit][key] = !!old[key]; moved = true; }
        }
      }
      if (moved) saveProgress(p);
    },
```

`makeScorer` を、記録も行う形に変える。ドリルIDの組み立てはここに置く。

```js
  // 採点の確定点は4種のドリルで共通してここを通る。記録をここに置けば、
  // 単元HTMLの著者が記録用のコードを書く必要がなくなる。書き忘れが
  // 起きうる場所に記録を置くと、失われたデータは後から復元できない。
  function makeScorer(scoreEl, total, drillBase) {
    var state = {};
    return function (id, ok) {
      state[id] = ok;
      if (drillBase) BokiProgress.record(drillBase + '/q' + (id + 1), ok);
      var done = 0, right = 0;
      for (var k in state) { done++; if (state[k]) right++; }
      scoreEl.textContent = '正解 ' + right + ' / 解答済 ' + done + '（全' + total + '問）';
    };
  }

  // 記録先を決めるにはマウント先の id が要る。id がない設問は記録しない
  // （品質ゲート9がこれを検出する）。
  function drillBaseOf(root) {
    return root && root.id ? PAGE + '#' + root.id : null;
  }
```

4箇所の `var report = makeScorer(ui.score, cfg.questions.length);` を、すべて次に変える。

```js
      var report = makeScorer(ui.score, cfg.questions.length, drillBaseOf(root));
```

`initChecklists` の保存処理を差し替える。冒頭に移行を呼び、読み書きを新ストアにする。

```js
  function initChecklists() {
    BokiProgress.migrateLegacy();
    var boxes = document.querySelectorAll('input[type="checkbox"][data-key]');
    if (!boxes.length) return;
    var store = (BokiProgress.dump().checks || {})[PAGE] || {};

    Array.prototype.forEach.call(boxes, function (b) {
      if (store[b.dataset.key]) b.checked = true;
      b.addEventListener('change', function () {
        BokiProgress.check(PAGE, b.dataset.key, b.checked);
        updateBars();
      });
    });
```

同関数のリセット処理も新ストアに向ける。

```js
    document.querySelectorAll('[data-reset-progress]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(boxes, function (b) {
          b.checked = false;
          BokiProgress.check(PAGE, b.dataset.key, false);
        });
        updateBars();
      });
    });
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
node tools/test-progress.mjs && npm run check
```

Expected: `OK BokiProgress` と `OK 5 ページ、指摘なし`

- [ ] **Step 5: 実際の教材で記録されることを目視で確認する**

```bash
open phase0/03_dentaku.html
```

ドリルを1問採点し、DevTools のコンソールで確認する。

```js
JSON.parse(localStorage.getItem('boki2:progress')).drills
```

Expected: `phase0/03_dentaku#...` を含むエントリが1件以上ある

- [ ] **Step 6: Commit**

```bash
git add assets/app.js tools/test-progress.mjs
git commit -m "$(cat <<'MSG'
feat: ドリルの正誤とチェックを学習記録に残す

採点の確定点は4種のドリルすべてが makeScorer を通るため、記録を
そこに1箇所置けば単元HTMLの著者は何も書かなくてよい。著者の責務に
すると書き忘れが起き、その週の記録は後から復元できない。

正誤を最新値ではなく試行の履歴で持つのは、一発で正解した設問と
3回目で正解した設問を区別しないと復習の優先順位が決められないため。
MSG
)"
```

---

### Task 4: 学習時間の計測

**Files:**
- Modify: `assets/app.js`（`BokiProgress` に区間記録、`boot()` に初期化）
- Test: `tools/test-progress.mjs`（追記）

**Interfaces:**
- Consumes: Task 2 の `loadProgress`/`saveProgress`/`nowISO`、`PAGE`
- Produces:
  - `BokiProgress.addSession(unitKey, startISO, sec)` → `void`
  - `sessions` の要素 `{unit:string, start:string, sec:number}`

- [ ] **Step 1: 失敗するテストを書く**

```js
  // 極端に短い区間は記録しない。ページを開いて即座に閉じた分が
  // 大量に積もると、集計が読めなくなる。
  await withApp(browser, 'phase0/03_dentaku.html', async (page) => {
    eq(await page.evaluate(() => {
      BokiProgress._reset();
      BokiProgress.addSession('phase0/03_dentaku', BokiProgress.now(), 3);
      BokiProgress.addSession('phase0/03_dentaku', BokiProgress.now(), 120);
      const s = BokiProgress.dump().sessions;
      return [s.length, s[0].sec, s[0].unit]; }),
       [1, 120, 'phase0/03_dentaku'], '10秒未満の区間は捨てる');
  });

  // 非可視化で区間が確定する。実時間ではなく能動時間を測る。
  await withApp(browser, 'phase0/03_dentaku.html', async (page) => {
    eq(await page.evaluate(async () => {
      BokiProgress._reset();
      BokiProgress.__testTick(-60);            // 60秒前に開始したことにする
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      const s = BokiProgress.dump().sessions;
      return [s.length, s.length ? s[0].sec >= 55 && s[0].sec <= 65 : null]; }),
       [1, true], '非可視化で区間が確定する');
  });
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
node tools/test-progress.mjs
```

Expected: FAIL。`BokiProgress.addSession is not a function`

- [ ] **Step 3: 計測を実装する**

`BokiProgress` にメソッドを足す。

```js
    // 10秒未満は捨てる。ページを開いて即閉じた区間が積もると集計が
    // 読めなくなるうえ、学習時間としての意味もない。
    addSession: function (unitKey, startISO, sec) {
      sec = Math.round(sec);
      if (!(sec >= 10)) return;
      var p = loadProgress();
      p.sessions.push({ unit: unitKey, start: startISO, sec: sec });
      saveProgress(p);
    },
```

セッション計測を追加する。`initChecklists` の定義の後ろに置く。

```js
  /* ---------- 学習時間の計測 ---------- */
  // 経過時間ではなく能動時間を測る。タブを開いたまま離席した時間が
  // 学習時間に入ると、計画の週23時間を満たしているように見えて実際は
  // 足りていない、という最も避けたい壊れ方をする。
  var IDLE_MS = 5 * 60 * 1000;

  function initSession() {
    var startedAt = Date.now();
    var startISO = nowISO();
    var lastActive = Date.now();
    var accrued = 0;
    var running = true;

    function touch() { lastActive = Date.now(); }
    ['keydown', 'click', 'scroll', 'pointerdown'].forEach(function (ev) {
      document.addEventListener(ev, touch, { passive: true });
    });

    // 直近の操作から IDLE_MS を超えた分は加算しない。
    function slice() {
      if (!running) return;
      var now = Date.now();
      var cut = Math.min(now, lastActive + IDLE_MS);
      if (cut > startedAt) accrued += (cut - startedAt) / 1000;
      startedAt = now;
    }

    function flush() {
      slice();
      running = false;
      if (accrued >= 10) BokiProgress.addSession(PAGE, startISO, accrued);
      accrued = 0;
    }

    function resume() {
      startedAt = Date.now();
      lastActive = Date.now();
      startISO = nowISO();
      running = true;
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) flush();
      else resume();
    });
    // pagehide は bfcache と離脱の双方で発火する。beforeunload は
    // Safari で発火しないことがあるため使わない。
    window.addEventListener('pagehide', flush);

    // 長時間の学習でも記録を失わないよう、定期的に確定させる。
    setInterval(function () {
      slice();
      if (accrued >= 60) { BokiProgress.addSession(PAGE, startISO, accrued); accrued = 0; startISO = nowISO(); }
    }, 60 * 1000);

    BokiProgress.__testTick = function (deltaSec) {
      startedAt += deltaSec * 1000;
      lastActive = Date.now();
    };
  }
```

`boot()` を変える。

```js
  function boot() { initTheme(); initChecklists(); initSession(); initNotes(); }
```

`initNotes` は Task 5 で実装する。それまでは次を置いておく。

```js
  function initNotes() { /* Task 5 */ }
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
node tools/test-progress.mjs && npm run check
```

Expected: 両方成功

- [ ] **Step 5: Commit**

```bash
git add assets/app.js tools/test-progress.mjs
git commit -m "$(cat <<'MSG'
feat: 学習時間を能動時間として計測する

経過時間をそのまま測ると、タブを開いたまま離席した時間が学習時間に
なる。計画の週23時間を満たしているように見えて実際は足りていない、
という最も避けたい壊れ方をするため、直近5分以内に操作がある可視区間
だけを積算する。

beforeunload は Safari で発火しないことがあるため pagehide を使う。
MSG
)"
```

---

### Task 5: メモ欄

**Files:**
- Modify: `assets/app.js`（`initNotes`、`BokiProgress.note`）
- Modify: `assets/style.css`（メモ欄）
- Modify: `phase0/01_3kyu-review.html`, `phase0/02_kanjo-renrakuzu.html`, `phase0/03_dentaku.html`, `phase0/04_junbi.html`
- Test: `tools/test-progress.mjs`（追記）

**Interfaces:**
- Consumes: Task 2 の `loadProgress`/`saveProgress`/`nowISO`、`PAGE`
- Produces:
  - `BokiProgress.note(text)` → `void`
  - `notes` の要素 `{at:string, unit:string, text:string}`
  - HTML の記法 `<div data-note></div>`

- [ ] **Step 1: 失敗するテストを書く**

```js
  // 空のメモは記録しない。
  await withApp(browser, 'phase0/02_kanjo-renrakuzu.html', async (page) => {
    eq(await page.evaluate(() => {
      BokiProgress._reset();
      BokiProgress.note('  ');
      BokiProgress.note('按分が分からない');
      const n = BokiProgress.dump().notes;
      return [n.length, n[0].text, n[0].unit]; }),
       [1, '按分が分からない', 'phase0/02_kanjo-renrakuzu'], '空メモを捨て、単元を紐づける');
  });
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
node tools/test-progress.mjs
```

Expected: FAIL。`BokiProgress.note is not a function`

- [ ] **Step 3: メモを実装する**

`BokiProgress` にメソッドを足す。

```js
    note: function (text) {
      text = String(text == null ? '' : text).trim();
      if (!text) return;
      var p = loadProgress();
      p.notes.push({ at: nowISO(), unit: PAGE, text: text });
      saveProgress(p);
    },
```

`initNotes` の中身を実装する。

```js
  function initNotes() {
    document.querySelectorAll('[data-note]').forEach(function (host) {
      var wrap = el('div', 'note');
      wrap.appendChild(el('div', 'note__label', 'わからなかったこと・気づいたこと'));
      var ta = el('textarea', 'note__input');
      ta.rows = 3;
      ta.placeholder = '例：連結のアップストリームで非支配株主持分への按分が分からない';
      var row = el('div', 'btn-row');
      var save = el('button', 'btn btn--sm', '記録する');
      var msg = el('span', 'small muted', '');
      row.appendChild(save); row.appendChild(msg);
      wrap.appendChild(ta); wrap.appendChild(row);

      var list = el('div', 'note__list');
      function render() {
        list.innerHTML = '';
        var notes = BokiProgress.dump().notes.filter(function (n) { return n.unit === PAGE; });
        notes.slice().reverse().forEach(function (n) {
          var item = el('div', 'note__item');
          item.appendChild(el('span', 'note__at', n.at.slice(0, 10)));
          item.appendChild(el('span', 'note__text', n.text));
          list.appendChild(item);
        });
      }
      wrap.appendChild(list);

      save.addEventListener('click', function () {
        if (!ta.value.trim()) return;
        BokiProgress.note(ta.value);
        ta.value = '';
        msg.textContent = '記録した';
        setTimeout(function () { msg.textContent = ''; }, 2000);
        render();
      });

      render();
      host.appendChild(wrap);
    });
  }
```

- [ ] **Step 4: スタイルを足す**

`assets/style.css` の末尾に足す。既存のトークン（`--line`, `--muted`, `--bg2`）に合わせる。

```css
/* ---------- 学習メモ ---------- */
.note { margin: 1.2rem 0; padding: 1rem; border: 1px solid var(--line); border-radius: 8px; background: var(--bg2); }
.note__label { font-weight: 600; margin-bottom: .5rem; }
.note__input { width: 100%; box-sizing: border-box; padding: .6rem; border: 1px solid var(--line);
  border-radius: 6px; font: inherit; background: var(--bg); color: inherit; resize: vertical; }
.note__list { margin-top: .8rem; }
.note__item { display: flex; gap: .6rem; padding: .4rem 0; border-top: 1px solid var(--line); font-size: .92em; }
.note__at { color: var(--muted); white-space: nowrap; }
.note__text { white-space: pre-wrap; }
```

`--bg2` と `--bg` が既存に定義されているか確認し、なければ既存の同等トークンに置き換える。

```bash
grep -n "\-\-bg2\|\-\-line\|\-\-muted" assets/style.css | head -5
```

- [ ] **Step 5: 既存4単元にメモ欄を置く**

各単元の本文末尾、`<script src="../assets/app.js">` の直前にあるコンテナの中へ1行入れる。挿入位置は各ファイルの最後の `</section>` の直前とする。

```bash
for f in phase0/01_3kyu-review.html phase0/02_kanjo-renrakuzu.html phase0/03_dentaku.html phase0/04_junbi.html; do
  python3 - "$f" <<'PY'
import sys, io
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()
if 'data-note' in s:
    print('skip ' + p); raise SystemExit
i = s.rfind('</section>')
assert i > 0, p
s = s[:i] + '\n<div data-note></div>\n' + s[i:]
io.open(p, 'w', encoding='utf-8').write(s)
print('ok ' + p)
PY
done
```

- [ ] **Step 6: テストと検査が通ることを確認する**

```bash
node tools/test-progress.mjs && npm run check
```

Expected: 両方成功。ゲート6が横スクロールと id 重複を見るため、レイアウト崩れがあればここで落ちる

- [ ] **Step 7: 目視で確認する**

```bash
open phase0/02_kanjo-renrakuzu.html
```

Expected: 末尾にメモ欄があり、記録するとその場に一覧が出る。リロードしても残る

- [ ] **Step 8: Commit**

```bash
git add assets/app.js assets/style.css phase0/*.html tools/test-progress.mjs
git commit -m "$(cat <<'MSG'
feat: 学習中の疑問をその場で記録できるようにする

わからなかったことは、机を離れてから思い出して書くと粒度が粗くなる。
単元ページに data-note を置くだけでメモ欄が生え、単元と日時に
紐づけて記録される。
MSG
)"
```

---

### Task 6: progress.html ダッシュボード

**Files:**
- Create: `progress.html`
- Modify: `assets/style.css`（ダッシュボード）
- Modify: `index.html`, `phase0/index.html`（導線）

**Interfaces:**
- Consumes: Task 2〜5 の `BokiProgress.dump()` / `exportJSON()`
- Produces: `progress.html`（`assets/app.js` と `assets/style.css` を参照する単一ページ）

- [ ] **Step 1: ダッシュボードを作る**

`progress.html` を新規作成する。既存の単元HTMLのヘッダ構造に合わせる（`npm run check` の対象は `phase*/` 配下のみなので、このファイルはゲート1〜7の対象外。ゲート9で別途検査する）。

```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>学習の記録 — 日商簿記2級</title>
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<header class="site">
  <a class="site__home" href="index.html">← 教材トップ</a>
  <button class="theme-btn"></button>
</header>

<main class="wrap">
<h1>学習の記録</h1>
<p class="small muted">この記録はこのブラウザの中にだけ保存されています。
消えると復元できないため、週に1回はエクスポートしてリポジトリの
<code>進捗ログ.md</code> に転記してください。</p>

<section>
  <h2>今週</h2>
  <div id="week"></div>
</section>

<section>
  <h2>要復習</h2>
  <p class="small muted">誤答を含む設問を、直近の誤答が新しい順に並べています。</p>
  <div id="review"></div>
</section>

<section>
  <h2>単元別</h2>
  <div id="units"></div>
</section>

<section>
  <h2>メモ</h2>
  <div id="notes"></div>
</section>

<section>
  <h2>エクスポート</h2>
  <p class="small muted">全期間の記録を JSON でコピーします。
  Claude に貼ると <code>進捗ログ.md</code> へ転記されます。</p>
  <div class="btn-row">
    <button class="btn" id="export">クリップボードにコピー</button>
    <span class="small muted" id="export-msg"></span>
  </div>
</section>

<section>
  <h2 class="danger-head">記録の全消去</h2>
  <div class="btn-row">
    <button class="btn btn--ghost btn--sm" id="wipe">すべての記録を消す</button>
    <span class="small muted" id="wipe-msg"></span>
  </div>
</section>
</main>

<script src="assets/app.js"></script>
<script>
(function () {
  'use strict';
  var P = window.BokiProgress;

  function el(t, c, x) { var n = document.createElement(t); if (c) n.className = c;
    if (x !== undefined) n.textContent = x; return n; }
  function hm(sec) { var m = Math.round(sec / 60); return Math.floor(m / 60) + 'h' + (m % 60) + 'm'; }

  // 週の始まりは月曜。学習カリキュラムが月曜起点で週を数えている。
  function weekStart() {
    var d = new Date(); d.setHours(0, 0, 0, 0);
    var wd = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - wd);
    return d;
  }

  var data;
  try { data = P.dump(); }
  catch (e) { data = { version: 1, sessions: [], drills: {}, checks: {}, notes: [] }; }

  var sessions = data.sessions || [];
  var drills = data.drills || {};
  var checks = data.checks || {};
  var notes = data.notes || [];

  // 今週
  var ws = weekStart();
  var weekSec = sessions.reduce(function (a, s) {
    var t = new Date(s.start);
    return a + (isFinite(t) && t >= ws ? (Number(s.sec) || 0) : 0);
  }, 0);
  var TARGET = 23 * 3600;
  var wrap = document.getElementById('week');
  wrap.appendChild(el('p', 'big', hm(weekSec) + ' / 23h'));
  var bar = el('div', 'bar'); var fill = el('i');
  fill.style.width = Math.min(100, Math.round(weekSec / TARGET * 100)) + '%';
  bar.appendChild(fill); wrap.appendChild(bar);
  wrap.appendChild(el('p', 'small muted',
    Math.round(weekSec / TARGET * 100) + '%（月曜起点）'));

  // 要復習
  var review = Object.keys(drills).map(function (id) {
    var at = drills[id].attempts || [];
    var wrong = at.filter(function (a) { return !a.ok; });
    if (!wrong.length) return null;
    return { id: id, wrong: wrong.length, total: at.length,
             last: wrong[wrong.length - 1].at,
             solved: at.length && at[at.length - 1].ok };
  }).filter(Boolean).sort(function (a, b) { return a.last < b.last ? 1 : -1; });

  var rv = document.getElementById('review');
  if (!review.length) rv.appendChild(el('p', 'small muted', '誤答はありません。'));
  review.forEach(function (r) {
    var row = el('div', 'row');
    row.appendChild(el('span', 'row__id', r.id));
    row.appendChild(el('span', 'row__meta',
      r.wrong + '誤 / ' + r.total + '回' + (r.solved ? '（直近は正解）' : '（未正解）')));
    row.appendChild(el('span', 'row__meta', r.last.slice(0, 10)));
    rv.appendChild(row);
  });

  // 単元別
  var units = {};
  function slot(u) {
    if (!units[u]) units[u] = { sec: 0, ok: 0, n: 0, checked: 0, total: 0 };
    return units[u];
  }
  sessions.forEach(function (s) { slot(s.unit).sec += Number(s.sec) || 0; });
  Object.keys(drills).forEach(function (id) {
    var u = id.split('#')[0], at = drills[id].attempts || [];
    if (!at.length) return;
    var s = slot(u); s.n++; if (at[at.length - 1].ok) s.ok++;
  });
  Object.keys(checks).forEach(function (u) {
    var s = slot(u), c = checks[u];
    for (var k in c) { s.total++; if (c[k]) s.checked++; }
  });

  var ul = document.getElementById('units');
  var names = Object.keys(units).sort();
  if (!names.length) ul.appendChild(el('p', 'small muted', 'まだ記録がありません。'));
  names.forEach(function (u) {
    var s = units[u], row = el('div', 'row');
    row.appendChild(el('span', 'row__id', u));
    row.appendChild(el('span', 'row__meta', hm(s.sec)));
    row.appendChild(el('span', 'row__meta',
      s.n ? '正答 ' + Math.round(s.ok / s.n * 100) + '%（' + s.n + '問）' : 'ドリルなし'));
    row.appendChild(el('span', 'row__meta',
      s.total ? 'チェック ' + s.checked + '/' + s.total : ''));
    ul.appendChild(row);
  });

  // メモ
  var nl = document.getElementById('notes');
  if (!notes.length) nl.appendChild(el('p', 'small muted', 'メモはありません。'));
  notes.slice().reverse().forEach(function (n) {
    var row = el('div', 'row');
    row.appendChild(el('span', 'row__meta', n.at.slice(0, 10)));
    row.appendChild(el('span', 'row__id', n.unit));
    row.appendChild(el('span', 'note__text', n.text));
    nl.appendChild(row);
  });

  // エクスポート
  document.getElementById('export').addEventListener('click', function () {
    var msg = document.getElementById('export-msg');
    navigator.clipboard.writeText(P.exportJSON()).then(function () {
      msg.textContent = 'コピーした。Claude に貼ってください。';
    }, function () {
      msg.textContent = 'コピーできなかった（ブラウザがクリップボードを許可していない）。';
    });
  });

  // 全消去
  document.getElementById('wipe').addEventListener('click', function () {
    if (!confirm('すべての学習記録を消します。元に戻せません。よろしいですか。')) return;
    P._reset();
    document.getElementById('wipe-msg').textContent = '消去した。再読み込みしてください。';
  });
})();
</script>
</body>
</html>
```

- [ ] **Step 2: スタイルを足す**

`assets/style.css` の末尾に足す。

```css
/* ---------- 学習ダッシュボード ---------- */
.big { font-size: 1.8rem; font-weight: 700; margin: .2rem 0; }
.row { display: flex; flex-wrap: wrap; gap: .8rem; align-items: baseline;
  padding: .5rem 0; border-top: 1px solid var(--line); font-size: .93em; }
.row__id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
.row__meta { color: var(--muted); white-space: nowrap; }
.danger-head { color: var(--muted); font-size: 1.05rem; }
```

`.bar` と `.bar i` が既存にあることを確認する。なければ足す。

```bash
grep -n "^\.bar" assets/style.css
```

- [ ] **Step 3: 導線を張る**

ルート `index.html` のナビゲーションと、`phase0/index.html` に `progress.html` へのリンクを足す。既存のリンク記法に合わせる。

```bash
grep -n "unitcard\|site__home\|<nav" index.html phase0/index.html | head
```

`index.html` の「いま公開している教材」節の中、`phase0/index.html` へのカードの隣に置く。`phase0/index.html` からは `../progress.html` を参照する。

- [ ] **Step 4: 動作を確認する**

```bash
open progress.html
```

Expected: 4節が表示され、記録がなくても「まだ記録がありません」で例外にならない。ドリルを解いた後に開くと要復習と単元別に反映される。コピーボタンでクリップボードに JSON が入る

- [ ] **Step 5: 既存の検査が通ることを確認する**

```bash
npm run check && npm test
```

Expected: 両方成功

- [ ] **Step 6: Commit**

```bash
git add progress.html assets/style.css index.html phase0/index.html
git commit -m "$(cat <<'MSG'
feat: 学習の記録を集計して書き出す画面を置く

要復習リストをこの画面の中心に据える。他の集計はエクスポートすれば
Claude 側でも読めるが、次に何をやり直すかだけは学習の最中に即座に
見たい。

エクスポートは localStorage の構造をそのまま JSON にする。変換層を
挟まなければ、保存された形と書き出した形がズレる余地がない。
MSG
)"
```

---

### Task 7: 品質ゲート9

記録の配線は切れても画面に何も現れない。気づくのは数週間後、進捗を出そうとして空だったときで、その時点でデータは失われている。

**Files:**
- Modify: `tools/check.mjs`（`CHECKS.push` を追加、`targets` に `progress.html` を含める）

**Interfaces:**
- Consumes: `withPage`, `CHECKS`, `report`（既存）、Task 2〜6 の `BokiProgress`
- Produces: ゲート9の4検査

- [ ] **Step 1: 検査を追加する**

`tools/check.mjs` の末尾、`async function main()` の手前に足す。

```js
// ゲート9：進捗記録の健全性。
// 記録の配線が切れても画面には何も現れない。気づくのは数週間後、
// 記録を書き出そうとして空だったときであり、そのデータはもう戻らない。
// ゲート0が mount の実行を検査するのと同じ理由で、機械的に見る。
CHECKS.push(async function checkProgressWiring(page, file) {
  const has = await page.evaluate(() => typeof window.BokiProgress === 'object');
  if (!has) {
    report(file, '(progress)', 'BokiProgress あり', 'なし', '学習記録が読み込まれていない');
    return;
  }

  // mount 先に id がないと記録先が決まらず、その設問は永久に記録されない。
  const missing = await page.evaluate(() => {
    const out = [];
    for (const slot of ['journal', 'quiz', 'num', 'fill']) {
      for (const { sel } of (window.__captured?.[slot] || [])) {
        const root = document.querySelector(sel);
        if (root && !root.id) out.push(sel);
      }
    }
    return out;
  });
  for (const sel of missing) {
    report(file, sel, 'id あり', 'なし', 'マウント先に id がなく記録できない');
  }

  // 実際に1問採点し、記録が増えることを確かめる。
  const grew = await page.evaluate(async () => {
    const btn = document.querySelector('.drill .btn');
    if (!btn) return null;                       // ドリルのないページは対象外
    window.BokiProgress._reset();
    btn.click();
    await new Promise((r) => setTimeout(r, 50));
    return Object.keys(window.BokiProgress.dump().drills).length;
  });
  if (grew === 0) {
    report(file, '(progress)', '記録が増える', '増えない', '採点しても学習記録に残らない');
  }
});
```

- [ ] **Step 2: ダッシュボードを検査対象に含める**

`targets()` を変える。`phase*/` の走査に加え、直下の `progress.html` を含める。

```js
function targets(args) {
  if (args.length) return args;
  const found = [];
  for (const dir of readdirSync('.', { withFileTypes: true })) {
    if (!dir.isDirectory() || !/^phase\d+$/.test(dir.name)) continue;
    for (const f of readdirSync(dir.name)) {
      if (f.endsWith('.html')) found.push(join(dir.name, f));
    }
  }
  found.sort();
  // ダッシュボードはフェーズ配下にないが、JSエラーと壊れたデータへの
  // 耐性を見る必要があるため対象に含める。
  if (existsSync('progress.html')) found.push('progress.html');
  return found;
}
```

- [ ] **Step 3: 壊れたデータへの耐性を検査する**

同じく `main()` の手前に足す。

```js
// 壊れた localStorage でもダッシュボードが開けることを確かめる。
// ここで例外が出ると、記録が壊れたときに復旧の入口ごと失われる。
CHECKS.push(async function checkDashboardRobust(page, file, errors) {
  if (!file.endsWith('progress.html')) return;
  const broken = await page.evaluate(async () => {
    localStorage.setItem('boki2:progress', '{壊れた JSON');
    const res = await fetch(location.href).then((r) => r.text()).catch(() => null);
    return res !== null;
  });
  if (!broken) return;
  await page.reload({ waitUntil: 'load' });
  const fatal = errors.filter((e) => !/favicon/i.test(e));
  if (fatal.length) {
    report(file, '(robust)', '例外なし', fatal[0],
      '壊れた記録があるとダッシュボードが開けない');
  }
});
```

- [ ] **Step 4: 検査が通ることを確認する**

```bash
npm run check
```

Expected: `OK 6 ページ、指摘なし`（`progress.html` が加わって6件）

- [ ] **Step 5: 検査が実際に落ちることを確認する**

配線をわざと切って、ゲートが検出することを確かめる。検査自体が壊れていれば、これは素通りする。

```bash
cp assets/app.js /tmp/app.js.bak
sed -i '' 's|if (drillBase) BokiProgress.record|if (false) BokiProgress.record|' assets/app.js
npm run check; echo "終了コード: $?"
cp /tmp/app.js.bak assets/app.js
npm run check
```

Expected: 1回目は `採点しても学習記録に残らない` で終了コード 1。復元後は成功

- [ ] **Step 6: Commit**

```bash
git add tools/check.mjs
git commit -m "$(cat <<'MSG'
test: 進捗記録の配線が切れていないかを機械的に検査する

記録の配線が切れても画面には何も現れない。気づくのは数週間後に
記録を書き出そうとして空だったときで、その時点でデータは戻らない。
ゲート0が mount の実行を検査するのと同じ理由で、実際に1問採点して
記録が増えることを確かめる。
MSG
)"
```

---

### Task 8: 転記スキルと進捗ログ.md

**Files:**
- Create: `.claude/skills/進捗転記/SKILL.md`
- Create: `進捗ログ.md`

**Interfaces:**
- Consumes: Task 6 の `exportJSON()` が出す JSON
- Produces: `進捗ログ.md`（日付降順の追記型）

- [ ] **Step 1: 進捗ログ.md を作る**

```markdown
# 学習記録

`progress.html` でエクスポートした JSON を Claude に渡すと、ここへ転記される。
一次情報はブラウザの `localStorage` であり、この文書はその書き出しである
（`docs/adr/0001-progress-tracking-source-of-truth.md`）。

<!-- 記録はここから下に、新しい日付が上になるよう追記する -->
```

- [ ] **Step 2: 転記スキルを作る**

`.claude/skills/進捗転記/SKILL.md` を作る。

```markdown
---
name: 進捗転記
description: progress.html からエクスポートした学習記録の JSON を 進捗ログ.md へ転記する。JSON を貼られたとき、または「進捗を転記して」と言われたときに使う。
---

# 学習記録の転記

`progress.html` のエクスポートは**常に全期間**を含む。差分は取られていない。
`進捗ログ.md` に既にある日付を二重に書かないよう、追記範囲はここで判断する。

## 手順

1. `進捗ログ.md` を読み、最も新しい日付を確認する
2. 渡された JSON の `exportedAt` を見る。`進捗ログ.md` の最新日付より古ければ、
   古いエクスポートを貼られている。転記せず、その旨を伝える
3. 最新日付より後の `sessions` / `notes` と、その期間に試行のある `drills` を抽出する
4. 日付ごとにまとめ、`進捗ログ.md` の見出し直後（新しい日付が上）に追記する

## 書式

    ## 2026-08-29（金）
    学習時間 2h56m（週計 2h56m / 目標 23h）

    - phase0/03_dentaku 完了。定数計算は演算キー2回押しの機種だと確認
    - 要復習: 勘定連絡図のアップストリーム按分

- 学習時間はその日の `sessions` の `sec` を合計する。週計は月曜起点
- メモは `notes` の `text` をそのまま箇条書きにする。要約しない。
  学習者自身の言葉が、後から読み返したときの手がかりになる
- 誤答が通算3回以上ある設問は「要復習」として明記する。
  該当する論点名は、単元HTMLの見出しか `reference/syllabus.yml` から引く

## やらないこと

- `localStorage` の内容を推測して補わない。JSON にないことは書かない
- 学習量への評価や励ましを書かない。記録は記録として残す
- 既にある日付の記述を書き換えない。追記のみ
```

- [ ] **Step 3: 転記を実際に試す**

`progress.html` でエクスポートし、その JSON をこのセッションに貼って転記させる。`進捗ログ.md` に日付が入り、二重に貼っても重複しないことを確かめる。

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/進捗転記/SKILL.md 進捗ログ.md
git commit -m "$(cat <<'MSG'
feat: 学習記録を Markdown へ転記する手順を定める

エクスポートは常に全期間を出す。どこから追記するかをブラウザ側に
持たせると、進捗ログ.md を手で直したときに両者がズレるため、
判断は転記側に置く。
MSG
)"
```

---

### Task 9: ドキュメント更新

**Files:**
- Modify: `教材制作ルール.md`（共通アセット節、品質ゲート節）
- Modify: `CLAUDE.md`（進捗の一次情報）
- Modify: `README.md`（構成）
- Modify: `.claude/agents/boki-author.md`（`data-note` をテンプレートへ）

- [ ] **Step 1: 教材制作ルール.md を更新する**

「共通アセットが提供するもの」の節に足す。

```markdown
### 学習メモ

    <div data-note></div>

その位置にメモ欄が生える。書かれた内容は単元と日時に紐づいて記録される。
各単元に1つ置く。

### 学習記録（著者が書くことはない）

ドリルの正誤・チェックの状態・学習時間は `assets/app.js` が自動で記録する。
単元HTMLに記録用のコードを書く必要はない。ただし **`mount()` 先の要素には
必ず `id` を付ける**。id がないと記録先が決まらず、その設問は記録されない
（品質ゲート9が検出する）。
```

「品質ゲート」の節に9番を足す。

```markdown
9. **進捗記録**：`BokiProgress` が読み込まれ、`mount` 先に `id` があり、
   採点すると記録が増えるか。記録の配線は切れても画面に現れないため機械的に見る
```

節の冒頭に、7・8と9の実行場所の違いを1行で書く。

```markdown
1〜6 と 9 は `npm run check`（機械的検査）、7 と 8 はサブエージェント（判断を要する検査）。
```

- [ ] **Step 2: CLAUDE.md を更新する**

「一次情報」の表に行を足す。

```markdown
| 学習の進捗 | `progress.html`（ブラウザの localStorage）。`進捗ログ.md` はその書き出し |
```

「公開前に必ず通す」の後ろに節を足す。

```markdown
## 学習の進捗

進捗の一次情報は `progress.html` が持つブラウザの `localStorage` である。
`進捗ログ.md` はそこからの書き出しであり、食い違ったときは localStorage を正とする。
転記は `.claude/skills/進捗転記/` の手順で行う。決定の背景は
`docs/adr/0001-progress-tracking-source-of-truth.md`。
```

- [ ] **Step 3: README.md を更新する**

「構成」に `progress.html`、`進捗ログ.md`、`assets/`、`docs/` を反映する。`phase0/assets/` の記述があれば `assets/` に直す。

- [ ] **Step 4: boki-author.md を更新する**

単元HTMLのテンプレートに `<div data-note></div>` を含め、`mount()` 先に `id` を必ず付ける旨を書く。

- [ ] **Step 5: 記述と実態が一致することを確認する**

```bash
grep -rn "phase0/assets" --include="*.md" . | grep -v node_modules | grep -v docs/design
npm run check && npm test
```

Expected: 旧パスの残りがなく、検査も通る

- [ ] **Step 6: Commit**

```bash
git add 教材制作ルール.md CLAUDE.md README.md .claude/agents/boki-author.md
git commit -m "$(cat <<'MSG'
docs: 進捗記録の所在と単元HTMLの約束を明文化する

mount 先に id を付ける約束は、守られないと該当設問の記録が永久に
残らない。品質ゲート9で機械的に検出するが、書く時点で知っている
ほうが手戻りが少ない。
MSG
)"
```

---

## 完了条件

- [ ] `npm run check` が `OK 6 ページ、指摘なし`
- [ ] `npm test` が通る
- [ ] `phase0` の単元でドリルを解き、`progress.html` の要復習に現れる
- [ ] エクスポートした JSON が `進捗ログ.md` へ転記できる
- [ ] `phase0/assets/` と `phase1/assets/` が存在しない
