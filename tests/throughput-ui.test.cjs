const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Simulation=require('../assets/js/throughput-simulation.js');
// Lightweight DOM fixture tests event wiring and simulation lifecycle, not layout.
function fixture(){
 const elements=new Map();let nextFrame;
 function el(id){if(!elements.has(id))elements.set(id,{id,dataset:{},value:'',textContent:'',innerHTML:'',attrs:{},listeners:{},addEventListener(k,fn){this.listeners[k]=fn;},setAttribute(k,v){this.attrs[k]=v;},focus(){},querySelectorAll(){return ['rs','rc','r'].map(k=>{const input=el('rate-'+k);input.dataset.rate=k;return input;});}});return elements.get(id);}
 const presets=['server','client','shared'].map(k=>{const e=el('preset-'+k);e.dataset.preset=k;return e;});
 const doc={getElementById:el,querySelectorAll:()=>presets,addEventListener(){}};
 vm.runInNewContext(fs.readFileSync('assets/js/throughput-explorer.js','utf8'),{document:doc,ThroughputSimulation:Simulation,matchMedia:()=>({matches:true,addEventListener(){}}),requestAnimationFrame:fn=>{nextFrame=fn;}});
 return {el,click:id=>el(id).listeners.click(),frame:t=>nextFrame(t),change:(id,value,event='change')=>{el(id).value=value;el(id).listeners[event]({target:el(id)});}};
}
test('start, pause, tabs preserve independent runs, and reset clears current run',()=>{
 const f=fixture();assert.equal(f.el('play').textContent,'Start');f.click('play');f.frame(0);for(let t=100;t<=1000;t+=100)f.frame(t);
 assert.equal(f.el('clock').textContent,'1.0 s');f.click('tab-shared');assert.equal(f.el('clock').textContent,'0.0 s');assert.equal(f.el('play').textContent,'Start');f.frame(1100);assert.equal(f.el('clock').textContent,'0.0 s');
 f.click('tab-single');assert.equal(f.el('clock').textContent,'1.0 s');assert.equal(f.el('tab-single').attrs['aria-selected'],'true');f.click('reset');assert.equal(f.el('clock').textContent,'0.0 s');
});
test('rate controls, presets and connection count update predictions',()=>{
 const f=fixture();f.change('rate-rc','20','input');assert.match(f.el('formula').textContent,/20.0 Mbps/);f.click('tab-shared');f.click('preset-shared');assert.match(f.el('formula').textContent,/20.0 Mbps/);f.change('connections','4');assert.match(f.el('formula').textContent,/10.0 Mbps/);assert.equal(f.el('clock').textContent,'0.0 s');assert.match(f.el('metrics').innerHTML,/Connection 4/);assert.match(f.el('metrics').innerHTML,/Total/);
});
test('HTML references and course viewer registration resolve',()=>{
 const html=fs.readFileSync('cs339/throughput_explorer.html','utf8');for(const [,ref] of html.matchAll(/(?:src|href)="(\.\.\/assets\/[^"?]+)"/g))assert.ok(fs.existsSync(require('node:path').resolve('cs339',ref)),ref);
 const hub=fs.readFileSync('cs339/index.html','utf8');assert.match(hub,/viewer.html\?tool=cs339\/throughput_explorer.html/);assert.match(hub,/name:'Throughput Explorer', file:'throughput_explorer.html'/);
});
