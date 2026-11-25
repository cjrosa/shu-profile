(function (root) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const methods = {ping:'Ping', traceroute:'Traceroute', lookupDns:'Resolve name', acquireDhcp:'Request DHCP lease', browse:'Open', scan:'Scan'};
  // Instrument the public operation boundary and propagate identity through queued work.
  // Recording is owned by the UI; speculative next() calls only annotate their reports.
  function install(Network, begin) {
    const proto = Network.prototype;
    for (const [method, label] of Object.entries(methods)) {
      const original = proto[method];
      proto[method] = function (...args) {
        if (this._operationContext || this._operationStep) return original.apply(this, args);
        const operation = begin(this, {method, args:copy(args), label:method === 'lookupDns' && args[2] ? 'Ping' : label});
        if (!operation) return original.apply(this, args);
        this._operationContext = operation.id;
        const resultStart = this.results.length;
        try {
          const result = original.apply(this, args);
          for (const row of this.results.slice(resultStart)) row.operationId = operation.id;
          return result;
        } catch (error) {
          operation.status = 'stopped'; operation.result = error.message;
          throw error;
        } finally { delete this._operationContext; }
      };
    }
    const enqueue = proto.enqueue, transmit = proto.transmit, next = proto.next;
    proto.enqueue = function (event, ...args) {
      if (event.kind?.startsWith('ospf-') || event.frame?.ospf) return enqueue.call(this,event,...args);
      const operationId = event.operationId || event.frame?.operationId || this._operationContext;
      return enqueue.call(this, operationId ? {...event, operationId} : event, ...args);
    };
    proto.transmit = function (device, port, frame) {
      if (frame.ospf) return transmit.call(this,device,port,frame);
      const operationId = frame.operationId || this._operationContext;
      return transmit.call(this, device, port, operationId ? {...frame, operationId} : frame);
    };
    proto.next = function (...args) {
      const event = this.queue[0], resultStart = this.results.length;
      this._operationContext = event?.operationId || event?.frame?.operationId;
      this._operationStep = true;
      try {
        const report = next.apply(this, args);
        if (report && !report.ospf && !report.frame?.ospf && !report.kind?.startsWith('ospf-') && this._operationContext) report.operationId = report.operationId || this._operationContext;
        for (const row of this.results.slice(resultStart)) if (this._operationContext) row.operationId = this._operationContext;
        return report;
      } finally { delete this._operationContext; delete this._operationStep; }
    };
  }
  function category(report) {
    const f = report.frame || {}, kind = report.kind || '';
    if (/DNS/i.test(report.title) || f.dns || kind.startsWith('dns-')) return 'Name lookup';
    if (f.dhcp || kind.startsWith('dhcp-')) return 'Address configuration';
    if (f.type === 'ARP') return 'Neighbor discovery';
    if (f.protocol === 'TCP' || /tcp-|browser-|web-|nmap-/.test(kind)) return 'Connection and application';
    return 'Delivery and forwarding';
  }
  function stages(operation) {
    const groups = new Map();
    for (const report of operation.reports) {
      const name = category(report);
      if (!groups.has(name)) groups.set(name, {name, reports:[], devices:new Set()});
      const group = groups.get(name); group.reports.push(report); group.devices.add(report.device);
    }
    return [...groups.values()].map(g => {
      const important = g.reports.find(r => /No default gateway|No matching route|Firewall dropped|capacity exhausted|certificate.*(invalid|failed|untrusted)/i.test(r.title));
      const last = important || g.reports.at(-1);
      const routers = [...g.devices].filter(id => operation.topology.devices.find(d => d.id === id)?.type === 'router').length;
      const summary = g.name === 'Delivery and forwarding' && !important
        ? (routers ? 'Traffic passed through '+routers+' router'+(routers===1?'':'s')+'. ' : '')+last.title+'.'
        : last.title+'.';
      return {...g, summary, devices:[...g.devices]};
    });
  }
  class Store {
    constructor(limit = 50, eventLimit = 2000) { this.entries = []; this.serial = 0; this.limit = limit; this.eventLimit = eventLimit; }
    begin(network, descriptor, owner, restricted = false) {
      const entry = {...descriptor, id:'operation-' + ++this.serial, owner, restricted, source:network.device(descriptor.args[0])?.name || descriptor.args[0], topology:network.save(), reports:[], status:'running', result:'In progress', started:Date.now(), seen:new Set()};
      entry.initial = copy(Object.fromEntries(['devices','arp','mac','natTable','dhcpLeases','dnsCache','ospfState'].filter(key=>network[key]!==undefined).map(key=>[key,network[key]])));
      this.entries.unshift(entry);
      // Never evict an in-progress operation.
      while (this.entries.length > this.limit) {
        const index = this.entries.findLastIndex(e => e.status !== 'running');
        if (index < 0) break;
        this.entries.splice(index, 1);
      }
      return entry;
    }
    capture(network, report, owner) {
      const entry = this.entries.find(e => e.id === report?.operationId && e.owner === owner);
      if (!entry || entry.seen.has(report.order)) return;
      entry.seen.add(report.order);
      if (entry.reports.length < this.eventLimit) entry.reports.push(copy(report));
      else entry.truncated = true;
    }
    settle(network, owner) {
      for (const entry of this.entries.filter(e => e.owner === owner)) {
        const results = network.results.filter(r => r.operationId === entry.id && r.device === entry.args[0]);
        const final = results.filter(r => (!r.trace || r.done) && (entry.method !== 'browse' || r.http) && (entry.method !== 'scan' || r.nmap) && (entry.method !== 'acquireDhcp' || r.dhcp) && (!(entry.method === 'lookupDns' && entry.args[2]) || !r.dns || !r.ok)).at(-1);
        if (final) {
          entry.status = final.ok || final.nmap ? 'completed' : 'stopped';
          entry.result = final.nmap ? 'Scan completed. Expand the application stage for port results.' : final.ok && (entry.method==='ping' || entry.method==='traceroute' || (entry.method==='lookupDns'&&entry.args[2])) ? 'Reply received from '+(final.responder||final.target||entry.args[1]) : final.message || final.error || (final.ok ? 'Operation completed.' : 'No reply received');
        } else if (entry.status === 'running' && !network.queue.some(e => e.operationId === entry.id || e.frame?.operationId === entry.id)) {
          entry.status = 'stopped'; entry.result = 'Operation ended without a recorded completion.';
        }
      }
    }
    interrupt(owner) { for (const e of this.entries) if (e.owner === owner && e.status === 'running') { e.status = 'stopped'; e.result = 'Interrupted when the network or learned state was reset.'; } }
  }
  const api = {install, Store, stages, category};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NetworkExplorerOperations = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
