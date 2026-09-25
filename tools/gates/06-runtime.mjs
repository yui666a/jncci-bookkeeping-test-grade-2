import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { report } from '../lib.mjs';

// ゲート6：JSエラー、id重複、data-key重複、リンク切れ、外部参照、
// 420px幅の横スクロール。
export async function checkRuntime(page, file, errors) {
  for (const e of errors) report(file, '(runtime)', 'エラーなし', e, 'JSエラー');

  const found = await page.evaluate(() => {
    const dups = (list) => {
      const seen = {}, out = [];
      for (const v of list) {
        if (!v) continue;
        seen[v] = (seen[v] || 0) + 1;
        if (seen[v] === 2) out.push(v);
      }
      return out;
    };
    return {
      ids: dups([...document.querySelectorAll('[id]')].map((e) => e.id)),
      keys: dups([...document.querySelectorAll('[data-key]')].map((e) => e.dataset.key)),
      rel: [...document.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href'))
        .filter((h) => h && !h.startsWith('#') && !/^[a-z]+:/.test(h)),
      deadAnchors: [...document.querySelectorAll('a[href^="#"]')]
        .map((a) => a.getAttribute('href').slice(1))
        .filter((h) => h && !document.getElementById(h)),
      external: [...document.querySelectorAll('[src], link[href]')]
        .map((e) => e.getAttribute('src') || e.getAttribute('href'))
        .filter((u) => u && /^https?:/.test(u)),
    };
  });

  for (const id of found.ids) report(file, id, '一意', '重複', 'id が重複');
  for (const k of found.keys) {
    report(file, k, '一意', '重複', 'data-key が重複（進捗が混線する）');
  }
  for (const a of found.deadAnchors) {
    report(file, '#' + a, '存在する', 'なし', 'ページ内リンクの飛び先がない');
  }
  for (const u of found.external) {
    report(file, u, '外部参照なし', u, '外部URLを参照している（オフラインで壊れる）');
  }

  for (const href of found.rel) {
    let path;
    try {
      path = decodeURIComponent(href.split('#')[0].split('?')[0]);
    } catch (e) {
      report(file, href, '正しいURLエンコード', href, 'リンクの % エスケープが壊れている');
      continue;
    }
    if (!existsSync(resolve(dirname(file), path))) {
      report(file, href, '存在する', 'なし', 'リンク切れ');
    }
  }

  // 420px 幅での横スクロール。.grid2 内の表が典型的な原因。
  // この幅ではページ送りが働き、表示中の1ページしか描画されない。隠れた
  // ページの表を見落とさないよう、利用者と同じく次へを押して全ページを見る。
  // 幅が変わると見ていた節のページから始まる。スクロール位置や URL に
  // 頼らず、前へを押し切って先頭のページから見る。
  await page.setViewportSize({ width: 420, height: 900 });
  await page.waitForFunction(() => !document.querySelector('.pager')
    || document.documentElement.classList.contains('is-paged'));
  const prev = page.locator('.is-paged .pager__btn:first-child:not([disabled])');
  while (await prev.count()) await prev.click();
  for (;;) {
    const over = await overflow(page);
    if (over) {
      const where = await page.evaluate(() => {
        const c = document.querySelector('.is-paged .pager__count');
        return c ? '（ページ ' + c.textContent + '）' : '';
      });
      report(file, (over.wide.join(',') || '(要素不明)') + where, over.clientWidth, over.scrollWidth,
        '420px幅で横スクロールが出る');
    }
    const next = page.locator('.is-paged .pager__btn:last-child:not([disabled])');
    if (!await next.count()) break;
    await next.click();
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

function overflow(page) {
  return page.evaluate(() => {
    const d = document.documentElement;
    if (d.scrollWidth <= d.clientWidth) return null;
    // 横スクロールする入れ物（表や図を包む overflow-x:auto）の中で幅を
    // 超える要素は、設計上そうなっているため原因ではない。祖先に
    // スクロールする入れ物を持たない要素だけを挙げる。
    const scrolls = (e) => {
      const o = getComputedStyle(e).overflowX;
      return o === 'auto' || o === 'scroll';
    };
    const all = [...document.querySelectorAll('*')].filter((e) => {
      if (e.getBoundingClientRect().right <= d.clientWidth + 1) return false;
      for (let a = e.parentElement; a && a !== d; a = a.parentElement) {
        if (scrolls(a)) return false;
      }
      return true;
    });
    const wide = all
      .filter((e) => !all.some((o) => o !== e && o.contains(e)))
      .slice(0, 3)
      // SVG要素の className は文字列ではなく SVGAnimatedString のため、
      // String() すると '[object SVGAnimatedString]' になる。
      .map((e) => {
        const cls = typeof e.className === 'string' ? e.className
          : (e.getAttribute('class') || '');
        return e.tagName.toLowerCase() + (cls ? '.' + cls.split(' ')[0] : '');
      });
    return { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth, wide };
  });
}
