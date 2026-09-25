// 狭い画面のページ送りの仕様。教材HTMLに依存せず、app.js と style.css だけを読んで検査する。
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { eq, failedCount } from './lib.mjs';

const APP = readFileSync(resolve('assets/app.js'), 'utf8');
const CSS = readFileSync(resolve('assets/style.css'), 'utf8');

// 節を画面より高くする。短いと見出しを画面上端まで送れず、見ていた節を判定できない。
const UNIT = '<!doctype html><meta charset="utf-8"><style>' + CSS + ' .wrap > p { min-height: 900px; }</style><body>'
  + '<div class="topbar"><div class="topbar__in"><button class="theme-btn" type="button"></button></div></div>'
  + '<div class="wrap">'
  + '<div class="hero"><h1>単元</h1></div>'
  + '<div class="toc"><ol><li><a href="#s1">一</a></li><li><a href="#s2">二</a></li>'
  + '<li><a href="#s3">三</a></li></ol></div>'
  + '<h2 id="s1"><span class="num">1</span>はじめの節</h2><p id="p1">一の本文</p>'
  + '<h2 id="s2"><span class="num">2</span>次の節</h2><p>二の本文 <a id="ref" href="#deep">三の途中へ</a></p>'
  + '<h2 id="s3"><span class="num">3</span>最後の節</h2><p>三の本文</p><p id="deep">三の途中</p>'
  + '</div><script>' + APP + '</script>';

const NARROW = { width: 390, height: 800 };
const WIDE = { width: 1280, height: 800 };

async function open(ctx, hash) {
  const page = await ctx.newPage();
  await page.route('**/*', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: UNIT }));
  await page.goto('https://example.test/phase1/99_test.html' + (hash || ''));
  return page;
}

// 見えている本文と、下部バーの表示。
function state(page) {
  return page.evaluate(() => {
    const vis = [...document.querySelectorAll('.wrap > *')]
      .filter((e) => e.offsetParent !== null).map((e) => e.id || e.className);
    const bar = document.querySelector('.pager');
    return {
      vis,
      bar: getComputedStyle(bar).display === 'none' ? null
        : bar.querySelector('.pager__count').textContent + ' ' + bar.querySelector('.pager__title').textContent,
      hash: location.hash,
    };
  });
}

const browser = await chromium.launch();
try {
  {
    const ctx = await browser.newContext({ viewport: NARROW });
    const page = await open(ctx);
    eq(await state(page), { vis: ['hero', 'toc'], bar: '1 / 4 表紙・目次', hash: '' },
      '狭い画面では表紙と目次だけを1ページ目に出す');

    await page.click('.pager__btn >> text=次へ');
    eq(await state(page), { vis: ['s1', 'p1'], bar: '2 / 4 はじめの節', hash: '#s1' },
      '次へで最初の節を出し、見出し番号を除いた題を示す');

    await page.click('.pager__btn >> text=前へ');
    eq((await state(page)).bar, '1 / 4 表紙・目次', '前へで戻る');

    await page.click('.toc a[href="#s3"]');
    eq((await state(page)).bar, '4 / 4 最後の節', '目次のリンクで飛び先のページを開く');
    eq(await page.$eval('.pager__btn:last-child', (b) => b.disabled), true, '最後のページでは次へを押せない');

    await page.click('.pager__btn >> text=前へ');
    await page.click('#ref');
    eq(await state(page), { vis: ['s3', '', 'deep'], bar: '4 / 4 最後の節', hash: '#s3' },
      '節の途中を指すリンクも、その要素を含むページを開く');

    await page.reload();
    eq((await state(page)).bar, '4 / 4 最後の節', '再読み込みしても同じページ');

    const again = await open(ctx);
    eq((await state(again)).bar, '4 / 4 最後の節', 'URLに節がなくても最後に見ていたページから始める');

    const direct = await open(ctx, '#s2');
    eq((await state(direct)).bar, '3 / 4 次の節', 'URLの節を最後に見ていたページより優先する');

    await direct.click('.pager-mode');
    eq(await state(direct), { vis: ['hero', 'toc', 's1', 'p1', 's2', '', 's3', '', 'deep'], bar: null, hash: '#s2' },
      '全体表示に切り替えると全節を出してバーを消す');
    await direct.reload();
    eq((await state(direct)).bar, null, '全体表示の選択は再読み込み後も残る');
    await direct.click('.pager-mode');
    eq((await state(direct)).bar !== null, true, 'ページ送りに戻せる');
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({ viewport: WIDE });
    const page = await open(ctx);
    const s = await state(page);
    eq([s.vis.length, s.bar], [9, null], '広い画面では従来どおり1枚で出す');
    eq(await page.$eval('.pager-mode', (b) => getComputedStyle(b).display), 'none',
      '広い画面では切り替えボタンを出さない');

    await page.evaluate(() => document.getElementById('s2').scrollIntoView({ behavior: 'instant' }));
    await page.setViewportSize(NARROW);
    await page.waitForFunction(() => document.documentElement.classList.contains('is-paged'));
    eq((await state(page)).bar, '3 / 4 次の節', '幅が狭まったら見ていた節のページを開く');
    await page.setViewportSize(WIDE);
    await page.waitForFunction(() => !document.documentElement.classList.contains('is-paged'));
    eq((await state(page)).vis.length, 9, '幅が広がったら全節に戻す');

    // 狭い画面で #s2 を開いたあと、広い画面で s3 まで読み進めてから戻す（端末の回転）。
    await page.evaluate(() => document.getElementById('s3').scrollIntoView({ behavior: 'instant' }));
    await page.setViewportSize(NARROW);
    await page.waitForFunction(() => document.documentElement.classList.contains('is-paged'));
    eq((await state(page)).bar, '4 / 4 最後の節', 'URLに残った節より、読み進めた節のページを開く');
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({ viewport: NARROW });
    const page = await open(ctx, '#s1');
    await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
    await page.click('.pager__btn >> text=次へ');
    eq(await page.evaluate(() => scrollY), 0, 'めくった直後にページの先頭にいる（流れて見えない）');

    await page.emulateMedia({ media: 'print' });
    eq(await page.evaluate(() => [getComputedStyle(document.querySelector('.pager')).display,
      [...document.querySelectorAll('.wrap > *')].every((e) => getComputedStyle(e).display !== 'none')]),
      ['none', true], '印刷では全ページを出し、バーを出さない');
    await ctx.close();
  }

  {
    // 他のタブや古い版が書いた値でもページ送りを止めない。
    const ctx = await browser.newContext({ viewport: NARROW });
    const page = await open(ctx);
    for (const bad of ['"str"', '5', 'true', '{"pos":3}', '{broken']) {
      await page.evaluate((v) => localStorage.setItem('boki2:pager', v), bad);
      await page.reload();
      eq((await state(page)).bar, '1 / 4 表紙・目次', '壊れた保存値 ' + bad + ' でも動く');
    }
    await ctx.close();
  }

  {
    // 目次のない一覧ページ（phase*/index.html など）は区切る単位がない。
    const ctx = await browser.newContext({ viewport: NARROW });
    const page = await ctx.newPage();
    await page.route('**/*', (route) => route.fulfill({ status: 200, contentType: 'text/html',
      body: UNIT.replace(/<div class="toc">.*?<\/div>/, '') }));
    await page.goto('https://example.test/phase1/index.html');
    eq(await page.evaluate(() => [!!document.querySelector('.pager'),
      document.documentElement.classList.contains('is-paged')]), [false, false], '目次のないページには付けない');
    await ctx.close();
  }
} finally {
  await browser.close();
}

const failures = failedCount();
if (failures) { console.log('\nNG ' + failures + ' 件'); process.exit(1); }
console.log('OK ページ送り');
