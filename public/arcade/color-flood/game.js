(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const movesEl = document.getElementById('moves');
  const limitEl = document.getElementById('limit');
  const filledEl = document.getElementById('filled');
  const messageEl = document.getElementById('message');
  const swatches = document.getElementById('swatches');

  const W = canvas.width, H = canvas.height, N = 14, CELL = W / N;
  const LIMIT = 24;
  // SITE PATCH: Okabe-Ito colors keep the six choices distinct for common
  // forms of color vision deficiency.
  const COLORS = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#CC79A7'];
  const COLOR_NAMES = ['orange', 'sky blue', 'bluish green', 'yellow', 'blue', 'reddish purple'];

  let grid, moves, over;

  function newGame() {
    grid = Array.from({ length: N }, () => Array.from({ length: N },
      () => Math.floor(Math.random() * COLORS.length)));
    moves = 0; over = false;
    movesEl.textContent = '0';
    limitEl.textContent = String(LIMIT);
    messageEl.textContent = 'Pick a color to flood.';
    draw();
  }

  function flood(color) {
    if (over) return;
    const old = grid[0][0];
    if (color === old) return;
    const seen = Array.from({ length: N }, () => Array(N).fill(false));
    const stack = [[0, 0]];
    seen[0][0] = true;
    while (stack.length) {
      const [r, c] = stack.pop();
      grid[r][c] = color;
      for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < N && nc >= 0 && nc < N && !seen[nr][nc] && grid[nr][nc] === old) {
          seen[nr][nc] = true; stack.push([nr, nc]);
        }
      }
    }
    moves++;
    movesEl.textContent = String(moves);
    const pct = Math.round((grid.flat().filter(v => v === grid[0][0]).length) / (N * N) * 100);
    filledEl.textContent = pct + '%';
    if (grid.every(row => row.every(v => v === grid[0][0]))) {
      over = true; messageEl.textContent = `Solved in ${moves} moves!`;
    } else if (moves >= LIMIT) {
      over = true; messageEl.textContent = 'Out of moves — try again!';
    }
    draw();
  }

  function draw() {
    ctx.fillStyle = '#050610'; // SITE PATCH: board backdrop matches the page
    ctx.fillRect(0, 0, W, H);
    // SITE PATCH: rounded, slightly translucent cells with a lit edge, so a
    // full board of saturated hues still reads as part of the dark theme.
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        const col = COLORS[grid[r][c]];
        ctx.save();
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.roundRect(c * CELL + 2, r * CELL + 2, CELL - 5, CELL - 5, 7); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = col; ctx.lineWidth = 1;
        ctx.shadowBlur = 10; ctx.shadowColor = col;
        ctx.stroke();
        ctx.restore();
      }
  }

  COLORS.forEach((col, i) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.type = 'button';
    b.setAttribute('aria-label', COLOR_NAMES[i]);
    b.style.background = col;
    b.addEventListener('click', () => flood(i));
    swatches.appendChild(b);
  });

  // SITE PATCH: upstream only ever calls newGame() on load, so there is no way
  // to start over without reloading. Expose it for the page's restart button.
  window.colorFloodNewGame = newGame;

  newGame();
})();
