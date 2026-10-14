(function(root){
  'use strict';
  const clone=x=>JSON.parse(JSON.stringify(x));
  const sentences=[
    {text:'I loved it',label:1,words:['I','loved','it'],inputs:[[.1,.2,-.15,.3,.05,-.2],[.9,.4,.65,-.1,.5,.25],[.15,.1,-.2,.05,.3,-.1]]},
    {text:'Too dark for me',label:0,words:['Too','dark','for','me'],inputs:[[.2,-.5,.3,-.15,.1,.4],[-.6,.4,-.5,.2,-.35,.15],[.1,.15,.05,-.2,.25,-.1],[.2,.1,-.1,.35,.15,-.25]]},
    {text:'Not bad',label:1,words:['Not','bad'],inputs:[[-.7,-.8,.25,-.4,.15,.3],[-.9,.2,-.65,.1,-.3,.45]]}
  ];
  const initial=()=>({U:[[.4,-.3,.15,-.1,.2,.05],[-.2,.5,-.1,.2,.05,-.15],[.3,.2,.1,.05,-.15,.2]],W:[[.25,.1,-.1],[-.15,.35,.1],[.1,-.1,.3]],b:[0,0,0],V:[.25,-.35,.15],c:-.13});
  const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
  function forward(model,example){
    let h=[0,0,0];
    const steps=example.inputs.map((x,i)=>{const prior=h.slice();h=model.U.map((row,j)=>Math.tanh(dot(row,x)+dot(model.W[j],prior)+model.b[j]));return {word:example.words[i],x:x.slice(),prior,h:h.slice()}});
    const score=dot(model.V,h)+model.c,p=1/(1+Math.exp(-score));
    return {steps,p,loss:example.label?Math.log1p(Math.exp(-score)):Math.log1p(Math.exp(score))};
  }
  function backward(model,example,trace){
    const error=trace.p-example.label;
    const gradient={U:model.U.map(r=>r.map(()=>0)),W:model.W.map(r=>r.map(()=>0)),b:[0,0,0],V:trace.steps.at(-1).h.map(v=>error*v),c:error};
    let dh=model.V.map(v=>error*v);const contributions=[];
    for(let t=trace.steps.length-1;t>=0;t--){
      const step=trace.steps[t],dz=dh.map((v,j)=>v*(1-step.h[j]*step.h[j]));
      const contribution={U:dz.map(v=>step.x.map(x=>v*x)),W:dz.map(v=>step.prior.map(h=>v*h)),b:dz.slice()};
      for(let j=0;j<3;j++){gradient.b[j]+=dz[j];for(let i=0;i<step.x.length;i++)gradient.U[j][i]+=contribution.U[j][i];for(let i=0;i<3;i++)gradient.W[j][i]+=contribution.W[j][i]}
      contributions[t]=contribution;
      dh=model.W[0].map((_,i)=>dz.reduce((sum,v,j)=>sum+v*model.W[j][i],0));
    }
    return {gradient,contributions};
  }
  function apply(model,g,rate=.15){
    for(const key of ['U','W'])model[key]=model[key].map((row,j)=>row.map((v,i)=>v-rate*g[key][j][i]));
    for(const key of ['b','V'])model[key]=model[key].map((v,j)=>v-rate*g[key][j]);
    model.c-=rate*g.c;
  }
  const vector=values=>'['+values.map(v=>(Math.abs(v)<.0005?0:v).toFixed(2)).join(', ')+']';
  const percent=p=>Math.round(p*100)+'%';
  const label=y=>y?'Positive':'Negative';
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function newSession(){return {model:initial(),version:0,round:0,word:0,phase:'input',back:0,trace:null,feedback:null,after:null,history:[]}}
  function create(){
    let session=newSession();
    const example=()=>sentences[session.round%sentences.length];
    function advance(){
      const saved=clone(session);delete saved.history;session.history.push(saved);
      if(session.phase==='input'){
        if(!session.trace)session.trace=forward(session.model,example());
        session.phase='state';
      }else if(session.phase==='state')session.phase=session.word===example().words.length-1?'end':'carry';
      else if(session.phase==='carry'){session.word++;session.phase='input'}
      else if(session.phase==='end')session.phase='predict';
      else if(session.phase==='predict'){session.feedback=backward(session.model,example(),session.trace);session.phase='compare'}
      else if(session.phase==='compare'){session.back=example().words.length-1;session.phase='backward'}
      else if(session.phase==='backward')session.phase='adjust';
      else if(session.phase==='adjust'){apply(session.model,session.feedback.gradient);session.version++;session.after=forward(session.model,example());session.phase='complete'}
      else if(session.phase==='complete'){session.round++;session.word=0;session.phase='input';session.trace=null;session.feedback=null;session.after=null}
    }
    function back(){const previous=session.history.pop();if(previous)session={...previous,history:session.history}}
    function reset(){session=newSession()}
    function finish(){let guard=0;while(session.phase!=='complete'&&guard++<80)advance()}
    function nextLabel(){
      const s=session;return {input:'Build updated impression',state:s.word===example().words.length-1?'Mark end of sentence':'Pass impression to next word',carry:'Read next word',end:'Make sentiment prediction',predict:'Compare with known label',compare:'Trace error backward',backward:'Gather weight adjustments',adjust:'Update shared weights',complete:'Start next sentence'}[s.phase];
    }
    function render(){
      const s=session,e=example(),trace=s.trace||forward(s.model,e),displayTrace=s.after||trace;
      const step=displayTrace.steps[s.phase==='backward'?s.back:s.word];
      const hasState=s.phase!=='input',predicted=['predict','compare','backward','adjust','complete'].includes(s.phase),compared=['compare','backward','adjust','complete'].includes(s.phase);
      const sentenceFinished=predicted||s.phase==='end';
      const classifierDetails=compared?[`Prediction before update: ${label(trace.p>=.5)} - ${percent(trace.p)} positive`,`Known label: ${label(e.label)}`,`Loss before update: ${trace.loss.toFixed(3)}`,s.after?`After weight update: ${percent(s.after.p)} positive - loss ${s.after.loss.toFixed(3)}`:'After weight update: pending'].join('\n'):'';
      return `<section class="rnn-lesson" aria-label="RNN sentence training"><div class="rnn-sentence-meta"><span>Sentence ${s.round+1}</span><span>Known label: <strong>${label(e.label)}</strong></span><span>Training updates: ${s.version}</span></div><div class="rnn-sentence-strip" aria-label="${e.text}">${e.words.map((word,i)=>`<span class="rnn-sentence-token ${sentenceFinished||i<s.word?'read':''} ${!sentenceFinished&&i===s.word?'selected':''}" ${!sentenceFinished&&i===s.word?'aria-current="step"':''}>${word}</span>`).join('')}<span class="rnn-sentence-end ${sentenceFinished?'reached selected':''}" ${sentenceFinished?'aria-current="step"':''}>END</span></div>
      ${flow({classifierDetails,word:step.word,embedding:step.x,prior:step.prior,updated:hasState?step.h:null,priorWords:e.words.slice(0,s.phase==='backward'?s.back:s.word),carry:s.phase==='carry',atEnd:predicted||s.phase==='end',prediction:predicted?displayTrace.p:null,model:s.model,version:s.version,backward:s.phase==='backward',lastBackward:s.phase==='backward'&&s.back===e.words.length-1,phase:s.phase,previousModel:s.phase==='complete'?s.history.at(-1)?.model:null})}
      <section class="rnn-history-details" aria-label="State after each word"><div class="rnn-time-heading"><h4>The same RNN cell across time</h4><div id="trainingHistoryToolbar"></div></div><div class="rnn-state-table-wrap"><table class="rnn-state-table"><thead><tr><th scope="col">Word</th><th scope="col">Prior impression</th><th scope="col">Updated impression</th></tr></thead><tbody>${displayTrace.steps.map((t,i)=>{const seen=i<s.word||(i===s.word&&hasState);return `<tr class="${i===s.word&&!sentenceFinished?'current':''}"><th scope="row">${t.word}</th><td>${i===0?'Empty (starting state)':i<=s.word?vector(t.prior):'Waiting'}</td><td>${seen?vector(t.h):'Waiting'}</td></tr>`}).join('')}</tbody></table></div></section>
      <details class="rnn-math"><summary>See the numbers and weight changes</summary><p>This small working RNN uses six-value example word embeddings and three hidden-state values. The embeddings stay fixed; the RNN and output weights learn. The diagram groups each input vector into one symbol. Each grouped line summarizes the magnitudes of its connections to a hidden neuron; the individual weights appear below.</p><p>Updated state = tanh(word weights × embedding + recurrent weights × prior state + bias). Training uses binary cross-entropy loss and a learning rate of 0.15.</p><div class="rnn-weight-table"><table><thead><tr><th>Connections</th><th>Current values</th><th>Combined gradient</th></tr></thead><tbody>${['U','W','V'].map(key=>`<tr><th>${{U:'Word → hidden state',W:'Prior → hidden state',V:'Final state → sentiment'}[key]}</th><td>${s.model[key].flat().map(v=>v.toFixed(3)).join(', ')}</td><td>${s.feedback?s.feedback.gradient[key].flat().map(v=>v.toFixed(3)).join(', '):'Available after comparison'}</td></tr>`).join('')}</tbody></table></div><p>The separate inference example in the next scene uses its own fixed weights.</p></details></section>`;
    }
    const playbackDelay=()=>session.phase==='backward'?Math.ceil((1.4+example().words.length*.65)*1000):1800;
    return {advance,back,reset,finish,render,snapshot:()=>clone(session),nextLabel,playbackDelay};
  }
  function flow({showStateCarry=false,generation=null,classifierDetails='',word,embedding,prior,updated,priorWords=[],carry=false,atEnd=false,prediction=null,model=null,version=null,backward=false,lastBackward=false,phase=null,previousModel=null}){
    const mode=phase||(atEnd?'predict':carry?'state':'input');
    const fmt=values=>escape(vector(values));
    const width=v=>1+Math.min(1.2,Math.abs(v))*5;
    const xs=[{x:360,y:230}],hs=[{x:360,y:346}];
    const outputs=(updated||prior).map((_,i)=>({x:490,y:288+(i-(prior.length-1)/2)*(prior.length>3?48:52)}));
    const magnitude=row=>Math.sqrt(row.reduce((sum,v)=>sum+v*v,0)/row.length);
    // Each input symbol is an entire vector; lines summarize its connections to a hidden neuron.
    const connections=[],reverseConnections=[];
    for(let j=0;j<outputs.length;j++){
      for(const [group,nodes,key] of [['word',xs,'U'],['memory',hs,'W']])nodes.forEach((node,i)=>{
        reverseConnections.push(`M${outputs[j].x} ${outputs[j].y}L${node.x} ${node.y}`);
        const w=model?magnitude(model[key][j]):.3,old=previousModel?magnitude(previousModel[key][j]):w;
        connections.push(`<path class="rnn-synapse ${group}" d="M${node.x} ${node.y}L${outputs[j].x} ${outputs[j].y}" style="--weight-before:${width(old).toFixed(3)};--weight-after:${width(w).toFixed(3)};--weight-pulse:${(Math.max(width(old),width(w))+4).toFixed(3)};--order:${j+i};stroke-width:${width(w).toFixed(3)}"><title>Grouped ${group==='word'?'word':'recurrent'} connections${model?' (root mean square magnitude '+w.toFixed(3)+')':''}</title></path>`);
      });
    }
    const neuron=(point,value,group,i)=>`<circle class="rnn-neuron ${group}" cx="${point.x}" cy="${point.y}" r="${group==='hidden'?13:19}" style="--delay:${i*100}ms"><title>${group==='hidden'?'Hidden neuron':group==='word'?'Entire current word embedding':'Entire prior impression'}${group==='hidden'&&value!==null?': '+value.toFixed(3):''}</title></circle>`;
    const nodes=neuron(xs[0],null,'word',0)+neuron(hs[0],null,'memory',0)+outputs.map((p,i)=>neuron(p,updated?updated[i]:null,'hidden',i)).join('');
    const bundle=(x,y)=>`<path class="rnn-bundle-glyph" d="M${x-8} ${y-6}h16M${x-8} ${y}h16M${x-8} ${y+6}h16"/>`;
    const wordHue=[...word.toLowerCase()].reduce((h,c)=>(h*31+c.charCodeAt(0))%360,0);
    const embeddingWidth=Math.min(42,210/embedding.length-4);
    const embeddingStart=142-(embedding.length*(embeddingWidth+4)-4)/2;
    const embeddingStrip=`<g class="rnn-embedding-strip" aria-label="Word embedding: ${fmt(embedding)}">${embedding.map((value,i)=>`<rect x="${embeddingStart+i*(embeddingWidth+4)}" y="257" width="${embeddingWidth}" height="20" rx="4" fill="hsl(${(wordHue+i*65/Math.max(1,embedding.length-1))%360} ${[48,60,44,58,50,62][i%6]}% ${[76,52,66,43,72,55][i%6]}%)"><title>Embedding value ${i+1}: ${value.toFixed(2)}</title></rect>`).join('')}</g>`;
    const wordEntry='M270 230H341';
    const priorEntry='M270 346H341';
    const hiddenExits=outputs.map(p=>`M503 ${p.y}L545 288H570`);
    const hiddenFeedback=outputs.map(p=>`M570 288H545L503 ${p.y}`);
    const colors=['#2774c8','#7652a7','#16847b','#944900','#a64851','#456747','#4259a5'];
    const stateBlocks=(values,x,y,available,group)=>{
      const n=prior.length,gap=7,w=50,left=x+(available-n*w-(n-1)*gap)/2;
      return `<g class="rnn-state-blocks ${group}" aria-label="${values?'Hidden-state values':'Hidden state not yet calculated'}">${Array.from({length:n},(_,i)=>{const v=values?values[i]:null,color=v===null?'#eeeaf4':Math.abs(v)<.0005?'#e1e5e3':`hsl(${v<0?270:215} 45% ${85-45*Math.min(1,Math.abs(v))}%)`;return `<rect x="${left+i*(w+gap)}" y="${y}" width="${w}" height="30" rx="5" fill="${color}" ${v===null?'stroke="#c8badf" stroke-dasharray="3 3"':`data-state-value="${v}"`}><title>Hidden unit ${i+1}: ${v===null?'not yet calculated':v.toFixed(3)}${v===0?' (zero starting state)':''}</title></rect>`}).join('')}</g>`;
    };
    const motion=(path,kind,delay=0,duration=1.1)=>`<circle class="rnn-signal ${kind}" r="6"><animateMotion path="${path}" dur="${duration}s" begin="${delay}s" fill="freeze"/><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.12;0.85;1" dur="${duration}s" begin="${delay}s" fill="freeze"/></circle>`;
    const signals=mode==='input'?motion(wordEntry,'word')+motion(priorEntry,'memory'):mode==='state'?xs.map((p,i)=>motion(`M${p.x} ${p.y}L490 ${outputs[i%outputs.length].y}`,'word',i*.12)).join('')+hs.map((p,i)=>motion(`M${p.x} ${p.y}L490 ${outputs[i%outputs.length].y}`,'memory',.15+i*.12)).join('')+hiddenExits.map(path=>motion(path,'hidden',.65)).join(''):mode==='carry'?motion('M697 341V420H140V401','memory'):mode==='predict'?motion('M825 288H880','hidden'):mode==='backward'?motion('M880 288H825','error',0,.55)+motion('M825 288H545','error',.55,.35)+outputs.map(p=>motion(`M545 288L${p.x} ${p.y}`,'error',.9,.4)).join('')+reverseConnections.map(path=>motion(path,'error',1.3,.65)).join(''):'';
    return `<div class="rnn-flow-scroll rnn-phase-${mode}${showStateCarry?' rnn-show-state-carry':''}" tabindex="0" role="region" aria-label="Word processing and recurrent state flow"><svg class="rnn-flow-diagram" viewBox="0 110 1100 325" role="img" aria-label="Current word embedding and prior impression enter the shared RNN. Updated impression returns to the next word. ${generation ? 'The output layer chooses a next word, which becomes the next input.' : 'At the end of the sentence, a separate output layer predicts sentiment.'}"><defs><marker id="rnn-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker></defs>
      <rect class="rnn-flow-box cell" x="300" y="130" width="550" height="254" rx="14"/>
      <path class="rnn-word-entry" d="${wordEntry}"/>
      <g class="rnn-current-panel"><rect class="rnn-flow-box word" x="15" y="175" width="255" height="110" rx="12"/><g class="rnn-card-icon word" transform="translate(32 196)" aria-label="Word icon"><path d="M2 2h22v16H10l-6 5v-5H2zM7 7h12M7 12h8"/></g><text x="150" y="214" class="rnn-svg-title">${backward?'Last word read':'Current word'}</text><text x="142" y="245" class="rnn-current-word">${escape(word)}</text>${embeddingStrip}</g>
      <g class="rnn-prior-panel"><rect class="rnn-flow-box memory" x="15" y="291" width="255" height="110" rx="12"/><g class="rnn-card-icon memory" transform="translate(30 307)" aria-label="Memory icon"><path d="M2 8l12-6 12 6-12 6zM2 14l12 6 12-6M2 20l12 6 12-6"/></g><text x="157" y="327" class="rnn-svg-title">Prior impression</text>${stateBlocks(prior,28,350,229,'prior-blocks')}</g>
      <path class="rnn-prior-entry" d="${priorEntry}"/>
      <text x="575" y="155" class="rnn-svg-title">Shared RNN cell</text><text x="360" y="184" class="rnn-svg-small">Current word</text><text x="360" y="202" class="rnn-svg-small">embedding</text><text x="360" y="307" class="rnn-svg-small">Prior impression</text><text x="490" y="194" class="rnn-svg-small">Hidden layer</text>
      <g class="rnn-connections">${connections.join('')}</g><g class="rnn-neurons">${nodes}${bundle(360,230)}${bundle(360,346)}</g>
      ${hiddenExits.map(path=>`<path class="rnn-state-exit" d="${path}"/>`).join('')}
      <g class="rnn-updated-panel"><rect class="rnn-flow-box memory ${updated?'ready':''}" x="570" y="235" width="255" height="106" rx="12"/><g class="rnn-card-icon memory" transform="translate(584 251)" aria-hidden="true"><path d="M2 8l12-6 12 6-12 6zM2 14l12 6 12-6M2 20l12 6 12-6"/></g><text x="714" y="273" class="rnn-svg-title">Updated impression</text>${stateBlocks(updated,583,291,229,'updated-blocks')}</g>
      <path class="rnn-return ${carry?'active':''} ${atEnd?'inactive':''}" d="M697 341V420H140V401"/>
      <path class="rnn-output-path ${atEnd?'active':''}" d="M825 288H880"/>
      ${generation ? `<g class="rnn-generation-panel"><circle class="rnn-flow-box classifier ready" cx="950" cy="288" r="70"/><text x="950" y="204" class="rnn-svg-title">Next word</text><text x="950" y="280" class="rnn-svg-title"${generation.word.length > 11 ? ` style="font-size:${Math.min(17, 170 / generation.word.length)}px"` : ""}>${escape(generation.word)}</text><text x="950" y="310" class="rnn-svg-small">${generation.complete?'Complete':generation.pending?'Read prompt':'Feed back as input'}</text></g>` : `<g class="rnn-prediction-panel ${prediction===null?'unknown':prediction>=.5?'positive':'negative'}" aria-label="Sentiment classifier${prediction===null?'':`: ${label(prediction>=.5)} · ${percent(prediction)} positive`}">${classifierDetails?`<title>${escape(classifierDetails)}</title>`:''}<circle class="rnn-flow-box classifier ${atEnd?'ready':''}" cx="950" cy="288" r="70"/><g class="rnn-card-icon classifier-icon" transform="${prediction===null?'translate(929 267) scale(1.5)':'translate(936 245)'}" aria-hidden="true"><circle cx="14" cy="14" r="13"/><path d="M9 10h.1M19 10h.1" stroke-width="3"/><path d="${prediction===null?'M8 19h12':prediction>=.5?'M7 17Q14 25 21 17':'M7 22Q14 14 21 22'}"/></g><text x="950" y="204" class="rnn-svg-title">Classifier</text>${prediction===null?'':`<text x="950" y="303" class="rnn-classifier-score">${label(prediction>=.5)}</text><text x="950" y="325" class="rnn-classifier-score">${percent(prediction)} positive</text>`}</g>`}

      ${backward?`<g class="rnn-error-links">${hiddenFeedback.map(path=>`<path d="${path}"/>`).join('')}</g>`:''}
      ${generation && !generation.pending ? `<path class="rnn-word-entry rnn-word-feedback" d="M1020 288H1060V120H142V175"/>` : ""}
      <g aria-hidden="true">${signals}${showStateCarry && updated && !atEnd ? motion("M697 341V420H140V401","memory",1.2,1.1) : ""}${generation && !generation.pending && mode === "feedback" ? motion("M1020 288H1060V120H142V175","word",0,1.1) : ""}</g>
    </svg></div>`;
  }

  const api={create,forward,backward,apply,initial,sentences:clone(sentences),flow};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.RNNTraining=api;
})(typeof globalThis==='object'?globalThis:this);
