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
  // 極端に短い区間は記録しない。ページを開いて即座に閉じた分が
  // 大量に積もると、集計が読めなくなる。
  await withApp(browser, 'phase0/03_dentaku.html', async (page) => {
    eq(await page.evaluate(() => {
      BokiProgress._reset();
      BokiProgress.addSession('phase0/03_dentaku', BokiProgress.now(), 3);
      BokiProgress.addSession('phase0/03_dentaku', BokiProgress.now(), 120);
      const s = BokiProgress.dump().sessions;
      return [s.length, s[0].sec, s[0].unit]; }),
       [1, 120, 'phase0/03_dentaku'], '10秒未満の区間は捨てる');
  });

  // 秒は整数に丸める。小数のまま貯めると集計時に誤差が積もる。
  await withApp(browser, 'phase0/03_dentaku.html', async (page) => {
    eq(await page.evaluate(() => {
      BokiProgress._reset();
      BokiProgress.addSession('u', BokiProgress.now(), 61.7);
      return BokiProgress.dump().sessions[0].sec; }),
       62, '秒が整数に丸められる');
  });

  // 非可視化で区間が確定する。実時間ではなく能動時間を測る。
  await withApp(browser, 'phase0/03_dentaku.html', async (page) => {
    eq(await page.evaluate(async () => {
      BokiProgress._reset();
      BokiProgress.__testTick(-60);            // 60秒前に開始したことにする
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise((r) => setTimeout(r, 30));
      const s = BokiProgress.dump().sessions;
      return [s.length, s.length ? s[0].sec >= 55 && s[0].sec <= 65 : null]; }),
       [1, true], '非可視化で区間が確定する');
  });

  // 直近の操作から離れた時間は加算しない。タブを開いたまま離席した
  // 8時間が学習時間になると、記録が意味を失う。
  await withApp(browser, 'phase0/03_dentaku.html', async (page) => {
    eq(await page.evaluate(async () => {
      BokiProgress._reset();
      BokiProgress.__testTick(-3600, -3600);   // 1時間前に開始し、以後操作なし
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise((r) => setTimeout(r, 30));
      const s = BokiProgress.dump().sessions;
      // 操作が途絶えてから5分で打ち切られるので、1時間ではなく5分前後
      return s.length === 1 && s[0].sec <= 5 * 60 + 5; }),
       true, '放置した時間は加算しない');
  });
  // 空のメモは記録しない。前後の空白は落とす。
  await withApp(browser, 'phase0/02_kanjo-renrakuzu.html', async (page) => {
    eq(await page.evaluate(() => {
      BokiProgress._reset();
      BokiProgress.note('  ');
      BokiProgress.note('');
      BokiProgress.note('  按分が分からない  ');
      const n = BokiProgress.dump().notes;
      return [n.length, n[0].text, n[0].unit, typeof n[0].at]; }),
       [1, '按分が分からない', 'phase0/02_kanjo-renrakuzu', 'string'],
       '空メモを捨て、単元を紐づける');
  });
  // 要復習の判定。progress.html の一覧と review.html の出題対象が
  // 同じ規則で決まることを、両ページに依存せずここで固定する。
  await withApp(browser, 'phase0/x.html', async (page) => {
    const seed = (drills) => page.evaluate((d) => {
      BokiProgress._reset();
      const p = BokiProgress.dump();
      for (const [id, oks] of Object.entries(d)) {
        p.drills[id] = { attempts: oks.map((ok, i) => ({ at: '2026-01-0' + (i + 1), ok })) };
      }
      localStorage.setItem('boki2:progress', JSON.stringify(p));
      return BokiProgress.due().map((r) => r.id + ':' + r.streak).sort();
    }, drills);

    eq(await seed({ a: [true], b: [false], c: [false, true] }),
       ['b:0', 'c:1'], '誤答のない設問は要復習にならない');

    eq(await seed({ a: [false, true, true], b: [false, true, true, true] }),
       ['a:2'], '3回続けて正解すると要復習から外れる');

    eq(await seed({ a: [false, true, true, false] }),
       ['a:0'], '途中で間違えると連続は振り出しに戻る');

    // 通算で数えると、正解の貯金が誤答で消えず、直前に間違えた設問が
    // 復習から落ちる。連続で数えていることを固定する。
    eq(await seed({ a: [true, true, true, true, true, false] }),
       ['a:0'], '正解の貯金では卒業しない');

    eq(await page.evaluate(() => BokiProgress.CLEAR_STREAK), 3, '卒業に要する連続正解数');

    eq(await page.evaluate(() => {
      BokiProgress._reset();
      const p = BokiProgress.dump();
      p.drills['a'] = { attempts: [{ at: '2026-01-02', ok: false }, { at: '2026-01-05', ok: false }] };
      localStorage.setItem('boki2:progress', JSON.stringify(p));
      return BokiProgress.due()[0].last; }),
       '2026-01-05', 'last は最後に間違えた日時');
  });
} finally {
  await browser.close();
}

if (failures) { console.log('\nNG ' + failures + ' 件'); process.exit(1); }
console.log('OK BokiProgress');
