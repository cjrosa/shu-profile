/* One small HTTP/1.1 exchange over an ordered TCP connection. No retransmission. */
(function(root){'use strict';
 function create({ip}){
  const secrets=new WeakMap();
  const bytes=s=>new TextEncoder().encode(s).length;
  function validate(c,type='web'){
   if(!c||typeof c.enabled!=='boolean')throw Error('Invalid application settings.');
   if(type==='browser'){parse(c.url);return;}
   for(const [key,min,max] of [['synCapacity',1,128],['synTimeout',20,1000]])if(c[key]!==undefined&&(!Number.isInteger(c[key])||c[key]<min||c[key]>max))throw Error('Invalid pending connection capacity or timeout.');
   if(c.tls!==undefined&&typeof c.tls!=='boolean')throw Error('Invalid HTTPS setting.');
   if(c.tls&&(!/^[a-z0-9.-]+$/i.test(c.certificateName||'')||typeof c.certificateTrusted!=='boolean'||typeof c.certificateValid!=='boolean'))throw Error('HTTPS needs a certificate hostname and trust/validity settings.');
   if(!Number.isInteger(c.port)||c.port<1||c.port>65535||typeof c.title!=='string'||c.title.length>80||typeof c.body!=='string'||bytes(c.body)>800)throw Error('Use a port from 1 to 65535, a title up to 80 characters, and a page up to 800 UTF-8 bytes.');
  }
  function parse(value){let u;try{u=new URL(value);}catch{throw Error('Enter an HTTP or HTTPS URL.');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hash||!u.hostname||Number(u.port||(u.protocol==='https:'?443:80))<1||u.href.length>512)throw Error('Use an http:// or https:// URL without credentials or fragments.');return {url:u.href,host:u.hostname,authority:u.host,secure:u.protocol==='https:',port:Number(u.port||(u.protocol==='https:'?443:80)),path:u.pathname+u.search};}
  function browse(n,id,value){const d=n.device(id),url=parse(value);if(d?.type!=='host'||!d.ip||!d.browserServer?.enabled)throw Error('Install and enable Browser on a configured host.');if(n.queue.length&&!n.isDosActive())throw Error('Finish the current exchange first.');if(Object.values(n.tcp).some(c=>c.client===id)||n.queue.some(e=>e.device===id&&(e.kind==='tcp-start'||e.kind==='dns-start'&&e.continuation?.kind==='tcp-start')))throw Error('This Browser already has a request in progress.');let numeric=false;try{ip(url.host);numeric=true;}catch{}if(numeric&&(ip(url.host)>>>24===0||ip(url.host)>>>24===127||ip(url.host)>>>24>=224))throw Error('Use a simulated host unicast IPv4 address.');if(numeric)n.enqueue({kind:'tcp-start',device:id,target:url.host,url});else n.lookupDns(id,url.host,false,true,{kind:'tcp-start',url});n.httpPages[id]={url:url.url,status:'Loading...'};d.browserServer.url=url.url;}
  function handle(n,e,d,p,emitIp,hostHop){
   let title='',notes=[];const f=e.frame,id=e.connection||f?.connection,key=d.id+':'+id+':'+(e.localPort??f?.dport);let c=n.tcp[key];
   const send=packet=>{if(packet.dip===d.ip)n.enqueue({kind:'receive',device:d.id,ingress:p.id,frame:{...packet,src:p.mac,dst:p.mac}});else{const hop=hostHop(packet.dip);if(hop)emitIp(p,hop,packet);}};
   const vault=()=>{if(!secrets.has(n))secrets.set(n,new Map());return secrets.get(n);};
   const protect=payload=>{const token=id+':'+c.localPort+':'+c.snd;vault().set(token,payload);return {tls:'Application Data',record:token,length:payload.length+22};};
   const segment=(flags,extra={})=>{const packet={type:'IPv4',protocol:'TCP',ttl:64,connection:id,sip:d.ip,dip:c.peer,sport:c.localPort,dport:c.remotePort,flags,seq:c.snd,ack:flags.includes('ACK')?c.rcv:0,length:0,...extra};c.snd+=(packet.length||0)+(flags.includes('SYN')||flags.includes('FIN')?1:0);send(packet);};
   const finish=(ok,message)=>{const client=c?.client||e.device;n.httpPages[client]={...n.httpPages[client],status:message};n.results.push({device:client,http:true,ok,message});n.queue=n.queue.filter(q=>!(q.kind==='tcp-timeout'&&q.connection===id));for(const [k,packets]of Object.entries(n.pendingPackets)){n.pendingPackets[k]=packets.filter(packet=>packet.connection!==id);if(!n.pendingPackets[k].length)delete n.pendingPackets[k];}for(const [k,v]of Object.entries(n.tcp))if(v.id===id)delete n.tcp[k];for(const token of vault().keys())if(token.startsWith(id+':'))vault().delete(token);};
   if(e.kind==='tcp-start'){
    const connection=d.id+':http:'+e.order;n.tcp[d.id+':'+connection+':'+(49152+e.order%16000)]={id:connection,client:d.id,peer:e.target,localPort:49152+e.order%16000,remotePort:e.url.port,snd:1001,rcv:0,state:'SYN-SENT',url:e.url};
    n.enqueue({kind:'tcp-timeout',device:d.id,connection,localPort:49152+e.order%16000},Math.max(150,n.devices.length*40));send({type:'IPv4',protocol:'TCP',ttl:64,connection,sip:d.ip,dip:e.target,sport:49152+e.order%16000,dport:e.url.port,flags:'SYN',seq:1000,ack:0,length:0});return {title:'Open TCP connection',notes:['Send SYN to '+e.target+':'+e.url.port+'. SYN consumes one sequence number.']};
   }
   if(e.kind==='tcp-failed'){n.httpPages[d.id]={...n.httpPages[d.id],status:e.message};return {title:'Browser could not resolve the name',notes:[e.message]};}
   if(e.kind==='tcp-timeout'){if(c)finish(false,'Web connection timed out. Check the service, cables and routes.');return {title:'TCP connection timed out',notes:['This teaching model does not retransmit lost segments.']};}
   if(f?.flags==='SYN'&&!c){if(!d.webServer?.enabled||f.dport!==d.webServer.port){send({type:'IPv4',protocol:'TCP',ttl:64,connection:id,sip:d.ip,dip:f.sip,sport:f.dport,dport:f.sport,flags:'RST ACK',seq:0,ack:f.seq+1,length:0});return {title:'TCP port closed',notes:['No Web Server is listening on port '+f.dport+'. Return RST.']};}c=n.tcp[key]={id,client:id.split(':')[0],peer:f.sip,localPort:f.dport,remotePort:f.sport,snd:5000,rcv:f.seq+1,state:'SYN-RECEIVED',secure:!!d.webServer.tls};segment('SYN ACK');return {title:'Accept TCP connection',notes:['Reply with SYN-ACK. Acknowledge the client SYN and advertise the server initial sequence number.']};}
   if(!c)return {title:'Ignore unrelated TCP segment',notes:['No matching active connection.']};
   if(f&&(f.sip!==c.peer||f.sport!==c.remotePort||f.dport!==c.localPort))return {title:'Ignore unrelated TCP segment',notes:['The addresses and ports do not match this connection.']};
   if(f?.flags.includes('RST')){finish(false,'Connection refused: no Web Server is listening on this port.');return {title:'TCP connection refused',notes:['The remote host returned a reset.']};}
   if(c.state==='SYN-SENT'&&f?.flags==='SYN ACK'&&f.ack===c.snd){c.rcv=f.seq+1;c.state='ESTABLISHED';segment('ACK');n.enqueue({kind:'browser-application',device:d.id,connection:id,localPort:c.localPort,action:c.url.secure?'tls-start':'request'});return {title:'Complete TCP three-way handshake',notes:['Send ACK. The browser can now start TLS for HTTPS, or send an HTTP request.']};}
   if(c.state==='SYN-RECEIVED'&&f?.flags==='ACK'&&f.ack===c.snd){c.state='ESTABLISHED';return {title:'TCP connection established',notes:['The server received the third handshake segment.']};}
   if(e.kind==='browser-application'&&e.action==='tls-start'){c.secure=true;c.tlsState='HELLO-SENT';segment('PSH ACK',{tls:'ClientHello',length:80});return {title:'Start TLS handshake',notes:['The client requests an encrypted connection. This is a simplified teaching handshake, not real cryptography.']};}
   if(f?.tls&&f.tls!=='Application Data'&&f.seq===c.rcv&&f.ack===c.snd){
    c.rcv+=f.length;segment('ACK');
    if(f.tls==='ClientHello'&&c.state==='ESTABLISHED'&&!c.url){
     if(!c.secure){finish(false,'TLS failed: this server port serves plain HTTP.');return {title:'TLS protocol mismatch',notes:['Enable HTTPS on the server and use its configured port.']};}
     c.tlsState='SERVER-SENT';segment('PSH ACK',{tls:'Server handshake',certificateName:d.webServer.certificateName,certificateTrusted:d.webServer.certificateTrusted,certificateValid:d.webServer.certificateValid,length:160});return {title:'Server supplies its TLS identity',notes:['The simplified server flight represents key agreement, certificate authentication and Finished. Certificate details are teaching annotations, not a TLS 1.3 wire decode.']};
    }
    if(f.tls==='Server handshake'&&c.tlsState==='HELLO-SENT'){
     const reason=!f.certificateTrusted?'issuer is not trusted':!f.certificateValid?'certificate is expired or not yet valid':f.certificateName?.toLowerCase()!==c.url.host.toLowerCase()?'certificate hostname does not match the requested host':null;
     if(reason){finish(false,'TLS certificate rejected: '+reason+'.');return {title:'Browser rejects TLS certificate',notes:[reason,'No HTTP request or page content is sent.']};}
     c.tlsState='READY';segment('PSH ACK',{tls:'Client Finished',length:32});n.enqueue({kind:'browser-application',device:d.id,connection:id,localPort:c.localPort,action:'request'});return {title:'Browser verifies server identity',notes:['Hostname, issuer trust and validity checks passed. Both endpoints derive shared traffic keys; the certificate itself does not encrypt the page. Send client Finished.']};
    }
    if(f.tls==='Client Finished'&&c.tlsState==='SERVER-SENT'){c.tlsState='READY';return {title:'TLS established',notes:['Application content is now protected between these endpoints. IP addresses, TCP ports, sizes and timing remain observable.']};}
    return {title:'Unexpected TLS handshake',notes:['No application data delivered.']};
   }
   if(e.kind==='browser-application'&&e.action==='request'){
    const raw='GET '+c.url.path+' HTTP/1.1\r\nHost: '+c.url.authority+'\r\nConnection: close\r\n\r\n';c.state='REQUEST-SENT';const payload={http:'Request',method:'GET',path:c.url.path,host:c.url.authority,raw,length:bytes(raw)};segment('PSH ACK',c.secure?protect(payload):payload);return {title:c.secure?'Browser encrypts HTTP request':'Browser sends HTTP GET',notes:c.secure?['TLS Application Data: HTTP path, headers and body are encrypted.']: [raw,'Send the request through the established TCP connection.']};
   }
   if(e.kind==='web-application'){
    const request=c.secure?vault().get(f.record):f;
    const found=request.path==='/'||request.path==='/index.html',status=found?200:404,pageTitle=found?d.webServer.title:'Not Found',body=found?d.webServer.body:'No page exists at '+request.path,content=pageTitle+'\n\n'+body,raw='HTTP/1.1 '+status+(found?' OK':' Not Found')+'\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: '+bytes(content)+'\r\nConnection: close\r\n\r\n'+content;
    c.state='RESPONSE-SENT';const payload={http:'Response',status,pageTitle,body,raw,length:bytes(raw)};segment('PSH ACK',c.secure?protect(payload):payload);return {title:c.secure?'Web Server encrypts HTTP response':'Web Server returns HTTP '+status,notes:c.secure?['TLS Application Data: HTTP status, headers and body are encrypted.']:[raw,'The page is sent as one small TCP payload.']};
   }
   if(e.kind==='browser-application'&&e.action==='response'){const response=c.secure?vault().get(f.record):f;n.httpPages[d.id]={url:c.url.url,status:(c.secure?'HTTPS (TLS verified) ':'HTTP ')+response.status+' - closing connection',title:response.pageTitle,body:response.body,code:response.status,secure:!!c.secure};c.state='FIN-WAIT-1';segment('FIN ACK');return {title:c.secure?'Browser decrypts the response':'Browser displays HTTP '+response.status,notes:c.secure?['The receiving endpoint decrypts the page. Open Browser to read it; capture payload remains encrypted.']:['Deliver the response body to the Browser application.',response.pageTitle,response.body,'Close the connection with FIN.']};}
   if((f?.http&&c.secure)||(f?.tls==='Application Data'&&(!c.secure||c.tlsState!=='READY'))){finish(false,'HTTP/HTTPS protocol mismatch.');return {title:'Reject unprotected or unexpected application data',notes:['Match the browser URL scheme to the server HTTPS setting.']};}
   if(f?.tls==='Application Data'&&f.seq===c.rcv&&f.ack===c.snd&&((!c.url&&c.state==='ESTABLISHED')||(c.url&&c.state==='REQUEST-SENT'))){
    if(!vault().has(f.record))return {title:'Invalid TLS record',notes:['No authenticated content is available.']};
    c.rcv+=f.length;segment('ACK');n.enqueue({kind:c.url?'browser-application':'web-application',action:'response',device:d.id,connection:id,localPort:c.localPort,ingress:p.id,frame:f});return {title:'Deliver encrypted TLS record to endpoint',notes:['TCP acknowledges the record. Only the endpoint application can read its simulated protected content.']};
   }
   if(f?.http&&f.seq===c.rcv&&f.ack===c.snd&&((f.http==='Request'&&c.state==='ESTABLISHED')||(f.http==='Response'&&c.state==='REQUEST-SENT'))){c.rcv+=f.length;segment('ACK');n.enqueue({kind:f.http==='Request'?'web-application':'browser-application',action:'response',device:d.id,connection:id,localPort:c.localPort,ingress:p.id,frame:f});return {title:'Deliver HTTP '+f.http.toLowerCase()+' to the application',notes:['TCP acknowledges '+f.length+' payload bytes and delivers them to '+(f.http==='Request'?'Web Server':'Browser')+'.']};}
   if(f?.flags==='FIN ACK'&&f.seq===c.rcv){c.rcv++;segment('ACK');if(c.state==='RESPONSE-SENT'){c.state='LAST-ACK';segment('FIN ACK');}else if(c.state==='FIN-WAIT-1'||c.state==='FIN-WAIT-2'){c.state='TIME-WAIT';}return {title:'Close TCP connection',notes:['Acknowledge FIN. FIN consumes one sequence number.',c.state==='LAST-ACK'?'The server closes its side with FIN.':'The client has acknowledged the server FIN. TIME-WAIT is abbreviated in this teaching model.']};}
   if(f?.flags==='ACK'&&f.ack===c.snd){if(c.state==='FIN-WAIT-1')c.state='FIN-WAIT-2';else if(c.state==='LAST-ACK'){const page=n.httpPages[c.client];finish(page?.code===200,(page?.secure?'HTTPS (TLS verified) ':'HTTP ')+page?.code+' - connection closed');}return {title:'TCP acknowledgment',notes:['ACK '+f.ack+' is the next byte expected.']};}
   return {title:'Ignore unexpected TCP segment',notes:['The segment does not match the current sequence or connection state.']};
  }
  return {validate,parse,browse,handle,reset:n=>secrets.delete(n),copyRuntime:(source,target)=>{if(secrets.has(source))secrets.set(target,new Map(secrets.get(source)));}};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={create};else root.NetworkExplorerHTTP={create};
})(typeof globalThis!=='undefined'?globalThis:this);
