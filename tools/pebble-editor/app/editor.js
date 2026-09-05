'use strict';
/* Browser-only editor shell. Depends on preview.js (PEPreview) and
   editor-model.js (PEEditor) loaded before this script. */

(function () {
  if (typeof window === 'undefined') return;
  const PV = window.PEPreview;
  const MODEL = window.PEEditor;

  const $ = (id) => document.getElementById(id);

  const S = {
    design: null,
    facePath: null,
    resMap: {},
    themeIdx: 0,
    state: {},
    hidden: {},
    locked: {},
    selections: {},
    zoom: 3,
    undo: [],
    redo: [],
    liveClock: true,
    fonts: {},
    bitmaps: {},
    vertexMode: {},
  };

  function status(msg) {
    $('status').textContent = msg;
  }

  function snapshot() {
    S.undo.push(JSON.stringify(S.design));
    if (S.undo.length > 50) S.undo.shift();
    S.redo.length = 0;
  }

  function restore(json) {
    S.design = JSON.parse(json);
    S.selections = {};
    S.vertexMode = {};
    renderAll();
    renderPanels();
  }

  function undo() {
    if (!S.undo.length) return;
    S.redo.push(JSON.stringify(S.design));
    restore(S.undo.pop());
  }

  function redo() {
    if (!S.redo.length) return;
    S.undo.push(JSON.stringify(S.design));
    restore(S.redo.pop());
  }

  async function api(path, opts) {
    const res = await fetch(path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }

  async function loadFace(facePath) {
    const data = await api('/api/design?path=' + encodeURIComponent(facePath));
    S.design = data.design;
    S.facePath = facePath;
    S.themeIdx = 0;
    S.hidden = {};
    S.locked = {};
    S.locked = {};
    S.selections = {};
    S.vertexMode = {};
    S.undo = [];
    S.redo = [];
    initState();
    buildCanvases();
    renderAll();
    renderPanels();
    renderStatePanel();
    status('loaded ' + facePath);
    loadResources(facePath).then(renderAll).catch((e) => status('resources: ' + e.message));
  }

  function initState() {
    S.state = {};
    for (const v of S.design.state || []) {
      if (v.type === 'int') S.state[v.name] = 0;
      else if (v.type === 'bool') S.state[v.name] = true;
      else S.state[v.name] = '';
    }
    if ('battery' in S.state) S.state.battery = 100;
    if ('steps' in S.state) S.state.steps = 40;
    tickClock();
  }

  function tickClock() {
    if (!S.design) return;
    if (S.liveClock && 'time_str' in S.state) {
      const now = new Date();
      const hh = now.getHours(), mm = now.getMinutes();
      const disp = S.state.h24 ? hh : (hh % 12 === 0 ? 12 : hh % 12);
      S.state.time_str = (disp < 10 ? disp : String(disp).padStart(2, '0')) +
        ':' + String(mm).padStart(2, '0');
      if ('display_hour' in S.state) S.state.display_hour = disp;
      if ('date_str' in S.state) {
        const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        S.state.date_str = MON[now.getMonth()] + ' ' + String(now.getDate()).padStart(2, '0');
      }
      if ('weather_str' in S.state && !S.state.weather_str) S.state.weather_str = '78°F';
    }
  }

  async function loadFont(fontId) {
    const f = (S.design.fonts || []).find(f => f.id === fontId);
    if (!f) return;
    const url = S.resMap[f.resource];
    if (!url) {
      S.fonts[f.id] = { resource: f.resource, family: 'monospace' };
      return;
    }
    const family = 'PE_' + f.id;
    try {
      const face = new FontFace(family, 'url(' + url + ')');
      await Promise.race([
        face.load(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);
      document.fonts.add(face);
      S.fonts[f.id] = { resource: f.resource, family };
    } catch (e) {
      S.fonts[f.id] = { resource: f.resource, family: 'monospace' };
    }
  }

  async function loadResources(facePath) {
    S.fonts = {};
    S.bitmaps = {};
    S.resMap = {};
    const base = facePath.replace(/[^/]+$/, '');
    const resPath = base + facePath.split('/').pop().replace(/\.design\.json$/, '.resources.json');
    try {
      const data = await api('/api/design?path=' + encodeURIComponent(resPath));
      S.resMap = data.design || {};
    } catch (e) {
      status('no resources map (' + resPath + '), using fallback fonts');
      return;
    }
    for (const f of S.design.fonts || []) {
      await loadFont(f.id);
    }
    for (const b of S.design.bitmaps || []) {
      const url = S.resMap[b.resource];
      if (!url) continue;
      const img = new Image();
      img.onload = renderAll;
      img.src = url;
      S.bitmaps[b.id] = img;
    }
  }

  function buildCanvases() {
    const stage = $('stage');
    stage.innerHTML = '';
    for (const [screenId, sc] of Object.entries(S.design.screens)) {
      const wrap = document.createElement('div');
      wrap.className = 'screen';
      const title = document.createElement('h2');
      title.textContent = screenId + ' — ' + sc.w + '×' + sc.h;
      const cv = document.createElement('canvas');
      cv.width = sc.w;
      cv.height = sc.h;
      cv.dataset.screen = screenId;
      cv.style.width = (sc.w * S.zoom) + 'px';
      wrap.appendChild(title);
      wrap.appendChild(cv);
      stage.appendChild(wrap);
      attachCanvas(cv, screenId);
    }
  }

  function canvasFor(screenId) {
    return document.querySelector('canvas[data-screen="' + screenId + '"]');
  }

  function renderOne(screenId) {
    const cv = canvasFor(screenId);
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    PV.drawScreen(ctx, S.design, screenId, {
      themeIdx: S.themeIdx,
      state: S.state,
      fonts: S.fonts,
      bitmaps: S.bitmaps,
      hidden: S.hidden,
    });
    drawOverlay(ctx, screenId);
  }

  function renderAll() {
    if (!S.design) return;
    for (const screenId of Object.keys(S.design.screens)) renderOne(screenId);
  }

  function drawOverlay(ctx, screenId) {
    // Device-pixel space: the canvas backing store is w×h and CSS upscaling
    // is handled by the browser, so NO scale transform here (scaling would
    // draw the overlay zoom-times too big and offset).
    const sel = S.selections[screenId];
    if (!sel) return;
    ctx.save();
    if (sel.vertex !== undefined && sel.vertex !== null) {
      const sc = S.design.screens[screenId];
      const item = sc.layers[sel.layer].items[sel.item];
      const pts = item.points.map(pt => [
        PV.evalDim(pt[0], sc.w, sc.h, S.design.constants || {}),
        PV.evalDim(pt[1], sc.w, sc.h, S.design.constants || {}),
      ]);
      ctx.fillStyle = '#4da3ff';
      pts.forEach((p, i) => {
        ctx.fillRect(p[0] - 2, p[1] - 2, 5, 5);
        if (i === sel.vertex) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.strokeRect(p[0] - 3, p[1] - 3, 7, 7);
        }
      });
    } else {
      const b = MODEL.itemBounds(S.design, screenId, sel.layer,
        sel.item === undefined ? null : sel.item);
      if (!b) { ctx.restore(); return; }
      ctx.strokeStyle = '#4da3ff';
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x, b.y, Math.max(b.w, 1), Math.max(b.h, 1));
      ctx.fillStyle = '#4da3ff';
      const hs = 5;
      const handles = handlePositions(b);
      for (const h of Object.values(handles)) {
        ctx.fillRect(h[0] - hs / 2, h[1] - hs / 2, hs, hs);
      }
    }
    const hov = S.hover && S.hover.screen === screenId ? S.hover : null;
    if (hov && (!sel || hov.layer !== sel.layer || hov.item !== sel.item)) {
      const hb = MODEL.itemBounds(S.design, screenId, hov.layer,
        hov.item === undefined ? null : hov.item);
      if (hb) {
        ctx.strokeStyle = '#9a9aa2';
        ctx.lineWidth = 1;
        ctx.strokeRect(hb.x, hb.y, Math.max(hb.w, 1), Math.max(hb.h, 1));
      }
    }
    if (S.guides && S.guides.screen === screenId) {
      ctx.strokeStyle = '#ff5d5d';
      ctx.lineWidth = 1;
      for (const gx of S.guides.xs || []) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, 10000); ctx.stroke();
      }
      for (const gy of S.guides.ys || []) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(10000, gy); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function handlePositions(b) {
    const mx = b.x + b.w / 2, my = b.y + b.h / 2;
    return {
      nw: [b.x, b.y], n: [mx, b.y], ne: [b.x + b.w, b.y],
      w: [b.x, my], e: [b.x + b.w, my],
      sw: [b.x, b.y + b.h], s: [mx, b.y + b.h], se: [b.x + b.w, b.y + b.h],
    };
  }

  function toDevice(e, cv) {
    const r = cv.getBoundingClientRect();
    return [
      Math.round((e.clientX - r.left) / S.zoom),
      Math.round((e.clientY - r.top) / S.zoom),
    ];
  }

  function visState() {
    return { themeIdx: S.themeIdx, state: S.state, hidden: S.hidden, locked: S.locked };
  }

  // Panels always follow the last-clicked canvas (fallback: first screen).
  function activeScreenId() {
    if (S.design && S.activeScreen && S.design.screens[S.activeScreen]) {
      return S.activeScreen;
    }
    return S.design ? Object.keys(S.design.screens)[0] : null;
  }

  // Initial zoom: fit the whole side-by-side row (and height) into the
  // stage, so every canvas is visible and clickable (0.5 steps, 1–6).
  function zoomToFit() {
    if (!S.design) return;
    const stage = $('stage');
    const screens = Object.values(S.design.screens);
    const rowW = screens.reduce((a, sc) => a + sc.w, 0) +
      28 * (screens.length - 1) + 56;
    const maxH = Math.max.apply(null, screens.map(sc => sc.h)) + 90;
    const availW = Math.max(200, stage.clientWidth - 60);
    const availH = Math.max(200, stage.clientHeight - 20);
    const fit = Math.min(6, Math.max(1,
      Math.floor(Math.min(availW / rowW, availH / maxH) * 2) / 2));
    S.zoom = fit;
    const sel = $('zoomSel');
    let opt = Array.from(sel.options).find(o => +o.value === fit);
    if (!opt) {
      opt = document.createElement('option');
      opt.value = fit;
      opt.textContent = ('' + fit).replace(/\.0$/, '') + 'x (fit)';
      sel.appendChild(opt);
    }
    sel.value = fit;
  }

  function hitHandle(screenId, x, y) {
    const sel = S.selections[screenId];
    if (!sel || sel.vertex !== undefined && sel.vertex !== null) return null;
    const b = MODEL.itemBounds(S.design, screenId, sel.layer,
      sel.item === undefined ? null : sel.item);
    if (!b) return null;
    const tol = 4;
    for (const [name, h] of Object.entries(handlePositions(b))) {
      if (Math.abs(x - h[0]) <= tol && Math.abs(y - h[1]) <= tol) return name;
    }
    return null;
  }

  function attachCanvas(cv, screenId) {
    let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      S.activeScreen = screenId;
      cv.setPointerCapture(e.pointerId);
      const [x, y] = toDevice(e, cv);
      const sel = S.selections[screenId];
      if (sel && sel.vertex !== undefined && sel.vertex !== null) {
        const sc = S.design.screens[screenId];
        const item = sc.layers[sel.layer].items[sel.item];
        let best = -1, bestD = 36;
        item.points.forEach((pt, i) => {
          const px = PV.evalDim(pt[0], sc.w, sc.h, S.design.constants || {});
          const py = PV.evalDim(pt[1], sc.w, sc.h, S.design.constants || {});
          const d = (px - x) * (px - x) + (py - y) * (py - y);
          if (d < bestD) { bestD = d; best = i; }
        });
        if (best >= 0) {
          snapshot();
          drag = { kind: 'vertex', idx: best, lx: x, ly: y };
          return;
        }
      }
      const handle = hitHandle(screenId, x, y);
      if (handle && sel) {
        snapshot();
        drag = { kind: 'resize', edge: handle, lx: x, ly: y };
        return;
      }
      const hit = MODEL.hitTest(S.design, screenId, x, y, visState());
      S.selections[screenId] = hit ? { layer: hit.layer, item: hit.item } : null;
      S.vertexMode[screenId] = false;
      if (hit) {
        snapshot();
        S.undo.pop();
        snapshot();
        const hb = MODEL.itemBounds(S.design, screenId, hit.layer,
          hit.item === undefined ? null : hit.item);
        drag = {
          kind: 'maybe-move', lx: x, ly: y,
          grabDX: hb ? x - hb.x : 0,
          grabDY: hb ? y - hb.y : 0,
        };
      }
      S.guides = null;
      renderAll();
      renderPanels();
    });
    const CURSORS = {
      n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
      ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
    };
    cv.addEventListener('pointermove', (e) => {
      const [x, y] = toDevice(e, cv);
      if (!drag) {
        const handle = hitHandle(screenId, x, y);
        if (handle) {
          cv.style.cursor = CURSORS[handle];
          return;
        }
        const hit = MODEL.hitTest(S.design, screenId, x, y, visState());
        const key = hit ? hit.layer + ':' + hit.item : null;
        cv.style.cursor = hit ? 'move' : 'crosshair';
        if (key !== S.hoverKey) {
          S.hoverKey = key;
          S.hover = hit ? { screen: screenId, layer: hit.layer, item: hit.item } : null;
          renderAll();
        }
        return;
      }
      const sel = S.selections[screenId];
      if (!sel) return;
      if (drag.kind === 'maybe-move') {
        if (x !== drag.lx || y !== drag.ly) {
          drag.kind = 'move';
        } else return;
      }
      if (drag.kind === 'vertex') {
        MODEL.moveVertex(S.design, screenId, sel, drag.idx, x - drag.lx, y - drag.ly);
        drag.lx = x; drag.ly = y;
      } else if (drag.kind === 'resize') {
        MODEL.resizeTarget(S.design, screenId, sel, drag.edge, x - drag.lx, y - drag.ly);
        drag.lx = x; drag.ly = y;
      } else if (drag.kind === 'move') {
        // Grab-offset formulation: desired position is absolute (pointer
        // minus grab offset), so cumulative pointer travel is never lost and
        // a snap can only pause motion briefly, never glue it forever.
        const guides = MODEL.collectGuides(S.design, screenId, sel, visState());
        const b = MODEL.itemBounds(S.design, screenId, sel.layer,
          sel.item === undefined ? null : sel.item);
        S.guides = { screen: screenId, xs: [], ys: [] };
        let dx = x - drag.lx, dy = y - drag.ly;
        if (b) {
          const sx = MODEL.snapCoord(x - drag.grabDX, guides.xs, 2);
          const sy = MODEL.snapCoord(y - drag.grabDY, guides.ys, 2);
          if (sx.guide !== null) S.guides.xs.push(sx.guide);
          if (sy.guide !== null) S.guides.ys.push(sy.guide);
          dx = sx.v - b.x;
          dy = sy.v - b.y;
        }
        MODEL.moveTarget(S.design, screenId, sel, dx, dy);
        drag.lx = x; drag.ly = y;
      }
      renderAll();
    });
    const endDrag = () => {
      if (drag && drag.kind === 'maybe-move') {
        S.undo.pop();
      }
      drag = null;
      S.guides = null;
      renderAll();
      renderPanels();
    };
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);
    cv.addEventListener('dblclick', (e) => {
      const [x, y] = toDevice(e, cv);
      const hit = MODEL.hitTest(S.design, screenId, x, y, visState());
      if (hit && hit.item !== null && hit.item !== undefined) {
        const sc = S.design.screens[screenId];
        if (sc.layers[hit.layer].items[hit.item].kind === 'polygon') {
          S.selections[screenId] = { layer: hit.layer, item: hit.item, vertex: 0 };
          renderAll();
          renderPanels();
        }
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape'].includes(e.key)) return;
    const screenId = activeScreenId();
    const sel = screenId && S.selections[screenId];
    if (!sel) return;
    e.preventDefault();
    if (e.key === 'Escape') {
      if (sel.vertex !== undefined && sel.vertex !== null) sel.vertex = null;
      else S.selections[screenId] = null;
      renderAll();
      renderPanels();
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    const dx = e.key === 'ArrowLeft' ? -step : (e.key === 'ArrowRight' ? step : 0);
    const dy = e.key === 'ArrowUp' ? -step : (e.key === 'ArrowDown' ? step : 0);
    snapshot();
    if (sel.vertex !== undefined && sel.vertex !== null) {
      MODEL.moveVertex(S.design, screenId, sel, sel.vertex, dx, dy);
    } else {
      MODEL.moveTarget(S.design, screenId, sel, dx, dy);
    }
    renderAll();
    renderPanels();
  });

  function renderPanels() {
    renderLayers();
    renderProps();
  }

  function renderLayers() {
    const el = $('layers');
    el.innerHTML = '';
    if (!S.design) return;
    const screenId = activeScreenId();
    const sc = S.design.screens[screenId];
    sc.layers.forEach((layer, li) => {
      const row = document.createElement('div');
      row.className = 'layer' + (S.selections[screenId] && S.selections[screenId].layer === li ? ' sel' : '');
      row.draggable = true;
      row.dataset.layer = li;
      const eye = document.createElement('span');
      eye.className = 'eye';
      eye.textContent = S.hidden[layer.id] ? '○' : '●';
      eye.title = 'toggle preview visibility (not saved)';
      eye.onclick = (ev) => {
        ev.stopPropagation();
        if (S.hidden[layer.id]) delete S.hidden[layer.id];
        else S.hidden[layer.id] = true;
        renderAll();
        renderLayers();
      };
      const lock = document.createElement('span');
      lock.className = 'eye';
      lock.textContent = S.locked[layer.id] ? '◆' : '◇';
      lock.title = 'lock layer against selection and dragging (not saved)';
      lock.onclick = (ev) => {
        ev.stopPropagation();
        if (S.locked[layer.id]) delete S.locked[layer.id];
        else {
          S.locked[layer.id] = true;
          for (const sid of Object.keys(S.selections)) {
            const sel = S.selections[sid];
            const sc = S.design.screens[sid];
            if (sel && sc.layers[sel.layer] && sc.layers[sel.layer].id === layer.id) {
              S.selections[sid] = null;
            }
          }
        }
        renderAll();
        renderLayers();
        renderPanels();
      };
      const label = document.createElement('span');
      label.textContent = layer.id;
      label.onclick = () => {
        S.selections[screenId] = { layer: li, item: null };
        renderAll();
        renderPanels();
      };
      const kind = document.createElement('span');
      kind.className = 'kind';
      kind.textContent = layer.kind;
      const up = document.createElement('button');
      up.textContent = '▲';
      up.onclick = (ev) => {
        ev.stopPropagation();
        if (li < sc.layers.length - 1) {
          snapshot();
          MODEL.reorderLayer(S.design, screenId, li, li + 1);
          renderAll();
          renderPanels();
        }
      };
      const down = document.createElement('button');
      down.textContent = '▼';
      down.onclick = (ev) => {
        ev.stopPropagation();
        if (li > 0) {
          snapshot();
          MODEL.reorderLayer(S.design, screenId, li, li - 1);
          renderAll();
          renderPanels();
        }
      };
      row.appendChild(eye);
      row.appendChild(lock);
      row.appendChild(label);
      row.appendChild(kind);
      row.appendChild(up);
      row.appendChild(down);
      row.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('text/layer', String(li));
      });
      row.addEventListener('dragover', (ev) => ev.preventDefault());
      row.addEventListener('drop', (ev) => {
        ev.preventDefault();
        const from = parseInt(ev.dataTransfer.getData('text/layer'), 10);
        if (!isNaN(from) && from !== li) {
          snapshot();
          MODEL.reorderLayer(S.design, screenId, from, li);
          renderAll();
          renderPanels();
        }
      });
      el.appendChild(row);
    });
  }

  function fieldNumber(label, get, set) {
    const wrap = document.createElement('label');
    wrap.textContent = label + ' ';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = String(get());
    inp.onchange = () => {
      const v = inp.value.trim();
      const n = Number(v);
      snapshot();
      set(isNaN(n) ? v : n);
      renderAll();
    };
    wrap.appendChild(inp);
    return wrap;
  }

  function renderProps() {
    const el = $('props');
    el.innerHTML = '';
    if (!S.design) return;
    const screenId = activeScreenId();
    const sel = S.selections[screenId];
    if (!sel) {
      el.textContent = 'nothing selected';
      return;
    }
    const sc = S.design.screens[screenId];
    const layer = sc.layers[sel.layer];
    const h = document.createElement('h3');
    h.textContent = layer.id + (sel.item !== null && sel.item !== undefined ? ' / item ' + sel.item : '');
    el.appendChild(h);
    try {
      const b = MODEL.itemBounds(S.design, screenId, sel.layer,
        sel.item === undefined ? null : sel.item);
      if (b) {
        const target = sel.item !== null && sel.item !== undefined
          ? layer.items[sel.item] : layer;
        const sub = document.createElement('div');
        sub.className = 'dimline';
        sub.textContent = (target.kind || layer.kind) +
          ' · x' + b.x + ' y' + b.y + ' w' + b.w + ' h' + b.h + 'px';
        el.appendChild(sub);
      }
    } catch (e) { /* unevaluable dims: raw inputs below still work */ }
    const box = sel.item !== null && sel.item !== undefined
      ? layer.items[sel.item].box
      : layer.box;
    if (box) {
      for (const k of ['x', 'y', 'w', 'h']) {
        el.appendChild(fieldNumber(k, () => box[k], (v) => { box[k] = v; }));
      }
    }
    const target = sel.item !== null && sel.item !== undefined ? layer.items[sel.item] : layer;
    if (target.fill !== undefined) {
      const wrap = document.createElement('label');
      wrap.textContent = 'fill ';
      if (typeof target.fill === 'string') {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = target.fill;
        inp.onchange = () => { snapshot(); target.fill = inp.value.trim(); renderAll(); };
        wrap.appendChild(inp);
      } else {
        const ta = document.createElement('textarea');
        ta.rows = 6;
        ta.value = JSON.stringify(target.fill, null, 1);
        ta.onchange = () => {
          try {
            snapshot();
            target.fill = JSON.parse(ta.value);
            renderAll();
            status('fill updated');
          } catch (err) {
            status('fill JSON error: ' + err.message);
          }
        };
        wrap.appendChild(ta);
      }
      el.appendChild(wrap);
    }
    if (target.kind === 'polygon') {
      const p = document.createElement('div');
      p.textContent = target.points.length + ' vertices — double-click the shape to drag them';
      el.appendChild(p);
    }
    if (layer.kind === 'text') {
      const wrap = document.createElement('label');
      wrap.textContent = 'font (size comes from the resource) ';
      const sel = document.createElement('select');
      for (const f of S.design.fonts || []) {
        const o = document.createElement('option');
        o.value = f.id;
        o.textContent = f.id + ' (' + f.resource + ')';
        sel.appendChild(o);
      }
      sel.value = layer.font;
      sel.onchange = () => { snapshot(); layer.font = sel.value; loadFont(layer.font); renderAll(); };
      wrap.appendChild(sel);
      el.appendChild(wrap);
    }
    if (layer.kind === 'pixeltext') {
      el.appendChild(fieldNumber('scaleDivisor', () => layer.scaleDivisor, (v) => {
        layer.scaleDivisor = Math.max(1, Math.round(v));
      }));
    }
  }

  function renderStatePanel() {
    const el = $('simstate');
    el.innerHTML = '';
    if (!S.design) return;
    const tlabel = document.createElement('label');
    tlabel.textContent = 'theme ';
    const tsel = document.createElement('select');
    S.design.themes.forEach((t, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = t.name;
      tsel.appendChild(o);
    });
    tsel.value = S.themeIdx;
    tsel.onchange = () => { S.themeIdx = +tsel.value; renderAll(); };
    tlabel.appendChild(tsel);
    el.appendChild(tlabel);
    const live = document.createElement('label');
    const lcb = document.createElement('input');
    lcb.type = 'checkbox';
    lcb.checked = S.liveClock;
    lcb.onchange = () => { S.liveClock = lcb.checked; tickClock(); renderAll(); };
    live.appendChild(lcb);
    live.appendChild(document.createTextNode(' live clock'));
    el.appendChild(live);
    for (const v of S.design.state || []) {
      if (v.type === 'int' && v.name === 'weather_code') continue;
      const wrap = document.createElement('label');
      wrap.textContent = v.name + ' ';
      if (v.type === 'int') {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.value = S.state[v.name];
        inp.onchange = () => { S.state[v.name] = +inp.value; renderAll(); };
        wrap.appendChild(inp);
      } else if (v.type === 'bool') {
        const inp = document.createElement('input');
        inp.type = 'checkbox';
        inp.checked = !!S.state[v.name];
        inp.onchange = () => { S.state[v.name] = inp.checked; renderAll(); };
        wrap.appendChild(inp);
      } else {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = S.state[v.name];
        inp.onchange = () => { S.state[v.name] = inp.value; renderAll(); };
        wrap.appendChild(inp);
      }
      el.appendChild(wrap);
    }
    const wlabel = document.createElement('label');
    wlabel.textContent = 'weather_code ';
    const wsel = document.createElement('select');
    [['unavailable', 'x'], ['0 clear', 0], ['3 overcast', 3], ['51 drizzle', 51], ['61 rain', 61], ['71 snow', 71], ['95 storm', 95]].forEach(([label, val]) => {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = label;
      wsel.appendChild(o);
    });
    wsel.onchange = () => {
      if (wsel.value === 'x') S.state.weather_available = false;
      else {
        S.state.weather_available = true;
        S.state.weather_code = +wsel.value;
      }
      renderAll();
    };
    wlabel.appendChild(wsel);
    el.appendChild(wlabel);
  }

  async function save() {
    if (!S.design || !S.facePath) return;
    try {
      await api('/api/design?path=' + encodeURIComponent(S.facePath), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design: S.design }),
      });
      status('saved ' + S.facePath);
    } catch (e) {
      status('save failed: ' + e.message);
    }
  }

  async function generate() {
    if (!S.facePath) return;
    const outDir = prompt('Generated C output dir (repo-relative):', 'src/c');
    if (!outDir) return;
    status('generating…');
    try {
      const data = await api('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design: S.facePath, outDir }),
      });
      status(data.output || 'generated');
    } catch (e) {
      status('generate failed: ' + e.message);
    }
  }

  function initTheme() {
    const saved = localStorage.getItem('pe-theme');
    const initial = saved === 'light' || saved === 'dark'
      ? saved
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    const apply = (t) => {
      document.documentElement.dataset.theme = t;
      localStorage.setItem('pe-theme', t);
      $('themeBtn').textContent = t === 'dark' ? '☾' : '☀';
    };
    $('themeBtn').onclick = () => {
      apply(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    };
    apply(initial);
  }

  function init() {
    window.addEventListener('error', (e) => {
      status('error: ' + (e.message || e.error));
    });
    initTheme();
    const params = new URLSearchParams(location.search);
    const face = params.get('face') || 'tools/pebble-editor/examples/neubrutalism-plus.design.json';
    $('facePath').value = face;
    $('loadBtn').onclick = () => loadFace($('facePath').value.trim());
    $('saveBtn').onclick = save;
    $('genBtn').onclick = generate;
    $('undoBtn').onclick = undo;
    $('redoBtn').onclick = redo;
    $('zoomSel').onchange = () => {
      S.zoom = +$('zoomSel').value;
      buildCanvases();
      renderAll();
    };
    $('fitBtn').onclick = () => {
      zoomToFit();
      buildCanvases();
      renderAll();
    };
    loadFace(face).then(() => {
      zoomToFit();
      buildCanvases();
      renderAll();
      renderPanels();
    }).catch((e) => status('load failed: ' + e.message));
    setInterval(() => {
      if (!S.design || !S.liveClock) return;
      const before = S.state.time_str;
      tickClock();
      if (S.state.time_str !== before) renderAll();
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__editor = S;
})();
