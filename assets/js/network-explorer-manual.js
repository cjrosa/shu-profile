(function () {
  'use strict';
  const chapters = [...document.querySelectorAll('main > section')];
  const toc = document.getElementById('toc');
  chapters.forEach((section, i) => {
    const link = document.createElement('a');
    link.href = '#' + section.id;
    link.textContent = String(i + 1).padStart(2, '0') + '  ' + section.dataset.title;
    toc.append(link);
  });
  const search = document.getElementById('manual-search');
  function filter() {
    const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let count = 0;
    chapters.forEach((section, i) => {
      const match = terms.every(term => section.textContent.toLowerCase().includes(term));
      section.hidden = !match;
      toc.children[i].hidden = !match;
      if (match) count++;
    });
    document.getElementById('search-count').textContent = terms.length ? count + ' matching chapters' : '';
    document.getElementById('no-results').hidden = count !== 0;
  }
  search.addEventListener('input', filter);
  function followHash() {
    const target = document.getElementById(location.hash.slice(1));
    if (target?.hidden) { search.value = ''; filter(); target.scrollIntoView(); }
    [...toc.children].forEach(link => {
      if (link.hash === location.hash) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  window.addEventListener('hashchange', followHash);
  document.getElementById('print').onclick = () => window.print();
  const host = '<rect x="-30" y="-24" width="60" height="40" rx="4" fill="#edf4fa"/><path d="M0 16v12m-17 0h34"/><path d="M-23-17h46V8h-46z" fill="#c3dce9" stroke="none"/>';
  const sw = '<rect x="-37" y="-17" width="74" height="34" rx="5" fill="#e6f2ef"/><path d="M-27-5h10v10h-10zm15 0h10v10h-10zm15 0h10v10H3zm15 0h10v10H18z" fill="#7aaca9"/>';
  const router = '<path d="M-36-8v22c0 20 72 20 72 0V-8" fill="#b4cada"/><ellipse cy="-8" rx="36" ry="17" fill="#edf4fa"/><path d="M-26-8h18m-5-5 5 5-5 5M26-8H8m5-5-5 5 5 5M0-9v-13m-5 5 5-5 5 5M0-5V6m-5-5 5 5 5-5"/>';
  const glyphs = {host, switch:sw, router, firewall: window.NetworkExplorerFirewallIcon()};
  const device = (type,x,y,label) => `<g transform="translate(${x} ${y})" fill="none" stroke="${type==='switch'?'#4e8080':'#3b5278'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyphs[type]}</g><text x="${x}" y="${y+57}" text-anchor="middle">${label}</text>`;
  const wire = '<path d="M110 100H590" fill="none" stroke="#89a9b8" stroke-width="3"/>';
  const tag = (x,y,label) => `<rect x="${x}" y="${y}" width="180" height="36" rx="8" fill="#e6f2ef"/><text x="${x+90}" y="${y+24}" text-anchor="middle">${label}</text>`;
  const scene = (label, body, height=230) => `<svg viewBox="0 0 700 ${height}" role="img" aria-label="${label}">${body}</svg>`;
  const arts = {
    journey:scene('Host A to switch to Host B: ARP discovers, the switch learns, ICMP tests delivery',wire+device('host',110,100,'Host A')+device('switch',350,100,'Switch')+device('host',590,100,'Host B')+tag(20,180,'1 · ARP')+tag(260,180,'2 · MAC learning')+tag(500,180,'3 · ICMP Echo')),
    workspace:scene('Workspace: palette left, canvas center, inspector right, tools below', '<rect x="2" y="2" width="696" height="326" rx="10" fill="#f2f7f8" stroke="#bbced7"/><rect x="12" y="12" width="676" height="36" rx="5" fill="#e4eeef"/><text x="26" y="36">Home · Save · Undo · Subnets · Animation · Search</text><rect x="12" y="58" width="116" height="196" rx="5" fill="#e6f2ef"/><text x="24" y="85">1 · Palette</text><text x="24" y="116">Devices</text><text x="24" y="143">Applications</text><text x="24" y="170">Notes</text><rect x="540" y="58" width="148" height="196" rx="5" fill="#e6edf6"/><text x="552" y="85">3 · Inspector</text><text x="552" y="116">Configuration</text><text x="552" y="143">Interfaces</text><text x="552" y="170">Tables</text><text x="155" y="85">2 · Network canvas</text><path d="M220 145H440" stroke="#89a9b8" stroke-width="3"/>'+device('host',220,145,'Client')+device('router',440,145,'Gateway')+'<rect x="140" y="266" width="548" height="48" rx="6" fill="#233d52"/><text x="156" y="296" style="fill:white">4 · Terminal | Activity | Troubleshooting</text>',340),
    ports:scene('Two devices with a cable between selected Ethernet ports; anchors control cable placement',wire+device('host',110,100,'Host · eth0')+device('switch',590,100,'Switch · port 1')+'<circle cx="145" cy="100" r="6" fill="#246d68"/><circle cx="550" cy="100" r="6" fill="#246d68"/><text x="350" y="65" text-anchor="middle">One cable · two interfaces</text>'+tag(260,170,'Link enabled')),
    nat:scene('Private client 192.168.1.10 translated at a NAT router to outside address 203.0.113.1',wire+device('host',110,100,'192.168.1.10')+device('router',350,100,'NAT router')+device('host',590,100,'Outside server')+tag(20,180,'Inside interface')+tag(260,180,'203.0.113.1')+tag(500,180,'Outside interface')),
    web:scene('DNS resolves a name, TCP establishes a connection, HTTP fetches a page', '<path d="M110 85H590" stroke="#89a9b8" stroke-width="3"/>'+tag(20,67,'1 · DNS lookup')+tag(260,67,'2 · TCP setup')+tag(500,67,'3 · HTTP GET')+'<text x="110" y="140" text-anchor="middle">Name → IP</text><text x="350" y="140" text-anchor="middle">SYN → SYN/ACK → ACK</text><text x="590" y="140" text-anchor="middle">Request → response</text>',180)
  };
  document.querySelectorAll('[data-art]').forEach(figure => figure.insertAdjacentHTML('afterbegin',arts[figure.dataset.art]));
  document.querySelectorAll('[data-device-art]').forEach(el => { el.innerHTML = `<svg viewBox="-45 -35 90 80" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyphs[el.dataset.deviceArt]}</g></svg>`; });
  followHash();
})();
