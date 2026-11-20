'use strict';

function parseIP(text) {
  const value = text.trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return null;
  const octets = value.split('.').map(Number);
  return octets.every(o => o <= 255) ? octets : null;
}
function ipToNum(o) { return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0; }
function parseBinaryIP(text) {
  const value = text.trim();
  if (!/^[01]{32}$/.test(value) && !/^[01]{8}(?:[.\s]+[01]{8}){3}$/.test(value)) return null;
  // Separators may be dots or whitespace, but never repeated dots.
  if (/\.\s*\./.test(value)) return null;
  return value.replace(/[.\s]/g, '').match(/.{8}/g).map(bits => parseInt(bits, 2));
}
function binaryIP(octets) { return octets.map(o => o.toString(2).padStart(8,'0')).join(' '); }
let addressMode = 'decimal';
function readAddress() { return (addressMode === 'binary' ? parseBinaryIP : parseIP)($('ip-input').value); }
function setAddressMode(mode) {
  const octets = readAddress();
  addressMode = mode;
  const input = $('ip-input');
  if (octets) input.value = mode === 'binary' ? binaryIP(octets) : octets.join('.');
  input.rows = mode === 'binary' ? 2 : 1;
  input.placeholder = mode === 'binary' ? '11000000 10101000 00000001 00111001' : 'e.g. 192.168.1.57';
  $('ip-decimal').setAttribute('aria-pressed', String(mode === 'decimal'));
  $('ip-binary').setAttribute('aria-pressed', String(mode === 'binary'));
  $('ip-format-hint').textContent = mode === 'binary' ? '32 bits: together, or four 8-bit groups separated by spaces or dots.' : 'Four decimal octets, separated by dots.';
  update();
}
function numToIP(n) { return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'); }
function mkMask(p) { return p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0; }
function subnet(ip, prefix) {
  const mask = mkMask(prefix), network = (ip & mask) >>> 0;
  const size = 2 ** (32 - prefix), end = network + size - 1;
  return {ip, prefix, mask, network, end, size, hostBits:32-prefix,
    first:prefix < 31 ? network+1 : network,
    last:prefix < 31 ? end-1 : end,
    usable:prefix < 31 ? size-2 : size,
    broadcast:prefix < 31 ? end : null};
}
const examples = [
  ['192.168.1.57',24], ['192.168.1.77',26], ['172.16.35.42',20],
  ['10.0.0.1',30], ['10.0.0.10',31], ['10.0.0.42',32], ['10.20.1.57',16]
];
const exampleLessons = [
  {
    purpose: 'Explore a familiar LAN-sized block using a host address inside it.',
    why: 'A /24 leaves 8 host bits: 256 total addresses and 254 usable. The network boundary falls between whole octets.',
    thinking: 'Keep 192.168.1 and zero the final octet to find the network. Then identify which two addresses are reserved.'
  },
  {
    purpose: 'Size a subnet for a small team needing 50 host addresses, including its gateway.',
    why: 'A /27 has only 30 usable addresses. A /26 provides 62, meeting the requirement with fewer spare addresses than a /24.',
    thinking: 'Need 50 + 2 reserved = 52 addresses. Round up to 64 = 2^6, so use /26. The entered .77 lies in the .64–.127 block.'
  },
  {
    purpose: 'Practice finding a network when the prefix cuts through an octet.',
    why: 'A /20 uses 4 network bits in the third octet. Its increment is 16 there, but the whole block contains 4,096 addresses.',
    thinking: '35 falls between 32 and 47. Keep the first two octets; the network is 172.16.32.0 and the broadcast is 172.16.47.255.'
  },
  {
    purpose: 'Connect two router interfaces using a conventional subnet with reserved endpoints.',
    why: 'A /30 has four addresses: one network, two usable hosts, and one broadcast. That fits a two-interface link.',
    thinking: 'In 10.0.0.0/30, reserve .0 and .3; assign .1 and .2 to the routers. Compare this four-address allocation with /31.'
  },
  {
    purpose: 'Connect two endpoints while allocating only two addresses.',
    why: 'On a /31 point-to-point link, both addresses are usable. No network or broadcast address is reserved, saving two addresses versus /30.',
    thinking: 'One host bit gives .10 and .11. Use both endpoints; do not subtract two. This example assumes a point-to-point link.'
  },
  {
    purpose: 'Identify one specific address, such as a router loopback or a host route.',
    why: 'All 32 bits identify the address. Zero host bits means 2^0 = 1 address, with no separate broadcast.',
    thinking: 'The network, first host, and last host are all 10.0.0.42. A /32 selects one address; it does not provide a pair for a link.'
  }
];
exampleLessons.push({purpose: 'Plan an organization-wide allocation, then divide it into department or building subnets.'});
const $ = id => document.getElementById(id);
const fmt = n => n.toLocaleString('en-US');
let current = null, subnetPage = 0, selectedSubnet = 0;
const pageSize = 16;

function renderNetworkContext(s, exampleIndex) {
  const network=numToIP(s.network), end=numToIP(s.end), address=numToIP(s.ip);
  let use, meaning;
  if(s.prefix===0) {
    use='A default route: a fallback when no more-specific route matches a destination.';
    meaning='0.0.0.0/0 covers the entire IPv4 address space. It does not mean every destination is on one local LAN.';
  } else if(s.prefix===32) {
    use='A route to one specific host, often a router loopback or an individually routed address.';
    meaning='All 32 bits are fixed. This block contains only '+address+'; it has no separate broadcast address or second endpoint.';
  } else if(s.prefix===31) {
    use='A point-to-point link between two endpoints, such as two routers.';
    meaning='Both '+network+' and '+end+' are usable endpoints. There is no reserved network or broadcast address on this /31 link.';
  } else if(s.prefix===30) {
    use='A conventional point-to-point link, with two usable endpoint addresses.';
    meaning='Use '+numToIP(s.first)+' and '+numToIP(s.last)+' for the endpoints. '+network+' identifies the network; '+end+' is its broadcast address.';
  } else if(s.prefix<24) {
    use='A larger allocation that could be divided among departments, buildings, or other networks.';
    const firstChild=numToIP(s.network), lastChild=numToIP(s.end-255), count=2**(24-s.prefix);
    meaning='This /'+s.prefix+' can contain '+fmt(count)+' separate /24 subnets, from '+firstChild+'/24 to '+lastChild+'/24. Devices in those smaller subnets use a /24 mask; traffic between them is routed. The /'+s.prefix+' describes the overall block, not necessarily one local LAN.';
  } else {
    use=s.prefix===24?'A local subnet for a department, building, or VLAN.':'A smaller local subnet sized for a team, lab, or device group.';
    meaning='With a /'+s.prefix+' mask, usable local addresses run from '+numToIP(s.first)+' to '+numToIP(s.last)+'. Destinations outside '+network+'/'+s.prefix+' require routing. The network and broadcast addresses are reserved.';
  }
  const role=s.prefix<31 && (s.ip===s.network || s.ip===s.end)
    ? address+' is the '+(s.ip===s.network?'network':'broadcast')+' address, not a usable host address.'
    : address+' belongs to this block.';
  const context=exampleIndex>=0 ? exampleLessons[exampleIndex].purpose : use;
  $('example-context').innerHTML='<h3>'+(exampleIndex>=0?"This example's network":'Your current network')+'</h3><dl>'+
    [['Network',network+'/'+s.prefix+' spans '+network+' to '+end+'. '+fmt(s.size)+' total address'+(s.size===1?'':'es')+'. '+role],
     ['What it is used for',context],['What this means',meaning]]
    .map(([label,description])=>'<dt>'+label+'</dt><dd>'+description+'</dd>').join('')+'</dl>';
}

function bitRow(label, number, prefix, options = {}) {
  let cells = '';
  for (let i=0;i<32;i++) {
    const kind = i < prefix ? 'net' : i < (options.childPrefix ?? prefix) ? 'borrowed' : 'host';
    const value = options.ruler ? i+1 : (number >>> (31-i)) & 1;
    const differs = options.differences?.includes(i);
    cells += '<span class="bit-cell '+kind+(i && i%8===0?' octet-start':'')+(i===prefix?' boundary':'')+
      (differs?' bit-difference':'')+'"'+(differs?' title="Bit '+(i+1)+': network bits differ"':'')+'>'+value+'</span>';
  }
  return '<div'+(options.id?' id="'+options.id+'"':'')+' class="bit-line'+(options.result?' result-line':'')+(options.ruler?' ruler':'')+'"><span class="bit-label">'+label+'</span>'+cells+'<span class="decimal">'+(options.ruler?'Decimal':numToIP(number))+'</span></div>';
}
function stat(label, value, note) {
  const definitions = {
    'Network address': 'The starting address of the subnet, found by ANDing the IP with the mask. It identifies the block in routing tables. It is reserved in conventional subnets through /30; /31 link endpoints and /32 host routes are exceptions.',
    'Broadcast address': 'Use this destination to send one IPv4 packet to all hosts on the local subnet, rather than to one device. It supports announcements and discovery within the subnet. All host bits are 1, making it the last address in the block. It cannot be assigned to a host. /31 point-to-point links and /32 host routes have no subnet broadcast.',
    'First usable host': 'The lowest address available for a device in this subnet. Usually network + 1; for /31 links and /32 routes, it is the network address itself. A gateway may use it, but the gateway address must be configured.',
    'Last usable host': 'The highest address available for a device in this subnet. Usually broadcast − 1. A /31 uses its second endpoint; a /32 has only one address, so first and last are the same.',
    'Block size': 'The total number of addresses covered by the prefix, including any reserved network and broadcast addresses. It is 2 raised to the number of host bits. This is the whole block, not the increment in a split octet.',
    'Usable hosts': 'The number of addresses available for device interfaces under this subnet model. Usually block size − 2. A /31 point-to-point link has 2 usable endpoints; a /32 identifies 1 host. A gateway consumes one usable address.',
    'Subnet mask': 'A device uses the mask to determine whether a destination is on its own subnet or needs a router. Applying the mask to both IP addresses gives their network addresses: matching results mean the same subnet. The mask uses 1s for network bits and 0s for host bits.',
    'Network / host bits': 'How the 32 IPv4 bits are divided: network bits identify the subnet, and host bits select addresses inside it. The prefix is the network-bit count. Moving one bit to the network side halves the block size.'
  };
  const description=(definitions[label]+' Current value: '+value+'. '+note).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  return '<div class="stat" tabindex="0" role="group" aria-label="'+label+': '+value+'" data-tooltip="'+description+'"><div class="lbl">'+label+'<svg class="stat-help" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle class="help-ring" cx="12" cy="12" r="9"/><path d="M9.1 8.5a3 3 0 0 1 5.8 1c0 2-2.9 2-2.9 4"/><circle class="help-dot" cx="12" cy="17" r=".8"/></svg></div><div class="val">'+value+'</div><p>'+note+'</p></div>';
}
function initStatTooltips() {
  const tooltip=document.createElement('div');
  tooltip.id='cidr-tooltip'; tooltip.className='cidr-tooltip';
  tooltip.setAttribute('role','tooltip'); tooltip.hidden=true;
  document.body.appendChild(tooltip);
  let active=null, dismissTimer;
  function hide() {
    clearTimeout(dismissTimer);
    if (active) active.removeAttribute('aria-describedby');
    active=null; tooltip.hidden=true;
  }
  function show(target) {
    if (!target) return;
    hide(); active=target;
    tooltip.textContent=target.dataset.tooltip;
    target.setAttribute('aria-describedby',tooltip.id);
    tooltip.hidden=false;
    const anchor=target.getBoundingClientRect(), box=tooltip.getBoundingClientRect();
    tooltip.style.left=Math.max(8,Math.min(innerWidth-box.width-8,anchor.left+(anchor.width-box.width)/2))+'px';
    const above=anchor.top-box.height-9;
    tooltip.style.top=(above>=8?above:Math.max(8,Math.min(innerHeight-box.height-8,anchor.bottom+9)))+'px';
  }
  const trigger=target=>target instanceof Element?target.closest('.stat[data-tooltip]'):null;
  document.addEventListener('pointerover',event=>{
    if (tooltip.contains(event.target)) { clearTimeout(dismissTimer); return; }
    const target=trigger(event.target);
    if (target && target!==active) show(target);
    else if (target) clearTimeout(dismissTimer);
  });
  document.addEventListener('pointerout',event=>{
    if (!active || active.contains(event.relatedTarget) || tooltip.contains(event.relatedTarget)) return;
    if (active.contains(event.target) || tooltip.contains(event.target)) dismissTimer=setTimeout(hide,150);
  });
  document.addEventListener('focusin',event=>show(trigger(event.target)));
  document.addEventListener('focusout',event=>{ if (event.target===active) hide(); });
  document.addEventListener('click',event=>{
    const target=trigger(event.target);
    if (target) show(target);
    else if (!tooltip.contains(event.target)) hide();
  });
  document.addEventListener('keydown',event=>{ if (event.key==='Escape') hide(); });
  document.addEventListener('scroll',()=>{
    if (active && document.activeElement===active) {
      const box=active.getBoundingClientRect();
      if (box.bottom>0 && box.top<innerHeight) { show(active); return; }
    }
    hide();
  },true);
  window.addEventListener('resize',hide);
  new MutationObserver(()=>{ if (active && (!active.isConnected || active.closest('[hidden]'))) hide(); })
    .observe(document.getElementById('results'),{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
}
function lesson(title, formula, note) {
  return '<article class="lesson"><h3>'+title+'</h3><code>'+formula+'</code><p>'+note+'</p></article>';
}
function rangeDiagram(s) {
  const start='<svg class="teaching-svg range-svg" viewBox="0 0 800 156" role="img" aria-labelledby="range-svg-title"><title id="range-svg-title">Address block '+numToIP(s.network)+'/'+s.prefix+', from '+numToIP(s.network)+' to '+numToIP(s.end)+': '+fmt(s.usable)+' usable addresses</title>'+
    '<text x="400" y="19" text-anchor="middle" class="svg-label">Entire <tspan class="svg-prefix">/'+s.prefix+'</tspan> block · '+fmt(s.size)+' total address'+(s.size===1?'':'es')+'</text>'+
    '<path d="M24 30H776M24 26V34M776 26V34" fill="none" stroke="#52677c" stroke-width="1"/>';
  if (s.prefix===32) {
    return start+
      '<rect x="24" y="42" width="752" height="58" rx="8" fill="#e8f5ef" stroke="#7bc7aa"/>'+
      '<text x="400" y="65" text-anchor="middle" class="svg-label">Single host · 1 usable address</text>'+
      '<text x="400" y="86" text-anchor="middle" class="svg-ip">'+numToIP(s.ip)+'</text>'+
      '<text x="400" y="126" text-anchor="middle" class="svg-note">First and last are the same address. No reserved network or broadcast address.</text></svg>';
  }
  if (s.prefix===31) {
    return start+
      '<rect x="24" y="42" width="372" height="58" rx="8" fill="#e8f5ef" stroke="#7bc7aa"/>'+
      '<rect x="404" y="42" width="372" height="58" rx="8" fill="#e8f5ef" stroke="#7bc7aa"/>'+
      '<text x="210" y="65" text-anchor="middle" class="svg-label">First endpoint · usable</text>'+
      '<text x="590" y="65" text-anchor="middle" class="svg-label">Second endpoint · usable</text>'+
      '<text x="210" y="86" text-anchor="middle" class="svg-ip">'+numToIP(s.first)+'</text>'+
      '<text x="590" y="86" text-anchor="middle" class="svg-ip">'+numToIP(s.last)+'</text>'+
      '<text x="400" y="126" text-anchor="middle" class="svg-note">Two adjacent addresses in one point-to-point block. Both are usable.</text></svg>';
  }
  return start+
    '<rect x="24" y="42" width="160" height="58" rx="8" fill="#eaf3fa" stroke="#88b5dc"/>'+
    '<rect x="192" y="42" width="416" height="58" rx="8" fill="#e8f5ef" stroke="#7bc7aa"/>'+
    '<rect x="616" y="42" width="160" height="58" rx="8" fill="#fff0d4" stroke="#d7b16d"/>'+
    '<text x="104" y="59" text-anchor="middle" class="svg-label">Network</text>'+
    '<text x="104" y="75" text-anchor="middle" class="svg-note">1 reserved address</text>'+
    '<text x="104" y="91" text-anchor="middle" class="svg-ip">'+numToIP(s.network)+'</text>'+
    '<text x="400" y="60" text-anchor="middle" class="svg-label">'+fmt(s.usable)+' usable addresses</text>'+
    '<text x="204" y="76" class="svg-note">First usable</text>'+
    '<text x="596" y="76" text-anchor="end" class="svg-note">Last usable</text>'+
    '<text x="204" y="92" class="svg-ip">'+numToIP(s.first)+'</text>'+
    '<text x="596" y="92" text-anchor="end" class="svg-ip">'+numToIP(s.last)+'</text>'+
    '<text x="696" y="59" text-anchor="middle" class="svg-label">Broadcast</text>'+
    '<text x="696" y="75" text-anchor="middle" class="svg-note">1 reserved address</text>'+
    '<text x="696" y="91" text-anchor="middle" class="svg-ip">'+numToIP(s.end)+'</text>'+
    '<path d="M192 112H608M192 108V116M608 108V116" fill="none" stroke="#216c60" stroke-width="1"/>'+
    '<text x="400" y="130" text-anchor="middle" class="svg-note">Usable address span · includes both ends</text>'+
    '<text x="400" y="149" text-anchor="middle" class="svg-note">Lowest to highest. Cell widths are schematic, not proportional.</text></svg>';
}
function comparisonDiagram(s, other) {
  const same=s.network===other.network;
  const card=(x,title,address,network)=>'<g><rect x="'+x+'" y="4" width="260" height="100" rx="8" fill="#eaf3fa" stroke="#b6c8d6"/>'+
    '<text x="'+(x+14)+'" y="23" class="svg-label">'+title+'</text>'+
    '<text x="'+(x+14)+'" y="44" class="svg-note">IP address</text><text x="'+(x+246)+'" y="44" text-anchor="end" class="svg-ip">'+numToIP(address)+'</text>'+
    '<text x="'+(x+14)+'" y="64" class="svg-note">Mask</text><text x="'+(x+246)+'" y="64" text-anchor="end" class="svg-ip">'+numToIP(s.mask)+'</text>'+
    '<path d="M'+(x+14)+' 73H'+(x+246)+'" stroke="#b6c8d6"/>'+
    '<text x="'+(x+14)+'" y="94" class="svg-note">Network</text><text x="'+(x+246)+'" y="94" text-anchor="end" class="svg-ip svg-network-result">'+numToIP(network)+'</text></g>';
  return '<svg class="teaching-svg comparison-svg" viewBox="0 0 800 110" role="img" aria-labelledby="compare-svg-title"><title id="compare-svg-title">Both addresses use mask '+numToIP(s.mask)+' and produce '+(same?'matching':'different')+' network addresses</title>'+
    card(16,'Original address',s.ip,s.network)+card(524,'Compare address',other.ip,other.network)+
    '<path d="M276 54H292M508 54H524" stroke="#4d88bd" stroke-width="1.5"/>'+
    '<rect x="292" y="32" width="216" height="44" rx="8" fill="'+(same?'#e8f5ef':'#fff0d4')+'" stroke="'+(same?'#7bc7aa':'#e9b65c')+'"/>'+
    '<text x="400" y="50" text-anchor="middle" class="svg-label">'+(same?'= Same subnet':'&#8800; Different subnets')+'</text>'+
    '<text x="400" y="67" text-anchor="middle" class="svg-note">Compare the network results</text></svg>';
}
function setExample(index) {
  const [ip,prefix] = examples[index];
  $('ip-input').value=addressMode==='binary'?binaryIP(parseIP(ip)):ip; $('prefix').value=prefix;
  $('sub-prefix').value=Math.min(32,prefix+4);
  update(); setComparison(false);
}
function resetTool() {
  setAddressMode('decimal');
  $('cmp-ip').value='192.168.1.100'; $('sub-prefix').value=28;
  $('ip-input').value=examples[0][0]; $('prefix').value=24; update();
}
function update() {
  const prefix=Number($('prefix').value), octets=readAddress();
  const decimalAddress=octets?octets.join('.'):'';
  $('ip-conversion').hidden=addressMode!=='binary' || !octets;
  $('ip-conversion').textContent=octets?'Decimal IPv4: '+decimalAddress:'';
  $('prefix-val').textContent='/'+prefix;
  $('ip-input').setAttribute('aria-invalid',String(!octets));
  $('error').textContent=octets?'':addressMode==='binary'?'Enter exactly 32 bits (0 or 1), together or in four 8-bit groups.':'Enter four whole numbers from 0 to 255, separated by dots.';
  $('results').hidden=!octets;
  document.querySelectorAll('[data-example]').forEach(button=>{
    const example=examples[Number(button.dataset.example)];
    button.setAttribute('aria-pressed',String(example[0]===decimalAddress && example[1]===prefix));
  });
  const selectedExample=examples.findIndex(([ip,p])=>ip===decimalAddress && p===prefix);
  if (!octets) {
    current=null;
    $('example-context').innerHTML='<h3>Your network</h3><p>Enter a valid IPv4 address or select an example to see its network explained.</p>';
    return;
  }
  current=subnet(ipToNum(octets),prefix);
  renderNetworkContext(current,selectedExample);
  const s=current, net=numToIP(s.network), mask=numToIP(s.mask);
  $('address-octets').innerHTML=octets.map((octet,index)=>{
    const bits=octet.toString(2).padStart(8,'0');
    return '<div class="address-octet" role="group" aria-label="Octet '+(index+1)+': '+bits+' equals '+octet+'"><div class="octet-positions" aria-hidden="true">'+
      [...bits].map((_,bit)=>'<span>'+(index*8+bit+1)+'</span>').join('')+'</div><div class="octet-bits" aria-hidden="true">'+
      [...bits].map(bit=>'<span class="bit-cell">'+bit+'</span>').join('')+'</div><div class="octet-decimal">Octet '+(index+1)+' <strong>'+octet+'</strong></div></div>';
  }).join('');
  renderCidrTopology(s);
  const weights=[128,64,32,16,8,4,2,1];
  const octetTerms=weights.filter(weight=>octets[0]&weight);
  $('binary-foundations').innerHTML=lesson('Interpret the bits','4 octets × 8 bits = 32 bits',
    'Each bit is 0 or 1. Within each octet, place values are 128, 64, 32, 16, 8, 4, 2, 1. Add the values where the bit is 1: the first octet '+octets[0].toString(2).padStart(8,'0')+' means '+(octetTerms.join(' + ')||'0')+' = '+octets[0]+'.');
  $('prefix-foundations').innerHTML=lesson('Interpret the prefix','32 − <mark class="prefix-value" title="Prefix length: network bits">'+prefix+'</mark> = '+s.hostBits+' host bits',
    '/'+prefix+' fixes the first '+prefix+' network bits. Each remaining bit has two choices, so '+s.hostBits+' host bits give 2^'+s.hostBits+' = '+fmt(s.size)+' combinations. '+(s.hostBits===0?'With no bits left to vary, there is one address.':'For example, two free bits give 00, 01, 10, 11: 2 × 2 = 4 combinations.'));
  $('prefix-foundations').querySelector('.lesson').insertAdjacentHTML('beforeend','<div class="bit-line bit-allocation"><span id="bar-net"></span><span id="bar-host"></span></div>');
  $('cidr').textContent=net+'/'+prefix;
  $('binary-workbench').innerHTML=bitRow('Bit position',0,prefix,{ruler:true})+
    bitRow('IP address',s.ip,prefix,{id:'bits'})+
    bitRow('Mask',s.mask,prefix,{id:'mask-bits'})+
    '<div class="and-divider"><span>AND</span></div>'+
    bitRow('= Network',s.network,prefix,{result:true});
  $('bar-net').hidden=prefix===0;
  $('bar-net').style.gridColumn='2 / span '+Math.max(1,prefix);
  $('bar-host').hidden=s.hostBits===0;
  $('bar-host').style.gridColumn=(prefix+2)+' / span '+Math.max(1,s.hostBits);
  $('bar-host').style.marginLeft=prefix>0 && prefix%8===0?'4px':'0';
  $('bar-net').textContent=prefix>=6?prefix+' network bits':prefix;
  $('bar-net').title=prefix+' network bits';
  $('bar-host').textContent=s.hostBits>=6?s.hostBits+' host bits':s.hostBits;
  $('bar-host').title=s.hostBits+' host bits';
  $('stats').innerHTML=[
    stat('Block size',fmt(s.size),'2^'+s.hostBits+' = '+fmt(s.size)+' addresses (32 − '+prefix+' = '+s.hostBits+' host bits).'),
    stat('Broadcast address',s.broadcast===null?'None':numToIP(s.broadcast),prefix<31?'Last address; all host bits are 1.':'No subnet broadcast for /'+prefix+'.'),
    stat('Subnet mask',mask,prefix+' leading 1s, then '+s.hostBits+' zeros.')
  ].join('');
  $('range-diagram').innerHTML=rangeDiagram(s);

  updateComparison(); updateSubdivide();
}
function setComparison(different) {
  if (!current) return;
  const s=current;
  if (different && s.prefix===0) {
    $('cmp-ip').value='255.255.255.255'; updateComparison(); return;
  }
  $('cmp-ip').value=numToIP(different ? (s.network+s.size) % (2**32) : (s.ip===s.first?s.last:s.first));
  updateComparison();
}
function updateComparison() {
  if (!current) return;
  const octets=parseIP($('cmp-ip').value), empty=!$('cmp-ip').value.trim();
  $('cmp-ip').setAttribute('aria-invalid',String(!octets && !empty));
  $('cmp-error').textContent=octets?'':empty?'Enter a second IPv4 address to compare.':'Enter four whole numbers from 0 to 255, separated by dots.';
  if (!octets) { $('cmp-result').innerHTML=''; $('cmp-math').innerHTML=''; $('compare-diagram').innerHTML=''; return; }
  const s=current, other=subnet(ipToNum(octets),s.prefix), same=s.network===other.network;
  const differences=Array.from({length:s.prefix},(_,i)=>i)
    .filter(i=>((s.ip >>> (31-i)) & 1)!==((other.ip >>> (31-i)) & 1));
  const hostDifferences=Array.from({length:32-s.prefix},(_,i)=>i+s.prefix)
    .filter(i=>((s.ip >>> (31-i)) & 1)!==((other.ip >>> (31-i)) & 1));
  const firstDifference=differences[0];
  const why=same
    ? '<strong>All '+s.prefix+' network bits match.</strong> '+(hostDifferences.length
      ? hostDifferences.length+' host bit(s) differ, but AND with the mask turns those host bits into 0. They do not change subnet membership.'
      : 'Both entered addresses are identical.')
    : '<strong>'+differences.length+' network bit(s) differ: '+differences.map(i=>i+1).join(', ')+'.</strong> '+
      'First mismatch: bit '+(firstDifference+1)+' (octet '+(Math.floor(firstDifference/8)+1)+') is '+
      ((s.ip >>> (31-firstDifference)) & 1)+' in the original IP and '+((other.ip >>> (31-firstDifference)) & 1)+
      ' in the compare IP. The mask is 1 here, so this difference survives AND and produces different networks.';
  $('compare-diagram').innerHTML=comparisonDiagram(s,other);
  const warnings=s.prefix<31?[s,other].filter((v,i,all)=>all.findIndex(x=>x.ip===v.ip)===i).filter(v=>v.ip===v.network||v.ip===v.end).map(v=>'<p><strong>'+numToIP(v.ip)+'</strong> is the '+(v.ip===v.network?'network':'broadcast')+' address of '+numToIP(v.network)+'/'+v.prefix+'. It cannot be assigned to a host.</p>').join(''):'';
  $('cmp-result').innerHTML='<div class="verdict'+(same?'':' diff')+'"><strong>'+(same?'Same subnet':'Different subnets')+'</strong><p>Using /'+s.prefix+' (mask '+numToIP(s.mask)+'), the network addresses '+(same?'match.':'differ. Traffic between usable hosts in these subnets requires a router.')+'</p>'+
    (warnings?'<div class="difference-explanation"><strong>Reserved address</strong>'+warnings+'</div>':'')+
    (s.prefix===0?'<p>Every IPv4 address matches /0; there is no different-subnet example at this prefix.</p>':'')+
    '<p class="difference-explanation">'+why+'</p></div>';
  $('cmp-math').innerHTML=bitRow('Bit position',0,s.prefix,{ruler:true,differences})+
    bitRow('Original IP',s.ip,s.prefix,{differences})+
    bitRow('Compare IP',other.ip,s.prefix,{differences})+bitRow('Mask',s.mask,s.prefix)+
    bitRow('= Compare network',other.network,s.prefix,{result:true,differences})+
    bitRow('Original network',s.network,s.prefix,{differences})+
    '<p class="difference-key">'+(same?'No highlighted network bits: the subnet matches.':
      '<span aria-hidden="true">≠</span> Outlined rose cells mark differing network bits in both IPs and both results. The matching bit positions are highlighted above. Host bits do not determine subnet membership.')+'</p>';
}
function updateSubdivide(reset=true) {
  if (!current) return;
  const s=current, slider=$('sub-prefix');
  if (reset) { subnetPage=0; selectedSubnet=0; }
  slider.disabled=s.prefix===32;
  slider.min=Math.min(32,s.prefix+1); slider.max=32;
  const child=Math.min(32,Math.max(s.prefix+1,Number(slider.value)));
  slider.value=child; $('sub-prefix-lbl').textContent='/'+child;
  const count=2**(child-s.prefix), size=2**(32-child);
  $('sub-summary').innerHTML=s.prefix===32?'A /32 contains one address and cannot be subdivided. The table shows that single host route.':
    '<strong>'+numToIP(s.network)+'/'+s.prefix+' → '+fmt(count)+' equal /'+child+' blocks</strong> · '+fmt(size)+' addresses each'+
    (child===31?' /31 children use the point-to-point convention.':child===32?' /32 children are single host routes.':'');
  const start=subnetPage*pageSize, stop=Math.min(count,start+pageSize);
  selectedSubnet=Math.max(start,Math.min(stop-1,selectedSubnet));
  const borrowed=child-s.prefix, hostBits=32-child, usable=child<31?size-2:size;
  $('sub-lessons').innerHTML=s.prefix===32
    ? lesson('One address is already the smallest block','/32 = 1 address','There are no host bits left to borrow, so no smaller IPv4 block can be created.')
    : [
      lesson('Count the child subnets',child+' − '+s.prefix+' = '+borrowed+' borrowed bits',
        'The child prefix adds '+borrowed+' network bit(s) to the parent. Each borrowed bit can be 0 or 1: <strong>2^'+borrowed+' = '+fmt(count)+' child blocks.</strong> The amber cells below show those binary IDs.'),
      lesson('Count addresses per child','32 − '+child+' = '+hostBits+' host bits',
        'The green bits still vary: <strong>2^'+hostBits+' = '+fmt(size)+' addresses per child.</strong> '+(child<31?fmt(size)+' − 1 network − 1 broadcast = '+fmt(usable)+' usable.':child===31?'Both addresses are usable on a /31 point-to-point link; do not subtract 2.':'Zero variable bits give one address, not zero. A /32 reserves no separate broadcast.')),
      lesson('Sanity check',fmt(count)+' × '+fmt(size)+' = '+fmt(s.size),
        'Child blocks × addresses per child. The parent has 32 − '+s.prefix+' = '+s.hostBits+' host bits: <strong>2^'+s.hostBits+' = '+fmt(s.size)+' addresses.</strong> Splitting redistributes those addresses; it does not create more.')
    ].join('');
  $('sub-parent').innerHTML='<strong>Parent '+numToIP(s.network)+'/'+s.prefix+'</strong><span>'+fmt(s.size)+' total addresses</span>';
  $('sub-map').innerHTML=subdivisionDiagram(s,child,start,stop,selectedSubnet);
  $('sub-children').style.gridTemplateColumns='repeat('+(stop-start)+', minmax(54px, 1fr))';
  $('sub-endpoints').innerHTML='<code>'+numToIP(s.network+start*size)+'</code><span>Lowest to highest address</span><code>'+numToIP(s.network+stop*size-1)+'</code>';
  $('sub-select-note').hidden=s.prefix===32;
  $('sub-children').innerHTML=s.prefix===32?'':Array.from({length:stop-start},(_,offset)=>{
    const index=start+offset, address=s.network+index*size, id=index.toString(2).padStart(borrowed,'0');
    return '<button class="subnet-child" aria-label="Block '+fmt(index+1)+': '+numToIP(address)+'/'+child+', borrowed bits '+id+'" aria-pressed="'+(index===selectedSubnet)+'" onclick="selectSubnet('+index+')">'+
      '<span>Block '+fmt(index+1)+'</span><code class="borrowed-id" aria-hidden="true">'+Array.from(id,bit=>'<span class="bit-cell borrowed">'+bit+'</span>').join('')+'</code></button>';
  }).join('');
  const selected=subnet(s.network+selectedSubnet*size,child);
  const binaryId=selectedSubnet.toString(2).padStart(borrowed,'0');
  $('sub-selected').innerHTML=s.prefix===32?'<p>This single host route has no borrowed bits.</p>':
    '<div class="selected-block-heading"><strong>Block '+fmt(selectedSubnet+1)+': '+numToIP(selected.network)+'/'+child+'</strong></div>'+
    '<p class="selected-block-range"><strong>Address range</strong> <code>'+numToIP(selected.network)+' &ndash; '+numToIP(selected.end)+'</code></p>'+
    '<dl class="selected-block-steps">'+
    '<div><dt>1. Block index</dt><dd><code><span class="borrowed-index">'+binaryId+'</span> = '+fmt(selectedSubnet)+'</code><small>Counting starts at 0.</small></dd></div>'+
    '<div><dt>2. Address offset</dt><dd><code>'+fmt(selectedSubnet)+' &times; '+fmt(size)+' = '+fmt(selectedSubnet*size)+'</code><small>Block index &times; addresses per block.</small></dd></div>'+
    '<div><dt>3. First address</dt><dd><code>'+numToIP(s.network)+' + '+fmt(selectedSubnet*size)+' = '+numToIP(selected.network)+'</code></dd></div>'+
    '<div><dt>4. Last address</dt><dd><code>'+numToIP(selected.network)+' + ('+fmt(size)+' &minus; 1) = '+numToIP(selected.end)+'</code></dd></div></dl>';
  $('sub-selected').innerHTML+='<div class="selected-block-notes"><p><strong>Aggregate</strong> The complete, aligned set combines into <code>'+numToIP(s.network)+'/'+s.prefix+'</code>. All children share '+s.prefix+' network bits.</p>'+
    (s.prefix<31 && child<31?'<p><strong>Usable addresses</strong> '+fmt(count)+' &times; '+fmt(usable)+' = <strong>'+fmt(count*usable)+'</strong> (previously '+fmt(s.usable)+'). Each child reserves a network and broadcast address; the total address count stays the same.</p>':'')+'</div>';
  $('sub-caption').textContent='Blocks '+fmt(start+1)+'–'+fmt(stop)+' of '+fmt(count)+'. All address details are shown in each row.';
  $('sub-bits').innerHTML=bitRow('Selected child',selected.network,s.prefix,{childPrefix:child});
  let rows='';
  for(let i=start;i<stop;i++) {
    const block=subnet(s.network+i*size,child);
    rows+='<tr'+(i===selectedSubnet?' class="selected-child-row"':'')+'><th scope="row">'+numToIP(block.network)+'/'+child+'</th><td>'+numToIP(block.first)+'</td><td>'+numToIP(block.last)+'</td><td>'+(block.broadcast===null?'None':numToIP(block.broadcast))+'</td><td>'+fmt(block.usable)+'</td></tr>';
  }
  $('sub-rows').innerHTML=rows;
  $('sub-page').textContent='Page '+fmt(subnetPage+1)+' of '+fmt(Math.ceil(count/pageSize));
  $('sub-prev').disabled=subnetPage===0; $('sub-next').disabled=stop>=count;
}
function subdivisionDiagram(s,child,start,stop) {
  const count=2**(child-s.prefix), visible=stop-start;
  return '<div class="span-caption">'+(count===visible?'Full span · '+fmt(count)+' equal block(s)':'Page excerpt: blocks '+fmt(start+1)+'–'+fmt(stop)+' of '+fmt(count))+'</div>';
}
function selectSubnet(index) {
  selectedSubnet=index;
  updateSubdivide(false);
  const button=document.querySelector('.subnet-child[aria-pressed="true"]');
  if (button) button.focus({preventScroll:true});
}
function changeSubnetPage(direction) {
  if (!current) return;
  const count=2**(Number($('sub-prefix').value)-current.prefix);
  subnetPage=Math.max(0,Math.min(Math.ceil(count/pageSize)-1,subnetPage+direction));
  selectedSubnet=subnetPage*pageSize;
  updateSubdivide(false);
}
if (typeof module !== 'undefined') module.exports={parseIP,parseBinaryIP,ipToNum,numToIP,mkMask,subnet};
if (typeof document !== 'undefined') {
  const params=new URLSearchParams(location.search),incomingIP=parseIP(params.get('ip')||''),incomingMask=parseIP(params.get('mask')||'');
  if(incomingIP&&incomingMask){const mask=ipToNum(incomingMask),prefix=Array.from({length:33},(_,i)=>i).find(p=>mkMask(p)===mask);if(prefix!==undefined){$('ip-input').value=incomingIP.join('.');$('prefix').value=prefix;}}
  update();
  initStatTooltips();
  const stickyNav=document.querySelector('.section-nav');
  const compactTitle=stickyNav.querySelector('.compact-title');
  if (typeof IntersectionObserver !== 'undefined') {
    new IntersectionObserver(([entry]) => {
      compactTitle.hidden=entry.isIntersecting || entry.boundingClientRect.top>=0;
    }).observe(document.querySelector('h1'));
  }
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      document.documentElement.style.setProperty('--nav-height',stickyNav.offsetHeight+'px');
    }).observe(stickyNav);
  }
}
