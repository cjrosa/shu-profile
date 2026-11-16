const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Network } = require('../assets/js/network-explorer-engine.js');
const Watch = require('../assets/js/network-explorer-watch.js');

function routed() {
  const n = new Network(), a = n.add('host'), r = n.add('router'), b = n.add('host');
  n.configure(a.id, '192.168.1.10', 24); n.configure(b.id, '192.168.2.10', 24);
  n.configureInterface(r.id, 'p0', '192.168.1.1', 24);
  n.configureInterface(r.id, 'p1', '192.168.2.1', 24);
  a.gateway = '192.168.1.1'; b.gateway = '192.168.2.1';
  n.connect(a.id, 'p0', r.id, 'p0'); n.connect(b.id, 'p0', r.id, 'p1');
  r.watch = true; r.watchDecisions = ['routing'];
  n.ping(a.id, b.ip);
  const reports = [];
  while(n.queue.length) { assert.ok(reports.length < 100); reports.push(n.next()); }
  return { n, r, reports };
}
test('routing-only Watch skips real ARP reports without changing successful ping', () => {
  const { n, r, reports } = routed();
  assert.equal(n.results.at(-1).ok, true);
  const router = reports.filter(e => e.device === r.id);
  assert.ok(router.some(e => e.frame?.type === 'ARP'));
  assert.ok(router.filter(e => e.frame?.type === 'ARP').every(e => !Watch.matches(r,e)));
  const pauses = router.filter(e => Watch.matches(r,e));
  assert.equal(pauses.length, 2);
  assert.ok(pauses.every(e => e.selectedRoute));
  assert.ok(pauses.some(e => e.outgoingFrames.some(o => o.frame.type === 'ARP')));
});
test('legacy All, Off, combinations and application separation', () => {
  const { r, reports } = routed(); const route = reports.find(e => e.selectedRoute);
  delete r.watchDecisions;
  assert.equal(Watch.matches(r, route), true);
  assert.equal(Watch.matches(r, {kind:'dns-application'}), false);
  r.watch = false; assert.equal(Watch.matches(r, route), false);
  r.watch = true; r.watchDecisions = ['arp','routing'];
  assert.equal(Watch.matches(r, {kind:'receive',frame:{type:'ARP'}}), true);
  r.watchDecisions = ['nat']; assert.equal(Watch.matches(r, {...route,nat:{}}), true);
});
test('Watch preferences round trip and malformed imported preferences are rejected', () => {
  const { n, r } = routed();
  assert.deepEqual(new Network(n.save()).device(r.id).watchDecisions, ['routing']);
  for (const bad of ['routing', [], ['wrong'], ['arp','arp']]) {
    const data = n.save(); data.devices.find(d => d.id === r.id).watchDecisions = bad;
    assert.throws(() => new Network(data), /Watch decisions/);
  }
});
