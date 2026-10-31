#!/usr/bin/env node
'use strict';
// Immutable, source-backed GLB video editions. Builtins only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const write=(p,s)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s)};
const raw=process.argv[2]?fs.readFileSync(path.resolve(process.argv[2]),'utf8'):read('glb.json');
const glb=JSON.parse(raw);
const check=(ok,message)=>{if(!ok)throw Error('Invalid GLB: '+message)};
check(Number.isInteger(glb.season)&&glb.season>0,'season');
check(Array.isArray(glb.snapshots)&&glb.snapshots.length>0,'snapshots');
for(let i=0;i<glb.snapshots.length;i++){
 const s=glb.snapshots[i];
 check(Array.isArray(s.guilds)&&s.guilds.length>=25,'incomplete snapshot '+i);
 const rows=s.guilds.slice().sort((a,b)=>a.rank-b.rank);
 check(rows.every((g,j)=>g&&g.rank===j+1&&typeof g.name==='string'&&g.name.length&&Number.isFinite(g.experience)&&g.experience>=0),'invalid ranks or XP in snapshot '+i);
 check(new Set(rows.map(g=>g.name)).size===rows.length,'duplicate guild in snapshot '+i);
 if(i&&s.capturedAt&&glb.snapshots[i-1].capturedAt)check(Date.parse(s.capturedAt)>=Date.parse(glb.snapshots[i-1].capturedAt),'time order');
}
const first=glb.snapshots[0],last=glb.snapshots[glb.snapshots.length-1];
const hash=crypto.createHash('sha256').update(JSON.stringify(glb)).digest('hex');
const stamp=(last.capturedAt||last.date||'undated').replace(/[^0-9TZ:-]/gi,'').replace(/:/g,'-').slice(0,32);
// Include the director template and encoder in the ID so an updated edit makes
// a new immutable video, without overwriting or silently reusing an older MP4.
const editSignature=crypto.createHash('sha256')
 .update(read('season-15-check-in.html')).update('\n')
 .update(read('scripts/render-glb-hq.cjs')).digest('hex').slice(0,8);
const id='s'+glb.season+'-'+stamp+'-'+hash.slice(0,12)+'-'+editSignature;
const folder='checkins/editions/'+id;
const manifestPath='checkins/manifest.json';
let manifest={schema:1,latest:null,editions:[]};
if(fs.existsSync(path.join(root,manifestPath)))manifest=JSON.parse(read(manifestPath));
check(Array.isArray(manifest.editions),'archive manifest is invalid');
const existing=manifest.editions.find(e=>e.id===id);
const leader=last.guilds.find(g=>g.rank===1),cove=last.guilds.find(g=>g.name==='The Pirate Cove');
const meta={
 id,season:glb.season,firstCapturedAt:first.capturedAt||null,capturedAt:last.capturedAt||null,
 firstDate:first.date||null,date:last.date||null,snapshots:glb.snapshots.length,guilds:last.guilds.length,
 leader:leader?.name||'???',leaderXp:leader?.experience??null,
 cove:cove?{rank:cove.rank,experience:cove.experience}:null,
 contentHash:hash,sourceCommit:process.env.GITHUB_SHA||null,
 generatedAt:existing?.generatedAt||new Date().toISOString(),
 page:'editions/'+id+'/index.html',data:'editions/'+id+'/data.json',video:existing?.video||('https://github.com/CaptainPWilly/willy-dex/releases/download/'+id+'/'+id+'.mp4')
};
if(!existing){
 write(folder+'/data.json',JSON.stringify(glb,null,2)+'\n');
 let html=read('season-15-check-in.html');
 html=html.replace('<head>','<head>\n<base href="../../../">\n<meta name="robots" content="noindex,nofollow,noarchive">\n<meta name="willy-dex-edition" content="'+id+'">');
 html=html.replace(/Season 15/g,'Season '+glb.season).replace(/SEASON 15/g,'SEASON '+glb.season);
 html=html.replace(/d\.season!==15/g,'d.season!=='+glb.season);
 html=html.replace(/fetch\('glb\.json',\{cache:'no-store'\}\)/g,"fetch('"+folder+"/data.json',{cache:'no-store'})");
 html=html.replace(/<a href="glb\.json">/g,'<a href="'+folder+'/data.json">');
 html=html.replace('</style>','a.export-video{display:block;max-width:500px;margin:12px auto;text-align:center;background:#dbaf6e;color:#1d110b;font-size:15px;font-weight:900;padding:15px 20px;border-radius:9px;text-decoration:none}a.export-video:hover{background:#f4d29d}</style>');
 html=html.replace('<div class="meta"><span>9:16 Shorts framing</span>','<a class="export-video" href="'+meta.video+'">↓ DOWNLOAD MP4 FOR YOUTUBE</a>\n<div class="meta"><span>9:16 Shorts framing</span>');
 html=html.replace('</main>','<div class="meta"><a href="checkins/index.html">ALL SAVED EDITIONS</a> · <span>ARCHIVE '+id+'</span></div></main>');
 check(html.includes("fetch('"+folder+"/data.json'"),'player source was not pinned');
 write(folder+'/index.html',html);
 manifest.editions.unshift(meta);
}else{
 check(fs.existsSync(path.join(root,folder+'/index.html')),'archive HTML missing for '+id);
}
manifest.editions.sort((a,b)=>(b.capturedAt||b.date||'').localeCompare(a.capturedAt||a.date||'')||(b.generatedAt||'').localeCompare(a.generatedAt||''));
manifest.latest=manifest.editions[0]?.id||null;
write(manifestPath,JSON.stringify(manifest,null,2)+'\n');
const newest=manifest.editions[0];
write('checkins/latest.html','<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=player.html"><title>Latest GLB Video</title></head><body><a href="player.html">Watch and download latest GLB video</a></body></html>\n');
write('.glb-last-edition',id+'\n');
console.log(JSON.stringify({id,created:!existing,editions:manifest.editions.length,snapshots:glb.snapshots.length}));
