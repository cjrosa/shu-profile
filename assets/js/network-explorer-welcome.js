(function () {
  "use strict";
  const $ = (id) => document.getElementById(id),
    home = document.createElement("button"),
    divider = document.createElement("span");
  const svg = (p) =>
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + p + '"/></svg>';
  home.id = "network-home";
  home.type = "button";
  home.className = "canvas-icon-button";
  home.setAttribute("aria-label", "Home");
  home.title = "Home";
  home.innerHTML = svg("m3 11 9-8 9 8M5 9v12h5v-7h4v7h5V9");
  divider.className = "home-toolbar-divider";
  divider.setAttribute("aria-hidden", "true");
  document.querySelector(".canvas-network-actions").prepend(home, divider);
  const welcome = document.createElement("section");
  welcome.id = "network-welcome";
  welcome.setAttribute("aria-label", "Welcome to Network Explorer");
  welcome.innerHTML =
    '<header><h1 tabindex="-1">Network Explorer</h1><p>Build a network. Follow a packet. Explain each decision.</p></header><div class="welcome-columns"><section><h2>Start</h2><div class="welcome-start"><button data-action="new">' +
    svg("M14 3H5v18h14V8ZM14 3v6h5M8 15h8m-4-4v8") +
    'New network</button><button data-action="surprise-network">' +
    svg("m3 19 12-12 3 3L6 22ZM12 10l3 3M5 2v4M3 4h4m12-3v6m-3-3h6m-1 11v4m-2-2h4") +
    'Surprise me</button><button data-action="load-network">' +
    svg("M3 7V4h7l2 3h9v13H3ZM12 10v8m-3-3 3 3 3-3") +
    'Open network...</button><button id="welcome-resume">' +
    svg("m9 5 7 7-7 7") +
    'Continue on canvas</button></div><h2>Recents</h2><div id="welcome-recents"></div></section><section><h2>Example networks</h2><div id="welcome-examples"></div></section></div><div class="welcome-tip">' +
    svg("M3 5h18v12H3ZM8 21h8m-4-4v4") +
    "<div><strong>Learn by exploring</strong><p>Try the Campus network for a complete journey through DHCP, DNS, routing, and web browsing. Its notes guide you through each step.</p></div></div>";
  $("canvas-stage").append(welcome);
  const overview = document.createElement("div");
  overview.className = "welcome-overview";
  welcome.prepend(overview);
  overview.append(welcome.querySelector("header"), welcome.querySelector(".welcome-columns"));
  const hero = document.createElement("div");
  hero.className = "welcome-network-art";
  hero.setAttribute("aria-hidden", "true");
  hero.innerHTML =
    '<svg viewBox="0 0 360 150"><defs><linearGradient id="welcome-router-depth" x2="0" y2="1"><stop stop-color="#b9cedd"/><stop offset="1" stop-color="#8daabd"/></linearGradient><filter id="welcome-device-shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#32546a" flood-opacity=".13"/></filter><pattern id="welcome-art-grid" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#bad1da"/></pattern></defs><rect x="4" y="4" width="352" height="142" rx="16" fill="url(#welcome-art-grid)" opacity=".5"/><g fill="none" stroke="#9ab8c8" stroke-width="2" stroke-linecap="round"><path id="welcome-route-a" d="M57 81C100 81 106 39 170 39"/><path id="welcome-route-b" d="M198 39C251 39 251 81 300 81"/><path id="welcome-route-c" d="M57 84C110 84 117 119 170 119"/><path d="M198 119C250 119 252 84 300 84M184 52v51" stroke-dasharray="3 5"/></g><g filter="url(#welcome-device-shadow)"><g transform="translate(24 53)"><rect width="52" height="37" rx="4" fill="#fff" stroke="#405d7b" stroke-width="1.8"/><rect x="5" y="5" width="42" height="26" rx="2" fill="#dcebf5"/><path d="M26 37v8M15 46h22" stroke="#405d7b" stroke-width="2"/><g fill="#6695bf"><rect x="18" y="10" width="7" height="7"/><rect x="27" y="10" width="7" height="7"/><rect x="18" y="19" width="7" height="7"/><rect x="27" y="19" width="7" height="7"/></g><path d="M8 50h36l5 5H3Z" fill="#e4edf3" stroke="#405d7b" stroke-width="1.3"/></g><g transform="translate(158 23)"><path d="M0 12v12c0 16 52 16 52 0V12" fill="url(#welcome-router-depth)" stroke="#48627e" stroke-width="1.5"/><ellipse cx="26" cy="12" rx="26" ry="12" fill="#edf5fb" stroke="#48627e" stroke-width="1.5"/><path d="M8 12h12m-4-4 4 4-4 4M44 12H32m4-4-4 4 4 4M26 10V3m-3 3 3-3 3 3M26 14v7m-3-3 3 3 3-3" fill="none" stroke="#48627e" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></g><g transform="translate(155 103)"><path d="m0 7 6-7h46l6 7v21H0Z" fill="#edf6f4" stroke="#4d8283" stroke-width="1.5"/><path d="M0 7h58" stroke="#4d8283" stroke-width="1.5"/><g fill="#517d80"><rect x="7" y="14" width="8" height="7" rx="1"/><rect x="19" y="14" width="8" height="7" rx="1"/><rect x="31" y="14" width="8" height="7" rx="1"/><rect x="43" y="14" width="8" height="7" rx="1"/></g><circle cx="49" cy="4" r="1.4" fill="#64ac8f"/></g><g transform="translate(286 49)"><rect width="43" height="56" rx="5" fill="#f5f8fb" stroke="#405d7b" stroke-width="1.8"/><path d="M0 18h43M0 36h43" stroke="#9cafc0"/><g fill="#5d8caa"><rect x="7" y="7" width="15" height="3" rx="1"/><rect x="7" y="25" width="15" height="3" rx="1"/><rect x="7" y="43" width="15" height="3" rx="1"/></g><g fill="#6aaa94"><circle cx="33" cy="9" r="2"/><circle cx="33" cy="27" r="2"/><circle cx="33" cy="45" r="2"/></g></g></g><g class="welcome-packets" fill="#d3a353" stroke="#fff" stroke-width="1.5"><circle r="3.5"><animateMotion dur="5s" repeatCount="indefinite"><mpath href="#welcome-route-a"/></animateMotion></circle><circle r="3.5"><animateMotion dur="5s" begin="2.5s" repeatCount="indefinite"><mpath href="#welcome-route-b"/></animateMotion></circle><circle r="3.5"><animateMotion dur="6s" begin="1s" repeatCount="indefinite"><mpath href="#welcome-route-c"/></animateMotion></circle></g></svg>';
  const art = hero.querySelector("svg"),
    deviceLayer = art.querySelector("g[filter]");
  deviceLayer.innerHTML = [
    ["host", 50, 76],
    ["router", 184, 36],
    ["switch", 184, 116],
    ["host", 307, 77],
  ]
    .map(
      ([type, x, y]) =>
        '<g transform="translate(' +
        x +
        " " +
        y +
        ') scale(.7)" style="color:' +
        (type === "switch" ? "#4d8283" : "#3b5278") +
        '">' +
        window.NetworkExplorerIcons.device({ type, os: "windows" }) +
        "</g>",
    )
    .join("");
  welcome.querySelector("header").append(hero);
  const eyebrow = document.createElement("span");
  eyebrow.className = "welcome-eyebrow";
  eyebrow.textContent = "INTERACTIVE NETWORK LAB";
  welcome.querySelector("header").prepend(eyebrow);

  // Miniature scenes share the same device artwork as the live canvas.
  const miniDevice = (type, x, y, scale = .42) =>
    `<g transform="translate(${x} ${y}) scale(${scale})" style="color:${type === 'switch' ? '#4d8283' : '#3b5278'}">${window.NetworkExplorerIcons.device({type, os:'windows'})}</g>`;
  const wire = (path, color = '#8daabc') => `<path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>`;
  const packet = (x, y, color = '#bd9455') => `<rect x="${x}" y="${y}" width="7" height="5" rx="1" fill="${color}" stroke="#fff" stroke-width=".8"/>`;
  const server = (x, y) => `<g transform="translate(${x} ${y})"><rect width="22" height="33" rx="3" fill="#edf4fa" stroke="#3b5278" stroke-width="1.5"/><path d="M0 11h22M0 22h22M4 5h8m-8 11h8m-8 11h8" stroke="#7b96ac"/><g fill="#4d9482"><circle cx="17" cy="6" r="1.5"/><circle cx="17" cy="17" r="1.5"/><circle cx="17" cy="28" r="1.5"/></g></g>`;
  const lock = (x, y) => `<g transform="translate(${x} ${y})" stroke="#287d78" stroke-width="1.8"><rect y="8" width="16" height="14" rx="3" fill="#e7f4f1"/><path d="M3 8V5a5 5 0 0 1 10 0v3M8 13v4" fill="none"/></g>`;
  const browserArt = '<rect x="10" y="10" width="76" height="45" rx="5" fill="#fff" stroke="#52718b" stroke-width="1.7"/><path d="M10 21h76" stroke="#a4bacb"/><circle cx="17" cy="16" r="2" fill="#6c9f97"/><rect x="24" y="14" width="52" height="4" rx="2" fill="#e0ebf3"/><rect x="18" y="28" width="20" height="18" rx="2" fill="#cee4ed"/><path d="M44 30h31m-31 7h24m-24 7h28" stroke="#98b3c6" stroke-width="2"/>';
  const lanArt = wire('M19 19 48 40 78 19') + miniDevice('host',19,19,.36) + miniDevice('switch',48,40,.4) + miniDevice('host',78,19,.36);
  const routedArt = '<rect x="2" y="15" width="30" height="44" rx="10" fill="#e0f0ec"/><rect x="64" y="15" width="30" height="44" rx="10" fill="#e4eaf5"/>' + wire('M17 36H79') + miniDevice('host',17,36,.33) + miniDevice('router',48,36,.4) + miniDevice('host',79,36,.33);
  const firewallArt = wire('M13 32H82') + packet(10,29) + miniDevice('firewall',49,32,.65) + server(73,16);
  const scanArt = wire('M8 18 42 28M8 32H42M8 46 42 36') + [15,29,43].map(y=>packet(13,y,'#6f9dbb')).join('') + miniDevice('firewall',57,33,.65);
  const echoArt = '<rect x="25" y="8" width="58" height="39" rx="4" fill="#edf4fa" stroke="#52718b" stroke-width="1.5"/><path d="M25 17h58" stroke="#a4bacb"/><path d="m32 24 5 4-5 4m12 0h16M44 38h28" fill="none" stroke="#4c8986" stroke-width="2"/>' + miniDevice('host',16,42,.33);
  const exampleArt = {
    'example-direct': wire('M24 32H73') + miniDevice('host',22,32,.47) + miniDevice('host',74,32,.47) + packet(46,29),
    'example': lanArt + packet(33,26),
    'example-dhcp': wire('M20 38H75') + miniDevice('host',20,38,.42) + server(64,15) + '<path d="M32 24h23m-5-4 5 4-5 4M55 49H32m5-4-5 4 5 4" fill="none" stroke="#4c8986" stroke-width="2"/>' + packet(42,35),
    'example-dns': server(66,17) + '<rect x="5" y="13" width="53" height="19" rx="4" fill="#fff" stroke="#91adbf"/><text x="31" y="26" text-anchor="middle" fill="#42657f" stroke="none" font-size="10" font-family="sans-serif">www.</text><path d="M20 34v16h39m-5-4 5 4-5 4" fill="none" stroke="#4c8986" stroke-width="2"/>' + packet(41,47),
    'example-vlans': '<rect x="2" y="4" width="44" height="55" rx="8" fill="#dceee9"/><rect x="50" y="4" width="44" height="55" rx="8" fill="#e2e8f5"/>' + wire('M20 18 48 40 76 18M20 49 48 40 76 49') + [20,76].map(x=>miniDevice('host',x,18,.3)+miniDevice('host',x,49,.3)).join('') + miniDevice('switch',48,36,.35),
    'example-routed': routedArt,
    'example-static': wire('M9 42 32 24H66L87 42') + miniDevice('host',11,44,.3) + miniDevice('router',32,24,.4) + miniDevice('router',66,24,.4) + miniDevice('host',86,44,.3) + packet(45,21),
    'example-dhcp-relay': wire('M12 45 34 25H64L83 43') + miniDevice('host',12,45,.3) + miniDevice('router',34,25,.34) + miniDevice('router',64,25,.34) + server(73,34) + '<path d="M25 9h45m-5-4 5 4-5 4" fill="none" stroke="#4c8986" stroke-width="2"/>',
    'example-http': browserArt,
    'example-https': browserArt + lock(64,35),
    'example-firewall': firewallArt,
    'example-security-encrypt': browserArt + '<path d="M19 38h32m-5-4 5 4-5 4" stroke="#4c8986" stroke-width="2"/>' + lock(62,34),
    'example-security-harden': firewallArt + '<circle cx="16" cy="17" r="8" fill="#faeceb" stroke="#ab6a65"/><path d="m12 13 8 8m0-8-8 8" stroke="#ab6a65" stroke-width="2"/>',
    'example-security-detect': scanArt + '<path d="M65 12q12-14 24 0-12 14-24 0Z" fill="#fff" stroke="#52718b"/><circle cx="77" cy="12" r="3" fill="#6e9cb4"/>',
    'example-security-prevent': scanArt + '<path d="m76 5 10 4v10l-10 5-10-5V9Z" fill="#e4efeb" stroke="#287d78"/><path d="M71 14h10" stroke="#287d78" stroke-width="2"/>',
    'example-dos': wire('M7 12 65 24M7 25 65 29M7 38 65 34M7 51 65 39') + [10,23,36,49].map((y,i)=>packet(12+i*7,y,'#bd9455')).join('') + server(68,15) + '<path d="M57 14v37" stroke="#287d78" stroke-width="3"/>',
    'example-echo-tcp': echoArt + '<path d="M35 54h41m-5-4 5 4-5 4M76 61H35m5-3-5 3 5 3" fill="none" stroke="#4c8986" stroke-width="1.8"/>',
    'example-echo-udp': echoArt + packet(36,52,'#6e9cb4') + packet(52,56,'#6e9cb4') + packet(69,51,'#6e9cb4'),
    'example-internet': wire('M17 16 46 34 17 53M46 34H77') + miniDevice('host',17,16,.3) + miniDevice('host',17,53,.3) + miniDevice('router',46,34,.4) + '<g stroke="#688fa8" fill="#edf4fa" stroke-width="1.5"><circle cx="79" cy="33" r="13"/><ellipse cx="79" cy="33" rx="6" ry="13" fill="none"/><path d="M66 33h26M69 26h20m-20 14h20"/></g>',
    'example-complex': wire('M23 20H73L48 49ZM23 20 8 44M73 20 88 44') + miniDevice('router',23,20,.36) + miniDevice('router',73,20,.36) + miniDevice('router',48,49,.36) + miniDevice('switch',9,45,.25) + miniDevice('switch',87,45,.25) + packet(44,17)
  };
  const exampleGroups = [
    ["Basic", ["example-direct", "example", "example-dhcp", "example-dns"]],
    ["Intermediate", ["example-vlans", "example-routed", "example-http"]],
    [
      "Advanced",
      [
        "example-static",
        "example-dhcp-relay",
        "example-internet",
        "example-complex",
      ],
    ],
    ["Special Applications", ["example-echo-tcp", "example-echo-udp"]],
    ["Security", ["example-https", "example-firewall", "example-security-encrypt", "example-security-harden", "example-security-detect", "example-security-prevent", "example-dos"]],
  ];
  for (const [name, ids] of exampleGroups) {
    if (name === "Special Applications") {
      const separator = document.createElement("hr");
      separator.className = "welcome-example-divider";
      $("welcome-examples").append(separator);
    }
    const group = document.createElement("details");
    group.className = "welcome-example-group";
    group.open = name === "Basic";
    const summary = document.createElement("summary");
    summary.textContent = name + " (" + ids.length + ")";
    group.append(summary);
    $("welcome-examples").append(group);
    for (const id of ids) {
      const source = NetworkExplorerActions.examples[id];
      if (!source) continue;
      const b = document.createElement("button");
      b.className = "welcome-example";
      b.dataset.action = id;

      b.innerHTML =
        '<svg class="welcome-example-art" viewBox="0 0 96 68" aria-hidden="true">' + exampleArt[id] + '</svg>' +
        "<span>" +
        "<strong>" +
        source.title +
        "</strong><span>" +
        source.description +
        "</span>" +
        "</span>";
      group.append(b);
    }
  }
  function show(open, focus = true) {
    welcome.hidden = !open;
    document.body.classList.toggle("welcome-open", open);
    home.setAttribute("aria-pressed", String(open));
    $("canvas-title").textContent = open ? "Welcome" : "Network canvas";
    if (open && focus) welcome.querySelector("h1").focus();
    if (!open && focus) home.focus();
    window.dispatchEvent(new Event("resize"));
  }
  const recentKey = "network-explorer-recents-v1";
  let recents = [];
  try {
    const saved = JSON.parse(localStorage.getItem(recentKey) || "[]");
    if (Array.isArray(saved))
      recents = saved
        .filter(
          (r) =>
            r &&
            typeof r.name === "string" &&
            r.data &&
            Array.isArray(r.data.devices),
        )
        .slice(0, 5);
  } catch {}
  function saveRecents() {
    try {
      localStorage.setItem(recentKey, JSON.stringify(recents));
    } catch {}
  }
  function renderRecents() {
    const list = $("welcome-recents");
    list.replaceChildren();
    if (!recents.length) {
      const empty = document.createElement("p");
      empty.className = "welcome-copy";
      empty.textContent = "Networks you open or save will appear here.";
      list.append(empty);
    }
    for (const [index, recent] of recents.entries()) {
      const row = document.createElement("div");
      row.className = "welcome-recent-row";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "welcome-recent";
      button.innerHTML = svg("M3 5h7l2 3h9v12H3ZM3 12h18M7 16h4m3 0h3");
      const text = document.createElement("span");
      text.className = "welcome-recent-name";
      text.textContent = recent.name;
      const date = document.createElement("time");
      const used = new Date(recent.lastUsed || NaN);
      if (Number.isFinite(used.getTime())) {
        date.dateTime = used.toISOString();
        date.textContent = used.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          ...(used.getFullYear() !== new Date().getFullYear()
            ? { year: "numeric" }
            : {}),
        });
        date.title = "Last used " + used.toLocaleString();
      } else {
        date.textContent = "—";
        date.title = "Last-used date unavailable for this older entry";
      }
      button.append(text, date);
      button.title = "Open " + recent.name;
      button.onclick = () => {
        const detail = { ...recent, opened: false };
        document.dispatchEvent(
          new CustomEvent("network-recent-open", { detail }),
        );
        if (detail.opened) {
          remember(recent);
          show(false);
        }
      };
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "welcome-recent-remove";
      remove.innerHTML = svg("m7 7 10 10M17 7 7 17");
      remove.title = "Remove from Recents";
      remove.setAttribute(
        "aria-label",
        "Remove " + recent.name + " from Recents",
      );
      remove.onclick = () => {
        recents = recents.filter((r) => r !== recent);
        saveRecents();
        renderRecents();
        const remaining = list.querySelectorAll(".welcome-recent-remove");
        (
          remaining[Math.min(index, remaining.length - 1)] ||
          welcome.querySelector('[data-action="load-network"]')
        ).focus();
      };
      row.append(button, remove);
      list.append(row);
    }
  }
  function remember(recent) {
    const signature = JSON.stringify(recent.data);
    recents = [
      { ...recent, lastUsed: new Date().toISOString() },
      ...recents.filter(
        (r) => r.name !== recent.name && JSON.stringify(r.data) !== signature,
      ),
    ].slice(0, 5);
    saveRecents();
    renderRecents();
  }
  document.addEventListener("network-recent-record", (e) => remember(e.detail));
  renderRecents();
  home.onclick = () => {
    renderRecents();
    show(true);
  };
  $("welcome-resume").onclick = () => show(false);
  welcome.addEventListener("click", (e) => {
    const button = e.target.closest("[data-action]");
    if (!button) return;
    show(false, false);
    NetworkExplorerActions.run(button.dataset.action);
  });
  document.addEventListener(
    "click",
    (e) => {
      if (
        !welcome.hidden &&
        !welcome.contains(e.target) &&
        !home.contains(e.target) &&
        e.target.closest(".view-controls button,#left-panel button")
      )
        show(false, false);
    },
    true,
  );
  show(true, false);
})();
