export const COUNT = 60;

export function gridFor(aspect, count = COUNT) {
  if (![60, 150, 300].includes(count)) throw new RangeError('Unsupported piece count');
  let best, error = Infinity;
  for (let cols = 2; cols <= count / 2; cols++) if (count % cols === 0) {
    const rows = count / cols;
    const next = Math.abs(Math.log((cols / rows) / aspect));
    if (next < error) { best = {cols, rows}; error = next; }
  }
  return best;
}

export function createPuzzle(aspect, shape, rand = Math.random, count = COUNT) {
  const {cols, rows} = gridFor(aspect, count);
  const width = 900, height = width / aspect;
  const cw = width / cols, ch = height / rows;
  const pieces = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const id = r * cols + c;
    const edges = shape === 'square' ? [0, 0, 0, 0] : [
      r ? -pieces[id - cols].edges[2] : 0,
      c === cols - 1 ? 0 : (rand() < .5 ? -1 : 1),
      r === rows - 1 ? 0 : (rand() < .5 ? -1 : 1),
      c ? -pieces[id - 1].edges[1] : 0,
    ];
    pieces.push({id, r, c, tx: c*cw, ty: r*ch, x:0, y:0, group:id, locked:false, edges});
  }
  const puzzle = {cols, rows, width, height, cw, ch, shape, pieces};
  arrange(puzzle, rand);
  return puzzle;
}

export function arrange(puzzle, rand = Math.random) {
  const {pieces, cw, ch, width, height} = puzzle;
  const groups = [...new Set(pieces.filter(p => !p.locked).map(p => p.group))];
  for (let i=groups.length-1;i>0;i--) {const j=Math.floor(rand()*(i+1));[groups[i],groups[j]]=[groups[j],groups[i]];}
  const trayCols = Math.max(3, Math.ceil(groups.length / (2 * (puzzle.rows + 2))));
  const trayRows = Math.ceil(groups.length / (2 * trayCols));
  groups.forEach((group, i) => {
    const members = pieces.filter(p => p.group === group);
    const anchor = members[0];
    const side = i%2, col = Math.floor(i/2)%trayCols, row = Math.floor(i/(2*trayCols));
    const x = side ? width+cw*(.65+col*1.3) : -cw*(1.65+col*1.3);
    const y = row*ch*1.3+(height-trayRows*ch*1.3)/2;
    const dx = x-anchor.x, dy = y-anchor.y;
    members.forEach(p => {p.x+=dx;p.y+=dy;});
  });
}

export function moveGroup(puzzle, group, dx, dy) {
  puzzle.pieces.filter(p=>p.group===group&&!p.locked).forEach(p=>{p.x+=dx;p.y+=dy;});
}

// Try compact tray layouts and keep the one that gives the solved image
// the largest scale. Central work stays fixed; connected groups stay intact.
export function compactSideTrays(puzzle, availableWidth, availableHeight) {
  if (!(availableWidth > 0 && availableHeight > 0)) return false;
  const groups = new Map();
  for (const p of puzzle.pieces) {
    if (!groups.has(p.group)) groups.set(p.group, []);
    groups.get(p.group).push(p);
  }
  const left = [], right = [];
  for (const [group, members] of groups) {
    if (members.some(p => p.locked)) continue;
    const x = Math.min(...members.map(p => p.x));
    const y = Math.min(...members.map(p => p.y));
    const w = Math.max(...members.map(p => p.x + puzzle.cw)) - x;
    const h = Math.max(...members.map(p => p.y + puzzle.ch)) - y;
    const item = {group, x, y, w, h};
    if (x + w < 0) left.push(item);
    else if (x > puzzle.width) right.push(item);
  }
  if (!left.length && !right.length) return false;
  // Preserve the visual order instead of reshuffling on every fit.
  for (const side of [left, right]) side.sort((a,b) => a.y-b.y || Math.abs(a.x)-Math.abs(b.x));
  const gap = Math.min(puzzle.cw, puzzle.ch) * .46;
  function pack(side, columns, direction, plan) {
    if (!side.length) return;
    const trayWidth = Math.max(columns*puzzle.cw+(columns-1)*gap, ...side.map(g=>g.w));
    let x=0, y=0, rowHeight=0;
    const positions=[];
    for (const g of side) {
      if (x && x+g.w > trayWidth+1e-8) {x=0;y+=rowHeight+gap;rowHeight=0;}
      positions.push({g,x,y});x+=g.w+gap;rowHeight=Math.max(rowHeight,g.h);
    }
    const top=(puzzle.height-y-rowHeight)/2;
    for (const {g,x,y} of positions) {
      const px=direction<0 ? -gap-x-g.w : puzzle.width+gap+x;
      plan.set(g.group,{dx:px-g.x,dy:top+y-g.y});
    }
  }
  function scaleFor(plan) {
    let minX=0,minY=0,maxX=puzzle.width,maxY=puzzle.height;
    for (const p of puzzle.pieces) {
      const offset=plan.get(p.group),x=p.x+(offset?.dx||0),y=p.y+(offset?.dy||0);
      minX=Math.min(minX,x);minY=Math.min(minY,y);
      maxX=Math.max(maxX,x+puzzle.cw);maxY=Math.max(maxY,y+puzzle.ch);
    }
    return Math.min(availableWidth/(maxX-minX+puzzle.cw*.9),availableHeight/(maxY-minY+puzzle.ch*.9));
  }
  let best=null, bestScale=scaleFor(new Map());
  for (let columns=1;columns<=Math.max(left.length,right.length);columns++) {
    const plan=new Map();pack(left,columns,-1,plan);pack(right,columns,1,plan);
    const scale=scaleFor(plan);
    if (scale>bestScale+1e-8) {best=plan;bestScale=scale;}
  }
  if (!best) return false;
  for (const [group,{dx,dy}] of best) moveGroup(puzzle,group,dx,dy);
  return true;
}

export function snap(puzzle, group, tolerance) {
  const pieces = puzzle.pieces;
  let members = pieces.filter(p=>p.group===group);
  if (!members.length || members[0].locked) return {merged:false, placed:0};
  let merged = false;
  // A group has one common displacement from its solved position.
  for (;;) {
    let candidate = null, nearest = tolerance;
    for (const p of members) for (const q of pieces) {
      if (q.group===group || Math.abs(p.r-q.r)+Math.abs(p.c-q.c)!==1) continue;
      const dx = (q.x-q.tx)-(p.x-p.tx), dy = (q.y-q.ty)-(p.y-p.ty);
      const distance = Math.hypot(dx,dy);
      if (distance < nearest) {nearest=distance;candidate={q,dx,dy};}
    }
    if (!candidate) break;
    const {q,dx,dy} = candidate;
    moveGroup(puzzle,group,dx,dy);
    const other = pieces.filter(p=>p.group===q.group);
    other.forEach(p=>p.group=group);
    members=members.concat(other);merged=true;
    if (q.locked) break;
  }
  const anchor=members[0];
  const place=members.some(p=>p.locked)||Math.hypot(anchor.x-anchor.tx,anchor.y-anchor.ty)<tolerance;
  let placed=0;
  if (place) members.forEach(p=>{if(!p.locked)placed++;p.x=p.tx;p.y=p.ty;p.locked=true;});
  return {merged,placed};
}

// Clockwise edges; reversing a shared edge and its sign creates its exact mate.
export function piecePath(cw, ch, edges) {
  let path='M 0 0';
  const corners=[[0,0],[cw,0],[cw,ch],[0,ch],[0,0]];
  for(let side=0;side<4;side++) {
    const [x,y]=corners[side], [ex,ey]=corners[side+1];
    const dx=ex-x,dy=ey-y,len=Math.hypot(dx,dy), sign=edges[side];
    const point=(t,v)=>`${x+dx*t-dy/len*v} ${y+dy*t+dx/len*v}`;
    const depth=Math.min(cw,ch)*.65*sign;
    if (sign) path+=` L ${point(.34,0)} C ${point(.43,0)} ${point(.45,-.05*depth)} ${point(.40,-.12*depth)} C ${point(.30,-.28*depth)} ${point(.40,-.35*depth)} ${point(.50,-.35*depth)} C ${point(.60,-.35*depth)} ${point(.70,-.28*depth)} ${point(.60,-.12*depth)} C ${point(.55,-.05*depth)} ${point(.57,0)} ${point(.66,0)}`;
    path+=` L ${ex} ${ey}`;
  }
  return path+' Z';
}
