---
name: utility-tool-layout
description: Use when adding or restyling a tool under /utilities/ in dgs-facade (e.g. Base64, File Diff, JSON Formatter). Defines the single-screen tool-shell layout, compact merged toolbar, line-numbered text fields, and wrap toggle convention so new tools match the existing ones pixel-for-pixel.
---

# Utility tool layout

Convention for every page under `/utilities/<tool>/`. Distinct from the
site's general page chrome (topbar/hero layout used by home, arcade hubs,
etc.) — utility tool pages are single-screen, no scroll-snap hero.

## Wiring a new tool

1. `utilities/<tool>/index.html` — copy `utilities/base64/index.html`,
   change `<title>` and `<meta description>`. Body always points to
   `/src/utilities.jsx` (all utility tools share one entry, routed by
   `location.pathname` in `App()`).
2. `vite.config.js` — add `<tool>: resolve(import.meta.dirname, 'utilities/<tool>/index.html')`
   to `build.rollupOptions.input`.
3. `src/utilities.jsx` — add the tool to `TOOLS` (hub card list), write
   the component, add a branch in `App()`: `if (path.includes('/<tool>')) return <XTool/>;`.

## Structural skeleton

```jsx
<main className="tool-shell">
  <ToolHeader backHref="/utilities/" backLabel="Utilities" eyebrow="0N / short label" title="Tool Name" />
  <section className="tool-panel"><div className="codec-card">
    <div className="codec-toolbar">
      <div className="codec-toolbar-left">
        <div className="mode-switch" role="group" aria-label="...">...mode buttons...</div>
        <span className="mono codec-stat">{statusText}</span>
      </div>
      <div className="codec-toolbar-right">
        <WrapToggle wrap={wrap} setWrap={setWrap} />
        ...action buttons (swap/minify/clear/copy)...
      </div>
    </div>
    <div className="codec-grid">
      <label><span className="mono">input label</span><LineNumberedField .../></label>
      <label><span className="mono">output label</span><LineNumberedField readOnly .../></label>
    </div>
  </div></section>
</main>
```

Rules this encodes:

- **One screen, no footer bar.** `tool-shell` is `height: 100svh` with
  `grid-template-rows: auto minmax(0,1fr)` — header row + everything else.
  All controls (mode buttons, status text, action buttons) live in the
  **single** `codec-toolbar` row, split into `codec-toolbar-left`
  (mode-switch + live status/stat text) and `codec-toolbar-right`
  (wrap toggle + action buttons). Never add a second toolbar or a footer
  bar below the grid — vertical space on this layout is scarce.
- **`ToolHeader`** (`src/components/PageChrome.jsx`) gives the compact
  top bar: home icon, back-to-Utilities link, eyebrow+title, status dot.
  Don't build a custom header.
- **Buttons inside `.codec-toolbar` are compact** — the `.codec-toolbar .btn`
  / `.codec-toolbar .mode-switch button` CSS overrides already shrink
  padding/font vs. the site's default `.btn`. Don't inline bigger buttons.
- **Text fields use `LineNumberedField`** (`PageChrome.jsx`), not raw
  `<textarea>`. Every text-input or text-output area in a utility tool
  gets a line-number gutter.
- **Wrap toggle defaults to `true`** (`useState(true)`), rendered via the
  shared `WrapToggle` component in `codec-toolbar-right`. It flips the
  textarea between `white-space: pre` (nowrap, horizontal scroll) and
  `pre-wrap`.
- **Gutter alignment under wrap is measured, not assumed.** With wrap on, a
  long line occupies several visual rows in the textarea but only one row
  in the gutter, so the two columns drift apart as you scroll — this shows
  up only with *pasted* long content, never with short typed lines, which
  makes it easy to miss. `LineNumberedField` fixes this with a hidden
  `.line-mirror` div that copies the textarea's width/font/padding/
  word-break and reports each logical line's real wrapped height
  (`getBoundingClientRect().height` — `offsetHeight` rounds to whole px and
  accumulates ~20px of drift over 60 lines). Those heights are applied to
  the gutter entries. A `ResizeObserver` re-measures on width changes.
  Don't "simplify" this away.
- **Gutter and textarea scroll-sync is bidirectional and uses native
  scroll events**, with a `syncingRef` flag to break the feedback loop.
  Don't try to do it by intercepting `onWheel` + `preventDefault()` —
  React attaches wheel listeners as passive, so `preventDefault()` is
  silently ignored and scrolling over the gutter strip does nothing.
- **Text color** for anything inside a `codec-grid`/`diff-cell` uses
  `var(--code-text)` (soft sage `#b7c9bf`), not `var(--text)` (near-white,
  too harsh for dense code/text panels). Errors use `var(--danger)`.
- **Font is user-adjustable, not hardcoded.** Any code/text panel
  (`codec-grid textarea`, `.line-gutter`, `.diff-split`, `.json-tree`) uses
  `font-family: var(--code-font-family); font-size: var(--code-font-size);`,
  never a literal `font: 14px "DM Mono", monospace` shorthand. Defaults are
  `"Maple Mono NF", ui-monospace, ...` / `14px`, set in `:root`.
  `<ToolHeader>` already renders `<FontControls>` (`PageChrome.jsx`) — a
  font-family + font-size `<select>` pair that writes the two CSS custom
  properties on `document.documentElement` and persists to `localStorage`
  (`d0u9-code-font`, `d0u9-code-font-size`). Don't add a second font
  picker per tool; it's global across all utility pages already.
  **`FONT_OPTIONS` only lists fonts that can actually render differently**
  (no bundled `@font-face` exists in this project — every entry either
  relies on a local OS install, like `Maple Mono NF`, or is a generic
  `ui-monospace`/`Menlo` stack). Adding a named font with no matching
  local install or `@font-face` just silently falls back and reads as
  "switching does nothing" — don't add one without also bundling it or
  confirming it's realistically pre-installed.
- **Scrollbars are themed globally** (`*::-webkit-scrollbar` / Firefox
  `scrollbar-color` in `styles.css`, near the top) — thin, transparent
  track, faint accent-green thumb. Never leave a default OS scrollbar
  showing inside a tool panel, and never re-hide it with
  `scrollbar-width: none` unless the container is a decorative
  scroll-snap wrapper (like `.detail-shell`) where the page itself
  provides the only visible scroll affordance.
- **Any independently-scrolling panel** (`.json-tree`, `.diff-split`, a
  future tool's custom output view) needs an explicit
  `height: 100%; min-height: 0;` rule under `.tool-panel .codec-grid`
  (see existing rules) — without it the panel's height comes from its
  content instead of the grid row, and the scrollbar becomes unusable
  (wrong element scrolls, or double/nested scrollbars appear). Add the
  matching mobile override too (`max-height: 50vh; min-height: 220px;`
  pattern already used for `.json-tree`).
- **`.codec-grid` MUST declare `grid-template-rows: minmax(0, 1fr)`,
  and `.codec-grid label` MUST use `grid-template-rows: auto minmax(0, 1fr)`
  plus `min-height: 0`.** This bit once — CSS Grid's implicit row sizes to
  its tallest child's *content* height by default, ignoring the grid
  container's own bounded height. Without the `minmax(0, 1fr)` on both
  levels, pasting a large amount of text makes the `<label>` and its
  `LineNumberedField`/`.json-tree` grow to full content height (thousands
  of px) instead of staying capped at the visible panel — so nothing
  scrolls internally, the gutter (which grows to match) drifts totally
  out of sync with the text, and single-line outputs can render with
  their line number scrolled out of view. If a new tool adds another
  grid wrapper around a scrollable panel, it needs this same
  `minmax(0, 1fr)` treatment at every grid level down to the scrollable
  element, not just `min-height: 0` on the leaf.
- **All processing is client-side.** Never add a network call; the whole
  point of `/utilities/` is "nothing leaves the browser."

## Reusable pieces (don't reinvent)

- `ToolHeader`, `LineNumberedField`, `BackLink` — `src/components/PageChrome.jsx`
- `WrapToggle` — local to `src/utilities.jsx`, reuse it for any new tool
- Diff-style split view (line-numbered, side-by-side, add/remove highlight) —
  see `buildSplitRows` + `.diff-split` CSS in `src/utilities.jsx` /
  `src/styles.css` if a future tool needs a two-column comparison view.
- Collapsible/syntax-highlighted tree view — see `JsonNode` in
  `src/utilities.jsx` / `.json-tree` CSS if a future tool needs a
  structured (not raw-text) output view.

## After changing anything here

Run `npx vite build` (then `rm -rf dist`) to confirm all
`utilities/*/index.html` entries still build — this project has no test
suite, the build is the correctness check.
