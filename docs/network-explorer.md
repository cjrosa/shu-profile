# Network Explorer

Open [Network Explorer](../cs339/network_explorer.html) directly or from the CS-339 hub. No build or server is required.

## First lesson

Add two hosts and a switch. Connect each host's eth0 to a separate switch port. Configure 192.168.1.10/24 and 192.168.1.20/24. Select the switch and enable **Watch this device**, then ping the second host from the first. Continue through the switch examinations to see ARP flooding, source-MAC learning, and destination-MAC forwarding. Repeat the ping to compare the cached exchange. The example button supplies the same network.

Each watched device pauses traffic with an examination overlay. It shows the incoming frame, table before processing, explanation, table after processing, and egress ports. Continue commits the staged event. Multiple broadcast recipients are processed sequentially. Run/Pause/Step use the same event queue.

## Files and extension boundaries

- [Engine](../assets/js/network-explorer-engine.js): topology, interfaces, event queue, ARP, MAC learning, ICMP. Exports to the browser and Node tests.
- [UI](../assets/js/network-explorer-ui.js): SVG topology, connection picker, inspector, examination dialogs, commands, examples, save/load.
- [Styles](../assets/css/pages/network-explorer.css): standalone course-style layout.
- [Tests](../tests/network-explorer.test.cjs): protocol and topology checks, run with `node --test tests/network-explorer.test.cjs`.

Topology JSON version 1 stores configuration, interface identities, layout, and watched devices. Runtime caches and queued exchanges are not persisted. Configuration changes reset runtime state and are blocked during an exchange; clearing learned state cancels the exchange explicitly. Both MAC and ARP entries expire 120 seconds after learning, using wall-clock deadlines. Compact ring countdowns update while idle; expiry removes live entries and learning refreshes the deadline. The clock advances with events, not wall time, and animation speed does not affect outcomes.

## Scope and expansion

This release models untagged Ethernet, IPv4 host interfaces, ARP, and a single ICMP Echo exchange per ping. It blocks Layer 2 loops, requires /1–/30 unicast host configuration, and does not model physical errors, bandwidth contention, real operating-system timing, or real network access. Access VLANs are supported. Connected routing and default gateways are supported. Static routes are supported. DHCP, DNS, NAT, trunks, and spanning tree are not implemented.

Later add service handlers for DHCP/DNS and transport messages for TCP/HTTP and NAT. Retain stable device/interface IDs and structured reports so terminal output, animations, and examination use the same state. As lesson count grows, move the initial UI lesson checks to a dedicated lesson-data module. Do not couple this explorer to runtime state in the existing visualizers.

## Access VLANs

All switch ports start in access VLAN 1. Click a port to change its access VLAN or administrative state; right-click for quick enable/disable. Create and name VLANs in the inspector. Configuration changes clear learned state. The Two VLANs example has hosts 1/2 on VLAN 10 and hosts 3/4 on VLAN 20, using the same IP subnet to expose Layer 2 isolation.

The CLI supports `configure terminal`, `vlan 10`, `name Students`, `exit`, `interface P1`, `switchport mode access`, `switchport access vlan 10`, `shutdown`, `no shutdown`, and `end`. Use `show vlan brief`, `show interfaces switchport`, and `show mac address-table` (optionally `vlan 10`). `exit` leaves a configuration mode; at the top level it dismisses the console. `close` always dismisses it.

MAC learning and flooding are scoped to the ingress access VLAN. Watch explains excluded ports, and capture lists switch classification in its VLAN column (filter `vlan.id==10`). These are untagged access frames, not 802.1Q tags. Saved topology remains version 1; older networks load with all ports in VLAN 1. Trunks are deferred; separate physical router interfaces can connect access networks.

## Global platform setting

The header's Global settings control selects Cisco IOS or Palo Alto PAN-OS for the entire Layer 2 teaching model. Selection persists locally and is included in saved topology JSON; legacy saves continue to load. Switching preserves device IDs, cables, VLAN membership, colors, and layout. Cisco uses P1-P8 port names and immediate configuration. PAN-OS uses ethernet1/1-ethernet1/8, named VLAN objects, and shared UI/CLI candidate changes with Commit/Revert in the header. Host CLI follows its own Windows, Linux, or macOS selection.

PAN-OS syntax is a supported subset of the [official configuration hierarchy](https://docs.paloaltonetworks.com/ngfw/pan-os-cli-quick-start/cli-command-hierarchy/pan-os-11-2-configure-cli-command-hierarchy). Use `configure`, `set network interface ethernet ethernet1/1 layer2`, `set network vlan Students interface ethernet1/1`, `set network interface ethernet ethernet1/1 link-state down` (or `auto`), `show network vlan`, `show network interface ethernet`, `commit`, `revert config`, and `exit`. Operational commands include `show interface all` and `show mac all`. Quoted names and bracketed interface lists are accepted. Unassigned VLAN objects can be deleted with `delete network vlan Name`; the model retains its Default object.

Teaching simplifications: all switch interfaces are Layer 2, VLAN object internal IDs are not wire tags, and the app requires committing or reverting candidate changes before traffic or export. Commit/Revert cover the workspace's configuration together rather than modeling separate management sessions per physical appliance. Revert retains layout and watch choices. Examples load as committed configurations with Watch off. The switch profile does not model firewall policies, zones, or trunks. Routers support connected and static routing, with interface addresses configured through the inspector.

## Connected routing

Add a two-interface router from the palette. Click G0/0 or G0/1 to assign an IPv4 address/prefix or change administrative state. Enabled addressed interfaces add connected routes automatically; overlapping interface subnets are rejected. Hosts have an optional default gateway in their own subnet. Load Examples > Two subnets, then use Host 1's CLI to run `ping 192.168.2.20`. Examples start with Watch off; double-click the router to watch its decisions.

Off-subnet hosts ARP for their gateway, keeping the remote destination IP. Routers keep separate ARP entries per interface, resolve the directly connected next hop, replace the Ethernet header, preserve IP endpoints, and decrement IP TTL. Watch shows incoming/outgoing frames and connected-route decisions. Broadcasts stay on their LAN. Unreachable next hops and missing forward/return routes time out; this version records drops without synthesizing ICMP unreachable/time-exceeded messages.

The router console provides `show ip route`, `show ip interface brief`, and `show arp` as a small display-command subset. Configure addresses through the interface inspector; static routes can also be configured through the routing table or console. Router interfaces and host gateways persist in topology JSON; legacy hosts load without a gateway.

## Static routing

Examples > Two routers connects two /24 LANs through a /30 router link. Each router has a static return path to the other LAN. The routing table supports adding, editing, and deleting routes, including a default route (0.0.0.0/0). Forwarding selects the longest prefix, preferring connected routes for equal prefixes. Disabled interfaces withdraw their routes without deleting configuration. Watch highlights the chosen route and shows the next hop and rewritten frame.

Cisco configuration mode accepts `ip route NETWORK MASK NEXT_HOP` and `no ip route NETWORK MASK NEXT_HOP`; use `show ip route` to inspect routes. PAN-OS configuration mode accepts `set network virtual-router default routing-table ip static-route NAME destination NETWORK/PREFIX nexthop ip-address NEXT_HOP` and `delete network virtual-router default routing-table ip static-route NAME`, followed by `commit` or `revert config`. Use `show routing route` operationally. This teaching subset requires a complete destination and next hop in each set command, and only models the default virtual router. Next hops must be directly reachable; recursive routing and dynamic protocols are not modeled.

Command references: [Cisco ip route](https://www.cisco.com/E-Learning/bulk/public/tac/cim/cib/using_cisco_ios_software/cmdrefs/ip_route.htm) and [PAN-OS static routes](https://knowledgebase.paloaltonetworks.com/KCSArticleDetail?id=kA10g000000Cm2lCAC&lang=en_US).