(function (root) {
  'use strict';
  // Probes use a fresh copy: no cached ARP, live traffic, or Watch dialogs.
  function probe(Network, data, source, target) {
    try {
      const n = new Network(data);
      n.ping(source, target);
      let steps = 0;
      while (n.queue.length && ++steps < 3000) n.next();
      return !n.queue.length && n.results.some(r => r.device === source && r.ok);
    } catch (_) { return false; }
  }
  function apply(n, fault, restore = false) {
    if (['dns','dhcp','web'].includes(fault.kind)) {
      if (restore) { Object.assign(n.device(fault.device), JSON.parse(JSON.stringify(fault.removed))); n.reset(); }
      else if (fault.kind === 'dns') n.uninstallDns(fault.device);
      else if (fault.kind === 'dhcp') n.uninstallDhcp(fault.device);
      else n.uninstallWeb(fault.device, 'web');
    }
    else if (fault.kind === 'gateway') n.configureGateway(fault.source, restore ? fault.original : '');
    else if (fault.kind === 'vlan') n.configurePort(fault.device, fault.port, {accessVlan: restore ? fault.original : fault.broken});
    else n.configurePort(fault.device || fault.source, fault.port || 'p0', {enabled: restore});
  }
  function verify(Network, data, fault) {
    if (!['dns','dhcp','web'].includes(fault.kind)) return probe(Network, data, fault.source, fault.target);
    try {
      const n = new Network(data);
      if (fault.kind === 'dns') n.lookupDns(fault.source, fault.hostname);
      else if (fault.kind === 'dhcp') n.acquireDhcp(fault.source);
      else n.browse(fault.source, fault.url);
      let steps = 0; while (n.queue.length && ++steps < 3000) n.next();
      if (n.queue.length) return false;
      if (fault.kind === 'web') return n.httpPages[fault.source]?.code === 200;
      if (fault.kind === 'dns') return n.dnsCache[fault.source]?.[fault.hostname]?.address === fault.target;
      const client = n.device(fault.source);
      return !!client.lease && !!client.ip && client.prefix === fault.prefix && client.gateway === fault.gateway && client.dnsServerAddress === fault.dns;
    } catch (_) { return false; }
  }
  function generateBroken(Network, level = 'basic', random = Math.random, requestedKind) {
    const n = generate(Network, level, random);
    const kinds = level === 'basic' ? ['port','dns','dhcp','web'] : ['gateway','port','dns','dhcp','web'];
    const kind = requestedKind || kinds[Math.floor(random() * kinds.length)];
    let fault;
    if (kind === 'gateway' || kind === 'port') {
      fault = create(Network, n.save(), random, kind === 'port' ? 'easy' : 'gateway');
    } else if (['dns','dhcp','web'].includes(kind)) {
      const [client, server] = n.devices.filter(d => d.type === 'host');
      server.name = 'Practice Services'; client.name = 'Practice Client';
      const hostname = 'practice.example', url = 'http://' + server.ip + '/';
      n.configureDnsServer(server.id, {enabled:true,records:[{name:hostname,address:server.ip,ttl:120}]});
      n.configureDnsAddress(client.id, server.ip);
      n.configureWeb(server.id, {enabled:true,port:80,title:'Practice service',body:'The practice web service is working.'});
      n.configureWeb(client.id, {enabled:true,url}, 'browser');
      const subnet = server.ip.split('.').slice(0,3).join('.'), gateway = client.gateway;
      const pool = {name:'Practice-LAN',start:subnet+'.150',end:subnet+'.170',prefix:24,gateway,dns:server.ip,leaseSeconds:120};
      n.configureDhcpServer(server.id,{enabled:true,pools:[pool]});
      if (kind === 'dhcp') { client.os = 'windows'; n.configureAddressMode(client.id,'dhcp'); }
      fault = {kind,source:client.id,sourceName:client.name,device:server.id,deviceName:server.name,target:server.ip,hostname,url,
        prefix:24,gateway,dns:server.ip,removed:{},
        symptom:kind === 'dns' ? client.name + ' cannot resolve ' + hostname + '.' : kind === 'dhcp' ? client.name + ' cannot obtain a DHCP lease.' : client.name + ' cannot open ' + url,
        testLabel:kind === 'dns' ? 'DNS lookup' : kind === 'dhcp' ? 'DHCP lease acquisition' : 'HTTP request',
        command:kind === 'dns' ? 'nslookup ' + hostname : kind === 'dhcp' ? 'ipconfig /renew' : null,
        hints:kind === 'dns' ? ['Ping the configured DNS server by IP. Does address connectivity work?', 'Compare the client DNS address with the applications installed on Practice Services.', 'Install and configure DNS on Practice Services with an A record for '+hostname+'.'] : kind === 'dhcp' ? ['The client needs an address before it can reach other hosts.', 'Look for a DHCP server application on the client LAN and check its pool.', 'Install DHCP on Practice Services; configure a pool in '+subnet+'.0/24.'] : ['Try pinging the server IP. A reachable host may not offer HTTP.', 'Inspect applications on Practice Services. Is anything listening on TCP port 80?', 'Install and enable the Web Server application on Practice Services, port 80.'],
        reveal:kind === 'dns' ? 'DNS is missing on Practice Services. Install DNS and add '+hostname+' → '+server.ip+'.' : kind === 'dhcp' ? 'DHCP is missing on Practice Services. Install DHCP; pool '+pool.start+'–'+pool.end+', /24, gateway '+(gateway||'(none)')+', DNS '+server.ip+'.' : 'The Web Server application is missing on Practice Services. Install it and enable HTTP on port 80.'};
      const keys = kind === 'dns' ? ['dnsServer','dnsWatch','dnsOffset'] : kind === 'dhcp' ? ['dhcpServer','dhcpWatch','applicationOffset'] : ['webServer','webWatch','webOffset'];
      for (const key of keys) if (server[key] !== undefined) fault.removed[key] = JSON.parse(JSON.stringify(server[key]));
    } else throw Error('Unknown generated fault.');
    const baseline = n.save();
    if (!verify(Network, baseline, fault)) throw Error('The generated service did not pass its baseline check.');
    apply(n, fault);
    if (verify(Network, n.save(), fault)) throw Error('The generated fault did not break its service.');
    return {network:n, baseline, fault};
  }
  function generate(Network, level = 'basic', random = Math.random) {
    if (!['basic','intermediate','advanced'].includes(level)) throw Error('Unknown practice level.');
    const pick = (min, max) => min + Math.floor(random() * (max - min + 1));
    const n = new Network(), count = level === 'basic' ? 1 : level === 'intermediate' ? pick(2, 3) : pick(3, 5);
    // Keep the longest routed path within the simulator's probe timeout.
    const ring = level === 'advanced' && (count > 3 || random() < 0.5);
    const site = 10 + Math.floor(random() * 180), routers = [], hosts = [];
    for (let i = 0; i < count; i++) {
      const x = 220 + i * 600, subnet = '10.' + site + '.' + (i + 1);
      const sw = n.add('switch', x, 300); sw.name = 'LAN ' + (i + 1) + ' Switch';
      n.setVlan(sw.id, 99, 'Unused', '#96652b');
      if (count > 1) {
        const r = n.add('router', x, 140, 3); r.name = 'Router ' + (i + 1); routers.push(r);
        n.configureInterface(r.id, 'p0', subnet + '.1', 24); n.connect(r.id, 'p0', sw.id, 'p0');
      }
      const switches = [sw], branches = pick(0, level === 'advanced' ? 2 : 1);
      for (let b = 0; b < branches; b++) {
        const branch = n.add('switch', x + (b ? 180 : -180), 490);
        branch.name = 'LAN ' + (i + 1) + ' Access ' + (b + 1);
        n.setVlan(branch.id, 99, 'Unused', '#96652b');
        n.connect(sw.id, 'p' + (6 + b), branch.id, 'p0'); switches.push(branch);
      }
      let address = pick(10, 60);
      for (let s = 0; s < switches.length; s++) {
        const hostCount = pick(2, level === 'basic' ? 4 : count === 5 ? 2 : 3), parent = switches[s];
        for (let j = 0; j < hostCount; j++) {
          const h = n.add('host', parent.x + (j - (hostCount - 1) / 2) * 95, parent.y + 120);
          h.name = 'LAN ' + (i + 1) + ' Host ' + address;
          h.os = ['windows','linux','macos'][pick(0, 2)];
          n.configure(h.id, subnet + '.' + address++, 24);
          if (count > 1) n.configureGateway(h.id, subnet + '.1');
          n.connect(h.id, 'p0', parent.id, 'p' + (j + 1)); hosts.push(h);
        }
      }
    }
    const adjacency = routers.map(() => []);
    for (let i = 0; i < routers.length - 1 + Number(ring); i++) {
      const next = (i + 1) % routers.length;
      const transit = '172.20.' + i;
      n.configureInterface(routers[i].id, 'p2', transit + '.1', 30);
      n.configureInterface(routers[next].id, 'p1', transit + '.2', 30);
      n.connect(routers[i].id, 'p2', routers[next].id, 'p1');
      adjacency[i].push({to:next, hop:transit + '.2'});
      adjacency[next].push({to:i, hop:transit + '.1'});
    }
    routers.forEach((r, i) => {
      const visited = new Set([i]), queue = adjacency[i].map(edge => ({...edge}));
      for (let k = 0; k < queue.length; k++) {
        const edge = queue[k]; if (visited.has(edge.to)) continue; visited.add(edge.to);
        n.setStaticRoute(r.id, '10.' + site + '.' + (edge.to + 1) + '.0', 24, edge.hop, 'lan-' + (edge.to + 1));
        for (const next of adjacency[edge.to]) if (!visited.has(next.to)) queue.push({to:next.to,hop:edge.hop});
      }
    });
    if (!hosts.every(h => h === hosts[0] || probe(Network, n.save(), hosts[0].id, h.ip))) throw Error('Generated network failed its connectivity check.');
    return n;
  }
  function create(Network, data, random = Math.random, difficulty = 'mixed') {
    const hosts = data.devices.filter(d => d.type === 'host' && d.ip && d.addressMode !== 'dhcp');
    const candidates = [];
    for (const source of hosts) {
      const subnet = address => address.split(".").reduce((v, octet) => (v << 8) | Number(octet), 0) & (-1 << (32 - source.prefix));
      const targets = [...hosts].sort((a,b) => Number(subnet(a.ip) === subnet(source.ip)) - Number(subnet(b.ip) === subnet(source.ip)));
      for (const target of targets) {
        if (source.id === target.id || !probe(Network, data, source.id, target.ip)) continue;
        const kinds = difficulty === 'gateway' ? ['gateway'] : difficulty === 'easy' ? ['port'] : difficulty === 'intermediate' ? ['gateway','switch-port'] : difficulty === 'hard' ? ['vlan'] : ['gateway','port'];
        for (const kind of kinds) {
          if (kind === 'gateway' && !source.gateway) continue;
          const fault = {kind, source: source.id, target: target.ip, targetName: target.name,
            sourceName: source.name, original: source.gateway, portName: source.ports[0].name};
          if (kind === 'switch-port' || kind === 'vlan') {
            const link = data.links.find(l => l.a === source.id || l.b === source.id);
            const sw = data.devices.find(d => d.id === (link?.a === source.id ? link.b : link?.a) && d.type === 'switch');
            const port = sw?.ports.find(p => p.id === (link.a === sw.id ? link.ap : link.bp));
            if (!port?.enabled) continue;
            Object.assign(fault, {device:sw.id, deviceName:sw.name, port:port.id, portName:port.name});
            if (kind === 'vlan') {
              const other = sw.vlans.find(v => v.id !== port.accessVlan);
              if (!other) continue;
              fault.original = port.accessVlan; fault.broken = other.id;
            }
          }
          const copy = new Network(data);
          apply(copy, fault);
          if (!probe(Network, copy.save(), source.id, target.ip)) candidates.push(fault);
        }
        // One working destination per source keeps large custom networks responsive.
        if (candidates.some(f => f.source === source.id)) break;
      }
      if (candidates.length >= 8) break;
    }
    if (!candidates.length) throw Error('No verified ' + difficulty + ' fault is available on this network. Generate a practice network or choose another difficulty. Hard requires a host connected to a switch with another VLAN. Hosts must use static addresses and have a working ping.');
    return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
  }
  function mount(panel, api) {
    let challenge = null, owner = null, baseline = null, hint = 0;
    const identity = () => api.identity ? api.identity() : api.network();
    panel.innerHTML = '<div class="trouble-actions"><button data-lab="load">Load practice network</button><button data-lab="break">Break something</button><button data-lab="check" disabled>Check repair</button><button data-lab="hint" disabled>Hint</button><button data-lab="look" disabled>Look here</button><button data-lab="reveal" disabled>Reveal fault</button><button data-lab="reset" disabled>Reset network</button></div><p class="trouble-status" role="status">Generate a practice network, or open/build a working network, then choose Break something.</p><div class="trouble-evidence"></div><label class="trouble-reflection">Explain your fix <input placeholder="What failed? What evidence led you to the fix?" aria-label="Explain your fix"></label>';
    const icons = {
      load: '<path d="m3 21 12-12 3 3L6 24z" transform="translate(0 -2)"/><path d="m12 10 3 3M5 2v4M3 4h4m12-3v6m-3-3h6m-1 11v4m-2-2h4"/>',
      break: '<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
      check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
      hint: '<path d="M9 18h6m-6 3h6M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/>',
      look: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
      reveal: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
      reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>'
    };
    panel.querySelectorAll("[data-lab]").forEach(button => {
      if (button.dataset.lab === 'load') button.textContent = 'Generate practice network';
      button.id = "trouble-" + button.dataset.lab;
      button.title = button.textContent;
      button.setAttribute('aria-label', button.textContent);
      button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[button.dataset.lab] + '</svg>';
    });
    const toolbar = panel.querySelector('.trouble-actions');
    function dropdown(action, label, values) {
      const trigger = panel.querySelector('[data-lab="' + action + '"]'), wrapper = document.createElement('div');
      wrapper.className = 'trouble-dropdown'; trigger.before(wrapper); wrapper.append(trigger);
      trigger.classList.add('trouble-menu-trigger');
      trigger.insertAdjacentHTML('beforeend', '<svg class="trouble-chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><path d="m3 4 3 3 3-3"/></svg>');
      trigger.setAttribute('aria-expanded', 'false');
      const menu = document.createElement('div'); menu.id = 'trouble-menu-' + action;
      menu.className = 'trouble-menu'; menu.hidden = true; menu.setAttribute('aria-label', label);
      trigger.setAttribute('aria-controls', menu.id);
      values.forEach(([value, description]) => {
        const option = document.createElement('button'); option.id = 'trouble-' + action + '-' + value;
        option.dataset.lab = action; option.dataset.level = value;
        const levelIcons = {
          basic:'<rect x="8" y="3" width="8" height="5" rx="1"/><path d="M12 8v5M5 16v-3h14v3"/><rect x="2" y="16" width="6" height="5" rx="1"/><rect x="16" y="16" width="6" height="5" rx="1"/>',
          intermediate:'<rect x="2" y="8" width="6" height="8" rx="1"/><rect x="16" y="8" width="6" height="8" rx="1"/><path d="M8 12h8M5 4v4m14-4v4M5 16v4m14-4v4"/>',
          advanced:'<circle cx="12" cy="4" r="3"/><circle cx="4" cy="18" r="3"/><circle cx="20" cy="18" r="3"/><path d="m10 7-4 8m8-8 4 8M7 18h10"/>',
          easy:'<path d="M5 19v-5h3v5zm6 0V9h3v10zm6 0V4h3v15"/>',
          hard:'<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>'
        };
        option.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + levelIcons[value] + '</svg><div><strong></strong><span></span></div>';
        option.querySelector('strong').textContent = value[0].toUpperCase() + value.slice(1);
        option.querySelector('span').textContent = description; menu.append(option);
      });
      wrapper.append(menu);
    }
    dropdown('load', 'Generate practice network', [['basic','Random switched LAN'],['intermediate','2–3 routed LANs'],['advanced','3–5 LANs; chain or ring routing']]);
    let startBroken = false;
    const mode = document.createElement('button'); mode.id = 'trouble-generate-broken';
    mode.className = 'trouble-generate-mode'; mode.setAttribute('role','switch'); mode.setAttribute('aria-checked','false');
    mode.setAttribute('aria-label','Start with a fault');
    mode.innerHTML = '<span>Start with a fault</span><span class="trouble-switch-track" aria-hidden="true"></span>';
    panel.querySelector('#trouble-menu-load').prepend(mode);
    mode.onclick = () => { startBroken = !startBroken; mode.setAttribute('aria-checked',String(startBroken)); };
    dropdown('break', 'Break something', [['easy','Host interface disabled'],['intermediate','Gateway or switch port fault'],['hard','Incorrect switch access VLAN']]);
    function closeMenus() {
      toolbar.querySelectorAll('.trouble-menu').forEach(menu => { menu.hidden = true; });
      toolbar.querySelectorAll('.trouble-menu-trigger').forEach(trigger => trigger.setAttribute('aria-expanded', 'false'));
    }
    document.addEventListener('click', e => { if (!toolbar.contains(e.target)) closeMenus(); });
    toolbar.addEventListener('keydown', e => {
      if (e.key === 'Escape') { const trigger = e.target.closest('.trouble-dropdown')?.querySelector('.trouble-menu-trigger'); closeMenus(); trigger?.focus(); }
      if (e.key === 'ArrowDown' && e.target.matches('.trouble-menu-trigger')) { e.preventDefault(); closeMenus(); e.target.setAttribute('aria-expanded', 'true'); const menu = e.target.nextElementSibling; menu.hidden = false; menu.querySelector('button').focus(); }
    });
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', 'Troubleshooting actions');
    panel.prepend(toolbar);

    panel.querySelector("input").id = "trouble-reflection";
    const statusBox = panel.querySelector('.trouble-status'), status = document.createElement('span');
    status.textContent = statusBox.textContent;
    statusBox.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 2.1 18a2 2 0 0 0 1.7 3h16.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/></svg>';
    statusBox.append(status);
    const statusIcon = statusBox.querySelector('svg'), alertIcon = statusIcon.innerHTML;
    statusBox.dataset.severity = 'warning';
    function message(text, severity = 'warning') {
      status.textContent = text;
      statusBox.dataset.severity = severity;
      statusIcon.innerHTML = severity === 'success' ? icons.check : alertIcon;
    }
    const evidence = panel.querySelector('.trouble-evidence');
    const reflection = panel.querySelector('.trouble-reflection');
    reflection.hidden = true;
    const button = action => panel.querySelector('#trouble-' + action);
    let currentIdentity = identity();
    function clearChallenge() {
      closeMenus();
      challenge = null; owner = null; baseline = null; hint = 0;
      currentIdentity = identity(); enabled(false); evidence.replaceChildren();
      panel.querySelector('input').value = '';
    }
    function enabled(active) {
      reflection.hidden = true;
      for (const action of ['check','hint','look','reveal','reset']) button(action).disabled = !active;
      button('break').disabled = active;
    }
    function line(text) { const p = document.createElement('p'); p.textContent = text; evidence.append(p); }
    function startChallenge(next, saved) {
      baseline = saved; challenge = next; owner = identity(); currentIdentity = owner; hint = 0;
      enabled(true); evidence.replaceChildren(); panel.querySelector('input').value = '';
      message(next.symptom || 'Connection lost: ' + next.sourceName + ' cannot ping ' + next.targetName + ' (' + next.target + '). Find and repair the fault.', 'error');
      line('Baseline ' + (next.testLabel || 'ping') + ' passed; the same test failed after one fault was introduced.');
      const command = document.createElement('button'); command.id = 'trouble-command';
      const text = next.command || (next.kind === 'web' ? null : 'ping ' + next.target);
      command.textContent = text ? 'Try: ' + text : 'Open client Browser';
      command.onclick = () => { try { valid(); if (text) api.command(next.source, text); else api.select(next.source); } catch (e) { message(e.message, 'error'); } };
      evidence.append(command);
    }
    function guidance(kind, heading, text) {
      let card = evidence.querySelector('.trouble-guidance');
      if (!card) {
        card = document.createElement('div');
        card.className = 'trouble-guidance';
        card.setAttribute('aria-live', 'polite');
        evidence.append(card);
      }
      card.dataset.kind = kind;
      card.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[kind] + '</svg><div><strong></strong> <span></span></div>';
      card.querySelector('strong').textContent = heading + ': ';
      card.querySelector('span').textContent = text;
    }
    function valid() {
      if (!challenge || owner !== identity()) {
        challenge = null; enabled(false); evidence.replaceChildren();
        throw Error('The network has changed. Choose Break something to start a new challenge.');
      }
    }
    panel.addEventListener('click', event => {
      const control = event.target.closest('[data-lab]'), action = control?.dataset.lab;
      if (!action) return;
      if (control.disabled) return;
      if (control.classList.contains('trouble-menu-trigger')) {
        const wasOpen = control.getAttribute('aria-expanded') === 'true'; closeMenus();
        control.setAttribute('aria-expanded', String(!wasOpen)); control.nextElementSibling.hidden = wasOpen; return;
      }
      closeMenus();
      try {
        if (['load','break','reset'].includes(action) && !api.editable()) return;
        if (action === 'load') {
          const generated = startBroken ? generateBroken(api.Network, control.dataset.level) : null;
          if (!api.load(generated ? generated.network.save() : generate(api.Network, control.dataset.level).save())) return;
          clearChallenge();
          if (generated) startChallenge(generated.fault, generated.baseline);
          else message('Practice network ready. Try ping between the hosts, then choose Break something.');
        } else if (action === 'break') {
          baseline = api.network().save();
          const next = create(api.Network, baseline, Math.random, control.dataset.level);
          api.change(() => apply(api.network(), next));
          startChallenge(next, baseline);
        } else {
          valid();
          if (action === 'check') {
            const ok = verify(api.Network, api.network().save(), challenge);
            reflection.hidden = !ok;
            message(ok ? 'Restored! A fresh ' + (challenge.testLabel || 'ping') + ' passed. Explain the cause and your fix.' : 'The fresh ' + (challenge.testLabel || 'ping') + ' still fails. Inspect the configuration and follow the exchange in Activity.', ok ? 'success' : 'error');
          } else if (action === 'hint') {
            const hints = challenge.hints || (challenge.kind === 'vlan' ? [
              'The cable can be up while traffic is isolated. Follow the frame into the switch.',
              'Compare the access VLAN of the host-facing switch port with the other ports in its LAN.',
              'Restore the host-facing port to its original LAN VLAN, then retry ping.'
            ] : challenge.kind === 'switch-port' ? [
              'Check both ends of the source host cable.',
              'Inspect the switch port connected to the source. Is it enabled?',
              'Enable that switch port, then retry the original ping.'
            ] : challenge.kind === 'gateway' ? [
              'Compare the source and destination subnets. How does traffic leave the local LAN?',
              'Inspect the source host’s default gateway. Compare it with the connected router’s LAN interface.',
              'Restore the gateway on the source host, then retry the original ping.'
            ] : [
              'Start at the physical and link layers. Does the source have an active connection?',
              'Inspect the source host’s Ethernet port. A connected cable does not guarantee an enabled interface.',
              'Enable the source interface in the Inspector, then retry the original ping.'
            ]);
            guidance('hint', 'Hint ' + (Math.min(hint, 2) + 1) + ' of 3', hints[Math.min(hint++, 2)]);
          } else if (action === 'look') {
            api.select(challenge.device || challenge.source);
            guidance('look', 'Look here', challenge.testLabel ? 'Inspect the applications on ' + challenge.deviceName + '. ' + (challenge.command ? 'From ' + challenge.sourceName + ', try '+challenge.command+'.' : 'Use the Browser on '+challenge.sourceName+' to open '+challenge.url) : 'Inspect ' + (challenge.deviceName || challenge.sourceName) + '. ' + (challenge.device ? 'Compare port status and access VLANs in the Inspector. CLI ideas: show interfaces, show vlan brief. ' : 'CLI: Windows: ipconfig, arp -a; Linux: ip addr, ip neigh; macOS: ifconfig, arp -a. ') + 'Type help for supported commands; ping ' + challenge.target + ' to retest.');
          } else if (action === 'reveal') {
            guidance('reveal', 'Fault revealed', challenge.reveal || (challenge.kind === 'vlan' ? challenge.deviceName + ' port ' + challenge.portName + ' was moved to VLAN ' + challenge.broken + '. Restore VLAN ' + challenge.original + '.' : challenge.kind === 'gateway' ? 'The default gateway on ' + challenge.sourceName + ' was cleared. Restore ' + challenge.original + ' in the host configuration.' : (challenge.deviceName || challenge.sourceName) + ' interface ' + challenge.portName + ' was disabled. Enable it in the Inspector.'));
          } else if (action === 'reset') {
            if (!api.restore(baseline)) return;
            clearChallenge();
            message('Starting network restored. Choose Break something for another challenge.', 'success');
          }
        }
      } catch (e) { message(e.message, 'error'); }
    });
    return () => { if (currentIdentity !== identity()) { clearChallenge(); message('Network loaded. Choose a difficulty, then Break something to start a new challenge.'); } };
  }
  const api = {probe, verify, apply, create, generate, generateBroken, mount};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NetworkExplorerTroubleshooting = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
