#!/usr/bin/env node
'use strict';
/* Realtime canvas recorder for each immutable GLB check-in. Converts browser
   WebM + original synthesized soundtrack to fast-start H.264/AAC MP4.
   Browser page uses ONLY the archived JSON for this edition. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {spawnSync}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const id=process.argv[2];
if(!id||!/^[a-zA-Z0-9-]+$/.test(id))throw Error('Usage: node scripts/render-glb-checkin.cjs <edition-id>');
const edition=path.join(root,'checkins','editions',id);
if(!fs.existsSync(path.join(edition,'index.html')))throw Error('Edition not found: '+id);
const output=path.join(root,'checkins','output');
fs.mkdirSync(output,{recursive:true});
const webm=path.join(output,id+'.webm'),mp4=path.join(output,id+'.mp4');
const mime={html:'text/html;charset=utf-8',json:'application/json',js:'text/javascript',svg:'image/svg+xml',css:'text/css',png:'image/png',webp:'image/webp'};
const server=http.createServer((req,res)=>{
 try{
   const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   const abs=path.resolve(root,'.'+rel);
   if(abs!==root&&!abs.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
   const content=fs.readFileSync(abs);
   res.writeHead(200,{'content-type':mime[path.extname(abs).slice(1)]||'application/octet-stream','cache-control':'no-store'});
   res.end(content);
 }catch(e){res.writeHead(404);res.end('Not found')}
});
async function run(){
 await new Promise((ok,fail)=>server.listen(0,'127.0.0.1',e=>e?fail(e):ok()));
 let browser;
 try{
   const port=server.address().port;
   browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
   const context=await browser.newContext({acceptDownloads:true,viewport:{width:820,height:1600}});
   const page=await context.newPage();
   page.on('pageerror',error=>console.error('VIDEO PAGE ERROR:',error.message));
   page.on('console',entry=>{if(entry.type()==='error')console.error('VIDEO PAGE CONSOLE:',entry.text())});
   page.on('requestfailed',req=>console.error('VIDEO PAGE REQUEST:',req.url(),req.failure()?.errorText));
   // Tap the original audio mix once, before any envelope gain nodes are made.
   await page.addInitScript(()=>{
     const C=window.AudioContext||window.webkitAudioContext;
     if(!C)return;
     const original=C.prototype.createGain;
     C.prototype.createGain=function(...args){
       const g=original.apply(this,args);
       if(!window.__glbMixDest){
         const dst=this.createMediaStreamDestination();
         g.connect(dst);
         window.__glbMixDest=dst;
       }
       return g;
     };
   });
   await page.goto('http://127.0.0.1:'+port+'/checkins/editions/'+id+'/index.html',{waitUntil:'load',timeout:30000});
   try{await page.waitForFunction(()=>!document.querySelector('#play').disabled,null,{timeout:18000})}
   catch(err){
     const state=await page.evaluate(()=>({
       url:location.href,base:document.baseURI,
       status:document.getElementById('status')?.textContent,
       playDisabled:document.getElementById('play')?.disabled,
       meta:document.querySelector('meta[name="willy-dex-edition"]')?.content,
       scripts:document.scripts.length
     })).catch(e=>({failure:String(e)}));
     throw Error('Archived player did not load: '+JSON.stringify(state)+' | '+err.message);
   }
   const duration=await page.$eval('#seek',e=>Number(e.max));
   if(!Number.isFinite(duration)||duration<10||duration>180)throw Error('Unexpected video duration: '+duration);
   // Arm the video stream before playback, then attach the audio mix.
   await page.evaluate(()=>{window.__glbCanvasStream=document.querySelector('#film').captureStream(24)});
   await page.click('#play');
   await page.evaluate(()=>{
     const stream=window.__glbCanvasStream;
     if(window.__glbMixDest)stream.addTrack(window.__glbMixDest.stream.getAudioTracks()[0]);
     const types=['video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm'];
     const type=types.find(t=>MediaRecorder.isTypeSupported(t));
     if(!type)throw Error('No browser video recorder codec');
     const recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:3100000});
     window.__glbChunks=[];
     recorder.ondataavailable=e=>{if(e.data.size)window.__glbChunks.push(e.data)};
     window.__glbRecorder=recorder;
     recorder.start(1000);
   });
   await page.waitForFunction(()=>Number(document.querySelector('#seek').value)>=Number(document.querySelector('#seek').max)-.02,
                              null,{timeout:Math.ceil(duration*1000)+35000,polling:250});
   const download=page.waitForEvent('download',{timeout:30000});
   await page.evaluate(async()=>{
     const rec=window.__glbRecorder;
     const blob=await new Promise((resolve,reject)=>{
       rec.onerror=e=>reject(e.error||Error('Recording failed'));
       rec.onstop=()=>resolve(new Blob(window.__glbChunks,{type:rec.mimeType}));
       rec.stop();
     });
     if(blob.size<100000)throw Error('Recorded output was unexpectedly small');
     const a=document.createElement('a');
     a.href=URL.createObjectURL(blob);a.download='glb-archive.webm';document.body.appendChild(a);a.click();
   });
   const file=await download;await file.saveAs(webm);
   await context.close();
   console.log('Recorded '+id+' · '+duration+' seconds · '+(fs.statSync(webm).size/1048576).toFixed(2)+' MiB');
   const ff=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',webm,
     '-vf','scale=720:1280:flags=lanczos,fps=24','-c:v','libx264','-preset','medium','-crf','25',
     '-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart',mp4],
     {stdio:'inherit',timeout:240000});
   if(ff.status!==0)throw Error('ffmpeg export failed with code '+ff.status);
   const info=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',mp4],{encoding:'utf8'});
   const length=parseFloat(info.stdout);
   if(!Number.isFinite(length)||length<duration-4)throw Error('Export is truncated: '+length+'/'+duration+'s');
   if(fs.statSync(mp4).size<100000)throw Error('MP4 is unusually small');
   console.log('Exported downloadable H.264 MP4 '+mp4+' · '+length.toFixed(1)+' seconds');
 }finally{
   if(browser)await browser.close().catch(()=>{});
   await new Promise(resolve=>server.close(resolve));
 }
}
run().catch(e=>{console.error(e.stack||e);process.exitCode=1});
