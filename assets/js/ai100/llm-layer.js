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
    ['norm1','Normalization before attention','Helps keep numerical representations well-behaved before self-attention.','input','norm1'],
    ['attention','Self-attention','Incorporates information from this position and earlier permitted positions, using the weighted-Value idea from Scenes 1–3.','norm1','attention'],
    ['residual1','First residual connection','Combines the original information with the newly transformed information by addition. The bypass carries the layer input.','input','residual1'],
    ['norm2','Normalization before feed-forward','Helps keep the combined numerical representation well-behaved before feed-forward processing.','residual1','norm2'],
    ['feedForward','Feed-forward network',"Applies an additional learned transformation to each token’s representation. The same network is applied independently at every position.",'norm2','feedForward'],
    ['output','Second residual connection','Combines the incoming information with the feed-forward transformation by addition. The bypass starts after the first addition.','residual1','output'],
    ['updated','Updated token representation','This numerical representation can feed another transformer layer. It is not a predicted word.','output','output']
  ];
  const motion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let exampleIndex=0,target=5,selected=0,progress=-1,timer=null,result,playing=false,complete=false,remaining=0,started=0;
  const paths=[['norm1','M390 60V136'],['attention','M390 174V204'],['residual1','M390 242V278'],['norm2','M390 310V394'],['feedForward','M390 432V462'],['output','M390 596V634'],['updated','M390 666V706'],['residual1','M390 96H150V294H374'],['output','M390 340H150V650H374']];
  // Approved 50 × 30 vector cells, sign hues and linear intensity mapping.
  // Fixed 0–4 magnitude scale covers this layer's larger residual stream.
  const vectorColor=v=>Math.abs(v)<.0005?'#e1e5e3':`hsl(${v<0?270:215} 45% ${85-45*Math.abs(v)/4}%)`;
  function cells(values,x,y,label){return values.map((v,d)=>`<g data-state-value="${v}" data-tooltip="${escape(label)}, dimension ${d+1}: ${v.toFixed(3)}"><rect x="${x+d*57}" y="${y}" width="50" height="30" rx="5" fill="${vectorColor(v)}"/></g>`).join('');}
  function controls(){
    $('Demo').dataset.playing=String(playing);
    const label=playing?'Pause':progress===7&&complete?'Replay':'Play';
    $('Play').setAttribute('aria-label',label);$('Play').dataset.tooltip=label;
    $('Play').setAttribute('aria-pressed',String(playing));
    $('Play').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="'+(playing?'M7 5v14M17 5v14':'M7 4l13 8-13 8z')+'"/></svg>';
    $('Step').disabled=progress===7&&complete;
  }
  function timelines(paused){[$('Diagram').firstElementChild,$('Connections')].forEach(svg=>paused?svg?.pauseAnimations?.():svg?.unpauseAnimations?.());}
  function clearEffects(preserveBypasses=false){
    $('Demo').querySelectorAll('.layer-transient').forEach(n=>{if(!preserveBypasses||!n.classList.contains('layer-residual-flight'))n.remove();});
    $('Diagram').querySelectorAll('.layer-active-vector,.layer-processing').forEach(n=>n.classList.remove('layer-active-vector','layer-processing'));
    $('Connections').replaceChildren();
  }
  function stop(){clearTimeout(timer);timer=null;playing=false;progress=-1;complete=false;clearEffects();timelines(false);controls();}
  function connections(){
    $('Connections').replaceChildren();if(selected!==2)return;
    const base=$('Visual').getBoundingClientRect(),end=$('Diagram').querySelector('[data-stage="attention"] rect').getBoundingClientRect();
    const x=end.right-base.left,y=end.top-base.top+end.height/2;
    $('Connections').setAttribute('viewBox','0 0 '+(base.width||940)+' '+(base.height||700));
    $('Connections').innerHTML=[...$('Tokens').querySelectorAll('[data-token]')].slice(0,target+1).map((n,i)=>{
      const tile=n.querySelector('rect').getBoundingClientRect(),sx=tile.left-base.left+tile.width/2,sy=tile.bottom-base.top,lane=(base.width||940)-2-i%4*2;
      return '<path class="attention-connection'+(i===target?' target-connection':'')+'" data-source="'+i+'" stroke-width="2" d="M'+sx+' '+sy+'Q'+sx+' '+(sy+10)+' '+(sx+6)+' '+(sy+10)+'H'+(lane-6)+'Q'+lane+' '+(sy+10)+' '+lane+' '+(sy+16)+'V'+(y-8)+'Q'+lane+' '+y+' '+(lane-8)+' '+y+'H'+x+'"/>';
    }).join('');
  }
  function inspect(index){
    const [key,title,description]=stages[index];
    $('Diagram').querySelectorAll('[data-stage]').forEach(n=>{const active=n.dataset.stage===key;n.classList.toggle('selected',active);if(n.getAttribute('role')==='button')n.setAttribute('aria-pressed',String(active));});
    // Show the outgoing path as well as all incoming paths, including both bypasses.
    const next=paths.find(([k])=>k===stages[index+1]?.[0]);
    if(next)$('Diagram').querySelectorAll('.layer-path').forEach(n=>{if(n.getAttribute('d')===next[1])n.classList.add('selected');});
    $('Explanation').textContent=title+': '+description;
    connections();
  }
  function representationLabel(word,y,title){
    const w=Math.max(44,word.length*8+16),x=265-w-22;
    return '<g class="stack-token-label"><rect x="'+x+'" y="'+(y-19)+'" width="'+(w+22)+'" height="28" rx="5"/><svg class="stack-target-icon" x="'+(x+6)+'" y="'+(y-13)+'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg><text class="rnn-svg-title" x="'+(x+22+w/2)+'" y="'+y+'">'+escape(word)+'</text></g><text class="rnn-svg-title" x="279" y="'+y+'">&#183;</text><text class="rnn-svg-title" x="390" y="'+y+'">'+title+'</text>';
  }
  function draw(){
    const words=examples[exampleIndex].text.split(' ');
    result=window.llmLayerModel.calculate(words,target);
    const columns=Math.max(3,Math.min(8,Math.floor(($('Tokens').clientWidth||940)/115)));
    const palette=['--blue','--purple','--teal','--amber','--red','--green'];
    $('Tokens').innerHTML=`<svg class="rnn-flow-diagram" viewBox="0 0 ${columns*115+20} ${Math.ceil(words.length/columns)*84}" role="group" aria-label="Select a target token">${words.map((word,i)=>{const x=66+i%columns*115,y=24+Math.floor(i/columns)*84;return `<g class="attention-token${i===target?' selected':''}${i>target?' future':''}" data-token="${i}" role="button" tabindex="${i===target?0:-1}" aria-pressed="${i===target}" aria-label="${escape(word)}, position ${i+1}; select target" style="--word-color:var(${palette[i%6]})"><rect class="rnn-flow-box memory" x="${x-52}" y="${y-19}" width="104" height="38" rx="8"/>${i===target?`<svg class="attention-target-icon" x="${x-44}" y="${y-8}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>`:''}<text class="rnn-svg-title" x="${x+(i===target?12:0)}" y="${y+5}">${escape(word)}</text></g>`;}).join('')}</svg>`;
    $('Target').textContent=`Selected target: ${words[target]} · ${target+1} permitted positions · future positions unavailable`;
    const selectedText=$('Tokens').querySelector('.attention-token.selected text');
    if(selectedText?.getComputedTextLength?.()>68){
      selectedText.setAttribute('textLength','68');
      selectedText.setAttribute('lengthAdjust','spacingAndGlyphs');
    }
    $('Tokens').querySelectorAll('[data-token]').forEach(n=>{
      const i=Number(n.dataset.token);
      const choose=t=>{stop();target=t;selected=0;draw();$('Tokens').querySelector(`[data-token="${target}"]`).focus();};
      n.onclick=()=>choose(i);
      n.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End','Enter',' '].includes(e.key))return;e.preventDefault();e.stopPropagation();choose(e.key==='Home'?0:e.key==='End'?words.length-1:e.key==='ArrowLeft'?Math.max(0,i-1):e.key==='ArrowRight'?Math.min(words.length-1,i+1):i);};
    });
    const normalizationTooltip="Normalization: Adjusts numerical values to a more consistent scale so unusually large values don't dominate processing simply because of their magnitude.";
    const network=`<g aria-hidden="true">${[0,1,2].flatMap(i=>[0,1,2].map(j=>`<path class="layer-synapse" d="M545 ${379+i*18}L575 ${379+j*18}L605 ${397}"/>`)).join('')}${[[545,379,'blue'],[545,397,'blue'],[545,415,'blue'],[575,379,'purple'],[575,397,'purple'],[575,415,'purple'],[605,397,'green']].map(([x,y,c])=>`<circle${x===545?` data-network-input="${(y-379)/18}"`:""} cx="${x}" cy="${y}" r="6" fill="var(--${c})" stroke="#fff" stroke-width="2"/>`).join('')}</g>`;
    const stepIcon=(kind,x,y)=>{
      const artwork=kind==='normalize'?'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>':kind==='attention'?'<path d="M5 5l13 7M5 12h13M5 19l13-7"/><circle cx="5" cy="5" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="18" cy="12" r="3"/>':kind==='residual'?'<path d="M3 5h5l6 7M3 19h5l6-7M14 12h7m-3-3 3 3-3 3"/>':network;
      return '<svg class="layer-step-icon '+kind+'" x="'+x+'" y="'+y+'" width="22" height="22" viewBox="'+(kind==='network'?'539 373 72 48':'0 0 24 24')+'" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+artwork+'</svg>';
    };
    const block=(index,y,label,extra='')=>`<g data-stage="${stages[index][0]}" role="button" tabindex="0" aria-label="${stages[index][1]}" aria-pressed="false"${index===1||index===4?` data-tooltip="${escape(normalizationTooltip)}"`:""}><rect class="rnn-flow-box memory" x="270" y="${y}" width="240" height="${extra?134:38}" rx="8"/>${stepIcon(index===1||index===4?"normalize":index===2?"attention":"network",282,y+8)}<text class="rnn-svg-title" x="402" y="${y+24}">${label}</text>${index===1||index===4?`<svg class="attention-info-icon layer-normalization-info" x="484" y="${y+10}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7h.01" stroke-linecap="round"/></svg>`:""}${extra}</g>`;
    const merge=(index,y)=>`<g data-stage="${stages[index][0]}" role="button" tabindex="0" aria-label="${stages[index][1]}" aria-pressed="false"><rect class="layer-hit" x="350" y="${y-23}" width="220" height="46"/><circle class="rnn-flow-box memory" cx="390" cy="${y}" r="16"/><text class="rnn-svg-title" x="390" y="${y+6}">+</text>${stepIcon("residual",420,y-11)}<text class="rnn-svg-small layer-add-label" x="448" y="${y+5}">Residual addition</text></g>`;
    $('Diagram').innerHTML=`<svg class="rnn-flow-diagram" viewBox="0 0 940 790" role="group" aria-label="One simplified pre-normalization causal decoder layer"><defs><marker id="layer-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker></defs><g transform="translate(80 0)">${paths.map(([key,d],i)=>`<path class="layer-path${i>6?' layer-bypass':''}" data-stage="${key}" d="${d}"/>`).join('')}<circle class="layer-junction" data-stage="residual1" cx="390" cy="96" r="8" aria-label="Original input branches to normalization and the first residual bypass"/><circle class="layer-junction" data-stage="output" cx="390" cy="340" r="8" aria-label="First residual sum branches to normalization and the second residual bypass"/><text class="rnn-svg-small" x="158" y="84" style="text-anchor:start">Original input</text><text class="rnn-svg-small" x="158" y="328" style="text-anchor:start">Intermediate input</text><g data-stage="input" role="button" tabindex="0" aria-label="Input token representation" aria-pressed="false"><rect class="layer-hit" x="266" y="4" width="248" height="82" rx="8"/>${representationLabel(words[target],21,"Initial Representation")}${cells(result.input,308,30,'Layer input')}</g>${block(1,136,'Normalization')}${block(2,204,'Self-attention')}${merge(3,294)}${block(4,394,'Normalization')}${block(5,462,'Feed-forward network','<svg class="layer-network-demo" x="345" y="496" width="90" height="60" viewBox="539 373 72 48" aria-hidden="true" focusable="false">'+network+'</svg><text class="rnn-svg-small" x="390" y="580">Same network at each position</text>')}${merge(6,650)}<g data-stage="updated" role="button" tabindex="0" aria-label="Updated token representation" aria-pressed="false"><rect class="layer-hit" x="266" y="702" width="248" height="76" rx="8"/>${representationLabel(words[target],725,"Updated Representation")}${cells(result.output,308,738,'Layer output')}</g></g></svg>`;
    $('Diagram').querySelectorAll('[role="button"]').forEach(n=>{
      const index=stages.findIndex(s=>s[0]===n.dataset.stage);
      const choose=()=>{stop();selected=index;inspect(index);};
      n.onclick=choose;n.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();choose();}};
      n.onfocus=choose;

    });
    // Measure the active font, matching Scene 4's selected-word badge placement.
    $('Diagram').querySelectorAll('.stack-token-label').forEach(badge=>{
      const group=badge.parentNode,title=group.querySelector(':scope > text:last-of-type');
      const bounds=title?.getBBox?.();if(!bounds?.width)return;
      const text=badge.querySelector('text'),rect=badge.querySelector('rect'),icon=badge.querySelector('svg');
      const width=Math.max(44,text.getComputedTextLength()+16),right=bounds.x-28;
      rect.setAttribute('x',right-width-22);rect.setAttribute('width',width+22);
      text.setAttribute('x',right-width/2);icon.setAttribute('x',right-width-16);
      group.querySelector(':scope > text').setAttribute('x',bounds.x-14);
    });
    inspect(selected);
  }
  function movingVector(path,key,delay=0,duration=.85,persistent=false){
    $('Diagram').firstElementChild.insertAdjacentHTML('beforeend','<g class="layer-transient'+(persistent?' layer-residual-flight':'')+'" data-vector="'+key+'" transform="translate(80 0)" aria-hidden="true"><g opacity="0"><g transform="scale(.36)">'+cells(result[key],-82,-15,key)+'</g><animateMotion begin="indefinite" path="'+path+'" dur="'+duration+'s" data-delay="'+delay+'" fill="freeze"/><animate begin="indefinite" attributeName="opacity" values="0;1;1;0" keyTimes="0;0.02;0.99;1" dur="'+duration+'s" data-delay="'+delay+'" fill="freeze"/></g></g>');
  }
  function feedForwardInputs(){
    // Use norm2 directly: motion never changes the calculated representation.
    result.norm2.forEach((value,d)=>{
      const startX=390+(d-1)*57*.36,endX=352.5,endY=503.5+d*22.5;
      const path='M'+startX+' 445C'+(300-d*12)+' 445 '+(300-d*12)+' '+endY+' '+endX+' '+endY;
      $('Diagram').firstElementChild.insertAdjacentHTML('beforeend','<g class="layer-transient layer-network-input-flight" data-input="'+d+'" data-state-value="'+value+'" transform="translate(80 0)" aria-hidden="true"><g opacity="0"><rect x="-9" y="-5.4" width="18" height="10.8" rx="2" fill="'+vectorColor(value)+'"/><animateMotion begin="indefinite" path="'+path+'" dur="1.35s" keyPoints="0;0;1" keyTimes="0;0.25;1" calcMode="linear" fill="freeze"/><animate begin="indefinite" attributeName="opacity" values="0;1;1;0" keyTimes="0;0.05;0.92;1" dur="1.5s" fill="freeze"/></g></g>');
    });
  }
  function effects(){
    clearEffects(true);inspect(selected);
    if(progress===1)$('Diagram').querySelector('[data-stage="input"]').classList.add('layer-active-vector');
    if(progress===5)$('Diagram').querySelector('[data-stage="feedForward"][role="button"]').classList.add('layer-processing');
    if(progress===7)$('Diagram').querySelector('[data-stage="updated"]').classList.add('layer-active-vector');
    if(motion?.matches)return;
    const key=stages[progress][0];
    // Bypass flights survive stage changes and share the SVG pause/resume clock.
    if(progress===1)movingVector(paths[7][1].replace(/H374$/,'H390'),'input',.4,3.05,true);
    if(progress===4&&!$('Diagram').querySelector('.layer-residual-flight[data-vector="residual1"]'))movingVector(paths[8][1].replace(/H374$/,'H390'),'residual1',0,5.25,true);
    if(progress===3||progress===6){
      const first=progress===3,y=first?294:650;
      const bypassKey=first?'input':'residual1';
      if(!$('Diagram').querySelector('.layer-residual-flight[data-vector="'+bypassKey+'"]'))movingVector(paths[first?7:8][1].replace(/H374$/,'H390'),bypassKey,0,.85,true);
      movingVector(first?'M390 242V294':'M390 614V650',first?'attention':'feedForward');
      movingVector(first?'M390 310V388':'M390 666V700',first?'residual1':'output',.85,.5);
      // The first sum reaches the second junction during its downward departure.
      if(first)movingVector(paths[8][1].replace(/H374$/,'H390'),'residual1',.85+.5*30/78,6.85-(.85+.5*30/78),true);
      $('Diagram').firstElementChild.insertAdjacentHTML('beforeend','<circle class="layer-transient layer-combining" cx="470" cy="'+y+'" r="16" opacity="0"><animate begin="indefinite" attributeName="opacity" values="0;1;0" dur=".5s" data-delay=".75"/><animate begin="indefinite" attributeName="r" values="16;25;16" dur=".5s" data-delay=".75"/></circle>');
    }else if(progress===5){
      feedForwardInputs();
      // Carry the calculated feed-forward result from the network output to its exit.
      movingVector('M427.5 526C462 526 462 554 462 570V606Q462 614 450 614H390','feedForward',2,.85);
    }else{
      const path=paths.find(([k])=>k===key);
      // The residual stage already carries its sum down this connector.
      // Continue at its arrival point instead of replaying the same segment.
      const continuation=progress===4?'M390 388V394':progress===7?'M390 700V706':path?.[1];
      if(continuation)movingVector(continuation,stages[progress][3]);
    }
    if(progress===2)$('Connections').querySelectorAll('path').forEach(n=>{
      $('Connections').insertAdjacentHTML('beforeend','<g class="layer-transient" opacity="0"><circle class="stack-particle-halo" r="5"/><circle class="stack-particle-core" r="2.5"/><animateMotion begin="indefinite" path="'+n.getAttribute('d')+'" dur="1.1s"/><animate begin="indefinite" attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.9;1" dur="1.1s"/></g>');
    });
    timelines(false);
    $('Demo').querySelectorAll('.layer-transient animate,.layer-transient animateMotion').forEach(n=>{if(n.dataset.started)return;n.dataset.started='true';n.beginElementAt?.(Number(n.dataset.delay||0));});
  }
  function advance(animated){
    if(progress>=7)return;
    progress++;if(progress===0)progress=1;selected=progress;complete=false;remaining=progress===5?3100:progress===3||progress===6?1600:1300;
    if(animated)effects();else{clearEffects();inspect(selected);complete=true;}
    controls();
  }
  function pause(){if(timer!==null)remaining=Math.max(0,remaining-(Date.now()-started));clearTimeout(timer);timer=null;playing=false;timelines(true);controls();}
  function schedule(){started=Date.now();timer=setTimeout(()=>{timer=null;if(!playing)return;complete=true;clearEffects(true);if(progress===3||progress===6)$('Diagram').querySelector('.layer-residual-flight[data-vector="'+(progress===3?'input':'residual1')+'"]')?.remove();inspect(selected);if(progress===7){playing=false;controls();return;}advance(true);schedule();},remaining);}
  $('Step').onclick=()=>{pause();if(progress===7){clearEffects();complete=true;inspect(selected);controls();}else advance(false);};
  $('Play').onclick=()=>{if(playing){pause();return;}if($('Demo').hidden)return;if(progress===7&&complete)stop();playing=true;if(progress<0||complete)advance(true);else timelines(false);schedule();controls();};
  motion?.addEventListener?.('change',()=>{pause();clearEffects();complete=progress>=0;inspect(selected);controls();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  window.addEventListener('resize',()=>{stop();draw();});
  $('Visual').addEventListener('scroll',()=>{stop();inspect(selected);},true);
  document.fonts?.ready.then(connections);
  const picker=$('Picker'),button=$('PickerButton'),menu=$('PickerMenu');
  function closePicker(focus=false){menu.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus();}
  function reset(){stop();target=examples[exampleIndex].target;selected=0;progress=-1;closePicker();button.textContent=examples[exampleIndex].name;button.setAttribute('aria-label','Try an example: '+button.textContent);[...menu.children].forEach((n,i)=>n.setAttribute('aria-selected',String(i===exampleIndex)));draw();}
  examples.forEach((example,i)=>{const option=document.createElement('button');option.type='button';option.tabIndex=-1;option.setAttribute('role','option');option.textContent=example.name;option.onclick=()=>{exampleIndex=i;reset();button.focus();};menu.append(option);});
  function openPicker(){menu.hidden=false;button.setAttribute('aria-expanded','true');menu.children[exampleIndex].focus();}
  button.onclick=()=>menu.hidden?openPicker():closePicker();
  picker.onkeydown=e=>{if(!['ArrowDown','ArrowUp','Home','End','Escape','Tab'].includes(e.key))return;e.stopPropagation();if(e.key==='Tab'){closePicker();return;}e.preventDefault();if(e.key==='Escape'){closePicker(true);return;}if(menu.hidden){openPicker();return;}const options=[...menu.children],i=options.indexOf(document.activeElement);options[e.key==='Home'?0:e.key==='End'?options.length-1:(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length].focus();};
  document.addEventListener('click',e=>{if(!picker.contains(e.target))closePicker();});
  $('Reset').onclick=()=>{exampleIndex=0;reset();};
  window.cancelLayerPlayback=()=>{stop();closePicker();};
  const demo=$('Demo');
  new MutationObserver(()=>{if(demo.isConnected&&demo.hidden)window.cancelLayerPlayback();}).observe(demo,{attributes:true,attributeFilter:['hidden']});
  window.openLayerScene=()=>{closePicker();draw();};
  reset();
})();
