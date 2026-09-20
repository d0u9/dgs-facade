Suika (Watermelon) Game
=======================

A watermelon-merge game built with Canvas and matter.js.

 * view the [source](https://github.com/TomboFry/suika-game)
 * play the [original](https://tombofry.github.io/suika-game/)

Vendored: `game.js` (upstream `index.js`), `matter.js` and the fruit, pop and
sound assets. Upstream's menu artwork (`bg-menu.png`, `btn-start.png`) is not
vendored, because the menu screen is patched out. Each patch in `game.js` is
marked `SITE PATCH`:

 * asset paths, rebased on `/arcade/suika/`;
 * `Game.elements`, pointed at this site's HUD ids instead of the vendor's own
   score overlay, "Game Over!" card and status bar, which are all removed;
 * the menu screen, removed, so a game starts as soon as the page loads;
 * `initGame` split into a bind-once half and a new `newGame`, because upstream
   wired every listener inside `startGame` and its "Try Again" link was a page
   reload;
 * `newGame` exposed as `window.suikaNewGame` for the page's restart button;
 * `suika:lose` and `suika:newgame` events, which the page's own game-over
   panel is drawn from, since the vendor's card was removed;
 * the high score, stored as a plain number under `d0u9-suika-best` rather than
   a JSON blob under `suika-game-cache`, and wrapped so a blocked localStorage
   cannot throw;
 * the lose rule. Upstream ended the game on the first contact between two
   fruits above `loseHeight`. Fruit spawns at y=32, so a size 0, 1 or 2 fruit
   is entirely above the line for the first stretch of its fall, and a merge
   flings its neighbours up through it, so an ordinary drop could end the game
   at any moment. `Game.checkLose` runs per step instead and ends it only once
   a fruit has been above the line without a break for `loseGraceMs` (1000ms);
 * `Game.playSound`, which swallows the promise `play()` rejects before the
   first gesture. The sounds stay on HTMLAudioElements: a Web Audio rewrite was
   tried and reverted, because Web Audio follows the iOS ringer switch and
   HTMLAudioElement does not, so it silenced the game on a phone set to silent;
 * `Game.height`, 1024 rather than 960, which leaves the jar a little over 6%
   deeper below its mouth and the ratio close to upstream's. The canvas stays a
   fixed 640x1024 on every device, so the game plays identically everywhere;
   `/arcade-shell.css` scales that one board to fit, taking the height as the
   limit on a wide screen and the width on a narrow one. `loseHeight` and
   `previewBallHeight` are measured from the top of the canvas and so still sit
   at the mouth, and the walls and floor follow `Game.height`;
 * a semicolon after the `Game` declaration, which upstream left off. Without
   it the statement that follows is parsed as a call on the object literal;
 * the board background and the walls, repainted in the site's dark palette;
 * the mouse constraint's `collisionFilter`, zeroed, because upstream let you
   drag fruit around the board;
 * Matter's wheel handlers, unbound from the canvas, since they preventDefault
   and would pin the page's scroll-snap to the board;
 * `resizeCanvas`, removed, because `/arcade-shell.css` sizes the canvas and
   Matter maps pointer coordinates through the CSS scale on its own.

Two of those patches are performance fixes, both measured on a 23-fruit board:

 * the fruit textures are stored at the diameter they are drawn at (48-384px)
   rather than 1024x1024. The canvas backs onto 640x960, so nothing larger can
   be resolved anyway. Drawing a frame went from 3.18ms to 0.30ms, and the set
   holds 1.7MB of decoded pixels instead of 48MB, which is what matters on a
   phone. `xScale`/`yScale` are 1 as a result, and `pop.png` is 512px with its
   divisor halved to match;
 * `Runner.run` is replaced by `Game.runPhysics`. Matter's runner clamps its
   timestep to a 16.666ms floor and then steps once per animation frame, so a
   120Hz display ran 16.666ms of physics 120 times a second: the board fell at
   twice speed and did twice the work, and 144Hz made it 2.4x. The replacement
   steps by the real frame delta, clamped to [1000/240, 1000/30] so a long
   pause cannot tunnel a fruit through a wall, which holds one second of
   physics to one second on any display.

The lose rule is the one piece of game logic that changed; the merge, scoring
and spawn rules are untouched. An upstream refresh means re-applying every
patch above.

The original `index.html` is not vendored; this site supplies its own page with
the element ids the script looks up, plus the shared shell in
`/arcade-shell.css` and `/arcade-hud.js`.

License
=======

[Unlicense](LICENSE) — public domain. matter.js 0.19.0 is MIT, with its notice
at the top of `matter.js`.
