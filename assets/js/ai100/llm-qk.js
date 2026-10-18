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
  const model=window.llmQKModel;
  const calculate=()=>model.calculate(examples[exampleIndex].text.split(' '),target);
  const distribution=(e,t)=>model.calculate(examples[e].text.split(' '),t).weights;
  if (typeof document === 'undefined') return;
  const $ = name => document.getElementById('qk'+name);
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
  // Keep the approved sign hues and intensity range, but calibrate one fixed
  // scale to the full teaching vocabulary so distinct magnitudes do not clip.
  const vectorLimit=Math.max(...Object.values(model.embeddings).flatMap(x=>[
    ...model.project(x,model.WQ),...model.project(x,model.WK)
  ]).map(Math.abs));
  const vectorColor=v=>Math.abs(v)<.0005?'#e1e5e3':`hsl(${v<0?270:215} 45% ${85-45*(Math.abs(v)/vectorLimit)}%)`;
  function visualComparison(result,words,i) {
    const host=$('VisualComparison'),q=result.queries[target],k=result.keys[i];
    if(!host.firstElementChild){
      const cells=(kind,left)=>[0,1].map(j=>`<g data-visual-${kind}="${j}" tabindex="0"><rect x="${left+j*57}" y="60" width="50" height="30" rx="5"/><text class="rnn-svg-values" x="${left+j*57+25}" y="112"></text></g>`).join('');
      host.innerHTML=`<svg class="rnn-flow-diagram qk-comparison" role="group" aria-labelledby="qkVisualHeading" aria-describedby="qkVisualDescription">
        <desc id="qkVisualDescription"></desc>
        <g id="qkVisualQuery" class="rnn-state-blocks"><text class="rnn-svg-title qk-query-label" x="340" y="20">Query</text><text id="qkVisualQueryLabel" class="rnn-svg-small qk-query-label" x="340" y="43"></text>${cells('query',286.5)}</g>
        <g id="qkVisualKey" class="rnn-state-blocks"><text class="rnn-svg-title memory-label" x="600" y="20">Key</text><text id="qkVisualKeyLabel" class="rnn-svg-small memory-label" x="600" y="43"></text>${cells('key',546.5)}</g>
        <g transform="translate(458 63)" tabindex="0" role="img" aria-label="Compare Query and Key" data-tooltip="Compare the target's Query with the source's Key to calculate their compatibility score." fill="none" stroke="var(--purple)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/></g>
        <path class="rnn-prior-entry" d="M340 119V126H600V119M470 126V136m-5-6 5 6 5-6"/>
        <text class="rnn-svg-small" x="420" y="157">Scaled compatibility score</text><text id="qkVisualScore" class="rnn-svg-title memory-label" x="560" y="157" tabindex="0"></text>
        <path class="rnn-prior-entry" d="M470 168V178m-5-6 5 6 5-6"/>
        <text id="qkScorePoolHeading" class="rnn-svg-title" x="240" y="205" style="text-anchor:start"></text>
        <g id="qkSoftmaxNote" class="attention-info-icon" transform="translate(316 190)" tabindex="0" role="img" aria-label="What is Softmax?" data-tooltip="What is Softmax? Softmax converts attention scores into percentages that add up to 100%. Higher scores receive larger percentages, allowing the model to assign different attention weights to available words."><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7h.01" stroke-linecap="round"/></svg></g>
        <g id="qkPermittedScores"></g>
        <g id="qkVisualResult"><rect x="340" y="0" width="260" height="52" rx="13" fill="#fff" stroke="var(--line)" stroke-width="1"/><text class="rnn-svg-small" x="470" y="18">Attention weight</text><text id="qkVisualWeightLabel" class="rnn-svg-small" x="425" y="42"></text><text id="qkVisualWeight" class="rnn-svg-title memory-label" x="525" y="42" tabindex="0"></text></g>
      </svg>`;
    }
    const paint=(kind,values,word)=>values.forEach((v,j)=>{
      const node=host.querySelector(`[data-visual-${kind}="${j}"]`);
      node.dataset.coordinate=String(j);node.dataset.stateValue=String(v);
      node.querySelector('rect').setAttribute('fill',vectorColor(v));
      node.querySelector('text').textContent=v.toFixed(2);
      const label=`${kind==='query'?'Query':'Key'} for ${word}, dimension ${j+1}: ${v.toFixed(3)}. Blue is positive; purple is negative. Fixed color scale: magnitude 0 to ${vectorLimit.toFixed(2)}.`;
      node.setAttribute('aria-label',label);node.dataset.tooltip=label;
    });
    const identity=exampleIndex+':'+target;
    if($('VisualQuery').dataset.target!==identity){
      $('VisualQuery').dataset.target=identity;$('VisualQueryLabel').textContent=words[target];paint('query',q,words[target]);
    }
    $('VisualKeyLabel').textContent=words[i];paint('key',k,words[i]);
    $('VisualScore').dataset.value=String(result.scores[i]);
    $('VisualScore').textContent=result.scores[i].toFixed(3);
    $('VisualScore').dataset.tooltip=`Scaled compatibility score for ${words[i]}: ${result.scores[i].toFixed(3)}. Softmax compares it with every other permitted score below.`;
    // One compact list within this same flow, never a second chart or panel.
    const pool=$('PermittedScores');
    if(pool.dataset.target!==identity){
      pool.dataset.target=identity;
      pool.innerHTML=words.slice(0,target+1).map((word,j)=>`<g data-permitted-score="${j}" data-score="${result.scores[j]}" style="--word-color:${wordColor(j)}" tabindex="0" data-tooltip="${escape(word)}, position ${j+1}: scaled score ${result.scores[j].toFixed(3)}"><rect x="${24+j%6*150}" y="${215+Math.floor(j/6)*28}" width="142" height="26" rx="8"/><text class="rnn-svg-small" x="${95+j%6*150}" y="${232+Math.floor(j/6)*28}">${escape(word)}: ${result.scores[j].toFixed(3)}</text></g>`).join('');
    }
    pool.querySelectorAll('[data-permitted-score]').forEach(node=>{
      const selected=Number(node.dataset.permittedScore)===i;
      node.classList.toggle('qk-selected-score',selected);
      node.setAttribute('aria-label',(selected?'Selected source: ':'')+node.dataset.tooltip);
    });
    $('ScorePoolHeading').innerHTML=`Softmax<tspan dx="30">· converts all ${target+1} scores into attention weights</tspan>`;
    const resultY=222+Math.ceil((target+1)/6)*28;
    $('VisualResult').setAttribute('transform',`translate(0 ${resultY})`);
    host.firstElementChild.setAttribute('viewBox',`0 0 940 ${resultY+56}`);
    $('VisualWeight').dataset.value=String(result.weights[i]*100);
    $('VisualWeight').textContent=(result.weights[i]*100).toFixed(1)+'%';
    const permittedScores=result.scores.slice(0,target+1);
    const denominator=permittedScores.reduce((sum,score)=>sum+Math.exp(score),0);
    const math=`${words[i]}: score = ${result.dots[i].toFixed(3)} / √2 = ${result.scores[i].toFixed(3)}. Softmax: exp(${result.scores[i].toFixed(3)}) / Σ exp(all ${target+1} permitted scores) × 100 = ${Math.exp(result.scores[i]).toFixed(3)} / ${denominator.toFixed(3)} × 100 ≈ ${(result.weights[i]*100).toFixed(1)}%. Shown values are rounded.`;
    $('VisualResult').style.setProperty('--word-color',wordColor(i));
    $('VisualResult').setAttribute('tabindex','0');
    $('VisualResult').setAttribute('aria-label',math);
    $('VisualResult').dataset.tooltip=math;
    $('VisualWeight').removeAttribute('tabindex');
    $('VisualWeightLabel').textContent=words[i];
    $('VisualDescription').textContent=`Two calculated Query dimensions for ${words[target]}, and two Key dimensions for ${words[i]}. Scaled score ${result.scores[i].toFixed(3)}, compared with all ${target+1} permitted scores, yields ${(result.weights[i]*100).toFixed(1)} percent. The same source is highlighted in the complete distribution below.`;
  }
  // Optional arithmetic, using the Visualizer's 50 × 30 vector cells, SVG type,
  // semantic colors and 2px information paths. Source changes retain Query DOM.
  function comparison(result, words, i) {
    const q=result.queries[target], k=result.keys[i], products=q.map((v,j)=>v*k[j]);
    const host=$('Comparison');
    if(!host.firstElementChild) {
      host.innerHTML=`<svg class="rnn-flow-diagram qk-comparison" viewBox="0 0 740 235" role="group" aria-labelledby="qkComparisonHeading" aria-describedby="qkComparisonDescription">
        <desc id="qkComparisonDescription"></desc>
        <g id="qkQueryVector"><text class="rnn-svg-title qk-query-label" x="185" y="20">Query</text><text id="qkQueryLabel" class="rnn-svg-small qk-query-label" x="185" y="43"></text>
          ${q.map((_,j)=>`<rect class="rnn-flow-box classifier" x="160" y="${60+j*50}" width="50" height="30" rx="5"/><text data-query-dimension="${j}" class="rnn-svg-values" x="185" y="${80+j*50}"></text>`).join('')}
        </g>
        <g id="qkKeyVector"><text class="rnn-svg-title memory-label" x="345" y="20">Key</text><text id="qkKeyLabel" class="rnn-svg-small memory-label" x="345" y="43"></text>
          ${k.map((_,j)=>`<rect class="rnn-flow-box memory" x="320" y="${60+j*50}" width="50" height="30" rx="5"/><text data-key-dimension="${j}" class="rnn-svg-values" x="345" y="${80+j*50}"></text>`).join('')}
        </g>
        <text class="rnn-svg-small" x="505" y="25">Products</text><text class="rnn-svg-small" x="655" y="25">Teaching sum</text><text class="rnn-svg-small" x="655" y="45">Dimensions 1–2</text>
        ${q.map((_,j)=>`<g><text class="rnn-svg-small" x="65" y="${80+j*50}">Dimension ${j+1}</text><text class="rnn-svg-title" x="265" y="${80+j*50}">×</text><text class="rnn-svg-title" x="425" y="${80+j*50}">=</text><text data-product-dimension="${j}" class="rnn-svg-values memory-label" x="505" y="${80+j*50}"></text></g>`).join('')}
        <path class="rnn-prior-entry" d="M548 75C585 75 575 100 605 100M548 125C585 125 575 100 605 100"/>
        <text class="rnn-svg-title memory-label" x="505" y="105">+</text><text id="qkSum" class="rnn-svg-values memory-label" x="655" y="105"></text>
        <text class="rnn-svg-small" x="135" y="187">Dot product</text><text id="qkDot" class="rnn-svg-title memory-label" x="135" y="215"></text>
        <path class="rnn-prior-entry" d="M195 210H300m-6-5 6 5-6 5"/><text class="rnn-svg-small" x="250" y="187">÷ √2</text>
        <text class="rnn-svg-small" x="375" y="187">Scaled score</text><text id="qkScore" class="rnn-svg-title memory-label" x="375" y="215"></text>
        <path class="rnn-prior-entry" d="M445 210H550m-6-5 6 5-6 5"/><text class="rnn-svg-small" x="500" y="187">Softmax</text>
        <text class="rnn-svg-small" x="625" y="187">Attention weight</text><text id="qkWeight" class="rnn-svg-title memory-label" x="625" y="215"></text>
      </svg>
      <p class="tokens-note">Real transformers typically use larger Query and Key vectors. This teaching example uses two dimensions to make the calculation easy to follow.</p>
      <p class="tokens-note">Softmax compares this score with all other permitted scores to determine its share of the total attention.</p>`;
    }
    const tip=(node,text)=>{node.dataset.tooltip=text;node.setAttribute('tabindex','0');};
    const set=(node,value,digits)=>{node.dataset.value=String(value);node.textContent=value.toFixed(digits);};
    const queryIdentity=exampleIndex+':'+target;
    if($('QueryVector').dataset.target!==queryIdentity){
      $('QueryVector').dataset.target=queryIdentity;
      $('QueryLabel').textContent=words[target];
      q.forEach((v,j)=>{
        const node=host.querySelector(`[data-query-dimension="${j}"]`);
        set(node,v,2);tip(node,`Query for ${words[target]}, dimension ${j+1}: ${v.toFixed(2)}. Stays fixed when you change the source.`);
      });
    }
    $('KeyLabel').textContent=words[i];
    k.forEach((v,j)=>{
      const node=host.querySelector(`[data-key-dimension="${j}"]`);
      set(node,v,2);tip(node,`Key for ${words[i]}, dimension ${j+1}: ${v.toFixed(2)}.`);
    });
    products.forEach((v,j)=>{
      const node=host.querySelector(`[data-product-dimension="${j}"]`);
      set(node,v,3);tip(node,`Dimension ${j+1}: ${q[j].toFixed(2)} × ${k[j].toFixed(2)} = ${v.toFixed(3)}.`);
    });
    set($('Sum'),result.dots[i],3);set($('Dot'),result.dots[i],3);
    set($('Score'),result.scores[i],3);set($('Weight'),result.weights[i]*100,1);
    $('Weight').textContent+='%';
    for(const name of ['Sum','Dot'])tip($(name),`${products.map(v=>v.toFixed(3)).join(' + ')} = ${result.dots[i].toFixed(3)}. Add the matching-dimension products.`);
    tip($('Score'),`${result.dots[i].toFixed(3)} ÷ √2 = ${result.scores[i].toFixed(3)}. Scale by the square root of the two dimensions.`);
    tip($('Weight'),`Softmax compares all ${target+1} permitted scores. ${words[i]} receives ${(result.weights[i]*100).toFixed(1)}% of the total attention.`);
    $('ComparisonDescription').textContent=`Query for ${words[target]}: ${q.join(', ')}. Key for ${words[i]}: ${k.join(', ')}. Matching products ${products.map(v=>v.toFixed(3)).join(' and ')} add to ${result.dots[i].toFixed(3)}. Divide by square root of 2 for score ${result.scores[i].toFixed(3)}. Softmax across ${target+1} permitted positions gives ${(result.weights[i]*100).toFixed(1)} percent.`;
  }
  function highlight(i) {
    const words=examples[exampleIndex].text.split(' '), weights=distribution(exampleIndex,target);
    $('Diagram').classList.toggle('inspecting',i>=0);
    $('Demo').querySelectorAll('[data-source]').forEach(node => {
      const active=Number(node.dataset.source)===i;
      node.classList.toggle('inspected',active);
      if (node.tagName==='BUTTON') node.setAttribute('aria-pressed',String(active));
    });
    if(i<0)i=target;
    const result=calculate(), q=result.queries[target], k=result.keys[i];
    visualComparison(result,words,i);
    comparison(result,words,i);
    const percent=(weights[i]*100).toFixed(1);
    $('WeightMeaningTitle').textContent=`What does ${percent}% mean?`;
    $('WeightMeaningIs').textContent=`The attention weight assigned to ${words[i]}. It determines how strongly that position's Value vector contributes to the attention output.`;
    const pronounTarget=/^(they|she)$/i.test(words[target].replace(/[^a-z]/gi,''));
    $('WeightMeaningNot').textContent=pronounTarget
      ? `A ${percent}% probability that the selected word refers to ${words[i]}, or a measure of how well the model understands the sentence.`
      : "A probability that the words have a particular meaning or relationship, or a measure of the model's understanding.";
    const vector=v=>'['+v.map(n=>n.toFixed(2)).join(', ')+']';
    $('Inspection').innerHTML='<strong>Query · '+escape(words[target])+'</strong> <span class="qk-number">'+vector(q)+'</span> · <strong>Key · '+escape(words[i])+'</strong> <span class="qk-number">'+vector(k)+'</span><br>Query · Key <strong class="qk-number">'+result.dots[i].toFixed(3)+'</strong> → scaled compatibility score <strong class="qk-number">'+result.scores[i].toFixed(3)+'</strong> → attention weight <strong class="qk-number">'+(weights[i]*100).toFixed(1)+'%</strong>';
    $('Projection').textContent='Target representation '+vector(result.representations[target])+' → Query '+vector(q)+'. Source representation '+vector(result.representations[i])+' → Key '+vector(k)+'.';

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
  window.openQKScene=()=>{closePicker();draw();};
  reset();
})();
