const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../tools/llm-tokenizer/node_modules/jsdom');
const geometry = require('../assets/js/graph-layout.js');

function check(graph, dag = false) {
  const routes = geometry.routeEdges(graph);
  const [left,top,width,height] = geometry.bounds(graph,routes);
  for (const [a,p] of Object.entries(graph.nodes)) {
    for (const [b,q] of Object.entries(graph.nodes)) if (a !== b)
      assert.ok(Math.hypot(p[0]-q[0],p[1]-q[1]) >= 48, 'nodes overlap');
    assert.ok(p[0]-18 >= left && p[0]+18 <= left+width && p[1]-18 >= top && p[1]+18 <= top+height);
  }
  for (const route of routes) {
    assert.ok(!/NaN|Infinity/.test(route.d));
    if (dag) assert.ok(graph.nodes[route.a][1] < graph.nodes[route.b][1], 'edge must flow downward');
    for (let i=0;i<=500;i++) {
      const t=i/500;
      const p=route.start.map((v,k)=>(1-t)**2*v+2*t*(1-t)*route.control[k]+t*t*route.end[k]);
      for(const [id,q] of Object.entries(graph.nodes)) if(id!==route.a && id!==route.b)
        assert.ok(Math.hypot(p[0]-q[0],p[1]-q[1]) >= 24, `edge ${route.a}-${route.b} hits ${id}`);
    }
  }
}

for (const course of ['cs112','cs339']) test(`${course}: presets, randomized DAGs, and playback retain clear geometry`, () => {
  const html = fs.readFileSync(path.join(__dirname,'..',course,'graph_viz.html'),'utf8');
  const dom = new JSDOM(html, {runScripts:'outside-only'});
  const w=dom.window;
  w.GraphLayout=geometry;
  let seed=12345;
  w.Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  w.eval(html.match(/<script>([\s\S]*?)<\/script>/)[1] + '\nwindow.graphs=GRAPHS; window.density=d=>edgeDensity=d; window.playAll=()=>{steps=buildSteps(); for(stepIndex=1;stepIndex<=steps.length;stepIndex++) renderGraph(false);};');
  Object.entries(w.graphs).forEach(([key,g])=>check(g,key==='dag'));
  for(const density of ['few','many']) for(let sources=1;sources<=3;sources++) {
    w.density(density);
    for(let i=0;i<30;i++) {
      w.generateDAG(sources);
      check(w.graphs.dag,true);
      const incoming=new Set(w.graphs.dag.edges.map(e=>e[1]));
      assert.equal(Object.keys(w.graphs.dag.nodes).filter(n=>!incoming.has(n)).length,sources);
    }
  }
  for(const tab of ['search','topo','span','dijk']) {
    w.document.querySelector(`[data-tab="${tab}"]`).click();
    if(tab==='search') {w.nodeClick('A');w.nodeClick('D');}
    if(tab==='dijk') {w.nodeClick('A');w.skipDijkTarget();}
    w.playAll();
    assert.equal(w.document.querySelectorAll('#svg circle').length>=7,true);
    w.doReset();
  }
  dom.window.close();
});

for (const course of ['cs112','cs339']) test(`${course}: enqueue badges include start, target, and current nodes`, () => {
  const html = fs.readFileSync(path.join(__dirname,'..',course,'graph_viz.html'),'utf8');
  const dom = new JSDOM(html, {runScripts:'outside-only'}), w=dom.window;
  w.GraphLayout=geometry;
  w.eval(html.match(/<script>([\s\S]*?)<\/script>/)[1] + `
    window.showQueue = (mode, scenario) => {
      activeTab='search'; activeSub='bfs'; activeVisit=mode; skipVisitedNeighbors=mode==='enqueue';
      startNode='A'; targetNode='D';
      steps=runBFS(GRAPHS.undirected,'A','D',false);
      stepIndex=mode==='dequeue' ? steps.findIndex(s=>s.frontier[0]==='A' && s.frontier.filter(n=>n==='A').length===2)+1 : 1;
      if (scenario === 'behind') stepIndex=steps.findIndex(s=>s.frontier[0]==='F' && s.frontier.includes('A'))+1;
      if (scenario === 'duplicates') stepIndex=steps.findIndex(s=>s.frontier[0]!=='G' && s.frontier.filter(n=>n==='G').length===2)+1;
      renderSidebar(); renderGraph(false);
      return steps[stepIndex-1];
    };
    window.showBFS = (mode, index) => {
      activeTab='search'; activeSub='bfs'; activeVisit=mode;
      startNode='A'; targetNode='B';
      steps=runBFS(GRAPHS.undirected,'A','B',false);
      stepIndex=index+1; renderGraph(false);
      return steps[index];
    };
  `);
  const badge = id => {
    const node=w.document.getElementById('node-'+id);
    return w.document.querySelector(`#svg circle[r="7"][cx="${+node.getAttribute('cx')+11}"][cy="${+node.getAttribute('cy')+11}"]`);
  };
  w.showBFS('enqueue',0);
  assert.ok(badge('A'), 'start is visited on its initial enqueue');
  assert.equal(badge('B'),null);
  w.showBFS('enqueue',1);
  assert.ok(badge('A'), 'current node retains its visited badge');
  const enqueued=w.showBFS('enqueue',2);
  assert.ok(enqueued.frontier.includes('B'));
  assert.ok(badge('B'), 'target is marked before dequeue');
  w.showBFS('dequeue',0);
  assert.equal(badge('A'),null);
  w.showBFS('dequeue',2);
  assert.equal(badge('B'),null, 'dequeue mode does not mark an enqueued target');
  w.showQueue('dequeue');
  assert.deepEqual([...w.document.querySelectorAll('#sidebar .tk-found')].map(n=>n.textContent), ['A','A']);
  assert.equal(w.document.querySelector('#node-A').getAttribute('fill'), '#EAF3DE');
  w.showQueue('dequeue', 'behind');
  assert.deepEqual([...w.document.querySelectorAll('#sidebar .tk-found')].map(n=>n.textContent), ['A']);
  const duplicateStep=w.showQueue('dequeue', 'duplicates');
  assert.ok(duplicateStep);
  assert.equal([...w.document.querySelectorAll('#sidebar .tk-found')].filter(n=>n.textContent==='G').length,2);
  w.showQueue('enqueue');
  assert.equal(w.document.querySelectorAll('#sidebar .tk-found').length, 1);

  dom.window.close();
});

for (const course of ['cs112','cs339']) test(course + ': optional visited guard works in both BFS modes', () => {
  const html=fs.readFileSync(path.join(__dirname,'..',course,'graph_viz.html'),'utf8');
  const dom=new JSDOM(html,{runScripts:'outside-only'}), w=dom.window;
  w.GraphLayout=geometry;
  w.eval(html.match(/<script>([\s\S]*?)<\/script>/)[1] + `
    window.exercise = (mode, guard, target) => {
      activeTab='search'; activeSub='bfs'; activeVisit=mode; skipVisitedNeighbors=guard;
      const graph={nodes:{A:[0,0],B:[0,0],C:[0,0],D:[0,0],Z:[0,0]},
        edges:[['A','B'],['A','C'],['B','D'],['C','D']]};
      return runBFS(graph,'A',target,false);
    };
  `);
  for (const mode of ['enqueue','dequeue']) for (const guard of [true,false]) {
    const steps=w.exercise(mode,guard,'Z');
    assert.equal(steps.at(-1).msgClass,'done', 'cycles must terminate');
    assert.ok(steps.length<40);
    for (let i=1;i<steps.length;i++) {
      if (!steps[i].msg.startsWith('Enqueue ')) continue;
      const id=steps[i].msg.split(' ')[1];
      if (guard) assert.ok(!steps[i-1].visited.includes(id),'guard must reject visited neighbors');
    }
    if (!guard) assert.ok(steps.some(s=>s.msg.startsWith('Enqueue A ')));
    const duplicate=steps.some(s=>new Set(s.frontier).size<s.frontier.length);
    assert.equal(duplicate,mode==='dequeue'||!guard);
    const found=w.exercise(mode,guard,'D').find(s=>s.msgClass==='found');
    assert.deepEqual(Array.from(found.path),['A','B','D']);
  }
  w.document.querySelector('[data-sub="bfs"]').click();
  const box=w.document.getElementById('skip-visited');
  assert.ok(box.checked);
  box.click();
  w.document.querySelector('[data-visit="enqueue"]').click();
  assert.equal(box.checked,false,'setting persists between visit modes');
  dom.window.close();
});
