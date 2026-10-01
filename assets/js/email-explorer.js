(function () {
  'use strict';
  const Sim = EmailSimulation, el = id => document.getElementById(id);
  const names = { alice: 'Alice’s laptop', sender: 'Alice’s mail server', receiver: 'Bob’s mail server', bob: 'Bob’s laptop' };
  const roles = { alice: 'User agent: compose, edit, and submit email.', sender: 'Stores outgoing mail in a queue. Acts as the SMTP client when transferring to Bob’s server.', receiver: 'Accepts SMTP transfers and stores mail in Bob’s mailbox.', bob: 'User agent: access and read mail stored at the receiving server.' };
  const edges = {
    submit: { path: 'M149 219H227V111H323', point: '227 165', nodes: ['alice', 'sender'] },
    transfer: { path: 'M391 111H649', point: '520 111', nodes: ['sender', 'receiver'] },
    access: { path: 'M717 111H813V219H891', point: '813 165', nodes: ['receiver', 'bob'] }
  };
  const shortTitles = ['Infrastructure', 'Delivery', 'SMTP', 'Message format', 'Connections', 'Reading mail'];
  let stage = 0, step = 0, mode = 'imap', learning = 'guided', timer = null;
  let selectedNode = 'alice', selectedAnswer = null, questionPrompted = false, completed = false, traceSelection = null;
  let renderedQuestion = -1, traceRows = [], guidedStage = 0;
  const saved = new Map();
  function flights(state) {
    if (!state.edge) return [];
    if (state.phase === 'TCP connection') return [{ label: 'TCP connect', reverse: false }];
    if (state.edge !== 'transfer') return [{ label: '', reverse: state.edge === 'access' && state.node === 'receiver' }];
    const result = [];
    for (const line of state.lines) {
      const match = line.match(/^(C|S): (220|221|250|354|HELO|MAIL FROM|RCPT TO|DATA|QUIT|\.)\b/);
      if (match) result.push({ label: match[2], reverse: match[1] === 'S' });
      else if (line === 'C: .') result.push({ label: '.', reverse: false });
      else if (!line.startsWith('[') && !result.some(item => item.label === '')) result.push({ label: '', reverse: false });
    }
    return result.length ? result : [{ label: '', reverse: false }];
  }
  let envelopeFrame = null, envelopeRun = '';
  const reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  function stopEnvelope() {
    if (envelopeFrame !== null) cancelAnimationFrame(envelopeFrame);
    envelopeFrame = null;
    envelopeRun = '';
  }
  function showEnvelope(state, edge) {
    const packet = el('message-packet'), path = el('active-edge');
    packet.setAttribute('visibility', edge ? 'visible' : 'hidden');
    packet.setAttribute('display', edge ? 'inline' : 'none');
    const exchanges = flights(state);
    function appearance(exchange) {
      el('packet-envelope').setAttribute('visibility', exchange.label ? 'hidden' : 'visible');
      el('packet-label').setAttribute('visibility', exchange.label ? 'visible' : 'hidden');
      el('packet-text').textContent = exchange.label;
    }
    const key = `${learning}:${stage}:${mode}:${step}`;
    if (!edge || timer === null || reducedMotion?.matches || typeof requestAnimationFrame !== 'function') {
      stopEnvelope();
      if (exchanges.length) appearance(exchanges[exchanges.length - 1]);
      packet.setAttribute('transform', `translate(${edge ? edge.point : '0 0'})`);
      return;
    }
    // Inspector and question updates must not restart the current flight.
    if (envelopeRun === key) return;
    stopEnvelope(); envelopeRun = key;
    const length = path.getTotalLength();
    let start = null;
    function position(fraction, exchange) {
      appearance(exchange);
      const point = path.getPointAtLength(length * (exchange.reverse ? 1 - fraction : fraction));
      packet.setAttribute('transform', `translate(${point.x} ${point.y})`);
    }
    position(0, exchanges[0]);
    function frame(now) {
      if (start === null) start = now;
      const elapsed = now - start;
      const index = Math.min(Math.floor(elapsed / 1400), exchanges.length - 1);
      const fraction = Math.min((elapsed - index * 1400) / 1200, 1);
      position(fraction, exchanges[index]);
      envelopeFrame = elapsed < exchanges.length * 1400 ? requestAnimationFrame(frame) : null;
    }
    envelopeFrame = requestAnimationFrame(frame);
  }
  reducedMotion?.addEventListener('change', () => { stopEnvelope(); render(); });
  const textElement = (tag, text) => { const node = document.createElement(tag); node.textContent = text; return node; };
  const stageButtons = Sim.lessons.map((lesson, index) => {
    const button = textElement('button', `${index + 1} · ${shortTitles[index]}`);
    button.addEventListener('click', () => { if (canVisit(index)) { remember(); openStage(index); } });
    el('stages').append(button);
    const option = textElement('option', lesson.title); option.value = String(index); el('scenario').append(option);
    return button;
  });
  function stop() { if (timer !== null) clearInterval(timer); timer = null; stopEnvelope(); }
  function currentQuestion() {
    if (stage === 5 && mode === 'imap') return [
      'Where does IMAP keep messages after Bob retrieves them?',
      ['Only on Bob’s laptop', 'On the mail server until removed'],
      1, 'IMAP keeps mail on the server. Retrieving or moving a message to a folder does not remove it; deletion and expunge remove it in this example.'
    ];
    return Sim.lessons[stage].question;
  }
  function canAdvance() { return questionPrompted && selectedAnswer === currentQuestion()[2]; }
  function canVisit(index) {
    return index <= stage || Array.from({ length: index }, (_, i) => i).every(i => i === stage ? canAdvance() : saved.get(i)?.selectedAnswer === Sim.lessons[i].question[2]);
  }
  function remember() {
    if (learning === 'guided') saved.set(stage, { step, mode, selectedNode, selectedAnswer, questionPrompted, completed, traceSelection });
  }
  function route(event) {
    const pair = edges[event.edge]?.nodes;
    return pair ? pair.map(id => names[id]).join(event.edge === 'submit' ? ' → ' : ' ↔ ') : (names[event.node] || 'Local event');
  }
  function kind(event) { return event.edge === 'access' ? 'access' : event.edge ? 'smtp' : 'local'; }
  function protocol(event) { return event.edge === 'access' ? (stage === 5 && mode === 'webmail' ? 'HTTPS' : 'IMAP') : event.edge ? (event.phase === 'TCP connection' ? 'TCP' : 'SMTP') : 'LOCAL'; }
  function showNetwork(state) {
    const edge = step ? edges[state.edge] : null;
    for (const id of Object.keys(names)) {
      const node = el('node-' + id);
      node.classList.toggle('active', step > 0 && (edge ? edge.nodes.includes(id) : state.node === id));
      node.classList.toggle('selected', selectedNode === id);
      node.classList.toggle('action-target', learning === 'guided' && stage === 0 && id === 'sender' && !questionPrompted);
      node.setAttribute('aria-pressed', String(selectedNode === id));
    }
    el('active-edge').setAttribute('d', edge ? edge.path : '');
    el('active-edge').setAttribute('data-kind', kind(state));
    el('active-edge').setAttribute('marker-end', edge ? 'url(#arrow-mail)' : '');
    el('active-edge').setAttribute('marker-start', edge && state.edge !== 'submit' ? 'url(#arrow-mail)' : '');
    showEnvelope(state, edge);
    el('network').classList.toggle('playing', timer !== null);
    el('queue').textContent = `Outgoing queue: ${state.queue}`;
    el('mailbox').textContent = `Stored messages: ${state.mailbox}`;
  }
  function showInspector(state) {
    el('inspector-empty').hidden = !!selectedNode; el('inspector-body').hidden = !selectedNode; el('deselect-node').hidden = !selectedNode;
    el('inspector-title').textContent = selectedNode ? names[selectedNode] : 'Select a node';
    if (!selectedNode) return;
    el('node-role').textContent = selectedNode === 'bob' && stage === 5 && mode === 'webmail' ? 'Web browser: uses HTTPS to access the webmail service.' : roles[selectedNode];
    const server = selectedNode === 'sender' || selectedNode === 'receiver';
    const count = selectedNode === 'sender' ? state.queue : state.mailbox;
    el('storage-title').textContent = server ? (selectedNode === 'sender' ? 'Outgoing message queue' : 'Bob’s server mailbox') : 'User agent';
    const box = el('storage-content'); box.replaceChildren();
    box.append(textElement('p', server ? `${count} ${count === 1 ? 'message' : 'messages'} ${selectedNode === 'sender' ? 'waiting to transfer' : 'stored on server'}.` : selectedNode === 'alice' ? 'Alice composes mail here. Her mail server handles onward delivery.' : 'Bob can read delivered mail later. His laptop does not need to be online when his server accepts it.'));
    for (let i = 0; server && i < count; i++) {
      const item = textElement('div', ''); item.className = 'stored-mail';
      item.append(textElement('strong', Sim.message[2]), textElement('span', Sim.message[0]), textElement('span', Sim.message[1]));
      if (selectedNode === 'receiver') item.append(textElement('span', stage === 5 && mode === 'imap' && step >= 3 ? 'Folder: Course' : 'Folder: Inbox'));
      box.append(item);
    }
    const nodeEvents = Sim.events(stage, mode).slice(0, step).map((event, i) => ({ event, i })).filter(({ event }) => event.node === selectedNode || edges[event.edge]?.nodes.includes(selectedNode));
    el('node-event-count').textContent = String(nodeEvents.length); el('node-log-empty').hidden = !!nodeEvents.length;
    el('node-event-log').replaceChildren(...nodeEvents.map(({ event, i }) => { const li = textElement('li', ''); li.append(textElement('strong', `Step ${i + 1} · ${event.phase}`), textElement('span', event.text)); return li; }));
  }
  function showMessagePreview(state) {
    const data = state.lines.includes('C: ' + Sim.message[2]);
    const anatomy = stage === 3 && ['Headers', 'Blank line', 'Body'].includes(state.phase);
    let caption = '';
    if (step && !(learning === 'guided' && stage === 0)) {
      if (stage === 5) {
        if (state.mailbox) caption = mode === 'webmail'
          ? (step >= 2 ? 'Bob’s browser — received message via HTTPS' : 'Bob’s server — stored message, not yet displayed')
          : (step === 2 ? 'Bob’s mail client — received message via IMAP' : 'Bob’s server — stored message');
      } else if (data || anatomy) caption = 'SMTP DATA — message headers and body';
      else if (state.phase === 'Compose' || (stage === 0 && step === 1)) caption = 'Alice’s user agent — composed message';
      else if (state.phase === 'Read' || (stage === 0 && step === 4)) caption = 'Bob’s mail client — received message via IMAP';
      else if (state.queue) caption = state.phase === 'Transfer' ? 'SMTP transfer — message in transit' : 'Alice’s server — queued message';
      else if (state.mailbox) caption = 'Bob’s server — stored message';
    }
    el('message-preview').hidden = !caption;
    el('preview-caption').textContent = caption;
    const separator = Sim.message.indexOf('');
    el('preview-headers').replaceChildren(...Sim.message.slice(0, separator).map(line =>
      textElement(line.startsWith('Subject:') ? 'strong' : 'span', line)));
    el('preview-body').textContent = Sim.message.slice(separator + 1).join('\n');
    el('preview-separator').hidden = !(data || anatomy);
    el('preview-body-label').hidden = data || anatomy;
    el('preview-note').textContent = data || anatomy
      ? 'Subject travels after DATA as a message header. RCPT TO determines the delivery recipient; Subject is not an SMTP command.'
      : 'The subject stays with the message from composition through delivery and reading.';
  }
  function showQuestion(state) {
    const [question, answers, correct, explanation] = currentQuestion();
    const questionKey = `${stage}:${mode}`;
    if (renderedQuestion !== questionKey) {
      renderedQuestion = questionKey; el('question').textContent = question;
      el('answers').replaceChildren(...answers.map((answer, index) => {
        const button = textElement('button', answer);
        button.addEventListener('click', () => { if (questionPrompted && learning === 'guided') { selectedAnswer = index; render(); } });
        return button;
      }));
    }
    if (learning === 'guided' && !questionPrompted && (stage === 0 ? selectedNode === 'sender' : state.done)) {
      questionPrompted = true;
      el('prediction').classList.toggle('question-pulse', true);
    }
    if (selectedAnswer !== null) el('prediction').classList.toggle('question-pulse', false);
    el('prediction').hidden = learning !== 'guided' || !questionPrompted;
    el('prediction').classList.toggle('question-ready', questionPrompted && !canAdvance());
    el('question-cue').textContent = canAdvance() ? (stage === 5 ? 'Correct — finish the lesson' : 'Correct — continue with Next') : 'Answer correctly to continue';
    Array.from(el('answers').children).forEach((b, i) => b.setAttribute('aria-pressed', String(selectedAnswer === i)));
    el('feedback').textContent = selectedAnswer === null ? '' : (selectedAnswer === correct ? 'That’s right. ' : 'Consider this: ') + explanation;
    el('next').disabled = !canAdvance();
    stageButtons.forEach((button, index) => { button.disabled = !canVisit(index); });
  }
  function showTrace() {
    const sequence = Sim.events(stage, mode).slice(0, step);
    if (traceRows.length > step) { el('history').replaceChildren(); traceRows = []; }
    for (let i = traceRows.length; i < sequence.length; i++) {
      const event = sequence[i], row = textElement('tr', ''); row.className = 'trace-row trace-' + kind(event);
      const cell = textElement('td', ''), button = textElement('button', String(i + 1)); button.className = 'trace-number';
      button.setAttribute('aria-label', `Inspect event ${i + 1}: ${event.phase}`);
      row.addEventListener('click', () => { traceSelection = i; showTrace(); });
      button.addEventListener('click', () => { traceSelection = i; showTrace(); });
      cell.append(button); row.append(cell, textElement('td', route(event)), textElement('td', protocol(event)), textElement('td', event.phase), textElement('td', event.text));
      el('history').append(row); traceRows.push(row);
    }
    const selected = traceSelection === null ? sequence.length - 1 : traceSelection;
    traceRows.forEach((row, i) => { row.classList.toggle('trace-selected', i === selected); row.children[0].children[0].setAttribute('aria-pressed', String(i === selected)); });
    const event = sequence[selected];
    el('trace-follow').setAttribute('aria-pressed', String(traceSelection === null));
    el('trace-detail').hidden = !event; el('history-empty').hidden = !!sequence.length;
    el('history-total').textContent = sequence.length ? `· ${sequence.length} events` : '';
    if (event) { el('trace-detail-title').textContent = `Event ${selected + 1} · ${event.phase}`; el('trace-detail-text').textContent = event.text; el('trace-lines').textContent = event.lines.join('\n') || 'Local teaching event — no protocol command lines.'; }
    el('transcript').textContent = sequence.flatMap(e => e.lines).join('\n') || 'No protocol exchanges yet.';
  }
  function render() {
    const state = Sim.snapshot(stage, step, mode), guided = learning === 'guided', overview = guided && stage === 0;
    el('guided').setAttribute('aria-pressed', String(guided)); el('sandbox').setAttribute('aria-pressed', String(!guided));
    el('lesson').hidden = !guided; el('lesson-navigation').hidden = !guided; el('sandbox-controls').hidden = guided;
    el('scenario').value = String(stage); el('preset-description').textContent = Sim.lessons[stage].copy;
    el('lesson-title').textContent = Sim.lessons[stage].title;
    el('lesson-copy').textContent = Sim.lessons[stage].copy;
    el('progress-label').textContent = completed ? 'Lesson complete' : `Stage ${stage + 1} / 6`;
    stageButtons.forEach((button, i) => button.setAttribute('aria-current', i === stage ? 'step' : 'false'));
    el('infrastructure-task').hidden = !overview;
    el('task-hint').textContent = canAdvance() ? 'Correct. Select Next stage to follow a message.' : questionPrompted ? 'Review the queue in the inspector, then answer below to unlock Next.' : 'Select Alice’s mail server to inspect its outgoing queue, then answer the question to unlock Next.';
    el('back').disabled = stage === 0;
    el('next').textContent = stage === 5 ? (completed ? 'Explore freely' : 'Finish lesson') : 'Next stage';
    el('playback-controls').hidden = overview;
    el('step').disabled = overview || state.done || timer !== null;
    el('play').disabled = overview || (state.done && timer === null);
    el('play').textContent = timer === null ? 'Play' : 'Pause'; el('play').setAttribute('aria-pressed', String(timer !== null));
    el('retrieval-settings').hidden = stage !== 5; el('retrieval').value = mode;
    const webmail = stage === 5 && mode === 'webmail'; el('webmail-note').hidden = !webmail;
    el('access-label').textContent = webmail ? 'HTTPS · webmail' : 'IMAP access'; el('bob-agent').textContent = webmail ? 'Web browser' : 'User agent';
    el('phase').textContent = overview ? 'Infrastructure' : state.phase;
    el('network-title').textContent = stage === 5 ? 'Accessing mail stored on Bob’s server' : 'User agents and mail servers';
    el('message-type').textContent = overview ? 'Stage focus' : step ? protocol(state) : 'Ready'; el('message-type').setAttribute('data-kind', kind(state));
    el('message-route').textContent = step ? route(state) : '';
    el('event-count').textContent = overview ? '' : `${step} / ${state.total} steps`;
    el('explanation').textContent = overview ? 'Select a laptop or mail server. Compare the user agents with the outgoing queue and incoming mailbox on the servers.' : state.text;
    el('result').hidden = !completed || !guided; el('result').textContent = 'Lesson complete. Revisit a stage or explore freely.';
    const anatomy = ['Envelope', 'Headers', 'Blank line', 'Body', 'DATA terminator'];
    ['envelope', 'headers', 'blank', 'body', 'terminator'].forEach((id, i) => el('anatomy-' + id).classList.toggle('anatomy-active', stage === 3 && state.phase === anatomy[i]));
    showMessagePreview(state); showNetwork(state); showInspector(state); showQuestion(state); showTrace();
  }
  function openStage(index, fresh = false) {
    stop(); stage = index;
    const state = learning === 'guided' && !fresh ? saved.get(index) : null;
    step = state?.step ?? 0; mode = state?.mode ?? (index === 5 ? mode : 'imap');
    selectedNode = state ? state.selectedNode : index === 0 ? 'alice' : index === 5 ? 'receiver' : 'sender';
    selectedAnswer = state?.selectedAnswer ?? null; questionPrompted = state?.questionPrompted ?? false; completed = state?.completed ?? false; traceSelection = state?.traceSelection ?? null;
    traceRows = []; el('history').replaceChildren(); el('prediction').classList.toggle('question-pulse', false);
    el('message-reference').open = index === 3;
    render();
  }
  function selectNode(id) { selectedNode = id; render(); }
  function advance() {
    if (Sim.snapshot(stage, step, mode).done) { stop(); render(); return; }
    step++;
    if (timer !== null) {
      clearInterval(timer);
      const duration = Math.max(1800, flights(Sim.snapshot(stage, step, mode)).length * 1400 + 200);
      timer = setInterval(advance, duration);
    }
    render();
  }
  function setLearning(next) {
    if (next === learning) return;
    stop();
    if (learning === 'guided') { remember(); guidedStage = stage; }
    learning = next;
    openStage(next === 'guided' ? guidedStage : 1, next !== 'guided');
  }
  Object.keys(names).forEach(id => {
    el('node-' + id).addEventListener('click', () => selectNode(id));
    el('node-' + id).addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectNode(id); } });
  });
  el('inspect-sender').addEventListener('click', () => selectNode('sender'));
  el('inspect-alice').addEventListener('click', () => selectNode('alice'));
  el('deselect-node').addEventListener('click', () => { const previous = selectedNode; selectNode(null); if (previous) el('node-' + previous).focus(); });
  el('step').addEventListener('click', advance);
  el('play').addEventListener('click', () => { if (timer !== null) { stop(); render(); return; } if (Sim.snapshot(stage, step, mode).done) return; timer = setInterval(advance, 1800); advance(); });
  el('back').addEventListener('click', () => { if (stage > 0) { remember(); openStage(stage - 1); } });
  el('next').addEventListener('click', () => {
    if (!canAdvance()) return;
    if (stage < 5) { remember(); openStage(stage + 1); }
    else if (completed) setLearning('sandbox');
    else { stop(); completed = true; render(); }
  });
  el('replay').addEventListener('click', () => openStage(stage, true));
  el('reset').addEventListener('click', () => openStage(stage, true));
  el('restart').addEventListener('click', () => { saved.clear(); mode = 'imap'; openStage(0, true); });
  el('retrieval').addEventListener('change', () => { mode = el('retrieval').value; openStage(stage, true); });
  el('guided').addEventListener('click', () => setLearning('guided'));
  el('sandbox').addEventListener('click', () => setLearning('sandbox'));
  el('scenario').addEventListener('change', () => { if (learning === 'sandbox') openStage(Number(el('scenario').value), true); });
  el('trace-follow').addEventListener('click', () => { traceSelection = null; showTrace(); });
  el('prediction').addEventListener('animationend', event => { if (event.animationName === 'question-pulse') el('prediction').classList.toggle('question-pulse', false); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); render(); } });
  openStage(0, true);
})();
