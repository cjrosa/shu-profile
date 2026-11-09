const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('../tools/llm-tokenizer/node_modules/jsdom');
test('loss recovery preserves outstanding segments until each ACK arrives',()=>{
  const html=fs.readFileSync('cs339/tcp_full_V3.html','utf8');
  const dom=new JSDOM(html,{runScripts:'outside-only'}),w=dom.window;
  w.requestAnimationFrame=()=>{};
  const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1].replace(/\r\n/g,'\n');
  w.eval(script.replace('requestAnimationFrame(loop);\nrenderLog();',`window.api={loop,doConnect,sendSegCore,setup:()=>{mode='sim';sim.running=false;cc.cwnd=4;},snapshot:()=>({next:snd.nxt,una:snd.una,received:rcv.exp,queue:snd.unacked.map(s=>s.seq),flight:snd.inflight,logs:logE.slice()})};requestAnimationFrame(loop);\nrenderLog();`));
  const a=w.api;let ts=0;const advance=n=>{for(let i=0;i<n;i++)a.loop(ts+=50);};
  a.doConnect();advance(50);a.setup();
  const first=a.snapshot().next;
  a.sendSegCore(true,0);a.sendSegCore(false,100);a.sendSegCore(false,200);
  const end=a.snapshot().next;advance(30);
  assert.equal(a.snapshot().queue.length,3);
  let partial=false;
  for(let i=0;i<220;i++){
    advance(1);const state=a.snapshot();
    assert.equal(state.next,end,'next sequence never rewinds');
    if(state.una===first+1000){partial=true;assert.equal(state.queue.length,2);assert.equal(state.flight,2000);}
  }
  const final=a.snapshot();assert.ok(partial,'first retransmission ACK leaves later segments queued');
  assert.equal(final.received,end);assert.equal(final.una,end);assert.equal(final.queue.length,0);
  assert.equal(final.logs.filter(e=>e.flags==='PSH+ACK [recovery]').length,2);
  dom.window.close();
});

test('Reno duplicate ACK burst causes one fast retransmit and one recovery completion',()=>{
  const html=fs.readFileSync('cs339/tcp_full_V3.html','utf8');
  const dom=new JSDOM(html,{runScripts:'outside-only'}),w=dom.window;
  w.requestAnimationFrame=()=>{};
  const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  w.eval(script.replace(/\}\)\(\);\s*$/, `
    ccVariant='reno';cc.cwnd=10;cc.phase='cong_avoid';cc.lastAck=1000;
    recordChart();
    window.api={ack:onAckCC,state:()=>({phase:cc.phase,cwnd:cc.cwnd,ssthresh:cc.ssthresh,
      lastAck:cc.lastAck,events:ccEvents.map(e=>e.label),losses:lossMarkers.length})};
  })();`));
  const a=w.api;
  for(let i=0;i<3;i++)a.ack(1000);
  assert.equal(a.state().phase,'fast_recovery');
  assert.equal(a.state().ssthresh,5);
  for(let i=0;i<10;i++)a.ack(1000);
  a.ack(900);
  assert.equal(a.state().phase,'fast_recovery','duplicate and stale ACKs must not end recovery');
  assert.equal(a.state().losses,1,'one loss must not repeatedly halve the window');
  assert.equal(a.state().cwnd,5);
  assert.deepEqual(Array.from(a.state().events),['Window initialized','Fast retransmit']);
  a.ack(2000);
  assert.equal(a.state().phase,'cong_avoid');
  assert.deepEqual(Array.from(a.state().events),['Window initialized','Fast retransmit','Enter congestion avoidance']);
  for(let i=0;i<5;i++)a.ack(1000);
  assert.equal(a.state().lastAck,2000,'late ACKs must not rewind acknowledgment progress');
  assert.equal(a.state().losses,1);
  assert.equal(a.state().ssthresh,5);
  // A later, distinct loss can still start another recovery.
  for(let i=0;i<3;i++)a.ack(2000);
  assert.equal(a.state().phase,'fast_recovery');
  assert.equal(a.state().losses,2);
  dom.window.close();
});
