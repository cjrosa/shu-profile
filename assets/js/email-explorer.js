(function () {
  'use strict';
  const Sim = EmailSimulation;
  const el = id => document.getElementById(id);
  let stage = 0, step = 0, mode = 'imap', timer = null;
  const stageButtons = Sim.lessons.map((lesson, index) => {
    const button = document.createElement('button');
    button.textContent = `${index + 1}. ${lesson.title}`;
    button.addEventListener('click', () => selectStage(index));
    el('stages').append(button);
    return button;
  });
  function stop() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    el('play').textContent = 'Play';
    el('play').setAttribute('aria-pressed', 'false');
  }
  function render() {
    const state = Sim.snapshot(stage, step, mode);
    el('phase').textContent = state.phase;
    el('queue').textContent = `Outgoing queue: ${state.queue}`;
    el('mailbox').textContent = `Stored messages: ${state.mailbox}`;
    el('event-count').textContent = state.done ? `Stage complete · ${state.total} steps` : `Step ${state.step} of ${state.total}`;
    el('explanation').textContent = state.text;
    el('transcript').textContent = state.transcript.join('\n') || 'No protocol exchanges yet. Step through the stage to see events here.';
    el('transcript').scrollTop = el('transcript').scrollHeight;
    for (const node of ['alice', 'sender', 'receiver', 'bob']) el('node-' + node).classList.toggle('active', state.node === node);
    for (const edge of ['submit', 'transfer', 'access']) el('edge-' + edge).classList.toggle('active', state.edge === edge);
    el('step').disabled = state.done;
    el('play').disabled = state.done;
    if (state.done) stop();
  }
  function questions() {
    const [question, answers, correct, explanation] = Sim.lessons[stage].question;
    el('question').textContent = question;
    el('feedback').textContent = '';
    const buttons = answers.map((answer, index) => {
      const button = document.createElement('button');
      button.textContent = answer;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === index)));
        el('feedback').textContent = (index === correct ? 'Correct. ' : 'Try again. ') + explanation;
      });
      return button;
    });
    el('answers').replaceChildren(...buttons);
  }
  function selectStage(index) {
    stop(); stage = index; step = 0;
    const lesson = Sim.lessons[stage];
    el('lesson-title').textContent = lesson.title;
    el('lesson-copy').textContent = lesson.copy;
    el('progress-label').textContent = `Stage ${stage + 1} of 6`;
    el('progress').value = stage + 1;
    stageButtons.forEach((button, i) => button.setAttribute('aria-current', i === stage ? 'step' : 'false'));
    el('back').disabled = stage === 0;
    el('next').disabled = stage === 5;
    el('retrieval-settings').hidden = stage !== 5;
    const webmail = stage === 5 && mode === 'webmail';
    el('webmail-note').hidden = !webmail;
    el('access-label').textContent = webmail ? 'HTTPS' : 'IMAP';
    el('bob-agent').textContent = webmail ? 'Web browser' : 'User agent';
    questions(); render();
  }
  function advance() { step = Math.min(step + 1, Sim.events(stage, mode).length); render(); }
  el('step').addEventListener('click', () => { stop(); advance(); });
  el('play').addEventListener('click', () => {
    if (timer !== null) { stop(); return; }
    if (Sim.snapshot(stage, step, mode).done) return;
    timer = setInterval(advance, 1600);
    el('play').textContent = 'Pause';
    el('play').setAttribute('aria-pressed', 'true');
  });
  el('back').addEventListener('click', () => selectStage(Math.max(0, stage - 1)));
  el('next').addEventListener('click', () => selectStage(Math.min(5, stage + 1)));
  el('replay').addEventListener('click', () => selectStage(stage));
  el('restart').addEventListener('click', () => { mode = 'imap'; el('retrieval').value = mode; selectStage(0); });
  el('retrieval').addEventListener('change', () => { mode = el('retrieval').value; selectStage(stage); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  el('message-sample').textContent = Sim.message.join('\n');
  selectStage(0);
})();
