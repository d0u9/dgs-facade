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

test('clearing removes only empty rows; Add copies active values', () => {
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
  assert.equal(boardSize(1, 1), 36);
  assert.equal(boardSize(2, 1), 46);
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

function equalNeighbours(board, start = 0) {
  let count = 0;
  for (let b = start; b < board.length; b++) for (let a = 0; a < b; a++) {
    const dr = Math.floor(b / 9) - Math.floor(a / 9);
    const dc = Math.abs(b % 9 - a % 9);
    if (board[b] && board[a] === board[b] && (b - a === 1 || (dr <= 1 && dc <= 1))) count++;
  }
  return count;
}

test('boards cover all digits with bounded frequency and reproducible solutions', () => {
  for (let level = 0; level < 3; level++) for (let seed = 1; seed <= 40; seed++) {
    const g = generate(level, seed, 3);
    assert.equal(new Set(g.board).size, 9);
    const cap = Math.ceil(g.board.length / 9) + 1;
    for (let n = 1; n <= 9; n++) assert.ok(g.board.filter(x => x === n).length <= cap);
    replay(g.board, g.path);
  }
  assert.deepEqual(generate(1, 731), generate(1, 731));
});

test('higher difficulties leave opening choices but require clearing gaps along the solution', () => {
  const densities = [];
  for (const level of [1, 2]) {
    let openings = 0, cells = 0, gapMoves = 0, moves = 0;
    for (const stage of [1, 3]) for (let seed = 1; seed <= 40; seed++) {
      const g = generate(level, Math.imul(seed, 0x9e3779b9), stage);
      const choices = matches(g.board).length;
      assert.ok(choices >= 3, 'a harder board must still offer several opening moves');
      openings += choices;
      cells += g.board.length;
      let b = g.board;
      for (const {pair} of g.path) {
        const [a, z] = pair;
        const touching = z - a === 1
          || (Math.abs(Math.floor(z / 9) - Math.floor(a / 9)) <= 1 && Math.abs(z % 9 - a % 9) <= 1);
        if (!touching) gapMoves++;
        moves++;
        assert.ok(matches(b).some(p => p.join() === pair.join()));
        b = remove(b, pair);
      }
      assert.equal(b.length, 0);
    }
    densities.push(openings / cells);
    assert.ok(openings / cells < (level === 1 ? 0.3 : 0.22), 'too many immediately available pairs');
    assert.ok(gapMoves / moves > 0.5, 'most of the route should involve opening gaps');
  }
  assert.ok(densities[1] < densities[0], 'hard should have fewer ready-made pairs per cell');
});

test('Add preserves cells and frequencies, is deterministic, and reduces identical neighbours', () => {
  let before = 0, after = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const g = generate(2, seed, 4);
    let b = g.board;
    for (const step of g.path.slice(0, 10)) b = remove(b, step.pair);
    const plain = b.concat(b.filter(Boolean));
    const added = append(b);
    if (matches(plain).length) assert.ok(matches(added).length);
    assert.deepEqual(added.slice(0, b.length), b);
    assert.deepEqual(added.slice(b.length).sort(), b.filter(Boolean).sort());
    assert.deepEqual(added, append(b));
    const oldCount = equalNeighbours(plain, b.length);
    const newCount = equalNeighbours(added, b.length);
    assert.ok(newCount <= oldCount);
    before += oldCount; after += newCount;
  }
  assert.ok(before > 0);
  assert.ok(after < before * 0.5, `${after} vs ${before}`);
  assert.deepEqual(append([5, 0, 5]), [5, 0, 5, 5, 5]);
  assert.deepEqual(append([]), []);
});

test('solver and gameplay agree on rearranged Add results', () => {
  const original = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const result = solve(original, 1, 12000);
  assert.equal(result.status, 'solved');
  assert.ok(result.path.some(step => step.add));
  let b = original;
  for (const step of result.path) {
    if (step.add) b = append(b);
    else { assert.ok(matches(b).some(p => p.join() === step.pair.join())); b = remove(b, step.pair); }
  }
  assert.equal(b.length, 0);
});
