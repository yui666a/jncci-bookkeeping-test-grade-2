import { report, loadYaml } from '../lib.mjs';

// 正解科目が accounts プールに入っているか、その科目名が
// 標準・許容勘定科目表に実在するかを見る。
//
// 勘定科目表は製造業の科目を含まない（原本の記載による）。工業簿記の
// 単元では実在チェックを行わず、プール整合だけを見る。
// import 時には読まない。読むと、検査を走らせない import でも YAML が要る。
let knownAccounts;

// ゲート2：正解科目のプール整合と、科目名の実在。
export async function checkAccounts(page, file) {
  knownAccounts ??= new Set(
    loadYaml('reference/accounts.yml').accounts.map((a) => a.name));
  const data = await page.evaluate(() => {
    const out = [];
    for (const { sel, cfg } of (window.__captured?.journal || [])) {
      (cfg.questions || []).forEach((q, i) => {
        const pool = q.accounts || cfg.accounts || [];
        const used = [...(q.debit || []), ...(q.credit || [])]
          .map((r) => r[0]).filter(Boolean);
        out.push({ id: sel + '#q' + (i + 1), pool, used });
      });
    }
    const m = document.querySelector('meta[name="boki-subject"]');
    return { out, subject: m ? m.content : '商' };
  });

  // 商以外の値は照合を黙って外すことになる。打ち間違いをここで止める。
  if (data.subject !== '商' && data.subject !== '工') {
    report(file, '(head)', '商 または 工', data.subject, 'boki-subject の値が不正');
  }
  for (const q of data.out) {
    const pool = new Set(q.pool);
    for (const name of q.used) {
      if (!pool.has(name)) {
        report(file, q.id, 'プールに含む', name,
          '正解科目が accounts プールにない（入力できず必ず不正解になる）');
      }
      if (data.subject === '商' && !knownAccounts.has(name)) {
        report(file, q.id, '勘定科目表に実在', name,
          '標準・許容勘定科目表にない科目名');
      }
    }
  }
}
