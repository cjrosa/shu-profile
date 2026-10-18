const fs=require('fs'),test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('../tools/llm-tokenizer/node_modules/jsdom');
function fixture(){
 const dom=new JSDOM(fs.readFileSync('ai100/llm_explorer.html','utf8'),{runScripts:'outside-only',url:'http://localhost/ai100/llm_explorer.html?chapter=4&scene=4'});
 const w=dom.window;
 for(const n of ['llm-explorer','llm-qk-model','llm-stack'])w.eval(fs.readFileSync('assets/js/ai100/'+n+'.js','utf8'));
 return {dom,w,get:n=>w.document.getElementById('stack'+n),key:(n,key)=>n.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true}))};
}
test('stack scene, keyboard selection, flow edges, and exact representation handoff',()=>{
 const {dom,w,get,key}=fixture();
 assert.equal(get('Demo').hidden,false);
 assert.equal(w.document.querySelector('.placeholder').hidden,true);
 assert.match(w.document.getElementById('sceneCount').textContent,/Scene 4 of 6/);
 const blocks=[...get('Diagram').querySelectorAll('[data-stage]')];assert.equal(blocks.length,3);
 let previousOutput;
 blocks.forEach((block,i)=>{
  key(block,'Enter');assert.equal(block.getAttribute('aria-pressed'),'true');
  assert.equal(get('Diagram').querySelectorAll('.layer-path.selected').length,i===2?3:2);
  assert.equal(get('Diagram').querySelectorAll('[data-stage]').length,3);
  const values=[...get('Inspection').querySelectorAll('[data-state-value]')].map(n=>n.dataset.stateValue);
  if(previousOutput)assert.deepEqual(values.slice(0,3),previousOutput);
  previousOutput=values.slice(3,6);
  assert.deepEqual(values.slice(6),previousOutput);
  assert.match(get('Inspection').textContent,i<2?new RegExp(`Layer ${i+1} output = Layer ${i+2} input`):/Final output to prediction processing/);
  assert.match(get('Explanation').textContent,new RegExp('Transformer Layer '+(i+1)));
 });
 const output=[...get('Diagram').querySelectorAll('[data-tooltip^="Stack output"]')].map(n=>n.dataset.stateValue);
 assert.deepEqual(output,previousOutput);
 get('PickerButton').click();key(get('Picker'),'Escape');assert.equal(get('PickerMenu').hidden,true);
 get('PickerButton').click();get('PickerMenu').children[2].click();assert.match(get('Target').textContent,/chased/);
 key(get('Tokens').querySelector('[data-token][tabindex="0"]'),'End');assert.match(get('Target').textContent,/ball/);
 get('Reset').click();assert.match(get('Target').textContent,/they/);
 get('PickerButton').click();w.document.getElementById('nextBtn').click();assert.equal(get('PickerMenu').hidden,true);
 assert.equal(w.document.getElementById('layerDemo').hidden,false);assert.match(w.location.search,/scene=5/);
 w.document.getElementById('prevBtn').click();assert.equal(get('Demo').hidden,false);
 dom.window.close();
});

test('every example and token preserves exact handoffs and tracked token labels',()=>{
 const {dom,w,get}=fixture();
 const values=selector=>[...get('Diagram').querySelectorAll(selector)].map(n=>n.dataset.stateValue);
 for(let example=0;example<4;example++){
  get('PickerMenu').children[example].click();
  const count=get('Tokens').querySelectorAll('[data-token]').length;
  for(let token=0;token<count;token++){
   get('Tokens').querySelector(`[data-token="${token}"]`).dispatchEvent(new w.MouseEvent('click'));
   const word=get('Tokens').querySelector(`[data-token="${token}"] text`).textContent;
   let previous;
   for(let layer=0;layer<3;layer++){
    const block=get('Diagram').querySelector(`[data-stage="${layer}"]`);block.dispatchEvent(new w.MouseEvent('click'));
    const input=values('[data-tooltip^="Selected layer input"]'),output=values('[data-tooltip^="Selected layer output"]');
    if(previous)assert.deepEqual(input,previous);
    assert.deepEqual(values('[data-handoff-vector] [data-state-value]'),output);
    assert.ok(get('Explanation').textContent.includes(word));
    assert.equal(get('OutputTitle').textContent,'Updated representation');
    assert.equal(get('OutputLabel').querySelector('text').textContent,word);
    assert.equal(get('TokenLabel').querySelector('text').textContent,word);
    previous=output;
   }
   assert.deepEqual(values('[data-tooltip^="Stack output"]'),previous);
  }
 }
 assert.match(get('Diagram').textContent,/Toward Next-Token Prediction/);
 assert.doesNotMatch(get('Inspection').textContent,/Layer 4/);
 dom.window.close();
});

test('attention availability is causal, layer-specific, and source inspection preserves outputs',()=>{
 const {dom,w,get,key}=fixture();
 const vals=n=>[...n.querySelectorAll('[data-state-value]')].map(c=>c.dataset.stateValue);
 for(let example=0;example<4;example++){
  get('PickerMenu').children[example].click();
  const count=get('Tokens').querySelectorAll('[data-token]').length;
  for(let target=0;target<count;target++){
   get('Tokens').querySelector(`[data-token="${target}"]`).dispatchEvent(new w.MouseEvent('click'));
   for(let layer=0;layer<3;layer++){
    key(get('Diagram').querySelector(`[data-stage="${layer}"]`),'Enter');
    assert.equal(get('Connections').dataset.layer,String(layer));
    const paths=[...get('Connections').querySelectorAll('.attention-connection')];
    assert.deepEqual(paths.map(n=>Number(n.dataset.source)),Array.from({length:target+1},(_,i)=>i));
    assert.ok(paths.every(n=>n.getAttribute('stroke-width')==='2'&&!n.hasAttribute('data-weight')));
    assert.equal(get('Tokens').querySelectorAll('.future').length,count-target-1);
    assert.equal(get('Connections').querySelectorAll('[data-source]').length,target+1);
    const output=vals(get('Inspection'));
    const source=get('Tokens').querySelector(`[data-token="${target}"]`);
    source.dispatchEvent(new w.MouseEvent('click',{shiftKey:true}));
    assert.equal(source.getAttribute('aria-pressed'),'true');
    assert.equal(get('Demo').querySelectorAll('[data-token]').length,count);
    assert.equal(get('Attention'),null);
    assert.deepEqual(vals(get('Inspection')),output);
    assert.equal(get('Connections').querySelectorAll('.attention-connection.inspected').length,1);
    assert.match(get('Explanation').textContent,layer===0?/initial representation/:new RegExp('updated by Layer '+layer));
   }
  }
 }
 get('Reset').click();assert.match(get('Target').textContent,/they/);assert.equal(get('Connections').dataset.layer,'0');
 assert.equal(get('Connections').querySelectorAll('[aria-pressed="true"]').length,0);
 dom.window.close();
});

test('connections follow measured wrapped tiles and resized layer positions',()=>{
 const {dom,w,get,key}=fixture();
 let offset=0;
 get('Visual').getBoundingClientRect=()=>({left:10,top:20,width:940,height:800});
 [...get('Tokens').querySelectorAll('[data-token] rect')].forEach((n,i)=>n.getBoundingClientRect=()=>({left:30+i%3*120,top:30+Math.floor(i/3)*72,bottom:68+Math.floor(i/3)*72,width:104,height:38}));
 get('Diagram').querySelectorAll('[data-stage] rect').forEach((n,i)=>n.getBoundingClientRect=()=>({left:200+offset,top:300+i*86,width:240,height:42}));
 key(get('Diagram').querySelector('[data-stage="1"]'),'Enter');
 const paths=()=>[...get('Connections').querySelectorAll('path')].map(n=>n.getAttribute('d'));
 const initial=paths();assert.match(initial[0],/^M72 48/);assert.match(initial[3],/^M72 120/);
 assert.ok(initial.every(d=>d.endsWith('H430')));
 offset=40;w.dispatchEvent(new w.Event('resize'));assert.ok(paths().every(d=>d.endsWith('H470')));
 const target=get('Tokens').querySelector('[aria-pressed="true"]').dataset.token;
 const source=get('Tokens').querySelector('[data-token="3"]');source.dispatchEvent(new w.MouseEvent('click',{shiftKey:true}));
 assert.equal(get('Tokens').querySelector('[data-token][aria-pressed="true"]').dataset.token,target);
 assert.equal(get('Connections').dataset.layer,'1');assert.match(get('Explanation').textContent,/pizzas.*they.*Layer 2/);
 dom.window.close();
});
