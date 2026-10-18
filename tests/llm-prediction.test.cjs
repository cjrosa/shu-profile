const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('../tools/llm-tokenizer/node_modules/jsdom');
const model=require('../assets/js/ai100/llm-prediction-model.js');
const layer=require('../assets/js/ai100/llm-layer-model.js');
test('every example uses the last contextualized position and full-vocabulary softmax',()=>{
  model.examples.forEach((_,i)=>{
    const r=model.calculate(i);
    assert.equal(r.target,r.words.length-1);
    assert.deepEqual(r.representation,layer.calculate(model.examples[i].lookup||r.words,r.target).output);
    const expected=model.vocabularyFor(i).map(([token,w,b])=>({token,score:b+w.reduce((s,v,d)=>s+v*r.representation[d],0)}));
    const denominator=expected.reduce((s,c)=>s+Math.exp(c.score),0);
    r.candidates.forEach((c,j)=>{
      const e=expected.find(e=>e.token===c.token);
      assert.ok(Math.abs(c.score-e.score)<1e-12);
      assert.ok(Math.abs(c.probability-Math.exp(e.score)/denominator)<1e-12);
      if(j)assert.ok(r.candidates[j-1].probability>=c.probability);
    });
    assert.ok(Math.abs(r.candidates.reduce((s,c)=>s+c.probability,0)-1)<1e-12);
    assert.ok(Math.abs(r.other-r.candidates.slice(5).reduce((s,c)=>s+c.probability,0))<1e-12);
    assert.ok(Math.abs(r.shown.reduce((s,c)=>s+c.probability,r.other)-1)<1e-12);
    assert.deepEqual(r,model.calculate(i));
  });
});
function fixture(){
  const dom=new JSDOM(fs.readFileSync('ai100/llm_explorer.html','utf8'),{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost/ai100/llm_explorer.html?chapter=5&scene=1'});
  for(const name of ['explorer','qk-model','values-model','layer-model','prediction-model','prediction'])dom.window.eval(fs.readFileSync('assets/js/ai100/llm-'+name+'.js','utf8'));
  return {dom,w:dom.window,get:n=>dom.window.document.getElementById('prediction'+n)};
}
test('scene opens completely, without selecting a generated token; candidate highlights stay linked',()=>{
  const {dom,w,get}=fixture();
  assert.equal(get('Demo').hidden,false);
  assert.equal(get('Probabilities').children.length,6);
  assert.equal(get('Scores').children.length,5);
  assert.equal(get('Demo').querySelectorAll('[aria-pressed=true]').length,0);
  assert.match(get('Target').textContent,/Haven/);
  const candidate=get('Probabilities').children[2];candidate.click();
  assert.equal(get('Demo').querySelectorAll('[aria-pressed=true]').length,2);
  assert.equal(get('Scores').querySelector('.selected').dataset.candidate,candidate.dataset.candidate);
  candidate.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  assert.equal(w.document.activeElement,get('Probabilities').children[3]);
  assert.equal(get('Scores').querySelectorAll('.selected').length,2);
  assert.ok(get('Scores').querySelector('[data-candidate="'+w.document.activeElement.dataset.candidate+'"]').classList.contains('selected'));
  w.document.activeElement.blur();
  assert.equal(get('Scores').querySelector('.selected').dataset.candidate,candidate.dataset.candidate);
  const other=get('Probabilities').lastElementChild;
  assert.equal(other.hasAttribute('data-candidate'),false);
  assert.equal(other.tagName,'DIV');
  other.click();
  assert.equal(get('Scores').querySelector('.selected').dataset.candidate,candidate.dataset.candidate);
  assert.match(get('Inspection').textContent,/No next token has been chosen/);
  dom.window.close();
});
test('dropdown, reset, touch information and chapter navigation',()=>{
  const {dom,w,get}=fixture();
  get('Scores').children[0].click();
  get('PickerButton').click();
  get('Picker').dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true}));
  assert.equal(w.document.activeElement,get('PickerMenu').lastElementChild);
  w.document.activeElement.click();
  assert.match(get('Target').textContent,/Last position: was/);
  assert.equal(get('Demo').querySelectorAll('[aria-pressed=true]').length,0);
  assert.equal(get('PickerMenu').hidden,true);
  get('Softmax').click();
  assert.equal(w.document.getElementById('llmTooltip').hidden,false);
  assert.match(w.document.getElementById('llmTooltip').textContent,/attention weights/);
  get('Reset').click();
  assert.match(get('Target').textContent,/Haven/);
  assert.equal(get('PickerButton').textContent,'New Haven');
  w.document.getElementById('nextBtn').click();
  assert.equal(get('Demo').hidden,true);
  w.document.getElementById('prevBtn').click();
  assert.equal(get('Demo').hidden,false);
  w.document.getElementById('prevBtn').click();
  assert.equal(w.document.getElementById('layerDemo').hidden,false);
  assert.equal(get('Demo').hidden,true);
  dom.window.close();
});

test('approved New Haven distribution remains unchanged',()=>{
  const r=model.calculate(0);
  assert.deepEqual(r.representation,[2.3853669970517766,-0.05258973174305031,0.36936071635870216]);
  assert.deepEqual(r.shown.map(c=>c.token),['pizza','is','sets','has','brings']);
  assert.deepEqual(r.candidates.map(c=>c.probability),[0.5481407720421512,0.17726753938921144,0.09745858921907197,0.06858164478351235,0.03859537718362727,0.02590518276549654,0.016536257900323564,0.011523428203196283,0.00930333303706084,0.006687875476348393]);
  assert.equal(r.other,0.06995607738242561);
});

test('all five dropdown examples update every displayed value, clear selection and reset reproducibly',()=>{
  const {dom,w,get}=fixture();
  const baseline=get('Probabilities').innerHTML;
  const endings=['Haven','were','was','the','was'];
  assert.equal(get('PickerMenu').children.length,5);
  model.examples.forEach((example,i)=>{
    get('Scores').firstElementChild.click();
    get('PickerButton').click();
    get('PickerMenu').children[i].click();
    const r=model.calculate(i);
    assert.equal(get('PickerButton').textContent,example.name);
    assert.equal(get('Tokens').querySelector('svg').getAttribute('aria-label'),`${example.text} Last position: ${endings[i]}`);
    assert.equal(get('Tokens').querySelector('.selected text').textContent,endings[i]);
    assert.equal(get('Demo').querySelectorAll('[aria-pressed=true]').length,0);
    assert.equal(get('Demo').querySelectorAll('[data-candidate].selected').length,0);
    assert.match(get('VectorDetails').textContent,new RegExp(r.representation.map(v=>v.toFixed(6)).join(', ')));
    r.shown.forEach((c,j)=>{
      const score=get('Scores').children[j],bar=get('Probabilities').children[j];
      assert.equal(score.dataset.candidate,c.token);
      assert.equal(score.querySelector('strong').textContent,c.score.toFixed(3));
      assert.equal(bar.dataset.candidate,c.token);
      assert.equal(bar.querySelector(':scope > span').textContent,(c.probability*100).toFixed(1)+'%');
      assert.ok(Math.abs(parseFloat(bar.querySelector('.count-bar').style.width)-c.probability*100)<1e-10);
      score.onpointerenter(); // jsdom does not dispatch pointerenter handler properties.
      assert.ok(bar.classList.contains('selected'));
      score.onpointerleave();
      score.click();
      assert.equal(bar.getAttribute('aria-pressed'),'true');
      bar.focus();
      assert.ok(score.classList.contains('selected'));
    });
    assert.equal(get('Parameters').children.length,10);
    assert.equal(get('Probabilities').lastElementChild.querySelector(':scope > span').textContent,(r.other*100).toFixed(1)+'%');
    get('Reset').click();
    assert.equal(get('PickerButton').textContent,'New Haven');
    assert.equal(get('Probabilities').innerHTML,baseline);
    assert.equal(get('Demo').querySelectorAll('[aria-pressed=true]').length,0);
  });
  assert.equal(model.examples[2].vocabulary,model.examples[4].vocabulary);
  assert.notDeepEqual(model.calculate(2).representation,model.calculate(4).representation);
  dom.window.close();
});
