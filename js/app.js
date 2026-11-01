/* UI layer: grid rendering, mouse/touch editing, animation and stats. */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const board = $('#board');
  const wrap = $('#boardWrap');
  const ui = {
    algorithm: $('#algorithm'),
    maze: $('#maze'),
    speed: $('#speed'),
    run: $('#run'),
    clearPath: $('#clearPath'),
    clearBoard: $('#clearBoard'),
    compare: $('#compare'),
    compareDialog: $('#compareDialog'),
    compareBody: $('#compareBody'),
    brushButtons: document.querySelectorAll('[data-brush]'),
    algoInfo: $('#algoInfo'),
    status: $('#statStatus'),
    visited: $('#statVisited'),
    length: $('#statLength'),
    cost: $('#statCost'),
    time: $('#statTime'),
  };

  const state = {
    rows: 0,
    cols: 0,
    walls: null,
    weights: null,
    start: 0,
    end: 0,
    cells: [],
    brush: 'wall',
    busy: false,
    hasRun: false, // after a full run, edits re-solve instantly
    token: 0, // bumping it cancels the running animation
  };

  $('#weightCost').textContent = Pathfinding.WEIGHT_COST;

  /* ---------- Grid ---------- */

  const toOdd = (n) => (n % 2 ? n : n - 1);
  const cellSize = () => (window.innerWidth < 640 ? 20 : 26);
  const grid = () => ({ rows: state.rows, cols: state.cols, walls: state.walls, weights: state.weights });

  function build() {
    const size = cellSize();
    // Each cell takes `size` px plus a 1px grid gap; the board has 1px padding.
    const fit = (px) => Math.floor((px - 1) / (size + 1));
    const cols = Math.max(11, toOdd(fit(wrap.clientWidth)));
    const rows = Math.max(11, toOdd(fit(wrap.clientHeight)));
    if (cols === state.cols && rows === state.rows) return;

    Object.assign(state, {
      rows,
      cols,
      walls: new Uint8Array(rows * cols),
      weights: new Uint8Array(rows * cols),
      hasRun: false,
    });
    const midRow = Math.floor(rows / 2) | 1;
    state.start = midRow * cols + (Math.floor(cols / 5) | 1);
    state.end = midRow * cols + (Math.floor((cols * 4) / 5) | 1);

    board.style.gridTemplateColumns = `repeat(${cols}, ${size}px)`;
    board.style.gridAutoRows = `${size}px`;
    const frag = document.createDocumentFragment();
    state.cells = [];
    for (let i = 0; i < rows * cols; i++) {
      const el = document.createElement('div');
      el.dataset.i = i;
      state.cells.push(el);
      frag.appendChild(el);
    }
    board.replaceChildren(frag);
    paintAll();
    resetStats();
  }

  function paint(i) {
    let cls = 'cell';
    if (state.walls[i]) cls += ' wall';
    else if (state.weights[i]) cls += ' weight';
    if (i === state.start) cls += ' start';
    else if (i === state.end) cls += ' end';
    state.cells[i].className = cls;
  }

  function paintAll() {
    for (let i = 0; i < state.cells.length; i++) paint(i);
  }

  /* ---------- Stats & info ---------- */

  function resetStats(status = 'Ready') {
    ui.status.textContent = status;
    ui.status.className = '';
    ui.visited.textContent = ui.length.textContent = ui.cost.textContent = ui.time.textContent = '—';
  }

  function showStats(res, ms) {
    ui.status.textContent = res.found ? 'Path found' : 'No path';
    ui.status.className = res.found ? 'ok' : 'bad';
    ui.visited.textContent = res.visited.length.toLocaleString();
    ui.length.textContent = res.found ? res.path.length - 1 : '—';
    ui.cost.textContent = res.found ? res.cost : '—';
    ui.time.textContent = ms < 1 ? `${ms.toFixed(2)} ms` : `${ms.toFixed(1)} ms`;
  }

  function updateAlgoInfo() {
    const a = Pathfinding.algorithms[ui.algorithm.value];
    const tags = [
      `<span class="tag ${a.weighted ? 'yes' : 'no'}">${a.weighted ? 'weighted' : 'unweighted'}</span>`,
      `<span class="tag ${a.optimal ? 'yes' : 'no'}">${a.optimal ? 'shortest path guaranteed' : 'no shortest-path guarantee'}</span>`,
    ].join('');
    ui.algoInfo.innerHTML = `<strong>${a.name}</strong> ${tags}<br>${a.desc}`;
  }

  /* ---------- Solving & animation ---------- */

  function solve() {
    const t0 = performance.now();
    const res = Pathfinding.run(ui.algorithm.value, grid(), state.start, state.end);
    return { res, ms: performance.now() - t0 };
  }

  function addClass(i, cls) {
    if (i !== state.start && i !== state.end) state.cells[i].classList.add(cls);
  }

  /** Applies fn to list items, `perFrame` per animation frame (may be fractional). */
  function animate(list, fn, perFrame, token) {
    return new Promise((resolve) => {
      let k = 0;
      let budget = 0;
      const step = () => {
        if (token !== state.token) return resolve(false);
        budget += perFrame;
        while (budget >= 1 && k < list.length) {
          fn(list[k++]);
          budget--;
        }
        if (k < list.length) requestAnimationFrame(step);
        else resolve(true);
      };
      requestAnimationFrame(step);
    });
  }

  function drawInstant(res) {
    paintAll();
    for (const i of res.visited) addClass(i, 'visited-static');
    for (const i of res.path) addClass(i, 'path-static');
  }

  async function visualize() {
    if (state.busy) return;
    const { res, ms } = solve();
    const speed = Number(ui.speed.value);
    paintAll();

    if (speed === 0) {
      drawInstant(res);
    } else {
      const token = ++state.token;
      setBusy(true, 'Searching…');
      const done =
        (await animate(res.visited, (i) => addClass(i, 'visited'), speed, token)) &&
        (await animate(res.path, (i) => addClass(i, 'path'), Math.min(1, speed), token));
      setBusy(false);
      if (!done) {
        resetStats('Stopped');
        return;
      }
    }
    state.hasRun = true;
    showStats(res, ms);
  }

  // Live re-solve while editing after a run, at most once per frame.
  let resolvePending = false;
  function scheduleResolve() {
    if (!state.hasRun || resolvePending) return;
    resolvePending = true;
    requestAnimationFrame(() => {
      resolvePending = false;
      const { res, ms } = solve();
      drawInstant(res);
      showStats(res, ms);
    });
  }

  function clearPath() {
    state.token++;
    state.hasRun = false;
    paintAll();
    resetStats();
  }

  function clearBoard() {
    state.walls.fill(0);
    state.weights.fill(0);
    clearPath();
  }

  async function generateMaze(type) {
    if (state.busy || !Mazes[type]) return;
    clearPath();
    const { kind, fill, ops } = Mazes[type](state.rows, state.cols);
    const { start, end, walls, weights } = state;

    if (kind === 'wall') {
      walls.fill(fill ? 1 : 0);
      weights.fill(0);
      walls[start] = walls[end] = 0;
    } else {
      weights.fill(0);
    }
    paintAll();

    const speed = Number(ui.speed.value);
    const token = ++state.token;
    setBusy(true, 'Building maze…');
    await animate(
      ops,
      ([i, v]) => {
        if (i === start || i === end) return;
        if (kind === 'wall') {
          walls[i] = v;
          if (v) weights[i] = 0;
        } else if (!walls[i]) {
          weights[i] = v;
        }
        paint(i);
      },
      speed === 0 ? Infinity : Math.max(3, speed * 4),
      token
    );
    setBusy(false);
    resetStats();
  }

  function setBusy(busy, status) {
    state.busy = busy;
    document.body.classList.toggle('busy', busy);
    ui.run.textContent = busy ? 'Stop' : 'Visualize';
    ui.run.classList.toggle('danger', busy);
    for (const el of [ui.algorithm, ui.maze, ui.compare, ui.clearPath, ui.clearBoard]) el.disabled = busy;
    if (busy) {
      ui.status.textContent = status;
      ui.status.className = 'pending';
    } else if (state.resizePending) {
      state.resizePending = false;
      requestAnimationFrame(build);
    }
  }

  /* ---------- Compare all ---------- */

  function compareAll() {
    if (state.busy) return;
    const results = Object.entries(Pathfinding.algorithms).map(([key, meta]) => {
      const t0 = performance.now();
      const res = Pathfinding.run(key, grid(), state.start, state.end);
      return { key, meta, res, ms: performance.now() - t0 };
    });

    const found = results.filter((x) => x.res.found);
    const best = (fn) => (found.length ? Math.min(...found.map(fn)) : NaN);
    const bestVisited = best((x) => x.res.visited.length);
    const bestSteps = best((x) => x.res.path.length - 1);
    const bestCost = best((x) => x.res.cost);
    const maxVisited = Math.max(1, ...results.map((x) => x.res.visited.length));
    const star = (value, bestValue) => (value === bestValue ? ' <span class="best">★</span>' : '');

    ui.compareBody.replaceChildren(
      ...results.map(({ key, meta, res, ms }) => {
        const tr = document.createElement('tr');
        tr.tabIndex = 0;
        tr.classList.toggle('current', key === ui.algorithm.value);
        const visited = res.visited.length;
        const steps = res.path.length - 1;
        const pct = ((100 * visited) / maxVisited).toFixed(1); // unitless, used in calc()
        tr.innerHTML = res.found
          ? `<td>${meta.name}</td>
             <td><div class="bar" style="--w:${pct}"></div>${visited.toLocaleString()}${star(visited, bestVisited)}</td>
             <td>${steps}${star(steps, bestSteps)}</td>
             <td>${res.cost}${star(res.cost, bestCost)}</td>
             <td>${ms.toFixed(2)} ms</td>`
          : `<td>${meta.name}</td>
             <td><div class="bar" style="--w:${pct}"></div>${visited.toLocaleString()}</td>
             <td colspan="3" class="muted">no path</td>`;
        const pick = () => {
          ui.algorithm.value = key;
          updateAlgoInfo();
          ui.compareDialog.close();
          state.hasRun = true;
          scheduleResolve();
        };
        tr.addEventListener('click', pick);
        tr.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            pick();
          }
        });
        return tr;
      })
    );
    ui.compareDialog.showModal();
  }

  /* ---------- Editing (mouse, pen, touch) ---------- */

  let drag = null;

  function cellAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el && el.parentNode === board ? Number(el.dataset.i) : -1;
  }

  function applyBrush(i) {
    if (i === state.start || i === state.end) return;
    const on = drag.mode === 'draw' ? 1 : 0;
    if (drag.kind === 'wall') {
      state.walls[i] = on;
      if (on) state.weights[i] = 0;
    } else {
      if (state.walls[i]) return;
      state.weights[i] = on;
    }
    paint(i);
  }

  // Fill in cells skipped by fast pointer movement.
  function cellsBetween(a, b) {
    const { cols } = state;
    const ar = (a / cols) | 0, ac = a % cols;
    const br = (b / cols) | 0, bc = b % cols;
    const steps = Math.max(Math.abs(br - ar), Math.abs(bc - ac));
    const out = [];
    for (let s = 1; s <= steps; s++) {
      const r = Math.round(ar + ((br - ar) * s) / steps);
      const c = Math.round(ac + ((bc - ac) * s) / steps);
      out.push(r * cols + c);
    }
    return out;
  }

  function moveEndpoint(which, i) {
    const other = which === 'start' ? state.end : state.start;
    if (state.walls[i] || i === other) return;
    const old = state[which];
    state[which] = i;
    paint(old);
    paint(i);
  }

  board.addEventListener('pointerdown', (e) => {
    if (state.busy || e.button > 0) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0) return;
    e.preventDefault();
    board.setPointerCapture(e.pointerId);

    if (i === state.start) drag = { mode: 'start' };
    else if (i === state.end) drag = { mode: 'end' };
    else {
      const kind = e.shiftKey || state.brush === 'weight' ? 'weight' : 'wall';
      const layer = kind === 'wall' ? state.walls : state.weights;
      drag = { mode: layer[i] ? 'erase' : 'draw', kind };
      if (!state.hasRun) paintAll(); // drop stale search overlay
      applyBrush(i);
    }
    drag.last = i;
    board.classList.toggle('dragging-node', drag.mode === 'start' || drag.mode === 'end');
    scheduleResolve();
  });

  board.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0 || i === drag.last) return;
    if (drag.mode === 'start' || drag.mode === 'end') moveEndpoint(drag.mode, i);
    else cellsBetween(drag.last, i).forEach(applyBrush);
    drag.last = i;
    scheduleResolve();
  });

  const endDrag = () => {
    drag = null;
    board.classList.remove('dragging-node');
  };
  board.addEventListener('pointerup', endDrag);
  board.addEventListener('pointercancel', endDrag);
  board.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------- Controls ---------- */

  function setBrush(brush) {
    state.brush = brush;
    ui.brushButtons.forEach((b) => {
      const active = b.dataset.brush === brush;
      b.classList.toggle('active', active);
      b.setAttribute('aria-checked', String(active));
    });
  }

  ui.run.addEventListener('click', () => {
    if (state.busy) state.token++; // stop
    else visualize();
  });
  ui.compare.addEventListener('click', compareAll);
  ui.compareDialog.addEventListener('click', (e) => {
    if (e.target === ui.compareDialog) ui.compareDialog.close(); // backdrop click
  });
  ui.clearPath.addEventListener('click', clearPath);
  ui.clearBoard.addEventListener('click', clearBoard);
  ui.brushButtons.forEach((b) => b.addEventListener('click', () => setBrush(b.dataset.brush)));
  ui.algorithm.addEventListener('change', () => {
    updateAlgoInfo();
    scheduleResolve(); // compare algorithms on the same board instantly
  });
  ui.maze.addEventListener('change', () => {
    const type = ui.maze.value;
    ui.maze.value = '';
    ui.maze.blur();
    generateMaze(type);
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest('select, input, textarea, dialog')) return;
    const key = e.key.toLowerCase();
    if (key === ' ') {
      e.preventDefault();
      ui.run.click();
    } else if (key === 'c' && !state.busy) clearPath();
    else if (key === 'w') setBrush(state.brush === 'wall' ? 'weight' : 'wall');
    else if (key === 'k' && !state.busy) compareAll();
  });

  // Rebuild only when the available space changes the grid dimensions.
  let resizeTimer;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.busy) state.resizePending = true; // handled when the animation ends
      else build();
    }, 150);
  }).observe(wrap);

  // Shareable setups, e.g. ?algo=dijkstra&maze=division&speed=0&run
  async function applyUrlParams() {
    const params = new URLSearchParams(location.search);
    const pick = (select, value) => {
      if (value && [...select.options].some((o) => o.value === value)) select.value = value;
    };
    pick(ui.algorithm, params.get('algo'));
    pick(ui.speed, params.get('speed'));
    updateAlgoInfo();
    if (params.get('maze')) await generateMaze(params.get('maze'));
    if (params.has('run')) visualize();
    if (params.has('compare')) compareAll();
  }

  updateAlgoInfo();
  build();
  // Re-measure once layout and fonts have settled, then apply URL setup.
  requestAnimationFrame(() => {
    build();
    applyUrlParams();
  });
})();
