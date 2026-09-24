/* review.html のスクリプト。assets/app.js の後に読み込む。 */
(function () {
  'use strict';
  var P = window.BokiProgress;
  var B = window.BokiBank;
  var el = B.el;
  var CLEAR_STREAK = P.CLEAR_STREAK;

  var summary = document.getElementById('summary');
  var filterBar = document.getElementById('filter');
  var host = document.getElementById('drills');

  function say(msg) {
    summary.appendChild(el('p', 'small muted', msg));
  }

  // 要復習の判定は BokiProgress.due() が持つ。progress.html の一覧と
  // 同じものを使わないと、一覧に出ているのに出題されない設問ができる。
  //
  // 壊れた記録でもページは開けなければならない。ここで例外が出ると、
  // 復習の入口ごと失われる。
  var due;
  try { due = P.due(); }
  catch (e) { due = []; }

  due = due.map(function (r) {
    var ref = P.parseId(r.id);
    if (!ref) return null;
    ref.id = r.id;
    ref.streak = r.streak;
    ref.wrong = r.wrong;
    ref.total = r.total;
    ref.last = r.last;
    return ref;
  }).filter(Boolean);

  if (!due.length) {
    say('復習する設問はありません。間違えた設問がここに集まります。');
    return;
  }

  // 外した設問。due() は既に除いて返すが、このページを開いたまま
  // 外したものを描き直しの対象から落とすため、手元にも持つ。
  var dismissed = {};

  // 間違いが古い順。直近の誤答が新しい順にすると、さっき間違えた問題が
  // 毎回先頭に来て、放置された問題がいつまでも後ろに残る。
  due.sort(function (a, b) { return a.last < b.last ? -1 : (a.last > b.last ? 1 : 0); });

  B.load(summary, render);

  // 表示する単元。null はすべて。
  var unitFilter = null;

  // 単元で絞り込むボタン。単元キー（phase0/01_... ）がそのまま
  // カテゴリの単位になる。設問IDに含まれているため、別の対応表を
  // 持たなくても分類できる。
  function renderFilter(bank, counts, units) {
    filterBar.innerHTML = '';
    if (units.length < 2) return;
    var bar = el('div', 'rvfilter');
    var total = units.reduce(function (n, u) { return n + counts[u]; }, 0);

    function btn(key, label, n) {
      var b = el('button', 'rvfilter__btn', label + '（' + n + '）');
      b.type = 'button';
      if (unitFilter === key) b.classList.add('is-on');
      b.setAttribute('aria-pressed', unitFilter === key ? 'true' : 'false');
      b.addEventListener('click', function () {
        unitFilter = key;
        render(bank);
      });
      bar.appendChild(b);
    }

    btn(null, 'すべて', total);
    units.forEach(function (u) {
      // 見出しは単元キーの短縮形。フル名は各ドリルの見出しに出る。
      btn(u, u.replace(/^(phase\d+)\/(\d+)_.*$/, '$1/$2'), counts[u]);
    });
    filterBar.appendChild(bar);
  }

  function render(bank) {
    host.innerHTML = '';
    summary.innerHTML = '';

    // 復習から外した設問は due() が返さない。押した直後にこの場から
    // 消すため、残っているものだけを数え直す。
    var live = due.filter(function (r) { return !dismissed[r.id]; });

    // 単元ごとの残り件数。絞り込みボタンの数字と、絞り込みを外した
    // ときの全体像の両方に要る。
    var counts = {}, units = [];
    live.forEach(function (r) {
      if (counts[r.unit] === undefined) { counts[r.unit] = 0; units.push(r.unit); }
      counts[r.unit]++;
    });
    units.sort();
    // 絞り込み先が空になったら、すべてに戻す。押した単元の最後の1問を
    // 外したときに、空の画面だけが残るのを避ける。
    if (unitFilter !== null && !counts[unitFilter]) unitFilter = null;
    renderFilter(bank, counts, units);

    if (!live.length) {
      say('復習する設問はありません。間違えた設問がここに集まります。');
      return;
    }

    var target = unitFilter === null ? live
      : live.filter(function (r) { return r.unit === unitFilter; });

    // 同じドリルの設問はまとめて出す。1問ずつ別の枠にすると、同じ
    // 見出しと勘定科目プールが何度も現れて、どこまで進んだか読めない。
    // 並び順は「そのドリルで最も古い誤答」で決める。
    var groups = [];
    var byKey = {};
    target.forEach(function (r) {
      var key = r.unit + '#' + r.root;
      if (!byKey[key]) {
        byKey[key] = { unit: r.unit, root: r.root, items: [] };
        groups.push(byKey[key]);
      }
      byKey[key].items.push(r);
    });

    var shown = 0, missing = 0, mounted = 0;

    groups.forEach(function (g, gi) {
      var unit = bank.units[g.unit];
      var src = unit && unit.drills[g.root];
      // 設問が見つからないのは、教材から削除・改名された設問の記録が
      // 残っているとき。飛ばして続ける。1件のために復習全体を止めない。
      if (!src) { missing += g.items.length; return; }

      // 設問は q番号（1始まり）で引く。並び順ではなく番号で引かないと、
      // 設問を1つ挿しただけで別の問題が出る。
      var numbers = [], meta = [];
      g.items.forEach(function (r) {
        if (!(src.cfg.questions || [])[r.q - 1]) { missing++; return; }
        numbers.push(r.q);
        meta.push(r);
      });
      if (!numbers.length) return;

      // 見出しを先に足してから種類を確かめると、出題できないドリルの
      // 見出しだけが残る。描画の前に確かめる。
      if (!B.kinds[src.kind]) { missing += numbers.length; return; }

      shown += numbers.length;
      mounted++;

      var head = el('div', 'reviewgroup');
      var a = el('a', 'reviewgroup__unit', g.unit);
      a.href = unit.href + '#' + g.root;
      head.appendChild(a);
      head.appendChild(el('span', 'reviewgroup__meta', numbers.length + '問'));
      host.appendChild(head);

      // 設問ごとに復習から外す。覚えた設問を3回解き直させる理由はない。
      // 外しても解答の記録は残るため、progress.html の正解率は動かない。
      var chips = el('div', 'rvdrop');
      meta.forEach(function (r) {
        var b = el('button', 'rvdrop__btn');
        b.type = 'button';
        b.textContent = '第' + r.q + '問（' +
          (r.streak ? '連続正解 ' + r.streak + '/' + CLEAR_STREAK : '未正解') + '） ✕';
        b.title = 'この設問を復習リストから外す';
        b.setAttribute('aria-label',
          '第' + r.q + '問を復習リストから外す');
        b.addEventListener('click', function () {
          P.dismiss(r.id, true);
          dismissed[r.id] = true;
          render(bank);
        });
        chips.appendChild(b);
      });
      host.appendChild(chips);

      var mountId = 'rv' + gi;
      var box = el('div');
      box.id = mountId;
      host.appendChild(box);

      B.mount('#' + mountId, g.unit, src, numbers);
    });

    var s = el('p', 'lead');
    s.appendChild(el('strong', null, shown + '問'));
    s.appendChild(document.createTextNode(' が復習待ちです（' + mounted + 'ドリル）' +
      (unitFilter === null ? '。' : '。単元 ' + unitFilter + ' で絞り込み中。')));
    summary.appendChild(s);
    if (missing) {
      say(missing + '件は教材側に設問が見つからず、飛ばしました。' +
        '設問が削除・改名されたか、assets/drills.json が古い可能性があります。');
    }
    summary.appendChild(el('p', 'small muted',
      '採点するとその場で記録されます。3回続けて正解した設問は、次にこのページを開いたときに消えます。' +
      '設問名の ✕ を押すと、正解の回数によらずその場で外せます。'));
  }
})();
