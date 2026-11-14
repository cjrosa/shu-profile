/* DHCP acquisition, routed relay, and manual renewal. */
(function(root){
 'use strict';
 function create({ip,formatIp,sameSubnet,validateAddress}){
  const broadcast='ff:ff:ff:ff:ff:ff',clone=x=>JSON.parse(JSON.stringify(x));
  function validate(d,c){
   if(!c||typeof c.enabled!=='boolean')throw Error('Invalid DHCP server configuration.');
   if(!c.enabled&&Array.isArray(c.pools)&&!c.pools.length)return;
   if(d.addressMode==='dhcp'||!d.ip)throw Error('A DHCP server needs a manually configured IPv4 address.');
   if(Array.isArray(c.pools)){
    if(c.pools.length>32|| (c.enabled&&!c.pools.length))throw Error('Add at least one pool before enabling DHCP (maximum 32).');
    const names=new Set();
    for(const pool of c.pools){if(!pool||typeof pool.name!=='string'||!pool.name.trim()||pool.name.length>40||names.has(pool.name.trim().toLowerCase()))throw Error('Use a unique pool name of up to 40 characters.');names.add(pool.name.trim().toLowerCase());validate(d,{...pool,enabled:c.enabled,pools:undefined});}
    for(let i=0;i<c.pools.length;i++)for(let j=0;j<i;j++){const a=c.pools[i],b=c.pools[j];if(sameSubnet(a.start,b.start,Math.min(a.prefix??d.prefix,b.prefix??d.prefix)))throw Error('Each DHCP pool must serve a different, non-overlapping subnet.');}
    return;
   }
   const prefix=c.prefix??d.prefix;validateAddress(c.start,prefix);validateAddress(c.end,prefix);
   if(!sameSubnet(c.start,c.end,prefix)||ip(c.end)<ip(c.start)||ip(c.end)-ip(c.start)>1023)throw Error('Use a pool of up to 1024 addresses in one pool subnet.');
   if(typeof c.gateway!=='string')throw Error('Invalid DHCP gateway.');
   if(c.gateway){validateAddress(c.gateway,prefix);if(!sameSubnet(c.start,c.gateway,prefix))throw Error('The DHCP gateway must be in the pool subnet.');}
   if(!Number.isInteger(c.leaseSeconds)||c.leaseSeconds<30||c.leaseSeconds>86400)throw Error('Use a lease duration from 30 to 86400 seconds.');
  }
  function clearClient(d){delete d.lease;if(d.addressMode==='dhcp'){d.ip='';d.prefix=null;d.gateway='';}}
  function mode(n,id,value){const d=n.device(id);if(d?.type!=='host'||!['manual','dhcp'].includes(value))throw Error('Choose Manual or Automatic (DHCP).');if(value==='dhcp'&&d.dhcpServer?.enabled)throw Error('Disable the DHCP server before using automatic addressing.');clearClient(d);d.addressMode=value;if(value==='dhcp'){d.ip='';d.prefix=null;d.gateway='';delete d.dhcpServer;}n.reset();}
  function configure(n,id,c){const d=n.device(id);if(d?.type!=='host')throw Error('Select a host.');validate(d,c);d.dhcpServer=clone(c);n.reset();}
  function reset(n){n.dhcpPending={};n.dhcpLeases??={};for(const [id,rows]of Object.entries(n.dhcpLeases)){if(!n.device(id)){delete n.dhcpLeases[id];continue;}for(const [mac,r]of Object.entries(rows))if(r.state==='offered')delete rows[mac];}}
  function age(n,now){let changed=false;for(const rows of Object.values(n.dhcpLeases||{}))for(const [mac,r]of Object.entries(rows))if(r.expiresAt<=now){delete rows[mac];changed=true;}for(const d of n.devices)if(d.lease?.expiresAt<=now){clearClient(d);changed=true;}return changed;}
  function start(n,id){const d=n.device(id);if(d?.type!=='host'||d.addressMode!=='dhcp')throw Error('Choose Automatic (DHCP) addressing on this host first.');if(n.queue.length)throw Error('Finish or clear the current exchange first.');n.age();n.enqueue({kind:'dhcp-start',device:id});}
  function handle(n,e,d,p,send,emitIp,hostHop){
   const notes=[],result=title=>({title,notes}),finish=(ok,message)=>{delete n.dhcpPending[d.id];n.queue=n.queue.filter(q=>!(q.kind==='dhcp-timeout'&&q.device===d.id));n.results.push({device:d.id,dhcp:true,ok,message});};
   const packet=(message,fields={})=>({type:'IPv4',protocol:'UDP',dhcp:message,ttl:64,...fields});
   if(e.kind==='dhcp-start'){
    const xid=d.id+':'+e.order,lease=d.lease;
    n.dhcpPending[d.id]={xid,state:lease?'requesting':'selecting',server:lease?.server,address:lease?.address,requestedAt:Date.now()};
    n.enqueue({kind:'dhcp-timeout',device:d.id,xid},Math.max(40,n.devices.length*12));
    if(lease){notes.push('Renew the existing lease with a unicast DHCPREQUEST to the known server.');const hop=hostHop(lease.server);if(hop)emitIp(p,hop,packet('Request',{sip:d.ip,dip:lease.server,sport:68,dport:67,xid,clientMac:p.mac,requested:d.ip,server:lease.server,renew:true}));return result('DHCP Request: renew lease');}
    notes.push('No IP address yet. Broadcast DHCPDISCOVER from 0.0.0.0:68 to 255.255.255.255:67. The client can receive link-layer unicast replies before configuring its IP address.');
    send(p.id,packet('Discover',{src:p.mac,dst:broadcast,sip:'0.0.0.0',dip:'255.255.255.255',sport:68,dport:67,xid,clientMac:p.mac,broadcast:false}));return result('DHCP Discover: find a server');
   }
   if(e.kind==='dhcp-timeout'){if(n.dhcpPending[d.id]?.xid===e.xid){notes.push('No matching DHCPACK arrived. Check the server, address pool, VLAN and cables. An existing lease remains usable until it expires.');finish(false,'DHCP timed out.');}return result('DHCP timed out');}
   const f=e.frame,server=d.dhcpServer,pending=n.dhcpPending[d.id];
   if(server?.enabled&&f.dport===67&&['Discover','Request'].includes(f.dhcp)){
    const clientSubnet=f.giaddr||(f.renew?f.sip:d.ip),c=(server.pools||[server]).find(pool=>sameSubnet(clientSubnet,pool.start,pool.prefix??d.prefix));if(!c){notes.push('No pool matches '+(f.giaddr?'relay address (giaddr) ':'client subnet ')+clientSubnet+'.');return result('No matching DHCP pool');}const prefix=c.prefix??d.prefix;notes.push((f.giaddr?'Relay address (giaddr) '+f.giaddr:'Client subnet '+clientSubnet)+' selects pool '+(c.name||'Default')+': '+c.start+' through '+c.end+'/'+prefix+'.');const rows=n.dhcpLeases[d.id]||(n.dhcpLeases[d.id]={});
    if(f.server&&f.server!==d.ip){notes.push('The client selected another server.');if(rows[f.clientMac]?.state==='offered')delete rows[f.clientMac];return result('DHCP server not selected');}
    const reserved=new Set([d.ip,c.gateway,...n.devices.filter(x=>x.type==='host'&&x.ports[0].mac!==f.clientMac&&x.ip).map(x=>x.ip),...n.devices.filter(x=>x.type==='router').flatMap(x=>x.ports.map(q=>q.ip))]);
    const available=address=>ip(address)>=ip(c.start)&&ip(address)<=ip(c.end)&&!reserved.has(address)&&!Object.entries(rows).some(([mac,r])=>mac!==f.clientMac&&r.address===address);
    const reply=(message,address)=>{const response=packet(message,{src:p.mac,dst:f.broadcast?broadcast:f.clientMac,sip:d.ip,dip:f.giaddr||(f.broadcast?'255.255.255.255':address),sport:67,dport:f.giaddr?67:68,xid:f.xid,clientMac:f.clientMac,server:d.ip,address,prefix,gateway:c.gateway,leaseSeconds:c.leaseSeconds,giaddr:f.giaddr||'',broadcast:!!f.broadcast});if(f.giaddr||f.renew){const hop=hostHop(response.dip);notes.push('Route the unicast '+message+' to '+response.dip+(f.giaddr?' (the relay).':'.'));if(hop)emitIp(p,hop,response);}else send(p.id,response);};
    if(f.dhcp==='Discover'){
     let address=rows[f.clientMac]?.address;if(!address||!available(address)){address=null;for(let v=ip(c.start);v<=ip(c.end);v++){const candidate=formatIp(v);if(available(candidate)){address=candidate;break;}}}
     if(!address){notes.push('All usable pool addresses are leased or reserved. No offer is sent.');return result('DHCP pool exhausted');}
     rows[f.clientMac]={address,pool:c.name||'Default',clientMac:f.clientMac,xid:f.xid,state:'offered',expiresAt:Date.now()+60000};notes.push('Reserve '+address+' temporarily. '+(f.giaddr?'Return DHCPOFFER through the relay.':'Send DHCPOFFER directly to client MAC '+f.clientMac+'.')+' The client has not installed the address yet.');reply('Offer',address);return result('DHCP Offer: propose an address');
    }
    const row=rows[f.clientMac];
    if(!row||row.address!==f.requested||!available(f.requested)||(!f.renew&&row.xid!==f.xid)){notes.push('No valid matching offer or lease. The client will time out.');return result('DHCP Request rejected');}
    row.pool=c.name||'Default';row.state='bound';row.xid=f.xid;row.expiresAt=Date.now()+c.leaseSeconds*1000;row.leaseSeconds=c.leaseSeconds;notes.push('Bind '+row.address+' to '+f.clientMac+' for '+c.leaseSeconds+' seconds. Send DHCPACK with prefix /'+prefix+(c.gateway?' and gateway '+c.gateway:'. No gateway is supplied.')+'.');reply('ACK',row.address);return result('DHCP ACK: confirm the lease');
   }
   if(d.addressMode!=='dhcp'||!pending||f.xid!==pending.xid||f.clientMac!==p.mac||f.dport!==68){notes.push('This DHCP message is not for this host or transaction.');return result('Ignore unrelated DHCP message');}
   if(f.dhcp==='Offer'&&pending.state==='selecting'){
    pending.state='requesting';pending.server=f.server;pending.address=f.address;pending.requestedAt=Date.now();notes.push('Select the offer for '+f.address+'. Broadcast DHCPREQUEST so all servers can see which offer was selected.');send(p.id,packet('Request',{src:p.mac,dst:broadcast,sip:'0.0.0.0',dip:'255.255.255.255',sport:68,dport:67,xid:f.xid,clientMac:p.mac,server:f.server,requested:f.address,broadcast:false}));return result('DHCP Request: select the offer');
   }
   if(f.dhcp==='ACK'&&pending.state==='requesting'&&pending.server===f.server&&pending.address===f.address){
    validateAddress(f.address,f.prefix);d.ip=f.address;d.prefix=f.prefix;d.gateway=f.gateway;d.lease={address:f.address,server:f.server,serverMac:f.src,leaseSeconds:f.leaseSeconds,expiresAt:pending.requestedAt+f.leaseSeconds*1000};notes.push('Install '+d.ip+'/'+d.prefix+(d.gateway?' and default gateway '+d.gateway:'')+'. The host can now ARP and send IP traffic.');finish(true,'DHCP lease acquired: '+d.ip+'/'+d.prefix+(d.gateway?', gateway '+d.gateway:'')+'.');return result('DHCP lease installed');
   }
   notes.push('Keep waiting for the selected server.');return result('Ignore additional DHCP response');
  }
  function relay(n,e,d,p,send,emitIp){const f=e.frame;if(!f?.dhcp)return null;
   if(f.dst===broadcast&&['Discover','Request'].includes(f.dhcp)&&!f.giaddr&&p.dhcpRelay&&p.ip){const route=n.routes(d.id).find(r=>sameSubnet(r.network,p.dhcpRelay,r.prefix));if(!route)return {title:'DHCP relay has no route',notes:['No route to DHCP server '+p.dhcpRelay+'.']};const out=d.ports.find(q=>q.id===route.port);e.selectedRoute=clone(route);e.routingTable=clone(n.routes(d.id,true));emitIp(out,route.nextHop||p.dhcpRelay,{...f,sip:p.ip,dip:p.dhcpRelay,sport:67,dport:67,giaddr:p.ip,relayHops:1,ttl:64});return {title:'Relay DHCP '+f.dhcp+' to the server',notes:['Receive a client broadcast on '+p.name+'. Set giaddr to '+p.ip+' so the server can select the client subnet.','Send a new unicast UDP 67 to 67 packet to '+p.dhcpRelay+' through '+out.name+'.']};}
   if(f.dport===67&&['Offer','ACK'].includes(f.dhcp)&&f.dip===f.giaddr){const clientPort=d.ports.find(q=>q.enabled&&q.ip===f.giaddr&&q.dhcpRelay===f.server);if(!clientPort)return null;send(clientPort.id,{...f,src:clientPort.mac,dst:f.broadcast?broadcast:f.clientMac,dip:f.broadcast?'255.255.255.255':f.address,dport:68,ttl:64});return {title:'Relay DHCP '+f.dhcp+' to the client',notes:['The server reply returned to giaddr '+f.giaddr+'.','Deliver '+f.dhcp+' on '+clientPort.name+' to client MAC '+f.clientMac+'. Keep the remote DHCP server identity '+f.server+'.']};}return null;
  }
  return {validate,mode,configure,reset,age,start,handle,relay};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={create};else root.NetworkExplorerDHCP={create};
})(typeof globalThis!=='undefined'?globalThis:this);
