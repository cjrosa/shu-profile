const test=require('node:test');
const assert=require('node:assert/strict');
const {Network}=require('../assets/js/network-explorer-engine.js');
const W=require('../assets/js/network-explorer-wireless.js');
const T=require('../assets/js/network-explorer-troubleshooting.js');
function drain(n){let i=0;while(n.queue.length&&i++<3000)n.next();assert.equal(n.queue.length,0);}
function fixture(){const e=W.example(Network);return {n:e.network,id:e.clientId,ap:e.network.devices.find(d=>d.role==='ap')};}
test('wireless bridges DHCP, ARP, and unmodified IP TTL to Ethernet',()=>{
 const {n,id,ap}=fixture();assert.equal(n.wifiStatus(id),'Associated');assert.equal(n.device(id).ip,'192.168.50.100');
 n.ping(id,'192.168.50.10');drain(n);assert.ok(n.results.some(r=>r.target==='192.168.50.10'&&r.ok));
 assert.ok(Object.values(n.mac[ap.id]).length);const r=n.history.find(r=>r.device===ap.id&&r.frame?.icmp==='Echo Request');assert.ok(r);assert.equal(r.outgoingFrames[0].frame.ttl,r.frame.ttl);
});
test('wrong password blocks DHCP; correction allows fresh DHCP and ping',()=>{
 const {n,id,ap}=fixture();n.disconnectWifi(id);n.joinWifi(id,ap.id,'wrong-password');assert.equal(n.wifiStatus(id),'Authenticating');drain(n);assert.equal(n.wifiStatus(id),'Authentication failed');
 n.acquireDhcp(id);drain(n);assert.equal(n.device(id).ip,'');assert.ok(!n.history.some(r=>r.device===ap.id&&r.frame?.dhcp));
 n.joinWifi(id,ap.id,'classroom123');drain(n);n.acquireDhcp(id);drain(n);n.ping(id,'192.168.50.10');drain(n);assert.ok(n.results.some(r=>r.target==='192.168.50.10'&&r.ok));
});
test('Open Wi-Fi, disabled radio, and disconnected clients enforce admission',()=>{
 const {n,id,ap}=fixture();n.configureWireless(ap.id,{ssid:'Open LAN',security:'open',password:''});n.joinWifi(id,ap.id,'');drain(n);assert.equal(n.wifiStatus(id),'Associated');
 n.configurePort(id,'p0',{enabled:false});assert.equal(n.wifiStatus(id),'Disconnected');n.configurePort(id,'p0',{enabled:true});n.disconnectWifi(id);assert.equal(n.wifiStatus(id),'Disconnected');assert.equal(n.device(id).ip,'');assert.ok(!n.links.some(l=>l.medium==='wifi'));
});
test('save/load preserves association configuration but drops DHCP lease',()=>{
 const {n,id}=fixture();const restored=new Network(n.save());assert.equal(restored.wifiStatus(id),'Associated');assert.equal(restored.device(id).ip,'');assert.equal(restored.links.filter(l=>l.medium==='wifi').length,1);
 restored.acquireDhcp(id);drain(restored);assert.equal(restored.device(id).ip,'192.168.50.100');
});
test('staged playback JSON clone preserves pending authentication',()=>{
 const {n,id,ap}=fixture();n.joinWifi(id,ap.id,'wrong-password');let staged=Object.assign(new Network(),JSON.parse(JSON.stringify(n)));assert.equal(staged.wifiStatus(id),'Authenticating');staged.next();staged=Object.assign(new Network(),JSON.parse(JSON.stringify(staged)));drain(staged);assert.equal(staged.wifiStatus(id),'Authentication failed');
});
test('cabling and imported wireless topology are validated',()=>{
 const {n,id,ap}=fixture(),h=n.add('host');assert.throws(()=>n.connect(h.id,'p0',ap.id,'p7'),/Join Wi-Fi/);assert.throws(()=>n.connect(id,'p0',h.id,'p0'),/Join Wi-Fi/);
 const data=n.save();data.links.find(l=>l.medium==='wifi').medium='ethernet';assert.throws(()=>new Network(data),/medium/);
 assert.throws(()=>n.configureWireless(ap.id,{ssid:'',security:'wpa2',password:'123'}));
});
test('seven clients share the radio; an eighth cannot displace existing clients',()=>{
 const n=new Network(),ap=n.add('ap');for(let i=0;i<7;i++){const h=n.add('laptop');n.joinWifi(h.id,ap.id,'classroom123');drain(n);assert.equal(n.wifiStatus(h.id),'Associated');}
 const extra=n.add('laptop');assert.throws(()=>n.joinWifi(extra.id,ap.id,'classroom123'),/slots/);assert.equal(n.links.length,7);
});
test('wireless troubleshooting verifies DHCP AND ping and supports restore',()=>{
 const {n,id}=fixture(),baseline=n.save(),fault=T.create(Network,baseline,Math.random,'wireless');assert.ok(T.verify(Network,baseline,fault));T.apply(n,fault);assert.equal(T.verify(Network,n.save(),fault),false);T.apply(n,fault,true);assert.ok(T.verify(Network,n.save(),fault));
 n.links.find(l=>l.a===n.devices.find(d=>d.type==='host'&&!d.wifi).id).enabled=false;assert.equal(T.verify(Network,n.save(),fault),false);
 const restored=new Network(baseline);assert.equal(restored.wifiStatus(id),'Associated');assert.ok(T.verify(Network,restored.save(),fault));
});
