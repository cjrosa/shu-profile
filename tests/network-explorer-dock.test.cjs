const {test}=require('node:test'),assert=require('node:assert/strict');
const {Layout}=require('../assets/js/network-explorer-dock.js');
const keys=['terminal','events','troubleshooting'];
function invariant(layout){assert.deepEqual(layout.groups.flatMap(g=>g.tabs).sort(),[...keys].sort());assert.ok(layout.groups.every(g=>g.tabs.length&&g.tabs.includes(g.active)&&g.weight>0));}
test('splitting tabs creates three independent bottom groups',()=>{
 const l=new Layout(keys),first=l.groups[0].id;
 l.move('events',first,'right');l.move('troubleshooting',l.owner('events').id,'right');
 assert.deepEqual(l.groups.map(g=>g.tabs),[['terminal'],['events'],['troubleshooting']]);invariant(l);
});
test('join groups, switch locally, reorder, and remove empty source groups',()=>{
 const l=new Layout(keys);l.separate();l.move('troubleshooting',l.owner('events').id,'join','events');
 assert.deepEqual(l.groups.map(g=>g.tabs),[['terminal'],['troubleshooting','events']]);
 l.activate('events');assert.equal(l.groups[0].active,'terminal');assert.equal(l.groups[1].active,'events');
 l.move('events',l.owner('events').id,'join','troubleshooting');assert.deepEqual(l.groups[1].tabs,['events','troubleshooting']);invariant(l);
});
test('single tab moved to another edge is relocated without duplicates',()=>{
 const l=new Layout(keys);l.separate();l.move('troubleshooting',l.owner('terminal').id,'left');
 assert.deepEqual(l.groups.map(g=>g.tabs),[['troubleshooting'],['terminal'],['events']]);
 l.move('terminal',l.owner('terminal').id,'right');invariant(l);assert.equal(l.groups.length,3);
});
test('combine preserves visual tab order and active tool',()=>{
 const l=new Layout(keys);l.separate();l.move('troubleshooting',l.owner('terminal').id,'left');l.combine('events');
 assert.deepEqual(l.groups[0].tabs,['troubleshooting','terminal','events']);assert.equal(l.groups[0].active,'events');invariant(l);
});
test('many moves preserve one owner and one selected tab per nonempty group',()=>{
 const l=new Layout(keys);for(let i=0;i<200;i++){const key=keys[i%3],target=l.groups[(i*7)%l.groups.length];l.move(key,target.id,['join','left','right'][Math.floor(i/3)%3],target.tabs[0]);invariant(l);}
});
