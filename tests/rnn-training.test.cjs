const test=require('node:test'),assert=require('node:assert/strict');
const T=require('../assets/js/ai100/rnn-training.js');
const copy=x=>JSON.parse(JSON.stringify(x));
test('forward recurrence carries the entire prior hidden state, starting at zero',()=>{
  const trace=T.forward(T.initial(),T.sentences[0]);
  assert.deepEqual(trace.steps[0].prior,[0,0,0]);
  trace.steps.slice(1).forEach((s,i)=>assert.deepEqual(s.prior,trace.steps[i].h));
  assert.ok(trace.p>0&&trace.p<1);
});
test('backpropagation through time matches finite differences for every parameter',()=>{
  const m=T.initial(),e=T.sentences[0],trace=T.forward(m,e),g=T.backward(m,e,trace).gradient,epsilon=1e-5;
  function check(path){const plus=copy(m),minus=copy(m);let p=plus,n=minus,gradient=g;for(const k of path.slice(0,-1)){p=p[k];n=n[k];gradient=gradient[k]}const last=path.at(-1);p[last]+=epsilon;n[last]-=epsilon;const numeric=(T.forward(plus,e).loss-T.forward(minus,e).loss)/(2*epsilon);assert.ok(Math.abs(numeric-gradient[last])<1e-7,`${path}: ${numeric} != ${gradient[last]}`)}
  for(const key of ['U','W'])m[key].forEach((row,j)=>row.forEach((_,i)=>check([key,j,i])));
  for(const key of ['b','V'])m[key].forEach((_,i)=>check([key,i]));check(['c']);
});
test('each word contributes to the same shared gradient; an update reduces example loss',()=>{
  for(const e of T.sentences){const model=T.initial(),trace=T.forward(model,e),feedback=T.backward(model,e,trace);
    for(const key of ['U','W'])feedback.gradient[key].forEach((row,j)=>row.forEach((v,i)=>assert.ok(Math.abs(v-feedback.contributions.reduce((sum,c)=>sum+c[key][j][i],0))<1e-12)));
    T.apply(model,feedback.gradient);assert.ok(T.forward(model,e).loss<trace.loss);
  }
});
test('word phases expose state carry; predictions wait until end; backward steps precede update',()=>{
  const lesson=T.create(),original=lesson.snapshot().model;let steps=0;const phases=[];
  while(lesson.snapshot().phase!=='complete'&&steps++<80){const s=lesson.snapshot();phases.push([s.phase,s.word,s.back]);assert.deepEqual(s.model,original);const html=lesson.render();if(['input','state','carry','end'].includes(s.phase))assert.doesNotMatch(html,/rnn-classifier-score/);if(s.phase==='backward'){assert.match(html,/Sentiment classifier/);assert.doesNotMatch(html,/rnn-instruction/);assert.equal(s.version,0)}lesson.advance()}
  assert.equal(phases.filter(([p])=>p==='input').length,3);
  assert.equal(phases.filter(([p])=>p==='carry').length,2);
  assert.equal(phases.filter(([p])=>p==='backward').length,1);
  assert.equal(lesson.snapshot().version,1);assert.notDeepEqual(lesson.snapshot().model,original);
  assert.doesNotMatch(lesson.render(),/rnn-reset-path/);
});
test('next sentence retains learned weights but clears the hidden-state trace',()=>{
  const lesson=T.create();lesson.finish();const learned=lesson.snapshot().model;lesson.advance();const next=lesson.snapshot();
  assert.equal(next.phase,'input');assert.equal(next.word,0);assert.equal(next.trace,null);assert.equal(next.round,1);assert.deepEqual(next.model,learned);
  lesson.advance();assert.deepEqual(lesson.snapshot().trace.steps[0].prior,[0,0,0]);
});
test('step back, finish, reset, and repeated sentences preserve deterministic learning',()=>{
  const lesson=T.create();lesson.finish();const completed=lesson.snapshot();lesson.back();assert.equal(lesson.snapshot().phase,'adjust');assert.equal(lesson.snapshot().version,0);lesson.advance();assert.deepEqual(lesson.snapshot().model,completed.model);
  for(let i=0;i<8;i++){lesson.advance();lesson.finish();const s=lesson.snapshot();assert.equal(s.version,i+2);assert.ok(s.after.loss<s.trace.loss)}
  lesson.reset();assert.deepEqual(lesson.snapshot().model,T.initial());assert.equal(lesson.snapshot().history.length,0);
});
test('visible neuron nodes anchor every connection and sentence words precede the network',()=>{
  const lesson=T.create(),html=lesson.render();
  assert.ok(html.indexOf('rnn-sentence-strip')<html.indexOf('rnn-flow-diagram'));
  const neurons=[...html.matchAll(/class="rnn-neuron \w+" cx="(\d+)" cy="(\d+)"/g)].map(m=>`${m[1]},${m[2]}`);
  assert.equal(neurons.length,5);
  const connections=[...html.matchAll(/class="rnn-synapse \w+" d="M(\d+) (\d+)L(\d+) (\d+)"/g)];
  assert.equal(connections.length,6);
  assert.match(html,/Entire current word embedding/);
  assert.match(html,/Entire prior impression/);
  assert.doesNotMatch(html,/Word values/);
  for(const [,x1,y1,x2,y2] of connections){assert.ok(neurons.includes(`${x1},${y1}`));assert.ok(neurons.includes(`${x2},${y2}`))}
  // The cell background must not paint over the incoming paths inside the cell.
  assert.ok(html.indexOf('class="rnn-flow-box cell"')<html.indexOf('class="rnn-word-entry"'));
  assert.ok(html.indexOf('class="rnn-flow-box cell"')<html.indexOf('class="rnn-prior-entry"'));
  assert.match(html,/class="rnn-word-entry" d="M270 230H341"/);
  assert.match(html,/class="rnn-prior-entry" d="M270 346H341"/);
  const exits=[...html.matchAll(/class="rnn-state-exit" d="M503 (\d+)L545 288H570"/g)];
  assert.equal(exits.length,3);
  for(const [,y] of exits)assert.ok(neurons.includes(`490,${y}`));
});
test('phase-specific signals show entry, recurrence, prediction, feedback, and actual weight changes',()=>{
  const lesson=T.create();assert.match(lesson.render(),/animateMotion/);
  lesson.advance();assert.match(lesson.render(),/rnn-phase-state/);assert.match(lesson.render(),/rnn-signal word/);
  lesson.advance();assert.match(lesson.render(),/path="M697 341V420H140V401"/);
  while(lesson.snapshot().phase!=='predict')lesson.advance();assert.match(lesson.render(),/rnn-phase-predict/);
  lesson.advance();lesson.advance();assert.match(lesson.render(),/rnn-signal error/);
  lesson.finish();const html=lesson.render();assert.match(html,/rnn-phase-complete/);
  const weights=[...html.matchAll(/--weight-before:([\d.]+);--weight-after:([\d.]+)/g)];
  assert.ok(weights.some(([,a,b])=>a!==b));
});
test('state blocks show the actual hidden values and carry unchanged into the next word',()=>{
 const lesson=T.create();
 function values(group){const markup=lesson.render().split('class="rnn-state-blocks '+group+'"')[1].split('</g>')[0];return [...markup.matchAll(/data-state-value="([^"]+)"/g)].map(m=>Number(m[1]));}
 assert.deepEqual(values('prior-blocks'),[0,0,0]);assert.deepEqual(values('updated-blocks'),[]);
 lesson.advance();const h=lesson.snapshot().trace.steps[0].h;assert.deepEqual(values('updated-blocks'),h);
 lesson.advance();lesson.advance();assert.deepEqual(values('prior-blocks'),h);
 lesson.finish();lesson.advance();assert.deepEqual(values('prior-blocks'),[0,0,0]);
});
test('each sentence runs one branching backward wave covering every network connection',()=>{
  const lesson=T.create();
  for(const sentence of T.sentences){
    let backwardEntries=0;
    while(lesson.snapshot().phase!=='complete'){
      if(lesson.snapshot().phase==='backward'){
        backwardEntries++;
        const html=lesson.render();
        const motions=[...html.matchAll(/class="rnn-signal error"[^>]*><animateMotion path="([^"]+)" dur="([\d.]+)s" begin="([\d.]+)s"/g)];
        assert.equal(motions.filter(([,path])=>path.startsWith('M880 288')).length,1);
        for(const [,x,y,hx,hy] of html.matchAll(/class="rnn-synapse \w+" d="M(\d+) (\d+)L(\d+) (\d+)"/g)){
          assert.ok(motions.some(([,path])=>path===`M${hx} ${hy}L${x} ${y}`),'Feedback reaches each input connection');
        }
        for(const [,y] of html.matchAll(/class="rnn-neuron hidden" cx="490" cy="(\d+)"/g)){
          assert.ok(motions.some(([,path])=>path===`M545 288L490 ${y}`),'Feedback branches to each hidden neuron');
        }
        assert.ok(motions.every(([,path,duration,begin])=>(Number(duration)+Number(begin))*1000<lesson.playbackDelay()));
        assert.doesNotMatch(html,/rnn-backward-track/);
        assert.ok(lesson.playbackDelay()>(.8+sentence.words.length*.65)*1000);
      }
      lesson.advance();
    }
    assert.equal(backwardEntries,1,sentence.text);
    lesson.advance();
  }
});

test('first training cycle demonstrates a learned positive prediction and a negative prediction',()=>{
 const lesson=T.create();lesson.finish();let s=lesson.snapshot();
 assert.ok(s.trace.p<.5);assert.ok(s.after.p>=.5);assert.ok(s.after.loss<s.trace.loss);
 lesson.advance();lesson.finish();s=lesson.snapshot();
 assert.ok(s.trace.p<.5);assert.ok(s.after.p<.5);assert.ok(s.after.loss<s.trace.loss);
 assert.equal(s.version,2);
});
