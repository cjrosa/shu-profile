const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('../tools/llm-tokenizer/node_modules/jsdom');

test('congestion events synchronize table, graph selection, and clearing',()=>{
  const html=fs.readFileSync('cs339/tcp_full_V3.html','utf8');
  const dom=new JSDOM(html,{runScripts:'outside-only'}),w=dom.window;
  w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({}, {get:(_,k)=>k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
  w.requestAnimationFrame=()=>{};
  const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1].replace(/\r\n/g,'\n');
  w.eval(script.replace('requestAnimationFrame(loop);\nrenderLog();',`window.chartAPI={doConnect,onTimeoutCC,triggerFastRetx,drawChart,loop,sim,
    clock:()=>protocolTime,
    phase:()=>{cc.phase='cong_avoid';recordChart();},
    state:()=>({events:ccEvents.slice(),hits:ccEventHits.slice(),selected:selectedCCEvent})};
    requestAnimationFrame(loop);\nrenderLog();`));
  const a=w.chartAPI;a.doConnect();a.phase();a.onTimeoutCC();a.triggerFastRetx();a.drawChart();
  assert.deepEqual(Array.from(a.state().events,e=>e.label),['Window initialized','Enter congestion avoidance','Retransmission timeout','Fast retransmit']);
  assert.match(w.document.getElementById('chart-cv').textContent,/Window size \(MSS\)/);
  w.document.getElementById('units-bytes').click();
  for(const id of ['chart-cv','window-history-graph'])assert.match(w.document.getElementById(id).textContent,/Window size \(bytes\)/);
  assert.match(w.document.getElementById('cc-unit-note').textContent,/1 MSS = 1,000 bytes/);
  w.document.getElementById('units-mss').click();
  for(const id of ['chart-cv','window-history-graph'])assert.match(w.document.getElementById(id).textContent,/Window size \(MSS\)/);
  const buttons=w.document.querySelectorAll('#cc-events-body button');buttons[2].click();
  assert.equal(a.state().selected,3);
  assert.equal(w.document.querySelector('#cc-events-body tr.selected button').textContent,'#3');
  const canvas=w.document.getElementById('chart-cv');
  assert.equal(canvas.tagName.toLowerCase(),'svg');
  assert.ok(canvas.querySelectorAll('path').length>=2);
  assert.equal(canvas.querySelectorAll('.chart-event-marker').length,4);
  canvas.getBoundingClientRect=()=>({left:0,top:0,width:Number(canvas.getAttribute('viewBox').split(' ')[2]),height:320});
  const hit=a.state().hits.at(-1);
  canvas.dispatchEvent(new w.MouseEvent('click',{clientX:hit.x,clientY:hit.y}));
  assert.equal(a.state().selected,4);
  canvas.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowLeft'}));
  assert.equal(a.state().selected,3);
  w.document.getElementById('btn-clear-chart').click();a.drawChart();
  assert.equal(a.state().events.length,0);assert.equal(a.state().hits.length,0);assert.equal(a.state().selected,null);
  const dialog=w.document.getElementById('cc-examine-dialog');dialog.close();
  const mode=w.document.getElementById('cc-examine-mode');mode.checked=true;mode.dispatchEvent(new w.Event('change'));
  a.phase();
  assert.equal(dialog.open,true,'examine mode opens on a recorded event');
  const frozen=a.clock();a.loop(100);a.loop(500);
  assert.equal(a.clock(),frozen,'examination freezes protocol time');
  a.onTimeoutCC();
  assert.match(w.document.getElementById('cc-examine-explanation').textContent,/timer expired/);
  w.document.getElementById('cc-examine-prev').click();
  assert.equal(a.state().selected,1,'previous event is inspectable');
  assert.equal(w.document.getElementById('cc-examine-prev').disabled,true);
  w.document.getElementById('cc-examine-next').click();
  assert.equal(a.state().selected,2);
  assert.equal(w.document.getElementById('cc-examine-next').disabled,true);
  w.document.getElementById('cc-examine-continue').click();a.loop(550);
  assert.ok(a.clock()>frozen,'continue resumes protocol time');
  w.document.querySelector('#cc-events-body button').click();
  w.document.getElementById('cc-examine-pause').click();
  assert.equal(dialog.open,false,'pause dismisses the inspector');
  assert.equal(a.sim.paused,true,'pause persists after dismissal');
  const stopped=a.clock();a.loop(575);assert.equal(a.clock(),stopped);
  const resume=w.document.getElementById('btn-pause');
  assert.equal(resume.textContent,'Resume');assert.equal(resume.style.display,'inline-flex');
  resume.click();a.loop(590);assert.ok(a.clock()>stopped,'toolbar resumes after dialog pause');
  a.sim.paused=true;w.document.querySelector('#cc-events-body button').click();
  w.document.getElementById('cc-examine-continue').click();
  const paused=a.clock();a.loop(600);assert.equal(a.clock(),paused,'existing pause is preserved');
  dom.window.close();
});

test('nearby recovery events keep separate selectable markers without changing event data',()=>{
  const html=fs.readFileSync('cs339/tcp_full_V3.html','utf8');
  const dom=new JSDOM(html,{runScripts:'outside-only'}),w=dom.window;
  w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.requestAnimationFrame=()=>{};
  const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  w.eval(script.replace(/\}\)\(\);\s*$/, `
    window.chartAPI={drawChart,selectCCEvent,
      state:()=>({events:ccEvents.slice(),hits:ccEventHits.slice(),selected:selectedCCEvent})};
    for(let i=0;i<24;i++){
      const point={t:Math.floor(i/2)*16+(i%2)*0.1,cwnd:4,ssthresh:4,
        phase:i%2?'cong_avoid':'fast_recovery',mss:1000};
      chartPts.push(point);
      ccEvents.push({...point,id:i+1,label:i%2?'Enter congestion avoidance':'Fast retransmit',variant:'reno'});
    }
    drawChart();
  })();`));
  const a=w.chartAPI,chart=w.document.getElementById('chart-cv');
  chart.getBoundingClientRect=()=>({left:0,top:0,width:Number(chart.getAttribute('viewBox').split(' ')[2]),height:320});
  const original=JSON.stringify(a.state().events);
  function checkMarkers(){
    const hits=a.state().hits;
    assert.equal(hits.length,24);
    assert.equal(chart.querySelectorAll('.chart-event-marker').length,24);
    hits.forEach((hit,i)=>{
      assert.ok(hit.x>=72&&hit.x<=Number(chart.getAttribute('viewBox').split(' ')[2])-24);
      assert.ok(hit.y>=50&&hit.y<=282);
      hits.slice(i+1).forEach(other=>assert.ok(Math.hypot(hit.x-other.x,hit.y-other.y)>=26,'event markers must not overlap'));
    });
    for(const id of [13,17,21]){
      const hit=hits.find(h=>h.id===id);
      chart.dispatchEvent(new w.MouseEvent('click',{clientX:hit.x,clientY:hit.y}));
      assert.equal(a.state().selected,id,'displaced marker remains selectable');
      assert.match(w.document.getElementById('cc-examine-title').textContent,new RegExp('^#'+id+' - Fast retransmit'));
    }
    assert.equal(JSON.stringify(a.state().events),original,'layout must preserve real event times and values');
  }
  checkMarkers();
  w.document.getElementById('units-bytes').click();checkMarkers();
  a.drawChart();checkMarkers();
  dom.window.close();
});
