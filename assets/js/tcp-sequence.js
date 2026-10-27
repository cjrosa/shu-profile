(()=>{
 'use strict';
 const E=window.TCPSequence,$=id=>document.getElementById(id),presets=window.TCPScenarios;
 let s=E.create(),selected=null,timer=null,lastAnimated=0;
 let interceptArmed=false,intercepted=null;const inspected=new Set();
 const fields=[['a','Host A ISN',0,1000000],['size','A message bytes',1,256],['mss','A MSS',1,64],['b','Host B ISN',0,1000000],['sizeB','B message bytes',1,256],['mssB','B MSS',1,64]];
 const setting=(key)=>{const [,label,min,max]=fields.find(f=>f[0]===key);return `<div class="field"><label for="cfg-${key}">${label}</label><input id="cfg-${key}" type="number" min="${min}" max="${max}" step="1" value="${s.c[key]}"></div>`;};
 const layerSettings=(id,layer)=>{const app=layer==='Application',name=id+'-'+(app?'app':'tcp')+'-settings',keys=app?[id==='A'?'size':'sizeB']:(id==='A'?['a','mss']:['b','mssB']);return `<button class="layer-settings-button" popovertarget="${name}" aria-label="Host ${id} ${layer} settings">...</button><div id="${name}" class="layer-settings-overlay" popover aria-labelledby="${name}-title"><div class="settings-heading"><h3 id="${name}-title">Host ${id} &middot; ${layer}</h3><button popovertarget="${name}" popovertargetaction="hide" aria-label="Close settings">&times;</button></div>${keys.map(setting).join('')}<p class="hint">Reset the connection to change settings.</p></div>`;};
 const track=(id,type)=>`<div id="${id}-${type}-pending" class="pending-window">Connect to begin</div><div id="${id}-${type}-visual"><div class="stream-scroll" id="${id}-${type}-scroll" tabindex="0" role="region" aria-label="Host ${id} ${type} byte stream"><div id="${id}-${type}-track" class="byte-track ${type==='receive'?'receive-track':''}"><div id="${id}-${type}-cells" class="cells"></div><div id="${id}-${type}-outline" class="window-outline"></div><div id="${id}-${type}-start" class="window-pointer"></div><div id="${id}-${type}-next" class="window-pointer next"></div></div></div><p id="${id}-${type}-note" class="track-note"></p></div>`;
 $('layered-hosts').innerHTML=['A','B'].map(id=>`<article class="panel layered-host" id="host-${id}"><div class="host-heading"><h2 class="host-identity"><svg class="host-icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${id==='A'?'<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21h8M12 16v5M6 12h12"/>':'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M4 9h16M4 16h16M8 5.5h.01M8 12.5h.01M8 19h.01M12 5.5h5M12 12.5h5M12 19h5"/>'}</svg><span>Host ${id} - ${id==='A'?'Client':'Server'}</span></h2><span id="${id}-state"></span></div><section class="app-layer">${layerSettings(id,'Application')}<h3 class="layer-title"><svg class="app-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01M7 13h6M7 16h10"/></svg><span>Application</span></h3><div class="app-actions">${id==='A'?'<button id="connection-menu-button" class="primary" popovertarget="connection-menu">Connect <span aria-hidden="true">&#9662;</span></button><div id="connection-menu" class="connection-menu" popover aria-label="Connection options"><button id="connect" popovertarget="connection-menu" popovertargetaction="hide">Connect<small>Step through the handshake</small></button><button id="skip" popovertarget="connection-menu" popovertargetaction="hide">Start Connected<small>Skip the handshake</small></button></div>':''}<div id="${id}-app-send"><button id="${id}-submit" class="primary" data-tooltip="Submit application bytes to TCP">Send Data</button><p id="${id}-submitted"></p></div><div id="${id}-app-read"><div class="read-controls"><button id="${id}-read" data-tooltip="Read contiguous bytes received by TCP">Read Data</button><label for="${id}-read-size">Bytes</label><input id="${id}-read-size" type="number" min="1" max="256" value="4"></div><p id="${id}-readings"></p></div></div></section><div id="${id}-transfer" class="layer-transfer"></div><section class="tcp-layer">${layerSettings(id,'TCP Transport')}<h3 class="layer-title tcp-title"><svg class="tcp-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4"/></svg><span>TCP Transport</span></h3><section id="${id}-sender" class="window-section"><div class="window-heading"><h3>Sender window</h3><small id="${id}-send-buffer"></small></div>${track(id,'send')}<div class="host-legend"><span class="acked">Acknowledged</span><span class="flight" tabindex="0" data-tooltip="Sent but not yet acknowledged">In flight</span><span class="eligible">Eligible</span><span class="outside">Outside window</span></div><div class="transport-control-area"><div class="rto-controls"><span id="${id}-rto"></span><button id="${id}-tick" data-tooltip="Advance both hosts by one simulated second">+1 s</button></div><div id="${id}-send-actions" class="tcp-actions"><button id="${id}-send" data-tooltip="Send application bytes from TCP">Send Segment</button><button id="${id}-retransmit" data-tooltip="Resend the earliest unacknowledged segment">Retransmit</button></div></div></section><section id="${id}-receiver" class="window-section"><div class="window-heading"><h3>Receive window</h3><small id="${id}-receive-buffer"></small></div>${track(id,'receive')}<div class="host-legend"><span class="unread" tabindex="0" data-tooltip="Contiguous received bytes awaiting application reading">Unread</span><span class="ooo" tabindex="0" data-tooltip="Out-of-order bytes buffered until the missing earlier bytes arrive">Out of order</span><span class="missing">Missing</span></div><div class="transport-control-area ack-tools"><button id="${id}-send-ack" data-tooltip="Send the current cumulative acknowledgment into transit">Send ACK</button><div class="tcp-actions"><button id="${id}-flush" data-tooltip="Expire the delayed acknowledgment timer">ACK timer</button></div></div></section></section></article>`).join('');
 $('preset').innerHTML=presets.map((p,i)=>`<option value="${i}">${p.name}</option>`).join('');
 function stop(){clearInterval(timer);timer=null;$('auto').textContent='Auto';}
 function sync(){for(const [k] of fields)$('cfg-'+k).value=s.c[k];$('ack-mode').value=s.c.ackMode;$('auto-read').checked=s.c.autoRead;}
 function fresh(c){stop();closeIntercept();interceptArmed=false;inspected.clear();s=E.create(c);selected=null;lastAnimated=0;$('error').textContent='';sync();render();}
 function configure(){try{const c={...s.c,ackMode:$('ack-mode').value};for(const [k] of fields)c[k]=$('cfg-'+k).value===''?NaN:Number($('cfg-'+k).value);fresh(c);}catch(e){stop();$('error').textContent=e.message;}}
 for(const [k] of fields)$('cfg-'+k).addEventListener('change',configure);$('ack-mode').onchange=configure;
 function act(fn){if($('error').textContent)return;try{fn();selected=null;render();}catch(e){stop();$('error').textContent=e.message;}}
 function options(id,list,label){const old=$(id).value;$(id).innerHTML=list.length?list.map(p=>`<option value="${p.id}">${label(p)}</option>`).join(''):'<option value="">None pending</option>';if(list.some(p=>String(p.id)===old))$(id).value=old;}
 function transitPackets(){return s.packets.filter(p=>['pending','queued'].includes(p.status));}
 function closeIntercept(){intercepted=null;if($('intercept-dialog').open)$('intercept-dialog').close();}
 function openIntercept(p){
  stop();interceptArmed=false;intercepted=p.id;inspected.add(p.id);
  $('intercept-route').textContent=`Host ${p.from} - ${p.from==='A'?'Client':'Server'} → Host ${p.to} - ${p.to==='A'?'Client':'Server'}${p.retransmission?' | Retransmission':''}`;
  $('intercept-seq').textContent=String(p.seq);$('intercept-ack').textContent=p.ack===null?'Not set':String(p.ack);$('intercept-flags').textContent=p.flags;
  for(const flag of ['CWR','ECE','URG','ACK','PSH','RST','SYN','FIN']){const active=p.flags.split(/[, ]+/).includes(flag),cell=$('intercept-flag-'+flag.toLowerCase());cell.setAttribute('class','wire-field wire-flag'+(active?' flag-set':''));cell.setAttribute('aria-label',flag+(active?' set':' not set'));cell.setAttribute('tabindex','0');}
  $('intercept-payload').textContent=p.len?`${p.len} bytes | ${p.seq}–${p.seq+p.len-1}`:'0 bytes (pure ACK)';
  $('intercept-explanation').textContent=p.len?`These bytes have left Host ${p.from}, but have not reached Host ${p.to}. Deliver passes them to TCP; Drop simulates network loss.`:`ACK ${p.ack} reports the next byte Host ${p.from} expects. Host ${p.to} will process it only after delivery.`;
  if(!$('intercept-dialog').open)$('intercept-dialog').showModal();
 }
 function updateIntercept(){
  const pending=transitPackets();
  if(intercepted!==null&&!pending.some(p=>p.id===intercepted))closeIntercept();
  if(intercepted===null){const next=pending.find(p=>!inspected.has(p.id));if(next&&($('auto-intercept').checked||interceptArmed))openIntercept(next);}
  $('intercept-next').textContent=interceptArmed?'Cancel intercept':'Intercept next';
  $('intercept-next').setAttribute('aria-pressed',String(interceptArmed));
  $('intercept-status').textContent=intercepted!==null?'Playback paused for packet inspection.':interceptArmed?'Waiting for the next data segment or ACK.':'';
 }
 $('auto-intercept').onchange=()=>{interceptArmed=false;updateIntercept();};
 $('intercept-next').onclick=()=>{
  if(interceptArmed){interceptArmed=false;}else{const pending=transitPackets(),next=pending.find(p=>!inspected.has(p.id))||pending[0];if(next)openIntercept(next);else interceptArmed=true;}
  updateIntercept();
 };
 $('intercept-close').onclick=()=>{closeIntercept();$('intercept-status').textContent='Packet left in transit.';};
 $('intercept-dialog').addEventListener('cancel',e=>{e.preventDefault();closeIntercept();$('intercept-status').textContent='Packet left in transit.';});
 for(const action of ['deliver','drop'])$('intercept-'+action).onclick=()=>{const id=intercepted;closeIntercept();if(id!==null)act(()=>E[action](s,id));};
 function windowView(id,type,ev){
  const h=s.hosts[id],peer=s.hosts[E.other(id)],send=type==='send',live=E.established(s),base=send?h.start:peer.start,start=send?h.una:h.rcv,end=send?h.right:peer.start+peer.size,next=send?h.nxt:h.read;
  const prefix=id+'-'+type,stream=send?id:E.other(id),range=ev?.stream===stream?ev.range:null;
  $(prefix+'-pending').hidden=live;$(prefix+'-visual').hidden=!live;
  if(!live)return;
  const count=Math.max((send?h.size:peer.size),end-base,next-base)+1,cellWidth=Math.max(34,String(base+count).length*7+10),pitch=cellWidth+4;
  $(prefix+'-track').style.setProperty('--byte-width',cellWidth+'px');
  $(prefix+'-track').style.width=(count*pitch+105)+'px';
  $(prefix+'-cells').innerHTML=Array.from({length:count},(_,i)=>{
   const n=base+i;let cls,label;
   if(send){cls=n<h.una?'acked':n<h.nxt?'flight':n<h.right?'eligible':'outside';label=n>=h.start+h.submitted?'unsubmitted':n<h.una?'ACKed':n<h.nxt?'sent':n<h.right?'ready':'waiting';}
   else{cls=n<h.read?'consumed':h.buffer.includes(n)?(n<h.rcv?'unread':'ooo'):'outside';label=n<h.read?'read':h.buffer.includes(n)?(n<h.rcv?'unread':'buffered'):n>=h.rcv&&n<end?'pending':'outside';if(n>=h.rcv&&n<end&&!h.buffer.includes(n)&&h.buffer.some(x=>x>n)){cls+=' missing';label='missing';}}
   if(send&&s.packets.some(p=>p.from===id&&p.status==='lost'&&p.len&&n>=p.seq&&n<p.seq+p.len&&n>=h.una)){cls+=' missing';}
   if(range&&n>=range[0]&&n<range[1]){cls+=' selected';if(!send&&ev.kind==='duplicate-discard'&&ev.host===id&&!selected&&ev.id>lastAnimated)cls+=' duplicate-flash';}
   const caption=label==='unsubmitted'?'not sent':label;
   const description=label==='unsubmitted'?'not yet submitted by the application to TCP':label;
   return `<div class="byte ${cls}" tabindex="0" data-tooltip="Byte ${n}: ${description}">${n}<small>${caption}</small></div>`;
  }).join('');
  $(prefix+'-outline').hidden=!send;$(prefix+'-outline').style.left=((start-base)*pitch-2)+'px';$(prefix+'-outline').style.width=(Math.max(0,end-start)*pitch+2)+'px';
  $(prefix+'-start').style.left=((start-base)*pitch)+'px';$(prefix+'-start').textContent=(send?'SND.UNA ':'RCV.NXT ')+start;
  $(prefix+'-next').style.left=((next-base)*pitch)+'px';$(prefix+'-next').textContent=(send?'SND.NXT ':'App read cursor ')+next;
  $(prefix+'-note').textContent=send?'':(h.buffer.length>E.readable(h)?`${h.buffer.length-E.readable(h)} bytes waiting for a gap`:'');
  const scroll=$(prefix+'-scroll'),target=Math.max(0,(start-base)*pitch-30);
  if(!selected&&(target<scroll.scrollLeft||target>scroll.scrollLeft+scroll.clientWidth*.6))scroll.scrollTo({left:target,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 }
 function render(){
  const live=E.established(s),ev=s.events.find(e=>e.id===selected)||s.events.at(-1),newEvent=ev&&ev.id>lastAnimated&&!selected;
  for(const id of ['A','B']){
   const h=s.hosts[id],sender=E.enabled(s,id),receiver=id==='B'||s.c.duplex;
   $(id+'-state').textContent=h.state;$(id+'-app-send').hidden=$(id+'-sender').hidden=!sender;$(id+'-app-read').hidden=$(id+'-receiver').hidden=!receiver;
   $(id+'-submitted').textContent=live?`${h.submitted} of ${h.size} bytes submitted`: '';
   $(id+'-readings').textContent=live?`${E.readable(h)} bytes unread · ${h.consumed} read`:'';
   $(id+'-send-buffer').textContent=live?`${h.submitted-(h.una-h.start)} bytes buffered · MSS ${h.mss}`:'';
   $(id+'-receive-buffer').textContent=live?`${h.buffer.length} bytes buffered`:'';
   const retry=s.events.at(-1),timeout=s.events.at(-2),resending=retry?.kind==='retransmit'&&retry.host===id&&timeout?.kind==='timeout'&&timeout.host===id&&h.deadline===s.time+h.rto;
   $(id+'-rto').textContent=resending?`Resending ${retry.seq}, ${retry.len} bytes`:!live?'Retransmission timer: pending':h.deadline===null?'Retransmission timer: idle':`Timeout in ${h.deadline-s.time} s (simulated) | SEQ ${h.una}`;
   $(id+'-rto').setAttribute('class',resending?'rto-resending':'');
   $(id+'-tick').disabled=!live||!['A','B'].some(key=>s.hosts[key].deadline!==null);
   windowView(id,'send',ev);windowView(id,'receive',ev);
   $(id+'-submit').disabled=!live||!sender||h.submitted===h.size;$(id+'-send').disabled=!E.canSend(s,id);$(id+'-read').disabled=!live||!E.readable(h);$(id+'-retransmit').disabled=!live||!E.outstanding(s,id).length;$(id+'-flush').disabled=!live||!h.delayed;$(id+'-send-ack').disabled=!live;$(id+'-flush').hidden=s.c.ackMode!=='delayed';
   $(id+'-transfer').innerHTML=newEvent&&ev.host===id&&['submit','read'].includes(ev.kind)?`<span class="token ${ev.kind==='read'?'reading':''}" aria-hidden="true"></span>${ev.kind==='read'?'TCP ↑ Application':'Application ↓ TCP'}`:'';
  }
  $('duplex').textContent='Full Duplex: '+(s.c.duplex?'ON':'OFF');$('duplex').setAttribute('aria-pressed',String(s.c.duplex));$('duplex').disabled=s.phase!==0;
  $('B-send-actions').hidden=!s.c.duplex;
  for(const [k] of fields)$('cfg-'+k).disabled=s.phase!==0||(!s.c.duplex&&['sizeB','mssB'].includes(k));$('ack-mode').disabled=s.phase!==0;
  const complete=live&&['A',...(s.c.duplex?['B']:[])].every(id=>s.hosts[id].una===s.hosts[id].start+s.hosts[id].size);
  $('status').textContent=!live?(s.phase?'Handshake in progress':'Disconnected'):complete?'All data acknowledged':!['A','B'].some(id=>E.canSend(s,id))&&['A','B'].some(id=>E.readable(s.hosts[id]))?'Buffered data awaits application reads':'Connection established';
  $('connection-menu-button').disabled=$('connect').disabled=$('skip').disabled=s.phase!==0;$('step').disabled=$('auto').disabled=s.phase===0;
  $('explanation').textContent=ev?ev.explanation:'Click Connect to send SYN, then Next Step or Auto to finish the handshake. Start Connected skips the handshake animation.';
  const packetEvent=ev?.packetId,visible=s.packets.filter(p=>p.status!=='piggybacked');
  $('packets').innerHTML=visible.map(p=>`<button class="packet ${p.from==='B'?'reverse':''} ${p.kind==='ack'?'ack-packet':''} ${['lost','discarded'].includes(p.status)?'lost':''} ${p.id===packetEvent?'active':''} ${newEvent&&p.id===packetEvent&&['send','receive','ack','retransmit','handshake'].includes(ev.kind)?'moving':''}" data-packet="${p.id}" aria-label="Host ${p.from} to Host ${p.to}, ${p.kind}, ${p.status}">${p.flags} · SEQ=${p.seq} · ACK=${p.ack??'—'} · LEN=${p.len}${p.len?' · bytes '+p.seq+'–'+(p.seq+p.len-1):''}<small> · ${p.status==='discarded'?'dropped at receiver (duplicate data)':p.status==='received'?'received at TCP':p.status==='pending'?'in transit':p.status}${p.piggyback?' · piggybacked ACK':''}${p.retransmission?' · retransmission':''}</small></button>`).join('')||'<p class="hint">TCP packets will appear here after Connect.</p>';
  $('log').innerHTML=s.events.map(e=>`<tr class="${ev?.id===e.id?'active':''}"><td><button data-event="${e.id}" aria-label="Inspect step ${e.id}">${e.id}</button></td><td>${e.kind}</td><td>${e.from===e.to?'Host '+e.host:e.from+' → '+e.to}</td><td>${e.flags}</td><td>${e.seq??'—'}</td><td>${e.ack??'—'}</td><td>${e.len}</td><td>${e.explanation}</td></tr>`).join('');
  $('snapshot').textContent=ev?`Step ${ev.id} snapshot · `+['A','B'].map(id=>{const h=ev.state[id];return `${id}: ${h.state}${h.state==='ESTABLISHED'?`, UNA ${h.una}, NXT ${h.nxt}, RCV.NXT ${h.rcv}, buffered ${h.buffer}, consumed ${h.consumed}`:''}`;}).join(' · '):'Select a packet or log entry to inspect its bytes and state. Host panels show live state.';
  const data=s.packets.filter(p=>p.len&&p.status==='pending'),acks=s.packets.filter(p=>p.kind==='ack'&&p.status==='queued');
  function cards(target,list,ack){
   const deliverId=ack?'deliver-ack':'deliver',dropId=ack?'drop-ack':'drop';
   const icon=(paths)=>`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
   $(target).innerHTML=list.map((p,i)=>`<article class="transit-card ${p?'':'empty'}"><span class="transit-packet-icon">${icon(ack?'<path d="M20 7 10 17l-5-5"/><rect x="2" y="3" width="20" height="18" rx="3"/>':'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 13h10M7 16h6"/>')}</span><div class="transit-card-copy">${p?`<strong>Host ${p.from} &rarr; Host ${p.to}</strong><span>${ack?'ACK '+p.ack:'SEQ '+p.seq+' &middot; '+p.len+' bytes'}</span>`:'<span>No '+(ack?'ACKs':'data segments')+' in transit</span>'}</div><div class="transit-card-actions"><button id="${deliverId}${i?'-'+p.id:''}" aria-label="Deliver ${ack?'ACK':'segment'}" data-tooltip="Deliver to the receiving host" ${p?'':'disabled'}>${icon('<path d="M4 12h14m-5-5 5 5-5 5M21 5v14"/>')}</button><button id="${dropId}${i?'-'+p.id:''}" aria-label="Drop ${ack?'ACK':'segment'}" data-tooltip="Drop packet to simulate network loss" ${p?'':'disabled'}>${icon('<path d="m8 8 8 8m0-8-8 8"/><circle cx="12" cy="12" r="9"/>')}</button></div></article>`).join('');
   if(list.length)$(deliverId).disabled=$(dropId).disabled=false;
   list.forEach((p,i)=>{const suffix=i?'-'+p.id:'';$(deliverId+suffix).onclick=()=>act(()=>E.deliver(s,p.id));$(dropId+suffix).onclick=()=>act(()=>E.drop(s,p.id));});
  }
  cards('data-cards',data,false);cards('ack-cards',acks,true);
  if(!selected){$('packets').scrollTop=$('packets').scrollHeight;const log=$('log').closest('.log-scroll');log.scrollTop=log.scrollHeight;}
  lastAnimated=s.events.length;
  updateIntercept();
 }
 document.addEventListener('click',e=>{const b=e.target.closest('[data-event], [data-packet]');if(!b)return;const ev=b.dataset.event?s.events.find(x=>x.id===Number(b.dataset.event)):[...s.events].reverse().find(x=>x.packetId===Number(b.dataset.packet));if(ev){stop();selected=ev.id;render();}});
 for(const id of ['A','B']){
  $(id+'-submit').onclick=()=>act(()=>E.submit(s,id));$(id+'-send').onclick=()=>act(()=>E.send(s,id));$(id+'-read').onclick=()=>{try{E.read(s,id,Number($(id+'-read-size').value));$('error').textContent='';selected=null;render();}catch(e){$('error').textContent=e.message;}};
  $(id+'-send-ack').onclick=()=>act(()=>E.repeatAck(s,id));
  $(id+'-tick').onclick=()=>act(()=>E.advanceTime(s));
  $(id+'-retransmit').onclick=()=>act(()=>E.retransmit(s,id));$(id+'-flush').onclick=()=>act(()=>E.flush(s,id));
 }
 $('connect').onclick=()=>{$('connection-menu').hidePopover?.();act(()=>E.handshake(s));};$('skip').onclick=()=>{$('connection-menu').hidePopover?.();act(()=>{while(!E.established(s))E.handshake(s);lastAnimated=s.events.length;});};$('step').onclick=()=>act(()=>E.step(s));
 function play(){if($('error').textContent)return;timer=setInterval(()=>{const n=s.events.length,t=s.time;act(()=>E.step(s));if(s.events.length===n&&s.time===t){stop();$('explanation').textContent+=' Auto paused: choose a manual action or read the buffered application data.';}},Number($('speed').value));$('auto').textContent='Pause';}
 $('auto').onclick=()=>{if(timer)stop();else play();};$('speed').onchange=()=>{if(timer){stop();play();}};
 $('duplex').onclick=()=>act(()=>E.setMode(s,!s.c.duplex));$('auto-read').onchange=()=>{s.c.autoRead=$('auto-read').checked;};
 $('reset').onclick=()=>fresh(s.c);$('latest').onclick=()=>{selected=null;render();};
 $('preset').onchange=()=>{$('objective').textContent=presets[$('preset').value].objective;};
 $('load').onclick=()=>{
  const p=presets[$('preset').value];fresh(p.config);$('objective').textContent=p.objective;if(!p.setup)return;
  act(()=>{while(!E.established(s))E.handshake(s);E.submit(s,'A');if(s.c.duplex)E.submit(s,'B');
   if(p.setup==='loss'){const first=E.send(s,'A'),middle=E.send(s,'A');E.send(s,'A');E.deliver(s,first.id);if(s.c.ackMode==='manual')E.repeatAck(s,'B');E.deliver(s,s.packets.find(x=>x.kind==='ack'&&x.status==='queued').id);E.drop(s,middle.id);}
   if(p.setup==='acknowledged'||p.setup==='piggyback'){E.deliver(s,E.send(s,'A').id);if(p.setup==='acknowledged'){if(s.c.ackMode==='manual')E.repeatAck(s,'B');E.deliver(s,s.packets.find(x=>x.kind==='ack'&&x.status==='queued').id);}}
   lastAnimated=s.events.length;
  });
 };
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
 $('objective').textContent=presets[0].objective;sync();render();
})();
