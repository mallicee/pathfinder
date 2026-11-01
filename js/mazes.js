/**
 * Maze generators.
 *
 * Each generator takes (rows, cols) — both odd — and returns
 *   { kind: 'wall' | 'weight', fill: boolean, ops: Array<[index, value]> }
 * `fill` means "start from a board full of walls"; `ops` are applied
 * in order, which lets the UI animate the construction.
 *
 * Odd/odd cells are rooms, so a start/target placed on odd coordinates
 * is always reachable in the division and backtracker mazes.
 */
(function (global) {
  'use strict';

  const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
  // Random number with the same parity as `lo`, in [lo, hi].
  const randStep2 = (lo, hi) => lo + 2 * randInt(0, Math.floor((hi - lo) / 2));

  function division(rows, cols) {
    const ops = [];
    const add = (r, c) => ops.push([r * cols + c, 1]);

    // Border, drawn clockwise.
    for (let c = 0; c < cols; c++) add(0, c);
    for (let r = 1; r < rows; r++) add(r, cols - 1);
    for (let c = cols - 2; c >= 0; c--) add(rows - 1, c);
    for (let r = rows - 2; r >= 1; r--) add(r, 0);

    // Chamber bounds are inclusive and always odd. Walls go on even lines,
    // holes on odd ones, so rooms never get sealed off.
    const divide = (r0, r1, c0, c1) => {
      const h = r1 - r0;
      const w = c1 - c0;
      if (h < 2 || w < 2) return;
      const horizontal = h > w ? true : w > h ? false : Math.random() < 0.5;
      if (horizontal) {
        const wr = randStep2(r0 + 1, r1 - 1);
        const hole = randStep2(c0, c1);
        for (let c = c0; c <= c1; c++) if (c !== hole) add(wr, c);
        divide(r0, wr - 1, c0, c1);
        divide(wr + 1, r1, c0, c1);
      } else {
        const wc = randStep2(c0 + 1, c1 - 1);
        const hole = randStep2(r0, r1);
        for (let r = r0; r <= r1; r++) if (r !== hole) add(r, wc);
        divide(r0, r1, c0, wc - 1);
        divide(r0, r1, wc + 1, c1);
      }
    };
    divide(1, rows - 2, 1, cols - 2);

    return { kind: 'wall', fill: false, ops };
  }

  function backtracker(rows, cols) {
    const ops = [];
    const carved = new Uint8Array(rows * cols);
    const carve = (r, c) => {
      carved[r * cols + c] = 1;
      ops.push([r * cols + c, 0]);
    };
    const dirs = [[-2, 0], [0, 2], [2, 0], [0, -2]];

    const stack = [[1, 1]];
    carve(1, 1);
    while (stack.length) {
      const [r, c] = stack[stack.length - 1];
      const options = dirs.filter(([dr, dc]) => {
        const nr = r + dr;
        const nc = c + dc;
        return nr >= 1 && nr <= rows - 2 && nc >= 1 && nc <= cols - 2 && !carved[nr * cols + nc];
      });
      if (!options.length) {
        stack.pop();
        continue;
      }
      const [dr, dc] = options[randInt(0, options.length - 1)];
      carve(r + dr / 2, c + dc / 2);
      carve(r + dr, c + dc);
      stack.push([r + dr, c + dc]);
    }

    // A perfect maze has exactly one route, which makes every algorithm
    // find the same path. Knock out a few walls to create loops.
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        const i = r * cols + c;
        const between = (r % 2 === 0) !== (c % 2 === 0);
        if (between && !carved[i] && Math.random() < 0.06) ops.push([i, 0]);
      }
    }

    return { kind: 'wall', fill: true, ops };
  }

  function random(rows, cols, density = 0.28) {
    const ops = [];
    for (let i = 0; i < rows * cols; i++) if (Math.random() < density) ops.push([i, 1]);
    return { kind: 'wall', fill: false, ops };
  }

  function weights(rows, cols, density = 0.25) {
    const ops = [];
    for (let i = 0; i < rows * cols; i++) if (Math.random() < density) ops.push([i, 1]);
    return { kind: 'weight', fill: false, ops };
  }

  global.Mazes = { division, backtracker, random, weights };
})(typeof window !== 'undefined' ? window : globalThis);
