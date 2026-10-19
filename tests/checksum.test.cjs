const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../assets/js/checksum-calculation.js');
const reference=values=>{let sum=values.reduce((a,b)=>a+BigInt(b),0n);while(sum>65535n)sum=(sum&65535n)+(sum>>16n);return {sum:Number(sum),checksum:Number(65535n^sum)};};

test('UDP serialization is exactly four big-endian header words; example is FC6C -> 0393',()=>{
 const bytes=C.serialize('udp');assert.deepEqual([...bytes],[252,0,0,80,0,28,0,0]);
 const result=C.analyze('udp',bytes);assert.equal(result.sum,0xfc6c);assert.equal(result.checksum,0x0393);assert.equal(result.words.length,4);
 assert.deepEqual([...C.complete('udp',bytes).bytes],[252,0,0,80,0,28,3,147]);
});
test('TCP serializes all fields, correct widths and high/low words, with no options',()=>{
 const bytes=C.serialize('tcp',{sourcePort:0x1234,destinationPort:0x5678,sequence:0x12345678,acknowledgment:0x89abcdef,flags:0x18,window:0x4000,urgent:0x0102});
 assert.deepEqual([...bytes],[18,52,86,120,18,52,86,120,137,171,205,239,80,24,64,0,0,0,1,2]);
 const words=C.words('tcp',bytes);assert.deepEqual(words.map(w=>w.value),[0x1234,0x5678,0x1234,0x5678,0x89ab,0xcdef,0x5018,0x4000,0,0x0102]);
 assert.match(words[2].label,/upper/);assert.match(words[3].label,/lower/);assert.match(words[4].label,/upper/);assert.equal(C.fields.tcp.reduce((a,f)=>a+f.bits,0),160);
 for(const [key,value] of Object.entries({sequence:0x12345678,acknowledgment:0x89abcdef,dataOffset:5,reserved:0,flags:0x18}))assert.equal(C.readField(bytes,C.fields.tcp.find(f=>f.key===key)),value);
});
test('ordinary carries propagate between columns; end-around carry is a separate addition',()=>{
 const a=C.binaryAddition(0xffff,1);assert.equal(a.raw,0x10000);assert.equal(a.low,0);assert.equal(a.carry,1);
 assert.deepEqual(a.columns.map(c=>c.carryIn),[0,...Array(15).fill(1)]);assert.ok(a.columns.every(c=>c.carryOut===1&&c.result===0));
 const result=C.calculate([0xffff,1]);assert.equal(result.sum,1);assert.equal(result.checksum,0xfffe);assert.equal(result.steps[1].wrap.a,0);assert.equal(result.steps[1].wrap.b,1);assert.equal(result.steps[1].wrap.low,1);
 const chain=C.binaryAddition(0x0fff,1);assert.equal(chain.low,0x1000);assert.equal(chain.carry,0);assert.equal(chain.columns[12].carryIn,1);assert.equal(chain.columns[12].carryOut,0);
});
test('calculation matches independent deferred-carry reference over many input patterns',()=>{
 let seed=0x12345678;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed&65535;};
 for(let i=0;i<500;i++){const words=Array.from({length:i%10+1},next),expected=reference(words),actual=C.calculate(words);assert.equal(actual.sum,expected.sum);assert.equal(actual.checksum,expected.checksum);for(const step of actual.steps)for(const col of step.columns){assert.equal(col.result,(col.a+col.b+col.carryIn)%2);assert.equal(col.carryOut,Math.floor((col.a+col.b+col.carryIn)/2));}}
 for(const words of [[0,0],[65535,65535],[65535,1,65535],[1,0xf203,0xf4f5,0xf6f7]])assert.equal(C.calculate(words).checksum,reference(words).checksum);
});
for(const protocol of ['udp','tcp'])test(`${protocol}: receiver uses original checksum; every single data-bit error is detected`,()=>{
 const original=C.complete(protocol,C.serialize(protocol)).bytes,verified=C.verify(protocol,original);
 assert.equal(verified.sum,65535);assert.equal(verified.checksum,0);assert.equal(verified.valid,true);
 for(const word of C.words(protocol,original).filter(w=>!w.checksum))for(let bit=0;bit<16;bit++){
  const changed=C.flipBit(protocol,original,word.index,bit),result=C.verify(protocol,changed);
  assert.equal(result.valid,false);assert.notEqual(result.checksum,0);assert.deepEqual(C.flipBit(protocol,changed,word.index,bit),original);
  const checksum=C.fields[protocol].find(f=>f.key==='checksum');assert.equal(C.readField(changed,checksum),C.readField(original,checksum));
 }
});
test('validity is arithmetic, not a corruption flag; compensating changes can pass',()=>{
 const sent=C.complete('udp',C.serialize('udp')).bytes;
 const changed=C.edit('udp',C.edit('udp',sent,'sourcePort',0xfc01),'destinationPort',0x004f);
 assert.equal(C.verify('udp',changed).valid,true);
});
test('zero complement remains zero in this header-only exercise, including UDP',()=>{
 const zero=C.serialize('udp',{sourcePort:65535,destinationPort:0,length:0});
 const completed=C.complete('udp',zero);assert.equal(completed.checksum,0);assert.equal(completed.bytes[6],0);assert.equal(completed.bytes[7],0);assert.equal(C.verify('udp',completed.bytes).valid,true);
 assert.equal(C.calculate([0,0]).checksum,65535);
});
test('strict field parsing, bit limits, and immutable edits',()=>{
 assert.equal(C.parseNumber('0xFFFFFFFF',32),0xffffffff);assert.equal(C.parseNumber('1010',4,2),10);
 assert.equal(C.parseNumber('65535',16,10),65535);assert.equal(C.parseNumber('4294967295',32,10),0xffffffff);assert.equal(C.parseNumber('0',16,10),0);
 for(const value of ['65536','-1','1.5','1e3','0x50','0b10','12abc'])assert.throws(()=>C.parseNumber(value,16,10));
 for(const value of ['', '-1','FFFFZ','10000','1.5'])assert.throws(()=>C.parseNumber(value,16));
 assert.throws(()=>C.parseNumber('102',16,2));assert.throws(()=>C.serialize('tcp',{flags:256}));assert.throws(()=>C.serialize('udp',{sourcePort:65536}));assert.throws(()=>C.words('tcp',new Uint8Array(8)));
 const source=C.serialize('tcp'),edited=C.edit('tcp',source,'sequence',0xffffffff);assert.equal(source[4],0x12);assert.equal(edited[4],255);
 assert.throws(()=>C.flipBit('udp',C.serialize('udp'),4,0));assert.throws(()=>C.flipBit('udp',C.serialize('udp'),0,16));
});
test('timeline includes every column, explicit wrap addition, 16 flips and mode-specific finish',()=>{
 const result=C.analyze('udp',C.serialize('udp',{sourcePort:65535,destinationPort:1})),timeline=C.timeline(result);
 for(let index=0;index<result.words.length;index++){const start=timeline.findIndex(e=>e.kind==='select'&&e.index===index);assert.deepEqual(timeline.slice(start,start+4).map(e=>e.kind),['select','transfer','loaded','add']);}
 assert.deepEqual(timeline.filter(e=>e.kind==='add'&&e.index===1).map(e=>e.bit),Array.from({length:16},(_,i)=>i));
 assert.equal(timeline.filter(e=>e.kind==='wrap'&&e.index===1).length,1);assert.equal(timeline.filter(e=>e.kind==='wrapAdd'&&e.index===1).length,16);
 for(let index=0;index<result.words.length;index++){const promote=timeline.findIndex(e=>e.kind==='promote'&&e.index===index);assert.equal(timeline[promote+1].kind,'fold');assert.ok(promote>timeline.findIndex(e=>e.kind==='raw'&&e.index===index));}
 assert.deepEqual(timeline.filter(e=>e.kind==='invert').map(e=>e.flipped),Array.from({length:16},(_,i)=>i+1));assert.equal(timeline.at(-1).kind,'insert');assert.equal(C.timeline(result,true).at(-1).kind,'verify');
 assert.deepEqual(C.timeline(result),timeline);
});

// A DOM fixture checks control lifecycle and rendered values. Browser layout is checked separately when available.
function fixture({animate=false,reduced=false}={}){
 const elements=new Map(),pending=new Map(),delays=new Map(),animations=[];let timer=0,nodeId=0;
 function el(id){
  if(!elements.has(id)){
   const e={id,value:'',textContent:'',disabled:false,hidden:false,options:[],dataset:{},listeners:{},attrs:{},style:{},addEventListener(k,f){this.listeners[k]=f;},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},remove(){this.removed=true;}};
   if(animate){e.getBoundingClientRect=()=>({left:id.endsWith('-row')?100:0,top:id==='result-row'?480:id==='source-row'?320:id==='operand-row'?400:40,width:id.endsWith('-row')?600:320,height:40});e.animate=(keyframes,options)=>{let resolve,reject;const finished=new Promise((a,b)=>{resolve=a;reject=b;});const animation={finished,keyframes,options,node:e,finish:resolve,cancel(){this.cancelled=true;reject(new Error('cancelled'));}};animations.push(animation);return animation;};}
   let html='';Object.defineProperty(e,'innerHTML',{get:()=>html,set(value){html=value;
    for(const [,inputId,key,inputValue] of value.matchAll(/<input id="([^"]+)" data-key="([^"]+)" value="([^"]*)"/g)){el(inputId).value=inputValue;el(inputId).dataset.key=key;}
    if(id==='error-word'||id==='error-bit'){e.options=[...value.matchAll(/<option value="([^"]+)"/g)].map(m=>({value:m[1]}));e.value=e.options[0]?.value||'';}
   }});elements.set(id,e);
  }return elements.get(id);
 }
 el('speed').value='180';el('base').value='10';el('protocol').value='udp';
 if(animate)el('workbench').querySelector=selector=>selector==='.next-row'?el('operand-row'):selector==='.result-row'?el('result-row'):selector==='.source-row'?el('source-row'):null;
 const presets=['default','carry','chain'].map(key=>{const e=el('preset-'+key);e.dataset.preset=key;return e;});
 const context={InternetChecksum:C,setTimeout:(fn,ms)=>{pending.set(++timer,fn);delays.set(timer,ms);return timer;},clearTimeout:id=>pending.delete(id),matchMedia:()=>({matches:reduced,addEventListener(){}}),document:{getElementById:el,querySelectorAll:()=>presets,addEventListener(){},createElement:()=>el('created-'+(++nodeId)),body:{appendChild(){}}}};
 vm.runInNewContext(fs.readFileSync('assets/js/checksum-explorer.js','utf8'),context);
 return {el,pending,delays,animations,context,click:(id,data={})=>el(id).listeners.click({target:{dataset:data}}),change:(id,value)=>{el(id).value=value;el(id).listeners.change();},edit:(key,value)=>{el('input-'+key).value=value;el('field-editors').listeners.input();},tick:()=>{const [id,fn]=pending.entries().next().value;pending.delete(id);fn();}};
}
test('UI: binary workbench, correct header widths, final insertion and reversible stepping',()=>{
 const f=fixture();assert.match(f.el('workbench').innerHTML,/Carry into column/);assert.match(f.el('workbench').innerHTML,/Waiting for header word/);assert.equal(f.el('checksum').textContent,'Pending');assert.doesNotMatch(f.el('workbench').innerHTML,/<table/);
 f.click('next');f.click('next');f.click('next');assert.match(f.el('explanation').textContent,/Bit 0:/);const html=f.el('workbench').innerHTML;f.click('next');f.click('previous');assert.equal(f.el('workbench').innerHTML,html);
 f.click('show-all');assert.equal(f.el('checksum').textContent,'0x0393');assert.match(f.el('packet-header').innerHTML,/0x0393/);assert.match(f.el('header-status').textContent,/inserted/);
 f.change('protocol','tcp');const header=f.el('packet-header').innerHTML;assert.match(header,/grid-column:span 32/);assert.equal((header.match(/grid-column:span 4/g)||[]).length,2);assert.match(header,/grid-column:span 8/);assert.match(header,/Sequence Number/);
});
test('UI: selected bit errors recompute verification with original checksum and restore works',()=>{
 const f=fixture();f.click('receiver-mode');f.click('show-all');assert.equal(f.el('verdict').textContent,'CHECKSUM VALID');assert.equal(f.el('sum').textContent,'0xFFFF');assert.match(f.el('workbench').innerHTML,/0x0000/);
 const checksum=f.el('checksum').textContent;f.el('error-word').value='1';f.el('error-bit').value='7';f.click('flip');f.click('next');f.click('next');assert.match(f.el('workbench').innerHTML,/corrupted-bit/);f.click('show-all');assert.equal(f.el('verdict').textContent,'CHECKSUM INVALID');assert.equal(f.el('checksum').textContent,checksum);
 f.click('restore');f.click('show-all');assert.equal(f.el('verdict').textContent,'CHECKSUM VALID');f.click('sender-mode');assert.equal(f.el('input-destinationPort').value,'80');
});
test('UI: receiver edits can cancel, bit-cell buttons flip exact bits, and checksum is not editable',()=>{
 const f=fixture();f.click('receiver-mode');f.edit('sourcePort','64513');f.edit('destinationPort','79');f.click('show-all');assert.equal(f.el('verdict').textContent,'CHECKSUM VALID');
 assert.doesNotMatch(f.el('field-editors').innerHTML,/input-checksum/);assert.doesNotMatch(f.el('error-word').innerHTML,/>Checksum</);
 f.click('workbench',{word:'0',bit:'0'});assert.equal(f.el('input-sourcePort').value,'64512');f.click('show-all');assert.equal(f.el('verdict').textContent,'CHECKSUM INVALID');
});
test('UI: animation pause, resume, speed, edits, reset and final completion are deterministic',()=>{
 const f=fixture();f.click('preset-carry');f.click('play');assert.equal(f.pending.size,1);f.tick();f.tick();f.tick();assert.match(f.el('explanation').textContent,/Bit 0:/);f.click('pause');assert.equal(f.pending.size,0);
 f.click('play');f.click('play');assert.equal(f.pending.size,1);f.change('speed','60');assert.equal(f.pending.size,1);f.edit('sourcePort','65535');assert.equal(f.pending.size,0);
 f.click('play');let sawWrap=false;for(let i=0;i<500&&f.pending.size;i++){f.tick();if(f.el('explanation').textContent.includes('Now wrap'))sawWrap=true;}assert.ok(sawWrap);assert.equal(f.pending.size,0);assert.equal(f.el('next').disabled,true);assert.equal(f.el('pause').disabled,true);
 f.click('reset');assert.equal(f.el('base').value,'10');assert.equal(f.el('input-sourcePort').value,'64512');assert.match(f.el('step-counter').textContent,/Step 1 /);
});
test('UI: validation clears stale results, base conversion and protocol state preserve header values',()=>{
 const f=fixture();f.change('base','16');f.edit('sourcePort','10000');assert.equal(f.el('play').disabled,true);assert.equal(f.el('checksum').textContent,'—');assert.match(f.el('error').textContent,/16-bit/);
 f.edit('sourcePort','1234');assert.equal(f.el('play').disabled,false);f.change('base','2');assert.equal(f.el('input-sourcePort').value,'0001001000110100');
 f.change('protocol','tcp');assert.equal(f.el('input-sequence').value,'00010010001101000101011001111000');f.change('protocol','udp');assert.equal(f.el('input-sourcePort').value,'0001001000110100');
 f.click('receiver-mode');f.change('base','16');f.click('show-all');assert.equal(f.el('verdict').textContent,'CHECKSUM VALID');
});
test('UI: decimal edits and round trips preserve 16/32-bit values and receiver checksum',()=>{
 const f=fixture();assert.equal(f.el('base').value,'10');assert.equal(f.el('input-sourcePort').value,'64512');assert.equal(f.el('input-destinationPort').value,'80');assert.equal(f.el('input-length').value,'28');
 f.edit('destinationPort','443');f.change('base','16');assert.equal(f.el('input-destinationPort').value,'01BB');f.change('base','10');assert.equal(f.el('input-destinationPort').value,'443');
 f.change('protocol','tcp');f.edit('sequence','4294967295');f.change('base','2');assert.equal(f.el('input-sequence').value,'1'.repeat(32));f.change('base','10');assert.equal(f.el('input-sequence').value,'4294967295');
 f.click('receiver-mode');const original=f.el('checksum').textContent;f.change('base','16');f.change('base','10');f.click('show-all');assert.equal(f.el('checksum').textContent,original);assert.equal(f.el('verdict').textContent,'CHECKSUM VALID');
 f.edit('window','65536');assert.equal(f.el('play').disabled,true);f.edit('window','65535');assert.equal(f.el('play').disabled,false);
});
test('UI: field flies into an empty operand before any bit addition, even at fast speed',async()=>{
 const f=fixture({animate:true});f.change('speed','60');
 assert.match(f.el('workbench').innerHTML,/operand-empty/);assert.doesNotMatch(f.el('workbench').innerHTML,/0xFC00/);
 f.click('play');f.tick();assert.equal(f.animations.length,1);assert.match(f.el('workbench').innerHTML,/operand-in-transit/);assert.doesNotMatch(f.el('explanation').textContent,/Bit 0:/);
 const animation=f.animations[0];assert.match(animation.node.innerHTML,/Source Port/);assert.match(animation.node.innerHTML,/0xFC00/);assert.ok(f.delays.get([...f.pending.keys()][0])>animation.options.duration);
 animation.finish();await Promise.resolve();await Promise.resolve();await Promise.resolve();assert.match(f.el('explanation').textContent,/has arrived/);assert.doesNotMatch(f.el('workbench').innerHTML,/operand-in-transit/);
 f.tick();assert.match(f.el('explanation').textContent,/has arrived/);f.tick();assert.match(f.el('explanation').textContent,/Bit 0:/);
 f.click('word-dots',{index:'1'});assert.equal(f.el('sum').textContent,'0xFC00');assert.match(f.el('workbench').innerHTML,/operand-empty/);assert.doesNotMatch(f.el('workbench').innerHTML,/0x0050/);
});
test('UI: pausing and resetting an in-flight word cancel stale arrival callbacks',async()=>{
 const f=fixture({animate:true});f.click('play');f.tick();const first=f.animations[0];f.click('pause');assert.equal(first.cancelled,true);assert.equal(f.pending.size,0);assert.equal(f.animations.length,1);
 f.click('play');assert.equal(f.animations.length,2);const second=f.animations[1];f.click('reset');assert.equal(second.cancelled,true);await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.match(f.el('workbench').innerHTML,/operand-empty/);assert.equal(f.el('sum').textContent,'0x0000');assert.match(f.el('step-counter').textContent,/Step 1 /);
});
test('UI: TCP upper/lower halves use separate source regions; reduced motion skips flight',()=>{
 const f=fixture({animate:true});f.change('protocol','tcp');f.click('word-dots',{index:'2'});f.click('next');const upper=f.animations.at(-1);assert.match(upper.node.innerHTML,/0x1234/);
 f.click('word-dots',{index:'3'});f.click('next');const lower=f.animations.at(-1);assert.match(lower.node.innerHTML,/0x5678/);assert.notEqual(upper.node.style.left,lower.node.style.left);
 const r=fixture({animate:true,reduced:true});r.click('next');assert.equal(r.animations.length,0);assert.match(r.el('explanation').textContent,/has arrived/);
});
test('UI: binary result moves upward before updating the running sum',async()=>{
 const f=fixture({animate:true});
 for(let i=0;i<50&&!f.el('explanation').textContent.startsWith('Move the ');i++)f.click('next');
 const animation=f.animations.at(-1);assert.equal(animation.node.className,'sum-flight');assert.match(animation.node.innerHTML,/0xFC00/);assert.match(animation.keyframes[1].transform,/-160px/);assert.equal(f.el('sum').textContent,'0x0000');
 animation.finish();await Promise.resolve();await Promise.resolve();await Promise.resolve();assert.equal(f.el('sum').textContent,'0xFC00');
 f.click('next');f.click('next');assert.match(f.el('workbench').innerHTML,/operand-empty/);assert.equal(f.el('sum').textContent,'0xFC00');
});
test('UI: carry wrap promotes the folded result; reset cancels an in-flight sum',async()=>{
 const f=fixture({animate:true});f.click('preset-carry');f.click('word-dots',{index:'1'});
 for(let i=0;i<70&&!f.el('explanation').textContent.startsWith('Move the ');i++)f.click('next');
 const animation=f.animations.at(-1);assert.equal(animation.node.className,'sum-flight');assert.match(animation.node.innerHTML,/0x0001/);assert.doesNotMatch(animation.node.innerHTML,/0x10000/);assert.equal(f.el('sum').textContent,'0xFFFF');
 f.click('reset');assert.equal(animation.cancelled,true);await Promise.resolve();await Promise.resolve();await Promise.resolve();assert.equal(f.el('sum').textContent,'0x0000');assert.match(f.el('workbench').innerHTML,/operand-empty/);
});
test('static page has no word table or payload inputs; assets and Transport Layer registration resolve',()=>{
 const html=fs.readFileSync('cs339/checksum_explorer.html','utf8');assert.doesNotMatch(html,/<table|id="(?:payload|source-ip|destination-ip|trace)"/);assert.match(html,/Transport Header-Only Checksum Demonstration/);
 for(const [,ref] of html.matchAll(/(?:src|href)="(\.\.\/assets\/[^"?]+)"/g))assert.ok(fs.existsSync(require('node:path').resolve('cs339',ref)),ref);
 const hub=fs.readFileSync('cs339/index.html','utf8'),section=hub.slice(hub.indexOf('id="acc-transport"'),hub.indexOf('<!-- LAYER 3'));assert.match(section,/tool=cs339\/checksum_explorer.html/);assert.match(hub,/name:'Internet Checksum Explorer', file:'checksum_explorer.html'/);
});
