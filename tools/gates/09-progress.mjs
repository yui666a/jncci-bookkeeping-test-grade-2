import { readFileSync, existsSync } from 'node:fs';
import { report } from '../lib.mjs';

// ゲート9：進捗記録の健全性。
// 記録の配線が切れても画面には何も現れない。気づくのは数週間後、記録を
// 書き出そうとして空だったときであり、そのデータはもう戻らない。
// ゲート0が mount の実行を検査するのと同じ理由で、機械的に見る。
export async function checkProgressWiring(page, file, errors) {
  const ready = await page.evaluate(() => typeof window.BokiProgress === 'object');
  if (!ready) {
    report(file, '(progress)', 'BokiProgress あり', 'なし',
      '学習記録が読み込まれていない');
    return;
  }

  // マウント先に id がないと記録先が決まらず、その設問は永久に記録されない。
  const missing = await page.evaluate(() => {
    const out = [];
    for (const slot of ['journal', 'quiz', 'num', 'fill']) {
      for (const { sel } of (window.__captured?.[slot] || [])) {
        const root = document.querySelector(sel);
        if (root && !root.id) out.push(sel);
      }
    }
    return out;
  });
  for (const sel of missing) {
    report(file, sel, 'id あり', 'なし', 'マウント先に id がなく記録できない');
  }

  // 全ドリルの全設問を実際に解いて採点し、設問ごとに記録が増えることを
  // 確かめる。設定の検査だけでは、配線が外れていても素通りする。先頭の
  // 1問だけでは、2つ目以降のドリルや設問の採点で起きる例外を見落とす。
  //
  // 解答せずにボタンを押すと、BokiQuiz は「選択肢を選んでください」で
  // 早期に戻り採点しない。記録がないのが正しい挙動なので、必ず解答してから
  // 押す。ドリルの種類ごとに解答の与え方が違う。
  const before = errors.length;
  const unrecorded = await page.evaluate(async () => {
    window.BokiProgress._reset();
    const out = [];
    for (const drill of document.querySelectorAll('.drill')) {
      [...drill.querySelectorAll('.q')].forEach((q, i) => {
        const radio = q.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;          // BokiQuiz
        for (const sel of q.querySelectorAll('select')) {
          if (sel.options.length > 1) sel.selectedIndex = 1;   // BokiJournal
        }
        for (const inp of q.querySelectorAll('input[type="text"]')) {
          inp.value = '1';                        // BokiNum / BokiFill / 金額欄
        }
        const btn = q.querySelector('.btn:not(.btn--ghost)');
        if (btn) btn.click();
        const id = drill.id + '/q' + (i + 1);
        if (!Object.keys(window.BokiProgress.dump().drills).some((k) => k.endsWith('#' + id))) {
          out.push(id);
        }
      });
    }
    await new Promise((r) => setTimeout(r, 60));
    return out;
  });
  for (const id of unrecorded) {
    report(file, id, '記録が増える', '増えない', '採点しても学習記録に残らない');
  }
  for (const e of errors.slice(before)) {
    report(file, '(progress)', 'エラーなし', e, '採点でJSエラー');
  }
}

// 壊れた記録でもダッシュボードが開けることを確かめる。ここで例外が出ると、
// 記録が壊れたときに復旧の入口ごと失われる。
export async function checkDashboardRobust(page, file, errors) {
  if (!/(^|\/)(progress|review)\.html$/.test(file)) return;

  // 壊れ方を1種類しか試さないと、JSON として読めない場合しか通らない。
  // 実際に描画を止めるのは「読めるが形が違う」記録のほうで、こちらは
  // 画面上「記録がない」ようにしか見えず、壊れたことに気づけない。
  const BROKEN = [
    ['壊れたJSON', '{壊れた JSON'],
    ['drills が配列', '{"version":1,"drills":[]}'],
    ['drill値が null', '{"version":1,"drills":{"phase0/x#d/q1":null}}'],
    ['attempts が無い', '{"version":1,"drills":{"phase0/x#d/q1":{}}}'],
    ['attempts が配列でない', '{"version":1,"drills":{"phase0/x#d/q1":{"attempts":1}}}'],
    ['attempts に null 要素', '{"version":1,"drills":{"phase0/x#d/q1":{"attempts":[null]}}}'],
    ['sessions が配列でない', '{"version":1,"sessions":3}'],
  ];

  // 実在する設問への誤答を1件混ぜた、正常な記録も試す。壊れた記録だけを
  // 見ていると、復習ページは常に「復習する設問はありません」で終わり、
  // 再出題のコードが一度も動かないまま素通りする。
  const bank = existsSync('assets/drills.json')
    ? JSON.parse(readFileSync('assets/drills.json', 'utf8')) : { units: {} };
  const unit = Object.keys(bank.units)[0];
  const root = unit && Object.keys(bank.units[unit].drills)[0];
  if (root) {
    BROKEN.push(['正常な要復習', JSON.stringify({
      version: 1, sessions: [], checks: {}, notes: [],
      drills: { [unit + '#' + root + '/q1']:
        { attempts: [{ at: '2026-01-01T00:00:00+09:00', ok: false }] } },
    })]);
  }

  for (const [label, raw] of BROKEN) {
    await page.evaluate((v) => localStorage.setItem('boki2:progress', v), raw);
    errors.length = 0;
    // 復習ページは設問バンクを非同期に読む。読み終わる前に見ると、
    // 描画中に投げる例外を取りこぼす。固定時間の待ちでは、遅い環境で
    // 読み終わる前に見てしまう。
    await page.reload({ waitUntil: 'networkidle' });
    const fatal = errors.filter((e) => !/favicon/i.test(e));
    if (fatal.length) {
      report(file, '(robust)', '例外なし', fatal[0],
        '壊れた記録（' + label + '）があると画面が開けない');
    }

    // 例外が出なくても、集計が丸ごと描かれないなら壊れている。
    // progress.html は記録が空でも「まだ記録がありません」を出す。
    const blank = await page.evaluate(() => {
      const ids = ['total', 'units', 'notes', 'review'];
      return ids.filter((id) => {
        const n = document.getElementById(id);
        return n && !n.textContent.trim();
      });
    });
    if (blank.length) {
      report(file, '(robust)', '空でも案内を出す', blank.join(','),
        '壊れた記録（' + label + '）で節が白紙になる');
    }

    // 復習ページは、要復習が1件あるなら実際に出題されなければならない。
    // 何も描かれないまま例外も出ない状態は、検査としては通ってしまう。
    if (label === '正常な要復習' && /review\.html$/.test(file)) {
      const n = await page.evaluate(
        () => document.querySelectorAll('#drills .q').length);
      if (n !== 1) {
        report(file, '(robust)', '1問出題', n + '問',
          '要復習が1件あるのに再出題されない');
      }
    }
  }
}
