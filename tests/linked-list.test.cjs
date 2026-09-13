const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const M=require('../assets/js/linked-list-model.js');
test('input validation permits empty lists and duplicate integers',()=>{
 assert.deepEqual(M.parse(''),[]);assert.deepEqual(M.parse('10, -2, 10'),[10,-2,10]);
 for(const input of ['1,','1.5','1e2','9007199254740992',Array(11).fill('1').join(',')])assert.throws(()=>M.parse(input));
});
for(const tail of [false,true])for(const data of [[],[10],[10,20,10]])test(`operations and reference integrity ${JSON.stringify(data)} tail=${tail}`,()=>{
 const base=M.create(data),original=M.copy(base);
 for(const op of ['traverse','prepend','append','remove']){
  const t=M.trace(base,op,5,tail);const expected=op==='prepend'?[5,...data]:op==='append'?[...data,5]:op==='remove'?data.slice(1):data;
  assert.deepEqual(M.values(t.result),expected);assert.deepEqual(base,original);
  assert.equal(t.result.tail,t.result.nodes.find(n=>n.next===null)?.id||null);
  for(const f of t.frames){assert.ok(f.active<t.code.length);for(const n of f.state.nodes)assert.ok(n.next===null||f.state.nodes.some(x=>x.id===n.next));}
  if(op==='traverse')assert.deepEqual(t.frames.at(-1).output,data);
  if(op==='append')assert.equal(t.frames.at(-1).hops,tail?0:Math.max(0,data.length-1));
 }
 data.forEach((v,i)=>{const t=M.trace(base,'index',i,tail);assert.deepEqual(t.frames.at(-1).output,[v]);assert.equal(t.frames.at(-1).hops,i);});
 for(const i of [-1,data.length,.5])assert.throws(()=>M.trace(base,'index',i,tail));
});
test('prepend preserves old head before changing it; snapshots are isolated',()=>{
 const t=M.trace(M.create([10,20]),'prepend',5);const linked=t.frames.find(f=>t.code[f.active]==='new_node.next = self.head');
 assert.equal(linked.state.head,'N1');assert.equal(linked.state.nodes.at(-1).next,'N1');assert.equal(t.result.head,'N3');
 linked.state.nodes[0].value=999;assert.equal(t.result.nodes[0].value,10);assert.equal(t.frames[0].state.nodes[0].value,10);
 assert.throws(()=>M.trace(M.create(Array(10).fill(1)),'append',2));
});
function ui(){
 const html=fs.readFileSync('cs112/linked_list_explorer.html','utf8');const elements=new Map();
 for(const [,id] of html.matchAll(/id="([^"]+)"/g))elements.set(id,{value:'',hidden:false,disabled:false,checked:false,textContent:'',innerHTML:'',setAttribute(k,v){this[k]=v;}});
 elements.get('speed').value='1000';elements.get('operation').value='traverse';elements.get('argument').value='40';
 const timers=new Map();let serial=0;
 const ctx={LinkedListModel:M,document:{getElementById:id=>elements.get(id),addEventListener(){}},setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id)};
 vm.createContext(ctx);vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1],ctx);
 return {e:id=>elements.get(id),timers,read:expr=>vm.runInContext(expr,ctx),tick:()=>{const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}};
}
test('all guided topics render and step backward exactly',()=>{
 const u=ui();for(let i=0;i<u.read("topics.length");i++){u.e('lesson').value=i;u.e('lesson').onchange();while(!u.e('next').disabled)u.e('next').onclick();assert.ok(u.e('diagram').innerHTML.includes('svg-desc'));if(!u.e('back').disabled){const end=u.e('diagram').innerHTML;u.e('back').onclick();u.e('next').onclick();assert.equal(u.e('diagram').innerHTML,end);}}
});
test('playback, reset, validation, and interrupted operation use completed state',()=>{
 const u=ui();u.e('explore').onclick();u.e('operation').value='prepend';u.e('operation').onchange();u.e('argument').value='5';u.e('run').onclick();u.e('next').onclick();u.e('play').onclick();assert.equal(u.timers.size,1);
 u.e('operation').value='append';u.e('operation').onchange();assert.equal(u.timers.size,0);assert.equal(u.read('M.values(base).join()'),'10,20,30');
 u.e('run').onclick();u.e('play').onclick();while(u.timers.size)u.tick();assert.equal(u.read('M.values(base).join()'),'10,20,30,5');
 u.e('back').onclick();u.e('operation').value='traverse';u.e('operation').onchange();assert.equal(u.read('M.values(base).join()'),'10,20,30,5');
 u.e('reset').onclick();assert.equal(u.read('M.values(base).join()'),'10,20,30');
 u.e('list').value='bad';u.e('load').onclick();assert.ok(u.e('error').textContent);assert.equal(u.read('M.values(base).join()'),'10,20,30');
 u.e('list').value='';u.e('load').onclick();assert.equal(u.read('M.values(base).length'),0);
});
test('hub registers the explorer and viewer return route',()=>{
 const html=fs.readFileSync('cs112/index.html','utf8');assert.match(html,/tool=cs112\/linked_list_explorer.html&amp;course=CS112/);assert.match(html,/name=Linked%20List%20Explorer&amp;back=cs112\/index.html/);assert.match(html,/file:'linked_list_explorer.html'/);
});

test('intro defines the array and animates linked access and head insertion',()=>{
 const u=ui();

 const original=u.e('diagram').innerHTML;let sawTraversal=false,sawShift=false;
 while(!u.e('next').disabled){
  u.e('next').onclick();
  if(u.read('trace.frames[step].current')==='N2')sawTraversal=true;
  if(u.read('trace.frames[step].array.includes(null)'))sawShift=true;
 }
 assert.ok(sawTraversal);assert.ok(sawShift);
 assert.notEqual(u.e('diagram').innerHTML,original);
 assert.equal(u.read('M.values(trace.frames[step].state).join()'),'5,10,20,30');
 assert.equal(u.read('trace.frames[step].array.join()'),'5,10,20,30');
 assert.equal(u.read('trace.frames[step].writes'),2);
 while(!u.e('back').disabled)u.e('back').onclick();
 assert.equal(u.e('diagram').innerHTML,original);
});

test('operation examples stay static while mechanics advance',()=>{
 const u=ui();u.e('explore').onclick();
 for(const op of ['traverse','index','prepend','remove','append']){
  u.e('operation').value=op;u.e('operation').onchange();u.e('argument').value=op==='index'?'1':'5';
  const code=u.e('example-code').textContent;assert.match(code,/def /);u.e('run').onclick();
  while(!u.e('next').disabled){u.e('next').onclick();assert.equal(u.e('example-code').textContent,code);}
 }
 u.e('tail').checked=true;u.e('tail').onchange();assert.match(u.e('example-code').textContent,/self.tail.next/);
 u.e('guided').onclick();assert.equal(u.e('operation-example').hidden,true);
});
