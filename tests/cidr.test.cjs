const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require('../tools/llm-tokenizer/node_modules/jsdom');
const C = require('../assets/js/cidr-explorer.js');
const ip = value => C.ipToNum(C.parseIP(value));
const root = path.join(__dirname, '..');

test('binary IPv4 requires 32 bits and converts unsigned extremes and grouped octets', () => {
  for (const separator of ['', '.', ' ', '\n'])
    assert.deepEqual(C.parseBinaryIP(['11000000','10101000','00000001','00111001'].join(separator)), [192,168,1,57]);
  assert.deepEqual(C.parseBinaryIP('0'.repeat(32)), [0,0,0,0]);
  assert.deepEqual(C.parseBinaryIP('1'.repeat(32)), [255,255,255,255]);
  for (const value of ['', '1'.repeat(31), '1'.repeat(33), '2'.repeat(32), '192.168.1.57', '1.0.0.1', '00000000..00000000.00000000.00000000'])
    assert.equal(C.parseBinaryIP(value), null, value);
});

test('binary input updates calculations, validates edits, preserves examples and round trips', () => {
  const dom=app(), w=dom.window, get=id=>w.document.getElementById(id);
  get('ip-binary').click();
  assert.equal(get('ip-input').value,'11000000 10101000 00000001 00111001');
  assert.equal(get('ip-conversion').textContent,'Decimal IPv4: 192.168.1.57');
  get('ip-input').value='10101100000100000010001100101010'; w.update();
  assert.equal(get('cidr').textContent,'172.16.35.0/24');
  assert.match(get('calculation-note').textContent,/172.16.35.42 AND/);
  get('ip-decimal').click();
  assert.equal(get('ip-input').value,'172.16.35.42');
  get('ip-binary').click();
  get('ip-input').value='101'; w.update();
  assert.equal(get('results').hidden,true);
  assert.equal(get('ip-conversion').hidden,true);
  assert.match(get('error').textContent,/32 bits/);
  w.setExample(4);
  assert.equal(get('results').hidden,false);
  assert.equal(get('ip-conversion').textContent,'Decimal IPv4: 10.0.0.10');
  assert.equal(get('cidr').textContent,'10.0.0.10/31');
  w.resetTool();
  assert.equal(get('ip-input').value,'192.168.1.57');
  assert.equal(get('ip-decimal').getAttribute('aria-pressed'),'true');
  dom.window.close();
});

test('rejects malformed octets rather than silently coercing input', () => {
  for (const value of ['1..2.3', '1.2.3.', '1.2.3.256', '1.2.3.-1', '1.2.3.1e2', '0x10.0.0.1', '1.2.3.4.5', '<img>'])
    assert.equal(C.parseIP(value), null, value);
  assert.deepEqual(C.parseIP(' 255.0.128.1 '), [255,0,128,1]);
});
test('all prefixes match arithmetic block boundaries, including unsigned IPv4 extremes', () => {
  for(let prefix=0;prefix<=32;prefix++) {
    for(const address of [0,1,0x7fffffff,0x80000000,ip('172.16.35.42'),0xfffffffe,0xffffffff]) {
      const s=C.subnet(address,prefix), size=2**(32-prefix);
      const expected=Math.floor(address/size)*size;
      assert.equal(s.network,expected);
      assert.equal(s.end,expected+size-1);
      assert.equal(s.last-s.first+1,s.usable);
      assert.equal(C.numToIP(ip(C.numToIP(address))),C.numToIP(address));
    }
  }
});
test('/20 total size and /31, /32 endpoint conventions', () => {
  const split=C.subnet(ip('172.16.35.42'),20);
  assert.equal(split.size,4096);
  assert.equal(C.numToIP(split.network),'172.16.32.0');
  assert.equal(C.numToIP(split.broadcast),'172.16.47.255');
  const link=C.subnet(ip('10.0.0.11'),31);
  assert.equal(C.numToIP(link.first),'10.0.0.10');
  assert.equal(C.numToIP(link.last),'10.0.0.11');
  assert.equal(link.usable,2); assert.equal(link.broadcast,null);
  const host=C.subnet(ip('255.255.255.255'),32);
  assert.equal(host.first,host.last); assert.equal(host.usable,1); assert.equal(host.broadcast,null);
});
function app() {
  const dom=new JSDOM(fs.readFileSync(path.join(root,'cs339/cidr_viz.html'),'utf8'),{runScripts:'dangerously'});
  for(const script of ['network-explorer-subnets.js','cidr-topology.js','cidr-explorer.js','cidr-tour.js'])
    vm.runInContext(fs.readFileSync(path.join(root,'assets/js',script),'utf8'), dom.getInternalVMContext());
  return dom;
}
test('comparison highlights only mismatching network bits and clears highlights when prefix changes', () => {
  const dom=app(), w=dom.window, d=w.document, get=id=>d.getElementById(id);
  get('cmp-ip').value='192.168.2.0'; w.updateComparison();
  const highlighted=()=>[...d.querySelectorAll('#cmp-math .ruler .bit-difference')].map(el=>Number(el.textContent));
  assert.deepEqual(highlighted(),[23,24]);
  assert.equal(d.querySelectorAll('#cmp-math .bit-difference').length,10);
  assert.match(get('cmp-result').textContent,/First mismatch: bit 23 \(octet 3\) is 0.*compare IP/);
  get('prefix').value=22; w.update();
  assert.deepEqual(highlighted(),[]);
  assert.match(get('cmp-result').textContent,/host bit\(s\) differ/);
  get('prefix').value=0; w.update();
  assert.deepEqual(highlighted(),[]);
  get('prefix').value=32; w.update();
  assert.ok(highlighted().some(bit=>bit>24));
  get('cmp-ip').value=get('ip-input').value; w.updateComparison();
  assert.deepEqual(highlighted(),[]);
  assert.match(get('cmp-result').textContent,/addresses are identical/);
  dom.window.close();
});
test('summary tooltips describe all cards and support focus, Escape and replacement', async () => {
  const dom=app(), w=dom.window, d=w.document;
  const cards=[...d.querySelectorAll('.stat')], tip=d.getElementById('cidr-tooltip');
  assert.equal(cards.length,7);
  for (const card of cards) {
    assert.ok(card.dataset.tooltip.length>100);
    card.focus();
    assert.equal(tip.hidden,false);
    assert.equal(card.getAttribute('aria-describedby'),tip.id);
    assert.equal(tip.textContent,card.dataset.tooltip);
    d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));
    assert.equal(tip.hidden,true);
    assert.equal(card.hasAttribute('aria-describedby'),false);
  }
  cards[0].click(); assert.equal(tip.hidden,false);
  w.setExample(4);
  await Promise.resolve();
  assert.equal(tip.hidden,true);
  d.querySelector('.stat[aria-label^="First usable host:"]').focus();
  assert.match(tip.textContent,/Current value: 10.0.0.10/);
  dom.window.close();
});
test('presets update visible results; invalid input hides stale calculations and recovers', () => {
  const dom=app(), w=dom.window, d=w.document;
  const get=id=>d.getElementById(id);
  d.querySelector('[data-example="2"]').click();
  assert.equal(get('cidr').textContent,'172.16.32.0/20');
  assert.match(get('stats').textContent,/4,096/);
  assert.match(get('boundary-note').textContent,/increment: 16 in octet 3/);
  d.querySelector('[data-example="4"]').click();
  assert.match(get('stats').textContent,/10.0.0.10/);
  assert.match(get('range-diagram').textContent,/First endpoint/);
  assert.match(get('range-diagram').textContent,/Second endpoint/);
  d.querySelector('[data-example="5"]').click();
  assert.equal(get('sub-prefix').disabled,true);
  assert.equal(get('sub-rows').children.length,1);
  assert.match(get('sub-summary').textContent,/cannot be subdivided/);
  assert.match(get('range-diagram').textContent,/Single host/);
  get('ip-input').value='1..2.3';
  get('ip-input').dispatchEvent(new w.Event('input'));
  assert.equal(get('results').hidden,true);
  get('ip-input').value='10.0.0.1';
  get('ip-input').dispatchEvent(new w.Event('input'));
  assert.equal(get('results').hidden,false);
  dom.window.close();
});
test('comparison, aggregation paging and guided-tour keyboard behavior', () => {
  const dom=app(), w=dom.window, d=w.document, get=id=>d.getElementById(id);
  w.setComparison(true); assert.match(get('cmp-result').textContent,/Different subnets/);
  assert.match(get('compare-diagram').textContent,/Different subnets/);
  get('cmp-ip').value='bad'; w.updateComparison();
  assert.equal(get('cmp-math').textContent,''); assert.match(get('cmp-error').textContent,/four whole numbers/);
  assert.equal(get('compare-diagram').textContent,'');
  get('sub-prefix').value=30; w.updateSubdivide();
  assert.equal(get('sub-rows').children.length,16);
  get('sub-next').click(); assert.match(get('sub-rows').firstChild.textContent,/192.168.1.64\/30/);
  get('prefix').value=0; w.update(); w.setComparison(true);
  assert.match(get('cmp-result').textContent,/no different-subnet example/);
  get('sub-prefix').value=32; w.updateSubdivide();
  assert.equal(get('sub-rows').children.length,16);
  assert.match(get('sub-caption').textContent,/4,294,967,296/);
  get('tour-launch').click(); assert.equal(get('tour-panel').hidden,false);
  for(let i=0;i<11;i++)get('tour-next').click();
  assert.match(get('tour-step-lbl').textContent,/12 of 12/);
  d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));
  assert.equal(get('tour-panel').hidden,true);
  assert.equal(d.activeElement.id,'tour-launch');
  dom.window.close();
});
test('selecting child blocks connects binary IDs, ranges, and aggregation totals', () => {
  const dom=app(), w=dom.window, d=w.document, get=id=>d.getElementById(id);
  assert.equal(d.querySelectorAll('.subnet-child').length,16);
  d.querySelectorAll('.subnet-child')[5].click();
  assert.match(get('sub-selected').textContent,/192.168.1.80\/28/);
  assert.match(get('sub-selected').textContent,/0101/);
  assert.equal(get('sub-bits').querySelector('.decimal').textContent,'192.168.1.80');
  assert.match(get('sub-lessons').textContent,/16 × 16 = 256/);
  assert.match(get('sub-selected').textContent,/224 usable addresses/);
  assert.match(d.querySelector('.selected-child-row').textContent,/192.168.1.80\/28/);
  get('sub-prefix').value=30; w.updateSubdivide(); get('sub-next').click();
  assert.match(get('sub-map').textContent,/Page excerpt: blocks 17–32 of 64/);
  assert.match(get('sub-selected').textContent,/192.168.1.64\/30/);
  w.setExample(5);
  assert.equal(d.querySelectorAll('.subnet-child').length,0);
  assert.match(get('sub-lessons').textContent,/no host bits left/);
  dom.window.close();
});
test('topology follows every prefix with valid distinct hosts and interfaces', () => {
  const dom=app(), w=dom.window, get=id=>w.document.getElementById(id);
  for(const address of ['192.168.1.57','0.0.0.0','255.255.255.255']) {
    get('ip-input').value=address;
    for(let prefix=0;prefix<=32;prefix++) {
      get('prefix').value=prefix; w.update();
      const blocks=w.topologyBlocks(C.subnet(ip(address),prefix));
      assert.equal(blocks.length,prefix>0 && prefix<24?Math.min(3,2**(24-prefix)):Math.min(3,2**prefix));
      assert.equal(blocks.filter(b=>b.isCurrent).length,1);
      for(const b of blocks) {
        const addresses=b.gateway===null?b.hosts:[b.gateway,...b.hosts];
        assert.equal(new Set(addresses).size,addresses.length);
        for(const n of addresses) assert.ok(n>=b.first && n<=b.last);
        assert.equal(b.network % b.size,0);
        assert.ok(b.end<=0xffffffff);
      }
      if(prefix===31) assert.ok(blocks.every(b=>b.hosts.length===1));
      if(prefix===32) assert.ok(blocks.every(b=>b.gateway===null));
    }
  }
  get('ip-input').value='192.168.1.57';get('prefix').value=26;w.update();
  assert.match(get('cidr-topology').textContent,/192\.168\.1\.64\/26/);
  assert.match(get('cidr-topology').textContent,/192\.168\.1\.128\/26/);
  assert.equal(get('subnet-heading').closest('section').previousElementSibling.id,'topology');
  dom.window.close();
});
test('topology zoom limits, keyboard pan and Fit restore the compact host-route view', () => {
  const dom=app(), w=dom.window, get=id=>w.document.getElementById(id);
  get('prefix').value=32;w.update();
  assert.equal(get('cidr-topology').getAttribute('viewBox'),'0 0 940 240');
  get('topology-zoom').value=125; get('topology-zoom').dispatchEvent(new w.Event('input'));
  assert.equal(get('topology-zoom-level').textContent,'125%');
  assert.equal(get('cidr-topology').getAttribute('viewBox'),'94 24 752 192');
  get('cidr-topology').parentElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.notEqual(get('cidr-topology').getAttribute('viewBox'),'94 24 752 192');
  w.setCidrTopologyZoom(500);assert.equal(get('topology-zoom').value,'300');
  w.setCidrTopologyZoom(1);assert.equal(get('topology-zoom').value,'50');
  w.fitCidrTopology();assert.equal(get('cidr-topology').getAttribute('viewBox'),'0 0 940 240');
  get('prefix').value=26;w.update();
  assert.equal(get('cidr-topology').getAttribute('viewBox'),'0 0 940 620');
  assert.equal(get('topology-zoom-level').textContent,'100%');
  dom.window.close();
});
test('organization example explains the allocation and illustrates contained department subnets', () => {
  const dom=app(), w=dom.window, get=id=>w.document.getElementById(id);
  w.setExample(6);
  assert.match(get('example-context').textContent,/10\.20\.0\.0\/16/);
  assert.match(get('example-context').textContent,/256 separate \/24 subnets/);
  assert.match(get('example-context').textContent,/devices|Devices/);
  assert.match(get('topology-summary').textContent,/3 of 256/);
  assert.match(get('cidr-topology').textContent,/Faculty Department/);
  const blocks=w.topologyBlocks(C.subnet(ip('10.20.1.57'),16));
  for(const b of blocks) {assert.equal(b.prefix,24);assert.equal(C.numToIP(b.network).startsWith('10.20.'),true);}
  get('prefix').value=23;w.update();
  assert.match(get('topology-summary').textContent,/2 of 2/);
  assert.match(get('example-context').textContent,/Your current network/);
  get('ip-input').value='bad';w.update();
  assert.doesNotMatch(get('example-context').textContent,/10\.20/);
  w.setExample(5);assert.match(get('example-context').textContent,/no separate broadcast/);
  dom.window.close();
});
