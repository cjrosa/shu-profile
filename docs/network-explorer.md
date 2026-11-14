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

This release models untagged Ethernet, IPv4 host interfaces, ARP, and a single ICMP Echo exchange per ping. It blocks Layer 2 loops, requires /1–/30 unicast host configuration, and does not model physical errors, bandwidth contention, real operating-system timing, or real network access. Access VLANs are supported. Connected routing and default gateways are supported. Static routes are supported. DHCP supports local clients and routed relay. DNS, NAT, trunks, and spanning tree are not implemented.

Later add service handlers for DNS and transport messages for TCP/HTTP and NAT. Retain stable device/interface IDs and structured reports so terminal output, animations, and examination use the same state. As lesson count grows, move the initial UI lesson checks to a dedicated lesson-data module. Do not couple this explorer to runtime state in the existing visualizers.

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

Off-subnet hosts ARP for their gateway, keeping the remote destination IP. Routers keep separate ARP entries per interface, resolve the directly connected next hop, replace the Ethernet header, preserve IP endpoints, and decrement IP TTL. Watch shows incoming/outgoing frames and connected-route decisions. Broadcasts stay on their LAN. Unreachable next hops and missing forward/return routes time out; routers return ICMP Destination Unreachable when no route matches and ICMP Time Exceeded when TTL expires, provided a return route exists. Unresolved ARP still times out.

The router console provides `show ip route`, `show ip interface brief`, and `show arp` as a small display-command subset. Configure addresses through the interface inspector; static routes can also be configured through the routing table or console. Router interfaces and host gateways persist in topology JSON; legacy hosts load without a gateway.

## Static routing

Examples > Two routers connects two /24 LANs through a /30 router link. Each router has a static return path to the other LAN. The routing table supports adding, editing, and deleting routes, including a default route (0.0.0.0/0). Forwarding selects the longest prefix, preferring connected routes for equal prefixes. Disabled interfaces withdraw their routes without deleting configuration. Watch highlights the chosen route and shows the next hop and rewritten frame.

Cisco configuration mode accepts `ip route NETWORK MASK NEXT_HOP` and `no ip route NETWORK MASK NEXT_HOP`; use `show ip route` to inspect routes. PAN-OS configuration mode accepts `set network virtual-router default routing-table ip static-route NAME destination NETWORK/PREFIX nexthop ip-address NEXT_HOP` and `delete network virtual-router default routing-table ip static-route NAME`, followed by `commit` or `revert config`. Use `show routing route` operationally. This teaching subset requires a complete destination and next hop in each set command, and only models the default virtual router. Next hops must be directly reachable; recursive routing and dynamic protocols are not modeled.

Command references: [Cisco ip route](https://www.cisco.com/E-Learning/bulk/public/tac/cim/cib/using_cisco_ios_software/cmdrefs/ip_route.htm) and [PAN-OS static routes](https://knowledgebase.paloaltonetworks.com/KCSArticleDetail?id=kA10g000000Cm2lCAC&lang=en_US).

## Traceroute and routing errors

On a Windows host run `tracert 192.168.2.20`; on Linux or macOS run `traceroute 192.168.2.20`. Load Two routers to see two router hops followed by the destination. Each probe starts with TTL 1, then 2, then 3, until the destination replies or the 30-hop limit is reached. This teaching subset sends one probe per hop, uses numeric IPv4 addresses, and does not simulate measured RTTs, DNS lookup, or optional command flags.

Windows sends ICMP Echo Requests. Linux/macOS send UDP probes to closed destination ports starting at 33434; a destination Port Unreachable response completes that trace. Intermediate routers return Time Exceeded. No matching route produces Network Unreachable and stops the trace. Silent hops show an asterisk and tracing continues. Error replies travel through ordinary routing and ARP; a missing return route therefore still causes a timeout. ICMP errors do not trigger further ICMP errors. Clear learned state cancels the trace.

Watch and Events show TTL, UDP ports, ICMP type/code, and the original destination quoted by an error. Pause can freeze any probe or response in flight.

References: [Windows tracert](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/tracert), [Linux traceroute](https://man7.org/linux/man-pages/man8/traceroute.8.html).


## DHCP application

Load Examples > DHCP LAN. Select DHCP Client and use the circular-arrow Acquire DHCP lease control, or run `ipconfig /renew` in its Windows terminal. The server at 192.168.1.2 offers addresses 192.168.1.100-120, a /24 prefix and a 120-second lease, with no default gateway. This simple example contains only a client, switch and server. After ACK, try `ping 192.168.1.2`.

Any manually addressed host can run the DHCP server application. Expand Applications > DHCP server and use the small + beside Pools. Give each pool a unique name, endpoints, prefix, optional gateway and lease duration, then save with the disk icon. Enable the server after saving its first pool. Expand an existing pool to edit or delete it; X cancels unsaved changes. Each pool serves a different, non-overlapping subnet, either local or relayed. Pool size is limited to 1024 addresses and lease duration to 30-86400 seconds. Known manually configured addresses, active client addresses and the gateway are excluded from allocation; conflict detection by ARP probe is not modeled.

Choose Automatic (DHCP) on a client to start acquisition (PAN-OS candidate changes must be committed first). IPv4 address, prefix and gateway become read-only and are installed only after ACK. Changing back to Manual clears the dynamic configuration. Windows supports `ipconfig /renew`, Linux `dhclient eth0`, and macOS `ipconfig set eth0 DHCP` for the simulated eth0 interface; these are educational command subsets, not programs executed on the user's computer.

Discover and selecting Request are broadcasts. The simulated client supports receiving unicast before IP configuration and clears the BOOTP broadcast flag, so Offer and ACK unicast directly to its MAC address. Watch explains each decision; Events supports a `dhcp` filter and shows message, UDP ports, transaction, pool parameters and broadcast/unicast delivery. VLAN isolation applies. Routers relay DHCP only when a server address is configured on the client-facing interface.

Client and server leases count down in real time, including while animation is paused. The renewal control sends a unicast Request/ACK exchange. Renewal is manual in this increment: automatic T1/T2, rebinding, NAK/retry handling and DHCP release are deferred. On expiry, the client loses its address/gateway and must acquire again. Clearing learned state cancels pending acquisition while retaining bound leases. Saved topologies include client mode and server configuration, but omit runtime leases and DHCP-assigned addresses; clients acquire again after loading. Examples start with Watch off.

Protocol reference: [RFC 2131](https://www.rfc-editor.org/rfc/rfc2131.html).


### Advanced DHCP relay example

Examples > DHCP relay places the client on 192.168.1.0/24 and the server at 192.168.2.2/24, with two routers joined by 10.0.0.0/30. The client-facing interface at 192.168.1.1 relays to 192.168.2.2. Static routes connect both LANs; the server uses gateway 192.168.2.1. All devices start with Watch off.

Click a router interface to set or clear its DHCP relay server address. The setting belongs on the client-facing interface; the transit router only needs ordinary routes. Relay settings use the same PAN-OS candidate/commit workflow as interface settings. Cisco relay configuration is also available in interface CLI mode. PAN-OS relay configuration remains in the inspector.

The relay receives Discover/Request broadcasts, sets giaddr to its client-facing IP, and sends unicast UDP 67-to-67 traffic to the server through routing and ARP. The server compares giaddr with its configured pool subnet and sends Offer/ACK back to the relay. The relay delivers the reply to the client MAC on the original LAN using UDP port 68. Watch and Events show giaddr and the incoming/outgoing headers. Missing relay configuration, a mismatched pool, or missing forward/return routes prevents acquisition. Manual renewal after acquisition uses normal routed unicast directly between client and server.

This version supports up to 32 named pools per host and one relay server per router interface. Local discovery selects the pool matching the server interface subnet; relayed discovery uses giaddr, and renewal uses the client source IP. Lease rows show the selected pool. Legacy single-pool saved topologies remain supported and appear as Default. Relay chaining and Option 82 are not modeled. To demonstrate DORA again, switch the client to Manual and back to Automatic, or reload the example. After acquisition, ping 192.168.2.2 to exercise the complete routed path.


Cisco DHCP relay CLI:

```text
configure terminal
interface GigabitEthernet0/0
ip helper-address 192.168.2.2
exit
end
```

In interface mode, use `no ip helper-address 192.168.2.2` to remove that helper. `G0/0` and `Gi0/0` aliases are accepted. `exit` returns from interface mode to global configuration; `end` returns directly to operational mode. The model permits one helper per interface and shares its value with the port dialog. Interface IPv4 addresses are still configured in the inspector.
