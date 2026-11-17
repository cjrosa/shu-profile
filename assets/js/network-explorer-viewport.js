/* Camera state is independent of topology and simulation state. */
(() => {
  'use strict';
  const get = id => document.getElementById(id);
  const canvas = get('canvas');
  const overview = get('viewport-map');
  const panel = get('viewport-panel');
  const stage = get('canvas-stage');
  const handle = get('viewport-handle');
  const minimize=document.createElement('button');minimize.id='viewport-minimize';minimize.type='button';minimize.setAttribute('aria-controls','viewport-map');
  const panelHeader=document.createElement('div');panelHeader.className='viewport-panel-header';handle.before(panelHeader);panelHeader.append(handle,minimize);
  let expandedPosition=null;
  minimize.onclick=()=>{if(!overview.hidden)expandedPosition={x:panel.offsetLeft,y:panel.offsetTop};moving=null;overview.hidden=!overview.hidden;overview.style.display=overview.hidden?'none':'';minimize.setAttribute('aria-expanded',String(!overview.hidden));minimize.title=overview.hidden?'Restore viewport':'Minimize viewport';minimize.setAttribute('aria-label',minimize.title);minimize.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+(overview.hidden?'<path d="m6 14 6-6 6 6"/>':'<path d="M5 17h14"/>')+'</svg>';if(overview.hidden)anchorCollapsedPanel();else if(expandedPosition)placePanel(expandedPosition.x,expandedPosition.y);};
  minimize.setAttribute('aria-expanded','true');minimize.setAttribute('aria-label','Minimize viewport');minimize.title='Minimize viewport';minimize.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17h14"/></svg>';
  let moving = null;
  const camera = { x: 0, y: 0, zoom: 1 };
  let pan = null;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function anchorCollapsedPanel() {
    panel.style.left='auto';panel.style.top='auto';panel.style.right='10px';panel.style.bottom='10px';
  }
  function placePanel(x, y) {
    if(overview.hidden){anchorCollapsedPanel();return;}
    panel.style.left = `${clamp(x, 0, stage.clientWidth - panel.offsetWidth)}px`;
    panel.style.top = `${clamp(y, 0, stage.clientHeight - panel.offsetHeight)}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || overview.hidden) return;
    event.preventDefault();
    handle.focus();
    const bounds = stage.getBoundingClientRect();
    moving = {dx: event.clientX - bounds.left - panel.offsetLeft,
      dy: event.clientY - bounds.top - panel.offsetTop};
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', event => {
    if (!moving) return;
    const bounds = stage.getBoundingClientRect();
    placePanel(event.clientX - bounds.left - moving.dx, event.clientY - bounds.top - moving.dy);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    handle.addEventListener(type, () => { moving = null; });
  }
  handle.addEventListener('keydown', event => {
    const direction = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]}[event.key];
    if (!direction) return;
    event.preventDefault();
    placePanel(panel.offsetLeft + direction[0] * 12, panel.offsetTop + direction[1] * 12);
  });
  new ResizeObserver(() => {
    if (panel.style.left) placePanel(panel.offsetLeft, panel.offsetTop);
  }).observe(stage);

  // Keep a small margin around all rendered nodes, labels and connections.
  // When zoomed out farther than the network, center that axis instead of panning into empty space.
  function navigationBounds() {
    const b = contentBounds(), buffer = 60;
    const width = Math.max(b.width + buffer * 2, 900 / camera.zoom);
    const height = Math.max(b.height + buffer * 2, 560 / camera.zoom);
    return {x: b.x + b.width / 2 - width / 2, y: b.y + b.height / 2 - height / 2, width, height};
  }
  function update() {
    const width = 900 / camera.zoom;
    const height = 560 / camera.zoom;

    const bounds = navigationBounds();
    camera.x = clamp(camera.x, bounds.x, bounds.x + bounds.width - width);
    camera.y = clamp(camera.y, bounds.y, bounds.y + bounds.height - height);
    // Extend the dot field through the full visible SVG, including aspect-ratio gutters.
    const grid=canvas.querySelector('rect[fill="url(#grid)"]');
    if(grid){const aspect=canvas.clientWidth&&canvas.clientHeight?canvas.clientWidth/canvas.clientHeight:width/height,visibleWidth=Math.max(width,height*aspect),visibleHeight=Math.max(height,width/aspect);for(const [key,value] of Object.entries({x:camera.x-(visibleWidth-width)/2,y:camera.y-(visibleHeight-height)/2,width:visibleWidth,height:visibleHeight}))grid.setAttribute(key,value);}
    canvas.setAttribute('viewBox', `${camera.x} ${camera.y} ${width} ${height}`);
    const window = get('viewport-window');
    for (const [key, value] of Object.entries({x: camera.x, y: camera.y, width, height})) {
      window.setAttribute(key, value);
    }
    get('zoom-level').textContent = `${Math.round(camera.zoom * 100)}%`;
    get('zoom-slider').value = Math.round(camera.zoom * 100);
    get('zoom-slider').setAttribute('aria-valuetext', `${Math.round(camera.zoom * 100)} percent`);
  }

  canvas.addEventListener('network-locate', event => {
    camera.zoom = Math.max(camera.zoom, 1);
    camera.x = event.detail.x - 450 / camera.zoom;
    camera.y = event.detail.y - 280 / camera.zoom;
    update(); refreshOverview();
  });
  function zoom(delta) {
    const cx = camera.x + 450 / camera.zoom;
    const cy = camera.y + 280 / camera.zoom;
    camera.zoom = clamp(camera.zoom + delta, .1, 4);
    camera.x = cx - 450 / camera.zoom;
    camera.y = cy - 280 / camera.zoom;
    update();refreshOverview();
  }

  function point(event) {
    const p = overview.createSVGPoint();
    p.x = event.clientX;
    p.y = event.clientY;
    return p.matrixTransform(overview.getScreenCTM().inverse());
  }

  function refreshOverview() {
    const bounds = navigationBounds();
    overview.setAttribute('viewBox', [bounds.x, bounds.y, bounds.width, bounds.height].join(' '));
    // Copy only graphical elements; the overview is one keyboard-accessible control.
    for (const [source, target] of [['links', 'viewport-links'], ['devices', 'viewport-nodes']]) {
      const clones = [...get(source).children,...(source==='devices'?[...(get('applications')?.children||[]),...(get('notes')?.children||[])]:[])].map(node => {
        const clone = node.cloneNode(true);
        for (const element of [clone, ...clone.querySelectorAll('*')]) {
          for (const attribute of [...element.attributes]) {
            if (['id', 'tabindex', 'role'].includes(attribute.name) || attribute.name.startsWith('aria-') || attribute.name.startsWith('data-')) {
              element.removeAttribute(attribute.name);
            }
          }
        }
        return clone;
      });
      get(target).replaceChildren(...clones);
    }
  }

  let canvasPan=null,spaceHeld=false,suppressClick=false,emptyCanvasClick=false;
  const editing=target=>target.closest('input,textarea,select,[contenteditable=true]');
  document.addEventListener('keydown',event=>{if(event.code==='Space'&&!editing(event.target)&&!document.querySelector('dialog[open]')){spaceHeld=true;canvas.classList.add('pan-ready');if(event.target===canvas||stage.contains(event.target))event.preventDefault();}});
  document.addEventListener('keyup',event=>{if(event.code==='Space'){spaceHeld=false;canvas.classList.remove('pan-ready');}});
  const endPan=()=>{if(canvasPan){suppressClick=canvasPan.moved;if(canvas.hasPointerCapture(canvasPan.id))canvas.releasePointerCapture(canvasPan.id);}canvasPan=null;canvas.classList.remove('panning');};
  window.addEventListener('blur',()=>{spaceHeld=false;canvas.classList.remove('pan-ready');endPan();});
  function zoomAt(value, x, y) {
    const p=canvas.createSVGPoint();p.x=x;p.y=y;
    const before=p.matrixTransform(canvas.getScreenCTM().inverse());
    const previous=camera.zoom;camera.zoom=clamp(value,.1,4);
    camera.x=before.x-(before.x-camera.x)*previous/camera.zoom;
    camera.y=before.y-(before.y-camera.y)*previous/camera.zoom;
    update();refreshOverview();
  }
  canvas.addEventListener('wheel',event=>{
    event.preventDefault();
    const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?canvas.clientHeight:1);
    zoomAt(camera.zoom*Math.exp(-clamp(delta,-300,300)*.002),event.clientX,event.clientY);
  },{passive:false});
  const touches=new Map();let pinching=false,pinchDistance=0;
  const distance=()=>{const [a,b]=[...touches.values()];return Math.hypot(a.x-b.x,a.y-b.y);};
  stage.addEventListener('pointerdown',event=>{
    if(event.pointerType!=='touch'||!canvas.contains(event.target))return;
    touches.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(touches.size<2)return;
    event.preventDefault();event.stopImmediatePropagation();endPan();pinching=true;suppressClick=true;pinchDistance=distance();
    canvas.dispatchEvent(new Event('viewport-gesture-start'));
    for(const id of touches.keys())canvas.setPointerCapture(id);
  },true);
  stage.addEventListener('pointermove',event=>{
    if(!touches.has(event.pointerId))return;
    touches.set(event.pointerId,{x:event.clientX,y:event.clientY});if(!pinching)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(touches.size<2)return;
    const [a,b]=[...touches.values()],next=distance();
    if(pinchDistance>0&&next>0)zoomAt(camera.zoom*next/pinchDistance,(a.x+b.x)/2,(a.y+b.y)/2);
    pinchDistance=next;
  },true);
  for(const type of ['pointerup','pointercancel'])stage.addEventListener(type,event=>{
    if(!touches.delete(event.pointerId)||!pinching)return;
    event.preventDefault();event.stopImmediatePropagation();suppressClick=true;
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    if(!touches.size)pinching=false;
  },true);
  window.addEventListener('blur',()=>{touches.clear();pinching=false;});
  stage.addEventListener('pointerdown',event=>{
    emptyCanvasClick=false;
    if(!canvas.contains(event.target)||![0,1].includes(event.button))return;
    if(canvas.classList.contains('placing')||!get('cancel-connect').hidden)return;
    const object=event.target.closest('[data-device],[data-application],[data-note],[data-capacity-monitor],[data-link],[data-anchor-device],.in-flight-frame');
    if(event.button!==1&&!spaceHeld&&object)return;
    emptyCanvasClick=!object&&event.button===0&&!spaceHeld;
    event.preventDefault();event.stopImmediatePropagation();
    const matrix=canvas.getScreenCTM();canvasPan={id:event.pointerId,x:event.clientX,y:event.clientY,cx:camera.x,cy:camera.y,scale:matrix.a,moved:false};
    canvas.setPointerCapture(event.pointerId);canvas.classList.add('panning');
  },true);
  stage.addEventListener('pointermove',event=>{if(!canvasPan)return;event.preventDefault();event.stopImmediatePropagation();const dx=event.clientX-canvasPan.x,dy=event.clientY-canvasPan.y;canvasPan.moved ||= Math.hypot(dx,dy)>3;camera.x=canvasPan.cx-dx/canvasPan.scale;camera.y=canvasPan.cy-dy/canvasPan.scale;update();refreshOverview();},true);
  for(const type of ['pointerup','pointercancel'])stage.addEventListener(type,event=>{if(!canvasPan)return;event.preventDefault();event.stopImmediatePropagation();endPan();},true);
  canvas.addEventListener('lostpointercapture',()=>{canvasPan=null;canvas.classList.remove('panning');});
  stage.addEventListener('click',event=>{const empty=emptyCanvasClick;emptyCanvasClick=false;if(suppressClick){suppressClick=false;event.preventDefault();event.stopImmediatePropagation();return;}if(empty&&canvas.contains(event.target))canvas.dispatchEvent(new Event('canvas-deselect'));},true);
  canvas.addEventListener('auxclick',event=>{if(event.button===1)event.preventDefault();});
  get('zoom-slider').oninput = event => zoom(Number(event.target.value) / 100 - camera.zoom);
  function contentBounds(){
    if(!get('devices').querySelector('[data-device]')&&!get('applications')?.children.length&&!get('notes')?.children.length)return {x:0,y:0,width:900,height:560};
    const boxes=['devices','applications','links','notes'].map(id=>get(id)).filter(e=>e?.children.length).map(e=>e.getBBox());
    if(!boxes.length)return {x:0,y:0,width:900,height:560};
    const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));return {x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y};
  }
  function fit(){
    const b=contentBounds(),reserve=Math.min(.3,(panel.offsetHeight+28)/Math.max(1,canvas.clientHeight));
    camera.zoom=clamp(Math.min(1,900/(b.width+120),560*(1-reserve)/(b.height+120)),.1,4);
    camera.x=b.x+b.width/2-450/camera.zoom;camera.y=b.y-60;
    update();refreshOverview();
  }
  get('zoom-slider').min='10';
  get('zoom-reset').onclick=fit;
  get('zoom-reset').title='Fit network';get('zoom-reset').setAttribute('aria-label','Fit network');
  window.NetworkExplorerViewport={fit};
  overview.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    overview.focus();
    const p = point(event);
    const inside = p.x >= camera.x && p.x <= camera.x + 900 / camera.zoom &&
      p.y >= camera.y && p.y <= camera.y + 560 / camera.zoom;
    pan = inside ? {dx: p.x - camera.x, dy: p.y - camera.y} :
      {dx: 450 / camera.zoom, dy: 280 / camera.zoom};
    camera.x = p.x - pan.dx;
    camera.y = p.y - pan.dy;
    overview.setPointerCapture(event.pointerId);
    update();
  });
  overview.addEventListener('pointermove', event => {
    if (!pan) return;
    const p = point(event);
    camera.x = p.x - pan.dx;
    camera.y = p.y - pan.dy;
    update();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    overview.addEventListener(type, () => { pan = null; });
  }
  overview.addEventListener('keydown', event => {
    const directions = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    camera.x += direction[0] * 45 / camera.zoom;
    camera.y += direction[1] * 45 / camera.zoom;
    update();
  });
  const observer = new MutationObserver(() => { update(); refreshOverview(); });
  observer.observe(get('devices'), {childList: true});
  observer.observe(get('links'), {childList: true});
  if(get('applications'))observer.observe(get('applications'), {childList:true});
  if(get('notes'))observer.observe(get('notes'),{childList:true});
  new ResizeObserver(() => update()).observe(canvas);
  refreshOverview();
  update();
})();
