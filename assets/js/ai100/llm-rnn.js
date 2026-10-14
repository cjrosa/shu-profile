/* Scene 3.2 uses the NLP visualizer's unchanged renderer, CSS and forward pass. */
(function () {
  'use strict';
  const $ = name => document.getElementById('rnn' + name);
  const model = RNNTraining.initial();
  const examples = {
    short: 'The cat sleeps.',
    marie: 'Marie arrived at the conference after a long flight. She was exhausted.',
    long: 'Marie arrived at the conference after a long flight, a delayed train, a crowded shuttle ride, and a slow walk through the busy hotel lobby. She was exhausted.'
  };
  let steps = [], position = 0, timer = null, promptLength = 0;
  const continuations = {
    short: 'It curls up on the sofa.',
    marie: 'She found a quiet place to rest.',
    long: 'She found a quiet place to rest.'
  };
  function input(word) {
    const codes = Array.from(word.toLowerCase(), c => c.codePointAt(0));
    return Array.from({length:6}, (_, i) => Math.sin(codes.reduce((sum,c,j) => sum + c * (j + 1 + i), 17 * (i + 1))) * .8);
  }
  function stop() {
    clearInterval(timer); timer = null;
  }
  window.cancelRNNPlayback = () => {
    stop();
    $('Diagram').querySelectorAll('animate,animateMotion').forEach(el => el.remove());
  };
  function draw(phase = 'state') {
    [...$('Tokens').children].forEach((tile,i) => {
      tile.classList.toggle('selected',i === position);
      tile.classList.toggle('read',i < position);
      tile.setAttribute('aria-pressed',String(i === position));
    });
    const step = steps[position];
    if (!step) {
      $('Generated').textContent = ''; $('Diagram').replaceChildren();
      return;
    }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    $('Diagram').innerHTML = RNNTraining.flow({word:step.word, embedding:step.x, prior:step.prior, updated:step.h, carry:true, model, generation:{word:position < promptLength-1 ? 'Reading...' : (steps[position+1]?.word || 'END'),pending:position < promptLength-1 || position === steps.length-1,complete:position === steps.length-1}, phase:reduced?'static':phase});
    $('Diagram').dataset.phase = phase;
    const outputPath = $('Diagram').querySelector('.rnn-output-path');
    outputPath.classList.toggle('active',position >= promptLength-1);
    $('Generated').textContent = steps.slice(promptLength,position+1).map(s=>s.word).join(' ') || 'Reading the prompt...';
    // Keep arbitrary custom words inside the original word card.
    if (step.word.length > 18) {
      const label = $('Diagram').querySelector('.rnn-current-word');
      label.setAttribute('textLength', '220'); label.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    }

  }
  function select(index) { stop(); position = index; draw(); }
  function update() {
    stop(); position = 0;
    const own = $('Preset').value === 'own'; $('Editor').hidden = !own;
    const words = (own ? $('Input').value.slice(0,300) : examples[$('Preset').value]).match(/\S+/gu) || [];
    promptLength = words.length;
    // The continuation is authored, not predicted. Its words still feed the same RNN recurrence.
    if (words.length) words.push(...(own ? $('Continuation').value.slice(0,300) : continuations[$('Preset').value]).match(/\S+/gu) || []);
    steps = RNNTraining.forward(model,{words,inputs:words.map(input),label:0}).steps;
    $('Tokens').replaceChildren(...words.map((word,i) => {
      const tile = document.createElement('button'); tile.type = 'button'; tile.className = 'rnn-sentence-token'; tile.textContent = word; tile.dataset.source = i < promptLength ? 'prompt' : 'generated';
      tile.setAttribute('aria-label',`${i < promptLength ? "Prompt" : "Generated"} token ${i+1}: ${word}`); tile.onclick = () => select(i);
      tile.onkeydown = event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? steps.length-1 : Math.max(0,Math.min(steps.length-1,i+(event.key==='ArrowRight'?1:-1)));
        select(target); $('Tokens').children[target].focus();
      }; return tile;
    })); draw();
  }
  $('Preset').onchange = () => { update(); window.openRNNScene(); }; $('Input').oninput = update; $('Continuation').oninput = update;
  function play() {
    if (timer || !steps.length || $('Demo').hidden) return;
    let phase = 'state';
    // Reading: two 350ms phases. Generation: update, predict, then feedback (3.2s total).
    function schedule() {
      timer = setInterval(() => {
        clearInterval(timer); timer = null;
        if ($('Demo').hidden) return;
        if (position < promptLength - 1) {
          if (phase === 'state') phase = 'carry';
          else { position++; phase = 'state'; }
        } else if (phase === 'state') phase = 'predict';
        else if (phase === 'predict' && position < steps.length - 1) phase = 'feedback';
        else { position = (position + 1) % steps.length; phase = 'state'; }
        draw(phase);
        schedule();
      }, position < promptLength - 1 ? 350 : phase === 'state' ? 1200 : phase === 'predict' ? 900 : 1100);
    }
    schedule();
  }
  window.openRNNScene = () => {
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) play();
  };
  document.addEventListener('visibilitychange', () => { if(document.hidden) stop(); });
  update();
  window.openRNNScene();
})();
