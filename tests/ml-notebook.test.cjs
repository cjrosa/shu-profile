const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/js/components/ai-ml-lab.js','utf8');
function fixture(config,storage=new Map(),realCharts=false){
 function element(){return {value:'',textContent:'',innerHTML:'',hidden:false,attrs:{},listeners:{},classList:{add(){},remove(){},toggle(){}},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,f){this.listeners[k]=f},focus(){this.focused=true},setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b},selectionStart:0,selectionEnd:0,setRangeText(t,a,b){this.value=this.value.slice(0,a)+t+this.value.slice(b);this.selectionStart=this.selectionEnd=a+t.length}}}
 const globals=new Map(),cells=config.cells.map(()=>{const parts=new Map();return {...element(),querySelector(s){if(!parts.has(s))parts.set(s,element());return parts.get(s)},querySelectorAll(){return []}}});
 cells.forEach(cell=>{const code=cell.querySelector('.ml-code');code.closest=()=>cell;cell.querySelector('.ml-output').querySelector=()=>element()});
 const modes=['learn','notebook','explore'].map(mode=>({...element(),dataset:{mode},querySelector:()=>element()}));
 let dialog=null;
 const parts=new Map(),part=s=>{if(!parts.has(s))parts.set(s,element());return parts.get(s)};
 const document={body:{insertAdjacentHTML(){dialog={...element(),open:false,querySelector:part,showModal(){this.open=true},close(){this.open=false;this.listeners.close?.()}}}},addEventListener(){},querySelector(s){if(s==='#pasteConfirmDialog')return dialog;const match=s.match(/^\[data-cell="(\d+)"\]$/);if(match)return cells[+match[1]];if(s.startsWith('[data-sidebar-task'))return null;if(s==='[data-mode="explore"]')return modes[2];if(s==='[data-mode="notebook"]')return modes[1];if(!globals.has(s))globals.set(s,element());return globals.get(s)},querySelectorAll(s){if(s==='.ml-cell')return cells;if(s==='.ml-code')return cells.map(c=>c.querySelector(s));if(s==='.ml-mode')return modes;return []}};
 const context={document,window:{},MutationObserver:class{observe(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setTimeout:()=>0,clearTimeout(){},queueMicrotask,confirm:()=>true,location:{reload(){}},config};
 vm.createContext(context);
 if(config.id==='hidden_patterns'){for(const asset of ['hidden-patterns-data','hidden-patterns'])vm.runInContext(fs.readFileSync('assets/js/ai100/'+asset+'.js','utf8'),context);config.cells.forEach((cell,i)=>cell.output=()=>context.window.HiddenPatterns.notebookOutput(i));}

 // Expose closure functions only in this fixture. Chart rendering is outside progression tests.
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,`C=config;${realCharts?'':'updateMetrics=()=>{};'}renderExplore=()=>{};globalThis.lab={state,restore,store,grantPastes,pasteAllowance,taskAvailable,notebookComplete,refreshNotebookProgress,invalidateNotebookFrom,evaluate,fillAllCode,fillAndRunAllCode,pasteCode,bindCodeInsertion,setMode,completeLearn,reset,typingGuide};})();`),context);
 return {lab:context.lab,cells,document,storage,modes,part,get dialog(){return dialog},accept(){part('form').onsubmit({preventDefault(){}})},cancel(){part('[data-confirm-paste-cancel]').onclick()}};
}
function simple(){return {id:'test',cells:Array.from({length:3},()=>({requires:['print\\s*\\('],output:'ok'}))}}
function notebookFixture(config,storage){const f=fixture(config,storage);f.lab.state.learnComplete=true;return f}
test('Data Detective rejects a wrong plot, recovers, and preserves saved work',()=>{
 const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('assets/js/ai100/data-detective-config.js','utf8'),ctx);
 const config=ctx.window.ML_LAB_CONFIG,f=notebookFixture(config);f.lab.fillAllCode();
 for(let i=0;i<3;i++)assert.equal(f.lab.evaluate(f.cells[i],i),true);
 const editor=f.cells[3].querySelector('.ml-code');editor.value=editor.value.replace('Weight','weight');
 assert.equal(f.lab.evaluate(f.cells[3],3),false);assert.equal(f.lab.state.completed.size,3);
 assert.match(f.cells[3].querySelector('.ml-output').innerHTML,/Check this task/);
 assert.doesNotMatch(f.cells[3].querySelector('.ml-output').innerHTML,/Success:|NameError|ValueError/);
 editor.value=f.lab.typingGuide(3).replaceAll('sb','sns');
 assert.equal(f.lab.evaluate(f.cells[3],3),true);
 for(let i=4;i<6;i++){f.cells[i].querySelector('.ml-code').value=f.lab.typingGuide(i).replaceAll('sb.','sns.');assert.equal(f.lab.evaluate(f.cells[i],i),true);}
 f.lab.state.explore={questionOrder:2,answers:{claim:0},justifications:{claim:'The dots show an upward association.'},attempts:{claim:2}};f.lab.store();
 const restored=fixture(config,f.storage);restored.lab.restore();assert.equal(restored.lab.state.completed.size,6);
 assert.equal(restored.lab.state.savedCodes[3],editor.value);assert.equal(restored.lab.state.explore.answers.claim,0);assert.equal(restored.lab.state.explore.attempts.claim,2);
});
test('Hidden Patterns opener insertion preserves existing notebook work and moves saved Learn positions once',()=>{
 const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('assets/js/ai100/hidden-patterns-config.js','utf8'),ctx);
 const config=ctx.window.ML_LAB_CONFIG,key='ai100.ml.hidden_patterns';
 const storage=new Map([[key,JSON.stringify({revision:2,scene:6,unlocked:8,learnComplete:true,codes:['saved code'],completed:[0],explore:{answers:{scaling:0}}})]]);
 const f=fixture(config,storage);f.lab.restore();
 assert.equal(f.lab.state.scene,6);assert.equal(f.lab.state.unlocked,8);assert.equal(f.lab.state.learnComplete,true);assert.equal(f.lab.state.completed.has(0),true);assert.equal(f.lab.state.savedCodes[0],'saved code');assert.equal(f.lab.state.explore.answers.scaling,0);
 f.cells[0].querySelector('.ml-code').value=f.lab.state.savedCodes[0];f.lab.store();const restored=fixture(config,storage);restored.lab.restore();assert.equal(restored.lab.state.scene,6);assert.equal(restored.lab.state.unlocked,8);assert.equal(restored.lab.state.savedCodes[0],'saved code');
});
test('Hidden Patterns revision preserves matching code, clears obsolete evidence, and leaves other labs alone',()=>{
 const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('assets/js/ai100/hidden-patterns-config.js','utf8'),ctx);
 const config=ctx.window.ML_LAB_CONFIG,key='ai100.ml.hidden_patterns',codes=['load','features','scale','fit','attach and means'];
 const storage=new Map([[key,JSON.stringify({revision:1,codes,completed:[0,1,2,3,4],learnComplete:true,scene:4,unlocked:4,explore:{finished:true,answers:{limits:0}},pastesUsed:2})],['ai100.ml.fish_predictor','untouched']]);
 const f=fixture(config,storage);f.lab.restore();const s=f.lab.state;
 assert.deepEqual([...s.savedCodes],['load','features','scale','fit','','','attach and means','','']);
 assert.equal(s.completed.size,0);assert.equal(s.learnComplete,false);assert.equal(s.scene,0);assert.equal(s.unlocked,0);assert.deepEqual(Object.keys(s.explore),[]);assert.equal(s.migrationNotice,true);assert.equal(s.pastesUsed,2);
 const fresh=fixture(config,storage);fresh.lab.restore();assert.deepEqual([...fresh.lab.state.savedCodes],[...s.savedCodes]);assert.equal(fresh.lab.state.migrated,false);assert.equal(fresh.lab.state.migrationNotice,true);
 assert.equal(storage.get('ai100.ml.fish_predictor'),'untouched');
 f.lab.reset();assert.equal(storage.has(key),false);assert.equal(storage.get('ai100.ml.fish_predictor'),'untouched');
});
test('ordered execution, Explore gating, invalidation and retained code',()=>{
 const f=notebookFixture(simple()),{lab,cells}=f;cells.forEach(c=>c.querySelector('.ml-code').value='print("ok")');
 lab.refreshNotebookProgress();assert.equal(cells[1].querySelector('.ml-code').readOnly,true);
 assert.equal(lab.evaluate(cells[1],1),false);assert.equal(lab.state.executions,0);
 lab.setMode('explore');assert.equal(lab.state.mode,'notebook');
 assert.equal(lab.evaluate(cells[0],0),true);assert.equal(cells[1].querySelector('[data-run]').disabled,false);
 cells[1].querySelector('.ml-code').value='';assert.equal(lab.evaluate(cells[1],1),false);assert.equal(lab.state.completed.size,1);
 cells[1].querySelector('.ml-code').value='print("fixed")';cells.forEach((cell,i)=>assert.equal(lab.evaluate(cell,i),true));
 lab.setMode('explore');assert.equal(lab.state.mode,'explore');
 lab.invalidateNotebookFrom(1);assert.deepEqual([...lab.state.completed],[0]);assert.equal(lab.state.mode,'notebook');assert.equal(cells[2].querySelector('.ml-inline-result').hidden,true);
 lab.state.pastesUsed=2;lab.invalidateNotebookFrom(0);assert.equal(lab.state.completed.size,0);assert.equal(lab.state.pastesUsed,2);assert.equal(cells[2].querySelector('.ml-code').value,'print("ok")');
});
test('paste budget, replacement, blocked/empty insertion, paired events, reload and reset isolation',async()=>{
 const f=notebookFixture(simple()),{lab,cells}=f,e=cells[0].querySelector('.ml-code');lab.bindCodeInsertion(e,0);
 const event=(text,type)=>({inputType:type,data:text,clipboardData:{getData:()=>text},preventDefault(){this.prevented=true}});
 lab.pasteCode(e,0,'');lab.pasteCode(cells[1].querySelector('.ml-code'),1,'blocked');assert.equal(lab.state.pastesUsed,0);
 e.value='before';e.selectionStart=0;e.selectionEnd=6;e.listeners.paste(event('first'));e.listeners.beforeinput(event('first','insertFromPaste'));assert.equal(e.value,'before');assert.equal(lab.state.pastesUsed,0);f.accept();assert.equal(e.value,'first');assert.equal(lab.state.pastesUsed,1);
 await Promise.resolve();e.listeners.beforeinput(event(' second','insertFromPaste'));f.accept();e.listeners.paste(event(' third'));f.accept();assert.equal(lab.state.pastesUsed,3);
 const saved=e.value;await Promise.resolve();e.listeners.paste(event(' fourth'));assert.equal(e.value,saved);
 const drop=event('drop');e.listeners.drop(drop);assert.equal(drop.prevented,true);
 // Undo/input never refunds previously accepted pastes.
 e.value='';lab.invalidateNotebookFrom(0);lab.store();assert.equal(lab.state.pastesUsed,3);
 const restored=notebookFixture(simple(),f.storage);restored.lab.restore();assert.equal(restored.lab.state.pastesUsed,3);
 f.storage.set('ai100.ml.another','keep');restored.lab.reset();assert.equal(f.storage.has('ai100.ml.test'),false);assert.equal(f.storage.get('ai100.ml.another'),'keep');
 const fresh=notebookFixture(simple(),f.storage);fresh.lab.restore();assert.equal(fresh.lab.state.pastesUsed,0);
});
test('legacy saves retain only consecutive completion and keep code',()=>{
 const storage=new Map([['ai100.ml.test',JSON.stringify({completed:[0,2],codes:['one','two','three']})]]),f=notebookFixture(simple(),storage);f.lab.restore();assert.deepEqual([...f.lab.state.completed],[0]);assert.equal(f.lab.state.savedCodes[2],'three');assert.equal(f.lab.state.pastesUsed,0);
});
test('instructor grants expand the saved allowance and Reset lab clears them',()=>{
 const f=notebookFixture(simple()),{lab,cells}=f;lab.state.pastesUsed=3;
 assert.equal(lab.grantPastes(1),true);assert.equal(lab.pasteAllowance(),4);
 lab.pasteCode(cells[0].querySelector('.ml-code'),0,'returned');f.accept();assert.equal(lab.state.pastesUsed,4);
 assert.equal(lab.grantPastes(5),true);assert.equal(lab.pasteAllowance(),9);
 for(const invalid of [0,-1,1.5,101,NaN])assert.equal(lab.grantPastes(invalid),false);
 const restored=notebookFixture(simple(),f.storage);restored.lab.restore();assert.equal(restored.lab.pasteAllowance(),9);assert.equal(restored.lab.state.pastesUsed,4);
 restored.lab.reset();const fresh=notebookFixture(simple(),f.storage);fresh.lab.restore();assert.equal(fresh.lab.pasteAllowance(),3);assert.equal(fresh.lab.state.pastesUsed,0);
});
for(const name of ['data-detective','fish-predictor','hidden-patterns','loan-auditor'])test(name+' instructor snippets pass existing validation in order',()=>{
 const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync('assets/js/ai100/'+name+'-config.js','utf8'),context);
 const f=notebookFixture(context.window.ML_LAB_CONFIG);f.lab.state.pastesUsed=3;f.lab.fillAllCode();assert.equal(f.lab.state.pastesUsed,3);assert.equal(f.lab.state.completed.size,0);f.cells.forEach((cell,i)=>assert.equal(f.lab.evaluate(cell,i),true));assert.equal(f.lab.notebookComplete(),true);
 f.lab.fillAllCode();assert.equal(f.lab.notebookComplete(),false);
});


for(const name of ['data-detective','fish-predictor','hidden-patterns','loan-auditor'])test(name+' Learn prerequisite persists and preserves legacy work',()=>{
 const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('assets/js/ai100/'+name+'-config.js','utf8'),ctx);
 const config=ctx.window.ML_LAB_CONFIG,f=fixture(config),{lab,cells,modes}=f;lab.state.learnComplete=false;
 lab.refreshNotebookProgress();assert.equal(modes[1].attrs['aria-disabled'],'true');assert.equal(modes[2].attrs['aria-disabled'],'true');
 for(const mode of ['notebook','explore']){lab.setMode(mode);assert.equal(lab.state.mode,'learn')}
 cells[0].querySelector('.ml-code').value=config.cells[0].code||'print("ok")';assert.equal(lab.evaluate(cells[0],0),false);
 assert.equal(lab.completeLearn(),false);lab.state.scene=config.scenes.length-1;lab.refreshNotebookProgress();assert.equal(lab.taskAvailable(0),false);
 if(config.id==='loan_model_auditor'){assert.equal(lab.completeLearn(),false);lab.state.governanceComplete=true;}
 assert.equal(lab.completeLearn(),true);assert.equal(lab.state.mode,'notebook');assert.equal(modes[1].attrs['aria-disabled'],'false');
 lab.state.scene=0;lab.setMode('learn');assert.equal(lab.taskAvailable(0),true);
 const restored=fixture(config,f.storage);restored.lab.restore();assert.equal(restored.lab.state.learnComplete,true);
 lab.fillAllCode();cells.forEach((cell,i)=>assert.equal(lab.evaluate(cell,i),true));lab.setMode('explore');assert.equal(lab.state.mode,'explore');
 const key='ai100.ml.'+config.id,saved=JSON.parse(f.storage.get(key));delete saved.learnComplete;saved.explore={answers:{kept:0}};f.storage.set(key,JSON.stringify(saved));
 const legacy=fixture(config,f.storage);legacy.lab.restore();assert.equal(legacy.lab.state.learnComplete,false);assert.equal(legacy.lab.state.completed.size,config.cells.length);assert.ok(legacy.lab.state.savedCodes[0]);assert.equal(legacy.lab.state.explore.answers.kept,0);legacy.lab.setMode('explore');assert.equal(legacy.lab.state.mode,'learn');
 legacy.lab.state.scene=config.scenes.length-1;legacy.lab.completeLearn();assert.equal(legacy.lab.notebookComplete(),true);
 legacy.lab.reset();const fresh=fixture(config,f.storage);fresh.lab.state.learnComplete=false;fresh.lab.restore();assert.equal(fresh.lab.state.learnComplete,false);
});

for(const action of ['cancel','escape','close'])test(action+' preserves code, selection, progress and storage',()=>{
 const f=notebookFixture(simple()),e=f.cells[0].querySelector('.ml-code');e.value='original';e.selectionStart=1;e.selectionEnd=4;f.lab.state.completed.add(0);f.lab.store();const saved=[...f.storage];
 f.lab.pasteCode(e,0,'replacement');assert.equal(f.dialog.open,true);assert.equal(f.part('[data-confirm-paste-cancel]').focused,true);assert.match(f.part('#pasteConfirmDescription').textContent,/2 pastes remaining/);
 if(action==='cancel')f.cancel();else if(action==='escape')f.dialog.listeners.cancel({preventDefault(){}});else f.dialog.close();
 assert.equal(e.value,'original');assert.equal(e.selectionStart,1);assert.equal(e.selectionEnd,4);assert.equal(e.focused,true);assert.equal(f.lab.state.pastesUsed,0);assert.equal(f.lab.state.completed.has(0),true);assert.deepEqual([...f.storage],saved);
 f.accept();assert.equal(f.lab.state.pastesUsed,0);
});
test('only one pending paste commits once and the last paste is explicit',()=>{
 const f=notebookFixture(simple()),e=f.cells[0].querySelector('.ml-code');f.lab.state.pastesUsed=2;e.value='abcd';e.selectionStart=1;e.selectionEnd=3;
 f.lab.pasteCode(e,0,'X');assert.match(f.part('#pasteConfirmDescription').textContent,/0 pastes remaining/);f.lab.pasteCode(e,0,'ignored');e.selectionStart=0;e.selectionEnd=0;
 f.accept();f.accept();assert.equal(e.value,'aXd');assert.equal(e.selectionStart,2);assert.equal(f.lab.state.pastesUsed,3);assert.equal(f.dialog.open,false);
 const saved=notebookFixture(simple(),f.storage);saved.lab.restore();assert.equal(saved.lab.state.pastesUsed,3);
});
for(const reason of ['changed','locked','exhausted'])test('stale paste is discarded: '+reason,()=>{
 const f=notebookFixture(simple()),e=f.cells[0].querySelector('.ml-code');e.value='original';f.lab.pasteCode(e,0,'X');
 if(reason==='changed')e.value='new';if(reason==='locked')f.lab.state.learnComplete=false;if(reason==='exhausted')f.lab.state.pastesUsed=3;
 f.accept();assert.equal(e.value,reason==='changed'?'new':'original');assert.equal(f.lab.state.pastesUsed,reason==='exhausted'?3:0);assert.equal(f.dialog.open,false);
});
test('empty, locked and exhausted pastes never open a dialog',()=>{
 const f=notebookFixture(simple()),e=f.cells[0].querySelector('.ml-code');f.lab.pasteCode(e,0,'');f.lab.pasteCode(f.cells[1].querySelector('.ml-code'),1,'X');f.lab.state.pastesUsed=3;f.lab.pasteCode(e,0,'X');assert.equal(f.dialog,null);
});

test('plot insertion preserves saved work and evidence, and only the explicit plotting task renders a chart',()=>{
 const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('assets/js/ai100/hidden-patterns-config.js','utf8'),ctx);
 const config=ctx.window.ML_LAB_CONFIG,key='ai100.ml.hidden_patterns',codes=config.cells.filter((_,i)=>i!==5).map(c=>c.hint);
 const storage=new Map([[key,JSON.stringify({revision:2,learnLayout:3,learnComplete:true,scene:8,unlocked:8,codes,completed:[0,1,2,3,4,5,6,7],answers:{kept:true},reflection:'My claim',explore:{answers:{limits:0}}})]]);
 const f=fixture(config,storage,true);f.lab.restore();
 assert.deepEqual([...f.lab.state.completed],[0,1,2,3,4]);assert.equal(f.lab.state.learnComplete,true);assert.equal(f.lab.state.scene,8);assert.equal(f.lab.state.reflection,'My claim');assert.equal(f.lab.state.answers.kept,true);assert.equal(f.lab.state.explore.answers.limits,0);
 assert.deepEqual([...f.lab.state.savedCodes],[...codes.slice(0,5),'',...codes.slice(5)]);assert.equal(f.lab.notebookComplete(),false);
 const again=fixture(config,storage);again.lab.restore();assert.deepEqual([...again.lab.state.savedCodes],[...f.lab.state.savedCodes]);
 config.cells.forEach((spec,i)=>{const cell=f.cells[i];cell.querySelector('.ml-code').value=spec.hint;assert.equal(f.lab.evaluate(cell,i),true);assert.equal(cell.querySelector('.ml-inline-result').hidden,i!==5)});
 assert.equal(f.lab.notebookComplete(),true);const plot=f.cells[5];assert.match(plot.querySelector('[data-cell-chart]').innerHTML,/ml-cluster-hover-chart/);
 plot.querySelector('.ml-code').value=config.cells[5].hint.replace('plt.show()','');assert.equal(f.lab.evaluate(plot,5),false);assert.equal(plot.querySelector('.ml-inline-result').hidden,true);
 plot.querySelector('.ml-code').value=config.cells[5].hint.replace('    plt.scatter','plt.scatter');assert.equal(f.lab.evaluate(plot,5),false);
 plot.querySelector('.ml-code').value=config.cells[5].hint;assert.equal(f.lab.evaluate(plot,5),true);f.lab.invalidateNotebookFrom(5);assert.equal(plot.querySelector('.ml-inline-result').hidden,true);
});

for(const name of ['data-detective','fish-predictor','hidden-patterns','loan-auditor'])test(name+' instructor fills and runs all code with saved results',()=>{
 const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('assets/js/ai100/'+name+'-config.js','utf8'),ctx);
 const config=ctx.window.ML_LAB_CONFIG,f=notebookFixture(config);f.lab.state.governanceComplete=true;f.lab.state.pastesUsed=2;
 assert.equal(f.lab.fillAndRunAllCode(),'All code cells filled and run successfully.');
 assert.equal(f.lab.notebookComplete(),true);assert.equal(f.lab.state.executions,config.cells.length);assert.equal(f.lab.state.pastesUsed,2);
 const restored=fixture(config,f.storage);restored.lab.restore();assert.equal(restored.lab.notebookComplete(),true);
 assert.equal(f.lab.fillAndRunAllCode(),'All code cells filled and run successfully.');assert.equal(f.lab.notebookComplete(),true);
});
test('instructor run all respects Learn and stops at a failed task',()=>{
 const config=simple();config.cells.forEach(c=>c.code='x = 1');const f=fixture(config);assert.match(f.lab.fillAndRunAllCode(),/Complete Learn/);assert.equal(f.lab.state.executions,0);
 f.lab.state.learnComplete=true;assert.match(f.lab.fillAndRunAllCode(),/Stopped at task 1/);assert.equal(f.lab.state.executions,1);assert.equal(f.lab.notebookComplete(),false);
});
