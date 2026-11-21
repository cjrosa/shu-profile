/* Single-area OSPFv2 teaching model. All protocol knowledge arrives over links.
 * Timers are separate from the finite work queue; no wall-clock protocol state.
 * Point-to-point adjacencies and Router-LSAs only. Packet encoding/MTU negotiation,
 * DR elections, multiple areas, authentication and ECMP are intentionally omitted. */
(function(root){
  'use strict';
  const clone=x=>JSON.parse(JSON.stringify(x)), multicast='01:00:5e:00:00:05';
  const address=s=>typeof s==='string'&&/^\d+\.\d+\.\d+\.\d+$/.test(s)&&s.split('.').every(v=>+v<=255);
  const number=s=>s.split('.').reduce((n,v)=>(n*256+Number(v))>>>0,0);
  const network=(s,p)=>{const n=(number(s)&(0xffffffff<<(32-p)))>>>0;return [24,16,8,0].map(b=>(n>>>b)&255).join('.');};
  function defaults(d){return {enabled:false,routerId:'10.255.'+((Number(d.id.slice(1))>>8)&255)+'.'+(Number(d.id.slice(1))&255),area:0,hello:10,dead:40,interfaces:Object.fromEntries(d.ports.map(p=>[p.id,{mode:'off',cost:1}]))};}
  function validate(d,c,devices=[]){
    if(d.type!=='router'||d.firewallMode==='transparent')throw Error('OSPF is available only on routed Router devices.');
    if(!c||typeof c.enabled!=='boolean'||!address(c.routerId)||!number(c.routerId)||number(c.routerId)===0xffffffff||c.area!==0)throw Error('Use a nonzero IPv4-format router ID and area 0.');
    if(!Number.isInteger(c.hello)||c.hello<1||c.hello>60||!Number.isInteger(c.dead)||c.dead<=c.hello||c.dead>240)throw Error('Hello must be 1–60 ticks; dead interval must exceed Hello and be at most 240 ticks.');
    if(!c.interfaces||Object.keys(c.interfaces).some(id=>!d.ports.some(p=>p.id===id)))throw Error('Invalid OSPF interface.');
    for(const p of d.ports){const i=c.interfaces[p.id];if(!i||!['active','passive','off'].includes(i.mode)||!Number.isInteger(i.cost)||i.cost<1||i.cost>65535)throw Error('Select Active, Passive or Off and a cost from 1 to 65535.');if(c.enabled&&i.mode!=='off'&&!p.ip)throw Error('Configure an IP address before including '+p.name+' in OSPF.');}
    if(c.enabled&&devices.some(x=>x.id!==d.id&&x.ospf?.enabled&&x.ospf.routerId===c.routerId))throw Error('Each enabled OSPF router needs a unique router ID.');
  }
  function state(n,d){n.ospfState??={};return n.ospfState[d.id]??=( {routerId:d.ospf.routerId,neighbors:{},database:{},routes:[],serial:0,nextHello:n.clock,nextRefresh:n.clock+1800,signature:'',warnings:[]} );}
  function active(d,p){return d.ospf?.enabled&&p.enabled&&p.ip&&d.ospf.interfaces[p.id]?.mode==='active';}
  function peer(n,d,p){const l=n.links.find(l=>l.enabled&&((l.a===d.id&&l.ap===p.id)||(l.b===d.id&&l.bp===p.id)));if(!l)return null;const other=n.device(l.a===d.id?l.b:l.a),port=other?.ports.find(q=>q.id===(l.a===d.id?l.bp:l.ap));return other?.type==='router'&&other.firewallMode!=='transparent'&&port?.enabled?{device:other,port,link:l}:null;}
  function send(n,d,p,message,outputs,frames){if(!active(d,p))return;const f={type:'IPv4',protocol:'OSPF',sip:p.ip,dip:'224.0.0.5',ttl:1,src:p.mac,dst:multicast,ospf:{...clone(message),routerId:d.ospf.routerId,area:0}};outputs.push(p.id);frames.push({port:p.id,frame:f});n.transmit(d,p.id,f);}
  function schedule(n,id,action,extra={}){
    if(action==='flood'){
      // Collect changes until the next flood event; send only the latest version
      // of each LSA, grouped into one Update per eligible neighbor.
      const pending=n.queue.find(e=>e.kind==='ospf-flood'&&e.device===id);
      if(pending){pending.advertisements[extra.lsa.routerId]=extra;return;}
      n.enqueue({kind:'ospf-flood',device:id,advertisements:{[extra.lsa.routerId]:extra}});return;
    }
    if(Object.keys(extra).length||!n.queue.some(e=>e.kind==='ospf-'+action&&e.device===id))n.enqueue({kind:'ospf-'+action,device:id,...extra});
  }
  function originate(n,d,s){
    const links=[],prefixes=[];
    for(const p of d.ports){const c=d.ospf.interfaces[p.id];if(!p.enabled||!p.ip||!c||c.mode==='off')continue;prefixes.push({network:network(p.ip,p.prefix),prefix:p.prefix,cost:c.cost});const nb=s.neighbors[p.id];if(c.mode==='active'&&nb?.state==='Full')links.push({routerId:nb.routerId,cost:c.cost});}
    const signature=JSON.stringify({links,prefixes});if(signature===s.signature&&s.database[d.ospf.routerId])return;
    s.signature=signature;const lsa={routerId:d.ospf.routerId,sequence:++s.serial,born:n.clock,links,prefixes};s.database[lsa.routerId]=lsa;s.nextRefresh=n.clock+1800;schedule(n,d.id,'flood',{lsa});schedule(n,d.id,'spf');
  }
  function spf(n,d,s){
    const start=d.ospf.routerId,dist={[start]:0},first={},done=new Set();
    while(true){const id=Object.keys(dist).filter(k=>!done.has(k)).sort((a,b)=>dist[a]-dist[b]||a.localeCompare(b))[0];if(!id)break;done.add(id);
      for(const edge of s.database[id]?.links||[]){if(!s.database[edge.routerId]?.links.some(back=>back.routerId===id))continue;const cost=dist[id]+edge.cost;if(dist[edge.routerId]===undefined||cost<dist[edge.routerId]){dist[edge.routerId]=cost;first[edge.routerId]=id===start?edge.routerId:first[id];}}
    }
    const routes={};for(const [id,lsa]of Object.entries(s.database)){if(id===start||dist[id]===undefined)continue;const entry=Object.entries(s.neighbors).find(([,v])=>v.routerId===first[id]&&v.state==='Full');if(!entry)continue;const [port,nb]=entry;
      for(const prefix of lsa.prefixes){const r={...prefix,type:'ospf',cost:dist[id]+prefix.cost,port,nextHop:nb.ip,active:true,learnedFrom:id},key=r.network+'/'+r.prefix;delete r.sequence;if(!routes[key]||r.cost<routes[key].cost)routes[key]=r;}}
    s.routes=Object.values(routes).sort((a,b)=>b.prefix-a.prefix||a.network.localeCompare(b.network));
  }
  function maintain(n){
    n.ospfState??={};
    for(const id of Object.keys(n.ospfState))if(!n.device(id)?.ospf?.enabled)delete n.ospfState[id];
    for(const d of n.devices.filter(d=>d.ospf?.enabled)){
      const s=state(n,d);if(s.routerId!==d.ospf.routerId){delete n.ospfState[d.id];schedule(n,d.id,'start');continue;}
      s.warnings=[];
      for(const p of d.ports){if(active(d,p)){const l=n.links.find(l=>(l.a===d.id&&l.ap===p.id)||(l.b===d.id&&l.bp===p.id));const other=l&&n.device(l.a===d.id?l.b:l.a);if(other&&other.type!=='router')s.warnings.push(p.name+': shared transit LANs are not supported; use a direct router link or Passive.');}
        const nb=s.neighbors[p.id];if(nb&&nb.state!=='Down'&&(!active(d,p)||nb.localIp!==p.ip||nb.localPrefix!==p.prefix||!peer(n,d,p)||n.clock-nb.lastHello>=d.ospf.dead)){const previousState=nb.state;nb.state='Down';nb.pending={};nb.requests=[];schedule(n,d.id,'down',{port:p.id,neighbor:nb.routerId,previousState});}}
      if(n.clock>=s.nextHello){s.nextHello=n.clock+d.ospf.hello;schedule(n,d.id,'hello');}
      for(const [id,lsa]of Object.entries(s.database))if(n.clock-lsa.born>=3600){delete s.database[id];schedule(n,d.id,'spf');}
      if(n.clock>=s.nextRefresh){s.signature='';}
      originate(n,d,s);
      for(const [port,nb]of Object.entries(s.neighbors))if(['Exchange','Loading','Full'].includes(nb.state)&&n.clock>=nb.retryAt&&(nb.state!=='Full'||Object.keys(nb.pending||{}).length)&&!n.queue.some(e=>e.kind==='ospf-retry'&&e.device===d.id&&e.port===port)){schedule(n,d.id,'retry',{port});}
    }
  }
  function handle(n,e){
    const d=n.device(e.device),outputs=[],outgoingFrames=[],notes=[];let title='OSPF',s=d?.ospf?.enabled?state(n,d):null;
    if(!s)return {...e,ospf:true,ospfChanged:false,title:'OSPF disabled',notes:['Discard pending protocol work.'],outputs,outgoingFrames,before:{},after:{},clock:n.clock};
    const before=clone({neighbors:s.neighbors,routes:s.routes,database:s.database});
    if(e.kind==='ospf-down'&&before.neighbors[e.port])before.neighbors[e.port].state=e.previousState;
    const sendOn=(port,m)=>{const p=d.ports.find(q=>q.id===port);if(p)send(n,d,p,m,outputs,outgoingFrames);};
    const update=(port,lsas)=>{const nb=s.neighbors[port];if(!nb)return;nb.pending??={};for(const l of lsas)nb.pending[l.routerId]=clone(l);nb.retryAt=n.clock+5;sendOn(port,{message:'Link State Update',lsas});};
    const description=(port,reply=false)=>{s.neighbors[port].retryAt=n.clock+5;sendOn(port,{message:'Database Description',reply,headers:Object.values(s.database).map(l=>({routerId:l.routerId,sequence:l.sequence}))});};
    if(e.kind==='ospf-hello'||e.kind==='ospf-start'){
      title='OSPF: send Hello';for(const p of d.ports)if(active(d,p)&&peer(n,d,p))sendOn(p.id,{message:'Hello',hello:d.ospf.hello,dead:d.ospf.dead,neighbors:Object.values(s.neighbors).filter(v=>v.state!=='Down').map(v=>v.routerId)});
      notes.push('Discover neighbors on active point-to-point interfaces. Passive LANs are advertised without sending Hellos.');
    }else if(e.kind==='ospf-down'){title='OSPF neighbor Down';notes.push('Neighbor '+e.neighbor+' is unavailable. Originate updated link state and recalculate reachable routes.');}
    else if(e.kind==='ospf-flood'){
      title='OSPF: flood Router-LSAs';
      for(const [port,nb]of Object.entries(s.neighbors))if(['Exchange','Loading','Full'].includes(nb.state)){
        const lsas=Object.values(e.advertisements).filter(a=>a.except!==port&&s.database[a.lsa.routerId]?.sequence===a.lsa.sequence).map(a=>a.lsa);
        if(lsas.length)update(port,lsas);
      }
      notes.push('Group pending advertisements into one update per neighbor, using the latest LSA versions. Each receiver decides whether this information is newer.');
    }
    else if(e.kind==='ospf-spf'){title='OSPF: calculate lowest-cost routes';spf(n,d,s);notes.push('Run Dijkstra using only this router’s learned link-state database. Sum outgoing interface costs, including the destination LAN. Equal costs select one deterministic path.');}
    else if(e.kind==='ospf-retry'){const nb=s.neighbors[e.port];title='OSPF: retransmit unacknowledged information';if(nb&&['Exchange','Loading','Full'].includes(nb.state)&&n.clock>=nb.retryAt){nb.retryAt=n.clock+5;if(Object.keys(nb.pending||{}).length)update(e.port,Object.values(nb.pending));if(nb.requests?.length)sendOn(e.port,{message:'Link State Request',requests:nb.requests});else if(nb.state!=='Full')description(e.port);}notes.push('Retry database synchronization or advertisements awaiting acknowledgment.');}
    else if(e.frame?.ospf){
      const f=e.frame,m=f.ospf,p=d.ports.find(q=>q.id===e.ingress),physical=p&&peer(n,d,p);title='OSPF: receive '+m.message;
      if(!p||!active(d,p)||!physical||physical.device.id!==e.from||!physical.link.enabled||f.sip!==physical.port.ip||m.area!==0||m.routerId===d.ospf.routerId||network(p.ip,p.prefix)!==network(f.sip,p.prefix))notes.push('Reject: interface, neighbor identity, area, or local subnet is incompatible.');
      else if(m.message==='Hello'){
        if(m.hello!==d.ospf.hello||m.dead!==d.ospf.dead)notes.push('Reject Hello: Hello/dead intervals must match.');
        else{let nb=s.neighbors[p.id];if(!nb||nb.routerId!==m.routerId||nb.state==='Down')nb=s.neighbors[p.id]={routerId:m.routerId,ip:f.sip,localIp:p.ip,localPrefix:p.prefix,state:'Init',lastHello:n.clock,pending:{},requests:[],retryAt:n.clock+5};nb.lastHello=n.clock;nb.ip=f.sip;
          if(!m.neighbors.includes(d.ospf.routerId)){if(nb.state!=='Init'){nb.state='Init';nb.pending={};nb.requests=[];}schedule(n,d.id,'hello');notes.push('Init: Hello received; waiting for the neighbor to list our router ID.');}
          else if(nb.state==='Init'){nb.state='2-Way';schedule(n,d.id,'exchange',{port:p.id});notes.push('2-Way: both routers have seen each other. Begin database synchronization.');}
          else notes.push('Refresh the neighbor dead timer. Current state: '+nb.state+'.');
        }
      }else{const nb=s.neighbors[p.id];if(!nb||nb.routerId!==m.routerId||nb.state==='Down')notes.push('Discard: establish a bidirectional neighbor first.');
        else if(m.message==='Database Description'){
          if(nb.state==='Init'){notes.push('Wait for bidirectional Hellos.');}
          else{const previousRequests=nb.requests;nb.requests=m.headers.filter(h=>!s.database[h.routerId]||s.database[h.routerId].sequence<h.sequence).map(h=>h.routerId);nb.state=nb.requests.length?'Loading':'Full';nb.retryAt=n.clock+5;
            if(!m.reply)description(p.id,true);const newRequests=nb.requests.filter(id=>!previousRequests.includes(id));if(newRequests.length)sendOn(p.id,{message:'Link State Request',requests:newRequests});notes.push(nb.state+': compare LSA sequence numbers; request missing or newer advertisements.');}
        }else if(m.message==='Link State Request'){update(p.id,m.requests.map(id=>s.database[id]).filter(Boolean));notes.push('Send the requested advertisements.');}
        else if(m.message==='Link State Update'){
          const ack=[];for(const lsa of m.lsas){ack.push({routerId:lsa.routerId,sequence:lsa.sequence});const old=s.database[lsa.routerId];nb.requests=nb.requests.filter(id=>id!==lsa.routerId);if(lsa.routerId===d.ospf.routerId){if(lsa.sequence>s.serial){s.serial=lsa.sequence;s.signature='';}continue;}if(n.clock-lsa.born>=3600)continue;if(!old||lsa.sequence>old.sequence){s.database[lsa.routerId]=clone(lsa);schedule(n,d.id,'flood',{lsa,except:p.id});schedule(n,d.id,'spf');}nb.requests=nb.requests.filter(id=>id!==lsa.routerId);}
          sendOn(p.id,{message:'Link State Acknowledgment',headers:ack});if(nb.state==='Loading'&&!nb.requests.length)nb.state='Full';notes.push('Install newer LSAs, ignore older/duplicate versions, acknowledge receipt, and flood changes to other neighbors.');
        }else if(m.message==='Link State Acknowledgment'){for(const h of m.headers)if(nb.pending[h.routerId]?.sequence===h.sequence)delete nb.pending[h.routerId];notes.push('Acknowledged advertisements no longer need retransmission.');}
      }
    }else if(e.kind==='ospf-exchange'){const nb=s.neighbors[e.port];title='OSPF: start database exchange';if(nb&&nb.state==='2-Way'){nb.state='ExStart';notes.push('ExStart: establish database exchange. Packet negotiation is simplified in this teaching model.');schedule(n,d.id,'describe',{port:e.port});}}
    else if(e.kind==='ospf-describe'){const nb=s.neighbors[e.port];title='OSPF: exchange database descriptions';if(nb&&nb.state==='ExStart'){nb.state='Exchange';description(e.port);}notes.push('Exchange: describe known advertisements before requesting missing information.');}
    originate(n,d,s);
    const after=clone({neighbors:s.neighbors,routes:s.routes,database:s.database});
    const significant=x=>({neighbors:Object.fromEntries(Object.entries(x.neighbors).map(([p,v])=>[p,{routerId:v.routerId,state:v.state}])),routes:x.routes,database:x.database});
    return {...e,title,notes,outputs,outgoingFrames,before:{},after:{},ospfBefore:before,ospfAfter:after,ospf:true,ospfChanged:e.kind==='ospf-down'||JSON.stringify(significant(before))!==JSON.stringify(significant(after)),routingTable:n.routes(d.id,true),clock:n.clock};
  }
  function install(Network){
    const mutations=['configureInterface','configurePort','connect','remove','setStaticRoute','removeStaticRoute'];
    const P=Network.prototype,base={};for(const k of ['reset','load','routes','next',...mutations])base[k]=P[k];
    P.hasOspf=function(){return this.devices.some(d=>d.ospf?.enabled);};
    P.ospfOnlyWork=function(){return this.queue.every(e=>e.kind.startsWith('ospf-')||!!e.frame?.ospf);};
    P.reset=function(){if(this.ospfEditing)return;base.reset.call(this);this.ospfState={};};
    P.configureOspf=function(id,config){const d=this.device(id);if(!d)throw Error('Select a router.');validate(d,config,this.devices);if(d.ospf&&(d.ospf.hello!==config.hello||d.ospf.dead!==config.dead))for(const nb of Object.values(this.ospfState?.[id]?.neighbors||{})){nb.state='Down';nb.pending={};nb.requests=[];}d.ospf=clone(config);maintain(this);};
    P.ospfTopologyChanged=function(){this.queue=this.queue.filter(e=>this.device(e.device)&&(!e.from||this.device(e.from))&&(!e.link||this.links.some(l=>l.id===e.link&&l.enabled)));maintain(this);};
    P.advanceOspf=function(ticks=1){if(!Number.isInteger(ticks)||ticks<1||ticks>3600)throw Error('Advance 1–3600 simulation ticks.');if(this.queue.length)throw Error('Process queued events before advancing idle time.');this.clock+=ticks;maintain(this);};
    for(const k of mutations)P[k]=function(...args){if(!this.hasOspf())return base[k].apply(this,args);this.ospfEditing=true;try{const result=base[k].apply(this,args);if(k==='configureInterface'&&!args[2]&&this.device(args[0])?.ospf)this.device(args[0]).ospf.interfaces[args[1]].mode='off';return result;}finally{this.ospfEditing=false;this.ospfTopologyChanged();}};
    P.load=function(data){for(const d of data?.devices||[])if(d.ospf!==undefined)validate(d,d.ospf,data.devices);base.load.call(this,data);this.ospfState={};};
    P.routes=function(id,includeInactive=false){const rows=base.routes.call(this,id,includeInactive),d=this.device(id);if(!d?.ospf?.enabled)return rows;const learned=(this.ospfState?.[id]?.routes||[]).filter(r=>d.ports.some(p=>p.id===r.port&&p.enabled&&p.ip)&&!rows.some(c=>c.active&&c.network===r.network&&c.prefix===r.prefix));return [...rows,...learned].sort((a,b)=>b.prefix-a.prefix||({connected:0,static:1,ospf:2}[a.type]-{connected:0,static:1,ospf:2}[b.type]));};
    P.next=function(){
      if(this.hasOspf()){
        maintain(this);
        // Service timers before a distant application timeout, never jump past
        // Hellos and falsely expire healthy neighbors during ordinary traffic.
        const due=Math.min(...Object.values(this.ospfState).flatMap(s=>[s.nextHello,s.nextRefresh,...Object.values(s.neighbors).filter(nb=>nb.state!=='Down').map(nb=>nb.retryAt).filter(t=>t>this.clock)]));
        if(this.queue.length&&due>this.clock&&due<this.queue[0].time){this.clock=due;maintain(this);}
      }
      const e=this.queue[0];if(!e)return null;
      if(!e.kind.startsWith('ospf-')&&!e.frame?.ospf)return base.next.call(this);
      this.queue.shift();this.clock=e.time;const report=handle(this,e);this.history.push(report);return report;
    };
  }
  function example(Network,triangle=true){
    const n=new Network(),routers=Array.from({length:triangle?3:2},(_,i)=>{const r=n.add('router',triangle?[270,600,930][i]:[320,800][i],i===1&&triangle?390:220,triangle?3:2);r.name='Router '+String.fromCharCode(65+i);return r;});
    const hosts=routers.map((r,i)=>{const h=n.add('host',r.x,r.y-140);h.name='LAN '+String.fromCharCode(65+i)+' Host';n.configure(h.id,'192.168.'+(i+1)+'.10',24);n.configureGateway(h.id,'192.168.'+(i+1)+'.1');n.configureInterface(r.id,'p0','192.168.'+(i+1)+'.1',24);n.connect(h.id,'p0',r.id,'p0');return h;});
    for(const [a,pa,b,pb,sub]of (triangle?[[0,'p1',1,'p1',12],[1,'p2',2,'p1',23],[0,'p2',2,'p2',13]]:[[0,'p1',1,'p1',12]])){n.configureInterface(routers[a].id,pa,'10.0.'+sub+'.1',30);n.configureInterface(routers[b].id,pb,'10.0.'+sub+'.2',30);n.connect(routers[a].id,pa,routers[b].id,pb);}
    for(const r of routers){const c=defaults(r);c.enabled=true;for(const p of r.ports)c.interfaces[p.id].mode=p.id==='p0'?'passive':'active';n.configureOspf(r.id,c);}
    n.notes=[{id:'note1',title:triangle?'OSPF: three-router network':'OSPF: two-router network',text:'This is a working network. Wait for OSPF neighbors to become Full, then ping '+hosts.at(-1).ip+' from LAN A Host. Inspect each router?s learned routes, interface costs, neighbors, and link-state database. For troubleshooting, open Incidents and choose Dynamic routing.',x:430,y:530,width:460,height:220,color:'blue',tags:['ospf','routing'],target:routers[0].id}];
    return {network:n,clientId:hosts[0].id};
  }
  const api={install,defaults,validate,example};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NetworkExplorerOSPF=api;
})(typeof globalThis!=='undefined'?globalThis:this);
