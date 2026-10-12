const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { chapters, scenes, chapterStart } = require('../assets/js/ai100/llm-explorer.js');
function fixture() {
  const elements = new Map(), events = {};
  function element() {
    return { textContent: '', dataset: {}, style: {}, attributes: {}, children: [], disabled: false,
      classList: { toggle() {} }, handlers: {},
      setAttribute(key, value) { this.attributes[key] = String(value); },
      removeAttribute(key) { delete this.attributes[key]; },
      addEventListener(key, fn) { this.handlers[key] = fn; },
      appendChild(child) { this.children.push(child); }
    };
  }
  const query = selector => { if (!elements.has(selector)) elements.set(selector, element()); return elements.get(selector); };
  const document = { querySelector: query, createElement: element, addEventListener: (key, fn) => { events[key] = fn; } };
  vm.runInNewContext(fs.readFileSync('assets/js/ai100/llm-explorer.js', 'utf8'), { document });
  return { query, click: selector => query(selector).handlers.click(), chapter: index => query('.chapter-bar').children[index].handlers.click(),
    key: (key, target = { closest: () => null }, extra = {}) => { let prevented = false; events.keydown({ key, target, preventDefault() { prevented = true; }, ...extra }); return prevented; } };
}
test('all requested chapters and 23 unique scene records are complete', () => {
  assert.deepEqual(chapters.map(c => c.title), ['Predict', 'Tokenize', 'Context', 'Attend', 'Generate']);
  assert.deepEqual(chapters.map(c => c.scenes.length), [5, 4, 4, 5, 5]);
  assert.equal(new Set(scenes.map(s => s.id)).size, 23);
  assert.deepEqual(chapters.map((_, i) => chapterStart(i)), [0, 5, 9, 13, 18]);
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
    assert.equal(f.query('#sceneCount').textContent, `Scene ${index + 1} of 23`);
    assert.equal(f.query('.progress').attributes['aria-valuenow'], String(index + 1));
    assert.equal(f.query('#progressFill').style.width, `${(index + 1) / 23 * 100}%`);
    assert.equal(f.query('#prevBtn').disabled, index === 0);
    assert.equal(f.query('.chapter-bar').children.filter(b => b.attributes['aria-current']).length, 1);
    assert.equal(f.query('.chapter-bar').children[item.chapterIndex].attributes['aria-current'], 'step');
    if (index < 22) f.click('#nextBtn');
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
  assert.equal(f.query('#sceneCount').textContent, 'Scene 1 of 23');
  assert.equal(f.query('#nextBtn').textContent, 'Next →');
});
test('arrow keys navigate, clamp at the start, and ignore editable or modified input', () => {
  const f = fixture();
  assert.equal(f.key('ArrowLeft'), true);
  assert.equal(f.query('#sceneCount').textContent, 'Scene 1 of 23');
  assert.equal(f.key('ArrowRight'), true);
  assert.equal(f.query('#sceneCount').textContent, 'Scene 2 of 23');
  for (const target of [{ closest: () => ({}) }, { isContentEditable: true }]) assert.equal(f.key('ArrowRight', target), false);
  for (const modifier of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey', 'defaultPrevented']) assert.equal(f.key('ArrowRight', undefined, { [modifier]: true }), false);
  assert.equal(f.key('Enter'), false);
  assert.equal(f.query('#sceneCount').textContent, 'Scene 2 of 23');
  f.key('ArrowLeft');
  assert.equal(f.query('#sceneCount').textContent, 'Scene 1 of 23');
});
test('hub keeps the shell disabled and excludes it from search', () => {
  const hub = fs.readFileSync('ai100/index.html', 'utf8');
  assert.doesNotMatch(hub, /tool=ai100%2Fllm_explorer/);
  assert.doesNotMatch(hub, /name:'LLM Explorer', file:'llm_explorer\.html/);
  assert.match(hub, /aria-disabled="true"/);
  assert.match(hub, />Coming soon<\/span>/);
  const html = fs.readFileSync('ai100/llm_explorer.html', 'utf8');
  assert.match(html, /aria-valuemax="23"/);
  assert.equal((html.match(/<script /g) || []).length, 1);
  assert.match(html, /prefers-reduced-motion/);
});
