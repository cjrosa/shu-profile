const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const {JSDOM}=require('../tools/llm-tokenizer/node_modules/jsdom');
function fixture(reduced=false){
 const dom=new JSDOM(fs.readFileSync('ai100/llm_explorer.html','utf8'),{runScripts:'outside-only',url:'http://localhost/ai100/llm_explorer.html?chapter=3&scene=2'}),w=dom.window;
 const clocks=new Map();let id=0;w.setInterval=(fn,delay)=>{fn.delay=delay;clocks.set(++id,fn);return id};w.clearInterval=id=>clocks.delete(id);w.matchMedia=()=>({matches:reduced});
 for(const name of ['llm-explorer','rnn-training','llm-rnn'])w.eval(fs.readFileSync(`assets/js/ai100/${name}.js`,'utf8'));
 const get=name=>w.document.getElementById('rnn'+name),choose=value=>{get('Preset').value=value;get('Preset').dispatchEvent(new w.Event('change'))};
 return {dom,w,get,choose,clocks};
}
test('immediate exploration, deterministic restoration, shared renderer and exact recurrence',()=>{
 const {dom,w,get}=fixture();assert.equal(get('Demo').hidden,false);assert.equal(get('Tokens').querySelectorAll('button').length,19);
 assert.ok(get('Diagram').querySelector('.rnn-flow-diagram'));assert.equal(get('Previous'),null);
 const start=get('Diagram').innerHTML;get('Tokens').querySelectorAll('button')[1].click();const second=get('Diagram').innerHTML;get('Tokens').querySelector('button').click();assert.equal(get('Diagram').innerHTML,start);get('Tokens').querySelectorAll('button')[1].click();assert.equal(get('Diagram').innerHTML,second);
 const prior=[...get('Diagram').querySelectorAll('.prior-blocks [data-state-value]')].map(n=>Number(n.dataset.stateValue));
 get('Tokens').querySelector('button').click();const updated=[...get('Diagram').querySelectorAll('.updated-blocks [data-state-value]')].map(n=>Number(n.dataset.stateValue));assert.deepEqual(prior,updated);
 [...get('Tokens').querySelectorAll('button')].at(-1).click();assert.equal(get('Advance'),null);assert.equal(get('Chain'),null);
 get('Tokens').querySelector('button').click();assert.equal(get('Diagram').innerHTML,start);dom.window.close();
});
test('examples, keyboard selection, and reduced motion',()=>{
 const {dom,w,get,choose}=fixture(true);
 for(const key of ['short','long','marie']){choose(key);assert.equal(get('Tokens').querySelector('button').getAttribute('aria-pressed'),'true')}
 get('Tokens').querySelector('button').dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.equal([...get('Tokens').querySelectorAll('button')].at(-1).getAttribute('aria-pressed'),'true');
 assert.equal(get('Diagram').querySelector('animateMotion'),null);dom.window.close();
});
test('automatic loop survives removal of controls and stops on navigation or inspection',()=>{
 const {dom,w,get,choose,clocks}=fixture();
 for(const name of ['Previous','Advance','Play','Reset','Status'])assert.equal(get(name),null);
 assert.equal(clocks.size,1);const tick=()=>[...clocks.values()].forEach(fn=>fn());
 tick();assert.ok(get('Diagram').querySelector('.rnn-phase-carry'));
 tick();assert.equal(get('Tokens').querySelectorAll('button')[1].getAttribute('aria-pressed'),'true');
 get('Tokens').querySelector('button').click();assert.equal(clocks.size,0);
 choose('short');for(let i=0;i<24;i++)tick();assert.equal(get('Tokens').querySelector('button').getAttribute('aria-pressed'),'true');
 w.document.getElementById('nextBtn').click();assert.equal(clocks.size,0);
 w.document.getElementById('prevBtn').click();assert.equal(clocks.size,1);dom.window.close();
});
test('reduced motion remains manually explorable without autoplay',()=>{
 const {dom,get,choose,clocks}=fixture(true);choose('long');assert.equal(clocks.size,0);
 get('Tokens').querySelectorAll('button')[2].click();assert.equal(get('Diagram').querySelector('animateMotion'),null);dom.window.close();
});
test('generation uses its selected word as the next input and replaces sentiment output',()=>{
 const {dom,get}=fixture();
 assert.equal(get('Diagram').querySelector('.rnn-prediction-panel'),null);
 get('Tokens').querySelectorAll('button')[11].click();
 const chosen=get('Diagram').querySelector('.rnn-generation-panel text:nth-of-type(2)').textContent;
 get('Tokens').querySelectorAll('button')[12].click();
 assert.equal(get('Diagram').querySelector('.rnn-current-word').textContent,chosen);
 assert.equal(get('Generated'),null);
 [...get('Tokens').querySelectorAll('button')].at(-1).click();assert.equal([...get('ResponseTokens').querySelectorAll('button')].map(t=>t.textContent).join(' '),'She found a quiet place to rest.');
 get('Tokens').querySelector('button').click();assert.equal(get('Generated'),null);dom.window.close();
});

test('prompt and continuation use equal total time per word',()=>{
 const {dom,clocks,get}=fixture();const tick=()=>[...clocks.values()].forEach(fn=>fn());const delay=()=>[...clocks.values()][0].delay;
 assert.equal(delay(),600);
 for(let i=0;i<22;i++)tick();
 assert.equal(delay(),450);
 const updateDelay=delay();tick();const predictDelay=delay();tick();const feedbackDelay=delay();
 assert.equal(updateDelay+predictDelay+feedbackDelay,2*600);
 for(let i=0;i<21;i++)tick();
 assert.equal(get('Tokens').querySelector('button').getAttribute('aria-pressed'),'true');assert.equal(delay(),600);dom.window.close();
});

test('all available examples have coherent authored continuations',()=>{
 const {dom,w,get,choose}=fixture();
 for(const [key,text] of [['short','It curls up on the sofa.'],['marie','She found a quiet place to rest.'],['long','She found a quiet place to rest.']]){
  choose(key);[...get('Tokens').querySelectorAll('button')].at(-1).click();assert.equal([...get('ResponseTokens').querySelectorAll('button')].map(t=>t.textContent).join(' '),text);assert.match(get('Diagram').textContent,/END/);
 }
 assert.match(get('Demo').textContent,/authored, not predictions/);dom.window.close();
});

test('prediction reads the state and processing the next word updates it',()=>{
 const {dom,get,clocks}=fixture();const tick=()=>[...clocks.values()].forEach(fn=>fn());
 for(let i=0;i<22;i++)tick();
 const values=()=>[...get('Diagram').querySelectorAll('.prior-blocks [data-state-value]')].map(n=>n.dataset.stateValue);
 const before=values();tick();assert.deepEqual(values(),before);
 assert.equal(get('Diagram').classList.contains('rnn-predicting'),false);
 assert.ok(get('Diagram').querySelector('.rnn-phase-predict'));
 assert.equal(get('Diagram').querySelector('animateMotion[path="M697 341V420H140V401"]'),null);
 tick();assert.equal(get('Diagram').dataset.phase,'feedback');assert.deepEqual(values(),before);
 assert.ok(get('Diagram').querySelector('animateMotion[path="M1020 288H1060V120H142V175"]'));
 tick();assert.equal(get('Diagram').classList.contains('rnn-predicting'),false);assert.equal(get('Diagram').dataset.phase,'state');assert.notDeepEqual(values(),before);dom.window.close();
});

test('every prompt and continuation word receives the preceding updated impression',()=>{
 const {dom,get,choose}=fixture();
 for(const example of ['short','marie','long']) {
  choose(example);let previous=['0','0','0'];
  for(const tile of [...get('Tokens').querySelectorAll('button')]) {
   tile.click();
   const values=group=>[...get('Diagram').querySelectorAll('.'+group+' [data-state-value]')].map(n=>n.dataset.stateValue);
   assert.deepEqual(values('prior-blocks'),previous);
   previous=values('updated-blocks');
  }
 }
 assert.doesNotMatch(fs.readFileSync('assets/css/pages/llm-rnn.css','utf8'),/(?:^|[;{])opacity:\.18|rnn-predicting/);
 dom.window.close();
});

test('signal plot accumulates actual fluctuating values and restores selected positions',()=>{
 const {dom,get}=fixture();const tiles=[...get('Tokens').querySelectorAll('button')];
 const points=()=>get('InfluencePlot').querySelector('polyline').getAttribute('points').split(' ').map(p=>p.split(',').map(Number));
 assert.equal(points().length,1);tiles.at(-1).click();const all=points();assert.equal(all.length,tiles.length);
 assert.ok(all.at(-1)[1]>all[0][1]);assert.ok(all.some((p,i)=>i>0&&p[1]<all[i-1][1]));
 tiles[5].click();assert.deepEqual(points(),all.slice(0,6));assert.match(get('InfluencePlot').getAttribute('aria-label'),/Logarithmic/);dom.window.close();
});
