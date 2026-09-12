const test=require('node:test');
const assert=require('node:assert/strict');
const Simulation=require('../assets/js/throughput-simulation.js');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const run=(s,seconds)=>{for(let i=0;i<seconds/Simulation.DT;i++)s.step();return s;};
for(const shared of [false,true])for(const n of shared?[2,3,4]:[1])for(const params of [{rs:40,rc:80,r:200},{rs:40,rc:20,r:200},{rs:40,rc:80,r:40},{rs:40,rc:40,r:40*n}]){
  test(`steady throughput and conservation: ${JSON.stringify({shared,n,...params})}`,()=>{
    const s=run(new Simulation(shared,{n,...params}),10);const expected=Math.min(params.rs,params.rc,shared?params.r/n:Infinity);
    for(const m of s.metrics()){assert.ok(Math.abs(m.recent-expected)<=Simulation.PACKET_MBITS+1e-8);assert.ok(Math.abs(m.average-expected)<=Simulation.PACKET_MBITS/s.time+1e-8);}
    close(s.generated,[...s.delivered,...s.lost,...s.core,...s.clients].reduce((a,b)=>a+b,0));
    assert.ok(s.core.reduce((a,b)=>a+b,0)<=20+1e-8);
    assert.ok(s.clients.every(q=>q>=0&&q<=20));
    assert.ok(s.lastOut.every(r=>r*Simulation.DT<=params.rc*Simulation.DT+Simulation.PACKET_MBITS));
    assert.ok([...s.core,...s.clients,...s.lost,...s.delivered].every(Number.isInteger));
    if(shared)assert.ok(s.lastCore.reduce((a,b)=>a+b,0)<=params.r+n*Simulation.PACKET_MBITS/Simulation.DT+1e-8);
  });
}
test('overload fills buffer, loses data, then drains after capacity increase',()=>{
  const s=run(new Simulation(false,{rs:40,rc:20}),2);close(s.clients[0],20);close(s.lost[0],20);
  s.configure({rc:80});run(s,.5);close(s.clients[0],0);close(s.lost[0],20);
  run(s,1);close(s.metrics()[0].recent,40);close(s.generated,s.delivered[0]+s.lost[0]);
});
test('shared backlog drains and downstream client queue is independent',()=>{
  const s=run(new Simulation(true,{n:2,rs:40,r:40,rc:10}),2);close(s.core[0],10);close(s.clients[0],20);assert.ok(s.lost[0]>0);
  s.configure({r:200,rc:200});run(s,1);close(s.core[0],0);close(s.clients[0],0);
});
test('rolling window, early samples, ties, reset and rate changes',()=>{
  const s=new Simulation(false,{rs:40,rc:40});close(s.metrics()[0].recent,0);s.step();close(s.metrics()[0].recent,0);
  assert.deepEqual(s.prediction().bottlenecks,['Server link','Client link']);run(s,1);s.configure({rs:20});run(s,1);close(s.metrics()[0].recent,20);assert.ok(s.metrics()[0].average>20);
  s.reset();close(s.time,0);close(s.generated,0);assert.equal(s.history.length,0);close(s.params.rs,20);
});
test('connection count resets state and independent simulations preserve state',()=>{
  const single=run(new Simulation(false),1),shared=run(new Simulation(true),2);shared.configure({n:4});close(shared.time,0);assert.equal(shared.clients.length,4);close(single.time,1);
});
