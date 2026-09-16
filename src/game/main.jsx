import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AmbientCursor from '../components/AmbientCursor.jsx';
import { DetailIntro, PageHeader } from '../components/PageChrome.jsx';
import { addRandomTile, canMove, move, newGame } from './engine.js';
import config from '../config.json';
import '../styles.css';

const KEY_MAP = {
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
  ArrowUp: 'up',
  w: 'up',
  W: 'up',
  ArrowDown: 'down',
  s: 'down',
  S: 'down',
};

function readBest() {
  try {
    return Number(localStorage.getItem(config.game.storageKey) || 0);
  } catch {
    return 0;
  }
}

function Game2048() {
  const [board, setBoard] = useState(() => newGame());
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(readBest);
  const [gameOver, setGameOver] = useState(false);
  const touchStart = useRef(null);

  const reset = useCallback(() => {
    setBoard(newGame());
    setScore(0);
    setGameOver(false);
  }, []);

  const applyMove = useCallback((direction) => {
    setBoard((current) => {
      const result = move(current, direction);
      if (!result.changed) return current;

      const next = addRandomTile(result.board);

      setScore((currentScore) => {
        const updated = currentScore + result.gained;
        setBest((currentBest) => {
          const updatedBest = Math.max(currentBest, updated);
          try {
            localStorage.setItem(config.game.storageKey, String(updatedBest));
          } catch {
            // Ignore unavailable storage.
          }
          return updatedBest;
        });
        return updated;
      });

      if (!canMove(next)) setGameOver(true);
      return next;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      const direction = KEY_MAP[event.key];
      if (!direction) return;
      event.preventDefault();
      applyMove(direction);
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [applyMove]);

  const onTouchStart = (event) => {
    const touch = event.changedTouches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = (event) => {
    if (!touchStart.current) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    touchStart.current = null;

    if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      applyMove(dx > 0 ? 'right' : 'left');
    } else {
      applyMove(dy > 0 ? 'down' : 'up');
    }
  };

  return (
    <main className="detail-shell arcade-game-shell">
      <PageHeader section="arcade" page="2048" />
      <DetailIntro backHref="/arcade/" backLabel="Arcade" eyebrow="09 / local arcade" title="2048" description="Join matching tiles. Reach 2048, or keep going until the board runs out of space.">
        <div className="game-summary">
          <div className="score-row"><div className="score-box"><div className="score-label">score</div><div className="score-value">{score}</div></div><div className="score-box"><div className="score-label">best</div><div className="score-value">{best}</div></div></div>
          <div className="game-actions"><button className="btn primary" type="button" onClick={reset}>new game</button><a className="btn" href="/arcade/">exit</a></div>
          <div className="game-note">ARROWS / WASD · SWIPE ON TOUCH DEVICES</div>
        </div>
      </DetailIntro>
      <section className="game-shell">
        <div className="game-panel-wrap">
          <div
            className="game-panel"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            aria-label="2048 game board"
          >
            <div className="board">
              {board.map((value, index) => (
                <div
                  key={index}
                  className={`tile ${value === 0 ? 'empty' : ''} ${value > 2048 ? 'super' : ''}`}
                  data-value={value || undefined}
                >
                  {value || ''}
                </div>
              ))}
            </div>

            {gameOver && (
              <div className="game-overlay">
                <div className="overlay-card">
                  <strong>No more moves.</strong>
                  <span>Score {score}</span>
                  <button className="btn primary" type="button" onClick={reset}>
                    play again
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AmbientCursor>
      <Game2048 />
    </AmbientCursor>
  </React.StrictMode>,
);
