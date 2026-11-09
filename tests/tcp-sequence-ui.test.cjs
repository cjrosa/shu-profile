const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('bulk delivery handles both directions and keeps data separate from ACKs',()=>{
 const f=fixture(false);
 for(const id of ['deliver-all-data','reject-all-data','deliver-all-acks','reject-all-acks'])assert.equal(f.el(id).disabled,true);
 f.click('duplex');f.click('skip');f.click('A-submit');f.click('B-submit');
 f.click('A-send');f.click('A-send');f.click('B-send');f.click('deliver-all-data');
 assert.equal(f.el('data-cards').innerHTML,'');assert.equal(f.el('B-recv-bytes').textContent,'4 bytes');assert.equal(f.el('A-recv-bytes').textContent,'2 bytes');
 f.click('A-send');f.click('A-send-ack');f.click('B-send-ack');f.click('deliver-all-acks');
 assert.equal(f.el('ack-cards').innerHTML,'');assert.match(f.el('data-cards').innerHTML,/In transit/);
 assert.equal(f.el('A-send-bytes').textContent,'16 bytes');assert.equal(f.el('B-send-bytes').textContent,'10 bytes');assert.equal(f.el('deliver-all-acks').disabled,true);
});
test('bulk rejection simulates loss without discarding buffered or unacknowledged bytes',()=>{
 const f=fixture(false);f.click('skip');f.click('A-submit');f.click('A-send');f.click('deliver');f.click('B-send-ack');f.click('A-send');f.click('A-send');
 f.click('reject-all-data');assert.equal(f.el('data-cards').innerHTML,'');assert.match(f.el('ack-cards').innerHTML,/In transit/);assert.equal(f.el('B-recv-bytes').textContent,'2 bytes');
 f.click('reject-all-acks');assert.equal(f.el('ack-cards').innerHTML,'');assert.equal(f.el('A-send-bytes').textContent,'20 bytes');assert.match(f.el('packets').innerHTML,/lost/);
 assert.equal(f.el('reject-all-data').disabled,true);assert.equal(f.el('reject-all-acks').disabled,true);assert.equal(f.el('error').textContent,'');
});
function fixture(legacy=true){
 const elements=new Map(),timers=new Map(),listeners={};let timer=0;
 function el(id){if(!elements.has(id)){let html='';const e={value:'',textContent:'',style:{setProperty(k,v){this[k]=v;}},attrs:{},disabled:false,hidden:false,checked:false,open:false,showModal(){this.open=true;},close(){this.open=false;},scrollLeft:0,clientWidth:700,scrollHeight:100,offsetTop:0,addEventListener(k,f){this['on'+k]=f;},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},focus(){this.focused=true;},scrollTo(){},closest(){return el('log-scroll');},querySelector(){return null;}};Object.defineProperty(e,'innerHTML',{get:()=>html,set:v=>{html=v;for(const m of v.matchAll(/<input id="([^"]+)"[^>]*value="([^"]+)"/g))el(m[1]).value=m[2];const option=v.match(/<option value="([^"]*)"/);if(option)e.value=option[1];}});elements.set(id,e);}return elements.get(id);}
 el('speed').value='1000';
 const context={window:{TCPSequence:require('../assets/js/tcp-sequence-engine.js')},document:{getElementById:el,querySelector:()=>el('log-scroll'),addEventListener(k,f){listeners[k]=f;}},matchMedia:()=>({matches:true}),setInterval:f=>{timers.set(++timer,f);return timer;},clearInterval:id=>timers.delete(id)};
 for(const name of ['scenarios','', 'tabs'])vm.runInNewContext(fs.readFileSync('assets/js/tcp-sequence'+(name?'-'+name:'')+'.js','utf8'),context);
 if(legacy){el('cfg-mss').value='4';el('cfg-mssB').value='6';el('cfg-mss').onchange();}
 return {el,timers,listeners,click:id=>{assert.equal(el(id).disabled,false,'enabled: '+id);el(id).onclick();},tick:()=>[...timers.values()][0]?.()};
}
test('UI readings and controls wait for connection, then application submission precedes TCP send',()=>{const f=fixture();assert.equal(f.el('step').disabled,true);assert.equal(f.el('A-send-visual').hidden,true);f.click('connect');assert.equal(f.el('step').disabled,false);f.click('step');assert.equal(f.el('B-receive-visual').hidden,true);f.click('step');assert.equal(f.el('A-send-visual').hidden,false);assert.equal(f.el('A-send').disabled,true);f.click('A-submit');assert.equal(f.el('A-send').disabled,false);assert.match(f.el('A-submitted').textContent,/20 bytes submitted/);});
test('delivery updates one packet arrow, buffers unread bytes, and ACK does not imply application read',()=>{const f=fixture();f.click('skip');f.click('A-submit');f.click('A-send');const packets=(f.el('packets').innerHTML.match(/data-packet=/g)||[]).length;f.click('deliver');assert.equal((f.el('packets').innerHTML.match(/data-packet=/g)||[]).length,packets);assert.match(f.el('packets').innerHTML,/received at TCP/);assert.equal(f.el('B-recv-bytes').textContent,'4 bytes');assert.equal(f.el('B-readings').textContent,'0 bytes read');assert.equal(f.el('ack-cards').innerHTML,'');f.click('B-send-ack');f.click('deliver-ack');assert.equal(f.el('B-recv-bytes').textContent,'4 bytes');assert.equal(f.el('B-readings').textContent,'0 bytes read');f.click('B-read');assert.equal(f.el('B-recv-bytes').textContent,'0 bytes');assert.equal(f.el('B-readings').textContent,'4 bytes read');assert.match(f.el('explanation').textContent,/RCV.NXT stays 46/);});
test('full-duplex toggle exposes independent windows and requires reset while active',()=>{const f=fixture();assert.equal(f.el('B-sender').hidden,true);assert.equal(f.el('A-receiver').hidden,true);f.click('duplex');assert.equal(f.el('B-sender').hidden,false);assert.equal(f.el('A-receiver').hidden,false);f.click('skip');assert.equal(f.el('duplex').disabled,true);f.click('reset');assert.equal(f.el('duplex').disabled,false);f.click('duplex');assert.equal(f.el('B-sender').hidden,true);});
test('all ten scenarios load with valid UI and packet-loss recovery retains state',()=>{const f=fixture();for(let i=0;i<10;i++){f.el('preset').value=String(i);f.click('load');assert.equal(f.el('error').textContent,'');}f.el('preset').value='6';f.click('load');assert.match(f.el('A-send-cells').innerHTML,/missing/);f.click('auto');for(let i=0;i<100;i++){if(!f.timers.size){f.click('B-send-ack');f.click('auto');}f.tick();if(f.el('status').textContent==='All data acknowledged')break;}assert.equal(f.el('status').textContent,'All data acknowledged');assert.equal(f.el('B-recv-bytes').textContent,'12 bytes');assert.equal(f.el('B-readings').textContent,'0 bytes read');});
test('piggyback preset creates data with ACK for opposite stream',()=>{const f=fixture();f.el('preset').value='9';f.click('load');f.click('B-send');assert.match(f.el('packets').innerHTML,/SEQ=79.*ACK=46.*LEN=6/);assert.match(f.el('packets').innerHTML,/piggybacked ACK/);});
test('invalid settings block actions; correcting input resets cleanly',()=>{const f=fixture();f.el('cfg-mss').value='0';f.el('cfg-mss').onchange();assert.match(f.el('error').textContent,/integer/);f.el('cfg-mss').value='2';f.el('cfg-mss').onchange();assert.equal(f.el('error').textContent,'');f.click('skip');f.click('A-submit');f.click('A-send');assert.match(f.el('packets').innerHTML,/LEN=2/);});
test('tabs retain state, support keyboard navigation, and reset cancels playback',()=>{const f=fixture();f.click('skip');f.click('A-submit');f.click('log-tab');assert.equal(f.el('hosts-panel').hidden,true);assert.equal(f.el('log-panel').hidden,false);f.el('log-tab').onkeydown({key:'ArrowLeft',preventDefault(){}});assert.equal(f.el('hosts-panel').hidden,false);assert.equal(f.el('hosts-tab').focused,true);assert.match(f.el('A-submitted').textContent,/20 bytes submitted/);f.click('auto');f.click('reset');assert.equal(f.timers.size,0);assert.equal(f.el('A-send-visual').hidden,true);});
test('page assets and existing navigation resolve; layer controls have labels',()=>{const html=fs.readFileSync('cs339/tcp_sequence.html','utf8');for(const m of html.matchAll(/(?:src|href)="\.\.\/([^"]+)"/g))assert.ok(fs.existsSync(m[1]),m[1]);assert.match(html,/role="tablist"/);assert.match(fs.readFileSync('cs339/index.html','utf8'),/tool=cs339\/tcp_sequence.html/);});

test('one-shot intercept waits for the next data segment and delivers only that packet',()=>{
 const f=fixture();f.click('skip');f.click('intercept-next');assert.match(f.el('intercept-status').textContent,/Waiting/);f.click('A-submit');f.click('A-send');assert.equal(f.el('intercept-dialog').open,true);assert.equal(f.el('intercept-seq').textContent,'42');assert.match(f.el('intercept-payload').textContent,/4 bytes/);assert.match(f.el('B-recv-bytes').textContent,/0 bytes/);f.click('intercept-deliver');assert.equal(f.el('intercept-dialog').open,false);assert.match(f.el('B-recv-bytes').textContent,/4 bytes/);f.click('A-send');assert.equal(f.el('intercept-dialog').open,false);
});
test('auto-intercept pauses playback, supports dropping data and intercepts a manual ACK',()=>{
 const f=fixture();f.click('skip');f.el('auto-intercept').checked=true;f.el('auto-intercept').onchange();f.click('A-submit');f.click('auto');f.tick();assert.equal(f.el('intercept-dialog').open,true);assert.equal(f.timers.size,0);f.click('intercept-drop');assert.equal(f.el('intercept-dialog').open,false);assert.match(f.el('B-recv-bytes').textContent,/0 bytes/);assert.match(f.el('packets').innerHTML,/lost/);f.click('A-retransmit');assert.match(f.el('intercept-route').textContent,/Retransmission/);f.click('intercept-deliver');f.click('B-send-ack');assert.equal(f.el('intercept-dialog').open,true);assert.equal(f.el('intercept-ack').textContent,'46');assert.match(f.el('intercept-payload').textContent,/0 bytes/);f.click('intercept-deliver');assert.match(f.el('A-send-start').textContent,/46/);
});
test('intercept next opens existing data; close and Escape leave it pending; reset disarms interception',()=>{
 const f=fixture();f.click('skip');f.click('A-submit');f.click('A-send');f.click('intercept-next');assert.equal(f.el('intercept-dialog').open,true);f.click('intercept-close');assert.equal(f.el('intercept-dialog').open,false);assert.match(f.el('data-cards').innerHTML,/SEQ 42/);f.click('intercept-next');f.el('intercept-dialog').oncancel({preventDefault(){}});assert.equal(f.el('intercept-dialog').open,false);assert.match(f.el('B-recv-bytes').textContent,/0 bytes/);f.click('reset');f.click('intercept-next');f.click('reset');f.click('skip');f.click('A-submit');f.click('A-send');assert.equal(f.el('intercept-dialog').open,false);
});
test('auto-intercept drains existing cards in order and reset removes stale dialog state',()=>{
 const f=fixture();f.click('skip');f.click('A-submit');f.click('A-send');f.click('A-send');f.el('auto-intercept').checked=true;f.el('auto-intercept').onchange();assert.equal(f.el('intercept-seq').textContent,'42');f.click('intercept-deliver');assert.equal(f.el('intercept-dialog').open,true);assert.equal(f.el('intercept-seq').textContent,'46');f.click('reset');assert.equal(f.el('intercept-dialog').open,false);f.click('skip');f.click('A-submit');f.click('A-send');assert.equal(f.el('intercept-dialog').open,true);assert.equal(f.el('intercept-seq').textContent,'42');
});

test('default MSS 2 fast retransmit flashes sender bytes and opens the intercept overlay',()=>{
 const f=fixture(false);assert.equal(f.el('cfg-mss').value,2);assert.equal(f.el('cfg-mssB').value,2);f.click('skip');f.click('A-submit');f.click('A-send');f.click('drop');for(let i=1;i<=3;i++){f.click('A-send');f.click('deliver');f.click('B-send-ack');if(i===3)f.click('intercept-next');if(i===3)f.click('intercept-close');f.click('deliver-ack');assert.equal(f.el('A-dup-acks').textContent,'Duplicate ACKs: '+i+'/3');}
 assert.match(f.el('A-rto').textContent,/Fast retransmit: resending 42, 2 bytes/);assert.match(f.el('A-send-cells').innerHTML,/duplicate-flash/);assert.match(f.el('data-cards').innerHTML,/SEQ 42.*2 bytes/);f.click('intercept-next');assert.equal(f.el('intercept-dialog').open,true);assert.equal(f.el('intercept-seq').textContent,'42');assert.match(f.el('intercept-payload').textContent,/2 bytes/);f.click('intercept-deliver');f.click('B-send-ack');f.click('deliver-ack');assert.equal(f.el('A-dup-acks').textContent,'Duplicate ACKs: 0/3');f.click('reset');f.click('skip');assert.equal(f.el('A-dup-acks').textContent,'Duplicate ACKs: 0/3');
});

test('each host completes its own TCP handshake step while global controls are hidden',()=>{const f=fixture(false);assert.equal(f.el('handshake-syn-ack').hidden,true);assert.equal(f.el('handshake-ack').hidden,true);f.click('connect');assert.equal(f.el('handshake-syn-ack').hidden,false);assert.equal(f.el('handshake-ack').hidden,true);f.click('handshake-syn-ack');assert.equal(f.el('handshake-syn-ack').hidden,true);assert.equal(f.el('handshake-ack').hidden,false);f.click('handshake-ack');assert.equal(f.el('handshake-ack').hidden,true);assert.equal(f.el('A-submit').disabled,false);f.click('reset');assert.equal(f.el('handshake-syn-ack').hidden,true);assert.equal(f.el('handshake-ack').hidden,true);assert.equal(f.el('connection-menu-button').disabled,false);});

test('default mode hides reverse stream controls and settings; reset retains duplex',()=>{
 const f=fixture(false);
 for(const id of ['B-sender','B-app-send','A-receiver','A-app-read','B-send-actions','B-app-settings-button','field-sizeB','field-mssB'])assert.equal(f.el(id).hidden,true,id);
 assert.equal(f.el('B-receiver').hidden,false);assert.equal(f.el('A-sender').hidden,false);
 f.click('duplex');
 for(const id of ['B-sender','B-app-send','A-receiver','A-app-read','B-send-actions','B-app-settings-button','field-sizeB','field-mssB'])assert.equal(f.el(id).hidden,false,id);
 f.click('skip');assert.match(f.el('mode-note').textContent,/TCP is always full duplex. Reset to change the view/);
 f.click('reset');assert.equal(f.el('duplex').attrs['aria-pressed'],'true');assert.equal(f.el('duplex').disabled,false);
});
test('duplex transit routes and receiver waiting states stay independent',()=>{
 const f=fixture(false);f.el('cfg-b').value='41';f.el('cfg-b').onchange();f.click('duplex');f.click('skip');f.click('A-submit');f.click('B-submit');f.click('A-send');f.click('B-send');
 assert.match(f.el('data-cards').innerHTML,/direction-A/);assert.match(f.el('data-cards').innerHTML,/direction-B/);assert.match(f.el('data-cards').innerHTML,/In transit/);
 assert.match(f.el('packets').innerHTML,/direction-B reverse/);
 assert.match(f.el('A-recv-bytes').textContent,/0 bytes/);assert.match(f.el('B-recv-bytes').textContent,/0 bytes/);
 f.click('deliver');assert.match(f.el('B-receive-cells').innerHTML,/Received by TCP/);assert.match(f.el('A-recv-bytes').textContent,/0 bytes/);
 f.click('deliver');assert.match(f.el('A-receive-cells').innerHTML,/Received by TCP/);
 f.click('B-send-ack');f.click('deliver-ack');assert.match(f.el('B-recv-bytes').textContent,/2 bytes/);
 f.click('B-read');assert.match(f.el('B-recv-bytes').textContent,/0 bytes/);assert.match(f.el('A-recv-bytes').textContent,/2 bytes/);
});
test('out-of-order receipt waits for a gap and becomes readable only after repair',()=>{
 const f=fixture(false);f.click('skip');f.click('A-submit');f.click('A-send');f.click('A-send');f.click('deliver-5');
 assert.match(f.el('B-receive-cells').innerHTML,/Buffered: waiting for missing bytes/);assert.match(f.el('B-receive-note').textContent,/2 bytes buffered/);assert.equal(f.el('B-read').disabled,true);
 assert.equal(f.el('B-recv-bytes').textContent,'0 bytes');f.click('deliver');assert.equal(f.el('B-recv-bytes').textContent,'4 bytes');assert.doesNotMatch(f.el('B-receive-cells').innerHTML,/unread/);assert.match(f.el('B-receive-note').textContent,/0 bytes buffered/);assert.equal(f.el('B-read').disabled,false);
});

test('receive buffer visibility follows duplex and resets pending bytes',()=>{const f=fixture(false);assert.equal(f.el('A-recv-bridge').hidden,true);assert.equal(f.el('B-recv-bridge').hidden,false);f.click('duplex');assert.equal(f.el('A-recv-bridge').hidden,false);f.click('skip');f.click('A-submit');f.click('A-send');f.click('deliver');assert.equal(f.el('B-recv-bytes').textContent,'2 bytes');f.click('reset');assert.equal(f.el('B-recv-bytes').textContent,'0 bytes');});

test('send buffer retains bytes until ACK and follows duplex visibility',()=>{const f=fixture(false);assert.equal(f.el('A-send-bridge').hidden,false);assert.equal(f.el('B-send-bridge').hidden,true);f.click('duplex');assert.equal(f.el('B-send-bridge').hidden,false);f.click('skip');f.click('A-submit');assert.equal(f.el('A-send-bytes').textContent,'20 bytes');f.click('A-send');assert.equal(f.el('A-send-bytes').textContent,'20 bytes');f.click('deliver');assert.equal(f.el('A-send-bytes').textContent,'20 bytes');f.click('B-send-ack');f.click('deliver-ack');assert.equal(f.el('A-send-bytes').textContent,'18 bytes');assert.equal(f.el('B-send-bytes').textContent,'0 bytes');f.click('reset');assert.equal(f.el('A-send-bytes').textContent,'0 bytes');});

test('Send Data stays enabled for repeated submissions in full duplex',()=>{const f=fixture(false);f.click('duplex');f.click('skip');for(const id of ['A','B']){f.click(id+'-submit');f.click(id+'-submit');assert.equal(f.el(id+'-submit').disabled,false);assert.equal(f.el(id+'-send-bytes').textContent,id==='A'?'40 bytes':'24 bytes');}assert.match(f.el('A-send-cells').innerHTML,/81/);f.click('reset');assert.equal(f.el('A-send-bytes').textContent,'0 bytes');});

test('host header FIN controls wait for student actions and offer combined close',()=>{
 const f=fixture();f.click('skip');f.click('A-close');assert.equal(f.timers.size,0);assert.equal(f.el('B-fin-step').hidden,false);assert.ok(f.el('B-close').innerHTML.startsWith('Send FIN + ACK<small>'));f.click('B-fin-step');assert.equal(f.el('B-state').textContent,'CLOSE-WAIT');assert.ok(f.el('B-close').innerHTML.startsWith('Send FIN + ACK<small>'));f.click('B-close');assert.equal(f.el('A-fin-step').hidden,false);f.click('A-fin-step');assert.equal(f.el('A-fin-step').textContent,'Finish TIME-WAIT');f.click('A-fin-step');assert.equal(f.el('A-state').textContent,'CLOSED');assert.equal(f.el('B-state').textContent,'CLOSED');
 f.click('reset');f.click('skip');f.click('B-close');f.click('A-close');f.click('B-fin-step');f.click('B-fin-step');assert.equal(f.el('status').textContent,'Connection closed');
});

test('close menu skips teardown and reconnect supports both handshake and connected start',()=>{
 const f=fixture();f.click('skip');f.click('A-close-now');assert.equal(f.el('status').textContent,'Connection closed');assert.equal(f.el('connection-menu-button').disabled,false);assert.equal(f.timers.size,0);
 f.click('connect');assert.equal(f.el('A-state').textContent,'SYN-SENT');f.click('handshake-syn-ack');f.click('handshake-ack');assert.equal(f.el('A-state').textContent,'ESTABLISHED');f.click('B-close-now');assert.equal(f.el('B-state').textContent,'CLOSED');f.click('skip');assert.equal(f.el('A-state').textContent,'ESTABLISHED');assert.equal(f.el('B-state').textContent,'ESTABLISHED');
});
test('SYN and FIN action buttons are generated in host headers',()=>{
 const source=fs.readFileSync('assets/js/tcp-sequence.js','utf8'),header=source.slice(source.indexOf('<div class="host-heading">'),source.indexOf('<section class="app-layer">'));
 for(const id of ['connection-menu-button','handshake-syn-ack','handshake-ack','${id}-fin-step','${id}-close-menu-button'])assert.ok(header.includes('id="'+id+'"'),id);
});

test('FIN response is a direct header button without a popover',()=>{const f=fixture();f.click('skip');f.click('A-close');assert.equal(f.el('B-close-menu-button').attrs.popovertarget,undefined);f.click('B-close-menu-button');assert.equal(f.el('B-state').textContent,'LAST-ACK');assert.equal(f.el('error').textContent,'');});

test('half-close keeps send-buffer counts visible and explains why FIN is waiting',()=>{
 const f=fixture(false);f.click('skip');f.click('A-close');f.click('B-fin-step');f.click('B-submit');assert.equal(f.el('B-send-bytes').textContent,'12 bytes');assert.equal(f.el('B-close-menu-button').disabled,true);assert.match(f.el('B-close-status').textContent,/12 bytes still need transmission/);
 for(let i=0;i<6;i++){f.click('B-send');f.click('deliver');f.click('A-send-ack');f.click('deliver-ack');}
 assert.equal(f.el('B-send-bytes').textContent,'0 bytes');assert.equal(f.el('B-close-menu-button').disabled,false);assert.equal(f.el('B-close-status').hidden,true);f.click('B-close-menu-button');assert.equal(f.el('B-state').textContent,'LAST-ACK');
});
