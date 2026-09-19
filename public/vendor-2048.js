const SIZE=4;
let grid,score,best=+localStorage.getItem('2048-best')||0;
const medalLevels=[128,256,512,1024,2048,4096];
let highestMilestone=0;
function startGame(){grid=Array.from({length:SIZE},()=>Array(SIZE).fill(0));score=0;highestMilestone=0;addRandom();addRandom();document.getElementById('msg').style.display='none';render();}
function addRandom(){const empty=[];for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(!grid[r][c])empty.push([r,c]);if(!empty.length)return;const[r,c]=empty[Math.floor(Math.random()*empty.length)];grid[r][c]=Math.random()<.9?2:4;}
function render(){document.getElementById('score').textContent=score;document.getElementById('scoreStage').textContent=score;if(score>best){best=score;localStorage.setItem('2048-best',best);}document.getElementById('best').textContent=best;document.getElementById('bestStage').textContent=best;for(const level of medalLevels){const medal=document.getElementById('medal-'+level);const unlocked=level<=highestMilestone;const newlyUnlocked=unlocked&&medal.hidden;medal.hidden=!unlocked;if(newlyUnlocked){medal.classList.remove('v2048-medal-pop');void medal.offsetWidth;medal.classList.add('v2048-medal-pop');}else if(!unlocked)medal.classList.remove('v2048-medal-pop');}const b=document.getElementById('board');b.innerHTML='';for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){const v=grid[r][c];const d=document.createElement('div');d.className='cell'+(v?(' c'+(v>2048?'big':v)):'');d.textContent=v||'';b.appendChild(d);}}
function slide(row){let arr=row.filter(x=>x);for(let i=0;i<arr.length-1;i++){if(arr[i]===arr[i+1]){const merged=arr[i]*2;score+=merged;if(merged>highestMilestone)highestMilestone=merged;arr[i]=merged;arr[i+1]=0;}}arr=arr.filter(x=>x);while(arr.length<SIZE)arr.push(0);return arr;}
function move(dir){let moved=false;const prev=grid.map(r=>[...r]);if(dir==='left')for(let r=0;r<SIZE;r++){const s=slide(grid[r]);if(s.join()!==grid[r].join())moved=true;grid[r]=s;}if(dir==='right')for(let r=0;r<SIZE;r++){const s=slide([...grid[r]].reverse()).reverse();if(s.join()!==grid[r].join())moved=true;grid[r]=s;}if(dir==='up')for(let c=0;c<SIZE;c++){const col=grid.map(r=>r[c]);const s=slide(col);s.forEach((v,r)=>{if(v!==col[r])moved=true;grid[r][c]=v;});}if(dir==='down')for(let c=0;c<SIZE;c++){const col=grid.map(r=>r[c]);const s=slide([...col].reverse()).reverse();s.forEach((v,r)=>{if(v!==col[r])moved=true;grid[r][c]=v;});}if(!moved)return;addRandom();render();checkEnd();}
function checkEnd(){for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(!grid[r][c])return;for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){if(c<SIZE-1&&grid[r][c]===grid[r][c+1])return;if(r<SIZE-1&&grid[r][c]===grid[r+1][c])return;}showMsg('Game Over','Score: '+score);}
function showMsg(t,s){document.getElementById('msgTitle').textContent=t;document.getElementById('msgSub').textContent=s;document.getElementById('msg').style.display='flex';}
const MAP={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',a:'left',d:'right',w:'up',s:'down'};
document.addEventListener('keydown',e=>{if(MAP[e.key]){e.preventDefault();move(MAP[e.key]);}});
let tx,ty;
let playingTouch=false;
const stage=document.querySelector('.v2048-stage');
stage.addEventListener('touchstart',e=>{const touch=e.touches[0],rect=stage.getBoundingClientRect();playingTouch=touch.clientY-rect.top>=64;if(playingTouch){tx=touch.clientX;ty=touch.clientY;}},{passive:true});
stage.addEventListener('touchmove',e=>{if(playingTouch)e.preventDefault();},{passive:false});
stage.addEventListener('touchend',e=>{if(!playingTouch)return;playingTouch=false;const touch=e.changedTouches[0],dx=touch.clientX-tx,dy=touch.clientY-ty;if(Math.max(Math.abs(dx),Math.abs(dy))<28)return;if(Math.abs(dx)>Math.abs(dy))move(dx>0?'right':'left');else move(dy>0?'down':'up');});
stage.addEventListener('touchcancel',()=>{playingTouch=false;});
document.getElementById('newBtn').addEventListener('click',startGame);
document.getElementById('shareBtn').addEventListener('click',()=>{const txt=`I scored ${score} in 2048 on oriz.games!`;if(navigator.share)navigator.share({title:'2048',text:txt,url:location.href});else navigator.clipboard.writeText(txt);});
startGame();
