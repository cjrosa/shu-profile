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
 function captureRow(row,esc){
  const svg=path=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>';
  const payload=!!row.content&&!row.encrypted;
  const icon=row.encrypted?'M5 10h14v11H5ZM8 10V6a4 4 0 0 1 8 0v4M12 14v3':payload?'M6 3h9l4 4v14H6ZM14 3v5h5M9 12h7M9 16h7':'M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4';
  return '<div class="arp-capture-row"><div class="arp-capture-heading">'+svg(icon)+'<span class="arp-capture-protocol">'+esc(row.protocol)+'</span><span class="arp-capture-action '+(row.action==='drop'?'is-drop':'')+'">'+(row.action==='drop'?'Dropped':'Forwarded')+'</span></div><div class="arp-capture-endpoints"><span>'+esc(row.source)+'</span>'+svg('M4 12h16m-5-5 5 5-5 5')+'<span>'+esc(row.destination)+'</span></div>'+(payload?'<details class="arp-capture-payload"><summary>'+svg('m9 5 7 7-7 7')+'<span>View payload</span></summary><pre>'+esc(row.content)+'</pre></details>':'<div class="arp-capture-message">'+(row.encrypted?'Encrypted content':'No application payload')+'</div>')+'</div>';
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
  const captures='<div class="arp-interception-notice"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/></svg><div>'+(!r?.captures.length?'<span>No traffic yet. Generate traffic from the victim.</span>':'<span>Latest 100 packets · newest first</span>')+'</div></div>'+(!r?.captures.length?'':'<div class="arp-security-log">'+r.captures.slice().reverse().map(row=>captureRow(row,esc)).join('')+'</div>');
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
 const policyTabs=new Map();
 const policySvg=path=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>';
 const portSvg=()=>'<svg class="arp-ethernet-port" viewBox="0 0 44 32" aria-hidden="true"><path class="socket" d="M5 3h34v20H28v6H16v-6H5z"/><path class="contacts" d="M12 6v7m5-7v7m5-7v7m5-7v7m5-7v7"/><path class="socket-edge" d="M9 19h7v5h12v-5h7"/></svg>';
 function vlanControls(d){const c=d.arpInspection||NetworkExplorerArpSecurity.policyDefaults();return d.vlans.map(v=>'<label class="certificate-toggle"><span>VLAN '+v.id+'</span><input type="checkbox" role="switch" aria-label="Inspect VLAN '+v.id+'" data-arp-vlan="'+v.id+'" '+(c.vlans.includes(v.id)?'checked':'')+'><span class="certificate-switch" aria-hidden="true"></span></label>').join('');}
 function policySection(n,d,esc){return '<div class="small-heading inspector-section-heading"><span>ARP Inspection</span>'+(d.arpInspection?.vlans.length?'<button type="button" id="open-arp-inspection" class="section-expand" title="Open ARP Inspection" aria-label="Open ARP Inspection">'+policySvg('M14 3h7v7M21 3l-7 7M10 21H3v-7M3 21l7-7')+'</button>':'')+'</div>'+vlanControls(d);}
 function policyPanel(n,d,esc,ports){
  const c=d.arpInspection||NetworkExplorerArpSecurity.policyDefaults(),rows=n.arpDecisions[d.id]||[],portName=id=>d.ports.find(p=>p.id===id)?.name||id;
  const settings='<div class="arp-policy-heading">Inspected VLANs</div><div class="arp-inspected-vlans">'+d.vlans.filter(v=>c.vlans.includes(v.id)).map(v=>'<span class="vlan-badge" style="--vlan-color:'+esc(v.color)+'" title="'+esc(v.name)+'">V'+v.id+'</span>').join('')+'</div>'+'<div class="arp-policy-heading">Trusted ports</div><p class="hint">Trusted ports bypass inspection.</p>'+ports;
  const bindings='<form id="arp-binding-form" hidden><label>IPv4<input id="arp-binding-ip" placeholder="Type @ to choose a device" autocomplete="off" required></label><label>MAC<input id="arp-binding-mac" placeholder="02:00:00:00:01:00" required></label><div class="arp-security-fields"><label>VLAN<select id="arp-binding-vlan">'+d.vlans.map(v=>'<option value="'+v.id+'">'+v.id+'</option>').join('')+'</select></label><label>Ingress port<select id="arp-binding-port">'+d.ports.map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('')+'</select></label></div><div class="arp-binding-actions"><button type="submit" class="vlan-icon-button" aria-label="Save binding" title="Save binding">'+policySvg('M5 3h12l4 4v14H3V3h2ZM7 3v6h10V3M7 21v-8h10v8')+'</button><button type="button" id="cancel-arp-binding" class="vlan-icon-button" aria-label="Cancel new binding" title="Cancel">'+policySvg('m6 6 12 12M18 6 6 18')+'</button></div></form><div class="arp-binding-list">'+(c.bindings.length?c.bindings.map((b,i)=>'<div class="arp-binding"><div><strong>'+esc(b.ip)+'</strong><div class="arp-binding-mac">'+esc(b.mac)+'</div><div class="arp-port-label">'+portSvg()+esc(portName(b.port))+' <span class="vlan-badge" style="--vlan-color:'+esc(d.vlans.find(v=>v.id===b.vlan)?.color)+'">V'+b.vlan+'</span></div></div><button type="button" data-arp-remove="'+i+'" title="Remove binding" aria-label="Remove binding for '+esc(b.ip)+'">'+policySvg('M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6')+'</button></div>').join(''):'<p class="hint">No approved bindings.</p>')+'</div>';
  const decisions='<div class="arp-policy-decisions">'+(rows.length?rows.slice().reverse().map(r=>'<div class="arp-decision"><div class="arp-decision-heading '+(r.action==='drop'?'is-drop':'')+'">'+policySvg(r.action==='drop'?'M6 6l12 12M18 6 6 18':'M4 12l5 5L20 6')+'<strong>'+esc(r.action==='drop'?'Dropped':'Allowed')+'</strong><span>'+esc(r.ip)+'</span></div><div class="arp-port-label">'+portSvg()+esc(portName(r.port))+' / VLAN '+r.vlan+'</div><div>'+esc(r.reason)+'</div><code>'+esc(r.mac)+'</code></div>').join(''):'<p class="hint">No inspected ARP packets yet.</p>')+'</div>';
  const tabs=[['settings','Settings','M4 7h16M4 17h16M8 4v6M16 14v6',settings+'<div class="small-heading inspector-section-heading vlan-heading"><span>Bindings</span><button type="button" id="show-arp-binding" class="vlan-icon-button" aria-label="Add binding" title="Add binding" aria-expanded="false" aria-controls="arp-binding-form">'+policySvg('M12 5v14M5 12h14')+'</button></div>'+bindings],['decisions','Decisions','M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1',decisions]],active=policyTabs.get(d.id)==='decisions'?'decisions':'settings';
  return '<div class="arp-policy-app"><div class="security-monitor-tabs dock-header" role="tablist" aria-label="ARP Inspection views">'+tabs.map(([id,label,path])=>'<span class="dock-tab-shell"><button type="button" role="tab" data-arp-tab="'+id+'" id="arp-tab-'+id+'" aria-controls="arp-panel-'+id+'" aria-selected="'+(active===id)+'" tabindex="'+(active===id?0:-1)+'">'+policySvg(path)+label+'</button></span>').join('')+'</div>'+tabs.map(([id,label,path,body])=>'<div class="security-tab-panel" role="tabpanel" id="arp-panel-'+id+'" aria-labelledby="arp-tab-'+id+'" '+(active===id?'':'hidden')+'>'+body+'</div>').join('')+'</div>';
 }
 function bindPolicy(el,n,d,h){
  const tabs=[...el.querySelectorAll('[data-arp-tab]')];
  const activate=tab=>{policyTabs.set(d.id,tab.dataset.arpTab);tabs.forEach(b=>{const active=b===tab;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;el.querySelector('#'+b.getAttribute('aria-controls')).hidden=!active;});};
  tabs.forEach((tab,i)=>{tab.onclick=()=>activate(tab);tab.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const index=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;activate(tabs[index]);tabs[index].focus();};});
  if(el.querySelector('#arp-binding-form')){h.styleSelect('arp-binding-port','Ingress port',portSvg);h.styleSelect('arp-binding-vlan','VLAN',value=>{const color=d.vlans.find(v=>v.id===Number(value))?.color;return '<svg class="arp-vlan-swatch" viewBox="0 0 24 24" aria-hidden="true" style="color:'+(/^#[0-9a-f]{6}$/i.test(color)?color:'#61758a')+'"><rect x="3" y="3" width="18" height="18" rx="4"/></svg>';});}
  const add=el.querySelector('#show-arp-binding'),form=el.querySelector('#arp-binding-form');
  if(form){
    const port=el.querySelector('#arp-binding-port'),vlan=el.querySelector('#arp-binding-vlan');
    const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const markup=p=>{
      const v=d.vlans.find(v=>v.id===p.accessVlan),c=d.arpInspection||NetworkExplorerArpSecurity.policyDefaults();
      const link=n.links.find(l=>l.a===d.id&&l.ap===p.id||l.b===d.id&&l.bp===p.id),peer=link?n.device(link.a===d.id?link.b:link.a)?.name:'Not connected';
      const status=!c.vlans.includes(p.accessVlan)?'Not inspected':c.trustedPorts.includes(p.id)?'Trusted - bypassed':'Inspected';
      return portSvg()+'<span class="arp-port-choice"><span><strong>'+safe(p.name)+'</strong> <span class="vlan-badge" style="--vlan-color:'+safe(v?.color)+'">V'+p.accessVlan+'</span></span><small>'+status+'</small><small>'+safe(peer)+'</small></span>';
    };
    const refreshPorts=()=>{
      for(const option of port.options)option.disabled=d.ports.find(p=>p.id===option.value)?.accessVlan!==Number(vlan.value);
      if(!port.selectedOptions[0]||port.selectedOptions[0].disabled){const first=[...port.options].find(o=>!o.disabled);if(first)port.value=first.value;}
      const valid=!!port.selectedOptions[0]&&!port.selectedOptions[0].disabled;
      form.querySelector('[type="submit"]').disabled=!valid;
      port.setCustomValidity(valid?'':'No port belongs to the selected VLAN.');
      el.querySelector('#arp-binding-port-value').innerHTML=valid?portSvg()+'<span>'+safe(d.ports.find(p=>p.id===port.value).name)+'</span>':'No matching ports';
      el.querySelectorAll('#arp-binding-port-options [role="option"]').forEach(button=>{const p=d.ports.find(p=>p.id===button.dataset.value);button.disabled=p.accessVlan!==Number(vlan.value);button.setAttribute('aria-disabled',String(button.disabled));button.setAttribute('aria-selected',String(valid&&p.id===port.value));button.firstElementChild.innerHTML=markup(p);});
    };
    port.addEventListener('change',refreshPorts);vlan.addEventListener('change',refreshPorts);
    form.addEventListener('bindingreset',()=>{vlan.dispatchEvent(new Event('pickerrefresh'));refreshPorts();});
    refreshPorts();
  }
  if(add&&form){add.onclick=()=>{form.hidden=false;add.setAttribute('aria-expanded','true');el.querySelector('#arp-binding-ip').focus();};el.querySelector('#cancel-arp-binding').onclick=()=>{form.reset();form.dispatchEvent(new Event('bindingreset'));form.hidden=true;add.setAttribute('aria-expanded','false');add.focus();};}
  const current=()=>JSON.parse(JSON.stringify(d.arpInspection||NetworkExplorerArpSecurity.policyDefaults()));
  el.querySelectorAll('[data-arp-vlan]').forEach(input=>input.onchange=()=>{const c=current();c.vlans=Array.from(el.querySelectorAll('[data-arp-vlan]:checked'),x=>Number(x.dataset.arpVlan));h.configure(c);});
  el.querySelectorAll('[data-arp-trust]').forEach(input=>input.onchange=()=>{const c=current();c.trustedPorts=Array.from(el.querySelectorAll('[data-arp-trust]:checked'),x=>x.dataset.arpTrust);h.configure(c);});
  el.querySelectorAll('[data-arp-remove]').forEach(button=>button.onclick=()=>{const c=current();c.bindings.splice(Number(button.dataset.arpRemove),1);h.configure(c);});
  if(el.querySelector('#arp-binding-form'))el.querySelector('#arp-binding-form').onsubmit=e=>{e.preventDefault();const c=current(),v=id=>el.querySelector('#arp-binding-'+id).value.trim();c.bindings.push({ip:v('ip'),mac:v('mac').toLowerCase(),vlan:Number(v('vlan')),port:v('port')});h.configure(c);};
 }
 root.NetworkExplorerArpSecurityUI={attackPanel,bindAttack,policyPanel,policySection,bindPolicy};
})(globalThis);
