// Willy-Dex editor API. Run on Render with ADMIN_PASSWORD, GITHUB_TOKEN and ALLOWED_ORIGIN set as private environment variables.
// Never place ADMIN_PASSWORD or GITHUB_TOKEN in the GitHub Pages frontend.
const http=require('node:http');
const crypto=require('node:crypto');
const BASE='https://api.github.com/repos/CaptainPWilly/willy-dex/contents/';
const origin=(process.env.ALLOWED_ORIGIN||'https://captainpwilly.github.io').replace(/\/$/,'');
const password=process.env.ADMIN_PASSWORD||'',githubToken=process.env.GITHUB_TOKEN||'';
if(!password){console.error('Missing ADMIN_PASSWORD');process.exit(1)}
if(!githubToken)console.warn('GITHUB_TOKEN is not configured; editor saves and uploads are disabled until configured.');
const passSalt=crypto.randomBytes(32),passHash=crypto.scryptSync(password,passSalt,64);
const sessions=new Map(),attempts=new Map();
const json=(r,status,data,headers={})=>{r.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});r.end(JSON.stringify(data))};
function cors(req,res){const requested=req.headers.origin;if(requested&&requested!==origin)return false;res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');return true}
function read(req){return new Promise((resolve,reject)=>{let s='',length=0;req.on('data',c=>{length+=c.length;if(length>5*1024*1024){reject(Error('Request exceeds 5MB'));req.destroy()}else s+=c});req.on('end',()=>{try{resolve(JSON.parse(s||'{}'))}catch{reject(Error('Invalid JSON'))}});req.on('error',reject)})}
async function git(path,method='GET',body){if(!githubToken)throw Error('GitHub write credential is not configured on the server');const response=await fetch(BASE+path,{method,headers:{Authorization:'Bearer '+githubToken,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json().catch(()=>({}));if(!response.ok)throw Error('GitHub '+response.status+': '+(data.message||'error'));return data}
function authorized(req){const key=(req.headers.authorization||'').replace(/^Bearer /,'');if(!key)return false;const hash=crypto.createHash('sha256').update(key).digest('hex');const exp=sessions.get(hash);if(!exp)return false;if(Date.now()>exp){sessions.delete(hash);return false}return true}
function validate(c){if(!c||typeof c!=='object')throw Error('Invalid card');const num=String(c.number||'');if(!/^\d{3}$/.test(num)||Number(num)<1||Number(num)>100)throw Error('Invalid card number');const name=String(c.name||'').trim();if(name.length<1||name.length>70)throw Error('Invalid player name');const clean=(v,max)=>String(v??'').slice(0,max);const lvl=c.level===''||c.level==null?null:Number(c.level);if(lvl!=null&&(!Number.isSafeInteger(lvl)||lvl<0))throw Error('Invalid level');const date=clean(c.smmo_joined||'',10);if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Invalid SMMO date');let image=clean(c.portrait||c.image||'',512);if(image&&!(image.startsWith('cards/')||/^https:\/\/[a-z0-9.-]+\/[^\s]*$/i.test(image)))throw Error('Invalid portrait URL');return {number:num,name,type:clean(c.type,90),guild:clean(c.guild,100)||null,level:lvl,date:clean(c.date,40),smmo_joined:date||null,description:clean(c.description,600),image:image||null,portrait:image||null}}
function rateLimit(ip){const now=Date.now(),r=attempts.get(ip)||{count:0,until:now+15*60*1000};if(r.until<now){r.count=0;r.until=now+15*60*1000}r.count++;attempts.set(ip,r);return r.count>10}
setInterval(()=>{const now=Date.now();for(const [k,v] of sessions)if(v<=now)sessions.delete(k);for(const [k,v] of attempts)if(v.until<now)attempts.delete(k)},600000).unref();
http.createServer(async(req,res)=>{if(!cors(req,res))return json(res,403,{error:'Origin not allowed'});if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}if(req.url==='/health'&&req.method==='GET')return json(res,200,{ok:true});
try{
if(req.url==='/api/login'&&req.method==='POST'){const ip=req.socket.remoteAddress||'unknown';if(rateLimit(ip))return json(res,429,{error:'Too many attempts. Try again later.'});const data=await read(req);const attempted=crypto.scryptSync(String(data.password||''),passSalt,64);if(!crypto.timingSafeEqual(attempted,passHash))return json(res,401,{error:'Wrong password'});attempts.delete(ip);const token=crypto.randomBytes(32).toString('base64url');sessions.set(crypto.createHash('sha256').update(token).digest('hex'),Date.now()+12*3600*1000);return json(res,200,{token,expiresIn:43200})}
if(req.url==='/api/logout'&&req.method==='POST'){const key=(req.headers.authorization||'').replace(/^Bearer /,'');sessions.delete(crypto.createHash('sha256').update(key).digest('hex'));return json(res,200,{ok:true})}
if(req.url==='/api/cards'&&req.method==='POST'){if(!authorized(req))return json(res,401,{error:'Editor locked'});const data=await read(req);const file=await git('cards.json');const list=JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));if(!Array.isArray(list))throw Error('Invalid registry');const action=data.action;if(action!=='save'&&action!=='delete')return json(res,400,{error:'Invalid action'});
let number;if(action==='delete'){number=String(data.number);if(!/^\d{3}$/.test(number))throw Error('Invalid number');const idx=list.findIndex(x=>x.number===number);if(idx<0)throw Error('Card not found');list[idx]={number,name:'???',type:'???',image:null}}
else{const c=validate(data.card);number=c.number;const idx=list.findIndex(x=>x.number===number);if(idx<0)throw Error('Card slot not found');list[idx]=c}
await git('cards.json','PUT',{message:'Willy-Dex: '+action+' card #'+number,sha:file.sha,content:Buffer.from(JSON.stringify(list,null,2)+'\n').toString('base64')});return json(res,200,{ok:true,number})}
if(req.url==='/api/wars'&&req.method==='POST'){
if(!authorized(req))return json(res,401,{error:'Editor locked'});
const data=await read(req);
if(typeof data.raw!=='string'||!data.raw.trim()||data.raw.length>200000)throw Error('Invalid raw snapshot');
if(!data.capturedAt||!Number.isFinite(Date.parse(data.capturedAt))||new Date(data.capturedAt).toISOString()!==data.capturedAt)throw Error('Invalid capture timestamp');
if(Date.parse(data.capturedAt)>Date.now()+3600000)throw Error('Capture timestamp is in the future');
if(!Array.isArray(data.wars)||data.wars.length<1||data.wars.length>300)throw Error('Expected 1–300 wars');
const cleanName=s=>{if(typeof s!=='string'||!s.trim()||s.length>120)throw Error('Invalid guild name');return s.trim()};
const wars=data.wars.map(w=>{
const guildA=cleanName(w.guildA),guildB=cleanName(w.guildB);
if(guildA.toLowerCase()===guildB.toLowerCase())throw Error('Same guild on both sides');
const killsA=w.killsA,killsB=w.killsB;
if(!Number.isSafeInteger(killsA)||killsA<0||!Number.isSafeInteger(killsB)||killsB<0)throw Error('Invalid kill count');
if(typeof w.warId!=='string'||!/^[-a-zA-Z0-9_]{3,100}$/.test(w.warId))throw Error('Invalid war ID');
return {warId:w.warId,guildA,guildB,killsA,killsB,ageText:String(w.ageText||'').slice(0,100),ageDays:Number.isFinite(w.ageDays)&&w.ageDays>=0?w.ageDays:null,status:'active'}
});
if(new Set(wars.map(w=>w.warId)).size!==wars.length)throw Error('Duplicate war ID in snapshot');
const file=await git('wars.json'),doc=JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));
if(!doc||doc.version!==1||!Array.isArray(doc.snapshots))throw Error('Invalid war registry');
const normalized=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const signatures=new Map();
for(const s of doc.snapshots)for(const w of (s.wars||[])){const sig=[normalized(w.guildA),normalized(w.guildB)].sort().join('|');if(!signatures.has(w.warId))signatures.set(w.warId,sig);}
for(const w of wars){const sig=[normalized(w.guildA),normalized(w.guildB)].sort().join('|');if(signatures.has(w.warId)&&signatures.get(w.warId)!==sig)throw Error('War ID belongs to another guild pair: '+w.warId)}
if(doc.snapshots.some(s=>s.capturedAt===data.capturedAt&&s.raw===data.raw))return json(res,409,{error:'This exact snapshot was already saved'});
const id=crypto.randomUUID(),snapshot={id,capturedAt:data.capturedAt,savedAt:new Date().toISOString(),raw:data.raw,wars};
doc.snapshots.push(snapshot);doc.snapshots.sort((a,b)=>Date.parse(a.capturedAt)-Date.parse(b.capturedAt));
await git('wars.json','PUT',{message:'Willy DEX: record war snapshot '+data.capturedAt,sha:file.sha,content:Buffer.from(JSON.stringify(doc,null,2)+'\n').toString('base64')});
return json(res,200,{ok:true,id,count:wars.length});
}

if(req.url==='/api/glb'&&req.method==='POST'){
if(!authorized(req))return json(res,401,{error:'Editor locked'});
const data=await read(req);
if(!Number.isSafeInteger(data.season)||data.season<1||data.season>999)throw Error('Invalid season');
if(typeof data.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(data.date)||!Number.isFinite(Date.parse(data.date+'T00:00:00Z')))throw Error('Invalid snapshot date');
if(data.date>new Date().toISOString().slice(0,10))throw Error('Future snapshot dates not allowed');
if(!Array.isArray(data.guilds)||data.guilds.length!==50)throw Error('Expected top 50 guilds');
const ranks=new Set(),names=new Set();
const guilds=data.guilds.map(g=>{
if(!g||!Number.isSafeInteger(g.rank)||g.rank<1||g.rank>50||typeof g.name!=='string'||!g.name.trim()||g.name.length>120||!Number.isSafeInteger(g.experience)||g.experience<0)throw Error('Invalid guild record');
const name=g.name.trim(),key=name.toLocaleLowerCase();if(ranks.has(g.rank)||names.has(key))throw Error('Duplicate rank or guild');ranks.add(g.rank);names.add(key);
return {rank:g.rank,name,experience:g.experience}
}).sort((a,b)=>a.rank-b.rank);
const file=await git('glb.json'),doc=JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));
if(doc.version!==1||!Array.isArray(doc.snapshots))throw Error('Invalid GLB registry');
const capturedAt=new Date().toISOString();
const snapshot={date:data.date,season:data.season,capturedAt,guilds};
// Retain one snapshot per UTC hour instead of overwriting the whole day.
// Keep full capturedAt precision so the UI can display the actual capture time.
const captureHour=Math.floor(Date.parse(capturedAt)/3600000);
const index=doc.snapshots.findIndex(s=>(s.season||15)===data.season&&s.capturedAt&&Math.floor(Date.parse(s.capturedAt)/3600000)===captureHour);
if(index>=0)doc.snapshots[index]=snapshot;else doc.snapshots.push(snapshot);
doc.season=data.season;doc.snapshots.sort((a,b)=>(a.season||15)-(b.season||15)||Date.parse(a.capturedAt||a.date)-Date.parse(b.capturedAt||b.date));
await git('glb.json','PUT',{message:'Willy DEX: GLB season '+data.season+' snapshot '+data.date,sha:file.sha,content:Buffer.from(JSON.stringify(doc,null,2)+'\n').toString('base64')});
return json(res,200,{ok:true,season:data.season,date:data.date,count:guilds.length});
}
if(req.url==='/api/portrait'&&req.method==='POST'){if(!authorized(req))return json(res,401,{error:'Editor locked'});const data=await read(req);if(!/^\d{3}$/.test(data.number||'')||Number(data.number)<1||Number(data.number)>100)throw Error('Invalid card number');if(!['png','jpg','webp','gif'].includes(data.ext))throw Error('Unsupported portrait type');if(typeof data.base64!=='string'||data.base64.length>4*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(data.base64))throw Error('Invalid upload');const path='cards/'+data.number+'-upload.'+data.ext;let sha;try{sha=(await git(path)).sha}catch(e){if(!String(e.message).includes('404'))throw e}await git(path,'PUT',{message:'Willy-Dex: update card portrait #'+data.number,content:data.base64,...(sha?{sha}:{})});return json(res,200,{path})}
return json(res,404,{error:'Not found'});
}catch(e){console.error(e.message);return json(res,400,{error:e.message})}
}).listen(Number(process.env.PORT||10000),'0.0.0.0',()=>console.log('Willy-Dex editor API listening'));