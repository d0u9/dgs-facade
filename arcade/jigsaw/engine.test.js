import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPuzzle,moveGroup,snap,arrange,piecePath,gridFor,compactSideTrays} from './engine.js';

test('every difficulty preserves aspect and shares complementary edges',()=>{
 for(const count of [60,150,300])for(const aspect of [.4,.75,1,1.5,2.5])for(const shape of ['classic','square']){
  const p=createPuzzle(aspect,shape,()=>.3,count);assert.equal(p.pieces.length,count);assert.equal(p.cols*p.rows,count);assert.equal(p.width/p.height,aspect);
  for(const t of p.pieces){
   if(!t.r)assert.equal(t.edges[0],0);if(!t.c)assert.equal(t.edges[3],0);
   if(t.r===p.rows-1)assert.equal(t.edges[2],0);if(t.c===p.cols-1)assert.equal(t.edges[1],0);
   if(shape==='classic'){
    if(t.c<p.cols-1)assert.equal(t.edges[1],-p.pieces[t.id+1].edges[3]);
    if(t.r<p.rows-1)assert.equal(t.edges[2],-p.pieces[t.id+p.cols].edges[0]);
   }else assert.deepEqual(t.edges,[0,0,0,0]);
   assert.ok(!piecePath(p.cw,p.ch,t.edges).includes('NaN'));
  }
 }
 assert.deepEqual(gridFor(5/3),{cols:10,rows:6});
});
test('matching neighbours join away from frame and move as a group',()=>{
 const p=createPuzzle(5/3,'classic');const a=p.pieces[0],b=p.pieces[1];
 a.x=a.tx+1200;a.y=a.ty+1500;b.x=b.tx+1204;b.y=b.ty+1503;
 assert.ok(snap(p,a.group,10).merged);assert.equal(a.group,b.group);assert.equal(a.locked,false);
 assert.equal(a.x-b.x,a.tx-b.tx);assert.equal(a.y-b.y,a.ty-b.ty);
 const x=a.x;moveGroup(p,a.group,20,30);assert.equal(a.x,x+20);assert.equal(a.y-b.y,a.ty-b.ty);
 const offset=a.x-a.tx;arrange(p);assert.equal(a.x-b.x,a.tx-b.tx);assert.notEqual(a.x-a.tx,offset);
});
test('wrong neighbours do not connect; placed groups remain fixed',()=>{
 const p=createPuzzle(5/3,'square');const a=p.pieces[0],wrong=p.pieces[4];
 a.x=a.tx+1400;a.y=1500;wrong.x=wrong.tx+1400;wrong.y=1500;
 assert.equal(snap(p,a.group,5).merged,false);
 a.x=a.tx+3;a.y=a.ty+2;assert.equal(snap(p,a.group,5).placed,1);
 moveGroup(p,a.group,100,100);assert.equal(a.x,a.tx);assert.equal(a.y,a.ty);
 const b=p.pieces[1];b.x=b.tx+2;b.y=b.ty+2;
 snap(p,b.group,5);assert.equal(b.locked,true);assert.equal(b.group,a.group);
});
test('every difficulty can be assembled and placed',()=>{
 for(const count of [60,150,300]){
 const p=createPuzzle(5/3,'classic',Math.random,count);for(const t of p.pieces){t.x=t.tx+1000;t.y=t.ty+1000;}
 snap(p,0,1);assert.ok(p.pieces.every(t=>t.group===0));
 moveGroup(p,0,-1000,-1000);assert.equal(snap(p,0,1).placed,count);assert.ok(p.pieces.every(t=>t.locked));
 }
});
test('large puzzles distribute loose pieces across compact side trays',()=>{
 for(const count of [60,150,300]){
  const p=createPuzzle(5/3,'classic',Math.random,count);
  const positions=p.pieces.map(t=>`${t.x},${t.y}`);
  assert.equal(new Set(positions).size,count);
  assert.ok(p.pieces.every(t=>t.x<0||t.x>=p.width));
  const ys=p.pieces.map(t=>t.y);
  assert.ok(Math.max(...ys)-Math.min(...ys)<p.height*2);
 }
});

function fitScale(p,width=1890,height=900) {
 const xs=p.pieces.map(t=>t.x),ys=p.pieces.map(t=>t.y);
 return Math.min(width/(Math.max(p.width,...xs.map(x=>x+p.cw))-Math.min(0,...xs)+p.cw*.9),height/(Math.max(p.height,...ys.map(y=>y+p.ch))-Math.min(0,...ys)+p.ch*.9));
}
test('compact fullscreen trays enlarge the actual 150-piece image',()=>{
 const p=createPuzzle(.75,'classic',()=>.3,150),before=fitScale(p);
 assert.equal(compactSideTrays(p,1890,900),true);
 const after=fitScale(p);
 assert.ok(after>before*1.15,`Expected image growth: ${before} -> ${after}`);
 assert.equal(compactSideTrays(p,1890,900),false);
 // Rectangular piece bodies never overlap each other or the frame.
 for(const a of p.pieces){
  assert.ok(a.x+p.cw<0||a.x>p.width);
  for(const b of p.pieces)if(b.id>a.id)assert.ok(a.x+p.cw<=b.x+1e-8||b.x+p.cw<=a.x+1e-8||a.y+p.ch<=b.y+1e-8||b.y+p.ch<=a.y+1e-8);
 }
});
test('compacting preserves central work, placed pieces and connected groups',()=>{
 const p=createPuzzle(.75,'classic',()=>.3,150);
 const centre=p.pieces[0],placed=p.pieces[1],a=p.pieces[2],b=p.pieces[3];
 centre.x=200;centre.y=300;placed.x=placed.tx;placed.y=placed.ty;placed.locked=true;
 a.x=-300;a.y=100;b.x=a.x+p.cw;b.y=a.y;b.group=a.group;
 const central=[centre.x,centre.y,placed.x,placed.y];
 compactSideTrays(p,1890,900);
 assert.deepEqual([centre.x,centre.y,placed.x,placed.y],central);
 assert.ok(Math.abs(b.x-a.x-p.cw)<1e-8);assert.equal(a.y,b.y);assert.equal(a.group,b.group);
});
test('all difficulties and image ratios fit larger without cropping or stretching',()=>{
 for(const aspect of [.4,.75,1,1.5,2.5])for(const count of [60,150,300])for(const [width,height] of [[1890,900],[345,550]]){
  const p=createPuzzle(aspect,'classic',Math.random,count),before=fitScale(p,width,height);
  compactSideTrays(p,width,height);const after=fitScale(p,width,height);
  assert.ok(after>=before-1e-8);
  assert.equal(p.width/p.height,aspect);
  assert.equal(p.pieces.length,count);
  assert.ok(p.pieces.every(t=>Number.isFinite(t.x)&&Number.isFinite(t.y)));
  assert.equal(compactSideTrays(p,width,height),false);
 }
});
