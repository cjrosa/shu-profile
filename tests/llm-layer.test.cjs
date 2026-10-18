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
  return {norm1:ns[t],attention,residual1:r,norm2:norm(r),feedForward:ff,output:r.map((v,i)=>v+ff[i])};
}
test('every example and target matches independent pre-norm reference and color bounds',()=>{
  for(const example of examples){const words=example.text.split(' ');for(let t=0;t<words.length;t++){
    const approved=values.calculate(words,t),r=model.calculate(words,t),expected=reference(words,t);
    for(const key of ['norm1','attention','residual1','norm2','feedForward','output'])vectorNear(r[key],expected[key]);
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
test('complete architecture, direct exploration, exact vectors, and familiar header controls',()=>{
  const {dom,w,get,key}=fixture();
  assert.equal(get('Demo').hidden,false);
  assert.equal(get('Diagram').querySelectorAll('[role="button"]').length,8);
  assert.equal(get('Diagram').querySelectorAll('.layer-bypass').length,2);
  assert.equal(get('Inspection'),null);assert.equal(get('Calculations'),null);
  assert.equal(get('Demo').querySelectorAll('.map-transport').length,1);
  assert.ok(get('Play').closest('.tokens-input-header'));
  assert.equal(get('Demo').querySelectorAll('details').length,1);
  assert.equal(get('Demo').querySelector('details').open,false);
  assert.equal(get('Diagram').querySelectorAll('.rnn-svg-values').length,0);
  assert.deepEqual([...get('Diagram').querySelectorAll('.stack-token-label text')].map(n=>n.textContent),['they','they']);
  get('Diagram').querySelectorAll('[role="button"]').forEach(n=>{
    key(n,'Enter');assert.equal(n.getAttribute('aria-pressed'),'true');
    assert.ok(get('Explanation').textContent.length>40);
  });
  const r=model.calculate(examples[0].text.split(' '),5);
  vectorNear([...get('Diagram').querySelector('[role="button"][data-stage="updated"]').querySelectorAll('[data-state-value]')].map(n=>+n.dataset.stateValue),r.output);
  for(const stage of ['residual1','output']){
    get('Diagram').querySelector('[role="button"][data-stage="'+stage+'"]').dispatchEvent(new w.MouseEvent('click'));
    assert.equal(get('Diagram').querySelectorAll('.layer-bypass.selected').length,1);
    assert.equal(get('Diagram').querySelectorAll('.stack-phase-indicator').length,0);
  }
  dom.window.close();
});
test('token keyboard selection, example defaults, picker dismissal and reset',()=>{
  const {dom,w,get,key}=fixture();
  key(get('Tokens').querySelector('[aria-pressed="true"]'),'Home');assert.match(get('Target').textContent,/The · 1 permitted/);
  assert.equal(w.document.getElementById('sceneTitle').textContent,'Inside a Transformer Layer');
  key(get('Tokens').querySelector('[aria-pressed="true"]'),'End');assert.match(get('Target').textContent,/cold/);
  for(let i=0;i<examples.length;i++){get('PickerButton').click();get('PickerMenu').children[i].click();assert.match(get('Target').textContent,new RegExp(examples[i].text.split(' ')[examples[i].target]));assert.equal(get('PickerMenu').hidden,true);}
  get('PickerButton').click();key(get('PickerMenu'),'Home');assert.equal(w.document.activeElement,get('PickerMenu').firstElementChild);key(get('PickerMenu'),'Escape');assert.equal(w.document.activeElement,get('PickerButton'));
  key(get('Tokens').querySelector('[aria-pressed="true"]'),'Home');get('Reset').click();assert.match(get('Target').textContent,/they · 6 permitted/);
  dom.window.close();
});
test('seven ordered stages, simultaneous residual vectors, pause/resume and finite completion',()=>{
  const {dom,w,get,clocks,tick}=fixture();
  const expected=model.calculate(examples[0].text.split(' '),5),before=get('Diagram').querySelector('[data-stage="updated"]').innerHTML;
  let pauses=0,resumes=0;get('Diagram').firstElementChild.pauseAnimations=()=>pauses++;get('Diagram').firstElementChild.unpauseAnimations=()=>resumes++;
  get('Play').click();assert.match(get('Explanation').textContent,/Normalization before attention/);
  tick();assert.equal(get('Connections').querySelectorAll('.attention-connection').length,6);
  assert.equal(get('Connections').querySelectorAll('animateMotion').length,6);
  tick();assert.match(get('Explanation').textContent,/First residual/);
  for(const key of ['input','attention','residual1']){
    const group=get('Diagram').querySelector('.layer-transient[data-vector="'+key+'"]');
    vectorNear([...group.querySelectorAll('[data-state-value]')].map(n=>+n.dataset.stateValue),expected[key]);
  }
  const flows=[...get('Diagram').querySelectorAll('.layer-transient animateMotion')];
  assert.equal(flows[0].dataset.delay,'0.4');assert.equal(flows[1].dataset.delay,'0');
  assert.match(flows[0].getAttribute('path'),/^M390 96H150V294H390$/);
  assert.match(flows[1].getAttribute('path'),/V294$/);
  const snapshot=get('Diagram').innerHTML;
  get('Play').click();assert.equal(clocks.size,0);assert.equal(get('Diagram').innerHTML,snapshot);assert.ok(pauses>0);
  get('Play').click();assert.equal(clocks.size,1);assert.equal(get('Diagram').innerHTML,snapshot);assert.ok(resumes>0);
  tick();tick();tick();assert.match(get('Explanation').textContent,/Second residual/);
  const bypass=get('Diagram').querySelector('[data-vector="residual1"]');
  vectorNear([...bypass.querySelectorAll('[data-state-value]')].map(n=>+n.dataset.stateValue),expected.residual1);
  assert.equal(bypass.querySelector('animateMotion').getAttribute('path'),'M390 340H150V650H390');
  tick();tick();assert.equal(clocks.size,0);assert.equal(get('Play').getAttribute('aria-label'),'Replay');
  assert.equal(get('Step').disabled,true);
  assert.equal(get('Phase'),null);
  assert.equal(get('Diagram').querySelector('[data-stage="updated"]').innerHTML,before);
  dom.window.close();
});
test('step, reset, rapid selection, navigation and reduced motion clear transient state',()=>{
  const {dom,w,get,clocks,motion,changeMotion}=fixture();
  for(const cancel of [()=>get('Reset').click(),()=>get('Tokens').querySelector('[data-token="0"]').dispatchEvent(new w.MouseEvent('click')),()=>get('PickerMenu').children[1].click(),()=>get('Diagram').querySelector('[data-stage="norm2"][role="button"]').dispatchEvent(new w.MouseEvent('click')),()=>w.document.getElementById('nextBtn').click()]){
    get('Play').click();assert.equal(clocks.size,1);cancel();assert.equal(clocks.size,0);assert.equal(get('Demo').querySelectorAll('.layer-transient').length,0);
  }
  w.document.getElementById('prevBtn').click();get('Reset').click();
  const names=['Normalization before attention','Self-attention','First residual','Normalization before feed-forward','Feed-forward network','Second residual','Updated token representation'];
  for(const name of names){get('Step').click();assert.ok(get('Explanation').textContent.startsWith(name));assert.equal(clocks.size,0);assert.equal(get('Demo').querySelectorAll('animateMotion').length,0);}
  get('Reset').click();assert.equal(get('Phase'),null);
  get('Play').click();motion.matches=true;changeMotion();assert.equal(clocks.size,0);assert.equal(get('Demo').querySelectorAll('.layer-transient').length,0);
  get('Play').click();assert.equal(get('Demo').querySelectorAll('animateMotion').length,0);
  get('Reset').click();dom.window.close();
});

test('all example targets keep badges and vector colors tied to the unchanged calculations',()=>{
  const {dom,w,get}=fixture(true);
  for(let e=0;e<examples.length;e++){
    get('PickerMenu').children[e].click();const words=examples[e].text.split(' ');
    for(let t=0;t<words.length;t++){
      get('Tokens').querySelector('[data-token="'+t+'"]').dispatchEvent(new w.MouseEvent('click'));
      const r=model.calculate(words,t);
      assert.deepEqual([...get('Diagram').querySelectorAll('.stack-token-label text')].map(n=>n.textContent),[words[t],words[t]]);
      for(const [stage,key] of [['input','input'],['updated','output']]){
        const cells=[...get('Diagram').querySelector('[role="button"][data-stage="'+stage+'"]').querySelectorAll('[data-state-value]')];
        vectorNear(cells.map(n=>+n.dataset.stateValue),r[key]);
        cells.forEach((n,i)=>{const v=r[key][i];assert.equal(n.querySelector('rect').getAttribute('fill'),Math.abs(v)<.0005?'#e1e5e3':`hsl(${v<0?270:215} 45% ${85-45*Math.abs(v)/4}%)`);});
      }
      get('Diagram').querySelector('[role="button"][data-stage="attention"]').dispatchEvent(new w.MouseEvent('click'));
      assert.equal(get('Connections').querySelectorAll('[data-source]').length,t+1);
    }
  }
  get('Play').click();assert.equal(get('Demo').querySelectorAll('animateMotion').length,0);
  get('Reset').click();dom.window.close();
});

test('residual departures run once and subsequent stages continue at their arrival points',()=>{
  const {dom,get,tick}=fixture();
  get('Play').click();tick();tick();
  for(const animation of get('Diagram').querySelectorAll('.layer-transient animate,.layer-transient animateMotion'))assert.equal(animation.getAttribute('begin'),'indefinite');
  assert.equal(get('Diagram').querySelector('[data-vector="residual1"] animateMotion').getAttribute('path'),'M390 310V388');
  tick();assert.equal(get('Diagram').querySelector('.layer-transient:not(.layer-residual-flight) animateMotion').getAttribute('path'),'M390 388V394');
  tick();tick();assert.equal(get('Diagram').querySelector('[data-vector="output"] animateMotion').getAttribute('path'),'M390 666V700');
  tick();assert.equal(get('Diagram').querySelector('animateMotion').getAttribute('path'),'M390 700V706');
  get('Reset').click();dom.window.close();
});

test('slow bypass flights persist across processing stages and meet each main output once',()=>{
  const {dom,w,get,tick}=fixture();
  w.SVGElement.prototype.beginElementAt=function(){this.dataset.starts=String(Number(this.dataset.starts||0)+1);};
  const flight=key=>get('Diagram').querySelector('.layer-residual-flight[data-vector="'+key+'"]');
  const arrival=node=>Number(node.dataset.delay)+parseFloat(node.getAttribute('dur'));
  get('Play').click();const first=flight('input'),firstMotion=first.querySelector('animateMotion');
  near(arrival(firstMotion),1.3+1.3+.85);
  tick();assert.equal(flight('input'),first);
  tick();assert.equal(flight('input'),first);assert.equal(firstMotion.dataset.starts,'1');
  const second=flight('residual1'),secondMotion=second.querySelector('animateMotion');
  near(arrival(secondMotion),1.6+1.3+3.1+.85);
  assert.ok(parseFloat(secondMotion.getAttribute('dur'))>5);
  tick();assert.equal(flight('input'),null);assert.equal(flight('residual1'),second);
  tick();assert.equal(flight('residual1'),second);
  tick();assert.equal(flight('residual1'),second);assert.equal(secondMotion.dataset.starts,'1');
  tick();assert.equal(flight('residual1'),null);
  get('Reset').click();assert.equal(get('Diagram').querySelectorAll('.layer-residual-flight').length,0);
  dom.window.close();
});
