const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('../tools/llm-tokenizer/node_modules/jsdom');
const model=require('../assets/js/ai100/llm-prediction-model.js');
const {choose}=require('../assets/js/ai100/llm-selection.js');
test('greedy compares individual tokens; every probability interval can be sampled',()=>{
  model.examples.forEach((_,i)=>{
    const r=model.calculate(i),snapshot=JSON.stringify(r);
    for(let n=0;n<20;n++)assert.equal(choose([...r.candidates].reverse(),'greedy'),r.candidates[0]);
    let start=0;
    for(const c of r.candidates){assert.equal(choose(r.candidates,'sampling',()=>start+c.probability/2),c);start+=c.probability;}
    assert.equal(JSON.stringify(r),snapshot);
  });
  assert.equal(choose(model.calculate(0).candidates,'greedy').token,'pizza');
});
test('100,000 weighted draws per example match every full-vocabulary probability within six standard errors',()=>{
  let seed=1729;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  model.examples.forEach((_,i)=>{
    const {candidates}=model.calculate(i),counts=new Map(candidates.map(c=>[c.token,0])),n=100000;
    for(let j=0;j<n;j++){const c=choose(candidates,'sampling',random);counts.set(c.token,counts.get(c.token)+1);}
    candidates.forEach(c=>assert.ok(Math.abs(counts.get(c.token)/n-c.probability)<6*Math.sqrt(c.probability*(1-c.probability)/n),`${i}: ${c.token}`));
  });
});
function fixture(reduced=false){
  const dom=new JSDOM(fs.readFileSync('ai100/llm_explorer.html','utf8'),{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost/ai100/llm_explorer.html?chapter=5&scene=2'}),w=dom.window;
  const jobs=new Map();let id=0;w.setTimeout=fn=>{jobs.set(++id,fn);return id;};w.clearTimeout=id=>jobs.delete(id);
  w.matchMedia=()=>({matches:reduced,addEventListener(){}});
  for(const name of ['explorer','qk-model','values-model','layer-model','prediction-model','prediction-view','prediction','selection'])w.eval(fs.readFileSync('assets/js/ai100/llm-'+name+'.js','utf8'));
  return {dom,w,jobs,get:n=>w.document.getElementById('selection'+n),tick(){for(const [id,fn] of jobs){jobs.delete(id);fn();}}};
}
test('all five examples reuse exact Scene 1 bars and prompts; repeated trials do not append context',()=>{
  const f=fixture(),{get,w}=f;assert.equal(get('Demo').hidden,false);
  assert.equal(get('PickerButton').textContent,'New Haven');assert.equal(get('PickerMenu').children.length,5);
  model.examples.forEach((example,i)=>{
    get('PickerButton').click();get('PickerMenu').children[i].click();
    w.document.getElementById('predictionPickerMenu').children[i].click();
    const expected=w.document.getElementById('predictionProbabilities').cloneNode(true);
    expected.querySelectorAll('[aria-pressed]').forEach(n=>n.removeAttribute('aria-pressed'));
    assert.equal(get('Probabilities').innerHTML,expected.innerHTML);
    const prompt=get('Tokens').innerHTML,r=model.calculate(i);
    for(let trial=0;trial<3;trial++){get('Choose').click();f.tick();assert.equal(get('Result').querySelector('strong').textContent,r.candidates[0].token);assert.equal(get('Tokens').innerHTML,prompt);}
    get('Sampling').click();const bars=get('Probabilities').innerHTML;
    w.Math.random=()=>.99999;get('Choose').click();assert.equal(get('Probabilities').classList.contains('selection-sampling'),true);f.tick();
    assert.equal(get('Result').querySelector('strong').textContent,r.candidates.at(-1).token);
    assert.match(get('Result').textContent,/From Other tokens/);assert.ok(get('Probabilities').lastElementChild.classList.contains('selected'));
    assert.equal(get('Tokens').innerHTML,prompt);
    get('Greedy').click();assert.equal(get('Probabilities').innerHTML,bars);
  });
  get('Reset').click();assert.equal(get('PickerButton').textContent,'New Haven');assert.equal(get('Greedy').getAttribute('aria-pressed'),'true');assert.equal(f.jobs.size,0);f.dom.window.close();
});
test('keyboard, touch information, strategy changes and reset cancel pending animations',()=>{
  const f=fixture(),{get,w}=f;
  get('PickerButton').click();get('Picker').dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.equal(w.document.activeElement,get('PickerMenu').lastElementChild);
  w.document.activeElement.click();assert.equal(get('PickerMenu').hidden,true);
  get('Greedy').focus();get('Greedy').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(get('Sampling').getAttribute('aria-pressed'),'true');
  get('Probabilities').firstElementChild.focus();get('Probabilities').firstElementChild.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.equal(w.document.activeElement,get('Probabilities').children[1]);
  get('Probabilities').querySelector('.prediction-info').click();assert.equal(w.document.getElementById('llmTooltip').hidden,false);
  for(const action of [()=>get('Greedy').click(),()=>get('Reset').click(),()=>get('PickerMenu').children[2].click()]){
    get('Choose').click();assert.equal(f.jobs.size,1);action();assert.equal(f.jobs.size,0);assert.equal(get('Choose').disabled,false);assert.equal(get('Probabilities').querySelectorAll('.selection-pending,.selected').length,0);
  }
  f.dom.window.close();
});
test('navigation cancels pending selection; reduced motion reveals immediately',async()=>{
  const f=fixture();f.get('Choose').click();f.w.document.getElementById('prevBtn').click();await Promise.resolve();assert.equal(f.jobs.size,0);assert.equal(f.get('Demo').hidden,true);
  f.w.document.getElementById('nextBtn').click();assert.equal(f.get('Demo').hidden,false);assert.equal(f.get('Choose').disabled,false);f.dom.window.close();
  const g=fixture(true);g.get('Choose').click();assert.equal(g.jobs.size,0);assert.equal(g.get('Result').querySelector('strong').textContent,'pizza');g.dom.window.close();
});
