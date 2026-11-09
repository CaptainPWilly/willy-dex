'use strict';

// Pure read-only Season 15 intelligence. This module never interpolates missing
// captures, assumes a guild is rank #51, or invents a calendar-day XP total.
const normalize=value=>String(value??'').normalize('NFKC').toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const validXP=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const atTime=value=>Date.parse(value)||0;
const stamp=s=>s?.capturedAt||s?.date||null;
const numeric=(a,b)=>(a??0)-(b??0);
const WARNING='Season 15 recorded top-50 observations only. Missing entries are unknown, not rank #51 or zero XP. Capture times vary; no interpolated rankings, daily XP or true rolling 24-hour totals.';

function captures(data){
  return (Array.isArray(data?.snapshots)?data.snapshots:[])
    .filter(s=>stamp(s)&&Array.isArray(s.guilds)&&atTime(stamp(s))>0)
    .slice().sort((a,b)=>atTime(stamp(a))-atTime(stamp(b)))
    .map(s=>({...s,guilds:s.guilds.filter(g=>g&&g.name&&Number.isInteger(g.rank)&&g.rank>0&&
      validXP(g.experience)).slice().sort((a,b)=>a.rank-b.rank)}));
}
function resolveGuildNames(all,queries){
  const unique=[...new Map(all.map(name=>[normalize(name),name])).values()];
  const found=[],unknown=[],ambiguous=[];
  for(const request of queries){
    const term=normalize(request);
    if(!term)continue;
    const alias=/^(?:cove|the cove|arg|our guild|our cove)$/.test(term)?'the pirate cove':term;
    const exact=unique.filter(x=>normalize(x)===alias);
    const candidates=exact.length?exact:unique.filter(x=>{
      const name=normalize(x);
      return name.split(' ').includes(alias)||name.includes(' '+alias+' ')||name.startsWith(alias+' ')||name.endsWith(' '+alias);
    });
    if(candidates.length===1){
      if(!found.some(x=>normalize(x)===normalize(candidates[0])))found.push(candidates[0]);
    }else if(candidates.length>1)ambiguous.push({requested:request,matches:candidates});
    else unknown.push(request);
  }
  return {found,unknown,ambiguous};
}
function resolveCapture(ss,query,defaultCapture){
  if(query===null||query===undefined||query==='')return defaultCapture;
  const q=String(query);
  if(q==='latest')return ss.at(-1)||null;
  if(q==='first')return ss[0]||null;
  if(q==='previous')return ss.at(-2)||null;
  if(/^\d{4}-\d\d-\d\d$/.test(q)){
    return ss.filter(s=>stamp(s).slice(0,10)===q).at(-1)||null;
  }
  return ss.find(s=>stamp(s)===q)||null;
}
function rowFor(capture,name){
  return (capture?.guilds||[]).find(g=>normalize(g.name)===normalize(name))||null;
}
function entriesFor(ss,name){
  return ss.map((s,i)=>{
    const r=rowFor(s,name);
    const prior=i>0?rowFor(ss[i-1],name):null;
    return {capturedAt:stamp(s),rank:r?.rank??null,gxp:r?.experience??null,
      rankChange:r&&prior?prior.rank-r.rank:null,
      gxpGain:r&&prior?r.experience-prior.experience:null,
      comparedTo:r&&prior?stamp(ss[i-1]):null};
  });
}
function summarizeHistory(ss,name){
  const history=entriesFor(ss,name);
  const observed=history.filter(e=>e.rank!==null);
  const first=observed[0]||null,last=observed.at(-1)||null;
  const intervals=history.filter(h=>h.gxpGain!==null);
  const bestGain=intervals.slice().sort((a,b)=>b.gxpGain-a.gxpGain)[0]||null;
  const strongestRise=intervals.slice().sort((a,b)=>b.rankChange-a.rankChange)[0]||null;
  const bestRank=observed.length?Math.min(...observed.map(e=>e.rank)):null;
  const worstRank=observed.length?Math.max(...observed.map(e=>e.rank)):null;
  const latest=history.at(-1)||null;
  return {name,appearances:observed.length,missingCaptures:history.length-observed.length,
    firstObserved:first,lastObserved:last,latest:latest?.rank!==null?latest:null,
    bestRecordedRank:bestRank,worstRecordedRank:worstRank,
    firstToLastObservedGain:first&&last&&first!==last?last.gxp-first.gxp:null,
    firstToLastRankChange:first&&last&&first!==last?first.rank-last.rank:null,
    bestAdjacentCapturedGain:bestGain,
    largestAdjacentRecordedRise:strongestRise?.rankChange>0?strongestRise:null,
    history};
}
function makeGaps(snapshot,requested,limit){
  const rows=snapshot.guilds;
  const selected=new Set(requested.map(normalize));
  const pairs=[];
  for(let i=1;i<rows.length;i++){
    const above=rows[i-1],below=rows[i];
    if(above.rank+1!==below.rank)continue;
    if(selected.size&&!selected.has(normalize(above.name))&&!selected.has(normalize(below.name)))continue;
    pairs.push({above:{name:above.name,rank:above.rank,gxp:above.experience},
      below:{name:below.name,rank:below.rank,gxp:below.experience},
      gapGxp:above.experience-below.experience});
  }
  return {totalPairs:pairs.length,closest:pairs.slice().sort((a,b)=>a.gapGxp-b.gapGxp||a.above.rank-b.above.rank).slice(0,limit),
    largest:pairs.slice().sort((a,b)=>b.gapGxp-a.gapGxp||a.above.rank-b.above.rank).slice(0,limit)};
}
function changes(start,end,names,limit,sort){
  const requested=new Set(names.map(normalize));
  const starting=new Map(start.guilds.map(x=>[normalize(x.name),x]));
  const ending=new Map(end.guilds.map(x=>[normalize(x.name),x]));
  let common=end.guilds.filter(g=>starting.has(normalize(g.name))).map(g=>{
    const prior=starting.get(normalize(g.name)),hours=(atTime(stamp(end))-atTime(stamp(start)))/3600000;
    const gain=g.experience-prior.experience;
    return {name:g.name,fromRank:prior.rank,toRank:g.rank,
      rankChange:prior.rank-g.rank,fromGxp:prior.experience,toGxp:g.experience,
      gxpGain:gain,observedHours:Math.round(hours*100)/100,
      gxpPerObservedHour:hours>0?Math.round(gain/hours*100)/100:null};
  }).filter(g=>!requested.size||requested.has(normalize(g.name)));
  const comparables=common.length;
  if(sort==='rank-rise')common.sort((a,b)=>b.rankChange-a.rankChange||b.gxpGain-a.gxpGain);
  else if(sort==='rank-fall')common.sort((a,b)=>a.rankChange-b.rankChange||b.gxpGain-a.gxpGain);
  else if(sort==='rank')common.sort((a,b)=>a.toRank-b.toRank);
  else if(sort==='gain-smallest')common.sort((a,b)=>a.gxpGain-b.gxpGain);
  else common.sort((a,b)=>b.gxpGain-a.gxpGain||a.toRank-b.toRank);
  return {fromCapturedAt:stamp(start),toCapturedAt:stamp(end),
    comparableGuilds:comparables,changes:common.slice(0,limit),
    enteredObservedTop50:end.guilds.filter(x=>!starting.has(normalize(x.name))&&(!requested.size||requested.has(normalize(x.name)))).map(x=>x.name),
    leftObservedTop50:start.guilds.filter(x=>!ending.has(normalize(x.name))&&(!requested.size||requested.has(normalize(x.name)))).map(x=>x.name)};
}
function nearest(s,name){
  const rows=s.guilds;
  const i=rows.findIndex(g=>normalize(g.name)===normalize(name));
  if(i<0)return {name,present:false,rank:null,gxp:null};
  const r=rows[i],a=rows[i-1],b=rows[i+1];
  return {name,present:true,rank:r.rank,gxp:r.experience,
    ahead:a&&a.rank===r.rank-1?{name:a.name,rank:a.rank,gapGxp:a.experience-r.experience}:null,
    behind:b&&b.rank===r.rank+1?{name:b.name,rank:b.rank,gapGxp:r.experience-b.experience}:null};
}
function seasonIntel(data,args={}){
  const ss=captures(data),latest=ss.at(-1),mode=args.mode||'history';
  const limit=Math.max(1,Math.min(50,Number(args.limit)||20));
  const requests=Array.isArray(args.guilds)?args.guilds.filter(x=>typeof x==='string').slice(0,8):[];
  const catalog=[...new Map(ss.flatMap(s=>s.guilds.map(g=>[normalize(g.name),g.name]))).values()];
  const chosen=resolveGuildNames(catalog,requests);
  const base={season:data?.season??null,mode,captureCount:ss.length,
    firstCapturedAt:stamp(ss[0]),latestCapturedAt:stamp(latest),
    requestedGuilds:requests,resolvedGuilds:chosen.found,
    unknownGuilds:chosen.unknown,ambiguousGuilds:chosen.ambiguous,
    warning:WARNING};
  if(!latest)return {...base,error:'No historical GLB captures have been recorded.'};
  if(chosen.ambiguous.length)return {...base,error:'Guild reference is ambiguous. Use an exact archived guild name.'};
  if(requests.length&&!chosen.found.length)return {...base,error:'None of the requested guilds appears in any captured Season 15 top-50 snapshot.'};
  const allowedTimes=ss.map(stamp);
  const target=resolveCapture(ss,args.at,latest);
  if(['snapshot','matchup','races'].includes(mode)&&!target)
    return {...base,error:'No real Season 15 capture exists for the requested date or timestamp.',
      availableCaptureTimes:allowedTimes};
  const names=chosen.found;
  if(mode==='history'){
    const selected=names.length?names:['The Pirate Cove'];
    return {...base,guilds:selected.map(n=>summarizeHistory(ss,n)),
      note:'Each row is one actual captured timestamp; nulls mean not observed in the top 50. A per-interval gain exists only if both consecutive captures contain that guild.'};
  }
  if(mode==='catalog'){
    return {...base,totalGuildsObserved:catalog.length,
      guilds:catalog.sort((a,b)=>a.localeCompare(b)).slice(0,limit)};
  }
  if(mode==='snapshot'){
    const rows=names.length?target.guilds.filter(r=>names.some(n=>normalize(n)===normalize(r.name))):target.guilds;
    return {...base,capturedAt:stamp(target),totalMatched:rows.length,
      standings:rows.slice(0,limit),missingRequestedGuilds:names.filter(n=>!rowFor(target,n)),
      leader:target.guilds[0]||null,top50Count:target.guilds.length};
  }
  if(mode==='matchup'){
    const requested=names.length?names:['The Pirate Cove'];
    const participants=requested.map(n=>nearest(target,n));
    const observed=participants.filter(n=>n.present);
    const leader=observed.slice().sort((a,b)=>a.rank-b.rank)[0]||null;
    return {...base,capturedAt:stamp(target),participants,
      leaderAmongSelected:leader?leader.name:null,
      gapToSelectedLeader:observed.map(r=>({name:r.name,
        rank:r.rank,gxp:r.gxp,behindLeaderGxp:leader.gxp-r.gxp})),
      note:'Gaps compare recorded guild XP at the SAME capture only. No inferred changes between captures.'};
  }
  if(mode==='races'){
    return {...base,capturedAt:stamp(target),
      ...makeGaps(target,names,limit)};
  }
  if(mode==='changes'){
    const from=resolveCapture(ss,args.from,ss.at(-2)||null);
    const to=resolveCapture(ss,args.to,latest);
    if(!from||!to||atTime(stamp(from))>=atTime(stamp(to)))
      return {...base,error:'Choose two actual Season 15 captures in ascending time order.',
        availableCaptureTimes:allowedTimes};
    return {...base,...changes(from,to,names,limit,args.sort)};
  }
  if(mode==='leaders'){
    const leaders=ss.map(s=>({capturedAt:stamp(s),leader:s.guilds[0]?{
      name:s.guilds[0].name,rank:s.guilds[0].rank,gxp:s.guilds[0].experience}:null}));
    const counts={};
    for(const entry of leaders)if(entry.leader)counts[entry.leader.name]=(counts[entry.leader.name]||0)+1;
    return {...base,recordedLeaders:leaders,leaderCaptureCounts:counts,
      note:'Counts are number of observed snapshots led, NOT duration spent in first place.'};
  }
  return {...base,error:'Unknown Season 15 analysis mode.'};
}
module.exports={seasonIntel,captures,resolveGuildNames,resolveCapture,summarizeHistory};
