(function(root){
  'use strict';
  const model=root.llmResponseModel,initial=root.llmPredictionModel,view=root.llmPredictionView;
  const $=name=>document.getElementById('response'+name),motion=root.matchMedia('(prefers-reduced-motion: reduce)');
  let index=0,generated=[],temperature=1,strategy='greedy',result,chosen=null,phase=-1,ended=false;
  let playing=false,active=false,timer=null,remaining=0,started=0,revision=0,flight=null,animation=null;
  const durations=[1300,700,650,650];
  // One finite forward pass owned by the existing prediction phase, never a loop.
  let engineAnimations=[];
  const network=$('Network'),ns='http://www.w3.org/2000/svg';
  function svgNode(tag,attrs,parent=network){const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));parent.append(n);return n;}
  // Layer initializes before this scene. Clone its actual artwork, not a second
  // approximation of its geometry. The approved source scene remains untouched.
  const sourceNetwork=document.querySelector('#layerDiagram .layer-network-demo');
  network.setAttribute('viewBox',sourceNetwork.getAttribute('viewBox'));
  network.replaceChildren(...[...sourceNetwork.children].map(n=>n.cloneNode(true)));
  const circles=[...network.querySelectorAll('circle')];
  const columns=[...new Set(circles.map(n=>Number(n.getAttribute('cx'))))].sort((a,b)=>a-b);
  const nodes=columns.map((x,i)=>circles.filter(n=>Number(n.getAttribute('cx'))===x).map(n=>{n.classList.add('response-neuron');n.dataset.layer=i;return n;}));
  // Derive pulse routes from the cloned paths; shared output segments get one
  // pulse each, rather than stacking duplicate particles on the same line.
  const routes=new Map();
  network.querySelectorAll('.layer-synapse').forEach(path=>{
    path.classList.add('response-synapse');
    const points=path.getAttribute('d').match(/-?\d+(?:\.\d+)?/g).map(Number);
    for(let i=0;i<points.length-2;i+=2){const [x,y,nextX,nextY]=points.slice(i,i+4);routes.set(`${x},${y},${nextX},${nextY}`,{x,y,nextX,nextY,layer:columns.indexOf(x)});}
  });
  const edges=[...routes.values()];
  edges.forEach(edge=>{edge.pulse=svgNode('circle',{r:1.5,class:'response-engine-pulse'});});
  function clearEngine(){engineAnimations.forEach(a=>a.cancel());engineAnimations=[];$('Signals').replaceChildren();}
  function engineAnimate(element,frames){
    const a=element.animate(frames,{duration:durations[0],fill:'both',easing:'linear'});
    engineAnimations.push(a);return a;
  }
  function travel(element,x,y,nextX,nextY,start,end){
    const from=`translate(${x}px,${y}px)`,to=`translate(${nextX}px,${nextY}px)`;
    engineAnimate(element,[{offset:0,opacity:0,transform:from},{offset:start,opacity:0,transform:from},{offset:start+.01,opacity:1,transform:from},{offset:end-.01,opacity:1,transform:to},{offset:end,opacity:0,transform:to},{offset:1,opacity:0,transform:to}]);
  }
  function engineSignals(){
    const base=$('Signals').parentElement.getBoundingClientRect(),context=$('Tokens').querySelector('.attention-token.selected').getBoundingClientRect(),box=$('Process').getBoundingClientRect(),preview=$('Probabilities').parentElement.getBoundingClientRect();
    $('Signals').setAttribute('viewBox',`0 0 ${base.width||1} ${base.height||1}`);
    // Same 50x30 cells, 57-unit spacing, radius 5, numerical color map and .36
    // flight scale as Chapter 4. One group moves; its cells never fly separately.
    const vector=svgNode('g',{class:'response-context-vector','data-representation-kind':result.representationKind||'computed-layer-output'},$('Signals'));
    result.representation.forEach((value,i)=>svgNode('rect',{x:-82+i*57,y:-15,width:50,height:30,rx:5,fill:Math.abs(value)<.0005?'#e1e5e3':`hsl(${value<0?270:215} 45% ${85-45*Math.abs(value)/4}%)`,'data-state-value':value},vector));
    const inputs=nodes[0].map(n=>n.getBoundingClientRect()),middle=inputs[1];
    const x=middle.left+middle.width/2-base.left,y=middle.top+middle.height/2-base.top;
    const scale=(inputs[2].top-inputs[0].top)/114||.36;
    const destination=`translate(${x}px,${y}px) rotate(90deg) scale(${scale})`;
    const origin=`translate(${context.left+context.width/2-base.left}px,${context.bottom-base.top+8}px) scale(.36)`;
    // Route through the left gutter to avoid the title and status text.
    const lane=Math.max(12,box.left-base.left+4);
    const frames=motion.matches
      ?[{offset:0,opacity:0,transform:destination},{offset:.12,opacity:1,transform:destination},{offset:.42,opacity:1,transform:destination},{offset:.46,opacity:0,transform:destination},{offset:1,opacity:0,transform:destination}]
      :[{offset:0,opacity:0,transform:origin},{offset:.08,opacity:1,transform:origin},{offset:.14,opacity:1,transform:origin},{offset:.25,opacity:1,transform:`translate(${lane}px,${context.bottom-base.top+8}px) scale(.36)`},{offset:.35,opacity:1,transform:`translate(${lane}px,${y}px) rotate(90deg) scale(${scale})`},{offset:.42,opacity:1,transform:destination},{offset:.46,opacity:0,transform:destination},{offset:1,opacity:0,transform:destination}];
    engineAnimate(vector,frames);
    if(motion.matches)return;
    const pulse=()=>svgNode('circle',{r:2.5,class:'response-engine-pulse'},$('Signals'));
    const stacked=preview.top>=box.bottom;
    travel(pulse(),(stacked?box.left+box.width/2:box.right)-base.left,(stacked?box.bottom:box.top+box.height/2)-base.top,(stacked?preview.left+preview.width/2:preview.left)-base.left,(stacked?preview.top:preview.top+preview.height/2)-base.top,.8,.94);
  }
  function startEngine(){
    clearEngine();
    // Preserve solid node fills and sizes; an active border adds emphasis.
    nodes.forEach((group,i)=>group.forEach(n=>engineAnimate(n,[{offset:0,stroke:'#fff',strokeWidth:2},{offset:[.42,.6,.76][i],stroke:'#fff',strokeWidth:2,easing:'steps(1,end)'},{offset:[.43,.61,.77][i],stroke:'var(--green)',strokeWidth:2.5},{offset:1,stroke:'var(--green)',strokeWidth:2.5}])));
    const last=$('Tokens').querySelector('.attention-token.selected rect');
    engineAnimate(last,[{offset:0,strokeWidth:3},{offset:.08,strokeWidth:5},{offset:.14,strokeWidth:3},{offset:1,strokeWidth:3}]);
    $('EngineStages').querySelectorAll('span').forEach((n,i)=>{
      const start=[0,.46,.76][i],end=[.46,.76,1][i];
      engineAnimate(n,[{offset:0,opacity:i===0?1:0},{offset:start,opacity:1},{offset:end-.001,opacity:1},{offset:end,opacity:0},{offset:1,opacity:0}].map(frame=>({...frame,easing:'steps(1,end)'})));
    });
    engineSignals();
    if(!motion.matches)edges.forEach(e=>travel(e.pulse,e.x,e.y,e.nextX,e.nextY,e.layer===0?.46:.63,e.layer===0?.6:.76));
    engineAnimate($('Probabilities').parentElement,[{offset:0,outlineColor:'transparent'},{offset:.94,outlineColor:'transparent',easing:'steps(1,end)'},{offset:.95,outlineColor:'var(--purple)'},{offset:1,outlineColor:'var(--purple)'}]);
  }
  function rebuildEngine(){
    if(phase!==0)return;
    const elapsed=durations[0]-remaining+(timer!==null?performance.now()-started:0);
    startEngine();engineAnimations.forEach(a=>{a.currentTime=Math.min(durations[0],elapsed);if(!active)a.pause();});
  }
  function clearFlight(){animation?.cancel();animation=null;flight?.remove();flight=null;}
  function stopTimer(){if(timer!==null){clearTimeout(timer);remaining=Math.max(0,remaining-(performance.now()-started));timer=null;}revision++;}
  function pause(){stopTimer();playing=false;active=false;animation?.pause();engineAnimations.forEach(a=>a.pause());controls();}
  function cancelPending(){pause();phase=-1;chosen=null;clearFlight();clearEngine();refresh();}
  function controls(){
    const label=active?'Pause':'Play';
    $('Play').setAttribute('aria-label',label);$('Play').dataset.tooltip=label;$('Play').setAttribute('aria-pressed',String(active));
    $('Play').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+(active?'M7 5v14M17 5v14':'M7 4l13 8-13 8z')+'"/></svg>';
    $('Play').disabled=ended;$('Step').disabled=active||ended;
    $('Demo').dataset.phase=String(phase);$('Demo').dataset.paused=String(!active);
  }
  function tokens(){
    const words=[...initial.examples[index].text.split(' '),...generated];
    view.tokens($('Tokens'),{words,target:words.length-1},words.join(' '));
    const promptLength=words.length-generated.length;
    $('Tokens').querySelectorAll('.attention-token').forEach((n,i)=>{if(i>=promptLength)n.classList.add('response-generated');});
  }
  function refresh(){
    result=model.calculate(index,generated,temperature);tokens();
    view.probabilities($('Probabilities'),result);
    $('Probabilities').querySelectorAll('[data-candidate]').forEach(n=>{n.removeAttribute('aria-pressed');});
    $('Probabilities').hidden=ended;
    $('Count').textContent=`${generated.length} / ${model.limit} generated tokens`;
    $('Selected').hidden=true;
    $('Phase').textContent=ended?(generated.length>=model.limit?'Teaching demonstration limit reached: eight generated tokens.':'Complete: end-of-sequence selected.'):'Ready: use the current context to predict.';
    controls();
  }
  function schedule(){
    const version=++revision;started=performance.now();
    timer=setTimeout(()=>{timer=null;if(version!==revision||!active)return;advance();},remaining);
  }
  function moveToken(){
    if(motion.matches)return;
    // The highlighted row still belongs to the distribution used for this draw.
    // An omitted candidate departs from Other tokens, but flies with its real label.
    const row=$('Probabilities').querySelector('.prob-branch.selected');
    const source=row.querySelector('strong').getBoundingClientRect(),destination=$('Tokens').querySelector('.attention-token.selected').getBoundingClientRect();
    flight=document.createElement('span');flight.className='response-flight';flight.textContent=chosen.token;flight.setAttribute('aria-hidden','true');
    Object.assign(flight.style,{left:source.left+'px',top:source.top+'px'});document.body.append(flight);
    animation=flight.animate([{transform:'translate(0,0)'},{transform:`translate(${destination.left-source.left}px,${destination.top-source.top}px)`}],{duration:650,easing:'ease-in-out',fill:'forwards'});
  }
  function advance(){
    clearFlight();phase++;
    if(phase===0){result=model.calculate(index,generated,temperature);$('Phase').textContent='Predict: final-position representation to scores and probabilities.';startEngine();}
    if(phase===1){
      clearEngine();
      chosen=root.llmChooseToken(result.candidates,strategy);
      $('Selected').textContent=chosen.token+' · '+view.percent(chosen.probability);$('Selected').hidden=false;
      $('Phase').textContent='Select: '+chosen.token;
      const shown=result.shown.some(c=>c.token===chosen.token);
      $('Probabilities').querySelectorAll('.prob-branch').forEach(n=>n.classList.toggle('selected',shown?n.dataset.candidate===chosen.token:n.classList.contains('prediction-other')));
    }
    if(phase===2){
      if(chosen.token===model.EOS){ended=true;pause();refresh();return;}
      generated.push(chosen.token);tokens();moveToken();
      ended=generated.length>=model.limit;
      refresh();$('Phase').textContent='Append: the selected token is now part of the context.';
    }
    if(phase===3){$('Phase').textContent='Repeat: the updated context produces a new prediction.';}
    if(phase===4){phase=-1;chosen=null;if(ended){pause();refresh();return;}if(playing){advance();return;}pause();refresh();return;}
    remaining=motion.matches&&phase!==0?100:durations[phase];controls();schedule();
  }
  function start(auto){if(ended)return;playing=auto;active=true;animation?.play();engineAnimations.forEach(a=>a.play());if(phase<0)advance();else{controls();schedule();}}
  $('Play').onclick=()=>active?pause():start(true);
  $('Step').onclick=()=>{if(!active)start(false);};
  function setting(next){cancelPending();next();refresh();}
  function setStrategy(next){setting(()=>strategy=next);$('Greedy').setAttribute('aria-pressed',String(strategy==='greedy'));$('Sampling').setAttribute('aria-pressed',String(strategy==='sampling'));}
  $('Greedy').onclick=()=>setStrategy('greedy');$('Sampling').onclick=()=>setStrategy('sampling');
  $('Strategy').onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const n=e.key==='Home'?'Greedy':e.key==='End'?'Sampling':document.activeElement===$('Greedy')?'Sampling':'Greedy';$(n).focus();$(n).click();};
  $('Temperature').oninput=()=>setting(()=>{temperature=Number($('Temperature').value);$('TemperatureValue').textContent=temperature.toFixed(1);});
  $('Temperature').onkeydown=e=>e.stopPropagation();
  $('Demo').addEventListener('click',e=>{const info=e.target.closest('.prediction-info');if(info){e.stopPropagation();info.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));}});
  const picker=$('Picker'),button=$('PickerButton'),menu=$('PickerMenu');
  function closePicker(focus=false){menu.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus();}
  function reset(){
    pause();clearFlight();clearEngine();generated=[];chosen=null;phase=-1;ended=false;temperature=1;
    $('Temperature').value=1;$('TemperatureValue').textContent='1.0';closePicker();
    button.textContent=initial.examples[index].name;button.setAttribute('aria-label','Try an example: '+button.textContent);
    [...menu.children].forEach((n,i)=>n.setAttribute('aria-selected',String(i===index)));refresh();
  }
  initial.examples.forEach((example,i)=>{const n=document.createElement('button');n.type='button';n.tabIndex=-1;n.setAttribute('role','option');n.textContent=example.name;n.onclick=()=>{index=i;reset();button.focus();};menu.append(n);});
  function openPicker(){menu.hidden=false;button.setAttribute('aria-expanded','true');menu.children[index].focus();}
  button.onclick=()=>menu.hidden?openPicker():closePicker();
  picker.onkeydown=e=>{if(!['ArrowDown','ArrowUp','Home','End','Escape','Tab'].includes(e.key))return;e.stopPropagation();if(e.key==='Tab'){closePicker();return;}e.preventDefault();if(e.key==='Escape'){closePicker(true);return;}if(menu.hidden){openPicker();return;}const options=[...menu.children],i=options.indexOf(document.activeElement);options[e.key==='Home'?0:e.key==='End'?options.length-1:(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length].focus();};
  document.addEventListener('click',e=>{if(!picker.contains(e.target))closePicker();});
  $('Reset').onclick=()=>{index=0;strategy='greedy';$('Greedy').setAttribute('aria-pressed','true');$('Sampling').setAttribute('aria-pressed','false');$('Demo').querySelectorAll('details').forEach(n=>n.open=false);reset();};
  root.openResponseScene=tokens;
  new MutationObserver(()=>{if($('Demo').hidden){pause();clearFlight();closePicker();}}).observe($('Demo'),{attributes:true,attributeFilter:['hidden']});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  root.addEventListener('pagehide',pause);
  root.addEventListener('resize',()=>{clearFlight();if(!$('Demo').hidden){tokens();rebuildEngine();}});
  motion.addEventListener('change',()=>{clearFlight();rebuildEngine();});
  const temperatureSection=$('TemperatureSection'),summary=temperatureSection.querySelector('summary'),control=$('Temperature').closest('.context-control');
  function placeTemperature(){if(temperatureSection.open)$('Scale').before(control);else summary.append(control);}
  temperatureSection.addEventListener('toggle',placeTemperature);
  new MutationObserver(placeTemperature).observe(temperatureSection,{attributes:true,attributeFilter:['open']});
  control.addEventListener('click',e=>{if(!e.target.closest('input,button,label'))e.preventDefault();});
  placeTemperature();
  reset();
})(window);
