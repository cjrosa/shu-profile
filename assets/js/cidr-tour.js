const TOUR_STEPS = [
  {
    "title": "1. Start with an IP Address",
    "what": "An <strong>IPv4 address</strong> identifies a network interface. For example, <strong>192.168.1.57</strong> is written as four decimal numbers separated by dots.",
    "how": "Each number is called an <strong>octet</strong> and ranges from 0 to 255. Read this example as the four values <strong>192, 168, 1, and 57</strong>.",
    "tryIt": "In Explore the address, select decimal input (###.###.###.###) and enter 192.168.1.57. Leave the other controls unchanged while you examine the address.",
    "highlight": "ip-input",
    "takeaway": "Start by reading the address itself. Next we will see how its four octets represent 32 bits."
  },
  {
    "title": "2. IP Address Anatomy",
    "what": "An IPv4 address is four <strong>8-bit octets</strong>. Each octet represents a decimal number from 0 to 255.",
    "how": "In <strong>IP Address Anatomy</strong>, the four binary groups show the address itself. <strong>Interpret the bits</strong> explains the place values: 128, 64, 32, 16, 8, 4, 2, 1. Four groups of 8 bits make 32 bits.",
    "tryIt": "Enter 128.0.0.1 in decimal mode. In IP Address Anatomy, observe the first and last bits set to 1. Switch the address input to binary to see the same address in another notation.",
    "highlight": "address-octets",
    "takeaway": "Decimal and binary are two ways to write the same 32-bit address."
  },
  {
    "title": "3. Why CIDR Exists",
    "what": "IPv4 addresses contain 32 bits. CIDR uses a <strong>prefix length</strong>, such as /24, to specify how many bits identify an address block.",
    "why": "Classful addressing offered fixed network sizes. CIDR allows blocks sized in powers of two, reducing wasted address space and supporting route aggregation.",
    "how": "Use <strong>Explore the address</strong> to enter an IPv4 address and change <strong>Prefix length</strong>. <strong>See the subnets</strong> illustrates the selected prefix; the calculations appear in <strong>How IPs define subnets</strong>.",
    "tryIt": "Choose Everyday /24, then Small subnet /26. Compare the Block size card: 256 addresses becomes 64.",
    "highlight": "prefix",
    "takeaway": "A longer prefix leaves fewer host bits and a smaller address block."
  },
  {
    "title": "4. Interpret the Prefix",
    "what": "In <strong>How IPs define subnets</strong>, the prefix separates blue network bits from green host bits.",
    "how": "For /24, <strong>32 − 24 = 8 host bits</strong>. The highlighted prefix in Interpret the prefix controls where the boundary falls. Each free host bit has two possible values.",
    "tryIt": "Choose Everyday /24, then Split octet /20. Inspect the colored bit allocation and the IP address row. At /20, the boundary lies inside the third octet.",
    "highlight": "prefix-foundations",
    "takeaway": "Adding one network bit halves the total addresses per block. Within a fixed parent block, it doubles the number of equal child blocks."
  },
  {
    "title": "5. Mask AND Address = Network",
    "what": "The <strong>Mask</strong> row has 1s for network bits and 0s for host bits. Its dotted-decimal form expresses the same boundary as the prefix.",
    "how": "The <strong>AND</strong> divider leads to the <strong>= Network</strong> result: keep the IP bits where the mask is 1 and clear them where it is 0. The Subnet mask card shows the decimal mask.",
    "tryIt": "Enter 192.168.1.57 and set /26. Read Mask = 255.255.255.192 and Network = 192.168.1.0. Change to /20 to see a boundary inside the third octet.",
    "highlight": "binary-workbench",
    "takeaway": "IP address AND subnet mask gives the network address."
  },
  {
    "title": "6. Private IPv4 Addresses",
    "what": "Three IPv4 ranges are reserved for private networks: <strong>10.0.0.0/8</strong>, <strong>172.16.0.0/12</strong>, and <strong>192.168.0.0/16</strong>.",
    "how": "These contain 16,777,216; 1,048,576; and 65,536 addresses respectively. Different private networks can reuse them. They are not globally unique public destinations.",
    "tryIt": "In decimal input mode, enter 10.0.0.0 and set Prefix length to /8. Then try 172.16.0.0 with /12. Read Block size in Your subnet at a glance.",
    "highlight": "ip-input",
    "takeaway": "Private address space can be subdivided just like other IPv4 address space. The department and LAN examples in the diagram are illustrative."
  },
  {
    "title": "7. Network, Hosts, and Broadcast",
    "what": "For a conventional subnet through /30, the first address identifies the network and the last is the broadcast address. The addresses between them are available for interfaces.",
    "how": "The range diagram below <strong>Your subnet at a glance</strong> shows Network, the usable address span, and Broadcast. The Broadcast address card explains the last address.",
    "tryIt": "Set 192.168.1.57 with /26. Read the range: network .0, usable .1 through .62, broadcast .63. The full block has 64 addresses; 62 are usable.",
    "highlight": "range-diagram",
    "takeaway": "Subtract two for conventional subnets. /31 point-to-point links and /32 host routes have special meanings covered later."
  },
  {
    "title": "8. Block Size and Planning",
    "what": "<strong>Block size = 2^(32 − prefix)</strong>. For a conventional subnet, usable addresses = block size − 2.",
    "how": "If you need 30 end devices plus a router interface, you need 31 usable addresses. /27 provides only 30; /26 provides 62. Count every interface that needs an address, including the gateway.",
    "tryIt": "Use Prefix length to find room for 14, 28, and 62 total interfaces: /28, /27, and /26 respectively. Verify the Block size card and the usable count in the range diagram. There is no host-count input.",
    "highlight": "stats",
    "takeaway": "Choose the smallest power-of-two block that fits all required interfaces plus the two reserved addresses."
  },
  {
    "title": "9. Compare Two Addresses",
    "what": "Open <strong>Compare</strong> to ask whether two addresses have the same network result under the selected mask.",
    "how": "The Original address and Compare address cards show IP address, dotted-decimal Mask, and a bold Network result. Equal network results indicate the same subnet under that mask. The verdict also identifies reserved addresses.",
    "tryIt": "Set the original address to 192.168.1.57 with /26. Enter 192.168.1.62 in Compare IPv4 address: same subnet. Try 192.168.1.65: different subnet. Then try .64: it identifies the second network and is not a usable host address.",
    "highlight": "compare-diagram",
    "takeaway": "Compare network results, not just the first three decimal octets. A same-subnet result alone does not prove that an address is usable or that connectivity exists."
  },
  {
    "title": "10. Subdivide and Follow a Child Block",
    "what": "<strong>Subdivide &amp; aggregate</strong> divides the current parent into equal child blocks. The Parent bar above <strong>Child prefix</strong> identifies the starting allocation.",
    "how": "The three cards count child subnets, count addresses per child, and perform a <strong>Sanity check</strong>: child count × child size = parent size. Amber bits identify each child; green bits vary within it.",
    "tryIt": "Set the original address to 192.168.1.57 with /24, then Child prefix to /28. Select Block 3. Its binary ID 0010 equals index 2. The four cards show offset 2 × 16 = 32, first address .32, and last address .32 + (16 − 1) = .47.",
    "highlight": "sub-lessons",
    "takeaway": "Block numbering starts at 1; the binary block index starts at 0. Last address = first address + block size − 1. This tool makes equal-size children; VLSM uses different child sizes."
  },
  {
    "title": "11. Special Cases: /30, /31, /32",
    "what": "These prefixes illustrate small point-to-point blocks and individual host routes.",
    "how": "<strong>/30:</strong> four addresses, two usable router-interface addresses. See the subnets shows three routers joined by /30 links, with faded example LANs.<br><br><strong>/31:</strong> two usable endpoints on a point-to-point link, without reserving a network or broadcast address.<br><br><strong>/32:</strong> one exact destination. The diagram shows a router forwarding toward that address, with mask 255.255.255.255.",
    "tryIt": "Choose Router link /30, Point-to-point /31, and Host route /32 under Try an example. Read the changing diagram and its explanation.",
    "highlight": "cidr-topology",
    "takeaway": "A /32 route does not specify the destination device’s LAN mask. Its arrow shows forwarding toward a destination, possibly through other routers, not a dedicated physical link."
  },
  {
    "title": "12. Aggregate the Children",
    "what": "Aggregation combines a complete, contiguous, aligned set of child blocks into one larger prefix.",
    "how": "For example, 10.0.0.0/24 through 10.0.3.0/24 together form 10.0.0.0/22. The children share the first 22 bits. Read the <strong>Aggregate</strong> explanation below the four selected-block cards.",
    "tryIt": "Enter 10.0.0.0 with Prefix length /22. In Subdivide &amp; aggregate, set Child prefix to /24. Inspect the four child blocks and the Sanity check: 4 × 256 = 1,024 total addresses. The table lists each child’s range.",
    "highlight": "sub-selected",
    "takeaway": "Splitting preserves the total address count. Conventional child subnets each reserve network and broadcast addresses, so the combined usable count can decrease."
  },
  {
    "title": "13. Avoid Common Mistakes",
    "what": "Interpret an address together with its prefix, and include every required interface when planning capacity.",
    "how": "<strong>Reserved addresses:</strong> 10.0.1.0 and 10.0.1.255 are network and broadcast addresses under /24; their roles can differ under another prefix.<br><br><strong>Gateway capacity:</strong> a router interface consumes one usable address. It need not use the first usable address.<br><br><strong>Overlapping LANs:</strong> avoid unintentionally assigning overlapping ranges to separate LANs. More-specific routes inside an aggregate are normal and do not inherently cause loops.<br><br><strong>Illustrative topology:</strong> nearby address blocks and example interfaces do not prove how a real network is configured.",
    "tryIt": "Set 192.168.1.57 with /26 and compare it with 192.168.1.64. Read both the different-subnet verdict and the warning that .64 is the second subnet’s network address.",
    "highlight": "cmp-result",
    "takeaway": "Check the prefix, network result, usable range, and gateway requirements together."
  }
];

let tourStep = 0;

function startTour() {
  tourStep = 0;
  document.body.classList.add('tour-open');
  document.getElementById('tour-launch').hidden = true;
  document.getElementById('tour-panel').hidden = false;
  document.querySelector('#tour-panel button').focus();
  renderTourStep();
}

function closeTour() {
  document.getElementById('tour-panel').hidden = true;
  document.body.classList.remove('tour-open');
  document.getElementById('tour-launch').hidden = false;
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
    if (el) {
      el.classList.add('tour-highlight');
      // Wait for the docked layout and sticky navigation to settle first.
      requestAnimationFrame(() => {
        if (document.getElementById('tour-panel').hidden || TOUR_STEPS[tourStep] !== s) return;
        el.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
          block: 'start',
          inline: 'nearest'
        });
      });
    }
  }

  // Scroll to top of body
  document.getElementById('tour-body').scrollTop = 0;
}



document.addEventListener('keydown', event => { if (event.key === 'Escape' && !document.getElementById('tour-panel').hidden) closeTour(); });

