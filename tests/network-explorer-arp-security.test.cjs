const {test}=require('node:test'),assert=require('node:assert/strict');
const {Network}=require('../assets/js/network-explorer-engine.js'),E=require('../assets/js/network-explorer-examples.js');
function drain(n,trial=false){let steps=0;while(n.queue.length){if(trial){const next=Object.assign(new Network(),JSON.parse(JSON.stringify(n)));next.copyRuntimeFrom(n);n=next;}n.next();assert.ok(++steps<5000,'bounded event queue');}return n;}
function browse(n,e){n.browse(e.clientId,n.device(e.clientId).browserServer.url);return drain(n);}
test('one-sided poisoning drops routed HTTP; enabling DAI preserves damage until explicit recovery',()=>{
 const e=E.arpSecurity(Network,'drop'),n=e.network; browse(n,e);assert.equal(n.httpPages[e.clientId].code,200);
 n.spooferControl(e.sourceId,'start');drain(n);assert.equal(n.arp[e.clientId]['192.168.1.1'].mac,n.device(e.sourceId).ports[0].mac);
 browse(n,e);assert.match(n.httpPages[e.clientId].status,/timed out/);
 const sw=n.device(e.switchId);n.configureArpInspection(sw.id,{...sw.arpInspection,vlans:[1]});assert.equal(n.arp[e.clientId]['192.168.1.1'].mac,n.device(e.sourceId).ports[0].mac);
 browse(n,e);assert.match(n.httpPages[e.clientId].status,/timed out/);
 n.clearArpCache(e.clientId);browse(n,e);assert.equal(n.httpPages[e.clientId].code,200);
 n.spooferControl(e.sourceId,'start');drain(n);browse(n,e);assert.equal(n.httpPages[e.clientId].code,200);assert.ok(n.arpDecisions[sw.id].some(x=>x.action==='drop'));
});
for(const technique of ['reply','request'])test('two-sided '+technique+' poisoning forwards HTTP across a real gateway in staged snapshots',()=>{
 const e=E.arpSecurity(Network);let n=e.network;n.configureSpoofer(e.sourceId,{...n.device(e.sourceId).spooferServer,technique});n.spooferControl(e.sourceId,'start');n=drain(n,true);
 assert.equal(n.arp[e.gatewayId]['p0:192.168.1.10'].mac,n.device(e.sourceId).ports[0].mac);
 n.browse(e.clientId,'http://192.168.2.20/');n=drain(n,true);assert.equal(n.httpPages[e.clientId].code,200);
 const captures=n.spoofers[e.sourceId].captures;assert.ok(captures.some(x=>x.content.includes('GET /')));assert.ok(captures.some(x=>x.content.includes('This HTTP page')));assert.ok(captures.every(x=>x.action==='forward'));
});
test('HTTPS interception retains opaque records while endpoints decrypt successfully',()=>{
 const e=E.arpSecurity(Network),n=e.network,server=n.device(e.serverId);n.configureWeb(server.id,{...server.webServer,tls:true,port:443,certificateName:server.ip,certificateTrusted:true,certificateValid:true});n.configureWeb(e.clientId,{enabled:true,url:'https://192.168.2.20/'},'browser');
 n.spooferControl(e.sourceId,'start');drain(n);browse(n,e);assert.equal(n.httpPages[e.clientId].code,200);assert.equal(n.httpPages[e.clientId].secure,true);
 const captures=n.spoofers[e.sourceId].captures;assert.ok(captures.some(x=>x.encrypted));assert.ok(captures.every(x=>!x.content.includes('This HTTP page')&&!x.content.includes('GET /')));
});
test('DAI validates requests and replies before learning; trust bypass demonstrates a repairable fault',()=>{
 const e=E.arpSecurity(Network,'protected'),n=e.network,sw=n.device(e.switchId),source=n.device(e.sourceId);
 for(const technique of ['request','reply']){n.configureSpoofer(source.id,{...source.spooferServer,technique});n.spooferControl(source.id,'start');drain(n);browse(n,e);assert.equal(n.httpPages[e.clientId].code,200);assert.equal(n.spoofers[source.id].intercepted,0);}
 const p=sw.ports[1],bad={type:'ARP',op:'Reply',src:'02:aa:bb:cc:dd:ee',sha:source.ports[0].mac,sip:source.ip,tip:'192.168.1.10',dst:n.device(e.clientId).ports[0].mac};
 n.enqueue({kind:'receive',device:sw.id,ingress:p.id,frame:bad});const r=n.next();assert.equal(r.arpInspection.action,'drop');assert.deepEqual(r.outputs,[]);assert.equal(n.mac[sw.id][bad.src],undefined);
 n.configureArpInspection(sw.id,{...sw.arpInspection,trustedPorts:[p.id]});n.spooferControl(source.id,'start');drain(n);browse(n,e);assert.ok(n.spoofers[source.id].intercepted>0);
 n.configureArpInspection(sw.id,{...sw.arpInspection,trustedPorts:[]});n.clearArpCache(e.clientId);n.clearArpCache(e.gatewayId);n.spooferControl(source.id,'start');drain(n);browse(n,e);assert.equal(n.spoofers[source.id].intercepted,0);
});
test('rounds are bounded, concurrent client traffic shares the queue, stop preserves caches, reset clears runtime',()=>{
 const e=E.arpSecurity(Network),n=e.network;n.configureSpoofer(e.sourceId,{...n.device(e.sourceId).spooferServer,count:100});n.spooferControl(e.sourceId,'start');while(!n.spoofers[e.sourceId].sent)n.next();
 n.browse(e.clientId,'http://192.168.2.20/');assert.throws(()=>n.browse(e.clientId,'http://192.168.2.20/'),/already has/);drain(n);assert.equal(n.httpPages[e.clientId].code,200);assert.equal(n.spoofers[e.sourceId].sent,100);assert.ok(n.spoofers[e.sourceId].captures.length<=100);
 n.spooferControl(e.sourceId,'start');while(!n.spoofers[e.sourceId].sent)n.next();n.spooferControl(e.sourceId,'stop');drain(n);assert.equal(n.spoofers[e.sourceId].sent,1);assert.equal(n.arp[e.clientId]['192.168.1.1'].mac,n.device(e.sourceId).ports[0].mac);
 n.reset();assert.deepEqual(n.spoofers,{});assert.deepEqual(n.arp,{});assert.deepEqual(n.arpDecisions,{});
});
test('VLAN isolation prevents endpoint discovery and save/load validates configuration without runtime',()=>{
 const e=E.arpSecurity(Network),n=e.network,sw=n.device(e.switchId);n.setVlan(sw.id,10,'Other','#123456');n.configurePort(sw.id,'p1',{accessVlan:10});n.spooferControl(e.sourceId,'start');drain(n);assert.equal(n.spoofers[e.sourceId].status,'unreachable');assert.equal(n.arp[e.clientId]?.['192.168.1.1'],undefined);
 const data=n.save(),loaded=new Network(data);assert.equal(loaded.device(e.sourceId).spooferServer.traffic,'forward');assert.deepEqual(loaded.spoofers,{});assert.deepEqual(loaded.arpDecisions,{});
 data.devices.find(d=>d.id===sw.id).arpInspection.bindings[0].port='p99';assert.throws(()=>new Network(data),/binding/);
 const bad=n.save();bad.devices.find(d=>d.id===e.sourceId).spooferServer.count=101;assert.throws(()=>new Network(bad));
});
test('ARP hardware claims are separate from Ethernet identity and recover through ordinary cache expiry',()=>{
 const e=E.arpSecurity(Network),n=e.network,client=n.device(e.clientId),source=n.device(e.sourceId),claim='02:aa:bb:cc:dd:ee';
 n.transmit(source,'p0',{type:'ARP',op:'Reply',src:source.ports[0].mac,dst:client.ports[0].mac,sha:claim,tha:client.ports[0].mac,sip:'192.168.1.1',tip:client.ip});drain(n);
 assert.equal(n.arp[client.id]['192.168.1.1'].mac,claim);assert.ok(n.mac[e.switchId][source.ports[0].mac]);assert.equal(n.mac[e.switchId][claim],undefined);
 n.age(Date.now()+121000);assert.equal(n.arp[client.id]['192.168.1.1'],undefined);browse(n,e);assert.equal(n.httpPages[client.id].code,200);
});
test('same-LAN peer interception supports concurrent ping and prevents a relay loop',()=>{
 const e=E.arpSecurity(Network),n=e.network,client=n.device(e.clientId),source=n.device(e.sourceId),peer=n.add('host');n.configure(peer.id,'192.168.1.20',24);n.connect(peer.id,'p0',e.switchId,'p3');
 n.configureSpoofer(source.id,{...source.spooferServer,peer:peer.ip,count:5});n.spooferControl(source.id,'start');while(n.arp[client.id]?.[peer.ip]?.mac!==source.ports[0].mac||n.arp[peer.id]?.[client.ip]?.mac!==source.ports[0].mac)n.next();n.ping(client.id,peer.ip);assert.throws(()=>n.ping(client.id,peer.ip),/already has/);drain(n);assert.equal(n.results.at(-1).ok,true);assert.ok(n.spoofers[source.id].intercepted>=2);
 n.enqueue({kind:'receive',device:source.id,ingress:'p0',frame:{type:'IPv4',src:client.ports[0].mac,dst:source.ports[0].mac,sip:client.ip,dip:peer.ip,icmp:'Echo Request',ttl:64,arpRelays:[source.id]}});const r=n.next();assert.deepEqual(r.outputs,[]);assert.match(r.notes.join(' '),/loop prevented/);
});
test('missing bindings fail closed, wrong attachment ports drop, and policy edits preserve unrelated state',()=>{
 const e=E.arpSecurity(Network,'protected'),n=e.network,sw=n.device(e.switchId),client=n.device(e.clientId);browse(n,e);const page=n.httpPages[client.id],cache=JSON.stringify(n.arp);
 n.configureArpInspection(sw.id,{...sw.arpInspection,bindings:sw.arpInspection.bindings.filter(b=>b.ip!==client.ip)});assert.equal(n.httpPages[client.id],page);assert.equal(JSON.stringify(n.arp),cache);
 n.clearArpCache(client.id);browse(n,e);assert.match(n.httpPages[client.id].status,/timed out/);assert.ok(n.arpDecisions[sw.id].some(r=>r.action==='drop'&&r.reason.includes('No approved')));
 n.configureArpInspection(sw.id,{...sw.arpInspection,bindings:[...sw.arpInspection.bindings,{ip:client.ip,mac:client.ports[0].mac,vlan:1,port:'p4'}]});browse(n,e);assert.match(n.httpPages[client.id].status,/timed out/);
 const saved=n.save();saved.devices.find(d=>d.id===sw.id).platform='paloalto';const restored=new Network(saved);assert.equal(restored.device(sw.id).arpInspection.bindings.at(-1).port,'p4');assert.deepEqual(restored.arpDecisions,{});
});
