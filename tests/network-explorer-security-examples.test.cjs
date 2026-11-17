const {test}=require('node:test'),assert=require('node:assert/strict');
const {Network}=require('../assets/js/network-explorer-engine.js'),E=require('../assets/js/network-explorer-examples.js');
function drain(n){let i=0;while(n.queue.length){n.next();assert.ok(++i<3000);}}
function browse(n,id,url){n.browse(id,url);drain(n);assert.equal(n.httpPages[id].code,200);}
for(const kind of ['encrypt','harden','detect','prevent'])test('security example '+kind+' starts functional and supports its defense',()=>{
 const e=E.securityLab(Network,kind),n=new Network(e.network.save()),c=n.device(e.clientId),s=n.device(e.serverId);
 browse(n,c.id,c.browserServer.url);
 if(kind==='encrypt'){
  assert.equal(s.webServer.tls,false);n.configureWeb(s.id,{...s.webServer,tls:true,port:443,certificateName:'secure.example',certificateTrusted:true,certificateValid:true});browse(n,c.id,'https://secure.example/');return;
 }
 const fw=n.device(e.firewallId);
 if(kind==='harden'){
  browse(n,c.id,'http://192.168.1.3/');n.scan(c.id,'nmap -sS -p 80 192.168.1.3');drain(n);assert.equal(n.scans[c.id].rows[0].state,'open');
  const base=fw.firewall.rules[0];n.configureFirewall(fw.id,{...fw.firewall,rules:[{...base,name:'DNS',protocol:'UDP',destination:'192.168.1.2',destinationPort:53},{...base,name:'HTTPS',protocol:'TCP',destination:'192.168.1.2',destinationPort:443}]});
  n.scan(c.id,'nmap -sS -p 80 192.168.1.3');drain(n);assert.equal(n.scans[c.id].rows[0].state,'filtered');browse(n,c.id,'https://secure.example/');return;
 }
 const scan=()=>{n.scan(c.id,'nmap -sS -p 22,80,443 192.168.1.2');drain(n);return n.scans[c.id].rows.map(r=>r.state);};
 assert.deepEqual(scan(),['closed','closed','open']);
 if(kind==='detect')assert.equal(n.intrusionAlerts[fw.id],undefined);else assert.equal(n.intrusionAlerts[fw.id].length,1);
 n.configureFirewall(fw.id,{...fw.firewall,intrusion:{...fw.firewall.intrusion,mode:kind==='detect'?'detect':'prevent'}});
 assert.deepEqual(scan(),['closed','closed',kind==='detect'?'open':'filtered']);assert.equal(n.intrusionAlerts[fw.id].length,1);
 n.configureFirewall(fw.id,{...fw.firewall,intrusion:{...fw.firewall.intrusion,mode:'off'}});n.configureFirewall(fw.id,{...fw.firewall,intrusion:{...fw.firewall.intrusion,mode:'prevent'}});browse(n,c.id,'https://secure.example/');
});
