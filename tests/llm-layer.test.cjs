const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('../tools/llm-tokenizer/node_modules/jsdom');
const model=require('../assets/js/ai100/llm-layer-model.js');
const qk=require('../assets/js/ai100/llm-qk-model.js');
const values=require('../assets/js/ai100/llm-values-model.js');
const examples=require('../assets/js/ai100/llm-self-attention.js').examples;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
const vectorNear=(a,b)=>a.forEach((v,i)=>near(v,b[i]));
// Independent scalar reference: do not use the layer's operations or matrices.
function reference(words,t){
  const norm=x=>{let m=(x[0]+x[1]+x[2])/3;let d=Math.sqrt(((x[0]-m)**2+(x[1]-m)**2+(x[2]-m)**2)/3+.00001);return x.map(v=>(v-m)/d);};
  const inputs=words.map(qk.representation),ns=inputs.map(norm),[a,b,c]=ns[t];
  const scores=ns.slice(0,t+1).map(([x,y,z])=>((b+.5*c)*(x+.25*z)+(a-.5*c)*(y-.5*z))/Math.sqrt(2));
  const exps=scores.map(v=>Math.exp(v-Math.max(...scores))),total=exps.reduce((a,b)=>a+b,0);
  let u=0,v=0;exps.forEach((e,i)=>{u+=e/total*(.5*ns[i][0]-.5*ns[i][2]);v+=e/total*(.5*ns[i][1]-.25*ns[i][2]);});
  const attention=[.25*u,.25*v,.125*u-.125*v],r=inputs[t].map((x,i)=>x+attention[i]);
  const [x,y,z]=norm(r),h=[.3*x-.2*y+.1*z,-.1*x+.3*y+.2*z,.2*x+.1*y-.3*z,-.2*x+.1*y+.3*z].map(v=>Math.max(0,v));
  const ff=[.2*h[0]-.1*h[1]+.1*h[2]+.1*h[3],.1*h[0]+.2*h[1]-.1*h[2]+.1*h[3],-.1*h[0]+.1*h[1]+.2*h[2]-.1*h[3]];
  return {attention,output:r.map((v,i)=>v+ff[i])};
}
test('every example and target matches independent pre-norm reference and color bounds',()=>{
  for(const example of examples){const words=example.text.split(' ');for(let t=0;t<words.length;t++){
    const approved=values.calculate(words,t),r=model.calculate(words,t),expected=reference(words,t);
    vectorNear(r.attention,expected.attention);vectorNear(r.output,expected.output);
    vectorNear(r.residual1,r.input.map((v,i)=>v+r.attention[i]));vectorNear(r.output,r.residual1.map((v,i)=>v+r.feedForward[i]));
    for(const key of ['input','norm1','attention','residual1','norm2','feedForward','output'])assert.ok(r[key].every(v=>Number.isFinite(v)&&Math.abs(v)<4));
    near(r.weights.reduce((a,b)=>a+b,0),1);assert.ok(r.weights.slice(t+1).every(v=>v===0));
    assert.deepEqual(values.calculate(words,t),approved);
    vectorNear(model.calculate(words.slice(0,t+1),t).output,r.output);
  }}
  vectorNear(model.normalize([2,2,2]),[0,0,0]);
  vectorNear(model.normalize([0,1,2]),[-1/Math.sqrt(2/3+.00001),0,1/Math.sqrt(2/3+.00001)]);
});
function fixture(reduced=false){
  const dom=new JSDOM(fs.readFileSync('ai100/llm_explorer.html','utf8'),{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost/ai100/llm_explorer.html?chapter=4&scene=5'});
  const w=dom.window,clocks=new Map();let id=0,changeMotion;
  const motion={matches:reduced,addEventListener:(name,fn)=>{changeMotion=fn;}};w.matchMedia=()=>motion;
  w.setTimeout=fn=>{clocks.set(++id,fn);return id;};w.clearTimeout=id=>clocks.delete(id);
  for(const name of ['llm-explorer','llm-qk-model','llm-values-model','llm-layer-model','llm-layer'])w.eval(fs.readFileSync('assets/js/ai100/'+name+'.js','utf8'));
  const get=n=>w.document.getElementById('layer'+n),key=(node,key)=>node.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true}));
  const tick=()=>{const [id,fn]=clocks.entries().next().value;clocks.delete(id);fn();};
  return {dom,w,get,clocks,key,tick,motion,changeMotion};
}
test('immediate full architecture, all selectable components, actual vectors and residual bypasses',()=>{
  const {dom,w,get,key}=fixture();
  assert.equal(get('Demo').hidden,false);assert.equal(w.document.querySelector('.placeholder').hidden,true);
  assert.equal(get('Diagram').querySelectorAll('[role="button"]').length,8);
  assert.equal(get('Diagram').querySelectorAll('.layer-bypass').length,2);
  assert.equal(get('Diagram').querySelector('[role="button"][data-stage="updated"]').querySelectorAll('[data-state-value]').length,3);
  get('Diagram').querySelectorAll('[role="button"]').forEach(n=>{key(n,'Enter');assert.equal(n.getAttribute('aria-pressed'),'true');assert.ok(get('Inspection').querySelectorAll('[data-state-value]').length>=6);});
  const first=get('Diagram').querySelector('[role="button"][data-stage="residual1"]');first.dispatchEvent(new w.MouseEvent('click'));
  assert.equal(get('Inspection').querySelectorAll('[data-state-value]').length,9);
  const r=model.calculate(examples[0].text.split(' '),5);
  vectorNear([...get('Diagram').querySelector('[role="button"][data-stage="updated"]').querySelectorAll('[data-state-value]')].map(n=>+n.dataset.stateValue),r.output);
  assert.ok(get('Calculations').textContent.includes(r.output[0].toFixed(3)));
  const attention=get('Diagram').querySelector('[role="button"][data-stage="attention"]');attention.dispatchEvent(new w.Event('pointerenter'));assert.match(get('Explanation').textContent,/Self-attention/);attention.dispatchEvent(new w.Event('pointerleave'));assert.match(get('Explanation').textContent,/First residual/);
  dom.window.close();
});
test('token keyboard selection, example defaults, picker dismissal and reset',()=>{
  const {dom,w,get,key}=fixture();
  key(get('Tokens').querySelector('[aria-pressed="true"]'),'Home');assert.match(get('Target').textContent,/The · 1 permitted/);
  assert.equal(w.document.getElementById('sceneTitle').textContent,'Inside a Transformer Layer');
  key(get('Tokens').querySelector('[aria-pressed="true"]'),'End');assert.match(get('Target').textContent,/cold/);
  for(let i=0;i<examples.length;i++){get('PickerButton').click();get('PickerMenu').children[i].click();assert.match(get('Target').textContent,new RegExp(examples[i].text.split(' ')[examples[i].target]));assert.equal(get('PickerMenu').hidden,true);}
  get('PickerButton').click();key(get('PickerMenu'),'Home');assert.equal(w.document.activeElement,get('PickerMenu').firstElementChild);key(get('PickerMenu'),'Escape');assert.equal(w.document.activeElement,get('PickerButton'));
  key(get('Tokens').querySelector('[aria-pressed="true"]'),'Home');get('Reset').click();assert.match(get('Target').textContent,/She · 14 permitted/);
  dom.window.close();
});
test('finite playback traces both residual paths and cancels on navigation, reset, selection and motion change',()=>{
  const {dom,w,get,clocks,tick,motion,changeMotion}=fixture();
  get('Play').click();for(let i=0;i<3;i++)tick();assert.equal(get('Diagram').querySelectorAll('animateMotion').length,2);
  for(let i=0;i<5;i++)tick();assert.equal(clocks.size,0);assert.match(get('Explanation').textContent,/Updated token representation/);
  for(const cancel of [()=>get('Reset').click(),()=>get('Tokens').querySelector('[data-token="0"]').dispatchEvent(new w.MouseEvent('click')),()=>get('PickerMenu').children[1].click(),()=>w.document.getElementById('nextBtn').click()]){
    get('Play').click();assert.equal(clocks.size,1);cancel();assert.equal(clocks.size,0);assert.equal(get('Diagram').querySelectorAll('animateMotion').length,0);
  }
  w.document.getElementById('prevBtn').click();get('Play').click();motion.matches=true;changeMotion();assert.equal(clocks.size,0);assert.equal(get('Play').disabled,true);
  get('Step').click();assert.equal(get('Diagram').querySelectorAll('animateMotion').length,0);
  dom.window.close();
});
