import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADD_LIMIT, append, boardSize, generate, matches, remove, scoreMove, solve } from './engine.js';

const empty = (n) => Array(n).fill(0);

test('legal paths skip holes, reject blockers and include diagonal and row wrap', () => {
  assert.deepEqual(matches([1, 0, 9]), [[0, 2]]);
  assert.deepEqual(matches([1, 2, 9]), []);
  assert.deepEqual(matches([1, ...empty(8), 9]), [[0, 9]]);
  assert.deepEqual(matches([1, ...empty(9), 9]), [[0, 10]]);
  assert.deepEqual(matches([...empty(8), 3, 7]), [[8, 9]]);
  assert.deepEqual(matches([3, 0, 6]), []);
});

test('clearing removes only empty rows; Add copies active numbers in order', () => {
  assert.deepEqual(remove([1, 9, ...empty(7), 4, 6], [0, 1]), [4, 6]);
  assert.deepEqual(append([1, 0, 9]), [1, 0, 9, 1, 9]);
  assert.equal(ADD_LIMIT, 5);
});

test('scoring rewards reach, emptied rows and a cleared board', () => {
  assert.equal(scoreMove([1, 9, 2, 8], [0, 1]).points, 1);
  assert.equal(scoreMove([1, 0, 9, 2, 8], [0, 2]).points, 4);
  // Diagonal neighbours touch.
  assert.equal(scoreMove([1, 2, ...empty(7), 3, 9, 7], [0, 10]).points, 1);
  const row = scoreMove([1, 9, ...empty(7), 4, 6], [0, 1]);
  assert.equal(row.rows, 1);
  assert.equal(row.points, 1 + 10);
  assert.equal(scoreMove([5, 5], [0, 1]).points, 1 + 10 + 150);
});

test('search distinguishes a dead end, a route using Add, and exhaustion', () => {
  assert.equal(solve([1], 0).status, 'dead');
  const route = solve([1], 1);
  assert.equal(route.status, 'solved');
  assert.equal(route.path[0].add, true);
  assert.equal(solve([1, 9], 0, 0).status, 'unknown');
});

test('stages grow the board up to six rows', () => {
  assert.equal(boardSize(0, 1), 18);
  assert.equal(boardSize(0, 2), 26);
  assert.equal(boardSize(2, 99), 54);
});

function replay(board, path) {
  let b = board;
  for (const step of path) {
    assert.ok(matches(b).some((p) => p.join() === step.pair.join()));
    b = remove(b, step.pair);
  }
  assert.equal(b.length, 0);
}

test('generated boards across levels and stages replay their verified route', () => {
  for (let level = 0; level < 3; level++) {
    for (const stage of [1, 2, 4]) {
      for (let seed = 1; seed <= 10; seed++) {
        const g = generate(level, seed, stage);
        assert.equal(g.board.length, boardSize(level, stage));
        assert.ok(g.path, `level ${level} stage ${stage} seed ${seed}`);
        replay(g.board, g.path);
      }
    }
  }
});
