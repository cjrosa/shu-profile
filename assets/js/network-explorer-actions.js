/* Shared commands for Home, guides and keyboard entry points. */
(function (root) {
  "use strict";
  const handlers = new Map();
  const examples = {
    "example-internet": {
      title: "Internet and NAT",
      description:
        "Two private clients share one outside address using NAT/PAT.",
    },
    example: {
      title: "Simple LAN",
      description: "Two configured hosts and an Ethernet switch.",
    },
    "example-vlans": {
      title: "Two VLANs",
      description: "Four hosts on two separate broadcast domains.",
    },
    "example-routed": {
      title: "Two subnets",
      description: "Two LANs joined by a router and default gateways.",
    },
    "example-static": {
      title: "Two routers",
      description: "Two LANs, a /30 transit link, and static routes.",
    },
    "example-dhcp": {
      title: "DHCP LAN",
      description: "A client, switch and local DHCP server.",
    },
    "example-dhcp-relay": {
      title: "DHCP relay",
      description: "A remote server reached through two routers.",
    },
    "example-dns": {
      title: "DNS LAN",
      description: "Resolve names using a local DNS server.",
    },
    "example-http": {
      title: "Web browsing",
      description: "Resolve a name, connect with TCP, and fetch an HTTP page.",
    },
    "example-complex": {
      title: "Campus network",
      description:
        "Three routers, three switches, DHCP relay, DNS and Web browsing.",
    },
  };
  root.NetworkExplorerActions = {
    examples,
    register: (id, handler) => handlers.set(id, handler),
    run(id) {
      const handler = handlers.get(id);
      if (!handler) throw new Error("Unknown network action: " + id);
      return handler();
    },
  };
})(globalThis);
