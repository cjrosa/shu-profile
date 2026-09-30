const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const Sim = require('../assets/js/dns-simulation.js');
// DOM fixture checks controls and lifecycle; it does not assert browser layout.
function fixture() {
  const html = fs.readFileSync('cs339/dns_explorer.html', 'utf8'), elements = new Map(), timers = new Map(); let serial = 0;
  function element(id = '') {
    const classes = new Set();
    return { id, dataset: {}, attrs: {}, listeners: {}, children: [], textContent: '', value: '', disabled: false, hidden: false,
      focus() { this.focused=true; }, classList: { contains(key) { return classes.has(key); }, toggle(key, enabled) { if(enabled)classes.add(key);else classes.delete(key); } },
      setAttribute(key, value) { this.attrs[key] = value; }, addEventListener(key, fn) { this.listeners[key] = fn; },
      append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; }
    };
  }
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) { assert.ok(!elements.has(id), `duplicate id ${id}`); elements.set(id, element(id)); }
  const presets = [...html.matchAll(/data-preset="([^"]+)"/g)].map(([,preset]) => { const e = element(); e.dataset.preset = preset; return e; });
  const el = id => { assert.ok(elements.has(id), `missing DOM element: ${id}`); return elements.get(id); };
  const doc = { hidden: false, listeners: {}, getElementById: el, createElement: () => element(), querySelectorAll: () => presets, addEventListener(key,fn) { this.listeners[key] = fn; } };
  vm.runInNewContext(fs.readFileSync('assets/js/dns-explorer.js','utf8'), { document: doc, DNSSimulation: Sim, setInterval: fn => { const id = ++serial; timers.set(id,fn); return id; }, clearInterval: id => timers.delete(id) });
  const click = id => { const e = typeof id === 'string' ? el(id) : id; assert.ok(!e.disabled, `cannot click disabled ${e.id}`); e.listeners.click(); };
  const completeQuestion = () => {
    const stage = Array.from({length:6},(_,i)=>i).find(i=>el('stage-'+i).attrs['aria-current']==='step');
    if(stage===1)click('node-auth-shu');
    if(stage>=2){if(stage===4 && el('prediction').hidden)click('change-address');let limit=40;while(!el('step').disabled&&limit-->0)click('step');}
    click(el('answers').children[[0,1,1,0,0,1][stage]]);
  };
  const advance = () => {completeQuestion();click('next');};
  const goStage = index => {while(el('stage-'+index).disabled)advance();click('stage-'+index);};
  return { el, click, timers, completeQuestion, advance, goStage, preset: name => click(presets.find(p => p.dataset.preset === name)), change(id,value) { el(id).value=value; el(id).listeners.change(); }, tick() { for(const fn of [...timers.values()])fn(); }, finish() { let remaining = 40; while(!el('step').disabled && remaining-- > 0) click('step'); assert.ok(remaining > 0); }, hide() { doc.hidden=true; doc.listeners.visibilitychange(); } };
}
const rows = (f,id) => f.el(id).children[0].children[2].children;
test('questions follow demonstrations and correct answers unlock progression', () => {
 const f=fixture();
 assert.equal(f.el('next').disabled,true);
 assert.equal(f.el('stage-2').disabled,true);
 f.el('stage-2').listeners.click(); assert.match(f.el('progress-label').textContent,/Stage 1/);
 f.click(f.el('answers').children[1]);assert.equal(f.el('next').disabled,true);
 f.el('next').listeners.click();assert.match(f.el('progress-label').textContent,/Stage 1/);
 f.advance();assert.equal(f.el('prediction').hidden,true);
 f.click('node-auth-shu');assert.equal(f.el('prediction').hidden,false);
 f.advance();
 for(const stage of [2,3]){
  assert.equal(f.el('prediction').hidden,true);f.click('step');f.click('step');
  assert.equal(f.el('prediction').hidden,true);assert.equal(f.el('next').disabled,true);
  f.finish();assert.equal(f.el('prediction').hidden,false);
  assert.equal(f.el('prediction').classList.contains('question-pulse'),true);
  f.advance();
 }
 f.finish();assert.equal(f.el('prediction').hidden,true);
 f.click('change-address');assert.equal(f.el('prediction').hidden,true);
 f.finish();assert.equal(f.el('prediction').hidden,false);f.advance();
 f.finish();assert.equal(f.el('prediction').hidden,false);f.advance();
 assert.match(f.el('progress-label').textContent,/Lesson complete/);
});
test('replay hides the question and relocks progression until demonstrated and answered',()=>{
 const f=fixture();f.goStage(2);f.finish();f.completeQuestion();
 f.click('next');f.click('back');assert.equal(f.el('next').disabled,false);
 f.click('replay');assert.equal(f.el('prediction').hidden,true);assert.equal(f.el('next').disabled,true);
 f.finish();assert.equal(f.el('prediction').classList.contains('question-pulse'),true);
 f.el('prediction').listeners.animationend({animationName:'question-pulse'});
 f.click('node-root');assert.equal(f.el('prediction').classList.contains('question-pulse'),false);
 f.completeQuestion();assert.equal(f.el('prediction').classList.contains('question-ready'),false);
});
test('trace distinguishes DNS messages from local events and filters without renumbering', () => {
  const f=fixture(); f.click('sandbox'); f.preset('cached'); f.finish();
  const cache=f.el('history').children[1];
  assert.equal(cache.children[4].textContent,'LOCAL'); assert.equal(cache.children[3].textContent,'— (local)');
  f.change('trace-filter','dns'); assert.equal(cache.hidden,true);
  assert.equal(f.el('history').children[2].children[0].children[0].textContent,'3');
  assert.equal(f.el('trace-count').textContent,'2 / 3 events');
  f.change('trace-filter','referral'); assert.equal(f.el('history-empty').hidden,false); assert.equal(f.el('trace-detail').hidden,true);
  f.change('trace-filter','cache'); assert.equal(cache.hidden,false); assert.match(f.el('trace-detail-title').textContent,/local/);
});
test('selected trace row stays pinned and keyboard target survives arriving events', () => {
  const f=fixture(); f.goStage(2); f.click('step');
  const first=f.el('history').children[0],button=first.children[0].children[0]; f.click(button); f.click('step');
  assert.equal(f.el('history').children[0],first); assert.match(f.el('trace-detail-title').textContent,/Event 1/);
  assert.equal(f.el('trace-follow').attrs['aria-pressed'],'false');
  f.click('trace-follow'); assert.match(f.el('trace-detail-title').textContent,/Event 2/);
  assert.equal(f.el('trace-follow').attrs['aria-pressed'],'true');
  f.click('reset'); assert.equal(f.el('history').children.length,0); assert.equal(f.el('trace-detail').hidden,true);
});
test('trace time follows simulated clock and selected details show the returned record', () => {
  const f=fixture(); f.click('sandbox'); f.preset('expired'); f.finish();
  assert.equal(f.el('history').children[0].children[1].textContent,'61.000');
  f.click(f.el('history').children[2]);
  assert.match(f.el('trace-detail-records').children[0].textContent,/A · sacredheart.edu → 192.0.2.20 · TTL at receipt: 60 s/);
  assert.equal(f.el('result').textContent,'sacredheart.edu → 192.0.2.20');
});
test('guided Back restores trace selection with its matching event', () => {
  const f=fixture(); f.goStage(2); f.finish(); f.click(f.el('history').children[2]);
  f.advance(); f.click('back');
  assert.match(f.el('trace-detail-title').textContent,/Event 3 · Referral/);
  assert.equal(f.el('trace-follow').attrs['aria-pressed'],'false');
});
test('selectors appear only in their guided stages and live outside the topology', () => {
  const f=fixture();
  for(let i=0;i<6;i++){
    f.goStage(i);
    assert.equal(f.el('hostname-control').hidden,i!==2);
    assert.equal(f.el('resolution-control').hidden,true);
    assert.equal(f.el('style').disabled,true);
    assert.equal(f.el('style').value,i===3?'recursive':'iterative');
    assert.equal(f.el('stage-settings').hidden,i!==2);
  }
  f.click('sandbox');assert.equal(f.el('hostname-control').hidden,false);assert.equal(f.el('resolution-control').hidden,false);
  const html=fs.readFileSync('cs339/dns_explorer.html','utf8');
  assert.ok(html.indexOf('id="hostname"')<html.indexOf('class="panel topology"'));
  assert.ok(html.indexOf('id="style"')<html.indexOf('class="panel topology"'));
});
test('message routes stay inside the canvas and avoid server interiors in both branches', () => {
  const html=fs.readFileSync('cs339/dns_explorer.html','utf8');
  const boxes=[...html.matchAll(/<g id="node-([^"]+)"[^>]*><rect class="node" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)]
    .filter(m=>m[1]!=='device').map(m=>({id:m[1],x:+m[2],y:+m[3],w:+m[4],h:+m[5]}));
  function crosses(a,b,r){
    let lo=0,hi=1;
    for(const [axis,min,max] of [[0,r.x+.1,r.x+r.w-.1],[1,r.y+.1,r.y+r.h-.1]]){
      const delta=b[axis]-a[axis];
      if(!delta){if(a[axis]<min||a[axis]>max)return false;continue;}
      const u=(min-a[axis])/delta,v=(max-a[axis])/delta;
      lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));if(lo>hi)return false;
    }
    return lo<=hi;
  }
  for(const host of [Sim.HOST,'google.com'])for(const style of ['iterative','recursive']){
    const f=fixture();f.click('sandbox');f.change('hostname',host);f.change('style',style);
    while(!f.el('step').disabled){
      f.click('step');const d=f.el('active-edge').attrs.d;if(d.includes('C'))continue;
      const points=[...d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map(m=>[+m[1],+m[2]]);
      for(const p of points)assert.ok(p[0]>=0&&p[0]<=1040&&p[1]>=0&&p[1]<=355,d);
      for(let i=1;i<points.length;i++)for(const box of boxes)assert.ok(!crosses(points[i-1],points[i],box),box.id+': '+d);
    }
  }
});
test('stages change the topology, initial node selection, and controls', () => {
  const f=fixture(); assert.equal(f.el('network').classList.contains('stage-intro'),true);
  assert.equal(f.el('play').disabled,true); assert.equal(f.el('cache-title').textContent,'Requesting laptop');
  f.advance(); assert.equal(f.el('network').classList.contains('stage-intro'),false);
  assert.equal(f.el('cache-title').textContent,'Root DNS server'); assert.equal(rows(f,'owned-content').length,2);
  f.advance(); assert.equal(f.el('play').disabled,false); assert.equal(f.el('hostname').value,Sim.HOST);
  f.advance(); assert.equal(f.el('style').value,'recursive'); assert.equal(f.el('hostname').value,'google.com');
  f.advance(); assert.equal(f.el('node-root').classList.contains('muted-node'),true);
  f.advance(); assert.equal(f.el('hostname').value,Sim.ALIAS); assert.equal(f.el('cache-title').textContent,'sacredheart.edu authoritative');
});
test('guided Back restores exact paused state, selected node, and question; replay resets', () => {
  const f=fixture(); f.goStage(2); f.finish(); f.completeQuestion(); f.click('node-tld-edu');
  const note=f.el('explanation').textContent; f.advance(); f.click('back');
  assert.equal(f.el('explanation').textContent,note); assert.equal(f.el('history').children.length,8);
  assert.match(f.el('feedback').textContent,/That/); assert.equal(f.el('cache-title').textContent,'.edu TLD server');
  f.click('replay'); assert.equal(f.el('history').children.length,0); assert.equal(f.el('feedback').textContent,'');
  f.goStage(5); f.finish(); assert.match(f.el('result').textContent,/www.sacredheart.edu → 192.0.2.20/);
  f.advance(); assert.match(f.el('progress-label').textContent,/Lesson complete/); f.advance(); assert.equal(f.el('lesson').hidden,true);
  f.click('guided'); assert.match(f.el('progress-label').textContent,/Lesson complete/); f.click('restart'); assert.match(f.el('progress-label').textContent,/Stage 1/);
});
test('every server is clickable and keyboard selectable, with independent cache contents', () => {
  const f=fixture(); f.goStage(3); f.finish();
  f.click('node-tld-com'); assert.equal(f.el('cache-title').textContent,'.com TLD server'); assert.equal(f.el('cache-total').textContent,'1');
  f.click('node-tld-edu'); assert.equal(f.el('cache-total').textContent,'0'); assert.equal(rows(f,'owned-content')[0].children[0].children[0].textContent,'sacredheart.edu');
  let prevented=false;
  f.el('node-root').listeners.keydown({key:'Enter',preventDefault(){prevented=true;}});
  assert.equal(prevented,true); assert.equal(f.el('cache-title').textContent,'Root DNS server'); assert.equal(f.el('cache-total').textContent,'1');
  f.el('node-auth-google').listeners.keydown({key:' ',preventDefault(){}});
  assert.equal(f.el('owned-title').textContent,'Authoritative records · owned'); assert.equal(f.el('cache-total').textContent,'0');
  assert.equal(rows(f,'owned-content').length,2);
  f.click('inspect-resolver'); assert.equal(f.el('cache-title').textContent,'Local resolver'); assert.equal(f.el('cache-total').textContent,'1');
});
test('current message labels, arrows, and history distinguish all message types', () => {
  const f=fixture(); f.goStage(2); f.click('step');
  assert.equal(f.el('message-type').textContent,'Query'); assert.equal(f.el('active-edge').attrs['data-kind'],'query');
  f.click('step'); f.click('step'); assert.equal(f.el('message-type').textContent,'Referral');
  assert.equal(f.el('active-edge').attrs['marker-end'],'url(#arrow-referral)');
  f.finish(); assert.equal(f.el('message-type').textContent,'Answer');
  f.click('sandbox'); f.preset('cached'); f.click('step'); f.click('step');
  assert.equal(f.el('message-type').textContent,'Cache hit · local'); assert.equal(f.el('active-edge').attrs['data-kind'],'cache');
});
test('play, pause, stage/scenario switches, reset and hiding stop background playback', () => {
  const f=fixture(); f.goStage(2); f.click('play'); assert.equal(f.timers.size,1); f.tick(); assert.equal(f.el('history').children.length,2);
  f.click('play'); assert.equal(f.timers.size,0); f.click('play'); f.goStage(1); assert.equal(f.timers.size,0);
  f.click('sandbox'); f.click('play'); f.preset('alias'); assert.equal(f.timers.size,0); assert.equal(f.el('history').children.length,0);
  f.click('play'); f.click('reset'); assert.equal(f.timers.size,0); f.click('play'); f.hide(); assert.equal(f.timers.size,0);
});
test('sandbox stale address refreshes, repeat hits cache, clear requires hierarchy again', () => {
  const f=fixture(); f.click('sandbox'); f.preset('changed'); f.finish(); assert.match(f.el('result').textContent,/192.0.2.20/);
  f.click('advance'); assert.equal(f.el('clock').textContent,'Simulated time: 61 s'); f.finish(); assert.match(f.el('result').textContent,/192.0.2.80/);
  assert.equal(f.el('history').children.length,4); f.click('repeat'); f.finish(); assert.equal(f.el('history').children.length,3);
  f.click('clear'); f.finish(); assert.equal(f.el('history').children.length,8);
});
test('changing domain routes to the other branch and retains independent cached answers', () => {
  const f=fixture(); f.click('sandbox'); f.finish(); f.change('hostname','google.com'); f.finish();
  assert.match(f.el('result').textContent,/google.com → 198.51.100.10/);
  f.click('inspect-resolver'); assert.equal(f.el('cache-total').textContent,'6');
  f.change('hostname',Sim.HOST); f.finish(); assert.equal(f.el('history').children.length,3);
});
test('sandbox style switch resets the scenario and changes the exchange order', () => {
  const f=fixture(); f.click('sandbox'); f.change('hostname','google.com'); f.click('play'); f.change('style','iterative');
  assert.equal(f.timers.size,0); f.finish(); assert.equal(f.el('history').children[2].children[5].textContent,'Referral');
  assert.equal(f.el('history').children[2].children[2].textContent,'Root'); assert.equal(f.el('history').children[2].children[3].textContent,'Local resolver');
  f.change('style','recursive'); f.finish(); assert.equal(f.el('history').children[2].children[5].textContent,'Query');
  assert.equal(f.el('history').children[2].children[3].textContent,'.com TLD');
  assert.match(f.el('style-note').textContent,/Conceptual/);
});
test('prediction controls retain their identity during playback for keyboard focus', () => {
  const f=fixture(); f.goStage(2); f.finish(); const answer=f.el('answers').children[0]; f.click(answer); f.click('reset'); f.click('step');
  assert.equal(f.el('answers').children[0],answer); assert.equal(answer.attrs['aria-pressed'],'true');
});
test('HTML references, accessible topology controls and compact disclosures exist', () => {
  const html=fs.readFileSync('cs339/dns_explorer.html','utf8');
  for(const [,ref] of html.matchAll(/(?:src|href)="(\.\.\/assets\/[^"?]+)"/g))assert.ok(fs.existsSync(path.resolve('cs339',ref)),ref);
  for(const id of Object.keys(Sim.NODES))assert.match(html,new RegExp('id="node-'+id+'"[^>]*role="button"[^>]*tabindex="0"'));
  assert.match(html,/<details class="panel history">/); assert.match(html,/class="laptop-base"/);
  const hub=fs.readFileSync('cs339/index.html','utf8'); assert.match(hub,/viewer.html\?tool=cs339\/dns_explorer.html/);
  assert.match(html,/aria-live="polite"/); assert.match(fs.readFileSync('assets/css/pages/dns-explorer.css','utf8'),/prefers-reduced-motion/);
});
test('deselect clears the node highlight and exposes the selection hint', () => {
  const f=fixture(); f.goStage(2); f.click('node-root'); f.click('deselect-node');
  assert.equal(f.el('cache-title').textContent,'Select a node'); assert.equal(f.el('inspector-body').hidden,true);
  assert.equal(f.el('inspector-empty').hidden,false); assert.equal(f.el('node-root').attrs['aria-pressed'],'false');
  assert.equal(f.el('node-root').focused,true); f.click('step'); assert.equal(f.el('inspector-body').hidden,true);
  f.click('inspect-resolver'); assert.equal(f.el('cache-title').textContent,'Local resolver');
});
test('playback continues through selected nodes and updates their caches', () => {
  const f=fixture(); f.goStage(3); f.click('play');
  for(let i=0;i<5;i++)f.tick();
  assert.equal(f.timers.size,1); assert.equal(f.el('history').children.length,6);
  assert.equal(f.el('cache-title').textContent,'Root DNS server'); assert.equal(f.el('cache-total').textContent,'1');
  f.tick(); f.tick(); assert.equal(f.timers.size,0); assert.match(f.el('result').textContent,/198.51.100.10/);
});
test('node cache actions preserve owned records and other caches; age expires all caches', () => {
  const f=fixture(); f.goStage(3); f.finish(); f.click('node-root');
  assert.equal(f.el('cache-total').textContent,'1'); assert.equal(rows(f,'owned-content').length,2);
  f.click('flush-node-cache'); assert.equal(f.el('cache-total').textContent,'0'); assert.equal(rows(f,'owned-content').length,2);
  f.click('node-resolver'); assert.equal(f.el('cache-total').textContent,'1');
  f.click('age-node-cache'); assert.equal(f.el('clock').textContent,'Simulated time: 61 s'); assert.equal(f.el('cache-total').textContent,'0');
});
test('selected-node log filters exchanges and clears only its own view', () => {
  const f=fixture(); f.goStage(2); f.finish(); f.click('node-root');
  assert.equal(f.el('node-event-log').children.length,2); f.click('clear-node-log');
  assert.equal(f.el('node-event-log').children.length,0); assert.equal(f.el('history').children.length,8);
  f.click('node-resolver'); assert.equal(f.el('node-event-log').children.length,8);
  f.click('node-root'); assert.equal(f.el('node-event-log').children.length,0);
  f.advance(); f.click('back'); assert.equal(f.el('node-event-log').children.length,0);
  f.click('reset'); f.finish(); assert.equal(f.el('node-event-log').children.length,2);
});
test('cache rows expose name, value, type and remaining TTL', () => {
  const f=fixture(); f.goStage(4);
  const a=rows(f,'cache-content').find(row=>row.children[1].children[0].textContent==='A');
  assert.equal(a.children[0].children[0].textContent,Sim.HOST);
  assert.equal(a.children[0].children[1].textContent,'→ '+Sim.OLD);
  assert.equal(a.children[2].textContent,'60 s');
});
