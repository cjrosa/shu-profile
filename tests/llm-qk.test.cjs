const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs');
const {JSDOM}=require('../tools/llm-tokenizer/node_modules/jsdom');
const model=require('../assets/js/ai100/llm-qk-model.js');
const {examples}=require('../assets/js/ai100/llm-self-attention.js');
const visualizer=require('../assets/js/ai100/rnn-training.js');
const referenceCache=new Map();
function referenceCells(values){
  const key=JSON.stringify(values);
  if(!referenceCache.has(key)){
    const reference=new JSDOM(visualizer.flow({word:'test',embedding:[0,0],prior:values,updated:null}));
    referenceCache.set(key,[...reference.window.document.querySelectorAll('.prior-blocks rect')].map(cell=>Object.fromEntries(['fill','width','height','rx'].map(attr=>[attr,cell.getAttribute(attr)]))));
    reference.window.close();
  }
  return referenceCache.get(key);
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
function fixture(){
  const dom=new JSDOM(fs.readFileSync('ai100/llm_explorer.html','utf8'),{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost/ai100/llm_explorer.html?chapter=4&scene=2'});
  const w=dom.window;
  w.matchMedia=()=>({matches:true});
  for(const name of ['llm-explorer','llm-qk-model','llm-qk'])w.eval(fs.readFileSync(`assets/js/ai100/${name}.js`,'utf8'));
  const get=n=>w.document.getElementById('qk'+n);
  const choose=i=>get('Diagram').querySelector(`[data-token="${i}"]`).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  return {dom,w,get,choose};
}
test('projections and scaled scores agree with independently worked example',()=>{
  const r=model.calculate(examples[0].text.split(' '),5);
  assert.deepEqual(r.queries[5],[1.5,.2]);
  assert.deepEqual(r.keys[3],[2.05,-.1]);
  near(r.dots[3],3.055);near(r.scores[3],3.055/Math.sqrt(2));
  const expected=[-.695,1.555,.315,3.055,-.695,.6].map(x=>Math.exp(x/Math.sqrt(2)));
  const total=expected.reduce((a,b)=>a+b,0);
  expected.forEach((x,i)=>near(r.weights[i],x/total));
  assert.ok(r.scores[0]<0);
  assert.deepEqual(model.representation('Marie'),model.representation('MARIE.'));
});
test('every example and target is deterministic, causal and normalized',()=>{
  examples.forEach(example=>{
    const words=example.text.split(' ');
    words.forEach((_,target)=>{
      const r=model.calculate(words,target);
      assert.deepEqual(r,model.calculate(words,target));
      near(r.weights.reduce((a,b)=>a+b,0),1);
      r.weights.forEach((weight,i)=>{
        assert.ok(i<=target?weight>0:weight===0);
        assert.equal(r.maskedScores[i],i<=target?r.scores[i]:-Infinity);
        const [a,b,c]=r.representations[i];
        assert.deepEqual(r.queries[i],[b+.5*c,a-.5*c]);
        assert.deepEqual(r.keys[i],[a+.25*c,b-.5*c]);
      });
    });
  });
  assert.throws(()=>model.calculate(['the'],-1),RangeError);
});
test('complete scene loads with default target and source, one optional disclosure',()=>{
  const {dom,get,w}=fixture();
  assert.equal(get('Demo').hidden,false);
  assert.equal(w.document.getElementById('selfAttentionDemo').hidden,true);
  assert.equal(w.document.querySelector('.placeholder').hidden,true);
  assert.match(w.document.getElementById('sceneTitle').textContent,/Attention Scores/);
  assert.match(get('Target').textContent,/they/);
  assert.match(get('Inspection').textContent,/Query · they.*Key · pizzas/);
  assert.equal(get('Demo').querySelectorAll('details').length,1);
  assert.equal(get('Demo').querySelector('details').open,false);
  assert.equal(get('Comparison').querySelectorAll('[data-query-dimension]').length,2);
  assert.equal(get('Comparison').querySelectorAll('[data-key-dimension]').length,2);
  assert.equal(get('Comparison').querySelectorAll('[data-product-dimension]').length,2);
  assert.equal(get('Comparison').querySelectorAll('.qk-illustrative-dimension').length,0);
  assert.doesNotMatch(get('Comparison').textContent,/Dimension [34]|q₃|q₄|k₃|k₄|⋮|…/);
  assert.equal(get('Comparison').querySelector('svg').getAttribute('viewBox'),'0 0 740 235');
  assert.deepEqual([...get('Comparison').querySelectorAll('p.tokens-note')].map(p=>p.textContent),[
    'Real transformers typically use larger Query and Key vectors. This teaching example uses two dimensions to make the calculation easy to follow.',
    'Softmax compares this score with all other permitted scores to determine its share of the total attention.'
  ]);
  dom.window.close();
});
test('every target synchronizes calculated SVG strengths, labels, bar and inspection',()=>{
  const {dom,get,choose}=fixture();
  examples.forEach((example,e)=>{
    get('PickerMenu').children[e].click();
    const words=example.text.split(' ');
    words.forEach((_,target)=>{
      choose(target);
      const r=model.calculate(words,target);
      const paths=[...get('Diagram').querySelectorAll('path.attention-connection')];
      assert.equal(paths.length,target+1);
      near([...get('Bar').children].reduce((s,n)=>s+parseFloat(n.style.width),0)/100,1);
      r.weights.forEach((weight,i)=>{
        const token=get('Diagram').querySelector(`[data-token="${i}"]`);
        near(Number(token.dataset.weight),weight);
        if(i>target){assert.match(token.textContent,/Unavailable/);return;}
        near(Number(paths[i].getAttribute('stroke-width')),1.25+8*weight);
        near(parseFloat(get('Bar').children[i].style.width)/100,weight);
        assert.equal(token.querySelector('[data-inspect]').textContent,(weight*100).toFixed(1)+'%');
        get('Bar').children[i].click();
        r.queries[target].forEach((v,j)=>{
          near(Number(get('Comparison').querySelector(`[data-query-dimension="${j}"]`).dataset.value),v);
          near(Number(get('Comparison').querySelector(`[data-key-dimension="${j}"]`).dataset.value),r.keys[i][j]);
          near(Number(get('Comparison').querySelector(`[data-product-dimension="${j}"]`).dataset.value),v*r.keys[i][j]);
        });
        near(Number(get('Sum').dataset.value),r.dots[i]);
        near(Number(get('Dot').dataset.value),r.dots[i]);
        near(Number(get('Score').dataset.value),r.scores[i]);
        near(Number(get('Weight').dataset.value),weight*100);
        assert.equal(get('VisualWeight').textContent,get('Weight').textContent);
        assert.equal(get('WeightMeaningTitle').textContent,`What does ${(weight*100).toFixed(1)}% mean?`);
        assert.ok(get('WeightMeaningIs').textContent.startsWith(`The attention weight assigned to ${words[i]}.`));
        near(Number(get('VisualWeight').dataset.value),weight*100);
        near(Number(get('VisualScore').dataset.value),r.scores[i]);
        assert.equal(get('VisualScore').textContent,r.scores[i].toFixed(3));
        const pool=[...get('PermittedScores').children];
        assert.equal(pool.length,target+1);
        pool.forEach((node,j)=>near(Number(node.dataset.score),r.scores[j]));
        assert.equal(get('PermittedScores').querySelector('.qk-selected-score').dataset.permittedScore,String(i));
        const selectedScore=get('PermittedScores').querySelector('.qk-selected-score');
        assert.equal(get('PermittedScores').querySelectorAll('.qk-selected-score').length,1);
        assert.ok(selectedScore.querySelector('rect'));
        assert.match(selectedScore.getAttribute('aria-label'),/^Selected source:/);
        assert.equal(selectedScore.style.getPropertyValue('--word-color'),get('Bar').children[i].style.getPropertyValue('--word-color'));
        assert.equal(get('WeightToBar'),null);
        assert.ok(get('VisualResult').querySelector('rect'));
        for(const [kind,values] of [['query',r.queries[target]],['key',r.keys[i]]]){
          // Compare directly to the approved NLP/RNN renderer, not a second
          // implementation of its color formula in this test.
          const cells=referenceCells(values.map(v=>v/2.05));
          const illustration=[...get('VisualComparison').querySelectorAll(`[data-visual-${kind}]`)];
          assert.equal(illustration.length,2);
          illustration.forEach((cell,j)=>{
            const coordinate=j%values.length,v=values[coordinate];
            assert.equal(Number(cell.dataset.coordinate),coordinate);
            near(Number(cell.dataset.stateValue),v);
            assert.equal(cell.querySelector('rect').getAttribute('fill'),cells[coordinate].fill);
            assert.equal(cell.querySelector('text').textContent,v.toFixed(2));
            assert.equal(cell.querySelector('rect').getAttribute('width'),'50');
            assert.equal(cell.querySelector('rect').getAttribute('height'),'30');
            assert.equal(cell.querySelector('rect').getAttribute('rx'),'5');
            assert.ok(cell.dataset.tooltip.includes(v.toFixed(3)));
            assert.equal(cell.getAttribute('tabindex'),'0');
          });
        }
        assert.match(get('Inspection').textContent,new RegExp(r.scores[i].toFixed(3).replace('.','\\.')));
        assert.ok(get('Inspection').textContent.includes((weight*100).toFixed(1)+'%'));
        assert.equal(get('Diagram').querySelector('path.inspected').dataset.source,String(i));
      });
    });
  });
  dom.window.close();
});
test('they stays fixed while pizzas and team change visible Key, products, score and weight',()=>{
  const {dom,get,choose}=fixture();
  choose(5);
  const query=get('QueryVector'), original=query.outerHTML;
  const visualQuery=get('VisualQuery'), visualOriginal=visualQuery.outerHTML;
  const expected=model.calculate(examples[0].text.split(' '),5);
  const weights=[...get('Bar').children].map(n=>n.dataset.weight);
  const values={};
  for(const i of [3,1,3,1]){
    get('Bar').children[i].click();
    assert.equal(get('QueryVector'),query);
    assert.equal(query.outerHTML,original);
    assert.equal(get('VisualQuery'),visualQuery);
    assert.equal(visualQuery.outerHTML,visualOriginal);
    assert.equal(get('VisualKeyLabel').textContent,i===3?'pizzas':'team');
    near(Number(get('VisualComparison').querySelector('[data-visual-key="0"]').dataset.stateValue),expected.keys[i][0]);
    assert.equal(get('KeyLabel').textContent,i===3?'pizzas':'team');
    assert.equal(get('Comparison').querySelector('[data-key-dimension="0"]').textContent,expected.keys[i][0].toFixed(2));
    assert.equal(get('Comparison').querySelector('[data-product-dimension="0"]').textContent,(1.5*expected.keys[i][0]).toFixed(3));
    assert.equal(get('Score').textContent,expected.scores[i].toFixed(3));
    assert.equal(get('Weight').textContent,(expected.weights[i]*100).toFixed(1)+'%');
    assert.deepEqual([...get('Bar').children].map(n=>n.dataset.weight),weights);
    values[i]=[get('Score').textContent,get('Weight').textContent,get('VisualKey').querySelector('rect').getAttribute('fill')];
  }
  assert.notDeepEqual(values[3],values[1]);
  assert.notEqual(values[3][2],values[1][2],'pizzas and team must have distinct cell colors');
  assert.ok(get('VisualComparison').compareDocumentPosition(get('Bar'))&dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.ok(get('Bar').compareDocumentPosition(get('Diagram'))&dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.ok(get('BarTitle').compareDocumentPosition(get('Bar'))&dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.doesNotMatch(get('Demo').textContent,/Attention weight · share of the total/);
  assert.equal(get('SoftmaxNote').dataset.tooltip,'What is Softmax? Softmax converts attention scores into percentages that add up to 100%. Higher scores receive larger percentages, allowing the model to assign different attention weights to available words.');
  assert.ok(get('VisualComparison').compareDocumentPosition(get('Diagram'))&dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(get('VisualComparison').closest('details'),null);
  assert.equal(get('Comparison').closest('details'),get('Demo').querySelector('details'));
  assert.equal(get('VisualComparison').querySelectorAll('.rnn-state-blocks rect').length,4);
  assert.doesNotMatch(get('VisualComparison').textContent,/√|Dot product|Products/);
  assert.equal(get('Demo').querySelector('details').open,false);
  choose(3);
  assert.notEqual(get('QueryVector').outerHTML,original);
  assert.notEqual(get('VisualQuery').outerHTML,visualOriginal);
  assert.notDeepEqual([...get('Bar').children].map(n=>n.dataset.weight),weights);
  dom.window.close();
});
test('source selection, hover restoration, keyboard navigation, examples and reset',()=>{
  const {dom,w,get,choose}=fixture();
  const key=(node,k,shiftKey=false)=>node.dispatchEvent(new w.KeyboardEvent('keydown',{key:k,shiftKey,bubbles:true}));
  get('Diagram').querySelector('[data-inspect="1"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  assert.match(get('Inspection').textContent,/Key · team/);
  get('Diagram').querySelector('[data-token="3"]').dispatchEvent(new w.Event('pointerenter'));
  assert.match(get('Inspection').textContent,/Key · pizzas/);
  get('Diagram').querySelector('[data-token="3"]').dispatchEvent(new w.Event('pointerleave'));
  assert.match(get('Inspection').textContent,/Key · team/);
  key(get('Diagram').querySelector('[data-token="5"]'),'End');
  assert.equal(w.document.activeElement.dataset.token,'7');
  key(get('Diagram').querySelector('[data-inspect="3"]'),'Enter');
  assert.match(get('Inspection').textContent,/Key · pizzas/);
  key(get('Diagram').querySelector('[data-token="1"]'),' ',true);
  assert.match(get('Inspection').textContent,/Key · team/);
  get('PickerButton').click();key(get('Picker'),'End');
  assert.equal(w.document.activeElement.textContent,'Longer Context');
  w.document.activeElement.click();assert.match(get('Target').textContent,/She/);
  get('PickerMenu').children[1].click();assert.match(get('Target').textContent,/She · 10/);
  choose(0);get('Reset').click();assert.match(get('Target').textContent,/She/);
  get('PickerMenu').children[0].click();get('Reset').click();
  assert.match(get('Target').textContent,/they/);assert.match(get('Inspection').textContent,/Key · pizzas/);
  get('PickerButton').click();key(get('Picker'),'Escape');
  assert.equal(get('PickerMenu').hidden,true);assert.equal(w.document.activeElement,get('PickerButton'));
  dom.window.close();
});
test('rapid updates with reduced motion use no animation timers and keep latest values',()=>{
  const {dom,w,get,choose}=fixture();
  w.setTimeout=w.requestAnimationFrame=()=>{throw Error('Unexpected animation');};
  for(let i=0;i<40;i++){get('PickerMenu').children[i%4].click();choose(i%5);}
  choose(0);assert.match(get('Inspection').textContent,/100.0%/);
  assert.equal(get('Bar').children.length,1);
  assert.match(fs.readFileSync('ai100/llm_explorer.html','utf8'),/@media\(prefers-reduced-motion:reduce\)/);
  dom.window.close();
});
test('colored cells expose values through shared black tooltips on hover and focus',()=>{
  const {dom,w,get}=fixture();
  const cell=get('VisualComparison').querySelector('[data-visual-key="0"]');
  cell.dispatchEvent(new w.Event('pointerover',{bubbles:true}));
  let tooltip=w.document.getElementById('llmTooltip');
  assert.equal(tooltip.className,'llm-tooltip');
  assert.match(tooltip.textContent,/pizzas.*2\.050/);
  assert.equal(get('VisualComparison').querySelectorAll('title,[title]').length,0);
  cell.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(w.document.getElementById('llmTooltip'),null);
  get('Bar').children[1].click();cell.focus();
  tooltip=w.document.getElementById('llmTooltip');
  assert.match(tooltip.textContent,/team.*1\.050/);
  assert.match(cell.dataset.tooltip,/Fixed color scale: magnitude 0 to 2.05/);
  const details=get('Comparison').closest('details');
  details.open=true;
  assert.equal(get('VisualWeight').textContent,get('Weight').textContent);
  assert.equal(get('Comparison').querySelector('[data-key-dimension="0"]').dataset.value,cell.dataset.stateValue);
  details.open=false;
  assert.equal(get('VisualComparison').closest('details'),null);
  dom.window.close();
});
test('one information message follows the bar and adapts to pronoun and general targets',()=>{
  const {dom,get,choose}=fixture();
  assert.equal(get('Bar').nextElementSibling,get('WeightMeaning'));
  assert.equal(get('Demo').querySelectorAll('#qkWeightMeaning').length,1);
  assert.ok(get('WeightMeaning').classList.contains('tokens-feedback'));
  assert.ok(get('WeightMeaning').querySelector('.tokens-feedback-icon.attention-info-icon'));
  assert.equal(get('WeightMeaning').getAttribute('aria-live'),'polite');
  assert.match(get('WeightMeaningNot').textContent,/55\.3% probability.*refers to pizzas/);
  get('Bar').children[1].click();
  assert.match(get('WeightMeaningNot').textContent,/19\.2% probability.*refers to team/);
  assert.match(get('WeightMeaningIs').textContent,/Value vector contributes to the attention output/);
  choose(3);
  const general="A probability that the words have a particular meaning or relationship, or a measure of the model's understanding.";
  assert.equal(get('WeightMeaningNot').textContent,general);
  get('PickerMenu').children[2].click();
  assert.equal(get('WeightMeaningNot').textContent,general);
  get('PickerMenu').children[1].click();get('Reset').click();
  assert.match(get('WeightMeaningNot').textContent,/probability that the selected word refers to She/);
  assert.ok(get('WeightMeaningTitle').textContent.includes(get('VisualWeight').textContent));
  dom.window.close();
});
