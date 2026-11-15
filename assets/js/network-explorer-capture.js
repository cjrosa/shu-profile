/* Wireshark-style inspection of the explorer's simulated event history. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let network,filter='',selected=null,cleared=new Set(),following=true;
 // null means all devices; an empty set deliberately monitors none.
 let monitored=null,deviceSignature='';
 let deviceIcon=()=>'';
 const monitorIcon=(type,id)=>type==='all'?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>':deviceIcon(network.device(id));
 function monitorSummary(){return monitored===null?'All devices':monitored.size+' selected';}
 function mountMonitor(container,prefix,iconRenderer){if(iconRenderer)deviceIcon=iconRenderer;container.classList.add('monitor-device-list');container.dataset.monitorList=prefix;deviceSignature='';if(network)renderDevices();}
 function setMonitorOpen(open){
   $('capture-monitor-menu').hidden=!open;
   $('capture-monitor-toggle').setAttribute('aria-expanded',String(open));
   document.dispatchEvent(new Event('capture-updated'));
 }
 $('capture-monitor-toggle').onclick=()=>setMonitorOpen($('capture-monitor-menu').hidden);
 function bindMonitorDismiss(root){
   root.addEventListener('pointerdown',e=>{if(!e.target.closest('.capture-monitor-picker')&&!$('capture-monitor-menu').hidden)setMonitorOpen(false);});
   root.addEventListener('keydown',e=>{if(e.key==='Escape'&&e.target.closest('.capture-monitor-picker')){e.preventDefault();e.stopPropagation();setMonitorOpen(false);root.querySelector('#capture-monitor-toggle')?.focus();}},true);
 }
 bindMonitorDismiss(document);
 function renderDevices(){
   if(monitored)monitored=new Set([...monitored].filter(id=>network.device(id)));
   const signature=JSON.stringify([network.devices.map(d=>[d.id,d.name,d.type]),monitored&&[...monitored]]);
   if(signature===deviceSignature)return;
   deviceSignature=signature;
   document.querySelectorAll('[data-monitor-list]').forEach(list=>{
     const choice=(id,name,type,checked)=>'<label><input id="'+esc(list.dataset.monitorList)+'-device-'+esc(id)+'" '+(id==='all'?'data-monitor-all':'data-monitor-device="'+esc(id)+'"')+' type="checkbox" '+(checked?'checked':'')+'><span class="monitor-check"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg></span>'+monitorIcon(type,id)+'<span>'+esc(name)+'</span></label>';
     list.innerHTML=choice('all','All devices','all',monitored===null)+network.devices.map(d=>choice(d.id,d.name,d.type,monitored?.has(d.id))).join('');
   });
   $('capture-monitor-toggle').title='Monitor: '+monitorSummary();
   $('capture-monitor-toggle').classList.toggle('active',monitored!==null);
 }
 document.addEventListener('change',e=>{
   if(!e.target.closest('[data-monitor-list]'))return;
   if(e.target.hasAttribute('data-monitor-all'))monitored=e.target.checked?null:new Set();
   else if(e.target.dataset.monitorDevice){
     if(monitored===null)monitored=new Set();
     if(e.target.checked)monitored.add(e.target.dataset.monitorDevice);
     else monitored.delete(e.target.dataset.monitorDevice);
   }else return;
   const focusedId=e.target.id;
   render(network);
   document.dispatchEvent(new Event('capture-monitor-changed'));
   document.getElementById(focusedId)?.focus({preventScroll:true});
 });
 const scroller=document.querySelector('#events-panel .capture-scroll');
 const follow=document.createElement('button');follow.id='capture-follow';follow.type='button';follow.title='Follow latest activity; scrolling back pauses tracking';follow.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 19h14"/></svg><span>Follow latest</span>';$('capture-clear').before(follow);
 function setFollowing(value){following=value;follow.setAttribute('aria-pressed',String(value));}
 function scrollLatest(root=document){const el=root.querySelector('#events-panel .capture-scroll');if(following&&el){el.scrollTop=el.scrollHeight;}}
 function bindScroll(root){if(root!==document)bindMonitorDismiss(root);root.addEventListener('scroll',e=>{const el=e.target;if(!el.matches?.('#events-panel .capture-scroll'))return;if(el.clientHeight&&el.scrollHeight-el.clientHeight-el.scrollTop>4&&following){setFollowing(false);document.dispatchEvent(new Event('capture-updated'));}},true);}
 setFollowing(true);bindScroll(document);
 follow.onclick=()=>{setFollowing(!following);if(network)render(network);};
 new ResizeObserver(()=>scrollLatest()).observe(scroller);

 const vlanDisplay=e=>e.vlan==null?'\u2014':network.platform==='paloalto'?(network.device(e.device)?.vlans.find(v=>v.id===e.vlan)?.name||String(e.vlan)):e.vlan;
 const key=e=>e.order+':'+e.clock;
 function record(e,i,net=network){const f=e.frame||{},d=net.device(e.device);return {e,no:i+1,id:key(e),proto:f.http?'HTTP':f.protocol==='TCP'?'TCP':f.dns?'DNS':f.dhcp?'DHCP':f.protocol==='UDP'?'UDP':f.icmp?'ICMP':f.type||'Event',src:f.src||'',dst:f.dst||'',sip:f.sip||'',dip:f.tip||f.dip||'',device:(d?.name||e.device)+(e.ingress?' / '+(d?.ports.find(p=>p.id===e.ingress)?.name||e.ingress):''),info:f.protocol==='TCP'?f.flags+' SEQ '+f.seq+' ACK '+f.ack+' LEN '+f.length+(f.http?' HTTP '+(f.http==='Request'?'GET '+f.path:f.status):''):f.dns?'DNS '+f.dns+' '+f.query+(f.answer?' -> '+f.answer:f.rcode?' '+f.rcode:''):f.dhcp?'DHCP '+f.dhcp+(f.address?' - '+f.address:''):f.type==='ARP'?(f.op==='Request'?'Who has '+f.tip+'? Tell '+f.sip:f.sip+' is at '+f.src):f.protocol==='UDP'?'UDP '+f.sport+' to '+f.dport:f.icmp||e.title};}
 function match(r){return NetworkExplorerFilter.match(r,filter);}

 function section(title,fields){return '<details open><summary>'+esc(title)+'</summary><dl>'+fields.map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join('')+'</dl></details>';}
 function inspect(r){if(!r){$('capture-detail').innerHTML='<div class="capture-empty-detail"><strong>Packet details</strong><span>Select a row to explore its headers and forwarding decision.</span></div>';$('capture-bytes').innerHTML='<div class="capture-empty-detail"><strong>Frame bytes</strong><span>Select a packet to inspect its Ethernet header.</span></div>'; return;}const e=r.e,f=e.frame;let html=section('Event '+r.no+' · simulation tick '+e.clock,[['Observed at',r.device],['Access VLAN (switch classification)',e.vlan==null?'Not classified here':vlanDisplay(e)],['Decision',e.title],['Explanation',e.notes.join(' ')],['Send through',e.outputs.map(id=>network.device(e.device)?.ports.find(p=>p.id===id)?.name||id).join(', ')||'None']]);if(f){html+=section('Ethernet II',[['Source',r.src],['Destination',r.dst],['EtherType',f.type==='ARP'?'0x0806 (ARP)':'0x0800 (IPv4)']]);if(f.type==='ARP')html+=section('Address Resolution Protocol',[['Operation',f.op],['Sender IP',r.sip],['Target IP',r.dip]]);else{html+=section('Internet Protocol Version 4',[['Source',r.sip],['Destination',r.dip],['TTL',f.ttl??64],['Protocol',f.protocol==='TCP'?'TCP (6)':f.protocol==='UDP'?'UDP (17)':'ICMP (1)']]);if(f.protocol==='TCP')html+=section('Transmission Control Protocol',[['Source port',f.sport],['Destination port',f.dport],['Flags',f.flags],['Sequence',f.seq],['Acknowledgment',f.ack],['Payload bytes',f.length]]);else if(f.protocol==='UDP')html+=section('User Datagram Protocol',[['Source port',f.sport],['Destination port',f.dport]]);else html+=section('Internet Control Message Protocol',[['Type',({'Echo Request':'8 (Echo Request)','Echo Reply':'0 (Echo Reply)','Time Exceeded':'11 (Time Exceeded)','Destination Unreachable':'3 (Destination Unreachable)'})[f.icmp]||f.icmp],['Code',f.code??0],...(f.quote?[['Original source IP',f.quote.sip],['Original destination IP',f.quote.dip],['Original protocol',f.quote.protocol]]:[])]);}if(f.http)html+=section('Hypertext Transfer Protocol',[['Message',f.http],['HTTP/1.1',f.raw]]);if(f.dns)html+=section('Domain Name System',[['Message',f.dns],['Transaction',f.xid],['Name',f.query],['Type','A'],['Status',f.rcode||'Query'],['Answer',f.answer||'None'],['Answer TTL',f.answerTtl==null?'None':f.answerTtl+' seconds']]);if(f.dhcp)html+=section('Dynamic Host Configuration Protocol',[['Message',f.dhcp],['Transaction',f.xid],['Client MAC',f.clientMac],['Server',f.server||'Not selected'],['Relay address (giaddr)',f.giaddr||'None (local client)'],['Offered / assigned address',f.address||f.requested||'None'],['Prefix',f.prefix==null?'Not supplied':'/'+f.prefix],['Gateway',f.gateway||'Not supplied'],['DNS server',f.dnsAddress||'Not supplied'],['Lease duration',f.leaseSeconds?f.leaseSeconds+' seconds':'Not supplied'],['Delivery',f.dst==='ff:ff:ff:ff:ff:ff'?'Broadcast':'Unicast']]);const bytes=[...f.dst.split(':'),...f.src.split(':'),...(f.type==='ARP'?['08','06']:['08','00'])];$('capture-bytes').innerHTML='<strong>Ethernet header bytes</strong><pre>0000  '+bytes.map(esc).join(' ')+'</pre><p>Destination MAC (6 bytes) · Source MAC (6 bytes) · EtherType (2 bytes)</p><p>Only modeled header fields are shown. Payload, padding, and FCS are not simulated.</p>';}else $('capture-bytes').textContent='This event has no Ethernet frame.';$('capture-detail').innerHTML=html;}
 function render(net){if(network&&(!net.history.length||net.history.length<network.history.length)){cleared.clear();selected=null;}network=net;renderDevices();const all=net.history.map((e,i)=>record(e,i)).filter(r=>!cleared.has(r.id)),rows=all.filter(r=>(monitored===null||monitored.has(r.e.device))&&match(r));const scrollTop=scroller.scrollTop;if(following)selected=rows.at(-1)?.id||null;$('capture-count').textContent=rows.length+' / '+all.length+' events';$('events').innerHTML=rows.map(r=>'<tr class="capture-'+r.proto.toLowerCase()+(selected===r.id?' is-selected':'')+'" data-capture-id="'+r.id+'" tabindex="0" aria-selected="'+(selected===r.id)+'">'+[r.no,r.e.clock,r.device,vlanDisplay(r.e),r.src||'—',r.dst||'—',r.proto,r.sip||'—',r.dip||'—',r.info].map((v,i)=>'<td>'+(i===6?'<span class="protocol-badge">'+esc(v)+'</span>':esc(v))+'</td>').join('')+'</tr>').join('')||'<tr><td colspan="10" class="capture-empty">'+(monitored?.size===0?'Select one or more devices to monitor.':all.length?'No events match the monitored devices and filter.':'No traffic yet.')+'</td></tr>';inspect(rows.find(r=>r.id===selected));if(following)scrollLatest();else scroller.scrollTop=scrollTop;document.dispatchEvent(new Event('capture-updated'));}
 function select(e){const row=e.target.closest('[data-capture-id]');if(row){setFollowing(false);selected=row.dataset.captureId;render(network);$('events').querySelector('[data-capture-id="'+selected+'"]')?.focus({preventScroll:true});}}
 $('events').onclick=select;$('events').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(e);}};
 $('capture-filter-form').onsubmit=e=>{e.preventDefault();setFilter($('capture-filter').value);};$('capture-reset').onclick=()=>{setFilter('');$('capture-filter').focus();};$('capture-clear').onclick=()=>{if(!confirm('Clear all captured activity?'))return;network.history.forEach(e=>cleared.add(key(e)));selected=null;render(network);};
 const filterError=document.createElement('span');filterError.id='capture-filter-error';filterError.setAttribute('role','status');filterError.hidden=true;$('capture-filter-form').after(filterError);$('capture-filter').setAttribute('aria-describedby',filterError.id);
 function validateFilter(value){try{NetworkExplorerFilter.compile(value);$('capture-filter').setAttribute('aria-invalid','false');filterError.hidden=true;filterError.textContent='';return true;}catch(error){$('capture-filter').setAttribute('aria-invalid','true');filterError.textContent=error.message+' The applied filter is unchanged.';filterError.hidden=false;return false;}}
 let filterInputTimer;
 $('capture-filter').addEventListener('input',()=>{clearTimeout(filterInputTimer);if(validateFilter($('capture-filter').value))filterInputTimer=setTimeout(()=>setFilter($('capture-filter').value),200);});
 function setFilter(value){clearTimeout(filterInputTimer);const next=String(value).trim();if(!validateFilter(next))return false;filter=next;if($('capture-filter').value.trim()!==filter)$('capture-filter').value=filter;if(network)render(network);document.dispatchEvent(new Event('capture-filter-changed'));return true;}
 function matchesEvent(e,net=network){const d=net.device(e.device),port=d?.ports.find(p=>p.id===e.ingress);const event={...e,notes:e.notes||[],vlan:e.vlan??(d?.type==='switch'?port?.accessVlan:undefined)};return (monitored===null||monitored.has(e.device))&&match(record(event,0,net));}
 window.NetworkExplorerCapture={render,bindScroll,scrollLatest,mountMonitor,monitorSummary,isFollowing:()=>following,matchesEvent,getFilter:()=>filter,setFilter};
})();
