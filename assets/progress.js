/* progress.html のスクリプト。assets/app.js の後に読み込む。 */
(function () {
  'use strict';
  const P = window.BokiProgress;
  const el = window.BokiBank.el;
  function hm(sec) {
    const m = Math.round(sec / 60);
    return Math.floor(m / 60) + 'h' + (m % 60) + 'm';
  }
  // 週の始まりは月曜。学習カリキュラムが月曜起点で週を数えている。
  function weekStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }

  // 壊れた記録でもダッシュボードは開けなければならない。ここで例外が
  // 出ると、記録が壊れたときに復旧の入口ごと失われる。
  let data;
  try { data = P.dump(); }
  catch (e) { data = { version: 1, sessions: [], drills: {}, checks: {}, notes: [] }; }

  const sessions = data.sessions || [];
  const drills = data.drills || {};
  const checks = data.checks || {};
  const notes = data.notes || [];

  // 日付は保存時のローカル時刻で記録されている。ISO 文字列を切り出すと
  // UTC 基準になり、深夜の学習が前日に寄るため Date に通して数える。
  function dayKey(iso) {
    const t = new Date(iso);
    if (!isFinite(t.getTime())) return null;
    return t.getFullYear() + '-' +
      ('0' + (t.getMonth() + 1)).slice(-2) + '-' +
      ('0' + t.getDate()).slice(-2);
  }
  const WD = ['日', '月', '火', '水', '木', '金', '土'];

  /* 1. これまで */
  const byDay = {};
  let totalSec = 0;
  sessions.forEach(function (s) {
    const sec = Number(s.sec) || 0;
    const k = dayKey(s.start);
    totalSec += sec;
    if (k) byDay[k] = (byDay[k] || 0) + sec;
  });
  const dayKeys = Object.keys(byDay).sort();

  const tt = document.getElementById('total');
  tt.appendChild(el('p', 'big', hm(totalSec)));
  if (dayKeys.length) {
    tt.appendChild(el('div', 'progresstext',
      dayKeys.length + '日 ／ 1日あたり ' + hm(totalSec / dayKeys.length) +
      ' ／ ' + dayKeys[0].replace(/-/g, '/') + ' から'));
  } else {
    tt.appendChild(el('div', 'progresstext', 'まだ記録がありません。'));
  }

  /* 2. 今週 */
  const ws = weekStart();
  const weekSec = sessions.reduce(function (a, s) {
    const t = new Date(s.start);
    return a + (isFinite(t.getTime()) && t >= ws ? (Number(s.sec) || 0) : 0);
  }, 0);
  const TARGET = 23 * 3600;
  const pct = Math.round(weekSec / TARGET * 100);
  const wk = document.getElementById('week');
  wk.appendChild(el('p', 'big', hm(weekSec) + ' / 23h'));
  const bar = el('div', 'progressbar');
  const fill = el('i');
  fill.style.width = Math.min(100, pct) + '%';
  bar.appendChild(fill);
  wk.appendChild(bar);
  wk.appendChild(el('div', 'progresstext', pct + '%（月曜起点）'));

  /* 3. 日別 */
  const dl = document.getElementById('days');
  // 1日の最長を基準に伸ばす。目標時間を基準にすると、目標未達の日が
  // どれも同じくらい短く見えて日ごとの差が読めなくなる。
  const maxDay = dayKeys.reduce(function (a, k) { return Math.max(a, byDay[k]); }, 0);
  if (!dayKeys.length) dl.appendChild(el('p', 'small muted', 'まだ記録がありません。'));
  dayKeys.slice().reverse().forEach(function (k) {
    const d = new Date(k + 'T00:00:00');
    const row = el('div', 'row');
    row.appendChild(el('span', 'row__id', k.replace(/-/g, '/') + '（' + WD[d.getDay()] + '）'));
    row.appendChild(el('span', 'row__meta', hm(byDay[k])));
    const b = el('div', 'progressbar daybar');
    const f = el('i');
    f.style.width = Math.round(byDay[k] / maxDay * 100) + '%';
    b.appendChild(f);
    row.appendChild(b);
    dl.appendChild(row);
  });

  /* 4. 要復習 */
  // 記録IDは「単元パス#マウント先のid/q番号」。設問には app.js が
  // 「マウント先のid-q番号」でidを振っているので、設問そのものへ飛べる。
  const CLEAR_STREAK = P.CLEAR_STREAK;
  function drillLink(id) {
    const r = P.parseId(id);
    if (!r) return null;
    return { href: r.unit + '.html#' + r.root + '-q' + r.q, unit: r.unit, q: r.q };
  }

  // 判定は BokiProgress.due() が持つ。review.html の出題対象と同じものを
  // 使わないと、一覧に出ているのに出題されない設問ができる。
  // 並び順だけこの画面の都合で決める（直近の誤答が新しい順）。
  let review;
  try { review = P.due(); }
  catch (e) { review = []; }
  review.sort(function (a, b) { return a.last < b.last ? 1 : -1; });

  const rv = document.getElementById('review');
  if (!review.length) rv.appendChild(el('p', 'small muted', '要復習の設問はありません。'));
  review.forEach(function (r) {
    const row = el('div', 'row');
    const link = drillLink(r.id);
    if (link) {
      const a = el('a', 'row__id', link.unit + ' 第' + link.q + '問');
      a.href = link.href;
      row.appendChild(a);
    } else {
      row.appendChild(el('span', 'row__id', r.id));
    }
    row.appendChild(el('span', 'row__meta',
      r.wrong + '誤 / ' + r.total + '回'));
    row.appendChild(el('span', 'row__meta',
      r.streak ? '連続正解 ' + r.streak + '/' + CLEAR_STREAK : '未正解'));
    row.appendChild(el('span', 'row__meta', String(r.last).slice(0, 10)));
    rv.appendChild(row);
  });

  /* 5. 単元別 */
  const units = {};
  function slot(u) {
    if (!units[u]) units[u] = { sec: 0, ok: 0, n: 0, checked: 0, total: 0 };
    return units[u];
  }
  sessions.forEach(function (s) { slot(s.unit).sec += Number(s.sec) || 0; });
  Object.keys(drills).forEach(function (id) {
    const at = drills[id].attempts || [];
    if (!at.length) return;
    const s = slot(id.split('#')[0]);
    s.n++;
    if (at[at.length - 1].ok) s.ok++;
  });
  Object.keys(checks).forEach(function (u) {
    const s = slot(u), c = checks[u];
    for (const k in c) { s.total++; if (c[k]) s.checked++; }
  });

  const ul = document.getElementById('units');
  const names = Object.keys(units).sort();
  if (!names.length) ul.appendChild(el('p', 'small muted', 'まだ記録がありません。'));
  names.forEach(function (u) {
    const s = units[u], row = el('div', 'row');
    row.appendChild(el('span', 'row__id', u));
    row.appendChild(el('span', 'row__meta', hm(s.sec)));
    row.appendChild(el('span', 'row__meta',
      s.n ? '正答 ' + Math.round(s.ok / s.n * 100) + '%（' + s.n + '問）' : 'ドリルなし'));
    if (s.total) row.appendChild(el('span', 'row__meta',
      'チェック ' + s.checked + '/' + s.total));
    ul.appendChild(row);
  });

  /* 6. メモ */
  const nl = document.getElementById('notes');
  if (!notes.length) nl.appendChild(el('p', 'small muted', 'メモはまだありません。'));
  notes.slice().reverse().forEach(function (n) {
    const row = el('div', 'row');
    row.appendChild(el('span', 'row__meta', String(n.at).slice(0, 10)));
    row.appendChild(el('span', 'row__id', n.unit));
    row.appendChild(el('span', 'note__text', n.text));
    nl.appendChild(row);
  });

  /* 7. エクスポート */
  document.getElementById('export').addEventListener('click', function () {
    const msg = document.getElementById('export-msg');
    const json = P.exportJSON();
    function showText() {
      const ta = document.getElementById('export-text');
      ta.value = json;
      ta.hidden = false;
      ta.focus();
      ta.select();
      msg.textContent = '自動でコピーできなかった。下の欄を選択済みなので、そのままコピーしてください。';
    }
    // clipboard の存在を前提にしない。http の LAN アドレスなど非セキュアコンテキストでは undefined になる
    if (!navigator.clipboard) return showText();
    navigator.clipboard.writeText(json).then(function () {
      msg.textContent = 'コピーした。Claude に貼ってください。';
    }, showText);
  });

  /* 8. 全消去 */
  document.getElementById('wipe').addEventListener('click', function () {
    if (!confirm('すべての学習記録を消します。元に戻せません。よろしいですか。')) return;
    P._reset();
    document.getElementById('wipe-msg').textContent = '消去した。再読み込みしてください。';
  });
})();
