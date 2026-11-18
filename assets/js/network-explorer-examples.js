(function(root){'use strict';
 function direct(Network){
  const n=new Network(),a=n.add('host',240,220),b=n.add('host',660,220);
  a.name='Host 1';b.name='Host 2';a.os=b.os='windows';a.watch=b.watch=false;
  n.configure(a.id,'192.168.1.1',24);n.configure(b.id,'192.168.1.2',24);
  n.connect(a.id,'p0',b.id,'p0');
  return {network:n,clientId:a.id};
 }
 function complex(Network){
  const n=new Network(),add=(type,name,x,y)=>Object.assign(n.add(type,x,y,type==='router'?3:2),{name});
  const r1=add('router','Client Router',300,240),r2=add('router','Services Router',580,240),r3=add('router','Web Router',450,430);
  const sw1=add('switch','Client Switch',110,240),sw2=add('switch','Services Switch',780,240),sw3=add('switch','Web Switch',640,430);
  const client=add('host','Browser Client',110,400),dhcp=add('host','DHCP Host',550,90),dns=add('host','DNS Host',810,90),web=add('host','Web Host',810,430);
  for(const [r,lan]of [[r1,10],[r2,20],[r3,30]])n.configureInterface(r.id,'p0','192.168.'+lan+'.1',24);
  n.configureInterface(r1.id,'p1','10.0.12.1',30);n.configureInterface(r2.id,'p1','10.0.12.2',30);
  n.configureInterface(r2.id,'p2','10.0.23.1',30);n.configureInterface(r3.id,'p1','10.0.23.2',30);
  n.configureInterface(r3.id,'p2','10.0.13.2',30);n.configureInterface(r1.id,'p2','10.0.13.1',30);
  for(const [r,lan,hop]of [[r1,20,'10.0.12.2'],[r1,30,'10.0.13.2'],[r2,10,'10.0.12.1'],[r2,30,'10.0.23.2'],[r3,10,'10.0.13.1'],[r3,20,'10.0.23.1']])n.setStaticRoute(r.id,'192.168.'+lan+'.0',24,hop,'lan-'+lan);
  for(const [host,address,gateway]of [[dhcp,'192.168.20.2','192.168.20.1'],[dns,'192.168.20.3','192.168.20.1'],[web,'192.168.30.10','192.168.30.1']]){n.configure(host.id,address,24);n.configureGateway(host.id,gateway);n.configureDnsAddress(host.id,dns===host?address:'192.168.20.3');}
  n.configureDhcpRelay(r1.id,'p0',dhcp.ip);
  n.configureDhcpServer(dhcp.id,{enabled:true,pools:[{name:'Client-LAN',start:'192.168.10.100',end:'192.168.10.120',prefix:24,gateway:'192.168.10.1',dns:dns.ip,leaseSeconds:120}]});
  n.configureDnsServer(dns.id,{enabled:true,records:[{name:'www.campus.example',address:web.ip,ttl:120},{name:'server.example',address:web.ip,ttl:120},{name:'dns.campus.example',address:dns.ip,ttl:120},{name:'dhcp.campus.example',address:dhcp.ip,ttl:120}]});
  n.configureWeb(web.id,{enabled:true,port:80,title:'Welcome to the campus network',body:'DHCP relay supplied your address, gateway and DNS server. DNS resolved this name on the Services LAN, then TCP carried this HTTP page from the Web LAN. Three routers form a triangle with a separate /30 subnet on each transit link.'});
  n.configureWeb(client.id,{enabled:true,url:'http://www.campus.example/'},'browser');n.configureAddressMode(client.id,'dhcp');
  client.browserOffset={x:0,y:110};dhcp.applicationOffset={x:-100,y:0};dns.dnsOffset={x:0,y:-65};web.webOffset={x:0,y:-65};
  const connect=(a,ap,b,bp,aa,ba)=>Object.assign(n.connect(a.id,ap,b.id,bp),{aAnchor:aa,bAnchor:ba});
  connect(r1,'p1',r2,'p1','right','left');connect(r2,'p2',r3,'p1','bottom','top');connect(r3,'p2',r1,'p2','left','bottom');
  connect(r1,'p0',sw1,'p0','left','right');connect(sw1,'p1',client,'p0','bottom','top');
  connect(r2,'p0',sw2,'p0','right','left');connect(sw2,'p1',dhcp,'p0','top','right');connect(sw2,'p2',dns,'p0','top','left');
  connect(r3,'p0',sw3,'p0','right','left');connect(sw3,'p1',web,'p0','right','left');
  arrange(n);
  const note=(target,text,color,tags,offset)=>{const position=offset?{x:target.x+offset.x,y:target.y+offset.y}:target;n.notes.push({id:'note'+(n.notes.length+1),title:text.split('\n')[0],text:text.split('\n').slice(1).join('\n'),color,tags,target:offset?tags[0]+':'+target.id:target.id,x:position.x+52,y:position.y-48,width:200,height:130});};
  note(client,'Start here: get connected\nSelect @Browser Client and acquire a DHCP lease. Check the acquired IP, default gateway, and DNS server before opening http://www.campus.example/ in its Browser. Use Activity to follow the exchange.','yellow',['walkthrough','client','DHCP']);
  note(r1,'DHCP across subnets\nThe client starts without an IP address. Its DHCP broadcast stays on the Client LAN; @Client Router relays the request from G0/0 to 192.168.20.2 on the Services LAN. Inspect the interface relay setting.','blue',['DHCP','relay','routing']);
  note(dhcp,'Address pool for the Client LAN\n@DHCP Host offers 192.168.10.100?192.168.10.120 with /24, gateway 192.168.10.1, and DNS 192.168.20.3. Leases last 120 seconds. Follow Discover, Offer, Request, and ACK in Activity.','green',['dhcp','leases','services'],dhcp.applicationOffset);
  note(dns,'Turn a name into an address\nwww.campus.example resolves to 192.168.30.10. From @Browser Client, try nslookup www.campus.example, then inspect the DNS query and reply in Activity. The DNS server is on a different LAN from the web server.','blue',['dns','name resolution','services'],dns.dnsOffset);
  note(web,'Deliver the web page\n@Web Host listens at 192.168.30.10 on TCP port 80. After DNS resolves the name, the browser establishes TCP and sends an HTTP request. Look for the HTTP 200 response and inspect the returned page.','green',['web','HTTP','TCP'],web.webOffset);
  note(r3,'Three LANs, three transit links\n@Client Router, @Services Router, and @Web Router use static routes to reach the other /24 LANs. Each router-to-router link has its own /30 subnet: 10.0.12.0, 10.0.23.0, or 10.0.13.0. Compare the route next hop with the connected interface; the triangle does not provide automatic failover.','pink',['routing','static routes','subnets']);
  note(sw1,'Local delivery versus remote delivery\n@Client Switch learns source MAC addresses and forwards frames within the Client LAN. For the remote DNS and web servers, the client sends frames to its gateway MAC, while the IP destination remains the remote server. Inspect ARP and the MAC forwarding table.','yellow',['Ethernet','ARP','MAC','gateway']);
  return {network:n,clientId:client.id};
 }
 function arrange(n){
  const routers=n.devices.filter(d=>d.type==='router'),placed=new Set(),groups=[];
  if(routers.length){routers.forEach((r,i)=>{const angle=routers.length===3?(-150+i*120)*Math.PI/180:2*Math.PI*i/routers.length-Math.PI/2;const v={x:Math.cos(angle),y:Math.sin(angle)};r.x=1000+260*v.x;r.y=850+260*v.y;placed.add(r.id);groups.push({root:r,v});});}
  else if(n.devices.length){const root=n.devices.find(d=>d.type==='switch')||n.devices[0];Object.assign(root,{x:600,y:180});placed.add(root.id);groups.push({root,v:{x:0,y:1}});}
  const neighbors=d=>n.links.flatMap(l=>l.a===d.id?[n.device(l.b)]:l.b===d.id?[n.device(l.a)]:[]).filter(Boolean);
  for(const {root,v} of groups){const queue=[root];for(let i=0;i<queue.length;i++){const parent=queue[i],children=neighbors(parent).filter(d=>!placed.has(d.id));children.forEach((d,j)=>{placed.add(d.id);const spread=(j-(children.length-1)/2)*330;d.x=parent.x+300*v.x-spread*v.y;d.y=parent.y+300*v.y+spread*v.x;queue.push(d);});}}
  let isolated=0;for(const d of n.devices)if(!placed.has(d.id)){d.x=250+(isolated%4)*380;d.y=1900+Math.floor(isolated++/4)*300;}
  for(const d of n.devices){const types=['dhcp','dns','web','browser','echo','nmap','generator','spoofer'].filter(t=>d[t+'Server']);types.forEach((type,i)=>{d[type==='dhcp'?'applicationOffset':type+'Offset']={x:160,y:(i-(types.length-1)/2)*150};});}
  n.applicationDrafts.forEach((a,i)=>{a.x=250+i*200;a.y=2200;});
  // Uniform padding preserves branch spacing even when a branch extends left of the origin.
  if(n.devices.length){const dx=180-Math.min(...n.devices.map(d=>d.x)),dy=120-Math.min(...n.devices.map(d=>d.y));n.devices.forEach(d=>{d.x+=dx;d.y=(d.y+dy-120)*.65+120;});}
  // Different switch branches can produce identical child coordinates. Reserve
  // the final rendered footprint (after vertical compression), not just a point.
  const occupied=[];
  const footprint=d=>{
   const label=Math.max(85,String(d.name||'').length*3.5);
   const box={left:d.x-label,right:d.x+(d.type==='host'?label:Math.max(label,65+String(d.name||'').length*7)),top:d.y-45,bottom:d.y+85};
   for(const type of ['dhcp','dns','web','browser','echo','nmap','generator','spoofer'])if(d[type+'Server']){
    const offset=d[type==='dhcp'?'applicationOffset':type+'Offset'];
    box.left=Math.min(box.left,d.x+offset.x-75);box.right=Math.max(box.right,d.x+offset.x+75);
    box.top=Math.min(box.top,d.y+offset.y-40);box.bottom=Math.max(box.bottom,d.y+offset.y+60);
   }
   return box;
  };
  const overlaps=box=>occupied.some(other=>box.left<other.right+20&&box.right+20>other.left&&box.top<other.bottom+20&&box.bottom+20>other.top);
  for(const d of n.devices){
   const origin={x:d.x,y:d.y};let box=footprint(d);
   for(let ring=1;overlaps(box);ring++){
    const candidates=[];
    for(let x=-ring;x<=ring;x++)for(let y=-ring;y<=ring;y++)if(Math.max(Math.abs(x),Math.abs(y))===ring)candidates.push({x:x*220,y:y*160});
    candidates.sort((a,b)=>a.x*a.x+a.y*a.y-b.x*b.x-b.y*b.y);
    for(const offset of candidates){d.x=origin.x+offset.x;d.y=origin.y+offset.y;box=footprint(d);if(!overlaps(box))break;}
   }
   occupied.push(box);
  }
  if(n.devices.length){const dx=Math.max(0,180-Math.min(...n.devices.map(d=>d.x))),dy=Math.max(0,120-Math.min(...n.devices.map(d=>d.y)));n.devices.forEach(d=>{d.x+=dx;d.y+=dy;});}
  n.links.forEach(l=>{delete l.aAnchor;delete l.bAnchor;});
 }
 function internet(Network){
 const n=new Network(),a=n.add('host',140,160),b=n.add('host',140,390),sw=n.add('switch',350,275),edge=n.add('router',570,275),isp=n.add('router',820,275),web=n.add('host',1070,275);
 a.name='Browser A';b.name='Browser B';sw.name='LAN Switch';edge.name='NAT Gateway';isp.name='ISP Router';web.name='Internet Server';
 for(const [d,addr]of [[a,'192.168.1.10'],[b,'192.168.1.11'],[web,'198.51.100.10']])n.configure(d.id,addr,24);
 n.configureInterface(edge.id,'p0','192.168.1.1',24);n.configureInterface(edge.id,'p1','203.0.113.2',30);n.configureInterface(isp.id,'p0','203.0.113.1',30);n.configureInterface(isp.id,'p1','198.51.100.1',24);
 n.setStaticRoute(edge.id,'0.0.0.0',0,'203.0.113.1','internet');n.configureGateway(web.id,'198.51.100.1');
 for(const d of [a,b]){n.configureGateway(d.id,'192.168.1.1');n.configureDnsAddress(d.id,web.ip);n.configureWeb(d.id,{enabled:true,url:'http://www.internet.example/'},'browser');d.browserOffset={x:0,y:90};}
 n.configureDnsServer(web.id,{enabled:true,records:[{name:'www.internet.example',address:web.ip,ttl:120}]});n.configureWeb(web.id,{enabled:true,port:80,title:'Across the Internet',body:'Your private host reached this simulated Internet server through NAT/PAT. Inspect the gateway translation table to see the shared outside address and unique ports.'});web.webOffset={x:100,y:-90};web.dnsOffset={x:100,y:90};
 n.connect(a.id,'p0',sw.id,'p0');n.connect(b.id,'p0',sw.id,'p1');n.connect(sw.id,'p2',edge.id,'p0');n.connect(edge.id,'p1',isp.id,'p0');n.connect(isp.id,'p1',web.id,'p0');n.configureNat(edge.id,{enabled:true,inside:['p0'],outside:'p1'});return {network:n,clientId:a.id};
 }
 function firewall(Network){
  const n=new Network(),client=n.add('host',170,180),peer=n.add('host',170,400),sw=n.add('switch',370,290),fw=n.add('firewall',600,290),server=n.add('host',1050,290),gateway=n.add('router',810,290);gateway.name='Gateway Router';
  client.name='Inside Client';peer.name='Inside Server';sw.name='Inside Switch';fw.name='Edge Firewall';server.name='Outside Services';
  n.configure(client.id,'192.168.10.10',24);n.configure(peer.id,'192.168.10.20',24);n.configure(server.id,'198.51.100.10',24);
  n.configureInterface(gateway.id,'p0','192.168.10.1',24);n.configureInterface(gateway.id,'p1','198.51.100.1',24);
  for(const h of [client,peer])n.configureGateway(h.id,'192.168.10.1');n.configureGateway(server.id,'198.51.100.1');n.configureDnsAddress(client.id,server.ip);
  n.configureDnsServer(server.id,{enabled:true,records:[{name:'www.firewall.example',address:server.ip,ttl:120}]});
  for(const h of [server,peer])n.configureWeb(h.id,{enabled:true,port:80,title:'A permitted web page',body:'Routing delivers the packet. The transparent firewall filters inline; the separate router chooses the route.'});
  n.configureWeb(client.id,{enabled:true,url:'http://www.firewall.example/'},'browser');n.configureWeb(server.id,{enabled:true,url:'http://192.168.10.20/'},'browser');
  n.connect(client.id,'p0',sw.id,'p0');n.connect(peer.id,'p0',sw.id,'p1');n.connect(sw.id,'p2',fw.id,'p0');n.connect(fw.id,'p1',gateway.id,'p0');n.connect(gateway.id,'p1',server.id,'p0');
  const c=fw.firewall;c.rules=[{...c.rules[0],name:'Allow DNS',protocol:'UDP',destinationPort:53},{...c.rules[0],name:'Allow web',protocol:'TCP',destinationPort:80}];n.configureFirewall(fw.id,c);
  client.browserOffset={x:0,y:-90};peer.webOffset={x:0,y:90};server.dnsOffset={x:130,y:-110};server.webOffset={x:130,y:0};server.browserOffset={x:130,y:110};
  n.notes=[{id:'note1',title:'Predict, test, explain',text:'The firewall bridges Inside Switch to Gateway Router without IP addresses. Open the Inside Client Browser: DNS and HTTP succeed. Ping 198.51.100.10: default drop. Open the Outside Services Browser: a new inbound HTTP connection is blocked. Ping 192.168.10.20 from Inside Client: same-subnet traffic bypasses this firewall. Watch Edge Firewall to inspect each decision. Open Incidents > New incident and choose Firewall to investigate a randomized policy fault.',x:470,y:110,width:300,height:160,color:'blue',tags:['firewall','walkthrough'],target:fw.id}];
  return {network:n,clientId:client.id,firewallId:fw.id};
 }
 function https(Network){
  const n=new Network(),client=n.add('host',180,300),sw=n.add('switch',450,300),server=n.add('host',720,300);
  client.name='HTTPS Client';server.name='HTTPS Server';
  n.configure(client.id,'192.168.1.10',24);n.configure(server.id,'192.168.1.2',24);
  n.configureDnsAddress(client.id,server.ip);
  n.configureDnsServer(server.id,{enabled:true,records:[{name:'secure.example',address:server.ip,ttl:120}]});
  n.configureWeb(server.id,{enabled:true,port:443,tls:true,certificateName:'secure.example',certificateTrusted:true,certificateValid:true,title:'A private page',body:'You can read this message in Browser. A network observer sees encrypted TLS application data.'});
  n.configureWeb(client.id,{enabled:true,url:'https://secure.example/'},'browser');
  client.browserOffset={x:0,y:-110};server.webOffset={x:65,y:-110};server.dnsOffset={x:-75,y:-110};
  n.connect(client.id,'p0',sw.id,'p0');n.connect(server.id,'p0',sw.id,'p1');
  n.notes=[{id:'note1',title:'HTTPS and certificates',text:"1. Open Browser on HTTPS Client and load https://secure.example/. The certificate is already attached and trusted.\n2. In Activity, filter tls and select Application Data. The page is readable in Browser, but its HTTP headers and body are hidden in captured packets.\n3. Open Web Server on HTTPS Server. Change the certificate hostname to wrong.example and reload Browser. Explain why the certificate is rejected. Restore secure.example and retry.\n4. To compare HTTP, select HTTP in Web Server settings and browse http://secure.example/. Filter http to read the payload. This model simulates TLS rather than performing real cryptography.",x:300,y:410,width:360,height:200,color:'blue',tags:['security','https','certificate'],target:server.id}];
  return {network:n,clientId:client.id,serverId:server.id};
 }

 function securityLab(Network,kind){
  if(kind==='encrypt'){
   const e=https(Network),n=e.network,server=n.device(e.serverId),client=n.device(e.clientId);
   n.configureWeb(server.id,{...server.webServer,tls:false,port:80,certificateName:'',title:'Readable HTTP',body:'Training message: HTTP exposes this text to a network observer.'});
   n.configureWeb(client.id,{enabled:true,url:'http://secure.example/'},'browser');
   n.notes[0].title='Secure a readable page';n.notes[0].text='1. Load http://secure.example/ in Browser. In Activity, filter http and read the response payload.\n2. Apply Certificate from the palette to the Web Server. Set its hostname to secure.example, with trust and validity enabled. Select HTTPS and port 443 in Web Server settings.\n3. Browse https://secure.example/. Verify the green lock and the same page text. Filter tls in Activity: application content should be hidden.\nSuccess: the page works over HTTPS and its captured payload is encrypted. Reload this example to reset.';
   return e;
  }
  const n=new Network(),client=n.add('host',160,260),fw=n.add('firewall',420,260),sw=n.add('switch',680,260),server=n.add('host',940,180),admin=n.add('host',940,450);
  client.name='Security Client';fw.name='Security Firewall';sw.name='Services Switch';server.name='HTTPS Server';admin.name='Internal HTTP Server';
  for(const [d,ip] of [[client,'192.168.1.10'],[server,'192.168.1.2'],[admin,'192.168.1.3']])n.configure(d.id,ip,24);
  n.connect(client.id,'p0',fw.id,'p0');n.connect(fw.id,'p1',sw.id,'p0');n.connect(server.id,'p0',sw.id,'p1');n.connect(admin.id,'p0',sw.id,'p2');
  n.configureDnsAddress(client.id,server.ip);n.configureDnsServer(server.id,{enabled:true,records:[{name:'secure.example',address:server.ip,ttl:120}]});
  n.configureWeb(server.id,{enabled:true,tls:true,port:443,certificateName:'secure.example',certificateTrusted:true,certificateValid:true,title:'Required HTTPS service',body:'Keep this legitimate HTTPS page working while improving security.'});
  n.configureWeb(admin.id,{enabled:true,port:80,title:'Internal service',body:'This HTTP service should not be reachable from Security Client.'});
  n.configureWeb(client.id,{enabled:true,url:'https://secure.example/'},'browser');n.installApplication(n.addApplication(0,0,'nmap').id,client.id);
  n.configureFirewall(fw.id,{...fw.firewall,enabled:true,defaultAction:'drop',rules:[{...fw.firewall.rules[0],name:'Broad client access',protocol:'ANY',destinationPort:'*'}],intrusion:{mode:kind==='prevent'?'detect':'off',threshold:3,windowTicks:100}});
  client.browserOffset={x:-50,y:-110};client.nmapOffset={x:60,y:110};server.webOffset={x:100,y:-80};server.dnsOffset={x:-50,y:-100};admin.webOffset={x:100,y:0};
  const instructions={
   harden:['Reduce exposed services','1. Load https://secure.example/ in Browser, then http://192.168.1.3/. Both currently work. Scan the internal server: nmap -sS -p 80 192.168.1.3.\n2. In Security Firewall, replace Broad client access with Inside-to-Outside ALLOW rules for UDP destination port 53 to 192.168.1.2 and TCP destination port 443 to 192.168.1.2. Keep default drop.\n3. Rescan port 80 on 192.168.1.3: it should be filtered. Reload HTTPS: it must still work. Inspect Firewall decisions and their Activity evidence.'],
   detect:['Detect a port scan','1. Run nmap -sS -p 22,80,443 192.168.1.2 from Security Client Terminal. Expect closed, closed, open. IDS/IPS is off; no alert is generated.\n2. On Security Firewall, choose Detect (3 distinct ports / 100 ticks). Repeat the same scan.\n3. Open its IDS/IPS attachment and inspect the warning and eye-linked Activity packet. The scan results should be unchanged.\nSuccess: detection adds evidence while normal firewall policy and HTTPS still work.'],
   prevent:['Compare detection and prevention','1. IDS/IPS starts in Detect. Run nmap -sS -p 22,80,443 192.168.1.2. Expect closed, closed, open and an alert.\n2. On Security Firewall, switch to Prevent and repeat the scan. The third probe (443) reaches the threshold and becomes filtered. Inspect the blocked alert and Activity evidence.\n3. Switch intrusion mode Off, then back to Prevent to clear the observation window. Load https://secure.example/ without scanning first: ordinary HTTPS should work.\nSuccess: explain why a threshold-reaching scan is blocked while a fresh, single-service connection is permitted.']
  }[kind];
  n.notes=[{id:'note1',title:instructions[0],text:instructions[1]+'\nReload this example to reset. This network starts functional; your task is security hardening.',x:330,y:470,width:380,height:230,color:'yellow',tags:['security','walkthrough',kind],target:fw.id}];
  return {network:n,clientId:client.id,serverId:server.id,firewallId:fw.id,adminId:admin.id};
 }

 function dos(Network){
  const n=new Network(),source=n.add('host',160,150),client=n.add('host',160,460),sw=n.add('switch',430,300),fw=n.add('firewall',690,300),server=n.add('host',980,300);
  source.name='External Load Source';client.name='Legitimate Client';sw.name='External Switch';fw.name='Service Firewall';server.name='Protected HTTPS Server';
  for(const [d,ip] of [[source,'192.168.1.50'],[client,'192.168.1.10'],[server,'192.168.1.2']])n.configure(d.id,ip,24);
  n.connect(source.id,'p0',sw.id,'p0');n.connect(client.id,'p0',sw.id,'p1');n.connect(sw.id,'p2',fw.id,'p0');n.connect(fw.id,'p1',server.id,'p0');
  n.configureFirewall(fw.id,{...fw.firewall,zones:{p0:'Outside',p1:'Inside'},rules:[{...fw.firewall.rules[0],name:'Public HTTPS',from:'Outside',to:'Inside',protocol:'TCP',destinationPort:443}],defaultAction:'drop'});
  n.configureWeb(server.id,{enabled:true,tls:true,port:443,certificateName:server.ip,certificateTrusted:true,certificateValid:true,title:'Available service',body:'A legitimate HTTPS response. Compare availability before, during, and after the SYN burst.',synCapacity:8,synTimeout:120});
  n.configureWeb(client.id,{enabled:true,url:'https://192.168.1.2/'},'browser');n.installApplication(n.addApplication(source.x,source.y-100,'generator').id,source.id);n.configureGenerator(source.id,{enabled:true,target:server.ip,port:443,count:40,interval:2});
  client.browserOffset={x:0,y:110};server.webOffset={x:0,y:-110};
  n.notes=[{id:'note1',title:'DoS: keep HTTPS available',text:'1. Open Legitimate Client Browser and load its HTTPS URL: the page works.\n2. Open Traffic Generator on External Load Source. Choose Legitimate Client for the availability check, then Run burst. The check runs midway through 40 SYN attempts. Use Pause/Step or inspect Web Server connection capacity. Pending handshakes fill eight slots; the check times out.\n3. Finish the exchange: pending slots expire. Reload the Browser and verify recovery.\n4. On Service Firewall add a DROP rule for source 192.168.1.50, Outside to Inside, TCP port 443. Move it above Public HTTPS. Repeat the burst with the same check: legitimate HTTPS should work.\nExternal and protected segments are separated by a transparent firewall; they share an IP subnet. This models connection exhaustion, not bandwidth saturation. Stop cancels future SYNs; in-flight traffic and pending-slot expiry continue. Reload the example to reset.',x:430,y:510,width:390,height:250,color:'yellow',tags:['security','dos','availability'],target:fw.id}];
  return {network:n,clientId:client.id,sourceId:source.id,serverId:server.id,firewallId:fw.id};
 }
 function arpSecurity(Network,kind='intercept'){
  const n=new Network(),client=n.add('host',170,200),attacker=n.add('host',170,470),sw=n.add('switch',440,280),gateway=n.add('router',700,280),server=n.add('host',990,280);
  client.name='Victim Client';attacker.name='Attacker';sw.name='Access Switch';gateway.name='Gateway';server.name='HTTP Server';
  n.configure(client.id,'192.168.1.10',24);n.configure(attacker.id,'192.168.1.50',24);n.configure(server.id,'192.168.2.20',24);
  n.configureInterface(gateway.id,'p0','192.168.1.1',24);n.configureInterface(gateway.id,'p1','192.168.2.1',24);
  n.configureGateway(client.id,'192.168.1.1');n.configureGateway(server.id,'192.168.2.1');
  n.connect(client.id,'p0',sw.id,'p0');n.connect(attacker.id,'p0',sw.id,'p1');n.connect(gateway.id,'p0',sw.id,'p2');n.connect(gateway.id,'p1',server.id,'p0');
  n.configureWeb(server.id,{enabled:true,port:80,title:'ARP security lab',body:'This HTTP page is readable to an attacker who forwards the traffic.'});
  n.configureWeb(client.id,{enabled:true,url:'http://192.168.2.20/'},'browser');
  n.configureSpoofer(attacker.id,{enabled:true,victim:client.ip,peer:gateway.ports[0].ip,technique:'reply',direction:kind==='drop'?'victim':'both',traffic:kind==='drop'?'drop':'forward',count:1,interval:20});
  client.browserOffset={x:0,y:-110};attacker.spooferOffset={x:0,y:110};server.webOffset={x:0,y:-110};
  n.configureArpInspection(sw.id,{vlans:kind==='protected'?[1]:[],trustedPorts:[],bindings:[[client,'p0'],[attacker,'p1'],[gateway,'p2']].map(([d,port])=>({ip:d.type==='router'?d.ports[0].ip:d.ip,mac:d.ports[0].mac,vlan:1,port}))});
  const lesson=kind==='protected'?'Protection starts enabled. Run the attack and test again: the page works, forged claims are dropped, and interception stays at zero. Inspect Access Switch → Layer 2 Security. Break it: trust attacker port P2, rerun the attack and test. Repair by removing trust, clear Victim Client and Gateway ARP caches, then repeat.':
   kind==='drop'?'Run the attack, then test again: the page times out. Inspect Victim Client’s ARP cache: the gateway now maps to Attacker. Enable VLAN 1 inspection on Access Switch. Test before clearing caches: the old poisoned mapping still causes failure. Clear Victim Client’s ARP cache, then test: normal service returns. Repeat the attack: the forged claim is dropped.':
   'Run the attack, then test again: the page works through Attacker. Open the ARP Spoofer Interception tab to read HTTP. Inspect the victim and gateway ARP caches. Enable VLAN 1 inspection, clear both endpoint ARP caches, then repeat: the page works without new interception. For HTTPS, attach a certificate to HTTP Server and use https://192.168.2.20/ in Browser; repeat poisoning after configuration resets. TLS content stays encrypted.';
  n.notes=[{id:'note1',title:kind==='protected'?'ARP: protected LAN':kind==='drop'?'ARP: gateway impersonation':'ARP: hidden interception',text:'1. Open Victim Client Browser and load http://192.168.2.20/ before the attack: the HTTP page works. Repeat requests from that Browser to test connectivity.\n2. '+lesson+'\n3. Use canvas Pause/Step and device Watch to inspect packets, cache changes and switch decisions. Static bindings are prepared, but are enforced only for enabled VLANs. Stop poisoning cancels future claims; forwarding continues until Clear learned state. Reload this example to reset.',x:490,y:460,width:460,height:280,color:'yellow',tags:['security','arp',kind],target:sw.id}];
  return {network:n,clientId:client.id,sourceId:attacker.id,switchId:sw.id,gatewayId:gateway.id,serverId:server.id};
 }
 const api={arpSecurity,dos,direct,complex,arrange,internet,firewall,https,securityLab};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NetworkExplorerExamples=api;
})(typeof globalThis!=='undefined'?globalThis:this);
