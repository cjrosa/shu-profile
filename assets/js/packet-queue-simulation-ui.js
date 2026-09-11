'use strict';
const simulationPanel = document.createElement('section');
simulationPanel.className = 'panel simulation';
simulationPanel.id = 'simulation-panel';
simulationPanel.setAttribute('role', 'tabpanel');
simulationPanel.setAttribute('aria-labelledby', 'tab-simulation');
simulationPanel.tabIndex = 0;
simulationPanel.hidden = true;
simulationPanel.innerHTML = `
  <div class="sim-header">
  <div class="sim-toolbar" role="group" aria-label="Simulation controls">
    <button id="sim-play" data-tooltip="Play simulation">Play</button>
    <button id="sim-restart" class="sim-icon-button" data-tooltip="Restart simulation" aria-label="Restart simulation"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 10a7 7 0 1 1 1 7M5 4v6h6"/></svg></button>
    <div class="sim-speed" role="group" aria-label="Simulation speed"><span>Speed</span><button data-sim-speed="0.25" aria-pressed="false" data-tooltip="Quarter speed">0.25×</button><button data-sim-speed="1" aria-pressed="true" data-tooltip="Normal speed">1×</button><button data-sim-speed="4" aria-pressed="false" data-tooltip="Four times speed">4×</button></div>
  <div class="sim-scenarios" role="group" aria-label="Traffic scenarios"><button data-load="0.5" data-tooltip="Set arriving traffic to 50% of link capacity">Low 50%</button><button data-load="0.95" data-tooltip="Set arriving traffic to 95% of link capacity">Near 95%</button><button data-load="1.2" data-tooltip="Set arriving traffic to 120% of link capacity">Over 120%</button><button id="sim-burst" data-tooltip="Temporarily increase traffic to 150% of link capacity">Burst 150%</button></div>
  <div class="sim-buffer-control"><label for="sim-buffer">Queue</label><select id="sim-buffer" data-tooltip="Capacity counts waiting packets only. Changing capacity restarts the run." aria-describedby="sim-buffer-help"><option value="5">5 packets</option><option value="10">10 packets</option><option value="20" selected>20 packets</option><option value="50">50 packets</option><option value="100">100 packets</option></select><span id="sim-buffer-help" class="sr-only">Waiting packets only. Changing capacity restarts the run.</span></div>
  </div>
  <span class="badge" id="sim-state">Paused</span>
  </div>
  <p class="hint">Use the shared arrival, packet-length, and link-rate controls while traffic flows. Gold packets are waiting; the red packet at the right is next to transmit.</p>
  <div class="sim-caption"><span id="sim-clock"></span><span id="sim-scale"></span></div>
  <div class="sim-visuals">
  <div class="sim-scene" tabindex="0" role="img" aria-label="Packets arrive, wait in a FIFO queue, transmit one at a time, and depart" id="sim-scene">
    <div class="sim-flow">
      <div class="sim-lane"><div class="sim-track"><i class="sim-packet" id="sim-incoming"></i></div></div>
      <div class="sim-queue-bay" id="sim-queue-bay"><span class="sim-queue-label">Waiting queue <small id="sim-occupancy">0 / 20 packets</small></span><div class="sim-queue" id="sim-queue"></div><p class="sim-queue-note" id="sim-overflow"></p><span class="sim-drop" id="sim-drop" aria-hidden="true"></span></div>
      <div class="sim-connector" aria-hidden="true"></div>
      <div class="sim-server"><span class="sim-link-label">Transmitting link</span><strong id="sim-serving">Link idle</strong><div class="sim-progress"><div id="sim-progress"></div></div><small id="sim-remaining"></small></div>
      <div class="sim-lane"><div class="sim-track"><i class="sim-packet outgoing" id="sim-outgoing"></i></div></div>
    </div>
  </div>
  <section class="sim-mini" aria-labelledby="sim-mini-title">
    <h3 id="sim-mini-title">Traffic intensity</h3>
    <svg viewBox="0 0 260 215" role="img" aria-labelledby="sim-mini-title sim-mini-description">
      <desc id="sim-mini-description"></desc>
      <g id="sim-mini-plot"></g>
    </svg>
    <div class="sim-mini-legend"><span><i class="mini-predicted"></i>Predicted</span><span><i class="mini-measured"></i>Measured</span></div>
    <p id="sim-mini-readout"></p>
  </section>
  </div>
  <div class="stats sim-stats"><div class="stat"><span>Packets waiting</span><strong id="sim-count"></strong></div><div class="stat"><span>Packets transmitted</span><strong id="sim-transmitted"></strong></div><div class="stat"><span>Measured average waiting time</span><strong id="sim-measured"></strong></div><div class="stat"><span>Predicted delay (unlimited queue)</span><strong id="sim-theory"></strong></div><div class="stat sim-loss"><span>Packets dropped</span><strong id="sim-dropped"></strong></div><div class="stat sim-loss"><span>Loss rate ? dropped / arrivals</span><strong id="sim-loss-rate"></strong></div></div>
  <p class="sim-notice">Measured delay averages packets that have <strong>begun transmission</strong>, excluding time spent transmitting. Short runs fluctuate. Parameter changes leave a backlog and mix measurements from different conditions; Restart begins a fresh comparison. The graph predicts an unlimited queue. This simulation has a finite queue: arrivals are dropped when all waiting spaces are occupied. Even a brief burst can cause losses.</p>
  <p id="sim-message" role="status" aria-live="polite"></p>
  <div class="sim-history"><h3>Queue length over simulated time</h3><svg viewBox="0 0 900 230" role="img" aria-labelledby="sim-chart-title sim-chart-desc"><title id="sim-chart-title">Waiting packets over time</title><desc id="sim-chart-desc"></desc><g id="sim-history-plot"></g></svg><p class="hint">Rolling window: 200 baseline transmission times (24 ms). Sampled every 0.06 ms. Dashed markers show parameter changes.</p><div class="sim-marker-list" id="sim-markers"></div></div>`;
$('explorer-views').append(simulationPanel);
const queueSim = new PacketQueueSimulation(state);
let simPlaying = false, simSpeed = 1, simFrame = 0, simLastWall = null;
let simNotice = 'Ready. Press Play to begin.', lastQueueCount = -1;
let lastChartWall = -Infinity;

function syncQueueSimulation() {
  const changed = ['arrival','bytes','rate'].filter(key => state[key] !== queueSim.params[key]);
  if (changed.length) {
    const names = {arrival:'Arrival rate', bytes:'Packet length', rate:'Link rate'};
    queueSim.configure(state, changed.map(key=>names[key]).join(' + ') + ' changed');
    simNotice = 'Parameters changed. Existing packets keep their lengths; the backlog and measured average are preserved.';
  }
  renderSimulation(true);
}
function pauseSimulation(message) {
  simPlaying = false; simLastWall = null;
  cancelAnimationFrame(simFrame);
  if (message) simNotice = message;
  renderSimulation(true);
}
function syncRestoredParameters() {
  if (state.arrival !== queueSim.params.arrival) {
    state.arrival = queueSim.params.arrival;
    simNotice = 'Burst ended. The previous arrival rate is restored; watch the backlog drain.';
    update();
  }
}
function simulationTick(wall) {
  if (!simPlaying) return;
  if (simLastWall !== null) {
    const elapsed = Math.min(0.1, Math.max(0, (wall - simLastWall) / 1000));
    queueSim.advance(queueSim.time + elapsed * queueSim.baseline * 4 * simSpeed);
    syncRestoredParameters();
  }
  simLastWall = wall;
  renderSimulation(false, wall);
  simFrame = requestAnimationFrame(simulationTick);
}
function renderHistory() {
  const end = Math.max(queueSim.time, queueSim.baseline * 200), start = end - queueSim.baseline * 200;
  const samples = queueSim.history.filter(p=>p.time>=start);
  const max = Math.max(5, queueSim.capacity, queueSim.length, ...samples.map(p=>p.length));
  const x=t=>65+(t-start)/(end-start)*805, y=q=>175-q/max*140;
  let svg='';
  for(let i=0;i<=4;i++) {
    const yy=y(max*i/4),t=start+(end-start)*i/4;
    svg+=`<line x1="65" y1="${yy}" x2="870" y2="${yy}" stroke="#e5ebf0"/><text x="55" y="${yy+4}" text-anchor="end">${fmt(max*i/4,0)}</text><text x="${x(t)}" y="197" text-anchor="middle">${fmt(t*1000,2)}</text>`;
  }
  svg+='<path d="M65 30 V175 H870" fill="none" stroke="#8191a0"/><text x="470" y="225" text-anchor="middle">Simulated time (ms)</text><text transform="translate(18 108) rotate(-90)" text-anchor="middle">Waiting packets</text>';
  const points = [...samples,{time:queueSim.time,length:queueSim.length}];
  let path='';points.forEach((p,i)=>{path+=(i?'H':'M')+x(p.time).toFixed(2)+(i?'V':',')+y(p.length).toFixed(2);});
  svg+=`<path d="${path}" fill="none" stroke="#4d88bd" stroke-width="2.5"/>`;
  svg+=`<line x1="65" y1="${y(queueSim.capacity)}" x2="870" y2="${y(queueSim.capacity)}" stroke="#bf2f49" stroke-dasharray="5 4"/><text x="870" y="${y(queueSim.capacity)-8}" text-anchor="end">Queue capacity: ${queueSim.capacity}</text>`;
  queueSim.markers.forEach(p=>{svg+=`<line x1="${x(p.time)}" y1="30" x2="${x(p.time)}" y2="175" stroke="#bf2f49" stroke-dasharray="3 4"><title>${p.label} at ${fmt(p.time*1000,3)} ms</title></line>`;});
  $('sim-history-plot').innerHTML=svg;
  $('sim-chart-desc').textContent=`${queueSim.length} packets currently waiting. Showing ${fmt(start*1000,2)} to ${fmt(end*1000,2)} milliseconds of simulated time.`;
  $('sim-markers').textContent=queueSim.markers.slice(-3).map(p=>`${fmt(p.time*1000,3)} ms: ${p.label}`).join(' · ');
}
function renderMiniIntensity() {
  const m = metrics(state), xmax = Math.max(1.5, m.rho * 1.1);
  const ymax = m.service * .98 / (2 * .02);
  const x = rho => 44 + 202 * rho / xmax;
  const y = delay => 158 - 126 * Math.min(delay / ymax, 1);
  let svg = `<rect x="${x(1)}" y="32" width="${246-x(1)}" height="126" fill="#fff0f3"/>`;
  for (let i=0;i<=2;i++) {
    const delay=ymax*i/2;
    svg+=`<line x1="44" y1="${y(delay)}" x2="246" y2="${y(delay)}" stroke="#e5ebf0"/><text x="39" y="${y(delay)+3}" text-anchor="end">${fmt(delay,4)}</text>`;
  }
  for (const rho of [0,1,xmax]) svg+=`<text x="${x(rho)}" y="176" text-anchor="middle">${fmt(rho,2)}</text>`;
  svg+=`<path d="M44 32 V158 H246" fill="none" stroke="#8191a0"/><line x1="${x(1)}" y1="32" x2="${x(1)}" y2="158" stroke="#a87783" stroke-dasharray="3 3"/><text x="${x(1)}" y="23" text-anchor="middle">Capacity</text><text x="145" y="201" text-anchor="middle">Traffic intensity (La/R)</text><text transform="translate(11 95) rotate(-90)" text-anchor="middle">Delay (ms)</text>`;
  let curve='';
  for(let i=0;i<=196;i++){
    const rho=i/200, delay=m.service*rho/(2*(1-rho));
    curve+=(i?'L':'M')+x(rho).toFixed(2)+','+y(delay).toFixed(2);
  }
  svg+=`<path d="${curve}" fill="none" stroke="#bf2f49" stroke-width="2"/><line x1="${x(m.rho)}" y1="32" x2="${x(m.rho)}" y2="158" stroke="#4d88bd" stroke-dasharray="2 3" opacity=".6"/>`;
  function marker(delay, color, filled) {
    if(delay>ymax) return `<path d="M-4 5 L0 0 L4 5 M0 0 V12" transform="translate(${x(m.rho)} 32)" fill="none" stroke="${color}" stroke-width="2"/>`;
    return `<circle cx="${x(m.rho)}" cy="${y(delay)}" r="${filled?3.5:5.5}" fill="${filled?color:'white'}" stroke="${color}" stroke-width="2"/>`;
  }
  if(m.rho<1) svg+=marker(m.delay,'#bf2f49',false);
  const measured=queueSim.started?queueSim.waitSum/queueSim.started*1000:null;
  if(measured!==null) svg+=marker(measured,'#4d88bd',true);
  $('sim-mini-plot').innerHTML=svg;
  const load='Load: '+fmt(m.rho*100,1)+'%';
  const detail=m.rho>=1?'No finite predicted delay.':measured===null?'Press Play to see measured delay.':'Measured: '+measured.toFixed(2)+' ms';
  $('sim-mini-readout').textContent=load+' · '+detail;
  $('sim-mini-description').textContent=load+'. '+(m.rho<1?'Predicted delay '+fmt(m.delay,6)+' ms. ':'No finite predicted delay. ')+(measured===null?'No measured samples yet.':'Measured average delay since restart '+fmt(measured,6)+' ms.');
}
function renderSimulation(forceChart=false, wall=performance.now()) {
  const currentLoad = state.arrival * state.bytes * 8 / state.rate;
  document.querySelectorAll('[data-load]').forEach(button => {
    const selected = !queueSim.burst && Math.abs(currentLoad - Number(button.dataset.load)) < 1e-9;
    button.setAttribute('aria-pressed', String(selected));
  });
  $('sim-burst').setAttribute('aria-pressed', String(Boolean(queueSim.burst)));
  $('sim-play').textContent=simPlaying?'Pause':'Play';
  $('sim-play').dataset.tooltip=simPlaying?'Pause simulation':'Play simulation';
  $('sim-play').disabled=false;
  $('sim-state').textContent=simPlaying?(queueSim.length>=queueSim.capacity?'Running ? Queue full':'Running'):'Paused';
  $('sim-clock').textContent='Simulated elapsed time: '+fmt(queueSim.time*1000,4)+' ms';
  $('sim-scale').textContent=`${simSpeed}×: 1 screen second = ${fmt(queueSim.baseline*4*simSpeed*1000,3)} ms simulated`;
  $('sim-count').textContent=fmt(queueSim.length,0);
  $('sim-occupancy').textContent=`FIFO · ${queueSim.length} / ${queueSim.capacity} packets`;
  $('sim-queue-bay').classList.toggle('is-full', queueSim.length >= queueSim.capacity);
  $('sim-dropped').textContent=fmt(queueSim.dropped,0);
  $('sim-loss-rate').textContent=(queueSim.arrived?100*queueSim.dropped/queueSim.arrived:0).toFixed(2)+'%';
  const dropAge=queueSim.lastDrop?(queueSim.time-queueSim.lastDrop.time)/(queueSim.baseline*1.5):Infinity;
  $('sim-drop').textContent=queueSim.lastDrop?'× Packet '+queueSim.lastDrop.id+' dropped':'';
  $('sim-drop').style.opacity=dropAge<1?String(1-dropAge):'0';
  $('sim-drop').style.transform=motion.matches?'none':`translateY(${Math.min(1,dropAge)*12}px)`;
  $('sim-transmitted').textContent=fmt(queueSim.transmitted,0);
  $('sim-measured').textContent=queueSim.started?(queueSim.waitSum/queueSim.started*1000).toFixed(2)+' ms':'No samples yet';
  const prediction=metrics(state).delay;
  $('sim-theory').textContent=Number.isFinite(prediction)?fmt(prediction,8)+' ms':'At capacity or overloaded \u2014 an unlimited queue cannot keep up.';
  if (lastQueueCount!==queueSim.length) {
    $('sim-queue').innerHTML=queueSim.length?'<i></i>'.repeat(Math.min(20,queueSim.length)):'<span class="sim-queue-empty">Queue empty</span>';
    $('sim-overflow').textContent=queueSim.length>20?'+ '+fmt(queueSim.length-20,0)+' more waiting':'Front of queue →';
    lastQueueCount=queueSim.length;
  }
  const p=queueSim.active;
  $('sim-serving').textContent=p?'Packet '+fmt(p.id,0):'Link idle';
  $('sim-progress').style.width=p?(100*(1-p.remaining/p.bits))+'%':'0%';
  $('sim-remaining').textContent=p?fmt(p.remaining,0)+' bits remaining':'Ready to transmit';
  // Packet travel is illustrative; event times and statistics remain authoritative.
  for(const [id,event] of [['sim-incoming',queueSim.lastArrival],['sim-outgoing',queueSim.lastDeparture]]) {
    const age=event?(queueSim.time-event.time)/(queueSim.baseline*.8):Infinity;
    $(id).style.opacity=age<=1?'1':'0';
    $(id).style.left=(motion.matches?50:Math.min(1,age)*70)+'%';
  }
  $('sim-scene').setAttribute('aria-label',`${queueSim.length} of ${queueSim.capacity} queue spaces occupied, ${p?'packet '+p.id+' transmitting':'link idle'}, ${queueSim.transmitted} packets transmitted, ${queueSim.dropped} packets dropped.`);
  const message=queueSim.burst?'Traffic burst active for 20 baseline transmission times (2.4 simulated ms). The previous arrival rate will return automatically. Manual parameter changes cancel restoration.':simNotice;
  if ($('sim-message').textContent!==message) $('sim-message').textContent=message;
  if(forceChart||wall-lastChartWall>=100){renderHistory();renderMiniIntensity();lastChartWall=wall;}
}
$('sim-play').addEventListener('click',()=>{
  if(simPlaying){pauseSimulation('Paused. Press Play to resume.');return;}
  if(document.hidden)return;
  simPlaying=true;simLastWall=null;simNotice='Traffic is flowing. Change the load or link rate to explore the queue.';
  renderSimulation(true);simFrame=requestAnimationFrame(simulationTick);
});
function restartSimulation(){
  simPlaying=false;cancelAnimationFrame(simFrame);simLastWall=null;
  queueSim.restart(state);lastQueueCount=-1;
  simNotice='Simulation restarted with an empty queue and fresh measurements. Press Play to begin.';
  renderSimulation(true);
}
$('sim-restart').addEventListener('click',restartSimulation);
$('sim-buffer').addEventListener('change',event=>{
  const capacity=Number(event.target.value);
  if(![5,10,20,50,100].includes(capacity))return;
  queueSim.capacity=capacity;
  restartSimulation();
});
$('reset').addEventListener('click',()=>{
  simSpeed=1;
  queueSim.capacity=20;
  $('sim-buffer').value='20';
  document.querySelectorAll('[data-sim-speed]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.simSpeed)===1)));
  restartSimulation();
});
document.querySelectorAll('[data-sim-speed]').forEach(button=>button.addEventListener('click',()=>{
  simSpeed=Number(button.dataset.simSpeed);simLastWall=null;
  document.querySelectorAll('[data-sim-speed]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  renderSimulation(true);
}));
document.querySelectorAll('[data-load]').forEach(button=>button.addEventListener('click',()=>setArrival(Number(button.dataset.load)*state.rate/(state.bytes*8))));
$('sim-burst').addEventListener('click',()=>{
  queueSim.startBurst();state.arrival=queueSim.params.arrival;update();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&simPlaying)pauseSimulation('Paused because the tab was hidden. Press Play to resume.');});
const viewTabs = [$('tab-intensity'), $('tab-simulation')];
function setupSimulationTooltips() {
  const toolbar = simulationPanel.querySelector('.sim-toolbar');
  const tip = document.createElement('div');
  tip.id = 'sim-toolbar-tooltip';
  tip.className = 'sim-toolbar-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);
  let active = null, hideTimer;
  function hide() {
    clearTimeout(hideTimer);
    tip.hidden = true;
    if (active) {
      const ids = (active.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== tip.id);
      if (ids.length) active.setAttribute('aria-describedby', ids.join(' '));
      else active.removeAttribute('aria-describedby');
    }
    active = null;
  }
  function show(control) {
    hide();
    active = control;
    tip.textContent = control.dataset.tooltip;
    tip.hidden = false;
    control.setAttribute('aria-describedby', [control.getAttribute('aria-describedby'), tip.id].filter(Boolean).join(' '));
    const bounds = control.getBoundingClientRect(), bar = toolbar.getBoundingClientRect();
    const box = tip.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(window.innerWidth - box.width - 8, bounds.left + bounds.width/2 - box.width/2)) + 'px';
    tip.style.top = (bar.bottom + box.height + 16 <= window.innerHeight ? bar.bottom + 8 : Math.max(8, bar.top - box.height - 8)) + 'px';
  }
  function deferHide() { clearTimeout(hideTimer); hideTimer = setTimeout(hide, 180); }
  toolbar.querySelectorAll('[data-tooltip]').forEach(control => {
    control.addEventListener('pointerenter', () => show(control));
    control.addEventListener('pointerleave', deferHide);
    control.addEventListener('focus', () => show(control));
    control.addEventListener('blur', hide);
    control.addEventListener('click', () => { if (active === control) show(control); });
  });
  tip.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  tip.addEventListener('pointerleave', deferHide);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  viewTabs.forEach(tab => tab.addEventListener('click', hide));
}
function selectExplorerView(index) {
  if (index === 0 && simPlaying) pauseSimulation('Paused while viewing the intensity graph. Press Play to resume.');
  viewTabs.forEach((tab, i) => {
    tab.setAttribute('aria-selected', String(i === index));
    tab.tabIndex = i === index ? 0 : -1;
  });
  $('intensity-panel').hidden = index !== 0;
  simulationPanel.hidden = index !== 1;
  if (index === 1) renderSimulation(true);
}
viewTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectExplorerView(index));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = 1 - index;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 1;
    else return;
    event.preventDefault();
    selectExplorerView(next);
    viewTabs[next].focus();
  });
});
setupSimulationTooltips();
renderSimulation(true);
