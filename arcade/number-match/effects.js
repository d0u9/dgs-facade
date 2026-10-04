import { COLS } from './engine.js';

const grid = () => document.getElementById('board');
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// renderSelection() may remove a class in the same frame that adds it back.
// Force a reflow between the two so the animation plays again.
function replay(cell, name) {
  if (!cell) return;
  cell.classList.remove('nm-arrive', name);
  void cell.offsetWidth;
  cell.classList.add(name);
}

export function tapCell(index) {
  replay(grid().children[index], 'nm-tap');
}

export function shakeCells(indices) {
  for (const index of indices) replay(grid().children[index], 'nm-shake');
}

export function clearEffects() {
  document.querySelectorAll('.nm-effects').forEach(node => node.remove());
  document.getElementById('score').getAnimations().forEach(animation => animation.cancel());
}

export function addEffect(from) {
  const arriving = [];
  for (let i = from; i < grid().children.length; i++) {
    const cell = grid().children[i];
    if (cell.disabled) continue;
    cell.classList.add('nm-arrive');
    cell.style.setProperty('--arrival-delay', `${Math.min(180, Math.floor((i - from) / COLS) * 30)}ms`);
    arriving.push(cell);
  }
  setTimeout(() => arriving.forEach(cell => cell.classList.remove('nm-arrive')), 500);
}

// Capture the old cell positions before render removes them. The visual
// copies can finish fading while the real board accepts the next move.
export function matchEffect(board, pair, points) {
  if (reducedMotion()) return;
  const stage = grid().parentElement;
  const origin = stage.getBoundingClientRect();
  const cells = new Map();
  const cellRect = i => {
    if (cells.has(i)) return cells.get(i);
    const rect = grid().children[i].getBoundingClientRect();
    const cell = {
      x: rect.left - origin.left + stage.scrollLeft,
      y: rect.top - origin.top + stage.scrollTop,
      w: rect.width, h: rect.height,
    };
    cells.set(i, cell);
    return cell;
  };
  const center = i => {
    const cell = cellRect(i);
    return [cell.x + cell.w / 2, cell.y + cell.h / 2];
  };
  const [a, z] = [...pair].sort((x, y) => x - y);
  const dr = Math.floor(z / COLS) - Math.floor(a / COLS);
  const dc = z % COLS - a % COLS;
  const step = dr === 0 ? 1 : dc === 0 ? COLS : Math.abs(dr) === Math.abs(dc) ? COLS + Math.sign(dc) : 0;
  let straight = step > 0;
  for (let i = a + step; straight && i < z; i += step) if (board[i]) straight = false;
  let path = `M ${center(a).join(' ')}`;
  if (straight) path += ` L ${center(z).join(' ')}`;
  else {
    // Reading-order matches wrap at row ends. Draw each row segment rather
    // than cutting diagonally through numbers that block a straight line.
    for (let i = (Math.floor(a / COLS) + 1) * COLS; i <= z; i += COLS) {
      const end = cellRect(i - 1);
      path += ` L ${end.x + end.w} ${center(i - 1)[1]}`;
      path += ` M ${cellRect(i).x} ${center(i)[1]}`;
    }
    path += ` L ${center(z).join(' ')}`;
  }

  const layer = document.createElement('div');
  layer.className = 'nm-effects';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.height = `${stage.scrollHeight}px`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const line = document.createElementNS(svg.namespaceURI, 'path');
  line.setAttribute('d', path);
  line.setAttribute('pathLength', '1');
  svg.append(line);
  layer.append(svg);
  for (const index of pair) {
    const rect = cellRect(index);
    const ghost = document.createElement('span');
    ghost.className = 'nm-match-ghost';
    ghost.textContent = board[index];
    Object.assign(ghost.style, {left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px`});
    layer.append(ghost);
  }
  const label = document.createElement('span');
  label.className = 'nm-points';
  label.textContent = `+${points}`;
  const [x, y] = center(pair[1]);
  Object.assign(label.style, {left: `${x}px`, top: `${y}px`});
  layer.append(label);
  stage.append(layer);
  setTimeout(() => layer.remove(), 520);
  document.getElementById('score').animate(
    [{transform: 'scale(1)'}, {transform: 'scale(1.2)'}, {transform: 'scale(1)'}],
    {duration: 300, easing: 'ease-out'},
  );
}
