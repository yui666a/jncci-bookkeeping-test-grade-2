// 教材HTMLの品質ゲート1〜7を検査する。
// HTMLの解析に正規表現を使わない。Playwright で file:// を開き、DOM と
// JS ランタイムから読む。mount() に渡された設定オブジェクトの中身には
// 正規表現では到達できないため。
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';

const failures = [];

export function report(file, id, expected, actual, message) {
  failures.push({ file, id, expected, actual, message });
}

// 依存を増やさないための最小YAMLリーダ。
// 対象は parse-syllabus.py / parse-accounts.py が出力する形だけであり、
// 2階層のリスト・オブジェクトと引用符つき文字列を読めれば足りる。
export function loadYaml(path) {
  const out = {};
  let listKey = null;
  let item = null;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    const top = raw.match(/^([A-Za-z_][\w]*):\s*$/);
    if (top) {
      listKey = top[1];
      out[listKey] = [];
      item = null;
      continue;
    }
    const start = raw.match(/^\s+-\s+(\w+):\s*(.*)$/);
    if (start && listKey) {
      item = {};
      out[listKey].push(item);
      item[start[1]] = unquote(start[2]);
      continue;
    }
    const cont = raw.match(/^\s+(\w+):\s*(.*)$/);
    if (cont && item) item[cont[1]] = unquote(cont[2]);
  }
  return out;
}

function unquote(v) {
  const s = v.trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return s;
}

// mount() に渡された設定を捕捉する。app.js は末尾で window に代入するため、
// setter を仕込んでおけば確実に掴める。
const CAPTURE = () => {
  window.__captured = { journal: [], quiz: [], num: [], fill: [] };
  const slots = { BokiJournal: 'journal', BokiQuiz: 'quiz',
                  BokiNum: 'num', BokiFill: 'fill' };
  for (const [name, slot] of Object.entries(slots)) {
    let real;
    Object.defineProperty(window, name, {
      configurable: true,
      get() { return real; },
      set(v) {
        const orig = v.mount.bind(v);
        v.mount = (sel, cfg) => {
          window.__captured[slot].push({ sel, cfg });
          return orig(sel, cfg);
        };
        real = v;
      },
    });
  }
};

export async function withPage(browser, htmlPath, fn) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(CAPTURE);
  await page.goto('file://' + resolve(htmlPath), { waitUntil: 'load' });
  try {
    return await fn(page, errors);
  } finally {
    await page.close();
  }
}

function targets(args) {
  if (args.length) return args;
  const found = [];
  for (const dir of readdirSync('.', { withFileTypes: true })) {
    if (!dir.isDirectory() || !/^phase\d+$/.test(dir.name)) continue;
    for (const f of readdirSync(dir.name)) {
      if (f.endsWith('.html')) found.push(join(dir.name, f));
    }
  }
  return found.sort();
}

export const CHECKS = [];

// ゲート1：静的な .jnl と BokiJournal の設問、両方の貸借を検算する。
CHECKS.push(async function checkBalance(page, file) {
  const data = await page.evaluate(() => {
    const num = (s) => Number(String(s).replace(/[^\d.-]/g, '')) || 0;
    // 金額は td のみ。見出しの th.amt は「金額」の文字であり合計に含めない。
    const tables = [...document.querySelectorAll('table.jnl')].map((t, i) => {
      let debit = 0, credit = 0;
      for (const cell of t.querySelectorAll('td.d.amt')) debit += num(cell.textContent);
      for (const cell of t.querySelectorAll('td.c.amt')) credit += num(cell.textContent);
      return { id: t.id || ('jnl[' + i + ']'), debit, credit };
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

  for (const e of [...data.tables, ...data.drills]) {
    if (e.debit !== e.credit) {
      report(file, e.id, e.debit, e.credit, '貸借が一致しない');
    }
  }
});

async function main() {
  const files = targets(process.argv.slice(2));
  if (!files.length) {
    console.error('検査対象のHTMLが見つからない');
    process.exit(1);
  }
  const browser = await chromium.launch();
  try {
    for (const file of files) {
      await withPage(browser, file, async (page, errors) => {
        for (const check of CHECKS) await check(page, file, errors);
      });
    }
  } finally {
    await browser.close();
  }

  if (!failures.length) {
    console.log('OK ' + files.length + ' ページ、指摘なし');
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

main();
