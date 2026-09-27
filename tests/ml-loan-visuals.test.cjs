const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/js/components/ai-ml-lab.js','utf8');
function fixture(){
 const ctx={window:{},document:{activeElement:null},queueMicrotask,esc:s=>String(s),state:{explore:{}},store(){}};
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync('assets/js/ai100/loan-auditor-config.js','utf8'),ctx);ctx.C=ctx.window.ML_LAB_CONFIG;
 for(const [start,end] of [['function loanMatrixMarkup','function loanVisual'],['function bindMatrixHighlights','function bindGovernanceReview'],['function loanAuditMetrics','function renderLoanProjectPlots'],['function guidedExploreState','function guidedHistogram']])vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end)),ctx);
 return ctx;
}
function element(dataset={}){
 const classes=new Set(),listeners={};
 return {dataset,style:{},attrs:{},listeners,textContent:'',classList:{contains:c=>classes.has(c),toggle(c,on){on?classes.add(c):classes.delete(c)}},contains(node){return node===this},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,fn){listeners[k]=fn}};
}
test('shared markup keeps distinct accessible IDs and accurate metric precision',()=>{
 const c=fixture(),a=c.loanMetricsMarkup('notebook',c.loanAuditMetrics(true)),b=c.loanMetricsMarkup('review',c.loanAuditMetrics(false));
 const ids=[...(a+b).matchAll(/ id="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
 for(const match of (a+b).matchAll(/aria-describedby="([^"]+)"/g))assert.ok(ids.includes(match[1]));
 assert.match(a,/78\.1%/);assert.match(a,/82\.6%/);assert.match(b,/83%/);assert.match(a,/\(57 \/ 66 \+ 18 \/ 30\) \/ 2 = 73\.2%/);
 assert.equal((a.match(/data-metric-cell=/g)||[]).length,4);assert.equal((a.match(/ml-outcome-help/g)||[]).length,4);
 const threshold=c.loanThresholdMarkup('review',{min:.3,max:.8,step:.05,value:.7});
 assert.match(threshold,/min="0.3" max="0.8" step="0.05" value="0.7"/);assert.match(threshold,/--tick:66%/);assert.match(threshold,/id="review-example"/);
});
test('matrix hover and metric keyboard focus stay scoped and clear conflicting highlights',async()=>{
 const c=fixture(),cells=['tn','fp','fn','tp'].map((id,i)=>element({metricCell:id,matrixGroup:i===0||i===3?'match':'error'})),cards=Array.from({length:5},(_,i)=>element({metricIndex:String(i)})),totals=['match','error'].map(matrixTotal=>element({matrixTotal}));
 const root={querySelectorAll(s){return {'[data-matrix-group]':cells,'[data-metric-cell]':cells,'[data-metric-index]':cards,'[data-matrix-total]':totals}[s]||[]}};
 c.bindMetricHighlights(root,c.bindMatrixHighlights(root));
 cells[0].listeners.mouseenter();assert.ok(cells[3].classList.contains('matrix-related'));assert.ok(cells[1].classList.contains('matrix-dimmed'));assert.equal(totals[0].textContent,'18 + 57 = 75 agreements');
 c.document.activeElement=cards[1];cards[1].listeners.focusin();assert.ok(cells[3].classList.contains('metric-numerator'));assert.ok(cells[1].classList.contains('metric-denominator'));assert.ok(!cells[1].classList.contains('matrix-dimmed'));
 c.document.activeElement=null;cards[1].listeners.focusout();await new Promise(resolve=>queueMicrotask(resolve));assert.ok(!cells[3].classList.contains('metric-numerator'));assert.ok(cells[1].classList.contains('matrix-dimmed'));
 cells[0].listeners.mouseleave();assert.ok(!cells[1].classList.contains('matrix-dimmed'));
 cards[4].listeners.mouseenter();assert.ok(cells[0].classList.contains('metric-numerator'));assert.ok(cells[3].classList.contains('metric-numerator'));assert.ok(cells[2].classList.contains('metric-denominator'));
 // A queued blur from a removed visual must not clear its replacement's cells.
 cards[0].isConnected=false;cards[4].listeners.mouseleave();assert.ok(cells[3].classList.contains('metric-numerator'));
});
test('threshold updates in place, keeps inclusive cutoff, and does not mark initialization as a change',()=>{
 const c=fixture(),slider=element(),nodes=new Map(),arrows=['approvals','denials'].map(outcomeArrow=>element({outcomeArrow}));slider.value='.5';
 const root={querySelector(s){if(s==='.ml-scene-threshold-slider')return slider;if(!nodes.has(s))nodes.set(s,element());return nodes.get(s)},querySelectorAll(){return arrows}};
 let changed=0;c.bindSceneThreshold(root,()=>changed++);assert.equal(changed,0);assert.equal(root.querySelector('[data-threshold-prediction]').textContent,'Predicted approval');
 c.document.activeElement=slider;
 for(const [value,prediction,fp,fn] of [['.3','Predicted approval','23','3'],['.63','Predicted approval','14','13'],['.7','Predicted decline','12','15'],['.8','Predicted decline','9','19']]){
  slider.value=value;slider.listeners.input();assert.equal(c.document.activeElement,slider);assert.equal(root.querySelector('[data-threshold-prediction]').textContent,prediction);assert.equal(String(root.querySelector('[data-example-fp]').textContent),fp);assert.equal(String(root.querySelector('[data-example-fn]').textContent),fn);
 }
 assert.equal(changed,4);assert.equal(slider.attrs['aria-valuetext'],'0.80');
});
test('Review threshold still requires a changed control, checked answer, and explanation after restore',()=>{
 const c=fixture(),x=c.guidedExploreState();x.justifications.outcomes='The matrix shows two types of prediction mistakes.';x.answers.outcomes=1;c.updateGuidedCompletion(0);x.active=1;
 c.selectReviewResponse(1,0);x.justifications.tradeoff='A higher cutoff decreases approvals and increases denials.';c.checkReviewResponse(1);assert.equal(c.guidedTaskComplete(1),false);
 x.changed={'tradeoff.threshold':true};x.values.threshold='.7';c.updateGuidedCompletion(1);assert.equal(c.guidedTaskComplete(1),true);
 const restored=fixture();restored.state.explore=JSON.parse(JSON.stringify(x));assert.equal(restored.guidedTaskComplete(1),true);assert.equal(restored.guidedExploreState().values.threshold,'.7');
 c.selectReviewResponse(1,1);assert.equal(c.guidedTaskComplete(1),false);
});
