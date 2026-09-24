// 金額入力欄の仕様：3桁区切りを自動で入れ、区切りの位置で削除しても桁が消える。
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const APP = readFileSync(resolve('assets/app.js'), 'utf8');
let failures = 0;

function eq(actual, expected, label) {
  if (actual === expected) return;
  failures++;
  console.log('NG ' + label + '  期待=' + JSON.stringify(expected) + '  実際=' + JSON.stringify(actual));
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.route('**/*', (route) => route.fulfill({
  status: 200, contentType: 'text/html',
  body: '<!doctype html><meta charset="utf-8"><body><div id="d"></div><script>' + APP + '</script>'
    + '<script>BokiNum.mount("#d", { title: "t", questions: [{ text: "q", answer: 1 }] });</script>',
}));
await page.goto('https://example.test/phase0/test.html');

const AMT = '#d input.amt';

// キャレットを指定位置に置いてキーを押し、結果の値とキャレット位置を返す。
async function press(initial, caret, key) {
  await page.fill(AMT, '');
  await page.type(AMT, initial);
  await page.$eval(AMT, (el, c) => el.setSelectionRange(c, c), caret);
  await page.press(AMT, key);
  return page.$eval(AMT, (el) => el.value + '|' + el.selectionStart);
}

eq(await page.$eval(AMT, (el) => { el.value = ''; return el.value; }), '', '前提: 欄がある');

// 入力すると3桁区切りが入る。
await page.fill(AMT, '');
await page.type(AMT, '123456');
eq(await page.$eval(AMT, (el) => el.value), '123,456', '入力中に区切りが入る');

// 区切りの直後でBackspaceを押すと、区切りではなくその左の桁が消える。
// キャレットは右側の桁数（456の3桁）を保つ位置に戻るため、区切りの直後になる。
eq(await press('123456', 4, 'Backspace'), '12,456|3', '区切り直後のBackspaceで左の桁が消える');

// 区切りの直前でDeleteを押すと、区切りではなくその右の桁が消える。
eq(await press('123456', 3, 'Delete'), '12,356|4', '区切り直前のDeleteで右の桁が消える');

// 通常の削除は従来どおり。
eq(await press('123456', 7, 'Backspace'), '12,345|6', '末尾のBackspaceは桁を消す');
eq(await press('123456', 0, 'Delete'), '23,456|0', '先頭のDeleteは桁を消す');

// 区切りをまたいで連打しても必ず1桁ずつ減る。
await page.fill(AMT, '');
await page.type(AMT, '1234567');
for (let i = 0; i < 7; i++) await page.press(AMT, 'Backspace');
eq(await page.$eval(AMT, (el) => el.value), '', 'Backspace連打で全桁消える');

// 日本語入力のまま打った負号や会計の▲△も、負の数として残る。
for (const mark of ['-', '－', '−', 'ー', '▲', '△']) {
  await page.fill(AMT, '');
  await page.type(AMT, mark + '26000');
  eq(await page.$eval(AMT, (el) => el.value), '-26,000', '負号「' + mark + '」が残る');
}

await browser.close();
console.log(failures ? 'NG ' + failures + ' 件' : 'OK 全件');
process.exit(failures ? 1 : 0);
