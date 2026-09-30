(() => {
  'use strict';
  const $ = id => document.getElementById(id), Sim = DNSSimulation;
  const lessons = [
    { title: 'Names become addresses', copy: 'The laptop knows a name. Its local resolver finds an IP address using a distributed database. This first view focuses on those two roles; the next stage opens the hierarchy.', preset: 'first', host: Sim.HOST, inspect: 'device', focus: ['device','resolver'], question: 'Why distribute the DNS database?', answers: ['Share responsibility; avoid one central bottleneck', 'Store every host address at the root'], correct: 0, feedback: 'Organizations manage their own records. The hierarchy helps the resolver find the organization responsible.' },
    { title: 'One root, two TLD branches', copy: 'Follow root → .com → google.com, or root → .edu → sacredheart.edu. Click any server to inspect its delegations, records, and cache. The local resolver sits outside this hierarchy.', preset: 'first', host: Sim.HOST, inspect: 'root', focus: ['root','tld-com','tld-edu','auth-google','auth-shu'], question: 'Who owns the simulated sacredheart.edu A record?', answers: ['The root server', 'The sacredheart.edu authoritative server'], correct: 1, feedback: 'The authoritative server owns the A record. Root and TLD servers provide directions.' },
    { title: 'Trace an iterative lookup', copy: 'Press Play or Step. Blue queries ask, amber referrals direct, and green answers return records. Trace the .edu branch, then change the hostname to google.com to try .com.', preset: 'first', host: Sim.HOST, inspect: 'resolver', focus: ['resolver','root','tld-edu','auth-shu'], question: 'What does the root return in this lookup?', answers: ['The host IP address', 'A referral to the correct TLD'], correct: 1, feedback: 'The root returns a referral. The local resolver follows it and continues asking.' },
    { title: 'Compare who continues the work', copy: 'The .com branch now shows conceptual recursive forwarding: root and TLD continue the lookup and pass answers back. Switch to iterative referrals to compare. Click the servers to see returned answers enter their caches.', preset: 'first', host: 'google.com', style: 'recursive', inspect: 'root', focus: ['root','tld-com','auth-google'], question: 'In the usual iterative lookup, who follows referrals?', answers: ['The local resolver', 'The requesting laptop'], correct: 0, feedback: 'The local resolver follows referrals. Full recursive forwarding through root and TLD servers is only a conceptual comparison here.' },
    { title: 'Cached answers take a shortcut', copy: 'Play the cached lookup: only laptop and resolver exchange messages. Change IP and repeat to see a stale answer. Advance +61 s and play again: the expired A record refreshes using cached referrals.', preset: 'cached', host: Sim.HOST, inspect: 'resolver', focus: ['device','resolver'], question: 'The authoritative IP changes before the cached A expires. What may return?', answers: ['The old cached IP', 'Always the new IP immediately'], correct: 0, feedback: 'The cached answer can remain stale until its TTL expires. Referrals have separate, longer TTLs.' },
    { title: 'Follow an alias to an A record', copy: 'Resolve www.sacredheart.edu: its CNAME points to sacredheart.edu, then A supplies the address. Click the authority to compare owned records with the resolver cache. After +61 s, CNAME remains while A expires.', preset: 'alias', host: Sim.HOST, inspect: 'auth-shu', focus: ['resolver','auth-shu'], question: 'What does CNAME contain?', answers: ['An IPv4 address', 'Another hostname'], correct: 1, feedback: 'CNAME names the canonical host; A supplies an IPv4 address. MX identifies a mail server and comes later in the email tool.' }
  ];
  const descriptions = { first: 'Start empty and trace the selected domain.', cached: 'A previous lookup has populated caches.', expired: '61 s later: the A expired, but referrals can remain.', changed: 'The authority changed its IP; the cached answer is still valid.', alias: 'Follow a CNAME to its canonical hostname, then its A record.' };
  const kinds = { query: 'Query', referral: 'Referral', answer: 'Answer', cache: 'Cache hit · local' };
  const points = { device: [82,210,57,40], resolver: [255,219,94,27], root: [557,53,94,27], 'tld-com': [430,150,94,27], 'tld-edu': [692,150,94,27], 'auth-google': [430,268,94,27], 'auth-shu': [692,268,94,27] };
  let mode = 'guided', stage = 0, selectedPreset = 'first', selectedNode = 'device', sim, baseline, timer = null, selectedAnswer = null, notice = '', completed = false, renderedQuestion = -1;
  const saved = new Map();
  function stop() { if (timer !== null) clearInterval(timer); timer = null; }
  function remember() { if (mode === 'guided') saved.set(stage, { simulation: sim.save(), baseline, selectedAnswer, selectedNode, notice, completed, selectedPreset }); }
  function setup(preset, style = 'iterative', host = Sim.HOST) {
    stop(); selectedPreset = preset; sim = Sim.preset(preset, style, host); baseline = sim.save(); notice = 'Ready. Press Play or Step to follow the messages; click a node to inspect it.';
  }
  function openStage(index, fresh = false) {
    stop(); stage = index; const state = !fresh && saved.get(index), lesson = lessons[index];
    if (state) { sim = new Sim(); sim.restore(state.simulation); baseline = state.baseline; selectedAnswer = state.selectedAnswer; selectedNode = state.selectedNode; notice = state.notice; completed = state.completed; selectedPreset = state.selectedPreset; }
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
    records.forEach(r => {
      const item = textElement('div', '', 'cache-item');
      item.append(textElement('span', r.type, 'record-type'), textElement('strong', r.name), textElement('div', '→ ' + r.value, 'cache-value'));
      if (cached) item.append(textElement('div', r.remaining + ' s left · TTL ' + r.ttl + ' s', 'ttl'));
      else if(r.ttl) item.append(textElement('div', 'TTL issued to caches: ' + r.ttl + ' s', 'ttl'));
      box.append(item);
    });
  }
  function showCache() {
    const entries = sim.activeCache(selectedNode), owned = sim.ownedRecords(selectedNode);
    $('cache-title').textContent = Sim.NODES[selectedNode].name; $('node-role').textContent = Sim.NODES[selectedNode].role; $('cache-total').textContent = String(entries.length);
    showRecords($('cache-content'), entries, true);
    $('owned-section').hidden = !owned.length; $('owned-title').textContent = selectedNode.startsWith('auth-') ? 'Authoritative records · owned' : 'Delegations · owned';
    showRecords($('owned-content'), owned, false);
    $('cache-note').textContent = selectedNode === 'resolver' ? 'Each cached answer and referral expires independently. TTL is time to live.' : selectedNode === 'device' ? 'The laptop delegates the lookup to its local resolver.' : selectedNode.startsWith('auth-') ? 'Owned records do not count down here. A returned copy gets a cache TTL.' : 'Normal iterative mode: these servers return referrals. In the conceptual recursive comparison, they can cache answers they forward.';
  }
  function route(event) {
    const [x,y,w,h] = points[event.from], [tx,ty,tw,th] = points[event.to];
    if(event.from === event.to) return 'M'+(x-30)+' '+(y-h)+' C'+(x-65)+' '+Math.max(9,y-70)+','+(x+65)+' '+Math.max(9,y-70)+','+(x+30)+' '+(y-h);
    // Approach authority nodes below the hierarchy so an .edu message never crosses .com's server.
    if ((event.from === 'resolver' && event.to.startsWith('auth-')) || (event.to === 'resolver' && event.from.startsWith('auth-'))) {
      const authority = points[event.from === 'resolver' ? event.to : event.from];
      const forward = [[320,246],[320,317],[authority[0],317],[authority[0],295]];
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
  function showQuestion() {
    $('prediction').hidden=mode!=='guided'; if(mode!=='guided')return;
    const l=lessons[stage];
    if(renderedQuestion!==stage) {
      renderedQuestion=stage; $('question').textContent=l.question; $('answers').replaceChildren();
      l.answers.forEach((answer,index)=>{ const b=textElement('button',answer); b.addEventListener('click',()=>{selectedAnswer=index;showQuestion();}); $('answers').append(b); });
    }
    Array.from($('answers').children).forEach((b,i)=>b.setAttribute('aria-pressed',String(selectedAnswer===i)));
    $('feedback').textContent=selectedAnswer===null?'':(selectedAnswer===l.correct?'That’s right. ':'Consider this: ')+l.feedback;
  }
  function render() {
    const guided=mode==='guided',overview=guided&&stage<2,lesson=lessons[stage];
    $('guided').setAttribute('aria-pressed',String(guided)); $('sandbox').setAttribute('aria-pressed',String(!guided));
    $('lesson').hidden=!guided; $('lesson-navigation').hidden=!guided; $('sandbox-controls').hidden=guided;
    $('progress-label').textContent=completed?'Lesson complete':'Stage '+(stage+1)+' / 6';
    $('lesson-title').textContent=lesson.title; $('lesson-copy').textContent=lesson.copy;
    if (stage===3) $('lesson-copy').textContent=sim.style==='recursive'
      ? 'The .'+sim.zone().tld+' branch shows conceptual recursive forwarding: root and TLD continue the work, then pass answers back. Click a server to watch its cache fill. Switch to iterative referrals to compare.'
      : 'The local resolver now follows referrals through the .'+sim.zone().tld+' branch. Root and TLD return directions instead of forwarding the query. Switch to recursive forwarding to compare the paths and caches.';
    lessons.forEach((_,i)=>$('stage-'+i).setAttribute('aria-current',i===stage?'step':'false'));
    $('back').disabled=stage===0; $('next').textContent=stage===5?(completed?'Explore freely':'Finish lesson'):'Next stage';
    $('hostname').value=sim.name; $('hostname').disabled=guided&&(stage===0||stage===5);
    $('style').value=sim.style; $('style').disabled=guided&&stage!==3;
    $('style-note').textContent=sim.style==='iterative'?'Usual pattern: the laptop asks recursively; the local resolver follows iterative referrals.':'Conceptual comparison only: root/TLD forward recursively and cache returned answers. Real public root/TLD servers normally return referrals.';
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
    $('history').replaceChildren(); $('history-empty').hidden=sim.history.length>0; $('history-total').textContent=sim.history.length?'· '+sim.history.length+' steps':'';
    sim.history.forEach(e=>{ const li=document.createElement('li'); li.append(textElement('strong',kinds[e.kind]+' · '+Sim.NODES[e.from].name+(e.from===e.to?'':' → '+Sim.NODES[e.to].name),e.kind),textElement('span',e.text)); $('history').append(li); });
  }
  function step() { const event=sim.step(); if(event)notice=event.text; if(sim.cursor===sim.events.length)stop(); render(); }
  function newLookup(message) { stop(); sim.start(); notice=message; render(); }
  function selectNode(id) { selectedNode=id; showCache(); showNetwork(); }
  Object.keys(points).forEach(id=>{
    $('node-'+id).addEventListener('click',()=>selectNode(id));
    $('node-'+id).addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' ') { e.preventDefault(); selectNode(id); } });
  });
  $('inspect-resolver').addEventListener('click',()=>selectNode('resolver'));
  lessons.forEach((_,i)=>$('stage-'+i).addEventListener('click',()=>{remember();openStage(i);}));
  $('guided').addEventListener('click',()=>setMode('guided')); $('sandbox').addEventListener('click',()=>setMode('sandbox'));
  $('next').addEventListener('click',()=>{ if(stage<5){remember();openStage(stage+1);}else if(completed)setMode('sandbox');else{stop();completed=true;notice='Lesson complete. Revisit a stage or explore either domain in the sandbox.';render();} });
  $('back').addEventListener('click',()=>{if(stage>0){remember();openStage(stage-1);}});
  $('replay').addEventListener('click',()=>openStage(stage,true)); $('restart').addEventListener('click',()=>{saved.clear();openStage(0,true);});
  $('reset').addEventListener('click',()=>{stop();sim.restore(baseline);notice='Scenario reset. Ready to trace the lookup again.';render();});
  $('play').addEventListener('click',()=>{if(timer!==null){stop();render();return;}if(sim.cursor===sim.events.length)return;timer=setInterval(step,1800);step();});
  $('step').addEventListener('click',step);
  $('repeat').addEventListener('click',()=>newLookup('Repeat lookup ready. Existing caches are preserved.'));
  $('advance').addEventListener('click',()=>{sim.advance();newLookup('Advanced 61 s across all caches. Expired entries are gone; play the next lookup.');});
  $('clear').addEventListener('click',()=>{sim.clearCache();newLookup('Local resolver cache cleared. Other servers keep their cached responses.');});
  $('change-address').addEventListener('click',()=>{sim.changeAddress();newLookup('The authority now owns '+sim.currentAddress()+'. Cached copies keep their original TTL.');});
  $('style').addEventListener('change',()=>{setup(guidedPreset(),$('style').value,sim.zone().domain);render();});
  function guidedPreset(){return mode==='guided'?lessons[stage].preset:selectedPreset;}
  $('hostname').addEventListener('change',()=>{stop();sim.start($('hostname').value);notice='Selected '+sim.name+'. Existing caches are preserved.';render();});
  document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{setup(b.dataset.preset,$('style').value,sim.zone().domain);render();}));
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();render();}});
  openStage(0,true);
})();
