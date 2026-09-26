import { report } from '../lib.mjs';

// ゲート14：ページ送りの区切り。app.js は .wrap 直下の h2[id] でページを
// 分けるため、入れ子の h2 や id のない h2 は区切りにならず、前の節の
// ページに黙って吸収される。画面は壊れて見えないので機械的に見る。
export async function checkPager(page, file) {
  const bad = await page.evaluate(() => {
    if (!document.querySelector('.toc')) return null;
    const wrap = document.querySelector('.wrap');
    if (!wrap) return [{ id: '.wrap', why: '.wrap がない' }];
    return [...document.querySelectorAll('h2')].flatMap((h) => {
      const id = h.id || h.textContent.trim().slice(0, 20);
      if (h.parentElement !== wrap) return [{ id, why: '.wrap の直下にない' }];
      if (!h.id) return [{ id, why: 'id がない' }];
      return [];
    });
  });
  for (const b of bad || []) {
    report(file, b.id, '.wrap 直下の h2[id]', b.why, 'ページ送りの区切りにならない見出し');
  }
}
