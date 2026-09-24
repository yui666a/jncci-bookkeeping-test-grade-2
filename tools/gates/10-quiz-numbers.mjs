import { report, evalFormula } from '../lib.mjs';

// ゲート10：BokiQuiz の設問に書かれた数値を検算する。
//
// answer は選択肢のインデックスなので、BokiNum の formula 方式は載らない。
// 代わりに設問が invariant（成り立つべき等式）を宣言し、それを評価する。
// 不変条件を検査側に組み込まないのは、端数処理のように「一致しないことを
// 教えている」設問が正しく存在するため。教材が「ここは一致しない」と
// 言えなければ、正しい教材が落ちる。
//
// 問題文の数値を書き換えて invariant を直し忘れた誤りは、計算式の
// オペランドを問題文と突き合わせることで検出する。誤答の選択肢に同じ
// 数値が残っていても、問題文から消えていれば落ちる。
//
// 検査できないこと：解説文の中の計算、誤答の選択肢が「別の方法で計算した
// 値」として妥当か、金額が条件として出てくるだけの設問。
//
// 対象は「全選択肢が金額を含む」設問に限る。金額が条件として出てくるだけの
// 設問（「1,000万円以上で2%割戻…この処理はどれか」）は、答えが金額ではなく
// 検算しようがない。含めると書きようのない invariant を要求することになる。
export async function checkQuizNumbers(page, file) {
  const items = await page.evaluate(() => {
    const money = /[0-9]{1,3}(,[0-9]{3})+|[0-9]+\s*円/;
    const out = [];
    for (const { sel, cfg } of (window.__captured?.quiz || [])) {
      (cfg.questions || []).forEach((q, i) => {
        const choices = (q.choices || []).map((c) => String(c).replace(/<[^>]*>/g, ''));
        const digits = (s) => (String(s).match(/[0-9][0-9,]*/g) || [])
          .map((x) => x.replace(/,/g, ''));
        out.push({
          id: sel + '#q' + (i + 1),
          allMoney: choices.length > 1 && choices.every((c) => money.test(c)),
          invariant: q.invariant,
          answerText: choices[q.answer] || '',
          // 問題文が提示している数値。選択肢は含めない。誤答の選択肢に
          // 紛れの数値が置かれているため、そこまで許すと問題文を直して
          // invariant を直し忘れた誤りが素通りする。
          shown: digits(String(q.text).replace(/<[^>]*>/g, '')),
          // 中間値は問題文に現れないので、選択肢の数値は別に持つ。
          inChoices: digits(choices.join(' ')),
        });
      });
    }
    return out;
  });

  for (const it of items) {
    if (!it.allMoney) continue;
    if (it.invariant === undefined) {
      report(file, it.id, 'invariant あり', 'なし',
        '選択肢が金額なのに検算式がない（数値が誤っていても検出できない）');
      continue;
    }
    for (const [k, pair] of (it.invariant || []).entries()) {
      const [lhs, rhs, opt] = pair;
      const id = it.id + '.inv' + (k + 1);
      // 'answer' は正解の選択肢から取り出した数値。問題文の数値と
      // 選択肢の数値が繋がっていないと、片方だけ誤っていても通る。
      const sub = (x) => String(x) === 'answer'
        ? (it.answerText.match(/[0-9][0-9,]*/) || [''])[0].replace(/,/g, '')
        : String(x);
      let a, b;
      try { a = evalFormula(sub(lhs)); b = evalFormula(sub(rhs)); }
      catch (e) {
        report(file, id, '評価できる式', lhs + ' / ' + rhs, '式を評価できない: ' + e.message);
        continue;
      }
      // 式どうしが整合していても、問題文を直して invariant を直し忘れると
      // 素通りする。式に現れる数値は、問題文か選択肢のどちらかに実在して
      // いなければならない。
      //
      // さらに、式の各辺は問題文の数値に最低1つは接地している必要がある。
      // 選択肢の数値だけで組み立てられた式は、問題文と繋がっておらず、
      // 問題文を書き換えても追随しない。
      const shown = new Set(it.shown);
      const anywhere = new Set(it.shown.concat(it.inChoices));
      const used = [];
      for (const side of [lhs, rhs]) {
        if (String(side) === 'answer') continue;
        const nums = String(side).match(/[0-9]+/g) || [];
        used.push(...nums);
        for (const n of nums) {
          if (!anywhere.has(n)) {
            report(file, id, '設問にある数値', n,
              '検算式が設問に現れない数値を使っている');
          }
        }
        // 演算子を含む辺は「問題文の数値を組み立てた式」である。その
        // オペランドは問題文に実在しなければならない。これを見ることで、
        // 問題文の金額を書き換えて invariant を直し忘れた誤りが、
        // その数値が誤答の選択肢として残っていても検出できる。
        //
        // 演算子を含まない辺は計算結果であり、問題文ではなく選択肢に
        // 現れるのが正常なので、この検査から外す。
        if (/[+\-*/]/.test(String(side))) {
          for (const n of nums) {
            if (!shown.has(n)) {
              report(file, id, '問題文にある数値', n,
                '計算式のオペランドが問題文にない（問題文の修正に追随していない）');
            }
          }
        }
      }
      // 接地は等式ごとに見る。片方が計算結果（選択肢にしか現れない値）で
      // あるのは正常で、両辺とも問題文と無縁なときだけが問題になる。
      if (used.length && !used.some((n) => shown.has(n))) {
        report(file, id, '問題文の数値を含む式', lhs + ' / ' + rhs,
          '検算式が問題文に接地していない（問題文を直しても追随しない）');
      }

      const tol = opt && Number(opt.tolerance) || 0;
      // 許容誤差には理由を書かせる。黙って許すと、本当の計算違いが
      // tolerance に隠れる。
      if (tol && !(opt && opt.why)) {
        report(file, id, 'tolerance に why', 'なし', '許容誤差の理由が書かれていない');
      }
      if (Math.abs(a - b) > tol + 1e-9) {
        report(file, id, a, b, '検算が合わない（' + lhs + ' ≠ ' + rhs + '）');
      }
    }
  }
}
