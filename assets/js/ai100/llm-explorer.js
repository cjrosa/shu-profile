/* Scene metadata, navigation, and the first n-gram demonstration. */
(function () {
  'use strict';
  const scene = (id, title, description, placeholder) => ({ id, title, description, placeholder });
  const chapters = [
    { id: 'predict', title: 'Predict', question: 'How can computers predict and generate language?', scenes: [
      scene('n-grams', 'What Is an N-Gram?', 'Group neighboring words into n-grams and see how the groups overlap as you move through a sentence.', 'A sentence will be grouped into overlapping sequences of consecutive words to show how n-grams are formed.'),
      scene('counting', 'Counting Word Patterns', 'Find repeated word groups in a passage and compare their counts to discover common patterns.', 'Repeated word sequences will be highlighted in a short training text and paired with their observed counts.'),
      scene('conditional-probability', 'Conditional Probability', 'Use the words before a blank to compare possible next words and calculate their probabilities from the passage.', 'Observed word patterns will connect a preceding context to possible next words and their relative frequencies.'),
      scene('generating-language', 'Generating Language', 'Build text one word at a time and compare how different choices change the words that follow.', 'A sentence will grow one word at a time as each prediction supplies the context for the next step.'),
      scene('n-gram-limits', 'The Limits of N-Grams', 'Explore what happens when a word pattern is missing, context is too short, or generated text lacks meaning.', 'Contrasting examples will reveal what happens when a word sequence is unseen or important context falls outside the n-gram.')
    ] },
    { id: 'tokenize', title: 'Tokenize', question: 'How does an LLM represent language?', scenes: [
      scene('words-tokens', 'Words vs. Tokens', 'Compare words with real tokenizer output and see how spaces, punctuation, and word pieces affect the split.', 'The same text will be shown as words and as tokens, making differences in boundaries visible.'),
      scene('subwords', 'Subword Tokenization', 'Explore how smaller, reusable word pieces help a model represent many different words.', 'Related words will be separated into reusable pieces to illustrate how subword tokens represent language.'),
      scene('tokenizer', 'Inside a Tokenizer', 'Connect text pieces to entries in a tokenizer vocabulary and the numerical IDs used to represent them.', 'A text example will connect token boundaries to vocabulary entries and their token IDs.'),
      scene('context-windows', 'Context Windows', 'Explore how a token limit determines how much text a model can consider at one time.', 'A bounded token window will show which parts of a longer passage fit within the available context.')
    ] },
    { id: 'context', title: 'Context', question: 'Why does language prediction require context?', scenes: [
      scene('context-matters', 'Why Context Matters', 'See how surrounding words and earlier information help resolve meaning and guide predictions.', 'Connections between distant words will show how earlier information can change the meaning of a later word.'),
      scene('rnn-approach', 'RNN Refresher', 'Remember how an RNN builds a running impression, one word at a time, and uses it to generate the next word?', 'Revisit how the hidden state carries a running impression through a sequence.'),
      scene('long-distance', 'The Long-Distance Challenge', 'Explore why information from earlier words can become harder to retain as a sequence grows.', 'A longer sequence will trace how information from an earlier word must travel through successive processing steps.'),
      scene('transformer', 'Enter the Transformer', 'Discover how transformers connect information across a sequence to build context for each token.', 'A comparison of sequential processing and token-to-token connections will introduce the transformer approach to context.')
    ] },
    { id: 'attend', title: 'Attend', question: 'How do transformers incorporate information across tokens?', scenes: [
      scene('self-attention', 'Introducing Self-Attention', 'Explore how each token draws on other tokens to build a representation of its meaning in context.', 'Connections from one token to other tokens will illustrate which contextual information may be relevant.'),
      scene('qkv', 'Queries, Keys, and Values', 'See how queries, keys, and values work together to find and combine relevant information from other tokens.', 'A token diagram will distinguish queries, keys, and values and show their roles in forming attention relationships.'),
      scene('attention-weights', 'Attention Weights', 'Compare attention weights and see how they control the information combined from different tokens.', 'Attention weights will be paired with token information to illustrate a weighted combination.'),
      scene('feed-forward', 'Feed-Forward Networks', 'Explore how a network transforms each token representation after attention has added information from context.', 'A contextual token representation will pass through a feed-forward block to show the next transformation.'),
      scene('layers', 'Transformer Layers', 'Follow how repeated attention and processing steps refine token representations through a transformer.', 'Stacked layer blocks will trace repeated attention and feed-forward processing through a transformer.')
    ] },
    { id: 'generate', title: 'Generate', question: 'How does an LLM produce text?', scenes: [
      scene('inside-llm', 'Inside an LLM', 'Connect tokenization, transformer layers, and prediction to see how text moves through a language model.', 'An overview will connect input tokens, transformer layers, and the next-token prediction stage.'),
      scene('next-token', 'Predicting the Next Token', 'Compare possible next tokens and the probabilities a model assigns based on the available context.', 'Candidate next tokens will appear alongside their predicted probabilities for a shared context.'),
      scene('sampling', 'Temperature and Sampling', 'Explore how temperature and sampling affect which token is chosen and why responses can vary.', 'Contrasting probability distributions and sampling outcomes will show how temperature can affect variation.'),
      scene('response', 'Generating a Response', 'Follow a response as it grows, with each new token becoming part of the context for the next prediction.', 'A response will be traced through repeated prediction steps, with each selected token added to the context.'),
      scene('correctness', "Fluent Doesn't Mean Correct", 'Examine why convincing language can contain mistakes and why factual claims still need to be checked.', 'A fluent response will be paired with evidence checks to distinguish plausible language from factual correctness.')
    ] }
  ];
  const scenes = chapters.flatMap((chapter, chapterIndex) => chapter.scenes.map((item, sceneIndex) => ({ ...item, chapterIndex, sceneIndex })));
  // Navigation is independent of the scene renderer so future visuals can replace this placeholder.
  function nextIndex(index, direction) {
    return direction > 0 && index === scenes.length - 1 ? 0 : Math.max(0, Math.min(scenes.length - 1, index + direction));
  }
  function chapterStart(chapterIndex) { return scenes.findIndex(item => item.chapterIndex === chapterIndex); }
  // URL numbers are one-based; scene numbers are local to their chapter.
  function sceneFromSearch(search) {
    const params = new URLSearchParams(search);
    const chapterNumber = Number(params.get('chapter') || 1);
    const chapterIndex = Number.isInteger(chapterNumber) && chapterNumber >= 1 && chapterNumber <= chapters.length ? chapterNumber - 1 : 0;
    const sceneNumber = Number(params.get('scene') || 1);
    const sceneIndex = Number.isInteger(sceneNumber) && sceneNumber >= 1 && sceneNumber <= chapters[chapterIndex].scenes.length ? sceneNumber - 1 : 0;
    return chapterStart(chapterIndex) + sceneIndex;
  }
  function isEditable(target) { return target.isContentEditable || Boolean(target.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"])')); }
  const corpus = 'New Haven pizza is legendary. People travel from all over the country to taste its perfect blend of char, chew, and flavor. The brick ovens at Pepe’s, Sally’s, and Modern have been crafting pies for generations. Locals debate which spot is best, but everyone agrees that New Haven sets the gold standard. The crust is thin yet strong enough to hold its toppings, the sauce is tangy, and the mozzarella melts into pure bliss. For anyone who truly loves pizza, a trip to New Haven is not just a meal—it’s a pilgrimage. New Haven pizza brings people together.';
  function wordSpans(text) {
    return Array.from(text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu), match => ({
      text: match[0], normalized: match[0].toLowerCase().replace(/’/g, "'"), start: match.index, end: match.index + match[0].length
    }));
  }
  function findPattern(text, pattern, size) {
    const source = wordSpans(text), target = wordSpans(pattern);
    if (![1, 2, 3].includes(size) || target.length !== size) return [];
    return source.flatMap((word, index) => target.every((part, offset) => source[index + offset]?.normalized === part.normalized)
      ? [{ index, start: word.start, end: source[index + size - 1].end }] : []);
  }
  function countingChallenge(text, size) {
    const words = wordSpans(text), frequencies = new Map();
    for (let index = 0; index <= words.length - size; index++) {
      const pattern = words.slice(index, index + size).map(word => word.normalized).join(' ');
      frequencies.set(pattern, (frequencies.get(pattern) || 0) + 1);
    }
    const counts = [...frequencies.values()], maximum = Math.max(0, ...counts);
    const name = ['unigram', 'bigram', 'trigram'][size - 1];
    if (!maximum) return { prompt: `There are no ${name}s in this text. Try a smaller group size.`, hint: 'A group needs enough consecutive words to fill it.' };
    if (maximum === 1) return {
      prompt: `Do any ${name}s repeat? None do in this passage—patterns that occur only once are a discovery too.`,
      hint: `Select ${Math.min(2, frequencies.size)} different ${name}${frequencies.size > 1 ? 's' : ''} to compare their counts and complete the challenge. Every one occurs once.`
    };
    if (size === 1) return {
      prompt: `Can you find a word that appears ${maximum} times?`,
      hint: 'Select individual words and compare their counts. Look for short words used throughout the passage.'
    };
    if (size === 2) return {
      prompt: counts.includes(1) ? 'Find a bigram that repeats and compare it with one that occurs only once.' : 'Which bigram appears most often? Compare the groups you find.',
      hint: `At least one bigram appears ${maximum} times. Look for the same two words together in different parts of the passage.`
    };
    return { prompt: 'Does any trigram repeat? Find a three-word group that appears more than once.', hint: `At least one trigram appears ${maximum} times. Compare complete three-word groups.` };
  }
  function challengeProgress(text, size, selections) {
    const words = wordSpans(text), frequencies = new Map();
    for (let i = 0; i <= words.length - size; i++) {
      const pattern = words.slice(i, i + size).map(word => word.normalized).join(' ');
      frequencies.set(pattern, (frequencies.get(pattern) || 0) + 1);
    }
    const maximum = Math.max(0, ...frequencies.values());
    const selected = new Set(Array.from(selections, pattern => wordSpans(pattern).map(word => word.normalized).join(' ')));
    const counts = [...selected].filter(pattern => frequencies.has(pattern)).map(pattern => frequencies.get(pattern));
    if (maximum === 1) return {
      complete: counts.length >= Math.min(2, frequencies.size),
      feedback: 'You’ve compared unique patterns. None repeat in this text—an important discovery about longer word groups.'
    };
    if (size === 2 && [...frequencies.values()].includes(1)) return {
      complete: counts.some(count => count > 1) && counts.includes(1),
      feedback: "You've found a repeating word pattern and one that occurs only once."
    };
    return {
      complete: maximum > 0 && (size === 3 ? counts.some(count => count > 1) : counts.includes(maximum)),
      feedback: size === 3 ? 'You’ve found a three-word pattern that repeats.' : `You’ve found a ${size === 1 ? 'word' : 'pattern'} with the highest count in this text: ${maximum}.`
    };
  }
  function corpusFrequencies(text, size) {
    if (![1, 2, 3, 4, 5].includes(size)) return [];
    const words = wordSpans(text), counts = new Map();
    for (let i = 0; i <= words.length - size; i++) {
      const pattern = words.slice(i, i + size).map(word => word.normalized).join(' ');
      if (!counts.has(pattern)) counts.set(pattern, { pattern, count: 0, first: i });
      counts.get(pattern).count++;
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.first - b.first);
  }
  function continuationCounts(text, context) {
    const words = wordSpans(text), target = wordSpans(context), counts = new Map();
    let terminal = 0;
    if (![1, 2].includes(target.length)) return { candidates: [], total: 0, terminal };
    for (let i = 0; i <= words.length - target.length; i++) {
      if (!target.every((word, offset) => word.normalized === words[i + offset].normalized)) continue;
      const next = words[i + target.length];
      if (!next) { terminal++; continue; }
      if (!counts.has(next.normalized)) counts.set(next.normalized, { word: next.text, count: 0 });
      counts.get(next.normalized).count++;
    }
    const total = [...counts.values()].reduce((sum, entry) => sum + entry.count, 0);
    return { total, terminal, candidates: [...counts.values()].map(entry => ({ ...entry, probability: entry.count / total })) };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { chapters, scenes, nextIndex, chapterStart, isEditable, corpus, wordSpans, findPattern, countingChallenge, challengeProgress, corpusFrequencies, continuationCounts };
  if (typeof document === 'undefined') return;
  const $ = selector => document.querySelector(selector);
  let countSize = 2, countPattern = 'New Haven', revealed = false;
  const explored = new Map(), passageWords = wordSpans(corpus);
  const challengeSelections = new Set();
  function drawCorpusComparison() {
    if (!$('#countCorpusComparison').open) return;
    const frequencies = corpusFrequencies(corpus, countSize);
    const name = ['Unigrams', 'Bigrams', 'Trigrams'][countSize - 1];
    const repeated = frequencies.filter(entry => entry.count > 1).length;
    $('#countCorpusTitleText').textContent = `Complete corpus · ${name}`;
    $('#countCorpusIcon').innerHTML = Array.from({ length: countSize }, (_, index) => `<rect x="${(36 - countSize * 10 - (countSize - 1) * 2) / 2 + index * 12}" y="3" width="10" height="10" rx="2"/>`).join('');
    $('#countCorpusSummary').textContent = `${frequencies.length} unique patterns; ${repeated} ${repeated === 1 ? 'appears' : 'appear'} more than once. ${repeated === 0 ? 'Every pattern occurs once—a discovery about how longer groups become unique. ' : ''}Showing the top ${Math.min(10, frequencies.length)}. Ties follow first appearance in the passage.`;
    $('#countFullSummary').textContent = `Inspect all ${frequencies.length} patterns`;
    const chart = $('#countCorpusBars'), list = $('#countFullList');
    chart.replaceChildren(); list.replaceChildren();
    frequencies.forEach((entry, index) => {
      if (index < 10) {
        const row = document.createElement('li'), label = document.createElement('span'), track = document.createElement('span'), bar = document.createElement('span'), value = document.createElement('strong');
        row.className = 'count-row'; label.textContent = entry.pattern; value.textContent = entry.count;
        track.className = 'count-track'; track.setAttribute('aria-hidden', 'true');
        bar.className = 'count-bar'; bar.style.width = `${entry.count / frequencies[0].count * 100}%`;
        track.append(bar); row.append(label, track, value); chart.append(row);
      }
      const row = document.createElement('tr'), label = document.createElement('td'), value = document.createElement('td');
      label.textContent = entry.pattern; value.textContent = entry.count;
      row.append(label, value); list.append(row);
    });
  }
  $('#countCorpusComparison').addEventListener('toggle', drawCorpusComparison);
  let showAll = false, refreshCountHighlights = () => {};
  const patternKey = pattern => wordSpans(pattern).map(word => word.normalized).join(' ');
  function patternColor(index) {
    const hue = (index * 137.508 + 145) % 360;
    return { ink: `hsl(${hue} 55% 32%)`, fill: `hsl(${hue} 60% 89%)` };
  }
  $('#countShowAll').addEventListener('change', event => { showAll = event.target.checked; refreshCountHighlights(); });
  function choosePattern(pattern) {
    countPattern = pattern; revealed = true;
    const key = wordSpans(pattern).map(word => word.normalized).join(' ');
    explored.set(key, { pattern, count: findPattern(corpus, pattern, countSize).length, color: explored.get(key)?.color || patternColor(explored.size) });
    challengeSelections.add(key);
    drawCounting();
  }
  function drawCounting() {
    const challenge = countingChallenge(corpus, countSize);
    const progress = challengeProgress(corpus, countSize, challengeSelections);
    $('#countChallengeLabel').textContent = progress.complete ? 'Challenge complete!' : 'Try it:';
    $('#countChallengeText').textContent = progress.complete ? progress.feedback : challenge.prompt;
    $('.count-challenge').classList.toggle('challenge-complete', progress.complete);
    $('#countChallengeIcon').innerHTML = progress.complete ? '<circle cx="12" cy="12" r="9.5"/><path d="m7.5 12 3 3 6-6"/>' : '<path d="M9 18h6M10 21h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/>';
    $('#countHintText').textContent = challenge.hint;
    const matches = revealed ? findPattern(corpus, countPattern, countSize) : [];
    $('#countResult').textContent = revealed ? `Found ${matches.length} ${matches.length === 1 ? 'occurrence' : 'occurrences'} of “${countPattern}”` : '';
    for (let size = 1; size <= 3; size++) $('#countSize' + size).setAttribute('aria-pressed', size === countSize);
    const passage = $('#countPassage');
    passage.replaceChildren();
    const wordButtons = [];
    let hoverStart = null, focusStart = null, hoveredPattern = null, focusedPattern = null;
    function showGroup() {
      passage.querySelectorAll('.count-group-border').forEach(border => border.remove());
      const preview = hoveredPattern ?? focusedPattern;
      const start = hoverStart ?? focusStart;
      const pattern = preview ?? (start !== null && start + countSize <= wordButtons.length ? passageWords.slice(start, start + countSize).map(word => word.text).join(' ') : null);
      const layers = showAll ? new Map(explored) : new Map();
      if (pattern !== null) layers.set(patternKey(pattern), explored.get(patternKey(pattern)) || { pattern, color: patternColor(0) });
      const colors = wordButtons.map(() => []);
      layers.forEach(entry => {
        const size = wordSpans(entry.pattern).length;
        findPattern(corpus, entry.pattern, size).forEach(match => {
          for (let i = match.index; i < match.index + size; i++) colors[i].push(entry.color.fill);
        });
      });
      wordButtons.forEach((button, index) => {
        const fills = colors[index];
        button.style.background = fills.length ? `linear-gradient(to bottom, ${fills.map((fill, i) => `${fill} ${i / fills.length * 100}% ${(i + 1) / fills.length * 100}%`).join(', ')})` : '';
      });
      if (!layers.size) return;
      const bounds = passage.getBoundingClientRect();
      layers.forEach(entry => {
      const previewSize = wordSpans(entry.pattern).length;
      findPattern(corpus, entry.pattern, previewSize).forEach(match => {
      const lines = [];
      wordButtons.slice(match.index, match.index + previewSize).forEach(button => {
        const rect = button.getBoundingClientRect();
        const line = lines.find(item => Math.abs(item.top - rect.top) < 2);
        if (line) { line.right = Math.max(line.right, rect.right); line.bottom = Math.max(line.bottom, rect.bottom); }
        else lines.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
      });
      lines.forEach(line => {
        const border = document.createElement('span');
        border.className = 'count-group-border'; border.style.borderColor = entry.color.ink; border.style.background = 'transparent'; border.setAttribute('aria-hidden', 'true');
        Object.assign(border.style, { left: `${line.left - bounds.left - passage.clientLeft - 3}px`, top: `${line.top - bounds.top - passage.clientTop}px`, width: `${line.right - line.left + 6}px`, height: `${line.bottom - line.top}px` });
        passage.append(border);
      });
      });
      });
    }
    refreshCountHighlights = showGroup;
    passage.onpointerleave = () => { hoverStart = null; showGroup(); };
    let cursor = 0;
    passageWords.forEach((word, index) => {
      passage.append(document.createTextNode(corpus.slice(cursor, word.start)));
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'count-word'; button.textContent = word.text;
      button.disabled = index + countSize > passageWords.length;
      const phrase = passageWords.slice(index, index + countSize).map(part => part.text).join(' ');
      button.setAttribute('aria-label', `Select ${phrase}`);
      wordButtons.push(button);
      button.addEventListener('pointerenter', () => { hoverStart = index; showGroup(); });
      button.addEventListener('focus', () => { focusStart = index; showGroup(); });
      button.addEventListener('blur', () => { focusStart = null; showGroup(); });
      button.addEventListener('click', (event = {}) => {
        choosePattern(phrase);
        if (event.detail === 0) $('#countPassage').querySelectorAll('.count-word')[index].focus({ preventScroll: true });
      });
      passage.append(button); cursor = word.end;
    });
    passage.append(document.createTextNode(corpus.slice(cursor)));
    $('#countComparison').hidden = false;
    $('#countEmpty').hidden = explored.size > 0;
    $('#countDiscovery').hidden = !progress.complete;
    const bars = $('#countBars'); bars.replaceChildren();
    const maximum = Math.max(1, ...Array.from(explored.values(), entry => entry.count));
    [...explored.values()].sort((a, b) => b.count - a.count).forEach(entry => {
      const row = document.createElement('li'), label = document.createElement('span'), track = document.createElement('span'), bar = document.createElement('span'), value = document.createElement('strong');
      row.className = 'count-row'; label.textContent = entry.pattern; value.textContent = entry.count;
      const size = wordSpans(entry.pattern).length;
      const badge = document.createElement('span');
      badge.className = 'count-gram-badge';
      badge.style.color = entry.color.ink; badge.style.background = entry.color.fill; badge.style.borderColor = entry.color.ink;
      const gramName = ['Unigram', 'Bigram', 'Trigram'][size - 1];
      badge.setAttribute('role', 'img');
      badge.setAttribute('aria-label', `${gramName}: ${size} ${size === 1 ? 'word' : 'words'}`);
      badge.setAttribute('data-tooltip', gramName);
      // Only fixed SVG markup and the calculated size enter this badge.
      badge.innerHTML = `<svg viewBox="0 0 36 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false">${Array.from({ length: size }, (_, index) => `<rect x="${(36 - size * 10 - (size - 1) * 2) / 2 + index * 12}" y="3" width="10" height="10" rx="2"/>`).join('')}</svg>`;
      label.className = 'count-pattern-label';
      label.prepend(badge);
      row.tabIndex = 0;
      row.addEventListener('pointerenter', () => { hoveredPattern = entry.pattern; showGroup(); });
      row.addEventListener('pointerleave', () => { hoveredPattern = null; showGroup(); });
      row.addEventListener('focus', () => { focusedPattern = entry.pattern; showGroup(); });
      row.addEventListener('blur', () => { focusedPattern = null; showGroup(); });
      track.className = 'count-track'; bar.className = 'count-bar'; bar.style.width = `${entry.count / maximum * 100}%`;
      track.setAttribute('aria-hidden', 'true'); track.append(bar); row.append(label, track, value); bars.append(row);
    });
    $('#countShowAll').checked = showAll;
    showGroup();
    drawCorpusComparison();
  }
  for (let size = 1; size <= 3; size++) $('#countSize' + size).addEventListener('click', () => {
    if (countSize !== size) {
      challengeSelections.clear(); explored.clear(); showAll = false;
    }
    countSize = size; revealed = false; drawCounting();
  });
  $('#countReset').addEventListener('click', () => {
    $('#countCorpusComparison').open = false; $('#countFullDetails').open = false;
    challengeSelections.clear(); showAll = false;
    explored.clear(); countSize = 2; revealed = false; drawCounting();
  });
  let activeScene = typeof window === 'undefined' ? 0 : sceneFromSearch(window.location.search);
  const words = ['New', 'Haven', 'pizza', 'is', 'legendary'];
  let gramSize = 2, gramStart = 0;
  let selectedOverlap = null;
  function drawOverlapLinks() {
    const list = $('#ngramGroups'), svg = $('#ngramLinks');
    svg.innerHTML = '';
    if (gramSize === 1 || !list.querySelectorAll) return;
    const groups = Array.from(list.children);
    const paths = [];
    // Arcs connect shared phrases, alternating above and below.
    function sharedBounds(group, from, to, above) {
      const spans = group.querySelectorAll('span');
      return {
        left: group.offsetLeft + spans[from].offsetLeft,
        right: group.offsetLeft + spans[to].offsetLeft + spans[to].offsetWidth,
        y: group.offsetTop + spans[from].offsetTop + (above ? -2 : spans[from].offsetHeight + 2)
      };
    }
    for (let index = 0; index < groups.length - 1; index++) {
      const above = index % 2 === 0, direction = above ? -1 : 1;
      const a = sharedBounds(groups[index], 1, gramSize - 1, above);
      const b = sharedBounds(groups[index + 1], 0, gramSize - 2, above);
      const ax = (a.left + a.right) / 2, bx = (b.left + b.right) / 2;
      const bend = a.y + direction * 16;
      const d = `M${ax},${a.y}C${ax},${bend} ${bx},${bend} ${bx},${b.y}`;
      const shared = words.slice(index + 1, index + gramSize).join(' ');
      paths.push(`<g class="ngram-connector" tabindex="0" role="button" aria-pressed="false" aria-label="Highlight ${shared}, shared by groups ${index + 1} and ${index + 2}"><path class="ngram-link-hit" d="${d}"/><path class="ngram-link-line" d="${d}"/></g>`);
    }
    svg.innerHTML = `<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">${paths.join('')}</g>`;
    const connectors = Array.from(svg.querySelectorAll('.ngram-connector'));
    function highlight(index) {
      groups.forEach((group, groupIndex) => {
        group.querySelector('.ngram-overlap-phrase')?.remove();
        const spans = Array.from(group.querySelectorAll('span'));
        spans.forEach((span, wordIndex) => {
          span.classList.toggle('overlap-highlight', index !== null && (
            (groupIndex === index && wordIndex > 0) ||
            (groupIndex === index + 1 && wordIndex < gramSize - 1)
          ));
        });
        const sharedSpans = spans.filter(span => span.classList.contains('overlap-highlight'));
        if (sharedSpans.length) {
          const first = sharedSpans[0], last = sharedSpans[sharedSpans.length - 1];
          const highlightBox = document.createElement('div');
          highlightBox.className = 'ngram-overlap-phrase';
          highlightBox.setAttribute('aria-hidden', 'true');
          Object.assign(highlightBox.style, {
            left: `${first.offsetLeft - 3}px`, top: `${first.offsetTop - 2}px`,
            width: `${last.offsetLeft + last.offsetWidth - first.offsetLeft + 6}px`,
            height: `${first.offsetHeight + 4}px`
          });
          group.appendChild(highlightBox);
        }
      });
      connectors.forEach((connector, connectorIndex) => {
        connector.classList.toggle('active', connectorIndex === index);
        connector.setAttribute('aria-pressed', connectorIndex === selectedOverlap);
      });
    }
    connectors.forEach((connector, index) => {
      connector.addEventListener('pointerenter', () => highlight(index));
      connector.addEventListener('pointerleave', () => highlight(selectedOverlap));
      connector.addEventListener('focus', () => highlight(index));
      connector.addEventListener('blur', () => highlight(selectedOverlap));
      const select = () => { selectedOverlap = selectedOverlap === index ? null : index; highlight(selectedOverlap); };
      connector.addEventListener('click', select);
      connector.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
        if (event.key === 'Escape') { selectedOverlap = null; highlight(null); }
      });
    });
    highlight(selectedOverlap);
  }
  function updateNgram() {
    selectedOverlap = null;
    const total = words.length - gramSize + 1;
    const complete = gramStart === total - 1;
    const name = ['unigrams', 'bigrams', 'trigrams'][gramSize - 1];
    $('#ngramPrediction').textContent = `How many ${name} can you make from five words?`;
    $('#ngramCompletion').hidden = !complete;
    $('#ngramDiscovery').textContent = complete ? `You've discovered all ${total} ${name}!` : '';
    $('#ngramObservation').textContent = complete ? [
      'Each unigram contains one word.',
      'Notice how neighboring groups overlap by one word.',
      'Notice how neighboring groups share two words.'
    ][gramSize - 1] : '';
    for (let size = 1; size <= 3; size++) $('#ngramSize' + size).setAttribute('aria-pressed', size === gramSize);
    words.forEach((word, index) => $('#ngramWord' + index).classList.toggle('selected', index >= gramStart && index < gramStart + gramSize));
    $('.ngram-window').style.left = `${gramStart * 20}%`;
    $('.ngram-window').style.width = `${gramSize * 20}%`;
    $('#ngramGroups').innerHTML = Array.from({ length: gramStart + 1 }, (_, index) => `<li${index === gramStart ? ' aria-current="true"' : ''}>${words.slice(index, index + gramSize).map(word => `<span>${word}</span>`).join(' ')}</li>`).join('');
    drawOverlapLinks();
    $('#ngramStatus').textContent = `${gramStart + 1} ${gramStart === 0 ? 'group' : 'groups'} collected: ${words.slice(gramStart, gramStart + gramSize).join(' ')}`;
    $('#ngramAdvance').disabled = gramStart === total - 1;
    $('#ngramAdvance').textContent = gramStart === total - 1 ? 'All groups collected' : 'Slide one word →';
    const scroller = $('.ngram-scroll');
    if (scroller.scrollTo) scroller.scrollTo({ left: Math.max(0, (gramStart + gramSize / 2) * scroller.scrollWidth / 5 - scroller.clientWidth / 2), behavior: 'auto' });
  }
  for (let size = 1; size <= 3; size++) $('#ngramSize' + size).addEventListener('click', () => { gramSize = size; gramStart = 0; updateNgram(); });
  $('#ngramAdvance').addEventListener('click', () => { if (gramStart < words.length - gramSize) { gramStart++; updateNgram(); } });
  $('#ngramReset').addEventListener('click', () => { gramStart = 0; updateNgram(); });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(drawOverlapLinks).observe($('.ngram-group-track'));
  const buttons = chapters.map((chapter, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'chapter'; button.dataset.number = index + 1;
    button.textContent = chapter.title; button.setAttribute('aria-controls', 'scenePanel');
    button.addEventListener('click', () => { activeScene = chapterStart(index); render(); });
    $('.chapter-bar').appendChild(button);
    return button;
  });
  function renderPlaceholder(item, chapter) {
    const isNgram = item.id === 'n-grams';
    const isCounting = item.id === 'counting';
    const isProbability = item.id === 'conditional-probability';
    const isGeneration = item.id === 'generating-language';
    const isLimits = item.id === 'n-gram-limits';
    const isRNN = item.id === 'rnn-approach';
    $('#rnnDemo').hidden = !isRNN;
    if (isRNN && window.openRNNScene) window.openRNNScene();
    if (!isRNN && window.cancelRNNPlayback) window.cancelRNNPlayback();
    const isMeaning = item.id === 'context-matters';
    $('#meaningDemo').hidden = !isMeaning;
    if (isMeaning && window.drawMeaningConnections) requestAnimationFrame(window.drawMeaningConnections);
    const isContext = item.id === 'context-windows';
    $('#contextDemo').hidden = !isContext;
    const isTokenizer = item.id === 'tokenizer';
    $('#tokenizerDemo').hidden = !isTokenizer;
    const isSubwords = item.id === 'subwords';
    $('#subwordsDemo').hidden = !isSubwords;
    const isTokens = item.id === 'words-tokens';
    $('#tokensDemo').hidden = !isTokens;
    if (isTokens && window.openTokenScene) window.openTokenScene();
    $('#limitsDemo').hidden = !isLimits;
    if (!isLimits && window.cancelLimitsGeneration) window.cancelLimitsGeneration();
    $('.gen-demo').hidden = !isGeneration;
    if (!isGeneration && window.cancelGeneration) window.cancelGeneration();
    if (!isProbability && window.cancelProbabilityReveal) window.cancelProbabilityReveal();
    $('.prob-demo').hidden = !isProbability;
    if (isProbability && window.drawProbability) window.drawProbability();
    $('.placeholder').hidden = isNgram || isCounting || isProbability || isGeneration || isLimits || isTokens || isSubwords || isTokenizer || isContext || isMeaning || isRNN;
    $('#chapterQuestion').hidden = isNgram || isCounting || isProbability || isGeneration || isLimits || isTokens || isSubwords || isTokenizer || isContext || isMeaning || isRNN;
    $('.count-demo').hidden = !isCounting;
    if (isCounting) drawCounting();
    $('.ngram-demo').hidden = !isNgram;
    $('#nextBtn').classList.toggle('scene-one-next', isNgram);
    if (isNgram) { gramSize = 2; gramStart = 0; updateNgram(); }
    $('#chapterQuestion').textContent = chapter.question;
    $('#placeholderCopy').textContent = item.placeholder;
    $('#sceneContent').dataset.sceneId = item.id;
  }
  function render() {
    const item = scenes[activeScene], chapter = chapters[item.chapterIndex];
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('chapter', item.chapterIndex + 1);
      url.searchParams.set('scene', item.sceneIndex + 1);
      window.history.replaceState(window.history.state, '', url.href);
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'llm-explorer-navigation', chapter: item.chapterIndex + 1, scene: item.sceneIndex + 1 }, window.location.origin);
      }
    }
    $('#sceneKicker').textContent = `Chapter ${item.chapterIndex + 1} · ${chapter.title} / Scene ${item.sceneIndex + 1}`;
    $('#sceneTitle').textContent = item.title;
    $('#sceneCopy').textContent = item.description;
    $('#sceneCount').textContent = `${chapter.title} · Scene ${item.sceneIndex + 1} of ${chapter.scenes.length}`;
    renderPlaceholder(item, chapter);
    buttons.forEach((button, index) => {
      button.classList.toggle('active', index === item.chapterIndex);
      if (index === item.chapterIndex) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    $('#prevBtn').disabled = activeScene === 0;
    $('#nextBtn').textContent = activeScene === scenes.length - 1 ? 'Start over' : 'Next →';
    $('.progress').setAttribute('aria-valuenow', activeScene + 1);
    $('.progress').setAttribute('aria-valuetext', `Scene ${activeScene + 1} of ${scenes.length}: ${item.title}`);
    $('#progressFill').style.width = `${(activeScene + 1) / scenes.length * 100}%`;
    $('#liveStatus').textContent = `${chapter.title}. Scene ${activeScene + 1} of ${scenes.length}: ${item.title}`;
  }
  function move(direction) { activeScene = nextIndex(activeScene, direction); render(); }
  $('#prevBtn').addEventListener('click', () => move(-1));
  $('#nextBtn').addEventListener('click', () => move(1));
  $('#restartBtn').addEventListener('click', () => { activeScene = 0; render(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hideTooltip();
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isEditable(event.target) || event.target.closest('.ngram-demo, .count-demo, .prob-demo, .gen-demo, .tokens-demo')) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1); }
  });
  window.llmProbability = { corpus, wordSpans, findPattern, corpusFrequencies, continuationCounts };
  // One viewport-positioned tooltip avoids clipping inside scene cards.
  const tooltip = document.createElement('div');
  tooltip.className = 'llm-tooltip'; tooltip.id = 'llmTooltip';
  tooltip.setAttribute('role', 'tooltip'); tooltip.hidden = true;

  let tooltipTarget = null;
  function hideTooltip() {
    if (tooltipTarget) tooltipTarget.removeAttribute('aria-describedby');
    tooltipTarget = null; tooltip.hidden = true; tooltip.remove();
  }
  function showTooltip(event) {
    const target = event.target.closest?.('[data-tooltip]');
    if (!target) return;
    hideTooltip(); tooltipTarget = target; document.body.append(tooltip);
    tooltip.textContent = target.getAttribute('data-tooltip'); tooltip.hidden = false;
    target.setAttribute('aria-describedby', 'llmTooltip');
    const rect = target.getBoundingClientRect(), tip = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(rect.left + (rect.width - tip.width) / 2, window.innerWidth - tip.width - 8))}px`;
    tooltip.style.top = `${rect.top >= tip.height + 16 ? rect.top - tip.height - 8 : rect.bottom + 8}px`;
  }
  document.addEventListener('pointerover', showTooltip);
  document.addEventListener('focusin', showTooltip);
  document.addEventListener('pointerout', event => {
    if (tooltipTarget && !tooltipTarget.contains(event.relatedTarget) && !tooltip.contains(event.relatedTarget)) hideTooltip();
  });
  document.addEventListener('focusout', hideTooltip);
  document.addEventListener('click', hideTooltip);
  window.addEventListener?.('scroll', hideTooltip, true);
  window.addEventListener?.('resize', hideTooltip);
  render();
})();
