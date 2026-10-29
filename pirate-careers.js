'use strict';
/* Pirate Careers: read-only, source-grounded historical intelligence. */
(()=>{
const $=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const fmt=n=>Number(n).toLocaleString('en-US');
const norm=s=>String(s??'').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g,' ');
const REFERENCE_DATE='2026-10-29';
const REFERENCE_MS=Date.parse(REFERENCE_DATE+'T12:00:00Z');
const noData='<div class="empty">No matching records. Adjust the search or filters.</div>';
const tone={joined:'join',left:'left',removed:'removed'};
let pirates=[],allEvents=[],cardMap=new Map(),nameCards=new Map(),selected=null,priorFocus=null,registryLimit=24,eventLimit=40,alertTimer=0;
let state={query:'',filter:'all',sort:'recent',eventQuery:'',eventType:'all',eventPeriod:'all',eventSort:'newest'};

function dayOnly(str){
 const day=String(str||'').slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;
 const time=Date.parse(day+'T12:00:00Z');
 return Number.isFinite(time)?day:null;
}
function dateLabel(raw){
 const day=dayOnly(raw);return day?new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'}).format(new Date(day+'T12:00:00Z')):'';
}
function ageDays(age){
 const match=String(age||'').match(/(\d+)\s+(minute|hour|day|week|month|year)s?\b/i);
 if(!match)return Infinity;
 const unit=match[2].toLowerCase();return Number(match[1])*({minute:1/1440,hour:1/24,day:1,week:7,month:30.44,year:365.25}[unit]);
}
function eventDistance(e){
 if(e.ageText)return ageDays(e.ageText);
 const day=dayOnly(e.day);return day?Math.max(0,(REFERENCE_MS-Date.parse(day+'T12:00:00Z'))/86400000):Infinity;
}
function eventDate(e){return dateLabel(e.day)||(e.ageText?'~'+e.ageText:'Date unknown')}
function eventPrecision(e){
 const asOf=dateLabel(e.reportedOn)||'Oct 29, 2026';
 if(dayOnly(e.day))return (e.precision.includes('estimated')?'Day recorded; exact minute estimated':'Calendar day recorded; time unconfirmed');
 return e.ageText?'Approximate as reported '+asOf:'Time unknown';
}
function eventsFor(p){
 const rows=[],add=(list,kind,field)=>{
  for(let i=0;i<list.length;i++){
   const x=list[i]||{};
   rows.push({owner:p,kind,index:i+1,day:x[field]||null,ageText:x.ageText||null,
     reportedOn:x.reportedOn||x.reportedAt||(/2026-10-29/.test(x.source||'')?REFERENCE_DATE:null),
     source:x.source||'User-supplied SMMO guild notification',
     precision:String(x.datePrecision||'relative-only'),identityAmbiguous:!!(x.identityAmbiguous||p.identityAmbiguous),
     sourceIndex:rows.length});
  }
 };
 add(p.periods||[],'joined','joined');
 add(p.departures||[],'left','left');
 add(p.removals||[],'removed','removed');
 return rows;
}
function sortEvents(list,mode){
 const cmp=(a,b)=>eventDistance(a)-eventDistance(b);
 return list.slice().sort((a,b)=>mode==='name'?a.owner.name.localeCompare(b.owner.name)||cmp(a,b):
  mode==='oldest'? -cmp(a,b)||a.owner.name.localeCompare(b.owner.name):
  cmp(a,b)||a.owner.name.localeCompare(b.owner.name)||a.kind.localeCompare(b.kind)||a.index-b.index);
}
function cardFor(p){
 if(p.cardId){const linked=cardMap.get(p.cardId);if(linked&&norm(linked.name)===norm(p.name))return linked}
 return nameCards.get(norm(p.name))||null;
}
function counts(p){return {joined:(p.periods||[]).length,left:(p.departures||[]).length,removed:(p.removals||[]).length}}
function status(p){return p.membershipStatus==='current'?'current':p.membershipStatus==='former'?'former':'unknown'}
function statusLabel(p){return status(p)==='current'?'Confirmed current':status(p)==='former'?'Confirmed former':'Unconfirmed'}
function latestAge(p){return Math.min(Infinity,...p._events.map(eventDistance))}
function latestEvent(p){return sortEvents(p._events,'newest')[0]||null}

function bucket(e){
 const v=eventDistance(e);
 if(!Number.isFinite(v))return 'other';
 if(v<=31)return 'recent';
 if(v<4*30.44)return '2-3';
 if(v<7*30.44)return '4-6';
 if(v<10*30.44)return '7-9';
 if(v<12*30.44)return '10-11';
 if(v<2*365.25)return '1y';
 if(v<3*365.25)return '2y';
 if(v<4*365.25)return '3y';
 return '4y+';
}
const bucketTitles=[['recent','≤1 month'],['2-3','2–3 months'],['4-6','4–6 months'],['7-9','7–9 months'],['10-11','10–11 months'],['1y','1 year'],['2y','2 years'],['3y','3 years'],['4y+','4+ years']];
function stats(){
 const n={joined:0,left:0,removed:0},matched=pirates.filter(p=>cardFor(p)).length;
 for(const x of allEvents)n[x.kind]++;
 const reliable=allEvents.filter(x=>dayOnly(x.day)).length;
 const repeats=pirates.filter(p=>p._events.length>1).length;
 const values=[
  ['Pirates on record',pirates.length,'Distinct displayed names'],
  ['Total notices',allEvents.length,'Captured event messages'],
  ['Joined',n.joined,'Guild entry notices'],
  ['Left',n.left,'Departed guild voluntarily'],
  ['Removed',n.removed,'Removed from guild'],
  ['Multiple notices',repeats,'Repeat mentions, not service periods'],
  ['Card matches',matched,'Linked to existing Willy Dex cards'],
  ['Recorded dates',reliable,'Day known; most reports approximate']
 ];
 $('stats').innerHTML=values.map(([label,value,detail])=>'<article class="stat"><span class="small">'+escape(label)+'</span><strong>'+fmt(value)+'</strong><span class="detail">'+escape(detail)+'</span></article>').join('');
 $('archiveLabel').textContent=fmt(allEvents.length)+' notifications · Source reference Oct 29, 2026';
 $('evidenceCount').textContent=fmt(allEvents.length-reliable)+' relative-age reports';
 const total=allEvents.length||1;
 $('donutTotal').textContent=fmt(allEvents.length);
 $('eventDonut').style.background='conic-gradient(var(--join) 0% '+(n.joined/total*100)+'%,var(--left) '+(n.joined/total*100)+'% '+((n.joined+n.left)/total*100)+'%,var(--removed) '+((n.joined+n.left)/total*100)+'% 100%)';
 $('eventDonut').setAttribute('aria-label',fmt(n.joined)+' joins, '+fmt(n.left)+' voluntary departures, '+fmt(n.removed)+' removals');
 $('eventLegend').innerHTML=[['joined','Joined',n.joined],['left','Left',n.left],['removed','Removed',n.removed]].map(([key,title,val])=>'<button type="button" class="legend-row linklike" data-kind="'+key+'" title="View '+title.toLowerCase()+' event notices"><span><i class="dot '+tone[key]+'"></i>'+title+'</span><strong>'+fmt(val)+'</strong></button>').join('');

 const groups=bucketTitles.map(([id,label])=>{
  const list=allEvents.filter(e=>bucket(e)===id);
  return {id,label,joined:list.filter(e=>e.kind==='joined').length,left:list.filter(e=>e.kind==='left').length,removed:list.filter(e=>e.kind==='removed').length,total:list.length};
 });
 const max=Math.max(1,...groups.map(x=>x.total));
 $('ageBars').innerHTML=groups.map(x=>{
  const width=100*x.total/max;
  const segments=['joined','left','removed'].map(k=>x[k]?'<button type="button" class="stack-seg '+tone[k]+'" style="width:'+(x[k]/x.total*100)+'%" data-age="'+x.id+'" data-kind="'+k+'" title="'+escape(x.label+' · '+fmt(x[k])+' '+k+' notices')+'" aria-label="'+escape('Show '+fmt(x[k])+' '+k+' notices reported '+x.label+' ago')+'"></button>':'').join('');
  return '<div class="age-row"><span class="age-label">'+x.label+'</span><div class="stack-track"><div class="age-stack" style="width:'+width.toFixed(2)+'%">'+segments+'</div></div><strong class="age-total">'+fmt(x.total)+'</strong></div>';
 }).join('');

 const newest=sortEvents(allEvents,'newest').filter(e=>!e.identityAmbiguous)[0];
 const mostJoins=pirates.filter(p=>!p.identityAmbiguous).sort((a,b)=>counts(b).joined-counts(a).joined||a.name.localeCompare(b.name))[0];
 const mostRemovals=pirates.filter(p=>!p.identityAmbiguous).sort((a,b)=>counts(b).removed-counts(a).removed||a.name.localeCompare(b.name))[0];
 const insights=[
  {title:'LATEST RECORDED NOTICE',name:newest?.owner.name||'???',description:newest?newest.kind.toUpperCase()+' · '+eventDate(newest):'No record'},
  {title:'MOST JOIN NOTICES',name:mostJoins?.name||'???',description:fmt(counts(mostJoins||{}).joined)+' documented join notifications'},
  {title:'MOST REMOVAL NOTICES',name:mostRemovals?.name||'???',description:fmt(counts(mostRemovals||{}).removed)+' documented removal notifications'}
 ];
 $('insights').innerHTML=insights.map(x=>'<button class="insight" type="button" data-open="'+encodeURIComponent(x.name)+'"><span>'+x.title+'</span><strong>'+escape(x.name)+'</strong><small>'+escape(x.description)+'</small></button>').join('');
}
function hydrate(){
 for(const p of pirates)p._events=eventsFor(p);
 allEvents=pirates.flatMap(p=>p._events);
 stats();renderRegistry();renderLedger();openFromHash();
}
function matchRegistry(p){
 const card=cardFor(p),q=state.query;
 const terms=[p.name,card?.number||'',...(card?.aliases||[]),card?.type||''].join(' ').toLocaleLowerCase();
 if(q&&!norm(terms).includes(q))return false;
 const c=counts(p),f=state.filter;
 return f==='all'||(f==='carded'&&!!card)||(f==='active'&&status(p)==='current')||(f==='unknown'&&status(p)==='unknown')||
  (f==='joins'&&c.joined>0)||(f==='left'&&c.left>0)||(f==='removed'&&c.removed>0)||
  (f==='exits'&&(c.left+c.removed)>0)||(f==='nojoin'&&(c.left+c.removed)>0&&c.joined===0)||(f==='repeat'&&p._events.length>1);
}
function compareRegistry(a,b){
 const sa=counts(a),sb=counts(b);
 const sort=state.sort;
 if(sort==='name')return a.name.localeCompare(b.name);
 if(sort==='events')return b._events.length-a._events.length||a.name.localeCompare(b.name);
 if(sort==='joins')return sb.joined-sa.joined||a.name.localeCompare(b.name);
 if(sort==='exits')return sb.left+sb.removed-sa.left-sa.removed||a.name.localeCompare(b.name);
 if(sort==='oldest')return latestAge(b)-latestAge(a)||a.name.localeCompare(b.name);
 return latestAge(a)-latestAge(b)||a.name.localeCompare(b.name);
}
function registryCard(p){
 const c=counts(p),card=cardFor(p),newest=latestEvent(p);
 return '<article class="pirate"><div class="pirate-head"><div><button class="pirate-name linklike" data-open="'+encodeURIComponent(p.name)+'" type="button">'+escape(p.name)+'</button><div class="pirate-meta">'+(card?'WILLY DEX #'+escape(card.number):'HISTORICAL RECORD')+(p.identityAmbiguous?' · IDENTITIES MAY DIFFER':'')+'</div></div><span class="status '+status(p)+'">'+statusLabel(p)+'</span></div>'+
 '<div class="mini-stats"><span class="mini-stat"><i class="dot join"></i><b>'+c.joined+'</b> Joined</span><span class="mini-stat"><i class="dot left"></i><b>'+c.left+'</b> Left</span><span class="mini-stat"><i class="dot removed"></i><b>'+c.removed+'</b> Removed</span></div>'+
 '<div class="event-summary"><span>Latest: '+escape(newest?eventDate(newest):'No event')+'</span>'+(card?'<span class="card-tag">CARD #'+escape(card.number)+'</span>':'<span>ARCHIVED ONLY</span>')+'</div></article>';
}
function renderRegistry(){
 const matches=pirates.filter(matchRegistry).sort(compareRegistry),shown=matches.slice(0,registryLimit);
 $('registryCount').textContent=fmt(matches.length)+' matching pirates';
 $('registryShowing').textContent='Showing '+fmt(shown.length)+' of '+fmt(matches.length);
 $('registryList').innerHTML=shown.length?shown.map(registryCard).join(''):noData;
 $('registryMore').hidden=shown.length>=matches.length;
 $('registryMore').textContent='Show more pirates · '+fmt(matches.length-shown.length)+' remaining';
 for(const b of $('quickFilters').querySelectorAll('[data-quick]'))b.setAttribute('aria-pressed',String(b.dataset.quick===state.filter));
}
function eventPeriodMatch(e){
 if(state.eventPeriod==='all')return true;
 if(state.eventPeriod.startsWith('bucket:'))return bucket(e)===state.eventPeriod.slice(7);
 const d=eventDistance(e);
 if(state.eventPeriod==='recent')return d<=31;
 if(state.eventPeriod==='mid')return d>31&&d<365;
 if(state.eventPeriod==='year')return d>=365&&d<730;
 return d>=730;
}
function renderLedger(){
 const matches=sortEvents(allEvents.filter(e=>{
  if(state.eventType!=='all'&&e.kind!==state.eventType)return false;
  if(!eventPeriodMatch(e))return false;
  return !state.eventQuery||norm(e.owner.name).includes(state.eventQuery);
 }),state.eventSort);
 const shown=matches.slice(0,eventLimit);
 $('ledgerCount').textContent=fmt(matches.length)+' matching events';
 $('ledgerShowing').textContent='Showing '+fmt(shown.length)+' of '+fmt(matches.length);
 $('eventList').innerHTML=shown.length?shown.map(e=>
  '<article class="ledger-row"><span class="ledger-kind '+tone[e.kind]+'">'+e.kind.toUpperCase()+'</span>'+
  '<button type="button" class="ledger-name linklike" data-open="'+encodeURIComponent(e.owner.name)+'">'+escape(e.owner.name)+'</button>'+
  '<span class="ledger-age">'+escape(eventDate(e))+'<small>'+escape(eventPrecision(e))+'</small></span>'+
  '<button type="button" class="ledger-action" data-open="'+encodeURIComponent(e.owner.name)+'">Inspect</button></article>'
 ).join(''):noData;
 $('eventMore').hidden=shown.length>=matches.length;
 $('eventMore').textContent='Show more notices · '+fmt(matches.length-shown.length)+' remaining';
}
function profileText(p){
 const ev=sortEvents(p._events,'oldest'),c=counts(p),card=cardFor(p);
 const title='PIRATE COVE · '+p.name+'\n'+c.joined+' joined / '+c.left+' left / '+c.removed+' removed\nStatus: '+statusLabel(p);
 return title+'\n'+ev.map(x=>x.kind.toUpperCase()+' · '+eventDate(x)+' · '+eventPrecision(x)).join('\n')+
 '\nThese are source-reported notices, not verified membership durations.'+
 (card&&dayOnly(card.smmo_joined)?'\nSMMO account created: '+dateLabel(card.smmo_joined):'');
}
function profile(p){
 const card=cardFor(p),c=counts(p),sorted=sortEvents(p._events,'oldest');
 const joinDate=card&&dayOnly(card.smmo_joined)?dateLabel(card.smmo_joined):'???';
 $('profileContent').innerHTML=
 '<h2 id="profileHeading" class="profile-title">'+escape(p.name)+'</h2>'+
 '<p class="profile-intro">'+(card?'Verified Willy Dex #'+escape(card.number)+' · '+escape(card.type||'Guild card'):'Historical player · No Willy Dex card')+
 ' · '+escape(statusLabel(p))+(p.identityAmbiguous?' · Name shared by potentially distinct accounts':'')+'</p>'+
 '<div class="profile-stats"><div class="profile-stat"><strong>'+c.joined+'</strong><span>JOIN NOTICES</span></div>'+
 '<div class="profile-stat"><strong>'+c.left+'</strong><span>LEFT NOTICES</span></div>'+
 '<div class="profile-stat"><strong>'+c.removed+'</strong><span>REMOVAL NOTICES</span></div></div>'+
 '<div class="profile-links">'+(card?'<a class="profile-link" href="index.html">Willy Dex card #'+escape(card.number)+'</a>':'')+
 '<button type="button" class="copy-profile" id="copyProfile">Copy career summary</button></div>'+
 (card?'<p class="profile-intro" style="margin-top:14px">SMMO account join date: <strong>'+escape(joinDate)+'</strong> · Separate from guild entry</p>':'')+
 '<div class="profile-section-label">RECORDED CAREER TIMELINE · OLDEST FIRST</div>'+
 '<div class="timeline">'+sorted.map(e=>
 '<div class="timeline-item '+tone[e.kind]+'"><div class="kind">'+e.kind.toUpperCase()+' · NOTICE '+e.index+'</div>'+
 '<strong>'+escape(eventDate(e))+'</strong><small>'+escape(eventPrecision(e))+'</small>'+
 (e.identityAmbiguous?'<small>Unconfirmed identity; “Deleted” notices may belong to different accounts.</small>':'')+
 '<small>Source: '+escape(e.source)+'</small></div>').join('')+'</div>'+
 '<p class="disclaimer">Timeline order is approximate when dates share broad labels, e.g. “1 year ago.” Repeated joins and exits are not paired into invented service periods. Present membership cannot be inferred from old events.</p>';
 $('copyProfile').onclick=async()=>{
  try{
   if(!navigator.clipboard?.writeText)throw Error('Clipboard not available');
   await navigator.clipboard.writeText(profileText(p));notify('Career summary copied');
  }catch(e){notify('Clipboard blocked by browser','error')}
 };
}
function notify(message,type='success'){
 const toast=$('toast');toast.textContent=message;toast.classList.toggle('error',type==='error');toast.hidden=false;
 clearTimeout(alertTimer);alertTimer=setTimeout(()=>{toast.hidden=true},3400);
}
function openProfile(name,updateHash=true){
 const p=pirates.find(x=>norm(x.name)===norm(name));if(!p)return;
 selected=p;priorFocus=document.activeElement;
 profile(p);$('profileOverlay').hidden=false;document.body.style.overflow='hidden';$('profileClose').focus();
 if(updateHash){
  const next='#pirate/'+encodeURIComponent(p.name);
  if(location.hash!==next)history.replaceState(null,'',next);
 }
}
function closeProfile(updateHash=true){
 $('profileOverlay').hidden=true;document.body.style.overflow='';
 selected=null;
 if(updateHash&&location.hash.startsWith('#pirate/'))history.replaceState(null,'','#registry');
 if(priorFocus&&typeof priorFocus.focus==='function')priorFocus.focus();
}
function openFromHash(){
 if(location.hash.startsWith('#pirate/')){
  try{openProfile(decodeURIComponent(location.hash.slice(8)),false)}catch(e){}
 }else if(selected){closeProfile(false)}
}
function wire(){
 $('search').oninput=e=>{state.query=norm(e.target.value);registryLimit=24;renderRegistry()};
 $('filter').onchange=e=>{state.filter=e.target.value;registryLimit=24;renderRegistry()};
 $('sort').onchange=e=>{state.sort=e.target.value;registryLimit=24;renderRegistry()};
 $('registryMore').onclick=()=>{registryLimit+=24;renderRegistry()};
 $('quickFilters').addEventListener('click',e=>{
  const button=e.target.closest('[data-quick]');if(!button)return;
  state.filter=button.dataset.quick;$('filter').value=state.filter;registryLimit=24;renderRegistry();
 });
 $('eventSearch').oninput=e=>{state.eventQuery=norm(e.target.value);eventLimit=40;renderLedger()};
 $('eventType').onchange=e=>{state.eventType=e.target.value;eventLimit=40;renderLedger()};
 $('eventPeriod').onchange=e=>{state.eventPeriod=e.target.value;eventLimit=40;renderLedger()};
 $('eventSort').onchange=e=>{state.eventSort=e.target.value;eventLimit=40;renderLedger()};
 $('eventMore').onclick=()=>{eventLimit+=40;renderLedger()};
 document.addEventListener('click',e=>{
  const profileButton=e.target.closest('[data-open]');if(profileButton){
   try{openProfile(decodeURIComponent(profileButton.dataset.open))}catch(err){notify('Could not open pirate','error')}
   return;
  }
  const kind=e.target.closest('[data-kind]');if(kind&&!kind.closest('.pirate')&&!kind.closest('.ledger-row')){
   state.eventType=kind.dataset.kind;$('eventType').value=state.eventType;
   if(kind.dataset.age){
    const b=kind.dataset.age;state.eventPeriod='bucket:'+b;
    $('eventPeriod').value=state.eventPeriod;
   }else{state.eventPeriod='all';$('eventPeriod').value='all'}
   eventLimit=40;renderLedger();location.hash='ledger';
  }
 });
 $('profileClose').onclick=()=>closeProfile();
 $('profileShade').onclick=()=>closeProfile();
 document.addEventListener('keydown',e=>{
  if($('profileOverlay').hidden)return;
  if(e.key==='Escape'){e.preventDefault();closeProfile()}
  if(e.key==='Tab'){
   const dialog=$('profileOverlay').querySelector('.profile-panel');
   const focusables=[...dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled])')];
   if(focusables.length){const first=focusables[0],last=focusables[focusables.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}
  }
 });
 window.addEventListener('hashchange',openFromHash);
}
async function init(){
 wire();
 try{
  const [d,cardData]=await Promise.all([
   fetch('pirate-careers.json?updated='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Career archive unavailable');return r.json()}),
   fetch('cards.json?updated='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():[])
  ]);
  pirates=Array.isArray(d.members)?d.members:[];
  const cards=Array.isArray(cardData)?cardData:[];
  cardMap=new Map(cards.filter(c=>c.card_id&&c.name&&c.name!=='???').map(c=>[c.card_id,c]));
  nameCards=new Map(cards.filter(c=>c.name&&c.name!=='???').map(c=>[norm(c.name),c]));
  hydrate();
 }catch(e){
  $('stats').innerHTML='<div class="empty">'+escape(e.message)+'</div>';
  $('registryList').innerHTML='<div class="empty">The archive could not be loaded.</div>';
  $('eventList').innerHTML='<div class="empty">The event ledger could not be loaded.</div>';
 }
}
init();
})();