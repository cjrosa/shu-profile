const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const Sim = require('../assets/js/email-simulation.js');
function fixture() {
  const elements = new Map(), timers = new Map(); let serial = 0;
  function element() {
    const classes = new Set();
    return { attrs:{}, listeners:{}, children:[], textContent:'', hidden:false, disabled:false,
      classList:{toggle(k,v){if(v)classes.add(k);else classes.delete(k);}},
      setAttribute(k,v){this.attrs[k]=v;}, addEventListener(k,v){this.listeners[k]=v;},
      append(...c){this.children.push(...c);}, replaceChildren(...c){this.children=c;}
    };
  }
  const html = fs.readFileSync('cs339/email_explorer.html','utf8');
  for (const [,id] of html.matchAll(/\bid="([^"]+)"/g)) { assert.ok(!elements.has(id)); elements.set(id,element()); }
  const el=id=>{assert.ok(elements.has(id),id);return elements.get(id);};
  const doc={hidden:false,listeners:{},getElementById:el,createElement:element,addEventListener(k,v){this.listeners[k]=v;}};
  vm.runInNewContext(fs.readFileSync('assets/js/email-explorer.js','utf8'),{document:doc,EmailSimulation:Sim,setInterval(fn){const id=++serial;timers.set(id,fn);return id;},clearInterval(id){timers.delete(id);}});
  const click=id=>{const e=typeof id==='string'?el(id):id;assert.ok(!e.disabled);e.listeners.click();};
  return {el,click,timers,doc,stage(i){click(el('stages').children[i]);},tick(){for(const fn of [...timers.values()])fn();}};
}
test('play pause replay stage changes and restart have no orphan timers',()=>{
  const f=fixture(); f.click('play'); assert.equal(f.timers.size,1);
  f.tick(); f.click('play'); assert.equal(f.timers.size,0);
  assert.match(f.el('event-count').textContent,/Step 1/);
  f.click('play'); f.stage(2); assert.equal(f.timers.size,0);
  f.click('play'); f.click('replay'); assert.equal(f.timers.size,0);assert.match(f.el('event-count').textContent,/Step 0/);
  f.click('play'); f.click('restart'); assert.equal(f.timers.size,0);assert.equal(f.el('lesson-title').textContent,Sim.lessons[0].title);
});
test('play ends automatically and mode changes reset active playback',()=>{
  const f=fixture();f.click('play');for(let i=0;i<5;i++)f.tick();
  assert.equal(f.timers.size,0);assert.equal(f.el('step').disabled,true);
  f.stage(5);f.click('play');f.el('retrieval').value='webmail';f.el('retrieval').listeners.change();
  assert.equal(f.timers.size,0);assert.equal(f.el('access-label').textContent,'HTTPS');assert.equal(f.el('webmail-note').hidden,false);
  f.click('play');f.doc.hidden=true;f.doc.listeners.visibilitychange();assert.equal(f.timers.size,0);
});
test('all questions allow retries and retain answer elements during playback',()=>{
  const f=fixture();
  for(let i=0;i<6;i++) { f.stage(i);const correct=Sim.lessons[i].question[2],answers=f.el('answers').children;
    f.click(answers[1-correct]);assert.match(f.el('feedback').textContent,/Try again/);
    f.click(answers[correct]);assert.match(f.el('feedback').textContent,/Correct/);
    f.click('step');assert.equal(f.el('answers').children[correct],answers[correct]);
  }
  f.click('back');assert.equal(f.el('lesson-title').textContent,Sim.lessons[4].title);
  f.click('next');assert.equal(f.el('next').disabled,true);
});
test('assets resolve and hub includes viewer card and recommendation registration',()=>{
  const html=fs.readFileSync('cs339/email_explorer.html','utf8');
  for(const [,ref] of html.matchAll(/(?:src|href)="(\.\.\/assets\/[^"?]+)"/g)) assert.ok(fs.existsSync(path.resolve('cs339',ref)));
  const hub=fs.readFileSync('cs339/index.html','utf8');
  assert.match(hub,/viewer.html\?tool=cs339\/email_explorer.html/);
  assert.match(hub,/name:'Email Explorer', file:'email_explorer.html'/);
  assert.match(hub,/2 Tools/); assert.match(html,/aria-live="polite"/);
});
