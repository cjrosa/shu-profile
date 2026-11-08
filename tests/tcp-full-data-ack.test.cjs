const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('../tools/llm-tokenizer/node_modules/jsdom');

test('data, retransmissions, and probes acknowledge the reverse stream',()=>{
  const html=fs.readFileSync('cs339/tcp_full_V3.html','utf8');
  const dom=new JSDOM(html,{runScripts:'outside-only'});
  const w=dom.window;
  const ctx=new Proxy({}, {get:(_,key)=>key==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
  w.HTMLCanvasElement.prototype.getContext=()=>ctx;
  w.requestAnimationFrame=()=>{};
  const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  w.eval(script.replace('requestAnimationFrame(loop);\nrenderLog();',`window.api={loop,doConnect,doClose,emitAck,simEmitRetxAck,sendSegCore,triggerFastRetx,sendProbe,
    retransmit:()=>{rto.seq=snd.unacked[0].seq;rto.pendingManual=true;doRetransmit();},
    snapshot:()=>({expected:ISN_R+1,senderNext:snd.nxt,received:rcv.exp,logs:logE.slice(),packets:pkts.slice()})};
    requestAnimationFrame(loop);\nrenderLog();`));
  const a=w.api;
  a.doConnect();
  let ts=0;
  for(let i=0;i<50;i++)a.loop(ts+=50);
  a.sendSegCore(false,0);
  for(let i=0;i<35;i++)a.loop(ts+=50);
  a.sendSegCore(false,0);
  a.retransmit();
  a.triggerFastRetx();
  a.sendProbe();
  const state=a.snapshot();
  const data=state.logs.filter(e=>e.flags.includes('PSH'));
  assert.equal(data.length,5);
  for(const e of data){
    assert.ok(e.flags.includes('ACK'));
    assert.equal(e.ack,state.expected,'ACK follows the reverse stream, not the outgoing data');
  }
  for(const p of state.packets.filter(p=>p.l1.includes('PSH'))){
    assert.ok(p.l1.includes('ACK'));
    assert.ok(p.l2.includes('ack='+state.expected));
  }
  assert.ok(w.document.querySelector('.psh-r .fl-psh').textContent.includes('PSH+ACK'));
  assert.ok(w.document.querySelector('#exchange-body').textContent.includes('PSH+ACK'));
  // ACK-only responses (including duplicate and retransmission ACKs) carry
  // the same reverse-stream SEQ without consuming sequence space.
  const before=a.snapshot();
  a.emitAck();
  a.emitAck();
  a.simEmitRetxAck();
  assert.equal(a.snapshot().senderNext,before.senderNext);
  for(const p of a.snapshot().packets.filter(p=>p.dir==='toL'&&p.l1.startsWith('ACK'))){
    assert.ok(p.l1.includes('seq='+state.expected));
    assert.ok(p.l2.includes('ack='));
  }
  for(let i=0;i<35;i++)a.loop(ts+=50); // Deliver the probe and its ACK.
  const responses=a.snapshot().logs.filter(e=>e.dir==='←'&&e.flags.startsWith('ACK'));
  assert.ok(responses.length>=5);
  for(const e of responses){
    assert.equal(e.seq,state.expected);
    assert.equal(e.len,0);
  }
  a.doClose();
  for(let i=0;i<35;i++)a.loop(ts+=50);
  const finalAck=a.snapshot().logs.at(-1);
  assert.equal(finalAck.flags,'ACK');
  assert.equal(finalAck.seq,a.snapshot().logs.find(e=>e.flags==='FIN').seq+1);
  assert.equal(finalAck.ack,state.expected+1);
  dom.window.close();
});
