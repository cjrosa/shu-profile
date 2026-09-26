const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/js/components/ai-ml-lab.js','utf8');
const downloadSource=source.slice(source.indexOf('function downloadNamedEvidenceAssignment(){'),source.indexOf('function renderGuidedCompletion(){'));

function fixture(storage=new Map()){
 const fields=new Map();
 const field=key=>{if(!fields.has(key))fields.set(key,{value:'',textContent:'',focus(){this.focused=true}});return fields.get(key)};
 let exists=false,blob,anchor,cleanup,revoked;
 const dialog={open:false,showModal(){this.open=true},close(){this.open=false;this.onclose?.()},addEventListener(type,fn){this['on'+type]=fn}};
 const context={localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},Blob,URL:{createObjectURL(value){blob=value;return 'blob:test'},revokeObjectURL(value){revoked=value}},setTimeout(fn){cleanup=fn},
  C:{id:'test',title:'Test Lab',explore:{tasks:[{id:'one',title:'Inspect data',objective:'Find the pattern.',options:['Right-skewed'],evidence:'A long right tail.'}]}},
  guidedExploreState:()=>({answers:{one:0},justifications:{one:'Most fish are light; a few are heavy.'}}),
  q:selector=>selector==='#assignmentDownloadDialog'?(exists?dialog:null):field(selector),
  document:{body:{insertAdjacentHTML(){exists=true},appendChild(node){node.attached=true}},createElement(){anchor={click(){assert.equal(this.attached,true);this.clicked=true},remove(){this.attached=false}};return anchor}},
  prompt(){throw Error('Native prompts must not be used')}
 };
 vm.createContext(context);vm.runInContext(downloadSource,context);
 return {context,dialog,field,get blob(){return blob},get anchor(){return anchor},cleanup(){cleanup();return revoked}};
}

test('assignment download validates names and exports answers through an attached link',async()=>{
 const f=fixture();f.context.downloadNamedEvidenceAssignment();assert.equal(f.dialog.open,true);
 f.field('#assignmentFirstName').value='   ';f.field('#assignmentLastName').value='Smith';
 f.field('form').onsubmit({preventDefault(){}});assert.equal(f.anchor,undefined);assert.match(f.field('[data-download-error]').textContent,/both/);
 f.field('#assignmentFirstName').value=' Alex ';
 f.field('form').onsubmit({preventDefault(){}});
 assert.equal(f.dialog.open,false);assert.equal(f.anchor.download,'Smith-Alex-test.txt');assert.equal(f.anchor.clicked,true);assert.equal(f.anchor.attached,false);
 const text=await f.blob.text();assert.match(text,/Student: Alex Smith/);assert.match(text,/Downloaded: [^\r\n]+\d{1,2}:\d{2}/);assert.doesNotMatch(text,/Date: _/);assert.match(text,/Right-skewed/);assert.match(text,/Most fish are light; a few are heavy\./);assert.match(text,/END OF SUBMISSION/);
 assert.equal(f.cleanup(),'blob:test');
});

test('cancel creates no file and a failed download leaves the form available to retry',()=>{
 const f=fixture();f.context.downloadNamedEvidenceAssignment();f.field('[data-download-cancel]').onclick();assert.equal(f.dialog.open,false);assert.equal(f.anchor,undefined);
 f.context.downloadNamedEvidenceAssignment();f.field('#assignmentFirstName').value='Alex';f.field('#assignmentLastName').value='Smith';
 f.context.URL.createObjectURL=()=>{throw Error('Unavailable')};
 f.field('form').onsubmit({preventDefault(){}});assert.equal(f.dialog.open,true);assert.match(f.field('[data-download-error]').textContent,/try again/);
});


test('student names persist across fresh sessions and all four labs',()=>{
 const storage=new Map(),first=fixture(storage);first.context.downloadNamedEvidenceAssignment();
 first.field('#assignmentFirstName').value=' Chris ';first.field('#assignmentLastName').value=' Rosa ';
 first.field('#assignmentLastName').oninput();
 for(const id of ['data_detective','fish_predictor','loan_model_auditor','hidden_patterns']){
  const next=fixture(storage);next.context.C.id=id;next.context.downloadNamedEvidenceAssignment();
  assert.equal(next.field('#assignmentFirstName').value,'Chris');assert.equal(next.field('#assignmentLastName').value,'Rosa');
 }
 const edit=fixture(storage);edit.context.downloadNamedEvidenceAssignment();edit.field('#assignmentFirstName').value='Sam';edit.field('#assignmentFirstName').oninput();
 const restored=fixture(storage);restored.context.downloadNamedEvidenceAssignment();assert.equal(restored.field('#assignmentFirstName').value,'Sam');
});

test('invalid or unavailable name storage does not block the download form',()=>{
 for(const saved of ['not json','{"firstName":42,"lastName":null}']){
  const f=fixture(new Map([['ai100.ml.student',saved]]));f.context.downloadNamedEvidenceAssignment();assert.equal(f.field('#assignmentFirstName').value,'');assert.equal(f.dialog.open,true);
 }
 const f=fixture();f.context.localStorage={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
 f.context.downloadNamedEvidenceAssignment();f.field('#assignmentFirstName').value='Alex';f.field('#assignmentLastName').value='Smith';f.field('#assignmentFirstName').oninput();f.field('form').onsubmit({preventDefault(){}});assert.equal(f.anchor.clicked,true);
});
