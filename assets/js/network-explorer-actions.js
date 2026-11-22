/* Shared commands for Home, guides and keyboard entry points. */
(function (root) {
  "use strict";
  const handlers = new Map();
  const examples = {
    "example-switched-tree": {title:"Four-switch LAN",description:"Nine hosts connected through four switches."},
    "example-ospf": {title:"OSPF: three-router network",description:"Explore neighbor discovery, learned routes, and lowest-cost paths across three connected LANs."},
    "example-wireless": {title:"Wireless LAN",description:"Join Wi-Fi, acquire DHCP, and bridge to Ethernet."},
    "example-arp-drop": {title:"ARP: gateway impersonation",description:"Poison a client cache, interrupt service, and recover with switch inspection."},
    "example-arp-intercept": {title:"ARP: hidden interception",description:"Keep HTTP working through an attacker and inspect what is visible."},
    "example-arp-protected": {title:"ARP: protected LAN",description:"Validate static bindings, block forged claims, and investigate trusted-port bypass."},
    "example-security-encrypt": {title:"Secure HTTP with HTTPS",description:"Start with readable HTTP and protect the page with a certificate and TLS."},
    "example-security-harden": {title:"Reduce exposed services",description:"Restrict an overly permissive firewall while keeping HTTPS available."},
    "example-security-detect": {title:"Detect a port scan",description:"Enable IDS and investigate a scan without changing its results."},
    "example-security-prevent": {title:"Detect versus Prevent",description:"Compare alerts with blocked scan probes, then verify legitimate HTTPS."},
    "example-dos": {title:"DoS: keep HTTPS available",description:"Exhaust pending connections with one simulated source, then protect legitimate access."},
    "example-https": {title: "HTTPS and certificates", description: "Verify a server certificate, load an encrypted page, and inspect TLS traffic."},
    "example-echo-tcp": {title: "TCP Echo - Python debugger", description: "Step through a threaded Echo server and two clients, from DNS to TCP close."},
    "example-echo-udp": {title: "UDP Echo - Python debugger", description: "Follow recvfrom() and sendto() through the network, one datagram at a time."},
    "example-direct": {title: "Direct connection", description: "Two hosts on one Ethernet cable. Explore ARP and ping without a switch."},
    "example-firewall": {title: "Firewall", description: "Allow DNS and web browsing, block ping, and inspect stateful replies."},
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
