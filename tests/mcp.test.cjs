const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('../tools/llm-tokenizer/node_modules/jsdom');
const M = require('../assets/js/ai100/mcp-engine.js');
const root = path.join(__dirname, '..');
const calls = frames => frames.filter(f => f.payload?.method === 'tools/call');
const end = frames => frames.at(-1);

test('session discovery precedes tool calls; request/response IDs match', () => {
  const trace = M.buildTrace(M.examples[1][1], M.initialDB());
  const messages = trace.filter(f => f.direction).map(f => f.payload);
  assert.deepEqual(messages.slice(0, 5).map(m => m.method || 'response'), ['initialize', 'response', 'notifications/initialized', 'tools/list', 'response']);
  assert.equal(messages[2].id, undefined);
  const requests = messages.filter(m => m.method && m.id);
  for (const request of requests) assert.equal(messages.filter(m => m.id === request.id && !m.method).length, 1);
  assert.ok(trace.findIndex(f => f.approval) < trace.indexOf(calls(trace)[0]));
  assert.equal(end(trace).db.length, 2);
});
test('reads preserve records, chained calls use actual search results', () => {
  const db = M.initialDB();
  const read = M.buildTrace('Find available rooms at 11:00.', db);
  assert.deepEqual(end(read).db, db);
  assert.match(end(read).answer, /Maple, Birch/);
  const chain = M.buildTrace('Find and book a room at 11:00 for Alex.', db);
  assert.deepEqual(calls(chain).map(f => f.payload.params.name), ['search_availability', 'create_booking']);
  assert.equal(calls(chain)[1].payload.params.arguments.room, 'Maple');
  assert.equal(end(chain).db[1].room, 'Maple');
  assert.deepEqual(db, M.initialDB(), 'trace generation must not mutate source records');
});
test('conflicts return tool errors and never insert a duplicate', () => {
  const trace = M.buildTrace('Book Cedar at 11:00 for Alex.', M.initialDB());
  assert.deepEqual(end(trace).db, M.initialDB());
  assert.ok(trace.some(f => f.payload?.result?.isError === true));
  assert.match(end(trace).answer, /already booked/);
});
test('cancellation checks existence and ownership', () => {
  assert.equal(end(M.buildTrace('Cancel booking B100.', M.initialDB())).db.length, 0);
  assert.match(end(M.buildTrace('Cancel booking B999.', M.initialDB())).answer, /does not exist/);
  const db = [{ ...M.initialDB()[0], user: 'Sam' }];
  const trace = M.buildTrace('Cancel booking B100.', db);
  assert.deepEqual(end(trace).db, db);
  assert.match(end(trace).answer, /does not belong/);
});
test('invalid, incomplete, and unrelated prompts do not silently write', () => {
  for (const prompt of ['Book a room.', 'Book Cedar at 10:00 for Sam.', '<script>alert(1)</script>', 'What is MCP?']) {
    const trace = M.buildTrace(prompt, M.initialDB());
    assert.equal(calls(trace).length, 0);
    assert.deepEqual(end(trace).db, M.initialDB());
  }
  const invalid = M.buildTrace('Book Cedar at 25:99 for Alex.', M.initialDB());
  assert.ok(invalid.some(f => f.payload?.error?.code === -32602));
  assert.equal(invalid.filter(f => f.node === 'database').length, 0);
  assert.equal(M.validate('create_booking', {room:'Cedar',time:'10:00',user:'Sam'}), 'Unexpected argument.');
});
test('no availability ends the chain before a booking call', () => {
  const db = M.ROOMS.map((room, i) => ({id:`B${100+i}`,room,time:'10:00',date:M.DATE,user:'Alex'}));
  const trace = M.buildTrace('Find and book a room at 10:00 for Alex.', db);
  assert.equal(calls(trace).length, 1);
  assert.match(end(trace).answer, /No rooms/);
  assert.deepEqual(end(trace).db, db);
});

function app() {
  const dom=new JSDOM(fs.readFileSync(path.join(root,'ai100/mcp_explorer.html'),'utf8'),{runScripts:'outside-only'});
  const pending=new Map();let id=0;
  dom.window.setTimeout=callback=>{pending.set(++id,callback);return id;};
  dom.window.clearTimeout=key=>pending.delete(key);
  dom.advance=()=>{const entry=pending.entries().next().value;if(entry){pending.delete(entry[0]);entry[1]();}};
  for(const name of ['mcp-engine.js','mcp-explorer.js'])vm.runInContext(fs.readFileSync(path.join(root,'assets/js/ai100',name),'utf8'),dom.getInternalVMContext());
  return dom;
}
function click(d,id){d.getElementById(id).click();}
function send(d,prompt){d.getElementById('prompt').value=prompt;click(d,'load');}
function reach(dom,condition){for(let i=0;i<60&&!condition();i++)dom.advance();assert.ok(condition());}
test('automatic requests record only reached actions and pause at chat approval',()=>{
 const dom=app(),d=dom.window.document;
 assert.equal(d.querySelectorAll('#play,#next,#previous,#replay,#speed').length,0);
 send(d,'Book Cedar at 10:00 for Alex.');
 assert.equal(d.querySelectorAll('#action-list button').length,1);
 reach(dom,()=>!d.getElementById('approval').hidden);
 assert.ok(d.getElementById('chat-thread').contains(d.getElementById('approve')));
 const count=d.querySelectorAll('#action-list button').length;dom.advance();assert.equal(d.querySelectorAll('#action-list button').length,count);
 assert.equal(d.querySelectorAll('.reservation').length,1);
 click(d,'approve');reach(dom,()=>!d.getElementById('final-reply').hidden);
 assert.equal(d.querySelectorAll('.reservation').length,2);
 assert.match(d.getElementById('answer').textContent,/B101/);
 assert.equal(d.getElementById('prompt-flow').classList.contains('up'),true);
 dom.window.close();
});
test('historical inspection leaves live data unchanged for the next request',()=>{
 const dom=app(),d=dom.window.document;
 send(d,'Book Cedar at 10:00 for Alex.');reach(dom,()=>!d.getElementById('approval').hidden);click(d,'approve');reach(dom,()=>!d.getElementById('final-reply').hidden);
 click(d,'open-actions');d.querySelector('#action-list button').click();
 assert.equal(d.getElementById('review-banner').hidden,false);
 assert.equal(d.querySelectorAll('.reservation').length,1,'show historical snapshot');
 send(d,'Book Cedar at 10:00 for Alex.');reach(dom,()=>!d.getElementById('approval').hidden);click(d,'approve');reach(dom,()=>!d.getElementById('final-reply').hidden);
 assert.match(d.getElementById('answer').textContent,/already booked/);
 assert.equal(d.querySelectorAll('.reservation').length,2);
 dom.window.close();
});
test('open panel updates while inspecting a past action; dismiss returns to latest',()=>{
 const dom=app(),d=dom.window.document;
 send(d,'Find available rooms at 11:00.');click(d,'open-actions');d.querySelector('#action-list button').click();
 const before=d.querySelectorAll('#action-list button').length;
 reach(dom,()=>d.getElementById('run-status').textContent==='Request complete');
 assert.ok(d.querySelectorAll('#action-list button').length>before);
 assert.equal(d.getElementById('final-reply').hidden,true,'inspection remains on the selected action');
 click(d,'latest');assert.match(d.getElementById('answer').textContent,/Maple, Birch/);
 click(d,'close-actions');assert.equal(d.getElementById('actions-panel').hidden,true);
 click(d,'open-actions');assert.ok(d.querySelectorAll('#action-list button').length>1);
 d.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(d.getElementById('actions-panel').hidden,true);
 dom.window.close();
});
test('tool loading and selection are inspectable; historical approval cannot execute',()=>{
 const dom=app(),d=dom.window.document;
 send(d,'Book Cedar at 10:00 for Alex.');reach(dom,()=>!d.getElementById('approval').hidden);click(d,'decline');
 click(d,'open-actions');
 const select=text=>[...d.querySelectorAll('#action-list button')].find(n=>n.textContent.includes(text)).click();
 select('loading MCP tools');assert.equal(d.getElementById('tools-status').textContent,'Loading MCP tools…');
 select('tools loaded');assert.equal(d.querySelectorAll('[data-model-tool].selected').length,0);
 select('Choose an action');assert.equal(d.querySelector('[data-model-tool].selected').dataset.modelTool,'create_booking');
 select('asks for approval');assert.equal(d.getElementById('approval').hidden,true);click(d,'approve');
 click(d,'latest');assert.match(d.getElementById('answer').textContent,/did not change/);assert.equal(d.querySelectorAll('.reservation').length,1);
 dom.window.close();
});
test('every example completes automatically and text input remains inert',()=>{
 const dom=app(),d=dom.window.document;
 for(const button of d.querySelectorAll('#examples button')){button.click();for(let i=0;i<60&&d.getElementById('final-reply').hidden;i++){if(!d.getElementById('approval').hidden)click(d,'approve');else dom.advance();}assert.ok(d.getElementById('answer').textContent);}
 send(d,'<img src=x onerror="alert(1)">');assert.equal(d.querySelectorAll('img').length,0);
 assert.match(d.getElementById('user-message').textContent,/<img/);assert.equal(d.querySelectorAll('pre,code').length,0);
 dom.window.close();
});
test('temporary operations clear after completion and return for the selected historical step',()=>{
 const dom=app(),d=dom.window.document;
 send(d,'Find available rooms at 10:00.');
 reach(dom,()=>!d.getElementById('server-result').hidden);
 assert.equal(d.getElementById('server-action').hidden,false);
 dom.advance();assert.equal(d.getElementById('server-result').hidden,true);
 reach(dom,()=>!d.getElementById('final-reply').hidden);
 for(const id of ['server-action','operations','database-result','server-result','model-result'])assert.equal(d.getElementById(id).hidden,true,id);
 click(d,'open-actions');
 [...d.querySelectorAll('#action-list button')].find(b=>b.textContent.includes('booking result travels')).click();
 assert.equal(d.getElementById('server-result').hidden,false);
 assert.match(d.getElementById('server-result').textContent,/Cedar, Maple, Birch/);
 click(d,'latest');assert.equal(d.getElementById('server-result').hidden,true);
 dom.window.close();
});
