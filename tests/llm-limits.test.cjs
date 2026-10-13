const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const engine = require('../assets/js/ai100/llm-explorer.js');
const {createGenerator} = require('../assets/js/ai100/llm-generation.js');
const {memoryWords, statistics, memoryMessage, generatePair} = require('../assets/js/ai100/llm-limits.js');
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
function fixture(random = Math.random, reducedMotion = true) {
  const jobs = new Map(); let jobId = 0;
  const window = { matchMedia: () => ({matches: reducedMotion}) };
  const nodes=new Map();
  function node(tag='div') { return {tag,children:[],attributes:{},style:{},handlers:{},textContent:'',hidden:false,
    append(...items){this.children.push(...items);}, replaceChildren(...items){this.children=items;},
    setAttribute(k,v){this.attributes[k]=String(v);},getAttribute(k){return this.attributes[k];},
    addEventListener(k,fn){this.handlers[k]=fn;},focus(){},querySelector(){return node('svg');},cloneNode(){return node('svg');},
    get firstElementChild(){return this.children[0];},click(){this.handlers.click?.({});}}; }
  const document={getElementById(id){if(id==='limitsInput') return nodes.get('limitsControls').children[0].children[0]; if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElement:node,createTextNode:text=>({...node(),textContent:text})};
  let generators=0;
  vm.runInNewContext(fs.readFileSync('assets/js/ai100/llm-limits.js','utf8'),{document,Math:Object.assign(Object.create(Math),{random}),setTimeout(fn,delay){const id=++jobId;jobs.set(id,{fn,delay});return id;},clearTimeout(id){jobs.delete(id);},window:Object.assign(window,{llmProbability:engine,llmCreateGenerator(...args){generators++;return createGenerator(...args);}})});
  return {get:document.getElementById,select:i=>document.getElementById('limitsChallenges').children[i].click(),generators:()=>generators, jobs, window, tick(){const [id,job]=jobs.entries().next().value;jobs.delete(id);job.fn();}};
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
  f.select(3);for(let i=0;i<5;i++)get('limitsGenerate').click();
  assert.equal(f.generators(),10);assert.equal(get('limitsVisual').children.length,3);
  get('limitsSizes').children[1].click();assert.equal(get('limitsVisual').children.length,0);
  get('limitsGenerate').click();get('limitsReset').click();
  assert.equal(get('limitsVisual').children.length,0);
  for(let i=0;i<20;i++)f.select(i%4);
  assert.equal(get('limitsVisual').children.length,0);
});
test('paired generation records the original distribution for each sampled word', () => {
  for (const size of [2,3]) {
    let ticket=0;
    const pair=generatePair(engine,createGenerator,size,()=>ticket++%2 ? .99 : 0);
    assert.equal(pair.length,2);
    assert.ok(pair[0].differences.some(Boolean));
    pair.forEach((run,index)=> {
      assert.ok(run.generated<=24);
      run.words.forEach((word,position)=> {
        const trace=run.traces[position];
        if(position<size-1){assert.equal(trace,null);return;}
        assert.equal(trace.context,run.words.slice(position-size+1,position).join(' '));
        assert.deepEqual(trace.candidates,engine.continuationCounts(engine.corpus,trace.context).candidates);
        assert.ok(trace.candidates.some(candidate=>candidate.word===word));
        assert.equal(run.differences[position],word!==pair[1-index].words[position]);
      });
    });
    const identical=generatePair(engine,createGenerator,size,()=>0);
    assert.ok(identical.every(run=>run.differences.every(value=>!value)));
  }
  const terminal=generatePair({...engine,corpus:'New end'},createGenerator,2,()=>0);
  assert.ok(terminal.every(run=>run.ended && run.words.join(' ')==='New end'));
});
test('greedy paired mode is deterministic and switching modes cancels a pending reveal', () => {
  const pair=generatePair(engine,createGenerator,3,()=>{throw Error('Greedy should not draw randomly');},24,'greedy');
  assert.deepEqual(pair[0].words,pair[1].words);
  assert.equal(pair[0].words[2],'pizza');
  assert.ok(pair.every(run=>run.branches.every(branch=>!branch)));
  const f=fixture(()=>0,false), get=f.get;
  f.select(3);get('limitsGenerate').click();
  get('limitsModeToggle').click();get('limitsModeGreedy').click();
  assert.equal(f.jobs.size,0);
  assert.equal(get('limitsVisual').children.length,0);
  assert.match(get('limitsGenerate').textContent,/Greedy/);
  get('limitsGenerate').click();while(f.jobs.size)f.tick();
  assert.match(get('limitsVisual').children[2].children[0].textContent,/Both passages match/);
});
test('selecting differences in either sample shows their alternatives and clears on new runs', () => {
  let ticket=0; const f=fixture(()=>ticket++%2 ? .99 : 0), get=f.get;
  f.select(3);get('limitsSizes').children[1].click();
  get('limitsGenerate').click();
  const panels=get('limitsVisual').children, inspector=panels[2];
  const first=panels[0].children[1].children.find(node=>node.tag==='button');
  const second=panels[1].children[1].children.find(node=>node.tag==='button');
  assert.ok(first && second);
  assert.equal(first.textContent,'New');
  assert.equal(first.attributes['data-branch-revealed'],'true');
  assert.equal(panels[0].children[1].children[2].tag,'span');
  first.click();
  assert.equal(first.attributes['aria-pressed'],'true');
  assert.match(inspector.children[1].textContent,/New Haven/);
  assert.equal(inspector.children[2].children.length,3);
  assert.deepEqual(inspector.children[2].children.map(card=>card.children[1].textContent),['2 of 4 · 50%','1 of 4 · 25%','1 of 4 · 25%']);
  second.click();
  assert.equal(first.attributes['aria-pressed'],'false');
  assert.equal(second.attributes['aria-pressed'],'true');
  get('limitsGenerate').click();
  assert.equal(get('limitsVisual').children[2].children.length,0);
  assert.equal(get('limitsVisual').children[2].hidden,true);
  get('limitsReset').click();assert.equal(get('limitsVisual').children.length,0);
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
test('paired word reveal advances every 500ms and cancels on reset, model changes, challenge changes and scene exit', () => {
  const f=fixture(()=>0,false), get=f.get;
  f.select(3);get('limitsGenerate').click();
  const sentences=get('limitsVisual').children.slice(0,2).map(panel=>panel.children[1]);
  const visible=sentence=>sentence.children.filter(tile=>!tile.hidden).length;
  assert.deepEqual(sentences.map(visible),[1,1]);
  assert.equal(f.jobs.values().next().value.delay,500);
  assert.equal(get('limitsGenerate').disabled,true);
  f.tick(); assert.deepEqual(sentences.map(visible),[2,2]);
  const stale=f.jobs.values().next().value.fn;
  get('limitsReset').click();assert.equal(f.jobs.size,0);
  stale();assert.deepEqual(sentences.map(visible),[2,2]);
  get('limitsGenerate').click();get('limitsSizes').children[1].click();assert.equal(f.jobs.size,0);
  get('limitsGenerate').click();f.select(0);assert.equal(f.jobs.size,0);
  f.select(3);get('limitsGenerate').click();f.window.cancelLimitsGeneration();assert.equal(f.jobs.size,0);
  assert.equal(get('limitsGenerate').disabled,false);
  get('limitsGenerate').click();while(f.jobs.size)f.tick();
  assert.equal(get('limitsGenerate').disabled,false);
  assert.equal(get('limitsDiscovery').hidden,false);
  const reduced=fixture(()=>0,true);reduced.select(3);reduced.get('limitsGenerate').click();
  assert.equal(reduced.jobs.size,0);
  assert.equal(reduced.get('limitsGenerate').disabled,false);
});
