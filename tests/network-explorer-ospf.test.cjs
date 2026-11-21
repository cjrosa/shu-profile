const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Network}=require('../assets/js/network-explorer-engine.js');
const OSPF=require('../assets/js/network-explorer-ospf.js');
function drain(n){let count=0;while(n.queue.length){n.next();assert.ok(++count<2000,'finite OSPF work queue');}}
function advance(n,ticks){for(let i=0;i<ticks;i++){drain(n);n.advanceOspf();}drain(n);}
function topology(){
 const n=new Network(),routers=[0,1,2].map(()=>n.add('router',200,200,3)),hosts=routers.map(()=>n.add('host'));
 routers.forEach((r,i)=>{n.configureInterface(r.id,'p0',`192.168.${i+1}.1`,24);n.configure(hosts[i].id,`192.168.${i+1}.10`,24);n.configureGateway(hosts[i].id,`192.168.${i+1}.1`);n.connect(r.id,'p0',hosts[i].id,'p0');});
 const links=[];for(const [a,pa,b,pb,sub]of [[0,'p1',1,'p1',12],[1,'p2',2,'p1',23],[0,'p2',2,'p2',13]]){n.configureInterface(routers[a].id,pa,`10.0.${sub}.1`,30);n.configureInterface(routers[b].id,pb,`10.0.${sub}.2`,30);links.push(n.connect(routers[a].id,pa,routers[b].id,pb));}
 for(const r of routers){const c=OSPF.defaults(r);c.enabled=true;c.interfaces.p0.mode='passive';c.interfaces.p1.mode=c.interfaces.p2.mode='active';n.configureOspf(r.id,c);}drain(n);return {n,routers,hosts,links};
}
const route=(x,i=0,dest='192.168.3.0')=>x.n.routes(x.routers[i].id).find(r=>r.network===dest);
test('neighbors synchronize using all five message types and install local SPF routes',()=>{const x=topology();assert.equal(route(x).type,'ospf');assert.equal(route(x).cost,2);assert.equal(route(x).port,'p2');for(const r of x.routers){const s=x.n.ospfState[r.id];assert.equal(Object.keys(s.database).length,3);assert.ok(Object.values(s.neighbors).every(nb=>nb.state==='Full'));}const messages=new Set(x.n.history.map(e=>e.frame?.ospf?.message));for(const m of ['Hello','Database Description','Link State Request','Link State Update','Link State Acknowledgment'])assert.ok(messages.has(m),m);x.n.ping(x.hosts[0].id,x.hosts[2].ip);drain(x.n);assert.equal(x.n.results.at(-1).ok,true);});
test('link failure converges to alternate path and restoration returns preferred path',()=>{const x=topology(),history=x.n.history.length;x.links[2].enabled=false;x.n.ospfTopologyChanged();drain(x.n);assert.ok(x.n.history.length>history);assert.equal(route(x).port,'p1');assert.equal(route(x).cost,3);x.n.ping(x.hosts[0].id,x.hosts[2].ip);drain(x.n);assert.equal(x.n.results.at(-1).ok,true);x.links[2].enabled=true;x.n.ospfTopologyChanged();advance(x.n,45);assert.equal(route(x).port,'p2');});
test('partition withdraws unreachable routes; passive LAN removal is advertised',()=>{const x=topology();x.links[1].enabled=x.links[2].enabled=false;x.n.ospfTopologyChanged();drain(x.n);assert.equal(route(x),undefined);assert.ok(x.n.routes(x.routers[2].id).some(r=>r.type==='connected'));});
test('cost changes propagate and static routes win only at equal prefix',()=>{const x=topology(),r=x.routers[0],c=structuredClone(r.ospf);c.interfaces.p2.cost=10;x.n.configureOspf(r.id,c);drain(x.n);assert.equal(route(x).port,'p1');x.n.setStaticRoute(r.id,'192.168.3.0',24,'10.0.13.2','manual');drain(x.n);assert.equal(route(x).type,'static');});
test('configuration persists but learned state does not; legacy defaults remain disabled',()=>{const x=topology(),saved=x.n.save(),n=new Network(saved);assert.deepEqual(n.save(),saved);assert.equal(Object.keys(n.ospfState).length,0);advance(n,2);assert.ok(n.routes(x.routers[0].id).some(r=>r.type==='ospf'));const old=new Network();old.add('router');assert.equal(new Network(old.save()).hasOspf(),false);assert.throws(()=>{const bad=structuredClone(saved);bad.devices[0].ospf.area=1;new Network(bad);},/area 0/);});
test('duplicate IDs and unsupported devices are rejected',()=>{const x=topology(),c=structuredClone(x.routers[0].ospf);assert.throws(()=>x.n.configureOspf(x.routers[1].id,c),/unique/);assert.throws(()=>x.n.configureOspf(x.hosts[0].id,c),/Router/);});
test('dead timer detects silent OSPF shutdown without an omniscient route update',()=>{const x=topology(),r=x.routers[2],c=structuredClone(r.ospf);c.enabled=false;x.n.configureOspf(r.id,c);assert.ok(route(x));advance(x.n,45);assert.equal(route(x),undefined);});
test('runtime survives JSON staging and bounded idle advancement',()=>{const x=topology(),trial=Object.assign(new Network(),JSON.parse(JSON.stringify(x.n)));advance(trial,25);assert.ok(trial.routes(x.routers[0].id).some(r=>r.type==='ospf'));assert.equal(trial.queue.length,0);});
test('Hello/dead mismatch prevents adjacency and correction recovers',()=>{const {network:n}=OSPF.example(Network,false);const r=n.devices.filter(d=>d.type==='router')[1],c=structuredClone(r.ospf);c.hello=12;n.configureOspf(r.id,c);drain(n);advance(n,45);assert.equal(n.routes(n.devices[0].id).some(r=>r.type==='ospf'),false);c.hello=10;n.configureOspf(r.id,c);advance(n,45);assert.ok(n.routes(n.devices[0].id).some(r=>r.type==='ospf'));});
test('lost database descriptions, updates and acknowledgments recover by retries',()=>{for(const lost of ['Database Description','Link State Update','Link State Acknowledgment']){const {network:n}=OSPF.example(Network,false),transmit=n.transmit;let dropped=0;n.transmit=function(d,p,f){if(f.ospf?.message===lost&&dropped++<2)return;return transmit.call(this,d,p,f);};drain(n);advance(n,60);assert.ok(n.routes(n.devices[0].id).some(r=>r.type==='ospf'),lost);assert.ok(Object.values(n.ospfState).every(s=>Object.values(s.neighbors).every(nb=>nb.state==='Full'&&Object.keys(nb.pending).length===0)));}});
test('routine Hellos do not trigger routing Watch; snapshots retain prior route state',()=>{const x=topology(),Watch=require('../assets/js/network-explorer-watch.js');x.routers[0].watch=true;x.routers[0].watchDecisions=['routing'];advance(x.n,20);const hello=x.n.history.findLast(e=>e.device===x.routers[0].id&&e.frame?.ospf?.message==='Hello');assert.equal(Watch.matches(x.routers[0],hello),false);const initial=structuredClone(hello.ospfAfter);x.links[2].enabled=false;x.n.ospfTopologyChanged();drain(x.n);assert.deepEqual(hello.ospfAfter,initial);assert.ok(x.n.history.some(e=>e.kind==='ospf-down'&&Watch.matches(x.routers[0],e)));});
test('passive and off differ, address clearing stays loadable, removal preserves surviving history',()=>{const x=topology(),r=x.routers[2],c=structuredClone(r.ospf);c.interfaces.p0.mode='off';x.n.configureOspf(r.id,c);drain(x.n);assert.equal(route(x),undefined);x.n.configureInterface(r.id,'p0','',null);assert.doesNotThrow(()=>new Network(x.n.save()));const count=x.n.history.length;x.n.remove(r.id);drain(x.n);assert.ok(x.n.history.length>=count);assert.ok(!x.n.ospfState[r.id]);});
test('old LSAs do not overwrite newer information and databases are independent',()=>{const x=topology(),r=x.routers[0],other=x.routers[1],db=x.n.ospfState[r.id].database,latest=structuredClone(db[other.ospf.routerId]);const old={...latest,sequence:latest.sequence-1,prefixes:[]};x.n.enqueue({kind:'receive',device:r.id,ingress:'p1',from:other.id,link:x.links[0].id,frame:{type:'IPv4',protocol:'OSPF',sip:other.ports[1].ip,ospf:{routerId:other.ospf.routerId,area:0,message:'Link State Update',lsas:[old]}}});drain(x.n);assert.deepEqual(db[other.ospf.routerId],latest);assert.notEqual(db[other.ospf.routerId],x.n.ospfState[other.id].database[other.ospf.routerId]);});
test('a long application timeout does not expire healthy neighbors',()=>{const x=topology();x.n.ping(x.hosts[0].id,'192.168.3.99');drain(x.n);assert.ok(Object.values(x.n.ospfState).every(s=>Object.values(s.neighbors).every(nb=>nb.state==='Full')));assert.ok(route(x));});
test('aging removes unreachable LSAs while healthy routers refresh their own advertisements',()=>{const x=topology(),r=x.routers[2];x.n.remove(r.id);drain(x.n);advance(x.n,3700);assert.ok(!x.n.ospfState[x.routers[0].id].database[r.ospf.routerId]);assert.ok(x.n.ospfState[x.routers[0].id].database[x.routers[0].ospf.routerId].sequence>3);});
test('router restart resynchronizes with peers holding its previous LSA sequence',()=>{const x=topology(),r=x.routers[2],c=structuredClone(r.ospf);c.enabled=false;x.n.configureOspf(r.id,c);advance(x.n,45);c.enabled=true;x.n.configureOspf(r.id,c);advance(x.n,60);assert.ok(route(x));assert.ok(Object.values(x.n.ospfState[r.id].neighbors).every(nb=>nb.state==='Full'));});
test('Cisco inspection lists OSPF neighbors, database and costs only on routers',()=>{const CLI=require('../assets/js/network-explorer-router-cli.js'),x=topology(),r=x.routers[0],run=cmd=>CLI.run(x.n,r.id,{mode:'exec'},cmd,fn=>fn(),'cisco');assert.match(run('show ip ospf neighbor'),/Full/);assert.match(run('show ip ospf database'),/Router-LSA/);assert.match(run('show ip route'),/O .*cost 2/);assert.ok(CLI.commands('exec','cisco',r).includes('show ip ospf neighbor'));assert.ok(!CLI.commands('exec','cisco',{firewallMode:'transparent'}).includes('show ip ospf neighbor'));});

test('independent hosts can ping while OSPF and another probe are queued',()=>{
 const x=topology();
 x.n.advanceOspf(10);
 assert.ok(x.n.queue.some(e=>e.kind.startsWith('ospf-')));
 x.n.ping(x.hosts[0].id,x.hosts[2].ip);
 assert.doesNotThrow(()=>x.n.ping(x.hosts[1].id,x.hosts[2].ip));
 assert.throws(()=>x.n.ping(x.hosts[0].id,x.hosts[2].ip),/already has a probe/);
 drain(x.n);
 for(const host of x.hosts.slice(0,2))assert.ok(x.n.results.some(r=>r.device===host.id&&r.ok));
});
test('UI queues a ping into an OSPF preview without losing it on commit',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),x=topology();
 x.n.advanceOspf(10);
 const trial=Object.assign(new Network(),JSON.parse(JSON.stringify(x.n)));
 trial.copyRuntimeFrom(x.n);
 const report=trial.next();assert.ok(report.ospf);
 const source=fs.readFileSync(require.resolve('../assets/js/network-explorer-ui.js'),'utf8');
 const fn=source.slice(source.indexOf('  function startPing('),source.indexOf('  const hostProfiles',source.indexOf('  function startPing(')));
 const context={net:x.n,staged:{trial,report},candidateBase:null,finishPlacement(){},cancelConnect(){},output(){},stage(){},running:false};
 vm.createContext(context);vm.runInContext(fn,context);
 assert.doesNotThrow(()=>context.startPing(x.hosts[0].id,x.hosts[2].ip));
 assert.ok(trial.queue.some(e=>e.kind==='start'&&e.device===x.hosts[0].id));
 assert.ok(context.staged,'OSPF preview is preserved');
 assert.throws(()=>context.startPing(x.hosts[0].id,x.hosts[2].ip),/already has a probe/);
 drain(trial);assert.ok(trial.results.some(r=>r.device===x.hosts[0].id&&r.ok));
});

function backgroundOspf(n){
 const r=n.add('router');n.configureInterface(r.id,'p0','172.31.250.1',24);
 const c=OSPF.defaults(r);c.enabled=true;c.interfaces.p0.mode='passive';n.configureOspf(r.id,c);
 assert.ok(n.queue.length);assert.ok(n.ospfOnlyWork());
}
test('DNS, DHCP, browser and Nmap initiate with queued background OSPF',()=>{
 for(const action of ['dns','dhcp','browser','nmap']){
  const n=new Network(),a=n.add('host'),b=n.add('host');n.configure(a.id,'192.168.1.10',24);n.configure(b.id,'192.168.1.2',24);n.connect(a.id,'p0',b.id,'p0');
  n.configureDnsAddress(a.id,b.ip);n.configureDnsServer(b.id,{enabled:true,records:[{name:'server.example',address:b.ip,ttl:120}]});
  n.configureWeb(b.id,{enabled:true,port:80,title:'Test',body:'OK'});
  n.installApplication(n.addApplication(0,0,action==='nmap'?'nmap':'browser').id,a.id);
  if(action==='dhcp'){n.configureDhcpServer(b.id,{enabled:true,pools:[{name:'LAN',start:'192.168.1.100',end:'192.168.1.110',prefix:24,gateway:'',dns:b.ip,leaseSeconds:120}]});n.configureAddressMode(a.id,'dhcp');}
  backgroundOspf(n);
  assert.doesNotThrow(()=>{if(action==='dns')n.lookupDns(a.id,'server.example');else if(action==='dhcp')n.acquireDhcp(a.id);else if(action==='browser')n.browse(a.id,'http://server.example/');else n.scan(a.id,'nmap -sS -p 80 192.168.1.2');},action);
  drain(n);
  if(action==='dns')assert.ok(n.results.some(r=>r.dns&&r.ok));
  if(action==='dhcp')assert.equal(n.device(a.id).ip,'192.168.1.100');
  if(action==='browser')assert.equal(n.httpPages[a.id].code,200);
  if(action==='nmap')assert.equal(n.scans[a.id].rows[0].state,'open');
  assert.ok(n.history.some(r=>r.ospf));
 }
});
test('traffic generator and ARP spoofer initiate with background OSPF',()=>{
 const E=require('../assets/js/network-explorer-examples.js');
 for(const type of ['generator','spoofer']){const e=type==='generator'?E.dos(Network):E.arpSecurity(Network,'drop'),n=e.network;backgroundOspf(n);
  assert.doesNotThrow(()=>type==='generator'?n.generatorControl(e.sourceId,'start'):n.spooferControl(e.sourceId,'start'));
  drain(n);assert.ok(n.history.some(r=>r.ospf));
 }
});
test('OSPF preview handoff commits protocol work before another application starts',()=>{
 const fs=require('node:fs'),vm=require('node:vm');const source=fs.readFileSync(require.resolve('../assets/js/network-explorer-ui.js'),'utf8');
 const fn=source.slice(source.indexOf('  function releaseOspfStage()'),source.indexOf('  function editable()',source.indexOf('  function releaseOspfStage()')));
 let committed=0;const context={net:{ospfOnlyWork:()=>true},staged:{report:{ospf:true}},stop(){},commit(immediate){assert.equal(immediate,true);committed++;context.staged=null;},$:()=>({replaceChildren(){}})};
 vm.createContext(context);vm.runInContext(fn,context);context.releaseOspfStage();assert.equal(committed,1);assert.equal(context.staged,null);
});

test('TCP and UDP Echo run alongside background OSPF',()=>{
 const Echo=require('../assets/js/network-explorer-echo.js');
 for(const transport of ['TCP','UDP']){
  const n=new Network(),a=n.add('host'),b=n.add('host');n.configure(a.id,'192.168.1.10',24);n.configure(b.id,'192.168.1.2',24);n.connect(a.id,'p0',b.id,'p0');
  n.configureEcho(a.id,{...Echo.defaults(),transport,host:b.ip});n.configureEcho(b.id,{...Echo.defaults(),transport,role:'server'});
  backgroundOspf(n);n.echoControl(b.id,'run');drain(n);n.advanceOspf(10);n.echoControl(a.id,'run');drain(n);
  assert.equal(n.echo[a.id].threads[0].status,'finished');assert.ok(n.history.some(r=>r.ospf));
 }
});
test('Wi-Fi association can start alongside background OSPF',()=>{
 const W=require('../assets/js/network-explorer-wireless.js'),e=W.example(Network),n=e.network,ap=n.devices.find(d=>d.role==='ap');
 n.disconnectWifi(e.clientId);backgroundOspf(n);assert.doesNotThrow(()=>n.joinWifi(e.clientId,ap.id,'classroom123'));drain(n);assert.equal(n.wifiStatus(e.clientId),'Associated');
});

test('startup OSPF bypasses foreground playback delays but honors Watch',()=>{
 const fs=require('node:fs'),vm=require('node:vm');const source=fs.readFileSync(require.resolve('../assets/js/network-explorer-ui.js'),'utf8');
 const fn=source.slice(source.indexOf('  function stage() {'),source.indexOf('  function frameHeaderCard',source.indexOf('  function stage() {')));
 for(const watching of [false,true]){
  const {network:n}=OSPF.example(Network,true);let commits=0,delay,callback,examines=0;
  const context={net:n,ospfPaused:false,staged:null,running:true,NetworkExplorer:{Network},NetworkExplorerWatch:{matches:()=>watching},$:()=>({value:'600',replaceChildren(){}}),arrivedFlights:new Set(),flashFilterTraffic(){},render(){},stop(){},updatePauseControl(){},setSimulationStatus(){},animateFlights(){},animateApplicationDelivery(){},watchDhcpReport:()=>false,examine(){examines++;},schedulePhase(fn,ms){delay=ms;callback=fn;},commit(immediate){assert.equal(immediate,true);commits++;context.net=context.staged.trial;context.staged=null;}};
  vm.createContext(context);vm.runInContext(fn,context);context.stage();
  if(watching){assert.equal(commits,0);assert.ok(context.staged);callback();assert.equal(examines,1);}
  else{assert.equal(commits,1);assert.equal(delay,0);assert.equal(context.staged,null);assert.ok(context.net.history.some(r=>r.ospf));}
 }
});

test('OSPF animation layer overlaps foreground frames and cleans up independently',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(require.resolve('../assets/js/network-explorer-ui.js'),'utf8');
 function element(){return {children:[],attrs:{},events:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},append(child){child.parent=this;this.children.push(child);},replaceChildren(){this.children=[];},addEventListener(k,fn){this.events[k]=fn;},beginElementAt(){},remove(){this.parent.children=this.parent.children.filter(c=>c!==this);}};}
 const layers={traffic:element(),'ospf-traffic':element(),speed:{value:'600'},canvas:{getCurrentTime:()=>0}};
 const context={$:id=>layers[id],document:{createElementNS:()=>element()},net:{links:[{id:'l',a:'a'}],device:id=>({name:id})},flashPorts(){},cablePath:()=>({}),pathData:()=> 'M0 0L100 0'};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  function animateFlights('),source.indexOf('  function animateApplicationDelivery(')),context);
 const r={link:'l',from:'a',device:'b',frame:{type:'IPv4'}};
 context.animateFlights([r],true);const background=layers['ospf-traffic'].children[0];
 context.animateFlights([r]);assert.equal(layers['ospf-traffic'].children[0],background);assert.equal(layers.traffic.children.length,1);
 context.animateFlights([r],true);assert.equal(layers.traffic.children.length,1);assert.equal(layers['ospf-traffic'].children.length,2);
 background.children[0].events.endEvent();assert.equal(layers['ospf-traffic'].children.length,1);assert.equal(layers.traffic.children.length,1);
 layers.speed.value='0';context.animateFlights([r],true);assert.equal(layers['ospf-traffic'].children.length,1);
});

test('healthy startup needs no retransmissions and stable routers exchange only periodic Hellos',()=>{
 const x=topology();
 assert.equal(x.n.history.filter(e=>e.kind==='ospf-retry').length,0);
 const start=x.n.history.length,clock=x.n.clock;
 advance(x.n,100);
 const events=x.n.history.slice(start);
 assert.ok(events.some(e=>e.frame?.ospf?.message==='Hello'));
 assert.ok(events.every(e=>e.kind==='ospf-hello'||e.frame?.ospf?.message==='Hello'));
 // Six active interfaces: at most one Hello per interface per interval, plus a boundary cycle.
 assert.ok(events.filter(e=>e.frame?.ospf).length<=6*(Math.ceil((x.n.clock-clock)/10)+1));
 for(const s of Object.values(x.n.ospfState))assert.ok(Object.values(s.neighbors).every(nb=>nb.state==='Full'));
});

test('startup suppresses duplicate requests and batches current advertisements',()=>{
 const {n}=topology();
 const requests=n.history.filter(e=>e.frame?.ospf?.message==='Link State Request');
 assert.equal(requests.length,6,'one initial request per directed adjacency');
 assert.equal(new Set(requests.map(e=>e.from+':'+e.device)).size,6);
 const floods=n.history.filter(e=>e.kind==='ospf-flood');
 assert.ok(floods.some(e=>e.outgoingFrames.some(f=>f.frame.ospf.lsas.length>1)));
 for(const e of floods)for(const f of e.outgoingFrames)for(const lsa of f.frame.ospf.lsas){
  assert.equal(lsa.sequence,e.ospfBefore.database[lsa.routerId].sequence,'never flood a superseded version');
 }
 assert.ok(n.history.filter(e=>e.frame?.ospf).length<=72,'bounded startup traffic for the healthy triangle');
});
