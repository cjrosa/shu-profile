/* Fixed teaching projection. Rows are output coordinates (transpose of X W_V notation). */
(function(root){
'use strict';
const qk=typeof module!=='undefined'&&module.exports?require('./llm-qk-model.js'):root.llmQKModel;
const WV=[[.5,0,-.5],[0,.5,-.25]];
function calculate(words,target){
 const attention=qk.calculate(words,target);
 const values=attention.representations.map(x=>qk.project(x,WV));
 const contributions=values.map((v,j)=>v.map(n=>attention.weights[j]*n));
 const output=[0,1].map(d=>contributions.reduce((sum,v)=>sum+v[d],0));
 return {...attention,values,contributions,output};
}
const api={WV,calculate};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.llmValuesModel=api;
})(typeof window==='undefined'?globalThis:window);
