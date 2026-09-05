'use strict';

// Visual editor model + DOM glue. Pure model ops are exported for tests;
// DOM code only runs in the browser.

const PV = (typeof require !== 'undefined')
  ? require('./preview')
  : (typeof window !== 'undefined' ? window.PEPreview : null);

function getScreen(design, screenId) {
  return design.screens[screenId];
}

function screenWH(design, screenId) {
  const sc = getScreen(design, screenId);
  return [sc.w, sc.h];
}

function bakeDim(v, w, h, consts) {
  return PV.evalDim(v, w, h, consts);
}

function itemBounds(design, screenId, layerIdx, itemIdx) {
  const sc = getScreen(design, screenId);
  const consts = design.constants || {};
  const layer = sc.layers[layerIdx];
  if (itemIdx === undefined || itemIdx === null) {
    if (!layer.box) return null;
    const b = PV.evalBox(layer.box, sc.w, sc.h, consts);
    return { x: b.x, y: b.y, w: b.w, h: b.h };
  }
  const item = layer.items[itemIdx];
  if (item.kind === 'rect' || item.kind === 'meterbar') {
    const b = PV.evalBox(item.box, sc.w, sc.h, consts);
    return { x: b.x, y: b.y, w: b.w, h: b.h };
  }
  if (item.kind === 'polygon') {
    const pts = item.points.map(pt => [
      PV.evalDim(pt[0], sc.w, sc.h, consts),
      PV.evalDim(pt[1], sc.w, sc.h, consts),
    ]);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    const y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, poly: pts };
  }
  if (item.kind === 'bitmap') {
    const cx = PV.evalDim(item.center[0], sc.w, sc.h, consts);
    const cy = PV.evalDim(item.center[1], sc.w, sc.h, consts);
    return { x: cx - 16, y: cy - 16, w: 32, h: 32 };
  }
  return null;
}

function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1];
    const xj = pts[j][0], yj = pts[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function isVisible(design, layer, item, vis) {
  if (!vis) return true;
  if (vis.hidden && vis.hidden[layer.id]) return false;
  if (vis.locked && vis.locked[layer.id]) return false;
  const theme = (design.themes || [])[(vis.themeIdx || 0)] || { tokens: {}, flags: {} };
  const state = vis.state || {};
  if (!PV.evalCond(layer.visibleWhen, theme, state)) return false;
  if (item && !PV.evalCond(item.visibleWhen, theme, state)) return false;
  return true;
}

function hitTest(design, screenId, x, y, vis) {
  const sc = getScreen(design, screenId);
  for (let li = sc.layers.length - 1; li >= 0; li--) {
    const layer = sc.layers[li];
    if (!isVisible(design, layer, null, vis)) continue;
    if (layer.kind === 'graphics') {
      for (let ii = layer.items.length - 1; ii >= 0; ii--) {
        const item = layer.items[ii];
        if (!isVisible(design, layer, item, vis)) continue;
        const b = itemBounds(design, screenId, li, ii);
        if (!b) continue;
        if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
          if (b.poly && !pointInPoly(x, y, b.poly)) continue;
          return { layer: li, item: ii };
        }
      }
    } else {
      const b = itemBounds(design, screenId, li, null);
      if (b && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
        return { layer: li, item: null };
      }
    }
  }
  return null;
}

function targetBox(design, screenId, sel) {
  const sc = getScreen(design, screenId);
  const layer = sc.layers[sel.layer];
  if (sel.item === undefined || sel.item === null) return layer.box;
  return layer.items[sel.item].box;
}

function moveTarget(design, screenId, sel, dx, dy) {
  if (!dx && !dy) return;
  const sc = getScreen(design, screenId);
  const consts = design.constants || {};
  const box = targetBox(design, screenId, sel);
  if (box) {
    box.x = bakeDim(box.x, sc.w, sc.h, consts) + dx;
    box.y = bakeDim(box.y, sc.w, sc.h, consts) + dy;
    return;
  }
  const layer = sc.layers[sel.layer];
  const item = layer.items[sel.item];
  if (item.kind === 'bitmap') {
    item.center[0] = bakeDim(item.center[0], sc.w, sc.h, consts) + dx;
    item.center[1] = bakeDim(item.center[1], sc.w, sc.h, consts) + dy;
    return;
  }
  if (item.kind === 'polygon') {
    for (const pt of item.points) {
      pt[0] = bakeDim(pt[0], sc.w, sc.h, consts) + dx;
      pt[1] = bakeDim(pt[1], sc.w, sc.h, consts) + dy;
    }
  }
}

function resizeTarget(design, screenId, sel, edge, dx, dy) {
  const sc = getScreen(design, screenId);
  const consts = design.constants || {};
  const box = targetBox(design, screenId, sel);
  if (!box) return;
  let x = bakeDim(box.x, sc.w, sc.h, consts);
  let y = bakeDim(box.y, sc.w, sc.h, consts);
  let w = bakeDim(box.w, sc.w, sc.h, consts);
  let h = bakeDim(box.h, sc.w, sc.h, consts);
  if (edge.includes('w')) { x += dx; w -= dx; }
  if (edge.includes('e')) { w += dx; }
  if (edge.includes('n')) { y += dy; h -= dy; }
  if (edge.includes('s')) { h += dy; }
  if (w < 1) { x += w - 1; w = 1; }
  if (h < 1) { y += h - 1; h = 1; }
  box.x = x; box.y = y; box.w = w; box.h = h;
}

function moveVertex(design, screenId, sel, vIdx, dx, dy) {
  const sc = getScreen(design, screenId);
  const consts = design.constants || {};
  const item = sc.layers[sel.layer].items[sel.item];
  const pt = item.points[vIdx];
  pt[0] = bakeDim(pt[0], sc.w, sc.h, consts) + dx;
  pt[1] = bakeDim(pt[1], sc.w, sc.h, consts) + dy;
}

function reorderLayer(design, screenId, from, to) {
  const layers = getScreen(design, screenId).layers;
  if (from < 0 || from >= layers.length || to < 0 || to >= layers.length) return;
  const [moved] = layers.splice(from, 1);
  layers.splice(to, 0, moved);
}

function collectGuides(design, screenId, exclude, vis) {
  const sc = getScreen(design, screenId);
  const xs = [0, Math.floor(sc.w / 2), sc.w];
  const ys = [0, Math.floor(sc.h / 2), sc.h];
  sc.layers.forEach((layer, li) => {
    if (!isVisible(design, layer, null, vis)) return;
    const push = (b) => {
      if (!b) return;
      xs.push(b.x, b.x + b.w, Math.floor(b.x + b.w / 2));
      ys.push(b.y, b.y + b.h, Math.floor(b.y + b.h / 2));
    };
    if (layer.kind === 'graphics') {
      layer.items.forEach((item, ii) => {
        if (exclude && exclude.layer === li && exclude.item === ii) return;
        if (!isVisible(design, layer, item, vis)) return;
        push(itemBounds(design, screenId, li, ii));
      });
    } else {
      if (exclude && exclude.layer === li && exclude.item == null) return;
      push(itemBounds(design, screenId, li, null));
    }
  });
  return { xs, ys };
}

function snapCoord(v, guides, tol) {
  let best = v, bestD = (tol === undefined ? 2 : tol) + 1, hit = null;
  for (const g of guides) {
    const d = Math.abs(v - g);
    if (d < bestD) { bestD = d; best = g; hit = g; }
  }
  return { v: best, guide: hit };
}

const MODEL = {
  getScreen, screenWH, itemBounds, pointInPoly, hitTest, isVisible,
  moveTarget, resizeTarget, moveVertex, reorderLayer,
  collectGuides, snapCoord,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MODEL;
} else if (typeof window !== 'undefined') {
  window.PEEditor = MODEL;
}
