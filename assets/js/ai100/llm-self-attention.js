/* One authored teaching head, not trained-model inference. See docs/llm-self-attention.md. */
(function () {
  'use strict';
  const examples = [
    {name:'Pronoun Context', text:'The team got pizzas and they were cold.', target:5, seed:1, rows:{5:[5,15,10,45,5,20],7:[3,7,5,40,5,15,10,15]}},
    {name:'Distant Reference', text:'Marie arrived at the conference after a long flight. She was exhausted.', target:9, seed:3, rows:{9:[40,10,3,3,5,3,3,5,13,15]}},
    {name:'Word Relationships', text:'The dog chased the ball.', target:2, seed:5, rows:{2:[10,60,30],4:[5,20,40,10,25]}},
    {name:'Longer Context', text:'Marie arrived at the conference after a long flight and a delayed train. She was exhausted.', target:13, seed:7, rows:{}}
  ];
  // Example-specific fixed rows above; remaining targets use positive integer
  // teaching scores 1..9. Only positions 0..target are normalized. No UI edits.
  function distribution(exampleIndex, target) {
    const example = examples[exampleIndex], words = example.text.split(' ');
    if (!Number.isInteger(target) || target < 0 || target >= words.length) throw new RangeError('Invalid target');
    const scores = example.rows[target] || Array.from({length:target+1}, (_, i) => 1 + ((i+1)*(target+example.seed+1)+i*i)%9);
    const total = scores.reduce((a,b) => a+b,0);
    return words.map((_,i) => i <= target ? scores[i]/total : 0);
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {examples, distribution};
  if (typeof document === 'undefined') return;
  const $ = name => document.getElementById('selfAttention'+name);
  const escape = text => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let exampleIndex = 0, target = 5, source = -1;
  // Stable per-position colors shared by the cell border and stacked segment.
  const palette = ['--blue','--purple','--teal','--amber','--red','--green'];
  const wordColor = i => i < palette.length ? 'var('+palette[i]+')' : 'color-mix(in srgb, var('+palette[i%palette.length]+'), '+(i<12?'black 25%':'white 25%')+')';
  const point = i => ({x:100+i%6*150, y:62+Math.floor(i/6)*90});
  // Preserve Chapter 3's token geometry; stagger curves and target attachment
  // points so weighted connections do not merge into a single thick bundle.
  function path(i) {
    const a=point(i), b=point(target);
    if (i===target) return `M${a.x+40} ${a.y+16}C${a.x+30} ${a.y+45} ${a.x+66} ${a.y+45} ${a.x+56} ${a.y+16}`;
    if (a.y===b.y) {
      const bend=a.y+28+(target-i)*10, end=b.x+24-(i%6)*16;
      return `M${a.x} ${a.y+16}C${a.x} ${bend} ${end} ${bend} ${end} ${b.y+16}`;
    }
    const end=b.x-48+96*i/Math.max(1,Math.floor(target/6)*6-1);
    if (b.y-a.y===90) { const middle=(a.y+b.y)/2; return `M${a.x} ${a.y+16}C${a.x} ${middle} ${end} ${middle} ${end} ${b.y-34}`; }
    const lane=12+(i%6)*4, exit=a.y+28+(i%6)*5, entry=b.y-28-(i%6)*5;
    return `M${a.x} ${a.y+16}Q${a.x} ${exit} ${a.x-16} ${exit}H${lane+8}Q${lane} ${exit} ${lane} ${exit+8}V${entry-8}Q${lane} ${entry} ${lane+8} ${entry}H${end-8}Q${end} ${entry} ${end} ${b.y-34}`;
  }
  function highlight(i) {
    const words=examples[exampleIndex].text.split(' '), weights=distribution(exampleIndex,target);
    $('Diagram').classList.toggle('inspecting',i>=0);
    $('Demo').querySelectorAll('[data-source]').forEach(node => {
      const active=Number(node.dataset.source)===i;
      node.classList.toggle('inspected',active);
      if (node.tagName==='BUTTON') node.setAttribute('aria-pressed',String(active));
    });
    $('Inspection').innerHTML = i<0 ? 'The full bar is 100%. Hover over or select a segment to inspect its word.' : `<strong>${escape(words[i])}</strong> (position ${i+1}) contributes ${(weights[i]*100).toFixed(1)}% to the attention calculation for <strong>${escape(words[target])}</strong>.`;
  }
  function draw(focusTarget=false) {
    const words=examples[exampleIndex].text.split(' '), weights=distribution(exampleIndex,target);
    $('Target').textContent = `Selected target: ${words[target]} · ${target+1} permitted positions · total 100%`;
    const lastRow=Math.floor((words.length-1)/6);
    const diagramHeight=point(words.length-1).y+(Math.floor(target/6)===lastRow?64:24)-20;
    $('Diagram').innerHTML = `<svg class="rnn-flow-diagram" viewBox="0 20 940 ${diagramHeight}" role="group" aria-label="Attention connections for ${escape(words[target])}">`+
      weights.map((w,i)=>w ? `<path class="attention-connection" data-source="${i}" data-weight="${w}" stroke-width="${1.25+8*w}" d="${path(i)}"/>`:'').join('')+
      words.map((word,i)=>{const p=point(i), permitted=i<=target, percent=(weights[i]*100).toFixed(1)+'%'; return `<g class="attention-token${i===target?' selected':''}${!permitted?' future':''}" data-token="${i}" style="--word-color:${wordColor(i)}" data-weight="${weights[i]}" role="button" tabindex="${i===target?0:-1}" aria-pressed="${i===target}" aria-label="${escape(word)}, position ${i+1}${permitted?', '+percent:', future position for current target'}; select target"><rect class="rnn-flow-box memory" x="${p.x-65}" y="${p.y-34}" width="130" height="50" rx="8"/>${i===target?`<g class="attention-target-icon" transform="translate(${p.x-57} ${p.y-27})" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="7"/><circle cx="8" cy="8" r="3"/><path d="M8 0v3M16 8h-3"/></g>`:''}<text class="rnn-svg-title memory-label" x="${p.x+(i===target?10:0)}" y="${p.y-13}"${i===target&&word.length>9?' textLength="90" lengthAdjust="spacingAndGlyphs"':''}>${escape(word)}</text><text class="rnn-svg-small attention-percent" x="${p.x}" y="${p.y+7}"${permitted?` data-inspect="${i}" role="button" tabindex="0" aria-label="Inspect ${escape(word)}, position ${i+1}: ${percent}"`:''}>${permitted?percent:'Unavailable'}</text></g>`;}).join('')+'</svg>';
    $('Bar').innerHTML = weights.map((w,i)=>w ? `<button type="button" class="attention-segment" data-source="${i}" data-weight="${w}" style="width:${w*100}%;--word-color:${wordColor(i)}" aria-pressed="false" aria-label="Inspect ${escape(words[i])}, position ${i+1}: ${(w*100).toFixed(1)} percent" data-tooltip="${escape(words[i])}: ${(w*100).toFixed(1)}%"><span>${escape(words[i])}</span></button>`:'').join('');
    $('Bar').querySelectorAll('button').forEach(node=>{
      const i=Number(node.dataset.source);
      node.onclick=()=>{source=i;highlight(i);};
      node.onfocus=()=>highlight(i);
      node.onblur=()=>highlight(source);
      node.addEventListener('pointerenter',()=>highlight(i));
      node.addEventListener('pointerleave',()=>highlight(source));
    });
    $('Diagram').querySelectorAll('[data-token]').forEach(node=>{
      const i=Number(node.dataset.token);
      const choose=()=>{target=i;source=-1;draw(true);};
      node.onclick=event=>{if(event.shiftKey){if(i<=target){source=i;highlight(i);}}else choose();};
      node.addEventListener('pointerenter',()=>{if(i<=target)highlight(i);});
      node.addEventListener('pointerleave',()=>highlight(source));
      node.onkeydown=event=>{
        if(!['ArrowLeft','ArrowRight','Home','End','Enter',' '].includes(event.key))return;
        event.preventDefault();event.stopPropagation();
        if(event.shiftKey&&['Enter',' '].includes(event.key)){if(i<=target){source=i;highlight(i);}return;}
        target=event.key==='Home'?0:event.key==='End'?words.length-1:event.key==='ArrowLeft'?Math.max(0,i-1):event.key==='ArrowRight'?Math.min(words.length-1,i+1):i;
        source=-1;draw(true);
      };
    });
    $('Diagram').querySelectorAll('[data-inspect]').forEach(node=>{
      const i=Number(node.dataset.inspect);
      node.onclick=event=>{event.stopPropagation();source=i;highlight(i);};
      node.onfocus=()=>highlight(i);
      node.onblur=()=>highlight(source);
      node.onkeydown=event=>{
        event.stopPropagation();
        if(['Enter',' '].includes(event.key)){event.preventDefault();source=i;highlight(i);}
      };
    });
    highlight(source);
    if(focusTarget)$('Diagram').querySelector(`[data-token="${target}"]`).focus();
  }
  // Reuse Chapter 2's styled, keyboard-accessible example picker.
  const picker=$('Picker'), button=$('PickerButton'), menu=$('PickerMenu');
  function closePicker(focus=false){menu.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus();}
  function syncPicker(){button.textContent=examples[exampleIndex].name;button.setAttribute('aria-label','Try an example: '+button.textContent);[...menu.children].forEach((node,i)=>node.setAttribute('aria-selected',String(i===exampleIndex)));}
  function reset(){target=examples[exampleIndex].target;source=-1;closePicker();syncPicker();draw();}
  examples.forEach((example,i)=>{const option=document.createElement('button');option.type='button';option.tabIndex=-1;option.setAttribute('role','option');option.textContent=example.name;option.onclick=()=>{exampleIndex=i;reset();button.focus();};menu.append(option);});
  function openPicker(){menu.hidden=false;button.setAttribute('aria-expanded','true');menu.children[exampleIndex].focus();}
  button.onclick=()=>menu.hidden?openPicker():closePicker();
  picker.onkeydown=event=>{
    if(!['ArrowDown','ArrowUp','Home','End','Escape','Tab'].includes(event.key))return;
    event.stopPropagation();if(event.key==='Tab'){closePicker();return;}event.preventDefault();
    if(event.key==='Escape'){closePicker(true);return;}if(menu.hidden){openPicker();return;}
    const options=[...menu.children],i=options.indexOf(document.activeElement);
    options[event.key==='Home'?0:event.key==='End'?options.length-1:(i+(event.key==='ArrowDown'?1:-1)+options.length)%options.length].focus();
  };
  document.addEventListener('click',event=>{if(!picker.contains(event.target))closePicker();});
  $('Reset').onclick=reset;
  // Synchronous rendering has no animation timers or stale asynchronous updates.
  new MutationObserver(()=>{if($('Demo').hidden)closePicker();}).observe($('Demo'),{attributes:true,attributeFilter:['hidden']});
  window.openSelfAttentionScene=()=>{closePicker();draw();};
  reset();
})();
