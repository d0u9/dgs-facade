import {createPuzzle, arrange, moveGroup, snap, piecePath, compactSideTrays} from './engine.js';
const $=id=>document.getElementById(id);
let puzzle, source, sourceBlob, pendingBlob, view={x:0,y:0,scale:1}, drag=null, nodes=[];
let elapsed=0, clock=null, z=1, loadToken=0, saveEnabled=true;
const table=$('table'), world=$('world');
const message=text=>$('status').textContent=text;
const stamp=ms=>{const s=Math.floor(ms/1000);return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;};
const duration=()=>elapsed+(clock?Date.now()-clock:0);
function startClock(){if(!clock&&puzzle.pieces.some(p=>!p.locked))clock=Date.now();}
setInterval(()=>$('time').textContent=stamp(duration()),1000);

// Store only the normalized image and puzzle state, never a source filename.
const database=new Promise((resolve,reject)=>{const r=indexedDB.open('local-jigsaw',1);r.onupgradeneeded=()=>r.result.createObjectStore('game');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
database.catch(()=>{saveEnabled=false;});
async function persist(){
  if(!saveEnabled||!puzzle||!sourceBlob)return;
  const record={puzzle:structuredClone(puzzle),image:sourceBlob,elapsed:duration(),shape:puzzle.shape || 'classic'};
  try{const db=await database;const tx=db.transaction('game','readwrite');tx.objectStore('game').put(record,'current');tx.onerror=()=>{saveEnabled=false;message('Playing locally. Autosave is unavailable in this browser.');};}
  catch{saveEnabled=false;}
}
async function saved(){try{const db=await database;return await new Promise((resolve,reject)=>{const r=db.transaction('game').objectStore('game').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}catch{return null;}}

async function picture(blob){
  const url=URL.createObjectURL(blob),img=new Image();
  try{img.src=url;await img.decode();return img;}finally{URL.revokeObjectURL(url);}
}
async function normalize(blob){
  const img=await picture(blob);const ratio=Math.min(1,1800/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('decode')),'image/png'));
}
async function load(blob,restore=null){
  const token=++loadToken;
  $('start').disabled=true;$('new').disabled=true;$('uploadTop').disabled=true;
  try{
    const normalized=restore?blob:await normalize(blob),img=await picture(normalized);
    if(token!==loadToken)return;
    if(source)URL.revokeObjectURL(source);
    sourceBlob=normalized;pendingBlob=normalized;source=URL.createObjectURL(normalized);
    const shape=document.querySelector('input[name=shape]:checked').value;
    puzzle=restore?.puzzle||createPuzzle(img.naturalWidth/img.naturalHeight,shape,Math.random,Number($('difficulty').value));
    $('difficulty').value=String(puzzle.pieces.length);
    elapsed=restore?.elapsed||0;clock=null;drag=null;
    for(const id of ['ghostImage','previewImage','uploadPreview'])$(id).src=source;
    $('setup').close();build();fit();update();
    message(restore?'Your locally saved puzzle is ready.':'Drag pieces together or into the frame. Wheel to zoom; drag empty space to pan.');
    persist();
  }catch{ $('setupStatus').textContent='This image could not be opened. Try a PNG, JPEG or WebP image.'; }
  finally{if(token===loadToken){$('start').disabled=false;$('new').disabled=false;$('uploadTop').disabled=false;}}
}
function build(){
  $('pieces').replaceChildren();nodes=[];
  const {cw,ch,width,height}=puzzle;
  $('target').style.width=`${width}px`;$('target').style.height=`${height}px`;
  const pad=Math.min(cw,ch)*.26;
  for(const p of puzzle.pieces){
    const btn=document.createElement('button');btn.className='jig-piece';btn.type='button';
    btn.setAttribute('aria-label',`Piece ${p.id+1}${(p.r===0||p.c===0||p.r===puzzle.rows-1||p.c===puzzle.cols-1)?', edge':''}`);
    const path=piecePath(cw,ch,p.edges);
    btn.innerHTML=`<svg width="${cw+pad*2}" height="${ch+pad*2}" viewBox="${-pad} ${-pad} ${cw+pad*2} ${ch+pad*2}" aria-hidden="true"><defs><clipPath id="clip-${p.id}"><path d="${path}"/></clipPath></defs><image x="${-p.tx}" y="${-p.ty}" width="${width}" height="${height}" href="${source}" clip-path="url(#clip-${p.id})" preserveAspectRatio="none"/><path class="hit" d="${path}"/></svg>`;
    btn.onpointerdown=e=>begin(e,p);
    btn.onkeydown=e=>{
      const steps={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
      if(p.locked)return;
      if(steps[e.key]){e.preventDefault();startClock();const [dx,dy]=steps[e.key];moveGroup(puzzle,p.group,dx*(e.shiftKey?20:5)/view.scale,dy*(e.shiftKey?20:5)/view.scale);raise(p.group);update();}
      if(e.key==='Enter'||e.key===' '){e.preventDefault();finish(p.group);}
    };
    btn.onfocus=()=>{if(!p.locked){raise(p.group);const px=(p.x+cw/2)*view.scale+view.x,py=(p.y+ch/2)*view.scale+view.y;if(px<0||px>table.clientWidth||py<0||py>table.clientHeight){view.x=table.clientWidth/2-(p.x+cw/2)*view.scale;view.y=table.clientHeight/2-(p.y+ch/2)*view.scale;transform();}}};
    $('pieces').append(btn);nodes.push(btn);
  }
}
function transform(){world.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.scale})`;$('zoomLabel').textContent=`${Math.round(view.scale*100)}%`;}
function raise(group){z++;puzzle.pieces.forEach(p=>{if(p.group===group)nodes[p.id].style.zIndex=z;});}
function update(){
  const pad=Math.min(puzzle.cw,puzzle.ch)*.26;
  puzzle.pieces.forEach(p=>{const btn=nodes[p.id];btn.style.left=`${p.x-pad}px`;btn.style.top=`${p.y-pad}px`;btn.classList.toggle('locked',p.locked);btn.classList.toggle('dragging',drag?.group===p.group);btn.disabled=p.locked;if(p.locked)btn.style.zIndex=0;});
  const placed=puzzle.pieces.filter(p=>p.locked).length;
  const total=puzzle.pieces.length;
  $('pieceCount').textContent=total;
  $('difficultyLabel').textContent=`${({60:'easy',150:'medium',300:'hard'})[total]} · pieces`;
  $('progress').textContent=`${placed} / ${total}`;
  $('targetLabel').hidden=placed>0;
  $('complete').hidden=placed!==total;
  if(placed===total){if(clock){elapsed=duration();clock=null;}$('finishTime').textContent=`${total} pieces · ${stamp(elapsed)}`;message('Puzzle complete. Every piece is in place.');}
  $('time').textContent=stamp(duration());
}
function bounds(){
  const xs=puzzle.pieces.map(p=>p.x),ys=puzzle.pieces.map(p=>p.y);
  return {left:Math.min(0,...xs)-puzzle.cw*.45,top:Math.min(0,...ys)-puzzle.ch*.45,right:Math.max(puzzle.width,...xs.map(x=>x+puzzle.cw))+puzzle.cw*.45,bottom:Math.max(puzzle.height,...ys.map(y=>y+puzzle.ch))+puzzle.ch*.45};
}
function fit(){
  if(!puzzle)return;
  let b=bounds();
  if(document.querySelector('.jig-shell').matches(':fullscreen')){
    if(compactSideTrays(puzzle,table.clientWidth-30,table.clientHeight-30)){b=bounds();update();persist();}
  }
  view.scale=Math.min((table.clientWidth-30)/(b.right-b.left),(table.clientHeight-30)/(b.bottom-b.top));
  view.x=(table.clientWidth-(b.right-b.left)*view.scale)/2-b.left*view.scale;
  view.y=(table.clientHeight-(b.bottom-b.top)*view.scale)/2-b.top*view.scale;
  transform();
}
function finish(group){const result=snap(puzzle,group,Math.min(30,Math.min(puzzle.cw,puzzle.ch)*.35,Math.max(8,14/view.scale)));update();if(puzzle.pieces.some(p=>!p.locked))message(result.placed?`${result.placed} piece${result.placed===1?'':'s'} placed. ${saveEnabled?'Saved on this device.':''}`:result.merged?'Pieces connected. Drag the whole group together.':'Keep looking for a matching neighbour.');persist();}
function begin(e,p){
  if(e.button!==0||p.locked)return;e.preventDefault();e.stopPropagation();startClock();raise(p.group);drag={group:p.group,x:e.clientX,y:e.clientY,pointer:e.pointerId};table.setPointerCapture(e.pointerId);update();
}
table.onpointerdown=e=>{if(e.button!==0&&e.button!==1)return;if(!puzzle)return;e.preventDefault();table.focus();drag={x:e.clientX,y:e.clientY,pointer:e.pointerId,pan:true};table.setPointerCapture(e.pointerId);};
table.onpointermove=e=>{if(!drag||drag.pointer!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;if(drag.pan){view.x+=dx;view.y+=dy;transform();}else{moveGroup(puzzle,drag.group,dx/view.scale,dy/view.scale);update();}};
function end(e){if(!drag||drag.pointer!==e.pointerId)return;const d=drag;drag=null;if(table.hasPointerCapture(e.pointerId))table.releasePointerCapture(e.pointerId);if(!d.pan)finish(d.group);}
table.onpointerup=end;table.onpointercancel=e=>{if(drag?.pointer===e.pointerId){drag=null;update();persist();}};
table.addEventListener('wheel',e=>{if(!puzzle)return;e.preventDefault();const rect=table.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,wx=(x-view.x)/view.scale,wy=(y-view.y)/view.scale;view.scale=Math.max(.08,Math.min(3,view.scale*Math.exp(-e.deltaY*.001)));view.x=x-wx*view.scale;view.y=y-wy*view.scale;transform();},{passive:false});
$('fit').onclick=fit;
$('arrange').onclick=()=>{if(!puzzle)return;arrange(puzzle);update();fit();persist();message('Loose pieces arranged around the frame. Connected groups stay together.');};
$('ghost').onclick=()=>{const on=$('ghost').getAttribute('aria-pressed')!=='true';$('ghost').setAttribute('aria-pressed',on);$('ghostImage').classList.toggle('on',on);};
$('image').onclick=()=>$('preview').showModal();
$('new').onclick=$('again').onclick=()=>{$('setupStatus').textContent='';$('setup').showModal();};
$('upload').onclick=()=>$('file').click();
$('uploadTop').onclick=()=>{$('setupStatus').textContent='';$('setup').showModal();$('file').click();};
let uploadURL, fileToken=0;
$('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;const token=++fileToken;$('start').disabled=true;try{const blob=await normalize(file);if(token!==fileToken)return;pendingBlob=blob;if(uploadURL)URL.revokeObjectURL(uploadURL);uploadURL=URL.createObjectURL(blob);$('uploadPreview').src=uploadURL;$('setupStatus').textContent='Image ready. Choose a shape and start.';}catch{$('setupStatus').textContent='Unable to open this image. Try PNG, JPEG or WebP.';}finally{if(token===fileToken)$('start').disabled=false;$('file').value='';}};
$('start').onclick=()=>load(pendingBlob);
$('sample').onclick=async()=>{try{const response=await fetch(new URL('./sample.svg',import.meta.url));if(!response.ok)throw new Error('sample');pendingBlob=await response.blob();if(uploadURL)URL.revokeObjectURL(uploadURL);uploadURL=URL.createObjectURL(pendingBlob);$('uploadPreview').src=uploadURL;$('setupStatus').textContent='Sample selected. Choose a shape and start.';}catch{$('setupStatus').textContent='The sample could not be loaded. Try again or choose your own image.';}};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.querySelector('.jig-shell').requestFullscreen();}catch{message('Fullscreen unavailable. You can still pan and zoom.');}};
document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'restore':'maximize';fit();});
new ResizeObserver(()=>fit()).observe(table);
window.addEventListener('pagehide',persist);
const requestedSample=Number(new URL(location.href).searchParams.get('sample'));
const record=await saved();
if([60,150,300].includes(requestedSample)){
  $('difficulty').value=String(requestedSample);
  await load(await (await fetch(new URL('./sample.svg',import.meta.url))).blob());
  const url=new URL(location.href);url.searchParams.delete('sample');history.replaceState(null,'',url);
}
else if([60,150,300].includes(record?.puzzle?.pieces?.length)){document.querySelector(`input[name=shape][value="${record.shape==='square'?'square':'classic'}"]`).checked=true;await load(record.image,record);}
else await load(await (await fetch(new URL('./sample.svg',import.meta.url))).blob());
