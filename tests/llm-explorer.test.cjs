const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { chapters, scenes, chapterStart } = require('../assets/js/ai100/llm-explorer.js');
const { corpus, wordSpans, findPattern } = require('../assets/js/ai100/llm-explorer.js');
test('counts exact overlapping sequences with punctuation and apostrophe normalization', () => {
  for (const [pattern, size, count] of [['New Haven', 2, 4], ['pizza', 1, 3], ['the', 1, 6], ['New Haven pizza', 3, 2], ['and the', 2, 1], ['pizza pizza', 2, 0], ['legendary People', 2, 1], ["Pepe's Sally's", 2, 1], ['meal it’s a', 3, 1], ['piz', 1, 0]]) {
    const matches = findPattern(corpus, pattern, size);
    assert.equal(matches.length, count, pattern);
    for (const match of matches) assert.deepEqual(wordSpans(corpus.slice(match.start, match.end)).map(w => w.normalized), wordSpans(pattern).map(w => w.normalized));
  }
  assert.equal(findPattern('a a a', 'a a', 2).length, 2);
  assert.equal(findPattern(corpus, 'New Haven', 1).length, 0);
  assert.equal(findPattern(corpus, '', 2).length, 0);
  for (const size of [1, 2, 3]) {
    const words = wordSpans(corpus).map(w => w.normalized);
    const reference = new Map();
    for (let i = 0; i <= words.length - size; i++) {
      const key = words.slice(i, i + size).join(' ');
      reference.set(key, (reference.get(key) || 0) + 1);
    }
    for (const [pattern, count] of reference) assert.equal(findPattern(corpus, pattern.toUpperCase(), size).length, count);
  }
});
function fixture(href = 'https://example.test/ai100/llm_explorer.html', animationDriver) {
  const elements = new Map(), events = {};
  function element() {
    return { animate: animationDriver, textContent: '', dataset: {}, style: {}, attributes: {}, children: [], disabled: false,
      classList: { values: new Set(), toggle() {}, add(value) { this.values.add(value); } }, handlers: {},
      setAttribute(key, value) { this.attributes[key] = String(value); },
      removeAttribute(key) { delete this.attributes[key]; },
      addEventListener(key, fn) { this.handlers[key] = fn; },
      appendChild(child) { this.children.push(child); },
      append(...children) { children.forEach(child => { child.parent = this; }); this.children.push(...children); },
      remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); },
      clientLeft: 0, clientTop: 0, getBoundingClientRect() { return { left: 0, right: 30, top: 0, bottom: 20 }; },
      prepend(...children) { this.children.unshift(...children); },
      replaceChildren(...children) { this.children = children; }, focus() {},
      querySelectorAll(selector) { return this.children.filter(child => '.' + child.className === selector); }
    };
  }
  const html = fs.readFileSync('ai100/llm_explorer.html', 'utf8');
  const query = selector => {
    if (/^#[\w-]+$/.test(selector)) assert.ok(html.includes(`id="${selector.slice(1)}"`), `Missing HTML element: ${selector}`);
    if (!elements.has(selector)) elements.set(selector, element());
    return elements.get(selector);
  };
  const document = { body: element(), querySelector: query, createElement: element, getElementById: id => query('#' + id), createTextNode: text => ({ textContent: text }), addEventListener: (key, fn) => { events[key] = fn; } };
  const window = { location: new URL(href), history: { state: null, replaceState(state, title, url) { window.location = new URL(url); } } };
  vm.runInNewContext(fs.readFileSync('assets/js/ai100/llm-explorer.js', 'utf8'), { document, window, URL, URLSearchParams });
  vm.runInNewContext(fs.readFileSync('assets/js/ai100/llm-probability.js', 'utf8'), { document, window });
  const generationJobs = new Map(); let jobId = 0;
  vm.runInNewContext(fs.readFileSync('assets/js/ai100/llm-generation.js', 'utf8'), { document, window,
    setTimeout(fn) { generationJobs.set(++jobId, fn); return jobId; }, clearTimeout(id) { generationJobs.delete(id); } });
  return { query, body: document.body, url: () => window.location.href, click: selector => query(selector).handlers.click(), chapter: index => query('.chapter-bar').children[index].handlers.click(),
    generationJobs,
    key: (key, target = { closest: () => null }, extra = {}) => { let prevented = false; events.keydown({ key, target, preventDefault() { prevented = true; }, ...extra }); return prevented; } };
}
test('Scene 4 navigation cancels generation and preserves manual pacing on return', () => {
  const f = fixture('https://example.test/ai100/llm_explorer.html?chapter=1&scene=4');
  assert.equal(f.query('.gen-demo').hidden, false);
  assert.equal(f.query('.placeholder').hidden, true);
  f.click('#genAuto'); assert.equal(f.generationJobs.size, 1);
  const stale = [...f.generationJobs.values()][0];
  f.click('#nextBtn'); assert.equal(f.generationJobs.size, 0); stale();
  assert.equal(f.query('.gen-demo').hidden, true);
  assert.equal(f.query('#genCount').textContent, '0 / 40 added words');
  f.click('#prevBtn'); assert.equal(f.generationJobs.size, 0);
  assert.equal(f.query('.gen-demo').hidden, false);
});
test('all requested chapters and 22 unique scene records are complete', () => {
  assert.deepEqual(chapters.map(c => c.title), ['Predict', 'Tokenize', 'Context', 'Attend', 'Generate']);
  assert.deepEqual(chapters.map(c => c.scenes.length), [5, 4, 3, 5, 5]);
  assert.equal(new Set(scenes.map(s => s.id)).size, 22);
  assert.deepEqual(chapters.map((_, i) => chapterStart(i)), [0, 5, 9, 12, 17]);
  for (const item of scenes) for (const key of ['title', 'description', 'placeholder']) assert.ok(item[key].length > 0);
});
test('all scenes render with correct metadata, chapter selection and progress', () => {
  const f = fixture();
  for (let index = 0; index < scenes.length; index++) {
    const item = scenes[index];
    assert.equal(f.query('#sceneTitle').textContent, item.title);
    assert.equal(f.query('#sceneCopy').textContent, item.description);
    assert.equal(f.query('#placeholderCopy').textContent, item.placeholder);
    assert.equal(f.query('#chapterQuestion').textContent, chapters[item.chapterIndex].question);
    assert.equal(f.query('#sceneCount').textContent, `${chapters[item.chapterIndex].title} · Scene ${item.sceneIndex + 1} of ${chapters[item.chapterIndex].scenes.length}`);
    assert.equal(f.query('.progress').attributes['aria-valuenow'], String(index + 1));
    assert.equal(f.query('#progressFill').style.width, `${(index + 1) / 22 * 100}%`);
    assert.equal(f.query('#prevBtn').disabled, index === 0);
    assert.equal(f.query('.chapter-bar').children.filter(b => b.attributes['aria-current']).length, 1);
    assert.equal(f.query('.chapter-bar').children[item.chapterIndex].attributes['aria-current'], 'step');
    if (index < scenes.length - 1) f.click('#nextBtn');
  }
  assert.equal(f.query('#nextBtn').textContent, 'Start over');
  f.click('#nextBtn');
  assert.equal(f.query('#sceneTitle').textContent, scenes[0].title);
});
test('chapter jumps, reselection, reverse boundaries and restart follow the reference', () => {
  const f = fixture();
  for (let chapter = 0; chapter < 5; chapter++) {
    f.chapter(chapter);
    assert.equal(f.query('#sceneTitle').textContent, scenes[chapterStart(chapter)].title);
    f.click('#nextBtn'); f.chapter(chapter);
    assert.equal(f.query('#sceneTitle').textContent, scenes[chapterStart(chapter)].title);
    f.click('#prevBtn');
    assert.equal(f.query('#sceneTitle').textContent, scenes[Math.max(0, chapterStart(chapter) - 1)].title);
  }
  f.click('#restartBtn');
  assert.equal(f.query('#prevBtn').disabled, true);
  assert.equal(f.query('#sceneCount').textContent, 'Predict · Scene 1 of 5');
  assert.equal(f.query('#nextBtn').textContent, 'Next →');
});
test('arrow keys navigate, clamp at the start, and ignore editable or modified input', () => {
  const f = fixture();
  assert.equal(f.key('ArrowLeft'), true);
  assert.equal(f.query('#sceneCount').textContent, 'Predict · Scene 1 of 5');
  assert.equal(f.key('ArrowRight'), true);
  assert.equal(f.query('#sceneCount').textContent, 'Predict · Scene 2 of 5');
  for (const target of [{ closest: () => ({}) }, { isContentEditable: true }]) assert.equal(f.key('ArrowRight', target), false);
  for (const modifier of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey', 'defaultPrevented']) assert.equal(f.key('ArrowRight', undefined, { [modifier]: true }), false);
  assert.equal(f.key('Enter'), false);
  assert.equal(f.query('#sceneCount').textContent, 'Predict · Scene 2 of 5');
  f.key('ArrowLeft');
  assert.equal(f.query('#sceneCount').textContent, 'Predict · Scene 1 of 5');
});
test('hub enables LLM Explorer and includes it in search', () => {
  const hub = fs.readFileSync('ai100/index.html', 'utf8');
  assert.match(hub, /tool=ai100%2Fllm_explorer/);
  assert.match(hub, /name:'LLM Explorer', file:'llm_explorer\.html/);
  assert.doesNotMatch(hub, /aria-disabled="true"/);
  assert.doesNotMatch(hub, />Coming soon<\/span>/);
  const html = fs.readFileSync('ai100/llm_explorer.html', 'utf8');
  assert.match(html, /aria-valuemax="22"/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]), ['../assets/js/ai100/llm-explorer.js', '../assets/js/ai100/llm-probability.js', '../assets/js/ai100/llm-generation.js', '../assets/js/ai100/llm-limits.js', '../assets/js/ai100/llm-token-engine.js', '../assets/js/ai100/llm-tokens.js', '../assets/js/ai100/llm-subwords.js', '../assets/js/ai100/llm-tokenizer.js', '../assets/js/ai100/llm-context.js', '../assets/js/ai100/llm-meaning.js', '../assets/js/ai100/rnn-training.js', '../assets/js/ai100/llm-rnn.js', '../assets/js/ai100/llm-transformer.js', '../assets/js/ai100/llm-self-attention.js', '../assets/js/ai100/llm-qk-model.js', '../assets/js/ai100/llm-qk.js', '../assets/js/ai100/llm-values-model.js', '../assets/js/ai100/llm-values.js']);
  assert.match(html, /prefers-reduced-motion/);
});

test('n-gram window collects every overlapping group and stops at the boundary', () => {
  const f = fixture();
  assert.equal(f.query('.ngram-demo').hidden, false);
  assert.equal(f.query('.placeholder').hidden, true);
  assert.equal(f.query('.ngram-window').style.width, '40%');
  for (const [index, group] of ['New Haven', 'Haven pizza', 'pizza is', 'is legendary'].entries()) {
    assert.ok(f.query('#ngramStatus').textContent.endsWith(group));
    assert.equal((f.query('#ngramGroups').innerHTML.match(/<li/g) || []).length, index + 1);
    assert.equal(f.query('.ngram-window').style.left, (index * 20) + '%');
    if (index < 3) f.click('#ngramAdvance');
  }
  assert.equal(f.query('#ngramAdvance').disabled, true);
  f.click('#ngramAdvance');
  assert.equal((f.query('#ngramGroups').innerHTML.match(/<li/g) || []).length, 4);
});
test('size changes, reset and scene return restore appropriate initial groups', () => {
  const f = fixture();
  for (const size of [3, 1, 2]) {
    f.click('#ngramSize' + size);
    assert.equal(f.query('.ngram-window').style.left, '0%');
    assert.equal(f.query('.ngram-window').style.width, (size * 20) + '%');
    assert.equal((f.query('#ngramGroups').innerHTML.match(/<li/g) || []).length, 1);
    for (let index = 0; index < 5 - size; index++) f.click('#ngramAdvance');
    assert.equal(f.query('#ngramAdvance').disabled, true);
    assert.equal((f.query('#ngramGroups').innerHTML.match(/<li/g) || []).length, 6 - size);
    f.click('#ngramReset');
    assert.equal(f.query('#ngramAdvance').disabled, false);
    assert.equal(f.query('.ngram-window').style.left, '0%');
    assert.equal((f.query('#ngramGroups').innerHTML.match(/<li/g) || []).length, 1);
  }
  f.click('#nextBtn');
  assert.equal(f.query('.ngram-demo').hidden, true);
  assert.equal(f.query('.placeholder').hidden, true);
  f.click('#prevBtn');
  assert.equal(f.query('#ngramStatus').textContent, '1 group collected: New Haven');
});

test('prediction stays unanswered until completion for each size and resets for another experiment', () => {
  const f = fixture();
  for (const [size, name, observation] of [
    [2, 'bigrams', 'Notice how neighboring groups overlap by one word.'],
    [3, 'trigrams', 'Notice how neighboring groups share two words.'],
    [1, 'unigrams', 'Each unigram contains one word.']
  ]) {
    f.click('#ngramSize' + size);
    assert.equal(f.query('#ngramPrediction').textContent, `How many ${name} can you make from five words?`);
    for (let step = 0; step < 5 - size; step++) {
      assert.equal(f.query('#ngramCompletion').hidden, true);
      assert.equal(f.query('#ngramDiscovery').textContent, '');
      assert.equal(f.query('#ngramObservation').textContent, '');
      assert.doesNotMatch(f.query('#ngramStatus').textContent, /of \d|Complete/);
      f.click('#ngramAdvance');
    }
    assert.equal(f.query('#ngramCompletion').hidden, false);
    assert.equal(f.query('#ngramDiscovery').textContent, `You've discovered all ${6 - size} ${name}!`);
    assert.equal(f.query('#ngramObservation').textContent, observation);
    assert.equal(f.query('#ngramAdvance').disabled, true);
    f.click('#ngramReset');
    assert.equal(f.query('#ngramCompletion').hidden, true);
    assert.equal(f.query('#ngramDiscovery').textContent, '');
    assert.equal(f.query('#ngramObservation').textContent, '');
    assert.equal(f.query('#ngramSize' + size).attributes['aria-pressed'], 'true');
    // Finish again so the next size change must clear a completed experiment.
    for (let step = 0; step < 5 - size; step++) f.click('#ngramAdvance');
  }
  f.click('#nextBtn');
  assert.equal(f.query('#sceneTitle').textContent, 'Counting Word Patterns');
  assert.equal(f.query('.placeholder').hidden, true);
  f.click('#prevBtn');
  assert.equal(f.query('#ngramCompletion').hidden, true);
  assert.equal(f.query('#ngramDiscovery').textContent, '');
  assert.equal(f.query('#ngramPrediction').textContent, 'How many bigrams can you make from five words?');
});

test('passage clicks count immediately, compare patterns and reset cleanly', () => {
  const f = fixture(); f.click('#nextBtn');
  const clickWord = index => f.query('#countPassage').querySelectorAll('.count-word')[index].handlers.click();
  assert.equal(f.query('#countEmpty').hidden, false);
  assert.equal(f.query('#countComparison').hidden, false);
  assert.equal(f.query('#countBars').children.length, 0);
  const hits = () => f.query('#countPassage').children.filter(node => node.classList?.values.has('count-hit')).length;
  assert.equal(f.query('#countResult').textContent, '');
  assert.equal(f.query('#countPassage').children.map(node => node.textContent).join(''), corpus);
  clickWord(0);
  assert.equal(f.query('#countEmpty').hidden, true);
  assert.match(f.query('#countResult').textContent, /Found 4 occurrences/);
  assert.equal(hits(), 0);
  assert.equal(f.query('#countComparison').hidden, false);
  assert.equal(f.query('#countBars').children.length, 1);
  assert.equal(f.query('#countBars').children[0].children[0].textContent, 'New Haven');
  assert.equal(f.query('#countBars').children[0].children[2].textContent, 4);
  clickWord(1);
  assert.match(f.query('#countResult').textContent, /Found 2 occurrences/);
  assert.equal(hits(), 0);
  assert.equal(f.query('#countComparison').hidden, false);
  assert.deepEqual(f.query('#countBars').children.map(row => row.children[2].textContent), [4, 2]);
  clickWord(0);
  assert.equal(f.query('#countBars').children.length, 2);
  for (const [size, index, count, highlighted] of [[1, 2, 3, 3], [3, 0, 2, 6], [2, 0, 4, 8]]) {
    f.click('#countSize' + size);
    assert.equal(f.query('#countResult').textContent, '');
    assert.equal(hits(), 0);
    clickWord(index);
    assert.match(f.query('#countResult').textContent, new RegExp('Found ' + count + ' occurrence'));
    assert.equal(hits(), 0);
  }
  f.click('#countReset');
  assert.equal(f.query('#countEmpty').hidden, false);
  assert.equal(f.query('#countResult').textContent, '');
  assert.equal(hits(), 0);
  assert.equal(f.query('#countComparison').hidden, false);
  assert.equal(f.query('#countBars').children.length, 0);
  assert.equal(f.query('#countDiscovery').hidden, true);
  assert.equal(f.query('#countSize2').attributes['aria-pressed'], 'true');
});

test('URL chapter and scene survive refresh and follow every navigation control', () => {
  const f = fixture('https://example.test/ai100/llm_explorer.html?chapter=1&scene=2&embed=yes#lesson');
  assert.equal(f.query('#sceneTitle').textContent, 'Counting Word Patterns');
  assert.equal(fixture(f.url()).query('#sceneTitle').textContent, 'Counting Word Patterns');
  f.click('#nextBtn');
  assert.equal(new URL(f.url()).searchParams.get('scene'), '3');
  f.click('#prevBtn');
  assert.equal(new URL(f.url()).searchParams.get('scene'), '2');
  f.chapter(2);
  assert.equal(new URL(f.url()).searchParams.get('chapter'), '3');
  assert.equal(new URL(f.url()).searchParams.get('scene'), '1');
  f.key('ArrowLeft');
  assert.equal(new URL(f.url()).searchParams.get('chapter'), '2');
  assert.equal(new URL(f.url()).searchParams.get('scene'), '4');
  f.click('#restartBtn');
  assert.equal(new URL(f.url()).searchParams.get('chapter'), '1');
  assert.equal(new URL(f.url()).searchParams.get('scene'), '1');
  assert.equal(new URL(f.url()).searchParams.get('embed'), 'yes');
  assert.equal(new URL(f.url()).hash, '#lesson');
  for (const [index, item] of scenes.entries()) {
    const direct = fixture(`https://example.test/?chapter=${item.chapterIndex + 1}&scene=${item.sceneIndex + 1}`);
    assert.equal(direct.query('#sceneTitle').textContent, scenes[index].title);
  }
});

test('missing or invalid URL numbers fall back to valid chapter and scene', () => {
  for (const query of ['', '?chapter=0&scene=-1', '?chapter=garbage&scene=NaN', '?chapter=999&scene=999', '?chapter=1.5&scene=2.5']) {
    assert.equal(fixture('https://example.test/' + query).query('#sceneTitle').textContent, scenes[0].title);
  }
  for (const query of ['?chapter=2', '?chapter=2&scene=5']) {
    assert.equal(fixture('https://example.test/' + query).query('#sceneTitle').textContent, chapters[1].scenes[0].title);
  }
  assert.equal(fixture('https://example.test/?scene=2').query('#sceneTitle').textContent, 'Counting Word Patterns');
});

test('discovery challenges adapt to size and measured frequencies, including absent repeats', () => {
  const { countingChallenge } = require('../assets/js/ai100/llm-explorer.js');
  const words = wordSpans(corpus).map(word => word.normalized);
  const maxima = [1, 2, 3].map(size => {
    const counts = {};
    for (let i = 0; i <= words.length - size; i++) {
      const group = words.slice(i, i + size).join(' ');
      counts[group] = (counts[group] || 0) + 1;
    }
    return Math.max(...Object.values(counts));
  });
  assert.deepEqual(maxima, [6, 4, 2]);
  assert.match(countingChallenge(corpus, 1).prompt, /6 times/);
  assert.match(countingChallenge(corpus, 2).hint, /4 times/);
  assert.match(countingChallenge(corpus, 3).prompt, /appears more than once/);
  assert.match(countingChallenge('a b c a b c', 3).hint, /2 times/);
  assert.doesNotMatch(countingChallenge('a b c a b c', 3).prompt, /None do/);
  assert.match(countingChallenge('a a a a', 1).prompt, /4 times/);
  assert.match(countingChallenge('a b c', 2).prompt, /None do/);
  assert.match(countingChallenge('a a a', 2).prompt, /most often/);
  assert.match(countingChallenge('a', 3).prompt, /no trigrams/);
  const f = fixture(); f.click('#nextBtn');
  for (const size of [1, 3, 2]) {
    f.click('#countSize' + size);
    const expected = countingChallenge(corpus, size);
    assert.equal(f.query('#countChallengeText').textContent, expected.prompt);
    assert.equal(f.query('#countHintText').textContent, expected.hint);
  }
  f.click('#countSize3'); f.click('#countReset');
  assert.equal(f.query('#countChallengeText').textContent, countingChallenge(corpus, 2).prompt);
});

test('challenge completion requires active-size evidence and controls discovery', () => {
  const { challengeProgress } = require('../assets/js/ai100/llm-explorer.js');
  assert.equal(challengeProgress(corpus, 2, []).complete, false);
  assert.equal(challengeProgress(corpus, 2, ['Haven pizza', 'pizza is']).complete, true);
  assert.equal(challengeProgress(corpus, 2, ['New Haven', 'NEW HAVEN']).complete, false);
  assert.equal(challengeProgress(corpus, 2, ['New Haven', 'pizza is']).complete, true);
  assert.equal(challengeProgress(corpus, 2, ['the', 'pizza is']).complete, false);
  assert.equal(challengeProgress(corpus, 1, ['pizza']).complete, false);
  assert.equal(challengeProgress(corpus, 1, ['the']).complete, true);
  assert.equal(challengeProgress(corpus, 3, ['New Haven pizza', 'NEW HAVEN PIZZA']).complete, true);
  assert.equal(challengeProgress(corpus, 3, ['New Haven pizza', 'Haven pizza is']).complete, true);
  assert.equal(challengeProgress('a b c a b c', 3, ['a b c']).complete, true);
  const f = fixture(); f.click('#nextBtn');
  const pick = i => f.query('#countPassage').querySelectorAll('.count-word')[i].handlers.click();
  const hidden = () => f.query('#countDiscovery').hidden;
  assert.equal(hidden(), true);
  pick(2); pick(3); assert.equal(hidden(), true);
  pick(0); assert.equal(hidden(), false);
  assert.equal(f.query('#countChallengeLabel').textContent, 'Challenge complete!');
  assert.equal(f.query('#countChallengeText').textContent, "You've found a repeating word pattern and one that occurs only once.");
  f.click('#countSize3'); assert.equal(hidden(), true);
  assert.equal(f.query('#countBars').children.length, 0);
  pick(0); pick(0); assert.equal(hidden(), false);
  pick(1); assert.equal(hidden(), false);
  f.click('#countSize2'); assert.equal(hidden(), true);
  pick(0); assert.equal(hidden(), true);
  pick(2); assert.equal(hidden(), false);
  f.click('#countReset'); assert.equal(hidden(), true);
  assert.equal(f.query('#countChallengeLabel').textContent, 'Try it:');
  assert.equal(f.query('#countBars').children.length, 0);
  f.click('#nextBtn'); assert.equal(f.query('#sceneTitle').textContent, 'Conditional Probability');
});

test('colored comparison previews and Show all clear without changing exploration', () => {
  const f = fixture(); f.click('#nextBtn');
  const words = () => f.query('#countPassage').querySelectorAll('.count-word');
  words()[0].handlers.click(); words()[1].handlers.click();
  const rows = f.query('#countBars').children;
  const badge = row => row.children[0].children[0];
  assert.notEqual(badge(rows[0]).style.color, badge(rows[1]).style.color);
  rows[0].handlers.pointerenter();
  assert.ok(words()[0].style.background.includes(badge(rows[0]).style.background));
  rows[0].handlers.pointerleave(); assert.equal(words()[0].style.background, '');
  f.query('#countShowAll').handlers.change({ target: { checked: true } });
  assert.ok(words()[1].style.background.includes(badge(rows[0]).style.background));
  assert.ok(words()[1].style.background.includes(badge(rows[1]).style.background));
  assert.equal(f.query('#countBars').children.length, 2);
  f.click('#countSize1');
  assert.equal(f.query('#countShowAll').checked, false);
  assert.equal(f.query('#countBars').children.length, 0);
  assert.equal(f.query('#countEmpty').hidden, false);
  f.query('#countShowAll').handlers.change({ target: { checked: false } });
  assert.ok(words().every(word => word.style.background === ''));
  f.query('#countShowAll').handlers.change({ target: { checked: true } });
  f.click('#countReset');
  assert.equal(f.query('#countShowAll').checked, false);
  assert.ok(words().every(word => word.style.background === ''));
  assert.equal(f.query('#countBars').children.length, 0);
});

test('comparison sorts highest counts first and preserves selection order for ties', () => {
  const f = fixture(); f.click('#nextBtn');
  const pick = i => f.query('#countPassage').querySelectorAll('.count-word')[i].handlers.click();
  pick(1); pick(2); pick(0);
  const entries = () => f.query('#countBars').children.map(row => [row.children[0].textContent, row.children[2].textContent]);
  assert.deepEqual(entries(), [['New Haven', 4], ['Haven pizza', 2], ['pizza is', 1]]);
  f.click('#countSize1');
  pick(wordSpans(corpus).findIndex(word => word.normalized === 'the'));
  assert.deepEqual(entries(), [['the', 6]]);
});

test('Expandable corpus comparison ranks the complete corpus without completing manual challenges', () => {
  const { corpusFrequencies } = require('../assets/js/ai100/llm-explorer.js');
  assert.deepEqual(corpusFrequencies('b a b a c', 1).map(e => [e.pattern, e.count]), [['b', 2], ['a', 2], ['c', 1]]);
  for (const size of [1, 2, 3]) {
    const all = corpusFrequencies(corpus, size);
    assert.equal(new Set(all.map(e => e.pattern)).size, all.length);
    assert.equal(all.reduce((sum, e) => sum + e.count, 0), wordSpans(corpus).length - size + 1);
    all.forEach((entry, index) => {
      assert.equal(entry.count, findPattern(corpus, entry.pattern, size).length);
      if (index) assert.ok(all[index - 1].count >= entry.count);
    });
  }
  const f = fixture(); f.click('#nextBtn');
  assert.equal(Boolean(f.query('#countCorpusComparison').open), false);
  f.query('#countCorpusComparison').open = !f.query('#countCorpusComparison').open; f.query('#countCorpusComparison').handlers.toggle();
  assert.equal(f.query('#countCorpusComparison').open, true);
  for (const size of [2, 1, 3]) {
    f.click('#countSize' + size);
    const expected = corpusFrequencies(corpus, size);
    const rows = f.query('#countCorpusBars').children;
    assert.equal(rows.length, 10);
    rows.forEach((row, index) => {
      assert.equal(row.children[0].textContent, expected[index].pattern);
      assert.equal(row.children[2].textContent, expected[index].count);
      assert.equal(row.children[1].children[0].style.width, `${expected[index].count / expected[0].count * 100}%`);
    });
    assert.equal(f.query('#countFullList').children.length, expected.length);
    assert.equal(f.query('#countBars').children.length, 0);
    assert.equal(f.query('#countDiscovery').hidden, true);
  }
  assert.match(f.query('#countCorpusSummary').textContent, /1 appears more than once/);
  f.query('#countPassage').querySelectorAll('.count-word')[0].handlers.click();
  f.query('#countCorpusComparison').open = !f.query('#countCorpusComparison').open; f.query('#countCorpusComparison').handlers.toggle();
  assert.equal(f.query('#countCorpusComparison').open, false);
  assert.equal(f.query('#countBars').children.length, 1);
  f.query('#countCorpusComparison').open = !f.query('#countCorpusComparison').open; f.query('#countCorpusComparison').handlers.toggle(); f.click('#countReset');
  assert.equal(f.query('#countCorpusComparison').open, false);
  const html = fs.readFileSync('ai100/llm_explorer.html', 'utf8');
  assert.ok(html.indexOf('id="countDiscovery"') < html.indexOf('id="countCorpusComparison"'));
  assert.doesNotMatch(html, /id="countCompareAll"/);
});

test('conditional counts match every one- and two-word context, including terminal matches', () => {
  const { continuationCounts } = require('../assets/js/ai100/llm-explorer.js');
  const words = wordSpans(corpus).map(w => w.normalized);
  for (const length of [1, 2]) for (let start = 0; start <= words.length - length; start++) {
    const context = words.slice(start, start + length).join(' '), reference = new Map();
    for (let i = 0; i < words.length - length; i++) if (words.slice(i, i + length).join(' ') === context) reference.set(words[i + length], (reference.get(words[i + length]) || 0) + 1);
    const result = continuationCounts(corpus, context.toUpperCase());
    assert.deepEqual(new Map(result.candidates.map(c => [wordSpans(c.word)[0].normalized, c.count])), reference);
    assert.equal(result.total, [...reference.values()].reduce((a,b) => a+b,0));
    if (result.total) assert.ok(Math.abs(result.candidates.reduce((a,c) => a+c.probability,0)-1)<1e-12);
  }
  assert.deepEqual(continuationCounts(corpus,'Haven').candidates.map(c=>[c.word,c.count,c.probability]), [['pizza',2,1/2],['sets',1,1/4],['is',1,1/4]]);
  assert.deepEqual(continuationCounts(corpus,'New').candidates, [{word:'Haven',count:4,probability:1}]);
  assert.equal(continuationCounts(corpus,'together').terminal,1);
  assert.equal(continuationCounts(corpus,'missing').total,0);
  assert.equal(continuationCounts('a a a','a a').total,1);
  assert.equal(continuationCounts('a a a','a a').terminal,1);
});
test('Scene 3 reveals all results in one click and resets on context changes', () => {
  const f=fixture('https://example.test/ai100/llm_explorer.html?scene=3');
  assert.equal(f.query('.prob-demo').hidden,false);
  assert.equal(f.query('#probDefinition').hidden,true);
  assert.equal(f.query('#probBranches').children.length,1);
  f.click('#probReveal');
  assert.equal(f.query('#probBranches').children.length,3);
  assert.equal(f.query('#probBranches').children[0].children[1].textContent,'2 out of 4 = 50%');
  assert.equal(f.query('#probDefinition').hidden,false);
  assert.equal(f.query('#probReveal').disabled,true);
  assert.match(f.query('#probBranches').children[0].children[1].textContent,/50%/);
  assert.ok(Math.abs(parseFloat(f.query('#probBranches').children[0].children[2].children[0].style.width) - 50) < 1e-12);
  f.click('#probSingle');
  assert.equal(f.query('#probDefinition').hidden,true);
  f.click('#probReveal');
  assert.match(f.query('#probBranches').children[0].children[1].textContent,/4 out of 4 = 100%/);
  assert.equal(f.query('#probDiscovery').hidden,false);
  f.click('#probSize3'); assert.equal(f.query('#probContext').textContent,'New Haven');
  assert.equal(f.query('#probUnequal').hidden,false);
  f.click('#probReset'); assert.equal(f.query('#probContext').textContent,'Haven');
  assert.equal(f.query('#probCompare').hidden,false);
  const passage=f.query('#probPassage').children.filter(c=>c.className==='count-word');
  passage.at(-1).handlers.click(); f.click('#probReveal');
  assert.match(f.query('#probBoundary').textContent,/ends the corpus/);
  assert.match(f.query('#probBranches').children[0].textContent,/No next word/);
});

test('revealed continuations highlight complete bigrams and trigrams and clear on changes', () => {
  const f = fixture('https://example.test/ai100/llm_explorer.html?scene=3');
  const passage = f.query('#probPassage').children.filter(c => c.className === 'count-word');
  const highlighted = () => passage.flatMap((button, index) => button.attributes['data-continuation-highlight'] === 'true' ? [index] : []);
  f.click('#probReveal');
  let row = f.query('#probBranches').children[0];
  row.handlers.pointerenter(); assert.deepEqual(highlighted(), findPattern(corpus, 'Haven pizza', 2).flatMap(match => [match.index, match.index + 1]));
  row.handlers.pointerleave(); assert.deepEqual(highlighted(), []);
  row.handlers.focus(); assert.deepEqual(highlighted(), findPattern(corpus, 'Haven pizza', 2).flatMap(match => [match.index, match.index + 1]));
  row.handlers.blur(); assert.deepEqual(highlighted(), []);
  f.click('#probSize3'); f.click('#probReveal');
  row = f.query('#probBranches').children[0];
  row.handlers.focus(); assert.deepEqual(highlighted(), findPattern(corpus, 'New Haven pizza', 3).flatMap(match => [match.index, match.index + 1, match.index + 2]));
  f.click('#probReset'); assert.deepEqual(highlighted(), []);
  f.click('#probSingle'); f.click('#probReveal');
  f.query('#probBranches').children[0].handlers.pointerenter();
  assert.deepEqual(highlighted(), findPattern(corpus, 'New Haven', 2).flatMap(match => [match.index, match.index + 1]));
});

test('updated passage provides valid A, B and C challenges in both prediction modes', () => {
  const { continuationCounts } = require('../assets/js/ai100/llm-explorer.js');
  const f = fixture('https://example.test/ai100/llm_explorer.html?scene=3');
  for (const size of [2, 3]) {
    f.click('#probSize' + size);
    f.click('#probEqual');
    const equal = continuationCounts(corpus, f.query('#probContext').textContent);
    assert.ok(equal.candidates.length > 1);
    assert.equal(new Set(equal.candidates.map(c => c.count)).size, 1);
    f.click('#probSingle');
    assert.equal(continuationCounts(corpus, f.query('#probContext').textContent).candidates.length, 1);
    assert.equal(f.query('#probUnequal').hidden, false);
    assert.equal(f.query('#probUnequal').children[1].textContent, size === 2 ? 'haven' : 'new haven');
    f.query('#probUnequal').onclick();
    assert.deepEqual(continuationCounts(corpus, f.query('#probContext').textContent).candidates.map(c => c.probability), [0.5, 0.25, 0.25]);
  }
});

test('animated reveal visits every continuation in passage order and removes flying tiles', async () => {
  const flown = [];
  const f = fixture('https://example.test/ai100/llm_explorer.html?scene=3', function () {
    if (this.className === 'prob-flying-word') flown.push(this.textContent);
    return { finished: Promise.resolve(), cancel() {} };
  });
  await f.click('#probReveal');
  assert.deepEqual(flown, ['pizza', 'sets', 'is', 'pizza']);
  assert.equal(f.body.children.length, 0);
  assert.equal(f.query('#probReveal').textContent, 'Results revealed');
  assert.equal(f.query('#probBranches').attributes['aria-busy'], 'false');
});

test('reset during word flight cancels stale results and removes the overlay', async () => {
  let resolveFlight;
  const f = fixture('https://example.test/ai100/llm_explorer.html?scene=3', function () {
    if (this.className !== 'prob-flying-word') return { finished: Promise.resolve(), cancel() {} };
    return { finished: new Promise(resolve => { resolveFlight = resolve; }), cancel() { resolveFlight(); } };
  });
  const pending = f.click('#probReveal');
  for (let i = 0; i < 12 && !resolveFlight; i++) await Promise.resolve();
  assert.equal(f.body.children.length, 1);
  f.click('#probReset');
  await pending;
  assert.equal(f.body.children.length, 0);
  assert.equal(f.query('#probReveal').textContent, 'Reveal');
  assert.equal(f.query('#probCompare').hidden, false);
  assert.equal(f.query('#probBranches').children.length, 1);
});

test('counts and probabilities use only landed words during reveal', async () => {
  const arrivals = [];
  const f = fixture('https://example.test/ai100/llm_explorer.html?scene=3', function () {
    if (this.className === 'prob-branch') {
      arrivals.push(f.query('#probBranches').children.filter(row => row.style.visibility !== 'hidden').map(row => [row.children[0].textContent, row.children[1].textContent, row.children[2].children[0].style.width]));
      assert.equal(f.query('#probCompare').hidden, false);
      assert.equal(f.query('#probCertainty').hidden, true);
    }
    return { finished: Promise.resolve(), cancel() {} };
  });
  const pending = f.click('#probReveal');
  assert.match(f.query('#probTotal').textContent, /so far: 0/);
  await pending;
  assert.deepEqual(arrivals[0], [['pizza', '1 out of 1 = 100%', '100%']]);
  assert.deepEqual(arrivals[1], [['pizza', '1 out of 2 = 50%', '50%'], ['sets', '1 out of 2 = 50%', '50%']]);
  assert.equal(arrivals[2][0][1], '1 out of 3 \u2248 33.3%');
  assert.deepEqual(arrivals[3], [['pizza', '2 out of 4 = 50%', '50%'], ['sets', '1 out of 4 = 25%', '25%'], ['is', '1 out of 4 = 25%', '25%']]);
  assert.equal(f.query('#probCompare').hidden, false);
});
