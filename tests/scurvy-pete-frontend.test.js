'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const frontend=fs.readFileSync(path.join(__dirname,'..','scurvy-pete.js'),'utf8');
function terminal(chatRequest,options={}){
  const nodes={};
  let doc;
  class Element{
    constructor(id=''){
      this.id=id;this.hidden=false;this.disabled=false;this.value='';this.textContent='';
      this.className='';this.children=[];this.listeners={};this.style={};
      this.clientWidth=320;this.clientHeight=45;this.scrollHeight=800;this.scrollTop=0;
      this.scrollLeft=0;this.selectionStart=0;this.selectionEnd=0;
      this.classes=new Set();
      this.classList={add:k=>this.classes.add(k),remove:k=>this.classes.delete(k),
        toggle:(k,on)=>on?this.classes.add(k):this.classes.delete(k)};
    }
    addEventListener(event,fn){this.listeners[event]=fn;}
    setAttribute(key,val){this[key]=val;}
    append(...children){for(const c of children){if(c&&typeof c==='object')c.parent=this;this.children.push(c);}}
    appendChild(c){this.append(c);}
    replaceChildren(...children){this.children=[];this.append(...children);}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
    focus(){doc.activeElement=this;}
    blur(){if(doc.activeElement===this)doc.activeElement=null;}
    requestSubmit(){this.listeners.submit({preventDefault(){}});}
    getBoundingClientRect(){return {left:20,top:20};}
  }
  const ids=['composer','question','send','messages','empty','notice','access-form','access-code',
    'chat','skull','skip','access-button','clear-button','wc-logo-type','brand-sub',
    'wc-logo-cursor','composer-entry','caret-mirror','input-caret','voice-button'];
  for(const id of ids)nodes[id]=new Element(id);
  nodes.chat.hidden=true;nodes.messages.append(nodes.empty);
  doc={activeElement:null,getElementById:id=>nodes[id],
    createElement:tag=>new Element(tag),createTextNode:txt=>({textContent:txt}),
    addEventListener(){}};
  const intl=options.brokenSegmenter?{Segmenter:class{constructor(){throw TypeError('WebKit Segmenter failed');}}}:Intl;
  const win={Intl:intl,matchMedia:()=>({matches:true}),addEventListener(){},
    getComputedStyle:()=>({font:'16px monospace',letterSpacing:'normal',padding:'10px',lineHeight:'24px',tabSize:'8'})};
  const fetch=async url=>url.endsWith('/status')?
    (options.statusRequest?options.statusRequest():{ok:true,json:async()=>({ready:true,accessConfigured:true})}):chatRequest(url);
  class Abort{constructor(){this.signal={};}abort(){this.signal.aborted=true;}}
  vm.runInNewContext(frontend,{document:doc,window:win,fetch,AbortController:Abort,Intl:intl,
    setTimeout:(fn,delay)=>{if(delay<1000)fn();return 1;},clearTimeout(){},
    requestAnimationFrame(){return 1;},cancelAnimationFrame(){},console:{error(){}}});
  nodes['access-code'].value='test-valid-looking-key';
  nodes['access-form'].requestSubmit();
  return nodes;
}
async function settle(){for(let i=0;i<60;i++)await Promise.resolve();}
test('a Safari fetch TypeError preserves the question and releases the composer',async()=>{
  const el=terminal(async()=>{throw new TypeError('Load failed');});
  el.question.value='Biggest XP day for the Cove?';el.composer.requestSubmit();
  await settle();
  assert.match(el.notice.textContent,/CONNECTION FAILED/);
  assert.equal(el.question.value,'Biggest XP day for the Cove?');
  assert.equal(el.send.disabled,false);
  assert.equal(el.messages.children.filter(x=>x.className==='message user').length,0);
});
test('typing survives a failing Intl.Segmenter implementation',async()=>{
  const el=terminal(async()=>({ok:true,json:async()=>({answer:'Recorded answer.',sources:[]})}),{brokenSegmenter:true});
  el.question.value='Question';el.composer.requestSubmit();
  await settle();
  const body=el.messages.children.at(-1).children[1].children[0];
  assert.equal(body.textContent,'Recorded answer.');
  assert.equal(el.send.disabled,false);
  assert.equal(el.notice.textContent,'');
});
test('chat sends immediately even if Render status check is stalled',async()=>{
  let chatRequests=0;
  const stalled=new Promise(()=>{});
  const el=terminal(async()=>{
    chatRequests++;
    return {ok:true,json:async()=>({answer:'Archive answer.',sources:[]})};
  },{statusRequest:()=>stalled});
  el.question.value='Cove info';el.composer.requestSubmit();
  await settle();
  assert.equal(chatRequests,1);
  assert.equal(el.send.disabled,false);
  assert.equal(el.notice.textContent,'');
});
test('failure to check status does not block a successful chat',async()=>{
  let calls=0;
  const el=terminal(async()=>{
    calls++;
    return {ok:true,json:async()=>({answer:'Pete is here.',sources:[]})};
  },{statusRequest:()=>Promise.reject(new TypeError('status unavailable'))});
  el.question.value='Ahoy';el.composer.requestSubmit();
  await settle();
  assert.equal(calls,1);
  assert.equal(el.send.disabled,false);
  assert.equal(el.notice.textContent,'');
});
test('authentication failures lock the session without leaving a stuck input',async()=>{
  const el=terminal(async()=>({ok:false,status:401,json:async()=>({error:'Invalid Pete key'})}));
  el.question.value='Question';el.composer.requestSubmit();
  await settle();
  assert.equal(el['access-form'].hidden,false);
  assert.equal(el.chat.hidden,true);
  assert.equal(el.send.disabled,false);
  assert.match(el.notice.textContent,/Invalid Pete key/);
});
