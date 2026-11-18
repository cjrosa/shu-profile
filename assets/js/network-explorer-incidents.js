(function(root){
  'use strict';
  const clone=x=>JSON.parse(JSON.stringify(x));
  const catalog=[
    {id:'interfaces',title:'Interfaces',group:'Connectivity',level:'Basic',featured:true},
    {id:'routing',title:'Routing',group:'Connectivity',level:'Intermediate'},
    {id:'vlans',title:'VLANs',group:'Connectivity',level:'Intermediate'},
    {id:'dns',title:'DNS',group:'Connectivity',level:'Intermediate',featured:true},
    {id:'dhcp',title:'DHCP',group:'Connectivity',level:'Intermediate'},
    {id:'web',title:'Web services',group:'Connectivity',level:'Intermediate'},
    {id:'arp',title:'ARP spoofing',group:'Security',level:'Advanced',featured:true},
    {id:'firewall',title:'Firewall',group:'Security',level:'Advanced',featured:true},
    {id:'wireless',title:'Wi-Fi authentication',group:'Security',level:'Intermediate'}
  ];
  function candidates(Network,data,area,lab){
    const result=[], add=f=>{
      try{if(!lab.verify(Network,data,f))return;const n=new Network(data);lab.apply(n,f);if(!lab.verify(Network,n.save(),f))result.push(f);}catch(_){}
    };
    if(['interfaces','routing','vlans'].includes(area)){
      const difficulty={interfaces:'easy',routing:'gateway',vlans:'hard'}[area];
      for(let i=0;i<8;i++)try{const f=lab.create(Network,data,()=>i/8,difficulty);if(!result.some(x=>JSON.stringify(x)===JSON.stringify(f)))result.push(f);}catch(_){}
    }else if(area==='arp'){
      for(const attacker of data.devices.filter(d=>d.spooferServer?.enabled)){
        const cfg=attacker.spooferServer, source=data.devices.find(d=>d.ip===cfg.victim&&d.browserServer?.enabled);
        if(!source)continue;
        for(const sw of data.devices.filter(d=>d.arpInspection?.vlans.length)){
          const original=clone(sw.arpInspection), link=data.links.find(l=>(l.a===attacker.id&&l.b===sw.id)||(l.b===attacker.id&&l.a===sw.id));
          const base={kind:'arp',device:sw.id,deviceName:sw.name,source:source.id,sourceName:source.name,attacker:attacker.id,victim:cfg.victim,peer:cfg.peer,url:source.browserServer.url,original,method:'configureArpInspection',testLabel:'ARP protection and HTTP test',symptom:'ARP protection needs investigation. Check endpoint mappings and whether traffic can be intercepted.',hints:['Run the ARP Spoofer, then browse from the victim. Inspect caches and interception evidence.','Inspect the switch Layer 2 Security settings: VLAN inspection, trusted ports and bindings.','Protect the endpoint VLAN and remove trust from the attacker-facing port. Keep legitimate bindings; clear poisoned caches and retest.'],look:'Inspect Layer 2 Security on '+sw.name+'. Run the ARP Spoofer and inspect the victim cache.'};
          add({...base,variant:'inspection',policy:{...clone(original),vlans:[]},reveal:'ARP inspection was disabled on '+sw.name+'. Restore inspection for VLANs '+original.vlans.join(', ')+'.'});
          if(link){const port=link.a===sw.id?link.ap:link.bp;add({...base,variant:'trust',policy:{...clone(original),trustedPorts:[...new Set([...original.trustedPorts,port])]},reveal:'The attacker-facing port on '+sw.name+' was trusted. Remove that trust so forged claims are inspected.'});}
        }
      }
    }else if(area==='firewall'){
      for(const d of data.devices.filter(d=>d.firewall?.enabled))for(const h of data.devices.filter(d=>d.browserServer?.enabled&&d.ip)){
        let url;try{url=new URL(h.browserServer.url);}catch(_){continue;}
        for(const [protocol,port]of [['UDP',53],['TCP',Number(url.port)||(url.protocol==='https:'?443:80)]]){
          let name='Incident rule';while(d.firewall.rules.some(r=>r.name===name))name+='!';
          add({kind:'firewall',variant:protocol+port,device:d.id,deviceName:d.name,source:h.id,sourceName:h.name,url:url.href,original:clone(d.firewall),rule:{name,enabled:true,from:'*',to:'*',source:h.ip,destination:'*',protocol,sourcePort:'*',destinationPort:port,action:'drop'},symptom:h.name+' cannot load its configured website.',testLabel:'DNS and HTTP test',hints:['Compare browsing by IP with browsing by hostname.','Follow the failing exchange through the firewall. Inspect rule order and counters.','Remove or correct the rule blocking the required service.'],reveal:'The first rule on '+d.name+' blocks '+protocol+' port '+port+'. Disable or correct it.',look:'Inspect ordered rules and decisions on '+d.name+'.'});
        }
      }
    }else if(area==='wireless'){
      for(const h of data.devices.filter(d=>d.wifi)){
        const ap=data.devices.find(d=>d.id===h.wifi.ap&&d.wireless?.security==='wpa2');if(!ap)continue;
        for(const target of data.devices.filter(d=>d.type==='host'&&d.ip&&d.id!==h.id)){
          const base={kind:'wireless',source:h.id,sourceName:h.name,target:target.ip,device:ap.id,deviceName:ap.name,symptom:h.name+' cannot authenticate to its wireless network.',testLabel:'Wi-Fi/DHCP/ping test',hints:['Check association before requesting an IP address.','Compare the client credentials and the intended AP credentials.','Correct the mismatched password, reconnect, and acquire DHCP.'],look:'Compare Wi-Fi settings on '+h.name+' and '+ap.name+'.'};
          add({...base,variant:'client',original:h.wifi.password,reveal:'The client password was changed. Reconnect using the intended AP password.'});
          add({...base,variant:'ap',method:'configureWireless',original:clone(ap.wireless),policy:{...clone(ap.wireless),password:ap.wireless.password+'-changed'},reveal:'The AP password was changed. Restore the intended password or update the client to match.'});
          if(result.length)break;
        }
      }
    }else if(['dns','dhcp','web'].includes(area)){
      const key={dns:'dnsServer',dhcp:'dhcpServer',web:'webServer'}[area];
      for(const server of data.devices.filter(d=>d[key]?.enabled))for(const h of data.devices.filter(d=>d.type==='host'&&d.id!==server.id)){
        const record=server.dnsServer?.records?.find(r=>r.address), pool=server.dhcpServer?.pools?.[0];
        if(area==='dns'&&(!record||h.dnsServerAddress!==server.ip)||area==='dhcp'&&(h.addressMode!=='dhcp'||!pool)||area==='web'&&!h.browserServer?.enabled)continue;
        const removed={};for(const k of [key,area+'Watch',area+'Offset','applicationOffset'])if(server[k]!==undefined)removed[k]=clone(server[k]);
        add({kind:area,source:h.id,sourceName:h.name,device:server.id,deviceName:server.name,target:area==='dns'?record.address:server.ip,hostname:record?.name,url:h.browserServer?.url,prefix:pool?.prefix,gateway:pool?.gateway,dns:pool?.dns,removed,testLabel:area+' service test',symptom:h.name+' reports a '+area.toUpperCase()+' service failure.',command:area==='dns'?'nslookup '+record.name:area==='dhcp'?'ipconfig /renew':null,hints:['Check connectivity to the service host.','Inspect the service application and client settings.','Restore the missing service configuration on '+server.name+'.'],reveal:'The '+area.toUpperCase()+' service was removed from '+server.name+'. Restore its application and configuration.',look:'Inspect applications on '+server.name+'.'});
      }
    }
    if(['dns','dhcp','web'].includes(area)) {
      const key={dns:'dnsServer',dhcp:'dhcpServer',web:'webServer'}[area],method={dns:'configureDnsServer',dhcp:'configureDhcpServer',web:'configureWeb'}[area];
      for(const f of [...result]) {
        f.variant='removed';
        const original=clone(data.devices.find(d=>d.id===f.device)[key]);
        add({...f,variant:'disabled',method,original,policy:{...clone(original),enabled:false},hints:['Check connectivity to the service host.','Inspect the service application status and its configuration.','Enable the required service on '+f.deviceName+'.'],reveal:'The '+area.toUpperCase()+' service was disabled on '+f.deviceName+'. Enable it and retest.'});
      }
    }
    return result;
  }
  function prepare(Network,area,lab,random=Math.random,complexity){
    if(!['basic','intermediate','advanced'].includes(complexity))throw Error('Choose a network complexity before generating a practice network.');
    const examples=root.NetworkExplorerExamples||(typeof require==='function'?require('./network-explorer-examples.js'):null);
    const wireless=root.NetworkExplorerWireless||(typeof require==='function'?require('./network-explorer-wireless.js'):null);
    let n;
    if(area==='arp')n=examples.arpSecurity(Network,'protected').network;
    else if(area==='firewall')n=examples.firewall(Network).network;
    else if(area==='wireless')n=wireless.example(Network).network;
    else if(['dns','dhcp','web'].includes(area))n=new Network(lab.generateBroken(Network,complexity,random,area).baseline);
    else n=lab.generate(Network,area==='routing'&&complexity==='basic'?'intermediate':complexity,area==='routing'&&complexity==='basic'?()=>0:random);
    if(area==='routing'&&complexity==='basic'){
      const subnets=new Set();
      for(const host of [...n.devices].filter(d=>d.type==='host')){
        const subnet=host.ip.split('.').slice(0,3).join('.');
        if(subnets.has(subnet))n.remove(host.id);else subnets.add(subnet);
      }
    }
    // Keep security prerequisites intact while adding connected, working branches.
    if(['arp','firewall','wireless'].includes(area)&&complexity!=='basic'){
      const sw=n.devices.find(d=>d.type==='switch'&&!d.role);
      const template=n.devices.find(d=>d.type==='host'&&d.ip&&n.links.some(l=>(l.a===d.id&&l.b===sw.id)||(l.b===d.id&&l.a===sw.id)));
      const subnet=template.ip.split('.').slice(0,3).join('.');
      let address=200;
      const branches=complexity==='advanced'?4:2,perBranch=complexity==='advanced'?3:2;
      for(let i=0;i<branches;i++){
        const port=sw.ports.find(p=>!n.links.some(l=>(l.a===sw.id&&l.ap===p.id)||(l.b===sw.id&&l.bp===p.id)));
        const branch=n.add('switch',sw.x+(i-1)*240,sw.y+240);branch.name='Access '+(i+2);
        n.connect(sw.id,port.id,branch.id,'p0');
        for(let j=0;j<perBranch;j++){
          while(n.devices.some(d=>d.ip===subnet+'.'+address))address++;
          const h=n.add('host',branch.x+(j-1)*90,branch.y+140);h.name='Office '+(i+1)+' Client '+(j+1);
          n.configure(h.id,subnet+'.'+address++,template.prefix);if(template.gateway)n.configureGateway(h.id,template.gateway);
          n.connect(h.id,'p0',branch.id,'p'+(j+1));
          if(sw.arpInspection?.vlans.length)sw.arpInspection.bindings.push({ip:h.ip,mac:h.ports[0].mac,vlan:port.accessVlan,port:port.id});
        }
      }
      n.reset();
    }
    n.notes=[];return n.save();
  }
  function choose(Network,data,area,lab,random=Math.random,previous=''){
    const list=candidates(Network,data,area,lab), signature=f=>[f.kind,f.variant,f.source,f.device,f.port].join(':');
    const fresh=list.filter(f=>signature(f)!==previous), pool=fresh.length?fresh:list;
    if(!pool.length)throw Error('No verified '+catalog.find(x=>x.id===area)?.title+' incident fits this network. Choose Load practice network or another area.');
    const fault=pool[Math.min(pool.length-1,Math.floor(random()*pool.length))];
    return {fault,signature:signature(fault)};
  }
  function mount(openButton,start,options={}){
    const dialog=document.createElement('dialog');dialog.className='incident-dialog';dialog.setAttribute('aria-labelledby','incident-title');
    dialog.innerHTML='<header><div><h2 id="incident-title">New incident</h2><p>Choose a practice area. Discover the fault as you investigate.</p></div><button type="button" data-close aria-label="Close incident chooser"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header><div class="incident-source" role="group" aria-label="Network source"><button type="button" data-source="current" aria-pressed="true">Use current network</button><button type="button" data-source="practice" aria-pressed="false">Load practice network</button></div><p class="incident-source-note">Introduces one verified fault in your current network.</p><div class="incident-filters"><input type="search" placeholder="Search practice areas" aria-label="Search practice areas"><select aria-label="Category"><option value="">All categories</option><option>Connectivity</option><option>Security</option></select><select aria-label="Area difficulty"><option value="">All area difficulties</option><option>Basic</option><option>Intermediate</option><option>Advanced</option></select></div><div class="incident-results"></div><p class="incident-error" role="status"></p><footer><span class="incident-selection">Choose a practice area</span><button type="button" data-random>Randomize</button><button type="button" data-start disabled>Start incident</button></footer>';
    document.body.append(dialog);
    let selected=null,source='current',preferredSource='current';
    const compatibility=new Map();
    const search=dialog.querySelector('input'),[category,level]=dialog.querySelectorAll('select'),results=dialog.querySelector('.incident-results'),error=dialog.querySelector('.incident-error'),startButton=dialog.querySelector('[data-start]');
    const glyphs={
      interfaces:'<rect x="4" y="5" width="16" height="12" rx="2"/><path d="M8 9v4m4-4v4m4-4v4M9 17v4h6v-4"/>',
      routing:'<path d="M3 8h16m-4-4 4 4-4 4M21 16H5m4-4-4 4 4 4"/>',
      vlans:'<rect x="2" y="3" width="8" height="6" rx="1"/><rect x="14" y="15" width="8" height="6" rx="1"/><path d="M6 9v9h8M14 5h7M18 2v6M2 13h3"/>',
      dns:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M3 10h14M10 3c-4 4-4 10 0 14m0-14c4 4 4 10 0 14"/>',
      dhcp:'<rect x="3" y="3" width="18" height="6" rx="1"/><path d="M6 6h1m3 0h1M12 9v9m-4-4 4 4 4-4M4 21h16"/>',
      web:'<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M2 8h20M5 5h1m2 0h1m-1 7-3 3 3 3m8-6 3 3-3 3"/>',
      arp:'<rect x="2" y="3" width="7" height="6" rx="1"/><rect x="15" y="3" width="7" height="6" rx="1"/><path d="M5 9v4h14V9M12 13v3m-4 4 4-4 4 4m-4-4v7"/>',
      firewall:'<path d="M12 2 21 6v6c0 5-5 8-9 10-4-2-9-5-9-10V6Z"/><path d="M5 10h14M5 14h14m-7-8v4m-4 0v4m8-4v4m-4 0v6"/>',
      wireless:'<path d="M3 8q9-9 18 0M6 12q6-6 12 0M9 16q3-3 6 0"/><circle cx="12" cy="20" r="1"/>',
      random:'<path d="M3 6h3c4 0 8 12 12 12h3M17 14l4 4-4 4M3 18h3c1.5 0 3-1.7 4.5-4M13.5 10C15 7.7 16.5 6 18 6h3M17 2l4 4-4 4"/>',
      start:'<path d="M4 16v-2a8 8 0 0 1 5-7m6 0a8 8 0 0 1 5 7v2M9 12V5h6v7M4 16h16a2 2 0 0 1 0 4H4a2 2 0 0 1 0-4Z"/>',
      current:'<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M12 16v5m-5 0h10"/>',
      practice:'<path d="M3 7h7l2-3h9v17H3Z"/><path d="M12 10v7m-3-3h6"/>'
    };
    const svg=id=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+glyphs[id]+'</svg>';
    const generation=document.createElement('div');generation.className='incident-generation';generation.hidden=true;
    generation.innerHTML='<label><select id="incident-network-complexity" aria-label="Network complexity"><option value="">Choose network complexity</option><option value="basic">Basic</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>';
    const generationCard=document.createElement('div');generationCard.className='incident-generation-card';
    const sourceNote=dialog.querySelector('.incident-source-note');sourceNote.before(generationCard);generationCard.append(sourceNote,generation);
    const complexity=generation.querySelector('select');
    complexity.addEventListener('change',updateSource);
    if(options.styleSelect)options.styleSelect(complexity.id,'Network complexity',value=>svg(value==='advanced'?'vlans':value==='intermediate'?'routing':'interfaces'));
    for(const id of ['random','start']){const b=dialog.querySelector('[data-'+id+']');b.title=b.textContent;b.setAttribute('aria-label',b.textContent);b.innerHTML=svg(id);}
    startButton.insertAdjacentHTML('beforeend','<span>Get to work!</span>');
    const starter=document.createElement('label');
    starter.className='incident-starter certificate-toggle';
    starter.title='Include a suggested first command or Browser action in the incident report';
    starter.innerHTML='<span>Starter</span><input type="checkbox" role="switch" aria-label="Include Starter"><span class="certificate-switch" aria-hidden="true"></span>';
    dialog.querySelector('[data-random]').before(starter);
    const references=document.createElement('label');references.className='incident-starter certificate-toggle';
    references.title='Make device names in the report clickable';
    references.innerHTML='<span>@ links</span><input type="checkbox" role="switch" aria-label="Include device links"><span class="certificate-switch" aria-hidden="true"></span>';
    starter.after(references);
    const settings=document.createElement('details');settings.className='incident-settings';
    settings.innerHTML='<summary>Settings</summary><div class="incident-settings-options"></div>';
    dialog.querySelector('footer').before(settings);
    settings.querySelector('div').append(starter,references);
    for(const id of ['current','practice'])dialog.querySelector('[data-source="'+id+'"]').insertAdjacentHTML('afterbegin',svg(id));
    const filtered=()=>catalog.filter(c=>(!category.value||c.group===category.value)&&(!level.value||c.level===level.value)&&[c.title,c.group,c.level].join(' ').toLowerCase().includes(search.value.trim().toLowerCase()));
    function updateSource(){
      const title=catalog.find(c=>c.id===selected)?.title;
      if(selected&&!compatibility.has(selected))compatibility.set(selected,options.supports?options.supports(selected):true);
      const forced=!!selected&&!compatibility.get(selected);
      source=forced?'practice':preferredSource;
      generation.hidden=source!=='practice';
      generationCard.classList.toggle('generating',source==='practice');
      generationCard.classList.toggle('requires-practice',forced);
      startButton.disabled=!selected||(source==='practice'&&!complexity.value);
      const current=dialog.querySelector('[data-source="current"]');
      current.disabled=forced;
      current.title=forced?'This network does not support '+title:'';
      dialog.querySelectorAll('[data-source]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.source===source)));
      const note=dialog.querySelector('.incident-source-note');
      note.classList.toggle('requires-practice',forced);
      note.setAttribute('role','status');
      note.textContent=forced?title+' requires a compatible practice network. Starting will generate one and replace the current topology after confirmation.':source==='practice'?'Starting loads a compatible practice network and replaces the current topology after confirmation.':selected?'Compatible with your current network. Starting introduces one verified fault.':'Choose an area to check whether this network supports it.';
      startButton.title='Get to work!';
      startButton.setAttribute('aria-label',startButton.title);
      dialog.querySelector('.incident-selection').textContent=title?title+' · '+(source==='practice'?'New practice network':'Current network'):'Choose a practice area';
    }
    function select(id){selected=id;error.textContent='';startButton.disabled=!id;updateSource();results.querySelectorAll('[data-area]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.area===id)));}
    function render(){const list=filtered();results.replaceChildren();if(!list.some(c=>c.id===selected))select(null);const featured=!search.value&&!category.value&&!level.value;
      for(const [title,items] of featured?[['Featured',list.filter(c=>c.featured)],['More practice areas',list.filter(c=>!c.featured)]]:[['Practice areas',list]]){
        if(!items.length)continue;const section=document.createElement('section'),heading=document.createElement('h3'),grid=document.createElement('div');heading.textContent=title;grid.className='incident-grid';section.append(heading,grid);
        for(const c of items){const b=document.createElement('button');b.type='button';b.dataset.area=c.id;b.setAttribute('aria-pressed',String(selected===c.id));b.innerHTML=svg(c.id)+'<span><strong>'+c.title+'</strong><small>'+c.group+' · '+c.level+'</small></span>';b.onclick=()=>select(c.id);grid.append(b);}results.append(section);
      }if(!list.length)results.textContent='No matching practice areas. Try another search or filter.';dialog.querySelector('[data-random]').disabled=!list.length;
    }
    search.addEventListener('input',render);
    [category,level].forEach((el,i)=>{
      el.addEventListener('change',render);
      if(options.styleSelect){const wrap=document.createElement('label');el.before(wrap);wrap.append(el);el.id='incident-filter-'+i;options.styleSelect(el.id,el.getAttribute('aria-label'),value=>svg(value==='Security'?'firewall':value==='Connectivity'?'interfaces':value==='Advanced'?'arp':value==='Intermediate'?'routing':'dhcp'));}
    });
    dialog.querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>{preferredSource=b.dataset.source;error.textContent='';updateSource();});
    dialog.querySelector('[data-random]').onclick=()=>{const list=filtered(),pool=list.filter(c=>c.id!==selected);select((pool.length?pool:list)[Math.floor(Math.random()*(pool.length||list.length))].id);};
    startButton.onclick=()=>{if(!selected||startButton.disabled)return;try{if(start(selected,source,{starter:starter.querySelector('input').checked,links:references.querySelector('input').checked,complexity:complexity.value})!==false)dialog.close();}catch(e){error.textContent=e.message;}};
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
    dialog.addEventListener('close',()=>openButton.focus());
    const content=document.createElement('div');content.className='incident-dialog-content';
    const header=dialog.querySelector('header'),footer=dialog.querySelector('footer');
    for(const child of [...dialog.children])if(child!==header&&child!==footer)content.append(child);
    footer.before(content);
    function openArea(id){
      if(openButton.disabled)return;
      error.textContent='';compatibility.clear();
      if(id){search.value='';category.value='';level.value='';[category,level].forEach(el=>el.dispatchEvent(new Event('change')));}
      render();if(id)select(id);updateSource();if(!dialog.open)dialog.showModal();search.focus();
    }
    openButton.onclick=()=>openArea();
    document.addEventListener('network-incident-open',e=>{if(catalog.some(c=>c.id===e.detail?.area))openArea(e.detail.area);});
  }
  const api={catalog,candidates,prepare,choose,mount};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NetworkExplorerIncidents=api;
})(globalThis);
