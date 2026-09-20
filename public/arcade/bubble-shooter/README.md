HTML5 Bubble Shooter
====================

A dependency-free HTML5 Bubble Shooter built with Canvas and vanilla JavaScript.

 * view the [source](https://github.com/gamelabz/html5-game-bubble-shooter)
 * play the [original](https://gamelabz.github.io/html5-game-bubble-shooter/)

Vendored: `game.js` only, with local patches. Everything in the file is private
to its IIFE, so nothing can be overridden from outside. Each patch is marked
`SITE PATCH`:

 * the bubble palette, the sky gradient, the aim line and the game-over
   overlay in `draw()`, repainted in the site's dark neon palette.

Game logic is untouched. An upstream refresh means re-applying those patches.

The original `index.html` and `style.css` are not vendored; this site supplies
its own page with the element ids the script looks up, plus the shared shell in
`/arcade-shell.css` and `/arcade-hud.js`.

License
=======

[MIT](LICENSE) license, Copyright (c) 2026 gamelabz.
