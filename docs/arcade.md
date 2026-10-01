# Arcade pages

Every arcade game page uses the same two-screen layout. The first screen is the
intro: top bar, title, description, exit button and a "scroll down to play" cue.
The second screen is the play area. The page snaps between the two screens.

## The shared shell

Every static arcade game page is built on the shared shell. Battleship,
Chrome Dino and Snake are React pages (`src/game/arcade.jsx` and
`src/game/snake.jsx`) and do not use it.

- `src/game/games.json` holds the text for every game. The arcade listing
  (`src/game/arcade.jsx`) reads it, and so do the shell pages.
- `scripts/arcade-shell.mjs` is a Vite plugin. At build time it expands the
  page markers below into static HTML from the game's `games.json` entry.
- `public/arcade-shell.css` styles the shell. Its classes all start with `ag-`.

A game's own stylesheet styles only its play screen. If a vendor stylesheet
loads after the shell and changes `body`, repeat the shell's `html,body` rules
in the game's sheet, as `public/hextris-integration.css` does.

## Adding a game

1. Add an entry to `src/game/games.json`. The array order is the order on the
   arcade listing, and `code` is the game's position in that list (`01`, `02`,
   ...). When you add or move a game, renumber every `code` to match.

   ```json
   {
     "slug": "my-game", "title": "My Game", "code": "14", "href": "/arcade/my-game/",
     "blurb": "One line for the arcade listing card.",
     "keys": "CLICK / TAP",
     "page": {
       "accent": "#9ce6c5",
       "description": "Meta description for search and link previews.",
       "intro": "The paragraph under the title on the intro screen.",
       "tag": "local puzzle",
       "courtRatio": 1,
       "brand": "my-game",
       "rules": ["Optional 'How to play' paragraphs."]
     }
   }
   ```

   `tag` defaults to `open source arcade` and `brand` defaults to `slug`.
   Set `courtRatio` only for a board that uses `.ag-court`. Leave out `rules`
   for no "How to play" section.

2. Create `arcade/my-game/index.html` with the markers and the play area only:

   ```html
   <!doctype html>
   <html lang="en">
   <head>
     <!-- arcade:head -->
     <link rel="stylesheet" href="./style.css">
   </head>
   <body>
   <main data-arcade="my-game">
     <!-- arcade:intro -->
     <section class="ag-game-shell">
       <div class="ag-toolbar">...HUD and buttons...</div>
       <div class="ag-stage">...the board...</div>
     </section>
   </main>
   <script type="module" src="./main.js"></script>
   </body>
   </html>
   ```

   - `<!-- arcade:head -->` becomes the charset, viewport, theme color,
     description, referrer policy, `<title>` and the shell stylesheet.
   - `<main data-arcade="slug">` becomes `<main class="ag-page">` with the
     accent color and court ratio.
   - `<!-- arcade:intro -->` becomes the top bar and the intro screen.

3. Add the page to `build.rollupOptions.input` in `vite.config.js`.
4. Give the game a glyph in `glyph()` in `src/game/arcade.jsx`.

Do not write the top bar, intro, `<title>` or description by hand. The build
fails if a page names a `data-arcade` slug that has no `page` entry.

## Toolbar buttons

Every play screen has one `.ag-toolbar`: the `.ag-hud` on the left, then one
`.ag-buttons` group on the right. Inside the group, keep this order:

1. Game options, such as difficulty or board size, as one `.ag-seg` picker.
   Mark the chosen button with `.active` or `aria-pressed="true"`.
2. Other actions, such as share, start, help or pause, as plain `.ag-btn`.
   Use `.ag-btn.ag-icon` for an icon-only button.
3. The primary button last: `.ag-btn.primary`, labeled "new game".

- Label the button that starts a fresh game "new game" in every game, not
  "restart" or "new board". Result overlays use "play again", also `.primary`.
- Put buttons only in the toolbar, never in the top bar or the intro.
- Give a game at most one `.primary` button per screen area.
- Do not restyle `.ag-btn` in a game's own stylesheet.
- A row of in-game actions under the board, like Number Match's undo, hint
  and add, is fine. Use the same `.ag-btn` classes there.

On phones the toolbar stacks: the HUD on the first row, then the buttons
centered under it, not pushed into a corner. The gaps grow with the screen
height, so do not tighten them in a game's own stylesheet.

## Rules for the play screen

- The play screen must fit one viewport height. When the board can grow,
  make the board scroll inside its own container, not the page. Number Match
  does this with `.nm-stage`.
- The shell sets `touch-action: manipulation` on the page and blocks pinch
  zoom in the viewport meta, so a quick double tap never zooms. Keep both.
- The site is dark only. Do not add a light theme to one game.
- The rules in `AGENTS.md` about filenames and paths also apply here: do not
  put local paths in page text or metadata.

## Checking a change

Run `npx vite build`, then open the game in the dev server at desktop width and
at phone width (375 × 812). Check that the intro and the play screen each snap
into place, and that the page itself does not scroll on the play screen.
