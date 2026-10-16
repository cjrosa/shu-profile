const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('../tools/llm-tokenizer/node_modules/jsdom');
const {examples, distribution} = require('../assets/js/ai100/llm-self-attention.js');
function fixture() {
  const dom=new JSDOM(fs.readFileSync('ai100/llm_explorer.html','utf8'),{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost/ai100/llm_explorer.html?chapter=4&scene=1'});
  const w=dom.window;
  for(const name of ['llm-explorer','llm-self-attention'])w.eval(fs.readFileSync(`assets/js/ai100/${name}.js`,'utf8'));
  const get=name=>w.document.getElementById('selfAttention'+name);
  const choose=i=>get('Diagram').querySelector(`[data-token="${i}"]`).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  return {dom,w,get,choose};
}
test('all targets have deterministic positive causal weights including self, normalized before rounding',()=>{
  examples.forEach((example,e)=>example.text.split(' ').forEach((_,t)=>{
    const weights=distribution(e,t);
    assert.deepEqual(weights,distribution(e,t));
    assert.ok(Math.abs(weights.reduce((a,b)=>a+b,0)-1)<1e-12);
    weights.forEach((w,i)=>assert.ok(i<=t?w>0:w===0));
  }));
  assert.equal(distribution(0,5)[3],.45);
  assert.notEqual(distribution(0,5)[3],distribution(0,7)[3]);
});
test('scene loads fully with they selected and no weight or calculation editors',()=>{
  const {dom,get}=fixture();
  assert.equal(get('Demo').hidden,false);
  assert.match(get('Target').textContent,/they/);
  assert.equal(get('Diagram').querySelectorAll('[data-token]').length,8);
  assert.equal(get('Diagram').querySelectorAll('[data-inspect]').length,6);
  assert.equal(get('Demo').querySelectorAll('input,textarea,[contenteditable],[role="slider"],[role="spinbutton"]').length,0);
  assert.equal(dom.window.document.querySelector('.placeholder').hidden,true);
  dom.window.close();
});
test('every example and target keeps cell percentages and connection strength synchronized',()=>{
  const {dom,get,choose}=fixture();
  examples.forEach((example,e)=>{
    get('PickerMenu').children[e].click();
    example.text.split(' ').forEach((_,t)=>{
      choose(t);
      const weights=distribution(e,t),paths=[...get('Diagram').querySelectorAll('.attention-connection')],rows=[...get('Diagram').querySelectorAll('[data-token]')].slice(0,t+1);
      assert.equal(paths.length,t+1);assert.equal(rows.length,t+1);
      const segments=[...get('Bar').children];
      assert.equal(segments.length,t+1);
      assert.ok(Math.abs(segments.reduce((sum,node)=>sum+parseFloat(node.style.width),0)-100)<1e-10);
      rows.forEach((row,i)=>{
        assert.equal(segments[i].style.getPropertyValue('--word-color'),row.style.getPropertyValue('--word-color'));
        assert.ok(Math.abs(parseFloat(segments[i].style.width)-weights[i]*100)<1e-10);
        assert.equal(segments[i].textContent,example.text.split(' ')[i]);
        assert.equal(Number(row.dataset.weight),weights[i]);
        assert.equal(row.querySelector('.attention-percent').textContent,(weights[i]*100).toFixed(1)+'%');
        assert.equal(Number(paths[i].getAttribute('stroke-width')),1.25+8*weights[i]);
        assert.equal(Number(paths[i].dataset.source),i);
      });
    });
  });
  dom.window.close();
});
test('source inspection does not mutate weights, targets, or SVG strength',()=>{
  const {dom,w,get}=fixture();
  const before=[...get('Diagram').querySelectorAll('[data-token]')].map(row=>row.dataset.weight);
  get('Diagram').querySelector('[data-inspect="3"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  assert.match(get('Inspection').textContent,/pizzas.*45.0%/);
  assert.equal(get('Diagram').querySelector('path.inspected').dataset.source,'3');
  get('Diagram').querySelector('[data-token="1"]').dispatchEvent(new w.Event('pointerenter'));
  assert.match(get('Inspection').textContent,/team.*15.0%/);
  get('Diagram').querySelector('[data-token="1"]').dispatchEvent(new w.Event('pointerleave'));
  assert.match(get('Inspection').textContent,/pizzas/);
  assert.deepEqual([...get('Diagram').querySelectorAll('[data-token]')].map(row=>row.dataset.weight),before);
  assert.match(get('Target').textContent,/they/);
  get('Bar').children[1].click();
  assert.match(get('Inspection').textContent,/team.*15.0%/);
  assert.equal(get('Diagram').querySelector('path.inspected').dataset.source,'1');
  assert.match(get('Target').textContent,/they/);
  dom.window.close();
});
test('keyboard target selection, source focus, example navigation, and reset',()=>{
  const {dom,w,get}=fixture();
  get('Diagram').querySelector('[data-token="5"]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true}));
  assert.match(get('Target').textContent,/cold/);
  assert.equal(w.document.activeElement.dataset.token,'7');
  get('Diagram').querySelector('[data-inspect="3"]').focus();
  assert.match(get('Inspection').textContent,/pizzas.*40.0%/);
  get('PickerButton').click();
  get('Picker').dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true}));
  assert.equal(w.document.activeElement.textContent,'Longer Context');
  w.document.activeElement.click();
  assert.equal(get('PickerMenu').hidden,true);
  assert.match(get('Target').textContent,/She/);
  get('Diagram').querySelector('[data-token="13"]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));
  assert.match(get('Target').textContent,/Marie/);
  get('Reset').click();
  assert.match(get('Target').textContent,/She/);
  assert.equal(get('Diagram').querySelector('path.inspected'),null);
  get('PickerButton').click();
  get('Picker').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(get('PickerMenu').hidden,true);
  assert.equal(w.document.activeElement,get('PickerButton'));
  dom.window.close();
});
test('rapid target/example changes have no queued animation and latest target wins',()=>{
  const {dom,w,get,choose}=fixture();
  w.setTimeout=()=>{throw new Error('Unexpected animation timer');};
  w.requestAnimationFrame=()=>{throw new Error('Unexpected animation frame');};
  for(let i=0;i<30;i++){get('PickerMenu').children[i%4].click();choose(i%5);}
  choose(0);
  assert.equal(get('Diagram').querySelectorAll('[data-inspect]').length,1);
  assert.equal(get('Diagram').querySelector('[data-inspect]').textContent,'100.0%');
  dom.window.close();
});
