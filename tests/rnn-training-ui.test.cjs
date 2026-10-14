const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('ai100/nlp_rnn_visualizer.html','utf8');
const script=html.split('<script>')[1].split('</script>')[0];
function fixture(initialScene=8){
  const elements=new Map(),events={},timers=new Map();let timerId=0;
  function element(){return {textContent:'',innerHTML:'',disabled:false,style:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){},focus(){this.focused=true},offsetWidth:900}}
  function query(s){if(s==='#sceneContent svg title, #sceneContent [title], #sceneToolbar [title]')return null;if(!elements.has(s))elements.set(s,element());return elements.get(s)}
  const chapters=Array.from({length:4},element);
  const document={querySelector:query,querySelectorAll:s=>s==='.chapter'?chapters:[],addEventListener:(type,fn)=>(events[type]??=[]).push(fn)};
  const context=vm.createContext({document,location:{search:typeof initialScene==='string'?initialScene:'?scene='+(initialScene+1)},URL,URLSearchParams,NLPApplications:require('../assets/js/ai100/nlp-applications.js'),RNNComparison:require('../assets/js/ai100/rnn-comparison.js'),RNNTraining:require('../assets/js/ai100/rnn-training.js'),clearInterval(){},setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id),queueMicrotask:fn=>fn()});
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

test('chapter-end checks render and preserve selected feedback across navigation',()=>{
 const f=fixture(5);assert.match(f.view(),/Check your understanding/);
 f.run("state.knowledgeAnswers={word2vec:1};render()");assert.match(f.view(),/Correct./);
 f.query('#nextBtn').onclick();assert.doesNotMatch(f.view(),/Check your understanding/);
 f.query('#prevBtn').onclick();assert.match(f.view(),/Correct./);
 for(const scene of [7,10,12]){f.run('state.scene='+scene+';render()');assert.match(f.view(),/Check your understanding/)}
});

test('generation autoplay reaches END and cancels on navigation',()=>{
 const f=fixture(11);f.run('applicationPlaying=true;applicationTick()');let guard=0;while(f.timers.size&&guard++<40)f.tick();
 assert.equal(f.run('applicationPlaying'),false);assert.match(f.view(),/Selected: END/);
 f.run('state.applicationStep=0;applicationPlaying=true;applicationTick()');f.query('#nextBtn').onclick();assert.equal(f.timers.size,0);assert.equal(f.run('applicationPlaying'),false);
});

test('word steps do not restart the whole-scene entrance animation',()=>{
 const f=fixture(11);assert.equal(f.query('#sceneContent').style.animation,'');
 f.run('state.applicationStep=1;render()');assert.equal(f.query('#sceneContent').style.animation,'none');
 f.run('state.applicationStep=2;render()');assert.equal(f.query('#sceneContent').style.animation,'none');
 f.query('#nextBtn').onclick();assert.equal(f.query('#sceneContent').style.animation,'');
});

test('context comparison reveals matching vectors before different interpretations',()=>{
 const f=fixture(7);f.run('contextPlaying=true;contextTick()');assert.equal(f.run('state.contextStep'),1);assert.match(f.view(),/exactly the same embedding/);
 f.tick();assert.equal(f.run('state.contextStep'),2);f.tick();assert.equal(f.run('state.contextStep'),3);assert.equal(f.run('contextPlaying'),false);assert.match(f.view(),/Likely meaning: excellent idea/);assert.match(f.view(),/Likely meaning: deadly attack/);
 f.run('state.contextStep=0;contextPlaying=true;contextTick()');f.query('#nextBtn').onclick();assert.equal(f.timers.size,0);
});

test('3D map uses three embedding projections and preserves similarity and build progress',()=>{
 const f=fixture(6),before=f.run('JSON.stringify(neighbors(state.semanticWord))');
 f.run('state.mapDimension=3;state.mapStep=15;render()');assert.match(f.view(),/Three-dimensional/);assert.match(f.view(),/map-cube/);
 assert.equal(f.run('Object.values(projected3D).every(p=>p.length===3&&p.every(Number.isFinite))'),true);
 const initial=f.run('JSON.stringify(map3DPoint(projected3D.dog))');f.run('state.mapYaw=95');assert.notEqual(f.run('JSON.stringify(map3DPoint(projected3D.dog))'),initial);
 assert.equal(f.run('JSON.stringify(neighbors(state.semanticWord))'),before);assert.equal(f.run('state.mapStep'),15);
});

test('both semantic projections include every comparison vocabulary word',()=>{
 const f=fixture(6);assert.equal(f.run('Object.keys(projected).length'),24);assert.equal(f.run('Object.keys(projected3D).length'),24);
 assert.equal(f.run('WORDS.every(w=>projected[w]&&projected3D[w]&&neighbors(w).every(([n])=>projected[n]))'),true);
 f.run('state.mapStep=24;render()');assert.equal((f.view().match(/data-semantic=/g)||[]).length,24);
});

test('Scene 10 visibly refreshes prior blocks and animates carried state after each word',()=>{
 const f=fixture();f.query('#nextBtn').onclick();
 for(let i=1;i<=7;i++){
  f.query('#rnnNext').onclick();assert.match(f.view(),/rnn-show-state-carry/);
  const expected=f.run("rnn(['a','little','too','dark','for','my','taste'])["+(i-1)+"].prev");
  const prior=f.view().match(/class="rnn-state-blocks prior-blocks"[\s\S]*?<\/g>/)[0];
  for(const value of expected)assert.ok(prior.includes('data-state-value="'+value+'"'));
  if(i<7)assert.match(f.view(),/animateMotion path="M697 341V420H140V401" dur="1.1s" begin="1.2s"/);
 }
});

test('one-based continuous scene links and chapter-only links restore the correct scene',()=>{
 for(let n=1;n<=13;n++){
  const f=fixture('?scene='+n);assert.equal(f.run('state.scene'),n-1);
  assert.equal(f.query('#sceneCount').textContent,'Scene '+n+' of 13');
 }
 for(const [chapter,scene] of [[1,1],[2,7],[3,9],[4,12]])assert.equal(fixture('?chapter='+chapter).run('state.scene'),scene-1);
 assert.equal(fixture('?chapter=1&scene=10').run('state.scene'),9);
 assert.equal(fixture('?chapter=3&scene=999').run('state.scene'),8);
 assert.equal(fixture('?chapter=bad&scene=bad').run('state.scene'),0);
});
test('navigation writes canonical chapter and continuous scene for refresh and the viewer',()=>{
 const f=fixture('?chapter=3&scene=10');
 // Use the host URL implementation for the browser navigation contract.
 f.run("globalThis.window={location:{href:'https://example.test/ai100/nlp_rnn_visualizer.html?keep=yes#lesson',origin:'https://example.test'},history:{state:null,replaceState(s,t,url){window.location.href=url}},parent:{postMessage(message,origin){window.message=message;window.targetOrigin=origin}}}");
 f.run('render()');assert.match(f.run('window.location.href'),/chapter=3&scene=10/);
 f.query('#nextBtn').onclick();assert.equal(f.run('window.message.scene'),11);
 f.query('#nextBtn').onclick();assert.equal(f.run('window.message.chapter'),4);assert.equal(f.run('window.message.scene'),12);
 assert.equal(fixture(new URL(f.run('window.location.href')).search).run('state.scene'),11);
 f.query('#restartBtn').onclick();assert.equal(f.run('window.message.scene'),1);assert.equal(f.run('window.message.chapter'),1);
});
