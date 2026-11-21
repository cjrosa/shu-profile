const {test}=require('node:test'),assert=require('node:assert/strict');
const {Network}=require('../assets/js/network-explorer-engine.js');
const lab=require('../assets/js/network-explorer-troubleshooting.js');
const incidents=require('../assets/js/network-explorer-incidents.js');
for(const area of incidents.catalog)test(area.id+' incidents fail, repair, and preserve the working baseline',()=>{
  const baseline=incidents.prepare(Network,area.id,lab,()=>.45,'intermediate'),snapshot=JSON.stringify(baseline);
  const candidates=incidents.candidates(Network,baseline,area.id,lab);assert.ok(candidates.length);
  for(const fault of candidates){
    assert.ok(lab.verify(Network,baseline,fault));
    const n=new Network(baseline);lab.apply(n,fault);assert.equal(lab.verify(Network,n.save(),fault),false);
    lab.apply(n,fault,true);assert.ok(lab.verify(Network,n.save(),fault));assert.deepEqual(n.save(),baseline);
  }
  assert.equal(JSON.stringify(baseline),snapshot);
});
for(const area of ['arp','firewall','wireless','ospf'])test(area+' offers distinct faults and avoids immediate repeats',()=>{
  const data=incidents.prepare(Network,area,lab,()=>.45,'intermediate');
  const first=incidents.choose(Network,data,area,lab,()=>0),next=incidents.choose(Network,data,area,lab,()=>0,first.signature);
  assert.notEqual(first.fault.variant,next.fault.variant);
});
test('unsupported current network is rejected without edits',()=>{
  const n=new Network(),data=n.save();assert.throws(()=>incidents.choose(Network,data,'arp',lab),/No verified/);assert.deepEqual(n.save(),data);
});
test('report detail varies independently of the fault without revealing its cause',()=>{
  const f={kind:'web',sourceName:'Practice Client',url:'http://practice.example/',variant:'removed'};
  const reports=[0,.5,.99].map(r=>lab.incidentReport(f,()=>r));
  assert.equal(new Set(reports.map(r=>r.body)).size,3);
  assert.ok(reports[0].body.length<reports[1].body.length);
  assert.ok(reports[1].body.length<reports[2].body.length);
  for(const r of reports){assert.match(r.body,/Practice Client/);assert.match(r.body,/practice\.example/);assert.doesNotMatch(r.body,/removed|disabled/);}
});
test('generation requires an explicit network complexity',()=>{
  assert.throws(()=>incidents.prepare(Network,'interfaces',lab),/Choose a network complexity/);
});
test('report references match full names and avoid ambiguous or partial matches',()=>{
  const devices=[{id:'a',name:'Host 2'},{id:'b',name:'Host 26'},{id:'c',name:'Duplicate'},{id:'d',name:'Duplicate'}];
  const text='Host 26 cannot reach Host 2. Host 260 and Duplicate remain plain.';
  const parts=lab.reportReferences(text,devices);
  assert.equal(parts.map(p=>p.text).join(''),text);
  assert.deepEqual(parts.filter(p=>p.device).map(p=>p.device),['b','a']);
});
for(const area of incidents.catalog)test(area.id+' supports every network complexity independently of area difficulty',()=>{
  const sizes=[];
  for(const complexity of ['basic','intermediate','advanced']){
    const data=incidents.prepare(Network,area.id,lab,()=>.45,complexity);
    sizes.push(data.devices.length);
    const {fault}=incidents.choose(Network,data,area.id,lab,()=>.5);
    assert.ok(lab.verify(Network,data,fault));
    const n=new Network(data);lab.apply(n,fault);assert.equal(lab.verify(Network,n.save(),fault),false);
    lab.apply(n,fault,true);assert.ok(lab.verify(Network,n.save(),fault));
    for(const h of data.devices.filter(d=>d.name.startsWith('Office '))){
      const peer=data.devices.find(d=>d.type==='host'&&d.id!==h.id&&d.ip&&d.ip.split('.').slice(0,3).join('.')===h.ip.split('.').slice(0,3).join('.'));
      assert.ok(lab.probe(Network,data,h.id,peer.ip),'added clients have working connectivity');
    }
  }
  assert.ok(sizes[0]<sizes[1]&&sizes[1]<sizes[2],JSON.stringify(sizes));
});

test('OSPF reports describe routing symptoms without disclosing the chosen fault',()=>{
 const baseline=incidents.prepare(Network,'ospf',lab,()=>.5,'intermediate');
 const faults=incidents.candidates(Network,baseline,'ospf',lab);
 assert.deepEqual([...new Set(faults.map(f=>f.variant))].sort(),['cost','disabled','passive']);
 for(const fault of faults){
  const report=lab.incidentReport(fault,()=>.99);
  assert.match(report.body,/alternate path/);
  assert.doesNotMatch(report.body,/disabled|Passive|raised|cannot reach/);
 }
});

test('gateway and interface incidents recognize a saved healthy OSPF triangle',()=>{
 const OSPF=require('../assets/js/network-explorer-ospf.js');
 const {network:n}=OSPF.example(Network,true),data=n.save(),snapshot=JSON.stringify(n);
 for(const area of ['routing','interfaces']){
  const faults=incidents.candidates(Network,data,area,lab);
  assert.ok(faults.length,area+' supports the current network before live convergence');
  for(const fault of faults){
   assert.ok(lab.verify(Network,data,fault));
   const broken=new Network(data);lab.apply(broken,fault);
   assert.equal(lab.verify(Network,broken.save(),fault),false);
   lab.apply(broken,fault,true);assert.ok(lab.verify(Network,broken.save(),fault));
  }
 }
 assert.equal(JSON.stringify(n),snapshot,'compatibility checks leave the live network untouched');
});
