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
  arrange(n);return {network:n,clientId:client.id};
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
  n.links.forEach(l=>{delete l.aAnchor;delete l.bAnchor;});
 }
 const api={complex,arrange};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NetworkExplorerExamples=api;
})(typeof globalThis!=='undefined'?globalThis:this);
