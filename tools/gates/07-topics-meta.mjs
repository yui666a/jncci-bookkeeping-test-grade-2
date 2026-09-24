import { report, loadYaml } from '../lib.mjs';

// ゲート7：boki-topics メタが存在し、IDが syllabus.yml に実在するか。
// import 時には読まない。読むと、検査を走らせない import でも YAML が要る。
let topicIds;

export async function checkTopicsMeta(page, file) {
  // index.html は目次であり論点を扱わない
  if (/(^|\/)index\.html$/.test(file)) return;
  topicIds ??= new Set(loadYaml('reference/syllabus.yml').topics.map((t) => t.id));

  const meta = await page.evaluate(() => {
    const m = document.querySelector('meta[name="boki-topics"]');
    return m ? m.content : null;
  });
  if (meta === null) {
    report(file, '(head)', 'boki-topics あり', 'なし',
      'カバー論点のメタがない（カバレッジ検証で未カバー扱いになる）');
    return;
  }
  // 空のメタは「存在する」ため素通りするが、カバレッジ上は未宣言と同じで、
  // 本文が扱っている論点が黙って未カバーに落ちる。2級論点を扱わない単元も
  // 実在するため、扱わないことを 'なし' と明示させ、書き忘れと区別する。
  if (meta.trim() === '') {
    report(file, '(head)', '論点ID、または扱わないなら なし', '空',
      'boki-topics が空（宣言漏れか、2級論点を扱わないのかを区別できない）');
    return;
  }
  if (meta.trim() === 'なし') return;
  const ids = meta.split(',').map((s) => s.trim()).filter(Boolean);
  for (const id of ids) {
    if (!topicIds.has(id)) {
      report(file, id, 'syllabus.yml に実在', 'なし', '存在しない論点ID');
    }
  }
}
