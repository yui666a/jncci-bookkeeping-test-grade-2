// 出題区分表の2級論点と、教材がカバーする論点の差分を出す。
// meta の読み取りに正規表現を使わず、Playwright で DOM から読む。
//
// loadYaml は check.mjs のものを使う。同じ読み取りを2箇所に置くと、
// 一方だけ直したときに黙ってずれる。
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { loadYaml } from './check.mjs';

const topics = loadYaml('reference/syllabus.yml').topics;
// 2級の教材が扱うべき論点。3級は前提知識であり Phase 0 の総復習で扱う。
//
// grade が 3 でも limit_grade2 を持つ論点は、3級の範囲に2級で上乗せがある
// ことを意味する（例：商品有高帳は3級だが、総平均法は2級で加わる）。
// 上乗せ分は2級で初めて学ぶので、grade===2 だけを見ると取りこぼす。
const required = topics.filter((t) => t.grade === 2 || t.limit_grade2);

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
  // 'なし' は「2級論点を扱わない単元」の明示。書き忘れの空メタと区別するため
  // check.mjs のゲート7が要求する値であり、論点IDではない。
  if (meta.trim() === 'なし') continue;
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
