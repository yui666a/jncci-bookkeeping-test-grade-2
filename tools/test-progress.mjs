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

  // 日時はローカルタイムゾーン付き。toISOString() の UTC だと、深夜に
  // 学習した記録が前日にずれて見える。
  await withApp(browser, 'phase0/x.html', async (page) => {
    eq(await page.evaluate(() => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/
      .test(BokiProgress.now())),
       true, '日時がローカルタイムゾーン付きISO 8601');
  });
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

  // チェックは単元ごとに入れ子で持つ。同名キーが別単元にあっても混ざらない。
  await withApp(browser, 'phase0/04_junbi.html', async (page) => {
    eq(await page.evaluate(() => {
      BokiProgress._reset();
      BokiProgress.check('phase0/04_junbi', 'w1u1-1', true);
      BokiProgress.check('phase0/index', 'w1u1-1', false);
      const c = BokiProgress.dump().checks;
      return [c['phase0/04_junbi']['w1u1-1'], c['phase0/index']['w1u1-1']]; }),
       [true, false], '同名キーが単元別に分かれる');
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

  // 移行は既存の記録を上書きしない。旧キーのほうが古い情報である。
  await withApp(browser, 'phase0/04_junbi.html', async (page) => {
    eq(await page.evaluate(() => {
      localStorage.clear();
      BokiProgress.check('phase0/04_junbi', 'k', false);
      localStorage.setItem('boki2:04_junbi:check', JSON.stringify({ k: true }));
      BokiProgress.migrateLegacy();
      return BokiProgress.dump().checks['phase0/04_junbi'].k; }),
       false, '移行が新しい記録を上書きしない');
  });
} finally {
  await browser.close();
}

if (failures) { console.log('\nNG ' + failures + ' 件'); process.exit(1); }
console.log('OK BokiProgress');
