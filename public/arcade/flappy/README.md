HTML5 Flappy Bird
=================

A dependency-free HTML5 Flappy Bird built with Canvas and vanilla JavaScript.

 * view the [source](https://github.com/gamelabz/html5-game-flappy-bird)

Vendored: `game.js` only, with local patches. Everything in the file is private
to its IIFE, so nothing can be overridden from outside. Each patch is marked
`SITE PATCH`:

 * the three color blocks in `draw()` (sky, pipes, bird), repainted in the
   site's dark neon palette;
 * the difficulty constants, which now ramp with the score instead of holding
   upstream's single hardest setting, with the gap stored per pipe and the
   vertical step between pipes capped to what the bird can climb.

An upstream refresh means re-applying those blocks.

The site chrome, the HUD markup and the touch input live outside this folder (see `/arcade/flappy/index.html`,
`/flappy-integration.css` and `/flappy-status-adapter.js`), so this file can be
replaced with a newer upstream copy without losing the integration.

The original `index.html` and `style.css` are not vendored; this site supplies
its own page with the element ids the script looks up (`game`, `score`, `best`,
`message`, `start`, `restart`).

License
=======

[MIT](LICENSE) license, Copyright (c) 2026 gamelabz.
