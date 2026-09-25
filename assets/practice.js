/* practice.html のスクリプト。assets/app.js の後に読み込む。 */
(function () {
  'use strict';
  const B = window.BokiBank;
  const el = B.el;

  const setup = document.getElementById('setup');
  const summary = document.getElementById('summary');
  const host = document.getElementById('drills');

  // 分野は単元キーの命名（_shou- / _kou-）から決める。別の対応表を持つと、
  // 単元を足したときに表の更新漏れで「どこにも属さない単元」ができる。
  // Phase 0 や模試の回し方のように分野を持たない単元は「その他」に置く。
  const FIELDS = [
    { key: 'shou', label: '商業簿記', test: /_shou-|shogyo/ },
    { key: 'kou', label: '工業簿記', test: /_kou-|kogyo/ },
    { key: 'etc', label: 'その他', test: /./ }
  ];
  // 問題タイプはドリルの種類そのもの。見出しは app.js が各ドリルに付ける
  // 既定のバッジと揃える。総合問題（第3問形式など）は計算ドリルの部品で
  // 組んであるため、計算ドリルに含まれる。
  const KINDS = [
    { key: 'journal', label: '仕訳ドリル', short: '仕訳' },
    { key: 'quiz', label: '確認テスト', short: '確認' },
    { key: 'num', label: '計算ドリル（総合問題を含む）', short: '計算' },
    { key: 'fill', label: '穴埋め', short: '穴埋め' }
  ];
  function fieldOf(unit) {
    for (let i = 0; i < FIELDS.length; i++) if (FIELDS[i].test.test(unit)) return FIELDS[i].key;
  }

  B.load(summary, renderSetup);

  // ドリルをページ内の順に並べる。出題できない種類のドリルはここで落とす。
  function drillsOf(bank, unit) {
    const d = bank.units[unit].drills;
    return Object.keys(d).map(function (k) { return d[k]; })
      .filter(function (x) { return B.kinds[x.kind] && (x.cfg.questions || []).length; })
      .sort(function (a, b) { return a.order - b.order; });
  }
  // 単元の問題数をタイプ別に数える。{ journal: 8, quiz: 6, ... }
  function countOf(bank, unit) {
    const c = {};
    drillsOf(bank, unit).forEach(function (x) { c[x.kind] = (c[x.kind] || 0) + x.cfg.questions.length; });
    return c;
  }

  function renderSetup(bank) {
    const counts = {};
    const units = Object.keys(bank.units).sort().filter(function (u) {
      counts[u] = countOf(bank, u);
      return Object.keys(counts[u]).length;
    });
    const boxes = [];

    FIELDS.forEach(function (f) {
      const mine = units.filter(function (u) { return fieldOf(u) === f.key; });
      if (!mine.length) return;
      const fs = el('fieldset', 'pxfield');
      const lg = el('legend');
      const all = el('input'); all.type = 'checkbox';
      const lgl = el('label');
      lgl.appendChild(all);
      lgl.appendChild(document.createTextNode(' ' + f.label + 'をまとめて選択'));
      lg.appendChild(lgl);
      fs.appendChild(lg);

      const mineBoxes = mine.map(function (u) {
        const lb = el('label', 'pxunit');
        const cb = el('input'); cb.type = 'checkbox'; cb.value = u;
        lb.appendChild(cb);
        const parts = KINDS.filter(function (k) { return counts[u][k.key]; })
          .map(function (k) { return k.short + ' ' + counts[u][k.key]; });
        lb.appendChild(document.createTextNode(' ' + u.replace(/\/.*$/, '') + ' ' +
          bank.units[u].title + '（' + parts.join('・') + '）'));
        fs.appendChild(lb);
        boxes.push(cb);
        return cb;
      });
      function sync() {
        const n = mineBoxes.filter(function (b) { return b.checked; }).length;
        all.checked = n === mineBoxes.length;
        all.indeterminate = n > 0 && n < mineBoxes.length;
        refreshKinds();
      }
      all.addEventListener('change', function () {
        mineBoxes.forEach(function (b) { b.checked = all.checked; });
        sync();
      });
      mineBoxes.forEach(function (b) { b.addEventListener('change', sync); });
      setup.appendChild(fs);
    });

    const kindRow = el('fieldset', 'pxfield');
    kindRow.appendChild(el('legend', null, '問題タイプ'));
    const kindCount = {};
    KINDS.forEach(function (k) {
      if (!units.some(function (u) { return counts[u][k.key]; })) return;
      const lb = el('label', 'pxunit');
      const cb = el('input'); cb.type = 'checkbox'; cb.name = 'kind'; cb.value = k.key; cb.checked = true;
      lb.appendChild(cb);
      lb.appendChild(document.createTextNode(' ' + k.label));
      kindCount[k.key] = el('span');
      lb.appendChild(kindCount[k.key]);
      kindRow.appendChild(lb);
    });
    setup.appendChild(kindRow);

    // タイプ別の問題数は選んでいる単元の合計。単元を選んでいないうちは0問と出る。
    function refreshKinds() {
      const chosen = boxes.filter(function (b) { return b.checked; });
      Object.keys(kindCount).forEach(function (k) {
        const n = chosen.reduce(function (s, b) { return s + (counts[b.value][k] || 0); }, 0);
        kindCount[k].textContent = '（' + n + '問）';
      });
    }
    refreshKinds();

    const row = el('div', 'btn-row');
    row.appendChild(el('span', 'small muted', '出題順：'));
    ['順番に', 'ランダムに'].forEach(function (label, i) {
      const lb = el('label');
      const r = el('input'); r.type = 'radio'; r.name = 'order'; r.value = i ? 'random' : 'seq';
      if (!i) r.checked = true;
      lb.appendChild(r);
      lb.appendChild(document.createTextNode(' ' + label));
      row.appendChild(lb);
    });
    const go = el('button', 'btn btn--sm', 'この条件で始める');
    go.type = 'button';
    row.appendChild(go);
    setup.appendChild(row);

    go.addEventListener('click', function () {
      const chosen = boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; });
      const kinds = {};
      Array.prototype.forEach.call(setup.querySelectorAll('input[name="kind"]:checked'),
        function (b) { kinds[b.value] = true; });
      const random = setup.querySelector('input[name="order"]:checked').value === 'random';
      start(bank, chosen, kinds, random);
    });
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function start(bank, chosen, kinds, random) {
    host.innerHTML = '';
    summary.innerHTML = '';
    if (!chosen.length) {
      summary.appendChild(el('p', 'small muted', '単元を1つ以上選んでください。'));
      return;
    }
    if (!Object.keys(kinds).length) {
      summary.appendChild(el('p', 'small muted', '問題タイプを1つ以上選んでください。'));
      return;
    }

    // 出題の単位。順番にでは1ドリル＝1ブロック、ランダムでは1問＝1ブロック。
    // ランダムでもドリル単位で混ぜるだけにすると、同じ単元の設問が
    // 固まって出て、単元の見出しから論点が読めてしまう。
    const blocks = [];
    chosen.forEach(function (u) {
      drillsOf(bank, u).filter(function (d) { return kinds[d.kind]; }).forEach(function (d) {
        const nums = d.cfg.questions.map(function (_, i) { return i + 1; });
        if (random) nums.forEach(function (n) { blocks.push({ unit: u, drill: d, nums: [n] }); });
        else blocks.push({ unit: u, drill: d, nums: nums });
      });
    });
    if (random) shuffle(blocks);
    if (!blocks.length) {
      summary.appendChild(el('p', 'small muted', '選んだ単元に、選んだタイプの問題はありません。'));
      return;
    }

    let total = 0;
    blocks.forEach(function (b, bi) {
      const unit = bank.units[b.unit];
      const head = el('div', 'reviewgroup');
      const a = el('a', 'reviewgroup__unit', unit.title);
      a.href = unit.href + '#' + b.drill.root;
      head.appendChild(a);
      head.appendChild(el('span', 'reviewgroup__meta', random
        ? (bi + 1) + ' / ' + blocks.length + '　' + (b.drill.cfg.title || '') + ' 第' + b.nums[0] + '問'
        : b.nums.length + '問'));
      host.appendChild(head);

      const box = el('div');
      box.id = 'px' + bi;
      host.appendChild(box);

      B.mount('#' + box.id, b.unit, b.drill, b.nums);
      total += b.nums.length;
    });

    const s = el('p', 'lead');
    s.appendChild(el('strong', null, total + '問'));
    s.appendChild(document.createTextNode('（' + chosen.length + '単元・' + (random ? 'ランダム' : '順番') + '）'));
    summary.appendChild(s);
    summary.scrollIntoView();
  }
})();
