const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const engine = require('../assets/js/ai100/llm-explorer.js');
const { createGenerator } = require('../assets/js/ai100/llm-generation.js');

test('greedy selects highest frequency, resolves ties consistently, and stops at limits', () => {
  const model=createGenerator(engine,()=>{throw Error('Greedy must not sample');},2);
  model.reset(3);assert.equal(model.greedy(),true);
  assert.equal(model.snapshot().words.at(-1),'pizza');
  model.greedy();assert.equal(model.greedy(),false);
  const tied=createGenerator({...engine,corpus:'New a New b'});
  tied.greedy();assert.equal(tied.snapshot().words.at(-1),'a');
});

test('changing automatic mode cancels a pending step and starts a fresh greedy run', () => {
  const f=fixture();f.click('genSize3');f.click('genAuto');
  const stale=[...f.jobs.values()][0];
  f.click('genAutoMode');f.click('genModeGreedy');
  stale();assert.equal(f.jobs.size,0);assert.equal(f.get('genCount').textContent,'0 / 40 added words');
  f.click('genAuto');f.tick();
  assert.equal(f.get('genContext').textContent,'Haven pizza');
  assert.match(f.get('genStatus').textContent,/Greedy/);
});

test('manual generation uses corpus counts, shifts contexts and rejects invented words', () => {
  const model = createGenerator(engine);
  assert.deepEqual(model.distribution().candidates, [{word:'Haven',count:4,probability:1}]);
  assert.equal(model.append('invented'), false);
  assert.equal(model.append('Haven'), true);
  assert.equal(model.context(), 'Haven');
  assert.deepEqual(model.distribution().candidates.map(c => [c.word,c.count,c.probability]), [['pizza',2,.5],['sets',1,.25],['is',1,.25]]);
  for (const word of ['pizza','sets','is']) {
    model.reset(); model.append('Haven'); assert.equal(model.append(word), true); assert.equal(model.context(),word);
  }
  model.reset(3); assert.equal(model.context(),'New Haven');
  model.append('pizza'); assert.equal(model.context(),'Haven pizza');
  model.reset(); assert.equal(model.context(),'New Haven'); assert.equal(model.generated(),0);
});

test('sampling allocates tickets by frequency rather than candidate count', () => {
  const weighted = {...engine, corpus:'New a New a New a New b'};
  const outcomes = Array.from({length:100},(_,i)=> {
    const model=createGenerator(weighted,()=> (i+.5)/100); model.sample(); return model.snapshot().words.at(-1);
  });
  assert.equal(outcomes.filter(w=>w==='a').length,75);
  assert.equal(outcomes.filter(w=>w==='b').length,25);
});

test('terminal contexts stop without backoff and repeated paths stop at the word limit', () => {
  const terminal=createGenerator({...engine,corpus:'New end'});
  terminal.sample(); assert.equal(terminal.sample(),false); assert.equal(terminal.context(),'end');
  const repeated=createGenerator({...engine,corpus:'New New'},()=>0,40);
  for(let i=0;i<60;i++) repeated.sample();
  assert.equal(repeated.generated(),40); assert.equal(repeated.append('New'),false);
});

function fixture(reducedMotion = true) {
  const nodes=new Map(), jobs=new Map(); let sequence=0;
  const html=fs.readFileSync('ai100/llm_explorer.html','utf8');
  function node() { return {children:[],style:{},attributes:{},handlers:{},textContent:'',
    set innerHTML(value){this.children=[];}, setAttribute(k,v){this.attributes[k]=String(v);},
    append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},
    addEventListener(k,fn){this.handlers[k]=fn;},focus(){},get firstElementChild(){return this.children[0];}}; }
  function get(id){assert.ok(html.includes(`id="${id}"`),id);if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}
  const window={llmProbability:engine,matchMedia:()=>({matches:reducedMotion})};
  vm.runInNewContext(fs.readFileSync('assets/js/ai100/llm-generation.js','utf8'),{window,document:{getElementById:get,createElement:node,createTextNode:text=>({textContent:text})},setTimeout:fn=>{jobs.set(++sequence,fn);return sequence;},clearTimeout:id=>jobs.delete(id)});
  return {get,window,jobs,click:id=>get(id).handlers.click(),tick:()=>{const [id,fn]=jobs.entries().next().value;jobs.delete(id);fn();}};
}

test('reveal is manual, stale clicks cannot append twice, and mode switches clear candidates', () => {
  const f=fixture(); assert.equal(f.jobs.size,0); assert.equal(f.get('genCandidates').children.length,0);
  f.click('genReveal'); const stale=f.get('genCandidates').children[0]; stale.handlers.click(); stale.handlers.click();
  assert.equal(f.get('genContext').textContent,'Haven'); assert.equal(f.get('genCount').textContent,'1 / 40 added words');
  assert.equal(f.get('genCandidates').children.length,0);
  f.click('genSize3'); assert.equal(f.get('genContext').textContent,'New Haven'); assert.equal(f.get('genCount').textContent,'0 / 40 added words');
});

test('pause, reset, switching models and navigation cancel pending automatic words', () => {
  for (const action of ['genStop','genReset','genSize3','navigation']) {
    const f=fixture(); f.click('genAuto'); const stale=[...f.jobs.values()][0];
    if(action==='navigation')f.window.cancelGeneration();else f.click(action);
    const before=f.get('genCount').textContent; stale();
    assert.equal(f.jobs.size,0);assert.equal(f.get('genCount').textContent,before);
  }
  const f=fixture();f.click('genAuto');f.click('genAuto');assert.equal(f.jobs.size,1);f.tick();
  assert.equal(f.get('genContext').textContent,'Haven'); f.click('genStop');
  f.get('genCandidates').children[0].handlers.click();assert.equal(f.get('genCount').textContent,'2 / 40 added words');
});

test('all partial runs are tracked automatically, preserved on reset, and deletable', () => {
  const f=fixture();
  const add=()=>{f.click('genReveal');f.get('genCandidates').children[0].handlers.click();};
  add();assert.equal(f.get('genCompareRows').children.length,1);
  add();assert.equal(f.get('genCompareRows').children.length,1);
  assert.equal(f.get('genCompareRows').children[0].children[1].textContent,'New Haven pizza');
  f.click('genReset');assert.equal(f.get('genCompareRows').children.length,1);
  add();assert.equal(f.get('genCompareRows').children.length,2);
  f.get('genCompareRows').children[1].children[0].children[1].handlers.click();
  add();assert.equal(f.get('genCompareRows').children.length,1);
  f.click('genSize3');add();assert.equal(f.get('genCompareRows').children.length,2);
  f.get('genCompareRows').children[0].children[0].children[1].handlers.click();
  assert.equal(f.get('genCompareRows').children.length,1);
  f.get('genCompareRows').children[0].children[0].children[1].handlers.click();
  assert.equal(f.get('genCompareHelp').hidden,false);
});

test('reveal animates a model lookup before exposing candidates, once per click', () => {
  const f=fixture(false);
  f.click('genReveal');f.click('genReveal');f.click('genAuto');
  assert.equal(f.jobs.size,1);
  assert.equal(f.get('genLookup').hidden,false);
  assert.equal(f.get('genLookupContext').textContent,'New');
  assert.equal(f.get('genLookupModel').textContent,'Bigram model');
  assert.equal(f.get('genCandidates').children.length,0);
  assert.equal(f.get('genCandidates').attributes['aria-busy'],'true');
  f.tick();
  assert.equal(f.get('genLookup').hidden,false);assert.equal(f.get('genLookup').attributes['data-active'],'false');
  assert.equal(f.get('genCandidates').children[0].children[0].textContent,'Haven');
  assert.equal(f.get('genCandidates').attributes['aria-busy'],'false');
  f.click('genSize3');f.click('genReveal');
  assert.equal(f.get('genLookupContext').textContent,'New Haven');
  assert.equal(f.get('genLookupModel').textContent,'Trigram model');
});

test('reset, model changes and scene exit cancel an unfinished lookup', () => {
  for(const action of ['genReset','genSize3','navigation']) {
    const f=fixture(false);f.click('genReveal');const stale=[...f.jobs.values()][0];
    if(action==='navigation')f.window.cancelGeneration();else f.click(action);
    stale();assert.equal(f.jobs.size,0);assert.equal(f.get('genLookup').hidden,false);assert.equal(f.get('genLookup').attributes['data-active'],'false');
    assert.equal(f.get('genCandidates').children.length,0);
  }
});

test('reduced motion reveals directly without an animation timer', () => {
  const f=fixture(true);f.click('genReveal');
  assert.equal(f.jobs.size,0);assert.equal(f.get('genLookup').hidden,false);assert.equal(f.get('genLookup').attributes['data-active'],'false');
  assert.equal(f.get('genCandidates').children.length,1);
});
