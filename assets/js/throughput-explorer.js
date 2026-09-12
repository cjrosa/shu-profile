/* UI and illustrative motion are independent of the fixed-step fluid model. */
'use strict';
(() => {
const $=id=>document.getElementById(id), colors=['#236a9c','#a6509c','#14806d','#b76617'];
const states=[new ThroughputSimulation(false),new ThroughputSimulation(true)];
let active=0,running=false,previous=null,accumulator=0,lastRender=0,explanation='';
const motion=matchMedia('(prefers-reduced-motion: reduce)');
const fmt=n=>n.toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1});
const sim=()=>states[active];
function controls(){const p=sim().params;
  $('controls').innerHTML=['rs','rc',...(active?['r']:[])].map(key=>`<div class="field"><label for="rate-${key}">${{rs:'Server link · Rₛ',rc:'Client link · R꜀',r:'Shared link · R'}[key]}<output id="value-${key}" for="rate-${key}">${p[key]} Mbps</output></label><input id="rate-${key}" type="range" min="10" max="200" step="10" value="${p[key]}" data-rate="${key}"></div>`).join('');
  $('connections-control').hidden=!active;
  $('connections').value=String(p.n);
  $('controls').querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>{sim().configure({[input.dataset.rate]:Number(input.value)});$('value-'+input.dataset.rate).textContent=input.value+' Mbps';render();}));
  $('shared-preset').hidden=!active;
  $('scenario-title').textContent=active?'Multiple paths, one shared link':'One path, two links';
  $('scenario-caption').textContent=active?'Each colored connection receives an equal share R/N of the central link.':'A queue can form at the router before the server link.';
}
function pause(){running=false;accumulator=0;$('play').textContent='Start';}
function tab(index){pause();active=index;['single','shared'].forEach((name,i)=>{const button=$('tab-'+name);button.setAttribute('aria-selected',String(i===active));button.tabIndex=i===active?0:-1;});$('explorer').setAttribute('aria-labelledby','tab-'+(active?'shared':'single'));controls();render();}
['single','shared'].forEach((name,i)=>{const button=$('tab-'+name);button.addEventListener('click',()=>tab(i));button.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?1:1-active;tab(next);$('tab-'+(next?'shared':'single')).focus();}});});
$('connections').addEventListener('change',e=>{pause();sim().configure({n:Number(e.target.value)});render();});
$('play').addEventListener('click',()=>{running=!running;accumulator=0;previous=null;$('play').textContent=running?'Pause':'Start';render();});
$('reset').addEventListener('click',()=>{pause();sim().reset();render();});
document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{pause();const kind=button.dataset.preset;sim().configure({rs:40,rc:kind==='client'?20:80,r:kind==='shared'?40:200});sim().reset();controls();render();}));
// Mirror diagram coordinates so sources are on the right; keep labels readable.
function text(x,y,value,extra=''){return `<text x="${850-x}" y="${y}" text-anchor="middle" ${extra}>${value}</text>`;}
function node(x,y,label,router=false){const cx=850-x;
  if(router)return `<circle class="node router" cx="${cx}" cy="${y}" r="30"/><path d="M${cx-16} ${y-10} L${cx+16} ${y+10} M${cx-16} ${y+10} L${cx+16} ${y-10}" fill="none" stroke="#4d88bd" stroke-width="5" stroke-linecap="round"/>${text(x,y+46,label)}`;
  const server=label.startsWith('S');
  const caption=label==='Server'||label==='Client'?label:(server?'Server ':'Client ')+label.slice(1);
  // Vector devices match the performance tool's outlined monitor and stand.
  const monitor=`<rect x="${cx-24}" y="${y-22}" width="48" height="40" rx="7" fill="white" stroke="#253954" stroke-width="2"/><path d="M${cx-13} ${y+23} H${cx+13}" stroke="#253954" stroke-width="4"/>`;
  const computer=`<rect x="${cx-29}" y="${y-20}" width="39" height="31" rx="4" fill="white" stroke="#253954" stroke-width="2"/><path d="M${cx-10} ${y+11} V${y+20} M${cx-20} ${y+21} H${cx}" stroke="#253954" stroke-width="3"/><rect x="${cx+15}" y="${y-24}" width="17" height="46" rx="3" fill="#edf3f8" stroke="#253954" stroke-width="2"/><path d="M${cx+19} ${y-15} H${cx+28} M${cx+19} ${y-9} H${cx+28}" stroke="#7892a7" stroke-width="2"/><circle cx="${cx+23.5}" cy="${y+13}" r="2.5" fill="#14806d"/>`;
  return `<g aria-label="${caption}">${server?computer:monitor}${text(x,y+42,caption)}</g>`;
}
function link(x1,y1,x2,y2,rate,color,limited=false,drawBase=true,phase=0){x1=850-x1;x2=850-x2;[x1,x2]=[x2,x1];[y1,y2]=[y2,y1];let result=drawBase?`<line class="link ${limited?'limited':''}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`: "";
  // Every marker represents 5 Mbits; its fixed geometric speed does not depend on rate.
  if(rate>0&&!motion.matches){const length=Math.hypot(x2-x1,y2-y1),angle=Math.atan2(y2-y1,x2-x1)*180/Math.PI,speed=130,spacing=speed/(rate/5),offset=(sim().time*speed+phase*spacing)%spacing;for(let d=offset;d<length;d+=spacing){const a=d/length;result+=`<path d="M-3 -3.5 L1 0 L-3 3.5" transform="translate(${x1+(x2-x1)*a} ${y1+(y2-y1)*a}) rotate(${angle})" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;}}
  return result;
}
function buffer(x,y,amount,capacity,color,label,loss){const drop=motion.matches?4:(sim().time*35)%20;return `<rect x="${850-x-42}" y="${y}" width="84" height="12" rx="3" fill="#e5ecf1"/><rect x="${850-x-42}" y="${y}" width="${Math.min(84,84*amount/capacity)}" height="12" rx="3" fill="${color}"/>${text(x,y-8,`Queued: ${Math.round(amount)}/${Math.floor(capacity)} packets`)}${loss?`<circle cx="${850-x-45}" cy="${y+12+drop}" r="3" fill="#b62745"/>`+text(x,y+28,'↓ Dropping data','style="fill:#b62745;font-size:10px"'):''}`;}
function routerQueue(x,y,amounts,capacity,loss){
  const left=850-x-60,total=amounts.reduce((sum,value)=>sum+value,0);
  let offset=0,markup=`<g class="router-queue"><rect x="${left}" y="${y}" width="120" height="12" rx="3" fill="#e5ecf1"/>`;
  amounts.forEach((amount,i)=>{const width=120*amount/capacity;markup+=`<rect x="${left+offset}" y="${y}" width="${width}" height="12" fill="${colors[i]}"/>`;offset+=width;});
  markup+=text(x,y-8,`Queued: ${Math.round(total)}/${Math.floor(capacity)} packets`);
  if(loss){const drop=motion.matches?4:(sim().time*35)%20;markup+=`<circle cx="${left-5}" cy="${y+12+drop}" r="3" fill="#b62745"/>`+text(x,y+28,'Dropping data','style="fill:#b62745;font-size:10px"');}
  return markup+'</g>';
}
function diagram(){const s=sim(),p=s.params,b=s.prediction().bottlenecks;let svg='<title>Network capacity, throughput, and queues</title>';
  if(!active){svg+=link(105,145,370,145,s.lastOut[0],colors[0],b.includes('Server link'))+link(430,145,745,145,p.rc,colors[0],b.includes('Client link'));
    svg+=node(75,145,'Server')+node(400,145,'Router',true)+node(775,145,'Client');svg+=text(230,115,`Rₛ = ${p.rs} Mbps`)+text(600,115,`R꜀ = ${p.rc} Mbps`);svg+=buffer(400,225,s.clients[0],20,colors[0],'Queue',s.time-s.lastClientDrop<0.75);
  }else{
    const top=65,gap=85,middle=top+(p.n-1)*gap/2;
    const queueTop=Math.max(top+(p.n-1)*gap+55,middle+65);
    $('network').setAttribute('viewBox',`0 15 850 ${queueTop+60-15}`);
    // One physical backbone, with interleaved colors representing equal shares.
    svg+=link(284,middle,549,middle,0,colors[0],b.includes('Shared link'));
    svg+=text(416,middle-36,`Shared link R = ${p.r} Mbps`)+text(416,middle-17,`Each share: ${fmt(p.r/p.n)} Mbps`);
    for(let i=0;i<p.n;i++){
      const y=top+i*gap,c=colors[i];
      svg+=link(80,y,224,middle,s.lastOut[i],c,b.includes('Server link'));
      svg+=link(284,middle,549,middle,s.time?(s.core[i]>0?p.r/p.n:Math.min(p.rc,p.r/p.n)):0,c,false,false,i/p.n);
      svg+=link(609,middle,780,y,p.rc,c,b.includes('Client link'));
      svg+=node(50,y,'S'+(i+1))+node(810,y,'C'+(i+1));
      // Place labels below each sloping access link at the label's horizontal position.
      svg+=text(130,y+(middle-y)*50/144+24,`R_s ${p.rs} Mbps`)+text(720,y+(middle-y)*60/171+24,`R_c ${p.rc} Mbps`);
    }
    svg+=node(254,middle,'Router 2',true)+node(579,middle,'Router 1',true);
    svg+=routerQueue(579,queueTop,s.core,Math.floor(20/p.n)*p.n,s.time-s.lastCoreDrop<0.75);
    svg+=routerQueue(254,queueTop,s.clients,20*p.n,s.time-s.lastClientDrop<0.75);
  }
  if(!active)$('network').setAttribute('viewBox','0 90 850 195');$('network').innerHTML=svg;
}
function render(){const s=sim(),p=s.params,pred=s.prediction(),m=s.metrics();diagram();
  $('clock').textContent=fmt(s.time)+' s';$('formula').textContent=active?`min(${p.rs}, ${p.rc}, ${p.r}/${p.n}) = ${fmt(pred.rate)} Mbps`:`min(${p.rs}, ${p.rc}) = ${fmt(pred.rate)} Mbps`;
  $('bottleneck').textContent='Bottleneck'+(pred.bottlenecks.length>1?'s':'')+': '+pred.bottlenecks.join(' + ');
  const dropping=s.time-Math.max(s.lastCoreDrop,s.lastClientDrop)<0.75,queued=m.some(v=>v.queue>1e-6);
  $('status').textContent=running?'Running':s.time?'Paused':'Ready';
  const next=dropping?'The buffer is full. Excess arrivals are dropped while the outgoing link continues transmitting at capacity.':queued?'Data is waiting before an outgoing link. Raise its capacity above the arrival rate to drain the queue.':'With no queue building, received throughput follows the limiting link. Lower an outgoing capacity to create congestion.';
  if(next!==explanation){$('explanation').textContent=next;explanation=next;}
}
function frame(now){if(previous!==null&&running){accumulator+=Math.min((now-previous)/1000,.1);while(accumulator>=ThroughputSimulation.DT){sim().step();accumulator-=ThroughputSimulation.DT;}}previous=now;if(running){render();lastRender=now;}requestAnimationFrame(frame);}
document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();render();}});motion.addEventListener('change',render);tab(0);requestAnimationFrame(frame);
})();
