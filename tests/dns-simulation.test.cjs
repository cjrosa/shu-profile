const test = require('node:test');
const assert = require('node:assert/strict');
const Sim = require('../assets/js/dns-simulation.js');
const path = s => s.events.map(e => `${e.from}>${e.to}`);
test('cold iterative lookup follows referrals and returns the A address', () => {
  const s = Sim.preset('first');
  assert.deepEqual(path(s), ['device>resolver','resolver>root','root>resolver','resolver>tld-edu','tld-edu>resolver','resolver>auth-shu','auth-shu>resolver','resolver>device']);
  assert.equal(s.cache.length, 0); s.step(); assert.equal(s.cache.length, 0);
  s.finish(); assert.equal(s.result, Sim.OLD); assert.equal(s.activeCache().length, 3);
});
test('valid answer bypasses all hierarchy servers', () => {
  const s = Sim.preset('cached'); assert.deepEqual(path(s), ['device>resolver','resolver>resolver','resolver>device']); s.finish(); assert.equal(s.result, Sim.OLD);
});
test('expired A uses authority referral; expired authority uses TLD; expired TLD starts at root', () => {
  const s = Sim.preset('expired'); assert.deepEqual(path(s), ['device>resolver','resolver>auth-shu','auth-shu>resolver','resolver>device']);
  s.advance(119); s.start(); assert.ok(!path(s).includes('resolver>root')); assert.ok(path(s).includes('resolver>tld-edu'));
  s.advance(120); s.start(); assert.ok(path(s).includes('resolver>root'));
});
test('stale answer survives authoritative change until TTL expires', () => {
  const s = Sim.preset('changed'); s.finish(); assert.equal(s.result, Sim.OLD); assert.equal(s.address, Sim.NEW);
  s.advance(60); s.start(); s.finish(); assert.equal(s.result, Sim.NEW);
});
test('cache hits do not extend the original TTL', () => {
  const s = Sim.preset('cached'); s.advance(40); s.start(); s.finish(); assert.equal(s.activeCache().find(r => r.type === 'A').remaining, 20);
});
test('CNAME resolves to A and uses freshly acquired referrals for second name', () => {
  const s = Sim.preset('alias'); s.finish(); assert.equal(s.result, Sim.OLD);
  assert.equal(s.history.filter(e => e.to === 'root').length, 1);
  assert.equal(s.history.filter(e => e.to === 'auth-shu').length, 2);
  s.advance(61); s.start(); assert.ok(s.events.some(e => /Cache hit: .* is an alias/.test(e.text))); assert.equal(s.events.filter(e => e.to === 'auth-shu').length, 1); s.finish();
  s.advance(59); s.start(); assert.ok(!s.events.some(e => /Cache hit: .* is an alias/.test(e.text))); assert.equal(s.events.filter(e => e.to === 'auth-shu').length, 1); s.finish(); assert.equal(s.result, Sim.OLD);
});
test('conceptual recursive resolution forwards and unwinds; each forwarding server caches the returned answer', () => {
  const s = Sim.preset('first', 'recursive'); assert.deepEqual(path(s), ['device>resolver','resolver>root','root>tld-edu','tld-edu>auth-shu','auth-shu>tld-edu','tld-edu>root','root>resolver','resolver>device']);
  s.finish(); assert.equal(s.result, Sim.OLD); assert.deepEqual(s.cache.map(r => r.type), ['A']);
});
test('recursive CNAME lookup resolves both names', () => { const s = Sim.preset('alias', 'recursive'); s.finish(); assert.equal(s.result, Sim.OLD); assert.deepEqual(s.cache.map(r => r.type), ['CNAME', 'A']); });
test('snapshot restores an exact paused state and cache clearing forces a cold lookup', () => {
  const s = Sim.preset('first'); for(let i=0;i<4;i++)s.step(); const state = s.save(); s.finish(); s.advance(); s.restore(state); assert.deepEqual(s.save(), state); s.finish(); assert.equal(s.result, Sim.OLD);
  s.clearCache(); s.start(); assert.ok(path(s).includes('resolver>root'));
});
test('the two domains take separate TLD and authority branches', () => {
  const s = Sim.preset('first'); s.finish(); s.start('google.com');
  assert.ok(path(s).includes('resolver>root'));
  assert.ok(path(s).includes('resolver>tld-com')); assert.ok(path(s).includes('resolver>auth-google'));
  assert.ok(!path(s).includes('resolver>tld-edu')); assert.ok(!path(s).includes('resolver>auth-shu'));
  s.finish(); assert.equal(s.result,'198.51.100.10');
  assert.deepEqual(s.activeCache().filter(r=>r.type==='A').map(r=>r.name).sort(),['google.com','sacredheart.edu']);
  s.start(Sim.HOST); assert.equal(s.events.filter(e=>e.kind==='query').length,1);
});
test('message types separate queries, referrals, answers and local cache checks', () => {
  const cold=Sim.preset('first');
  assert.deepEqual(cold.events.map(e=>e.kind),['query','query','referral','query','referral','query','answer','answer']);
  const hot=Sim.preset('cached'); assert.deepEqual(hot.events.map(e=>e.kind),['query','cache','answer']);
  for(const e of hot.events)assert.equal(e.from===e.to,e.kind==='cache');
});
test('owned delegations and records are separate from per-node caches', () => {
  const s=Sim.preset('first');
  assert.deepEqual(s.ownedRecords('root').map(r=>r.name),['.com','.edu']);
  assert.equal(s.ownedRecords('tld-com')[0].name,'google.com');
  assert.equal(s.ownedRecords('auth-shu')[0].value,Sim.OLD);
  s.finish(); assert.equal(s.activeCache('root').length,0); assert.equal(s.activeCache('auth-shu').length,0);
  assert.equal(s.activeCache('resolver').length,3);
  s.advance(1000); assert.equal(s.activeCache().length,0); assert.equal(s.ownedRecords('auth-shu').length,2);
});
test('recursive response caches arrive per server; repeated lookup can use a root cache', () => {
  const s=Sim.preset('first','recursive');
  for(let i=0;i<5;i++)s.step();
  assert.equal(s.activeCache('tld-edu').length,1); assert.equal(s.activeCache('root').length,0);
  s.step(); assert.equal(s.activeCache('root').length,1); assert.equal(s.activeCache('resolver').length,0);
  s.finish(); s.clearCache(); s.start();
  assert.ok(s.events.some(e=>e.from==='root'&&e.kind==='cache')); assert.ok(!path(s).includes('root>tld-edu'));
  s.finish(); assert.equal(s.result,Sim.OLD); s.advance(60); s.start(); assert.ok(path(s).includes('root>tld-edu'));
});
test('changing google address does not change sacredheart data; aliases work on both branches', () => {
  const s=Sim.preset('alias','iterative','google.com'); s.finish(); assert.equal(s.result,'198.51.100.10');
  s.changeAddress(); assert.equal(s.googleAddress,'198.51.100.80'); assert.equal(s.address,Sim.OLD);
  s.advance(61); s.start(); s.finish(); assert.equal(s.result,'198.51.100.80');
});
