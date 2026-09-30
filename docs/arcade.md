# Arcade pages

Every arcade game page uses the same two-screen layout. The first screen is the
intro: top bar, title, description, exit button and a "scroll down to play" cue.
The second screen is the play area. The page snaps between the two screens.

## The shared shell

These games are built on the shared shell: Number Match, Color Flood, Bubble
Shooter, Watermelon, Tower Blocks and Minesweeper.

- `src/game/games.json` holds the text for every game. The arcade listing
  (`src/game/arcade.jsx`) reads it, and so do the shell pages.
- `scripts/arcade-shell.mjs` is a Vite plugin. At build time it expands the
  page markers below into static HTML from the game's `games.json` entry.
- `public/arcade-shell.css` styles the shell. Its classes all start with `ag-`.

2048, Tetris, Flappy Bird and Hextris still use their own page
markup and stylesheets. Move them to the shell one at a time, and compare
screenshots before and after each move.

## Adding a game

1. Add an entry to `src/game/games.json`. Use the next free `code`.

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
   - To put a control in the top bar, wrap it in
     `<!-- arcade:topbar-extra -->` and `<!-- /arcade:topbar-extra -->`.
     Watermelon does this for its restart button.

3. Add the page to `build.rollupOptions.input` in `vite.config.js`.
4. Give the game a glyph in `glyph()` in `src/game/arcade.jsx`.

Do not write the top bar, intro, `<title>` or description by hand. The build
fails if a page names a `data-arcade` slug that has no `page` entry.

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
