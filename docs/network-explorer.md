# Network Explorer

Open [Network Explorer](../cs339/network_explorer.html) directly or from the CS-339 hub. No build or server is required.

## First lesson

Add two hosts and a switch. Connect each host's eth0 to a separate switch port. Configure 192.168.1.10/24 and 192.168.1.20/24. Select the switch and enable **Watch this device**, then ping the second host from the first. Continue through the switch examinations to see ARP flooding, source-MAC learning, and destination-MAC forwarding. Repeat the ping to compare the cached exchange. The example button supplies the same network.

Each watched device pauses traffic with an examination overlay. It shows the incoming frame, table before processing, explanation, table after processing, and egress ports. Continue commits the staged event. Multiple broadcast recipients are processed sequentially. Run/Pause/Step use the same event queue.

## Files and extension boundaries

- [Engine](../assets/js/network-explorer-engine.js): topology, interfaces, event queue, ARP, MAC learning, ICMP. Exports to the browser and Node tests.
- [UI](../assets/js/network-explorer-ui.js): SVG topology, connection picker, inspector, examination dialogs, commands, guided progress, save/load.
- [Styles](../assets/css/pages/network-explorer.css): standalone course-style layout.
- [Tests](../tests/network-explorer.test.cjs): protocol and topology checks, run with `node --test tests/network-explorer.test.cjs`.

Topology JSON version 1 stores configuration, interface identities, layout, and watched devices. Runtime caches and queued exchanges are not persisted. Configuration changes reset runtime state and are blocked during an exchange; clearing learned state cancels the exchange explicitly. MAC entries expire after 300 simulation ticks; ARP entries after 120. The clock advances with events, not wall time, and animation speed does not affect outcomes.

## Scope and expansion

This release models untagged Ethernet, IPv4 host interfaces, ARP, and a single ICMP Echo exchange per ping. It blocks Layer 2 loops, requires /1–/30 unicast host configuration, and does not model physical errors, bandwidth contention, real operating-system timing, or real network access. Routing, gateways, DHCP, DNS, NAT, VLANs, and spanning tree are not implemented.

Next: introduce router interfaces and a routing table, with LPM examination reports produced by the engine. Then add service handlers for DHCP/DNS and transport messages for TCP/HTTP and NAT. Retain stable device/interface IDs and structured reports so terminal output, animations, and examination use the same state. As lesson count grows, move the initial UI lesson checks to a dedicated lesson-data module. Do not couple this explorer to runtime state in the existing visualizers.
