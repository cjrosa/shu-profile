const test=require('node:test'),assert=require('node:assert/strict'),C=require('../assets/js/ai100/rnn-comparison.js');
test('same words and same model produce order-dependent states',()=>{
 assert.deepEqual(C.sentences[0].map(w=>w.toLowerCase()).sort(),C.sentences[1].map(w=>w.toLowerCase()).sort());
 const [a,b]=C.traces();assert.ok(a.p>.5);assert.ok(b.p<.5);
 for(let i=0;i<3;i++)assert.deepEqual(a.steps[i].h,b.steps[i].h);
 assert.notDeepEqual(a.steps[3].h,b.steps[3].h);
 for(const t of [a,b]){assert.deepEqual(t.steps[0].prior,[0,0,0]);t.steps.slice(1).forEach((s,i)=>assert.deepEqual(s.prior,t.steps[i].h));}
 assert.doesNotMatch(C.render(0),/% positive/);assert.match(C.render(9),/% positive/);
});
