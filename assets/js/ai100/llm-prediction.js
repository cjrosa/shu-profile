(function(){
  'use strict';
  const model=window.llmPredictionModel,examples=model.examples;
  const $=name=>document.getElementById('prediction'+name);
  let exampleIndex=0,selected=null,result;
  const percent=p=>(p*100).toFixed(1)+'%';
  const vectorColor=v=>Math.abs(v)<.0005?'#e1e5e3':`hsl(${v<0?270:215} 45% ${85-45*Math.abs(v)/4}%)`;
  const targetIcon='<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>';
  function inspect(token,commit=false){
    if(commit)selected=token;
    $('Demo').querySelectorAll('[data-candidate]').forEach(n=>{
      n.classList.toggle('selected',n.dataset.candidate===selected||n.dataset.candidate===token);
      n.setAttribute('aria-pressed',String(n.dataset.candidate===selected));
    });
    const c=result.shown.find(c=>c.token===token);
    $('Inspection').textContent=c?`Inspecting ${c.token}: score ${c.score.toFixed(3)} → ${percent(c.probability)} probability. No next token has been chosen.`:token==='Other tokens'?`Other tokens: ${percent(result.other)} combined probability across five omitted tokens, each with its own score. No next token has been chosen.`:'Select a candidate to compare its score and probability. No next token has been chosen.';
  }
  function bindCandidates(){
    $('Demo').querySelectorAll('[data-candidate]').forEach(n=>{
      n.onclick=()=>inspect(n.dataset.candidate,true);
      n.onpointerenter=n.onfocus=()=>inspect(n.dataset.candidate);
      n.onpointerleave=n.onblur=()=>inspect(selected);
      n.onkeydown=e=>{
        if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
        e.preventDefault();e.stopPropagation();
        const nodes=[...n.parentElement.querySelectorAll('[data-candidate]')],i=nodes.indexOf(n);
        nodes[e.key==='Home'?0:e.key==='End'?nodes.length-1:(i+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)+nodes.length)%nodes.length].focus();
      };
    });
  }
  function draw(){
    result=model.calculate(exampleIndex);
    const {words,target,representation}=result;
    const columns=Math.max(3,Math.min(8,Math.floor(($('Tokens').clientWidth||940)/115)));
    const palette=['--blue','--purple','--teal','--amber','--red','--green'];
    $('Tokens').innerHTML=`<svg class="rnn-flow-diagram" viewBox="0 0 ${columns*115+20} ${Math.ceil(words.length/columns)*60}" role="img" aria-label="${examples[exampleIndex].text} Last position: ${words[target]}">${words.map((word,i)=>{const x=66+i%columns*115,y=24+Math.floor(i/columns)*60;return `<g class="attention-token${i===target?' selected':''}" style="--word-color:var(${palette[i%6]})"><rect class="rnn-flow-box memory" x="${x-52}" y="${y-19}" width="104" height="38" rx="8"/>${i===target?`<svg class="attention-target-icon" x="${x-44}" y="${y-8}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">${targetIcon}</svg>`:''}<text class="rnn-svg-title" x="${x+(i===target?12:0)}" y="${y+5}">${word}</text></g>`;}).join('')}</svg>`;
    $('Target').textContent=`Last position: ${words[target]} · Already contextualized by transformer processing.`;
    const labelWidth=Math.max(66,words[target].length*8+38),left=300-labelWidth;
    $('Diagram').innerHTML=`<svg class="rnn-flow-diagram" viewBox="0 0 700 197" role="group" aria-label="Final token representation enters the output projection"><defs><marker id="prediction-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker></defs>
      <g tabindex="0" data-tooltip="The representation at the last position includes contextual processing. Its coordinates are numerical features, not a word definition." aria-label="Inspect final representation">
      <g class="stack-token-label"><rect x="${left}" y="4" width="${labelWidth}" height="28" rx="5"/><svg class="stack-target-icon" x="${left+6}" y="10" width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.7">${targetIcon}</svg><text class="rnn-svg-title" x="${left+(labelWidth+20)/2}" y="23">${words[target]}</text></g>
      <text class="rnn-svg-title" x="314" y="23">·</text><text class="rnn-svg-title" x="415" y="23">Final Representation</text>
      ${representation.map((v,d)=>`<g tabindex="0" data-tooltip="Final representation, dimension ${d+1}: ${v.toFixed(3)}" aria-label="Inspect dimension ${d+1}"><rect x="${268+d*57}" y="44" width="50" height="30" rx="5" fill="${vectorColor(v)}"/></g>`).join('')}</g>
      <path class="prediction-path" d="M350 78V94"/><rect class="rnn-flow-box memory" x="230" y="100" width="240" height="38" rx="8"/><text class="rnn-svg-title" x="350" y="124">Output Projection</text>
      <text class="rnn-svg-small" x="350" y="160">Learned parameters produce a score for every vocabulary token.</text>
      <path class="prediction-path" d="M350 168V190"/></svg>`;
    $('Scores').innerHTML=result.shown.map(c=>`<button type="button" data-candidate="${c.token}" aria-pressed="false" data-tooltip="${c.token}: score ${c.score.toFixed(3)}, probability ${percent(c.probability)}"><span>${c.token}</span><strong>${c.score.toFixed(3)}</strong></button>`).join('');
    $('Probabilities').innerHTML=result.shown.map(c=>`<button type="button" class="prob-branch" data-candidate="${c.token}" aria-pressed="false" aria-label="Inspect ${c.token}: ${percent(c.probability)}"><strong>${c.token}</strong><span>${percent(c.probability)}</span><span class="count-track" aria-hidden="true"><span class="count-bar" style="width:${c.probability*100}%"></span></span></button>`).join('') + `<div class="prob-branch prediction-other"><strong>Other tokens <button type="button" class="prediction-info" aria-label="About Other tokens" data-tooltip="Other tokens: The combined probability of vocabulary tokens not shown individually."><svg class="attention-info-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7h.01"/></svg></button></strong><span>${percent(result.other)}</span><span class="count-track" aria-hidden="true"><span class="count-bar" style="width:${result.other*100}%"></span></span></div>`;
    $('VectorDetails').textContent=`Last-position vector: [${representation.map(v=>v.toFixed(6)).join(', ')}]. The table below uses the same shared parameters for all examples.`;
    $('Parameters').innerHTML=model.vocabularyFor(exampleIndex).map(([token,w,b])=>{const c=result.candidates.find(c=>c.token===token);return `<tr><th>${token}</th><td>[${w.join(', ')}]</td><td>${b}</td><td>${c.score.toFixed(6)}</td><td>${percent(c.probability)}</td></tr>`;}).join('');
    bindCandidates();inspect(selected);
    const text=$('Tokens').querySelector('.selected text');
    if(text?.getComputedTextLength?.()>68){text.setAttribute('textLength','68');text.setAttribute('lengthAdjust','spacingAndGlyphs');}
  }
  const picker=$('Picker'),button=$('PickerButton'),menu=$('PickerMenu');
  function closePicker(focus=false){menu.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus();}
  function reset(){selected=null;closePicker();button.textContent=examples[exampleIndex].name;button.setAttribute('aria-label','Try an example: '+button.textContent);[...menu.children].forEach((n,i)=>n.setAttribute('aria-selected',String(i===exampleIndex)));draw();}
  examples.forEach((example,i)=>{const option=document.createElement('button');option.type='button';option.tabIndex=-1;option.setAttribute('role','option');option.textContent=example.name;option.onclick=()=>{exampleIndex=i;reset();button.focus();};menu.append(option);});
  function openPicker(){menu.hidden=false;button.setAttribute('aria-expanded','true');menu.children[exampleIndex].focus();}
  button.onclick=()=>menu.hidden?openPicker():closePicker();
  picker.onkeydown=e=>{if(!['ArrowDown','ArrowUp','Home','End','Escape','Tab'].includes(e.key))return;e.stopPropagation();if(e.key==='Tab'){closePicker();return;}e.preventDefault();if(e.key==='Escape'){closePicker(true);return;}if(menu.hidden){openPicker();return;}const options=[...menu.children],i=options.indexOf(document.activeElement);options[e.key==='Home'?0:e.key==='End'?options.length-1:(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length].focus();};
  document.addEventListener('click',e=>{if(!picker.contains(e.target))closePicker();});
  // Shared tooltip renderer normally dismisses on click. Redispatch focusin after
  // a tap on an information control so its existing tooltip also works on touch.
  $('Demo').addEventListener('click',e=>{const info=e.target.closest('.prediction-info');if(info){e.stopPropagation();info.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));}});
  $('Reset').onclick=()=>{exampleIndex=0;reset();};
  window.openPredictionScene=()=>{closePicker();draw();};
  window.addEventListener('resize',()=>{if(!$('Demo').hidden)draw();});
  const demo=$('Demo');
  new MutationObserver(()=>{if(demo.isConnected&&demo.hidden)closePicker();}).observe(demo,{attributes:true,attributeFilter:['hidden']});
  reset();
})();
