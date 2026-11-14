/* Inspector port and VLAN markup. Event binding remains with the controller. */
window.NetworkExplorerInspectorPorts = {
  create({ getNetwork, esc, vlanLabel, isPan }) {
    function interfacePanel(d) {
      const net = getNetwork();
      return (
        '<div class="small-heading inspector-section-heading">Interfaces</div><p class="hint">Click a port to configure it. Right-click to enable or disable.</p><div class="interface-chassis"><div class="interface-ports">' +
        d.ports
          .map((p) => {
            const link = net.links.find(
              (l) =>
                (l.a === d.id && l.ap === p.id) ||
                (l.b === d.id && l.bp === p.id),
            );
            const peer = link
              ? net.device(link.a === d.id ? link.b : link.a).name
              : "Not connected";
            const state = link
              ? "In use"
              : p.enabled
                ? "Available"
                : "Disabled";
            const active = Boolean(
              link &&
                link.enabled &&
                p.enabled &&
                net
                  .device(link.a === d.id ? link.b : link.a)
                  .ports.find(
                    (q) => q.id === (link.a === d.id ? link.bp : link.ap),
                  ).enabled,
            );
            const description =
              p.name +
              " - " +
              state +
              " - " +
              (p.enabled ? "Enabled" : "Disabled") +
              " - " +
              peer;
            return (
              '<button type="button" class="interface-port ' +
              (p.enabled ? "enabled" : "disabled") +
              (active ? " link-up" : link && p.enabled ? " link-down" : "") +
              '" data-device-port="' +
              esc(d.id + ":" + p.id) +
              '" data-port="' +
              esc(p.id) +
              '" aria-pressed="' +
              p.enabled +
              '" aria-label="' +
              esc(description) +
              '" title="' +
              esc(description) +
              '"><span class="port-name">' +
              esc(p.name.replace(/^ethernet/, "eth")) +
              '</span><svg viewBox="0 0 44 32" aria-hidden="true"><path class="socket" d="M5 3h34v20H28v6H16v-6H5z"/><path class="contacts" d="M12 6v7m5-7v7m5-7v7m5-7v7m5-7v7"/><path class="socket-edge" d="M9 19h7v5h12v-5h7"/></svg><span class="port-led" aria-hidden="true"></span>' +
              (d.type === "switch"
                ? '<span class="vlan-badge" style="--vlan-color:' +
                  esc(d.vlans.find((v) => v.id === p.accessVlan)?.color) +
                  '">' +
                  esc(vlanLabel(d, p.accessVlan)) +
                  "</span>"
                : "") +
              "</button>"
            );
          })
          .join("") +
        "</div></div>"
      );
    }
    function vlanPanel(d) {
      return (
        '<div class="small-heading vlan-heading inspector-section-heading"><span>' +
        (isPan(d) ? "VLAN objects" : "VLANs") +
        '</span><button id="show-add-vlan" class="vlan-icon-button" type="button" aria-label="Add VLAN" title="Add VLAN" aria-expanded="false" aria-controls="add-vlan-form"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div><div class="vlan-list">' +
        d.vlans
          .slice()
          .sort((a, b) => a.id - b.id)
          .map(
            (v) =>
              '<div class="vlan-row"><span draggable="true" data-drag-vlan="' +
              v.id +
              '" title="Drag ' +
              esc(vlanLabel(d, v.id)) +
              ' onto a port" class="vlan-badge" style="--vlan-color:' +
              esc(v.color) +
              '">' +
              esc(vlanLabel(d, v.id)) +
              '</span><input data-vlan-name="' +
              v.id +
              '" value="' +
              esc(v.name) +
              '" maxlength="40" aria-label="VLAN ' +
              v.id +
              ' name"><input type="color" data-vlan-color="' +
              v.id +
              '" value="' +
              esc(v.color) +
              '" aria-label="VLAN ' +
              v.id +
              ' color"></div>',
          )
          .join("") +
        '</div><form id="add-vlan-form" class="vlan-add" hidden><input id="new-vlan-id" type="number" min="2" max="4094" placeholder="ID" aria-label="New VLAN ID" required><input id="new-vlan-name" placeholder="Name" maxlength="40" aria-label="New VLAN name"><button class="vlan-icon-button" type="submit" aria-label="Save VLAN" title="Save VLAN"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l4 4v14H3V3h2ZM7 3v6h10V3M7 21v-8h10v8"/></svg></button><button id="cancel-add-vlan" class="vlan-icon-button" type="button" aria-label="Cancel new VLAN" title="Cancel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></form>'
      );
    }

    return { interfacePanel, vlanPanel };
  },
};
