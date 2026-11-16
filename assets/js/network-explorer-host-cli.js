(function(root){
 'use strict';
 const Router=typeof module!=='undefined'&&module.exports?require('./network-explorer-router-cli.js'):root.NetworkExplorerRouterCLI;
 function commands(os){return ['netstat','netstat -an',...(os==='linux'?['netstat -tuln']:[])].concat(addressCommands(os));}
 function addressCommands(os){return os==='linux'?['ip addr add IP/PREFIX dev eth0','ip addr del IP/PREFIX dev eth0','ip addr flush dev eth0','dhclient eth0']:os==='macos'?['ifconfig eth0 inet IP netmask MASK','ifconfig eth0 inet IP delete','ipconfig set eth0 DHCP']:['netsh interface ipv4 set address name="eth0" source=static address=IP mask=MASK gateway=none','netsh interface ipv4 delete address name="eth0" address=IP','netsh interface ipv4 set address name="eth0" source=dhcp'];}
 function parse(d,raw){const os=d.os||'windows',s=raw.trim().replace(/^sudo\s+/i,''),low=s.toLowerCase();let m,op;
  if(/^netstat\b/i.test(s)){
   const flags=s.split(/\s+/).slice(1);const allowed=os==='linux'?/^-[antul]+$/:/^-[an]+$/;
   if(flags.some(f=>!allowed.test(f)))throw Error('Supported: netstat, netstat -an'+(os==='linux'?', netstat -tuln':'')+'.');
   return {kind:'netstat',flags:flags.join('').replaceAll('-','')};
  }
  const iface=name=>{if(![d.ports[0].name.toLowerCase(),...(os==='windows'?['ethernet']:os==='macos'?['en0']:[])].includes(name.toLowerCase()))throw Error('Unknown interface. Use '+d.ports[0].name+'.');};
  if(os==='windows'&&/^netsh\s+interface\s+ipv4\s+/.test(low)){
   m=s.match(/^netsh\s+interface\s+ipv4\s+(set|delete)\s+address\s+(.+)$/i);if(!m)throw Error('Use netsh interface ipv4 set/delete address. Type help.');
   const values={},tokens=m[2].match(/(?:[^\s"]+|"[^"]*")+/g)||[];
   for(const token of tokens){const pair=token.match(/^(name|source|address|mask|gateway)=(?:"([^"]*)"|(\S+))$/i);if(!pair||Object.hasOwn(values,pair[1].toLowerCase()))throw Error('Use unique name=, source=, address=, mask= and gateway= arguments.');values[pair[1].toLowerCase()]=pair[2]??pair[3];}
   if(!values.name)throw Error('Specify name="eth0".');iface(values.name);
   if(m[1].toLowerCase()==='delete'){if(!values.address||Object.keys(values).some(k=>!['name','address'].includes(k)))throw Error('Delete requires only name= and address=.');op={kind:'delete',ip:values.address};}
   else if(values.source?.toLowerCase()==='dhcp'){if(Object.keys(values).some(k=>!['name','source'].includes(k)))throw Error('DHCP requires only name= and source=dhcp.');op={kind:'dhcp'};}
   else{if(values.source?.toLowerCase()!=='static'||!values.address||!values.mask)throw Error('Static configuration requires source=static address=IP mask=MASK.');op={kind:'set',ip:values.address,prefix:Router.prefixFromMask(values.mask),gateway:values.gateway?.toLowerCase()==='none'?'':values.gateway??''};}
  }else if(os==='linux'&&(m=s.match(/^ip\s+(?:addr|address)\s+(add|del|delete)\s+(\S+)\/(\d+)\s+dev\s+(\S+)$/i))){iface(m[4]);op={kind:m[1].toLowerCase()==='add'?'add':'delete',ip:m[2],prefix:+m[3]};}
  else if(os==='linux'&&(m=s.match(/^ip\s+(?:addr|address)\s+flush\s+dev\s+(\S+)$/i))){iface(m[1]);op={kind:'clear'};}
  else if(os==='linux'&&(m=s.match(/^dhclient\s+(\S+)$/i))){iface(m[1]);op={kind:'dhcp'};}
  else if(os==='macos'&&(m=s.match(/^ifconfig\s+(\S+)\s+inet\s+(\S+)\s+netmask\s+(\S+)$/i))){iface(m[1]);op={kind:'set',ip:m[2],prefix:Router.prefixFromMask(m[3])};}
  else if(os==='macos'&&(m=s.match(/^ifconfig\s+(\S+)\s+inet\s+(\S+)\s+(?:delete|-alias)$/i))){iface(m[1]);op={kind:'delete',ip:m[2]};}
  else if(os==='macos'&&(m=s.match(/^ipconfig\s+set\s+(\S+)\s+DHCP$/i))){iface(m[1]);op={kind:'dhcp'};}
  else if(/^(?:netsh\b|ip (?:addr|address) (?:add|del|delete|flush)\b|ifconfig \S+ inet\b|ipconfig set\b|dhclient\b)/i.test(s))throw Error('Unsupported address command for '+os+'. Type help.');
  return op||null;
 }
 function run(n,id,op,apply){const d=n.device(id);if(!d||d.type!=='host')throw Error('Select a host.');
  if(op.kind==='netstat')return {message:netstat(n,d,op.flags)};
  if(op.kind==='add'&&d.ip)throw Error('This simulator supports one IPv4 address per host. Remove the current address first.');
  if(op.kind==='delete'&&(d.ip!==op.ip||(op.prefix!==undefined&&d.prefix!==op.prefix)))throw Error('That address/prefix is not assigned to this host.');
  function update(net){const host=net.device(id);if(op.kind==='dhcp'){if(host.addressMode!=='dhcp')net.configureAddressMode(id,'dhcp');return;}
   if(host.addressMode==='dhcp')net.configureAddressMode(id,'manual');
   if(['clear','delete'].includes(op.kind)){net.configure(id,'',null);return;}
   if(op.gateway!==undefined)host.gateway='';
   net.configure(id,op.ip,op.prefix);if(op.gateway!==undefined)net.configureGateway(id,op.gateway);
  }
  // Validate on a copy first so an invalid gateway/address cannot partially alter live configuration.
  const trial=new n.constructor(n.save());update(trial);apply(()=>update(n));
  return {dhcp:op.kind==='dhcp',message:op.kind==='dhcp'?'Automatic addressing enabled; requesting DHCP configuration.':d.ip?'IPv4 configured: '+d.ip+'/'+d.prefix:'IPv4 address removed. Host is Not configured.'};
 }
 function netstat(n,d,flags=''){
  const os=d.os||'windows',all=flags.includes('a'),listen=flags.includes('l');
  let rows=(n.echo?.[d.id]?.sockets||[]).filter(s=>!['CREATED','CLOSED','ERROR'].includes(s.state)).map(s=>({protocol:s.protocol,local:s.state==='LISTEN'||s.state==='BOUND'?'0.0.0.0':d.ip,port:s.port,peer:s.protocol==='UDP'?'':s.peer,remote:s.peerPort,state:s.protocol==='UDP'?'':s.state,recv:s.protocol==='UDP'?s.datagrams.reduce((sum,x)=>sum+x.bytes.length,0):s.buffer.length}));
  if(d.webServer?.enabled)rows.push({protocol:'TCP',local:'0.0.0.0',port:d.webServer.port,state:'LISTEN',recv:0});
  if(d.dnsServer?.enabled)rows.push({protocol:'UDP',local:'0.0.0.0',port:53,state:'',recv:0});
  for(const [key,c] of Object.entries(n.tcp||{}))if(key.startsWith(d.id+':'))rows.push({protocol:'TCP',local:d.ip,port:c.localPort,peer:c.peer,remote:c.remotePort,state:c.state,recv:0});
  rows=rows.filter(r=>{const passive=r.state==='LISTEN'||r.protocol==='UDP';return (listen?passive:all||!passive)&&(!flags.includes('t')&&!flags.includes('u')||flags.includes(r.protocol==='TCP'?'t':'u'));});
  const header=os==='windows'?['Proto','Local Address','Foreign Address','State']:['Proto','Recv-Q','Send-Q','Local Address','Foreign Address','State'];
  const values=rows.map(r=>{
   const mac=os==='macos',sep=mac?'.':':',local=(mac&&r.local==='0.0.0.0'?'*':r.local)+sep+r.port;
   const remote=r.peer?r.peer+sep+r.remote:(mac?'*.*':os==='windows'&&r.protocol==='TCP'?'0.0.0.0:0':'*:*');
   let state=r.state||'';if(os==='windows'&&state==='LISTEN')state='LISTENING';else if(os!=='windows')state=state.replaceAll('-','_');
   return os==='windows'?[r.protocol,local,remote,state]:[r.protocol.toLowerCase()+(mac?'4':''),String(r.recv), '0',local,remote,state];
  });
  const widths=header.map((h,i)=>Math.max(h.length,...values.map(r=>r[i].length))+2);
  return ['Active Internet connections (simulated IPv4)',...[header,...values].map(r=>r.map((v,i)=>v.padEnd(widths[i])).join('').trimEnd()),...(values.length?[]:['(no matching sockets)'])].join('\n');
 }
 const api={commands,parse,run,netstat};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NetworkExplorerHostCLI=api;
})(globalThis);
