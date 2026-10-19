// One black tooltip for static controls and dynamically rendered header/bit cells.
(() => {
  const tooltip = document.createElement('div');
  tooltip.id = 'checksum-tooltip';
  tooltip.className = 'checksum-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.appendChild(tooltip);
  let active = null, dismissTimer = null;
  function hide() {
    clearTimeout(dismissTimer);
    if (active) {
      const ids = (active.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== tooltip.id);
      if (ids.length) active.setAttribute('aria-describedby', ids.join(' '));
      else active.removeAttribute('aria-describedby');
    }
    active = null;
    tooltip.hidden = true;
  }
  function show(target) {
    if (!target || !target.dataset.tooltip) return;
    hide();
    active = target;
    tooltip.textContent = target.dataset.tooltip;
    const ids = (target.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    target.setAttribute('aria-describedby', [...ids, tooltip.id].join(' '));
    tooltip.hidden = false;
    const anchor = target.getBoundingClientRect(), box = tooltip.getBoundingClientRect();
    const left = Math.max(8, Math.min(innerWidth - box.width - 8, anchor.left + (anchor.width - box.width) / 2));
    const above = anchor.top - box.height - 9;
    const top = above >= 8 ? above : Math.max(8, Math.min(innerHeight - box.height - 8, anchor.bottom + 9));
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }
  const trigger = target => target instanceof Element ? target.closest('[data-tooltip]') : null;
  document.addEventListener('pointerover', event => {
    if (tooltip.contains(event.target)) { clearTimeout(dismissTimer); return; }
    const target = trigger(event.target);
    if (target && target !== active) show(target);
    else if (target) clearTimeout(dismissTimer);
  });
  document.addEventListener('pointerout', event => {
    if (!active || active.contains(event.relatedTarget) || tooltip.contains(event.relatedTarget)) return;
    if (active.contains(event.target) || tooltip.contains(event.target)) dismissTimer = setTimeout(hide, 120);
  });
  document.addEventListener('focusin', event => show(trigger(event.target)));
  document.addEventListener('focusout', event => { if (event.target === active) hide(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  document.addEventListener('click', hide);
  document.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  new MutationObserver(() => { if (active && !active.isConnected) hide(); }).observe(document.body, {childList:true, subtree:true});
})();
