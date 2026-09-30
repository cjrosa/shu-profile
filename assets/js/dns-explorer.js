(() => {
  'use strict';
  const $ = id => document.getElementById(id), Sim = DNSSimulation;
  const lessons = [
    { title: 'Names become addresses', copy: 'The laptop knows a name. Its local resolver uses DNS to find the IP address for that hostname. This first view focuses on those two roles; the next stage opens the hierarchy.', preset: 'first', host: Sim.HOST, inspect: 'device', focus: ['device','resolver'], question: 'What does DNS help the laptop find for a hostname?', answers: ['An IP address', 'The contents of a web page'], correct: 0, feedback: 'DNS translates a hostname into an IP address. The laptop asks its local resolver to find that address.' },
    { title: 'One root, two TLD branches', copy: 'DNS distributes responsibility across organizations instead of relying on one central database. Each organization manages its own records. Follow root → .com → google.com, or root → .edu → sacredheart.edu. Click any server to inspect its delegations, records, and cache. The local resolver sits outside this hierarchy.', preset: 'first', host: Sim.HOST, inspect: 'root', focus: ['root','tld-com','tld-edu','auth-google','auth-shu'], question: 'Who owns the simulated sacredheart.edu A record?', answers: ['The root server', 'The sacredheart.edu authoritative server'], correct: 1, feedback: 'The authoritative server owns the A record. Root and TLD servers provide directions.' },
    { title: 'Trace an iterative lookup', copy: 'Press Play or Step. Blue queries ask, amber referrals direct, and green answers return records. Trace the .edu branch, then change the hostname to google.com to try .com.', preset: 'first', host: Sim.HOST, inspect: 'resolver', focus: ['resolver','root','tld-edu','auth-shu'], question: 'What does the root return in this lookup?', answers: ['The host IP address', 'A referral to the correct TLD'], correct: 1, feedback: 'The root returns a referral. The local resolver follows it and continues asking.' },
    { title: 'Trace recursive forwarding', copy: 'In this conceptual recursive walkthrough, each contacted server continues the lookup and passes the answer back. Follow the .com branch and click a server to inspect its cache. Compare this path with the resolver-led iterative lookup in Stage 3.', preset: 'first', host: 'google.com', style: 'recursive', inspect: 'root', focus: ['root','tld-com','auth-google'], question: 'In this recursive example, what does a contacted server do?', answers: ['Continues the lookup and returns the answer', 'Only tells the resolver which server to ask next'], correct: 0, feedback: 'Each contacted server continues the work. Returning directions is the iterative pattern from Stage 3. Full recursion through root and TLD servers is a conceptual comparison.' },
    { title: 'Cached answers take a shortcut', copy: 'Play the cached lookup: only laptop and resolver exchange messages. Change IP and repeat to see a stale answer. Advance +61 s and play again: the expired A record refreshes using cached referrals.', preset: 'cached', host: Sim.HOST, inspect: 'resolver', focus: ['device','resolver'], question: 'The authoritative IP changes before the cached A expires. What may return?', answers: ['The old cached IP', 'Always the new IP immediately'], correct: 0, feedback: 'The cached answer can remain stale until its TTL expires. Referrals have separate, longer TTLs.' },
    { title: 'Follow an alias to an A record', copy: 'Resolve www.sacredheart.edu: its CNAME points to sacredheart.edu, then A supplies the address. Click the authority to compare owned records with the resolver cache. After +61 s, CNAME remains while A expires.', preset: 'alias', host: Sim.HOST, inspect: 'auth-shu', focus: ['resolver','auth-shu'], question: 'What does CNAME contain?', answers: ['An IPv4 address', 'Another hostname'], correct: 1, feedback: 'CNAME names the canonical host; A supplies an IPv4 address. MX identifies a mail server and comes later in the email tool.' }
  ];
  const descriptions = { first: 'Start empty and trace the selected domain.', cached: 'A previous lookup has populated caches.', expired: '61 s later: the A expired, but referrals can remain.', changed: 'The authority changed its IP; the cached answer is still valid.', alias: 'Follow a CNAME to its canonical hostname, then its A record.' };
  const kinds = { query: 'Query', referral: 'Referral', answer: 'Answer', cache: 'Cache hit · local' };
  const points = { device: [126,82,57,40], resolver: [126,238,112,31], root: [652,55,112,31], 'tld-com': [452,172,112,31], 'tld-edu': [852,172,112,31], 'auth-google': [452,282,112,31], 'auth-shu': [852,282,112,31] };
  let mode = 'guided', stage = 0, selectedPreset = 'first', selectedNode = 'device', sim, baseline, timer = null, selectedAnswer = null, notice = '', completed = false, renderedQuestion = -1;
  const saved = new Map();
  let logOffsets = {};
  let traceSelection = null;
  let traceRowEvents = [];
  let questionPrompted = false;
  const traceNames = { device: 'Laptop', resolver: 'Local resolver', root: 'Root', 'tld-com': '.com TLD', 'tld-edu': '.edu TLD', 'auth-google': 'google.com auth', 'auth-shu': 'sacredheart.edu auth' };
  function stop() { if (timer !== null) clearInterval(timer); timer = null; }
  function remember() { if (mode === 'guided') saved.set(stage, { simulation: sim.save(), baseline, selectedAnswer, selectedNode, notice, completed, selectedPreset, logOffsets: { ...logOffsets }, traceSelection, questionPrompted }); }
  function setup(preset, style = 'iterative', host = Sim.HOST) {
    stop(); logOffsets = {}; traceSelection = null; questionPrompted = false; $('prediction').classList.toggle('question-pulse',false); selectedPreset = preset; sim = Sim.preset(preset, style, host); baseline = sim.save(); notice = 'Ready. Press Play or Step to follow the messages; click a node to inspect it.';
  }
  function openStage(index, fresh = false) {
    stop(); $('prediction').classList.toggle('question-pulse',false); stage = index; const state = !fresh && saved.get(index), lesson = lessons[index];
    if (state) { sim = new Sim(); sim.restore(state.simulation); baseline = state.baseline; selectedAnswer = state.selectedAnswer; selectedNode = state.selectedNode; notice = state.notice; completed = state.completed; selectedPreset = state.selectedPreset; logOffsets = { ...state.logOffsets }; traceSelection = state.traceSelection ?? null; questionPrompted = !!state.questionPrompted; }
    else {
      setup(lesson.preset, lesson.style || 'iterative', lesson.host); selectedAnswer = null; completed = false; selectedNode = lesson.inspect;
      if (index < 2) notice = index === 0 ? 'A laptop asks its local resolver to translate a hostname. Continue to reveal how the resolver finds the answer.' : 'Select root, either TLD, or an authoritative server. Compare their owned data with their initially empty caches.';
    }
    render();
  }
  function setMode(next) { if (next === mode) return; stop(); remember(); mode = next; if(mode === 'guided') openStage(stage); else { setup('first'); selectedNode = 'resolver'; render(); } }
  function textElement(tag, text, className) { const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el; }
  function showRecords(box, records, cached) {
    box.replaceChildren();
    if (!records.length) { box.append(textElement('p', selectedNode === 'device' ? 'Device caching is not modeled.' : 'No cached responses.', 'empty-cache')); return; }
    const table = textElement('table', '', 'dns-record-table');
    const caption = textElement('caption', cached ? 'Cached DNS responses' : 'Owned DNS data', 'sr-only');
    const head = document.createElement('thead'), heading = document.createElement('tr');
    ['Name / value', 'Type', cached ? 'TTL left' : 'TTL'].forEach(label => { const th = textElement('th', label); th.setAttribute('scope', 'col'); heading.append(th); });
    head.append(heading); const body = document.createElement('tbody');
    records.forEach(r => {
      const row = document.createElement('tr'), name = document.createElement('td'), type = document.createElement('td');
      name.append(textElement('strong', r.name), textElement('span', '→ ' + r.value, 'record-value'));
      type.append(textElement('span', r.type, 'record-type'));
      const ttl = textElement('td', cached ? r.remaining + ' s' : r.ttl ? r.ttl + ' s' : '—', 'ttl-cell');
      ttl.setAttribute('data-tooltip', cached ? 'Original TTL: ' + r.ttl + ' seconds' : r.ttl ? 'TTL issued to a cached copy' : 'Owned delegation; no cache expiration');
      ttl.setAttribute('tabindex', '0');
      row.append(name, type, ttl); body.append(row);
    });
    table.append(caption, head, body); box.append(table);
  }
  function showCache() {
    $('inspector-empty').hidden = !!selectedNode; $('inspector-body').hidden = !selectedNode; $('deselect-node').hidden = !selectedNode;
    if (!selectedNode) { $('cache-title').textContent = 'Select a node'; return; }
    const entries = sim.activeCache(selectedNode), owned = sim.ownedRecords(selectedNode);
    $('cache-title').textContent = Sim.NODES[selectedNode].name; $('node-role').textContent = Sim.NODES[selectedNode].role; $('cache-total').textContent = String(entries.length);
    const locked = timer !== null || (sim.cursor > 0 && sim.cursor < sim.events.length) || (mode === 'guided' && stage < 2);
    $('age-node-cache').disabled = locked; $('flush-node-cache').disabled = locked || !entries.length;
    showRecords($('cache-content'), entries, true);
    $('owned-section').hidden = !owned.length; $('owned-title').textContent = selectedNode.startsWith('auth-') ? 'Authoritative records · owned' : 'Delegations · owned';
    showRecords($('owned-content'), owned, false);
    $('cache-note').textContent = selectedNode === 'resolver' ? 'Each cached answer and referral expires independently. TTL is time to live.' : selectedNode === 'device' ? 'The laptop delegates the lookup to its local resolver.' : selectedNode.startsWith('auth-') ? 'Owned records do not count down here. A returned copy gets a cache TTL.' : 'Normal iterative mode: these servers return referrals. In the conceptual recursive comparison, they can cache answers they forward.';
    const events = sim.history.map((event, i) => ({ event, i })).filter(({ event, i }) => i >= (logOffsets[selectedNode] || 0) && (event.from === selectedNode || event.to === selectedNode));
    $('node-event-log').replaceChildren(); $('node-log-empty').hidden = !!events.length; $('node-event-count').textContent = String(events.length); $('clear-node-log').disabled = !events.length;
    events.forEach(({event, i}) => { const li = document.createElement('li'); li.append(textElement('strong', 'Step ' + (i+1) + ' · ' + kinds[event.kind], event.kind), textElement('span', event.text)); $('node-event-log').append(li); });
  }
  function route(event) {
    const [x,y,w,h] = points[event.from], [tx,ty,tw,th] = points[event.to];
    if(event.from === event.to) return 'M'+(x-30)+' '+(y-h)+' C'+(x-65)+' '+Math.max(9,y-70)+','+(x+65)+' '+Math.max(9,y-70)+','+(x+30)+' '+(y-h);
    // Use open lanes between tiers instead of drawing through unrelated servers.
    if (event.from === 'resolver' || event.to === 'resolver') {
      const other = event.from === 'resolver' ? event.to : event.from, target = points[other];
      const forward = other === 'device' ? [[238,238],[258,238],[258,88],[184,88]]
        : other.startsWith('auth-') ? [[238,238],[270,238],[270,331],[target[0],331],[target[0],target[1]+target[3]]]
        : [[238,238],[270,238],[270,116],[target[0],116],[target[0],other==='root'?target[1]+target[3]:target[1]-target[3]]];
      const coords = event.from === 'resolver' ? forward : forward.slice().reverse();
      return coords.map((p,i)=>(i?'L':'M')+p[0]+' '+p[1]).join(' ');
    }
    const dx=tx-x,dy=ty-y,start=Math.min(dx?w/Math.abs(dx):Infinity,dy?h/Math.abs(dy):Infinity),end=Math.min(dx?tw/Math.abs(dx):Infinity,dy?th/Math.abs(dy):Infinity);
    return 'M'+(x+dx*start)+' '+(y+dy*start)+' L'+(tx-dx*end)+' '+(ty-dy*end);
  }
  function showNetwork() {
    const intro = mode === 'guided' && stage === 0, overview = mode === 'guided' && stage === 1;
    $('network').classList.toggle('stage-intro', intro); $('network').classList.toggle('playing', timer !== null);
    const event = sim.history[sim.history.length - 1], participants = new Set(sim.events.flatMap(e=>[e.from,e.to]));
    const focus = mode === 'guided' ? lessons[stage].focus : ['resolver'];
    Object.keys(points).forEach(id => {
      const el = $('node-'+id);
      el.classList.toggle('active', !!event && (id===event.from || id===event.to));
      el.classList.toggle('selected', id===selectedNode); el.classList.toggle('focus-node', !event && focus.includes(id));
      el.classList.toggle('muted-node', !intro && !overview && !participants.has(id));
      el.setAttribute('aria-pressed', String(id===selectedNode));
      const count = sim.activeCache(id).length;
      el.setAttribute('aria-label', 'Inspect '+Sim.NODES[id].name+'; '+count+' cached entries');
      el.setAttribute('tabindex', intro && id!=='device' && id!=='resolver' ? '-1' : '0');
      if(id!=='device') $('count-'+id).textContent = String(count);
    });
    const zone = sim.zone();
    ['com','edu'].forEach(tld=>$('branch-'+tld).classList.toggle('focus-branch', overview || (zone.tld===tld && participants.has(zone.tldNode))));
    $('network-title').textContent = intro ? 'Hostname → resolver → IP address' : overview ? 'Root → top-level domains → authoritative servers' : stage===4 && mode==='guided' && !participants.has('root') ? 'Cache shortcut · hierarchy contacted only when needed' : 'Selected branch: .'+zone.tld+' → '+zone.domain;
    const edge=$('active-edge'); edge.setAttribute('d', event ? route(event) : '');
    if(event) { edge.setAttribute('data-kind',event.kind); edge.setAttribute('marker-end','url(#arrow-'+event.kind+')'); }
  }
  function questionIsRelevant() {
    if (stage === 0) return true;
    if (stage === 1) return !!selectedNode && selectedNode.startsWith('auth-');
    if (stage === 2 || stage === 3) return !!sim.result;
    if (stage === 4) return !!sim.result && sim.result !== sim.currentAddress();
    return !!sim.result && sim.history.some(e => e.records.some(r => r.type === 'CNAME'));
  }
  function canAdvance() { return questionPrompted && selectedAnswer === lessons[stage].correct; }
  function canVisit(index) { return index <= stage || Array.from({length:index},(_,i)=>i).every(i=>i===stage?canAdvance():saved.get(i)?.selectedAnswer===lessons[i].correct); }
  function showNavigation() {
    $('next').disabled = !canAdvance();
    lessons.forEach((_,i)=>$('stage-'+i).disabled=!canVisit(i));
  }
  function showQuestion() {
    $('prediction').hidden=mode!=='guided'; if(mode!=='guided')return;
    const l=lessons[stage];
    if(renderedQuestion!==stage) {
      renderedQuestion=stage; $('question').textContent=l.question; $('answers').replaceChildren();
      l.answers.forEach((answer,index)=>{ const b=textElement('button',answer); b.addEventListener('click',()=>{if(!questionPrompted)return;selectedAnswer=index;showQuestion();}); $('answers').append(b); });
    }
    Array.from($('answers').children).forEach((b,i)=>b.setAttribute('aria-pressed',String(selectedAnswer===i)));
    $('feedback').textContent=selectedAnswer===null?'':(selectedAnswer===l.correct?'That’s right. ':'Consider this: ')+l.feedback;
    if (!questionPrompted && selectedAnswer === null && questionIsRelevant()) {
      questionPrompted = true;
      $('prediction').hidden = false;
      $('prediction').classList.toggle('question-pulse',false);
      void $('prediction').offsetWidth;
      $('prediction').classList.toggle('question-pulse',true);
    }
    if (selectedAnswer !== null) $('prediction').classList.toggle('question-pulse',false);
    $('prediction').hidden = !questionPrompted;
    const ready = questionPrompted && !canAdvance();
    $('prediction').classList.toggle('question-ready',ready);
    const cue = ready ? 'Answer correctly to continue' : 'Correct — continue with Next';
    if ($('question-cue').textContent !== cue) $('question-cue').textContent = cue;
    showNavigation();
  }
  function showTrace() {
    const body = $('history'), filter = $('trace-filter').value || 'all';
    if (traceRowEvents.length > sim.history.length || traceRowEvents.some((e,i) => e !== sim.history[i])) { body.replaceChildren(); traceRowEvents = []; }
    const hadRows = traceRowEvents.length;
    for (let i = traceRowEvents.length; i < sim.history.length; i++) {
      const e = sim.history[i], row = textElement('tr', '', 'trace-row trace-' + e.kind), no = document.createElement('td'), button = textElement('button', String(i+1), 'trace-number');
      button.setAttribute('aria-label', 'Inspect event ' + (i+1) + ': ' + kinds[e.kind]);
      const select = () => { traceSelection = i; showTrace(); };
      button.addEventListener('click', select); row.addEventListener('click', select); no.append(button);
      const info = e.text.split('. ')[0];
      row.append(no, textElement('td', (e.time ?? sim.time).toFixed(3)), textElement('td', traceNames[e.from]), textElement('td', e.kind === 'cache' ? '— (local)' : traceNames[e.to]), textElement('td', e.kind === 'cache' ? 'LOCAL' : 'DNS'), textElement('td', e.kind === 'cache' ? 'Cache hit' : kinds[e.kind]), textElement('td', info, 'trace-info-cell'));
      body.append(row); traceRowEvents.push(e);
    }
    const visible = [];
    Array.from(body.children).forEach((row,i) => {
      const e = sim.history[i]; row.hidden = !(filter === 'all' || filter === e.kind || (filter === 'dns' && e.kind !== 'cache'));
      if (!row.hidden) visible.push(i);
    });
    const selected = traceSelection !== null && visible.includes(traceSelection) ? traceSelection : visible[visible.length-1];
    Array.from(body.children).forEach((row,i) => { row.classList.toggle('trace-selected', i === selected); row.children[0].children[0].setAttribute('aria-pressed', String(i === selected)); });
    const e = sim.history[selected];
    $('trace-follow').setAttribute('aria-pressed', String(traceSelection === null));
    $('history-total').textContent = sim.history.length ? '· ' + sim.history.filter(e=>e.kind!=='cache').length + ' messages' : '';
    $('trace-count').textContent = visible.length + ' / ' + sim.history.length + ' events';
    $('history-empty').hidden = !!visible.length;
    $('history-empty').textContent = sim.history.length ? 'No events match this display filter.' : 'Play or step through a lookup to populate the trace.';
    $('trace-detail').hidden = !e; $('trace-detail-records').replaceChildren();
    if (e) {
      $('trace-detail-title').textContent = 'Event ' + (selected+1) + ' · ' + kinds[e.kind] + ' · ' + traceNames[e.from] + (e.kind==='cache' ? ' (local)' : ' → ' + traceNames[e.to]);
      $('trace-detail-text').textContent = e.text;
      e.records.forEach(r => $('trace-detail-records').append(textElement('p', r.type + ' · ' + r.name + ' → ' + r.value + ' · TTL at receipt: ' + (r.expires - e.time) + ' s', 'trace-record')));
    }
    if (traceSelection === null && sim.history.length > hadRows) $('trace-scroll').scrollTop = $('trace-scroll').scrollHeight;
  }
  function render() {
    const guided=mode==='guided',overview=guided&&stage<2,lesson=lessons[stage];
    $('guided').setAttribute('aria-pressed',String(guided)); $('sandbox').setAttribute('aria-pressed',String(!guided));
    $('lesson').hidden=!guided; $('lesson-navigation').hidden=!guided; $('sandbox-controls').hidden=guided;
    $('progress-label').textContent=completed?'Lesson complete':'Stage '+(stage+1)+' / 6';
    $('lesson-title').textContent=lesson.title; $('lesson-copy').textContent=lesson.copy;
    lessons.forEach((_,i)=>$('stage-'+i).setAttribute('aria-current',i===stage?'step':'false'));
    $('back').disabled=stage===0; $('next').textContent=stage===5?(completed?'Explore freely':'Finish lesson'):'Next stage';
    $('hostname-control').hidden=guided&&stage!==2;
    $('resolution-control').hidden=guided;
    $('stage-settings').hidden=guided&&stage!==2;
    $('style-note').hidden=sim.style==='iterative'||(guided&&stage!==3);
    $('hostname').value=sim.name; $('hostname').disabled=guided&&stage!==2;
    $('style').value=sim.style; $('style').disabled=guided;
    $('style-note').textContent=sim.style==='iterative'?'':'Conceptual comparison only: root/TLD forward recursively and cache returned answers. Real public root/TLD servers normally return referrals.';
    $('preset-description').textContent=descriptions[selectedPreset];
    document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preset===selectedPreset)));
    $('clock').textContent='Simulated time: '+sim.time+' s';
    $('play').textContent=timer===null?'Play':'Pause';
    const done=sim.cursor===sim.events.length,partial=sim.cursor>0&&!done;
    $('play').disabled=overview||done; $('step').disabled=overview||done||timer!==null; $('reset').disabled=overview;
    $('cache-actions').hidden=guided&&stage<4;
    ['repeat','advance','clear','change-address'].forEach(id=>$(id).disabled=partial||timer!==null);
    const event=sim.history[sim.history.length-1];
    $('message-type').textContent=event?kinds[event.kind]:overview?'Stage focus':'Ready';
    $('message-type').setAttribute('data-kind',event?event.kind:'');
    $('message-route').textContent=event?(event.from===event.to?Sim.NODES[event.from].name:Sim.NODES[event.from].name+' → '+Sim.NODES[event.to].name):'';
    $('exchange-count').textContent=overview?'':sim.cursor+'/'+sim.events.length+' steps · '+sim.events.filter(e=>e.from!==e.to).length+' messages';
    $('explanation').textContent=notice; $('result').hidden=!sim.result; $('result').textContent=sim.result?sim.name+' → '+sim.result:'';
    showNetwork(); showCache(); showQuestion();
    showTrace();
  }
  function step() {
    const event = sim.step();
    if (event) notice = event.text;
    if(sim.cursor===sim.events.length)stop(); render();
  }
  function newLookup(message) { stop(); logOffsets = {}; traceSelection = null; sim.start(); notice=message; render(); }
  function selectNode(id) { selectedNode=id; showCache(); showNetwork(); showQuestion(); }
  Object.keys(points).forEach(id=>{
    $('node-'+id).addEventListener('click',()=>selectNode(id));
    $('node-'+id).addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' ') { e.preventDefault(); selectNode(id); } });
  });
  $('inspect-resolver').addEventListener('click',()=>selectNode('resolver'));
  $('prediction').addEventListener('animationend',e=>{if(e.animationName==='question-pulse')$('prediction').classList.toggle('question-pulse',false);});
  $('trace-filter').addEventListener('change',()=>{traceSelection=null;showTrace();});
  $('trace-follow').addEventListener('click',()=>{traceSelection=null;showTrace();$('trace-scroll').scrollTop=$('trace-scroll').scrollHeight;});
  $('deselect-node').addEventListener('click',()=>{const previous=selectedNode;selectNode(null);if(previous)$('node-'+previous).focus();});
  $('age-node-cache').addEventListener('click',()=>{sim.advance();newLookup('Advanced 61 s for all caches. Play the next lookup to see which entries remain useful.');});
  $('flush-node-cache').addEventListener('click',()=>{if(!selectedNode)return;sim.clearCache(selectedNode);newLookup('Flushed cached responses at '+Sim.NODES[selectedNode].name+'. Owned records and other node caches are preserved.');});
  $('clear-node-log').addEventListener('click',()=>{if(selectedNode){logOffsets[selectedNode]=sim.history.length;showCache();}});
  lessons.forEach((_,i)=>$('stage-'+i).addEventListener('click',()=>{if(!canVisit(i))return;remember();openStage(i);}));
  $('guided').addEventListener('click',()=>setMode('guided')); $('sandbox').addEventListener('click',()=>setMode('sandbox'));
  $('next').addEventListener('click',()=>{ if(!canAdvance())return; if(stage<5){remember();openStage(stage+1);}else if(completed)setMode('sandbox');else{stop();completed=true;notice='Lesson complete. Revisit a stage or explore either domain in the sandbox.';render();} });
  $('back').addEventListener('click',()=>{if(stage>0){remember();openStage(stage-1);}});
  $('replay').addEventListener('click',()=>openStage(stage,true)); $('restart').addEventListener('click',()=>{saved.clear();openStage(0,true);});
  $('reset').addEventListener('click',()=>{stop();logOffsets={};traceSelection=null;sim.restore(baseline);notice='Scenario reset. Ready to trace the lookup again.';render();});
  $('play').addEventListener('click',()=>{if(timer!==null){stop();render();return;}if(sim.cursor===sim.events.length)return;timer=setInterval(step,1800);step();});
  $('step').addEventListener('click',step);
  $('repeat').addEventListener('click',()=>newLookup('Repeat lookup ready. Existing caches are preserved.'));
  $('advance').addEventListener('click',()=>{sim.advance();newLookup('Advanced 61 s across all caches. Expired entries are gone; play the next lookup.');});
  $('clear').addEventListener('click',()=>{sim.clearCache();newLookup('Local resolver cache cleared. Other servers keep their cached responses.');});
  $('change-address').addEventListener('click',()=>{sim.changeAddress();newLookup('The authority now owns '+sim.currentAddress()+'. Cached copies keep their original TTL.');});
  $('style').addEventListener('change',()=>{if(mode==='guided')return;setup(guidedPreset(),$('style').value,sim.zone().domain);render();});
  function guidedPreset(){return mode==='guided'?lessons[stage].preset:selectedPreset;}
  $('hostname').addEventListener('change',()=>{stop();logOffsets={};traceSelection=null;sim.start($('hostname').value);notice='Selected '+sim.name+'. Existing caches are preserved.';render();});
  document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{setup(b.dataset.preset,$('style').value,sim.zone().domain);render();}));
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();render();}});
  openStage(0,true);
})();
