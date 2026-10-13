const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync('viewer.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function viewer(href) {
  const elements = new Map(), handlers = {};
  const document = { title: '', documentElement: { style: { setProperty() {} } }, getElementById(id) {
    if (!elements.has(id)) elements.set(id, { style: {}, contentWindow: {} });
    return elements.get(id);
  } };
  const context = { document, location: new URL(href), URL, URLSearchParams,
    window: { addEventListener(type, handler) { handlers[type] = handler; } },
    history: { state: null, replaceState(state, title, url) { context.location = new URL(url); } } };
  vm.runInNewContext(script, context);
  return { context, frame: document.getElementById('tool-frame'), message: data => handlers.message(data) };
}
test('viewer forwards chapter/scene, preserves tool query and synchronizes refresh location', () => {
  const v = viewer('https://example.test/viewer.html?tool=ai100%2Fllm_explorer.html%3Ftheme%3Dgreen&chapter=1&scene=2&course=AI100#lesson');
  const child = new URL(v.frame.src);
  assert.equal(child.searchParams.get('chapter'), '1');
  assert.equal(child.searchParams.get('scene'), '2');
  assert.equal(child.searchParams.get('theme'), 'green');
  v.message({ source: v.frame.contentWindow, origin: 'https://example.test', data: { type: 'llm-explorer-navigation', chapter: 2, scene: 4 } });
  assert.equal(v.context.location.searchParams.get('chapter'), '2');
  assert.equal(v.context.location.searchParams.get('scene'), '4');
  assert.equal(v.context.location.searchParams.get('course'), 'AI100');
  assert.equal(v.context.location.hash, '#lesson');
  const refreshed = viewer(v.context.location.href);
  assert.equal(new URL(refreshed.frame.src).searchParams.get('scene'), '4');
});
test('viewer rejects unrelated, foreign and invalid navigation messages', () => {
  const v = viewer('https://example.test/viewer.html?tool=ai100/llm_explorer.html');
  const before = v.context.location.href;
  const valid = { source: v.frame.contentWindow, origin: 'https://example.test', data: { type: 'llm-explorer-navigation', chapter: 1, scene: 2 } };
  for (const overrides of [{ source: {} }, { origin: 'https://other.test' }, { data: null }, { data: { type: 'llm-explorer-navigation', chapter: 2, scene: 5 } }]) v.message({ ...valid, ...overrides });
  assert.equal(v.context.location.href, before);
});
