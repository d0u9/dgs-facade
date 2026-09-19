import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AmbientCursor from '../components/AmbientCursor.jsx';
import { DetailIntro, PageHeader } from '../components/PageChrome.jsx';
import config from '../config.json';
import '../styles.css';

const SIZE = 18;
const STARTING_SNAKE = [
  { x: 9, y: 9 },
  { x: 8, y: 9 },
  { x: 7, y: 9 },
];
const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const KEY_MAP = {
  ArrowUp: 'up',
  w: 'up',
  W: 'up',
  ArrowDown: 'down',
  s: 'down',
  S: 'down',
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
};

function sameCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

function createFood(snake) {
  const available = [];
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (!snake.some((cell) => cell.x === x && cell.y === y)) available.push({ x, y });
    }
  }
  return available[Math.floor(Math.random() * available.length)] || null;
}

function readBest() {
  try {
    return Number(localStorage.getItem(config.game.snakeStorageKey) || 0);
  } catch {
    return 0;
  }
}

function Snake() {
  const [snake, setSnake] = useState(STARTING_SNAKE);
  const [food, setFood] = useState(() => createFood(STARTING_SNAKE));
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(readBest);
  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const direction = useRef('right');
  const queuedDirection = useRef('right');
  const touchStart = useRef(null);
  const lastSwipeAt = useRef(-Infinity);
  const stageRef = useRef(null);

  useEffect(() => {
    const stage = stageRef.current;
    let locked = false;
    const startTouch = (event) => { locked = event.touches[0].clientY - stage.getBoundingClientRect().top >= 64; };
    const preventScroll = (event) => { if (locked) event.preventDefault(); };
    const endTouch = () => { locked = false; };
    stage.addEventListener('touchstart', startTouch, { passive: true });
    stage.addEventListener('touchmove', preventScroll, { passive: false });
    stage.addEventListener('touchend', endTouch, { passive: true });
    stage.addEventListener('touchcancel', endTouch, { passive: true });
    return () => { stage.removeEventListener('touchstart', startTouch); stage.removeEventListener('touchmove', preventScroll); stage.removeEventListener('touchend', endTouch); stage.removeEventListener('touchcancel', endTouch); };
  }, []);

  const chooseDirection = useCallback((next) => {
    if (!running && !gameOver) {
      direction.current = 'right';
      queuedDirection.current = 'right';
      setRunning(true);
      return;
    }
    if (gameOver) {
      direction.current = 'right';
      queuedDirection.current = next === 'left' ? 'right' : next;
      setSnake(STARTING_SNAKE);
      setFood(createFood(STARTING_SNAKE));
      setScore(0);
      setGameOver(false);
      setRunning(true);
      return;
    }
    const current = DIRECTIONS[direction.current];
    const candidate = DIRECTIONS[next];
    if (current.x + candidate.x === 0 && current.y + candidate.y === 0) return;
    queuedDirection.current = next;
    setRunning(true);
  }, [gameOver, running]);

  const reset = useCallback(() => {
    direction.current = 'right';
    queuedDirection.current = 'right';
    setSnake(STARTING_SNAKE);
    setFood(createFood(STARTING_SNAKE));
    setScore(0);
    setGameOver(false);
    setRunning(false);
  }, []);

  const start = useCallback(() => {
    reset();
    setRunning(true);
  }, [reset]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const next = KEY_MAP[event.key];
      if (next) {
        event.preventDefault();
        chooseDirection(next);
        return;
      }
      if (!running || gameOver) start();
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [chooseDirection, gameOver, running, start]);

  useEffect(() => {
    if (!running || gameOver) return undefined;

    const timer = window.setInterval(() => {
      setSnake((current) => {
        direction.current = queuedDirection.current;
        const movement = DIRECTIONS[direction.current];
        const head = current[0];
        const nextHead = { x: head.x + movement.x, y: head.y + movement.y };
        const ate = food && sameCell(nextHead, food);
        const collisionBody = ate ? current : current.slice(0, -1);
        const hitWall = nextHead.x < 0 || nextHead.x >= SIZE || nextHead.y < 0 || nextHead.y >= SIZE;
        const hitSelf = collisionBody.some((cell) => sameCell(cell, nextHead));

        if (hitWall || hitSelf) {
          setGameOver(true);
          setRunning(false);
          return current;
        }

        const nextSnake = [nextHead, ...current];
        if (!ate) {
          nextSnake.pop();
          return nextSnake;
        }

        setScore((currentScore) => {
          const updatedScore = currentScore + 1;
          setBest((currentBest) => {
            const updatedBest = Math.max(currentBest, updatedScore);
            try {
              localStorage.setItem(config.game.snakeStorageKey, String(updatedBest));
            } catch {
              // Ignore unavailable storage.
            }
            return updatedBest;
          });
          return updatedScore;
        });
        setFood(createFood(nextSnake));
        return nextSnake;
      });
    }, 165);

    return () => window.clearInterval(timer);
  }, [food, gameOver, running]);

  const occupied = new Map(snake.map((cell, index) => [`${cell.x}-${cell.y}`, index]));
  const beginSwipe = (event) => {
    const touch = event.touches[0];
    if (touch.clientY - stageRef.current.getBoundingClientRect().top < 64) return;
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };
  const endSwipe = (event) => {
    if (!touchStart.current) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    lastSwipeAt.current = performance.now();
    chooseDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  };
  const tapToStart = () => {
    if (performance.now() - lastSwipeAt.current < 500) return;
    start();
  };

  return (
    <main className="detail-shell arcade-game-shell">
      <PageHeader section="arcade" page="snake" />
      <DetailIntro backHref="/arcade/" backLabel="Arcade" eyebrow="08 / local arcade" title="Snake" description="Collect the glowing cells. Avoid the walls and your own trail." scrollLabel="scroll down to play">
        <div className="game-summary">
          <div className="score-row"><div className="score-box"><div className="score-label">score</div><div className="score-value">{score}</div></div><div className="score-box"><div className="score-label">best</div><div className="score-value">{best}</div></div></div>
          <div className="game-actions"><button className="btn primary" type="button" onClick={reset}>new game</button><a className="btn" href="/arcade/">exit</a></div>
          <div className="game-note">ARROWS / WASD · SWIPE ON TOUCH DEVICES</div>
        </div>
      </DetailIntro>
      <section ref={stageRef} className="game-shell" onTouchStart={beginSwipe} onTouchEnd={endSwipe} onTouchCancel={() => { touchStart.current = null; }}>
        <div className="game-stage-hud" aria-label="Current game scores"><div><span>score</span><strong>{score}</strong></div><div><span>best</span><strong>{best}</strong></div></div>
        <div className="game-panel-wrap">
          <div className="game-panel snake-panel" aria-label="Snake game board">
            <div className="snake-board">
              {Array.from({ length: SIZE * SIZE }, (_, index) => {
                const x = index % SIZE;
                const y = Math.floor(index / SIZE);
                const snakeIndex = occupied.get(`${x}-${y}`);
                const isFood = food && food.x === x && food.y === y;
                const className = [
                  'snake-cell',
                  snakeIndex === 0 ? 'snake-head' : '',
                  snakeIndex > 0 ? 'snake-body' : '',
                  isFood ? 'snake-food' : '',
                ].filter(Boolean).join(' ');
                return <div className={className} key={index} />;
              })}
            </div>

            {!running && !gameOver && (
              <div className="game-overlay" onClick={tapToStart}><div className="overlay-card"><strong>Ready?</strong><span>Tap or swipe to start</span></div></div>
            )}
            {gameOver && (
              <div className="game-overlay"><div className="overlay-card"><strong>Game over.</strong><span>Score {score} · press any key</span></div></div>
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
      <Snake />
    </AmbientCursor>
  </React.StrictMode>,
);
