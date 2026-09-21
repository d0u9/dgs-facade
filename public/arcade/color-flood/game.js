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

  let grid, moves, over, failed;
  // SITE PATCH: per-cell state for the spreading-flood animation. `fromColor`
  // holds the color a cell is leaving, `delay` is how long after the click that
  // cell turns, in milliseconds, taken from its distance through the region.
  let fromColor, delay, animStart, animFrame = 0, animGuard = 0;
  const WAVE_STEP = 26;   // ms between one ring of the flood and the next
  const CELL_FADE = 170;  // ms a single cell takes to change color

  function newGame() {
    grid = Array.from({ length: N }, () => Array.from({ length: N },
      () => Math.floor(Math.random() * COLORS.length)));
    moves = 0; over = false; failed = false;
    fromColor = null; delay = null; animStart = 0;
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = 0; }
    clearTimeout(animGuard);
    movesEl.textContent = '0';
    limitEl.textContent = String(LIMIT);
    messageEl.textContent = 'Pick a color to flood.';
    draw();
  }

  function flood(color) {
    if (over) return;
    const old = grid[0][0];
    if (color === old) return;
    // SITE PATCH: breadth-first instead of the upstream stack, so each cell
    // knows its distance from the corner and can turn a beat after the cell
    // that reached it. That distance is what makes the color look contagious.
    const seen = Array.from({ length: N }, () => Array(N).fill(false));
    fromColor = Array.from({ length: N }, () => Array(N).fill(-1));
    delay = Array.from({ length: N }, () => Array(N).fill(0));
    let queue = [[0, 0]];
    let depth = 0;
    seen[0][0] = true;
    while (queue.length) {
      const next = [];
      for (const [r, c] of queue) {
        fromColor[r][c] = old;
        delay[r][c] = depth * WAVE_STEP;
        grid[r][c] = color;
        for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < N && nc >= 0 && nc < N && !seen[nr][nc] && grid[nr][nc] === old) {
            seen[nr][nc] = true; next.push([nr, nc]);
          }
        }
      }
      queue = next; depth++;
    }
    animStart = performance.now();
    moves++;
    movesEl.textContent = String(moves);
    const pct = Math.round((grid.flat().filter(v => v === grid[0][0]).length) / (N * N) * 100);
    filledEl.textContent = pct + '%';
    // SITE PATCH: upstream ends the game at the move limit. Here the limit is
    // only a target: passing it marks the board failed but play continues, and
    // a finish after that is reported without the "Solved" wording so the
    // personal best stays a record of wins inside the limit.
    if (grid.every(row => row.every(v => v === grid[0][0]))) {
      over = true;
      messageEl.textContent = failed
        ? `Failed — filled in ${moves} moves.`
        : `Solved in ${moves} moves!`;
    } else if (moves >= LIMIT) {
      failed = true;
      messageEl.textContent = `Failed at ${LIMIT} moves — keep playing.`;
    }
    runAnimation();
  }

  // SITE PATCH: drives the flood animation, then leaves the board painted in
  // its settled state.
  function runAnimation() {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = 0; }
    clearTimeout(animGuard);
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      fromColor = null; draw(); return;
    }
    let framed = false;
    const step = () => {
      framed = true;
      const done = draw();
      if (done) { fromColor = null; animFrame = 0; draw(); return; }
      animFrame = requestAnimationFrame(step);
    };
    animFrame = requestAnimationFrame(step);
    // requestAnimationFrame is throttled to a stop in a hidden tab, which would
    // leave the board painted in its pre-move state. If no frame arrives, paint
    // the settled board instead of waiting for the tab to come back.
    animGuard = setTimeout(() => {
      if (framed) return;
      if (animFrame) { cancelAnimationFrame(animFrame); animFrame = 0; }
      fromColor = null; draw();
    }, 400);
  }

  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (sh) => Math.round(((pa >> sh) & 255) + (((pb >> sh) & 255) - ((pa >> sh) & 255)) * t);
    return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
  }

  function draw() {
    ctx.fillStyle = '#050610'; // SITE PATCH: board backdrop matches the page
    ctx.fillRect(0, 0, W, H);
    // SITE PATCH: rounded, slightly translucent cells with a lit edge, so a
    // full board of saturated hues still reads as part of the dark theme.
    const now = performance.now();
    let done = true;
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        let col = COLORS[grid[r][c]];
        let t = 1;
        if (fromColor && fromColor[r][c] >= 0) {
          t = (now - animStart - delay[r][c]) / CELL_FADE;
          if (t < 1) done = false;
          t = Math.max(0, Math.min(1, t));
          const eased = t * t * (3 - 2 * t);
          col = mix(COLORS[fromColor[r][c]], COLORS[grid[r][c]], eased);
        }
        // SITE PATCH: a cell swells a little as its color arrives, so the wave
        // reads as a front moving outward rather than a flat repaint.
        const pop = t > 0 && t < 1 ? Math.sin(t * Math.PI) * 2.4 : 0;
        ctx.save();
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.roundRect(c * CELL + 2 - pop, r * CELL + 2 - pop, CELL - 5 + pop * 2, CELL - 5 + pop * 2, 7);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = col; ctx.lineWidth = 1;
        ctx.shadowBlur = 10 + pop * 4; ctx.shadowColor = col;
        ctx.stroke();
        ctx.restore();
      }
    return done;
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
