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
        .replace('__HOME_DESCRIPTION__', config.site.homeDescription)
        .replace('__GAME_TITLE__', config.site.gameTitle)
        .replace('__GAME_DESCRIPTION__', config.site.gameDescription)
        .replace('__SNAKE_TITLE__', config.site.snakeTitle)
        .replace('__SNAKE_DESCRIPTION__', config.site.snakeDescription);
    }
  };
}

export default defineConfig({
  plugins: [configuredMetadata(), react()],
  build: {
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, 'index.html'),
        game2048: resolve(import.meta.dirname, '2048/index.html'),
        snake: resolve(import.meta.dirname, 'snake/index.html')
      }
    }
  }
});
