const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Network}=require('../assets/js/network-explorer-engine.js');
const Echo=require('../assets/js/network-explorer-echo.js');
function setup(protocol='TCP',routed=false){
 const n=new Network(),a=n.add('host'),b=n.add('host'),s=n.add('host'),sw=n.add('switch'),r=routed?n.add('router'):null;
 for(const [i,d] of [a,b,s].entries())n.configure(d.id,r&&d===s?'192.168.2.10':'192.168.1.'+(10+i),24);
 n.connect(a.id,'p0',sw.id,'p0');n.connect(b.id,'p0',sw.id,'p1');
 if(r){n.configureInterface(r.id,'p0','192.168.1.1',24);n.configureInterface(r.id,'p1','192.168.2.1',24);n.connect(sw.id,'p2',r.id,'p0');n.connect(s.id,'p0',r.id,'p1');for(const d of [a,b,s])n.configureGateway(d.id,d===s?'192.168.2.1':'192.168.1.1');}
 else n.connect(s.id,'p0',sw.id,'p2');
 n.configureDnsServer(s.id,{enabled:true,records:[{name:'echo.example',address:s.ip,ttl:120}]});
 for(const d of [a,b,s]){n.configureDnsAddress(d.id,s.ip);n.configureEcho(d.id,{...Echo.defaults(),role:d===s?'server':'client',transport:protocol});}
 return {n,a,b,s,r};
}
function drain(n){let count=0;while(n.queue.length){n.next();assert.ok(++count<4000,'execution must become idle');}}
function run(n,d){n.echoControl(d.id,'run');drain(n);}
test('TCP Python performs DNS/ARP, receives complete multibyte stream and closes independently for two clients',()=>{
 const {n,a,b,s}=setup('TCP',true);n.configureEcho(a.id,{...a.echoServer,message:'🙂'.repeat(400)});
 run(n,s);assert.match(n.echo[s.id].threads[0].wait,/accept/);
 n.echoControl(a.id,'run');n.echoControl(b.id,'run');drain(n);
 for(const d of [a,b]){assert.equal(n.echo[d.id].threads[0].status,'finished');assert.equal(n.echo[d.id].output.at(-1),'Echo received: '+d.echoServer.message);assert.equal(n.echo[d.id].sockets[0].state,'CLOSED');}
 assert.equal(n.echo[s.id].threads.length,3);assert.equal(n.echo[s.id].sockets[0].state,'LISTEN');assert.ok(n.echo[s.id].threads.slice(1).every(t=>t.status==='finished'));
 assert.ok(n.history.some(e=>e.frame?.type==='ARP'));assert.ok(n.history.some(e=>e.frame?.dns==='Query'));assert.ok(n.history.some(e=>e.selectedRoute&&e.frame?.echo));
});
test('UDP echoes datagrams to each sender without TCP handshake or client threads',()=>{
 const {n,a,b,s}=setup('UDP');run(n,s);n.echoControl(a.id,'run');n.echoControl(b.id,'run');drain(n);
 for(const d of [a,b])assert.equal(n.echo[d.id].output.at(-1),'Echo received: '+d.echoServer.message);
 assert.equal(n.echo[s.id].threads.length,1);assert.ok(!n.history.some(e=>e.frame?.protocol==='TCP'));
 assert.match(n.echo[s.id].threads[0].wait,/recvfrom/);
});
test('stepping stops before next line, breakpoints pause, bytes buffer while Python is paused',()=>{
 const {n,a,s}=setup();n.echoControl(s.id,'step');drain(n);assert.equal(n.echo[s.id].threads[0].pc,1);assert.equal(n.echo[s.id].sockets.length,0);
 run(n,s);n.echoControl(s.id,'pause');run(n,a);
 assert.equal(n.echo[s.id].threads[0].vars.conn,n.echo[s.id].sockets[1].id);assert.equal(n.echo[s.id].threads[0].status,'ready');assert.ok(n.echo[s.id].sockets[1].buffer.length>0);assert.match(n.echo[a.id].threads[0].wait,/recv/);
 run(n,s);assert.equal(n.echo[a.id].output.at(-1),'Echo received: '+a.echoServer.message);
 n.reset();const t=Echo.state(n,a.id).threads[0];t.breakpoints=[1];run(n,a);assert.equal(t.pc,1);assert.equal(t.auto,false);assert.equal(n.echo[a.id].sockets.length,0);
});
test('unknown DNS, closed listener and missing cable fail visibly; runtime is not persisted',()=>{
 for(const error of ['dns','port','cable']){const {n,a,s}=setup();if(error==='dns')n.configureEcho(a.id,{...a.echoServer,host:'missing.example'});if(error==='cable'){n.configureEcho(a.id,{...a.echoServer,host:s.ip});n.links[0].enabled=false;}run(n,a);assert.equal(n.echo[a.id].threads[0].status,'error',error);}
 const {n,a,s}=setup();run(n,s);run(n,a);const data=n.save(),restored=new Network(data);assert.deepEqual(restored.save(),data);assert.deepEqual(restored.echo,{});const bad=structuredClone(data);bad.devices[0].echoServer.port=0;assert.throws(()=>restored.load(bad));assert.deepEqual(restored.save(),data);
});
test('Echo survives NAT and firewall routing using the existing packet pipeline',()=>{
 for(const protocol of ['TCP','UDP']){
  const {n,a,s,r}=setup(protocol,true),F=require('../assets/js/network-explorer-firewall.js');
  const config=F.defaults(r,true);config.rules=[{...config.rules[0],name:'DNS',protocol:'UDP',destinationPort:53},{...config.rules[0],name:'Echo',protocol,destinationPort:5000}];n.configureFirewall(r.id,config);
  n.configureNat(r.id,{enabled:true,inside:['p0'],outside:'p1'});run(n,s);run(n,a);assert.equal(n.echo[a.id].output.at(-1),'Echo received: '+a.echoServer.message);assert.ok(n.history.some(e=>e.nat&&e.frame?.echo));assert.ok(n.history.some(e=>e.firewall?.action==='allow'&&e.frame?.echo));
 }
});
test('a stepped connect completes when the handshake returns without executing send',()=>{
 const {n,a,s}=setup();run(n,s);
 const t=Echo.state(n,a.id).threads[0];
 while(Echo.program(a.echoServer)[t.pc].op!=='connect'){n.echoControl(a.id,'step');drain(n);}
 n.echoControl(a.id,'step');drain(n);
 assert.equal(Echo.program(a.echoServer)[t.pc].op,'message');assert.equal(t.status,'ready');assert.equal(t.auto,false);assert.equal(n.echo[a.id].output.length,0);
});


test('restarting one Echo preserves other apps, caches, breakpoints and allows another exchange',()=>{
 for(const protocol of ['TCP','UDP']){
  const {n,a,b,s}=setup(protocol);run(n,s);run(n,a);run(n,b);
  const server=structuredClone(n.echo[s.id]),other=structuredClone(n.echo[b.id]);
  const arp=structuredClone(n.arp),dns=structuredClone(n.dnsCache),clock=n.clock;
  const serial=n.echo[a.id].serial;n.echo[a.id].threads[0].breakpoints=[1];
  n.echoControl(a.id,'reset');
  assert.deepEqual(n.echo[s.id],server);assert.deepEqual(n.echo[b.id],other);
  assert.deepEqual(n.arp,arp);assert.deepEqual(n.dnsCache,dns);assert.equal(n.clock,clock);
  assert.equal(n.echo[a.id].threads[0].pc,0);assert.deepEqual(n.echo[a.id].threads[0].breakpoints,[1]);
  assert.equal(n.echo[a.id].serial,serial);n.echo[a.id].threads[0].breakpoints=[];
  run(n,a);assert.equal(n.echo[a.id].output.at(-1),'Echo received: '+a.echoServer.message);
 }
});
test('restart cancels pending Echo DNS and isolates old socket traffic',()=>{
 const {n,a,s}=setup();run(n,s);n.echoControl(a.id,'run');
 while(!n.dnsPending[a.id])n.next();
 n.echoControl(a.id,'reset');drain(n);
 assert.equal(n.echo[a.id].threads[0].pc,0);assert.equal(n.dnsPending[a.id],undefined);
 n.echoControl(s.id,'pause');run(n,a);
 assert.ok(n.echo[a.id].sockets.some(so=>so.state==='ESTABLISHED'));
 n.echoControl(a.id,'reset');drain(n);
 assert.equal(n.echo[a.id].threads[0].pc,0);assert.equal(n.echo[a.id].sockets.length,0);
 assert.equal(n.echo[s.id].sockets[0].state,'LISTEN');
 run(n,s);run(n,a);assert.equal(n.echo[a.id].output.at(-1),'Echo received: '+a.echoServer.message);
});

test('TCP server imports the separate handler and new workers inherit handler breakpoints',()=>{
 const {n,a,s}=setup();const main=Echo.program(s.echoServer),handler=Echo.program(s.echoServer,true);
 assert.ok(main.some(r=>r.text==='from client_handler import handle_client'));
 assert.ok(!main.some(r=>r.text.startsWith('def handle_client')));
 assert.match(handler[0].text,/def handle_client/);
 Echo.state(n,s.id).ui={handlerBreakpoints:[2]};run(n,s);run(n,a);
 const worker=n.echo[s.id].threads.find(t=>t.id!=='main');
 assert.equal(worker.pc,2);assert.equal(worker.auto,false);assert.deepEqual(worker.breakpoints,[2]);
 run(n,s);assert.equal(n.echo[a.id].output.at(-1),'Echo received: '+a.echoServer.message);
});
