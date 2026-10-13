// npm ci --prefix tools/llm-tokenizer before running this DOM integration suite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('../tools/llm-tokenizer/node_modules/jsdom');
const vendor = require('../assets/js/vendor/cl100k-tokenizer.js');
async function fixture(fail=false) {
  const dom = new JSDOM(fs.readFileSync('ai100/llm_explorer.html','utf8'),{runScripts:'outside-only',url:'http://localhost/ai100/llm_explorer.html?chapter=2&scene=1'});
  const w=dom.window;
  Object.assign(w,{TextEncoder,TextDecoder});
  w.matchMedia=()=>({matches:true});
  if(!fail) w.LLMTokenizerVendor=vendor;
  for(const name of ['llm-explorer','llm-token-engine','llm-tokens']) w.eval(fs.readFileSync(`assets/js/ai100/${name}.js`,'utf8'));
  await Promise.resolve(); await Promise.resolve();
  return {w,dom,get:id=>w.document.getElementById(id),input(text){const el=w.document.getElementById('tokensInput');el.value=text;el.dispatchEvent(new w.Event('input'));}};
}
test('automatic comparison, overlap, changes, discovery, reset and empty input',async()=>{
  const f=await fixture(), {get}=f;
  assert.equal(get('tokensDemo').hidden,false);
  assert.equal(get('tokensResults').hidden,false);
  assert.equal(get('tokensReveal'),null);
  assert.equal(get('tokensPrediction'),null);
  assert.equal(get('tokensWordCount').textContent,'6');assert.equal(get('tokensPieces').children.length,8);
  get('tokensWords').children[1].click();
  assert.equal(get('tokensPieces').querySelectorAll('.related').length,2);
  assert.equal(get('tokensPieces').querySelectorAll('[aria-pressed="true"]').length,2);
  get('tokensPieces').children[2].click();
  assert.equal(get('tokensWords').querySelectorAll('[aria-pressed="true"]').length,1);
  assert.equal(get('tokensWords').children[1].getAttribute('aria-pressed'),'true');
  assert.equal(get('tokensSpan').textContent,get('tokensInput').value);
  f.input('dog');assert.equal(get('tokensResults').hidden,false);assert.equal(get('tokensPieces').children.length,1);
  assert.equal(get('tokensDiscovery').hidden,true);
  f.input('🙂');get('tokensPieces').children[0].click();
  assert.match(get('tokensPieces').textContent,/bytes/);assert.ok(get('tokensSpan').querySelector('.tokens-partial'));
  assert.equal(get('tokensCompletion').hidden,false);
  get('tokensReset').click();assert.equal(get('tokensInput').value,'the mozzarella melts into pure bliss.');assert.equal(get('tokensCompletion').hidden,true);assert.equal(get('tokensResults').hidden,false);
  f.input('');assert.match(get('tokensStatus').textContent,/Enter some text/);assert.equal(get('tokensResults').hidden,true);
  f.input(' \t\n');assert.equal(get('tokensWordCount').textContent,'0');
  f.dom.window.close();
});
test('preset repetition, native keyboard controls and navigation isolation',async()=>{
  const f=await fixture(),{get,w}=f;
  for(const option of [...get('tokensPreset').options].filter(o=>o.value)) {
    get('tokensPreset').value=option.value;get('tokensPreset').dispatchEvent(new w.Event('change'));
    assert.equal(get('tokensResults').hidden,false);
    assert.equal(Number(get('tokensTokenCount').textContent),get('tokensPieces').children.length);
    assert.equal(get('tokensSpan').textContent,option.value);
  }
  const tile=get('tokensPieces').children[0];tile.focus();assert.equal(w.document.activeElement,tile);
  tile.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(get('tokensDemo').hidden,false);
  for(const button of get('tokensDemo').querySelectorAll('button')) assert.equal(button.type,'button');
  get('nextBtn').click();assert.equal(get('tokensDemo').hidden,true);get('prevBtn').click();assert.equal(get('tokensDemo').hidden,false);
  f.dom.window.close();
});
test('load failure is explicit and retry automatically shows the comparison',async()=>{
  const f=await fixture(true),{get,w}=f;
  w.document.querySelector('script[src="../assets/js/vendor/cl100k-tokenizer.js"]').onerror();
  await Promise.resolve();await Promise.resolve();
  assert.match(get('tokensStatus').textContent,/could not load/);assert.equal(get('tokensRetry').hidden,false);assert.equal(get('tokensResults').hidden,true);
  w.LLMTokenizerVendor=vendor;get('tokensRetry').click();await Promise.resolve();await Promise.resolve();
  assert.equal(get('tokensPieces').children.length,8);assert.equal(get('tokensResults').hidden,false);
  f.dom.window.close();
});
