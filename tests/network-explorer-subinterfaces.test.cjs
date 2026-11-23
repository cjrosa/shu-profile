const {test}=require('node:test'),assert=require('node:assert/strict');
const {Network}=require('../assets/js/network-explorer-engine.js');
const {complex}=require('../assets/js/network-explorer-examples.js');
const CLI=require('../assets/js/network-explorer-router-cli.js');
function drain(n){let count=0;while(n.queue.length){n.next();assert.ok(++count<4000);}return n.results.at(-1);}
function campus(){const n=complex(Network).network;return {n,find:name=>n.devices.find(d=>d.name===name)};}
test('both campus VLANs acquire separate DHCP pools and reach routed DNS and HTTP',()=>{
 const {n,find}=campus();
 for(const [name,prefix,logical]of [['Browser Client','192.168.10.','p0.10'],['EE Client A','192.168.40.','p0.40']]){
  const h=find(name);n.acquireDhcp(h.id);assert.equal(drain(n).ok,true);assert.ok(h.ip.startsWith(prefix));assert.equal(h.gateway,prefix+'1');
  assert.ok(n.history.some(e=>e.device===find('Client Router').id&&e.logicalIngress===logical&&e.frame?.dhcp==='Discover'));
  n.browse(h.id,'http://www.campus.example/');assert.equal(drain(n).ok,true);assert.equal(n.httpPages[h.id].code,200);
 }
 n.ping(find('EE Client A').id,find('Browser Client').ip);assert.equal(drain(n).ok,true);
 const routed=n.history.filter(e=>e.device===find('Client Router').id&&e.logicalIngress&&e.outgoingFrames.length);
 assert.ok(routed.some(e=>e.outgoingFrames.some(o=>o.port==='p0'&&o.logicalPort==='p0.10'&&o.frame.vlanTag===10)));
 assert.ok(routed.some(e=>e.outgoingFrames.some(o=>o.port!=='p0'&&o.frame.vlanTag===undefined)));
 assert.ok(Object.values(n.arp[find('Client Router').id]).some(r=>r.interface==='p0.40'));
 assert.deepEqual(new Network(n.save()).save(),n.save());
});
test('parent shutdown and individual subinterface shutdown affect the right connected routes',()=>{
 const {n,find}=campus(),r=find('Client Router');n.configurePort(r.id,'p0.40',{enabled:false});
 assert.ok(!n.routes(r.id).some(r=>r.port==='p0.40'));assert.ok(n.routes(r.id).some(r=>r.port==='p0.10'));
 n.configurePort(r.id,'p0',{enabled:false});assert.ok(!n.routes(r.id).some(r=>r.port.startsWith('p0.')));
 n.configurePort(r.id,'p0',{enabled:true});n.acquireDhcp(find('EE Client A').id);assert.equal(drain(n).ok,false);
 n.acquireDhcp(find('Browser Client').id);assert.equal(drain(n).ok,true);
});
test('unknown VLAN and untagged router uplink frames never reach routing or ARP learning',()=>{
 const {n,find}=campus(),r=find('Client Router');
 for(const tag of [99,undefined,0]){const frame={type:'ARP',op:'Request',src:'02:aa:bb:cc:dd:ee',dst:'ff:ff:ff:ff:ff:ff',sip:'192.168.40.50',tip:'192.168.40.1',...(tag===undefined?{}:{vlanTag:tag})};n.enqueue({kind:'receive',device:r.id,ingress:'p0',frame});const e=n.next();assert.equal(e.outputs.length,0);assert.equal(Object.keys(n.arp[r.id]).length,0);}
});
test('subinterface validation rejects duplicate VLANs, invalid saves and physical cables',()=>{
 const {n,find}=campus(),r=find('Client Router'),before=n.save();
 assert.throws(()=>n.addSubinterface(r.id,'p0',99,40),/unique VLAN/);assert.deepEqual(n.save(),before);
 assert.throws(()=>n.configureInterface(r.id,'p0','192.168.50.1',24),/subinterface/);
 assert.throws(()=>n.connect(r.id,'p0.10',find('Campus Server').id,'p0'),/valid interface/);
 for(const change of [p=>p.vlanId=5000,p=>p.parentPort='p7',p=>p.mac='02:00:00:00:00:ff',p=>p.vlanId=10]){const saved=n.save();change(saved.devices.find(d=>d.id===r.id).ports.find(p=>p.id==='p0.40'));assert.throws(()=>new Network(saved),/subinterface/);}
 n.removeSubinterface(r.id,'p0.40');assert.ok(!n.routes(r.id).some(r=>r.port==='p0.40'));
});
test('Cisco CLI creates, configures, displays and removes a tagged subinterface',()=>{
 const n=new Network(),r=n.add('router'),context={mode:'exec'},run=cmd=>CLI.run(n,r.id,context,cmd,fn=>fn(),'cisco');
 run('configure terminal');run('interface GigabitEthernet0/0.40');
 assert.throws(()=>run('ip address 192.168.40.1 255.255.255.0'),/encapsulation/);
 run('encapsulation dot1Q 40');run('ip address 192.168.40.1 255.255.255.0');run('ip helper-address 192.168.20.2');
 assert.match(run('show ip interface brief'),/G0\/0.40.*192.168.40.1.*dot1Q 40/);assert.match(run('show ip route'),/192.168.40.0\/24/);
 run('shutdown');assert.ok(!n.routes(r.id).length);run('no shutdown');assert.equal(n.routes(r.id).length,1);
 run('exit');run('no interface G0/0.40');assert.equal(r.ports.length,2);
});

test('platform normalization retains logical names and automatic VLAN colors stay consistent',()=>{
 const {n,find}=campus(),r=find('Client Router'),platform=require('../assets/js/network-explorer-platform.js');
 platform.normalize(n);assert.equal(r.ports.find(p=>p.id==='p0.40').name,'G0/0.40');assert.deepEqual(new Network(n.save()).save(),n.save());
 const switches=n.devices.filter(d=>d.vlans?.some(v=>v.id===40));
 assert.notEqual(switches[0].vlans.find(v=>v.id===10).color,switches[0].vlans.find(v=>v.id===40).color);
 assert.ok(switches.every(d=>d.vlans.find(v=>v.id===40).color===switches[0].vlans.find(v=>v.id===40).color));
 const sw=switches[0];n.setVlan(sw.id,40,'EE renamed');assert.equal(sw.vlans.find(v=>v.id===40).color,switches[1].vlans.find(v=>v.id===40).color);
});
