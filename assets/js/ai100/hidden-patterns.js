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
function distanceExample(){
 const a=rows()[2],b=rows()[3],c=rows().reduce((best,r)=>r.Length>best.Length?r:best,rows()[0]);
 const selected=[a,b,c],sx=v=>58+v/65*560,sy=v=>264-v/20*224;
 return `<div class="ml-cluster-heading"><span>THREE REAL FISH · LABELS HELD ASIDE</span><strong>Compare a nearby pair with a distant fish</strong></div><figure class="ml-cluster-plot"><svg viewBox="0 0 660 320" role="img" aria-label="Fish ${a.ID} and ${b.ID} have nearby Length and Height measurements. Fish ${c.ID} is much longer. Lines show two-dimensional gaps; the model also uses Width."><path d="M58 30V264H618" stroke="#61716b" fill="none"/><path d="M${sx(a.Length)} ${sy(a.Height)}L${sx(b.Length)} ${sy(b.Height)}" stroke="#1f7a46" stroke-width="4"/><path d="M${sx(a.Length)} ${sy(a.Height)}L${sx(c.Length)} ${sy(c.Height)}" stroke="#3977a8" stroke-width="2" stroke-dasharray="7 5"/>${selected.map((r,i)=>`<circle cx="${sx(r.Length)}" cy="${sy(r.Height)}" r="6" fill="#17322a"/><text x="${sx(r.Length)+(i===2?-8:8)}" y="${sy(r.Height)+(i===0?23:-14)}" text-anchor="${i===2?'end':'start'}">Fish ${r.ID}</text>`).join('')}<text x="300" y="95">Long dashed line: a larger gap</text><text x="160" y="231">Short solid line: a smaller gap</text><text x="338" y="311" text-anchor="middle">Length (cm)</text><text transform="translate(17 155) rotate(-90)" text-anchor="middle">Height (cm)</text></svg><figcaption>Shorter distance means greater similarity in the features shown. Scaling can change the relative influence of each feature.</figcaption></figure>${table('Look at all three measurements',['Fish','Length (cm)','Height (cm)','Width (cm)'],selected.map(r=>['Fish '+r.ID,...features.map(f=>r[f])]))}`;
}
function table(caption,headers,body){return `<div class="ml-cluster-table-wrap" tabindex="0" role="region" aria-label="${esc(caption)}"><table class="ml-cluster-table"><caption>${esc(caption)}</caption><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${body.map(row=>`<tr>${row.map((v,j)=>j?`<td>${esc(v)}</td>`:`<th scope="row">${esc(v)}</th>`).join('')}</tr>`).join('')}</tbody></table></div>`}
function summary(model){return table('Group profiles · original measurements in cm',['Cluster','Fish','Mean Length','Mean Height','Mean Width'],model.means.map((p,j)=>['C'+j,model.counts[j],...p.map(v=>v.toFixed(2))]))}
function speciesTable(model){const o=overlap(model);return `<p>Read across a row to compare species within one cluster. Read down a column to see whether a species spans clusters. Counts sum to ${rows().length} fish.</p>`+table('Species revealed after clustering · counts of fish',['Cluster',...o.species,'Total'],o.counts.map((p,j)=>['C'+j,...p,model.counts[j]]))}
function marker(x,y,j,size=4){
 const shape=j%7,c=colors[j]||'#61716b';
 if(shape===1)return `<rect x="${x-size}" y="${y-size}" width="${size*2}" height="${size*2}" fill="${c}"/>`;
 if(shape===2||shape===5)return `<path d="M${x} ${y-size-1}L${x+size+1} ${y+size}H${x-size-1}Z" fill="${shape===5?'white':c}" stroke="${c}"/>`;
 if(shape===3||shape===6)return `<path d="M${x} ${y-size-1}L${x+size+1} ${y}L${x} ${y+size+1}L${x-size-1} ${y}Z" fill="${shape===6?'white':c}" stroke="${c}"/>`;
 return `<circle cx="${x}" cy="${y}" r="${size}" fill="${shape===4?'white':c}" stroke="${c}"/>`;
}
function scatter(model,{neutral=false,reveal=false}={}){
 const sx=v=>58+v/65*560,sy=v=>264-v/20*224;
 return `<figure class="ml-cluster-plot"><svg viewBox="0 0 660 320" role="img" aria-label="${rows().length} fish: Length versus Height in centimeters. ${neutral?'Species hidden; no groups shown.':model.k+' clusters, distinguished by shapes and colors. Width also affects assignments.'}">
 ${[0,5,10,15,20].map(v=>`<path d="M58 ${sy(v)}H618" stroke="#dce6e1"/><text x="49" y="${sy(v)+4}" text-anchor="end">${v}</text>`).join('')}
 ${[0,10,20,30,40,50,60].map(v=>`<text x="${sx(v)}" y="285" text-anchor="middle">${v}</text>`).join('')}
 <path d="M58 40V264H618" stroke="#61716b" fill="none"/>
 ${rows().map((r,i)=>`<g><title>Fish ${r.ID}: Length ${r.Length}, Height ${r.Height}, Width ${r.Width} cm${neutral?'':'; C'+model.labels[i]}${reveal?'; '+esc(r.Species):''}</title>${neutral?`<circle cx="${sx(r.Length)}" cy="${sy(r.Height)}" r="3.5" fill="#61716b"/>`:marker(sx(r.Length),sy(r.Height),model.labels[i])}</g>`).join('')}
 ${neutral?'':model.means.map((p,j)=>`<g><title>C${j} average position</title><path d="M${sx(p[0])-7} ${sy(p[1])}h14m-7-7v14" stroke="#17322a" stroke-width="3"/><text x="${sx(p[0])+8}" y="${sy(p[1])-8}" class="ml-cluster-center-label">C${j}</text></g>`).join('')}
 <text x="338" y="311" text-anchor="middle">Length (cm)</text><text transform="translate(17 155) rotate(-90)" text-anchor="middle">Height (cm)</text></svg>
 <figcaption>Each mark is one fish. ${neutral?'Only two of the three input measurements are shown.':'Groups use Length, Height, and Width; this view shows two features in original units. + marks a group average.'}</figcaption></figure>
 ${neutral?'':`<div class="ml-cluster-legend">${model.counts.map((n,j)=>`<span><svg viewBox="0 0 20 20" aria-hidden="true">${marker(10,10,j,5)}</svg><b>C${j}</b> ${n} fish</span>`).join('')}</div>`}`;
}
const browserNote='Computed in your browser from Fish.csv. Python uses its own implementation and may return different groups or numbers, even with seed 42. Group numbers are arbitrary; this browser orders centers by Length for readable labels.';
function fullPanel(model,{neutral=false,reveal=false,profiles=false}={}){return `<div class="ml-cluster-heading"><span>${neutral?'MEASUREMENTS ONLY':'FULL DATASET · '+model.scale.toUpperCase()}</span><strong>${rows().length} fish${neutral?' · species hidden':' · k='+model.k+' · '+model.starts+' starts'}</strong></div>${scatter(model,{neutral,reveal})}${profiles?summary(model):''}${reveal?speciesTable(model):''}<p class="ml-cluster-footnote">${browserNote}</p>`}
const toy=[[1,1],[1.5,2],[2,1],[3,2],[6,5],[7,5],[7,7],[8,6]];
function demo(alternate=false){return run(toy,alternate?[[1,1],[8,6]]:[[1,1],[2,1]],100,true).trace}
function toyView(frame){
 const sx=v=>52+v*62,sy=v=>266-v*29;
 const text={start:'Start: two chosen centers. No assignments yet.',assign:'Assign: each point joins its nearest center. The centers stay still.',move:'Move: each center moves to the average of its assigned points. The fish stay still.',stable:'Stable: assignments did not change. These centers summarize the groups.'}[frame.phase];
 return `<div class="ml-cluster-heading"><span>ILLUSTRATIVE EXAMPLE · 8 POINTS · 2 FEATURES</span><strong>${esc(text)}</strong></div><svg class="ml-cluster-demo" viewBox="0 0 660 310" role="img" aria-label="${esc(text)} Eight fixed points, with two moving group centers."><path d="M52 25V266H622" fill="none" stroke="#61716b"/>${toy.map((p,i)=>`${frame.labels.length?`<path d="M${sx(p[0])} ${sy(p[1])}L${sx(frame.centers[frame.labels[i]][0])} ${sy(frame.centers[frame.labels[i]][1])}" stroke="${colors[frame.labels[i]]}" stroke-dasharray="4 4" opacity=".55"/>`:''}${marker(sx(p[0]),sy(p[1]),frame.labels[i]??-1,6)}<text x="${sx(p[0])+10}" y="${sy(p[1])-8}">${i+1}</text>`).join('')}${frame.centers.map((p,j)=>`<g><rect x="${sx(p[0])-13}" y="${sy(p[1])-13}" width="26" height="26" rx="6" fill="white" stroke="${colors[j]}" stroke-width="3"/><text x="${sx(p[0])}" y="${sy(p[1])+5}" text-anchor="middle">${j===0?'A':'B'}</text></g>`).join('')}<text x="338" y="299" text-anchor="middle">Example Length (arbitrary units)</text><text transform="translate(18 146) rotate(-90)" text-anchor="middle">Example Height</text></svg><p>Centers A and B are the outlined boxes. Circles join A; squares join B. ${frame.iteration?'Iteration '+frame.iteration+'. ':''}This small teaching example uses two features, not the 159-fish analysis.</p>`;
}
function scaleControl(value){return `<label class="ml-cluster-control">Feature scaling <select data-cluster-control="scale"><option value="standardized" ${value==='standardized'?'selected':''}>Standardized</option><option value="raw" ${value==='raw'?'selected':''}>Raw measurements</option></select></label>`}
function kControl(value){return `<label class="ml-cluster-control">Number of clusters (k) <select data-cluster-control="k">${[2,3,4,5,6,7].map(k=>`<option ${k===Number(value)?'selected':''}>${k}</option>`).join('')}</select></label>`}
function scaleTable(){const s=result().scaled;return table('Compare feature spreads before scaling',['Feature','Original standard deviation (cm)','After standardizing'],features.map((f,j)=>[f,s.spread[j].toFixed(2),'1.00']))}
function comparison(model){const base=result();return `<div class="ml-cluster-baseline"><strong>Baseline · standardized · k=3</strong><span>${countText(base)}</span><strong>Current · ${model.scale} · k=${model.k}</strong><span>${countText(model)}</span></div><p>Compare the whole grouping. Matching cluster numbers across runs do not guarantee matching members.</p>`}
function introModel(){
 const neighborhoods=[{center:[371,196],points:[[350,179],[350,211],[383,220]]},{center:[444,190],points:[[421,171],[467,175],[466,214]]},{center:[422,253],points:[[397,245],[437,268],[463,246]]}];
 return `<g class="ml-cluster-model" role="img" aria-label="Illustrative K-means model: measurement points connect to three learned group centers. Assign points, update centers, repeat."><rect class="ml-cluster-model-case" x="326" y="96" width="176" height="230" rx="22" fill="url(#cluster-model-glass)" stroke="#246e91" stroke-width="3"/>
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
function introExplanation(){return `<p>For example, fish with similar Length, Height, and Width may end up in the same group even if they belong to different species. These measurements are the <strong>features</strong>: the information the model uses to compare fish.</p><div class="ml-cluster-cards"><article><svg class="ml-cluster-card-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 6h7m4 0h5M4 12h2m4 0h10M4 18h10m4 0h2"/><circle cx="13" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/></svg><span>PEOPLE CHOOSE</span><strong>What to compare</strong><p>Choose the measurements and how many groups to try. Here, the features describe size and shape.</p></article><article><svg class="ml-cluster-card-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 6 6m6-6-6 6m-6 6 6-6m6 6-6-6"/><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><circle cx="12" cy="12" r="3"/></svg><span>MODEL LEARNS</span><strong>Which fish belong together</strong><p>K-means uses the measurements to find groups and their average measurements. It receives no correct group labels.</p></article><article><svg class="ml-cluster-card-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="6"/><path d="m14.5 14.5 6 6M7 11l2-3 2 4 2-3"/></svg><span>PEOPLE INTERPRET</span><strong>What the groups mean</strong><p>Describe how the groups differ and whether they are useful. A measurement group is not automatically a species.</p></article></div>`;}
function scene(s){
 if(s.kind==='cluster-intro')return `<div class="ml-cluster-card ml-cluster-opening">${swimmingIntro()}</div>`;
 const model=result();let body='';
 if(s.kind==='cluster-overview')body=introExplanation();
 else if(s.kind==='cluster-inputs')body=table('From a table to a learning task',['Task','Inputs','Known answer during learning','Result'],[['This lab: clustering','Length, Height, Width','None','Group number'],['Predict weight','Measurements','Weight','Estimated weight'],['Predict species','Measurements','Species','Estimated species']])+`<div class="ml-callout">Keep Species for later comparison. Set aside Weight and ID too: neither is part of this clustering question.</div>`+table('A real example · fish '+rows()[0].ID,['Length (cm)','Height (cm)','Width (cm)','Species'],[[rows()[0].Length,rows()[0].Height,rows()[0].Width,'Hidden from clustering']]);
 else if(s.kind==='cluster-distance')body=distanceExample()+`<div class="ml-callout">Similarity depends on the question. These features describe size and shape, not habitat, behavior, or genetic relationships.</div>`;
 else if(s.kind==='cluster-scaling')body=scaleTable()+scaleControl('standardized')+'<div data-cluster-live></div>';
 else if(s.kind==='cluster-choice')body=kControl(3)+'<div data-cluster-live></div>';
 else if(s.kind==='cluster-centers'||s.kind==='cluster-steps')body=`<div class="ml-actions"><button class="ml-btn" data-cluster-action="restart" type="button">Restart example</button><button class="ml-btn" data-cluster-action="alternate" type="button">Try different starting centers</button><button class="ml-btn primary" data-cluster-action="step" type="button">Assign points →</button></div><div data-cluster-live></div><p data-cluster-status role="status" aria-live="polite"></p>`;
 else if(s.kind==='cluster-species')body='<button class="ml-btn primary" data-cluster-control="reveal" type="button" aria-pressed="false">Reveal species</button><div data-cluster-live></div>';
 else body=`<div class="ml-cluster-cards"><article><span>SUPPORTED</span><strong>Similar in these features</strong><p>These measurements form groups with different average size and shape. Species can overlap.</p></article><article><span>NOT ESTABLISHED</span><strong>New species or causes</strong><p>A group number does not identify a biological category or explain why fish differ. This activity explores the observed fish; it does not measure prediction accuracy on unseen fish.</p></article></div><div class="ml-cluster-workflow"><strong>Your notebook investigation</strong><p>Load with pandas → select features → scale → fit KMeans → count and describe → compare k → reveal species.</p></div>${summary(model)}`;
 return `<div class="ml-visual-card ml-cluster-card"><div class="ml-loan-heading ml-cluster-scene-heading"><span>${esc(s.cardKicker)}</span><strong>${esc(s.cardTitle)}</strong></div>${body}<div class="ml-definition"><strong>${esc(s.definition.term)}:</strong> ${esc(s.definition.text)}</div></div>`;
}
function bindLearn(target,s){
 target.closest?.('.ml-scene-main')?.classList.toggle('ml-cluster-opener',s.kind==='cluster-intro');
 if(s.kind==='cluster-intro')return;
 const live=target.querySelector('[data-cluster-live]');if(!live)return;
 if(['cluster-centers','cluster-steps'].includes(s.kind)){
  let alternate=false,index=0,trace=demo();
  const step=target.querySelector('[data-cluster-action="step"]'),status=target.querySelector('[data-cluster-status]');
  const update=()=>{live.innerHTML=toyView(trace[index]);step.disabled=index===trace.length-1;step.textContent=step.disabled?'Assignments stable':trace[index].phase==='assign'?'Move centers →':'Assign points →';status.textContent='Step '+(index+1)+' of '+trace.length+(step.disabled?'. Learning stopped because assignments stayed the same.':'')};
  step.onclick=()=>{index=Math.min(index+1,trace.length-1);update()};
  target.querySelector('[data-cluster-action="restart"]').onclick=()=>{index=0;update()};
  target.querySelector('[data-cluster-action="alternate"]').onclick=()=>{alternate=!alternate;trace=demo(alternate);index=0;update()};update();return;
 }
 const control=target.querySelector('[data-cluster-control]'),id=control.dataset.clusterControl;
 const update=()=>{const model=result(id==='k'?Number(control.value):3,id==='scale'?control.value:'standardized');live.innerHTML=(id==='scale'||id==='k'?comparison(model):'')+fullPanel(model,{reveal:id==='reveal'&&control.getAttribute('aria-pressed')==='true'})};
 if(id==='reveal')control.onclick=()=>{const revealed=control.getAttribute('aria-pressed')!=='true';control.setAttribute('aria-pressed',String(revealed));control.textContent=revealed?'Hide species':'Reveal species';update()};else control.onchange=update;update();
}
function review(target,task,state,onChange){
 const scale=state.values.scale||'standardized',k=Number(state.values.k||3),reveal=state.values.reveal===true;
 const model=result(task.id==='choice'?k:3,task.id==='scaling'?scale:'standardized');
 const control=task.id==='scaling'?scaleControl(scale):task.id==='choice'?kControl(k):`<button class="ml-btn primary" type="button" data-cluster-control="reveal" aria-pressed="${reveal}">${reveal?'Hide species':'Reveal species'}</button>`;
 target.innerHTML=`<div class="ml-cluster-card">${control}${task.id==='limits'?'':comparison(model)}${fullPanel(model,{reveal:task.id==='limits'&&reveal})}</div>`;
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
function notebook(target,index){const model=result();target.innerHTML=`<div class="ml-cluster-card">${index===6?[2,3,5].map(k=>`<h3>k=${k}</h3>${scatter(result(k))}`).join(''):fullPanel(model,{profiles:index===5,reveal:index===7})}</div>`}
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
