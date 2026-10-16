/* Scene 3.2 uses the NLP visualizer's unchanged renderer, CSS and forward pass. */
(function () {
  'use strict';
  const $ = name => document.getElementById('rnn' + name);
  const model = RNNTraining.initial();
  const examples = {
    short: 'Marie arrived at the conference. She was exhausted.',
    long: 'Marie arrived at the conference after a long flight, a delayed train, a crowded shuttle ride, and a slow walk through the busy hotel lobby. She was exhausted.'
  };
  let steps = [], position = 0, timer = null, promptLength = 0, influence = [];
  const continuations = {
    short: 'She found a quiet place to rest.',
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
    [...$('Tokens').querySelectorAll('button')].forEach((tile,i) => {
      tile.classList.toggle('selected',i === position);
      tile.classList.toggle('read',i < position);
      tile.setAttribute('aria-pressed',String(i === position));
    });
    const step = steps[position];
    if (!step) {
      $('Diagram').replaceChildren();
      return;
    }
    const x = i => 110 + i * 506 / Math.max(1,steps.length-1);
    const displayFloorPercent = 1e-10;
    const y = value => 18 + (2 - Math.log10(Math.max(displayFloorPercent,value*100))) / 12 * 132;
    const ticks = [[2,'100%'],[0,'1%'],[-2,'0.01%'],[-4,'0.0001%'],[-6,'0.000001%'],[-8,'0.00000001%'],[-10,'0.0000000001%']];
    const points = influence.slice(0,position+1).map((value,i)=>x(i)+','+y(value)).join(' ');
    $('InfluencePlot').innerHTML = '<g class="rnn-plot-grid">' + ticks.map(([power])=>'<path d="M110 '+y(10**power/100)+'H616"/>').join('') + '</g>' +
      '<g class="rnn-plot-labels">' + ticks.map(([power,label])=>'<text x="102" y="'+(y(10**power/100)+4)+'" text-anchor="end">'+label+'</text>').join('') +
      '<text x="110" y="170">0</text><text x="616" y="170" text-anchor="end">'+(steps.length-1)+'</text><text class="rnn-current-axis-label" x="'+x(position)+'" y="187" text-anchor="'+(x(position)<160?'start':x(position)>530?'end':'middle')+'"></text><text x="363" y="211" text-anchor="middle">Words Processed Since &quot;Marie&quot;</text><text x="110" y="-8">Relative Influence of &quot;Marie&quot; (%, log scale)</text></g>' +
      '<line class="rnn-current-guide" x1="'+x(position)+'" x2="'+x(position)+'" y1="150" y2="'+y(influence[position])+'"/><polyline class="rnn-signal-line" points="'+points+'"/><circle class="rnn-signal-point" cx="'+x(position)+'" cy="'+y(influence[position])+'" r="4"/>';
    $('InfluencePlot').querySelector('.rnn-current-axis-label').textContent = position + '. ' + step.word;
    $('InfluencePlot').setAttribute('aria-label','First-word effect on hidden unit 1, '+position+' words processed since '+steps[0].word+' out of '+(steps.length-1)+'. Relative influence in percent on a logarithmic vertical scale. Values below 0.0000000001%, including zero, are clipped to the display floor.');
    $('InfluenceCopy').innerHTML = '<svg class="rnn-tracking-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg><span>Tracking &ldquo;<strong class="rnn-tracked-word"></strong>&rdquo; through <strong class="rnn-tracked-count"></strong> later ' + (position === 1 ? 'word' : 'words') + '</span>';
    $('InfluenceCopy').querySelector('.rnn-tracked-word').textContent = steps[0].word;
    $('InfluenceCopy').querySelector('.rnn-tracked-count').textContent = position;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    $('Diagram').innerHTML = RNNTraining.flow({word:step.word, embedding:step.x, prior:step.prior, updated:step.h, carry:true, model, generation:{word:position < promptLength-1 ? 'Reading...' : (steps[position+1]?.word || 'END'),pending:position < promptLength-1 || position === steps.length-1,complete:position === steps.length-1}, phase:reduced?'static':phase});
    $('Diagram').dataset.phase = phase;
    const outputPath = $('Diagram').querySelector('.rnn-output-path');
    outputPath.classList.toggle('active',position >= promptLength-1);
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
    const withoutFirst = RNNTraining.forward(model,{words,inputs:words.map((word,i)=>i ? input(word) : [0,0,0,0,0,0]),label:0}).steps;
    const differences = steps.map((step,i)=>Math.abs(step.h[0]-withoutFirst[i].h[0]));
    influence = differences.map(value=>differences[0] ? value/differences[0] : 0);
    const tiles = words.map((word,i) => {
      const tile = document.createElement('button'); tile.type = 'button'; tile.className = 'rnn-sentence-token'; tile.textContent = word; tile.dataset.source = i < promptLength ? 'prompt' : 'generated';
      tile.setAttribute('aria-label',`${i < promptLength ? "Prompt" : "Generated"} token ${i+1}: ${word}`); tile.onclick = () => select(i);
      tile.onkeydown = event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? steps.length-1 : Math.max(0,Math.min(steps.length-1,i+(event.key==='ArrowRight'?1:-1)));
        select(target); $('Tokens').querySelectorAll('button')[target].focus();
      }; return tile;
    });
    $('PromptTokens').replaceChildren(...tiles.slice(0,promptLength));
    $('ResponseTokens').replaceChildren(...tiles.slice(promptLength));
    draw();
  }
  $('Preset').onchange = () => { update(); window.openRNNScene(); }; $('Input').oninput = update; $('Continuation').oninput = update;
  function play() {
    if (timer || !steps.length || $('Demo').hidden) return;
    let phase = 'state';
    // Both prompt and continuation advance at 1.2 seconds per word.
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
      }, position < promptLength - 1 ? 600 : phase === 'state' ? 450 : phase === 'predict' ? 330 : 420);
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
