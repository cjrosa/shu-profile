/* Deterministic Python teaching programs. Socket traffic uses the shared network queue.
 * TCP is ordered, without retransmission/congestion control, like the HTTP model. */
(function(root){
 'use strict';
 const encode=s=>Array.from(new TextEncoder().encode(s));
 const decode=b=>new TextDecoder().decode(new Uint8Array(b));
 const defaults=()=>({enabled:true,role:'client',transport:'TCP',host:'echo.example',port:5000,message:'Hello, network!'});
 function validate(c){
  if(!c||typeof c.enabled!=='boolean'||!['client','server'].includes(c.role)||!['TCP','UDP'].includes(c.transport)||!Number.isInteger(c.port)||c.port<1||c.port>65535||typeof c.host!=='string'||!c.host.trim()||c.host.length>253||typeof c.message!=='string'||!encode(c.message).length||encode(c.message).length>2048)throw Error('Choose a role, TCP/UDP, port 1–65535, destination, and message of 1–2048 UTF-8 bytes.');
 }
 // Each executable row is an explicit interpreter instruction, not evaluated JavaScript/Python.
 function program(c,worker=false){
  const rows=[],add=(text,op)=>rows.push({text,op});
  if(worker){
   add('def handle_client(conn, address):','noop');
   add('    while True:','noop');
   add('        data = conn.recv(1024)','recv');
   add('        if not data:','eof');
   add('            break','noop');
   add('        conn.sendall(data)','echo');
   add('    conn.close()','close');
   return rows;
  }
  add('import socket','noop');
  if(c.role==='server'&&c.transport==='TCP'){
   add('import threading','noop');
   add('from client_handler import handle_client','noop');
  }
  add('sock = socket.socket(socket.AF_INET, socket.'+(c.transport==='TCP'?'SOCK_STREAM':'SOCK_DGRAM')+')','socket');
  if(c.role==='server'){
   add('sock.bind(("0.0.0.0", '+c.port+'))','bind');
   if(c.transport==='TCP'){
    add('sock.listen(5)','listen');
    add('while True:','noop');
    add('    conn, address = sock.accept()','accept');
    add('    threading.Thread(target=handle_client,','noop');
    add('                     args=(conn, address)).start()','spawn');
   }else{
    add('while True:','noop');
    add('    data, address = sock.recvfrom(4096)','recv');
    add('    sock.sendto(data, address)','echo');
   }
  }else{
   add('address = (socket.gethostbyname('+JSON.stringify(c.host)+'), '+c.port+')','resolve');
   if(c.transport==='TCP')add('sock.connect(address)','connect');
   add('message = '+JSON.stringify(c.message)+'.encode("utf-8")','message');
   add(c.transport==='TCP'?'sock.sendall(message)':'sock.sendto(message, address)','send');
   if(c.transport==='TCP'){
    add('reply = b""','init');
    add('while len(reply) < len(message):','condition');
    add('    data = sock.recv(1024)','recv');
    add('    if not data: raise ConnectionError("Early EOF")','check');
    add('    reply += data','append');
   }else add('reply, address = sock.recvfrom(4096)','recv');
   add('print(reply.decode("utf-8"))','print');
   add('sock.close()','close');
  }
  return rows;
 }
 function state(n,id){
  if(!n.echo)n.echo={};
  return n.echo[id]||(n.echo[id]={threads:[{id:'main',pc:0,status:'ready',auto:false,vars:{},breakpoints:[]}],sockets:[],pending:[],output:[],selected:'main',serial:0});
 }
 const thread=(s,id)=>s.threads.find(t=>t.id===id);
 const socket=(s,id)=>s.sockets.find(t=>t.id===id);
 function schedule(n,id,t){
  if(t.auto&&t.status==='ready'&&!n.queue.some(e=>e.kind==='echo-application'&&e.device===id&&e.thread===t.id))n.enqueue({kind:'echo-application',device:id,thread:t.id});
 }
 function wake(n,id,t){
  if(t&&t.status==='waiting'){
   t.status='ready';t.wait='';t.skipBreakpoint=t.pc;
   // Complete a call that was already stepped into, but do not run its next line.
   n.enqueue({kind:'echo-application',device:id,thread:t.id});
  }
 }
 function control(n,id,action,tid='main'){
  const d=n.device(id);if(!d?.ip||!d.echoServer?.enabled)throw Error('Install Echo on a configured host first.');
  const s=state(n,id),t=thread(s,tid);if(!t)throw Error('Select a thread.');
  if(action==='reset'){
   const closing=s.sockets.filter(so=>so.protocol==='TCP'&&so.peer&&!['CLOSED','ERROR','CREATED','LISTEN'].includes(so.state));
   n.queue=n.queue.filter(e=>!(e.device===id&&(e.kind.startsWith('echo-')||(e.kind==='dns-start'&&e.continuation?.kind?.startsWith('echo-')))));
   if(n.dnsPending[id]?.continuation?.kind?.startsWith('echo-')){
    const xid=n.dnsPending[id].xid;delete n.dnsPending[id];
    n.queue=n.queue.filter(e=>!(e.device===id&&e.kind==='dns-timeout'&&e.xid===xid));
   }
   delete n.echo[id];const fresh=state(n,id);fresh.serial=s.serial;fresh.ui=s.ui;
   fresh.threads[0].breakpoints=[...s.threads[0].breakpoints];
   if(closing.length)n.enqueue({kind:'echo-shutdown',device:id,sockets:closing});
   return;
  }
  if(action==='pause'){s.threads.forEach(t=>t.auto=false);n.queue=n.queue.filter(e=>!(e.kind==='echo-application'&&e.device===id));return;}
  if(action==='run'){s.threads.forEach(t=>{t.auto=true;t.skipBreakpoint=t.pc;schedule(n,id,t);});}
  else if(action==='step'){
   s.threads.forEach(t=>t.auto=false);
   n.queue=n.queue.filter(e=>!(e.kind==='echo-application'&&e.device===id));
   if(t.status==='ready'){t.skipBreakpoint=t.pc;n.enqueue({kind:'echo-application',device:id,thread:tid});}
  }
 }
 function fail(n,id,t,message){t.status='error';t.auto=false;t.wait=message;state(n,id).output.push(message);}
 function handle(n,e,d,p,emitIp,hostHop){
  const s=state(n,d.id),c=d.echoServer,f=e.frame;
  let title='Echo socket',notes=[];
  const send=packet=>{
   if(packet.dip===d.ip)n.enqueue({kind:'receive',device:d.id,ingress:p.id,frame:{...packet,src:p.mac,dst:p.mac}});
   else {const hop=hostHop(packet.dip);if(hop)emitIp(p,hop,packet);}
  };
  const segment=(so,flags,bytes=[])=>{
   send({type:'IPv4',protocol:so.protocol,echo:true,connection:so.connection,ttl:64,sip:d.ip,dip:so.peer,sport:so.port,dport:so.peerPort,flags,seq:so.snd,ack:so.rcv,length:bytes.length,bytes,raw:decode(bytes)});
   so.snd+=bytes.length+(flags.includes('SYN')||flags.includes('FIN')?1:0);
  };
  const transmit=(so,bytes)=>{
   if(so.protocol==='UDP')segment(so,'',bytes);
   else for(let i=0;i<bytes.length;i+=512)segment(so,'PSH ACK',bytes.slice(i,i+512));
  };
  if(e.kind==='echo-shutdown'){
   e.sockets.forEach(so=>segment(so,'RST ACK'));
   return {title:'Echo restarted',notes:['Closed sockets belonging to this application. Other applications keep their execution state.']};
  }
  if(e.kind==='echo-resolved'||e.kind==='echo-failed'){
   const t=thread(s,e.thread);if(!t)return {title:'Expired Echo operation',notes:[]};
   if(e.kind==='echo-failed')fail(n,d.id,t,e.message);
   else {t.vars.address=[e.target,c.port];t.pc++;t.status='ready';t.wait='';schedule(n,d.id,t);}
   return {title:e.kind==='echo-failed'?'Echo DNS error':'Python hostname resolved',notes:[e.message||e.target]};
  }
  if(e.kind==='echo-timeout'){
   const so=socket(s,e.socket);if(so?.state==='SYN-SENT'){so.state='ERROR';fail(n,d.id,thread(s,so.owner),'Connection timed out. Check routes, cables, firewall and listener.');}
   return {title:'Echo connection timeout',notes:['Illustrative timeout; this TCP teaching model does not retransmit.']};
  }
  if(e.kind==='echo-application'){
   const t=thread(s,e.thread);if(!t||t.status!=='ready')return {title:'Python paused',notes:[]};
   const rows=program(c,t.id!=='main'),row=rows[t.pc];
   if(!row){t.status='finished';t.finishedAt=Date.now();return {title:'Python finished',notes:[]};}
   if(t.auto&&t.breakpoints.includes(t.pc)&&t.skipBreakpoint!==t.pc){t.auto=false;return {title:'Python breakpoint',notes:['Paused before line '+(t.pc+1)]};}
   delete t.skipBreakpoint;t.last=t.pc;title='Python · '+t.id+' · line '+(t.pc+1);notes=[row.text];
   let next=t.pc+1,so=socket(s,t.socket);
   const line=op=>rows.findIndex(r=>r.op===op);
   const wait=reason=>{t.status='waiting';t.wait=reason;next=t.pc;};
   try{
    switch(row.op){
     case 'define':next=line('socket');break;
     case 'socket': so={id:'socket-'+(++s.serial),protocol:c.transport,port:c.role==='server'?c.port:49152+Number(d.id.slice(1))*32+s.serial,state:'CREATED',buffer:[],datagrams:[],snd:1000,rcv:0,owner:t.id};s.sockets.push(so);t.socket=so.id;t.vars.sock=so.id;break;
     case 'bind':if((c.transport==='TCP'&&d.webServer?.enabled&&d.webServer.port===c.port)||(c.transport==='UDP'&&c.port===53&&d.dnsServer?.enabled))throw Error('Address already in use');so.state='BOUND';break;
     case 'listen':so.state='LISTEN';break;
     case 'resolve':
      if(/^\d+\.\d+\.\d+\.\d+$/.test(c.host)){const parts=c.host.split('.').map(Number);if(parts.some(x=>x>255)||parts[0]===0||parts[0]===127||parts[0]>=224)throw Error('Use a simulated unicast IPv4 address.');t.vars.address=[c.host,c.port];}
      else {if(n.dnsPending[d.id]||n.queue.some(q=>q.kind==='dns-start'&&q.device===d.id)){schedule(n,d.id,t);return {title:'Resolver busy',notes:['Waiting for the host resolver.']};}n.lookupDns(d.id,c.host,false,true,{kind:'echo-resolved',failureKind:'echo-failed',thread:t.id});wait('DNS resolution');}break;
     case 'connect':
      if(so.state==='ESTABLISHED')break;
      so.peer=t.vars.address[0];so.peerPort=c.port;so.connection=d.id+':echo:'+s.serial;so.state='SYN-SENT';segment(so,'SYN');n.enqueue({kind:'echo-timeout',device:d.id,socket:so.id},Math.max(150,n.devices.length*40));wait('TCP handshake');break;
     case 'accept':if(!s.pending.length)wait('accept(): waiting for a client');else {t.accepted=s.pending.shift();const accepted=socket(s,t.accepted);t.vars.address=[accepted.peer,accepted.peerPort];t.vars.conn=accepted.id;}break;
     case 'spawn':{
      const accepted=socket(s,t.accepted),child={id:'client-'+(++s.serial),pc:1,status:'ready',auto:t.auto,vars:{conn:accepted.id,address:[accepted.peer,accepted.peerPort]},socket:accepted.id,breakpoints:[...(s.ui?.handlerBreakpoints||[])]};accepted.owner=child.id;s.threads.push(child);schedule(n,d.id,child);next=line('accept');break;
     }
     case 'message':t.vars.message=encode(c.message);break;
     case 'send':so.peer=t.vars.address[0];so.peerPort=c.port;if(so.protocol==='UDP')so.state='BOUND';transmit(so,t.vars.message);s.output.push('Sent '+t.vars.message.length+' bytes: '+c.message);break;
     case 'init':t.vars.reply=[];break;
     case 'condition':if(t.vars.reply.length>=t.vars.message.length)next=line('print');break;
     case 'recv':
      if(so.protocol==='UDP'){
       const dg=so.datagrams.shift();if(!dg)wait('recvfrom(): waiting for a datagram');else {t.vars.address=[dg.ip,dg.port];t.vars[c.role==='client'?'reply':'data']=dg.bytes;so.peer=dg.ip;so.peerPort=dg.port;}
      }else if(so.buffer.length)t.vars.data=so.buffer.splice(0,1024);
      else if(so.eof)t.vars.data=[];
      else wait('recv(): waiting for bytes');
      break;
     case 'check':if(!t.vars.data.length)throw Error('ConnectionError: Early EOF');break;
     case 'append':t.vars.reply.push(...t.vars.data);next=line('condition');break;
     case 'eof':next=t.vars.data.length?line('echo'):line('close');break;
     case 'echo':transmit(so,t.vars.data);s.output.push('Echoed '+t.vars.data.length+' bytes: '+decode(t.vars.data));next=line('recv');break;
     case 'print':s.output.push('Echo received: '+decode(t.vars.reply));break;
     case 'close':if(so.protocol==='TCP'){segment(so,'FIN ACK');so.state=so.eof?'LAST-ACK':'FIN-WAIT-1';}else so.state='CLOSED';t.status='finished';t.finishedAt=Date.now();break;
    }
    t.pc=next;if(t.status==='ready')schedule(n,d.id,t);
   }catch(error){fail(n,d.id,t,error.message);}
   s.output=s.output.slice(-40);
   return {title,notes,echoDelivery:['send','echo','recv'].includes(row.op)&&t.status!=='waiting',action:row.op==='recv'?'response':'request'};
  }
  if(!f)return {title,notes};
  let so=s.sockets.find(x=>x.protocol===f.protocol&&x.port===f.dport&&x.peer===f.sip&&x.peerPort===f.sport&&x.connection===f.connection&&x.state!=='CLOSED');
  if(f.protocol==='UDP'){
   so=s.sockets.find(x=>x.protocol==='UDP'&&x.port===f.dport&&x.state==='BOUND');
   if(so){so.datagrams.push({bytes:f.bytes||[],ip:f.sip,port:f.sport});wake(n,d.id,thread(s,so.owner));return {title:'UDP datagram buffered for recvfrom()',notes:[decode(f.bytes||[]),'Sender '+f.sip+':'+f.sport]};}
   return {title:'Echo UDP port is closed',notes:['No bound Echo socket. The sender receives no echo.']};
  }
  if(f.flags==='SYN'&&!so){
   const listener=s.sockets.find(x=>x.state==='LISTEN'&&x.port===f.dport);
   if(!listener||s.sockets.filter(x=>x.state==='SYN-RECEIVED'||(x.state==='ESTABLISHED'&&!x.owner)).length>=5){send({...f,sip:d.ip,dip:f.sip,sport:f.dport,dport:f.sport,flags:'RST ACK',seq:0,ack:f.seq+1,length:0,bytes:[]});return {title:'Echo connection refused',notes:['No listener or the pending connection queue is full.']};}
   so={id:'socket-'+(++s.serial),protocol:'TCP',port:f.dport,peer:f.sip,peerPort:f.sport,connection:f.connection,state:'SYN-RECEIVED',snd:5000,rcv:f.seq+1,buffer:[],datagrams:[]};s.sockets.push(so);segment(so,'SYN ACK');return {title:'Echo listener replies SYN-ACK',notes:['The OS handles the handshake; accept() will return a separate socket.']};
  }
  if(!so)return {title:'Ignore unrelated Echo segment',notes:[]};
  const t=thread(s,so.owner);
  if(f.flags?.includes('RST')){so.state='ERROR';if(t)fail(n,d.id,t,'Connection refused by the remote port.');n.queue=n.queue.filter(q=>!(q.kind==='echo-timeout'&&q.device===d.id&&q.socket===so.id));return {title:'Echo connection refused',notes:['Remote TCP reset.']};}
  if(so.state==='SYN-SENT'&&f.flags==='SYN ACK'&&f.ack===so.snd){so.rcv=f.seq+1;so.state='ESTABLISHED';segment(so,'ACK');n.queue=n.queue.filter(q=>!(q.kind==='echo-timeout'&&q.device===d.id&&q.socket===so.id));wake(n,d.id,t);return {title:'Echo TCP connected',notes:['connect() can now return.']};}
  if(so.state==='SYN-RECEIVED'&&f.flags==='ACK'&&f.ack===so.snd){so.state='ESTABLISHED';s.pending.push(so.id);wake(n,d.id,thread(s,'main'));return {title:'Connection ready for accept()',notes:['Queued independently of the Python main thread.']};}
  if(f.length&&f.seq===so.rcv){so.buffer.push(...(f.bytes||[]));so.rcv+=f.length;segment(so,'ACK');wake(n,d.id,t);return {title:'TCP bytes buffered',notes:[f.length+' bytes acknowledged. recv() reads from this socket buffer.',decode(f.bytes||[])]};}
  if(f.flags?.includes('FIN')&&f.seq===so.rcv){so.rcv++;so.eof=true;segment(so,'ACK');so.state=so.state.startsWith('FIN-WAIT')?'CLOSED':'CLOSE-WAIT';wake(n,d.id,t);return {title:'Peer closed its TCP stream',notes:['Buffered bytes remain readable; then recv() returns b"".']};}
  if(f.flags==='ACK'&&f.ack===so.snd){if(so.state==='LAST-ACK')so.state='CLOSED';else if(so.state==='FIN-WAIT-1')so.state='FIN-WAIT-2';}
  return {title:'Echo TCP acknowledgment',notes:['ACK '+f.ack]};
 }
 function expireThreads(n,now=Date.now()){
  let changed=false;
  for(const s of Object.values(n.echo||{})){
   const expired=s.threads.filter(t=>t.id!=='main'&&t.status==='finished'&&Number.isFinite(t.finishedAt)&&now-t.finishedAt>=300000);
   if(!expired.length)continue;
   const ids=new Set(expired.map(t=>t.id));s.threads=s.threads.filter(t=>!ids.has(t.id));
   if(ids.has(s.selected)){s.selected='main';if(s.ui)s.ui.file='main';}
   changed=true;
  }
  return changed;
 }
 const api={expireThreads,defaults,validate,program,state,control,handle,decode};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NetworkExplorerEcho=api;
})(typeof globalThis!=='undefined'?globalThis:this);
