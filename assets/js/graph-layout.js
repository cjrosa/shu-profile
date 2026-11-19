/* Shared geometry for both Graph Algorithm Visualizers. */
(function (root) {
  'use strict';
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const point = (a, c, b, t) => a.map((v, i) => (1-t)**2*v + 2*(1-t)*t*c[i] + t*t*b[i]);

  function layoutDAG(nodes, edges) {
    const ids = Object.keys(nodes), rank = Object.fromEntries(ids.map(id => [id, 0]));
    // Longest-path ranks put every dependency on a strictly later row.
    for (let pass = 0; pass < ids.length; pass++) {
      let changed = false;
      for (const [a, b] of edges) if (rank[b] <= rank[a]) {
        rank[b] = rank[a] + 1; changed = true;
      }
      if (!changed) break;
    }
    const rows = [];
    ids.forEach(id => (rows[rank[id]] ||= []).push(id));
    const position = () => rows.forEach((row, r) => row.forEach((id, i) => {
      nodes[id] = [180 + (i-(row.length-1)/2)*Math.min(96, 280/Math.max(1,row.length-1)), 40+r*72];
    }));
    position();
    // Alternating barycenter sweeps reduce crossings without changing dependencies.
    for (let pass = 0; pass < 8; pass++) {
      const down = pass % 2 === 0;
      for (const row of down ? rows : [...rows].reverse()) {
        const center = id => {
          const neighbors = edges.filter(e => e[down ? 1 : 0] === id).map(e => nodes[e[down ? 0 : 1]][0]);
          return neighbors.length ? neighbors.reduce((a,b) => a+b,0)/neighbors.length : nodes[id][0];
        };
        row.sort((a,b) => center(a)-center(b) || a.localeCompare(b));
        position();
      }
    }
    return nodes;
  }

  const cache = new WeakMap();
  function routeEdges(graph) {
    if (cache.has(graph)) return cache.get(graph);
    const routes = graph.edges.map(([a,b]) => {
      const start = graph.nodes[a], end = graph.nodes[b];
      const length = distance(start,end), normal = [-(end[1]-start[1])/length, (end[0]-start[0])/length];
      const reciprocal = graph.edges.some(e => e[0] === b && e[1] === a);
      let best, bestScore = Infinity;
      // Test the actual curve, including its endpoints, against every other node.
      for (let step = 0; step <= 60; step++) {
        const offset = reciprocal ? 24 + step*8 : (step === 0 ? 0 : Math.ceil(step/2)*12*(step%2 ? 1 : -1));
        const control = start.map((v,i) => (v+end[i])/2 + normal[i]*offset);
        const trim = (from, toward) => {
          const d = distance(from,toward);
          return from.map((v,i) => v + (toward[i]-v)*20/d);
        };
        const p = trim(start,control), q = trim(end,control);
        const samples = Array.from({length:81}, (_,i) => point(p,control,q,i/80));
        let clearance = Infinity;
        for (const [id, node] of Object.entries(graph.nodes)) {
          if (id !== a && id !== b) for (const sample of samples) clearance = Math.min(clearance,distance(node,sample));
        }
        const overflow = samples.reduce((sum,[x,y]) => sum+Math.max(0,12-x,x-348,12-y),0);
        const score = Math.max(0,26-clearance)*100000 + overflow*10 + Math.abs(offset);
        if (score < bestScore) {
          bestScore = score;
          best = { a, b, start:p, end:q, control, samples, label:point(p,control,q,0.5),
            d:`M${p.join(',')} Q${control.join(',')} ${q.join(',')}` };
        }
        if (score === 0) break;
      }
      return best;
    });
    cache.set(graph, routes);
    return routes;
  }
  function bounds(graph, routes) {
    const points = [...Object.values(graph.nodes).flatMap(([x,y]) => [[x-28,y-28],[x+28,y+28]]),
      ...routes.flatMap(r => r.samples.map(([x,y]) => [x,y]))];
    const left = Math.min(0,...points.map(p => p[0]-8));
    const top = Math.min(0,...points.map(p => p[1]-8));
    return [left,top,Math.max(360,...points.map(p => p[0]+8))-left,Math.max(280,...points.map(p => p[1]+8))-top];
  }
  const api = { layoutDAG, routeEdges, bounds };
  if (typeof module !== 'undefined') module.exports = api;
  else root.GraphLayout = api;
})(globalThis);
