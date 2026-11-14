const { test } = require("node:test");
const assert = require("node:assert/strict");
const { match } = require("../assets/js/network-explorer-filter.js");
const r = {
  proto: "HTTP",
  src: "02:00:00:00:01:00",
  dst: "bb",
  sip: "192.168.1.10",
  dip: "198.51.100.10",
  info: "GET /",
  device: "Browser A",
  e: {
    vlan: 3,
    notes: [],
    frame: { protocol: "TCP", sport: 49152, dport: 80 },
  },
};
test("shared filter supports protocols, addresses, VLAN and exact transport ports", () => {
  for (const f of [
    "",
    "tcp",
    "http",
    "ip",
    "tcp.port == 80",
    "tcp.srcport == 49152",
    "tcp.dstport == 80",
    "ip.addr == 192.168.1.10",
    "ip.dst==198.51.100.10",
    "eth.src==02:00:00:00:01:00",
    "vlan.id == 3",
  ])
    assert.equal(match(r, f), true, f);
  for (const f of [
    "arp",
    "udp",
    "tcp.port == 8",
    "tcp.srcport==80",
    "udp.port==80",
    "ip.src==198.51.100.10",
    "vlan==4",
  ])
    assert.equal(match(r, f), false, f);
});
test("UDP service filters and queued events without notes work", () => {
  const dns = {
    ...r,
    proto: "DNS",
    e: { frame: { protocol: "UDP", sport: 50000, dport: 53 } },
  };
  assert.equal(match(dns, "udp.port == 53"), true);
  assert.equal(match(dns, "udp"), true);
  assert.equal(match(dns, "tcp"), false);
  assert.equal(match(dns, "browser"), true);
});

const { compile } = require("../assets/js/network-explorer-filter.js");
test("compound filters honor NOT, AND, OR precedence and parentheses", () => {
  for (const expression of [
    "tcp.port == 80 and ip.addr == 192.168.1.10",
    "(tcp or dns) and not ip.addr == 192.168.1.20",
    "tcp || dns && arp",
    "!udp && tcp",
    "not not tcp",
    "TCP AND (http OR dns)",
  ])
    assert.equal(match(r, expression), true, expression);
  for (const expression of [
    "tcp and udp",
    "(tcp or dns) and arp",
    "not (tcp or dns)",
    "tcp.port == 80 and ip.src == 192.168.1.20",
  ])
    assert.equal(match(r, expression), false, expression);
});
test("invalid expressions fail before packet evaluation", () => {
  for (const expression of [
    "tcp and",
    "or tcp",
    "tcp or or dns",
    "()",
    "(tcp",
    "tcp)",
    "tcp (dns)",
    "tcp or udp.port == 99999",
    "ip.addr == 999.1.1.1",
    "tcp.port = 80",
    "tcp.port ==",
    "tcp, dns",
    "bogus.field == 2",
    "eth.addr == xyz",
    "not",
  ])
    assert.throws(() => compile(expression), undefined, expression);
  assert.equal(compile("")(r), true);
});
