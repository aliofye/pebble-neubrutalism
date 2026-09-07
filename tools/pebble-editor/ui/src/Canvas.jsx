import React, { useEffect, useRef } from 'react';
import MODEL from './gen/engine.js';
import PV from './gen/preview.js';

// One watch canvas: preview render + selection overlay + pointer tools.
// Device-pixel space throughout (canvas backing store is w×h).

const CURSORS = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
};

function handlePositions(b) {
  const mx = b.x + b.w / 2, my = b.y + b.h / 2;
  return {
    nw: [b.x, b.y], n: [mx, b.y], ne: [b.x + b.w, b.y],
    w: [b.x, my], e: [b.x + b.w, my],
    sw: [b.x, b.y + b.h], s: [mx, b.y + b.h], se: [b.x + b.w, b.y + b.h],
  };
}

export default function WatchCanvas(props) {
  const { S, design, screenId, zoom, fonts, bitmaps, sel, setSel } = props;
  const { hover, setHover, guides, setGuides, toast, setStatus, visState, guardFrozen, refresh } = props;
  const { setTool, setActiveScreen, snapshot, popSnapshot, touch, seedSimVar } = props;
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const sc = design.screens[screenId];
  const mySel = sel.filter(s => !s.group && (s.screen === undefined || s.screen === screenId));

  /* ---------- draw ---------- */

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    PV.drawScreen(ctx, design, screenId, {
      themeIdx: S.themeIdx, state: S.sim, fonts, bitmaps, hidden: S.hidden,
    });
    drawOverlay(ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const boundsOf = (s) => {
    if (s.group) {
      const g = sc.groups?.find(g => g.id === s.group);
      if (!g) return null;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const m of g.members) {
        const r = MODEL.resolveMember(design, screenId, m);
        if (!r) continue;
        const b = MODEL.itemBounds(design, screenId, r.layer, r.item);
        if (!b) continue;
        x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
        x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
      }
      return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    return MODEL.itemBounds(design, screenId, s.layer, s.item === undefined ? null : s.item);
  };

  const drawOverlay = (ctx) => {
    ctx.save();
    // Hover (under selection). Guarded: hover indices can go stale.
    if (hover && hover.screen === screenId) {
      let hb = null;
      try {
        hb = hover.group ? null : MODEL.itemBounds(design, screenId, hover.layer, hover.item ?? null);
      } catch (e) { hb = null; }
      if (hb) {
        ctx.strokeStyle = '#8a8a94';
        ctx.lineWidth = 1;
        ctx.strokeRect(hb.x + 0.5, hb.y + 0.5, Math.max(hb.w - 1, 1), Math.max(hb.h - 1, 1));
      }
    }
    for (const s of mySel) {
      if (s.vertex !== undefined && s.vertex !== null) {
        const item = sc.layers[s.layer].items[s.item];
        if (item && item.points) {
          const pts = item.points.map(pt => [
            PV.evalDim(pt[0], sc.w, sc.h, design.constants || {}),
            PV.evalDim(pt[1], sc.w, sc.h, design.constants || {}),
          ]);
          ctx.fillStyle = '#0d99ff';
          pts.forEach((p, i) => {
            ctx.fillRect(p[0] - 3, p[1] - 3, 7, 7);
            if (i === s.vertex) {
              ctx.strokeStyle = '#fff';
              ctx.lineWidth = 1;
              ctx.strokeRect(p[0] - 4, p[1] - 4, 9, 9);
            }
          });
        }
        continue;
      }
      const b = boundsOf(s);
      if (!b) continue;
      ctx.strokeStyle = '#0d99ff';
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x + 0.5, b.y + 0.5, Math.max(b.w - 1, 1), Math.max(b.h - 1, 1));
      if (mySel.length === 1) {
        ctx.fillStyle = '#0d99ff';
        for (const h of Object.values(handlePositions(b))) {
          ctx.fillRect(h[0] - 3, h[1] - 3, 7, 7);
        }
      }
    }
    if (guides && guides.screen === screenId) {
      ctx.strokeStyle = '#f2555a';
      ctx.lineWidth = 1;
      for (const gx of guides.xs || []) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, 10000); ctx.stroke(); }
      for (const gy of guides.ys || []) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(10000, gy); ctx.stroke(); }
    }
    ctx.restore();
  };

  /* ---------- pointer ---------- */

  const toDevice = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [
      Math.round((e.clientX - r.left) * (sc.w / r.width)),
      Math.round((e.clientY - r.top) * (sc.h / r.height)),
    ];
  };

  const hitHandle = (x, y) => {
    if (mySel.length !== 1) return null;
    const s = mySel[0];
    if (s.vertex !== undefined && s.vertex !== null) return null;
    if (s.group) return null;
    const b = boundsOf(s);
    if (!b) return null;
    const tol = 5;
    for (const [name, h] of Object.entries(handlePositions(b))) {
      if (Math.abs(x - h[0]) <= tol && Math.abs(y - h[1]) <= tol) return name;
    }
    return null;
  };

  // Wire a default binding exactly as if picked from the provider
  // dropdown: add widget + state var, seed the simulator. Without this a
  // freshly placed text/bar previews nothing until the picker is touched.
  const connectDefault = (doc, ref, type) => {
    const all = MODEL.listProviders(S.manifests, doc.settings);
    const pick = [...(all[type] || [])].find(p => p.name === MODEL.bindingOf(ref));
    if (!pick) return;
    if (pick.widget && MODEL.ensureWidget(doc, pick.widget)) {
      MODEL.ensureStateVar(doc, pick.name, type);
      toast('connected ' + pick.widget + ' widget');
    } else {
      MODEL.ensureStateVar(doc, pick.name, type);
    }
    seedSimVar(pick.name, type);
  };

  const targetGraphicsLayer = () => {
    const prim = mySel.find(s => !s.group && sc.layers[s.layer]?.kind === 'graphics');
    if (prim) return prim.layer;
    const bg = sc.layers.findIndex(l => l.kind === 'graphics' && l.id === 'background');
    if (bg >= 0) return bg;
    return sc.layers.findIndex(l => l.kind === 'graphics');
  };

  const onPointerDown = (e) => {
    setActiveScreen(screenId);
    S.activeScreen = screenId;
    canvasRef.current.setPointerCapture(e.pointerId);
    const [x, y] = toDevice(e);
    const tool = S.tool;

    // Shape tools: create on press, drag to size, mirror on release.
    if (tool !== 'move') {
      if (guardFrozen()) return;
      snapshot();
      const doc = S.design;
      const scm = doc.screens[screenId];
      if (tool === 'layer-graphics' || tool === 'layer-text') {
        const li = MODEL.addLayer(doc, screenId, tool === 'layer-graphics' ? 'graphics' : 'text', {});
        MODEL.mirrorLayerToSibling(doc, screenId, li);
        dragRef.current = { kind: 'placed-layer' };
        setSel([{ screen: screenId, layer: li, item: null }]);
      } else if (tool === 'text') {
        const li = MODEL.addLayer(doc, screenId, 'text', {
          box: { x: Math.max(0, x - 36), y: Math.max(0, y - 14), w: 72, h: 28 },
        });
        MODEL.mirrorLayerToSibling(doc, screenId, li);
        connectDefault(doc, '$date_str', 'string');
        dragRef.current = { kind: 'placed-box', layer: li, item: null, x0: x, y0: y, moved: false };
        setSel([{ screen: screenId, layer: li, item: null }]);
      } else {
        let li = targetGraphicsLayer();
        if (li === undefined || li === null || li < 0) {
          li = MODEL.addLayer(doc, screenId, 'graphics', { id: 'graphics' });
          MODEL.mirrorLayerToSibling(doc, screenId, li);
        }
        const ii = MODEL.addItem(doc, screenId, li, tool, x, y);
        const item = doc.screens[screenId].layers[li].items[ii];
        if (item && typeof item.value === 'string') connectDefault(doc, item.value, 'int');
        dragRef.current = { kind: 'placed-box', layer: li, item: ii, x0: x, y0: y, moved: false };
        setSel([{ screen: screenId, layer: li, item: ii }]);
      }
      void scm;
      touch();
      return;
    }

    // Move tool.
    const s0 = mySel[0];
    if (s0 && s0.vertex !== undefined && s0.vertex !== null) {
      const item = sc.layers[s0.layer].items[s0.item];
      if (item && item.points) {
        let best = -1, bestD = 64;
        item.points.forEach((pt, i) => {
          const px = PV.evalDim(pt[0], sc.w, sc.h, design.constants || {});
          const py = PV.evalDim(pt[1], sc.w, sc.h, design.constants || {});
          const d = (px - x) * (px - x) + (py - y) * (py - y);
          if (d < bestD) { bestD = d; best = i; }
        });
        if (best >= 0) {
          if (guardFrozen()) return;
          snapshot();
          dragRef.current = { kind: 'vertex', idx: best, lx: x, ly: y };
          return;
        }
      }
    }
    const handle = hitHandle(x, y);
    if (handle) {
      if (guardFrozen()) return;
      snapshot();
      dragRef.current = { kind: 'resize', edge: handle, lx: x, ly: y };
      return;
    }
    const hit = MODEL.hitTest(design, screenId, x, y, visState());
    if (e.shiftKey && hit) {
      const same = (s) => !s.group && s.layer === hit.layer && (s.item ?? null) === (hit.item ?? null);
      setSel(mySel.some(same)
        ? sel.filter(s => !same(s))
        : [...sel, { screen: screenId, layer: hit.layer, item: hit.item ?? null }]);
      refresh();
      return;
    }
    // Group-aware: clicking a member of a locked group selects the group.
    if (hit) {
      const g = MODEL.groupContaining(design, screenId, hit.layer, hit.item);
      if (g && g.locked) {
        setSel([{ screen: screenId, group: g.id }]);
        refresh();
        return;
      }
    }
    setSel(hit ? [{ screen: screenId, layer: hit.layer, item: hit.item ?? null }] : []);
    if (hit) {
      const hb = MODEL.itemBounds(design, screenId, hit.layer, hit.item ?? null);
      dragRef.current = {
        kind: 'maybe-move', lx: x, ly: y,
        grabDX: hb ? x - hb.x : 0, grabDY: hb ? y - hb.y : 0,
      };
    }
    setGuides(null);
    refresh();
  };

  const applyMove = (dx, dy, guidesOn) => {
    const doc = S.design;
    const scm = doc.screens[screenId];
    let g = null;
    if (guidesOn) {
      const excl = mySel.length === 1 && !mySel[0].group
        ? { layer: mySel[0].layer, item: mySel[0].item } : null;
      g = MODEL.collectGuides(doc, screenId, excl, visState());
    }
    for (const s of mySel) {
      if (s.group) {
        const grp = scm.groups?.find(g => g.id === s.group);
        if (grp && !grp.locked) MODEL.moveGroup(doc, screenId, s.group, dx, dy);
        continue;
      }
      const grp = MODEL.groupContaining(doc, screenId, s.layer, s.item);
      if (grp) {
        if (grp.locked) continue;
        MODEL.moveGroup(doc, screenId, grp.id, dx, dy);
        continue;
      }
      MODEL.moveTarget(doc, screenId, { layer: s.layer, item: s.item }, dx, dy);
    }
    return g;
  };

  const onPointerMove = (e) => {
    const [x, y] = toDevice(e);
    const drag = dragRef.current;
    if (!drag) {
      if (S.tool === 'move') {
        const handle = hitHandle(x, y);
        if (handle) { e.target.style.cursor = CURSORS[handle]; return; }
      }
      const hit = MODEL.hitTest(design, screenId, x, y, visState());
      e.target.style.cursor = S.tool !== 'move' ? 'crosshair' : hit ? 'move' : 'default';
      const key = hit ? screenId + ':' + hit.layer + ':' + hit.item : null;
      setHover(prev => {
        const pk = prev ? prev.screen + ':' + prev.layer + ':' + prev.item : null;
        if (pk === key) return prev;
        return hit ? { screen: screenId, layer: hit.layer, item: hit.item ?? null } : null;
      });
      return;
    }
    if (guardFrozen()) { dragRef.current = null; return; }
    if (drag.kind === 'placed-box') {
      const dx = x - drag.x0, dy = y - drag.y0;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.moved) {
        const doc = S.design;
        const scm = doc.screens[screenId];
        const t = drag.item === null || drag.item === undefined
          ? scm.layers[drag.layer]
          : scm.layers[drag.layer].items[drag.item];
        const box = t.box;
        if (box) {
          const nx = Math.min(drag.x0, x), ny = Math.min(drag.y0, y);
          box.x = nx; box.y = ny;
          box.w = Math.max(1, Math.abs(dx)); box.h = Math.max(1, Math.abs(dy));
        }
        touch();
      }
      return;
    }
    if (drag.kind === 'maybe-move') {
      if (x === drag.lx && y === drag.ly) return;
      drag.kind = 'move';
      snapshot();
    }
    if (drag.kind === 'vertex') {
      const s = mySel[0];
      MODEL.moveVertex(S.design, screenId, { layer: s.layer }, drag.idx, x - drag.lx, y - drag.ly);
      drag.lx = x; drag.ly = y;
      touch();
      setStatus('vertex');
      return;
    }
    if (drag.kind === 'resize') {
      const s = mySel[0];
      if (s.group) return;
      MODEL.resizeTarget(S.design, screenId, { layer: s.layer, item: s.item }, drag.edge, x - drag.lx, y - drag.ly);
      drag.lx = x; drag.ly = y;
      touch();
      return;
    }
    if (drag.kind === 'move') {
      const guides = MODEL.collectGuides(S.design, screenId,
        mySel.length === 1 && !mySel[0].group ? { layer: mySel[0].layer, item: mySel[0].item } : null,
        visState());
      const b = mySel.length === 1 && !mySel[0].group ? boundsOf(mySel[0]) : null;
      let dx = x - drag.lx, dy = y - drag.ly;
      if (b) {
        const sx = MODEL.snapCoord(x - drag.grabDX, guides.xs, 2);
        const sy = MODEL.snapCoord(y - drag.grabDY, guides.ys, 2);
        setGuides({
          screen: screenId,
          xs: sx.guide !== null ? [sx.guide] : [],
          ys: sy.guide !== null ? [sy.guide] : [],
        });
        dx = sx.v - b.x;
        dy = sy.v - b.y;
      } else {
        setGuides({ screen: screenId, xs: [], ys: [] });
      }
      applyMove(dx, dy, false);
      drag.lx = x; drag.ly = y;
      touch();
    }
  };

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.kind === 'placed-box' || drag.kind === 'placed-layer') {
      // Mirror additions to the sibling size (creation snapshot already taken).
      if (drag.kind === 'placed-box') {
        const sibId = MODEL.siblingScreenId(S.design, screenId);
        if (sibId) MODEL.mirrorItemToSibling(S.design, screenId, drag.layer, drag.item);
      }
      touch();
      toast('placed ' + S.tool + ' (mirrored)');
      setTool('move');
      return;
    }
    if (drag.kind === 'maybe-move') popSnapshot();
    setGuides(null);
    touch();
  };

  const onDoubleClick = (e) => {
    const [x, y] = toDevice(e);
    const hit = MODEL.hitTest(design, screenId, x, y, visState());
    if (hit && hit.item !== null && hit.item !== undefined) {
      const item = sc.layers[hit.layer].items[hit.item];
      if (item && item.kind === 'polygon') {
        setSel([{ screen: screenId, layer: hit.layer, item: hit.item, vertex: 0 }]);
        toast('vertex mode — drag points, Esc exits');
        refresh();
      }
    }
  };

  const title = sc.w === 200 ? '200 × 228' : '144 × 168 · color';
  return (
    <div className="screen-frame">
      <h2>{title}</h2>
      <canvas
        ref={canvasRef}
        className="watch"
        width={sc.w}
        height={sc.h}
        style={{ width: sc.w * zoom + 'px', height: 'auto' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onDoubleClick}
      />
    </div>
  );
}
