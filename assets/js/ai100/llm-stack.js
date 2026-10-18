(function(){
  'use strict';
  const examples=[
    {name:'Pronoun Context',text:'The team got pizzas and they were cold.',target:5},
    {name:'Distant Reference',text:'Marie arrived at the conference after a long flight. She was exhausted.',target:9},
    {name:'Word Relationships',text:'The dog chased the ball.',target:2},
    {name:'Longer Context',text:'Marie arrived at the conference after a long flight and a delayed train. She was exhausted.',target:13}
  ];
  const $=name=>document.getElementById('stack'+name);
  const escape=text=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let exampleIndex=0,target=5,selected=0,source=-1;
  const motion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const playback={phase:-1,playing:false,complete:false,timer:null,remaining:0,started:0};
  const durations=[1300,700,650];
  const vectorColor=v=>Math.abs(v)<.0005?'#e1e5e3':`hsl(${v<0?270:215} 45% ${85-45*Math.abs(v)/4}%)`;
  function cells(values,x,y,label){return values.map((v,d)=>`<g data-state-value="${v}" data-tooltip="${escape(label)}, dimension ${d+1}: ${v.toFixed(3)}"><rect x="${x+d*57}" y="${y}" width="50" height="30" rx="5" fill="${vectorColor(v)}"/></g>`).join('');}
  // Illustrative repeated updates, deliberately not a transformer simulation.
  function representations(words){
    const states=[words.map(window.llmQKModel.representation)];
    for(let layer=0;layer<3;layer++)states.push(states[layer].map((v,i)=>v.map((n,d)=>.75*n+.25*states[layer].slice(0,i+1).reduce((sum,x)=>sum+x[(d+1)%3],0)/(i+1))));
    return states;
  }
  let inspectedLayer=0,previewSource=-1,columns=8;
  const tokenColumns=()=>Math.max(3,Math.min(8,Math.floor(($('Tokens').clientWidth||940)/115)));
  function highlightSource(i){
    previewSource=i<=target?i:-1;
    $('Connections').classList.toggle('inspecting',previewSource>=0);
    $('Connections').querySelectorAll('[data-source]').forEach(n=>n.classList.toggle('inspected',Number(n.dataset.source)===previewSource));
    $('Tokens').querySelectorAll('[data-inspect]').forEach(n=>n.setAttribute('aria-pressed',String(Number(n.dataset.inspect)===source)));
    const words=examples[exampleIndex].text.split(' '),layer=inspectedLayer;
    const incoming=layer===0?'initial representations':`representations already updated by Layer ${layer}`;
    $('Explanation').textContent=previewSource<0
      ?`Transformer Layer ${layer+1}: Uses ${incoming}. This layer updates the representation of ${words[target]} using information from permitted positions. All token positions are processed; we're following one.`
      :`${words[previewSource]} - available context for ${words[target]} at Layer ${layer+1}. This layer uses ${layer===0?'the initial representation of '+words[previewSource]:'the representation of '+words[previewSource]+' updated by Layer '+layer}.`;
  }
  function connections(){
    const overlay=$('Connections'),base=$('Visual').getBoundingClientRect();
    const layer=$('Diagram').querySelector(`[data-stage="${inspectedLayer}"] rect`);
    if(!layer)return;
    const end=layer.getBoundingClientRect(),x=end.left+end.width-base.left,y=end.top-base.top+end.height/2;
    overlay.setAttribute('viewBox',`0 0 ${base.width||940} ${base.height||700}`);
    overlay.dataset.layer=String(inspectedLayer);
    overlay.innerHTML=Array.from($('Tokens').querySelectorAll('[data-token]')).slice(0,target+1).map((n,i)=>{
      const tile=n.querySelector('rect').getBoundingClientRect(),sx=tile.left-base.left+tile.width/2,sy=tile.bottom-base.top;
      const lane=(base.width||940)-2-i%4*2,turn=sy+10;
      return `<path class="attention-connection${i===target?' target-connection':''}" data-source="${i}" stroke-width="2" d="M${sx} ${sy}Q${sx} ${turn} ${sx+6} ${turn}H${lane-6}Q${lane} ${turn} ${lane} ${turn+6}V${y-8}Q${lane} ${y} ${lane-8} ${y}H${x}"/>`;
    }).join('');
    highlightSource(previewSource);
  }
  const qkvReminder='How does self-attention gather context?\nQuery: What information am I looking for?\nKey: What information can I be matched on?\nValue: What information do I contribute?';
  function phaseIndicators(layer){
    if(!$('Phase'))return;
    const current=playback.phase<0?-1:Math.floor(playback.phase/3),phase=playback.phase%3;
    const center=127+layer*86,names=['Gather Context','Process & Update','Pass Forward'];
    $('Phase').dataset.layer=String(layer);
    $('Phase').setAttribute('aria-label','Layer '+(layer+1)+' processing phases');
    $('Phase').innerHTML='<text class="rnn-svg-small stack-phase-copy" x="-145" y="'+(center-60)+'" font-weight="750">Transformer Processing Steps</text>'+names.map((name,i)=>{
      const state=current!==layer?'pending':i<phase||i===phase&&playback.complete?'completed':i===phase?'active':'pending';
      const y=center+(i-1)*30;
      const icon=state==='completed'?'<path d="m-140 '+y+' 3 3 5-6"/>':state==='active'?'<circle cx="-136" cy="'+y+'" r="2.5"/>':'';
      return '<g class="stack-phase-indicator '+state+'" data-phase-indicator="'+i+'" data-state="'+state+'" aria-label="'+name+': '+state+'"><path class="stack-phase-link" d="M65 '+y+'H140Q155 '+y+' 155 '+center+'H180"/><g class="stack-phase-icon"><circle cx="-136" cy="'+y+'" r="7"/>'+icon+'</g><text class="rnn-svg-small stack-phase-copy" x="-120" y="'+(y+5)+'">'+name+'</text></g>';
    }).join('');
    const info=$('QKVInfo');
    if(info){
      const label=$('Phase').querySelector('[data-phase-indicator="0"] text'),bounds=label.getBBox?.();
      info.setAttribute('transform','translate('+(bounds?.width?bounds.x+bounds.width+6:-10)+' '+(center-39)+')');
      if(info.hasAttribute('aria-describedby'))info.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));
    }
  }
  function inspect(index){
    const svg=$('Diagram');
    svg.querySelectorAll('[data-stage]').forEach(n=>{const active=Number(n.dataset.stage)===index;n.classList.toggle('selected',active);n.setAttribute('aria-pressed',String(active));});
    svg.querySelectorAll('[data-edge]').forEach(n=>n.classList.toggle('selected',[index,index+1].includes(Number(n.dataset.edge))));
    svg.querySelector('[data-final-flow]').classList.toggle('selected',index===2);
    const words=examples[exampleIndex].text.split(' '),word=words[target];
    const states=representations(words);
    const handoff=index<2?`Layer ${index+1} output = Layer ${index+2} input`:'Final output to prediction processing';
    $('Inspection').innerHTML=`<text class="rnn-svg-title" x="710" y="25">Representation entering Layer ${index+1}</text>${cells(states[index][target],628,40,'Selected layer input')}<text class="rnn-svg-title" x="710" y="115">Representation leaving Layer ${index+1}</text>${cells(states[index+1][target],628,130,'Selected layer output')}<text class="rnn-svg-small" x="710" y="208" fill="var(--green-dark)" style="fill:var(--green-dark)">${handoff}</text><g data-handoff-vector>${cells(states[index+1][target],628,224,index<2?`Layer ${index+2} input`:'Input to prediction processing')}</g>`;
    inspectedLayer=index;connections();highlightSource(source);phaseIndicators(index);
  }
  function draw(){
    const words=examples[exampleIndex].text.split(' ');

    columns=tokenColumns();
    const palette=['--blue','--purple','--teal','--amber','--red','--green'];
    $('Tokens').innerHTML=`<svg class="rnn-flow-diagram" viewBox="0 0 ${columns*115+20} ${Math.ceil(words.length/columns)*84}" role="group" aria-label="Select a target token">${words.map((word,i)=>{const x=66+i%columns*115,y=24+Math.floor(i/columns)*84;return `<g class="attention-token${i===target?' selected':''}${i>target?' future':''}" data-token="${i}" role="button" tabindex="${i===target?0:-1}" aria-pressed="${i===target}" aria-label="${escape(word)}, position ${i+1}; select target" style="--word-color:var(${palette[i%6]})"><rect class="rnn-flow-box memory" x="${x-52}" y="${y-19}" width="104" height="38" rx="8"/>${i===target?`<svg class="attention-target-icon" x="${x-44}" y="${y-8}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>`:''}<text class="rnn-svg-title" x="${x+(i===target?12:0)}" y="${y+5}">${escape(word)}</text></g>`;}).join('')}</svg>`;
    $('Target').textContent=`Selected target: ${words[target]} · Vectors below follow this position through the stack.`;
    const selectedText=$('Tokens').querySelector('.attention-token.selected text');
    if(selectedText?.getComputedTextLength?.()>68){
      selectedText.setAttribute('textLength','68');
      selectedText.setAttribute('lengthAdjust','spacingAndGlyphs');
    }
    $('Tokens').querySelectorAll('[data-token]').forEach(n=>{
      const i=Number(n.dataset.token);
      const choose=t=>{cancelPlayback();target=t;source=-1;draw();$('Tokens').querySelector(`[data-token="${target}"]`).focus();};
      n.onclick=e=>{if(e.shiftKey&&i<=target){cancelPlayback();source=i;highlightSource(i);}else choose(i);};
      n.onpointerenter=()=>{if(i<=target){cancelPlayback();highlightSource(i);}};n.onpointerleave=()=>highlightSource(source);
      n.onfocus=()=>{if(i<=target){cancelPlayback();highlightSource(i);}};n.onblur=()=>highlightSource(source);
      n.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End','Enter',' '].includes(e.key))return;e.preventDefault();e.stopPropagation();choose(e.key==='Home'?0:e.key==='End'?words.length-1:e.key==='ArrowLeft'?Math.max(0,i-1):e.key==='ArrowRight'?Math.min(words.length-1,i+1):i);};
    });
    $('Tokens').querySelectorAll('[data-inspect]').forEach(n=>{
      const i=Number(n.dataset.inspect),choose=()=>{source=i;highlightSource(i);};
      n.onclick=choose;n.onfocus=()=>highlightSource(i);n.onblur=()=>highlightSource(source);
      n.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();choose();}};
    });
    const states=representations(words);
    const edges=[[0,68,106],[1,148,192],[2,234,278],[3,320,364]];
    $('Diagram').innerHTML=`<svg class="rnn-flow-diagram" viewBox="-170 -12 940 548" role="group" aria-label="Three illustrative transformer layers and their information flow"><defs><marker id="stack-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker></defs><g id="stackTokenLabel" class="stack-token-label"><rect x="${190-Math.max(44,words[target].length*8+16)}" y="2" width="${Math.max(44,words[target].length*8+16)}" height="28" rx="5"/><text class="rnn-svg-title" x="${190-Math.max(44,words[target].length*8+16)/2}" y="21">${escape(words[target])}</text></g><text id="stackTitleDot" class="rnn-svg-title" x="200" y="21" aria-hidden="true">&#183;</text><text id="stackRepresentationTitle" class="rnn-svg-title" x="300" y="21">Initial Representation</text><g id="stackCurrentVector">${cells(states[0][target],218,30,'Stack input')}</g>${edges.map(([i,a,b])=>`<path class="layer-path" data-edge="${i}" d="M300 ${a}V${b}"/>`).join('')}${[0,1,2].map(i=>`<g data-stage="${i}" role="button" tabindex="0" aria-label="Transformer Layer ${i+1}" aria-pressed="false"><rect class="rnn-flow-box memory" x="180" y="${106+i*86}" width="240" height="42" rx="8"/><svg class="stack-layer-icon" x="202" y="${117+i*86}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m12 2 10 5-10 5L2 7Z"/><path d="m2 12 10 5 10-5M2 17l10 5 10-5"/></svg><text class="rnn-svg-title" x="314" y="${133+i*86}">Transformer Layer ${i+1}</text></g>`).join('')}<text id="stackOutputDot" class="rnn-svg-title" x="180" y="386" aria-hidden="true">&#183;</text><text id="stackOutputTitle" class="rnn-svg-title" x="300" y="386">Updated representation</text><g id="stackOutputLabel" class="stack-token-label"><rect x="405" y="367" width="${Math.max(44,words[target].length*9+16)}" height="28" rx="5"/><text class="rnn-svg-title" x="${405+Math.max(44,words[target].length*9+16)/2}" y="386">${escape(words[target])}</text></g><g id="stackOutputVector">${cells(states[3][target],218,396,'Stack output')}</g><path class="layer-path" data-final-flow d="M300 438V482"/><rect class="rnn-flow-box" x="160" y="484" width="280" height="42" rx="8"/><text class="rnn-svg-title" x="300" y="511">Toward Next-Token Prediction</text><g id="stackPhase" role="status" aria-live="polite" aria-atomic="true"></g><g id="stackQKVInfo" class="attention-info-icon" tabindex="0" role="button" aria-label="How does self-attention gather context?" data-tooltip="${escape(qkvReminder)}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7h.01" stroke-linecap="round"/></svg></g><g id="stackInspection" display="none" aria-hidden="true"></g></svg>`;
    const info=$('QKVInfo');let toggledOpen=false;
    const dismiss=()=>{toggledOpen=false;info.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));};
    const toggle=()=>{if(toggledOpen){dismiss();return;}toggledOpen=true;info.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));};
    info.onclick=e=>{e.stopPropagation();toggle();};
    info.onkeydown=e=>{if(['Enter',' ','Escape'].includes(e.key)){e.preventDefault();e.stopPropagation();if(e.key==='Escape')dismiss();else toggle();}};
    info.addEventListener('focusout',()=>{toggledOpen=false;});
    info.addEventListener('pointerout',()=>{toggledOpen=false;});
    // Measure SVG text so the badge stays beside the heading with the active font.
    const badge=$('TokenLabel'),badgeText=badge.querySelector('text'),badgeRect=badge.querySelector('rect');
    const titleBounds=$('RepresentationTitle').getBBox?.();
    if(titleBounds?.width){
      const width=Math.max(44,badgeText.getComputedTextLength()+16),right=titleBounds.x-28;
      $('TitleDot').setAttribute('x',titleBounds.x-14);
      badgeRect.setAttribute('x',right-width);badgeRect.setAttribute('width',width);
      badgeText.setAttribute('x',right-width/2);
      badgeRect.setAttribute('y',titleBounds.y-4);
      badgeRect.setAttribute('height',titleBounds.height+8);
    }
    const outputTitle=$('OutputTitle'),outputLabel=$('OutputLabel'),outputText=outputLabel.querySelector('text'),outputRect=outputLabel.querySelector('rect');
    const outputBounds=outputTitle.getBBox?.();
    if(outputBounds?.width){
      const width=Math.max(44,outputText.getComputedTextLength()+16);
      const titleX=300,left=300-outputBounds.width/2-28-width;
      $('OutputDot').setAttribute('x',left+width+14);
      outputTitle.setAttribute('x',titleX);
      outputRect.setAttribute('x',left);outputRect.setAttribute('width',width);
      outputRect.setAttribute('y',outputBounds.y-4);outputRect.setAttribute('height',outputBounds.height+8);
      outputText.setAttribute('x',left+width/2);
    }
    // Extend each selected-word label to the left, preserving the centered heading.
    [badge,outputLabel].forEach(label=>{
      const rect=label.querySelector('rect'),x=Number(rect.getAttribute('x')),y=Number(rect.getAttribute('y')),height=Number(rect.getAttribute('height'));
      rect.setAttribute('x',x-22);
      rect.setAttribute('width',Number(rect.getAttribute('width'))+22);
      label.insertAdjacentHTML('beforeend',`<svg class="stack-target-icon" x="${x-16}" y="${y+(height-16)/2}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>`);
    });
    $('Diagram').querySelectorAll('[data-stage]').forEach(n=>{
      const i=Number(n.dataset.stage),choose=()=>{cancelPlayback();selected=i;inspect(i);};
      n.onclick=choose;n.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();choose();}};
      n.onfocus=()=>{cancelPlayback();inspect(i);};n.onblur=()=>{if(playback.phase<0)inspect(selected);};
      n.onpointerenter=()=>{cancelPlayback();inspect(i);};n.onpointerleave=()=>{if(playback.phase<0)inspect(selected);};
    });
    inspect(selected);
  }
  function clearEffects(){
    $('Demo').querySelectorAll('.stack-transient').forEach(n=>n.remove());
    $('Demo').querySelectorAll('.stack-processing,.stack-active-flow,.stack-active-vector,.stack-arriving').forEach(n=>n.classList.remove('stack-processing','stack-active-flow','stack-active-vector','stack-arriving'));
    $('Connections').classList.remove('stack-gathering');
    $('TokenLabel')?.classList.remove('stack-flight-destination');
  }
  function controls(){
    $('Demo').dataset.playing=String(playback.playing);
    const label=playback.playing?'Pause':playback.phase===8&&playback.complete?'Replay':'Play';
    $('Play').setAttribute('aria-label',label);$('Play').dataset.tooltip=label;
    $('Play').setAttribute('aria-pressed',String(playback.playing));
    $('Play').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="'+(playback.playing?'M7 5v14M17 5v14':'M7 4l13 8-13 8z')+'"/></svg>';
    $('Step').disabled=playback.phase===8&&playback.complete;
  }
  function vectorIndex(){
    if(playback.phase<0)return 0;
    const layer=Math.floor(playback.phase/3),phase=playback.phase%3;
    return layer+(phase===2||phase===1&&playback.complete?1:0);
  }
  function updateVectors(){
    const states=representations(examples[exampleIndex].text.split(' ')),index=vectorIndex();
    if(!$('CurrentVector'))return;
    $('CurrentVector').innerHTML=cells(states[index][target],218,30,playback.phase<0?'Stack input':'Current representation');
    $('OutputVector').innerHTML=cells(states[playback.phase<0?3:index][target],218,396,'Stack output');
  }
  function motionTimelines(paused){
    [$('Connections'),$('Diagram').firstElementChild].forEach(svg=>{if(paused)svg?.pauseAnimations?.();else svg?.unpauseAnimations?.();});
  }
  function beginEffects(){
    // Dynamic SMIL elements must start now, not at the SVG document's time zero.
    $('Demo').querySelectorAll('.stack-transient animate,.stack-transient animateMotion,.stack-transient.animate-effect').forEach(n=>{
      n.setAttribute('begin','indefinite');n.beginElementAt?.(Number(n.dataset.delay||0));
    });
  }
  function particles(path,duration){
    for(let i=0;i<3;i++){
      const delay=i*duration*.1/1000,dur=duration*.8/1000;
      $('Connections').insertAdjacentHTML('beforeend',`<g class="stack-transient stack-pulse" opacity="0" aria-hidden="true"><circle class="stack-particle-halo" r="5"/><circle class="stack-particle-core" r="2.5"/><animateMotion data-delay="${delay}" path="${path}" dur="${dur}s" fill="freeze"/><animate data-delay="${delay}" attributeName="opacity" values="0;1;1;0" keyTimes="0;.08;.9;1" dur="${dur}s" fill="freeze"/></g>`);
    }
  }
  function tokenFlight(){
    const base=$('Visual').getBoundingClientRect(),tile=$('Tokens').querySelector('[data-token="'+target+'"] rect').getBoundingClientRect(),badge=$('TokenLabel').querySelector('rect').getBoundingClientRect();
    const sx=tile.left-base.left+tile.width/2,sy=tile.top-base.top+tile.height/2,ex=badge.left-base.left+badge.width/2,ey=badge.top-base.top+badge.height/2;
    const attributes=(name,from,to)=>`<animate attributeName="${name}" from="${from}" to="${to}" dur=".6s" fill="freeze"/>`;
    const word=escape(examples[exampleIndex].text.split(' ')[target]);
    $('TokenLabel').classList.add('stack-flight-destination');
    $('Connections').insertAdjacentHTML('beforeend',`<g class="stack-transient stack-token-flight" aria-hidden="true"><rect x="${-tile.width/2}" y="${-tile.height/2}" width="${tile.width}" height="${tile.height}" rx="5">${attributes('x',-tile.width/2,-badge.width/2)}${attributes('y',-tile.height/2,-badge.height/2)}${attributes('width',tile.width,badge.width)}${attributes('height',tile.height,badge.height)}</rect><text x="0" y="0" dominant-baseline="central" style="font-size:${17*tile.height/38}px">${word}${attributes('font-size',17*tile.height/38,17*badge.height/28)}</text><animateMotion path="M${sx} ${sy}C${sx} ${sy+40} ${ex} ${ey-40} ${ex} ${ey}" dur=".6s" fill="freeze"/><animate attributeName="opacity" values="1;1;0" keyTimes="0;.95;1" dur=".65s" fill="freeze"/></g>`);
    $('TokenLabel').insertAdjacentHTML('beforeend','<animate class="stack-transient animate-effect" data-delay=".6" attributeName="opacity" from="0" to="1" dur=".05s" fill="freeze"/>');
    $('CurrentVector').insertAdjacentHTML('beforeend','<animate class="stack-transient animate-effect" data-delay=".6" attributeName="opacity" values="1;.55;1" dur=".3s" fill="freeze"/>');
  }
  function transformVector(layer){
    const states=representations(examples[exampleIndex].text.split(' '));
    // Colors interpolate to the existing model output; values commit at phase completion.
    [$('CurrentVector'),$('OutputVector')].forEach(g=>g.querySelectorAll('rect').forEach((rect,d)=>{
      rect.insertAdjacentHTML('beforeend',`<animate class="stack-transient animate-effect" attributeName="fill" from="${vectorColor(states[layer][target][d])}" to="${vectorColor(states[layer+1][target][d])}" dur="${playback.remaining/1000}s" fill="freeze"/>`);
    }));
    const y=106+layer*86;
    $('Diagram').firstElementChild.insertAdjacentHTML('beforeend',`<line class="stack-transient stack-processing-sweep" x1="180" x2="180" y1="${y+5}" y2="${y+37}" aria-hidden="true"><animate attributeName="x1" from="180" to="420" dur="${playback.remaining/1000}s" fill="freeze"/><animate attributeName="x2" from="180" to="420" dur="${playback.remaining/1000}s" fill="freeze"/><animate attributeName="opacity" values="0;.7;0" dur="${playback.remaining/1000}s" fill="freeze"/></line>`);
  }
  function movingVector(path,layer){
    const values=representations(examples[exampleIndex].text.split(' '))[layer+1][target];
    $('Diagram').firstElementChild.insertAdjacentHTML('beforeend',`<g class="stack-transient stack-moving-vector" aria-hidden="true"><g transform="scale(.36)">${cells(values,-82,-15,'Moving representation')}</g><animateMotion path="${path}" dur="${playback.remaining/1000}s" fill="freeze"/></g>`);
  }
  function paintPhase(animate=false){
    clearEffects();updateVectors();controls();
    if(playback.phase<0){phaseIndicators(selected);return;}
    const layer=Math.floor(playback.phase/3),phase=playback.phase%3;
    selected=phase===2&&playback.complete&&layer<2?layer+1:layer;
    inspect(selected);
    $('Demo').dataset.phase=String(playback.phase);
    if((phase===0&&layer>0)||(phase===2&&playback.complete&&layer<2)){
      $('Diagram').querySelector('[data-stage="'+selected+'"]').classList.add('stack-arriving');
    }
    if(phase===0){
      $('Connections').classList.add('stack-gathering');$('CurrentVector').classList.add('stack-active-vector');
      if(animate){$('Connections').querySelectorAll('.attention-connection').forEach(n=>particles(n.getAttribute('d'),playback.remaining));if(layer===0)tokenFlight();}
    }else if(phase===1){
      if(!playback.complete)$('Diagram').querySelector('[data-stage="'+layer+'"]').classList.add('stack-processing');
      $('CurrentVector').classList.add('stack-active-vector');
      if(animate)transformVector(layer);
    }else{
      const paths=[...$('Diagram').querySelectorAll('[data-edge="'+(layer+1)+'"]'+(layer===2?', [data-final-flow]':''))];
      paths.forEach(n=>{n.classList.add('stack-active-flow');if(animate&&n.hasAttribute('data-edge'))movingVector(n.getAttribute('d'),layer);});
      if(layer===2)$('OutputVector').classList.add('stack-active-vector');
    }
    if(animate){motionTimelines(false);beginEffects();}
  }
  function stopTimer(){clearTimeout(playback.timer);playback.timer=null;}
  function pause(){
    if(playback.timer!==null)playback.remaining=Math.max(0,playback.remaining-(Date.now()-playback.started));
    stopTimer();playback.playing=false;motionTimelines(true);controls();
  }
  function cancelPlayback(){
    stopTimer();playback.playing=false;playback.phase=-1;playback.complete=false;playback.remaining=0;
    delete $('Demo').dataset.phase;clearEffects();motionTimelines(false);phaseIndicators(selected);updateVectors();controls();
  }
  function completePhase(){playback.complete=true;paintPhase();}
  function advance(){
    if(playback.phase>=8)return;
    playback.phase++;playback.complete=false;playback.remaining=durations[playback.phase%3];
    if(motion?.matches)playback.complete=true;
    paintPhase(playback.playing&&!motion?.matches);
  }
  function schedule(){
    stopTimer();playback.started=Date.now();
    playback.timer=setTimeout(()=>{
      playback.timer=null;
      if(!playback.playing)return;
      completePhase();
      if(playback.phase===8){playback.playing=false;controls();return;}
      advance();schedule();
    },playback.remaining);
  }
  function play(){
    if(playback.playing){pause();return;}
    if(playback.phase===8&&playback.complete)cancelPlayback();
    source=-1;previewSource=-1;playback.playing=true;
    if(playback.phase<0||playback.complete)advance();else motionTimelines(false);
    schedule();controls();
  }
  function step(){
    stopTimer();playback.playing=false;
    if(playback.phase>=8){completePhase();controls();return;}
    if(playback.phase>=0&&!playback.complete)completePhase();
    advance();completePhase();
  }
  const picker=$('Picker'),button=$('PickerButton'),menu=$('PickerMenu');
  function closePicker(focus=false){menu.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus();}
  function reset(){target=examples[exampleIndex].target;cancelPlayback();selected=0;source=-1;closePicker();button.textContent=examples[exampleIndex].name;button.setAttribute('aria-label','Try an example: '+button.textContent);[...menu.children].forEach((n,i)=>n.setAttribute('aria-selected',String(i===exampleIndex)));draw();}
  examples.forEach((example,i)=>{const option=document.createElement('button');option.type='button';option.tabIndex=-1;option.setAttribute('role','option');option.textContent=example.name;option.onclick=()=>{exampleIndex=i;reset();button.focus();};menu.append(option);});
  function openPicker(){menu.hidden=false;button.setAttribute('aria-expanded','true');menu.children[exampleIndex].focus();}
  button.onclick=()=>menu.hidden?openPicker():closePicker();
  picker.onkeydown=e=>{if(!['ArrowDown','ArrowUp','Home','End','Escape','Tab'].includes(e.key))return;e.stopPropagation();if(e.key==='Tab'){closePicker();return;}e.preventDefault();if(e.key==='Escape'){closePicker(true);return;}if(menu.hidden){openPicker();return;}const options=[...menu.children],i=options.indexOf(document.activeElement);options[e.key==='Home'?0:e.key==='End'?options.length-1:(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length].focus();};
  document.addEventListener('click',e=>{if(!picker.contains(e.target))closePicker();});
  $('Play').onclick=play;
  $('Step').onclick=step;
  $('Reset').onclick=()=>{exampleIndex=0;reset();};
  window.openStackScene=()=>{closePicker();draw();};
  window.closeStackScene=()=>{cancelPlayback();closePicker();};
  let lastWidth=-1;
  function resize(){const width=$('Visual').getBoundingClientRect().width;if(width===lastWidth)return;lastWidth=width;if(playback.phase>=0)cancelPlayback();if(columns!==tokenColumns())draw();else connections();}
  window.addEventListener('resize',resize);
  if(window.ResizeObserver)new ResizeObserver(resize).observe($('Visual'));
  $('Visual').addEventListener('scroll',()=>{if(playback.phase>=0)cancelPlayback();connections();},true);
  document.fonts?.ready.then(connections);
  motion?.addEventListener?.('change',()=>{pause();if(motion.matches&&playback.phase>=0)completePhase();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  const demo=$('Demo');
  new MutationObserver(()=>{if(demo.isConnected&&demo.hidden&&playback.phase>=0)cancelPlayback();}).observe(demo,{attributes:true,attributeFilter:['hidden']});
  reset();
})();
