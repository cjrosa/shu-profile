/* Supported router display and static-route commands; configuration shares the UI model. */
(function(root){
 'use strict';
 function prefixFromMask(value){const n=value.split('.');if(n.length!==4||n.some(x=>!/^\d{1,3}$/.test(x)||Number(x)>255))throw Error('Enter a dotted-decimal subnet mask.');const bits=n.map(x=>Number(x).toString(2).padStart(8,'0')).join('');if(!/^1*0*$/.test(bits))throw Error('Subnet mask must have contiguous leading ones.');return bits.indexOf('0')<0?32:bits.indexOf('0');}
 function commands(mode,platform){if(platform==='paloalto')return mode==='exec'?['help','configure','show routing route','show interface all','show arp all','close','exit']:['help','show network virtual-router default routing-table ip static-route','set network virtual-router default routing-table ip static-route NAME destination NETWORK/PREFIX nexthop ip-address NEXT_HOP','delete network virtual-router default routing-table ip static-route NAME','commit','revert config','exit','close'];return ['help','show ip route','show ip interface brief','show arp','close','exit'].concat(mode==='exec'?['configure terminal']:['ip route NETWORK MASK NEXT_HOP','no ip route NETWORK MASK NEXT_HOP','end']);}
 function run(net,id,c,raw,apply,platform){const d=net.device(id),cmd=raw.trim(),lower=cmd.toLowerCase(),pan=platform==='paloalto';let m;
  if(lower==='help')return commands(c.mode,platform).join('\n');
  if(lower===(pan?'configure':'configure terminal')){c.mode='config';return 'Entering configuration mode.';}
  if(lower==='exit'||(!pan&&lower==='end')){c.mode='exec';return 'Leaving configuration mode.';}
  if(lower===(pan?'show routing route':'show ip route'))return net.routes(id).map(r=>(r.type==='connected'?'C':'S')+' '+r.network+'/'+r.prefix+' '+(r.nextHop?'via '+r.nextHop:'directly connected')+', '+d.ports.find(p=>p.id===r.port).name).join('\n')||'No active routes.';
  if(lower===(pan?'show interface all':'show ip interface brief'))return d.ports.map(p=>p.name+'  '+(p.ip?p.ip+'/'+p.prefix:'unconfigured')+'  '+(p.enabled?'up':'administratively down')).join('\n');
  if(lower===(pan?'show arp all':'show arp'))return Object.values(net.arp[id]||{}).map(r=>r.ip+'  '+r.mac+'  '+d.ports.find(p=>p.id===r.interface)?.name).join('\n')||'ARP cache is empty.';
  if(c.mode!=='config')throw Error('Enter '+(pan?'configure':'configure terminal')+' before changing routes.');
  if(pan&&lower==='show network virtual-router default routing-table ip static-route')return (d.staticRoutes||[]).map(r=>r.name+' destination '+r.network+'/'+r.prefix+' nexthop ip-address '+r.nextHop).join('\n')||'No static routes.';
  if(!pan&&(m=cmd.match(/^(no )?ip route (\S+) (\S+) (\S+)$/i))){const prefix=prefixFromMask(m[3]);if(m[1]){const r=(d.staticRoutes||[]).find(r=>r.network===m[2]&&r.prefix===prefix&&r.nextHop===m[4]);if(!r)throw Error('Static route not found.');apply(()=>net.removeStaticRoute(id,r.name));}else apply(()=>net.setStaticRoute(id,m[2],prefix,m[4]));return 'Static route '+(m[1]?'removed.':'configured.');}
  if(pan&&(m=cmd.match(/^set network virtual-router default routing-table ip static-route ([-a-zA-Z0-9_]+) destination (\d+(?:\.\d+){3})\/(\d+) nexthop ip-address (\S+)$/i))){apply(()=>net.setStaticRoute(id,m[2],Number(m[3]),m[4],m[1]));return 'Candidate route configured. Commit to apply.';}
  if(pan&&(m=cmd.match(/^delete network virtual-router default routing-table ip static-route ([-a-zA-Z0-9_]+)$/i))){apply(()=>net.removeStaticRoute(id,m[1]));return 'Candidate route removed. Commit to apply.';}
  throw Error('Unsupported router command. Type help. Interface addresses are configured in the inspector.');
 }
 const api={commands,run,prefixFromMask};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NetworkExplorerRouterCLI=api;
})(typeof globalThis!=='undefined'?globalThis:this);
