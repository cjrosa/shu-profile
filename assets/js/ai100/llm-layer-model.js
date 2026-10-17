/* Scene 4 only: fixed teaching parameters, not trained weights. */
(function(root){
  'use strict';
  const qk=typeof module!=='undefined'&&module.exports?require('./llm-qk-model.js'):root.llmQKModel;
  const values=typeof module!=='undefined'&&module.exports?require('./llm-values-model.js'):root.llmValuesModel;
  const WO=[[.25,0],[0,.25],[.125,-.125]];
  const W1=[[.3,-.2,.1],[-.1,.3,.2],[.2,.1,-.3],[-.2,.1,.3]];
  const W2=[[.2,-.1,.1,.1],[.1,.2,-.1,.1],[-.1,.1,.2,-.1]];
  const add=(a,b)=>a.map((v,i)=>v+b[i]);
  function normalize(x){
    const mean=x.reduce((a,b)=>a+b,0)/x.length;
    const variance=x.reduce((s,v)=>s+(v-mean)**2,0)/x.length;
    return x.map(v=>(v-mean)/Math.sqrt(variance+1e-5));
  }
  function calculate(words,target){
    if(!Number.isInteger(target)||target<0||target>=words.length)throw new RangeError('Invalid target');
    const inputs=words.map(qk.representation),normalized=inputs.map(normalize);
    const query=qk.project(normalized[target],qk.WQ);
    const scores=normalized.map((x,i)=>i<=target?qk.dot(query,qk.project(x,qk.WK))/Math.sqrt(2):-Infinity);
    const max=Math.max(...scores),exps=scores.map(v=>Math.exp(v-max)),sum=exps.reduce((a,b)=>a+b,0);
    const weights=exps.map(v=>v/sum),vs=normalized.map(x=>qk.project(x,values.WV));
    const weighted=[0,1].map(d=>vs.reduce((s,v,i)=>s+v[d]*weights[i],0));
    const attention=qk.project(weighted,WO),input=inputs[target],norm1=normalized[target];
    const residual1=add(input,attention),norm2=normalize(residual1);
    const hidden=qk.project(norm2,W1).map(v=>Math.max(0,v));
    const feedForward=qk.project(hidden,W2),output=add(residual1,feedForward);
    return {input,norm1,attention,residual1,norm2,feedForward,output,weights,weighted};
  }
  const api={WO,W1,W2,normalize,add,calculate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.llmLayerModel=api;
})(typeof window==='undefined'?globalThis:window);
