(()=>{
 'use strict';
 const E=window.TCPSequence,$=id=>document.getElementById(id),presets=window.TCPScenarios;
 let s=E.create(),selected=null,timer=null,lastAnimated=0;
 let interceptArmed=false,intercepted=null;const inspected=new Set();
 const fields=[['a','Host A ISN',0,1000000],['size','A message bytes',1,256],['mss','A MSS',1,64],['b','Host B ISN',0,1000000],['sizeB','B message bytes',1,256],['mssB','B MSS',1,64]];
 const setting=(key)=>{const [,label,min,max]=fields.find(f=>f[0]===key);return `<div id="field-${key}" class="field"><label for="cfg-${key}">${label}</label><input id="cfg-${key}" type="number" min="${min}" max="${max}" step="1" value="${s.c[key]}"></div>`;};
 const layerSettings=(id,layer)=>{const app=layer==='Application',name=id+'-'+(app?'app':'tcp')+'-settings',keys=app?[id==='A'?'size':'sizeB']:(id==='A'?['a','mss']:['b','mssB']);return `<button id="${name}-button" class="layer-settings-button" popovertarget="${name}" aria-label="Host ${id} ${layer} settings">...</button><div id="${name}" class="layer-settings-overlay" popover aria-labelledby="${name}-title"><div class="settings-heading"><h3 id="${name}-title">Host ${id} &middot; ${layer}</h3><button popovertarget="${name}" popovertargetaction="hide" aria-label="Close settings">&times;</button></div>${keys.map(setting).join('')}<p class="hint">Reset the connection to change settings.</p></div>`;};
 const track=(id,type)=>`<div id="${id}-${type}-pending" class="pending-window" role="img" aria-label="Byte buffer awaiting connection"><div class="pending-byte-slots" aria-hidden="true">${Array.from({length:64},()=>'<span class="pending-byte-slot"></span>').join('')}</div></div><div id="${id}-${type}-visual"><div class="stream-scroll" id="${id}-${type}-scroll" tabindex="0" role="region" aria-label="Host ${id} ${type} byte stream"><div id="${id}-${type}-track" class="byte-track ${type==='receive'?'receive-track':''}"><div id="${id}-${type}-cells" class="cells"></div><div id="${id}-${type}-outline" class="window-outline"></div><div id="${id}-${type}-start" class="window-pointer"></div><div id="${id}-${type}-next" class="window-pointer next"></div></div></div><p id="${id}-${type}-note" class="track-note"></p></div>`;
 $('layered-hosts').innerHTML=['A','B'].map(id=>`<article class="panel layered-host" id="host-${id}"><div class="host-heading"><h2 class="host-identity"><svg class="host-icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${id==='A'?'<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21h8M12 16v5M6 12h12"/>':'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M4 9h16M4 16h16M8 5.5h.01M8 12.5h.01M8 19h.01M12 5.5h5M12 12.5h5M12 19h5"/>'}</svg><span>Host ${id} - ${id==='A'?'Client':'Server'}</span></h2><span id="${id}-state"></span><div class="host-connection-actions">${id==='A'?'<button id="connection-menu-button" class="primary" popovertarget="connection-menu">Connect <span aria-hidden="true">&#9662;</span></button><div id="connection-menu" class="connection-menu" popover aria-label="Connection options"><button id="connect" popovertarget="connection-menu" popovertargetaction="hide">Connect<small>Step through the handshake</small></button><button id="skip" popovertarget="connection-menu" popovertargetaction="hide">Start Connected<small>Skip the handshake</small></button></div>':''}<button id="${id}-close-menu-button" popovertarget="${id}-close-menu" hidden>Close <span aria-hidden="true">&#9662;</span></button><div id="${id}-close-menu" class="connection-menu" popover aria-label="Host ${id} close options"><button id="${id}-close" popovertarget="${id}-close-menu" popovertargetaction="hide">Close<small>Step through FIN teardown</small></button><button id="${id}-close-now" popovertarget="${id}-close-menu" popovertargetaction="hide">Close immediately<small>Skip the teardown animation</small></button></div>${id==='A'?'<button id="handshake-ack" hidden>Send ACK</button>':''}${id==='B'?'<button id="handshake-syn-ack" hidden>Send SYN-ACK</button>':''}<button id="${id}-fin-step" hidden>Send ACK</button><span id="${id}-fin-help" class="fin-choice-help" hidden><button class="fin-info-button" aria-label="Why are there two close responses?" aria-describedby="${id}-fin-tooltip"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18h6M10 21h4M8.5 14.5a6 6 0 1 1 7 0C14.5 15.2 14.5 16 14.5 18h-5c0-2 0-2.8-1-3.5Z" stroke-linecap="round" stroke-linejoin="round"/></svg></button><span id="${id}-fin-tooltip" class="fin-choice-tooltip" role="tooltip"><strong>Two independent decisions</strong><span><b>Send ACK:</b> Acknowledge the peer's FIN. Your sending side stays open, so you can send more data and close later.</span><span><b>Send FIN + ACK:</b> Acknowledge the peer's FIN and close your sending side now, combining both actions in one segment.</span><span>Unread receive-buffer data does not decide which option to use.</span></span></span></div></div><p id="${id}-close-status" class="close-status" role="status" hidden></p><section class="app-layer">${layerSettings(id,'Application')}<h3 class="layer-title"><svg class="app-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01M7 13h6M7 16h10"/></svg><span>Application</span></h3><div class="app-actions"><div id="${id}-app-send"><button id="${id}-submit" class="primary" data-tooltip="Submit application bytes to TCP">Send Data</button><p id="${id}-submitted"></p></div><div id="${id}-app-read"><div class="read-controls"><button id="${id}-read" data-tooltip="Read contiguous bytes received by TCP">Read Data</button><label for="${id}-read-size">Bytes</label><input id="${id}-read-size" type="number" min="1" max="256" value="4"></div><p id="${id}-readings"></p></div></div></section><div class="buffer-bridge-row"><div id="${id}-send-bridge" class="recv-bridge send-bridge"><div class="recv-buffer" role="status" aria-label="Host ${id} send buffer"><span class="recv-buffer-icon" aria-hidden="true"></span><strong>Send buffer</strong><span id="${id}-send-bytes">0 bytes</span></div><div id="${id}-send-flow" class="buffer-flow" aria-hidden="true"></div></div><div id="${id}-recv-bridge" class="recv-bridge"><div class="recv-buffer" role="status" aria-label="Host ${id} receive buffer"><span class="recv-buffer-icon" aria-hidden="true"></span><strong>Recv buffer</strong><span id="${id}-recv-bytes">0 bytes</span></div><div id="${id}-recv-flow" class="buffer-flow" aria-hidden="true"></div></div></div><div id="${id}-transfer" class="layer-transfer"></div><section class="tcp-layer">${layerSettings(id,'TCP Transport')}<h3 class="layer-title tcp-title"><svg class="tcp-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4"/></svg><span>TCP Transport</span></h3><section id="${id}-sender" class="window-section"><div class="window-heading"><h3>Sender window</h3><small id="${id}-send-buffer"></small></div>${track(id,'send')}<div class="host-legend"><span class="acked">Acknowledged</span><span class="flight" tabindex="0" data-tooltip="Sent but not yet acknowledged">Unacknowledged</span><span class="eligible">Eligible</span><span class="outside">Outside window</span></div><div class="transport-control-area"><div class="rto-controls"><span id="${id}-rto"></span><span id="${id}-dup-acks"></span><button id="${id}-tick" data-tooltip="Advance both hosts by one simulated second">+1 s</button></div><div id="${id}-send-actions" class="tcp-actions"><button id="${id}-send" data-tooltip="Send application bytes from TCP">Send Segment</button><button id="${id}-retransmit" data-tooltip="Resend the earliest unacknowledged segment">Retransmit</button></div></div></section><section id="${id}-receiver" class="window-section"><div class="window-heading"><h3>Receive window</h3><small id="${id}-receive-buffer"></small></div>${track(id,'receive')}<div class="host-legend"><span class="acked">Received</span><span class="ooo" tabindex="0" data-tooltip="Out-of-order bytes buffered until the missing earlier bytes arrive">Waiting for gap</span><span class="missing">Missing</span></div><div class="transport-control-area ack-tools"><button id="${id}-send-ack" data-tooltip="Send the current cumulative acknowledgment into transit">Send ACK</button><div class="tcp-actions"><button id="${id}-flush" data-tooltip="Expire the delayed acknowledgment timer">ACK timer</button></div></div></section></section></article>`).join('');
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
  const h=s.hosts[id],peer=s.hosts[E.other(id)],send=type==='send',live=s.phase>=3,base=send?h.start:peer.start,start=send?h.una:h.rcv,end=send?h.right:peer.start+peer.size,next=send?h.nxt:h.read;
  const prefix=id+'-'+type,stream=send?id:E.other(id),range=ev?.stream===stream?ev.range:null;
  $(prefix+'-pending').hidden=live;$(prefix+'-visual').hidden=!live;
  if(!live){const pendingCount=(send?h.size:peer.size)+1;$(prefix+'-pending').style.setProperty('--byte-width',Math.max(34,String(base+pendingCount).length*7+10)+'px');return;}
  const count=Math.max((send?h.size:peer.size),end-base,next-base)+1,cellWidth=Math.max(34,String(base+count).length*7+10),pitch=cellWidth+4;
  $(prefix+'-track').style.setProperty('--byte-width',cellWidth+'px');
  $(prefix+'-track').style.width=(count*pitch+105)+'px';
  $(prefix+'-cells').innerHTML=Array.from({length:count},(_,i)=>{
   const n=base+i;let cls,label;
   if(send){cls=n<h.una?'acked':n<h.nxt?'flight':n<h.right?'eligible':'outside';label=n>=h.start+h.submitted?'unsubmitted':n<h.una?'ACKed':n<h.nxt?'sent':n<h.right?'ready':'waiting';}
   else{cls=n<h.rcv?'acked':h.buffer.includes(n)?'ooo':'outside';label=n<h.rcv?'received':h.buffer.includes(n)?'buffered':n>=h.rcv&&n<end?'pending':'outside';if(n>=h.rcv&&n<end&&!h.buffer.includes(n)&&h.buffer.some(x=>x>n)){cls+=' missing';label='missing';}}
   if(send&&s.packets.some(p=>p.from===id&&p.status==='lost'&&p.len&&n>=p.seq&&n<p.seq+p.len&&n>=h.una)){cls+=' missing';}
   if(range&&n>=range[0]&&n<range[1]){cls+=' selected';if(send&&ev.kind==='fast-retransmit'&&ev.host===id&&!selected&&ev.id>lastAnimated)cls+=' duplicate-flash';if(!send&&ev.kind==='duplicate-discard'&&ev.host===id&&!selected&&ev.id>lastAnimated)cls+=' duplicate-flash';}
   const caption=label==='unsubmitted'?'not sent':label;
   const description=label==='unsubmitted'?'not yet submitted by the application to TCP':label==='received'?'Received by TCP':label==='buffered'?'Buffered: waiting for missing bytes':label==='sent'?'Sent: awaiting acknowledgment (may already be received)':label==='pending'?'Not yet received':label;
   return `<div class="byte ${cls}" tabindex="0" data-tooltip="Byte ${n}: ${description}">${n}<small>${caption}</small></div>`;
  }).join('');
  $(prefix+'-outline').hidden=!send;$(prefix+'-outline').style.left=((start-base)*pitch-2)+'px';$(prefix+'-outline').style.width=(Math.max(0,end-start)*pitch+2)+'px';
  $(prefix+'-start').style.left=((start-base)*pitch)+'px';$(prefix+'-start').textContent=(send?'SND.UNA ':'RCV.NXT ')+start;
  $(prefix+'-next').style.left=((next-base)*pitch)+'px';$(prefix+'-next').textContent=send?'SND.NXT '+next:'';
  $(prefix+'-note').textContent=send?'':`${h.buffer.length-E.readable(h)} bytes buffered: waiting for missing bytes`;
  const scroll=$(prefix+'-scroll'),target=Math.max(0,(start-base)*pitch-30);
  if(!selected&&(target<scroll.scrollLeft||target>scroll.scrollLeft+scroll.clientWidth*.6))scroll.scrollTo({left:target,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 }
 function render(){
  const live=E.established(s),ev=s.events.find(e=>e.id===selected)||s.events.at(-1),newEvent=ev&&ev.id>lastAnimated&&!selected;
  for(const id of ['A','B']){
   const h=s.hosts[id],sender=E.enabled(s,id),receiver=id==='B'||s.c.duplex||s.phase>=4;
   $(id+'-state').textContent=h.state;$(id+'-app-send').hidden=$(id+'-sender').hidden=!sender;$(id+'-app-read').hidden=$(id+'-receiver').hidden=!receiver;
   $(id+'-submitted').textContent=s.phase>=3?`${h.submitted} bytes submitted`: '';
   $(id+'-readings').textContent=s.phase>=3?`${h.consumed} bytes read`:'';
   $(id+'-send-bridge').hidden=!sender;
   const sendBytes=s.phase>=3?Math.max(0,h.submitted-(h.una-h.start)):0;
   $(id+'-send-bytes').textContent=`${sendBytes} bytes`;
   $(id+'-send-bridge').setAttribute('data-filled',String(sendBytes>0));
   $(id+'-recv-bridge').hidden=!receiver;
   $(id+'-recv-bytes').textContent=`${s.phase>=3?E.readable(h):0} bytes`;
   $(id+'-recv-bridge').setAttribute('data-filled',String(s.phase>=3&&E.readable(h)>0));
   $(id+'-send-buffer').textContent=s.phase>=3?`${sendBytes} bytes buffered · MSS ${h.mss}`:'';
   $(id+'-receive-buffer').textContent=s.phase>=3?`${h.buffer.length-E.readable(h)} bytes waiting for gap`:'';
   const retry=s.events.at(-1),timeout=s.events.at(-2),fast=retry?.kind==='fast-retransmit'&&retry.host===id&&h.deadline===s.time+h.rto,resending=retry?.kind==='retransmit'&&retry.host===id&&timeout?.kind==='timeout'&&timeout.host===id&&h.deadline===s.time+h.rto;
   $(id+'-dup-acks').textContent=E.active(s)?`Duplicate ACKs: ${h.dupAcks}/3`:'';
   $(id+'-rto').textContent=fast?`Fast retransmit: resending ${retry.seq}, ${retry.len} bytes`:resending?`Resending ${retry.seq}, ${retry.len} bytes`:!E.active(s)?'Retransmission timer: inactive':h.deadline===null?'Retransmission timer: idle':`Timeout in ${h.deadline-s.time} s (simulated) | SEQ ${h.una}`;
   $(id+'-rto').setAttribute('class',(resending||fast)?'rto-resending':'');
   $(id+'-tick').disabled=!E.active(s)||!['A','B'].some(key=>s.hosts[key].deadline!==null);
   windowView(id,'send',ev);windowView(id,'receive',ev);
   const closeVisible=live||(s.phase===4&&id!==s.closer&&[1,2].includes(s.closeStep)),closeReady=E.canClose(s,id);
   const unsent=Math.max(0,h.start+h.submitted-h.nxt),unacked=E.outstanding(s,id).reduce((n,p)=>n+p.seq+p.len-Math.max(p.seq,h.una),0);
   const closeStatus=$(id+'-close-status');closeStatus.hidden=!(s.phase===4&&closeVisible&&!closeReady);
   closeStatus.textContent=unsent?unsent+' bytes still need transmission. Use Send Segment, deliver them, then send and deliver the peer ACK.':unacked?unacked+' bytes await acknowledgment. Deliver the data and the peer ACK to enable Send FIN + ACK.':'Deliver remaining in-transit packets to enable Send FIN + ACK.';
   $(id+'-close-menu-button').hidden=!closeVisible;$(id+'-close-menu-button').disabled=!closeReady;
   $(id+'-close-menu-button').title=closeReady?'Close options for Host '+id:'Send and acknowledge submitted bytes and deliver pending packets before closing';
   $(id+'-close').disabled=!closeReady;$(id+'-close-now').disabled=!closeReady||s.phase===4;
   $(id+'-close-menu-button').textContent=s.phase===4?'Send FIN + ACK':'Close \u25be';
   if(s.phase===4){$(id+'-close-menu-button').removeAttribute('popovertarget');$(id+'-close-menu').hidePopover?.();}else{$(id+'-close-menu-button').setAttribute('popovertarget',id+'-close-menu');}
   $(id+'-close-menu-button').onclick=s.phase===4?()=>{stop();act(()=>E.close(s,id));}:null;
   $(id+'-close').innerHTML=(s.phase===4?'Send FIN + ACK':'Close')+'<small>Step through FIN teardown</small>';

   $(id+'-fin-help').hidden=!(s.phase===4&&s.closeStep===1&&id!==s.closer);
   const finAction=s.phase===4&&((s.closeStep===1&&id!==s.closer)||([3,4].includes(s.closeStep)&&id===s.closer));
   $(id+'-fin-step').hidden=!finAction;$(id+'-fin-step').textContent=s.closeStep===4?'Finish TIME-WAIT':'Send ACK';
   $(id+'-submit').disabled=!E.sendOpen(s,id)||!sender;$(id+'-send').disabled=!E.canSend(s,id);$(id+'-read').disabled=s.phase<3||!E.readable(h);$(id+'-retransmit').disabled=!E.active(s)||!E.outstanding(s,id).length;$(id+'-flush').disabled=!E.active(s)||!h.delayed;$(id+'-send-ack').disabled=!(live||(s.phase===4&&s.closeStep===2));$(id+'-flush').hidden=s.c.ackMode!=='delayed';
   $(id+'-transfer').textContent='';
   for(const kind of ['send','recv']){
    const flow=$(id+'-'+kind+'-flow');
    if(!live)flow.innerHTML='';
    if(newEvent&&ev.host===id&&ev.kind===(kind==='send'?'submit':'read')){
     const count=ev.range[1]-ev.range[0];
     flow.innerHTML=Array.from({length:Math.min(count,6)},(_,i)=>`<span class="buffer-byte-flight" style="--delay:${i*90}ms"></span>`).join('')+`<span class="buffer-flight-label">${count} B ${kind==='send'?'↓':'↑'}</span>`;
    }
   }
  }
  $('duplex').innerHTML='Show full duplex: <span class="duplex-on">ON</span><span class="duplex-divider" aria-hidden="true"> | </span><span class="duplex-off">OFF</span>';
  $('duplex').setAttribute('aria-label','Show full duplex: '+(s.c.duplex?'ON':'OFF'));$('duplex').setAttribute('aria-pressed',String(s.c.duplex));$('duplex').disabled=s.phase!==0;
  $('B-send-actions').hidden=!s.c.duplex&&s.phase<4;
  $('B-app-settings-button').hidden=!s.c.duplex;
  for(const key of ['sizeB','mssB'])$('field-'+key).hidden=!s.c.duplex;
  if(!s.c.duplex)$('B-app-settings').hidePopover?.();
  $('mode-note').textContent='TCP is always full duplex. '+(s.phase!==0?'Reset to change the view.':s.c.duplex?'Showing data in both directions.':'Showing data in one direction.');
  for(const [k] of fields)$('cfg-'+k).disabled=s.phase!==0||(!s.c.duplex&&['sizeB','mssB'].includes(k));$('ack-mode').disabled=s.phase!==0;
  const complete=live&&['A',...(s.c.duplex?['B']:[])].every(id=>s.hosts[id].una===s.hosts[id].start+s.hosts[id].size);
  $('status').textContent=s.phase===5?'Connection closed':s.phase===4?(s.closeStep===2?'Half-closed: Host '+E.other(s.closer)+' can still send; click its Close when finished':'FIN teardown: use the host header controls'):!live?(s.phase?'Handshake in progress':'Disconnected'):complete?'All data acknowledged':!['A','B'].some(id=>E.canSend(s,id))&&['A','B'].some(id=>E.readable(s.hosts[id]))?'Buffered data awaits application reads':'Connection established';
  $('connection-menu-button').disabled=$('connect').disabled=$('skip').disabled=s.phase!==0&&s.phase!==5;$('handshake-syn-ack').hidden=$('handshake-syn-ack').disabled=s.phase!==1;$('handshake-ack').hidden=$('handshake-ack').disabled=s.phase!==2;$('step').disabled=$('auto').disabled=s.phase===0||s.phase===5;
  $('explanation').textContent=ev?ev.explanation:'Click Connect to send SYN, then Next Step or Auto to finish the handshake. Start Connected skips the handshake animation.';
  const packetEvent=ev?.packetId,visible=s.packets.filter(p=>p.status!=='piggybacked');
  $('packets').innerHTML=visible.map(p=>`<button class="packet direction-${p.from} ${p.from==='B'?'reverse':''} ${p.kind==='ack'?'ack-packet':''} ${['lost','discarded'].includes(p.status)?'lost':''} ${p.id===packetEvent?'active':''} ${newEvent&&p.id===packetEvent&&['send','receive','ack','retransmit','fast-retransmit','handshake','teardown'].includes(ev.kind)?'moving':''}" data-packet="${p.id}" aria-label="Host ${p.from} to Host ${p.to}, ${p.kind}, ${p.status}"><span class="packet-route">${p.from} &rarr; ${p.to}</span> ${p.flags} · SEQ=${p.seq} · ACK=${p.ack??'—'} · LEN=${p.len}${p.len?' · bytes '+p.seq+'–'+(p.seq+p.len-1):''}<small> · ${p.status==='discarded'?'dropped at receiver (duplicate data)':p.status==='received'?'received at TCP':['pending','queued'].includes(p.status)?'In transit':p.status}${p.piggyback?' · piggybacked ACK':''}${p.retransmission?' · retransmission':''}</small></button>`).join('')||'<p class="hint">TCP packets will appear here after Connect.</p>';
  $('log').innerHTML=s.events.map(e=>`<tr class="${ev?.id===e.id?'active':''}"><td><button data-event="${e.id}" aria-label="Inspect step ${e.id}">${e.id}</button></td><td>${e.kind}</td><td>${e.from===e.to?'Host '+e.host:e.from+' → '+e.to}</td><td>${e.flags}</td><td>${e.seq??'—'}</td><td>${e.ack??'—'}</td><td>${e.len}</td><td>${e.explanation}</td></tr>`).join('');
  $('snapshot').textContent=ev?`Step ${ev.id} snapshot · `+['A','B'].map(id=>{const h=ev.state[id];return `${id}: ${h.state}${h.state==='ESTABLISHED'?`, UNA ${h.una}, NXT ${h.nxt}, RCV.NXT ${h.rcv}, buffered ${h.buffer}, consumed ${h.consumed}`:''}`;}).join(' · '):'Select a packet or log entry to inspect its bytes and state. Host panels show live state.';
  const data=s.packets.filter(p=>p.len&&p.status==='pending'),acks=s.packets.filter(p=>p.kind==='ack'&&p.status==='queued');
  function cards(target,list,ack){
   const deliverId=ack?'deliver-ack':'deliver',dropId=ack?'drop-ack':'drop';
   const icon=(paths)=>`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
   $(target).innerHTML=list.map((p,i)=>`<article class="transit-card direction-${p.from}"><span class="transit-packet-icon">${icon(ack?'<path d="M20 7 10 17l-5-5"/><rect x="2" y="3" width="20" height="18" rx="3"/>':'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 13h10M7 16h6"/>')}</span><div class="transit-card-copy">${p?`<strong>Host ${p.from} &rarr; Host ${p.to}</strong><span>${ack?'ACK '+p.ack:'SEQ '+p.seq+' &middot; '+p.len+' bytes'}</span><small class="transit-state">In transit</small>`:'<span>No '+(ack?'ACKs':'data segments')+' in transit</span>'}</div><div class="transit-card-actions"><button id="${deliverId}${i?'-'+p.id:''}" aria-label="Deliver ${ack?'ACK':'segment'}" data-tooltip="Deliver to the receiving host" ${p?'':'disabled'}>${icon('<path d="M4 12h14m-5-5 5 5-5 5M21 5v14"/>')}</button><button id="${dropId}${i?'-'+p.id:''}" aria-label="Drop ${ack?'ACK':'segment'}" data-tooltip="Drop packet to simulate network loss" ${p?'':'disabled'}>${icon('<path d="m8 8 8 8m0-8-8 8"/><circle cx="12" cy="12" r="9"/>')}</button></div></article>`).join('');
   if(list.length)$(deliverId).disabled=$(dropId).disabled=false;
   list.forEach((p,i)=>{const suffix=i?'-'+p.id:'';$(deliverId+suffix).onclick=()=>act(()=>E.deliver(s,p.id));$(dropId+suffix).onclick=()=>act(()=>E.drop(s,p.id));});
  }
  cards('data-cards',data,false);cards('ack-cards',acks,true);
  for(const [kind,list] of [['data',data],['acks',acks]]){
   for(const [action,operation] of [['deliver',E.deliver],['reject',E.drop]]){
    const button=$(action+'-all-'+kind);
    button.disabled=!list.length;
    button.onclick=()=>{const ids=list.map(p=>p.id);act(()=>ids.forEach(id=>operation(s,id)));};
   }
  }
  if(!selected){$('packets').scrollTop=$('packets').scrollHeight;const log=$('log').closest('.log-scroll');log.scrollTop=log.scrollHeight;}
  lastAnimated=s.events.length;
  updateIntercept();
 }
 document.addEventListener('click',e=>{const b=e.target.closest('[data-event], [data-packet]');if(!b)return;const ev=b.dataset.event?s.events.find(x=>x.id===Number(b.dataset.event)):[...s.events].reverse().find(x=>x.packetId===Number(b.dataset.packet));if(ev){stop();selected=ev.id;render();}});
 for(const id of ['A','B']){
  $(id+'-close').onclick=()=>{stop();$(id+'-close-menu').hidePopover?.();act(()=>E.close(s,id));};
  $(id+'-close-now').onclick=()=>{stop();$(id+'-close-menu').hidePopover?.();act(()=>{if(s.phase!==3||!E.canClose(s,id))return;E.close(s,id);while(s.phase===4){if(s.closeStep===2)E.close(s,E.other(s.closer));else E.teardown(s);}lastAnimated=s.events.length;});};
  $(id+'-fin-step').onclick=()=>{stop();act(()=>E.teardown(s));};
  $(id+'-submit').onclick=()=>act(()=>E.submit(s,id,s.c[id==='A'?'size':'sizeB']));$(id+'-send').onclick=()=>act(()=>E.send(s,id));$(id+'-read').onclick=()=>{try{E.read(s,id,Number($(id+'-read-size').value));$('error').textContent='';selected=null;render();}catch(e){$('error').textContent=e.message;}};
  $(id+'-send-ack').onclick=()=>act(()=>E.repeatAck(s,id));
  $(id+'-tick').onclick=()=>act(()=>E.advanceTime(s));
  $(id+'-retransmit').onclick=()=>act(()=>E.retransmit(s,id));$(id+'-flush').onclick=()=>act(()=>E.flush(s,id));
 }
 for(const id of ['handshake-syn-ack','handshake-ack'])$(id).onclick=()=>act(()=>E.handshake(s));
 $('connect').onclick=()=>{$('connection-menu').hidePopover?.();if(s.phase===5)fresh(s.c);act(()=>E.handshake(s));};$('skip').onclick=()=>{$('connection-menu').hidePopover?.();if(s.phase===5)fresh(s.c);act(()=>{while(!E.established(s))E.handshake(s);lastAnimated=s.events.length;});};$('step').onclick=()=>act(()=>E.step(s));
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
