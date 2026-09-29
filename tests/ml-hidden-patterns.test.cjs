const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const c={window:{}};vm.createContext(c);
 for(const name of ['hidden-patterns-data','hidden-patterns','hidden-patterns-config'])vm.runInContext(fs.readFileSync('assets/js/ai100/'+name+'.js','utf8'),c);
 return {c,H:c.window.HiddenPatterns,C:c.window.ML_LAB_CONFIG,rows:c.window.HIDDEN_PATTERNS_DATA};
}
const plain=x=>JSON.parse(JSON.stringify(x));
const squared=(a,b)=>a.reduce((s,v,j)=>s+(v-b[j])**2,0);
test('offline records exactly match the bundled CSV, including row order and measurements',()=>{
 const {rows}=fixture(),lines=fs.readFileSync('ai100/data/Fish.csv','utf8').trim().split(/\r?\n/),columns=lines.shift().split(',');
 const expected=lines.map(l=>Object.fromEntries(l.split(',').map((v,i)=>[columns[i],columns[i]==='Species'?v:Number(v)])));
 assert.equal(rows.length,159);assert.deepEqual(plain(rows),expected);
});
test('standardization uses population spread and handles a constant feature without NaN',()=>{
 const {H}=fixture(),s=H.standardize([[1,7],[3,7],[5,7]]);
 assert.deepEqual(plain(s.mean),[3,7]);assert.equal(s.spread[1],0);
 assert.deepEqual(plain(s.points.map(p=>p[1])),[0,0,0]);
 assert.ok(Math.abs(s.points.reduce((sum,p)=>sum+p[0]**2,0)/3-1)<1e-12);
});
test('every supported full-data run has nearest-center assignments and matching means and totals',()=>{
 const {H,rows}=fixture();
 for(const scale of ['raw','standardized'])for(let k=2;k<=7;k++){
  const r=H.result(k,scale),points=scale==='raw'?r.raw:r.scaled.points;
  assert.equal(r.labels.length,159);assert.equal(r.counts.reduce((a,b)=>a+b),159);assert.equal(r.starts,10);
  assert.ok(r.converged);assert.ok(r.iterations<=100);assert.ok(r.counts.every(n=>n>0));
  r.labels.forEach((j,i)=>{assert.ok(j>=0&&j<k);assert.equal(squared(points[i],r.centers[j]),Math.min(...r.centers.map(c=>squared(points[i],c))))});
  for(let j=0;j<k;j++){
   const indices=r.labels.map((v,i)=>v===j?i:-1).filter(i=>i>=0);assert.equal(indices.length,r.counts[j]);
   for(let d=0;d<3;d++){
    assert.ok(Math.abs(indices.reduce((s,i)=>s+points[i][d],0)/indices.length-r.centers[j][d])<1e-10);
    assert.ok(Math.abs(indices.reduce((s,i)=>s+rows[i][H.features[d]],0)/indices.length-r.means[j][d])<1e-10);
   }
  }
 }
});
test('ten seeded starts are deterministic and no worse than the first start',()=>{
 const {H}=fixture(),p=H.result().scaled.points;
 const first=H.kmeans(p,{starts:1}),many=H.kmeans(p,{starts:10});
 assert.deepEqual(plain(many),plain(H.kmeans(p,{starts:10})));
 assert.ok(many.inertia<=first.inertia+1e-10);
});
test('changing scaling changes actual memberships, not just chart colors',()=>{
 const {H}=fixture(),a=H.result(3,'raw'),b=H.result(3,'standardized');
 assert.ok(a.labels.some((j,i)=>a.labels.some((v,n)=>(j===v)!==(b.labels[i]===b.labels[n]))));
 assert.notDeepEqual(plain(a.counts),plain(b.counts));
});
test('empty-cluster repair, duplicate points and iteration bounds remain finite',()=>{
 const {H}=fixture();
 for(const p of [[[0,0],[0,0],[0,0],[0,0]],[[0,0],[0,0],[10,10],[11,11]]]){
  const r=H.kmeans(p,{k:3});assert.equal(new Set(r.labels).size,3);assert.ok(Number.isFinite(r.inertia));assert.ok(r.centers.flat().every(Number.isFinite));
 }
 const r=H.kmeans([[0],[1],[9],[10]],{k:2,maxIterations:1});assert.equal(r.iterations,1);
 assert.throws(()=>H.kmeans([]));assert.throws(()=>H.kmeans([[0]],{k:2}));assert.throws(()=>H.kmeans([[NaN]],{k:1}));
});
test('species comparison cannot affect clustering and its row/column totals match source data',()=>{
 const {H,rows}=fixture(),r=H.result(),before=plain(r),o=H.overlap(r);
 assert.deepEqual(plain(r),before);assert.equal(o.species.length,7);
 o.counts.forEach((row,j)=>assert.equal(row.reduce((a,b)=>a+b),r.counts[j]));
 o.species.forEach((name,j)=>assert.equal(o.counts.reduce((s,row)=>s+row[j],0),rows.filter(r=>r.Species===name).length));
 assert.ok(o.counts.some(row=>row.filter(n=>n>0).length>1));
 assert.ok(o.species.some((_,j)=>o.counts.filter(row=>row[j]>0).length>1));
 const raw=rows.map(r=>H.features.map(f=>r[f]));rows.forEach(r=>r.Species='Changed label');
 assert.deepEqual(plain(H.kmeans(H.standardize(raw).points).labels),before.labels);
});
test('teaching trace alternates assignments and means, leaves observations fixed, and reaches stability',()=>{
 const {H}=fixture();const starts=new Set();for(let i=0;i<8;i++){const frames=H.demo(i);starts.add(JSON.stringify(frames[0].centers));assert.equal(frames.at(-1).phase,'stable')}assert.equal(starts.size,8);assert.deepEqual(plain(H.demo(8)),plain(H.demo(0)));const trace=H.demo(),again=H.demo();assert.deepEqual(plain(trace),plain(again));
 assert.equal(trace[0].phase,'start');assert.equal(trace.at(-1).phase,'stable');
 assert.ok(trace.filter(t=>t.phase==='move').length>1);
 for(let i=1;i<trace.length;i++){
  if(trace[i].phase==='move')assert.deepEqual(plain(trace[i].labels),plain(trace[i-1].labels));
  else assert.deepEqual(plain(trace[i].centers),plain(trace[i-1].centers));
 }
 assert.deepEqual(plain(trace.at(-1).labels),plain(trace.at(-2).labels));
 assert.notDeepEqual(plain(trace[0].centers),plain(H.demo(true)[0].centers));
});
test('course scripts are accepted with comments and quote variations, but wrong inputs/assignments are rejected',()=>{
 const {H,C}=fixture();assert.equal(C.cells.length,9);assert.equal(C.scenes.length,9);
 C.cells.forEach(cell=>{assert.equal(H.validate(cell.hint,cell.hint),'');assert.equal(H.validate('# A comment\n'+cell.hint.replaceAll('"',"'"),cell.hint),'')});
 for(const [i,from,to] of [[0,'Fish.csv','Other.csv'],[1,'Width','Species'],[1,'X =','Y ='],[2,'fit_transform(X)','fit_transform(fish)'],[3,'fit_predict(scaled)','fit_predict(X)'],[3,'n_clusters=3','n_clusters=7'],[4,'= clusters','= trial'],[5,'Height','Weight'],[7,'[2, 3, 5]','[2, 3, 7]'],[8,'"Species"','"Weight"']])assert.ok(H.validate(C.cells[i].hint.replace(from,to),C.cells[i].hint));
 assert.ok(H.validate('# '+C.cells[3].hint.replaceAll('\n','\n# '),C.cells[3].hint));
 assert.ok(H.validate(C.cells[7].hint.replace('    print','print'),C.cells[7].hint));
 assert.ok(H.validate(C.cells[1].hint+'\nX = fish',C.cells[1].hint));
});
test('notebook output and visual summaries use the computed results',()=>{
 const {H}=fixture(),r=H.result(),target={innerHTML:''};
 r.counts.forEach((n,j)=>assert.ok(H.notebookOutput(4).includes('C'+j+'  '+n)));
 r.means.flat().forEach(v=>assert.ok(H.notebookOutput(6).includes(v.toFixed(2))));
 for(const i of [0,1,2,3,4,6,7,8]){H.notebook(target,i);assert.equal(target.innerHTML,'');}
 H.notebook(target,5);assert.match(target.innerHTML,/ml-cluster-hover-chart/);assert.doesNotMatch(target.innerHTML,/NaN|data-point="center-|ml-cluster-table|ml-cluster-chart-side/);
 assert.match(target.innerHTML,/Width also affects assignments/);
});
test('each scene renders the shared card, beginner definition, and valid chart markup',()=>{
 const {H,C}=fixture();C.scenes.forEach(s=>{const html=H.scene(s);assert.match(html,/ml-cluster-card/);if(s.definition)assert.match(html,/ml-definition/);else assert.doesNotMatch(html,/ml-definition/);assert.doesNotMatch(html,/undefined|NaN/)});
 assert.doesNotMatch(H.scene(C.scenes[0]),/; Roach|; Perch|; Smelt|ml-definition|ml-cluster-cards|ml-cluster-intro-caption/);
 assert.match(H.scene(C.scenes[1]),/ml-cluster-cards/);assert.match(H.scene(C.scenes[1]),/ml-definition/);
});
function reviewTarget(){const input={dataset:{},value:'',getAttribute(){return null},focus(){}};return {input,_html:'',set innerHTML(s){this._html=s;input.dataset.clusterControl=s.match(/data-cluster-control="(\w+)"/)[1]},get innerHTML(){return this._html},querySelector(){return input}}}
test('Review interactions record actual evidence, require a change, and survive serialization',()=>{
 const {H,C}=fixture(),x={values:{},changed:{}};let changes=0;
 for(const [index,value] of [[0,'raw'],[1,'5'],[2,true]]){
  const target=reviewTarget(),task=C.explore.tasks[index];H.review(target,task,x,()=>changes++);
  assert.equal(changes,index);assert.equal(x.changed[task.id+'.'+task.controls[0].id],undefined);
  if(index===2)target.input.onclick();else{target.input.value=value;target.input.onchange()}
  assert.equal(x.changed[task.id+'.'+task.controls[0].id],true);
  assert.equal(x.observations[task.id],H.evidence(task,x));
 }
 assert.equal(changes,3);assert.match(x.observations.scaling,/Observed raw k=3/);assert.match(x.observations.choice,/Observed standardized k=5/);assert.match(x.observations.limits,/Roach/);
 const restored=plain(x),target=reviewTarget();H.review(target,C.explore.tasks[2],restored,()=>changes++);assert.match(target.innerHTML,/Species revealed after clustering/);assert.equal(changes,3);
 // Returning to baseline does not erase the actual contrasting result the student observed.
 H.review(target,C.explore.tasks[0],x,()=>changes++);target.input.value='standardized';target.input.onchange();assert.match(x.observations.scaling,/Observed raw k=3/);assert.equal(x.changed['scaling.scale'],true);
});
test('Learn controls update their own workspace; step, restart, alternate and terminal states work',()=>{
 const {H,C}=fixture(),parts=new Map(),element=selector=>{if(!parts.has(selector))parts.set(selector,{innerHTML:'',textContent:'',disabled:false});return parts.get(selector)},target={querySelector:element};
 H.bindLearn(target,{...C.scenes[5],kind:'cluster-steps'});const step=element('[data-cluster-action="step"]'),live=element('[data-cluster-live]');
 assert.match(live.innerHTML,/No assignments yet/);let n=0;while(!step.disabled&&n++<100)step.onclick();assert.ok(step.disabled);assert.match(live.innerHTML,/Stable:/);
 element('[data-cluster-action="restart"]').onclick();assert.equal(step.disabled,false);assert.match(live.innerHTML,/No assignments yet/);
 const first=live.innerHTML;element('[data-cluster-action="alternate"]').onclick();assert.notEqual(live.innerHTML,first);
});
test('HTML loads offline data and helper before config and shared renderer',()=>{
 const html=fs.readFileSync('ai100/hidden_patterns_lab.html','utf8');
 const names=['hidden-patterns-data.js','hidden-patterns.js','hidden-patterns-config.js','components/ai-ml-lab.js'];
 names.forEach((n,i)=>{assert.ok(html.includes(n));if(i)assert.ok(html.indexOf(names[i-1])<html.indexOf(n))});
 assert.match(html,/hidden-patterns.css/);
});
test('scene six uses a compact chart without a legend while preserving the learning controls',()=>{
 const {H,C}=fixture(),target=chartTarget();target.innerHTML=H.scene(C.scenes[5]);H.bindLearn(target,C.scenes[5]);
 const live=target.querySelector('[data-cluster-live]');assert.match(target.innerHTML,/ml-cluster-centers-scene/);
 assert.doesNotMatch(live.innerHTML,/ml-cluster-chart-side|ml-cluster-heading/);
 assert.doesNotMatch(live.innerHTML,/ml-cluster-center-halo|data-highlight/);
 assert.match(live.innerHTML,/data-clear-selection>Close<\/button>/);
 const chart=live.charts[0];assert.equal(chart.marks[0].onpointerenter,undefined);assert.equal(chart.marks[0].onfocus,undefined);assert.equal(chart.onpointerleave,undefined);chart.marks[0].onclick();assert.equal(chart.tooltip.hidden,false);chart.clear.onclick();assert.equal(chart.tooltip.hidden,true);
 target.querySelector('[data-guided-step="0"]').onclick();target.querySelector('[data-guided-step="1"]').onclick();assert.match(target.querySelector('[data-cluster-status]').innerHTML,/Each fish joins its <strong>nearest center<\/strong>/);
});
test('scene six unlocks ordered steps, repeats to stability, and resets the sequence',()=>{
 const {H,C,c}=fixture(),target=chartTarget(),timers=new Map();let id=0;
 Object.assign(c.window,{setInterval(fn,ms){assert.equal(ms,1200);timers.set(++id,fn);return id},clearInterval(i){timers.delete(i)}});
 target.innerHTML=H.scene(C.scenes[5]);H.bindLearn(target,C.scenes[5]);
 const step=i=>target.querySelector('[data-guided-step="'+i+'"]'),action=name=>target.querySelector('[data-cluster-action="'+name+'"]'),live=target.querySelector('[data-cluster-live]');
 assert.doesNotMatch(live.innerHTML,/data-point="center-/);assert.equal(step(0).disabled,false);assert.equal(step(1).disabled,true);step(3).onclick();assert.equal(timers.size,0);
 step(0).onclick();assert.equal((live.innerHTML.match(/data-point="center-/g)||[]).length,2);assert.equal(step(1).disabled,false);assert.equal(step(2).disabled,true);
 step(1).onclick();assert.match(live.innerHTML,/Assign:/);assert.equal(step(2).disabled,false);assert.equal(step(3).disabled,true);
 step(2).onclick();assert.match(live.innerHTML,/Move:/);assert.equal(step(3).disabled,false);
 step(3).onclick();assert.equal(timers.size,0);action('next').onclick();assert.match(live.innerHTML,/Assign:/);action('play').onclick();assert.equal(timers.size,1);action('play').onclick();assert.equal(timers.size,0);action('play').onclick();
 let n=0;while(timers.size&&n++<100)[...timers.values()][0]();assert.match(live.innerHTML,/Stable:/);assert.ok(action('play').disabled);assert.ok(action('next').disabled);
 step(1).onclick();assert.match(live.innerHTML,/Assign:/);step(3).onclick();action('alternate').onclick();assert.equal(timers.size,0);assert.equal(step(1).disabled,false);assert.match(live.innerHTML,/Start:/);
 step(0).onclick();action('restart').onclick();assert.equal(step(1).disabled,true);assert.doesNotMatch(live.innerHTML,/data-point="center-/);
 step(0).onclick();step(1).onclick();step(2).onclick();step(3).onclick();action('play').onclick();H.bindLearn(target,C.scenes[0]);assert.equal(timers.size,0);
});

// Small DOM adapter exercises real render output and bound event handlers without a browser dependency.
function chartTarget(){
 const decode=s=>s.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
 const element=(dataset={})=>({dataset,attributes:{},innerHTML:'',disabled:false,classList:{values:new Set(),toggle(name,on){on?this.values.add(name):this.values.delete(name)}},setAttribute(k,v){this.attributes[k]=v},getAttribute(k){return this.attributes[k]??null},focus(){this.focused=true}});
 const controls=new Map();let charts=[],markup='';
 const target={isConnected:true,controls,closest(){return null},contains(){return true},get charts(){return charts},
  set innerHTML(html){markup=html;charts=[];
   for(const chunk of html.split(' data-chart>').slice(1)){
    const marks=Array.from(chunk.matchAll(/<g class="ml-cluster-mark"[^>]*data-point="([^"]+)" data-group="([^"]*)" data-details="([^"]*)"/g),m=>element({point:decode(m[1]),group:m[2],details:decode(m[3])}));
    const legends=Array.from(chunk.matchAll(/data-highlight="([^"]+)"/g),m=>element({highlight:m[1]}));
    const inspector=chunk.includes('data-inspector')?element():null,clear=element(),tooltip=chunk.includes('data-chart-tooltip')?element():null;if(tooltip&&chunk.includes('data-centers-only'))tooltip.setAttribute('data-centers-only','true');if(tooltip&&chunk.includes('data-click-only'))tooltip.setAttribute('data-click-only','true');charts.push({marks,legends,inspector,clear,tooltip,querySelectorAll(sel){return sel==='[data-point]'?marks:legends},querySelector(sel){return sel==='[data-inspector]'?inspector:sel==='[data-chart-tooltip]'?tooltip:clear}});
   }
   const control=html.match(/data-cluster-control="(\w+)"/);if(control){const el=target.querySelector('[data-cluster-control]');el.dataset.clusterControl=control[1];el.value=control[1]==='k'?'3':'standardized';el.setAttribute('aria-pressed','false')}
  },get innerHTML(){return markup},
  querySelectorAll(sel){return sel==='[data-chart]'?charts:sel==='[data-point]'?charts.flatMap(c=>c.marks):[]},
  querySelector(sel){if(!controls.has(sel))controls.set(sel,(sel==='[data-cluster-live]'||sel==='[data-investigation]')?chartTarget():element());return controls.get(sel)}
 };return target;
}
test('scene seven uses a plain hover legend and changing k updates all group counts',()=>{
 const {H,C}=fixture(),target=chartTarget();target.innerHTML=H.scene(C.scenes[6]);H.bindLearn(target,C.scenes[6]);
 assert.match(target.innerHTML,/ml-cluster-k-header/);
 const live=target.querySelector('[data-cluster-live]'),control=target.querySelector('[data-cluster-control]');
 for(const k of [2,3,4,5,6,7]){control.value=String(k);control.onchange();assert.equal(live.charts[0].legends.length,k);assert.equal(live.charts[0].marks.length,159+k);H.result(k).counts.forEach(n=>assert.ok(live.innerHTML.includes(n+' fish')));assert.doesNotMatch(live.innerHTML,/ml-cluster-chart-side|ml-cluster-baseline/);}
 const chart=live.charts[0];chart.legends[0].onpointerenter();assert.ok(chart.marks.some(m=>m.classList.values.has('dimmed')));chart.legends[0].onpointerleave();assert.ok(chart.marks.every(m=>!m.classList.values.has('dimmed')));
 const center=chart.marks.find(m=>m.dataset.point==='center-0');center.onpointerenter();assert.ok(chart.marks.filter(m=>m.dataset.group!=='0').every(m=>m.classList.values.has('dimmed')));assert.equal(chart.tooltip.hidden,true);center.onpointerleave();assert.ok(chart.marks.every(m=>!m.classList.values.has('dimmed')));assert.equal(chart.marks[0].onclick,undefined);
 center.onclick();assert.equal(chart.tooltip.hidden,false);assert.match(chart.inspector.innerHTML,/Mean Length/);assert.match(chart.inspector.innerHTML,new RegExp(H.result(7).means[0][0].toFixed(2)+' cm'));
 chart.clear.onclick();assert.equal(chart.tooltip.hidden,true);
});
test('species cards reveal accurate counts without repeating the chart',()=>{
 const {H,C}=fixture(),target=chartTarget();target.innerHTML=H.scene(C.scenes[7]);H.bindLearn(target,C.scenes[7]);
 const live=target.querySelector('[data-cluster-live]'),control=target.querySelector('[data-cluster-control]'),model=H.result(),groups=H.overlap(model);
 assert.doesNotMatch(live.innerHTML,/<svg|<table/);assert.equal((live.innerHTML.match(/<section/g)||[]).length,3);assert.match(live.innerHTML,/Species hidden/);
 groups.species.forEach(name=>assert.ok(!live.innerHTML.includes(name)));const before=plain(model.labels);control.onclick();
 groups.species.forEach((name,i)=>groups.counts.forEach(counts=>{if(counts[i])assert.ok(live.innerHTML.includes('<dt>'+name+'</dt><dd>'+counts[i]+'</dd>'))}));
 assert.deepEqual(plain(H.result().labels),before);control.onclick();assert.match(live.innerHTML,/Species hidden/);groups.species.forEach(name=>assert.ok(!live.innerHTML.includes(name)));
});

test('scaling scene explains spread and provides a plain transient hover legend',()=>{
 const {H,C}=fixture(),target=chartTarget();target.innerHTML=H.scene(C.scenes[4]);
 assert.doesNotMatch(target.innerHTML,/ml-cluster-table|Standardized standard deviation/);assert.match(target.innerHTML,/<strong>Raw measurements:<\/strong> distances use the original centimeters/);
 H.bindLearn(target,C.scenes[4]);const live=target.querySelector('[data-cluster-live]'),chart=live.charts[0];
 assert.doesNotMatch(live.innerHTML,/ml-cluster-chart-side/);
 chart.legends[0].onpointerenter();assert.ok(chart.marks.some(m=>m.classList.values.has('dimmed')));
 chart.legends[0].onpointerleave();assert.ok(chart.marks.every(m=>!m.classList.values.has('dimmed')));
 chart.legends[1].onfocus();assert.ok(chart.marks.some(m=>m.classList.values.has('dimmed')));chart.legends[1].onblur();assert.ok(chart.marks.every(m=>!m.classList.values.has('dimmed')));
});
test('weight reveal reports computed cluster averages and ranges without changing groups',()=>{
 const {H,C,rows}=fixture(),target=chartTarget(),radios=[{value:'species',checked:true},{value:'weight',checked:false}];
 const query=target.querySelectorAll.bind(target);target.querySelectorAll=sel=>sel==='[data-cluster-attribute]'?radios:query(sel);
 target.innerHTML=H.scene(C.scenes[7]);H.bindLearn(target,C.scenes[7]);const live=target.querySelector('[data-cluster-live]'),control=target.querySelector('[data-cluster-control]'),model=H.result(),before=plain(model.labels);
 radios[1].checked=true;radios[1].onchange();assert.match(live.innerHTML,/Weight hidden/);assert.doesNotMatch(live.innerHTML,/Average weight/);control.onclick();
 model.counts.forEach((_,j)=>{const values=rows.filter((r,i)=>model.labels[i]===j).map(r=>r.Weight);for(const value of [values.reduce((a,b)=>a+b,0)/values.length,Math.min(...values),Math.max(...values)])assert.ok(live.innerHTML.includes(value.toFixed(1)+' g'))});
 assert.deepEqual(plain(H.result().labels),before);control.onclick();assert.match(live.innerHTML,/Weight hidden/);assert.doesNotMatch(live.innerHTML,/Average weight/);
});
test('3D toggle preserves scaling and renders all fish; keyboard, drag, and reset change the view',()=>{
 const {H,C}=fixture(),target=chartTarget();target.innerHTML=H.scene(C.scenes[4]);
 const scale=[{value:'standardized',checked:true},{value:'raw',checked:false}],views=[{value:'2d',checked:true},{value:'3d',checked:false}];
 const query=target.querySelectorAll.bind(target);target.querySelectorAll=sel=>sel==='[data-learn-scale]'?scale:sel==='[data-learn-view]'?views:query(sel);
 H.bindLearn(target,C.scenes[4]);const live=target.querySelector('[data-cluster-live]');
 assert.match(target.querySelector('[data-scaling-explanation]').innerHTML,/Raw measurements/);scale[0].checked=true;scale[0].onchange();views[1].checked=true;views[1].onchange();assert.match(live.innerHTML,/data-rotate-chart/);assert.match(live.innerHTML,/All axes in standardized units/);assert.equal((live.innerHTML.match(/data-point="fish-/g)||[]).length,159);assert.doesNotMatch(live.innerHTML,/NaN|undefined/);
 const svg=live.querySelector('[data-rotate-chart]');svg.setPointerCapture=()=>{};
 svg.onkeydown({key:'ArrowRight',preventDefault(){}});const rotated=svg.innerHTML;assert.match(rotated,/>Width</);
 live.querySelector('[data-reset-camera]').onclick();assert.notEqual(svg.innerHTML,rotated);const original=svg.innerHTML;
 let prevented=false;svg.onpointerdown({button:0,clientX:10,clientY:10,pointerId:1,preventDefault(){prevented=true}});assert.ok(prevented);svg.onpointermove({clientX:50,clientY:30});assert.notEqual(svg.innerHTML,original);svg.onpointerup();const stopped=svg.innerHTML;svg.onpointermove({clientX:90,clientY:90});assert.equal(svg.innerHTML,stopped);
 scale[1].checked=true;scale[1].onchange();assert.match(live.innerHTML,/All axes in centimeters/);assert.doesNotMatch(live.innerHTML,/NaN|undefined/);
 views[0].checked=true;views[0].onchange();assert.doesNotMatch(live.innerHTML,/data-rotate-chart/);assert.match(live.innerHTML,new RegExp(H.result(3,'raw').counts[0]+' fish'));
});
test('playback advances every 1.2 seconds, respects boundaries, and cleans up on visibility or scene changes',()=>{
 const {H,C,c}=fixture(),target=chartTarget(),timers=new Map(),events=new Map();let nextTimer=0,observer;
 Object.assign(c.window,{setInterval(fn,ms){assert.equal(ms,1200);timers.set(++nextTimer,fn);return nextTimer},clearInterval(id){timers.delete(id)},document:{hidden:false,body:{},addEventListener(k,fn){events.set(k,fn)},removeEventListener(k){events.delete(k)}},MutationObserver:class{constructor(fn){this.fn=fn;observer=this}observe(){}disconnect(){this.disconnected=true}}});
 target.innerHTML=H.scene({...C.scenes[5],kind:'cluster-steps'});H.bindLearn(target,{...C.scenes[5],kind:'cluster-steps'});
 const action=name=>target.querySelector('[data-cluster-action="'+name+'"]'),live=target.querySelector('[data-cluster-live]');
 assert.ok(action('back').disabled);live.charts[0].marks[4].onclick();action('play').onclick();assert.equal(timers.size,1);
 [...timers.values()][0]();assert.match(live.innerHTML,/Assign:/);assert.match(live.charts[0].inspector.innerHTML,/Example fish 5/);
 action('step').onclick();assert.equal(timers.size,0);assert.match(live.innerHTML,/Move:/);
 action('back').onclick();assert.match(live.innerHTML,/Assign:/);action('play').onclick();action('play').onclick();assert.equal(timers.size,0);
 action('play').onclick();c.window.document.hidden=true;events.get('visibilitychange')();assert.equal(timers.size,0);c.window.document.hidden=false;
 action('play').onclick();let ticks=0;while(timers.size&&ticks++<100)[...timers.values()][0]();assert.ok(action('step').disabled);assert.ok(action('play').disabled);assert.equal(timers.size,0);
 action('back').onclick();assert.equal(action('play').disabled,false);action('play').onclick();action('restart').onclick();assert.equal(timers.size,0);assert.ok(action('back').disabled);
 action('play').onclick();action('alternate').onclick();assert.equal(timers.size,0);assert.match(live.innerHTML,/No assignments yet/);
 action('play').onclick();target.closest=selector=>selector==='[hidden]'?{}:null;observer.fn();assert.equal(timers.size,0);target.closest=()=>null;
 action('play').onclick();H.bindLearn(target,C.scenes[0]);assert.equal(timers.size,0);assert.equal(events.size,0);assert.ok(observer.disconnected);
});
test('distance and notebook charts bind inspection; Review selection never records task evidence',()=>{
 const {H,C}=fixture(),target=chartTarget();target.innerHTML=H.scene(C.scenes[3]);H.bindLearn(target,C.scenes[3]);target.charts[0].marks[0].onclick();assert.match(target.charts[0].inspector.innerHTML,/cm/);
 assert.doesNotMatch(target.innerHTML,/ml-cluster-table|ml-cluster-chart-side/);
 const comparison=target.charts[0];comparison.clear.onclick();assert.equal(comparison.tooltip.hidden,true);
 comparison.marks[0].onpointerenter();assert.equal(comparison.tooltip.hidden,false);assert.match(comparison.inspector.innerHTML,/compared with Fish 4/);assert.match(comparison.inspector.innerHTML,/difference 0.8 cm/);
 comparison.marks[0].onkeydown({key:'Escape'});assert.equal(comparison.tooltip.hidden,true);
 comparison.marks[1].onfocus();assert.match(comparison.inspector.innerHTML,/reference/);comparison.marks[1].onblur();assert.equal(comparison.tooltip.hidden,true);
 H.notebook(target,5);assert.equal(target.charts.length,1);target.charts[0].legends[1].onfocus();assert.ok(target.charts[0].marks.some(m=>m.classList.values.has('group-highlighted')));target.charts[0].legends[1].onblur();assert.ok(target.charts[0].marks.every(m=>!m.classList.values.has('dimmed')));
 const state={values:{},changed:{}};let changes=0;H.review(target,C.explore.tasks[0],state,()=>changes++);target.charts[0].marks[0].onclick();target.charts[0].legends[0].onclick();assert.equal(changes,0);assert.deepEqual(state,{values:{},changed:{}});
 target.charts[0].marks[0].onclick();state.values.scale='raw';H.review(target,C.explore.tasks[0],state,()=>changes++);assert.ok(target.charts[0].marks[0].classList.values.has('selected'));assert.match(target.charts[0].inspector.innerHTML,new RegExp('C'+H.result(3,'raw').labels[0]));
});

test('Python and notebook exports preserve all nine complete scripts without fabricated outputs',async()=>{
 const {c,C}=fixture(),source=fs.readFileSync('assets/js/components/ai-ml-lab.js','utf8');let blob,link;
 Object.assign(c,{C,qa:()=>C.cells.map(cell=>({value:cell.hint})),Blob,setTimeout:()=>{},URL:{createObjectURL(b){blob=b;return 'blob:export'},revokeObjectURL(){}},document:{createElement(){link={click(){this.clicked=true}};return link}}});
 vm.runInContext(source.slice(source.indexOf('function download(ext)'),source.indexOf('function reset()')),c);
 c.download('py');let text=await blob.text();assert.equal(link.clicked,true);assert.equal(link.download,'hidden_patterns.py');assert.match(text,/Requires Python, pandas, scikit-learn, matplotlib/);C.cells.forEach(cell=>assert.ok(text.includes(cell.hint)));assert.match(text,/print\(pd.crosstab/);
 c.download('ipynb');const book=JSON.parse(await blob.text());assert.equal(book.nbformat,4);assert.equal(book.cells.length,9);book.cells.forEach((cell,i)=>{assert.equal(cell.source.join(''),C.cells[i].hint);assert.deepEqual(cell.outputs,[]);assert.equal(cell.execution_count,null)});
});

test('scene eight guides hidden predictions and revealed evidence, preserving question positions',()=>{
 const {H,C}=fixture(),target=chartTarget();target.innerHTML=H.scene(C.scenes[7]);H.bindLearn(target,C.scenes[7]);
 const panel=target.querySelector('[data-investigation]'),reveal=target.querySelector('[data-cluster-control]');
 assert.match(panel.innerHTML,/What does the number of fish in each group tell you/);
 panel.querySelector('[data-question-next]').onclick();assert.match(panel.innerHTML,/one species or several/);
 reveal.onclick();assert.match(panel.innerHTML,/Which species appear in all three/);
 panel.querySelector('[data-question-next]').onclick();assert.match(panel.innerHTML,/32 Bream/);
 reveal.onclick();assert.match(panel.innerHTML,/one species or several/);
 assert.match(H.scene(C.scenes[8]),/What does finding Perch in all three groups tell you/);
});

test('Next after the last hidden question reveals the selected cluster information',()=>{
 const {H,C}=fixture(),target=chartTarget();target.innerHTML=H.scene(C.scenes[7]);H.bindLearn(target,C.scenes[7]);
 const panel=target.querySelector('[data-investigation]'),control=target.querySelector('[data-cluster-control]');
 panel.querySelector('[data-question-next]').onclick();panel.querySelector('[data-question-next]').onclick();
 assert.match(panel.innerHTML,/What would revealing species or weight/);
 assert.doesNotMatch(panel.innerHTML,/data-question-next disabled/);
 panel.querySelector('[data-question-next]').onclick();
 assert.equal(control.getAttribute('aria-pressed'),'true');
 assert.match(panel.innerHTML,/Which species appear in all three/);
 assert.match(target.querySelector('[data-cluster-live]').innerHTML,/Bream/);
});

test('plotting script and browser chart share Learn colors, shapes, labels, and assignments',()=>{
 const {H,C,rows}=fixture(),target={innerHTML:''};assert.deepEqual(plain(C.cells.map((c,i)=>c.visual?i:null).filter(i=>i!==null)),[5]);
 const script=C.cells[5].hint;for(const color of ['#1f7a46','#3977a8','#bd5814'])assert.ok(script.includes(color));assert.ok(script.includes('["o", "s", "^"]'));assert.ok(script.includes('plt.show()'));
 H.notebook(target,5);assert.equal((target.innerHTML.match(/data-point="fish-/g)||[]).length,rows.length);assert.match(target.innerHTML,/Length \(cm\)/);assert.match(target.innerHTML,/Height \(cm\)/);
 H.result().labels.forEach((group,i)=>assert.ok(target.innerHTML.includes('data-point="fish-'+rows[i].ID+'" data-group="'+group+'"')));
});
