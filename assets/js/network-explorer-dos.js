(function(root){'use strict';
const defaults=()=>({enabled:true,target:'192.168.1.2',port:443,count:40,interval:2});
function validate(c){if(!c||c.enabled!==true||!/^\d{1,3}(\.\d{1,3}){3}$/.test(c.target)||c.target.split('.').some(x=>+x>255)||+c.target.split('.')[0]===0||+c.target.split('.')[0]===127||+c.target.split('.')[0]>=224||!Number.isInteger(c.port)||c.port<1||c.port>65535||!Number.isInteger(c.count)||c.count<1||c.count>100||!Number.isInteger(c.interval)||c.interval<1||c.interval>20)throw Error('Use a unicast IPv4 target, port 1-65535, 1-100 SYNs, and interval 1-20 ticks.');}
function start(n,id,probeId){const d=n.device(id);if(!d?.generatorServer||!d.ip)throw Error('Install Traffic Generator on a configured host.');validate(d.generatorServer);if(n.queue.length)throw Error('Finish the current exchange first.');let probe;if(probeId){const client=n.device(probeId);if(!client?.browserServer?.enabled||!client.ip||client.id===id)throw Error('Choose a separate configured Browser client.');const u=new URL(client.browserServer.url);if(!/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname))throw Error('Use a numeric IP in the check client Browser URL.');probe={client,u};}n.generators[id]={probeId,sent:0,total:d.generatorServer.count,status:'running'};n.enqueue({kind:'dos-send',device:id,index:0});if(probe){const {client,u}=probe;const url={url:u.href,host:u.hostname,authority:u.host,secure:u.protocol==='https:',port:Number(u.port||(u.protocol==='https:'?443:80)),path:u.pathname+u.search};n.httpPages[client.id]={url:url.url,status:'Scheduled availability check'};n.enqueue({kind:'tcp-start',device:client.id,target:u.hostname,url},Math.max(20,Math.floor(d.generatorServer.count*d.generatorServer.interval/2)));}}

function stop(n,id){if(n.generators[id])n.generators[id].status='stopped';n.queue=n.queue.filter(e=>!(e.kind==='dos-send'&&e.device===id));}
function load(n,id){return n.serverLoad[id]||(n.serverLoad[id]={accepted:0,dropped:0,expired:0,pending:{}});}
function gate(n,d,f){if(f.protocol!=='TCP'||!d.webServer?.enabled||f.dport!==d.webServer.port)return false;const st=load(n,d.id),key=f.connection;
 if(f.flags==='SYN'&&!st.pending[key]){const limit=d.webServer.synCapacity??32;if(Object.keys(st.pending).length>=limit){st.dropped++;return true;}st.accepted++;st.pending[key]={source:f.sip,port:f.sport};n.enqueue({kind:'dos-expire',device:d.id,connection:key},d.webServer.synTimeout??120);}
 else if(st.pending[key]&&st.pending[key].source===f.sip&&st.pending[key].port===f.sport&&((f.flags==='ACK'&&f.ack===5001)||f.flags==='RST')){delete st.pending[key];n.queue=n.queue.filter(e=>!(e.kind==='dos-expire'&&e.device===d.id&&e.connection===key));}
 return false;
}
// New bursts must not reuse a source port while a firewall still tracks its SYN.
function sourcePort(n,d,order){
 const now=Date.now(),used=new Set(Object.values(n.firewallSessions||{}).flat().filter(s=>s.protocol==='TCP'&&s.source===d.ip&&s.expiresAt>now).map(s=>s.sourcePort));
 const base=40000,size=65536-base;
 for(let offset=0;offset<size;offset++){const port=base+(order+offset)%size;if(!used.has(port))return port;}
 throw Error('No free traffic-generator source ports. Wait for tracked firewall sessions to expire.');
}
function handle(n,e,d,p,emitIp,hostHop){
 if(e.kind==='dos-expire'){const st=load(n,d.id);if(st.pending[e.connection]){delete st.pending[e.connection];st.expired++;for(const [k,c] of Object.entries(n.tcp))if(k.startsWith(d.id+':')&&c.id===e.connection&&c.state==='SYN-RECEIVED')delete n.tcp[k];}return {title:'Pending connection expires',notes:['The server releases an incomplete handshake slot after its simulation-tick timeout.']};}
 if(e.kind==='dos-send'){const c=d.generatorServer,r=n.generators[d.id];if(!c||r?.status!=='running')return {title:'Generator stopped',notes:[]};const connection=d.id+':dos:'+e.order,hop=hostHop(c.target);if(hop)emitIp(p,hop,{type:'IPv4',protocol:'TCP',sip:d.ip,dip:c.target,sport:sourcePort(n,d,e.order),dport:c.port,ttl:64,connection,flags:'SYN',seq:1000,ack:0,length:0});r.sent++;if(r.sent<c.count)n.enqueue({kind:'dos-send',device:d.id,index:e.index+1},c.interval);else r.status='finished';return {title:'Traffic generator sends SYN',notes:['Simulated SYN '+r.sent+' / '+c.count+'. This source deliberately does not complete the handshake.']};}
 return {title:'Generator ignores server reply',notes:['No final ACK is sent; the server slot remains occupied until timeout.']};
}
const api={defaults,validate,start,stop,load,gate,handle};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NetworkExplorerDos=api;
})(globalThis);
