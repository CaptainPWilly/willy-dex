'use strict';
(async()=>{const root=document.getElementById('completedWarResults');if(!root)return;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const fmt=n=>Number(n).toLocaleString();
try{const res=await fetch('wars.json?completed='+Date.now(),{cache:'no-store'});if(!res.ok)throw Error('History unavailable');const data=await res.json();
const latest=data.snapshots?.[data.snapshots.length-1];const wars=(latest?.wars||[]).filter(w=>w.status==='ended'&&(w.guildA==='The Pirate Cove'||w.guildB==='The Pirate Cove'));
const records=wars.map(w=>{const first=w.guildA==='The Pirate Cove',ours=first?w.killsA:w.killsB,theirs=first?w.killsB:w.killsA;return {...w,opponent:first?w.guildB:w.guildA,ours,theirs,result:ours>theirs?'Win':ours<theirs?'Loss':'Tied'}});
const wins=records.filter(w=>w.result==='Win').length,losses=records.filter(w=>w.result==='Loss').length;
root.innerHTML='<div class="flex"><div><h2>Recent completed wars</h2><p class="muted">Latest supplied war report · '+esc(latest?.capturedAt?.slice(0,10)||'Date unknown')+' · Recorded final kill totals</p></div></div>'+
'<div class="stats victory-stats">'+[['Completed',records.length],['Wins',wins],['Losses',losses]].map(([a,n])=>'<div class="stat"><span class="muted">'+a+'</span><b>'+fmt(n)+'</b></div>').join('')+'</div>'+
'<div class="table-wrap"><table class="victory-table"><thead><tr><th>Opponent</th><th>Result</th><th>Ended</th><th class="num">Cove kills</th><th class="num">Opponent kills</th></tr></thead><tbody>'+
records.map(w=>'<tr><td>'+esc(w.opponent)+'</td><td><strong class="'+(w.result==='Win'?'success':w.result==='Loss'?'err':'')+'">'+w.result+'</strong></td><td>'+esc(w.ageText.replace(/^This war ended /,''))+'</td><td class="num">'+fmt(w.ours)+'</td><td class="num">'+fmt(w.theirs)+'</td></tr>').join('')+
'</tbody></table></div><p class="muted victory-note">These are finished-war results from the latest snapshot, not additional victory notifications. Matching wins are already included in the historical victory totals below.</p>';
}catch(e){root.innerHTML='<h2>Recent completed wars</h2><p class="err">'+esc(e.message)+'</p>'}
})();