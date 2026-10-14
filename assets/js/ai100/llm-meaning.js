/* Chapter 3, Scene 1. Authored relationships, never inferred attention. */
(function () {
  'use strict';
  const examples = {
    bank: {prompt:'Compare how the surrounding words change the meaning of bank.', challenge:'Which surrounding words change the meaning of bank?', rows:[
      {text:'She deposited her paycheck at the bank.', target:6, clues:[1,3], explanation:'Deposited and paycheck suggest a financial institution. The same word changes meaning with its context.'},
      {text:'They sat beside the river bank.', target:5, clues:[2,4], explanation:'Beside and river suggest the edge of a river. The word bank stays the same; its context changes.'}]},
    bat: {prompt:'Compare how the surrounding words change the meaning of bat.', challenge:'Find the clues that distinguish an animal from sports equipment.', rows:[
      {text:'The bat flew out of the cave.', target:1, clues:[2,6], explanation:'Flew and cave suggest a flying animal.'},
      {text:'The player swung the bat.', target:4, clues:[1,2], explanation:'Player and swung suggest sports equipment.'}]},
    marie: {prompt:'Select She or Marie to trace the reference. Select an intervening word to inspect the distance.', challenge:'Which earlier word helps us understand who She refers to?', rows:[
      {text:'Marie arrived at the conference after a long flight and several delays. She was exhausted.', target:12, clues:[0], explanation:'She refers to Marie in this example. There are 11 words between them (12 word positions apart). Dashed tiles mark those intervening words.'}]},
    order: {prompt:'Select dog or cat to swap who chases whom.', challenge:'Swap the subject and object. Do the same words still tell the same story?', rows:[]},
    own: {prompt:'Edit the sentence, then select any word to inspect its position.', challenge:'Which surrounding words would you use as clues? Discuss your interpretation.', rows:[]}
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = examples;
  if (typeof document === 'undefined') return;
  const $ = name => document.getElementById('meaning'+name);
  const feedbackText=$('Feedback'), feedbackBox=feedbackText.parentElement;
  let key='bank', selectedRow=0, selectedWord=6, swapped=false;
  const explored=new Set();
  function rows() {
    if(key==='own') return [{text:$('Input').value.slice(0,600), target:-1, clues:[]}];
    if(key==='order') return [{text:swapped?'The cat chased the dog.':'The dog chased the cat.',target:1,clues:[4],explanation:swapped?'The cat is doing the chasing; the dog is being chased. Same words, different roles.':'The dog is doing the chasing; the cat is being chased. Swap them to change the relationship.'}];
    return examples[key].rows;
  }
  const words = row => row.text.match(/\S+/gu)||[];
  function feedback() {
    const row=rows()[selectedRow], list=words(row);
    if(key==='own') return list.length ? `Selected word ${selectedWord+1} of ${list.length}: “${list[selectedWord]}”. Choose the clues yourself; no semantic relationships are inferred.` : 'Enter a sentence to inspect its words. No semantic relationships are inferred.';
    if(key==='marie' && selectedWord>0 && selectedWord<12) return `“${list[selectedWord]}” is intervening word ${selectedWord} of 11 between Marie and She. The reference still connects She to Marie.`;
    if(selectedWord!==row.target && !row.clues.includes(selectedWord) && key!=='order') return `“${list[selectedWord]}” is word ${selectedWord+1}. ${row.explanation}`;
    return row.explanation;
  }
  function update() {
    const row=rows()[selectedRow];
    $('Sentences').querySelectorAll('button[data-word]').forEach(button=>{
      const r=Number(button.dataset.row), i=Number(button.dataset.word), active=r===selectedRow;
      button.setAttribute('aria-pressed', String(active && i===selectedWord));
      button.classList.toggle('related',active && row.clues.includes(i));
      button.classList.toggle('meaning-between',key==='marie' && i>0 && i<12);
    });
    feedbackText.textContent=feedback();
    $('Completion').hidden=explored.size<2;
    drawConnections();
  }
  function drawConnections() {
    $('Sentences').querySelectorAll('.meaning-links').forEach(svg=>svg.replaceChildren());
    if(key==='own') return;
    Array.from($('Sentences').children).forEach((section,rowIndex)=>{
    const svg=section.querySelector('.meaning-links'), rect=section.getBoundingClientRect();
    if(!rect.width) return;
    const row=rows()[rowIndex], tiles=section.querySelectorAll('[data-word]');
    const a=tiles[row.target].getBoundingClientRect();
    // Nest longer connections outside shorter ones, with separate target ports.
    const clues = [...row.clues].sort((i,j)=>Math.abs(i-row.target)-Math.abs(j-row.target));
    clues.forEach((i,rank)=>{
      const b=tiles[i].getBoundingClientRect(), path=document.createElementNS('http://www.w3.org/2000/svg','path');
      const side=i<row.target?-1:1;
      const port=side*((clues.length-1)/2-rank)*10;
      const x=a.left+a.width/2-rect.left+port,y=a.bottom-rect.top+7,u=b.left+b.width/2-rect.left,v=b.bottom-rect.top+7;
      const bend=Math.max(y,v)+10+rank*12, direction=u<x?-1:1, radius=5;
      path.setAttribute('d',`M${x} ${y} L${x} ${bend-radius} Q${x} ${bend} ${x+direction*radius} ${bend} L${u-direction*radius} ${bend} Q${u} ${bend} ${u} ${bend-radius} L${u} ${v}`);svg.append(path);
    });
    });
  }
  function render() {
    const comparison=key==='bank'||key==='bat';
    $('Sentences').classList.toggle('meaning-comparison',comparison);
    $('Editor').hidden=key!=='own';
    $('Prompt').hidden=comparison;
    $('Prompt').textContent=comparison?'':examples[key].prompt;
    $('Challenge').textContent=examples[key].challenge;
    $('Legend').hidden=key!=='own';
    $('Legend').textContent=key==='own'?'Outlined: selected word. Positions count whitespace-separated words, not model tokens.':'';
    feedbackBox.remove();
    $('Sentences').replaceChildren();
    explored.add(key);
    rows().forEach((row,r)=>{
      const section=document.createElement('section'); section.className='meaning-sentence';
      const heading=document.createElement('h3');heading.textContent=key==='order'?'Who chases whom?':key==='marie'?'A distant reference':key==='own'?'Your sentence':`Sentence ${r===0?'A':'B'}`;
      const header=document.createElement('header');header.className='tokens-comparison-header';
      const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
      icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('fill','none');icon.setAttribute('stroke','currentColor');icon.setAttribute('stroke-width','1.7');icon.setAttribute('stroke-linecap','round');icon.setAttribute('stroke-linejoin','round');icon.setAttribute('aria-hidden','true');icon.setAttribute('focusable','false');icon.classList.add('meaning-card-icon');
      icon.innerHTML='<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 10h10M7 14h6"/>';
      heading.prepend(icon);header.append(heading);
      const tiles=document.createElement('div');tiles.className='tokens-tiles';
      words(row).forEach((word,i)=>{
        const button=document.createElement(comparison?'span':'button');if(!comparison) button.type='button';button.className='tokens-tile';button.textContent=word;
        button.dataset.row=r;button.dataset.word=i;
        button.classList.toggle('meaning-target',i===row.target || (key==='marie' && i===0));
        button.setAttribute('aria-label',`${word}, word ${i+1}${key==='order'&&(i===1||i===4)?', select to swap subject and object':i===row.target?', target word':row.clues.includes(i)?', contextual clue':''}`);
        if(!comparison) button.onclick=()=>{
          explored.add(key);selectedRow=r;selectedWord=i;
          if(key==='order' && (i===1||i===4)) {swapped=!swapped;render();$('Sentences').querySelector(`[data-word="${i}"]`).focus();}
          else update();
        };tiles.append(button);
      });
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('meaning-links');svg.setAttribute('aria-hidden','true');
      const visual=document.createElement('div');visual.className='meaning-visual';
      visual.append(tiles);
      const message=comparison?feedbackBox.cloneNode(true):feedbackBox;
      if(comparison) {
        message.removeAttribute('role');
        const text=message.querySelector('#meaningFeedback');text.removeAttribute('id');text.textContent=row.explanation;
      }
      section.append(header,visual,svg,message);$('Sentences').append(section);
    });update();
  }
  $('Preset').onchange=()=>{key=$('Preset').value;selectedRow=0;swapped=false;selectedWord=key==='own'?0:rows()[0].target;render();};
  $('Input').oninput=()=>{selectedWord=0;selectedRow=0;render();};
  window.drawMeaningConnections=drawConnections;
  if(window.ResizeObserver) new ResizeObserver(drawConnections).observe($('Sentences'));
  window.addEventListener('resize',drawConnections);
  render();
})();
