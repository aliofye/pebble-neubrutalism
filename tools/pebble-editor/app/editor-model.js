'use strict';

// Visual editor model + DOM glue. Pure model ops are exported for tests;
// DOM code only runs in the browser.

const PV = (typeof require !== 'undefined')
  ? require('./preview')
  : (typeof window !== 'undefined' ? window.PEPreview : null);

// Platform registry: every supported rectangular platform, its device
// pixels, and the shared screen definition it renders. Same-size platforms
// share one screen (w144); the editor shows one canvas per platform.
const PLATFORMS = {
  aplite: { w: 144, h: 168, screen: 'w144' },
  basalt: { w: 144, h: 168, screen: 'w144' },
  diorite: { w: 144, h: 168, screen: 'w144' },
  flint: { w: 144, h: 168, screen: 'w144' },
  emery: { w: 200, h: 228, screen: 'w200' },
};

function platformScreen(platform) {
  return (PLATFORMS[platform] || {}).screen || null;
}

// Which platform canvases to show: an explicit saved selection wins,
// otherwise the design's build targets. Unknown names are dropped.
function visiblePlatforms(design, saved) {
  const pick = Array.isArray(saved) && saved.length ? saved
    : ((design && design.app && design.app.targets) || []);
  return pick.filter(p => PLATFORMS[p]);
}

// Which size canvases to show: '144' and/or '200'. Same input rule as
// visiblePlatforms, mapped through platform dims; the 144 canvas renders
// twice (color + monochrome preview).
function visibleSizes(design, saved) {
  const ok = Array.isArray(saved) && saved.length
    ? saved.filter(s => s === '144' || s === '200')
    : visiblePlatforms(design, null).map(p => String(PLATFORMS[p].w));
  const out = [];
  for (const s of ok) if (!out.includes(s)) out.push(s);
  return out.length ? out : ['144', '200'];
}

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
  if (item.kind === 'rect' || item.kind === 'meterbar' || item.kind === 'bar') {
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
        const grp = groupContaining(design, screenId, li, ii);
        if (grp && grp.locked) continue;
        const b = itemBounds(design, screenId, li, ii);
        if (!b) continue;
        if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
          if (b.poly && !pointInPoly(x, y, b.poly)) continue;
          return { layer: li, item: ii };
        }
      }
    } else {
      const grp = groupContaining(design, screenId, li, null);
      if (grp && grp.locked) continue;
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
        const grp = groupContaining(design, screenId, li, ii);
        if (grp && grp.locked) return;
        push(itemBounds(design, screenId, li, ii));
      });
    } else {
      if (exclude && exclude.layer === li && exclude.item == null) return;
      const grp = groupContaining(design, screenId, li, null);
      if (grp && grp.locked) return;
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

// Widget bindings: layers/items read `$state` refs; widgets (plus settings
// and the core) provide them. These helpers back the editor's source
// pickers: compatible providers per value type, `$ref` parsing, and
// auto-adding the owning widget to the design when a binding is chosen.
function listProviders(manifests, settings) {
  const out = { string: [], int: [], bool: [] };
  for (const [wname, m] of Object.entries(manifests || {})) {
    for (const p of (m && m.provides) || []) {
      if (out[p.type]) out[p.type].push({ name: p.name, owner: wname, widget: wname });
    }
  }
  for (const se of settings || []) {
    const t = se.kind === 'bool' ? 'bool' : 'int';
    out[t].push({ name: se.var, owner: 'setting:' + se.key, widget: null });
  }
  out.bool.push({ name: 'bt', owner: 'core', widget: null });
  return out;
}

function bindingOf(ref) {
  if (typeof ref !== 'string' || !ref.startsWith('$') || ref.length < 2) return null;
  return ref.slice(1);
}

function ensureWidget(design, wname) {
  if (!wname) return false;
  design.widgets = design.widgets || [];
  if (design.widgets.includes(wname)) return false;
  design.widgets.push(wname);
  return true;
}

// Generic authoring ops (blank-first editor + replay script share these).
// Single-screen primitives plus explicit mirror helpers; the UI and the
// replay script compose them — no direct JSON poking elsewhere.
function slugId(base) {
  const s = String(base || 'layer').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return /^[a-z][a-z0-9_]*$/.test(s) ? s : 'layer';
}

function uniqueLayerId(design, screenId, base) {
  const sc = getScreen(design, screenId);
  const taken = new Set(sc.layers.map(l => l.id));
  let id = slugId(base);
  if (!taken.has(id)) return id;
  let n = 2;
  while (taken.has(id + '_' + n)) n++;
  return id + '_' + n;
}

function addLayer(design, screenId, kind, opts) {
  const sc = getScreen(design, screenId);
  const o = opts || {};
  const id = uniqueLayerId(design, screenId, o.id || kind);
  let layer;
  if (kind === 'graphics') {
    layer = { id, kind: 'graphics', items: [] };
  } else if (kind === 'text') {
    layer = {
      id, kind: 'text',
      box: o.box || { x: 10, y: 10, w: 72, h: 28 },
      font: o.font || ((design.fonts || [])[0] || {}).id || 'jersey25',
      fill: o.fill || '$ink',
      align: o.align || 'center',
      vcenter: o.vcenter !== undefined ? o.vcenter : true,
      text: o.text || '$date_str',
    };
  } else if (kind === 'pixeltext') {
    layer = {
      id, kind: 'pixeltext',
      box: o.box || { x: 10, y: 10, w: 100, h: 40 },
      pixelFont: o.pixelFont || Object.keys(design.pixelFonts || {})[0] || 'digits',
      fill: o.fill || '$ink',
      text: o.text || '$time_str',
      scaleDivisor: o.scaleDivisor || 40,
    };
  } else {
    throw new Error('unknown layer kind ' + kind);
  }
  if (o.visibleWhen) layer.visibleWhen = o.visibleWhen;
  if (o.note) layer.note = o.note;
  const at = (o.at === undefined || o.at === null) ? sc.layers.length : o.at;
  sc.layers.splice(Math.max(0, Math.min(at, sc.layers.length)), 0, layer);
  return sc.layers.indexOf(layer);
}

function deleteLayer(design, screenId, idx) {
  const sc = getScreen(design, screenId);
  if (idx < 0 || idx >= sc.layers.length) return false;
  sc.layers.splice(idx, 1);
  return true;
}

const ITEM_DEFAULTS = {
  rect: { w: 40, h: 30 },
  polygon: { w: 60, h: 40 },
  meterbar: { w: 100, h: 28 },
  bar: { w: 100, h: 20 },
};

function defaultItem(kind, x, y) {
  if (kind === 'rect') {
    return { kind: 'rect', box: { x, y, w: 40, h: 30 }, fill: '$body' };
  }
  if (kind === 'polygon') {
    return {
      kind: 'polygon',
      points: [[x, y], [x + 60, y], [x + 60, y + 40], [x, y + 40]],
      fill: '$body', outline: { stroke: 3 },
    };
  }
  if (kind === 'meterbar') {
    return {
      kind: 'meterbar',
      box: { x, y, w: 100, h: 28 },
      stroke: 3, shadow: { dx: 2, dy: 3 },
      frame: '$battery_frame', core: '$ink',
      value: '$battery', fill: '$battery_bar',
      inset: 3, compact: { maxH: 30, stroke: 3, inset: 2 },
    };
  }
  if (kind === 'bar') {
    return {
      kind: 'bar',
      box: { x, y, w: 100, h: 20 },
      value: '$battery', fill: '$battery_bar', track: '$battery_frame',
    };
  }
  throw new Error('unknown item kind ' + kind);
}

function addItem(design, screenId, layerIdx, kind, x, y, opts) {
  const sc = getScreen(design, screenId);
  const layer = sc.layers[layerIdx];
  if (!layer || layer.kind !== 'graphics') throw new Error('items only go in graphics layers');
  const item = Object.assign(defaultItem(kind, x || 10, y || 10), opts || {});
  layer.items.push(item);
  return layer.items.length - 1;
}

function deleteItem(design, screenId, layerIdx, itemIdx) {
  const sc = getScreen(design, screenId);
  const layer = sc.layers[layerIdx];
  if (!layer || !layer.items || itemIdx < 0 || itemIdx >= layer.items.length) return false;
  layer.items.splice(itemIdx, 1);
  return true;
}

function siblingScreenId(design, screenId) {
  const me = getScreen(design, screenId);
  if (!me) return null;
  for (const [sid, sc] of Object.entries(design.screens)) {
    if (sid !== screenId && sc.w !== me.w) return sid;
  }
  return null;
}

function scaleXYWH(x, y, w, h, sx, sy) {
  return { x: Math.round(x * sx), y: Math.round(y * sy), w: Math.max(1, Math.round(w * sx)), h: Math.max(1, Math.round(h * sy)) };
}

function siblingScale(design, fromId, toId) {
  const a = getScreen(design, fromId), b = getScreen(design, toId);
  return { sx: b.w / a.w, sy: b.h / a.h };
}

function evalBoxInts(design, screenId, box) {
  const sc = getScreen(design, screenId);
  const consts = design.constants || {};
  return {
    x: PV.evalDim(box.x, sc.w, sc.h, consts),
    y: PV.evalDim(box.y, sc.w, sc.h, consts),
    w: PV.evalDim(box.w, sc.w, sc.h, consts),
    h: PV.evalDim(box.h, sc.w, sc.h, consts),
  };
}

function scaledBoxFor(design, fromId, toId, box) {
  const b = evalBoxInts(design, fromId, box);
  const { sx, sy } = siblingScale(design, fromId, toId);
  return scaleXYWH(b.x, b.y, b.w, b.h, sx, sy);
}

function scaledPointsFor(design, fromId, toId, points) {
  const sc = getScreen(design, fromId);
  const consts = design.constants || {};
  const { sx, sy } = siblingScale(design, fromId, toId);
  return points.map(pt => [
    Math.round(PV.evalDim(pt[0], sc.w, sc.h, consts) * sx),
    Math.round(PV.evalDim(pt[1], sc.w, sc.h, consts) * sy),
  ]);
}

function scaledCenterFor(design, fromId, toId, center) {
  const sc = getScreen(design, fromId);
  const consts = design.constants || {};
  const { sx, sy } = siblingScale(design, fromId, toId);
  return [
    Math.round(PV.evalDim(center[0], sc.w, sc.h, consts) * sx),
    Math.round(PV.evalDim(center[1], sc.w, sc.h, consts) * sy),
  ];
}

function scaledItemFor(design, fromId, toId, item) {
  const c = JSON.parse(JSON.stringify(item));
  if (c.box) c.box = scaledBoxFor(design, fromId, toId, item.box);
  if (c.points) c.points = scaledPointsFor(design, fromId, toId, item.points);
  if (c.center) c.center = scaledCenterFor(design, fromId, toId, item.center);
  return c;
}

// Mirror a whole layer (by id) or a single item into the sibling screen,
// creating the sibling layer if needed. Returns the sibling index or -1.
function mirrorLayerToSibling(design, fromId, layerIdx) {
  const toId = siblingScreenId(design, fromId);
  if (!toId) return -1;
  const src = getScreen(design, fromId).layers[layerIdx];
  if (!src) return -1;
  const dst = getScreen(design, toId);
  const copy = JSON.parse(JSON.stringify(src));
  if (copy.box) copy.box = scaledBoxFor(design, fromId, toId, src.box);
  if (copy.items) copy.items = src.items.map(it => scaledItemFor(design, fromId, toId, it));
  const existing = dst.layers.findIndex(l => l.id === copy.id);
  if (existing >= 0) dst.layers[existing] = copy;
  else dst.layers.push(copy);
  return dst.layers.findIndex(l => l.id === copy.id);
}

function mirrorItemToSibling(design, fromId, layerIdx, itemIdx) {
  const toId = siblingScreenId(design, fromId);
  if (!toId) return -1;
  const srcLayer = getScreen(design, fromId).layers[layerIdx];
  const item = srcLayer && srcLayer.items && srcLayer.items[itemIdx];
  if (!item) return -1;
  const dst = getScreen(design, toId);
  let di = dst.layers.findIndex(l => l.id === srcLayer.id);
  if (di < 0) {
    const nl = { id: srcLayer.id, kind: 'graphics', items: [] };
    if (srcLayer.note) nl.note = srcLayer.note;
    if (srcLayer.visibleWhen) nl.visibleWhen = JSON.parse(JSON.stringify(srcLayer.visibleWhen));
    dst.layers.push(nl);
    di = dst.layers.length - 1;
  }
  dst.layers[di].items.push(scaledItemFor(design, fromId, toId, item));
  return dst.layers[di].items.length - 1;
}

function ensureStateVar(design, name, type, desc) {
  design.state = design.state || [];
  const hit = design.state.find(s => s.name === name);
  if (hit) return false;
  design.state.push({ name, type, desc: desc || '' });
  return true;
}

function eachConditionVar(cond, out) {
  if (!cond) return;
  const tests = Array.isArray(cond) ? cond : (cond.any || [cond]);
  (Array.isArray(tests) ? tests : []).forEach(t => {
    if (t && typeof t.var === 'string' && !t.var.startsWith('theme.')) out.add(t.var);
  });
}

function eachFillVars(fill, out) {
  if (!fill || typeof fill === 'string') return;
  for (const c of fill.cases || []) {
    eachConditionVar(c.when, out);
    eachFillVars(c.fill, out);
  }
}

// Every state var referenced anywhere: text/value refs plus condition vars.
function collectRefs(design) {
  const bindings = new Set(), condVars = new Set();
  for (const sc of Object.values(design.screens || {})) {
    for (const layer of sc.layers || []) {
      if (typeof layer.text === 'string') {
        const b = bindingOf(layer.text);
        if (b) bindings.add(b);
      }
      eachConditionVar(layer.visibleWhen, condVars);
      if (layer.fill && typeof layer.fill === 'object') eachFillVars(layer.fill, condVars);
      if (layer.scaleOverride) {
        for (const o of layer.scaleOverride) eachConditionVar(o.when, condVars);
      }
      for (const item of layer.items || []) {
        if (typeof item.value === 'string') {
          const b = bindingOf(item.value);
          if (b) bindings.add(b);
        }
        eachConditionVar(item.visibleWhen, condVars);
        for (const k of ['fill', 'frame', 'core']) {
          if (item[k] && typeof item[k] === 'object') eachFillVars(item[k], condVars);
        }
      }
    }
  }
  return { bindings, condVars, all: new Set([...bindings, ...condVars]) };
}

const CORE_VARS = new Set(['bt']);

// One-level groups: named lockable member sets per screen. Members are
// {layer: <id>, item?: <index>}; an absent item means the whole layer.
// Group locks ride in the same vis.locked map as layers, keyed
// 'group:<id>', so hitTest/isVisible need no shape change.
function screenGroups(design, screenId) {
  const sc = getScreen(design, screenId);
  if (!sc.groups) sc.groups = [];
  return sc.groups;
}

function uniqueGroupId(design, screenId, base) {
  const taken = new Set(screenGroups(design, screenId).map(g => g.id));
  let id = slugId(base || 'group');
  if (!taken.has(id)) return id;
  let n = 2;
  while (taken.has(id + '_' + n)) n++;
  return id + '_' + n;
}

function layerIdAt(design, screenId, layerIdx) {
  const sc = getScreen(design, screenId);
  return sc.layers[layerIdx] ? sc.layers[layerIdx].id : null;
}

function resolveMember(design, screenId, member) {
  const sc = getScreen(design, screenId);
  const li = sc.layers.findIndex(l => l.id === member.layer);
  if (li < 0) return null;
  if (member.item !== undefined) {
    const layer = sc.layers[li];
    if (!layer.items || member.item < 0 || member.item >= layer.items.length) return null;
  }
  return { layer: li, item: member.item !== undefined ? member.item : null };
}

function createGroup(design, screenId, label, members) {
  const groups = screenGroups(design, screenId);
  const id = uniqueGroupId(design, screenId, label || 'group');
  // Drop members that don't resolve; refuse empty groups.
  const ok = (members || []).filter(m => resolveMember(design, screenId, m));
  if (!ok.length) throw new Error('group needs at least one resolvable member');
  // A member may live in one group only: steal nothing, reject overlaps.
  const norm = (m) => m.layer + ':' + (m.item === undefined ? '*' : m.item);
  const want = new Set(ok.map(norm));
  for (const g of groups) {
    for (const m of g.members) {
      if (want.has(norm(m))) throw new Error('member already in group ' + g.id);
    }
  }
  groups.push({ id, label: label || id, locked: false, members: ok });
  return id;
}

function deleteGroup(design, screenId, groupId) {
  const groups = screenGroups(design, screenId);
  const i = groups.findIndex(g => g.id === groupId);
  if (i < 0) return false;
  groups.splice(i, 1);
  return true;
}

function setGroupLock(design, screenId, groupId, locked) {
  const g = screenGroups(design, screenId).find(g => g.id === groupId);
  if (!g) return false;
  g.locked = !!locked;
  return true;
}

function groupContaining(design, screenId, layerIdx, itemIdx) {
  const lid = layerIdAt(design, screenId, layerIdx);
  if (!lid) return null;
  const normItem = (itemIdx === undefined || itemIdx === null) ? null : itemIdx;
  for (const g of screenGroups(design, screenId)) {
    for (const m of g.members) {
      if (m.layer !== lid) continue;
      const mi = m.item === undefined ? null : m.item;
      if (mi === null || normItem === null || mi === normItem) return g;
    }
  }
  return null;
}

function moveGroup(design, screenId, groupId, dx, dy) {
  if (!dx && !dy) return false;
  const g = screenGroups(design, screenId).find(g => g.id === groupId);
  if (!g) return false;
  let moved = false;
  for (const m of g.members) {
    const sel = resolveMember(design, screenId, m);
    if (!sel) continue;
    moveTarget(design, screenId, sel, dx, dy);
    moved = true;
  }
  return moved;
}

function boxesEqual(a, b) {
  return a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function pointsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((pt, i) => pt[0] === b[i][0] && pt[1] === b[i][1]);
}

// Find the sibling item corresponding to a source item: same kind with
// mirrored geometry. Returns the sibling index, or appends a mirrored copy
// and returns its index when the layer exists but the item is missing.
function mirrorMemberItem(design, fromId, toId, layerId, itemIdx) {
  const srcLayer = getScreen(design, fromId).layers.find(l => l.id === layerId);
  const srcItem = srcLayer && srcLayer.items && srcLayer.items[itemIdx];
  if (!srcItem) return -1;
  const dst = getScreen(design, toId);
  let di = dst.layers.findIndex(l => l.id === layerId);
  if (di < 0) {
    mirrorLayerToSibling(design, fromId, getScreen(design, fromId).layers.indexOf(srcLayer));
    di = dst.layers.findIndex(l => l.id === layerId);
    if (di < 0) return -1;
  }
  const dstLayer = dst.layers[di];
  if ((dstLayer.kind || 'graphics') !== 'graphics') return -1;
  const match = (dstLayer.items || []).findIndex(it => {
    if (it.kind !== srcItem.kind) return false;
    if (it.kind === 'polygon') {
      return pointsEqual(it.points, scaledPointsFor(design, fromId, toId, srcItem.points));
    }
    if (it.kind === 'bitmap') {
      const c = scaledCenterFor(design, fromId, toId, srcItem.center);
      return it.center[0] === c[0] && it.center[1] === c[1] && it.id === srcItem.id;
    }
    if (!it.box || !srcItem.box) return !it.box && !srcItem.box;
    const sb = scaledBoxFor(design, fromId, toId, srcItem.box);
    return boxesEqual({ x: PV.evalDim(it.box.x, dst.w, dst.h, design.constants || {}),
      y: PV.evalDim(it.box.y, dst.w, dst.h, design.constants || {}),
      w: PV.evalDim(it.box.w, dst.w, dst.h, design.constants || {}),
      h: PV.evalDim(it.box.h, dst.w, dst.h, design.constants || {}) }, sb);
  });
  if (match >= 0) return match;
  dstLayer.items.push(scaledItemFor(design, fromId, toId, srcItem));
  return dstLayer.items.length - 1;
}

function mirrorGroupToSibling(design, fromId, groupId) {
  const toId = siblingScreenId(design, fromId);
  if (!toId) return false;
  const src = screenGroups(design, fromId).find(g => g.id === groupId);
  if (!src) return false;
  const dst = screenGroups(design, toId);
  const members = [];
  for (const m of src.members) {
    if (m.item === undefined) {
      // Whole-layer member: ensure the sibling layer exists.
      if (!getScreen(design, toId).layers.some(l => l.id === m.layer)) {
        const li = getScreen(design, fromId).layers.findIndex(l => l.id === m.layer);
        if (li >= 0) mirrorLayerToSibling(design, fromId, li);
      }
      if (getScreen(design, toId).layers.some(l => l.id === m.layer)) {
        members.push({ layer: m.layer });
      }
      continue;
    }
    const idx = mirrorMemberItem(design, fromId, toId, m.layer, m.item);
    if (idx >= 0) members.push({ layer: m.layer, item: idx });
  }
  if (!members.length) return false;
  const copy = JSON.parse(JSON.stringify(src));
  copy.members = members;
  const existing = dst.findIndex(g => g.id === copy.id);
  if (existing >= 0) dst[existing] = copy;
  else dst.push(copy);
  return true;
}

function pruneUnusedWidgets(design, manifests) {
  const refs = collectRefs(design);
  const removed = { widgets: [], state: [] };
  design.widgets = design.widgets || [];
  design.widgets = design.widgets.filter(w => {
    const m = (manifests || {})[w];
    const provided = ((m && m.provides) || []).map(p => p.name);
    if (!provided.length) return true;
    const used = provided.some(n => refs.all.has(n));
    if (!used) removed.widgets.push(w);
    return used;
  });
  const settingVars = new Set((design.settings || []).map(s => s.var));
  design.state = (design.state || []).filter(s => {
    if (settingVars.has(s.name) || CORE_VARS.has(s.name)) return true;
    if (!refs.all.has(s.name)) {
      removed.state.push(s.name);
      return false;
    }
    return true;
  });
  return removed;
}

const MODEL = {
  PLATFORMS, platformScreen, visiblePlatforms, visibleSizes,
  getScreen, screenWH, itemBounds, pointInPoly, hitTest, isVisible,
  moveTarget, resizeTarget, moveVertex, reorderLayer,
  collectGuides, snapCoord,
  listProviders, bindingOf, ensureWidget,
  slugId, uniqueLayerId, addLayer, deleteLayer, addItem, deleteItem,
  siblingScreenId, siblingScale, scaledBoxFor, scaledPointsFor, scaledCenterFor,
  scaledItemFor, mirrorLayerToSibling, mirrorItemToSibling,
  ensureStateVar, collectRefs, pruneUnusedWidgets,
  screenGroups, uniqueGroupId, createGroup, deleteGroup, setGroupLock,
  groupContaining, moveGroup, mirrorGroupToSibling, resolveMember,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MODEL;
} else if (typeof window !== 'undefined') {
  window.PEEditor = MODEL;
}
