const test=require('node:test'),assert=require('node:assert/strict'),A=require('../assets/js/ai100/nlp-applications.js');
test('Word2Vec reverses input and prediction for the same context',()=>{
 const skip=A.word2vec('skipgram',2),cbow=A.word2vec('cbow',2,1);
 assert.match(skip,/Center word/);assert.match(skip,/Predict nearby words/);assert.match(cbow,/Predict the center word/);
 assert.match(cbow,/does not preserve their order/);assert.doesNotMatch(skip,/How this relates to the embeddings above/);
 assert.match(A.word2vec('skipgram',0),/Predict nearby words/);
});
test('translation reads before generation and finishes after four output words',()=>{
 assert.doesNotMatch(A.applications('translation',2),/>Me</);
 assert.match(A.applications('translation',4),/>Me</);
 assert.match(A.applications('translation',7),/>libros</);
 assert.match(A.applications('translation',7),/>END</);
});
test('caption starts from visual context and generates three words',()=>{
 assert.match(A.applications('caption',0),/Context is ready/);
 assert.match(A.applications('caption',3),/>runs</);
 assert.match(A.applications('caption',3),/>END</);
});

test('Word2Vec learning updates only input embeddings and reduces target loss',()=>{
 for(const mode of ['skipgram','cbow'])for(let center=0;center<5;center++){
 const d=A.word2vecStep(mode,center),loss=p=>-d.targets.reduce((sum,i)=>sum+Math.log(p[i]),0)/d.targets.length;
 assert.ok(loss(d.afterP)<loss(d.p));
 d.before.forEach((row,i)=>{assert.equal(row.length,6);if(d.inputs.includes(i))assert.notDeepEqual(row,d.after[i]);else assert.deepEqual(row,d.after[i])});
 assert.notDeepEqual(d.outputBefore,d.outputAfter);
 assert.match(A.word2vec(mode,center,4),/w2v-phase-4/);
 }
});
