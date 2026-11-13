/* Network Explorer: presentation and interaction only; protocols live in the engine. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let net=new NetworkExplorer.Network(),selected=null,connecting=false,endpoint=null,running=false,timer=null,staged=null,drag=null,previousFocus=null,examined=false,messageTimer;
 const say=text=>{ $('message').textContent=text;clearTimeout(messageTimer);messageTimer=setTimeout(()=>$('message').textContent='',6500);};
 const output=text=>{$('terminal').textContent+='\n'+text;$('terminal').scrollTop=$('terminal').scrollHeight;syncExternal();};
 const safely=fn=>{try{fn();}catch(e){say(e.message);}};
 function stop(){running=false;clearTimeout(timer);timer=null;}
 function discard(){finishPlacement();stop();staged=null;$('traffic').replaceChildren();if($('examine').open)$('examine').close();}
 function editable(){if(net.queue.length||staged){say('Finish the exchange or clear learned state before changing the network.');inspector();return false;}return true;}
 function mutate(fn){if(!editable())return;safely(()=>{fn();net.reset();examined=false;render();});}
 function table(rows,kind){const values=Object.entries(rows||{});return values.length?'<table><thead><tr><th>'+(kind==='switch'?'MAC address':'IPv4 address')+'</th><th>'+(kind==='switch'?'Port':'MAC address')+'</th></tr></thead><tbody>'+values.map(([key,v])=>'<tr data-table-mac="'+esc(kind==='switch'?key:v.mac)+'" tabindex="0"><td>'+esc(key)+'</td><td>'+esc(v.port||v.mac)+'</td></tr>').join('')+'</tbody></table>':'<p class="hint">No learned entries.</p>';}
 function visibleTable(rows,d){if(d.type!=='switch')return rows;return Object.fromEntries(Object.entries(rows||{}).map(([k,v])=>[k,{...v,port:d.ports.find(p=>p.id===v.port)?.name||v.port}]));}
 function icon(d){return d.type==='host'?'<rect x="-31" y="-24" width="46" height="34" rx="3" fill="#fff" stroke="currentColor" stroke-width="2"/><rect x="-27" y="-20" width="38" height="25" rx="1" fill="#cce4f5"/><path d="M-23-14h16m-16 5h24m-24 5h12" stroke="#7aaccd" stroke-width="2"/><path d="M-8 10v9m-12 0h24" stroke="currentColor" stroke-width="3"/><rect x="21" y="-24" width="16" height="45" rx="3" fill="#dce8f1" stroke="currentColor" stroke-width="2"/><path d="M25-17h8m-8 5h8m-8 5h8" stroke="currentColor"/><circle cx="29" cy="12" r="2" fill="#287d78"/><path d="M-30 26h47l5 5h-57z" fill="#dce8f1" stroke="currentColor"/>':'<path d="M-36-14l7-10h58l7 10" fill="#b9ddd6" stroke="currentColor" stroke-width="2"/><rect x="-37" y="-14" width="74" height="37" rx="4" fill="#f1faf7" stroke="currentColor" stroke-width="2"/><path d="M-32-7h18m-18 4h12" stroke="currentColor"/><circle cx="27" cy="-6" r="2" fill="#44a482"/>'+Array.from({length:8},(_,i)=>{const x=-29+(i%4)*16,y=3+Math.floor(i/4)*9;return '<rect x="'+x+'" y="'+y+'" width="11" height="7" rx="1" fill="#245b58"/><path d="M'+(x+3)+' '+(y+1)+'v2m3-2v2" stroke="#afd7c7" stroke-width="1"/>';}).join('');}
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
  $('devices').innerHTML=net.devices.map(d=>'<g class="node '+(selected===d.id?'selected':'')+'" data-device="'+esc(d.id)+'" transform="translate('+d.x+','+d.y+')" tabindex="0" role="button" aria-label="'+esc(d.name)+(d.watch?', watched':'')+'" style="color:'+(d.type==='host'?'#284d73':'#287d78')+'">'+(d.watch?'<rect class="watch-ring" x="-47" y="-39" width="94" height="78" rx="17"/>':'')+'<rect class="device-body" x="-41" y="-33" width="82" height="66" rx="12" fill="'+(d.type==='host'?'#eaf3fa':'#e7f4f1')+'" stroke="currentColor" stroke-width="2"/>'+icon(d)+'<text text-anchor="middle" y="55" font-size="14" font-weight="600" fill="#29394b">'+esc(d.name)+'</text><text text-anchor="middle" y="73" font-size="12" fill="#61758a">'+esc(d.type==='host'?(d.ip?d.ip+'/'+d.prefix:'Not configured'):'8 Ethernet ports')+'</text>'+(d.watch?'<g class="device-watch-eye" data-watch-device="'+esc(d.id)+'" role="button" tabindex="0" aria-label="Stop watching '+esc(d.name)+'" data-tooltip="Stop watching '+esc(d.name)+'" fill="none" stroke="#287d78" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="-3" y="-4" width="26" height="24" fill="transparent" stroke="none"/><path d="M1 8s3.5-6 9-6 9 6 9 6-3.5 6-9 6S1 8 1 8Z"/><circle cx="10" cy="8" r="2.6"/></g>':'')+'</g>').join('');
  $('devices').querySelectorAll('.device-watch-eye').forEach(eye=>{const name=eye.parentNode.querySelector('text');eye.setAttribute('transform','translate('+(name.getBBox().x+name.getBBox().width+5)+',44) scale(.7)');});
  drawAnchors();revealAnchors(hoveredDevice);
  if(!net.devices.length)$('devices').innerHTML='<text x="450" y="255" text-anchor="middle" fill="#61758a" font-size="20">Build your first network</text><text x="450" y="285" text-anchor="middle" fill="#61758a" font-size="14">Add two hosts and a switch from the palette.</text>';
 }
 function lesson(){const hosts=net.devices.filter(d=>d.type==='host'),switches=net.devices.filter(d=>d.type==='switch');const linked=hosts.filter(h=>net.links.some(l=>(l.a===h.id&&net.device(l.b).type==='switch')||(l.b===h.id&&net.device(l.a).type==='switch')));const configured=hosts.filter(h=>h.ip);const checks=[hosts.length>=2&&switches.length>=1,linked.length>=2,configured.length>=2,net.devices.some(d=>d.type==='switch'&&d.watch),net.results.some(r=>r.ok)&&examined,net.results.filter(r=>r.ok).length>=2];const texts=['Place two hosts and a switch.','Connect each host to a switch port.','Configure hosts: try 192.168.1.10/24 and 192.168.1.20/24.','Watch the switch. Predict what it does with an ARP broadcast.','Ping the other host. Examine the first exchange.','Repeat the ping. What traffic is no longer needed?'];const first=checks.findIndex(v=>!v);$('lesson').innerHTML=texts.map((text,i)=>'<div class="task '+(checks[i]?'done':first===i?'current':'')+'"><span>'+(checks[i]?'✓':i+1)+'</span><span>'+text+'</span></div>').join('');}
 function interfacePanel(d){
  return '<div class="small-heading">Interfaces</div><p class="hint">Click a port to enable or disable it.</p><div class="interface-chassis"><div class="interface-ports">'+d.ports.map(p=>{
   const link=net.links.find(l=>(l.a===d.id&&l.ap===p.id)||(l.b===d.id&&l.bp===p.id));
   const peer=link?net.device(link.a===d.id?link.b:link.a).name:'Not connected';
   const state=link?'In use':p.enabled?'Available':'Disabled';
   const active=Boolean(link&&link.enabled&&p.enabled&&net.device(link.a===d.id?link.b:link.a).ports.find(q=>q.id===(link.a===d.id?link.bp:link.ap)).enabled);
   const description=p.name+' - '+state+' - '+(p.enabled?'Enabled':'Disabled')+' - '+peer;
   return '<button type="button" class="interface-port '+(p.enabled?'enabled':'disabled')+(active?' link-up':'')+'" data-device-port="'+esc(d.id+':'+p.id)+'" data-port="'+esc(p.id)+'" aria-pressed="'+p.enabled+'" aria-label="'+esc(description)+'" title="'+esc(description)+'"><span class="port-name">'+esc(p.name)+'</span><svg viewBox="0 0 44 32" aria-hidden="true"><path class="socket" d="M5 3h34v20H28v6H16v-6H5z"/><path class="contacts" d="M12 6v7m5-7v7m5-7v7m5-7v7m5-7v7"/><path class="socket-edge" d="M9 19h7v5h12v-5h7"/></svg><span class="port-led" aria-hidden="true"></span><span class="port-state">'+state+'</span></button>';
  }).join('')+'</div></div>';
 }
 function inspector(){const d=net.device(selected),l=net.links.find(l=>l.id===selected);$('inspector-title').innerHTML=d?'<svg class="inspector-device-icon" viewBox="-42 -35 84 72" aria-hidden="true">'+icon(d)+'</svg><span>'+esc(d.type==='host'?'Host':'Ethernet switch')+'</span>':(l?'Ethernet connection':'Inspector');$('watch').hidden=!d;$('watch').setAttribute('aria-pressed',String(Boolean(d?.watch)));const watchLabel=d?.watch?'Stop watching this device':'Watch this device';$('watch').setAttribute('aria-label',watchLabel);$('watch').title=watchLabel;$('prompt').textContent=d?d.name+' >':'Select a device';$('terminal-title').textContent=d?d.name+' - '+(d.type==='host'?'Host':'Layer 2 Switch'):'Terminal';
  if(d){$('inspector').innerHTML='<label>Name<input id="device-name" maxlength="40" value="'+esc(d.name)+'"></label>'+(d.type==='host'?'<div class="pair"><div class="address-field"><div class="address-heading"><label for="host-ip">IPv4 address</label><a class="cidr-tool-link" href="../viewer.html?tool=cs339/cidr_viz.html&amp;course=CS339&amp;label=Computer%20Networks&amp;name=CIDR%20Teaching%20Tool&amp;back=cs339/index.html" target="_blank" rel="noopener" title="Open CIDR Teaching Tool in a new tab" aria-label="Open CIDR Teaching Tool in a new tab"><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 2h5v5M14 2 7 9M6 3H2v11h11v-4"/></svg></a></div><input id="host-ip" value="'+esc(d.ip)+'" placeholder="Not configured"></div><div class="prefix-field"><div class="prefix-heading"><label for="host-prefix">Prefix</label></div><input id="host-prefix" type="number" min="1" max="30" value="'+esc(d.prefix)+'"></div></div>':'<p class="hint">This Layer 2 switch forwards by MAC address. It does not need an IP address.</p>')+interfacePanel(d)+(d.type==='host'?'<p class="hint">MAC '+esc(d.ports[0].mac)+'</p>':'')+'<div class="small-heading">'+(d.type==='host'?'ARP cache':'MAC forwarding table')+' <button id="float-table" type="button" title="Open table in a floating panel">Pop out</button></div><div id="inspector-table">'+table(visibleTable(d.type==='host'?net.arp[d.id]:net.mac[d.id],d),d.type)+'</div>'+'<button class="danger" id="delete">Delete device</button>';
   $('float-table').onclick=()=>{floatingDevice=d.id;refreshFloatingTable();if(openExternal('table',d.name+' - Network Explorer',()=>'<h2>'+esc($('table-drag').textContent)+'</h2>'+$('floating-table-content').innerHTML,()=>{$('dock-table').click();}))floatingTable.hidden=true;};
   $('device-name').onchange=e=>mutate(()=>{d.name=e.target.value.trim()||d.name;});$('watch').onclick=()=>{const current=net.device(selected);if(!current)return;current.watch=!current.watch;render();};if(d.type==='host'){
    const saveAddress=()=>{const address=$('host-ip').value.trim(),prefixText=$('host-prefix').value;if(!address||!prefixText)return;const prefix=Number(prefixText);if(address===d.ip&&prefix===d.prefix)return;if(!editable())return;safely(()=>{net.configure(d.id,address,prefix);examined=false;draw();lesson();$('inspector-table').innerHTML=table(visibleTable(net.arp[d.id],d),d.type);refreshFloatingTable();NetworkExplorerCapture.render(net);syncExternal();});};
    for(const id of ['host-ip','host-prefix']){$(id).onchange=saveAddress;$(id).onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();saveAddress();}};}
   }$('inspector').querySelectorAll('[data-port]').forEach(el=>el.onclick=()=>{const portId=el.dataset.port;mutate(()=>{const port=d.ports.find(p=>p.id===portId);port.enabled=!port.enabled;});$('inspector').querySelector('[data-port="'+portId+'"]')?.focus();});$('delete').onclick=()=>mutate(()=>{net.remove(d.id);selected=null;});
  }else if(l){const a=net.device(l.a),b=net.device(l.b);$('inspector').innerHTML='<strong>Ethernet connection</strong><p>'+esc(a.name)+' / '+esc(a.ports.find(p=>p.id===l.ap).name)+' ↔ '+esc(b.name)+' / '+esc(b.ports.find(p=>p.id===l.bp).name)+'</p><label><input id="link-enabled" type="checkbox" '+(l.enabled?'checked':'')+'> Cable enabled</label><button id="delete" class="danger">Delete connection</button>';$('link-enabled').onchange=e=>mutate(()=>l.enabled=e.target.checked);$('delete').onclick=()=>mutate(()=>{net.remove(l.id);selected=null;});}else $('inspector').innerHTML='<p>Select a device or cable to inspect and configure it.</p>';
 }
 const externalPanels=new Map();
 function openExternal(key,title,content,onDock){
  const existing=externalPanels.get(key);if(existing&&!existing.window.closed){existing.window.focus();return true;}
  const popup=window.open('about:blank','network-explorer-'+key,'popup=yes,width='+(key==='events'?1120:key==='examine'?760:430)+',height=650,resizable=yes,scrollbars=yes');
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
  $('table-drag').textContent=d.name+' / '+(d.type==='host'?'ARP cache':'MAC forwarding table');
  $('floating-table-content').innerHTML=table(visibleTable(d.type==='host'?net.arp[d.id]:net.mac[d.id],d),d.type);
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
 function render(){draw();inspector();refreshFloatingTable();lesson();syncExternal();watchList();const current=$('source').value;$('source').innerHTML=net.devices.filter(d=>d.type==='host').map(d=>'<option value="'+esc(d.id)+'">'+esc(d.name)+'</option>').join('');if(net.device(current))$('source').value=current;NetworkExplorerCapture.render(net);$('sim-status').textContent=staged?'Paused for examination':running?'Running':net.queue.length?'Paused · '+net.queue.length+' events queued':'Ready';syncExternal();}
 function openInspector(){if($('right-panel').hidden)$('toggle-right').click();}
 function select(id){if(net.device(id))openInspector();selected=id;if(connecting&&net.device(id)){choosePort(id);return;}render();}
 function choosePort(id){if(!editable())return;selected=id;render();$('connection-hint').textContent='Choose an anchor on this device, then a destination anchor.';}
 function cancelConnect(){pendingCable=null;if(portPicker.open)portPicker.close();connecting=false;endpoint=null;cableGesture=null;$('cable-preview').replaceChildren();$('connect').classList.remove('active');$('cancel-connect').hidden=true;$('connection-hint').textContent='Drag devices to arrange; drag port anchors to connect';}
 function flashPorts(report){
  if(!report.link)return;
  const link=net.links.find(l=>l.id===report.link);if(!link)return;
  for(const key of [link.a+':'+link.ap,link.b+':'+link.bp]){
   const port=document.querySelector('[data-device-port="'+key+'"]');
   if(port){port.classList.remove('port-activity');void port.offsetWidth;port.classList.add('port-activity');port.addEventListener('animationend',()=>port.classList.remove('port-activity'),{once:true});}
  }
 }
 function animate(report){$('traffic').replaceChildren();flashPorts(report);if(!report.link)return;const link=net.links.find(l=>l.id===report.link),a=portPosition(net.device(report.from),link.a===report.from?link.ap:link.bp,link.a===report.from?link.aAnchor:link.bAnchor),b=portPosition(net.device(report.device),report.ingress,link.a===report.device?link.aAnchor:link.bAnchor),ns='http://www.w3.org/2000/svg';const circle=document.createElementNS(ns,'circle');circle.setAttribute('r','8');circle.setAttribute('fill',report.frame.type==='ARP'?'#bc770b':'#4d88bd');const motion=document.createElementNS(ns,'animateMotion');motion.setAttribute('path',pathData(cablePath(link),link.a!==report.from));motion.setAttribute('dur',Number($('speed').value)/1000+'s');motion.setAttribute('fill','freeze');circle.append(motion);const label=document.createElementNS(ns,'text');label.setAttribute('x',(a.x+b.x)/2);label.setAttribute('y',(a.y+b.y)/2-15);label.setAttribute('font-size','12');label.setAttribute('fill','#284d73');label.textContent=report.frame.type==='ARP'?'ARP '+report.frame.op:'ICMP '+report.frame.icmp;$('traffic').append(circle,label);motion.beginElement();}
 function stage(){if(staged)return;const trial=Object.assign(new NetworkExplorer.Network(),JSON.parse(JSON.stringify(net)));const report=trial.next();if(!report){net=trial;stop();render();return;}staged={trial,report};animate(report);$('sim-status').textContent='Frame in transit';timer=setTimeout(()=>{if(!staged)return;if(net.device(report.device).watch)examine();else commit();},report.link?Number($('speed').value):100);}
 function examine(){const {report:r}=staged,d=net.device(r.device);previousFocus=document.activeElement;$('examine-watch').checked=d.watch;$('examine-watch-status').textContent=d.watch?'On':'Off';$('examine-title').textContent=r.title;$('examine-device').textContent=d.name+(r.ingress?' · arriving on '+d.ports.find(p=>p.id===r.ingress).name:' · originating event');const f=r.frame;const fields=f?Object.entries(f).filter(([k])=>k!=='type').map(([k,v])=>'<span>'+esc(({src:'Source MAC',dst:'Destination MAC',sip:'Source IP',dip:'Destination IP',tip:'ARP target IP',op:'ARP operation',icmp:'ICMP message'})[k]||k)+'</span><code>'+esc(v)+'</code>').join(''):'';$('examine-body').innerHTML=(f?'<div class="evidence"><strong>Incoming Ethernet frame · '+esc(f.type)+'</strong><div class="frame-grid">'+fields+'</div></div>':'<div class="evidence">'+esc(r.target?'Destination: '+r.target:'Local event')+'</div>')+'<h3>Table before this decision</h3>'+table(visibleTable(r.before,d),d.type)+'<div class="decision">'+r.notes.map(n=>'<p>'+esc(n)+'</p>').join('')+'</div><h3>Table after this decision</h3>'+table(visibleTable(r.after,d),d.type)+(r.outputs.length?'<p><strong>Send through:</strong> '+r.outputs.map(p=>esc(d.ports.find(q=>q.id===p).name)).join(', ')+'</p>':'');$('sim-status').textContent='Paused at '+d.name;if(externalPanels.has('examine')){syncExternal();externalPanels.get('examine').window.focus();}else{$('examine').showModal();$('continue').focus();}$('sim-status').textContent='Paused at '+d.name;examined=true;}
 function commit(){if(!staged)return;const oldCount=net.results.length;const layout=new Map(net.devices.map(d=>[d.id,{x:d.x,y:d.y,watch:d.watch}]));net=staged.trial;net.devices.forEach(d=>Object.assign(d,layout.get(d.id)));staged=null;render();for(const r of net.results.slice(oldCount))output(net.device(r.device).name+': '+(r.ok?'Reply from '+r.target:'Ping to '+r.target+' failed.'));if(running&&net.queue.length)timer=setTimeout(stage,150);else if(!net.queue.length){stop();$('traffic').replaceChildren();render();}}
 function startPing(id,target){finishPlacement();cancelConnect();if(staged||net.queue.length)throw Error('Finish or clear the current exchange first.');net.ping(id,target);output(net.device(id).name+'> ping '+target);running=true;stage();}
 function command(raw){if(['close','exit'].includes(raw.trim().toLowerCase())){const entry=externalPanels.get('terminal');if(entry){externalPanels.delete('terminal');entry.window.close();terminalNotice.hidden=true;}closeTool();return;}const d=net.device(selected);if(!d)throw Error('Select a device on the canvas first.');const cmd=raw.trim().toLowerCase();output(d.name+'> '+raw);if(cmd==='help')output(d.type==='host'?'ping <IPv4>, arp -a, ipconfig, ip addr, close / exit':'show mac address-table, show interfaces, close / exit');else if(cmd.startsWith('ping ')&&d.type==='host')startPing(d.id,raw.trim().split(/\s+/)[1]);else if(['ipconfig','ip addr'].includes(cmd)&&d.type==='host')output('eth0  '+(d.ip?d.ip+'/'+d.prefix:'unconfigured')+'\nMAC '+d.ports[0].mac+'\n'+(d.ports[0].enabled?'Enabled':'Disabled'));else if(cmd==='arp -a'&&d.type==='host')output(Object.entries(net.arp[d.id]||{}).map(([ip,r])=>ip+'  '+r.mac).join('\n')||'ARP cache is empty.');else if(cmd==='show mac address-table'&&d.type==='switch')output(Object.entries(net.mac[d.id]||{}).map(([mac,r])=>mac+'  '+d.ports.find(p=>p.id===r.port).name).join('\n')||'MAC table is empty.');else if(cmd==='show interfaces')output(d.ports.map(p=>p.name+'  '+(p.enabled?'enabled':'disabled')+'  '+(net.links.some(l=>l.enabled&&((l.a===d.id&&l.ap===p.id)||(l.b===d.id&&l.bp===p.id)))?'cabled':'no active cable')).join('\n'));else output('Unsupported command for this device. Type help.');}
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
 $('add-host').onclick=()=>addFromPalette('host');$('add-switch').onclick=()=>addFromPalette('switch');
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
 compactPalette.innerHTML=['host','switch'].map(type=>'<button type="button" class="compact-device" data-add-type="'+type+'" aria-label="Add '+type+'"><svg viewBox="-42 -35 84 72" aria-hidden="true">'+icon({type})+'</svg><span role="tooltip">Add '+(type==='host'?'host':'switch')+'</span></button>').join('');
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
 const lessonSection=$('lesson').closest('section');
 const guideMenu=document.createElement('div');guideMenu.className='guide-menu';
 guideMenu.innerHTML='<button id="toggle-guide" type="button" aria-expanded="false" aria-controls="guide-dropdown"><svg class="guide-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="2" width="8" height="6" rx="1.5"/><path d="M12 8v5M5 17v-4h14v4"/><rect x="1" y="17" width="8" height="5" rx="1.5"/><rect x="15" y="17" width="8" height="5" rx="1.5"/></svg>Build your first LAN <span aria-hidden="true">&#9662;</span></button><div id="guide-dropdown" hidden></div>';
 $('toggle-right').before(guideMenu);$('guide-dropdown').append(lessonSection);
 $('toggle-guide').onclick=()=>{const panel=$('guide-dropdown');panel.hidden=!panel.hidden;$('toggle-guide').setAttribute('aria-expanded',String(!panel.hidden));};
 document.addEventListener('pointerdown',e=>{if(!guideMenu.contains(e.target)){$('guide-dropdown').hidden=true;$('toggle-guide').setAttribute('aria-expanded','false');}});
 guideMenu.addEventListener('keydown',e=>{if(e.key==='Escape'){$('guide-dropdown').hidden=true;$('toggle-guide').setAttribute('aria-expanded','false');$('toggle-guide').focus();}});

 const lessonHeading=lessonSection.querySelector('h2');
 const lessonPop=document.createElement('button');lessonPop.id='float-lesson';lessonPop.textContent='Pop out';lessonPop.className='heading-popout';lessonHeading.append(lessonPop);
 const lessonPlaceholder=document.createElement('div');lessonPlaceholder.hidden=true;lessonSection.after(lessonPlaceholder);
 const lessonWindow=document.createElement('div');lessonWindow.id='floating-lesson';lessonWindow.hidden=true;document.body.append(lessonWindow);
 const lessonHandle=document.createElement('div');lessonHandle.className='floating-table-header';lessonHandle.innerHTML='<button id="lesson-drag" title="Drag to move; arrow keys also move this panel">Build your first LAN</button><button id="dock-lesson">Dock</button>';lessonWindow.append(lessonHandle);
 lessonPop.onclick=()=>{if(openExternal('lesson','Build your first LAN - Network Explorer',()=>lessonSection.innerHTML,()=>{$('dock-lesson').click();})){lessonPlaceholder.hidden=false;lessonPlaceholder.className='hint';lessonPlaceholder.textContent='LAN guide is in the external window.';lessonWindow.append(lessonSection);lessonHeading.hidden=true;syncExternal();return;}lessonPlaceholder.hidden=false;lessonPlaceholder.className='hint';lessonPlaceholder.textContent='LAN guide is in the floating panel.';lessonWindow.append(lessonSection);lessonHeading.hidden=true;lessonWindow.hidden=false;$('lesson-drag').focus();};
 $('dock-lesson').onclick=()=>{lessonPlaceholder.before(lessonSection);lessonPlaceholder.hidden=true;lessonHeading.hidden=false;lessonWindow.hidden=true;lessonPop.focus();};
 let lessonDrag=null;
 function moveLesson(x,y){lessonWindow.style.left=Math.max(0,Math.min(x,window.innerWidth-lessonWindow.offsetWidth))+'px';lessonWindow.style.top=Math.max(0,Math.min(y,window.innerHeight-50))+'px';}
 $('lesson-drag').onpointerdown=e=>{if(e.button!==0)return;const r=lessonWindow.getBoundingClientRect();lessonDrag={x:e.clientX-r.left,y:e.clientY-r.top};e.currentTarget.setPointerCapture(e.pointerId);};
 $('lesson-drag').onpointermove=e=>{if(lessonDrag)moveLesson(e.clientX-lessonDrag.x,e.clientY-lessonDrag.y);};
 $('lesson-drag').onpointerup=$('lesson-drag').onpointercancel=()=>lessonDrag=null;
 $('lesson-drag').onkeydown=e=>{const delta={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[e.key];if(delta){e.preventDefault();const r=lessonWindow.getBoundingClientRect();moveLesson(r.left+delta[0],r.top+delta[1]);}};
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
 $('ping').onclick=()=>safely(()=>{startPing($('source').value,$('destination').value.trim());if(activeTool==='traffic')closeTool();});$('run').onclick=()=>{if(!staged&&net.queue.length){running=true;stage();}else if(staged)running=true;};$('pause').onclick=()=>{running=false;$('sim-status').textContent='Pausing after current event';};$('step').onclick=()=>{running=false;if(!staged)stage();};$('continue').onclick=()=>{$('examine').close();commit();previousFocus?.focus();};$('examine-watch').onchange=()=>{if(!staged)return;const d=net.device(staged.report.device);d.watch=$('examine-watch').checked;$('examine-watch-status').textContent=d.watch?'On':'Off';draw();inspector();syncExternal();};$('examine').addEventListener('cancel',e=>e.preventDefault());
 $('clear-state').onclick=()=>{discard();net.reset();examined=false;render();output('Learned state and pending traffic cleared. Configuration retained.');};$('new').onclick=()=>{if(net.devices.length&&!confirm('Clear this network? Save first if you want to keep it.'))return;discard();net=new NetworkExplorer.Network();selected=null;examined=false;cancelConnect();render();};
 $('example').onclick=()=>{if(net.devices.length&&!confirm('Replace this network with the example LAN?'))return;discard();net=new NetworkExplorer.Network();const a=net.add('host',180,180),s=net.add('switch',450,290),b=net.add('host',720,180);net.configure(a.id,'192.168.1.10',24);net.configure(b.id,'192.168.1.20',24);net.connect(a.id,'p0',s.id,'p0');net.connect(b.id,'p0',s.id,'p1');s.watch=true;selected=s.id;examined=false;cancelConnect();render();$('destination').value=b.ip;};
 $('save').onclick=()=>{const blob=new Blob([JSON.stringify(net.save(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='network-explorer.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('Saved topology and configuration. Learned tables restart empty when loaded.');};$('load').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>500000)throw Error('Choose a topology file smaller than 500 KB.');const next=new NetworkExplorer.Network(JSON.parse(await file.text()));if(net.devices.length&&!confirm('Replace the current network with this saved topology?'))return;discard();net=next;selected=null;examined=false;cancelConnect();render();say('Network loaded. Learned tables start empty.');}catch(err){say(err.message);}finally{e.target.value='';}};

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
  const actions=[{label:'Inspect',run:()=>{inspector();$('inspector').scrollIntoView({block:'nearest'});}}];
  if(device){
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
  const commands=d.type==='host'?['help','close','exit','ping','arp -a','ipconfig','ip addr','show interfaces']:['help','close','exit','show mac address-table','show interfaces'];
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
 // Traffic, Terminal, and Events share the left-menu overlay.
 const trafficPanel=$('ping').closest('section');trafficPanel.id='traffic-panel';
 const transport=document.createElement('div');transport.className='canvas-transport';transport.setAttribute('aria-label','Simulation controls');
 for(const id of ['run','pause','step'])$(id).hidden=true;
 transport.append($('sim-status'));
 document.querySelector('.view-controls').append(transport);
 const toolOverlay=document.createElement('div');toolOverlay.id='tool-overlay';toolOverlay.hidden=true;toolOverlay.setAttribute('role','region');document.body.append(toolOverlay);
 toolOverlay.append(trafficPanel,terminalPanel,terminalNotice);
 const eventsPanel=$('events-panel');toolOverlay.append(eventsPanel);eventsPanel.hidden=true;
 const toolIcons={events:'<path d="M3 17h3l3-10 4 14 3-10 2 6h3M3 3v18h18"/>',traffic:'<path d="M3 7h16m-4-4 4 4-4 4M21 17H5m4-4-4 4 4 4"/>',terminal:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m6 8 4 4-4 4m7 0h5"/>'};
 let activeTool=null,toolPinned=false,toolCloseTimer;
 function dockEvents(){eventsPanel.hidden=true;eventsPanel.querySelector('.close-tool').hidden=true;toolOverlay.classList.remove('events-overlay');}
 function closeTool(){dockEvents();toolOverlay.hidden=true;activeTool=null;toolPinned=false;document.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-expanded','false'));}
 function openTool(key,pinned=false,button=null){
  clearTimeout(toolCloseTimer);
  if(externalPanels.has(key)){if(pinned)externalPanels.get(key).window.focus();return;}
  dockEvents();if(key==='events'){eventsPanel.hidden=false;eventsPanel.querySelector('.close-tool').hidden=false;toolOverlay.classList.add('events-overlay');}
  activeTool=key;toolPinned=pinned;toolOverlay.hidden=false;terminalNotice.hidden=true;
  trafficPanel.hidden=key!=='traffic';terminalPanel.hidden=key!=='terminal';
  toolOverlay.setAttribute('aria-label',key==='events'?'Events':key==='traffic'?'Traffic controls':'Terminal');
  const anchor=button||[...document.querySelectorAll('[data-tool="'+key+'"]')].find(b=>b.getClientRects().length);
  const bounds=anchor.getBoundingClientRect();
  toolOverlay.style.left=Math.max(8,Math.min(bounds.right+10,window.innerWidth-toolOverlay.offsetWidth-8))+'px';
  toolOverlay.style.top=Math.max(8,Math.min(bounds.top,window.innerHeight-toolOverlay.offsetHeight-8))+'px';
  document.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.tool===key)));
 }
 function scheduleToolClose(){clearTimeout(toolCloseTimer);if(!toolPinned)toolCloseTimer=setTimeout(closeTool,250);}
 for(const parent of [$('left-panel'),compactPalette]){
  const strip=document.createElement('nav');strip.className='network-tool-strip';strip.setAttribute('aria-label','Network tools');
  strip.innerHTML=['traffic','terminal','events'].map(key=>'<button type="button" data-tool="'+key+'" aria-label="'+(key==='events'?'Events':key==='traffic'?'Traffic':'Terminal')+'" aria-expanded="false" aria-controls="tool-overlay" title="'+(key==='events'?'Events':key==='traffic'?'Traffic':'Terminal')+'"><svg viewBox="0 0 24 24" aria-hidden="true">'+toolIcons[key]+'</svg><span>'+ (key==='events'?'Events':key==='traffic'?'Traffic':'Terminal')+'</span></button>').join('');parent.append(strip);
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
 for(const [key,panel] of [['traffic',trafficPanel],['terminal',terminalPanel]]){
  const heading=panel.querySelector('h2');const svgIcon=document.createElementNS('http://www.w3.org/2000/svg','svg');svgIcon.setAttribute('viewBox','0 0 24 24');svgIcon.setAttribute('aria-hidden','true');svgIcon.classList.add('tool-title-icon');svgIcon.innerHTML=toolIcons[key];heading.prepend(svgIcon);
  const close=document.createElement('button');close.type='button';close.className='close-tool';close.textContent='Close';close.onclick=closeTool;heading.append(close);
 }
 const eventsClose=document.createElement('button');eventsClose.type='button';eventsClose.className='close-tool';eventsClose.textContent='Close';eventsClose.hidden=true;eventsClose.onclick=closeTool;eventsPanel.querySelector('h2').append(eventsClose);
 const eventsPop=document.createElement('button');eventsPop.id='float-events';eventsPop.type='button';eventsPop.className='heading-popout';eventsPop.textContent='Pop out';eventsPanel.querySelector('h2').append(eventsPop);
 eventsPop.onclick=()=>{if(openExternal('events','Events - Network Explorer',()=>{const clone=eventsPanel.cloneNode(true);clone.hidden=false;clone.querySelector('#float-events').remove();clone.querySelector('.close-tool').remove();clone.querySelector('#capture-filter').setAttribute('value',$('capture-filter').value);return clone.outerHTML;},()=>{eventsPanel.hidden=false;openTool('events',true);})){closeTool();eventsPanel.hidden=true;}};
 document.addEventListener('capture-updated',()=>syncExternal());
 const trafficPop=document.createElement('button');trafficPop.id='float-traffic';trafficPop.textContent='Pop out';trafficPop.className='heading-popout';trafficPanel.querySelector('h2').append(trafficPop);
 trafficPop.onclick=()=>{if(openExternal('traffic','Traffic - Network Explorer',()=>{
  const clone=trafficPanel.cloneNode(true);clone.querySelector('#float-traffic').remove();clone.querySelector('.close-tool').remove();
  for(const id of ['source','speed'])clone.querySelectorAll('#'+id+' option').forEach(o=>o.toggleAttribute('selected',o.value===$(id).value));
  clone.querySelector('#destination').setAttribute('value',$('destination').value);return clone.innerHTML;
 },()=>openTool('traffic',true)))closeTool();};
 const originalTerminalPop=$('float-terminal').onclick;
 $('float-terminal').onclick=()=>{originalTerminalPop();if(externalPanels.has('terminal'))closeTool();};
 trafficPanel.hidden=true;terminalPanel.hidden=true;
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
 $('command-form').onsubmit=e=>{e.preventDefault();const raw=$('command').value.trim();if(!raw)return;commandHistory.push(raw);historyIndex=commandHistory.length;commandDraft='';safely(()=>command(raw));$('command').value='';syncExternal();};$('add-host').innerHTML='<svg viewBox="-42 -35 84 72" aria-hidden="true">'+icon({type:'host'})+'</svg>';$('add-switch').innerHTML='<svg viewBox="-42 -35 84 72" aria-hidden="true">'+icon({type:'switch'})+'</svg>';render();
})();
