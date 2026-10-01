const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const Sim = require('../assets/js/email-simulation.js');
function fixture({ motion = false, reduced = false } = {}) {
  const elements = new Map(), timers = new Map(); let serial = 0;
  const frames = new Map();
  function element() {
    const classes = new Set();
    return { attrs:{}, listeners:{}, children:[], textContent:'', hidden:false, disabled:false,
      focus(){this.focused=true;}, classList:{contains(k){return classes.has(k);},toggle(k,v){if(v)classes.add(k);else classes.delete(k);}},
      setAttribute(k,v){this.attrs[k]=v;}, addEventListener(k,v){this.listeners[k]=v;},
      append(...c){this.children.push(...c);}, replaceChildren(...c){this.children=c;}
    };
  }
  const html = fs.readFileSync('cs339/email_explorer.html','utf8');
  for (const [,id] of html.matchAll(/\bid="([^"]+)"/g)) { assert.ok(!elements.has(id)); elements.set(id,element()); }
  const el=id=>{assert.ok(elements.has(id),id);return elements.get(id);};
  const doc={hidden:false,listeners:{},getElementById:el,createElement:element,addEventListener(k,v){this.listeners[k]=v;}};
  el('active-edge').getTotalLength=()=>258;
  el('active-edge').getPointAtLength=d=>({x:391+d,y:111});
  const animation = motion ? {requestAnimationFrame(fn){const id=++serial;frames.set(id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);},matchMedia(){return {matches:reduced,addEventListener(){}};}} : {};
  vm.runInNewContext(fs.readFileSync('assets/js/email-explorer.js','utf8'),{document:doc,EmailSimulation:Sim,...animation,setInterval(fn){const id=++serial;timers.set(id,fn);return id;},clearInterval(id){timers.delete(id);}});
  const click=id=>{const e=typeof id==='string'?el(id):id;assert.ok(!e.disabled);e.listeners.click();};
  return {el,click,timers,doc,frames,frame(now){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(now));},stage(i){click(el('stages').children[i]);},change(id,value){el(id).value=value;el(id).listeners.change();},finish(){let limit=30;while(!el('step').disabled&&limit-->0)click('step');assert.ok(limit>0);},answer(i){click(el('answers').children[Sim.lessons[i].question[2]]);},tick(){for(const fn of [...timers.values()])fn();}};
}
test('SMTP labels fly in command/response order and direction without restarting on inspection',()=>{
  const f=fixture({motion:true});f.click('sandbox');f.change('scenario','2');f.click('play');f.tick();
  assert.equal(f.el('packet-text').textContent,'220');assert.equal(f.el('message-packet').attrs.transform,'translate(649 111)');
  f.frame(0);f.frame(600);assert.equal(f.el('message-packet').attrs.transform,'translate(520 111)');
  const frame=[...f.frames.keys()][0];f.click('node-receiver');assert.equal([...f.frames.keys()][0],frame);
  f.frame(1400);assert.equal(f.el('packet-text').textContent,'HELO');assert.equal(f.el('message-packet').attrs.transform,'translate(391 111)');
  f.frame(2800);assert.equal(f.el('packet-text').textContent,'250');assert.equal(f.el('message-packet').attrs.transform,'translate(649 111)');
  f.click('play');assert.equal(f.frames.size,0);f.click('reset');assert.equal(f.el('message-packet').attrs.display,'none');
});
test('message content uses an envelope; reset and reduced motion prevent orphan flights',()=>{
  const f=fixture({motion:true});f.click('sandbox');f.change('scenario','2');f.click('play');
  for(let i=0;i<5;i++)f.tick();
  assert.equal(f.el('packet-envelope').attrs.visibility,'visible');assert.equal(f.el('packet-label').attrs.visibility,'hidden');
  assert.equal(f.frames.size,1);f.change('scenario','1');assert.equal(f.frames.size,0);
  const quiet=fixture({motion:true,reduced:true});quiet.click('sandbox');quiet.change('scenario','2');quiet.click('play');quiet.tick();
  assert.equal(quiet.frames.size,0);assert.equal(quiet.el('packet-text').textContent,'250');
});
test('inspection reveals first question and correct answers unlock guided stages',()=>{
  const f=fixture();assert.equal(f.el('prediction').hidden,true);assert.equal(f.el('next').disabled,true);
  assert.equal(f.el('stages').children[1].disabled,true);assert.equal(f.el('playback-controls').hidden,true);
  f.click('inspect-sender');assert.equal(f.el('prediction').hidden,false);
  f.click(f.el('answers').children[1]);assert.equal(f.el('next').disabled,true);assert.match(f.el('feedback').textContent,/Consider this/);
  f.answer(0);assert.equal(f.el('next').disabled,false);f.click('next');
  assert.equal(f.el('prediction').hidden,true);f.click('step');assert.equal(f.el('prediction').hidden,true);
  f.finish();assert.equal(f.el('prediction').hidden,false);assert.equal(f.el('next').disabled,true);
  f.answer(1);f.click('next');assert.equal(f.el('lesson-title').textContent,Sim.lessons[2].title);
});
test('all six stages finish, replay relocks, Back restores state and answers',()=>{
  const f=fixture();f.click('inspect-sender');f.answer(0);f.click('next');
  for(let i=1;i<6;i++) { f.finish();f.answer(i);if(i<5)f.click('next'); }
  f.click('next');assert.equal(f.el('progress-label').textContent,'Lesson complete');
  f.click('back');assert.equal(f.el('next').disabled,false);assert.equal(f.el('step').disabled,true);
  f.click('replay');assert.equal(f.el('prediction').hidden,true);assert.equal(f.el('next').disabled,true);
  f.finish();f.answer(4);f.click('next');assert.equal(f.el('progress-label').textContent,'Lesson complete');
  f.click('next');assert.equal(f.el('sandbox').attrs['aria-pressed'],'true');
  f.click('guided');f.click('restart');assert.equal(f.el('next').disabled,true);assert.equal(f.el('stages').children[1].disabled,true);
});
test('stage 6 offers the matching question and Finish for IMAP and webmail',()=>{
  const f=fixture();f.click('inspect-sender');f.answer(0);f.click('next');
  for(let i=1;i<5;i++){f.finish();f.answer(i);f.click('next');}
  for(const mode of ['imap','webmail']) {
    if(mode==='webmail')f.change('retrieval',mode);
    assert.equal(f.el('prediction').hidden,true);assert.equal(f.el('next').disabled,true);
    f.finish();assert.equal(f.el('prediction').hidden,false);
    assert.match(f.el('question').textContent,mode==='imap'?/IMAP keep messages/:/browser to a webmail/);
    f.click(f.el('answers').children[0]);assert.equal(f.el('next').disabled,true);
    f.answer(5);assert.equal(f.el('next').disabled,false);assert.equal(f.el('next').textContent,'Finish lesson');
    f.click('next');assert.equal(f.el('progress-label').textContent,'Lesson complete');
  }
});
test('play pause, replay, mode switches, retrieval changes, and tab hiding clear timers',()=>{
  const f=fixture();f.click('sandbox');f.click('play');assert.equal(f.timers.size,1);assert.equal(f.el('step').disabled,true);
  f.tick();f.click('play');assert.equal(f.timers.size,0);assert.equal(f.el('network').classList.contains('playing'),false);
  f.click('play');f.click('reset');assert.equal(f.timers.size,0);assert.match(f.el('event-count').textContent,/0 \/ /);
  f.click('play');f.change('scenario','5');assert.equal(f.timers.size,0);
  f.click('play');f.change('retrieval','webmail');assert.equal(f.timers.size,0);assert.match(f.el('access-label').textContent,/HTTPS/);
  f.click('play');f.doc.hidden=true;f.doc.listeners.visibilitychange();assert.equal(f.timers.size,0);
  f.click('play');for(let i=0;i<6;i++)f.tick();assert.equal(f.timers.size,0);assert.equal(f.el('step').disabled,true);
  f.click('guided');assert.equal(f.el('prediction').hidden,true);
});
test('nodes are keyboard selectable and inspector tracks queue and mailbox',()=>{
  const f=fixture();let prevented=false;
  f.el('node-sender').listeners.keydown({key:'Enter',preventDefault(){prevented=true;}});
  assert.ok(prevented);assert.equal(f.el('node-sender').attrs['aria-pressed'],'true');assert.match(f.el('storage-title').textContent,/queue/);
  f.click('sandbox');f.click('step');f.click('step');assert.equal(f.el('storage-content').children.length,2);
  f.click('node-receiver');assert.match(f.el('storage-content').children[0].textContent,/0 messages/);
  f.finish();assert.match(f.el('storage-content').children[0].textContent,/1 message/);
  f.click('deselect-node');assert.equal(f.el('inspector-empty').hidden,false);assert.equal(f.el('node-receiver').focused,true);
});
test('trace selection stays pinned during playback and Back restores it',()=>{
  const f=fixture();f.click('inspect-sender');f.answer(0);f.click('next');f.click('step');
  const first=f.el('history').children[0].children[0].children[0];f.click(first);f.click('step');
  assert.equal(f.el('history').children[0].children[0].children[0],first);assert.match(f.el('trace-detail-title').textContent,/Event 1/);
  f.click('back');f.click('next');assert.match(f.el('event-count').textContent,/2 \/ 6/);assert.match(f.el('trace-detail-title').textContent,/Event 1/);
  f.click('trace-follow');assert.match(f.el('trace-detail-title').textContent,/Event 2/);
});
test('anatomy highlights and free exploration do not overwrite guided progress',()=>{
  const f=fixture();f.click('inspect-sender');f.answer(0);f.click('next');f.click('step');
  f.click('sandbox');f.change('scenario','3');assert.equal(f.el('message-reference').open,true);
  f.click('step');assert.equal(f.el('anatomy-envelope').classList.contains('anatomy-active'),true);
  f.click('step');assert.equal(f.el('anatomy-headers').classList.contains('anatomy-active'),true);
  assert.equal(f.el('prediction').hidden,true);f.click('guided');assert.match(f.el('event-count').textContent,/1 \/ 6/);
});
test('shared DNS styles, accessible topology and hub viewer link resolve',()=>{
  const html=fs.readFileSync('cs339/email_explorer.html','utf8');
  for(const [,ref] of html.matchAll(/(?:src|href)="(\.\.\/assets\/[^"?]+)"/g))assert.ok(fs.existsSync(path.resolve('cs339',ref)));
  assert.match(html,/dns-explorer.css/);assert.match(html,/class="laptop-base"/);assert.match(html,/class="server-slots"/);
  assert.doesNotMatch(html,/Alice\?s|Bob\?s| \? /);
  assert.equal((html.match(/role="button" tabindex="0"/g)||[]).length,4);
  assert.match(html,/aria-live="polite"/);assert.match(fs.readFileSync('cs339/index.html','utf8'),/viewer.html\?tool=cs339\/email_explorer.html/);
});

test('subject follows composition, queue, delivery and reading, and replay clears preview',()=>{
  const f=fixture();f.click('inspect-sender');f.answer(0);f.click('next');
  assert.equal(f.el('message-preview').hidden,true);
  f.click('step');assert.match(f.el('preview-caption').textContent,/composed/);
  assert.deepEqual(f.el('preview-headers').children.map(e=>e.textContent),Sim.message.slice(0,3));
  assert.equal(f.el('preview-body').textContent,Sim.message[4]);
  f.click('step');assert.match(f.el('preview-caption').textContent,/queued/);
  f.click('node-sender');assert.equal(f.el('storage-content').children[1].children[0].textContent,Sim.message[2]);
  f.click('step');f.click('step');assert.match(f.el('preview-caption').textContent,/in transit/);
  f.click('step');assert.match(f.el('preview-caption').textContent,/server.*stored/);
  f.click('node-receiver');assert.equal(f.el('storage-content').children[1].children[0].textContent,Sim.message[2]);
  f.click('step');assert.match(f.el('preview-caption').textContent,/received.*IMAP/);
  f.click('replay');assert.equal(f.el('message-preview').hidden,true);
});

test('SMTP DATA preview exposes subject and separator without opening trace',()=>{
  const f=fixture();f.click('sandbox');f.change('scenario','2');
  for(let i=0;i<5;i++)f.click('step');
  assert.equal(f.el('preview-separator').hidden,true);
  f.click('step');assert.match(f.el('preview-caption').textContent,/SMTP DATA/);
  assert.equal(f.el('preview-separator').hidden,false);
  assert.equal(f.el('preview-headers').children[2].textContent,'Subject: Lunch plans');
  assert.match(f.el('preview-note').textContent,/not an SMTP command/);
  f.click('reset');assert.equal(f.el('message-preview').hidden,true);
  f.change('scenario','3');f.click('step');f.click('step');
  assert.equal(f.el('preview-separator').hidden,false);
});

test('reading preview waits for retrieval and disappears after deletion or access mode reset',()=>{
  const f=fixture();f.click('sandbox');f.change('scenario','5');
  assert.equal(f.el('message-preview').hidden,true);
  f.click('step');assert.match(f.el('preview-caption').textContent,/server.*stored/);
  f.click('step');assert.match(f.el('preview-caption').textContent,/received.*IMAP/);
  f.click('step');f.click('step');assert.equal(f.el('message-preview').hidden,true);
  f.change('retrieval','webmail');assert.equal(f.el('message-preview').hidden,true);
  f.click('step');assert.match(f.el('preview-caption').textContent,/not yet displayed/);
  f.click('step');assert.match(f.el('preview-caption').textContent,/browser.*HTTPS/);
  assert.equal(f.el('preview-headers').children[2].textContent,Sim.message[2]);
});
