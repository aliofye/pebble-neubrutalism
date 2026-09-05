'use strict';

const M = require('../tools/pebble-editor/app/editor-model');

function doc() {
  return {
    schema: 1, name: 't',
    constants: { s: 3 },
    screens: {
      a: {
        w: 100, h: 100,
        layers: [
          {
            id: 'bg', kind: 'graphics', items: [
              { kind: 'rect', box: { x: 10, y: 10, w: 40, h: 40 }, fill: 'GColorBlack' },
              { kind: 'polygon', points: [[60, 60], [90, 60], [90, 90]], fill: 'GColorWhite' },
            ]
          },
          {
            id: 't', kind: 'text',
            box: { x: 0, y: 0, w: 'w', h: 20 },
            font: 'f', fill: 'GColorBlack', text: '$s'
          },
        ]
      }
    },
    themes: [{ name: 't', tokens: {} }],
    state: [],
  };
}

test('hitTest finds topmost item, then layer', () => {
  const d = doc();
  expect(M.hitTest(d, 'a', 20, 20)).toEqual({ layer: 0, item: 0 });
  expect(M.hitTest(d, 'a', 80, 70)).toEqual({ layer: 0, item: 1 });
  expect(M.hitTest(d, 'a', 5, 5)).toEqual({ layer: 1, item: null });
  expect(M.hitTest(d, 'a', 95, 95)).toBe(null);
});

test('hitTest skips polygon bbox corners outside the shape', () => {
  const d = doc();
  expect(M.hitTest(d, 'a', 65, 85)).toBe(null);
});

test('moveTarget shifts literal and bakes expressions', () => {
  const d = doc();
  M.moveTarget(d, 'a', { layer: 0, item: 0 }, 5, -3);
  expect(d.screens.a.layers[0].items[0].box).toEqual({ x: 15, y: 7, w: 40, h: 40 });
  M.moveTarget(d, 'a', { layer: 1, item: null }, 1, 1);
  expect(d.screens.a.layers[1].box.x).toBe(1);
  expect(d.screens.a.layers[1].box.w).toBe('w');
});

test('resizeTarget adjusts edges with min clamp', () => {
  const d = doc();
  M.resizeTarget(d, 'a', { layer: 0, item: 0 }, 'e', 10, 0);
  expect(d.screens.a.layers[0].items[0].box.w).toBe(50);
  M.resizeTarget(d, 'a', { layer: 0, item: 0 }, 'w', 5, 0);
  expect(d.screens.a.layers[0].items[0].box).toMatchObject({ x: 15, w: 45 });
  M.resizeTarget(d, 'a', { layer: 0, item: 0 }, 'w', 100, 0);
  expect(d.screens.a.layers[0].items[0].box.w).toBe(1);
});

test('moveVertex shifts one polygon point', () => {
  const d = doc();
  M.moveVertex(d, 'a', { layer: 0, item: 1 }, 0, 2, 2);
  expect(d.screens.a.layers[0].items[1].points[0]).toEqual([62, 62]);
});

test('reorderLayer moves within bounds', () => {
  const d = doc();
  M.reorderLayer(d, 'a', 0, 1);
  expect(d.screens.a.layers.map(l => l.id)).toEqual(['t', 'bg']);
  M.reorderLayer(d, 'a', 5, 0);
  expect(d.screens.a.layers.map(l => l.id)).toEqual(['t', 'bg']);
});

test('snapCoord snaps within tolerance', () => {
  expect(M.snapCoord(11, [0, 10, 20], 2)).toEqual({ v: 10, guide: 10 });
  expect(M.snapCoord(11, [0, 10, 20], 0)).toEqual({ v: 11, guide: null });
});

test('grab-offset drag never loses travel (no permanent stick)', () => {
  // Simulate: grab battery bar at x=22 by pointer at 100, then move the
  // pointer in +2px steps. The object must track the pointer (minus snap
  // pauses) and end near pointer-78, never glued at a guide.
  const guides = [0, 23, 100, 200];
  let objX = 22;
  const grabDX = 100 - 22;
  let pointer = 100;
  for (let i = 0; i < 10; i++) {
    pointer += 2;
    const desired = pointer - grabDX;
    const s = M.snapCoord(desired, guides, 2);
    objX = s.v;
  }
  expect(objX).toBeGreaterThan(30);
  expect(objX).toBeLessThanOrEqual(42);
});

function vdoc() {
  return {
    schema: 1, name: 'v',
    constants: {},
    screens: {
      a: {
        w: 200, h: 200,
        layers: [
          {
            id: 'bg', kind: 'graphics', items: [
              { kind: 'rect', box: { x: 0, y: 0, w: 200, h: 200 }, fill: 'GColorBlack' },
            ]
          },
          {
            id: 'bars', kind: 'graphics', items: [
              { kind: 'rect', box: { x: 10, y: 10, w: 100, h: 30 }, fill: 'GColorBlack',
                visibleWhen: { var: 'mode', op: 'eq', value: 0 } },
              { kind: 'rect', box: { x: 20, y: 50, w: 50, h: 60 }, fill: 'GColorBlack',
                visibleWhen: { var: 'mode', op: 'eq', value: 1 } },
            ]
          },
        ]
      }
    },
    themes: [{ name: 't', tokens: {} }],
    state: [{ name: 'mode', type: 'int' }],
  };
}

const VIS0 = { themeIdx: 0, state: { mode: 0 }, hidden: {} };

test('hitTest skips mode-hidden items', () => {
  const d = vdoc();
  expect(M.hitTest(d, 'a', 50, 20, VIS0)).toEqual({ layer: 1, item: 0 });
  const vis1 = { themeIdx: 0, state: { mode: 1 }, hidden: {} };
  expect(M.hitTest(d, 'a', 40, 80, vis1)).toEqual({ layer: 1, item: 1 });
  expect(M.hitTest(d, 'a', 40, 80, VIS0)).toEqual({ layer: 0, item: 0 });
});

test('hitTest skips eye-hidden layers', () => {
  const d = vdoc();
  const vis = { themeIdx: 0, state: { mode: 0 }, hidden: { bars: true } };
  expect(M.hitTest(d, 'a', 50, 20, vis)).toEqual({ layer: 0, item: 0 });
});

test('hitTest skips locked layers', () => {
  const d = vdoc();
  const vis = { themeIdx: 0, state: { mode: 0 }, hidden: {}, locked: { bars: true } };
  expect(M.hitTest(d, 'a', 50, 20, vis)).toEqual({ layer: 0, item: 0 });
  expect(M.isVisible(d, d.screens.a.layers[1], null, vis)).toBe(false);
  expect(M.isVisible(d, d.screens.a.layers[1], null, null)).toBe(true);
});

test('hitTest without vis context keeps legacy behavior', () => {
  const d = vdoc();
  expect(M.hitTest(d, 'a', 50, 50)).toEqual({ layer: 1, item: 1 });
});

test('collectGuides skips hidden items', () => {
  const d = vdoc();
  const g = M.collectGuides(d, 'a', null, VIS0);
  expect(g.xs).toContain(110);
  expect(g.xs).not.toContain(70);
  expect(g.xs).not.toContain(45);
});

test('itemBounds handles all item kinds', () => {
  const d = doc();
  expect(M.itemBounds(d, 'a', 0, 0)).toEqual({ x: 10, y: 10, w: 40, h: 40 });
  const poly = M.itemBounds(d, 'a', 0, 1);
  expect([poly.x, poly.y, poly.w, poly.h]).toEqual([60, 60, 30, 30]);
  expect(M.itemBounds(d, 'a', 1, null)).toEqual({ x: 0, y: 0, w: 100, h: 20 });
});
