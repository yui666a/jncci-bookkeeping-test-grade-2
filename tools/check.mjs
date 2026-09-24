// 教材HTMLの品質ゲート0〜6・9〜13と、ゲート7の前提（boki-topics メタ）を検査する。
// ゲート7のカバレッジ判定と8の敵対的検証は判断が要るため、ここでは行わない。
// HTMLの解析に正規表現を使わない。Playwright で file:// を開き、DOM と
// JS ランタイムから読む。mount() に渡された設定オブジェクトの中身には
// 正規表現では到達できないため。
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { failures, report, withPage } from './lib.mjs';
import { checkMounted } from './gates/00-mounted.mjs';
import { checkBalance } from './gates/01-balance.mjs';
import { checkAccounts } from './gates/02-accounts.mjs';
import { checkNum } from './gates/03-num.mjs';
import { checkQuiz } from './gates/04-quiz.mjs';
import { checkToc } from './gates/05-toc.mjs';
import { checkRuntime } from './gates/06-runtime.mjs';
import { checkTopicsMeta } from './gates/07-topics-meta.mjs';
import { checkProgressWiring, checkDashboardRobust } from './gates/09-progress.mjs';
import { checkQuizNumbers } from './gates/10-quiz-numbers.mjs';
import { checkAccountYomi } from './gates/11-yomi.mjs';
import { checkDrillBank } from './gates/12-drill-bank.mjs';
import { checkDrillIds } from './gates/13-drill-ids.mjs';

// 番号順に並べない。ゲート9は採点と再読込でページを書き換え、復習ページでは
// 再出題したドリルの設定が捕捉に加わる。捕捉を読むゲート10・11はその前に置く。
const CHECKS = [
  checkMounted, checkBalance, checkAccounts, checkNum, checkQuiz, checkToc,
  checkRuntime, checkTopicsMeta, checkAccountYomi, checkQuizNumbers,
  checkProgressWiring, checkDashboardRobust, checkDrillBank, checkDrillIds,
];

function targets(args) {
  if (args.length) return args;
  const found = [];
  for (const dir of readdirSync('.', { withFileTypes: true })) {
    if (!dir.isDirectory() || !/^phase\d+$/.test(dir.name)) continue;
    for (const f of readdirSync(dir.name)) {
      if (f.endsWith('.html')) found.push(join(dir.name, f));
    }
  }
  found.sort();
  // ダッシュボード・復習・横断演習のページはフェーズ配下にないが、JSエラーと
  // 壊れた記録への耐性を見る必要があるため対象に含める。ルートの目次も
  // 全単元へのリンクを持つため、リンク切れを見る対象に含める。
  for (const f of ['index.html', 'progress.html', 'review.html', 'practice.html']) {
    if (existsSync(f)) found.push(f);
  }
  return found;
}

async function main() {
  const files = targets(process.argv.slice(2));
  if (!files.length) {
    console.error('検査対象のHTMLが見つからない');
    process.exit(1);
  }
  const browser = await chromium.launch();
  try {
    for (const file of files) {
      // 1つのゲートの例外で検査全体を止めない。止めると、それまでに
      // 集めた指摘も残りのゲートも失われる。
      try {
        await withPage(browser, file, async (page, errors) => {
          for (const check of CHECKS) {
            try { await check(page, file, errors); }
            catch (e) { report(file, check.name, '例外なし', String(e), 'ゲートが例外で止まった'); }
          }
        });
      } catch (e) {
        report(file, '(open)', '開ける', String(e), 'ページを開けない');
      }
    }
  } finally {
    await browser.close();
  }
  finish(files.length);
}

function finish(pages) {
  if (!failures.length) {
    console.log('OK ' + pages + ' ページ、指摘なし');
    process.exit(0);
  }
  for (const f of failures) {
    console.log(f.file + ':' + f.id + '  ' + f.message
      + '  期待=' + f.expected + '  実際=' + f.actual);
  }
  console.log('');
  console.log('NG ' + failures.length + ' 件');
  process.exit(1);
}

main().catch((e) => {
  report('(check)', '(main)', '例外なし', String(e), '検査が例外で止まった');
  finish(0);
});
