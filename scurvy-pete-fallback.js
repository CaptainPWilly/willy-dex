'use strict';

const {seasonIntel,captures,resolveGuildNames}=require('./scurvy-pete-season15');
const GLB_LINK='https://captainpwilly.github.io/willy-dex/glb.html';
const CARDS_LINK='https://captainpwilly.github.io/willy-dex/index.html';
const fmt=n=>Number(n).toLocaleString('en-US');
const norm=v=>String(v??'').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const word=(text,w)=>new RegExp('(?:^| )'+w+'(?: |$)').test(text);
const time=v=>new Date(v).toLocaleString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const numberString=(name,r)=>name+' was #'+r.rank+' with '+fmt(r.gxp)+' GXP';
const sources=kind=>[{id:kind,title:kind==='glb'?'Global Leaderboard':'Cards',url:kind==='glb'?GLB_LINK:CARDS_LINK}];
const wrap=(answer,kind)=>({answer:answer+'\n[Archive-only response; conversational AI temporarily unavailable.]',sources:sources(kind),evidence:'offline-archive',model:'archive-calculation'});

// Deliberately conservative parsing. Archive-only mode does not guess a
// player's identity, unrecorded rankings, or missing capture dates.
function dateFrom(text,capturesList){
  const raw=String(text||'');
  const normalized=norm(raw);
  const iso=raw.match(/\b20\d{2}-\d\d-\d\d\b/);
  if(iso)return iso[0];
  const months={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
  const m=normalized.match(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:\s+(20\d{2}))?\b/);
  if(!m)return null;
  const y=Number(m[3]||String(capturesList.at(-1)?.capturedAt||'').slice(0,4)||2026),mon=months[m[1]],day=Number(m[2]);
  const parsed=new Date(Date.UTC(y,mon-1,day));
  if(parsed.getUTCFullYear()!==y||parsed.getUTCMonth()!==mon-1||parsed.getUTCDate()!==day)return null;
  return [y,String(mon).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
}
function latestUserQuestion(history){
  return history.slice().reverse().find(x=>x.role==='user'&&typeof x.content==='string')?.content||'';
}
function explicitNames(q,glb){
  const all=[...new Set(captures(glb).flatMap(s=>s.guilds.map(g=>g.name)))];
  const n=norm(q),names=[];
  for(const g of all.sort((a,b)=>b.length-a.length)){
    const key=norm(g);
    if(key&&(' '+n+' ').includes(' '+key+' ')&&!names.some(x=>norm(x)===key))names.push(g);
  }
  // "Cove" must not be confused with "Coven".
  if(/(?:^| )(?:cove|arg|our guild)(?: |$)/.test(n)&&!names.some(x=>norm(x)==='the pirate cove'))
    names.push('The Pirate Cove');
  return resolveGuildNames(all,names).found;
}
function summarizeGuild(g){
  const first=g.firstObserved,last=g.lastObserved;
  if(!first)return g.name+': no recorded top-50 placements.';
  let result=g.name+': '+g.appearances+' recorded top-50 appearances; best #'+g.bestRecordedRank+
    ', worst #'+g.worstRecordedRank+'. First observed '+time(first.capturedAt)+': #'+first.rank+
    ' with '+fmt(first.gxp)+' GXP. Last observed '+time(last.capturedAt)+': #'+last.rank+
    ' with '+fmt(last.gxp)+' GXP.';
  if(first!==last)result+=' Gained '+fmt(g.firstToLastObservedGain)+' GXP and '+(g.firstToLastRankChange>=0?'improved':'fell')+
    ' '+Math.abs(g.firstToLastRankChange)+' rank positions between those two observed captures.';
  if(!g.latest)result+=' Not present in the latest archived top 50; current position and GXP are unknown.';
  return result;
}
function fallbackGLB(message,history,glb){
  const ss=captures(glb);
  if(!ss.length)return null;
  const lastQuestion=latestUserQuestion(history);
  const q=norm(message),past=norm(lastQuestion);
  const explicit=explicitNames(message,glb);
  const fromPrevious=explicitNames(lastQuestion,glb);
  const subject=explicit.length?explicit:fromPrevious.length?fromPrevious:[];
  const isQuestion=/\b(?:glb|gxp|xp|experience|leaderboard|season|rank|ranking|placement|place|guilds?|stats|history|performance|trend|ahead|behind|gain|gain|growth|compare|comparison|difference|best|worst|closest)\b/.test(q+' '+past);
  if(!subject.length&&!isQuestion)return null;
  const selected=subject.length?subject:['The Pirate Cove'];
  const lookback=/\b(?:and|what about|how about|same|them|those|their|they|it|instead)\b/.test(q);
  const names=explicit.length?explicit:lookback?fromPrevious:subject;
  const targetNames=names.length?names:['The Pirate Cove'];
  const date=dateFrom(message,ss);
  const dateRequested=!!date;
  const wantsHistory=/\b(?:history|historical|over time|every|all snapshots|season progress|throughout|trajectory|best rank|worst rank|peak|progression)\b/.test(q+' '+(lookback?past:''));
  const wantsCompare=/\b(?:compare|vs|versus|against|gap|apart|ahead|behind|who leads|race between|difference)\b/.test(q);
  const wantsGains=/\b(?:gain|gained|grew|growth|change|changed|increased|earned|from .* to|since)\b/.test(q);
  const wantsTop=/\b(?:top \d+|top ten|top five|leaders|leaderboard|standings|rankings)\b/.test(q);
  const makeArgs=(mode,rest={})=>({mode,guilds:targetNames,at:date,from:null,to:null,sort:'gain',limit:50,...rest});
  if(wantsHistory){
    const hist=seasonIntel(glb,makeArgs('history'));
    if(hist.error)return wrap(hist.error,'glb');
    const body=hist.guilds.map(summarizeGuild).join('\n');
    return wrap('Season 15 captured history ('+hist.captureCount+' snapshots through '+time(hist.latestCapturedAt)+'):\n'+body+'\nThese are observed captures, not a continuous live feed.','glb');
  }
  if(wantsCompare&&targetNames.length>=2){
    const result=seasonIntel(glb,makeArgs('matchup'));
    if(result.error)return wrap(result.error,'glb');
    const listed=result.participants.map(x=>x.present?numberString(x.name,x):x.name+': absent from this top-50 snapshot (rank unknown).').join('; ');
    const pairs=result.gapToSelectedLeader.filter(x=>x.behindLeaderGxp>0);
    return wrap('Season 15 on '+time(result.capturedAt)+': '+listed+
      (pairs.length?' '+pairs.map(x=>x.name+' trailed the selected leader by '+fmt(x.behindLeaderGxp)+' GXP.').join(' '):''),'glb');
  }
  if(dateRequested){
    const result=seasonIntel(glb,makeArgs('snapshot'));
    if(result.error)return wrap('No Season 15 leaderboard capture was recorded for '+date+'. The latest actual capture was '+time(ss.at(-1).capturedAt)+'.','glb');
    const rows=result.standings.map(r=>'#'+r.rank+' '+r.name+': '+fmt(r.experience)+' GXP');
    return wrap('Recorded Season 15 GLB at '+time(result.capturedAt)+': '+(rows.join('; ')||'Requested guilds absent from this captured top 50; exact ranking unknown.'),'glb');
  }
  if(wantsGains){
    const result=seasonIntel(glb,makeArgs('changes',{from:ss.at(-2)?.capturedAt??null,to:null}));
    if(result.error)return wrap(result.error,'glb');
    const lines=result.changes.map(x=>x.name+': '+(x.gxpGain>=0?'+':'')+fmt(x.gxpGain)+' GXP (#'+x.fromRank+' to #'+x.toRank+')');
    return wrap('Observed change from '+time(result.fromCapturedAt)+' to '+time(result.toCapturedAt)+': '+
      (lines.join('; ')||'No comparable captures for the selected guilds.'),'glb');
  }
  if(targetNames.length>1){
    const result=seasonIntel(glb,makeArgs('matchup'));
    return wrap('Latest Season 15 capture, '+time(result.capturedAt)+': '+
      result.participants.map(x=>x.present?numberString(x.name,x):x.name+' was not recorded in the top 50.').join('; '),'glb');
  }
  const latest=seasonIntel(glb,makeArgs('snapshot',{guilds:wantsTop&&!subject.length?[]:targetNames,limit:wantsTop?10:50}));
  if(latest.error)return wrap(latest.error,'glb');
  if(wantsTop&&!subject.length)return wrap('Season 15 top ten as of '+time(latest.capturedAt)+': '+
    latest.standings.map(x=>'#'+x.rank+' '+x.name+' '+fmt(x.experience)+' GXP').join('; '),'glb');
  const g=seasonIntel(glb,makeArgs('matchup')).participants[0];
  if(!g.present)return wrap(g.name+' is not recorded in the latest Season 15 top 50 ('+time(ss.at(-1).capturedAt)+'). Its ranking is unknown.','glb');
  const above=g.ahead?g.ahead.name+' (#'+g.ahead.rank+') was '+fmt(g.ahead.gapGxp)+' GXP ahead.':'';
  const below=g.behind?g.behind.name+' (#'+g.behind.rank+') was '+fmt(g.behind.gapGxp)+' GXP behind.':'';
  return wrap('Season 15 as of '+time(ss.at(-1).capturedAt)+': '+numberString(g.name,g)+'. '+above+' '+below,'glb');
}
function fallbackGuildies(message,history,cards){
  const q=norm(message),prior=norm(latestUserQuestion(history));
  const named=cards.filter(c=>c&&c.name&&c.name!=='???'&&norm(c.guild)==='arg')
    .filter(c=>[c.name,...(Array.isArray(c.aliases)?c.aliases:[])].some(alias=>
      alias&&norm(alias).length>=3&&(' '+q+' ').includes(' '+norm(alias)+' ')));
  const all=cards.filter(c=>c&&c.name&&c.name!=='???'&&norm(c.guild)==='arg');
  const roles=['Officer','Recruit','Founder','Co-Lead','Guild Lead','Warrior'];
  const role=roles.find(r=>new RegExp('\\b'+norm(r)+'s?\\b').test(q));
  if(role&&/\b(?:who|list|how many|count|names|show|members|are)\b/.test(q)){
    const found=all.filter(c=>(c.roles||[]).some(r=>norm(r)===norm(role)));
    return wrap('Willy Dex records '+found.length+' Cove '+role+(found.length===1?'':'s')+
      (found.length?': '+found.map(x=>x.name).sort().join(', ')+'.':'.')+
      ' These are archived card roles, not a verified live roster.','cards');
  }
  if(named.length!==1)return null;
  const c=named[0],roles=(c.roles||[]).join(', ')||'not recorded';
  const level=typeof c.level==='number'?fmt(c.level):'unrecorded';
  const levels=(c.level_snapshots||[]).filter(x=>typeof x.level==='number')
    .slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const gain=levels.length>=2?' Observed level growth: '+fmt(levels.at(-1).level-levels[0].level)+
    ' levels ('+levels[0].date+' to '+levels.at(-1).date+').':'';
  return wrap(c.name+': archived Cove '+roles+'; recorded level '+level+' ('+(c.date||'undated')+').'+gain+
    (c.role_verified_on?' Role verified '+c.role_verified_on+'.':'')+
    ' Current membership and current level are not live-verified.','cards');
}
module.exports={fallbackGLB,fallbackGuildies,dateFrom,explicitNames};
