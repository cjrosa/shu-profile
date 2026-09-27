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
 const {H}=fixture(),trace=H.demo(),again=H.demo();assert.deepEqual(plain(trace),plain(again));
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
 const {H,C}=fixture();assert.equal(C.cells.length,8);assert.equal(C.scenes.length,10);
 C.cells.forEach(cell=>{assert.equal(H.validate(cell.hint,cell.hint),'');assert.equal(H.validate('# A comment\n'+cell.hint.replaceAll('"',"'"),cell.hint),'')});
 for(const [i,from,to] of [[0,'Fish.csv','Other.csv'],[1,'Width','Species'],[1,'X =','Y ='],[2,'fit_transform(X)','fit_transform(fish)'],[3,'fit_predict(scaled)','fit_predict(X)'],[3,'n_clusters=3','n_clusters=7'],[4,'= clusters','= trial'],[5,'Height','Weight'],[6,'[2, 3, 5]','[2, 3, 7]'],[7,'"Species"','"Weight"']])assert.ok(H.validate(C.cells[i].hint.replace(from,to),C.cells[i].hint));
 assert.ok(H.validate('# '+C.cells[3].hint.replaceAll('\n','\n# '),C.cells[3].hint));
 assert.ok(H.validate(C.cells[6].hint.replace('    print','print'),C.cells[6].hint));
 assert.ok(H.validate(C.cells[1].hint+'\nX = fish',C.cells[1].hint));
});
test('notebook output and visual summaries use the computed results',()=>{
 const {H}=fixture(),r=H.result(),target={innerHTML:''};
 r.counts.forEach((n,j)=>assert.ok(H.notebookOutput(4).includes('C'+j+'  '+n)));
 r.means.flat().forEach(v=>assert.ok(H.notebookOutput(5).includes(v.toFixed(2))));
 for(const i of [3,4,5,6,7]){H.notebook(target,i);assert.ok(target.innerHTML.includes('<svg'));assert.ok(!target.innerHTML.includes('NaN'));}
 H.notebook(target,7);assert.match(target.innerHTML,/Species revealed after clustering/);
 assert.match(target.innerHTML,/Width also affects assignments/);
});
test('each scene renders the shared card, beginner definition, and valid chart markup',()=>{
 const {H,C}=fixture();C.scenes.forEach(s=>{const html=H.scene(s);assert.match(html,/ml-cluster-card/);if(s.kind!=='cluster-intro')assert.match(html,/ml-definition/);assert.doesNotMatch(html,/undefined|NaN/)});
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
 H.bindLearn(target,C.scenes[5]);const step=element('[data-cluster-action="step"]'),live=element('[data-cluster-live]');
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

test('Python and notebook exports preserve all eight complete scripts without fabricated outputs',async()=>{
 const {c,C}=fixture(),source=fs.readFileSync('assets/js/components/ai-ml-lab.js','utf8');let blob,link;
 Object.assign(c,{C,qa:()=>C.cells.map(cell=>({value:cell.hint})),Blob,setTimeout:()=>{},URL:{createObjectURL(b){blob=b;return 'blob:export'},revokeObjectURL(){}},document:{createElement(){link={click(){this.clicked=true}};return link}}});
 vm.runInContext(source.slice(source.indexOf('function download(ext)'),source.indexOf('function reset()')),c);
 c.download('py');let text=await blob.text();assert.equal(link.clicked,true);assert.equal(link.download,'hidden_patterns.py');assert.match(text,/Requires Python, pandas, scikit-learn/);C.cells.forEach(cell=>assert.ok(text.includes(cell.hint)));assert.match(text,/print\(pd.crosstab/);
 c.download('ipynb');const book=JSON.parse(await blob.text());assert.equal(book.nbformat,4);assert.equal(book.cells.length,8);book.cells.forEach((cell,i)=>{assert.equal(cell.source.join(''),C.cells[i].hint);assert.deepEqual(cell.outputs,[]);assert.equal(cell.execution_count,null)});
});
