/* Authored teaching parameters; no trained-model inference. */
(function(root){
  'use strict';
  const layer=typeof module!=='undefined'&&module.exports?require('./llm-layer-model.js'):root.llmLayerModel;
  // Candidate identities are authored for each context, not learned semantics.
  // Related prompts share a vocabulary rather than duplicating probability data.
  const tokenSets={
    city:['pizza','is','sets','brings','has','offers','welcomes','attracts','celebrates','serves'],
    pizzas:['cold','delicious','fresh','ready','expensive','hot','tasty','burnt','small','soggy'],
    traveler:['excited','tired','exhausted','nervous','relieved','hungry','sleepy','restless','hopeful','awake'],
    chase:['ball','cat','squirrel','rabbit','stick','toy','frisbee','bird','leaf','puppy']
  };
  const examples=[
    {name:'New Haven',text:'New Haven',lookup:['team','pizzas'],vocabulary:'city'},
    {name:'Contextual Prediction',text:'The team got pizzas and they were',vocabulary:'pizzas'},
    {name:'Distant Reference',text:'Marie arrived at the conference after a long flight. She was',vocabulary:'traveler'},
    {name:'Word Relationships',text:'The dog chased the',vocabulary:'chase'},
    {name:'Longer Context',text:'Marie arrived at the conference after a long flight and a delayed train. She was',vocabulary:'traveler'}
  ];
  // Shared fixed rows [W, bias]; unchanged numerical parameters preserve New Haven.
  // Each token set assigns these rows in its declared order. Full-vocabulary
  // softmax is always calculated, never stored as authored percentages.
  const projection=[[[.8,.2,-.3],1.1],[[.3,.1,.4],.9],[[.1,-.2,.3],.8],[[-.2,.5,.1],.7],[[.2,-.1,-.2],.4],[[-.3,.2,.1],-.5],[[.2,.1,-.1],-.6],[[-.1,.2,.2],-.8],[[.1,-.2,.1],-.9],[[-.2,.1,-.1],-1]];
  function vocabularyFor(index){return tokenSets[examples[index].vocabulary].map((token,i)=>[token,...projection[i]]);}
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
  const api={examples,tokenSets,projection,vocabularyFor,calculate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.llmPredictionModel=api;
})(typeof window==='undefined'?globalThis:window);
