/* Header search owns its input, results and keyboard/focus lifecycle. */
window.NetworkExplorerSearch = {
  create({
    getNetwork,
    applications,
    appLabel,
    appGlyph,
    isPan,
    noteTarget,
    noteName,
    noteSymbol,
    osIcon,
    devicePlatform,
    esc,
    selectResult,
  }) {
    const $ = (id) => document.getElementById(id);
    const searchField = document.createElement("div");
    searchField.className = "canvas-header-search";
    searchField.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg><input id="network-query" type="search" aria-label="Search network" placeholder="Search devices, notes, incidents" autocomplete="off" aria-controls="network-search-dropdown" aria-expanded="false">';
    document.querySelector(".canvas-toolbar").append(searchField);
    const searchPanel = document.createElement("section");
    searchPanel.id = "network-search-dropdown";
    searchPanel.className = "network-search";
    searchPanel.hidden = true;
    searchPanel.setAttribute("aria-label", "Search results");
    searchPanel.innerHTML =
      '<div class="network-search-count" role="status"></div><div class="network-search-results"></div>';
    document.body.append(searchPanel);
    const searchInput = $("network-query"),
      searchResults = searchPanel.querySelector(".network-search-results");
    const clearSearch = document.createElement("button");
    clearSearch.type = "button";
    clearSearch.className = "network-search-clear";
    clearSearch.setAttribute("aria-label", "Clear search");
    clearSearch.hidden = true;
    clearSearch.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';
    searchField.append(clearSearch);
    clearSearch.onclick = () => {
      searchInput.value = "";
      clearSearch.hidden = true;
      searchInput.focus();
      openSearch();
    };

    let activeFilter = 'All';
    const filterBar = document.createElement('div');
    filterBar.className = 'network-search-filters';
    filterBar.setAttribute('role','group');
    filterBar.setAttribute('aria-label','Filter search results');
    const filterButtons = new Map();
    for(const name of ['All','Devices','Applications','Notes','Tools','Incidents','Recent']) {
      const button=document.createElement('button');button.type='button';
      button.onclick=()=>{activeFilter=name;refreshSearch();searchResults.scrollTop=0;};
      filterButtons.set(name,button);filterBar.append(button);
    }
    searchPanel.prepend(filterBar);
    const recentByNetwork = new WeakMap();
    const rowKey = row => row.d.type + ':' + row.d.id;
    const categoryOf = d => d.type==='incident'?'Incidents':d.type==='note'?'Notes':d.searchCategory||'Devices';
    const groupName = d => d.searchCategory ? d.searchCategory : d.type === 'incident' ? 'Incidents' : d.type === 'note' ? 'Notes' : d.wifi || d.wireless ? 'Wireless' : ({host:'Hosts',router:'Routers',switch:'Switches',firewall:'Firewalls',ap:'Wireless'})[d.type] || 'Devices';
    function closeSearch() {
      searchPanel.hidden = true;
      searchInput.setAttribute("aria-expanded", "false");
    }
    function refreshSearch() {
      const net = getNetwork();
      if (searchPanel.hidden) return;
      const terms = searchInput.value
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      const rows = net.devices
        .map((d) => {
          const os =
            d.type === "host"
              ? { windows: "Windows", linux: "Linux", macos: "macOS" }[
                  d.os || "windows"
                ]
              : isPan(d)
                ? "Palo Alto PAN-OS"
                : "Cisco IOS";
          const addresses = [d.ip, ...d.ports.map((p) => p.ip)].filter(Boolean);
          const apps = applications()
            .filter((a) => a.host === d.id)
            .map((a) => appLabel(a.type));
          const detail = [d.role || d.type, ...(d.firewall?.enabled ? ["firewall enabled"] : []), os, ...addresses, ...apps].join(" | ");
          return {
            d,
            detail,
            text: [
              d.name,
              detail,
              ...(d.tags || []),
              ...d.ports.map((p) => p.name + " " + p.mac),
            ]
              .join(" ")
              .toLowerCase(),
          };
        })
        .concat(
          net.notes.map((n) => {
            const target = noteTarget(n.target),
              associated = target
                ? target.name ||
                  appLabel(target.type) +
                    (target.host ? " on " + net.device(target.host).name : "")
                : "";
            return {
              d: { ...n, type: "note", name: noteName(n) },
              detail: ["Note", associated, n.tags.map((t) => "#" + t).join(" ")]
                .filter(Boolean)
                .join(" | "),
              preview: n.text.replace(/\s+/g, " ").slice(0, 130),
              text: [
                "note",
                n.title || "",
                n.text,
                n.tags.join(" "),
                associated,
              ]
                .join(" ")
                .toLowerCase(),
            };
          }),
        )
        .concat(applications().map(a=>{
          const host=net.device(a.host),name=appLabel(a.type);
          const category=['nmap','generator','spoofer','ids','arpInspection','firewall'].includes(a.type)?'Tools':'Applications';
          return {d:{...a,name,searchCategory:category},detail:host?'On '+host.name:'Not attached',
            text:[name,category,host?.name,host?.ip].filter(Boolean).join(' ').toLowerCase()};
        }))
        .concat((window.NetworkExplorerIncidents?.catalog || []).map(c => ({
          d:{id:c.id,type:'incident',name:c.title}, detail:c.group+' | '+c.level+' | Open incident dialog',
          text:('incidents practice '+c.title+' '+c.group+' '+c.level).toLowerCase()
        })))
        .filter((row) =>
          terms.every((term) =>
            term.startsWith("#") || term.startsWith("tag:")
              ? (row.d.tags || []).some((t) =>
                  t.toLowerCase().includes(term.replace(/^(#|tag:)/, "")),
                )
              : row.text.includes(term),
          ),
        );

      const focusedId = searchResults.contains(document.activeElement)
        ? document.activeElement.dataset.resultId
        : null;
      searchResults.replaceChildren();
      const recents = recentByNetwork.get(net) || [];
      const recentRows = recents.map(key=>rows.find(row=>rowKey(row)===key)).filter(Boolean);
      const matches=(row,name)=>name==='All'||categoryOf(row.d)===name;
      for(const [name,button] of filterButtons){
        const count=name==='Recent'?recentRows.length:rows.filter(row=>matches(row,name)).length;
        button.textContent=name+' ('+count+')';button.setAttribute('aria-pressed',String(activeFilter===name));
      }
      const visibleRows=activeFilter==='Recent'?recentRows:rows.filter(row=>matches(row,activeFilter));
      searchPanel.querySelector('[role=status]').textContent=visibleRows.length+' result'+(visibleRows.length===1?'':'s');
      const groups = new Map();
      if((activeFilter==='All'||activeFilter==='Recent')&&recentRows.length)groups.set('Recent',recentRows);
      for(const row of activeFilter==='Recent'?[]:visibleRows){const name=groupName(row.d);if(!groups.has(name))groups.set(name,[]);groups.get(name).push(row);}
      for(const [name,items] of groups){
        const group=document.createElement('div');group.className='network-search-group';
        const heading=document.createElement('h3');heading.textContent=name+' ('+items.length+')';group.append(heading);searchResults.append(group);
      for (const row of items) {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.resultId = rowKey(row);
        b.title = row.d.name + " | " + row.detail;
        b.innerHTML =
          "<strong>" +
          (row.d.searchCategory ? '<svg class="search-app-icon" viewBox="-30 -26 60 52" aria-hidden="true">'+appGlyph(row.d.type)+'</svg>' : row.d.type === "incident" ? '<svg class="search-incident-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 10h18c0-3-3-3-3-10M10 22h4"/></svg>' : row.d.type === "note"
            ? noteSymbol()
            : osIcon(
                row.d.type === "host"
                  ? row.d.os || "windows"
                  : devicePlatform(row.d),
              )) +
          "<span>" + esc(row.d.name) + "</span>" +
          "</strong><small>" +
          esc(row.detail) +
          "</small>" +
          (row.preview
            ? '<small class="note-search-preview">' +
              esc(row.preview) +
              "</small>"
            : "");
        b.onclick = () => {
          recentByNetwork.set(net,[rowKey(row),...recents.filter(key=>key!==rowKey(row))].slice(0,5));
          closeSearch();
          if(row.d.type==='incident'){
            document.dispatchEvent(new CustomEvent('network-incident-open',{detail:{area:row.d.id}}));return;
          }
          selectResult(row.d);
          $("canvas").dispatchEvent(
            new CustomEvent("network-locate", {
              detail: { x: row.d.x, y: row.d.y },
            }),
          );
          if (row.d.type === "note") {
            const pinned = document.querySelector(
              '[data-pinned-note="' + row.d.id + '"] .note-grab',
            );
            (
              pinned ||
              $("notes").querySelector('[data-note="' + row.d.id + '"]')
            )?.focus({ preventScroll: true });
          } else
            $("devices")
              .querySelector('[data-device="' + row.d.id + '"]')
              ?.focus({ preventScroll: true });
        };
        group.append(b);
        if (focusedId === rowKey(row)) b.focus({ preventScroll: true });
      }
      }
      if (!visibleRows.length)
        searchResults.textContent = "No matching results in this category.";
    }
    function openSearch() {
      clearSearch.hidden = !searchInput.value;
      if (document.body.classList.contains("welcome-open")) return;
      searchPanel.hidden = false;
      searchInput.setAttribute("aria-expanded", "true");
      const r = searchField.getBoundingClientRect(),
        width = Math.min(560, innerWidth - 16);
      searchPanel.style.width = width + "px";
      searchPanel.style.left =
        Math.max(8, Math.min(r.left + (r.width - width) / 2, innerWidth - width - 8)) + "px";
      searchPanel.style.top = r.bottom + 5 + "px";
      searchPanel.style.maxHeight =
        Math.max(80, innerHeight - r.bottom - 16) + "px";
      refreshSearch();
    }
    searchInput.onfocus = openSearch;
    searchInput.oninput = openSearch;
    searchInput.onclick = () => {
      if (searchPanel.hidden) openSearch();
    };
    const searchKeys = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeSearch();
        searchInput.focus();
        closeSearch();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (searchPanel.hidden) openSearch();
        const buttons = [...searchResults.querySelectorAll("button")],
          i = buttons.indexOf(document.activeElement);
        const next =
          i < 0
            ? e.key === "ArrowDown"
              ? 0
              : buttons.length - 1
            : (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
              buttons.length;
        buttons[next]?.focus();
      } else if (e.key === "Enter" && e.target === searchInput) {
        e.preventDefault();
        searchResults.querySelector("button")?.click();
      }
    };
    searchPanel.addEventListener("keydown", searchKeys);
    searchInput.addEventListener("keydown", searchKeys);
    document.addEventListener("pointerdown", (e) => {
      if (!searchPanel.contains(e.target) && !searchField.contains(e.target))
        closeSearch();
    }, { capture: true });
    document.addEventListener("focusin", (e) => {
      if (!searchPanel.contains(e.target) && !searchField.contains(e.target))
        closeSearch();
    });
    window.addEventListener("resize", closeSearch);

    return {
      refresh: refreshSearch,
      open: () => {
        searchInput.focus();
        openSearch();
      },
      close: closeSearch,
    };
  },
};
