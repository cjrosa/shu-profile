(function(root){
 'use strict';
 const defaults={a:41,b:78,size:20,sizeB:12,mss:4,mssB:6,windowSize:8,ackMode:'manual',duplex:false,autoRead:false};
 const other=id=>id==='A'?'B':'A';
 function integer(v,min,max,label){if(!Number.isInteger(v)||v<min||v>max)throw Error(`${label} must be an integer from ${min} to ${max}.`);}
 function create(config={}){
  const c={...defaults,...config};
  for(const [k,min,max] of [['a',0,1000000],['b',0,1000000],['size',1,256],['sizeB',1,256],['mss',1,64],['mssB',1,64],['windowSize',1,64]])integer(c[k],min,max,k);
  if(!['manual','immediate','delayed'].includes(c.ackMode))throw Error('Choose manual, immediate, or delayed ACKs.');
  const s={c,phase:0,hosts:{},packets:[],events:[],serial:0,time:0,turn:'A'};
  for(const id of ['A','B']){
   const a=id==='A',isn=a?c.a:c.b,peer=a?c.b:c.a;
   s.hosts[id]={id,isn,start:isn+1,state:a?'CLOSED':'LISTEN',size:a?c.size:c.sizeB,mss:a?c.mss:c.mssB,windowSize:c.windowSize,rto:3,deadline:null,submitted:0,consumed:0,una:isn,nxt:isn,rcv:peer,read:peer+1,right:isn,buffer:[],tx:[],delayed:0,version:0,lastWire:{ack:peer+1,version:0}};
  }return s;
 }
 const established=s=>s.phase===3,enabled=(s,id)=>id==='A'||s.c.duplex;
 const readable=h=>Math.max(0,h.rcv-h.read);
 const available=(s,id='A')=>Math.max(0,s.hosts[id].right-s.hosts[id].nxt);
 const canSend=(s,id='A')=>established(s)&&enabled(s,id)&&s.hosts[id].nxt<s.hosts[id].start+s.hosts[id].submitted&&available(s,id)>0;
 const outstanding=(s,id)=>s.hosts[id].tx.filter(p=>p.seq+p.len>s.hosts[id].una);
 function snapshot(s){return Object.fromEntries(['A','B'].map(id=>{const h=s.hosts[id];return [id,{state:h.state,una:h.una,nxt:h.nxt,rcv:h.rcv,right:h.right,read:h.read,buffer:h.buffer.length,consumed:h.consumed,submitted:h.submitted}];}));}
 function event(s,kind,host,explanation,p=null,range=null,stream=host){s.events.push({id:s.events.length+1,kind,host,explanation,packetId:p?.id??null,from:p?.from??host,to:p?.to??host,flags:p?.flags??'—',seq:p?.seq??null,ack:p?.ack??null,len:p?.len??0,range,stream,state:snapshot(s)});}
 function packet(s,from,fields){const p={id:++s.serial,from,to:other(from),flags:'ACK',len:0,kind:'ack',status:'queued',...fields};s.packets.push(p);return p;}
 function handshake(s){
  const a=s.hosts.A,b=s.hosts.B;let p;
  if(s.phase===0){s.phase=1;a.state='SYN-SENT';a.nxt=a.start;b.rcv=a.start;
   p=packet(s,'A',{kind:'handshake',flags:'SYN',seq:a.isn,ack:null,status:'received'});
   event(s,'handshake','A',`Host A sends SYN (SEQ=${a.isn}). The SYN consumes one sequence number. Host B will acknowledge with ACK=${a.start}, and Host A's first data byte will use SEQ=${a.start}.`,p);
  }else if(s.phase===1){s.phase=2;b.state='SYN-RECEIVED';b.nxt=b.start;a.rcv=b.start;a.una=a.start;a.right=a.start+a.windowSize;
   p=packet(s,'B',{kind:'handshake',flags:'SYN, ACK',seq:b.isn,ack:a.start,status:'received'});
   event(s,'handshake','B',`Host B sends SYN-ACK (SEQ=${b.isn}, ACK=${a.start}). ACK=${a.start} acknowledges Host A's SYN. Host B's SYN consumes one number in its own sequence space, so its first data byte will use SEQ=${b.start}.`,p);
  }else if(s.phase===2){s.phase=3;a.state=b.state='ESTABLISHED';b.una=b.start;b.right=b.start+b.windowSize;
   p=packet(s,'A',{kind:'handshake',seq:a.nxt,ack:b.start,status:'received'});
   event(s,'handshake','A',`Host A sends ACK (SEQ=${a.nxt}, ACK=${b.start}, LEN=0). It acknowledges Host B's SYN without consuming another sequence number. Both hosts are ESTABLISHED. Application data can now be submitted to TCP; first data SEQ is ${a.start} at A and ${b.start} at B.`,p);
  }return p;
 }
 function setMode(s,value){if(s.phase!==0||s.events.length)throw Error('Reset the simulation before changing Full Duplex mode.');s.c.duplex=Boolean(value);}
 function submit(s,id='A',count){
  const h=s.hosts[id];if(!established(s)||!enabled(s,id))return;const n=count??h.size-h.submitted;integer(n,1,256,'Submit size');const len=Math.min(n,h.size-h.submitted);if(!len)return;
  const first=h.start+h.submitted;h.submitted+=len;
  event(s,'submit',id,`Host ${id}'s application submits ${len} bytes to its TCP send buffer, assigned stream positions ${first}–${first+len-1}. These bytes have not crossed the network. SND.NXT remains ${h.nxt}; TCP will advance it only when it transmits new data.`,null,[first,first+len],id);
 }
 function acknowledgment(h){return {ack:h.rcv,version:++h.version};}
 function queueAck(s,id,reason='receipt'){const h=s.hosts[id],p=packet(s,id,{seq:h.nxt,...acknowledgment(h),reason});h.delayed=0;return p;}
 function header(s,id){
  const h=s.hosts[id];
  const pending=s.packets.filter(p=>p.from===id&&p.kind==='ack'&&p.status==='queued');for(const p of pending)p.status='piggybacked';
  const ad=acknowledgment(h),hasAck=pending.length>0||h.delayed>0||ad.ack>h.lastWire.ack;h.delayed=0;h.lastWire={...ad};return {...ad,piggyback:hasAck};
 }
 function send(s,id='A'){
  if(!canSend(s,id))return;const h=s.hosts[id],seq=h.nxt,len=Math.min(h.mss,available(s,id),h.start+h.submitted-h.nxt);
  const p=packet(s,id,{kind:'data',status:'pending',seq,len,...header(s,id)});h.nxt+=len;h.tx.push({seq,len});if(h.deadline===null)h.deadline=s.time+h.rto;s.turn=other(id);
  event(s,'send',id,`Host ${id}'s TCP sends bytes ${seq}–${seq+len-1} (SEQ=${seq}, ACK=${p.ack}, LEN=${len}). SEQ refers to its own outgoing data; ACK refers to the opposite stream. SND.NXT advances to ${h.nxt}, while SND.UNA stays ${h.una}. ${p.piggyback?'This data packet also carries a pending acknowledgment, replacing a separate queued ACK.':'The peer TCP has not received this packet yet.'}`,p,[seq,seq+len],id);return p;
 }
 function processAck(s,p){
  const h=s.hosts[p.to],old=h.una;
  if(p.ack<h.start||p.ack>h.nxt)return 'The ACK is outside the sent sequence range and is ignored.';
  h.una=Math.max(h.una,p.ack);h.right=h.una+h.windowSize;
  if(h.una>old)h.deadline=h.una===h.nxt?null:s.time+h.rto;
  return h.una>old?`SND.UNA at Host ${p.to} advances from ${old} to ${h.una}, confirming bytes through ${h.una-1}. The fixed ${h.windowSize}-byte teaching window slides forward; its right edge is now ${h.right}.`:`No new bytes are acknowledged; Host ${p.to}'s SND.UNA stays ${h.una}, and its window does not move.`;
 }
 function deliver(s,id){
  const p=s.packets.find(p=>p.id===id&&['queued','pending'].includes(p.status));if(!p)return;p.status='received';const h=s.hosts[p.to],from=s.hosts[p.from];
  if(p.kind==='ack'&&p.version>=from.lastWire.version)from.lastWire={ack:p.ack,version:p.version};
  const ackText=processAck(s,p);
  if(p.kind==='ack'){event(s,'ack',p.to,`Host ${p.to}'s TCP receives a pure ACK (SEQ=${p.seq}, ACK=${p.ack}, LEN=0). ACK=${p.ack} names the next byte the peer expected when it created this packet. ${ackText} A pure ACK consumes no sequence numbers and does not mean the receiving application has read the data.`,p,[h.start,p.ack],p.to);return;}
  const before=h.rcv,right=from.start+from.submitted;let accepted=0,duplicates=0,rejected=0;
  for(let n=p.seq;n<p.seq+p.len;n++){if(n<h.rcv||h.buffer.includes(n)){duplicates++;continue;}if(n>=right){rejected++;continue;}h.buffer.push(n);accepted++;}
  const discarded=accepted===0&&duplicates===p.len;if(discarded)p.status='discarded';
  h.buffer.sort((a,b)=>a-b);while(h.buffer.includes(h.rcv))h.rcv++;h.delayed++;
  const immediate=s.c.ackMode!=='manual'&&(s.c.ackMode==='immediate'||p.seq!==before||h.delayed>=2||h.rcv===from.start+from.submitted||rejected>0);if(immediate)queueAck(s,p.to);
  const progress=h.rcv===before?`RCV.NXT stays ${before}${accepted?'; later bytes are buffered beyond the missing byte':''}.`:`RCV.NXT advances from ${before} to ${h.rcv}${h.rcv>p.seq+p.len?', including previously buffered bytes beyond the repaired gap':''}.`;
  event(s,discarded?'duplicate-discard':'receive',p.to,`Host ${p.to}'s TCP receives the same data packet (SEQ=${p.seq}, LEN=${p.len}). ${discarded?'All payload bytes were already received, so TCP discards the duplicate payload without adding it to the receive buffer. ':''}It accepts ${accepted} new bytes${duplicates?`, recognizes ${duplicates} duplicate bytes`:''}${rejected?`, and rejects ${rejected} bytes outside the submitted byte stream`:''}. ${progress} ${immediate?`It queues cumulative ACK=${h.rcv}.`:s.c.ackMode==='manual'?'It waits for you to click Send ACK; no acknowledgment has entered transit.':'It waits for another segment or the delayed-ACK timer.'} ${h.buffer.length} bytes remain in TCP's receive buffer; the application has consumed ${h.consumed}. ${ackText}`,p,[p.seq,p.seq+p.len],p.from);
 }
 function read(s,id='B',count=4){
  integer(count,1,256,'Read size');if(!established(s))return;const h=s.hosts[id],n=Math.min(count,readable(h));if(!n)return;const first=h.read;h.read+=n;h.consumed+=n;h.buffer=h.buffer.filter(x=>x>=h.read);
  event(s,'read',id,`Host ${id}'s application reads bytes ${first}–${h.read-1} from TCP. These ${n} bytes leave the receive buffer; ${h.buffer.length} unread bytes remain buffered. RCV.NXT stays ${h.rcv}, because TCP already received these bytes. Reading does not generate an ACK or move the sender window.`,null,[first,h.read],other(id));
 }
 function flush(s,id='B'){const h=s.hosts[id];if(!h.delayed)return;const p=queueAck(s,id,'delayed ACK');event(s,'ack-queued',id,`Host ${id}'s delayed-ACK timer expires. TCP queues ACK=${p.ack}, confirming receipt through byte ${p.ack-1}. The application has consumed ${h.consumed} bytes; acknowledgment and application reading are separate operations.`,p);}
 function repeatAck(s,id='B'){if(!established(s))return;const p=queueAck(s,id,'manual ACK');event(s,'ack-queued',id,`Host ${id}'s TCP sends its current cumulative acknowledgment (ACK=${p.ack}) into transit. It confirms receipt of all bytes before ${p.ack}; one ACK can cover multiple segments received in order. The sender will update SND.UNA only when this ACK arrives. It consumes no sequence numbers and does not read application data.`,p);return p;}
 function drop(s,id){const p=s.packets.find(p=>p.id===id&&['queued','pending'].includes(p.status));if(!p)return;p.status='lost';event(s,'drop',p.from,p.len?`The segment carrying bytes ${p.seq}–${p.seq+p.len-1} is lost before reaching Host ${p.to}. SND.NXT at Host ${p.from} stays ${s.hosts[p.from].nxt}; these sequence numbers were already assigned. Retransmission must reuse the original numbers.`:`The ACK=${p.ack} packet is lost. Host ${p.to} cannot use this acknowledgment. Received data remains buffered; the peer TCP can repeat the ACK without involving its application.`,p,p.len?[p.seq,p.seq+p.len]:null,p.from);}
 function retransmit(s,id='A'){ 
  if(!established(s))return;const h=s.hosts[id],original=outstanding(s,id)[0];if(!original)return;
  const seq=Math.max(original.seq,h.una),len=original.seq+original.len-seq,p=packet(s,id,{kind:'data',status:'pending',seq,len,retransmission:true,...header(s,id)});
  h.deadline=s.time+h.rto;
  event(s,'retransmit',id,`Host ${id}'s TCP retransmits bytes ${seq}–${seq+len-1} (SEQ=${seq}, LEN=${len}). These are outstanding bytes, so they reuse their original sequence numbers; SND.NXT stays ${h.nxt}. If the earlier data arrived but its ACK was lost, the peer recognizes duplicate bytes and acknowledges them again.`,p,[seq,seq+len],id);return p;
 }
 function advanceTime(s,seconds=1){
  integer(seconds,1,120,'Elapsed seconds');if(!established(s))return;
  for(let n=0;n<seconds;n++){
   s.time++;
   for(const id of ['A','B']){const h=s.hosts[id];if(h.deadline===null||s.time<h.deadline)continue;
    const previous=h.rto;h.rto=Math.min(60,h.rto*2);
    event(s,'timeout',id,`Host ${id}'s retransmission timer expires after ${previous} simulated seconds without an ACK advancing SND.UNA. TCP retransmits the earliest unacknowledged bytes, starting at SEQ=${h.una}. The timeout interval doubles to ${h.rto} seconds; later segments do not each have a separate timer.`);
    retransmit(s,id);
   }
  }
 }
 function step(s){
  if(!established(s))return handshake(s);const ids=s.c.duplex?[s.turn,other(s.turn)]:['A'];
  for(const id of ids){const h=s.hosts[id];if(h.submitted<h.size)return submit(s,id);}
  for(const id of ids)if(canSend(s,id))return send(s,id);
  const pending=s.packets.find(p=>['pending','queued'].includes(p.status));if(pending)return deliver(s,pending.id);
  for(const id of ['A','B'])if(s.hosts[id].delayed){if(s.c.ackMode==='manual')return;return flush(s,id);}
  if(ids.some(id=>s.hosts[id].deadline!==null))return advanceTime(s);
  if(s.c.autoRead)for(const id of ['A','B'])if(readable(s.hosts[id]))return read(s,id,256);
 }
 const api={defaults,create,other,established,enabled,readable,available,canSend,outstanding,handshake,setMode,submit,send,deliver,ack:deliver,read,flush,repeatAck,drop,retransmit,advanceTime,step};
 if(typeof module!=='undefined')module.exports=api;else root.TCPSequence=api;
})(typeof globalThis!=='undefined'?globalThis:this);
