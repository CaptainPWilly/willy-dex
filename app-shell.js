/* Willy Dex unified navigation. All routes and active states live here. */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script) return;
  var base = new URL('./', script.src);
  var groups = [
    {id:'personnel',title:'Personnel',pages:[
      {id:'cards',title:'Cards',url:'index.html'},
      {id:'careers',title:'Pirate Careers',url:'pirate-careers.html'}
    ]},
    {id:'intelligence',title:'Intelligence',pages:[
      {id:'wars',title:'War Intel',url:'wars.html'},
      {id:'glb',title:'Global Leaderboard',url:'glb.html'}
    ]},
    {id:'media',title:'Media',pages:[
      {id:'videos',title:'Video Library',url:'checkins/index.html'},
      {id:'studio',title:'Video Studio',url:'checkins/studio.html'}
    ]},
    {id:'tools',title:'Tools',pages:[
      {id:'tags',title:'SMMO Tags',url:'smmo-tags.html'}
    ]},
    {id:'pete',title:'Scurvy Pete',pages:[
      {id:'pete-chat',title:'AI Chat',url:'scurvy-pete.html'}
    ]}
  ];
  function link(path){return new URL(path,base).href;}
  function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function render(){
    var mount=document.getElementById('wc-app-mount');
    if(!mount) return;
    var pathname=location.pathname.replace(/\/$/,'/index.html');
    var group=groups[0],page=group.pages[0];
    groups.some(function(g){return g.pages.some(function(p){
      if(new URL(p.url,base).pathname===pathname){group=g;page=p;return true;}return false;
    });});
    var areas=groups.map(function(g){
      var active=g.id===group.id;
      return '<a class="wc-app-area'+(active?' is-active':'')+'" href="'+esc(link(g.pages[0].url))+'"'+(active?' aria-current="true"':'')+'>'+esc(g.title)+'</a>';
    }).join('');
    var pages=group.pages.map(function(p){
      var active=p.id===page.id;
      return '<a class="wc-app-page'+(active?' is-active':'')+'" href="'+esc(link(p.url))+'"'+(active?' aria-current="page"':'')+'>'+esc(p.title)+'</a>';
    }).join('');
    mount.innerHTML='<div id="wc-app-shell"><div class="wc-app-inner"><div class="wc-app-top">'+
      '<a class="wc-app-brand" href="'+esc(link('index.html'))+'" aria-label="Willy Dex home">'+
      '<span class="wc-app-emblem" aria-hidden="true">W</span><span><span class="wc-app-title">WILLY DEX</span>'+
      '<small>WILLY CORP / THE PIRATE COVE</small></span></a>'+
      '<div class="wc-app-areas" role="navigation" aria-label="Main sections">'+areas+'</div></div></div>'+
      '<div class="wc-app-subwrap"><div class="wc-app-inner"><div class="wc-app-sub">'+
      '<span class="wc-app-context">'+esc(group.title.toUpperCase())+'</span>'+
      '<div class="wc-app-pages" role="navigation" aria-label="'+esc(group.title)+' pages">'+pages+'</div>'+
      '<button type="button" class="wc-app-refresh" aria-label="Refresh current page" title="Refresh current page">'+
      '<span class="wc-app-refresh-icon" aria-hidden="true">↻</span><span class="wc-app-refresh-label">Refresh</span></button>'+
      '</div></div></div></div>';
    mount.querySelector('.wc-app-refresh').addEventListener('click',function(){location.reload();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
})();
