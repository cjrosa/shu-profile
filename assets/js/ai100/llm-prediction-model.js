/* Authored teaching parameters; no trained-model inference. */
(function(root){
  'use strict';
  const layer=typeof module!=='undefined'&&module.exports?require('./llm-layer-model.js'):root.llmLayerModel;
  const examples=[
    {name:'New Haven',text:'New Haven',lookup:['team','pizzas']},
    {name:'Pronoun Context',text:'The team got pizzas and they were cold.'},
    {name:'Distant Reference',text:'Marie arrived at the conference after a long flight. She was exhausted.'},
    {name:'Word Relationships',text:'The dog chased the ball.'},
    {name:'Longer Context',text:'Marie arrived at the conference after a long flight and a delayed train. She was exhausted.'}
  ];
  // Fixed projection rows [token, W, bias]. New Haven uses a separate authored
  // ten-token vocabulary with the same numerical rows; never trained predictions.
  const vocabulary=[['They',[.8,.2,-.3],1.1],['The',[.3,.1,.4],.9],['It',[.1,-.2,.3],.8],['She',[-.2,.5,.1],.7],['But',[.2,-.1,-.2],.4],['After',[-.3,.2,.1],-.5],['Then',[.2,.1,-.1],-.6],['Everyone',[-.1,.2,.2],-.8],['A',[.1,-.2,.1],-.9],['Meanwhile',[-.2,.1,-.1],-1]];
  const promptTokens=['pizza','is','sets','brings','has','offers','welcomes','attracts','celebrates','serves'];
  function vocabularyFor(index){return index===0?vocabulary.map(([,w,b],i)=>[promptTokens[i],w,b]):vocabulary;}
  function calculate(index=0){
    const words=examples[index].text.split(' '),target=words.length-1;
    // Treat the approved Scene 5 layer as the final layer in this small simulation.
    const representation=layer.calculate(examples[index].lookup||words,target).output;
    const activeVocabulary=vocabularyFor(index);
    const scores=activeVocabulary.map(([,w,b])=>w.reduce((s,v,d)=>s+v*representation[d],b));
    const max=Math.max(...scores),exp=scores.map(s=>Math.exp(s-max)),sum=exp.reduce((a,b)=>a+b,0);
    const candidates=activeVocabulary.map(([token],i)=>({token,score:scores[i],probability:exp[i]/sum})).sort((a,b)=>b.score-a.score);
    return {words,target,representation,candidates,shown:candidates.slice(0,5),other:candidates.slice(5).reduce((s,c)=>s+c.probability,0)};
  }
  const api={examples,vocabulary,vocabularyFor,calculate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.llmPredictionModel=api;
})(typeof window==='undefined'?globalThis:window);
