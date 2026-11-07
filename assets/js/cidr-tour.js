const TOUR_STEPS = [
  {
    title: '1. Why CIDR Exists',
    what: 'Before CIDR (1993), the internet used <strong>classful addressing</strong> — every network was Class A (16M hosts), Class B (65K hosts), or Class C (254 hosts). There was nothing in between.',
    why: 'A company needing 300 hosts was forced to take a <strong>Class B</strong> — wasting 65,234 addresses. With only ~4.3 billion IPv4 addresses total, this caused an address exhaustion crisis by the early 1990s.',
    how: '<strong>CIDR (Classless Inter-Domain Routing)</strong> replaced fixed classes with a flexible prefix length — the /24, /22, /16 you see above. Now you can right-size any network. Need 300 hosts? Use a /23 (510 usable). Need 30? Use a /27 (30 usable).',
    tryIt: 'Move the prefix slider all the way left (/0) and right (/32). Watch how the block size and usable hosts change — this range is what CIDR unlocks.',
    highlight: 'prefix',
    takeaway: 'CIDR lets you allocate exactly the address space you need — no more, no less.',
  },
  {
    title: '2. RFC 1918 — Private Address Space',
    what: '<strong>RFC 1918</strong> defines three blocks of IP addresses reserved for private networks — they are never routed on the public internet:',
    how: '<code style="display:block;background:var(--bg3);padding:8px 10px;border-radius:6px;font-size:11px;line-height:1.8;margin:6px 0">10.0.0.0/8&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; → 16,777,216 addresses<br>172.16.0.0/12&nbsp;&nbsp;&nbsp; →&nbsp; 1,048,576 addresses<br>192.168.0.0/16&nbsp;&nbsp; →&nbsp;&nbsp;&nbsp;&nbsp;65,536 addresses</code>These ranges can be reused in any private network worldwide. Your home router uses 192.168.x.x. Enterprise networks typically use 10.x.x.x for its vast size.',
    why: 'Without private space, every device would need a globally unique IP. RFC 1918 + NAT allows billions of devices to share a small pool of public IPs.',
    tryIt: 'Try entering 10.0.0.0 with prefix /8, then 172.16.0.0 /12, then 192.168.0.0 /16. See how the block sizes compare.',
    highlight: 'ip-input',
    takeaway: 'Always use RFC 1918 ranges for internal networks. They are free, reusable, and never accidentally routable on the internet.',
  },
  {
    title: '3. Anatomy of an IP Address',
    what: 'Every IPv4 address is <strong>32 bits</strong> — written as four decimal numbers (octets) separated by dots. Each octet is 8 bits, ranging from 0–255.',
    how: 'Look at the bit display above. The address 192.168.1.0 in binary is:<br><code style="font-size:11px">11000000.10101000.00000001.00000000</code><br>Each group of 8 bits is one octet. The decimal value of an octet is the sum of its set bits: bit 7 = 128, bit 6 = 64 ... bit 0 = 1.',
    why: 'Understanding the binary representation is essential — CIDR, subnetting, and masking all operate at the bit level. Decimal notation is just a human-readable shorthand.',
    tryIt: 'Type these IPs into the IP address field and observe the bit display: 255.255.255.255 (all 1s), then 0.0.0.0 (all 0s), then 128.0.0.1 (first and last bits set). Notice how the decimal value of each octet maps to its 8-bit pattern.',
    highlight: 'bits',
    takeaway: 'An IP address is 32 bits. Dotted decimal (192.168.1.0) is just a convenient way to read binary numbers.',
  },
  {
    title: '4. The Prefix — Dividing Network from Host',
    what: 'The <strong>prefix length</strong> (the /24 after the IP) splits the 32 bits into two parts: the <strong>network portion</strong> (blue bits) and the <strong>host portion</strong> (teal bits).',
    how: 'A /24 means the first 24 bits identify the network, the last 8 bits identify the host within that network. All devices sharing the same network bits are on the same subnet.',
    why: 'The split determines two things: <strong>how many subnets</strong> are possible (more network bits = more subnets) and <strong>how many hosts</strong> each subnet can hold (more host bits = more hosts per subnet).',
    tryIt: 'Slowly drag the prefix slider from /16 to /28. Watch the blue/teal boundary move across the bit display. Notice how the block size halves with every step right.',
    highlight: 'prefix',
    takeaway: 'Every bit you move to the network side doubles the number of subnets and halves the hosts per subnet.',
  },
  {
    title: '5. The Subnet Mask',
    what: 'The <strong>subnet mask</strong> expresses the same information as the prefix length, but in 32-bit dotted-decimal form. Network bits are <strong>1</strong>, host bits are <strong>0</strong>.',
    how: 'A /24 mask is 11111111.11111111.11111111.00000000 = 255.255.255.0. A /26 mask is 255.255.255.192. Read the AND mask row to see the binary derivation.',
    why: 'Routers and hosts use the mask to perform an <strong>AND operation</strong>: IP AND mask = network address. This is how a device determines if a destination is local (same subnet) or needs routing.',
    tryIt: 'Read the visible AND mask row in Find the network. Change the prefix to /26 and watch the mask change to 255.255.255.192. Try /20 — part of the third octet becomes network bits.',
    highlight: 'mask-bits',
    takeaway: 'Subnet mask = prefix in dotted decimal. /24 = 255.255.255.0. Both say the same thing.',
  },
  {
    title: '6. Reserved Addresses',
    what: 'Conventional subnets through /30 have <strong>two reserved addresses</strong> that cannot be assigned to any device: the <strong>network address</strong> (first) and the <strong>broadcast address</strong> (last).',
    how: 'Network address: all host bits = 0 (e.g. 192.168.1.<strong>0</strong>)<br>Broadcast address: all host bits = 1 (e.g. 192.168.1.<strong>255</strong>)<br>These bookend the subnet — every assignable address sits between them.',
    why: 'Accidentally assigning the network or broadcast address to a host is a classic misconfiguration. The network address is used in routing tables; the broadcast address triggers all hosts to receive a packet. Neither can have a unique device.',
    tryIt: 'Read Find the network and Read the address range. Network host bits are all 0; broadcast host bits are all 1.',
    highlight: null,
    takeaway: 'For most subnets, usable hosts = block size − 2 (network and broadcast reserved). Exceptions: /31 = 2 usable (RFC 3021, no broadcast), /32 = 1 host route.',
  },
  {
    title: '7. Block Size and Usable Hosts',
    what: '<strong>Block size</strong> = total addresses in the subnet = 2^(host bits). <strong>Usable hosts</strong> = block size − 2 (subtracting network and broadcast).',
    how: 'A /24 has 8 host bits → 2⁸ = 256 addresses → 254 usable.<br>A /26 has 6 host bits → 2⁶ = 64 addresses → 62 usable.<br>A /30 has 2 host bits → 2² = 4 addresses → 2 usable.',
    why: 'Block size also determines <strong>subnet boundaries</strong> — subnets must start at multiples of the block size. A /26 (block=64) starts at .0, .64, .128, .192. You cannot have a /26 starting at .50.',
    tryIt: 'Read the Block size card and the visible address range calculations. Try prefix /28 — block size 16, boundaries every 16 addresses: .0, .16, .32... Try /25 — block 128, boundaries .0 and .128.',
    highlight: null,
    takeaway: 'Block size = 2^(host bits). Usable = block − 2. Subnets start at multiples of block size.',
  },
  {
    title: '8. Planning a Subnet',
    what: 'When designing a network, you start from a requirement: <em>"I need to support N hosts in this subnet."</em> The question is: what prefix do I need?',
    how: 'Rule: find the smallest block size ≥ N + 2 (for reserved addresses) where block size is a power of 2.<br><br>Need 50 hosts → need 52 addresses → next power of 2 ≥ 52 is 64 → block 64 = /26<br>Need 100 hosts → need 102 → next is 128 → /25<br>Need 200 hosts → need 202 → next is 256 → /24',
    why: 'Over-allocating wastes scarce address space. Under-allocating means you run out of IPs. Right-sizing is the core skill of network design.',
    tryIt: 'Try entering these target host counts and finding the right prefix: 14 hosts, 28 hosts, 62 hosts. Use the Usable hosts card to verify your answer.',
    highlight: 'prefix',
    takeaway: 'Need N hosts → find smallest 2^x ≥ N+2 → prefix = 32 − x.',
  },
  {
    title: '9. VLSM — Variable Length Subnet Masking',
    what: '<strong>VLSM</strong> means using different prefix lengths within the same address block — carving subnets of different sizes from one larger network.',
    how: 'Example: you have 10.0.0.0/24 and need:<br>• Sales: 50 hosts → /26 (62 usable) → 10.0.0.0/26<br>• IT: 10 hosts → /28 (14 usable) → 10.0.0.64/28<br>• Servers: 25 hosts → /27 (30 usable) → 10.0.0.96/27<br>• Router link: 2 hosts → /30 (2 usable) → 10.0.0.128/30',
    why: 'Before VLSM, every subnet in a network had to use the same prefix length — massive waste. VLSM lets you allocate exactly what each segment needs from a shared block.',
    tryIt: 'Scroll to Subdivide &amp; aggregate and set the base network to 10.0.0.0/24 with subdivision /26. You will see four equal /26s — in VLSM you could mix sizes instead.',
    highlight: null,
    takeaway: 'VLSM = different subnet sizes from one block. Allocate tightly: big subnets first, then smaller ones from remaining space.',
  },
  {
    title: '10. Special Cases: /30, /31, /32',
    what: 'Three prefix lengths have specific standard uses that every network engineer should know instinctively.',
    how: '<strong>/30</strong> (block 4, 2 usable) — point-to-point router links. Exactly 2 usable addresses, one per router interface. The most common link type between routers.<br><br><strong>/31</strong> (block 2, 2 usable per RFC 3021) — also used for point-to-point links. No broadcast/network reserved — both addresses assignable. Uses two fewer addresses than /30.<br><br><strong>/32</strong> (block 1) — a host route. Refers to exactly one IP. Used for loopback interfaces, policy routing, and advertising a single host.',
    why: 'You will see /30 everywhere in network diagrams — every router-to-router connection. /32 appears in routing tables for null routes and loopbacks. Knowing these by reflex marks a fluent network engineer.',
    tryIt: 'Set the prefix to /30 — see 4 addresses, 2 usable. Then /31 — 2 addresses, both usable (RFC 3021 exception). Then /32 — 1 address, 1 host.',
    highlight: 'prefix',
    takeaway: '/30 = router link (2 usable). /31 = RFC 3021 link. /32 = one host. Know these by heart.',
  },
  {
    title: '11. Aggregation and Route Summarization',
    what: '<strong>Aggregation</strong> (supernetting) means advertising multiple contiguous subnets as a single larger block. A router can announce one aligned /22 instead of four contiguous /24s.',
    how: 'Four /24s: 10.0.0.0/24, 10.0.1.0/24, 10.0.2.0/24, 10.0.3.0/24<br>Aggregate: 10.0.0.0/22 (all four share the same first 22 bits)<br>The /22 covers all four — any router needing to reach them follows one route entry.',
    why: 'Fewer routing table entries = faster lookups, less memory, simpler management. ISPs aggregate customer routes aggressively. Without aggregation, the global routing table would be unmanageable.',
    tryIt: 'Scroll to Subdivide &amp; aggregate. Set the base network to 10.0.0.0 /22 and drag the aggregated blocks slider to /24 — you will see four equal blocks. Each table row shows its network, usable range, broadcast, and host count.',
    highlight: null,
    takeaway: 'Contiguous subnets with a common prefix can be summarized into one route. This is how the internet stays manageable.',
  },
  {
    title: '12. Common Mistakes',
    what: 'Even experienced engineers make these errors. Knowing them prevents painful debugging.',
    how: '<strong>1. Assigning the network address to a host</strong> — e.g. giving 10.0.1.0 to a server. Traffic destined for that IP gets treated as a network address, not forwarded.<br><br><strong>2. Assigning the broadcast address</strong> — e.g. 10.0.1.255. A packet to this address goes to every host. Chaos ensues.<br><br><strong>3. Subnet too small</strong> — planning for 30 hosts but using /27 (30 usable). Forgetting the gateway takes the first address leaves only 29 for devices.<br><br><strong>4. Overlapping subnets</strong> — assigning 10.0.1.0/24 and 10.0.0.0/16 to the same router — the /24 is inside the /16, causing routing loops.<br><br><strong>5. Wrong gateway</strong> — a host configured with a gateway not in its subnet. The host cannot reach the router to forward traffic.',
    why: 'These mistakes cause connectivity failures that are hard to diagnose. Understanding why each is wrong makes you a better network engineer.',
    tryIt: 'With prefix /27 (30 usable): the gateway gets the first host (.1), leaving 29 for devices. If you need 30 devices, you must move to /26. Verify with the Usable hosts card.',
    highlight: null,
    takeaway: 'Reserve the first host for the gateway. Always plan for N+1 (gateway) when sizing. Avoid overlapping blocks.',
  },
];

let tourStep = 0;

function startTour() {
  tourStep = 0;
  document.getElementById('tour-panel').hidden = false;
  document.querySelector('#tour-panel button').focus();
  renderTourStep();
}

function closeTour() {
  document.getElementById('tour-panel').hidden = true;
  document.getElementById('tour-launch').focus();
  clearTourHighlight();
}

function tourNav(dir) {
  tourStep = Math.max(0, Math.min(TOUR_STEPS.length - 1, tourStep + dir));
  renderTourStep();
}

function clearTourHighlight() {
  document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
}

function renderTourStep() {
  const s = TOUR_STEPS[tourStep];
  const total = TOUR_STEPS.length;

  // Progress
  document.getElementById('tour-prog').style.width = ((tourStep + 1) / total * 100) + '%';
  document.getElementById('tour-step-lbl').textContent = `Step ${tourStep + 1} of ${total}`;

  // Dots
  const dotsEl = document.getElementById('tour-dots');
  dotsEl.innerHTML = TOUR_STEPS.map((_, i) =>
    `<button class="tour-dot ${i === tourStep ? 'active' : ''}" onclick="tourStep=${i};renderTourStep()" aria-label="Tour step ${i+1}" aria-pressed="${i === tourStep}"></button>`
  ).join('');

  // Back/Next buttons
  document.getElementById('tour-back').disabled = tourStep === 0;
  document.getElementById('tour-back').style.opacity = tourStep === 0 ? '0.3' : '1';
  document.getElementById('tour-next').textContent = tourStep === total - 1 ? 'Finish ✓' : 'Next →';
  if (tourStep === total - 1) {
    document.getElementById('tour-next').onclick = closeTour;
  } else {
    document.getElementById('tour-next').onclick = () => tourNav(1);
  }

  // Body
  document.getElementById('tour-body').innerHTML = `
    <div class="tour-step-title">${s.title}</div>
    ${s.what ? `<div class="tour-section"><div class="tour-section-lbl">What &amp; Why</div><div class="tour-text">${s.what}</div></div>` : ''}
    ${s.why ? `<div class="tour-section"><div class="tour-text">${s.why}</div></div>` : ''}
    ${s.how ? `<div class="tour-section"><div class="tour-section-lbl">How it works</div><div class="tour-text">${s.how}</div></div>` : ''}
    ${s.tryIt ? `<div class="tour-trythis"><div class="tour-trythis-lbl">✦ Try it</div><p>${s.tryIt}</p></div>` : ''}
    ${s.takeaway ? `<div class="tour-takeaway"><strong>Key takeaway:</strong> ${s.takeaway}</div>` : ''}
  `;

  // Highlight
  clearTourHighlight();
  if (s.highlight) {
    const el = document.getElementById(s.highlight);
    if (el) el.classList.add('tour-highlight');
  }

  // Scroll to top of body
  document.getElementById('tour-body').scrollTop = 0;
}



document.addEventListener('keydown', event => { if (event.key === 'Escape' && !document.getElementById('tour-panel').hidden) closeTour(); });

