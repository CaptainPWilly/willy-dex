/* Willy-Dex Random Draw. Public, read-only and fully client-side. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const screen=$('draw-screen'),launcher=$('random-draw-open'),close=$('draw-close'),picker=$('draw-picker'),find=$('draw-find'),chosen=$('draw-chosen'),chooseVisible=$('draw-select-visible'),clear=$('draw-clear'),shuffle=$('draw-shuffle'),draw=$('draw-next'),reveal=$('draw-reveal'),reshuffle=$('draw-reshuffle'),back=$('draw-back'),count=$('draw-count'),status=$('draw-status'),scene=$('draw-scene'),badge=$('draw-progress');
if(!screen||!launcher)return;
let catalog=[],pool=[],deck=[],current=null,faceUp=false,selection=new Set(),phase='choose';
let shuffling=false,shuffleEpoch=0;
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const available=c=>!!c&&c.name&&c.name!=='???';
function cardsNow(){if(typeof window.willyDexGetCards==='function')return window.willyDexGetCards().filter(available);return catalog.filter(available)}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function rand(max){if(max<=1)return 0;const box=new Uint32Array(1),limit=4294967296-(4294967296%max);do{crypto.getRandomValues(box)}while(box[0]>=limit);return box[0]%max}
function mixed(values){const copy=values.slice();for(let i=copy.length-1;i>0;i--){const j=rand(i+1);[copy[i],copy[j]]=[copy[j],copy[i]]}return copy}
function describe(){chosen.textContent=selection.size+' selected';shuffle.disabled=selection.size===0;const visible=cardsNow().filter(c=>filterMatch(c));chooseVisible.checked=!!visible.length&&visible.every(c=>selection.has(c.number));chooseVisible.indeterminate=visible.some(c=>selection.has(c.number))&&!chooseVisible.checked}
function filterMatch(c){const q=find.value.trim().toLocaleLowerCase();return !q||[c.number,c.name,c.type,c.guild,...(c.tags||[])].join(' ').toLocaleLowerCase().includes(q)}
function populate(){const availableCards=cardsNow(),valid=new Set(availableCards.map(c=>c.number));for(const n of selection)if(!valid.has(n))selection.delete(n);picker.replaceChildren();const fragment=document.createDocumentFragment();const showing=availableCards.filter(filterMatch);for(const card of showing){const line=document.createElement('label');line.className='draw-choice';const input=document.createElement('input');input.type='checkbox';input.checked=selection.has(card.number);input.value=card.number;input.addEventListener('change',()=>{input.checked?selection.add(card.number):selection.delete(card.number);describe()});const info=document.createElement('span');const title=document.createElement('strong');title.textContent='#'+card.number+'  '+card.name;const sub=document.createElement('small');sub.textContent=card.type||card.guild||'';info.append(title,sub);line.append(input,info);fragment.append(line)}picker.append(fragment);if(!showing.length){const empty=document.createElement('p');empty.className='draw-empty';empty.textContent='No published cards match.';picker.append(empty)}describe()}
function displayPhase(){const selecting=phase==='choose';$('draw-selection').hidden=!selecting;$('draw-play').hidden=selecting;status.textContent='';if(selecting){populate();find.focus()}else renderScene()}
function open(){screen.hidden=false;document.body.classList.add('draw-active');phase='choose';catalog=cardsNow();selection=new Set(catalog.map(c=>c.number));find.value='';displayPhase()}
function hide(){shuffleEpoch++;shuffling=false;scene.classList.remove('is-shuffling');scene.querySelectorAll('.shuffle-ghost').forEach(el=>el.remove());screen.hidden=true;document.body.classList.remove('draw-active')}
function start(){if(shuffling)return;pool=cardsNow().filter(c=>selection.has(c.number));if(!pool.length){status.textContent='Select at least one published card.';return}deck=mixed(pool);current=null;faceUp=false;phase='play';displayPhase();animateShuffle()}
function cardFace(c){const image=c?.portrait||c?.image||'';return '<div class="draw-front"><div class="draw-front-header"><span>'+escapeHtml(c?.name)+'</span><small>#'+escapeHtml(c?.number)+'</small></div><div class="draw-art">'+(image?'<img draggable="false" src="'+escapeHtml(encodeURI(image))+'" alt="" onerror="this.hidden=true">':'')+'</div><div class="draw-front-role">'+escapeHtml(c?.type||'PIRATE COVE')+'</div><div class="draw-front-footer"><span>LVL '+escapeHtml(c?.level??'—')+'</span><span>'+escapeHtml(c?.date||'')+'</span></div></div>'}
function renderScene(){const drawn=pool.length-deck.length;
badge.textContent=drawn+' / '+pool.length+' drawn';
scene.innerHTML='';
const card=document.createElement('div');card.className='draw-physical'+(faceUp?' revealed':'');card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',!current?'Deck face down':faceUp?'Drawn card '+current.name:'Reveal drawn card');
card.innerHTML='<div class="draw-physical-inner"><div class="draw-physical-back"><img src="assets/willy-corp-logo-vector.svg" alt="Willy Corp" draggable="false"></div><div class="draw-physical-front">'+(current?cardFace(current):'')+'</div></div>';
card.addEventListener('click',()=>{if(current&&!faceUp)showCard()});card.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&current&&!faceUp){e.preventDefault();showCard()}});scene.append(card);
reveal.hidden=!(current&&!faceUp);
draw.disabled=!deck.length||!!(current&&!faceUp);
draw.textContent=current&&!faceUp?'Reveal first':deck.length?'Draw '+(current?'Next':'First')+' Card':'Deck Empty';
reveal.textContent='Reveal Card';
reshuffle.disabled=!pool.length;
const stateMessage=!current?'Shuffled and face down. Draw when ready.':!faceUp?'Card drawn. Tap to reveal.':deck.length?'Draw again for another random card.':'Every card has been drawn.';
$('draw-instructions').textContent=stateMessage;
}
function next(){if(shuffling)return;if(current&&!faceUp){showCard();return}if(!deck.length)return;current=deck.pop();faceUp=false;renderScene()}
function showCard(){if(shuffling||!current||faceUp)return;faceUp=true;const card=scene.querySelector('.draw-physical');if(card){card.classList.add('revealed');card.setAttribute('aria-label','Drawn card '+current.name)}reveal.hidden=true;draw.disabled=!deck.length;draw.textContent=deck.length?'Draw Next Card':'Deck Empty';$('draw-instructions').textContent=deck.length?'Draw again for another random card.':'Every card has been drawn.'}
function restart(){if(shuffling||!pool.length)return;deck=mixed(pool);current=null;faceUp=false;renderScene();animateShuffle()}
async function animateShuffle(){
 if(shuffling||reducedMotion.matches||pool.length<2||!scene.animate)return;
 shuffling=true;const epoch=++shuffleEpoch;scene.classList.add('is-shuffling');draw.disabled=true;reshuffle.disabled=true;
 $('draw-instructions').textContent='Shuffling '+pool.length+' cards…';
 const n=Math.min(7,Math.max(3,pool.length));
 const tasks=[];
 for(let i=0;i<n;i++){
  const ghost=document.createElement('div');ghost.className='shuffle-ghost';ghost.setAttribute('aria-hidden','true');
  ghost.innerHTML='<img src="assets/willy-corp-logo-vector.svg" alt="" draggable="false">';
  scene.append(ghost);
  const side=i%2?-1:1,spread=side*(56+i*6),tilt=side*(8+i*2);
  const animation=ghost.animate([
   {transform:'translate(-50%,-50%) translate(0px,0px) rotate(0deg) scale(1)',opacity:0.95,offset:0},
   {transform:'translate(-50%,-50%) translate('+spread+'px,-'+(12+i*3)+'px) rotate('+tilt+'deg) scale(1)',opacity:1,offset:.26},
   {transform:'translate(-50%,-50%) translate('+(-spread*.72)+'px,'+(i*4)+'px) rotate('+(-tilt*.7)+'deg) scale(1)',opacity:1,offset:.57},
   {transform:'translate(-50%,-50%) translate('+side*22+'px,-9px) rotate('+side*5+'deg) scale(1)',opacity:1,offset:.79},
   {transform:'translate(-50%,-50%) translate(0px,0px) rotate(0deg) scale(1)',opacity:0,offset:1}
  ],{duration:1100+i*35,delay:i*35,easing:'cubic-bezier(.4,0,.2,1)',fill:'both'});
  tasks.push(animation.finished.catch(()=>{}).then(()=>ghost.remove()));
 }
 await Promise.all(tasks);
 if(epoch!==shuffleEpoch)return;
 shuffling=false;scene.classList.remove('is-shuffling');renderScene();
}
launcher.addEventListener('click',open);close.addEventListener('click',hide);back.addEventListener('click',()=>{phase='choose';displayPhase()});find.addEventListener('input',populate);
chooseVisible.addEventListener('change',()=>{for(const c of cardsNow().filter(filterMatch))chooseVisible.checked?selection.add(c.number):selection.delete(c.number);populate()});
clear.addEventListener('click',()=>{selection.clear();populate()});shuffle.addEventListener('click',start);draw.addEventListener('click',next);reveal.addEventListener('click',showCard);reshuffle.addEventListener('click',restart);
screen.addEventListener('click',e=>{if(e.target===screen)hide()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!screen.hidden)hide()});
})();