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
    gate=$('access-form'),code=$('access-code'),chat=$('chat'),skull=$('skull'),skip=$('skip'),
    composerEntry=$('composer-entry'),caretMirror=$('caret-mirror'),inputCaret=$('input-caret'),voiceButton=$('voice-button');
// Pete's voice is on by default, but Web Audio is unlocked ONLY by a user's tap.
// No samples or copyrighted game audio: all chirps are synthesized locally.
var voiceEnabled=true,audioCtx=null,lastVoiceAt=-1;
function updateVoiceButton(){
  voiceButton.textContent=voiceEnabled?'VOICE ON':'VOICE OFF';
  voiceButton.setAttribute('aria-pressed',String(voiceEnabled));
}
function chirp(character,index,preview){
  if(!voiceEnabled||!audioCtx||!preview&&audioCtx.state!=='running')return;
  if(!preview&&!/[\p{L}\p{N}]/u.test(character))return;
  var t=audioCtx.currentTime;
  if(!preview&&t-lastVoiceAt<.092)return;
  lastVoiceAt=t;
  try{
    var code=character.codePointAt(0)||65;
    var pitch=300+(code%11)*25+(Math.floor(index/8)%3)*16;
    var osc=audioCtx.createOscillator(),filter=audioCtx.createBiquadFilter(),gain=audioCtx.createGain();
    osc.type='square';
    osc.frequency.setValueAtTime(pitch,t);
    osc.frequency.exponentialRampToValueAtTime(pitch*(index%3===0?1.11:.92),t+.075);
    filter.type='lowpass';
    filter.frequency.value=1600;
    gain.gain.setValueAtTime(.0001,t);
    gain.gain.exponentialRampToValueAtTime(preview?.07:.055,t+.014);
    gain.gain.exponentialRampToValueAtTime(.0001,t+.092);
    osc.connect(filter);filter.connect(gain);gain.connect(audioCtx.destination);
    osc.start(t);osc.stop(t+.1);
  }catch(e){/* Optional audio never prevents chat from working. */}
}
function unlockVoice(preview){
  if(!voiceEnabled)return;
  var AudioCtor=window.AudioContext||window.webkitAudioContext;
  if(!AudioCtor){voiceEnabled=false;voiceButton.textContent='VOICE N/A';voiceButton.disabled=true;return;}
  try{
    // Where supported, let the short synthesized sounds use normal media playback.
    if(window.navigator&&window.navigator.audioSession){
      try{window.navigator.audioSession.type='playback';}catch(e){}
    }
    if(!audioCtx)audioCtx=new AudioCtor();
    if(audioCtx.state==='suspended'||audioCtx.state==='interrupted'){
      var ready=audioCtx.resume();
      if(ready&&ready.catch)ready.catch(function(){
        voiceButton.textContent='VOICE TAP TO RETRY';
      });
    }
    // Schedule the confirmation chirp directly inside the user gesture (iOS).
    if(preview)chirp('P',0,true);
  }catch(e){
    voiceEnabled=false;
    updateVoiceButton();
  }
}
voiceButton.addEventListener('click',function(){
  voiceEnabled=!voiceEnabled;
  updateVoiceButton();
  if(voiceEnabled)unlockVoice(true); // instantly audible test when switched on
});
updateVoiceButton();
empty=$('empty');
var reduced=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
function status(message,error){
  notice.textContent=message||'';
  notice.classList.toggle('error',!!error);
}
/* Draw a true block typing caret at the user's textarea selection. The textarea
 * remains a native control (keyboard, paste, selection, mobile and accessibility).
 * If measurement fails, show its native caret instead. */
var composing=false,caretFrame=0;
function updateInputCaret(){
  inputCaret.hidden=true;
  composerEntry.classList.remove('custom-caret');
  if(document.activeElement!==field||field.disabled||chat.hidden||composing)return;
  if(field.selectionStart!==field.selectionEnd)return; // keep selection highlighting
  try{
    var css=window.getComputedStyle(field);
    caretMirror.style.font=css.font;
    caretMirror.style.letterSpacing=css.letterSpacing;
    caretMirror.style.padding=css.padding;
    caretMirror.style.lineHeight=css.lineHeight;
    caretMirror.style.tabSize=css.tabSize||'8';
    caretMirror.style.width=field.clientWidth+'px';
    caretMirror.replaceChildren();
    caretMirror.appendChild(document.createTextNode(field.value.slice(0,field.selectionStart)));
    var marker=document.createElement('span');
    marker.className='caret-marker';
    marker.textContent='\u200b';
    caretMirror.appendChild(marker);
    var pos=marker.getBoundingClientRect(),box=composerEntry.getBoundingClientRect();
    var x=pos.left-box.left-field.scrollLeft;
    var y=pos.top-box.top-field.scrollTop;
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>field.clientWidth||y>field.clientHeight-3)return;
    inputCaret.style.left=Math.min(x,field.clientWidth-9)+'px';
    inputCaret.style.top=y+'px';
    inputCaret.style.height=Math.min(parseFloat(css.lineHeight)||22,24)+'px';
    composerEntry.classList.add('custom-caret');
    inputCaret.hidden=false;
  }catch(e){ // the native caret is a safe fallback on unusual browsers
    inputCaret.hidden=true;
    composerEntry.classList.remove('custom-caret');
  }
}
function scheduleCaret(){
  if(caretFrame)cancelAnimationFrame(caretFrame);
  caretFrame=requestAnimationFrame(function(){caretFrame=0;updateInputCaret();});
}
['input','keyup','click','scroll','select','focus','blur'].forEach(function(event){
  field.addEventListener(event,scheduleCaret);
});
field.addEventListener('compositionstart',function(){composing=true;scheduleCaret();});
field.addEventListener('compositionend',function(){composing=false;scheduleCaret();});
document.addEventListener('selectionchange',function(){
  if(document.activeElement===field)scheduleCaret();
});
window.addEventListener('resize',scheduleCaret);

function autoFocusAllowed(){
  // Mobile Safari should only open the keyboard when the user taps an input.
  return !(window.matchMedia && (
    window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(max-width: 740px)').matches
  ));
}
function locked(show){
  gate.hidden=!show;
  chat.hidden=show;
  $('access-button').textContent=show?'ACCESS':'LOCK';
  if(autoFocusAllowed()){
    if(show&&booted)code.focus();
    if(!show)field.focus();
  }else if(!show&&document.activeElement===code){
    code.blur();
  }
  scheduleCaret();
}
function resetMessages(){
  messages.replaceChildren();
  empty=document.createElement('div');
  empty.id='empty';empty.className='empty';
  empty.textContent='ASK PETE ABOUT THE COVE';
  messages.appendChild(empty);
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
  wrap.append(name,body);messages.appendChild(wrap);
  messages.scrollTop=messages.scrollHeight;
  return {wrap:wrap,content:content};
}
function busy(on,phase){
  loading=on;
  send.disabled=on;
  field.disabled=on;
  send.textContent='SEND';
  skull.classList.toggle('thinking',Boolean(on&&phase==='thinking'));
  if(!on)skull.classList.remove('speaking');
  scheduleCaret();
}
function reveal(node,text){
  var full=String(text||'');
  var units=Array.from(full);
  // Some WebKit builds expose Intl.Segmenter but fail when constructing it.
  // Plain Unicode code points are a safe fallback, never a terminal failure.
  try{
    if(window.Intl&&typeof Intl.Segmenter==='function')
      units=Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(full),function(x){return x.segment;});
  }catch(e){units=Array.from(full);}
  var duration=Math.min(8000,Math.max(350,units.length/125*1000));
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
        // A very short, softly pitched chirp every few characters, not a loud tone per keystroke.
        for(var i=end-1;i>=index;i--){
          if(/[\p{L}\p{N}]/u.test(units[i])){chirp(units[i],i,false);break;}
        }
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
  var previous=history.slice(-12);
  var userBubble=bubble('user',text);
  var stage='request';
  busy(true,'thinking');status('');
  requestController=new AbortController();
  var abort=requestController;
  var timer=setTimeout(function(){abort.abort();},120000);
  try{
    var response=await fetch(API+'/api/pete/chat',{
      method:'POST',signal:abort.signal,
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+access},
      body:JSON.stringify({message:text,history:previous})
    });
    stage='response';
    var data=await response.json().catch(function(){return {};});
    if(id!==epoch)return;
    if(!response.ok){
      if(response.status===401){access='';locked(true);}
      throw Error(data.error||'REQUEST FAILED ('+response.status+')');
    }
    if(typeof data.answer!=='string')throw Error('EMPTY RESPONSE FROM PETE');
    stage='display';
    var node=bubble('assistant','');
    busy(true,'typing');
    status('');
    var completed=await reveal(node,data.answer);
    if(!completed||id!==epoch)return;
    addSources(node.wrap,data.sources);
    history.push({role:'user',content:text},{role:'assistant',content:data.answer});
    status('');
  }catch(e){
    if(id!==epoch)return;
    if(typeof console!=='undefined'&&console.error)console.error('Pete request failed at '+stage,e);
    var error=e.name==='AbortError'?'REQUEST TIMED OUT. TRY AGAIN.'
      :e.name==='TypeError'?(stage==='request'?'CONNECTION FAILED. CHECK NETWORK AND RETRY.':'TERMINAL ERROR. TRY AGAIN.')
      :e.message||'REQUEST FAILED. TRY AGAIN.';
    // Don't lose a question simply because Safari dropped the fetch.
    if(stage!=='display'&&userBubble&&userBubble.wrap&&userBubble.wrap.remove){
      userBubble.wrap.remove();
      if(!field.value.trim())field.value=text;
    }
    status(error,true);
  }finally{
    clearTimeout(timer);
    if(requestController===abort)requestController=null;
    if(id===epoch){
      busy(false);
      if(!chat.hidden&&autoFocusAllowed())field.focus();
      scheduleCaret();
    }
  }
}
function boot(){
  var target=$('wc-logo-type'),word='WILLY CORP.',pos=0;
  var sub=$('brand-sub'),cursor=$('wc-logo-cursor');
  function done(){
    target.textContent=word;
    cursor.hidden=true;
    cursor.remove(); // Never leave a blinking logo cursor in the terminal after boot.
    sub.hidden=false;
    booted=true;
    locked(true);
    status('');
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
  unlockVoice(false); // User's Send tap can resume audio after iOS interruption.
  scheduleCaret();
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
  unlockVoice(true); // Enter tap unlocks sound on iPhone; gives a short confirmation chirp.
  locked(false);
  status('');
});
$('access-button').addEventListener('click',function(){
  if(!booted)return;
  if(access){
    cancelWork();
    access='';
    history=[];
    resetMessages();
    locked(true);
    status('');
  }else{
    locked(true);
    status('');
  }
});
$('clear-button').addEventListener('click',function(){
  cancelWork();
  history=[];
  resetMessages();
  field.value='';
  scheduleCaret();
  status('');
});
skip.addEventListener('click',function(){if(activeReply)activeReply.finish();});
/* Warm the service in the background, but never block chat or show a false
 * offline warning just because a status request timed out during a cold start. */
fetch(API+'/api/pete/status',{cache:'no-store'}).catch(function(){});
boot();
})();