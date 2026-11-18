(function(root){
  'use strict';
  const clone=x=>JSON.parse(JSON.stringify(x));
  function validate(d){
    if(d.role==='ap'){
      const c=d.wireless;
      if(d.type!=='switch'||!c||typeof c.ssid!=='string'||!c.ssid.trim()||c.ssid.length>32||!['open','wpa2'].includes(c.security)||typeof c.password!=='string'||(c.security==='wpa2'&&(c.password.length<8||c.password.length>63)))throw Error('Use an SSID (1–32 characters) and a WPA2 password of 8–63 characters.');
    }
    if(d.role==='laptop'&&!d.wifi)throw Error('A wireless laptop requires a Wi-Fi profile.');
    if(d.wifi!==undefined&&(d.type!=='host'||!d.wifi||typeof d.wifi.ap!=='string'||typeof d.wifi.password!=='string'||d.wifi.password.length>63||typeof d.wifi.connected!=='boolean'))throw Error('Invalid wireless client profile.');
  }
  function install(Network){
    const P=Network.prototype,base={};
    for(const key of ['add','reset','load','connect','transmit','next'])base[key]=P[key];
    P.add=function(type,...args){
      const d=base.add.call(this,type==='ap'?'switch':type==='laptop'?'host':type,...args);
      if(type==='ap'){d.role='ap';d.name='Wireless AP';d.wireless={ssid:'Classroom',security:'wpa2',password:'classroom123'};d.ports.forEach((p,i)=>p.name=i?'Wi-Fi '+i:'Ethernet');}
      if(type==='laptop'){d.role='laptop';d.name='Wireless Laptop';d.addressMode='dhcp';d.wifi={ap:'',password:'',connected:false};d.ports[0].name='wlan0';}
      return d;
    };
    P.wifiStatus=function(id){
      const d=this.device(id),c=d?.wifi,a=this.device(c?.ap);
      if(!c?.connected||a?.role!=='ap')return 'Disconnected';
      if(this.wifiPending?.[id])return 'Authenticating';
      const l=this.links.find(l=>l.medium==='wifi'&&(l.a===id||l.b===id));
      if(!l?.enabled||!d.ports[0].enabled||!a.ports.find(p=>p.id===(l.a===a.id?l.ap:l.bp))?.enabled)return 'Disconnected';
      return a.wireless.security==='open'||c.password===a.wireless.password?'Associated':'Authentication failed';
    };
    P.reset=function(){base.reset.call(this);this.wifiPending={};};
    P.configureWireless=function(id,config){const d=this.device(id);if(d?.role!=='ap')throw Error('Select an access point.');validate({...d,wireless:config});d.wireless=clone(config);this.reset();};
    P.connect=function(a,ap,b,bp,id){
      const ends=[[this.device(a),ap],[this.device(b),bp]],radio=ends.some(([d,p])=>d?.wifi||d?.role==='ap'&&p!=='p0');
      if(radio&&!this.wifiConnecting)throw Error('Join Wi-Fi from the laptop Inspector. Only the AP Ethernet uplink accepts a cable.');
      const l=base.connect.call(this,a,ap,b,bp,id);if(radio)l.medium='wifi';return l;
    };
    P.joinWifi=function(id,apId,password){
      if(this.queue.length)throw Error('Finish the exchange first.');
      const d=this.device(id),a=this.device(apId);if(!d?.wifi||a?.role!=='ap')throw Error('Select a wireless laptop and access point.');
      if(typeof password!=='string'||password.length>63)throw Error('Password must be at most 63 characters.');
      const old=this.links.find(l=>l.medium==='wifi'&&(l.a===id||l.b===id));
      const port=a.ports.slice(1).find(p=>p.enabled&&!this.links.some(l=>l!==old&&((l.a===a.id&&l.ap===p.id)||(l.b===a.id&&l.bp===p.id))));
      if(!port)throw Error('This AP has no free wireless association slots (maximum seven clients).');
      this.links=this.links.filter(l=>l!==old);if(d.addressMode==='dhcp'){d.ip='';d.prefix=null;d.gateway='';d.dnsServerAddress='';delete d.lease;}d.wifi={ap:apId,password,connected:true};
      this.wifiConnecting=true;try{this.connect(id,'p0',apId,port.id);}finally{this.wifiConnecting=false;}
      this.wifiPending[id]=true;this.enqueue({kind:'wifi-auth',device:id});
    };
    P.disconnectWifi=function(id){const d=this.device(id);if(!d?.wifi)throw Error('Select a wireless laptop.');d.wifi.connected=false;this.links=this.links.filter(l=>!(l.medium==='wifi'&&(l.a===id||l.b===id)));if(d.addressMode==='dhcp'){d.ip='';d.prefix=null;d.gateway='';d.dnsServerAddress='';delete d.lease;}this.reset();};
    P.transmit=function(d,port,frame){const l=this.links.find(l=>(l.a===d.id&&l.ap===port)||(l.b===d.id&&l.bp===port));if(l?.medium==='wifi'){const client=[this.device(l.a),this.device(l.b)].find(x=>x.wifi);if(this.wifiStatus(client?.id)!=='Associated')return;}return base.transmit.call(this,d,port,frame);};
    P.next=function(){
      const e=this.queue[0];if(!e?.kind.startsWith('wifi-'))return base.next.call(this);
      this.queue.shift();this.clock=e.time;const d=this.device(e.device),a=this.device(d.wifi.ap);
      let title,notes;
      if(e.kind==='wifi-auth'){title='Authenticate with '+a.wireless.ssid;notes=['The SSID identifies a network. Check admission before allowing data traffic.'];this.enqueue({kind:'wifi-result',device:d.id});}
      else{delete this.wifiPending[d.id];const ok=this.wifiStatus(d.id)==='Associated';title=ok?'Wi-Fi associated':'Wi-Fi authentication failed';notes=[ok?'The laptop may now exchange Layer 2 frames through the AP. IP configuration is a separate step.':'The password does not match, or the radio interface is disabled. No DHCP or other data can cross this wireless link.',a.wireless.security==='open'?'Open Wi-Fi: no wireless encryption.':'WPA2-Personal is modeled as a credential check; cryptographic handshakes and encryption are not implemented.'];}
      const report={...e,title,notes,outputs:[],outgoingFrames:[],before:{},after:{},clock:this.clock};this.history.push(report);return report;
    };
    P.load=function(data){
      for(const d of data?.devices||[])validate(d);
      for(const l of data?.links||[]){const a=data.devices.find(d=>d.id===l.a),b=data.devices.find(d=>d.id===l.b);const client=a?.wifi?a:b?.wifi?b:null,ap=a?.role==='ap'?a:b?.role==='ap'?b:null;
        if(l.medium!==undefined&&l.medium!=='wifi')throw Error('Invalid link medium.');
        if(l.medium==='wifi'&&(!client||!ap||client.wifi.ap!==ap.id||(ap===a?l.ap:l.bp)==='p0'))throw Error('Invalid wireless association.');
        if(l.medium!=='wifi'&&(client||(a?.role==='ap'&&l.ap!=='p0')||(b?.role==='ap'&&l.bp!=='p0')))throw Error('Wireless interfaces cannot accept Ethernet cables.');
      }
      return base.load.call(this,data);
    };
  }
  function example(Network){
    const n=new Network(),client=n.add('laptop',140,270),ap=n.add('ap',350,270),sw=n.add('switch',560,270),router=n.add('router',760,270),server=n.add('host',760,100);
    server.name='Wired Server';n.configure(server.id,'192.168.50.10',24);n.configureInterface(router.id,'p0','192.168.50.1',24);
    n.connect(ap.id,'p0',sw.id,'p0');n.connect(sw.id,'p1',router.id,'p0');n.connect(server.id,'p0',sw.id,'p2');
    n.configureDhcpServer(server.id,{enabled:true,pools:[{name:'Wireless-LAN',start:'192.168.50.100',end:'192.168.50.120',prefix:24,gateway:'192.168.50.1',dns:'',leaseSeconds:120}]});
    n.configureAddressMode(client.id,'dhcp');n.joinWifi(client.id,ap.id,'classroom123');while(n.queue.length)n.next();n.acquireDhcp(client.id);while(n.queue.length)n.next();
    return {network:n,clientId:client.id};
  }
  const api={install,example};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NetworkExplorerWireless=api;
})(typeof globalThis!=='undefined'?globalThis:this);
