// Builds the shared arcade chrome at build time. A game page on the shell
// only carries its play area; the head, top bar and intro screen come from
// its entry in src/game/games.json. A page opts in with markers:
//
//   <head><!-- arcade:head --> ...page-only styles...</head>
//   <main data-arcade="flood">
//     <!-- arcade:intro -->
//     <section class="ag-game-shell">...the board...</section>
//   </main>
//
// The output is plain static HTML, so the pages still load with no script.
import { readFileSync } from 'node:fs';

const gamesUrl = new URL('../src/game/games.json', import.meta.url);

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function head(game) {
  const { page } = game;
  return [
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=0">',
    '<meta name="theme-color" content="#050610">',
    `<meta name="description" content="${escapeHtml(page.description)}">`,
    '<meta name="referrer" content="no-referrer">',
    `<title>${escapeHtml(game.title)} / Arcade / d0u9</title>`,
    '<link rel="stylesheet" href="/arcade-shell.css">'
  ].join('\n  ');
}

function topbar(game) {
  const brand = `<a class="ag-brand" href="/arcade/"><i class="ag-mark"></i><span>d0u9 / arcade / ${escapeHtml(game.page.brand || game.slug)}</span></a>`;
  return `<header class="ag-topbar">${brand}<div class="ag-status"><i></i><span>local only</span></div></header>`;
}

function intro(game) {
  const { page } = game;
  const rules = page.rules?.length
    ? `<details class="ag-rules"><summary>How to play</summary>${page.rules.map((rule) => `<p>${escapeHtml(rule)}</p>`).join('')}</details>`
    : '';
  return `<section class="ag-intro"><a class="ag-back" href="/arcade/"><span>←</span><span>Arcade</span></a>`
    + `<div class="ag-copy"><div class="ag-eyebrow">${escapeHtml(game.code)} / ${escapeHtml(page.tag || 'open source arcade')}</div>`
    + `<h1>${escapeHtml(game.title)}</h1><p>${escapeHtml(page.intro)}</p>${rules}</div>`
    + `<div class="ag-actions"><a class="ag-exit" href="/arcade/">exit</a><span class="ag-keys">${escapeHtml(game.keys)}</span></div>`
    + '<div class="ag-scroll-cue" aria-hidden="true"><span>scroll down to play</span><span>↓</span></div></section>';
}

export function renderArcadePage(html, games) {
  const slug = html.match(/<main data-arcade="([^"]+)">/)?.[1];
  if (!slug) return html;
  const game = games.find((entry) => entry.slug === slug);
  if (!game?.page) throw new Error(`arcade-shell: no page entry for "${slug}" in games.json`);

  const style = [`--game-accent:${game.page.accent}`];
  if (game.page.courtRatio) style.push(`--court-ratio:${game.page.courtRatio}`);

  return html
    .replace('<!-- arcade:head -->', head(game))
    .replace(/<main data-arcade="[^"]+">/, `<main class="ag-page" style="${style.join('; ')}">`)
    .replace('<!-- arcade:intro -->', `${topbar(game)}\n  ${intro(game)}`);
}

export function arcadeShell() {
  return {
    name: 'arcade-shell',
    enforce: 'pre',
    transformIndexHtml(html) {
      // Read per page, so editing games.json shows up on the next dev reload.
      return renderArcadePage(html, JSON.parse(readFileSync(gamesUrl, 'utf8')));
    }
  };
}
