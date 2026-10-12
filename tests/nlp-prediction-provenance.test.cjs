const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('ai100/nlp_rnn_visualizer.html', 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];
function fixture() {
  const context = vm.createContext({ location: { search: '' }, URLSearchParams, NLPApplications:require('../assets/js/ai100/nlp-applications.js'),RNNComparison:require('../assets/js/ai100/rnn-comparison.js'),RNNTraining:require('../assets/js/ai100/rnn-training.js') });
  vm.runInContext(script.slice(0, script.indexOf('let tokenizationTimer')), context);
  return code => vm.runInContext(code, context);
}
test('complete page script parses', () => { new vm.Script(script); });
test('training mechanism remains separate from the numerical prediction example', () => {
  const run = fixture();
  const before = run('JSON.stringify([EREDUCE, WH, B, OUT, OUT_B, rnn(examples["Not bad"])])');
  for (let phase = 0; phase < 25; phase++) {
    const view = run('trainingLesson.advance();renderRNNTrainingSimple()');
    assert.doesNotMatch(view, /scripted|Actual classifier weights/i);
    assert.match(view, /Sentiment classifier|Sentiment classifier/);
    assert.match(view, /Updated impression/);
  }
  assert.equal(run('JSON.stringify([EREDUCE, WH, B, OUT, OUT_B, rnn(examples["Not bad"])])'), before);
});
test('every curated result identifies its source and explains errors or ambiguity', () => {
  const run = fixture();
  for (const key of run('Object.keys(examples)')) {
    run(`state.example=${JSON.stringify(key)};state.evolveStep=examples[state.example].length-1`);
    const p = run('rnn(examples[state.example]).at(-1).positive');
    const expected = `${Math.round(p * 100)}% positive`;
    for (const view of [run('predictionExplanation(state.example,rnn(examples[state.example]).at(-1).positive)')]) {
      assert.ok(view.includes(expected), key);
      assert.match(view, /Likely human reading/);
      assert.match(view, /Calculated model prediction/);
      if (run('humanReadings[state.example].label')!=='mixed') assert.match(view,(p>=.5?'positive':'negative')===run('humanReadings[state.example].label')?/model agrees/:/model disagrees/);
      if (['Good but dark', 'Bad but great'].includes(key)) assert.match(view, /cannot express a mixed judgment/);
    }
  }
});
test('inference conclusion follows computed score instead of a hardcoded label', () => {
  const run = fixture();
  run('state.rnnStep=7');
  assert.equal(run('rnn(["a"]).at(-1).h.length'),3);
  // Align output weights with the final state to force the opposite classification.
  run("rnn(['a','little','too','dark','for','my','taste']).at(-1).h.forEach((v,i)=>OUT[i]=100*v)");
  const p=run("rnn(['a','little','too','dark','for','my','taste']).at(-1).positive");
  assert.ok(p > .5);
  const view=run('renderRNNInference()');
  assert.ok(view.includes(`${p>=.5?'Positive':'Negative'} · ${Math.round(p*100)}% positive`));
});
test('Scene 11 explains the same calculated results as Scene 10',()=>{
 const run=fixture();
 for(let side=0;side<2;side++){
  run('state.decisionSide='+side);const view=run('renderFinal()'),p=run('RNNComparison.traces()['+side+'].p');
  assert.ok(view.includes(Math.round(p*100)+'%'));assert.ok(view.includes(Math.round((1-p)*100)+'%'));
  assert.ok(view.includes(run('RNNComparison.sentences['+side+'].join(" ")')));
  assert.match(view,/See the weights and calculation/);assert.match(view,/sigmoid/);assert.doesNotMatch(view,/50D embeddings/);
 }
});
test('training and inference diagrams distinguish recurrent state from sentence output', () => {
  const run=fixture();
  for(const view of [run('renderRNNTrainingSimple()'),run('renderRNNInference()')]) {
    assert.match(view,/Current word/);
    assert.match(view,/word embedding/i);
    assert.match(view,/Prior impression/);
    assert.match(view,/Updated impression/);
    assert.match(view,/class="rnn-return/);
    assert.match(view,/Sentiment classifier/);
    assert.doesNotMatch(view,/To sentiment/);
  }
});

test('representation lessons explain identity, lookup, projection, and state separately',()=>{
 const run=fixture();assert.match(run('renderOnehot()'),/Identity, not meaning/);
 assert.match(run('renderLookup()'),/Each row shows 50 values/);assert.match(run('renderLookup()'),/Embedding value 1/);
 assert.match(run('renderSemantic()'),/distorted/);assert.match(run('renderContext()'),/Same static embedding for killer/);
});
