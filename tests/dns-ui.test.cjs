const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const Sim = require('../assets/js/dns-simulation.js');
// DOM fixture checks controls and lifecycle; it does not assert browser layout.
function fixture() {
  const html = fs.readFileSync('cs339/dns_explorer.html', 'utf8'), elements = new Map(), timers = new Map(); let serial = 0;
  function element(id = '') {
    const classes = new Set();
    return { id, dataset: {}, attrs: {}, listeners: {}, children: [], textContent: '', value: '', disabled: false, hidden: false,
      classList: { contains(key) { return classes.has(key); }, toggle(key, enabled) { if(enabled)classes.add(key);else classes.delete(key); } },
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
  return { el, click, timers, preset: name => click(presets.find(p => p.dataset.preset === name)), change(id,value) { el(id).value=value; el(id).listeners.change(); }, tick() { for(const fn of [...timers.values()])fn(); }, finish() { let remaining = 40; while(!el('step').disabled && remaining-- > 0) click('step'); assert.ok(remaining > 0); }, hide() { doc.hidden=true; doc.listeners.visibilitychange(); } };
}
test('stages change the topology, initial node selection, and controls', () => {
  const f=fixture(); assert.equal(f.el('network').classList.contains('stage-intro'),true);
  assert.equal(f.el('play').disabled,true); assert.equal(f.el('cache-title').textContent,'Requesting laptop');
  f.click('next'); assert.equal(f.el('network').classList.contains('stage-intro'),false);
  assert.equal(f.el('cache-title').textContent,'Root DNS server'); assert.equal(f.el('owned-content').children.length,2);
  f.click('next'); assert.equal(f.el('play').disabled,false); assert.equal(f.el('hostname').value,Sim.HOST);
  f.click('next'); assert.equal(f.el('style').value,'recursive'); assert.equal(f.el('hostname').value,'google.com');
  f.click('next'); assert.equal(f.el('node-root').classList.contains('muted-node'),true);
  f.click('next'); assert.equal(f.el('hostname').value,Sim.ALIAS); assert.equal(f.el('cache-title').textContent,'sacredheart.edu authoritative');
});
test('guided Back restores exact paused state, selected node, and question; replay resets', () => {
  const f=fixture(); f.click('stage-2'); f.click(f.el('answers').children[0]); f.click('step'); f.click('node-tld-edu');
  const note=f.el('explanation').textContent; f.click('next'); f.click('back');
  assert.equal(f.el('explanation').textContent,note); assert.equal(f.el('history').children.length,1);
  assert.match(f.el('feedback').textContent,/Consider this/); assert.equal(f.el('cache-title').textContent,'.edu TLD server');
  f.click('replay'); assert.equal(f.el('history').children.length,0); assert.equal(f.el('feedback').textContent,'');
  f.click('stage-5'); f.finish(); assert.match(f.el('result').textContent,/www.sacredheart.edu → 192.0.2.20/);
  f.click('next'); assert.match(f.el('progress-label').textContent,/Lesson complete/); f.click('next'); assert.equal(f.el('lesson').hidden,true);
  f.click('guided'); assert.match(f.el('progress-label').textContent,/Lesson complete/); f.click('restart'); assert.match(f.el('progress-label').textContent,/Stage 1/);
});
test('every server is clickable and keyboard selectable, with independent cache contents', () => {
  const f=fixture(); f.click('stage-3'); f.finish();
  f.click('node-tld-com'); assert.equal(f.el('cache-title').textContent,'.com TLD server'); assert.equal(f.el('cache-total').textContent,'1');
  f.click('node-tld-edu'); assert.equal(f.el('cache-total').textContent,'0'); assert.equal(f.el('owned-content').children[0].children[1].textContent,'sacredheart.edu');
  let prevented=false;
  f.el('node-root').listeners.keydown({key:'Enter',preventDefault(){prevented=true;}});
  assert.equal(prevented,true); assert.equal(f.el('cache-title').textContent,'Root DNS server'); assert.equal(f.el('cache-total').textContent,'1');
  f.el('node-auth-google').listeners.keydown({key:' ',preventDefault(){}});
  assert.equal(f.el('owned-title').textContent,'Authoritative records · owned'); assert.equal(f.el('cache-total').textContent,'0');
  assert.equal(f.el('owned-content').children.length,2);
  f.click('inspect-resolver'); assert.equal(f.el('cache-title').textContent,'Local resolver'); assert.equal(f.el('cache-total').textContent,'1');
});
test('current message labels, arrows, and history distinguish all message types', () => {
  const f=fixture(); f.click('stage-2'); f.click('step');
  assert.equal(f.el('message-type').textContent,'Query'); assert.equal(f.el('active-edge').attrs['data-kind'],'query');
  f.click('step'); f.click('step'); assert.equal(f.el('message-type').textContent,'Referral');
  assert.equal(f.el('active-edge').attrs['marker-end'],'url(#arrow-referral)');
  f.finish(); assert.equal(f.el('message-type').textContent,'Answer');
  f.click('sandbox'); f.preset('cached'); f.click('step'); f.click('step');
  assert.equal(f.el('message-type').textContent,'Cache hit · local'); assert.equal(f.el('active-edge').attrs['data-kind'],'cache');
});
test('play, pause, stage/scenario switches, reset and hiding stop background playback', () => {
  const f=fixture(); f.click('stage-2'); f.click('play'); assert.equal(f.timers.size,1); f.tick(); assert.equal(f.el('history').children.length,2);
  f.click('play'); assert.equal(f.timers.size,0); f.click('play'); f.click('stage-1'); assert.equal(f.timers.size,0);
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
test('style switch resets the stage and changes the exchange order', () => {
  const f=fixture(); f.click('stage-3'); f.click('play'); f.change('style','iterative');
  assert.equal(f.timers.size,0); f.finish(); assert.match(f.el('history').children[2].children[0].textContent,/Referral · Root DNS server → Local resolver/);
  f.change('style','recursive'); f.finish(); assert.match(f.el('history').children[2].children[0].textContent,/Query · Root DNS server → .com TLD server/);
  assert.match(f.el('style-note').textContent,/Conceptual/);
});
test('prediction controls retain their identity during playback for keyboard focus', () => {
  const f=fixture(); f.click('stage-2'); const answer=f.el('answers').children[0]; f.click(answer); f.click('step');
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
