/* Willy Dex compact public SMMO tags. */
(function(){
'use strict';
var FORMAT_KEY='willydex-smmo-format-v1';
var format='normal';
var shared=[{name:'Willys Fish'}];
var tags=document.getElementById('tags');
var status=document.getElementById('status');
var sorter=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'});
try{format=localStorage.getItem(FORMAT_KEY)==='sprite'?'sprite':'normal';}catch(e){}
function nameOf(item){
  if(!item||typeof item!=='object'||typeof item.name!=='string')return '';
  return item.name.trim().slice(0,100);
}
function output(tag){
  if(typeof tag.fixedText==='string')return tag.fixedText;
  var name=nameOf(tag);
  return format==='sprite'?'[!'+name+'!]':'[['+name+']]';
}
function allTags(){
  var seen=new Set();
  return shared.filter(function(tag){
    var name=nameOf(tag);
    var key=name.toLocaleLowerCase();
    if(!name||seen.has(key))return false;
    seen.add(key);return true;
  }).sort(function(a,b){return sorter.compare(nameOf(a),nameOf(b));});
}
function setMode(value){
  format=value;
  try{localStorage.setItem(FORMAT_KEY,format);}catch(e){}
  document.querySelectorAll('[data-format]').forEach(function(button){
    button.setAttribute('aria-pressed',String(button.dataset.format===format));
  });
  render();
}
function fallback(text){
  var field=document.createElement('textarea');
  field.value=text;field.readOnly=true;field.style.position='fixed';field.style.opacity='0';
  document.body.appendChild(field);field.focus();field.select();
  var copied=false;
  try{copied=document.execCommand('copy');}catch(e){}
  field.remove();
  return copied;
}
function copy(text,button){
  var success=function(){
    status.textContent='Copied '+text;
    clearTimeout(button._copyTimer);
    button.textContent='✓ Copied';
    button.classList.add('copied');
    button._copyTimer=setTimeout(function(){
      button.textContent=button.dataset.tagName;
      button.classList.remove('copied');
    },1100);
  };
  var failure=function(){if(fallback(text))success();else window.prompt('Copy tag:',text);};
  if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(text).then(success,failure);
  else failure();
}
function render(){
  var fragment=document.createDocumentFragment();
  allTags().forEach(function(tag){
    var name=nameOf(tag);
    var button=document.createElement('button');
    button.type='button';button.className='tag';button.textContent=name;
    button.title=name;
    button.dataset.tagName=name;
    button.setAttribute('aria-label','Copy '+output(tag));
    button.addEventListener('click',function(){copy(output(tag),button);});
    fragment.appendChild(button);
  });
  tags.replaceChildren(fragment);
}
document.querySelectorAll('[data-format]').forEach(function(button){
  button.addEventListener('click',function(){setMode(button.dataset.format);});
});
setMode(format);
fetch('smmo-tags.json',{cache:'no-store'}).then(function(response){
  if(!response.ok)throw Error('Cannot load tags');
  return response.json();
}).then(function(data){
  if(!data||!Array.isArray(data.tags))throw Error('Bad tag data');
  shared=data.tags;render();
}).catch(function(){/* Retain built-in Fish tag while offline. */});
})();
