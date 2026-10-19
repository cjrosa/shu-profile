const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('../tools/llm-tokenizer/node_modules/jsdom');
const model=require('../assets/js/ai100/llm-response-model.js');
function fixture(reduced=false){
 const dom=new JSDOM(fs.readFileSync('ai100/llm_explorer.html','utf8'),{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost/ai100/llm_explorer.html?chapter=5&scene=4'}),w=dom.window,jobs=new Map();let seq=0;
 w.matchMedia=()=>({matches:reduced,addEventListener(){}});w.setTimeout=fn=>{jobs.set(++seq,fn);return seq;};w.clearTimeout=id=>jobs.delete(id);
 const animations=[];w.Element.prototype.animate=function(frames,options){const a={element:this,frames,options,state:'running',currentTime:0,pause(){this.state='paused';},play(){this.state='running';},cancel(){this.state='cancelled';}};animations.push(a);return a;};
 for(const name of ['explorer','qk-model','values-model','layer-model','layer','prediction-model','prediction-view','prediction','selection','response-model','generation-playback','stack','capstone'])w.eval(fs.readFileSync('assets/js/ai100/llm-'+name+'.js','utf8'));
 const get=n=>w.document.getElementById('capstone'+n);
 return {dom,w,get,jobs,animations,tick(){const entry=jobs.entries().next().value;assert.ok(entry);jobs.delete(entry[0]);entry[1]();},drain(){let n=0;while(jobs.size){assert.ok(++n<200);this.tick();}},words(){return [...get('Tokens').querySelectorAll('text')].map(n=>n.textContent);}};
}
test('initial scene, real reused artwork, sequential phases, one token per Step and updated predictions',()=>{
 const f=fixture();try{assert.equal(f.get('Demo').hidden,false);assert.deepEqual(f.words(),['New','Haven']);assert.equal(f.get('Tokens').querySelector('svg').getAttribute('viewBox').split(' ').at(-1),'48');assert.equal(f.get('Layers').querySelectorAll('[data-stage]').length,3);assert.equal(f.get('Network').querySelectorAll('circle[data-layer]').length,7);assert.match(f.w.document.getElementById('sceneCount').textContent,/Scene 4 of 4/);
 assert.equal(f.get('Demo').querySelector('.capstone-transformer-arrow'),null);assert.equal(f.get('Demo').querySelector('.capstone-stage.active'),null);
 const before=f.get('Probabilities').textContent;f.get('Step').click();f.get('Step').click();for(let phase=0;phase<14;phase++){assert.equal(+f.get('Demo').dataset.phase,phase);f.tick();}assert.deepEqual(f.words(),['New','Haven','pizza']);assert.notEqual(f.get('Probabilities').textContent,before);assert.equal(f.jobs.size,0);
 f.get('Step').click();f.drain();assert.deepEqual(f.words(),['New','Haven','pizza','is']);
 }finally{f.dom.window.close();}
});
test('every phase pauses and resumes without duplicate draws; inspections never consume randomness or mutate context',()=>{
 for(let phase=0;phase<14;phase++){const f=fixture();try{let draws=0;f.w.Math.random=()=>{draws++;return 0;};f.get('Sampling').click();f.get('Play').click();for(let i=0;i<phase;i++)f.tick();f.get('Play').click();assert.equal(f.jobs.size,0);const words=f.words(),prob=f.get('Probabilities').innerHTML,count=draws;f.get('Demo').querySelectorAll('[data-inspect]').forEach(n=>n.click());assert.deepEqual(f.words(),words);assert.equal(f.get('Probabilities').innerHTML,prob);assert.equal(draws,count);f.get('Step').click();f.drain();assert.deepEqual(f.words(),['New','Haven','pizza']);assert.equal(draws,1);}finally{f.dom.window.close();}}
});
test('settings preserve committed context, all five examples work, reset invalidates stale callbacks',()=>{
 const f=fixture();try{f.get('Step').click();f.drain();f.get('Play').click();f.tick();f.get('Sampling').click();assert.equal(f.jobs.size,0);assert.deepEqual(f.words(),['New','Haven','pizza']);f.get('Temperature').value=2;f.get('Temperature').dispatchEvent(new f.w.Event('input'));assert.equal(f.get('TemperatureValue').textContent,'2.0');
 for(let i=0;i<5;i++){f.get('PickerMenu').children[i].click();const count=f.words().length;f.get('Step').click();f.drain();assert.equal(f.words().length,count+1);}
 f.get('Play').click();const stale=[...f.jobs.values()][0];f.get('Reset').click();stale();assert.deepEqual(f.words(),['New','Haven']);assert.equal(f.get('Temperature').value,'1');assert.equal(f.get('Greedy').getAttribute('aria-pressed'),'true');assert.equal(f.jobs.size,0);
 }finally{f.dom.window.close();}
});
test('EOS and limit stop, reduced motion removes flights, aggregate never appended',()=>{
 const f=fixture(true);try{f.get('Play').click();f.drain();assert.match(f.get('Phase').textContent,/end-of-sequence/);assert.ok(!f.words().includes('[end]'));assert.equal(f.get('Play').disabled,true);f.get('Reset').click();f.get('Sampling').click();f.w.Math.random=()=>.999999;f.get('Step').click();f.drain();assert.notEqual(f.words().at(-1),'Other tokens');assert.equal(f.w.document.querySelector('.response-flight'),null);
 f.get('Reset').click();f.get('Sampling').click();for(const token of ['pizza','is','famous','and','memorable','and','memorable','and']){const r=model.calculate(0,f.words().slice(2)),i=r.candidates.findIndex(c=>c.token===token);f.w.Math.random=()=>r.candidates.slice(0,i).reduce((s,c)=>s+c.probability,0)+r.candidates[i].probability/2;f.get('Step').click();f.drain();}assert.equal(f.words().length,10);assert.match(f.get('Phase').textContent,/limit reached/);assert.equal(f.get('Step').disabled,true);
 }finally{f.dom.window.close();}
});
test('scene exit pauses; keyboard picker and slider preserve navigation',async()=>{const f=fixture();try{f.get('PickerButton').click();f.get('Picker').dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.equal(f.w.document.activeElement.textContent,'Longer Context');f.get('Picker').dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(f.get('PickerMenu').hidden,true);f.get('Temperature').dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(f.get('Demo').hidden,false);f.get('Play').click();f.w.document.getElementById('prevBtn').click();await Promise.resolve();assert.equal(f.jobs.size,0);assert.equal(f.get('Demo').hidden,true);}finally{f.dom.window.close();}});
test('four sections preserve actual Chapter 4 artwork and shared vectors without changing the source',()=>{
 const f=fixture();try{
  assert.equal(f.get('Demo').querySelectorAll('.capstone-stage').length,4);
  assert.equal(f.get('Demo').querySelectorAll('[data-inspect]').length,4);
  assert.equal(f.get('Inspection').hidden,true);
  const source=f.w.document.querySelector('#stackDiagram svg'),before=source.outerHTML;
  const attrs=n=>['x','y','width','height','rx'].map(k=>n.getAttribute(k));
  assert.deepEqual([...f.get('Layers').querySelectorAll('[data-stage]>rect')].map(attrs),[...source.querySelectorAll('[data-stage]>rect')].map(attrs));
  assert.deepEqual([...f.get('Layers').querySelectorAll('[data-edge]')].map(n=>n.getAttribute('d')),[...source.querySelectorAll('[data-edge]')].map(n=>n.getAttribute('d')));
  assert.deepEqual([...f.get('Vector').querySelectorAll('rect')].map(n=>+n.dataset.stateValue),Array.from(model.calculate().representation));
  f.get('Step').click();f.drain();assert.equal(source.outerHTML,before);
  assert.deepEqual([...f.get('Vector').querySelectorAll('rect')].map(n=>+n.dataset.stateValue),Array.from(model.calculate(0,['pizza']).representation));
 }finally{f.dom.window.close();}
});
test('layer processing, explicit handoffs, forward-pass offsets, and return motion are paused and resumed in place',()=>{
 const f=fixture();try{
  f.get('Step').click();
  const inputFlights=[...f.get('Signals').querySelectorAll('[data-representation-kind="input-lookup"],[data-representation-kind="schematic-input"]')];
  assert.equal(inputFlights.length,2);assert.equal(f.get('Routes').children.length,0);
  assert.ok(inputFlights.every(n=>f.animations.some(a=>a.element===n&&a.frames.length===4)));
  f.tick();f.tick();
  assert.equal(f.get('Routes').children.length,0);
  const residuals=[...f.get('Signals').querySelectorAll('.capstone-context-pulse')];
  assert.equal(residuals.length,2);assert.ok(residuals.every(n=>n.querySelectorAll('rect').length===3));
  const residualAnimations=residuals.map(n=>f.animations.find(a=>a.element===n));
  assert.deepEqual(residualAnimations.map(a=>a.options.duration),[405,405]);
  assert.deepEqual(residualAnimations.map(a=>a.options.delay),[0,90]);
  const sweep=f.animations.find(a=>a.element.classList.contains('stack-processing-sweep'));
  assert.ok(Math.abs(sweep.options.delay-495)<1e-9);assert.equal(sweep.options.duration,405);
  assert.equal(f.get('Layers').querySelector('.stack-processing').dataset.stage,'0');
  assert.ok(f.get('Layers').querySelector('.stack-moving-vector'));
  assert.equal(f.get('Layers').querySelector('.stack-moving-vector').querySelectorAll('[data-state-value]').length,0);
  f.tick();const handoff=f.animations.findLast(a=>a.element.dataset.representationKind==='illustrative-layer-handoff');
  assert.deepEqual(Array.from(handoff.frames,x=>x.transform),['translate(300px,148px)','translate(300px,192px)']);
  while(+f.get('Demo').dataset.phase<8)f.tick();
  const forward=f.animations.filter(a=>a.state==='running'&&a.element.hasAttribute('data-layer'));
  assert.deepEqual([0,1,2].map(i=>forward.find(a=>a.element.dataset.layer===String(i)).frames[1].offset),[.42,.6,.76]);
  const live=f.animations.filter(a=>a.state==='running');live.forEach(a=>a.currentTime=420);f.get('Play').click();
  assert.ok(live.every(a=>a.state==='paused'));const count=f.animations.length;f.get('Step').click();assert.equal(f.animations.length,count);assert.ok(live.every(a=>a.state==='running'&&a.currentTime===420));
  while(+f.get('Demo').dataset.phase<11)f.tick();
  assert.deepEqual(f.words(),['New','Haven']);assert.ok(f.get('Signals').querySelector('.stack-token-flight'));assert.equal(f.get('Routes').querySelector('.capstone-return'),null);
  f.tick();assert.deepEqual(f.words(),['New','Haven','pizza']);assert.equal(f.get('Signals').querySelector('.stack-token-flight'),null);
  f.drain();assert.equal(f.get('Signals').children.length,0);
 }finally{f.dom.window.close();}
});
test('settings and Reset clear all visual effects at every phase, preserving only committed tokens',()=>{
 for(let phase=0;phase<14;phase++){const f=fixture();try{
  f.get('Play').click();for(let i=0;i<phase;i++)f.tick();const words=f.words();const stale=[...f.jobs.values()][0];
  f.get('Temperature').value=1.5;f.get('Temperature').dispatchEvent(new f.w.Event('input'));
  assert.deepEqual(f.words(),words);assert.equal(f.jobs.size,0);assert.ok(f.animations.every(a=>a.state==='cancelled'));assert.equal(f.get('Demo').querySelectorAll('.stack-transient').length,0);
  stale();assert.deepEqual(f.words(),words);f.get('Reset').click();assert.deepEqual(f.words(),['New','Haven']);assert.equal(f.get('Demo').querySelectorAll('.stack-processing').length,0);
 }finally{f.dom.window.close();}}
});
test('reduced motion retains phase sequence without traveling transforms, and resize never redraws a selection',()=>{
 const f=fixture(true);try{
  let draws=0;f.w.Math.random=()=>{draws++;return 0;};f.get('Sampling').click();f.get('Step').click();
  for(let i=0;i<11;i++)f.tick();assert.equal(draws,1);f.w.dispatchEvent(new f.w.Event('resize'));assert.equal(draws,1);assert.deepEqual(f.words(),['New','Haven']);
  assert.equal(f.get('Signals').querySelector('.stack-token-flight'),null);
  assert.ok(f.animations.every(a=>new Set(a.frames.map(x=>x.transform).filter(Boolean)).size<=1));
  f.drain();assert.deepEqual(f.words(),['New','Haven','pizza']);
 }finally{f.dom.window.close();}
});
