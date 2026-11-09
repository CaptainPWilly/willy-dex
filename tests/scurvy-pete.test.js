'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
// The API is always mocked in this suite. A dummy env key lets the HTTP
// handler exercise its real validation path without CI secrets or network.
const originalApiKey=process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY='scurvy-pete-offline-test-only';
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
test.after(()=>{
  global.fetch=originalFetch;
  if(originalApiKey===undefined)delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY=originalApiKey;
});
test('routes war reward XP separately from guild season XP',()=>{
  assert.equal(routeTool('How much XP do war victories reward?'),'find_wins');
  assert.equal(routeTool('How much GXP did the Cove gain this season?'),'analyze_glb');
  assert.equal(routeTool('Which player earned the most XP?'),'find_cards');
  assert.equal(routeTool('How much guild XP did the Cove gain?'),'analyze_glb');
  assert.equal(routeTool('Who was removed from the guild?'),'find_careers');
  assert.equal(routeTool('Who are the officers?'),'analyze_members');
  assert.equal(routeTool('Who are the founders?'),'analyze_members');
  assert.equal(routeTool('Show me the current roster'),'analyze_members');
  assert.equal(routeTool('List our crew'),'analyze_members');
  assert.equal(routeTool('Who are the recruits?'),'analyze_members');
  assert.equal(routeTool('What wars are on record?'),'find_wars');
  assert.equal(routeTool('Show me the new videos'),'find_videos');
  assert.equal(routeTool('What SMMO tags do we have?'),'find_tags');
});
test('detects numeric questions without using the language model',()=>{
  assert.equal(directQuestion('Biggest xp day for the cove?'),'best_gxp_day');
  assert.equal(directQuestion('What was our highest GXP day?'),'best_gxp_day');
  assert.equal(directQuestion('How many wars has the Cove won?'),'war_win_count');
  assert.equal(directQuestion('How many Willy Dex cards?'),'card_count');
  assert.equal(directQuestion('Who has the highest level on Willy Dex cards?'),'highest_card_level');
  assert.equal(directQuestion('Who has the highest level?'),null);
  assert.equal(directQuestion('What rank is the Cove?'),'cove_latest_rank');
  assert.equal(directQuestion('What was the Cove rank on October 29?'),null);
  assert.equal(directQuestion('What was the Cove rank in Season 14?'),null);
  assert.equal(directQuestion('Biggest war reward XP day?'),null);
  assert.equal(directQuestion('Biggest XP day for Helheim?'),null);
  assert.equal(directQuestion('How many wars has Helheim won?'),null);
  assert.equal(directQuestion('How many cards does Helheim have?'),null);
  assert.equal(directQuestion('How many current Cove members?'),'current_roster_unknown');
  assert.equal(routeTool('Biggest XP day for Helheim?'),'find_leaderboard');
});
test('current Cove membership counts cannot be fabricated from card slots',async()=>{
  useFixtures(()=>{throw Error('No model expected');});
  const r=await verifiedAnswer('How many current Cove members?');
  assert.match(r.answer,/not verified/i);
  assert.match(r.answer,/not a live roster count/i);
  assert.deepEqual(r.sources.map(x=>x.id),['cards']);
});
test('does not mistake Cove for Coven, or ambiguous guild aliases for an exact match',()=>{
  const {resolveNames}=pete.__test;
  assert.deepEqual(resolveNames(['The Pirate Cove','Coven','Wolf','Wolf Pack'],'Cove'),['The Pirate Cove']);
  assert.deepEqual(resolveNames(['The Pirate Cove','Coven','Wolf','Wolf Pack'],'Wolf'),['Wolf']);
  let error=null;
  try{resolveNames(['The Pirate Cove',"Dread Pirate's Cove",'Coven'],'Cove');}catch(e){error=e;}
  assert.ok(error);
  assert.match(error.message,/ambiguous/i);
});
test('rejects malformed model tool arguments at the server',()=>{
  const {validToolArgs}=pete.__test;
  const valid={guilds:['The Pirate Cove'],mode:'latest',limit:10,offset:0};
  assert.deepEqual(validToolArgs('find_leaderboard',valid),valid);
  for(const args of [
    {...valid,limit:5000},
    {...valid,offset:-1},
    {...valid,mode:'made_up'},
    {...valid,privateSecret:true},
    {...valid,guilds:[42]},
    {...valid,guilds:Array(9).fill('x')}
  ]){
    let error=null;
    try{validToolArgs('find_leaderboard',args);}catch(e){error=e;}
    assert.ok(error);
  }
});
test('flags numeric claims not present in source data',()=>{
  const {unsupportedNumbers}=pete.__test;
  assert.deepEqual(unsupportedNumbers('189,909 GXP in 2026','{"xpGain":189909,"date":"2026-10-30"}'),[]);
  assert.deepEqual(unsupportedNumbers('999,999 GXP in 2026','{"xpGain":189909,"date":"2026-10-30"}'),['999999']);
});
test('time-scoped and comparative questions never use an all-time shortcut',()=>{
  assert.equal(directQuestion('Biggest XP day for the Cove this week?'),null);
  assert.equal(directQuestion('How many wars has Cove won this month?'),null);
  assert.equal(directQuestion('Biggest XP day for Cove and Helheim?'),null);
  assert.equal(directQuestion('Top 10 highest level Willy Dex cards'),null);
  assert.equal(directQuestion('Who is the highest level active Cove member?'),null);
  assert.equal(directQuestion('Biggest XP day for the Cove?'),'best_gxp_day');
});
test('unverified AI numeric claims are blocked even after a successful archive lookup',async()=>{
  useFixtures(async (_req,turn)=>turn===1?{
    output:[{type:'function_call',name:'find_leaderboard',call_id:'numbers-1',
      arguments:JSON.stringify({guilds:['The Pirate Cove'],mode:'latest',limit:1,offset:0})}]
  }:{output:[{type:'message',content:[{type:'output_text',text:'The Cove earned 999,999 XP today.'}]}]});
  let response;
  await pete.handle(
    {url:'/api/pete/chat',method:'POST',headers:{origin:'https://captainpwilly.github.io'}},{},
    {origin:'https://captainpwilly.github.io',authorized:()=>true,
     read:async()=>({message:'Summarize recent GLB trends across Helheim, the Cove, and Ascended.',history:[]}),
     json:(_res,status,data)=>{response={status,data};}});
  assert.equal(response.status,200);
  assert.equal(response.data.evidence,'numeric-check-failed');
  assert.match(response.data.answer,/could not verify/i);
});
test('incomplete AI responses do not become published facts',async()=>{
  useFixtures(async()=>({status:'incomplete',output:[{
    type:'message',content:[{type:'output_text',text:'Invented claim 100000000 XP.'}]
  }]}));
  let response;
  await pete.handle(
    {url:'/api/pete/chat',method:'POST',headers:{origin:'https://captainpwilly.github.io'}},{},
    {origin:'https://captainpwilly.github.io',authorized:()=>true,
     read:async()=>({message:'Explain what the record says about members',history:[]}),
     json:(_res,status,data)=>{response={status,data};}});
  assert.equal(response.status,502);
  assert.ok(!JSON.stringify(response.data).includes('100000000'));
});
test('failed archive tool lookups cannot produce verified answers',async()=>{
  useFixtures(async (_req,turn)=>turn===1?{
    output:[{type:'function_call',name:'find_leaderboard',call_id:'bad-arg',
      arguments:JSON.stringify({guilds:['The Pirate Cove'],mode:'latest',limit:5000,offset:0})}]
  }:{output:[{type:'message',content:[{type:'output_text',text:'Pete fabricated a number 1234567.'}]}]});
  let response;
  await pete.handle(
    {url:'/api/pete/chat',method:'POST',headers:{origin:'https://captainpwilly.github.io'}},{},
    {origin:'https://captainpwilly.github.io',authorized:()=>true,
     read:async()=>({message:'What was the last leaderboard?',history:[]}),
     json:(_res,status,data)=>{response={status,data};}});
  assert.equal(response.status,200);
  assert.equal(response.data.evidence,'partial');
  assert.ok(!response.data.answer.includes('1234567'));
});
test('resolved GLB lookup never mistakes Cove for Coven',async()=>{
  useFixtures(()=>{throw Error('No model expected');});
  const r=await RESULTS.find_leaderboard({guilds:['Cove'],mode:'latest',limit:10,offset:0});
  assert.ok(r.standings.length===1);
  assert.equal(r.standings[0].name,'The Pirate Cove');
});
test('rapid wrong access-key guesses are throttled before AI is called',async()=>{
  useFixtures(()=>{throw Error('AI must not be called for invalid access keys');});
  const origin='https://captainpwilly.github.io';
  const statuses=[];
  for(let i=0;i<13;i++){
    await pete.handle({url:'/api/pete/chat',method:'POST',socket:{remoteAddress:'192.0.2.199'},headers:{origin,authorization:'Bearer wrong-code'}},{},{
      origin,authorized:()=>false,read:async()=>({message:'Ping',history:[]}),
      json:(_res,status)=>statuses.push(status)
    });
  }
  assert.deepEqual(statuses.slice(0,12),Array(12).fill(401));
  assert.equal(statuses[12],429);
});
test('Ahoy is conversational and never opens an irrelevant archive',async()=>{
  useFixtures(()=>{throw Error('A greeting must not invoke AI.');});
  const r=await verifiedAnswer('Ahoy!');
  assert.match(r.answer,/ahoy/i);
  assert.deepEqual(r.sources,[]);
  assert.equal(r.evidence,'conversation');
  assert.equal(modelRequests.length,0);
});
test('season status is calculated from actual first and latest GLB snapshots',async()=>{
  useFixtures(()=>{throw Error('The model must not invent season stats.');});
  const r=await verifiedAnswer('How is the cove doing this season?');
  const d=fixture('glb.json');
  const observations=d.snapshots.slice().sort((a,b)=>Date.parse(a.capturedAt)-Date.parse(b.capturedAt))
    .map(s=>({capturedAt:s.capturedAt,cove:s.guilds.find(g=>g.name==='The Pirate Cove')}))
    .filter(s=>s.cove);
  const first=observations[0],last=observations.at(-1),previous=observations.at(-2);
  const total=last.cove.experience-first.cove.experience;
  assert.match(r.answer,new RegExp(total.toLocaleString('en-US')));
  assert.match(r.answer,new RegExp(last.cove.experience.toLocaleString('en-US')));
  assert.match(r.answer,new RegExp('#'+last.cove.rank));
  assert.match(r.answer,new RegExp((last.cove.experience-previous.cove.experience).toLocaleString('en-US')));
  assert.match(r.answer,/archived snapshots, not live/i);
  assert.deepEqual(r.sources.map(x=>x.id),['glb']);
  assert.equal(modelRequests.length,0);
});
test('latest Cove GXP is direct, date-stamped and sourced to GLB',async()=>{
  useFixtures(()=>{throw Error('No AI should be needed for latest GXP.');});
  const r=await verifiedAnswer('Latest guild xp for the cove');
  const last=fixture('glb.json').snapshots.at(-1);
  const row=last.guilds.find(x=>x.name==='The Pirate Cove');
  assert.match(r.answer,new RegExp(row.experience.toLocaleString('en-US')));
  assert.match(r.answer,new RegExp('#'+row.rank));
  assert.match(r.answer,/not live data/i);
  assert.deepEqual(r.sources.map(x=>x.id),['glb']);
});
test('Cove recruit count uses Recruit-tagged cards, not career status',async()=>{
  useFixtures(()=>{throw Error('No AI should be needed for recorded recruits.');});
  const r=await verifiedAnswer('How many recruits do we have');
  const cards=fixture('cards.json');
  const recruits=cards.filter(c=>(c.roles||[]).includes('Recruit')&&String(c.guild).toUpperCase()==='ARG');
  assert.match(r.answer,new RegExp('\\b'+recruits.length+' Cove recruits\\b'));
  for(const card of recruits)assert.ok(r.answer.includes(card.name));
  assert.match(r.answer,/not a verified live roster/i);
  assert.deepEqual(r.sources.map(x=>x.id),['cards']);
  assert.equal(modelRequests.length,0);
});
test('another guild recruit count does not inherit Cove records',async()=>{
  assert.equal(directQuestion('How many recruits does Helheim have?'),null);
  assert.equal(directQuestion('How many recruits are in Umbral?'),null);
  assert.equal(directQuestion('How many recruits do we have'),'recruit_count');
});
test('the Pete HTTP chat endpoint returns all three corrected answers without model calls',async()=>{
  useFixtures(()=>{throw Error('The model should not be called for these prompts');});
  const origin='https://captainpwilly.github.io';
  const queries=[
    ['Ahoy!',/Ahoy/,0],
    ['How is the cove doing this season?',/Season \d+:/,1],
    ['How many recruits do we have',/Cove recruits:/,1],
    ['Latest guild xp for the cove',/GXP, rank #/,1]
  ];
  for(const [message,regex,expectedSources] of queries){
    let response;
    await pete.handle(
      {url:'/api/pete/chat',method:'POST',socket:{remoteAddress:'198.51.100.45'},headers:{origin}},{},
      {origin,authorized:()=>true,read:async()=>({message,history:[]}),
      json:(_res,status,data)=>{response={status,data};}}
    );
    assert.equal(response.status,200);
    assert.match(response.data.answer,regex);
    assert.equal(response.data.sources.length,expectedSources);
  }
  assert.equal(modelRequests.length,0);
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
test('does not confuse other guilds\' war wins with the Cove\'s wins',async()=>{
  useFixtures(()=>{throw Error('The model must not fabricate another guild\'s win count');});
  const r=await verifiedAnswer('How many wars has Helheim won?');
  assert.match(r.answer,/not helheim/i);
  assert.match(r.answer,/cannot be verified/i);
  assert.deepEqual(r.sources.map(s=>s.id),['wins']);
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


test('ordinary conversation works without forcing a Willy Dex lookup',async()=>{
  useFixtures(async()=>({output:[{type:'message',content:[
    {type:'output_text',text:'Start with the option you can reverse most easily, then gather evidence.'}
  ]}]}));
  let response;
  await pete.handle(
    {url:'/api/pete/chat',method:'POST',headers:{origin:'https://captainpwilly.github.io'}},{},
    {origin:'https://captainpwilly.github.io',authorized:()=>true,
      read:async()=>({message:'Help me think through a tricky decision.',history:[]}),
      json:(_res,status,data)=>{response={status,data};}});
  assert.equal(response.status,200);
  assert.equal(response.data.evidence,'conversation');
  assert.deepEqual(response.data.sources,[]);
  assert.match(response.data.answer,/option you can reverse/i);
  assert.equal(modelRequests[0].tool_choice,'auto');
});
test('a short GLB follow-up retains the previous guild question',async()=>{
  const history=[
    {role:'user',content:'What is the latest Cove GXP?'},
    {role:'assistant',content:'The Cove is #24 in the recorded leaderboard.'}
  ];
  assert.equal(pete.__test.conversationalFollowup('And Helheim?',history),true);
  assert.equal(pete.__test.archiveQuestion('And Helheim?',history,true),true);
  useFixtures(async (_request,turn)=>turn===1?{
    output:[{type:'function_call',name:'find_leaderboard',call_id:'followup-1',
      arguments:JSON.stringify({guilds:['Helheim'],mode:'latest',limit:1,offset:0})}]
  }:{output:[{type:'message',content:[
    {type:'output_text',text:'Helheim appears in the latest recorded Season 15 standings.'}
  ]}]});
  let response;
  await pete.handle(
    {url:'/api/pete/chat',method:'POST',headers:{origin:'https://captainpwilly.github.io'}},{},
    {origin:'https://captainpwilly.github.io',authorized:()=>true,
      read:async()=>({message:'And Helheim?',history}),
      json:(_res,status,data)=>{response={status,data};}});
  assert.equal(response.status,200);
  assert.equal(modelRequests[0].tool_choice.name,'find_leaderboard');
  assert.ok(modelRequests[0].input.some(x=>x.role==='user'&&x.content==='What is the latest Cove GXP?'));
  assert.equal(response.data.evidence,'archive-lookup');
  assert.deepEqual(response.data.sources.map(x=>x.id),['glb']);
});
