const test=require('node:test'),assert=require('node:assert/strict'),A=require('../assets/js/ai100/nlp-applications.js');
test('Word2Vec reverses input and prediction for the same context',()=>{
 const skip=A.word2vec('skipgram',2),cbow=A.word2vec('cbow',2,1);
 assert.match(skip,/Center word/);assert.match(skip,/Predict nearby words/);assert.match(cbow,/Predict the center word/);
 assert.match(cbow,/does not preserve their order/);assert.doesNotMatch(skip,/How this relates to the embeddings above/);
 assert.match(A.word2vec('skipgram',0),/Predict nearby words/);
});
test('generation reads all inputs before predicting, feeds output back, and ends explicitly',()=>{
 for(const mode of ['translation','caption']){
 const frames=A.applicationFrames(mode),transfer=frames.findIndex(f=>f.phase==='transfer'),predict=frames.findIndex(f=>f.phase==='predict');
 assert.ok(transfer>0&&predict>transfer);
 for(let i=0;i<transfer;i++)assert.equal(frames[i].written,0);
 frames.forEach((f,i)=>{if(f.phase==='emit'){assert.equal(frames[i-1].phase,'predict');assert.equal(f.written,frames[i-1].written+1);assert.match(A.applications(mode,i),/generated-now/)}});
 assert.equal(frames.at(-1).phase,'end');assert.match(A.applications(mode,frames.length-1),/>END</);
 assert.match(A.applicationToolbar(mode,frames.length-1),/disabled/);
 }
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

test('chapter checks provide retry and correct explanations without affecting other scenes',()=>{
 for(const [kind,answer] of [['word2vec',1],['context',0],['evolve',2],['final',1]]){
 assert.doesNotMatch(A.knowledgeCheck(kind),/role="status"/);
 assert.match(A.knowledgeCheck(kind,answer),/Correct./);
 assert.match(A.knowledgeCheck(kind,(answer+1)%3),/Try again./);
 assert.match(A.knowledgeCheck(kind,answer),/aria-pressed="true"/);
 }
 assert.equal(A.knowledgeCheck('rnntrain'),'');
});

test('sentence carousel is rendered and each example updates words and learning targets',()=>{
 A.word2vecSentences.forEach((words,i)=>{
 const html=A.word2vec('skipgram',2,0,i);assert.match(html,/w2v-carousel-nav/);assert.equal((html.match(/class="w2v-carousel-dot"/g)||[]).length,4);
 words.forEach(word=>assert.ok(html.includes('>'+word+'<')));
 const d=A.word2vecStep('skipgram',2,i);assert.deepEqual(d.inputs,[2]);assert.deepEqual(d.targets,[0,1,3,4]);
 });
});
