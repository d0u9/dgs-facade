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

export function append(board) {
  return board.concat(board.filter(Boolean));
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

function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function randomPair(rand) {
  const n = 1 + Math.floor(rand() * 9);
  return [n, rand() < 0.5 ? n : 10 - n];
}

// Each stage adds a row's worth of numbers, up to six full rows.
export function boardSize(level, stage = 1) {
  const base = [18, 26, 36][level];
  return Math.min(base + (stage - 1) * 8, 54);
}

// Pairs nested like brackets always clear in reading order, innermost
// first, so this layout is solvable by construction and still shuffled.
function nestedBoard(count, rand) {
  const board = [];
  const open = [];
  let pairsLeft = count / 2;
  while (pairsLeft || open.length) {
    if (pairsLeft && (!open.length || rand() < 0.5)) {
      const pair = randomPair(rand);
      board.push(pair[0]);
      open.push(pair[1]);
      pairsLeft--;
    } else {
      board.push(open.pop());
    }
  }
  return board;
}

export function generate(level = 0, seed = Date.now(), stage = 1) {
  const rand = random(seed);
  const count = boardSize(level, stage);
  const minChoices = [4, 3, 2][level];
  for (let attempt = 0; attempt < 90; attempt++) {
    const board = [];
    for (let i = 0; i < count / 2; i++) board.push(...randomPair(rand));
    for (let i = board.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [board[i], board[j]] = [board[j], board[i]];
    }
    const result = solve(board, 0, 6000);
    if (result.status === 'solved' && matches(board).length >= minChoices) return { board, path: result.path };
  }
  const board = nestedBoard(count, rand);
  return { board, path: solve(board, 0, 60000).path };
}
