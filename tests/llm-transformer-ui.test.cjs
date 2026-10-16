const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('../tools/llm-tokenizer/node_modules/jsdom');
function fixture(reduced = false) {
  const dom = new JSDOM(fs.readFileSync('ai100/llm_explorer.html','utf8'), {runScripts:'outside-only', url:'http://localhost/ai100/llm_explorer.html?chapter=3&scene=3'});
  const w = dom.window; w.matchMedia = () => ({matches:reduced});
  for (const name of ['llm-explorer','llm-transformer']) w.eval(fs.readFileSync(`assets/js/ai100/${name}.js`,'utf8'));
  const get = name => w.document.getElementById('transformer'+name);
  const change = (name,value,event='change') => {get(name).value=value; get(name).dispatchEvent(new w.Event(event));};
  return {dom,w,get,change};
}
test('scene opens immediately; switching architecture preserves selected sentence and target', () => {
  const {dom,w,get}=fixture();
  assert.equal(get('Demo').hidden,false);
  assert.equal(w.document.querySelector('.placeholder').hidden,true);
  assert.equal([...get('Tokens').children].map(t=>t.textContent).join(' '),'Marie arrived at the conference after a long flight. She was exhausted.');
  assert.equal(get('Tokens').querySelector('[aria-pressed="true"]').textContent,'She');
  assert.match(get('Summary').textContent,/9 sequential updates/);
  assert.equal(get('Diagram').querySelectorAll('.transformer-path').length,1);
  get('RNN').click();
  assert.match(get('Diagram').textContent,/8 intermediate/);
  assert.equal(get('Diagram').querySelectorAll('.transformer-path').length,2);
  assert.equal(get('Tokens').querySelector('[aria-pressed="true"]').textContent,'She');
  w.document.getElementById('nextBtn').click(); assert.equal(get('Demo').hidden,true);
  w.document.getElementById('prevBtn').click(); assert.equal(get('Demo').hidden,false);
  assert.equal(get('RNN').getAttribute('aria-pressed'),'true');
  dom.window.close();
});
test('distance changes recompute exact path lengths and keep She selected', () => {
  const {dom,get,change}=fixture();
  for (const value of ['0','1','2','3']) {
    change('Distance',value,'input');
    const index=[...get('Tokens').children].findIndex(t=>t.textContent==='She');
    assert.match(get('Summary').textContent,new RegExp(`${index} sequential updates`));
    assert.equal(get('Tokens').querySelector('[aria-pressed="true"]').textContent,'She');
    assert.equal(get('Preset').value,value);
    assert.match(get('DistanceValue').textContent,new RegExp(`^${index-1} words`));
  }
  change('Preset','0'); assert.equal(get('Distance').value,'0');
  dom.window.close();
});
test('causal context boundary, source and adjacent selections, keyboard and reduced motion', () => {
  const {dom,w,get,change}=fixture(true);
  change('Context','8');
  assert.equal(get('Diagram').querySelectorAll('.transformer-path').length,0);
  assert.match(get('Status').textContent,/outside/);
  get('RNN').click(); assert.equal(get('Diagram').querySelectorAll('.transformer-path').length,2);
  get('Attention').click();
  get('Tokens').children[7].click(); assert.equal(get('Diagram').querySelectorAll('.transformer-path').length,1);
  get('Tokens').children[8].click(); assert.equal(get('Diagram').querySelectorAll('.transformer-path').length,0);
  get('Tokens').children[0].click(); assert.match(get('Summary').textContent,/0 sequential updates/);
  get('Tokens').children[0].dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal(get('Demo').hidden,false);
  assert.equal(get('Tokens').querySelector('[aria-pressed="true"]').textContent,'arrived');
  get('RNN').click(); assert.match(get('Summary').textContent,/1 sequential update from/);
  assert.equal(get('Diagram').querySelectorAll('.transformer-path').length,1);
  assert.equal(get('Diagram').querySelector('animateMotion'),null);
  dom.window.close();
});
