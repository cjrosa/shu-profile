(function(root){'use strict';
 function cidr(ip,prefix){if(!Number.isInteger(prefix)||prefix<0||prefix>32||typeof ip!=='string')return null;const parts=ip.split('.');if(parts.length!==4||parts.some(p=>!/^\d+$/.test(p)||Number(p)>255))return null;const value=parts.reduce((n,p)=>(n*256+Number(p))>>>0,0),mask=prefix===0?0:(0xffffffff<<(32-prefix))>>>0,network=(value&mask)>>>0;return [24,16,8,0].map(s=>(network>>>s)&255).join('.')+'/'+prefix;}
 function groups(net){const devices=new Map(net.devices.map(d=>[d.id,d])),result=new Map(),adj=new Map();const key=(d,p)=>d+':'+p;for(const l of net.links){if(l.enabled===false)continue;const a=key(l.a,l.ap),b=key(l.b,l.bp);adj.set(a,b);adj.set(b,a);}for(const device of net.devices){const ports=device.type==='host'?device.ports.slice(0,1):device.type==='router'?device.ports:[];for(const port of ports){const subnet=cidr(device.type==='host'?device.ip:port.ip,device.type==='host'?device.prefix:port.prefix);if(!subnet)continue;if(!result.has(subnet))result.set(subnet,{cidr:subnet,ids:new Set()});const group=result.get(subnet),queue=[key(device.id,port.id)],seen=new Set();while(queue.length){const endpoint=queue.shift();if(seen.has(endpoint))continue;seen.add(endpoint);const [id,pid]=endpoint.split(':'),d=devices.get(id),p=d?.ports.find(p=>p.id===pid);if(!p)continue;const own=d.type==='host'?cidr(d.ip,d.prefix):d.type==='router'?cidr(p.ip,p.prefix):null;if(own&&own!==subnet)continue;group.ids.add(id);if(p.enabled===false)continue;if(adj.has(endpoint))queue.push(adj.get(endpoint));if(d.type==='switch'||d.firewallMode==='transparent')for(const other of d.ports)if(other.enabled!==false&&(other.accessVlan||1)===(p.accessVlan||1))queue.push(key(id,other.id));}}}return [...result.values()].sort((a,b)=>a.cidr.localeCompare(b.cidr,undefined,{numeric:true})).map(g=>({...g,ids:[...g.ids]}));}
 function cloud(points,padding=65){const all=points.flatMap(p=>Array.from({length:12},(_,i)=>({x:p.x+padding*Math.cos(i*Math.PI/6),y:p.y+padding*Math.sin(i*Math.PI/6)}))).sort((a,b)=>a.x-b.x||a.y-b.y);if(!all.length)return '';const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x),lower=[],upper=[];for(const p of all){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}for(const p of [...all].reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}const hull=lower.slice(0,-1).concat(upper.slice(0,-1)),mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2}),start=mid(hull.at(-1),hull[0]);return 'M'+start.x+' '+start.y+hull.map((p,i)=>{const end=mid(p,hull[(i+1)%hull.length]);return 'Q'+p.x+' '+p.y+' '+end.x+' '+end.y;}).join('')+'Z';}
 function details(value){const [ip,bits]=String(value).split('/'),prefix=Number(bits);if(bits===undefined||!cidr(ip,prefix))return null;const mask=prefix===0?0:(0xffffffff<<(32-prefix))>>>0,toIP=n=>[24,16,8,0].map(s=>(n>>>s)&255).join('.'),address=ip.split('.').reduce((n,p)=>n*256+Number(p),0),network=(address&mask)>>>0,total=2**(32-prefix),last=network+total-1;return {mask:toIP(mask),network:toIP(network),broadcast:prefix>=31?null:toIP(last),first:toIP(prefix>=31?network:network+1),last:toIP(prefix>=31?last:last-1),hosts:prefix>=31?total:total-2,prefix};}
 // Topological outside membership, not a promise of routing reachability.
 function outsideSubnets(net,router){
  const result=new Set(),seen=new Set(),queue=[];
  if(!router.nat?.enabled)return result;
  queue.push([router.id,router.nat.outside]);
  while(queue.length){
   const [id,pid]=queue.shift(),key=id+':'+pid;
   if(seen.has(key))continue;seen.add(key);
   const d=net.device(id),p=d?.ports.find(p=>p.id===pid);
   if(!p?.enabled||(id===router.id&&pid!==router.nat.outside))continue;
   const subnet=d.type==='host'?cidr(d.ip,d.prefix):d.type==='router'?cidr(p.ip,p.prefix):null;
   if(subnet)result.add(subnet);
   // Another NAT gateway is a boundary; do not enter its private networks.
   if(d.type==='router'&&id!==router.id&&!d.nat?.enabled)for(const q of d.ports)if(q.enabled&&q.ip)queue.push([id,q.id]);
   if(d.type==='switch'||d.firewallMode==='transparent')for(const q of d.ports)if(q.enabled&&(q.accessVlan||1)===(p.accessVlan||1))queue.push([id,q.id]);
   for(const l of net.links){if(!l.enabled)continue;if(l.a===id&&l.ap===pid)queue.push([l.b,l.bp]);if(l.b===id&&l.bp===pid)queue.push([l.a,l.ap]);}
  }
  return result;
 }
 const api={cidr,groups,cloud,details,outsideSubnets};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NetworkExplorerSubnets=api;
})(typeof globalThis!=='undefined'?globalThis:this);
