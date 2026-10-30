#!/usr/bin/env node
'use strict';
/* Promote verified high-quality output as the default for this exact edition. */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),id=process.argv[2];
if(!id||!/^[\w-]+$/.test(id))throw Error('Edition ID required');
const file=path.join(root,'checkins/manifest.json');
const data=JSON.parse(fs.readFileSync(file,'utf8'));
const edition=data.editions.find(x=>x.id===id);
if(!edition)throw Error('Missing edition in manifest '+id);
const url='https://github.com/CaptainPWilly/willy-dex/releases/download/'+id+'/'+id+'-HQ-1080p60.mp4';
edition.video=url;
edition.videoQuality={width:1080,height:1920,fps:60,codec:'H.264',audio:'AAC',version:'HQ'};
fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
const page=path.join(root,'checkins','editions',id,'index.html');
let html=fs.readFileSync(page,'utf8');
const selector='class="export-video" href="';
const from=html.indexOf(selector);
if(from<0)throw Error('Archived player missing download button');
const begin=from+selector.length,end=html.indexOf('"',begin);
if(end<0)throw Error('Unterminated archive link');
html=html.slice(0,begin)+url+html.slice(end);
fs.writeFileSync(page,html);
console.log('Promoted verified 1080p60 H.264 release as default '+id);
