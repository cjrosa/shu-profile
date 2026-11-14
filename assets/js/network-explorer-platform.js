/* Shared vendor presentation and the supported PAN-OS Layer 2 command subset. */
(function(root){
 'use strict';
 const nextId=d=>{let id=2;while(d.vlans.some(v=>v.id===id))id++;if(id>4094)throw Error('No VLAN identifiers available.');return id;};
 function normalize(net,platform){net.platform=platform;net.devices.filter(d=>['switch','router'].includes(d.type)).forEach(d=>d.ports.forEach((p,i)=>{p.name=platform==='paloalto'?'ethernet1/'+(i+1):d.type==='router'?'G0/'+i:'P'+(i+1);}));}
 function vlanName(d,id){return d.vlans.find(v=>v.id===id)?.name||String(id);}
 function commands(mode){return mode==='exec'?['help','configure','show interface all','show mac all','close','exit']:['help','show network vlan','show network interface ethernet','set network interface ethernet','set network vlan','delete network vlan','commit','revert config','exit','close'];}
 function run(net,id,context,raw,apply){
  const d=net.device(id),cmd=raw.trim(),lower=cmd.toLowerCase();let m;
  if(lower==='help'||lower==='?')return commands(context.mode).join('\n')+'\nInterface: ethernet1/1 through ethernet1/8.\nExample: set network interface ethernet ethernet1/1 layer2\nExample: set network vlan Students interface ethernet1/1\nExample: set network interface ethernet ethernet1/1 link-state down\nUse quoted names for VLAN objects containing spaces.';
  if(lower==='configure'){context.mode='config';return 'Entering configuration mode.';}
  if(lower==='exit'){context.mode='exec';return 'Leaving configuration mode.';}
  const portList=()=>d.ports.map(p=>p.name+'  layer2  '+(p.enabled?'auto':'down')+'  '+vlanName(d,p.accessVlan)).join('\n');
  if(context.mode==='exec'){
   if(lower==='show interface all')return portList();
   if(lower==='show mac all')return Object.values(net.mac[id]||{}).map(r=>vlanName(d,r.vlan||1)+'  '+r.mac+'  '+d.ports.find(p=>p.id===r.port)?.name).join('\n')||'MAC table is empty.';
   throw Error('Enter configure to change settings. Type help for supported commands.');
  }
  if(lower==='show network vlan')return d.vlans.map(v=>v.name+' { interface [ '+d.ports.filter(p=>p.accessVlan===v.id).map(p=>p.name).join(' ')+' ]; }').join('\n');
  if(lower==='show network interface ethernet')return portList();
  if((m=cmd.match(/^set network interface ethernet (ethernet1\/[1-8]) (layer2|link-state (auto|up|down))$/i))){const p=d.ports.find(p=>p.name.toLowerCase()===m[1].toLowerCase());if(!p)throw Error('Interface not found.');apply(()=>net.configurePort(id,p.id,m[3]?{enabled:m[3].toLowerCase()!=='down'}:{mode:'access'}));return 'Candidate configuration updated. Commit to apply.';}
  if((m=cmd.match(/^set network vlan (?:"([^"]+)"|([^\s]+))(?: interface (.+))?$/i))){const name=m[1]||m[2];if(name.length>40)throw Error('Use a VLAN object name up to 40 characters.');const refs=m[3]?m[3].replace(/[\[\]]/g,' ').trim().split(/\s+/):[];const ports=refs.map(ref=>{const p=d.ports.find(p=>p.name.toLowerCase()===ref.toLowerCase());if(!p)throw Error('Unknown interface '+ref);return p;});const existing=d.vlans.find(v=>v.name===name),vid=existing?.id||nextId(d);apply(()=>{if(!existing)net.setVlan(id,vid,name);ports.forEach(p=>net.configurePort(id,p.id,{accessVlan:vid}));});return 'Candidate configuration updated. Commit to apply.';}
  if((m=cmd.match(/^delete network vlan (?:"([^"]+)"|([^\s]+))$/i))){const v=d.vlans.find(v=>v.name===(m[1]||m[2]));if(!v)throw Error('VLAN object not found.');if(v.id===1)throw Error('The teaching model retains its Default VLAN object.');if(d.ports.some(p=>p.accessVlan===v.id))throw Error('Move assigned interfaces to another VLAN object first.');apply(()=>{d.vlans=d.vlans.filter(x=>x!==v);net.reset();});return 'Candidate configuration updated. Commit to apply.';}
  throw Error('Unsupported command in this Layer 2 model. Type help.');
 }
 const api={normalize,nextId,vlanName,commands,run};if(typeof module!=='undefined')module.exports=api;else root.NetworkExplorerPlatform=api;
})(typeof window!=='undefined'?window:globalThis);
