const test = require('node:test');
const assert = require('node:assert/strict');
const Queue = require('../assets/js/packet-queue-simulation.js');
const defaults = {arrival:4000, bytes:1500, rate:1e8};
function seeded(seed=7) {return () => {seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function close(a,b,tolerance=1e-10){assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);}

test('Poisson scheduling, FIFO order, and waiting time measured at service start',()=>{
  const q=new Queue({arrival:1,bytes:1000,rate:8000},()=>1-Math.exp(-.5));
  close(q.nextArrival,.5);q.step();assert.equal(q.active.id,1);close(q.time,.5);
  q.step();assert.equal(q.length,1);assert.equal(q.started,1);
  q.step();assert.equal(q.active.id,2);assert.equal(q.transmitted,1);
  close(q.waitSum,.5);assert.equal(q.started,2);assert.equal(q.length,0);
});

test('link changes apply to remaining bits; packet size changes only affect future arrivals',()=>{
  const q=new Queue({arrival:1,bytes:1000,rate:8000},()=>1-Math.exp(-.5));
  q.step();q.advance(.75);close(q.active.remaining,6000);
  q.configure({...q.params,rate:16000,bytes:500});
  close(q.active.remaining,6000);assert.equal(q.active.bits,8000);
  q.step();assert.equal(q.queue[q.head].bits,4000);
  q.step();close(q.time,1.125);assert.equal(q.active.bits,4000);
});

test('zero arrivals schedules nothing and allows a backlog to drain',()=>{
  const empty=new Queue({...defaults,arrival:0},seeded());assert.equal(empty.step(),false);
  assert.equal(empty.started,0);empty.advance(.001);assert.equal(empty.length,0);
  const q=new Queue({...defaults,arrival:20000},seeded());
  q.advance(.01,100000);assert.ok(q.length>0);
  const arrived=q.arrived;q.configure({...q.params,arrival:0});
  while(q.step()){}
  assert.equal(q.length,0);assert.equal(q.active,null);assert.equal(q.transmitted,arrived-q.dropped);
});

test('tail drop preserves queued packets and excludes lost packets from measured delay',()=>{
  const q=new Queue({arrival:1,bytes:1000,rate:4000},()=>1-Math.exp(-.5),1);
  q.step();q.step();q.step();q.step();
  assert.equal(q.active.id,1);assert.equal(q.queue[q.head].id,2);
  assert.equal(q.dropped,2);assert.equal(q.started,1);assert.equal(q.waitSum,0);
  q.step();assert.equal(q.active.id,2);assert.equal(q.started,2);close(q.waitSum,1.5);
});

test('burst restores arrival rate; manual changes cancel restoration; restart clears state',()=>{
  const q=new Queue(defaults,seeded());q.startBurst();
  close(q.params.arrival,12500);q.advance(20*q.baseline,100000);
  assert.equal(q.params.arrival,4000);assert.equal(q.burst,null);
  q.startBurst();q.configure({...q.params,arrival:3000});
  q.advance(q.time+21*q.baseline,100000);assert.equal(q.params.arrival,3000);
  q.restart(q.params);assert.equal(q.params.arrival,3000);assert.equal(q.time,0);
  assert.equal(q.length,0);assert.equal(q.waitSum,0);assert.equal(q.started,0);
  assert.equal(q.markers.length,0);assert.equal(q.history.length,1);
});

test('full queue drops new arrivals, keeps running, and drains after arrivals stop',()=>{
  const q=new Queue({...defaults,arrival:100000},seeded(),5);
  q.advance(.01,100000);
  assert.equal(q.length,5);assert.ok(q.dropped>0);assert.ok(q.transmitted>0);
  assert.equal(q.arrived,q.length+q.transmitted+q.dropped+(q.active?1:0));
  const dropped=q.dropped;q.configure({...q.params,arrival:0});
  while(q.step()){}
  assert.equal(q.length,0);assert.equal(q.dropped,dropped);
  assert.equal(q.transmitted,q.arrived-q.dropped);
  q.restart(q.params);assert.equal(q.dropped,0);assert.equal(q.lastDrop,null);assert.equal(q.capacity,5);
});

test('different playback frame sizes and event budgets preserve results',()=>{
  const results=[];
  for(const speed of [.25,1,4]){
    const q=new Queue(defaults,seeded());
    const end=.1, increment=q.baseline*4*speed/60;
    while(q.time<end)q.advance(Math.min(end,q.time+increment),20);
    results.push(q);
  }
  for(const q of results.slice(1)){
    assert.equal(q.arrived,results[0].arrived);assert.equal(q.transmitted,results[0].transmitted);
    close(q.waitSum,results[0].waitSum);assert.equal(q.length,results[0].length);
  }
  const q=new Queue(defaults,seeded());q.advance(.1,1);
  assert.equal(q.arrived,1);assert.ok(q.time<.1);
});

test('long stable run approaches M/D/1 prediction with bounded history',()=>{
  const q=new Queue(defaults,seeded(),100000);
  for(let i=0;i<400000;i++)q.step();
  const predicted=.00012*.48/(2*(1-.48)),measured=q.waitSum/q.started;
  assert.ok(Math.abs(measured-predicted)/predicted<.03);
  assert.ok(q.history.length<=403);
  assert.ok(q.history[0].time>=q.time-201*q.baseline);
});

test('very sparse arrivals do not create unbounded history work',()=>{
  const q=new Queue({...defaults,arrival:1e-20},seeded());q.step();
  assert.equal(q.arrived,1);assert.ok(q.history.length<=403);
});
