const {test}=require('node:test'),assert=require('node:assert/strict');
const {Network}=require('../assets/js/network-explorer-engine.js');
const {complex,arrange}=require('../assets/js/network-explorer-examples.js');
function drain(n){let steps=0;while(n.queue.length){n.next();assert.ok(++steps<1500);}return n.results.at(-1);}
test('four-switch LAN connects the diagram branches and supports every host pair',()=>{
 const {network:n,clientId}=require('../assets/js/network-explorer-examples.js').switchedTree(Network);
 const byName=name=>n.devices.find(d=>d.name===name),peers=d=>n.links.flatMap(l=>l.a===d.id?[n.device(l.b).name]:l.b===d.id?[n.device(l.a).name]:[]).sort();
 assert.equal(n.devices.length,13);assert.equal(n.links.length,12);assert.equal(clientId,byName('A').id);
 for(const [name,expected]of [['S1',['A','B','C','S4']],['S2',['D','E','F','S4']],['S3',['G','H','I','S4']],['S4',['S1','S2','S3']]])assert.deepEqual(peers(byName(name)),expected);
 const hosts=n.devices.filter(d=>d.type==='host');assert.ok(hosts.every(d=>d.prefix===24&&!d.gateway));
 const saved=n.save();assert.deepEqual(new Network(saved).save(),saved);
 for(const a of hosts)for(const b of hosts)if(a!==b){const fresh=new Network(saved);fresh.ping(a.id,b.ip);assert.equal(drain(fresh).ok,true,a.name+' to '+b.name);}
});
test('layout modes keep switch branches together and preserve radial router layouts',()=>{
 const {switchedTree}=require('../assets/js/network-explorer-examples.js');
 const n=switchedTree(Network).network,links=structuredClone(n.links);
 arrange(n);const byName=name=>n.devices.find(d=>d.name===name);
 assert.ok(byName('S4').y<byName('S1').y);
 assert.ok(byName('S1').x<byName('S2').x&&byName('S2').x<byName('S3').x);
 assert.ok(Math.max(...['A','B','C'].map(k=>byName(k).x))<Math.min(...['D','E','F'].map(k=>byName(k).x)));
 const positions=n.devices.map(d=>[d.x,d.y]);arrange(n);assert.deepEqual(n.devices.map(d=>[d.x,d.y]),positions);
 arrange(n,'radial');assert.notDeepEqual(n.devices.map(d=>[d.x,d.y]),positions);
 const restored=new Network(n.save());assert.equal(restored.layoutMode,'radial');arrange(restored);assert.deepEqual(restored.devices.map(d=>[d.x,d.y]),n.devices.map(d=>[d.x,d.y]));
 arrange(restored,'hierarchical');assert.deepEqual(restored.devices.map(d=>[d.x,d.y]),positions);assert.deepEqual(n.links,links);
 assert.throws(()=>new Network({...n.save(),layoutMode:'invalid'}),/layout mode/);
 const campus=complex(Network).network;arrange(campus,'auto');const radial=campus.devices.map(d=>[d.x,d.y]);arrange(campus,'radial');assert.deepEqual(campus.devices.map(d=>[d.x,d.y]),radial);
});
test('arrange separates hosts on sibling access switches without changing their connections',()=>{
 const n=new Network(),root=n.add('switch'),branches=[n.add('switch'),n.add('switch')];
 branches.forEach((sw,i)=>{n.connect(root.id,'p'+i,sw.id,'p0');for(let j=0;j<2;j++){const h=n.add('host');h.name='LAN 4 Host '+(55+i*2+j);n.connect(sw.id,'p'+(j+1),h.id,'p0');}});
 const links=structuredClone(n.links);arrange(n);
 for(let i=0;i<n.devices.length;i++)for(const b of n.devices.slice(i+1)){const a=n.devices[i];assert.ok(Math.abs(a.x-b.x)>=170||Math.abs(a.y-b.y)>=130,a.name+' overlaps '+b.name);}
 assert.deepEqual(n.links,links);
 const positions=n.devices.map(d=>[d.x,d.y]);arrange(n);assert.deepEqual(n.devices.map(d=>[d.x,d.y]),positions);
});
test('generated routed networks have separated device footprints after arrangement',()=>{
 const {generate}=require('../assets/js/network-explorer-troubleshooting.js');
 for(const level of ['basic','intermediate','advanced'])for(const sample of [0,.45,.99]){
  const n=generate(Network,level,()=>sample);const links=structuredClone(n.links);arrange(n);
  for(let i=0;i<n.devices.length;i++)for(const b of n.devices.slice(i+1)){const a=n.devices[i];assert.ok(Math.abs(a.x-b.x)>=170||Math.abs(a.y-b.y)>=130,level+': '+a.name+' overlaps '+b.name);}
  assert.deepEqual(n.links,links);
  for(const host of n.devices.filter(d=>d.type==='host'))assert.equal(n.links.filter(l=>l.a===host.id||l.b===host.id).length,1);
 }
});
test('campus triangle has three routers, seven switches, VLAN trunks and working DHCP/DNS/HTTP',()=>{
 const {network:n,clientId}=complex(Network),routers=n.devices.filter(d=>d.type==='router');
 assert.equal(routers.length,3);assert.equal(n.devices.filter(d=>d.type==='switch').length,7);
 assert.ok(routers.every(r=>r.ports.filter(p=>!p.parentPort).length===3));assert.ok(n.devices.every(d=>!d.watch));
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
 const {network:campus}=complex(Network),saved=campus.save(),router=saved.devices.find(d=>d.type==='router');router.ports[2].ip=router.ports.find(p=>p.parentPort).ip;router.ports[2].prefix=24;assert.throws(()=>new Network(saved),/Overlapping/);
});

test('direct connection has two static Windows hosts and bidirectional reachability without a gateway',()=>{
 const {network:n,clientId}=require('../assets/js/network-explorer-examples.js').direct(Network);
 assert.equal(n.devices.length,2);assert.equal(n.links.length,1);assert.equal(clientId,n.devices[0].id);
 assert.deepEqual(n.devices.map(d=>[d.name,d.os,d.ip,d.prefix,d.gateway]),[['Host 1','windows','192.168.1.1',24,''],['Host 2','windows','192.168.1.2',24,'']]);
 for(const [a,b]of [[0,1],[1,0]]){n.ping(n.devices[a].id,n.devices[b].ip);assert.equal(drain(n).ok,true);}
 assert.deepEqual(new Network(n.save()).save(),n.save());
});

test('star layout surrounds a switch and keeps attached services and notes nearby',()=>{
 const n=new Network(),sw=n.add('switch');
 for(let i=0;i<4;i++){const h=n.add('host');n.connect(sw.id,'p'+i,h.id,'p0');}
 const h=n.devices[1];n.configureDnsServer(h.id,{enabled:true,records:[]});
 n.notes=[{id:'note1',target:h.id,x:9000,y:9000},{id:'note2',target:'dns:'+h.id,x:9000,y:9000}];
 arrange(n);
 assert.ok(n.devices.some(d=>d.x<sw.x));assert.ok(n.devices.some(d=>d.x>sw.x));
 assert.ok(n.devices.some(d=>d.y<sw.y));assert.ok(n.devices.some(d=>d.y>sw.y));
 assert.ok(Math.hypot(h.dnsOffset.x,h.dnsOffset.y)<=160);
 for(const note of n.notes)assert.ok(Math.hypot(note.x-h.x,note.y-h.y)<260);
});

test('moving a device carries its notes and refreshes both cable anchors',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(require.resolve('../assets/js/network-explorer-ui.js'),'utf8');
 const d={id:'a',x:100,y:100},peer={id:'b',x:400,y:100};
 const link={a:'a',b:'b',ap:'p0',bp:'p0',aAnchor:'top',bAnchor:'bottom'};
 const net={devices:[d,peer],device:id=>id==='a'?d:peer,links:[link],notes:[{target:'a',x:150,y:50},{target:'dns:a',x:210,y:30},{target:'b',x:400,y:40}]};
 const context={net,applications:()=>[{id:'dns:a',host:'a'}],portPosition:(d,p,side)=>({x:d.x,y:d.y,side})};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  function moveDeviceVisual('),source.indexOf('  function pathData(')),context);
 context.moveDeviceVisual(d,600,100);
 assert.equal(net.notes[0].x,650);assert.equal(net.notes[1].x,710);assert.equal(net.notes[2].x,400);
 context.cablePath(link);assert.equal(link.aAnchor,'left');assert.equal(link.bAnchor,'right');
 context.moveDeviceVisual(d,400,400);context.cablePath(link);assert.equal(link.aAnchor,'top');assert.equal(link.bAnchor,'bottom');
});

test('OSPF example is compact and radial before any UI arrangement',()=>{
 const {network:n}=require('../assets/js/network-explorer-ospf.js').example(Network,true);
 const routers=n.devices.filter(d=>d.type==='router'),center={x:routers.reduce((s,d)=>s+d.x,0)/3,y:routers.reduce((s,d)=>s+d.y,0)/3};
 for(const router of routers){
  const link=n.links.find(l=>(l.a===router.id&&n.device(l.b).type==='host')||(l.b===router.id&&n.device(l.a).type==='host'));
  const host=n.device(link.a===router.id?link.b:link.a);
  assert.ok((host.x-router.x)*(router.x-center.x)+(host.y-router.y)*(router.y-center.y)>0,'host lies outward from router core');
  assert.ok(Math.hypot(host.x-router.x,host.y-router.y)<=280,'LAN remains close');
 }
 for(const note of n.notes){const parent=n.device(note.target);assert.ok(Math.hypot(note.x-parent.x,note.y-parent.y)<110,'note starts beside parent');}
 const positions=n.devices.map(d=>[d.x,d.y]);arrange(n);assert.deepEqual(n.devices.map(d=>[d.x,d.y]),positions);
});

test('campus distribution belongs only to Client Router and carries isolated department VLANs',()=>{
 const {network:n}=complex(Network),byName=name=>n.devices.find(d=>d.name===name);
 const peers=d=>n.links.flatMap(l=>l.a===d.id?[n.device(l.b).name]:l.b===d.id?[n.device(l.a).name]:[]).sort();
 assert.deepEqual(peers(byName('Campus Distribution')),['CS Access','Campus Server','Client Router','EE Access','Shared Access']);
 assert.deepEqual(peers(byName('Services Switch')),['DHCP Host','DNS Host','Services Router']);
 assert.deepEqual(peers(byName('Web Switch')),['Web Host','Web Router']);
 assert.ok(peers(byName('CS Access')).includes('CS Lab'));
 n.acquireDhcp(byName('EE Client A').id);assert.equal(drain(n).ok,true);n.acquireDhcp(byName('EE Client B').id);assert.equal(drain(n).ok,true);n.ping(byName('EE Client A').id,byName('EE Client B').ip);assert.equal(drain(n).ok,true);
 assert.ok(n.history.some(e=>e.frame?.vlanTag===40));
 const segment=require('../assets/js/network-explorer-vlan.js').segment(n,byName('EE Client A').id,'p0');
 assert.ok(segment.some(([id,port])=>id===byName('Client Router').id&&port==='p0.40'));assert.ok(!segment.some(([id])=>id===byName('Remote Client').id));
 for(const name of ['CS Access','Shared Access','EE Access'])assert.ok(byName(name).y>byName('Campus Distribution').y);
 assert.ok(byName('Campus Distribution').y>byName('Client Router').y);
});
