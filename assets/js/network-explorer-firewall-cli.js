/* Operational firewall CLI subset. Output describes the simulator, not vendor internals. */
(function(root){
 'use strict';
 const F=typeof module!=='undefined'&&module.exports?require('./network-explorer-firewall.js'):root.NetworkExplorerFirewall;
 const args='from ZONE to ZONE source IP destination IP protocol NUMBER';
 function commands(platform){return platform==='paloalto'?['show running security-policy','show session all','show log traffic','test security-policy-match '+args+' [source-port PORT] [destination-port PORT]','clear session all']:['show policy-map type inspect zone-pair','show policy-map type inspect zone-pair sessions','show logging','simulate firewall-match '+args+' [source-port PORT] [destination-port PORT]','clear zone-pair inspect session'];}
 function handles(raw,platform){const s=raw.trim().toLowerCase();return commands(platform).some(c=>s===c||s.startsWith(c.split(' from ')[0]+' '))||s.startsWith(platform==='paloalto'?'test security-policy-match':'simulate firewall-match');}
 function policy(d){const c=d.firewall||F.defaults(d);return ['Simulator stateful policy: '+(c.enabled?'enabled':'disabled (bypass)'),...d.ports.map(p=>p.name+': '+c.zones[p.id]),...c.rules.map((r,i)=>(i+1)+'. '+r.name+' ['+(r.enabled?'enabled':'disabled')+'] '+r.action.toUpperCase()+' '+r.from+' -> '+r.to+' '+r.protocol+' '+r.source+':'+r.sourcePort+' -> '+r.destination+':'+r.destinationPort),'Default: '+c.defaultAction.toUpperCase()].join('\n');}
 function match(d,raw){
  const tokens=raw.trim().split(/\s+/).slice(2),values={},keys=['from','to','source','destination','protocol','source-port','destination-port'];
  if(tokens.length%2)throw Error('Supply key/value pairs: '+args+'. Optional source-port and destination-port.');
  for(let i=0;i<tokens.length;i+=2){const k=tokens[i].toLowerCase();if(!keys.includes(k)||Object.hasOwn(values,k))throw Error('Unknown or repeated field: '+k);values[k]=tokens[i+1];}
  for(const k of keys.slice(0,5))if(!values[k])throw Error('Missing '+k+'. '+args);
  const c=d.firewall||F.defaults(d),port=zone=>d.ports.find(p=>c.zones[p.id].toLowerCase()===zone.toLowerCase());
  const input=port(values.from),output=port(values.to);if(!input||!output||input===output)throw Error('Choose different zones assigned to this device.');
  const protocol={1:'ICMP',6:'TCP',17:'UDP'}[values.protocol];if(!protocol)throw Error('Protocol must be 1 (ICMP), 6 (TCP), or 17 (UDP).');
  // Reuse address validation; exact host addresses only for packet tests.
  for(const k of ['source','destination'])if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(values[k])||values[k].split('.').some(x=>+x>255))throw Error('Use an IPv4 host address for '+k+'.');
  const packet={type:'IPv4',sip:values.source,dip:values.destination,protocol,flags:'SYN',seq:0,icmp:'Echo Request',probe:'cli-test'};
  for(const [key,field] of [['source-port','sport'],['destination-port','dport']]){if(values[key]!==undefined){if(protocol==='ICMP'||!/^\d+$/.test(values[key])||+values[key]<1||+values[key]>65535)throw Error('Ports require TCP/UDP and values 1-65535.');packet[field]=+values[key];}else if(protocol!=='ICMP')throw Error('Specify '+key+' for a TCP/UDP test.');}
  // Isolated runtime: policy lookup cannot create live sessions, hits or log entries.
  const scratch={firewallSessions:{},firewallHits:{},firewallDecisions:{},clock:0};const result=F.evaluate(scratch,{...d,firewall:c},input,output,packet);
  return 'New-flow policy test only; no traffic sent, routing/link availability not tested.\n'+(result?F.describe(result):'Firewall disabled: bypass policy.')+'\nLive sessions, counters and decisions unchanged.';
 }
 function run(net,id,raw,platform,clear){const d=net.device(id),cmd=raw.trim().replace(/\s+/g,' ').toLowerCase(),pan=platform==='paloalto';
  if(cmd===(pan?'show running security-policy':'show policy-map type inspect zone-pair'))return policy(d);
  if(cmd===(pan?'show session all':'show policy-map type inspect zone-pair sessions')){const rows=(net.firewallSessions[id]||[]).filter(s=>s.expiresAt>Date.now());return 'Simulator firewall sessions ('+rows.length+')\n'+(rows.map(s=>s.protocol+' '+s.source+(s.sourcePort?':'+s.sourcePort:'')+' -> '+s.destination+(s.destinationPort?':'+s.destinationPort:'')+' '+s.state+' | '+s.rule+' | expires in '+Math.max(0,Math.ceil((s.expiresAt-Date.now())/1000))+'s').join('\n')||'No active sessions.');}
  if(cmd===(pan?'show log traffic':'show logging'))return 'Simulator recent firewall decisions (latest 12)\n'+((net.firewallDecisions[id]||[]).slice(-12).reverse().map(v=>F.describe(v)+' Rule: '+v.rule).join('\n')||'No firewall decisions yet.');
  if(cmd===(pan?'clear session all':'clear zone-pair inspect session')){const count=(net.firewallSessions[id]||[]).filter(s=>s.expiresAt>Date.now()).length;clear(()=>{net.firewallSessions[id]=[];});return 'Cleared '+count+' firewall session(s) on '+d.name+'. Rules, NAT mappings and decision history retained.';}
  if(cmd.startsWith(pan?'test security-policy-match ':'simulate firewall-match '))return match(d,raw);
  throw Error('Unsupported firewall command or arguments. Type help.');
 }
 const api={commands,handles,run};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NetworkExplorerFirewallCLI=api;
})(globalThis);
