/* Scene 5 uses the shared corpus, frequency counter, and Scene 4 sampler. */
(function () {
  'use strict';
  function memoryWords(size, extended) {
    const words = ('Marie arrived' + (extended ? ' at the conference after a long flight and several delays.' : '.') + ' She').split(' ');
    return words.map((word, i) => ({ word, active: i >= words.length - (size - 1) }));
  }
  function statistics(engine, size) {
    const frequencies = engine.corpusFrequencies(engine.corpus, size);
    return { total: frequencies.reduce((sum, entry) => sum + entry.count, 0), unique: frequencies.length,
      repeated: frequencies.filter(entry => entry.count > 1).length, single: frequencies.filter(entry => entry.count === 1).length };
  }
  function memoryMessage(size, words) {
    const capacity = size - 1, available = words.length, outside = Math.max(0, available - capacity);
    const model = size === 2 ? 'A bigram' : size === 3 ? 'A trigram' : 'A 5-gram';
    if (available < capacity) return { severity: 'warning', title: 'Not enough context', text: `${model} needs ${capacity} preceding words for a full context, but only ${available} are present. All ${available} are green; ${capacity - available} more ${capacity - available === 1 ? 'word is' : 'words are'} needed. The ? is a next-word placeholder, not a word. Add intervening words to fill the window.` };
    if (!outside) return { severity: 'success', title: 'Full context available', text: `${model} uses ${capacity} preceding words. All ${available} words fit in the green window; none are outside it. Add intervening words to see what falls out of view.` };
    return { severity: 'warning', title: 'Limited context', text: `${model} sees only “${words.slice(-capacity).map(item => item.word).join(' ')}”. It cannot use the earlier information about Marie to choose the next word. Adding more text does not increase how far back it can look.` };
  }
  function generatePair(engine, createGenerator, size, random = Math.random, limit = 24, mode = 'sampling') {
    const models = [0, 1].map(() => { const model = createGenerator(engine, random, limit); model.reset(size); return model; });
    const traces = models.map(() => Array(size - 1).fill(null));
    // Advance both samples at each step, retaining the actual evidence before sampling.
    for (let step = 0; step < limit; step++) {
      models.forEach((model, index) => {
        const context = model.context(), distribution = model.distribution();
        if (mode === 'greedy' ? model.greedy() : model.sample()) traces[index].push({ context, ...distribution });
      });
    }
    const samples = models.map((model, index) => ({ ...model.snapshot(), traces: traces[index], ended: !model.distribution().total }));
    samples.forEach((sample, index) => {
      sample.differences = sample.words.map((word, position) => Boolean(sample.traces[position]) && word !== samples[1 - index].words[position]);
      sample.branches = sample.words.map((word, position) => sample.differences[position] && sample.traces[position]?.context === samples[1 - index].traces[position]?.context);
    });
    return samples;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { memoryWords, statistics, memoryMessage, generatePair };
  if (typeof document === 'undefined') return;
  const $ = id => document.getElementById(id), engine = window.llmProbability;
  const exampleContexts = ['New Haven', 'purple elephants', 'pizza is', 'New York', 'the country', 'flying pizzas'];
  const names = ['The Memory Problem', 'The Unseen Sequence', 'The Sparse Data Problem', 'Patterns Versus Meaning'];
  const descriptions = ['Only the previous n−1 words are available as context.', 'Unfamiliar contexts have no observed next word.', 'Longer word sequences repeat less often in limited data.', 'Plausible word patterns do not establish understanding.'];
  const cardIcons = [
    '<rect x="3" y="8" width="5" height="8" rx="1" stroke-dasharray="2 2"/><rect x="11" y="8" width="5" height="8" rx="1"/><path d="M19 5v14m0-7h3"/>',
    '<path d="M3 8h5v8H3m8-4h4m-2-2 2 2-2 2M18 8a2 2 0 0 1 4 0c0 2-2 2-2 4m0 4h.01"/>',
    '<path d="M4 4v16h16M8 7h12M8 11h8M8 15h3"/>',
    '<path d="M4 4h16v12H9l-5 4V4Z M8 8h8M8 12h4"/>'
  ];
  const questions = ['How far back can an n-gram model look?', 'What happens when the model encounters a phrase it has never seen?', 'Does remembering more words always improve prediction?', 'Does generating plausible text mean the model understands it?'];
  const discoveries = ['An n-gram model considers only the previous n−1 words. Earlier information is unavailable to its prediction.', 'This model gets stuck on phrases it has never seen—even sensible ones—because it needs a matching pattern in its training text.', 'Larger n-grams provide more context, but exact sequences are harder to observe repeatedly in limited training data: more context, less repeated evidence.', 'This model follows observed word patterns. Plausible sequences do not establish semantic understanding. Familiar passages can sound natural and meaningful.'];
  let challenge = 0, size = 2, extended = false, runs = [];
  let generationMode = 'sampling';
  function closeGenerationMenu() { $('limitsModeMenu').hidden = true; $('limitsModeToggle').setAttribute('aria-expanded', 'false'); }
  let generationTimer = null, generationRevision = 0, cancelDisplay = null;
  function stopGeneration() {
    closeGenerationMenu();
    clearTimeout(generationTimer); generationTimer = null; generationRevision++;
    if (cancelDisplay) { cancelDisplay(); cancelDisplay = null; }
    $('limitsGenerate').disabled = false;
  }
  function element(tag, text, cls) { const node = document.createElement(tag); if (text) node.textContent = text; if (cls) node.className = cls; return node; }
  function icon() { return $('genTitle').querySelector('svg').cloneNode(true); }
  function button(parent, text, action, pressed) {
    const node = element('button', text); node.type = 'button';
    if (pressed !== undefined) node.setAttribute('aria-pressed', pressed);
    node.addEventListener('click', action); parent.append(node); return node;
  }
  function discover(text = discoveries[challenge]) {
    const p = $('limitsTakeaway'); p.replaceChildren($('genDiscovery').querySelector('svg').cloneNode(true), element('strong', 'Discovery: '), document.createTextNode(text));
    $('limitsDiscovery').setAttribute('data-severity', challenge === 1 || challenge === 2 ? 'warning' : 'success');
    if (challenge === 1 || challenge === 2) {
      const warning = element('span', '', 'prob-message-icon');
      warning.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3h.01"/></svg>';
      p.replaceChildren(warning, element('strong', 'Limitation: '), document.createTextNode(text));
    }
    $('limitsDiscovery').hidden = false;
  }
  function drawMemory() {
    const sentence = element('div', '', 'gen-sentence');
    const words = memoryWords(size, extended);
    words.forEach(({word, active}) => {
      const tile = element('span', word, 'gen-word ' + (active ? 'limits-context' : 'limits-outside'));
      tile.setAttribute('aria-label', word + (active ? ', available context' : ', outside context')); sentence.append(tile);
    });
    sentence.append(element('span', '?', 'gen-pending')); $('limitsVisual').replaceChildren(sentence);
    const message = memoryMessage(size, words), status = $('limitsStatus');
    status.className = 'gen-message limits-context-message';
    status.setAttribute('data-severity', message.severity);
    const graphic = element('span');
    const shape = message.severity === 'warning' ? '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3h.01"/>' : message.severity === 'success' ? '<circle cx="12" cy="12" r="9.5"/><path d="m7.5 12 3 3 6-6"/>' : '<circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7h.01" stroke-linecap="round"/>';
    graphic.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + shape + '</svg>';
    const copy = element('span'); copy.append(element('strong', message.title + ': '), document.createTextNode(message.text));
    status.replaceChildren(graphic, copy);
  }
  function predict(context) {
    [...$('limitsControls').children].forEach((card, index) => card.setAttribute('aria-pressed', exampleContexts[index] === context));
    highlightPassage(context);
    $('limitsVisual').replaceChildren(); $('limitsDiscovery').hidden = true;
    const result = engine.continuationCounts(engine.corpus, context);
    const list = element('div', '', 'gen-candidates');
    result.candidates.forEach(candidate => {
      const row = element('div', '', 'gen-candidate'); row.append(element('strong', candidate.word), element('span', `${candidate.count} of ${result.total} · ${Number((candidate.probability * 100).toFixed(1))}%`));
      const track = element('span', '', 'count-track'), bar = element('span', '', 'count-bar'); bar.style.width = `${candidate.probability * 100}%`; track.append(bar); row.append(track); list.append(row);
    });
    $('limitsVisual').append(list);
    $('limitsPredictionStatus').textContent = result.total ? `${result.total} observed continuations for “${context}”.` : 'No match: no observed continuation. Prediction cannot proceed from this context.';
    if (!result.total) discover();
  }
  function highlightPassage(context) {
    const passage = $('limitsPassage'), words = engine.wordSpans(engine.corpus);
    const target = engine.wordSpans(context);
    const starts = new Set();
    words.forEach((word, index) => {
      if (index + 2 < words.length && target.every((part, offset) => words[index + offset]?.normalized === part.normalized)) starts.add(index);
    });
    passage.replaceChildren();
    let end = 0;
    for (let index = 0; index < words.length; index++) {
      const word = words[index];
      passage.append(document.createTextNode(engine.corpus.slice(end, word.start)));
      if (starts.has(index)) {
        const group = element('span', '', 'limits-trigram');
        group.setAttribute('aria-label', 'Observed trigram: ' + words.slice(index, index + 3).map(item => item.text).join(' '));
        group.append(element('span', engine.corpus.slice(word.start, words[index + 1].end), 'limits-trigram-context'), element('span', engine.corpus.slice(words[index + 1].end, words[index + 2].end), 'limits-trigram-next'));
        passage.append(group); end = words[index + 2].end; index += 2;
      } else { passage.append(document.createTextNode(word.text)); end = word.end; }
    }
    passage.append(document.createTextNode(engine.corpus.slice(end)));
  }
  function drawStatistics() {
    const stats = statistics(engine, size), visual = $('limitsVisual'); visual.replaceChildren();
    const example = element('section', '', 'limits-evidence');
    const phraseWords = engine.wordSpans(engine.corpus).slice(0, size);
    const pattern = phraseWords.map(word => word.normalized).join(' ');
    const count = engine.corpusFrequencies(engine.corpus, size).find(entry => entry.pattern === pattern)?.count || 0;
    const tiles = element('div', '', 'gen-sentence');
    phraseWords.forEach(word => tiles.append(element('span', word.text, 'gen-word limits-context')));
    const badge = element('span', '', 'limits-evidence-count');
    badge.setAttribute('data-repeated', count > 1);
    badge.append(element('strong', String(count)), element('span', `${count === 1 ? 'match' : 'matches'} in this passage`));
    const connector = element('span', '', 'limits-evidence-connector');
    connector.setAttribute('aria-hidden', 'true');
    tiles.append(connector, badge);
    example.append(tiles);
    visual.append(example);
    const overview = element('section', '', 'limits-evidence');
    overview.append(element('h4', 'Longer groups rarely repeat.', 'limits-evidence-title'));
    const grid = element('div', '', 'limits-sparse-overview');
    for (let n = 1; n <= 5; n++) {
      const item = statistics(engine, n), card = element('div', '', 'limits-sparse-summary');
      card.setAttribute('data-selected', n === size);
      const groupName = n === 1 ? 'words' : n === 2 ? 'word pairs' : n + '-word groups';
      const explanation = `${item.repeated} of ${item.unique} distinct ${groupName} appear more than once. Each different ${n === 1 ? 'word' : 'group'} counts once in the total, regardless of how often it occurs. Longer groups can have more distinct combinations even though there are fewer total positions in the passage.`;
      card.setAttribute('data-tooltip', explanation);
      card.setAttribute('tabindex', '0');
      const track = element('span', '', 'count-track'), bar = element('span', '', 'count-bar');
      bar.style.width = `${100 * item.repeated / item.unique}%`; track.setAttribute('aria-hidden', 'true'); track.append(bar);
      const info = element('span', '', 'limits-kpi-info');
      info.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7h.01" stroke-linecap="round"/></svg>';
      const value = element('span', `${item.repeated}/${item.unique}`, 'limits-kpi-value');
      value.setAttribute('aria-label', `${item.repeated} of ${item.unique} distinct ${groupName} repeat`);
      card.append(element('strong', ['Unigram', 'Bigram', 'Trigram', '4-gram', '5-gram'][n - 1]), value, element('small', 'distinct groups repeat'), info, track);
      grid.append(card);
    }
    overview.append(grid); visual.append(overview);
    $('limitsPredictionStatus').textContent = `${size}-grams · ${stats.total} observed windows · ${stats.unique} distinct groups. ${stats.single} groups occur once. Bars show the share of distinct groups that repeat. Matching ignores case and punctuation.`;
    const unrepeatedSizes = [4, 5].filter(n => statistics(engine, n).repeated === 0);
    const consequence = 'Longer groups provide more context, but fewer matching examples.' + (unrepeatedSizes.length ? ' In this passage, no ' + unrepeatedSizes.map(n => n + '-word').join(' or ') + ' group repeats.' : ' More training text is needed to provide repeated evidence.');
    discover(consequence);
  }
  function generate() {
    stopGeneration();
    $('limitsStatus').className = 'gen-status';
    const revision = generationRevision;
    runs = generatePair(engine, window.llmCreateGenerator, size, Math.random, 24, generationMode);
    $('limitsDiscovery').hidden = true;
    const visual = $('limitsVisual'); visual.replaceChildren();
    const inspector = element('section', '', 'limits-choice-inspector');
    inspector.hidden = true;
    inspector.setAttribute('aria-label', 'Possible words at the selected step');
    inspector.setAttribute('aria-live', 'polite');
    const selections = [];
    function inspect(sampleIndex, position) {
      inspector.hidden = false;
      const run = runs[sampleIndex], trace = run.traces[position], selected = run.words[position];
      selections.forEach(item => item.node.setAttribute('aria-pressed', item.sampleIndex === sampleIndex && item.position === position));
      inspector.replaceChildren();
      const heading = element('h4', '', 'limits-evidence-title');
      heading.append($('genModelTitle').querySelector('svg').cloneNode(true), document.createTextNode(`Sample ${sampleIndex + 1} · word ${position + 1}: ${selected}`));
      inspector.append(heading, element('p', `Context: “${trace.context}” — amber marks where the samples chose different next words.`));
      const candidates = element('div', '', 'limits-choice-candidates');
      trace.candidates.forEach(candidate => {
        const card = element('div', '', 'limits-choice-candidate');
        card.setAttribute('data-chosen', candidate.word === selected);
        const track = element('span', '', 'count-track'), bar = element('span', '', 'count-bar');
        bar.style.width = `${candidate.probability * 100}%`; track.setAttribute('aria-hidden', 'true'); track.append(bar);
        card.append(element('strong', candidate.word + (candidate.word === selected ? ' · Selected' : '')), element('span', `${candidate.count} of ${trace.total} · ${Number((candidate.probability * 100).toFixed(1))}%`), track);
        candidates.append(card);
      });
      inspector.append(candidates, element('p', 'Generation samples using these probabilities; it does not always choose the most likely word. A 50% chance means roughly half of many draws, not a guaranteed choice in either sample.'));
    }
    const displays = [];
    runs.forEach((run, sampleIndex) => {
      const block = element('div', '', 'limits-sample');
      const title = element('strong', `Sample ${sampleIndex + 1} · ${run.size === 2 ? 'Bigram' : 'Trigram'} · ${generationMode === 'greedy' ? 'Greedy' : 'Sampling'}`, 'limits-sample-title');
      const activity = element('span', '', 'gen-typing');
      activity.setAttribute('data-active', 'true');
      activity.setAttribute('role', 'img');
      activity.setAttribute('aria-label', 'Generating');
      activity.setAttribute('data-tooltip', 'Generating');
      activity.innerHTML = '<svg viewBox="0 0 30 12" aria-hidden="true" focusable="false"><circle cx="5" cy="6" r="2.5"/><circle cx="15" cy="6" r="2.5"/><circle cx="25" cy="6" r="2.5"/></svg>';
      title.append(activity); block.append(title);
      const sentence = element('p', '', 'gen-sentence');
      const contextPositions = new Map();
      run.branches.forEach((branch, nextPosition) => {
        if (branch) for (let contextPosition = nextPosition - run.size + 1; contextPosition < nextPosition; contextPosition++) contextPositions.set(contextPosition, nextPosition);
      });
      const tiles = run.words.map((word, position) => {
        let tile;
        const nextPosition = contextPositions.get(position);
        if (nextPosition === undefined) { tile = element('span', word, 'gen-word'); sentence.append(tile); }
        else {
          tile = button(sentence, word, () => inspect(sampleIndex, nextPosition), false);
          tile.className = 'gen-word limits-branch-context';
          tile.disabled = true;
          tile.setAttribute('aria-label', `Sample ${sampleIndex + 1}, context: ${run.traces[nextPosition].context}. Show possible next words where the samples diverged.`);
          selections.push({ node: tile, sampleIndex, position: nextPosition });
        }
        tile.hidden = true;
        return tile;
      });
      const status = element('small'); status.hidden = true;
      displays.push({ tiles, status, run, activity });
      block.append(sentence, status); visual.append(block);
    });
    visual.append(inspector);
    const explanation = 'Amber marks the shared context where the samples chose different next words. Later words can differ because that choice changed the context. Does either passage make sense?';
    $('limitsStatus').textContent = '';
    $('limitsStatus').hidden = true;
    $('limitsGenerate').disabled = true;
    let position = 0;
    const length = Math.max(...runs.map(run => run.words.length));
    cancelDisplay = () => {
      displays.forEach(display => {
        display.activity.hidden = true; display.activity.setAttribute('data-active', 'false');
        if (position < display.tiles.length) { display.status.hidden = false; display.status.textContent = 'Generation stopped. Select Generate to start a new pair.'; }
      });
      $('limitsStatus').textContent = 'Generation stopped. Select Generate to start a new pair.';
      $('limitsStatus').hidden = false;
    };
    function advance() {
      if (revision !== generationRevision) return;
      displays.forEach(display => {
        if (display.tiles[position]) display.tiles[position].hidden = false;
        if (position >= display.tiles.length - 1) {
          display.activity.hidden = true; display.activity.setAttribute('data-active', 'false'); display.status.hidden = false;
          display.status.textContent = display.run.ended ? 'Stopped: no observed continuation.' : 'Stopped at 24 added words.';
        }
      });
      selections.forEach(item => {
        if (item.position <= position) { item.node.disabled = false; item.node.setAttribute('data-branch-revealed', 'true'); }
      });
      position++;
      if (position >= length) {
        generationTimer = null; cancelDisplay = null; $('limitsGenerate').disabled = false;
        $('limitsStatus').textContent = explanation;
        $('limitsStatus').hidden = false;
        if (!selections.length) {
          inspector.hidden = false;
          inspector.replaceChildren(element('p', generationMode === 'greedy' ? 'Both passages match: greedy always chooses the highest-probability word, with ties resolved by first appearance in the training text. Try Sampling to allow different paths.' : 'Both samples followed the same path this time. Generate again to compare another pair.'));
        }
        discover();
      } else if (!reducedMotion) generationTimer = setTimeout(advance, 500);
    }
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) { while (position < length) advance(); }
    else advance();
  }
  function render() {
    stopGeneration();
    $('limitsTraining').hidden = challenge !== 1;
    $('limitsPassage').textContent = engine.corpus;
    $('limitsPredictionFooter').hidden = challenge !== 1 && challenge !== 2;
    $('limitsStatus').hidden = challenge === 1 || challenge === 2;
    $('limitsStatus').className = 'gen-status';
    $('limitsStatus').setAttribute('data-severity', '');
    $('limitsTitle').replaceChildren(icon(), document.createTextNode(names[challenge]));
    $('limitsQuestion').textContent = questions[challenge];
    $('limitsDiscovery').hidden = true; $('limitsVisual').replaceChildren(); $('limitsStatus').textContent = '';
    const choices = $('limitsChallenges'); choices.replaceChildren();
    names.forEach((name, i) => {
      const card = button(choices, '', () => { challenge = i; reset(); $('limitsChallenges').children[i].focus(); }, challenge === i);
      const graphic = element('span', '', 'limits-card-icon');
      graphic.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + cardIcons[i] + '</svg>';
      card.append(graphic, element('strong', name), element('small', descriptions[i]));
    });
    const sizes = $('limitsSizes'); sizes.replaceChildren();
    (challenge === 0 ? [2, 3, 5] : challenge === 2 ? [1, 2, 3, 4, 5] : challenge === 3 ? [2, 3] : []).forEach(n => button(sizes, ['Unigram', 'Bigram', 'Trigram', '4-gram', '5-gram'][n - 1], () => { size = n; runs = []; render(); if (challenge === 0) discover(); [...sizes.children].find(b => b.getAttribute('aria-pressed') === 'true')?.focus(); }, size === n));
    const controls = $('limitsControls'); controls.replaceChildren();
    controls.className = challenge === 1 ? 'gen-actions limits-examples' : 'gen-actions';
    $('limitsIntervening').hidden = challenge !== 0;
    $('limitsGenerate').hidden = challenge !== 3;
    $('limitsGenerateControl').hidden = challenge !== 3;
    $('limitsGenerate').textContent = 'Generate · ' + (generationMode === 'greedy' ? 'Greedy' : 'Sampling');
    $('limitsModeSampling').setAttribute('aria-pressed', generationMode === 'sampling');
    $('limitsModeGreedy').setAttribute('aria-pressed', generationMode === 'greedy');
    $('limitsIntervening').textContent = extended ? 'Remove intervening words' : 'Add intervening words';
    controls.hidden = challenge === 0;
    if (challenge === 0) drawMemory();
    if (challenge === 1) {
      exampleContexts.forEach(context => {
        const card = button(controls, '', () => predict(context), false);
        const graphic = element('span', '', 'limits-card-icon');
        graphic.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 4h16v12H9l-5 4V4Z M8 8h8M8 12h4"/></svg>';
        card.append(graphic, element('strong', context));
      });
      $('limitsPredictionStatus').textContent = 'Select a phrase to see what the training text can predict.';
    }
    if (challenge === 2) { controls.hidden = true; drawStatistics(); }
    if (challenge === 3) {
      controls.hidden = true;
      const status = $('limitsStatus'), info = element('span', '', 'limits-placeholder-icon');
      info.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7h.01" stroke-linecap="round"/></svg>';
      status.className = 'gen-status limits-placeholder';
      status.replaceChildren(info, document.createTextNode('Select Generate to begin.'));
    }
  }
  function reset() { size = challenge === 2 ? 1 : 2; extended = false; runs = []; render(); }
  $('limitsReset').addEventListener('click', reset);
  $('limitsGenerate').addEventListener('click', generate);
  $('limitsModeToggle').addEventListener('click', () => {
    const open = $('limitsModeMenu').hidden;
    $('limitsModeMenu').hidden = !open; $('limitsModeToggle').setAttribute('aria-expanded', open);
    if (open) $(generationMode === 'greedy' ? 'limitsModeGreedy' : 'limitsModeSampling').focus();
  });
  for (const [id, mode] of [['limitsModeSampling', 'sampling'], ['limitsModeGreedy', 'greedy']]) $(id).addEventListener('click', () => {
    if (generationMode !== mode) { generationMode = mode; runs = []; render(); }
    closeGenerationMenu(); $('limitsModeToggle').focus();
  });
  $('limitsGenerateControl').addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeGenerationMenu(); $('limitsModeToggle').focus(); }
  });
  $('limitsGenerateControl').addEventListener('focusout', event => { if (!$('limitsGenerateControl').contains(event.relatedTarget)) closeGenerationMenu(); });
  document.addEventListener?.('pointerdown', event => { if (!$('limitsGenerateControl').contains(event.target)) closeGenerationMenu(); });
  window.cancelLimitsGeneration = stopGeneration;
  window.addEventListener?.('pagehide', stopGeneration);
  $('limitsIntervening').addEventListener('click', () => { extended = !extended; render(); discover(); $('limitsIntervening').focus(); });
  render();
})();
