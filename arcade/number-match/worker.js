// Board generation and hint search can each take a few hundred milliseconds,
// so they run here instead of blocking taps on the page.
import { generate, matches, solve } from './engine.js';

function hint(board, adds) {
  const direct = solve(board, 0, 12000);
  const result = direct.status === 'solved' || !adds ? direct : solve(board, adds, 40000);
  if (result.status === 'solved') return { status: 'solved', first: result.path[0] };
  if (result.status === 'dead') return { status: 'dead' };
  return { status: 'unknown', pair: matches(board)[0] || null };
}

self.onmessage = ({ data }) => {
  const { id, type } = data;
  if (type === 'generate') {
    self.postMessage({ id, board: generate(data.level, data.seed, data.stage).board });
  } else if (type === 'hint') {
    self.postMessage({ id, ...hint(data.board, data.adds) });
  }
};
