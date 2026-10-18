/* One independent draw from the complete, unchanged teaching distribution. */
(function(root){
  'use strict';
  function choose(candidates,strategy,random=Math.random){
    if(strategy==='greedy')return candidates.reduce((best,c)=>c.probability>best.probability?c:best);
    const draw=random()*candidates.reduce((sum,c)=>sum+c.probability,0);
    let cumulative=0;
    for(const candidate of candidates){cumulative+=candidate.probability;if(draw<cumulative)return candidate;}
    return candidates[candidates.length-1]; // Floating-point boundary protection.
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={choose};
  if(typeof document==='undefined')return;
  const model=root.llmPredictionModel,view=root.llmPredictionView,examples=model.examples;
  const $=name=>document.getElementById('selection'+name);
  const motion=root.matchMedia?.('(prefers-reduced-motion: reduce)');
  let exampleIndex=0,strategy='greedy',temperature=1,result,selected=null,timer=null;
  let history=[];
  function drawHistory(){
    $('History').hidden=strategy!=='sampling'||history.length<2;
    $('HistoryTokens').replaceChildren(...history.map(label=>{const item=document.createElement('li');item.textContent=label;return item;}));
  }
  function cancel(){
    clearTimeout(timer);timer=null;
    $('Probabilities').classList.remove('selection-sampling');
    $('Demo').querySelectorAll('.selection-pending').forEach(n=>n.classList.remove('selection-pending'));
    $('Choose').disabled=false;
    $('Probabilities').setAttribute('aria-busy','false');
  }
  function highlight(){
    const shown=selected&&result.shown.some(c=>c.token===selected.token);
    $('Probabilities').querySelectorAll('.prob-branch').forEach(n=>n.classList.toggle('selected',Boolean(selected)&&(shown?n.dataset.candidate===selected.token:n.classList.contains('prediction-other'))));
  }
  function clearSelection(){cancel();selected=null;highlight();$('Result').textContent='Choose a token to see the result.';}
  function inspect(token){
    const c=result.shown.find(c=>c.token===token);
    $('Inspection').textContent=c?`${c.token}: ${view.percent(c.probability)} probability before selection.`:'';
  }
  function draw(){
    view.tokens($('Tokens'),result,examples[exampleIndex].text);
    view.probabilities($('Probabilities'),result);
    const buttons=[...$('Probabilities').querySelectorAll('[data-candidate]')];
    buttons.forEach(n=>{
      // Inspection does not choose a generated token.
      n.removeAttribute('aria-pressed');
      n.onclick=n.onfocus=n.onpointerenter=()=>inspect(n.dataset.candidate);
      n.onkeydown=e=>{
        if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
        e.preventDefault();e.stopPropagation();const i=buttons.indexOf(n);
        buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)+buttons.length)%buttons.length].focus();
      };
    });highlight();
  }
  function reveal(candidate){
    cancel();selected=candidate;highlight();
    const token=document.createElement('strong');token.className='selection-token';token.textContent=candidate.token;
    const probability=document.createElement('span');probability.className='selection-probability';probability.textContent=`${view.percent(candidate.probability)}${result.shown.some(c=>c.token===candidate.token)?'':' · From Other tokens'}`;
    const prompt=document.createElement('p');prompt.className='selection-continuation';prompt.textContent=examples[exampleIndex].text;
    const arrow=document.createElement('span');arrow.className='selection-arrow';arrow.textContent='\u2192';arrow.setAttribute('aria-hidden','true');
    $('Result').replaceChildren(prompt,arrow,token,probability);
    if(strategy==='sampling'){history.push(candidate.token);history=history.slice(-5);}
    drawHistory();
  }
  $('Choose').onclick=()=>{
    clearSelection();
    // Determine the outcome first. Animation never determines the random draw.
    const candidate=choose(result.candidates,strategy);
    if(motion?.matches){reveal(candidate);return;}
    $('Choose').disabled=true;$('Probabilities').setAttribute('aria-busy','true');
    $('Result').textContent='Choosing a token…';
    if(strategy==='sampling')$('Probabilities').classList.add('selection-sampling');
    else [...$('Probabilities').children].find(n=>n.dataset.candidate===candidate.token)?.classList.add('selection-pending');
    timer=setTimeout(()=>reveal(candidate),450);
  };
  function setStrategy(next){clearSelection();strategy=next;drawHistory();$('Greedy').setAttribute('aria-pressed',String(strategy==='greedy'));$('Sampling').setAttribute('aria-pressed',String(strategy==='sampling'));}
  $('Greedy').onclick=()=>setStrategy('greedy');$('Sampling').onclick=()=>setStrategy('sampling');
  $('Strategy').onkeydown=e=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    e.preventDefault();e.stopPropagation();const next=e.key==='Home'?'Greedy':e.key==='End'?'Sampling':document.activeElement===$('Greedy')?'Sampling':'Greedy';$(next).focus();$(next).click();
  };
  const picker=$('Picker'),button=$('PickerButton'),menu=$('PickerMenu');
  function closePicker(focus=false){menu.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus();}
  function reset(){
    history=[];drawHistory();
    cancel();selected=null;closePicker();temperature=1;result=model.calculate(exampleIndex,temperature);
    $('Temperature').value=temperature;$('TemperatureValue').textContent=temperature.toFixed(1);
    button.textContent=examples[exampleIndex].name;button.setAttribute('aria-label','Try an example: '+button.textContent);
    [...menu.children].forEach((n,i)=>n.setAttribute('aria-selected',String(i===exampleIndex)));
    draw();clearSelection();$('Inspection').textContent='';
  }
  examples.forEach((example,i)=>{const option=document.createElement('button');option.type='button';option.tabIndex=-1;option.setAttribute('role','option');option.textContent=example.name;option.onclick=()=>{exampleIndex=i;reset();button.focus();};menu.append(option);});
  function openPicker(){menu.hidden=false;button.setAttribute('aria-expanded','true');menu.children[exampleIndex].focus();}
  button.onclick=()=>menu.hidden?openPicker():closePicker();
  picker.onkeydown=e=>{if(!['ArrowDown','ArrowUp','Home','End','Escape','Tab'].includes(e.key))return;e.stopPropagation();if(e.key==='Tab'){closePicker();return;}e.preventDefault();if(e.key==='Escape'){closePicker(true);return;}if(menu.hidden){openPicker();return;}const options=[...menu.children],i=options.indexOf(document.activeElement);options[e.key==='Home'?0:e.key==='End'?options.length-1:(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length].focus();};
  document.addEventListener('click',e=>{if(!picker.contains(e.target))closePicker();});
  $('Demo').addEventListener('click',e=>{const info=e.target.closest('.prediction-info');if(info){e.stopPropagation();info.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));}});
  $('Reset').onclick=()=>{exampleIndex=0;setStrategy('greedy');$('Demo').querySelectorAll('details').forEach(n=>n.open=false);reset();};
  root.openSelectionScene=()=>{closePicker();view.tokens($('Tokens'),result,examples[exampleIndex].text);};
  root.addEventListener('resize',()=>{if(!$('Demo').hidden)view.tokens($('Tokens'),result,examples[exampleIndex].text);});
  const demo=$('Demo');
  new MutationObserver(()=>{if(demo.isConnected&&demo.hidden){closePicker();if(timer!==null)clearSelection();}}).observe(demo,{attributes:true,attributeFilter:['hidden']});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&timer!==null)clearSelection();});
  motion?.addEventListener?.('change',()=>{if(timer!==null)clearSelection();});
    $('Temperature').oninput=()=>{
      temperature=Number($('Temperature').value);
      clearSelection();history=[];drawHistory();$('Inspection').textContent='';
      result=model.calculate(exampleIndex,temperature);
      $('TemperatureValue').textContent=temperature.toFixed(1);
      // Update existing nodes so focus is preserved and bar widths transition.
      [...$('Probabilities').children].forEach((node,i)=>{
        const c=result.shown[i],p=c?c.probability:result.other;
        node.querySelector(':scope > span').textContent=view.percent(p);
        node.querySelector('.count-bar').style.width=p*100+'%';
        if(c)node.setAttribute('aria-label','Inspect '+c.token+': '+view.percent(p));
      });
    };
    $('Temperature').onkeydown=e=>e.stopPropagation();
  reset();setStrategy(strategy);

})(typeof window==='undefined'?globalThis:window);
