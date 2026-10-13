const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../assets/js/ai100/llm-token-engine.js');
const tokenizer = require('../assets/js/vendor/cl100k-tokenizer.js').create();
const references = [
  ['pizza',[93538]], ['mozzarella',[6489,96982]],
  ['pilgrimage',[79,321,911,1843]],
  ['New Haven pizza is legendary.',[3648,42714,23317,374,28812,13]],
  ['char, chew, and flavor.',[1799,11,37433,11,323,17615,13]],
  ['the mozzarella melts into pure bliss.',[1820,4647,96982,99191,1139,10748,59045,13]],
  ['hello world',[15339,1917]],
  ['dog',[18964]], ['dogs',[81134]], ['doghouse',[18964,7830]],
  ['unbelievable',[359,32898,24694]],
  ['New Haven pizza',[3648,42714,23317]],
  ['The doghouse is unbelievable!',[791,5679,7830,374,52229,0]],
  ['A quokka waddles quietly.',[32,934,564,4657,289,723,645,30666,13]],
  ['antidisestablishmentarianism',[519,85342,34500,479,8997,2191]]
];
test('bundled cl100k_base matches independently verified reference token IDs',()=>{
  for(const [text,ids] of references) assert.deepEqual(engine.analyze(text,tokenizer).tokens.map(t=>t.id),ids,text);
});
test('presets are exact excerpts from the Chapter 1 passage',()=>{
  const {corpus} = require('../assets/js/ai100/llm-explorer.js');
  for (const text of engine.presets) assert.ok(corpus.includes(text),text);
});
test('all token bytes reconstruct unchanged input, including whitespace and Unicode',()=>{
  for(const text of [...engine.presets,'','   ','\t a\r\nb  ','Hello, world!','你好世界','café e\u0301','🙂👩🏽‍💻','\ufefftest','<|endoftext|>','a'.repeat(600)]) {
    const result = engine.analyze(text,tokenizer);
    const bytes = result.tokens.flatMap(t=>t.bytes);
    assert.deepEqual(bytes,Array.from(new TextEncoder().encode(text)));
    assert.equal(new TextDecoder('utf-8',{ignoreBOM:true}).decode(new Uint8Array(bytes)),text);
    assert.equal(result.characters.map(c=>c.text).join(''),text);
    result.tokens.forEach((token,i)=>assert.equal(token.start,i ? result.tokens[i-1].end : 0));
  }
});
test('word overlap does not force punctuation, leading spaces, or partial emoji to align',()=>{
  const result=engine.analyze(engine.initial,tokenizer);
  assert.equal(result.words.length,6); assert.equal(result.tokens.length,8);
  assert.equal(result.tokens.filter(t=>engine.overlap(t,result.words[1])).length,2);
  const emoji=engine.analyze('🙂',tokenizer);
  assert.ok(emoji.tokens.some(t=>t.text===null));
  assert.ok(emoji.tokens.every(t=>engine.overlap(t,emoji.characters[0])));
  assert.equal(engine.analyze(' \n ',tokenizer).words.length,0);
  assert.throws(()=>engine.analyze('a'.repeat(601),tokenizer),/600/);
  assert.throws(()=>engine.analyze('\ud800',tokenizer),/Unicode/);
});
