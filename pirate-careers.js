'use strict';
const $=id=>document.getElementById(id);
const fmt=n=>Number(n).toLocaleString('en-US');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const norm=s=>String(s??'').trim().toLocaleLowerCase();
let records=[],cards=[];
const date=s=>{
 const day=String(s||'').slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return '';
 const d=new Date(day+'T12:00:00Z');
 return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('en-US',{timeZone:'UTC',dateStyle:'medium'}).format(d);
};
function status(x){return x.membershipStatus==='current'?'active':x.membershipStatus==='former'?'former':'unknown'}
function ageDays(age){
 const match=String(age||'').match(/(\d+)\s+(minute|hour|day|week|month|year)s?/);
 if(!match)return Infinity;
 return +match[1]*({minute:1/1440,hour:1/24,day:1,week:7,month:30.44,year:365.25}[match[2]]);
}
function eventAge(e){
 if(e.ageText)return ageDays(e.ageText);
 if(e.recordedDay){const age=Date.parse('2026-10-29T12:00:00Z')-Date.parse(e.recordedDay+'T12:00:00Z');return Number.isFinite(age)?Math.max(0,age/86400000):Infinity}
 return Infinity;
}
function events(x){
 const join=(x.periods||[]).map((p,i)=>({kind:'Joined',index:i+1,recordedDay:p.joined||null,ageText:p.ageText||null,reportedOn:p.reportedAt||p.reportedOn||(/2026-10-29/.test(p.source||'')?'2026-10-29':null),precision:p.datePrecision||'unknown',source:p.source||''}));
 const leave=(x.departures||[]).map((p,i)=>({kind:'Left',index:i+1,recordedDay:p.left||null,ageText:p.ageText||null,reportedOn:p.reportedOn||null,precision:p.datePrecision||'unknown',source:p.source||''}));
 const removed=(x.removals||[]).map((p,i)=>({kind:'Removed',index:i+1,recordedDay:p.removed||null,ageText:p.ageText||null,reportedOn:p.reportedOn||null,precision:p.datePrecision||'unknown',source:p.source||'',identityAmbiguous:!!p.identityAmbiguous}));
 return [...join,...leave,...removed].sort((a,b)=>eventAge(a)-eventAge(b)||a.kind.localeCompare(b.kind));
}
function latest(x){return Math.min(...events(x).map(eventAge),Infinity)}
function formatEvent(e){
 const exact=date(e.recordedDay),approx=e.ageText?('~'+e.ageText):'???',shown=exact||approx,asOf=date(e.reportedOn);
 const explanation=exact?'Recorded calendar date · exact time unconfirmed':asOf?'Reported '+asOf+' · approximate':'Relative date only · exact date unknown';
 const typeClass=e.kind==='Removed'?'removal-event':e.kind==='Left'?'departure-event':'join-event';
 return '<div class="career-event '+typeClass+'"><span class="event-type">'+e.kind.toUpperCase()+' <small>NOTICE '+e.index+'</small></span><div class="event-content"><strong>'+esc(shown)+'</strong><small>'+esc(explanation)+(e.identityAmbiguous?' · Player identity unconfirmed':'')+'</small></div></div>';
}
function cardFor(x){const direct=x.cardId?cards.find(c=>c.card_id===x.cardId):null;return direct||cards.find(c=>norm(c.name)===norm(x.name))}
function render(){
 const q=norm($('search').value),filter=$('filter').value,sort=$('sort').value;
 const rows=records.filter(x=>{
   if(!norm(x.name).includes(q))return false;
   const joins=(x.periods||[]).length,leaves=(x.departures||[]).length,removals=(x.removals||[]).length;
   if(filter==='departed')return leaves>0||removals>0;
   if(filter==='voluntary')return leaves>0;
   if(filter==='removed')return removals>0;
   if(filter==='joined')return joins>0;
   if(filter==='leaveOnly')return (leaves>0||removals>0)&&!joins;
   if(filter==='repeat')return joins>1||leaves>1||removals>1;
   return filter==='all'||status(x)===filter;
 });
 rows.sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='periods'?(b.periods||[]).length-(a.periods||[]).length:sort==='departures'?((b.departures||[]).length+(b.removals||[]).length)-((a.departures||[]).length+(a.removals||[]).length):sort==='removals'?(b.removals||[]).length-(a.removals||[]).length:sort==='oldest'?latest(b)-latest(a):latest(a)-latest(b));
 $('careers').innerHTML=rows.length?rows.map(x=>{
   const c=cardFor(x),link=c?'<a class="cardlink" href="index.html">Willy Dex #'+esc(c.number)+'</a>':'';
   const js=(x.periods||[]).length,ls=(x.departures||[]).length,rs=(x.removals||[]).length,all=events(x);
   return '<article class="career"><header><div class="career-identity"><strong>'+esc(x.name)+'</strong> '+link+'<p class="career-counts">'+js+' joined · '+ls+' left · '+rs+' removed</p></div><span class="tag">'+(status(x)==='active'?'Current (confirmed)':status(x)==='former'?'Former (confirmed)':'Status unconfirmed')+'</span></header><div class="periods">'+all.map(formatEvent).join('')+'</div></article>';
 }).join(''):'<p class="muted">No records match this selection.</p>';
 const joins=records.reduce((n,x)=>n+(x.periods||[]).length,0),leaves=records.reduce((n,x)=>n+(x.departures||[]).length,0),removals=records.reduce((n,x)=>n+(x.removals||[]).length,0),repeats=records.filter(x=>(x.periods||[]).length>1||(x.departures||[]).length>1||(x.removals||[]).length>1).length;
 $('stats').innerHTML=[['Pirates on record',records.length],['Join notices',joins],['Left notices',leaves],['Removed notices',removals],['Repeat-notice histories',repeats],['Confirmed current',records.filter(x=>status(x)==='active').length],['Confirmed former',records.filter(x=>status(x)==='former').length]].map(([title,n])=>'<div class="stat"><span class="muted">'+esc(title)+'</span><b>'+fmt(n)+'</b></div>').join('');
}
Promise.all([
 fetch('pirate-careers.json?v='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Career registry unavailable');return r.json()}),
 fetch('cards.json?v='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():[])
]).then(([d,c])=>{records=d.members||[];cards=Array.isArray(c)?c:[];['search','filter','sort'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',render));render()}).catch(e=>$('careers').textContent=e.message);
