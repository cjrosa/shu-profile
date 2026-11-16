(function(root){
 'use strict';
 function highlight(text,esc){return text.split(/("(?:[^"\\]|\\.)*"|\b(?:import|from|def|while|if|not|break|with|as|raise|True)\b|\b\d+\b|\b(?:socket|threading|recv|recvfrom|sendall|sendto|connect|accept|listen|bind|close|Thread|start|print|len|gethostbyname)\b)/g).map(token=>{
  const cls=token.startsWith('"')?'string':/^\d+$/.test(token)?'number':/^(import|from|def|while|if|not|break|with|as|raise|True)$/.test(token)?'keyword':/^\w+$/.test(token)?'function':'';
  return cls?'<span class="echo-'+cls+'">'+esc(token)+'</span>':esc(token);
 }).join('');}
 function threadPills(n,d,s,t,esc){
  const glyphs={paused:'<path d="M8 5v14M16 5v14"/>',running:'<path d="m8 5 11 7-11 7z"/>',waiting:'<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',finished:'<path d="m5 12 4 4L19 6"/>',error:'<circle cx="12" cy="12" r="8"/><path d="m9 9 6 6m0-6-6 6"/>'};
  return s.threads.map(x=>{
   const queued=n.queue.some(e=>e.kind==='echo-application'&&e.device===d.id&&e.thread===x.id);
   const status=x.status==='ready'?(x.auto||queued?'running':'paused'):x.status;
   return '<button type="button" class="echo-thread-pill" data-echo-thread="'+esc(x.id)+'" aria-pressed="'+(x.id===t.id)+'" aria-label="'+esc(x.id+': '+status)+'" title="'+esc(x.id+': '+status+(x.wait?' - '+x.wait:''))+'"><svg class="echo-thread-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6v12M17 6v12M7 9c0 4 10 2 10 6"/><circle cx="7" cy="4" r="2"/><circle cx="17" cy="4" r="2"/><circle cx="7" cy="20" r="2"/><circle cx="17" cy="20" r="2"/></svg><span>'+esc(x.id)+'</span><svg class="echo-thread-status '+status+'" viewBox="0 0 24 24" aria-hidden="true">'+(glyphs[status]||glyphs.paused)+'</svg></button>';
  }).join('');
 }
 function markup(n,d,esc){
  const c=d.echoServer,s=NetworkExplorerEcho.state(n,d.id),t=s.threads.find(t=>t.id===s.selected)||s.threads[0];
  const ui=s.ui||(s.ui={}),draft=ui.draft||c,busy=n.queue.some(e=>e.kind==='echo-application'&&e.device===d.id&&e.thread===t.id);
  const hasHandler=c.role==='server'&&c.transport==='TCP',file=hasHandler?(ui.file||(t.id==='main'?'main':'handler')):'main';
  const rows=NetworkExplorerEcho.program(c,file==='handler'),activeFile=(file==='handler')===(t.id!=='main');
  const breaks=file==='handler'?(ui.handlerBreakpoints||[]):s.threads[0].breakpoints;
  const files=[{id:'main',name:c.transport.toLowerCase()+'_'+c.role+'.py'},...(hasHandler?[{id:'handler',name:'client_handler.py'}]:[])];
  const selected=(a,b)=>a===b?' selected':'';
  const value=x=>Array.isArray(x)&&x.every(v=>typeof v==='number')?'b'+JSON.stringify(NetworkExplorerEcho.decode(x)):JSON.stringify(x);
  return `
   <form class="echo-settings">
   <div class="echo-fields"><label>Role<select id="echo-role" name="role"><option${selected(draft.role,'client')}>client</option><option${selected(draft.role,'server')}>server</option></select></label><label>Transport<select id="echo-transport" name="transport"><option${selected(draft.transport,'TCP')}>TCP</option><option${selected(draft.transport,'UDP')}>UDP</option></select></label></div>
   <button type="submit">Use settings & reset simulation</button></form>
   <section class="echo-debugger" aria-label="Echo Python debugger">
   <div class="echo-toolbar" role="toolbar" aria-label="Python debugger controls"><button type="button" data-echo-control="run" ${s.threads.every(x=>x.auto||['finished','error'].includes(x.status))?'disabled':''} title="Run all threads in this application" aria-label="Run"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v16M9 4l11 8-11 8z"/></svg></button><button type="button" data-echo-control="pause" title="Pause Python; packets already sent continue" aria-label="Pause"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg></button><button type="button" data-echo-control="step" ${t.status!=='ready'||busy||t.auto?'disabled':''} title="Execute one line in the selected thread" aria-label="Step over"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11a8 8 0 0 1 14-5l2 3M20 3v6h-6"/><circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none"/></svg></button><button type="button" data-echo-reset title="Restart this Echo application" aria-label="Restart Echo application"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/></svg></button><span class="echo-toolbar-divider" aria-hidden="true"></span><div class="echo-threads" role="group" aria-label="Python threads">${threadPills(n,d,s,t,esc)}</div></div>
   <div class="echo-filebar"><div class="echo-filetabs" role="tablist" aria-label="Python files">${files.map(f=>`<button type="button" class="echo-filetab" role="tab" id="echo-source-tab-${f.id}" data-echo-file="${f.id}" aria-selected="${file===f.id}" aria-controls="echo-source-panel"><span class="echo-python-icon" aria-hidden="true">PY</span><span>${esc(f.name)}</span></button>`).join('')}</div><small>Simulated Python</small></div>
   <div id="echo-source-panel" role="tabpanel" aria-labelledby="echo-source-tab-${file}">
   <div class="echo-code" aria-label="Python source code">${rows.map((r,i)=>`<div class="echo-line${activeFile&&i===t.pc?' current':''}${activeFile&&i===t.last?' executed':''}"${activeFile&&i===t.pc?' aria-current="step"':''}><button type="button" class="echo-gutter${breaks.includes(i)?' breakpoint':''}" data-echo-break="${i}" aria-label="Toggle breakpoint on line ${i+1}" aria-pressed="${breaks.includes(i)}"><span class="echo-breakpoint-dot" aria-hidden="true"></span><span class="echo-current-marker" aria-hidden="true">${activeFile&&i===t.pc?'<svg viewBox="0 0 20 20"><path d="M2 7h8V3l8 7-8 7v-4H2z"/></svg>':''}</span></button><span class="echo-line-number" aria-hidden="true">${i+1}</span><code>${highlight(r.text,esc)}</code></div>`).join('')}</div>
   </div>
   <div class="echo-status" role="status">${esc(t.status==='ready'?(t.auto||busy?'Executing line ':'Paused before line ')+(t.pc+1):t.status)}${t.wait?' · '+esc(t.wait):''}</div>
   <details class="echo-variables" open><summary>VARIABLES</summary><dl>${Object.entries(t.vars).map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(value(v))+'</dd>').join('')||'<dd>No variables yet.</dd>'}</dl></details>
   <details class="echo-console" open><summary>DEBUG CONSOLE</summary><pre>${esc(s.output.join('\n')||'Run the server first, then a client. Click the gutter left of a line number for a breakpoint.')}</pre></details>
  </section>`;
 }
 function bind(el,id,ctx){
  const s=()=>NetworkExplorerEcho.state(ctx.get(),id);
  const saveDraft=e=>{s().ui.draft=Object.fromEntries(new FormData(e.currentTarget));};
  el.querySelector('.echo-settings').oninput=saveDraft;
  el.querySelector('.echo-settings').onchange=saveDraft;
  ctx.styleSelect('echo-role','Role');
  ctx.styleSelect('echo-transport','Transport');
  el.querySelector('.echo-settings').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);ctx.configure({...ctx.get().device(id).echoServer,enabled:true,role:f.get('role'),transport:f.get('transport')});};
  el.querySelectorAll('[data-echo-control]').forEach(b=>b.onclick=()=>{s().ui.file=s().selected==='main'?'main':'handler';ctx.control(b.dataset.echoControl,s().selected);});
  el.querySelector('[data-echo-reset]').onclick=ctx.reset;
  el.querySelectorAll('[data-echo-thread]').forEach(b=>b.onclick=()=>{s().selected=b.dataset.echoThread;s().ui.file=s().selected==='main'?'main':'handler';ctx.refresh();});
  el.querySelectorAll('[data-echo-file]').forEach(b=>b.onclick=()=>{
   const state=s();state.ui.file=b.dataset.echoFile;
   if(state.ui.file==='main')state.selected='main';
   else if(state.selected==='main'){const worker=state.threads.find(t=>t.id!=='main');if(worker)state.selected=worker.id;}
   ctx.refresh();
  });
  el.querySelectorAll('[data-echo-break]').forEach(b=>b.onclick=()=>{
   const state=s(),handler=el.querySelector('[data-echo-file="handler"]')?.getAttribute('aria-selected')==='true',i=Number(b.dataset.echoBreak);
   const before=handler?(state.ui.handlerBreakpoints||[]):state.threads[0].breakpoints;
   const after=before.includes(i)?before.filter(x=>x!==i):[...before,i];
   if(handler){state.ui.handlerBreakpoints=after;state.threads.filter(t=>t.id!=='main').forEach(t=>t.breakpoints=[...after]);}
   else state.threads[0].breakpoints=after;
   ctx.refresh();
  });
 }
 root.NetworkExplorerEchoUI={markup,bind};
})(globalThis);
