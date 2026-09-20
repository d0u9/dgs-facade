(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const messageEl = document.getElementById('message');
  const startEl = document.getElementById('start');
  const restartEl = document.getElementById('restart');

  const W = canvas.width, H = canvas.height;
  const BEST_KEY = 'flappy-best';
  // SITE PATCH: upstream ran one fixed difficulty (GRAV 0.45, FLAP -7.6,
  // GAP 150, SPD 2.4, pipe spacing 230) and opened at its hardest. This starts
  // wide and slow, then tightens with the score up to a floor that stays a bit
  // easier than upstream. Gravity and flap are fixed, so the tap always feels
  // the same; only the course changes.
  const GRAV = 0.36, FLAP = -6.6, PIPE_W = 64;
  const GAP_MAX = 215, GAP_MIN = 145, SPD_MIN = 1.9, SPD_MAX = 3.1, SPACING_MAX = 285, SPACING_MIN = 210;
  const RAMP = 25; // pipes cleared before the course reaches its hardest setting

  // 0 at the start, 1 once RAMP pipes are cleared. Eased so the first few pipes
  // stay forgiving and the tightening is spread over the middle of the ramp.
  function level() { const t = Math.min(score / RAMP, 1); return t * t * (3 - 2 * t); }
  function gap() { return GAP_MAX - (GAP_MAX - GAP_MIN) * level(); }
  function speed() { return SPD_MIN + (SPD_MAX - SPD_MIN) * level(); }
  function spacing() { return SPACING_MAX - (SPACING_MAX - SPACING_MIN) * level(); }

  let bird, pipes, score, best, running, over, acc;

  function bestKey() { try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) { return 0; } }

  function newGame() {
    bird = { x: 110, y: H / 2, vy: 0, r: 15 };
    pipes = []; score = 0; running = false; over = false; acc = 0;
    best = bestKey(); bestEl.textContent = String(best); scoreEl.textContent = '0';
    spawnPipe(W + 120); spawnPipe(W + 120 + spacing());
    messageEl.textContent = 'Press Start.'; draw();
  }

  // A flap rises about 60px and a sustained climb gains roughly 3.3px per
  // frame, so a pipe placed too far above its neighbour is unreachable once the
  // course speeds up. Cap the step between gap centres by the climb the bird
  // can manage in the frames it has, with a margin for reaction time.
  function maxShift() { return (spacing() / speed()) * 2.1; }

  function spawnPipe(x) {
    const margin = 60;
    // Each pipe carries the gap it was built with, so widening or tightening
    // never moves a pipe the bird is already flying into.
    const g = gap();
    const lo = margin + g / 2, hi = H - margin - g / 2;
    const prev = pipes.length ? pipes[pipes.length - 1] : null;
    const anchor = prev ? prev.top + prev.gap / 2 : H / 2;
    const shift = maxShift();
    const min = Math.max(lo, anchor - shift), max = Math.min(hi, anchor + shift);
    const center = min + Math.random() * (max - min);
    pipes.push({ x, top: center - g / 2, gap: g, passed: false });
  }

  function flap() {
    if (over) { newGame(); start(); return; }
    if (!running) start();
    bird.vy = FLAP;
  }

  function start() { if (over) newGame(); if (!running) { running = true; messageEl.textContent = 'Go!'; } }

  function update() {
    bird.vy += GRAV; bird.y += bird.vy;
    if (bird.y + bird.r > H) { bird.y = H - bird.r; die(); }
    if (bird.y - bird.r < 0) { bird.y = bird.r; bird.vy = 0; }

    for (const p of pipes) {
      p.x -= speed();
      if (!p.passed && p.x + PIPE_W < bird.x) { p.passed = true; score++; scoreEl.textContent = String(score); }
    }
    if (pipes.length && pipes[0].x + PIPE_W < -10) pipes.shift();
    const lastX = pipes.length ? pipes[pipes.length - 1].x : 0;
    if (lastX < W - spacing()) spawnPipe(lastX + spacing());

    for (const p of pipes) {
      if (bird.x + bird.r > p.x && bird.x - bird.r < p.x + PIPE_W) {
        if (bird.y - bird.r < p.top || bird.y + bird.r > p.top + p.gap) die();
      }
    }
  }

  function die() {
    over = true; running = false; messageEl.textContent = 'Game over!';
    if (score > best) { best = score; bestEl.textContent = String(best); try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {} }
  }

  function draw() {
    // SITE PATCH: daylight sky swapped for the site's dark neon palette.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#050610'); g.addColorStop(0.55, '#061018'); g.addColorStop(1, '#07161a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // grid, matching the court backdrop of the other arcade games
    ctx.strokeStyle = 'rgba(37,244,238,.05)'; ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }

    // clouds, now cyan haze
    ctx.fillStyle = 'rgba(37,244,238,0.05)';
    for (let i = 0; i < 3; i++) { const cx = (i * 170 + 60) % W, cy = 90 + i * 40; ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI * 2); ctx.arc(cx + 26, cy + 6, 22, 0, Math.PI * 2); ctx.fill(); }

    for (const p of pipes) {
      // SITE PATCH: translucent cyan columns with a bright rim, not solid green.
      const col = '#25f4ee';
      ctx.save(); ctx.shadowBlur = 16; ctx.shadowColor = col;
      ctx.fillStyle = 'rgba(37,244,238,0.14)'; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(p.x, -8, PIPE_W, p.top + 8, 8); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(p.x, p.top + p.gap, PIPE_W, H - (p.top + p.gap) + 8, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(37,244,238,0.3)';
      ctx.beginPath(); ctx.roundRect(p.x - 4, p.top - 18, PIPE_W + 8, 18, 6); ctx.fill();
      ctx.beginPath(); ctx.roundRect(p.x - 4, p.top + p.gap, PIPE_W + 8, 18, 6); ctx.fill();
      ctx.restore();
    }

    // bird
    ctx.save(); ctx.shadowBlur = 14; ctx.shadowColor = '#ffe66d'; ctx.fillStyle = '#ffe66d';
    ctx.beginPath(); ctx.arc(bird.x, bird.y, bird.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#050610'; ctx.beginPath(); ctx.arc(bird.x + 6, bird.y - 4, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fe2c55'; ctx.beginPath(); ctx.moveTo(bird.x + bird.r, bird.y); ctx.lineTo(bird.x + bird.r + 8, bird.y - 4); ctx.lineTo(bird.x + bird.r + 8, bird.y + 4); ctx.fill();
  }

  let last = 0;
  function loop(ts) {
    const dt = ts - last; last = ts;
    if (running && !over) { acc += dt; while (acc >= 16) { acc -= 16; update(); } draw(); }
    else draw();
    requestAnimationFrame(loop);
  }

  canvas.addEventListener('mousedown', flap);
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); flap(); }
  });
  startEl.addEventListener('click', start);
  restartEl.addEventListener('click', () => { newGame(); start(); });
  newGame();
  requestAnimationFrame(loop);
})();
