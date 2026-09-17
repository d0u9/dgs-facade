# Project TODO

## Hextris layout integration

Status: done.

Implementation notes (for future reference, not part of the original plan):

- `#openSideBar`/`#pauseBtn`/`#restartBtn` moved out of `#hextris-stage` into a
  new `.hextris-controls` strip; `#hextris-stage` overrides for them were
  replaced with `.hextris-controls #id` selectors — a bare `#id` override
  would lose to the vendor's own single-ID `position:fixed` rules.
- Added `.hextris-stage-hud` (score/best/state) and `public/hextris-status-
  adapter.js`, a small polling adapter (kept out of `js/`) mirroring
  `window.score`/`window.gameState` into the strip. Two surprises it had to
  account for: the idle "ready" screen runs a decorative demo pass that
  scores on the same `window.score`, and `gameState` is not a clean enum —
  both "paused" and "true game over" are `gameState === 2`/`-1` depending on
  timing, disambiguated by checking the pause icon's swapped `src` instead.
- `#openSideBar` never had its own click handler — it only ever fired via a
  hard-coded top-left canvas tap zone (`x<120 && y<83`) now that it's off the
  canvas. Removed that zone (in `input.js` and, redundantly, `initialization.
  js`'s `handleTapBefore`/`handleClickBefore`) and gave it a real
  `touchstart mousedown` binding calling `showHelp()` directly.
- Removed several vendor `fadeOut` calls that hid `#openSideBar`/`.helpText`
  after a few seconds of play or on resume-from-pause (`main.js`, `view.js`)
  — those existed only because the icon used to sit on top of the canvas;
  it's now a permanent external control and should stay visible.

Adapt the third-party Hextris game to the site's Main Layout without rewriting
the game engine.

- Add the second-screen status strip with live score, best score, and game
  state.
- Move Help, Pause, and Restart into a separate control strip while preserving
  the element IDs expected by the existing input code.
- Enlarge `#hextris-stage` to fill the space below the status and controls. Keep
  its natural game-specific proportions and continue using the existing
  `scaleCanvas()` resize and device-pixel-ratio handling.
- Keep Game Over, Pause, Help, and start overlays inside the game stage because
  their positioning is coupled to the third-party DOM and canvas.
- Add a small adapter that mirrors the engine's global score into the external
  status DOM. Synchronize score changes, initialization, restart, restored
  sessions, and game-over state.
- Review hard-coded pointer hit areas and jQuery offset calculations after
  controls are moved.
- Preserve the upstream license and keep integration changes isolated from the
  vendor engine wherever practical.

Expected difficulty: medium-high (`6/10`). Likely touch points are
`arcade/hextris/index.html`, `public/hextris-integration.css`, and small hooks in
the Hextris `main.js`, `checking.js`, `initialization.js`, `view.js`, and
`input.js` files.

Acceptance criteria:

- The introduction still snaps into one complete, non-scrolling game screen.
- Status remains visible at the top and never overlaps the canvas.
- The game uses the available viewport substantially better on desktop and
  mobile.
- Pause, restart, help, game-over, score restore, keyboard, pointer, and touch
  behavior continue to work.
