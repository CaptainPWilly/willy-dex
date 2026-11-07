/* Willy Dex SMMO Tags — public library is read-only; personal tags stay local. */
(function(){
'use strict';
var $=function(id){return document.getElementById(id);};
var PERSONAL_KEY='willydex-smmo-personal-v1';
var FORMAT_KEY='willydex-smmo-format-v1';
var activeFormat=loadFormat();
function loadFormat(){try{return localStorage.getItem(FORMAT_KEY)==='sprite'?'sprite':'normal';}catch(e){return 'normal';}}
var defaultTags=[{id:'willys-fish',name:'Willys Fish'}];
var communityTags=defaultTags.slice();
var personalTags=loadLocal();
var incomingTags=[];
var noticeTimer=0;
function cleanName(value){
  return String(value==null?'':value).replace(/[\u0000-\u001f\u007f]/g,' ').trim().replace(/\s+/g,' ').slice(0,100);
}
function key(name){return cleanName(name).toLocaleLowerCase();}
function unique(list){
  var seen=new Set(),out=[];
  list.forEach(function(item){
    var name=cleanName(typeof item==='string'?item:item&&item.name);
    if(!name||seen.has(key(name))||out.length>=500)return;
    seen.add(key(name));
    out.push({id:item&&item.id?String(item.id).slice(0,120):key(name),name:name});
  });
  return out;
}
function readPack(raw){
  if(!raw||!Array.isArray(raw.tags)||raw.tags.length>1000)throw Error('Invalid tag pack');
  return unique(raw.tags);
}
function loadLocal(){
  try{var saved=JSON.parse(localStorage.getItem(PERSONAL_KEY)||'[]');return unique(Array.isArray(saved)?saved:[]);}
  catch(e){return [];}
}
function storeLocal(){
  try{localStorage.setItem(PERSONAL_KEY,JSON.stringify(personalTags));return true;}
  catch(e){toast('Could not save tags on this device. Check browser storage.');return false;}
}
function toast(message){
  var node=$('toast');
  node.textContent=message;node.hidden=false;
  clearTimeout(noticeTimer);
  noticeTimer=setTimeout(function(){node.hidden=true;},3000);
}
function format(name,kind){
  return kind==='sprite'?'[!'+name+'!]':'[['+name+']]';
}
function fallbackCopy(text){
  var input=document.createElement('textarea');
  input.value=text;input.readOnly=true;input.style.position='fixed';
  input.style.top='0';input.style.left='0';input.style.opacity='0';
  document.body.appendChild(input);
  input.focus();input.select();input.setSelectionRange(0,text.length);
  var success=false;
  try{success=document.execCommand('copy');}catch(e){}
  input.remove();return success;
}
function copyText(text){
  if(navigator.clipboard&&window.isSecureContext){
    navigator.clipboard.writeText(text).then(function(){toast('Copied: '+text);},function(){
      if(fallbackCopy(text))toast('Copied: '+text);
      else prompt('Select and copy this tag:',text);
    });
  }else if(fallbackCopy(text))toast('Copied: '+text);
  else prompt('Select and copy this tag:',text);
}
var editPersonal=false;
var tagSorter=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'});
function createCard(tag,personal){
  var article=document.createElement('div');article.className='tag-card';
  var button=document.createElement('button');button.type='button';button.className='tag-btn';
  var output=format(tag.name,activeFormat);
  button.textContent=tag.name;
  button.title=tag.name;
  button.setAttribute('aria-label',personal&&editPersonal?'Remove '+tag.name:'Copy '+output);
  button.addEventListener('click',function(){
    if(personal&&editPersonal){
      if(!confirm('Remove '+tag.name+' from this device?'))return;
      personalTags=personalTags.filter(function(t){return key(t.name)!==key(tag.name);});
      storeLocal();render();
      toast('Removed '+tag.name);
    }else copyText(output);
  });
  article.appendChild(button);
  return article;
}
function render(){
  $('personalTags').classList.toggle('is-editing',editPersonal);
  $('editPersonal').textContent=editPersonal?'Done':'Edit';
  $('editPersonal').setAttribute('aria-pressed',String(editPersonal));
  $('editHint').hidden=!editPersonal;
  document.querySelectorAll('.format-toggle [data-format]').forEach(function(button){
    button.setAttribute('aria-pressed',String(button.dataset.format===activeFormat));
  });
  var term=key($('search').value);
  [
    {items:communityTags,list:$('communityTags'),empty:$('communityEmpty'),count:$('communityCount'),personal:false},
    {items:personalTags,list:$('personalTags'),empty:$('personalEmpty'),count:$('personalCount'),personal:true}
  ].forEach(function(section){
    var matched=section.items.filter(function(tag){return key(tag.name).includes(term);}).sort(function(a,b){return tagSorter.compare(a.name,b.name);});
    section.list.replaceChildren();
    var fragment=document.createDocumentFragment();
    matched.forEach(function(tag){fragment.appendChild(createCard(tag,section.personal));});
    section.list.appendChild(fragment);
    section.count.textContent=(term?matched.length+'/':'')+section.items.length+' tag'+(section.items.length===1?'':'s')+' · A–Z';
    section.empty.hidden=matched.length!==0;
    section.empty.textContent=section.items.length?'No matching tags.':(section.personal?'No personal tags yet.':'No community tags available.');
  });
}
function addMany(items){
  var known=new Set(communityTags.concat(personalTags).map(function(t){return key(t.name);}));
  var added=0;
  unique(items).forEach(function(tag){
    if(known.has(key(tag.name)))return;
    personalTags.push({id:tag.id,name:tag.name});
    known.add(key(tag.name));added++;
  });
  if(added){storeLocal();render();}
  return added;
}
function encodePack(tags){
  var payload=JSON.stringify({version:1,title:'SMMO Tags',tags:tags.map(function(t){return {name:t.name};})});
  var bytes=new TextEncoder().encode(payload),binary='';
  bytes.forEach(function(c){binary+=String.fromCharCode(c);});
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decodePack(encoded){
  if(!encoded||encoded.length>16000||!/^[A-Za-z0-9_-]+$/.test(encoded))throw Error('Invalid share link');
  var raw=atob(encoded.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-encoded.length%4)%4));
  var bytes=Uint8Array.from(raw,function(c){return c.charCodeAt(0);});
  return readPack(JSON.parse(new TextDecoder().decode(bytes)));
}
function clearIncoming(){
  incomingTags=[];$('sharedNotice').hidden=true;
  var url=new URL(location.href);url.searchParams.delete('pack');
  history.replaceState(null,'',url.pathname+url.search+url.hash);
}
function prepareShared(){
  var incoming=new URL(location.href).searchParams.get('pack');
  if(!incoming)return;
  try{
    incomingTags=decodePack(incoming);
    if(!incomingTags.length)throw Error('Empty tag pack');
    $('sharedTitle').textContent='A pirate shared '+incomingTags.length+' tag'+(incomingTags.length===1?'':'s');
    $('sharedDetail').textContent=incomingTags.map(function(t){return t.name;}).slice(0,6).join(', ')+(incomingTags.length>6?'…':'')+'. Importing adds only new tags to your device.';
    $('sharedNotice').hidden=false;
  }catch(e){clearIncoming();toast('That shared tag link is invalid.');}
}
function download(name,data){
  var url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
  var anchor=document.createElement('a');anchor.href=url;anchor.download=name;
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(function(){URL.revokeObjectURL(url);},1000);
}
function shareLink(url){
  if(navigator.share){
    navigator.share({title:'Willy Dex SMMO Tags',url:url}).catch(function(error){
      if(error&&error.name==='AbortError')return;
      copyText(url);
    });
  }else copyText(url);
}
document.querySelectorAll('.format-toggle [data-format]').forEach(function(button){
  button.addEventListener('click',function(){
    activeFormat=button.dataset.format;
    try{localStorage.setItem(FORMAT_KEY,activeFormat);}catch(e){}
    render();
  });
});
$('search').addEventListener('input',render);
$('editPersonal').addEventListener('click',function(){editPersonal=!editPersonal;render();});
$('addForm').addEventListener('submit',function(event){
  event.preventDefault();
  var field=$('tagName'),name=cleanName(field.value);
  if(!name){toast('Enter a tag name.');return;}
  if(communityTags.concat(personalTags).some(function(t){return key(t.name)===key(name);})){
    toast('That tag already exists.');return;
  }
  var count=addMany([{name:name}]);
  if(count){field.value='';toast('Added '+name+'.');}
});
$('sharePage').addEventListener('click',function(){
  var url=new URL(location.href);url.searchParams.delete('pack');shareLink(url.href);
});
$('shareMyTags').addEventListener('click',function(){
  if(!personalTags.length){toast('Add a personal tag first.');return;}
  var url=new URL(location.href);url.searchParams.delete('pack');
  url.searchParams.set('pack',encodePack(personalTags));
  if(url.href.length>1800){toast('Pack too large for a link. Use Export JSON.');return;}
  shareLink(url.href);
});
$('exportTags').addEventListener('click',function(){
  if(!personalTags.length){toast('Add a personal tag first.');return;}
  download('willy-dex-smmo-tags.json',JSON.stringify({version:1,title:'Willy Dex SMMO Tags',tags:personalTags.map(function(t){return {name:t.name};})},null,2)+'\n');
  toast('Tag pack exported.');
});
$('importTagsButton').addEventListener('click',function(){$('importTagsFile').click();});
$('importTagsFile').addEventListener('change',async function(event){
  var file=event.target.files[0];event.target.value='';
  if(!file)return;
  if(file.size>1000000){toast('That file is too large.');return;}
  try{
    var tags=readPack(JSON.parse(await file.text()));
    toast('Imported '+addMany(tags)+' new tag(s).');
  }catch(e){toast('Could not import that JSON tag pack.');}
});
$('acceptShared').addEventListener('click',function(){
  var added=addMany(incomingTags);
  clearIncoming();toast('Added '+added+' new tag(s).');
});
$('dismissShared').addEventListener('click',clearIncoming);
async function fetchCommunity(){
  try{
    var response=await fetch('smmo-tags.json',{cache:'no-store'});
    if(!response.ok)throw Error('HTTP '+response.status);
    communityTags=readPack(await response.json());
    render();
  }catch(e){
    communityTags=defaultTags.slice();render();
    toast('Could not refresh the public tags; showing built-in Fish tag.');
  }
}
render();prepareShared();fetchCommunity();
})();
