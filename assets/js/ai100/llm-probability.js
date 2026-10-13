/* Scene 3 uses Scene 2's corpus and normalization; no external services. */
(function () {
  'use strict';
  const { corpus, wordSpans, findPattern, corpusFrequencies, continuationCounts } = window.llmProbability;
  const $ = id => document.getElementById(id), words = wordSpans(corpus);
  let length = 1, context = 'Haven', resultsVisible = false;
  const history = new Map(), buttons = [];
  const percent = value => `${Number((value * 100).toFixed(1))}%`;
  const fraction = (count, total) => `${count} out of ${total} ${Math.abs(count / total * 100 - Number((count / total * 100).toFixed(1))) < 1e-10 ? '=' : '\u2248'} ${percent(count / total)}`;
  let revealRun = 0;
  const activeAnimations = new Set(), flyingWords = new Set();
  function cancelReveal() {
    revealRun++;
    activeAnimations.forEach(animation => animation.cancel());
    activeAnimations.clear();
    flyingWords.forEach(word => word.remove());
    flyingWords.clear();
    buttons.forEach(button => button.removeAttribute('data-reveal-step'));
    $('probBranches').querySelectorAll('.prob-branch').forEach(row => { row.style.visibility = ''; });
    $('probBranches').setAttribute('aria-busy', 'false');
  }
  async function animateStep(element, frames, duration) {
    const animation = element.animate(frames, { duration, easing: 'ease-in-out' });
    activeAnimations.add(animation);
    try { await animation.finished; } catch (_) { /* Reset or navigation cancels the sequence. */ }
    finally { activeAnimations.delete(animation); }
  }
  async function reveal() {
    if (resultsVisible) return;
    const animated = Boolean(buttons[0]?.animate) && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    resultsVisible = true; draw(animated);
    if (!animated) return;
    const run = revealRun;
    const rows = [...$('probBranches').querySelectorAll('.prob-branch')];
    if (!rows.length) { draw(); return; }
    const result = continuationCounts(corpus, context);
    const destinations = new Map(result.candidates.map((candidate, i) => [wordSpans(candidate.word)[0].normalized, rows[i]]));
    const collected = new Map();
    let collectedTotal = 0;
    function updateCollected() {
      destinations.forEach((row, word) => {
        const count = collected.get(word) || 0;
        row.style.visibility = count ? '' : 'hidden';
        row.children[1].textContent = count ? fraction(count, collectedTotal) : '';
        row.children[2].children[0].style.width = count ? `${count / collectedTotal * 100}%` : '0%';
        row.setAttribute('aria-label', count ? `${context} ${word}: ${fraction(count, collectedTotal)} collected so far. Highlight this n-gram in the training text.` : '');
      });
      $('probTotal').textContent = `Continuations collected so far: ${collectedTotal}.`;
      addMessageIcon($('probTotal'));
    }
    updateCollected();
    $('probBranches').setAttribute('aria-busy', 'true');
    $('probReveal').textContent = 'Revealing…';
    try {
      // Visit every observed occurrence in passage order, including repeated continuations.
      for (const match of findPattern(corpus, context, length)) {
        const nextIndex = match.index + length;
        if (!words[nextIndex]) continue;
        buttons.forEach(button => button.removeAttribute('data-reveal-step'));
        buttons.slice(match.index, nextIndex).forEach(button => button.setAttribute('data-reveal-step', 'context'));
        if (length === 1) buttons[nextIndex].setAttribute('data-reveal-step', 'pending-next');
        await animateStep(buttons[match.index], [{ opacity: 0.55 }, { opacity: 1 }], 240);
        if (run !== revealRun) return;
        const source = buttons[nextIndex], row = destinations.get(words[nextIndex].normalized);
        source.setAttribute('data-reveal-step', 'next');
        await animateStep(source, [{ opacity: 0.5 }, { opacity: 1 }], 180);
        if (run !== revealRun) return;
        const from = source.getBoundingClientRect(), to = row.getBoundingClientRect();
        const flyer = document.createElement('span');
        flyer.className = 'prob-flying-word'; flyer.textContent = words[nextIndex].text;
        flyer.setAttribute('aria-hidden', 'true');
        Object.assign(flyer.style, { left: `${from.left}px`, top: `${from.top}px` });
        document.body.append(flyer); flyingWords.add(flyer);
        await animateStep(flyer, [
          { transform: 'translate(0, 0)', opacity: 1 },
          { transform: `translate(${to.left + 12 - from.left}px, ${to.top + 7 - from.top}px)`, opacity: 0.9 }
        ], 420);
        flyer.remove(); flyingWords.delete(flyer);
        if (run !== revealRun) return;
        const key = words[nextIndex].normalized;
        collected.set(key, (collected.get(key) || 0) + 1);
        collectedTotal++;
        updateCollected();
        await animateStep(row, [{ backgroundColor: '#c9efd5' }, { backgroundColor: '#ffffff' }], 150);
        if (run !== revealRun) return;
      }
    } finally {
      if (run === revealRun) draw();
    }
  }
  function addMessageIcon(element) {
    if (!element.textContent) return;
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = "<svg class=\"prob-message-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"12\" cy=\"12\" r=\"9.5\"/><path d=\"M12 11v6M12 7h.01\"/></svg>";
    element.prepend(icon);
  }
  let hoveredWord = null, focusedWord = null;
  function drawBigramBorders() {
    const passage = $('probPassage');
    passage.querySelectorAll('.prob-joined-border').forEach(border => border.remove());
    buttons.forEach(button => button.removeAttribute('data-joined-border'));
    if (length !== 1) return;
    const bounds = passage.getBoundingClientRect();
    buttons.forEach((next, index) => {
      if (!index || next.getAttribute?.('data-bigram-next') !== 'true') return;
      const previous = buttons[index - 1];
      const a = previous.getBoundingClientRect(), b = next.getBoundingClientRect();
      const sameLine = Math.abs(a.top - b.top) < 3;
      previous.setAttribute('data-joined-border', 'true');
      next.setAttribute('data-joined-border', 'true');
      [a, b].forEach((rect, part) => {
        const border = document.createElement('span');
        border.className = 'prob-joined-border';
        border.setAttribute('aria-hidden', 'true');
        const left = part === 0 ? a.left - 2 : sameLine ? b.left : b.left - 2;
        const right = part === 0 && sameLine ? b.left : rect.right + 2;
        Object.assign(border.style, {
          left: `${left - bounds.left - passage.clientLeft}px`,
          top: `${rect.top - bounds.top - passage.clientTop - 1}px`,
          width: `${right - left}px`, height: `${rect.bottom - rect.top + 2}px`,
          borderStyle: part === 0 ? 'solid' : 'dashed',
          borderLeftWidth: part === 1 && sameLine ? '0' : 'var(--prob-highlight-width)',
          borderRightWidth: part === 0 && sameLine ? '0' : 'var(--prob-highlight-width)',
          borderRadius: sameLine ? (part === 0 ? '5px 0 0 5px' : '0 5px 5px 0') : '5px'
        });
        passage.append(border);
      });
    });
  }
  function highlightContinuation() {
    const word = hoveredWord ?? focusedWord;
    const nextWords = new Set(length === 1 ? findPattern(corpus, word === null ? context : `${context} ${word}`, word === null ? 1 : 2).map(match => match.index + 1) : []);
    const indices = new Set(word === null ? [] : findPattern(corpus, `${context} ${word}`, length + 1)
      .flatMap(match => Array.from({ length: length + 1 }, (_, offset) => match.index + offset)));
    buttons.forEach((button, index) => {
      button.setAttribute('data-continuation-highlight', indices.has(index));
      button.setAttribute('data-bigram-next', nextWords.has(index));
    });
    drawBigramBorders();
  }
  function select(value) { context = value; resultsVisible = false; $('probCalculation').open = false; draw(); }
  function draw(collecting = false) {
    cancelReveal();
    hoveredWord = null; focusedWord = null; highlightContinuation();
    const result = continuationCounts(corpus, context);
    $('probContext').textContent = context;
    $('probQuestion').textContent = `Which word is most likely to follow “${context}” in our training text?`;
    for (const n of [1, 2]) $('probSize' + (n + 1)).setAttribute('aria-pressed', length === n);
    $('probReveal').textContent = resultsVisible ? 'Results revealed' : 'Reveal';
    $('probReveal').disabled = resultsVisible;
    $('probDefinition').hidden = !resultsVisible || collecting;
    const example = result.candidates[0];
    $('probCalculationExample').textContent = example
      ? `In this passage, “${example.word}” follows “${context}” ${example.count} ${example.count === 1 ? 'time' : 'times'}. We observed ${result.total} ${result.total === 1 ? 'word' : 'words'} immediately after “${context}” in total.`
      : `No word follows “${context}” in this passage, so there are no observed continuations to divide by. We cannot calculate a probability from this text.`;
    $('probCalculationNumbers').textContent = example
      ? `${example.count} ÷ ${result.total} × 100 ${Math.abs(example.probability * 100 - Number((example.probability * 100).toFixed(1))) < 1e-10 ? '=' : '≈'} ${percent(example.probability)} chance of “${example.word}” following “${context}” in this text.`
      : '';
    $('probTotal').textContent = resultsVisible ? `Total observed continuations: ${result.total}.` : '';
    $('probBoundary').textContent = resultsVisible && result.terminal ? `${result.terminal} occurrence ends the corpus with no next word; it is excluded from the continuation total.` : '';
    addMessageIcon($('probTotal'));
    addMessageIcon($('probBoundary'));
    const branches = $('probBranches'); branches.replaceChildren();
    if (!resultsVisible || !result.total) {
      const message = document.createElement('li');
      message.textContent = !resultsVisible ? '' : 'No next word was observed. There is no probability distribution for this context; no words are invented.';
      addMessageIcon(message);
      branches.append(message);
    } else result.candidates.forEach(candidate => {
      const row = document.createElement('li'), label = document.createElement('strong'), value = document.createElement('span');
      row.className = 'prob-branch'; label.textContent = candidate.word;
      row.tabIndex = 0;
      row.setAttribute('aria-label', `${context} ${candidate.word}: ${percent(candidate.probability)}. Highlight this n-gram in the training text.`);
      row.addEventListener('pointerenter', () => { hoveredWord = candidate.word; highlightContinuation(); });
      row.addEventListener('pointerleave', () => { hoveredWord = null; highlightContinuation(); });
      row.addEventListener('focus', () => { focusedWord = candidate.word; highlightContinuation(); });
      row.addEventListener('blur', () => { focusedWord = null; highlightContinuation(); });
      value.textContent = `${candidate.count} out of ${result.total} ${Math.abs(candidate.probability * 100 - Number((candidate.probability * 100).toFixed(1))) < 1e-10 ? "=" : "\u2248"} ${percent(candidate.probability)}`;
      row.append(label, value);
      if (resultsVisible) {
        const track = document.createElement('span'), bar = document.createElement('span');
        track.className = 'count-track'; track.setAttribute('aria-hidden', 'true'); bar.className = 'count-bar'; bar.style.width = `${candidate.probability * 100}%`;
        track.append(bar); row.append(track);
      }
      branches.append(row);
    });
    $('probCertainty').hidden = collecting || !(resultsVisible && result.candidates.length === 1);
    $('probCertainty').textContent = `Discovery: Only “${result.candidates[0]?.word || ''}” was observed after “${context}” in this training text. A 100% observed probability here is not a guarantee about language outside this text.`;
    addMessageIcon($('probCertainty'));
    if (resultsVisible && !collecting) history.set(wordSpans(context).map(w => w.normalized).join(' '), { context, result });
    $('probHistory').replaceChildren();
    history.forEach(entry => {
      const row = document.createElement('li'), button = document.createElement('button'), description = document.createElement('span');
      button.type = 'button';
      const contextLabel = document.createElement('small'), contextWord = document.createElement('span');
      contextLabel.textContent = 'After'; contextWord.textContent = entry.context;
      button.append(contextLabel, contextWord);
      button.setAttribute('aria-label', `Predict again after ${entry.context}`);
      button.addEventListener('click', () => { length = wordSpans(entry.context).length; select(entry.context); });
      description.className = 'prob-history-candidates';
      if (!entry.result.total) description.textContent = 'No observed continuation';
      entry.result.candidates.forEach(candidate => {
        const item = document.createElement('span'), word = document.createElement('strong'), numbers = document.createElement('span');
        item.className = 'prob-history-candidate';
        word.textContent = candidate.word;
        numbers.textContent = `${candidate.count} of ${entry.result.total} · ${percent(candidate.probability)}`;
        item.append(word, numbers); description.append(item);
      });
      row.append(button, description); $('probHistory').append(row);
    });
    $('probCompare').hidden = false;
    $('probHistory').hidden = !history.size;
    $('probCompareHelp').textContent = history.size ? 'Select a saved context to predict again.' : 'Reveal a context to add it here.';
    addMessageIcon($('probCompareHelp'));
    $('probDiscovery').hidden = history.size < 2;
    const unequal = corpusFrequencies(corpus, length).find(entry => new Set(continuationCounts(corpus, entry.pattern).candidates.map(c => c.count)).size > 1);
    $('probUnequal').hidden = !unequal;
    $('probUnequal').onclick = () => select(unequal.pattern);
    function challengeButton(id, title, example) {
      const label = document.createElement('span'), hint = document.createElement('small');
      label.textContent = title; hint.textContent = example;
      $(id).replaceChildren(label, hint);
    }
    challengeButton('probEqual', 'A · Equal probabilities', length === 1 ? 'pizza' : 'Haven pizza');
    challengeButton('probSingle', 'B · One prediction', length === 1 ? 'New' : 'pizza is');
    challengeButton('probUnequal', 'C · Different probabilities', unequal?.pattern || '');
    $('probCompareStepOne').textContent = `Select “${length === 1 ? 'New' : 'pizza is'}” and reveal.`;
    $('probCompareStepTwo').textContent = `Select “${length === 1 ? 'Haven' : 'New Haven'}” and reveal again.`;
    $('probPassageHelp').textContent = `Select a starting word to use ${length === 1 ? 'one word' : 'two consecutive words'} as context. ${length + 1}-grams include that context plus the next word. As in Scene 2, groups may cross sentence boundaries.`;
    const selected = new Set(findPattern(corpus, context, length).flatMap(match => Array.from({ length }, (_, i) => match.index + i)));
    buttons.forEach((button, i) => {
      button.disabled = i + length > words.length;
      button.setAttribute('aria-pressed', selected.has(i));
      button.setAttribute('aria-label', `Use ${words.slice(i, i + length).map(w => w.text).join(' ')} as context`);
    });
  }
  let cursor = 0;
  words.forEach((word, index) => {
    $('probPassage').append(document.createTextNode(corpus.slice(cursor, word.start)));
    const button = document.createElement('button'); button.type = 'button'; button.className = 'count-word'; button.textContent = word.text;
    button.addEventListener('click', () => select(words.slice(index, index + length).map(w => w.text).join(' ')));
    $('probPassage').append(button); buttons.push(button); cursor = word.end;
  });
  $('probPassage').append(document.createTextNode(corpus.slice(cursor)));
  $('probReveal').addEventListener('click', reveal);
  $('probReset').addEventListener('click', () => { history.clear(); length = 1; select('Haven'); });
  for (const n of [1, 2]) $('probSize' + (n + 1)).addEventListener('click', () => { length = n; select(n === 1 ? 'Haven' : 'New Haven'); });
  $('probEqual').addEventListener('click', () => select(length === 1 ? 'pizza' : 'Haven pizza'));
  $('probSingle').addEventListener('click', () => select(length === 1 ? 'New' : 'pizza is'));
  window.drawProbability = draw;
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(drawBigramBorders).observe($('probPassage'));
  window.cancelProbabilityReveal = () => { if (activeAnimations.size) draw(); };
  // Fixed-position flying tiles must not retain stale coordinates after viewport movement.
  if (window.addEventListener) {
    window.addEventListener('scroll', window.cancelProbabilityReveal, true);
    window.addEventListener('resize', window.cancelProbabilityReveal);
  }
  draw();
})();
