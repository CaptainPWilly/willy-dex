'use strict';
/* Client-side screenshot-quality graphics for recorded GLB news. No network libraries. */
(()=>{
const $=id=>document.getElementById(id);
const read=(node,selector)=>node?.querySelector(selector)?.textContent?.trim()||'';
const txt=node=>node?.textContent?.trim()||'';
const source='WILLY DEX · GLB SNAPSHOT INTELLIGENCE';
const palette={bg:'#100d0b',panel:'#251b14',edge:'#796043',gold:'#e8bd82',text:'#f7e4c6',muted:'#c6b39a',green:'#9fc49f'};
const blocksOf=(node,kind)=>{
 if(!node)return [];
 if(kind==='hero')return [{type:'story',label:read(node,'.news-eyeline'),title:read(node,'h3'),description:read(node,'p')}];
 if(kind==='kpis')return [...node.querySelectorAll('.news-kpi')].map(x=>({type:'stat',label:read(x,'.t'),value:read(x,'.v'),description:read(x,'.sub')}));
 if(kind==='kpi')return [{type:'stat',label:read(node,'.t'),value:read(node,'.v'),description:read(node,'.sub')}];
 if(kind==='overview')return [...node.querySelectorAll('.stat')].map(x=>({type:'stat',label:read(x,'.muted'),value:read(x,'strong')}));
 if(kind==='standings')return [...node.querySelectorAll('tr')].map(x=>{const cells=[...x.querySelectorAll('td')].map(txt);return {type:'row',label:cells[0]+' '+cells[1],value:cells[2]+' EXP',description:cells[3]!=='—'?'Observed change: '+cells[3]:'No comparable prior observation'}});

 if(kind==='story')return [{type:'story',label:txt(node.querySelector('.meta')),title:read(node,'h4'),description:read(node,'p'),value:read(node,'.fig')}];
 if(kind==='feed'){
  const all=[...node.querySelectorAll('.news-story')],visible=all.slice(0,16);
  const cards=visible.flatMap(n=>blocksOf(n,'story'));
  if(!all.length)cards.push({type:'text',description:'No reports match the selected newsroom filters.'});
  if(all.length>visible.length)cards.push({type:'text',description:'Showing '+visible.length+' of '+all.length+' currently displayed reports. Use each story’s Copy Image button for individual reports.'});
  return cards;
 }
 if(kind==='gainers')return [...node.querySelectorAll('.news-bar-row')].map(x=>({type:'bar',label:read(x,'.n'),value:read(x,'.v'),progress:parseFloat(x.querySelector('.news-bar-fill')?.style.width)||0}));
 if(kind==='movers'||kind==='pressure')return [...node.querySelectorAll('.news-mover-row')].map(x=>({type:'row',label:read(x,'.m-name'),description:read(x,'small'),value:read(x,'.m-change')}));
 if(kind==='cove'){
  const primary=read(node,'.news-cove-big');
  const grid=[...node.querySelectorAll('.news-cove-grid>div')].map(x=>{
   const value=read(x,'strong');return {type:'stat',label:txt(x).replace(value,'').trim(),value};
  });
  return primary?[{type:'stat',label:'CURRENT OBSERVATION',value:primary},...grid]:[{type:'text',description:txt(node)}];
 }
 if(kind==='timeline')return [...node.querySelectorAll('.news-timeline-item')].map(x=>({type:'row',label:read(x,'.when'),description:read(x,'.detail')}));
 if(kind==='timeline-item')return [{type:'row',label:read(node,'.when'),description:read(node,'.detail')}];
 return [{type:'text',description:txt(node)}];
};
const titles={overview:'Season Observatory',standings:'Recorded Standings',full:'GLB Intelligence Report',hero:'Lead Story',kpis:'GLB Scorecard',kpi:'GLB Scorecard',gainers:'EXP Gainers',movers:'Ranking Shifts',pressure:'Leaderboard Pressure',cove:'Pirate Cove Watch',feed:'Coverage Desk',story:'GLB News Bulletin',timeline:'Snapshot Chronology','timeline-item':'Recorded Snapshot'};
function findTarget(kind,button){
 if(kind==='hero')return $('newsHero');
 if(kind==='overview')return $('stats');
 if(kind==='standings')return $('rows');
 if(kind==='kpi')return button.closest('.news-kpi');
 if(kind==='story')return button.closest('.news-story');
 if(kind==='timeline-item')return button.closest('.news-timeline-item');
 return $({kpis:'newsKpis',gainers:'newsGainers',movers:'newsMovers',pressure:'newsPressure',cove:'newsCove',feed:'newsFeed',timeline:'newsTimeline'}[kind]);
}
function section(kind,title,node){return {title,blocks:blocksOf(node,kind)}}
function makeSections(kind,button){
 if(kind!=='full')return [section(kind,titles[kind]||'GLB Report',findTarget(kind,button))];
 const pieces=[section('hero','Top Story',$('newsHero')),section('kpis','GLB Scorecard',$('newsKpis'))];
 for(const k of ['gainers','movers','pressure','cove'])pieces.push(section(k,titles[k],findTarget(k,button)));
 const stories=blocksOf($('newsFeed'),'feed').slice(0,9);
 if(stories.length)pieces.push({title:'Latest Coverage',blocks:stories});
 return pieces;
}
function makeGraphic(kind,button){
 const sections=makeSections(kind,button),headerTitle=titles[kind]||'GLB Intelligence';
 const width=1280,pad=70,inner=width-pad*2;
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=64;
 let ctx=canvas.getContext('2d');if(!ctx)throw Error('Image rendering is unavailable');
 function words(text,font,limit){ctx.font=font;const terms=String(text||'').split(/\s+/).filter(Boolean),lines=[];let line='';
 for(const word of terms){const candidate=line?line+' '+word:word;if(ctx.measureText(candidate).width<=limit){line=candidate;continue}if(line)lines.push(line);if(ctx.measureText(word).width<=limit){line=word;continue}let part='';for(const ch of [...word]){if(ctx.measureText(part+ch).width>limit&&part){lines.push(part);part=ch}else part+=ch}line=part}
 if(line)lines.push(line);return lines.length?lines:['—'];}
 function labelText(text,y,draw,font='600 23px system-ui',line=33,color=palette.text,max=inner,xpos=pad){
 const lines=words(text,font,max);if(draw){ctx.font=font;ctx.textAlign='left';ctx.fillStyle=color;for(let i=0;i<lines.length;i++)ctx.fillText(lines[i],xpos,y+i*line)}return lines.length*line}
 function item(block,y,draw){
 const left=pad+28,right=width-pad-28,max=right-left;
 const labelFont='700 21px system-ui',titleFont='700 31px Georgia,serif',descFont='22px system-ui',valueFont='700 30px system-ui';
 const line=(text,font,maxWidth)=>words(text,font,maxWidth).length;
 let height=42;
 if(block.label)height+=line(block.label,labelFont,max)*32;
 if(block.title)height+=line(block.title,titleFont,max)*41+4;
 if(block.value)height+=line(block.value,valueFont,max)*39+3;
 if(block.description)height+=line(block.description,descFont,max)*33+9;
 if(block.type==='bar')height+=25;
 height=Math.max(height,110);
 if(draw){ctx.fillStyle=palette.panel;ctx.strokeStyle=palette.edge;ctx.lineWidth=1.5;ctx.beginPath();if(ctx.roundRect)ctx.roundRect(pad,y,inner,height,12);else ctx.rect(pad,y,inner,height);ctx.fill();ctx.stroke()}
 let current=y+34;
 if(block.label){let n=labelText(block.label,current,draw,labelFont,32,palette.gold,max,left);current+=n+2}
 if(block.title){let n=labelText(block.title,current,draw,titleFont,41,palette.text,max,left);current+=n+4}
 if(block.value){let n=labelText(block.value,current,draw,valueFont,39,palette.gold,max,left);current+=n+2}
 if(block.description){let n=labelText(block.description,current,draw,descFont,33,palette.muted,max,left);current+=n+9}
 if(block.type==='bar'&&draw){ctx.fillStyle='#473624';ctx.fillRect(left,y+height-29,max,12);ctx.fillStyle=palette.gold;ctx.fillRect(left,y+height-29,max*Math.max(0,Math.min(100,block.progress))/100,12)}
 return y+height+12;
 }
 function paint(draw){
 let y=68;
 if(draw){ctx.fillStyle=palette.bg;ctx.fillRect(0,0,width,canvas.height);const grad=ctx.createLinearGradient(0,0,0,canvas.height);grad.addColorStop(0,'#302218');grad.addColorStop(1,'#100d0b');ctx.fillStyle=grad;ctx.fillRect(22,22,width-44,canvas.height-44);ctx.strokeStyle='#96734b';ctx.lineWidth=2;ctx.strokeRect(22,22,width-44,canvas.height-44)}
 y+=labelText('WILLY CORP / GLB PRESSROOM',y,draw,'800 20px system-ui',29,palette.gold);
 y+=22;
 y+=labelText(headerTitle,y,draw,'700 49px Georgia,serif',60,palette.text);
 y+=12;
 const period=$('newsDateline')?.textContent||'Recorded leaderboard observations';
 y+=labelText(period,y,draw,'21px system-ui',32,palette.muted);
 y+=25;
 for(const section of sections){
  if(!section.blocks.length)continue;
  if(draw){ctx.fillStyle='#8a6943';ctx.fillRect(pad,y,inner,1)}
  y+=32;
  y+=labelText(section.title.toUpperCase(),y,draw,'800 23px system-ui',35,palette.gold);
  y+=9;
  for(const block of section.blocks)y=item(block,y,draw);
  y+=15;
 }
 y+=25;
 if(draw){ctx.strokeStyle=palette.edge;ctx.beginPath();ctx.moveTo(pad,y-15);ctx.lineTo(width-pad,y-15);ctx.stroke()}
 y+=labelText(source+' · OBSERVED VALUES ONLY',y,draw,'700 18px system-ui',30,palette.muted);
 y+=labelText('Rank movement and EXP changes reflect the selected recorded snapshots.',y,draw,'17px system-ui',25,palette.muted);
 return y+68;
 }
 const total=paint(false);if(total>11000)throw Error('The selected report is too long for one image; copy individual cards instead');
 canvas.height=Math.max(420,Math.ceil(total));
 ctx=canvas.getContext('2d');paint(true);
 const png=canvas.toDataURL('image/png');if(!png.startsWith('data:image/png;base64,'))throw Error('Could not produce PNG');
 const binary=atob(png.split(',')[1]),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return {blob:new Blob([bytes],{type:'image/png'}),png};
}
const toast=$('newsCopyToast'),fallback=$('newsCopyFallback'),preview=$('newsCopyPreview');
let toastTimer;
function notify(message,kind='success'){
 if(toastTimer)clearTimeout(toastTimer);toast.textContent=message;toast.dataset.state=kind;toast.hidden=false;
 toastTimer=setTimeout(()=>{toast.hidden=true},3900);
}
function showPreview(png,why){
 preview.src=png;fallback.hidden=false;notify(why+' · Long-press image to copy','error');
}
$('newsCopyClose').onclick=()=>{fallback.hidden=true;preview.removeAttribute('src')};
fallback.addEventListener('click',e=>{if(e.target===fallback)fallback.hidden=true});
document.addEventListener('click',e=>{
 const button=e.target.closest('[data-copy-image]');if(!button)return;
 const kind=button.dataset.copyImage;
 try{
  // Creating the PNG and invoking clipboard.write in the same user gesture matters on iOS.
  const {blob,png}=makeGraphic(kind,button);
  if(!navigator.clipboard?.write||typeof ClipboardItem!=='function'){showPreview(png,'Clipboard not supported');return}
  navigator.clipboard.write([new ClipboardItem({'image/png':blob})])
    .then(()=>{fallback.hidden=true;notify('Copied to clipboard')})
    .catch(err=>showPreview(png,'Browser blocked clipboard access'+(err?.name?' ('+err.name+')':'')));
 }catch(err){notify('Could not copy image: '+err.message,'error')}
});
window.glbCopyNotice=notify;
})();
