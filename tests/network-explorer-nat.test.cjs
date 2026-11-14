const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Network } = require("../assets/js/network-explorer-engine.js");
const { internet } = require("../assets/js/network-explorer-examples.js");
function setup() {
  const { network: n } = internet(Network);
  return {
    n,
    a: n.devices[0],
    b: n.devices[1],
    r: n.devices.find((d) => d.nat),
    web: n.devices.at(-1),
  };
}
function drain(n) {
  let count = 0;
  while (n.queue.length) {
    n.next();
    assert.ok(++count < 1200);
  }
  return n.results.at(-1);
}
test("two clients resolve DNS and fetch HTTP through PAT without an ISP private return route", () => {
  const { n, a, b, r, web } = setup();
  for (const d of [a, b]) {
    n.browse(d.id, "http://www.internet.example/");
    assert.equal(drain(n).ok, true);
    assert.equal(n.httpPages[d.id].code, 200);
  }
  const rows = n.natTable[r.id];
  assert.equal(rows.filter((r) => r.protocol === "TCP").length, 2);
  assert.equal(new Set(rows.map((r) => r.publicPort)).size, rows.length);
  assert.ok(n.history.some((e) => e.nat?.direction === "Inbound"));
  assert.ok(
    n.history
      .filter((e) => e.device === web.id && e.frame?.protocol === "TCP")
      .every((e) => e.frame.sip === "203.0.113.2"),
  );
});
test("NAT off fails; echo works with NAT; mappings age and never persist", () => {
  const { n, a, r } = setup();
  n.ping(a.id, "198.51.100.10");
  assert.equal(drain(n).ok, true);
  const saved = n.save();
  assert.deepEqual(new Network(saved).natTable, {});
  assert.deepEqual(new Network(saved).device(r.id).nat, r.nat);
  assert.ok(n.age(Date.now() + 120001));
  assert.equal(n.natTable[r.id].length, 0);
  n.configureNat(r.id, { ...r.nat, enabled: false });
  n.browse(a.id, "http://198.51.100.10");
  assert.equal(drain(n).ok, false);
});
test("invalid NAT imports are rejected atomically", () => {
  const { n, r } = setup(),
    saved = n.save(),
    bad = structuredClone(saved);
  bad.devices.find((d) => d.id === r.id).nat.outside = "p0";
  assert.throws(() => n.load(bad));
  assert.deepEqual(n.save(), saved);
});

test('outside labels extend through ISP to server but preserve subnet boundaries',()=>{const {n,r}=setup();const {outsideSubnets}=require('../assets/js/network-explorer-subnets.js');assert.deepEqual([...outsideSubnets(n,r)].sort(),['198.51.100.0/24','203.0.113.0/30']);const isp=n.devices.find(d=>d.name==='ISP Router');isp.ports[1].enabled=false;assert.deepEqual([...outsideSubnets(n,r)],['203.0.113.0/30']);r.nat.enabled=false;assert.equal(outsideSubnets(n,r).size,0);});

test('port roles can be configured incrementally while NAT is disabled',()=>{const n=new Network(),r=n.add('router');n.configureNat(r.id,{enabled:false,inside:[],outside:''});n.configureNat(r.id,{enabled:false,inside:['p0'],outside:''});assert.deepEqual(new Network(n.save()).device(r.id).nat,r.nat);assert.throws(()=>n.configureNat(r.id,{...r.nat,enabled:true}));n.configureInterface(r.id,'p0','192.168.1.1',24);n.configureInterface(r.id,'p1','203.0.113.2',30);n.configureNat(r.id,{enabled:true,inside:['p0'],outside:'p1'});assert.equal(r.nat.enabled,true);});
