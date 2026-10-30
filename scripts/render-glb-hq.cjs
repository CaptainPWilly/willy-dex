#!/usr/bin/env node
'use strict';
/**
 * Frame-accurate 1080x1920/60 export of a frozen GLB edition.
 * No screen-recording, no wall-clock dropped frames, no 720p downscale.
 * Chrome WebCodecs encodes deterministic frames with explicit timestamps.
 * Losslessly mux encoded H.264 with an original offline-rendered soundtrack.
 */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {spawnSync}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const id=process.argv[2];
if(!id||!/^[\w-]+$/.test(id))throw Error('Provide a valid archived edition ID');
const edition=path.join(root,'checkins','editions',id);
const sourcePage=path.join(edition,'index.html');
if(!fs.existsSync(sourcePage))throw Error('No archived episode: '+id);
const fps=60,output=path.join(root,'checkins','output');
fs.mkdirSync(output,{recursive:true});
const h264=path.join(output,id+'-HQ.h264'),wav=path.join(output,id+'-HQ.wav'),mp4=path.join(output,id+'-HQ-1080p60.mp4');
const testFrames=Number(process.env.GLB_TEST_FRAMES||0);
for(const p of [h264,wav,mp4])if(fs.existsSync(p))fs.unlinkSync(p);
const mime={html:'text/html;charset=utf-8',json:'application/json',js:'text/javascript',css:'text/css',svg:'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
 try{
  if(req.method==='POST'&&['/__video','/__audio'].includes(req.url)){
   const target=req.url==='/__video'?h264:wav;
   const file=fs.createWriteStream(target,{flags:req.url==='/__video'?'a':'w'});
   req.pipe(file);
   file.on('finish',()=>{res.writeHead(204);res.end()});
   file.on('error',()=>{res.writeHead(500);res.end('write error')});
   return;
  }
  if(req.method!=='GET'){res.writeHead(405);res.end();return}
  const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const abs=path.resolve(root,'.'+rel);
  if(abs!==root&&!abs.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
  let content=fs.readFileSync(abs);
  if(abs===sourcePage){
   // Inject a deterministic frame clock only in our local export; do not
   // modify the public archived player or source JSON.
   let html=content.toString('utf8');
   const marker="\npaint();\n})();";
   if(!html.includes(marker))throw Error('Cannot instrument GLB canvas player');
   html=html.replace(marker,"\nwindow.__glbSetFrame=(seconds)=>{t=Math.max(0,Math.min(duration,seconds));paint()};\nwindow.__glbVideoDuration=()=>duration;\npaint();\n})();");
   content=Buffer.from(html);
  }
  res.writeHead(200,{'content-type':mime[path.extname(abs).slice(1)]||'application/octet-stream','cache-control':'no-store'});
  res.end(content);
 }catch(e){console.error('HTTP',req.url,e.message);res.writeHead(404);res.end('Not found')}
});
const checkFile=p=>{const n=fs.statSync(p).size;if(n<100000)throw Error('Short output '+p+': '+n);return n};
async function run(){
 await new Promise((ok,fail)=>server.listen(0,'127.0.0.1',e=>e?fail(e):ok()));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--no-sandbox']});
  const page=await browser.newPage({viewport:{width:800,height:1600},deviceScaleFactor:1});
  page.on('pageerror',e=>console.error('PAGE ERROR:',e.message));
  page.on('console',m=>{if(m.type()==='error')console.error('PAGE CONSOLE:',m.text());else if(m.text().startsWith('ENCODE '))console.log(m.text())});
  await page.goto('http://127.0.0.1:'+server.address().port+'/checkins/editions/'+id+'/index.html',{waitUntil:'load'});
  await page.waitForFunction(()=>typeof window.__glbSetFrame==='function'&&!document.querySelector('#play').disabled,null,{timeout:20000});
  const duration=await page.evaluate(()=>window.__glbVideoDuration());
  if(!Number.isFinite(duration)||duration<10||duration>180)throw Error('Invalid duration '+duration);
  const frames=testFrames>0?Math.min(Math.floor(testFrames),Math.ceil(duration*fps)):Math.ceil(duration*fps);
  console.log('ENCODE '+frames+' independent frames at '+fps+'fps 1080x1920, duration '+(frames/fps).toFixed(3)+'s');
  const stats=await page.evaluate(async({frames,fps})=>{
    const canvas=document.getElementById('film');
    if(canvas.width!==1080||canvas.height!==1920)throw Error('Wrong canvas source size');
    if(!('VideoEncoder'in window))throw Error('Browser lacks WebCodecs VideoEncoder');
    const configs=[
      {codec:'avc1.64002a',width:1080,height:1920,bitrate:13500000,framerate:fps,latencyMode:'quality',avc:{format:'annexb'},hardwareAcceleration:'prefer-software'},
      {codec:'avc1.4d002a',width:1080,height:1920,bitrate:13000000,framerate:fps,latencyMode:'quality',avc:{format:'annexb'}},
      {codec:'avc1.42002a',width:1080,height:1920,bitrate:12500000,framerate:fps,latencyMode:'realtime',avc:{format:'annexb'}}
    ];
    let cfg=null;
    for(const c of configs){try{const r=await VideoEncoder.isConfigSupported(c);if(r.supported){cfg=r.config;break}}catch(e){}}
    if(!cfg)throw Error('No supported full-HD H264 WebCodecs encoder');
    let chunks=[],bytes=0,total=0,uploads=0,pending=Promise.resolve(),encodeError=null;
    const upload=()=>{
      if(!chunks.length)return;
      const payload=new Blob(chunks,{type:'application/octet-stream'});
      chunks=[];bytes=0;uploads++;
      pending=pending.then(async()=>{
        const res=await fetch('/__video',{method:'POST',body:payload});
        if(!res.ok)throw Error('Video transfer failed HTTP '+res.status);
      });
    };
    const encoder=new VideoEncoder({
      output:chunk=>{
        const data=new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        chunks.push(data);bytes+=data.length;total+=data.length;
        if(bytes>=4000000)upload();
      },
      error:e=>{encodeError=String(e)}
    });
    encoder.configure(cfg);
    for(let i=0;i<frames;i++){
      window.__glbSetFrame(i/fps);
      const frame=new VideoFrame(canvas,{timestamp:Math.round(i*1000000/fps),duration:Math.round(1000000/fps)});
      encoder.encode(frame,{keyFrame:i%120===0});
      frame.close();
      if(i%30===0||encoder.encodeQueueSize>5){
        // Let the browser drain the hardware/software encode queue, without
        // depending on realtime requestAnimationFrame or captureStream().
        while(encoder.encodeQueueSize>5)await new Promise(ok=>setTimeout(ok,12));
        if(encodeError)throw Error('Encoder failed: '+encodeError);
      }
      if(i%600===0)console.log('ENCODE '+i+'/'+frames);
    }
    await encoder.flush();
    upload();
    await pending;
    encoder.close();
    if(encodeError)throw Error('Encoder failed: '+encodeError);
    if(total<100000)throw Error('Encoded video unexpectedly tiny');
    return {frames,bytes:total,uploads,codec:cfg.codec};
  },{frames,fps});
  console.log('ENCODE complete '+JSON.stringify(stats));
  checkFile(h264);
  // Reconstruct the exact rhythmic composition using an OfflineAudioContext
  // rather than capturing glitchy audio from a realtime headless browser.
  const audioInfo=await page.evaluate(async({duration})=>{
    const sampleRate=48000,frames=Math.ceil(duration*sampleRate);
    const audio=new OfflineAudioContext(2,frames,sampleRate);
    const master=audio.createGain();master.gain.value=.18;master.connect(audio.destination);
    let seed=827193;
    const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
    const tone=(freq,t0,dur,vol,kind='sine')=>{
      const o=audio.createOscillator(),g=audio.createGain();
      o.type=kind;o.frequency.setValueAtTime(freq,t0);
      if(kind==='sine')o.frequency.exponentialRampToValueAtTime(Math.max(40,freq*.58),t0+dur);
      g.gain.setValueAtTime(Math.max(.0001,vol),t0);g.gain.exponentialRampToValueAtTime(.001,t0+dur);
      o.connect(g);g.connect(master);o.start(t0);o.stop(t0+dur+.02);
    };
    const noise=(t0,dur,vol)=>{
      const count=Math.ceil(sampleRate*dur),buf=audio.createBuffer(1,count,sampleRate),d=buf.getChannelData(0);
      for(let i=0;i<count;i++)d[i]=rand()*2-1;
      const s=audio.createBufferSource(),f=audio.createBiquadFilter(),g=audio.createGain();
      s.buffer=buf;f.type='highpass';f.frequency.value=1200;
      g.gain.setValueAtTime(vol,t0);g.gain.exponentialRampToValueAtTime(.001,t0+dur);
      s.connect(f);f.connect(g);g.connect(master);s.start(t0);s.stop(t0+dur+.01);
    };
    for(let b=0,t=.02;t<duration-.3;b++,t+=.5){
      if(b%4===0||b%4===2)tone(130,t,.27,.8);
      if(b%4===1||b%4===3)noise(t,.11,.22);
      noise(t,.045,.075);noise(t+.25,.04,.065);
      if(b%2===0)tone([55,55,65.4,49][Math.floor(b/4)%4],t+.03,.4,.13,'triangle');
    }
    const rendered=await audio.startRendering();
    const wav=new ArrayBuffer(44+frames*4),view=new DataView(wav);
    const ascii=(offset,s)=>{for(let i=0;i<s.length;i++)view.setUint8(offset+i,s.charCodeAt(i))};
    ascii(0,'RIFF');view.setUint32(4,36+frames*4,true);ascii(8,'WAVE');ascii(12,'fmt ');
    view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);
    view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*4,true);
    view.setUint16(32,4,true);view.setUint16(34,16,true);ascii(36,'data');
    view.setUint32(40,frames*4,true);
    const left=rendered.getChannelData(0),right=rendered.getChannelData(1);
    let p=44;
    for(let i=0;i<frames;i++){
      view.setInt16(p,Math.round(Math.max(-1,Math.min(1,left[i]))*32767),true);p+=2;
      view.setInt16(p,Math.round(Math.max(-1,Math.min(1,right[i]))*32767),true);p+=2;
    }
    const response=await fetch('/__audio',{method:'POST',body:wav});
    if(!response.ok)throw Error('Audio transfer failed '+response.status);
    return {samples:frames,rate:sampleRate,seconds:duration};
  },{duration:frames/fps});
  console.log('Audio '+JSON.stringify(audioInfo));
  checkFile(wav);
  const cmd=['-hide_banner','-loglevel','warning','-y','-fflags','+genpts',
    '-r',String(fps),'-f','h264','-i',h264,
    '-i',wav,'-map','0:v:0','-map','1:a:0',
    '-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000',
    '-t',(frames/fps).toFixed(6),'-movflags','+faststart',mp4];
  const ff=spawnSync('ffmpeg',cmd,{timeout:300000,stdio:'inherit'});
  if(ff.status!==0)throw Error('Mux failed with exit '+ff.status);
  const probe=spawnSync('ffprobe',['-v','error','-count_frames','-show_entries','stream=codec_name,width,height,avg_frame_rate,nb_read_frames','-of','json',mp4],{encoding:'utf8'});
  if(probe.status!==0)throw Error('ffprobe failed: '+probe.stderr);
  const streams=JSON.parse(probe.stdout).streams;
  const v=streams.find(s=>s.codec_name==='h264');
  const a=streams.find(s=>s.codec_name==='aac');
  if(!v||!a||v.width!==1080||v.height!==1920||v.avg_frame_rate!=='60/1'||Number(v.nb_read_frames)<frames-1)
    throw Error('QUALITY CONTROL FAILED '+JSON.stringify({v,a,frames,streams}));
  console.log('PASS H264/AAC, 1080x1920, 60fps, '+v.nb_read_frames+' source-accurate frames, '+(checkFile(mp4)/1048576).toFixed(1)+' MiB');
 }finally{
  if(browser)await browser.close().catch(()=>{});
  await new Promise(ok=>server.close(ok));
 }
}
run().catch(e=>{console.error(e.stack||e);process.exitCode=1});
