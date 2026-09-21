import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildTracks } from './scripts/build-tracks.mjs';

const config = JSON.parse(readFileSync(new URL('./src/config.json', import.meta.url), 'utf8'));

function configuredMetadata() {
  return {
    name: 'configured-metadata',
    enforce: 'pre',
    transformIndexHtml(html) {
      return html
        .replace('__HOME_TITLE__', config.site.homeTitle)
        .replace('__HOME_DESCRIPTION__', config.site.homeDescription);
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
  plugins: [configuredMetadata(), trackData(), react()],
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
