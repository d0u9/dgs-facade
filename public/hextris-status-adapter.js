// Mirrors the vendor Hextris engine's global state into the site's external
// status strip (#hextrisScoreValue / #hextrisBestValue / #hextrisStateValue).
// Deliberately kept out of the vendor js/ directory: the engine exposes score
// and game phase only as globals (window.score, window.gameState) rendered
// straight onto the canvas, so this polls them on each frame rather than
// patching the vendor files themselves.
//
// window.gameState is NOT a clean state enum: both "paused" and "true game
// over" are represented as gameState === 2 (see view.js pause() and the
// checkGameOver branch in main.js's animLoop) — the engine tells them apart
// only through which DOM/canvas UI it fades in. The one reliable signal is
// the pause icon itself: pause() swaps #pauseBtn's image to btn_resume.svg
// while paused and leaves it there only in that case, so that swap is used
// below instead of trusting gameState alone.
(function () {
  function isPaused() {
    var icon = document.getElementById('pauseBtn');
    var src = icon ? (icon.getAttribute('src') || '') : '';
    return /resume/i.test(src);
  }

  function stateLabel(state) {
    if (isPaused()) return 'paused';
    if (state === 1) return 'playing';
    if (state === 2 || state === -1) return 'game over';
    return 'ready';
  }

  function bestScoreText() {
    var el = document.getElementById('currentHighScore');
    return el ? el.textContent : '0';
  }

  function tick() {
    var scoreEl = document.getElementById('hextrisScoreValue');
    var bestEl = document.getElementById('hextrisBestValue');
    var stateEl = document.getElementById('hextrisStateValue');
    var state = window.gameState;
    // Before the first play, gameState is 0 and the idle hexagon on the
    // "ready" screen runs a decorative demo pass that scores on the same
    // window.score the real game uses. Only surface it once a real run has
    // actually started (playing/paused/game-over), so the strip reads 0
    // instead of a confusing leftover demo number.
    var hasRun = state === 1 || state === 2 || state === -1;

    if (scoreEl) scoreEl.textContent = hasRun && typeof window.score === 'number' ? window.score : 0;
    if (bestEl) bestEl.textContent = bestScoreText();
    if (stateEl) stateEl.textContent = stateLabel(state);

    window.requestAnimationFrame(tick);
  }

  window.requestAnimationFrame(tick);
})();
