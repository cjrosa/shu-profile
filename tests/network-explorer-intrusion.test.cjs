const {test}=require('node:test');const assert=require('node:assert/strict');const {Network}=require('../assets/js/network-explorer-engine.js');const F=require('../assets/js/network-explorer-firewall.js');
function setup(mode='detect'){const n=new Network(),a=n.add('host'),b=n.add('host'),fw=n.add('firewall');n.configure(a.id,'192.168.1.10',24);n.configure(b.id,'192.168.1.20',24);n.connect(a.id,'p0',fw.id,'p0');n.connect(b.id,'p0',fw.id,'p1');n.configureWeb(b.id,{enabled:true,port:443,title:'Test',body:'Private'});n.installApplication(n.addApplication(0,0,'nmap').id,a.id);n.configureFirewall(fw.id,{...fw.firewall,intrusion:{mode,threshold:3,windowTicks:100}});return {n,a,b,fw};}
function drain(n){let i=0;while(n.queue.length){n.next();assert.ok(++i<1000);}}
test('Detect observes three ports without changing forwarding; evidence points to history',()=>{const {n,a,fw}=setup();n.scan(a.id,'nmap -sS -p 22,80,443 192.168.1.20');drain(n);assert.deepEqual(n.scans[a.id].rows.map(r=>r.state),['closed','closed','open']);const alert=n.intrusionAlerts[fw.id][0];assert.deepEqual(alert.ports,[22,80,443]);assert.equal(alert.action,'allow');assert.ok(n.history.some(e=>e.order===alert.eventOrder&&e.device===fw.id&&e.firewall.intrusion));assert.equal(n.firewallSessions[fw.id].length,0);});
test('Prevent blocks threshold-reaching SYN; earlier probes complete',()=>{const {n,a,fw}=setup('prevent');n.scan(a.id,'nmap -sS -p 22,80,443 192.168.1.20');drain(n);assert.deepEqual(n.scans[a.id].rows.map(r=>r.state),['closed','closed','filtered']);const event=n.history.find(e=>e.firewall?.intrusion);assert.equal(event.firewall.policyAction,'allow');assert.equal(event.firewall.action,'drop');assert.equal(event.outputs.length,0);assert.equal(n.firewallSessions[fw.id].length,0);});
test('Off and disabled firewall do not alert; Detect never overrides a policy drop',()=>{for(const mode of ['off','disabled','drop']){const {n,a,fw}=setup();n.configureFirewall(fw.id,{...fw.firewall,enabled:mode!=='disabled',rules:mode==='drop'?[]:fw.firewall.rules,intrusion:{mode:mode==='off'?'off':'detect',threshold:3,windowTicks:100}});n.scan(a.id,'nmap -sS -p 22,80,443 192.168.1.20');drain(n);if(mode==='drop'){assert.equal(n.intrusionAlerts[fw.id][0].action,'drop');assert.ok(n.scans[a.id].rows.every(r=>r.state==='filtered'));}else assert.equal(n.intrusionAlerts[fw.id],undefined);}});
test('distinct ports, rolling window, destination separation and normal traffic',()=>{const {n,a,b,fw}=setup();function probe(port,tick,dip=b.ip,flags='SYN'){n.clock=tick;return F.evaluate(n,fw,fw.ports[0],fw.ports[1],{protocol:'TCP',sip:a.ip,dip,sport:48000+tick,dport:port,flags,seq:1000},tick);}probe(80,1);probe(80,2);probe(443,3,'192.168.1.30');probe(443,4,b.ip,'ACK');assert.equal(n.intrusionAlerts[fw.id],undefined);probe(22,200);probe(80,201);assert.equal(n.intrusionAlerts[fw.id],undefined);assert.ok(probe(443,202).intrusion);assert.equal(probe(8080,400).intrusion,null);});
test('configuration persists, runtime resets, malformed imports are atomic',()=>{const {n,a,fw}=setup('prevent');n.scan(a.id,'nmap -sS -p 22,80,443 192.168.1.20');drain(n);const data=n.save(),restored=new Network(data);assert.equal(restored.device(fw.id).firewall.intrusion.mode,'prevent');assert.deepEqual(restored.intrusionAlerts,{});const bad=JSON.parse(JSON.stringify(data));bad.devices.find(d=>d.id===fw.id).firewall.intrusion.threshold=1;assert.throws(()=>n.load(bad));assert.equal(n.intrusionAlerts[fw.id].length,1);n.reset();assert.deepEqual(n.intrusionAlerts,{});delete data.devices.find(d=>d.id===fw.id).firewall.intrusion;assert.doesNotThrow(()=>new Network(data));});
test('animated snapshots retain detector state',()=>{let {n,a,fw}=setup('prevent');n.scan(a.id,'nmap -sS -p 22,80,443 192.168.1.20');while(n.queue.length){const next=Object.assign(new Network(),JSON.parse(JSON.stringify(n)));next.copyRuntimeFrom(n);next.next();n=next;}assert.equal(n.intrusionAlerts[fw.id].length,1);assert.equal(n.scans[a.id].rows[2].state,'filtered');});
test('ordinary routers ignore legacy IDS/IPS settings while retaining firewall policy, including after load',()=>{
  for(const mode of ['detect','prevent']){
    const n=new Network(),r=n.add('router');
    n.configureFirewall(r.id,{...F.defaults(r),enabled:true,defaultAction:'allow',intrusion:{mode,threshold:3,windowTicks:100}});
    for(const net of [n,new Network(n.save())]){
      const router=net.device(r.id);
      for(const [i,port] of [22,80,443].entries()){
        net.clock=i+1;
        const decision=F.evaluate(net,router,router.ports[0],router.ports[1],{protocol:'TCP',sip:'192.168.1.10',dip:'192.168.2.20',sport:48000+i,dport:port,flags:'SYN',seq:1000},i+1);
        assert.equal(decision.action,'allow');assert.equal(decision.intrusion,null);
      }
      assert.equal(net.intrusionAlerts[r.id],undefined);assert.equal(net.intrusionTracking[r.id],undefined);
      net.configureFirewall(r.id,{...router.firewall,rules:[],defaultAction:'drop'});
      const denied=F.evaluate(net,router,router.ports[0],router.ports[1],{protocol:'TCP',sip:'192.168.1.10',dip:'192.168.2.20',sport:49000,dport:8080,flags:'SYN',seq:1000},4);
      assert.equal(denied.action,'drop');assert.equal(denied.intrusion,null);
    }
  }
});
