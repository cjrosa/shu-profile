const {test}=require('node:test'),assert=require('node:assert/strict');
const {Network}=require('../assets/js/network-explorer-engine.js');
const {complex}=require('../assets/js/network-explorer-examples.js');
function drain(n){let steps=0;while(n.queue.length){n.next();assert.ok(++steps<1500);}return n.results.at(-1);}
test('campus triangle has three routers, three switches, independent LANs and working DHCP/DNS/HTTP',()=>{
 const {network:n,clientId}=complex(Network),routers=n.devices.filter(d=>d.type==='router');
 assert.equal(routers.length,3);assert.equal(n.devices.filter(d=>d.type==='switch').length,3);
 assert.ok(routers.every(r=>r.ports.length===3));assert.ok(n.devices.every(d=>!d.watch));
 const transit=n.links.filter(l=>n.device(l.a).type==='router'&&n.device(l.b).type==='router');assert.equal(transit.length,3);
 assert.ok(routers.every(r=>transit.filter(l=>l.a===r.id||l.b===r.id).length===2));
 for(const l of transit){assert.equal(n.device(l.a).ports.find(p=>p.id===l.ap).prefix,30);assert.equal(n.device(l.b).ports.find(p=>p.id===l.bp).prefix,30);}
 const saved=n.save();assert.deepEqual(new Network(saved).save(),saved);
 n.acquireDhcp(clientId);assert.equal(drain(n).ok,true);const client=n.device(clientId);assert.equal(client.ip,'192.168.10.100');assert.equal(client.gateway,'192.168.10.1');assert.equal(client.dnsServerAddress,'192.168.20.3');
 assert.ok(n.history.some(r=>r.frame?.giaddr==='192.168.10.1'));
 n.browse(clientId,'http://www.campus.example/');assert.equal(drain(n).ok,true);assert.equal(n.httpPages[clientId].code,200);
 assert.ok(n.history.some(r=>r.kind==='dns-application'));assert.ok(n.history.some(r=>r.kind==='web-application'));
});
test('routed triangles are allowed but Ethernet loops remain blocked',()=>{
 const n=new Network(),a=n.add('switch'),b=n.add('switch'),c=n.add('switch');n.connect(a.id,'p0',b.id,'p0');n.connect(b.id,'p1',c.id,'p0');assert.throws(()=>n.connect(c.id,'p1',a.id,'p1'),/Layer 2 loop/);
 const {network:campus}=complex(Network),saved=campus.save(),router=saved.devices.find(d=>d.type==='router');router.ports[2].ip=router.ports[0].ip;router.ports[2].prefix=24;assert.throws(()=>new Network(saved),/Overlapping/);
});
