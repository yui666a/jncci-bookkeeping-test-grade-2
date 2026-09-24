import { report, evalFormula } from '../lib.mjs';

// ゲート3：BokiNum の解答を計算式から再計算する。
// answer は数値または配列（複数欄）。formula も同じ形で持たせる。
export async function checkNum(page, file) {
  const items = await page.evaluate(() => {
    const out = [];
    for (const { sel, cfg } of (window.__captured?.num || [])) {
      (cfg.questions || []).forEach((q, i) => {
        const answers = Array.isArray(q.answer) ? q.answer : [q.answer];
        const formulas = Array.isArray(q.formula) ? q.formula
          : (q.formula === undefined ? [] : [q.formula]);
        answers.forEach((a, j) => {
          out.push({
            id: sel + '#q' + (i + 1) + (answers.length > 1 ? '.' + (j + 1) : ''),
            answer: a,
            formula: formulas[j],
            count: answers.length,
            given: formulas.length,
          });
        });
      });
    }
    return out;
  });

  for (const it of items) {
    if (it.formula === undefined) {
      report(file, it.id, 'formula あり',
        it.given ? '欄' + it.count + '個に対し式' + it.given + '個' : 'なし',
        'BokiNum の設問に計算式がない（再計算できない）');
      continue;
    }
    let got;
    try {
      got = evalFormula(it.formula);
    } catch (e) {
      report(file, it.id, '評価できる式', it.formula, '式を評価できない: ' + e.message);
      continue;
    }
    // answer が数値でないと差が NaN になり、> の比較は常に偽で素通りする。
    if (typeof it.answer !== 'number' || !(Math.abs(got - it.answer) <= 1e-9)) {
      report(file, it.id, got, JSON.stringify(it.answer), '計算式の値と answer が一致しない');
    }
  }
}
