(function () {
  'use strict';
  const path = 'network_explorer_manual.html';
  const icon = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5C8 2 4 3 2 4v15c3-1 6-1 10 2 4-3 7-3 10-2V4c-2-1-6-2-10 1Zm0 0v16M5 7l4 1m-4 3 4 1m6-4 4-1m-4 5 4-1"/></svg>';
  function link(className) {
    const a = document.createElement('a');
    a.href = path; a.target = '_blank'; a.rel = 'noopener';
    a.className = className;
    a.setAttribute('aria-label', 'User Manual (opens in a new tab)');
    a.title = 'User Manual (opens in a new tab)';
    a.innerHTML = icon + '<span>User Manual</span>';
    return a;
  }
  document.querySelector('.welcome-start').append(link('network-manual-link'));
  const help = document.getElementById('open-help');
  help.remove();
  document.querySelector('body > header').append(link('network-manual-link header-manual-link'));
  document.getElementById('help-window').remove();
})();
