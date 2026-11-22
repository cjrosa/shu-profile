/* Simulated ARP claims, interception, and static-binding ingress inspection. */
(function(root){
 'use strict';
 const clone=x=>JSON.parse(JSON.stringify(x)), broadcast='ff:ff:ff:ff:ff:ff';
 const validMac=x=>typeof x==='string'&&/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(x)&&!(parseInt(x.slice(0,2),16)&1)&&x!=='00:00:00:00:00:00';
 const validIp=x=>typeof x==='string'&&/^\d{1,3}(\.\d{1,3}){3}$/.test(x)&&x.split('.').every(v=>+v<=255)&&+x.split('.')[0]>0&&+x.split('.')[0]<224&&+x.split('.')[0]!==127;
 const defaults=()=>({enabled:true,victim:'192.168.1.10',peer:'192.168.1.1',technique:'reply',direction:'both',traffic:'forward',count:1,interval:20});
 const policyDefaults=()=>({vlans:[],trustedPorts:[],bindings:[]});
 function validate(c){
  if(!c||c.enabled!==true||!validIp(c.victim)||!validIp(c.peer)||c.victim===c.peer||!['reply','request'].includes(c.technique)||!['victim','both'].includes(c.direction)||!['drop','forward'].includes(c.traffic)||!Number.isInteger(c.count)||c.count<1||c.count>100||!Number.isInteger(c.interval)||c.interval<10||c.interval>100)throw Error('Choose distinct unicast endpoints, Request or Reply, a direction, Drop or Forward, 1–100 rounds and 10–100 ticks.');
 }
 function validatePolicy(d,c){
  if(d?.type!=='switch'||!c||!Array.isArray(c.vlans)||!Array.isArray(c.trustedPorts)||!Array.isArray(c.bindings)||c.bindings.length>256||c.vlans.some(v=>!d.vlans.some(x=>x.id===v))||new Set(c.vlans).size!==c.vlans.length||c.trustedPorts.some(p=>!d.ports.some(x=>x.id===p))||new Set(c.trustedPorts).size!==c.trustedPorts.length)throw Error('Invalid ARP inspection policy.');
  const keys=new Set();
  for(const b of c.bindings){const key=b.vlan+':'+b.ip;if(!validIp(b.ip)||!validMac(b.mac)||!d.vlans.some(v=>v.id===b.vlan)||!d.ports.some(p=>p.id===b.port)||keys.has(key))throw Error('Each binding needs a unique VLAN/IP, unicast MAC and valid switch port.');keys.add(key);}
 }
 function inspect(n,d,p,f,order,vlan=p.accessVlan||1){
  const c=d.arpInspection;if(f.type!=='ARP'||!c?.vlans.includes(vlan))return null;
  const binding=c.bindings.find(b=>b.vlan===vlan&&b.ip===f.sip),claim=f.sha??f.src;
  let reason='Approved static binding matches IP, MAC, VLAN and ingress port.',action='allow';
  if(c.trustedPorts.includes(p.id))reason='Trusted ingress: bypass ARP inspection.';
  else if(!validIp(f.sip)||!validMac(claim)||!['Request','Reply'].includes(f.op)){action='drop';reason='Invalid ARP sender or operation.';}
  else if(claim.toLowerCase()!==f.src.toLowerCase()){action='drop';reason='Ethernet source differs from ARP sender MAC.';}
  else if(!binding){action='drop';reason='No approved binding for this sender IP in this VLAN.';}
  else if(binding.mac.toLowerCase()!==claim.toLowerCase()||binding.port!==p.id){action='drop';reason='Claim conflicts with the approved MAC or attachment port.';}
  const decision={action,reason,vlan,port:p.id,ip:f.sip,mac:claim,binding:binding?clone(binding):null,order};
  const rows=n.arpDecisions[d.id]||(n.arpDecisions[d.id]=[]);rows.push(decision);if(rows.length>100)rows.shift();return decision;
 }
 function start(n,id){
  const d=n.device(id),c=d?.spooferServer;validate(c);if(!d.ip||d.type!=='host')throw Error('Install ARP Spoofer on a configured host.');
  if(n.queue.length&&!n.ospfOnlyWork())throw Error('Finish the current exchange before starting another attack.');
  const subnet=x=>x.split('.').reduce((v,b)=>(v*256+Number(b))>>>0,0)&(0xffffffff<<(32-d.prefix));
  if([c.victim,c.peer].some(x=>x===d.ip||subnet(x)!==subnet(d.ip)))throw Error('Both endpoints must be other addresses in the attacker subnet and reachable on its local VLAN.');
  n.spoofers[id]={status:'running',sent:0,config:clone(c),captures:[],intercepted:0};n.enqueue({kind:'arp-spoof-send',device:id,attempt:0});
 }
 function stop(n,id){if(n.spoofers[id])n.spoofers[id].status='stopped';n.queue=n.queue.filter(e=>!(e.device===id&&e.kind==='arp-spoof-send'));}
 function handle(n,e,d,p,send){
  const r=n.spoofers[d.id];if(!r||r.status!=='running')return {title:'ARP Spoofer stopped',notes:[]};
  const c=r.config,cache=n.arp[d.id]||{},missing=[c.victim,c.peer].filter(ip=>!cache[ip]);
  if(missing.length){
   if(e.attempt>=3){r.status='unreachable';return {title:'ARP Spoofer cannot resolve endpoints',notes:['No ARP reply from '+missing.join(', ')+'. Check addresses, VLANs, bindings and cables.']};}
   for(const tip of missing)send(p.id,{type:'ARP',op:'Request',src:p.mac,dst:broadcast,sha:p.mac,tha:'00:00:00:00:00:00',sip:d.ip,tip});
   n.enqueue({kind:'arp-spoof-send',device:d.id,attempt:e.attempt+1},20);
   return {title:'Resolve real endpoint MAC addresses',notes:['Use ordinary ARP on this LAN before sending false claims. No endpoint MAC is obtained from topology configuration.']};
  }
  const pairs=[[c.victim,c.peer],...(c.direction==='both'?[[c.peer,c.victim]]:[])];
  for(const [target,claim]of pairs)send(p.id,{type:'ARP',op:c.technique==='request'?'Request':'Reply',src:p.mac,dst:cache[target].mac,sha:p.mac,tha:cache[target].mac,sip:claim,tip:target});
  r.sent++;if(r.sent<c.count)n.enqueue({kind:'arp-spoof-send',device:d.id,attempt:0},c.interval);else r.status='finished';
  return {title:'Send forged ARP '+(c.technique==='request'?'request':'reply'),notes:pairs.map(([target,claim])=>'Tell '+target+' that '+claim+' belongs to attacker MAC '+p.mac+'.').concat('Round '+r.sent+' / '+c.count+'. Forged ARP travels through the normal switch path.')};
 }
 function intercept(n,e,d,p,send,emitIp){
  const r=n.spoofers[d.id],f=e.frame;if(!r||f.type!=='IPv4'||f.dip===d.ip)return null;
  const c=r.config,cache=n.arp[d.id]||{};
  // Select the legitimate L2 next hop from the intercepted Ethernet sender.
  const next=f.sip===c.victim?c.peer:f.src===cache[c.peer]?.mac?c.victim:null;
  if(!next)return null;
  const loop=(f.arpRelays||[]).includes(d.id),forward=c.traffic==='forward'&&!loop;
  const row={order:e.order,source:f.sip,destination:f.dip,protocol:f.tls?'HTTPS / TLS '+f.tls:f.http?'HTTP '+f.http.toLowerCase():f.protocol==='TCP'?'TCP '+(f.flags||'segment'):f.protocol||f.icmp||'IPv4',action:forward?'forward':'drop',encrypted:!!f.tls,content:f.tls?'TLS: encrypted content':f.raw||'',nextHop:next};
  r.intercepted++;r.captures.push(row);if(r.captures.length>100)r.captures.shift();
  if(forward){const packet={...f,arpRelays:[...(f.arpRelays||[]),d.id]};delete packet.src;delete packet.dst;emitIp(p,next,packet);}
  return {title:forward?'Attacker intercepts and forwards':'Attacker drops intercepted traffic',notes:[f.sip+' → '+f.dip+'. '+(forward?'Preserve IP endpoints, TTL and transport data; replace Ethernet addresses for '+next+'.':'No outgoing IPv4 frame.'),loop?'Relay loop prevented.':row.encrypted?'TLS content remains encrypted.':row.content||'Connection metadata is visible.', 'Interception is simulated Ethernet relaying, not an IP router hop.']};
 }
 const api={defaults,policyDefaults,validate,validatePolicy,inspect,start,stop,handle,intercept};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NetworkExplorerArpSecurity=api;
})(globalThis);
