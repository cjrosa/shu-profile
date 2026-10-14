/* Illustrative pieces stay independent of the authentic tokenizer. */
(function() {
  'use strict';
  const $ = id => document.getElementById('subwords' + id);
  const scenarios = {
    reuse: {pieces:['dog','s','house','cat'], examples:[['dog'],['dog','s'],['dog','house'],['cat'],['cat','s']], prompt:'Can you build two different words using at least one shared vocabulary piece?'},
    long: {pieces:['un','believ','able'], examples:[['believ','able'],['un','believ','able']], prompt:'Can you build unbelievable? Join un + believ + able. Pieces join exactly, without spelling changes.'},
    own: {pieces:['dog','s','house','cat','un','believ','able','play','er','ing'], examples:[], prompt:'Combine reusable pieces into a new sequence, then keep it. It need not be a dictionary word.'}
  };
  let pieces = [], saved = new Map(), explored = new Map(), tokenizer, loading, revision = 0, complete = false;
  let editing = null;
  let selectedWord = null;
  const comparisons = new Map();
  function updateSelection() {
    if (!saved.has(selectedWord)) selectedWord=null;
    [...$('History').children].forEach(card=>{
      const active=card.dataset.word===selectedWord;
      card.classList.toggle('subwords-selected',active);
      card.querySelector('.subwords-select-word').setAttribute('aria-pressed',String(active));
      const toggle=card.querySelector('.subwords-expand');
      toggle.setAttribute('aria-expanded',String(active));
      toggle.setAttribute('aria-label',`${active?'Collapse':'Expand'} comparison for ${card.dataset.word}`);
      if(active)card.append($('Comparison'));
      card.setAttribute('aria-label',`Kept construction: ${card.dataset.word}${active ? ', selected' : ''}`);
    });
    $('Comparison').hidden=selectedWord===null;
    if(selectedWord===null){$('History').after($('Comparison'));$('ComparisonText').textContent='';return;}
    const entry=saved.get(selectedWord), result=comparisons.get(selectedWord);
    const teaching=`${entry.length} teaching ${entry.length===1?'piece':'pieces'}`;
    if(!result){$('ComparisonText').textContent=`${selectedWord}: ${teaching}. Waiting for real tokenizer output.`;return;}
    if(result.error){$('ComparisonText').textContent=`${selectedWord}: ${teaching}. Real tokens are unavailable; use Retry tokenizer in this row.`;return;}
    const count=result.tokens.length;
    let explanation;
    if(entry.length!==count) explanation=`You used ${teaching}, but the real tokenizer represents this text as ${count} ${count===1?'token':'tokens'}.`;
    else {
      let offset=0;
      const encoder=new TextEncoder();
      const match=entry.every((piece,index)=>{offset+=encoder.encode(piece).length;return offset===result.tokens[index].end;});
      explanation=match ? count===1 ? `The teaching example and real tokenizer both use one piece for "${selectedWord}."` : 'The counts and boundaries happen to match.' : 'The counts match, but the boundaries differ: the real tokenizer splits the text at different positions.';
    }
    $('ComparisonText').textContent=`${selectedWord} — Teaching pieces: ${entry.length} · Real tokens: ${count}. ${explanation}`;
  }
  function selectWord(word) {selectedWord=selectedWord===word?null:word;updateSelection();}
  const scenario = () => scenarios[$('Preset').value];
  function node(tag, text, className) {
    const el = document.createElement(tag); el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  let dragged = null, insertion = null;
  const dropZone = node('span','Drop here','subwords-drop-zone');
  dropZone.setAttribute('aria-hidden','true');
  function endDrag() {
    dragged = null; insertion = null; dropZone.remove();
    $('Pieces').querySelectorAll('.dragging').forEach(el=>el.classList.remove('dragging'));
  }
  function showInsertion(boundary) {
    // Both boundaries beside the source would leave it in the same position.
    if (boundary === dragged || boundary === dragged + 1) {
      insertion = null; dropZone.remove(); return;
    }
    insertion = boundary;
    const tiles = [...$('Pieces').querySelectorAll('.subwords-editable-piece')];
    $('Pieces').insertBefore(dropZone,tiles[boundary] || null);
  }
  $('Pieces').addEventListener('dragover',event=>{
    if (dragged === null) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'move';
    if (event.target === dropZone) return;
    const tiles = [...$('Pieces').querySelectorAll('.subwords-editable-piece')];
    const target = event.target.closest('.subwords-editable-piece');
    if (target) {
      const rect = target.getBoundingClientRect();
      showInsertion(tiles.indexOf(target) + (event.clientX >= rect.left + rect.width/2 ? 1 : 0));
    } else {
      // Include whitespace between tiles and wrapped rows as insertion targets.
      let boundary = tiles.length;
      for (let i=0;i<tiles.length;i++) {
        const rect = tiles[i].getBoundingClientRect();
        if (event.clientY < rect.top || (event.clientY <= rect.bottom && event.clientX < rect.left + rect.width/2)) { boundary=i; break; }
      }
      showInsertion(boundary);
    }
  });
  $('Pieces').addEventListener('dragleave',event=>{
    if (!$('Pieces').contains(event.relatedTarget)) { insertion=null; dropZone.remove(); }
  });
  $('Pieces').addEventListener('drop',event=>{
    if (dragged === null || insertion === null) return;
    event.preventDefault();
    const from=dragged, to=insertion-(from<insertion ? 1 : 0);
    endDrag(); movePiece(from,to);
  });
  function focusPiece(index) {
    const tile = $('Pieces').children[Math.min(index,pieces.length-1)];
    (tile?.querySelector('.subwords-piece-handle') || $('Vocabulary').querySelector('[data-piece]')).focus();
  }
  function movePiece(from,to) {
    if (!Number.isInteger(from) || from < 0 || from >= pieces.length || to < 0 || to >= pieces.length || from === to) return;
    pieces.splice(to,0,pieces.splice(from,1)[0]);
    render(); focusPiece(to);
  }
  function drawPieces() {
    endDrag();
    $('Pieces').replaceChildren(...pieces.map((piece,index) => {
      const tile = node('span','','subwords-editable-piece');
      const handle = node('button',piece,'tokens-tile subwords-piece-handle');
      handle.type = 'button'; handle.draggable = true;
      handle.setAttribute('aria-label',`${piece}, piece ${index+1} of ${pieces.length}. Use Left or Right to move; Delete to remove.`);
      const remove = node('button','×','subwords-piece-remove'); remove.type = 'button';
      remove.setAttribute('aria-label',`Remove ${piece}, piece ${index+1}`);
      function deletePiece() { pieces.splice(index,1); render(); focusPiece(index); }
      remove.addEventListener('click',deletePiece);
      handle.addEventListener('keydown',event=>{
        if (['ArrowLeft','ArrowRight','Delete','Backspace'].includes(event.key)) {
          event.preventDefault();
          if (event.key === 'Delete' || event.key === 'Backspace') deletePiece();
          else movePiece(index,index+(event.key === 'ArrowLeft' ? -1 : 1));
        }
      });
      handle.addEventListener('dragstart',event=>{
        dragged = index; event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain',String(index)); tile.classList.add('dragging');
      });
      handle.addEventListener('dragend',endDrag);
      tile.append(handle,remove); return tile;
    }));
  }
  function remember() {
    if (pieces.length) saved.set(pieces.join(''), [...pieces]);
  }
  function alreadyKept() {
    return [...saved].some(([key,entry]) => key !== editing && entry.length === pieces.length && entry.every((piece,index) => piece === pieces[index]));
  }
  function updateSave() {
    const duplicate = pieces.length > 0 && alreadyKept();
    $('Save').disabled = !pieces.length || duplicate;
    $('Save').title = duplicate ? 'This construction is already kept' : editing !== null ? 'Save changes' : 'Keep construction';
    $('Save').setAttribute('aria-label',$('Save').title);
    $('Save').setAttribute('data-tooltip',$('Save').title);
    $('Save').removeAttribute('title');
    $('Cancel').hidden = !pieces.length && editing === null;
    $('ActiveCard').classList.toggle('subwords-is-editing',editing !== null);
    $('EditingLabel').hidden = editing === null;
    $('EditingLabel').textContent = editing !== null ? `Editing “${editing}” — save to update this kept construction, or cancel to leave it unchanged.` : '';
  }
  function savedHeading(text,kind) {
    const heading=node('h3','','subwords-column-label');
    const paths=kind === 'teaching' ? '<rect x="3" y="6" width="7" height="12" rx="2"/><rect x="14" y="6" width="7" height="12" rx="2"/>' : kind === 'word' ? '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 10h10M7 14h6"/>' : '<rect x="2" y="7" width="6" height="10" rx="2"/><rect x="10" y="7" width="5" height="10" rx="2"/><rect x="17" y="7" width="5" height="10" rx="2"/>';
    heading.innerHTML='<svg class="subwords-'+kind+'-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+paths+'</svg>';
    heading.append(document.createTextNode(text));return heading;
  }
  function drawSaved() {
    const usage=new Map();
    saved.forEach(entry=>new Set(entry).forEach(piece=>usage.set(piece,(usage.get(piece)||0)+1)));
    const shared=[...usage].filter(([,count])=>count>1).sort((a,b)=>b[1]-a[1]);
    const totals=new Map();
    saved.forEach(entry=>entry.forEach(piece=>totals.set(piece,(totals.get(piece)||0)+1)));
    [...$('Vocabulary').querySelectorAll('[data-piece]')].forEach(button=>{
      const piece=button.dataset.piece,count=totals.get(piece)||0;
      const badge=button.parentElement.querySelector('.subwords-usage-badge');
      badge.setAttribute('aria-label','Highlight '+count+' uses of '+piece+' in kept constructions');
      badge.setAttribute('data-tooltip','Highlight '+count+' uses in kept constructions');
      badge.hidden=count===0;badge.textContent=count;
      button.setAttribute('data-tooltip',count+' uses in kept constructions');
      button.setAttribute('aria-label','Add '+piece+'; '+count+' uses in kept constructions');
    });
    $('ShowAll').disabled = scenario().examples.length === 0;
    $('ShowAll').setAttribute('data-tooltip',scenario().examples.length ? 'Replace current constructions with all prepared examples' : 'No prepared examples in Create Your Own');
    $('ReuseNote').hidden=!shared.length;
    $('ReuseText').textContent=shared.length ? 'Piece reuse: '+shared.map(([piece,count])=>JSON.stringify(piece)+' appears in '+count+' kept constructions').join('; ')+'. You built different sequences by reusing the same vocabulary pieces. Highlighted pieces are shared across cards.' : '';
    // Preserve the shared comparison element before rebuilding saved rows.
    $('History').after($('Comparison'));
    $('History').replaceChildren();
    if(saved.size){
      const headings=node('div','','subwords-kept-headings');
      headings.append(savedHeading('Teaching pieces','teaching'),savedHeading('Kept word','word'),savedHeading('Real Tokens','model'));
      $('KeptHeadings').replaceChildren(headings);$('KeptHeadings').hidden=false;
    }else{$('KeptHeadings').replaceChildren();$('KeptHeadings').hidden=true;}
    saved.forEach((entry,word)=>{
      const card=node('article','','subwords-construction-card subwords-saved-card');
      card.dataset.word=word;
      card.tabIndex=0;
      card.setAttribute('aria-describedby','subwordsSelectionHelp');
      card.addEventListener('click',event=>{
        if(event.target.closest('button,select,a'))return;
        selectWord(word);
      });
      card.addEventListener('keydown',event=>{
        if(event.target===card && (event.key==='Enter'||event.key===' ')){event.preventDefault();selectWord(word);}
      });
      card.setAttribute('aria-label',`Kept construction: ${word}`);
      if (word === editing) card.setAttribute('aria-current','true');
      const teaching=node('div','','subwords-teaching-column');
      teaching.setAttribute('aria-label','Teaching pieces');
      const tiles=node('div','','tokens-tiles');
      const feedback=node('p','','tokens-note'); feedback.setAttribute('role','status');
      function commit(next,focusIndex=0) {
        const nextWord=next.join('');
        if (nextWord !== word && saved.has(nextWord)) { feedback.textContent='That construction is already kept. Choose a different sequence.'; return; }
        const row=[...saved.keys()].indexOf(word);
        if(selectedWord===word)selectedWord=next.length?nextWord:null;
        if (next.length) saved=new Map([...saved].map(([key,value])=>key===word ? [nextWord,next] : [key,value]));
        else saved.delete(word);
        progress();
        const updated=$('History').children[Math.min(row,saved.size-1)];
        const controls=updated?.querySelectorAll('.subwords-piece-handle');
        (controls?.[Math.min(focusIndex,controls.length-1)] || $('Vocabulary').querySelector('[data-piece]')).focus();
      }
      let source=null,boundary=null;
      const gap=node('span','Drop here','subwords-drop-zone');gap.setAttribute('aria-hidden','true');
      function clearDrag() { source=null;boundary=null;gap.remove();tiles.querySelectorAll('.dragging').forEach(el=>el.classList.remove('dragging')); }
      entry.forEach((piece,index)=>{
        const tile=node('span','','subwords-editable-piece');
        const handle=node('button',piece,'tokens-tile subwords-piece-handle');handle.type='button';handle.draggable=true;
        handle.setAttribute('aria-label',piece+', piece '+(index+1)+'. Left/Right to move; Delete to remove.');
        if(usage.get(piece)>1){handle.classList.add('subwords-shared-piece');handle.setAttribute('data-tooltip','Reused in '+usage.get(piece)+' kept constructions');handle.setAttribute('aria-label',handle.getAttribute('aria-label')+' Reused in '+usage.get(piece)+' kept constructions.');}
        const erase=node('button','\u00d7','subwords-piece-remove');erase.type='button';erase.setAttribute('aria-label','Remove '+piece+', piece '+(index+1));
        const deletePiece=()=>commit(entry.filter((_,i)=>i!==index),index);
        erase.addEventListener('click',deletePiece);
        handle.addEventListener('keydown',event=>{
          if (['ArrowLeft','ArrowRight','Delete','Backspace'].includes(event.key)) {
            event.preventDefault();
            if (event.key==='Delete'||event.key==='Backspace') return deletePiece();
            const to=index+(event.key==='ArrowLeft'?-1:1);
            if(to<0||to>=entry.length)return;
            const next=[...entry];next.splice(to,0,next.splice(index,1)[0]);commit(next,to);
          }
        });
        handle.addEventListener('dragstart',event=>{source=index;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(index));tile.classList.add('dragging');});
        handle.addEventListener('dragend',clearDrag);
        tile.append(handle,erase);tiles.append(tile);
      });
      tiles.addEventListener('dragover',event=>{
        if(source===null)return;event.preventDefault();event.dataTransfer.dropEffect='move';
        if(event.target===gap)return;
        const all=[...tiles.querySelectorAll('.subwords-editable-piece')];
        let at=all.length;
        for(let i=0;i<all.length;i++){const rect=all[i].getBoundingClientRect();if(event.clientY<rect.top||(event.clientY<=rect.bottom&&event.clientX<rect.left+rect.width/2)){at=i;break;}}
        if(at===source||at===source+1){boundary=null;gap.remove();return;}
        boundary=at;tiles.insertBefore(gap,all[at]||null);
      });
      tiles.addEventListener('dragleave',event=>{if(!tiles.contains(event.relatedTarget)){boundary=null;gap.remove();}});
      tiles.addEventListener('drop',event=>{
        if(source===null||boundary===null)return;event.preventDefault();
        const to=boundary-(source<boundary?1:0),next=[...entry];next.splice(to,0,next.splice(source,1)[0]);clearDrag();commit(next,to);
      });
      const chooser=node('div','','subwords-piece-chooser');chooser.hidden=true;
      chooser.setAttribute('role','group');chooser.setAttribute('aria-label','Choose a teaching piece');
      let insertionAt=0, opener=null;
      const slots=[];
      function closeChooser(returnFocus=false) {
        chooser.hidden=true;opener?.setAttribute('aria-expanded','false');
        if(returnFocus)opener?.focus();
      }
      const existing=[...tiles.children];
      for(let at=0;at<=entry.length;at++) {
        const slot=node('button','','subwords-insert-piece');slot.type='button';slot.disabled=entry.length>=40;
        slot.setAttribute('aria-label','Insert piece '+(at===0?'at beginning':at===entry.length?'at end':'between '+entry[at-1]+' and '+entry[at]));
        slot.setAttribute('aria-expanded','false');
        slot.innerHTML='<svg viewBox="0 0 20 36" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true" focusable="false"><path d="M10 1v8m0 18v8"/><circle cx="10" cy="18" r="8"/><path d="M6 18h8m-4-4v8"/></svg>';
        slot.addEventListener('click',()=>{
          const toggle=opener===slot&&!chooser.hidden;closeChooser();if(toggle)return;
          insertionAt=at;opener=slot;slot.setAttribute('aria-expanded','true');chooser.hidden=false;chooser.firstElementChild.focus();
        });
        slots.push(slot);tiles.insertBefore(slot,existing[at]||null);
      }
      scenario().pieces.forEach(piece=>{
        const choice=node('button',piece,'tokens-tile');choice.type='button';
        choice.addEventListener('click',()=>{const next=[...entry];next.splice(insertionAt,0,piece);closeChooser();commit(next,insertionAt);});chooser.append(choice);
      });
      chooser.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeChooser(true);}});
      card.addEventListener('focusout',event=>{if(event.relatedTarget&&!card.contains(event.relatedTarget))closeChooser();});
      teaching.append(tiles,chooser,feedback);

      const result=node('div','','subwords-word-column');
      result.setAttribute('aria-label','Kept word');
      const select=node('button',word,'subwords-saved-word subwords-select-word');select.type='button';
      select.setAttribute('aria-label',`Compare teaching pieces and real tokens for ${word}`);
      select.setAttribute('aria-pressed','false');
      select.addEventListener('click',()=>selectWord(word));
      result.append(select);
      if (word === editing) result.append(node('p','Editing in builder above','subwords-editing-badge'));
      const model=node('div','','subwords-saved-model');
      model.setAttribute('aria-label','Real Tokens');
      const output=node('div','','tokens-tiles'); model.append(output);
      const status=node('p','Updating real tokens…','tokens-note');model.append(status);
      const actions=node('div','','tokens-toolbar subwords-saved-actions');
      const remove=node('button','');remove.type='button';
      const icon = paths => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + paths + '</svg>';
      remove.innerHTML=icon('<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>');
      remove.setAttribute('data-tooltip','Remove construction');
      remove.setAttribute('aria-label',`Remove kept construction ${word}`);
      remove.addEventListener('click',()=>{
        saved.delete(word);
        if (editing === word) { editing=null; pieces=[]; }
        render(); $('Vocabulary').querySelector('[data-piece]').focus();
      });
      const expand=node('button','','subwords-expand');expand.type='button';
      expand.innerHTML=icon('<path d="m6 9 6 6 6-6"/>');
      expand.setAttribute('aria-controls','subwordsComparison');
      expand.setAttribute('aria-expanded','false');
      expand.addEventListener('click',()=>selectWord(word));
      actions.append(remove,expand);card.append(teaching,result,model,actions);$('History').append(card);
      async function tokenize() {
        try {
          const real=await loadTokenizer();
          if (!card.isConnected) return;
          const analysis=window.llmTokenEngine.analyze(word,real);
          comparisons.set(word,analysis);
          analysis.tokens.forEach(part=>output.append(node('span',part.text === null ? `bytes ${part.bytes.map(b=>b.toString(16).padStart(2,'0')).join(' ')}` : window.llmTokenEngine.visible(part.text),'tokens-tile')));
          status.remove();
          updateSelection();
        } catch (_) {
          if (!card.isConnected) return;
          comparisons.set(word,{error:true});updateSelection();
          status.textContent='Tokenizer unavailable. ';
          const retry=node('button','Retry tokenizer');retry.type='button';
          retry.addEventListener('click',()=>{ comparisons.delete(word);updateSelection();status.textContent='Updating real tokens…'; tokenize(); });status.append(retry);
        }
      }
      tokenize();
    });
    updateSelection();
  }
  function progress() {
    $('SelectPrompt').hidden = saved.size > 0;
    const entries = [...new Map([...explored,...saved]).values()];
    const reused = entries.some((a,i) => entries.slice(i+1).some(b => a.some(piece => b.includes(piece))));
    if (reused) {
      complete = true;
      $('DiscoveryText').textContent = 'A limited collection of reusable pieces can represent many different words.';
    } else if ($('Preset').value === 'long' && (saved.has('unbelievable') || explored.has('unbelievable'))) {
      complete = true;
      $('DiscoveryText').textContent = 'Longer words can be represented through combinations of smaller pieces.';
    } else if ($('Preset').value === 'own' && entries.some(a => a.length >= 2)) {
      complete = true;
      $('DiscoveryText').textContent = 'Reusable pieces can represent sequences that were not individually stored as complete words.';
    }
    $('Discovery').hidden = !complete;
    drawSaved();
    updateSave();
  }
  function render() {
    revision++;
    $('ActiveCard').hidden = pieces.length === 0 && editing === null;
    $('Model').replaceChildren(); $('ModelCount').textContent = '';
    $('Retry').hidden = true;
    $('Status').textContent = '';
    drawPieces();
    $('Word').textContent = pieces.join('') || 'Select a piece to begin.';
    Array.from($('Vocabulary').querySelectorAll('[data-piece]')).forEach(button => {
      const count = pieces.filter(piece => piece === button.dataset.piece).length;
      button.classList.toggle('related',count > 0);
      button.setAttribute('aria-label',`Add ${button.dataset.piece}${count ? `; used ${count} time${count === 1 ? '' : 's'}` : ''}`);
      button.disabled = pieces.length >= 40;
    });
    if (pieces.length >= 40) $('Status').textContent = '40-piece limit reached. Remove a piece or clear the construction to continue.';
    // Recognized teaching words count only after the student actually builds them.
    if (scenario().examples.some(example => example.join('') === pieces.join(''))) explored.set(pieces.join(''),[...pieces]);
    progress();
    updateRealTokens();
  }
  function reset() {
    selectedWord=null;comparisons.clear();
    editing = null;
    pieces = []; saved = new Map(); explored = new Map(); complete = false;
    $('Prompt').textContent = scenario().prompt;
    $('VocabularyCount').textContent = `(${scenario().pieces.length} entries)`;
    $('Vocabulary').replaceChildren(...scenario().pieces.map(piece => {
      const button = node('button',piece,'tokens-tile'); button.type = 'button'; button.dataset.piece = piece;
      const wrap=node('span','','subwords-vocabulary-piece');
      const badge=node('button','','subwords-usage-badge');badge.type='button';
      button.addEventListener('click',()=>{if(pieces.length<40){pieces.push(piece);render();}});
      badge.addEventListener('click',()=>{
        [...saved.values()].forEach((entry,index)=>{
          if(entry.includes(piece)) {
            const card=$('History').children[index];card.classList.remove('subwords-reuse-flash');
            void card.offsetWidth;card.classList.add('subwords-reuse-flash');
          }
        });
      });
      wrap.append(button,badge);
      return wrap;
    }));
    render();
  }
  function loadTokenizer() {
    if (tokenizer) return Promise.resolve(tokenizer);
    if (loading) return loading;
    loading = new Promise((resolve,reject) => {
      const ready = () => { try { tokenizer = window.LLMTokenizerVendor.create(); resolve(tokenizer); } catch (error) { reject(error); } };
      if (window.LLMTokenizerVendor) return ready();
      const script = document.createElement('script'); script.src = '../assets/js/vendor/cl100k-tokenizer.js';
      script.onload = ready; script.onerror = () => { script.remove(); reject(new Error('The local tokenizer could not load. Select Retry tokenizer to retry.')); };
      document.head.append(script);
    }).catch(error => { loading = null; throw error; });
    return loading;
  }
  async function updateRealTokens() {
    if (!pieces.length) { $('TokenStatus').textContent = 'Add a teaching piece to see real tokens here.'; return; }
    const request = revision, text = pieces.join('');
    $('Retry').hidden = true;
    $('TokenStatus').textContent = 'Updating real tokens…';
    try {
      const real = await loadTokenizer();
      if (request !== revision) return;
      const result = window.llmTokenEngine.analyze(text,real);
      $('Model').replaceChildren(...result.tokens.map((part,index) => {
        const label = part.text === null ? `bytes ${part.bytes.map(b=>b.toString(16).padStart(2,'0')).join(' ')}` : window.llmTokenEngine.visible(part.text);
        const tile = node('span',label,'tokens-tile');
        tile.setAttribute('aria-label',`Token ${index+1}: ${part.text === null ? label : JSON.stringify(part.text)}`);
        return tile;
      }));
      $('ModelCount').textContent = result.tokens.length;
      $('TokenStatus').textContent = '';
    } catch (error) { if (request === revision) { $('TokenStatus').textContent = error.message; $('Retry').hidden = false; } }
  }
  $('Retry').addEventListener('click',updateRealTokens);
  $('Save').addEventListener('click',()=>{
    if (!pieces.length || alreadyKept()) return;
    if (editing !== null) {
      const word=pieces.join('');
      if (word !== editing && saved.has(word)) return;
      saved=new Map([...saved].map(([key,entry])=>key===editing ? [word,[...pieces]] : [key,entry]));

    } else {
      remember();
    }
    editing=null; pieces=[]; render(); $('Vocabulary').querySelector('[data-piece]').focus();
  });
  $('Cancel').addEventListener('click',()=>{
    editing=null; pieces=[]; render();
    $('Vocabulary').querySelector('[data-piece]').focus();
  });
  $('ShowAll').addEventListener('click',()=>{
    if (!scenario().examples.length) return;
    pieces=[]; editing=null;
    selectedWord=null;
    saved=new Map(scenario().examples.map(entry=>[entry.join(''),[...entry]]));
    render();
  });
  $('Reset').addEventListener('click',reset);
  $('Preset').addEventListener('change',reset);
  reset();
})();
