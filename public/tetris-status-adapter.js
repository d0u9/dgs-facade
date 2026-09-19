// Bridges the vendor Javascript Tetris engine (public/arcade/tetris/tetris.js)
// to the site chrome without patching the vendor file. The engine keeps its
// state in top-level globals (playing, score, rows) and exposes play(),
// actions and DIR, so this polls those each frame for the HUD and feeds
// touch gestures straight into the engine's input queue.
(function () {
  var BEST_KEY = 'd0u9-tetris-best';
  var started = false;
  var best = 0;
  try { best = Number(localStorage.getItem(BEST_KEY) || 0); } catch (e) {}

  function set(id, value) {
    var el = document.getElementById(id);
    if (el && el.textContent !== String(value)) el.textContent = value;
  }

  function tick() {
    if (window.playing) started = true;
    var current = typeof window.score === 'number' ? window.score : 0;
    if (current > best) {
      best = current;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
    }
    set('tetrisScoreValue', started ? current : 0);
    set('tetrisRowsValue', started ? window.rows || 0 : 0);
    set('tetrisBestValue', best);
    set('tetrisStateValue', window.playing ? 'playing' : started ? 'game over' : 'ready');
    window.requestAnimationFrame(tick);
  }

  // Gestures on the whole stage (vendor only listens for keys):
  //   tap             rotate (or start a game when idle)
  //   drag left/right move one column per cell width dragged, following the finger
  //   drag down       soft drop one row per cell height dragged
  //   flick down      hard drop (queue enough DOWNs to land; vendor clears the
  //                   leftover queue when the piece locks)
  var stage = document.getElementById('tetris-stage');
  var court = document.getElementById('canvas');
  var TAP_SLOP = 10, TAP_MS = 250, FLICK_PX = 40, FLICK_SPEED = 0.6; // px, ms, px, px/ms
  var gesture = null;

  function push(dir, times) { for (var i = 0; i < times; i++) window.actions.push(dir); }

  stage.addEventListener('pointerdown', function (event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    stage.setPointerCapture(event.pointerId);
    gesture = { id: event.pointerId, x0: event.clientX, y0: event.clientY, ax: event.clientX, ay: event.clientY, t0: event.timeStamp, moved: false, axis: null };
  });

  stage.addEventListener('pointermove', function (event) {
    if (!gesture || event.pointerId !== gesture.id || !window.playing) return;
    var cell = court.clientWidth / window.nx;
    var totalX = event.clientX - gesture.x0, totalY = event.clientY - gesture.y0;
    // Lock to one axis after a small movement so a sideways drag never also drops.
    if (!gesture.axis && Math.max(Math.abs(totalX), Math.abs(totalY)) > TAP_SLOP) gesture.axis = Math.abs(totalX) > Math.abs(totalY) ? 'x' : 'y';
    if (gesture.axis === 'x') {
      var cols = Math.trunc((event.clientX - gesture.ax) / cell);
      if (cols) { push(cols > 0 ? window.DIR.RIGHT : window.DIR.LEFT, Math.abs(cols)); gesture.ax += cols * cell; gesture.moved = true; }
    } else if (gesture.axis === 'y') {
      var rowsDown = Math.trunc((event.clientY - gesture.ay) / cell);
      if (rowsDown > 0) { push(window.DIR.DOWN, rowsDown); gesture.ay += rowsDown * cell; gesture.moved = true; }
    }
  });

  function endGesture(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    var dt = event.timeStamp - gesture.t0;
    var dx = event.clientX - gesture.x0, dy = event.clientY - gesture.y0;
    if (event.type === 'pointerup') {
      if (!window.playing) {
        if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) window.play();
      } else if (!gesture.axis && dt < TAP_MS * 2) {
        window.actions.push(window.DIR.UP);
      } else if (gesture.axis === 'y' && dy > FLICK_PX && dy / dt > FLICK_SPEED) {
        push(window.DIR.DOWN, window.ny);
      }
    }
    gesture = null;
  }
  stage.addEventListener('pointerup', endGesture);
  stage.addEventListener('pointercancel', endGesture);
  // The vendor's "Press Space to Play" link would also call play(); the tap handler covers it.
  stage.addEventListener('click', function (event) { if (event.target.closest('#start')) event.preventDefault(); });

  // The vendor handler only preventDefaults keys it consumed, so Space during
  // play (and arrows while idle) would scroll the snap container away.
  document.addEventListener('keydown', function (event) {
    if ([32, 37, 38, 39, 40].indexOf(event.keyCode) !== -1) event.preventDefault();
  });

  // Neon look without editing the vendor file: its draw code looks up the
  // global drawBlock and the piece objects (i, j, l, ...) by name, so both can
  // be replaced from here.
  var NEON = { i:'#25f4ee', j:'#4d7cff', l:'#ff9f1c', o:'#ffe14d', s:'#39ff88', t:'#c04dff', z:'#fe2c55' };
  Object.keys(NEON).forEach(function (name) { if (window[name]) window[name].color = NEON[name]; });
  window.drawBlock = function (ctx, x, y, color) {
    var w = window.dx, h = window.dy, px = x * w, py = y * h, inset = Math.max(1, w * 0.08);
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = w * 0.7;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(px + inset, py + inset, w - inset * 2, h - inset * 2);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    ctx.fillRect(px + inset, py + inset, w - inset * 2, Math.max(1, h * 0.14));
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.strokeRect(px + inset, py + inset, w - inset * 2, h - inset * 2);
    ctx.restore();
  };

  // Vendor draws the preview with the court's block size (5 blocks of dx) but
  // sizes the preview canvas from its CSS box. Give it a 5-block backing store
  // instead, so CSS can show it at any size (small on phones) without clipping.
  var ucanvas = document.getElementById('upcoming');
  function resizeAll() {
    window.resize();
    ucanvas.width = ucanvas.height = Math.round(window.nu * window.dx);
    window.invalidateNext();
  }
  window.addEventListener('resize', resizeAll);
  // The court is sized by CSS relative to the stage, which can change
  // without a window resize (scroll-snap, orientation); keep backing store in sync.
  if (window.ResizeObserver) new ResizeObserver(resizeAll).observe(document.getElementById('canvas'));
  resizeAll();

  window.requestAnimationFrame(tick);
})();
