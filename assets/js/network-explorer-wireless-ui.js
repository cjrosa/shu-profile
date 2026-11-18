(function(root){
  'use strict';
  // Shared by Home, both palettes, Inspector, and canvas, using the device artwork palette.
  function glyph(laptop=false){
    if(laptop)return '<rect x="-30" y="-25" width="60" height="43" rx="3" fill="#fff" stroke="currentColor" stroke-width="2"/>'+
      '<rect x="-26" y="-21" width="52" height="33" rx="1" fill="#cce4f5"/><path d="M-25-20h50v8L-25 4Z" fill="#e6f2fa"/><circle cy="-23" r=".7" fill="#61758a"/>'+
      '<path d="M-30 18h60l8 10h-76Z" fill="#dce8f1" stroke="currentColor" stroke-width="1.5"/><path d="M-38 28h76l-4 4h-68Z" fill="#b4cada" stroke="currentColor" stroke-width="1.5"/>'+
      '<path d="M-23 21h46m-48 3h50m-41-4v5m8-5v5m8-5v5m8-5v5m8-5v5" fill="none" stroke="#8ca9bd" stroke-width=".8"/><path d="M-7 26h14l2 2H-9Z" fill="#edf4fa" stroke="#8ca9bd" stroke-width=".7"/>'+
      '<path d="M-12-7q12-11 24 0M-7-2q7-6 14 0" fill="none" stroke="#5084aa" stroke-width="2" stroke-linecap="round"/><circle cy="4" r="1.8" fill="#5084aa"/><circle cx="25" cy="15" r="1" fill="#287d78"/>';
    return '<path d="M-26 1v-24m52 24v-24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M-26-21v17m52-17v17" stroke="#b4cada" stroke-width="1.5"/>'+
      '<path d="M-35 2l8-11h54l8 11" fill="#b4cada" stroke="currentColor" stroke-width="2"/><rect x="-36" y="2" width="72" height="24" rx="4" fill="#edf4fa" stroke="currentColor" stroke-width="2"/>'+
      '<path d="M-30 8h13m-13 4h13m-13 4h13" stroke="#8ca9bd" stroke-width="1.3"/><rect x="15" y="9" width="13" height="10" rx="1" fill="#284d73"/><path d="M18 10v3m3-3v3m3-3v3" stroke="#b4cada" stroke-width="1"/>'+
      '<circle cx="-26" cy="21" r="1.3" fill="#287d78"/><circle cx="-20" cy="21" r="1.3" fill="#7096b3"/><path d="M-11-15q11-11 22 0M-7-10q7-7 14 0" fill="none" stroke="#5084aa" stroke-width="2" stroke-linecap="round"/><circle cy="-5" r="1.7" fill="#5084aa"/>'+
      '<path d="M-29 27v2h8v-2m29 0v2h8v-2" fill="#b4cada" stroke="currentColor" stroke-width="1"/>';
  }
  function mount(container,n,d,{esc,change,join,disconnect,styleSelect}){
    if(d.role!=='ap'&&!d.wifi)return;
    const section=document.createElement('section');section.className='wireless-settings';section.setAttribute('aria-label','Wi-Fi');
    const header='<div class="small-heading inspector-section-heading"><span>Wi-Fi</span>';
    if(d.role==='ap'){
      section.innerHTML=header+'</div><form id="wifi-settings"><label>SSID<input id="wifi-ssid" maxlength="32" required value="'+esc(d.wireless.ssid)+'"></label><label>Security<select id="wifi-security"><option value="wpa2">WPA2-Personal</option><option value="open">Open</option></select></label><label>Password<input id="wifi-password" type="password" maxlength="63" value="'+esc(d.wireless.password)+'" autocomplete="off"></label></form>';
      section.querySelector('#wifi-security').value=d.wireless.security;
      section.querySelector('form').onchange=()=>{change(()=>n.configureWireless(d.id,{ssid:section.querySelector('#wifi-ssid').value.trim(),security:section.querySelector('#wifi-security').value,password:section.querySelector('#wifi-password').value}));};
      section.querySelector('form').onsubmit=e=>{e.preventDefault();section.querySelector('form').onchange();};
      const clients=document.createElement('div');clients.className='wifi-meta';clients.textContent='Clients: '+(n.devices.filter(c=>c.wifi?.ap===d.id&&n.wifiStatus(c.id)==='Associated').map(c=>c.name).join(', ')||'none');section.append(clients);
    }else{
      section.innerHTML=header+'<span class="wifi-status" role="status">'+esc(n.wifiStatus(d.id))+'</span></div><form><label>Network<select id="wifi-network"><option value="">Choose network</option>'+n.devices.filter(a=>a.role==='ap').map(a=>'<option value="'+a.id+'" '+(a.id===d.wifi.ap?'selected':'')+'>'+esc(a.wireless.ssid+' ('+(a.wireless.security==='open'?'Open':'WPA2')+') - '+a.name)+'</option>').join('')+'</select></label><label>Password<input id="wifi-client-password" type="password" maxlength="63" value="'+esc(d.wifi.password)+'" autocomplete="off"></label><div class="wifi-actions"><button type="submit" aria-label="Connect Wi-Fi">Connect</button><button type="button" id="wifi-disconnect">Disconnect</button></div></form>';
      section.querySelector('form').onsubmit=e=>{e.preventDefault();join(d.id,section.querySelector('#wifi-network').value,section.querySelector('#wifi-client-password').value);};
      section.querySelector('#wifi-disconnect').onclick=()=>disconnect(d.id);
    }
    const paths={connect:'<path d="M3 8q9-9 18 0M6 12q6-6 12 0M9 16q3-3 6 0"/><circle cx="12" cy="20" r="1"/>',disconnect:'<path d="m3 3 18 18M3 8q2-2 4-3m4-1q6-1 10 4M6 12q2-2 5-2m5 1 2 1M9 16q3-3 6 0"/><circle cx="12" cy="20" r="1"/>',save:'<path d="M4 3h13l4 4v14H3V3h1ZM7 3v6h10V3M7 21v-8h10v8"/>'};
    section.querySelectorAll('button').forEach(button=>{const kind=d.role==='ap'?'save':button.id==='wifi-disconnect'?'disconnect':'connect';const label={connect:'Connect Wi-Fi',disconnect:'Disconnect Wi-Fi',save:'Save Wi-Fi settings'}[kind];button.classList.add('wifi-icon-button');button.title=label;button.dataset.tooltip=label;button.setAttribute('aria-label',label);button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[kind]+'</svg>';});
    const interfaces=container.querySelector('.interface-chassis');if(interfaces)interfaces.after(section);else container.append(section);
    const choiceIcon=(value)=>{const security=d.role==='ap'?value:n.device(value)?.wireless.security;return '<svg viewBox="0 0 24 24" aria-hidden="true">'+(security==='wpa2'?'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>':security==='open'?'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0M12 14v3"/>':'<path d="M3 8q9-9 18 0M6 12q6-6 12 0M9 16q3-3 6 0"/><circle cx="12" cy="20" r="1"/>')+'</svg>';};
    styleSelect(d.role==='ap'?'wifi-security':'wifi-network',d.role==='ap'?'Security':'Network',choiceIcon);
  }
  root.NetworkExplorerWirelessUI={glyph,mount};
})(globalThis);
