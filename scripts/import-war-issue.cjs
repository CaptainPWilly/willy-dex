#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const crypto=require('node:crypto');
const raw=process.env.ISSUE_BODY||'';
const issued=process.env.ISSUE_NUMBER||'';
const marker='WILLY-DEX WAR SNAPSHOT';
if(!raw.includes(marker))throw Error('Missing snapshot marker');
const match=raw.match(/Captured at:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
if(!match||!Number.isFinite(Date.parse(match[1])))throw Error('Missing valid ISO capture time');
const capturedAt=match[1],capture=Date.parse(capturedAt);
if(capture>Date.now()+3600000)throw Error('Capture timestamp is in the future');
const start=raw.indexOf('=== WAR LIST START ==='),end=raw.indexOf('=== WAR LIST END ===');
if(start<0||end<=start)throw Error('Missing war list boundaries');
const source=raw.slice(start+'=== WAR LIST START ==='.length,end).trim();
if(!source||source.length>200000)throw Error('Missing or excessive war list');
const lines=source.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
const norm=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const ageDays=s=>{const m=s.match(/started\s+(\d+|a|an|one)\s+(minute|hour|day|week|month|year)s?\s+ago/i);if(!m)return null;return (/^(a|an|one)$/i.test(m[1])?1:Number(m[1]))*({minute:1/1440,hour:1/24,day:1,week:7,month:30.44,year:365.25})[m[2].toLowerCase()]};
const parsed=[];
for(let i=0;i<lines.length;i++){
 const a=lines[i],b=lines[i+1],x=lines[i+2]?.match(/^([\d,]+)\s+kills?$/i),y=lines[i+3]?.match(/^([\d,]+)\s+kills?$/i),age=lines[i+4];
 if(!a||!b||!x||!y||!age||!/^this war started/i.test(age))continue;
 if(a.length>120||b.length>120||norm(a)===norm(b)||!norm(a)||!norm(b))throw Error('Invalid guild pairing');
 const killsA=Number(x[1].replaceAll(',','')),killsB=Number(y[1].replaceAll(',',''));
 if(!Number.isSafeInteger(killsA)||!Number.isSafeInteger(killsB))throw Error('Invalid kills');
 parsed.push({guildA:a,guildB:b,killsA,killsB,ageText:age,ageDays:ageDays(age),status:'active'});i+=4;
}
if(!parsed.length||parsed.length>300)throw Error('Expected 1–300 valid wars');
const file='wars.json',doc=JSON.parse(fs.readFileSync(file,'utf8'));
if(!Array.isArray(doc.snapshots)||doc.version!==1)throw Error('Invalid registry');
if(doc.snapshots.some(s=>s.issueNumber===issued))throw Error('Issue already ingested');
const all=new Map();
for(const snap of doc.snapshots)for(const w of snap.wars){
 const key=[norm(w.guildA),norm(w.guildB)].sort().join('|');
 if(!all.has(key))all.set(key,new Map());
 const group=all.get(key);
 if(!group.has(w.warId))group.set(w.warId,[]);
 group.get(w.warId).push({...w,capturedAt:snap.capturedAt});
}
const seen=new Set();
for(const w of parsed){
 const key=[norm(w.guildA),norm(w.guildB)].sort().join('|');
 const candidates=[];
 for(const [id,rows] of (all.get(key)||new Map())){
  const last=rows.sort((a,b)=>Date.parse(a.capturedAt)-Date.parse(b.capturedAt)).at(-1);
  const elapsed=(capture-Date.parse(last.capturedAt))/86400000;
  if(elapsed<0)continue;
  const agesAgree=w.ageDays!==null&&last.ageDays!==null&&Math.abs((w.ageDays-last.ageDays)-elapsed)<=Math.max(4,elapsed*.12);
  const sameOrUnknown=w.ageDays===null||last.ageDays===null||agesAgree;
  const oldA=norm(last.guildA)===norm(w.guildA)?last.killsA:last.killsB,oldB=norm(last.guildB)===norm(w.guildB)?last.killsB:last.killsA;
  if(sameOrUnknown&&w.killsA>=oldA&&w.killsB>=oldB)candidates.push(id);
 }
 if(candidates.length>1)throw Error('Ambiguous prior wars: '+w.guildA+' vs '+w.guildB);
 w.warId=candidates[0]||'war-'+crypto.randomUUID();
 if(seen.has(w.warId))throw Error('Duplicated war identity in one list');
 seen.add(w.warId);
}
doc.snapshots.push({id:crypto.randomUUID(),issueNumber:issued,capturedAt,savedAt:new Date().toISOString(),raw:source,wars:parsed});
doc.snapshots.sort((a,b)=>Date.parse(a.capturedAt)-Date.parse(b.capturedAt));
fs.writeFileSync(file,JSON.stringify(doc,null,2)+'\n');
console.log('Recorded',parsed.length,'wars from issue',issued);
