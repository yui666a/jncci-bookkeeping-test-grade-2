import { report } from '../lib.mjs';

// ゲート1：静的な .jnl と BokiJournal の設問、両方の貸借を検算する。
export async function checkBalance(page, file) {
  const data = await page.evaluate(() => {
    // 読めない金額を 0 として数えると、「1,000円」と「900円」の仕訳が 0 = 0 で
    // 通る。空欄と「×××」の伏せ字だけを 0 とし、それ以外は unreadable に積む。
    const unreadable = [];
    const num = (s) => {
      const v = window.BokiJournal.__parseAmt(s);
      const t = String(s).trim();
      if (isNaN(v) && t && !/^×+$/.test(t)) unreadable.push(t);
      return isNaN(v) ? 0 : v;
    };
    // 金額は td のみ。見出しの th.amt は「金額」の文字であり合計に含めない。
    //
    // 借方科目 td.d と貸方科目 td.c が同じ行に並ぶ表は仕訳であり、そこの
    // 無印の td.amt は直前の科目の側の金額として数える。td.d.amt / td.c.amt
    // だけを数えると、無印で書いた仕訳は 0 = 0 で素通りする。行ごとに片側しか
    // ない表（計算の内訳や区分表示）は仕訳ではないため、無印の td.amt を数えない。
    const tables = [...document.querySelectorAll('table.jnl')].map((t, i) => {
      const journal = [...t.rows].some((r) => r.querySelector('td.d') && r.querySelector('td.c'));
      const sum = { d: 0, c: 0 };
      let counted = 0;
      unreadable.length = 0;
      for (const row of t.rows) {
        let side = null;
        for (const cell of row.querySelectorAll('td')) {
          const k = cell.classList;
          const own = k.contains('d') ? 'd' : (k.contains('c') ? 'c' : null);
          if (!k.contains('amt')) { if (own) side = own; continue; }
          const s = own || (journal ? side : null);
          if (!s) continue;
          sum[s] += num(cell.textContent);
          counted++;
        }
      }
      const numeric = [...t.querySelectorAll('td')]
        .some((c) => !isNaN(window.BokiJournal.__parseAmt(c.textContent)));
      return { id: t.id || ('jnl[' + i + ']'), debit: sum.d, credit: sum.c,
               unchecked: journal && !counted && numeric, unreadable: [...unreadable] };
    });
    const drills = [];
    for (const { sel, cfg } of (window.__captured?.journal || [])) {
      // 設問の debit/credit は [科目名, 金額] のタプル配列（app.js の実装による）
      const sum = (rows) => (rows || []).reduce((a, r) => a + (Number(r[1]) || 0), 0);
      (cfg.questions || []).forEach((q, i) => {
        drills.push({ id: sel + '#q' + (i + 1), debit: sum(q.debit), credit: sum(q.credit) });
      });
    }
    return { tables, drills };
  });

  for (const t of data.tables) {
    for (const v of t.unreadable) {
      report(file, t.id, '数値として読める金額', v, '仕訳の金額欄を数値として読めない');
    }
    if (t.unchecked) {
      report(file, t.id, 'td.amt あり', 'なし', '仕訳の金額欄に amt がなく貸借を検算できない');
    }
  }
  for (const e of [...data.tables, ...data.drills]) {
    if (e.debit !== e.credit) {
      report(file, e.id, e.debit, e.credit, '貸借が一致しない');
    }
  }
}
