/* Network Explorer: presentation and interaction only; protocols live in the engine. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let net=new NetworkExplorer.Network(),selected=null,connecting=false,endpoint=null,running=false,timer=null,staged=null,drag=null,previousFocus=null,examined=false,messageTimer;
 let platform='cisco',candidateBase=null;try{platform=localStorage.getItem('network-explorer-platform')==='paloalto'?'paloalto':'cisco';}catch{}
 const isPan=()=>platform==='paloalto';
 const vlanLabel=(d,id)=>isPan()?NetworkExplorerPlatform.vlanName(d,id):'V'+id;
 function configurationChange(fn){const before=net.save();fn();if(isPan()&&JSON.stringify(before)!==JSON.stringify(net.save()))candidateBase??=before;}
 function commitConfiguration(){if(!editable())return false;if(candidateBase){candidateBase=null;net.reset();examined=false;render();}return true;}
 function revertConfiguration(){if(!editable())return;if(candidateBase){const layout=new Map(net.devices.map(d=>[d.id,{x:d.x,y:d.y,watch:d.watch}]));net=new NetworkExplorer.Network(candidateBase);net.devices.forEach(d=>Object.assign(d,layout.get(d.id)||{}));candidateBase=null;render();}}
 const say=text=>{ $('message').textContent=text;clearTimeout(messageTimer);messageTimer=setTimeout(()=>$('message').textContent='',6500);};
 const output=text=>{$('terminal').textContent+='\n'+text;$('terminal').scrollTop=$('terminal').scrollHeight;syncExternal();};
 const safely=fn=>{try{fn();}catch(e){say(e.message);}};
 let flightPaused=false,phaseCallback=null,phaseRemaining=0,phaseDeadline=0;
 function updatePauseControl(){const button=$('pause-animation');if(!button)return;button.disabled=!phaseCallback;button.setAttribute('aria-pressed',String(flightPaused));button.title=flightPaused?'Resume animation':'Pause animation';button.innerHTML=flightPaused?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg><span>Resume</span>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg><span>Pause</span>';$('traffic').classList.toggle('flight-paused',flightPaused);}
 function schedulePhase(callback,delay){clearTimeout(timer);phaseCallback=callback;phaseRemaining=delay;phaseDeadline=performance.now()+delay;if(!flightPaused)timer=setTimeout(()=>{phaseCallback=null;timer=null;updatePauseControl();callback();},delay);updatePauseControl();}
 function stop(){running=false;clearTimeout(timer);timer=null;phaseCallback=null;flightPaused=false;$('canvas')?.unpauseAnimations();$('flight-inspection')?.close();updatePauseControl();}

 const cliContexts=new Map();
 function cliContext(d){if(!cliContexts.has(d.id))cliContexts.set(d.id,{mode:"exec"});return cliContexts.get(d.id);}
 function cliPrompt(d){const c=cliContext(d);if(isPan()&&d.type==='switch')return 'admin@'+d.name.replace(/\s+/g,'-')+(c.mode==='exec'?'>':'#');return d.name+(c.mode==="exec"?" >":c.mode==="config"?"(config)#":c.mode==="vlan"?"(config-vlan)#":"(config-if)#");}
 function discard(){cliContexts.clear();finishPlacement();stop();staged=null;$('traffic').replaceChildren();if($('examine').open)$('examine').close();}
 function editable(){if(net.queue.length||staged){say('Finish the exchange or clear learned state before changing the network.');inspector();return false;}return true;}
 function mutate(fn){if(!editable())return;safely(()=>{configurationChange(fn);net.reset();examined=false;render();});}
 function expiryMarkup(expiresAt){if(!Number.isFinite(expiresAt))return '&mdash;';const seconds=Math.max(0,Math.ceil((expiresAt-Date.now())/1000));return '<span class="cache-countdown" data-expires-at="'+expiresAt+'" title="Expires after 120 seconds of real time; learning refreshes the timer"><svg viewBox="0 0 20 20" aria-hidden="true"><circle class="countdown-track" cx="10" cy="10" r="7"/><circle class="countdown-progress" cx="10" cy="10" r="7" pathLength="120" stroke-dasharray="'+Math.min(120,seconds)+' 120"/></svg><span>'+seconds+'s</span></span>';}
 function refreshCountdowns(root=document){root.querySelectorAll('[data-expires-at]').forEach(el=>{const seconds=Math.max(0,Math.ceil((Number(el.dataset.expiresAt)-Date.now())/1000));el.querySelector('span').textContent=seconds+'s';el.querySelector('.countdown-progress').setAttribute('stroke-dasharray',Math.min(120,seconds)+' 120');});}
 function table(rows,kind){const values=Object.entries(rows||{});return values.length?'<table><thead><tr>'+(kind==='switch'?'<th>VLAN</th>':'')+'<th>'+(kind==='switch'?'MAC address':'IPv4 address')+'</th><th>'+(kind==='switch'?'Port':'MAC address')+'</th>'+(kind==='router'?'<th>Interface</th>':'')+'<th title="Remaining real time; entries expire even while idle">Expires in</th></tr></thead><tbody>'+values.map(([key,v])=>'<tr data-table-mac="'+esc(v.mac||key)+'" tabindex="0">'+(kind==='switch'?'<td>'+esc(v.vlanLabel??(v.vlan||1))+'</td>':'')+'<td>'+esc(kind==='switch'?(v.mac||key):(v.ip||key))+'</td><td>'+esc(v.port||v.mac)+'</td>'+(kind==='router'?'<td>'+esc(v.interfaceName||v.interface)+'</td>':'')+'<td class="table-expiry">'+expiryMarkup(v.expiresAt)+'</td></tr>').join('')+'</tbody></table>':'<p class="hint">No learned entries.</p>';}
 function visibleTable(rows,d){if(d.type==='router')return Object.fromEntries(Object.entries(rows||{}).map(([k,v])=>[k,{...v,interfaceName:d.ports.find(p=>p.id===v.interface)?.name||v.interface}]));if(d.type!=='switch')return rows;return Object.fromEntries(Object.entries(rows||{}).map(([k,v])=>[k,{...v,vlanLabel:isPan()?NetworkExplorerPlatform.vlanName(d,v.vlan||1):(v.vlan||1),port:d.ports.find(p=>p.id===v.port)?.name||v.port}]));}
 function hostOsLogo(d){const os=d.os||'windows';const logos={windows:'<path fill="#1676d2" d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z"/>',linux:'<ellipse cx="12" cy="13" rx="7" ry="9" fill="#263342"/><circle cx="12" cy="6" r="5" fill="#263342"/><ellipse cx="12" cy="15" rx="4.7" ry="6" fill="#fff"/><ellipse cx="10" cy="6" rx="1.5" ry="2" fill="#fff"/><ellipse cx="14" cy="6" rx="1.5" ry="2" fill="#fff"/><circle cx="10.4" cy="6.3" r=".65" fill="#263342"/><circle cx="13.6" cy="6.3" r=".65" fill="#263342"/><path fill="#efa923" d="m9 9 3-2 3 2-3 2zM3 21l5-3 3 4-7 1zM21 21l-5-3-3 4 7 1z"/>',macos:'<path fill="#354559" d="M15 5c0-2 1.5-4 4-4 0 2-1.5 4-4 4ZM12 7c-2-2-6-2-8 1-3 4 0 11 3 14 2 2 3-1 5-1s3 3 5 1c2-2 3-4 4-6-4-2-4-6-1-8-2-3-5-3-8-1Z"/>'};return '<g class="host-os-logo" data-host-os="'+os+'" transform="translate(-18,-18) scale(.85)" stroke="none">'+logos[os]+'</g>';}
 function routerIcon(){return '<path d="M-37-7v19c0 9 17 16 37 16s37-7 37-16V-7Z" fill="#b4cada" stroke="#3b5278" stroke-width="2"/><path d="M0 9v18c20 0 37-7 37-15V-7Z" fill="#93afc7"/><path d="M-37-7v19c0 9 17 16 37 16s37-7 37-16V-7" fill="none" stroke="#3b5278" stroke-width="2"/><ellipse cx="0" cy="-7" rx="37" ry="17" fill="#edf4fa" stroke="#3b5278" stroke-width="2"/><g stroke="#3b5278" stroke-width="2.3" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M-26-7h18m-5-5 5 5-5 5M26-7H8m5-5-5 5 5 5M0-8v-13m-5 5 5-5 5 5M0-4V7m-5-5 5 5 5-5"/></g><path d="M-27 14c5 3 10 4 15 5" fill="none" stroke="#e7f0f7" stroke-width="2" stroke-linecap="round"/>';}
 function routePanel(d){return '<div class="small-heading inspector-section-heading">Connected routes</div>'+ (net.routes(d.id).length?'<table><thead><tr><th>Network</th><th>Interface</th></tr></thead><tbody>'+net.routes(d.id).map(r=>'<tr><td>'+esc(r.network+'/'+r.prefix)+'</td><td>'+esc(d.ports.find(p=>p.id===r.port).name)+'</td></tr>').join('')+'</tbody></table>':'<p class="hint">Configure an enabled interface to add its connected route.</p>');}
 function icon(d){if(d.type==='router')return routerIcon();return d.type==='host'?'<rect x="-31" y="-24" width="46" height="34" rx="3" fill="#fff" stroke="currentColor" stroke-width="2"/><rect x="-27" y="-20" width="38" height="25" rx="1" fill="#cce4f5"/>'+hostOsLogo(d)+'<path d="M-8 10v9m-12 0h24" stroke="currentColor" stroke-width="3"/><rect x="21" y="-24" width="16" height="45" rx="3" fill="#dce8f1" stroke="currentColor" stroke-width="2"/><path d="M25-17h8m-8 5h8m-8 5h8" stroke="currentColor"/><circle cx="29" cy="12" r="2" fill="#287d78"/><path d="M-30 26h47l5 5h-57z" fill="#dce8f1" stroke="currentColor"/>':'<path d="M-36-14l7-10h58l7 10" fill="#b9ddd6" stroke="currentColor" stroke-width="2"/><rect x="-37" y="-14" width="74" height="37" rx="4" fill="#f1faf7" stroke="currentColor" stroke-width="2"/><path d="M-32-7h18m-18 4h12" stroke="currentColor"/><circle cx="27" cy="-6" r="2" fill="#44a482"/>'+Array.from({length:8},(_,i)=>{const x=-29+(i%4)*16,y=3+Math.floor(i/4)*9;return '<rect x="'+x+'" y="'+y+'" width="11" height="7" rx="1" fill="#245b58"/><path d="M'+(x+3)+' '+(y+1)+'v2m3-2v2" stroke="#afd7c7" stroke-width="1"/>';}).join('');}
 function portPosition(d,id,side){const anchor=side||(['top','left','bottom','right'].includes(id)?id:(d.type==='host'?'right':'left'));const offset={top:[0,-33],left:[-41,0],bottom:[0,33],right:[41,0]}[anchor];return {x:d.x+offset[0],y:d.y+offset[1]};}
 function occupied(device,port){return net.links.some(l=>(l.a===device&&l.ap===port)||(l.b===device&&l.bp===port));}
 function drawAnchors(){
  $('anchors').innerHTML=net.devices.flatMap(d=>['top','left','bottom','right'].map(side=>{const q=portPosition(d,side);return '<g class="port-anchor available" data-anchor-device="'+esc(d.id)+'" data-anchor-port="'+side+'" transform="translate('+q.x+','+q.y+')" tabindex="0" role="button" aria-label="'+esc(d.name+' '+side+' connection anchor')+'"><title>'+esc(d.name+' / '+side+' - shared connection anchor')+'</title><circle class="port-hit" r="10" fill="transparent"/><circle class="port-dot" r="5"/></g>';})).join('');
 }
 let hoveredDevice=null;
 function revealAnchors(id){
  hoveredDevice=id;
  $('anchors').querySelectorAll('[data-anchor-device]').forEach(a=>a.classList.toggle('anchor-visible',a.dataset.anchorDevice===id));
 }
 let cableGesture=null;
 function previewCable(p){if(!endpoint)return;const a=portPosition(net.device(endpoint.device),endpoint.port);$('cable-preview').innerHTML='<line x1="'+a.x+'" y1="'+a.y+'" x2="'+p.x+'" y2="'+p.y+'" stroke="#287d78" stroke-width="3" stroke-dasharray="7 5"/>';}
 function pickAnchor(anchor){
  if(!editable())return;
  const device=anchor.dataset.anchorDevice,side=anchor.dataset.anchorPort;
  if(endpoint){
   if(endpoint.device===device){say('Choose an anchor on a different device.');return;}
   const source=net.device(endpoint.device),destination=net.device(device);
   if([source,destination].some(d=>!d.ports.some(p=>p.enabled&&!occupied(d.id,p.id)))){say('Each endpoint needs an enabled, available Ethernet port.');return;}
   pendingCable={source:source.id,destination:destination.id,aAnchor:endpoint.port,bAnchor:side,ports:{}};
   previewCable(portPosition(destination,side));
   nextCablePort();return;
  }
  endpoint={device,port:side};connecting=true;$('cancel-connect').hidden=false;$('connection-hint').textContent='Drop on another anchor, or click it. Escape cancels.';previewCable(portPosition(net.device(device),side));
 }
 // Pick physical interfaces separately from the shared canvas anchors.
 let pendingCable=null;
 const portPicker=document.createElement('dialog');
 portPicker.id='port-picker';portPicker.setAttribute('aria-labelledby','port-picker-title');
 document.body.append(portPicker);
 function nextCablePort(){
  if(!pendingCable)return;
  for(const key of ['source','destination']){
   if(pendingCable.ports[key])continue;
   const d=net.device(pendingCable[key]);
   if(d.type==='host'&&d.ports.length===1){pendingCable.ports[key]=d.ports[0].id;continue;}
   portPicker.innerHTML='<h2 id="port-picker-title">'+esc(d.name)+'</h2><p class="hint">Choose an available port for this cable.</p>'+interfacePanel(d)+'<button id="cancel-port-picker">Cancel connection</button>';
   portPicker.querySelector('.small-heading').remove();
   portPicker.querySelector('.interface-chassis').previousElementSibling.remove();
   portPicker.querySelectorAll('[data-port]').forEach(button=>{
    const p=d.ports.find(p=>p.id===button.dataset.port),used=occupied(d.id,p.id);
    const state=used?'In use':p.enabled?'Available':'Disabled';
    button.disabled=used||!p.enabled;button.removeAttribute('aria-pressed');
    button.classList.toggle('occupied',used);
    button.querySelector('.port-state').textContent=state;
    button.setAttribute('aria-label',p.name+' - '+state);button.title=p.name+' - '+state;
    button.onclick=()=>{pendingCable.ports[key]=p.id;nextCablePort();};
   });
   $('cancel-port-picker').onclick=cancelConnect;
   if(!portPicker.open)portPicker.showModal();
   const anchor=svg.querySelector('[data-anchor-device="'+d.id+'"][data-anchor-port="'+pendingCable[key==='source'?'aAnchor':'bAnchor']+'"]');
   const bounds=anchor.getBoundingClientRect();
   portPicker.style.left=Math.max(8,Math.min(bounds.right+12,document.documentElement.clientWidth-portPicker.offsetWidth-8))+'px';
   portPicker.style.top=Math.max(8,Math.min(bounds.top,window.innerHeight-portPicker.offsetHeight-8))+'px';
   portPicker.querySelector('[data-port]:not(:disabled)')?.focus();return;
  }
  const cable=pendingCable;
  try{
   const link=net.connect(cable.source,cable.ports.source,cable.destination,cable.ports.destination);
   link.aAnchor=cable.aAnchor;link.bAnchor=cable.bAnchor;
   cancelConnect();examined=false;render();
  }catch(e){cancelConnect();say(e.message);}
 }
 portPicker.addEventListener('cancel',e=>{e.preventDefault();cancelConnect();});
 function cablePath(l){
  const a=net.device(l.a),b=net.device(l.b);
  const facing=(from,to)=>Math.abs(to.x-from.x)>Math.abs(to.y-from.y)?(to.x>from.x?'right':'left'):(to.y>from.y?'bottom':'top');
  l.aAnchor=l.aAnchor||facing(a,b);l.bAnchor=l.bAnchor||facing(b,a);
  const start=portPosition(a,l.ap,l.aAnchor),end=portPosition(b,l.bp,l.bAnchor);
  const vector={top:[0,-1],left:[-1,0],bottom:[0,1],right:[1,0]};
  const av=vector[l.aAnchor],bv=vector[l.bAnchor],reach=Math.max(60,Math.min(140,Math.hypot(end.x-start.x,end.y-start.y)*.35));
  return {start,end,c1:{x:start.x+av[0]*reach,y:start.y+av[1]*reach},c2:{x:end.x+bv[0]*reach,y:end.y+bv[1]*reach}};
 }
 function pathData(p,reverse=false){const a=reverse?p.end:p.start,b=reverse?p.start:p.end,c=reverse?p.c2:p.c1,d=reverse?p.c1:p.c2;return 'M'+a.x+','+a.y+' C'+c.x+','+c.y+' '+d.x+','+d.y+' '+b.x+','+b.y;}
 function draw(){
  $('links').innerHTML=net.links.map(l=>{const route=cablePath(l);const da=net.device(l.a),db=net.device(l.b),a={...da,...portPosition(da,l.ap,l.aAnchor)},b={...db,...portPosition(db,l.bp,l.bAnchor)};const enabled=l.enabled&&a.ports.find(p=>p.id===l.ap).enabled&&b.ports.find(p=>p.id===l.bp).enabled;return '<g class="wire" data-link="'+esc(l.id)+'" tabindex="0" role="button" aria-label="Cable '+esc(a.name)+' to '+esc(b.name)+'"><path d="'+pathData(route)+'" fill="none" stroke="transparent" stroke-width="20"/><path d="'+pathData(route)+'" fill="none" stroke="'+(selected===l.id?'#287d78':'#9ab0c2')+'" stroke-width="'+(selected===l.id?4:2)+'" '+(enabled?'':'stroke-dasharray="8 6"')+'/><text x="'+(a.x*.7+b.x*.3)+'" y="'+(a.y*.7+b.y*.3-8)+'" font-size="11" fill="#61758a">'+esc(a.ports.find(p=>p.id===l.ap).name)+'</text><text x="'+(a.x*.3+b.x*.7)+'" y="'+(a.y*.3+b.y*.7-8)+'" font-size="11" fill="#61758a">'+esc(b.ports.find(p=>p.id===l.bp).name)+'</text></g>';}).join('');
  $('devices').innerHTML=net.devices.map(d=>'<g class="node '+(selected===d.id?'selected':'')+'" data-device="'+esc(d.id)+'" transform="translate('+d.x+','+d.y+')" tabindex="0" role="button" aria-label="'+esc(d.name)+(d.watch?', watched':'')+'" style="color:'+(d.type==='host'?'#284d73':'#287d78')+'">'+(d.watch?'<rect class="watch-ring" x="-47" y="-39" width="94" height="78" rx="17"/>':'')+'<rect class="device-body" x="-41" y="-33" width="82" height="66" rx="12" fill="'+(d.type==='host'?'#eaf3fa':'#e7f4f1')+'" stroke="currentColor" stroke-width="2"/>'+icon(d)+'<text text-anchor="middle" y="55" font-size="14" font-weight="600" fill="#29394b">'+esc(d.name)+'</text><text text-anchor="middle" y="73" font-size="12" fill="#61758a">'+esc(d.type==='host'?(d.ip?d.ip+'/'+d.prefix:'Not configured'):d.type==='router'?'2 routed interfaces':'8 Ethernet ports')+'</text>'+(d.watch?'<g class="device-watch-eye" data-watch-device="'+esc(d.id)+'" role="button" tabindex="0" aria-label="Stop watching '+esc(d.name)+'" data-tooltip="Stop watching '+esc(d.name)+'" fill="none" stroke="#287d78" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="-3" y="-4" width="26" height="24" fill="transparent" stroke="none"/><path d="M1 8s3.5-6 9-6 9 6 9 6-3.5 6-9 6S1 8 1 8Z"/><circle cx="10" cy="8" r="2.6"/></g>':'')+'</g>').join('');
  $('devices').querySelectorAll('.device-watch-eye').forEach(eye=>{const name=eye.parentNode.querySelector('text');eye.setAttribute('transform','translate('+(name.getBBox().x+name.getBBox().width+5)+',44) scale(.7)');});
  drawAnchors();revealAnchors(hoveredDevice);refreshPortGlow();
  if(!net.devices.length)$('devices').innerHTML='<text x="450" y="255" text-anchor="middle" fill="#61758a" font-size="20">Build your first network</text><text x="450" y="285" text-anchor="middle" fill="#61758a" font-size="14">Add two hosts and a switch from the palette.</text>';
 }

 let hoveredPort=null,focusedPort=null;
 function refreshPortGlow(){const button=(hoveredPort?.isConnected?hoveredPort:null)||(focusedPort?.isConnected?focusedPort:null);const [device,port]=(button?.dataset.devicePort||'').split(':');const link=net.links.find(l=>(l.a===device&&l.ap===port)||(l.b===device&&l.bp===port));$('links').querySelectorAll('[data-link]').forEach(el=>el.classList.toggle('port-highlight',el.dataset.link===link?.id));}
 for(const [enter,leave,focus] of [['pointerover','pointerout',false],['focusin','focusout',true]]){document.addEventListener(enter,e=>{const button=e.target.closest?.('.interface-port');if(!button)return;if(focus)focusedPort=button;else hoveredPort=button;refreshPortGlow();});document.addEventListener(leave,e=>{const button=e.target.closest?.('.interface-port');if(!button||button.contains(e.relatedTarget))return;if(focus)focusedPort=null;else hoveredPort=null;refreshPortGlow();});}
 function interfacePanel(d){
  return '<div class="small-heading inspector-section-heading">Interfaces</div><p class="hint">Click a port to configure it. Right-click to enable or disable.</p><div class="interface-chassis"><div class="interface-ports">'+d.ports.map(p=>{
   const link=net.links.find(l=>(l.a===d.id&&l.ap===p.id)||(l.b===d.id&&l.bp===p.id));
   const peer=link?net.device(link.a===d.id?link.b:link.a).name:'Not connected';
   const state=link?'In use':p.enabled?'Available':'Disabled';
   const active=Boolean(link&&link.enabled&&p.enabled&&net.device(link.a===d.id?link.b:link.a).ports.find(q=>q.id===(link.a===d.id?link.bp:link.ap)).enabled);
   const description=p.name+' - '+state+' - '+(p.enabled?'Enabled':'Disabled')+' - '+peer;
   return '<button type="button" class="interface-port '+(p.enabled?'enabled':'disabled')+(active?' link-up':'')+'" data-device-port="'+esc(d.id+':'+p.id)+'" data-port="'+esc(p.id)+'" aria-pressed="'+p.enabled+'" aria-label="'+esc(description)+'" title="'+esc(description)+'"><span class="port-name">'+esc(p.name)+'</span><svg viewBox="0 0 44 32" aria-hidden="true"><path class="socket" d="M5 3h34v20H28v6H16v-6H5z"/><path class="contacts" d="M12 6v7m5-7v7m5-7v7m5-7v7m5-7v7"/><path class="socket-edge" d="M9 19h7v5h12v-5h7"/></svg><span class="port-led" aria-hidden="true"></span><span class="port-state">'+state+'</span>'+(d.type==='switch'?'<span class="vlan-badge" style="--vlan-color:'+esc(d.vlans.find(v=>v.id===p.accessVlan)?.color)+'">'+esc(vlanLabel(d,p.accessVlan))+'</span>':'')+'</button>';
  }).join('')+'</div></div>';
 }
 function vlanPanel(d){return '<div class="small-heading vlan-heading inspector-section-heading"><span>'+(isPan()?'VLAN objects':'VLANs')+'</span><button id="show-add-vlan" class="vlan-icon-button" type="button" aria-label="Add VLAN" title="Add VLAN" aria-expanded="false" aria-controls="add-vlan-form"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div><div class="vlan-list">'+d.vlans.slice().sort((a,b)=>a.id-b.id).map(v=>'<div class="vlan-row"><span draggable="true" data-drag-vlan="'+v.id+'" title="Drag '+esc(vlanLabel(d,v.id))+' onto a port" class="vlan-badge" style="--vlan-color:'+esc(v.color)+'">'+esc(vlanLabel(d,v.id))+'</span><input data-vlan-name="'+v.id+'" value="'+esc(v.name)+'" maxlength="40" aria-label="VLAN '+v.id+' name"><input type="color" data-vlan-color="'+v.id+'" value="'+esc(v.color)+'" aria-label="VLAN '+v.id+' color"></div>').join('')+'</div><form id="add-vlan-form" class="vlan-add" hidden><input id="new-vlan-id" type="number" min="2" max="4094" placeholder="ID" aria-label="New VLAN ID" required><input id="new-vlan-name" placeholder="Name" maxlength="40" aria-label="New VLAN name"><button class="vlan-icon-button" type="submit" aria-label="Save VLAN" title="Save VLAN"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l4 4v14H3V3h2ZM7 3v6h10V3M7 21v-8h10v8"/></svg></button><button id="cancel-add-vlan" class="vlan-icon-button" type="button" aria-label="Cancel new VLAN" title="Cancel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></form>';}
 function bindVlanDrag(d){
  const ports=[...$('inspector').querySelectorAll('.interface-port')];
  $('inspector').querySelectorAll('[data-drag-vlan]').forEach(pill=>{
   pill.draggable=false;
   let gesture=null;
   const cleanup=()=>{if(!gesture)return;gesture.ghost?.remove();ports.forEach(p=>{p.classList.remove('vlan-drop-target');p.style.removeProperty('--drop-color');});$('inspector').classList.remove('vlan-dragging');gesture=null;refreshPortGlow();document.removeEventListener('keydown',cancelKey);};
   const cancelKey=e=>{if(e.key==='Escape')cleanup();};
   pill.onpointerdown=e=>{if(e.button!==0)return;if(net.queue.length||staged){say('Finish the exchange or clear learned state before changing the network.');return;}e.preventDefault();const vlan=d.vlans.find(v=>v.id===Number(pill.dataset.dragVlan));gesture={x:e.clientX,y:e.clientY,vlan,target:null,ghost:null};pill.setPointerCapture(e.pointerId);document.addEventListener('keydown',cancelKey);};
   pill.onpointermove=e=>{if(!gesture)return;const g=gesture;if(!g.ghost&&Math.hypot(e.clientX-g.x,e.clientY-g.y)<4)return;e.preventDefault();if(!g.ghost){g.ghost=pill.cloneNode(true);g.ghost.removeAttribute('data-drag-vlan');g.ghost.removeAttribute('title');g.ghost.classList.add('vlan-drag-ghost');g.ghost.setAttribute('aria-hidden','true');document.body.append(g.ghost);$('inspector').classList.add('vlan-dragging');}g.ghost.style.left=(e.clientX+12)+'px';g.ghost.style.top=(e.clientY+12)+'px';const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.interface-port');g.target=ports.includes(target)?target:null;ports.forEach(p=>{p.classList.toggle('vlan-drop-target',p===g.target);p.style.setProperty('--drop-color',g.vlan.color);});const link=g.target&&net.links.find(l=>(l.a===d.id&&l.ap===g.target.dataset.port)||(l.b===d.id&&l.bp===g.target.dataset.port));$('links').querySelectorAll('[data-link]').forEach(el=>el.classList.toggle('port-highlight',el.dataset.link===link?.id));};
   pill.onpointerup=e=>{if(!gesture)return;const {target,vlan}=gesture;cleanup();if(pill.hasPointerCapture(e.pointerId))pill.releasePointerCapture(e.pointerId);if(!target||net.device(d.id)!==d)return;const port=d.ports.find(p=>p.id===target.dataset.port);if(port.accessVlan!==vlan.id)mutate(()=>net.configurePort(d.id,port.id,{accessVlan:vlan.id}));};
   pill.onpointercancel=cleanup;pill.onlostpointercapture=cleanup;
  });
 }
 function bindVlanPanel(d){if(d.type!=='switch')return;bindVlanDrag(d);$('new-vlan-id').hidden=isPan();$('new-vlan-id').required=!isPan();$('new-vlan-name').required=isPan();$('add-vlan-form').classList.toggle('named-vlan-add',isPan());$('show-add-vlan').onclick=()=>{$('add-vlan-form').hidden=false;$('show-add-vlan').setAttribute('aria-expanded','true');$(isPan()?'new-vlan-name':'new-vlan-id').focus();};const cancel=()=>{$('add-vlan-form').reset();$('add-vlan-form').hidden=true;$('show-add-vlan').setAttribute('aria-expanded','false');$('show-add-vlan').focus();};$('cancel-add-vlan').onclick=cancel;$('add-vlan-form').onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();}};$('add-vlan-form').onsubmit=e=>{e.preventDefault();const id=isPan()?NetworkExplorerPlatform.nextId(d):Number($('new-vlan-id').value);if(isPan()&&d.vlans.some(v=>v.name===$('new-vlan-name').value.trim())){say('That VLAN object name already exists.');return;}if(d.vlans.some(v=>v.id===id)){say('That VLAN already exists. Choose a different ID.');$('new-vlan-id').focus();return;}mutate(()=>net.setVlan(d.id,id,$('new-vlan-name').value.trim()||undefined));if($('add-vlan-form').hidden)$('show-add-vlan').focus();};$('inspector').querySelectorAll('[data-vlan-name]').forEach(el=>el.onchange=()=>{if(isPan()&&d.vlans.some(v=>v.id!==Number(el.dataset.vlanName)&&v.name===el.value.trim())){say('That VLAN object name already exists.');inspector();return;}mutate(()=>net.setVlan(d.id,Number(el.dataset.vlanName),el.value));});$('inspector').querySelectorAll('[data-vlan-color]').forEach(el=>el.onchange=()=>mutate(()=>net.setVlan(d.id,Number(el.dataset.vlanColor),undefined,el.value)));}
 const portConfig=document.createElement('dialog');portConfig.id='port-config';document.body.append(portConfig);
 function styleVlanDropdown(d){
  const select=$('port-vlan'),label=select.parentElement,wrap=document.createElement('div');wrap.className='port-vlan-picker';
  const badge=v=>'<span class="vlan-badge" style="--vlan-color:'+esc(v.color)+'">'+esc(isPan()?v.name:'V'+v.id)+'</span>'+(!isPan()?'<span class="vlan-option-name">'+esc(v.name)+'</span>':'');
  const selected=()=>d.vlans.find(v=>v.id===Number(select.value));
  wrap.innerHTML='<span id="port-vlan-label">'+(isPan()?'VLAN object':'Access VLAN')+'</span><button id="port-vlan-toggle" type="button" aria-labelledby="port-vlan-label port-vlan-value" aria-haspopup="listbox" aria-expanded="false" aria-controls="port-vlan-options"><span id="port-vlan-value">'+badge(selected())+'</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div id="port-vlan-options" role="listbox" aria-labelledby="port-vlan-label" hidden>'+d.vlans.slice().sort((a,b)=>a.id-b.id).map(v=>'<button type="button" role="option" tabindex="-1" data-vlan-choice="'+v.id+'" aria-selected="'+(v.id===Number(select.value))+'">'+badge(v)+'<svg class="vlan-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></button>').join('')+'</div>';
  label.replaceWith(wrap);select.hidden=true;select.tabIndex=-1;select.setAttribute('aria-hidden','true');wrap.append(select);
  const toggle=$('port-vlan-toggle'),list=$('port-vlan-options'),options=[...list.children];
  const close=(focus=false)=>{list.hidden=true;toggle.setAttribute('aria-expanded','false');if(focus)toggle.focus();};
  const open=()=>{list.hidden=false;toggle.setAttribute('aria-expanded','true');(options.find(o=>o.getAttribute('aria-selected')==='true')||options[0]).focus();};
  toggle.onclick=()=>list.hidden?open():close();
  toggle.onkeydown=e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open();}};
  options.forEach(option=>option.onclick=()=>{select.value=option.dataset.vlanChoice;select.dispatchEvent(new Event('change',{bubbles:true}));if(!toggle.isConnected)return;$('port-vlan-value').innerHTML=badge(selected());options.forEach(o=>o.setAttribute('aria-selected',String(o===option)));close(true);});
  list.onkeydown=e=>{const index=options.indexOf(document.activeElement);let next;if(e.key==='ArrowDown')next=(index+1)%options.length;else if(e.key==='ArrowUp')next=(index+options.length-1)%options.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=options.length-1;else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);return;}if(next!==undefined){e.preventDefault();options[next].focus();}};
  wrap.addEventListener('focusout',e=>{if(!wrap.contains(e.relatedTarget))close();});
  portConfig.onpointerdown=e=>{if(!wrap.contains(e.target))close();};
 }
 function openPortConfig(deviceId,portId){const d=net.device(deviceId),p=d.ports.find(p=>p.id===portId);const l=net.links.find(l=>(l.a===d.id&&l.ap===p.id)||(l.b===d.id&&l.bp===p.id));const peer=l?net.device(l.a===d.id?l.b:l.a):null;const peerPort=peer?.ports.find(p=>p.id===(l.a===d.id?l.bp:l.ap));portConfig.innerHTML='<div class="port-config-header"><h2>'+esc(d.name)+' / '+esc(p.name)+'</h2><label class="examine-watch-control"><input id="port-admin" type="checkbox" role="switch" '+(p.enabled?'checked':'')+'><span class="watch-switch-track" aria-hidden="true"></span><span>Enabled</span></label></div><p>Connected to: '+esc(peer?peer.name+' / '+peerPort.name:'Not connected')+'</p>'+(d.type==='switch'?'<p>'+(isPan()?'Interface type: <strong>Layer 2</strong>':'Mode: <strong>Access</strong>')+'</p><label>Access VLAN<select id="port-vlan">'+d.vlans.map(v=>'<option value="'+v.id+'" '+(v.id===p.accessVlan?'selected':'')+'>'+esc(v.id+' - '+v.name)+'</option>').join('')+'</select></label><p class="hint">Access ports carry untagged frames.</p>':d.type==='router'?'<div class="pair router-address"><label>IPv4 address<input id="router-ip" value="'+esc(p.ip)+'" placeholder="Not configured"></label><label>Prefix<input id="router-prefix" type="number" min="1" max="30" value="'+esc(p.prefix??24)+'"></label></div><p class="hint">Each router interface connects to a different subnet.</p>':'')+'<footer><button id="close-port-config">Close</button></footer>';$('close-port-config').onclick=()=>portConfig.close();$('port-admin').onchange=()=>{if(!editable()){openPortConfig(deviceId,portId);return;}mutate(()=>net.configurePort(deviceId,portId,{enabled:$('port-admin').checked}));};if(d.type==='switch')$('port-vlan').onchange=()=>{if(!editable()){openPortConfig(deviceId,portId);return;}mutate(()=>net.configurePort(deviceId,portId,{accessVlan:Number($('port-vlan').value)}));};if(d.type==='router'){const save=()=>{if(!editable())return;safely(()=>{net.configureInterface(d.id,p.id,$('router-ip').value.trim(),Number($('router-prefix').value));render();});};$('router-ip').onchange=save;$('router-prefix').onchange=save;}if(d.type==='switch')styleVlanDropdown(d);if(!portConfig.open)portConfig.showModal();}
 const portMenu=document.createElement('div');portMenu.className='port-context-menu';portMenu.hidden=true;document.body.append(portMenu);
 function openPortMenu(deviceId,portId,e){const p=net.device(deviceId).ports.find(p=>p.id===portId);portMenu.innerHTML='<button type="button">'+(p.enabled?'Disable':'Enable')+' '+esc(p.name)+'</button>';portMenu.hidden=false;portMenu.style.left=Math.min(e.clientX,window.innerWidth-160)+'px';portMenu.style.top=Math.min(e.clientY,window.innerHeight-60)+'px';portMenu.firstElementChild.onclick=()=>{portMenu.hidden=true;mutate(()=>net.configurePort(deviceId,portId,{enabled:!p.enabled}));};portMenu.firstElementChild.focus();}
 document.addEventListener('pointerdown',e=>{if(!portMenu.contains(e.target))portMenu.hidden=true;});portMenu.onkeydown=e=>{if(e.key==='Escape')portMenu.hidden=true;};
 function inspector(){const d=net.device(selected),l=net.links.find(l=>l.id===selected);$('inspector-title').innerHTML=d?'<svg class="inspector-device-icon" viewBox="-42 -35 84 72" aria-hidden="true">'+icon(d)+'</svg><span>'+esc(d.type==='host'?'Host':d.type==='router'?'Router':(isPan()?'Layer 2 switch (PAN-OS)':'Ethernet switch'))+'</span>':(l?'Ethernet connection':'Inspector');$('watch').hidden=!d;$('watch').setAttribute('aria-pressed',String(Boolean(d?.watch)));const watchLabel=d?.watch?'Stop watching this device':'Watch this device';$('watch').setAttribute('aria-label',watchLabel);$('watch').title=watchLabel;$('prompt').textContent=d?cliPrompt(d):'Select a device';$('terminal-title').textContent=d?d.name+' - '+(d.type==='host'?'Host':d.type==='router'?'Router':(isPan()?'PAN-OS Layer 2':'Cisco IOS Layer 2')):'Terminal';
  if(d){$('inspector').innerHTML='<label>Name<input id="device-name" maxlength="40" value="'+esc(d.name)+'"></label>'+(d.type==='host'?'<label>Operating system<select id="host-os">'+['windows','linux','macos'].map(os=>'<option value="'+os+'" '+((d.os||'windows')===os?'selected':'')+'>'+({windows:'Windows',linux:'Linux',macos:'macOS'}[os])+'</option>').join('')+'</select></label><div class="pair"><div class="address-field"><div class="address-heading"><label for="host-ip">IPv4 address</label><a class="cidr-tool-link" href="../viewer.html?tool=cs339/cidr_viz.html&amp;course=CS339&amp;label=Computer%20Networks&amp;name=CIDR%20Teaching%20Tool&amp;back=cs339/index.html" target="_blank" rel="noopener" title="Open CIDR Teaching Tool in a new tab" aria-label="Open CIDR Teaching Tool in a new tab"><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 2h5v5M14 2 7 9M6 3H2v11h11v-4"/></svg></a></div><input id="host-ip" value="'+esc(d.ip)+'" placeholder="Not configured"></div><div class="prefix-field"><div class="prefix-heading"><label for="host-prefix">Prefix</label></div><input id="host-prefix" type="number" min="1" max="30" value="'+esc(d.prefix)+'"></div></div><label>Default gateway<input id="host-gateway" value="'+esc(d.gateway||'')+'" placeholder="Optional for this subnet"></label>':d.type==='router'?'<p class="hint">Click an interface to set its IPv4 address and prefix. Connected routes are added automatically.</p>':'<p class="hint">This Layer 2 switch forwards by MAC address. It does not need an IP address.</p>')+interfacePanel(d)+(d.type==='switch'?vlanPanel(d):d.type==='router'?routePanel(d):'')+(d.type==='host'?'<p class="hint">MAC '+esc(d.ports[0].mac)+'</p>':'')+'<div class="small-heading inspector-section-heading">'+(d.type==='switch'?'MAC forwarding table':'ARP cache')+' <button id="float-table" class="section-expand" type="button" title="Expand table" aria-label="Expand table"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7M21 3l-7 7M10 21H3v-7M3 21l7-7"/></svg></button></div><div id="inspector-table">'+table(visibleTable(d.type==='switch'?net.mac[d.id]:net.arp[d.id],d),d.type)+'</div>'+'<button class="danger" id="delete">Delete device</button>';
   $('float-table').onclick=()=>{floatingDevice=d.id;refreshFloatingTable();if(openExternal('table',d.name+' - Network Explorer',()=>'<h2>'+esc($('table-drag').textContent)+'</h2>'+$('floating-table-content').innerHTML,()=>{$('dock-table').click();}))floatingTable.hidden=true;};
   $('device-name').onchange=e=>mutate(()=>{d.name=e.target.value.trim()||d.name;});$('watch').onclick=()=>{const current=net.device(selected);if(!current)return;current.watch=!current.watch;render();};if(d.type==='host'){
    $('host-gateway').onchange=e=>{if(!editable()){render();return;}safely(()=>{net.configureGateway(d.id,e.target.value.trim());render();});};
    $('host-os').onchange=e=>{if(!editable()){render();return;}d.os=e.target.value;render();};
    const saveAddress=()=>{const address=$('host-ip').value.trim(),prefixText=$('host-prefix').value;if(!address||!prefixText)return;const prefix=Number(prefixText);if(address===d.ip&&prefix===d.prefix)return;if(!editable())return;safely(()=>{net.configure(d.id,address,prefix);examined=false;draw();$('inspector-table').innerHTML=table(visibleTable(net.arp[d.id],d),d.type);refreshFloatingTable();NetworkExplorerCapture.render(net);syncExternal();});};
    for(const id of ['host-ip','host-prefix']){$(id).onchange=saveAddress;$(id).onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();saveAddress();}};}
   }bindVlanPanel(d);$('inspector').querySelectorAll('[data-port]').forEach(el=>{el.onclick=()=>openPortConfig(d.id,el.dataset.port);el.oncontextmenu=e=>{e.preventDefault();openPortMenu(d.id,el.dataset.port,e);};});$('delete').onclick=()=>mutate(()=>{net.remove(d.id);selected=null;});
  }else if(l){const a=net.device(l.a),b=net.device(l.b);$('inspector').innerHTML='<strong>Ethernet connection</strong><p>'+esc(a.name)+' / '+esc(a.ports.find(p=>p.id===l.ap).name)+' ↔ '+esc(b.name)+' / '+esc(b.ports.find(p=>p.id===l.bp).name)+'</p><label><input id="link-enabled" type="checkbox" '+(l.enabled?'checked':'')+'> Cable enabled</label><button id="delete" class="danger">Delete connection</button>';$('link-enabled').onchange=e=>mutate(()=>l.enabled=e.target.checked);$('delete').onclick=()=>mutate(()=>{net.remove(l.id);selected=null;});}else $('inspector').innerHTML='<p>Select a device or cable to inspect and configure it.</p>';
 }
 const externalPanels=new Map();
 function openExternal(key,title,content,onDock){
  const existing=externalPanels.get(key);if(existing&&!existing.window.closed){existing.window.focus();return true;}
  const popup=window.open('about:blank','network-explorer-'+key,'popup=yes,width='+(key==='events'?1120:key==='examine'?1100:430)+',height=650,resizable=yes,scrollbars=yes');
  if(!popup){say('The browser blocked the external window. Allow pop-ups to open it separately.');return false;}
  const doc=popup.document;doc.title=title;
  const css=doc.createElement('link');css.rel='stylesheet';css.href=new URL('../assets/css/pages/network-explorer.css',location.href).href;doc.head.append(css);
  const style=doc.createElement('style');style.textContent='body{padding:16px;max-width:none}#external-content section{border:0}button{cursor:pointer}';doc.head.append(style);
  doc.body.classList.add('external-panel-page');doc.body.dataset.panel=key;
  const header=doc.createElement('header');header.className='external-panel-header';
  const heading=doc.createElement('div');heading.className='external-panel-heading';
  heading.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="2" width="8" height="6" rx="1.5"/><path d="M12 8v5M5 17v-4h14v4"/><rect x="1" y="17" width="8" height="5" rx="1.5"/><rect x="15" y="17" width="8" height="5" rx="1.5"/></svg><div><div class="external-eyebrow">NETWORK EXPLORER</div><h1>'+esc(key==='lesson'?'Build your first LAN':title.replace(' - Network Explorer',''))+'</h1><p>'+esc(key==='lesson'?'Build, configure, and explore your first Ethernet network.':'Live view connected to your network canvas.')+'</p></div>';
  header.append(heading);doc.body.append(header);
  const dock=doc.createElement('button');dock.textContent='Dock';dock.onclick=()=>{externalPanels.delete(key);popup.close();onDock();};header.append(dock);
  const host=doc.createElement('div');host.id='external-content';doc.body.append(host);
  const entry={window:popup,host,content,onDock};externalPanels.set(key,entry);
  host.addEventListener('click',e=>{const row=e.target.closest('[data-capture-id]');if(row){$('events').querySelector('[data-capture-id="'+row.dataset.captureId+'"]')?.click();return;}const control=e.target.closest('button');if(control?.id)$(control.id)?.click();});
  host.addEventListener('keydown',e=>{if(e.target.closest('[data-capture-id]')&&['Enter',' '].includes(e.key)){e.preventDefault();e.target.click();return;}if(e.target.id==='command'&&e.key==='Tab'&&!e.shiftKey){if(completeCommand(e.target))e.preventDefault();return;}if(e.target.id==='command'&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();recallCommand(e.key);e.target.value=$('command').value;}});
  host.addEventListener('input',e=>{const original=$(e.target.id);if(original)original.value=e.target.value;});
  host.addEventListener('submit',e=>{e.preventDefault();const form=$(e.target.id);if(form)form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  host.addEventListener('change',e=>{const original=$(e.target.id);if(original){original.checked=e.target.checked;original.value=e.target.value;original.dispatchEvent(new Event('change',{bubbles:true}));}});
  host.addEventListener('pointerover',e=>highlightTableDevice(e.target.closest('[data-table-mac]')));
  host.addEventListener('pointerout',()=>highlightTableDevice(null));
  host.addEventListener('focusin',e=>highlightTableDevice(e.target.closest('[data-table-mac]')));
  host.addEventListener('focusout',()=>highlightTableDevice(null));
  popup.addEventListener('pagehide',()=>{if(externalPanels.get(key)===entry){externalPanels.delete(key);onDock();}});
  syncExternal();NetworkExplorerTooltips.install(popup);return true;
 }
 function syncExternal(){for(const [key,entry] of externalPanels){if(entry.window.closed){externalPanels.delete(key);entry.onDock();continue;}const html=entry.content();if(entry.host.innerHTML!==html){const focused=entry.window.document.activeElement;const focusId=focused?.id;const start=focused?.selectionStart,end=focused?.selectionEnd;entry.host.innerHTML=html;const next=focusId?entry.window.document.getElementById(focusId):null;if(next){next.focus();if(start!=null&&next.setSelectionRange)next.setSelectionRange(start,end);}const terminal=entry.host.querySelector('#terminal');if(terminal)terminal.scrollTop=terminal.scrollHeight;}}}
 window.addEventListener('pagehide',()=>{for(const entry of externalPanels.values())entry.window.close();});
 let floatingDevice=null;
 const floatingTable=document.createElement('section');
 floatingTable.id='floating-table';floatingTable.hidden=true;floatingTable.setAttribute('aria-label','Floating device table');
 floatingTable.innerHTML='<div class="floating-table-header"><button id="table-drag" title="Drag to move; arrow keys also move this panel"></button><button id="dock-table">Dock</button></div><div id="floating-table-content"></div>';
 document.body.append(floatingTable);
 function refreshFloatingTable(){
  const d=net.device(floatingDevice);
  if(!d){floatingDevice=null;floatingTable.hidden=true;return;}
  floatingTable.hidden=externalPanels.has('table');
  $('table-drag').textContent=d.name+' / '+(d.type==='switch'?'MAC forwarding table':'ARP cache');
  $('floating-table-content').innerHTML=table(visibleTable(d.type==='switch'?net.mac[d.id]:net.arp[d.id],d),d.type);
  if(selected===d.id&&$('inspector-table')){$('inspector-table').innerHTML='<p class="hint">Table is in the floating panel.</p>';$('float-table').hidden=true;}
 }
 $('dock-table').onclick=()=>{floatingDevice=null;floatingTable.hidden=true;highlightTableDevice(null);inspector();$('float-table')?.focus();};
 let tableDrag=null;
 function positionTable(x,y){floatingTable.style.left=Math.max(0,Math.min(x,window.innerWidth-floatingTable.offsetWidth))+'px';floatingTable.style.top=Math.max(0,Math.min(y,window.innerHeight-50))+'px';floatingTable.style.right='auto';}
 $('table-drag').onpointerdown=e=>{if(e.button!==0)return;const r=floatingTable.getBoundingClientRect();tableDrag={x:e.clientX-r.left,y:e.clientY-r.top};e.currentTarget.setPointerCapture(e.pointerId);};
 $('table-drag').onpointermove=e=>{if(tableDrag)positionTable(e.clientX-tableDrag.x,e.clientY-tableDrag.y);};
 $('table-drag').onpointerup=$('table-drag').onpointercancel=()=>tableDrag=null;
 $('table-drag').onkeydown=e=>{const delta={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[e.key];if(delta){e.preventDefault();const r=floatingTable.getBoundingClientRect();positionTable(r.left+delta[0],r.top+delta[1]);}};
 function highlightTableDevice(row){
  const mac=row?.dataset.tableMac;
  const device=mac?net.devices.find(d=>d.ports.some(p=>p.mac===mac)):null;
  $('devices').querySelectorAll('[data-device]').forEach(node=>node.classList.toggle('table-highlight',node.dataset.device===device?.id));
 }
 for(const event of ['pointerover','focusin'])document.addEventListener(event,e=>highlightTableDevice(e.target.closest('[data-table-mac]')));
 for(const event of ['pointerout','focusout'])$('inspector').addEventListener(event,e=>highlightTableDevice(e.relatedTarget?.closest?.('[data-table-mac]')));
 function watchList(){if(!$('watch-list'))return;$('watch-list').innerHTML=net.devices.filter(d=>d.watch).map(d=>'<div class="watch-item">◉ '+esc(d.name)+'</div>').join('')||'<p class="hint">No devices watched yet.</p>';}
 function render(){NetworkExplorerPlatform.normalize(net,platform);refreshPlatform();draw();inspector();refreshFloatingTable();syncExternal();watchList();NetworkExplorerCapture.render(net);$('sim-status').textContent=flightPaused?'Animation paused':staged?(phaseCallback?'Frame in transit':'Paused for examination'):running?'Running':net.queue.length?'Paused · '+net.queue.length+' events queued':'Ready';syncExternal();}
 function openInspector(){if($('right-panel').hidden)$('toggle-right').click();}
 function select(id){if(net.device(id))openInspector();selected=id;if(connecting&&net.device(id)){choosePort(id);return;}render();}
 function choosePort(id){if(!editable())return;selected=id;render();$('connection-hint').textContent='Choose an anchor on this device, then a destination anchor.';}
 function cancelConnect(){pendingCable=null;if(portPicker.open)portPicker.close();connecting=false;endpoint=null;cableGesture=null;$('cable-preview').replaceChildren();$('connect').classList.remove('active');$('cancel-connect').hidden=true;$('connection-hint').textContent='';}
 function flashPorts(report){
  if(!report.link)return;
  const link=net.links.find(l=>l.id===report.link);if(!link)return;
  for(const key of [link.a+':'+link.ap,link.b+':'+link.bp]){
   const port=document.querySelector('[data-device-port="'+key+'"]');
   if(port){port.classList.remove('port-activity');void port.offsetWidth;port.classList.add('port-activity');port.addEventListener('animationend',()=>port.classList.remove('port-activity'),{once:true});}
  }
 }
 function animate(report){$('traffic').replaceChildren();flashPorts(report);if(!report.link)return;const link=net.links.find(l=>l.id===report.link),a=portPosition(net.device(report.from),link.a===report.from?link.ap:link.bp,link.a===report.from?link.aAnchor:link.bAnchor),b=portPosition(net.device(report.device),report.ingress,link.a===report.device?link.aAnchor:link.bAnchor),ns='http://www.w3.org/2000/svg';const circle=document.createElementNS(ns,'circle');circle.setAttribute('r','8');circle.setAttribute('fill',report.frame.type==='ARP'?'#bc770b':'#4d88bd');const motion=document.createElementNS(ns,'animateMotion');motion.setAttribute('path',pathData(cablePath(link),link.a!==report.from));motion.setAttribute('dur',Number($('speed').value)/1000+'s');motion.setAttribute('fill','freeze');circle.append(motion);circle.setAttribute('class','in-flight-frame');circle.setAttribute('tabindex','0');circle.setAttribute('role','button');circle.setAttribute('aria-label','Inspect frame in flight while paused');$('traffic').append(circle);motion.beginElement();}
 function stage(){if(staged)return;const trial=Object.assign(new NetworkExplorer.Network(),JSON.parse(JSON.stringify(net)));const report=trial.next();if(!report){net=trial;stop();render();return;}staged={trial,report};animate(report);$('sim-status').textContent='Frame in transit';schedulePhase(()=>{if(!staged)return;if(net.device(report.device).watch)examine();else commit();},report.link?Number($('speed').value):100);}
 function frameHeaderCard(frame,label,peer){
  const cell=(name,value,key)=>'<div class="frame-field'+(peer&&peer.type===frame.type&&peer[key]!==frame[key]?' frame-field-changed':'')+'"><span>'+esc(name)+'</span><code>'+esc(value)+'</code></div>';
  const ethernet=cell('Destination MAC',frame.dst,'dst')+cell('Source MAC',frame.src,'src')+cell('EtherType',frame.type==='ARP'?'0x0806':'0x0800','type');
  const payload=frame.type==='ARP'?'<div class="packet-fields arp-fields">'+cell('Operation',frame.op,'op')+cell('Sender IP',frame.sip,'sip')+cell('Target IP',frame.tip,'tip')+'</div>':'<div class="packet-fields ip-fields">'+cell('Source IP',frame.sip,'sip')+cell('Destination IP',frame.dip,'dip')+cell('TTL',frame.ttl??64,'ttl')+cell('Protocol','1 (ICMP)','type')+'</div><div class="frame-message">ICMP &middot; '+esc(frame.icmp)+'</div>';
  return '<article class="frame-header-card"><h4>'+esc(label)+'</h4><div class="frame-layer-label">Ethernet II header</div><div class="ethernet-fields">'+ethernet+'</div><div class="frame-payload"><div class="frame-layer-label">'+(frame.type==='ARP'?'ARP message':'IPv4 packet')+'</div>'+payload+'</div></article>';
 }
 function frameComparison(r,d){const outgoing=d.type==='router'?(r.outgoingFrames||[]):[];return '<div class="frame-comparison'+(r.frame&&outgoing.length?' has-outgoing':'')+'">'+(r.frame?frameHeaderCard(r.frame,'Incoming'+(r.ingress?' - '+d.ports.find(p=>p.id===r.ingress).name:''),null):'<div class="evidence">'+esc(r.target?'Destination: '+r.target:'Local event')+'</div>')+outgoing.map(o=>frameHeaderCard(o.frame,'Outgoing - '+d.ports.find(p=>p.id===o.port).name,r.frame)).join('')+'</div>'+(r.frame?'<p class="frame-schematic-note">Selected fields &middot; schematic'+(outgoing.some(o=>o.frame.type===r.frame.type)?' &middot; Highlighted fields changed':'')+'</p>':'');}
 function examine(){const {report:r}=staged,d=net.device(r.device);previousFocus=document.activeElement;$('examine-watch').checked=d.watch;$('examine-watch-status').textContent=d.watch?'On':'Off';$('examine-title').textContent=r.title;$('examine-device').textContent=d.name+(r.ingress?' · arriving on '+d.ports.find(p=>p.id===r.ingress).name:' · originating event');$('examine-body').innerHTML=frameComparison(r,d)+'<h3>Table before this decision</h3>'+table(visibleTable(r.before,d),d.type)+'<div class="decision">'+r.notes.map(n=>'<p>'+esc(n)+'</p>').join('')+'</div><h3>Table after this decision</h3>'+table(visibleTable(r.after,d),d.type,r.clock)+(r.outputs.length?'<p><strong>Send through:</strong> '+r.outputs.map(p=>esc(d.ports.find(q=>q.id===p).name)).join(', ')+'</p>':'');$('sim-status').textContent='Paused at '+d.name;if(externalPanels.has('examine')){syncExternal();externalPanels.get('examine').window.focus();}else{$('examine').showModal();$('continue').focus();}$('sim-status').textContent='Paused at '+d.name;examined=true;}
 function commit(){if(!staged)return;const oldCount=net.results.length;const layout=new Map(net.devices.map(d=>[d.id,{x:d.x,y:d.y,watch:d.watch}]));net=staged.trial;net.age();net.devices.forEach(d=>Object.assign(d,layout.get(d.id)));staged=null;render();for(const r of net.results.slice(oldCount))output(net.device(r.device).name+': '+(r.ok?'Reply from '+r.target:'Ping to '+r.target+' failed.'));if(running&&net.queue.length)schedulePhase(stage,150);else if(!net.queue.length){stop();$('traffic').replaceChildren();render();}}
 function startPing(id,target){if(candidateBase)throw Error('Commit or revert candidate changes before starting traffic.');finishPlacement();cancelConnect();if(staged||net.queue.length)throw Error('Finish or clear the current exchange first.');net.ping(id,target);running=true;stage();}
 const hostProfiles={windows:{address:['ipconfig'],arp:['arp -a'],flush:['arp -d *']},linux:{address:['ip addr','ip address'],arp:['ip neigh','ip neigh show'],flush:['ip neigh flush all','sudo ip neigh flush all']},macos:{address:['ifconfig'],arp:['arp -a'],flush:['arp -d -a','sudo arp -d -a','arp -a -d','sudo arp -a -d']}};
 function hostProfile(d){return hostProfiles[d.os||'windows'];}
 function cliCommands(d){const c=cliContext(d);const base=['help','close','exit'];if(d.type==='router')return base.concat(['show ip route','show ip interface brief','show arp']);if(d.type==='host')return base.concat(['ping'],hostProfile(d).address,hostProfile(d).arp,hostProfile(d).flush);if(isPan())return NetworkExplorerPlatform.commands(c.mode).concat(c.mode==='exec'?['clear mac all']:[]);const show=['show vlan brief','show interfaces','show interfaces switchport','show mac address-table'];return base.concat(show,['end'],c.mode==='exec'?['configure terminal','clear mac address-table dynamic']:c.mode==='config'?['vlan','interface']:c.mode==='vlan'?['name']:['switchport mode access','switchport access vlan','shutdown','no shutdown']);}
 function command(raw){const cmd=raw.trim().toLowerCase(),d=net.device(selected);if(cmd==='close'||(cmd==='exit'&&(!d||cliContext(d).mode==='exec'))){const entry=externalPanels.get('terminal');if(entry){externalPanels.delete('terminal');entry.window.close();terminalNotice.hidden=true;}closeTool();return;}if(!d)throw Error('Select a device on the canvas first.');output(cliPrompt(d)+' '+raw);const c=cliContext(d),parts=raw.trim().split(/\s+/);const change=fn=>{if(!editable())throw Error('Finish the exchange before changing configuration.');fn();examined=false;};if(cmd==='help'){output(cliCommands(d).join('\n'));render();return;}if(d.type==='router'){if(cmd==='show ip route')output(net.routes(d.id).map(r=>'C '+r.network+'/'+r.prefix+' directly connected, '+d.ports.find(p=>p.id===r.port).name).join('\n')||'No connected routes.');else if(cmd==='show ip interface brief')output(d.ports.map(p=>p.name+'  '+(p.ip?p.ip+'/'+p.prefix:'unconfigured')+'  '+(p.enabled?'up':'administratively down')).join('\n'));else if(cmd==='show arp')output(Object.values(net.arp[d.id]||{}).map(r=>r.ip+'  '+r.mac+'  '+d.ports.find(p=>p.id===r.interface)?.name).join('\n')||'ARP cache is empty.');else output('Use the interface inspector to configure this connected-route router. Type help for display commands.');render();return;}const flushCommand=d.type==='host'?'arp -d *':isPan()?'clear mac all':'clear mac address-table dynamic';if(d.type==='host'?hostProfile(d).flush.includes(cmd):cmd===flushCommand){if(c.mode!=='exec'){output('Exit configuration mode before clearing learned entries.');return;}if(staged||net.queue.length){output('Finish the exchange before clearing learned entries.');return;}if(d.type==='host')net.arp[d.id]={};else net.mac[d.id]={};output(d.type==='host'?'ARP cache cleared.':'Dynamic MAC table cleared.');render();return;}if(isPan()&&d.type==='switch'){try{if(cmd==='commit'&&c.mode==='config'){if(commitConfiguration())output('Commit complete.');}else if(cmd==='revert config'&&c.mode==='config'){revertConfiguration();output('Candidate changes reverted.');}else {const source=c.mode==='exec'&&candidateBase?new NetworkExplorer.Network(candidateBase):net;NetworkExplorerPlatform.normalize(source,platform);output(NetworkExplorerPlatform.run(source,d.id,c,raw,fn=>change(()=>configurationChange(fn))));}}catch(e){output(e.message);}render();return;}try{
 if(cmd==='help')output(cliCommands(d).join('\n'));
 else if(cmd==='exit'){c.mode=c.mode==='config'?'exec':'config';}
 else if(d.type==='switch'&&cmd==='end')c.mode='exec';
 else if(d.type==='switch'&&cmd==='configure terminal')c.mode='config';
 else if(d.type==='switch'&&c.mode==='config'&&/^vlan \d+$/.test(cmd)){const id=Number(parts[1]);change(()=>net.setVlan(d.id,id));c.mode='vlan';c.vlan=id;}
 else if(d.type==='switch'&&c.mode==='vlan'&&cmd.startsWith('name '))change(()=>net.setVlan(d.id,c.vlan,parts.slice(1).join(' ')));
 else if(d.type==='switch'&&c.mode==='config'&&cmd.startsWith('interface ')){const p=d.ports.find(p=>p.name.toLowerCase()===parts[1].toLowerCase());if(!p)throw Error('Use interface P1 through P8.');c.port=p.id;c.mode='interface';}
 else if(d.type==='switch'&&c.mode==='interface'&&cmd==='switchport mode access')change(()=>net.configurePort(d.id,c.port,{mode:'access'}));
 else if(d.type==='switch'&&c.mode==='interface'&&/^switchport access vlan \d+$/.test(cmd))change(()=>net.configurePort(d.id,c.port,{accessVlan:Number(parts[3])}));
 else if(d.type==='switch'&&c.mode==='interface'&&['shutdown','no shutdown'].includes(cmd))change(()=>net.configurePort(d.id,c.port,{enabled:cmd==='no shutdown'}));
 else if(d.type==='switch'&&cmd==='show vlan brief')output('VLAN  Name  Ports\n'+d.vlans.map(v=>v.id+'  '+v.name+'  '+d.ports.filter(p=>p.accessVlan===v.id).map(p=>p.name).join(', ')).join('\n'));
 else if(d.type==='switch'&&cmd==='show interfaces switchport')output(d.ports.map(p=>p.name+'  access  VLAN '+p.accessVlan+'  '+(p.enabled?'enabled':'disabled')).join('\n'));
 else if(d.type==='switch'&&/^show mac address-table(?: vlan \d+)?$/.test(cmd)){const rows=Object.entries(net.mac[d.id]||{}).filter(([key,r])=>!parts[4]||(r.vlan||1)===Number(parts[4]));output(rows.length?'VLAN  MAC address  Port\n'+rows.map(([key,r])=>(r.vlan||1)+'  '+(r.mac||key)+'  '+d.ports.find(p=>p.id===r.port).name).join('\n'):'MAC table is empty.');}
 else if(cmd.startsWith('ping ')&&d.type==='host')startPing(d.id,parts[1]);
 else if(d.type==='host'&&hostProfile(d).address.includes(cmd))output('eth0  '+(d.ip?d.ip+'/'+d.prefix:'unconfigured')+'\nMAC '+d.ports[0].mac+'\nDefault gateway '+(d.gateway||'not configured'));
 else if(d.type==='host'&&hostProfile(d).arp.includes(cmd))output(Object.entries(net.arp[d.id]||{}).map(([ip,r])=>ip+'  '+r.mac).join('\n')||'ARP cache is empty.');
 else if(cmd==='show interfaces'&&d.type==='switch')output(d.ports.map(p=>p.name+'  '+(p.enabled?'enabled':'disabled')+'  '+(occupied(d.id,p.id)?'cabled':'no cable')).join('\n'));
 else output('Unsupported command in this mode. Type help.');
 }catch(e){output(e.message);}render();}

 let placing=null;
 function finishPlacement(){placing=null;$('canvas').classList.remove('placing');cancelConnect();}
 function movePlacement(e){const bounds=$('canvas').getBoundingClientRect();if(e.clientX<bounds.left||e.clientX>bounds.right||e.clientY<bounds.top||e.clientY>bounds.bottom)return;const d=net.device(placing);if(!d){finishPlacement();return;}const p=point(e);d.x=Math.max(55,Math.min(845,p.x));d.y=Math.max(55,Math.min(470,p.y));draw();}
 function addFromPalette(type){mutate(()=>{
  finishPlacement();drag=null;
  const view=$('canvas').viewBox.baseVal;
  const d=net.add(type,Math.max(55,Math.min(845,view.x+55)),Math.max(55,Math.min(470,view.y+55)));
  selected=d.id;placing=d.id;$('canvas').classList.add('placing');
  $('connection-hint').textContent='Move onto the canvas, then click to place. Escape finishes here.';
 });}
 $('add-host').onclick=()=>addFromPalette('host');$('add-switch').onclick=()=>addFromPalette('switch');$('add-router').onclick=()=>addFromPalette('router');
 $('connect').onclick=()=>{if(!editable())return;connecting=!connecting;endpoint=null;if(!connecting)cancelConnect();else{$('connect').classList.add('active');$('cancel-connect').hidden=false;$('connection-hint').textContent='Select the first device';}};$('cancel-connect').onclick=cancelConnect;
 const svg=$('canvas');function point(e){const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());}
 svg.addEventListener('pointermove',e=>{
  const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-device],[data-anchor-device]');
  revealAnchors(target?.dataset.device||target?.dataset.anchorDevice||null);
 });
 svg.addEventListener('pointerleave',()=>revealAnchors(null));
 svg.addEventListener('focusin',e=>{const target=e.target.closest('[data-device],[data-anchor-device]');revealAnchors(target?.dataset.device||target?.dataset.anchorDevice||null);});
 svg.addEventListener('focusout',e=>{if(!svg.contains(e.relatedTarget))revealAnchors(null);});
 svg.addEventListener('pointerdown',e=>{if(e.target.closest('[data-watch-device]')){e.preventDefault();e.stopImmediatePropagation();}},true);
 function disableCanvasWatch(e){const eye=e.target.closest('[data-watch-device]');if(!eye)return;const id=eye.dataset.watchDevice,d=net.device(id);if(!d)return;e.preventDefault();e.stopImmediatePropagation();d.watch=false;render();if(e.type==='keydown')svg.querySelector('[data-device="'+id+'"]')?.focus();}
 svg.addEventListener('click',disableCanvasWatch,true);
 // Track clicks across SVG replacement during selection and pointer capture.
 let devicePress=null,lastDeviceClick=null;
 svg.addEventListener('pointerdown',e=>{devicePress=null;if(e.button!==0||placing||connecting||endpoint||e.target.closest('[data-watch-device],[data-anchor-device]')){lastDeviceClick=null;return;}const node=e.target.closest('[data-device]');if(node)devicePress={id:node.dataset.device,x:e.clientX,y:e.clientY};else lastDeviceClick=null;},true);
 svg.addEventListener('pointerup',e=>{const press=devicePress;devicePress=null;if(!press)return;if(Math.hypot(e.clientX-press.x,e.clientY-press.y)>5){lastDeviceClick=null;return;}const now=performance.now();if(lastDeviceClick&&lastDeviceClick.id===press.id&&now-lastDeviceClick.time<450&&Math.hypot(e.clientX-lastDeviceClick.x,e.clientY-lastDeviceClick.y)<5){lastDeviceClick=null;const d=net.device(press.id);if(d){d.watch=!d.watch;render();}}else lastDeviceClick={...press,time:now};},true);
 svg.addEventListener('pointercancel',()=>{devicePress=null;lastDeviceClick=null;},true);
 svg.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')disableCanvasWatch(e);},true);
 svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;if(placing){e.preventDefault();movePlacement(e);finishPlacement();render();return;}const anchor=e.target.closest('[data-anchor-device]');if(anchor){e.preventDefault();if(!endpoint)pickAnchor(anchor);cableGesture={x:e.clientX,y:e.clientY};svg.setPointerCapture(e.pointerId);return;}const node=e.target.closest('[data-device]');if(!node)return;const d=net.device(node.dataset.device);openInspector();if(connecting){select(d.id);return;}if(staged){selected=d.id;render();return;}const p=point(e);drag={id:d.id,dx:p.x-d.x,dy:p.y-d.y};selected=d.id;svg.setPointerCapture(e.pointerId);render();});svg.addEventListener('pointermove',e=>{if(placing){movePlacement(e);return;}if(endpoint){previewCable(point(e));return;}if(!drag)return;const d=net.device(drag.id),p=point(e);d.x=Math.max(55,Math.min(845,p.x-drag.dx));d.y=Math.max(55,Math.min(470,p.y-drag.dy));draw();});svg.addEventListener('pointerup',e=>{
  drag=null;if(!cableGesture||!endpoint)return;
  const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-anchor-device]');
  const moved=Math.hypot(e.clientX-cableGesture.x,e.clientY-cableGesture.y)>4;
  if(target&&(target.dataset.anchorDevice!==endpoint.device||target.dataset.anchorPort!==endpoint.port))pickAnchor(target);
  else if(moved)cancelConnect();
  cableGesture=null;
 });svg.addEventListener('pointercancel',()=>{drag=null;cancelConnect();});svg.addEventListener('click',e=>{const wire=e.target.closest('[data-link]');if(wire)select(wire.dataset.link);});svg.addEventListener('keydown',e=>{const anchor=e.target.closest('[data-anchor-device]');if(anchor&&(e.key==='Enter'||e.key===' ')){e.preventDefault();pickAnchor(anchor);return;}const node=e.target.closest('[data-device]'),wire=e.target.closest('[data-link]');if(e.key==='Enter'||e.key===' '){e.preventDefault();if(node)select(node.dataset.device);if(wire)select(wire.dataset.link);}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){finishPlacement();cancelConnect();}});
 function arrangeNetwork(){
  finishPlacement();drag=null;
  if(!net.devices.length){say('Add devices to arrange the network.');return;}
  const remaining=new Set(net.devices.map(d=>d.id)),levels=[];
  // Lay out each connected component from its most connected network device.
  while(remaining.size){
   const degree=id=>net.links.filter(l=>l.a===id||l.b===id).length;
   const root=net.devices.filter(d=>remaining.has(d.id)).sort((a,b)=>(b.type!=='host')-(a.type!=='host')||degree(b.id)-degree(a.id))[0];
   const queue=[{id:root.id,depth:0}];remaining.delete(root.id);
   for(let i=0;i<queue.length;i++){
    const item=queue[i];(levels[item.depth]||=[]).push(net.device(item.id));
    for(const l of net.links){const peer=l.a===item.id?l.b:l.b===item.id?l.a:null;if(peer&&remaining.has(peer)){remaining.delete(peer);queue.push({id:peer,depth:item.depth+1});}}
   }
  }
  // Split wide layers to keep labels and device icons apart.
  const rows=levels.flatMap(layer=>Array.from({length:Math.ceil(layer.length/6)},(_,i)=>layer.slice(i*6,i*6+6)));
  rows.forEach((row,r)=>row.forEach((d,c)=>{d.x=900*(c+1)/(row.length+1);d.y=rows.length===1?260:90+r*350/(rows.length-1);}));
  // Recompute visual anchors for the new layout; physical Ethernet ports stay assigned.
  net.links.forEach(link=>{delete link.aAnchor;delete link.bAnchor;cablePath(link);});
  $('zoom-reset').click();render();say('Network arranged. Drag any device to fine-tune its position.');
 }
 $('arrange-network').onclick=arrangeNetwork;
 const compactPalette=document.createElement('aside');compactPalette.id='compact-palette';compactPalette.hidden=true;compactPalette.setAttribute('aria-label','Device palette');
 compactPalette.innerHTML=['host','switch','router'].map(type=>'<button type="button" class="compact-device" data-add-type="'+type+'" aria-label="Add '+type+'"><svg viewBox="-42 -35 84 72" aria-hidden="true">'+icon({type})+'</svg><span role="tooltip">Add '+type+'</span></button>').join('');
 $('left-panel').after(compactPalette);
 compactPalette.querySelectorAll('[data-add-type]').forEach(button=>button.onclick=()=>addFromPalette(button.dataset.addType));
 for(const side of ['left','right']){
  $('toggle-'+side).onclick=()=>{
   const panel=$(side+'-panel'),button=$('toggle-'+side);
   panel.hidden=!panel.hidden;if(side==='left')compactPalette.hidden=panel.hidden===false;
   document.querySelector('main').classList.toggle(side+'-collapsed',panel.hidden);
   button.setAttribute('aria-expanded',String(!panel.hidden));
   const label=(panel.hidden?'Show':'Collapse')+' '+side+' panel';
   button.setAttribute('aria-label',label);button.title=label;
  };
 }
 const examplesMenu=document.createElement('div');examplesMenu.className='examples-menu';
 examplesMenu.innerHTML='<button id="toggle-examples" type="button" aria-expanded="false" aria-controls="examples-dropdown"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="2" width="8" height="6" rx="1.5"/><path d="M12 8v5M5 17v-4h14v4"/><rect x="1" y="17" width="8" height="5" rx="1.5"/><rect x="15" y="17" width="8" height="5" rx="1.5"/></svg>Examples <span aria-hidden="true">&#9662;</span></button><div id="examples-dropdown" hidden><button id="example" type="button"><strong>Simple LAN</strong><span>Two configured hosts and an Ethernet switch.</span></button><button id="example-vlans" type="button"><strong>Two VLANs</strong><span>Four hosts on two separate broadcast domains.</span></button><button id="example-routed" type="button"><strong>Two subnets</strong><span>Two LANs joined by a router and default gateways.</span></button></div>';
 $('load').closest('label').after(examplesMenu);
 function closeExamples(){ $('examples-dropdown').hidden=true;$('toggle-examples').setAttribute('aria-expanded','false'); }
 $('toggle-examples').onclick=()=>{const open=$('examples-dropdown').hidden;$('examples-dropdown').hidden=!open;$('toggle-examples').setAttribute('aria-expanded',String(open));if(open)$('example').focus();};
 document.addEventListener('pointerdown',e=>{if(!examplesMenu.contains(e.target))closeExamples();});
 examplesMenu.addEventListener('keydown',e=>{if(e.key==='Escape'){closeExamples();$('toggle-examples').focus();}});
 const terminalPanel=$('terminal-panel');
 const terminalNotice=document.createElement('section');terminalNotice.hidden=true;terminalNotice.innerHTML='<p>Terminal is in the external window.</p><button id="dock-terminal">Dock</button>';terminalPanel.after(terminalNotice);
 function dockTerminal(){const entry=externalPanels.get('terminal');externalPanels.delete('terminal');if(entry&&!entry.window.closed)entry.window.close();terminalPanel.hidden=false;terminalNotice.hidden=true;openTool('terminal',true);$('float-terminal').focus();}
 $('dock-terminal').onclick=dockTerminal;
 $('float-terminal').onclick=()=>{
  if(openExternal('terminal','Terminal - Network Explorer',()=>{
   const clone=terminalPanel.cloneNode(true);clone.querySelector('#float-terminal').remove();clone.querySelector('.close-tool')?.remove();
   clone.querySelector('#command').setAttribute('value',$('command').value);
   return '<section id="terminal-panel">'+clone.innerHTML+'</section>';
  },dockTerminal)){terminalPanel.hidden=true;terminalNotice.hidden=false;}
 };
 $('continue').onclick=()=>{$('examine').close();commit();previousFocus?.focus();};$('examine-watch').onchange=()=>{if(!staged)return;const d=net.device(staged.report.device);d.watch=$('examine-watch').checked;$('examine-watch-status').textContent=d.watch?'On':'Off';draw();inspector();syncExternal();};$('examine').addEventListener('cancel',e=>e.preventDefault());
 $('clear-state').onclick=()=>{discard();net.reset();examined=false;render();output('Learned state and pending traffic cleared. Configuration retained.');};$('new').onclick=()=>{if(net.devices.length&&!confirm('Clear this network? Save first if you want to keep it.'))return;discard();candidateBase=null;net=new NetworkExplorer.Network();selected=null;examined=false;cancelConnect();render();};
 $('example-routed').onclick=()=>{closeExamples();if(net.devices.length&&!confirm('Replace this network with the two-subnet example?'))return;discard();candidateBase=null;net=new NetworkExplorer.Network();const a=net.add('host',120,320),left=net.add('switch',290,200),r=net.add('router',450,320),right=net.add('switch',610,200),b=net.add('host',780,320);net.configure(a.id,'192.168.1.10',24);net.configure(b.id,'192.168.2.20',24);net.configureInterface(r.id,'p0','192.168.1.1',24);net.configureInterface(r.id,'p1','192.168.2.1',24);net.configureGateway(a.id,'192.168.1.1');net.configureGateway(b.id,'192.168.2.1');net.connect(a.id,'p0',left.id,'p0');net.connect(left.id,'p1',r.id,'p0');net.connect(r.id,'p1',right.id,'p0');net.connect(right.id,'p1',b.id,'p0');selected=r.id;examined=false;cancelConnect();render();};
 $('example-vlans').onclick=()=>{closeExamples();if(net.devices.length&&!confirm('Replace this network with the two-VLAN example?'))return;discard();net=new NetworkExplorer.Network();const sw=net.add('switch',450,280);net.setVlan(sw.id,10,'Students','#287d78');net.setVlan(sw.id,20,'Staff','#96652b');const hosts=[[190,150],[710,150],[190,420],[710,420]].map(([x,y],i)=>{const h=net.add('host',x,y);net.configure(h.id,'192.168.1.'+((i+1)*10),24);net.connect(h.id,'p0',sw.id,'p'+i);net.configurePort(sw.id,'p'+i,{accessVlan:i<2?10:20});return h;});sw.watch=false;selected=sw.id;examined=false;cancelConnect();render();};
 $('example').onclick=()=>{closeExamples();if(net.devices.length&&!confirm('Replace this network with the example LAN?'))return;discard();net=new NetworkExplorer.Network();const a=net.add('host',180,180),s=net.add('switch',450,290),b=net.add('host',720,180);net.configure(a.id,'192.168.1.10',24);net.configure(b.id,'192.168.1.20',24);net.connect(a.id,'p0',s.id,'p0');net.connect(b.id,'p0',s.id,'p1');s.watch=false;selected=s.id;examined=false;cancelConnect();render();};
 $('save').onclick=()=>{if(candidateBase){say('Commit or revert candidate changes before saving.');return;}const blob=new Blob([JSON.stringify({...net.save(),platform},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='network-explorer.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('Saved topology and configuration. Learned tables restart empty when loaded.');};$('load').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>500000)throw Error('Choose a topology file smaller than 500 KB.');const data=JSON.parse(await file.text());const next=new NetworkExplorer.Network(data);if(net.devices.length&&!confirm('Replace the current network with this saved topology?'))return;discard();candidateBase=null;net=next;if(['cisco','paloalto'].includes(data.platform)){platform=data.platform;persistPlatform();}selected=null;examined=false;cancelConnect();render();say('Network loaded. Learned tables start empty.');}catch(err){say(err.message);}finally{e.target.value='';}};

 // Context actions share the inspector's state and editing restrictions.
 const contextMenu=document.createElement('div');
 contextMenu.id='canvas-context-menu';
 contextMenu.setAttribute('role','menu');
 contextMenu.setAttribute('aria-label','Network item actions');
 contextMenu.hidden=true;
 document.body.append(contextMenu);
 let contextTarget=null;
 function closeContext(restore=false){
  contextMenu.hidden=true;
  if(restore&&contextTarget){
   const node=[...svg.querySelectorAll('[data-device],[data-link]')].find(el=>(el.dataset.device||el.dataset.link)===contextTarget);
   node?.focus();
  }
 }
 function openContext(event,target){
  const id=target.dataset.device||target.dataset.link;
  const device=net.device(id),link=net.links.find(l=>l.id===id);
  if(!device&&!link)return;
  event.preventDefault();
  if(device)openInspector();
  const bounds=target.getBoundingClientRect();
  finishPlacement();cancelConnect();drag=null;selected=id;contextTarget=id;render();
  const busy=Boolean(net.queue.length||staged);
  const actions=[];
  if(device){
   if(device.type==='host')actions.push({label:'Ping...',run:()=>{selected=id;inspector();$('command').value='ping ';commandDraft='ping ';historyIndex=commandHistory.length;syncExternal();openTool('terminal',true);const input=externalPanels.get('terminal')?.window.document.getElementById('command')||$('command');input.value='ping ';input.focus();input.setSelectionRange(5,5);}});
   actions.push({label:device.watch?'Unwatch device':'Watch device',run:()=>{const current=net.device(id);current.watch=!current.watch;render();}});
   actions.push({label:'Connect to another device',disabled:busy,run:()=>{connecting=true;endpoint=null;$('connect').classList.add('active');$('cancel-connect').hidden=false;$('connection-hint').textContent='Choose the first interface';choosePort(id);}});
   actions.push({label:'Delete device',disabled:busy,danger:true,run:()=>mutate(()=>{net.remove(id);selected=null;})});
  }else{
   actions.push({label:link.enabled?'Disable connection':'Enable connection',disabled:busy,run:()=>mutate(()=>{link.enabled=!link.enabled;})});
   actions.push({label:'Delete connection',disabled:busy,danger:true,run:()=>mutate(()=>{net.remove(id);selected=null;})});
  }
  contextMenu.replaceChildren();
  for(const action of actions){
   const button=document.createElement('button');
   button.type='button';button.setAttribute('role','menuitem');button.textContent=action.label;
   button.disabled=Boolean(action.disabled);if(action.danger)button.className='context-danger';
   button.onclick=()=>{closeContext();action.run();};contextMenu.append(button);
  }
  if(busy){const note=document.createElement('p');note.textContent='Finish or clear traffic to edit the network.';contextMenu.append(note);}
  contextMenu.hidden=false;
  const x=event.type==='keydown'?bounds.left+20:event.clientX;
  const y=event.type==='keydown'?bounds.top+20:event.clientY;
  contextMenu.style.left=Math.max(4,Math.min(x,document.documentElement.clientWidth-contextMenu.offsetWidth-4))+'px';
  contextMenu.style.top=Math.max(4,Math.min(y,window.innerHeight-contextMenu.offsetHeight-4))+'px';
  contextMenu.querySelector('button:not(:disabled)').focus();
 }
 svg.addEventListener('contextmenu',event=>{const target=event.target.closest('[data-device],[data-link]');if(target)openContext(event,target);});
 svg.addEventListener('keydown',event=>{
  if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')){const target=event.target.closest('[data-device],[data-link]');if(target)openContext(event,target);}
 });
 contextMenu.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();closeContext(true);return;}
  if(event.key==='Tab'){closeContext();return;}
  const buttons=[...contextMenu.querySelectorAll('button:not(:disabled)')];
  let index=buttons.indexOf(document.activeElement);
  if(event.key==='ArrowDown')index=(index+1)%buttons.length;
  else if(event.key==='ArrowUp')index=(index-1+buttons.length)%buttons.length;
  else if(event.key==='Home')index=0;
  else if(event.key==='End')index=buttons.length-1;
  else return;
  event.preventDefault();buttons[index].focus();
 });
 document.addEventListener('pointerdown',event=>{if(!contextMenu.contains(event.target))closeContext();});
 document.addEventListener('scroll',()=>closeContext(),true);
 window.addEventListener('resize',()=>closeContext());
 function completeCommand(input){
  const d=net.device(selected);if(!d)return false;
  const raw=input.value, prefix=raw.toLowerCase();
  const commands=cliCommands(d);
  if(isPan()&&d.type==='switch'&&cliContext(d).mode==='config'){commands.push(...d.ports.flatMap(p=>['set network interface ethernet '+p.name+' layer2','set network interface ethernet '+p.name+' link-state auto','set network interface ethernet '+p.name+' link-state down']),...d.vlans.flatMap(v=>d.ports.map(p=>'set network vlan '+(v.name.includes(' ')?JSON.stringify(v.name):v.name)+' interface '+p.name)));}
  const candidates=prefix.startsWith('ping ')?[...new Set(net.devices.filter(n=>n.type==='host'&&n.ip&&n.id!==d.id).map(n=>'ping '+n.ip))]:commands;
  const matches=candidates.filter(c=>c.startsWith(prefix));
  if(!matches.length)return false;
  let completion=matches[0];
  for(const candidate of matches)while(!candidate.startsWith(completion))completion=completion.slice(0,-1);
  if(matches.length===1)completion+=' ';
  if(completion.length>raw.length){input.value=completion;$('command').value=completion;input.setSelectionRange(completion.length,completion.length);}
  else {output(matches.join('    '));}
  return true;
 }
 // Terminal and Events share the left-menu overlay.
 const transport=document.createElement('div');transport.className='canvas-transport';transport.setAttribute('aria-label','Simulation controls');
 transport.append($('sim-status'));
 document.querySelector('.view-controls').append(transport);
 const toolOverlay=document.createElement('div');toolOverlay.id='tool-overlay';toolOverlay.hidden=true;toolOverlay.setAttribute('role','region');document.body.append(toolOverlay);
 toolOverlay.append(terminalPanel,terminalNotice);
 const eventsPanel=$('events-panel');toolOverlay.append(eventsPanel);eventsPanel.hidden=true;
 const toolIcons={events:'<path d="M3 17h3l3-10 4 14 3-10 2 6h3M3 3v18h18"/>',terminal:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m6 8 4 4-4 4m7 0h5"/>'};
 let activeTool=null,toolPinned=false,toolCloseTimer;
 function dockEvents(){eventsPanel.hidden=true;eventsPanel.querySelector('.close-tool').hidden=true;toolOverlay.classList.remove('events-overlay');}
 function closeTool(){dockEvents();toolOverlay.hidden=true;activeTool=null;toolPinned=false;document.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-expanded','false'));}
 function openTool(key,pinned=false,button=null){
  clearTimeout(toolCloseTimer);
  if(externalPanels.has(key)){if(pinned)externalPanels.get(key).window.focus();return;}
  dockEvents();if(key==='events'){eventsPanel.hidden=false;eventsPanel.querySelector('.close-tool').hidden=false;toolOverlay.classList.add('events-overlay');}
  activeTool=key;toolPinned=pinned;toolOverlay.hidden=false;terminalNotice.hidden=true;
  terminalPanel.hidden=key!=='terminal';
  toolOverlay.setAttribute('aria-label',key==='events'?'Events':'Terminal');
  const anchor=button||[...document.querySelectorAll('[data-tool="'+key+'"]')].find(b=>b.getClientRects().length);
  const bounds=anchor.getBoundingClientRect();
  toolOverlay.style.left=Math.max(8,Math.min(bounds.right+10,window.innerWidth-toolOverlay.offsetWidth-8))+'px';
  toolOverlay.style.top=Math.max(8,Math.min(bounds.top,window.innerHeight-toolOverlay.offsetHeight-8))+'px';
  document.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.tool===key)));
 }
 function scheduleToolClose(){clearTimeout(toolCloseTimer);if(!toolPinned)toolCloseTimer=setTimeout(closeTool,250);}
 for(const parent of [$('left-panel'),compactPalette]){
  const strip=document.createElement('nav');strip.className='network-tool-strip';strip.setAttribute('aria-label','Network tools');
  strip.innerHTML=['terminal','events'].map(key=>'<button type="button" data-tool="'+key+'" aria-label="'+(key==='events'?'Events':'Terminal')+'" aria-expanded="false" aria-controls="tool-overlay" title="'+(key==='events'?'Events':'Terminal')+'"><svg viewBox="0 0 24 24" aria-hidden="true">'+toolIcons[key]+'</svg><span>'+ (key==='events'?'Events':'Terminal')+'</span></button>').join('');parent.append(strip);
  strip.querySelectorAll('button').forEach(button=>{
   button.onpointerenter=()=>{if(!toolPinned)openTool(button.dataset.tool,false,button);};
   button.onpointerleave=scheduleToolClose;
   button.onclick=()=>openTool(button.dataset.tool,true,button);
  });
 }
 toolOverlay.onpointerenter=()=>clearTimeout(toolCloseTimer);toolOverlay.onpointerleave=scheduleToolClose;
 toolOverlay.onfocusin=()=>{toolPinned=true;clearTimeout(toolCloseTimer);};
 toolOverlay.onpointerdown=()=>{toolPinned=true;clearTimeout(toolCloseTimer);};
 toolOverlay.addEventListener('keydown',e=>{if(e.key==='Escape'){const key=activeTool;closeTool();[...document.querySelectorAll('[data-tool="'+key+'"]')].find(b=>b.getClientRects().length)?.focus();}});
 for(const [key,panel] of [['terminal',terminalPanel]]){
  const heading=panel.querySelector('h2');const svgIcon=document.createElementNS('http://www.w3.org/2000/svg','svg');svgIcon.setAttribute('viewBox','0 0 24 24');svgIcon.setAttribute('aria-hidden','true');svgIcon.classList.add('tool-title-icon');svgIcon.innerHTML=toolIcons[key];heading.prepend(svgIcon);
  const close=document.createElement('button');close.type='button';close.className='close-tool';close.textContent='Close';close.onclick=closeTool;heading.append(close);
 }
 const eventsClose=document.createElement('button');eventsClose.type='button';eventsClose.className='close-tool';eventsClose.textContent='Close';eventsClose.hidden=true;eventsClose.onclick=closeTool;eventsPanel.querySelector('h2').append(eventsClose);
 const eventsPop=document.createElement('button');eventsPop.id='float-events';eventsPop.type='button';eventsPop.className='heading-popout';eventsPop.textContent='Pop out';eventsPanel.querySelector('h2').insertBefore(eventsPop,eventsClose);
 for(const [button,label,path] of [[eventsPop,'Pop out events','M14 3h7v7M21 3l-7 7M10 21H3v-7M3 21l7-7'],[eventsClose,'Close events','M6 6l12 12M18 6 6 18']]){button.classList.add('events-icon-button');button.setAttribute('aria-label',label);button.title=label;button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>';}
 eventsPop.onclick=()=>{if(openExternal('events','Events - Network Explorer',()=>{const clone=eventsPanel.cloneNode(true);clone.hidden=false;clone.querySelector('#float-events').remove();clone.querySelector('.close-tool').remove();clone.querySelector('#capture-filter').setAttribute('value',$('capture-filter').value);return clone.outerHTML;},()=>{eventsPanel.hidden=false;openTool('events',true);})){closeTool();eventsPanel.hidden=true;}};
 document.addEventListener('capture-updated',()=>syncExternal());
 for(const [button,label,path] of [[$('float-terminal'),'Pop out console','M14 3h7v7M21 3l-7 7M10 21H3v-7M3 21l7-7'],[terminalPanel.querySelector('.close-tool'),'Close console','M6 6l12 12M18 6 6 18']]){button.classList.add('terminal-icon-button');button.setAttribute('aria-label',label);button.title=label;button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>';}
 const originalTerminalPop=$('float-terminal').onclick;
 $('float-terminal').onclick=()=>{originalTerminalPop();if(externalPanels.has('terminal'))closeTool();};
 terminalPanel.hidden=true;
 $('float-examine').onclick=()=>{if(openExternal('examine','Watch & Examine - Network Explorer',()=>{
  if(!staged||!$('sim-status').textContent.startsWith('Paused at '))return '<section class="external-examine"><p>Waiting for the next watched event.</p></section>';
  const clone=$('examine').cloneNode(true);clone.querySelector('#float-examine').remove();clone.querySelector('#examine-watch').toggleAttribute('checked',$('examine-watch').checked);return '<section class="external-examine">'+clone.innerHTML+'</section>';
 },()=>{if(staged&&$('sim-status').textContent.startsWith('Paused at ')){$('examine').showModal();$('continue').focus();}}))$('examine').close();};
 $('open-help').onclick=()=>{$('help-window').showModal();$('close-help').focus();};
 $('close-help').onclick=()=>{$('help-window').close();$('open-help').focus();};
 const commandHistory=[];let historyIndex=0,commandDraft='';
 function recallCommand(key){
  if(!commandHistory.length)return;
  if(historyIndex===commandHistory.length)commandDraft=$('command').value;
  historyIndex=Math.max(0,Math.min(commandHistory.length,historyIndex+(key==='ArrowUp'?-1:1)));
  $('command').value=historyIndex===commandHistory.length?commandDraft:commandHistory[historyIndex];
 }
 $('command').addEventListener('keydown',e=>{if(e.key==='Tab'&&!e.shiftKey){if(completeCommand(e.target))e.preventDefault();return;}if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();recallCommand(e.key);}});
 $('terminal').onclick=()=>$('command').focus();
 const settings=document.createElement('dialog');settings.id='global-settings';settings.setAttribute('aria-labelledby','settings-title');settings.innerHTML='<div class="dialog-header"><h2 id="settings-title">Global settings</h2></div><div class="settings-content"><fieldset><legend>Platform</legend><label class="platform-choice"><input type="radio" name="platform" value="cisco"><span><strong>Cisco IOS</strong><small>Access VLAN IDs, switch ports, immediate configuration.</small></span></label><label class="platform-choice"><input type="radio" name="platform" value="paloalto"><span><strong>Palo Alto PAN-OS</strong><small>Named VLAN objects, ethernet1/x interfaces, Commit and Revert.</small></span></label></fieldset><p class="hint">Applies to the whole app, including the inspector, canvas labels, capture, examples, and terminal. Layer 2 teaching subset only; no firewall zones, policies, or routing.</p><p class="hint">In PAN-OS mode, UI and CLI edits share a candidate configuration. Commit or revert before running traffic or saving. VLAN object membership is untagged; internal IDs are simulator identifiers, not wire tags.</p></div><footer><button id="close-settings" type="button">Close</button></footer>';document.body.append(settings);
 const platformBar=document.createElement('div');platformBar.className='platform-bar';platformBar.innerHTML='<button id="global-settings-button" type="button" title="Global settings" aria-label="Global settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/></svg><span id="platform-name"></span></button><span id="candidate-status" role="status"></span><button id="commit-config" type="button">Commit</button><button id="revert-config" type="button">Revert</button>';document.querySelector('body>header').append(platformBar);
 function persistPlatform(){try{localStorage.setItem('network-explorer-platform',platform);}catch{}}
 function refreshPlatform(){document.body.dataset.platform=platform;const vlanHeading=document.querySelector('.capture-table th:nth-child(4)');if(vlanHeading)vlanHeading.textContent=isPan()?'VLAN object':'VLAN';const help=document.querySelector('#help-window .help-content');help.innerHTML='<h3>'+ (isPan()?'Palo Alto PAN-OS':'Cisco IOS')+' - Layer 2 model</h3><p>Explicit Ethernet interfaces, VLAN isolation, MAC learning, ARP, and ICMP Echo.</p><p>'+(isPan()?'Use named VLAN objects to group untagged Layer 2 interfaces. UI and CLI edits share candidate configuration. Commit applies changes; Revert restores the previous configuration. Commit or revert before starting traffic or saving.':'Assign numeric access VLANs to switch ports. UI and CLI configuration changes apply immediately.')+'</p><h3>Terminal commands</h3><pre>'+(isPan()?'configure\nset network interface ethernet ethernet1/1 layer2\nset network vlan Students interface ethernet1/1\ncommit\nexit\nshow interface all':'configure terminal\nvlan 10\nname Students\nexit\ninterface P1\nswitchport access vlan 10\nend\nshow vlan brief')+'</pre><p class="hint">Select a host to ping. Type help in the terminal for supported commands. This is a teaching subset, not a complete device emulator. Switch profiles cover Layer 2. The connected-route router is configured through its interface inspector. Static routes, trunks, firewall zones and security policies are not modeled. Event ordering uses simulation ticks; ARP and MAC cache countdowns use real time.</p>';$('platform-name').textContent=isPan()?'Palo Alto PAN-OS':'Cisco IOS';$('candidate-status').textContent=isPan()?(candidateBase?'Candidate changes pending':'Committed'):'';for(const id of ['commit-config','revert-config']){$(id).hidden=!isPan();$(id).disabled=!candidateBase;}settings.querySelectorAll('[name=platform]').forEach(r=>r.checked=r.value===platform);}
 $('global-settings-button').onclick=()=>{refreshPlatform();settings.showModal();};$('close-settings').onclick=()=>settings.close();
 settings.querySelectorAll('[name=platform]').forEach(r=>r.onchange=()=>{if(candidateBase||!editable()){say(candidateBase?'Commit or revert candidate changes before switching platforms.':'Finish the exchange before switching platforms.');refreshPlatform();return;}if(r.value==='paloalto'&&net.devices.some(d=>d.type==='switch'&&new Set(d.vlans.map(v=>v.name)).size!==d.vlans.length)){say('Give each VLAN a unique name before switching to PAN-OS.');refreshPlatform();return;}platform=r.value;cliContexts.clear();persistPlatform();render();});
 $('commit-config').onclick=()=>{if(commitConfiguration())say('Configuration committed.');};$('revert-config').onclick=()=>{revertConfiguration();say('Candidate changes reverted.');};
 const pauseAnimation=document.createElement('button');pauseAnimation.id='pause-animation';pauseAnimation.type='button';pauseAnimation.className='animation-pause';$('speed').after(pauseAnimation);
 pauseAnimation.onclick=()=>{if(!phaseCallback)return;if(flightPaused){flightPaused=false;$('canvas').unpauseAnimations();schedulePhase(phaseCallback,phaseRemaining);$('sim-status').textContent=staged?'Frame in transit':'Running';}else{flightPaused=true;phaseRemaining=Math.max(0,phaseDeadline-performance.now());clearTimeout(timer);timer=null;$('canvas').pauseAnimations();$('sim-status').textContent='Animation paused - select the circle to inspect';updatePauseControl();}};updatePauseControl();
 const flightInspection=document.createElement('dialog');flightInspection.id='flight-inspection';flightInspection.setAttribute('aria-labelledby','flight-title');flightInspection.innerHTML='<div class="dialog-header"><h2 id="flight-title">Frame in flight</h2><p id="flight-route"></p></div><div id="flight-frame"></div><footer><span>Animation stays paused while you inspect.</span><button id="close-flight" type="button">Close</button></footer>';document.body.append(flightInspection);$('close-flight').onclick=()=>flightInspection.close();
 function inspectFlight(e){const circle=e.target.closest('.in-flight-frame');if(!circle||!flightPaused||!staged?.report.frame)return;if(e.type==='keydown'&&!['Enter',' '].includes(e.key))return;e.preventDefault();e.stopPropagation();const r=staged.report;$('flight-route').textContent=net.device(r.from).name+' to '+net.device(r.device).name;$('flight-frame').innerHTML=frameHeaderCard(r.frame,'Ethernet frame',null);flightInspection.showModal();}
 $('traffic').addEventListener('pointerdown',e=>{if(e.target.closest('.in-flight-frame'))e.stopPropagation();});$('traffic').addEventListener('click',inspectFlight);$('traffic').addEventListener('keydown',inspectFlight);
 const cacheTimer=setInterval(()=>{const changed=net.age();if(staged)staged.trial.age();if(changed){const d=net.device(selected);if(d&&$('inspector-table'))$('inspector-table').innerHTML=table(visibleTable(d.type==='switch'?net.mac[d.id]:net.arp[d.id],d),d.type);refreshFloatingTable();syncExternal();}refreshCountdowns();for(const entry of externalPanels.values())if(!entry.window.closed)refreshCountdowns(entry.window.document);},1000);
 window.addEventListener('pagehide',()=>clearInterval(cacheTimer));
 $('command-form').onsubmit=e=>{e.preventDefault();const raw=$('command').value.trim();if(!raw)return;commandHistory.push(raw);historyIndex=commandHistory.length;commandDraft='';safely(()=>command(raw));$('command').value='';syncExternal();};$('add-host').innerHTML='<svg viewBox="-42 -35 84 72" aria-hidden="true">'+icon({type:'host'})+'</svg>';$('add-switch').innerHTML='<svg viewBox="-42 -35 84 72" aria-hidden="true">'+icon({type:'switch'})+'</svg>';render();
})();
