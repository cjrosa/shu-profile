/* Inspector surfaces; engine owns all security decisions. */
(function(root){
 'use strict';
 const attackTabs=new Map();
 function choiceIcon(value){
  const paths={
   reply:'<path d="m9 5-6 6 6 6M3 11h11a6 6 0 0 1 6 6v2"/><path d="m16 3 5 5m0-5-5 5"/>',
   request:'<path d="M3 12h17m-6-6 6 6-6 6"/><path d="m3 3 5 5m0-5L3 8"/>',
   victim:'<rect x="2" y="6" width="6" height="12" rx="1"/><rect x="16" y="6" width="6" height="12" rx="1"/><path d="M10 12h4m-2-2-2 2 2 2"/>',
   both:'<rect x="1" y="6" width="5" height="12" rx="1"/><rect x="18" y="6" width="5" height="12" rx="1"/><path d="M8 9h8m-2-2 2 2-2 2M16 15H8m2-2-2 2 2 2"/>',
   drop:'<path d="m8 3-5 5v8l5 5h8l5-5V8l-5-5Z"/><path d="m8 8 8 8m0-8-8 8"/>',
   forward:'<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/><path d="M8 2h8m-3-2 3 2-3 2"/>'
  };
  return '<svg class="os-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+(paths[value]||'')+'</svg>';
 }
 function attackPanel(n,d,esc){
  const c=d.spooferServer,r=n.spoofers[d.id],options=(values,current)=>values.map(([v,t])=>'<option value="'+v+'" '+(v===current?'selected':'')+'>'+t+'</option>').join('');
  const settings='<form id="spoofer-settings" class="arp-security-panel">'+
   '<label>Victim IPv4<input id="spoofer-victim" placeholder="Type @ to choose a host" autocomplete="off" value="'+esc(c.victim)+'" required></label><label>Impersonated IPv4 (gateway or peer)<input id="spoofer-peer" placeholder="Type @ to choose a host or gateway" autocomplete="off" value="'+esc(c.peer)+'" required></label><p class="hint">Type @ in either address field to choose a device or router interface.</p>'+
   '<label>Technique<select id="spoofer-technique">'+options([['reply','Forged reply'],['request','Forged request']],c.technique)+'</select></label>'+
   '<label>Direction<select id="spoofer-direction">'+options([['victim','Poison victim only'],['both','Poison both endpoints']],c.direction)+'</select></label>'+
   '<label>Intercepted traffic<select id="spoofer-traffic">'+options([['drop','Drop — interrupt service'],['forward','Forward — observe traffic']],c.traffic)+'</select></label>'+
   '<div class="arp-security-fields"><label>Rounds<input id="spoofer-count" type="number" min="1" max="100" value="'+c.count+'"></label><label>Speed<select id="spoofer-interval">'+options([[100,'Slow'],[20,'Medium'],[10,'Fast']],c.interval>=50?100:c.interval<=15?10:20)+'</select></label></div>'+
   '</form>';
  const captures='<div class="arp-interception-notice"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/></svg><div>'+(!r?.captures.length?'<span>No traffic yet. Generate traffic from the victim.</span>':'<span>Latest 100 packets · newest first</span>')+'</div></div>'+(!r?.captures.length?'':'<div class="arp-security-log">'+r.captures.slice().reverse().map(row=>'<details><summary>'+esc(row.action.toUpperCase()+' · '+row.source+' → '+row.destination+' · '+row.protocol)+'</summary><p>'+esc(row.encrypted?'TLS content remains encrypted.':'Next hop: '+row.nextHop)+'</p>'+(row.content?'<pre>'+esc(row.content)+'</pre>':'')+'</details>').join('')+'</div>');
  const active=attackTabs.get(d.id)||'settings',tabs=[{id:'settings',label:'Settings',body:settings,path:'M4 7h16M4 17h16M8 4v6M16 14v6'},{id:'interception',label:'Interception ('+(r?.captures.length||0)+')',body:captures,path:'M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1'}];
  const statusIcon=path=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>';
  const state=r?({finished:'Finished',running:'Running',stopped:'Stopped',unreachable:'Unreachable'}[r.status]||r.status):'Ready';
  const status='<div class="arp-status-summary" role="status" aria-live="polite" aria-atomic="true"><div class="arp-status-row">'+statusIcon(r?.status==='running'?'m8 4 12 8-12 8Z':'M4 5h16v14H4ZM8 9h8M8 13h5')+'<div><span class="arp-status-label">Attack</span><span class="arp-status-value">'+esc(state)+(r?' <span class="arp-status-count">'+r.sent+' '+(r.sent===1?'round':'rounds')+'</span>':'')+'</span></div></div><div class="arp-status-row '+(r?.intercepted?'is-warning':'')+'">'+statusIcon('M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12ZM10 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0')+'<div><span class="arp-status-label">Intercepted</span><span class="arp-status-value">'+(r?.intercepted||0)+' '+(r?.intercepted===1?'packet':'packets')+'</span></div></div></div>';
  return '<div class="arp-security-actions generator-toolbar"><button type="submit" form="spoofer-settings" aria-label="Run attack" title="Run attack" '+(r?.status==='running'?'disabled':'')+'><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 4 12 8-12 8Z"/></svg></button><button type="button" id="spoofer-stop" aria-label="Stop poisoning" title="Stop poisoning" '+(r?.status==='running'?'':'disabled')+'><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12v12H6Z"/></svg></button><span class="spoofer-run-state '+(r?.status==='running'?'is-running':'')+'" role="status" aria-live="polite"><span class="spoofer-run-dot" aria-hidden="true"></span>'+esc(r?.status==='running'?'Poisoning':r?.status==='finished'?'Rounds complete':state)+'</span></div>'+
   status+
   '<div class="security-monitor-tabs dock-header" role="tablist" aria-label="ARP Spoofer views">'+tabs.map(t=>'<span class="dock-tab-shell"><button type="button" role="tab" id="spoofer-tab-'+t.id+'" data-spoofer-tab="'+t.id+'" aria-controls="spoofer-panel-'+t.id+'" aria-selected="'+(active===t.id)+'" tabindex="'+(active===t.id?'0':'-1')+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+t.path+'"/></svg><span>'+t.label+'</span></button></span>').join('')+'</div>'+
   tabs.map(t=>'<div class="security-tab-panel" role="tabpanel" id="spoofer-panel-'+t.id+'" aria-labelledby="spoofer-tab-'+t.id+'" '+(active===t.id?'':'hidden')+'>'+t.body+'</div>').join('');
 }
 function bindAttack(el,n,d,h){
  const tabs=[...el.querySelectorAll('[data-spoofer-tab]')];
  const activate=tab=>{attackTabs.set(d.id,tab.dataset.spooferTab);tabs.forEach(b=>{const active=b===tab;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;el.querySelector('#'+b.getAttribute('aria-controls')).hidden=!active;});};
  tabs.forEach((tab,i)=>{tab.onclick=()=>activate(tab);tab.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;activate(tabs[next]);tabs[next].focus();};});
  el.querySelector('#spoofer-settings').addEventListener('invalid',()=>activate(tabs[0]),true);
  for(const [id,label]of [['technique','Technique'],['direction','Direction'],['traffic','Intercepted traffic']])h.styleSelect('spoofer-'+id,label,choiceIcon);
  h.styleSelect('spoofer-interval','Speed',()=> '');
  const value=id=>el.querySelector('#spoofer-'+id).value;
  el.querySelector('#spoofer-settings').onsubmit=e=>{e.preventDefault();h.run({enabled:true,victim:value('victim').trim(),peer:value('peer').trim(),technique:value('technique'),direction:value('direction'),traffic:value('traffic'),count:Number(value('count')),interval:Number(value('interval'))});};
  el.querySelector('#spoofer-stop').onclick=h.stop;
 }
 function policyPanel(n,d,esc){
  const c=d.arpInspection||NetworkExplorerArpSecurity.policyDefaults(),rows=n.arpDecisions[d.id]||[];
  return '<details class="arp-security-panel" open><summary>Layer 2 Security — ARP inspection</summary><p class="hint">Validate ARP before learning or forwarding. This static-binding teaching model checks IP, MAC, VLAN and attachment port. Settings apply immediately on either switch profile; this is not a vendor CLI emulation.</p>'+
   '<fieldset><legend>Inspect these VLANs</legend>'+d.vlans.map(v=>'<label><input type="checkbox" data-arp-vlan="'+v.id+'" '+(c.vlans.includes(v.id)?'checked':'')+'> '+esc(v.name)+' ('+v.id+')</label>').join('')+'</fieldset>'+
   '<details><summary>Trusted ports — bypass inspection</summary><p class="hint">Leave endpoint ports untrusted. A trusted attacker port bypasses protection.</p>'+d.ports.map(p=>'<label><input type="checkbox" data-arp-trust="'+p.id+'" '+(c.trustedPorts.includes(p.id)?'checked':'')+'> '+esc(p.name)+'</label>').join('')+'</details>'+
   '<div class="small-heading">Approved static bindings</div><div class="arp-binding-list">'+c.bindings.map((b,i)=>'<div class="arp-binding"><span>'+esc(b.ip)+' → '+esc(b.mac)+'<br>VLAN '+b.vlan+' · '+esc(d.ports.find(p=>p.id===b.port).name)+'</span><button type="button" data-arp-remove="'+i+'" aria-label="Remove binding for '+esc(b.ip)+'">×</button></div>').join('')+'</div>'+
   '<form id="arp-binding-form"><label>IPv4<input id="arp-binding-ip" required></label><label>MAC<input id="arp-binding-mac" placeholder="02:00:00:00:01:00" required></label><div class="arp-security-fields"><label>VLAN<select id="arp-binding-vlan">'+d.vlans.map(v=>'<option value="'+v.id+'">'+v.id+'</option>').join('')+'</select></label><label>Ingress port<select id="arp-binding-port">'+d.ports.map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('')+'</select></label></div><button type="submit">Add binding</button></form>'+
   '<p class="hint">Policy edits preserve caches. After blocking an attack, clear the affected hosts’ ARP caches, then send a fresh probe.</p><div class="small-heading">Recent ARP decisions (last 100)</div><div class="arp-security-log">'+(rows.length?rows.slice().reverse().map(r=>'<details><summary>'+esc(r.action.toUpperCase()+' · '+r.ip+' · VLAN '+r.vlan+' / '+d.ports.find(p=>p.id===r.port).name)+'</summary><p>'+esc(r.reason)+'</p><p>Claim: '+esc(r.mac)+'</p>'+(r.binding?'<p>Approved: '+esc(r.binding.mac)+' / '+esc(d.ports.find(p=>p.id===r.binding.port).name)+'</p>':'')+'</details>').join(''):'<p class="hint">No inspected ARP packets yet.</p>')+'</div></details>';
 }
 function bindPolicy(el,n,d,h){
  const current=()=>JSON.parse(JSON.stringify(d.arpInspection||NetworkExplorerArpSecurity.policyDefaults()));
  el.querySelectorAll('[data-arp-vlan]').forEach(input=>input.onchange=()=>{const c=current();c.vlans=Array.from(el.querySelectorAll('[data-arp-vlan]:checked'),x=>Number(x.dataset.arpVlan));h.configure(c);});
  el.querySelectorAll('[data-arp-trust]').forEach(input=>input.onchange=()=>{const c=current();c.trustedPorts=Array.from(el.querySelectorAll('[data-arp-trust]:checked'),x=>x.dataset.arpTrust);h.configure(c);});
  el.querySelectorAll('[data-arp-remove]').forEach(button=>button.onclick=()=>{const c=current();c.bindings.splice(Number(button.dataset.arpRemove),1);h.configure(c);});
  el.querySelector('#arp-binding-form').onsubmit=e=>{e.preventDefault();const c=current(),v=id=>el.querySelector('#arp-binding-'+id).value.trim();c.bindings.push({ip:v('ip'),mac:v('mac').toLowerCase(),vlan:Number(v('vlan')),port:v('port')});h.configure(c);};
 }
 root.NetworkExplorerArpSecurityUI={attackPanel,bindAttack,policyPanel,bindPolicy};
})(globalThis);
