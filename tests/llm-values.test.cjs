const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('../tools/llm-tokenizer/node_modules/jsdom');
const model=require('../assets/js/ai100/llm-values-model');
const qk=require('../assets/js/ai100/llm-qk-model');
const {examples}=require('../assets/js/ai100/llm-self-attention');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
function fixture(){
 const dom=new JSDOM(fs.readFileSync('ai100/llm_explorer.html','utf8'),{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost/ai100/llm_explorer.html?chapter=4&scene=3'});
 const w=dom.window;w.matchMedia=()=>({matches:true});
 for(const name of ['llm-explorer','llm-qk-model','llm-values-model','llm-values'])w.eval(fs.readFileSync(`assets/js/ai100/${name}.js`,'utf8'));
 const get=n=>w.document.getElementById('values'+n);
 const click=node=>node.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
 return {dom,w,get,click};
}
test('all examples/targets: independent projection, identical attention, exact causal weighted sum',()=>{
 for(const example of examples){const words=example.text.split(' ');for(let t=0;t<words.length;t++){
  const r=model.calculate(words,t);assert.deepEqual(r.weights,qk.calculate(words,t).weights);
  const expected=[0,0];r.representations.forEach(([a,b,c],i)=>{
   const v=[.5*a-.5*c,.5*b-.25*c];assert.deepEqual(r.values[i],v);
   v.forEach((n,d)=>{near(r.contributions[i][d],n*r.weights[i]);if(i<=t)expected[d]+=n*r.weights[i];else assert.equal(Math.abs(r.contributions[i][d]),0);assert.ok(Math.abs(n)<=1);});
  });r.output.forEach((n,d)=>near(n,expected[d]));assert.deepEqual(r,model.calculate(words,t));
 }}
 const r=model.calculate(examples[0].text.split(' '),5);assert.deepEqual(r.values[3],[.9,-.05]);
 // More weight can still give a smaller coordinate contribution.
 assert.ok(r.weights[3]>r.weights[5]);assert.ok(Math.abs(r.contributions[3][1])<Math.abs(r.contributions[5][1]));
});
test('immediate output, source/bar/cell selection, hover and optional calculation stay synchronized',()=>{
 const {dom,w,get,click}=fixture();try{
 assert.equal(get('Demo').hidden,false);assert.equal(get('Demo').querySelectorAll('details').length,1);assert.equal(get('Demo').querySelector('details').open,false);
 assert.ok(!get('Output').closest('details'));assert.equal(get('Demo').parentElement,get('Demo').ownerDocument.getElementById('qkDemo').parentElement);
 const output=get('Output').dataset.output;const source=get('VisualComparison').querySelector('.values-source[data-source="1"]');click(source.querySelector('rect'));
 assert.match(get('WeightMeaningIs').textContent,/team/);assert.ok(get('Bar').querySelector('[data-source="1"]').classList.contains('inspected'));
 assert.equal(get('Output').dataset.output,output);
 const segment=get('Bar').querySelector('[data-source="3"]');click(segment);assert.match(get('Comparison').textContent,/pizzas/);
 const cell=get('VisualComparison').querySelector('[data-source="1"] [data-coordinate]');cell.focus();assert.match(get('WeightMeaningIs').textContent,/team/);
 cell.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.match(get('WeightMeaningIs').textContent,/team/);
 get('Demo').querySelector('details').open=true;click(segment);assert.equal(get('Demo').querySelector('details').open,true);
 for(const cell of get('VisualComparison').querySelectorAll('[data-state-value]')){
  const v=Number(cell.dataset.stateValue);const color=Math.abs(v)<.0005?'#e1e5e3':`hsl(${v<0?270:215} 45% ${85-45*Math.abs(v)}%)`;
  assert.equal(cell.querySelector('rect').getAttribute('fill'),color);assert.equal(cell.querySelector('rect').getAttribute('width'),'50');
 }
 }finally{dom.window.close();}
});
test('all targets/examples, reset, keyboard and rapid changes leave no stale output or masked source',()=>{
 const {dom,w,get,click}=fixture();try{
 for(let e=0;e<examples.length;e++){
  click(get('PickerButton'));click(get('PickerMenu').children[e]);
  const words=examples[e].text.split(' ');
  for(let t=0;t<words.length;t++){
   click(get('Diagram').querySelector(`[data-token="${t}"]`));
   const r=model.calculate(words,t),actual=get('Output').dataset.output.split(',').map(Number);
   actual.forEach((n,d)=>near(n,r.output[d]));assert.equal(get('VisualComparison').querySelectorAll('.values-source').length,t+1);
   [...get('Bar').children].forEach((node,i)=>near(Number(node.dataset.weight),r.weights[i]));
   assert.match(get('WeightMeaningIs').textContent,new RegExp(words[t].replace('.','\\.')));
   assert.equal(get('Output').querySelector('text').textContent,r.output[0].toFixed(3));
  }
  click(get('Reset'));assert.ok(get('Diagram').querySelector(`[data-token="${examples[e].target}"]`).classList.contains('selected'));
 }
 const target=get('Diagram').querySelector('.selected');target.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert.equal(get('Bar').children.length,1);
 assert.equal(w.document.activeElement.dataset.token,'0');
 get('PickerButton').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.equal(get('PickerMenu').hidden,false);
 get('PickerMenu').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(get('PickerMenu').hidden,true);
 }finally{dom.window.close();}
});
