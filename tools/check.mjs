// 教材HTMLの品質ゲート1〜7を検査する。
// HTMLの解析に正規表現を使わない。Playwright で file:// を開き、DOM と
// JS ランタイムから読む。mount() に渡された設定オブジェクトの中身には
// 正規表現では到達できないため。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  // ダッシュボードと復習ページはフェーズ配下にないが、JSエラーと壊れた
  // 記録への耐性を見る必要があるため対象に含める。
  for (const f of ['progress.html', 'review.html']) {
    if (existsSync(f)) found.push(f);
  }
  return found;
}

export const CHECKS = [];

// 正解科目が accounts プールに入っているか、その科目名が
// 標準・許容勘定科目表に実在するかを見る。
//
// 勘定科目表は製造業の科目を含まない（原本の記載による）。工業簿記の
// 単元では実在チェックを行わず、プール整合だけを見る。
const KNOWN_ACCOUNTS = new Set(
  loadYaml('reference/accounts.yml').accounts.map((a) => a.name));

// ゲート0：ドリルが実際に mount されたか。
// 検査はページのJSランタイムから設問を読む。app.js の読み込みに失敗すると
// 捕捉が空になり、以降の全ゲートが「設問0件」を検査して素通りする。
// HTMLソース上の mount 呼び出し数と実際の捕捉数が食い違えば、そこで止める。
CHECKS.push(async function checkMounted(page, file, errors) {
  const captured = await page.evaluate(() => {
    const c = window.__captured || {};
    return Object.values(c).reduce((a, v) => a + v.length, 0);
  });
  const declared = (readFileSync(file, 'utf8')
    .match(/\bBoki(?:Journal|Quiz|Num|Fill)\s*\.\s*mount\s*\(/g) || []).length;
  if (declared !== captured) {
    report(file, '(mount)', declared, captured,
      'mount 呼び出しが実行されていない（アセット読込の失敗か）');
  }
});

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

// ゲート2：正解科目のプール整合と、科目名の実在。
CHECKS.push(async function checkAccounts(page, file) {
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

  for (const q of data.out) {
    const pool = new Set(q.pool);
    for (const name of q.used) {
      if (!pool.has(name)) {
        report(file, q.id, 'プールに含む', name,
          '正解科目が accounts プールにない（入力できず必ず不正解になる）');
      }
      if (data.subject === '商' && !KNOWN_ACCOUNTS.has(name)) {
        report(file, q.id, '勘定科目表に実在', name,
          '標準・許容勘定科目表にない科目名');
      }
    }
  }
});

// ゲート3：BokiNum の解答を計算式から再計算する。
// answer は数値または配列（複数欄）。formula も同じ形で持たせる。
CHECKS.push(async function checkNum(page, file) {
  const items = await page.evaluate(() => {
    const out = [];
    for (const { sel, cfg } of (window.__captured?.num || [])) {
      (cfg.questions || []).forEach((q, i) => {
        const answers = Array.isArray(q.answer) ? q.answer : [q.answer];
        const formulas = Array.isArray(q.formula) ? q.formula
          : (q.formula === undefined ? [] : [q.formula]);
        answers.forEach((a, j) => {
          out.push({
            id: sel + '#q' + (i + 1) + (answers.length > 1 ? '.' + (j + 1) : ''),
            answer: a,
            formula: formulas[j],
            count: answers.length,
            given: formulas.length,
          });
        });
      });
    }
    return out;
  });

  for (const it of items) {
    if (it.formula === undefined) {
      report(file, it.id, 'formula あり',
        it.given ? '欄' + it.count + '個に対し式' + it.given + '個' : 'なし',
        'BokiNum の設問に計算式がない（再計算できない）');
      continue;
    }
    let got;
    try {
      got = evalFormula(it.formula);
    } catch (e) {
      report(file, it.id, '評価できる式', it.formula, '式を評価できない: ' + e.message);
      continue;
    }
    if (Math.abs(got - Number(it.answer)) > 1e-9) {
      report(file, it.id, got, it.answer, '計算式の値と answer が一致しない');
    }
  }
});

// ゲート4：BokiQuiz の answer が範囲内で、解説の言及と整合するか。
CHECKS.push(async function checkQuiz(page, file) {
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
});

// ゲート5：.toc のアンカーと見出しidの対応。
CHECKS.push(async function checkToc(page, file) {
  const data = await page.evaluate(() => ({
    anchors: [...document.querySelectorAll('.toc a[href^="#"]')]
      .map((a) => a.getAttribute('href').slice(1)),
    ids: [...document.querySelectorAll('h2[id]')].map((h) => h.id),
  }));

  const ids = new Set(data.ids);
  for (const a of data.anchors) {
    if (!ids.has(a)) {
      report(file, '#' + a, '対応する h2[id]', 'なし', '目次のリンク先がない');
    }
  }
  const linked = new Set(data.anchors);
  for (const id of data.ids) {
    if (!linked.has(id)) {
      report(file, '#' + id, '目次に載る', '載っていない', '見出しが目次にない');
    }
  }
});

// ゲート6：JSエラー、id重複、data-key重複、リンク切れ、外部参照、
// 420px幅の横スクロール。
CHECKS.push(async function checkRuntime(page, file, errors) {
  for (const e of errors) report(file, '(runtime)', 'エラーなし', e, 'JSエラー');

  const found = await page.evaluate(() => {
    const dups = (list) => {
      const seen = {}, out = [];
      for (const v of list) {
        if (!v) continue;
        seen[v] = (seen[v] || 0) + 1;
        if (seen[v] === 2) out.push(v);
      }
      return out;
    };
    return {
      ids: dups([...document.querySelectorAll('[id]')].map((e) => e.id)),
      keys: dups([...document.querySelectorAll('[data-key]')].map((e) => e.dataset.key)),
      rel: [...document.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href'))
        .filter((h) => h && !h.startsWith('#') && !/^[a-z]+:/.test(h)),
      deadAnchors: [...document.querySelectorAll('a[href^="#"]')]
        .map((a) => a.getAttribute('href').slice(1))
        .filter((h) => h && !document.getElementById(h)),
      external: [...document.querySelectorAll('[src], link[href]')]
        .map((e) => e.getAttribute('src') || e.getAttribute('href'))
        .filter((u) => u && /^https?:/.test(u)),
    };
  });

  for (const id of found.ids) report(file, id, '一意', '重複', 'id が重複');
  for (const k of found.keys) {
    report(file, k, '一意', '重複', 'data-key が重複（進捗が混線する）');
  }
  for (const a of found.deadAnchors) {
    report(file, '#' + a, '存在する', 'なし', 'ページ内リンクの飛び先がない');
  }
  for (const u of found.external) {
    report(file, u, '外部参照なし', u, '外部URLを参照している（オフラインで壊れる）');
  }

  for (const href of found.rel) {
    const target = resolve(dirname(file), decodeURIComponent(href.split('#')[0]));
    if (!existsSync(target)) report(file, href, '存在する', 'なし', 'リンク切れ');
  }

  // 420px 幅での横スクロール。.grid2 内の表が典型的な原因。
  await page.setViewportSize({ width: 420, height: 900 });
  const over = await page.evaluate(() => {
    const d = document.documentElement;
    if (d.scrollWidth <= d.clientWidth) return null;
    // 横スクロールする入れ物（表や図を包む overflow-x:auto）の中で幅を
    // 超える要素は、設計上そうなっているため原因ではない。祖先に
    // スクロールする入れ物を持たない要素だけを挙げる。
    const scrolls = (e) => {
      const o = getComputedStyle(e).overflowX;
      return o === 'auto' || o === 'scroll';
    };
    const all = [...document.querySelectorAll('*')].filter((e) => {
      if (e.getBoundingClientRect().right <= d.clientWidth + 1) return false;
      for (let a = e.parentElement; a && a !== d; a = a.parentElement) {
        if (scrolls(a)) return false;
      }
      return true;
    });
    const wide = all
      .filter((e) => !all.some((o) => o !== e && o.contains(e)))
      .slice(0, 3)
      // SVG要素の className は文字列ではなく SVGAnimatedString のため、
      // String() すると '[object SVGAnimatedString]' になる。
      .map((e) => {
        const cls = typeof e.className === 'string' ? e.className
          : (e.getAttribute('class') || '');
        return e.tagName.toLowerCase() + (cls ? '.' + cls.split(' ')[0] : '');
      });
    return { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth, wide };
  });
  if (over) {
    report(file, over.wide.join(',') || '(要素不明)', over.clientWidth, over.scrollWidth,
      '420px幅で横スクロールが出る');
  }
  await page.setViewportSize({ width: 1280, height: 900 });
});

// ゲート7：boki-topics メタが存在し、IDが syllabus.yml に実在するか。
const TOPIC_IDS = new Set(loadYaml('reference/syllabus.yml').topics.map((t) => t.id));

CHECKS.push(async function checkTopicsMeta(page, file) {
  // index.html は目次であり論点を扱わない
  if (/(^|\/)index\.html$/.test(file)) return;

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
    if (!TOPIC_IDS.has(id)) {
      report(file, id, 'syllabus.yml に実在', 'なし', '存在しない論点ID');
    }
  }
});

// ゲート11：仕訳ドリルの科目が読みで検索できるか。
// 読みの無い科目は漢字でしか引けず、変換を確定するまで絞り込めない。
// 単元を足したときに読みの追加を忘れても、画面上は何も壊れないため
// 気づけない。機械的に見る。
CHECKS.push(async function checkAccountYomi(page, file) {
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
      'YOMI に読みがなく、かなで検索できない（assets/app.js の YOMI に追加する）');
  }
});

// ゲート10：BokiQuiz の設問に書かれた数値を検算する。
//
// answer は選択肢のインデックスなので、BokiNum の formula 方式は載らない。
// 代わりに設問が invariant（成り立つべき等式）を宣言し、それを評価する。
// 不変条件を検査側に組み込まないのは、端数処理のように「一致しないことを
// 教えている」設問が正しく存在するため。教材が「ここは一致しない」と
// 言えなければ、正しい教材が落ちる。
//
// 問題文の数値を書き換えて invariant を直し忘れた誤りは、計算式の
// オペランドを問題文と突き合わせることで検出する。誤答の選択肢に同じ
// 数値が残っていても、問題文から消えていれば落ちる。
//
// 検査できないこと：解説文の中の計算、誤答の選択肢が「別の方法で計算した
// 値」として妥当か、金額が条件として出てくるだけの設問。
//
// 対象は「全選択肢が金額を含む」設問に限る。金額が条件として出てくるだけの
// 設問（「1,000万円以上で2%割戻…この処理はどれか」）は、答えが金額ではなく
// 検算しようがない。含めると書きようのない invariant を要求することになる。
CHECKS.push(async function checkQuizNumbers(page, file) {
  const items = await page.evaluate(() => {
    const money = /[0-9]{1,3}(,[0-9]{3})+|[0-9]+\s*円/;
    const out = [];
    for (const { sel, cfg } of (window.__captured?.quiz || [])) {
      (cfg.questions || []).forEach((q, i) => {
        const choices = (q.choices || []).map((c) => String(c).replace(/<[^>]*>/g, ''));
        const digits = (s) => (String(s).match(/[0-9][0-9,]*/g) || [])
          .map((x) => x.replace(/,/g, ''));
        out.push({
          id: sel + '#q' + (i + 1),
          allMoney: choices.length > 1 && choices.every((c) => money.test(c)),
          invariant: q.invariant,
          answerText: choices[q.answer] || '',
          // 問題文が提示している数値。選択肢は含めない。誤答の選択肢に
          // 紛れの数値が置かれているため、そこまで許すと問題文を直して
          // invariant を直し忘れた誤りが素通りする。
          shown: digits(String(q.text).replace(/<[^>]*>/g, '')),
          // 中間値は問題文に現れないので、選択肢の数値は別に持つ。
          inChoices: digits(choices.join(' ')),
        });
      });
    }
    return out;
  });

  for (const it of items) {
    if (!it.allMoney) continue;
    if (it.invariant === undefined) {
      report(file, it.id, 'invariant あり', 'なし',
        '選択肢が金額なのに検算式がない（数値が誤っていても検出できない）');
      continue;
    }
    for (const [k, pair] of (it.invariant || []).entries()) {
      const [lhs, rhs, opt] = pair;
      const id = it.id + '.inv' + (k + 1);
      // 'answer' は正解の選択肢から取り出した数値。問題文の数値と
      // 選択肢の数値が繋がっていないと、片方だけ誤っていても通る。
      const sub = (x) => String(x) === 'answer'
        ? (it.answerText.match(/[0-9][0-9,]*/) || [''])[0].replace(/,/g, '')
        : String(x);
      let a, b;
      try { a = evalFormula(sub(lhs)); b = evalFormula(sub(rhs)); }
      catch (e) {
        report(file, id, '評価できる式', lhs + ' / ' + rhs, '式を評価できない: ' + e.message);
        continue;
      }
      // 式どうしが整合していても、問題文を直して invariant を直し忘れると
      // 素通りする。式に現れる数値は、問題文か選択肢のどちらかに実在して
      // いなければならない。
      //
      // さらに、式の各辺は問題文の数値に最低1つは接地している必要がある。
      // 選択肢の数値だけで組み立てられた式は、問題文と繋がっておらず、
      // 問題文を書き換えても追随しない。
      const shown = new Set(it.shown);
      const anywhere = new Set(it.shown.concat(it.inChoices));
      const used = [];
      for (const side of [lhs, rhs]) {
        if (String(side) === 'answer') continue;
        const nums = String(side).match(/[0-9]+/g) || [];
        used.push(...nums);
        for (const n of nums) {
          if (!anywhere.has(n)) {
            report(file, id, '設問にある数値', n,
              '検算式が設問に現れない数値を使っている');
          }
        }
        // 演算子を含む辺は「問題文の数値を組み立てた式」である。その
        // オペランドは問題文に実在しなければならない。これを見ることで、
        // 問題文の金額を書き換えて invariant を直し忘れた誤りが、
        // その数値が誤答の選択肢として残っていても検出できる。
        //
        // 演算子を含まない辺は計算結果であり、問題文ではなく選択肢に
        // 現れるのが正常なので、この検査から外す。
        if (/[+\-*/]/.test(String(side))) {
          for (const n of nums) {
            if (!shown.has(n)) {
              report(file, id, '問題文にある数値', n,
                '計算式のオペランドが問題文にない（問題文の修正に追随していない）');
            }
          }
        }
      }
      // 接地は等式ごとに見る。片方が計算結果（選択肢にしか現れない値）で
      // あるのは正常で、両辺とも問題文と無縁なときだけが問題になる。
      if (used.length && !used.some((n) => shown.has(n))) {
        report(file, id, '問題文の数値を含む式', lhs + ' / ' + rhs,
          '検算式が問題文に接地していない（問題文を直しても追随しない）');
      }

      const tol = opt && Number(opt.tolerance) || 0;
      // 許容誤差には理由を書かせる。黙って許すと、本当の計算違いが
      // tolerance に隠れる。
      if (tol && !(opt && opt.why)) {
        report(file, id, 'tolerance に why', 'なし', '許容誤差の理由が書かれていない');
      }
      if (Math.abs(a - b) > tol + 1e-9) {
        report(file, id, a, b, '検算が合わない（' + lhs + ' ≠ ' + rhs + '）');
      }
    }
  }
});

// ゲート9：進捗記録の健全性。
// 記録の配線が切れても画面には何も現れない。気づくのは数週間後、記録を
// 書き出そうとして空だったときであり、そのデータはもう戻らない。
// ゲート0が mount の実行を検査するのと同じ理由で、機械的に見る。
CHECKS.push(async function checkProgressWiring(page, file) {
  const ready = await page.evaluate(() => typeof window.BokiProgress === 'object');
  if (!ready) {
    report(file, '(progress)', 'BokiProgress あり', 'なし',
      '学習記録が読み込まれていない');
    return;
  }

  // マウント先に id がないと記録先が決まらず、その設問は永久に記録されない。
  const missing = await page.evaluate(() => {
    const out = [];
    for (const slot of ['journal', 'quiz', 'num', 'fill']) {
      for (const { sel } of (window.__captured?.[slot] || [])) {
        const root = document.querySelector(sel);
        if (root && !root.id) out.push(sel);
      }
    }
    return out;
  });
  for (const sel of missing) {
    report(file, sel, 'id あり', 'なし', 'マウント先に id がなく記録できない');
  }

  // 実際に1問解いて採点し、記録が増えることを確かめる。設定の検査だけでは、
  // 配線が外れていても素通りする。
  //
  // 解答せずにボタンを押すと、BokiQuiz は「選択肢を選んでください」で
  // 早期に戻り採点しない。記録がないのが正しい挙動なので、必ず解答してから
  // 押す。ドリルの種類ごとに解答の与え方が違う。
  const grew = await page.evaluate(async () => {
    const drill = document.querySelector('.drill');
    if (!drill) return null;                  // ドリルのないページは対象外
    window.BokiProgress._reset();

    const radio = drill.querySelector('input[type="radio"]');
    if (radio) radio.checked = true;          // BokiQuiz
    for (const sel of drill.querySelectorAll('select')) {
      if (sel.options.length > 1) sel.selectedIndex = 1;   // BokiJournal
    }
    for (const inp of drill.querySelectorAll('input[type="text"]')) {
      inp.value = '1';                        // BokiNum / BokiFill / 金額欄
    }

    const btn = drill.querySelector('.btn');
    if (!btn) return null;
    btn.click();
    await new Promise((r) => setTimeout(r, 60));
    return Object.keys(window.BokiProgress.dump().drills).length;
  });
  if (grew === 0) {
    report(file, '(progress)', '記録が増える', '増えない',
      '採点しても学習記録に残らない');
  }
});

// 壊れた記録でもダッシュボードが開けることを確かめる。ここで例外が出ると、
// 記録が壊れたときに復旧の入口ごと失われる。
CHECKS.push(async function checkDashboardRobust(page, file, errors) {
  if (!/(^|\/)(progress|review)\.html$/.test(file)) return;

  // 壊れ方を1種類しか試さないと、JSON として読めない場合しか通らない。
  // 実際に描画を止めるのは「読めるが形が違う」記録のほうで、こちらは
  // 画面上「記録がない」ようにしか見えず、壊れたことに気づけない。
  const BROKEN = [
    ['壊れたJSON', '{壊れた JSON'],
    ['drills が配列', '{"version":1,"drills":[]}'],
    ['drill値が null', '{"version":1,"drills":{"phase0/x#d/q1":null}}'],
    ['attempts が無い', '{"version":1,"drills":{"phase0/x#d/q1":{}}}'],
    ['attempts が配列でない', '{"version":1,"drills":{"phase0/x#d/q1":{"attempts":1}}}'],
    ['attempts に null 要素', '{"version":1,"drills":{"phase0/x#d/q1":{"attempts":[null]}}}'],
    ['sessions が配列でない', '{"version":1,"sessions":3}'],
  ];

  // 実在する設問への誤答を1件混ぜた、正常な記録も試す。壊れた記録だけを
  // 見ていると、復習ページは常に「復習する設問はありません」で終わり、
  // 再出題のコードが一度も動かないまま素通りする。
  const bank = existsSync('assets/drills.json')
    ? JSON.parse(readFileSync('assets/drills.json', 'utf8')) : { units: {} };
  const unit = Object.keys(bank.units)[0];
  const root = unit && Object.keys(bank.units[unit].drills)[0];
  if (root) {
    BROKEN.push(['正常な要復習', JSON.stringify({
      version: 1, sessions: [], checks: {}, notes: [],
      drills: { [unit + '#' + root + '/q1']:
        { attempts: [{ at: '2026-01-01T00:00:00+09:00', ok: false }] } },
    })]);
  }

  for (const [label, raw] of BROKEN) {
    await page.evaluate((v) => localStorage.setItem('boki2:progress', v), raw);
    errors.length = 0;
    await page.reload({ waitUntil: 'load' });
    // 復習ページは設問バンクを非同期に読む。読み終わる前に見ると、
    // 描画中に投げる例外を取りこぼす。
    await page.waitForTimeout(300);
    const fatal = errors.filter((e) => !/favicon/i.test(e));
    if (fatal.length) {
      report(file, '(robust)', '例外なし', fatal[0],
        '壊れた記録（' + label + '）があると画面が開けない');
    }

    // 例外が出なくても、集計が丸ごと描かれないなら壊れている。
    // progress.html は記録が空でも「まだ記録がありません」を出す。
    const blank = await page.evaluate(() => {
      const ids = ['total', 'units', 'notes', 'review'];
      return ids.filter((id) => {
        const n = document.getElementById(id);
        return n && !n.textContent.trim();
      });
    });
    if (blank.length) {
      report(file, '(robust)', '空でも案内を出す', blank.join(','),
        '壊れた記録（' + label + '）で節が白紙になる');
    }

    // 復習ページは、要復習が1件あるなら実際に出題されなければならない。
    // 何も描かれないまま例外も出ない状態は、検査としては通ってしまう。
    if (label === '正常な要復習' && /review\.html$/.test(file)) {
      const n = await page.evaluate(
        () => document.querySelectorAll('#drills .q').length);
      if (n !== 1) {
        report(file, '(robust)', '1問出題', n + '問',
          '要復習が1件あるのに再出題されない');
      }
    }
  }
});

// ゲート11：設問バンクが単元HTMLと一致しているか。
//
// assets/drills.json は単元HTMLから生成する。復習ドリルはこれを読んで
// 再出題するため、古いままだと、教材で直した設問が復習では直っていない、
// という食い違いが起きる。設問を直した本人には見えない壊れ方をする。
CHECKS.push(async function checkDrillBank(page, file) {
  // ページごとではなく一度だけ走らせる。他のゲートと違い、検査の対象が
  // 単元HTMLではなく生成物そのものであるため。
  if (checkDrillBank.done) return;
  checkDrillBank.done = true;

  if (!existsSync('assets/drills.json')) {
    report('assets/drills.json', '(bank)', 'あり', 'なし',
      '設問バンクがない（npm run build:drills で生成する）');
    return;
  }
  const { build } = await import('./build-drill-bank.mjs');
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
});

// ゲート13：記録IDと設問の対応が動いていないか。
//
// 記録IDの q番号は設問配列の添字である。途中に設問を挿す・消す・並べ替えると
// 以降の番号が1つずつずれるが、番号としては有効なままなので何も壊れて
// 見えない。学習者の localStorage には古い番号で誤答が残っており、復習
// ドリルは「間違えた覚えのない設問」を出したうえ、その正解を元の設問IDに
// 積んで一覧から消す。実際に間違えた設問は復習されないまま消滅する。
//
// 設問を足すときは末尾に足す。文言の推敲で指紋が変わったときは
// reference/drill-ids.json を更新してコミットする（その設問の記録は
// 引き継がれる。中身が同じ設問だという判断は人間が下す）。
CHECKS.push(async function checkDrillIds(page, file) {
  if (checkDrillIds.done) return;
  checkDrillIds.done = true;

  const BASE = 'reference/drill-ids.json';
  if (!existsSync(BASE) || !existsSync('assets/drills.json')) return;

  const base = JSON.parse(readFileSync(BASE, 'utf8'));
  const bank = JSON.parse(readFileSync('assets/drills.json', 'utf8'));

  for (const [unit, u] of Object.entries(bank.units)) {
    for (const [root, d] of Object.entries(u.drills)) {
      const key = unit + '#' + root;
      const was = base[key];
      // 新しいドリルには過去の記録がない。ずれようがないので通す。
      if (!was) continue;
      const now = d.fingerprints || [];
      // 末尾への追加は既存の番号を動かさない。先頭からの一致だけを見る。
      const n = Math.min(was.length, now.length);
      for (let i = 0; i < n; i++) {
        if (was[i] !== now[i]) {
          report(u.href, root + '/q' + (i + 1), was[i], now[i],
            '設問の並びが変わり、過去の記録が別の設問を指している');
          break;
        }
      }
      if (now.length < was.length) {
        report(u.href, root, was.length + '問', now.length + '問',
          '設問が減り、末尾の記録が行き場を失った');
      }
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

// 直接実行されたときだけ検査を走らせる。テストから evalFormula を
// import しても、ブラウザが起動しないようにする。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
