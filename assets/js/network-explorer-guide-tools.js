(function(){
'use strict';const welcome=document.getElementById('network-welcome'),guide=document.getElementById('welcome-guide');if(!guide)return;
guide.querySelectorAll('.guide-features article').forEach(article=>{const heading=document.createElement('div');heading.className='guide-feature-heading';heading.append(article.querySelector('.guide-feature-icon'),article.querySelector('span'));article.prepend(heading);});
const panels=document.createElement('div');panels.className='guide-tools';
panels.innerHTML='<section class="guide-tool-section"><div class="guide-tool-copy"><span class="guide-kicker">INTEGRATED TERMINAL</span><h3>Use the CLI.<br>Master common commands.</h3><p>Build confidence at the prompt. Inspect addresses, test connectivity, resolve names, and trace a route with commands matched to the selected device OS.</p><p>Switch between Windows, Linux, macOS, Cisco IOS, and PAN-OS. Use command history, Tab completion, and <strong>@ device IP lookup</strong> to keep your attention on the network.</p><button type="button" data-action="example-complex">Practice in Campus network <span aria-hidden="true">&#8599;</span></button></div><div class="guide-cli-demo"><div class="guide-os-choices" role="group" aria-label="Preview commands by operating system"></div><div class="guide-terminal-preview"><div class="guide-terminal-caption">COMMAND PRACTICE / <span id="guide-cli-os"></span></div><div id="guide-cli-lines" aria-live="polite"></div><div class="guide-terminal-foot">Illustrative commands &middot; select a device in the lab to run them</div></div></div></section><section class="guide-tool-section guide-activity-section"><div class="guide-tool-copy"><span class="guide-kicker">INTEGRATED ACTIVITY MONITOR</span><h3>Inspect traffic<br>like a pro.</h3><p>A Wireshark-like view makes the exchange visible. Filter captured traffic, follow the latest events, and select a frame to inspect its protocol fields.</p><p>Connect what you typed to what crossed the wire: MAC addresses, IP addresses, protocols, and the details behind each step.</p><button type="button" data-action="example-http">Follow a web request <span aria-hidden="true">&#8599;</span></button></div><div class="guide-capture-demo"><div class="guide-capture-toolbar"><strong>Activity</strong><span>Illustrative capture</span></div><div class="guide-capture-scroll"><table><thead><tr><th>No.</th><th>Protocol</th><th>Info</th></tr></thead><tbody></tbody></table></div><div class="guide-packet-detail" aria-live="polite"></div><small>Select a row to inspect the example packet.</small></div></section>';
guide.querySelector('.guide-features').after(panels);
const troubleshooting=document.createElement('section');
troubleshooting.className='guide-tool-section guide-troubleshooting-section';
troubleshooting.innerHTML='<div class="guide-tool-copy"><span class="guide-kicker guide-tool-label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4M12 2V1"/></svg>INCIDENTS</span><h3>Something’s wrong.<br>You’re on the case.</h3><p>Choose a practice area in New incident. Search, filter, or randomize; use your current network or load a prepared one. Then investigate the hidden fault.</p><p>Investigate with the Terminal, Activity, and Inspector. Get a hint or a nudge with Look here, reveal the fault when you need it, and check your repair to confirm the connection works again.</p><button type="button" data-action="open-troubleshooting">Open Incidents <span aria-hidden="true">&#8599;</span></button></div><div class="guide-troubleshooting-preview" aria-label="Incidents workflow"><div><span>01</span><p><strong>Take the call.</strong>A missing gateway, a disabled port, or a missing service. Something needs your attention.</p></div><div><span>02</span><p><strong>Follow the evidence.</strong>Test a connection, inspect the configuration, and use hints when you get stuck.</p></div><div><span>03</span><p><strong>Bring it back online.</strong>Repair the fault, check the result, and explain your fix.</p></div></div>';

const toolGlyphs=['<rect x="2" y="3" width="20" height="18" rx="3"/><path d="M2 8h20M6 12l3 3-3 3m6 0h5"/>','<path d="M3 5h18M3 12h18M3 19h18"/><rect x="6" y="2" width="5" height="6" rx="1"/><rect x="14" y="9" width="5" height="6" rx="1"/><rect x="5" y="16" width="5" height="6" rx="1"/>'];
panels.querySelectorAll('.guide-tool-copy>.guide-kicker').forEach((label,i)=>{label.classList.add('guide-tool-label');label.insertAdjacentHTML('afterbegin','<svg viewBox="0 0 24 24" aria-hidden="true">'+toolGlyphs[i]+'</svg>');});

const trafficPreview=troubleshooting.querySelector('.guide-troubleshooting-preview');
trafficPreview.setAttribute('aria-label','Animated illustration: packets stream across a connection, then fade at a broken link before the connection recovers.');
trafficPreview.innerHTML='<svg class="guide-fault-scene" viewBox="0 0 520 250" role="img" aria-label="Traffic stops at a broken connection"><defs><linearGradient id="fault-cable-depth" gradientUnits="userSpaceOnUse" x1="0" y1="122" x2="0" y2="166"><stop stop-color="#a5c3da"/><stop offset=".45" stop-color="#6089ae"/><stop offset="1" stop-color="#517796"/></linearGradient></defs><path class="fault-route" d="M100 128C160 128 170 158 240 158H280C350 158 350 128 420 128"/><g class="fault-cable"><path class="fault-left" d="M100 128C160 128 170 158 240 158"/><path d="M280 158C350 158 350 128 420 128"/><path class="fault-bridge" d="M240 158H280"/></g><g class="fault-cable-glint"><path d="M100 125C160 125 170 155 240 155M280 155C350 155 350 125 420 125"/><path class="fault-bridge" d="M240 155H280"/></g><g class="fault-gap"><ellipse cx="260" cy="158" rx="36" ry="29" fill="#f6ded5" stroke="none" opacity=".45"/><path class="fault-jacket" d="m233 151 8 1-3 4 5 3-5 3 2 3-7 1m54-15-8 1 3 4-5 3 5 3-2 3 7 1"/><path stroke="#d19355" d="m240 153 9-4 4 2m27 2-9-6-4 1"/><path stroke="#739ba1" d="m240 158 8 1 5 5m27-6-8 2-4-3"/><path stroke="#c57f68" d="m240 163 7 6 5-1m28-5-7 7-5 1"/><g class="fault-sparks"><path d="m258 137 5-9m12 12 8-5m-28 44-4 8m23-9 6 6"/></g></g><g class="fault-connectors" fill="#d8e5e9" stroke="#5f7c8a" stroke-width="1.3"><rect x="95" y="121" width="15" height="14" rx="3"/><rect x="410" y="121" width="15" height="14" rx="3"/><path d="M100 123v10m4-10v10m312-10v10m4-10v10"/></g><g class="fault-packets"></g><g transform="translate(61 128)" style="color:#52758c">'+window.NetworkExplorerIcons.device({type:'host',os:'windows'})+'</g><g transform="translate(459 128)" style="color:#52758c">'+window.NetworkExplorerIcons.device({type:'host',os:'linux'})+'</g><text x="61" y="187">Sender</text><text x="459" y="187">Receiver</text><g class="fault-state"><circle cx="180" cy="44" r="4"/><text x="194" y="49" text-anchor="start">Traffic flowing</text></g><g class="fault-alert-bell" transform="translate(118 210) scale(.75)" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4M2 8a10 10 0 0 1 3-6m17 6a10 10 0 0 0-3-6"/></g><text class="fault-caption" x="260" y="225">One connection. A steady stream of packets.</text></svg>';
const faultScene=trafficPreview.querySelector('svg'), packetLayer=trafficPreview.querySelector('.fault-packets');
const faultBanner=document.createElementNS('http://www.w3.org/2000/svg','g');
faultBanner.setAttribute('class','fault-alert-banner');
faultBanner.innerHTML='<rect class="fault-pill" x="58" y="199" width="404" height="36" rx="18"/><text class="fault-pill-label" x="260" y="222">NETWORK DOWN — THE NOC IS ON IT.</text>';
faultScene.insertBefore(faultBanner,faultScene.querySelector('.fault-alert-bell'));
faultScene.querySelector('.fault-alert-bell').remove();
faultScene.querySelector('.fault-state circle').remove();
const trafficRoute=faultScene.querySelector('.fault-route'), routeLength=trafficRoute.getTotalLength(), breakLength=faultScene.querySelector('.fault-left').getTotalLength()-12, breakAge=2.67*breakLength/routeLength;
const packetNodes=Array.from({length:5},()=>{const packet=document.createElementNS('http://www.w3.org/2000/svg','g');packet.classList.add('fault-frame');packet.innerHTML='<rect class="frame-shell" x="-12" y="-7" width="24" height="14" rx="2.5"/><path class="frame-header" d="M-9-4h5v8h-5Z"/><path class="frame-payload" d="M-1-3h6M-1 0h9M-1 3h6"/><path class="frame-check" d="M9-4v8"/>';packetLayer.append(packet);return packet;});
const reducedFaultMotion=matchMedia('(prefers-reduced-motion: reduce)');
let faultFrame=0, faultStart=0, faultVisible=false, faultPhase='';
function drawFaultTraffic(seconds){
  const cycle=seconds%12, broken=cycle>=4&&cycle<9;
  const phase=broken?'broken':cycle>=9?'restored':'flowing';
  if(phase!==faultPhase){
    faultPhase=phase; faultScene.dataset.phase=phase;
    const statusText=faultScene.querySelector('.fault-state text');
    statusText.textContent='●  '+(broken?'Connection lost':phase==='restored'?'Connection restored':'Traffic flowing');
    statusText.setAttribute('x','260');
    faultScene.querySelector('.fault-caption').textContent=broken?'Network down — the NOC is on it.':phase==='restored'?'Back online. The stream resumes.':'One connection. A steady stream of packets.';
  }
  // Fade up into the outage, then fade down before the connection recovers.
  const ramp=broken?Math.max(0,Math.min(1,(cycle-4)/.65,(9-cycle)/.65)):0;
  const visibility=ramp*ramp*(3-2*ramp);
  faultBanner.setAttribute('opacity',String(visibility));
  faultBanner.setAttribute('transform',`translate(0 ${reducedFaultMotion.matches?0:14*(1-visibility)})`);
  faultBanner.setAttribute('aria-hidden',String(!broken));
  const latest=Math.floor(seconds/.8);
  packetNodes.forEach((packet,i)=>{
    const birth=(latest-i)*.8, age=seconds-birth, arrival=birth+breakAge;
    const blocked=arrival%12>=4&&arrival%12<9;
    const fading=blocked&&age>=breakAge, fade=fading?Math.min(1,(age-breakAge)/.55):0;
    const opacity=birth<0||age>2.67?0:1-fade;
    const distance=Math.max(0,Math.min(age/2.67*routeLength,blocked?breakLength:routeLength));
    const point=trafficRoute.getPointAtLength(distance), ahead=trafficRoute.getPointAtLength(Math.min(routeLength,distance+1));
    const angle=Math.atan2(ahead.y-point.y,ahead.x-point.x)*180/Math.PI;
    packet.setAttribute('transform',`translate(${point.x} ${point.y-fade*9}) rotate(${angle+fade*12}) scale(${1-fade*.25})`);
    packet.setAttribute('opacity',String(opacity));
    packet.classList.toggle('is-lost',fading);
  });
}
function animateFaultTraffic(now){
  if(!faultVisible||document.hidden)return;
  if(!faultStart)faultStart=now;
  drawFaultTraffic((now-faultStart)/1000);
  faultFrame=requestAnimationFrame(animateFaultTraffic);
}
function syncFaultAnimation(){
  cancelAnimationFrame(faultFrame);
  if(reducedFaultMotion.matches){drawFaultTraffic(6);return;}
  if(faultVisible&&!document.hidden)faultFrame=requestAnimationFrame(animateFaultTraffic);
}
new IntersectionObserver(entries=>{faultVisible=entries[0].isIntersecting;if(faultVisible)faultStart=0;syncFaultAnimation();},{threshold:.15}).observe(trafficPreview);
reducedFaultMotion.addEventListener('change',syncFaultAnimation);
document.addEventListener('visibilitychange',syncFaultAnimation);
drawFaultTraffic(0);
panels.append(troubleshooting);
const supported=document.createElement('section');supported.className='guide-supported';supported.innerHTML='<div><span class="guide-kicker">THE NETWORK PALETTE</span><h3>Everything you need to build.</h3><p>Place devices, add network services, and annotate your topology.</p></div><div class="guide-palette-grid" aria-label="Supported devices and applications"></div>';
for(const id of ['add-host','add-switch','add-router','add-firewall','add-dhcp-application','add-dns-application','add-web-application','add-browser-application','add-note']){const source=document.getElementById(id),item=document.createElement('div');item.className='guide-palette-item';const glyph=source.querySelector('svg').cloneNode(true);glyph.removeAttribute('id');glyph.setAttribute('aria-hidden','true');const label=document.createElement('span');label.textContent=source.textContent.trim();item.append(glyph,label);supported.querySelector('.guide-palette-grid').append(item);}panels.prepend(supported);

const connections=document.createElement('section');connections.className='guide-tool-section guide-connections-section';
const portDrawing='<path class="guide-socket" d="M5 3h34v20H28v6H16v-6H5z"/><path class="guide-contacts" d="M12 6v7m5-7v7m5-7v7m5-7v7m5-7v7"/><path class="guide-socket-edge" d="M9 19h7v5h12v-5h7"/>';
const portScene=Array.from({length:8},(_,i)=>{const x=25+(i%4)*85,y=i<4?28:88;return '<g transform="translate('+x+' '+y+')" class="guide-port '+(i===0?'guide-port-live':i>=1&&i<=3?'guide-port-target':'')+'"><text x="22" y="-3">P'+(i+1)+'</text>'+portDrawing+'<rect class="guide-link-light" x="37" y="34" width="10" height="5" rx="2.5"/></g>';}).join('');
const switchLogo=window.NetworkExplorerIcons.os('cisco').replace('<svg ','<svg x="22" y="-13" width="25" height="25" ');
const switchFace='<defs><linearGradient id="guide-switch-metal" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f0f1f2"/><stop offset=".45" stop-color="#d6d9dc"/><stop offset="1" stop-color="#b7bdc2"/></linearGradient></defs><g class="guide-switch-face"><rect x="8" y="-20" width="334" height="164" rx="7"/><path class="guide-switch-rim" d="M15-16h320M13 139h324"/><path class="guide-switch-header-rule" d="M19 15h312"/>'+switchLogo+'<text class="guide-switch-brand" x="53" y="4">CISCO</text><text class="guide-switch-model" x="324" y="3">8-PORT GIGABIT SWITCH</text><g class="guide-switch-screws"><g transform="translate(16 -10)"><circle r="3"/><path d="M-1.5 0h3M0-1.5v3"/></g><g transform="translate(334 -10)"><circle r="3"/><path d="M-1.5 0h3M0-1.5v3"/></g><g transform="translate(16 134)"><circle r="3"/><path d="M-1.5 0h3M0-1.5v3"/></g><g transform="translate(334 134)"><circle r="3"/><path d="M-1.5 0h3M0-1.5v3"/></g></g><path class="guide-switch-vents" d="M270 133h8m5 0h8m5 0h8m5 0h8"/></g>';
connections.innerHTML='<div class="guide-tool-copy"><span class="guide-kicker guide-tool-label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v5m10-5v5M5 8h14v5a7 7 0 0 1-14 0ZM12 20v3"/></svg>CONNECT THE INTERFACES</span><h3>Plug in.<br>Watch the link come alive.</h3><p>Build connections one port at a time. Choose a device, pick an available interface, and connect the other end of the cable.</p><p>See which ports are connected at a glance. Link indicators light up when the connection is active, and flash as traffic passes through.</p><button type="button" data-action="example-dhcp">Explore a connected LAN <span aria-hidden="true">&#8599;</span></button></div><div class="guide-port-demo"><svg class="guide-port-scene" viewBox="0 -28 350 224" role="img" aria-label="Eight interface ports. P1 already has a cable connected. A second cable plugs into P2, its link light turns green, and active ports flash.">'+switchFace+portScene+'<g transform="translate(0 -84)"><g class="guide-plug-motion"><path class="guide-cable" d="M132 157v19c0 15 20 20 20 40v60"/><path class="guide-cable-shine" d="M130 159v17c0 15 20 20 20 40v60"/><path class="guide-plug-boot" d="M122 145h20l-2 17h-16Z"/><path class="guide-boot-ribs" d="M123 149h18m-17 4h16m-15 4h14"/><path class="guide-plug-body" d="M119 120h26v28l-4 5h-18l-4-5Z"/><path class="guide-plug-highlight" d="M122 144v-21h20"/><path class="guide-plug-pins" d="M123 122v9m2.5-9v9m2.5-9v9m2.5-9v9m2.5-9v9m2.5-9v9m2.5-9v9m2.5-9v9"/><path class="guide-plug-wires" d="M124 133v9m5-9v10m5-10v10m5-10v9"/><path class="guide-plug-latch" d="M128 136h8l2 15h-12Z"/></g><g transform="translate(132 120)" aria-hidden="true"><g class="guide-plug-click"><path d="m-18-5-5-4m23-4v-6m18 14 5-4"/><text x="0" y="-14">Click!</text></g></g></g></svg><div class="guide-port-caption"><span class="guide-connecting-caption">Connecting to P2...</span><span class="guide-connected-caption">Link up. Traffic is flowing.</span></div><small>Illustrated connection sequence</small></div>';
const connectedCable=connections.querySelector('.guide-plug-motion').cloneNode(true);
connectedCable.setAttribute('class','guide-plug-connected');
connectedCable.setAttribute('transform','translate(-85 -84)');
connectedCable.querySelector('.guide-cable').setAttribute('d','M132 157v19c0 15 20 20 20 40v60');
connectedCable.querySelector('.guide-cable-shine').setAttribute('d','M130 159v17c0 15 20 20 20 40v60');
const connectionScene=connections.querySelector('.guide-port-scene');
connectionScene.insertBefore(connectedCable,connectionScene.querySelector('.guide-plug-motion').parentElement);
const firstConnection=connections.querySelector('.guide-plug-motion').parentElement;
firstConnection.setAttribute('data-guide-connection','2');
for(const number of [3,4]){const next=firstConnection.cloneNode(true);next.setAttribute('data-guide-connection',String(number));next.setAttribute('transform','translate('+((number-2)*85)+' -84)');connectionScene.append(next);}
connections.querySelectorAll('.guide-port-target').forEach((port,i)=>port.setAttribute('data-guide-port',String(i+2)));
connections.querySelector('.guide-connecting-caption').textContent='P2, P3, P4. One connection at a time.';
connections.querySelector('.guide-connected-caption').remove();
connectionScene.setAttribute('aria-label','P1 is connected. Cables plug into P2, P3, then P4, each with a Click and flashing activity lights.');
supported.after(connections);

const notes=document.createElement('section');notes.className='guide-tool-section guide-notes-section';notes.innerHTML='<div class="guide-tool-copy"><span class="guide-kicker guide-tool-label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.5h14a1.5 1.5 0 0 1 1.5 1.5v10L15 20.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5ZM15 20.5V15h5.5M7.5 8h9M7.5 11.5h6"/></svg>NOTES ON THE CANVAS</span><h3>Keep the explanation<br>with the network.</h3><p>Turn a topology into a walkthrough. Place a note anywhere, or associate it with a device or application so the context stays close.</p><p>Add an optional title, choose a color, and organize with tags. Type <strong>@</strong> to mention a device, then follow its link from the note. Search notes, preview them on hover, or pin one open and drag it by its handle.</p><button type="button" data-action="example-complex">Explore the Campus notes <span aria-hidden="true">&#8599;</span></button></div><div class="guide-note-illustration"><div class="guide-note-preview"><div class="guide-note-heading"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" stroke-width="3"/></svg><strong>Client setup</strong><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l-1 6 4 4v2H6v-2l4-4ZM12 15v6"/></svg></div><div class="guide-note-body"><p>Start with <span class="guide-note-mention"><svg viewBox="-42 -35 84 72" aria-hidden="true">'+window.NetworkExplorerIcons.device({type:'host',os:'windows'})+'</svg>Browser Client</span> and acquire a DHCP lease.</p><p>Check the IP, gateway, and DNS server before opening the campus website.</p><div class="guide-note-tags">#walkthrough &nbsp; #client &nbsp; #DHCP</div></div></div><div class="guide-note-colors" aria-label="Note colors"><span style="background:#f8f1bb"></span><span style="background:#dcebf8"></span><span style="background:#dcefdc"></span><span style="background:#f4dce7"></span><small>A little context goes a long way.</small></div></div>';panels.append(notes);

const search=document.createElement('section');search.className='guide-tool-section guide-search-section';
search.innerHTML='<div class="guide-tool-copy"><span class="guide-kicker guide-tool-label"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>SEARCH YOUR NETWORK</span><h3>Find your stuff,<br>see it work.</h3><p>Jump straight to the device or note you need. Search names, IP addresses, operating systems, installed services, or the words in a note.</p><p>Use <strong>#tags</strong> to narrow your results. Choose a match to locate it on the canvas and open its details, then use the Terminal and Activity monitor to see it in action.</p><button type="button" data-action="example-complex">Search the Campus network <span aria-hidden="true">&#8599;</span></button></div><div class="guide-search-demo"><label for="guide-search-query">Try a search</label><div class="guide-search-input"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg><input id="guide-search-query" type="search" placeholder="Device, note, tag, OS, IP..." autocomplete="off"></div><div class="guide-search-matches" aria-live="polite"></div><small>Illustrative results &middot; search your live topology in the lab.</small></div>';
panels.append(search);
const searchRows=[['Browser Client','Windows host &middot; 192.168.10.10 &middot; Web browser','host','client'],['Campus Router','Cisco IOS &middot; 192.168.10.1','router','routing'],['Client setup','Note &middot; Acquire a DHCP lease &middot; #walkthrough #client','note','walkthrough client']];
const renderSearch=()=>{const q=search.querySelector('input').value.toLowerCase().trim().replace(/^#/,'');const results=search.querySelector('.guide-search-matches');results.replaceChildren();for(const [name,detail,type,tags] of searchRows.filter(r=>r.join(' ').toLowerCase().includes(q))){const row=document.createElement('div');row.className='guide-search-result';const icon=type==='note'?document.querySelector('#add-note svg').outerHTML:'<svg viewBox="-42 -35 84 72" aria-hidden="true">'+window.NetworkExplorerIcons.device({type,os:'windows'})+'</svg>';row.innerHTML=icon+'<div><strong>'+name+'</strong><small>'+detail+'</small></div>';results.append(row);}if(!results.children.length)results.textContent='No matches. Try Windows, 192.168, or #client.';};
search.querySelector('input').addEventListener('input',renderSearch);renderSearch();

const systems=[['windows','Windows',[['ipconfig','Inspect the host IP configuration'],['arp -a','Check learned IP-to-MAC mappings'],['tracert 192.168.30.10','Trace the path to a remote host']]],['linux','Linux',[['ip addr','Inspect interface addresses'],['ip neigh','Check the neighbor table'],['traceroute 192.168.30.10','Trace the path to a remote host']]],['macos','macOS',[['ifconfig','Inspect interface configuration'],['arp -a','Check learned IP-to-MAC mappings'],['nslookup www.campus.example','Resolve a DNS name']]],['cisco','Cisco IOS',[['show ip interface brief','Review interface addresses and status'],['show ip route','Inspect the routing table'],['show arp','Review next-hop MAC addresses']]],['paloalto','PAN-OS',[['show interface all','Review interfaces'],['show routing route','Inspect the routing table'],['show arp all','Review ARP entries']]]];
const security=document.createElement('section');
security.className='guide-tool-section guide-security-section';
security.setAttribute('aria-labelledby','guide-security-title');
security.innerHTML='<div class="guide-tool-copy"><span class="guide-kicker">NETWORK SECURITY</span><h3 id="guide-security-title">Protect the service.<br>Follow the evidence.</h3><p>Explore confidentiality, access control, and availability in a working network. Follow simulated packets, inspect alerts, and see what changes when you strengthen its defenses.</p><p>Start with a guided security example, make a change, and verify that legitimate HTTPS access still works.</p><button type="button" data-action="example-security-encrypt">Start with HTTPS <span aria-hidden="true">&#8599;</span></button></div><div class="guide-security-topics"><article><h4>HTTPS &amp; certificates</h4><p>Compare HTTP with encrypted TLS records. Explore certificate trust and hostname checks.</p><button type="button" data-action="example-https">Explore HTTPS &#8599;</button></article><article><h4>Nmap &amp; firewalls</h4><p>Scan for open, closed, and filtered ports. Reduce exposed services with firewall rules.</p><button type="button" data-action="example-security-harden">Harden access &#8599;</button></article><article><h4>IDS &amp; IPS</h4><p>Inspect port-scan alerts and compare detection with active prevention.</p><button type="button" data-action="example-security-prevent">Detect versus prevent &#8599;</button></article><article><h4>DoS &amp; availability</h4><p>Watch a simulated SYN burst fill connection slots, then protect legitimate access.</p><button type="button" data-action="example-dos">Keep HTTPS available &#8599;</button></article></div>';
const securityArt=[
  '<rect x="24" y="8" width="58" height="62" rx="6" fill="#edf4fa"/><path d="M35 22h24m-24 9h32m-32 9h18"/><circle cx="65" cy="53" r="9" fill="#e7f4f1" stroke="#287d78"/><path d="m61 53 3 3 5-6" stroke="#287d78"/><rect x="94" y="35" width="32" height="28" rx="5" fill="#e7f4f1" stroke="#287d78"/><path d="M101 35v-9a9 9 0 0 1 18 0v9m-9 11v7" stroke="#287d78"/>',
  '<path d="M14 24h26m-26 16h26m-26 16h26" stroke="#7aa5bf" stroke-dasharray="3 5"/><g transform="translate(91 40) scale(.8)">'+window.NetworkExplorerIcons.device({type:'firewall'})+'</g>',
  '<path d="M80 8 108 18v20c0 16-17 29-28 34-11-5-28-18-28-34V18Z" fill="#e7f4f1" stroke="#287d78"/><path d="M60 37q20-23 40 0-20 23-40 0Z" fill="#fff"/><circle cx="80" cy="37" r="5" fill="#bad1e2"/><path d="m72 57 6 6 12-13" stroke="#287d78"/>',
  '<rect x="86" y="10" width="47" height="60" rx="6" fill="#edf4fa"/><path d="M86 30h47M86 50h47M96 20h12m-12 20h12m-12 20h12"/><path d="M12 20h49m-49 20h49m-49 20h49" stroke="#7aa5bf" stroke-dasharray="4 5"/><path d="M69 12v56" stroke="#287d78" stroke-width="4"/><circle cx="121" cy="20" r="2" fill="#287d78" stroke="none"/><circle cx="121" cy="40" r="2" fill="#287d78" stroke="none"/><path d="m114 59 5 5 8-10" stroke="#287d78"/>'
];
security.querySelectorAll('.guide-security-topics article').forEach((card,i)=>{
  const art=document.createElementNS('http://www.w3.org/2000/svg','svg');
  art.setAttribute('viewBox','0 0 160 80');
  art.setAttribute('aria-hidden','true');
  art.classList.add('guide-security-art');
  art.innerHTML=securityArt[i];
  card.prepend(art);
});
const magnifier=document.createElement('div');
magnifier.className='guide-security-magnifier';
magnifier.setAttribute('aria-hidden','true');
magnifier.innerHTML='<svg viewBox="0 0 120 120" focusable="false"><path d="m77 77 29 29" stroke="#344e61" stroke-width="16" stroke-linecap="round"/><path d="m80 79 25 25" stroke="#7297ad" stroke-width="8" stroke-linecap="round"/><circle cx="47" cy="47" r="35" fill="#d9f0fa" fill-opacity=".12" stroke="#365c74" stroke-width="7"/><circle cx="47" cy="47" r="30" fill="none" stroke="#a9cadb" stroke-width="2"/><path d="M25 43a23 23 0 0 1 19-19" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="4" stroke-linecap="round"/><path d="M34 67a23 23 0 0 0 31-18" fill="none" stroke="#84b1c7" stroke-opacity=".5" stroke-width="2" stroke-linecap="round"/></svg>';
const actor=document.createElementNS('http://www.w3.org/2000/svg','g');
actor.classList.add('guide-security-actor');
actor.innerHTML='<circle cx="47" cy="47" r="27" fill="#fff" fill-opacity=".96"/><g transform="translate(47 47) scale(.78) translate(-47 -47)"><path d="M27 64v-9c0-18 8-28 20-28s20 10 20 28v9c-11 9-29 9-40 0Z" fill="#91b6ca" stroke="#4d728b" stroke-width="1.5"/><path d="M35 44c1-10 6-15 12-15s11 5 12 15l-4 16H39Z" fill="#f6e5cd"/><path d="m33 43 14 3 14-3-3 12H36Z" fill="#496b85"/><path d="m38 48 6 1m6 0 6-1" stroke="#fff4d5" stroke-width="3" stroke-linecap="round"/><path d="m39 60 8 5 8-5" fill="none" stroke="#d8eaf3" stroke-width="2"/></g>';
magnifier.querySelector('svg').append(actor);
security.querySelector('.guide-security-topics').append(magnifier);
panels.prepend(security);
const inspectionArea=security.querySelector('.guide-security-topics');
const inspectionMotion=matchMedia('(prefers-reduced-motion: reduce)');
let inspectionAnimation=null,inspectionVisible=false,inspectionPosition={x:0,y:0,angle:0},inspectionLastCard=-1;
const inspectionTransform=p=>`translate(${p.x}px, ${p.y}px) rotate(${p.angle}deg)`;
function moveInspection(){
  if(inspectionMotion.matches||!inspectionVisible||document.hidden)return;
  const cards=[...inspectionArea.querySelectorAll('article')];
  const choices=cards.map((card,index)=>({card,index})).filter(item=>item.index!==inspectionLastCard);
  const {card,index}=choices[Math.floor(Math.random()*choices.length)];
  inspectionLastCard=index;
  // Keep the lens in the card's interior; travel may cross gaps, stops never do.
  const lensCenter=magnifier.clientWidth*47/120;
  const safeInset=magnifier.clientWidth*42/120+20;
  const jitterX=Math.max(0,card.clientWidth/2-safeInset);
  const jitterY=Math.max(0,card.clientHeight/2-safeInset);
  const target={
    x:card.offsetLeft+card.clientWidth/2+(Math.random()*2-1)*jitterX-lensCenter,
    y:card.offsetTop+card.clientHeight/2+(Math.random()*2-1)*jitterY-lensCenter,
    angle:Math.random()*16-8
  };
  magnifier.dataset.inspectionCard=String(index);
  const duration=900+Math.hypot(target.x-inspectionPosition.x,target.y-inspectionPosition.y)*4;
  inspectionAnimation=magnifier.animate([
    {transform:inspectionTransform(inspectionPosition)},
    {transform:inspectionTransform(target)}
  ],{duration,easing:'ease-in-out',fill:'forwards'});
  inspectionAnimation.onfinish=()=>{
    magnifier.style.transform=inspectionTransform(target);
    inspectionPosition=target;
    inspectionAnimation.cancel();
    inspectionAnimation=null;
    revealInspection();
  };
}
function revealInspection(){
  inspectionAnimation=actor.animate([
    {opacity:0,offset:0},
    {opacity:.5,offset:.25},
    {opacity:.5,offset:.7},
    {opacity:0,offset:1}
  ],{duration:1500,easing:'ease-in-out',fill:'forwards'});
  inspectionAnimation.onfinish=()=>{
    inspectionAnimation.cancel();inspectionAnimation=null;
    moveInspection();
  };
  updateInspection();
}
function updateInspection(){
  if(inspectionMotion.matches){
    inspectionAnimation?.cancel();inspectionAnimation=null;
    magnifier.style.transform='none';inspectionPosition={x:0,y:0,angle:0};
  }else if(!inspectionVisible||document.hidden){inspectionAnimation?.pause();}
  else if(inspectionAnimation){inspectionAnimation.play();}
  else{moveInspection();}
}
new IntersectionObserver(entries=>{inspectionVisible=entries[0].isIntersecting;updateInspection();}).observe(inspectionArea);
inspectionMotion.addEventListener('change',updateInspection);
document.addEventListener('visibilitychange',updateInspection);
// Reuse the Home divider only at main section boundaries, outside the labs.
const sectionDivider=guide.querySelector('.guide-section-divider');
guide.querySelector('.guide-finish').classList.add('guide-separated-section');
for(const section of [...panels.children,guide.querySelector('.guide-labs')]){
  section.classList.add('guide-separated-section');
  section.before(sectionDivider.cloneNode(true));
}
const choices=panels.querySelector('.guide-os-choices');function chooseOS(system){choices.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.os===system[0])));panels.querySelector('#guide-cli-os').textContent=system[1];const lines=panels.querySelector('#guide-cli-lines');lines.replaceChildren();for(const [command,description] of system[2]){const row=document.createElement('div'),code=document.createElement('code'),hint=document.createElement('span');code.textContent='> '+command;hint.textContent=description;row.append(code,hint);lines.append(row);}}
for(const system of systems){const b=document.createElement('button');b.type='button';b.dataset.os=system[0];b.innerHTML=window.NetworkExplorerIcons.os(system[0]);const label=document.createElement('span');label.textContent=system[1];b.append(label);b.onclick=()=>chooseOS(system);choices.append(b);}chooseOS(systems[0]);
const packets=[['DNS','Query: server.example','UDP / DNS','Client asks its configured DNS server for the IPv4 address of server.example.'],['TCP','SYN: open connection','TCP flags: SYN','Client requests a TCP connection to the web server on destination port 80.'],['TCP','SYN, ACK: server replies','TCP flags: SYN, ACK','Server acknowledges the connection request and sends its own initial sequence number.'],['HTTP','GET /','HTTP request','Browser requests the root page after the TCP connection is established.'],['HTTP','200 OK','HTTP response','Web server returns a successful response containing the page.']];const tbody=panels.querySelector('tbody'),detail=panels.querySelector('.guide-packet-detail');function choosePacket(index){tbody.querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));const title=document.createElement('strong'),body=document.createElement('p');title.textContent=packets[index][2];body.textContent=packets[index][3];detail.replaceChildren(title,body);}
packets.forEach((packet,i)=>{const row=document.createElement('tr');row.innerHTML='<td>'+(i+1)+'</td><td><span class="guide-protocol-tag">'+packet[0]+'</span></td><td><button type="button">'+packet[1]+'</button></td>';row.querySelector('button').onclick=()=>choosePacket(i);tbody.append(row);});choosePacket(0);
const top=document.createElement('button');top.type='button';top.className='guide-back-top';top.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 11 6-6 6 6M12 5v15"/></svg>Back to top';top.onclick=()=>{window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});welcome.querySelector('h1').focus({preventScroll:true});};guide.append(top);
if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>entries.forEach(e=>{e.target.classList.toggle('guide-in-view',e.isIntersecting);if(e.isIntersecting)e.target.classList.add('guide-revealed');}),{root:null,threshold:.15});panels.querySelectorAll('section').forEach(s=>{s.classList.add('guide-reveal');observer.observe(s);});}
})();
