const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('../tools/llm-tokenizer/node_modules/jsdom');

test('receiver drains advertise restored windows without changing congestion state',()=>{
  const html=fs.readFileSync('cs339/tcp_full_V3.html','utf8');
  const dom=new JSDOM(html,{runScripts:'outside-only'}),w=dom.window;
  w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({}, {get:(_,k)=>k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
  w.requestAnimationFrame=()=>{};
  const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  w.eval(script.replace('requestAnimationFrame(loop);\nrenderLog();',`window.windowAPI={recvSeg,drainRecv,loop,sim,
    prepare:(auto=false)=>{st='established';snd.rw=9000;rcv.held=1000;rcv.buf=[{seq:1,len:1000,pi:0,id:1}];rcv.exp=1001;cc.cwnd=4;cc.dupAcks=2;pkts=[];autoRecv=auto;probe.s='persist';if(auto)scheduleAutoRecv();},
    state:()=>({rw:snd.rw,held:rcv.held,cwnd:cc.cwnd,dup:cc.dupAcks,probe:probe.s,packets:pkts.length,log:logE.at(-1)})};requestAnimationFrame(loop);\nrenderLog();`));
  const api=w.windowAPI;let ts=0;
  const advance=n=>{for(let i=0;i<n;i++)api.loop(ts+=50);};
  for(const drain of ['recvSeg','drainRecv','auto']){
    api.prepare(drain==='auto');
    if(drain==='auto')advance(10);else api[drain]();
    assert.equal(api.state().held,0);
    assert.equal(api.state().rw,9000,'sender waits for the window update to arrive');
    assert.equal(api.state().log.flags,'ACK [window update]');
    assert.equal(api.state().log.rw,10000);
    api.sim.paused=true;advance(20);assert.equal(api.state().rw,9000);
    api.sim.paused=false;advance(15);
    assert.equal(api.state().rw,10000,drain+' restores the full advertised window');
    assert.equal(api.state().cwnd,4);assert.equal(api.state().dup,2);
    assert.equal(api.state().probe,'idle');
    const count=api.state().packets;api.drainRecv();assert.equal(api.state().packets,count,'empty drain emits no update');
  }
  dom.window.close();
});
