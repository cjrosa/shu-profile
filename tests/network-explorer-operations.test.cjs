const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Network}=require('../assets/js/network-explorer-engine.js');
const Operations=require('../assets/js/network-explorer-operations.js');
let store, owner;
Operations.install(Network,(n,d)=>store.begin(n,d,owner));
function setup(){
  store=new Operations.Store();owner={};
  const n=new Network(),a=n.add('host'),b=n.add('host'),s=n.add('switch');
  n.configure(a.id,'192.168.1.10',24);n.configure(b.id,'192.168.1.20',24);
  n.connect(a.id,'p0',s.id,'p0');n.connect(b.id,'p0',s.id,'p1');
  n.configureDnsAddress(a.id,b.ip);n.configureDnsServer(b.id,{enabled:true,records:[{name:'server.example',address:b.ip,ttl:120}]});
  n.configureWeb(a.id,{enabled:true,url:'http://server.example/'},'browser');n.configureWeb(b.id,{enabled:true,port:80,title:'Test',body:'Hello'});
  return {n,a,b,s};
}
function drain(n,preview=false){
  let count=0;
  while(n.queue.length){
    assert.ok(++count<2000);
    if(preview){const trial=Object.assign(new Network(),JSON.parse(JSON.stringify(n)));trial.copyRuntimeFrom(n);n=trial;}
    const report=n.next();store.capture(n,report,owner);store.settle(n,owner);
  }
  return n;
}
test('DNS, ARP, TCP and HTTP remain one operation through speculative clones',()=>{
  let {n,a}=setup();n.browse(a.id,'http://server.example/');n=drain(n,true);
  assert.equal(store.entries.length,1);const op=store.entries[0];
  assert.equal(op.status,'completed');assert.ok(op.reports.some(r=>r.frame?.dns));assert.ok(op.reports.some(r=>r.frame?.http));
  assert.ok(n.history.every(r=>r.operationId===op.id));assert.ok(Operations.stages(op).length<=5);
  assert.equal(op.topology.devices.find(d=>d.id===a.id).name,a.name);
});
test('concurrent probes retain separate results and causal packet histories',()=>{
  const {n,a,b}=setup();n.ping(a.id,b.ip);n.ping(b.id,a.ip);drain(n);
  assert.equal(store.entries.length,2);
  for(const op of store.entries){assert.equal(op.status,'completed');assert.ok(op.reports.length);assert.ok(op.reports.every(r=>r.operationId===op.id));}
  assert.notEqual(n.results[0].operationId,n.results[1].operationId);
});
test('failed forwarding has a concise stopping reason; rerunning records a new attempt',()=>{
  const {n,a}=setup();n.ping(a.id,'10.0.0.1');drain(n);
  const op=store.entries[0];assert.equal(op.status,'stopped');assert.match(op.result,/gateway/i);
  assert.ok(Operations.stages(op).some(s=>/gateway/i.test(s.summary)));
  n.ping(a.id,a.ip);drain(n);assert.equal(store.entries.length,2);assert.equal(store.entries[0].status,'completed');
});
test('DNS failures stop name-based ping and cached answers retain their own operation',()=>{
  const {n,a}=setup();n.lookupDns(a.id,'missing.example',true);drain(n);
  assert.equal(store.entries.length,1);assert.equal(store.entries[0].status,'stopped');assert.match(store.entries[0].result,/NXDOMAIN/);
  n.lookupDns(a.id,'server.example');drain(n);n.lookupDns(a.id,'server.example');drain(n);
  assert.equal(store.entries.length,3);assert.equal(store.entries[0].status,'completed');assert.match(store.entries[0].result,/cache/);
});
test('web name lookup failure remains one failed web operation',()=>{
  const {n,a}=setup();n.browse(a.id,'http://missing.example/');drain(n);
  assert.equal(store.entries.length,1);assert.equal(store.entries[0].status,'stopped');
  assert.ok(store.entries[0].reports.some(r=>/DNS name not found/.test(r.title)));
});
test('traceroute internal probes do not create extra history entries',()=>{
  const {n,a,b}=setup();n.traceroute(a.id,b.ip);drain(n);assert.equal(store.entries.length,1);assert.equal(store.entries[0].status,'completed');
});
test('scan is completed even when its result has no boolean ok field',()=>{
  const {n,a,b}=setup();a.nmapServer={enabled:true};n.scan(a.id,'nmap -sS -p 80,81 '+b.ip);drain(n);
  assert.equal(store.entries.length,1);assert.equal(store.entries[0].status,'completed');
});
test('DHCP request records the resulting lease and background steps create no operations',()=>{
  const {n,a,b}=setup();n.configureDhcpServer(b.id,{enabled:true,pools:[{name:'LAN',network:'192.168.1.0',prefix:24,start:'192.168.1.100',end:'192.168.1.110',gateway:'',dns:'',leaseSeconds:120}]});
  n.configureAddressMode(a.id,'dhcp');n.acquireDhcp(a.id);drain(n);
  assert.equal(store.entries.length,1);assert.equal(store.entries[0].status,'completed');assert.match(n.device(a.id).ip,/192\.168\.1\.10\d/);
});
test('recordings are immutable copies, bounded and explicitly interrupted on reset',()=>{
  const {n,a,b}=setup();store=new Operations.Store(2,2);n.ping(a.id,b.ip);drain(n);
  const op=store.entries[0];assert.equal(op.reports.length,2);assert.equal(op.truncated,true);
  n.devices[0].name='Changed';n.history[0].title='Changed';assert.notEqual(op.topology.devices[0].name,'Changed');assert.notEqual(op.reports[0].title,'Changed');
  n.ping(a.id,b.ip);store.interrupt(owner);assert.match(store.entries[0].result,/Interrupted/);
});
test('OSPF maintenance interleaved before a probe timeout stays outside its recording',()=>{
  const {n,a}=setup();const r=n.add('router');n.configureInterface(r.id,'p0','10.0.0.1',30);
  const c=require('../assets/js/network-explorer-ospf.js').defaults(r);c.enabled=true;c.interfaces.p0.mode='active';n.configureOspf(r.id,c);drain(n);
  n.ping(a.id,'192.168.1.99');drain(n);
  assert.equal(store.entries.length,1);assert.equal(store.entries[0].status,'stopped');
  assert.ok(n.history.some(e=>e.ospf||e.kind.startsWith('ospf-')));
  assert.ok(store.entries[0].reports.every(e=>!e.ospf&&!e.kind.startsWith('ospf-')));
});
