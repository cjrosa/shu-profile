(function (root) {
  'use strict';
  class Layout {
    constructor(keys) {
      this.serial = 0;
      this.groups = [this.group(keys)];
    }
    group(tabs) { return {id: 'dock-group-' + ++this.serial, tabs: [...tabs], active: tabs[0], weight: 1}; }
    owner(key) { return this.groups.find(g => g.tabs.includes(key)); }
    activate(key) { const group = this.owner(key); if (group) group.active = key; }
    move(key, targetId, placement = 'join', before = null) {
      const source = this.owner(key), target = this.groups.find(g => g.id === targetId);
      if (!source || !target || !['join', 'left', 'right'].includes(placement)) return;
      if (source === target && (before === key || (placement !== 'join' && source.tabs.length === 1))) return;
      source.tabs.splice(source.tabs.indexOf(key), 1);
      if (source.active === key) source.active = source.tabs[0];
      if (placement === 'join') {
        const index = target.tabs.indexOf(before);
        target.tabs.splice(index < 0 ? target.tabs.length : index, 0, key);
        target.active = key;
      } else {
        const next = this.group([key]);
        next.weight = target.weight / 2;
        target.weight /= 2;
        this.groups.splice(this.groups.indexOf(target) + (placement === 'right' ? 1 : 0), 0, next);
      }
      this.groups = this.groups.filter(g => g.tabs.length);
    }
    separate() { this.groups = this.groups.flatMap(g => g.tabs.map(key => this.group([key]))); }
    combine(active) { this.groups = [this.group(this.groups.flatMap(g => g.tabs))]; this.activate(active); }
  }

  function mount({overlay, body, tabs, panels, layout, controls, isExternal, isMinimized, open, refresh}) {
    const columns = new Map(), shells = new Map();
    for (const [key, tab] of Object.entries(tabs)) shells.set(key, tab.closest('[data-pane]'));
    const hint = document.createElement('div');
    hint.className = 'dock-drop-hint'; hint.hidden = true; overlay.append(hint);
    const preview = document.createElement('div');
    preview.className = 'dock-drag-preview'; preview.hidden = true;
    preview.setAttribute('aria-hidden', 'true'); document.body.append(preview);
    let dragging = null, suppressClick = false;
    function render() {
      const scroll = new Map(Object.entries(panels).map(([key, panel]) => [key, panel.scrollTop]));
      for (const group of layout.groups) {
        let column = columns.get(group.id);
        if (!column) {
          column = document.createElement('div');
          column.className = 'dock-column'; column.dataset.dockGroup = group.id;
          column.innerHTML = '<div class="dock-header dock-column-header"><div role="tablist" aria-label="Tool group"></div></div><div class="dock-group-content"></div><div class="dock-column-divider" role="separator" aria-orientation="vertical" aria-label="Resize tool groups" tabindex="0"></div>';
          columns.set(group.id, column);
          installDivider(column, group.id);
        }
        const index = layout.groups.indexOf(group);
        if (body.children[index] !== column) body.insertBefore(column, body.children[index] || null);
        const bar = column.querySelector('[role=tablist]'), content = column.querySelector('.dock-group-content');
        const selected = isExternal(group.active) ? group.tabs.find(k => !isExternal(k)) : group.active;
        group.tabs.forEach((key, i) => {
          const shell = shells.get(key), panel = panels[key], tab = tabs[key];
          if (bar.children[i] !== shell) bar.insertBefore(shell, bar.children[i] || null);
          if (panel.parentElement !== content) content.append(panel);
          panel.hidden = isMinimized() || key !== selected || isExternal(key);
          panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id);
          tab.setAttribute('aria-selected', String(key === selected));
          tab.tabIndex = key === selected ? 0 : -1;
          tab.disabled = isExternal(key);
          panel.scrollTop = scroll.get(key);
        });
        column.querySelector('.dock-column-divider').hidden = index === layout.groups.length - 1;
      }
      const lastHeader = columns.get(layout.groups.at(-1).id).querySelector('.dock-column-header');
      if (controls.parentElement !== lastHeader) lastHeader.append(controls);
      for (const [id, column] of columns) if (!layout.groups.some(g => g.id === id)) { column.remove(); columns.delete(id); }
      const totalWeight = layout.groups.reduce((sum, g) => sum + g.weight, 0);
      body.style.gridTemplateColumns = layout.groups.map(g => 'minmax(220px, ' + (g.weight / totalWeight * layout.groups.length) + 'fr)').join(' ');
    }
    function installDivider(column, id) {
      const divider = column.querySelector('.dock-column-divider');
      let resizing = null;
      function resize(delta) {
        const {left, right, width, leftWidth, total} = resizing;
        const share = Math.max(0.15, Math.min(0.85, (leftWidth + delta) / width));
        left.weight = total * share; right.weight = total * (1 - share); render();
      }
      function begin() {
        const i = layout.groups.findIndex(g => g.id === id), left = layout.groups[i], right = layout.groups[i + 1];
        if (!right) return false;
        const leftWidth = column.getBoundingClientRect().width;
        resizing = {left, right, leftWidth, width: leftWidth + columns.get(right.id).getBoundingClientRect().width, total: left.weight + right.weight};
        return true;
      }
      divider.onpointerdown = e => { if (e.button === 0 && begin()) { e.preventDefault(); resizing.x = e.clientX; divider.setPointerCapture(e.pointerId); } };
      divider.onpointermove = e => { if (resizing) resize(e.clientX - resizing.x); };
      divider.onpointerup = divider.onpointercancel = divider.onlostpointercapture = () => { resizing = null; };
      divider.onkeydown = e => {
        if (['ArrowLeft', 'ArrowRight'].includes(e.key) && begin()) { e.preventDefault(); resize(e.key === 'ArrowLeft' ? -25 : 25); resizing = null; }
      };
    }
    function clear() {
      dragging = null; hint.hidden = true; preview.hidden = true; preview.replaceChildren(); overlay.classList.remove('dragging-tab');
      overlay.querySelectorAll('.dock-drop-before,.dock-drop-after').forEach(el => el.classList.remove('dock-drop-before', 'dock-drop-after'));
    }
    function showHint(rect, text) {
      const base = overlay.getBoundingClientRect();
      hint.textContent = text; hint.hidden = false;
      Object.assign(hint.style, {left: rect.left - base.left + 'px', top: rect.top - base.top + 'px', width: rect.width + 'px', height: rect.height + 'px'});
    }
    overlay.addEventListener('click', e => {
      if (suppressClick) { e.preventDefault(); e.stopImmediatePropagation(); suppressClick = false; }
    }, true);
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape' && dragging) { e.preventDefault(); e.stopImmediatePropagation(); clear(); }
    }, true);
    for (const [key, tab] of Object.entries(tabs)) {
      tab.removeAttribute('title');
      tab.onkeydown = e => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const group = layout.owner(key), keys = group.tabs.filter(k => !isExternal(k)), index = keys.indexOf(key);
        if (e.altKey && ['ArrowLeft', 'ArrowRight'].includes(e.key)) {
          if (e.shiftKey) layout.move(key, group.id, e.key === 'ArrowLeft' ? 'left' : 'right');
          else {
            const i = group.tabs.indexOf(key), j = i + (e.key === 'ArrowLeft' ? -1 : 1);
            if (j >= 0 && j < group.tabs.length) [group.tabs[i], group.tabs[j]] = [group.tabs[j], group.tabs[i]];
          }
          refresh(); tab.focus(); return;
        }
        const next = e.key === 'Home' ? keys[0] : e.key === 'End' ? keys.at(-1) : keys[(index + (e.key === 'ArrowLeft' ? keys.length - 1 : 1)) % keys.length];
        if (next) { open(next); tabs[next].focus(); }
      };
      tab.onpointerdown = e => {
        if (e.button !== 0 || tab.disabled) return;
        dragging = {key, x: e.clientX, y: e.clientY, started: false};
        tab.setPointerCapture(e.pointerId);
      };
      tab.onpointermove = e => {
        if (!dragging || dragging.key !== key) return;
        if (!dragging.started && Math.hypot(e.clientX - dragging.x, e.clientY - dragging.y) < 6) return;
        if (!dragging.started) {
          preview.replaceChildren(...[...tab.childNodes].map(node => node.cloneNode(true)));
          preview.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
          preview.hidden = false;
        }
        preview.style.left = Math.max(4, Math.min(e.clientX + 16, window.innerWidth - preview.offsetWidth - 4)) + 'px';
        preview.style.top = Math.max(4, Math.min(e.clientY + 18, window.innerHeight - preview.offsetHeight - 4)) + 'px';
        dragging.started = true; dragging.target = null;
        overlay.classList.add('dragging-tab'); hint.hidden = true;
        overlay.querySelectorAll('.dock-drop-before,.dock-drop-after').forEach(el => el.classList.remove('dock-drop-before', 'dock-drop-after'));
        for (const group of layout.groups) {
          const column = columns.get(group.id), rect = column.getBoundingClientRect();
          if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) continue;
          const bar = column.querySelector('[role=tablist]'), barRect = bar.getBoundingClientRect();
          if (e.clientY <= barRect.bottom) {
            const others = [...bar.children].filter(el => el.dataset.pane !== key);
            const before = others.find(el => e.clientX < el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2);
            dragging.target = {id: group.id, placement: 'join', before: before?.dataset.pane};
            (before || others.at(-1))?.classList.add(before ? 'dock-drop-before' : 'dock-drop-after');
            showHint({left: rect.left, top: barRect.bottom, width: rect.width, height: Math.min(40, rect.height)}, 'Join this tab group');
          } else {
            const ratio = (e.clientX - rect.left) / rect.width;
            const placement = ratio < 0.25 ? 'left' : ratio > 0.75 ? 'right' : 'join';
            // A lone tab cannot split itself into an empty group.
            if (placement !== 'join' && group.tabs.length === 1 && group.tabs[0] === key) return;
            dragging.target = {id: group.id, placement};
            showHint({left: rect.left + (placement === 'right' ? rect.width / 2 : 0), top: barRect.bottom, width: placement === 'join' ? rect.width : rect.width / 2, height: rect.bottom - barRect.bottom}, placement === 'join' ? 'Join this tab group' : 'New group on ' + placement);
          }
          break;
        }
      };
      tab.onpointerup = e => {
        if (!dragging || dragging.key !== key) return;
        const {target, started} = dragging; clear();
        if (tab.hasPointerCapture(e.pointerId)) tab.releasePointerCapture(e.pointerId);
        if (!started) return;
        suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
        if (target) { layout.move(key, target.id, target.placement, target.before); open(key); }
        tab.focus({preventScroll: true});
      };
      tab.onpointercancel = tab.onlostpointercapture = clear;
    }
    return {render};
  }
  const api = {Layout, mount};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NetworkExplorerDock = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
