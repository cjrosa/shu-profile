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
 const {dom,w,get}=fixture();assert.equal(get('Demo').hidden,false);assert.equal(get('Tokens').children.length,19);
 assert.ok(get('Diagram').querySelector('.rnn-flow-diagram'));assert.equal(get('Previous'),null);
 const start=get('Diagram').innerHTML;get('Tokens').children[1].click();const second=get('Diagram').innerHTML;get('Tokens').firstChild.click();assert.equal(get('Diagram').innerHTML,start);get('Tokens').children[1].click();assert.equal(get('Diagram').innerHTML,second);
 const prior=[...get('Diagram').querySelectorAll('.prior-blocks [data-state-value]')].map(n=>Number(n.dataset.stateValue));
 get('Tokens').firstChild.click();const updated=[...get('Diagram').querySelectorAll('.updated-blocks [data-state-value]')].map(n=>Number(n.dataset.stateValue));assert.deepEqual(prior,updated);
 get('Tokens').lastChild.click();assert.equal(get('Advance'),null);assert.equal(get('Chain'),null);
 get('Tokens').firstChild.click();assert.equal(get('Diagram').innerHTML,start);dom.window.close();
});
test('examples, empty and hostile text, keyboard selection, reduced motion',()=>{
 const {dom,w,get,choose}=fixture(true);
 for(const key of ['short','long','marie','own']){choose(key);assert.equal(get('Tokens').firstChild.getAttribute('aria-pressed'),'true')}
 get('Input').value='<img src=x> café';get('Input').dispatchEvent(new w.Event('input'));assert.equal(get('Demo').querySelector('img'),null);
 get('Tokens').firstChild.dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.equal(get('Tokens').lastChild.getAttribute('aria-pressed'),'true');
 assert.equal(get('Diagram').querySelector('animateMotion'),null);
 get('Input').value=' ';get('Input').dispatchEvent(new w.Event('input'));assert.equal(get('Diagram').children.length,0);assert.equal(get('Advance'),null);dom.window.close();
});
test('automatic loop survives removal of controls and stops on navigation or inspection',()=>{
 const {dom,w,get,choose,clocks}=fixture();
 for(const name of ['Previous','Advance','Play','Reset','Status'])assert.equal(get(name),null);
 assert.equal(clocks.size,1);const tick=()=>[...clocks.values()].forEach(fn=>fn());
 tick();assert.ok(get('Diagram').querySelector('.rnn-phase-carry'));
 tick();assert.equal(get('Tokens').children[1].getAttribute('aria-pressed'),'true');
 get('Tokens').firstChild.click();assert.equal(clocks.size,0);
 choose('short');for(let i=0;i<24;i++)tick();assert.equal(get('Tokens').firstChild.getAttribute('aria-pressed'),'true');
 w.document.getElementById('nextBtn').click();assert.equal(clocks.size,0);
 w.document.getElementById('prevBtn').click();assert.equal(clocks.size,1);dom.window.close();
});
test('reduced motion remains manually explorable without autoplay',()=>{
 const {dom,get,choose,clocks}=fixture(true);choose('long');assert.equal(clocks.size,0);
 get('Tokens').children[2].click();assert.equal(get('Diagram').querySelector('animateMotion'),null);dom.window.close();
});
test('generation uses its selected word as the next input and replaces sentiment output',()=>{
 const {dom,get}=fixture();
 assert.equal(get('Diagram').querySelector('.rnn-prediction-panel'),null);
 get('Tokens').children[11].click();
 const chosen=get('Diagram').querySelector('.rnn-generation-panel text:nth-of-type(2)').textContent;
 get('Tokens').children[12].click();
 assert.equal(get('Diagram').querySelector('.rnn-current-word').textContent,chosen);
 assert.equal(get('Generated').textContent,chosen);
 get('Tokens').lastChild.click();assert.equal(get('Generated').textContent,'She found a quiet place to rest.');
 get('Tokens').firstChild.click();assert.equal(get('Generated').textContent,'Reading the prompt...');dom.window.close();
});

test('prompt reading is faster than generation and resets speed on loop',()=>{
 const {dom,clocks,get}=fixture();const tick=()=>[...clocks.values()].forEach(fn=>fn());const delay=()=>[...clocks.values()][0].delay;
 assert.equal(delay(),350);
 for(let i=0;i<22;i++)tick();
 assert.equal(delay(),1200);
 for(let i=0;i<23;i++)tick();
 assert.equal(get('Tokens').firstChild.getAttribute('aria-pressed'),'true');assert.equal(delay(),350);dom.window.close();
});

test('all continuations are coherent authored text and custom continuation is editable',()=>{
 const {dom,w,get,choose}=fixture();
 for(const [key,text] of [['short','It curls up on the sofa.'],['marie','She found a quiet place to rest.'],['long','She found a quiet place to rest.']]){
  choose(key);get('Tokens').lastChild.click();assert.equal(get('Generated').textContent,text);assert.match(get('Diagram').textContent,/END/);
 }
 choose('own');get('Continuation').value='A new chapter begins.';get('Continuation').dispatchEvent(new w.Event('input'));get('Tokens').lastChild.click();assert.equal(get('Generated').textContent,'A new chapter begins.');
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
 for(const example of ['short','marie','long','own']) {
  choose(example);let previous=['0','0','0'];
  for(const tile of [...get('Tokens').children]) {
   tile.click();
   const values=group=>[...get('Diagram').querySelectorAll('.'+group+' [data-state-value]')].map(n=>n.dataset.stateValue);
   assert.deepEqual(values('prior-blocks'),previous);
   previous=values('updated-blocks');
  }
 }
 assert.doesNotMatch(fs.readFileSync('assets/css/pages/llm-rnn.css','utf8'),/opacity:\.18|rnn-predicting/);
 dom.window.close();
});
