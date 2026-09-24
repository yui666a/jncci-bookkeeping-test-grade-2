import { report } from '../lib.mjs';

// ゲート5：.toc のアンカーと見出しidの対応。
export async function checkToc(page, file) {
  const data = await page.evaluate(() => ({
    anchors: [...document.querySelectorAll('.toc a[href^="#"]')]
      .map((a) => a.getAttribute('href').slice(1)),
    ids: [...document.querySelectorAll('h2[id]')].map((h) => h.id),
  }));

  const ids = new Set(data.ids);
  for (const a of data.anchors) {
    if (!ids.has(a)) {
      report(file, '#' + a, '対応する h2[id]', 'なし', '目次のリンク先がない');
    }
  }
  const linked = new Set(data.anchors);
  for (const id of data.ids) {
    if (!linked.has(id)) {
      report(file, '#' + id, '目次に載る', '載っていない', '見出しが目次にない');
    }
  }
}
