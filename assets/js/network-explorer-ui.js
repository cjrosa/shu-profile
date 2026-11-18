/* Network Explorer: presentation and interaction only; protocols live in the engine. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    esc = (x) =>
      String(x ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  let net = new NetworkExplorer.Network(),
    selected = null,
    connecting = false,
    endpoint = null,
    running = false,
    timer = null,
    staged = null,
    drag = null,
    previousFocus = null,
    examined = false,
    messageTimer;
  let candidateBase = null;
  let refreshTroubleshooting = () => {};
  const networkIdentities = new WeakMap();
  function networkIdentity(network = net) {
    if (!networkIdentities.has(network)) networkIdentities.set(network, {});
    return networkIdentities.get(network);
  }
  function adoptTrafficNetwork(next) {
    const identity = networkIdentity();
    for(const [id,state] of Object.entries(net.echo||{})){if(next.echo?.[id]){next.echo[id].selected=state.selected;next.echo[id].ui=state.ui;for(const t of state.threads){const other=next.echo[id].threads.find(x=>x.id===t.id);if(other)other.breakpoints=t.breakpoints;}}}
    net = terminalSessions.adopt(net, next);
    networkIdentities.set(net, identity);
  }
  const editHistory = new NetworkExplorerHistory.History(100);
  let restoringHistory = false;
  const historySnapshot = () => ({
    data: net.save(),
    candidate: candidateBase ? JSON.parse(JSON.stringify(candidateBase)) : null,
    selected,
  });
  function refreshHistoryButtons() {
    const busy = !!(staged || net.queue.length);
    for (const [id, stack, verb] of [
      ["undo-network", editHistory.past, "Undo"],
      ["redo-network", editHistory.future, "Redo"],
    ]) {
      const b = $(id);
      if (!b) continue;
      b.disabled = busy || !stack.length;
      const title =
        verb +
        (stack.length ? ": " + stack.at(-1).label : "") +
        (busy ? " (finish the exchange first)" : "");
      b.setAttribute("aria-label", title);
      b.dataset.tooltip = title;
    }
  }
  function recordHistory(before, label, group = null) {
    if (restoringHistory || staged || net.queue.length) return;
    editHistory.record(before, historySnapshot(), label, group);
    refreshHistoryButtons();
  }
  const presentationKeys = [
    "x",
    "y",
    "name",
    "tags",
    "watch",
    "watchDecisions",
    "applicationWatch",
    "dnsWatch",
    "webWatch",
    "browserWatch",
    "applicationOffset",
    "dnsOffset",
    "webOffset",
    "browserOffset",
    "echoOffset",
    "echoWatch",
    "spooferWatch",
    "spooferOffset",
  ];
  function configSignature(data) {
    const value = JSON.parse(JSON.stringify(data));
    delete value.notes;
    for (const d of value.devices)
      for (const k of presentationKeys) delete d[k];
    for (const a of value.applicationDrafts || []) {
      delete a.x;
      delete a.y;
    }
    for (const l of value.links) {
      delete l.aAnchor;
      delete l.bAnchor;
    }
    return JSON.stringify(value);
  }
  function travelHistory(redo = false) {
    if (staged || net.queue.length) {
      say("Finish or clear the current exchange before undo or redo.");
      return;
    }
    const stack = redo ? editHistory.future : editHistory.past;
    if (!stack.length) return;
    const beforeHistory = historySnapshot(),
      label = stack.at(-1).label,
      snapshot = redo ? editHistory.redo() : editHistory.undo();
    restoringHistory = true;
    try {
      const presentationOnly =
        configSignature(net.save()) === configSignature(snapshot.data);
      finishPlacement();
      drag = null;
      noteDrag = null;
      appGesture = null;
      if (presentationOnly) {
        net.notes = JSON.parse(JSON.stringify(snapshot.data.notes || []));
        for (const saved of snapshot.data.devices) {
          const d = net.device(saved.id);
          for (const k of presentationKeys) {
            if (saved[k] === undefined) delete d[k];
            else d[k] = JSON.parse(JSON.stringify(saved[k]));
          }
        }
        for (const saved of snapshot.data.applicationDrafts || []) {
          const a = net.applicationDrafts.find((x) => x.id === saved.id);
          a.x = saved.x;
          a.y = saved.y;
        }
        for (const saved of snapshot.data.links) {
          const l = net.links.find((x) => x.id === saved.id);
          for (const k of ["aAnchor", "bAnchor"]) {
            if (saved[k] === undefined) delete l[k];
            else l[k] = saved[k];
          }
        }
      } else {
        discard();
        net = terminalSessions.adopt(
          net,
          new NetworkExplorer.Network(snapshot.data),
        );
        examined = false;
      }
      candidateBase = snapshot.candidate;
      selected = snapshot.selected;
      if (
        selected &&
        !net.device(selected) &&
        !net.notes.some((n) => n.id === selected) &&
        !applications().some((a) => a.id === selected) &&
        !net.links.some((l) => l.id === selected)
      )
        selected = null;
      render();
      highlightHistoryChange(beforeHistory, snapshot, label);
      say(
        (redo ? "Redid: " : "Undid: ") +
          label +
          (presentationOnly ? "" : ". Learned state reset."),
      );
    } finally {
      restoringHistory = false;
      refreshHistoryButtons();
    }
  }

  function highlightHistoryChange(before, after, label) {
    const changed = [];
    for (const [collection, attribute] of [
      ["devices", "data-device"],
      ["notes", "data-note"],
      ["links", "data-link"],
      ["applicationDrafts", "data-application"],
    ]) {
      const old = new Map(
          (before.data[collection] || []).map((x) => [x.id, x]),
        ),
        now = new Map((after.data[collection] || []).map((x) => [x.id, x]));
      for (const id of new Set([...old.keys(), ...now.keys()]))
        if (JSON.stringify(old.get(id)) !== JSON.stringify(now.get(id)))
          changed.push({ id, attribute, old: old.get(id), item: now.get(id) });
    }
    const primary =
      changed.find((x) => x.item && x.id === after.selected) ||
      (changed.length === 1 && changed[0].item ? changed[0] : null);
    if (primary && selected !== primary.id) {
      selected = primary.id;
      openInspector();
      render();
    }
    const pulse = (el) => {
      if (!el) return;
      el.classList.remove("history-highlight");
      void el.getBoundingClientRect();
      el.classList.add("history-highlight");
      setTimeout(
        () => el.isConnected && el.classList.remove("history-highlight"),
        1800,
      );
    };
    const fieldId = label.startsWith("Edit ")
      ? label.slice(5).replace(/ /g, "-")
      : "";
    let field = fieldId ? $(fieldId) : null;
    if (field?.hidden) field = $(fieldId + "-toggle");
    if (fieldId === "note-text" && field?.closest("[hidden]"))
      field = $("inspector").querySelector(".note-inline-preview");
    if (field) {
      field.scrollIntoView({ block: "nearest" });
      pulse(field);
    } else if (primary) {
      const keys = Object.keys(primary.item).filter(
        (k) =>
          JSON.stringify(primary.old?.[k]) !== JSON.stringify(primary.item[k]),
      );
      const mapping = {
        name: "device-name",
        ip: "host-ip",
        prefix: "host-prefix",
        gateway: "host-gateway",
        dnsServerAddress: "host-dns",
        title: "note-title",
        text: "note-text",
        tags: "item-tags",
        color: "note-color-toggle",
        target: "note-target-toggle",
        os: "host-os-toggle",
        platform: "device-platform-toggle",
      };
      for (const key of keys) {
        let control = $(mapping[key]);
        if (key === "text" && control?.closest("[hidden]"))
          control = $("inspector").querySelector(".note-inline-preview");
        pulse(control);
      }
    }
    const canvas = $("canvas"),
      ns = "http://www.w3.org/2000/svg";
    $("history-canvas-highlight")?.remove();
    const overlay = document.createElementNS(ns, "g");
    overlay.id = "history-canvas-highlight";
    overlay.setAttribute("pointer-events", "none");
    overlay.setAttribute("aria-hidden", "true");
    canvas.append(overlay);
    for (const change of changed) {
      const node = canvas.querySelector(
        "[" + change.attribute + '="' + change.id + '"]',
      );
      const pinned = document.querySelector(
        '[data-pinned-note="' + change.id + '"]',
      );
      if (pinned) {
        pulse(pinned);
        continue;
      }
      if (node && change.attribute === "data-link") {
        const line = node.cloneNode(true);
        line.removeAttribute("data-link");
        line.classList.add("history-link-highlight");
        overlay.append(line);
        continue;
      }
      const item = change.item || change.old;
      if (!Number.isFinite(item?.x) || !Number.isFinite(item?.y)) continue;
      const note = change.attribute === "data-note",
        rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", item.x + (note ? -4 : -50));
      rect.setAttribute("y", item.y + (note ? -4 : -43));
      rect.setAttribute("width", note ? 40 : 100);
      rect.setAttribute("height", note ? 44 : 90);
      rect.setAttribute("rx", note ? 8 : 14);
      rect.classList.add("history-item-highlight");
      if (!change.item) rect.classList.add("history-removed");
      overlay.append(rect);
      if (changed.length === 1 && node) {
        const r = node.getBoundingClientRect(),
          v = canvas.getBoundingClientRect();
        if (
          r.right < v.left ||
          r.left > v.right ||
          r.bottom < v.top ||
          r.top > v.bottom
        )
          canvas.dispatchEvent(
            new CustomEvent("network-locate", { detail: item }),
          );
      }
    }
    setTimeout(() => overlay.remove(), 1800);
  }
  function bindHistoryEvents(doc) {
    let pointerBefore = null,
      pointerLabel = "Move item";
    const labelFor = (e) => {
      if (placingNote && e.target.closest("#canvas")) return "Add note";
      if (placing && e.target.closest("#canvas"))
        return (
          "Add " +
          (placing.kind === "application"
            ? appLabel(placing.type)
            : placing.type)
        );
      const t =
        e.target.closest(
          "button,input,textarea,select,[data-device],[data-application],[data-note]",
        ) || e.target;
      if (t.matches("input,textarea,select"))
        return "Edit " + (t.id || "field").replace(/-/g, " ");
      if (t.matches("[data-device],[data-application],[data-note]"))
        return "Move item";
      return (
        (t.getAttribute("aria-label") || t.textContent || "Edit network")
          .trim()
          .slice(0, 65) || "Edit network"
      );
    };
    const ignored = (e) =>
      restoringHistory ||
      staged ||
      net.queue.length ||
      e.target.closest("#undo-network,#redo-network");
    doc.addEventListener(
      "pointerdown",
      (e) => {
        if (ignored(e) || e.button !== 0) return;
        editHistory.breakGroup();
        pointerBefore = historySnapshot();
        pointerLabel = labelFor(e);
      },
      true,
    );
    const finishPointer = () => {
      if (!pointerBefore) return;
      const before = pointerBefore;
      pointerBefore = null;
      setTimeout(() => recordHistory(before, pointerLabel), 0);
    };
    doc.addEventListener("pointerup", finishPointer, true);
    doc.addEventListener("pointercancel", finishPointer, true);
    for (const type of ["click", "input", "change", "submit", "keydown"])
      doc.addEventListener(
        type,
        (e) => {
          if (ignored(e)) return;
          if (type === "keydown") {
            const edit = e.target.closest(
              "input,textarea,[contenteditable=true]",
            );
            if (
              (e.ctrlKey || e.metaKey) &&
              !e.altKey &&
              !edit &&
              ["z", "y"].includes(e.key.toLowerCase())
            ) {
              e.preventDefault();
              e.stopImmediatePropagation();
              travelHistory(e.key.toLowerCase() === "y" || e.shiftKey);
              return;
            }
            if (edit) return;
            if (
              ![
                "Enter",
                "Delete",
                "Backspace",
                "ArrowUp",
                "ArrowDown",
                "ArrowLeft",
                "ArrowRight",
              ].includes(e.key)
            )
              return;
          }
          if (pointerBefore) return;
          const before = historySnapshot(),
            group = type === "input" ? selected + ":" + e.target.id : null,
            label = labelFor(e);
          setTimeout(() => recordHistory(before, label, group), 0);
        },
        true,
      );
    doc.addEventListener("focusout", () => editHistory.breakGroup(), true);
  }

  let placingNote = false,
    noteDrag = null;
  let subnetMode = "off";
  const dhcpStatusRequested = new WeakSet();
  const devicePlatform = (d = net.device(selected)) =>
    d?.platform === "paloalto" ? "paloalto" : "cisco";
  const isPan = (d) => devicePlatform(d) === "paloalto";
  const vlanLabel = (d, id) =>
    isPan(d) ? NetworkExplorerPlatform.vlanName(d, id) : "V" + id;
  function configurationChange(fn) {
    const before = net.save();
    fn();
    if (candidateBase) {
      candidateBase.devices = candidateBase.devices.filter((d) =>
        net.device(d.id),
      );
      if (!candidateBase.devices.length) candidateBase = null;
    }
    for (const old of before.devices) {
      const d = net.device(old.id);
      if (d && isPan(d) && JSON.stringify(old) !== JSON.stringify(d)) {
        candidateBase ??= { devices: [] };
        if (!candidateBase.devices.some((x) => x.id === d.id))
          candidateBase.devices.push(old);
      }
    }
  }
  function committedNetwork() {
    const data = net.save();
    data.devices = data.devices.map(
      (d) => candidateBase?.devices.find((x) => x.id === d.id) || d,
    );
    return new NetworkExplorer.Network(data);
  }
  function finishCandidate(revert, deviceId = selected) {
    if (!editable()) return false;
    const old = candidateBase?.devices.find((d) => d.id === deviceId);
    if (old) {
      if (revert) {
        const d = net.device(deviceId),
          layout = { x: d.x, y: d.y, watch: d.watch, watchDecisions: d.watchDecisions };
        net.devices[net.devices.indexOf(d)] = { ...old, ...layout };
      }
      candidateBase.devices = candidateBase.devices.filter(
        (d) => d.id !== deviceId,
      );
      if (!candidateBase.devices.length) candidateBase = null;
      net.reset();
      examined = false;
      render();
    }
    return true;
  }
  function commitConfiguration(deviceId = selected) {
    return finishCandidate(false, deviceId);
  }
  function revertConfiguration(deviceId = selected) {
    return finishCandidate(true, deviceId);
  }
  const say = (text) => {
    $("message").textContent = text;
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => ($("message").textContent = ""), 6500);
  };
  const terminalSessions = new NetworkExplorerTerminal.TerminalSessions();
  let terminalDevice = null,
    terminalSession = null;
  let commandHistory = [],
    historyIndex = 0,
    commandDraft = "";
  function terminalState(id) {
    return terminalSessions.get(net, id);
  }
  function cliDevice() {
    const device = net.device(selected);
    if (device) return device;
    // These applications have inspectors, but no consoles of their own.
    if (applications().some(app => app.id === selected) &&
        terminalSession === terminalState(terminalDevice))
      return net.device(terminalDevice);
    return null;
  }
  function switchTerminal() {
    const id = cliDevice()?.id || null;
    if (terminalSession === terminalState(id) && terminalDevice === id) return;
    if (terminalSession) {
      Object.assign(terminalSession, {
        text: $("terminal").textContent,
        history: commandHistory,
        index: historyIndex,
        draft: commandDraft,
        input: $("command").value,
        scroll: (
          externalPanels.get("terminal")?.host.querySelector("#terminal") ||
          $("terminal")
        ).scrollTop,
      });
    }
    terminalDevice = id;
    terminalSession = terminalState(id);
    commandHistory = terminalSession.history;
    historyIndex = terminalSession.index;
    commandDraft = terminalSession.draft;
    $("terminal").textContent = terminalSession.text;
    $("command").value = terminalSession.input;
    $("terminal").scrollTop = terminalSession.scroll;
  }
  const output = (text, id = cliDevice()?.id || null) => {
    const state = terminalState(id);
    state.text += "\n" + text;
    state.scroll = Number.MAX_SAFE_INTEGER;
    if (terminalSession === state && terminalDevice === id) {
      $("terminal").textContent = state.text;
      $("terminal").scrollTop = $("terminal").scrollHeight;
    }
    syncExternal();
  };
  const safely = (fn) => {
    try {
      fn();
    } catch (e) {
      say(e.message);
    }
  };
  const arrivedFlights = new Set();
  let flightPaused = false,
    phaseCallback = null,
    phaseRemaining = 0,
    phaseDeadline = 0;
  let fastForwarding = false,
    simulationExamining = false;
  function updatePauseControl() {
    refreshHistoryButtons();
    const immediate = $("speed").value === "0";
    const fast = $("fast-forward");
    if (fast) {
      fast.hidden = immediate;
      fast.disabled = immediate || fastForwarding || !(staged || net.queue.length);
    }
    const button = $("pause-animation");
    if (!button) return;
    button.hidden = immediate;
    button.disabled = !phaseCallback;
    button.setAttribute("aria-pressed", String(flightPaused));
    button.title = flightPaused ? "Resume animation" : "Pause animation";
    button.setAttribute("aria-label", button.title);
    button.innerHTML = flightPaused
      ? '<svg class="playback-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>'
      : '<svg class="playback-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
    $("traffic").classList.toggle("flight-paused", flightPaused);
  }
  function schedulePhase(callback, delay) {
    clearTimeout(timer);
    phaseCallback = callback;
    phaseRemaining = delay;
    phaseDeadline = performance.now() + delay;
    if (!flightPaused)
      timer = setTimeout(() => {
        phaseCallback = null;
        timer = null;
        updatePauseControl();
        callback();
      }, delay);
    updatePauseControl();
  }
  function stop() {
    running = false;
    clearTimeout(timer);
    timer = null;
    phaseCallback = null;
    flightPaused = false;
    $("canvas")?.unpauseAnimations();
    $("flight-inspection")?.close();
    updatePauseControl();
  }

  const cliContexts = new Map();
  function cliContext(d) {
    if (!cliContexts.has(d.id)) cliContexts.set(d.id, { mode: "exec" });
    return cliContexts.get(d.id);
  }
  function cliPrompt(d) {
    const c = cliContext(d);
    if (isPan(d) && d.type !== "host")
      return (
        "admin@" + d.name.replace(/\s+/g, "-") + (c.mode === "exec" ? ">" : "#")
      );
    return (
      d.name +
      (c.mode === "exec"
        ? " >"
        : c.mode === "config"
          ? "(config)#"
          : c.mode === "vlan"
            ? "(config-vlan)#"
            : "(config-if)#")
    );
  }
  function discard() {
    appConnecting = null;
    appGesture = null;
    arrivedFlights.clear();
    cliContexts.clear();
    finishPlacement();
    stop();
    staged = null;
    $("traffic").replaceChildren();
    if ($("examine").open) $("examine").close();
  }
  function editable() {
    if (net.queue.length || staged) {
      say(
        "Finish the exchange or clear learned state before changing the network.",
      );
      inspector();
      return false;
    }
    return true;
  }
  function mutate(fn) {
    if (!editable()) return;
    safely(() => {
      configurationChange(fn);
      net.reset();
      examined = false;
      render();
    });
  }
  function expiryMarkup(expiresAt, lifetime = 120) {
    if (!Number.isFinite(expiresAt)) return "&mdash;";
    const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    return (
      '<span class="cache-countdown" data-expires-at="' +
      expiresAt +
      '" data-lifetime="' +
      lifetime +
      '" title="Expires after ' +
      lifetime +
      ' seconds of real time"><svg viewBox="0 0 20 20" aria-hidden="true"><circle class="countdown-track" cx="10" cy="10" r="7"/><circle class="countdown-progress" cx="10" cy="10" r="7" pathLength="120" stroke-dasharray="' +
      Math.min(120, (seconds / lifetime) * 120) +
      ' 120"/></svg><span>' +
      seconds +
      "s</span></span>"
    );
  }
  function refreshCountdowns(root = document) {
    root.querySelectorAll("[data-expires-at]").forEach((el) => {
      const seconds = Math.max(
        0,
        Math.ceil((Number(el.dataset.expiresAt) - Date.now()) / 1000),
      );
      el.querySelector("span").textContent = seconds + "s";
      el.querySelector(".countdown-progress").setAttribute(
        "stroke-dasharray",
        Math.min(120, (seconds / Number(el.dataset.lifetime || 120)) * 120) +
          " 120",
      );
    });
  }
  function table(rows, kind) {
    const values = Object.entries(rows || {});
    return values.length
      ? "<table><thead><tr>" +
          (kind === "switch" ? "<th>VLAN</th>" : "") +
          "<th>" +
          (kind === "switch" ? "MAC address" : "IPv4 address") +
          "</th><th>" +
          (kind === "switch" ? "Port" : "MAC address") +
          "</th>" +
          (kind === "router" ? "<th>Interface</th>" : "") +
          '<th title="Remaining real time; entries expire even while idle">Expires in</th></tr></thead><tbody>' +
          values
            .map(
              ([key, v]) =>
                '<tr data-table-mac="' +
                esc(v.mac || key) +
                '" tabindex="0">' +
                (kind === "switch"
                  ? "<td>" + esc(v.vlanLabel ?? (v.vlan || 1)) + "</td>"
                  : "") +
                "<td>" +
                esc(kind === "switch" ? v.mac || key : v.ip || key) +
                "</td><td>" +
                esc(v.port || v.mac) +
                "</td>" +
                (kind === "router"
                  ? "<td>" + esc(v.interfaceName || v.interface) + "</td>"
                  : "") +
                '<td class="table-expiry">' +
                expiryMarkup(v.expiresAt) +
                "</td></tr>",
            )
            .join("") +
          "</tbody></table>"
      : '<p class="hint">No learned entries.</p>';
  }
  function visibleTable(rows, d) {
    if (d.type === "router")
      return Object.fromEntries(
        Object.entries(rows || {}).map(([k, v]) => [
          k,
          {
            ...v,
            interfaceName:
              d.ports.find((p) => p.id === v.interface)?.name || v.interface,
          },
        ]),
      );
    if (d.type !== "switch") return rows;
    return Object.fromEntries(
      Object.entries(rows || {}).map(([k, v]) => [
        k,
        {
          ...v,
          vlanLabel: isPan(d)
            ? NetworkExplorerPlatform.vlanName(d, v.vlan || 1)
            : v.vlan || 1,
          port: d.ports.find((p) => p.id === v.port)?.name || v.port,
        },
      ]),
    );
  }
  function hostOsLogo(d) {
    const os = d.os || "windows";
    const logos = {
      windows:
        '<path fill="#1676d2" d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z"/>',
      linux:
        '<ellipse cx="12" cy="13" rx="7" ry="9" fill="#263342"/><circle cx="12" cy="6" r="5" fill="#263342"/><ellipse cx="12" cy="15" rx="4.7" ry="6" fill="#fff"/><ellipse cx="10" cy="6" rx="1.5" ry="2" fill="#fff"/><ellipse cx="14" cy="6" rx="1.5" ry="2" fill="#fff"/><circle cx="10.4" cy="6.3" r=".65" fill="#263342"/><circle cx="13.6" cy="6.3" r=".65" fill="#263342"/><path fill="#efa923" d="m9 9 3-2 3 2-3 2zM3 21l5-3 3 4-7 1zM21 21l-5-3-3 4 7 1z"/>',
      macos:
        '<path fill="#354559" d="M15 5c0-2 1.5-4 4-4 0 2-1.5 4-4 4ZM12 7c-2-2-6-2-8 1-3 4 0 11 3 14 2 2 3-1 5-1s3 3 5 1c2-2 3-4 4-6-4-2-4-6-1-8-2-3-5-3-8-1Z"/>',
    };
    return (
      '<g class="host-os-logo" data-host-os="' +
      os +
      '" transform="translate(-18,-18) scale(.85)" stroke="none">' +
      logos[os] +
      "</g>"
    );
  }
  function routerIcon() {
    return '<path d="M-37-7v19c0 9 17 16 37 16s37-7 37-16V-7Z" fill="#b4cada" stroke="#3b5278" stroke-width="2"/><path d="M0 9v18c20 0 37-7 37-15V-7Z" fill="#93afc7"/><path d="M-37-7v19c0 9 17 16 37 16s37-7 37-16V-7" fill="none" stroke="#3b5278" stroke-width="2"/><ellipse cx="0" cy="-7" rx="37" ry="17" fill="#edf4fa" stroke="#3b5278" stroke-width="2"/><g stroke="#3b5278" stroke-width="2.3" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M-26-7h18m-5-5 5 5-5 5M26-7H8m5-5-5 5 5 5M0-8v-13m-5 5 5-5 5 5M0-4V7m-5-5 5 5 5-5"/></g><path d="M-27 14c5 3 10 4 15 5" fill="none" stroke="#e7f0f7" stroke-width="2" stroke-linecap="round"/>';
  }
  function routeRows(d, rows, selectedRoute, editableRows = false) {
    return rows.length
      ? '<div class="route-table-wrap"><table class="route-table"><thead><tr><th>Network</th><th>Next hop</th><th>Interface</th>' +
          (editableRows
            ? '<th><span class="sr-only">Actions</span></th>'
            : "") +
          "</tr></thead><tbody>" +
          rows
            .map((r) => {
              const chosen =
                selectedRoute &&
                r.type === selectedRoute.type &&
                r.network === selectedRoute.network &&
                r.prefix === selectedRoute.prefix &&
                r.nextHop === selectedRoute.nextHop;
              return (
                '<tr class="' +
                (chosen ? "route-selected" : "") +
                (!r.active ? " route-inactive" : "") +
                '" data-route-port data-device-port="' + esc(d.id + ":" + (r.port || "")) + '" tabindex="0"><td>' +
                esc(r.network + "/" + r.prefix) +
                "<small>" +
                esc(
                  r.type === "connected"
                    ? "Connected"
                    : "Static" + (!r.active ? " - inactive" : ""),
                ) +
                "</small></td><td>" +
                esc(r.nextHop || "Direct") +
                "</td><td>" +
                esc(d.ports.find((p) => p.id === r.port)?.name || "-") +
                "</td>" +
                (editableRows
                  ? "<td>" +
                    (r.type === "static"
                      ? '<button type="button" class="vlan-icon-button" data-edit-route="' +
                        esc(r.name) +
                        '" aria-label="Edit route ' +
                        esc(r.network + "/" + r.prefix) +
                        '" title="Edit route"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14Z"/></svg></button><button type="button" class="vlan-icon-button" data-delete-route="' +
                        esc(r.name) +
                        '" aria-label="Delete route ' +
                        esc(r.network + "/" + r.prefix) +
                        '" title="Delete route"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 10v7M14 10v7"/></svg></button>'
                      : "") +
                    "</td>"
                  : "") +
                "</tr>"
              );
            })
            .join("") +
          "</tbody></table></div>"
      : '<p class="hint">No routes. Configure an interface to add a connected route.</p>';
  }
  function natPanel(d) {
    const c = d.nat || { enabled: false, inside: [], outside: "" },
      rows = net.natTable[d.id] || [];
    return (
      '<div class="nat-panel"><div class="small-heading inspector-section-heading"><span>NAT / PAT</span><label class="examine-watch-control"><input id="nat-enabled" aria-label="Enable outbound NAT" role="switch" type="checkbox" ' +
      (c.enabled ? "checked" : "") +
      '><span class="watch-switch-track" aria-hidden="true"></span><span>Enabled</span></label></div><p class="hint">Set Inside or Outside / WAN in each port&#39;s settings.</p><div class="small-heading inspector-section-heading"><span>NAT translations</span></div><p class="hint">Mappings expire after 120 seconds of inactivity.</p><div class="nat-table"><table><thead><tr><th>Protocol</th><th>Inside</th><th>Outside</th><th>Remote</th><th>Expires</th></tr></thead><tbody>' +
      rows
        .map(
          (r) =>
            "<tr><td>" +
            esc(r.protocol) +
            "</td><td>" +
            esc(r.privateIp + ":" + (r.privatePort ?? r.probe)) +
            "</td><td>" +
            esc(
              r.publicIp +
                ":" +
                (r.protocol === "ICMP" ? r.probe : r.publicPort),
            ) +
            "</td><td>" +
            esc(r.remoteIp + (r.remotePort ? ":" + r.remotePort : "")) +
            "</td><td>" +
            expiryMarkup(r.expiresAt) +
            "</td></tr>",
        )
        .join("") +
      "</tbody></table>" +
      (rows.length ? "" : '<p class="hint">No active translations.</p>') +
      "</div></div>"
    );
  }
  function bindNat(d) {
    if (d.type !== "router" || d.firewallMode === "transparent") return;
    $("nat-enabled").onchange = () => {
      if (!editable()) {
        render();
        return;
      }
      safely(() =>
        configurationChange(() =>
          net.configureNat(d.id, {
            ...(d.nat || { inside: [], outside: "" }),
            enabled: $("nat-enabled").checked,
          }),
        ),
      );
      render();
    };
  }
  function natRoleMarkup(d, p) {
    const role =
      d.nat?.outside === p.id
        ? "outside"
        : d.nat?.inside.includes(p.id)
          ? "inside"
          : "none";
    return (
      '<label>NAT role<select id="port-nat-role">' +
      [
        ["none", "None"],
        ["inside", "Inside"],
        ["outside", "Outside / WAN"],
      ]
        .map(
          ([value, label]) =>
            '<option value="' +
            value +
            '" ' +
            (role === value ? "selected" : "") +
            ">" +
            label +
            "</option>",
        )
        .join("") +
      "</select></label>"
    );
  }
  function routePanel(d) {
    return (
      '<div class="small-heading inspector-section-heading"><span>Routing table</span><button id="show-add-route" type="button" class="vlan-icon-button" aria-label="Add static route" title="Add static route" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div>' +
      routeRows(d, net.routes(d.id, true), null, true) +
      '<form id="route-form" class="route-form" hidden><label ' +
      (!isPan(d) ? "hidden" : "") +
      '>Name<input id="route-name" maxlength="40" placeholder="remote-lan"></label><div class="route-destination"><label>Network<input id="route-network" placeholder="192.168.2.0" required></label><label>Prefix<input id="route-prefix" type="number" min="0" max="32" value="24" required></label></div><label>Next hop<input id="route-hop" placeholder="10.0.0.2" required></label><div class="route-form-actions"><button class="vlan-icon-button" type="submit" aria-label="Save static route" title="Save route"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l4 4v14H3V3h2ZM7 3v6h10V3M7 21v-8h10v8"/></svg></button><button id="cancel-route" class="vlan-icon-button" type="button" aria-label="Cancel route" title="Cancel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div></form>'
    );
  }
  function bindRoutes(d) {
    if (d.type !== "router" || d.firewallMode === "transparent") return;
    let editing = null;
    const open = (r) => {
      editing = r?.name || null;
      $("route-form").hidden = false;
      $("show-add-route").setAttribute("aria-expanded", "true");
      $("route-name").value = r?.name || "";
      $("route-name").readOnly = !!editing;
      $("route-network").value = r?.network || "";
      $("route-prefix").value = r?.prefix ?? 24;
      $("route-hop").value = r?.nextHop || "";
      $("route-network").focus();
    };
    $("show-add-route").onclick = () => open(null);
    $("cancel-route").onclick = () => {
      $("route-form").hidden = true;
      $("show-add-route").setAttribute("aria-expanded", "false");
      $("show-add-route").focus();
    };
    $("route-form").onsubmit = (e) => {
      e.preventDefault();
      mutate(() =>
        net.setStaticRoute(
          d.id,
          $("route-network").value.trim(),
          Number($("route-prefix").value),
          $("route-hop").value.trim(),
          editing || $("route-name").value.trim() || undefined,
        ),
      );
    };
    $("inspector")
      .querySelectorAll("[data-delete-route]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            confirmRemoval(
              "Delete route " + b.dataset.deleteRoute + " from " + d.name + "?",
              () => net.removeStaticRoute(d.id, b.dataset.deleteRoute),
            )),
      );
    $("inspector")
      .querySelectorAll("[data-edit-route]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            open(d.staticRoutes.find((r) => r.name === b.dataset.editRoute))),
      );
  }
  function icon(d) {
    if (d.type === "firewall" || d.role === "firewall") return NetworkExplorerFirewallUI.glyph();
    if (d.type === "router") return routerIcon() + (d.firewall?.enabled ? '<g transform="translate(25 -17) scale(.35)">' + NetworkExplorerFirewallUI.glyph() + "</g>" : "");
    return d.type === "host"
      ? '<rect x="-31" y="-24" width="46" height="34" rx="3" fill="#fff" stroke="currentColor" stroke-width="2"/><rect x="-27" y="-20" width="38" height="25" rx="1" fill="#cce4f5"/>' +
          hostOsLogo(d) +
          '<path d="M-8 10v9m-12 0h24" stroke="currentColor" stroke-width="3"/><rect x="21" y="-24" width="16" height="45" rx="3" fill="#dce8f1" stroke="currentColor" stroke-width="2"/><path d="M25-17h8m-8 5h8m-8 5h8" stroke="currentColor"/><circle cx="29" cy="12" r="2" fill="#287d78"/><path d="M-30 26h47l5 5h-57z" fill="#dce8f1" stroke="currentColor"/>'
      : '<path d="M-36-14l7-10h58l7 10" fill="#b9ddd6" stroke="currentColor" stroke-width="2"/><rect x="-37" y="-14" width="74" height="37" rx="4" fill="#f1faf7" stroke="currentColor" stroke-width="2"/><path d="M-32-7h18m-18 4h12" stroke="currentColor"/><circle cx="27" cy="-6" r="2" fill="#44a482"/>' +
          Array.from({ length: 8 }, (_, i) => {
            const x = -29 + (i % 4) * 16,
              y = 3 + Math.floor(i / 4) * 9;
            return (
              '<rect x="' +
              x +
              '" y="' +
              y +
              '" width="11" height="7" rx="1" fill="#245b58"/><path d="M' +
              (x + 3) +
              " " +
              (y + 1) +
              'v2m3-2v2" stroke="#afd7c7" stroke-width="1"/>'
            );
          }).join("");
  }
  function portPosition(d, id, side) {
    const anchor =
      side ||
      (["top", "left", "bottom", "right"].includes(id)
        ? id
        : d.type === "host"
          ? "right"
          : "left");
    const offset = {
      top: [0, -33],
      left: [-41, 0],
      bottom: [0, 33],
      right: [41, 0],
    }[anchor];
    return { x: d.x + offset[0], y: d.y + offset[1] };
  }
  function occupied(device, port) {
    return net.links.some(
      (l) =>
        (l.a === device && l.ap === port) || (l.b === device && l.bp === port),
    );
  }
  function drawAnchors() {
    $("anchors").innerHTML = net.devices
      .flatMap((d) =>
        ["top", "left", "bottom", "right"].map((side) => {
          const q = portPosition(d, side);
          return (
            '<g class="port-anchor available" data-anchor-device="' +
            esc(d.id) +
            '" data-anchor-port="' +
            side +
            '" transform="translate(' +
            q.x +
            "," +
            q.y +
            ')" tabindex="0" role="button" aria-label="' +
            esc(d.name + " " + side + " connection anchor") +
            '"><title>' +
            esc(d.name + " / " + side + " - shared connection anchor") +
            '</title><circle class="port-hit" r="10" fill="transparent"/><circle class="port-dot" r="5"/></g>'
          );
        }),
      )
      .join("");
  }
  let hoveredDevice = null;
  function revealAnchors(id) {
    hoveredDevice = id;
    $("anchors")
      .querySelectorAll("[data-anchor-device]")
      .forEach((a) =>
        a.classList.toggle("anchor-visible", a.dataset.anchorDevice === id),
      );
  }
  let cableGesture = null;
  function previewCable(p) {
    if (!endpoint) return;
    const a = portPosition(net.device(endpoint.device), endpoint.port);
    $("cable-preview").innerHTML =
      '<line x1="' +
      a.x +
      '" y1="' +
      (a.y - 15) +
      '" x2="' +
      p.x +
      '" y2="' +
      p.y +
      '" stroke="#287d78" stroke-width="3" stroke-dasharray="7 5"/>';
  }
  function pickAnchor(anchor) {
    if (!editable()) return;
    const device = anchor.dataset.anchorDevice,
      side = anchor.dataset.anchorPort;
    if (endpoint) {
      if (endpoint.device === device) {
        say("Choose an anchor on a different device.");
        return;
      }
      const source = net.device(endpoint.device),
        destination = net.device(device);
      if (
        [source, destination].some(
          (d) => !d.ports.some((p) => p.enabled && !occupied(d.id, p.id)),
        )
      ) {
        say("Each endpoint needs an enabled, available Ethernet port.");
        return;
      }
      pendingCable = {
        source: source.id,
        destination: destination.id,
        aAnchor: endpoint.port,
        bAnchor: side,
        ports: {},
      };
      previewCable(portPosition(destination, side));
      nextCablePort();
      return;
    }
    endpoint = { device, port: side };
    connecting = true;
    $("cancel-connect").hidden = false;
    $("connection-hint").textContent =
      "Drop on another anchor, or click it. Escape cancels.";
    previewCable(portPosition(net.device(device), side));
  }
  // Pick physical interfaces separately from the shared canvas anchors.
  let pendingCable = null;
  const portPicker = document.createElement("dialog");
  portPicker.id = "port-picker";
  portPicker.setAttribute("aria-labelledby", "port-picker-title");
  document.body.append(portPicker);
  function nextCablePort() {
    if (!pendingCable) return;
    for (const key of ["source", "destination"]) {
      if (pendingCable.ports[key]) continue;
      const d = net.device(pendingCable[key]);
      if (d.type === "host" && d.ports.length === 1) {
        pendingCable.ports[key] = d.ports[0].id;
        continue;
      }
      portPicker.innerHTML =
        '<h2 id="port-picker-title">' +
        esc(d.name) +
        '</h2><p class="hint">Choose an available port for this cable.</p>' +
        interfacePanel(d) +
        '<button id="cancel-port-picker">Cancel connection</button>';
      portPicker.querySelector(".small-heading").remove();
      portPicker
        .querySelector(".interface-chassis")
        .previousElementSibling.remove();
      portPicker.querySelectorAll("[data-port]").forEach((button) => {
        const p = d.ports.find((p) => p.id === button.dataset.port),
          used = occupied(d.id, p.id);
        const state = used ? "In use" : p.enabled ? "Available" : "Disabled";
        button.disabled = used || !p.enabled;
        button.removeAttribute("aria-pressed");
        button.classList.toggle("occupied", used);
        button.setAttribute("aria-label", p.name + " - " + state);
        button.title = p.name + " - " + state;
        button.onclick = () => {
          pendingCable.ports[key] = p.id;
          nextCablePort();
        };
      });
      $("cancel-port-picker").onclick = cancelConnect;
      if (!portPicker.open) portPicker.showModal();
      const anchor = svg.querySelector(
        '[data-anchor-device="' +
          d.id +
          '"][data-anchor-port="' +
          pendingCable[key === "source" ? "aAnchor" : "bAnchor"] +
          '"]',
      );
      const bounds = anchor.getBoundingClientRect();
      portPicker.style.left =
        Math.max(
          8,
          Math.min(
            bounds.right + 12,
            document.documentElement.clientWidth - portPicker.offsetWidth - 8,
          ),
        ) + "px";
      portPicker.style.top =
        Math.max(
          8,
          Math.min(
            bounds.top,
            window.innerHeight - portPicker.offsetHeight - 8,
          ),
        ) + "px";
      portPicker.querySelector("[data-port]:not(:disabled)")?.focus();
      return;
    }
    const cable = pendingCable;
    try {
      const link = net.connect(
        cable.source,
        cable.ports.source,
        cable.destination,
        cable.ports.destination,
      );
      link.aAnchor = cable.aAnchor;
      link.bAnchor = cable.bAnchor;
      cancelConnect();
      examined = false;
      render();
    } catch (e) {
      cancelConnect();
      say(e.message);
    }
  }
  portPicker.addEventListener("cancel", (e) => {
    e.preventDefault();
    cancelConnect();
  });
  function cablePath(l) {
    const a = net.device(l.a),
      b = net.device(l.b);
    const facing = (from, to) =>
      Math.abs(to.x - from.x) > Math.abs(to.y - from.y)
        ? to.x > from.x
          ? "right"
          : "left"
        : to.y > from.y
          ? "bottom"
          : "top";
    l.aAnchor = l.aAnchor || facing(a, b);
    l.bAnchor = l.bAnchor || facing(b, a);
    const start = portPosition(a, l.ap, l.aAnchor),
      end = portPosition(b, l.bp, l.bAnchor);
    const vector = {
      top: [0, -1],
      left: [-1, 0],
      bottom: [0, 1],
      right: [1, 0],
    };
    const av = vector[l.aAnchor],
      bv = vector[l.bAnchor],
      reach = Math.max(
        60,
        Math.min(140, Math.hypot(end.x - start.x, end.y - start.y) * 0.35),
      );
    return {
      start,
      end,
      c1: { x: start.x + av[0] * reach, y: start.y + av[1] * reach },
      c2: { x: end.x + bv[0] * reach, y: end.y + bv[1] * reach },
    };
  }
  function pathData(p, reverse = false) {
    const a = reverse ? p.end : p.start,
      b = reverse ? p.start : p.end,
      c = reverse ? p.c2 : p.c1,
      d = reverse ? p.c1 : p.c2;
    return (
      "M" +
      a.x +
      "," +
      a.y +
      " C" +
      c.x +
      "," +
      c.y +
      " " +
      d.x +
      "," +
      d.y +
      " " +
      b.x +
      "," +
      b.y
    );
  }

  function subnetColor(cidr) {
    let hash = 0;
    for (const c of cidr) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
    return "hsl(" + (hash % 360) + " 48% 48%)";
  }
  function subnetOutsideRouters(cidr) {
    return net.devices
      .filter(
        (d) =>
          d.type === "router" &&
          d.nat?.enabled &&
          NetworkExplorerSubnets.outsideSubnets(net, d).has(cidr),
      )
      .map((d) => d.name);
  }
  function subnetLabel(cidr) {
    return cidr + (subnetOutsideRouters(cidr).length ? " - Outside" : "");
  }
  function drawSubnetClouds() {
    const canvas = $("canvas");
    let layer = $("subnet-clouds");
    if (!layer) {
      layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      layer.id = "subnet-clouds";
      layer.setAttribute("pointer-events", "none");
      canvas.prepend(layer);
    }
    const groups = NetworkExplorerSubnets.groups(net);
    if (
      !["off", "all", "inside", "outside"].includes(subnetMode) &&
      !groups.some((g) => g.cidr === subnetMode)
    )
      subnetMode = "off";
    layer.innerHTML =
      subnetMode === "off"
        ? ""
        : groups
            .filter(
              (g) =>
                subnetMode === "all" ||
                g.cidr === subnetMode ||
                (subnetMode === "outside" &&
                  subnetOutsideRouters(g.cidr).length > 0) ||
                (subnetMode === "inside" &&
                  subnetOutsideRouters(g.cidr).length === 0),
            )
            .map((g) => {
              const points = g.ids.map((id) => net.device(id)),
                top = points.reduce((a, b) => (a.y < b.y ? a : b));
              return (
                '<g class="subnet-cloud" data-subnet="' +
                esc(g.cidr) +
                '" data-members="' +
                esc(points.map((d) => d.name).join(", ")) +
                '" style="--subnet-color:' +
                subnetColor(g.cidr) +
                '"><path d="' +
                NetworkExplorerSubnets.cloud(points) +
                '"/>' +
                (subnetOutsideRouters(g.cidr).length
                  ? '<text class="subnet-outside-label" x="' +
                    top.x +
                    '" y="' +
                    (top.y - 75) +
                    '" text-anchor="middle">' +
                    esc(subnetLabel(g.cidr)) +
                    "</text>"
                  : "") +
                "</g>"
              );
            })
            .join("");
    refreshSubnetPicker(groups);
  }

  function installSubnetTooltip() {
    const canvas = $("canvas"),
      tip = document.createElement("div");
    tip.id = "subnet-tooltip";
    tip.setAttribute("role", "dialog");
    tip.setAttribute("aria-label", "Subnet details");
    tip.hidden = true;
    document.body.append(tip);
    let hideTimer,
      showTimer,
      shownSubnets = "";
    const hoverDelay = 600;
    const hide = () => {
        clearTimeout(hideTimer);
        clearTimeout(showTimer);
        shownSubnets = "";
        tip.hidden = true;
      },
      scheduleHide = () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
        hideTimer = setTimeout(hide, 300);
      };
    tip.addEventListener("pointerenter", () => clearTimeout(hideTimer));
    tip.addEventListener("pointerleave", scheduleHide);
    tip.addEventListener("focusin", () => clearTimeout(hideTimer));
    tip.addEventListener("focusout", (e) => {
      if (!tip.contains(e.relatedTarget)) scheduleHide();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (e.buttons) {
        hide();
        return;
      }
      if (e.target.closest("[data-device],[data-note],[data-link],.node")) {
        scheduleHide();
        return;
      }
      const matrix = canvas.getScreenCTM();
      if (!matrix) {
        hide();
        return;
      }
      const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(
          matrix.inverse(),
        ),
        hits = [...canvas.querySelectorAll(".subnet-cloud")].filter((g) =>
          g.querySelector("path").isPointInFill(point),
        );
      if (!hits.length) {
        scheduleHide();
        return;
      }
      clearTimeout(hideTimer);
      const hitKey = hits
        .map((g) => g.dataset.subnet)
        .sort()
        .join("|");
      if (!tip.hidden && shownSubnets === hitKey) return;
      tip.hidden = true;
      clearTimeout(showTimer);
      // Wait for the pointer to settle, including inside overlapping clouds.
      showTimer = setTimeout(() => {
        if (hits.some((g) => !g.isConnected)) return;
        shownSubnets = hitKey;
        tip.replaceChildren();
        const heading = document.createElement("strong");
        heading.textContent =
          hits.length > 1 ? "Overlapping subnet highlights" : "Subnet";
        tip.append(heading);
        for (const g of hits) {
          const row = document.createElement("div");
          row.className = "subnet-tooltip-row";
          const dot = document.createElement("span");
          dot.className = "subnet-swatch";
          dot.style.background = subnetColor(g.dataset.subnet);
          const text = document.createElement("div"),
            name = document.createElement("strong"),
            members = document.createElement("small");
          name.textContent = subnetLabel(g.dataset.subnet);
          if (subnetOutsideRouters(g.dataset.subnet).length)
            name.title =
              "Outside network of " +
              subnetOutsideRouters(g.dataset.subnet).join(", ");
          members.textContent = g.dataset.members;
          text.append(name);
          const info = NetworkExplorerSubnets.details(g.dataset.subnet),
            grid = document.createElement("dl");
          grid.className = "subnet-cidr-details";
          for (const [label, value] of [
            ["Subnet mask", info.mask],
            ["Network", info.network],
            [
              "Broadcast",
              info.broadcast ||
                (info.prefix === 31
                  ? "None (point-to-point)"
                  : "None (host route)"),
            ],
            [
              "Usable range",
              info.first === info.last
                ? info.first
                : info.first + " - " + info.last,
            ],
            ["Usable addresses", info.hosts.toLocaleString()],
          ]) {
            const term = document.createElement("dt"),
              definition = document.createElement("dd");
            term.textContent = label;
            definition.textContent = value;
            grid.append(term, definition);
          }
          text.append(grid, members);
          const examine = document.createElement("a"),
            url = new URL("cidr_viz.html", location.href);
          url.searchParams.set("ip", info.network);
          url.searchParams.set("mask", info.mask);
          examine.href = url.href;
          examine.target = "_blank";
          examine.rel = "noopener";
          examine.className = "subnet-examine";
          examine.innerHTML =
            'Examine in CIDR tool <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7M21 3 10 14M10 3H3v18h18v-7"/></svg>';
          examine.onclick = (e) => {
            e.preventDefault();
            window.open(
              url.href,
              "_blank",
              "popup=yes,width=1100,height=850,resizable=yes,scrollbars=yes,noopener",
            );
          };
          text.append(examine);
          row.append(dot, text);
          tip.append(row);
        }
        if (hits.length > 1) {
          const hint = document.createElement("small");
          hint.textContent =
            "Clouds overlap visually; the subnets remain separate. Routers can connect to several subnets through different interfaces.";
          tip.append(hint);
        }
        tip.hidden = false;
        tip.style.left =
          Math.max(
            8,
            Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8),
          ) + "px";
        tip.style.top =
          Math.max(
            8,
            Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8),
          ) + "px";
      }, hoverDelay);
    });
    canvas.addEventListener("pointerleave", scheduleHide);
    canvas.addEventListener("pointerdown", hide);
    canvas.addEventListener("wheel", hide);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hide();
    });
    document.addEventListener("scroll", hide, true);
  }
  function refreshSubnetPicker(groups) {
    const button = $("subnet-highlight"),
      list = $("subnet-options");
    if (!button) return;
    button.setAttribute(
      "aria-label",
      "Highlight subnets: " +
        (subnetMode === "off"
          ? "Off"
          : subnetMode === "all"
            ? "All subnets"
            : subnetMode === "inside"
              ? "All inside"
              : subnetMode === "outside"
                ? "All outside"
                : subnetMode),
    );
    button.classList.toggle("active", subnetMode !== "off");
    const signature =
      groups.map((g) => subnetLabel(g.cidr)).join("|") + "|" + subnetMode;
    if (list.dataset.signature === signature) return;
    list.dataset.signature = signature;
    list.replaceChildren();
    for (const option of [
      { value: "off", label: "Off" },
      { value: "all", label: "All subnets" },
      { value: "inside", label: "All inside" },
      { value: "outside", label: "All outside" },
      ...groups.map((g) => ({ value: g.cidr, label: subnetLabel(g.cidr) })),
    ]) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "option");
      b.setAttribute("aria-selected", String(subnetMode === option.value));
      b.dataset.value = option.value;
      b.innerHTML =
        '<span class="subnet-swatch" style="background:' +
        (option.value.includes("/")
          ? subnetColor(option.value)
          : ["all", "inside", "outside"].includes(option.value)
            ? "linear-gradient(120deg,#81b9c8,#b29bcb,#c9b77a)"
            : "transparent") +
        '"></span><span>' +
        esc(option.label) +
        '</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
      b.onclick = () => {
        subnetMode = option.value;
        list.hidden = true;
        button.setAttribute("aria-expanded", "false");
        drawSubnetClouds();
        button.focus();
      };
      list.append(b);
    }
  }
  function draw() {
    drawSubnetClouds();
    drawNotes();
    drawCapacityMonitors();
    $("links").innerHTML = net.links
      .map((l) => {
        const route = cablePath(l),
          handle = {
            x:
              (route.start.x + 3 * route.c1.x + 3 * route.c2.x + route.end.x) /
              8,
            y:
              (route.start.y + 3 * route.c1.y + 3 * route.c2.y + route.end.y) /
              8,
          };
        const da = net.device(l.a),
          db = net.device(l.b),
          a = { ...da, ...portPosition(da, l.ap, l.aAnchor) },
          b = { ...db, ...portPosition(db, l.bp, l.bAnchor) };
        const enabled =
          l.enabled &&
          a.ports.find((p) => p.id === l.ap).enabled &&
          b.ports.find((p) => p.id === l.bp).enabled;
        return (
          '<g class="wire" data-link="' +
          esc(l.id) +
          '" tabindex="0" role="button" aria-label="Cable ' +
          esc(a.name) +
          " to " +
          esc(b.name) +
          '"><path d="' +
          pathData(route) +
          '" fill="none" stroke="transparent" stroke-width="20"/><path d="' +
          pathData(route) +
          '" fill="none" stroke="' +
          (selected === l.id ? "#287d78" : "#9ab0c2") +
          '" stroke-width="' +
          (selected === l.id ? 4 : 2) +
          '" ' +
          (enabled ? "" : 'stroke-dasharray="8 6"') +
          '/><text x="' +
          (a.x * 0.7 + b.x * 0.3) +
          '" y="' +
          (a.y * 0.7 + b.y * 0.3 - 8) +
          '" font-size="11" fill="#61758a">' +
          esc(a.ports.find((p) => p.id === l.ap).name) +
          '</text><text x="' +
          (a.x * 0.3 + b.x * 0.7) +
          '" y="' +
          (a.y * 0.3 + b.y * 0.7 - 8) +
          '" font-size="11" fill="#61758a">' +
          esc(b.ports.find((p) => p.id === l.bp).name) +
          '</text><circle class="cable-select-handle" cx="' +
          handle.x +
          '" cy="' +
          handle.y +
          '" r="6"/></g>'
        );
      })
      .join("");
    $("devices").innerHTML = net.devices
      .map(
        (d) =>
          '<g class="node ' +
          (selected === d.id ? "selected" : "") +
          '" data-device="' +
          esc(d.id) +
          '" transform="translate(' +
          d.x +
          "," +
          d.y +
          ')" tabindex="0" role="button" aria-label="' +
          esc(d.name) +
          (d.watch ? ", watched" : "") +
          '" style="color:' +
          (d.type === "host" ? "#284d73" : "#287d78") +
          '">' +
          (d.watch
            ? '<rect class="watch-ring" x="-47" y="-39" width="94" height="78" rx="17"/>'
            : "") +
          '<rect class="device-body" x="-41" y="-33" width="82" height="66" rx="12" fill="' +
          (d.type === "host" ? "#eaf3fa" : "#e7f4f1") +
          '" stroke="currentColor" stroke-width="2"/>' +
          icon(d) +
          (d.nat?.enabled
            ? '<g class="nat-badge"><title>NAT enabled</title><rect x="18" y="-44" width="34" height="16" rx="5"/><text x="35" y="-32" text-anchor="middle">NAT</text></g>'
            : "") +
          '<text text-anchor="middle" y="55" font-size="14" font-weight="600" fill="#29394b">' +
          esc(d.name) +
          '</text><text text-anchor="middle" y="73" font-size="12" fill="#61758a">' +
          esc(
            d.type === "host"
              ? d.ip
                ? d.ip + "/" + d.prefix
                : "Not configured"
              : d.type === "router"
                ? d.firewallMode === "transparent" ? "2 bridge ports" : d.ports.length + " routed interfaces"
                : "8 Ethernet ports",
          ) +
          "</text>" +
          (d.watch
            ? '<g class="device-watch-eye" data-watch-device="' +
              esc(d.id) +
              '" role="button" tabindex="0" aria-label="Stop watching ' +
              esc(d.name) +
              '" data-tooltip="' +
              esc(watchTooltip(d) + ". Click to turn off.") +
              '" fill="none" stroke="#287d78" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="-3" y="-4" width="26" height="24" fill="transparent" stroke="none"/><path d="M1 8s3.5-6 9-6 9 6 9 6-3.5 6-9 6S1 8 1 8Z"/><circle cx="10" cy="8" r="2.6"/></g>'
            : "") +
          "</g>",
      )
      .join("");
    $("devices")
      .querySelectorAll(".device-watch-eye")
      .forEach((eye) => {
        const name = eye.parentNode.querySelector("text");
        eye.setAttribute(
          "transform",
          "translate(" +
            (name.getBBox().x + name.getBBox().width + 5) +
            ",44) scale(.7)",
        );
      });
    drawApplications();
    drawAnchors();
    revealAnchors(hoveredDevice);
    refreshPortGlow();
    if (!net.devices.length)
      $("devices").innerHTML =
        '<g class="empty-network-state" pointer-events="none"><svg class="empty-network-icon" x="370" y="125" width="160" height="128" viewBox="0 0 80 64" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="#4e8080" stroke-width="2.5"><path d="M18 22v10h44V22M40 32v10"/></g><g stroke="#3b5278" stroke-width="2.5" fill="#edf4fa"><rect x="5" y="5" width="26" height="18" rx="3"/><rect x="49" y="5" width="26" height="18" rx="3"/><path d="M18 23v4m-6 0h12M62 23v4m-6 0h12"/><rect x="19" y="42" width="42" height="17" rx="4" fill="#e6f2ef" stroke="#4e8080"/></g><g fill="#89abc6"><path d="M10 10h16v8H10zM54 10h16v8H54z"/></g><g fill="#4e8080"><path d="M26 48h5v5h-5zM35 48h5v5h-5zM44 48h5v5h-5z"/><circle cx="55" cy="50" r="2"/></g></svg><text x="450" y="292" text-anchor="middle" fill="#61758a" font-size="20">Let’s build a network</text></g>';
  }

  let hoveredPort = null,
    focusedPort = null;
  function refreshPortGlow() {
    const button =
      (hoveredPort?.isConnected ? hoveredPort : null) ||
      (focusedPort?.isConnected ? focusedPort : null);
    const [device, port] = (button?.dataset.devicePort || "").split(":");
    const link = net.links.find(
      (l) =>
        (l.a === device && l.ap === port) || (l.b === device && l.bp === port),
    );
    $("links")
      .querySelectorAll("[data-link]")
      .forEach((el) =>
        el.classList.toggle("port-highlight", el.dataset.link === link?.id),
      );
  }
  function bindPortGlow(root) {
    for (const [enter, leave, focus] of [
      ["pointerover", "pointerout", false],
      ["focusin", "focusout", true],
    ]) {
      root.addEventListener(enter, (e) => {
        const button = e.target.closest?.(".interface-port, [data-route-port]");
        if (!button) return;
        if (focus) focusedPort = button;
        else hoveredPort = button;
        refreshPortGlow();
      });
      root.addEventListener(leave, (e) => {
        const button = e.target.closest?.(".interface-port, [data-route-port]");
        if (!button || button.contains(e.relatedTarget)) return;
        if (focus) focusedPort = null;
        else hoveredPort = null;
        refreshPortGlow();
      });
    }
  }
  bindPortGlow(document);
  const inspectorPorts = NetworkExplorerInspectorPorts.create({
    getNetwork: () => net,
    esc,
    vlanLabel,
    isPan,
  });
  const interfacePanel = (d) => inspectorPorts.interfacePanel(d),
    vlanPanel = (d) => inspectorPorts.vlanPanel(d);
  function bindVlanDrag(d) {
    const ports = [...$("inspector").querySelectorAll(".interface-port")];
    $("inspector")
      .querySelectorAll("[data-drag-vlan]")
      .forEach((pill) => {
        pill.draggable = false;
        let gesture = null;
        const cleanup = () => {
          if (!gesture) return;
          gesture.ghost?.remove();
          ports.forEach((p) => {
            p.classList.remove("vlan-drop-target");
            p.style.removeProperty("--drop-color");
          });
          $("inspector").classList.remove("vlan-dragging");
          gesture = null;
          refreshPortGlow();
          document.removeEventListener("keydown", cancelKey);
        };
        const cancelKey = (e) => {
          if (e.key === "Escape") cleanup();
        };
        pill.onpointerdown = (e) => {
          if (e.button !== 0) return;
          if (net.queue.length || staged) {
            say(
              "Finish the exchange or clear learned state before changing the network.",
            );
            return;
          }
          e.preventDefault();
          const vlan = d.vlans.find(
            (v) => v.id === Number(pill.dataset.dragVlan),
          );
          gesture = {
            x: e.clientX,
            y: e.clientY,
            vlan,
            target: null,
            ghost: null,
          };
          pill.setPointerCapture(e.pointerId);
          document.addEventListener("keydown", cancelKey);
        };
        pill.onpointermove = (e) => {
          if (!gesture) return;
          const g = gesture;
          if (!g.ghost && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 4)
            return;
          e.preventDefault();
          if (!g.ghost) {
            g.ghost = pill.cloneNode(true);
            g.ghost.removeAttribute("data-drag-vlan");
            g.ghost.removeAttribute("title");
            g.ghost.classList.add("vlan-drag-ghost");
            g.ghost.setAttribute("aria-hidden", "true");
            document.body.append(g.ghost);
            $("inspector").classList.add("vlan-dragging");
          }
          g.ghost.style.left = e.clientX + 12 + "px";
          g.ghost.style.top = e.clientY + 12 + "px";
          const target = document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest(".interface-port");
          g.target = ports.includes(target) ? target : null;
          ports.forEach((p) => {
            p.classList.toggle("vlan-drop-target", p === g.target);
            p.style.setProperty("--drop-color", g.vlan.color);
          });
          const link =
            g.target &&
            net.links.find(
              (l) =>
                (l.a === d.id && l.ap === g.target.dataset.port) ||
                (l.b === d.id && l.bp === g.target.dataset.port),
            );
          $("links")
            .querySelectorAll("[data-link]")
            .forEach((el) =>
              el.classList.toggle(
                "port-highlight",
                el.dataset.link === link?.id,
              ),
            );
        };
        pill.onpointerup = (e) => {
          if (!gesture) return;
          const { target, vlan } = gesture;
          cleanup();
          if (pill.hasPointerCapture(e.pointerId))
            pill.releasePointerCapture(e.pointerId);
          if (!target || net.device(d.id) !== d) return;
          const port = d.ports.find((p) => p.id === target.dataset.port);
          if (port.accessVlan !== vlan.id)
            mutate(() =>
              net.configurePort(d.id, port.id, { accessVlan: vlan.id }),
            );
        };
        pill.onpointercancel = cleanup;
        pill.onlostpointercapture = cleanup;
      });
  }
  function bindVlanPanel(d) {
    if (d.type !== "switch") return;
    bindVlanDrag(d);
    $("new-vlan-id").hidden = isPan(d);
    $("new-vlan-id").required = !isPan(d);
    $("new-vlan-name").required = isPan(d);
    $("add-vlan-form").classList.toggle("named-vlan-add", isPan(d));
    $("show-add-vlan").onclick = () => {
      $("add-vlan-form").hidden = false;
      $("show-add-vlan").setAttribute("aria-expanded", "true");
      $(isPan(d) ? "new-vlan-name" : "new-vlan-id").focus();
    };
    const cancel = () => {
      $("add-vlan-form").reset();
      $("add-vlan-form").hidden = true;
      $("show-add-vlan").setAttribute("aria-expanded", "false");
      $("show-add-vlan").focus();
    };
    $("cancel-add-vlan").onclick = cancel;
    $("add-vlan-form").onkeydown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    };
    $("add-vlan-form").onsubmit = (e) => {
      e.preventDefault();
      const id = isPan(d)
        ? NetworkExplorerPlatform.nextId(d)
        : Number($("new-vlan-id").value);
      if (
        isPan(d) &&
        d.vlans.some((v) => v.name === $("new-vlan-name").value.trim())
      ) {
        say("That VLAN object name already exists.");
        return;
      }
      if (d.vlans.some((v) => v.id === id)) {
        say("That VLAN already exists. Choose a different ID.");
        $("new-vlan-id").focus();
        return;
      }
      mutate(() =>
        net.setVlan(d.id, id, $("new-vlan-name").value.trim() || undefined),
      );
      if ($("add-vlan-form").hidden) $("show-add-vlan").focus();
    };
    $("inspector")
      .querySelectorAll("[data-vlan-name]")
      .forEach(
        (el) =>
          (el.onchange = () => {
            if (
              isPan(d) &&
              d.vlans.some(
                (v) =>
                  v.id !== Number(el.dataset.vlanName) &&
                  v.name === el.value.trim(),
              )
            ) {
              say("That VLAN object name already exists.");
              inspector();
              return;
            }
            mutate(() =>
              net.setVlan(d.id, Number(el.dataset.vlanName), el.value),
            );
          }),
      );
    $("inspector")
      .querySelectorAll("[data-vlan-color]")
      .forEach(
        (el) =>
          (el.onchange = () =>
            mutate(() =>
              net.setVlan(
                d.id,
                Number(el.dataset.vlanColor),
                undefined,
                el.value,
              ),
            )),
      );
  }
  const portConfig = document.createElement("dialog");
  portConfig.id = "port-config";
  document.body.append(portConfig);
  portConfig.addEventListener("close", () => { if (!portConfig.open) portConfig.innerHTML = ""; });
  function styleVlanDropdown(d) {
    const select = $("port-vlan"),
      label = select.parentElement,
      wrap = document.createElement("div");
    wrap.className = "port-vlan-picker";
    const badge = (v) =>
      '<span class="vlan-badge" style="--vlan-color:' +
      esc(v.color) +
      '">' +
      esc(isPan(d) ? v.name : "V" + v.id) +
      "</span>" +
      (!isPan(d)
        ? '<span class="vlan-option-name">' + esc(v.name) + "</span>"
        : "");
    const selected = () => d.vlans.find((v) => v.id === Number(select.value));
    wrap.innerHTML =
      '<span id="port-vlan-label">' +
      (isPan(d) ? "VLAN object" : "Access VLAN") +
      '</span><button id="port-vlan-toggle" type="button" aria-labelledby="port-vlan-label port-vlan-value" aria-haspopup="listbox" aria-expanded="false" aria-controls="port-vlan-options"><span id="port-vlan-value">' +
      badge(selected()) +
      '</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div id="port-vlan-options" role="listbox" aria-labelledby="port-vlan-label" hidden>' +
      d.vlans
        .slice()
        .sort((a, b) => a.id - b.id)
        .map(
          (v) =>
            '<button type="button" role="option" tabindex="-1" data-vlan-choice="' +
            v.id +
            '" aria-selected="' +
            (v.id === Number(select.value)) +
            '">' +
            badge(v) +
            '<svg class="vlan-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></button>',
        )
        .join("") +
      "</div>";
    label.replaceWith(wrap);
    select.hidden = true;
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    wrap.append(select);
    const toggle = $("port-vlan-toggle"),
      list = $("port-vlan-options"),
      options = [...list.children];
    const close = (focus = false) => {
      list.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      if (focus) toggle.focus();
    };
    const open = () => {
      list.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      (
        options.find((o) => o.getAttribute("aria-selected") === "true") ||
        options[0]
      ).focus();
    };
    toggle.onclick = () => (list.hidden ? open() : close());
    toggle.onkeydown = (e) => {
      if (["ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        open();
      }
    };
    options.forEach(
      (option) =>
        (option.onclick = () => {
          select.value = option.dataset.vlanChoice;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          if (!toggle.isConnected) return;
          $("port-vlan-value").innerHTML = badge(selected());
          options.forEach((o) =>
            o.setAttribute("aria-selected", String(o === option)),
          );
          close(true);
        }),
    );
    list.onkeydown = (e) => {
      const index = options.indexOf(document.activeElement);
      let next;
      if (e.key === "ArrowDown") next = (index + 1) % options.length;
      else if (e.key === "ArrowUp")
        next = (index + options.length - 1) % options.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = options.length - 1;
      else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close(true);
        return;
      }
      if (next !== undefined) {
        e.preventDefault();
        options[next].focus();
      }
    };
    wrap.addEventListener("focusout", (e) => {
      if (!wrap.contains(e.relatedTarget)) close();
    });
    portConfig.onpointerdown = (e) => {
      if (!wrap.contains(e.target)) close();
    };
  }
  function hostAddressFields(d) {
    return '<div class="pair router-address"><div class="address-field"><div class="address-heading"><label for="host-ip">IPv4 address</label><a class="cidr-tool-link" href="../viewer.html?tool=cs339/cidr_viz.html&amp;course=CS339&amp;label=Computer%20Networks&amp;name=CIDR%20Teaching%20Tool&amp;back=cs339/index.html" target="_blank" rel="noopener" title="Open CIDR Teaching Tool in a new tab" aria-label="Open CIDR Teaching Tool in a new tab"><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 2h5v5M14 2 7 9M6 3H2v11h11v-4"/></svg></a></div><input id="host-ip" value="' +
            esc(d.ip) +
            '" placeholder="Not configured"></div><div class="prefix-field"><div class="prefix-heading"><label for="host-prefix">Prefix</label></div><input id="host-prefix" type="number" min="1" max="30" value="' +
            esc(d.prefix) +
            '"></div></div>';
  }
  function openPortConfig(deviceId, portId) {
    portConfig.dataset.device = deviceId;
    portConfig.dataset.port = portId;
    const d = net.device(deviceId),
      p = d.ports.find((p) => p.id === portId);
    portConfig.dataset.host = String(d.type === "host");
    const l = net.links.find(
      (l) => (l.a === d.id && l.ap === p.id) || (l.b === d.id && l.bp === p.id),
    );
    const peer = l ? net.device(l.a === d.id ? l.b : l.a) : null;
    const peerPort = peer?.ports.find(
      (p) => p.id === (l.a === d.id ? l.bp : l.ap),
    );
    portConfig.innerHTML =
      '<div class="port-config-header"><h2>' +
      esc(d.name) +
      " / " +
      esc(p.name) +
      '</h2><label class="examine-watch-control"><input id="port-admin" type="checkbox" role="switch" ' +
      (p.enabled ? "checked" : "") +
      '><span class="watch-switch-track" aria-hidden="true"></span><span>Enabled</span></label></div><p>Connected to: ' +
      esc(peer ? peer.name + " / " + peerPort.name : "Not connected") +
      "</p>" +
      (d.type === "host" ? hostAddressFields(d) : d.type === "switch"
        ? "<p>" +
          (isPan(d)
            ? "Interface type: <strong>Layer 2</strong>"
            : "Mode: <strong>Access</strong>") +
          '</p><label>Access VLAN<select id="port-vlan">' +
          d.vlans
            .map(
              (v) =>
                '<option value="' +
                v.id +
                '" ' +
                (v.id === p.accessVlan ? "selected" : "") +
                ">" +
                esc(v.id + " - " + v.name) +
                "</option>",
            )
            .join("") +
          '</select></label><p class="hint">Access ports carry untagged frames.</p>'
        : d.type === "router" && d.firewallMode !== "transparent"
          ? '<div class="pair router-address"><label>IPv4 address<input id="router-ip" value="' +
            esc(p.ip) +
            '" placeholder="Not configured"></label><label>Prefix<input id="router-prefix" type="number" min="1" max="30" value="' +
            esc(p.prefix ?? 24) +
            '"></label></div><label>DHCP relay server<input id="router-dhcp-relay" value="' +
            esc(p.dhcpRelay || "") +
            '" placeholder="Optional server IPv4 address"></label><p class="hint">Set relay on the client-facing interface to reach a DHCP server on another subnet.</p>' +
            natRoleMarkup(d, p)
          : "") +
      '<footer><button id="close-port-config">Close</button></footer>';
    $("close-port-config").onclick = () => portConfig.close();
    $("port-admin").onchange = () => {
      if (!editable()) {
        openPortConfig(deviceId, portId);
        return;
      }
      mutate(() =>
        net.configurePort(deviceId, portId, {
          enabled: $("port-admin").checked,
        }),
      );
    };
    if (d.type === "switch")
      $("port-vlan").onchange = () => {
        if (!editable()) {
          openPortConfig(deviceId, portId);
          return;
        }
        mutate(() =>
          net.configurePort(deviceId, portId, {
            accessVlan: Number($("port-vlan").value),
          }),
        );
      };
    if (d.type === "router" && d.firewallMode !== "transparent") {
      const save = () => {
        if (!editable()) return;
        safely(() => {
          configurationChange(() =>
            net.configureInterface(
              d.id,
              p.id,
              $("router-ip").value.trim(),
              Number($("router-prefix").value),
            ),
          );
          render();
        });
      };
      $("port-nat-role").onchange = (e) => {
        if (!editable()) {
          openPortConfig(deviceId, portId);
          return;
        }
        safely(() => {
          const c = JSON.parse(
              JSON.stringify(
                d.nat || { enabled: false, inside: [], outside: "" },
              ),
            ),
            role = e.target.value;
          c.inside = c.inside.filter((id) => id !== p.id);
          if (c.outside === p.id) c.outside = "";
          if (role === "inside") c.inside.push(p.id);
          if (role === "outside") c.outside = p.id;
          if (!c.inside.length || !c.outside) c.enabled = false;
          configurationChange(() => net.configureNat(d.id, c));
          render();
        });
        openPortConfig(deviceId, portId);
      };
      $("router-ip").onchange = save;
      $("router-prefix").onchange = save;
      $("router-dhcp-relay").onchange = (e) => {
        if (!editable()) return;
        safely(() => {
          configurationChange(() =>
            net.configureDhcpRelay(d.id, p.id, e.target.value.trim()),
          );
          render();
        });
      };
    }
    if (d.type === "host") {
      const saveAddress = () => {
        const address = $("host-ip").value.trim(),
          prefixText = $("host-prefix").value;
        if (!address) {
          if(d.ip) mutate(() => net.configure(d.id, "", null));
          return;
        }
        if (!prefixText) return;
        const prefix = Number(prefixText);
        if (address === d.ip && prefix === d.prefix) return;
        if (!editable()) return;
        mutate(() => net.configure(d.id, address, prefix));
      };
      for (const id of ["host-ip", "host-prefix"]) {
        $(id).onchange = saveAddress;
        $(id).onkeydown = (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            saveAddress();
          }
        };
      }
      bindHostAddressing(d);
    }
    if (d.type === "switch") styleVlanDropdown(d);
    if (!portConfig.open) portConfig.showModal();
  }
  const portMenu = document.createElement("div");
  portMenu.className = "port-context-menu";
  portMenu.hidden = true;
  document.body.append(portMenu);
  function openPortMenu(deviceId, portId, e) {
    const p = net.device(deviceId).ports.find((p) => p.id === portId);
    portMenu.innerHTML =
      '<button type="button">' +
      (p.enabled ? "Disable" : "Enable") +
      " " +
      esc(p.name) +
      "</button>";
    portMenu.hidden = false;
    portMenu.style.left = Math.min(e.clientX, window.innerWidth - 160) + "px";
    portMenu.style.top = Math.min(e.clientY, window.innerHeight - 60) + "px";
    portMenu.firstElementChild.onclick = () => {
      portMenu.hidden = true;
      mutate(() =>
        net.configurePort(deviceId, portId, { enabled: !p.enabled }),
      );
    };
    portMenu.firstElementChild.focus();
  }
  document.addEventListener("pointerdown", (e) => {
    if (!portMenu.contains(e.target)) portMenu.hidden = true;
  });
  portMenu.onkeydown = (e) => {
    if (e.key === "Escape") portMenu.hidden = true;
  };

  function osIcon(value) {
    const glyph = ["windows", "linux", "macos"].includes(value)
      ? hostOsLogo({ os: value }).replace(/transform="[^"]*"/, "")
      : value === "paloalto"
        ? '<path fill="#f58025" d="m2 9 10-6 4 6-10 6zM8 15l10-6 4 6-10 6z"/>'
        : value === "cisco"
          ? '<g stroke="#319cba" stroke-width="2" stroke-linecap="round"><path d="M3 12v3M6 8v9M9 4v15M12 8v9M15 4v15M18 8v9M21 12v3"/></g>'
          : "";
    return glyph
      ? '<svg class="os-choice-icon" viewBox="0 0 24 24" aria-hidden="true">' +
          glyph +
          "</svg>"
      : "";
  }
  function styleInspectorSelect(id, label, choiceIcon = osIcon) {
    const select = $(id),
      wrap = document.createElement("div");
    wrap.className = "inspector-picker";
    const options = [...select.options];
    wrap.innerHTML =
      '<span id="' +
      id +
      '-label">' +
      label +
      '</span><button id="' +
      id +
      '-toggle" type="button" aria-labelledby="' +
      id +
      "-label " +
      id +
      '-value" aria-haspopup="listbox" aria-expanded="false" aria-controls="' +
      id +
      '-options"><span id="' +
      id +
      '-value">' +
      choiceIcon(select.value) +
      esc(select.selectedOptions[0].text) +
      '</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div id="' +
      id +
      '-options" role="listbox" aria-labelledby="' +
      id +
      '-label" hidden>' +
      options
        .map(
          (o) =>
            '<button type="button" role="option" tabindex="-1" data-value="' +
            o.value +
            '" aria-selected="' +
            o.selected +
            '"><span>' +
            choiceIcon(o.value) +
            esc(o.text) +
            '</span><svg class="picker-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></button>',
        )
        .join("") +
      "</div>";
    select.parentElement.replaceWith(wrap);
    select.hidden = true;
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    wrap.append(select);
    const toggle = $(id + "-toggle"),
      list = $(id + "-options"),
      choices = [...list.children];
    const refreshChoice = () => {
      $(id + "-value").innerHTML = choiceIcon(select.value) + esc(select.selectedOptions[0].text);
      choices.forEach(o => o.setAttribute("aria-selected", String(o.dataset.value === select.value)));
    };
    select.addEventListener("change", refreshChoice);
    select.addEventListener("pickerrefresh", refreshChoice);
    const close = (focus = false) => {
      list.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      if (focus) toggle.focus();
    };
    const open = () => {
      list.hidden = false;
      const bounds = (
          $("right-panel")?.contains(wrap)
            ? $("right-panel")
            : document.documentElement
        ).getBoundingClientRect(),
        r = toggle.getBoundingClientRect(),
        below = Math.min(window.innerHeight, bounds.bottom) - r.bottom - 8,
        above = r.top - Math.max(0, bounds.top) - 8,
        up = below < Math.min(list.scrollHeight, 300) && above > below;
      list.style.top = up ? "auto" : "calc(100% + 4px)";
      list.style.bottom = up
        ? "calc(100% - " + toggle.offsetTop + "px)"
        : "auto";
      list.style.maxHeight =
        Math.max(80, Math.min(300, up ? above : below)) + "px";
      list.style.overflowY = "auto";
      toggle.setAttribute("aria-expanded", "true");
      choices
        .find((o) => o.dataset.value === select.value)
        .focus({ preventScroll: true });
    };
    toggle.onclick = () => (list.hidden ? open() : close());
    toggle.onkeydown = (e) => {
      if (["ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        open();
      }
    };
    choices.forEach(
      (o) =>
        (o.onclick = () => {
          const value = o.dataset.value;
          close();
          select.value = value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          $(id + "-toggle")?.focus();
        }),
    );
    list.onkeydown = (e) => {
      const i = choices.indexOf(document.activeElement);
      let next;
      if (e.key === "ArrowDown") next = (i + 1) % choices.length;
      else if (e.key === "ArrowUp")
        next = (i + choices.length - 1) % choices.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = choices.length - 1;
      else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close(true);
        return;
      }
      if (next !== undefined) {
        e.preventDefault();
        choices[next].focus();
      }
    };
    wrap.addEventListener("focusout", (e) => {
      if (!wrap.contains(e.relatedTarget)) close();
    });
  }
  document.addEventListener("pointerdown", (e) => {
    document.querySelectorAll(".inspector-picker").forEach((w) => {
      if (!w.contains(e.target)) {
        w.querySelector("[role=listbox]").hidden = true;
        w.querySelector("[aria-haspopup]").setAttribute(
          "aria-expanded",
          "false",
        );
      }
    });
  });
  function leaseCountdown(lease) {
    return (
      '<span class="lease-ring" title="Lease expires in real time; renew to extend it">' +
      expiryMarkup(lease.expiresAt, lease.leaseSeconds || 120) +
      "</span>"
    );
  }
  function dhcpClientStatus(d) {
    return d.lease
      ? '<div class="lease-summary"><strong>Acquired IP: ' +
          esc(d.lease.address) +
          "</strong><span>Server " +
          esc(d.lease.server) +
          '</span></div><span class="lease-ring" aria-label="DHCP lease time remaining">' +
          expiryMarkup(d.lease.expiresAt, d.lease.leaseSeconds) +
          "</span>"
      : "<span>" +
          (net.dhcpPending[d.id] ? "Waiting for DHCP..." : "No active lease") +
          "</span>";
  }
  function dhcpLeases(d) {
    const rows = Object.values(net.dhcpLeases[d.id] || {});
    return rows.length
      ? "<table><thead><tr><th>Address / client</th><th>Lease</th></tr></thead><tbody>" +
          rows
            .map(
              (r) =>
                "<tr><td><code>" +
                esc(r.address) +
                "</code><small>" +
                esc(r.clientMac) +
                "</small><small>" +
                esc(r.pool || "Default") +
                "</small></td><td>" +
                (r.state === "offered" ? "Offered" : leaseCountdown(r)) +
                "</td></tr>",
            )
            .join("") +
          "</tbody></table>"
      : '<p class="hint">No leases assigned.</p>';
  }
  const applicationGlyph =
    richApplicationGlyph('dhcp');
  function richApplicationGlyph(type) {
    const shell='<path d="M-24-15l5-6h38l5 6v32h-48Z" fill="#a9c0d2"/><rect x="-24" y="-15" width="48" height="34" rx="4" fill="#edf4fa"/><path d="M-20-10h40" stroke="#fff"/>';
    const windowFrame='<rect x="-25" y="-21" width="50" height="42" rx="5" fill="#edf4fa"/><path d="M-25-10h50"/><path d="M-19-16h2m5 0h2" stroke="#7295b0" stroke-width="2.5"/><rect x="-5" y="-18" width="23" height="4" rx="2" fill="#c6d9e7" stroke="none"/>';
    const art={
      dhcp:shell+'<rect x="-17" y="-5" width="18" height="10" rx="2" fill="#c5deef"/><path d="M-12-1h8m-8 3h5" stroke="#6386a0" stroke-width="1"/><path d="M8-2h10m-4-3 4 3-4 3M18 10H8m4-3-4 3 4 3"/><path d="M-16 11h3m4 0h3m4 0h3" stroke="#7899af" stroke-width="3"/>',
      dns:'<ellipse cx="0" cy="21" rx="23" ry="3" fill="#d5e1e9" stroke="none"/><circle cy="-2" r="21" fill="#dcecf6"/><ellipse cy="-2" rx="10" ry="21" fill="#f2f8fc"/><path d="M-21-2h42M-17-13h34M-17 9h34M0-23v42" stroke="#779bb4"/><rect x="3" y="8" width="24" height="13" rx="3" fill="#f7fafc"/><path d="M8 13h13m-13 4h8" stroke="#567b98" stroke-width="1.5"/>',
      web:shell+'<path d="M-24-4h48M-24 8h48" stroke="#9bb5c8"/><g fill="#6f94b0" stroke="none"><circle cx="-16" cy="-9" r="2"/><circle cx="-16" cy="2" r="2"/><circle cx="-16" cy="14" r="2"/></g><path d="M-9-9H5M-9 2H5M-9 14H5" stroke="#a9c2d4" stroke-width="2"/><path d="M13-9h5M13 2h5M13 14h5" stroke="#527590" stroke-width="2.5"/>',
      browser:windowFrame+'<rect x="-19" y="-4" width="12" height="18" rx="2" fill="#c6dfee" stroke="#96b6cc"/><path d="M-2-2h20M-2 3h16M-2 8h19M-2 13h11" stroke="#7799b1" stroke-width="1.6"/>',
      echo:windowFrame+'<path d="M-17-1h30m-5-5 5 5-5 5M17 12h-30m5-5-5 5 5 5" stroke="#547c9b" stroke-width="2.5"/><circle cx="-18" cy="-1" r="2" fill="#a1bfd3" stroke="none"/>',
      nmap:'<circle cx="-3" cy="-3" r="20" fill="#e6f1f8"/><circle cx="-3" cy="-3" r="13" stroke="#a3bed1"/><circle cx="-3" cy="-3" r="6" stroke="#a3bed1"/><path d="M-3-23v40M-23-3h40" stroke="#b7cedd"/><path d="M-3-3 10-17" stroke="#527c9c" stroke-width="2.5"/><circle cx="5" cy="-11" r="3" fill="#638caa" stroke="#fff"/><path d="m12 13 12 12" stroke="#4e708a" stroke-width="6"/>',
      spoofer:windowFrame+'<path d="M-19 0h14l5 10 6-20 7 10h8" stroke="#ac5c50" stroke-width="2.5"/><path d="m-14 15 5-4m17-17 5-4"/>',
      generator:windowFrame+'<path d="M-19 5h38M-12-5v21M0-5v21M12-5v21" stroke="#d0e1ed"/><path d="M-20 8h7l4-10 7 17 6-12 5 5h11" stroke="#527c9c" stroke-width="2.5"/>',
      ids:'<path d="M0-23 21-15v15c0 13-12 20-21 25C-9 20-21 13-21 0v-15Z" fill="#dbe9f3"/><path d="M0-17 15-11v12c0 9-8 15-15 19-7-4-15-10-15-19v-12Z" fill="#f3f8fc" stroke="#a4bfd1"/><path d="M-14 0h8l4-8 5 16 4-8h7" stroke="#577e9b" stroke-width="2"/>'
    };
    return '<g class="application-art" fill="none" stroke="#4b6983" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+art[type]+'</g>';
  }
  const appDefaultOffset = (type) =>
    ({
      firewall: { x: -100, y: 90 },
      ids: { x: 100, y: 90 },
      dhcp: { x: 110, y: -85 },
      dns: { x: -110, y: -85 },
      web: { x: 110, y: 85 },
      browser: { x: -110, y: 85 },
      echo: { x: 0, y: -100 },
      nmap: { x: 0, y: 120 },
      generator: { x: 0, y: -110 },
      spoofer: { x: 0, y: -110 },
    })[type];
  const appLabel = (type) =>
      type === "spoofer" ? "ARP Spoofer" : type === "firewall" ? "Firewall" : type === "ids" ? "IDS/IPS" : type === "generator" ? "Traffic Generator" : type === "nmap" ? "Nmap" : type === "echo" ? "Echo" : type === "web"
        ? "Web Server"
        : type === "browser"
          ? "Browser"
          : type.toUpperCase() + " server",
    appKey = (type) => type + "Server",
    appWatchKey = (type) => type + "Watch",
    appOffsetKey = (type) =>
      type === "dhcp" ? "applicationOffset" : type + "Offset";
  function generatorPanel(d){
    const c=d.generatorServer,r=net.generators[d.id],busy=!!(staged||net.queue.length);
    const status=r?(r.status[0].toUpperCase()+r.status.slice(1)+' - '+r.sent+'/'+r.total+' sent'):'Ready';
    return '<form id="generator-settings"><div class="generator-toolbar"><button type="submit" aria-label="Run burst" title="Run burst" '+(busy?'disabled':'')+'><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 4 12 8-12 8Z"/></svg></button><button id="generator-stop" type="button" aria-label="Stop burst" title="Stop burst" '+(r?.status==='running'?'':'disabled')+'><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12v12H6Z"/></svg></button><span role="status">'+esc(status)+'</span></div><p class="hint">Fills pending connections with SYNs. Use canvas Pause/Step to inspect.</p><label>Target IPv4<input id="generator-target" placeholder="Type @ to choose a host" autocomplete="off" value="'+esc(c.target)+'" required></label><div class="generator-fields"><label>TCP port<input id="generator-port" type="number" min="1" max="65535" value="'+c.port+'"></label><label>SYN count<input id="generator-count" type="number" min="1" max="100" value="'+c.count+'"></label><label>Speed<select id="generator-interval"><option value="10" '+(c.interval>=6?'selected':'')+'>Slow</option><option value="4" '+(c.interval>2&&c.interval<6?'selected':'')+'>Medium</option><option value="2" '+(c.interval<=2?'selected':'')+'>Fast</option></select></label></div><label>Availability check<select id="generator-probe"><option value="">No check</option>'+net.devices.filter(h=>h.id!==d.id&&h.browserServer?.enabled&&h.ip).map(h=>'<option value="'+h.id+'" '+(r?.probeId===h.id?'selected':'')+'>'+esc(h.name)+'</option>').join('')+'</select></label></form>'+(r?.probeId?'<p class="hint" role="status">Check: '+esc(net.httpPages[r.probeId]?.status||'Waiting')+'</p>':'');
  }
  function bindGenerator(d){
    styleInspectorSelect('generator-interval','Speed',()=> '');
    styleInspectorSelect('generator-probe','Check',()=> '');
    $('generator-probe-label').insertAdjacentHTML('beforeend',' <button type="button" class="generator-info" aria-label="About availability check" data-tooltip="Optional Browser request midway through the burst. Use an IP-based URL."><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/></svg></button>');
    $('generator-settings').onsubmit=e=>{e.preventDefault();safely(()=>{if(candidateBase||staged||net.queue.length)throw Error('Finish the current exchange first.');const config={enabled:true,target:$('generator-target').value.trim(),port:Number($('generator-port').value),count:Number($('generator-count').value),interval:Number($('generator-interval').value)},probe=$('generator-probe').value;NetworkExplorerDos.validate(config);d.generatorServer=config;net.generatorControl(d.id,'start',probe);running=true;stage();render();});};
    $('generator-stop').onclick=()=>safely(()=>{net.generatorControl(d.id,'stop');if(staged)staged.trial.generatorControl(d.id,'stop');render();});
  }
  const capacityMonitors = new Map();
  let capacityDrag = null;
  function drawCapacityMonitors() {
    if(capacityDrag)return;
    let layer=$('capacity-monitors');
    if(!layer){layer=document.createElementNS('http://www.w3.org/2000/svg','g');layer.id='capacity-monitors';$('devices').after(layer);}
    const now=Date.now(),visible=[];
    for(const [id,l] of Object.entries(net.serverLoad||{})){
      const d=net.device(id);if(!d?.webServer||!(l.accepted||l.dropped))continue;
      const pending=Object.keys(l.pending).length,signature=[l.accepted,l.dropped,l.expired,pending].join(':');
      let m=capacityMonitors.get(id);
      if(!m){m={signature,changed:now,expanded:false,dx:-125,dy:40};capacityMonitors.set(id,m);}
      if(m.signature!==signature){m.signature=signature;m.changed=now;}
      if(pending)m.changed=now;
      if(now-m.changed>=60000)continue;
      const limit=d.webServer.synCapacity??32,expanded=m.expanded;
      const ratio=Math.min(1,pending/limit),state=ratio>=1?'full':ratio>=.75?'busy':'available',status=state==='full'?'Full':state==='busy'?'Near capacity':pending?'Available':'Idle';
      visible.push('<g><path class="note-connector" d="M'+d.x+' '+d.y+'L'+(d.x+m.dx)+' '+(d.y+m.dy+20)+'"/><foreignObject x="'+(d.x+m.dx)+'" y="'+(d.y+m.dy)+'" width="250" height="'+(expanded?200:80)+'"><div xmlns="http://www.w3.org/1999/xhtml" class="capacity-monitor capacity-'+state+'" data-capacity-monitor="'+id+'"><div class="capacity-monitor-bar"><button type="button" data-capacity-drag="'+id+'" aria-label="Move capacity monitor" title="Drag to move; arrow keys to nudge"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" stroke-width="3" stroke-linecap="round"/></svg></button><button type="button" data-capacity-expand="'+id+'" aria-expanded="'+expanded+'" title="Connection capacity for '+esc(d.name)+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20V4M3 20h18M7 16v-4M12 16V8M17 16V5"/></svg><span>'+pending+' / '+limit+' slots</span></button><small class="capacity-countdown" data-capacity-countdown="'+id+'" role="timer" aria-live="off"><svg viewBox="0 0 24 24" aria-hidden="true"><circle class="countdown-track" cx="12" cy="12" r="9"/><circle class="countdown-progress" cx="12" cy="12" r="9" pathLength="100" stroke-dasharray="100" transform="rotate(-90 12 12)"/></svg><span></span></small></div><div class="capacity-status"><span>'+status+'</span><span>'+Math.round(ratio*100)+'%</span></div><div class="capacity-meter" role="meter" aria-label="Pending connection capacity" aria-valuemin="0" aria-valuemax="'+limit+'" aria-valuenow="'+pending+'" aria-valuetext="'+pending+' of '+limit+' slots occupied; '+status+'"><span style="width:'+ratio*100+'%"></span></div>'+(expanded?'<div class="capacity-monitor-details"><strong>'+esc(d.name)+'</strong><div>'+l.dropped+' SYNs dropped &middot; '+l.expired+' expired</div><div>'+l.accepted+' accepted</div></div>':'')+'</div></foreignObject></g>');
    }
    for(const id of capacityMonitors.keys())if(!net.serverLoad?.[id])capacityMonitors.delete(id);
    const updateCountdowns=()=>layer.querySelectorAll('[data-capacity-countdown]').forEach(el=>{
      const id=el.dataset.capacityCountdown,m=capacityMonitors.get(id),active=Object.keys(net.serverLoad[id]?.pending||{}).length>0;
      const seconds=Math.max(0,Math.ceil((60000-(now-m.changed))/1000));
      const label=active?'Countdown starts when idle':'Closes in '+seconds+'s';
      el.querySelector('span').textContent=active?'—':seconds;el.setAttribute('aria-label',label);el.setAttribute('data-tooltip',label);
      el.querySelector('.countdown-progress').setAttribute('stroke-dashoffset',String(100-seconds/60*100));
    });
    const markup=visible.join('');if(layer.capacityMarkup===markup){updateCountdowns();return;}layer.capacityMarkup=markup;
    layer.innerHTML=markup;
    updateCountdowns();
    layer.onpointerdown=e=>{
      e.stopPropagation();const handle=e.target.closest('[data-capacity-drag]');if(!handle||e.button!==0)return;
      e.preventDefault();handle.focus();const id=handle.dataset.capacityDrag,m=capacityMonitors.get(id);
      capacityDrag={id,start:point(e),dx:m.dx,dy:m.dy,pointer:e.pointerId};layer.setPointerCapture(e.pointerId);
    };
    layer.onpointermove=e=>{
      if(!capacityDrag||e.pointerId!==capacityDrag.pointer)return;e.stopPropagation();
      const drag=capacityDrag,m=capacityMonitors.get(drag.id),d=net.device(drag.id),p=point(e);if(!m||!d)return;
      m.dx=drag.dx+p.x-drag.start.x;m.dy=drag.dy+p.y-drag.start.y;
      const card=layer.querySelector('[data-capacity-monitor="'+drag.id+'"]').closest('foreignObject');card.setAttribute('x',d.x+m.dx);card.setAttribute('y',d.y+m.dy);
      card.previousElementSibling.setAttribute('d','M'+d.x+' '+d.y+'L'+(d.x+m.dx)+' '+(d.y+m.dy+20));
    };
    layer.onpointerup=layer.onpointercancel=e=>{
      if(!capacityDrag||e.pointerId!==capacityDrag.pointer)return;e.stopPropagation();const id=capacityDrag.id;capacityDrag=null;
      if(layer.hasPointerCapture(e.pointerId))layer.releasePointerCapture(e.pointerId);layer.capacityMarkup=null;drawCapacityMonitors();layer.querySelector('[data-capacity-drag="'+id+'"]')?.focus();
    };
    layer.onclick=e=>{e.stopPropagation();const expand=e.target.closest('[data-capacity-expand]'),m=capacityMonitors.get(expand?.dataset.capacityExpand);if(!m)return;m.expanded=!m.expanded;drawCapacityMonitors();};
    layer.onkeydown=e=>{
      e.stopPropagation();const handle=e.target.closest('[data-capacity-drag]');if(!handle||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
      e.preventDefault();const id=handle.dataset.capacityDrag,m=capacityMonitors.get(id),step=e.shiftKey?25:5;
      m.dx+=(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0);m.dy+=(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0);
      drawCapacityMonitors();layer.querySelector('[data-capacity-drag="'+id+'"]')?.focus();
    };
  }
  function nmapPanel(){
    return '<p class="hint">Nmap is a command-line (CLI) tool for discovering open network ports. Run it in the host Terminal.</p><button id="nmap-terminal" class="nmap-terminal-pill" type="button" title="Open Terminal with a scan command"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 6 6 6-6 6M13 18h7"/></svg>Terminal</button><p class="hint">Type <code>@</code> in Terminal to choose a target IP, then press Enter to scan.</p>';
  }
  function nmapTerminal(id){
    const raw='nmap -sS -p 22,80,443 ';
    finishPlacement();cancelConnect();openCanvasTerminal(id,'nmap:'+id);
    $('command').value=raw;terminalState(id).input=raw;syncExternal();
    const entry=externalPanels.get('terminal'),input=(entry?.window.document||document).getElementById('command');
    input?.focus();input?.setSelectionRange(raw.length,raw.length);
  }
  function appGlyph(type) {
    if(type === "firewall") return '<g transform="scale(.65)">'+NetworkExplorerFirewallUI.glyph()+"</g>";
    return ['dhcp','dns','web','browser','echo','nmap','generator','spoofer','ids'].includes(type) ? richApplicationGlyph(type) : applicationGlyph;
  }
  function applications() {
    return [
      ...net.applicationDrafts,
      ...net.devices.filter(d=>d.type === "router" && (d.role === "firewall" || d.firewall?.enabled)).flatMap(d=>(d.role === "firewall" ? ["firewall","ids"] : ["firewall"]).map(type=>{const offset=d[appOffsetKey(type)]||appDefaultOffset(type);return {id:type+":"+d.id,type,host:d.id,x:d.x+offset.x,y:d.y+offset.y};})),
      ...net.devices
        .filter((d) => d.type === "host")
        .flatMap((d) =>
          ["dhcp", "dns", "web", "browser", "echo", "nmap", "generator", "spoofer"]
            .filter((t) => d[appKey(t)])
            .map((type) => {
              const offset = d[appOffsetKey(type)];
              return {
                id: type + ":" + d.id,
                type,
                host: d.id,
                x: d.x + (offset?.x ?? appDefaultOffset(type).x),
                y: d.y + (offset?.y ?? appDefaultOffset(type).y),
              };
            }),
        ),
    ];
  }
  function selectApplication(id) {
    finishPlacement();
    selected = id;
    openInspector();
    render();
  }
  function openCanvasTerminal(id, applicationId) {
    select(id);
    if (applicationId) selectApplication(applicationId);
    openTool("terminal", true);
    const external = externalPanels.get("terminal");
    if (external) { syncExternal(); external.window.focus(); }
    (external?.window.document || document).getElementById("command")?.focus();
  }
  function enableCanvasWatch(id, appType) {
    const d = net.device(id);
    if (!d) return;
    d[appType ? appWatchKey(appType) : "watch"] = true;
    if (appType) selectApplication(appType + ":" + id);
    else select(id);
    if (!watchMenu.matches(":popover-open")) $("watch").click();
  }
  function hostApplications(d) {
    const types = ["dhcp", "dns", "web", "browser", "echo", "nmap", "generator", "spoofer"].filter((t) => d[appKey(t)]);
    return (
      '<div class="small-heading inspector-section-heading">Applications</div>' +
      (types.length
        ? types
            .map(
              (t) =>
                '<button id="host-' +
                t +
                '-app" class="installed-application" title="Configure ' +
                appLabel(t) +
                '"><svg viewBox="-30 -26 60 52" aria-hidden="true">' +
                appGlyph(t) +
                "</svg>" +
                appLabel(t) +
                "<span>" +
                (d[appKey(t)].enabled ? "On" : "Off") +
                "</span></button>",
            )
            .join("")
        : '<p class="hint">Drag an application onto this host to install it.</p>')
    );
  }
  function applicationPath(a) {
    const d = net.device(a.host),
      facing = (from, to) =>
        Math.abs(to.x - from.x) > Math.abs(to.y - from.y)
          ? to.x > from.x
            ? "right"
            : "left"
          : to.y > from.y
            ? "bottom"
            : "top",
      side = facing(d, a),
      endSide = facing(a, d),
      v = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] },
      start = portPosition(d, side),
      offset = {
        top: [0, -12],
        bottom: [0, 11],
        left: [-14, 0],
        right: [14, 0],
      }[endSide],
      end = { x: a.x + offset[0], y: a.y + offset[1] },
      reach = Math.max(
        20,
        Math.min(70, Math.hypot(end.x - start.x, end.y - start.y) * 0.3),
      );
    return {
      start,
      end,
      c1: { x: start.x + v[side][0] * reach, y: start.y + v[side][1] * reach },
      c2: {
        x: end.x + v[endSide][0] * reach,
        y: end.y + v[endSide][1] * reach,
      },
    };
  }
  function avoidConnectionLabels() {
    const curves = [
        ...net.links.map(cablePath),
        ...applications()
          .filter((a) => a.host)
          .map(applicationPath),
      ],
      samples = curves.flatMap((p) =>
        Array.from({ length: 41 }, (_, i) => {
          const t = i / 40,
            u = 1 - t;
          return {
            x:
              u * u * u * p.start.x +
              3 * u * u * t * p.c1.x +
              3 * u * t * t * p.c2.x +
              t * t * t * p.end.x,
            y:
              u * u * u * p.start.y +
              3 * u * u * t * p.c1.y +
              3 * u * t * t * p.c2.y +
              t * t * t * p.end.y,
          };
        }),
      );
    for (const node of svg.querySelectorAll(
      "[data-device],[data-application]",
    )) {
      const isApp = !!node.dataset.application,
        d = isApp
          ? applications().find((a) => a.id === node.dataset.application)
          : net.device(node.dataset.device);
      if (!d) continue;
      const texts = [...node.querySelectorAll(":scope > text")];
      if (!texts.length) continue;
      const scale = isApp ? 0.6 : 1,
        boxes = texts.map((t) => t.getBBox()),
        box = {
          x: Math.min(...boxes.map((b) => b.x)) * scale,
          y: Math.min(...boxes.map((b) => b.y)) * scale,
          w: Math.max(...boxes.map((b) => b.x + b.width)) * scale,
          h: Math.max(...boxes.map((b) => b.y + b.height)) * scale,
        };
      box.w -= box.x;
      box.h -= box.y;
      const candidates = isApp
        ? [
            [0, 0],
            [0, -43],
            [58, -18],
            [-58, -18],
          ]
        : [
            [0, 0],
            [0, -106],
            [100, -48],
            [-100, -48],
          ];
      const penalty = ([x, y]) =>
        samples.filter(
          (p) =>
            p.x > d.x + box.x + x - 8 &&
            p.x < d.x + box.x + x + box.w + 8 &&
            p.y > d.y + box.y + y - 5 &&
            p.y < d.y + box.y + y + box.h + 5,
        ).length +
        (d.x + box.x + x < 0 ||
        d.x + box.x + x + box.w >
          Math.max(900, ...net.devices.map((d) => d.x + 260)) ||
        d.y + box.y + y < 0
          ? 100
          : 0);
      const shift = candidates.reduce(
        (best, c) => (penalty(c) < penalty(best) ? c : best),
        candidates[0],
      );
      texts.forEach((t) =>
        t.setAttribute(
          "transform",
          "translate(" + shift[0] / scale + "," + shift[1] / scale + ")",
        ),
      );
      const eye = node.querySelector(
        isApp ? ".application-watch-eye" : ".device-watch-eye",
      );
      if (eye) {
        if (isApp)
          eye.setAttribute(
            "transform",
            "translate(" +
              (38 + shift[0] / scale) +
              "," +
              (23 + shift[1] / scale) +
              ")",
          );
        else {
          const b = texts[0].getBBox();
          eye.setAttribute(
            "transform",
            "translate(" +
              (b.x + b.width + 5 + shift[0]) +
              "," +
              (44 + shift[1]) +
              ") scale(.7)",
          );
        }
      }
    }
  }
  function drawApplications() {
    let layer = $("applications");
    if (!layer) {
      layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      layer.id = "applications";
      $("devices").after(layer);
    }
    layer.innerHTML = applications()
      .map((a) => {
        const d = net.device(a.host);
        return (
          (d
            ? '<path class="application-attachment" fill="none" d="' +
              pathData(applicationPath(a)) +
              '"/><circle class="attachment-anchor" cx="' +
              applicationPath(a).end.x +
              '" cy="' +
              applicationPath(a).end.y +
              '" r="2.5"/>'
            : "") +
          '<g class="application-node ' +
          (selected === a.id ? "selected" : "") +
          '" data-application="' +
          a.id +
          '" transform="translate(' +
          a.x +
          "," +
          a.y +
          ') scale(.6)" role="button" tabindex="0" aria-label="' +
          appLabel(a.type) +
          " application" +
          (d ? " on " + esc(d.name) : ", not installed") +
          '"><rect class="application-hit" x="-48" y="-29" width="96" height="70" rx="9"/>' +
          appGlyph(a.type) +
          (a.type==='web'&&d?.webServer?.certificateName?'<g class="certificate-badge" transform="translate(29,-26)" fill="#f4c95d" stroke="#986b16" stroke-width="1.8" stroke-linejoin="round"><title>Certificate attached: '+esc(d.webServer.certificateName)+'</title><path d="M10 0 20 4v8c0 7-5 11-10 14C5 23 0 19 0 12V4Z"/><path d="m3 6 7-3 7 3v6c0 5-3 8-7 11-4-3-7-6-7-11Z" fill="#ffe39a" stroke="none"/><path d="m5 12 3.5 3.5L15 8" fill="none" stroke="#795414" stroke-width="2.5" stroke-linecap="round"/></g>':'') +
          '<text y="34" text-anchor="middle">' +
          appLabel(a.type) +
          "</text>" +
          (d?.[appWatchKey(a.type)]
            ? '<g class="application-watch-eye" transform="translate(38,23)" fill="none" stroke="#287d78" stroke-width="1.8"><path d="M0 6s4-6 10-6 10 6 10 6-4 6-10 6S0 6 0 6Z"/><circle cx="10" cy="6" r="2.5"/></g>'
            : "") +
          (!d
            ? '<circle data-app-anchor="' +
              a.id +
              '" class="application-anchor" cx="0" cy="-25" r="6"><title>Connect to a host to install</title></circle>'
            : "") +
          "</g>"
        );
      })
      .join("");
    avoidConnectionLabels();
  }
  function certificatePanel(c) {
    const toggle=(id,label,checked)=>'<label class="certificate-toggle"><span>'+label+'</span><input id="'+id+'" type="checkbox" role="switch" '+(checked?'checked':'')+'><span class="certificate-switch" aria-hidden="true"></span></label>';
    return '<section class="certificate-card" aria-label="Certificate information">'+
      '<div class="certificate-card-heading"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M5 4h34v29H5Z" fill="#fffdf5" stroke="#b1a17c" stroke-width="2"/><path d="M9 8h26v21H9Z" fill="none" stroke="#ddd4bd"/><path d="M13 13h18M13 18h14M13 23h9" stroke="#9caebf" stroke-width="2"/><path d="m26 32-3 12 7-4 6 4-2-12" fill="#6387c4"/><circle cx="30" cy="29" r="8" fill="#e3b747" stroke="#a77b1e"/><path d="m26 29 3 3 5-6" fill="none" stroke="#fff9df" stroke-width="2"/></svg><strong>Certificate</strong><button id="remove-certificate" type="button" aria-label="Remove certificate" title="Remove certificate"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button></div>'+
      '<div class="certificate-purpose">Authenticates this web server.</div>'+
      '<div class="certificate-properties"><label for="certificate-name">Issued to</label><input id="certificate-name" aria-label="Issued to (hostname or IP)" required maxlength="253" value="'+esc(c.certificateName)+'"><div class="certificate-issuer"><strong>Issued by</strong><span>Teaching CA <small>(simulated)</small></span></div></div>'+
      '<div class="certificate-controls">'+toggle('certificate-trusted','Trust this issuer',c.certificateTrusted)+toggle('certificate-valid','Within validity period',c.certificateValid)+'</div>'+
      '</section>';
  }
  function webPanel(d, type) {
    const c = d[appKey(type)],
      page = net.httpPages[d.id];
    if (type === "browser") return browserMarkup(d);
    return (
      '<form id="web-settings"><label class="certificate-toggle"><span>Enable Web Server</span><input id="web-enabled" role="switch" type="checkbox" ' +
      (c.enabled ? "checked" : "") +
      '><span class="certificate-switch" aria-hidden="true"></span></label>' +
      '<label>Transport<select id="web-tls"><option value="http"' + (!c.tls?' selected':'') + '>HTTP</option><option value="https"' + (c.tls?' selected':'') + '>HTTPS (TLS)</option></select></label>' +
      (c.certificateName ? certificatePanel(c) : '<p class="hint">For HTTPS, choose Certificate in the palette, then click this server.</p>') +
      '<label>TCP port<input id="web-port" type="number" min="1" max="65535" required value="' +
      c.port +
      '"></label><label>HTML response<textarea id="web-body" rows="12" maxlength="8000" spellcheck="false">' + esc(NetworkExplorerHTTP.responseHtml(c)) +
      '</textarea></label><p id="web-settings-status" class="hint" role="status" aria-live="polite"></p></form>'
    );
  }
  const browserDrafts = new Map();
  function renderBrowserHtml(html) {
    const doc=new DOMParser().parseFromString(html,'text/html');
    const allowed=new Set('p div span h1 h2 h3 h4 h5 h6 strong b em i u s small sub sup br hr pre code blockquote ul ol li dl dt dd table thead tbody tfoot tr th td caption'.split(' '));
    const render=node=>{
      if(node.nodeType===3)return esc(node.textContent);
      if(node.nodeType!==1)return '';
      let tag=node.localName;
      if(['script','style','iframe','object','embed','link','meta','img','svg','math','template'].includes(tag))return '';
      if(tag==='bold')tag='strong';
      const content=Array.from(node.childNodes,render).join('');
      return allowed.has(tag)?'<'+tag+'>'+content+(['br','hr'].includes(tag)?'':'</'+tag+'>'):content;
    };
    return '<div class="browser-html">'+Array.from(doc.body.childNodes,render).join('')+'</div>';
  }
  function browserSecurityMarkup(url,page) {
    const https=/^https:/i.test(url),same=page?.url===url,verified=https&&same&&page?.secure,
      failed=https&&same&&/rejected|failed|mismatch|refused|timed out/i.test(page?.status||'');
    const state=failed?'failed':https?(verified?'secure':'pending'):'insecure';
    const label=failed?'HTTPS connection failed':https?(verified?'HTTPS - certificate verified; connection encrypted':'HTTPS - certificate not yet verified'):'HTTP - not secure; messages are readable on the network';
    const shape=https&&!failed?'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>':'<path d="M12 3 2 21h20ZM12 9v5M12 17v1"/>';
    return '<span class="browser-security '+state+'" role="img" aria-label="'+label+'" title="'+label+'"><svg viewBox="0 0 24 24" aria-hidden="true">'+shape+'</svg></span>';
  }
  function browserMarkup(d, expanded = false) {
    const page = net.httpPages[d.id],
      url = browserDrafts.get(d.id) ?? d.browserServer.url;
    return (
      '<div class="sim-browser"><div class="browser-tabbar"><div class="browser-tab"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-6 5-6 13 0 18M12 3c6 5 6 13 0 18"/></svg><span>' +
      esc(page?.title || "New tab") +
      "</span></div>" +
      (!expanded
        ? '<button id="expand-browser" type="button" aria-label="Expand browser" title="Expand"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7M21 3l-7 7M10 21H3v-7M3 21l7-7"/></svg></button>'
        : "") +
      '</div><form id="browser-form" class="browser-navigation"><button id="browser-reload" type="submit" aria-label="Reload page" title="Reload page"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 5v6h-6M20 11a8 8 0 1 0-2.34 6.66"/></svg></button><div class="browser-address">' + browserSecurityMarkup(url,page) + '<input id="browser-url" aria-label="Web address" type="url" required value="' +
      esc(url) +
      '" placeholder="http://server.example/"></div><button type="submit" aria-label="Go to address" title="Go"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></button></form><article class="browser-page">' +
      (page?.body !== undefined
        ? renderBrowserHtml(NetworkExplorerHTTP.responseHtml(page))
        : '<div class="browser-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-6 5-6 13 0 18M12 3c6 5 6 13 0 18"/></svg><p>Enter an address to explore your network.</p></div>') +
      '</article><div id="browser-status" role="status">' +
      esc(page?.status || "Ready") +
      "</div></div>"
    );
  }
  function browseFrom(id, url) {
    safely(() => {
      if (candidateBase)
        throw Error(
          "Commit or revert candidate changes before starting traffic.",
        );
      const target=staged?.trial||net;
      if ((staged || net.queue.length) && !target.isDosActive() && !target.isSpoofActive())
        throw Error("Finish or clear the current exchange first.");
      finishPlacement();
      cancelConnect();
      target.browse(id, url.trim());
      if(target!==net){net.httpPages[id]={...target.httpPages[id]};net.device(id).browserServer.url=target.device(id).browserServer.url;}
      browserDrafts.delete(id);
      running = true;
      stage();
      syncExternal();
    });
  }
  function expandBrowser(d) {
    const key = "browser:" + d.id;
    if (
      !openExternal(
        key,
        "Browser - " + d.name,
        () => {
          const current = net.device(d.id);
          return current?.browserServer
            ? browserMarkup(current, true)
            : "<p>This browser is no longer installed.</p>";
        },
        () => {},
      )
    )
      return;
    const entry = externalPanels.get(key);
    if (entry.browserBound) return;
    entry.browserBound = true;
    const host = entry.host;
    host.addEventListener(
      "input",
      (e) => {
        if (e.target.id === "browser-url") {
          browserDrafts.set(d.id, e.target.value);
          e.target.previousElementSibling.outerHTML=browserSecurityMarkup(e.target.value,net.httpPages[d.id]);
          e.stopImmediatePropagation();
        }
      },
      true,
    );
    host.addEventListener(
      "submit",
      (e) => {
        if (e.target.id === "browser-form") {
          e.preventDefault();
          e.stopImmediatePropagation();
          browseFrom(d.id, host.querySelector("#browser-url").value);
        }
      },
      true,
    );
    host.addEventListener(
      "click",
      (e) => {
        if (e.target.closest(".browser-navigation button"))
          e.stopImmediatePropagation();
      },
      true,
    );
  }
  function bindWebPanel(d, type) {
    if (type === "browser") {
      $("browser-url").oninput = (e) => {browserDrafts.set(d.id, e.target.value);e.target.previousElementSibling.outerHTML=browserSecurityMarkup(e.target.value,net.httpPages[d.id]);};
      $("browser-form").onsubmit = (e) => {
        e.preventDefault();
        browseFrom(d.id, $("browser-url").value);
      };
      $("expand-browser").onclick = () => expandBrowser(d);
    } else {
      styleInspectorSelect('web-tls','Transport',value=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+(value==='https'?'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>':'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-6 5-6 13 0 18M12 3c6 5 6 13 0 18"/>')+'</svg>');
      const form=$('web-settings'),origin=net;let timer;
      const save=()=>{
        clearTimeout(timer);
        if(!form.isConnected||net!==origin)return;
        const status=form.querySelector('#web-settings-status');
        if(!form.checkValidity()){status.textContent='Complete the highlighted fields to apply changes.';return;}
        const read=id=>form.querySelector('#'+id);
        const config={...(d.webServer.synCapacity!==undefined?{synCapacity:d.webServer.synCapacity}:{}),...(d.webServer.synTimeout!==undefined?{synTimeout:d.webServer.synTimeout}:{}),enabled:read('web-enabled').checked,tls:read('web-tls').value==='https',port:Number(read('web-port').value),title:new DOMParser().parseFromString(read('web-body').value,'text/html').title.slice(0,80),body:read('web-body').value,
          ...(read('certificate-name')?{certificateName:read('certificate-name').value.trim().toLowerCase(),certificateTrusted:read('certificate-trusted').checked,certificateValid:read('certificate-valid').checked}:{})};
        try{NetworkExplorerHTTP.create({}).validate(config);}catch(error){status.textContent=error.message;return;}
        if(JSON.stringify(config)===JSON.stringify(d.webServer))return;
        const active=document.activeElement,focusId=form.contains(active)?active.id:null,start=active?.selectionStart,end=active?.selectionEnd;
        mutate(()=>net.configureWeb(d.id,config));
        const field=focusId&&$(focusId);if(field){field.focus({preventScroll:true});if(typeof start==='number'&&['text','textarea'].includes(field.type))field.setSelectionRange(start,end);}
      };
      form.oninput=e=>{if(e.target.type==='checkbox'||e.target.tagName==='SELECT')return;clearTimeout(timer);timer=setTimeout(save,350);};
      form.onchange=e=>{if(e.target.id==='web-tls'){const port=form.querySelector('#web-port');if(port.value==='80'||port.value==='443')port.value=e.target.value==='https'?'443':'80';}save();};
      form.onsubmit=e=>{e.preventDefault();save();};
      if($('remove-certificate'))$('remove-certificate').onclick=()=>{clearTimeout(timer);mutate(()=>{const config={...d.webServer,tls:false,port:d.webServer.port===443?80:d.webServer.port};delete config.certificateName;delete config.certificateTrusted;delete config.certificateValid;net.configureWeb(d.id,config);});};
    }
  }

  function applicationInspector() {
    const a = applications().find((a) => a.id === selected);
    if (!a) return false;
    const d = net.device(a.host);
    $("inspector-title").innerHTML =
      '<svg class="inspector-device-icon application-icon" viewBox="-30 -26 60 52">' +
      appGlyph(a.type) +
      "</svg><span>" +
      appLabel(a.type) +
      "</span>";
    if(d && ["firewall","ids"].includes(a.type)) {
      bindWatch(d);
      $("inspector").innerHTML='<p class="hint">Built into <button id="application-host" class="application-host">'+noteTargetIcon(d.id)+'<span>'+esc(d.name)+'</span></button></p><p class="hint">Enable and configure in the device Inspector.</p>'+NetworkExplorerFirewallUI.panel(net,d,esc,expiryMarkup,a.type);
      $("application-host").onclick=()=>select(d.id);
      NetworkExplorerFirewallUI.bindEvidence(d,(id,order)=>{openTool('events',true);if(!NetworkExplorerCapture.revealEvent(id,order))say('This packet is no longer in Activity. Run a fresh scan.');syncExternal();});
      return true;
    }
    bindWatch(d, a.type);
    $("inspector").innerHTML = d
      ? '<div class="application-inspector-content"><p class="hint">Installed on <button id="application-host" class="application-host">' +
        noteTargetIcon(d.id) +
        "<span>" +
        esc(d.name) +
        "</span></button></p>" +
        (a.type === "spoofer" ? NetworkExplorerArpSecurityUI.attackPanel(net,d,esc) : a.type === "generator" ? generatorPanel(d) : a.type === "nmap" ? nmapPanel(d) : a.type === "echo" ? NetworkExplorerEchoUI.markup(net,d,esc) : ["web", "browser"].includes(a.type)
          ? webPanel(d, a.type)
          : a.type === "dns"
            ? dnsPanel(d)
            : dhcpPanel(d)) +
        '</div><div class="application-inspector-footer"><button id="uninstall-app" class="danger destructive-action"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/></svg>Uninstall application</button></div>'
      : '<p class="hint">Connect this application to a host, or drag it directly onto one.</p><button id="attach-app">Connect to host</button><button id="remove-app" class="danger">Remove application</button>';
    if (d) {
      $("application-host").onclick = () => {
        selected = d.id;
        render();
      };
      if(a.type === "spoofer") NetworkExplorerArpSecurityUI.bindAttack($('inspector'),net,d,{
        styleSelect:styleInspectorSelect,
        run:c=>safely(()=>{if(candidateBase||staged)throw Error('Finish the current exchange and commit candidate changes first.');net.configureSpoofer(d.id,c);net.spooferControl(d.id,'start');running=true;stage();render();}),
        stop:()=>safely(()=>{net.spooferControl(d.id,'stop');if(staged)staged.trial.spooferControl(d.id,'stop');render();}),
      });
      else if(a.type === "generator") bindGenerator(d);
      else if(a.type === "nmap") $("nmap-terminal").onclick=()=>nmapTerminal(d.id);
      else if (a.type === "echo") NetworkExplorerEchoUI.bind(document.getElementById('inspector'),d.id,{
        get:()=>net, refresh:()=>render(), configure:c=>mutate(()=>net.configureEcho(d.id,c)),
        styleSelect:(id,label)=>styleInspectorSelect(id,label,()=>''),
        control:(action,thread)=>safely(()=>{if(candidateBase)throw Error('Commit or revert candidate changes first.');
          net.echoControl(d.id,action,thread);if(staged)staged.trial.echoControl(d.id,action,thread);
          if(action!=='pause'){running=true;stage();}render();}),
        reset:()=>safely(()=>{if(candidateBase)throw Error('Commit or revert candidate changes first.');net.echoControl(d.id,'reset');if(staged)staged.trial.echoControl(d.id,'reset');if(net.queue.length){running=true;stage();}render();})
      });
      else if (["web", "browser"].includes(a.type)) bindWebPanel(d, a.type);
      else if (a.type === "dns") bindDnsPanel(d);
      else {
        const panel = $("inspector").querySelector(".dhcp-application");
        panel.open = true;
        panel.querySelector("summary").remove();
        $("inspector").querySelector(".inspector-section-heading").remove();
        bindDhcpPools(d);
      }
      $("uninstall-app").onclick = () =>
        confirmRemoval(
          "Uninstall " +
            appLabel(a.type) +
            " from " +
            d.name +
            " and remove its configuration?",
          () => {
            if(a.type === "spoofer"){delete d.spooferServer;delete d.spooferOffset;delete d.spooferWatch;net.reset();}
            else if(a.type === "generator"){delete d.generatorServer;delete d.generatorOffset;net.reset();}
            else if(a.type === "nmap"){delete d.nmapServer;delete d.nmapWatch;delete d.nmapOffset;net.reset();}
            else if(a.type === "echo"){delete d.echoServer;delete d.echoWatch;delete d.echoOffset;net.reset();}
            else if (["web", "browser"].includes(a.type))
              net.uninstallWeb(d.id, a.type);
            else if (a.type === "dns") net.uninstallDns(d.id);
            else net.uninstallDhcp(d.id);
            selected = d.id;
          },
        );
    } else {
      $("attach-app").onclick = () => {
        appConnecting = a.id;
        say("Click a host to install the application. Escape cancels.");
      };
      $("remove-app").onclick = () =>
        confirmRemoval("Remove " + appLabel(a.type) + "?", () => {
          net.applicationDrafts = net.applicationDrafts.filter(
            (x) => x.id !== a.id,
          );
          selected = null;
        });
    }
    return true;
  }
  let appConnecting = null,
    appGesture = null,
    lastApplicationClick = null;
  function installOnHost(id, host) {
    mutate(() => {
      const type = net.applicationDrafts.find((a) => a.id === id)?.type;
      net.installApplication(id, host);
      selected = type + ":" + host;
    });
    appConnecting = null;
  }

  function dnsPanel(d) {
    return (
      '<label><input type="checkbox" id="dns-enabled" ' +
      (d.dnsServer.enabled ? "checked" : "") +
      '> Enable DNS server</label><div class="small-heading inspector-section-heading">A records' +
      dhcpAction("Add DNS record", "M12 4v16M4 12h16", 'id="dns-add-record"') +
      '</div><div id="dns-records">' +
      d.dnsServer.records
        .map(
          (r, i) =>
            '<details class="dns-record"><summary><svg class="dns-record-type" viewBox="0 0 24 24" role="img" aria-label="A record"><rect x="2" y="2" width="20" height="20" rx="4"/><path d="m7 17 5-10 5 10M9 13h6"/></svg><span class="dns-record-summary">' +
            esc(r.name) +
            "<small>" +
            esc(r.address) +
            " &middot; TTL " +
            r.ttl +
            's</small></span><svg class="dns-record-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></summary>' +
            dnsEditor(r, i) +
            "</details>",
        )
        .join("") +
      '</div><p class="hint">Local A records only. Unknown names return NXDOMAIN.</p>'
    );
  }
  function dnsEditor(r = {}, index = -1) {
    return (
      '<form class="dns-record-form" data-index="' +
      index +
      '"><label>Name<input name="name" placeholder="server.example" value="' +
      esc(r.name || "") +
      '" required></label><label>IPv4 address<input name="address" placeholder="192.168.1.20" value="' +
      esc(r.address || "") +
      '" required></label><label>TTL (seconds)<input name="ttl" type="number" min="1" max="86400" value="' +
      (r.ttl ?? 120) +
      '" required></label><div class="dhcp-pool-actions"><button type="submit" class="section-expand" aria-label="Save DNS record" title="Save DNS record"><svg viewBox="0 0 24 24"><path d="M4 3h13l4 4v14H3V3h1ZM7 3v6h9V3M7 21v-8h10v8"/></svg></button>' +
      dhcpAction(
        "Cancel DNS changes",
        "M6 6l12 12M18 6 6 18",
        "data-dns-cancel",
      ) +
      (index >= 0
        ? dhcpAction(
            "Delete DNS record",
            "M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14",
            "data-dns-delete",
          )
        : "") +
      "</div></form>"
    );
  }
  function bindDnsPanel(d) {
    const save = (records) =>
      net.configureDnsServer(d.id, { enabled: d.dnsServer.enabled, records });
    $("dns-enabled").onchange = (e) =>
      mutate(() =>
        net.configureDnsServer(d.id, {
          ...d.dnsServer,
          enabled: e.target.checked,
        }),
      );
    function bind(form) {
      const index = Number(form.dataset.index);
      form.onsubmit = (e) => {
        e.preventDefault();
        const data = new FormData(form),
          r = {
            name: data.get("name").trim().toLowerCase().replace(/\.$/, ""),
            address: data.get("address").trim(),
            ttl: Number(data.get("ttl")),
          },
          records = d.dnsServer.records.map((r) => ({ ...r }));
        if (index < 0) records.push(r);
        else records[index] = r;
        mutate(() => save(records));
      };
      form.querySelector("[data-dns-cancel]").onclick = () => {
        if (index < 0) {
          form.remove();
          $("dns-add-record").disabled = false;
        } else {
          form.reset();
          form.closest("details").open = false;
        }
      };
      const del = form.querySelector("[data-dns-delete]");
      if (del)
        del.onclick = () =>
          confirmRemoval(
            "Delete DNS record " + d.dnsServer.records[index].name + "?",
            () => save(d.dnsServer.records.filter((_, i) => i !== index)),
          );
    }
    document.querySelectorAll(".dns-record-form").forEach(bind);
    $("dns-add-record").onclick = () => {
      const wrap = document.createElement("div");
      wrap.innerHTML = dnsEditor();
      const form = wrap.firstElementChild;
      $("dns-records").append(form);
      bind(form);
      $("dns-add-record").disabled = true;
      form.querySelector("input").focus();
    };
  }
  function dnsCacheTable(d) {
    const rows = Object.entries(net.dnsCache[d.id] || {});
    return rows.length
      ? "<table><thead><tr><th>Name / address</th><th>Expires</th></tr></thead><tbody>" +
          rows
            .map(
              ([name, r]) =>
                "<tr><td>" +
                esc(name) +
                "<br>" +
                esc(r.address) +
                "</td><td>" +
                expiryMarkup(r.expiresAt, r.ttl || 120) +
                "</td></tr>",
            )
            .join("") +
          "</tbody></table>"
      : '<p class="hint">No cached DNS answers.</p>';
  }
  function bindHostDns(d) {
    const field = document.createElement("label");
    field.innerHTML =
      'DNS server<input id="host-dns" value="' +
      esc(d.dnsServerAddress || "") +
      '" placeholder="Optional" ' +
      (d.addressMode === "dhcp" ? "readonly" : "") +
      ">";
    $("host-gateway").parentElement.after(field);
    $("host-dns").onchange = (e) =>
      mutate(() => net.configureDnsAddress(d.id, e.target.value.trim()));
    const cache = document.createElement("div");
    cache.innerHTML =
      '<div class="small-heading inspector-section-heading">DNS cache</div><div id="dns-cache">' +
      dnsCacheTable(d) +
      "</div>";
    $("inspector-table").after(cache);
  }
  function startDns(id, name) {
    if (candidateBase) throw Error("Commit configuration first.");
    if (staged || net.queue.length)
      throw Error("Finish the current exchange first.");
    finishPlacement();
    cancelConnect();
    net.lookupDns(id, name, false, false);
    running = true;
    stage();
  }
  function dhcpPools(d) {
    const c = d.dhcpServer;
    return c ? c.pools || [{ ...c, name: "Default" }] : [];
  }
  function dhcpAction(label, path, attrs = "") {
    return (
      '<button type="button" class="section-expand" aria-label="' +
      label +
      '" title="' +
      label +
      '" ' +
      attrs +
      '><svg viewBox="0 0 24 24" aria-hidden="true"><path d="' +
      path +
      '"/></svg></button>'
    );
  }
  function dhcpPoolEditor(c = {}, index = -1) {
    return (
      '<form class="dhcp-pool-form" data-pool-index="' +
      index +
      '"><label>Pool name<input name="name" maxlength="40" value="' +
      esc(c.name || "") +
      '" required></label><div class="pair"><label>Pool start<input name="start" value="' +
      esc(c.start || "") +
      '" placeholder="192.168.1.100" required></label><label>Pool end<input name="end" value="' +
      esc(c.end || "") +
      '" placeholder="192.168.1.120" required></label></div><div class="pair"><label>Gateway (optional)<input name="gateway" value="' +
      esc(c.gateway || "") +
      '"></label><label>Prefix<input name="prefix" type="number" min="1" max="30" value="' +
      (c.prefix ?? 24) +
      '" required></label></div><label>DNS server (optional)<input name="dns" value="' +
      esc(c.dns || "") +
      '" placeholder="192.168.1.2"></label><div class="pair"><label>Lease (seconds)<input name="leaseSeconds" type="number" min="30" max="86400" value="' +
      (c.leaseSeconds ?? 120) +
      '" required></label><div class="dhcp-pool-actions"><button type="submit" class="section-expand" aria-label="Save pool" title="Save pool"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h13l4 4v14H3V3h1ZM7 3v6h9V3M7 21v-8h10v8"/></svg></button>' +
      dhcpAction(
        "Cancel pool changes",
        "M6 6l12 12M18 6 6 18",
        "data-pool-cancel",
      ) +
      (index >= 0
        ? dhcpAction(
            "Delete pool",
            "M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 10v7M14 10v7",
            "data-pool-delete",
          )
        : "") +
      "</div></div></form>"
    );
  }
  function dhcpPanel(d) {
    const c = d.dhcpServer || { enabled: false },
      pools = dhcpPools(d);
    return (
      '<div class="small-heading inspector-section-heading">Applications</div><details class="dhcp-application" ' +
      (c.enabled ? "open" : "") +
      "><summary>DHCP server <span>" +
      (c.enabled ? "Enabled" : "Off") +
      '</span></summary><div id="dhcp-server-form"><label class="dhcp-enable"><input id="dhcp-server-enabled" type="checkbox" role="switch" ' +
      (c.enabled ? "checked" : "") +
      '> Enable DHCP server</label><div class="small-heading inspector-section-heading">Pools' +
      dhcpAction("Add DHCP pool", "M12 4v16M4 12h16", 'id="dhcp-pool-add"') +
      '</div><div id="dhcp-pools">' +
      pools
        .map(
          (pool, i) =>
            '<details class="dhcp-pool"><summary>' +
            esc(pool.name) +
            "<small>" +
            esc(pool.start) +
            " &ndash; " +
            esc(pool.end) +
            " /" +
            (pool.prefix ?? d.prefix) +
            "</small></summary>" +
            dhcpPoolEditor({ ...pool, prefix: pool.prefix ?? d.prefix }, i) +
            "</details>",
        )
        .join("") +
      '</div><p class="hint">One pool per subnet. Relay address (giaddr) selects remote pools. Lease renewal is manual.</p></div><div id="dhcp-leases">' +
      dhcpLeases(d) +
      "</div></details>"
    );
  }
  function bindDhcpPools(d) {
    const save = (pools, enabled = d.dhcpServer?.enabled || false) =>
      net.configureDhcpServer(d.id, { enabled, pools });
    $("dhcp-server-enabled").onchange = (e) => {
      const enabled = e.target.checked;
      mutate(() => save(dhcpPools(d), enabled));
      e.target.checked = !!net.device(d.id).dhcpServer?.enabled;
    };
    function bind(form) {
      const index = Number(form.dataset.poolIndex);
      form.onsubmit = (e) => {
        e.preventDefault();
        const data = new FormData(form),
          pool = Object.fromEntries(data);
        pool.name = pool.name.trim();
        for (const key of ["start", "end", "gateway", "dns"])
          pool[key] = pool[key].trim();
        pool.prefix = Number(pool.prefix);
        pool.leaseSeconds = Number(pool.leaseSeconds);
        const pools = dhcpPools(d).map((p) => ({ ...p }));
        if (index < 0) pools.push(pool);
        else pools[index] = pool;
        mutate(() => save(pools));
      };
      form.querySelector("[data-pool-cancel]").onclick = () => {
        if (index < 0) {
          form.remove();
          $("dhcp-pool-add").disabled = false;
        } else {
          form.reset();
          form.closest("details").open = false;
        }
      };
      const del = form.querySelector("[data-pool-delete]");
      if (del) {
        form.closest("details").querySelector("summary").append(del);
      }
      if (del)
        del.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!confirm("Delete DHCP pool " + dhcpPools(d)[index].name + "?"))
            return;
          const pools = dhcpPools(d).filter((_, i) => i !== index);
          mutate(() =>
            save(pools, pools.length ? !!d.dhcpServer?.enabled : false),
          );
        };
    }
    document.querySelectorAll(".dhcp-pool-form").forEach(bind);
    $("dhcp-pool-add").onclick = () => {
      const wrap = document.createElement("div");
      wrap.innerHTML = dhcpPoolEditor();
      const form = wrap.firstElementChild;
      $("dhcp-pools").append(form);
      bind(form);
      $("dhcp-pool-add").disabled = true;
      form.querySelector("input").focus();
    };
  }
  function startDhcp(id) {
    if (candidateBase)
      throw Error(
        "Commit or revert candidate changes before starting traffic.",
      );
    if (staged || net.queue.length)
      throw Error("Finish or clear the current exchange first.");
    finishPlacement();
    cancelConnect();
    net.acquireDhcp(id);
    dhcpStatusRequested.add(net.device(id));
    refreshDhcp();
    running = true;
    stage();
  }
  function bindHostAddressing(d) {
    const mode = document.createElement("label");
    mode.innerHTML =
      'Addressing<select id="host-address-mode"><option value="manual">Static</option><option value="dhcp">Automatic (DHCP)</option></select>';
    $("host-ip").closest(".pair").before(mode);
    $("host-address-mode").value = d.addressMode || "manual";
    $("host-address-mode").onchange = (e) => {
      const value = e.target.value;
      mutate(() => net.configureAddressMode(d.id, value));
    };
    const automatic = d.addressMode === "dhcp";
    for (const id of ["host-ip", "host-prefix"])
      $(id).readOnly = automatic;
    {
      const client = document.createElement("div");
      client.className = "dhcp-client";
      client.hidden =
        !automatic ||
        !(d.lease || net.dhcpPending[d.id] || dhcpStatusRequested.has(d));
      client.setAttribute("role", "status");
      client.innerHTML =
        '<div id="dhcp-client-status">' +
        dhcpClientStatus(d) +
        '</div><button id="dhcp-acquire" class="section-expand" type="button" aria-label="' +
        (d.lease ? "Renew lease" : "Acquire DHCP lease") +
        '" title="' +
        (d.lease ? "Renew lease" : "Acquire DHCP lease") +
        '"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h5M7 13h2m3 0h2M17 9v6m-2-2 2 2 2-2"/></svg></button>';
      $("host-address-mode").parentElement.after(client);
      $("dhcp-acquire").disabled = !automatic;
      $("dhcp-acquire").onclick = () => safely(() => startDhcp(d.id));
    }
    styleInspectorSelect("host-address-mode", "Addressing");
    const picker = $("host-address-mode-toggle").parentElement;
    picker.classList.add("addressing-picker");
    picker.append($("dhcp-acquire"));
  }
  function bindDhcp(d) {
    if (d.type !== "host") return;
    $("host-gateway").readOnly = d.addressMode === "dhcp";
    for (const type of ["dhcp", "dns", "web", "browser", "echo", "nmap", "generator", "spoofer"]) {
      const installed = $("host-" + type + "-app");
      if (installed)
        installed.onclick = () => selectApplication(type + ":" + d.id);
    }
    bindHostDns(d);
  }
  function refreshDhcp() {
    const d = net.device(
      selected?.startsWith("dhcp:") ? selected.slice(5) : selected,
    );
    if (d?.type === "host") {
      if ($("dns-cache")) $("dns-cache").innerHTML = dnsCacheTable(d);
      if ($("dhcp-client-status")) {
        $("dhcp-client-status").innerHTML = dhcpClientStatus(d);
        $("dhcp-client-status").parentElement.hidden =
          d.addressMode !== "dhcp" ||
          !(d.lease || net.dhcpPending[d.id] || dhcpStatusRequested.has(d));
      }
      if ($("dhcp-acquire")) {
        const label = d.lease ? "Renew lease" : "Acquire DHCP lease";
        $("dhcp-acquire").setAttribute("aria-label", label);
        $("dhcp-acquire").dataset.tooltip = label;
      }
      if ($("dhcp-leases")) $("dhcp-leases").innerHTML = dhcpLeases(d);
      if (d.addressMode === "dhcp") {
        for (const [id, value] of [
          ["host-ip", d.ip],
          ["host-prefix", d.prefix ?? ""],
          ["host-gateway", d.gateway],
          ["host-dns", d.dnsServerAddress || ""],
        ])
          if ($(id)) $(id).value = value;
      }
    }
    document
      .querySelectorAll("[data-lease-expiry]")
      .forEach(
        (e) =>
          (e.textContent =
            Math.max(
              0,
              Math.ceil((Number(e.dataset.leaseExpiry) - Date.now()) / 1000),
            ) + "s"),
      );
  }
  function setTerminalPickerOpen(open) {
    $('terminal-device-menu').hidden = !open;
    $('terminal-device-toggle').setAttribute('aria-expanded', String(open));
    syncExternal();
  }
  function refreshTerminalPicker() {
    const menu = $('terminal-device-menu');
    const html = net.devices.map(d => '<button type="button" id="terminal-choice-'+esc(d.id)+'" data-terminal-device="'+esc(d.id)+'" role="menuitemradio" aria-checked="'+(d.id===terminalDevice)+'"><svg class="terminal-choice-icon" viewBox="-42 -35 84 72" aria-hidden="true">'+icon(d)+'</svg><span>'+esc(d.name)+'</span><small>'+esc(d.role || d.type)+'</small><svg class="terminal-choice-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></button>').join('') || '<span class="terminal-picker-empty">Add a device to open a console.</span>';
    if (menu.innerHTML !== html) {
      menu.innerHTML = html;
      menu.querySelectorAll('[data-terminal-device]').forEach(button => {
        button.onclick = () => {
          setTerminalPickerOpen(false);
          select(button.dataset.terminalDevice);
          const root = externalPanels.get('terminal')?.window.document || document;
          root.getElementById('command')?.focus();
        };
      });
    }
  }
  function bindTerminalPicker(doc) {
    doc.addEventListener('pointerdown', e => {
      if (!e.target.closest('.terminal-device-picker') && !$('terminal-device-menu').hidden)
        setTerminalPickerOpen(false);
    });
    doc.addEventListener('keydown', e => {
      if (!e.target.closest('.terminal-device-picker')) return;
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation(); setTerminalPickerOpen(false);
        doc.getElementById('terminal-device-toggle')?.focus();
      } else if (['ArrowDown','ArrowUp','Home','End'].includes(e.key)) {
        e.preventDefault(); e.stopPropagation();
        if ($('terminal-device-menu').hidden) setTerminalPickerOpen(true);
        const choices = [...doc.querySelectorAll('#terminal-device-menu [data-terminal-device]')];
        const index = choices.indexOf(doc.activeElement);
        const next = e.key==='Home'?0:e.key==='End'?choices.length-1:e.key==='ArrowUp'?(index-1+choices.length)%choices.length:(index+1)%choices.length;
        choices[next]?.focus();
      }
    }, true);
  }
  $('terminal-device-toggle').onclick = () => setTerminalPickerOpen($('terminal-device-menu').hidden);
  bindTerminalPicker(document);
  function refreshTerminalOS() {
    let badge = $("terminal-os");
    if (!badge) {
      badge = document.createElement("span");
      badge.id = "terminal-os";
      badge.className = "terminal-os";
      $("terminal-device-toggle").closest('.terminal-device-picker').after(badge);
    }
    const d = cliDevice();
    badge.hidden = !d;
    if (!d) {
      badge.replaceChildren();
      return;
    }
    const name =
      d.type === "host"
        ? { windows: "Windows", linux: "Linux", macos: "macOS" }[
            d.os || "windows"
          ]
        : isPan(d)
          ? "PAN-OS"
          : "Cisco IOS";
    const glyph =
      d.type === "host"
        ? hostOsLogo(d).replace(/transform="[^"]*"/, "")
        : isPan(d)
          ? '<path fill="#f58025" d="m2 9 10-6 4 6-10 6zM8 15l10-6 4 6-10 6z"/>'
          : '<g stroke="#55b9df" stroke-width="2" stroke-linecap="round"><path d="M3 12v3M6 8v9M9 4v15M12 8v9M15 4v15M18 8v9M21 12v3"/></g>';
    const content =
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      glyph +
      "</svg><span>" +
      name +
      "</span>";
    if (d.type !== "host") {
      const url = isPan(d)
        ? "https://docs.paloaltonetworks.com/ngfw/pan-os-cli-quick-start/use-the-cli/cli-jump-start"
        : "https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/mcl/allreleasemcl/all-book.html";
      badge.innerHTML =
        '<a class="terminal-command-help" href="' +
        url +
        '" target="_blank" rel="noopener noreferrer" aria-label="Open official ' +
        name +
        ' command help in a new tab">' +
        content +
        "</a>";
      badge.title = "Open official " + name + " command help (new tab)";
    } else {
      badge.innerHTML = content;
      badge.title = "Operating system: " + name;
    }
  }
  function inspector() {
    switchTerminal();
    const consoleDevice = cliDevice();
    const cliReady = !!consoleDevice;
    $("command-form").classList.toggle("cli-needs-device", !cliReady);
    $("command").disabled = false;
    $("command").placeholder = cliReady
      ? "Type a command"
      : "Type @, select a device on the canvas, or use the selector above to use the CLI";
    refreshTerminalOS();
    $("prompt").textContent = consoleDevice
      ? cliPrompt(consoleDevice)
      : "Select a device on the canvas or use the selector above to use the CLI";
    $("terminal-title").textContent = consoleDevice
      ? consoleDevice.name + " - " + (consoleDevice.type === "host" ? "Host" : consoleDevice.type === "router" ? (consoleDevice.role === "firewall" ? "Firewall" : "Router") : isPan(consoleDevice) ? "PAN-OS Layer 2" : "Cisco IOS Layer 2")
      : "Terminal";
    refreshTerminalPicker();
    if (noteInspector()) return;
    if (applicationInspector()) return;
    const d = net.device(selected),
      l = net.links.find((l) => l.id === selected);
    $("inspector-title").innerHTML = d
      ? '<svg class="inspector-device-icon" viewBox="-42 -35 84 72" aria-hidden="true">' +
        icon(d) +
        "</svg><span>" +
        esc(d.name) +
        "</span>"
      : l
        ? "Ethernet connection"
        : "Inspector";
    bindWatch(d);
    if (d) {
      $("inspector").innerHTML =
        '<label>Name<input id="device-name" maxlength="40" value="' +
        esc(d.name) +
        '"></label>' +
        (d.type === "host"
          ? '<label>Operating system<select id="host-os">' +
            ["windows", "linux", "macos"]
              .map(
                (os) =>
                  '<option value="' +
                  os +
                  '" ' +
                  ((d.os || "windows") === os ? "selected" : "") +
                  ">" +
                  { windows: "Windows", linux: "Linux", macos: "macOS" }[os] +
                  "</option>",
              )
              .join("") +
            '</select></label><label>Default gateway<input id="host-gateway" value="' +
            esc(d.gateway || "") +
            '" placeholder="Optional for this subnet"></label>'
          : d.type === "router"
            ? d.firewallMode === "transparent" ? '<p class="hint">Transparent bridge: two ports, no IP address or gateway. Frames keep their addresses and TTL.</p>' : '<p class="hint">Click an interface to set its IPv4 address and prefix. Connected routes are added automatically.</p>'
            : "") +
        interfacePanel(d) +
        (d.type === "switch"
          ? vlanPanel(d) + NetworkExplorerArpSecurityUI.policyPanel(net,d,esc)
          : d.type === "router"
            ? (d.firewallMode === "transparent" ? "" : routePanel(d)) + NetworkExplorerFirewallUI.panel(net,d,esc,expiryMarkup) + (d.firewallMode === "transparent" ? "" : natPanel(d))
            : "") +
        (d.type === "host"
          ? '<p class="hint">MAC ' + esc(d.ports[0].mac) + "</p>"
          : "") +
        '<div class="small-heading inspector-section-heading">' +
        (d.type === "switch" ? "MAC forwarding table" : "ARP cache") +
        ' <button id="float-table" class="section-expand" type="button" title="Expand table" aria-label="Expand table"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7M21 3l-7 7M10 21H3v-7M3 21l7-7"/></svg></button></div><div id="inspector-table">' +
        table(
          visibleTable(d.type === "switch" ? net.mac[d.id] : net.arp[d.id], d),
          d.type,
        ) +
        "</div>" +
        (d.type === "host" ? hostApplications(d) : "") +
        '<button class="danger destructive-action" id="delete"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/></svg>Delete device</button>';
      $("float-table").onclick = () => {
        floatingDevice = d.id;
        refreshFloatingTable();
        if (
          openExternal(
            "table",
            d.name + " - Network Explorer",
            () =>
              "<h2>" +
              esc($("table-drag").textContent) +
              "</h2>" +
              $("floating-table-content").innerHTML,
            () => {
              $("dock-table").click();
            },
          )
        )
          floatingTable.hidden = true;
      };
      if (d.firewallMode === "transparent") {$("inspector-table").style.display="none";$("inspector-table").previousElementSibling.style.display="none";}
      $("device-name").onchange = (e) =>
        mutate(() => {
          d.name = e.target.value.trim() || d.name;
        });

      if (d.type === "host") {
        $("host-gateway").onchange = (e) => {
          if (!editable()) {
            render();
            return;
          }
          safely(() => {
            net.configureGateway(d.id, e.target.value.trim());
            render();
          });
        };
        $("host-os").onchange = (e) => {
          if (!editable()) {
            render();
            return;
          }
          d.os = e.target.value;
          render();
        };
      }
      bindDeviceTags(d);
      bindDevicePlatform(d);
      bindDhcp(d);
      if (d.type === "host") {
        styleInspectorSelect("host-os", "Operating system");
      }
      bindRoutes(d);
      bindNat(d);
      if(d.type === "router") NetworkExplorerFirewallUI.bind(net,d,mutate,styleInspectorSelect,(id,order)=>{openTool('events',true);if(!NetworkExplorerCapture.revealEvent(id,order))say('This packet is no longer in Activity. Run a fresh scan.');syncExternal();});
      bindVlanPanel(d);
      if(d.type==='switch')NetworkExplorerArpSecurityUI.bindPolicy($('inspector'),net,d,{configure:c=>{if(!editable())return;safely(()=>{if(candidateBase)throw Error('Commit or revert candidate changes first.');net.configureArpInspection(d.id,c);render();});}});
      if(d.type!=='switch'&&d.firewallMode!=='transparent'){
        const clear=document.createElement('button');clear.id='clear-device-arp';clear.textContent='Clear this ARP cache';$('inspector-table').after(clear);
        clear.onclick=()=>{if(!editable())return;safely(()=>{net.clearArpCache(d.id);render();});};
      }
      $("inspector")
        .querySelectorAll("[data-port]")
        .forEach((el) => {
          el.onclick = () => openPortConfig(d.id, el.dataset.port);
          el.oncontextmenu = (e) => {
            e.preventDefault();
            openPortMenu(d.id, el.dataset.port, e);
          };
        });
      $("delete").onclick = () => deleteTopologyItem(d.id);
    } else if (l) {
      const a = net.device(l.a),
        b = net.device(l.b);
      $("inspector").innerHTML =
        "<strong>Ethernet connection</strong><p>" +
        esc(a.name) +
        " / " +
        esc(a.ports.find((p) => p.id === l.ap).name) +
        " ↔ " +
        esc(b.name) +
        " / " +
        esc(b.ports.find((p) => p.id === l.bp).name) +
        '</p><label><input id="link-enabled" type="checkbox" ' +
        (l.enabled ? "checked" : "") +
        '> Cable enabled</label><button id="delete" class="danger">Delete connection</button>';
      $("link-enabled").onchange = (e) =>
        mutate(() => (l.enabled = e.target.checked));
      $("delete").onclick = () => deleteTopologyItem(l.id);
    } else
      $("inspector").innerHTML =
        '<div class="inspector-empty"><svg viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="7" width="27" height="27" rx="5" stroke-dasharray="3 4"/><path class="inspector-empty-pointer" d="m22 20 18 11-9 2-4 9z"/><path d="m31 33 6 8"/></svg><p>Select a device or cable to inspect and configure it.</p></div>';
  }
  const externalPanels = new Map();
  function openExternal(key, title, content, onDock) {
    const existing = externalPanels.get(key);
    if (existing && !existing.window.closed) {
      existing.window.focus();
      return true;
    }
    const popup = window.open(
      "about:blank",
      "network-explorer-" + key,
      "popup=yes,width=" +
        (key === "events" ? 1120 : key === "examine" ? 1100 : key === "troubleshooting" ? 760 : 430) +
        ",height=650,resizable=yes,scrollbars=yes",
    );
    if (!popup) {
      say(
        "The browser blocked the external window. Allow pop-ups to open it separately.",
      );
      return false;
    }
    const doc = popup.document;
    doc.title = title;
    const css = doc.createElement("link");
    css.rel = "stylesheet";
    css.href = new URL(
      "../assets/css/pages/network-explorer.css",
      location.href,
    ).href;
    doc.head.append(css);
    const style = doc.createElement("style");
    style.textContent =
      "body{padding:16px;max-width:none}#external-content section{border:0}button{cursor:pointer}";
    doc.head.append(style);
    doc.body.classList.add("external-panel-page");
    doc.body.dataset.panel = key;
    const header = doc.createElement("header");
    header.className = "external-panel-header";
    const heading = doc.createElement("div");
    heading.className = "external-panel-heading";
    heading.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="2" width="8" height="6" rx="1.5"/><path d="M12 8v5M5 17v-4h14v4"/><rect x="1" y="17" width="8" height="5" rx="1.5"/><rect x="15" y="17" width="8" height="5" rx="1.5"/></svg><div><div class="external-eyebrow">NETWORK EXPLORER</div><h1>' +
      esc(
        key === "lesson"
          ? "Build your first LAN"
          : title.replace(" - Network Explorer", ""),
      ) +
      "</h1><p>" +
      esc(
        key === "lesson"
          ? "Build, configure, and explore your first Ethernet network."
          : "Live view connected to your network canvas.",
      ) +
      "</p></div>";
    header.append(heading);
    doc.body.append(header);
    const dock = doc.createElement("button");
    dock.textContent = "Dock";
    dock.onclick = () => {
      externalPanels.delete(key);
      popup.close();
      onDock();
    };
    header.append(dock);
    const host = doc.createElement("div");
    host.id = "external-content";
    doc.body.append(host);
    if (key === "events") NetworkExplorerCapture.bindScroll(host);
    bindHistoryEvents(doc);
    if (key === "terminal") { installCliIpPicker(doc); bindTerminalPicker(doc); bindTerminalFocus(doc); }
    const entry = { window: popup, host, content, onDock };
    externalPanels.set(key, entry);
    if (key === "terminal")
      host.addEventListener(
        "scroll",
        (e) => {
          if (e.target.id === "terminal" && terminalSession)
            terminalSession.scroll = e.target.scrollTop;
        },
        true,
      );
    host.addEventListener("click", (e) => {
      const row = e.target.closest("[data-capture-id]");
      if (row) {
        $("events")
          .querySelector('[data-capture-id="' + row.dataset.captureId + '"]')
          ?.click();
        return;
      }
      const control = e.target.closest("button");
      if (control?.id) { $(control.id)?.click(); if (key === "troubleshooting") syncExternal(); }
    });
    host.addEventListener("keydown", (e) => {
      if (
        e.target.closest("[data-capture-id]") &&
        ["Enter", " "].includes(e.key)
      ) {
        e.preventDefault();
        e.target.click();
        return;
      }
      if (e.target.id === "command" && e.key === "Tab" && !e.shiftKey) {
        if (completeCommand(e.target)) e.preventDefault();
        return;
      }
      if (
        e.target.id === "command" &&
        ["ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        recallCommand(e.key);
        e.target.value = $("command").value;
      }
    });
    host.addEventListener("input", (e) => {
      const original = $(e.target.id);
      if (original) original.value = e.target.value;
    });
    host.addEventListener("submit", (e) => {
      e.preventDefault();
      const form = $(e.target.id);
      if (form)
        form.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });
    host.addEventListener("change", (e) => {
      const original = $(e.target.id);
      if (original) {
        original.checked = e.target.checked;
        original.value = e.target.value;
        original.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    bindPortGlow(host);
    host.addEventListener("pointerover", (e) =>
      highlightTableDevice(e.target.closest("[data-table-mac]")),
    );
    host.addEventListener("pointerout", () => highlightTableDevice(null));
    host.addEventListener("focusin", (e) =>
      highlightTableDevice(e.target.closest("[data-table-mac]")),
    );
    host.addEventListener("focusout", () => highlightTableDevice(null));
    popup.addEventListener("pagehide", () => {
      if (externalPanels.get(key) === entry) {
        externalPanels.delete(key);
        onDock();
      }
    });
    syncExternal();
    NetworkExplorerTooltips.install(popup);
    return true;
  }
  function syncExternal() {
    for (const [key, entry] of externalPanels) {
      if (entry.window.closed) {
        externalPanels.delete(key);
        entry.onDock();
        continue;
      }
      const html = entry.content();
      if (entry.host.innerHTML !== html) {
        const focused = entry.window.document.activeElement;
        const focusId = focused?.id;
        const start = focused?.selectionStart,
          end = focused?.selectionEnd;
        const captureScroll = entry.host.querySelector(".capture-scroll"),
          captureTop = captureScroll?.scrollTop || 0,
          captureLeft = captureScroll?.scrollLeft || 0;
        entry.host.innerHTML = html;
        const nextCapture = entry.host.querySelector(".capture-scroll");
        if (nextCapture) {
          nextCapture.scrollTop = captureTop;
          nextCapture.scrollLeft = captureLeft;
          NetworkExplorerCapture.scrollLatest(entry.host);
        }
        const next = focusId
          ? entry.window.document.getElementById(focusId)
          : null;
        if (next) {
          next.focus();
          if (start != null && next.setSelectionRange)
            next.setSelectionRange(start, end);
        }
        const terminal = entry.host.querySelector("#terminal");
        if (terminal) terminal.scrollTop = terminalSession?.scroll || 0;
      }
    }
  }
  window.addEventListener("pagehide", () => {
    for (const entry of externalPanels.values()) entry.window.close();
  });
  let floatingDevice = null;
  const floatingTable = document.createElement("section");
  floatingTable.id = "floating-table";
  floatingTable.hidden = true;
  floatingTable.setAttribute("aria-label", "Floating device table");
  floatingTable.innerHTML =
    '<div class="floating-table-header"><button id="table-drag" title="Drag to move; arrow keys also move this panel"></button><button id="dock-table">Dock</button></div><div id="floating-table-content"></div>';
  document.body.append(floatingTable);
  function refreshFloatingTable() {
    const d = net.device(floatingDevice);
    if (!d) {
      floatingDevice = null;
      floatingTable.hidden = true;
      return;
    }
    floatingTable.hidden = externalPanels.has("table");
    $("table-drag").textContent =
      d.name +
      " / " +
      (d.type === "switch" ? "MAC forwarding table" : "ARP cache");
    $("floating-table-content").innerHTML = table(
      visibleTable(d.type === "switch" ? net.mac[d.id] : net.arp[d.id], d),
      d.type,
    );
    if (selected === d.id && $("inspector-table")) {
      $("inspector-table").innerHTML =
        '<p class="hint">Table is in the floating panel.</p>';
      $("float-table").hidden = true;
    }
  }
  $("dock-table").onclick = () => {
    floatingDevice = null;
    floatingTable.hidden = true;
    highlightTableDevice(null);
    inspector();
    $("float-table")?.focus();
  };
  let tableDrag = null;
  function positionTable(x, y) {
    floatingTable.style.left =
      Math.max(0, Math.min(x, window.innerWidth - floatingTable.offsetWidth)) +
      "px";
    floatingTable.style.top =
      Math.max(0, Math.min(y, window.innerHeight - 50)) + "px";
    floatingTable.style.right = "auto";
  }
  $("table-drag").onpointerdown = (e) => {
    if (e.button !== 0) return;
    const r = floatingTable.getBoundingClientRect();
    tableDrag = { x: e.clientX - r.left, y: e.clientY - r.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  $("table-drag").onpointermove = (e) => {
    if (tableDrag)
      positionTable(e.clientX - tableDrag.x, e.clientY - tableDrag.y);
  };
  $("table-drag").onpointerup = $("table-drag").onpointercancel = () =>
    (tableDrag = null);
  $("table-drag").onkeydown = (e) => {
    const delta = {
      ArrowLeft: [-20, 0],
      ArrowRight: [20, 0],
      ArrowUp: [0, -20],
      ArrowDown: [0, 20],
    }[e.key];
    if (delta) {
      e.preventDefault();
      const r = floatingTable.getBoundingClientRect();
      positionTable(r.left + delta[0], r.top + delta[1]);
    }
  };
  function highlightTableDevice(row) {
    const mac = row?.dataset.tableMac;
    const device = mac
      ? net.devices.find((d) => d.ports.some((p) => p.mac === mac))
      : null;
    $("devices")
      .querySelectorAll("[data-device]")
      .forEach((node) =>
        node.classList.toggle(
          "table-highlight",
          node.dataset.device === device?.id,
        ),
      );
  }
  for (const event of ["pointerover", "focusin"])
    document.addEventListener(event, (e) =>
      highlightTableDevice(e.target.closest("[data-table-mac]")),
    );
  for (const event of ["pointerout", "focusout"])
    $("inspector").addEventListener(event, (e) =>
      highlightTableDevice(e.relatedTarget?.closest?.("[data-table-mac]")),
    );

  function noteTarget(id) {
    return net.device(id) || applications().find((a) => a.id === id);
  }
  function noteTargetAnchor(note) {
    const target=noteTarget(note.target);
    if(!target)return null;
    const device=net.device(note.target);
    const points=device
      ? ['top','right','bottom','left'].map(side=>portPosition(device,side))
      : [{x:target.x,y:target.y-26},{x:target.x+30,y:target.y},{x:target.x,y:target.y+26},{x:target.x-30,y:target.y}];
    return points.reduce((best,p)=>Math.hypot(p.x-note.x-16,p.y-note.y-18)<Math.hypot(best.x-note.x-16,best.y-note.y-18)?p:best);
  }
  function noteName(n) {
    return (
      n.title?.trim() ||
      n.text.trim().split("\n")[0].slice(0, 60) ||
      "Untitled note"
    );
  }
  function parseTags(value) {
    return [
      ...new Set(
        value
          .split(",")
          .map((t) => t.trim().replace(/^#/, "").slice(0, 40))
          .filter(Boolean),
      ),
    ].slice(0, 20);
  }
  function tagEditor(item) {
    return (
      '<label>Tags<input id="item-tags" value="' +
      esc((item.tags || []).join(", ")) +
      '" placeholder="Students, Exercise 1"></label><div class="tag-chips">' +
      (item.tags || []).map((t) => "<span>#" + esc(t) + "</span>").join("") +
      "</div>"
    );
  }
  function bindDeviceTags(d) {
    const wrap = document.createElement("div");
    wrap.innerHTML = tagEditor(d);
    $("device-name").parentElement.after(wrap);
    $("item-tags").onchange = (e) => {
      d.tags = parseTags(e.target.value);
      render();
    };
  }
  function createNote(x, y, target = null) {
    if (net.notes.length >= 100) {
      say("Maximum 100 notes.");
      return;
    }
    finishPlacement();
    let i = 1;
    while (net.notes.some((n) => n.id === "note" + i)) i++;
    const n = {
      id: "note" + i,
      text: "",
      x,
      y,
      width: 200,
      height: 130,
      color: "yellow",
      tags: [],
      target,
    };
    net.notes.push(n);
    selected = n.id;
    openInspector();
    render();
    $("note-text").focus();
  }
  function noteSymbol() {
    return '<svg class="inspector-device-icon note-symbol" viewBox="0 0 32 36" aria-hidden="true">'+noteArtwork()+'</svg>';
  }
  function noteArtwork() {
    return '<g class="note-art" stroke="#58748e" stroke-width="1.4" stroke-linejoin="round"><path d="M6 4h16l8 8v23H6Z" fill="#b5cbdc" stroke="none"/><path class="note-paper" d="M3 1h17l7 7v25H3Z" fill="#edf4fa"/><path d="M20 1v7h7" fill="#c2d8e8"/><path d="M7 13h16M7 18h16M7 23h11" fill="none" stroke="#87a6bd"/><rect x="7" y="27" width="7" height="2" rx="1" fill="#adc8db" stroke="none"/></g>';
  }
  function noteTargetIcon(id) {
    const d = net.device(id),
      a = applications().find((a) => a.id === id);
    return d
      ? '<svg class="note-target-icon" viewBox="-42 -35 84 72" aria-hidden="true">' +
          icon(d) +
          "</svg>"
      : a
        ? '<svg class="note-target-icon" viewBox="-30 -26 60 52" aria-hidden="true">' +
          appGlyph(a.type) +
          "</svg>"
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="m6 6 12 12"/></svg>';
  }
  function drawNotes() {
    let layer = $("notes");
    if (!layer) {
      layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      layer.id = "notes";
      $("devices").before(layer);
    }
    layer.innerHTML = net.notes
      .map((n) => {
        const target = noteTargetAnchor(n),
          tip =
            (n.text || "Untitled note") +
            (n.tags.length ? "\n" + n.tags.map((t) => "#" + t).join(" ") : "");
        return (
          (target
            ? '<path class="note-connector" data-note-connector="' +
              n.id +
              '" d="M' +
              (n.x + 16) +
              " " +
              (n.y + 18) +
              "L" +
              target.x +
              " " +
              target.y +
              '"/>'
            : "") +
          '<g data-note="' +
          n.id +
          '" data-note-target-x="' +
          (target ? target.x : "") +
          '" data-note-target-y="' +
          (target ? target.y : "") +
          '" data-note-title="' +
          esc(n.title?.trim() || "Note") +
          '" data-note-mentions="' +
          esc(JSON.stringify(noteMentions(n))) +
          '" data-tooltip="' +
          esc(tip) +
          '" class="canvas-note ' +
          n.color +
          (selected === n.id ? " selected" : "") +
          '" transform="translate(' +
          n.x +
          "," +
          n.y +
          ')" tabindex="0" role="button" aria-label="' +
          esc(noteName(n)) +
          '">' + noteArtwork() + '' +
          (n.title?.trim()
            ? '<text class="note-canvas-title" x="16" y="49" text-anchor="middle">' +
              esc(
                n.title.trim().length > 28
                  ? n.title.trim().slice(0, 27) + "?"
                  : n.title.trim(),
              ) +
              "</text>"
            : "") +
          "</g>"
        );
      })
      .join("");
  }

  function noteMentions(n) {
    return net.devices
      .filter((d) => n.text.includes("@" + d.name))
      .map((d) => ({
        id: d.id,
        label: "@" + d.name,
        icon: noteTargetIcon(d.id),
      }));
  }
  function navigateNoteDevice(id) {
    const d = net.device(id);
    if (!d) return;
    select(d.id);
    svg.dispatchEvent(new CustomEvent("network-locate", { detail: d }));
  }
  document.addEventListener("note-device-navigate", (e) =>
    navigateNoteDevice(e.detail),
  );
  function bindNoteMentions(n) {
    const input = $("note-text"),
      wrap = document.createElement("div"),
      list = document.createElement("div"),
      links = document.createElement("div");
    wrap.className = "note-editor";
    input.before(wrap);
    wrap.append(input, list);
    list.id = "note-mention-options";
    list.className = "note-mention-options";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Mention a device");
    list.hidden = true;
    wrap.after(links);
    links.className = "note-mention-links " + n.color;
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", list.id);
    let matches = [],
      active = 0,
      start = -1,
      end = -1;
    const close = () => {
      list.hidden = true;
      input.removeAttribute("aria-activedescendant");
    };
    const renderLinks = () => {
      links.replaceChildren();
      for (const m of noteMentions(n)) {
        const b = document.createElement("button");
        b.type = "button";
        b.innerHTML =
          noteTargetIcon(m.id) + "<span>" + esc(m.label.slice(1)) + "</span>";
        b.title = "Select " + m.label.slice(1);
        b.onclick = () => navigateNoteDevice(m.id);
        links.append(b);
      }
    };
    const mark = () => {
      [...list.querySelectorAll("[role=option]")].forEach((b, i) =>
        b.setAttribute("aria-selected", String(i === active)),
      );
      const b = list.querySelectorAll("[role=option]")[active];
      if (b) {
        input.setAttribute("aria-activedescendant", b.id);
        b.scrollIntoView({ block: "nearest" });
      }
    };
    const choose = (i) => {
      const d = matches[i];
      if (!d) return;
      const value =
        input.value.slice(0, start) +
        "@" +
        d.name +
        " " +
        input.value.slice(end);
      if (value.length > input.maxLength) return;
      input.value = value;
      const caret = start + d.name.length + 2;
      input.setSelectionRange(caret, caret);
      n.text = value;
      close();
      drawNotes();
      renderLinks();
      input.focus();
    };
    const update = () => {
      renderLinks();
      const before = input.value.slice(0, input.selectionStart),
        at = before.lastIndexOf("@");
      if (
        at < 0 ||
        (at > 0 && !/\s/.test(before[at - 1])) ||
        input.selectionStart !== input.selectionEnd ||
        /[\n@]/.test(before.slice(at + 1))
      ) {
        close();
        return;
      }
      const query = before.slice(at + 1).toLowerCase();
      if (
        net.devices.some((d) => query.startsWith(d.name.toLowerCase() + " "))
      ) {
        close();
        return;
      }
      matches = net.devices.filter((d) => d.name.toLowerCase().includes(query));
      start = at;
      end = input.selectionStart;
      active = 0;
      list.replaceChildren();
      const title = document.createElement("div");
      title.className = "mention-list-title";
      title.textContent = "Mention a device";
      list.append(title);
      matches.forEach((d, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.tabIndex = -1;
        b.id = "note-mention-option-" + i;
        b.setAttribute("role", "option");
        b.innerHTML =
          noteTargetIcon(d.id) +
          "<span><strong>" +
          esc(d.name) +
          "</strong><small>" +
          esc(d.type + (d.ip ? " ? " + d.ip : "")) +
          "</small></span>";
        b.onpointerdown = (e) => e.preventDefault();
        b.onclick = () => choose(i);
        list.append(b);
      });
      if (!matches.length) {
        const empty = document.createElement("div");
        empty.className = "mention-list-empty";
        empty.textContent = "No matching devices";
        list.append(empty);
      }
      list.hidden = false;
      mark();
    };
    input.addEventListener("input", update);
    input.addEventListener("click", update);
    input.addEventListener("keydown", (e) => {
      if (list.hidden) return;
      if (["ArrowDown", "ArrowUp"].includes(e.key) && matches.length) {
        e.preventDefault();
        active =
          (active + (e.key === "ArrowDown" ? 1 : -1) + matches.length) %
          matches.length;
        mark();
      } else if ((e.key === "Enter" || e.key === "Tab") && matches.length) {
        e.preventDefault();
        choose(active);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    });
    input.addEventListener("blur", () =>
      setTimeout(() => {
        if (!wrap.contains(document.activeElement)) close();
      }, 0),
    );
    renderLinks();
    const preview = document.createElement("div"),
      edit = document.createElement("button");
    preview.className = "note-inline-preview note-tooltip " + n.color;
    edit.id = "note-edit";
    edit.type = "button";
    edit.className = "note-edit-toggle";
    edit.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14Z"/></svg><span>Edit note</span>';
    wrap.before(preview, edit);
    const renderPreview = () => {
      preview.replaceChildren();
      const mentions = noteMentions(n).sort(
        (a, b) => b.label.length - a.label.length,
      );
      let remaining = n.text;
      while (remaining) {
        let match = null,
          index = remaining.length;
        for (const m of mentions) {
          const i = remaining.indexOf(m.label);
          if (i >= 0 && i < index) {
            match = m;
            index = i;
          }
        }
        if (!match) {
          preview.append(document.createTextNode(remaining));
          break;
        }
        preview.append(document.createTextNode(remaining.slice(0, index)));
        const b = document.createElement("button");
        b.type = "button";
        b.className = "note-mention-link";
        b.innerHTML =
          '<span class="mention-glyph">' +
          match.icon +
          "</span><span>" +
          esc(match.label.slice(1)) +
          "</span>";
        b.title = "Select " + match.label.slice(1);
        const id = match.id;
        b.onclick = () => navigateNoteDevice(id);
        preview.append(b);
        remaining = remaining.slice(index + match.label.length);
      }
      if (!n.text) preview.textContent = "Add a note?";
    };
    let editing = !n.text;
    const showMode = () => {
      wrap.hidden = !editing;
      preview.hidden = editing;
      links.hidden = true;
      edit.querySelector("span").textContent = editing ? "Done" : "Edit note";
      edit.setAttribute("aria-expanded", String(editing));
      renderPreview();
    };
    edit.onclick = () => {
      editing = !editing;
      close();
      showMode();
      if (editing) input.focus();
    };
    showMode();
  }
  function noteInspector() {
    const n = net.notes.find((n) => n.id === selected);
    if (!n) return false;
    $("watch").hidden = true;
    $("terminal-title").textContent = "Terminal";
    $("prompt").textContent = "Select a device on the canvas or use the selector above to use the CLI";
    $("inspector-title").innerHTML = noteSymbol() + "<span>Note</span>";
    const targets = [
      ...net.devices.map((d) => ({ id: d.id, label: d.name })),
      ...applications().map((a) => ({
        id: a.id,
        label:
          appLabel(a.type) + (a.host ? " on " + net.device(a.host).name : ""),
      })),
    ];
    $("inspector").innerHTML =
      '<label>Title<input id="note-title" maxlength="100" placeholder="Optional title"></label><label>Note<textarea id="note-text" rows="6" maxlength="2000" placeholder="Add a reminder or explain this network..."></textarea></label>' +
      tagEditor(n) +
      '<label>Color<select id="note-color">' +
      ["yellow", "blue", "green", "pink"]
        .map(
          (c) =>
            '<option value="' +
            c +
            '">' +
            c[0].toUpperCase() +
            c.slice(1) +
            "</option>",
        )
        .join("") +
      '</select></label><label>Associated with<select id="note-target"><option value="">None</option>' +
      targets
        .map(
          (t) =>
            '<option value="' + esc(t.id) + '">' + esc(t.label) + "</option>",
        )
        .join("") +
      "</select></label>" +
      (noteTarget(n.target)
        ? '<button id="note-locate">Select associated item</button>'
        : "") +
      '<p class="hint">Drag the note icon to move it. Hover to preview, or select to edit here.</p><button id="delete-note" class="danger" aria-label="Delete note" title="Delete note"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 10v7M14 10v7"/></svg> Delete note</button>';
    $("note-title").value = n.title || "";
    $("note-title").oninput = (e) => {
      n.title = e.target.value;
      drawNotes();
    };
    $("note-text").value = n.text;
    $("note-color").value = n.color;
    $("note-target").value = noteTarget(n.target) ? n.target : "";
    $("note-text").oninput = (e) => {
      n.text = e.target.value;
      drawNotes();
    };
    $("item-tags").onchange = (e) => {
      n.tags = parseTags(e.target.value);
      render();
    };
    $("note-color").onchange = (e) => {
      n.color = e.target.value;
      render();
    };
    $("note-target").onchange = (e) => {
      n.target = e.target.value || null;
      render();
    };
    if ($("note-locate"))
      $("note-locate").onclick = () => {
        selected = n.target;
        render();
        const t = noteTarget(n.target);
        svg.dispatchEvent(new CustomEvent("network-locate", { detail: t }));
      };
    $("delete-note").onclick = () => {
      if (confirm("Delete this note?")) {
        net.notes = net.notes.filter((x) => x.id !== n.id);
        selected = null;
        render();
      }
    };
    styleInspectorSelect(
      "note-color",
      "Color",
      (color) =>
        '<svg class="note-swatch ' +
        color +
        '" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>',
    );
    styleInspectorSelect("note-target", "Associated with", noteTargetIcon);
    bindNoteMentions(n);
    return true;
  }

  const watchMenu = document.createElement("div");
  watchMenu.id = "watch-menu";
  watchMenu.className = "watch-menu";
  watchMenu.setAttribute("popover", "auto");
  watchMenu.setAttribute("role", "dialog");
  watchMenu.setAttribute("aria-label", "Watch decisions");
  document.body.append(watchMenu);
  const watchChevron = '<svg class="watch-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
  $("watch").insertAdjacentHTML("beforeend", '<span class="watch-summary"></span>' + watchChevron);
  $("watch").setAttribute("aria-haspopup", "dialog");
  $("watch").setAttribute("aria-controls", "watch-menu");
  $("watch").setAttribute("aria-expanded", "false");
  watchMenu.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      watchMenu.hidePopover(); $("watch").focus();
    }
  });
  watchMenu.addEventListener("toggle", () => $("watch").setAttribute("aria-expanded", String(watchMenu.matches(":popover-open"))));
  function watchTooltip(d, appType) {
    const enabled = d[appType ? appWatchKey(appType) : "watch"];
    const settings = !enabled ? "Off" : appType || !Array.isArray(d.watchDecisions)
      ? "All decisions"
      : d.watchDecisions.map(k => NetworkExplorerWatch.labels[k]).join(", ");
    return "Watch for: " + settings;
  }
  function bindWatch(d, appType) {
    const button = $("watch"), key = appType ? appWatchKey(appType) : "watch";
    button.hidden = !d;
    if (!d) return;
    const keys = appType ? [] : NetworkExplorerWatch.options(d);
    const summary = !d[key] ? "Off" : !appType && Array.isArray(d.watchDecisions) ? d.watchDecisions.length + " selected" : "All";
    button.querySelector(".watch-summary").textContent = summary;
    button.setAttribute("aria-pressed", String(!!d[key]));
    button.setAttribute("aria-label", watchTooltip(d, appType) + ". Choose decisions");
    button.dataset.tooltip = watchTooltip(d, appType);
    button.onclick = () => {
      if (watchMenu.matches(":popover-open")) { watchMenu.hidePopover(); return; }
      const drawMenu = () => {
        const current = net.device(d.id);
        watchMenu.innerHTML = '<strong>Watch for...</strong><div class="watch-presets"><button type="button" data-mode="off" aria-pressed="' + !current[key] + '">Off</button><button type="button" data-mode="all" aria-pressed="' + (!!current[key] && (appType || !Array.isArray(current.watchDecisions))) + '">All</button></div>' +
          keys.map(k => '<label><input type="checkbox" role="switch" value="' + k + '" ' + (current[key] && (!Array.isArray(current.watchDecisions) || current.watchDecisions.includes(k)) ? 'checked' : '') + '><span class="watch-option-track" aria-hidden="true"></span><span>' + esc(NetworkExplorerWatch.labels[k]) + '</span></label>').join('');
        watchMenu.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
          const current = net.device(d.id);
          current[key] = b.dataset.mode === "all";
          if (!appType && current[key]) delete current.watchDecisions;
          render(); drawMenu(); watchMenu.querySelector('[data-mode="' + b.dataset.mode + '"]').focus();
        });
        watchMenu.querySelectorAll('input').forEach(input => input.onchange = () => {
          const current = net.device(d.id);
          const chosen = [...watchMenu.querySelectorAll('input:checked')].map(el => el.value);
          current.watch = chosen.length > 0;
          current.watchDecisions = chosen.length ? chosen : undefined;
          if (chosen.length === keys.length) delete current.watchDecisions;
          render(); drawMenu(); watchMenu.querySelector('input[value="' + input.value + '"]').focus();
        });
      };
      drawMenu(); watchMenu.showPopover();
      const rect = button.getBoundingClientRect();
      watchMenu.style.left = Math.max(8, Math.min(rect.right - watchMenu.offsetWidth, innerWidth - watchMenu.offsetWidth - 8)) + "px";
      watchMenu.style.top = Math.max(8, Math.min(rect.bottom + 6, innerHeight - watchMenu.offsetHeight - 8)) + "px";
      watchMenu.querySelector('button').focus();
    };
  }

  function watchList() {
    if (!$("watch-list")) return;
    $("watch-list").innerHTML =
      net.devices
        .filter((d) => d.watch)
        .map((d) => '<div class="watch-item">◉ ' + esc(d.name) + "</div>")
        .join("") || '<p class="hint">No devices watched yet.</p>';
  }
  function setSimulationStatus({
    active = false,
    paused = false,
    examining = false,
  } = {}) {
    simulationExamining = examining;
    NetworkExplorerStatus.render($("sim-status"), { active, paused });
  }
  function render() {
    refreshTroubleshooting();
    refreshDevicePickers();
    updatePauseControl();
    NetworkExplorerPlatform.normalize(net);
    refreshSearch();
    refreshPlatform();
    draw();
    inspector();
    if (portConfig.open && portConfig.dataset.host === "true") {
      if (selected === portConfig.dataset.device && net.device(selected)?.type === "host") openPortConfig(portConfig.dataset.device, portConfig.dataset.port);
      else portConfig.close();
    }
    refreshFloatingTable();
    syncExternal();
    watchList();
    NetworkExplorerCapture.render(net);
    setSimulationStatus({
      active: !!(flightPaused || staged || running || net.queue.length),
      paused:
        flightPaused ||
        !!(staged && !phaseCallback) ||
        (!running && !!net.queue.length),
      examining: !!staged && !phaseCallback && simulationExamining,
    });
    syncExternal();
  }
  function openInspector() {
    if ($("right-panel").hidden) $("toggle-right").click();
  }
  function select(id) {
    if (net.device(id)) openInspector();
    selected = id;
    if (connecting && net.device(id)) {
      choosePort(id);
      return;
    }
    render();
  }
  function choosePort(id) {
    if (!editable()) return;
    selected = id;
    render();
    $("connection-hint").textContent =
      "Choose an anchor on this device, then a destination anchor.";
  }
  function confirmRemoval(message, fn) {
    if (confirm(message)) mutate(fn);
  }
  function deleteTopologyItem(id) {
    const d = net.device(id),
      l = net.links.find((l) => l.id === id);
    if (!d && !l) return;
    const message = d
      ? "Delete " +
        d.name +
        " and its connected cables and installed applications?"
      : "Delete the connection between " +
        net.device(l.a).name +
        " and " +
        net.device(l.b).name +
        "?";
    confirmRemoval(message, () => {
      net.remove(id);
      selected = null;
    });
  }
  function cancelConnect() {
    pendingCable = null;
    if (portPicker.open) portPicker.close();
    connecting = false;
    endpoint = null;
    cableGesture = null;
    $("cable-preview").replaceChildren();
    $("connect").classList.remove("active");
    $("cancel-connect").hidden = true;
    $("connection-hint").textContent = "";
  }
  function flashPorts(report) {
    if (!report.link) return;
    const link = net.links.find((l) => l.id === report.link);
    if (!link) return;
    for (const key of [link.a + ":" + link.ap, link.b + ":" + link.bp]) {
      const port = document.querySelector('[data-device-port="' + key + '"]');
      if (port) {
        port.classList.remove("port-activity");
        void port.offsetWidth;
        port.classList.add("port-activity");
        port.addEventListener(
          "animationend",
          () => port.classList.remove("port-activity"),
          { once: true },
        );
      }
    }
  }
  function animateFlights(reports) {
    $("traffic").replaceChildren();
    const motions = [],
      ns = "http://www.w3.org/2000/svg",
      duration = Number($("speed").value) / 1000;
    for (const report of reports) {
      flashPorts(report);
      if (!report.link) continue;
      const link = net.links.find((l) => l.id === report.link);
      if (!link) continue;
      const circle = document.createElementNS(ns, "circle");
      circle.setAttribute("r", "8");
      circle.setAttribute(
        "fill",
        report.frame.dns
          ? "#7864a6"
          : report.frame.dhcp
            ? "#287d78"
            : report.frame.type === "ARP"
              ? "#bc770b"
              : "#4d88bd",
      );
      circle.setAttribute("class", "in-flight-frame");
      circle.setAttribute("tabindex", "0");
      circle.setAttribute("role", "button");
      circle.setAttribute(
        "aria-label",
        "Inspect frame from " +
          net.device(report.from).name +
          " to " +
          net.device(report.device).name +
          " while paused",
      );
      circle.flightReport = report;
      const motion = document.createElementNS(ns, "animateMotion");
      motion.setAttribute(
        "path",
        pathData(cablePath(link), link.a !== report.from),
      );
      motion.setAttribute("dur", duration + "s");
      motion.setAttribute("fill", "freeze");
      motion.setAttribute("begin", "indefinite");
      circle.append(motion);
      $("traffic").append(circle);
      motions.push(motion);
    }
    const start = $("canvas").getCurrentTime();
    motions.forEach((m) =>
      m.beginElementAt(start - $("canvas").getCurrentTime()),
    );
  }
  function animateApplicationDelivery(report) {
    const d = net.device(report.device),
      a = applications().find(
        (a) => a.host === d.id && a.type === report.kind.split("-")[0],
      );
    if (!a) return;
    const ns = "http://www.w3.org/2000/svg",
      circle = document.createElementNS(ns, "circle"),
      motion = document.createElementNS(ns, "animateMotion");
    $("traffic").replaceChildren();
    circle.setAttribute("r", "6");
    circle.setAttribute("fill", "#287d78");
    circle.flightReport = report;
    const path = applicationPath(a);
    if (report.action === "request") {
      const start = path.start;
      path.start = path.end;
      path.end = start;
      const c1 = path.c1;
      path.c1 = path.c2;
      path.c2 = c1;
    }
    motion.setAttribute("path", pathData(path));
    motion.setAttribute("dur", Number($("speed").value) / 1000 + "s");
    motion.setAttribute("fill", "freeze");
    motion.setAttribute("begin", "indefinite");
    circle.append(motion);
    $("traffic").append(circle);
    motion.beginElement();
  }
  function applicationEvidence(r) {
    if (["web-application", "browser-application", "echo-application"].includes(r.kind))
      return (
        '<div class="evidence"><strong>' +
        esc(r.title) +
        '</strong></div><div class="decision http-evidence">' +
        r.notes.map((n) => "<pre>" + esc(n) + "</pre>").join("") +
        "</div>"
      );
    if (r.kind === "dns-application")
      return (
        '<div class="evidence"><strong>DNS A query</strong><p>' +
        esc(r.frame.query) +
        '</p></div><div class="decision">' +
        r.notes.map((n) => "<p>" + esc(n) + "</p>").join("") +
        "</div>"
      );
    const leases = (rows) =>
      Object.values(rows || {}).length
        ? "<table><thead><tr><th>Address</th><th>Pool</th><th>State</th></tr></thead><tbody>" +
          Object.values(rows)
            .map(
              (x) =>
                "<tr><td>" +
                esc(x.address) +
                "</td><td>" +
                esc(x.pool || "Default") +
                "</td><td>" +
                esc(x.state) +
                "</td></tr>",
            )
            .join("") +
          "</tbody></table>"
        : '<p class="hint">No leases assigned.</p>';
    return (
      '<div class="evidence"><strong>DHCP ' +
      esc(r.frame.dhcp) +
      "</strong><p>Client: " +
      esc(r.frame.clientMac) +
      (r.frame.giaddr ? " &middot; Relay: " + esc(r.frame.giaddr) : "") +
      "</p></div><h3>Leases before</h3>" +
      leases(r.applicationBefore) +
      '<div class="decision">' +
      r.notes.map((n) => "<p>" + esc(n) + "</p>").join("") +
      "</div><h3>Leases after</h3>" +
      leases(r.applicationAfter)
    );
  }
  function stage() {
    if ($("speed").value === "0") {
      fastForward();
      return;
    }
    if (staged) return;
    const trial = Object.assign(
      new NetworkExplorer.Network(),
      JSON.parse(JSON.stringify(net)),
    );
    trial.copyRuntimeFrom(net);
    const report = trial.next();
    if (!report) {
      adoptTrafficNetwork(trial);
      arrivedFlights.clear();
      $("traffic").replaceChildren();
      stop();
      render();
      return;
    }
    staged = { trial, report };
    flashFilterTraffic(report);
    let duration = 100;
    if (report.link) {
      if (arrivedFlights.delete(report.order)) {
        duration = 0;
      } else {
        const flights = net.queue.filter(
          (e) =>
            e.kind === "receive" &&
            e.time === report.time &&
            !arrivedFlights.has(e.order),
        );
        for (const f of flights)
          if (f.order !== report.order) arrivedFlights.add(f.order);
        animateFlights(flights);
        duration = Number($("speed").value);
      }
    } else if (report.kind.endsWith("-application") && (report.kind!=="echo-application" || report.echoDelivery)) {
      animateApplicationDelivery(report);
      duration = Number($("speed").value);
    } else $("traffic").replaceChildren();
    setSimulationStatus({ active: true });
    schedulePhase(() => {
      if (!staged) return;
      if (
        (NetworkExplorerWatch.matches(net.device(report.device), report) ||
          watchDhcpReport(report))
      )
        examine();
      else commit();
    }, duration);
  }
  function frameHeaderCard(frame, label, peer) {
    const cell = (name, value, key) =>
      '<div class="frame-field' +
      (peer && peer.type === frame.type && peer[key] !== frame[key]
        ? " frame-field-changed"
        : "") +
      '"><span>' +
      esc(name) +
      "</span><code>" +
      esc(value) +
      "</code></div>";
    const ethernet =
      cell("Destination MAC", frame.dst, "dst") +
      cell("Source MAC", frame.src, "src") +
      cell("EtherType", frame.type === "ARP" ? "0x0806" : "0x0800", "type");
    const payload =
      frame.type === "ARP"
        ? '<div class="packet-fields arp-fields">' +
          cell("Operation", frame.op, "op") +
          cell("Sender IP", frame.sip, "sip") +
          cell("ARP sender MAC", frame.sha ?? frame.src, "sha") +
          cell("ARP target MAC", frame.tha ?? frame.dst, "tha") +
          cell("Target IP", frame.tip, "tip") +
          "</div>"
        : '<div class="packet-fields ip-fields">' +
          cell("Source IP", frame.sip, "sip") +
          cell("Destination IP", frame.dip, "dip") +
          cell("TTL", frame.ttl ?? 64, "ttl") +
          cell(
            "Protocol",
            frame.protocol === "TCP"
              ? "6 (TCP)"
              : frame.protocol === "UDP"
                ? "17 (UDP)"
                : "1 (ICMP)",
            "protocol",
          ) +
          "</div>" +
          (frame.protocol === "TCP"
            ? '<div class="packet-fields tcp-fields">' +
              cell("Source port", frame.sport, "sport") +
              cell("Destination port", frame.dport, "dport") +
              cell("Flags", frame.flags, "flags") +
              cell("Sequence", frame.seq, "seq") +
              cell("Acknowledgment", frame.ack, "ack") +
              cell("Payload bytes", frame.length, "length") +
              "</div>"
            : "") +
          '<div class="frame-message">' +
          esc(
            frame.protocol === "TCP"
              ? "TCP " +
                  frame.sport +
                  " to " +
                  frame.dport +
                  " | " +
                  frame.flags +
                  " | SEQ " +
                  frame.seq +
                  " | ACK " +
                  frame.ack +
                  " | " +
                  frame.length +
                  " bytes" +
                  (frame.http
                    ? " | HTTP " +
                      (frame.http === "Request"
                        ? "GET " + frame.path
                        : frame.status)
                    : "")
              : frame.dns
                ? "DNS " +
                  frame.dns +
                  " | " +
                  frame.query +
                  (frame.answer
                    ? " | " + frame.answer + " | TTL " + frame.answerTtl + "s"
                    : frame.rcode
                      ? " | " + frame.rcode
                      : "")
                : frame.dhcp
                  ? "DHCP " +
                    frame.dhcp +
                    " | UDP " +
                    frame.sport +
                    " to " +
                    frame.dport +
                    (frame.address
                      ? " | Address " + frame.address + "/" + frame.prefix
                      : "") +
                    (frame.leaseSeconds
                      ? " | Lease " + frame.leaseSeconds + "s"
                      : "") +
                    (frame.giaddr ? " | Relay (giaddr) " + frame.giaddr : "")
                  : frame.protocol === "UDP"
                    ? "UDP " + frame.sport + " to " + frame.dport
                    : frame.icmp +
                      (frame.code === 3 ? " (port unreachable)" : ""),
          ) +
          (frame.quote
            ? " | Original destination " + esc(frame.quote.dip)
            : "") +
          "</div>";
    return (
      '<article class="frame-header-card"><h4>' +
      esc(label) +
      '</h4><div class="frame-layer-label">Ethernet II header</div><div class="ethernet-fields">' +
      ethernet +
      '</div><div class="frame-payload"><div class="frame-layer-label">' +
      (frame.type === "ARP" ? "ARP message" : "IPv4 packet") +
      "</div>" +
      payload +
      "</div></article>"
    );
  }
  function frameComparison(r, d) {
    const outgoing = d.type !== "switch" ? r.outgoingFrames || [] : [];
    return (
      '<div class="frame-comparison' +
      (r.frame && outgoing.length ? " has-outgoing" : "") +
      '">' +
      (r.frame
        ? frameHeaderCard(
            r.frame,
            "Incoming" +
              (r.frame.dhcp ? " DHCP " + r.frame.dhcp : "") +
              (r.ingress
                ? " - " + d.ports.find((p) => p.id === r.ingress).name
                : ""),
            null,
          )
        : '<div class="evidence">' +
          esc(r.target ? "Destination: " + r.target : "Local event") +
          "</div>") +
      outgoing
        .map((o) =>
          frameHeaderCard(
            o.frame,
            "Outgoing" +
              (o.frame.dhcp ? " DHCP " + o.frame.dhcp : "") +
              " - " +
              d.ports.find((p) => p.id === o.port).name,
            r.frame,
          ),
        )
        .join("") +
      "</div>" +
      (r.frame
        ? '<p class="frame-schematic-note">Selected fields &middot; schematic' +
          (outgoing.some((o) => o.frame.type === r.frame.type)
            ? " &middot; Highlighted fields changed"
            : "") +
          "</p>"
        : "")
    );
  }
  function watchDhcpReport(r) {
    if(r.kind==='arp-spoof-send'||r.arpIntercept)return !!net.device(r.device)?.spooferWatch;
    const type = r.kind?.split("-")[0];
    return (
      r.kind?.endsWith("-application") &&
      !!net.device(r.device)?.[appWatchKey(type)]
    );
  }
  function examine() {
    const { report: r } = staged,
      d = net.device(r.device);
    previousFocus = document.activeElement;
    const appWatch = r.kind.endsWith("-application"),
      appType = r.kind.split("-")[0];
    const watchApp = r.kind==='arp-spoof-send'||r.arpIntercept ? 'spoofer' : appWatch ? appType : null;
    $("examine-watch").dataset.scope = watchApp || "device";
    $("examine-watch").checked = watchApp ? d[appWatchKey(watchApp)] : d.watch;
    $("examine-watch-status").textContent = $("examine-watch").checked
      ? "On"
      : "Off";
    $("examine-title").textContent = r.title;
    if (r.nat)
      document
        .querySelector('#devices [data-device="' + r.device + '"] .nat-badge')
        ?.animate(
          [{ opacity: 0.3 }, { opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }],
          { duration: 900 },
        );
    $("examine-device").textContent = appWatch
      ? appLabel(appType) +
        " on " +
        d.name +
        (r.action === "request"
          ? " - request submitted"
          : " - message delivered")
      : d.name +
        (r.ingress
          ? " · arriving on " + d.ports.find((p) => p.id === r.ingress).name
          : " · originating event");
    $("examine-body").innerHTML = appWatch
      ? applicationEvidence(r)
      : frameComparison(r, d) +
        (r.nat
          ? '<section class="nat-evidence"><h3>' +
            esc(r.nat.direction) +
            " NAT / PAT</h3><table><thead><tr><th></th><th>Source IP : port</th><th>Destination IP : port</th></tr></thead><tbody>" +
            [
              ["Before", r.nat.before],
              ["After", r.nat.after],
            ]
              .map(
                ([label, f]) =>
                  "<tr><th>" +
                  label +
                  "</th><td>" +
                  esc(f.sip + (f.sport ? ":" + f.sport : "")) +
                  "</td><td>" +
                  esc(f.dip + (f.dport ? ":" + f.dport : "")) +
                  "</td></tr>",
              )
              .join("") +
            "</tbody></table><p>The translated packet may wait for next-hop ARP resolution before transmission.</p></section>"
          : "") +
        (r.firewall ? '<section class="firewall-examine ' + r.firewall.action + '"><h3>Firewall: ' + r.firewall.action.toUpperCase() + '</h3><p>' + esc(NetworkExplorerFirewall.describe(r.firewall)) + '</p><p>Rule: ' + esc(r.firewall.rule) + (r.firewall.state ? ' &middot; State: ' + esc(r.firewall.state) : '') + '</p></section>' : "") +
        (r.routingTable
          ? "<h3>Routing decision</h3>" +
            routeRows(d, r.routingTable, r.selectedRoute)
          : "") +
        "<h3>Table before this decision</h3>" +
        table(visibleTable(r.before, d), d.type) +
        '<div class="decision">' +
        r.notes.map((n) => "<p>" + esc(n) + "</p>").join("") +
        "</div><h3>Table after this decision</h3>" +
        table(visibleTable(r.after, d), d.type, r.clock) +
        (r.outputs.length
          ? "<p><strong>Send through:</strong> " +
            r.outputs
              .map((p) => esc(d.ports.find((q) => q.id === p).name))
              .join(", ") +
            "</p>"
          : "");
    setSimulationStatus({ active: true, paused: true, examining: true });
    if (externalPanels.has("examine")) {
      syncExternal();
      externalPanels.get("examine").window.focus();
    } else {
      $("examine").showModal();
      $("continue").focus();
    }
    examined = true;
  }
  function commit(immediate = false) {
    if (!staged) return;
    const oldCount = net.results.length;
    const layout = new Map(
      net.devices.map((d) => [
        d.id,
        {
          x: d.x,
          y: d.y,
          watch: d.watch,
          watchDecisions: d.watchDecisions,
          dhcpWatch: d.dhcpWatch,
          dnsWatch: d.dnsWatch,
          webWatch: d.webWatch,
          browserWatch: d.browserWatch,
          echoWatch: d.echoWatch,
        },
      ]),
    );
    const notes = net.notes,
      tags = new Map(net.devices.map((d) => [d.id, d.tags]));
    adoptTrafficNetwork(staged.trial);
    net.notes = notes;
    net.devices.forEach((d) => {
      if (tags.has(d.id)) d.tags = tags.get(d.id);
    });
    net.age();
    net.devices.forEach((d) => Object.assign(d, layout.get(d.id)));
    staged = null;
    if (!immediate) render();
    publishResults(oldCount);
    if (immediate) return;
    if (running && net.queue.length)
      schedulePhase(stage, NetworkExplorerCapture.getFilter() ? 0 : 150);
    else if (!net.queue.length) {
      stop();
      $("traffic").replaceChildren();
      render();
    }
  }
  function publishResults(oldCount) {
    for (const r of net.results.slice(oldCount))
      output(
        r.dhcp || r.dns || r.http || r.nmap
          ? net.device(r.device).name + ": " + r.message
          : r.trace
            ? r.hop +
              "  " +
              (r.responder || "*") +
              "  " +
              (r.ok
                ? "Destination reached"
                : r.error || r.message || "Request timed out") +
              (r.done
                ? "\n" +
                  (r.ok
                    ? "Trace complete."
                    : r.error
                      ? "Trace stopped: " + r.error + "."
                      : "Maximum hops reached.")
                : "")
            : net.device(r.device).name +
              ": " +
              (r.ok
                ? "Reply from " + r.target
                : r.error
                  ? "From " +
                    (r.responder || net.device(r.device).ip) +
                    ": " +
                    r.error
                  : "Ping to " + r.target + " timed out."),
        r.device,
      );
  }
  function fastForward() {
    if (fastForwarding || (!staged && !net.queue.length)) return;
    stop();
    fastForwarding = true;
    running = true;
    updatePauseControl();
    if ($("examine").open) $("examine").close();
    $("traffic").replaceChildren();
    arrivedFlights.clear();
    try {
      if (staged) commit(true);
      // Execute the same engine decisions without animation or examination delays.
      let steps = 0;
      while (net.queue.length) {
        if (++steps > 10000)
          throw Error(
            "Fast forward stopped after 10,000 events. Check the topology for a forwarding loop.",
          );
        const oldCount = net.results.length;
        const report = net.next();
        if (!report) {
          publishResults(oldCount);
          break;
        }
        flashFilterTraffic(report);
        // Results are published through the normal commit path, exactly once.
        publishResults(oldCount);
      }
    } catch (error) {
      say(error.message);
    } finally {
      fastForwarding = false;
      stop();
      examined = false;
      render();
      refreshDhcp();
      refreshCountdowns();
      syncExternal();
    }
  }
  function startPing(id, target, trace = false) {
    if (candidateBase)
      throw Error(
        "Commit or revert candidate changes before starting traffic.",
      );
    finishPlacement();
    cancelConnect();
    if (staged || net.queue.length)
      throw Error("Finish or clear the current exchange first.");
    if (trace) {
      net.traceroute(id, target);
      output(
        "Tracing route to " + target + " - up to 30 hops, one probe per hop.",
        id,
      );
    } else if (!/^\d+\.\d+\.\d+\.\d+$/.test(target))
      net.lookupDns(id, target, true);
    else net.ping(id, target);
    running = true;
    stage();
  }
  const hostProfiles = {
    windows: { address: ["ipconfig", "ipconfig /all"], arp: ["arp -a"], flush: ["arp -d *"] },
    linux: {
      address: ["ip addr", "ip address"],
      arp: ["ip neigh", "ip neigh show"],
      flush: ["ip neigh flush all", "sudo ip neigh flush all"],
    },
    macos: {
      address: ["ifconfig"],
      arp: ["arp -a"],
      flush: ["arp -d -a", "sudo arp -d -a", "arp -a -d", "sudo arp -a -d"],
    },
  };
  function dnsFlushCommand(d) {
    return d.os === "linux"
      ? "resolvectl flush-caches"
      : d.os === "macos"
        ? "sudo dscacheutil -flushcache"
        : "ipconfig /flushdns";
  }
  function hostProfile(d) {
    return hostProfiles[d.os || "windows"];
  }
  function clearScreenCommand(d) {
    return d.type === "host" && (!d.os || d.os === "windows") ? "cls" : "clear";
  }
  function cliCommands(d) {
    const c = cliContext(d);
    const base = ["help", "close", "exit", clearScreenCommand(d)];
    if (d.type === "router")
      return NetworkExplorerRouterCLI.commands(c.mode, devicePlatform(d), d).concat(clearScreenCommand(d));
    if (d.type === "host")
      return base.concat(
        [
          ...(d.nmapServer?["nmap", "nmap -sS -p 22,80,443 IP"]:[]),
          "nslookup",
          dnsFlushCommand(d),
          "ping",
          d.os === "windows" || !d.os ? "tracert" : "traceroute",
          d.os === "linux"
            ? "dhclient eth0"
            : d.os === "macos"
              ? "ipconfig set eth0 DHCP"
              : "ipconfig /renew",
        ],
        hostProfile(d).address,
        hostProfile(d).arp,
        hostProfile(d).flush,
        NetworkExplorerHostCLI.commands(d.os || "windows"),
      );
    if (isPan(d))
      return NetworkExplorerPlatform.commands(c.mode).concat(
        clearScreenCommand(d),
        c.mode === "exec" ? ["clear mac all"] : [],
      );
    const show = [
      "show vlan brief",
      "show interfaces",
      "show interfaces switchport",
      "show mac address-table",
    ];
    return base.concat(
      show,
      ["end"],
      c.mode === "exec"
        ? ["configure terminal", "clear mac address-table dynamic"]
        : c.mode === "config"
          ? ["vlan", "interface"]
          : c.mode === "vlan"
            ? ["name"]
            : [
                "switchport mode access",
                "switchport access vlan",
                "shutdown",
                "no shutdown",
              ],
    );
  }
  function command(raw) {
    const cmd = raw.trim().toLowerCase(),
      d = cliDevice();
    if (
      cmd === "close" ||
      (cmd === "exit" && (!d || cliContext(d).mode === "exec"))
    ) {
      const entry = externalPanels.get("terminal");
      if (entry) {
        externalPanels.delete("terminal");
        entry.window.close();
        terminalNotice.hidden = true;
      }
      closeTool();
      return;
    }
    if (!d) throw Error("Select a device on the canvas first.");
    if (cmd === clearScreenCommand(d)) {
      const state = terminalState(d.id);
      state.text = "";
      state.scroll = 0;
      $("terminal").textContent = "";
      $("terminal").scrollTop = 0;
      syncExternal();
      return;
    }
    if (
      /^(delete\s|no\s|clear\s|arp\s+-d\b|ip\s+neigh\s+flush\b)/i.test(cmd) &&
      !confirm(
        "Run " +
          raw +
          " on " +
          d.name +
          "? This removes configuration or learned entries.",
      )
    )
      return;
    output(cliPrompt(d) + " " + raw);
    const c = cliContext(d),
      parts = raw.trim().split(/\s+/);
    const change = (fn) => {
      if (!editable())
        throw Error("Finish the exchange before changing configuration.");
      fn();
      examined = false;
    };
    if (cmd === "help") {
      output(cliCommands(d).join("\n"));
      render();
      return;
    }
    if(d.type === "host") {
      try {const op=NetworkExplorerHostCLI.parse(d,raw);if(op){
        if((candidateBase&&op.kind!=='netstat')||(op.kind==='nmap'&&staged))throw Error("Commit or revert candidate changes before configuring host addresses.");
        const result=NetworkExplorerHostCLI.run(net,d.id,op,fn=>change(()=>configurationChange(fn)));
        output(result.message);if(result.dhcp)startDhcp(d.id);if(result.scan){running=true;stage();}render();return;
      }}catch(e){output(e.message);render();return;}
    }
    if (d.type === "router") {
      try {
        if (NetworkExplorerFirewallCLI.handles(raw,devicePlatform(d))) {
          if(c.mode!=="exec") throw Error("Use operational/exec mode for firewall inspection. Exit configuration mode first.");
          const source=isPan(d)&&candidateBase?committedNetwork():net;
          source.firewallSessions=net.firewallSessions;source.firewallDecisions=net.firewallDecisions;
          output(NetworkExplorerFirewallCLI.run(source,d.id,raw,devicePlatform(d),change));
          render();return;
        }
        if (isPan(d) && cmd === "commit" && c.mode === "config") {
          if (commitConfiguration(d.id)) output("Commit complete.");
        } else if (isPan(d) && cmd === "revert config" && c.mode === "config") {
          revertConfiguration(d.id);
          output("Candidate changes reverted.");
        } else {
          const source =
            isPan(d) && c.mode === "exec" && candidateBase
              ? committedNetwork()
              : net;
          NetworkExplorerPlatform.normalize(source);
          output(
            NetworkExplorerRouterCLI.run(
              source,
              d.id,
              c,
              raw,
              (fn) => change(() => configurationChange(fn)),
              devicePlatform(d),
            ),
          );
        }
      } catch (e) {
        output(e.message);
      }
      render();
      return;
    }
    const flushCommand =
      d.type === "host"
        ? "arp -d *"
        : isPan(d)
          ? "clear mac all"
          : "clear mac address-table dynamic";
    if (
      d.type === "host"
        ? hostProfile(d).flush.includes(cmd)
        : cmd === flushCommand
    ) {
      if (c.mode !== "exec") {
        output("Exit configuration mode before clearing learned entries.");
        return;
      }
      if (staged || net.queue.length) {
        output("Finish the exchange before clearing learned entries.");
        return;
      }
      if (d.type === "host") net.arp[d.id] = {};
      else net.mac[d.id] = {};
      output(
        d.type === "host" ? "ARP cache cleared." : "Dynamic MAC table cleared.",
      );
      render();
      return;
    }
    if (isPan(d) && d.type === "switch") {
      try {
        if (cmd === "commit" && c.mode === "config") {
          if (commitConfiguration(d.id)) output("Commit complete.");
        } else if (cmd === "revert config" && c.mode === "config") {
          revertConfiguration(d.id);
          output("Candidate changes reverted.");
        } else {
          const source =
            c.mode === "exec" && candidateBase ? committedNetwork() : net;
          NetworkExplorerPlatform.normalize(source);
          output(
            NetworkExplorerPlatform.run(source, d.id, c, raw, (fn) =>
              change(() => configurationChange(fn)),
            ),
          );
        }
      } catch (e) {
        output(e.message);
      }
      render();
      return;
    }
    try {
      if (cmd === "help") output(cliCommands(d).join("\n"));
      else if (cmd === "exit") {
        c.mode = c.mode === "config" ? "exec" : "config";
      } else if (d.type === "switch" && cmd === "end") c.mode = "exec";
      else if (d.type === "switch" && cmd === "configure terminal")
        c.mode = "config";
      else if (
        d.type === "switch" &&
        c.mode === "config" &&
        /^vlan \d+$/.test(cmd)
      ) {
        const id = Number(parts[1]);
        change(() => net.setVlan(d.id, id));
        c.mode = "vlan";
        c.vlan = id;
      } else if (
        d.type === "switch" &&
        c.mode === "vlan" &&
        cmd.startsWith("name ")
      )
        change(() => net.setVlan(d.id, c.vlan, parts.slice(1).join(" ")));
      else if (
        d.type === "switch" &&
        c.mode === "config" &&
        cmd.startsWith("interface ")
      ) {
        const p = d.ports.find(
          (p) => p.name.toLowerCase() === parts[1].toLowerCase(),
        );
        if (!p) throw Error("Use interface P1 through P8.");
        c.port = p.id;
        c.mode = "interface";
      } else if (
        d.type === "switch" &&
        c.mode === "interface" &&
        cmd === "switchport mode access"
      )
        change(() => net.configurePort(d.id, c.port, { mode: "access" }));
      else if (
        d.type === "switch" &&
        c.mode === "interface" &&
        /^switchport access vlan \d+$/.test(cmd)
      )
        change(() =>
          net.configurePort(d.id, c.port, { accessVlan: Number(parts[3]) }),
        );
      else if (
        d.type === "switch" &&
        c.mode === "interface" &&
        ["shutdown", "no shutdown"].includes(cmd)
      )
        change(() =>
          net.configurePort(d.id, c.port, { enabled: cmd === "no shutdown" }),
        );
      else if (d.type === "switch" && cmd === "show vlan brief")
        output(
          "VLAN  Name  Ports\n" +
            d.vlans
              .map(
                (v) =>
                  v.id +
                  "  " +
                  v.name +
                  "  " +
                  d.ports
                    .filter((p) => p.accessVlan === v.id)
                    .map((p) => p.name)
                    .join(", "),
              )
              .join("\n"),
        );
      else if (d.type === "switch" && cmd === "show interfaces switchport")
        output(
          d.ports
            .map(
              (p) =>
                p.name +
                "  access  VLAN " +
                p.accessVlan +
                "  " +
                (p.enabled ? "enabled" : "disabled"),
            )
            .join("\n"),
        );
      else if (
        d.type === "switch" &&
        /^show mac address-table(?: vlan \d+)?$/.test(cmd)
      ) {
        const rows = Object.entries(net.mac[d.id] || {}).filter(
          ([key, r]) => !parts[4] || (r.vlan || 1) === Number(parts[4]),
        );
        output(
          rows.length
            ? "VLAN  MAC address  Port\n" +
                rows
                  .map(
                    ([key, r]) =>
                      (r.vlan || 1) +
                      "  " +
                      (r.mac || key) +
                      "  " +
                      d.ports.find((p) => p.id === r.port).name,
                  )
                  .join("\n")
            : "MAC table is empty.",
        );
      } else if (
        d.type === "host" &&
        cmd ===
          (d.os === "linux"
            ? "dhclient eth0"
            : d.os === "macos"
              ? "ipconfig set eth0 dhcp"
              : "ipconfig /renew")
      )
        startDhcp(d.id);
      else if (d.type === "host" && cmd === dnsFlushCommand(d)) {
        if (staged || net.queue.length)
          throw Error("Finish the exchange first.");
        net.dnsCache[d.id] = {};
        output("DNS cache cleared.");
      } else if (d.type === "host" && parts[0].toLowerCase() === "nslookup") {
        if (parts.length !== 2) throw Error("Usage: nslookup <name>");
        startDns(d.id, parts[1]);
      } else if (
        d.type === "host" &&
        ["ping", "tracert", "traceroute"].includes(parts[0].toLowerCase())
      ) {
        const verb = parts[0].toLowerCase(),
          traceCmd = d.os === "windows" || !d.os ? "tracert" : "traceroute";
        if (verb !== "ping" && verb !== traceCmd)
          throw Error("Use " + traceCmd + " on this host OS.");
        if (parts.length !== 2)
          throw Error("Usage: " + verb + " <destination IPv4>");
        startPing(d.id, parts[1], verb !== "ping");
      } else if (d.type === "host" && hostProfile(d).address.includes(cmd))
        output(
          "eth0  " +
            (d.ip ? d.ip + "/" + d.prefix : "unconfigured") +
            "\nMAC " +
            d.ports[0].mac +
            "\nDefault gateway " +
            (d.gateway || "not configured") +
            "\nDNS server " +
            (d.dnsServerAddress || "not configured"),
        );
      else if (d.type === "host" && hostProfile(d).arp.includes(cmd))
        output(
          Object.entries(net.arp[d.id] || {})
            .map(([ip, r]) => ip + "  " + r.mac)
            .join("\n") || "ARP cache is empty.",
        );
      else if (cmd === "show interfaces" && d.type === "switch")
        output(
          d.ports
            .map(
              (p) =>
                p.name +
                "  " +
                (p.enabled ? "enabled" : "disabled") +
                "  " +
                (occupied(d.id, p.id) ? "cabled" : "no cable"),
            )
            .join("\n"),
        );
      else output("Unsupported command in this mode. Type help.");
    } catch (e) {
      output(e.message);
    }
    render();
  }

  let placing = null;
  function finishPlacement() {
    placingNote = false;
    placing = null;
    $("canvas").classList.remove("placing");
    cancelConnect();
  }
  function beginPlacement(kind, type) {
    if (!editable()) return;
    finishPlacement();
    drag = null;
    appGesture = null;
    appConnecting = null;
    placing = { kind, type };
    svg.classList.add("placing");
    say(
      "Click the canvas to place " +
        (kind === "application" ? appLabel(type) : type) +
        ". Escape cancels.",
    );
  }
  function addFromPalette(type) {
    beginPlacement("device", type);
  }
  $("add-host").onclick = () => addFromPalette("host");
  $("add-switch").onclick = () => addFromPalette("switch");
  $("add-router").onclick = () => addFromPalette("router");
  const firewallButton = document.createElement("button");
  firewallButton.id="add-firewall";firewallButton.type="button";firewallButton.title="Add firewall";firewallButton.setAttribute("aria-label","Add firewall");
  firewallButton.innerHTML='<svg viewBox="-42 -35 84 72" aria-hidden="true">'+NetworkExplorerFirewallUI.glyph()+"</svg>";
  $("add-router").after(firewallButton);firewallButton.onclick=()=>addFromPalette("firewall");
  $("connect").onclick = () => {
    if (!editable()) return;
    connecting = !connecting;
    endpoint = null;
    if (!connecting) cancelConnect();
    else {
      $("connect").classList.add("active");
      $("cancel-connect").hidden = false;
      $("connection-hint").textContent = "Select the first device";
    }
  };
  $("cancel-connect").onclick = cancelConnect;
  const svg = $("canvas");
  function point(e) {
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }

  const appPalette = document.createElement("section");
  appPalette.innerHTML =
    '<h2 class="palette-heading" tabindex="0" title="Choose an application, then click the canvas to place it or a host to install it."><svg class="palette-heading-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M7 6h1m3 0h1M7 13h10M7 17h7"/></svg><span>Applications</span></h2><div class="palette"><button id="add-dhcp-application" draggable="true" title="Add DHCP server application" aria-label="Add DHCP server application"><svg viewBox="-30 -26 60 52">' +
    applicationGlyph +
    "</svg><span>DHCP server</span></button></div>";
  $("left-panel").append(appPalette);
  const dnsButton = document.createElement("button");
  dnsButton.id = "add-dns-application";
  dnsButton.innerHTML =
    '<svg viewBox="-30 -26 60 52">' +
    appGlyph("dns") +
    "</svg><span>DNS server</span>";
  appPalette.querySelector(".palette").append(dnsButton);
  for (const type of ["web", "browser", "echo"]) {
    const button = document.createElement("button");
    button.id = "add-" + type + "-application";
    button.innerHTML =
      '<svg viewBox="-30 -26 60 52">' +
      appGlyph(type) +
      "</svg><span>" +
      appLabel(type) +
      "</span>";
    appPalette.querySelector(".palette").append(button);
  }
  const toolsPalette=document.createElement('section');
  toolsPalette.innerHTML='<h2 class="palette-heading" tabindex="0"><svg class="palette-heading-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg><span>Tools</span></h2><div class="palette"><button id="add-nmap-application" type="button"><svg viewBox="-30 -26 60 52">'+appGlyph('nmap')+'</svg><span>Nmap</span></button></div>';
  const generatorButton=document.createElement('button');generatorButton.id='add-generator-application';generatorButton.type='button';generatorButton.innerHTML='<svg viewBox="-30 -26 60 52">'+appGlyph('generator')+'</svg><span>Traffic Generator</span>';toolsPalette.querySelector('.palette').append(generatorButton);
  const spooferButton=document.createElement('button');spooferButton.id='add-spoofer-application';spooferButton.type='button';spooferButton.innerHTML='<svg viewBox="-30 -26 60 52">'+appGlyph('spoofer')+'</svg><span>ARP Spoofer</span>';toolsPalette.querySelector('.palette').append(spooferButton);
  $('left-panel').append(toolsPalette);
  const certificateGlyph='<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M9 4h24l6 6v25H9ZM15 13h16M15 19h12"/><circle cx="29" cy="30" r="7"/><path d="m24 36-2 9 7-4 7 4-2-9"/></svg>';
  const certificateButton=document.createElement('button');certificateButton.id='add-certificate';certificateButton.type='button';certificateButton.title='Attach certificate to a Web Server';certificateButton.setAttribute('aria-label','Add certificate');certificateButton.innerHTML=certificateGlyph+'<span>Certificate</span>';appPalette.querySelector('.palette').append(certificateButton);
  certificateButton.onclick=()=>{beginPlacement('certificate','certificate');say('Click a Web Server application or its host to attach a simulated certificate. Escape cancels.');};
  certificateButton.draggable=true;certificateButton.ondragstart=e=>{if(!editable()){e.preventDefault();return;}e.dataTransfer.setData('application/x-network-certificate','certificate');};
  function attachCertificate(host){const d=net.device(host);if(!d?.webServer)throw Error('Choose a host with a Web Server installed.');if(d.webServer.certificateName)throw Error('This server already has a certificate. Edit it in Web Server settings.');const name=net.devices.flatMap(x=>x.dnsServer?.records||[]).find(r=>r.address===d.ip)?.name||d.ip||'server.example';net.configureWeb(d.id,{...d.webServer,tls:true,port:d.webServer.port===80?443:d.webServer.port,certificateName:name,certificateTrusted:true,certificateValid:true});selected='web:'+host;}
  function bindApplicationButton(button, type) {
    button.draggable = true;
    button.dataset.paletteApplication = type;
    button.setAttribute("aria-label", "Add " + appLabel(type) + " application");
    button.title = "Add " + appLabel(type) + " application";
    button.ondragstart = (e) => {
      if (!editable()) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData("application/x-network-app", type);
      e.dataTransfer.effectAllowed = "copy";
    };
    button.onclick = () => beginPlacement("application", type);
  }
  for (const type of ["dhcp", "dns", "web", "browser", "echo", "nmap", "generator", "spoofer"])
    bindApplicationButton($("add-" + type + "-application"), type);
  let paletteDrag=null, paletteDragImage=null;
  function clearPaletteDrag(){paletteDrag=null;paletteDragImage?.remove();paletteDragImage=null;}
  function paletteDropTarget(target){
    const node=target.closest('[data-device],[data-anchor-device]');
    const app=applications().find(a=>a.id===target.closest('[data-application]')?.dataset.application);
    const host=node?.dataset.device||node?.dataset.anchorDevice||app?.host;
    const device=net.device(host);
    const occupied=!!target.closest('[data-device],[data-anchor-device],[data-application],[data-note],[data-link]');
    if(!paletteDrag)return {valid:false};
    if(paletteDrag.kind==='certificate')return {host,valid:!!device?.webServer&&!device.webServer.certificateName&&(!app||app.type==='web')};
    if(paletteDrag.kind==='application')return {host,valid:host?device?.type==='host'&&!device[appKey(paletteDrag.type)]:!occupied};
    return {valid:!occupied};
  }
  svg.addEventListener('dragover',e=>{
    if(!paletteDrag)return;
    const valid=paletteDropTarget(e.target).valid;
    e.dataTransfer.dropEffect=valid?'copy':'none';
    if(valid)e.preventDefault();
  });
  svg.addEventListener('drop',e=>{
    if(!paletteDrag)return;
    e.preventDefault();
    const target=paletteDropTarget(e.target),pending=paletteDrag,p=point(e);
    clearPaletteDrag();
    if(!target.valid)return;
    mutate(()=>{
      if(pending.kind==='certificate')attachCertificate(target.host);
      else if(pending.kind==='device')selected=net.add(pending.type,p.x,p.y).id;
      else if(pending.kind==='note'){createNote(p.x,p.y);return;}
      else {
        const a=net.addApplication(p.x,p.y,pending.type);selected=a.id;
        if(target.host){net.installApplication(a.id,target.host);net.device(target.host)[appOffsetKey(pending.type)]={...appDefaultOffset(pending.type)};selected=pending.type+':'+target.host;}
      }
      finishPlacement();openInspector();
    });
  });

  svg.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0) return;
      const host = e.target.closest("[data-device]")?.dataset.device;
      if (appConnecting && host) {
        e.preventDefault();
        e.stopImmediatePropagation();
        installOnHost(appConnecting, host);
        return;
      }
      const el = e.target.closest("[data-application]");
      if (!el) {
        lastApplicationClick = null;
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      const a = applications().find((a) => a.id === el.dataset.application);
      selected = a.id;
      openInspector();
      if (e.target.closest("[data-app-anchor]")) {
        appConnecting = a.id;
        appGesture = { anchor: true, id: a.id };
      } else {
        const p = point(e);
        appGesture = {
          id: a.id,
          ctrl: e.ctrlKey,
          x: p.x,
          y: p.y,
          dx: p.x - a.x,
          dy: p.y - a.y,
          moved: false,
        };
      }
      svg.setPointerCapture(e.pointerId);
      render();
    },
    true,
  );
  svg.addEventListener(
    "pointermove",
    (e) => {
      if (!appGesture) return;
      e.stopImmediatePropagation();
      const p = point(e),
        a = applications().find((a) => a.id === appGesture.id);
      if (!a) return;
      if (appGesture.anchor) {
        $("cable-preview").innerHTML =
          '<line class="application-attachment" x1="' +
          a.x +
          '" y1="' +
          a.y +
          '" x2="' +
          p.x +
          '" y2="' +
          p.y +
          '"/>';
        return;
      }
      if (net.queue.length || staged) return;
      appGesture.moved ||=
        Math.hypot(p.x - appGesture.x, p.y - appGesture.y) > 4;
      const x = Math.max(
          45,
          Math.min(
            Math.max(
              855,
              svg.viewBox.baseVal.x + svg.viewBox.baseVal.width - 45,
            ),
            p.x - appGesture.dx,
          ),
        ),
        y = Math.max(
          35,
          Math.min(
            Math.max(
              510,
              svg.viewBox.baseVal.y + svg.viewBox.baseVal.height - 50,
            ),
            p.y - appGesture.dy,
          ),
        ),
        d = net.device(a.host);
      if (d) d[appOffsetKey(a.type)] = { x: x - d.x, y: y - d.y };
      else
        Object.assign(
          net.applicationDrafts.find((q) => q.id === a.id),
          { x, y },
        );
      drawApplications();
    },
    true,
  );
  svg.addEventListener(
    "pointerup",
    (e) => {
      if (!appGesture) return;
      e.stopImmediatePropagation();
      if (svg.hasPointerCapture(e.pointerId))
        svg.releasePointerCapture(e.pointerId);
      const g = appGesture;
      appGesture = null;
      $("cable-preview").replaceChildren();
      const a = applications().find((a) => a.id === g.id);
      if (a?.host && g.ctrl && !g.moved && !g.anchor) {
        lastApplicationClick = null;
        enableCanvasWatch(a.host, ["firewall","ids"].includes(a.type)?undefined:a.type);
        return;
      }
      if (a?.host && !g.moved && !g.anchor) {
        const now = performance.now();
        if (
          lastApplicationClick?.id === a.id &&
          now - lastApplicationClick.time < 450 &&
          Math.hypot(
            e.clientX - lastApplicationClick.x,
            e.clientY - lastApplicationClick.y,
          ) < 5
        ) {
          lastApplicationClick = null;
          openCanvasTerminal(a.host, a.id);
          return;
        } else
          lastApplicationClick = {
            id: a.id,
            time: now,
            x: e.clientX,
            y: e.clientY,
          };
      } else lastApplicationClick = null;
      if (a && !a.host && (g.moved || g.anchor)) {
        const p = point(e),
          d = net.devices.find(
            (d) => Math.abs(d.x - p.x) < 45 && Math.abs(d.y - p.y) < 40,
          );
        if (d) {
          installOnHost(a.id, d.id);
          const host = net.device(d.id);
          if (selected === a.type + ":" + d.id)
            host[appOffsetKey(a.type)] = { ...appDefaultOffset(a.type) };
        }
      }
      render();
    },
    true,
  );
  svg.addEventListener('keydown',e=>{if(placing?.kind!=='certificate'||!['Enter',' '].includes(e.key))return;e.preventDefault();e.stopImmediatePropagation();const app=applications().find(a=>a.id===e.target.closest('[data-application]')?.dataset.application);mutate(()=>{attachCertificate(e.target.closest('[data-device]')?.dataset.device||app?.host);finishPlacement();openInspector();});},true);
  svg.addEventListener("keydown", (e) => {
    const a = e.target.closest("[data-application]");
    if (a && ["Enter", " "].includes(e.key)) {
      e.preventDefault();
      selectApplication(a.dataset.application);
    }
  });
  svg.addEventListener("pointercancel", () => {
    appGesture = null;
    appConnecting = null;
    lastApplicationClick = null;
    $("cable-preview").replaceChildren();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      appConnecting = null;
      appGesture = null;
      $("cable-preview").replaceChildren();
    }
  });
  svg.addEventListener("pointermove", (e) => {
    const target = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest("[data-device],[data-anchor-device]");
    revealAnchors(
      target?.dataset.device || target?.dataset.anchorDevice || null,
    );
  });
  svg.addEventListener("pointerleave", () => revealAnchors(null));
  svg.addEventListener("focusin", (e) => {
    const target = e.target.closest("[data-device],[data-anchor-device]");
    revealAnchors(
      target?.dataset.device || target?.dataset.anchorDevice || null,
    );
  });
  svg.addEventListener("focusout", (e) => {
    if (!svg.contains(e.relatedTarget)) revealAnchors(null);
  });
  svg.addEventListener(
    "pointerdown",
    (e) => {
      if (e.target.closest("[data-watch-device]")) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  function disableCanvasWatch(e) {
    const eye = e.target.closest("[data-watch-device]");
    if (!eye) return;
    const id = eye.dataset.watchDevice,
      d = net.device(id);
    if (!d) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    d.watch = false;
    render();
    if (e.type === "keydown")
      svg.querySelector('[data-device="' + id + '"]')?.focus();
  }
  svg.addEventListener("click", disableCanvasWatch, true);
  // Track clicks across SVG replacement during selection and pointer capture.
  let devicePress = null,
    lastDeviceClick = null;
  svg.addEventListener("canvas-deselect", () => {
    if (selected && !placing && !connecting && !endpoint && !appConnecting) {
      selected = null;
      render();
    }
  });
  svg.addEventListener("viewport-gesture-start", () => {
    drag = null;
    appGesture = null;
    cableGesture = null;
    devicePress = null;
    cancelConnect();
  });
  svg.addEventListener(
    "pointerdown",
    (e) => {
      devicePress = null;
      if (
        e.button !== 0 ||
        placing ||
        connecting ||
        endpoint ||
        e.target.closest("[data-watch-device],[data-anchor-device]")
      ) {
        lastDeviceClick = null;
        return;
      }
      const node = e.target.closest("[data-device]");
      if (node)
        devicePress = { id: node.dataset.device, x: e.clientX, y: e.clientY, ctrl: e.ctrlKey };
      else lastDeviceClick = null;
    },
    true,
  );
  svg.addEventListener(
    "pointerup",
    (e) => {
      const press = devicePress;
      devicePress = null;
      if (!press) return;
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5) {
        lastDeviceClick = null;
        return;
      }
      const now = performance.now();
      if (press.ctrl) {
        lastDeviceClick = null;
        drag = null;
        if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
        e.stopImmediatePropagation();
        enableCanvasWatch(press.id);
        return;
      }
      if (
        lastDeviceClick &&
        lastDeviceClick.id === press.id &&
        now - lastDeviceClick.time < 450 &&
        Math.hypot(
          e.clientX - lastDeviceClick.x,
          e.clientY - lastDeviceClick.y,
        ) < 5
      ) {
        lastDeviceClick = null;
        const d = net.device(press.id);
        if (d) {
          drag = null;
          if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
          e.stopImmediatePropagation();
          openCanvasTerminal(d.id);
        }
      } else lastDeviceClick = { ...press, time: now };
    },
    true,
  );
  svg.addEventListener(
    "pointercancel",
    () => {
      devicePress = null;
      lastDeviceClick = null;
    },
    true,
  );
  svg.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Enter" || e.key === " ") disableCanvasWatch(e);
    },
    true,
  );
  svg.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const anchor = e.target.closest("[data-anchor-device]");
    if (anchor) {
      e.preventDefault();
      if (!endpoint) pickAnchor(anchor);
      cableGesture = { x: e.clientX, y: e.clientY };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    const node = e.target.closest("[data-device]");
    if (!node) return;
    const d = net.device(node.dataset.device);
    openInspector();
    if (connecting) {
      select(d.id);
      return;
    }
    if (staged) {
      selected = d.id;
      render();
      return;
    }
    const p = point(e);
    drag = {
      id: d.id,
      dx: p.x - d.x,
      dy: p.y - d.y,
      startX: d.x,
      startY: d.y,
      pressX: e.clientX,
      pressY: e.clientY,
      target: null,
    };
    selected = d.id;
    svg.setPointerCapture(e.pointerId);
    render();
  });
  svg.addEventListener("pointermove", (e) => {
    if (endpoint) {
      previewCable(point(e));
      return;
    }
    if (!drag) return;
    const d = net.device(drag.id),
      p = point(e);
    d.x = Math.max(
      55,
      Math.min(
        Math.max(845, svg.viewBox.baseVal.x + svg.viewBox.baseVal.width - 55),
        p.x - drag.dx,
      ),
    );
    d.y = Math.max(
      55,
      Math.min(
        Math.max(470, svg.viewBox.baseVal.y + svg.viewBox.baseVal.height - 90),
        p.y - drag.dy,
      ),
    );
    drag.target =
      net.devices.find(
        (other) =>
          other.id !== d.id &&
          Math.abs(other.x - p.x) <= 41 &&
          Math.abs(other.y - p.y) <= 33,
      )?.id || null;
    draw();
    if (drag.target)
      $("devices")
        .querySelector('[data-device="' + drag.target + '"]')
        ?.classList.add("connection-drop-target");
  });
  svg.addEventListener("pointerup", (e) => {
    const dropped = drag;
    drag = null;
    if (svg.hasPointerCapture(e.pointerId))
      svg.releasePointerCapture(e.pointerId);
    if (
      dropped?.target &&
      Math.hypot(e.clientX - dropped.pressX, e.clientY - dropped.pressY) > 5
    ) {
      const source = net.device(dropped.id),
        destination = net.device(dropped.target);
      source.x = dropped.startX;
      source.y = dropped.startY;
      draw();
      if (!editable()) return;
      const dx = destination.x - source.x,
        dy = destination.y - source.y,
        a =
          Math.abs(dx) >= Math.abs(dy)
            ? dx >= 0
              ? "right"
              : "left"
            : dy >= 0
              ? "bottom"
              : "top",
        b = { right: "left", left: "right", top: "bottom", bottom: "top" }[a];
      cancelConnect();
      pickAnchor(
        svg.querySelector(
          '[data-anchor-device="' +
            source.id +
            '"][data-anchor-port="' +
            a +
            '"]',
        ),
      );
      pickAnchor(
        svg.querySelector(
          '[data-anchor-device="' +
            destination.id +
            '"][data-anchor-port="' +
            b +
            '"]',
        ),
      );
      return;
    }
    $("devices")
      .querySelectorAll(".connection-drop-target")
      .forEach((el) => el.classList.remove("connection-drop-target"));
    if (!cableGesture || !endpoint) return;
    const target = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest("[data-anchor-device]");
    const moved =
      Math.hypot(e.clientX - cableGesture.x, e.clientY - cableGesture.y) > 4;
    if (
      target &&
      (target.dataset.anchorDevice !== endpoint.device ||
        target.dataset.anchorPort !== endpoint.port)
    )
      pickAnchor(target);
    else if (moved) cancelConnect();
    cableGesture = null;
  });
  svg.addEventListener("pointercancel", () => {
    drag = null;
    cancelConnect();
  });
  svg.addEventListener("click", (e) => {
    const wire = e.target.closest("[data-link]");
    if (wire) select(wire.dataset.link);
  });
  svg.addEventListener("keydown", (e) => {
    const anchor = e.target.closest("[data-anchor-device]");
    if (anchor && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      pickAnchor(anchor);
      return;
    }
    const node = e.target.closest("[data-device]"),
      wire = e.target.closest("[data-link]");
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (node) select(node.dataset.device);
      if (wire) select(wire.dataset.link);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      finishPlacement();
      cancelConnect();
    }
  });
  function arrangeNetwork() {
    finishPlacement();
    drag = null;
    if (!net.devices.length) {
      say("Add devices to arrange the network.");
      return;
    }
    NetworkExplorerExamples.arrange(net);
    const noteSlots = new Map(),
      noteTargets = new Map(
        [...net.devices, ...applications()].map((item) => [item.id, item]),
      );
    for (const note of net.notes) {
      const target = noteTargets.get(note.target);
      if (!target) continue;
      const slot = noteSlots.get(target.id) || 0;
      noteSlots.set(target.id, slot + 1);
      note.x = target.x + 52 + (slot % 3) * 36;
      note.y = target.y - 48 - Math.floor(slot / 3) * 42;
    }

    render();
    window.NetworkExplorerViewport?.fit();
    say("Network arranged. Drag any device to fine-tune its position.");
  }
  $("arrange-network").onclick = arrangeNetwork;
  const compactPalette = document.createElement("aside");
  compactPalette.id = "compact-palette";
  compactPalette.hidden = true;
  compactPalette.setAttribute("aria-label", "Devices");
  compactPalette.innerHTML = ["host", "switch", "router", "firewall"]
    .map(
      (type) =>
        '<button type="button" class="compact-device" data-add-type="' +
        type +
        '" aria-label="Add ' +
        type +
        '"><svg viewBox="-42 -35 84 72" aria-hidden="true">' +
        icon({ type }) +
        '</svg><span role="tooltip">Add ' +
        type +
        "</span></button>",
    )
    .join("");
  $("left-panel").after(compactPalette);
  compactPalette
    .querySelectorAll("[data-add-type]")
    .forEach(
      (button) =>
        (button.onclick = () => addFromPalette(button.dataset.addType)),
    );
  const appDivider = document.createElement("div");
  appDivider.className = "compact-palette-divider";
  appDivider.setAttribute("role", "separator");
  compactPalette.append(appDivider);
  for (const type of ["dhcp", "dns", "web", "browser", "echo", "nmap", "generator", "spoofer"]) {
    const button = document.createElement("button");
    button.className = "compact-device compact-application";
    button.innerHTML =
      '<svg viewBox="-30 -26 60 52">' +
      appGlyph(type) +
      '</svg><span role="tooltip">' +
      appLabel(type) +
      "</span>";
    bindApplicationButton(button, type);
    compactPalette.append(button);
  }
  const compactCertificate=certificateButton.cloneNode(true);compactCertificate.id='compact-certificate';compactCertificate.className='compact-device compact-application';compactCertificate.onclick=certificateButton.onclick;compactCertificate.ondragstart=certificateButton.ondragstart;compactPalette.append(compactCertificate);
  for (const side of ["left", "right"]) {
    $("toggle-" + side).onclick = () => {
      const panel = $(side + "-panel"),
        button = $("toggle-" + side);
      panel.hidden = !panel.hidden;
      if (side === "left") compactPalette.hidden = panel.hidden === false;
      document
        .querySelector("main")
        .classList.toggle(side + "-collapsed", panel.hidden);
      button.setAttribute("aria-expanded", String(!panel.hidden));
      const label =
        (panel.hidden ? "Show" : "Collapse") + " " + side + " panel";
      button.setAttribute("aria-label", label);
      button.title = label;
    };
  }
  function bindTerminalFocus(doc) {
    doc.addEventListener("click", (event) => {
      const panel = event.target.closest("#terminal-panel");
      if (!panel || event.target.closest('button, input, select, textarea, a, [role="button"], [contenteditable="true"]')) return;
      const selection = doc.getSelection();
      if (selection && !selection.isCollapsed && panel.contains(selection.anchorNode)) return;
      const input = doc.getElementById("command");
      input?.focus({ preventScroll: true });
    });
  }
  bindTerminalFocus(document);
  const terminalPanel = $("terminal-panel");
  const terminalNotice = document.createElement("section");
  terminalNotice.hidden = true;
  terminalNotice.innerHTML =
    '<p>Terminal is in the external window.</p><button id="dock-terminal">Dock</button>';
  terminalPanel.after(terminalNotice);
  function dockTerminal() {
    const entry = externalPanels.get("terminal");
    externalPanels.delete("terminal");
    if (entry && !entry.window.closed) entry.window.close();
    terminalPanel.hidden = false;
    terminalNotice.hidden = true;
    openTool("terminal", true);
    $("terminal").scrollTop = terminalSession?.scroll || 0;
    $("float-terminal").focus();
  }
  $("dock-terminal").onclick = dockTerminal;
  $("float-terminal").onclick = () => {
    if (
      openExternal(
        "terminal",
        "Terminal - Network Explorer",
        () => {
          const clone = terminalPanel.cloneNode(true);
          clone.querySelector("#float-terminal")?.remove();
          clone.querySelector(".close-tool")?.remove();
          clone
            .querySelector("#command")
            .setAttribute("value", $("command").value);
          return (
            '<section id="terminal-panel">' + clone.innerHTML + "</section>"
          );
        },
        dockTerminal,
      )
    ) {
      terminalPanel.hidden = true;
      terminalNotice.hidden = false;
    }
  };
  $("continue").onclick = () => {
    $("examine").close();
    commit();
    previousFocus?.focus();
  };
  $("examine-watch").onchange = () => {
    if (!staged) return;
    const d = net.device(staged.report.device);
    if (
      ["dhcp", "dns", "web", "browser", "echo", "nmap", "generator", "spoofer"].includes(
        $("examine-watch").dataset.scope,
      )
    )
      d[appWatchKey($("examine-watch").dataset.scope)] =
        $("examine-watch").checked;
    else d.watch = $("examine-watch").checked;
    $("examine-watch-status").textContent = $("examine-watch").checked
      ? "On"
      : "Off";
    draw();
    inspector();
    syncExternal();
  };
  $("examine").addEventListener("cancel", (e) => e.preventDefault());
  $("clear-state").onclick = () => {
    if (
      !confirm(
        "Clear learned state and pending traffic? Device configuration will be retained.",
      )
    )
      return;
    discard();
    net.reset();
    examined = false;
    render();
    output(
      "Learned state and pending traffic cleared. Configuration retained.",
    );
  };
  NetworkExplorerActions.register("new", () => {
    if (
      (net.devices.length ||
        net.applicationDrafts.length ||
        net.notes.length) &&
      !confirm("Clear this network? Save first if you want to keep it.")
    )
      return;
    discard();
    candidateBase = null;
    net = new NetworkExplorer.Network();
    selected = null;
    examined = false;
    cancelConnect();
    render();
  });
  function fitOpenedNetwork() {
    // Wait for the welcome screen to close and the canvas layout to settle.
    requestAnimationFrame(() => window.NetworkExplorerViewport?.fit());
  }
  function registerExample(id, load) {
    NetworkExplorerActions.register(id, () => {
      const previous = net;
      const result = load();
      if (net !== previous) {
        fitOpenedNetwork();
        document.dispatchEvent(new CustomEvent("network-recent-record", {
          detail: { name: NetworkExplorerActions.examples[id].title, data: net.save() },
        }));
      }
      return result;
    });
  }
  registerExample("example-dhcp", () => {
    if (
      (net.devices.length || net.applicationDrafts.length) &&
      !confirm("Replace this network with the DHCP example?")
    )
      return;
    discard();
    candidateBase = null;
    net = new NetworkExplorer.Network();
    const client = net.add("host", 180, 280),
      sw = net.add("switch", 450, 280),
      server = net.add("host", 720, 280);
    server.name = "DHCP Server";
    client.name = "DHCP Client";
    net.configure(server.id, "192.168.1.2", 24);
    net.configureDhcpServer(server.id, {
      enabled: true,
      start: "192.168.1.100",
      end: "192.168.1.120",
      prefix: 24,
      gateway: "",
      leaseSeconds: 120,
    });
    net.configureAddressMode(client.id, "dhcp");
    net.connect(client.id, "p0", sw.id, "p0");
    net.connect(server.id, "p0", sw.id, "p1");
    selected = client.id;
    examined = false;
    cancelConnect();
    render();
    say(
      "Acquire a lease using the renew icon or ipconfig /renew, then ping 192.168.1.2.",
    );
  });
  registerExample("example-dhcp-relay", () => {
    if (
      (net.devices.length || net.applicationDrafts.length) &&
      !confirm("Replace this network with the DHCP relay example?")
    )
      return;
    discard();
    candidateBase = null;
    net = new NetworkExplorer.Network();
    const client = net.add("host", 90, 300),
      sw = net.add("switch", 270, 300),
      r1 = net.add("router", 450, 300),
      r2 = net.add("router", 630, 300),
      server = net.add("host", 810, 300);
    client.name = "DHCP Client";
    r1.name = "Relay Router";
    r2.name = "Server Router";
    server.name = "Remote DHCP Server";
    net.configureInterface(r1.id, "p0", "192.168.1.1", 24);
    net.configureInterface(r1.id, "p1", "10.0.0.1", 30);
    net.configureInterface(r2.id, "p0", "10.0.0.2", 30);
    net.configureInterface(r2.id, "p1", "192.168.2.1", 24);
    net.configure(server.id, "192.168.2.2", 24);
    net.configureGateway(server.id, "192.168.2.1");
    net.setStaticRoute(r1.id, "192.168.2.0", 24, "10.0.0.2", "server-lan");
    net.setStaticRoute(r2.id, "192.168.1.0", 24, "10.0.0.1", "client-lan");
    net.configureDhcpRelay(r1.id, "p0", "192.168.2.2");
    net.configureDhcpServer(server.id, {
      enabled: true,
      start: "192.168.1.100",
      end: "192.168.1.120",
      prefix: 24,
      gateway: "192.168.1.1",
      leaseSeconds: 120,
    });
    net.configureAddressMode(client.id, "dhcp");
    net.connect(client.id, "p0", sw.id, "p0");
    net.connect(sw.id, "p1", r1.id, "p0");
    net.connect(r1.id, "p1", r2.id, "p0");
    net.connect(r2.id, "p1", server.id, "p0");
    selected = client.id;
    examined = false;
    cancelConnect();
    render();
    say(
      "Watch the relay router to see broadcast become unicast. Acquire a lease, then ping 192.168.2.2.",
    );
  });
  registerExample("example-static", () => {
    if (
      (net.devices.length || net.applicationDrafts.length) &&
      !confirm("Replace this network with the two-router example?")
    )
      return;
    discard();
    candidateBase = null;
    net = new NetworkExplorer.Network();
    const a = net.add("host", 90, 350),
      sw1 = net.add("switch", 240, 220),
      r1 = net.add("router", 390, 350),
      r2 = net.add("router", 540, 220),
      sw2 = net.add("switch", 690, 350),
      b = net.add("host", 820, 220);
    net.configure(a.id, "192.168.1.10", 24);
    net.configure(b.id, "192.168.2.20", 24);
    net.configureInterface(r1.id, "p0", "192.168.1.1", 24);
    net.configureInterface(r1.id, "p1", "10.0.0.1", 30);
    net.configureInterface(r2.id, "p0", "10.0.0.2", 30);
    net.configureInterface(r2.id, "p1", "192.168.2.1", 24);
    net.configureGateway(a.id, "192.168.1.1");
    net.configureGateway(b.id, "192.168.2.1");
    net.connect(a.id, "p0", sw1.id, "p0");
    net.connect(sw1.id, "p1", r1.id, "p0");
    net.connect(r1.id, "p1", r2.id, "p0");
    net.connect(r2.id, "p1", sw2.id, "p0");
    net.connect(sw2.id, "p1", b.id, "p0");
    net.setStaticRoute(r1.id, "192.168.2.0", 24, "10.0.0.2", "remote-lan");
    net.setStaticRoute(r2.id, "192.168.1.0", 24, "10.0.0.1", "remote-lan");
    selected = r1.id;
    examined = false;
    cancelConnect();
    render();
  });
  registerExample("example-routed", () => {
    if (
      (net.devices.length || net.applicationDrafts.length) &&
      !confirm("Replace this network with the two-subnet example?")
    )
      return;
    discard();
    candidateBase = null;
    net = new NetworkExplorer.Network();
    const a = net.add("host", 120, 320),
      left = net.add("switch", 290, 200),
      r = net.add("router", 450, 320),
      right = net.add("switch", 610, 200),
      b = net.add("host", 780, 320);
    net.configure(a.id, "192.168.1.10", 24);
    net.configure(b.id, "192.168.2.20", 24);
    net.configureInterface(r.id, "p0", "192.168.1.1", 24);
    net.configureInterface(r.id, "p1", "192.168.2.1", 24);
    net.configureGateway(a.id, "192.168.1.1");
    net.configureGateway(b.id, "192.168.2.1");
    net.connect(a.id, "p0", left.id, "p0");
    net.connect(left.id, "p1", r.id, "p0");
    net.connect(r.id, "p1", right.id, "p0");
    net.connect(right.id, "p1", b.id, "p0");
    selected = r.id;
    examined = false;
    cancelConnect();
    render();
  });
  registerExample("example-vlans", () => {
    if (
      (net.devices.length || net.applicationDrafts.length) &&
      !confirm("Replace this network with the two-VLAN example?")
    )
      return;
    discard();
    candidateBase = null;
    net = new NetworkExplorer.Network();
    const sw = net.add("switch", 450, 280);
    net.setVlan(sw.id, 10, "Students", "#287d78");
    net.setVlan(sw.id, 20, "Staff", "#96652b");
    const hosts = [
      [190, 150],
      [710, 150],
      [190, 420],
      [710, 420],
    ].map(([x, y], i) => {
      const h = net.add("host", x, y);
      net.configure(h.id, "192.168.1." + (i + 1) * 10, 24);
      net.connect(h.id, "p0", sw.id, "p" + i);
      net.configurePort(sw.id, "p" + i, { accessVlan: i < 2 ? 10 : 20 });
      return h;
    });
    sw.watch = false;
    selected = sw.id;
    examined = false;
    cancelConnect();
    render();
  });
  registerExample("example-direct", () => {
    if ((net.devices.length || net.applicationDrafts.length) && !confirm("Replace this network with the direct connection example?")) return;
    discard(); candidateBase = null;
    const example = NetworkExplorerExamples.direct(NetworkExplorer.Network);
    net = example.network; selected = example.clientId; examined = false;
    cancelConnect(); openInspector(); render();
    say("From Host 1, ping 192.168.1.2. The hosts share a subnet, so no gateway is needed.");
  });
  registerExample("example", () => {
    if (
      (net.devices.length || net.applicationDrafts.length) &&
      !confirm("Replace this network with the example LAN?")
    )
      return;
    discard();
    candidateBase = null;
    net = new NetworkExplorer.Network();
    const a = net.add("host", 180, 180),
      s = net.add("switch", 450, 290),
      b = net.add("host", 720, 180);
    net.configure(a.id, "192.168.1.10", 24);
    net.configure(b.id, "192.168.1.20", 24);
    net.connect(a.id, "p0", s.id, "p0");
    net.connect(b.id, "p0", s.id, "p1");
    s.watch = false;
    selected = s.id;
    examined = false;
    cancelConnect();
    render();
  });
  $("save").onclick = () => {
    if (candidateBase) {
      say("Commit or revert candidate changes before saving.");
      return;
    }
    document.dispatchEvent(
      new CustomEvent("network-recent-record", {
        detail: { name: "Saved network", data: net.save() },
      }),
    );
    const blob = new Blob([JSON.stringify(net.save(), null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "network-explorer.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say(
      "Saved topology and configuration. Learned tables restart empty when loaded.",
    );
  };
  $("load").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (file.size > 500000)
        throw Error("Choose a topology file smaller than 500 KB.");
      const data = JSON.parse(await file.text());
      const beforeLoad = historySnapshot();
      const next = new NetworkExplorer.Network(data);
      if (
        (net.devices.length || net.applicationDrafts.length) &&
        !confirm("Replace the current network with this saved topology?")
      )
        return;
      discard();
      candidateBase = null;
      net = next;
      selected = null;
      examined = false;
      cancelConnect();
      render();
      fitOpenedNetwork();
      recordHistory(beforeLoad, "Load network");
      document.dispatchEvent(
        new CustomEvent("network-recent-record", {
          detail: { name: file.name, data: net.save() },
        }),
      );
      say("Network loaded. Learned tables start empty.");
    } catch (err) {
      say(err.message);
    } finally {
      e.target.value = "";
    }
  };

  // Context actions share the inspector's state and editing restrictions.
  const contextMenu = document.createElement("div");
  contextMenu.id = "canvas-context-menu";
  contextMenu.setAttribute("role", "menu");
  contextMenu.setAttribute("aria-label", "Network item actions");
  contextMenu.hidden = true;
  document.body.append(contextMenu);
  let contextTarget = null;
  function closeContext(restore = false) {
    contextMenu.hidden = true;
    if (restore && contextTarget) {
      const node = [...svg.querySelectorAll("[data-device],[data-link]")].find(
        (el) => (el.dataset.device || el.dataset.link) === contextTarget,
      );
      node?.focus();
    }
  }
  function openContext(event, target) {
    const id =
      target.dataset.device ||
      target.dataset.link ||
      target.dataset.application ||
      target.dataset.note;
    const device = net.device(id),
      link = net.links.find((l) => l.id === id);
    const application = applications().find((a) => a.id === id),
      note = net.notes.find((n) => n.id === id);
    event.preventDefault();
    if (device) openInspector();
    const bounds = target.getBoundingClientRect();
    finishPlacement();
    cancelConnect();
    drag = null;
    selected = id;
    contextTarget = id;
    render();
    const busy = Boolean(net.queue.length || staged);
    const actions = [];
    const location = point({
      clientX: Number.isFinite(event.clientX)
        ? event.clientX
        : bounds.left + bounds.width / 2,
      clientY: Number.isFinite(event.clientY)
        ? event.clientY
        : bounds.top + bounds.height / 2,
    });
    actions.push({
      label: "Add note",
      run: () =>
        createNote(
          location.x + 20,
          location.y + 20,
          device?.id || application?.id || null,
        ),
    });
    if (device) {
      if (device.type === "host")
        actions.push({
          label: "Ping...",
          run: () => {
            selected = id;
            inspector();
            $("command").value = "ping ";
            commandDraft = "ping ";
            historyIndex = commandHistory.length;
            syncExternal();
            openTool("terminal", true);
            const input =
              externalPanels
                .get("terminal")
                ?.window.document.getElementById("command") || $("command");
            input.value = "ping ";
            input.focus();
            input.setSelectionRange(5, 5);
          },
        });
      actions.push({
        label: device.watch ? "Unwatch device" : "Watch device",
        run: () => {
          const current = net.device(id);
          current.watch = !current.watch;
          render();
        },
      });
      actions.push({
        label: "Connect to another device",
        disabled: busy,
        run: () => {
          connecting = true;
          endpoint = null;
          $("connect").classList.add("active");
          $("cancel-connect").hidden = false;
          $("connection-hint").textContent = "Choose the first interface";
          choosePort(id);
        },
      });
      actions.push({
        label: "Delete device",
        disabled: busy,
        danger: true,
        run: () => deleteTopologyItem(id),
      });
    } else if (link) {
      actions.push({
        label: link.enabled ? "Disable connection" : "Enable connection",
        disabled: busy,
        run: () =>
          mutate(() => {
            link.enabled = !link.enabled;
          }),
      });
      actions.push({
        label: "Delete connection",
        disabled: busy,
        danger: true,
        run: () => deleteTopologyItem(id),
      });
    }
    contextMenu.replaceChildren();
    for (const action of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.textContent = action.label;
      button.disabled = Boolean(action.disabled);
      if (action.danger) button.className = "context-danger";
      button.onclick = () => {
        closeContext();
        action.run();
      };
      contextMenu.append(button);
    }
    if (busy) {
      const note = document.createElement("p");
      note.textContent = "Finish or clear traffic to edit the network.";
      contextMenu.append(note);
    }
    contextMenu.hidden = false;
    const x = event.type === "keydown" ? bounds.left + 20 : event.clientX;
    const y = event.type === "keydown" ? bounds.top + 20 : event.clientY;
    contextMenu.style.left =
      Math.max(
        4,
        Math.min(
          x,
          document.documentElement.clientWidth - contextMenu.offsetWidth - 4,
        ),
      ) + "px";
    contextMenu.style.top =
      Math.max(
        4,
        Math.min(y, window.innerHeight - contextMenu.offsetHeight - 4),
      ) + "px";
    contextMenu.querySelector("button:not(:disabled)").focus();
  }
  svg.addEventListener("contextmenu", (event) => {
    const target =
      event.target.closest(
        "[data-device],[data-link],[data-application],[data-note]",
      ) || svg;
    openContext(event, target);
  });
  svg.addEventListener("keydown", (event) => {
    if (
      event.key === "ContextMenu" ||
      (event.shiftKey && event.key === "F10")
    ) {
      const target =
        event.target.closest(
          "[data-device],[data-link],[data-application],[data-note]",
        ) || svg;
      openContext(event, target);
    }
  });
  contextMenu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeContext(true);
      return;
    }
    if (event.key === "Tab") {
      closeContext();
      return;
    }
    const buttons = [...contextMenu.querySelectorAll("button:not(:disabled)")];
    let index = buttons.indexOf(document.activeElement);
    if (event.key === "ArrowDown") index = (index + 1) % buttons.length;
    else if (event.key === "ArrowUp")
      index = (index - 1 + buttons.length) % buttons.length;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = buttons.length - 1;
    else return;
    event.preventDefault();
    buttons[index].focus();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!contextMenu.contains(event.target)) closeContext();
  });
  document.addEventListener("scroll", () => closeContext(), true);
  window.addEventListener("resize", () => closeContext());
  function completeCommand(input) {
    const d = cliDevice();
    if (!d) return false;
    const raw = input.value,
      prefix = raw.toLowerCase();
    const commands = cliCommands(d);
    if (isPan(d) && d.type === "switch" && cliContext(d).mode === "config") {
      commands.push(
        ...d.ports.flatMap((p) => [
          "set network interface ethernet " + p.name + " layer2",
          "set network interface ethernet " + p.name + " link-state auto",
          "set network interface ethernet " + p.name + " link-state down",
        ]),
        ...d.vlans.flatMap((v) =>
          d.ports.map(
            (p) =>
              "set network vlan " +
              (v.name.includes(" ") ? JSON.stringify(v.name) : v.name) +
              " interface " +
              p.name,
          ),
        ),
      );
    }
    const candidates = prefix.startsWith("ping ")
      ? [
          ...new Set(
            net.devices
              .filter((n) => n.type === "host" && n.ip && n.id !== d.id)
              .map((n) => "ping " + n.ip),
          ),
        ]
      : commands;
    const matches = candidates.filter((c) => c.startsWith(prefix));
    if (!matches.length) return false;
    let completion = matches[0];
    for (const candidate of matches)
      while (!candidate.startsWith(completion))
        completion = completion.slice(0, -1);
    if (matches.length === 1) completion += " ";
    if (completion.length > raw.length) {
      input.value = completion;
      $("command").value = completion;
      input.setSelectionRange(completion.length, completion.length);
    } else {
      output(matches.join("    "));
    }
    return true;
  }
  // Terminal and Activity share the left-menu overlay.
  const transport = document.createElement("div");
  transport.className = "canvas-status-bar";
  transport.setAttribute("aria-label", "Canvas status");
  document.querySelector(".view-controls").append($("sim-status"));
  $("canvas-stage").after(transport);
  const trafficFilter = document.createElement("button");
  trafficFilter.id = "canvas-traffic-filter";
  trafficFilter.type = "button";
  trafficFilter.className = "canvas-filter-button";
  trafficFilter.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4.5h18l-7 8v6l-4 2v-8Z"/></svg><span class="filter-state-dot" aria-hidden="true"></span>';
  const filterLabel = document.createElement("span");
  filterLabel.id = "traffic-filter-label";
  filterLabel.hidden = true;
  trafficFilter.append(filterLabel);
  trafficFilter.setAttribute("aria-labelledby", filterLabel.id);
  const filterGroup = document.createElement("div");
  filterGroup.className = "canvas-filter-group";
  filterGroup.append(trafficFilter);
  transport.append(filterGroup);
  let filterFlashTimer = null, filterIncluded = false, filterExcluded = false;
  function resetFilterFlash() {
    clearTimeout(filterFlashTimer);
    filterFlashTimer = null;
    filterIncluded = filterExcluded = false;
    delete trafficFilter.dataset.traffic;
    updateFilterExplanation();
  }
  function flashFilterTraffic(report) {
    if ((!NetworkExplorerCapture.getFilter() && NetworkExplorerCapture.monitorSummary()==='All devices') || !report.frame) return;
    const included = NetworkExplorerCapture.matchesEvent(report, net);
    filterIncluded ||= included;
    filterExcluded ||= !included;
    trafficFilter.dataset.traffic = filterIncluded && filterExcluded ? "mixed" : included ? "included" : "excluded";
    updateFilterExplanation();
    if (!filterFlashTimer) filterFlashTimer = setTimeout(resetFilterFlash, 700);
  }
  const filterButtons = [trafficFilter];
  const filterPopup = document.createElement("div");
  filterPopup.id = "traffic-filter-popup";
  filterPopup.setAttribute("popover", "auto");
  filterPopup.setAttribute("role", "dialog");
  filterPopup.setAttribute("aria-label", "Traffic filter");
  filterPopup.innerHTML = '<div class="filter-popup-heading"><strong>Traffic filter</strong><button type="button" class="filter-edit">Edit</button></div><div class="filter-popup-row"><code></code><button type="button" aria-labelledby="clear-traffic-filter-label"><span id="clear-traffic-filter-label" hidden>Clear traffic filter</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><p class="filter-popup-empty">No filter applied.</p><p class="filter-popup-help">Only matching traffic appears in Activity, on the canvas, and in Watch. All traffic still runs.</p><p class="filter-traffic-state"></p>';
  document.body.append(filterPopup);
  filterPopup.querySelector('.filter-edit').hidden = true;
  const popupFilterForm = document.createElement('form');
  popupFilterForm.className = 'traffic-filter-form';
  popupFilterForm.innerHTML = '<input id="traffic-filter-input" aria-label="Activity filter" aria-describedby="traffic-filter-error" placeholder="Filter: arp, tcp, ip.addr == …" autocomplete="off" spellcheck="false"><button type="button" id="traffic-filter-reset" aria-label="Clear activity filter"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button><span id="traffic-filter-error" role="status" hidden></span>';
  filterPopup.querySelector('.filter-popup-heading').after(popupFilterForm);
  let popupFilterTimer;
  function applyPopupFilter() {
    clearTimeout(popupFilterTimer);
    const value = $('traffic-filter-input').value;
    try {
      NetworkExplorerFilter.compile(value);
      $('traffic-filter-input').setAttribute('aria-invalid','false');
      $('traffic-filter-error').hidden = true;
      NetworkExplorerCapture.setFilter(value);
    } catch(error) {
      $('traffic-filter-input').setAttribute('aria-invalid','true');
      $('traffic-filter-error').textContent = error.message;
      $('traffic-filter-error').hidden = false;
    }
    positionFilterPopup();
  }
  popupFilterForm.onsubmit = event => { event.preventDefault(); applyPopupFilter(); };
  $('traffic-filter-input').oninput = () => { clearTimeout(popupFilterTimer); popupFilterTimer = setTimeout(applyPopupFilter,200); };
  $('traffic-filter-reset').onclick = () => { $('traffic-filter-input').value=''; applyPopupFilter(); $('traffic-filter-input').focus(); };
  const filterMonitor = document.createElement('section');
  filterMonitor.className = 'filter-monitor-section';
  filterMonitor.innerHTML = '<strong>Monitor devices in Activity</strong><div id="traffic-monitor-devices" role="group" aria-label="Devices to monitor in Activity"></div>';
  filterPopup.append(filterMonitor);
  NetworkExplorerCapture.mountMonitor(filterMonitor.lastElementChild, 'traffic-monitor', d => '<svg viewBox="-44 -36 88 72" aria-hidden="true">'+icon(d)+'</svg>');
  let filterAnchor = null;
  function updateFilterExplanation() {
    const active = !!NetworkExplorerCapture.getFilter() || NetworkExplorerCapture.monitorSummary()!=='All devices';
    const state = trafficFilter.dataset.traffic;
    filterPopup.querySelector(".filter-popup-help").textContent = 'Activity only · All traffic still animates';
    const explanation = filterPopup.querySelector(".filter-traffic-state");
    explanation.hidden = !active;
    explanation.textContent = ({ included: "Green: traffic is included.", excluded: "Red: traffic is hidden by the filter.", mixed: "Yellow: some traffic is included and some is hidden." })[state] || "Green: included. Red: hidden. Yellow: mixed.";
    positionFilterPopup();
  }
  function updateTrafficFilter() {
    const filter = NetworkExplorerCapture.getFilter();
    for (const button of filterButtons) {
      button.classList.toggle("active", !!filter || NetworkExplorerCapture.monitorSummary()!=='All devices');

      filterLabel.textContent = "Traffic filter: " + (filter ? "active" : "off") + ', monitor: ' + NetworkExplorerCapture.monitorSummary();
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-controls", filterPopup.id);
      button.setAttribute("aria-expanded", String(filterPopup.matches(":popover-open") && filterAnchor === button));
    }
    filterPopup.querySelector("code").textContent = filter;
    filterPopup.querySelector(".filter-popup-row").hidden = true;
    filterPopup.querySelector(".filter-popup-empty").hidden = true;
    updateFilterExplanation();
  }
  function positionFilterPopup() {
    if (!filterAnchor || !filterPopup.matches(":popover-open")) return;
    const rect = filterAnchor.getBoundingClientRect();
    filterPopup.style.left = Math.max(8, Math.min(rect.left, innerWidth - filterPopup.offsetWidth - 8)) + "px";
    filterPopup.style.top = Math.max(8, rect.top - filterPopup.offsetHeight - 8) + "px";
  }
  let filterHoverTimer;
  function openFilterPopup() {
    clearTimeout(filterHoverTimer);
    filterAnchor = trafficFilter;
    updateTrafficFilter();
    filterPopup.showPopover();
    positionFilterPopup();
    updateTrafficFilter();
  }
  function deferFilterClose() {
    clearTimeout(filterHoverTimer);
    filterHoverTimer = setTimeout(() => {
      if (!filterPopup.contains(document.activeElement)) filterPopup.hidePopover();
    }, 250);
  }
  function editTrafficFilter() {
    clearTimeout(filterHoverTimer);
    filterPopup.hidePopover();
    $("dock-tab-events")?.click();
    $("capture-filter").focus();
  }
  trafficFilter.addEventListener("pointerenter", openFilterPopup);
  trafficFilter.addEventListener("pointerleave", deferFilterClose);
  filterPopup.addEventListener("pointerenter", () => clearTimeout(filterHoverTimer));
  filterPopup.addEventListener("pointerleave", deferFilterClose);
  filterPopup.addEventListener("focusout", deferFilterClose);
  trafficFilter.addEventListener("keydown", event => {
    if (event.key === "ArrowDown") {
      event.preventDefault(); openFilterPopup();
      $('traffic-filter-input').focus();
    } else if (event.key === "Escape") filterPopup.hidePopover();
  });
  trafficFilter.onclick = openFilterPopup;
  filterPopup.addEventListener("toggle", updateTrafficFilter);
  filterPopup.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); filterPopup.hidePopover(); filterAnchor?.focus(); }
  });
  filterPopup.querySelector('.filter-popup-row button').onclick = () => {
    NetworkExplorerCapture.setFilter("");
    filterPopup.querySelector('.filter-edit').focus();
    positionFilterPopup();
  };
  filterPopup.querySelector('.filter-edit').onclick = editTrafficFilter;
  window.addEventListener("resize", positionFilterPopup);
  document.addEventListener('capture-monitor-changed', () => { resetFilterFlash(); updateTrafficFilter(); });
  document.addEventListener("capture-filter-changed", () => {
    clearTimeout(popupFilterTimer);
    // Preserve spaces and caret position while the user builds a compound filter.
    if ($('traffic-filter-input').value.trim() !== NetworkExplorerCapture.getFilter())
      $('traffic-filter-input').value = NetworkExplorerCapture.getFilter();
    $('traffic-filter-input').setAttribute('aria-invalid','false');
    $('traffic-filter-error').hidden = true;
    resetFilterFlash();
    updateTrafficFilter();
  });
  updateTrafficFilter();
  const statusViewControls = document.createElement("div");
  statusViewControls.className = "canvas-status-view";
  statusViewControls.setAttribute("aria-label", "Canvas view controls");
  statusViewControls.append(
    document.querySelector('label[for="zoom-slider"]'),
    $("zoom-slider"),
    $("zoom-level"),
    $("zoom-reset"),
    $("arrange-network"),
  );
  transport.append(statusViewControls);

  const canvasPickers = NetworkExplorerPickers.create({
    container: transport,
    before: statusViewControls,
    getNetwork: () => net,
    applications,
    appLabel,
    noteSymbol,
    icon,
    appGlyph,
    noteTargetIcon,
    noteName,
    esc,
    selectNote: (id) => {
      finishPlacement();
      selected = id;
      openInspector();
      render();
    },
    select,
    selectApplication,
  });
  function refreshDevicePickers() {
    canvasPickers.refresh();
  }

  const toolOverlay = document.createElement("div");
  toolOverlay.id = "tool-overlay";
  toolOverlay.hidden = true;
  toolOverlay.setAttribute("role", "region");
  document.querySelector(".center").append(toolOverlay);
  toolOverlay.className = "canvas-tool-dock";
  toolOverlay.append(terminalPanel, terminalNotice);
  const eventsPanel = $("events-panel");
  toolOverlay.append(eventsPanel);
  eventsPanel.hidden = true;
  const troubleshootingPanel = document.createElement("section");
  troubleshootingPanel.id = "troubleshooting-panel";
  troubleshootingPanel.hidden = true;
  const toolIcons = {
    troubleshooting: '<path d="m14 6 4-4a6 6 0 0 0-7 7L3 17a3 3 0 0 0 4 4l8-8a6 6 0 0 0 7-7l-4 4Z"/>',
    events:
      '<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/><circle cx="4" cy="7" r="1"/><circle cx="20" cy="17" r="1"/>',
    terminal:
      '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m6 8 4 4-4 4m7 0h5"/>',
  };
  let activeTool = "terminal",
    toolPinned = false,
    toolCloseTimer;
  const dockKeys = ["terminal", "events", "troubleshooting"];
  const dockPanels = {terminal: terminalPanel, events: eventsPanel, troubleshooting: troubleshootingPanel};
  const dockLayout = new NetworkExplorerDock.Layout(dockKeys);
  let dockManager = null, dockMinimized = true;
  function dockEvents() {
    eventsPanel.hidden = true;
  }
  function refreshDock() {
    toolOverlay.hidden = false;
    toolOverlay.classList.toggle("minimized", dockMinimized);
    const open = !dockMinimized;
    dockManager?.render();
    const visible = dockLayout.groups.map(g => externalPanels.has(g.active) ? g.tabs.find(k => !externalPanels.has(k)) : g.active).filter(Boolean);
    refreshTroubleshooting();
    terminalNotice.hidden = true;
    for (const panel of Object.values(dockPanels)) panel.querySelector(".close-tool")?.toggleAttribute("hidden", true);
    const splitButton = $("dock-split");
    if (splitButton) {
      const label = dockLayout.groups.length > 1 ? "Combine tab groups" : "Show all tools side by side";
      splitButton.setAttribute("aria-label", label);
      splitButton.title = label;
      splitButton.setAttribute("aria-pressed", String(dockLayout.groups.length > 1));
    }
    document
      .querySelectorAll("[data-tool]")
      .forEach((b) =>
        b.setAttribute(
          "aria-expanded",
          String(open && visible.includes(b.dataset.tool)),
        ),
      );
  }
  function closeTool() {
    dockMinimized = true;
    toolPinned = false;
    refreshDock();
    $("dock-tab-" + activeTool)?.focus();
  }
  function openTool(key, pinned = false) {
    clearTimeout(toolCloseTimer);
    if (externalPanels.has(key)) {
      if (pinned) externalPanels.get(key).window.focus();
      return;
    }
    dockLayout.activate(key);
    activeTool = key;
    dockMinimized = false;
    toolPinned = true;
    toolOverlay.hidden = false;
    toolOverlay.setAttribute("aria-label", "Network tools dock");
    refreshDock();
  }
  function scheduleToolClose() {}
  toolOverlay.onpointerenter = () => clearTimeout(toolCloseTimer);
  toolOverlay.onpointerleave = scheduleToolClose;
  toolOverlay.onfocusin = () => {
    toolPinned = true;
    clearTimeout(toolCloseTimer);
  };
  toolOverlay.onpointerdown = () => {
    toolPinned = true;
    clearTimeout(toolCloseTimer);
  };
  toolOverlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const key = activeTool;
      closeTool();
      [...document.querySelectorAll('[data-tool="' + key + '"]')]
        .find((b) => b.getClientRects().length)
        ?.focus();
    }
  });
  for (const [key, panel] of [["terminal", terminalPanel]]) {
    const heading = panel.querySelector("h2");
    const svgIcon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    svgIcon.setAttribute("viewBox", "0 0 24 24");
    svgIcon.setAttribute("aria-hidden", "true");
    svgIcon.classList.add("tool-title-icon");
    svgIcon.innerHTML = toolIcons[key];
    heading.prepend(svgIcon);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "close-tool";
    close.textContent = "Close";
    close.onclick = closeTool;
    heading.append(close);
  }
  const eventsClose = document.createElement("button");
  eventsClose.type = "button";
  eventsClose.className = "close-tool";
  eventsClose.textContent = "Close";
  eventsClose.hidden = true;
  eventsClose.onclick = closeTool;
  eventsPanel.querySelector("h2").append(eventsClose);
  const eventsPop = document.createElement("button");
  eventsPop.id = "float-events";
  eventsPop.type = "button";
  eventsPop.className = "heading-popout";
  eventsPop.textContent = "Expand";
  eventsPanel.querySelector("h2").insertBefore(eventsPop, eventsClose);
  for (const [button, label, path] of [
    [eventsPop, "Expand", "M14 3h7v7M21 3l-7 7M10 21H3v-7M3 21l7-7"],
    [eventsClose, "Close activity", "M6 6l12 12M18 6 6 18"],
  ]) {
    button.classList.add("events-icon-button");
    button.setAttribute("aria-label", label);
    button.title = label;
    button.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' +
      path +
      '"/></svg>';
  }
  eventsPop.onclick = () => {
    if (
      openExternal(
        "events",
        "Activity - Network Explorer",
        () => {
          const clone = eventsPanel.cloneNode(true);
          clone.hidden = false;
          clone.querySelector("#float-events")?.remove();
          clone.querySelector(".close-tool").remove();
          clone
            .querySelector("#capture-filter")
            .setAttribute("value", $("capture-filter").value);
          return clone.outerHTML;
        },
        () => {
          eventsPanel.hidden = false;
          openTool("events", true);
        },
      )
    ) {
      eventsPanel.hidden = true;
      refreshDock();
    }
  };
  document.addEventListener("capture-updated", () => syncExternal());
  for (const [button, label, path] of [
    [$("float-terminal"), "Expand", "M14 3h7v7M21 3l-7 7M10 21H3v-7M3 21l7-7"],
    [
      terminalPanel.querySelector(".close-tool"),
      "Close console",
      "M6 6l12 12M18 6 6 18",
    ],
  ]) {
    button.classList.add("terminal-icon-button");
    button.setAttribute("aria-label", label);
    button.title = label;
    button.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' +
      path +
      '"/></svg>';
  }
  const troubleshootingPop = document.createElement("button");
  troubleshootingPop.id = "float-troubleshooting";
  troubleshootingPop.type = "button";
  troubleshootingPop.className = "heading-popout dock-icon";
  troubleshootingPop.setAttribute("aria-label", "Expand Troubleshooting");
  troubleshootingPop.title = "Expand Troubleshooting";
  troubleshootingPop.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7M21 3l-7 7M10 21H3v-7M3 21l7-7"/></svg>';
  troubleshootingPanel.append(troubleshootingPop);
  troubleshootingPop.onclick = () => {
    openExternal("troubleshooting", "Troubleshooting - Network Explorer", () => {
      refreshTroubleshooting();
      const clone = troubleshootingPanel.cloneNode(true);
      clone.hidden = false;
      clone.querySelector("input")?.setAttribute("value", troubleshootingPanel.querySelector("input").value);
      return clone.outerHTML;
    }, () => openTool("troubleshooting", true));
    refreshDock();
  };
  const originalTerminalPop = $("float-terminal").onclick;
  $("float-terminal").onclick = () => {
    originalTerminalPop();
    refreshDock();
  };
  const dockHeader = document.createElement("div");
  dockHeader.className = "dock-header";
  dockHeader.innerHTML =
    '<div role="tablist" aria-label="Canvas tools"><button id="dock-tab-terminal" role="tab" aria-controls="terminal-panel">Terminal</button><button id="dock-tab-events" role="tab" aria-controls="events-panel">Activity</button><button id="dock-tab-troubleshooting" role="tab" aria-controls="troubleshooting-panel">Troubleshooting</button></div><button id="dock-split" class="dock-icon" aria-label="Show two tools side by side" title="Show two tools side by side" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/></svg></button><button id="dock-close" class="dock-icon" aria-label="Minimize bottom dock" title="Minimize bottom dock"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17h14"/></svg></button>';
  for (const key of ["terminal", "events", "troubleshooting"]) {
    const tab = dockHeader.querySelector("#dock-tab-" + key);
    tab.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      toolIcons[key] +
      "</svg><span>" +
      tab.textContent +
      "</span>";
  }
  for (const key of dockKeys) {
    const tab = dockHeader.querySelector("#dock-tab-" + key),
      group = document.createElement("div");
    group.className = "dock-tab-group";
    group.dataset.pane = key;
    tab.before(group);
    const expand = key === "troubleshooting" ? troubleshootingPop : $("float-" + key);
    expand?.classList.add("dock-icon");
    const shell = document.createElement("div");
    shell.className = "dock-tab-shell";
    shell.append(tab);
    if (expand) shell.append(expand);
    group.append(shell);
  }
  const dockBody = document.createElement("div");
  dockBody.className = "dock-body";
  dockBody.append(terminalPanel, eventsPanel, troubleshootingPanel);
  const resize = document.createElement("div");
  resize.className = "dock-resize";
  resize.tabIndex = 0;
  resize.setAttribute("role", "separator");
  resize.setAttribute("aria-orientation", "horizontal");
  resize.setAttribute("aria-label", "Resize bottom dock");
  resize.title = "Drag to resize; use Up and Down arrow keys";
  toolOverlay.replaceChildren(resize, dockHeader, dockBody);
  function resizeDock(height) {
    const max = Math.max(
      160,
      document.querySelector(".center").clientHeight - 240,
    );
    const h = Math.max(160, Math.min(max, height));
    toolOverlay.style.setProperty("--dock-height", h + "px");
    resize.setAttribute("aria-valuenow", Math.round(h));
    resize.setAttribute("aria-valuemin", "160");
    resize.setAttribute("aria-valuemax", Math.round(max));
  }
  let dockDrag = null;
  resize.onpointerdown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dockDrag = { y: e.clientY, height: toolOverlay.offsetHeight };
    resize.setPointerCapture(e.pointerId);
  };
  resize.onpointermove = (e) => {
    if (dockDrag) resizeDock(dockDrag.height + dockDrag.y - e.clientY);
  };
  resize.onpointerup = resize.onpointercancel = () => {
    dockDrag = null;
  };
  resize.onkeydown = (e) => {
    if (["ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      resizeDock(toolOverlay.offsetHeight + (e.key === "ArrowUp" ? 20 : -20));
    }
  };
  const dockTabs = Object.fromEntries(dockKeys.map(key => [key, $("dock-tab-" + key)]));
  for (const key of dockKeys) dockTabs[key].onclick = () => {
    openTool(key, true);
    if (key === "terminal" && cliDevice()) $("command").focus({preventScroll:true});
  };
  const dockControls = document.createElement("div");
  dockControls.className = "dock-controls";
  dockControls.append($("dock-split"), $("dock-close"));
  dockManager = NetworkExplorerDock.mount({
    overlay: toolOverlay, body: dockBody, tabs: dockTabs, panels: dockPanels, layout: dockLayout, controls: dockControls,
    isExternal: key => externalPanels.has(key), isMinimized: () => dockMinimized,
    open: key => openTool(key, true), refresh: refreshDock
  });
  dockManager.render();
  dockHeader.remove();
  $("dock-split").onclick = () => {
    if (dockLayout.groups.length > 1) dockLayout.combine(activeTool);
    else dockLayout.separate();
    dockMinimized = false;
    refreshDock();
  };
  $("dock-close").onclick = closeTool;

  function replaceTroubleshootingNetwork(data, label) {
    if (net.devices.length && !confirm(label + "? This replaces the current network and clears learned state.")) return false;
    const before = historySnapshot();
    discard(); candidateBase = null;
    net = new NetworkExplorer.Network(data);
    NetworkExplorerExamples.arrange(net);
    selected = null; examined = false; cancelConnect(); render();
    fitOpenedNetwork(); recordHistory(before, label);
    return true;
  }
  refreshTroubleshooting = NetworkExplorerTroubleshooting.mount(troubleshootingPanel, {
    Network: NetworkExplorer.Network, network: () => net, identity: () => networkIdentity(), editable,
    change: fn => mutate(fn),
    load: data => replaceTroubleshootingNetwork(data, "Generate troubleshooting practice network"),
    restore: data => replaceTroubleshootingNetwork(data, "Restore the challenge starting network (discard challenge edits)"),
    select: id => { cancelConnect(); select(id); },
    command: (id, command) => { cancelConnect(); select(id); openTool("terminal", true); $("command").value = command; $("command").focus(); }
  });

  terminalPanel.hidden = true;
  refreshDock();
  $("float-examine").onclick = () => {
    if (
      openExternal(
        "examine",
        "Watch & Examine - Network Explorer",
        () => {
          if (!staged || !simulationExamining)
            return '<section class="external-examine"><p>Waiting for the next watched event.</p></section>';
          const clone = $("examine").cloneNode(true);
          clone.querySelector("#float-examine").remove();
          clone
            .querySelector("#examine-watch")
            .toggleAttribute("checked", $("examine-watch").checked);
          return (
            '<section class="external-examine">' +
            clone.innerHTML +
            "</section>"
          );
        },
        () => {
          if (staged && simulationExamining) {
            $("examine").showModal();
            $("continue").focus();
          }
        },
      )
    )
      $("examine").close();
  };
  $("open-help").onclick = () => {
    $("help-window").showModal();
    $("close-help").focus();
  };
  $("close-help").onclick = () => {
    $("help-window").close();
    $("open-help").focus();
  };

  function installCliIpPicker(doc) {
    if (doc.getElementById("cli-ip-picker")) return;
    const addressFields = new Set(["generator-target", "fw-source", "fw-destination", "spoofer-victim", "spoofer-peer", "arp-binding-ip"]);
    const supportsPicker = target => target.id === "command" || addressFields.has(target.id);
    const win = doc.defaultView,
      list = doc.createElement("div");
    list.id = "cli-ip-picker";
    list.className = "cli-ip-picker";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Device IP addresses and DNS hostnames");
    list.hidden = true;
    doc.body.append(list);
    let input = null,
      rows = [],
      active = 0,
      start = 0,
      end = 0;
    const close = () => {
      list.hidden = true;
      input?.removeAttribute("aria-activedescendant");
    };
    const mark = () => {
      [...list.querySelectorAll("[role=option]")].forEach((el, i) =>
        el.setAttribute("aria-selected", String(i === active)),
      );
      const option = list.querySelectorAll("[role=option]")[active];
      if (option) {
        input.setAttribute("aria-activedescendant", option.id);
        option.scrollIntoView({ block: "nearest" });
      }
    };
    const choose = (index) => {
      const row = rows[index];
      if (!row || !input) return;
      if (input.id === "command" && !cliDevice()) {
        input.value = "";
        $("command").value = "";
        close();
        select(row.device.id);
        const next = doc.getElementById("command") || $("command");
        next.focus();
        return;
      }
      input.setRangeText(addressFields.has(input.id) ? row.ip : row.hostname || row.ip, start, end, "end");
      if(addressFields.has(input.id)){close();input.focus();input.dispatchEvent(new win.Event("change",{bubbles:true}));return;}
      $("command").value = input.value;
      commandDraft = input.value;
      close();
      input.focus();
    };
    const update = (target) => {
      input = target;
      const before = input.value.slice(0, input.selectionStart),
        match = before.match(/(?:^|\s)@([^@\n]*)$/);
      if (
        !match ||
        input.selectionStart !== input.selectionEnd ||
        input.disabled
      ) {
        close();
        return;
      }
      start = before.lastIndexOf("@");
      end = input.selectionStart;
      const query = match[1].trim().toLowerCase(),
        selectingDevice = input.id === "command" && !cliDevice();
      list.setAttribute(
        "aria-label",
        selectingDevice ? "Select a device" : "Device IP addresses and DNS hostnames",
      );
      rows = selectingDevice
        ? net.devices
            .map((device) => ({
              device,
              port: device.type,
              ip: device.ip || "",
            }))
            .filter((r) =>
              (r.device.name + " " + r.device.type + " " + r.ip)
                .toLowerCase()
                .includes(query),
            )
        : net.devices
            .flatMap((d) => {
              const addresses =
                d.type === "host"
                  ? d.ip
                    ? [{ ip: d.ip, port: "eth0" }]
                    : []
                  : d.ports
                      .filter((p) => p.ip)
                      .map((p) => ({ ip: p.ip, port: p.name }));
              return addresses.map((a) => ({ ...a, device: d }));
            })
            .filter((r) =>
              (r.device.name + " " + r.device.type + " " + r.port + " " + r.ip)
                .toLowerCase()
                .includes(query),
            );
      if (!selectingDevice) {
        const names = new Set();
        for (const device of net.devices) {
          if (!device.dnsServer?.enabled) continue;
          for (const record of device.dnsServer.records || []) {
            const hostname = record.name.toLowerCase();
            if (names.has(hostname)) continue;
            if (!(hostname + " " + record.address + " " + device.name).toLowerCase().includes(query)) continue;
            names.add(hostname);
            rows.push({ device, hostname, ip: record.address, port: "DNS on " + device.name });
          }
        }
      }
      active = 0;
      list.replaceChildren();
      const heading = doc.createElement("div");
      heading.className = "mention-list-title";
      heading.textContent = selectingDevice
        ? "Select a device for the CLI"
        : addressFields.has(input.id) ? "Insert IP address" : "Insert IP or DNS hostname";
      list.append(heading);
      rows.forEach((row, i) => {
        const b = doc.createElement("button");
        b.type = "button";
        b.tabIndex = -1;
        b.id = "cli-ip-option-" + i;
        b.setAttribute("role", "option");
        b.innerHTML =
          noteTargetIcon(row.device.id) +
          "<span><strong>" +
          esc(row.hostname || row.device.name) +
          "</strong><small>" +
          esc(row.port) +
          "</small></span><code>" +
          esc(row.ip) +
          "</code>";
        b.onpointerdown = (e) => e.preventDefault();
        b.onclick = () => choose(i);
        list.append(b);
      });
      if (!rows.length) {
        const empty = doc.createElement("div");
        empty.className = "mention-list-empty";
        empty.textContent = selectingDevice
          ? "No matching devices"
          : "No matching IP addresses or DNS hostnames";
        list.append(empty);
      }
      input.setAttribute("aria-controls", list.id);
      input.setAttribute("aria-autocomplete", "list");
      list.hidden = false;
      const r = input.getBoundingClientRect();
      list.style.width = Math.min(390, win.innerWidth - 16) + "px";
      list.style.left =
        Math.max(8, Math.min(r.left, win.innerWidth - list.offsetWidth - 8)) +
        "px";
      list.style.maxHeight = Math.max(80, Math.min(280, r.top - 12)) + "px";
      list.style.top = Math.max(8, r.top - list.offsetHeight - 6) + "px";
      mark();
    };
    doc.addEventListener("input", (e) => {
      if (supportsPicker(e.target)) update(e.target);
    });
    doc.addEventListener("click", (e) => {
      if (supportsPicker(e.target)) update(e.target);
    });
    doc.addEventListener(
      "keydown",
      (e) => {
        if (!supportsPicker(e.target) || list.hidden) return;
        if (["ArrowDown", "ArrowUp"].includes(e.key) && rows.length) {
          e.preventDefault();
          e.stopImmediatePropagation();
          active =
            (active + (e.key === "ArrowDown" ? 1 : -1) + rows.length) %
            rows.length;
          mark();
        } else if (
          ["Enter", "Tab"].includes(e.key) &&
          rows.length &&
          !e.shiftKey
        ) {
          e.preventDefault();
          e.stopImmediatePropagation();
          choose(active);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopImmediatePropagation();
          close();
        }
      },
      true,
    );
    doc.addEventListener("pointerdown", (e) => {
      if (e.target !== input && !list.contains(e.target)) close();
    });
    doc.addEventListener("focusout", (e) => {
      if (e.target === input && !list.contains(e.relatedTarget)) close();
    });
    win.addEventListener("resize", close);
    doc.addEventListener(
      "scroll",
      (e) => {
        if (!list.contains(e.target)) close();
      },
      true,
    );
  }
  installCliIpPicker(document);

  function recallCommand(key) {
    if (!commandHistory.length) return;
    if (historyIndex === commandHistory.length)
      commandDraft = $("command").value;
    historyIndex = Math.max(
      0,
      Math.min(
        commandHistory.length,
        historyIndex + (key === "ArrowUp" ? -1 : 1),
      ),
    );
    $("command").value =
      historyIndex === commandHistory.length
        ? commandDraft
        : commandHistory[historyIndex];
  }
  $("command").addEventListener("keydown", (e) => {
    if (e.key === "Tab" && !e.shiftKey) {
      if (completeCommand(e.target)) e.preventDefault();
      return;
    }
    if (["ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      recallCommand(e.key);
    }
  });
  $("terminal").onclick = () => $("command").focus();
  function refreshPlatform() {
    const vlanHeading = document.querySelector(
      ".capture-table th:nth-child(4)",
    );
    if (vlanHeading) vlanHeading.textContent = "VLAN";
  }
  function bindDevicePlatform(d) {
    if (d.type === "host") return;
    const label = document.createElement("label");
    label.innerHTML =
      'Operating system<select id="device-platform"><option value="cisco">Cisco IOS</option><option value="paloalto">Palo Alto PAN-OS</option></select>';
    $("device-name").parentElement.after(label);
    $("device-platform").value = devicePlatform(d);
    $("device-platform").onchange = (e) => {
      const value = e.target.value;
      if (candidateBase?.devices.some((x) => x.id === d.id) || !editable()) {
        say(
          "Commit or revert this device configuration before changing its OS.",
        );
        inspector();
        return;
      }
      if (
        value === "paloalto" &&
        d.type === "switch" &&
        new Set(d.vlans.map((v) => v.name)).size !== d.vlans.length
      ) {
        say("Give each VLAN a unique name before switching to PAN-OS.");
        inspector();
        return;
      }
      d.platform = value;
      cliContexts.delete(d.id);
      render();
    };
    if (isPan(d)) {
      const actions = document.createElement("div");
      actions.className = "platform-bar";
      const pending = candidateBase?.devices.some((x) => x.id === d.id);
      actions.innerHTML =
        '<span role="status">' +
        (pending ? "Candidate changes pending" : "Committed") +
        '</span><button id="commit-config" type="button" ' +
        (!pending ? "disabled" : "") +
        '>Commit</button><button id="revert-config" type="button" ' +
        (!pending ? "disabled" : "") +
        ">Revert</button>";
      label.after(actions);
      $("commit-config").onclick = () => {
        if (commitConfiguration()) say("Device configuration committed.");
      };
      $("revert-config").onclick = () => revertConfiguration();
    }
    styleInspectorSelect("device-platform", "Operating system");
  }
  const networkActions = document.createElement("div");
  networkActions.className = "canvas-network-actions";
  networkActions.setAttribute("role", "group");
  networkActions.setAttribute("aria-label", "Network actions");
  const loadInput = $("load");
  loadInput.hidden = true;
  NetworkExplorerActions.register("load-network", () => loadInput.click());
  networkActions.append(loadInput, $("save"), $("clear-state"));
  const canvasGenerate = document.createElement("div");
  canvasGenerate.id = "canvas-generate";
  canvasGenerate.className = "trouble-actions trouble-dropdown";
  const generateButton = $("trouble-load").cloneNode(true);
  generateButton.id = "canvas-generate-button";
  generateButton.setAttribute("aria-label", "Generate network");
  generateButton.title = "Generate network";
  generateButton.removeAttribute("data-tooltip");
  generateButton.removeAttribute("data-lab");
  generateButton.setAttribute("aria-controls", "canvas-generate-menu");
  generateButton.setAttribute("aria-expanded", "false");
  const generateMenu = $("trouble-menu-load").cloneNode(true);
  generateMenu.id = "canvas-generate-menu";
  generateMenu.setAttribute("aria-label", "Generate working network");
  generateMenu.querySelector(".trouble-generate-mode").remove();
  generateMenu.hidden = true;
  function closeGenerateMenu() {
    generateMenu.hidden = true;
    generateButton.setAttribute("aria-expanded", "false");
  }
  for (const option of generateMenu.querySelectorAll("[data-level]")) {
    option.id = "canvas-generate-" + option.dataset.level;
    option.removeAttribute("data-lab");
    option.onclick = () => {
      closeGenerateMenu();
      if (!editable()) return;
      safely(() => replaceTroubleshootingNetwork(
        NetworkExplorerTroubleshooting.generate(NetworkExplorer.Network, option.dataset.level).save(),
        "Generate network",
      ));
      generateButton.focus();
    };
  }
  generateButton.onclick = () => {
    const open = generateMenu.hidden;
    generateMenu.hidden = !open;
    generateButton.setAttribute("aria-expanded", String(open));
  };
  canvasGenerate.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeGenerateMenu(); generateButton.focus(); }
    if (e.key === "ArrowDown" && e.target === generateButton) {
      e.preventDefault(); generateMenu.hidden = false;
      generateButton.setAttribute("aria-expanded", "true");
      generateMenu.querySelector("button").focus();
    }
  });
  document.addEventListener("click", e => { if (!canvasGenerate.contains(e.target)) closeGenerateMenu(); });
  canvasGenerate.append(generateButton, generateMenu);
  networkActions.insertBefore(canvasGenerate, networkActions.querySelector("#save"));
  NetworkExplorerActions.register("surprise-network", () => {
    if (!editable()) return;
    safely(() => {
      const level = ["basic", "intermediate", "advanced"][Math.floor(Math.random() * 3)];
      replaceTroubleshootingNetwork(NetworkExplorerTroubleshooting.generate(NetworkExplorer.Network, level).save(), "Generate surprise network");
    });
  });
  NetworkExplorerActions.register("open-troubleshooting", () => {
    openTool("troubleshooting", true);
  });
  document.querySelector(".view-controls").prepend(networkActions);
  document.querySelector("body>.toolbar").remove();
  const canvasIcon = (id, label, paths) => {
    const b = $(id);
    b.classList.add("canvas-icon-button");
    b.setAttribute("aria-label", label);
    b.title = label;
    b.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths + "</svg>";
  };
  canvasIcon(
    "save",
    "Save network",
    '<path d="M5 3h12l4 4v14H3V3h2Z M7 3v6h10V3 M7 21v-8h10v8"/>',
  );
  canvasIcon(
    "clear-state",
    "Clear learned state",
    '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v5l3 2"/>',
  );
  canvasIcon(
    "zoom-reset",
    "Fit full canvas",
    '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="7" y="7" width="10" height="10" rx="1"/>',
  );
  canvasIcon(
    "arrange-network",
    "Arrange network",
    '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="2" y="16" width="6" height="5" rx="1"/><rect x="16" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M5 16v-4h14v4"/>',
  );

  // Search live device configuration, including interface addresses and installed applications.
  const networkSearch = NetworkExplorerSearch.create({
    getNetwork: () => net,
    applications,
    appLabel,
    isPan,
    noteTarget,
    noteName,
    noteSymbol,
    osIcon,
    devicePlatform,
    esc,
    selectResult: (d) => {
      finishPlacement();
      connecting = false;
      endpoint = null;
      if (d.type === "note") {
        selected = d.id;
        openInspector();
        render();
      } else select(d.id);
    },
  });
  NetworkExplorerActions.register("search-network", networkSearch.open);
  function refreshSearch() {
    networkSearch.refresh();
  }

  const speedSelect = $("speed"),
    speedGroup = document.createElement("div");
  speedGroup.className = "canvas-speed";
  const speedPicker = document.createElement("div");
  speedPicker.className = "speed-picker";
  speedPicker.innerHTML =
    '<button id="speed-toggle" type="button" aria-label="Animation speed: Normal" aria-haspopup="listbox" aria-expanded="false" aria-controls="speed-options"><span id="speed-value">Normal</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div id="speed-options" role="listbox" aria-label="Animation speed" hidden>' +
    [...speedSelect.options]
      .map(
        (o) =>
          '<button type="button" role="option" tabindex="-1" data-speed="' +
          o.value +
          '" aria-selected="' +
          o.selected +
          '"><span>' +
          o.text +
          '</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></button>',
      )
      .join("") +
    "</div>";
  const speedLabel = document.createElement("span");
  speedLabel.className = "speed-label";
  speedLabel.textContent = "Speed";
  speedPicker.prepend(speedLabel);
  speedSelect.parentElement.replaceWith(speedGroup);
  speedSelect.hidden = true;
  speedSelect.tabIndex = -1;
  speedSelect.setAttribute("aria-hidden", "true");
  speedGroup.append(speedPicker, speedSelect);
  const speedToggle = $("speed-toggle"),
    speedOptions = $("speed-options"),
    speedChoices = [...speedOptions.children];
  const closeSpeed = (focus = false) => {
    speedOptions.hidden = true;
    speedToggle.setAttribute("aria-expanded", "false");
    if (focus) speedToggle.focus();
  };
  const openSpeed = () => {
    speedOptions.hidden = false;
    speedToggle.setAttribute("aria-expanded", "true");
    speedChoices.find((o) => o.dataset.speed === speedSelect.value).focus();
  };
  speedToggle.onclick = () =>
    speedOptions.hidden ? openSpeed() : closeSpeed();
  speedToggle.onkeydown = (e) => {
    if (["ArrowDown", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      openSpeed();
    }
  };
  speedSelect.onchange = () => {
    const label = speedSelect.selectedOptions[0].text;
    $("speed-value").textContent = label;
    speedToggle.setAttribute("aria-label", "Animation speed: " + label);
    speedChoices.forEach((o) =>
      o.setAttribute(
        "aria-selected",
        String(o.dataset.speed === speedSelect.value),
      ),
    );
    if (speedSelect.value === "0") {
      document.querySelectorAll('.port-activity').forEach(port => port.classList.remove('port-activity'));
      fastForward();
    }
    updatePauseControl();
  };
  speedChoices.forEach(
    (o) =>
      (o.onclick = () => {
        speedSelect.value = o.dataset.speed;
        speedSelect.dispatchEvent(new Event("change", { bubbles: true }));
        closeSpeed(true);
      }),
  );
  speedOptions.onkeydown = (e) => {
    const i = speedChoices.indexOf(document.activeElement);
    let n;
    if (e.key === "ArrowDown") n = (i + 1) % 3;
    else if (e.key === "ArrowUp") n = (i + 2) % 3;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = 2;
    else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeSpeed(true);
      return;
    }
    if (n !== undefined) {
      e.preventDefault();
      speedChoices[n].focus();
    }
  };
  speedPicker.addEventListener("focusout", (e) => {
    if (!speedPicker.contains(e.relatedTarget)) closeSpeed();
  });
  document.addEventListener("pointerdown", (e) => {
    if (!speedPicker.contains(e.target)) closeSpeed();
  });
  const pauseAnimation = document.createElement("button");
  pauseAnimation.id = "pause-animation";
  pauseAnimation.type = "button";
  pauseAnimation.className = "animation-pause canvas-icon-button";
  const fastForwardButton = document.createElement("button");
  fastForwardButton.id = "fast-forward";
  fastForwardButton.type = "button";
  fastForwardButton.className = "canvas-icon-button";
  fastForwardButton.title = "Finish current exchange immediately";
  fastForwardButton.setAttribute(
    "aria-label",
    "Finish current exchange immediately",
  );
  fastForwardButton.innerHTML =
    '<svg class="playback-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 6 7 6-7 6m7-12 7 6-7 6M21 6v12"/></svg>';
  fastForwardButton.onclick = fastForward;
  speedGroup.append(fastForwardButton, pauseAnimation);
  pauseAnimation.onclick = () => {
    if (!phaseCallback) return;
    if (flightPaused) {
      flightPaused = false;
      $("canvas").unpauseAnimations();
      schedulePhase(phaseCallback, phaseRemaining);
      setSimulationStatus({ active: true });
    } else {
      flightPaused = true;
      phaseRemaining = Math.max(0, phaseDeadline - performance.now());
      clearTimeout(timer);
      timer = null;
      $("canvas").pauseAnimations();
      setSimulationStatus({ active: true, paused: true });
      updatePauseControl();
    }
  };
  updatePauseControl();
  const flightInspection = document.createElement("dialog");
  flightInspection.id = "flight-inspection";
  flightInspection.setAttribute("aria-labelledby", "flight-title");
  flightInspection.innerHTML =
    '<div class="dialog-header"><h2 id="flight-title">Frame in flight</h2><p id="flight-route"></p></div><div id="flight-frame"></div><footer><span>Animation stays paused while you inspect.</span><button id="close-flight" type="button">Close</button></footer>';
  document.body.append(flightInspection);
  $("close-flight").onclick = () => flightInspection.close();
  function inspectFlight(e) {
    const circle = e.target.closest(".in-flight-frame");
    if (!circle || !flightPaused || !circle.flightReport?.frame) return;
    if (e.type === "keydown" && !["Enter", " "].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    const r = circle.flightReport;
    $("flight-route").textContent =
      net.device(r.from).name + " to " + net.device(r.device).name;
    $("flight-frame").innerHTML = frameHeaderCard(
      r.frame,
      "Ethernet frame",
      null,
    );
    flightInspection.showModal();
  }
  $("traffic").addEventListener("pointerdown", (e) => {
    if (e.target.closest(".in-flight-frame")) e.stopPropagation();
  });
  $("traffic").addEventListener("click", inspectFlight);
  $("traffic").addEventListener("keydown", inspectFlight);
  const cacheTimer = setInterval(() => {
    drawCapacityMonitors();
    const expiredThreads=NetworkExplorerEcho.expireThreads(net);
    if(staged)NetworkExplorerEcho.expireThreads(staged.trial);
    if(expiredThreads&&String(selected).startsWith('echo:'))inspector();
    document.querySelectorAll('[data-thread-expires]').forEach(ring=>{
      const remaining=Math.max(0,(Number(ring.dataset.threadExpires)-Date.now())/300000);
      ring.setAttribute('stroke-dashoffset',String(100-remaining*100));
      const pill=ring.closest('[data-echo-thread]'),seconds=Math.ceil(remaining*300);
      if(pill){
        const text=pill.dataset.echoThread+': finished - removes in '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
        pill.dataset.tooltip=text;pill.setAttribute('aria-label',text);
        const tip=document.getElementById('network-tooltip');
        if(tip&&!tip.hidden&&(pill.getAttribute('aria-describedby')||'').split(' ').includes(tip.id))tip.textContent=text;
      }
    });
    const changed = net.age();
    const firewallDevice=net.device(selected)||net.device(applications().find(a=>a.id===selected&&a.type==='firewall')?.host);
    if(changed && firewallDevice?.type === "router") NetworkExplorerFirewallUI.refresh(net,firewallDevice);
    if (staged) staged.trial.age();
    if (changed) {
      const d = net.device(selected);
      if (d && $("inspector-table"))
        $("inspector-table").innerHTML = table(
          visibleTable(d.type === "switch" ? net.mac[d.id] : net.arp[d.id], d),
          d.type,
        );
      refreshFloatingTable();
      syncExternal();
    }
    refreshDhcp();
    if (changed) draw();
    refreshCountdowns();
    for (const entry of externalPanels.values())
      if (!entry.window.closed) refreshCountdowns(entry.window.document);
  }, 1000);
  window.addEventListener("pagehide", () => clearInterval(cacheTimer));
  $("command-form").onsubmit = (e) => {
    e.preventDefault();
    const raw = $("command").value.trim();
    if (!raw) return;
    if (!cliDevice()) {
      say("Type @, select a device on the canvas, or use the selector above first.");
      return;
    }
    commandHistory.push(raw);
    historyIndex = commandHistory.length;
    commandDraft = "";
    safely(() => command(raw));
    $("command").value = "";
    syncExternal();
  };
  $("add-host").innerHTML =
    '<svg viewBox="-42 -35 84 72" aria-hidden="true">' +
    icon({ type: "host" }) +
    "</svg>";
  $("add-switch").innerHTML =
    '<svg viewBox="-42 -35 84 72" aria-hidden="true">' +
    icon({ type: "switch" }) +
    "</svg>";
  for (const type of ["host", "switch", "router", "firewall"]) {
    const label = document.createElement("span");
    label.className = "palette-label";
    label.textContent = type[0].toUpperCase() + type.slice(1);
    $("add-" + type).append(label);
  }
  render();

  const noteTool = document.createElement("section");
  noteTool.className = "note-palette";
  noteTool.innerHTML =
    '<h2>Notes</h2><button id="add-note" class="wide" type="button" title="Place a note on the canvas"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.5h14a1.5 1.5 0 0 1 1.5 1.5v10L15 20.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5ZM15 20.5V15h5.5M7.5 8h9M7.5 11.5h6"/></svg><span>Note</span></button>';
  $("left-panel").append(noteTool);
  $("add-note").querySelector('svg').outerHTML=noteSymbol();
  $("add-note").onclick = () => {
    finishPlacement();
    placingNote = true;
    svg.classList.add("placing");
    say("Click empty canvas to place a note. Escape cancels.");
  };
  function paletteItem(button){
    if(button.dataset.paletteApplication)return {kind:'application',type:button.dataset.paletteApplication};
    if(['add-certificate','compact-certificate'].includes(button.id))return {kind:'certificate',type:'certificate'};
    if(button.id==='add-note')return {kind:'note',type:'note'};
    const type=button.dataset.addType||button.id.replace(/^add-/,'');
    if(['host','switch','router','firewall'].includes(type))return {kind:'device',type};
    return null;
  }
  for(const root of [$('left-panel'),compactPalette]){
    root.querySelectorAll('button').forEach(button=>{if(paletteItem(button))button.draggable=true;});
    root.addEventListener('dragstart',e=>{
      const button=e.target.closest('button'),item=button&&paletteItem(button);
      if(!item)return;
      e.stopImmediatePropagation();
      if(!editable()){e.preventDefault();return;}
      finishPlacement();clearPaletteDrag();paletteDrag=item;
      e.dataTransfer.setData('application/x-network-palette',JSON.stringify(item));e.dataTransfer.effectAllowed='copy';
      const source=button.querySelector('svg');
      if(source){
        const preview=source.cloneNode(true),originals=[source,...source.querySelectorAll('*')],copies=[preview,...preview.querySelectorAll('*')];
        copies.forEach((el,i)=>{const style=getComputedStyle(originals[i]);for(const prop of ['fill','stroke','stroke-width','stroke-linecap','stroke-linejoin'])el.style.setProperty(prop,style.getPropertyValue(prop));});
        preview.style.width='44px';preview.style.height='44px';
        paletteDragImage=document.createElement('div');paletteDragImage.setAttribute('aria-hidden','true');paletteDragImage.style.cssText='position:fixed;left:-100px;top:0;width:48px;height:48px;padding:2px;pointer-events:none;';paletteDragImage.append(preview);document.body.append(paletteDragImage);
        e.dataTransfer.setDragImage(paletteDragImage,24,24);
      }
    },true);
  }
  document.addEventListener('dragend',clearPaletteDrag);
  document.addEventListener('drop',clearPaletteDrag);
  $("canvas-stage").addEventListener(
    "pointerdown",
    (e) => {
      if (!svg.contains(e.target) || e.button !== 0) return;
      const node = e.target.closest("[data-note]");
      if (placing) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const pending = placing,
          p = point(e),
          host = e.target.closest("[data-device]")?.dataset.device;
        mutate(() => {
          if(pending.kind==='certificate'){
            const app=applications().find(a=>a.id===e.target.closest('[data-application]')?.dataset.application);
            attachCertificate(host||app?.host);
          } else if (pending.kind === "application") {
            const d = net.device(host);
            if (host && (d?.type !== "host" || d[appKey(pending.type)]))
              throw Error("Choose a host without this application installed.");
            const a = net.addApplication(p.x, p.y, pending.type);
            selected = a.id;
            if (host) {
              net.installApplication(a.id, host);
              d[appOffsetKey(pending.type)] = {
                ...appDefaultOffset(pending.type),
              };
              selected = pending.type + ":" + host;
            }
          } else selected = net.add(pending.type, p.x, p.y).id;
          finishPlacement();
          openInspector();
        });
        return;
      }
      if (placingNote) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const p = point(e);
        createNote(p.x, p.y);
        return;
      }
      if (!node) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const n = net.notes.find((n) => n.id === node.dataset.note),
        p = point(e);
      selected = n.id;
      noteDrag = { id: n.id, start: p, x: n.x, y: n.y };
      svg.setPointerCapture(e.pointerId);
      openInspector();
      render();
    },
    true,
  );
  svg.addEventListener("pointermove", (e) => {
    if (!noteDrag) return;
    const n = net.notes.find((n) => n.id === noteDrag.id),
      p = point(e),
      dx = p.x - noteDrag.start.x,
      dy = p.y - noteDrag.start.y;
    n.x = noteDrag.x + dx;
    n.y = noteDrag.y + dy;
    drawNotes();
  });
  for (const type of ["pointerup", "pointercancel"])
    svg.addEventListener(type, (e) => {
      if (noteDrag) {
        noteDrag = null;
        if (svg.hasPointerCapture(e.pointerId))
          svg.releasePointerCapture(e.pointerId);
      }
    });
  svg.addEventListener("keydown", (e) => {
    const n = e.target.closest("[data-note]");
    if (n && ["Enter", " "].includes(e.key)) {
      e.preventDefault();
      selected = n.dataset.note;
      openInspector();
      render();
    }
  });
  registerExample("example-dns", () => {
    if (
      (net.devices.length || net.applicationDrafts.length) &&
      !confirm("Replace the current network with the DNS example?")
    )
      return;
    discard();
    candidateBase = null;
    net = new NetworkExplorer.Network();
    const client = net.add("host", 180, 280),
      sw = net.add("switch", 450, 280),
      server = net.add("host", 720, 280);
    client.name = "DNS Client";
    server.name = "DNS Server";
    net.configure(client.id, "192.168.1.10", 24);
    net.configure(server.id, "192.168.1.2", 24);
    net.configureDnsAddress(client.id, server.ip);
    net.configureDnsServer(server.id, {
      enabled: true,
      records: [
        { name: "server.example", address: server.ip, ttl: 120 },
        { name: "client.example", address: client.ip, ttl: 120 },
      ],
    });
    net.connect(client.id, "p0", sw.id, "p0");
    net.connect(server.id, "p0", sw.id, "p1");
    selected = client.id;
    render();
    say(
      "Run nslookup server.example or ping server.example from the client CLI.",
    );
  });

  registerExample("example-http", () => {
    if (
      (net.devices.length || net.applicationDrafts.length) &&
      !confirm("Replace this network with the web browsing example?")
    )
      return;
    discard();
    candidateBase = null;
    net = new NetworkExplorer.Network();
    const client = net.add("host", 180, 300),
      sw = net.add("switch", 450, 300),
      server = net.add("host", 720, 300);
    client.name = "Web Client";
    server.name = "Web Server";
    net.configure(client.id, "192.168.1.10", 24);
    net.configure(server.id, "192.168.1.2", 24);
    net.configureDnsAddress(client.id, server.ip);
    net.configureDnsServer(server.id, {
      enabled: true,
      records: [{ name: "server.example", address: server.ip, ttl: 120 }],
    });
    net.configureWeb(server.id, {
      enabled: true,
      port: 80,
      title: "Welcome to CS339",
      body: "This page traveled across your simulated network using HTTP over TCP.",
    });
    net.configureWeb(
      client.id,
      { enabled: true, url: "http://server.example/" },
      "browser",
    );
    client.browserOffset = { x: 0, y: -110 };
    server.webOffset = { x: 60, y: -110 };
    server.dnsOffset = { x: -75, y: -110 };
    net.connect(client.id, "p0", sw.id, "p0");
    net.connect(server.id, "p0", sw.id, "p1");
    selected = "browser:" + client.id;
    examined = false;
    cancelConnect();
    openInspector();
    render();
    say(
      "Open the page in Browser. Watch hosts for TCP, and applications for DNS and HTTP.",
    );
  });
  registerExample("example-complex", () => {
    if (
      (net.devices.length || net.applicationDrafts.length) &&
      !confirm("Replace this network with the campus example?")
    )
      return;
    discard();
    candidateBase = null;
    const example = NetworkExplorerExamples.complex(NetworkExplorer.Network);
    net = example.network;
    selected = example.clientId;
    examined = false;
    cancelConnect();
    openInspector();
    render();
    window.NetworkExplorerViewport?.fit();
    say(
      "Acquire a DHCP lease on Browser Client, then open its Browser and visit www.campus.example.",
    );
  });
  for(const kind of ['encrypt','harden','detect','prevent']) registerExample('example-security-'+kind,()=>{
    if((net.devices.length||net.applicationDrafts.length)&&!confirm('Replace this network with the security exercise?'))return;
    discard();candidateBase=null;
    const example=NetworkExplorerExamples.securityLab(NetworkExplorer.Network,kind);
    net=example.network;selected='browser:'+example.clientId;examined=false;cancelConnect();openInspector();render();
    say('Start with the canvas walkthrough note. Observe the working network, apply the defense, and verify the result. Reload the example to reset.');
  });
  for(const kind of ['drop','intercept','protected'])registerExample('example-arp-'+kind,()=>{
    if((net.devices.length||net.applicationDrafts.length)&&!confirm('Replace this network with the ARP security example?'))return;
    discard();candidateBase=null;const e=NetworkExplorerExamples.arpSecurity(NetworkExplorer.Network,kind);net=e.network;selected='spoofer:'+e.sourceId;examined=false;cancelConnect();openInspector();render();say('Open the victim Browser to load a page before and after the attack. Read the canvas walkthrough. Reload this example to reset.');
  });
  registerExample('example-dos',()=>{
    if((net.devices.length||net.applicationDrafts.length)&&!confirm('Replace this network with the DoS example?'))return;
    discard();candidateBase=null;const e=NetworkExplorerExamples.dos(NetworkExplorer.Network);net=e.network;selected='generator:'+e.sourceId;examined=false;cancelConnect();openInspector();render();say('Read the DoS walkthrough note. Test the Browser baseline, then run a burst with Legitimate Client selected for the availability check.');
  });
  registerExample("example-https", () => {
    if ((net.devices.length || net.applicationDrafts.length) && !confirm("Replace this network with the HTTPS and certificates example?")) return;
    discard(); candidateBase=null;
    const example=NetworkExplorerExamples.https(NetworkExplorer.Network);
    net=example.network;selected='browser:'+example.clientId;examined=false;cancelConnect();openInspector();render();
    say('Load https://secure.example/ in Browser. Inspect TLS in Activity, then try the certificate challenge in the canvas note.');
  });
  registerExample("example-firewall", () => {
    if ((net.devices.length || net.applicationDrafts.length) && !confirm("Replace this network with the Firewall example?")) return;
    discard(); candidateBase=null;
    const example=NetworkExplorerExamples.firewall(NetworkExplorer.Network);
    net=example.network;subnetMode="all";selected=example.firewallId;examined=false;cancelConnect();openInspector();render();window.NetworkExplorerViewport?.fit();
    say("Open the Inside Client Browser. DNS and HTTP pass; ping to the outside server is blocked. Inspect the firewall rules and decisions.");
  });
  for(const protocol of ['TCP','UDP']) registerExample('example-echo-'+protocol.toLowerCase(),()=>{
    if((net.devices.length||net.applicationDrafts.length)&&!confirm('Replace this network with the '+protocol+' Echo example?'))return;
    discard();candidateBase=null;net=new NetworkExplorer.Network();
    const sw=net.add('switch',440,300),server=net.add('host',700,300),dns=net.add('host',440,110),a=net.add('host',170,220),b=net.add('host',170,440);
    server.name='Echo Server';dns.name='DNS';a.name='Echo Client 1';b.name='Echo Client 2';
    [server,dns,a,b].forEach((d,i)=>{net.configure(d.id,'192.168.1.'+(10+i),24);net.connect(d.id,'p0',sw.id,'p'+i);});
    net.configureDnsServer(dns.id,{enabled:true,records:[{name:'echo.example',address:server.ip,ttl:120}]});
    [server,a,b].forEach(d=>{net.configureDnsAddress(d.id,dns.ip);net.configureEcho(d.id,{...NetworkExplorerEcho.defaults(),role:d===server?'server':'client',transport:protocol,message:'Hello from '+d.name});d.echoOffset={x:0,y:-85};});
    dns.dnsOffset={x:120,y:0};selected='echo:'+server.id;examined=false;cancelConnect();openInspector();render();
    say('Run the Echo Server first. Select a client Echo application and Run or Step its Python code.');
  });
  registerExample("example-internet", () => {
    if (
      (net.devices.length || net.applicationDrafts.length) &&
      !confirm("Replace this network with the Internet and NAT example?")
    )
      return;
    discard();
    candidateBase = null;
    const example = NetworkExplorerExamples.internet(NetworkExplorer.Network);
    net = example.network;
    subnetMode = "all";
    selected = example.clientId;
    examined = false;
    cancelConnect();
    openInspector();
    render();
    window.NetworkExplorerViewport?.fit();
    say(
      "Open either Browser and visit www.internet.example. Inspect NAT Gateway for translations.",
    );
  });

  const palettePanel = document.createElement("section");
  palettePanel.className = "unified-palette";
  palettePanel.setAttribute("aria-labelledby", "palette-title");
  palettePanel.innerHTML =
    '<h2 id="palette-title"><svg class="palette-heading-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg><span>Palette</span></h2>';
  for (const section of [...$("left-panel").children])
    palettePanel.append(section);
  $("left-panel").append(palettePanel);
  compactPalette.setAttribute("aria-label", "Palette");
  const noteDivider = document.createElement("div");
  noteDivider.className = "compact-palette-divider";
  noteDivider.setAttribute("role", "separator");
  compactPalette.append(noteDivider);
  const compactNote = document.createElement("button");
  compactNote.id = "compact-add-note";
  compactNote.className = "compact-device compact-note";
  compactNote.setAttribute("aria-label", "Add note");
  compactNote.title = "Place a note on the canvas";
  compactNote.innerHTML = noteSymbol();
  compactNote.onclick = () => $("add-note").click();
  compactPalette.append(compactNote);
  const inspectorDivider = document.createElement("div"),
    workspace = $("right-panel").parentElement;
  inspectorDivider.id = "inspector-divider";
  inspectorDivider.tabIndex = 0;
  inspectorDivider.setAttribute("role", "separator");
  inspectorDivider.setAttribute("aria-orientation", "vertical");
  inspectorDivider.setAttribute("aria-label", "Resize inspector");
  inspectorDivider.title = "Drag to resize; use Left and Right arrow keys";
  workspace.append(inspectorDivider);
  const placeDivider = () => {
    const r = $("right-panel").getBoundingClientRect(),
      m = workspace.getBoundingClientRect();
    inspectorDivider.style.left = r.left - m.left - 10 + "px";
    inspectorDivider.setAttribute("aria-valuenow", Math.round(r.width));
  };
  const sizeInspector = (width) => {
    const max = Math.max(200, Math.min(520, workspace.clientWidth - 420));
    workspace.style.setProperty(
      "--inspector-width",
      Math.max(200, Math.min(max, width)) + "px",
    );
    placeDivider();
  };
  let inspectorResize = null;
  inspectorDivider.onpointerdown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    inspectorResize = {
      x: e.clientX,
      width: $("right-panel").getBoundingClientRect().width,
    };
    inspectorDivider.setPointerCapture(e.pointerId);
  };
  inspectorDivider.onpointermove = (e) => {
    if (inspectorResize)
      sizeInspector(inspectorResize.width + inspectorResize.x - e.clientX);
  };
  inspectorDivider.onpointerup = inspectorDivider.onpointercancel = () => {
    inspectorResize = null;
  };
  inspectorDivider.onkeydown = (e) => {
    if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      sizeInspector(
        $("right-panel").getBoundingClientRect().width +
          (e.key === "ArrowLeft" ? 20 : -20),
      );
    }
  };
  new ResizeObserver(placeDivider).observe(workspace);
  new ResizeObserver(placeDivider).observe($("right-panel"));
  placeDivider();

  const undoButton = document.createElement("button"),
    redoButton = document.createElement("button");
  for (const [button, id, label, path] of [
    [
      undoButton,
      "undo-network",
      "Undo",
      "M9 4 3 10l6 6M3 10h11a6 6 0 0 1 0 12",
    ],
    [
      redoButton,
      "redo-network",
      "Redo",
      "m15 4 6 6-6 6M21 10H10a6 6 0 0 0 0 12",
    ],
  ]) {
    button.id = id;
    button.type = "button";
    button.className = "canvas-icon-button";
    button.setAttribute("aria-label", label);
    button.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' +
      path +
      '"/></svg>';
  }
  undoButton.onclick = () => travelHistory(false);
  redoButton.onclick = () => travelHistory(true);
  $("clear-state").after(undoButton, redoButton);
  bindHistoryEvents(document);
  refreshHistoryButtons();

  document.addEventListener("network-recent-open", (e) => {
    try {
      const next = new NetworkExplorer.Network(e.detail.data);
      if (
        (net.devices.length || net.applicationDrafts.length) &&
        !confirm("Replace the current network with " + e.detail.name + "?")
      )
        return;
      const before = historySnapshot();
      discard();
      candidateBase = null;
      net = next;
      selected = null;
      examined = false;
      cancelConnect();
      render();
      fitOpenedNetwork();
      recordHistory(before, "Open recent network");
      e.detail.opened = true;
      say("Recent network loaded. Learned tables start empty.");
    } catch (err) {
      say(err.message);
    }
  });
  window.NetworkExplorerIcons = { device: icon, os: osIcon };
  installSubnetTooltip();
  const subnetButton = document.createElement("button"),
    subnetList = document.createElement("div");
  subnetButton.id = "subnet-highlight";
  subnetButton.type = "button";
  subnetButton.setAttribute("aria-haspopup", "listbox");
  subnetButton.setAttribute("aria-expanded", "false");
  subnetButton.setAttribute("aria-controls", "subnet-options");
  subnetButton.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18a4 4 0 0 1-1-7.9A7 7 0 0 1 18 8a5 5 0 0 1 0 10Z"/></svg>';
  document.querySelector(".canvas-speed").before(subnetButton);
  subnetList.id = "subnet-options";
  subnetList.setAttribute("role", "listbox");
  subnetList.setAttribute("aria-label", "Highlight subnet");
  subnetList.hidden = true;
  document.body.append(subnetList);
  subnetButton.onclick = () => {
    const open = subnetList.hidden;
    subnetList.hidden = !open;
    subnetButton.setAttribute("aria-expanded", String(open));
    if (open) {
      drawSubnetClouds();
      const r = subnetButton.getBoundingClientRect();
      subnetList.style.left = Math.min(r.left, innerWidth - 220) + "px";
      subnetList.style.top = r.bottom + 5 + "px";
      subnetList.querySelector("[aria-selected=true]").focus();
    }
  };
  subnetList.onkeydown = (e) => {
    const options = [...subnetList.children],
      i = options.indexOf(document.activeElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      options[
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? options.length - 1
            : (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) %
              options.length
      ].focus();
    }
    if (e.key === "Escape") {
      subnetList.hidden = true;
      subnetButton.setAttribute("aria-expanded", "false");
      subnetButton.focus();
    }
  };
  document.addEventListener("pointerdown", (e) => {
    if (!subnetList.contains(e.target) && !subnetButton.contains(e.target)) {
      subnetList.hidden = true;
      subnetButton.setAttribute("aria-expanded", "false");
    }
  });
  drawSubnetClouds();
})();
