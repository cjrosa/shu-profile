/* Authored continuation graph, not learned semantics. See docs/llm-response.md. */
(function(root){
  'use strict';
  const initial=typeof module!=='undefined'&&module.exports?require('./llm-prediction-model.js'):root.llmPredictionModel;
  const EOS='[end]';
  // Fixed, invertible teaching projection for continuation states (row order).
  // Authored final-position representations below are calibrated to the existing
  // logits, not computed by another transformer pass. Initial contexts still
  // use Scene 1's original representation and projection unchanged.
  const continuationProjection=[[1,1,1],[0,1,1],[0,0,1]];
  // Rows are [individual token, unscaled logit, successor state].
  const states={
    pizza:[['is',2,'quality'],['brings',1,'people'],['tastes',.3,'quality']],
    quality:[['famous',2,'ending'],['delicious',1,'ending'],['legendary',.5,'ending']],
    city:[['famous',2,'for'],['welcoming',.8,'ending']],
    for:[['for',2,'food'],[EOS,0,null]],
    food:[['pizza',2,'ending'],['food',1,'ending']],
    people:[['people',2,'together'],['visitors',1,'together']],
    together:[['together',2,'ending'],['here',.7,'ending']],
    standard:[['the',2,'gold'],['a',1,'high']],
    gold:[['gold',2,'standardEnd']],high:[['high',2,'standardEnd']],
    standardEnd:[['standard',2,'ending']],
    object:[['pizza',2,'ending'],['visitors',.3,'ending']],
    adjective:[['and',1.5,'more'],['.',1,'stop'],[EOS,-1,null]],
    more:[['satisfying',2,'ending'],['memorable',.7,'ending']],
    traveler:[['but',1.5,'still'],['.',1,'stop'],[EOS,-1,null]],
    still:[['still',2,'awake']],awake:[['smiling',2,'ending'],['awake',.5,'ending']],
    chase:[['across',2,'park'],['near',.6,'park'],['.',0,'stop']],
    park:[['the',2,'place']],place:[['park',2,'ending'],['house',.5,'ending']],
    ending:[['.',2,'stop'],[EOS,0,null],['and',-.5,'more']],stop:[[EOS,2,null]]
  };
  const cityRoutes={pizza:'pizza',is:'city',sets:'standard',brings:'people',has:'food',offers:'food',welcomes:'object',attracts:'object',celebrates:'food',serves:'food'};
  function nextState(index,generated){
    let state=null;
    generated.forEach((token,i)=>{
      if(i===0){
        if(!initial.vocabularyFor(index).some(row=>row[0]===token))throw new Error('Unknown initial token');
        state=index===0?cityRoutes[token]:index===1?'adjective':index===3?'chase':'traveler';
      }else{
        const edge=states[state]?.find(row=>row[0]===token);
        if(!edge)throw new Error('Undefined continuation');
        state=edge[2];
      }
    });
    return state;
  }
  function calculate(index=0,generated=[],temperature=1){
    if(!generated.length)return initial.calculate(index,temperature);
    if(!Number.isFinite(temperature)||temperature<=0)throw new RangeError('Temperature must be finite and positive');
    const rows=states[nextState(index,generated)];
    if(!rows)throw new Error('Terminal context has no prediction');
    const max=Math.max(...rows.map(r=>r[1])),weights=rows.map(r=>Math.exp((r[1]-max)/temperature)),sum=weights.reduce((a,b)=>a+b,0);
    const candidates=rows.map((r,i)=>({token:r[0],score:r[1],probability:weights[i]/sum})).sort((a,b)=>b.score-a.score);
    const words=[...initial.examples[index].text.split(' '),...generated];
    const logits=Array.from({length:3},(_,i)=>rows[i]?.[1]??0);
    const representation=[logits[0]-logits[1],logits[1]-logits[2],logits[2]];
    return {words,target:words.length-1,representation,representationKind:'authored-final-position',candidates,shown:candidates.slice(0,5),other:candidates.slice(5).reduce((s,c)=>s+c.probability,0)};
  }
  const api={calculate,states,nextState,continuationProjection,EOS,limit:8};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.llmResponseModel=api;
})(typeof window==='undefined'?globalThis:window);
