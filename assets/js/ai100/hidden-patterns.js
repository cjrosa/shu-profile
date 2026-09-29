/* Deterministic classroom k-means. No Python runtime or network requests. */
(function(root){
'use strict';
const features=['Length','Height','Width'];
const colors=['#1f7a46','#3977a8','#bd5814','#8b53a5','#b44539','#697c25','#826329'];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const copy=a=>a.map(p=>p.slice());
const distance=(a,b)=>a.reduce((sum,v,j)=>sum+(v-b[j])**2,0);
function standardize(points){
 const mean=points[0].map((_,j)=>points.reduce((s,p)=>s+p[j],0)/points.length);
 const spread=mean.map((m,j)=>Math.sqrt(points.reduce((s,p)=>s+(p[j]-m)**2,0)/points.length));
 return {mean,spread,points:points.map(p=>p.map((v,j)=>(v-mean[j])/(spread[j]||1)))};
}
function random(seed){let n=seed>>>0;return ()=>{n=(Math.imul(1664525,n)+1013904223)>>>0;return n/4294967296}}
function initialCenters(points,k,rng){
 const chosen=[Math.floor(rng()*points.length)];
 while(chosen.length<k){
  const weights=points.map(p=>Math.min(...chosen.map(i=>distance(p,points[i]))));
  const total=weights.reduce((s,v)=>s+v,0);let index;
  if(total===0)index=points.findIndex((_,i)=>!chosen.includes(i));
  else{let threshold=rng()*total;index=weights.findIndex(w=>(threshold-=w)<0);if(index<0)index=weights.length-1;}
  chosen.push(index);
 }
 return chosen.map(i=>points[i].slice());
}
function assign(points,centers){return points.map(p=>centers.reduce((best,c,j)=>distance(p,c)<distance(p,centers[best])?j:best,0))}
// Reassign a far-away member from a group with spare members to repair an empty group.
function repairEmpty(points,centers,labels){
 const counts=centers.map((_,j)=>labels.filter(v=>v===j).length);
 counts.forEach((n,j)=>{if(n)return;let far=-1;points.forEach((p,i)=>{if(counts[labels[i]]>1&&(far<0||distance(p,centers[labels[i]])>distance(points[far],centers[labels[far]])))far=i});counts[labels[far]]--;labels[far]=j;counts[j]++});
 return labels;
}
function averageCenters(points,labels,k){return Array.from({length:k},(_,j)=>{const members=points.filter((_,i)=>labels[i]===j);return points[0].map((_,d)=>members.reduce((s,p)=>s+p[d],0)/members.length)})}
function run(points,centers,maxIterations=100,record=false){
 centers=copy(centers);let labels=[],iterations=0,converged=false;
 const trace=record?[{phase:'start',centers:copy(centers),labels:[],iteration:0}]:[];
 for(let n=0;n<maxIterations;n++){
  const next=repairEmpty(points,centers,assign(points,centers));
  const stable=labels.length===next.length&&next.every((v,i)=>v===labels[i]);
  if(record)trace.push({phase:stable?'stable':'assign',centers:copy(centers),labels:next.slice(),iteration:n+1});
  labels=next;iterations=n+1;
  centers=averageCenters(points,labels,centers.length);
  if(stable){converged=true;break}
  if(record)trace.push({phase:'move',centers:copy(centers),labels:labels.slice(),iteration:n+1});
 }
 return {centers,labels,iterations,converged,inertia:points.reduce((s,p,i)=>s+distance(p,centers[labels[i]]),0),trace};
}
function kmeans(points,{k=3,seed=42,starts=10,maxIterations=100}={}){
 if(!points.length||!points[0].length||points.some(p=>p.length!==points[0].length||p.some(v=>!Number.isFinite(v))))throw new Error('Use a nonempty rectangular array of finite measurements.');
 if(!Number.isInteger(k)||k<1||k>points.length||!Number.isInteger(starts)||starts<1||!Number.isInteger(maxIterations)||maxIterations<1)throw new Error('Invalid clustering settings.');
 const rng=random(seed);let best;
 for(let n=0;n<starts;n++){const result=run(points,initialCenters(points,k,rng),maxIterations);if(!best||result.inertia<best.inertia)best=result}
 // Stable display names, not ranks: each run numbers centers in increasing Length order.
 const order=best.centers.map((_,i)=>i).sort((a,b)=>best.centers[a][0]-best.centers[b][0]);
 return {...best,centers:order.map(i=>best.centers[i]),labels:best.labels.map(i=>order.indexOf(i)),starts};
}
const cache=new Map();
function rows(){return root.HIDDEN_PATTERNS_DATA}
function result(k=3,scale='standardized'){
 k=Number(k);if(!Number.isInteger(k)||k<2||k>7)throw new Error('Choose k from 2 through 7.');
 if(!['standardized','raw'].includes(scale))throw new Error('Unknown feature scaling.');
 const key=k+':'+scale;if(cache.has(key))return cache.get(key);
 const data=rows(),raw=data.map(r=>features.map(f=>r[f])),scaled=standardize(raw);
 const model=kmeans(scale==='raw'?raw:scaled.points,{k});
 const counts=Array(k).fill(0),means=Array.from({length:k},()=>[0,0,0]);
 model.labels.forEach((j,i)=>{counts[j]++;raw[i].forEach((v,d)=>means[j][d]+=v)});
 means.forEach((p,j)=>p.forEach((v,d)=>p[d]=v/counts[j]));
 const output={...model,k,scale,counts,means,raw,scaled};cache.set(key,output);return output;
}
function overlap(model){
 const species=[...new Set(rows().map(r=>r.Species))].sort();
 const counts=Array.from({length:model.k},()=>species.map(()=>0));
 rows().forEach((r,i)=>counts[model.labels[i]][species.indexOf(r.Species)]++);
 return {species,counts};
}
function countText(model){return model.counts.map((n,j)=>'C'+j+': '+n).join(' · ')}
function chartMark(x,y,key,name,details,group,visual,first=false){
 return `<g class="ml-cluster-mark" role="button" tabindex="${first?0:-1}" aria-pressed="false" aria-label="${esc(name)}" data-point="${esc(key)}" data-group="${group??''}" data-details="${esc(JSON.stringify({name,details}))}"><circle class="ml-cluster-hit" cx="${x}" cy="${y}" r="13"/><circle class="ml-cluster-selection-ring" cx="${x}" cy="${y}" r="17"/>${visual}</g>`;
}
function centerVisual(x,y,j){return `<circle class="ml-cluster-center-halo" cx="${x}" cy="${y}" r="13" fill="none" stroke="${colors[j]}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="10" fill="white" stroke="${colors[j]}" stroke-width="2"/><path d="M${x-6} ${y}h12m-6-6v12" stroke="#17322a" stroke-width="3"/><text x="${x+15}" y="${y-12}" class="ml-cluster-center-label">C${j}</text>`}
function chartLegend(labels,counts){return `<div class="ml-cluster-legend" aria-label="Highlight a group"><span class="ml-cluster-legend-heading" tabindex="0" aria-label="Legend. Hover over or focus a group to highlight its fish.">Legend<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 3 4 16 3-6 6-3Z"/><path d="m13 14 5 6M16 3v3m3-1-2 2"/></svg><span class="ml-cluster-legend-hint" role="tooltip">Hover over or focus a group to highlight its fish.</span></span>${labels.map((name,j)=>`<button class="ml-cluster-legend-button" type="button" data-highlight="${j}" aria-pressed="false"><svg viewBox="0 0 20 20" aria-hidden="true">${marker(10,10,j,5)}</svg><b>${esc(name)}</b>${counts?' '+counts[j]+' fish':''}</button>`).join('')}</div>`}
function chartFrame(graph,legend='',extra=''){
 return `<div class="ml-cluster-chart-container"><div class="ml-cluster-chart-layout" data-chart><div class="ml-cluster-chart-main">${graph}<p class="ml-cluster-chart-help">Select a fish or center to inspect it. Use arrow keys to browse fish; Enter selects.</p></div><aside class="ml-cluster-chart-side" aria-label="Chart details">${legend}<section class="ml-cluster-inspector" data-inspector role="status" aria-live="polite"><h4>Inspect the pattern</h4><p>Select a fish or center for its measurements and current group.</p></section><button class="ml-btn" type="button" data-clear-selection>Clear selection</button>${extra}</aside></div></div>`;
}
// Selection belongs to the view, never to saved course progress or review evidence.
function bindCharts(target,savedSelection){
 for(const chart of target.querySelectorAll?.('[data-chart]')||[]){
  const selection=savedSelection||{};
  const marks=Array.from(chart.querySelectorAll('[data-point]')),legends=Array.from(chart.querySelectorAll('[data-highlight]'));
  const inspector=chart.querySelector('[data-inspector]'),tooltip=chart.querySelector('[data-chart-tooltip]');
  const centersOnly=tooltip?.getAttribute?.('data-centers-only')==='true',interactive=centersOnly?marks.filter(mark=>mark.dataset.point.startsWith('center-')):marks;
  const paint=()=>{
   const selected=marks.find(mark=>mark.dataset.point===selection.key);
   if(!selected)selection.key=null;
   if(tooltip)tooltip.hidden=!selected;
   marks.forEach(mark=>{const active=mark===selected;mark.classList.toggle('selected',active);mark.classList.toggle('group-highlighted',selection.cluster!=null&&mark.dataset.group===String(selection.cluster));mark.classList.toggle('dimmed',selection.cluster!=null&&mark.dataset.group!==String(selection.cluster));mark.setAttribute('aria-pressed',String(active));mark.tabIndex=active||(!selected&&mark===interactive[0])?0:-1});
   legends.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.highlight===selection.cluster)));
   if(selected&&inspector){const info=JSON.parse(selected.dataset.details);inspector.innerHTML=`<h4>${esc(info.name)}</h4><dl>${info.details.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`}
   else if(inspector)inspector.innerHTML=selection.cluster!=null?'<h4>Group highlighted</h4><p>Other groups are dimmed, not removed. Counts still include every fish.</p>':'<h4>Inspect the pattern</h4><p>Select a fish or center for its measurements and current group.</p>';
  };
  interactive.forEach((mark,index)=>{
   if(!inspector)return;
   if(centersOnly){
    mark.setAttribute('role','button');
    mark.onpointerenter=mark.onfocus=()=>{selection.cluster=mark.dataset.group;paint()};
    mark.onpointerleave=mark.onblur=()=>{selection.cluster=null;paint()};
   }
   mark.onclick=()=>{selection.key=mark.dataset.point;selection.cluster=null;paint()};
   if(tooltip&&!centersOnly){mark.onpointerenter=mark.onfocus=mark.onclick;mark.onblur=()=>{selection.key=null;paint()}};
   mark.onkeydown=event=>{
    if(event.key==='Enter'||event.key===' '){event.preventDefault();mark.onclick();return}
    const direction=['ArrowRight','ArrowDown'].includes(event.key)?1:['ArrowLeft','ArrowUp'].includes(event.key)?-1:0;
    if(direction||event.key==='Home'||event.key==='End'){event.preventDefault();const next=interactive[event.key==='Home'?0:event.key==='End'?interactive.length-1:(index+direction+interactive.length)%interactive.length];marks.forEach(m=>m.tabIndex=-1);next.tabIndex=0;next.focus()}
    if(event.key==='Escape'){selection.key=null;selection.cluster=null;paint()}
   };
  });
  if(tooltip&&!centersOnly){chart.onpointerleave=()=>{if(!chart.contains?.(root.document?.activeElement)){selection.key=null;paint()}}}
  legends.forEach(button=>{
   if(tooltip||!inspector){const highlight=()=>{selection.key=null;selection.cluster=button.dataset.highlight;paint()},restore=()=>{selection.cluster=null;paint()};button.onpointerenter=button.onfocus=highlight;button.onpointerleave=button.onblur=restore;button.onclick=highlight;button.onkeydown=event=>{if(event.key==='Escape')restore()}}
   else button.onclick=()=>{selection.key=null;selection.cluster=selection.cluster===button.dataset.highlight?null:button.dataset.highlight;paint()};
  });
  const clear=chart.querySelector('[data-clear-selection]');if(clear)clear.onclick=()=>{selection.key=null;selection.cluster=null;paint()};paint();
 }
 return savedSelection;
}
function distanceExample(){
 const a=rows()[2],b=rows()[3],c=rows().reduce((best,r)=>r.Length>best.Length?r:best,rows()[0]);
 const selected=[a,b,c],sx=v=>58+v/65*560+(v===a.Length?-8:v===b.Length?8:0),sy=v=>264-v/20*224;
 const labels=[{x:90,y:180},{x:255,y:155},{x:545,y:105}];
 const graph=`<figure class="ml-cluster-plot"><svg viewBox="0 0 660 320" role="group" aria-label="Fish ${a.ID} and ${b.ID} have nearby Length and Height measurements. Fish ${c.ID} is much longer. Lines show two-dimensional gaps; the model also uses Width.">${[0,5,10,15,20].map(v=>`<path d="M58 ${sy(v)}H618" stroke="#dce6e1" fill="none"/><text x="49" y="${sy(v)+4}" text-anchor="end">${v}</text>`).join('')}<path d="M58 30V264H618" stroke="#61716b" fill="none"/><path class="ml-cluster-distance-line similar" d="M${sx(a.Length)} ${sy(a.Height)}L${sx(b.Length)} ${sy(b.Height)}" stroke="#1f7a46" stroke-width="4"/><path class="ml-cluster-distance-line different" d="M${sx(b.Length)} ${sy(b.Height)}L${sx(c.Length)} ${sy(c.Height)}" stroke="#3977a8" stroke-width="2" stroke-dasharray="7 5"/>${selected.map((r,i)=>chartMark(sx(r.Length),sy(r.Height),'fish-'+r.ID,'Fish '+r.ID+(r===b?' \u00b7 reference':' compared with Fish '+b.ID),features.map(f=>[f,r[f]+' cm'+(r===b?'':' \u00b7 difference '+Number(Math.abs(r[f]-b[f]).toFixed(4))+' cm')]),null,`<path d="M${sx(r.Length)} ${sy(r.Height)}L${labels[i].x} ${labels[i].y+8}" stroke="#94a69d" stroke-width="1" fill="none"/><circle cx="${sx(r.Length)}" cy="${sy(r.Height)}" r="${r===b?8:6}" fill="${r===b?'#bd5814':'#17322a'}"/><rect class="ml-cluster-hit" x="${labels[i].x-43}" y="${labels[i].y-22}" width="86" height="32" rx="5"/><text style="${r===b?'fill:#a54d16;font-weight:750':''}" x="${labels[i].x}" y="${labels[i].y}" text-anchor="middle">Fish ${r.ID}${r===b?' (reference)':''}</text>`,i===0)).join('')}<text class="ml-cluster-axis-title" x="338" y="311" text-anchor="middle">Length (cm)</text><text class="ml-cluster-axis-title" transform="translate(17 155) rotate(-90)" text-anchor="middle">Height (cm)</text></svg></figure>`;
 return `<div class="ml-cluster-chart-container ml-cluster-distance"><div class="ml-cluster-distance-chart" data-chart>${graph}<aside class="ml-cluster-distance-legend" aria-label="Distance legend"><span class="ml-cluster-legend-heading" tabindex="0" aria-label="Legend. Hover or tap a fish to compare measurements. Nearby dots are slightly separated for clarity.">Legend<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 3 4 16 3-6 6-3Z"/><path d="m13 14 5 6"/></svg><span class="ml-cluster-legend-hint" role="tooltip">Hover or tap a fish to compare measurements. Nearby dots are slightly separated for clarity.</span></span><span class="ml-cluster-distance-key"><span class="ml-cluster-line-key similar" tabindex="0"><i></i>More similar</span><span class="ml-cluster-line-key different" tabindex="0"><i></i>Less similar</span></span></aside><div class="ml-cluster-chart-tooltip" data-chart-tooltip hidden><section class="ml-cluster-inspector" data-inspector role="status" aria-live="polite"></section><button class="ml-btn" type="button" data-clear-selection>Close details</button></div></div></div>`;
}
function table(caption,headers,body){return `<div class="ml-cluster-table-wrap" tabindex="0" role="region" aria-label="${esc(caption)}"><table class="ml-cluster-table"><caption>${esc(caption)}</caption><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${body.map(row=>`<tr>${row.map((v,j)=>j?`<td>${esc(v)}</td>`:`<th scope="row">${esc(v)}</th>`).join('')}</tr>`).join('')}</tbody></table></div>`}
function summary(model){return table('Group profiles · original measurements in cm',['Cluster','Fish','Mean Length','Mean Height','Mean Width'],model.means.map((p,j)=>['C'+j,model.counts[j],...p.map(v=>v.toFixed(2))]))}
function speciesCards(model,revealed,attribute='species'){
 const groups=revealed&&attribute==='species'?overlap(model):null;
 return `<div class="ml-cluster-species-cards">${model.counts.map((count,j)=>{
  let content='<p>'+ (attribute==='weight'?'Weight':'Species')+' hidden</p>';
  if(revealed&&attribute==='weight'){
   const weights=rows().filter((_,i)=>model.labels[i]===j).map(fish=>fish.Weight);
   const mean=weights.reduce((a,b)=>a+b,0)/weights.length;
   content=`<dl><div><dt>Average weight</dt><dd>${mean.toFixed(1)} g</dd></div><div><dt>Lightest</dt><dd>${Math.min(...weights).toFixed(1)} g</dd></div><div><dt>Heaviest</dt><dd>${Math.max(...weights).toFixed(1)} g</dd></div></dl>`;
  }else if(revealed)content=`<dl>${groups.species.map((name,i)=>groups.counts[j][i]?`<div data-species="${esc(name)}" tabindex="0" aria-label="${esc(name)}: ${groups.counts[j][i]} fish in Cluster ${j}"><dt>${esc(name)}</dt><dd>${groups.counts[j][i]}</dd></div>`:'').join('')}</dl>`;
  return `<section class="ml-cluster-species-card" style="--cluster-accent:${colors[j]}"><header><h4>Cluster ${j}</h4><span>${count} fish</span></header>${content}</section>`;
 }).join('')}</div>`;
}

function investigationQuestions(attribute,revealed){
 const questions=!revealed?[
 ['Observe','What does the number of fish in each group tell you\u2014and what doesn\u2019t it tell you?','A larger group contains more fish with similar measurements in this dataset. It doesn\u2019t mean the group is more important or represents a more common species in nature.'],
 ['Predict','Do you think each group contains one species or several? Why?','Could different species have similar Length, Height, and Width?'],
 ['Plan','What would revealing species or weight help you check?','Species shows who shares a group. Weight helps you compare how heavy the fish are.']
 ]:attribute==='species'?[
 ['Find a split','Which species appear in all three groups?','Follow each species across the cards. Hover or focus a species to highlight its matches.'],
 ['Look more closely','Most Bream belong to Cluster 2. Does that make Cluster 2 a Bream group? Use the counts to explain.','Compare the 32 Bream with the 66 total fish in Cluster 2.'],
 ['Investigate an exception','Three Bream belong to Cluster 1. Which measurements would you inspect to understand why?','Compare their Length, Height, and Width with Bream in Cluster 2. Individual measurements are needed to answer this question.'],
 ['Revise','You predicted whether each group would contain one species or several. What did revealing species show?','Use a species count or a species shared across groups as evidence.']
 ]:[
 ['Spot the pattern','How do the average weights differ across groups?','Compare the three averages. Which group is lightest on average? Which is heaviest?'],
 ['Check the boundaries','Do any weight ranges overlap? What does that suggest about using weight to identify a fish\'s cluster?','Compare one group\'s heaviest fish with the next group\'s lightest fish.'],
 ['Revise','What did revealing weight add to your understanding of the groups?','Connect the weight pattern to Length, Height, and Width, which the model used to form the groups.']
 ];return questions;
}
function bindSpeciesCards(target){
 const entries=Array.from(target.querySelectorAll?.('[data-species]')||[]);
 const highlight=name=>entries.forEach(entry=>{entry.classList.toggle('species-match',entry.dataset.species===name);entry.classList.toggle('species-dimmed',name!=null&&entry.dataset.species!==name)});
 entries.forEach(entry=>{entry.onpointerenter=entry.onfocus=()=>highlight(entry.dataset.species);entry.onpointerleave=entry.onblur=()=>highlight(null);entry.onkeydown=event=>{if(event.key==='Escape')highlight(null)}});
}
function speciesTable(model){const o=overlap(model);return `<p>Read across a row to compare species within one cluster. Read down a column to see whether a species spans clusters. Counts sum to ${rows().length} fish.</p>`+table('Species revealed after clustering · counts of fish',['Cluster',...o.species,'Total'],o.counts.map((p,j)=>['C'+j,...p,model.counts[j]]))}
function marker(x,y,j,size=4){
 const shape=j%7,c=colors[j]||'#61716b';
 if(shape===1)return `<rect x="${x-size}" y="${y-size}" width="${size*2}" height="${size*2}" fill="${c}"/>`;
 if(shape===2||shape===5)return `<path d="M${x} ${y-size-1}L${x+size+1} ${y+size}H${x-size-1}Z" fill="${shape===5?'white':c}" stroke="${c}"/>`;
 if(shape===3||shape===6)return `<path d="M${x} ${y-size-1}L${x+size+1} ${y}L${x} ${y+size+1}L${x-size-1} ${y}Z" fill="${shape===6?'white':c}" stroke="${c}"/>`;
 return `<circle cx="${x}" cy="${y}" r="${size}" fill="${shape===4?'white':c}" stroke="${c}"/>`;
}
function scatter(model,{neutral=false,reveal=false,hoverLegend=false}={}){
 const sx=v=>58+v/65*560,sy=v=>264-v/20*224;
 const graph=`<figure class="ml-cluster-plot"><svg viewBox="0 0 660 320" role="group" aria-label="${rows().length} fish: Length versus Height in centimeters. ${neutral?'Species hidden; no groups shown.':model.k+' clusters, distinguished by shapes and colors. Width also affects assignments.'}">
 ${[0,5,10,15,20].map(v=>`<path d="M58 ${sy(v)}H618" stroke="#dce6e1"/><text x="49" y="${sy(v)+4}" text-anchor="end">${v}</text>`).join('')}
 ${[0,10,20,30,40,50,60].map(v=>`<text x="${sx(v)}" y="285" text-anchor="middle">${v}</text>`).join('')}
 <path d="M58 40V264H618" stroke="#61716b" fill="none"/>
 ${rows().map((r,i)=>chartMark(sx(r.Length),sy(r.Height),'fish-'+r.ID,'Fish '+r.ID,[...features.map(f=>[f,r[f]+' cm']),['Assignment',neutral?'Not assigned':'C'+model.labels[i]],...(reveal?[['Species',r.Species]]:[])],neutral?null:model.labels[i],neutral?`<circle cx="${sx(r.Length)}" cy="${sy(r.Height)}" r="3.5" fill="#61716b"/>`:marker(sx(r.Length),sy(r.Height),model.labels[i]),i===0)).join('')}
 ${neutral?'':model.means.map((p,j)=>chartMark(sx(p[0]),sy(p[1]),'center-'+j,'C'+j+' center',[...features.map((f,d)=>['Mean '+f,p[d].toFixed(2)+' cm']),['Fish',model.counts[j]]],j,centerVisual(sx(p[0]),sy(p[1]),j))).join('')}
 <text class="ml-cluster-axis-title" x="338" y="311" text-anchor="middle">Length (cm)</text><text class="ml-cluster-axis-title" transform="translate(17 155) rotate(-90)" text-anchor="middle">Height (cm)</text></svg>
 <figcaption>Each mark is one fish. ${neutral?'Only two of the three input measurements are shown.':'Groups use Length, Height, and Width; this view shows two features in original units. + marks a group average.'}</figcaption></figure>`;
 const legend=neutral?'':chartLegend(model.counts.map((_,j)=>'C'+j),model.counts);
 if(hoverLegend)return `<div class="ml-cluster-chart-container ml-cluster-hover-chart"><div class="ml-cluster-distance-chart" data-chart>${graph.replace(/ role="button" tabindex="-?\d+" aria-pressed="false"/g,'')}${legend}<div class="ml-cluster-chart-tooltip" data-chart-tooltip data-centers-only="true" hidden><section class="ml-cluster-inspector" data-inspector role="status" aria-live="polite"></section><button class="ml-btn" type="button" data-clear-selection>Close</button></div></div></div>`;
 return chartFrame(graph,legend);
}
function fullPanel(model,{neutral=false,reveal=false,profiles=false,hoverLegend=false}={}){return `${scatter(model,{neutral,reveal,hoverLegend})}${profiles?summary(model):''}${reveal?speciesTable(model):''}`}
function scatter3D(model,angle){
 const points=model.scale==='raw'?model.raw:model.scaled.points;
 const lo=features.map((_,d)=>Math.min(...points.map(p=>p[d]))),hi=features.map((_,d)=>Math.max(...points.map(p=>p[d])));
 const span=Math.max(...hi.map((v,d)=>v-lo[d]))||1;
 const project=p=>{
  const v=p.map((n,d)=>(n-(lo[d]+hi[d])/2)/span*290);
  const x=v[0]*Math.cos(angle.yaw)-v[2]*Math.sin(angle.yaw),z=v[0]*Math.sin(angle.yaw)+v[2]*Math.cos(angle.yaw);
  return [330+x,195-v[1]*Math.cos(angle.pitch)+z*Math.sin(angle.pitch),z*Math.cos(angle.pitch)+v[1]*Math.sin(angle.pitch)];
 };
 const line=(a,b,cls='')=>{const p=project(a),q=project(b);return `<path class="${cls}" d="M${p[0]} ${p[1]}L${q[0]} ${q[1]}" fill="none" stroke="#87978e" stroke-width="1"/>`};
 const axes=features.map((name,d)=>{
  const end=lo.slice();end[d]=hi[d];const label=end.slice();label[d]+=span*.09;const xy=project(label);
  return line(lo,end)+Array.from({length:5},(_,i)=>{const p=lo.slice();p[d]+=(hi[d]-lo[d])*i/4;const xy=project(p);return `<circle cx="${xy[0]}" cy="${xy[1]}" r="2" fill="#61716b"/><text class="ml-cluster-3d-tick" x="${xy[0]+5}" y="${xy[1]+14}">${p[d].toFixed(1)}</text>`}).join('')+`<text class="ml-cluster-axis-title" x="${xy[0]}" y="${xy[1]}" text-anchor="middle">${name}</text>`;
 }).join('');
 const dots=points.map((p,i)=>({p:project(p),i})).sort((a,b)=>a.p[2]-b.p[2]).map(({p,i})=>`<g class="ml-cluster-mark" data-point="fish-${rows()[i].ID}" data-group="${model.labels[i]}">${marker(p[0],p[1],model.labels[i],4)}</g>`).join('');
 return axes+dots+model.centers.map((p,j)=>{const xy=project(p);return `<g class="ml-cluster-mark" data-point="center-${j}" data-group="${j}">${centerVisual(xy[0],xy[1],j)}</g>`}).join('');
}
function threeDimensionalChart(model,angle){return `<div class="ml-cluster-chart-container ml-cluster-hover-chart"><div class="ml-cluster-distance-chart" data-chart><figure class="ml-cluster-plot"><svg data-rotate-chart viewBox="0 0 660 400" tabindex="0" role="group" aria-label="3D fish clusters. Drag to rotate, or use arrow keys. Length, Height, and Width in ${model.scale==='raw'?'centimeters':'standardized units'}.">${scatter3D(model,angle)}</svg><figcaption>${model.scale==='raw'?'All axes in centimeters.':'All axes in standardized units.'} Drag or use arrow keys to rotate.</figcaption><button class="ml-btn" type="button" data-reset-camera>Reset view</button></figure>${chartLegend(model.counts.map((_,j)=>'C'+j),model.counts)}</div></div>`}
function bindRotation(target,model,angle,selection){
 const svg=target.querySelector('[data-rotate-chart]');if(!svg)return;
 const redraw=()=>{svg.innerHTML=scatter3D(model,angle);bindCharts(target,selection)};
 let drag=null;
 svg.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();drag=[event.clientX,event.clientY];svg.setPointerCapture(event.pointerId);svg.focus()};
 svg.onpointermove=event=>{if(!drag)return;angle.yaw+=(event.clientX-drag[0])*.01;angle.pitch=Math.max(-1.2,Math.min(1.2,angle.pitch+(event.clientY-drag[1])*.01));drag=[event.clientX,event.clientY];redraw()};
 svg.onpointerup=svg.onpointercancel=svg.onlostpointercapture=()=>{drag=null};
 svg.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();angle.yaw+=event.key==='ArrowLeft'?-.12:event.key==='ArrowRight'?.12:0;angle.pitch=Math.max(-1.2,Math.min(1.2,angle.pitch+(event.key==='ArrowUp'?-.12:event.key==='ArrowDown'?.12:0)));redraw()};
 target.querySelector('[data-reset-camera]').onclick=()=>{angle.yaw=-.65;angle.pitch=.45;redraw()};
}
const toy=[[1,1],[1.5,2],[2,1],[3,2],[6,5],[7,5],[7,7],[8,6],[.7,1.6],[1.1,2.5],[1.7,.6],[2.2,1.7],[2.6,2.7],[3.2,1.2],[3.5,2.3],[1.3,3.1],[2.1,3.5],[2.8,3.2],[3.7,3.5],[4.2,2.6],[5.1,4.1],[5.5,5.3],[5.8,6.2],[6.3,4.4],[6.5,5.8],[6.1,7.1],[7.2,4.2],[7.5,5.5],[7.8,7.2],[8.3,6.4],[8.6,5.2],[6.8,6.4]];
function demo(alternate=false){return run(toy,alternate?[[1,1],[8,6]]:[[1,1],[2,1]],100,true).trace}
function toyView(frame,compact=false,showCenters=true){
 const sx=v=>52+v*62,sy=v=>266-v*29;
 const text=showCenters?{start:'Start: two chosen centers. No assignments yet.',assign:'Assign: each fish joins its nearest center. The centers stay still.',move:'Move: each center moves to the average of its assigned fish. The fish stay still.',stable:'Stable: assignments did not change. These centers summarize the groups.'}[frame.phase]:'Place centers A and B to begin.';
 let graph=`<div class="ml-cluster-heading"><span>ILLUSTRATIVE EXAMPLE · ${toy.length} FISH · 2 FEATURES</span><strong>${esc(text)}</strong></div><svg class="ml-cluster-demo" viewBox="0 0 660 310" role="group" aria-label="${esc(text)} ${toy.length} fixed fish${showCenters?', with two group centers':'; no centers placed yet'}."><path d="M52 25V266H622" fill="none" stroke="#61716b"/>${toy.map((p,i)=>`${frame.labels.length?`<path d="M${sx(p[0])} ${sy(p[1])}L${sx(frame.centers[frame.labels[i]][0])} ${sy(frame.centers[frame.labels[i]][1])}" stroke="${colors[frame.labels[i]]}" stroke-dasharray="4 4" opacity=".55"/>`:''}${chartMark(sx(p[0]),sy(p[1]),'fish-'+i,'Example fish '+(i+1),[['Example Length',p[0]],['Example Height',p[1]],['Units','Illustrative, arbitrary units'],['Assignment',frame.labels.length?(frame.labels[i]===0?'A':'B'):'Not assigned']],frame.labels[i],marker(sx(p[0]),sy(p[1]),frame.labels[i]??-1,6)+`<circle class="ml-cluster-hit" cx="${sx(p[0])-15}" cy="${sy(p[1])+20}" r="11"/>${compact?String():`<text x="${sx(p[0])-12}" y="${sy(p[1])+23}" text-anchor="end">${i+1}</text>`}`,i===0)}`).join('')}${(showCenters?frame.centers:[]).map((p,j)=>chartMark(sx(p[0]),sy(p[1]),'center-'+j,'Center '+(j===0?'A':'B'),[['Example Length',p[0].toFixed(2)],['Example Height',p[1].toFixed(2)],['Units','Illustrative, arbitrary units'],['Phase',frame.phase]],j,compact?centerVisual(sx(p[0]),sy(p[1]),j).replace(/<path[^>]*\/>/,'').replace(/<text[^>]*>C\d<\/text>/,`<text x="${sx(p[0])}" y="${sy(p[1])+4.5}" text-anchor="middle" style="font-size:13px;font-weight:800;stroke:none">${j===0?'A':'B'}</text>`):`<rect x="${sx(p[0])-12}" y="${sy(p[1])-12}" width="24" height="24" rx="6" fill="white" stroke="${colors[j]}" stroke-width="2"/><text x="${sx(p[0])}" y="${sy(p[1])+4}" text-anchor="middle">${j===0?'A':'B'}</text>`)).join('')}<text class="ml-cluster-axis-title" x="338" y="299" text-anchor="middle">Example Length (arbitrary units)</text><text class="ml-cluster-axis-title" transform="translate(18 146) rotate(-90)" text-anchor="middle">Example Height</text></svg>`;
 if(compact){
  graph=graph.replace(/<div class="ml-cluster-heading">[\s\S]*?<\/div>/,'');
  graph=graph.replace('<path d="M52 25V266H622"', [0,2,4,6,8].map(v=>`<path d="M52 ${sy(v)}H622" stroke="#dce6e1" fill="none"/><text x="43" y="${sy(v)+4}" text-anchor="end">${v}</text>`).join('')+'<path d="M52 25V266H622"');
  return `<div class="ml-cluster-chart-container ml-cluster-hover-chart"><div class="ml-cluster-distance-chart" data-chart><figure class="ml-cluster-plot">${graph}</figure><div class="ml-cluster-chart-tooltip" data-chart-tooltip hidden><section class="ml-cluster-inspector" data-inspector role="status" aria-live="polite"></section></div></div></div>`;
 }
 return chartFrame(graph,chartLegend(['A','B']),`<div class="ml-cluster-heading"><span>ILLUSTRATIVE EXAMPLE &middot; ${toy.length} FISH &middot; 2 FEATURES</span><strong>${esc(text)}</strong></div><p>Centers A and B are the outlined boxes. Circles join A; squares join B. ${frame.iteration?'Iteration '+frame.iteration+'. ':''}This small teaching example uses two features, not the 159-fish analysis.</p>`);
}
function scaleButtons(){return '<div class="ml-cluster-header-controls"><fieldset class="ml-cluster-scale-buttons"><legend>Feature scaling</legend><div><label><input type="radio" name="learn-feature-scale" value="raw" data-learn-scale checked><span>Raw measurements</span></label><label><input type="radio" name="learn-feature-scale" value="standardized" data-learn-scale><span>Standardized</span></label></div></fieldset><fieldset class="ml-cluster-scale-buttons"><legend>Chart view</legend><div><label><input type="radio" name="learn-chart-view" value="2d" data-learn-view checked><span>2D</span></label><label><input type="radio" name="learn-chart-view" value="3d" data-learn-view><span>3D</span></label></div></fieldset></div>'}
function scaleControl(value){return `<label class="ml-cluster-control">Feature scaling <select data-cluster-control="scale"><option value="standardized" ${value==='standardized'?'selected':''}>Standardized</option><option value="raw" ${value==='raw'?'selected':''}>Raw measurements</option></select></label>`}
function kControl(value){return `<label class="ml-cluster-control">Number of clusters (k) <select data-cluster-control="k">${[2,3,4,5,6,7].map(k=>`<option ${k===Number(value)?'selected':''}>${k}</option>`).join('')}</select></label>`}
function scaleTable(){const s=result().scaled;return table('Feature spread before and after standardization',['Feature','Original standard deviation (cm)','Standardized standard deviation (unitless)'],features.map((f,j)=>[f,s.spread[j].toFixed(2),'1.00']))+'<p class="ml-cluster-footnote"><strong>1.00 describes the spread, not every fish.</strong> Standardization subtracts each feature’s mean and divides by its standard deviation. The transformed values vary above and below zero, with mean 0 and standard deviation 1.</p>'}
function comparison(model){const base=result();return `<div class="ml-cluster-baseline"><strong>Baseline · standardized · k=3</strong><span>${countText(base)}</span><strong>Current · ${model.scale} · k=${model.k}</strong><span>${countText(model)}</span></div><p>Compare the whole grouping. Matching cluster numbers across runs do not guarantee matching members.</p>`}
function introModel(){
 const neighborhoods=[{center:[371,196],points:[[350,179],[350,211],[383,220]]},{center:[444,190],points:[[421,171],[467,175],[466,214]]},{center:[422,253],points:[[397,245],[437,268],[463,246]]}];
 return `<g class="ml-cluster-model" role="img" aria-label="Illustrative K-means model: measurement points connect to three learned group centers. Assign fish, update centers, repeat."><rect class="ml-cluster-model-case" x="326" y="96" width="176" height="230" rx="22" fill="url(#cluster-model-glass)" stroke="#246e91" stroke-width="3"/>
 <path d="M341 125v-10a5 5 0 0 1 5-5h12m112 0h12a5 5 0 0 1 5 5v10M341 299v10a5 5 0 0 0 5 5h12m112 0h12a5 5 0 0 0 5-5v-10" fill="none" stroke="#83bcd0" stroke-width="1.5"/>
 <text class="ml-cluster-model-eyebrow" x="414" y="120" text-anchor="middle">UNSUPERVISED MODEL</text><text class="ml-cluster-gate-title" x="414" y="145" text-anchor="middle">K-MEANS</text>
 <rect x="340" y="157" width="148" height="124" rx="12" fill="#f6fcff" stroke="#c6e1e9"/>
 <path d="M350 180H478M350 204H478M350 228H478M350 252H478M362 168V270M388 168V270M414 168V270M440 168V270M466 168V270" fill="none" stroke="#e2eff3"/>
 ${neighborhoods.map(({center:[x,y],points},j)=>`<g style="--node-color:${colors[j]};--node-delay:${j*-.7}s"><circle class="ml-cluster-model-halo" cx="${x}" cy="${y}" r="24"/>${points.map(([px,py])=>`<path class="ml-cluster-model-link" d="M${px} ${py}L${x} ${y}"/><path class="ml-cluster-model-signal" d="M${px} ${py}L${x} ${y}"/><circle class="ml-cluster-model-point" cx="${px}" cy="${py}" r="3.5"/>`).join('')}<rect class="ml-cluster-model-center" x="${x-5}" y="${y-5}" width="10" height="10" rx="3"/></g>`).join('')}
 <text class="ml-cluster-model-cycle" x="414" y="297" text-anchor="middle">ASSIGN · UPDATE · REPEAT</text><text class="ml-cluster-model-inputs" x="414" y="314" text-anchor="middle">Length · Height · Width</text></g>`;
}
function swimmingIntro(){
 // Synthetic measurements make a readable opening illustration, separate from Fish.csv.
 const measurements=[[40,16,6],[45,18,7],[48,17,7],[66,25,11],[70,28,12],[74,27,12],[88,35,17],[94,36,18],[100,40,19]];
 const groups=kmeans(standardize(measurements).points,{k:3}).labels,slots=[0,0,0];
 const order=[3,0,6,1,7,4,8,5,2];
 // Repeat the nine examples so arrivals overlap with fish receding inside each group.
 const stream=Array.from({length:27},(_,i)=>order[i%order.length]);
 const fish=stream.map((row,i)=>{
  const group=groups[row],slot=slots[group]++,endX=602+(slot%3)*78,endY=116+group*110+Math.floor(slot/3)*10;
  return `<g class="ml-cluster-swimmer${i>=order.length?' ml-cluster-stream-copy':''}" data-intro-group="${group}" style="--from-x:-80px;--from-y:${100+Math.floor(i/3)*104}px;--to-x:${endX}px;--to-y:${endY}px;--depth-x:${endX+18}px;--depth-y:${endY-3}px;--swim-delay:${-i*24/stream.length}s;--group-color:${colors[group]}"><g transform="scale(${measurements[row][0]/140} ${measurements[row][1]/50})"><g class="ml-cluster-fish-tail"><path d="M-26 0L-66-24-59 0-66 24Z"/></g><path class="ml-cluster-fish-fin" d="M-8 9L12 36 23 13Z"/><ellipse class="ml-cluster-fish-body" cx="0" cy="0" rx="48" ry="23"/><path d="M-30-10Q-8-27 23-12" fill="none" stroke="white" stroke-opacity=".7" stroke-width="5" stroke-linecap="round"/><circle cx="28" cy="-5" r="7" fill="white"/><circle cx="30" cy="-5" r="3" fill="#083c5c"/><path d="M36 7q6 4 10-1" fill="none" stroke="#083c5c" stroke-width="2"/></g></g>`;
 }).join('');
 return `<div class="ml-cluster-intro"><div class="ml-cluster-aquarium-scroll" tabindex="0" role="region" aria-label="Swimming fish clustering illustration"><svg class="ml-cluster-aquarium" viewBox="0 0 900 440" role="img" aria-label="A continuous stream repeats nine example fish with species hidden. Fish gather inside their assigned cluster, then shrink and fade into the distance as more arrive. K-means uses Length, Height, and Width to assign them to three clusters around learned centers. Fish take their group color only after assignment.">
 <defs><linearGradient id="cluster-ocean" x2="0" y2="1"><stop stop-color="#73d4f2"/><stop offset="1" stop-color="#168bc5"/></linearGradient><linearGradient id="cluster-sand" x2="0" y2="1"><stop stop-color="#f5d787"/><stop offset="1" stop-color="#dcae47"/></linearGradient><linearGradient id="cluster-model-glass" x2="1" y2="1"><stop stop-color="#f9feff"/><stop offset="1" stop-color="#d9f5ff"/></linearGradient></defs>
 <rect width="900" height="440" rx="20" fill="url(#cluster-ocean)"/>
 <g aria-hidden="true"><path class="ml-cluster-water-shine" d="M80 0L0 370H45L150 0M280 0L110 375H155L350 0M570 0L410 390H458L630 0M860 0L700 390H748L920 0" fill="white" opacity=".1"/>
 ${[0,1,2,3,4,5,6,7].map(i=>`<circle class="ml-cluster-intro-bubble" cx="${32+i*117}" cy="370" r="${4+i%3*2}" style="--bubble-delay:${i*.3}s" fill="none" stroke="white" stroke-opacity=".5" stroke-width="2"/>`).join('')}
 <path d="M0 385Q45 360 95 382T220 380T345 384T470 380T595 384T720 380T845 382L900 378V440H0Z" fill="url(#cluster-sand)"/>
 ${[35,76,315,506,851].map((x,i)=>`<path class="ml-cluster-seagrass" style="transform-origin:${x}px 387px;--grass-delay:${i*-.45}s" d="M${x} 387q-16-27 0-61q13 21 0 61m0 0q15-30 25-36q3 28-25 36" fill="#15965e" opacity=".85"/>`).join('')}</g>
 <path d="M297 216H319m-9-8 9 8-9 8M509 216H528m-9-8 9 8-9 8" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
 ${[0,1,2].map(j=>`<g><rect x="536" y="${76+j*110}" width="300" height="86" rx="38" fill="white" fill-opacity=".82" stroke="${colors[j]}" stroke-width="2" stroke-dasharray="${j===0?'none':j===1?'8 5':'2 5'}"/><text class="ml-cluster-group-label" x="556" y="${96+j*110}">Cluster ${j}</text><g class="ml-cluster-intro-center"><path d="M${680} ${139+j*110}h12m-6-6v12" stroke="${colors[j]}" stroke-width="3"/><text x="701" y="${143+j*110}">center</text></g></g>`).join('')}
 ${fish}
 ${introModel()}
 <text class="ml-cluster-water-footer" x="24" y="419" text-anchor="start">Swim in → find similar measurements → investigate the groups</text>
 </svg></div></div>`;
}
function introExplanation(){
 const icon=paths=>'<svg class="ml-cluster-card-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+paths+'</svg>';
 return `<section class="ml-cluster-feature-story" aria-label="Measurements define similarity"><div class="ml-cluster-feature-art"><svg viewBox="0 0 300 170" role="img" aria-label="Fish measurements: Length along the body, Height vertically, and Width across the body in an end view.">
 <ellipse cx="136" cy="77" rx="100" ry="61" fill="#e0f0ec"/><path d="M68 73 28 47 35 77 28 103 68 82" fill="#5b9da6" stroke="#315b78" stroke-width="2"/><ellipse cx="137" cy="77" rx="78" ry="35" fill="#8fc9cf" stroke="#315b78" stroke-width="2"/><path d="m117 48 20-22 19 20m-44 59 23 21 18-17" fill="#5b9da6" stroke="#315b78" stroke-width="2"/><path d="M87 65q44-27 91-7" fill="none" stroke="white" stroke-opacity=".65" stroke-width="5" stroke-linecap="round"/><circle cx="187" cy="69" r="7" fill="white"/><circle cx="189" cy="69" r="3" fill="#17322a"/>
 <path d="M61 119v14m154-14v14M61 127h154m-148-4-6 4 6 4m142-8 6 4-6 4" fill="none" stroke="#1f7a46" stroke-width="1.8"/><text x="138" y="151" text-anchor="middle">Length</text><path d="M220 42h14m-14 70h14M228 42v70m-4-64 4-6 4 6m-8 58 4 6 4-6" fill="none" stroke="#3977a8" stroke-width="1.8"/><text x="248" y="32" text-anchor="middle">Height</text><ellipse cx="268" cy="89" rx="13" ry="26" fill="#c7dfe5" stroke="#315b78" stroke-width="1.5"/><path d="M253 121h30m-26-4-4 4 4 4m22-8 4 4-4 4" fill="none" stroke="#bd5814" stroke-width="1.8"/><text x="268" y="151" text-anchor="middle">Width</text></svg></div>
 <div class="ml-cluster-feature-copy"><span class="ml-cluster-overline">START WITH THE FEATURES</span><h3>What makes two fish similar?</h3><p>Here, the model compares <b>Length, Height, and Width</b>. These features describe size and shape. Species names are held aside.</p><div class="ml-cluster-feature-tags"><span>Length</span><span>Height</span><span>Width</span></div></div></section>
 <div class="ml-cluster-cards ml-cluster-overview-steps">
 <article>${icon('<path d="M4 6h7m4 0h5M4 12h2m4 0h10M4 18h10m4 0h2"/><circle cx="13" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>')}<span class="ml-cluster-step-number">01</span><span>PEOPLE CHOOSE</span><strong>Choose the clues</strong><p>Decide which measurements to compare and how many groups to try.</p><svg class="ml-cluster-card-sketch" viewBox="0 0 220 70" aria-hidden="true" focusable="false"><rect x="20" y="7" width="180" height="56" rx="8" fill="white" stroke="currentColor" stroke-opacity=".2"/><path d="M38 22h65m-65 13h114m-114 13h87" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="m167 34 7 7 13-16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><small>People define similarity.</small></article>
 <article>${icon('<circle cx="6" cy="7" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="8" cy="18" r="2"/><circle cx="18" cy="17" r="2"/><path d="M3 12c-4-11 10-13 10-5s-10 13-10 5Zm12 0c-3-11 10-10 7-2s-10 14-7 2Z"/>')}<span class="ml-cluster-step-number">02</span><span>MODEL LEARNS</span><strong>Find similar fish</strong><p>K-means finds groups and their average measurements, without correct group labels.</p><svg class="ml-cluster-card-sketch" viewBox="0 0 220 70" aria-hidden="true" focusable="false"><g fill="white" fill-opacity=".6" stroke="currentColor" stroke-dasharray="4 3"><ellipse cx="44" cy="33" rx="29" ry="24"/><ellipse cx="113" cy="38" rx="29" ry="23"/><ellipse cx="180" cy="30" rx="27" ry="24"/></g><g fill="currentColor"><circle cx="32" cy="30" r="4"/><circle cx="48" cy="22" r="4"/><circle cx="49" cy="43" r="4"/><circle cx="101" cy="33" r="4"/><circle cx="120" cy="29" r="4"/><circle cx="115" cy="49" r="4"/><circle cx="169" cy="21" r="4"/><circle cx="189" cy="28" r="4"/><circle cx="176" cy="41" r="4"/></g></svg><small>The grouping comes from the data.</small></article>
 <article>${icon('<circle cx="10" cy="10" r="6"/><path d="m14.5 14.5 6 6M7 11l2-3 2 4 2-3"/>')}<span class="ml-cluster-step-number">03</span><span>PEOPLE INTERPRET</span><strong>Explain the pattern</strong><p>Describe how the groups differ. Decide what the evidence supports—and what it does not.</p><svg class="ml-cluster-card-sketch" viewBox="0 0 220 70" aria-hidden="true" focusable="false"><rect x="61" y="5" width="67" height="59" rx="8" fill="white" stroke="currentColor" stroke-opacity=".3"/><path d="M74 20h40M74 30h25M74 40h19" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".55"/><circle cx="139" cy="31" r="19" fill="white" fill-opacity=".85" stroke="currentColor" stroke-width="3"/><path d="m153 46 13 13m-36-27 7 6 13-16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><small>People give the groups meaning.</small></article></div>
 <div class="ml-cluster-overview-takeaway"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><p><strong>Similar measurements do not guarantee the same species.</strong> Two different species can belong to the same cluster.</p></div>`;
}
function inputExplanation(){
 const fish=rows()[0];
 const icon=paths=>'<svg class="ml-cluster-input-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">'+paths+'</svg>';
 return `<div class="ml-cluster-input-flow">
 <section class="ml-cluster-input-panel">${icon('<rect x="8" y="7" width="32" height="34" rx="5"/><path d="M8 18h32M19 18v23M29 18v23M8 29h32"/>')}<span class="ml-cluster-input-label">1 · INPUTS</span><h3>Use three measurements</h3><p>Each fish becomes three numbers. These are the <b>features</b> the model compares.</p><dl class="ml-cluster-measurements"><div><dt>Length</dt><dd>${esc(fish.Length)} cm</dd></div><div><dt>Height</dt><dd>${esc(fish.Height)} cm</dd></div><div><dt>Width</dt><dd>${esc(fish.Width)} cm</dd></div></dl><small>Actual measurements from fish ${esc(fish.ID)} in Fish.csv.</small></section>
 <section class="ml-cluster-input-panel">${icon('<rect x="10" y="10" width="28" height="28" rx="6"/><path d="M17 3v7m14-7v7M17 38v7m14-7v7M3 17h7m-7 14h7m28-14h7m-7 14h7"/><circle cx="19" cy="20" r="3"/><circle cx="30" cy="27" r="3"/><path d="m21 22 7 3"/>')}<span class="ml-cluster-input-label">2 · LEARNING</span><h3>Find a grouping</h3><p>People choose the features and the number of groups, <b>k</b>. K-means learns the group centers and assigns fish to them.</p><div class="ml-cluster-input-note"><b>No answer column</b><span>The model never receives a correct species or group for each fish.</span></div></section>
 <section class="ml-cluster-input-panel">${icon('<ellipse cx="16" cy="17" rx="11" ry="10"/><ellipse cx="33" cy="33" rx="11" ry="10"/><circle cx="12" cy="15" r="2"/><circle cx="20" cy="19" r="2"/><circle cx="29" cy="31" r="2"/><circle cx="37" cy="35" r="2"/>')}<span class="ml-cluster-input-label">3 · OUTPUTS</span><h3>Receive group numbers</h3><p>Each fish gets a cluster number. A number identifies a group of similar measurements; it is <b>not a species name</b>.</p><div class="ml-cluster-input-note"><b>Numbers are labels</b><span>Cluster 0 is not a score, a rank, or a better fish.</span></div></section></div>
 <aside class="ml-cluster-held-aside">${icon('<path d="M5 15h15l4 5h19v20H5Z"/><path d="M9 15V8h27v12M15 8V4h25v16M17 29h14"/>')}<div><h3>Species, Weight, and ID are not clustering inputs.</h3><p>These columns are in the dataset, but the model uses only <b>Length, Height, and Width</b>. <b>Species:</b> used later to compare known categories with the learned groups. <b>Weight:</b> outside this lab’s three chosen features. <b>ID:</b> identifies a row, not a fish’s size or shape.</p></div></aside>
 <div class="ml-cluster-task-contrast"><section><span class="ml-cluster-input-label">THIS LAB · UNSUPERVISED</span><h3>Discover groups</h3><p><b>Measurements → cluster number</b><br>No known answers are supplied during learning.</p></section><section><span class="ml-cluster-input-label">A DIFFERENT TASK · SUPERVISED</span><h3>Predict a known answer</h3><p>Train with measurements <b>and known weights or species</b>, then predict weight or species for another fish.</p></section></div>`;
}
// Later lessons reuse the visual sequence established by the overview and inputs.
function lessonPresentation(kind,body){
 const lessons={
  'cluster-distance':{
   cards:[['COMPARE','Start with measurements','Each point is one fish, described by Length, Height, and Width.','measure'],['MEASURE','Look at the gap','A shorter distance means the selected measurements are more alike.','distance'],['INTERPRET','Check all three features','Nearby points on this chart can still differ in Width.','inspect']],
   activity:'Which fish is more similar to Fish 4?',prompt:'Compare three real fish with species names held aside. Use Fish 4 as the reference: its gap to Fish 3 is short; its gap to Fish 159 is long.',takeaway:'Similarity depends on the features.',detail:'Size and shape do not tell us habitat, behavior, or genetic relationships.'},
  'cluster-scaling':{
   cards:[['RAW FEATURES','Bigger differences matter','Length differs more than Width, so it can affect the groups more before scaling.','measure'],['STANDARDIZE','Make scales comparable','Put the measurements on comparable scales so a bigger range of numbers does not give one feature more influence.','scale'],['COMPARE','Watch the groups change','Use the same fish and k=3 to investigate the effect of scaling alone.','inspect']],
   activity:'Try both measurement scales',prompt:'Switch between standardized and raw measurements. Compare the cluster counts.',takeaway:'Scaling changes what “nearby” means.',detail:'It puts features on comparable scales; it does not decide which features matter most.'},
  'cluster-centers':{
   cards:[['PEOPLE CHOOSE','Set the number of groups','Choose how many groups to find. Here, k = 2.','groups'],['STARTING POINTS','Place the first centers','Give each group a starting center, A or B.','centers'],['MODEL LEARNS','Let the centers move','Fish join a nearby center, then the centers move.','move']],
   activity:'Try a different start',prompt:'Follow the steps in order. Each step unlocks the next.',takeaway:'Starting points can change the groups.',detail:'The fish stay still; the centers move.'},
  'cluster-steps':{
   cards:[['01 · ASSIGN','Find the nearest center','Each fish joins the group whose center is closest.','distance'],['02 · MOVE','Average each group','Move each center to the average of its assigned fish.','move'],['03 · REPEAT','Check for stability','Repeat until the assignments stop changing.','repeat']],
   activity:'Step through the learning loop',prompt:'Use the highlighted button to alternate between assigning points and moving centers.',takeaway:'The fish stay fixed. The centers learn.',detail:'Group membership can change as the centers move; the original measurements do not.'},
  'cluster-choice':{
   cards:[['HOLD STEADY','Keep the same fish','Use the same measurements and standardization for every comparison.','measure'],['CHANGE k','Request another partition','Try k=2, k=3, and k=5 to compare broader and finer groups.','groups'],['INTERPRET','Look beyond the count','More groups do not prove that there are more natural categories.','inspect']],
   activity:'Compare different values of k',prompt:'Change the number of clusters. Look for changes in membership and group size.',takeaway:'People request k; the model does not discover it.',detail:'K-means favors compact groups and can miss curved, uneven, or overlapping patterns.'},
  'cluster-species':{
   cards:[['LEARN FIRST','Keep the groups fixed','The model has already grouped fish using only measurements.','groups'],['REVEAL','Bring back more clues','Compare species or weight, which were held aside during learning.','reveal'],['COMPARE','See what groups share','Look for shared species or compare the weights within each group.','inspect']],
   activity:'What do the groups have in common?',prompt:'Predict, reveal, compare, and revise. Follow the questions below the groups.',takeaway:'Revealing more information does not change the groups.',detail:'Species and Weight were held aside during learning.'},
  'cluster-claim':{
   cards:[['DESCRIBE','Name the pattern','Use group counts and average measurements to describe the fish.','measure'],['LIMIT THE CLAIM','Separate groups from species','A cluster number is an identifier, not a biological explanation.','inspect'],['INVESTIGATE','Take it to the notebook','Compare choices, inspect the evidence, and explain what you found.','reveal']],
   activity:'Build an evidence-based conclusion',prompt:'What pattern did the model discover? Support your claim with one measurement or weight finding and one species finding. Explain one thing these clusters cannot establish.',takeaway:'A useful pattern still needs interpretation.',detail:'Explain what the measurements support and what would be an overclaim.'}
 };
 const lesson=lessons[kind];if(!lesson)return body;
 const drawings={
  measure:'<path d="M5 7h14M5 12h10M5 17h6M5 5v4m7-4v4m7-4v4"/>',
  distance:'<circle cx="5" cy="16" r="2"/><circle cx="19" cy="6" r="2"/><path d="m8 14 8-6M9 5h6m0 0v6"/>',
  inspect:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6m-14-11 2 2 4-4"/>',
  scale:'<path d="M5 4v16m14-16v16M2 7h6m8 10h6M10 12h4m-2-2v4"/>',
  groups:'<ellipse cx="7" cy="8" rx="5" ry="6"/><ellipse cx="17" cy="16" rx="5" ry="6"/><path d="M5 7h4m-2-2v4m8 7h4m-2-2v4"/>',
  centers:'<path d="M3 7h8M7 3v8m6 6h8m-4-4v8"/><circle cx="7" cy="7" r="5"/><circle cx="17" cy="17" r="5"/>',
  move:'<circle cx="5" cy="17" r="3"/><path d="m9 13 9-9m-7 0h7v7M14 19h7m-3.5-3.5v7"/>',
  repeat:'<path d="M4 10a8 8 0 0 1 14-5l3 3m0-6v6h-6M20 14a8 8 0 0 1-14 5l-3-3m0 6v-6h6"/>',
  reveal:'<path d="M3 7h7l3 3h8v10H3ZM6 7V3h12v7m-11 5h10"/>'
 };
 const cards=lesson.cards.map(([label,title,copy,icon])=>`<section class="ml-cluster-input-panel"><svg class="ml-cluster-input-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${drawings[icon]}</svg><span class="ml-cluster-input-label">${esc(label)}</span><h3>${esc(title)}</h3><p>${esc(copy)}</p></section>`).join('');
 return `<div class="ml-cluster-input-flow ml-cluster-lesson-flow">${cards}</div><section class="ml-cluster-activity" aria-label="${esc(lesson.activity)}"><header class="ml-cluster-activity-head"><span class="ml-cluster-overline">LOOK CLOSER</span><h3>${esc(lesson.activity)}</h3><p>${esc(lesson.prompt)}</p>${kind==='cluster-scaling'?scaleButtons():kind==='cluster-choice'?`<div class="ml-cluster-k-header">${kControl(3)}</div>`:''}</header>${body}</section><div class="ml-cluster-overview-takeaway"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><p><strong>${esc(lesson.takeaway)}</strong>${esc(lesson.detail)}</p></div>`;
}
function scene(s){
 if(s.kind==='cluster-intro')return `<div class="ml-cluster-card ml-cluster-opening">${swimmingIntro()}</div>`;
 const model=result();let body='';
 if(s.kind==='cluster-overview')body=introExplanation();
 else if(s.kind==='cluster-inputs')body=inputExplanation();
 else if(s.kind==='cluster-distance')body=distanceExample();
 else if(s.kind==='cluster-scaling')body='<p class="ml-cluster-footnote ml-cluster-scaling-tip"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z"/></svg><span data-scaling-explanation role="status" aria-live="polite"><strong>Raw measurements:</strong> distances use the original centimeters. <strong>Length</strong> varies more than <strong>Width</strong>, so it can have more influence on the groups.</span></p><div data-cluster-live></div>';
 else if(s.kind==='cluster-choice')body='<div data-cluster-live></div>';
 else if(s.kind==='cluster-centers')body=`<div class="ml-cluster-step-message"><svg data-step-icon viewBox="0 0 24 24" aria-hidden="true" focusable="false"></svg><p data-cluster-status role="status" aria-live="polite"></p></div><div class="ml-cluster-guided-layout"><aside class="ml-cluster-guided-rail" aria-label="Learning steps">${[['Place centers','Reveal A and B.'],['Assign fish','Join the nearest center.'],['Move centers','Find each group\u2019s middle.'],['Repeat','Watch the groups settle.']].map(([title,copy],i)=>`${i===3?'<div class="ml-cluster-repeat-row">':String()}<button type="button" class="ml-cluster-guided-step" data-guided-step="${i}" ${i?'disabled':''}><span>${i+1}</span><strong>${title}</strong></button>${i===3?'<div class="ml-cluster-repeat-controls" data-repeat-controls hidden><button class="ml-btn" data-cluster-action="next" type="button" title="Next update" aria-label="Next update">Next</button><button class="ml-btn" data-cluster-action="play" type="button" aria-pressed="false">Play</button></div></div>':String()}`).join('')}<div class="ml-cluster-guided-tools"><button class="ml-btn" data-cluster-action="alternate" type="button">Change starting centers</button><button class="ml-btn" data-cluster-action="restart" type="button">Reset</button></div></aside><div class="ml-cluster-guided-chart"><div data-cluster-live></div></div></div>`;
 else if(s.kind==='cluster-steps')body=`<div class="ml-actions"><button class="ml-btn" data-cluster-action="restart" type="button">Reset</button><button class="ml-btn" data-cluster-action="back" type="button">Back</button><button class="ml-btn" data-cluster-action="play" type="button" aria-pressed="false">Play</button><button class="ml-btn" data-cluster-action="alternate" type="button">Try different starting centers</button><button class="ml-btn primary" data-cluster-action="step" type="button">Assign fish →</button></div><div data-cluster-live></div><p data-cluster-status role="status" aria-live="polite"></p>`;
 else if(s.kind==='cluster-species')body='<div class="ml-cluster-reveal-controls"><fieldset class="ml-cluster-scale-buttons"><legend>Compare by</legend><div><label><input type="radio" name="cluster-attribute" value="species" data-cluster-attribute checked><span>Species</span></label><label><input type="radio" name="cluster-attribute" value="weight" data-cluster-attribute><span>Weight</span></label></div></fieldset><button class="ml-btn primary" data-cluster-control="reveal" type="button" aria-pressed="false">Reveal species</button></div><p class="ml-cluster-footnote" data-attribute-explanation></p><div data-cluster-live></div><section class="ml-cluster-investigation" data-investigation aria-label="Guided investigation"></section>';
 else body=`<section class="ml-claim-response" aria-label="Make a careful claim"><h3>What pattern did the model discover?</h3><div class="ml-claim-prompts"><article class="ml-claim-prompt" style="--claim-accent:#397447;--claim-tint:#edf5ef"><h4><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4Z"/><path d="M8 9h8m-8 3h5"/></svg>Claim</h4><p>Do the groups separate fish by size, by species, or both?</p><p class="ml-claim-answer">The groups reflect differences in fish size rather than a clean separation by species.</p></article><article class="ml-claim-prompt" style="--claim-accent:#355f99;--claim-tint:#eff4fb"><h4><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6m-14-11 2 2 4-4"/></svg>Evidence</h4><p>How do the average weights differ across the three groups?</p><p>What does finding Perch in all three groups tell you?</p><p class="ml-claim-answer"><strong>Weight evidence:</strong> Average weights increase from 23.2 g to 185.7 g to 752.5 g.</p><p><strong>Species evidence:</strong> Perch appear in all three groups, showing that the clusters do not correspond directly to species.</p></article><article class="ml-claim-prompt" style="--claim-accent:#925014;--claim-tint:#fff6e9"><h4><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 10 18H2Z"/><path d="M12 9v5m0 3v.1"/></svg>Limit</h4><p>Do these groups prove that the fish are different species or explain why their sizes differ?</p><p class="ml-claim-answer">The clusters do not establish new species or explain why the fish differ.</p></article></div></section><details class="ml-cluster-claim-evidence"><summary><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4ZM4 10h16M10 4v16"/></svg>Review the evidence<span aria-hidden="true" class="ml-claim-chevron">+</span></summary><div><fieldset class="ml-cluster-scale-buttons"><legend>Compare by</legend><div><label><input type="radio" name="claim-attribute" value="species" data-claim-attribute checked><span>Species</span></label><label><input type="radio" name="claim-attribute" value="weight" data-claim-attribute><span>Weight</span></label></div></fieldset><p class="ml-cluster-footnote" data-claim-explanation>Look for shared species across groups. Species names were not used to form the groups.</p><div data-claim-clusters>${speciesCards(model,true)}</div></div></details>`;

 if(s.kind==='cluster-claim')body=body.replace(/<article class="ml-claim-prompt"([^>]*)>([\s\S]*?)<p class="ml-claim-answer">([\s\S]*?)<\/p><\/article>/g,(_,attrs,prompt,answer)=>'<details class="ml-claim-prompt"'+attrs+'><summary>'+prompt+'<span class="ml-claim-reveal-label">Reveal a sample answer</span></summary><div class="ml-claim-answer"><strong>Sample answer</strong><p>'+answer+'</p></div></details>');
 const presented=s.kind==='cluster-claim'?body:lessonPresentation(s.kind,body);
 return `<div class="ml-visual-card ml-cluster-card${s.kind==='cluster-overview'?' ml-cluster-overview':''}${presented!==body?' ml-cluster-lesson':''}${s.kind==='cluster-centers'?' ml-cluster-centers-scene':''}"><div class="ml-loan-heading ml-cluster-scene-heading"><span>${esc(s.cardKicker)}</span><strong>${esc(s.cardTitle)}</strong></div>${presented}${s.definition?`<div class="ml-definition"><strong>${esc(s.definition.term)}:</strong> ${esc(s.definition.text)}</div>`:""}</div>`;
}
let disposeLearn=()=>{};
const reviewSelections=new WeakMap();
function resetModelSelection(selection){if(selection.key?.startsWith('center-'))selection.key=null;selection.cluster=null}
function bindGuidedCenters(target,live,selection){
 let alternate=false,trace=demo(),index=0,unlocked=0,active=-1,timer=null;
 const steps=[0,1,2,3].map(i=>target.querySelector(`[data-guided-step="${i}"]`));
 const status=target.querySelector('[data-cluster-status]'),play=target.querySelector('[data-cluster-action="play"]');
 const pause=()=>{if(timer!==null)root.clearInterval(timer);timer=null;play.textContent='Play';play.setAttribute?.('aria-pressed','false')};
 const paint=()=>{
  live.innerHTML=toyView(trace[index],true,active>=0);bindCharts(live,selection);
  steps.forEach((button,i)=>{button.disabled=i>unlocked;button.setAttribute?.('aria-current',i===active?'step':'false');button.classList?.toggle('complete',i<unlocked)});
  target.querySelector('[data-repeat-controls]').hidden=active!==3;
  play.disabled=index===trace.length-1;target.querySelector('[data-cluster-action="next"]').disabled=play.disabled;
  const icons={intro:'<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z"/>',start:'<circle cx="7" cy="8" r="5"/><circle cx="17" cy="16" r="5"/><path d="M5 8h4M7 6v4m8 6h4m-2-2v4"/>',assign:'<circle cx="5" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="18" cy="12" r="4"/><path d="m7 6 7 4m-7 8 7-4"/>',move:'<circle cx="6" cy="17" r="4"/><path d="m11 12 8-8m-6 0h6v6"/>',repeat:'<path d="M4 10a8 8 0 0 1 14-5l3 3m0-6v6h-6M20 14a8 8 0 0 1-14 5l-3-3m0 6v-6h6"/>',stable:'<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>'};
  target.querySelector('[data-step-icon]').innerHTML=icons[active<0?'intro':trace[index].phase==='stable'?'stable':active===3?'repeat':trace[index].phase];
  status.innerHTML=active<0?'These fish have not been grouped yet. Select <strong>Place centers</strong> to give the two groups their starting locations.':{start:'Centers A and B are <strong>starting guesses</strong>. K-means usually uses randomness to choose its starts; this demo uses <strong>two preset arrangements</strong> so you can repeat and compare them. Next, assign the fish.',assign:'Each fish joins its <strong>nearest center</strong>. The fish and centers stay in place during this step.',move:'Each center moves to the <strong>middle of its group</strong>. The fish stay still. <strong>Repeat</strong> to see whether any fish change groups.',stable:'The groups have <strong>stopped changing</strong>. Try different starting centers to compare how learning begins.'}[trace[index].phase];
 };
 const run=()=>{
  if(timer!==null||index===trace.length-1)return;
  play.textContent='Pause';play.setAttribute?.('aria-pressed','true');
  timer=root.setInterval(()=>{if(root.document?.hidden||target.isConnected===false||target.closest?.('[hidden]')){pause();return}index++;if(index===trace.length-1)pause();paint()},1200);
 };
 steps.forEach((button,i)=>button.onclick=()=>{
  if(i>unlocked)return;
  pause();active=i;unlocked=Math.max(unlocked,Math.min(3,i+1));index=i===3?2:i;paint();
 });
 play.onclick=()=>{if(timer!==null)pause();else run()};
 target.querySelector('[data-cluster-action="next"]').onclick=()=>{if(active!==3||index===trace.length-1)return;pause();index++;paint()};
 const reset=()=>{pause();index=0;active=-1;unlocked=0;selection.key=null;selection.cluster=null;paint()};
 target.querySelector('[data-cluster-action="restart"]').onclick=reset;
 target.querySelector('[data-cluster-action="alternate"]').onclick=()=>{alternate=!alternate;trace=demo(alternate);reset()};
 const visibility=()=>{if(root.document.hidden)pause()};root.document?.addEventListener('visibilitychange',visibility);
 const observer=root.MutationObserver?new root.MutationObserver(()=>{if(!target.contains(live)){disposeLearn();return}if(target.closest('[hidden]'))pause()}):null;
 observer?.observe(root.document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
 disposeLearn=()=>{pause();observer?.disconnect();root.document?.removeEventListener('visibilitychange',visibility)};
 paint();
}
function bindLearn(target,s){
 disposeLearn();disposeLearn=()=>{};
 target.closest?.('.ml-scene-main')?.classList.toggle('ml-cluster-opener',s.kind==='cluster-intro');
 if(s.kind==='cluster-intro')return;
 if(s.kind==='cluster-claim'){
  const model=result(),cards=target.querySelector('[data-claim-clusters]'),explanation=target.querySelector('[data-claim-explanation]');
  bindSpeciesCards(cards);
  for(const radio of target.querySelectorAll?.('[data-claim-attribute]')||[])radio.onchange=()=>{if(!radio.checked)return;cards.innerHTML=speciesCards(model,true,radio.value);bindSpeciesCards(cards);explanation.textContent=radio.value==='weight'?'Compare average weight and the lightest and heaviest fish in each group. Weight was not used to form the groups.':'Look for shared species across groups. Species names were not used to form the groups.'};
  return;
 }
 const selection={};bindCharts(target,selection);
 const live=target.querySelector('[data-cluster-live]');if(!live)return;
 if(s.kind==='cluster-centers'){bindGuidedCenters(target,live,selection);return}
 if(s.kind==='cluster-steps'){
  let alternate=false,index=0,trace=demo(),timer=null;
  const step=target.querySelector('[data-cluster-action="step"]'),status=target.querySelector('[data-cluster-status]');
  const back=target.querySelector('[data-cluster-action="back"]'),play=target.querySelector('[data-cluster-action="play"]');
  const pause=()=>{if(timer!==null)root.clearInterval(timer);timer=null;play.textContent='Play';play.setAttribute?.('aria-pressed','false')};
  const update=()=>{
   const focusedPoint=root.document?.activeElement?.dataset?.point;
   live.innerHTML=toyView(trace[index],s.kind==='cluster-centers');bindCharts(live,selection);
   if(focusedPoint)Array.from(live.querySelectorAll?.('[data-point]')||[]).find(mark=>mark.dataset.point===focusedPoint)?.focus();
   step.disabled=index===trace.length-1;back.disabled=index===0;play.disabled=step.disabled;
   step.textContent=step.disabled?'Assignments stable':trace[index].phase==='assign'?'Move centers \u2192':'Assign fish \u2192';
   status.textContent='Step '+(index+1)+' of '+trace.length+(step.disabled?'. Learning stopped because assignments stayed the same.':'. '+trace[index].phase+'.');
   if(s.kind==='cluster-centers')status.textContent={start:'Start: two centers are ready. Assign fish to see the first groups.',assign:'Assign: each fish joins its nearest center.',move:'Move: the centers shift to the middle of their groups.',stable:'Stable: the groups have stopped changing.'}[trace[index].phase];
   if(step.disabled)pause();
  };
  const advance=()=>{index=Math.min(index+1,trace.length-1);update()};
  step.onclick=()=>{pause();advance()};back.onclick=()=>{pause();index=Math.max(0,index-1);update()};
  play.onclick=()=>{
   if(timer!==null){pause();return}if(index===trace.length-1)return;
   play.textContent='Pause';play.setAttribute?.('aria-pressed','true');
   timer=root.setInterval(()=>{if(root.document?.hidden||target.isConnected===false||target.closest?.('[hidden]')){pause();return}advance()},1200);
  };
  target.querySelector('[data-cluster-action="restart"]').onclick=()=>{pause();index=0;update()};
  target.querySelector('[data-cluster-action="alternate"]').onclick=()=>{pause();alternate=!alternate;trace=demo(alternate);index=0;resetModelSelection(selection);update()};
  const visibility=()=>{if(root.document.hidden)pause()};root.document?.addEventListener('visibilitychange',visibility);
  const observer=root.MutationObserver?new root.MutationObserver(()=>{if(!target.contains(live)){disposeLearn();return}if(target.closest('[hidden]'))pause()}):null;
  if(observer)observer.observe(root.document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  disposeLearn=()=>{pause();observer?.disconnect();root.document?.removeEventListener('visibilitychange',visibility)};
  update();return;
 }
 if(s.kind==='cluster-scaling'){
  const radios=Array.from(target.querySelectorAll?.('[data-learn-scale]')||[]),views=Array.from(target.querySelectorAll?.('[data-learn-view]')||[]);
  let scale='raw',view='2d';const angle={yaw:-.65,pitch:.45};
  const update=value=>{scale=value;target.querySelector('[data-scaling-explanation]').innerHTML=value==='raw'?'<strong>Raw measurements:</strong> distances use the original centimeters. <strong>Length</strong> varies more than <strong>Width</strong>, so it can have more influence on the groups.':'<strong>Standardized:</strong> measurements are put on comparable scales so <strong>Length</strong> does not dominate simply because its values vary more.';resetModelSelection(selection);const model=result(3,value);live.innerHTML=view==='3d'?threeDimensionalChart(model,angle):fullPanel(model,{hoverLegend:true});bindCharts(live,selection);if(view==='3d')bindRotation(live,model,angle,selection)};
  radios.forEach(radio=>radio.onchange=()=>{if(radio.checked)update(radio.value)});
  views.forEach(radio=>radio.onchange=()=>{if(radio.checked){view=radio.value;update(scale)}});
  update('raw');return;
 }
 if(s.kind==='cluster-species'){
  const control=target.querySelector('[data-cluster-control]'),model=result();let attribute='species',revealed=false;
  const positions={hidden:0,species:0,weight:0},seen=new Set(),investigation=target.querySelector('[data-investigation]');
  const paintQuestion=()=>{
   if(!investigation)return;
   const key=revealed?attribute:'hidden',index=positions[key],questions=investigationQuestions(attribute,revealed),[label,question,hint]=questions[index];
   const icon='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6m-14-11 2 2 4-4"/></svg>';
   investigation.setAttribute?.('data-question-mode',key);
   investigation.innerHTML='<div aria-live="polite"><span class="ml-question-label">'+icon+esc(label)+'</span><span class="ml-question-count">Question '+(index+1)+' of '+questions.length+'</span><h4>'+esc(question)+'</h4></div><button type="button" class="ml-question-hint-toggle" data-hint-toggle aria-expanded="false" aria-controls="cluster-question-hint"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z"/></svg>Show a hint</button><p id="cluster-question-hint" class="ml-question-hint" data-question-hint hidden>'+esc(hint)+'</p><div class="ml-actions"><button type="button" class="ml-btn" data-question-prev '+(index===0?'disabled':'')+'>Previous</button><button type="button" class="ml-btn" data-question-next '+(revealed&&index===questions.length-1?'disabled':'')+'>Next</button></div>'+(seen.size===2?'<p>You have examined the clues. Now use them to make a careful claim in scene 9.</p>':'');
   investigation.querySelector('[data-hint-toggle]').onclick=()=>{const button=investigation.querySelector('[data-hint-toggle]'),hintText=investigation.querySelector('[data-question-hint]'),expanded=button.getAttribute('aria-expanded')==='true';button.setAttribute('aria-expanded',String(!expanded));hintText.hidden=expanded};
   investigation.querySelector('[data-question-prev]').onclick=()=>{positions[key]--;paintQuestion()};
   investigation.querySelector('[data-question-next]').onclick=()=>{if(!revealed&&index===questions.length-1){revealed=true;positions[attribute]=0;update();return}if(index<questions.length-1){positions[key]++;paintQuestion()}};
  };
  const update=()=>{if(revealed)seen.add(attribute);paintQuestion();control.textContent=(revealed?'Hide ':'Reveal ')+attribute;control.setAttribute('aria-pressed',String(revealed));live.innerHTML=speciesCards(model,revealed,attribute);bindSpeciesCards(live);target.querySelector('[data-attribute-explanation]').textContent=attribute==='weight'?'Compare average weight and the lightest and heaviest fish in each group. Weight was not used to form the groups.':'Look for shared species across groups. Species names were not used to form the groups.'};
  control.onclick=()=>{revealed=!revealed;update()};
  for(const radio of target.querySelectorAll?.('[data-cluster-attribute]')||[])radio.onchange=()=>{if(radio.checked){attribute=radio.value;update()}};
  update();return;
 }
 const control=target.querySelector('[data-cluster-control]'),id=control.dataset.clusterControl;
 const update=()=>{const model=result(id==='k'?Number(control.value):3,id==='scale'?control.value:'standardized');live.innerHTML=s.kind==='cluster-species'?speciesCards(model,control.getAttribute('aria-pressed')==='true'):fullPanel(model,{hoverLegend:id==='scale'||id==='k',reveal:id==='reveal'&&control.getAttribute('aria-pressed')==='true'});bindCharts(live,selection);if(s.kind==='cluster-species')bindSpeciesCards(live)};
 if(id==='reveal')control.onclick=()=>{const revealed=control.getAttribute('aria-pressed')!=='true';control.setAttribute('aria-pressed',String(revealed));control.textContent=revealed?'Hide species':'Reveal species';update()};else control.onchange=()=>{resetModelSelection(selection);update()};update();
}
function review(target,task,state,onChange){
 const scale=state.values.scale||'standardized',k=Number(state.values.k||3),reveal=state.values.reveal===true;
 const model=result(task.id==='choice'?k:3,task.id==='scaling'?scale:'standardized');
 let view=reviewSelections.get(state);if(!view||view.task!==task.id){view={task:task.id,selection:{}};reviewSelections.set(state,view)}
 const signature=model.k+':'+model.scale;if(view.signature!==signature)resetModelSelection(view.selection);view.signature=signature;
 const control=task.id==='scaling'?scaleControl(scale):task.id==='choice'?kControl(k):`<button class="ml-btn primary" type="button" data-cluster-control="reveal" aria-pressed="${reveal}">${reveal?'Hide species':'Reveal species'}</button>`;
 target.innerHTML=`<div class="ml-cluster-card">${control}${task.id==='limits'?'':comparison(model)}${fullPanel(model,{reveal:task.id==='limits'&&reveal})}</div>`;
 bindCharts(target,view.selection);
 const input=target.querySelector('[data-cluster-control]'),id=input.dataset.clusterControl;
 const change=()=>{const value=id==='reveal'?!reveal:id==='k'?Number(input.value):input.value;state.values[id]=value;state.changed=state.changed||{};if(value!==task.controls[0].value)state.changed[task.id+'.'+id]=true;state.observations=state.observations||{};if(value!==task.controls[0].value)state.observations[task.id]=evidence(task,state);onChange(id)};
 if(id==='reveal')input.onclick=change;else input.onchange=change;
}
function evidence(task,state){
 const model=result(task.id==='choice'?Number(state.values?.k||3):3,task.id==='scaling'?(state.values?.scale||'standardized'):'standardized');
 if(task.id==='limits'){const o=overlap(model);return `Species compared after fitting standardized k=3. ${o.counts.map((r,j)=>'C'+j+': '+r.map((n,i)=>n?o.species[i]+' '+n:'').filter(Boolean).join(', ')).join('; ')}. Revealing labels does not change assignments.`}
 return `Baseline standardized k=3: ${countText(result())}. Observed ${model.scale} k=${model.k}: ${countText(model)}. Same ${rows().length} fish and three features. ${task.id==='choice'?'k is requested, not discovered.':'Scaling changes the distance calculation.'}`;
}
function notebookOutput(index){
 const model=result();
 const prefix='Browser-computed demonstration (Python results may differ):\n';
 if(index===0)return `Loaded Fish.csv: ${rows().length} rows × 6 columns\n\nID  Species  Weight  Length  Height  Width\n`+rows().slice(0,5).map(r=>[r.ID,r.Species,r.Weight,r.Length,r.Height,r.Width].join('  ')).join('\n');
 if(index===1)return `X: ${rows().length} rows × 3 features\nLength, Height, Width\nSpecies, Weight, and ID excluded.`;
 if(index===2)return 'Standardized Length, Height, Width.\nEach mean ≈ 0; each standard deviation ≈ 1.\nValues are now unitless.';
 if(index===3)return prefix+`${rows().length} assignments learned; no species labels used.\n${countText(model)}\nTen starts; the most compact result is shown.\nCluster numbers are arbitrary identifiers.`;
 if(index===4)return prefix+model.counts.map((n,j)=>'C'+j+'  '+n).join('\n')+`\nTotal: ${rows().length} fish`;
 if(index===5)return prefix+'Cluster  Length  Height  Width (means in cm)\n'+model.means.map((p,j)=>'C'+j+'  '+p.map(v=>v.toFixed(2)).join('  ')).join('\n');
 if(index===6)return prefix+[2,3,5].map(k=>'k='+k+' → '+countText(result(k))).join('\n')+'\nThe original three-cluster assignments are retained.';
 const o=overlap(model);return prefix+'Cluster  '+o.species.join('  ')+'\n'+o.counts.map((p,j)=>'C'+j+'  '+p.join('  ')).join('\n')+'\nSpecies was not used to form these groups.';
}
function notebook(target,index){const model=result();target.innerHTML=`<div class="ml-cluster-card">${index===6?[2,3,5].map(k=>`<h3>k=${k}</h3>${scatter(result(k))}`).join(''):fullPanel(model,{profiles:index===5,reveal:index===7})}</div>`;bindCharts(target)}
// Validate only the documented course scripts; ignore comments and formatting, not Python identifiers or strings.
function tokens(code){return (code.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[^\n]*|[A-Za-z_]\w*|\d+(?:\.\d+)?|[^\s]/g)||[]).filter(t=>!t.startsWith('#')).map(t=>t.startsWith("'")?'"'+t.slice(1,-1)+'"':t)}
function validate(code,hint){
 const a=tokens(code),b=tokens(hint);
 if(a.length!==b.length||a.some((v,i)=>v!==b[i]))return 'Use the shown workflow, including the same variables, inputs, and settings. Comments, spacing, and either straight quote style are allowed.';
 if(hint.startsWith('for ')){
  const lines=code.split('\n').filter(l=>l.trim()&&!l.trim().startsWith('#'));
  if(lines.length!==3||/^\s/.test(lines[0])||!/^([ \t]+)\S/.test(lines[1])||lines[1].match(/^\s*/)[0]!==lines[2].match(/^\s*/)[0])return 'Keep both trial and print indented equally inside the for loop, as shown.';
 }
 return '';
}
root.HiddenPatterns={features,standardize,kmeans,run,result,overlap,demo,scene,bindLearn,review,evidence,notebook,notebookOutput,validate,tokens};
})(window);
