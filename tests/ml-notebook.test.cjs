const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/js/components/ai-ml-lab.js','utf8');
function fixture(config,storage=new Map()){
 function element(){return {value:'',textContent:'',innerHTML:'',hidden:false,attrs:{},listeners:{},classList:{add(){},remove(){},toggle(){}},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,f){this.listeners[k]=f},selectionStart:0,selectionEnd:0,setRangeText(t,a,b){this.value=this.value.slice(0,a)+t+this.value.slice(b);this.selectionStart=this.selectionEnd=a+t.length}}}
 const globals=new Map(),cells=config.cells.map(()=>{const parts=new Map();return {...element(),querySelector(s){if(!parts.has(s))parts.set(s,element());return parts.get(s)},querySelectorAll(){return []}}});
 cells.forEach(cell=>{const code=cell.querySelector('.ml-code');code.closest=()=>cell;cell.querySelector('.ml-output').querySelector=()=>element()});
 const modes=['learn','notebook','explore'].map(mode=>({...element(),dataset:{mode},querySelector:()=>element()}));
 const document={body:{},addEventListener(){},querySelector(s){const match=s.match(/^\[data-cell="(\d+)"\]$/);if(match)return cells[+match[1]];if(s.startsWith('[data-sidebar-task'))return null;if(s==='[data-mode="explore"]')return modes[2];if(s==='[data-mode="notebook"]')return modes[1];if(!globals.has(s))globals.set(s,element());return globals.get(s)},querySelectorAll(s){if(s==='.ml-cell')return cells;if(s==='.ml-code')return cells.map(c=>c.querySelector(s));if(s==='.ml-mode')return modes;return []}};
 const context={document,window:{},MutationObserver:class{observe(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setTimeout:()=>0,clearTimeout(){},queueMicrotask,confirm:()=>true,location:{reload(){}},config};
 vm.createContext(context);
 // Expose closure functions only in this fixture. Chart rendering is outside progression tests.
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,`C=config;updateMetrics=()=>{};renderExplore=()=>{};globalThis.lab={state,restore,store,grantPastes,pasteAllowance,taskAvailable,notebookComplete,refreshNotebookProgress,invalidateNotebookFrom,evaluate,fillAllCode,pasteCode,bindCodeInsertion,setMode,completeLearn,reset,typingGuide};})();`),context);
 return {lab:context.lab,cells,document,storage,modes};
}
function simple(){return {id:'test',cells:Array.from({length:3},()=>({requires:['print\\s*\\('],output:'ok'}))}}
function notebookFixture(config,storage){const f=fixture(config,storage);f.lab.state.learnComplete=true;return f}
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
 e.value='before';e.selectionStart=0;e.selectionEnd=6;e.listeners.paste(event('first'));e.listeners.beforeinput(event('first','insertFromPaste'));assert.equal(e.value,'first');assert.equal(lab.state.pastesUsed,1);
 await Promise.resolve();e.listeners.beforeinput(event(' second','insertFromPaste'));e.listeners.paste(event(' third'));assert.equal(lab.state.pastesUsed,3);
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
 lab.pasteCode(cells[0].querySelector('.ml-code'),0,'returned');assert.equal(lab.state.pastesUsed,4);
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
 assert.equal(lab.completeLearn(),true);assert.equal(lab.state.mode,'notebook');assert.equal(modes[1].attrs['aria-disabled'],'false');
 lab.state.scene=0;lab.setMode('learn');assert.equal(lab.taskAvailable(0),true);
 const restored=fixture(config,f.storage);restored.lab.restore();assert.equal(restored.lab.state.learnComplete,true);
 lab.fillAllCode();cells.forEach((cell,i)=>assert.equal(lab.evaluate(cell,i),true));lab.setMode('explore');assert.equal(lab.state.mode,'explore');
 const key='ai100.ml.'+config.id,saved=JSON.parse(f.storage.get(key));delete saved.learnComplete;saved.explore={answers:{kept:0}};f.storage.set(key,JSON.stringify(saved));
 const legacy=fixture(config,f.storage);legacy.lab.restore();assert.equal(legacy.lab.state.learnComplete,false);assert.equal(legacy.lab.state.completed.size,config.cells.length);assert.ok(legacy.lab.state.savedCodes[0]);assert.equal(legacy.lab.state.explore.answers.kept,0);legacy.lab.setMode('explore');assert.equal(legacy.lab.state.mode,'learn');
 legacy.lab.state.scene=config.scenes.length-1;legacy.lab.completeLearn();assert.equal(legacy.lab.notebookComplete(),true);
 legacy.lab.reset();const fresh=fixture(config,f.storage);fresh.lab.state.learnComplete=false;fresh.lab.restore();assert.equal(fresh.lab.state.learnComplete,false);
});
