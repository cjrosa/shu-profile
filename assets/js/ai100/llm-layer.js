(function(){
  'use strict';
  const examples=[
    {name:'Pronoun Context',text:'The team got pizzas and they were cold.',target:5},
    {name:'Distant Reference',text:'Marie arrived at the conference after a long flight. She was exhausted.',target:9},
    {name:'Word Relationships',text:'The dog chased the ball.',target:2},
    {name:'Longer Context',text:'Marie arrived at the conference after a long flight and a delayed train. She was exhausted.',target:13}
  ];
  const $=name=>document.getElementById('layer'+name);
  const escape=text=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stages=[
    ['input','Input token representation','Numerical information for the selected position enters the layer.','input','input'],
    ['norm1','Normalization before attention','Helps maintain stable numerical representations before self-attention. Each permitted position is normalized.','input','norm1'],
    ['attention','Self-attention','Incorporates information from this position and earlier permitted positions, using the weighted-Value idea from Scenes 1–3.','norm1','attention'],
    ['residual1','First residual connection','Combines the original information with the newly transformed information by addition. The bypass carries the layer input.','input','residual1'],
    ['norm2','Normalization before feed-forward','Helps maintain stable numerical representations before feed-forward processing.','residual1','norm2'],
    ['feedForward','Feed-forward network',"Applies an additional learned transformation to each token’s representation. The same network is applied independently at every position.",'norm2','feedForward'],
    ['output','Second residual connection','Combines the incoming information with the feed-forward transformation by addition. The bypass starts after the first addition.','residual1','output'],
    ['updated','Updated token representation','This numerical representation can feed another transformer layer. It is not a predicted word.','output','output']
  ];
  const motion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let exampleIndex=0,target=5,selected=2,progress=-1,timer=null,result;
  const paths=[['norm1','M390 86V96'],['attention','M390 134V164'],['residual1','M390 202V238'],['norm2','M390 270V304'],['feedForward','M390 342V372'],['output','M390 426V464'],['updated','M390 496V536'],['residual1','M390 86H150V254H374'],['output','M390 286H150V480H374']];
  // Approved 50 × 30 vector cells, sign hues and linear intensity mapping.
  // Fixed 0–4 magnitude scale covers this layer's larger residual stream.
  const vectorColor=v=>Math.abs(v)<.0005?'#e1e5e3':`hsl(${v<0?270:215} 45% ${85-45*Math.abs(v)/4}%)`;
  function cells(values,x,y,label){return values.map((v,d)=>`<g data-state-value="${v}" data-tooltip="${escape(label)}, dimension ${d+1}: ${v.toFixed(3)}"><rect x="${x+d*57}" y="${y}" width="50" height="30" rx="5" fill="${vectorColor(v)}"/><text class="rnn-svg-values" x="${x+d*57+25}" y="${y+49}">${v.toFixed(3)}</text></g>`).join('');}
  const format=v=>'['+v.map(n=>n.toFixed(3)).join(', ')+']';
  function stop(){clearTimeout(timer);timer=null;$('Play').textContent='Play';$('Play').setAttribute('aria-pressed','false');$('Diagram').querySelectorAll('.rnn-signal').forEach(n=>n.remove());}
  function inspect(index){
    const [key,title,description,before,after]=stages[index];
    $('Diagram').querySelectorAll('[data-stage]').forEach(n=>{const active=n.dataset.stage===key;n.classList.toggle('selected',active);if(n.getAttribute('role')==='button')n.setAttribute('aria-pressed',String(active));});
    $('Explanation').textContent=title+': '+description;
    $('Inspection').innerHTML=`<text class="rnn-svg-title" x="730" y="160">${index===3||index===6?'Bypass input':'Component input'}</text>${cells(result[before],648,180,'Component input')}<text class="rnn-svg-title" x="730" y="280">${index===3?'Attention result':index===6?'Feed-forward result':'Component output'}</text>${cells(result[index===3?'attention':index===6?'feedForward':after],648,300,'Transformed representation')}${index===3||index===6?`<text class="rnn-svg-title" x="730" y="400">Combined representation</text>${cells(result[after],648,420,'Residual sum')}`:''}`;
  }
  function draw(){
    const words=examples[exampleIndex].text.split(' ');
    result=window.llmLayerModel.calculate(words,target);
    const palette=['--blue','--purple','--teal','--amber','--red','--green'];
    $('Tokens').innerHTML=`<svg class="rnn-flow-diagram" viewBox="0 0 940 ${Math.ceil(words.length/6)*64}" role="group" aria-label="Select a target token">${words.map((word,i)=>{const x=100+i%6*150,y=32+Math.floor(i/6)*64;return `<g class="attention-token${i===target?' selected':''}${i>target?' future':''}" data-token="${i}" role="button" tabindex="${i===target?0:-1}" aria-pressed="${i===target}" aria-label="${escape(word)}, position ${i+1}; select target" style="--word-color:var(${palette[i%6]})"><rect class="rnn-flow-box memory" x="${x-65}" y="${y-25}" width="130" height="50" rx="8"/><text class="rnn-svg-title" x="${x}" y="${y+5}">${escape(word)}</text></g>`;}).join('')}</svg>`;
    $('Target').textContent=`Selected target: ${words[target]} · ${target+1} permitted positions · future positions unavailable`;
    $('Tokens').querySelectorAll('[data-token]').forEach(n=>{
      const i=Number(n.dataset.token);
      const choose=t=>{stop();target=t;progress=-1;draw();$('Tokens').querySelector(`[data-token="${target}"]`).focus();};
      n.onclick=()=>choose(i);
      n.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End','Enter',' '].includes(e.key))return;e.preventDefault();e.stopPropagation();choose(e.key==='Home'?0:e.key==='End'?words.length-1:e.key==='ArrowLeft'?Math.max(0,i-1):e.key==='ArrowRight'?Math.min(words.length-1,i+1):i);};
    });
    const block=(index,y,label,extra='')=>`<g data-stage="${stages[index][0]}" role="button" tabindex="0" aria-label="${stages[index][1]}" aria-pressed="false"><rect class="rnn-flow-box memory" x="270" y="${y}" width="240" height="${extra?54:38}" rx="8"/><text class="rnn-svg-title" x="390" y="${y+24}">${label}</text>${extra}</g>`;
    const merge=(index,y)=>`<g data-stage="${stages[index][0]}" role="button" tabindex="0" aria-label="${stages[index][1]}" aria-pressed="false"><rect class="layer-hit" x="350" y="${y-23}" width="220" height="46"/><circle class="rnn-flow-box memory" cx="390" cy="${y}" r="16"/><text class="rnn-svg-title" x="390" y="${y+6}">+</text><text class="rnn-svg-small layer-add-label" x="420" y="${y+5}">Residual addition</text></g>`;
    const network=`<g aria-hidden="true">${[0,1].flatMap(i=>[0,1,2].map(j=>`<path class="layer-synapse" d="M545 ${385+i*24}L575 ${379+j*18}L605 ${397}"/>`)).join('')}${[[545,385,'blue'],[545,409,'blue'],[575,379,'purple'],[575,397,'purple'],[575,415,'purple'],[605,397,'green']].map(([x,y,c])=>`<circle cx="${x}" cy="${y}" r="6" fill="var(--${c})" stroke="#fff" stroke-width="2"/>`).join('')}</g>`;
    $('Diagram').innerHTML=`<svg class="rnn-flow-diagram" viewBox="0 0 940 600" role="group" aria-label="One simplified pre-normalization causal decoder layer"><defs><marker id="layer-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker></defs>${paths.map(([key,d],i)=>`<path class="layer-path${i>6?' layer-bypass':''}" data-stage="${key}" d="${d}"/>`).join('')}<text class="rnn-svg-small" x="140" y="174" style="text-anchor:end">Input bypass</text><text class="rnn-svg-small" x="140" y="392" style="text-anchor:end">Second bypass</text><g data-stage="input" role="button" tabindex="0" aria-label="Input token representation" aria-pressed="false"><rect class="layer-vector-frame" x="266" y="4" width="248" height="82" rx="8"/><text class="rnn-svg-title" x="390" y="21">Input representation</text>${cells(result.input,308,30,'Layer input')}</g>${block(1,96,'Normalization')}${block(2,164,'Self-attention')}${merge(3,254)}${block(4,304,'Normalization')}${block(5,372,'Feed-forward network','<text class="rnn-svg-small" x="390" y="414">Same network at each position</text>')}${network}${merge(6,480)}<g data-stage="updated" role="button" tabindex="0" aria-label="Updated token representation" aria-pressed="false"><rect class="layer-vector-frame" x="266" y="532" width="248" height="66" rx="8"/>${cells(result.output,308,536,'Layer output')}<text class="rnn-svg-title" x="140" y="555">Updated representation</text></g><g id="layerInspection" aria-label="Selected component vectors"></g></svg>`;
    $('Diagram').querySelectorAll('[role="button"]').forEach(n=>{
      const index=stages.findIndex(s=>s[0]===n.dataset.stage);
      const choose=()=>{stop();selected=index;inspect(index);};
      n.onclick=choose;n.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();choose();}};
      n.onfocus=()=>{stop();inspect(index);};n.onblur=()=>inspect(selected);
      n.addEventListener('pointerenter',()=>{stop();inspect(index);});n.addEventListener('pointerleave',()=>inspect(selected));
    });
    $('Calculations').innerHTML=['input','norm1','attention','residual1','norm2','feedForward','output'].map((key,i)=>`<tr><th scope="row">${['Layer input','Normalized attention input','Attention output (projected to 3 coordinates)','First residual sum','Normalized feed-forward input','Feed-forward output','Final residual sum'][i]}</th><td>${format(result[key])}</td></tr>`).join('');
    inspect(selected);
  }
  function advance(animated){
    progress=(progress+1)%stages.length;selected=progress;inspect(selected);
    $('Diagram').querySelectorAll('.rnn-signal').forEach(n=>n.remove());
    if(animated&&!motion?.matches){const svg=$('Diagram').firstElementChild;paths.filter(([key])=>key===stages[selected][0]).forEach(([,d])=>{svg.insertAdjacentHTML('beforeend',`<circle class="rnn-signal memory" r="6"><animateMotion path="${d}" dur="0.85s" fill="freeze"/><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.12;0.85;1" dur="0.85s" fill="freeze"/></circle>`);});}
  }
  $('Step').onclick=()=>{stop();advance(false);};
  $('Play').onclick=()=>{if(timer!==null){stop();return;}if(motion?.matches||$('Demo').hidden)return;progress=-1;$('Play').textContent='Pause';$('Play').setAttribute('aria-pressed','true');const tick=()=>{if($('Demo').hidden||document.hidden){stop();return;}advance(true);timer=setTimeout(()=>{if(progress===stages.length-1)stop();else tick();},1000);};tick();};
  function syncMotion(){stop();$('Play').disabled=!!motion?.matches;$('MotionNote').hidden=!motion?.matches;}
  motion?.addEventListener?.('change',syncMotion);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  const picker=$('Picker'),button=$('PickerButton'),menu=$('PickerMenu');
  function closePicker(focus=false){menu.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus();}
  function reset(){stop();target=examples[exampleIndex].target;selected=2;progress=-1;closePicker();button.textContent=examples[exampleIndex].name;button.setAttribute('aria-label','Try an example: '+button.textContent);[...menu.children].forEach((n,i)=>n.setAttribute('aria-selected',String(i===exampleIndex)));draw();}
  examples.forEach((example,i)=>{const option=document.createElement('button');option.type='button';option.tabIndex=-1;option.setAttribute('role','option');option.textContent=example.name;option.onclick=()=>{exampleIndex=i;reset();button.focus();};menu.append(option);});
  function openPicker(){menu.hidden=false;button.setAttribute('aria-expanded','true');menu.children[exampleIndex].focus();}
  button.onclick=()=>menu.hidden?openPicker():closePicker();
  picker.onkeydown=e=>{if(!['ArrowDown','ArrowUp','Home','End','Escape','Tab'].includes(e.key))return;e.stopPropagation();if(e.key==='Tab'){closePicker();return;}e.preventDefault();if(e.key==='Escape'){closePicker(true);return;}if(menu.hidden){openPicker();return;}const options=[...menu.children],i=options.indexOf(document.activeElement);options[e.key==='Home'?0:e.key==='End'?options.length-1:(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length].focus();};
  document.addEventListener('click',e=>{if(!picker.contains(e.target))closePicker();});
  $('Reset').onclick=reset;
  window.cancelLayerPlayback=()=>{stop();closePicker();};
  const demo=$('Demo');
  new MutationObserver(()=>{if(demo.isConnected&&demo.hidden)window.cancelLayerPlayback();}).observe(demo,{attributes:true,attributeFilter:['hidden']});
  window.openLayerScene=()=>{closePicker();draw();};
  reset();syncMotion();
})();
