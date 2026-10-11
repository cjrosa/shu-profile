const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('ai100/nlp_rnn_visualizer.html','utf8');
const script=html.split('<script>')[1].split('</script>')[0];
function fixture(initialScene=8){
  const elements=new Map(),events={},timers=new Map();let timerId=0;
  function element(){return {textContent:'',innerHTML:'',disabled:false,style:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){},focus(){this.focused=true},offsetWidth:900}}
  function query(s){if(s==='#sceneContent svg title, #sceneContent [title], #sceneToolbar [title]')return null;if(!elements.has(s))elements.set(s,element());return elements.get(s)}
  const chapters=Array.from({length:4},element);
  const document={querySelector:query,querySelectorAll:s=>s==='.chapter'?chapters:[],addEventListener:(type,fn)=>(events[type]??=[]).push(fn)};
  const context=vm.createContext({document,location:{search:'?scene='+initialScene},URLSearchParams,NLPApplications:require('../assets/js/ai100/nlp-applications.js'),RNNComparison:require('../assets/js/ai100/rnn-comparison.js'),RNNTraining:require('../assets/js/ai100/rnn-training.js'),clearInterval(){},setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id),queueMicrotask:fn=>fn()});
  vm.runInContext(script,context);
  function click(action){const button={dataset:{trainAction:action},closest:s=>s==='[data-train-action]'?button:null};events.click.forEach(fn=>fn({target:button}))}
  function tick(){const tasks=[...timers.values()];timers.clear();tasks.forEach(fn=>fn())}
  return {click,query,run:code=>vm.runInContext(code,context),view:()=>query('#sceneContent').innerHTML,events,timers,tick};
}
test('page boots scene 8 and delegated controls execute the complete training loop',()=>{
  const f=fixture();assert.match(f.view(),/Sentence 1/);assert.match(f.view(),/zero starting state/);
  f.click('next');assert.equal(f.run('trainingLesson.snapshot().phase'),'state');
  f.click('next');assert.match(f.view(),/rnn-return active/);
  f.click('next');assert.equal(f.run('trainingLesson.snapshot().word'),1);
  f.click('back');assert.equal(f.run('trainingLesson.snapshot().phase'),'carry');
  f.click('finish');assert.match(f.view(),/After weight update/);assert.equal(f.run('trainingLesson.snapshot().version'),1);
  f.click('next');assert.match(f.view(),/Sentence 2/);assert.match(f.view(),/Training updates: 1/);
  f.click('reset');assert.equal(f.run('trainingLesson.snapshot().version'),0);assert.match(f.view(),/Sentence 1/);
});
test('scene navigation preserves training progress; inference processes all seven words',()=>{
  const f=fixture();f.click('finish');f.query('#nextBtn').onclick();
  assert.equal(f.run('state.scene'),9);
  for(let i=0;i<7;i++)f.query('#rnnNext').onclick();
  const score=f.run("rnn(['a','little','too','dark','for','my','taste']).at(-1).positive");assert.ok(f.view().includes(Math.round(score*100)+'% positive'));assert.equal((f.view().match(/class="rnn-neuron hidden"/g)||[]).length,3);
  assert.match(f.view(),/id="rnnNext"[^>]* disabled/);
  f.query('#prevBtn').onclick();assert.equal(f.run('trainingLesson.snapshot().version'),1);
  f.query('#restartBtn').onclick();assert.equal(f.run('trainingLesson.snapshot().version'),0);assert.equal(f.run('state.scene'),0);
});
test('arrow keys inside scrollable diagrams do not change scenes',()=>{
  const f=fixture();const target={tagName:'DIV',closest:()=>({})};f.events.keydown.forEach(fn=>fn({key:'ArrowRight',target}));assert.equal(f.run('state.scene'),8);
});
test('header toolbar plays, pauses, stops at sentence end, and cancels on navigation',()=>{
  const f=fixture();assert.match(f.view(),/role="toolbar"/);assert.match(f.view(),/Play sentence/);
  assert.doesNotMatch(f.view(),/data-train-action="word"/);
  f.click('play');assert.equal(f.timers.size,1);assert.match(f.view(),/aria-pressed="true"/);
  f.tick();assert.equal(f.run('trainingLesson.snapshot().phase'),'carry');
  f.click('play');assert.equal(f.timers.size,0);const frozen=f.run('trainingLesson.snapshot().phase');f.tick();assert.equal(f.run('trainingLesson.snapshot().phase'),frozen);
  f.click('play');let guard=0;while(f.timers.size&&guard++<80)f.tick();assert.equal(f.run('trainingLesson.snapshot().phase'),'complete');assert.equal(f.timers.size,0);assert.equal(f.run('trainingPlaying'),false);
  f.click('play');assert.equal(f.run('trainingLesson.snapshot().round'),1);assert.equal(f.timers.size,1);
  f.query('#nextBtn').onclick();assert.equal(f.timers.size,0);assert.equal(f.run('trainingPlaying'),false);
});
test('manual stepping or reset cancels autoplay rather than leaving a second clock running',()=>{
  const f=fixture();f.click('play');f.click('next');assert.equal(f.timers.size,0);assert.equal(f.run('trainingPlaying'),false);
  f.click('play');f.click('reset');assert.equal(f.timers.size,0);assert.equal(f.run('trainingLesson.snapshot().phase'),'input');
});

test('word card play stops at the next word and at sentence end',()=>{
 const f=fixture();
 for(let word=0;word<3;word++){
  f.click('word');let guard=0;while(f.timers.size&&guard++<10)f.tick();
  assert.equal(f.run('trainingLesson.snapshot().word'),Math.min(word+1,2));
  assert.equal(f.run('trainingLesson.snapshot().phase'),word===2?'end':'input');
  assert.equal(f.run('trainingPlaying'),false);assert.equal(f.timers.size,0);
 }
 assert.equal(f.run('trainingLesson.snapshot().version'),0);
});

test('side-by-side comparison advances together, stops at end, and cancels on navigation',()=>{
 const f=fixture();f.run('state.scene=10;state.evolveStep=0;render();comparisonPlaying=true;comparisonTick()');
 assert.equal(f.run('state.evolveStep'),1);let guard=0;while(f.timers.size&&guard++<20)f.tick();
 assert.equal(f.run('state.evolveStep'),9);assert.equal(f.run('comparisonPlaying'),false);
 assert.match(f.view(),/Positive/);assert.match(f.view(),/Negative/);
 f.run('state.evolveStep=0;comparisonPlaying=true;comparisonTick()');f.query('#nextBtn').onclick();assert.equal(f.timers.size,0);
});

test('chapter navigation initializes on Scene 1 and opens every section',()=>{
 const f=fixture(0);
 for(const [chapter,scene] of [[1,6],[2,8],[3,11],[0,0]]){
  const button={dataset:{chapter:String(chapter)},closest:s=>s==='[data-chapter]'?button:null};
  f.events.click.forEach(fn=>fn({target:button}));assert.equal(f.run('state.scene'),scene);
 }
});

test('Word2Vec and applications occupy their own scenes',()=>{
 const f=fixture(5);assert.equal(f.run('scenes[state.scene].kind'),'word2vec');assert.match(f.view(),/Skip-gram/);
 f.run('state.scene=11;render()');assert.match(f.view(),/Translation/);assert.match(f.view(),/Image captioning/);
 assert.equal(f.run('scenes.length'),13);
});
