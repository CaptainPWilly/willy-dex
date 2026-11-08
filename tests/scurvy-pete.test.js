'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const pete=require('../scurvy-pete-api');
const {directQuestion,routeTool,verifiedAnswer,captureMetadata,RESULTS}=pete.__test;
const prefix='https://raw.githubusercontent.com/CaptainPWilly/willy-dex/main/';
const originalFetch=global.fetch;
let modelRequests=[];
function fixture(file){return JSON.parse(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));}
function reply(value){return {ok:true,status:200,json:async()=>value};}
function useFixtures(model){
  modelRequests=[];
  global.fetch=async (url,options)=>{
    const uri=String(url);
    if(uri.startsWith(prefix))return reply(fixture(uri.slice(prefix.length)));
    if(uri==='https://api.openai.com/v1/responses'){
      const request=JSON.parse(options.body);
      modelRequests.push(request);
      return reply(await model(request,modelRequests.length));
    }
    throw Error('Unexpected test URL: '+uri);
  };
}
test.after(()=>{global.fetch=originalFetch;});
test('routes war reward XP separately from guild season XP',()=>{
  assert.equal(routeTool('How much XP do war victories reward?'),'find_wins');
  assert.equal(routeTool('How much GXP did the Cove gain this season?'),'find_leaderboard');
  assert.equal(routeTool('Which player earned the most XP?'),'find_cards');
  assert.equal(routeTool('How much guild XP did the Cove gain?'),'find_leaderboard');
  assert.equal(routeTool('Who was removed from the guild?'),'find_careers');
  assert.equal(routeTool('Who are the officers?'),'find_cards');
  assert.equal(routeTool('Who are the founders?'),'find_cards');
  assert.equal(routeTool('Show me the current roster'),'find_cards');
  assert.equal(routeTool('List our crew'),'find_cards');
  assert.equal(routeTool('Who are the recruits?'),'find_cards');
  assert.equal(routeTool('What wars are on record?'),'find_wars');
  assert.equal(routeTool('Show me the new videos'),'find_videos');
  assert.equal(routeTool('What SMMO tags do we have?'),'find_tags');
});
test('detects numeric questions without using the language model',()=>{
  assert.equal(directQuestion('Biggest xp day for the cove?'),'best_gxp_day');
  assert.equal(directQuestion('What was our highest GXP day?'),'best_gxp_day');
  assert.equal(directQuestion('How many wars has the Cove won?'),'war_win_count');
  assert.equal(directQuestion('How many Willy Dex cards?'),'card_count');
  assert.equal(directQuestion('Who has the highest level?'),'highest_card_level');
  assert.equal(directQuestion('What rank is the Cove?'),'cove_latest_rank');
  assert.equal(directQuestion('What was the Cove rank on October 29?'),null);
  assert.equal(directQuestion('What was the Cove rank in Season 14?'),null);
  assert.equal(directQuestion('Biggest war reward XP day?'),null);
});
test('missing numeric values stay unknown rather than being converted to zero',()=>{
  const {digits}=pete.__test;
  assert.equal(digits(null),null);
  assert.equal(digits(undefined),null);
  assert.equal(digits('???'),null);
  assert.equal(digits(''),null);
  assert.equal(digits('0'),0);
  assert.equal(digits('218374'),218374);
});
test('computes the largest observed between-day GXP increase from recorded snapshots',async()=>{
  useFixtures(()=>{throw Error('The model must not be called for this question');});
  const r=await verifiedAnswer('Biggest xp day for the cove?');
  const glb=fixture('glb.json'),ss=glb.snapshots;
  const daily=new Map();
  for(const s of ss)for(const row of s.guilds||[])if(row.name==='The Pirate Cove'){
    const day=(s.capturedAt||s.date).slice(0,10);
    const before=daily.get(day);
    if(!before||Date.parse(s.capturedAt)>Date.parse(before.at))daily.set(day,{date:day,at:s.capturedAt,xp:row.experience});
  }
  const days=[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date)),gains=[];
  for(let i=1;i<days.length;i++)if((Date.parse(days[i].date)-Date.parse(days[i-1].date))/86400000===1)
    gains.push(days[i].xp-days[i-1].xp);
  assert.match(r.answer,new RegExp(Math.max(...gains).toLocaleString('en-US')));
  assert.match(r.answer,/not an exact calendar-day or 24-hour maximum/i);
  assert.deepEqual(r.sources.map(x=>x.id),['glb']);
  assert.equal(modelRequests.length,0);
});
test('correctly credits kills to the Cove regardless of side A or B',async()=>{
  useFixtures(()=>{throw Error('No model expected');});
  const r=await RESULTS.find_wars({guild:'The Pirate Cove',opponent:null,scope:'latest',limit:100,offset:0});
  const a=r.wars.find(x=>x.guildA==='The Pirate Cove'&&x.guildB==='Arcane');
  const b=r.wars.find(x=>x.guildA==='Kairos'&&x.guildB==='The Pirate Cove');
  assert.ok(a&&b);
  assert.equal(a.coveKills,a.killsA);
  assert.equal(a.coveOpponentKills,a.killsB);
  assert.equal(b.coveKills,b.killsB);
  assert.equal(b.coveOpponentKills,b.killsA);
  assert.equal(r.threshold,1500);
});
test('never treats registry counts as a live membership count',async()=>{
  useFixtures(()=>{throw Error('No model expected');});
  const r=await verifiedAnswer('How many Willy Dex cards?');
  assert.match(r.answer,/populated cards/);
  assert.match(r.answer,/not a live guild membership count/);
  assert.deepEqual(r.sources.map(s=>s.id),['cards']);
});
test('war victory counts come from wins, not active war snapshots',async()=>{
  useFixtures(()=>{throw Error('No model expected');});
  const r=await verifiedAnswer('How many wars has the Cove won?');
  const count=fixture('war-victories.json').records.length;
  assert.match(r.answer,new RegExp('\\b'+count+'\\b'));
  assert.deepEqual(r.sources.map(s=>s.id),['wins']);
  assert.match(r.answer,/archived total/);
});
test('archive freshness uses actual input import dates',()=>{
  const career=fixture('pirate-careers.json');
  const expected=[career.importMetadata?.recordedAt,career.departureImport?.reportedOn,
    career.removalImport?.reportedOn,...(career.additionalRemovalImports||[]).map(x=>x.reportedOn)].filter(Boolean).sort().at(-1);
  assert.equal(captureMetadata('careers',career).lastRecordAt,expected);
  assert.equal(captureMetadata('glb',fixture('glb.json')).archived,true);
});
test('source tool dispatch is forced for domain questions and includes archive status',async()=>{
  useFixtures(async (_request,turn)=>turn===1?{
    output:[{type:'function_call',name:'find_wars',call_id:'test-war-1',
      arguments:JSON.stringify({guild:'The Pirate Cove',opponent:null,scope:'latest',limit:3,offset:0})}]
  }:{output:[{type:'message',content:[{type:'output_text',text:'The war data is historical.'}]}]});
  let response;
  await pete.handle(
    {url:'/api/pete/chat',method:'POST',headers:{origin:'https://captainpwilly.github.io'}},{},
    {origin:'https://captainpwilly.github.io',authorized:()=>true,
      read:async()=>({message:'Which wars have our opponents attacked?',history:[]}),
      json:(_res,status,data)=>{response={status,data};}});
  assert.equal(response.status,200);
  assert.deepEqual(response.data.sources.map(x=>x.id),['wars']);
  assert.deepEqual(modelRequests[0].tool_choice,{type:'function',name:'find_wars'});
  const evidence=modelRequests[1].input.find(x=>x.type==='function_call_output');
  const data=JSON.parse(evidence.output);
  assert.equal(data.archiveStatus.collection,'wars');
  assert.equal(data.archiveStatus.archived,true);
  assert.equal(data.wars.length,3);
});
test('unverified model assertions do not become a source-grounded answer',async()=>{
  useFixtures(async()=>({output:[{type:'message',content:[{type:'output_text',text:'The secret guild rank is 9999.'}]}]}));
  let response;
  await pete.handle(
    {url:'/api/pete/chat',method:'POST',headers:{origin:'https://captainpwilly.github.io'}},{},
    {origin:'https://captainpwilly.github.io',authorized:()=>true,
      read:async()=>({message:'What is the secret guild rank in a hidden database?',history:[]}),
      json:(_res,status,data)=>{response={status,data};}});
  assert.equal(response.status,200);
  assert.match(response.data.answer,/could not verify/);
  assert.equal(response.data.sources.length,0);
});
