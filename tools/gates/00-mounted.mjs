import { readFileSync } from 'node:fs';
import { report } from '../lib.mjs';

// ゲート0：ドリルが実際に mount されたか。
// 検査はページのJSランタイムから設問を読む。app.js の読み込みに失敗すると
// 捕捉が空になり、以降の全ゲートが「設問0件」を検査して素通りする。
// HTMLソース上の mount 呼び出し数と実際の捕捉数が食い違えば、そこで止める。
export async function checkMounted(page, file, errors) {
  const captured = await page.evaluate(() => {
    const c = window.__captured || {};
    return Object.values(c).reduce((a, v) => a + v.length, 0);
  });
  const declared = (readFileSync(file, 'utf8')
    .match(/\bBoki(?:Journal|Quiz|Num|Fill)\s*\.\s*mount\s*\(/g) || []).length;
  if (declared !== captured) {
    report(file, '(mount)', declared, captured,
      'mount 呼び出しが実行されていない（アセット読込の失敗か）');
  }
}
