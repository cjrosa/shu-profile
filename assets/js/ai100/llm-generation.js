/* Scene 4: generation uses the shared Scene 2/3 corpus and probability engine. */
(function () {
  'use strict';
  function createGenerator(engine, random = Math.random, limit = 40) {
    let size = 2, words = ['New'];
    const context = () => words.slice(-(size - 1)).join(' ');
    const distribution = () => engine.continuationCounts(engine.corpus, context());
    const generated = () => words.length - (size - 1);
    const reset = (nextSize = size) => { size = nextSize === 3 ? 3 : 2; words = size === 2 ? ['New'] : ['New', 'Haven']; };
    function append(word) {
      if (generated() >= limit || !distribution().candidates.some(candidate => candidate.word === word)) return false;
      words.push(word); return true;
    }
    function sample() {
      const result = distribution();
      if (!result.total || generated() >= limit) return false;
      let ticket = random() * result.total;
      for (const candidate of result.candidates) {
        ticket -= candidate.count;
        if (ticket < 0) return append(candidate.word);
      }
      return false;
    }
    return { reset, append, sample, context, distribution, generated, limit,
      snapshot: () => ({ size, words: [...words], generated: generated() }) };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { createGenerator };
  if (typeof document === 'undefined') return;
  const $ = id => document.getElementById(id), model = createGenerator(window.llmProbability);
  let revealed = false, running = false, timer = null, revision = 0;
  let lookingUp = false, lookupTimer = null;
  const runs = new Map();
  let runId = 1, deletedRun = false;
  function message(id, text) { $(id).textContent = text; }
  function stop() {
    running = false; clearTimeout(timer); timer = null;
    lookingUp = false; clearTimeout(lookupTimer); lookupTimer = null; revision++;
  }
  function draw(animate = false) {
    const state = model.snapshot(), result = model.distribution();
    const capped = state.generated >= model.limit, ended = !result.total;
    if (capped || ended) stop();
    $('genSentence').replaceChildren();
    state.words.forEach((word, index) => {
      const tile = document.createElement('span'); tile.textContent = word;
      tile.className = 'gen-word' + (index >= state.words.length - state.size + 1 ? ' gen-context-word' : '') + (animate && index === state.words.length - 1 ? ' gen-added' : '');
      $('genSentence').append(tile, document.createTextNode(' '));
    });
    const pending = document.createElement('span'); pending.className = 'gen-pending'; pending.textContent = capped || ended ? '■' : '?'; pending.setAttribute('aria-hidden', 'true'); $('genSentence').append(pending);
    $('genContext').textContent = model.context();
    $('genCount').textContent = `${state.generated} / ${model.limit} added words`;
    message('genStatus', capped ? `Generation paused at ${model.limit} added words. Reset to try another path.` : ended ? 'No continuation found. This word sequence was not followed by another word in the training text. Reset to try another path.' : running ? 'Generating one word at a time.' : revealed ? 'Choose the next word.' : 'What word comes next?');
    if (lookingUp) message('genStatus', 'Looking up learned word patterns…');
    $('genLookup').hidden = false;
    $('genLookup').setAttribute('data-active', lookingUp || running);
    $('genLookupContext').textContent = model.context();
    $('genLookupModel').textContent = state.size === 2 ? 'Bigram model' : 'Trigram model';
    [19, 44, 69].forEach((y, index) => {
      $('genPattern' + index).setAttribute('d', state.size === 3
        ? `M21 ${y}h11m7 0h11m7 0h11`
        : `M23 ${y}h18m7 0h20`);
    });
    $('genCandidates').setAttribute('aria-busy', lookingUp);
    $('genOutputPending').hidden = revealed || capped || ended;
    $('genReveal').disabled = lookingUp || revealed || running || capped || ended;
    $('genAuto').disabled = lookingUp || running || capped || ended;
    $('genStop').disabled = !running;
    $('genStop').hidden = !running;
    $('genAuto').hidden = running;
    for (const size of [2, 3]) $('genSize' + size).setAttribute('aria-pressed', state.size === size);
    $('genCandidates').replaceChildren();
    if (revealed && !capped) result.candidates.forEach(candidate => {
      const button = document.createElement('button'), word = document.createElement('strong'), values = document.createElement('span'), track = document.createElement('span'), bar = document.createElement('span');
      button.type = 'button'; button.className = 'gen-candidate'; button.disabled = running;
      word.textContent = candidate.word; values.textContent = `${candidate.count} of ${result.total} · ${Number((candidate.probability * 100).toFixed(1))}%`;
      track.className = 'count-track'; track.setAttribute('aria-hidden', 'true'); bar.className = 'count-bar'; bar.style.width = `${candidate.probability * 100}%`; track.append(bar); button.append(word, values, track);
      const version = revision;
      button.addEventListener('click', () => {
        if (version !== revision || running || !revealed) return;
        if (model.append(candidate.word)) { revision++; revealed = false; draw(true); ( $('genReveal').disabled ? $('genReset') : $('genReveal')).focus(); }
      });
      $('genCandidates').append(button);
    });
    if (state.generated && !deletedRun) runs.set(runId, { ...state, ended: capped || ended });
    drawComparison();
    $('genDiscovery').hidden = state.generated < 5;
  }
  function drawComparison() {
    $('genComparison').hidden = false;
    $('genCompareHelp').hidden = runs.size > 0;
    $('genCompareRows').hidden = !runs.size;
    $('genCompareRows').replaceChildren();
    runs.forEach((run, id) => {
      const row = document.createElement('div'), header = document.createElement('div');
      const label = document.createElement('h4'), text = document.createElement('p'), remove = document.createElement('button');
      header.className = 'gen-run-header';
      const title = document.createElement('span'), titleIcon = document.createElement('span');
      titleIcon.setAttribute('aria-hidden', 'true');
      titleIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M6 3h9l4 4v14H6Z"/><path d="M14 3v5h5M9 12h7M9 16h7"/></svg>';
      title.textContent = (run.size === 2 ? 'Bigram' : 'Trigram') + ' / Run ' + id + (run.ended ? ' / finished' : ' / partial');
      label.append(titleIcon, title);
      if (id === runId && !run.ended) {
        const activity = document.createElement('span');
        activity.className = 'gen-typing';
        activity.setAttribute('data-active', running || lookingUp);
        activity.setAttribute('role', 'img');
        activity.setAttribute('aria-label', running || lookingUp ? 'Generating' : 'Current run, waiting for your next choice');
        activity.title = running || lookingUp ? 'Generating' : 'Waiting for your next choice';
        activity.innerHTML = '<svg viewBox="0 0 30 12" aria-hidden="true" focusable="false"><circle cx="5" cy="6" r="2.5"/><circle cx="15" cy="6" r="2.5"/><circle cx="25" cy="6" r="2.5"/></svg>';
        label.append(activity);
      }
      text.textContent = run.words.join(' ');
      remove.type = 'button';
      remove.title = 'Delete run ' + id;
      remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>';
      remove.setAttribute('aria-label', 'Delete run ' + id + ' from comparison');
      remove.addEventListener('click', () => {
        runs.delete(id); if (id === runId) deletedRun = true;
        drawComparison(); $('genReset').focus();
      });
      header.append(label, remove); row.append(header, text); $('genCompareRows').append(row);
    });
  }
  function reset(size) { stop(); runId++; deletedRun = false; model.reset(size); revealed = false; draw(); }
  function schedule() {
    const version = revision;
    timer = setTimeout(() => {
      if (!running || version !== revision) return;
      model.sample(); revision++; revealed = true; draw(true);
      if (running) schedule();
    }, 1400);
  }
  $('genReveal').addEventListener('click', () => {
    if (lookingUp || revealed || running || !model.distribution().total || model.generated() >= model.limit) return;
    const version = ++revision;
    function finish() {
      if (version !== revision) return;
      lookingUp = false; lookupTimer = null; revealed = true; draw();
      $('genCandidates').firstElementChild?.focus();
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
    lookingUp = true; draw();
    lookupTimer = setTimeout(finish, 1200);
  });
  $('genAuto').addEventListener('click', () => { if (lookingUp || running || !model.distribution().total || model.generated() >= model.limit) return; running = true; revision++; revealed = true; draw(); schedule(); });
  $('genStop').addEventListener('click', () => { stop(); draw(); });
  $('genReset').addEventListener('click', () => reset());
  for (const size of [2, 3]) $('genSize' + size).addEventListener('click', () => reset(size));
  window.cancelGeneration = () => { stop(); draw(); };
  window.addEventListener?.('pagehide', stop);
  draw();
})();
