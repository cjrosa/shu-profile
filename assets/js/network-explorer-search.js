/* Header search owns its input, results and keyboard/focus lifecycle. */
window.NetworkExplorerSearch = {
  create({
    getNetwork,
    applications,
    appLabel,
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
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg><input id="network-query" type="search" aria-label="Search network" placeholder="Search devices, notes, IPs" autocomplete="off" aria-controls="network-search-dropdown" aria-expanded="false">';
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
          const detail = [d.type, os, ...addresses, ...apps].join(" | ");
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
        .filter((row) =>
          terms.every((term) =>
            term.startsWith("#") || term.startsWith("tag:")
              ? (row.d.tags || []).some((t) =>
                  t.toLowerCase().includes(term.replace(/^(#|tag:)/, "")),
                )
              : row.text.includes(term),
          ),
        );
      searchPanel.querySelector("[role=status]").textContent =
        rows.length + " result" + (rows.length === 1 ? "" : "s");
      const focusedId = searchResults.contains(document.activeElement)
        ? document.activeElement.dataset.resultId
        : null;
      searchResults.replaceChildren();
      for (const row of rows) {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.resultId = row.d.id;
        b.innerHTML =
          "<strong>" +
          (row.d.type === "note"
            ? noteSymbol()
            : osIcon(
                row.d.type === "host"
                  ? row.d.os || "windows"
                  : devicePlatform(row.d),
              )) +
          esc(row.d.name) +
          "</strong><small>" +
          esc(row.detail) +
          "</small>" +
          (row.preview
            ? '<small class="note-search-preview">' +
              esc(row.preview) +
              "</small>"
            : "");
        b.onclick = () => {
          closeSearch();
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
        searchResults.append(b);
        if (focusedId === row.d.id) b.focus({ preventScroll: true });
      }
      if (!rows.length)
        searchResults.textContent = "No matching devices or notes.";
    }
    function openSearch() {
      clearSearch.hidden = !searchInput.value;
      if (document.body.classList.contains("welcome-open")) return;
      searchPanel.hidden = false;
      searchInput.setAttribute("aria-expanded", "true");
      const r = searchField.getBoundingClientRect(),
        width = Math.min(380, innerWidth - 16);
      searchPanel.style.width = width + "px";
      searchPanel.style.left =
        Math.max(8, Math.min(r.left, innerWidth - width - 8)) + "px";
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
    });
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
