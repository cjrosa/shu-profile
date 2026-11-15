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

  const exampleGroups = [
    ["Basic", ["example", "example-dhcp", "example-dns"]],
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
  ];
  for (const [name, ids] of exampleGroups) {
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

      const paths = {
        "example-internet":
          "M3 12h18M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c-5 5-5 13 0 18 5-5 5-13 0-18Z",
        "example-complex":
          "M9 3h6v5H9ZM2 16h6v5H2ZM16 16h6v5h-6ZM12 8v4M5 16v-4h14v4",
        "example-routed": "M2 8h6v8H2ZM16 8h6v8h-6ZM8 12h8m-5-3 3 3-3 3",
        "example-http":
          "M3 4h18v16H3ZM3 9h18M6 6h2m3 0h2M10 12l-3 3 3 3m4-6 3 3-3 3",
        "example-dns":
          "M3 12h18M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c-5 5-5 13 0 18 5-5 5-13 0-18Z",
        "example-vlans":
          "M2 4h8v6H2ZM14 14h8v6h-8ZM6 10v7h8M14 4h8v6h-8ZM2 14h8v6H2Z",
      };
      b.innerHTML =
        svg(paths[id] || "M2 8h6v8H2ZM16 8h6v8h-6ZM8 12h8") +
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
