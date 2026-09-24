// tools/ のスクリプトが共有する道具。import しても YAML もブラウザも読まない。
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const failures = [];

export function report(file, id, expected, actual, message) {
  failures.push({ file, id, expected, actual, message });
}

// phase*/ 直下の HTML。並びは名前順。
export function phaseFiles() {
  const found = [];
  for (const dir of readdirSync('.', { withFileTypes: true })) {
    if (!dir.isDirectory() || !/^phase\d+$/.test(dir.name)) continue;
    for (const f of readdirSync(dir.name)) {
      if (f.endsWith('.html')) found.push(join(dir.name, f));
    }
  }
  return found.sort();
}

// HTMLソース上の mount 呼び出しの数。捕捉できた数と突き合わせて、
// アセットの読込失敗で設問が丸ごと欠けたことに気づくために使う。
export function countMounts(file) {
  return (readFileSync(file, 'utf8')
    .match(/\bBoki(?:Journal|Quiz|Num|Fill)\s*\.\s*mount\s*\(/g) || []).length;
}

// tools/test-*.mjs の比較。JSON にして比べるので、配列も値で比べられる。
let eqFailures = 0;
export function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) return;
  eqFailures++;
  console.log('NG ' + label + '  期待=' + e + '  実際=' + a);
}
export function failedCount() { return eqFailures; }

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

// 計算式の評価。eval / new Function は使わない。
// 教材のJSは自前で書くものであり、任意コード実行を許す理由がない。
export function evalFormula(src) {
  // 認識できない文字を捨てて残りを読むと、'alert(1)' が '(1)' として
  // 素通りする。式全体が数値・演算子・括弧・空白だけであることを先に確かめる。
  if (!/^[\d\s.()+\-*/]+$/.test(String(src))) {
    throw new Error('式に使えない文字がある: ' + src);
  }
  const tokens = String(src).match(/\d+(?:\.\d+)?|[()+\-*/]/g);
  if (!tokens) throw new Error('式が空: ' + src);
  // 数値の正規表現を広げるだけでは '.5' は拾えても '1.2.3' や '5.' の読み残しを
  // 取りこぼす。トークンが式を余さず覆っているかで判定する。
  if (tokens.join('') !== String(src).replace(/\s/g, '')) {
    throw new Error('数値として読めない箇所がある: ' + src);
  }
  let i = 0;
  const peek = () => tokens[i];
  const eat = (t) => {
    if (tokens[i] !== t) throw new Error('想定外: ' + tokens[i]);
    i++;
  };

  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = tokens[i++];
      v = op === '+' ? v + term() : v - term();
    }
    return v;
  }
  function term() {
    let v = unary();
    while (peek() === '*' || peek() === '/') {
      const op = tokens[i++];
      const r = unary();
      if (op === '/' && r === 0) throw new Error('ゼロ除算: ' + src);
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function unary() {
    if (peek() === '-') { i++; return -unary(); }
    return atom();
  }
  function atom() {
    if (peek() === '(') { eat('('); const v = expr(); eat(')'); return v; }
    const t = tokens[i++];
    if (!/^\d/.test(t || '')) throw new Error('数値でない: ' + t);
    return Number(t);
  }

  const value = expr();
  if (i !== tokens.length) throw new Error('末尾に余り: ' + src);
  return value;
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
  // 復習ページは設問バンクを XHR で読む。file:// では CORS に阻まれて
  // 案内文だけが出るため、そのまま検査すると再出題のコードが一度も
  // 動かないまま「指摘なし」になる。ローカルのファイルを返して、
  // 実際に描画させたうえで検査する。
  await page.route('**/assets/drills.json', (route) => {
    try {
      route.fulfill({ status: 200, contentType: 'application/json',
                      body: readFileSync('assets/drills.json', 'utf8') });
    } catch (e) { route.abort(); }
  });
  await page.goto('file://' + resolve(htmlPath), { waitUntil: 'load' });
  try {
    return await fn(page, errors);
  } finally {
    await page.close();
  }
}
