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
} finally {
  await browser.close();
}

if (failures) { console.log('\nNG ' + failures + ' 件'); process.exit(1); }
console.log('OK BokiProgress');
