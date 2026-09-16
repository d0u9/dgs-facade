export const SIZE = 4;

export function emptyBoard() {
  return Array(SIZE * SIZE).fill(0);
}

export function addRandomTile(board, random = Math.random) {
  const empty = [];
  board.forEach((value, index) => {
    if (value === 0) empty.push(index);
  });

  if (empty.length === 0) return board.slice();

  const result = board.slice();
  const index = empty[Math.floor(random() * empty.length)];
  result[index] = random() < 0.9 ? 2 : 4;
  return result;
}

export function newGame(random = Math.random) {
  return addRandomTile(addRandomTile(emptyBoard(), random), random);
}

function mergeLine(line) {
  const compact = line.filter(Boolean);
  const merged = [];
  let gained = 0;

  for (let i = 0; i < compact.length; i += 1) {
    if (compact[i] === compact[i + 1]) {
      const value = compact[i] * 2;
      merged.push(value);
      gained += value;
      i += 1;
    } else {
      merged.push(compact[i]);
    }
  }

  while (merged.length < SIZE) merged.push(0);
  return { line: merged, gained };
}

function getRow(board, row) {
  return board.slice(row * SIZE, row * SIZE + SIZE);
}

function setRow(board, row, values) {
  values.forEach((value, col) => {
    board[row * SIZE + col] = value;
  });
}

function getCol(board, col) {
  return Array.from({ length: SIZE }, (_, row) => board[row * SIZE + col]);
}

function setCol(board, col, values) {
  values.forEach((value, row) => {
    board[row * SIZE + col] = value;
  });
}

export function move(board, direction) {
  const result = board.slice();
  let gained = 0;

  for (let i = 0; i < SIZE; i += 1) {
    const horizontal = direction === 'left' || direction === 'right';
    let line = horizontal ? getRow(board, i) : getCol(board, i);

    if (direction === 'right' || direction === 'down') {
      line = line.slice().reverse();
    }

    const merged = mergeLine(line);
    gained += merged.gained;
    let output = merged.line;

    if (direction === 'right' || direction === 'down') {
      output = output.slice().reverse();
    }

    if (horizontal) setRow(result, i, output);
    else setCol(result, i, output);
  }

  const changed = result.some((value, index) => value !== board[index]);
  return { board: result, gained, changed };
}

export function canMove(board) {
  if (board.some((value) => value === 0)) return true;

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const value = board[row * SIZE + col];
      if (col < SIZE - 1 && value === board[row * SIZE + col + 1]) return true;
      if (row < SIZE - 1 && value === board[(row + 1) * SIZE + col]) return true;
    }
  }

  return false;
}
