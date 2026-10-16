/* Conceptual paths, not learned attention weights or model predictions. */
(function () {
  'use strict';
  const $ = name => document.getElementById('transformer' + name);
  const phrases = ['', ' after a long flight', ' after a long flight and a delayed train', ' after a long flight, a delayed train, and a slow walk through the busy hotel lobby'];
  let words = [], target = 0, mode = 'transformer';
  const escape = text => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function sentence() {
    const previous = words[target];
    words = ('Marie arrived at the conference' + phrases[Number($('Distance').value)] + '. She was exhausted.').split(/\s+/);
    target = previous && words.includes(previous) ? words.indexOf(previous) : words.indexOf('She');
    $('DistanceValue').textContent = (words.indexOf('She') - 1) + ' words between Marie and She';
    $('Tokens').replaceChildren(...words.map((word, i) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'rnn-sentence-token'; button.textContent = word;
      button.setAttribute('aria-label', `${i}: ${word}${i === 0 ? ', earlier source' : ', select as target'}`);
      button.onclick = () => { target = i; draw(); };
      button.onkeydown = event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        target = event.key === 'Home' ? 0 : event.key === 'End' ? words.length - 1 : Math.max(0, Math.min(words.length - 1, i + (event.key === 'ArrowRight' ? 1 : -1)));
        draw(); $('Tokens').children[target].focus();
      };
      return button;
    }));
    draw();
  }
  function draw() {
    const context = Number($('Context').value), available = target < context;
    const rnn = mode === 'rnn', label = escape(words[target]);
    [...$('Tokens').children].forEach((button, i) => {
      button.classList.toggle('selected', i === target);
      button.classList.toggle('read', i === 0 && target !== 0);
      button.classList.toggle('outside-context', !rnn && i < target - context + 1);
      button.setAttribute('aria-pressed', String(i === target));
    });
    $('RNN').setAttribute('aria-pressed', String(rnn));
    $('Attention').setAttribute('aria-pressed', String(!rnn));
    $('Heading').textContent = rnn ? 'RNN — Sequential Information Flow' : 'Transformer — Self-Attention Information Flow';
    $('Summary').textContent = `RNN: ${target} sequential update${target === 1 ? '' : 's'} from Marie to ${words[target]}. Transformer: ${target === 0 ? 'the selected position can include its own information.' : available ? 'information can be incorporated through a direct attention connection within a layer.' : 'Marie is outside the selected context, so no direct connection is available.'}`;
    $('Status').textContent = target === 0 ? 'Marie is the source position: no intervening recurrent updates. Select a later word to compare the paths.' : rnn ? `Information from Marie passes through ${target} recurrent updates before reaching ${words[target]}. ${target > 1 ? 'The middle card groups ' + (target - 1) + ' intermediate hidden states.' : 'These words are adjacent; there is no intermediate state.'}` : available ? `${words[target]} can incorporate information from Marie. Arrows show information flowing from earlier to later; Marie cannot attend to future ${words[target]} in this causal view.` : `Marie falls outside the last ${context} word positions ending at ${words[target]}. A direct attention connection cannot retrieve it from outside this context.`;
    const box = (x, y, kind, title, detail) => `<rect class="rnn-flow-box ${kind}" x="${x}" y="${y}" width="255" height="110" rx="12"/><text class="rnn-svg-title" x="${x+127.5}" y="${y+42}">${title}</text><text class="rnn-svg-small" x="${x+127.5}" y="${y+75}">${detail}</text>`;
    let content = box(15, 235, 'word', 'Marie', 'Earlier word · position 0') + box(825, 235, 'word', label, `Selected word · position ${target}`);
    content += box(15, 85, 'memory', rnn ? 'Hidden state' : 'Token representation', 'Information from Marie');
    content += box(825, 85, 'memory', rnn ? 'Hidden state' : 'Token representation', `At ${label}`);
    const paths = [];
    if (target > 0 && (rnn || available)) {
      if (rnn && target > 1) {
        content += box(420, 85, 'memory', `${target-1} intermediate`, 'hidden states · in sequence');
        paths.push('M270 140H420', 'M675 140H825');
      } else paths.push('M270 140H825');
    }
    content += '<path class="rnn-word-entry" d="M142 235V195M952 235V195"/>';
    content += paths.map(path => `<path class="transformer-path" d="${path}" marker-end="url(#transformer-arrow)"/>`).join('');
    if (!rnn && target > 0) content += `<text class="rnn-svg-small memory-label" x="548" y="${available ? 112 : 145}">${available ? 'Direct contextual connection' : 'Outside available context'}</text>`;
    if (target === 0) content += '<text class="rnn-svg-small" x="548" y="140">Same position · no travel needed</text>';
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      content += paths.map((path, i) => `<circle class="rnn-signal memory" r="6"><animateMotion path="${path}" dur="1.2s" begin="${rnn ? i*1.2 : 0}s" fill="freeze"/><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.12;0.85;1" dur="1.2s" begin="${rnn ? i*1.2 : 0}s" fill="freeze"/></circle>`).join('');
    }
    $('Diagram').innerHTML = `<svg class="rnn-flow-diagram" viewBox="0 60 1100 310" role="img" aria-label="${escape($('Status').textContent)}"><defs><marker id="transformer-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker></defs>${content}</svg>`;
  }
  $('RNN').onclick = () => { mode = 'rnn'; draw(); };
  $('Attention').onclick = () => { mode = 'transformer'; draw(); };
  $('Preset').onchange = () => { $('Distance').value = $('Preset').value; sentence(); };
  $('Distance').oninput = () => { $('Preset').value = $('Distance').value; sentence(); };
  $('Context').onchange = draw;
  window.openTransformerScene = draw;
  sentence();
})();
