(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const messageEl = document.getElementById('message');

  const W = canvas.width, H = canvas.height, BLOCK_H = 28;
  // SITE PATCH: stack cycles the site's neon hues instead of a rainbow sweep;
  // the falling block stays on the accent color the HUD uses for live values.
  const STACK_COLORS = ['#25f4ee', '#ffe66d', '#4d7cff', '#39ff88', '#c04dff'];
  const ACTIVE_COLOR = '#fe2c55';
  const BEST_KEY = 'tower-blocks-best';

  let stack, current, camY, over;

  function topY() { return H - 40 - stack.length * BLOCK_H; }

  function newGame() {
    stack = [{ x: W / 2 - 110, w: 220 }];
    camY = 0;
    over = false;
    scoreEl.textContent = '0';
    bestEl.textContent = String(localStorage.getItem(BEST_KEY) || 0);
    messageEl.textContent = 'Click / Space to drop the block.';
    spawnBlock();
    draw();
  }

  function spawnBlock() {
    const w = stack[stack.length - 1].w;
    current = { x: 40, w, dir: 1, vx: 2.6 };
  }

  function drop() {
    if (over || !current) return;
    const top = stack[stack.length - 1];
    const left = Math.max(current.x, top.x);
    const right = Math.min(current.x + current.w, top.x + top.w);
    const overlap = right - left;
    if (overlap <= 0) {
      over = true;
      if (stack.length - 1 > Number(localStorage.getItem(BEST_KEY) || 0)) {
        localStorage.setItem(BEST_KEY, String(stack.length - 1)); bestEl.textContent = String(stack.length - 1);
      }
      messageEl.textContent = `Toppled at height ${stack.length - 1}!`;
      return;
    }
    stack.push({ x: left, w: overlap });
    scoreEl.textContent = String(stack.length - 1);
    if (stack.length > 0 && topY() < 160) camY = Math.max(0, (stack.length - 6) * BLOCK_H);
    spawnBlock();
    draw();
  }

  function draw() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#07161a'); g.addColorStop(1, '#050610'); // SITE PATCH
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const off = camY;
    stack.forEach((b, i) => {
      const y = H - 40 - (i + 1) * BLOCK_H + off;
      if (y > H || y + BLOCK_H < 0) return;
      const col = STACK_COLORS[i % STACK_COLORS.length];
      ctx.save();
      ctx.shadowBlur = 12; ctx.shadowColor = col;
      ctx.fillStyle = col;
      ctx.fillRect(b.x, y, b.w, BLOCK_H - 2);
      ctx.restore();
    });
    if (current && !over) {
      const y = topY() - BLOCK_H + off;
      ctx.save();
      ctx.shadowBlur = 14; ctx.shadowColor = ACTIVE_COLOR;
      ctx.fillStyle = ACTIVE_COLOR;
      ctx.fillRect(current.x, y, current.w, BLOCK_H - 2);
      ctx.restore();
    }
  }

  function loop() {
    if (!over && current) {
      current.x += current.vx * current.dir;
      if (current.x <= 10) { current.x = 10; current.dir = 1; }
      if (current.x + current.w >= W - 10) { current.x = W - 10 - current.w; current.dir = -1; }
      draw();
    }
    requestAnimationFrame(loop);
  }

  canvas.addEventListener('click', drop);
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); drop(); }
  });

  // SITE PATCH: upstream has no restart path once the tower topples.
  window.towerBlocksNewGame = newGame;

  newGame();
  requestAnimationFrame(loop);
})();
