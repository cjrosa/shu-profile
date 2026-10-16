/* Deterministic teaching simulation, not trained parameters. See docs/llm-qk.md. */
(function (root) {
  'use strict';
  // Three-coordinate word lookup; repeated words use the same representation.
  const groups = [
    [['the','and','at','a','after'],[-.5,0,.2]],
    [['team','dog','ball','conference','flight','train'],[1,0,.2]],
    [['pizzas','marie'],[2,0,.2]],
    [['they','she'],[.2,1.5,0]],
    [['got','arrived','chased','was','were'],[0,.2,1]],
    [['cold','exhausted','long','delayed'],[.5,.5,-.5]]
  ];
  const embeddings = Object.fromEntries(groups.flatMap(([words,x])=>words.map(word=>[word,x])));
  const WQ = [[0,1,.5],[1,0,-.5]], WK = [[1,0,.25],[0,1,-.5]];
  const dot = (a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
  const project = (x,matrix)=>matrix.map(row=>dot(row,x));
  const representation = word => {
    const key=word.toLowerCase().replace(/[^a-z]/g,'');
    if (!embeddings[key]) throw new RangeError('Missing teaching representation: '+key);
    return embeddings[key].slice();
  };
  function calculate(words,target) {
    if(!Number.isInteger(target)||target<0||target>=words.length)throw new RangeError('Invalid target');
    const representations=words.map(representation);
    const queries=representations.map(x=>project(x,WQ)), keys=representations.map(x=>project(x,WK));
    const dots=keys.map(key=>dot(queries[target],key));
    const scores=dots.map(value=>value/Math.sqrt(2));
    const maskedScores=scores.map((value,i)=>i<=target?value:-Infinity);
    const max=Math.max(...maskedScores);
    const exponentials=maskedScores.map(value=>Math.exp(value-max));
    const denominator=exponentials.reduce((sum,value)=>sum+value,0);
    const weights=exponentials.map(value=>value/denominator);
    return {representations,queries,keys,dots,scores,maskedScores,max,exponentials,denominator,weights};
  }
  const api={embeddings,WQ,WK,dot,project,representation,calculate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.llmQKModel=api;
})(typeof window==='undefined'?globalThis:window);
