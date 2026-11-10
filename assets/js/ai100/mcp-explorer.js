(() => {
  'use strict';
  const M = window.MCPDemo, $ = id => document.getElementById(id);
  const names = {search_availability:'Find rooms',create_booking:'Book a room',cancel_booking:'Cancel a booking'};
  let frames = [], position = 0, timer = null, db = M.initialDB(), initial = M.initialDB(), approvals = new Set(), preparedPrompt = '';
  const clone = x => JSON.parse(JSON.stringify(x));
  let motion = [];
  let livePosition = 0, review = null;
  let stopped = false;
  const el = (tag, text, className) => { const node = document.createElement(tag); if(text !== undefined) node.textContent = text; if(className) node.className = className; return node; };
  function packetIcon(frame) {
    const paths={
      chat:['M4 4h16v12H9l-5 4V4','M8 8h8M8 12h5'],
      tools:['M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'],
      approval:['M12 3l8 4v5c0 5-8 9-8 9s-8-4-8-9V7l8-4','m8 12 3 3 5-6'],
      search:['M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14','m15 15 6 6'],
      booking:['M4 5h16v16H4zM8 3v4M16 3v4M4 10h16','m9 15 2 2 4-4'],
      cancel:['M4 5h16v16H4zM8 3v4M16 3v4M4 10h16','m10 14 4 4m0-4-4 4'],
      result:['M14 3H5v18h14V8l-5-5','M14 3v5h5','m8 14 3 3 5-5']
    };
    const kind=frame.approval?'approval':['loading-tools','discover'].includes(frame.kind)?'tools':frame.kind==='prompt'||frame.answer?'chat':frame.up?'result':frame.selected==='search_availability'?'search':frame.selected==='cancel_booking'?'cancel':'booking';
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','21');svg.setAttribute('height','21');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');svg.dataset.icon=kind;
    paths[kind].forEach(d=>{const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',d);svg.append(path);});
    return svg;
  }
  function action(name, args) {
    if(name === 'search_availability') return `Find rooms available at ${args.time}.`;
    if(name === 'create_booking') return `Book ${args.room} at ${args.time} for Alex for one hour.`;
    return `Cancel reservation ${args.booking_id}.`;
  }
  function resultText(result) {
    if(result.error) return result.message || result.error;
    if(result.status === 'confirmed') return `Booking confirmed: ${result.booking.room} at ${result.booking.time}, reservation ${result.booking.id}.`;
    if(result.status === 'cancelled') return `Reservation ${result.booking.id} cancelled. ${result.booking.room} at ${result.booking.time} is free again.`;
    return result.available_rooms.length ? `Available at ${result.time}: ${result.available_rooms.join(', ')}.` : `No rooms are available at ${result.time}.`;
  }
  // Keep protocol mechanics in the engine; present only observable decisions and actions.
  function conversation(prompt, source) {
    const raw = M.buildTrace(prompt, source), visual = [], intent = M.parse(prompt);
    let lastResult = '', lastAction = '';
    const add = (frame, extra) => visual.push({...frame, ...extra});
    add(raw[0], {kind:'prompt',node:'model',title:'Your message reaches ChatGPT',explanation:'ChatGPT receives the task in the conversation.',summary:'Read the user’s request.',flow:'prompt-flow'});
    const goal = {search:`Look for a free room at ${intent.time}.`,book:`Reserve ${intent.room} at ${intent.time} for Alex.`,chain:`Find a free room at ${intent.time}, then reserve it for Alex.`,cancel:`Cancel reservation ${intent.booking_id}.`,explain:'Explain what MCP means; no room data is needed.',clarify:'Some request details are missing or outside the example wording.'}[intent.kind];
    add(raw[0], {kind:'understand',node:'model',title:'Understand the request',explanation:goal,summary:`Task identified: ${goal}`});
    for(const frame of raw.slice(1)) {
      if(frame.payload?.result?.tools) {
        if(intent.kind === 'explain' || intent.kind === 'clarify') continue;
        add(frame,{kind:'loading-tools',node:'model',title:'ChatGPT is loading MCP tools',explanation:'The app asks the booking server which actions it supports.',summary:'Request the available tools from the booking MCP server.',flow:'mcp-flow'});
        add(frame,{kind:'discover',node:'model',title:'MCP tools loaded into ChatGPT',explanation:'ChatGPT now has three tools to compare: find rooms, book a room, and cancel a booking.',summary:'Loaded three tools and their descriptions. Compare them with the user’s task.',flow:'mcp-flow',up:true});
      } else if(frame.node === 'model' && frame.label?.startsWith('Model tool proposal')) {
        lastAction = action(frame.payload.name, frame.payload.arguments);
        const reason = frame.selected === 'search_availability' ? 'Availability requires current room data, so use the search tool.' : frame.selected === 'create_booking' ? 'A reservation needs a booking action, not just a text reply.' : 'Cancelling needs the reservation ID and a tool that can remove it.';
        add(frame,{kind:'choose',title:`Choose an action: ${names[frame.selected]}`,explanation:frame.explanation.replaceAll('create_booking','Book a room').replaceAll('cancel_booking','Cancel a booking').replaceAll('search_availability','Find rooms'),summary:`${reason} Selected “${names[frame.selected]}”: ${lastAction}`,action:lastAction});
      } else if(frame.approval) {
        add(frame,{kind:'approval',node:'model',title:'ChatGPT asks for approval in the chat',explanation:lastAction,action:lastAction,summary:'Pause for the user’s approval before making a change.',flow:'prompt-flow',up:true});
      } else if(frame.payload?.method === 'tools/call') {
        lastResult = '';
        add(frame,{kind:'call',node:'server',title:'The request travels down through MCP',explanation:lastAction,action:lastAction,flow:'mcp-flow'});
      } else if(frame.node === 'server' && !frame.direction) {
        add(frame,{kind:'validate',title:'Check the request',explanation:frame.title.startsWith('Reject') ? 'The requested time or details are not supported. No booking operation will run.' : 'Check the details and use Alex’s signed-in identity.',action:lastAction});
      } else if(frame.node === 'database') {
        const readResult = frame.label === 'Database read result';
        const complete = Boolean(frame.changed || frame.payload?.error || readResult);
        if(complete) lastResult = resultText(frame.payload?.error || readResult ? frame.payload : frame.changed && frame.title.startsWith('Insert') ? {status:'confirmed',booking:frame.changed} : frame.payload);
        add(frame,{kind:complete?'db-result':'operation',title:frame.title,explanation:frame.explanation,flow:complete?undefined:'database-flow',result:complete?lastResult:'',action:lastAction,operations:frame.selected === 'search_availability' ? ['Check the requested time.','Find occupied rooms.','Return the rooms still free.'] : frame.selected === 'create_booking' ? ['Check the requested slot.','Prevent a double booking.','Save the reservation if free.'] : ['Find the reservation.','Check that Alex owns it.','Remove it and free the room.']});
      } else if(frame.direction === 'Server → client' && (frame.payload?.result?.content || frame.payload?.error)) {
        if(frame.payload.error) lastResult = frame.payload.error.message;
        else lastResult = resultText(JSON.parse(frame.payload.result.content[0].text));
        add(frame,{kind:'server-result',title:'The booking result travels back up',explanation:'The server returns what actually happened, including a failure if the action could not be completed.',result:lastResult,flow:frame.payload.error?'mcp-flow':'database-flow',up:true});
      } else if(frame.node === 'client' && frame.label === 'Tool output delivered to model') {
        add(frame,{kind:'model-result',node:'model',title:'ChatGPT receives the result',explanation:'Use the returned facts to decide what to do next.',result:lastResult,summary:`Evidence received: ${lastResult}`,flow:'mcp-flow',up:true});
      } else if(frame.answer) {
        add(frame,{kind:'answer',title:frame.title === 'Action declined'?'Action declined':'ChatGPT replies to you',explanation:'The answer appears back in the conversation at the top.',summary:'Compose a reply based on the available information.',flow:'prompt-flow',up:true});
      } else if(frame.node === 'model') {
        add(frame,{kind:'decide',title:frame.title,explanation:frame.explanation,summary:frame.title === 'No tool is needed' ? 'Answer directly: this question does not need the booking system.' : 'Ask for clarification rather than inventing a room, time, or booking ID.'});
      }
    }
    return visual;
  }
  M.examples.forEach(([label,prompt]) => {const button=el('button',label);button.title=prompt;button.addEventListener('click',()=>{$('prompt').value=prompt;prepare(true);});$('examples').append(button);});
  M.tools.forEach(tool=>{const card=el('div',undefined,'tool');card.dataset.tool=tool.name;card.append(el('strong',names[tool.name]),el('small',tool.name==='search_availability'?'Read availability':tool.name==='create_booking'?'Reserve a free slot':'Release a reservation'));$('catalog').append(card);});
  M.tools.forEach(tool=>{const card=el('div',undefined,'tool');card.dataset.modelTool=tool.name;card.append(el('strong',names[tool.name]),el('small',tool.name==='search_availability'?'Checks which rooms are free.':tool.name==='create_booking'?'Creates a reservation.':'Removes an existing reservation.'));$('loaded-tools').append(card);});
  document.querySelectorAll('[data-node]').forEach(section=>{
    const card=el('div',undefined,'current-operation');card.hidden=true;
    const copy=el('div',undefined,'operation-copy');copy.append(el('span','','operation-label'),el('h3','','operation-title'),el('p','','operation-description'));
    card.append(el('span',undefined,'operation-icon'),copy);
    section.querySelector('.section-head').after(card);
  });
  function renderOperation(frame){
    document.querySelectorAll('[data-node]').forEach(section=>{
      const card=section.querySelector('.current-operation');
      const active=section.dataset.node===frame?.node&&!frame?.answer&&(!stopped||review!==null);
      card.hidden=!active;
      if(!active)return;
      card.querySelector('.operation-icon').replaceChildren(packetIcon(frame));
      card.querySelector('.operation-label').textContent=review!==null?'Selected action':frame.approval?'Waiting for you':frame.kind==='db-result'?'Operation result':'Now doing';
      card.querySelector('.operation-title').textContent=frame.title;
      card.querySelector('.operation-description').textContent=frame.result||frame.explanation;
    });
    const serverActive=frame?.node==='server'&&(!stopped||review!==null);
    serverWorkflow.hidden=!serverActive;
    const phase=frame?.kind==='call'?0:frame?.kind==='validate'?1:2;
    serverWorkflow.querySelectorAll('.server-phase').forEach((node,index)=>{node.classList.toggle('current',serverActive&&index===phase);node.classList.toggle('done',serverActive&&index<phase);});
  }
  const serverWorkflow=el('div',undefined,'server-workflow');serverWorkflow.hidden=true;
  ['Receive action','Check request','Return result'].forEach((label,index)=>{const phase=el('span',undefined,'server-phase');phase.append(el('span',String(index+1),'phase-number'),el('span',label));serverWorkflow.append(phase);});
  document.querySelector('.server-panel .current-operation').after(serverWorkflow);
  document.querySelectorAll('.connector').forEach(node=>{const packet=el('div',undefined,'flow-packet');packet.setAttribute('aria-hidden','true');packet.append(el('span','','packet-icon'),el('div',undefined,'packet-copy'));packet.lastChild.append(el('strong','','packet-title'),el('span','','packet-detail'));node.append(packet,el('span','↑','return-arrow'));node.querySelector('.return-arrow').setAttribute('aria-hidden','true');});
  function animateStep(frame){
    motion.forEach(animation=>animation.cancel());motion=[];
    if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
    const duration=1100;
    const animate=(node,keys,options={})=>{if(node?.animate)motion.push(node.animate(keys,{duration,easing:'cubic-bezier(.2,.7,.2,1)',...options}));};
    if(frame.flow){const connector=$(frame.flow);animate(connector.querySelector('.flow-packet'),[{transform:`translateY(${frame.up?42:-42}px) scale(.94)`,opacity:0},{transform:`translateY(${frame.up?-5:5}px) scale(1.02)`,opacity:1,offset:.72},{transform:'translateY(0) scale(1)',opacity:1}]);animate(connector.querySelector(frame.up?'.return-arrow':'.flow-arrow'),[{transform:`translateY(${frame.up?25:-25}px)`,opacity:.25},{transform:'translateY(0)',opacity:1}]);}
    const receiver=frame.answer?$('final-reply'):blocked()?$('approval-message'):document.querySelector(`[data-node="${frame.node}"] .avatar`);
    animate(receiver,[{boxShadow:`0 0 0 0 ${frame.up?'#2774c860':'#1f7a4660'}`,transform:'scale(.94)'},{boxShadow:`0 0 0 15px ${frame.up?'#2774c800':'#1f7a4600'}`,transform:'scale(1.08)',offset:.65},{boxShadow:'0 0 0 0 transparent',transform:'scale(1)'}]);
    if(frame.kind==='discover')document.querySelectorAll('[data-model-tool]').forEach((node,i)=>animate(node,[{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}],{delay:i*110,duration:400}));
    if(frame.kind==='choose')animate(document.querySelector('[data-model-tool].selected'),[{transform:'scale(1)'},{transform:'scale(1.045)',offset:.5},{transform:'scale(1)'}]);
    if(frame.node==='model'&&frame.summary)animate(document.querySelector('#reasoning li.current'),[{opacity:.2,transform:'translateX(-10px)'},{opacity:1,transform:'translateX(0)'}],{duration:550});
    if(frame.node==='server'){
      animate(serverWorkflow.querySelector('.current'),[{background:'#ece3f6',boxShadow:'inset 0 -3px #8053b4',transform:'translateY(3px)'},{background:'#f4f0fa',boxShadow:'inset 0 -3px #8053b4',transform:'translateY(0)'}],{duration:800});
      animate(document.querySelector('#catalog .selected'),[{boxShadow:'0 0 0 0 #8053b440'},{boxShadow:'0 0 0 7px #8053b400'}],{duration:900});
    }
    if(frame.node==='database'){
      document.querySelectorAll('td.scanning').forEach((cell,index)=>animate(cell,[{background:'#fff2dd',boxShadow:'inset 0 0 0 2px #c18724'},{background:'#f2ce80',boxShadow:'inset 0 0 0 2px #c18724',offset:.45},{background:cell.classList.contains('booked')?'#eee9f6':'#e8f5ed',boxShadow:'inset 0 0 0 2px transparent'}],{duration:650,delay:index*180}));
      animate(document.querySelector('#operations li.active'),[{opacity:.35,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:450});
    }
    if(frame.changed)animate(document.querySelector('.reservation.just-written'),[{opacity:0,transform:'translateX(18px)',background:'#fff2dd'},{opacity:1,transform:'translateX(0)',background:'transparent'}],{duration:850});
    if(frame.changed)animate(document.querySelector('td.changed'),[{background:'#fff2dd',transform:'scale(1)'},{background:'#f2c55d',transform:'scale(1.12)',offset:.45},{background:'#fff2dd',transform:'scale(1)'}]);
  }
  function stop(){clearTimeout(timer);timer=null;document.body.classList.remove('playing');motion.forEach(animation=>animation.pause());}
  function blocked(){return !stopped&&Boolean(frames[livePosition]?.approval&&!approvals.has(livePosition));}
  function start(){if(stopped||!frames.length||blocked()||livePosition===frames.length-1)return;document.body.classList.add('playing');tick();}
  function prepare(autoplay=false){
    stop();const prompt=$('prompt').value.trim();
    if(!prompt){$('input-status').textContent='Enter a message or select an example.';$('prompt').focus();return;}
    stopped=false;preparedPrompt=prompt;initial=clone(db);frames=conversation(prompt,initial);position=0;livePosition=0;review=null;approvals.clear();
    $('prompt').value='';$('input-status').textContent='Message sent. Follow the request downward and the result upward.';render();if(autoplay)start();
  }
  function renderDatabase(frame){
    const db=frame.db||M.initialDB();
    const intent=M.parse(preparedPrompt);
    const target=frame.changed||(frame.payload?.room&&frame.payload?.time?frame.payload:null)||db.find(b=>b.id===intent.booking_id)||initial.find(b=>b.id===intent.booking_id)||intent;
    const table=el('table'),head=el('thead'),row=el('tr');row.append(el('th','Room'));
    M.TIMES.forEach(time=>{const cell=el('th',time);cell.scope='col';row.append(cell);});head.append(row);table.append(head);const body=el('tbody');
    M.ROOMS.forEach(room=>{const row=el('tr'),label=el('th',room);label.scope='row';row.append(label);M.TIMES.forEach(time=>{const booking=db.find(b=>b.room===room&&b.time===time&&b.date===M.DATE);const changed=frame.changed?.room===room&&frame.changed?.time===time;const cell=el('td',booking?booking.id:'Free',`${booking?'booked':''} ${changed?'changed':''}`);cell.classList.toggle('scanning',frame.node==='database'&&time===target.time&&(frame.selected==='search_availability'||!target.room||room===target.room));cell.title=`${room}, ${time}: ${booking?'booked by '+booking.user:'available'}`;row.append(cell);});body.append(row);});table.append(body);$('schedule').replaceChildren(table);
    $('bookings').replaceChildren();db.forEach(b=>{const row=el('div',undefined,'reservation');row.classList.toggle('just-written',b.id===frame.changed?.id);row.append(el('strong',b.id),el('span',`${b.room} · ${b.time}`),el('small',b.user));$('bookings').append(row);});if(!db.length)$('bookings').append(el('p','No reservations. All rooms are free.','hint'));
    $('db-status').textContent=frame.changed?`${frame.title}: ${frame.changed.room} at ${frame.changed.time}.`:`${db.length} reservation(s) · One-hour slots · Nov 9, 2026`;
  }
  function showResult(id,text){$(id).hidden=!text;$(id).textContent=text||'';}
  function render(){
    const frame=frames[position];const seen=frames.slice(0,position+1);
    document.querySelectorAll('[data-node]').forEach(node=>{const active=node.dataset.node===frame.node;node.classList.toggle('active',active);node.classList.toggle('returning',active&&Boolean(frame.up));});
    document.querySelectorAll('[data-tool]').forEach(node=>node.classList.toggle('selected',node.dataset.tool===frame.selected));
    const loading=frame.kind==='loading-tools',loaded=seen.some(f=>f.kind==='discover');
    $('model-tools').hidden=!loading&&!loaded;
    $('model-tools').classList.toggle('loading',loading);
    $('loaded-tools').hidden=!loaded;
    $('tools-status').textContent=loading?'Loading MCP tools…':frame.selected?'Tool selected':loaded?'3 tools loaded':'Not loaded yet';
    $('tool-choice').textContent=loading?'Connecting to the booking server and reading its tool descriptions.':frame.selected?`Selected: ${names[frame.selected]}. ${seen.findLast(f=>f.kind==='choose')?.action||''}`:'Tools are loaded. ChatGPT will choose the one that fits your request.';
    document.querySelectorAll('[data-model-tool]').forEach(node=>{const selected=node.dataset.modelTool===frame.selected;node.classList.toggle('selected',selected);node.classList.toggle('not-selected',Boolean(frame.selected)&&!selected);});
    $('chat-welcome').hidden=true;
    $('user-message').hidden=false;$('user-message').textContent=preparedPrompt;
    const summaries=seen.filter(f=>f.summary).map(f=>f.summary);$('reasoning').replaceChildren(...summaries.map((text,index)=>el('li',text,index===summaries.length-1&&frame.node==='model'&&!frame.answer?'current':'done')));
    $('model-status').textContent=frame.answer?'Replied':blocked()?'Awaiting approval':frame.node==='model'?'Processing':'Waiting for tools';
    const activeCall=seen.findLastIndex(f=>f.kind==='call');const cycle=seen.slice(Math.max(0,activeCall));
    const latestAction=seen.findLast(f=>f.action);$('server-action').textContent=latestAction?.action||'Available actions: find rooms, book a room, or cancel a booking.';
    $('server-action').hidden=!['call','validate','operation','db-result','server-result'].includes(frame.kind);
    $('server-status').textContent=frame.node==='server'?(frame.up?'Returning result':'Handling request'):activeCall>=0?'Connected':seen.some(f=>f.kind==='discover')?'Tools shared':'Waiting';
    const operation=cycle.findLast(f=>f.node==='database');$('operations').replaceChildren(...(operation?.operations||['Waiting for an action.']).map((text,i)=>el('li',text,i===operation?.op?'active':'')));
    $('operations').hidden=frame.node!=='database';
    showResult('database-result',frame.kind==='db-result'?frame.result:null);
    showResult('server-result',frame.kind==='server-result'?frame.result:null);
    showResult('model-result',frame.kind==='model-result'?frame.result:null);
    $('final-reply').hidden=!frame.answer;$('answer').textContent=frame.answer||'';
    const gate=seen.findLast(f=>f.approval),gateIndex=gate?frames.indexOf(gate):-1;
    const decision=frame.decision||(gateIndex>=0&&position>gateIndex&&approvals.has(gateIndex)?'Approved. Go ahead.':'');
    $('approval-message').hidden=!gate;$('approval').hidden=review!==null||!blocked();
    $('approval-copy').textContent=gate?`I can ${gate.action.charAt(0).toLowerCase()+gate.action.slice(1)}`:'';
    $('decision-message').hidden=!decision;$('decision-message').textContent=decision;
    $('chat-activity').hidden=Boolean(frame.answer)||blocked();
    $('chat-activity').textContent=loading?'Loading MCP tools…':frame.kind==='discover'?'Loaded 3 MCP tools.':frame.kind==='choose'?`Selected tool: ${names[frame.selected]}`:frame.kind==='model-result'?'Checking the booking result…':activeCall>=0?'Working with the booking system…':'Processing your request…';
    if(stopped&&review===null){$('chat-activity').hidden=false;$('chat-activity').textContent='Scenario stopped. Completed booking changes are kept. Send a new prompt or reset to begin again.';$('model-status').textContent='Stopped';}
    const defaultFlows={'prompt-flow':'Your message goes to ChatGPT','mcp-flow':'MCP carries the selected action','database-flow':'The server asks the booking system to act'};
    for(const [id,label] of Object.entries(defaultFlows)){const node=$(id),active=id===frame.flow;node.classList.toggle('active',active);node.classList.toggle('up',active&&Boolean(frame.up));node.querySelector('.flow-arrow').textContent='↓';node.querySelector('.flow-label').textContent=active?(frame.up?(id==='prompt-flow'?(blocked()?'ChatGPT asks for approval in the conversation':'The answer returns to your conversation'):frame.kind==='discover'?'Available tools are shared with ChatGPT':id==='mcp-flow'?'The result returns to ChatGPT':'The booking result returns to the server'):id==='prompt-flow'?'Your message flows into ChatGPT':frame.action||label):label;}
    if(frame.flow){const node=$(frame.flow);node.querySelector('.packet-icon').replaceChildren(packetIcon(frame));node.querySelector('.packet-title').textContent=blocked()?'Approval requested':frame.kind==='discover'?'3 MCP tools loaded':frame.kind==='loading-tools'?'Discover available tools':frame.answer?'Reply to you':frame.up?'Booking result':frame.kind==='prompt'?'Your message':'Tool request';node.querySelector('.packet-detail').textContent=frame.result||frame.action||(frame.kind==='prompt'?preparedPrompt:frame.answer?frame.answer:frame.kind==='discover'?'Find rooms · Book a room · Cancel a booking':'ChatGPT ↔ Booking MCP server');}
    renderDatabase(frame);
    renderOperation(frame);
    if(!stopped||review!==null)animateStep(frame);
    renderActions();
  }
  function follow(){const frame=frames[position];const target=frame.answer?$('final-reply'):blocked()?$('approval-message'):frame.flow?$(frame.flow):document.querySelector(`[data-node="${frame.node}"]`);if(!target?.scrollIntoView)return;const box=target.getBoundingClientRect();if(box.top<160||box.bottom>window.innerHeight-40)target.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});}
  function renderActions(){
    const active=frames[livePosition];
    $('actions-prompt').hidden=!frames.length;
    $('actions-prompt-text').textContent=frames.length?preparedPrompt:'';
    $('run-status').textContent=!active?'Send a message to begin':stopped?'Scenario stopped':blocked()?'Waiting for your approval in chat':livePosition===frames.length-1?'Request complete':active.title;
    $('stop-scenario').disabled=!active||stopped||livePosition===frames.length-1;
    $('actions-status').textContent=!active?'No actions yet.':stopped?'Stopped · completed actions retained':blocked()?'Awaiting approval':livePosition===frames.length-1?'All actions recorded':'Recording actions live…';
    const focused=document.activeElement?.dataset?.step;
    $('action-list').replaceChildren(...frames.slice(0,livePosition+1).map((frame,index)=>{const row=el('li'),button=el('button');button.dataset.step=index;button.setAttribute('aria-pressed',String(index===position));const icon=el('span',undefined,'action-icon');icon.append(packetIcon(frame));button.append(el('span',String(index+1),'action-number'),icon,el('span',frame.title,'action-title'));button.addEventListener('click',()=>{review=index;position=index;render();follow();});row.append(button);return row;}));
    if(focused!==undefined)$('action-list').querySelector(`[data-step="${focused}"]`)?.focus({preventScroll:true});
    $('review-banner').hidden=review===null;
    $('review-context').textContent=review===null?'':`Viewing action ${position+1}: ${frames[position].title}. Historical context; the live request continues independently.`;
    if(review!==null)$('review-context').textContent+=` ${frames[position].explanation}`;
    document.body.classList.toggle('reviewing',review!==null);
  }
  function latest(){review=null;position=livePosition;if(frames.length){render();follow();}}
  function next(){if(stopped||!frames.length||blocked()||livePosition===frames.length-1){stop();return;}livePosition++;db=clone(frames[livePosition].db);if(blocked()||livePosition===frames.length-1)stop();if(review===null){position=livePosition;render();follow();}else renderActions();}
  function tick(){timer=setTimeout(()=>{next();if(timer!==null)tick();},1800);}
  $('prompt-form').addEventListener('submit',event=>{event.preventDefault();prepare(true);});
  $('prompt').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();prepare(true);}});
  $('prompt').addEventListener('input',()=>{$('input-status').textContent='Press Enter or Send to submit your message.';});
  $('stop-scenario').addEventListener('click',()=>{if(!frames.length||livePosition===frames.length-1)return;stop();stopped=true;latest();});
  $('reset-scenario').addEventListener('click',()=>{$('reset').click();$('prompt').value='';$('prompt').focus();});
  $('latest').addEventListener('click',latest);
  $('approve').addEventListener('click',()=>{if(review!==null||!blocked())return;approvals.add(livePosition);next();start();});
  $('decline').addEventListener('click',()=>{if(review!==null||!blocked())return;stop();const current=frames[livePosition];frames=frames.slice(0,livePosition+1).concat({...current,kind:'answer',approval:false,node:'model',title:'Action declined',explanation:'No booking action was sent. Your reservations are unchanged.',summary:'Respect the user’s decision; leave the reservations unchanged.',decision:'Decline. Don’t make this change.',answer:'Okay, I did not change any reservation.',flow:'prompt-flow',up:true});livePosition++;position=livePosition;render();follow();});
  $('reset').addEventListener('click',()=>{stop();stopped=false;db=M.initialDB();frames=[];position=0;livePosition=0;review=null;approvals.clear();$('chat-welcome').hidden=false;['user-message','approval-message','approval','decision-message','final-reply','chat-activity','model-tools','model-result','server-result','database-result','server-action','operations'].forEach(id=>$(id).hidden=true);document.querySelectorAll('.active,.selected,.returning,.up').forEach(node=>node.classList.remove('active','selected','returning','up'));$('reasoning').replaceChildren(el('li','Send a prompt to begin.'));$('model-status').textContent='Ready';$('server-status').textContent='Waiting';$('server-action').textContent='Waiting for ChatGPT to choose a tool.';$('operations').replaceChildren(el('li','Waiting for an action.'));renderDatabase({});renderOperation(null);renderActions();$('input-status').textContent='Room data reset. Cedar is booked at 11:00.';});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else if(timer===null)start();});
  let panelSizeFrame=null;
  function sizeActionsPanel(){
    const panel=$('actions-panel');
    if(window.innerWidth<=740){panel.style.removeProperty('--actions-available-height');return;}
    const top=Math.max(16,panel.getBoundingClientRect().top);
    panel.style.setProperty('--actions-available-height',`${Math.max(120,window.innerHeight-top-16)}px`);
  }
  function schedulePanelSize(){
    if(!window.requestAnimationFrame){sizeActionsPanel();return;}
    if(panelSizeFrame!==null)return;
    panelSizeFrame=window.requestAnimationFrame(()=>{panelSizeFrame=null;sizeActionsPanel();});
  }
  window.addEventListener('scroll',schedulePanelSize,{passive:true});
  window.addEventListener('resize',schedulePanelSize);
  if(window.ResizeObserver){const observer=new ResizeObserver(schedulePanelSize);observer.observe(document.querySelector('.page-header'));observer.observe($('review-banner'));}
  schedulePanelSize();
  renderDatabase({});renderOperation(null);renderActions();
})();
