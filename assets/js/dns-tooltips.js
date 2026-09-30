(() => {
  'use strict';
  const tip = document.createElement('div');
  tip.id = 'dns-tooltip';
  tip.className = 'dns-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);
  let owner = null, previousDescription = null;
  function hide() {
    if (owner) {
      if (previousDescription === null) owner.removeAttribute('aria-describedby');
      else owner.setAttribute('aria-describedby', previousDescription);
    }
    owner = null;
    tip.hidden = true;
  }
  function show(target) {
    hide();
    if (!target) return;
    owner = target;
    previousDescription = owner.getAttribute('aria-describedby');
    owner.setAttribute('aria-describedby', [previousDescription, tip.id].filter(Boolean).join(' '));
    tip.textContent = owner.dataset.tooltip;
    tip.hidden = false;
    const rect = owner.getBoundingClientRect(), box = tip.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(rect.left + (rect.width - box.width) / 2, innerWidth - box.width - 8)) + 'px';
    tip.style.top = Math.max(8, rect.bottom + box.height + 8 < innerHeight ? rect.bottom + 6 : rect.top - box.height - 6) + 'px';
  }
  document.addEventListener('pointerover', event => {
    const target = event.target.closest('[data-tooltip]');
    if (target !== owner) show(target);
  });
  document.addEventListener('pointerout', event => {
    if (owner && !owner.contains(event.relatedTarget)) hide();
  });
  document.addEventListener('focusin', event => show(event.target.closest('[data-tooltip]')));
  document.addEventListener('focusout', hide);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  document.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  new MutationObserver(() => { if (owner && !owner.isConnected) hide(); }).observe(document.body, { childList: true, subtree: true });
})();
