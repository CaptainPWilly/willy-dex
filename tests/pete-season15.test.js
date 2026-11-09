'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {seasonIntel,captures,resolveGuildNames}=require('../scurvy-pete-season15');
const {seasonIntel:apiIntel,validToolArgs}=require('../scurvy-pete-api').__test;
const glb=JSON.parse(fs.readFileSync(path.join(__dirname,'..','glb.json'),'utf8'));
const ss=captures(glb);
const last=ss.at(-1),before=ss.at(-2);
const find=(s,n)=>s.guilds.find(x=>x.name===n);
const base={mode:'history',guilds:['The Pirate Cove'],at:null,from:null,to:null,sort:'gain',limit:50};
const ask=(mode,more={})=>seasonIntel(glb,{...base,mode,...more});

test('season 15 intelligence uses the entire time-ordered historical archive',()=>{
  assert.equal(glb.season,15);
  assert.equal(ss.length,glb.snapshots.length);
  assert.equal(ask('history').captureCount,ss.length);
  assert.equal(ask('history').latestCapturedAt,last.capturedAt);
  assert.equal(ask('history').firstCapturedAt,ss[0].capturedAt);
});
test('a guild history preserves EVERY captured XP and rank without inventing missing entries',()=>{
  for(const name of ['The Pirate Cove','Umbral','Helheim','Coven','Golden Arrows','Polaris']){
    const result=ask('history',{guilds:[name]}).guilds[0];
    assert.equal(result.history.length,ss.length);
    for(let i=0;i<ss.length;i++){
      const observed=find(ss[i],name);
      assert.equal(result.history[i].capturedAt,ss[i].capturedAt);
      assert.equal(result.history[i].rank,observed?.rank??null);
      assert.equal(result.history[i].gxp,observed?.experience??null);
      const prior=i>0?find(ss[i-1],name):null;
      assert.equal(result.history[i].gxpGain,observed&&prior?observed.experience-prior.experience:null);
      assert.equal(result.history[i].rankChange,observed&&prior?prior.rank-observed.rank:null);
    }
  }
});
test('Cove and Coven are different guilds in both exact and shorthand searches',()=>{
  assert.deepEqual(resolveGuildNames(['The Pirate Cove','Coven'],['Cove']).found,['The Pirate Cove']);
  assert.deepEqual(resolveGuildNames(['The Pirate Cove','Coven'],['Coven']).found,['Coven']);
  const result=ask('matchup',{guilds:['Cove','Coven']});
  assert.equal(result.participants.length,2);
  assert.equal(result.participants[0].name,'The Pirate Cove');
  assert.equal(result.participants[1].name,'Coven');
  assert.equal(result.participants[0].gxp,find(last,'The Pirate Cove').experience);
  assert.equal(result.participants[1].gxp,find(last,'Coven').experience);
});
test('unknown and ambiguous guilds never silently become the Cove or another guild',()=>{
  assert.match(ask('history',{guilds:['Nonexistent Private Guild']}).error,/None of the requested/);
  const ambiguous=resolveGuildNames(['Wolf Pack','Wolf','Gold Wolf'],['Wolf']);
  assert.deepEqual(ambiguous.found,['Wolf']);
  const noExact=resolveGuildNames(['Wolf Pack','Gold Wolf'],['Wolf']);
  assert.equal(noExact.ambiguous.length,1);
  assert.match(ask('history',{guilds:['Golden']}).error,/ambiguous/i);
});
test('named guilds not in the latest top 50 retain history but latest status remains unknown',()=>{
  const earliestNames=new Set(ss[0].guilds.map(x=>x.name));
  const gone=[...earliestNames].find(n=>!last.guilds.some(g=>g.name===n));
  if(!gone)return;
  const row=ask('history',{guilds:[gone]}).guilds[0];
  assert.equal(row.latest,null);
  assert.equal(row.history.at(-1).rank,null);
  assert.equal(row.history.at(-1).gxp,null);
});
test('date lookup picks the LAST actual observation on that date and no imaginary date',()=>{
  const chosen=ss.filter(s=>s.capturedAt.startsWith('2026-10-29')).at(-1);
  const result=ask('snapshot',{at:'2026-10-29',guilds:[]});
  assert.equal(result.capturedAt,chosen.capturedAt);
  assert.deepEqual(result.standings.slice(0,3),chosen.guilds.slice(0,3));
  const absent=ask('snapshot',{at:'2026-11-15'});
  assert.match(absent.error,/No real Season 15 capture/);
  assert.deepEqual(absent.availableCaptureTimes,ss.map(x=>x.capturedAt));
});
test('an exact timestamp selects its own snapshot, not a same-day neighbor',()=>{
  const timestamp=ss.find(s=>s.capturedAt.startsWith('2026-10-28'));
  const result=ask('snapshot',{at:timestamp.capturedAt});
  assert.equal(result.capturedAt,timestamp.capturedAt);
  assert.equal(result.standings[0].experience,timestamp.guilds[0].experience);
});
test('multi-guild historical comparisons always use one captured timestamp',()=>{
  const selected=['The Pirate Cove','Helheim','Umbral','Ascended'];
  const result=ask('matchup',{guilds:selected});
  assert.equal(result.capturedAt,last.capturedAt);
  for(const member of result.participants){
    const expected=find(last,member.name);
    assert.equal(member.rank,expected.rank);
    assert.equal(member.gxp,expected.experience);
  }
  const leader=result.participants.reduce((a,b)=>a.rank<b.rank?a:b);
  for(const gap of result.gapToSelectedLeader)assert.equal(gap.behindLeaderGxp,leader.gxp-find(last,gap.name).experience);
});
test('latest and historical rank neighbors report precise GXP gaps',()=>{
  const result=ask('matchup',{guilds:['The Pirate Cove']});
  const record=find(last,'The Pirate Cove');
  const index=last.guilds.indexOf(record);
  assert.equal(result.participants[0].ahead.gapGxp,last.guilds[index-1].experience-record.experience);
  assert.equal(result.participants[0].behind.gapGxp,record.experience-last.guilds[index+1].experience);
  const historical=ask('matchup',{guilds:['The Pirate Cove'],at:'2026-10-29'});
  const actual=ss.filter(x=>x.capturedAt.startsWith('2026-10-29')).at(-1);
  assert.equal(historical.participants[0].gxp,find(actual,'The Pirate Cove').experience);
});
test('closest and largest races are actual adjacent rank pairs',()=>{
  const out=ask('races',{guilds:[]});
  const pairs=last.guilds.slice(1).map((g,i)=>({gap:last.guilds[i].experience-g.experience,rank:last.guilds[i].rank}));
  const min=Math.min(...pairs.map(x=>x.gap));
  const max=Math.max(...pairs.map(x=>x.gap));
  assert.equal(out.closest[0].gapGxp,min);
  assert.equal(out.largest[0].gapGxp,max);
  assert.equal(out.closest[0].above.rank+1,out.closest[0].below.rank);
});
test('rank-change comparisons are calculated only from shared real observations',()=>{
  const result=ask('changes',{guilds:[],from:before.capturedAt,to:last.capturedAt});
  const firstMap=new Map(before.guilds.map(x=>[x.name,x]));
  for(const row of result.changes){
    const old=firstMap.get(row.name),current=find(last,row.name);
    assert.ok(old&&current);
    assert.equal(row.rankChange,old.rank-current.rank);
    assert.equal(row.gxpGain,current.experience-old.experience);
    assert.equal(row.fromGxp,old.experience);
    assert.equal(row.toGxp,current.experience);
  }
});
test('sort modes order actual observed gains and rank movements',()=>{
  const modes=['gain','gain-smallest','rank-rise','rank-fall','rank'];
  const property={gain:'gxpGain','gain-smallest':'gxpGain','rank-rise':'rankChange','rank-fall':'rankChange',rank:'toRank'};
  for(const mode of modes){
    const r=ask('changes',{guilds:[],sort:mode});
    const values=r.changes.map(x=>x[property[mode]]);
    for(let i=1;i<values.length;i++){
      if(['gain-smallest','rank-fall','rank'].includes(mode))assert.ok(values[i]>=values[i-1],mode);
      else assert.ok(values[i]<=values[i-1],mode);
    }
  }
});
test('rank history reports only observed peak and worst placement',()=>{
  const result=ask('history',{guilds:['The Pirate Cove']}).guilds[0];
  const real=ss.map(s=>find(s,'The Pirate Cove')).filter(Boolean);
  assert.equal(result.bestRecordedRank,Math.min(...real.map(x=>x.rank)));
  assert.equal(result.worstRecordedRank,Math.max(...real.map(x=>x.rank)));
  assert.equal(result.appearances,real.length);
});
test('historical first-place summary counts captures and not time spent #1',()=>{
  const result=ask('leaders',{guilds:[]});
  assert.equal(result.recordedLeaders.length,ss.length);
  assert.equal(Object.values(result.leaderCaptureCounts).reduce((a,b)=>a+b,0),ss.length);
  for(let i=0;i<ss.length;i++){
    assert.equal(result.recordedLeaders[i].leader.name,ss[i].guilds[0].name);
    assert.equal(result.recordedLeaders[i].leader.gxp,ss[i].guilds[0].experience);
  }
});
test('all guilds in the catalog are real archived names',()=>{
  const r=ask('catalog',{guilds:[],limit:50});
  const actual=new Set(ss.flatMap(s=>s.guilds.map(g=>g.name)));
  assert.equal(r.totalGuildsObserved,actual.size);
  assert.ok(r.guilds.every(n=>actual.has(n)));
});
test('GLB model tool schema rejects invalid mode and impossibly large requests',()=>{
  const valid={mode:'history',guilds:['Umbral','Helheim'],at:null,from:null,to:null,sort:'gain',limit:50};
  assert.deepEqual(validToolArgs('season15_intel',valid),valid);
  assert.throws(()=>validToolArgs('season15_intel',{...valid,mode:'invent'}));
  assert.throws(()=>validToolArgs('season15_intel',{...valid,limit:1000}));
  assert.throws(()=>validToolArgs('season15_intel',{...valid,guilds:Array(20).fill('Umbral')}));
});
test('API exposes an archive-backed history tool and preserves exact source data',async()=>{
  const original=global.fetch;
  try{
    global.fetch=async(url)=>{
      if(String(url).endsWith('/glb.json'))return {ok:true,status:200,json:async()=>glb};
      throw Error('Unexpected network call in test: '+url);
    };
    const r=await apiIntel(glb,{...base,guilds:['Helheim','Ascended']});
    assert.equal(r.guilds.length,2);
    const output=await require('../scurvy-pete-api').__test.RESULTS.season15_intel({...base,guilds:['Helheim']});
    assert.equal(output.guilds[0].history.at(-1).gxp,find(last,'Helheim').experience);
  }finally{global.fetch=original;}
});
