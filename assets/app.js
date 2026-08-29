/* ===========================================================
   日商簿記2級 学習教材 共通スクリプト
   外部ライブラリ不使用。file:// で直接開いて動作する。
   =========================================================== */
(function () {
  'use strict';

  /* ---------- localStorage は失敗しても致命傷にしない ---------- */
  var LS = {
    get: function (k, d) {
      try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); }
      catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できなくても続行 */ }
    }
  };
  // 単元キーはディレクトリを含める。ファイル名だけだと phase0/01_... と
  // phase1/01_... が同じキーになり、別単元の記録が混ざる。
  function unitKeyOf(pathname) {
    var p = pathname.replace(/^\/+/, '').replace(/\.html?$/, '');
    var seg = p.split('/').filter(Boolean);
    if (!seg.length) return 'index';
    return seg.slice(-2).join('/');
  }
  var PAGE = unitKeyOf(location.pathname);

  /* ---------- 学習記録 ---------- */
  var PROGRESS_KEY = 'boki2:progress';
  var PROGRESS_VERSION = 1;

  function emptyProgress() {
    return { version: PROGRESS_VERSION, sessions: [], drills: {}, checks: {}, notes: [] };
  }

  // 保存された値が壊れていても、そこで学習が止まらないようにする。
  // 形が違えば初期値に戻すが、version が未来のものはそのまま保持して
  // 上書きを避ける（新しい版で書かれた記録を古い版が壊さない）。
  function loadProgress() {
    var raw = LS.get(PROGRESS_KEY, null);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyProgress();
    var base = emptyProgress();
    if (typeof raw.version === 'number') base.version = raw.version;
    if (Array.isArray(raw.sessions)) base.sessions = raw.sessions;
    if (Array.isArray(raw.notes)) base.notes = raw.notes;
    if (raw.drills && typeof raw.drills === 'object') base.drills = raw.drills;
    if (raw.checks && typeof raw.checks === 'object') base.checks = raw.checks;
    return base;
  }

  function saveProgress(p) { LS.set(PROGRESS_KEY, p); }

  // ローカルタイムゾーン付きの ISO 8601。toISOString() は UTC になり、
  // 深夜に学習した記録が前日にずれて見える。
  function nowISO() {
    var d = new Date();
    var off = -d.getTimezoneOffset();
    var sign = off >= 0 ? '+' : '-';
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) +
      'T' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) +
      sign + p2(Math.floor(Math.abs(off) / 60)) + ':' + p2(Math.abs(off) % 60);
  }

  var BokiProgress = {
    unitKey: function () { return PAGE; },
    now: nowISO,
    dump: loadProgress,
    exportJSON: function () {
      var p = loadProgress();
      p.exportedAt = nowISO();
      return JSON.stringify(p);
    },
    record: function (drillId, ok) {
      var p = loadProgress();
      if (!p.drills[drillId]) p.drills[drillId] = { attempts: [] };
      p.drills[drillId].attempts.push({ at: nowISO(), ok: !!ok });
      saveProgress(p);
    },
    check: function (unitKey, key, checked) {
      var p = loadProgress();
      if (!p.checks[unitKey]) p.checks[unitKey] = {};
      p.checks[unitKey][key] = !!checked;
      saveProgress(p);
    },
    // ページ別キーで保存されていたチェックを取り込む。旧キーは消さない。
    // 消しても得るものがなく、取り込みに失敗したときの復元手段が絶たれる。
    migrateLegacy: function () {
      var p = loadProgress(), moved = false;
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        var m = k && k.match(/^boki2:(.+):check$/);
        if (!m) continue;
        // ディレクトリを含まない旧形式のキーは、いま開いている単元のものとみなす。
        var unit = m[1].indexOf('/') >= 0 ? m[1] : PAGE;
        var old = LS.get(k, null);
        if (!old || typeof old !== 'object') continue;
        if (!p.checks[unit]) p.checks[unit] = {};
        for (var key in old) {
          if (p.checks[unit][key] === undefined) { p.checks[unit][key] = !!old[key]; moved = true; }
        }
      }
      if (moved) saveProgress(p);
    },
    // 10秒未満は捨てる。ページを開いて即閉じた区間が積もると集計が
    // 読めなくなるうえ、学習時間としての意味もない。
    addSession: function (unitKey, startISO, sec) {
      sec = Math.round(sec);
      if (!(sec >= 10)) return;
      var p = loadProgress();
      p.sessions.push({ unit: unitKey, start: startISO, sec: sec });
      saveProgress(p);
    },
    _reset: function () { saveProgress(emptyProgress()); }
  };

  /* ---------- テーマ切替 ---------- */
  function initTheme() {
    var saved = LS.get('boki2:theme', null);
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    var btn = document.querySelector('.theme-btn');
    if (!btn) return;
    function label() {
      var t = document.documentElement.getAttribute('data-theme');
      btn.textContent = t === 'dark' ? '☾ ダーク' : (t === 'light' ? '☀ ライト' : '◐ 自動');
    }
    label();
    btn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      var next = cur === 'light' ? 'dark' : (cur === 'dark' ? '' : 'light');
      if (next) { document.documentElement.setAttribute('data-theme', next); LS.set('boki2:theme', next); }
      else { document.documentElement.removeAttribute('data-theme'); LS.set('boki2:theme', ''); }
      label();
    });
  }

  /* ---------- チェックリストの進捗保存 ---------- */
  function initChecklists() {
    BokiProgress.migrateLegacy();
    var boxes = document.querySelectorAll('input[type="checkbox"][data-key]');
    if (!boxes.length) return;
    var store = (BokiProgress.dump().checks || {})[PAGE] || {};

    Array.prototype.forEach.call(boxes, function (b) {
      if (store[b.dataset.key]) b.checked = true;
      b.addEventListener('change', function () {
        BokiProgress.check(PAGE, b.dataset.key, b.checked);
        updateBars();
      });
    });

    function updateBars() {
      document.querySelectorAll('[data-progress-for]').forEach(function (bar) {
        var scope = document.querySelector(bar.dataset.progressFor);
        if (!scope) return;
        var all = scope.querySelectorAll('input[type="checkbox"][data-key]');
        var done = scope.querySelectorAll('input[type="checkbox"][data-key]:checked');
        var pct = all.length ? Math.round(done.length / all.length * 100) : 0;
        var fill = bar.querySelector('i');
        if (fill) fill.style.width = pct + '%';
        var txt = document.querySelector('[data-progress-text-for="' + bar.dataset.progressFor + '"]');
        if (txt) txt.textContent = done.length + ' / ' + all.length + ' 完了（' + pct + '%）';
      });
    }
    updateBars();

    document.querySelectorAll('[data-reset-progress]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(boxes, function (b) {
          b.checked = false;
          BokiProgress.check(PAGE, b.dataset.key, false);
        });
        updateBars();
      });
    });
  }

  /* ---------- 学習時間の計測 ---------- */
  // 経過時間ではなく能動時間を測る。タブを開いたまま離席した時間が
  // 学習時間に入ると、計画の週23時間を満たしているように見えて実際は
  // 足りていない、という最も避けたい壊れ方をする。
  var IDLE_MS = 5 * 60 * 1000;

  function initSession() {
    var startedAt = Date.now();
    var startISO = nowISO();
    var lastActive = Date.now();
    var accrued = 0;
    var running = true;

    function touch() { lastActive = Date.now(); }
    ['keydown', 'click', 'scroll', 'pointerdown'].forEach(function (ev) {
      document.addEventListener(ev, touch, { passive: true });
    });

    // 直近の操作から IDLE_MS を超えた分は加算しない。
    function slice() {
      if (!running) return;
      var now = Date.now();
      var cut = Math.min(now, lastActive + IDLE_MS);
      if (cut > startedAt) accrued += (cut - startedAt) / 1000;
      startedAt = now;
    }

    function flush() {
      slice();
      if (accrued >= 10) BokiProgress.addSession(PAGE, startISO, accrued);
      accrued = 0;
      running = false;
    }

    function resume() {
      startedAt = Date.now();
      lastActive = Date.now();
      startISO = nowISO();
      accrued = 0;
      running = true;
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) flush();
      else resume();
    });
    // pagehide は bfcache と離脱の双方で発火する。beforeunload は
    // Safari で発火しないことがあるため使わない。
    window.addEventListener('pagehide', flush);

    // 長時間の学習でも記録を失わないよう、定期的に確定させる。
    setInterval(function () {
      slice();
      if (accrued >= 60) {
        BokiProgress.addSession(PAGE, startISO, accrued);
        accrued = 0;
        startISO = nowISO();
      }
    }, 60 * 1000);

    // テストから経過時間を差し込む。実時間の経過を待つ検査は遅いうえ
    // 不安定になる。
    BokiProgress.__testTick = function (deltaSec, lastActiveDeltaSec) {
      startedAt += deltaSec * 1000;
      lastActive = lastActiveDeltaSec === undefined
        ? Date.now() : Date.now() + lastActiveDeltaSec * 1000;
    };
  }

  /* ---------- 共通ヘルパ ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function fmt(n) { return Number(n).toLocaleString('ja-JP'); }
  function parseAmt(s) {
    if (s === null || s === undefined) return NaN;
    s = String(s).replace(/[,\s，]/g, '').replace(/[０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    });
    if (s === '') return NaN;
    return Number(s);
  }
  function shell(root, cfg, badgeText) {
    root.classList.add('drill');
    var head = el('div', 'drill__head');
    head.appendChild(el('span', 'drill__badge', badgeText));
    head.appendChild(el('span', 'drill__title', cfg.title || '練習問題'));
    var score = el('span', 'drill__score', '');
    head.appendChild(score);
    var body = el('div', 'drill__body');
    root.appendChild(head); root.appendChild(body);
    return { body: body, score: score };
  }
  // 記録先を決めるにはマウント先の id が要る。id がない設問は記録しない
  // （品質ゲート9がこれを検出する）。
  function drillBaseOf(root) {
    return root && root.id ? PAGE + '#' + root.id : null;
  }

  // 採点の確定点は4種のドリルで共通してここを通る。記録をここに置けば、
  // 単元HTMLの著者が記録用のコードを書く必要がなくなる。書き忘れが
  // 起きうる場所に記録を置くと、失われたデータは後から復元できない。
  function makeScorer(scoreEl, total, drillBase) {
    var state = {};
    return function (id, ok) {
      state[id] = ok;
      if (drillBase) BokiProgress.record(drillBase + '/q' + (id + 1), ok);
      var done = 0, right = 0;
      for (var k in state) { done++; if (state[k]) right++; }
      scoreEl.textContent = '正解 ' + right + ' / 解答済 ' + done + '（全' + total + '問）';
    };
  }

  /* ===========================================================
     1. 仕訳入力ドリル
     BokiJournal.mount('#id', {
       title, accounts:['現金', ...],
       questions:[{ text, debit:[['仕入',100000]], credit:[['買掛金',100000]], explain, hint }]
     })
     =========================================================== */
  var BokiJournal = {
    mount: function (sel, cfg) {
      var root = document.querySelector(sel);
      if (!root) return;
      var ui = shell(root, cfg, '仕訳ドリル');
      var report = makeScorer(ui.score, cfg.questions.length, drillBaseOf(root));

      cfg.questions.forEach(function (q, i) {
        var accounts = q.accounts || cfg.accounts;
        var wrapQ = el('div', 'q');
        var head = el('p', 'q__text');
        head.appendChild(el('span', 'q__no', 'Q' + (i + 1)));
        var span = el('span'); span.innerHTML = q.text; head.appendChild(span);
        wrapQ.appendChild(head);

        // 解答欄は常に4行。行数から正解の科目数が読めてしまうと本番の第1問と条件が変わる。
        // 未選択・未入力の行は collect() が無視するため、余った行は採点に影響しない。
        var nRows = Math.max(4, q.debit.length, q.credit.length);
        var tw = el('div', 'tablewrap');
        var t = el('table', 'jinput');
        t.innerHTML = '<thead><tr><th class="dh" colspan="2">借方</th><th class="ch" colspan="2">貸方</th></tr>' +
          '<tr><th class="dh">勘定科目</th><th class="dh">金額</th><th class="ch">勘定科目</th><th class="ch">金額</th></tr></thead>';
        var tb = el('tbody');
        for (var r = 0; r < nRows; r++) {
          var tr = el('tr');
          ['d', 'c'].forEach(function (side) {
            var td1 = el('td'), td2 = el('td');
            var s = el('select');
            s.appendChild(new Option('— 選択 —', ''));
            accounts.forEach(function (a) { s.appendChild(new Option(a, a)); });
            s.dataset.side = side;
            td1.appendChild(s);
            var inp = el('input', 'amt');
            inp.type = 'text'; inp.inputMode = 'numeric'; inp.placeholder = '0';
            inp.dataset.side = side;
            td2.appendChild(inp);
            tr.appendChild(td1); tr.appendChild(td2);
          });
          tb.appendChild(tr);
        }
        t.appendChild(tb); tw.appendChild(t); wrapQ.appendChild(tw);

        var fb = el('div', 'fb');
        var row = el('div', 'btn-row');
        var bCheck = el('button', 'btn btn--sm', '採点する');
        var bAns = el('button', 'btn btn--ghost btn--sm', '答えを見る');
        row.appendChild(bCheck); row.appendChild(bAns);
        if (q.hint) {
          var bHint = el('button', 'linkbtn', 'ヒント');
          var hintBox = el('div', 'small muted');
          hintBox.style.display = 'none';
          hintBox.textContent = 'ヒント：' + q.hint;
          bHint.addEventListener('click', function () {
            hintBox.style.display = hintBox.style.display === 'none' ? 'block' : 'none';
          });
          row.appendChild(bHint);
          wrapQ.appendChild(row); wrapQ.appendChild(hintBox);
        } else {
          wrapQ.appendChild(row);
        }
        wrapQ.appendChild(fb);
        ui.body.appendChild(wrapQ);

        function collect(side) {
          var out = [];
          Array.prototype.forEach.call(tb.querySelectorAll('tr'), function (tr) {
            var s = tr.querySelector('select[data-side="' + side + '"]');
            var a = tr.querySelector('input[data-side="' + side + '"]');
            var v = parseAmt(a.value);
            if (s.value && !isNaN(v)) out.push([s.value, v]);
          });
          return out;
        }
        function same(got, want) {
          if (got.length !== want.length) return false;
          var pool = want.slice();
          for (var i2 = 0; i2 < got.length; i2++) {
            var hit = -1;
            for (var j = 0; j < pool.length; j++) {
              if (pool[j][0] === got[i2][0] && Number(pool[j][1]) === Number(got[i2][1])) { hit = j; break; }
            }
            if (hit < 0) return false;
            pool.splice(hit, 1);
          }
          return true;
        }
        function answerHTML() {
          var n = Math.max(q.debit.length, q.credit.length), rows = '';
          for (var k = 0; k < n; k++) {
            var d = q.debit[k], c = q.credit[k];
            rows += '<tr>' +
              '<td class="d">' + (d ? d[0] : '') + '</td><td class="d amt">' + (d ? fmt(d[1]) : '') + '</td>' +
              '<td class="c">' + (c ? c[0] : '') + '</td><td class="c amt">' + (c ? fmt(c[1]) : '') + '</td></tr>';
          }
          return '<div class="tablewrap"><table class="jnl"><thead><tr><th>借方科目</th><th class="amt">金額</th>' +
            '<th>貸方科目</th><th class="amt">金額</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
            (q.explain ? '<div>' + q.explain + '</div>' : '');
        }

        bCheck.addEventListener('click', function () {
          var ok = same(collect('d'), q.debit) && same(collect('c'), q.credit);
          fb.className = 'fb show ' + (ok ? 'fb--ok' : 'fb--ng');
          fb.innerHTML = '<div class="fb__head ' + (ok ? 'ok' : 'ng') + '">' +
            (ok ? '正解' : '不正解 — 正しい仕訳はこちら') + '</div>' + (ok ? answerHTML() : answerHTML());
          report(i, ok);
        });
        bAns.addEventListener('click', function () {
          fb.className = 'fb show fb--ok';
          fb.innerHTML = '<div class="fb__head ok">解答</div>' + answerHTML();
        });
      });
    }
  };

  /* ===========================================================
     2. 選択式クイズ
     BokiQuiz.mount('#id', { title, questions:[{ text, choices:[], answer:0, explain }] })
     =========================================================== */
  var BokiQuiz = {
    mount: function (sel, cfg) {
      var root = document.querySelector(sel);
      if (!root) return;
      var ui = shell(root, cfg, '確認テスト');
      var report = makeScorer(ui.score, cfg.questions.length, drillBaseOf(root));

      cfg.questions.forEach(function (q, i) {
        var wrapQ = el('div', 'q');
        var head = el('p', 'q__text');
        head.appendChild(el('span', 'q__no', 'Q' + (i + 1)));
        var sp = el('span'); sp.innerHTML = q.text; head.appendChild(sp);
        wrapQ.appendChild(head);

        var box = el('div', 'choices');
        var name = 'q_' + Math.random().toString(36).slice(2) + '_' + i;
        q.choices.forEach(function (c, ci) {
          var lab = el('label', 'choice');
          var r = el('input'); r.type = 'radio'; r.name = name; r.value = ci;
          var s = el('span'); s.innerHTML = c;
          lab.appendChild(r); lab.appendChild(s);
          box.appendChild(lab);
        });
        wrapQ.appendChild(box);

        var fb = el('div', 'fb');
        var row = el('div', 'btn-row');
        var b = el('button', 'btn btn--sm', '採点する');
        row.appendChild(b);
        wrapQ.appendChild(row); wrapQ.appendChild(fb);
        ui.body.appendChild(wrapQ);

        b.addEventListener('click', function () {
          var picked = box.querySelector('input:checked');
          if (!picked) {
            fb.className = 'fb show fb--ng';
            fb.innerHTML = '<div class="fb__head ng">選択肢を選んでください</div>';
            return;
          }
          var ok = Number(picked.value) === q.answer;
          Array.prototype.forEach.call(box.children, function (lab, ci) {
            lab.classList.remove('is-correct', 'is-wrong');
            if (ci === q.answer) lab.classList.add('is-correct');
            else if (ci === Number(picked.value)) lab.classList.add('is-wrong');
          });
          fb.className = 'fb show ' + (ok ? 'fb--ok' : 'fb--ng');
          fb.innerHTML = '<div class="fb__head ' + (ok ? 'ok' : 'ng') + '">' + (ok ? '正解' : '不正解') + '</div>' +
            (q.explain ? '<div>' + q.explain + '</div>' : '');
          report(i, ok);
        });
      });
    }
  };

  /* ===========================================================
     3. 数値回答ドリル
     BokiNum.mount('#id', { title, badge, questions:[{ text, answer, unit, hint, explain, tolerance }] })
     answer は数値、または [数値, 数値, ...]（複数欄）
     =========================================================== */
  var BokiNum = {
    mount: function (sel, cfg) {
      var root = document.querySelector(sel);
      if (!root) return;
      var ui = shell(root, cfg, cfg.badge || '計算ドリル');
      var report = makeScorer(ui.score, cfg.questions.length, drillBaseOf(root));

      cfg.questions.forEach(function (q, i) {
        var answers = Array.isArray(q.answer) ? q.answer : [q.answer];
        var labels = q.labels || [];
        var wrapQ = el('div', 'q');
        var head = el('p', 'q__text');
        head.appendChild(el('span', 'q__no', 'Q' + (i + 1)));
        var sp = el('span'); sp.innerHTML = q.text; head.appendChild(sp);
        wrapQ.appendChild(head);

        var inputs = [];
        answers.forEach(function (a, ai) {
          var line = el('div', 'numq');
          if (labels[ai]) line.appendChild(el('span', 'small', labels[ai]));
          var inp = el('input', 'amt'); inp.type = 'text'; inp.inputMode = 'decimal'; inp.placeholder = '0';
          line.appendChild(inp);
          if (q.unit) line.appendChild(el('span', 'unit', q.unit));
          inputs.push(inp);
          wrapQ.appendChild(line);
        });

        var fb = el('div', 'fb');
        var row = el('div', 'btn-row');
        var bCheck = el('button', 'btn btn--sm', '採点する');
        var bAns = el('button', 'btn btn--ghost btn--sm', '答えを見る');
        row.appendChild(bCheck); row.appendChild(bAns);
        if (q.hint) {
          var bHint = el('button', 'linkbtn', 'ヒント');
          var hintBox = el('div', 'small muted'); hintBox.style.display = 'none';
          hintBox.innerHTML = 'ヒント：' + q.hint;
          bHint.addEventListener('click', function () {
            hintBox.style.display = hintBox.style.display === 'none' ? 'block' : 'none';
          });
          row.appendChild(bHint);
          wrapQ.appendChild(row); wrapQ.appendChild(hintBox);
        } else { wrapQ.appendChild(row); }
        wrapQ.appendChild(fb);
        ui.body.appendChild(wrapQ);

        function ansHTML() {
          var list = answers.map(function (a, ai) {
            return '<li>' + (labels[ai] ? labels[ai] + ' ' : '') + '<strong>' + fmt(a) + (q.unit || '') + '</strong></li>';
          }).join('');
          return '<ul>' + list + '</ul>' + (q.explain ? '<div>' + q.explain + '</div>' : '');
        }

        bCheck.addEventListener('click', function () {
          var tol = q.tolerance === undefined ? 0 : q.tolerance;
          var ok = true;
          inputs.forEach(function (inp, ai) {
            var v = parseAmt(inp.value);
            if (isNaN(v) || Math.abs(v - answers[ai]) > tol) ok = false;
          });
          fb.className = 'fb show ' + (ok ? 'fb--ok' : 'fb--ng');
          fb.innerHTML = '<div class="fb__head ' + (ok ? 'ok' : 'ng') + '">' +
            (ok ? '正解' : '不正解 — 正解はこちら') + '</div>' + ansHTML();
          report(i, ok);
        });
        bAns.addEventListener('click', function () {
          fb.className = 'fb show fb--ok';
          fb.innerHTML = '<div class="fb__head ok">解答</div>' + ansHTML();
        });
      });
    }
  };

  /* ===========================================================
     4. 用語の穴埋め（テキスト入力）
     BokiFill.mount('#id', { title, questions:[{ text, answer:['..','..'], explain }] })
     answer は許容表記の配列（どれか一致でOK）
     =========================================================== */
  var BokiFill = {
    mount: function (sel, cfg) {
      var root = document.querySelector(sel);
      if (!root) return;
      var ui = shell(root, cfg, '穴埋め');
      var report = makeScorer(ui.score, cfg.questions.length, drillBaseOf(root));

      cfg.questions.forEach(function (q, i) {
        var wrapQ = el('div', 'q');
        var head = el('p', 'q__text');
        head.appendChild(el('span', 'q__no', 'Q' + (i + 1)));
        var sp = el('span'); sp.innerHTML = q.text; head.appendChild(sp);
        wrapQ.appendChild(head);

        var line = el('div', 'numq');
        var inp = el('input'); inp.type = 'text'; inp.style.width = '240px'; inp.style.textAlign = 'left';
        inp.style.fontFamily = 'inherit';
        line.appendChild(inp);
        wrapQ.appendChild(line);

        var fb = el('div', 'fb');
        var row = el('div', 'btn-row');
        var b = el('button', 'btn btn--sm', '採点する');
        var b2 = el('button', 'btn btn--ghost btn--sm', '答えを見る');
        row.appendChild(b); row.appendChild(b2);
        wrapQ.appendChild(row); wrapQ.appendChild(fb);
        ui.body.appendChild(wrapQ);

        function norm(s) { return String(s).replace(/[\s　]/g, ''); }
        function ansHTML() {
          return '<div><strong>' + q.answer[0] + '</strong></div>' + (q.explain ? '<div>' + q.explain + '</div>' : '');
        }
        b.addEventListener('click', function () {
          var v = norm(inp.value);
          var ok = q.answer.some(function (a) { return norm(a) === v; });
          fb.className = 'fb show ' + (ok ? 'fb--ok' : 'fb--ng');
          fb.innerHTML = '<div class="fb__head ' + (ok ? 'ok' : 'ng') + '">' + (ok ? '正解' : '不正解') + '</div>' + ansHTML();
          report(i, ok);
        });
        b2.addEventListener('click', function () {
          fb.className = 'fb show fb--ok';
          fb.innerHTML = '<div class="fb__head ok">解答</div>' + ansHTML();
        });
      });
    }
  };

  /* ---------- 初期化 ---------- */
  function boot() { initTheme(); initChecklists(); initSession(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.BokiJournal = BokiJournal;
  window.BokiQuiz = BokiQuiz;
  window.BokiNum = BokiNum;
  window.BokiFill = BokiFill;
  window.BokiProgress = BokiProgress;
  window.BokiLS = LS;
})();
