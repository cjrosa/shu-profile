/* Educational outbound PAT. Runtime mappings never enter topology saves. */
(function (root) {
  "use strict";
  function validate(d, c) {
    if (
      d.type !== "router" ||
      !c ||
      typeof c.enabled !== "boolean" ||
      !Array.isArray(c.inside) ||
      (c.enabled && (!c.inside.length || !c.outside)) ||
      new Set(c.inside).size !== c.inside.length ||
      c.inside.includes(c.outside) ||
      typeof c.outside !== "string" ||
      ![...c.inside, ...(c.outside ? [c.outside] : [])].every((id) => d.ports.some((p) => p.id === id))
    )
      throw Error("Choose distinct inside and outside router interfaces.");
    if (
      c.enabled &&
      ![...c.inside, c.outside].every(
        (id) => d.ports.find((p) => p.id === id).ip,
      )
    )
      throw Error("Configure addresses on the NAT interfaces first.");
  }
  function rows(n, id) {
    return n.natTable[id] || (n.natTable[id] = []);
  }
  function inbound(n, d, p, f) {
    if (!d.nat?.enabled || p.id !== d.nat.outside || f.dip !== p.ip)
      return null;
    const protocol = f.protocol || "ICMP",
      r = rows(n, d.id).find(
        (r) =>
          r.protocol === protocol &&
          r.publicIp === f.dip &&
          r.remoteIp === f.sip &&
          (protocol === "ICMP"
            ? r.probe === f.probe
            : r.publicPort === f.dport && r.remotePort === f.sport),
      );
    if (!r) return null;
    const before = { ...f };
    f.dip = r.privateIp;
    if (protocol !== "ICMP") f.dport = r.privatePort;
    r.expiresAt = Date.now() + 120000;
    return { direction: "Inbound", before, after: { ...f } };
  }
  function outbound(n, d, p, out, f) {
    if (
      !d.nat?.enabled ||
      !d.nat.inside.includes(p.id) ||
      out.id !== d.nat.outside
    )
      return null;
    const protocol = f.protocol || "ICMP";
    if (!["TCP", "UDP"].includes(protocol) && f.icmp !== "Echo Request")
      return null;
    const table = rows(n, d.id);
    let r = table.find(
      (r) =>
        r.protocol === protocol &&
        r.privateIp === f.sip &&
        r.privatePort === f.sport &&
        r.remoteIp === f.dip &&
        r.remotePort === f.dport &&
        r.probe === f.probe,
    );
    if (!r) {
      let port = 40000;
      while (table.some((r) => r.publicPort === port)) port++;
      if (port > 60000) throw Error("NAT translation table is full.");
      r = {
        protocol,
        privateIp: f.sip,
        privatePort: f.sport,
        publicIp: out.ip,
        publicPort: port,
        remoteIp: f.dip,
        remotePort: f.dport,
        probe: f.probe,
      };
      table.push(r);
    }
    r.expiresAt = Date.now() + 120000;
    const before = { ...f };
    f.sip = r.publicIp;
    if (protocol !== "ICMP") f.sport = r.publicPort;
    return { direction: "Outbound", before, after: { ...f } };
  }
  function describe(t) {
    const a = t.before,
      b = t.after;
    return (
      t.direction +
      " NAT: " +
      a.sip +
      (a.sport ? ":" + a.sport : "") +
      " -> " +
      a.dip +
      (a.dport ? ":" + a.dport : "") +
      " becomes " +
      b.sip +
      (b.sport ? ":" + b.sport : "") +
      " -> " +
      b.dip +
      (b.dport ? ":" + b.dport : "") +
      "."
    );
  }
  const api = { validate, inbound, outbound, describe };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.NetworkExplorerNAT = api;
})(globalThis);
