// Independent Rust/WASM tiktoken reference; never shipped to browsers.
const assert = require('node:assert/strict');
const ref = require('@dqbd/tiktoken').get_encoding('cl100k_base');
const engine = require('../../assets/js/ai100/llm-token-engine.js');
const bundled = require('../../assets/js/vendor/cl100k-tokenizer.js').create();
const cases = [...engine.presets,'hello world','antidisestablishmentarianism','','   ','\t a\r\nb  ','你好世界','café e\u0301','🙂👩🏽‍💻','<|endoftext|>','\ufefftest'];
try {
  for (const text of cases) assert.deepEqual(bundled.encode(text), Array.from(ref.encode(text,[],[])),JSON.stringify(text));
  console.log(`All ${cases.length} cases match the independent cl100k_base reference.`);
} finally { ref.free(); }
