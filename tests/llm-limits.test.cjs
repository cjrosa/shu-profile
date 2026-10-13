const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const engine = require('../assets/js/ai100/llm-explorer.js');
const {createGenerator} = require('../assets/js/ai100/llm-generation.js');
const {memoryWords, statistics, memoryMessage} = require('../assets/js/ai100/llm-limits.js');
test('memory messages distinguish insufficient, exact, and truncated context', () => {
  const short = memoryMessage(5, memoryWords(5, false));
  assert.equal(short.severity, 'warning');
  assert.match(short.text, /only 3 are present/);
  assert.match(short.text, /1 more word is needed/);
  const four = ['Marie', 'has', 'arrived.', 'She'].map(word => ({word, active:true}));
  assert.equal(memoryMessage(5, four).severity, 'success');
  for (const size of [2,3,5]) {
    const message = memoryMessage(size, memoryWords(size, true));
    assert.equal(message.severity, 'warning');
    assert.match(message.text, /cannot use the earlier information about Marie/);
  }
});
test('context contains exactly the available n−1 preceding words', () => {
  for (const size of [2,3,5]) for (const extended of [false,true]) {
    const words=memoryWords(size,extended);
    assert.equal(words.filter(w=>w.active).length,Math.min(size-1,words.length));
    assert.deepEqual(words.filter(w=>w.active),words.slice(-(size-1)));
  }
  assert.equal(memoryWords(5,true)[0].active,false);
  assert.equal(memoryWords(5,false)[0].active,true);
});
test('unseen preset has no continuation and all statistics match independently counted corpus windows', () => {
  assert.equal(engine.continuationCounts(engine.corpus,'purple elephants').total,0);
  const words=engine.wordSpans(engine.corpus).map(w=>w.normalized);
  for(let n=1;n<=5;n++) {
    const windows=Array.from({length:words.length-n+1},(_,i)=>words.slice(i,i+n).join(' '));
    const unique=[...new Set(windows)], single=unique.filter(w=>windows.filter(x=>x===w).length===1).length;
    assert.deepEqual(statistics(engine,n),{total:windows.length,unique:unique.length,single,repeated:unique.length-single});
  }
});
function fixture() {
  const nodes=new Map();
  function node(tag='div') { return {tag,children:[],attributes:{},style:{},handlers:{},textContent:'',hidden:false,
    append(...items){this.children.push(...items);}, replaceChildren(...items){this.children=items;},
    setAttribute(k,v){this.attributes[k]=String(v);},getAttribute(k){return this.attributes[k];},
    addEventListener(k,fn){this.handlers[k]=fn;},focus(){},querySelector(){return node('svg');},cloneNode(){return node('svg');},
    get firstElementChild(){return this.children[0];},click(){this.handlers.click?.({});}}; }
  const document={getElementById(id){if(id==='limitsInput') return nodes.get('limitsControls').children[0].children[0]; if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElement:node,createTextNode:text=>({...node(),textContent:text})};
  let generators=0;
  vm.runInNewContext(fs.readFileSync('assets/js/ai100/llm-limits.js','utf8'),{document,window:{llmProbability:engine,llmCreateGenerator(...args){generators++;return createGenerator(...args);}}});
  return {get:document.getElementById,select:i=>document.getElementById('limitsChallenges').children[i].click(),generators:()=>generators};
}
test('challenge switching, reset, size changes and generation use isolated synchronous state', () => {
  const f=fixture(), get=f.get;
  get('limitsIntervening').click();
  assert.equal(get('limitsVisual').children[0].children.length,14);
  f.select(1);get('limitsControls').children[1].click();
  assert.match(get('limitsPredictionStatus').textContent,/No match/);
  assert.equal(get('limitsVisual').children[0].children.length,0);
  assert.equal(get('limitsPassage').children.filter(node=>node.className==='limits-trigram').length,0);
  get('limitsControls').children[0].click();
  assert.match(get('limitsPredictionStatus').textContent,/4 observed continuations/);
  assert.equal(get('limitsPassage').children.filter(node=>node.className==='limits-trigram').length,4);
  const passageText = node => node.textContent + node.children.map(passageText).join('');
  assert.equal(get('limitsPassage').children.map(passageText).join(''),engine.corpus);
  f.select(2);
  assert.equal(get('limitsVisual').children.length,2);
  get('limitsSizes').children[4].click();
  assert.match(get('limitsPredictionStatus').textContent,/95 observed windows/);
  f.select(3);for(let i=0;i<5;i++)get('limitsControls').children[0].click();
  assert.equal(f.generators(),5);assert.equal(get('limitsVisual').children.length,2);
  get('limitsSizes').children[1].click();assert.equal(get('limitsVisual').children.length,0);
  get('limitsControls').children[0].click();get('limitsReset').click();
  assert.equal(get('limitsVisual').children.length,0);
  for(let i=0;i<20;i++)f.select(i%4);
  assert.equal(get('limitsVisual').children.length,0);
});
test('sparse evidence is immediately visible, follows corpus counts, and resets cleanly', () => {
  const f=fixture(), get=f.get;
  f.select(2);
  assert.equal(get('limitsVisual').children.length,2);
  assert.equal(get('limitsControls').children.length,0);
  get('limitsSizes').children[2].click();
  assert.equal(get('limitsVisual').children.length,2);
  const expectedCounts=[4,4,2,1,1];
  for (let n=1;n<=5;n++) {
    get('limitsSizes').children[n-1].click();
    assert.equal(get('limitsControls').hidden,true);
    const [example, overview]=get('limitsVisual').children;
    const tiles=example.children[0];
    assert.equal(tiles.children.length,n+2);
    assert.equal(tiles.children[n+1].children[0].textContent,String(expectedCounts[n-1]));
    assert.equal(tiles.children[n+1].attributes['data-repeated'],String(expectedCounts[n-1]>1));
    const stats=statistics(engine,n);
    assert.equal(overview.children[1].children[n-1].children[1].textContent,`${stats.repeated}/${stats.unique}`);
    assert.match(overview.children[1].children[n-1].attributes['data-tooltip'],/Each different/);
    assert.equal(overview.children[1].children.length,5);
    assert.equal(overview.children[1].children[n-1].attributes['data-selected'],'true');
    assert.equal(get('limitsDiscovery').attributes['data-severity'],'warning');
  }
  const message=get('limitsTakeaway').children.at(-1).textContent;
  assert.match(message,/no 4-word or 5-word group repeats/);
  get('limitsReset').click();
  assert.equal(get('limitsVisual').children.length,2);
  assert.equal(get('limitsControls').hidden,true);
  assert.equal(get('limitsDiscovery').hidden,false);
  assert.equal(get('limitsSizes').children[0].attributes['aria-pressed'],'true');
});
