/* Snapshot-based playback keeps Prev, Replay, and mode changes deterministic. */
(function () {
  'use strict';
  const E = window.AVLDelete, $ = id => document.getElementById(id);
  let mode = 'll', operation = 'delete', initial, steps, index = 0, timer = null, frame = null, displayed = null, width = 820, treeHeight = 330;
  const examples = () => operation === 'insert' ? E.insertPresets : E.presets;
  const speeds={slow:{interval:3200,animation:1.6},medium:{interval:1900,animation:1},fast:{interval:600,animation:0.3}};
  let stepFilter='all';
  const actionType=s=>s.label==='Check balance'||s.label==='Rotation plan'||s.label.endsWith(' case')||s.kind==='rotation'?'avl':'bst';
  const combinedRemoval=i=>stepFilter!=='bst'&&steps[i].kind==='removed'&&steps[i+1]?.label==='Check balance';
  function destination(direction) {
    let next=index+direction;
    while(next>0&&next<steps.length-1&&(combinedRemoval(next)||(stepFilter!=='all'&&actionType(steps[next])!==stepFilter&&steps[next].label!=='Before'&&steps[next].kind!=='done')))next+=direction;
    return Math.max(0,Math.min(steps.length-1,next));
  }
  const autoSpeed=()=>speeds[$('auto-speed').value] || speeds.medium;
  let entryFlight=null;
  function cancelEntryFlight() {
    if(entryFlight){entryFlight.animation.cancel();entryFlight.element.remove();entryFlight=null;}
    $('tree').classList.remove('entry-flight');
  }
  function showQueue(s) {
    const queue=$('insert-queue');queue.hidden=operation!=='insert';
    $('queue-legend').hidden=operation!=='insert';
    $('queue-tooltip').hidden=true;
    if(operation!=='insert'){queue.replaceChildren();return;}
    queue.innerHTML=steps.filter(step=>step.label==='Before').map(step=>{
      const state=step.insertionIndex===s.insertionIndex?'current':step.insertionIndex<s.insertionIndex?'completed':'';
      const trace=steps.filter(t=>t.insertionIndex===step.insertionIndex);
      const rotationCase=trace.find(t=>/^(LL|RR|LR|RL) case$/.test(t.label))?.label.split(' ')[0];
      const category=rotationCase?rotationCase.toLowerCase():'plain';
      const tip=`${step.insertionKey}: ${rotationCase?rotationCase+' rotation':'No AVL rotation'}`;
      return `<button type="button" class="insert-chip ${category} ${state}" data-insertion="${step.insertionIndex}" data-tip="${tip}" ${state==='current'?'aria-current="step"':''} aria-label="Number ${step.insertionIndex}: ${tip}">${step.insertionKey}</button>`;
    }).join('');
    const chip=queue.querySelector('.current');
    if(chip)queue.scrollLeft=Math.max(0,chip.offsetLeft-queue.offsetLeft-queue.clientWidth/2+chip.offsetWidth/2);
  }
  function flyFromQueue() {
    if(operation!=='insert'||steps[index].label!=='Before'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const chip=$('insert-queue').querySelector('.current'), matrix=$('tree').getScreenCTM();
    if(!chip||!matrix)return;
    const source=chip.getBoundingClientRect(), destination=new DOMPoint(110,35).matrixTransform(matrix);
    const element=document.createElement('div');element.className='flying-insert-chip';element.textContent=steps[index].insertionKey;element.setAttribute('aria-hidden','true');
    element.style.left=(source.left+source.width/2-21)+'px';element.style.top=(source.top+source.height/2-21)+'px';document.body.append(element);
    $('tree').classList.add('entry-flight');
    const dx=destination.x-source.left-source.width/2,dy=destination.y-source.top-source.height/2;
    const animation=element.animate([{transform:'translate(0,0) scale(.8)'},{transform:`translate(${dx}px,${dy}px) scale(${Math.hypot(matrix.a,matrix.b)})`}],{duration:850*(timer?autoSpeed().animation:1),easing:'cubic-bezier(.25,.7,.25,1)',fill:'forwards'});
    entryFlight={element,animation};
    animation.onfinish=()=>{if(entryFlight?.element===element){element.remove();entryFlight=null;$('tree').classList.remove('entry-flight');}};
  }
  function prepare(key) {
    steps=operation==='insert'?E.traceSequence(initial,Array.isArray(key)?key:[key]):E.trace(initial,key,operation);
    // Track which displayed measurements have actually been recalculated.
    let pending=new Set(), priorNodes=new Map();
    steps.forEach(s=>{
      const nodes=layout(s.tree).nodes;
      if(s.label==='Before')pending.clear();
      else nodes.forEach(n=>{
        const old=priorNodes.get(n.id);
        if(old&&(E.height(old)!==E.height(n)||E.balance(old)!==E.balance(n)))pending.add(n.id);
      });
      s.pendingBefore=[...pending];
      if(s.label==='Check balance'||s.kind==='rotation'||s.kind==='insert')s.focus.forEach(id=>pending.delete(id));
      if(s.kind==='done')pending.clear();
      s.pendingAfter=[...pending];
      priorNodes=new Map(nodes.map(n=>[n.id,n]));
    });
    width=Math.max(820,...steps.map(s=>layout(s.tree).nodes.length*76+200));
    treeHeight=Math.max(330,...steps.map(s=>96+E.height(s.tree)*110));
  }
  const colors = {normal:['#F1EFE8','#B4B2A9'],focus:['#FAEEDA','#EF9F27'],red:['#FCEBEB','#E24B4A'],rotation:['#FBEAF0','#D4537E'],done:['#E1F5EE','#1D9E75']};
  function layout(tree) {
    const nodes = [], edges = [];
    function walk(n, depth) {
      if (!n) return;
      walk(n.left,depth+1);
      nodes.push({...n,x:0,y:96+depth*110});
      if(n.left) edges.push([n.id,n.left.id]);
      if(n.right) edges.push([n.id,n.right.id]);
      walk(n.right,depth+1);
    }
    walk(tree,0);
    nodes.forEach((n,i)=>n.x=100+(i+0.5)*(width-200)/Math.max(nodes.length,1));
    return {nodes,edges};
  }
  // Recover the return path, including the former position of a removed node.
  function balanceWalk(s, current) {
    if(s.label!=='Check balance')return [];
    const target=s.focus[0];
    function pathTo(n,id,path=[]) {
      if(!n)return null;
      const next=[...path,n.id];
      return n.id===id?next:pathTo(n.left,id,next)||pathTo(n.right,id,next);
    }
    for(let i=index-1;i>=0&&steps[i].label!=='Before';i--) {
      const prior=steps[i];
      if(!['insert','delete','removed','check','imbalance','rotation'].includes(prior.kind)&&prior.label!=='Successor')continue;
      for(const id of [...prior.focus].reverse()) {
        if(id===target)continue;
        for(const tree of [s.tree,prior.tree]) {
          const path=pathTo(tree,id),start=path?.indexOf(target);
          if(start==null||start<0)continue;
          const historic=layout(tree);
          return path.slice(start).reverse().map(key=>current.nodes.find(n=>n.id===key)||historic.nodes.find(n=>n.id===key));
        }
      }
    }
    return [];
  }
  function deletedGhost() {
    if(operation!=='delete')return null;
    const removed=steps.findIndex(s=>s.kind==='removed');
    if(removed<1||index<removed)return null;
    const before=layout(steps[removed-1].tree), after=layout(steps[removed].tree);
    const node=before.nodes.find(n=>!after.nodes.some(other=>other.id===n.id));
    if(!node)return null;
    const parent=before.edges.find(([,child])=>child===node.id)?.[0];
    const checked=steps.findIndex((s,i)=>i>removed&&s.label==='Check balance'&&s.focus.includes(parent));
    // A removed root has no parent to check; retain its outline until completion.
    const until=checked<0?steps.length-1:checked;
    return index<=until?{node,until,successor:steps[removed].label==='Successor removed'}:null;
  }
  function draw(current, previous, progress) {
    const s = steps[index], map = new Map();
    const rotations=s.label==='Check balance'&&progress<1?[]:(s.rotations||[]);
    const collapsed=new Map(), hidden=new Set();
    if($('collapse-subtrees').checked && (rotations.length || s.kind==='rotation')) {
      const core=new Set(s.focus);
      rotations.forEach(r=>{
        core.add(r.pivot);
        const pivot=current.nodes.find(n=>n.id===r.pivot);
        const child=pivot?.[r.direction==='right'?'left':'right'];
        if(child)core.add(child.id);
      });
      // Keep the pivots and their ancestor links visible; summarize the side branches.
      function containsCore(n) {return !!n && (core.has(n.id)||containsCore(n.left)||containsCore(n.right));}
      function collect(n,list=[]) {if(n){collect(n.left,list);list.push(n);collect(n.right,list);}return list;}
      function simplify(n) {
        if(!n)return;
        if(!containsCore(n)) {
          const nodes=collect(n);
          if(nodes.length>1) {
            collapsed.set(n.id,{count:nodes.length,min:nodes[0].key,max:nodes[nodes.length-1].key});
            nodes.slice().forEach(child=>{if(child.id!==n.id)hidden.add(child.id);});
          }
          return;
        }
        simplify(n.left);simplify(n.right);
      }
      simplify(s.tree);
    }
    const priorStep=steps[index-1];
    const sameInsertion=operation==='insert' && priorStep?.insertionIndex===s.insertionIndex;
    const priorLayout=sameInsertion?layout(priorStep.tree):null;
    const priorComparison=sameInsertion && priorStep.label==='Search'
      ? priorLayout.nodes.find(n=>n.id===priorStep.focus[0]) : null;
    const incomingStart=priorComparison?{x:priorComparison.x,y:priorComparison.y-52}:{x:110,y:35};
    const selectable = operation === 'delete' && (index === 0 || index === steps.length-1);
    current.nodes.forEach(n=>{
      const old = previous?.nodes.find(p=>p.id===n.id) || (s.kind==='insert' ? {...n,...incomingStart} : n);
      map.set(n.id,{...n,x:old.x+(n.x-old.x)*progress,y:old.y+(n.y-old.y)*progress});
    });
    let html = '<title>'+s.label+'</title><defs>' +
      '<marker id="rotation-arrow-1" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M1 1 L9 5 L1 9 Z" fill="#A85A00"/></marker>' +
      '<marker id="rotation-arrow-2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M1 1 L9 5 L1 9 Z" fill="#7941A3"/></marker>'+
      '<marker id="balance-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1 L9 5 L1 9 Z" fill="#0D9488"/></marker></defs>';
    const height=E.height(s.tree);
    html+=`<g class="tree-rulers" role="img" aria-label="Tree height ${height}; levels ${height?'0 through '+(height-1):'none'}"><title>Left: level, with the root at 0. Right: height ruler, counting from 1 at the deepest occupied level to ${height} at the root. This is a whole-tree scale, not individual subtree heights.</title><rect x="0" y="0" width="66" height="${treeHeight}" fill="#F8FAFC"/><rect x="${width-66}" y="0" width="66" height="${treeHeight}" fill="#F8FAFC"/><path d="M66 0 V${treeHeight} M${width-66} 0 V${treeHeight}" stroke="#E2E8F0"/><text x="30" y="25" text-anchor="middle" font-size="11" font-weight="bold" fill="#64748B">LEVEL</text><text x="${width-30}" y="25" text-anchor="middle" font-size="11" font-weight="bold" fill="#64748B">HEIGHT</text>`;
    for(let level=0;level<height;level++) {
      const y=96+level*110;
      html+=`<line class="level-gridline" x1="66" y1="${y}" x2="${width-66}" y2="${y}" stroke="#CBD5E1" stroke-width="1" stroke-dasharray="4 6" opacity="0.5" pointer-events="none" aria-hidden="true"/>`;
      html+=`<g class="ruler-tick" data-level="${level}" data-height="${height-level}"><path d="M54 ${y} H66 M${width-66} ${y} H${width-54}" stroke="#94A3B8"/><text x="30" y="${y+5}" text-anchor="middle" font-size="14" fill="#475569">${level}</text><text x="${width-30}" y="${y+5}" text-anchor="middle" font-size="14" font-weight="${level===0?'bold':'normal'}" fill="#185FA5">${height-level}</text></g>`;
    }
    if(!height)html+=`<text x="${width-30}" y="101" text-anchor="middle" font-size="14" fill="#185FA5">0</text>`;
    html+='</g>';
    const ghost=deletedGhost();
    if(ghost) {
      const n=ghost.node;
      html+=`<g class="deleted-ghost" opacity="0.45" pointer-events="none" aria-label="${ghost.successor?'Successor moved from this position':'Removed node'} ${n.key}; waiting for parent balance check"><circle cx="${n.x}" cy="${n.y}" r="23" fill="#FFF7F7" stroke="#B45A65" stroke-width="2" stroke-dasharray="5 4"/><text x="${n.x}" y="${n.y+5}" text-anchor="middle" font-size="15" fill="#98505A">${n.key}</text><text x="${n.x}" y="${n.y+39}" text-anchor="middle" font-size="10" fill="#98505A">${ghost.successor?'successor moved':'removed'}</text></g>`;
    }
    current.edges.forEach(([a,b])=>{if(hidden.has(a)||hidden.has(b)||collapsed.has(a))return;const p=map.get(a),q=map.get(b);const arriving=s.kind==='insert'&&s.focus.includes(b);html+=`<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="#B4B2A9" stroke-width="2" opacity="${arriving?progress:1}"/>`;});
    if(s.decision) {
      const a=map.get(s.decision.pivot),b=map.get(s.decision.child);
      html+=`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#7941A3" stroke-width="4" opacity="0.65"/>`;
    }
    const walk=balanceWalk(s,current);
    let walker=null;
    if(walk.length>1) {
      const points=walk.map(n=>map.get(n.id)||n);
      const last=points.length-1, end=points[last], before=points[last-1], distance=Math.hypot(end.x-before.x,end.y-before.y);
      points[last]={x:end.x+(before.x-end.x)*31/distance,y:end.y+(before.y-end.y)*31/distance};
      const lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));
      let remaining=progress*lengths.reduce((a,b)=>a+b,0);
      for(let i=0;i<lengths.length;i++) {
        if(remaining<=lengths[i]||i===lengths.length-1) {
          const t=Math.min(1,remaining/lengths[i]);
          walker={x:points[i].x+(points[i+1].x-points[i].x)*t,y:points[i].y+(points[i+1].y-points[i].y)*t};break;
        }
        remaining-=lengths[i];
      }
    }
    map.forEach(n=>{
      if(hidden.has(n.id))return;
      if(operation==='delete'&&s.label==='Successor'&&n.id===s.focus[0]) {
        html+=`<g class="removed-target" data-key="${n.key}" opacity="0.45" aria-label="Key ${n.key} removed; awaiting successor replacement"><circle cx="${n.x}" cy="${n.y}" r="23" fill="#FFF7F7" stroke="#B45A65" stroke-width="2" stroke-dasharray="5 4"/><text x="${n.x}" y="${n.y+5}" text-anchor="middle" font-size="15" fill="#98505A">${n.key}</text><text x="${n.x}" y="${n.y+39}" text-anchor="middle" font-size="10" fill="#98505A">removed</text></g>`;
        return;
      }
      if(collapsed.has(n.id)) {
        const subtree=collapsed.get(n.id);
        html+=`<g class="subtree-triangle" role="img" aria-label="Subtree rooted at ${n.key}, ${subtree.count} nodes, keys ${subtree.min} to ${subtree.max}"><title>Root ${n.key}; ${subtree.count} nodes; keys ${subtree.min} to ${subtree.max}; height ${E.height(n)}. Expands after rotation.</title><polygon points="${n.x},${n.y} ${n.x-30},${n.y+48} ${n.x+30},${n.y+48}" fill="#E6F1FB" stroke="#185FA5" stroke-width="2"/><text x="${n.x}" y="${n.y+35}" text-anchor="middle" font-size="12" fill="#0C447C">${n.key}</text><text x="${n.x}" y="${n.y+63}" text-anchor="middle" font-size="10" fill="#0C447C">${subtree.count} nodes</text></g>`;
        return;
      }
      const bf=E.balance(n), focus=s.focus.includes(n.id);
      const rechecking=(progress<1?s.pendingBefore:s.pendingAfter).includes(n.id)||(s.label==='Check balance'&&focus&&progress<1);
      const temporary=!rechecking&&s.intermediateRotation&&Math.abs(bf)>1;
      const color=s.kind==='done'?'done':temporary?'rotation':!rechecking&&Math.abs(bf)>1?'red':focus?(s.kind==='delete'?'red':s.kind==='rotation'?'rotation':'focus'):'normal';
      const [fill,stroke]=colors[color];
      html+=`<g class="tree-node ${selectable?'selectable':''}" data-key="${n.key}" ${selectable ? `role="button" tabindex="0" aria-label="Delete ${n.key}"` : ''}><title>Key ${n.key}; ${rechecking?'height and balance factor awaiting recalculation':`height ${E.height(n)}; balance factor ${bf}`}</title><circle cx="${n.x}" cy="${n.y}" r="23" fill="${fill}" stroke="${stroke}" stroke-width="2"/><text x="${n.x}" y="${n.y+5}" text-anchor="middle" font-size="15" fill="#2C2C2A">${n.key}</text><g class="bf-readout" visibility="${rechecking?'hidden':'visible'}"><rect class="bf-badge" data-node-id="${n.id}" x="${n.x-24}" y="${n.y+26}" width="48" height="19" rx="5" fill="${Math.abs(bf)>1?'#FCEBEB':'#E1F5EE'}"/><text x="${n.x}" y="${n.y+39}" text-anchor="middle" font-size="10" fill="${Math.abs(bf)>1?'#A32D2D':'#085041'}">BF=${bf>0?'+':''}${bf}</text></g></g>`;
      if(temporary)html+=`<text class="temporary-bf" x="${n.x}" y="${n.y+59}" text-anchor="middle" font-size="10" fill="#7941A3">temporary BF</text>`;
    });
    if(s.decision) {
      [[s.decision.pivot,'A','#185FA5'],[s.decision.child,'B','#7941A3']].forEach(([id,label,color])=>{
        const n=map.get(id);
        html+=`<g class="decision-node" aria-label="${label}: node ${n.key}, BF ${E.balance(n)} determines ${s.decision.type}"><circle cx="${n.x}" cy="${n.y}" r="28" fill="none" stroke="${color}" stroke-width="3"/><circle cx="${n.x}" cy="${n.y+61}" r="10" fill="${color}"/><text x="${n.x}" y="${n.y+65}" text-anchor="middle" fill="white" font-size="11" font-weight="bold">${label}</text></g>`;
      });
    }
    if(s.label==='Check balance') {
      const n=map.get(s.focus[0]);
      if(n)html+=`<g class="balance-check-guide" aria-label="Recheck BF at ${n.key}"><circle cx="${n.x}" cy="${n.y}" r="29" fill="none" stroke="#0D9488" stroke-width="3"/><g visibility="${progress<1?'visible':'hidden'}"><rect x="${n.x-48}" y="${n.y+49}" width="96" height="21" rx="10" fill="#CCFBF1" stroke="#0D9488"/><text x="${n.x}" y="${n.y+63}" text-anchor="middle" font-size="11" font-weight="bold" fill="#115E59">↑ Recheck BF</text></g></g>`;
      if(walker)html+=`<circle class="balance-walker" cx="${walker.x}" cy="${walker.y}" r="7" fill="#0D9488" stroke="white" stroke-width="3"/>`;
    }
    if(operation==='insert' && ['Before','Search','Already present'].includes(s.label)) {
      const comparison=s.label==='Before'?null:current.nodes.find(n=>n.id===s.focus[0]);
      const destination=comparison?{x:comparison.x,y:comparison.y-52}:{x:110,y:35};
      const start=s.label==='Before'?destination:incomingStart;
      const x=start.x+(destination.x-start.x)*progress, y=start.y+(destination.y-start.y)*progress;
      if(priorComparison && comparison && priorComparison.id!==comparison.id) {
        html+=`<path class="search-route" d="M ${start.x} ${start.y} L ${destination.x} ${destination.y}" stroke="#378ADD" stroke-width="2" stroke-dasharray="5 4" fill="none"/>`;
      }
      html+=`<g class="incoming-number" aria-label="Incoming ${s.insertionKey}${comparison?' comparing with '+comparison.key:''}"><text x="${x}" y="${y-26}" text-anchor="middle" font-size="10" fill="#185FA5">${comparison?'Compare':'Incoming'}</text><circle cx="${x}" cy="${y}" r="21" fill="#E6F1FB" stroke="#185FA5" stroke-width="2"/><text x="${x}" y="${y+5}" text-anchor="middle" font-size="15" fill="#0C447C">${s.insertionKey}</text></g>`;
    }
    rotations.forEach(rotation=>{
      const n=map.get(rotation.pivot); if(!n)return;
      const sign=rotation.direction==='right'?1:-1;
      const color=rotation.order===1?'#A85A00':'#7941A3';
      const label=`${rotation.order}. ${rotation.direction==='right'?'Right':'Left'}`;
      html+=`<g class="rotation-guide" role="img" aria-label="Rotation ${rotation.order}: rotate ${rotation.direction} at ${rotation.key}"><title>Rotation ${rotation.order}: rotate ${rotation.direction} at ${rotation.key}</title><path d="M ${n.x-sign*36} ${n.y} C ${n.x-sign*48} ${n.y-58}, ${n.x+sign*48} ${n.y-58}, ${n.x+sign*36} ${n.y}" fill="none" stroke="white" stroke-width="7"/><path class="rotation-arrow" d="M ${n.x-sign*36} ${n.y} C ${n.x-sign*48} ${n.y-58}, ${n.x+sign*48} ${n.y-58}, ${n.x+sign*36} ${n.y}" fill="none" stroke="${color}" stroke-width="2.5" marker-end="url(#rotation-arrow-${rotation.order})"/><rect x="${n.x-39}" y="${n.y-68}" width="78" height="20" rx="5" fill="white" stroke="${color}"/><text x="${n.x}" y="${n.y-54}" text-anchor="middle" fill="${color}" font-size="12" font-weight="bold">${label}</text></g>`;
    });
    if(!map.size) html+='<text x="410" y="150" text-anchor="middle" fill="#5F5E5A">Empty tree — balanced</text>';
    $('tree').innerHTML=html;
    // Keep removed-node outlines and labels above edges and traversal guides.
    $('tree').querySelectorAll('.deleted-ghost,.removed-target').forEach(node=>{
      node.setAttribute('opacity','1');
      node.querySelector('circle').setAttribute('fill','#FFFFFF');
      node.querySelector('circle').setAttribute('stroke','#DDB5BA');
      node.querySelectorAll('text').forEach(text=>text.setAttribute('fill','#C7ADB1'));
      $('tree').append(node);
    });
  }
  function stop() { if(timer) clearInterval(timer);timer=null;$('auto').textContent='Auto'; }
  function show(animate=false) {
    cancelEntryFlight();
    if(frame) cancelAnimationFrame(frame);
    const s=steps[index], next=layout(s.tree), previous=displayed;
    displayed=next;
    showQueue(s);
    const mergedRemoval=s.label==='Check balance'&&index>0&&combinedRemoval(index-1);
    $('badge').textContent=s.intermediateRotation?`${s.intermediateRotation} in progress`:s.label;
    const category=s.kind==='done'?'avl':actionType(s);
    $('action-badge').textContent=category.toUpperCase();
    $('action-badge').className=`badge action-badge ${category}`;
    $('status-text').textContent=(mergedRemoval?steps[index-1].text+' ':'')+s.text;
    const visibleSteps=steps.map((step,i)=>i).filter(i=>!combinedRemoval(i)&&(stepFilter==='all'||actionType(steps[i])===stepFilter||steps[i].label==='Before'||steps[i].kind==='done'||i===0||i===steps.length-1));
    $('counter').textContent=`Step ${visibleSteps.filter(i=>i<=index).length} of ${visibleSteps.length}`;
    const decision=s.decision, panel=$('rotation-decision');
    panel.hidden=!decision;
    document.querySelector('.status').hidden=s.label==='Before';
    $('status-text').hidden=!!decision;
    if(decision) {
      const signed=n=>n>0?'+'+n:String(n), first=decision.pivotBF>0?'L':'R', second=decision.childBF>0?'L':'R';
      panel.innerHTML=`<div class="decision-pair"><div class="decision-item"><span class="decision-a">A: ${decision.pivotKey}, BF ${signed(decision.pivotBF)}</span> ${first==='L'?'positive = left-heavy':'negative = right-heavy'} → <b>${first}</b></div><div class="decision-item"><span class="decision-b">B: ${decision.childKey}, BF ${signed(decision.childBF)}</span> ${decision.childBF===0?'zero = equal child heights; deletion uses a single rotation':`${second==='L'?'positive = left-heavy':'negative = right-heavy'} → <b>${second}</b>`}</div></div><strong>${decision.type} case</strong> · ${decision.type==='LL'?'Rotate right at A':decision.type==='RR'?'Rotate left at A':decision.type==='LR'?'Rotate left at B, then right at A':'Rotate right at B, then left at A'}.<br>BF = left height − right height. + means left-heavy; − means right-heavy. The letters describe the heavy sides, not the rotation directions.`;
    }
    $('sequence-progress').hidden=operation!=='insert';
    $('sequence-progress').textContent=operation==='insert'?`Inserting ${s.insertionKey} · Number ${s.insertionIndex} of ${s.insertionCount}`:'';
    $('prev').disabled=index===0;$('next').disabled=index===steps.length-1;
    $('order').textContent='In-order keys: '+(next.nodes.map(n=>n.key).join(' < ')||'(empty)');
    $('tree').setAttribute('viewBox',`0 0 ${width} ${treeHeight}`);
    $('tree').style.minWidth=Math.max(590,width*.8)+'px';
    $('selection-hint').textContent=operation==='delete'
      ? (index===0 || index===steps.length-1 ? 'Click a node or enter its key, then Next or Auto. Select another node after completion.' : 'Follow the deletion with Next or Auto. Finish or Replay to select another node.')
      : 'Separate up to 32 numbers with commas or spaces. Press Enter, then Next or Auto.';
    if(index===steps.length-1) stop();
    const duration=animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches?(s.label==='Check balance'?1100:s.kind==='insert'?950:650)*(timer?autoSpeed().animation:1):0;
    function flashRecalculated() {
      if(!animate)return;
      const ids=new Set(['check','imbalance','rotation'].includes(s.kind)?s.focus:[]);
      next.nodes.forEach(n=>{
        const old=previous?.nodes.find(p=>p.id===n.id);
        if(old && (E.balance(old)!==E.balance(n) || E.height(old)!==E.height(n)))ids.add(n.id);
      });
      $('tree').querySelectorAll('.bf-badge').forEach(badge=>{
        if([...ids].some(id=>String(id)===badge.dataset.nodeId))badge.classList.add('bf-recalculated');
      });
    }
    function finishStep() {
      flashRecalculated();
      if(duration&&s.label==='Check balance') {
        $('tree').querySelectorAll('.bf-badge').forEach(badge=>{
          if(s.focus.some(id=>String(id)===badge.dataset.nodeId)) {
            badge.parentElement.animate([{opacity:0},{opacity:1}],{duration:350*(timer?autoSpeed().animation:1),fill:'forwards'});
          }
        });
      }
      const ghost=deletedGhost(), element=$('tree').querySelector('.deleted-ghost');
      if(!element||index!==ghost?.until)return;
      if(!duration){element.remove();return;}
      const scale=timer?autoSpeed().animation:1;
      const fade=element.animate([{opacity:1},{opacity:0}],{delay:250*scale,duration:300*scale,fill:'forwards'});
      fade.onfinish=()=>element.remove();
    }
    if(s.label==='Before'&&operation==='insert'){draw(next,null,1);flyFromQueue();return;}
    if(!duration) {draw(next,null,1);finishStep();return;}
    const start=performance.now();
    function tick(now) {const t=Math.min(1,(now-start)/duration);draw(next,previous,t*t*(3-2*t));if(t<1)frame=requestAnimationFrame(tick);else finishStep();}
    frame=requestAnimationFrame(tick);
  }
  function load(m, fresh=false) {
    stop();mode=m;index=0;displayed=null;
    const p=examples()[m], shift=fresh?10+Math.floor(Math.random()*30):0;
    initial=E.build(p.values.map(v=>v+shift));
    const targets=(p.targets || [p.target]).map(v=>v+shift);
    $('target').value=operation==='insert'?targets.join(', '):p.target+shift;
    prepare(operation==='insert'?targets:p.target+shift);$('error').hidden=true;
    document.querySelectorAll('#types button').forEach(b=>{const active=b.dataset.mode===m;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    show();
  }
  function setOperation(value) {
    operation=value;
    const setup=document.querySelector('.setup'), inputRow=$('target').parentElement;
    setup.classList.toggle('inserting',value==='insert');
    if(value==='insert')$('new-values').before(inputRow);
    else document.querySelector('.example-row').after(inputRow);
    document.querySelectorAll('[data-operation]').forEach(b=>{const active=b.dataset.operation===value;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    $('target').type=value==='insert'?'text':'number';
    $('target').placeholder=value==='insert'?'Separate up to 32 numbers with commas or spaces. Press Enter, then Next or Auto.':'';
    $('selection-hint').hidden=value==='insert';
    $('target-label').textContent=value==='insert'?'Insert numbers':'Delete key';
    $('mode-description').textContent=value==='insert'?'Walk the BST, insert each key, and restore balance.':'Remove a key, check the ancestors, and watch rotations restore balance.';
    $('mode-note').textContent=value==='insert'?'Insertion repairs the first unbalanced ancestor with one single or double rotation. The remaining ancestors are checked as we return to the root.':'Deletion can require rebalancing at multiple ancestors. A heavy child with BF = 0 uses a single rotation.';
    $('types').replaceChildren();
    Object.entries(examples()).forEach(([key,p])=>{const b=document.createElement('button');b.textContent=p.label;b.dataset.mode=key;b.addEventListener('click',()=>load(key));$('types').append(b);});
    load(value==='insert'?'empty':'ll');
  }
  document.querySelectorAll('[data-operation]').forEach(b=>b.onclick=()=>setOperation(b.dataset.operation));
  $('collapse-subtrees').addEventListener('change',()=>show());
  $('prev').onclick=()=>{stop();index=destination(-1);show();};
  $('next').onclick=()=>{stop();index=destination(1);show(true);};
  $('replay').onclick=()=>{stop();index=0;show();};
  $('new-values').onclick=()=>load(mode,true);
  function startAuto() {
    $('auto').textContent='Pause';
    timer=setInterval(()=>{if(index<steps.length-1){index=destination(1);show(true);}else stop();},autoSpeed().interval);
  }
  $('auto').onclick=()=>{
    if(timer) {stop();return;}
    if(index===steps.length-1){index=0;show();}
    startAuto();
  };
  $('auto-speed').addEventListener('change',()=>{
    $('speed-current').textContent=$('auto-speed').selectedOptions[0].textContent;
    document.querySelectorAll('[data-speed]').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.speed===$('auto-speed').value)));
    if(timer){stop();show();if(index<steps.length-1)startAuto();}
  });
  const speedOptions=Array.from(document.querySelectorAll('[data-speed]'));
  const stepOptions=Array.from(document.querySelectorAll('[data-step]'));
  function closeSteps(focus=false) {
    $('step-menu').hidden=true;$('step-trigger').setAttribute('aria-expanded','false');
    if(focus)$('step-trigger').focus();
  }
  function openSteps() {
    closeSpeed();$('step-menu').hidden=false;$('step-trigger').setAttribute('aria-expanded','true');
    stepOptions.find(b=>b.dataset.step===stepFilter).focus();
  }
  $('step-trigger').onclick=()=>{$('step-menu').hidden?openSteps():closeSteps(true);};
  $('step-trigger').addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openSteps();}});
  stepOptions.forEach(b=>b.onclick=()=>{
    stepFilter=b.dataset.step;
    stepOptions.forEach(option=>option.setAttribute('aria-checked',String(option===b)));
    $('next').textContent=stepFilter==='all'?'Next →':`Next ${stepFilter.toUpperCase()} →`;
    $('next').title=stepFilter==='all'?'Advance one explanation step':`Advance to the next ${stepFilter.toUpperCase()} action (all operations still run)`;
    closeSteps(true);
  });
  $('step-menu').addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();closeSteps(true);}
    else if(event.key==='Tab')closeSteps();
    else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();const i=stepOptions.indexOf(document.activeElement);
      stepOptions[event.key==='Home'?0:event.key==='End'?2:(i+(event.key==='ArrowDown'?1:2))%3].focus();
    }
  });
  document.addEventListener('pointerdown',event=>{if(!$('next-picker').contains(event.target))closeSteps();});
  $('insert-queue').addEventListener('click',event=>{
    const chip=event.target.closest('[data-insertion]');if(!chip)return;
    stop();index=steps.findIndex(s=>s.label==='Before'&&s.insertionIndex===Number(chip.dataset.insertion));
    displayed=null;show();$('next').focus();
  });
  function queueTooltip(event) {
    const chip=event.target.closest('[data-insertion]');if(!chip)return;
    const tip=$('queue-tooltip');tip.textContent=chip.dataset.tip;tip.hidden=false;
    const box=chip.getBoundingClientRect();
    tip.style.left=Math.max(8,Math.min(box.left,window.innerWidth-tip.offsetWidth-8))+'px';
    tip.style.top=(box.bottom+tip.offsetHeight+8>window.innerHeight?Math.max(8,box.top-tip.offsetHeight-8):box.bottom+8)+'px';
    chip.setAttribute('aria-describedby','queue-tooltip');
  }
  $('insert-queue').addEventListener('pointerover',queueTooltip);
  $('insert-queue').addEventListener('focusin',queueTooltip);
  ['pointerout','focusout','scroll'].forEach(type=>$('insert-queue').addEventListener(type,()=>{$('queue-tooltip').hidden=true;}));
  $('insert-queue').addEventListener('keydown',event=>{if(event.key==='Escape')$('queue-tooltip').hidden=true;});
  function closeSpeed(focus=false) {
    $('speed-menu').hidden=true;$('speed-trigger').setAttribute('aria-expanded','false');
    if(focus)$('speed-trigger').focus();
  }
  function openSpeed() {
    $('speed-menu').hidden=false;$('speed-trigger').setAttribute('aria-expanded','true');
    speedOptions.find(b=>b.dataset.speed===$('auto-speed').value).focus();
  }
  $('speed-trigger').onclick=()=>{$('speed-menu').hidden?openSpeed():closeSpeed(true);};
  $('speed-trigger').addEventListener('keydown',event=>{
    if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openSpeed();}
  });
  speedOptions.forEach(b=>b.onclick=()=>{
    $('auto-speed').value=b.dataset.speed;
    $('auto-speed').dispatchEvent(new Event('change'));
    closeSpeed(true);
  });
  $('speed-menu').addEventListener('keydown',event=>{
    const i=speedOptions.indexOf(document.activeElement);
    if(event.key==='Escape'){event.preventDefault();closeSpeed(true);}
    else if(event.key==='Tab')closeSpeed();
    else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?2:(i+(event.key==='ArrowDown'?1:2))%3;
      speedOptions[next].focus();
    }
  });
  document.addEventListener('pointerdown',event=>{if(!$('speed-picker').contains(event.target))closeSpeed();});
  function applyKey() {
    stop();
    let key;
    try {
      key=operation==='insert'?E.parseSequence($('target').value):Number($('target').value);
      if(operation==='delete' && (!$('target').value.trim()||!Number.isSafeInteger(key)))throw new Error('Enter a whole-number key.');
    } catch(error) {$('error').textContent=error.message;$('error').hidden=false;return;}
    prepare(key);index=0;$('error').hidden=true;show();
  };
  $('target').addEventListener('change',applyKey);
  $('target').addEventListener('keydown',event=>{if(event.key==='Enter')applyKey();});
  function selectNode(event) {
    const node=event.target.closest('.tree-node.selectable');
    if(!node || operation!=='delete' || (index!==0 && index!==steps.length-1))return;
    if(event.type==='keydown' && event.key!=='Enter' && event.key!==' ')return;
    event.preventDefault();
    // A completed deletion becomes the starting tree for the next selection.
    initial=steps[index].tree;
    $('target').value=node.dataset.key;
    applyKey();
    $('next').focus();
  }
  $('tree').addEventListener('click',selectNode);
  $('tree').addEventListener('keydown',selectNode);
  window.addEventListener('pagehide',()=>{stop();cancelEntryFlight();if(frame)cancelAnimationFrame(frame);});
  setOperation(operation);
})();
