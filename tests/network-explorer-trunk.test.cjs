const {test}=require('node:test'),assert=require('node:assert/strict');
const {Network}=require('../assets/js/network-explorer-engine.js'),VLAN=require('../assets/js/network-explorer-vlan.js');
function drain(n){let steps=0;while(n.queue.length){n.next();assert.ok(++steps<5000);}return n.results.at(-1);}
function setup(){
 const n=new Network(),a=n.add('switch'),b=n.add('switch'),hosts=[];
 for(const s of [a,b]){for(const id of [10,20])n.setVlan(s.id,id);n.configurePort(s.id,'p0',{mode:'trunk',allowedVlans:[1,10,20],nativeVlan:1});}
 n.connect(a.id,'p0',b.id,'p0');
 for(const s of [a,b])for(const [i,vlan] of [10,20].entries()){const h=n.add('host');n.configure(h.id,'192.168.1.'+(hosts.length+1),24);n.configurePort(s.id,'p'+(i+1),{accessVlan:vlan});n.connect(h.id,'p0',s.id,'p'+(i+1));hosts.push(h);}
 return {n,a,b,hosts};
}
test('trunks tag ARP and ICMP, remove tags for hosts, and isolate broadcasts and unicast',()=>{
 const {n,a,b,hosts:h}=setup();n.ping(h[0].id,h[2].ip);assert.equal(drain(n).ok,true);
 assert.ok(n.history.some(e=>e.device===b.id&&e.frame?.vlanTag===10));
 assert.ok(n.history.filter(e=>h.some(x=>x.id===e.device)&&e.frame).every(e=>e.frame.vlanTag===undefined));
 assert.ok(!n.history.some(e=>[h[1].id,h[3].id].includes(e.device)&&e.frame));
 assert.equal(n.mac[b.id]['10:'+h[0].ports[0].mac].port,'p0');
 n.ping(h[1].id,h[3].ip);assert.equal(drain(n).ok,true);n.ping(h[0].id,h[3].ip);assert.equal(drain(n).ok,false);
});
test('allowed VLANs gate both ingress and egress before learning',()=>{
 for(const side of ['a','b']){const {n,a,b,hosts:h}=setup();n.configurePort(({a,b})[side].id,'p0',{allowedVlans:[20]});n.ping(h[0].id,h[2].ip);assert.equal(drain(n).ok,false);assert.ok(!n.mac[b.id]?.['10:'+h[0].ports[0].mac]);n.ping(h[1].id,h[3].ip);assert.equal(drain(n).ok,true);}
});
test('native VLAN traffic is untagged; mismatch reclassifies and can cross VLAN boundaries',()=>{
 const {n,a,b,hosts:h}=setup();for(const s of [a,b])n.configurePort(s.id,'p0',{nativeVlan:10});n.ping(h[0].id,h[2].ip);assert.equal(drain(n).ok,true);assert.ok(n.history.filter(e=>e.frame&&e.ingress==='p0'&&[a.id,b.id].includes(e.device)).every(e=>e.frame.vlanTag===undefined));
 n.configurePort(b.id,'p0',{nativeVlan:20});n.ping(h[0].id,h[3].ip);assert.equal(drain(n).ok,true);assert.ok(n.history.some(e=>e.device===b.id&&e.vlan===20&&e.frame?.vlanTag===undefined));
});
test('port validation is atomic, saved trunks round-trip, and old access networks still load',()=>{
 const {n,a}=setup(),saved=n.save();assert.deepEqual(new Network(saved).save(),saved);
 for(const changes of [{allowedVlans:[999]},{allowedVlans:[10,10]},{nativeVlan:999},{mode:'bad'}]){assert.throws(()=>n.configurePort(a.id,'p0',changes));assert.deepEqual(n.save(),saved);}
 assert.throws(()=>new Network({...saved,devices:saved.devices.map(d=>d.id===a.id?{...d,ports:d.ports.map(p=>p.id==='p0'?{...p,allowedVlans:[999]}:p)}:d)}));
 const old=new Network(),sw=old.add('switch');assert.equal(new Network(old.save()).device(sw.id).ports[0].mode,'access');assert.deepEqual(VLAN.parse('10,20',a),[10,20]);assert.deepEqual(VLAN.parse('none',a),[]);assert.throws(()=>VLAN.parse('10-20',a));
 n.configurePort(a.id,'p0',{mode:'access'});assert.equal(n.device(a.id).ports[0].mode,'access');
});
test('tagged frames on access ports and unsupported endpoints are dropped without learning',()=>{
 const {n,a,hosts:h}=setup();const frame={type:'ARP',op:'Request',src:h[0].ports[0].mac,dst:'ff:ff:ff:ff:ff:ff',sip:h[0].ip,tip:h[2].ip,vlanTag:10};
 n.enqueue({kind:'receive',device:a.id,ingress:'p1',frame});drain(n);assert.deepEqual(n.mac[a.id],{});assert.match(n.history.at(-1).title,/VLAN admission/);
 for(const type of ['host','router','firewall']){const d=n.add(type);n.enqueue({kind:'receive',device:d.id,ingress:'p0',frame});drain(n);assert.equal(n.history.at(-1).title,'Unsupported tagged frame');}
 assert.ok(VLAN.classify(a,a.ports[0],{vlanTag:0}).error);
});
test('ARP inspection uses the tagged VLAN on untrusted trunks',()=>{
 const {n,b,hosts:h}=setup();n.configureArpInspection(b.id,{vlans:[10],trustedPorts:[],bindings:[]});n.ping(h[0].id,h[2].ip);assert.equal(drain(n).ok,false);assert.ok(n.arpDecisions[b.id].some(e=>e.vlan===10&&e.port==='p0'&&e.action==='drop'));assert.ok(!n.mac[b.id]?.['10:'+h[0].ports[0].mac]);
 n.configureArpInspection(b.id,{vlans:[10],trustedPorts:[],bindings:[{ip:h[0].ip,mac:h[0].ports[0].mac,vlan:10,port:'p0'},{ip:h[2].ip,mac:h[2].ports[0].mac,vlan:10,port:'p1'}]});n.ping(h[0].id,h[2].ip);assert.equal(drain(n).ok,true);
});
test('campus remote client obtains DHCP across tagged trunks and loads the routed web page',()=>{
 const {network:n,remoteClientId}=require('../assets/js/network-explorer-examples.js').complex(Network);n.acquireDhcp(remoteClientId);assert.equal(drain(n).ok,true);assert.equal(n.device(remoteClientId).gateway,'192.168.10.1');
 assert.ok(n.history.some(e=>e.frame?.dhcp==='Discover'&&e.frame.vlanTag===10));n.browse(remoteClientId,'http://www.campus.example/');assert.equal(drain(n).ok,true);assert.equal(n.httpPages[remoteClientId].code,200);
});
test('segment traversal follows native and allowed VLAN rules without leaking between tagged VLANs',()=>{
 const {n,a,b,hosts:h}=setup();const ids=()=>VLAN.segment(n,h[0].id,'p0').map(([id])=>id);assert.ok(ids().includes(h[2].id));assert.ok(!ids().includes(h[3].id));n.configurePort(b.id,'p0',{allowedVlans:[20]});assert.ok(!ids().includes(h[2].id));
});

test('mixed egress produces independent tagged and untagged copies',()=>{
 const {n,a,hosts:h}=setup();const local=n.add('host');n.configurePort(a.id,'p3',{accessVlan:10});n.connect(a.id,'p3',local.id,'p0');n.ping(h[0].id,h[2].ip);drain(n);
 const event=n.history.find(e=>e.device===a.id&&e.frame?.type==='ARP'&&e.frame.op==='Request');assert.equal(event.outgoingFrames.find(o=>o.port==='p0').frame.vlanTag,10);assert.equal(event.outgoingFrames.find(o=>o.port==='p3').frame.vlanTag,undefined);assert.equal(event.frame.vlanTag,undefined);
});
test('wire-tag filters remain distinct from switch classification',()=>{
 const {match}=require('../assets/js/network-explorer-filter.js'),row={proto:'ARP',info:'',device:'',e:{vlan:10,notes:[],frame:{}}};assert.ok(match(row,'vlan == 10'));assert.ok(!match(row,'vlan.tag == 10'));assert.ok(match(row,'untagged'));row.e.frame.vlanTag=10;assert.ok(match(row,'vlan.tag == 10'));assert.ok(match(row,'tagged'));assert.ok(!match(row,'untagged'));
});
