/* Scene 3: authentic IDs and a deliberately separate illustrative lookup. */
(function () {
  'use strict';
  const $ = name => document.getElementById('tokenizer' + name);
  const engine = window.llmTokenEngine;
  let result, selected = -1, revision = 0, loading, tokenizer;
  let scanTimer, scanRevision = 0;
  let scanning = false, activeLookup = null, spaceEntries = [];
  const plottedTokens = new Map();
  let lookupVocabulary;
  function stopScan() { clearTimeout(scanTimer); scanRevision++; scanning = false; activeLookup = null; }
  const vectors = new Map();
  const embeddingColors = new Map();
  const embeddingPalette = ['var(--blue)','var(--green)','var(--amber)','var(--purple)','var(--teal)'];
  function embeddingColor(id) {
    if (!embeddingColors.has(id)) embeddingColors.set(id,embeddingPalette[embeddingColors.size % embeddingPalette.length]);
    return embeddingColors.get(id);
  }
  const tip = document.createElement('div');
  tip.className = 'rnn-tooltip'; tip.id = 'tokenizerTooltip'; tip.hidden = true;
  tip.setAttribute('role','tooltip'); $('Demo').append(tip);
  function tooltip(cell,text) {
    cell.setAttribute('aria-describedby',tip.id);
    const show = () => {
      tip.textContent = text; tip.hidden = false;
      const rect = cell.getBoundingClientRect();
      tip.style.left = Math.max(8,Math.min(rect.left,window.innerWidth-tip.offsetWidth-8))+'px';
      tip.style.top = Math.max(8,rect.top-tip.offsetHeight-8)+'px';
    };
    cell.addEventListener('mouseenter',show); cell.addEventListener('focus',show);
    cell.addEventListener('mouseleave',()=>{tip.hidden=true;}); cell.addEventListener('blur',()=>{tip.hidden=true;});
    cell.addEventListener('keydown',e=>{if(e.key==='Escape')tip.hidden=true;});
  }
  function node(tag, text, cls) {
    const el = document.createElement(tag); el.textContent = text;
    if (cls) el.className = cls;
    return el;
  }
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
  function clearSelection() {
    stopScan();
    selected = -1; tip.hidden = true;
    $('Embedding').open = false;
  }
  const label = t => t.text === null ? 'bytes ' + t.bytes.map(b => b.toString(16).padStart(2,'0')).join(' ') : engine.visible(t.text);
  function select(index, open = false) {
    if (!result?.tokens[index]) return;
    selected = index; tip.hidden = true;
    $('Pairs').querySelectorAll('.tokens-tile').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.index) === index)));
    if (open || $('Embedding').open) drawEmbedding();
  }
  async function update() {
    stopScan();
    const input = $('Input');
    input.style.height = 'auto';
    input.style.height = Math.min(160,Math.max(44,input.scrollHeight+2))+'px';
    const version = ++revision, text = $('Input').value;
    const previous = result?.tokens[selected];
    $('Retry').hidden = true; tip.hidden = true;
    try {
      if (!tokenizer) {
        $('Status').textContent = 'Loading the local tokenizer…';
        const loaded = await load();
        if (version !== revision) return;
        tokenizer = loaded;
      }
      result = engine.analyze(text, tokenizer);
      $('Pairs').replaceChildren();
      result.tokens.forEach((t,index) => {
        const pair = node('div','','tokenizer-pair');
        const token = node('button',label(t),'tokens-tile'); token.type = 'button'; token.dataset.index = index;
        token.setAttribute('aria-label',`Token ${index+1}: ${label(t)}`);
        token.setAttribute('aria-pressed','false');
        const id = node('button',String(t.id),'tokens-tile tokenizer-id'); id.type = 'button'; id.dataset.index = index;
        id.setAttribute('aria-label',`Select token ID ${t.id} at position ${index+1}`);
        id.setAttribute('aria-pressed','false');
        pair.onclick = () => select(index,true);
        pair.append(token,id); $('Pairs').append(pair);
      });
      $('Results').hidden = false; $('Completion').hidden = false;
      $('Sequence').textContent = 'Ordered token IDs: [' + result.tokens.map(t => t.id).join(', ') + ']';
      $('Status').textContent = result.tokens.length ? `${result.tokens.length} model tokens. Select a card to look up its embedding. Dots mark spaces; byte tiles show UTF-8 fragments.` : 'No tokens. Enter text or choose an example.';
      // Keep the selected occurrence only if its position and vocabulary entry survive.
      if (previous && result.tokens[selected]?.id === previous.id) select(selected);
      else clearSelection();
    } catch (e) {
      if (version !== revision) return;
      result = null; clearSelection(); $('Pairs').replaceChildren(); $('Sequence').textContent = '';
      $('Status').textContent = e.message; $('Retry').hidden = Boolean(tokenizer);
    }
  }
  // Copied from NLP & RNN Visualizer seededVector fallback for an ungrouped key.
  // These values are illustrative, never weights for a cl100k_base model.
  function illustrative(id) {
    if (!vectors.has(id)) {
      let seed = [...String(id)].reduce((a,c) => a * 31 + c.charCodeAt(0),2166136261) >>> 0;
      vectors.set(id, Array.from({length:50}, (_,i) => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return ((seed / 4294967296) * 2 - 1) * .55 + 'x'.charCodeAt(0) % 7 * .015 * Math.sin(i + 1);
      }));
    }
    return vectors.get(id);
  }
  function drawSemanticSpace(entries, selectedToken) {
    const svg = $('SemanticSpace'); svg.replaceChildren();
    const make = (tag, attributes, text) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg',tag);
      Object.entries(attributes).forEach(([key,value]) => el.setAttribute(key,value));
      if (text) el.textContent = text;
      svg.append(el); return el;
    };
    make('title',{},'Semantic space: illustrative three-dimensional embedding view');
    make('desc',{},'A schematic projection of three illustrative vector values. Distances do not show learned semantic relationships. The selected token appears after lookup.');
    // Isometric cube; use three of the illustrative vector's 50 dimensions.
    const project = values => {
      const [x,y,z] = values.slice(0,3).map(v => Math.max(0,Math.min(1,(v+.65)/1.3)));
      return [155+120*x-95*y,175-32*x-48*y-80*z];
    };
    make('path',{d:'M155 175 275 143 180 95 60 127Z M155 95 275 63 180 15 60 47Z M155 175V95 M275 143V63 M60 127V47 M180 95V15',class:'tokenizer-space-grid'});
    make('path',{d:'M155 175 275 143 M155 175 60 127 M155 175V95',class:'tokenizer-space-axes'});
    entries.filter(({part}) => part.id !== selectedToken?.id && !plottedTokens.has(part.id)).forEach(({part}) => {
      const [cx,cy] = project(illustrative(part.id));
      make('circle',{cx,cy,r:3,fill:embeddingColor(part.id),opacity:.3});
    });
    const points = new Map(plottedTokens);
    if (selectedToken) points.set(selectedToken.id,selectedToken);
    points.forEach(part => {
      const [cx,cy] = project(illustrative(part.id));
      const active = part.id === selectedToken?.id;
      const group = make('g',{'data-token-id':part.id,class:'tokenizer-semantic-point',visibility:plottedTokens.has(part.id)?'visible':'hidden',...(active?{id:'tokenizerSemanticPoint'}:{})});
      const add = (tag,attrs,text) => {const child=make(tag,attrs,text);group.append(child);};
      add('circle',{cx,cy,r:10,fill:embeddingColor(part.id),opacity:.15});
      add('circle',{cx,cy,r:5,fill:embeddingColor(part.id),stroke:'white','stroke-width':1.7});
      add('text',{x:cx+12,y:cy-10,fill:'var(--green-dark)'},label(part));
    });
  }
  function drawEmbedding(requested = result?.tokens[selected]) {
    if (selected < 0) return;
    if (scanning) {
      if (requested.id === activeLookup.id) return;
      plottedTokens.set(activeLookup.id,activeLookup);
      stopScan();
    }
    scanning = true; activeLookup = requested;
    const scan = scanRevision;
    const t = requested; $('Embedding').open = true;
    $('Table').replaceChildren();
    // Real vocabulary entries provide context for the illustrative lookup animation.
    // Actual models address a row directly; this scan is a teaching cue.
    if (!lookupVocabulary) lookupVocabulary = engine.analyze('The student reads a book and learns about language. A teacher walks through the city with friends. Music art science history water light garden morning evening happy quiet bright small large world.',tokenizer).tokens;
    const current = [...new Map(result.tokens.map((part,index) => [part.id,{part,index}])).values()];
    const currentIds = new Set(current.map(({part}) => part.id));
    const extra = [...new Map(lookupVocabulary.map(part => [part.id,part])).values()].filter(part => !currentIds.has(part.id)).slice(0,18).map(part => ({part,index:-1}));
    const entries = [...extra,...current];
    spaceEntries = entries;
    entries.forEach(({part}) => embeddingColor(part.id));
    drawSemanticSpace(entries,t);
    entries.forEach(({part,index}) => {
      const isSelected = part.id === t.id;
      const row = node(index < 0 || isSelected ? 'div' : 'button','','tokenizer-table-row');
      if (index >= 0 && !isSelected) row.type = 'button';
      row.dataset.id = part.id;
      if (index >= 0) row.setAttribute('aria-pressed',String(part.id === t.id));
      row.setAttribute('aria-label',`${index >= 0 ? 'Select ' : ''}${label(part)}, token ID ${part.id}`);
      const heading = node('strong',`ID ${part.id} · ${label(part)}`);
      row.append(heading);
      const values = node('span','','row-values');
      if (isSelected) {row.id = 'tokenizerSelectedRow';heading.id = 'tokenizerLookup';values.id = 'tokenizerVector';values.setAttribute('role','group');values.setAttribute('aria-label','Selected illustrative embedding, 50 dimensions');}
      if (!isSelected) illustrative(part.id).forEach(value => {
        const cell = node('i','');
        cell.style.background = `color-mix(in srgb,${embeddingColor(part.id)} ${Math.round(20+65*(Math.max(-1,Math.min(1,value))+1)/2)}%,#eef2ef)`;
        values.append(cell);
      });
      row.append(values); if (index >= 0 && !isSelected) row.onclick = () => select(index); $('Table').append(row);
    });
    $('Vector').replaceChildren();
    illustrative(t.id).forEach((value,index) => {
      const cell = node('i','','pattern-cell');
      // Preserve the NLP tool's value shading within each token's stable palette.
      cell.style.setProperty('--cell',embeddingColor(t.id));
      cell.style.setProperty('--strength',Math.round(20+65*(Math.max(-1,Math.min(1,value))+1)/2)+'%');
      const text = `Illustrative embedding value ${index+1}: ${value.toFixed(2)}`;
      cell.tabIndex = index === 0 ? 0 : -1; cell.setAttribute('aria-label',text); tooltip(cell,text);
      cell.onclick = () => cell.focus();
      cell.onkeydown = e => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
        e.preventDefault(); e.stopPropagation();
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? 49 : Math.max(0,Math.min(49,index+(e.key==='ArrowRight'?1:-1)));
        cell.tabIndex=-1; $('Vector').children[next].tabIndex=0; $('Vector').children[next].focus();
      };
      $('Vector').append(cell);
    });
    const rows = [...$('Table').children], target = entries.findIndex(({part}) => part.id === t.id);
    const follow = index => {
      const table = $('Table');
      const viewport = $('TableViewport');
      const offset = Math.max(0,Math.min(table.scrollHeight-viewport.clientHeight,rows[index].offsetTop-viewport.clientHeight/2+rows[index].offsetHeight/2));
      table.style.transform = `translateY(-${offset}px)`;
    };
    $('Table').style.transition = 'none';
    $('Table').style.transform = 'translateY(0)';
    void $('Table').offsetHeight;
    $('Table').style.transition = '';
    const finish = () => {
      if (scan !== scanRevision) return;
      rows.forEach((row,index) => {
        row.classList.remove('scanning'); row.classList.toggle('selected',index === target);
      });

      $('SemanticPoint').setAttribute('visibility','visible');
      $('SemanticPoint').classList.add('rendered');
      plottedTokens.set(t.id,t);
      follow(target);
      scanning = false; activeLookup = null;
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
    let cursor = 0;
    const tick = () => {
      if (scan !== scanRevision) return;
      rows.forEach((row,index) => row.classList.toggle('scanning',index === cursor));
      follow(cursor);
      if (cursor === target) { scanTimer = setTimeout(finish,400); return; }
      cursor++; scanTimer = setTimeout(tick,Math.min(140,2800 / (target + 1)));
    };
    tick();
  };
  const picker = node('div','','tokenizer-picker');
  const pickerButton = node('button','','tokenizer-picker-button');
  pickerButton.id = 'tokenizerPickerButton'; pickerButton.type = 'button';
  pickerButton.setAttribute('aria-haspopup','listbox'); pickerButton.setAttribute('aria-expanded','false');
  pickerButton.setAttribute('aria-controls','tokenizerPickerMenu');
  const pickerMenu = node('div','','tokenizer-picker-menu');
  pickerMenu.id = 'tokenizerPickerMenu'; pickerMenu.hidden = true;
  pickerMenu.setAttribute('role','listbox'); pickerMenu.setAttribute('aria-label','Try an example');
  $('Preset').before(picker); picker.append(pickerButton,pickerMenu); $('Preset').hidden = true;
  document.querySelector('label[for="tokenizerPreset"]').htmlFor = pickerButton.id;
  function closePicker(focus=false) {
    pickerMenu.hidden = true; pickerButton.setAttribute('aria-expanded','false');
    if (focus) pickerButton.focus();
  }
  function syncPicker() {
    pickerButton.textContent = $('Preset').options[$('Preset').selectedIndex].textContent;
    pickerButton.setAttribute('aria-label','Try an example: '+pickerButton.textContent);
    [...pickerMenu.children].forEach((option,index) => option.setAttribute('aria-selected',String(index === $('Preset').selectedIndex)));
  }
  [...$('Preset').options].forEach((option,index) => {
    const choice = node('button',option.textContent); choice.type = 'button'; choice.tabIndex = -1;
    choice.setAttribute('role','option');
    choice.onclick = () => {
      $('Preset').selectedIndex = index; $('Preset').dispatchEvent(new Event('change')); closePicker(true);
    };
    pickerMenu.append(choice);
  });
  function openPicker() {
    pickerMenu.hidden = false; pickerButton.setAttribute('aria-expanded','true');
    pickerMenu.children[$('Preset').selectedIndex].focus();
  }
  pickerButton.onclick = () => pickerMenu.hidden ? openPicker() : closePicker();
  picker.addEventListener('keydown',event => {
    if (['ArrowDown','ArrowUp','Home','End','Escape'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Escape') { closePicker(true); return; }
      if (pickerMenu.hidden) { openPicker(); return; }
      const options = [...pickerMenu.children], index = options.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length-1 : (index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;
      options[next].focus();
    }
    if (event.key === 'Tab') closePicker();
  });
  document.addEventListener('click',event => {if (!picker.contains(event.target)) closePicker();});
  $('Preset').onchange = () => { syncPicker(); $('Input').value = $('Preset').value; update(); };
  $('Input').oninput = update;
  $('Retry').onclick = update;
  function toggleEmbedding() {
    const open = !$('Embedding').open;
    $('Embedding').open = open;
    tip.hidden = true;
    if (open) drawEmbedding();
    else stopScan();
  };
  $('EmbeddingSummary').onclick = event => {
    if (event.target.closest('button')) return;
    event.preventDefault();
    if (selected < 0 && result?.tokens.length) select(0);
    if (selected >= 0) toggleEmbedding();
  };
  $('Clear').onclick = event => {
    event.preventDefault(); event.stopPropagation(); stopScan(); plottedTokens.clear(); tip.hidden = true;
    selected = -1;
    $('Pairs').querySelectorAll('[aria-pressed]').forEach(button => button.setAttribute('aria-pressed','false'));
    $('Table').querySelectorAll('.scanning,.selected').forEach(row => row.classList.remove('scanning','selected'));
    drawSemanticSpace(spaceEntries,null);
  };
  $('Reset').onclick = () => { plottedTokens.clear(); $('Preset').selectedIndex = 0; syncPicker(); closePicker(); $('Input').value = 'New Haven pizza'; clearSelection(); $('Embedding').querySelector('details').open = false; update(); };
  syncPicker();
  update();
})();
