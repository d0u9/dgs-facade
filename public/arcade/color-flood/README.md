HTML5 Color Flood
=================

A dependency-free HTML5 Color Flood built with Canvas and vanilla JavaScript.

 * view the [source](https://github.com/gamelabz/html5-game-color-flood)
 * play the [original](https://gamelabz.github.io/html5-game-color-flood/)

Vendored: `game.js` only, with local patches. Everything in the file is private
to its IIFE, so nothing can be overridden from outside. Each patch is marked
`SITE PATCH`:

 * the swatch palette uses six Okabe-Ito colors, and the board backdrop in
   `draw()` matches the site's dark theme;
 * `newGame` exposed as `window.colorFloodNewGame`, because upstream only ever
   calls it on load and has no restart control.

Game logic is untouched. An upstream refresh means re-applying those patches.

The original `index.html` and `style.css` are not vendored; this site supplies
its own page with the element ids the script looks up, plus the shared shell in
`/arcade-shell.css` and `/arcade-hud.js`.

License
=======

[MIT](LICENSE) license, Copyright (c) 2026 gamelabz.
