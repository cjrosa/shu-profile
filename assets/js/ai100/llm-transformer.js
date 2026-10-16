/* Conceptual information paths; no trained attention weights. */
(function () {
  'use strict';
  const $ = name => document.getElementById('transformer' + name);
  const phrases = ['', ' after a long flight', ' after a long flight and a delayed train', ' after a long flight, a delayed train, and a slow walk through the busy hotel lobby'];
  $('Demo').querySelectorAll('[title]').forEach(node => { node.dataset.tooltip=node.title; node.removeAttribute('title'); });
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let words = [], target = 0, source = 0, mode = 'rnn', progress = 0, timer = null, playing = false;
  const escape = text => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const point = i => ({x:100 + i % 6 * 150, y:62 + Math.floor(i / 6) * (mode === 'rnn' ? 130 : 90)});
  const permitted = i => i <= target && i >= Math.max(0, target - Number($('Context').value) + 1);
  const available = () => permitted(source);
  const total = () => mode === 'rnn' ? target : available() ? 1 : 0;
  const duration = () => Math.min(600, 3600 / Math.max(1, total()));
  function stop() { clearTimeout(timer); timer = null; playing = false; }
  function reset() { stop(); progress = 0; draw(); }
  function select(i, focus = false) {
    target = i; reset();
    if (focus) $('Diagram').querySelector('[data-token="' + i + '"]').focus();
  }
  function sentence() {
    const previous = words[target];
    const previousSource = words[source];
    words = ('Marie arrived at the conference' + phrases[Number($('Distance').value)] + '. She was exhausted.').split(/\s+/);
    target = previous && words.includes(previous) ? words.indexOf(previous) : words.indexOf('She');
    source = previousSource && words.includes(previousSource) ? words.indexOf(previousSource) : 0;
    reset();
  }
  function paths(attentionSource = source) {
    if (mode === 'rnn' ? !target : !permitted(attentionSource)) return [];
    if (mode === 'rnn') return Array.from({length:target}, (_, i) => {
      const a = point(i), b = point(i+1);
      return {from:i, to:i+1, d:i % 6 === 5
        ? 'M'+(a.x+30)+' '+a.y+'H938Q950 '+a.y+' 950 '+(a.y+12)+'V'+(a.y+82)+'Q950 '+(a.y+94)+' 938 '+(a.y+94)+'H32Q20 '+(a.y+94)+' 20 '+(a.y+106)+'V'+(b.y-12)+'Q20 '+b.y+' 32 '+b.y+'H'+(b.x-30)
        : 'M'+(a.x+30)+' '+a.y+'H'+(b.x-30)};
    });
    const a = point(attentionSource), b = point(target);
    let d;
    if (attentionSource === target) {
      d = 'M'+(a.x-12)+' '+(a.y+16)+'C'+(a.x-32)+' '+(a.y+51)+' '+(a.x+32)+' '+(a.y+51)+' '+(a.x+12)+' '+(a.y+16);
    } else if (a.y === b.y) {
      const bend = a.y+35+Math.min(12,Math.abs(b.x-a.x)/60);
      d = 'M'+a.x+' '+(a.y+16)+'C'+a.x+' '+bend+' '+b.x+' '+bend+' '+b.x+' '+(b.y+16);
    } else if (b.y-a.y === 90) {
      const middle = (a.y+b.y)/2;
      d = 'M'+a.x+' '+(a.y+16)+'C'+a.x+' '+middle+' '+b.x+' '+middle+' '+b.x+' '+(b.y-16);
    } else {
      d = 'M'+a.x+' '+(a.y+16)+'Q'+a.x+' '+(a.y+38)+' '+(a.x-16)+' '+(a.y+38)+'H24Q12 '+(a.y+38)+' 12 '+(a.y+50)+'V'+(b.y-46)+'Q12 '+(b.y-34)+' 24 '+(b.y-34)+'H'+(b.x-16)+'Q'+b.x+' '+(b.y-34)+' '+b.x+' '+(b.y-16);
    }
    return [{from:attentionSource,to:target,d}];
  }
  function roleIcons(x, y, isSource, isTarget) {
    const icon = (role, dx) => '<g class="transformer-role '+role+'" transform="translate('+(x+dx)+' '+(y-8)+')" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(role==='source'?'<circle cx="8" cy="8" r="7"/><path d="M4 8h8m-3-3 3 3-3 3"/>':'<circle cx="8" cy="8" r="7"/><circle cx="8" cy="8" r="3"/><path d="M8 0v3M16 8h-3"/>')+'</g>';
    return (isSource?icon('source',-57):'')+(isTarget?icon('target',isSource?41:-57):'');
  }
  function draw(animated = false, pulseValues = false) {
    const rnn = mode === 'rnn', edges = paths(), current = rnn ? progress : progress ? source : target;
    const featured = rnn ? 0 : source;
    const between = Math.max(0, Math.abs(target-featured)-1);
    $('DistanceValue').innerHTML = between + (between === 1 ? ' word between ' : ' words between ') + '<strong>' + escape(words[featured]) + '</strong> and <strong>' + escape(words[target]) + '</strong>';
    $('Seeing').textContent = rnn ? 'RNNs pass information forward one word at a time.' : 'Transformers use attention to connect words directly.';
    $('ContextControl').hidden = rnn;
    syncContextDropdown();
    if (rnn) closeContextDropdown();
    $('Step').hidden = !rnn;
    $('RNN').setAttribute('aria-pressed', String(rnn));
    $('Attention').setAttribute('aria-pressed', String(!rnn));
    $('Heading').textContent = rnn ? 'RNN: Follow each hidden state' : 'Transformer: Connect across positions';
    $('Heading').dataset.tooltip = rnn
      ? 'Each hidden state combines the current word with information carried forward from earlier words. The blocks show the evolving state after processing the corresponding word.'
      : 'Click a word to select the target. Shift-click or Shift+Enter selects a permitted source. Highlighting shows permitted connections, not importance or measured attention weights. One word per position is a teaching simplification.';
    $('Summary').textContent = rnn ? target + ' sequential updates from Marie to ' + words[target] + '.'
      : (available() ? '"' + words[target] + '" can attend to ' + words[source] + (source === target ? ' (its own position).' : '.') + ' Arrows point from the selected word to positions it can attend to; they do not show learned attention weights.'
          : words[source] + (source > target ? ' is a future position' : ' is outside the permitted attention context') + ', so "' + words[target] + '" cannot attend to ' + words[source] + '.') + ' Future positions are unavailable to the selected target.';
    $('Status').textContent = playing ? 'Following information flow...' : rnn && target === 0 ? 'Select a later word to trace information from Marie.' : !total() ? 'Select a permitted source word, or change the target or context.' : progress === total() ? 'Information has reached ' + words[target] + '. Reset or play again.' : progress ? 'Information is at ' + words[current] + '. Step to continue.' : 'Ready at ' + words[featured] + '. Play the path or step through it.';
    if (!rnn) $('Status').textContent = playing ? 'Tracing available attention...' : !available() ? 'The featured source is unavailable; faint arrows show permitted positions.' : progress ? words[target]+' can attend to '+words[source]+'.' : 'Ready to trace attention from '+words[target]+'.';
    $('Play').disabled = !total() || !!motion?.matches;
    const playLabel = playing ? 'Pause' : progress === total() && total() ? 'Replay' : 'Play';
    $('Play').setAttribute('aria-label',playLabel);
    $('Play').dataset.tooltip = playLabel;
    $('Play').innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(playing?'<path d="M8 5v14M16 5v14"/>':playLabel==='Replay'?'<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>':'<path d="m8 5 11 7-11 7Z"/>')+'</svg>';
    $('Play').setAttribute('aria-pressed',String(playing));
    $('Step').disabled = !total() || progress === total();
    $('Reset').disabled = !progress && !playing;
    $('MotionNote').hidden = !motion?.matches;
    let content = !rnn ? '<g class="attention-background">'+words.flatMap((_,i) => i !== source && permitted(i) ? paths(i) : []).map(edge => '<path class="attention-available" data-attention-from="'+target+'" data-attention-to="'+edge.from+'" d="'+edge.d+'" />').join('')+'</g>' : '';
    content += edges.map((edge,i) => '<path class="transformer-path'+(!rnn?' attention-featured':'')+(i<progress?' traversed':'')+'" data-from="'+edge.from+'" data-to="'+edge.to+'"'+(!rnn?' data-attention-from="'+target+'" data-attention-to="'+edge.from+'"':'')+' d="'+edge.d+'"'+(rnn?' marker-end="url(#transformer-arrow)"':'')+'/>').join('');
    content += words.map((word,i) => {
      const p = point(i), outside = !rnn && i < target - Number($('Context').value) + 1;
      const colored = rnn && progress > 0 && i <= progress && i <= target;
      const paletteProgress = Math.min(100,i*6);
      const vectorColor = !colored ? 'var(--muted)' : paletteProgress <= 50
        ? 'color-mix(in srgb, var(--amber), var(--green) '+(paletteProgress*2)+'%)'
        : 'color-mix(in srgb, var(--green), var(--blue) '+((paletteProgress-50)*2)+'%)';
      const reached = rnn ? i <= progress && i <= target : i === source || progress > 0 && i === target;
      if (!rnn) {
        const allowed = permitted(i), selectingSource = false;
        const tooltip = selectingSource ? (allowed ? 'Available source: '+word : i>target ? 'Future position: unavailable' : 'Outside attention context') : 'Click for target; Shift-click for source: '+word;
        return '<g class="transformer-position'+(i>target?' future':'')+(outside?' outside-context':'')+'" data-position="'+i+'"><g class="transformer-token transformer-source'+(allowed?' available':'')+(i===target?' selected has-target':'')+(i===source?' has-source':'')+'" data-token="'+i+'" data-source="'+i+'" role="button" tabindex="'+(i===(selectingSource&&available()?source:target)?'0':'-1')+'" aria-disabled="'+(selectingSource&&!allowed)+'" aria-pressed="'+(i===(selectingSource?source:target))+'" aria-label="'+escape(tooltip)+'" data-tooltip="'+escape(tooltip)+'"><rect class="rnn-flow-box memory transformer-state'+(i===source?' reached':'')+(i===current?' current':'')+'" x="'+(p.x-65)+'" y="'+(p.y-16)+'" width="130" height="32" rx="8"/><text class="rnn-svg-title memory-label" x="'+(p.x+(i===source&&i===target?0:i===source||i===target?10:0))+'" y="'+(p.y+5)+'"'+(i===source&&i===target&&word.length>7?' textLength="76" lengthAdjust="spacingAndGlyphs"':'')+'>'+escape(word)+'</text>'+roleIcons(p.x,p.y,i===source,i===target)+'</g>'+'</g>';
      }

      return '<g class="transformer-position'+(i>target?' future':'')+(outside?' outside-context':'')+'" data-position="'+i+'">' +
        '<g class="rnn-state-blocks'+(colored?' is-colored':'')+'" role="img" aria-label="Hidden-state vector h'+i+' after '+escape(word)+'" data-tooltip="Illustrative hidden-state vector after '+escape(word)+'. Colors do not represent computed model values."><rect class="rnn-flow-box memory transformer-state'+(reached?' reached':'')+(i===current?' current':'')+'" x="'+(p.x-30)+'" y="'+(p.y-16)+'" width="60" height="32" rx="8"/>'+Array.from({length:5},(_,j)=>'<rect class="transformer-vector-value'+((animated||pulseValues)&&colored&&i===progress&&!motion?.matches?' pulse':'')+'" style="--value-opacity:'+[.35,.7,.95,.5,.8][(i+j)%5]+';--pulse-duration:'+Math.min(.24,duration()/2000)+'s;--pulse-delay:'+(j*duration()/10000)+'s" x="'+(p.x-24+j*10)+'" y="'+(p.y-9)+'" width="8" height="18" rx="2" fill="'+vectorColor+'" opacity="'+[.35,.7,.95,.5,.8][(i+j)%5]+'"/>').join('')+'</g>' +
        '<path class="rnn-word-entry" d="M'+p.x+' '+(p.y+38)+'V'+(p.y+16)+'"/>' +
        '<g class="transformer-token'+(i===target?' selected':'')+'" data-token="'+i+'" role="button" tabindex="'+(i===target?'0':'-1')+'" aria-pressed="'+(i===target)+'" aria-label="'+escape(i+': '+word+(i===0?', earlier source':', select as target'))+'">' +
        '<rect class="rnn-flow-box word" x="'+(p.x-65)+'" y="'+(p.y+38)+'" width="130" height="36" rx="8"/><text class="rnn-svg-title" x="'+(p.x+(i===featured&&i===target?0:i===featured||i===target?10:0))+'" y="'+(p.y+62)+'"'+(i===featured&&i===target&&word.length>7?' textLength="76" lengthAdjust="spacingAndGlyphs"':'')+'>'+escape(word)+'</text>'+roleIcons(p.x,p.y+56,i===featured,i===target)+'</g>' +
        ''+'</g>';
    }).join('');
    if (animated && progress && !motion?.matches) {
      const path = edges[progress-1];
      content += '<circle class="rnn-signal memory" r="6"><animateMotion '+(!rnn?'keyPoints="1;0" keyTimes="0;1" calcMode="linear" ':'')+'path="'+path.d+'" dur="'+duration()/1000+'s" fill="freeze"/><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.12;0.85;1" dur="'+duration()/1000+'s" fill="freeze"/></circle>';
    }
    $('Diagram').innerHTML = '<svg class="rnn-flow-diagram" viewBox="0 28 '+(rnn?980:940)+' '+(Math.ceil(words.length/6)*(rnn?130:90)+12)+'" role="group" aria-label="'+escape($('Summary').textContent)+'"><defs><marker id="transformer-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker></defs>'+content+'</svg>';
    $('Diagram').querySelectorAll('[data-token]').forEach(token => {
      const i = Number(token.dataset.token);
      const chooseSource = () => { if (!rnn && permitted(i)) { source = i; reset(); $('Diagram').querySelector('[data-token="'+i+'"]').focus(); } };
      token.onclick = event => { if (event.shiftKey && !rnn) chooseSource(); else select(i, true); };
      token.onkeydown = event => {
        if (!['ArrowLeft','ArrowRight','Home','End','Enter',' '].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        if (event.shiftKey && !rnn && ['Enter',' '].includes(event.key)) { chooseSource(); return; }
        select(event.key==='Home'?0:event.key==='End'?words.length-1:event.key==='ArrowLeft'?Math.max(0,i-1):event.key==='ArrowRight'?Math.min(words.length-1,i+1):i, true);
      };
    });
  }
  function play() {
    if (playing) { stop(); draw(); return; }
    if (!total() || motion?.matches || $('Demo').hidden) return;
    if (progress === total()) progress = 0;
    playing = true;
    function advance() {
      if ($('Demo').hidden || document.hidden) { stop(); draw(); return; }
      progress++; draw(true);
      timer = setTimeout(() => {
        if (progress >= total()) { stop(); draw(); } else advance();
      }, duration());
    }
    advance();
  }
  $('Play').onclick = play;
  $('Step').onclick = () => { stop(); if (progress < total()) progress++; draw(false, true); };
  $('Reset').onclick = reset;
  $('RNN').onclick = () => { mode = 'rnn'; reset(); };
  $('Attention').onclick = () => { mode = 'transformer'; reset(); };
  $('Distance').oninput = sentence;
  $('Context').onchange = reset;
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); draw(); } });
  const demo = $('Demo');
  new MutationObserver(() => { if (demo.isConnected && demo.hidden) { stop(); draw(); } }).observe(demo, {attributes:true,attributeFilter:['hidden']});
  motion?.addEventListener?.('change', reset);
  window.openTransformerScene = reset;
  const contextSelect = $('Context');
  const contextPicker = document.createElement('div'); contextPicker.className = 'transformer-context-picker';
  const contextButton = document.createElement('button'); contextButton.id = 'transformerContextButton'; contextButton.type = 'button';
  contextButton.setAttribute('aria-haspopup','listbox'); contextButton.setAttribute('aria-expanded','false'); contextButton.setAttribute('aria-controls','transformerContextMenu');
  contextButton.innerHTML = '<span></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const contextMenu = document.createElement('div'); contextMenu.id = 'transformerContextMenu'; contextMenu.className = 'transformer-context-menu'; contextMenu.hidden = true;
  contextMenu.setAttribute('role','listbox'); contextMenu.setAttribute('aria-label','Attention context');
  const contextOptions = [...contextSelect.options].map(option => {
    const button=document.createElement('button'); button.type='button'; button.textContent=option.textContent; button.dataset.value=option.value;
    button.setAttribute('role','option'); button.tabIndex=-1;
    button.onclick=()=>{contextSelect.value=option.value;contextSelect.dispatchEvent(new Event('change'));closeContextDropdown();contextButton.focus();};
    contextMenu.appendChild(button); return button;
  });
  contextSelect.before(contextPicker); contextPicker.append(contextButton,contextMenu);
  contextSelect.hidden=true; contextSelect.tabIndex=-1; contextSelect.setAttribute('aria-hidden','true');
  $('ContextControl').querySelector('label').htmlFor=contextButton.id;
  function syncContextDropdown(){
    contextButton.querySelector('span').textContent=contextSelect.selectedOptions[0].textContent;
    contextButton.setAttribute('aria-label','Attention context: '+contextSelect.selectedOptions[0].textContent);
    contextOptions.forEach(button=>button.setAttribute('aria-selected',String(button.dataset.value===contextSelect.value)));
  }
  function closeContextDropdown(){contextMenu.hidden=true;contextButton.setAttribute('aria-expanded','false');}
  function openContextDropdown(){contextMenu.hidden=false;contextButton.setAttribute('aria-expanded','true');contextOptions[contextSelect.selectedIndex].focus();}
  contextButton.onclick=()=>contextMenu.hidden?openContextDropdown():closeContextDropdown();
  contextPicker.addEventListener('keydown',event=>{
    if(!['ArrowDown','ArrowUp','Home','End','Escape','Tab'].includes(event.key))return;
    event.stopPropagation();
    if(event.key==='Tab'){closeContextDropdown();return;}
    event.preventDefault();
    if(event.key==='Escape'){closeContextDropdown();contextButton.focus();return;}
    if(contextMenu.hidden){openContextDropdown();return;}
    const current=contextOptions.indexOf(document.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?contextOptions.length-1:(current+(event.key==='ArrowDown'?1:-1)+contextOptions.length)%contextOptions.length;
    contextOptions[next].focus();
  });
  document.addEventListener('click',event=>{if(!contextPicker.contains(event.target))closeContextDropdown();});
  contextPicker.addEventListener('focusout',event=>{if(!contextPicker.contains(event.relatedTarget))closeContextDropdown();});
  sentence();
})();
