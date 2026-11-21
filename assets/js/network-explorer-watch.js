/* Watch selects explanations, independently of traffic visibility. */
(function (root) {
  "use strict";
  const labels = {
    arp: "ARP / neighbor resolution", routing: "Routing / OSPF / longest-prefix match",
    switching: "MAC learning / switching", nat: "NAT / PAT", firewall: "Firewall policy",
    icmp: "ICMP / ping", tcp: "TCP", udp: "UDP / DNS / DHCP", other: "Other decisions"
  };
  function options(d) {
    if (d.firewallMode === "transparent") return ["firewall", "other"];
    if (d.type === "switch") return ["arp", "switching", "other"];
    if (d.type === "router") return ["arp", "routing", "nat", "firewall", "other"];
    return ["arp", "icmp", "tcp", "udp", "other"];
  }
  function categories(d, r) {
    const result = [], f = r.frame || {};
    if (r.routingTable || r.selectedRoute || r.ospf) result.push("routing");
    if (r.nat) result.push("nat");
    if (r.firewall) result.push("firewall");
    if (f.type === "ARP") result.push("arp");
    if (!result.length) {
      if (d.type === "switch") result.push("switching");
      else if (d.type === "host") {
        if (f.protocol === "TCP") result.push("tcp");
        else if (f.protocol === "UDP") result.push("udp");
        else if (f.icmp || r.kind === "start" || r.kind === "timeout") result.push("icmp");
      }
      if (!result.length && r.outgoingFrames?.some(o => o.frame.type === "ARP")) result.push("arp");
    }
    return result.length ? result : ["other"];
  }
  function matches(d, r) {
    return !!d?.watch && !(r.ospf && !r.ospfChanged) && !r.kind?.endsWith("-application") &&
      (!Array.isArray(d.watchDecisions) || categories(d, r).some(k => d.watchDecisions.includes(k)));
  }
  const api = { labels, options, categories, matches };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.NetworkExplorerWatch = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
