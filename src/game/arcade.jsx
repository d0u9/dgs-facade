import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AmbientCursor from '../components/AmbientCursor.jsx';
import { CollectionCard, CollectionHero, DetailIntro, PageHeader } from '../components/PageChrome.jsx';
import '../styles.css';

const GAMES = [
  { slug: '2048', title: '2048', code: '01', blurb: 'Join matching tiles and keep the board alive.', keys: 'ARROWS / WASD · SWIPE', href: '/arcade/2048/' },
  { slug: 'minesweeper', title: 'Minesweeper', code: '02', blurb: 'Clear the field with logic. Mark every hidden mine.', keys: 'CLICK / TAP · LONG PRESS TO FLAG' },
  { slug: 'snake', title: 'Snake', code: '03', blurb: 'Collect the glowing cells without crossing your own trail.', keys: 'ARROWS / WASD', href: '/arcade/snake/' },
  { slug: 'hextris', title: 'Hextris', code: '04', blurb: 'Rotate the hexagon. Match three colors before the stack reaches the edge.', keys: '← → / A D · SPACE' },
  { slug: 'dino', title: 'Chrome Dino', code: '05', blurb: "Open Chrome's built-in offline runner.", keys: 'COPY URL · OPEN FROM ADDRESS BAR', href: '/arcade/dino/' },
  { slug: 'battleship', title: 'Battleship', code: '06', blurb: 'Find the hidden fleet before the opponent sinks yours.', keys: 'CLICK / TAP TO FIRE' },
  { slug: 'tetris', title: 'Tetris', code: '07', blurb: 'Stack falling pieces. Clear full rows before the well fills up.', keys: '← → ↓ · ↑ ROTATE · SPACE' },
  { slug: 'flappy', title: 'Flappy Bird', code: '08', blurb: 'Flap through the gaps. One touch is all the control you get.', keys: 'SPACE / CLICK / TAP' },
];

function GamesHub() {
  const visibleGames = isGoogleChrome() ? GAMES : GAMES.filter((game) => game.slug !== 'dino');
  const openGame = async (event, game) => {
    if (game.slug !== 'dino') return;
    event.preventDefault();
    let copied = false;
    try { await navigator.clipboard.writeText('chrome://dino/'); copied = true; } catch {}
    window.location.assign(`/arcade/dino/${copied ? '?copied=1' : ''}`);
  };
  return <main className="section-shell">
    <PageHeader section="arcade" />
    <CollectionHero eyebrow="browser arcade" title="Pick a game." mutedTitle="Lose track of time." description={`${visibleGames.length} small classics. No accounts, no tracking, no network calls — just your browser and a few spare minutes.`} />
    <section className="collection-grid">{visibleGames.map((game) => <CollectionCard className={`arcade-${game.slug}`} eyebrow={`${game.code} / game`} glyph={glyph(game.slug)} title={game.title} description={game.blurb} meta={game.keys} href={game.href || `/arcade/${game.slug}/`} onClick={(event) => openGame(event, game)} key={game.slug} />)}</section>
    <footer className="footer"><span>all games run on this device</span><a href="/">back home</a></footer>
  </main>;
}

function isGoogleChrome() {
  const brands = navigator.userAgentData?.brands;
  if (brands?.length) return brands.some(({ brand }) => brand === 'Google Chrome');
  const ua = navigator.userAgent;
  return /Chrome\//.test(ua) && !/(?:Edg|OPR|Opera|SamsungBrowser|YaBrowser|Vivaldi)\//.test(ua);
}

function DinoGuide() {
  const [copied, setCopied] = useState(new URLSearchParams(location.search).has('copied'));
  const copy = async () => {
    try { await navigator.clipboard.writeText('chrome://dino/'); setCopied(true); }
    catch { setCopied(false); }
  };
  if (!isGoogleChrome()) {
    window.location.replace('/arcade/');
    return null;
  }
  return <main className="detail-shell">
    <PageHeader section="arcade" page="dino" status="Chrome built-in" />
    <DetailIntro backHref="/arcade/" backLabel="Arcade" eyebrow="05 / Chrome internal" title="Chrome Dino" description={<>Chrome blocks normal webpages from opening internal <span className="mono">chrome://</span> addresses. Copy the address below, then paste it into Chrome.</>} />
    <section className="workspace-stage"><div className="workspace-stage-status mono" aria-label="Current tool status"><span>Chrome internal</span><span>{copied ? 'address copied' : 'ready'}</span></div><div className="dino-launch-card"><label className="mono" htmlFor="dino-url">Chrome address</label><div className="dino-url-row"><input id="dino-url" value="chrome://dino/" readOnly onFocus={(event) => event.target.select()}/><button className="btn primary" onClick={copy}>{copied ? 'copied' : 'copy address'}</button></div><p className="mono">{copied ? 'Copied — paste it into the address bar and press Enter.' : 'Copy the address, then paste it into the address bar.'}</p></div></section>
  </main>;
}

function glyph(slug) {
  return { hextris: '⬡', minesweeper: '✣', dino: '◢', battleship: '⌁', snake: '∿', '2048': '＋', tetris: '▦', flappy: '⌒' }[slug];
}

function useBest(slug) {
  const key = `d0u9-${slug}-best`;
  const [best, setBest] = useState(() => { try { return Number(localStorage.getItem(key) || 0); } catch { return 0; } });
  const commit = useCallback((score) => setBest((old) => {
    const next = Math.max(old, score);
    try { localStorage.setItem(key, String(next)); } catch {}
    return next;
  }), [key]);
  return [best, commit];
}

function useGameScreenTouchLock() {
  const stageRef = React.useRef(null);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    let locked = false;
    const start = (event) => { locked = event.touches[0].clientY - stage.getBoundingClientRect().top >= 64; };
    const move = (event) => { if (locked) event.preventDefault(); };
    const end = () => { locked = false; };
    stage.addEventListener('touchstart', start, { passive: true });
    stage.addEventListener('touchmove', move, { passive: false });
    stage.addEventListener('touchend', end, { passive: true });
    stage.addEventListener('touchcancel', end, { passive: true });
    return () => { stage.removeEventListener('touchstart', start); stage.removeEventListener('touchmove', move); stage.removeEventListener('touchend', end); stage.removeEventListener('touchcancel', end); };
  }, []);
  return stageRef;
}

function GameFrame({ meta, score, best, reset, children, note }) {
  const stageRef = useGameScreenTouchLock();
  return <main className="detail-shell arcade-game-shell"><PageHeader section="arcade" page={meta.title.toLowerCase()} />
    <DetailIntro backHref="/arcade/" backLabel="Arcade" eyebrow={`${meta.code} / local arcade`} title={meta.title} description={meta.blurb} scrollLabel="scroll down to play">
      <div className="game-summary"><div className="score-row"><div className="score-box"><div className="score-label">score</div><div className="score-value">{score}</div></div><div className="score-box"><div className="score-label">best</div><div className="score-value">{best}</div></div></div>
      <div className="game-actions"><button className="btn primary" onClick={reset}>new game</button><a className="btn" href="/arcade/">exit</a></div><div className="game-note">{note || meta.keys}</div></div>
    </DetailIntro>
    <section ref={stageRef} className={`game-shell game-shell-${meta.slug}`}><div className="game-stage-hud" aria-label="Current game scores"><div><span>score</span><strong>{score}</strong></div><div><span>best</span><strong>{best}</strong></div></div><div className="game-panel-wrap">{children}</div></section>
  </main>;
}

const FLEET = [5, 4, 3, 3, 2];
function makeFleet() {
  const cells = Array.from({ length: 100 }, () => ({ ship: -1, shot: false }));
  FLEET.forEach((len, ship) => {
    let placed = false;
    while (!placed) {
      const vertical = Math.random() < .5;
      const x = Math.floor(Math.random() * (vertical ? 10 : 11 - len));
      const y = Math.floor(Math.random() * (vertical ? 11 - len : 10));
      const spots = Array.from({ length: len }, (_, i) => (y + (vertical ? i : 0)) * 10 + x + (vertical ? 0 : i));
      if (spots.every((i) => cells[i].ship < 0)) { spots.forEach((i) => { cells[i].ship = ship; }); placed = true; }
    }
  });
  return cells;
}

function Battleship() {
  const meta = GAMES.find((game) => game.slug === 'battleship');
  const [enemy, setEnemy] = useState([]), [player, setPlayer] = useState([]);
  const [turn, setTurn] = useState('player'), [status, setStatus] = useState('ready');
  const [message, setMessage] = useState('Select a coordinate to fire.'), [score, setScore] = useState(0);
  const [best, commitBest] = useBest('battleship');
  const reset = useCallback(() => { setEnemy(makeFleet()); setPlayer(makeFleet()); setTurn('player'); setStatus('playing'); setMessage('Select a coordinate to fire.'); setScore(0); }, []);
  useEffect(reset, [reset]);
  const sunk = (board, ship) => board.filter((cell) => cell.ship === ship).every((cell) => cell.shot);
  const allSunk = (board) => FLEET.every((_, ship) => sunk(board, ship));
  const fire = (index) => {
    if (status !== 'playing' || turn !== 'player' || enemy[index]?.shot) return;
    const nextEnemy = enemy.map((cell) => ({ ...cell })); nextEnemy[index].shot = true;
    const hit = nextEnemy[index].ship >= 0, nextScore = score + (hit ? 100 : 0);
    setScore(nextScore); commitBest(nextScore); setEnemy(nextEnemy);
    if (allSunk(nextEnemy)) { setStatus('won'); setMessage('Enemy fleet destroyed.'); return; }
    setMessage(hit ? (sunk(nextEnemy, nextEnemy[index].ship) ? 'Enemy vessel sunk.' : 'Direct hit.') : 'Miss. Opponent firing…'); setTurn('cpu');
    window.setTimeout(() => setPlayer((current) => {
      const nextPlayer = current.map((cell) => ({ ...cell }));
      const available = nextPlayer.map((cell, cellIndex) => cell.shot ? -1 : cellIndex).filter((cellIndex) => cellIndex >= 0);
      const target = available[Math.floor(Math.random() * available.length)]; nextPlayer[target].shot = true;
      const cpuHit = nextPlayer[target].ship >= 0;
      if (allSunk(nextPlayer)) { setStatus('lost'); setMessage('Your fleet was destroyed.'); }
      else { setMessage(cpuHit ? (sunk(nextPlayer, nextPlayer[target].ship) ? 'Your vessel was sunk. Your turn.' : 'They hit us. Your turn.') : 'Opponent missed. Your turn.'); setTurn('player'); }
      return nextPlayer;
    }), 450);
  };
  return <GameFrame meta={meta} score={score} best={best} reset={reset} note="CLICK / TAP ENEMY WATERS TO FIRE"><div className="game-panel battle-panel"><div className="battle-status mono"><span className={`turn-light ${turn}`}/>{message}</div><div className="battle-fields"><div className="battle-field"><BattleGrid board={enemy} enemy onFire={fire}/><span className="battle-field-label mono">enemy waters</span></div><div className="battle-field"><BattleGrid board={player}/><span className="battle-field-label mono">your fleet</span></div></div>{status !== 'playing' && <div className="game-overlay"><div className="overlay-card"><strong>{status === 'won' ? 'Fleet destroyed.' : 'All ships lost.'}</strong><span>Score {score}</span><button className="btn primary" onClick={reset}>play again</button></div></div>}</div></GameFrame>;
}

function BattleGrid({ board, enemy = false, onFire }) {
  return <div className="battle-grid">{board.map((cell, index) => {
    const visibleShip = !enemy && cell.ship >= 0, hit = cell.shot && cell.ship >= 0, miss = cell.shot && cell.ship < 0;
    return <button key={index} aria-label={`${String.fromCharCode(65 + index % 10)}${Math.floor(index / 10) + 1}`} className={`${visibleShip ? 'ship' : ''} ${hit ? 'hit' : ''} ${miss ? 'miss' : ''}`} onClick={() => enemy && onFire(index)} disabled={enemy && cell.shot}>{hit ? '×' : miss ? '·' : ''}</button>;
  })}</div>;
}

function App() {
  const slug = location.pathname.split('/').filter(Boolean)[1];
  if (!slug) return <GamesHub />;
  if (slug === 'dino') return <DinoGuide />;
  if (slug === 'battleship') return <Battleship />;
  return <GamesHub />;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><AmbientCursor><div className="site-shell"><div className="grid-noise"/><App/></div></AmbientCursor></React.StrictMode>);
