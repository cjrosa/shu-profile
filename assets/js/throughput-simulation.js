(function(root){
'use strict';
const DT=0.02, BUFFER=20, PACKET_MBITS=1;
class ThroughputSimulation {
  constructor(shared=false, params={}) {this.shared=shared;this.params={rs:40,rc:80,r:100,n:shared?2:1,...params};this.reset();}
  reset(){this.time=0;this.steps=0;this.core=Array(this.params.n).fill(0);this.clients=Array(this.params.n).fill(0);this.delivered=this.clients.slice();this.lost=this.clients.slice();this.generated=0;this.history=[];this.lastCore=this.clients.slice();this.lastOut=this.clients.slice();this.lastLoss=this.clients.slice();this.sourceCredit=this.clients.slice();this.coreCredit=this.clients.slice();this.clientCredit=this.clients.slice();}
  configure(params){const old=this.params.n;Object.assign(this.params,params);if(!this.shared)this.params.n=1;if(old!==this.params.n)this.reset();}
  prediction(){const p=this.params;const terms=[['Server link',p.rs],['Client link',p.rc]];if(this.shared)terms.push(['Shared link',p.r/p.n]);const rate=Math.min(...terms.map(t=>t[1]));return {rate,bottlenecks:terms.filter(t=>Math.abs(t[1]-rate)<1e-8).map(t=>t[0])};}
  // Fixed-size teaching packets. Fractional transmission work carries across steps.
  serve(queue,incoming,capacity,buffer,credits,i){
    const work=credits[i]+capacity*DT/PACKET_MBITS;
    const available=Math.round((queue+incoming)/PACKET_MBITS);
    const sentPackets=Math.min(available,Math.floor(work+1e-9));
    credits[i]=work-Math.floor(work+1e-9);
    const remaining=available-sentPackets,slots=Math.floor(buffer/PACKET_MBITS);
    return {sent:sentPackets*PACKET_MBITS,queue:Math.min(slots,remaining)*PACKET_MBITS,lost:Math.max(0,remaining-slots)*PACKET_MBITS};
  }
  step(){const p=this.params;const sample=[];
    for(let i=0;i<p.n;i++){
      this.sourceCredit[i]+=p.rs*DT/PACKET_MBITS;const packets=Math.floor(this.sourceCredit[i]+1e-9);this.sourceCredit[i]-=packets;const incoming=packets*PACKET_MBITS;this.generated+=incoming;let arrival=incoming,loss=0;
      if(this.shared){const a=this.serve(this.core[i],incoming,p.r/p.n,BUFFER/p.n,this.coreCredit,i);this.core[i]=a.queue;arrival=a.sent;loss+=a.lost;}
      this.lastCore[i]=arrival/DT;
      const b=this.serve(this.clients[i],arrival,p.rc,BUFFER,this.clientCredit,i);this.clients[i]=b.queue;loss+=b.lost;
      this.delivered[i]+=b.sent;this.lost[i]+=loss;this.lastOut[i]=b.sent/DT;this.lastLoss[i]=loss/DT;sample.push(b.sent);
    }
    this.time=++this.steps*DT;this.history.push(sample);if(this.history.length>50)this.history.shift();
  }
  metrics(){const duration=Math.min(1,this.time);return this.delivered.map((bits,i)=>({recent:duration?this.history.reduce((s,h)=>s+h[i],0)/duration:0,average:this.time?bits/this.time:0,queue:this.clients[i]+this.core[i],lost:this.lost[i]}));}
}
ThroughputSimulation.PACKET_MBITS=PACKET_MBITS;ThroughputSimulation.DT=DT;ThroughputSimulation.BUFFER=BUFFER;
if(typeof module!=='undefined'&&module.exports)module.exports=ThroughputSimulation;else root.ThroughputSimulation=ThroughputSimulation;
})(typeof globalThis!=='undefined'?globalThis:this);
