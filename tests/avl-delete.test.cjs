const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../assets/js/avl-delete-engine.js');
function keys(n){return n?[...keys(n.left),n.key,...keys(n.right)]:[];}
function validate(n,min=-Infinity,max=Infinity){if(!n)return;assert.ok(n.key>min&&n.key<max);assert.ok(Math.abs(E.balance(n))<=1);validate(n.left,min,n.key);validate(n.right,n.key,max);}
for(const [name,p] of Object.entries(E.presets))test(name+' deletion preserves BST order and AVL balance',()=>{
 const tree=E.build(p.values),before=JSON.stringify(tree),steps=E.trace(tree,p.target),last=steps.at(-1).tree;
 assert.equal(JSON.stringify(tree),before);validate(tree);validate(last);
 assert.deepEqual(keys(last),p.values.filter(v=>v!==p.target).sort((a,b)=>a-b));
 for(const s of steps){const k=keys(s.tree);assert.deepEqual(k,[...new Set(k)].sort((a,b)=>a-b));}
 if(['ll','rr','lr','rl'].includes(name))assert.ok(steps.some(s=>s.label===name.toUpperCase()+' case'));
 if(name==='zero')assert.ok(steps.some(s=>s.text.includes('child BF = 0')));
});
test('empty, singleton, missing key and root with one child',()=>{
 for(const [values,target] of [[[],1],[[1],1],[[2,1],2],[[2,1,3],9]]){
 const tree=E.trace(E.build(values),target).at(-1).tree;validate(tree);assert.deepEqual(keys(tree),values.filter(v=>v!==target).sort((a,b)=>a-b));
 }
});
test('repeated deletions across deterministic shuffled AVL trees',()=>{
 let seed=12345,rotationAncestors=false;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let trial=0;trial<60;trial++){
 const values=Array.from({length:32},(_,i)=>i);
 for(let i=values.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[values[i],values[j]]=[values[j],values[i]];}
 let tree=E.build(values),remaining=new Set(values);
 for(const target of values){const steps=E.trace(tree,target);tree=steps.at(-1).tree;remaining.delete(target);validate(tree);assert.deepEqual(keys(tree),[...remaining].sort((a,b)=>a-b));if(steps.filter(s=>s.label.endsWith(' case')).length>1)rotationAncestors=true;}
 }
 assert.ok(rotationAncestors,'covered rebalancing at multiple ancestors');
});
