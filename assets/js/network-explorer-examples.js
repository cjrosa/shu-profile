(function(root){'use strict';
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
  for(const d of n.devices){const types=['dhcp','dns','web','browser'].filter(t=>d[t+'Server']);types.forEach((type,i)=>{d[type==='dhcp'?'applicationOffset':type+'Offset']={x:160,y:(i-(types.length-1)/2)*150};});}
  n.applicationDrafts.forEach((a,i)=>{a.x=250+i*200;a.y=2200;});
  // Uniform padding preserves branch spacing even when a branch extends left of the origin.
  if(n.devices.length){const dx=180-Math.min(...n.devices.map(d=>d.x)),dy=120-Math.min(...n.devices.map(d=>d.y));n.devices.forEach(d=>{d.x+=dx;d.y=(d.y+dy-120)*.65+120;});}
  // Different switch branches can produce identical child coordinates. Reserve
  // the final rendered footprint (after vertical compression), not just a point.
  const occupied=[];
  const footprint=d=>{
   const label=Math.max(85,String(d.name||'').length*3.5);
   const box={left:d.x-label,right:d.x+(d.type==='host'?label:Math.max(label,65+String(d.name||'').length*7)),top:d.y-45,bottom:d.y+85};
   for(const type of ['dhcp','dns','web','browser'])if(d[type+'Server']){
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
 const api={complex,arrange,internet};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NetworkExplorerExamples=api;
})(typeof globalThis!=='undefined'?globalThis:this);
