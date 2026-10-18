const fs=require('fs'),test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('../tools/llm-tokenizer/node_modules/jsdom');
function fixture(reduced=false){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));
 const dom=new JSDOM(fs.readFileSync('ai100/llm_explorer.html','utf8'),{runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc,url:'http://localhost/ai100/llm_explorer.html?chapter=4&scene=4'}),w=dom.window;
 w.SVGSVGElement.prototype.pauseAnimations=function(){this.dataset.paused='true';};
 w.SVGSVGElement.prototype.unpauseAnimations=function(){this.dataset.paused='false';};
 w.SVGElement.prototype.beginElementAt=function(delay){this.dataset.startCount=String(Number(this.dataset.startCount||0)+1);this.dataset.startedAfter=String(delay);};
 const jobs=new Map();let time=0,id=0,changeMotion;
 w.Date.now=()=>time;w.setTimeout=(fn,ms)=>{jobs.set(++id,{fn,ms});return id;};w.clearTimeout=i=>jobs.delete(i);
 const motion={matches:reduced,addEventListener:(_,fn)=>{changeMotion=fn;}};w.matchMedia=()=>motion;
 for(const n of ['llm-explorer','llm-qk-model','llm-stack'])w.eval(fs.readFileSync('assets/js/ai100/'+n+'.js','utf8'));
 const get=n=>w.document.getElementById('stack'+n),values=n=>[...get(n).querySelectorAll('[data-state-value]')].map(v=>Number(v.dataset.stateValue));
 const tick=()=>{assert.equal(jobs.size,1);const [i,j]=jobs.entries().next().value;jobs.delete(i);time+=j.ms;j.fn();};
 return {w,dom,get,values,tick,jobs,errors,motion,changeMotion,elapse:ms=>{time+=ms;},close:()=>{assert.deepEqual(errors,[]);dom.window.close();}};
}
test('nine exact steps preserve numerical handoffs and finish without looping',()=>{
 const f=fixture(),{get,values}=f;
 const initial=values('CurrentVector'),final=values('OutputVector');let last=initial;
 assert.equal(get('Phase').querySelectorAll('[data-state="pending"]').length,3);assert.equal(get('Play').closest('[role="toolbar"]').className,'map-transport rnn-transport');
 for(let phase=0;phase<9;phase++){
  get('Step').click();assert.equal(get('Demo').dataset.phase,String(phase));
  assert.equal(get('Phase').querySelectorAll('[data-phase-indicator]').length,3);
  const current=values('CurrentVector');
  if(phase%3===1)assert.notDeepEqual(current,last);else assert.deepEqual(current,last);
  last=current;
  assert.equal(get('Demo').querySelectorAll('.stack-pulse').length,0);assert.equal(f.jobs.size,0);
 }
 assert.deepEqual(last,final);assert.equal(get('Step').disabled,true);assert.equal(get('Play').getAttribute('aria-label'),'Replay');
 get('Reset').click();assert.deepEqual(values('CurrentVector'),initial);assert.equal(get('Phase').querySelectorAll('[data-state="pending"]').length,3);assert.equal(get('Connections').dataset.layer,'0');f.close();
});
test('play pulses concurrently, pause/resume preserves phase and process completion commits values',()=>{
 const f=fixture(),{get,values}=f;const initial=values('CurrentVector');
 get('Play').click();assert.equal(get('Demo').dataset.phase,'0');assert.equal(get('Connections').querySelectorAll('.stack-pulse').length,18);
 assert.equal(new Set([...get('Connections').querySelectorAll('.stack-pulse animateMotion')].map(n=>n.getAttribute('dur'))).size,1);
 f.elapse(400);get('Play').click();assert.equal(f.jobs.size,0);assert.equal(get('Demo').dataset.phase,'0');assert.equal(get('Demo').querySelectorAll('.stack-pulse').length,18);
 get('Play').click();assert.equal([...f.jobs.values()][0].ms,900);
 f.tick();assert.equal(get('Demo').dataset.phase,'1');assert.deepEqual(values('CurrentVector'),initial);
 f.elapse(200);get('Play').click();assert.deepEqual(values('CurrentVector'),initial);get('Play').click();f.tick();
 assert.equal(get('Demo').dataset.phase,'2');const updated=values('CurrentVector');assert.notDeepEqual(updated,initial);
 f.tick();assert.equal(get('Demo').dataset.phase,'3');assert.deepEqual(values('CurrentVector'),updated);assert.equal(get('Phase').dataset.layer,'1');
 let ticks=0;while(f.jobs.size&&ticks++<12)f.tick();assert.equal(ticks,6);assert.equal(get('Demo').dataset.phase,'8');assert.equal(f.jobs.size,0);assert.equal(get('Play').getAttribute('aria-pressed'),'false');
 get('Play').click();assert.equal(get('Demo').dataset.phase,'0');assert.deepEqual(values('CurrentVector'),initial);get('Reset').click();f.close();
});
test('selection, examples, reset, navigation and reduced motion clear transient effects',()=>{
 const f=fixture(),{get,w}=f;
 const start=()=>get('Play').click(),stopped=()=>{assert.equal(f.jobs.size,0);assert.equal(get('Demo').querySelectorAll('.stack-pulse').length,0);assert.equal(get('Phase').querySelectorAll('[data-state="pending"]').length,3);};
 start();get('Tokens').querySelector('[data-token="3"]').dispatchEvent(new w.MouseEvent('click'));stopped();assert.match(get('TokenLabel').textContent,/pizzas/);
 start();get('Diagram').querySelector('[data-stage="2"]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));stopped();assert.equal(get('Connections').dataset.layer,'2');
 start();get('PickerMenu').children[2].click();stopped();assert.match(get('TokenLabel').textContent,/chased/);
 start();get('Tokens').querySelector('[data-token="0"]').onpointerenter();stopped();assert.match(get('Explanation').textContent,/available context/);
 start();w.document.getElementById('nextBtn').click();stopped();w.document.getElementById('prevBtn').click();
 start();f.motion.matches=true;f.changeMotion();assert.equal(f.jobs.size,0);assert.equal(get('Demo').querySelectorAll('animateMotion').length,0);get('Reset').click();f.close();
 const r=fixture(true);r.get('Play').click();assert.equal(r.get('Demo').querySelectorAll('animateMotion').length,0);r.tick();assert.equal(r.get('Demo').dataset.phase,'1');assert.notDeepEqual(r.values('CurrentVector'),[.2,1.5,0]);r.get('Play').click();r.get('Step').click();assert.equal(r.get('Demo').dataset.phase,'2');r.get('Reset').click();r.close();
});

test('temporary token, particles, color transforms and moving vectors retain exact paths and pause state',()=>{
 const f=fixture(),{get,values}=f;
 const originalWords=get('Tokens').querySelectorAll('[data-token]').length;
 get('Play').click();
 const overlay=get('Connections'),flight=overlay.querySelector('.stack-token-flight');
 assert.ok(flight);assert.equal(flight.querySelector('text').textContent,'they');assert.equal(get('Tokens').querySelectorAll('[data-token]').length,originalWords);
 const paths=[...overlay.querySelectorAll('.attention-connection')].map(n=>n.getAttribute('d'));
 const particles=[...overlay.querySelectorAll('.stack-pulse')];assert.equal(particles.length,paths.length*3);
 paths.forEach((path,i)=>particles.slice(i*3,i*3+3).forEach(n=>assert.equal(n.querySelector('animateMotion').getAttribute('path'),path)));
 assert.ok(particles.every(n=>n.querySelector('circle').getAttribute('r')==='5'));
 assert.ok([...get('Demo').querySelectorAll('.stack-transient animateMotion')].every(n=>n.dataset.startCount==='1'));
 get('Play').click();assert.equal(overlay.dataset.paused,'true');assert.equal(overlay.querySelector('.stack-token-flight'),flight);
 get('Play').click();assert.equal(overlay.dataset.paused,'false');assert.equal(overlay.querySelector('.stack-token-flight'),flight);
 assert.ok([...get('Demo').querySelectorAll('.stack-transient animateMotion')].every(n=>n.dataset.startCount==='1'));
 f.tick();assert.equal(get('Demo').querySelectorAll('.stack-token-flight').length,0);assert.equal(get('Demo').querySelectorAll('.stack-pulse').length,0);
 assert.equal(get('CurrentVector').querySelectorAll('animate[attributeName="fill"]').length,3);
 assert.ok(get('Demo').querySelector('.stack-processing-sweep'));
 const colors=[...get('CurrentVector').querySelectorAll('animate')].map(n=>n.getAttribute('to'));
 f.tick();const moving=get('Demo').querySelector('.stack-moving-vector');assert.ok(moving);
 assert.deepEqual([...moving.querySelectorAll('[data-state-value]')].map(n=>Number(n.dataset.stateValue)),values('CurrentVector'));
 assert.deepEqual([...moving.querySelectorAll('rect')].map(n=>n.getAttribute('fill')),colors);
 assert.equal(moving.querySelector('animateMotion').getAttribute('path'),get('Diagram').querySelector('[data-edge="1"]').getAttribute('d'));
 get('Play').click();assert.equal(get('Demo').querySelector('.stack-moving-vector'),moving);get('Play').click();assert.equal(get('Demo').querySelector('.stack-moving-vector'),moving);
 f.tick();assert.equal(get('Demo').querySelectorAll('.stack-moving-vector').length,0);
 while(f.jobs.size)f.tick();assert.equal(get('Demo').querySelectorAll('.stack-transient').length,0);assert.equal(get('Demo').querySelectorAll('.rnn-svg-values').length,0);
 get('Reset').click();assert.equal(get('Demo').querySelectorAll('.stack-transient').length,0);f.close();
});

test('persistent indicators follow the active layer and reset after every handoff',()=>{
 const f=fixture(),{get,w}=f;
 const states=()=>[...get('Phase').querySelectorAll('[data-state]')].map(n=>n.dataset.state);
 assert.deepEqual(states(),['pending','pending','pending']);
 get('Diagram').querySelector('[data-stage="2"]').dispatchEvent(new w.MouseEvent('click'));
 assert.equal(get('Phase').dataset.layer,'2');assert.deepEqual(states(),['pending','pending','pending']);
 get('Play').click();
 for(let phase=0;phase<9;phase++){
  assert.equal(get('Demo').dataset.phase,String(phase));
  assert.equal(get('Phase').dataset.layer,String(Math.floor(phase/3)));
  assert.deepEqual(states(),[0,1,2].map(i=>i<phase%3?'completed':i===phase%3?'active':'pending'));
  assert.equal(get('Phase').querySelectorAll('.stack-phase-link').length,3);
  assert.equal(get('Diagram').querySelectorAll('[data-stage]').length,3);
  if(phase===3||phase===6)assert.ok(get('Diagram').querySelector('[data-stage="'+Math.floor(phase/3)+'"]').classList.contains('stack-arriving'));
  if(phase===4){get('Play').click();assert.deepEqual(states(),['completed','active','pending']);get('Play').click();}
  f.tick();
 }
 assert.deepEqual(states(),['completed','completed','completed']);assert.equal(f.jobs.size,0);
 assert.equal(get('Demo').querySelectorAll('.stack-moving-vector').length,0);
 get('Reset').click();assert.deepEqual(states(),['pending','pending','pending']);assert.equal(get('Phase').dataset.layer,'0');f.close();
});

test('simulation details are collapsed and independent of playback and selection',()=>{
 const f=fixture(),{get}=f,details=get('About');
 assert.equal(details.open,false);assert.equal(details.className,'tokens-about');
 assert.equal(details.querySelector('summary').textContent,'About this teaching simulation');
 for(const label of ['Learned parameters:','Context connections:','Token processing:','Teaching model:','Software vs. hardware:','Vector colors:'])assert.ok(details.textContent.includes(label));
 assert.equal(get('Demo').querySelector('.tokens-input-footer'),null);
 const labels=[...get('Demo').querySelectorAll('.tokens-feedback strong')].map(n=>n.textContent);
 assert.equal(labels.filter(s=>s==='Discovery:').length,1);assert.equal(labels.filter(s=>s==='Next:').length,1);
 assert.equal(details.previousElementSibling.className,'tokens-feedback');
 get('Play').click();const phase=get('Demo').dataset.phase,target=get('TokenLabel').textContent,layer=get('Connections').dataset.layer;
 const timers=[...f.jobs.keys()],flight=get('Demo').querySelector('.stack-token-flight');
 details.open=true;details.dispatchEvent(new f.w.Event('toggle'));details.open=false;details.dispatchEvent(new f.w.Event('toggle'));
 assert.deepEqual([...f.jobs.keys()],timers);assert.equal(get('Demo').dataset.phase,phase);assert.equal(get('TokenLabel').textContent,target);assert.equal(get('Connections').dataset.layer,layer);assert.equal(get('Demo').querySelector('.stack-token-flight'),flight);
 f.tick();assert.equal(get('Demo').dataset.phase,'1');get('Reset').click();f.close();
});

test('QKV refresher reuses the shared tooltip without changing playback or selections',()=>{
 const f=fixture(),{get,w}=f,info=get('QKVInfo');
 const tip=()=>w.document.getElementById('llmTooltip');
 assert.equal(info.closest('[data-phase-indicator]'),null);
 assert.equal(get('Demo').querySelectorAll('#stackQKVInfo').length,1);
 assert.equal(tip(),null);
 info.dispatchEvent(new w.Event('pointerover',{bubbles:true}));
 assert.ok(tip());assert.equal(tip().className,'llm-tooltip');assert.match(tip().textContent,/Query: What information am I looking for/);assert.match(tip().textContent,/Key: What information can I be matched on/);assert.match(tip().textContent,/Value: What information do I contribute/);
 info.dispatchEvent(new w.Event('pointerout',{bubbles:true}));assert.equal(tip(),null);
 info.dispatchEvent(new w.FocusEvent('focusin',{bubbles:true}));assert.ok(tip());
 info.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(tip(),null);
 get('Play').click();const phase=get('Demo').dataset.phase,layer=get('Connections').dataset.layer,target=get('TokenLabel').textContent,jobs=[...f.jobs.keys()];
 info.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.ok(tip());
 assert.equal(get('Demo').dataset.phase,phase);assert.equal(get('Connections').dataset.layer,layer);assert.equal(get('TokenLabel').textContent,target);assert.deepEqual([...f.jobs.keys()],jobs);
 f.tick();assert.equal(get('QKVInfo'),info);assert.ok(tip());assert.equal(get('Demo').dataset.phase,'1');
 info.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.equal(tip(),null);
 info.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.ok(tip());
 info.dispatchEvent(new w.FocusEvent('focusout',{bubbles:true}));assert.equal(tip(),null);
 while(f.jobs.size)f.tick();info.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.ok(tip());
 get('Reset').click();f.close();
});
