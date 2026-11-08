/* Willy Corp. terminal / Scurvy Pete.
 * All AI responses and source data still come from the existing Willy Dex API.
 * The CRT typing and skull movement are visual effects only.
 */
(function(){
'use strict';
var API='https://willy-dex-editor.onrender.com';
var history=[],loading=false,access='',epoch=0,requestController=null,activeReply=null,booted=false,empty=null;
var $=function(id){return document.getElementById(id);};
var form=$('composer'),field=$('question'),send=$('send'),messages=$('messages'),notice=$('notice'),
    gate=$('access-form'),code=$('access-code'),chat=$('chat'),skull=$('skull'),skip=$('skip');
empty=$('empty');
var reduced=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
function status(message,error){
  notice.textContent=message||'';
  notice.classList.toggle('error',!!error);
}
function locked(show){
  gate.hidden=!show;
  chat.hidden=show;
  $('access-button').textContent=show?'ACCESS':'LOCK';
  if(show&&booted)code.focus();
  if(!show)field.focus();
}
function resetMessages(){
  messages.replaceChildren();
  empty=document.createElement('div');
  empty.id='empty';empty.className='empty';
  empty.appendChild(document.createTextNode('AWAITING QUERY'));
  var cursor=document.createElement('span');cursor.className='block-cursor';cursor.setAttribute('aria-hidden','true');
  empty.appendChild(cursor);messages.appendChild(empty);
}
function addSources(wrap,sources){
  if(!Array.isArray(sources)||!sources.length)return;
  var box=document.createElement('div');box.className='sources';
  var label=document.createElement('span');label.className='by';label.textContent='ARCHIVE LINKS //';box.appendChild(label);
  sources.forEach(function(s){
    if(!s||typeof s.url!=='string'||!s.url.startsWith('https://captainpwilly.github.io/willy-dex/'))return;
    var link=document.createElement('a');
    link.href=s.url;link.target='_blank';link.rel='noopener noreferrer';
    link.textContent='['+s.title.toUpperCase()+']';
    box.appendChild(link);
  });
  if(box.children.length>1)wrap.appendChild(box);
}
function bubble(role,text){
  if(empty)empty.hidden=true;
  var wrap=document.createElement('article');wrap.className='message '+role;
  var name=document.createElement('div');name.className='by';
  name.textContent=role==='user'?'YOU >':'SCURVY PETE >';
  var body=document.createElement('div');body.className='bubble';
  var content=document.createElement('span');content.className='type-content';content.textContent=text||'';
  body.appendChild(content);
  if(role==='assistant'){
    var cursor=document.createElement('span');cursor.className='block-cursor typing-cursor';
    cursor.setAttribute('aria-hidden','true');body.appendChild(cursor);
  }
  wrap.append(name,body);messages.appendChild(wrap);
  messages.scrollTop=messages.scrollHeight;
  return {wrap:wrap,content:content};
}
function busy(on,phase){
  loading=on;
  send.disabled=on;
  field.disabled=on;
  send.textContent=on?(phase==='typing'?'PRINTING':'PROCESSING'):'SEND';
}
function reveal(node,text){
  var full=String(text||'');
  var units=window.Intl&&Intl.Segmenter?Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(full),function(x){return x.segment;}):Array.from(full);
  var duration=Math.min(18000,Math.max(600,units.length/62*1000));
  // Accessible: no per-character announcements. A single completion status is announced instead.
  return new Promise(function(resolve){
    var finished=false,frame=0,index=0,start=0,wrap=node.wrap;
    function stop(complete){
      if(finished)return;
      finished=true;
      if(frame)cancelAnimationFrame(frame);
      skull.classList.remove('speaking');
      skip.hidden=true;
      wrap.classList.remove('typing');
      if(complete){node.content.textContent=full;messages.scrollTop=messages.scrollHeight;}
      if(activeReply===control)activeReply=null;
      resolve(complete);
    }
    var control={finish:function(){stop(true);},cancel:function(){stop(false);}};
    activeReply=control;
    if(reduced||!units.length){stop(true);return;}
    node.content.textContent='';
    wrap.classList.add('typing');
    skull.classList.add('speaking');
    skip.hidden=false;
    function tick(now){
      if(!start)start=now;
      var end=Math.min(units.length,Math.floor(((now-start)/duration)*units.length)+1);
      if(end>index){
        index=end;
        node.content.textContent=units.slice(0,index).join('');
        messages.scrollTop=messages.scrollHeight;
      }
      if(index>=units.length){stop(true);return;}
      frame=requestAnimationFrame(tick);
    }
    frame=requestAnimationFrame(tick);
  });
}
function cancelWork(){
  epoch++;
  if(requestController){requestController.abort();requestController=null;}
  if(activeReply)activeReply.cancel();
  skull.classList.remove('speaking');
  skip.hidden=true;
  busy(false);
}
async function ask(text){
  if(!access){locked(true);status('AUTHORIZATION REQUIRED',true);return;}
  var id=++epoch;
  var previous=history.slice(-10);
  bubble('user',text);
  busy(true,'thinking');status('QUERYING WILLY DEX ARCHIVES...');
  requestController=new AbortController();
  var abort=requestController;
  var timer=setTimeout(function(){abort.abort();},60000);
  try{
    var response=await fetch(API+'/api/pete/chat',{
      method:'POST',signal:abort.signal,
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+access},
      body:JSON.stringify({message:text,history:previous})
    });
    var data=await response.json().catch(function(){return {};});
    if(id!==epoch)return;
    if(!response.ok){
      if(response.status===401){access='';locked(true);}
      throw Error(data.error||'REQUEST FAILED ('+response.status+')');
    }
    if(typeof data.answer!=='string')throw Error('EMPTY RESPONSE FROM PETE');
    var node=bubble('assistant','');
    busy(true,'typing');
    status('RECEIVING TRANSMISSION...');
    var completed=await reveal(node,data.answer);
    if(!completed||id!==epoch)return;
    addSources(node.wrap,data.sources);
    history.push({role:'user',content:text},{role:'assistant',content:data.answer});
    status('TRANSMISSION COMPLETE');
  }catch(e){
    if(id!==epoch)return;
    var error=e.name==='AbortError'?'CONNECTION TIMED OUT':e.message;
    status(error,true);
    bubble('assistant','TRANSMISSION INTERRUPTED. '+error);
  }finally{
    clearTimeout(timer);
    if(requestController===abort)requestController=null;
    if(id===epoch){
      busy(false);
      if(!chat.hidden)field.focus();
    }
  }
}
function boot(){
  var target=$('wc-logo-type'),word='WILLY CORP.',pos=0;
  var sub=$('brand-sub'),cursor=$('wc-logo-cursor');
  function done(){
    target.textContent=word;
    cursor.hidden=true;
    sub.hidden=false;
    booted=true;
    locked(true);
    status('AWAITING AUTHORIZATION');
  }
  if(reduced){done();return;}
  function next(){
    if(pos>=word.length){setTimeout(done,250);return;}
    target.textContent=word.slice(0,++pos);
    setTimeout(next,pos===6?120:68);
  }
  setTimeout(next,120);
}
form.addEventListener('submit',function(e){
  e.preventDefault();
  if(loading||chat.hidden)return;
  var text=field.value.trim();
  if(!text)return;
  field.value='';
  ask(text);
});
field.addEventListener('keydown',function(e){
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit();}
});
gate.addEventListener('submit',function(e){
  e.preventDefault();
  var value=code.value.trim();
  if(value.length<12){status('INVALID KEY FORMAT',true);return;}
  access=value;
  code.value='';
  locked(false);
  status('AUTHORIZATION RECEIVED // WILLY DEX LINK ACTIVE');
});
$('access-button').addEventListener('click',function(){
  if(!booted)return;
  if(access){
    cancelWork();
    access='';
    history=[];
    resetMessages();
    locked(true);
    status('TERMINAL LOCKED');
  }else{
    locked(true);
    status('ENTER PETE KEY');
  }
});
$('clear-button').addEventListener('click',function(){
  cancelWork();
  history=[];
  resetMessages();
  field.value='';
  status('TERMINAL LOG CLEARED');
});
skip.addEventListener('click',function(){if(activeReply)activeReply.finish();});
fetch(API+'/api/pete/status',{cache:'no-store'})
  .then(function(r){if(!r.ok)throw Error();return r.json();})
  .then(function(data){
    var online=!!data.ready;
    $('state').classList.toggle('online',online);
    $('state-label').textContent=online?(data.integration==='read-only-live-willy-dex-collections'?'WILLY DEX LINKED':'AI LINK ONLINE'):'AI LINK OFFLINE';
    if(!online)status('OPENAI API KEY IS NOT CONFIGURED',true);
    else if(!data.accessConfigured)status('PETE ACCESS CODE NOT CONFIGURED',true);
  })
  .catch(function(){$('state-label').textContent='LINK UNAVAILABLE';$('state').classList.remove('online');});
boot();
})();