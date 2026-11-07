(() => {
  'use strict';
  document.querySelectorAll('.history-tabs').forEach(list => {
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    function select(tab, focus = false) {
      tabs.forEach(item => {
        const active = item === tab;
        item.setAttribute('aria-selected', String(active));
        item.tabIndex = active ? 0 : -1;
        const panel = document.getElementById(item.getAttribute('aria-controls'));
        panel.hidden = !active;
        if (active) panel.dispatchEvent(new Event('history-panel-shown'));
      });
      document.querySelector('.view-tabs').hidden = document.getElementById('message-panel').hidden;
      if (focus) tab.focus();
      ['exchange-body', 'log-body'].forEach(id => {
        const body = document.getElementById(id);
        if (body.clientHeight) body.scrollTop = body.scrollHeight;
      });
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else return;
        event.preventDefault();
        select(tabs[next], true);
      });
    });
  });
})();
