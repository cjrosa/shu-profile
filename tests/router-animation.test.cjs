const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('cs339/router_viz.html', 'utf8');
const code = html.slice(html.indexOf('function fabricRoute('), html.indexOf('function drawAnimPkts('));
const context = {NUM_PORTS: 3, Math};
vm.createContext(context);
vm.runInContext(code, context);
const g = {fabX:48, fabY:158, fabW:904, fabH:190, ports:[200,500,800].map(cx=>({cx,midY:92}))};
for (const mode of ['mem','bus','xbar']) {
  test(mode + ': every input/output pair follows its fabric and reaches its output', () => {
    for(let input=0;input<3;input++) for(let output=0;output<3;output++) {
      const route=context.fabricRoute(g,mode,input,output);
      assert.equal(route[0].y,92); assert.equal(route.at(-1).y,92);
      assert.equal(route.at(-1).x,g.ports[output].cx+(mode==='mem'?0:24));
      for(let i=1;i<route.length;i++) assert.ok(route[i].x===route[i-1].x||route[i].y===route[i-1].y);
      for(let t=0;t<=1;t+=.01) {
        const p=context.pointOnRoute(route,t);
        assert.ok(route.slice(1).some((b,i)=>{const a=route[i];return p.x>=Math.min(a.x,b.x)-1e-8&&p.x<=Math.max(a.x,b.x)+1e-8&&p.y>=Math.min(a.y,b.y)-1e-8&&p.y<=Math.max(a.y,b.y)+1e-8;}));
      }
      if(mode==='mem') {assert.equal(route[3].x,500);assert.equal(route[3].y,271.5);}
      if(mode==='bus') assert.equal(route[1].y,281.5);
      if(mode==='xbar') assert.equal(route[1].y,210+(input+.5)*42);
    }
  });
}
test('route interpolation handles duplicate points and clamps endpoints',()=>{
  const route=[{x:1,y:2},{x:1,y:2},{x:1,y:12}];
  assert.equal(context.pointOnRoute(route,.5).y,7);
  assert.equal(context.pointOnRoute(route,-1).y,2);
  assert.equal(context.pointOnRoute(route,2).y,12);
});
