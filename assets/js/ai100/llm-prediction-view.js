/* Shared rendering of the Chapter 5 teaching distribution. */
(function(){
 const percent=p=>(p*100).toFixed(1)+'%';
  const targetIcon='<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>';
 function tokens(element,result,prompt){
 const {words,target}=result;
    const columns=Math.max(3,Math.min(8,Math.floor((element.clientWidth||940)/115)));
    const palette=['--blue','--purple','--teal','--amber','--red','--green'];
    element.innerHTML=`<svg class="rnn-flow-diagram" viewBox="0 0 ${columns*115+20} ${Math.ceil(words.length/columns)*60}" role="img" aria-label="${prompt} Last position: ${words[target]}">${words.map((word,i)=>{const x=66+i%columns*115,y=24+Math.floor(i/columns)*60;return `<g class="attention-token${i===target?' selected':''}" style="--word-color:var(${palette[i%6]})"><rect class="rnn-flow-box memory" x="${x-52}" y="${y-19}" width="104" height="38" rx="8"/>${i===target?`<svg class="attention-target-icon" x="${x-44}" y="${y-8}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">${targetIcon}</svg>`:''}<text class="rnn-svg-title" x="${x+(i===target?12:0)}" y="${y+5}">${word}</text></g>`;}).join('')}</svg>`;

 const text=element.querySelector('.selected text');
 if(text?.getComputedTextLength?.()>68){text.setAttribute('textLength','68');text.setAttribute('lengthAdjust','spacingAndGlyphs');}
 }
 function probabilities(element,result){
    element.innerHTML=result.shown.map(c=>`<button type="button" class="prob-branch" data-candidate="${c.token}" aria-pressed="false" aria-label="Inspect ${c.token}: ${percent(c.probability)}"><strong>${c.token}</strong><span>${percent(c.probability)}</span><span class="count-track" aria-hidden="true"><span class="count-bar" style="width:${c.probability*100}%"></span></span></button>`).join('') + `<div class="prob-branch prediction-other"><strong>Other tokens <button type="button" class="prediction-info" aria-label="About Other tokens" data-tooltip="Other tokens: The combined probability of vocabulary tokens not shown individually."><svg class="attention-info-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7h.01"/></svg></button></strong><span>${percent(result.other)}</span><span class="count-track" aria-hidden="true"><span class="count-bar" style="width:${result.other*100}%"></span></span></div>`;
 }
 window.llmPredictionView={tokens,probabilities,percent};
})();