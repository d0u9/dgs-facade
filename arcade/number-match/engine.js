// Pure Number Match rules. The board is a flat array read row by row, COLS
// wide; 0 marks a cleared cell. Nothing here touches the DOM, so the same
// module runs in the page, the worker and the tests.

export const COLS = 9;
export const ADD_LIMIT = 5;

const POINTS_NEAR = 1;
const POINTS_FAR = 4;
const POINTS_ROW = 10;
const POINTS_BOARD = 150;

const rowOf = (i) => Math.floor(i / COLS);
const colOf = (i) => i % COLS;

function isEmptyBetween(board, from, to, step) {
  for (let i = from + step; i < to; i += step) if (board[i]) return false;
  return true;
}

// Straight lines (row, column, diagonal) and reading order both count;
// every cell between the two numbers must already be cleared.
export function canConnect(board, a, z) {
  if (a > z) [a, z] = [z, a];
  const dr = rowOf(z) - rowOf(a);
  const dc = colOf(z) - colOf(a);
  let step = 0;
  if (dr === 0) step = 1;
  else if (dc === 0) step = COLS;
  else if (Math.abs(dr) === Math.abs(dc)) step = COLS + Math.sign(dc);
  return (step > 0 && isEmptyBetween(board, a, z, step)) || isEmptyBetween(board, a, z, 1);
}

export function isPairValue(x, y) {
  return x > 0 && y > 0 && (x === y || x + y === 10);
}

export function matches(board) {
  const out = [];
  for (let a = 0; a < board.length; a++) {
    if (!board[a]) continue;
    for (let z = a + 1; z < board.length; z++) {
      if (isPairValue(board[a], board[z]) && canConnect(board, a, z)) out.push([a, z]);
    }
  }
  return out;
}

// Rows left empty by the move disappear; the rest keep their order.
export function remove(board, pair) {
  const next = board.slice();
  for (const i of pair) next[i] = 0;
  const out = [];
  for (let i = 0; i < next.length; i += COLS) {
    const row = next.slice(i, i + COLS);
    if (row.some(Boolean)) out.push(...row);
  }
  return out;
}

// Previously placed neighbours, including the reading-order row boundary.
function neighbours(i) {
  const result = [];
  if (i > 0) result.push(i - 1);
  if (i >= COLS) {
    result.push(i - COLS);
    if (i % COLS > 0) result.push(i - COLS - 1);
    if (i % COLS < COLS - 1) result.push(i - COLS + 1);
  }
  return result;
}

function repetitions(board, start = 0) {
  let total = 0;
  for (let i = start; i < board.length; i++) {
    if (board[i]) for (const j of neighbours(i)) if (board[j] === board[i]) total++;
  }
  return total;
}

function hasMatch(board) {
  for (let a = 0; a < board.length; a++) if (board[a]) {
    for (let z = a + 1; z < board.length; z++) {
      if (isPairValue(board[a], board[z]) && canConnect(board, a, z)) return true;
    }
  }
  return false;
}

export function append(board) {
  const remaining = board.filter(Boolean);
  if (!remaining.length) return board.slice();
  // Seed from the full state: hints and actual Add must produce exactly the
  // same arrangement. Neither the original cells nor the multiset changes.
  let seed = 2166136261;
  for (const n of board) seed = Math.imul(seed ^ n, 16777619);
  const rand = random(seed);
  let best = board.concat(remaining);
  let cost = repetitions(best, board.length);
  const preserveMove = hasMatch(best);
  for (let attempt = 0; attempt < 8 && cost > 0; attempt++) {
    const counts = Array(10).fill(0);
    remaining.forEach(n => counts[n]++);
    const next = board.slice();
    while (next.length < board.length + remaining.length) {
      const near = neighbours(next.length);
      let choice = 0, lowest = Infinity;
      for (let n = 1; n <= 9; n++) if (counts[n]) {
        const conflicts = near.filter(j => next[j] === n).length;
        const rank = conflicts * 100 - counts[n] + rand() * 2;
        if (rank < lowest) { lowest = rank; choice = n; }
      }
      next.push(choice);
      counts[choice]--;
    }
    const nextCost = repetitions(next, board.length);
    if (nextCost < cost && (!preserveMove || hasMatch(next))) { best = next; cost = nextCost; }
  }
  return best;
}

// Touching cells, including diagonals and a row end followed by the next
// row start, earn the small reward; any longer reach earns the large one.
export function scoreMove(board, pair) {
  const [a, z] = pair[0] < pair[1] ? pair : [pair[1], pair[0]];
  const touching = z - a === 1
    || (Math.abs(rowOf(z) - rowOf(a)) <= 1 && Math.abs(colOf(z) - colOf(a)) <= 1);
  const next = remove(board, pair);
  const rows = Math.ceil(board.length / COLS) - Math.ceil(next.length / COLS);
  let points = touching ? POINTS_NEAR : POINTS_FAR;
  points += rows * POINTS_ROW;
  if (!next.length) points += POINTS_BOARD;
  return { points, rows, next };
}

// A bounded depth-first search. Running out of budget reports 'unknown',
// which is never proof that the board is lost.
export function solve(board, adds = 0, limit = 12000) {
  let visited = 0;
  const dead = new Set();

  function walk(b, left) {
    if (!b.some(Boolean)) return [];
    if (++visited > limit) throw new Error('budget');
    const key = left + ':' + b.join('');
    if (dead.has(key)) return null;
    // Prefer moves that delete rows, then the shortest reach.
    const moves = matches(b)
      .map((pair) => ({ pair, next: remove(b, pair) }))
      .sort((x, y) => x.next.length - y.next.length || (x.pair[1] - x.pair[0]) - (y.pair[1] - y.pair[0]));
    for (const { pair, next } of moves) {
      const tail = walk(next, left);
      if (tail) return [{ pair }, ...tail];
    }
    if (left) {
      const tail = walk(append(b), left - 1);
      if (tail) return [{ add: true }, ...tail];
    }
    dead.add(key);
    return null;
  }

  try {
    const path = walk(board, adds);
    return { status: path ? 'solved' : 'dead', path, visited };
  } catch (error) {
    if (error.message !== 'budget') throw error;
    return { status: 'unknown', path: null, visited };
  }
}

// Mix nearby seeds as well as successive draws (Mulberry32).
function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(values, rand) {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

// Cover every digit, then favour underrepresented values. Pair construction
// preserves the even counts required by each complementary number group.
function balancedPairs(count, rand) {
  const pairs = [[1, 9], [2, 8], [3, 7], [4, 6], [5, 5]];
  const counts = Array(10).fill(0);
  pairs.flat().forEach(n => counts[n]++);
  const cap = Math.ceil(count / 9) + 1;
  while (pairs.length < count / 2) {
    const candidates = [];
    for (let n = 1; n <= 9; n++) for (const m of new Set([n, 10 - n])) {
      if (counts[n] + (n === m ? 2 : 1) > cap || counts[m] + 1 > cap) continue;
      candidates.push({pair: [n, m], weight: counts[n] + counts[m] + rand() * 2});
    }
    candidates.sort((a, b) => a.weight - b.weight);
    const pair = candidates[0].pair;
    pair.forEach(n => counts[n]++);
    pairs.push(pair);
  }
  return shuffle(pairs, rand);
}

export function boardSize(level, stage = 1) {
  const base = [18, 26, 36][level];
  return Math.min(base + (stage - 1) * 8, 54);
}

// A constructive fallback carries its own solution certificate instead of
// hoping a bounded search rediscovers the intended nested-pair order.
function nestedBoard(pairs, rand) {
  const board = [], ids = [], open = [], closing = [];
  let next = 0;
  while (next < pairs.length || open.length) {
    if (next < pairs.length && (!open.length || rand() < 0.5)) {
      const [a, b] = pairs[next];
      const id = next++ * 2 + 1;
      board.push(a); ids.push(id); open.push({value: b, id});
    } else {
      const {value, id} = open.pop();
      board.push(value); ids.push(id + 1); closing.push([id, id + 1]);
    }
  }
  let positions = ids;
  const path = closing.map(pairIds => {
    const pair = pairIds.map(id => positions.indexOf(id));
    positions = remove(positions, pair);
    return {pair};
  });
  return {board, path};
}

export function generate(level = 0, seed = Date.now(), stage = 1) {
  const rand = random(seed);
  const count = boardSize(level, stage);
  const minChoices = [4, 3, 2][level];
  const maxRepeats = Math.floor(count * 0.16);
  for (let attempt = 0; attempt < 90; attempt++) {
    const board = shuffle(balancedPairs(count, rand).flat(), rand);
    if (repetitions(board) > maxRepeats || matches(board).length < minChoices) continue;
    const result = solve(board, 0, 6000);
    if (result.status === 'solved') return {board, path: result.path};
  }
  let best;
  for (let attempt = 0; attempt < 32; attempt++) {
    const candidate = nestedBoard(balancedPairs(count, rand), rand);
    if (!best || repetitions(candidate.board) < repetitions(best.board)) best = candidate;
    if (repetitions(best.board) <= maxRepeats && matches(best.board).length >= minChoices) break;
  }
  return best;
}
