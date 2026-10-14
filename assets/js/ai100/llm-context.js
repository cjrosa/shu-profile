/* Scene 4: exact token boundaries with a simplified keep-most-recent policy. */
(function () {
  'use strict';
  const $ = name => document.getElementById('context' + name);
  const engine = window.llmTokenEngine;
  const examples = {
    long: 'New Haven pizza is legendary. People travel from all over the country to taste its famous thin crust. The city has a long tradition of pizza making.',
    short: 'New Haven pizza is legendary.',
    marie: 'Marie is presenting at the conference. After a long flight, several delays, a missing suitcase, and a difficult morning, she finally arrives at the venue. The person giving the presentation is...',
    own: ''
  };
  let tokenizer, loading, result, revision = 0;
  function load() {
    if (window.LLMTokenizerVendor) return Promise.resolve(window.LLMTokenizerVendor.create());
    if (!loading) loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '../assets/js/vendor/cl100k-tokenizer.js';
      script.onload = () => { try { resolve(window.LLMTokenizerVendor.create()); } catch (e) { reject(e); } };
      script.onerror = () => { script.remove(); reject(new Error('The local tokenizer could not load. Select Retry tokenizer to retry.')); };
      document.head.append(script);
    }).catch(e => { loading = null; throw e; });
    return loading;
  }
  function draw() {
    const capacity = Number($('Size').value);
    $('SizeValue').textContent = capacity + ' tokens';
    $('Size').setAttribute('aria-valuetext', capacity + ' tokens');
    if (!result) return;
    const total = result.tokens.length, included = Math.min(capacity, total), excluded = total - included;
    $('Total').textContent = total + ' tokens total';
    $('Usage').textContent = `${included} of ${capacity} tokens used · ${excluded} tokens outside context`;
    $('Meter').setAttribute('aria-valuemax', capacity);
    $('Meter').setAttribute('aria-valuenow', included);
    $('Meter').setAttribute('aria-valuetext', $('Usage').textContent);
    $('Fill').style.width = (included / capacity * 100) + '%';
    $('Included').replaceChildren(); $('Excluded').replaceChildren();
    result.tokens.forEach((token, index) => {
      const tile = document.createElement('span'); tile.className = 'tokens-tile';
      const label = token.text === null ? 'bytes ' + token.bytes.map(b => b.toString(16).padStart(2,'0')).join(' ') : engine.visible(token.text);
      tile.textContent = label; tile.dataset.id = token.id; tile.dataset.index = index;
      tile.setAttribute('aria-label', `Token ${index + 1}: ${label}, ${index < excluded ? 'outside context' : 'included'}`);
      (index < excluded ? $('Excluded') : $('Included')).append(tile);
    });
    $('Outside').hidden = excluded === 0;
    $('Status').textContent = total ? '' : 'No tokens. Enter text or choose an example.';
    const firstSentence = result.text.match(/^[\s\S]*?[.!?](?:\s|$)/u);
    // Byte offsets come from the complete tokenization, including any boundary-crossing token.
    const firstEnd = new TextEncoder().encode(firstSentence ? firstSentence[0].trimEnd() : result.text).length;
    const start = result.tokens[excluded]?.start ?? 0;
    const firstGone = total > 0 && start >= firstEnd;
    $('Challenge').textContent = $('Preset').value === 'marie'
      ? 'What happens to the earlier reference to Marie as the context window shrinks? Then expand it until the entire passage fits.'
      : 'Make it fit: expand the window until all tokens fit. Lose the beginning: shrink it until the first sentence is outside context.';
    let feedback = '';
    if (total && excluded === 0) feedback = 'All tokens fit. The complete text remains available in the active context.';
    else if ($('Preset').value === 'marie' && start >= new TextEncoder().encode('Marie').length)
      feedback = 'The earlier reference to Marie is outside context. The model no longer has direct access to that reference through this input; this does not determine its continuation.';
    else if (firstGone) feedback = 'The first sentence is now outside context. Its tokens remain visible above, but are unavailable through the current input.';
    $('FeedbackText').textContent = feedback; $('Feedback').hidden = !feedback;
  }
  async function update() {
    const version = ++revision, text = $('Input').value;
    result = null; $('Results').hidden = true; $('Feedback').hidden = true;
    $('Total').textContent = ''; $('Usage').textContent = '';
    $('Fill').style.width = '0%'; $('Meter').setAttribute('aria-valuenow', '0');
    $('Meter').removeAttribute('aria-valuetext'); $('Retry').hidden = true;
    try {
      if (!tokenizer) {
        $('Status').textContent = 'Loading the local tokenizer…';
        const loaded = await load();
        if (version !== revision) return;
        tokenizer = loaded;
      }
      result = engine.analyze(text, tokenizer);
      $('Size').max = Math.max(64, result.tokens.length + 16, Number($('Size').value));
      $('Results').hidden = false; draw();
    } catch (e) {
      if (version !== revision) return;
      result = null; $('Included').replaceChildren(); $('Excluded').replaceChildren();
      $('Status').textContent = e.message; $('Retry').hidden = Boolean(tokenizer);
    }
  }
  function choose() {
    $('Input').value = examples[$('Preset').value];
    $('Input').readOnly = $('Preset').value !== 'own';
    $('Size').max = 64; $('Size').value = 24; draw(); update();
  }
  $('Preset').onchange = choose;
  $('Input').oninput = update;
  $('Size').oninput = draw;
  $('Retry').onclick = update;
  $('Reset').onclick = () => { $('Preset').value = 'long'; $('Demo').querySelector('details').open = false; choose(); };
  choose();
})();
