const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/js/components/ai-ml-lab.js','utf8');
const rows=fs.readFileSync('ai100/data/Fish.csv','utf8').trim().split(/\r?\n/).slice(1).map(line=>line.split(','));
function fixture(){
 const editors=new Map(),document={body:{},addEventListener(){},querySelector:s=>editors.get(s)||null,querySelectorAll:()=>[]};
 const ctx={window:{},document,MutationObserver:class{observe(){}},setTimeout(){},clearTimeout(){},localStorage:{getItem:()=>null,setItem(){}}};
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync('assets/js/ai100/data-detective-config.js','utf8'),ctx);
 vm.runInContext('window.ML_LAB_CONFIG.plotPoints=fishPlotPoints;',ctx);
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,`C=window.ML_LAB_CONFIG;updateChecklist=()=>{};globalThis.lab={C,visual,renderOutput,renderFishHistogram,renderFishScatter,renderFishBarplot,guidedHistogram,guidedClaimVisual,fishHistogramData,typingGuide,validateDetectiveCode,detectivePythonExport};})();`),ctx);
 return {...ctx.lab,editors};
}
function target(){return {innerHTML:'',insertAdjacentHTML(where,html){this.innerHTML=where==='afterbegin'?html+this.innerHTML:this.innerHTML+html}}}
function counts(html){return [...html.matchAll(/<title>[^<]* g: (\d+) fish<\/title>/g)].map(m=>Number(m[1]));}
test('embedded chart observations match all 159 CSV fish, including species identities',()=>{
 const f=fixture(),names=['Roach','Perch','Smelt','Parkki','Pike','Bream','Whitefish'];
 assert.equal(rows.length,159);
 assert.deepEqual(JSON.parse(JSON.stringify(f.C.plotPoints)),rows.map(r=>[Number(r[3]),Number(r[2]),names.indexOf(r[1])]));
});
test('Learn, Notebook and initial Review share the real 100 g histogram',()=>{
 const f=fixture(),expected=[31,35,16,14,6,12,10,9,6,8,6,2,1,0,0,1,2],notebook=target(),review=target();
 f.renderFishHistogram(notebook);f.guidedHistogram(review,17);
 const learn=f.visual(f.C.scenes.find(s=>s.kind==='histogram'));
 for(const html of [learn,notebook.innerHTML,review.innerHTML]){assert.deepEqual(counts(html),expected);assert.match(html,/1,700/);assert.match(html,/Number of fish/);}
 assert.match(learn,/100–200 g \(35 fish\)/);
 assert.equal(f.C.explore.tasks.find(t=>t.id==='distribution').controls[0].value,17);
});
test('histogram bins include boundaries once and regroup without losing fish',()=>{
 const f=fixture(),result=f.fishHistogramData([0,100,200,1700,-1,1701].map(weight=>[0,weight,0]));
 assert.equal(result.counts.reduce((a,b)=>a+b,0),4);
 assert.equal(result.counts[0],1);assert.equal(result.counts[1],1);assert.equal(result.counts[2],1);assert.equal(result.counts[16],1);
 for(let bins=6;bins<=18;bins++){const out=target();f.guidedHistogram(out,bins);assert.equal(counts(out.innerHTML).length,bins);assert.equal(counts(out.innerHTML).reduce((a,b)=>a+b,0),159);}
});
test('scatterplots throughout the lesson show real observations and the same species colors',()=>{
 const f=fixture(),notebook=target(),claim=target();f.renderFishScatter(notebook);f.guidedClaimVisual(claim);
 const learn=f.visual(f.C.scenes.find(s=>s.kind==='scatterplot')),evidence=f.visual(f.C.scenes.find(s=>s.kind==='evidence'));
 for(const html of [learn,evidence,notebook.innerHTML,claim.innerHTML]){
  assert.equal((html.match(/<circle /g)||[]).length,166); // 159 fish plus seven legend markers
  assert.match(html,/Roach: Length 19 cm, Weight 27 g/);assert.match(html,/Whitefish/);
  assert.doesNotMatch(html,/ml-mini-trend|ml-scatter-trend/);
  assert.match(html,/<circle[^>]+fill="#4f8a62"[^>]*><title>Roach:/);
 }
});
test('species bars report the CSV means without confidence intervals',()=>{
 const f=fixture(),out=target();f.renderFishBarplot(out);
 for(const name of ['Roach','Perch','Smelt','Parkki','Pike','Bream','Whitefish']){
  const group=rows.filter(r=>r[1]===name),mean=group.reduce((sum,r)=>sum+Number(r[2]),0)/group.length;
  assert.ok(out.innerHTML.includes(`${name}: mean ${mean.toFixed(1)} g; ${group.length} fish`));
 }
 assert.doesNotMatch(out.innerHTML,/confidence|95%|error bars/i);
 assert.match(f.typingGuide(4),/errorbar=None/);
});
test('welcome output contains only the message and supportive feedback, never a table',()=>{
 const f=fixture(),html=f.renderOutput(f.C.cells[0].output,0,'print("My first investigation")');
 assert.match(html,/My first investigation/);assert.doesNotMatch(html,/Species|Roach|Loaded|rows|27\.0/);
});
test('guided validation accepts scripts and formatting but rejects misleading alternatives',()=>{
 const f=fixture();
 for(let i=0;i<6;i++)assert.equal(f.validateDetectiveCode(f.typingGuide(i),i),'');
 assert.equal(f.validateDetectiveCode("# Welcome\nprint ( 'Hello # fish' )",0),'');
 assert.equal(f.validateDetectiveCode(f.typingGuide(3).replaceAll('sb','sns'),3),'');
 f.editors.set('[data-cell="3"]',{querySelector:()=>({value:'import seaborn as sns'})});
 assert.equal(f.validateDetectiveCode(f.typingGuide(5).replaceAll('sb.','sns.'),5),'');
 assert.notEqual(f.validateDetectiveCode(f.typingGuide(5),5),'');
 f.editors.clear();
 const bad=[
  [0,'print;("Hello")'],[0,'print("Hello"; )'],[0,'Print("Hello")'],[0,'# print("Hello")'],[0,'print(fish)'],[0,''],
  [1,f.typingGuide(1).replace('\n',' ')],[1,f.typingGuide(1).replace('Fish.csv','fish.csv')],
  [1,f.typingGuide(1).replace('fish =','fishes =')],
  [2,'fish.head()\nfish.info()'],
  [3,f.typingGuide(3).replace('Weight','weight')],
  [3,f.typingGuide(3).replace('bins=17','bins=10')],
  [3,f.typingGuide(3).replace('binrange=(0, 1700)','binrange=(0, 1600)')],
  [4,f.typingGuide(4).replace('errorbar=None','errorbar="ci"')],
  [5,'sb.scatterplot(data=fish, x="Weight", y="Length", hue="Species")'],
  [5,f.typingGuide(5).replace('data=fish','data=other')],
  [5,f.typingGuide(5).replace(', hue="Species"','')]
 ];
 for(const [i,code] of bad)assert.notEqual(f.validateDetectiveCode(code,i),'',code);
});
test('preview index, units, review prompts and inspection output are consistent',()=>{
 const f=fixture(),table=f.visual(f.C.scenes[1]);assert.match(table,/>Index<\/th>/);assert.match(table,/>0<\/th><td>1<\/td>/);
 assert.match(f.C.scenes[1].visualText,/centimeters/);
 for(const t of f.C.explore.tasks)assert.doesNotMatch(t.completion,/Select Pandas|Select Right-skewed|Select the positive|Choose the sample-limited|Select Create charts/);
 const code=f.typingGuide(2),output=f.C.cells[2].output({},code+' # fish.head()');
 assert.equal((output.match(/ID Species/g)||[]).length,1);assert.match(output,/159 entries/);assert.match(output,/398\.4962/);
});

test('standalone Python export explicitly displays tables and separate charts',()=>{
 const f=fixture(),codes=Array.from({length:6},(_,i)=>f.typingGuide(i)),exported=f.detectivePythonExport(codes);
 assert.match(exported,/import matplotlib.pyplot as plt/);
 assert.equal((exported.match(/plt.figure\(\)/g)||[]).length,3);
 assert.equal((exported.match(/plt.show\(\)/g)||[]).length,3);
 assert.match(exported,/print\(fish.head\(\)\)/);assert.match(exported,/print\(fish.describe\(\)\)/);
 assert.match(exported,/bins=17, binrange=\(0, 1700\)/);assert.match(exported,/errorbar=None/);
});
