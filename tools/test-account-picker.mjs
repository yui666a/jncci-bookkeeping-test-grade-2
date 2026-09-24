// 勘定科目の検索：日本語入力に切り替えず、ローマ字のまま打っても科目を引ける。
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const YOMI = readFileSync(resolve('assets/yomi.js'), 'utf8');
const APP = readFileSync(resolve('assets/app.js'), 'utf8');
const ACCOUNTS = ['リース資産', '現金', '売掛金', '未払金', '雑損', '支払手形', '仕入', '建設仮勘定'];
let failures = 0;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.route('**/*', (route) => route.fulfill({
    status: 200, contentType: 'text/html',
    body: '<!doctype html><meta charset="utf-8"><body><div id="d"></div><script>' + YOMI + '</script><script>' + APP + '</script>'
      + '<script>BokiJournal.mount("#d", { title: "t", accounts: ' + JSON.stringify(ACCOUNTS)
      + ', questions: [{ text: "q", debit: [["現金", 1]], credit: [["売掛金", 1]] }] });</script>',
  }));
  await page.goto('https://example.test/phase0/test.html');

  const IN = '#d .apick__in >> nth=0';
  async function shown(query) {
    await page.fill(IN, query);
    return page.$$eval('#d .apick__list.open .apick__it', (els) => els.map((e) => e.textContent));
  }
  async function expect(query, want) {
    const got = await shown(query);
    if (JSON.stringify(got) === JSON.stringify(want)) return;
    failures++;
    console.log('NG 「' + query + '」  期待=' + JSON.stringify(want) + '  実際=' + JSON.stringify(got));
  }

  await expect('urikake', ['売掛金']);
  await expect('URIKAKE', ['売掛金']);
  await expect('urik', ['売掛金']);          // 打ちかけの子音は捨てる
  await expect('genkin', ['現金']);
  await expect('shiharai', ['支払手形']);    // ヘボン式
  await expect('siharai', ['支払手形']);     // 訓令式
  await expect('mibarai', ['未払金']);
  await expect('zasson', ['雑損']);          // 促音
  await expect('kensetsukari', ['建設仮勘定']);
  await expect('kensetukari', ['建設仮勘定']);
  await expect('shiire', ['仕入']);
  await expect('うりかけ', ['売掛金']);      // かな・漢字は従来どおり
  await expect('売掛', ['売掛金']);
  await expect('kake', ['売掛金']);
  await expect('ri-su', ['リース資産']);
  await expect('kin', ['現金', '売掛金', '未払金']);
} finally {
  await browser.close();
}
console.log(failures ? 'NG ' + failures + ' 件' : 'OK 全件');
process.exit(failures ? 1 : 0);
