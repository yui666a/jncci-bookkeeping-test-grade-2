/* ===========================================================
   日商簿記2級 学習教材 共通スクリプト
   外部ライブラリ不使用。file:// で直接開いて動作する。
   =========================================================== */
(function () {
  'use strict';

  /* ---------- localStorage は失敗しても致命傷にしない ---------- */
  const LS = {
    get: function (k, d) {
      try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); }
      catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できなくても続行 */ }
    }
  };
  // 単元キーはディレクトリを含める。ファイル名だけだと phase0/01_... と
  // phase1/01_... が同じキーになり、別単元の記録が混ざる。
  function unitKeyOf(pathname) {
    const p = pathname.replace(/\/$/, '/index').replace(/^\/+/, '').replace(/\.html?$/, '');
    const seg = p.split('/').filter(Boolean);
    if (!seg.length) return 'index';
    return seg.slice(-2).join('/');
  }
  const PAGE = unitKeyOf(location.pathname);

  /* ---------- 学習記録 ---------- */
  const PROGRESS_KEY = 'boki2:progress';
  const PROGRESS_VERSION = 1;

  function emptyProgress() {
    return { version: PROGRESS_VERSION, sessions: [], drills: {}, checks: {}, notes: [],
             dismissed: {} };
  }

  // 保存された値が壊れていても、そこで学習が止まらないようにする。
  // 形が違えば初期値に戻すが、version が未来のものはそのまま保持して
  // 上書きを避ける（新しい版で書かれた記録を古い版が壊さない）。
  function loadProgress() {
    const raw = LS.get(PROGRESS_KEY, null);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyProgress();
    const base = emptyProgress();
    if (typeof raw.version === 'number') base.version = raw.version;
    if (Array.isArray(raw.sessions)) base.sessions = raw.sessions;
    if (Array.isArray(raw.notes)) base.notes = raw.notes;
    // drills は形を整えてから渡す。集計する側は設問ごとに attempts を
    // 走査するため、null や配列でない値が1つ混じるだけでそこから先の
    // 描画が丸ごと止まる。画面には「記録がない」ようにしか見えず、
    // 壊れていることに気づけない。
    if (raw.drills && typeof raw.drills === 'object' && !Array.isArray(raw.drills)) {
      for (const id in raw.drills) {
        const d = raw.drills[id];
        const at = d && Array.isArray(d.attempts) ? d.attempts : [];
        base.drills[id] = { attempts: at.filter(function (a) {
          return a && typeof a === 'object';
        }) };
      }
    }
    if (raw.checks && typeof raw.checks === 'object') base.checks = raw.checks;
    if (raw.dismissed && typeof raw.dismissed === 'object' && !Array.isArray(raw.dismissed)) {
      base.dismissed = raw.dismissed;
    }
    return base;
  }

  function saveProgress(p) { LS.set(PROGRESS_KEY, p); }

  // ローカルタイムゾーン付きの ISO 8601。toISOString() は UTC になり、
  // 深夜に学習した記録が前日にずれて見える。
  function nowISO() {
    const d = new Date();
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) +
      'T' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) +
      sign + p2(Math.floor(Math.abs(off) / 60)) + ':' + p2(Math.abs(off) % 60);
  }

  const BokiProgress = {
    unitKey: function () { return PAGE; },
    now: nowISO,
    dump: loadProgress,
    exportJSON: function () {
      const p = loadProgress();
      p.exportedAt = nowISO();
      return JSON.stringify(p);
    },
    // 記録IDは「単元キー#マウント先のid/q番号」。単元キーはURLのパスから
    // 作るため # を含まない（# はパスでは %23 になる）。最初の # で切る。
    parseId: function (id) {
      const m = /^(.+?)#([^/]+)\/q(\d+)$/.exec(id);
      if (!m) return null;
      return { unit: m[1], root: m[2], q: Number(m[3]) };
    },
    record: function (drillId, ok) {
      const p = loadProgress();
      if (!p.drills[drillId]) p.drills[drillId] = { attempts: [] };
      p.drills[drillId].attempts.push({ at: nowISO(), ok: !!ok });
      saveProgress(p);
    },
    check: function (unitKey, key, checked) {
      const p = loadProgress();
      if (!p.checks[unitKey]) p.checks[unitKey] = {};
      p.checks[unitKey][key] = !!checked;
      saveProgress(p);
    },
    // ページ別キーで保存されていたチェックを取り込む。旧キーは消さない。
    // 消しても得るものがなく、取り込みに失敗したときの復元手段が絶たれる。
    migrateLegacy: function () {
      const p = loadProgress();
      let moved = false;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const m = k && k.match(/^boki2:(.+):check$/);
        if (!m) continue;
        // 旧形式のキーはディレクトリを持たないが、チェックボックスがあったのは
        // phase0/* だけである。ファイル名だけで照合すると boki2:index:check が
        // phase1/index などにも入る。
        let unit = m[1];
        if (unit.indexOf('/') < 0) {
          if (PAGE !== 'phase0/' + unit) continue;
          unit = PAGE;
        }
        const old = LS.get(k, null);
        if (!old || typeof old !== 'object') continue;
        if (!p.checks[unit]) p.checks[unit] = {};
        for (const key in old) {
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
      const p = loadProgress();
      p.sessions.push({ unit: unitKey, start: startISO, sec: sec });
      saveProgress(p);
    },
    note: function (text) {
      text = String(text == null ? '' : text).trim();
      if (!text) return;
      const p = loadProgress();
      p.notes.push({ at: nowISO(), unit: PAGE, text: text });
      saveProgress(p);
    },
    // 要復習の判定。progress.html（一覧）と review.html（再出題）の
    // 両方が使う。片方だけに書くと、一覧に出ているのに出題されない、
    // という食い違いが起きる。どちらの画面を見ても気づけない。
    CLEAR_STREAK: 3,
    // 連続正解で数える。通算にすると、正解の貯金が誤答で消えないため、
    // 直前に間違えた設問まで復習から落ちてしまう。
    streakOf: function (attempts) {
      const at = attempts || [];
      let n = 0;
      for (let i = at.length - 1; i >= 0 && at[i].ok; i--) n++;
      return n;
    },
    // 復習の対象から外す・戻す。解答の記録そのものは消さない。誤答した
    // 事実は正解率の分母であり、消すと progress.html の集計が実際に
    // 解いた回数と食い違う。外した設問は dismissed に外した日時を残して
    // 覆うだけにする。外した後にまた間違えれば due() が復習に戻す。
    dismiss: function (drillId, on) {
      const p = loadProgress();
      if (on === false) delete p.dismissed[drillId];
      else p.dismissed[drillId] = nowISO();
      saveProgress(p);
    },
    dismissedIds: function () { return loadProgress().dismissed; },
    // 誤答を含み、まだ連続正解が足りていない設問を、最後に間違えた
    // 日時つきで返す。並び順は呼び出し側が決める。
    due: function () {
      const p = loadProgress(), out = [];
      for (const id in p.drills) {
        const at = (p.drills[id] || {}).attempts || [];
        const wrong = at.filter(function (a) { return !a.ok; });
        if (!wrong.length) continue;
        // 日時は Date.parse で比べる。文字列比較だと、時差の違う端末で
        // 付けた記録が混ざったときに前後が逆転する。
        const off = p.dismissed[id];
        if (off && !(Date.parse(wrong[wrong.length - 1].at) > Date.parse(off))) continue;
        const streak = BokiProgress.streakOf(at);
        if (streak >= BokiProgress.CLEAR_STREAK) continue;
        out.push({
          id: id, streak: streak, wrong: wrong.length, total: at.length,
          last: wrong[wrong.length - 1].at
        });
      }
      return out;
    },
    // 名前は内部用に見えるが、progress.html の全消去ボタンが使うため本番から外せない。
    _reset: function () { saveProgress(emptyProgress()); }
  };

  /* ---------- テーマ切替 ---------- */
  function initTheme() {
    const saved = LS.get('boki2:theme', null);
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    const btn = document.querySelector('.theme-btn');
    if (!btn) return;
    function label() {
      const t = document.documentElement.getAttribute('data-theme');
      btn.textContent = t === 'dark' ? '☾ ダーク' : (t === 'light' ? '☀ ライト' : '◐ 自動');
    }
    label();
    btn.addEventListener('click', function () {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'light' ? 'dark' : (cur === 'dark' ? '' : 'light');
      if (next) { document.documentElement.setAttribute('data-theme', next); LS.set('boki2:theme', next); }
      else { document.documentElement.removeAttribute('data-theme'); LS.set('boki2:theme', ''); }
      label();
    });
  }

  /* ---------- チェックリストの進捗保存 ---------- */
  function initChecklists() {
    BokiProgress.migrateLegacy();
    const boxes = document.querySelectorAll('input[type="checkbox"][data-key]');
    if (!boxes.length) return;
    const store = (BokiProgress.dump().checks || {})[PAGE] || {};

    boxes.forEach(function (b) {
      if (store[b.dataset.key]) b.checked = true;
      b.addEventListener('change', function () {
        BokiProgress.check(PAGE, b.dataset.key, b.checked);
        updateBars();
      });
    });

    function updateBars() {
      document.querySelectorAll('[data-progress-for]').forEach(function (bar) {
        const scope = document.querySelector(bar.dataset.progressFor);
        if (!scope) return;
        const all = scope.querySelectorAll('input[type="checkbox"][data-key]');
        const done = scope.querySelectorAll('input[type="checkbox"][data-key]:checked');
        const pct = all.length ? Math.round(done.length / all.length * 100) : 0;
        const fill = bar.querySelector('i');
        if (fill) fill.style.width = pct + '%';
        const txt = document.querySelector('[data-progress-text-for="' + bar.dataset.progressFor + '"]');
        if (txt) txt.textContent = done.length + ' / ' + all.length + ' 完了（' + pct + '%）';
      });
    }
    updateBars();

    const unfinished = Array.prototype.find.call(document.querySelectorAll('details.week'), function (d) {
      return d.querySelector('input[type="checkbox"][data-key]:not(:checked)');
    });
    if (unfinished) unfinished.open = true;

    document.querySelectorAll('[data-reset-progress]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        boxes.forEach(function (b) {
          b.checked = false;
          BokiProgress.check(PAGE, b.dataset.key, false);
        });
        updateBars();
      });
    });
  }

  /* ---------- 学習メモ ---------- */
  // わからなかったことは、机を離れてから思い出して書くと粒度が粗くなる。
  // 単元ページのその場で書けるようにする。
  function initNotes() {
    document.querySelectorAll('[data-note]').forEach(function (host) {
      const wrap = el('div', 'note');
      wrap.appendChild(el('div', 'note__label', 'わからなかったこと・気づいたこと'));
      const ta = el('textarea', 'note__input');
      ta.rows = 3;
      ta.placeholder = '例：連結のアップストリームで非支配株主持分への按分が分からない';
      const row = el('div', 'btn-row');
      const save = el('button', 'btn btn--sm', '記録する');
      const msg = el('span', 'small muted', '');
      row.appendChild(save); row.appendChild(msg);
      wrap.appendChild(ta); wrap.appendChild(row);

      const list = el('div', 'note__list');
      function render() {
        list.innerHTML = '';
        const notes = BokiProgress.dump().notes.filter(function (n) { return n.unit === PAGE; });
        notes.slice().reverse().forEach(function (n) {
          const item = el('div', 'note__item');
          item.appendChild(el('span', 'note__at', String(n.at).slice(0, 10)));
          item.appendChild(el('span', 'note__text', n.text));
          list.appendChild(item);
        });
      }
      wrap.appendChild(list);

      save.addEventListener('click', function () {
        if (!ta.value.trim()) return;
        BokiProgress.note(ta.value);
        ta.value = '';
        msg.textContent = '記録した';
        setTimeout(function () { msg.textContent = ''; }, 2000);
        render();
      });

      render();
      host.appendChild(wrap);
    });
  }

  /* ---------- 学習時間の計測 ---------- */
  // 経過時間ではなく能動時間を測る。タブを開いたまま離席した時間が
  // 学習時間に入ると、計画の週23時間を満たしているように見えて実際は
  // 足りていない、という最も避けたい壊れ方をする。
  const IDLE_MS = 5 * 60 * 1000;

  function initSession() {
    let startedAt = Date.now();
    let startISO = nowISO();
    let lastActive = Date.now();
    let accrued = 0;
    let running = true;

    function touch() { lastActive = Date.now(); }
    ['keydown', 'click', 'scroll', 'pointerdown'].forEach(function (ev) {
      document.addEventListener(ev, touch, { passive: true });
    });

    // 直近の操作から IDLE_MS を超えた分は加算しない。
    function slice() {
      if (!running) return;
      const now = Date.now();
      const cut = Math.min(now, lastActive + IDLE_MS);
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
    // 不安定になる。本番のオブジェクトから外さないのは、テストが本番と同じ
    // app.js を読み込んで検査しており、テスト専用の読み込み経路を持たないため。
    BokiProgress.__testTick = function (deltaSec, lastActiveDeltaSec) {
      startedAt += deltaSec * 1000;
      lastActive = lastActiveDeltaSec === undefined
        ? Date.now() : Date.now() + lastActiveDeltaSec * 1000;
    };
  }

  /* ---------- 共通ヘルパ ---------- */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function fmt(n) { return Number(n).toLocaleString('ja-JP'); }
  // 日本語入力のまま「-」を打つと「ー」「－」になり、会計では「▲」「△」も負の数を表す。
  // 先頭のこれらを ASCII の - に寄せないと、符号だけが黙って落ちて誤答になる。
  const NEG_MARK = /^\s*[-－−ー‐▲△]/;
  function parseAmt(s) {
    if (s === null || s === undefined) return NaN;
    s = String(s).replace(NEG_MARK, '-').replace(/[,\s，]/g, '').replace(/[０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    });
    if (s === '') return NaN;
    return Number(s);
  }
  // 入力中にカーソル位置を保つのは、キャレット右側の数字の個数を数え直す方法でしか
  // できない。区切りが増減しても右側の桁数は変わらないため。
  function groupAmt(inp) {
    // 区切りを消すとinputハンドラが同じ位置に入れ直すため、何も消えないように見える。
    // 消える文字が区切りのときだけキャレットを桁側へ寄せ、削除は既定の動作に任せる。
    inp.addEventListener('keydown', function (e) {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      if (inp.selectionStart !== inp.selectionEnd) return;
      let pos = inp.selectionStart;
      if (e.key === 'Backspace') {
        while (pos > 0 && inp.value[pos - 1] === ',') pos--;
      } else {
        while (pos < inp.value.length && inp.value[pos] === ',') pos++;
      }
      inp.setSelectionRange(pos, pos);
    });
    // 変換中に値を書き換えると、IMEが持つ未確定文字列と食い違い二重入力になる。
    // 変換中の input は見送り、確定した時点で一度だけ整形する。
    inp.addEventListener('input', function (e) {
      if (!e.isComposing) format();
    });
    inp.addEventListener('compositionend', format);
    function format() {
      const tail = inp.value.slice(inp.selectionEnd).replace(/\D/g, '').length;
      const half = inp.value.replace(/[０-９]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
      });
      const neg = NEG_MARK.test(half);
      const parts = half.replace(/[^\d.]/g, '').split('.');
      const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      // 小数部は3桁区切りにしない。金額に小数が出るのは単価や率の計算だけで、
      // そこに区切りを入れると桁の読み方が変わる。
      const out = (neg ? '-' : '') + intPart + (parts.length > 1 ? '.' + parts.slice(1).join('') : '');
      inp.value = out;
      let pos = out.length;
      for (let seen = 0; pos > 0 && seen < tail; pos--) {
        if (/\d/.test(out[pos - 1])) seen++;
      }
      inp.setSelectionRange(pos, pos);
    }
  }
  function shell(root, cfg, badgeText) {
    root.classList.add('drill');
    const head = el('div', 'drill__head');
    head.appendChild(el('span', 'drill__badge', badgeText));
    head.appendChild(el('span', 'drill__title', cfg.title || '練習問題'));
    const score = el('span', 'drill__score', '');
    head.appendChild(score);
    const body = el('div', 'drill__body');
    root.appendChild(head); root.appendChild(body);
    return { body: body, score: score };
  }
  // 記録先を決めるにはマウント先の id が要る。id がない設問は記録しない
  // （品質ゲート9がこれを検出する）。
  // cfg.recordAs は、設問を出題しているページと、記録すべき単元が食い違う
  // ときに使う。復習ページは他単元の設問を再出題するため、開いている
  // ページから記録先を決めると、やり直した正解が元の設問に届かない。
  function drillBaseOf(root, cfg) {
    if (cfg && cfg.recordAs) return cfg.recordAs;
    return root && root.id ? PAGE + '#' + root.id : null;
  }
  // 設問1問ごとに id を振る。学習の記録の「要復習」は設問単位で記録して
  // いるので、ドリル全体へ飛ぶだけでは、どれをやり直すのか画面から
  // 読み取れない。id は記録IDの末尾（q1, q2…）と同じ番号にそろえる。
  function tagQuestion(wrapQ, root, i) {
    if (root && root.id) wrapQ.id = root.id + '-q' + (i + 1);
  }
  // 設問の枠と見出し。4種のドリルで同じ形にそろえる。
  function questionBox(root, q, i) {
    const wrapQ = el('div', 'q');
    tagQuestion(wrapQ, root, i);
    const head = el('p', 'q__text');
    head.appendChild(el('span', 'q__no', 'Q' + (i + 1)));
    const sp = el('span'); sp.innerHTML = q.text; head.appendChild(sp);
    wrapQ.appendChild(head);
    return wrapQ;
  }
  // 採点・解答ボタン、ヒント、フィードバック欄を設問の末尾に足す。
  // ヒントは textContent で入れる。text や explain と違い、ヒントに HTML を
  // 書いた設問はない。innerHTML にすると「A<B」のような比較が要素として
  // 解釈されて文字が消える。
  function controls(wrapQ, q, withAnswer) {
    const row = el('div', 'btn-row');
    const check = el('button', 'btn btn--sm', '採点する');
    row.appendChild(check);
    const ans = withAnswer ? el('button', 'btn btn--ghost btn--sm', '答えを見る') : null;
    if (ans) row.appendChild(ans);
    wrapQ.appendChild(row);
    if (q.hint) {
      const bHint = el('button', 'linkbtn', 'ヒント');
      const hintBox = el('div', 'small muted', 'ヒント：' + q.hint);
      hintBox.style.display = 'none';
      bHint.addEventListener('click', function () {
        hintBox.style.display = hintBox.style.display === 'none' ? 'block' : 'none';
      });
      row.appendChild(bHint);
      wrapQ.appendChild(hintBox);
    }
    const fb = el('div', 'fb');
    wrapQ.appendChild(fb);
    return { check: check, ans: ans, fb: fb };
  }

  // 採点の確定点は4種のドリルで共通してここを通る。記録をここに置けば、
  // 単元HTMLの著者が記録用のコードを書く必要がなくなる。書き忘れが
  // 起きうる場所に記録を置くと、失われたデータは後から復元できない。
  // qNo は cfg.qNumbers で差し替えられる。復習ページは1つのドリルから
  // 間違えた設問だけを抜いて並べるため、並び順の番号で記録すると、
  // 元の設問とは別のIDが増えていく。
  // 同じ入力のまま採点し直しても記録しない。連打で連続正解が積み上がると、
  // 1回しか解いていない設問が復習リストから消える。
  // 答えを見た後の採点は写しても正解にしない。
  function makeScorer(scoreEl, total, drillBase, qNumbers) {
    const state = {}, lastInput = {}, revealed = {};
    function report(id, ok, input) {
      if (id in lastInput && lastInput[id] === input) return;
      lastInput[id] = input;
      ok = ok && !revealed[id];
      state[id] = ok;
      const qNo = qNumbers ? qNumbers[id] : id + 1;
      if (drillBase) BokiProgress.record(drillBase + '/q' + qNo, ok);
      let done = 0, right = 0;
      for (const k in state) { done++; if (state[k]) right++; }
      scoreEl.textContent = '正解 ' + right + ' / 解答済 ' + done + '（全' + total + '問）';
    }
    report.reveal = function (id) { revealed[id] = true; };
    return report;
  }

  /* ---------- 勘定科目の検索つき選択 ---------- */
  // 読みの表は assets/yomi.js にある。読めなかったときも例外にはしない。
  // 漢字の部分一致で引けるため、選択そのものは壊れない（ゲート11が検出する）。
  const YOMI = window.BokiYomi || {};

  // 「うりかけ」「ウリカケ」「売掛」のどれでも同じ結果を返す。
  // 全角英数と長音・濁点の揺れまでは吸収しない。科目名に現れないため。
  function normalize(s) {
    return String(s).toLowerCase().replace(/[ァ-ヴ]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0x60);
    });
  }

  // 促音・濁点・半濁点を落とした形。「ざつ」で「雑損（ざっそん）」を、
  // 「みはらいきん」で「未払金（みばらいきん）」を引けるようにする。
  // 連濁は語が結合したときに起きるため、単語ごとに覚えた読みで打つと
  // 「みはらい」「かふそく」のように濁点が落ちる。別読みを併記する形に
  // すると、科目を足すたびに揺れを予測して書き並べることになる。
  const DAKUTEN = 'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ';
  const SEION   = 'かきくけこさしすせそたちつてとはひふへほはひふへほ';
  function plain(s) {
    return s.replace(/っ/g, 'つ').replace(/[ぁ-ゖ]/g, function (c) {
      const i = DAKUTEN.indexOf(c);
      return i < 0 ? c : SEION.charAt(i);
    });
  }

  // ローマ字をかなに直す。IMEを切り替えずに「urikake」で売掛金を引ける。
  // 読みをローマ字に直して照合しないのは、「shi/si」「tsu/tu」「fu/hu」の
  // どちらで打たれても合うように、読み側に綴りの揺れを全部持たせることになるため。
  const ROMA = {
    a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
    ya: 'や', yu: 'ゆ', yo: 'よ', wa: 'わ', wo: 'を',
    shi: 'し', chi: 'ち', tsu: 'つ', fu: 'ふ', ji: 'じ',
    sha: 'しゃ', shu: 'しゅ', sho: 'しょ', cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ',
    ja: 'じゃ', ju: 'じゅ', jo: 'じょ', '-': 'ー'
  };
  const ROWS = {
    k: 'かきくけこ', g: 'がぎぐげご', s: 'さしすせそ', z: 'ざじずぜぞ',
    t: 'たちつてと', d: 'だぢづでど', n: 'なにぬねの', h: 'はひふへほ',
    b: 'ばびぶべぼ', p: 'ぱぴぷぺぽ', m: 'まみむめも', r: 'らりるれろ'
  };
  Object.keys(ROWS).forEach(function (c) {
    const row = ROWS[c];
    'aiueo'.split('').forEach(function (v, j) { ROMA[c + v] = row.charAt(j); });
    ROMA[c + 'ya'] = row.charAt(1) + 'ゃ';
    ROMA[c + 'yu'] = row.charAt(1) + 'ゅ';
    ROMA[c + 'yo'] = row.charAt(1) + 'ょ';
  });
  function romaToKana(s) {
    let out = '', i = 0;
    while (i < s.length) {
      const c = s.charAt(i), nx = s.charAt(i + 1);
      if (c === 'n' && (nx === 'n' || nx === "'")) { out += 'ん'; i += 2; continue; }
      if (c === 'n' && nx && !/[aiueoy]/.test(nx)) { out += 'ん'; i++; continue; }
      if (c === nx && /[bcdfghjkmpqrstvwxz]/.test(c)) { out += 'っ'; i++; continue; }
      let L = 3;
      while (L > 0 && !ROMA[s.substr(i, L)]) L--;
      if (L) { out += ROMA[s.substr(i, L)]; i += L; } else { out += c; i++; }
    }
    // 打ちかけの子音（「urik」の k）は捨てて、そこまでで絞り込む。
    return out.replace(/[a-z']+$/, '');
  }

  function matches(name, query) {
    if (!query) return true;
    let q = normalize(query);
    if (/[a-z]/.test(q)) q = romaToKana(q);
    if (!q) return true;
    if (normalize(name).indexOf(q) >= 0) return true;
    let y = YOMI[name];
    if (!y) return false;
    y = normalize(y);
    return y.indexOf(q) >= 0 || plain(y).indexOf(plain(q)) >= 0;
  }

  // <select> と同じ責務を持つ入力。value プロパティで読み書きでき、
  // 一覧にない文字列は確定できない。採点は collect() が読む value だけを
  // 見るため、この2点を満たす限り正誤判定は <select> のときと変わらない。
  let pickerSeq = 0;

  function accountPicker(accounts, side) {
    const uid = 'apick' + (++pickerSeq);
    const wrap = el('div', 'apick');
    const inp = el('input', 'apick__in');
    inp.type = 'text';
    inp.placeholder = '科目を検索';
    inp.autocomplete = 'off';
    inp.setAttribute('role', 'combobox');
    inp.setAttribute('aria-expanded', 'false');
    inp.setAttribute('aria-autocomplete', 'list');
    // placeholder だけだと240個すべてが同じ「科目を検索」と読まれ、
    // いま借方と貸方のどちらを入力しているのか分からない。
    inp.setAttribute('aria-label', (side === 'd' ? '借方' : '貸方') + 'の勘定科目');
    const list = el('div', 'apick__list');
    list.id = uid + '-list';
    list.setAttribute('role', 'listbox');
    // overflow-y:auto はスクロールできる要素として自動でフォーカス対象に
    // なる。1ページに240個あるため、Tabのたびに空の停止が挟まる。
    list.tabIndex = -1;
    inp.setAttribute('aria-controls', list.id);
    wrap.appendChild(inp); wrap.appendChild(list);

    let value = '';
    let active = -1;
    let shown = [];

    // 未確定の入力は捨てて、確定済みの科目名に戻す。空欄のまま閉じたときに
    // 打ちかけの文字列が残ると、選択済みに見えて実際は未選択になる。
    // ただし全部消してあるときは取り消しとみなす。戻してしまうと、選び
    // 直す以外に未選択へ戻す手段がなくなる。
    function revert() {
      if (value && !inp.value) { commit(''); return; }
      inp.value = value;
      close();
    }
    function close() {
      list.classList.remove('open');
      inp.setAttribute('aria-expanded', 'false');
      active = -1;
      inp.removeAttribute('aria-activedescendant');
      // 閉じた一覧の候補は残さない。1ページに240個あるため、一巡すると
      // 非表示の option が1万個を超える。支援技術は非表示の要素も
      // 走査対象にすることがある。
      list.innerHTML = '';
    }
    function commit(name) {
      value = name;
      inp.value = name;
      close();
      wrap.dispatchEvent(new CustomEvent('change', { bubbles: true }));
    }
    function render() {
      const q = inp.value === value ? '' : inp.value;
      shown = accounts.filter(function (a) { return matches(a, q); });
      list.innerHTML = '';
      if (!shown.length) {
        const none = el('div', 'apick__none', '該当なし');
        list.appendChild(none);
      }
      shown.forEach(function (a, i) {
        const it = el('div', 'apick__it', a);
        it.setAttribute('role', 'option');
        it.id = uid + '-o' + i;
        it.setAttribute('aria-selected', a === value ? 'true' : 'false');
        if (a === value) it.classList.add('is-sel');
        if (i === active) it.classList.add('is-act');
        // mousedown で確定する。click だと先に blur が起きて revert() が走る。
        it.addEventListener('mousedown', function (e) {
          e.preventDefault();
          commit(a);
        });
        list.appendChild(it);
      });
      list.classList.add('open');
      inp.setAttribute('aria-expanded', 'true');
      // 矢印キーで動いた先を読み上げさせる。フォーカスは入力欄に
      // 置いたままなので、これがないと移動しても何も伝わらない。
      if (active >= 0) inp.setAttribute('aria-activedescendant', uid + '-o' + active);
      else inp.removeAttribute('aria-activedescendant');
    }
    function move(d) {
      if (!list.classList.contains('open')) { render(); return; }
      if (!shown.length) return;
      active = (active + d + shown.length) % shown.length;
      render();
      const cur = list.querySelector('.is-act');
      if (cur) cur.scrollIntoView({ block: 'nearest' });
    }

    inp.addEventListener('focus', render);
    inp.addEventListener('input', function () { active = -1; render(); });
    inp.addEventListener('blur', revert);
    inp.addEventListener('keydown', function (e) {
      // 変換中のキーはIMEのものであり、この一覧の操作ではない。日本語を
      // 打つ以上、確定のEnterと選択のEnterは必ず重なる。
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') {
        // 候補が1件に絞れていれば、選ばずに Enter でも確定してよい。
        // 絞り込んだ結果を目で確かめてから選び直す手間を省く。
        if (list.classList.contains('open')) {
          e.preventDefault();
          if (active >= 0) commit(shown[active]);
          else if (!inp.value) commit('');
          else if (shown.length === 1) commit(shown[0]);
        }
      } else if (e.key === 'Escape') { revert(); }
    });

    wrap.dataset.side = side;
    // <select> と同じ形で読み書きできるようにする。呼び出し側が
    // select か入力かを気にせずに済む。
    Object.defineProperty(wrap, 'value', {
      get: function () { return value; },
      set: function (v) { value = v || ''; inp.value = value; }
    });
    return wrap;
  }

  /* ===========================================================
     1. 仕訳入力ドリル
     BokiJournal.mount('#id', {
       title, accounts:['現金', ...],
       questions:[{ text, debit:[['仕入',100000]], credit:[['買掛金',100000]], explain, hint }]
     })
     =========================================================== */
  const BokiJournal = {
    // 読みの登録漏れを品質ゲートから検査するための口。
    // window.BokiYomi を見ないのは、後から差し替えられた別の表を検査しないため。
    // 検索が使うのは app.js が読み込み時に掴んだ表である。
    __hasYomi: function (name) { return Object.prototype.hasOwnProperty.call(YOMI, name); },
    // 品質ゲート1が静的な仕訳表の金額を読む口。検査側に別の読み方を持たせると、
    // 全角数字や ▲ の扱いがドリルの採点と食い違う。
    __parseAmt: parseAmt,
    mount: function (sel, cfg) {
      const root = document.querySelector(sel);
      if (!root) return;
      const ui = shell(root, cfg, '仕訳ドリル');
      const report = makeScorer(ui.score, cfg.questions.length, drillBaseOf(root, cfg), cfg.qNumbers);

      cfg.questions.forEach(function (q, i) {
        const accounts = q.accounts || cfg.accounts;
        const wrapQ = questionBox(root, q, i);

        // 解答欄は常に4行。行数から正解の科目数が読めてしまうと本番の第1問と条件が変わる。
        // 未選択・未入力の行は collect() が無視するため、余った行は採点に影響しない。
        const nRows = Math.max(4, q.debit.length, q.credit.length);
        const tw = el('div', 'tablewrap');
        const t = el('table', 'jinput');
        t.innerHTML = '<thead><tr><th class="dh" colspan="2">借方</th><th class="ch" colspan="2">貸方</th></tr>' +
          '<tr><th class="dh">勘定科目</th><th class="dh">金額</th><th class="ch">勘定科目</th><th class="ch">金額</th></tr></thead>';
        const tb = el('tbody');
        for (let r = 0; r < nRows; r++) {
          const tr = el('tr');
          ['d', 'c'].forEach(function (side) {
            const td1 = el('td'), td2 = el('td');
            td1.appendChild(accountPicker(accounts, side));
            const inp = el('input', 'amt');
            inp.type = 'text'; inp.inputMode = 'numeric'; inp.placeholder = '0';
            groupAmt(inp);
            inp.dataset.side = side;
            td2.appendChild(inp);
            tr.appendChild(td1); tr.appendChild(td2);
          });
          tb.appendChild(tr);
        }
        t.appendChild(tb); tw.appendChild(t); wrapQ.appendChild(tw);

        const ctl = controls(wrapQ, q, true), fb = ctl.fb, bCheck = ctl.check, bAns = ctl.ans;
        ui.body.appendChild(wrapQ);

        function collect(side) {
          const out = [];
          tb.querySelectorAll('tr').forEach(function (tr) {
            const s = tr.querySelector('.apick[data-side="' + side + '"]');
            const a = tr.querySelector('input[data-side="' + side + '"]');
            const v = parseAmt(a.value);
            if (s.value && !isNaN(v)) out.push([s.value, v]);
          });
          return out;
        }
        function same(got, want) {
          if (got.length !== want.length) return false;
          const pool = want.slice();
          for (let i2 = 0; i2 < got.length; i2++) {
            let hit = -1;
            for (let j = 0; j < pool.length; j++) {
              if (pool[j][0] === got[i2][0] && Number(pool[j][1]) === Number(got[i2][1])) { hit = j; break; }
            }
            if (hit < 0) return false;
            pool.splice(hit, 1);
          }
          return true;
        }
        function answerHTML() {
          const n = Math.max(q.debit.length, q.credit.length);
          let rows = '';
          for (let k = 0; k < n; k++) {
            const d = q.debit[k], c = q.credit[k];
            rows += '<tr>' +
              '<td class="d">' + (d ? d[0] : '') + '</td><td class="d amt">' + (d ? fmt(d[1]) : '') + '</td>' +
              '<td class="c">' + (c ? c[0] : '') + '</td><td class="c amt">' + (c ? fmt(c[1]) : '') + '</td></tr>';
          }
          return '<div class="tablewrap"><table class="jnl"><thead><tr><th>借方科目</th><th class="amt">金額</th>' +
            '<th>貸方科目</th><th class="amt">金額</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
            (q.explain ? '<div>' + q.explain + '</div>' : '');
        }

        bCheck.addEventListener('click', function () {
          const ok = same(collect('d'), q.debit) && same(collect('c'), q.credit);
          fb.className = 'fb show ' + (ok ? 'fb--ok' : 'fb--ng');
          fb.innerHTML = '<div class="fb__head ' + (ok ? 'ok' : 'ng') + '">' +
            (ok ? '正解' : '不正解 — 正しい仕訳はこちら') + '</div>' + (ok ? answerHTML() : answerHTML());
          report(i, ok, JSON.stringify([collect('d'), collect('c')]));
        });
        bAns.addEventListener('click', function () {
          report.reveal(i);
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
  const BokiQuiz = {
    mount: function (sel, cfg) {
      const root = document.querySelector(sel);
      if (!root) return;
      const ui = shell(root, cfg, '確認テスト');
      const report = makeScorer(ui.score, cfg.questions.length, drillBaseOf(root, cfg), cfg.qNumbers);

      cfg.questions.forEach(function (q, i) {
        const wrapQ = questionBox(root, q, i);

        const box = el('div', 'choices');
        const name = 'q_' + Math.random().toString(36).slice(2) + '_' + i;
        q.choices.forEach(function (c, ci) {
          const lab = el('label', 'choice');
          const r = el('input'); r.type = 'radio'; r.name = name; r.value = ci;
          const s = el('span'); s.innerHTML = c;
          lab.appendChild(r); lab.appendChild(s);
          box.appendChild(lab);
        });
        wrapQ.appendChild(box);

        const ctl = controls(wrapQ, q, false), fb = ctl.fb, b = ctl.check;
        ui.body.appendChild(wrapQ);

        b.addEventListener('click', function () {
          const picked = box.querySelector('input:checked');
          if (!picked) {
            fb.className = 'fb show fb--ng';
            fb.innerHTML = '<div class="fb__head ng">選択肢を選んでください</div>';
            return;
          }
          const ok = Number(picked.value) === q.answer;
          // children は HTMLCollection で forEach を持たないため、NodeList と同じ書き方にしない。
          Array.prototype.forEach.call(box.children, function (lab, ci) {
            lab.classList.remove('is-correct', 'is-wrong');
            if (ci === q.answer) lab.classList.add('is-correct');
            else if (ci === Number(picked.value)) lab.classList.add('is-wrong');
          });
          fb.className = 'fb show ' + (ok ? 'fb--ok' : 'fb--ng');
          fb.innerHTML = '<div class="fb__head ' + (ok ? 'ok' : 'ng') + '">' + (ok ? '正解' : '不正解') + '</div>' +
            (q.explain ? '<div>' + q.explain + '</div>' : '');
          report(i, ok, picked.value);
        });
      });
    }
  };

  /* ===========================================================
     3. 数値回答ドリル
     BokiNum.mount('#id', { title, badge, questions:[{ text, answer, unit, hint, explain, tolerance }] })
     answer は数値、または [数値, 数値, ...]（複数欄）
     =========================================================== */
  const BokiNum = {
    mount: function (sel, cfg) {
      const root = document.querySelector(sel);
      if (!root) return;
      const ui = shell(root, cfg, cfg.badge || '計算ドリル');
      const report = makeScorer(ui.score, cfg.questions.length, drillBaseOf(root, cfg), cfg.qNumbers);

      cfg.questions.forEach(function (q, i) {
        const answers = Array.isArray(q.answer) ? q.answer : [q.answer];
        const labels = q.labels || [];
        const wrapQ = questionBox(root, q, i);

        const inputs = [];
        answers.forEach(function (a, ai) {
          const line = el('div', 'numq');
          if (labels[ai]) line.appendChild(el('span', 'small', labels[ai]));
          const inp = el('input', 'amt'); inp.type = 'text'; inp.inputMode = 'decimal'; inp.placeholder = '0';
          groupAmt(inp);
          line.appendChild(inp);
          if (q.unit) line.appendChild(el('span', 'unit', q.unit));
          inputs.push(inp);
          wrapQ.appendChild(line);
        });

        const ctl = controls(wrapQ, q, true), fb = ctl.fb, bCheck = ctl.check, bAns = ctl.ans;
        ui.body.appendChild(wrapQ);

        function ansHTML() {
          const list = answers.map(function (a, ai) {
            return '<li>' + (labels[ai] ? labels[ai] + ' ' : '') + '<strong>' + fmt(a) + (q.unit || '') + '</strong></li>';
          }).join('');
          return '<ul>' + list + '</ul>' + (q.explain ? '<div>' + q.explain + '</div>' : '');
        }

        bCheck.addEventListener('click', function () {
          const tol = q.tolerance === undefined ? 0 : q.tolerance;
          let ok = true;
          inputs.forEach(function (inp, ai) {
            const v = parseAmt(inp.value);
            if (isNaN(v) || Math.abs(v - answers[ai]) > tol) ok = false;
          });
          fb.className = 'fb show ' + (ok ? 'fb--ok' : 'fb--ng');
          fb.innerHTML = '<div class="fb__head ' + (ok ? 'ok' : 'ng') + '">' +
            (ok ? '正解' : '不正解 — 正解はこちら') + '</div>' + ansHTML();
          report(i, ok, JSON.stringify(inputs.map(function (inp) { return parseAmt(inp.value); })));
        });
        bAns.addEventListener('click', function () {
          report.reveal(i);
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
  const BokiFill = {
    mount: function (sel, cfg) {
      const root = document.querySelector(sel);
      if (!root) return;
      const ui = shell(root, cfg, '穴埋め');
      const report = makeScorer(ui.score, cfg.questions.length, drillBaseOf(root, cfg), cfg.qNumbers);

      cfg.questions.forEach(function (q, i) {
        const wrapQ = questionBox(root, q, i);

        const line = el('div', 'numq');
        const inp = el('input'); inp.type = 'text'; inp.style.width = '240px'; inp.style.textAlign = 'left';
        inp.style.fontFamily = 'inherit';
        line.appendChild(inp);
        wrapQ.appendChild(line);

        const ctl = controls(wrapQ, q, true), fb = ctl.fb, b = ctl.check, b2 = ctl.ans;
        ui.body.appendChild(wrapQ);

        function norm(s) { return String(s).replace(/[\s　]/g, ''); }
        function ansHTML() {
          return '<div><strong>' + q.answer[0] + '</strong></div>' + (q.explain ? '<div>' + q.explain + '</div>' : '');
        }
        b.addEventListener('click', function () {
          const v = norm(inp.value);
          const ok = q.answer.some(function (a) { return norm(a) === v; });
          fb.className = 'fb show ' + (ok ? 'fb--ok' : 'fb--ng');
          fb.innerHTML = '<div class="fb__head ' + (ok ? 'ok' : 'ng') + '">' + (ok ? '正解' : '不正解') + '</div>' + ansHTML();
          report(i, ok, v);
        });
        b2.addEventListener('click', function () {
          report.reveal(i);
          fb.className = 'fb show fb--ok';
          fb.innerHTML = '<div class="fb__head ok">解答</div>' + ansHTML();
        });
      });
    }
  };

  /* ---------- 設問バンクからの再出題（review.html / practice.html） ---------- */
  const KINDS = { journal: BokiJournal, quiz: BokiQuiz, num: BokiNum, fill: BokiFill };

  // 読めなかったときの案内は msgHost に出す。
  function loadBank(msgHost, onLoad) {
    function fail() {
      const page = location.pathname.split('/').pop();
      msgHost.appendChild(el('p', 'small muted',
        '設問データ（assets/drills.json）を読み込めませんでした。' +
        'file:// で開いている場合は、教材のフォルダで次を実行し、' +
        'http://localhost:8000/' + page + ' を開いてください：  python3 -m http.server'));
    }
    const req = new XMLHttpRequest();
    req.open('GET', 'assets/drills.json', true);
    req.onload = function () {
      // onload は 404 でも発火する。status を見ないと、サーバの返した
      // エラーページを設問として読もうとする。
      if (req.status !== 200 && req.status !== 0) return fail();
      let bank;
      try { bank = JSON.parse(req.responseText); }
      catch (e) { bank = null; }
      if (!bank || !bank.units) return fail();
      onLoad(bank);
    };
    // file:// では XHR がブロックされる。単元HTMLは file:// で直接開いて
    // 動くが、再出題のページは設問バンクを読むため配信が要る。詰まった
    // ときに何をすればよいか分からないと、復習そのものが止まる。
    req.onerror = fail;
    req.send();
  }

  // 単元での設定をそのまま使い、出題する設問（q番号の配列）と記録先だけ
  // 差し替える。使う項目を選び直すと、単元と再出題で設問の見た目や挙動がずれる。
  // 記録は元の単元の設問IDに向ける。開いているページのURLから決めると、
  // やり直した正解が元の設問に届かず、いつまでも要復習から消えない。
  function mountFromBank(sel, unit, drill, nums) {
    const cfg = {};
    for (const k in drill.cfg) cfg[k] = drill.cfg[k];
    cfg.questions = nums.map(function (n) { return drill.cfg.questions[n - 1]; });
    cfg.recordAs = unit + '#' + drill.root;
    cfg.qNumbers = nums;
    KINDS[drill.kind].mount(sel, cfg);
  }

  /* ---------- 初期化 ---------- */
  function boot() { initTheme(); initChecklists(); initNotes(); initSession(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.BokiJournal = BokiJournal;
  window.BokiQuiz = BokiQuiz;
  window.BokiNum = BokiNum;
  window.BokiFill = BokiFill;
  window.BokiProgress = BokiProgress;
  window.BokiBank = { el: el, kinds: KINDS, load: loadBank, mount: mountFromBank };
})();
