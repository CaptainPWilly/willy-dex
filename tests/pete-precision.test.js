'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const oldKey=process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY='mocked-offline-test';
const pete=require('../scurvy-pete-api');
const oldFetch=global.fetch;
const PREFIX='https://raw.githubusercontent.com/CaptainPWilly/willy-dex/main/';
const cache=new Map();
function fixture(name){
  if(!cache.has(name))cache.set(name,JSON.parse(fs.readFileSync(path.join(__dirname,'..',name),'utf8')));
  return cache.get(name);
}
global.fetch=async url=>{
  const location=String(url);
  if(!location.startsWith(PREFIX))throw Error('Unexpected external AI call: '+location);
  return {ok:true,status:200,json:async()=>fixture(location.slice(PREFIX.length))};
};
test.after(()=>{
  global.fetch=oldFetch;
  if(oldKey===undefined)delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY=oldKey;
});
const ask=q=>pete.__test.verifiedAnswer(q);
test('another guild officer question never gets Cove officers',async()=>{
  for(const q of [
    'How many officers does Rain Factory have?',
    'Who are the officers of The Knights Who Say Yee?',
    'How many officers does Mystery Guild have?'
  ]){
    const r=await ask(q);
    assert.match(r.answer,/not have|cannot verify/i);
    assert.doesNotMatch(r.answer,/ChezShork|JoyBoy|8 recorded Cove/i);
    assert.equal(r.evidence,'insufficient');
  }
});
test('dated staff roster questions cannot reuse an undated officer list',async()=>{
  for(const q of ['Who were the Cove officers on October 20?','Who are the officers in the Cove this week?']){
    const r=await ask(q);
    assert.equal(r.evidence,'insufficient');
    assert.match(r.answer,/cannot verify/i);
  }
});
test('the normal Cove officer and recruit lists remain usable',async()=>{
  const officers=await ask('Who are the officers?');
  const recruits=await ask('How many recruits do we have?');
  assert.match(officers.answer,/8 recorded Cove Officers/);
  assert.match(officers.answer,/ChezShork/);
  assert.match(officers.answer,/JoyBoy/);
  assert.match(recruits.answer,/7 Cove recruits/);
  assert.match(recruits.answer,/not a verified live roster/);
});
test('historical top five is exactly five real ranked guilds',async()=>{
  const r=await ask('Top 5 GLB guilds on October 29');
  const snaps=fixture('glb.json').snapshots.filter(x=>x.capturedAt.startsWith('2026-10-29'));
  const last=snaps.at(-1);
  const ranks=[...r.answer.matchAll(/#(\d+)\s/g)].map(m=>Number(m[1]));
  assert.deepEqual(ranks,[1,2,3,4,5]);
  for(const g of last.guilds.slice(0,5))assert.ok(r.answer.includes(g.name));
  assert.match(r.answer,/Oct 29, 2026/);
});
test('an old GLB rank is not silently replaced by latest',async()=>{
  const r=await ask("What was the Cove's rank on October 29?");
  assert.match(r.answer,/#23 with 583,351 GXP/);
  assert.doesNotMatch(r.answer,/#24 with 1,274,216 GXP/);
  assert.deepEqual(r.sources.map(s=>s.id),['glb']);
});
test('named historical leaderboard leader comes from that exact capture',async()=>{
  const r=await ask('Who led the GLB on October 29?');
  assert.match(r.answer,/#1 Umbral 7,860,530 GXP/);
  assert.match(r.answer,/Oct 29, 2026/);
});
test('the closest race ignores same-XP tied pairs but identifies them',async()=>{
  const r=await ask('What were the closest GLB races on October 29?');
  assert.match(r.answer,/97 GXP apart/);
  assert.match(r.answer,/zero-gap tied pair/);
  assert.doesNotMatch(r.answer,/— 0 GXP apart/);
});
test('intra-day growth uses the first and last actual captures of that day',async()=>{
  const r=await ask('Which guild gained the most GXP on October 29?');
  const glb=fixture('glb.json'),ss=glb.snapshots.filter(s=>s.capturedAt.startsWith('2026-10-29'));
  const first=new Map(ss[0].guilds.map(g=>[g.name,g]));
  const biggest=ss.at(-1).guilds.filter(g=>first.has(g.name)).map(g=>({
    name:g.name,delta:g.experience-first.get(g.name).experience
  })).sort((a,b)=>b.delta-a.delta)[0];
  assert.match(r.answer,new RegExp(biggest.name));
  assert.ok(r.answer.includes(biggest.delta.toLocaleString('en-US')));
  assert.match(r.answer,/not the entire day/i);
});
test('two-date GLB growth compares both specified dates, not just the first',async()=>{
  const r=await ask('How much GXP did the Cove gain between Oct 29 and Nov 7?');
  assert.match(r.answer,/Oct 29, 2026/);
  assert.match(r.answer,/Nov 7, 2026/);
  assert.match(r.answer,/690,865 GXP/);
  assert.match(r.answer,/#23 → #24/);
});
test('a since-date GLB comparison uses that capture and latest',async()=>{
  const r=await ask('How much GXP did the Cove gain since Oct 29?');
  assert.match(r.answer,/690,865 GXP/);
  assert.match(r.answer,/Nov 7, 2026/);
});
test('missing capture does not become a guessed result',async()=>{
  const r=await ask('What was the GLB on November 8?');
  assert.equal(r.evidence,'insufficient');
  assert.match(r.answer,/no recorded.*snapshot/i);
});
test('an unrecorded season is not replaced with Season 15',async()=>{
  const r=await ask('Show me the top 5 guilds in Season 14');
  assert.equal(r.evidence,'insufficient');
  assert.match(r.answer,/not Season 14/);
});
test('exact 24-hour records are not inferred from irregular capture windows',async()=>{
  const r=await ask('What was the largest exact 24-hour GXP gain for the Cove?');
  assert.equal(r.evidence,'insufficient');
  assert.match(r.answer,/cannot establish.*24-hour/i);
});
test('Cove card-level growth ranks actual recorded level changes',async()=>{
  const r=await ask('Top 5 member level growth');
  assert.match(r.answer,/Cove card-level gains/);
  assert.match(r.answer,/different observation windows/);
  assert.match(r.answer,/not XP totals/i);
});
test('never assert that an arbitrary guild XP figure belongs to the Cove',()=>{
  const glb=fixture('glb.json'),verify=pete.__test.mismatchedGuildXpClaims;
  assert.equal(verify('The Pirate Cove has 26,281,385 GXP.',glb).length,1);
  assert.equal(verify('The Cove has 26,281,385 GXP.',glb).length,1);
  assert.deepEqual(verify('The Pirate Cove is #24 with 1,274,216 GXP.',glb),[]);
  assert.deepEqual(verify('Umbral has 26,281,385 GXP.',glb),[]);
});
test('no retrospective role claims on unknown opponents',async()=>{
  const r=await ask('How many recruits does Helheim have?');
  assert.equal(r.evidence,'insufficient');
  assert.match(r.answer,/only records the Cove|does not have Helheim/i);
});

test('highest level officer is selected among officers, not all cards',async()=>{
  const r=await ask('Who has the highest level officer?');
  assert.match(r.answer,/C H I M C K E N/);
  assert.match(r.answer,/63,771/);
  assert.doesNotMatch(r.answer,/SAWTOOTH/);
  assert.deepEqual(r.sources.map(x=>x.id),['cards']);
});
test('top three recruits are selected by actual recorded levels',async()=>{
  const r=await ask('Top 3 recruits by level');
  assert.match(r.answer,/SAWTOOTH/);
  assert.match(r.answer,/218,374/);
  assert.match(r.answer,/Unspeakable Deep III/);
  assert.match(r.answer,/The Ghostwriter/);
  assert.doesNotMatch(r.answer,/4\./);
});
test('role-level threshold reads comma-formatted numbers correctly',async()=>{
  const r=await ask('How many officers over 10,000 levels?');
  assert.match(r.answer,/5 recorded Cove Officers over 10,000 levels/);
  assert.doesNotMatch(r.answer,/JoyBoy/);
});
test('no retrospective level ranking without role-at-date evidence',async()=>{
  const r=await ask('Who was the highest level officer on October 20?');
  assert.equal(r.evidence,'insufficient');
  assert.match(r.answer,/no verified time-specific staff-role roster/i);
});
test('officer level gain is from exact dated level captures, not XP',async()=>{
  const r=await ask('Which officer gained the most levels?');
  assert.match(r.answer,/C H I M C K E N/);
  assert.match(r.answer,/\+309 levels/);
  assert.match(r.answer,/2026-10-20 to 2026-10-28/);
});
test('wrong guild ownership is blocked in full mocked AI chat despite real number',async()=>{
  const outer=global.fetch;
  let aiCount=0,reply=null;
  global.fetch=async(url,opts)=>{
    const uri=String(url);
    if(uri.startsWith(PREFIX))return {ok:true,status:200,json:async()=>fixture(uri.slice(PREFIX.length))};
    if(uri==='https://api.openai.com/v1/responses'){
      aiCount++;
      return {ok:true,status:200,json:async()=>aiCount===1?{
        output:[{type:'function_call',call_id:'glb-actual-data',name:'analyze_glb',
          arguments:JSON.stringify({mode:'snapshot',window:'latest',guilds:[],limit:50,from:null,to:null})}]
      }:{
        output:[{type:'message',content:[{type:'output_text',text:'The Pirate Cove has 26,281,385 GXP and is ranked #1.'}]}]
      }};
    }
    throw Error('Unexpected fetch '+uri);
  };
  try{
    await pete.handle(
      {url:'/api/pete/chat',method:'POST',headers:{origin:'https://captainpwilly.github.io'}},{},
      {origin:'https://captainpwilly.github.io',authorized:()=>true,
        read:async()=>({message:'Summarize recent GLB trends across the Cove, Umbral, and Helheim.',history:[]}),
        json:(_res,status,data)=>{reply={status,data};}});
    assert.equal(reply.status,200);
    assert.equal(reply.data.evidence,'numeric-check-failed');
    assert.doesNotMatch(reply.data.answer,/The Pirate Cove has 26,281,385 GXP/);
    assert.equal(aiCount,2);
  }finally{global.fetch=outer;}
});
