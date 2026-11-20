'use strict';
// SVG artwork exported unchanged from network-explorer-ui.js: icon, hostOsLogo, routerIcon.
const cidrTopologyGlyphs={
  "host": "<rect x=\"-31\" y=\"-24\" width=\"46\" height=\"34\" rx=\"3\" fill=\"#fff\" stroke=\"currentColor\" stroke-width=\"2\"/><rect x=\"-27\" y=\"-20\" width=\"38\" height=\"25\" rx=\"1\" fill=\"#cce4f5\"/><g class=\"host-os-logo\" data-host-os=\"windows\" transform=\"translate(-18,-18) scale(.85)\" stroke=\"none\"><path fill=\"#1676d2\" d=\"M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z\"/></g><path d=\"M-8 10v9m-12 0h24\" stroke=\"currentColor\" stroke-width=\"3\"/><rect x=\"21\" y=\"-24\" width=\"16\" height=\"45\" rx=\"3\" fill=\"#dce8f1\" stroke=\"currentColor\" stroke-width=\"2\"/><path d=\"M25-17h8m-8 5h8m-8 5h8\" stroke=\"currentColor\"/><circle cx=\"29\" cy=\"12\" r=\"2\" fill=\"#287d78\"/><path d=\"M-30 26h47l5 5h-57z\" fill=\"#dce8f1\" stroke=\"currentColor\"/>",
  "router": "<path d=\"M-37-7v19c0 9 17 16 37 16s37-7 37-16V-7Z\" fill=\"#b4cada\" stroke=\"#3b5278\" stroke-width=\"2\"/><path d=\"M0 9v18c20 0 37-7 37-15V-7Z\" fill=\"#93afc7\"/><path d=\"M-37-7v19c0 9 17 16 37 16s37-7 37-16V-7\" fill=\"none\" stroke=\"#3b5278\" stroke-width=\"2\"/><ellipse cx=\"0\" cy=\"-7\" rx=\"37\" ry=\"17\" fill=\"#edf4fa\" stroke=\"#3b5278\" stroke-width=\"2\"/><g stroke=\"#3b5278\" stroke-width=\"2.3\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M-26-7h18m-5-5 5 5-5 5M26-7H8m5-5-5 5 5 5M0-8v-13m-5 5 5-5 5 5M0-4V7m-5-5 5 5 5-5\"/></g><path d=\"M-27 14c5 3 10 4 15 5\" fill=\"none\" stroke=\"#e7f0f7\" stroke-width=\"2\" stroke-linecap=\"round\"/>"
};
function topologyBlocks(s) {
  const childPrefix=s.prefix>0 && s.prefix<24?24:s.prefix;
  const size=2**(32-childPrefix), divided=childPrefix!==s.prefix;
  const total=divided?s.size/size:2**s.prefix, base=divided?s.network:0;
  const own=Math.floor((s.ip-base)/size), count=Math.min(3,total);
  const start=Math.max(0,Math.min(total-count,own));
  return Array.from({length:count},(_,i)=>{
    const block=subnet(base+(start+i)*size,childPrefix), isCurrent=s.ip>=block.network && s.ip<=block.end;
    const enteredUsable=isCurrent && s.ip>=block.first && s.ip<=block.last;
    if(s.prefix===32) return {...block,isCurrent,gateway:null,hosts:[block.network]};
    const gateway=enteredUsable && s.ip===block.first?block.last:block.first;
    const hosts=[];
    if(enteredUsable && s.ip!==gateway) hosts.push(s.ip);
    for(const n of [block.first,block.first+1,block.last]) {
      if(n>=block.first && n<=block.last && n!==gateway && !hosts.includes(n) && hosts.length<2) hosts.push(n);
    }
    return {...block,isCurrent,gateway,hosts};
  });
}
function renderCidrTopology(s) {
  if(s.prefix===32) { renderCidrHostRoute(s); return; }
  if(s.prefix===30) { renderCidrRouterLink(s); return; }
  const blocks=topologyBlocks(s), singleton=blocks.length===1, divided=blocks[0].prefix!==s.prefix;
  const uses=['Faculty Department','Library Building','Student Labs'];
  const layouts=s.prefix===32?[170,470,770].map(x=>({hosts:[[x,140]],label:[x,40]})):singleton?[{hosts:[[350,210],[590,210]],gateway:[470,340],label:[470,100]}]:[
    {hosts:[[150,130],[150,275]],gateway:[350,215],label:[210,45]},
    {hosts:[[790,130],[790,275]],gateway:[590,215],label:[730,45]},
    {hosts:[[350,485],[590,485]],gateway:[470,385],label:[470,590]}
  ];
  const router=singleton?[470,440]:[470,285];
  const svg=document.getElementById('cidr-topology');
  svg.parentElement.classList.toggle('host-route-view',s.prefix===32);
  cidrTopologyView.height=s.prefix===32?240:620;
  let clouds='',wires='',devices='',labels='';
  const icon=(type,x,y)=>'<g transform="translate('+x+' '+y+')" style="color:#3b5278">'+cidrTopologyGlyphs[type]+'</g>';
  const text=(x,y,value,cls='')=>'<text x="'+x+'" y="'+y+'" text-anchor="middle" class="'+cls+'">'+value+'</text>';
  for(const [i,b] of blocks.entries()) {
    const l=layouts[i], cidr=numToIP(b.network)+'/'+b.prefix;
    const points=b.hosts.map((_,j)=>({x:l.hosts[j][0],y:l.hosts[j][1]}));
    if(b.gateway!==null) points.push({x:l.gateway[0],y:l.gateway[1]});
    let hash=0; for(const c of cidr) hash=(hash*31+c.charCodeAt(0))>>>0;
    clouds+='<g class="cidr-subnet-cloud" style="--subnet-color:hsl('+(hash%360)+' 48% 48%)"><path d="'+NetworkExplorerSubnets.cloud(points)+'"/></g>';
    labels+=text(l.label[0],l.label[1],cidr+(b.isCurrent?' - <tspan class="topology-current-label">entered IP block</tspan>':''),'topology-network');
    labels+=text(l.label[0],l.label[1]+19,(divided?uses[i]+' (example)':numToIP(b.network)+' - '+numToIP(b.end)),'topology-range');
    for(const [j,address] of b.hosts.entries()) {
      const [x,y]=l.hosts[j];
      if(b.gateway!==null) wires+='<path d="M'+x+' '+y+'L'+l.gateway.join(' ')+'L'+router.join(' ')+'"/>';
      devices+=icon('host',x,y);
      labels+=text(x,y+49,numToIP(address)+(address===s.ip?' (entered IP)':''),'topology-host');
    }
    if(b.gateway!==null) {
      devices+='<circle cx="'+l.gateway[0]+'" cy="'+l.gateway[1]+'" r="5" fill="#fff" stroke="#3b5278" stroke-width="2"/>';
      labels+=text(l.gateway[0],l.gateway[1]+25,numToIP(b.gateway),'topology-interface');
      labels+=text(l.gateway[0],l.gateway[1]+41,'Router interface','topology-range');
    }
  }
  const title='Separate /'+blocks[0].prefix+' '+(s.prefix===32?'host routes':'subnets');
  const description=blocks.map(b=>numToIP(b.network)+'/'+b.prefix+', '+fmt(b.size)+' addresses'+(b.gateway===null?'':', router interface '+numToIP(b.gateway))).join('; ');
  svg.innerHTML='<title id="topology-svg-title">'+title+'</title><desc id="topology-svg-description">'+description+'</desc>'+(divided?'<rect class="topology-allocation" x="12" y="5" width="916" height="610" rx="12"/>'+text(470,23,numToIP(s.network)+'/'+s.prefix+' overall allocation','topology-parent'):'')+clouds+'<g class="topology-wires">'+wires+'</g>'+devices+(s.prefix===32?'':icon('router',...router)+text(router[0],router[1]+52,'Router','topology-network'))+labels;
  document.getElementById('topology-status').textContent=blocks.length+' '+(s.prefix===32?'host routes':'subnets')+' · /'+s.prefix+' · Drag to pan';
  initCidrTopologyView(svg);
  fitCidrTopology();
  document.getElementById('topology-summary').textContent='Prefix /'+s.prefix+': '+fmt(s.size)+' address'+(s.size===1?'':'es')+' per block. '+(singleton?'This block covers all IPv4 addresses.': 'Showing '+blocks.length+' adjacent blocks, including the entered address\'s block.');
  if(divided) document.getElementById('topology-summary').textContent='Overall allocation: '+numToIP(s.network)+'/'+s.prefix+' ('+fmt(s.size)+' addresses). Showing '+blocks.length+' of '+fmt(s.size/256)+' possible /24 subnets; department and building names are illustrative.';
  document.getElementById('topology-note').textContent=s.prefix===32?'A /32 is a route to one address. These are individual host routes, not multi-host LANs; no extra router-interface address fits inside a /32.':s.prefix===31?'Each /31 is a point-to-point link: one router interface and one other endpoint. Both addresses are usable; neither is reserved for broadcast.':(s.prefix===0?'A /0 spans all IPv4 space, so there are no neighboring /0 subnets. This is an address-space illustration, not a practical LAN design. ':'Each shaded region is a different subnet. Hosts in a region share its prefix; reaching another region requires the router. ' )+'Interface addresses are illustrative, not configured gateways. Lines represent shared local connectivity; switches are omitted.'+(s.ip===s.network || s.ip===s.end?' The entered IP is a reserved network or broadcast address, so it is not drawn as a host.':'');
  if(divided) document.getElementById('topology-note').textContent='Subdivision example: each department or building uses its own /24 mask (255.255.255.0), with 254 conventional usable addresses. Traffic between these /24 subnets goes through the router. The calculator below still describes the overall /'+s.prefix+' allocation. A device actually configured with /'+s.prefix+' would treat that larger block as local.';

}
function renderCidrHostRoute(s) {
  const svg=document.getElementById('cidr-topology'),address=numToIP(s.ip);
  svg.parentElement.classList.add('host-route-view');
  cidrTopologyView.height=240;
  svg.innerHTML=`<title id="topology-svg-title">Host route to ${address}/32</title>
    <desc id="topology-svg-description">A router uses a /32 route to match exactly ${address}. The arrow represents forwarding toward that destination, possibly through other routers, not a dedicated physical link.</desc>
    <defs><marker id="host-route-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#8096aa"/></marker></defs>
    <g class="topology-wires"><path d="M235 120H695" stroke-dasharray="6 5" marker-end="url(#host-route-arrow)"/></g>
    <g class="topology-router" transform="translate(190 120)">${cidrTopologyGlyphs.router}</g>
    <g class="topology-destination" transform="translate(750 120)" style="color:#3b5278">${cidrTopologyGlyphs.host}</g>
    <g text-anchor="middle">
      <text x="190" y="185" class="topology-network">Router</text>
      <text x="470" y="60" class="topology-network">Host route: <tspan class="topology-current-label">${address}/32</tspan></text>
      <text x="470" y="82" class="topology-range">Mask: 255.255.255.255 &#183; matches one address</text>
      <text x="470" y="150" class="topology-range">Forward toward this destination</text>
      <text x="750" y="185" class="topology-host">${address}</text>
      <text x="750" y="205" class="topology-range">Entered IP</text>
    </g>`;
  document.getElementById('topology-summary').textContent='Prefix /32: all 32 bits must match. This host route selects exactly one destination: '+address+'.';
  document.getElementById('topology-status').textContent='1 host route · /32 · Drag to pan';
  document.getElementById('topology-note').textContent='A /32 route identifies one destination; it does not tell us that device\'s LAN mask. The device can belong to a larger subnet. The arrow shows a forwarding direction, possibly through other routers; the next hop and physical network are not shown.';
  initCidrTopologyView(svg);
  fitCidrTopology();
}
function renderCidrRouterLink(s) {
  const svg=document.getElementById('cidr-topology');
  const base=Math.min(s.network,4294967284);
  const routers=[[470,90],[190,410],[750,410]];
  const links=[
    {ends:[0,1],points:[{x:400,y:170},{x:260,y:330}],label:[235,205],addresses:[[345,155],[205,340]]},
    {ends:[0,2],points:[{x:540,y:170},{x:680,y:330}],label:[705,205],addresses:[[595,155],[735,340]]},
    {ends:[1,2],points:[{x:290,y:410},{x:650,y:410}],label:[470,490],addresses:[[305,445],[635,445]]}
  ];
  const text=(x,y,value,cls='topology-range')=>'<text x="'+x+'" y="'+y+'" text-anchor="middle" class="'+cls+'">'+value+'</text>';
  let clouds='',labels='',wires='';
  for(const [i,link] of links.entries()) {
    const b=subnet(base+i*4,30),current=b.network===s.network,cidr=numToIP(b.network)+'/30';
    clouds+='<g class="cidr-subnet-cloud" style="--subnet-color:hsl('+[215,145,35][i]+' 48% 48%)"><path d="'+NetworkExplorerSubnets.cloud(link.points)+'"/></g>';
    wires+='<path d="M'+routers[link.ends[0]].join(' ')+'L'+routers[link.ends[1]].join(' ')+'"/>';
    labels+=text(link.label[0],link.label[1],cidr,'topology-network');
    labels+=text(link.label[0],link.label[1]+19,current?'<tspan class="topology-current-label">Entered IP block</tspan>':'Router link');
    [b.first,b.last].forEach((address,j)=>{labels+=text(link.addresses[j][0],link.addresses[j][1],numToIP(address)+(address===s.ip?' (entered IP)':''),'topology-interface');});
  }
  const lans=[
    {hosts:[[350,70],[590,70]],gateway:[470,145],label:[470,25]},
    {hosts:[[90,750],[280,750]],gateway:[190,660],label:[190,825]},
    {hosts:[[660,750],[850,750]],gateway:[750,660],label:[750,825]}
  ];
  let lanWires='',lanDevices='',lanLabels='';
  // Keep illustrative LANs separate from all three transit subnets.
  const lanRoot=(base>=3232238080 && base<=3232238847)?'172.16.':'192.168.';
  lans.forEach((lan,i)=>{
    const prefix=lanRoot+(10+i)+'.', [gx,gy]=lan.gateway;
    lanWires+='<path d="M'+routers[i][0]+' '+(routers[i][1]+150)+'L'+gx+' '+gy+'"/>';
    lan.hosts.forEach(([x,y],j)=>{
      lanWires+='<path d="M'+gx+' '+gy+'L'+x+' '+y+'"/>';
      lanDevices+='<g class="topology-lan-host" transform="translate('+x+' '+y+') scale(.75)" style="color:#3b5278">'+cidrTopologyGlyphs.host+'</g>';
      lanLabels+=text(x,y+38,prefix+(10+j),'topology-host');
    });
    lanDevices+='<circle cx="'+gx+'" cy="'+gy+'" r="5" fill="#fff" stroke="#3b5278" stroke-width="2"/>';
    lanLabels+=text(gx+(i===0?100:0),gy+(i===0?4:-14),prefix+'1','topology-interface');
    lanLabels+=text(lan.label[0],lan.label[1],'LAN '+(i+1)+' · '+prefix+'0/24','topology-network');
  });
  svg.parentElement.classList.remove('host-route-view');
  cidrTopologyView.height=850;
  svg.innerHTML='<title id="topology-svg-title">Three routers in a triangle, each with a host LAN</title><desc id="topology-svg-description">Three /30 links connect the routers. Each router also connects two example hosts on a separate /24 LAN.</desc><g class="topology-lan-context" opacity="0.45"><g class="topology-wires">'+lanWires+'</g>'+lanDevices+lanLabels+'</g><g transform="translate(0 150)">'+clouds+'<g class="topology-wires">'+wires+'</g>'+routers.map(([x,y],i)=>'<g class="topology-router" transform="translate('+x+' '+y+')" style="color:#3b5278">'+cidrTopologyGlyphs.router+'</g>'+text(x,y-36,'Router '+(i+1),'topology-network')).join('')+labels+'</g>';
  document.getElementById('topology-status').textContent='3 routers / 3 links / 3 LANs / Drag to pan';
  document.getElementById('topology-summary').textContent='Three /30 links connect the routers in a triangle. Each router also serves a small /24 host subnet.';
  document.getElementById('topology-note').textContent='Each router has two /30 link interfaces and one /24 LAN interface. The LANs show two example hosts each; their addresses are illustrative. The calculations below describe the selected /30 link.';
  initCidrTopologyView(svg);
  fitCidrTopology();
}
if(typeof module!=='undefined') module.exports={topologyBlocks};
const cidrTopologyView={zoom:100,height:620,x:470,y:310};
function applyCidrTopologyView() {
  const v=cidrTopologyView,w=940*100/v.zoom,h=v.height*100/v.zoom;
  document.getElementById('cidr-topology').setAttribute('viewBox',[v.x-w/2,v.y-h/2,w,h].join(' '));
  document.getElementById('topology-zoom').value=v.zoom;
  document.getElementById('topology-zoom-level').textContent=v.zoom+'%';
}
function setCidrTopologyZoom(value) {
  cidrTopologyView.zoom=Math.max(50,Math.min(300,value));applyCidrTopologyView();
}
function zoomCidrTopology(delta) {setCidrTopologyZoom(cidrTopologyView.zoom+delta);}
function fitCidrTopology() {
  Object.assign(cidrTopologyView,{zoom:100,x:470,y:cidrTopologyView.height/2});applyCidrTopologyView();
}
function initCidrTopologyView(svg) {
  if(svg.dataset.viewReady) return;
  svg.dataset.viewReady='true';
  let drag=null;
  svg.addEventListener('pointerdown',e=>{
    if(e.button!==0) return;
    const matrix=svg.getScreenCTM();
    if(!matrix) return;
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,cx:cidrTopologyView.x,cy:cidrTopologyView.y,scale:matrix.a};
    svg.setPointerCapture(e.pointerId);svg.classList.add('panning');
  });
  svg.addEventListener('pointermove',e=>{
    if(!drag || e.pointerId!==drag.id) return;
    cidrTopologyView.x=drag.cx-(e.clientX-drag.x)/drag.scale;
    cidrTopologyView.y=drag.cy-(e.clientY-drag.y)/drag.scale;
    applyCidrTopologyView();
  });
  const end=()=>{drag=null;svg.classList.remove('panning');};
  svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);svg.addEventListener('lostpointercapture',end);
  svg.parentElement.addEventListener('keydown',e=>{
    const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    if(!moves[e.key]) return;
    e.preventDefault();const [x,y]=moves[e.key],step=4000/cidrTopologyView.zoom;
    cidrTopologyView.x+=x*step;cidrTopologyView.y+=y*step;applyCidrTopologyView();
  });
}
