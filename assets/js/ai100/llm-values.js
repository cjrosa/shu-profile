/* Scene 1's SVG and interactions reused in isolation to preserve approved behavior. */
(function () {
  'use strict';
  const examples = [
    {name:'Pronoun Context', text:'The team got pizzas and they were cold.', target:5},
    {name:'Distant Reference', text:'Marie arrived at the conference after a long flight. She was exhausted.', target:9},
    {name:'Word Relationships', text:'The dog chased the ball.', target:2},
    {name:'Longer Context', text:'Marie arrived at the conference after a long flight and a delayed train. She was exhausted.', target:13}
  ];
  // Separate calculated weights; approved Scene 1 remains unchanged.
  const model=window.llmValuesModel;
  const calculate=()=>model.calculate(examples[exampleIndex].text.split(' '),target);
  const distribution=(e,t)=>model.calculate(examples[e].text.split(' '),t).weights;
  if (typeof document === 'undefined') return;
  const $ = name => document.getElementById('values'+name);
  const escape = text => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let exampleIndex = 0, target = 5, source = 3;
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
  // Same 50 x 30 cells and sign/intensity mapping as the NLP & RNN Visualizer.
  // This projection stays inside [-1,1], so the established scale never clips.
  const vectorColor=v=>Math.abs(v)<.0005?'#e1e5e3':`hsl(${v<0?270:215} 45% ${85-45*Math.abs(v)}%)`;
  const vector=v=>'['+v.map(n=>n.toFixed(3)).join(', ')+']';
  function cells(values,x,y,label,numbers=false,inside=false){
    return values.map((v,d)=>`<g data-coordinate="${d}" data-state-value="${v}" tabindex="0" aria-label="${escape(label)}, dimension ${d+1}: ${v.toFixed(3)}" data-tooltip="${escape(label)}, dimension ${d+1}: ${v.toFixed(3)}"><rect x="${x+d*57}" y="${y}" width="50" height="30" rx="5" fill="${vectorColor(v)}"/>${inside?`<text class="rnn-svg-values values-cell-number" x="${x+d*57+25}" y="${y+19}" style="fill:${Math.abs(v)>.6?'#fff':'var(--ink)'}">${v.toFixed(3)}</text>`:""}${numbers?`<text class="rnn-svg-values" x="${x+d*57+25}" y="${y+50}">${v.toFixed(3)}</text>`:""}</g>`).join('');
  }
  function paintFlow(result,words){
    const rows=Math.ceil((target+1)/3), bottom=rows*114+44;
    $('VisualComparison').innerHTML=`<svg class="rnn-flow-diagram" viewBox="0 0 940 ${bottom+98}" role="group" aria-label="Value vectors become weighted contributions, which combine into one attention output">
      <g class="values-connections" aria-hidden="true">${words.slice(0,target+1).map((_,i)=>{const x=238.5+i%3*305,y=98+Math.floor(i/3)*114;return `<path class="attention-connection" data-source="${i}" stroke-width="2" d="M${x} ${y}C${x} ${bottom-6} 470 ${bottom-18} 470 ${bottom}"/>`;}).join('')}</g>
      ${words.slice(0,target+1).map((word,i)=>{const x=20+i%3*305,y=28+Math.floor(i/3)*114;return `<g data-source="${i}" class="values-source" role="button" tabindex="0" aria-pressed="false" aria-label="Select source ${escape(word)}, position ${i+1}" style="--word-color:${wordColor(i)}"><rect class="values-source-frame" x="${x-5}" y="${y-24}" width="285" height="94" rx="8"/><path class="attention-connection" data-source="${i}" stroke-width="2" d="M${x+218.5} ${y+48}V${y+70}"/><text class="rnn-svg-title" x="${x+132}" y="${y-7}">${escape(word)}</text>${cells(result.values[i],x,y+18,`Value for ${word}`,false,true)}<text class="rnn-svg-small values-weight-label" x="${x+133}" y="${y+22}">× ${(result.weights[i]*100).toFixed(1)}%</text><path class="rnn-prior-entry" d="M${x+113} ${y+39}h40m-6-5 6 5-6 5"/>${cells(result.contributions[i],x+165,y+18,`Weighted contribution for ${word}`,false,true)}<text class="rnn-svg-small" x="${x+53}" y="${y+10}">Value</text><text class="rnn-svg-small" x="${x+218}" y="${y+10}">Weighted Value</text></g>`;}).join('')}
      <g role="img" aria-label="Add weighted Values"><rect x="460" y="${bottom-12}" width="20" height="26" rx="5" fill="#fff"/><text class="rnn-svg-title memory-label" x="470" y="${bottom+6}">Σ</text><text class="rnn-svg-small" x="488" y="${bottom+6}" style="text-anchor:start">— Add weighted Values</text></g>
      <path class="rnn-prior-entry" d="M470 ${bottom+14}v16m-5-6 5 6 5-6"/>
      <text class="rnn-svg-title memory-label" x="300" y="${bottom+55}">Attention output</text>
      <g id="valuesOutput" data-output="${result.output.join(',')}">${cells(result.output,416.5,bottom+38,'Attention output',true)}</g>
      </svg>`;
    $('VisualComparison').querySelectorAll('.values-source').forEach(node=>{
      const i=Number(node.dataset.source);
      node.onclick=()=>{source=i;highlight(i);};
      node.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();source=i;highlight(i);}};
      node.addEventListener('focusin',()=>highlight(i));
      node.addEventListener('focusout',()=>highlight(source));
      node.onpointerenter=()=>highlight(i);node.onpointerleave=()=>highlight(source);
    });
  }
  function highlight(i){
    const words=examples[exampleIndex].text.split(' '),r=calculate();
    $('Diagram').classList.add('inspecting');
    $('Demo').querySelectorAll('[data-source]').forEach(node=>{
      const active=Number(node.dataset.source)===i;
      node.classList.toggle('inspected',active);
      if(node.matches('button,[role="button"]'))node.setAttribute('aria-pressed',String(active));
    });
    $('WeightMeaningTitle').textContent='What does this contribution mean?';
    $('WeightMeaningIs').innerHTML='<strong>'+escape(words[i])+'</strong>’s Value vector multiplied by its attention weight. Both determine each dimension’s contribution.';
    $('WeightMeaningNot').textContent='A percentage of meaning, proof of understanding, or a direct measure of importance to the final prediction.';
    $('Comparison').innerHTML=`<svg class="rnn-flow-diagram" viewBox="0 0 940 130" role="img" aria-label="${escape(words[i])}: ${vector(r.values[i])} times ${r.weights[i].toFixed(6)} equals ${vector(r.contributions[i])}"><text class="rnn-svg-title" x="200" y="22">Value · ${escape(words[i])}</text>${cells(r.values[i],146.5,40,'Selected Value',true)}<text class="rnn-svg-title memory-label" x="420" y="62">× ${r.weights[i].toFixed(6)}</text><text class="rnn-svg-title" x="570" y="62">=</text><text class="rnn-svg-title" x="740" y="22">Weighted Value</text>${cells(r.contributions[i],686.5,40,'Selected weighted Value',true)}</svg><p class="values-number">Sum of all ${target+1} permitted weighted Values:<br>${r.contributions.slice(0,target+1).map(vector).join(' + ')}<br>= ${vector(r.output)}</p>`;
    $('Projection').textContent='Source representation '+vector(r.representations[i])+' → Value '+vector(r.values[i])+'. Attention weight: '+(r.weights[i]*100).toFixed(3)+'%. Displayed numbers are rounded; the sum uses full precision.';
  }
  function draw(focusTarget=false) {
    const words=examples[exampleIndex].text.split(' '), weights=distribution(exampleIndex,target);
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
      const choose=()=>{target=i;source=target;draw(true);};
      node.onclick=event=>{if(event.shiftKey){if(i<=target){source=i;highlight(i);}}else choose();};
      node.addEventListener('pointerenter',()=>{if(i<=target)highlight(i);});
      node.addEventListener('pointerleave',()=>highlight(source));
      node.onkeydown=event=>{
        if(!['ArrowLeft','ArrowRight','Home','End','Enter',' '].includes(event.key))return;
        event.preventDefault();event.stopPropagation();
        if(event.shiftKey&&['Enter',' '].includes(event.key)){if(i<=target){source=i;highlight(i);}return;}
        target=event.key==='Home'?0:event.key==='End'?words.length-1:event.key==='ArrowLeft'?Math.max(0,i-1):event.key==='ArrowRight'?Math.min(words.length-1,i+1):i;
        source=target;draw(true);
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
    paintFlow(calculate(),words);
    highlight(source);
    if(focusTarget)$('Diagram').querySelector(`[data-token="${target}"]`).focus();
  }
  // Reuse Chapter 2's styled, keyboard-accessible example picker.
  const picker=$('Picker'), button=$('PickerButton'), menu=$('PickerMenu');
  function closePicker(focus=false){menu.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus();}
  function syncPicker(){button.textContent=examples[exampleIndex].name;button.setAttribute('aria-label','Try an example: '+button.textContent);[...menu.children].forEach((node,i)=>node.setAttribute('aria-selected',String(i===exampleIndex)));}
  function reset(){target=examples[exampleIndex].target;source=exampleIndex===0?3:target;closePicker();syncPicker();draw();}
  examples.forEach((example,i)=>{const option=document.createElement('button');option.type='button';option.tabIndex=-1;option.setAttribute('role','option');option.textContent=example.name;option.onclick=()=>{const previous=examples[exampleIndex].text.split(' ')[target];exampleIndex=i;const words=examples[i].text.split(' ');target=words.includes(previous)?words.indexOf(previous):examples[i].target;source=target;closePicker();syncPicker();draw();button.focus();};menu.append(option);});
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
  window.openValuesScene=()=>{closePicker();draw();};
  reset();
})();
