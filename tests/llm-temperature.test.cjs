const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('../tools/llm-tokenizer/node_modules/jsdom');
const model=require('../assets/js/ai100/llm-prediction-model.js');
const {choose}=require('../assets/js/ai100/llm-selection.js');
const entropy=r=>-r.candidates.reduce((s,c)=>s+(c.probability?c.probability*Math.log(c.probability):0),0);
test('temperature uses every unchanged score, preserves ranking, and normalizes all five examples',()=>{
 for(let i=0;i<model.examples.length;i++){
  const baseline=model.calculate(i),snapshot=JSON.stringify(baseline);
  assert.deepEqual(model.calculate(i,1),baseline);
  for(const t of [.1,.5,1,2]){
   const r=model.calculate(i,t),max=Math.max(...baseline.candidates.map(c=>c.score));
   const weights=baseline.candidates.map(c=>Math.exp((c.score-max)/t)),sum=weights.reduce((a,b)=>a+b,0);
   assert.deepEqual(r.candidates.map(c=>[c.token,c.score]),baseline.candidates.map(c=>[c.token,c.score]));
   r.candidates.forEach((c,j)=>{assert.ok(Number.isFinite(c.probability)&&c.probability>=0);assert.ok(Math.abs(c.probability-weights[j]/sum)<1e-14);});
   assert.ok(Math.abs(r.candidates.reduce((s,c)=>s+c.probability,0)-1)<1e-14);
   assert.equal(r.other,r.candidates.slice(5).reduce((s,c)=>s+c.probability,0));
   assert.equal(choose(r.candidates,'greedy').token,baseline.candidates[0].token);
  }
  assert.ok(entropy(model.calculate(i,.1))<entropy(baseline));assert.ok(entropy(model.calculate(i,2))>entropy(baseline));
  assert.equal(JSON.stringify(baseline),snapshot);
 }
 for(const t of [0,-1,NaN,Infinity])assert.throws(()=>model.calculate(0,t),RangeError);
 assert.ok(model.calculate(0,Number.MIN_VALUE).candidates.every(c=>Number.isFinite(c.probability)));
});
test('100,000 seeded samples per example and temperature follow adjusted individual probabilities',()=>{
 let seed=817;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 for(let i=0;i<5;i++)for(const t of [.1,1,2]){
  const r=model.calculate(i,t),counts=Object.fromEntries(r.candidates.map(c=>[c.token,0])),n=100000;
  for(let j=0;j<n;j++)counts[choose(r.candidates,'sampling',random).token]++;
  for(const c of r.candidates)assert.ok(Math.abs(counts[c.token]-n*c.probability)<=6*Math.sqrt(n*c.probability*(1-c.probability))+2);
 }
});
function fixture(){
 const dom=new JSDOM(fs.readFileSync('ai100/llm_explorer.html','utf8'),{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost/ai100/llm_explorer.html?chapter=5&scene=2'}),w=dom.window;
 w.matchMedia=()=>({matches:true,addEventListener(){}});
 for(const name of ['explorer','qk-model','values-model','layer-model','prediction-model','prediction-view','prediction','selection'])w.eval(fs.readFileSync('assets/js/ai100/llm-'+name+'.js','utf8'));
 const get=n=>w.document.getElementById('selection'+n);
 return {dom,w,get,set(t){get('Temperature').value=t;get('Temperature').dispatchEvent(new w.Event('input',{bubbles:true}));}};
}
test('live control retains bars and prompt, clears results/history, and samples current probabilities',()=>{
 const f=fixture(),{get,w}=f;
 assert.equal(get('Demo').hidden,false);assert.equal(get('Greedy').getAttribute('aria-pressed'),'true');
 assert.equal(get('TemperatureSection').open,false);get('TemperatureSection').open=true;get('Sampling').click();
 const bar=get('Probabilities').firstElementChild,prompt=get('Tokens').innerHTML;
 for(const t of [.1,2]){
  f.set(t);assert.equal(get('Probabilities').firstElementChild,bar);assert.equal(get('Tokens').innerHTML,prompt);
  assert.equal(get('TemperatureValue').textContent,t.toFixed(1));
  const r=model.calculate(0,t);let start=0;
  for(const c of r.candidates){const draw=start+c.probability/2;w.Math.random=()=>draw;get('Choose').click();assert.equal(get('Result').querySelector('strong').textContent,choose(r.candidates,'sampling',()=>draw).token);start+=c.probability;}
  assert.equal(get('HistoryTokens').children.length,5);
 }
 get('Greedy').click();f.set(.1);assert.equal(get('Greedy').getAttribute('aria-pressed'),'true');assert.equal(get('HistoryTokens').children.length,0);assert.equal(get('Result').textContent,'Choose a token to see the result.');
 get('Choose').click();assert.equal(get('Result').querySelector('strong').textContent,'pizza');
 get('PickerMenu').children[4].click();assert.equal(get('Temperature').value,'1');assert.equal(get('PickerButton').textContent,'Longer Context');assert.equal(get('HistoryTokens').children.length,0);
 f.set(2);get('Reset').click();assert.equal(get('Temperature').value,'1');assert.equal(get('PickerButton').textContent,'New Haven');assert.equal(get('Greedy').getAttribute('aria-pressed'),'true');assert.equal(get('TemperatureSection').open,false);
 get('Temperature').focus();get('Temperature').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(get('Demo').hidden,false);
 get('Demo').querySelector('[aria-label="What does temperature do?"]').click();assert.equal(w.document.getElementById('llmTooltip').hidden,false);
 w.document.getElementById('prevBtn').click();assert.equal(get('Demo').hidden,true);assert.equal(w.document.getElementById('predictionDemo').hidden,false);
 domClose(f);
});
function domClose(f){f.dom.window.close();}
test('all examples match Scene 2 at 1.0 and temperature changes cancel pending draws',async()=>{
 const f=fixture(),{get,w}=f;
 for(let i=0;i<5;i++){
  get('PickerMenu').children[i].click();w.document.getElementById('predictionPickerMenu').children[i].click();
  const baseline=w.document.getElementById('predictionProbabilities').cloneNode(true);baseline.querySelectorAll('[aria-pressed]').forEach(n=>n.removeAttribute('aria-pressed'));assert.equal(get('Probabilities').innerHTML,baseline.innerHTML);
 }
 // Switch the fixture to animated selection and control its timers explicitly.
 f.dom.window.close();
 const dom=new JSDOM(fs.readFileSync('ai100/llm_explorer.html','utf8'),{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost/ai100/llm_explorer.html?chapter=5&scene=2'}),win=dom.window,jobs=new Map();let id=0;
 win.matchMedia=()=>({matches:false,addEventListener(){}});win.setTimeout=fn=>{jobs.set(++id,fn);return id;};win.clearTimeout=id=>jobs.delete(id);
 for(const name of ['explorer','qk-model','values-model','layer-model','prediction-model','prediction-view','selection'])win.eval(fs.readFileSync('assets/js/ai100/llm-'+name+'.js','utf8'));
 const el=n=>win.document.getElementById('selection'+n);
 for(const action of [()=>{el('Temperature').value=2;el('Temperature').dispatchEvent(new win.Event('input'));},()=>el('PickerMenu').children[1].click(),()=>el('Reset').click(),()=>win.document.getElementById('prevBtn').click()]){
  el('Choose').click();assert.equal(jobs.size,1);action();await Promise.resolve();assert.equal(jobs.size,0);assert.equal(el('Choose').disabled,false);assert.equal(el('HistoryTokens').children.length,0);
 }
 dom.window.close();
});
test('Chapter 5 has exactly four ordered scenes; Scene 3 is integrated and Scene 4 is the integrated capstone',()=>{
 const {chapters}=require('../assets/js/ai100/llm-explorer.js');
 assert.deepEqual(chapters[4].scenes.map(s=>s.title),['From Representations to Predictions','Choosing the Next Token','Generating One Token at a Time','Putting It All Together']);
 assert.equal(chapters[4].scenes[2].id,'response');
 const f=fixture(),{w,get}=f,d=w.document;
 assert.equal(d.getElementById('temperatureDemo'),null);
 assert.equal(d.querySelectorAll('input[type="range"][id="selectionTemperature"]').length,1);
 const ids=[...d.querySelectorAll('[id]')].map(n=>n.id);assert.equal(new Set(ids).size,ids.length);
 d.getElementById('prevBtn').click();
 for(let i=1;i<=4;i++){
  assert.equal(d.getElementById('sceneCount').textContent,`Scene ${i} of 4`);
  assert.equal(new URL(w.location.href).searchParams.get('scene'),String(i));
  assert.equal(d.querySelector('.placeholder').hidden,true);
  if(i>3){assert.equal(d.getElementById('capstoneDemo').hidden,false);assert.equal(get('Demo').hidden,true);}
  if(i<4)d.getElementById('nextBtn').click();
 }
 assert.equal(d.querySelector('.progress').getAttribute('aria-valuemax'),'21');
 for(let i=3;i>=1;i--){d.getElementById('prevBtn').click();assert.equal(new URL(w.location.href).searchParams.get('scene'),String(i));}
 assert.ok(!chapters[4].scenes.some(s=>s.id==='sampling'||s.title==='Temperature and Sampling'));
 f.dom.window.close();
});
test('optional temperature disclosure and strategy changes preserve settings until Reset',()=>{
 const f=fixture(),{get}=f;
 const section=get('TemperatureSection');assert.equal(section.open,false);
 section.querySelector('summary').click();assert.equal(section.open,true);
 f.set(2);get('Sampling').click();assert.equal(get('Temperature').value,'2');
 get('Choose').click();get('Choose').click();assert.equal(get('HistoryTokens').children.length,2);
 get('Greedy').click();assert.equal(get('Temperature').value,'2');assert.equal(get('History').hidden,true);
 section.querySelector('summary').click();assert.equal(section.open,false);assert.equal(get('Temperature').value,'2');
 section.querySelector('summary').click();get('Reset').click();assert.equal(section.open,false);assert.equal(get('Temperature').value,'1');assert.equal(get('HistoryTokens').children.length,0);
 f.dom.window.close();
});
test('one temperature control moves between collapsed header and expanded body',async()=>{
 const f=fixture(),{get,w}=f,section=get('TemperatureSection'),slider=get('Temperature'),summary=section.querySelector('summary');
 assert.ok(summary.contains(slider));f.set(1.3);
 summary.click();await Promise.resolve();assert.equal(section.open,true);assert.equal(summary.contains(slider),false);assert.ok(section.querySelector('.tokens-input-body').contains(slider));assert.equal(slider.value,'1.3');
 summary.click();await Promise.resolve();assert.equal(section.open,false);assert.ok(summary.contains(slider));assert.equal(w.document.querySelectorAll('#selectionTemperature').length,1);
 slider.click();assert.equal(section.open,false);
 summary.click();await Promise.resolve();get('Reset').click();await Promise.resolve();assert.ok(summary.contains(slider));assert.equal(slider.value,'1');
 f.dom.window.close();
});
