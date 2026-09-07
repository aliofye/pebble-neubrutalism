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

test('listProviders groups widget state by type with owners', () => {
  const manifests = {
    time: { provides: [
      { name: 'time_str', type: 'string' },
      { name: 'display_hour', type: 'int' },
    ] },
    steps: { provides: [{ name: 'steps', type: 'int' }] },
  };
  const out = M.listProviders(manifests, [{ var: 'bars_mode', key: 'BARS_MODE', kind: 'int' }]);
  expect(out.string).toEqual([{ name: 'time_str', owner: 'time', widget: 'time' }]);
  expect(out.int).toEqual([
    { name: 'display_hour', owner: 'time', widget: 'time' },
    { name: 'steps', owner: 'steps', widget: 'steps' },
    { name: 'bars_mode', owner: 'setting:BARS_MODE', widget: null },
  ]);
  expect(out.bool).toEqual([{ name: 'bt', owner: 'core', widget: null }]);
});

test('listProviders tolerates missing manifests and settings', () => {
  const out = M.listProviders(null, null);
  expect(out.string).toEqual([]);
  expect(out.bool).toEqual([{ name: 'bt', owner: 'core', widget: null }]);
});

test('bindingOf parses $refs', () => {
  expect(M.bindingOf('$time_str')).toBe('time_str');
  expect(M.bindingOf('time_str')).toBe(null);
  expect(M.bindingOf('')).toBe(null);
  expect(M.bindingOf('$')).toBe(null);
  expect(M.bindingOf(null)).toBe(null);
  expect(M.bindingOf(42)).toBe(null);
});

test('ensureWidget adds missing widgets once', () => {
  const d = {};
  expect(M.ensureWidget(d, 'time')).toBe(true);
  expect(d.widgets).toEqual(['time']);
  expect(M.ensureWidget(d, 'time')).toBe(false);
  expect(d.widgets).toEqual(['time']);
  expect(M.ensureWidget(d, null)).toBe(false);
});

test('platform registry maps every supported platform to dims and a shared screen', () => {
  expect(M.PLATFORMS).toMatchObject({
    aplite: { w: 144, h: 168, screen: 'w144' },
    basalt: { w: 144, h: 168, screen: 'w144' },
    diorite: { w: 144, h: 168, screen: 'w144' },
    flint: { w: 144, h: 168, screen: 'w144' },
    emery: { w: 200, h: 228, screen: 'w200' },
  });
});

test('platformScreen resolves platform aliases and rejects unknown platforms', () => {
  expect(M.platformScreen('basalt')).toBe('w144');
  expect(M.platformScreen('emery')).toBe('w200');
  expect(M.platformScreen('chalk')).toBe(null);
});

test('visiblePlatforms defaults to the design targets, filtered to known platforms', () => {
  const d = { app: { targets: ['basalt', 'emery', 'chalk'] } };
  expect(M.visiblePlatforms(d, null)).toEqual(['basalt', 'emery']);
  expect(M.visiblePlatforms(d, ['emery'])).toEqual(['emery']);
  expect(M.visiblePlatforms({}, null)).toEqual([]);
});

test('visibleSizes maps targets through platform dims', () => {
  const d = { app: { targets: ['basalt', 'emery'] } };
  expect(M.visibleSizes(d, null)).toEqual(['144', '200']);
  expect(M.visibleSizes({ app: { targets: ['basalt'] } }, null)).toEqual(['144']);
  expect(M.visibleSizes(d, ['200'])).toEqual(['200']);
  expect(M.visibleSizes(d, ['bogus'])).toEqual(['144', '200']);
  expect(M.visibleSizes({}, null)).toEqual(['144', '200']);
});

function blankDoc() {
  return {
    schema: 1, name: 'b', constants: {},
    screens: {
      w200: { w: 200, h: 228, layers: [{ id: 'background', kind: 'graphics', items: [] }] },
      w144: { w: 144, h: 168, layers: [{ id: 'background', kind: 'graphics', items: [] }] },
    },
    themes: [{ name: 't', tokens: {} }],
    state: [], widgets: [], fonts: [{ id: 'jersey25', resource: 'FONT_JERSEY_25' }],
    pixelFonts: {},
  };
}

test('addLayer creates unique ids and rejects bad kinds', () => {
  const d = blankDoc();
  const i = M.addLayer(d, 'w200', 'graphics', { id: 'bars' });
  expect(d.screens.w200.layers[i].id).toBe('bars');
  const j = M.addLayer(d, 'w200', 'graphics', { id: 'bars' });
  expect(d.screens.w200.layers[j].id).toBe('bars_2');
  expect(() => M.addLayer(d, 'w200', 'nope', {})).toThrow();
});

test('addItem appends brutalist defaults inside graphics layers', () => {
  const d = blankDoc();
  const li = M.addLayer(d, 'w200', 'graphics', { id: 'bars' });
  const ii = M.addItem(d, 'w200', li, 'meterbar', 22, 140);
  expect(d.screens.w200.layers[li].items[ii].value).toBe('$battery');
  expect(() => M.addItem(d, 'w200', 99, 'rect', 0, 0)).toThrow();
});

test('mirrorItemToSibling scales 200px box to 144px', () => {
  const d = blankDoc();
  const li = M.addLayer(d, 'w200', 'graphics', { id: 'bars' });
  M.addItem(d, 'w200', li, 'rect', 20, 20);
  M.mirrorItemToSibling(d, 'w200', li, 0);
  const sib = d.screens.w144.layers.find(l => l.id === 'bars');
  expect(sib).toBeTruthy();
  // 20*0.72=14.4->14, 20*0.7368->15; 40*0.72=28.8->29
  expect(sib.items[0].box).toMatchObject({ x: 14, y: 15, w: 29 });
});

test('collectRefs finds text, value, and condition vars', () => {
  const d = blankDoc();
  M.addLayer(d, 'w200', 'text', { id: 'date', text: '$date_str' });
  const li = M.addLayer(d, 'w200', 'graphics', { id: 'bars' });
  M.addItem(d, 'w200', li, 'meterbar', 0, 0);
  d.screens.w200.layers[li].items[0].visibleWhen = { var: 'bars_mode', op: 'eq', value: 0 };
  const refs = M.collectRefs(d);
  expect(refs.bindings).toContain('date_str');
  expect(refs.bindings).toContain('battery');
  expect(refs.all).toContain('bars_mode');
});

test('pruneUnusedWidgets drops unused widget and orphan state', () => {
  const d = blankDoc();
  d.widgets = ['battery', 'weather'];
  d.state = [{ name: 'battery', type: 'int' }, { name: 'weather_str', type: 'string' }];
  const manifests = {
    battery: { provides: [{ name: 'battery', type: 'int' }] },
    weather: { provides: [{ name: 'weather_str', type: 'string' }] },
  };
  const li = M.addLayer(d, 'w200', 'graphics', { id: 'bars' });
  M.addItem(d, 'w200', li, 'meterbar', 0, 0);
  const removed = M.pruneUnusedWidgets(d, manifests);
  expect(d.widgets).toEqual(['battery']);
  expect(removed.widgets).toEqual(['weather']);
  expect(d.state.map(s => s.name)).toEqual(['battery']);
});

test('addItem supports the plain bar primitive', () => {
  const d = blankDoc();
  const li = M.addLayer(d, 'w200', 'graphics', { id: 'mymeters' });
  const ii = M.addItem(d, 'w200', li, 'bar', 10, 10);
  const item = d.screens.w200.layers[li].items[ii];
  expect(item).toMatchObject({ kind: 'bar', value: '$battery' });
  expect(M.itemBounds(d, 'w200', li, ii)).toMatchObject({ x: 10, y: 10, w: 100, h: 20 });
});

test('groups: create, lock skips hitTest, move moves all members', () => {
  const d = blankDoc();
  const li = M.addLayer(d, 'w200', 'graphics', { id: 'mymeters' });
  M.addItem(d, 'w200', li, 'bar', 10, 10);
  M.addItem(d, 'w200', li, 'rect', 8, 8);
  const gid = M.createGroup(d, 'w200', 'battery progress bar', [
    { layer: 'mymeters', item: 0 },
    { layer: 'mymeters', item: 1 },
  ]);
  expect(gid).toBe('battery_progress_bar');
  expect(M.groupContaining(d, 'w200', li, 0).id).toBe(gid);
  // Locked: neither member hit-tests.
  M.setGroupLock(d, 'w200', gid, true);
  expect(M.hitTest(d, 'w200', 15, 15)).toBe(null);
  // Unlocked: move shifts both members.
  M.setGroupLock(d, 'w200', gid, false);
  expect(M.moveGroup(d, 'w200', gid, 5, 0)).toBe(true);
  expect(d.screens.w200.layers[li].items[0].box.x).toBe(15);
  expect(d.screens.w200.layers[li].items[1].box.x).toBe(13);
  expect(M.deleteGroup(d, 'w200', gid)).toBe(true);
  expect(M.groupContaining(d, 'w200', li, 0)).toBe(null);
});

test('groups reject overlapping members and mirror to sibling', () => {
  const d = blankDoc();
  const li = M.addLayer(d, 'w200', 'graphics', { id: 'mymeters' });
  M.addItem(d, 'w200', li, 'bar', 10, 10);
  M.createGroup(d, 'w200', 'g1', [{ layer: 'mymeters', item: 0 }]);
  expect(() => M.createGroup(d, 'w200', 'g2', [{ layer: 'mymeters', item: 0 }])).toThrow();
  expect(M.mirrorGroupToSibling(d, 'w200', 'g1')).toBe(true);
  expect(d.screens.w144.groups.map(g => g.id)).toContain('g1');
});
