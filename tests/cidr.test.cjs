const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require('../tools/llm-tokenizer/node_modules/jsdom');
const C = require('../assets/js/cidr-explorer.js');
const ip = value => C.ipToNum(C.parseIP(value));
const root = path.join(__dirname, '..');

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
  for(const script of ['cidr-explorer.js','cidr-tour.js'])
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
  assert.equal(cards.length,8);
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
  d.querySelectorAll('.stat')[2].focus();
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
