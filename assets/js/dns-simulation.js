(function (root) {
  'use strict';
  const HOST = 'sacredheart.edu', ALIAS = 'www.sacredheart.edu';
  const OLD = '192.0.2.20', NEW = '192.0.2.80';
  const ZONES = [
    { domain: 'google.com', tld: 'com', tldNode: 'tld-com', auth: 'auth-google', ip: '198.51.100.10' },
    { domain: HOST, tld: 'edu', tldNode: 'tld-edu', auth: 'auth-shu', ip: OLD }
  ];
  const NODES = {
    device: { name: 'Requesting laptop', role: 'Runs the application and asks the local resolver. Device caching is omitted in this model.' },
    resolver: { name: 'Local resolver', role: 'Resolves names for the laptop and caches answers and referrals until their TTLs expire.' },
    root: { name: 'Root DNS server', role: 'Delegates to .com and .edu. These delegations are maintained data, not cached host answers.' },
    'tld-com': { name: '.com TLD server', role: 'Delegates google.com to its authoritative server.' },
    'tld-edu': { name: '.edu TLD server', role: 'Delegates sacredheart.edu to its authoritative server.' },
    'auth-google': { name: 'google.com authoritative', role: 'Owns the simulated google.com records. Its own records are not cache entries.' },
    'auth-shu': { name: 'sacredheart.edu authoritative', role: 'Owns the simulated sacredheart.edu records. Its own records are not cache entries.' }
  };
  const copy = value => JSON.parse(JSON.stringify(value));
  class DNSSimulation {
    constructor() {
      this.time = 0; this.caches = Object.fromEntries(Object.keys(NODES).map(id => [id, []]));
      this.address = OLD; this.googleAddress = ZONES[0].ip;
      this.events = []; this.cursor = 0; this.history = []; this.result = null; this.name = HOST; this.style = 'iterative';
    }
    get cache() { return this.caches.resolver; }
    zone(name = this.name) {
      const zone = ZONES.find(z => name === z.domain || name === 'www.' + z.domain);
      if (!zone) throw new Error('Choose a hostname from the simulated DNS dataset.');
      return zone;
    }
    activeCache(node = 'resolver') { return this.caches[node].filter(r => r.expires > this.time).map(r => ({ ...r, remaining: r.expires - this.time })); }
    advance(seconds = 61) { this.time += seconds; for (const id of Object.keys(this.caches)) this.caches[id] = this.caches[id].filter(r => r.expires > this.time); }
    clearCache(node = 'resolver') { this.caches[node] = []; }
    currentAddress(zone = this.zone()) { return zone.domain === HOST ? this.address : this.googleAddress; }
    changeAddress() { const z = this.zone(); if(z.domain === HOST) this.address = this.address === OLD ? NEW : OLD; else this.googleAddress = this.googleAddress === z.ip ? '198.51.100.80' : z.ip; }
    ownedRecords(node) {
      if (node === 'root') return ZONES.map(z => ({ name: '.' + z.tld, type: 'Delegation', value: NODES[z.tldNode].name }));
      const z = ZONES.find(z => z.tldNode === node || z.auth === node);
      if (!z) return [];
      if (node === z.tldNode) return [{ name: z.domain, type: 'Delegation', value: NODES[z.auth].name }];
      return [{ name: z.domain, type: 'A', value: this.currentAddress(z), ttl: 60 }, { name: 'www.' + z.domain, type: 'CNAME', value: z.domain, ttl: 120 }];
    }
    save() { return copy({ ...this }); }
    restore(state) { Object.assign(this, copy(state)); }
    start(name = this.name, style = this.style) {
      const zone = this.zone(name);
      this.name = name; this.style = style; this.events = []; this.history = []; this.cursor = 0; this.result = null;
      // Plan on private copies. Visible caches change only when responses arrive.
      const planned = Object.fromEntries(Object.keys(NODES).map(id => [id, this.activeCache(id)]));
      const get = (node, n, type) => planned[node].find(r => r.name === n && r.type === type);
      const record = (n, type, value, ttl) => ({ name: n, type, value, ttl, expires: this.time + ttl });
      const emit = (from, to, kind, text, records = [], result = null) => {
        this.events.push({ from, to, kind, text, records, result, time: this.time });
        records.forEach(r => { const i = planned[to].findIndex(p => p.name === r.name && p.type === r.type); if (i >= 0) planned[to].splice(i, 1); planned[to].push(r); });
      };
      const describe = r => r.type === 'CNAME' ? r.name + ' is an alias for ' + r.value + '. Follow the canonical name to get an IP address.' : r.name + ' → ' + r.value + ' (A record).';
      const authoritative = n => n.startsWith('www.') ? record(n, 'CNAME', zone.domain, 120) : record(n, 'A', this.currentAddress(zone), 60);
      emit('device', 'resolver', 'query', 'Recursive query: find the IPv4 address for ' + name + '. The laptop asks the resolver to finish the job.');
      const resolve = n => {
        let answer = get('resolver', n, 'A') || get('resolver', n, 'CNAME');
        if (answer) {
          emit('resolver', 'resolver', 'cache', 'Cache hit: ' + describe(answer) + ' ' + (answer.expires - this.time) + ' s remain. No network message for this check.');
        } else if (style === 'iterative') {
          const auth = get('resolver', zone.domain, 'Referral'), tld = get('resolver', '.' + zone.tld, 'Referral');
          if (!auth && !tld) {
            emit('resolver', 'root', 'query', 'Iterative query: where should I ask about ' + n + '?');
            emit('root', 'resolver', 'referral', 'Referral: ask the .' + zone.tld + ' TLD server. The root does not supply the host address.', [record('.' + zone.tld, 'Referral', NODES[zone.tldNode].name, 300)]);
          }
          if (!auth) {
            emit('resolver', zone.tldNode, 'query', 'Iterative query: who is authoritative for ' + zone.domain + '?');
            emit(zone.tldNode, 'resolver', 'referral', 'Referral: ask the ' + zone.domain + ' authoritative server.', [record(zone.domain, 'Referral', NODES[zone.auth].name, 180)]);
          }
          emit('resolver', zone.auth, 'query', 'Query: resolve ' + n + '.' + (auth ? ' A cached referral lets us go directly to the authority.' : ''));
          answer = authoritative(n);
          emit(zone.auth, 'resolver', 'answer', 'Authoritative answer: ' + describe(answer), [answer]);
        } else {
          const path = get('resolver', zone.domain, 'Referral') ? ['resolver', zone.auth] : get('resolver', '.' + zone.tld, 'Referral') ? ['resolver', zone.tldNode, zone.auth] : ['resolver', 'root', zone.tldNode, zone.auth];
          let reached = 1;
          for (; reached < path.length; reached++) {
            const target = path[reached];
            emit(path[reached - 1], target, 'query', 'Recursive query: resolve ' + n + ' for me. Full-hierarchy forwarding is a conceptual comparison.');
            answer = get(target, n, 'A') || get(target, n, 'CNAME');
            if (answer) { emit(target, target, 'cache', 'Cache hit at ' + NODES[target].name + ': ' + describe(answer) + ' No network message for this local check.'); break; }
            if (target === zone.auth) { answer = authoritative(n); break; }
          }
          for (let i = reached; i > 0; i--) emit(path[i], path[i - 1], 'answer', (i === reached && path[i] === zone.auth ? 'Authoritative answer: ' : 'Forwarded answer: ') + describe(answer), [answer]);
        }
        return answer.type === 'CNAME' ? resolve(answer.value) : answer.value;
      };
      const ip = resolve(name);
      emit('resolver', 'device', 'answer', 'Final answer: ' + name + ' → ' + ip + '. The laptop can now use this address.', [], ip);
    }
    step() {
      if (this.cursor >= this.events.length) return null;
      const event = copy(this.events[this.cursor++]);
      event.records.forEach(r => { this.caches[event.to] = this.caches[event.to].filter(p => p.name !== r.name || p.type !== r.type); this.caches[event.to].push(r); });
      if (event.result) this.result = event.result;
      this.history.push(event); return event;
    }
    finish() { while (this.step()) {} }
    static preset(kind, style = 'iterative', name = HOST) {
      const s = new DNSSimulation(); s.name = name; const z = s.zone();
      if (['cached', 'expired', 'changed'].includes(kind)) { s.start(name, style); s.finish(); }
      if (kind === 'expired') s.advance(61);
      if (kind === 'changed') s.changeAddress();
      s.start(kind === 'alias' ? 'www.' + z.domain : name, style); return s;
    }
  }
  Object.assign(DNSSimulation, { HOST, ALIAS, OLD, NEW, ZONES, NODES });
  if (typeof module !== 'undefined' && module.exports) module.exports = DNSSimulation;
  else root.DNSSimulation = DNSSimulation;
})(typeof globalThis !== 'undefined' ? globalThis : this);
