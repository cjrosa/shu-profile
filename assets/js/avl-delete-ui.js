/* Snapshot-based playback keeps Prev, Replay, and mode changes deterministic. */
(function () {
  'use strict';
  const E = window.AVLDelete, $ = id => document.getElementById(id);
  let mode = 'll', initial, steps, index = 0, timer = null, frame = null, displayed = null;
  const colors = {normal:['#F1EFE8','#B4B2A9'],focus:['#FAEEDA','#EF9F27'],red:['#FCEBEB','#E24B4A'],rotation:['#FBEAF0','#D4537E'],done:['#E1F5EE','#1D9E75']};
  function layout(tree) {
    const nodes = [], edges = [];
    function walk(n, depth) {
      if (!n) return;
      walk(n.left,depth+1);
      nodes.push({...n,x:0,y:55+depth*92});
      if(n.left) edges.push([n.id,n.left.id]);
      if(n.right) edges.push([n.id,n.right.id]);
      walk(n.right,depth+1);
    }
    walk(tree,0);
    nodes.forEach((n,i)=>n.x=60+(i+0.5)*700/Math.max(nodes.length,1));
    return {nodes,edges};
  }
  function draw(current, previous, progress) {
    const s = steps[index], map = new Map();
    current.nodes.forEach(n=>{
      const old = previous?.nodes.find(p=>p.id===n.id) || n;
      map.set(n.id,{...n,x:old.x+(n.x-old.x)*progress,y:old.y+(n.y-old.y)*progress});
    });
    let html = '<title>'+s.label+'</title>';
    current.edges.forEach(([a,b])=>{const p=map.get(a),q=map.get(b);html+=`<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="#B4B2A9" stroke-width="2"/>`;});
    map.forEach(n=>{
      const bf=E.balance(n), focus=s.focus.includes(n.id);
      const color=s.kind==='done'?'done':Math.abs(bf)>1?'red':focus?(s.kind==='delete'?'red':s.kind==='rotation'?'rotation':'focus'):'normal';
      const [fill,stroke]=colors[color];
      html+=`<g><title>Key ${n.key}; height ${E.height(n)}; balance factor ${bf}</title><circle cx="${n.x}" cy="${n.y}" r="23" fill="${fill}" stroke="${stroke}" stroke-width="2"/><text x="${n.x}" y="${n.y+5}" text-anchor="middle" font-size="15" fill="#2C2C2A">${n.key}</text><rect x="${n.x-32}" y="${n.y+26}" width="64" height="19" rx="5" fill="${Math.abs(bf)>1?'#FCEBEB':'#E1F5EE'}"/><text x="${n.x}" y="${n.y+39}" text-anchor="middle" font-size="10" fill="${Math.abs(bf)>1?'#A32D2D':'#085041'}">h=${E.height(n)} BF=${bf>0?'+':''}${bf}</text></g>`;
    });
    if(!map.size) html+='<text x="410" y="150" text-anchor="middle" fill="#5F5E5A">Empty tree — balanced</text>';
    $('tree').innerHTML=html;
  }
  function stop() { if(timer) clearInterval(timer);timer=null;$('auto').textContent='Auto'; }
  function show(animate=false) {
    if(frame) cancelAnimationFrame(frame);
    const s=steps[index], next=layout(s.tree), previous=displayed;
    displayed=next;
    $('badge').textContent=s.label;$('status-text').textContent=s.text;$('counter').textContent=`Step ${index+1} of ${steps.length}`;
    $('prev').disabled=index===0;$('next').disabled=index===steps.length-1;
    $('order').textContent='In-order keys: '+(next.nodes.map(n=>n.key).join(' < ')||'(empty)');
    $('tree').setAttribute('viewBox',`0 0 820 ${Math.max(330,55+E.height(initial)*92)}`);
    if(index===steps.length-1) stop();
    const duration=animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches?650:0;
    if(!duration) {draw(next,null,1);return;}
    const start=performance.now();
    function tick(now) {const t=Math.min(1,(now-start)/duration);draw(next,previous,t*t*(3-2*t));if(t<1)frame=requestAnimationFrame(tick);}
    frame=requestAnimationFrame(tick);
  }
  function load(m, fresh=false) {
    stop();mode=m;index=0;displayed=null;
    const p=E.presets[m], shift=fresh?10+Math.floor(Math.random()*30):0;
    initial=E.build(p.values.map(v=>v+shift));$('target').value=p.target+shift;
    steps=E.trace(initial,p.target+shift);$('error').hidden=true;
    document.querySelectorAll('#types button').forEach(b=>{const active=b.dataset.mode===m;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    show();
  }
  Object.entries(E.presets).forEach(([key,p])=>{const b=document.createElement('button');b.textContent=p.label;b.dataset.mode=key;b.addEventListener('click',()=>load(key));$('types').append(b);});
  $('prev').onclick=()=>{stop();index=Math.max(0,index-1);show();};
  $('next').onclick=()=>{stop();index=Math.min(steps.length-1,index+1);show(true);};
  $('replay').onclick=()=>{stop();index=0;show();};
  $('new-values').onclick=()=>load(mode,true);
  $('auto').onclick=()=>{
    if(timer) {stop();return;}
    if(index===steps.length-1){index=0;show();}
    $('auto').textContent='Pause';
    timer=setInterval(()=>{if(index<steps.length-1){index++;show(true);}else stop();},1900);
  };
  $('apply').onclick=()=>{
    const key=Number($('target').value);
    if(!$('target').value.trim()||!Number.isSafeInteger(key)){$('error').textContent='Enter a whole-number key.';$('error').hidden=false;return;}
    stop();steps=E.trace(initial,key);index=0;$('error').hidden=true;show();
  };
  $('target').addEventListener('keydown',event=>{if(event.key==='Enter')$('apply').click();});
  window.addEventListener('pagehide',()=>{stop();if(frame)cancelAnimationFrame(frame);});
  load(mode);
})();
