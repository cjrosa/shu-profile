const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('../tools/llm-tokenizer/node_modules/jsdom');
const model=require('../assets/js/ai100/llm-response-model.js'),initial=require('../assets/js/ai100/llm-prediction-model.js'),{choose}=require('../assets/js/ai100/llm-selection.js');
test('all reachable contexts normalize, scale logits, branch completely and retain initial distributions',()=>{
 for(let i=0;i<5;i++){
  assert.deepEqual(model.calculate(i,[],1),initial.calculate(i,1));
  function walk(path){
   if(path.length===8)return;
   const base=model.calculate(i,path);
   for(const t of [.1,1,2]){
    const r=model.calculate(i,path,t),weights=r.candidates.map(c=>Math.exp((c.score-r.candidates[0].score)/t)),sum=weights.reduce((a,b)=>a+b,0);
    assert.ok(Math.abs(r.candidates.reduce((s,c)=>s+c.probability,0)-1)<1e-12);
    r.candidates.forEach((c,j)=>assert.ok(Math.abs(c.probability-weights[j]/sum)<1e-12));
    assert.equal(choose(r.candidates,'greedy').token,base.candidates[0].token);
    assert.ok(!r.candidates.some(c=>c.token==='Other tokens'));
   }
   for(const c of base.candidates)if(c.token!==model.EOS)walk([...path,c.token]);
  }walk([]);
 }
});
test('seeded sampling follows each continuation distribution',()=>{
 let seed=18;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 for(const rows of Object.values(model.states))for(const t of [.1,1,2]){
  const max=Math.max(...rows.map(r=>r[1])),weights=rows.map(r=>Math.exp((r[1]-max)/t)),sum=weights.reduce((a,b)=>a+b,0),c=rows.map((r,i)=>({token:r[0],probability:weights[i]/sum})),counts=Object.fromEntries(c.map(r=>[r.token,0]));
  for(let j=0;j<20000;j++)counts[choose(c,'sampling',random).token]++;
  c.forEach(r=>assert.ok(Math.abs(counts[r.token]-20000*r.probability)<6*Math.sqrt(20000*r.probability*(1-r.probability))+2));
 }
});
function fixture(reduced=false){
 const dom=new JSDOM(fs.readFileSync('ai100/llm_explorer.html','utf8'),{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost/ai100/llm_explorer.html?chapter=5&scene=3'}),w=dom.window,jobs=new Map();let seq=0;
 w.matchMedia=()=>({matches:reduced,addEventListener(){}});w.setTimeout=(fn)=>{jobs.set(++seq,fn);return seq;};w.clearTimeout=id=>jobs.delete(id);
 const animations=[];w.Element.prototype.animate=function(frames,options){const a={element:this,frames,options,state:'running',currentTime:0,cancel(){this.state='cancelled';},pause(){this.state='paused';},play(){this.state='running';}};animations.push(a);return a;};
 for(const name of ['explorer','qk-model','values-model','layer-model','layer','prediction-model','prediction-view','prediction','selection','response-model','generation-playback','response'])w.eval(fs.readFileSync('assets/js/ai100/llm-'+name+'.js','utf8'));
 const get=n=>w.document.getElementById('response'+n);
 return {dom,w,get,jobs,animations,tick(){const entry=jobs.entries().next().value;assert.ok(entry,'pending timer');jobs.delete(entry[0]);entry[1]();},drain(){let n=0;while(jobs.size){assert.ok(++n<100);this.tick();}},words(){return [...get('Tokens').querySelectorAll('text')].map(n=>n.textContent);}};
}
test('Step completes one full cycle, updates preview, and repeated clicks cannot duplicate a token',()=>{
 const f=fixture();try{
  assert.deepEqual(f.words(),['New','Haven']);assert.equal(f.get('Demo').hidden,false);
  const before=f.get('Probabilities').textContent;f.get('Step').click();f.get('Step').click();assert.equal(f.jobs.size,1);f.drain();
  assert.deepEqual(f.words(),['New','Haven','pizza']);assert.notEqual(f.get('Probabilities').textContent,before);assert.equal(f.get('Demo').dataset.phase,'-1');assert.equal(f.w.document.querySelector('.response-flight'),null);
  f.get('Step').click();f.drain();assert.deepEqual(f.words(),['New','Haven','pizza','is']);
 }finally{f.dom.window.close();}
});
test('pause and resume every phase without lost or duplicated tokens; stale reset callbacks do nothing',()=>{
 for(let phase=0;phase<4;phase++){
  const f=fixture();try{f.get('Play').click();for(let j=0;j<phase;j++)f.tick();const before=f.words();f.get('Play').click();assert.equal(f.jobs.size,0);assert.deepEqual(f.words(),before);f.get('Step').click();f.drain();assert.deepEqual(f.words(),['New','Haven','pizza']);
   f.get('Play').click();const stale=[...f.jobs.values()][0];f.get('Reset').click();stale();assert.deepEqual(f.words(),['New','Haven']);assert.equal(f.w.document.querySelector('.response-flight'),null);assert.equal(f.jobs.size,0);
  }finally{f.dom.window.close();}
 }
});
test('settings preserve committed context and cancel pending draws; all examples switch and reset',()=>{
 const f=fixture();try{
  f.get('Step').click();f.drain();const words=f.words();f.get('Play').click();f.tick();f.get('Sampling').click();assert.deepEqual(f.words(),words);assert.equal(f.jobs.size,0);assert.equal(f.get('Selected').hidden,true);
  f.get('Temperature').value=2;f.get('Temperature').dispatchEvent(new f.w.Event('input'));assert.deepEqual(f.words(),words);assert.equal(f.get('TemperatureValue').textContent,'2.0');
  for(let i=0;i<5;i++){f.get('PickerMenu').children[i].click();assert.deepEqual(f.words(),initial.examples[i].text.split(' '));f.get('Step').click();f.drain();assert.equal(f.words().length,initial.examples[i].text.split(' ').length+1);}
  f.get('Reset').click();assert.deepEqual(f.words(),['New','Haven']);assert.equal(f.get('Temperature').value,'1');assert.equal(f.get('Greedy').getAttribute('aria-pressed'),'true');
 }finally{f.dom.window.close();}
});
test('Play reaches EOS; omitted tokens retain their identities; maximum length stops at eight',()=>{
 const f=fixture(true);try{
  f.get('Play').click();f.drain();assert.match(f.get('Phase').textContent,/end-of-sequence/);assert.ok(!f.words().includes('[end]'));assert.equal(f.get('Play').disabled,true);
  f.get('Reset').click();f.get('Sampling').click();f.w.Math.random=()=>.999999;f.get('Step').click();f.drain();assert.equal(f.words().at(-1),initial.calculate().candidates.at(-1).token);
  f.get('Reset').click();f.get('Sampling').click();const sequence=['pizza','is','famous','and','memorable','and','memorable','and'];
  for(const token of sequence){const r=model.calculate(0,f.words().slice(2)),i=r.candidates.findIndex(c=>c.token===token);assert.ok(i>=0);const draw=r.candidates.slice(0,i).reduce((s,c)=>s+c.probability,0)+r.candidates[i].probability/2;f.w.Math.random=()=>draw;f.get('Step').click();f.drain();}
  assert.equal(f.words().length,10);assert.match(f.get('Phase').textContent,/limit reached/);assert.equal(f.get('Step').disabled,true);
 }finally{f.dom.window.close();}
});
test('keyboard menus, slider navigation isolation, scene exit, and reduced motion',async()=>{
 const f=fixture(true);try{
  f.get('PickerButton').click();f.get('Picker').dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.equal(f.w.document.activeElement.textContent,'Longer Context');f.get('Picker').dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(f.get('PickerMenu').hidden,true);
  f.get('Temperature').dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(f.get('Demo').hidden,false);
  f.get('Play').click();f.tick();f.tick();assert.equal(f.w.document.querySelector('.response-flight'),null);f.w.document.getElementById('prevBtn').click();await Promise.resolve();assert.equal(f.jobs.size,0);assert.equal(f.get('Demo').hidden,true);
 }finally{f.dom.window.close();}
});

test('miniature forward pass uses ordered activations and finite pulses before selection',()=>{
 const f=fixture();try{
  assert.deepEqual([0,1,2].map(i=>f.get('Network').querySelectorAll(`[data-layer="${i}"]`).length),[3,3,1]);
  assert.equal(f.get('Network').querySelectorAll('.response-synapse').length,9);
  assert.equal(f.animations.length,0);f.get('Step').click();
  assert.equal(f.jobs.size,1);assert.equal(f.get('Selected').hidden,true);
  const nodes=f.animations.filter(a=>a.element.classList.contains('response-neuron'));
  assert.deepEqual([0,1,2].map(i=>nodes.find(a=>a.element.dataset.layer===String(i)).frames[1].offset),[.42,.6,.76]);
  const pulses=f.animations.filter(a=>a.element.classList.contains('response-engine-pulse'));
  assert.equal(pulses.length,13);assert.ok(pulses.every(a=>a.frames[0].transform!==a.frames.at(-1).transform||a.element.parentElement===f.get('Signals')));
  assert.ok(f.animations.every(a=>a.options.duration===1300&&!a.options.iterations));
  assert.equal(f.get('Signals').children.length,2);
  const output=f.animations.find(a=>a.element===f.get('Signals').lastElementChild);assert.equal(output.frames[1].offset,.8);assert.equal(output.frames[4].offset,.94);
  f.tick();assert.equal(f.get('Selected').hidden,false);assert.ok(f.animations.every(a=>a.state==='cancelled'));assert.equal(f.get('Signals').children.length,0);
  f.drain();assert.deepEqual(f.words(),['New','Haven','pizza']);
  const count=f.animations.filter(a=>a.element.classList.contains('response-neuron')).length;
  f.get('Step').click();assert.equal(f.animations.filter(a=>a.element.classList.contains('response-neuron')).length,count+7);
 }finally{f.dom.window.close();}
});
test('engine pauses and resumes existing animations; reset/settings cancel all effects',()=>{
 for(const action of ['Reset','Sampling','Temperature']){
  const f=fixture();try{
   f.get('Play').click();const original=[...f.animations];original.forEach(a=>a.currentTime=450);
   f.get('Play').click();assert.ok(original.every(a=>a.state==='paused'));assert.equal(f.jobs.size,0);
   f.get('Play').click();assert.equal(f.animations.length,original.length);assert.ok(original.every(a=>a.state==='running'&&a.currentTime===450));
   if(action==='Temperature'){f.get(action).value=2;f.get(action).dispatchEvent(new f.w.Event('input'));}else f.get(action).click();
   assert.ok(original.every(a=>a.state==='cancelled'));assert.equal(f.get('Signals').children.length,0);assert.equal(f.jobs.size,0);assert.deepEqual(f.words(),['New','Haven']);
  }finally{f.dom.window.close();}
 }
});
test('reduced motion retains ordered node emphasis without traveling pulses',()=>{
 const f=fixture(true);try{
  f.get('Step').click();assert.equal(f.get('Signals').children.length,1);
  assert.ok(!f.animations.some(a=>a.element.classList.contains('response-engine-pulse')));
  assert.equal(f.animations.filter(a=>a.element.classList.contains('response-neuron')).length,7);
  assert.ok(f.animations.every(a=>new Set(a.frames.map(frame=>frame.transform).filter(Boolean)).size<=1));
  f.drain();assert.deepEqual(f.words(),['New','Haven','pizza']);
 }finally{f.dom.window.close();}
});

test('Scene 3 clones Chapter 4 artwork exactly and preserves it through playback',()=>{
 const f=fixture();try{
  const source=f.w.document.querySelector('#layerDiagram .layer-network-demo'),target=f.get('Network');
  const before=source.outerHTML;
  assert.equal(target.getAttribute('viewBox'),source.getAttribute('viewBox'));
  const attrs=(n,names)=>names.map(name=>n.getAttribute(name));
  assert.deepEqual([...target.querySelectorAll('.response-neuron')].map(n=>attrs(n,['cx','cy','r','fill','stroke','stroke-width'])),[...source.querySelectorAll('circle')].map(n=>attrs(n,['cx','cy','r','fill','stroke','stroke-width'])));
  assert.deepEqual([...target.querySelectorAll('.layer-synapse')].map(n=>n.getAttribute('d')),[...source.querySelectorAll('.layer-synapse')].map(n=>n.getAttribute('d')));
  // Equal SVG viewBoxes and coordinates yield equal geometry at either display
  // size. This verifies sizing math, not browser rasterization or screenshots.
  for(const width of [90,120]){
   const project=n=>[(+n.getAttribute('cx')-539)*width/72,(+n.getAttribute('cy')-373)*width/72,+n.getAttribute('r')*width/72];
   assert.deepEqual([...target.querySelectorAll('.response-neuron')].map(project),[...source.querySelectorAll('circle')].map(project));
  }
  const css=fs.readFileSync('assets/css/pages/llm-response.css','utf8'),originalCSS=fs.readFileSync('assets/css/pages/llm-layer.css','utf8');
  assert.equal(css.match(/\.response-synapse\{([^}]+)\}/)[1],originalCSS.match(/\.layer-synapse\{([^}]+)\}/)[1]);
  assert.match(css,/\.response-neuron\{opacity:1\}/);
  f.get('Step').click();f.drain();assert.equal(source.outerHTML,before);
  f.get('Reset').click();assert.equal(source.outerHTML,before);
 }finally{f.dom.window.close();}
});

test('appended token flies from its probability label, including omitted candidates',()=>{
 for(const omitted of [false,true]){
  const f=fixture();try{
   if(omitted){f.get('Sampling').click();f.w.Math.random=()=>.999999;}
   f.get('Step').click();f.tick();
   const row=f.get('Probabilities').querySelector('.prob-branch.selected');
   assert.equal(row.classList.contains('prediction-other'),omitted);
   row.querySelector('strong').getBoundingClientRect=()=>({left:420,top:360});
   f.get('Selected').getBoundingClientRect=()=>({left:15,top:25});
   f.tick();
   const flight=f.w.document.querySelector('.response-flight');
   assert.equal(flight.style.left,'420px');assert.equal(flight.style.top,'360px');
   assert.equal(flight.textContent,f.words().at(-1));assert.notEqual(flight.textContent,'Other tokens');
   f.drain();assert.equal(f.w.document.querySelector('.response-flight'),null);
  }finally{f.dom.window.close();}
 }
});

test('all continuation vectors project to the unchanged authored scores',()=>{
 for(let index=0;index<5;index++){
  assert.deepEqual(model.calculate(index).representation,initial.calculate(index).representation);
  function visit(path){
   if(path.length===8)return;
   const result=model.calculate(index,path);
   if(path.length){
    const rows=model.states[model.nextState(index,path)];
    rows.forEach((row,i)=>assert.ok(Math.abs(model.continuationProjection[i].reduce((sum,w,d)=>sum+w*result.representation[d],0)-row[1])<1e-12));
    assert.equal(result.representationKind,'authored-final-position');
    assert.deepEqual(model.calculate(index,path,2).representation,result.representation);
   }
   for(const c of result.candidates)if(c.token!==model.EOS)visit([...path,c.token]);
  }visit([]);
 }
});
test('one grouped vector carries model values, matches Chapter 4 cells, and updates with context',()=>{
 const f=fixture();try{
  const last=f.get('Tokens').querySelector('.attention-token.selected');last.getBoundingClientRect=()=>({left:180,width:100,bottom:70});
  f.get('Step').click();
  function check(values){
   const vector=f.get('Signals').querySelector('.response-context-vector'),cells=[...vector.children];
   assert.equal(cells.length,3);assert.deepEqual(cells.map(n=>+n.dataset.stateValue),Array.from(values));
   cells.forEach((n,i)=>{assert.equal(n.getAttribute('width'),'50');assert.equal(n.getAttribute('height'),'30');assert.equal(n.getAttribute('rx'),'5');assert.equal(+n.getAttribute('x'),-82+i*57);const v=values[i];assert.equal(n.getAttribute('fill'),Math.abs(v)<.0005?'#e1e5e3':`hsl(${v<0?270:215} 45% ${85-45*Math.abs(v)/4}%)`);});
   const flight=f.animations.findLast(a=>a.element===vector);assert.ok(flight);assert.ok(!f.animations.some(a=>cells.includes(a.element)));return flight;
  }
  const flight=check(initial.calculate().representation);assert.equal(flight.frames[0].transform,'translate(230px,78px) scale(.36)');
  assert.equal(flight.frames.find(frame=>frame.offset===.42).opacity,1);
  f.drain();f.get('Step').click();check(model.calculate(0,['pizza']).representation);
  assert.notDeepEqual(model.calculate(0,['pizza']).representation,initial.calculate().representation);
  f.get('Reset').click();assert.equal(f.get('Signals').children.length,0);
 }finally{f.dom.window.close();}
});
