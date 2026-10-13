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
  if (typeof module !== 'undefined' && module.exports) module.exports = { memoryWords, statistics, memoryMessage };
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
    const shape = message.severity === 'warning' ? '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3h.01"/>' : message.severity === 'success' ? '<circle cx="12" cy="12" r="9.5"/><path d="m7.5 12 3 3 6-6"/>' : '<circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7h.01"/>';
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
      info.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7h.01"/></svg>';
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
    const model = window.llmCreateGenerator(engine, Math.random, 24); model.reset(size);
    while (model.sample()) { /* Bounded synchronous generation: no queued animation or stale callbacks. */ }
    runs.push(model.snapshot()); if (runs.length > 2) runs.shift();
    const visual = $('limitsVisual'); visual.replaceChildren();
    runs.forEach((run, i) => { const block = element('div', '', 'limits-sample'); block.append(element('strong', `Sample ${i + 1} · ${run.size === 2 ? 'Bigram' : 'Trigram'}`)); const sentence = element('p', '', 'gen-sentence'); run.words.forEach(word => sentence.append(element('span', word, 'gen-word'))); block.append(sentence); visual.append(block); });
    $('limitsStatus').textContent = 'Compare the latest two samples. Do they sound natural? Make sense? Repeat? Have unusual transitions? Could this counting model explain the words? Samples stop at 24 added words or no continuation.';
    discover();
  }
  function render() {
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
    if (challenge === 3) { button(controls, 'Generate sample', generate).className = 'gen-primary'; $('limitsStatus').textContent = 'Generate twice to compare samples from the same pizza corpus and sampler as Scene 4.'; }
  }
  function reset() { size = challenge === 2 ? 1 : 2; extended = false; runs = []; render(); }
  $('limitsReset').addEventListener('click', reset);
  $('limitsIntervening').addEventListener('click', () => { extended = !extended; render(); discover(); $('limitsIntervening').focus(); });
  render();
})();
