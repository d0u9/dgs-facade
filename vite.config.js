import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildTracks } from './scripts/build-tracks.mjs';

const config = JSON.parse(readFileSync(new URL('./src/config.json', import.meta.url), 'utf8'));
const siteUrl = (process.env.SITE_URL || config.site.siteUrl || '').replace(/\/$/, '');
const indexPages = new Set();

function configuredMetadata() {
  return {
    name: 'configured-metadata',
    enforce: 'pre',
    transformIndexHtml(html, context) {
      const page = (context.path || '/').replace(/index\.html$/, '');
      const redirect = /<script>location\.replace\(/.test(html);
      if (!redirect && !page.startsWith('/game/')) indexPages.add(page);
      const rendered = html
        .replace('__HOME_TITLE__', config.site.homeTitle)
        .replace('__HOME_DESCRIPTION__', config.site.homeDescription);
      const title = rendered.match(/<title>([^<]+)<\/title>/)?.[1];
      const description = rendered.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1]
        || rendered.match(/<meta\s+content="([^"]+)"\s+name="description"/i)?.[1];
      const tags = [
        '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
        '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />',
        '<meta name="color-scheme" content="dark" />'
      ];
      if (redirect) tags.push('<meta name="robots" content="noindex,follow" />');
      if (!redirect && title && description) {
        tags.push(`<meta property="og:type" content="website" />`);
        tags.push(`<meta property="og:site_name" content="${config.site.name}" />`);
        tags.push(`<meta property="og:title" content="${title}" />`);
        tags.push(`<meta property="og:description" content="${description}" />`);
        tags.push(`<meta name="twitter:card" content="summary_large_image" />`);
        if (siteUrl) {
          const url = new URL(page, `${siteUrl}/`).href;
          tags.push(`<link rel="canonical" href="${url}" />`);
          tags.push(`<meta property="og:url" content="${url}" />`);
          tags.push(`<meta property="og:image" content="${siteUrl}/social-card.png" />`);
          tags.push(`<meta name="twitter:image" content="${siteUrl}/social-card.png" />`);
        }
      }
      return rendered.replace('</head>', `  ${tags.join('\n  ')}\n</head>`);
    }
  };
}

function sitemap() {
  return {
    name: 'sitemap',
    writeBundle(options) {
      if (!siteUrl) return;
      const pages = [...indexPages].sort();
      const urls = pages.map((page) => `  <url><loc>${new URL(page, `${siteUrl}/`).href}</loc></url>`).join('\n');
      const out = options.dir || resolve(import.meta.dirname, 'dist');
      writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
      writeFileSync(join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`);
    }
  };
}

const tracksSrc = resolve(import.meta.dirname, 'data/tracks');
const tracksOut = resolve(import.meta.dirname, 'public/tracks-data');

function trackData() {
  return {
    name: 'track-data',
    buildStart() {
      buildTracks({ srcDir: tracksSrc, outDir: tracksOut });
    },
    configureServer(server) {
      server.watcher.add(tracksSrc);
      // The build writes ids.json back into the source directory; rebuilding on that write
      // would loop.
      const ledger = join(tracksSrc, 'ids.json');
      const rebuild = (file) => {
        if (file.startsWith(tracksSrc) && file !== ledger) buildTracks({ srcDir: tracksSrc, outDir: tracksOut });
      };
      server.watcher.on('add', rebuild).on('change', rebuild).on('unlink', rebuild);
    }
  };
}

export default defineConfig({
  plugins: [configuredMetadata(), trackData(), react(), sitemap()],
  build: {
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, 'index.html'),
        games: resolve(import.meta.dirname, 'game/index.html'),
        arcade: resolve(import.meta.dirname, 'arcade/index.html'),
        arcadeHextris: resolve(import.meta.dirname, 'arcade/hextris/index.html'),
        arcadeMinesweeper: resolve(import.meta.dirname, 'arcade/minesweeper/index.html'),
        arcadeDino: resolve(import.meta.dirname, 'arcade/dino/index.html'),
        arcadeBattleship: resolve(import.meta.dirname, 'arcade/battleship/index.html'),
        arcadeSnake: resolve(import.meta.dirname, 'arcade/snake/index.html'),
        arcadeTetris: resolve(import.meta.dirname, 'arcade/tetris/index.html'),
        arcadeFlappy: resolve(import.meta.dirname, 'arcade/flappy/index.html'),
        arcadeFlood: resolve(import.meta.dirname, 'arcade/flood/index.html'),
        arcadeTower: resolve(import.meta.dirname, 'arcade/tower/index.html'),
        arcadeBubbles: resolve(import.meta.dirname, 'arcade/bubbles/index.html'),
        arcadeSuika: resolve(import.meta.dirname, 'arcade/suika/index.html'),
        arcade2048: resolve(import.meta.dirname, 'arcade/2048/index.html'),
        tracks: resolve(import.meta.dirname, 'tracks/index.html'),
        utilities: resolve(import.meta.dirname, 'utilities/index.html'),
        base64: resolve(import.meta.dirname, 'utilities/base64/index.html'),
        filediff: resolve(import.meta.dirname, 'utilities/filediff/index.html'),
        jsonformat: resolve(import.meta.dirname, 'utilities/jsonformat/index.html'),
        currency: resolve(import.meta.dirname, 'utilities/currency/index.html'),
        hextris: resolve(import.meta.dirname, 'game/hextris/index.html'),
        minesweeper: resolve(import.meta.dirname, 'game/minesweeper/index.html'),
        dino: resolve(import.meta.dirname, 'game/dino/index.html'),
        battleship: resolve(import.meta.dirname, 'game/battleship/index.html')
      }
    }
  }
});
