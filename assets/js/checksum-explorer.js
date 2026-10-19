/* global InternetChecksum */
'use strict';
const C=InternetChecksum,$=id=>document.getElementById(id);
let protocol='udp',base=10,receiver=false,cursor=0,timer=null,flight=null,invalid=false;
const senders={udp:C.serialize('udp'),tcp:C.serialize('tcp')};
let transmitted=null,received=null,result=null,events=[];
const hex=(n,width=16)=>'0x'+n.toString(16).toUpperCase().padStart(Math.ceil(width/4),'0');
const inputValue=(n,width)=>base===10?String(n):n.toString(base).toUpperCase().padStart(base===2?width:Math.ceil(width/4),'0');
const currentBytes=()=>receiver?received:senders[protocol];
const bitValues=n=>Array.from({length:16},(_,i)=>(n>>>(15-i))&1);
const motion=matchMedia('(prefers-reduced-motion: reduce)');
function pause(){clearTimeout(timer);timer=null;$('play').disabled=invalid;$('pause').disabled=true;if(flight){flight.cancel();flight=null;}}
function editors(){
  $('field-editors').innerHTML=C.metadata(protocol).filter(f=>f.key!=='checksum'&&!f.fixed).map(f=>`<div class="field"><label for="input-${f.key}">${f.label} <small>${f.bits} bits</small></label><input id="input-${f.key}" data-key="${f.key}" value="${inputValue(C.readField(currentBytes(),f),f.bits)}" spellcheck="false" autocomplete="off" aria-describedby="error"></div>`).join('');
  $('header-constraint').textContent=protocol==='tcp'?'20-byte header: data offset = 5; reserved = 0; no options. Flags: CWR ECE URG ACK PSH RST SYN FIN.':'Length is the UDP length field value. Only the four header words enter this calculation.';
  $('protocol').value=protocol;$('base').value=String(base);
  $('receiver-controls').hidden=!receiver;
  $('sender-mode').setAttribute('aria-pressed',String(!receiver));$('receiver-mode').setAttribute('aria-pressed',String(receiver));
  const selected=$('error-word').value;
  $('error-word').innerHTML=C.words(protocol,currentBytes()).filter(w=>!w.checksum).map(w=>`<option value="${w.index}">${w.label}</option>`).join('');
  if(C.words(protocol,currentBytes()).some(w=>!w.checksum&&String(w.index)===selected))$('error-word').value=selected;
  if(!$('error-bit').options.length)$('error-bit').innerHTML=Array.from({length:16},(_,bit)=>`<option value="${bit}">Bit ${bit}${bit===0?' · least significant':bit===15?' · most significant':''}</option>`).join('');
}
function rebuild(){
  pause();invalid=false;cursor=0;$('error').textContent='';$('receiver-mode').disabled=false;
  result=receiver?C.verify(protocol,received):C.analyze(protocol,senders[protocol]);events=C.timeline(result,receiver);render();
}
function invalidInput(error){
  pause();invalid=true;$('error').textContent=error.message;
  $('header-status').textContent='Last valid header · correct input';
  $('workbench').innerHTML='<p class="input-error">Correct the highlighted input to resume the calculation.</p>';
  $('explanation').textContent='The calculation is paused until every field contains a valid value.';
  for(const id of ['sum','checksum','verdict'])$(id).textContent='—';
  for(const id of ['play','pause','previous','next','show-all','receiver-mode'])$(id).disabled=true;
}
function commitEditors(){
  try{
    let bytes=currentBytes().slice();
    for(const f of C.metadata(protocol).filter(f=>!f.fixed&&f.key!=='checksum')){
      const el=$('input-'+f.key);el.removeAttribute('aria-invalid');
      try{bytes=C.edit(protocol,bytes,f.key,C.parseNumber(el.value,f.bits,base,f.label));}
      catch(error){el.setAttribute('aria-invalid','true');throw error;}
    }
    if(receiver)received=bytes;else senders[protocol]=bytes;rebuild();return true;
  }catch(error){invalidInput(error);return false;}
}
function renderHeader(event,done){
  const bytes=!receiver&&done?C.complete(protocol,senders[protocol]).bytes:currentBytes();
  const active=event.index===undefined?null:result.words[event.index];
  $('visual-title').textContent=protocol.toUpperCase()+' header';
  $('header-status').textContent=receiver?'Received header · original checksum':done?'Demonstration checksum inserted':'Checksum field = 0x0000';
  $('packet-header').innerHTML=C.metadata(protocol).map(f=>{
    const value=C.readField(bytes,f),end=f.offset+Math.ceil(f.bits/8);
    const selected=active&&f.offset<active.offset+2&&end>active.offset;
    const changed=receiver&&C.readField(transmitted,f)!==value;
    const half=selected&&f.bits===32?(active.offset===f.offset?'upper':'lower'):'';
    return `<div id="header-${f.key}" class="header-field ${f.bits<16?'narrow ':''}${selected?'active ':''}${half?'active-'+half+' ':''}${changed?'corrupted ':''}${f.key==='checksum'?'checksum-field ':''}${done&&!receiver&&f.key==='checksum'?'inserted':''}" style="grid-column:span ${f.bits}" tabindex="0" data-tooltip="${f.label}: ${hex(value,f.bits)}, ${f.bits} bits${changed?'; modified at receiver':''}"><span>${f.label}</span><strong>${hex(value,f.bits)}</strong>${half?`<small>${half} 16 bits active</small>`:''}</div>`;
  }).join('');
}
// Every row uses the same 20-column grid: label, operator, overflow, 16 bits, hex.
function workRow(label,values,options={}){
  const {kind='',operator='',overflow='',value='',active=-1,changed=0,flipped=0,editable=false,wordIndex=0}=options;
  return `<div class="work-row ${kind}"><span class="row-label">${label}</span><span class="operator">${operator}</span><span class="overflow-cell ${overflow===1?'overflow-one':''}">${overflow}</span>${values.map((v,i)=>{
    const bit=15-i,classes=`bit-cell ${i%4===0?'nibble ':''}${bit===active?'active-column ':''}${(changed>>>bit)&1?'corrupted-bit ':''}${i<flipped?'flipped ':''}${i===flipped-1?'just-flipped':''}`;
    return editable?`<button class="${classes}" data-word="${wordIndex}" data-bit="${bit}" data-tooltip="Flip ${label}, bit ${bit}. The original transmitted checksum stays fixed." aria-label="${label}, bit ${bit}: ${v}. Flip this bit.">${v}</button>`:`<span class="${classes}">${v}</span>`;
  }).join('')}<code class="hex-value">${value}</code></div>`;
}
function labels(){return workRow('Binary columns',Array.from({length:16},(_,i)=>15-i),{kind:'column-labels',overflow:'16',value:'Hex'});}
function additionRows(addition,processed,options){
  const {source,next,wrapped=false,word=null,done=false,waiting=false,inTransit=false}=options;
  const carryValues=Array.from({length:16},(_,i)=>{const bit=15-i;return bit<=processed+1?addition.columns[bit].carryIn:'';});
  const resultBits=bitValues(addition.low).map((v,i)=>15-i<=processed?v:'·');
  const changed=receiver&&word&&!wrapped?(word.value^C.words(protocol,transmitted)[word.index].value):0;
  return labels()+workRow('Carry into column',waiting||inTransit?Array(16).fill(''):carryValues,{kind:'carry-row',overflow:processed===15?addition.carry:'',active:processed>=0&&processed<15?processed+1:-1})+
    workRow(source,bitValues(addition.a),{kind:'source-row',value:hex(addition.a),active:processed})+
    workRow(waiting?'Waiting for header word':next,waiting?Array(16).fill(''):bitValues(addition.b),{kind:`next-row${waiting?' operand-empty':''}${inTransit?' operand-in-transit':''}`,operator:waiting?'':'+',value:waiting?'':hex(addition.b),active:processed,changed:waiting?0:changed,editable:receiver&&!waiting&&!inTransit&&!wrapped&&word&&!word.checksum,wordIndex:word?word.index:0})+
    workRow(done?'Updated running sum':wrapped?'End-around result':'Binary result',resultBits,{kind:'result-row',overflow:processed===15?addition.carry:'',value:processed===15?hex(addition.raw,addition.carry?17:16):'…',active:processed});
}
function renderWorkbench(event){
  const step=event.index===undefined?null:result.steps[event.index],word=step?result.words[event.index]:null;
  let explanation='',running=result.sum,html='';
  if(step){
    const wrap=['wrap','wrapAdd'].includes(event.kind)||(event.kind==='fold'&&step.wrap);
    const operation=wrap?step.wrap:step;
    const processed=['select','transfer','loaded','wrap'].includes(event.kind)?-1:['add','wrapAdd'].includes(event.kind)?event.bit:15;
    const label=word.checksum?(receiver?'Transmitted Checksum':'Checksum Placeholder'):word.label;
    if(wrap)html=`<div class="wrap-summary"><span>Previous raw sum: <strong>${hex(step.raw,17)}</strong></span><span>Overflow 1 + lower 16 bits ${hex(step.low)}</span></div><div class="carry-track ${event.kind==='wrap'?'wrapping':''}" aria-label="End-around carry: overflow 1 travels to bit 0"><span class="carry-traveler">1</span><span class="carry-direction">End-around carry → bit 0</span></div>`;
    html+=additionRows(operation,processed,{source:wrap?'Lower 16 bits':'Running sum',next:wrap?'End-around carry = 1':label,wrapped:wrap,word,done:event.kind==='fold',waiting:event.kind==='select',inTransit:event.kind==='transfer'});
    if(['promote','fold'].includes(event.kind)){
      html=labels()+workRow('Carry into column',Array(16).fill(''),{kind:'carry-row'})+
        workRow('Running sum',bitValues(event.kind==='fold'?step.sum:step.before),{kind:'source-row',value:hex(event.kind==='fold'?step.sum:step.before)})+
        workRow('Waiting for header word',Array(16).fill(''),{kind:'next-row operand-empty'})+
        workRow(step.carry?'Folded binary result':'Binary result',bitValues(step.sum),{kind:'result-row',value:hex(step.sum)});
    }
    running=event.kind==='fold'?step.sum:step.before;
    if(event.kind==='select')explanation=`The operand row is empty. Next, bring ${label} down from the highlighted header field. The running sum stays ${hex(step.before)}.`;
    else if(event.kind==='transfer')explanation=`Moving ${label} (${hex(word.value)}) from the header into the operand row. Addition waits until it arrives.`;
    else if(event.kind==='loaded')explanation=`${label} has arrived: ${hex(word.value)}. Now add it to ${hex(step.before)}, starting at bit 0 on the right.`;
    else if(event.kind==='add'||event.kind==='wrapAdd'){
      const col=operation.columns[event.bit];explanation=`${wrap?'End-around addition. ':''}Bit ${col.bit}: ${col.a} + ${col.b} + carry ${col.carryIn} = ${col.total}. Write ${col.result}${col.carryOut?`, carry 1 ${col.bit===15?'beyond bit 15':'to bit '+(col.bit+1)}`:', carry 0'}.`;
    }else if(event.kind==='raw')explanation=step.carry?`The 17-bit result is ${hex(step.raw,17)}. Its overflow 1 must wrap around; do not discard it.`:`The addition is ${hex(step.low)}. No overflow left bit 15, so no end-around carry is needed.`;
    else if(event.kind==='wrap')explanation=`Ordinary carries moved left between columns. Now wrap the overflow 1 from the far left to bit 0: ${hex(step.low)} + 0x0001.`;
    else if(event.kind==='promote')explanation=`Move the ${step.carry?'folded ':''}binary result ${hex(step.sum)} up into the running sum. The next header word waits until it arrives.`;
    else explanation=`The folded running sum is now ${hex(step.sum)}.${event.index===result.words.length-1?' All header words have been added.':' Continue to the next header word.'}`;
  }else{
    const flipped=event.kind==='invert'?event.flipped:event.kind==='sum'?0:16;
    const partial=result.sum^(flipped?((65535<<(16-flipped))&65535):0);
    html=labels()+workRow('Final folded sum',bitValues(result.sum),{kind:'source-row',value:hex(result.sum)})+
      workRow('Invert each bit',Array.from({length:16},(_,i)=>i<flipped?'↓':'·'),{kind:'flip-row',value:`${flipped} / 16`})+
      workRow(receiver?'Verification remainder':'One’s complement',bitValues(partial),{kind:'checksum-row result-row',value:hex(partial),flipped});
    explanation=event.kind==='sum'?'All header words have been added. Invert each bit of the folded sum to produce the demonstration checksum.':event.kind==='invert'?`Flip bit ${16-flipped}: 0 becomes 1, and 1 becomes 0. ${flipped} of 16 bits inverted.`:receiver?`Folded sum ${hex(result.sum)} → complement ${hex(result.checksum)}. ${result.valid?'CHECKSUM VALID for this header-only exercise.':'CHECKSUM INVALID: the header and original checksum do not sum to all ones.'}`:`Demonstration checksum = ${hex(result.checksum)}. Insert it into the ${protocol.toUpperCase()} header’s Checksum field.`;
    if(event.kind==='insert')html+=`<div id="checksum-transfer" class="checksum-transfer">${hex(result.checksum)} ↑ header Checksum field <small>Header-only demonstration value</small></div>`;
    if(event.kind==='verify')html+=`<div class="verification ${result.valid?'valid':'invalid'}">CHECKSUM ${result.valid?'VALID':'INVALID'} <small>Folded sum ${hex(result.sum)} · remainder ${hex(result.checksum)}</small></div>`;
  }
  $('workbench').innerHTML=html;$('explanation').textContent=explanation;$('sum').textContent=hex(running);
}
function render(animate=true){
  if(invalid)return;
  const event=events[cursor],done=cursor===events.length-1,active=event.index;
  renderHeader(event,done);renderWorkbench(event);
  $('word-position').textContent=active===undefined?'Final complement':`Word ${active+1} of ${result.words.length}`;
  $('active-word').textContent=active===undefined?(receiver?'Verify the received header':'Invert, then insert'):result.words[active].label;
  $('word-dots').innerHTML=result.words.map((w,i)=>`<button data-index="${i}" class="${i===active?'current':active===undefined||i<active?'done':''}" aria-label="Jump to word ${i+1}: ${w.label}" ${i===active?'aria-current="step"':''}>${i+1}</button>`).join('')+`<button data-index="final" class="${active===undefined?'current':''}" aria-label="Jump to final bit inversion">NOT</button>`;
  $('progress').max=events.length-1;$('progress').value=cursor;$('step-counter').textContent=`Step ${cursor+1} / ${events.length}`;
  $('previous').disabled=cursor===0;$('next').disabled=done;$('show-all').disabled=done;$('play').disabled=timer!==null;$('pause').disabled=timer===null;
  $('checksum-label').textContent=receiver?'Original transmitted checksum':'Demonstration checksum';
  const checksumField=C.metadata(protocol).find(f=>f.key==='checksum');
  $('checksum').textContent=receiver?hex(C.readField(transmitted,checksumField)):done?hex(result.checksum):'Pending';
  $('verdict').textContent=receiver?(done?(result.valid?'CHECKSUM VALID':'CHECKSUM INVALID'):'Not yet verified'):'Sender mode';
  if(receiver){
    let changed=0;received.forEach((b,i)=>{let x=b^transmitted[i];while(x){changed+=x&1;x>>>=1;}});
    $('corruption-note').textContent=`${changed} bit${changed===1?'':'s'} changed. The original checksum stays fixed. Orange cells mark modified bits. You can also click a bit in the next operand.`;
  }
  if(event.kind==='insert')insertAnimation();
  if(event.kind==='transfer'&&(animate||motion.matches))transferAnimation(event);
  if(event.kind==='promote'&&(animate||motion.matches))promoteAnimation(event);
}
function promoteAnimation(event){
  const arrive=()=>renderWorkbench({...event,kind:'fold'});
  if(motion.matches){arrive();return;}
  const from=$('workbench').querySelector?.('.result-row'),to=$('workbench').querySelector?.('.source-row');
  if(!from||!to||!from.animate||!from.getBoundingClientRect){arrive();return;}
  if(flight)flight.cancel();
  const a=from.getBoundingClientRect(),b=to.getBoundingClientRect(),value=result.steps[event.index].sum;
  const token=document.createElement('div');token.className='sum-flight';token.setAttribute('aria-hidden','true');
  token.innerHTML=workRow('Running sum',bitValues(value),{kind:'source-row',value:hex(value)});
  token.style.left=a.left+'px';token.style.top=a.top+'px';token.style.width=a.width+'px';document.body.appendChild(token);
  const capturedResult=result,capturedCursor=cursor;
  flight=token.animate([{transform:'translate(0,0)',opacity:.9},{transform:`translate(${b.left-a.left}px,${b.top-a.top}px)`,opacity:1}],{duration:transferDuration(),easing:'ease-in-out',fill:'forwards'});
  const animation=flight;
  animation.finished.then(()=>{if(flight===animation&&result===capturedResult&&cursor===capturedCursor&&!invalid)arrive();}).catch(()=>{}).finally(()=>{token.remove();if(flight===animation)flight=null;});
}
function transferDuration(){return Math.max(450,Math.min(1200,Number($('speed').value)*4));}
function transferAnimation(event){
  const arrive=()=>renderWorkbench({...event,kind:'loaded'});
  if(motion.matches){arrive();return;}
  const word=result.words[event.index],target=$('workbench').querySelector?.('.next-row');
  if(!target||!target.animate||!target.getBoundingClientRect){arrive();return;}
  // A 32-bit field contributes only its selected half. The packed TCP word spans three fields.
  const origins=C.metadata(protocol).filter(f=>f.offset<word.offset+2&&f.offset+Math.ceil(f.bits/8)>word.offset).map(f=>{
    const box=$('header-'+f.key).getBoundingClientRect();
    return {left:box.left+(f.bits===32&&word.offset>f.offset?box.width/2:0),top:box.top,width:f.bits===32?box.width/2:box.width,height:box.height};
  });
  const left=Math.min(...origins.map(b=>b.left)),right=Math.max(...origins.map(b=>b.left+b.width));
  const top=Math.min(...origins.map(b=>b.top)),bottom=Math.max(...origins.map(b=>b.top+b.height));
  const destination=target.getBoundingClientRect(),startX=(left+right)/2,startY=(top+bottom)/2;
  if(flight)flight.cancel();
  const token=document.createElement('div');token.className='operand-flight';token.setAttribute('aria-hidden','true');
  token.innerHTML=`<span>${word.label}</span><strong>${hex(word.value)}</strong><code>${word.value.toString(2).padStart(16,'0').match(/.{4}/g).join(' ')}</code>`;
  const width=Math.min(390,destination.width);token.style.width=width+'px';token.style.left=(startX-width/2)+'px';token.style.top=(startY-28)+'px';document.body.appendChild(token);
  const capturedResult=result,capturedCursor=cursor;
  flight=token.animate([{transform:'translate(0,0) scale(.7)',opacity:.7},{transform:`translate(${destination.left+destination.width/2-startX}px,${destination.top+destination.height/2-startY}px) scale(1)`,opacity:1}],{duration:transferDuration(),easing:'ease-in-out',fill:'forwards'});
  const animation=flight;
  animation.finished.then(()=>{if(flight===animation&&result===capturedResult&&cursor===capturedCursor&&!invalid)arrive();}).catch(()=>{}).finally(()=>{token.remove();if(flight===animation)flight=null;});
}
function insertAnimation(){
  if(motion.matches)return;const from=$('checksum-transfer'),to=$('header-checksum');
  if(!from||!to||!from.animate||!from.getBoundingClientRect)return;
  if(flight)flight.cancel();const a=from.getBoundingClientRect(),b=to.getBoundingClientRect();
  const token=document.createElement('div');token.className='checksum-flight';token.textContent=hex(result.checksum);token.setAttribute('aria-hidden','true');token.style.left=a.left+'px';token.style.top=a.top+'px';token.style.width=a.width+'px';document.body.appendChild(token);
  flight=token.animate([{transform:'translate(0,0)',opacity:1},{transform:`translate(${b.left+b.width/2-a.left-a.width/2}px,${b.top+b.height/2-a.top-a.height/2}px) scale(.5)`,opacity:0}],{duration:700,easing:'ease-in-out'});
  const animation=flight;animation.finished.catch(()=>{}).finally(()=>{token.remove();if(flight===animation)flight=null;});
}
function go(index){pause();if(invalid)return;cursor=Math.max(0,Math.min(events.length-1,index));render();}
function delay(){const event=events[cursor];if(['transfer','promote'].includes(event.kind))return transferDuration()+120;return Number($('speed').value)*(['select','loaded','raw','wrap','fold','sum','insert','verify'].includes(event.kind)?4:1);}
function play(){
  if(invalid||timer!==null)return;if(flight){flight.cancel();flight=null;}if(cursor===events.length-1)cursor=0;
  const tick=()=>{cursor++;if(cursor===events.length-1){timer=null;render();return;}timer=setTimeout(tick,delay());render();};
  timer=setTimeout(tick,delay());render();
}
function changeMode(value){
  if(value===receiver)return;
  if(value){if(!commitEditors())return;transmitted=C.complete(protocol,senders[protocol]).bytes;received=transmitted.slice();}
  receiver=value;editors();rebuild();
}
function introduceError(word,bit){
  if(!receiver||invalid)return;
  const selected=result.words[word];if(!selected||selected.checksum)return;
  received=C.flipBit(protocol,received,word,bit);editors();rebuild();
  cursor=events.findIndex(e=>e.kind==='select'&&e.index===word);render();
}
function preset(name){
  receiver=false;let values={...C.defaults};
  if(name==='carry'){values.sourcePort=65535;values.destinationPort=1;}
  if(name==='chain'){values.sourcePort=0x0fff;values.destinationPort=1;}
  senders[protocol]=C.serialize(protocol,values);editors();rebuild();
}
$('field-editors').addEventListener('input',commitEditors);
$('sender-mode').addEventListener('click',()=>changeMode(false));$('receiver-mode').addEventListener('click',()=>changeMode(true));
$('protocol').addEventListener('change',()=>{protocol=$('protocol').value;if(receiver){transmitted=C.complete(protocol,senders[protocol]).bytes;received=transmitted.slice();}editors();rebuild();});
$('base').addEventListener('change',()=>{const nextBase=Number($('base').value);if(!commitEditors()){$('base').value=String(base);return;}base=nextBase;editors();rebuild();});
$('previous').addEventListener('click',()=>go(cursor-1));$('next').addEventListener('click',()=>go(cursor+1));$('show-all').addEventListener('click',()=>go(events.length-1));
$('play').addEventListener('click',play);$('pause').addEventListener('click',()=>{pause();render(false);});
$('speed').addEventListener('change',()=>{if(timer!==null){pause();play();}});
$('word-dots').addEventListener('click',event=>{const index=event.target.dataset.index;if(index!==undefined)go(events.findIndex(e=>index==='final'?e.kind==='sum':e.kind==='select'&&e.index===Number(index)));});
$('flip').addEventListener('click',()=>introduceError(Number($('error-word').value),Number($('error-bit').value)));
$('workbench').addEventListener('click',event=>{const {word,bit}=event.target.dataset;if(word!==undefined&&bit!==undefined)introduceError(Number(word),Number(bit));});
$('restore').addEventListener('click',()=>{if(receiver){received=transmitted.slice();editors();rebuild();}});
document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>preset(button.dataset.preset)));
$('reset').addEventListener('click',()=>{protocol='udp';base=10;senders.tcp=C.serialize('tcp');preset('default');});
document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();if(!invalid)render(false);}});motion.addEventListener('change',()=>{pause();if(!invalid)render(false);});
editors();rebuild();
