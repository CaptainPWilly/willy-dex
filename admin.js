(()=>{'use strict';
const repo='CaptainPWilly/willy-dex',api='https://api.github.com/repos/'+repo+'/contents/';
let credential='',editing=null,loaded=[];
const $=id=>document.getElementById(id),panel=$('editor-panel'),notice=$('editor-status');
function message(s,error=false){notice.textContent=s;notice.style.color=error?'#ffaaaa':'#dfc38e'}
function apiRequest(path,options={}){
 return fetch(api+path,{...options,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:'Bearer '+credential,...(options.headers||{})}}).then(async r=>{
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(data.message||('GitHub error '+r.status));
 return data;
 });
}
function base64Unicode(t){return btoa(Array.from(new TextEncoder().encode(t),x=>String.fromCharCode(x)).join(''))}
function decodeGitHub(t){return new TextDecoder().decode(Uint8Array.from(atob(t.replace(/\s/g,'')),c=>c.charCodeAt(0)))}
function openEditor(){panel.hidden=false;panel.setAttribute('aria-hidden','false');$('editor-open').setAttribute('aria-expanded','true');if(credential){$('editor-login').hidden=true;$('editor-fields').hidden=false;selectCard($('editor-card').value||'new')}else{$('editor-login').hidden=false;$('editor-fields').hidden=true;$('editor-token').focus()}}
function closeEditor(){panel.hidden=true;panel.setAttribute('aria-hidden','true');$('editor-open').setAttribute('aria-expanded','false')}
function lock(){credential='';editing=null;$('editor-token').value='';$('editor-login').hidden=false;$('editor-fields').hidden=true;message('Locked. No credential is stored.')}
async function unlock(){const token=$('editor-token').value.trim();if(!token)return message('Enter your GitHub editor token.',true);credential=token;message('Checking repository permissions…');try{await apiRequest('cards.json');const d=await fetch('cards.json',{cache:'no-store'});if(!d.ok)throw Error('Unable to load card catalog');loaded=await d.json();$('editor-token').value='';$('editor-login').hidden=true;$('editor-fields').hidden=false;populateCardList();selectCard('new');message('Editor unlocked. Changes publish to GitHub when saved.')}catch(e){credential='';message(e.message,true)}}
function populateCardList(){const select=$('editor-card');select.replaceChildren(new Option('New card (first empty slot)','new'));loaded.filter(c=>c.image).forEach(c=>select.add(new Option('#'+c.number+' — '+c.name,c.number)))}
function field(id,v){$(id).value=v??''}
function selectCard(id){editing=id==='new'?null:loaded.find(c=>c.number===id)||null;const c=editing||{};field('ed-name',c.name==='???'?'':c.name);field('ed-role',c.type==='???'?'':c.type);field('ed-guild',c.guild);field('ed-level',c.level);field('ed-date',c.date);field('ed-smmo',c.smmo_joined);field('ed-desc',c.description);field('ed-image',c.portrait||(!c.image?'':c.image));$('ed-file').value='';$('editor-delete').disabled=!editing;message(editing?'Editing card #'+editing.number:'Creating card in the next available slot.')}
async function uploadPortrait(file,number){if(!file)return null;if(file.size>3*1024*1024)throw Error('Portrait must be smaller than 3 MB');if(!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type))throw Error('Use a PNG, JPG, WEBP, GIF or SVG portrait.');const ext=file.type==='image/svg+xml'?'svg':file.type==='image/jpeg'?'jpg':file.type.split('/')[1];const path='cards/'+number+'-upload.'+ext;const buf=await file.arrayBuffer();const arr=new Uint8Array(buf);let raw='';for(let i=0;i<arr.length;i+=8192)raw+=String.fromCharCode(...arr.subarray(i,i+8192));let sha;try{sha=(await apiRequest(path)).sha}catch(e){if(!/404|Not Found/i.test(e.message))throw e}await apiRequest(path,{method:'PUT',body:JSON.stringify({message:'Update portrait for Willy-Dex #'+number,content:btoa(raw),...(sha?{sha}:{})})});return path}
async function save(){const btn=$('editor-save');if(!credential)return message('Unlock the editor first.',true);const name=$('ed-name').value.trim(),role=$('ed-role').value.trim();if(!name)return message('Player name is required.',true);btn.disabled=true;message('Saving card…');try{
 const remote=await apiRequest('cards.json');
 const list=JSON.parse(decodeGitHub(remote.content));
 const number=editing?.number||(list.find(c=>!c.image)?.number||String(list.length+1).padStart(3,'0'));
 if(Number(number)>100)throw Error('The 100-card registry is full.');
 const idx=list.findIndex(c=>c.number===number);
 const old=idx>=0?list[idx]:{};
 const file=$('ed-file').files[0];
 const uploaded=await uploadPortrait(file,number);
 const portrait=uploaded||$('ed-image').value.trim()||old.portrait||'';
 const c={...old,number,name,type:role||'Pirate Cove',guild:$('ed-guild').value.trim()||null,level:$('ed-level').value===''?null:Number($('ed-level').value),date:$('ed-date').value.trim(),smmo_joined:$('ed-smmo').value||null,description:$('ed-desc').value.trim(),image:portrait||null,portrait:portrait||null};
 if(idx<0)list.push(c);else list[idx]=c;
 await apiRequest('cards.json',{method:'PUT',body:JSON.stringify({message:'Willy-Dex: '+(editing?'edit':'add')+' #'+number+' '+name,sha:remote.sha,content:base64Unicode(JSON.stringify(list,null,2)+'\n')})});
 loaded=list;editing=c;populateCardList();$('editor-card').value=number;selectCard(number);
 if(typeof window.willyDexReload==='function')await window.willyDexReload();
 message('Saved #'+number+' to GitHub. GitHub Pages may take a minute to publish.');
 }catch(e){message('Save failed: '+e.message,true)}finally{btn.disabled=false}}
async function remove(){if(!credential||!editing)return;const n=editing.number;if(!confirm('Delete card #'+n+'? The registry slot will become undiscovered.'))return;const btn=$('editor-delete');btn.disabled=true;message('Removing card…');try{const remote=await apiRequest('cards.json');const list=JSON.parse(decodeGitHub(remote.content));const idx=list.findIndex(c=>c.number===n);if(idx<0)throw Error('Card no longer exists');list[idx]={number:n,name:'???',type:'???',image:null};await apiRequest('cards.json',{method:'PUT',body:JSON.stringify({message:'Willy-Dex: remove card #'+n,sha:remote.sha,content:base64Unicode(JSON.stringify(list,null,2)+'\n')})});loaded=list;editing=null;populateCardList();selectCard('new');if(typeof window.willyDexReload==='function')await window.willyDexReload();message('Card #'+n+' removed. Slot preserved.')}catch(e){message('Delete failed: '+e.message,true)}finally{btn.disabled=false}}
$('editor-open').addEventListener('click',()=>panel.hidden?openEditor():closeEditor());
$('editor-close').addEventListener('click',closeEditor);
$('editor-unlock').addEventListener('click',unlock);
$('editor-lock').addEventListener('click',lock);
$('editor-card').addEventListener('change',e=>selectCard(e.target.value));
$('editor-save').addEventListener('click',save);
$('editor-delete').addEventListener('click',remove);
$('editor-token').addEventListener('keydown',e=>{if(e.key==='Enter')unlock()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden)closeEditor()});
})();