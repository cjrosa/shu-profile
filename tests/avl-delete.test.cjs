const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../assets/js/avl-delete-engine.js');
test('sequence parser accepts commas, whitespace, negatives and rejects invalid input',()=>{
 assert.deepEqual(E.parseSequence('30, 10 20\n-5 +8'),[30,10,20,-5,8]);
 for(const text of ['', '2 nope', '1.5', '9007199254740992',Array(33).fill('1').join(' ')])assert.throws(()=>E.parseSequence(text));
});
test('sequence walks the BST and balances after every insertion, including duplicates',()=>{
 const values=[30,10,20,40,50,25,20,-5];
 const steps=E.traceSequence(null,values),completed=steps.filter(s=>s.kind==='done');
 assert.equal(completed.length,values.length);
 completed.forEach((s,i)=>{validate(s.tree);assert.deepEqual(keys(s.tree),[...new Set(values.slice(0,i+1))].sort((a,b)=>a-b));assert.equal(s.insertionIndex,i+1);});
 assert.ok(steps.some(s=>s.label==='Search' && s.text.includes('follow the left child')));
 assert.ok(steps.some(s=>s.label==='Search' && s.text.includes('follow the right child')));
 assert.ok(steps.filter(s=>s.kind==='rotation').length>=3);
 assert.ok(steps.some(s=>s.label==='Already present'));
});
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
for(const [name,p] of Object.entries(E.insertPresets))test(name+' insertion traces preserve ordering and restore balance',()=>{
 const initial=E.build(p.values),steps=E.trace(initial,p.target,'insert');
 assert.deepEqual(keys(initial),p.values.slice().sort((a,b)=>a-b));
 validate(steps.at(-1).tree);
 assert.deepEqual(keys(steps.at(-1).tree),[...p.values,p.target].sort((a,b)=>a-b));
 if(['ll','rr','lr','rl'].includes(name))assert.ok(steps.some(s=>s.label===name.toUpperCase()+' case'));
});
test('complicated examples demonstrate successor repair and multiple ancestor repairs',()=>{
 const p=E.presets.cascade,s=E.trace(E.build(p.values),p.target);
 assert.equal(s.filter(x=>x.label.startsWith('Rotate ')).length,3);
 assert.equal(s.filter(x=>x.label.endsWith(' case')).length,2);
 const q=E.presets.successor,t=E.trace(E.build(q.values),q.target);
 assert.ok(t.some(x=>x.label==='Successor removed'));
 assert.equal(t.filter(x=>x.label.startsWith('Rotate ')).length,2);
});
test('duplicate insertion is a no-op; insertion after deletion has unique identities',()=>{
 const initial=E.build([30,20,40,10,25]);
 const duplicate=E.trace(initial,20,'insert');
 assert.ok(duplicate.some(s=>s.label==='Already present'));
 assert.deepEqual(duplicate.at(-1).tree,initial);
 const removed=E.trace(initial,20).at(-1).tree;
 const added=E.trace(removed,20,'insert').at(-1).tree,ids=[];
 (function visit(n){if(n){ids.push(n.id);visit(n.left);visit(n.right);}})(added);
 assert.equal(ids.length,new Set(ids).size);validate(added);
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

test('BST mode preserves degenerate insertion order without AVL steps',()=>{
 for(const values of [[10,20,30,40,50,60],[60,50,40,30,20,10],[60,10,50,20,40,30]]){
  const steps=E.traceSequence(null,values,'bst');
  assert.equal(E.height(steps.at(-1).tree),6);
  assert.equal(E.height(E.build(values,'bst')),6);
  assert.ok(steps.every(s=>!s.rotations&&!s.decision&&s.label!=='Check balance'));
  assert.deepEqual(keys(steps.at(-1).tree),[10,20,30,40,50,60]);
 }
});
for(const [name,p] of Object.entries(E.bstPresets))test('BST deletion: '+name,()=>{
 const tree=E.build(p.values,'bst'),original=JSON.stringify(tree),steps=E.trace(tree,p.target,'delete','bst');
 assert.equal(JSON.stringify(tree),original);
 assert.deepEqual(keys(steps.at(-1).tree),p.values.filter(v=>v!==p.target).sort((a,b)=>a-b));
 assert.ok(steps.every(s=>!s.rotations&&s.label!=='Check balance'&&s.kind!=='rotation'));
 assert.equal(steps.at(-1).label,'Complete');
 for(const s of steps)assert.deepEqual(keys(s.tree),[...new Set(keys(s.tree))].sort((a,b)=>a-b));
});
