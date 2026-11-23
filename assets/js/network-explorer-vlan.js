/* Shared VLAN admission and on-wire tagging rules for the teaching model. */
(function(root){
 'use strict';
 const has=(d,id)=>d.vlans.some(v=>v.id===id);
 const carries=(p,id)=>!!p&&(p.mode==='trunk'?(p.allowedVlans||[1]).includes(id):(p.accessVlan||1)===id);
 function validate(d,p){
  if(!['access','trunk'].includes(p.mode))throw Error('Choose Access or Trunk mode.');
  if(!has(d,p.accessVlan??1))throw Error('Create the access VLAN on this switch first.');
  if(p.nativeVlan!==undefined&&!has(d,p.nativeVlan))throw Error('Create the native VLAN on this switch first.');
  if(p.allowedVlans!==undefined&&(!Array.isArray(p.allowedVlans)||p.allowedVlans.length>4094||new Set(p.allowedVlans).size!==p.allowedVlans.length||p.allowedVlans.some(id=>!Number.isInteger(id)||!has(d,id))))throw Error('Allowed VLANs must be distinct VLANs configured on this switch.');
  if(p.mode==='trunk'&&(p.nativeVlan===undefined||p.allowedVlans===undefined))throw Error('Trunks need a native VLAN and allowed VLAN list.');
 }
 function parse(text,d){
  text=String(text).trim().toLowerCase();if(text==='all')return d.vlans.map(v=>v.id);if(text==='none'||!text)return [];
  const ids=new Set();for(const part of text.split(',')){const m=part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);if(!m)throw Error('Use VLAN IDs or ranges, such as 10,20-30, all, or none.');const a=Number(m[1]),b=Number(m[2]||m[1]);if(a<1||b>4094||b<a)throw Error('Use VLAN IDs from 1 through 4094.');for(let id=a;id<=b;id++){if(!has(d,id))throw Error('Create VLAN '+id+' on this switch first.');ids.add(id);}}
  return [...ids].sort((a,b)=>a-b);
 }
 function classify(d,p,f){
  const tagged=f.vlanTag!==undefined;
  if(tagged&&(!Number.isInteger(f.vlanTag)||f.vlanTag<1||f.vlanTag>4094))return {error:'Invalid VLAN tag. Only a single VLAN ID from 1 through 4094 is supported.'};
  if(tagged&&p.mode!=='trunk')return {error:'Tagged frame received on an access port. Discard before MAC learning.'};
  const vlan=tagged?f.vlanTag:p.mode==='trunk'?p.nativeVlan:(p.accessVlan||1);
  if(!has(d,vlan)||!carries(p,vlan))return {vlan,error:'VLAN '+vlan+' is not configured or not allowed on '+p.name+'. Discard before MAC learning.'};
  return {vlan,reason:tagged?'Read VLAN '+vlan+' from the incoming 802.1Q tag.':'Untagged frame on '+p.name+' is assigned to '+(p.mode==='trunk'?'native':'access')+' VLAN '+vlan+'.'};
 }
 function egress(p,f,vlan){const out={...f};delete out.vlanTag;if(p.mode==='trunk'&&vlan!==p.nativeVlan)out.vlanTag=vlan;return out;}
 // Trace one untagged endpoint's Layer 2 segment without generating traffic.
 function segment(net,id,pid){
  const found=[],seen=new Set(),queue=[];
  const transmit=(id,pid,tag)=>{for(const l of net.links){if(!l.enabled)continue;if(l.a===id&&l.ap===pid)queue.push([l.b,l.bp,tag]);if(l.b===id&&l.bp===pid)queue.push([l.a,l.ap,tag]);}};
  const start=net.device(id)?.ports.find(p=>p.id===pid);if(!start?.enabled||(start.parentPort&&!net.device(id).ports.find(p=>p.id===start.parentPort)?.enabled))return found;found.push([id,pid]);transmit(id,start.parentPort||pid,start.parentPort?start.vlanId:undefined);
  while(queue.length){const [did,portId,tag]=queue.shift(),key=did+':'+portId+':'+tag;if(seen.has(key))continue;seen.add(key);const d=net.device(did),p=d?.ports.find(p=>p.id===portId);if(!p?.enabled)continue;
   if(d.type==='switch'){
    if(d.role==='ap'&&tag!==undefined)continue;const result=classify(d,p,tag===undefined?{}:{vlanTag:tag});if(result.error)continue;found.push([did,portId]);
    for(const q of d.ports)if(q.id!==portId&&q.enabled&&carries(q,result.vlan))transmit(did,q.id,egress(q,{},result.vlan).vlanTag);
   }else if(d.type==='router'&&tag!==undefined){const sub=d.ports.find(q=>q.parentPort===portId&&q.enabled&&q.vlanId===tag);if(sub)found.push([did,sub.id]);}else if(tag===undefined){found.push([did,portId]);if(d.firewallMode==='transparent')for(const q of d.ports)if(q.id!==portId&&q.enabled)transmit(did,q.id,undefined);}
  }
  return found;
 }
 const api={carries,validate,parse,classify,egress,segment};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NetworkExplorerVlan=api;
})(typeof globalThis!=='undefined'?globalThis:this);
