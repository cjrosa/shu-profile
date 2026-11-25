(function(root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const glyph = path => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>';
  const addressProse = value => esc(value).replace(/\b(?:(?:[0-9a-f]{2}:){5}[0-9a-f]{2}|(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?)\b/gi, address=>'<span class="mono">'+address+'</span>');
  const icons = {completed:'m5 12 4 4L19 6', stopped:'M6 6l12 12M6 18 18 6', running:'M12 4v8l5 3M21 12a9 9 0 1 1-9-9', replay:'M4 9V3m0 6h6M4 9a8 8 0 1 1 0 7', run:'m8 5 11 7-11 7Z', locate:'M12 2v4m0 12v4M2 12h4m12 0h4M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0', packets:'M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4', clear:'m4 14 9-10 7 7-9 10H7l-3-3Zm5-5 7 7M11 21h10'};
  function mount(panel, api) {
    let chosen = null;
    const expanded = new Set();
    panel.innerHTML = '<div class="operation-toolbar"><p class="hint">Operations and their recorded outcomes · this session</p><button id="operations-clear" class="vlan-icon-button" title="Clear completed operation history" aria-label="Clear completed operation history">'+glyph(icons.clear)+'</button></div><div class="operation-list"></div>';
    const list = panel.querySelector('.operation-list');
    let replayDetail = 'key';
    const button = (entry, action, label, icon, disabled=false, index='') => '<button type="button" id="'+entry.id+'-'+action+(index!==''?'-'+index:'')+'" data-operation="'+entry.id+'" data-operation-action="'+action+'" data-index="'+index+'" '+(disabled?'disabled':'')+'>'+glyph(icons[icon])+'<span>'+label+'</span></button>';
    function replayControl(entry, disabled) {
      const mode = replayDetail === 'all' ? 'Every event' : 'Key steps';
      return '<span class="operation-replay-control">'+button(entry,'replay','Replay','replay',disabled)+'<button type="button" class="operation-replay-choice" id="'+entry.id+'-replay-detail" data-replay-menu="'+entry.id+'-replay-menu" aria-label="Replay options: '+mode+'" aria-haspopup="menu" aria-expanded="false" '+(disabled?'disabled':'')+'>'+glyph('m7 10 5 5 5-5')+'</button><div class="operation-replay-menu" id="'+entry.id+'-replay-menu" popover="auto" role="menu" aria-label="Replay detail">'+[['key','Key steps'],['all','Every event']].map(([value,label])=>'<button type="button" id="'+entry.id+'-mode-'+value+'" data-operation="'+entry.id+'" data-operation-action="replay-mode" data-mode="'+value+'" role="menuitemradio" aria-checked="'+(replayDetail===value)+'">'+glyph(icons.completed)+'<span>'+label+'</span></button>').join('')+'</div></span>';
    }
    bindReplayMenus(panel);
    function refresh() {
      if (!api.entries().length) { chosen = null; expanded.clear(); }
      const top = list.scrollTop, focus = document.activeElement?.id;
      const html = api.entries().map(entry => {
        const prose = value => addressProse(value).replace(/\bVLAN (\d+)\b/g, (label, id) => {
          const vlan = entry.topology.devices.flatMap(d => d.vlans || []).find(v => Number(v.id) === Number(id));
          const color = /^#[0-9a-f]{3,8}$/i.test(vlan?.color || '') ? vlan.color : '#61758a';
          return '<span class="operation-vlan" tabindex="0" data-operation="'+entry.id+'" data-operation-vlan="'+id+'" title="'+esc(vlan?.name || label)+'"><i aria-hidden="true" style="background:'+color+'"></i>'+label+'</span>';
        });
        const reference = r => {
          const device = entry.topology.devices.find(d => d.id === r.device);
          const name = device?.name || r.device;
          const deviceIcon = device && root.NetworkExplorerIcons?.device
            ? '<svg class="operation-device-icon" viewBox="-42 -35 84 72" aria-hidden="true">'+root.NetworkExplorerIcons.device(device)+'</svg>'
            : glyph(icons.locate);
          return '<button type="button" class="note-mention-link" id="'+entry.id+'-locate-'+r.order+'" data-operation="'+entry.id+'" data-operation-action="locate" data-index="'+r.order+'" title="Locate '+esc(name)+'" aria-label="Locate '+esc(name)+'"><span class="mention-glyph">'+deviceIcon+'</span><span>'+esc(name)+'</span></button>';
        };
        const locked = api.restricted(entry), open = chosen === entry.id, replay = api.replayState(entry);
        const result = locked ? entry.status === 'completed' ? 'Operation completed.' : entry.status === 'running' ? 'Operation in progress.' : 'Operation did not complete. Use Incident hints to investigate.' : entry.result;
        const groups = root.NetworkExplorerOperations.stages(entry);
        return '<article class="operation-entry"><div class="operation-heading"><button type="button" id="'+entry.id+'-select" class="operation-summary" data-operation="'+entry.id+'" data-operation-action="select" aria-expanded="'+open+'"><span class="operation-state '+entry.status+'" title="'+entry.status+'">'+glyph(icons[entry.status])+'</span><span><strong>'+esc(entry.label)+' <span class="mono">'+esc(entry.method === 'acquireDhcp' ? '' : entry.args[1])+'</span></strong><span class="operation-result">'+esc(entry.source)+' · '+prose(result)+'</span></span></button><time>'+new Date(entry.started).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})+'</time>'+(open?'<div class="operation-actions">'+replayControl(entry,locked || entry.status==='running' || !entry.reports.length || !api.canReplay())+button(entry,'run','Run again','run',!api.canRun(entry))+button(entry,'packets','Show packets','packets',locked || !entry.reports.length || !api.canReplay())+'</div>':'')+'</div>'+(open?'<div class="operation-detail">'+(entry.truncated?'<p class="hint">Recording limit reached. Replay contains the first '+entry.reports.length+' events.</p>':'')+(locked?'<p class="hint">Detailed narration and replay unlock after the final hint, fault reveal, or verified repair.</p><button id="'+entry.id+'-hints" data-operation="'+entry.id+'" data-operation-action="hints">Open Incident hints</button>':(replay?'<p class="operation-current" role="status">'+prose(replay)+'</p>':'')+groups.map((g,i)=>'<details data-operation-stage="'+entry.id+':'+i+'" '+(expanded.has(entry.id+':'+i)?'open':'')+'><summary>'+esc(g.name)+'<span class="operation-stage-summary">'+prose(g.summary)+'</span> <span class="hint">'+g.reports.length+' events · '+g.devices.length+' devices</span></summary><ol>'+g.reports.map(r=>'<li><strong>'+reference(r)+' '+prose(r.title)+'</strong><p>'+prose((r.notes||[]).join(' '))+'</p></li>').join('')+'</ol></details>').join(''))+'</div>':'')+'</article>';
      }).join('') || '<div class="operation-empty">'+glyph(icons.replay)+'<p>No operations yet.</p><p class="hint">Run a ping, traceroute, DNS lookup, DHCP request, web request, or Nmap scan to record its story.</p></div>';
      if (list.innerHTML !== html) { list.innerHTML = html; list.scrollTop = top; if (focus) panel.querySelector('[id="'+focus+'"]')?.focus({preventScroll:true}); }
      panel.querySelector('#operations-clear').disabled = !!api.replaying();
    }
    panel.addEventListener('toggle', e => { const key=e.target.dataset?.operationStage; if(key) { if(e.target.open)expanded.add(key);else expanded.delete(key); } }, true);
    panel.addEventListener('click', e => {
      if(e.target.closest('#operations-clear')) { if(confirm('Clear completed operation history? Running operations remain.')) { api.clear(); chosen=null; refresh(); } return; }
      const b=e.target.closest('[data-operation-action]'); if(!b)return;
      const entry=api.entries().find(row=>row.id===b.dataset.operation); if(!entry)return;
      const action=b.dataset.operationAction;
      if(action==='replay-mode') { replayDetail=b.dataset.mode; api.detail(replayDetail); }
      else if(action==='select') chosen=chosen===entry.id?null:entry.id;
      else if(action==='replay')api.replay(entry);
      else if(action==='run')api.run(entry);
      else if(action==='packets')api.packets(entry);
      else if(action==='hints')api.hints();
      else if(action==='locate')api.locate(entry,entry.reports.find(r=>r.order===Number(b.dataset.index)));
      refresh(); api.changed?.();
    });
    refresh(); return refresh;
  }
  function bindReplayMenus(host) {
    host.addEventListener('click', e => {
      const toggle=e.target.closest('[data-replay-menu]');
      if(toggle) {
        e.preventDefault(); e.stopImmediatePropagation();
        const menu=host.querySelector('[id="'+toggle.dataset.replayMenu+'"]');
        if(menu.matches(':popover-open')) { menu.hidePopover(); toggle.setAttribute('aria-expanded','false'); return; }
        menu.showPopover();
        const rect=toggle.getBoundingClientRect(), win=host.ownerDocument.defaultView;
        menu.style.left=Math.max(4,Math.min(rect.right-menu.offsetWidth,win.innerWidth-menu.offsetWidth-4))+'px';
        menu.style.top=(rect.bottom+menu.offsetHeight+4>win.innerHeight?Math.max(4,rect.top-menu.offsetHeight-4):rect.bottom+4)+'px';
        toggle.setAttribute('aria-expanded','true');
        menu.querySelector('[aria-checked="true"]')?.focus();
      } else {
        const menu=e.target.closest('.operation-replay-menu');
        if(menu?.matches(':popover-open')) { menu.hidePopover(); host.querySelector('[data-replay-menu="'+menu.id+'"]')?.focus(); }
      }
    });
    host.addEventListener('toggle', e => {
      if(e.target.matches('.operation-replay-menu')) host.querySelector('[data-replay-menu="'+e.target.id+'"]')?.setAttribute('aria-expanded',String(e.newState==='open'));
    },true);
    host.addEventListener('keydown', e => {
      const menu=e.target.closest('.operation-replay-menu'); if(!menu)return;
      if(e.key==='Escape'||e.key==='Tab') { menu.hidePopover(); if(e.key==='Escape'){e.preventDefault();host.querySelector('[data-replay-menu="'+menu.id+'"]')?.focus();} return; }
      if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
      e.preventDefault();const options=[...menu.querySelectorAll('button')],index=options.indexOf(e.target);
      options[e.key==='Home'?0:e.key==='End'?options.length-1:(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length].focus();
    });
  }
  root.NetworkExplorerOperationsUI = {mount,bindReplayMenus};
})(globalThis);
