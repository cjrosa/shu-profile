/* Uses the existing Inspector controls, switch, tables and disclosure styling. */
(function(root){
  'use strict';
  const selectedTabs = new Map();
  function panel(n,d,esc){
    if(d.type!=='router'||d.firewallMode==='transparent')return '';
    const c=d.ospf||NetworkExplorerOSPF.defaults(d),s=n.ospfState?.[d.id];
    return '<section class="nat-panel ospf-panel"><div class="small-heading inspector-section-heading"><span>OSPF · area 0</span><label class="examine-watch-control"><input id="ospf-enabled" type="checkbox" role="switch" aria-label="Enable OSPF" '+(c.enabled?'checked':'')+'><span class="watch-switch-track" aria-hidden="true"></span><span>Enabled</span></label></div><p class="hint">Configure participation and cost in the port settings.</p><label>Router ID<input id="ospf-router-id" value="'+esc(c.routerId)+'" aria-label="OSPF router ID"></label><details><summary>Advanced timers</summary><p class="hint">Simulation ticks; both neighbors must agree. Pause freezes OSPF time.</p><label>Hello interval<input id="ospf-hello" type="number" min="1" max="60" value="'+c.hello+'"></label><label>Dead interval<input id="ospf-dead" type="number" min="2" max="240" value="'+c.dead+'"></label></details><p id="ospf-error" class="hint" role="alert" hidden></p>'+(s?.warnings||[]).map(w=>'<p class="hint">'+esc(w)+'</p>').join('')+views(n,d,s,esc)+'<p class="hint">Single-area OSPFv2 teaching model. Direct router links only; no DR/BDR, multiple areas, redistribution or ECMP.</p></section>';
  }
  function views(n,d,s,esc){
    const active=selectedTabs.get(d.id)||'neighbors', neighbors=Object.entries(s?.neighbors||{}), database=Object.values(s?.database||{});
    const tabIcon=key=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+(key==='neighbors'?'M8 7H5a3 3 0 0 0-3 3v4a3 3 0 0 0 3 3h3M16 7h3a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-3M7 12h10':'M9 5h12M9 12h12M9 19h12M2 5l1 1 3-3M2 12l1 1 3-3M2 19l1 1 3-3')+'"/></svg>';
    const tabs=[['neighbors','OSPF neighbors',neighbors.length],['database','LS DB',database.length]];
    const table=(title,rows)=>'<table class="route-table ospf-lsa-table"><thead><tr><th>'+title+'</th><th>Cost</th></tr></thead><tbody>'+rows.map(([address,cost])=>'<tr><td><code>'+esc(address)+'</code></td><td>'+esc(cost)+'</td></tr>').join('')+'</tbody></table>';
    return '<div class="security-monitor-tabs dock-header ospf-tabs" role="tablist" aria-label="OSPF information">'+tabs.map(([key,label,count])=>'<span class="dock-tab-shell"><button type="button" id="ospf-tab-'+key+'" role="tab" data-ospf-tab="'+key+'" aria-selected="'+(key===active)+'" tabindex="'+(key===active?'0':'-1')+'" aria-controls="ospf-view-'+key+'">'+tabIcon(key)+'<span>'+label+' ('+count+')</span></button></span>').join('')+'</div><div id="ospf-view-neighbors" class="security-tab-panel" role="tabpanel" aria-labelledby="ospf-tab-neighbors" '+(active!=='neighbors'?'hidden':'')+'><div class="route-table-wrap"><table class="route-table"><thead><tr><th>Router ID</th><th>Interface</th><th>State</th></tr></thead><tbody>'+neighbors.map(([port,nb])=>'<tr><td>'+esc(nb.routerId)+'</td><td>'+esc(d.ports.find(p=>p.id===port)?.name||port)+'</td><td>'+esc(nb.state)+'</td></tr>').join('')+'</tbody></table></div>'+(!neighbors.length?'<p class="hint">No neighbors learned yet.</p>':'')+'</div><div id="ospf-view-database" class="security-tab-panel" role="tabpanel" aria-labelledby="ospf-tab-database" '+(active!=='database'?'hidden':'')+'>'+database.map(l=>'<article class="ospf-lsa"><div class="ospf-lsa-heading"><strong>Router <code>'+esc(l.routerId)+'</code></strong></div><div class="ospf-lsa-meta"><span>Sequence '+esc(l.sequence)+'</span><span>Age '+Math.max(0,n.clock-l.born)+' ticks</span></div>'+ (l.links.length?table('Neighbor router',l.links.map(x=>[x.routerId,x.cost])):'<p class="hint">No router links advertised.</p>')+table('Advertised network',l.prefixes.map(x=>[x.network+'/'+x.prefix,x.cost]))+'</article>').join('')+(!database.length?'<p class="hint">No advertisements learned yet.</p>':'')+'</div>';
  }
  function bind(n,d,{change,styleSelect,getNetwork}){
    if(d.type!=='router'||d.firewallMode==='transparent')return;
    const el=id=>document.getElementById(id);
    const tabs=[...document.querySelectorAll('[data-ospf-tab]')];
    function activate(tab){
      selectedTabs.set(d.id,tab.dataset.ospfTab);
      for(const button of tabs){const on=button===tab;button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;el(button.getAttribute('aria-controls')).hidden=!on;}
    }
    tabs.forEach((tab,index)=>{tab.onclick=()=>activate(tab);tab.onkeydown=e=>{let next;if(e.key==='ArrowRight'||e.key==='ArrowLeft')next=tabs[(index+1)%tabs.length];else if(e.key==='Home')next=tabs[0];else if(e.key==='End')next=tabs[tabs.length-1];if(next){e.preventDefault();activate(next);next.focus();}};});

    function apply(){const c={enabled:el('ospf-enabled').checked,routerId:el('ospf-router-id').value.trim(),area:0,hello:Number(el('ospf-hello').value),dead:Number(el('ospf-dead').value),interfaces:(getNetwork().device(d.id).ospf||NetworkExplorerOSPF.defaults(d)).interfaces};try{const current=getNetwork();NetworkExplorerOSPF.validate(current.device(d.id),c,current.devices);change(()=>current.configureOspf(d.id,c));}catch(e){el('ospf-error').hidden=false;el('ospf-error').textContent=e.message;}}
    for(const id of ['ospf-enabled','ospf-router-id','ospf-hello','ospf-dead'])el(id).onchange=apply;
  }
  function portPanel(d,p,esc){
    if(!d.ospf?.enabled)return '';
    const c=d.ospf.interfaces[p.id];
    return '<section class="ospf-port"><div class="small-heading inspector-section-heading">OSPF</div><label>Participation<select id="port-ospf-mode">'+['off','passive','active'].map(mode=>'<option value="'+mode+'" '+(c.mode===mode?'selected':'')+'>'+mode[0].toUpperCase()+mode.slice(1)+'</option>').join('')+'</select></label><div id="port-ospf-settings" '+(c.mode==='off'?'hidden':'')+'><label>Cost<input id="port-ospf-cost" type="number" min="1" max="65535" value="'+c.cost+'"></label><p class="hint">Active discovers a directly connected router. Passive advertises this network without sending Hellos.</p></div><p id="port-ospf-error" class="hint" role="alert" hidden></p></section>';
  }
  function snapshot(r,esc){if(!r.ospfAfter)return '';const routes=x=>x.routes.map(v=>v.network+'/'+v.prefix+' via '+v.nextHop+' (cost '+v.cost+')').join('\n')||'No OSPF routes';return '<h3>OSPF state at this event</h3><p>'+esc(Object.values(r.ospfAfter.neighbors).map(v=>v.routerId+': '+v.state).join('; ')||'No neighbors')+'</p><h4>Routes before</h4><pre>'+esc(routes(r.ospfBefore))+'</pre><h4>Routes after</h4><pre>'+esc(routes(r.ospfAfter))+'</pre>';}
  root.NetworkExplorerOSPFUI={panel,bind,portPanel,snapshot};
})(typeof globalThis!=='undefined'?globalThis:this);
