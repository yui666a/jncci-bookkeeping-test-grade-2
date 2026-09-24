import { report } from '../lib.mjs';

// ゲート11：仕訳ドリルの科目が読みで検索できるか。
// 読みの無い科目は漢字でしか引けず、変換を確定するまで絞り込めない。
// 単元を足したときに読みの追加を忘れても、画面上は何も壊れないため
// 気づけない。機械的に見る。
export async function checkAccountYomi(page, file) {
  const missing = await page.evaluate(() => {
    const names = new Set();
    for (const { cfg } of (window.__captured?.journal || [])) {
      for (const a of (cfg.accounts || [])) names.add(a);
      for (const q of (cfg.questions || [])) for (const a of (q.accounts || [])) names.add(a);
    }
    if (!names.size) return [];
    // 描画された入力欄ではなく、捕捉した設定を見る。mount 先の id を
    // 書き損じると入力欄は生えないが、設定は捕捉されている。描画を
    // 条件にすると、その取り違えが起きたページだけ検査を素通りする。
    return [...names].filter((n) => !window.BokiJournal.__hasYomi(n));
  });
  for (const n of missing) {
    report(file, n, '読みを登録', 'なし',
      'YOMI に読みがなく、かなで検索できない（assets/yomi.js に追加する）');
  }
}
