import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

export default defineConfig({
  plugins: [configuredMetadata(), react()],
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
        arcade2048: resolve(import.meta.dirname, 'arcade/2048/index.html'),
        utilities: resolve(import.meta.dirname, 'utilities/index.html'),
        base64: resolve(import.meta.dirname, 'utilities/base64/index.html'),
        hextris: resolve(import.meta.dirname, 'game/hextris/index.html'),
        minesweeper: resolve(import.meta.dirname, 'game/minesweeper/index.html'),
        dino: resolve(import.meta.dirname, 'game/dino/index.html'),
        battleship: resolve(import.meta.dirname, 'game/battleship/index.html')
      }
    }
  }
});
