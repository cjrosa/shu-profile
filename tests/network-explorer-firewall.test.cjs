const {test} = require('node:test');
const assert = require('node:assert/strict');
const {Network} = require('../assets/js/network-explorer-engine.js');
const F = require('../assets/js/network-explorer-firewall.js');
const E = require('../assets/js/network-explorer-examples.js');
const T = require('../assets/js/network-explorer-troubleshooting.js');
function drain(n) {let i=0;while(n.queue.length){n.next();assert.ok(++i<2000);}return n.results.at(-1);}
 function routedExample(Network){
  const n=new Network(),client=n.add('host',170,180),peer=n.add('host',170,400),sw=n.add('switch',370,290),fw=n.add('router',600,290),server=n.add('host',880,290);
  client.name='Inside Client';peer.name='Inside Server';sw.name='Inside Switch';fw.name='Edge Firewall';server.name='Outside Services';
  n.configure(client.id,'192.168.10.10',24);n.configure(peer.id,'192.168.10.20',24);n.configure(server.id,'198.51.100.10',24);
  n.configureInterface(fw.id,'p0','192.168.10.1',24);n.configureInterface(fw.id,'p1','198.51.100.1',24);
  for(const h of [client,peer])n.configureGateway(h.id,'192.168.10.1');n.configureGateway(server.id,'198.51.100.1');n.configureDnsAddress(client.id,server.ip);
  n.configureDnsServer(server.id,{enabled:true,records:[{name:'www.firewall.example',address:server.ip,ttl:120}]});
  for(const h of [server,peer])n.configureWeb(h.id,{enabled:true,port:80,title:'A permitted web page',body:'Routing delivers the packet. Firewall policy decides which routed conversations may pass.'});
  n.configureWeb(client.id,{enabled:true,url:'http://www.firewall.example/'},'browser');n.configureWeb(server.id,{enabled:true,url:'http://192.168.10.20/'},'browser');
  n.connect(client.id,'p0',sw.id,'p0');n.connect(peer.id,'p0',sw.id,'p1');n.connect(sw.id,'p2',fw.id,'p0');n.connect(fw.id,'p1',server.id,'p0');
  const c=F.defaults(fw,true);c.rules=[{...c.rules[0],name:'Allow DNS',protocol:'UDP',destinationPort:53},{...c.rules[0],name:'Allow web',protocol:'TCP',destinationPort:80}];n.configureFirewall(fw.id,c);
  client.browserOffset={x:0,y:-90};peer.webOffset={x:0,y:90};server.dnsOffset={x:130,y:-110};server.webOffset={x:130,y:0};server.browserOffset={x:130,y:110};
  n.notes=[{id:'note1',title:'Predict, test, explain',text:'Open the Inside Client Browser: DNS and HTTP succeed. Ping 198.51.100.10: default drop. Open the Outside Services Browser: a new inbound HTTP connection is blocked. Ping 192.168.10.20 from Inside Client: same-subnet traffic bypasses this firewall. Watch Edge Firewall to inspect each decision. In Troubleshooting choose Firewall policy, then Break something to block DNS and repair the rule.',x:470,y:110,width:300,height:160,color:'blue',tags:['firewall','walkthrough'],target:fw.id}];
  return {network:n,clientId:client.id,firewallId:fw.id};
 }

function setup() {const {network:n,clientId,firewallId}=routedExample(Network);return {n,c:n.device(clientId),fw:n.device(firewallId),server:n.devices.find(d=>d.name==='Outside Services'),peer:n.devices.find(d=>d.name==='Inside Server')};}
test('firewall preset shares router interfaces; ordinary routers retain legacy behavior',()=>{
  const n=new Network(),r=n.add('router'),f=n.add('router',10,10,3);f.role='firewall';f.firewall=F.defaults(f,true);
  assert.equal(r.firewall,undefined);assert.equal(f.type,'router');assert.equal(f.role,'firewall');assert.equal(f.firewall.enabled,true);assert.equal(f.firewall.zones.p2,'DMZ');
  assert.equal(new Network(n.save()).device(f.id).role,'firewall');
});
test('DNS, HTTP handshake and teardown pass; sessions close and explanations persist',()=>{
  const {n,c,fw}=setup();n.browse(c.id,c.browserServer.url);assert.equal(drain(n).ok,true);assert.equal(n.httpPages[c.id].code,200);
  assert.ok(n.history.some(e=>e.firewall?.state==='SYN-RECEIVED'));assert.ok(n.history.some(e=>e.firewall?.state==='CLOSED'));
  assert.equal(n.firewallSessions[fw.id].filter(s=>s.protocol==='TCP').length,0);
  assert.equal(n.firewallHits[fw.id]['Allow web'],1);assert.equal(n.firewallHits[fw.id]['Allow DNS'],1);
});
test('default drop stops ping and unsolicited inbound HTTP without sending a rejection',()=>{
  const {n,c,fw,server}=setup();n.ping(c.id,server.ip);assert.equal(drain(n).ok,false);
  const drop=n.history.find(e=>e.firewall?.action==='drop');assert.equal(drop.device,fw.id);assert.deepEqual(drop.outputs,[]);assert.match(drop.title,/Firewall/);
  n.browse(server.id,server.browserServer.url);assert.equal(drain(n).ok,false);assert.equal(n.firewallDecisions[fw.id].at(-1).from,'Outside');
});
test('same-subnet traffic bypasses the firewall; gateway traffic is explicitly local',()=>{
  const {n,c,fw,peer}=setup();n.ping(c.id,peer.ip);assert.equal(drain(n).ok,true);assert.equal(n.firewallDecisions[fw.id],undefined);
  n.ping(c.id,fw.ports[0].ip);assert.equal(drain(n).ok,true);assert.equal(n.firewallDecisions[fw.id],undefined);
});
test('ordered rules, disabled rules and default action affect new conversations',()=>{
  const {n,c,fw,server}=setup();const config=structuredClone(fw.firewall),deny={...F.rule('Deny web','TCP',80),action:'drop'};config.rules.unshift(deny);n.configureFirewall(fw.id,config);
  n.browse(c.id,'http://'+server.ip);assert.equal(drain(n).ok,false);
  config.rules.push(config.rules.shift());n.configureFirewall(fw.id,config);n.browse(c.id,'http://'+server.ip);assert.equal(drain(n).ok,true);
  config.rules[0].enabled=false;config.rules[1].enabled=false;n.configureFirewall(fw.id,config);n.browse(c.id,'http://'+server.ip);assert.equal(drain(n).ok,false);
  n.configureFirewall(fw.id,{...config,rules:[],defaultAction:'allow'});n.ping(c.id,server.ip);assert.equal(drain(n).ok,true);
});
test('CIDR, source port, destination port and zones are all matched',()=>{
  const {n,fw}=setup(),r={...F.rule('Scoped','UDP',53),source:'192.168.10.0/24',destination:'198.51.100.10/32',sourcePort:50000};n.configureFirewall(fw.id,{...fw.firewall,rules:[r]});
  const f={protocol:'UDP',sip:'192.168.10.10',dip:'198.51.100.10',sport:50000,dport:53},run=f=>F.evaluate(n,fw,fw.ports[0],fw.ports[1],f);
  assert.equal(run({...f,sport:50001}).action,'drop');assert.equal(run({...f,sip:'192.168.11.10'}).action,'drop');assert.equal(run({...f,dport:80}).action,'drop');assert.equal(run(f).action,'allow');
  n.reset();assert.equal(F.evaluate(n,fw,fw.ports[1],fw.ports[0],f).action,'drop');
});
test('forged TCP ACK/SYN-ACK cannot open sessions; wrong peer or handshake acknowledgment is dropped',()=>{
  const {n,fw}=setup(),p=fw.ports,f={protocol:'TCP',sip:'192.168.10.10',dip:'198.51.100.10',sport:50000,dport:80,seq:100,ack:0,flags:'SYN'};
  const out=f=>F.evaluate(n,fw,p[0],p[1],f),back=f=>F.evaluate(n,fw,p[1],p[0],f),reply={...f,sip:f.dip,dip:f.sip,sport:80,dport:50000,flags:'SYN ACK',seq:500,ack:101};
  assert.equal(out({...f,flags:'ACK'}).action,'drop');assert.equal(back(reply).action,'drop');assert.equal(out(f).action,'allow');
  assert.equal(back({...reply,ack:999}).action,'drop');assert.equal(back({...reply,sip:'198.51.100.20'}).action,'drop');assert.equal(back(reply).action,'allow');
  assert.equal(out({...f,flags:'ACK',seq:101,ack:501}).state,'ESTABLISHED');
});
test('return UDP and ICMP require matching endpoints, ports and echo identity',()=>{
  const {n,fw}=setup(),p=fw.ports; n.configureFirewall(fw.id,F.defaults(fw,true));
  const out={protocol:'UDP',sip:'192.168.10.10',dip:'198.51.100.10',sport:50000,dport:53};F.evaluate(n,fw,p[0],p[1],out);
  const back={...out,sip:out.dip,dip:out.sip,sport:53,dport:50000};assert.equal(F.evaluate(n,fw,p[1],p[0],back).action,'allow');assert.equal(F.evaluate(n,fw,p[1],p[0],{...back,dport:50001}).action,'drop');
  const echo={sip:out.sip,dip:out.dip,icmp:'Echo Request',probe:'one'};F.evaluate(n,fw,p[0],p[1],echo);const reply={sip:echo.dip,dip:echo.sip,icmp:'Echo Reply',probe:'two'};assert.equal(F.evaluate(n,fw,p[1],p[0],reply).action,'drop');assert.equal(F.evaluate(n,fw,p[1],p[0],{...reply,probe:'one'}).action,'allow');
});
test('firewall works with PAT in both directions and records internal addresses',()=>{
  const {network:n,clientId}=E.internet(Network),fw=n.devices.find(d=>d.nat);n.configureFirewall(fw.id,F.defaults(fw,true));n.browse(clientId,'http://www.internet.example/');assert.equal(drain(n).ok,true);
  assert.ok(n.history.some(e=>e.nat?.direction==='Inbound'&&e.firewall?.action==='allow'));
  assert.ok(n.firewallDecisions[fw.id].some(e=>e.source==='192.168.1.10'));assert.ok(n.firewallDecisions[fw.id].some(e=>e.destination==='192.168.1.10'));
});
test('blocked outbound traffic creates no PAT mapping',()=>{
  const {network:n,clientId}=E.internet(Network),fw=n.devices.find(d=>d.nat);n.configureFirewall(fw.id,{...F.defaults(fw,true),rules:[]});n.ping(clientId,'198.51.100.10');assert.equal(drain(n).ok,false);assert.equal(n.natTable[fw.id],undefined);
});
test('state expires, is not saved, and is cleared by policy edits',()=>{
  const {n,c,fw,server}=setup();n.lookupDns(c.id,'www.firewall.example');drain(n);assert.ok(n.firewallSessions[fw.id].length);
  const restored=new Network(n.save());assert.deepEqual(restored.firewallSessions,{});assert.deepEqual(restored.firewallHits,{});assert.deepEqual(restored.device(fw.id).firewall,fw.firewall);
  assert.ok(n.age(Date.now()+120001));assert.equal(n.firewallSessions[fw.id].length,0);
  n.configureFirewall(fw.id,{...fw.firewall,enabled:false});n.ping(c.id,server.ip);assert.equal(drain(n).ok,true);assert.deepEqual(n.firewallDecisions,{});
});
test('malformed policies are rejected atomically on load and edit',()=>{
  const {n,fw}=setup(),saved=n.save();
  for(const mutate of [c=>c.zones.p0='Bogus',c=>c.rules[0].source='192.168.10.1/24',c=>c.rules[0].destination='999.1.2.3',c=>c.rules[0].destinationPort=70000,c=>c.rules[0].protocol='ICMP',c=>c.rules.push(c.rules[0])]){
    const bad=structuredClone(saved);mutate(bad.devices.find(d=>d.id===fw.id).firewall);assert.throws(()=>n.load(bad));assert.deepEqual(n.save(),saved);
  }
});
test('firewall DNS fault verifies working baseline, fails after injection, and repairs by rule order',()=>{
  const {n}=setup(),saved=n.save(),fault=T.create(Network,saved,()=>0,'firewall');assert.ok(T.verify(Network,saved,fault));T.apply(n,fault);assert.equal(T.verify(Network,n.save(),fault),false);
  const fw=n.device(fault.device),c=structuredClone(fw.firewall);c.rules.push(c.rules.shift());n.configureFirewall(fw.id,c);assert.ok(T.verify(Network,n.save(),fault));T.apply(n,fault,true);assert.deepEqual(n.save(),saved);
});
test('a third-interface DMZ uses its own policy and stateful return path',()=>{
  const n=new Network(),fw=n.add('router',0,0,3),outside=n.add('host'),dmz=n.add('host');
  fw.firewall=F.defaults(fw,true);n.configureInterface(fw.id,'p1','198.51.100.1',24);n.configureInterface(fw.id,'p2','172.16.10.1',24);
  n.configure(outside.id,'198.51.100.10',24);n.configureGateway(outside.id,'198.51.100.1');n.configure(dmz.id,'172.16.10.10',24);n.configureGateway(dmz.id,'172.16.10.1');
  n.connect(outside.id,'p0',fw.id,'p1');n.connect(dmz.id,'p0',fw.id,'p2');n.configureWeb(outside.id,{enabled:true,url:'http://172.16.10.10/'},'browser');n.configureWeb(dmz.id,{enabled:true,port:80,title:'DMZ',body:'Public service'});
  n.browse(outside.id,outside.browserServer.url);assert.equal(drain(n).ok,false);
  n.configureFirewall(fw.id,{...fw.firewall,rules:[{...F.rule('Public web','TCP',80),from:'Outside',to:'DMZ',destination:dmz.ip}]});n.browse(outside.id,outside.browserServer.url);assert.equal(drain(n).ok,true);
  n.configureGateway(dmz.id,'');n.browse(outside.id,outside.browserServer.url);assert.equal(drain(n).ok,false);
});
test('expired UDP state cannot authorize an unsolicited inbound reply',()=>{
  const {n,c,fw,server}=setup();n.lookupDns(c.id,'www.firewall.example');drain(n);const s=n.firewallSessions[fw.id][0];n.age(Date.now()+120001);
  const reply={protocol:'UDP',sip:server.ip,dip:c.ip,sport:53,dport:s.sourcePort};assert.equal(F.evaluate(n,fw,fw.ports[1],fw.ports[0],reply).action,'drop');
});
test('arbitrary valid rule names remain safe counter keys across simulation snapshots',()=>{
  const {n,fw}=setup();n.configureFirewall(fw.id,{...fw.firewall,rules:[F.rule('__proto__','UDP',53)]});
  const packet={protocol:'UDP',sip:'192.168.10.10',dip:'198.51.100.10',sport:50000,dport:53};F.evaluate(n,fw,fw.ports[0],fw.ports[1],packet);
  const trial=Object.assign(new Network(),JSON.parse(JSON.stringify(n)));F.evaluate(trial,trial.device(fw.id),fw.ports[0],fw.ports[1],{...packet,sport:50001});assert.equal(trial.firewallHits[fw.id].__proto__,2);
});
