/* Canvas inventory pickers. Call refresh after topology or selection changes. */
window.NetworkExplorerPickers = {
  create({
    container,
    before,
    getNetwork,
    applications,
    appLabel,
    noteSymbol,
    icon,
    appGlyph,
    noteTargetIcon,
    noteName,
    esc,
    selectNote,
    select,
    selectApplication,
  }) {
    const $ = (id) => document.getElementById(id);
    const devicePickers = document.createElement("div");
    devicePickers.className = "canvas-device-pickers";
    devicePickers.setAttribute("aria-label", "Find a device");
    container.insertBefore(devicePickers, before);
    function refreshDevicePickers() {
      const net = getNetwork();
      const focused = document.activeElement,
        focusedType = focused
          .closest(".canvas-device-picker")
          ?.querySelector(".device-picker-toggle")?.dataset.type,
        focusedId = focused.dataset.pickerId;
      const openType = devicePickers.querySelector('[aria-expanded="true"]')
        ?.dataset.type;
      devicePickers.replaceChildren();
      for (const type of [
        "host",
        "switch",
        "router",
        "dhcp",
        "dns",
        "web",
        "browser",
        "note",
      ]) {
        const isDevice = ["host", "switch", "router"].includes(type),
          isNote = type === "note",
          label = isNote
            ? "Notes"
            : isDevice
              ? type + " devices"
              : appLabel(type),
          items = isNote
            ? net.notes
            : isDevice
              ? net.devices.filter((d) => d.type === type)
              : applications().filter((a) => a.type === type),
          glyph = isNote
            ? noteSymbol()
            : isDevice
              ? '<svg viewBox="-42 -35 84 72" aria-hidden="true">' +
                icon({ type }) +
                "</svg>"
              : '<svg viewBox="-30 -26 60 52" aria-hidden="true">' +
                appGlyph(type) +
                "</svg>",
          group = document.createElement("div"),
          button = document.createElement("button"),
          list = document.createElement("div");
        group.className =
          "canvas-device-picker" +
          (["dhcp", "note"].includes(type) ? " picker-divider" : "");
        button.type = "button";
        button.dataset.type = type;
        button.className = "device-picker-toggle";
        button.setAttribute("aria-label", label + ": " + items.length);
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-controls", "device-picker-" + type);
        button.innerHTML = glyph + "<span>" + items.length + "</span>";
        button.classList.toggle("is-empty", !items.length);
        list.id = "device-picker-" + type;
        list.className = "device-picker-list";
        list.hidden = true;
        list.setAttribute("aria-label", label);
        const show = () => {
          for (const other of devicePickers.children) {
            other.querySelector(".device-picker-list").hidden = true;
            other
              .querySelector("button")
              .setAttribute("aria-expanded", "false");
          }
          list.hidden = false;
          button.setAttribute("aria-expanded", "true");
        };
        const hide = () => {
          list.hidden = true;
          button.setAttribute("aria-expanded", "false");
        };
        button.onclick = () => (list.hidden ? show() : hide());
        group.onmouseenter = show;
        group.onmouseleave = () => {
          if (!group.contains(document.activeElement)) hide();
        };
        group.onfocusout = (e) => {
          if (!group.contains(e.relatedTarget)) hide();
        };
        group.onkeydown = (e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            hide();
            button.focus();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            show();
            const rows = [...list.querySelectorAll("button")],
              i = rows.indexOf(document.activeElement);
            rows[(i + 1) % rows.length]?.focus();
          }
        };
        for (const d of items) {
          const row = document.createElement("button");
          row.type = "button";
          row.dataset.pickerId = d.id;
          row.innerHTML =
            (isNote ? noteSymbol() : noteTargetIcon(d.id)) +
            "<span>" +
            esc(
              isNote
                ? noteName(d)
                : isDevice
                  ? d.name
                  : appLabel(d.type) +
                    (d.host
                      ? " on " + net.device(d.host).name
                      : " (unattached)"),
            ) +
            "</span>";
          row.onclick = () => {
            hide();
            if (isNote) {
              selectNote(d.id);
            } else if (isDevice) select(d.id);
            else selectApplication(d.id);
            $("canvas").dispatchEvent(
              new CustomEvent("network-locate", { detail: d }),
            );
            $("canvas")
              .querySelector(
                "[" +
                  (isNote
                    ? "data-note"
                    : isDevice
                      ? "data-device"
                      : "data-application") +
                  '="' +
                  d.id +
                  '"]',
              )
              ?.focus({ preventScroll: true });
          };
          list.append(row);
        }
        if (!items.length) {
          const empty = document.createElement("span");
          empty.className = "device-picker-empty";
          empty.textContent = "No " + label.toLowerCase();
          list.append(empty);
        }
        group.append(button, list);
        devicePickers.append(group);
        if (openType === type) show();
        if (focusedType === type) {
          const target = focusedId
            ? [...list.querySelectorAll("button")].find(
                (b) => b.dataset.pickerId === focusedId,
              )
            : button;
          target?.focus({ preventScroll: true });
        }
      }
    }
    document.addEventListener("pointerdown", (e) => {
      if (!devicePickers.contains(e.target))
        for (const group of devicePickers.children) {
          group.querySelector(".device-picker-list").hidden = true;
          group.querySelector("button").setAttribute("aria-expanded", "false");
        }
    });

    return { refresh: refreshDevicePickers };
  },
};
