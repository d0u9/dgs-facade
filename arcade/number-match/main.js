import { ADD_LIMIT, COLS, append, matches, scoreMove } from './engine.js';

const $ = (id) => document.getElementById(id);
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

let board = [];
let adds = ADD_LIMIT;
let score = 0;
let stage = 1;
let selected = null;
let hinted = [];
let history = [];
let busy = false;
// Every state change bumps the revision, so a worker reply that arrives
// after the player moved on is dropped.
let revision = 0;
// Marks the numbers the latest Add appended, parallel to board.
let fresh = [];

const BEST_KEY = 'd0u9-number-match-best';
let best = 0;
try { best = Number(localStorage.getItem(BEST_KEY) || 0); } catch {}

function commitBest() {
  if (score <= best) return;
  best = score;
  try { localStorage.setItem(BEST_KEY, String(best)); } catch {}
}

// Drops the same emptied rows from a parallel array that remove() drops
// from the board.
function keepRows(values, before, pair) {
  const cleared = before.slice();
  for (const i of pair) cleared[i] = 0;
  const out = [];
  for (let i = 0; i < cleared.length; i += COLS) {
    if (cleared.slice(i, i + COLS).some(Boolean)) out.push(...values.slice(i, i + COLS));
  }
  return out;
}

function ask(message) {
  const id = ++revision;
  return new Promise((resolve) => {
    const listener = ({ data }) => {
      if (data.id !== id) return;
      worker.removeEventListener('message', listener);
      resolve(id === revision ? data : null);
    };
    worker.addEventListener('message', listener);
    worker.postMessage({ ...message, id });
  });
}

function render(message) {
  const grid = $('board');
  grid.replaceChildren();
  const cells = Math.ceil(board.length / COLS) * COLS;
  for (let i = 0; i < cells; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nm-cell'
      + (!board[i] ? ' empty' : '')
      + (i >= board.length ? ' padding' : '')
      + (selected === i ? ' selected' : '')
      + (hinted.includes(i) ? ' hinted' : '')
      + (board[i] && fresh[i] ? ' fresh' : '');
    btn.textContent = board[i] || '·';
    btn.disabled = !board[i] || busy;
    btn.setAttribute('aria-label', `Row ${Math.floor(i / COLS) + 1}, column ${(i % COLS) + 1}: ${board[i] || 'empty'}`);
    btn.setAttribute('aria-pressed', String(selected === i));
    btn.onclick = () => pick(i);
    grid.append(btn);
  }
  $('score').textContent = score;
  $('stage').textContent = stage;
  $('remaining').textContent = board.filter(Boolean).length;
  $('best').textContent = best;
  $('adds').textContent = adds;
  $('add').setAttribute('aria-label', `Add numbers, ${adds} left`);
  $('undo').disabled = !history.length || busy;
  $('hint').disabled = !board.length || busy;
  $('add').disabled = !board.length || !adds || busy;
  $('win').hidden = !!board.length || busy;
  $('winStage').textContent = `stage ${stage} cleared`;
  $('winScore').textContent = score;
  grid.hidden = !board.length;
  if (message) $('status').textContent = message;
}

function save() {
  history.push({ board: board.slice(), fresh: fresh.slice(), adds, score });
  revision++;
  selected = null;
  hinted = [];
}

function pick(i) {
  hinted = [];
  if (selected === null) {
    selected = i;
    render('Choose its partner: equal, or together making 10.');
    return;
  }
  if (selected === i) {
    selected = null;
    render('Selection cleared.');
    return;
  }
  const pair = matches(board).find((p) => p.includes(i) && p.includes(selected));
  if (!pair) {
    selected = i;
    render('Those numbers cannot connect. Try a partner for this number.');
    return;
  }
  const move = scoreMove(board, pair);
  save();
  fresh = keepRows(fresh, board, pair);
  board = move.next;
  score += move.points;
  commitBest();
  let message = `+${move.points}` + (move.rows ? ` · ${move.rows > 1 ? `${move.rows} rows` : 'row'} cleared` : '');
  if (!board.length) message = `Stage ${stage} cleared! +${move.points}`;
  else if (!matches(board).length) {
    message += adds ? '. No pairs left: add numbers or undo.' : '. No pairs left: undo to try another route.';
  }
  render(message);
}

async function start(nextStage) {
  stage = nextStage;
  if (stage === 1) score = 0;
  adds = ADD_LIMIT;
  history = [];
  selected = null;
  hinted = [];
  busy = true;
  board = [];
  fresh = [];
  render('Building a board with a verified solution…');
  const reply = await ask({ type: 'generate', level: Number($('difficulty').value), stage, seed: Date.now() });
  if (!reply) return;
  board = reply.board;
  busy = false;
  render(`Stage ${stage}. This board has a verified solution.`);
}

async function hint() {
  busy = true;
  selected = null;
  render('Looking for a route to clear the board…');
  const reply = await ask({ type: 'hint', board, adds });
  if (!reply) return;
  busy = false;
  if (reply.status === 'solved') {
    if (reply.first.pair) {
      hinted = reply.first.pair;
      render('These two start a verified route to clear the board.');
    } else render('A verified route starts by adding numbers.');
  } else if (reply.status === 'dead') {
    render('No route remains with your available Adds. Undo to explore another choice.');
  } else {
    hinted = reply.pair || [];
    render(hinted.length
      ? 'Possible pair highlighted; a full solution is not yet confirmed.'
      : 'Search limit reached. Try Add or undo; this is not a confirmed dead end.');
  }
}

$('new').onclick = () => start(1);
$('difficulty').onchange = () => start(1);
$('next').onclick = () => start(stage + 1);
$('hint').onclick = hint;
$('undo').onclick = () => {
  const prev = history.pop();
  if (!prev) return;
  ({ board, fresh, adds, score } = prev);
  revision++;
  busy = false;
  selected = null;
  hinted = [];
  render('Move undone. Try another route.');
};
$('add').onclick = () => {
  if ($('add').disabled) return;
  save();
  const before = board.length;
  board = append(board);
  fresh = board.map((_, i) => i >= before);
  adds--;
  render('Remaining numbers copied onto the end of the board.');
};

start(1);
