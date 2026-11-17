const {test}=require('node:test'),assert=require('node:assert/strict');const {Network}=require('../assets/js/network-explorer-engine.js'),E=require('../assets/js/network-explorer-examples.js');
function drain(n){let count=0,peak=0;while(n.queue.length){peak=Math.max(peak,n.queue.length);n.next();assert.ok(++count<5000);}return peak;}
test('DoS exhausts pending slots, legitimate check fails, expiry recovers, and source rule protects service',()=>{
 const e=E.dos(Network),n=e.network; n.browse(e.clientId,'https://192.168.1.2/');drain(n);assert.equal(n.httpPages[e.clientId].code,200);
 n.generatorControl(e.sourceId,'start',e.clientId);assert.ok(drain(n)<200);assert.match(n.httpPages[e.clientId].status,/timed out/);assert.ok(n.serverLoad[e.serverId].dropped>0);assert.equal(Object.keys(n.serverLoad[e.serverId].pending).length,0);assert.equal(Object.keys(n.tcp).length,0);
 n.browse(e.clientId,'https://192.168.1.2/');drain(n);assert.equal(n.httpPages[e.clientId].code,200);
 const fw=n.device(e.firewallId);n.configureFirewall(fw.id,{...fw.firewall,rules:[{...fw.firewall.rules[0],name:'Block load source',source:'192.168.1.50',action:'drop'},...fw.firewall.rules]});
 n.generatorControl(e.sourceId,'start',e.clientId);drain(n);assert.equal(n.httpPages[e.clientId].code,200);assert.equal(n.serverLoad[e.serverId].dropped,0);
});
test('generator stop, save/load validation, and trial snapshots are bounded and deterministic',()=>{
 const e=E.dos(Network);let n=e.network;n.generatorControl(e.sourceId,'start');n.next();n.generatorControl(e.sourceId,'stop');drain(n);assert.equal(n.generators[e.sourceId].sent,1);assert.equal(Object.keys(n.serverLoad[e.serverId].pending).length,0);
 const data=n.save();n=new Network(data);assert.deepEqual(n.generators,{});assert.equal(n.device(e.serverId).webServer.synCapacity,8);data.devices.find(d=>d.id===e.sourceId).generatorServer.count=10000;assert.throws(()=>n.load(data));
 n.generatorControl(e.sourceId,'start',e.clientId);let steps=0;while(n.queue.length){const next=Object.assign(new Network(),JSON.parse(JSON.stringify(n)));next.copyRuntimeFrom(n);next.next();n=next;assert.ok(++steps<5000);}assert.match(n.httpPages[e.clientId].status,/timed out/);
});
test('manual Browser request during a burst shares its queue, supports DNS, and rejects duplicate requests',()=>{
 for(const named of [false,true]){
  const e=E.dos(Network),n=e.network,server=n.device(e.serverId);
  if(named){n.configureDnsServer(server.id,{enabled:true,records:[{name:'dos.example',address:server.ip,ttl:120}]});n.configureDnsAddress(e.clientId,server.ip);n.configureWeb(server.id,{...server.webServer,certificateName:'dos.example'});const fw=n.device(e.firewallId);n.configureFirewall(fw.id,{...fw.firewall,rules:[...fw.firewall.rules,{...fw.firewall.rules[0],name:'DNS',protocol:'UDP',destinationPort:53}]});}
  n.generatorControl(e.sourceId,'start');let steps=0;while(Object.keys(n.serverLoad[e.serverId]?.pending||{}).length<8){n.next();assert.ok(++steps<1000);}
  const sent=n.generators[e.sourceId].sent,url=named?'https://dos.example/':'https://192.168.1.2/';
  n.browse(e.clientId,url);assert.throws(()=>n.browse(e.clientId,url),/already has/);assert.equal(n.generators[e.sourceId].sent,sent);drain(n);assert.match(n.httpPages[e.clientId].status,/timed out/);assert.equal(n.generators[e.sourceId].sent,40);
  n.browse(e.clientId,url);drain(n);assert.equal(n.httpPages[e.clientId].code,200);
 }
});

test('repeated bursts use fresh ports while incomplete firewall sessions remain tracked',()=>{
 const e=E.dos(Network);let n=e.network;const seen=new Set();
 for(let run=0;run<3;run++){
  n.generatorControl(e.sourceId,'start');
  while(n.queue.length){const trial=Object.assign(new Network(),JSON.parse(JSON.stringify(n)));trial.copyRuntimeFrom(n);trial.next();n=trial;}
  const load=n.serverLoad[e.serverId];assert.equal(load.accepted,8*(run+1));assert.equal(load.dropped,32*(run+1));assert.equal(load.expired,8*(run+1));
  const decisions=n.firewallDecisions[e.firewallId].filter(d=>d.source==='192.168.1.50');
  const current=decisions.slice(-40);assert.equal(current.length,40);assert.ok(current.every(d=>d.action==='allow'));
  for(const d of current){assert.ok(!seen.has(d.sourcePort),'burst reuses a tracked source port');seen.add(d.sourcePort);}
 }
});
