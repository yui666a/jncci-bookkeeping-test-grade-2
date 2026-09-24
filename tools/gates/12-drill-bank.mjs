import { readFileSync, existsSync } from 'node:fs';
import { report } from '../lib.mjs';

// ゲート12：設問バンクが単元HTMLと一致しているか。
//
// assets/drills.json は単元HTMLから生成する。復習ドリルはこれを読んで
// 再出題するため、古いままだと、教材で直した設問が復習では直っていない、
// という食い違いが起きる。設問を直した本人には見えない壊れ方をする。
export async function checkDrillBank(page, file) {
  // ページごとではなく一度だけ走らせる。他のゲートと違い、検査の対象が
  // 単元HTMLではなく生成物そのものであるため。
  if (checkDrillBank.done) return;
  checkDrillBank.done = true;

  if (!existsSync('assets/drills.json')) {
    report('assets/drills.json', '(bank)', 'あり', 'なし',
      '設問バンクがない（npm run build:drills で生成する）');
    return;
  }
  const { build } = await import('../build-drill-bank.mjs');
  const r = await build({ write: false });
  if (!r.ok) {
    report('assets/drills.json', '(bank)', '生成できる', '失敗',
      '設問バンクを生成できない');
    return;
  }
  if (readFileSync('assets/drills.json', 'utf8') !== r.text) {
    report('assets/drills.json', '(bank)', '単元HTMLと一致', '古い',
      '設問バンクが古い（npm run build:drills で再生成してコミットする）');
  }
}
