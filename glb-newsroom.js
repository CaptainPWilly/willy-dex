'use strict';
(()=>{const $=id=>document.getElementById(id),fmt=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:2}),sign=n=>(n>0?'+':'')+fmt(n),safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=s=>s.capturedAt?new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(s.capturedAt)):s.date+' · time unconfirmed';
let snaps=[],pageSize=14,allStories=[],displayCount=pageSize;
const byName=s=>new Map(s.guilds.map(g=>[g.name,g]));
function diff(prev,next){
 const old=byName(prev),now=byName(next),both=[...now.values()].filter(g=>old.has(g.name)).map(g=>{
  const p=old.get(g.name);return {name:g.name,rank:g.rank,priorRank:p.rank,xp:g.experience,priorXp:p.experience,change:g.experience-p.experience,movement:p.rank-g.rank,kind:'matched'};
 });
 const entrants=[...now.values()].filter(g=>!old.has(g.name)).map(g=>({name:g.name,rank:g.rank,xp:g.experience,kind:'entry'}));
 const departures=[...old.values()].filter(g=>!now.has(g.name)).map(g=>({name:g.name,priorRank:g.rank,priorXp:g.experience,kind:'exit'}));
 return {both,entrants,departures,prev,next};
}
const compare=(a,b)=>diff(snaps[a],snaps[b]);
function chosenPeriods(){const scope=$('newsScope').value,n=snaps.length;if(scope==='archive')return Array.from({length:n-1},(_,i)=>compare(i,i+1)).reverse();if(scope==='compare'){let a=Number($('newsFrom').value),b=Number($('newsTo').value);if(a>b)[a,b]=[b,a];return a===b?[]:[compare(a,b)]}return n>1?[compare(n-2,n-1)]:[]}
function makeStories(pair,index){
 const out=[],date=time(pair.next),past=time(pair.prev),interval=pair.prev.capturedAt&&pair.next.capturedAt?date+' · since '+past:date+' · prior time unconfirmed';
 const add=(cat,g,title,body,value,delta,rankMovement,priority=0)=>out.push({cat,name:g,title,body,value,delta,rankMovement,date,interval,index,priority});
 for(const g of pair.both){
  if(g.movement!==0){const direction=g.movement>0?'climbed':'fell';add('rank',g.name,g.name+' '+direction+' '+Math.abs(g.movement)+' '+(Math.abs(g.movement)===1?'place':'places'), 'Moved from #'+g.priorRank+' to #'+g.rank+'. '+(g.change===0?'Total recorded EXP was unchanged.':'Observed EXP '+(g.change>0?'increased by ':'changed by ')+sign(g.change)+'.'), '#'+g.priorRank+' → #'+g.rank,g.change,g.movement,2)}
  else if(g.change!==0){add('xp',g.name,g.name+(g.change>0?' gained '+fmt(g.change)+' EXP':' changed EXP by '+sign(g.change)), 'Held rank #'+g.rank+' while its recorded total moved from '+fmt(g.priorXp)+' to '+fmt(g.xp)+' EXP.',sign(g.change)+' EXP',g.change,0,1)}
  else {add('steady',g.name,g.name+' unchanged at #'+g.rank,'Both recorded rank and EXP total remained unchanged between these two snapshots.','#'+g.rank+' · '+fmt(g.xp)+' EXP',0,0,0)}
 }
 for(const g of pair.entrants)add('entry',g.name,g.name+' appears in tracked Top 50','First observed in this comparison at #'+g.rank+' with '+fmt(g.xp)+' EXP. Previous placement and EXP are not known.','Now #'+g.rank,0,0,2);
 for(const g of pair.departures)add('entry',g.name,g.name+' no longer appears in tracked Top 50','Previously recorded at #'+g.priorRank+' with '+fmt(g.priorXp)+' EXP. Later position and EXP are unknown.','Previously #'+g.priorRank,0,0,2);
 return out;
}
function storySort(a,b){
 const sort=$('newsSort').value;
 if(sort==='guild')return a.name.localeCompare(b.name)||b.index-a.index;
 if(sort==='xp')return Math.abs(b.delta)-Math.abs(a.delta)||b.index-a.index;
 if(sort==='rank')return Math.abs(b.rankMovement)-Math.abs(a.rankMovement)||b.index-a.index;
 return b.index-a.index||b.priority-a.priority||Math.abs(b.rankMovement)-Math.abs(a.rankMovement)||Math.abs(b.delta)-Math.abs(a.delta)||a.name.localeCompare(b.name);
}
function renderFeed(periods){
 const cat=$('newsCategory').value,search=$('newsSearch').value.trim().toLocaleLowerCase();
 const storyRows=periods.flatMap(p=>makeStories(p,snaps.indexOf(p.next)));
 allStories=storyRows.filter(e=>(cat==='all'||e.cat===cat)&&(!search||(e.name+' '+e.title+' '+e.body).toLocaleLowerCase().includes(search))).sort(storySort);
 $('newsCount').textContent=fmt(allStories.length)+' reports · '+fmt(storyRows.length)+' observed guild comparisons';
 $('newsFeed').innerHTML=allStories.slice(0,displayCount).map(s=>'<article class="news-story"><div class="meta"><span class="category">'+safe({rank:'PLACEMENT',xp:'EXPERIENCE',entry:'TOP 50',steady:'UNCHANGED'}[s.cat])+'</span><span>'+safe(s.date)+'</span></div><h4>'+safe(s.title)+'</h4><p>'+safe(s.body)+'</p><span class="fig">'+safe(s.value)+'</span></article>').join('')||'<div class="news-empty">No reports match these filters.</div>';
 $('newsMore').hidden=allStories.length<=displayCount;
 $('newsMore').textContent='Show more reports ('+fmt(allStories.length-displayCount)+' remaining)';
}
function bars(data,maxItems=6){
 const source=data.filter(g=>g.change>0).sort((a,b)=>b.change-a.change).slice(0,maxItems),top=source[0]?.change||1;
 return source.map(g=>'<div class="news-bar-row" title="'+safe(g.name)+'"><span class="n">'+safe(g.name)+'</span><div class="news-bar-track"><div class="news-bar-fill" style="width:'+Math.max(1,100*g.change/top).toFixed(1)+'%"></div></div><span class="v">+'+fmt(g.change)+'</span></div>').join('')||'<p class="news-empty">No EXP increases recorded in this comparison.</p>';
}
function moverList(data){
 const movers=data.filter(g=>g.movement!==0).sort((a,b)=>Math.abs(b.movement)-Math.abs(a.movement)||Math.abs(b.change)-Math.abs(a.change)).slice(0,6);
 return movers.map(g=>'<div class="news-mover-row"><span><span class="m-name">'+safe(g.name)+'</span><br><small>#'+g.priorRank+' → #'+g.rank+'</small></span><span class="m-change '+(g.movement<0?'down':'')+'">'+(g.movement>0?'▲ ':'▼ ')+Math.abs(g.movement)+'</span></div>').join('')||'<p class="news-empty">No rank movements recorded in this comparison.</p>';
}
function pressure(s){
 const a=s.guilds.slice().sort((x,y)=>x.rank-y.rank).slice(0,10),r=a.map((g,i)=>({g,gap:i?g.experience-a[i-1].experience:null}));
 return r.map(({g,gap})=>'<div class="news-mover-row"><span class="m-name">#'+g.rank+' '+safe(g.name)+'</span><span class="m-change flat">'+(gap===null?'LEADER':fmt(Math.abs(gap))+' behind')+'</span></div>').join('');
}
function coveWatch(p){
 const last=p.next.guilds.find(g=>g.name==='The Pirate Cove'),past=p.prev.guilds.find(g=>g.name==='The Pirate Cove');
 if(!last)return '<p class="news-empty">The Pirate Cove is not observed in the latest selected Top 50.</p>';
 const opponent=p.next.guilds.find(g=>g.rank===last.rank-1),below=p.next.guilds.find(g=>g.rank===last.rank+1);
 const xpDelta=past?last.experience-past.experience:null,rankDelta=past?past.rank-last.rank:null;
 return '<div class="news-cove-big">#'+last.rank+' <small>'+fmt(last.experience)+' EXP</small></div><div class="news-cove-grid">'+
 '<div>EXP change<strong>'+(xpDelta===null?'Not comparable':sign(xpDelta))+'</strong></div>'+
 '<div>Rank movement<strong>'+(rankDelta===null?'Not comparable':rankDelta===0?'Unchanged':(rankDelta>0?'▲ +':'▼ ')+rankDelta)+'</strong></div>'+
 '<div>To next rank<strong>'+(opponent?fmt(opponent.experience-last.experience)+' EXP':'At #1')+'</strong></div>'+
 '<div>Lead over next<strong>'+(below?fmt(last.experience-below.experience)+' EXP':'#50 boundary')+'</strong></div></div>';
}
function hero(p){
 const gainers=p.both.filter(g=>g.change>0).sort((a,b)=>b.change-a.change),movers=p.both.filter(g=>g.movement>0).sort((a,b)=>b.movement-a.movement),largest=gainers[0];
 const title=largest?largest.name+' leads observed EXP gains':p.entrants.length?'Top 50 lineup changes in latest comparison':'Latest standings: recorded changes';
 const body=largest?'Between '+time(p.prev)+' and '+time(p.next)+', '+largest.name+' gained '+fmt(largest.change)+' EXP'+(movers.length?'; '+movers[0].name+' recorded the largest upward rank move ('+movers[0].movement+' places).':'.'): 'Coverage is limited to the exact snapshot pair selected.';
 return '<span class="news-eyeline">LATEST SNAPSHOT REPORT · '+safe(time(p.next))+'</span><h3>'+safe(title)+'</h3><p>'+safe(body)+'</p>';
}
function kpis(p){
 const matched=p.both,add=matched.reduce((n,g)=>n+g.change,0),top=matched.slice().sort((a,b)=>b.change-a.change)[0],movers=matched.filter(g=>g.movement!==0),c=matched.find(g=>g.name==='The Pirate Cove');
 const cards=[
 ['Observed net EXP',sign(add),matched.length+' guilds present in both snapshots'],
 ['EXP leader',top?safe(top.name):'—',top?sign(top.change)+' EXP':'No comparable guilds'],
 ['Rank movers',fmt(movers.length),movers.filter(g=>g.movement>0).length+' up · '+movers.filter(g=>g.movement<0).length+' down'],
 ['Pirate Cove',c?'#'+c.rank:'Unobserved',c?sign(c.change)+' EXP · '+(c.movement>0?'up '+c.movement:c.movement<0?'down '+Math.abs(c.movement):'rank unchanged'):'Not in both snapshots']
 ];
 return cards.map(([title,val,sub])=>'<div class="news-kpi"><div class="t">'+title+'</div><div class="v">'+val+'</div><div class="sub">'+sub+'</div></div>').join('');
}
function chronology(){
 const rows=snaps.slice().reverse();$('newsTimeline').innerHTML=rows.map((s,idx)=>{const i=snaps.indexOf(s),prev=i?snaps[i-1]:null;const d=prev?diff(prev,s):null;const changes=d?d.both.filter(g=>g.movement!==0).length:0;return '<div class="news-timeline-item"><span class="when">'+safe(time(s))+'</span><span class="detail">'+s.guilds.length+' recorded guilds'+(d?' · '+changes+' rank movements · '+d.entrants.length+' newly observed':' · First archive observation')+'</span></div>'}).join('');
}
function render(){
 const scope=$('newsScope').value,periods=chosenPeriods(),p=periods[0];
 $('newsFromWrap').hidden=$('newsToWrap').hidden=scope!=='compare';
 $('newsDateline').textContent=fmt(snaps.length)+' verified captures · latest '+time(snaps.at(-1));
 if(p){
 $('newsHero').innerHTML=hero(p);$('newsKpis').innerHTML=kpis(p);
 $('newsGainers').innerHTML=bars(p.both);$('newsMovers').innerHTML=moverList(p.both);
 $('newsPressure').innerHTML=pressure(p.next);$('newsCove').innerHTML=coveWatch(p);
 }else{
 $('newsHero').innerHTML='<h3>Select two different snapshots</h3><p>Compare recorded captures to view the intelligence breakdown.</p>';
 for(const id of ['newsKpis','newsGainers','newsMovers','newsPressure','newsCove'])$(id).innerHTML='';
 }
 renderFeed(periods);
}
fetch('glb.json?v='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Could not load GLB archive');return r.json()}).then(doc=>{
 snaps=(doc.snapshots||[]).filter(s=>(s.season||doc.season)===doc.season).sort((a,b)=>Date.parse(a.capturedAt||a.date)-Date.parse(b.capturedAt||b.date));
 if(!snaps.length)throw Error('No recorded snapshots');
 for(const id of ['newsFrom','newsTo'])$(id).innerHTML=snaps.map((s,i)=>'<option value="'+i+'">'+safe(time(s))+'</option>').join('');
 $('newsFrom').value=String(Math.max(0,snaps.length-2));$('newsTo').value=String(snaps.length-1);
 $('newsScope').onchange=()=>{displayCount=pageSize;render()};
 for(const id of ['newsFrom','newsTo','newsCategory','newsSort'])$(id).onchange=()=>{displayCount=pageSize;render()};
 $('newsSearch').oninput=()=>{displayCount=pageSize;render()};
 $('newsMore').onclick=()=>{displayCount+=pageSize;renderFeed(chosenPeriods())};
 chronology();render();
 }).catch(e=>{$('newsHero').innerHTML='<p class="news-empty">'+safe(e.message)+'</p>'});
})();
