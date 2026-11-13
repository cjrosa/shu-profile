/* Camera state is independent of topology and simulation state. */
(() => {
  'use strict';
  const get = id => document.getElementById(id);
  const canvas = get('canvas');
  const overview = get('viewport-map');
  const panel = get('viewport-panel');
  const stage = get('canvas-stage');
  const handle = get('viewport-handle');
  let moving = null;
  const camera = { x: 0, y: 0, zoom: 1 };
  let pan = null;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function placePanel(x, y) {
    panel.style.left = `${clamp(x, 0, stage.clientWidth - panel.offsetWidth)}px`;
    panel.style.top = `${clamp(y, 0, stage.clientHeight - panel.offsetHeight)}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
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

  function update() {
    const width = 900 / camera.zoom;
    const height = 560 / camera.zoom;
    camera.x = clamp(camera.x, 0, 900 - width);
    camera.y = clamp(camera.y, 0, 560 - height);
    canvas.setAttribute('viewBox', `${camera.x} ${camera.y} ${width} ${height}`);
    const window = get('viewport-window');
    for (const [key, value] of Object.entries({x: camera.x, y: camera.y, width, height})) {
      window.setAttribute(key, value);
    }
    get('zoom-level').textContent = `${Math.round(camera.zoom * 100)}%`;
    get('zoom-slider').value = Math.round(camera.zoom * 100);
    get('zoom-slider').setAttribute('aria-valuetext', `${Math.round(camera.zoom * 100)} percent`);
  }

  function zoom(delta) {
    const cx = camera.x + 450 / camera.zoom;
    const cy = camera.y + 280 / camera.zoom;
    camera.zoom = clamp(camera.zoom + delta, 1, 4);
    camera.x = cx - 450 / camera.zoom;
    camera.y = cy - 280 / camera.zoom;
    update();
  }

  function point(event) {
    const p = overview.createSVGPoint();
    p.x = event.clientX;
    p.y = event.clientY;
    return p.matrixTransform(overview.getScreenCTM().inverse());
  }

  function refreshOverview() {
    // Copy only graphical elements; the overview is one keyboard-accessible control.
    for (const [source, target] of [['links', 'viewport-links'], ['devices', 'viewport-nodes']]) {
      const clones = [...get(source).children].map(node => {
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

  get('zoom-slider').oninput = event => zoom(Number(event.target.value) / 100 - camera.zoom);
  get('zoom-reset').onclick = () => {
    Object.assign(camera, {x: 0, y: 0, zoom: 1});
    update();
  };
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
  const observer = new MutationObserver(refreshOverview);
  observer.observe(get('devices'), {childList: true});
  observer.observe(get('links'), {childList: true});
  refreshOverview();
  update();
})();
