import { readFileSync, existsSync } from 'node:fs';
import { report } from '../lib.mjs';

// ゲート13：記録IDと設問の対応が動いていないか。
//
// 記録IDの q番号は設問配列の添字である。途中に設問を挿す・消す・並べ替えると
// 以降の番号が1つずつずれるが、番号としては有効なままなので何も壊れて
// 見えない。学習者の localStorage には古い番号で誤答が残っており、復習
// ドリルは「間違えた覚えのない設問」を出したうえ、その正解を元の設問IDに
// 積んで一覧から消す。実際に間違えた設問は復習されないまま消滅する。
//
// 設問を足すときは末尾に足す。新しいドリルと末尾の設問は npm run build:drills
// が reference/drill-ids.json に登録する。文言の推敲で指紋が変わったときは
// その指紋を手で書き換えてコミットする（その設問の記録は引き継がれる。
// 中身が同じ設問だという判断は人間が下す）。
export async function checkDrillIds(page, file) {
  if (checkDrillIds.done) return;
  checkDrillIds.done = true;

  const BASE = 'reference/drill-ids.json';
  // 設問バンクがないことはゲート12が指摘する。
  if (!existsSync('assets/drills.json')) return;
  if (!existsSync(BASE)) {
    report(BASE, '(ids)', 'あり', 'なし',
      '記録IDの基準がない（npm run build:drills で生成してコミットする）');
    return;
  }

  const base = JSON.parse(readFileSync(BASE, 'utf8'));
  const bank = JSON.parse(readFileSync('assets/drills.json', 'utf8'));

  for (const [unit, u] of Object.entries(bank.units)) {
    for (const [root, d] of Object.entries(u.drills)) {
      const key = unit + '#' + root;
      const was = base[key];
      const now = d.fingerprints || [];
      if (!was) {
        report(u.href, root, '登録', '未登録',
          '記録IDの基準に未登録のドリルがある（npm run build:drills で登録してコミットする）');
        continue;
      }
      // 末尾への追加は既存の番号を動かさない。先頭からの一致だけを見る。
      const n = Math.min(was.length, now.length);
      let moved = false;
      for (let i = 0; i < n; i++) {
        if (was[i] !== now[i]) {
          report(u.href, root + '/q' + (i + 1), was[i], now[i],
            '設問の並びが変わり、過去の記録が別の設問を指している');
          moved = true;
          break;
        }
      }
      // 並びが変わったドリルは build:drills が登録しないため、登録の案内は出さない。
      if (!moved && now.length > was.length) {
        report(u.href, root, was.length + '問を登録', now.length + '問',
          '記録IDの基準に未登録の設問がある（npm run build:drills で登録してコミットする）');
      }
      if (now.length < was.length) {
        report(u.href, root, was.length + '問', now.length + '問',
          '設問が減り、末尾の記録が行き場を失った');
      }
    }
  }
}
