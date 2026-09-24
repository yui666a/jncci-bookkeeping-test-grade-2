import { report } from '../lib.mjs';

// ゲート4：BokiQuiz の answer が範囲内で、解説の言及と整合するか。
export async function checkQuiz(page, file) {
  const items = await page.evaluate(() => {
    const out = [];
    for (const { sel, cfg } of (window.__captured?.quiz || [])) {
      (cfg.questions || []).forEach((q, i) => {
        out.push({
          id: sel + '#q' + (i + 1),
          answer: q.answer,
          count: (q.choices || []).length,
          explain: String(q.explain || ''),
        });
      });
    }
    return out;
  });

  for (const it of items) {
    if (!Number.isInteger(it.answer) || it.answer < 0 || it.answer >= it.count) {
      report(file, it.id, '0以上' + it.count + '未満の整数', it.answer,
        'answer が選択肢の範囲外');
      continue;
    }
    // 解説が「選択肢Nが正しい」の形で正解を名指ししていれば answer と
    // 突き合わせる。単なる「選択肢N」への言及は誤答の解説であることが多く、
    // それを正解と見なすと正しい教材に誤った指摘が出る。
    // 選択肢は表示上1始まりで数えるため answer+1 と比較する。
    const m = it.explain.match(
      /選択肢\s*([０-９0-9]+)\s*(?:が|は)\s*(?:正解|正しい|適切)/);
    if (m) {
      const n = Number(m[1].replace(/[０-９]/g, (c) =>
        String.fromCharCode(c.charCodeAt(0) - 0xFEE0)));
      if (n !== it.answer + 1) {
        report(file, it.id, '選択肢' + (it.answer + 1), '選択肢' + n,
          '解説が指す選択肢と answer が食い違う');
      }
    }
  }
}
