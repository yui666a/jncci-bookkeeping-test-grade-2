// 単元HTMLに埋め込まれた設問を assets/drills.json へ書き出す。
//
// 設問は mount() の引数として単元HTMLの中にある。復習ページはそれを
// 単元HTMLを開かずに引く必要があるため、機械可読な形に写す。
//
// 抽出に正規表現を使わない。check.mjs と同じく Playwright で file:// を
// 開き、mount() に渡された設定オブジェクトをそのまま捕捉する。設問の
// explain には HTML 文字列が入り、配列やネストしたオブジェクトも持つ。
import { readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const OUT = 'assets/drills.json';

// mount() を横取りして設定を捕まえる。app.js は末尾で window に代入する
// ため、setter を先に仕込んでおけば確実に掴める。
const CAPTURE = () => {
  window.__bank = [];
  const kinds = { BokiJournal: 'journal', BokiQuiz: 'quiz',
                  BokiNum: 'num', BokiFill: 'fill' };
  for (const [name, kind] of Object.entries(kinds)) {
    let real;
    Object.defineProperty(window, name, {
      configurable: true,
      get() { return real; },
      set(v) {
        const orig = v.mount.bind(v);
        v.mount = (sel, cfg) => {
          window.__bank.push({ kind, sel, cfg });
          return orig(sel, cfg);
        };
        real = v;
      },
    });
  }
};

function unitFiles() {
  const found = [];
  for (const dir of readdirSync('.', { withFileTypes: true })) {
    if (!dir.isDirectory() || !/^phase\d+$/.test(dir.name)) continue;
    for (const f of readdirSync(dir.name)) {
      // 目次ページに設問はない。開くだけ無駄になる。
      if (f.endsWith('.html') && f !== 'index.html') found.push(join(dir.name, f));
    }
  }
  return found.sort();
}

// 記録IDと同じ規則で単元キーを作る。app.js の unitKeyOf と揃っていないと、
// localStorage に貯まった要復習IDが設問バンクと結びつかない。
function unitKeyOf(file) {
  return file.replace(/\.html?$/, '').split('/').slice(-2).join('/');
}

// write:false で呼ぶと、書き出さずに中身だけ返す。検査が生成物を
// 書き換えてしまうと、古いまま指摘された生成物がその場で直り、次の実行
// では素通りする。指摘が1回しか出ない検査は当てにならない。
export async function build(opts) {
  const write = !opts || opts.write !== false;
  const files = unitFiles();
  const browser = await chromium.launch();
  const units = {};
  const problems = [];
  let total = 0;

  try {
    for (const file of files) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.addInitScript(CAPTURE);
      await page.goto('file://' + resolve(file), { waitUntil: 'load' });

      const mounts = await page.evaluate(() => {
        // cfg は丸ごと写す。使う項目だけを選んで写すと、あとから
        // mount() に設定を足したとき、復習ページだけ既定値で動く。
        // 落ちたことは画面に出ず、設問の見た目が少し違うだけになる。
        return (window.__bank || []).map(({ kind, sel, cfg }) => ({
          kind,
          // 記録IDはセレクタではなくマウント先の id で決まる。
          // mount('.foo') のように id 以外で指しても動くため、DOM から
          // 実際の id を読む。セレクタから '#' を取り除くだけだと、
          // 記録IDと結びつかない root が黙って混ざる。
          root: (document.querySelector(sel) || {}).id || '',
          sel: String(sel),
          cfg: JSON.parse(JSON.stringify(cfg)),
          // JSON 化で消える値を報告させる。関数・undefined は黙って
          // 落ち、NaN・Infinity は null になる。落ちたまま配ると、
          // 復習ページだけ設問の挙動が変わる。
          lost: (function () {
            const out = [];
            (function walk(v, path) {
              if (typeof v === 'function' || v === undefined) { out.push(path); return; }
              if (typeof v === 'number' && !isFinite(v)) { out.push(path); return; }
              if (v && typeof v === 'object') {
                for (const k of Object.keys(v)) walk(v[k], path + '.' + k);
              }
            })(cfg, '');
            return out;
          })(),
        }));
      });
      await page.close();

      // 捕捉が空になるのは、JSエラーでアセットの読込に失敗したとき。
      // 気づかずに書き出すと、その単元の設問が丸ごと欠けたバンクが
      // できあがる。check.mjs のゲート0と同じ理由で、宣言数と突き合わせる。
      const declared = (readFileSync(file, 'utf8')
        .match(/\bBoki(?:Journal|Quiz|Num|Fill)\s*\.\s*mount\s*\(/g) || []).length;
      if (declared !== mounts.length) {
        problems.push(file + ': mount ' + declared + '件のうち ' +
          mounts.length + '件しか捕捉できなかった' +
          (errors.length ? '（' + errors[0] + '）' : ''));
        continue;
      }

      const unit = unitKeyOf(file);
      units[unit] = { href: file, drills: {} };
      for (const m of mounts) {
        if (!m.root) {
          problems.push(file + ': mount 先に id がない（' + m.sel + '）');
          continue;
        }
        if (m.lost.length) {
          problems.push(file + '#' + m.root + ': JSON にできない値がある（' +
            m.lost.join(' ') + '）');
          continue;
        }
        units[unit].drills[m.root] = {
          kind: m.kind, root: m.root,
          // 設問ごとの指紋。記録IDの q番号は配列の添字であり、途中に
          // 設問を挿すと以降が1つずつずれる。ずれても番号としては有効な
          // ままなので、復習ページは「間違えた覚えのない設問」を出し、
          // その正解を元の設問IDに積んでしまう。ゲート13がこの列を
          // 見張り、番号と設問の対応が動いたことを検出する。
          fingerprints: (m.cfg.questions || []).map(fingerprint),
          cfg: m.cfg
        };
        total += (m.cfg.questions || []).length;
      }
    }
  } finally {
    await browser.close();
  }

  if (problems.length) {
    for (const p of problems) console.log('NG ' + p);
    return { ok: false, total: 0 };
  }

  // キー順に書き出す。順序が実行ごとに揺れると、設問が変わっていない
  // のに差分が出て、生成物が最新かの検査が当てにならなくなる。
  const bank = { version: 1, units: sortDeep(units) };
  const text = JSON.stringify(bank, null, 1) + '\n';
  if (write) writeFileSync(OUT, text);
  return { ok: true, total, units: Object.keys(units).length, text };
}

// 設問文から短い指紋を作る。設問の中身が同じなら同じ値になればよく、
// 衝突の起きにくさより、差分を読んだときに人が追える短さを優先する。
// 解説の推敲では変わらないよう、問題文だけを見る。
export function fingerprint(q) {
  const s = String((q && q.text) || '');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

function sortDeep(o) {
  if (Array.isArray(o) || o === null || typeof o !== 'object') return o;
  const out = {};
  for (const k of Object.keys(o).sort()) out[k] = sortDeep(o[k]);
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = await build();
  if (!r.ok) process.exit(1);
  console.log('OK ' + OUT + ' に ' + r.units + '単元 ' + r.total + '問を書き出した');
}
