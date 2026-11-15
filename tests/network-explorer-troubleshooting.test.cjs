const {test}=require('node:test'),assert=require('node:assert/strict');
const {Network}=require('../assets/js/network-explorer-engine.js');
const {internet}=require('../assets/js/network-explorer-examples.js');
const lab=require('../assets/js/network-explorer-troubleshooting.js');
for(const sample of [0,0.4,0.99]) test('challenge breaks a working path and repair restores it '+sample,()=>{
 const n=internet(Network).network, before=n.save(), f=lab.create(Network,before,()=>sample);
 assert.equal(lab.probe(Network,before,f.source,f.target),true);
 assert.deepEqual(n.save(),before);
 lab.apply(n,f);assert.equal(lab.probe(Network,n.save(),f.source,f.target),false);
 lab.apply(n,f,true);assert.equal(lab.probe(Network,n.save(),f.source,f.target),true);
 assert.deepEqual(n.save(),before);
});
test('both gateway and interface faults are available',()=>{
 const data=internet(Network).network.save();const kinds=new Set(Array.from({length:10},(_,i)=>lab.create(Network,data,()=>i/10).kind));
 assert.deepEqual([...kinds].sort(),['gateway','port']);
});
test('empty and disconnected networks are rejected without mutations',()=>{
 const n=new Network();assert.throws(()=>lab.create(Network,n.save()),/No verified/);
 const a=n.add('host'),b=n.add('host');n.configure(a.id,'192.168.1.10',24);n.configure(b.id,'192.168.1.20',24);
 const before=n.save();assert.throws(()=>lab.create(Network,before),/No verified/);assert.deepEqual(n.save(),before);
});
for(const level of ['basic','intermediate','advanced']) test('generated '+level+' supports every difficulty and exact repair',()=>{
 for(const sample of [0,0.45,0.99]) {
  const n=lab.generate(Network,level,()=>sample),before=n.save();
  assert.ok(n.devices.length<=60);
  const routers=n.devices.filter(d=>d.type==='router').length,range={basic:[0,0],intermediate:[2,3],advanced:[3,5]}[level];
  assert.ok(routers>=range[0]&&routers<=range[1]);
  for(const difficulty of ['easy','intermediate','hard']) {
   const fault=lab.create(Network,before,()=>sample,difficulty);
   assert.ok(lab.probe(Network,before,fault.source,fault.target));
   lab.apply(n,fault);assert.equal(lab.probe(Network,n.save(),fault.source,fault.target),false);
   lab.apply(n,fault,true);assert.deepEqual(n.save(),before);
   assert.ok(lab.probe(Network,n.save(),fault.source,fault.target));
  }
 }
});
test('generated samples vary their addressing and host counts',()=>{
 assert.notDeepEqual(lab.generate(Network,'advanced',()=>0).save(),lab.generate(Network,'advanced',()=>0.99).save());
});
for(const level of ['basic','intermediate','advanced']) test('generate broken '+level+' verifies each service and its repair',()=>{
 for(const kind of ['port','dns','dhcp','web',...(level==='basic'?[]:['gateway'])]) {
  const {network,baseline,fault}=lab.generateBroken(Network,level,()=>0.45,kind);
  assert.equal(fault.kind,kind);
  assert.ok(lab.verify(Network,baseline,fault));
  assert.equal(lab.verify(Network,network.save(),fault),false);
  if(['dns','web'].includes(kind)) assert.ok(lab.probe(Network,network.save(),fault.source,fault.target),'ping alone cannot prove the service repaired');
  lab.apply(network,fault,true);
  assert.ok(lab.verify(Network,network.save(),fault));
  assert.deepEqual(network.save(),baseline);
 }
});
test('random generation varies topology and keeps all hosts reachable',()=>{
 for(const level of ['basic','intermediate','advanced']) {
  const shapes=new Set();
  for(let seed=1;seed<=12;seed++) {
   let state=seed;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
   const n=lab.generate(Network,level,random),data=n.save(),hosts=n.devices.filter(d=>d.type==='host');
   shapes.add(n.devices.map(d=>d.type).join(',')+':'+n.links.length);
   for(const h of hosts.slice(1)) assert.ok(lab.probe(Network,data,hosts[0].id,h.ip));
  }
  assert.ok(shapes.size>1,level+' topology should vary');
 }
});
