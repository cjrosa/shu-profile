(function(root){
 'use strict';
 const model=root.llmResponseModel,initial=root.llmPredictionModel,view=root.llmPredictionView;
 const $=name=>document.getElementById('capstone'+name),motion=root.matchMedia('(prefers-reduced-motion: reduce)');
 const ns='http://www.w3.org/2000/svg';
 const durations=[400,550,900,450,900,450,900,600,1300,450,550,850,300,450];
 let index=0,generated=[],temperature=1,strategy='greedy',result,chosen=null,ended=false;
 let effects=[],returnPoints=[],inputValues=[],playback;
 const descriptions=[
  'Text & Tokens: The current text is represented as tokens, including every token already generated.',
  'Numerical Representations: Tokens become numerical vectors. Position information also informs transformer processing.',
  'Transformer Processing: Repeated layers use permitted context and learned transformations to update representations. The final position supports the next prediction.',
  'Predict & Select: Output projection produces vocabulary scores; softmax converts them to probabilities. The active strategy then chooses one token.'
 ];
 function inspect(i){$('Inspection').hidden=false;$('Inspection').textContent=descriptions[i];$('Demo').querySelectorAll('[data-inspect]').forEach(n=>n.setAttribute('aria-pressed',String(+n.dataset.inspect===i)));}
 $('Demo').querySelectorAll('[data-inspect]').forEach(n=>n.onclick=()=>inspect(+n.dataset.inspect));
 const color=v=>v===undefined||Math.abs(v)<.0005?'#e1e5e3':`hsl(${v<0?270:215} 45% ${85-45*Math.abs(v)/4}%)`;
 function node(tag,attrs,parent){const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));parent.append(n);return n;}
 function cells(parent,values,x=0,y=0){for(let i=0;i<3;i++)node('rect',{x:x+i*57,y,width:50,height:30,rx:5,fill:color(values?.[i]),...(values?{'data-state-value':values[i]}:{})},parent);}
 function vector(element,values,label){element.replaceChildren();const svg=node('svg',{viewBox:'0 0 164 30',role:'img','aria-label':label},element);cells(svg,values);}
 // Clone Chapter 4's actual layer groups AND connecting paths. No new artwork.
 const source=document.querySelector('#stackDiagram svg');
 source.querySelectorAll('[data-stage],[data-edge]').forEach(n=>{const clone=n.cloneNode(true);clone.removeAttribute('tabindex');clone.removeAttribute('role');clone.removeAttribute('aria-pressed');clone.classList.remove('selected');$('Layers').append(clone);});
 const layers=[...$('Layers').querySelectorAll('[data-stage]')];
 // Scene 3's approved miniature network and pulse routes, including shared edges.
 const network=$('Network'),original=document.querySelector('#layerDiagram .layer-network-demo');
 network.setAttribute('viewBox',original.getAttribute('viewBox'));network.replaceChildren(...[...original.children].map(n=>n.cloneNode(true)));
 const circles=[...network.querySelectorAll('circle')],columns=[...new Set(circles.map(n=>+n.getAttribute('cx')))].sort((a,b)=>a-b);
 const nodes=columns.map((x,i)=>circles.filter(n=>+n.getAttribute('cx')===x).map(n=>{n.dataset.layer=i;return n;}));
 const routes=new Map();network.querySelectorAll('.layer-synapse').forEach(path=>{const p=path.getAttribute('d').match(/-?\d+(?:\.\d+)?/g).map(Number);for(let i=0;i<p.length-2;i+=2){const [x,y,nextX,nextY]=p.slice(i,i+4);routes.set(`${x},${y},${nextX},${nextY}`,{x,y,nextX,nextY,layer:columns.indexOf(x)});}});
 const edges=[...routes.values()];edges.forEach(e=>e.pulse=node('circle',{r:1.5,class:'response-engine-pulse'},network));
 function clearEffects(){effects.forEach(a=>a.cancel());effects=[];$('Signals').replaceChildren();$('Layers').querySelectorAll('.stack-transient').forEach(n=>n.remove());layers.forEach(n=>n.classList.remove('stack-processing'));}
 function animate(element,frames,options={}){const a=element.animate(frames,{duration:motion.matches?100:durations[playback.state.phase],fill:'both',easing:'linear',...options});effects.push(a);return a;}
 function emphasize(element){animate(element,[{opacity:.55},{opacity:1}]);}
 function point(element,which='center'){const b=element.getBoundingClientRect(),base=$('Pipeline').getBoundingClientRect();return {x:b.left-base.left+b.width/2,y:(which==='bottom'?b.bottom:which==='top'?b.top:b.top+b.height/2)-base.top};}
 function movingVector(parent,values,points,kind='illustrative-intermediate',scale=.36,animationOptions={}){
  const g=node('g',{class:'stack-transient stack-moving-vector','data-representation-kind':kind,'aria-hidden':'true'},parent);const inner=node('g',{transform:`scale(${scale})`},g);cells(inner,values,-82,-15);
  if(motion.matches){g.setAttribute('transform',`translate(${points.at(-1).x} ${points.at(-1).y})`);return g;}
  animate(g,points.map((p,i)=>({offset:i/(points.length-1),transform:`translate(${p.x}px,${p.y}px)`,opacity:p.opacity??1})),{easing:'ease-in-out',...animationOptions});return g;
 }
 function flyInputRepresentations(){
  const tokens=[...$('Tokens').querySelectorAll('.attention-token')],figures=[...$('Inputs').querySelectorAll('figure')];
  tokens.forEach((token,i)=>{
   const destination=figures[i]?.querySelector('svg');
   if(!destination)return;
   const from=point(token),to=point(destination);
   movingVector($('Signals'),inputValues[i],[from,{x:from.x,y:from.y+14},{x:to.x,y:to.y-14},to],inputValues[i]?'input-lookup':'schematic-input',.3);
  });
 }
 function travelingResidual(values,points,animationOptions){
  if(motion.matches)return;
  const g=movingVector($('Signals'),values,points,values?'context-input':'schematic-context-input',.24,animationOptions);
  g.classList.add('capstone-context-pulse');
 }
 function contextPulses(layer){
  const base=$('Pipeline').getBoundingClientRect(),layerRect=layers[layer].querySelector('rect'),end=point(layerRect),edge=layerRect.getBoundingClientRect().left-base.left;
  const card=$('Demo').querySelector('[data-stage="2"]').getBoundingClientRect(),lane=card.left-base.left-6,bend=$('Inputs').getBoundingClientRect().bottom-base.top+12;
  const figures=[...$('Inputs').querySelectorAll('figure')],phaseDuration=durations[playback.state.phase];
  figures.forEach((figure,i)=>{
   const from=point(figure,'bottom'),turn=bend+i%3*2;
   const delay=figures.length<2?0:i/(figures.length-1)*phaseDuration*.1;
   travelingResidual(inputValues[i],[from,{x:from.x,y:turn},{x:lane,y:turn},{x:lane,y:end.y},{x:edge,y:end.y}],{duration:phaseDuration*.45,delay});
  });
 }
 function tokens(){
  const words=[...initial.examples[index].text.split(' '),...generated];view.tokens($('Tokens'),{words,target:words.length-1},words.join(' '));
  const svg=$('Tokens').querySelector('.rnn-flow-diagram'),viewBox=svg?.getAttribute('viewBox')?.split(' ').map(Number);
  // The shared renderer reserves 17 units below the tiles and 5 above them.
  // Trim that 12-unit difference here so equal card padding looks equal.
  if(viewBox?.length===4)svg.setAttribute('viewBox',`${viewBox[0]} ${viewBox[1]} ${viewBox[2]} ${viewBox[3]-12}`);
  $('Tokens').style.minHeight='';
  $('Tokens').querySelectorAll('.attention-token').forEach((n,i)=>n.classList.toggle('response-generated',i>=words.length-generated.length));$('Count').textContent=`${generated.length} / ${model.limit} generated tokens`;
 }
 function prediction(){
  result=model.calculate(index,generated,temperature);view.probabilities($('Probabilities'),result);
  $('Probabilities').querySelectorAll('[data-candidate]').forEach(n=>{n.removeAttribute('aria-pressed');n.onclick=()=>{const c=result.candidates.find(c=>c.token===n.dataset.candidate);$('Inspection').hidden=false;$('Inspection').textContent=`${c.token}: ${view.percent(c.probability)}. Inspection does not choose a token.`;};});
  vector($('Vector'),result.representation,'Final-position teaching representation');$('Vector').dataset.representationKind=result.representationKind||'computed-layer-output';$('Target').textContent=result.words.at(-1);
  $('Inputs').replaceChildren();inputValues=[];result.words.forEach((word,i)=>{let values;try{values=root.llmQKModel.representation(initial.examples[index].lookup?.[i]||word);}catch{}inputValues.push(values);const figure=document.createElement('figure'),label=document.createElement('figcaption');vector(figure,values,values?'Input teaching representation':'Schematic input vector; no teaching lookup defined');label.textContent=word;figure.append(label);$('Inputs').append(figure);});
 }
 function landing(){
  // Derive the next tile slot using the shared token renderer, without adding
  // anything to the committed context or presenting a token before it lands.
  const host=$('Tokens'),svg=host.querySelector('svg'),box=svg.getBoundingClientRect(),base=$('Pipeline').getBoundingClientRect();
  const columns=Math.max(3,Math.min(8,Math.floor((host.clientWidth||940)/115))),count=initial.examples[index].text.split(' ').length+generated.length;
  const width=columns*115+20,scale=box.width/width||1;
  return {x:box.left-base.left+(66+count%columns*115)*scale,y:box.top-base.top+(24+Math.floor(count/columns)*60)*scale};
 }
 function drawRoutes(){
  const target=landing(),base=$('Pipeline').getBoundingClientRect();$('Connections').setAttribute('viewBox',`0 0 ${base.width||1} ${base.height||1}`);$('Routes').replaceChildren();
  const start=point($('Selected'),'bottom'),lane=(base.width||900)-26;
  const context=$('Demo').querySelector('[data-stage="0"]').getBoundingClientRect(),turn=context.bottom-base.top-8;
  returnPoints=[{x:start.x,y:start.y+4},{x:start.x,y:start.y+16},{x:lane,y:start.y+16},{x:lane,y:turn},{x:target.x,y:turn},target];
 }
 function controls(){
  const {active,phase}=playback.state,label=active?'Pause':'Play';$('Play').setAttribute('aria-label',label);$('Play').dataset.tooltip=label;$('Play').setAttribute('aria-pressed',String(active));$('Play').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+(active?'M7 5v14M17 5v14':'M7 4l13 8-13 8z')+'"/></svg>';$('Play').disabled=ended&&phase<0;$('Step').disabled=active||(ended&&phase<0);
  $('Demo').dataset.phase=String(phase);$('Demo').dataset.ended=String(ended);$('Demo').dataset.paused=String(!active);
 }
 // Schematic intermediate colors carry no numerical coordinates. The same
 // palette is retained across each explicit output-to-input handoff.
 function intermediateColors(layer){const colors=['#c8d8ed','#d9caeb','#e1e5e3'];return colors.map((_,i)=>colors[(i+layer)%3]);}
 function paintIntermediate(group,layer){group.querySelectorAll('rect').forEach((n,i)=>n.setAttribute('fill',intermediateColors(layer)[i]));}
 function layerProcessing(layer){
  layers[layer].classList.add('stack-processing');contextPulses(layer);
  const y=106+layer*86,phaseDuration=durations[playback.state.phase],updateDelay=phaseDuration*.55,updateDuration=phaseDuration*.45;
  const sweep=node('line',{class:'stack-transient stack-processing-sweep',x1:180,x2:180,y1:y+5,y2:y+37},$('Layers'));
  if(!motion.matches)animate(sweep,[{transform:'translateX(0)',opacity:0},{transform:'translateX(120px)',opacity:.7},{transform:'translateX(240px)',opacity:0}],{duration:updateDuration,delay:updateDelay});
  // Intermediate states are schematic: no invented numerical coordinates.
  const g=movingVector($('Layers'),undefined,[{x:300,y:y-5,opacity:1},{x:300,y:y+5,opacity:0},{x:300,y:y+21,opacity:0},{x:300,y:y+37,opacity:0},{x:300,y:y+42,opacity:1}],'illustrative-intermediate',.36,{duration:updateDuration,delay:updateDelay});
  const incoming=layer?intermediateColors(layer-1):[0,1,2].map(i=>color(inputValues.at(-1)?.[i]));
  g.querySelectorAll('rect').forEach((rect,i)=>animate(rect,[{fill:incoming[i]},{fill:intermediateColors(layer)[i]}],{duration:updateDuration,delay:updateDelay}));
 }
 function travel(element,x,y,nextX,nextY,start,end){const from=`translate(${x}px,${y}px)`,to=`translate(${nextX}px,${nextY}px)`;animate(element,[{offset:0,opacity:0,transform:from},{offset:start,opacity:0,transform:from},{offset:start+.01,opacity:1,transform:from},{offset:end-.01,opacity:1,transform:to},{offset:end,opacity:0,transform:to},{offset:1,opacity:0,transform:to}]);}
 function projection(){
  // Exact Scene 3 forward-pass offsets and routes, with the capstone's final
  // vector as the departure point instead of Scene 3's token-row placeholder.
  nodes.forEach((group,i)=>group.forEach(n=>animate(n,[{offset:0,stroke:'#fff',strokeWidth:2},{offset:[.42,.6,.76][i],stroke:'#fff',strokeWidth:2,easing:'steps(1,end)'},{offset:[.43,.61,.77][i],stroke:'var(--green)',strokeWidth:2.5},{offset:1,stroke:'var(--green)',strokeWidth:2.5}])));
  if(!motion.matches)edges.forEach(e=>travel(e.pulse,e.x,e.y,e.nextX,e.nextY,e.layer===0?.46:.63,e.layer===0?.6:.76));
  const from=point($('Vector').querySelector('svg')),to=point(nodes[0][1]);
  const g=node('g',{class:'stack-transient response-context-vector','data-representation-kind':result.representationKind||'computed-layer-output'},$('Signals'));cells(g,result.representation,-82,-15);
  const inputBoxes=nodes[0].map(n=>n.getBoundingClientRect()),scale=(inputBoxes[2].top-inputBoxes[0].top)/114||.36;
  const origin=`translate(${from.x}px,${from.y}px) scale(.36)`,destination=`translate(${to.x}px,${to.y}px) rotate(90deg) scale(${scale})`;
  const card=$('Demo').querySelector('[data-stage="3"]').getBoundingClientRect(),base=$('Pipeline').getBoundingClientRect(),lane=card.left-base.left-18;
  const frames=motion.matches?[{offset:0,opacity:0,transform:destination},{offset:.12,opacity:1,transform:destination},{offset:.42,opacity:1,transform:destination},{offset:.46,opacity:0,transform:destination},{offset:1,opacity:0,transform:destination}]:[{offset:0,opacity:0,transform:origin},{offset:.08,opacity:1,transform:origin},{offset:.14,opacity:1,transform:origin},{offset:.25,opacity:1,transform:`translate(${lane}px,${from.y}px) scale(.36)`},{offset:.35,opacity:1,transform:`translate(${lane}px,${to.y}px) rotate(90deg) scale(${scale})`},{offset:.42,opacity:1,transform:destination},{offset:.46,opacity:0,transform:destination},{offset:1,opacity:0,transform:destination}];
  animate(g,frames);
  if(!motion.matches){const a=point($('Process'),'bottom'),b=point($('ProbabilityArea'),'top');travel(node('circle',{r:2.5,class:'response-engine-pulse'},$('Signals')),a.x,a.y,b.x,b.y,.8,.94);}
  animate($('ProbabilityArea'),[{offset:0,outlineColor:'transparent'},{offset:.94,outlineColor:'transparent',easing:'steps(1,end)'},{offset:.95,outlineColor:'var(--purple)'},{offset:1,outlineColor:'var(--purple)'}]);
 }
 function returnToken(){
  if(motion.matches){emphasize($('Selected'));return;}
  const g=node('g',{class:'stack-transient stack-token-flight','aria-hidden':'true'},$('Signals'));
  const inner=node('g',{transform:'scale(.6)'},g);node('rect',{x:-52,y:-19,width:104,height:38,rx:8},inner);node('text',{x:0,y:5},inner).textContent=chosen.token;
  const lengths=returnPoints.map((p,i)=>i?Math.hypot(p.x-returnPoints[i-1].x,p.y-returnPoints[i-1].y):0),total=lengths.reduce((a,b)=>a+b,0)||1;let distance=0;
  animate(g,returnPoints.map((p,i)=>{distance+=lengths[i];return {offset:i===returnPoints.length-1?1:distance/total,transform:`translate(${p.x}px,${p.y}px)`};}),{easing:'ease-in-out'});
 }
 function renderPhase(){
  clearEffects();drawRoutes();const phase=playback.state.phase;
  if(phase===0){emphasize($('Tokens'));emphasize($('Tokens').querySelector('.selected'));flyInputRepresentations();}
  if(phase===1){emphasize($('Inputs'));const a=point($('Inputs').lastElementChild,'bottom'),b=point(layers[0].querySelector('rect'),'top');movingVector($('Signals'),inputValues.at(-1),[a,{x:b.x,y:a.y+16},b],inputValues.at(-1)?'input-lookup':'schematic-input');}
  if([2,4,6].includes(phase))layerProcessing((phase-2)/2);
  if(phase===3||phase===5){const layer=(phase-3)/2;paintIntermediate(movingVector($('Layers'),undefined,[{x:300,y:148+layer*86},{x:300,y:192+layer*86}], 'illustrative-layer-handoff'),layer);layers[layer+1].classList.add('stack-processing');}
  if(phase===7){const a=point(layers[2].querySelector('rect'),'bottom'),b=point($('Vector').querySelector('svg'));movingVector($('Signals'),result.representation,[a,b],result.representationKind||'computed-layer-output');emphasize($('Final'));}
  if(phase===8)projection();
  if(phase===9)emphasize($('ProbabilityArea'));
  if(phase===10)emphasize($('Selected'));
  if(phase===11)returnToken();
  if(phase===12)emphasize($('Tokens').querySelector('.selected'));
  if(phase===13)emphasize($('Tokens'));
 }
 const phaseText=[
  'Current context: every prompt and generated token remains available.',
  'Numerical input representations enter transformer processing.',
  'Layer 1 gathers permitted context and updates the representation.',
  'Layer 1 output becomes Layer 2 input.',
  'Layer 2 gathers permitted context and updates the representation.',
  'Layer 2 output becomes Layer 3 input.',
  'Layer 3 gathers permitted context and updates the representation.',
  'The last position now has its final contextual representation.',
  'Output projection produces vocabulary scores; softmax converts them to probabilities.',
  'The current distribution predicts the next token.',
  'The active strategy chooses one token from this distribution.',
  'The selected token returns to the context.',
  'Append: the selected token joins the complete context.',
  'The updated context now supports the next prediction.'
 ];
 function enterPhase(phase){
  if(phase===0){prediction();chosen=null;$('Selected').textContent='No token selected';}
  if(phase===10){chosen=root.llmChooseToken(result.candidates,strategy);$('Selected').textContent=chosen.token+' · '+view.percent(chosen.probability);const shown=result.shown.some(c=>c.token===chosen.token);$('Probabilities').querySelectorAll('.prob-branch').forEach(n=>n.classList.toggle('selected',shown?n.dataset.candidate===chosen.token:n.classList.contains('prediction-other')));}
  if(phase===11&&chosen.token===model.EOS){ended=true;return false;}
  if(phase===12){generated.push(chosen.token);tokens();}
  if(phase===13){ended=generated.length>=model.limit;prediction();}
  $('Phase').textContent=phaseText[phase];renderPhase();
 }
 playback=root.llmGenerationPlayback({durations,duration:p=>motion.matches?100:durations[p],isEnded:()=>ended,onPhase:enterPhase,
  onState:()=>controls(),pauseEffects:()=>effects.forEach(a=>a.pause()),resumeEffects:()=>effects.forEach(a=>a.play()),
  onCycleEnd:()=>{clearEffects();chosen=null;if(ended)$('Phase').textContent=generated.length>=model.limit?'Complete: teaching demonstration limit reached (eight generated tokens).':'Complete: end-of-sequence selected.';drawRoutes();}
 });
 $('Play').onclick=()=>playback.state.active?playback.pause():playback.start(true);$('Step').onclick=()=>{if(!playback.state.active)playback.start(false);};
 function setting(next){playback.reset();clearEffects();chosen=null;ended=ended||generated.length>=model.limit;next();prediction();$('Selected').textContent='No token selected';$('Phase').textContent=ended?'Complete. Reset to replay.':'Settings updated; current context preserved.';controls();drawRoutes();}
 function setStrategy(next){setting(()=>strategy=next);$('Greedy').setAttribute('aria-pressed',String(strategy==='greedy'));$('Sampling').setAttribute('aria-pressed',String(strategy==='sampling'));}
 $('Greedy').onclick=()=>setStrategy('greedy');$('Sampling').onclick=()=>setStrategy('sampling');
 $('Strategy').onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const n=e.key==='Home'?'Greedy':e.key==='End'?'Sampling':document.activeElement===$('Greedy')?'Sampling':'Greedy';$(n).focus();$(n).click();};
 $('Temperature').oninput=()=>setting(()=>{temperature=Number($('Temperature').value);$('TemperatureValue').textContent=temperature.toFixed(1);});$('Temperature').onkeydown=e=>e.stopPropagation();
 const picker=$('Picker'),button=$('PickerButton'),menu=$('PickerMenu');
 function closePicker(focus=false){menu.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus();}
 function reset(){playback.reset();clearEffects();generated=[];chosen=null;ended=false;temperature=1;$('Temperature').value=1;$('TemperatureValue').textContent='1.0';closePicker();button.textContent=initial.examples[index].name;button.setAttribute('aria-label','Try an example: '+button.textContent);[...menu.children].forEach((n,i)=>n.setAttribute('aria-selected',String(i===index)));tokens();prediction();$('Selected').textContent='No token selected';$('Phase').textContent='Ready: one Step completes one next-token generation cycle.';$('Inspection').textContent='';$('Inspection').hidden=true;$('Demo').querySelectorAll('[data-inspect]').forEach(n=>n.setAttribute('aria-pressed','false'));controls();drawRoutes();}
 initial.examples.forEach((example,i)=>{const n=document.createElement('button');n.type='button';n.tabIndex=-1;n.setAttribute('role','option');n.textContent=example.name;n.onclick=()=>{index=i;reset();button.focus();};menu.append(n);});
 function openPicker(){menu.hidden=false;button.setAttribute('aria-expanded','true');menu.children[index].focus();}
 button.onclick=()=>menu.hidden?openPicker():closePicker();
 picker.onkeydown=e=>{if(!['ArrowDown','ArrowUp','Home','End','Escape','Tab'].includes(e.key))return;e.stopPropagation();if(e.key==='Tab'){closePicker();return;}e.preventDefault();if(e.key==='Escape'){closePicker(true);return;}if(menu.hidden){openPicker();return;}const options=[...menu.children],i=options.indexOf(document.activeElement);options[e.key==='Home'?0:e.key==='End'?options.length-1:(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length].focus();};
 document.addEventListener('click',e=>{if(!picker.contains(e.target))closePicker();});
 $('Reset').onclick=()=>{index=0;strategy='greedy';$('Greedy').setAttribute('aria-pressed','true');$('Sampling').setAttribute('aria-pressed','false');$('Demo').querySelectorAll('details').forEach(n=>n.open=false);reset();};
 function rebuild(){if($('Demo').hidden)return;tokens();const elapsed=playback.elapsed;if(playback.state.phase>=0){renderPhase();effects.forEach(a=>{a.currentTime=Math.max(0,Math.min(durations[playback.state.phase],elapsed));if(!playback.state.active)a.pause();});}else drawRoutes();}
 root.openCapstoneScene=rebuild;
 new MutationObserver(()=>{if($('Demo').hidden){playback.pause();closePicker();}}).observe($('Demo'),{attributes:true,attributeFilter:['hidden']});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)playback.pause();});root.addEventListener('pagehide',()=>playback.pause());root.addEventListener('resize',rebuild);
 motion.addEventListener('change',()=>{playback.pause();rebuild();});
 $('Demo').addEventListener('click',e=>{const info=e.target.closest('.prediction-info');if(info){e.stopPropagation();info.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));}});
 reset();
})(window);
