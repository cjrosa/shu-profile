const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('../tools/llm-tokenizer/node_modules/jsdom');
const vendor = require('../assets/js/vendor/cl100k-tokenizer.js');
const engine = require('../assets/js/ai100/llm-token-engine.js');
function fixture(local = true) {
  const dom = new JSDOM(fs.readFileSync('ai100/llm_explorer.html','utf8'), {runScripts:'outside-only', url:'http://localhost/ai100/llm_explorer.html?chapter=2&scene=4'});
  const w = dom.window;
  Object.assign(w, {TextEncoder, TextDecoder});
  if (local) w.LLMTokenizerVendor = vendor;
  for (const file of ['llm-explorer','llm-token-engine','llm-context']) w.eval(fs.readFileSync(`assets/js/ai100/${file}.js`,'utf8'));
  const get = id => w.document.getElementById('context' + id);
  const event = (id, type, value) => {get(id).value = value; get(id).dispatchEvent(new w.Event(type, {bubbles:true}));};
  return {dom,w,get,event};
}
const flush = async () => {for(let i=0;i<8;i++) await Promise.resolve();};
const ids = el => [...el.children].map(t => Number(t.dataset.id));
test('real counts and suffix boundaries update immediately at every capacity', async () => {
  const {dom,get,event} = fixture(); await flush();
  assert.equal(get('Demo').hidden,false);
  const text = get('Input').value, expected = vendor.create().encode(text);
  assert.ok(expected.length > 24);
  for(let size=1;size<=64;size++) {
    event('Size','input',size);
    assert.deepEqual(ids(get('Included')),expected.slice(-size));
    assert.deepEqual(ids(get('Excluded')),expected.slice(0,Math.max(0,expected.length-size)));
    assert.equal(Number(get('Meter').getAttribute('aria-valuenow')),Math.min(size,expected.length));
    assert.equal(Number(get('Meter').getAttribute('aria-valuemax')),size);
    assert.equal(get('Input').value,text);
  }
  assert.match(get('Feedback').textContent,/All tokens fit/);
  event('Size','input',1); assert.match(get('Feedback').textContent,/first sentence/);
  dom.window.close();
});
test('all examples reset capacity; Marie feedback follows its actual byte boundary',async()=>{
  const {dom,get,event} = fixture(); await flush();
  for(const preset of ['short','long','marie','own']) {
    event('Preset','change',preset);await flush();
    assert.equal(get('Size').value,'24');
    const expected=vendor.create().encode(get('Input').value);
    assert.deepEqual([...ids(get('Excluded')),...ids(get('Included'))],expected);
    assert.equal(get('Input').readOnly,preset!=='own');
  }
  event('Preset','change','marie');await flush();
  const result=engine.analyze(get('Input').value,vendor.create());
  event('Size','input',result.tokens.length);assert.match(get('Feedback').textContent,/All tokens fit/);
  const removed=result.tokens.findIndex(t=>t.start>=5);
  event('Size','input',result.tokens.length-removed);
  assert.match(get('Feedback').textContent,/Marie is outside context/);
  assert.equal(Number(get('Included').firstChild.dataset.index),removed);
  get('Reset').click();await flush();assert.equal(get('Preset').value,'long');assert.equal(get('Size').value,'24');
  dom.window.close();
});
test('custom input preserves exact punctuation, whitespace, Unicode and safe literal text',async()=>{
  const {dom,get,event} = fixture();await flush();event('Preset','change','own');
  for(const text of ['', ' \t\n', 'Pizza, pizza! 🧑🏽‍💻 中文 café', '<img src=x onerror=alert(1)>', '<|endoftext|>', 'a '.repeat(300)]) {
    event('Input','input',text);await flush();
    const expected=engine.analyze(text,vendor.create());
    assert.deepEqual([...ids(get('Excluded')),...ids(get('Included'))],expected.tokens.map(t=>t.id));
    assert.equal(get('Results').querySelector('img'),null);
    if(expected.tokens.some(t=>t.text===null)) assert.match(get('Results').textContent,/bytes/);
    event('Size','input',get('Size').max);assert.equal(get('Excluded').children.length,0);
  }
  event('Input','input','a'.repeat(601));assert.match(get('Status').textContent,/600/);assert.equal(get('Results').hidden,true);
  event('Input','input','');assert.match(get('Status').textContent,/No tokens/);assert.equal(get('Feedback').hidden,true);
  dom.window.close();
});
test('pending load, rapid edits, failure retry and reset cannot publish stale tokens',async()=>{
  const {dom,w,get,event}=fixture(false);
  event('Preset','change','own');event('Input','input','old');event('Input','input','new');
  w.LLMTokenizerVendor=vendor;
  w.document.querySelector('script[src="../assets/js/vendor/cl100k-tokenizer.js"]').onload();await flush();
  assert.deepEqual(ids(get('Included')),vendor.create().encode('new'));
  get('Reset').click();await flush();assert.ok(get('Excluded').children.length>0);dom.window.close();
  const f=fixture(false);
  f.w.document.querySelector('script[src="../assets/js/vendor/cl100k-tokenizer.js"]').onerror();await flush();
  assert.equal(f.get('Retry').hidden,false);assert.equal(f.get('Results').hidden,true);
  f.w.LLMTokenizerVendor=vendor;f.get('Retry').click();await flush();assert.equal(f.get('Results').hidden,false);
  f.dom.window.close();
});
test('native controls have labels, scene keyboard isolation and navigation preserve exploration',async()=>{
  const {dom,w,get,event}=fixture();await flush();
  for(const id of ['Input','Preset','Size']) assert.ok(w.document.querySelector(`label[for="context${id}"]`));
  event('Size','input',12);get('Size').focus();
  get('Size').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.match(w.location.search,/scene=4/);
  w.document.getElementById('prevBtn').click();assert.equal(get('Demo').hidden,true);
  w.document.getElementById('nextBtn').click();assert.equal(get('Demo').hidden,false);assert.equal(get('Size').value,'12');
  assert.equal(get('Meter').getAttribute('aria-valuenow'),'12');
  assert.equal(w.document.querySelector('.progress').getAttribute('aria-label'),'Lesson progress');
  w.document.getElementById('nextBtn').click();assert.match(w.location.search,/chapter=3/);assert.equal(get('Demo').hidden,true);
  dom.window.close();
});
