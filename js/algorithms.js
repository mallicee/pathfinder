/**
 * Pathfinding algorithms on a 4-connected grid.
 *
 * Grid shape: { rows, cols, walls: Uint8Array, weights: Uint8Array }
 * Cells are addressed by flat index i = row * cols + col.
 *
 * Every algorithm is a pure function returning
 *   { visited: number[], path: number[], found: boolean }
 * where `visited` is the exploration order (used for animation)
 * and `path` runs from start to end inclusive.
 */
(function (global) {
  'use strict';

  const WEIGHT_COST = 10;

  /** Binary min-heap with a custom comparator. */
  class MinHeap {
    constructor(less) {
      this.items = [];
      this.less = less;
    }
    get size() {
      return this.items.length;
    }
    push(item) {
      const a = this.items;
      a.push(item);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!this.less(a[i], a[p])) break;
        [a[i], a[p]] = [a[p], a[i]];
        i = p;
      }
    }
    pop() {
      const a = this.items;
      const top = a[0];
      const last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < a.length && this.less(a[l], a[m])) m = l;
          if (r < a.length && this.less(a[r], a[m])) m = r;
          if (m === i) break;
          [a[i], a[m]] = [a[m], a[i]];
          i = m;
        }
      }
      return top;
    }
  }

  /** Open neighbours in a fixed order: up, right, down, left. */
  function neighbors(grid, i) {
    const { rows, cols, walls } = grid;
    const r = (i / cols) | 0;
    const c = i - r * cols;
    const out = [];
    if (r > 0 && !walls[i - cols]) out.push(i - cols);
    if (c < cols - 1 && !walls[i + 1]) out.push(i + 1);
    if (r < rows - 1 && !walls[i + cols]) out.push(i + cols);
    if (c > 0 && !walls[i - 1]) out.push(i - 1);
    return out;
  }

  const stepCost = (grid, i) => (grid.weights[i] ? WEIGHT_COST : 1);

  function manhattan(grid, a, b) {
    const { cols } = grid;
    const ar = (a / cols) | 0;
    const br = (b / cols) | 0;
    return Math.abs(ar - br) + Math.abs((a - ar * cols) - (b - br * cols));
  }

  function tracePath(prev, start, end) {
    if (end !== start && prev[end] === -1) return [];
    const path = [];
    for (let i = end; i !== -1; i = prev[i]) path.push(i);
    return path.reverse();
  }

  function pathCost(grid, path) {
    let cost = 0;
    for (let k = 1; k < path.length; k++) cost += stepCost(grid, path[k]);
    return cost;
  }

  /**
   * Shared core of Dijkstra, A* and Greedy Best-First.
   * priority = (useCost ? g : 0) + h, ties broken by h, then insertion order.
   */
  function bestFirst(grid, start, end, { useCost, heuristic }) {
    const n = grid.rows * grid.cols;
    const g = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const visited = [];
    let seq = 0;

    const heap = new MinHeap((x, y) =>
      x.f !== y.f ? x.f < y.f : x.h !== y.h ? x.h < y.h : x.s < y.s
    );

    g[start] = 0;
    const h0 = heuristic(start);
    heap.push({ i: start, f: h0, h: h0, s: seq++ });

    while (heap.size) {
      const { i } = heap.pop();
      if (closed[i]) continue; // stale heap entry
      closed[i] = 1;
      visited.push(i);
      if (i === end) break;

      for (const nb of neighbors(grid, i)) {
        if (closed[nb]) continue;
        const ng = g[i] + stepCost(grid, nb);
        if (ng < g[nb]) {
          g[nb] = ng;
          prev[nb] = i;
          const h = heuristic(nb);
          heap.push({ i: nb, f: (useCost ? ng : 0) + h, h, s: seq++ });
        }
      }
    }

    const found = closed[end] === 1;
    return { visited, path: found ? tracePath(prev, start, end) : [], found };
  }

  function dijkstra(grid, start, end) {
    return bestFirst(grid, start, end, { useCost: true, heuristic: () => 0 });
  }

  function astar(grid, start, end) {
    // Manhattan distance is admissible because the cheapest step costs 1.
    return bestFirst(grid, start, end, {
      useCost: true,
      heuristic: (i) => manhattan(grid, i, end),
    });
  }

  function greedy(grid, start, end) {
    return bestFirst(grid, start, end, {
      useCost: false,
      heuristic: (i) => manhattan(grid, i, end),
    });
  }

  function bfs(grid, start, end) {
    const n = grid.rows * grid.cols;
    const seen = new Uint8Array(n);
    const prev = new Int32Array(n).fill(-1);
    const queue = new Int32Array(n);
    const visited = [];
    let head = 0;
    let tail = 0;

    seen[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const i = queue[head++];
      visited.push(i);
      if (i === end) break;
      for (const nb of neighbors(grid, i)) {
        if (!seen[nb]) {
          seen[nb] = 1;
          prev[nb] = i;
          queue[tail++] = nb;
        }
      }
    }

    const found = visited[visited.length - 1] === end;
    return { visited, path: found ? tracePath(prev, start, end) : [], found };
  }

  function dfs(grid, start, end) {
    const n = grid.rows * grid.cols;
    const seen = new Uint8Array(n);
    const prev = new Int32Array(n).fill(-1);
    const stack = [start];
    const visited = [];

    while (stack.length) {
      const i = stack.pop();
      if (seen[i]) continue;
      seen[i] = 1;
      visited.push(i);
      if (i === end) break;
      const nbs = neighbors(grid, i);
      // Push in reverse so the first neighbour (up) is explored first.
      // The most recent push is always popped first, so prev stays consistent.
      for (let k = nbs.length - 1; k >= 0; k--) {
        const nb = nbs[k];
        if (!seen[nb]) {
          prev[nb] = i;
          stack.push(nb);
        }
      }
    }

    const found = seen[end] === 1;
    return { visited, path: found ? tracePath(prev, start, end) : [], found };
  }

  function bidirectional(grid, start, end) {
    const n = grid.rows * grid.cols;
    const makeSide = (origin) => {
      const side = {
        queue: [origin],
        head: 0,
        seen: new Uint8Array(n),
        prev: new Int32Array(n).fill(-1),
      };
      side.seen[origin] = 1;
      return side;
    };
    const a = makeSide(start);
    const b = makeSide(end);
    const visited = [];

    // Expands one node of `side`; returns the meeting cell or -1.
    const expand = (side, other) => {
      const i = side.queue[side.head++];
      visited.push(i);
      for (const nb of neighbors(grid, i)) {
        if (!side.seen[nb]) {
          side.seen[nb] = 1;
          side.prev[nb] = i;
          side.queue.push(nb);
        }
        if (other.seen[nb]) return nb;
      }
      return -1;
    };

    let meet = start === end ? start : -1;
    while (meet < 0 && a.head < a.queue.length && b.head < b.queue.length) {
      meet = expand(a, b);
      if (meet < 0) meet = expand(b, a);
    }
    if (meet < 0) return { visited, path: [], found: false };

    const path = tracePath(a.prev, start, meet);
    for (let i = b.prev[meet]; i !== -1; i = b.prev[i]) path.push(i);
    return { visited, path, found: true };
  }

  const algorithms = {
    astar: {
      fn: astar,
      name: 'A* Search',
      weighted: true,
      optimal: true,
      desc: 'Combines the distance travelled with a Manhattan-distance estimate to the target, so it heads straight for the goal.',
    },
    dijkstra: {
      fn: dijkstra,
      name: 'Dijkstra',
      weighted: true,
      optimal: true,
      desc: 'Expands cells in order of their distance from the start. The classic shortest-path algorithm.',
    },
    greedy: {
      fn: greedy,
      name: 'Greedy Best-First',
      weighted: true,
      optimal: false,
      desc: 'Always expands the cell that looks closest to the target. Very fast, but easily fooled by obstacles.',
    },
    bfs: {
      fn: bfs,
      name: 'Breadth-First Search',
      weighted: false,
      optimal: true,
      desc: 'Explores the grid level by level, like a ripple. Ignores weights, so the path is shortest in steps, not cost.',
    },
    bidirectional: {
      fn: bidirectional,
      name: 'Bidirectional BFS',
      weighted: false,
      optimal: true,
      desc: 'Runs two breadth-first searches, from the start and from the target, until they meet in the middle.',
    },
    dfs: {
      fn: dfs,
      name: 'Depth-First Search',
      weighted: false,
      optimal: false,
      desc: 'Goes as deep as possible before backtracking. Finds a path, but rarely a good one.',
    },
  };

  function run(name, grid, start, end) {
    const algo = algorithms[name];
    if (!algo) throw new Error(`Unknown algorithm: ${name}`);
    const result = algo.fn(grid, start, end);
    result.cost = pathCost(grid, result.path);
    return result;
  }

  global.Pathfinding = { WEIGHT_COST, algorithms, run, neighbors, MinHeap };
})(typeof window !== 'undefined' ? window : globalThis);
