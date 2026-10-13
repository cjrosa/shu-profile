(function() {
  'use strict';
  const $ = id => document.getElementById(id), engine = window.llmTokenEngine;
  let tokenizer, loading, result;
  const explored = new Set();
  function setTokensVisible(visible) {
    $('tokensModelCard').classList.toggle('tokens-obscured', !visible);
    for (const id of ['tokensPieces','tokensTokenCount']) {
      $(id).inert = !visible;
      $(id).setAttribute('aria-hidden', String(!visible));
    }
    $('tokensToggle').setAttribute('aria-expanded', String(visible));
    $('tokensToggleLabel').textContent = visible ? 'Hide tokens' : 'Show tokens';
    if (visible && result) explored.add(result.text);
    $('tokensDiscovery').hidden = !visible || !result || result.tokens.length <= result.words.length;
    $('tokensCompletion').hidden = !visible || explored.size < 3;
  }
  function element(tag, text, className) {
    const node = document.createElement(tag); node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function initialize() {
    if (loading) return loading;
    $('tokensStatus').textContent = 'Loading the local tokenizer…';
    loading = new Promise((resolve, reject) => {
      function ready() { try { tokenizer = window.LLMTokenizerVendor.create(); resolve(); } catch (error) { reject(error); } }
      if (window.LLMTokenizerVendor) return ready();
      const script = document.createElement('script');
      script.src = '../assets/js/vendor/cl100k-tokenizer.js';
      script.onload = ready; script.onerror = () => { script.remove(); reject(new Error('load')); };
      document.head.append(script);
    }).then(updateComparison)
      .catch(() => { loading = null; $('tokensStatus').textContent = 'The local tokenizer could not load. Select Retry to try again.'; $('tokensRetry').hidden = false; });
    return loading;
  }
  window.openTokenScene = initialize;
  function fitInput() {
    const input = $('tokensInput');
    input.style.height = 'auto';
    input.style.height = `${Math.max(100,input.scrollHeight + 2)}px`;
    $('tokensSpan').scrollTop = input.scrollTop;
  }
  function clear() {
    setTokensVisible(false);
    result = null; $('tokensResults').hidden = true;
    $('tokensDiscovery').hidden = true; $('tokensCompletion').hidden = true;
    $('tokensWords').replaceChildren(); $('tokensPieces').replaceChildren();
    $('tokensSpan').replaceChildren();
  }
  function inspect(kind, index) {
    const selected = result[kind][index];
    for (const [key, id] of [['words','tokensWords'],['tokens','tokensPieces']]) {
      Array.from($(id).children).forEach((button,i) => {
        const overlaps = engine.overlap(result[key][i], selected);
        button.classList.toggle('related', overlaps);
        button.setAttribute('aria-pressed', String(overlaps));
      });
    }
    const passage = $('tokensSpan');
    passage.replaceChildren();
    let highlight;
    result.characters.forEach(char => {
      const hit = engine.overlap(char,selected), partial = hit && (selected.start > char.start || selected.end < char.end);
      if (hit) {
        if (!highlight) { highlight = element('mark',''); passage.append(highlight); }
        highlight.append(element('span',char.text,partial ? 'tokens-partial' : ''));
      } else {
        highlight = null;
        passage.append(element('span',char.text));
      }
    });

  }
  function updateComparison() {
    clear();
    fitInput();
    if (!tokenizer) return;
    try {
      result = engine.analyze($('tokensInput').value,tokenizer);
      if (!result.text.length) { $('tokensStatus').textContent = 'Enter some text to begin.'; return; }
      for (const [key,id] of [['words','tokensWords'],['tokens','tokensPieces']]) {
        result[key].forEach((part,index) => {
          const label = part.text === null ? `bytes ${part.bytes.map(b=>b.toString(16).padStart(2,'0')).join(' ')}` : engine.visible(part.text);
          const button = element('button',label,'tokens-tile'); button.type = 'button';
          button.setAttribute('aria-label',`${key === 'words' ? 'Word' : 'Token'} ${index+1}: ${part.text === null ? label + ', partial Unicode character' : JSON.stringify(part.text)}`);
          button.setAttribute('aria-pressed','false'); button.addEventListener('click',()=>inspect(key,index)); $(id).append(button);
        });
      }
      $('tokensWordCount').textContent = result.words.length;
      $('tokensTokenCount').textContent = result.tokens.length;
      $('tokensSpan').textContent = result.text;

      $('tokensResults').hidden = false;
      $('tokensStatus').textContent = '';
    } catch (error) { result = null; $('tokensStatus').textContent = error.message; }
  }
  engine.presets.forEach(text => { const option = element('option',text); option.value = text; $('tokensPreset').append(option); });
  const custom = element('option','Custom text'); custom.value = ''; $('tokensPreset').append(custom);
  $('tokensPreset').addEventListener('change',()=>{ $('tokensInput').value = $('tokensPreset').value; updateComparison(); });
  $('tokensInput').addEventListener('input',()=>{ $('tokensPreset').value = engine.presets.includes($('tokensInput').value) ? $('tokensInput').value : ''; updateComparison(); });
  $('tokensInput').addEventListener('scroll',()=>{ $('tokensSpan').scrollTop = $('tokensInput').scrollTop; });
  if (typeof ResizeObserver !== 'undefined') {
    let previousWidth;
    new ResizeObserver(entries=>{ const width = entries[0].contentRect.width; if (width !== previousWidth) { previousWidth = width; fitInput(); } }).observe($('tokensInput'));
  }
  function reset() { explored.clear(); $('tokensInput').value = engine.initial; $('tokensPreset').value = engine.initial; updateComparison(); }
  $('tokensReset').addEventListener('click',reset);
  $('tokensToggle').addEventListener('click',()=>setTokensVisible($('tokensToggle').getAttribute('aria-expanded') !== 'true'));
  $('tokensRetry').addEventListener('click',()=>{ $('tokensRetry').hidden = true; initialize(); });
  reset();
  if (!$('tokensDemo').hidden) initialize();
})();
