/* Stateful IPv4 transit policy for the simulator's ordered, non-retransmitting transport. */
(function (root) {
  'use strict';
  const zones = ['Inside', 'Outside', 'DMZ'];
  function address(value) {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(value) || value.split('.').some(x => +x > 255)) throw Error('Use an IPv4 address or CIDR subnet.');
    return value.split('.').reduce((n, x) => (n * 256 + Number(x)) >>> 0, 0);
  }
  function cidr(value) {
    if (value === '*') return null;
    if (typeof value !== 'string') throw Error('Use * for any address.');
    const parts = value.split('/'), n = address(parts[0]), prefix = parts.length === 1 ? 32 : Number(parts[1]);
    if (parts.length > 2 || (parts.length === 2 && !/^\d{1,2}$/.test(parts[1])) || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw Error('Use a prefix from /0 through /32.');
    const mask = prefix ? (0xffffffff << (32 - prefix)) >>> 0 : 0;
    if (parts.length === 2 && ((n & mask) >>> 0) !== n) throw Error('Use the network address for a CIDR rule.');
    return {n, mask};
  }
  const matches = (value, target) => { const c = cidr(value); return !c || ((address(target) & c.mask) >>> 0) === c.n; };
  function rule(name = 'Allow outbound', protocol = 'ANY', port = '*') {
    return {name, enabled: true, from: 'Inside', to: 'Outside', source: '*', destination: '*', protocol, sourcePort: '*', destinationPort: port, action: 'allow'};
  }
  const intrusionDefaults=()=>({mode:'off',threshold:3,windowTicks:100});
  function defaults(d, enabled = false) {
    return {intrusion:intrusionDefaults(), enabled, defaultAction: 'drop', zones: Object.fromEntries(d.ports.map((p, i) => [p.id, zones[i] || 'DMZ'])), rules: [rule()]};
  }
  function validate(d, c) {
    if (d?.type !== 'router' || !c || typeof c.enabled !== 'boolean' || !['allow','drop'].includes(c.defaultAction) || !c.zones || Array.isArray(c.zones) || typeof c.zones !== 'object' || !Array.isArray(c.rules) || c.rules.length > 64) throw Error('Invalid firewall configuration (maximum 64 rules).');
    if (Object.keys(c.zones).length !== d.ports.length || !d.ports.every(p => zones.includes(c.zones[p.id]))) throw Error('Assign a security zone to every interface.');
    if(c.intrusion){const i=c.intrusion;if(!['off','detect','prevent'].includes(i.mode)||!Number.isInteger(i.threshold)||i.threshold<2||i.threshold>16||!Number.isInteger(i.windowTicks)||i.windowTicks<10||i.windowTicks>1000)throw Error('Intrusion detection needs 2-16 distinct ports within 10-1000 simulation ticks.');}
    const names = new Set();
    for (const r of c.rules) {
      if (!r || typeof r.name !== 'string' || !r.name.trim() || r.name.length > 60 || names.has(r.name) || typeof r.enabled !== 'boolean' || !['*',...zones].includes(r.from) || !['*',...zones].includes(r.to) || !['ANY','TCP','UDP','ICMP'].includes(r.protocol) || !['allow','drop'].includes(r.action)) throw Error('Use unique rule names and valid zones, protocols and actions.');
      names.add(r.name); cidr(r.source); cidr(r.destination);
      for (const port of [r.sourcePort, r.destinationPort]) if (port !== '*' && (!Number.isInteger(port) || port < 1 || port > 65535 || !['TCP','UDP'].includes(r.protocol))) throw Error('Ports require TCP or UDP and a value from 1 to 65535, or *.');
    }
  }
  function age(n, now = Date.now()) {
    let changed = false;
    for (const [id, rows] of Object.entries(n.firewallSessions)) {
      const live = rows.filter(s => s.expiresAt > now);
      if (live.length !== rows.length) { n.firewallSessions[id] = live; changed = true; }
    }
    return changed;
  }
  function inspectIntrusion(n,d,input,f,eventOrder){
    const c=d.firewall.intrusion||intrusionDefaults();
    if(c.mode==='off'||f.protocol!=='TCP'||f.flags!=='SYN')return null;
    const all=n.intrusionTracking||(n.intrusionTracking={}),rows=all[d.id]||(all[d.id]={}),key=[input.id,f.sip,f.dip].join('|');
    for(const k of Object.keys(rows))if(n.clock-rows[k].last>c.windowTicks)delete rows[k];
    let r=rows[key];if(!r){if(Object.keys(rows).length>=256)delete rows[Object.keys(rows)[0]];r=rows[key]={samples:[],last:n.clock,alertId:null};}
    r.last=n.clock;r.samples=r.samples.filter(x=>n.clock-x.clock<=c.windowTicks);
    if(new Set(r.samples.map(x=>x.port)).size<c.threshold)r.alertId=null;
    r.samples=r.samples.filter(x=>x.port!==f.dport);r.samples.push({port:f.dport,clock:n.clock,order:eventOrder});
    const ports=r.samples.map(x=>x.port);if(ports.length<c.threshold)return null;
    const alerts=n.intrusionAlerts||(n.intrusionAlerts={}),list=alerts[d.id]||(alerts[d.id]=[]);
    let alert=list.find(a=>a.id===r.alertId);
    if(!alert){alert={id:++n.intrusionSerial,source:f.sip,destination:f.dip,mode:c.mode,threshold:c.threshold,windowTicks:c.windowTicks,clock:n.clock};list.push(alert);if(list.length>100)list.shift();r.alertId=alert.id;}
    Object.assign(alert,{last:n.clock,ports,orders:r.samples.map(x=>x.order),eventOrder});
    return {alertId:alert.id,mode:c.mode,ports:[...ports],threshold:c.threshold,windowTicks:c.windowTicks,eventOrder};
  }
  function evaluate(n, d, input, output, f, eventOrder) {
    if (!d.firewall?.enabled) return null;
    age(n);
    const intrusion=inspectIntrusion(n,d,input,f,eventOrder);
    const c = d.firewall, from = c.zones[input.id], to = c.zones[output.id], protocol = f.protocol || 'ICMP';
    const sessions = n.firewallSessions[d.id] || (n.firewallSessions[d.id] = []);
    const counts = n.firewallHits[d.id] || (n.firewallHits[d.id] = {});
    const log = n.firewallDecisions[d.id] || (n.firewallDecisions[d.id] = []);
    const finish = (action, reason, name, state) => {
      const policyAction=action;
      if(intrusion){const prevention=intrusion.mode==='prevent';if(prevention)action='drop';reason+=' Possible port scan: '+intrusion.ports.length+' distinct ports within '+intrusion.windowTicks+' simulation ticks. '+(prevention?'IPS blocks this SYN.':'Detection only; firewall policy still applies.');const alert=n.intrusionAlerts[d.id].find(a=>a.id===intrusion.alertId);if(alert)alert.action=action;}
      const decision = {eventOrder,intrusion,policyAction,action, reason, rule: name, state, from, to, protocol, source: f.sip, destination: f.dip, sourcePort: f.sport, destinationPort: f.dport, clock: n.clock};
      log.push(decision); if (log.length > 100) log.shift();
      return decision;
    };
    const forward = s => s.protocol === protocol && s.source === f.sip && s.destination === f.dip && s.sourcePort === f.sport && s.destinationPort === f.dport && s.ingress === input.id && s.egress === output.id;
    const reverse = s => s.protocol === protocol && s.source === f.dip && s.destination === f.sip && s.sourcePort === f.dport && s.destinationPort === f.sport && s.ingress === output.id && s.egress === input.id;
    let s = sessions.find(s => (forward(s) || reverse(s)) && (protocol !== 'ICMP' || s.probe === f.probe));
    if (s) {
      const back = reverse(s), flags = f.flags || '';
      let valid = true, closed = false;
      if (protocol === 'TCP') {
        const own = back ? 'serverNext' : 'clientNext', peer = back ? 'clientNext' : 'serverNext';
        if (flags === 'RST ACK' && back && s.state === 'SYN-SENT' && f.ack === s.clientNext) closed = true;
        else if(flags==='RST'&&!back&&s.state==='SYN-RECEIVED'&&f.seq===s.clientNext)closed=true;
        else if (s.state === 'SYN-SENT') {
          valid = back && flags === 'SYN ACK' && f.ack === s.clientNext && Number.isInteger(f.seq);
          if (valid) { s.serverNext = f.seq + 1; s.state = 'SYN-RECEIVED'; }
        } else if (s.state === 'SYN-RECEIVED') {
          valid = !back && flags === 'ACK' && f.seq === s.clientNext && f.ack === s.serverNext;
          if (valid) s.state = 'ESTABLISHED';
        } else {
          valid = !flags.includes('SYN') && f.seq === s[own] && flags.includes('ACK') && Number.isInteger(f.ack) && f.ack <= s[peer];
          if (valid) {
            if (flags.includes('RST')) closed = true;
            s[own] += (f.length || 0) + Number(flags.includes('FIN'));
            if (flags.includes('FIN')) { s[back ? 'serverFin' : 'clientFin'] = true; s.state = 'CLOSING'; }
            closed ||= !!(s.clientFin && s.serverFin && !flags.includes('FIN') && f.ack === s[peer]);
          }
        }
      } else if (protocol === 'ICMP') valid = back ? f.icmp === 'Echo Reply' : f.icmp === 'Echo Request';
      if (!valid) return finish('drop', 'Packet does not match the tracked connection state.', s.rule, s.state);
      s.expiresAt = Date.now() + 120000;
      const result = finish('allow', 'Matches a permitted session' + (closed ? '; connection closed.' : '.'), s.rule, closed ? 'CLOSED' : s.state);
      if (closed) sessions.splice(sessions.indexOf(s), 1);
      return result;
    }
    // An ACK alone, an unsolicited SYN-ACK, or an echo reply cannot open a session.
    if (protocol === 'TCP' && (f.flags !== 'SYN' || !Number.isInteger(f.seq))) return finish('drop', 'No matching session; a new TCP connection must begin with SYN.', 'State check');
    if (protocol === 'ICMP' && f.icmp !== 'Echo Request') return finish('drop', 'No matching echo request. Related ICMP errors are outside this model.', 'State check');
    const r = c.rules.find(r => r.enabled && (r.from === '*' || r.from === from) && (r.to === '*' || r.to === to) && (r.protocol === 'ANY' || r.protocol === protocol) && matches(r.source, f.sip) && matches(r.destination, f.dip) && (r.sourcePort === '*' || r.sourcePort === f.sport) && (r.destinationPort === '*' || r.destinationPort === f.dport));
    const name = r?.name || 'Default policy', action = r?.action || c.defaultAction;
    Object.defineProperty(counts, name, {value: (Object.hasOwn(counts, name) ? counts[name] : 0) + 1, enumerable: true, writable: true, configurable: true});
    if (action === 'allow' && intrusion?.mode!=='prevent') {
      s = {protocol, source: f.sip, destination: f.dip, sourcePort: f.sport, destinationPort: f.dport, probe: f.probe, ingress: input.id, egress: output.id, rule: name, state: protocol === 'TCP' ? 'SYN-SENT' : 'REQUEST/REPLY', clientNext: protocol === 'TCP' ? f.seq + 1 : undefined, expiresAt: Date.now() + 120000};
      sessions.push(s);
    }
    return finish(action, r ? 'First matching rule: ' + name + '.' : 'No rule matched; use the default policy.', name, s?.state);
  }
  function describe(d) {
    return 'Firewall ' + (d.action === 'drop' ? 'DROP' : 'ALLOW') + ': ' + d.from + ' → ' + d.to + ', ' + d.protocol + (d.destinationPort ? ' destination port ' + d.destinationPort : '') + '. ' + d.reason;
  }
  const api = {zones, rule, defaults, intrusionDefaults, validate, evaluate, age, describe};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NetworkExplorerFirewall = api;
})(globalThis);
