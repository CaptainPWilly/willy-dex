'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const originalKey=process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY='offline-test-only';
const pete=require('../scurvy-pete-api');
const {directQuestion,verifiedAnswer,analyzeGLB,analyzeMembers,validToolArgs}=pete.__test;
const savedFetch=global.fetch;
const PREFIX='https://raw.githubusercontent.com/CaptainPWilly/willy-dex/main/';
const docs={};
function get(name){if(!docs[name])docs[name]=JSON.parse(fs.readFileSync(path.join(__dirname,'..',name),'utf8'));return docs[name];}
global.fetch=async url=>{
  if(String(url).startsWith(PREFIX))return {ok:true,status:200,json:async()=>get(String(url).slice(PREFIX.length))};
  throw Error('Staff-intelligence tests must never call the language model.');
};
test.after(()=>{
  global.fetch=savedFetch;
  if(originalKey===undefined)delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY=originalKey;
});
test('promotion corrections are present in the underlying card database',()=>{
  const cards=get('cards.json');
  for(const name of ['ChezShork','JoyBoy']){
    const c=cards.find(x=>x.name===name);
    assert.deepEqual(c.roles,['Officer']);
    assert.deepEqual(c.tags,['Officer']);
    assert.equal(c.role_verified_on,'2026-10-29');
    assert.equal(c.guild,'ARG');
  }
});
test('staff officer list includes all 8 recorded officers',async()=>{
  const r=await verifiedAnswer('Who are the officers?');
  assert.match(r.answer,/8 recorded Cove Officers/);
  assert.match(r.answer,/ChezShork/);
  assert.match(r.answer,/JoyBoy/);
  assert.match(r.answer,/archived, not verified live/i);
  assert.deepEqual(r.sources.map(x=>x.id),['cards']);
});
test('member alias resolves to the canonical card',async()=>{
  const r=await analyzeMembers({mode:'member',query:'DoubleDs',role:null,limit:10});
  assert.equal(r.totalMatches,1);
  assert.equal(r.members[0].name,'The Ghostwriter');
  assert.ok(r.members[0].aliases.includes('DoubleDs'));
});
test('named player questions bypass speculative language-model lookup',async()=>{
  const r=await verifiedAnswer('Who is JoyBoy?');
  assert.match(r.answer,/Officer/);
  assert.match(r.answer,/1,726/);
  assert.match(r.answer,/2026-10-29/);
  const s=await verifiedAnswer('Who is SAWTOOTH?');
  assert.match(s.answer,/218,374/);
  assert.match(s.answer,/Recruit/);
});
test('live membership is not inferred from past card ownership',async()=>{
  const r=await verifiedAnswer('Is SAWTOOTH still in the Cove?');
  assert.match(r.answer,/cannot confirm whether they are currently in the Cove/i);
});
test('level growth is derived only from real dated captures',async()=>{
  const r=await analyzeMembers({mode:'growth',query:'JoyBoy',role:null,limit:5});
  assert.equal(r.members[0].observedGrowth,12);
  assert.equal(r.members[0].firstCapturedAt,'2026-10-20');
  assert.equal(r.members[0].lastCapturedAt,'2026-10-28');
  const saw=await analyzeMembers({mode:'growth',query:'SAWTOOTH',role:null,limit:5});
  assert.equal(saw.members[0].observedGrowth,null);
  assert.match(saw.note,/not player XP earned/i);
});
test('member role filters count exact roles, not substring matches',async()=>{
  const r=await analyzeMembers({mode:'roles',query:'',role:'Officer',limit:100});
  assert.equal(r.totalMatches,8);
  assert.ok(r.members.every(x=>x.roles.includes('Officer')));
  const recruits=await analyzeMembers({mode:'roles',query:'',role:'Recruit',limit:100});
  assert.equal(recruits.totalMatches,7);
});
test('the latest Cove GLB rank and direct neighbors use real values',async()=>{
  const r=await analyzeGLB({mode:'guild',window:'latest',guilds:['The Pirate Cove'],limit:1,from:null,to:null});
  assert.equal(r.guilds[0].latest.rank,24);
  assert.equal(r.guilds[0].latest.xp,1274216);
  assert.equal(r.guilds[0].growth.xpGain,132847);
  assert.equal(r.guilds[0].ahead.gapXp,132125);
  assert.equal(r.guilds[0].behind.gapXp,66966);
});
test('recorded GLB fastest growth calculates from latest two snapshots',async()=>{
  const r=await analyzeGLB({mode:'growth',window:'latest',guilds:[],limit:5,from:null,to:null});
  assert.equal(r.growth[0].name,'Umbral');
  assert.equal(r.growth[0].xpGain,2700911);
  assert.equal(r.growth[0].fromRank,1);
  assert.equal(r.growth[0].toRank,1);
  assert.ok(r.growth[0].measuredHours>20);
});
test('season growth compares same guild in real first and latest captures',async()=>{
  const r=await analyzeGLB({mode:'growth',window:'season',guilds:['The Pirate Cove'],limit:2,from:null,to:null});
  assert.equal(r.growth.length,1);
  assert.equal(r.growth[0].xpGain,966673);
  assert.equal(r.growth[0].rankChange,2);
});
test('a closest race is a pair of adjacent observed ranks',async()=>{
  const r=await analyzeGLB({mode:'races',window:'latest',guilds:[],limit:10,from:null,to:null});
  assert.equal(r.closest[0].gapXp,803);
  assert.equal(r.closest[0].above.rank+1,r.closest[0].below.rank);
});
test('historical day lookup selects last actual capture of that date',async()=>{
  const r=await analyzeGLB({mode:'at',window:'latest',guilds:['The Pirate Cove'],limit:5,from:null,to:'2026-10-29'});
  assert.equal(r.captureCountOnDate,2);
  assert.equal(r.standings[0].rank,23);
  assert.equal(r.standings[0].experience,583351);
  assert.match(r.capturedAt,/2026-10-29T14:00/);
});
test('specific-date-to-date GLB comparisons never invent missing intervals',async()=>{
  const r=await analyzeGLB({mode:'compare',window:'latest',guilds:['The Pirate Cove'],limit:5,from:'2026-10-27',to:'2026-11-07'});
  assert.equal(r.changes[0].xpGain,966673);
  assert.equal(r.changes[0].rankChange,2);
  assert.equal(r.changes[0].toRank,24);
});
test('unrecorded GLB dates return explicit error and actual available capture times',async()=>{
  const r=await analyzeGLB({mode:'at',window:'latest',guilds:['The Pirate Cove'],limit:2,from:null,to:'2026-11-08'});
  assert.ok(r.error);
  assert.deepEqual(r.standings,[]);
  assert.ok(r.availableCaptureTimes.length>0);
});
test('unknown guild names do not fall back to Cove or all top-50',async()=>{
  const missing=await analyzeGLB({mode:'guild',window:'latest',guilds:['totally imaginary guild'],limit:5,from:null,to:null});
  assert.ok(missing.error);
  assert.deepEqual(missing.guilds,[]);
  const old=await pete.__test.RESULTS.find_leaderboard({guilds:['totally imaginary guild'],mode:'latest',limit:10,offset:0});
  assert.equal(old.totalMatches,0);
  assert.deepEqual(old.standings,[]);
});
test('GLB model tool enforces strict date and mode argument contracts',()=>{
  const valid={mode:'compare',window:'latest',guilds:['The Pirate Cove'],limit:5,from:'2026-10-29',to:'2026-11-07'};
  assert.deepEqual(validToolArgs('analyze_glb',valid),valid);
  assert.throws(()=>validToolArgs('analyze_glb',{...valid,limit:100}));
  assert.throws(()=>validToolArgs('analyze_glb',{...valid,mode:'invented'}));
  assert.throws(()=>validToolArgs('analyze_glb',{...valid,from:123}));
});
test('staff natural-language GLB questions route to direct calculations',async()=>{
  const tests=[
    ['Which guild gained the most GXP since last update?','glb_growth_latest',/Umbral/],
    ['Which guild gained the most GXP this season?','glb_growth_season',/Umbral/],
    ['What is the closest race in the GLB?','glb_races',/803/],
    ['How far are we from the next rank?','cove_nearest_ranks',/132,125/],
    ['Who are our recruits?','recorded_role_list',/7 recorded Cove Recruits/]
  ];
  for(const [question,kind,pattern] of tests){
    assert.equal(directQuestion(question),kind,question);
    const r=await verifiedAnswer(question);
    assert.match(r.answer,pattern);
  }
});
test('guild-vs-guild latest comparison identifies values with proper owners',async()=>{
  const r=await verifiedAnswer('Cove GLB rank vs Helheim');
  assert.match(r.answer,/The Pirate Cove #24 with 1,274,216 GXP/);
  assert.match(r.answer,/Helheim #2 with 18,558,634 GXP/);
  assert.match(r.answer,/17,284,418 GXP apart/);
  assert.deepEqual(r.sources.map(x=>x.id),['glb']);
});

test('career-only guild members are discoverable with truthful history provenance',async()=>{
  const r=await analyzeMembers({mode:'member',query:'Don866',role:null,limit:10});
  assert.equal(r.cardFound,false);
  assert.equal(r.totalMatches,1);
  assert.equal(r.members[0].name,'Don866');
  assert.equal(r.members[0].level,null);
  assert.deepEqual(r.sourceCollections,['careers']);
  assert.equal(r.members[0].membershipStatus,'unknown');
});
test('direct career-only answers do not convert relative notices to today',async()=>{
  const r=await verifiedAnswer('Who is Don866?');
  assert.match(r.answer,/Pirate Careers archive/);
  assert.match(r.answer,/12 hours ago/);
  assert.match(r.answer,/2026-10-29/);
  assert.match(r.answer,/membership is unknown/i);
  assert.deepEqual(r.sources.map(s=>s.id),['careers']);
});
test('GLB biggest recorded rank movers come from actual placement changes',async()=>{
  assert.equal(directQuestion('Which guild moved up the most on the GLB?'),'glb_movers');
  const r=await verifiedAnswer('Which guild moved up the most on the GLB?');
  assert.match(r.answer,/biggest risers/i);
  assert.match(r.answer,/Biggest falls/i);
  assert.match(r.answer,/Only guilds recorded in both snapshots/i);
  assert.deepEqual(r.sources.map(s=>s.id),['glb']);
});
test('Cove lead question returns the specific next-rank gaps, not a made-up lead',async()=>{
  assert.equal(directQuestion('How much of a lead does the Cove have?'),'cove_nearest_ranks');
  const r=await verifiedAnswer('How much of a lead does the Cove have?');
  assert.match(r.answer,/132,125/);
  assert.match(r.answer,/66,966/);
});
test('member roles and historical snapshots never assert confirmed live status',async()=>{
  const cases=['Who is ChezShork?','Who is SAWTOOTH?','Who are the officers?','How many recruits do we have?'];
  for(const question of cases){
    const r=await verifiedAnswer(question);
    assert.match(r.answer,/not live|not verified live|not a verified live roster/i);
  }
});
