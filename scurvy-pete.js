/* Scurvy Pete: read-only, source-grounded guild chat. */
(function(){
'use strict';
var API='https://willy-dex-editor.onrender.com';
var STORAGE='willydex-pete-access-v1';
var history=[],loading=false,access='';
var $=function(id){return document.getElementById(id);};
var form=$('composer'),field=$('question'),send=$('send'),messages=$('messages'),empty=$('empty'),notice=$('notice'),gate=$('access-form'),code=$('access-code');
try{access=sessionStorage.getItem(STORAGE)||'';}catch(e){}
function status(message,error){notice.textContent=message||'';notice.classList.toggle('error',!!error);}
function locked(show){gate.hidden=!show;if(show)code.focus();}
function bubble(role,text,sources){
  if(empty)empty.hidden=true;
  var wrap=document.createElement('article');wrap.className='message '+role;
  var name=document.createElement('div');name.className='by';name.textContent=role==='user'?'You':'Scurvy Pete';
  var body=document.createElement('div');body.className='bubble';body.textContent=text;
  wrap.append(name,body);
  if(Array.isArray(sources)&&sources.length){
    var refs=document.createElement('div');refs.className='sources';
    var label=document.createElement('span');label.className='by';label.textContent='Sources';refs.appendChild(label);
    sources.forEach(function(s){
      if(!s||typeof s.url!=='string'||!s.url.startsWith('https://captainpwilly.github.io/willy-dex/'))return;
      var a=document.createElement('a');a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=s.title;refs.appendChild(a);
    });
    wrap.appendChild(refs);
  }
  messages.appendChild(wrap);messages.scrollTop=messages.scrollHeight;
}
function busy(on){loading=on;send.disabled=on;field.disabled=on;send.textContent=on?'Thinking…':'Send';}
async function ask(text){
  if(!access){locked(true);status('Enter your access code first.',true);return;}
  var before=history.slice(-10);
  bubble('user',text);
  busy(true);status('');
  try{
    var controller=new AbortController();
    var timer=setTimeout(function(){controller.abort();},60000);
    var response;
    try{
      response=await fetch(API+'/api/pete/chat',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','Authorization':'Bearer '+access},body:JSON.stringify({message:text,history:before})});
    }finally{clearTimeout(timer);}
    var data=await response.json().catch(function(){return {};});
    if(!response.ok){
      if(response.status===401){access='';try{sessionStorage.removeItem(STORAGE);}catch(e){}locked(true);}
      throw Error(data.error||'Request failed ('+response.status+')');
    }
    history.push({role:'user',content:text},{role:'assistant',content:data.answer});
    bubble('assistant',data.answer,data.sources);
  }catch(e){
    status(e.name==='AbortError'?'Request timed out. Try again.':e.message,true);
    bubble('assistant','I could not reach the archive right now. Your question was not saved.');
  }finally{busy(false);field.focus();}
}
form.addEventListener('submit',function(e){
  e.preventDefault();if(loading)return;
  var text=field.value.trim();if(!text)return;
  if(!access){locked(true);status('Enter your access code first.',true);return;}
  field.value='';ask(text);
});
field.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit();}});
gate.addEventListener('submit',function(e){
  e.preventDefault();var value=code.value.trim();if(value.length<12){status('Access code needs at least 12 characters.',true);return;}
  access=value;try{sessionStorage.setItem(STORAGE,access);}catch(e){}
  code.value='';locked(false);status('Access code entered.');field.focus();
});
$('access-button').addEventListener('click',function(){locked(gate.hidden);});
$('clear-button').addEventListener('click',function(){history=[];messages.replaceChildren();var el=document.createElement('div');el.id='empty';el.className='empty';el.textContent='Ask Pete about the Cove.';messages.appendChild(el);empty=el;field.value='';status('Conversation cleared.');});
fetch(API+'/api/pete/status',{cache:'no-store'}).then(function(r){if(!r.ok)throw Error();return r.json();}).then(function(data){
  var live=!!data.ready;
  $('state').classList.toggle('online',live);$('state-label').textContent=live?(data.integration==='read-only-live-willy-dex-collections'?'Willy Dex linked':'API ready'):'API setup needed';
  if(!live)status('Add OPENAI_API_KEY to the Render service to activate Scurvy Pete.',true);
  else if(!data.accessConfigured)status('Set PETE_ACCESS_CODE on Render to enable team access.',true);
  if(!access)locked(true);
}).catch(function(){$('state-label').textContent='Backend unavailable';status('The Willy Dex API is not responding.',true);if(!access)locked(true);});
})();