'use strict';

const fs = require('fs');
const path = require('path');
const { Emitter } = require('../tools/pebble-editor/generate');
const { validateDesign } = require('../tools/pebble-editor/validate');

const EX = path.join(__dirname, '..', 'tools', 'pebble-editor', 'examples');

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(EX, name), 'utf8'));
}

test('checked-in examples validate clean', () => {
  for (const f of ['neubrutalism-plus.design.json', 'fixture.design.json', 'blank.design.json', 'starter.design.json']) {
    expect(validateDesign(load(f))).toEqual([]);
  }
});

test('fixture emits expected symbols', () => {
  const out = new Emitter(load('fixture.design.json'), 'fixture.design.json').generate();
  expect(out.header).toMatch(/#define FIXTURE_THEME_COUNT 1/);
  expect(out.header).toMatch(/void fixture_main_background_draw\(/);
  expect(out.header).toMatch(/GRect fixture_main_date_frame\(/);
  expect(out.source).toMatch(/FIXTURE_THEMES\[1\] = \{/);
  expect(out.source).toMatch(/fixture_meterbar\(ctx,/);
  expect(out.source).toMatch(/\.background = GColorPastelYellow,/);
});

test('reference face emits both screens and conditionals', () => {
  const out = new Emitter(load('neubrutalism-plus.design.json'), 'nb.design.json').generate();
  expect(out.header).toMatch(/#define NEUBRUTALISM_PLUS_THEME_COUNT 6/);
  expect(out.header).toMatch(/void neubrutalism_plus_w200_time_draw\(/);
  expect(out.header).toMatch(/void neubrutalism_plus_w144_bars_draw\(/);
  expect(out.source).toMatch(/st->battery < 20/);
  expect(out.source).toMatch(/st->weather_code == 95 \|\| st->weather_code == 96 \|\| st->weather_code == 99/);
  expect(out.source).toMatch(/pix_h = 4;/);
  expect(out.source).toMatch(/neubrutalism_plus_w200_background_polygons_create/);
});

test('unknown expression name throws', () => {
  const doc = load('fixture.design.json');
  doc.screens.main.layers[0].items[0].box.w = 'w-nope';
  expect(() => new Emitter(doc, 'x.design.json').generate()).toThrow('unknown name');
});

test('plain bar emits track + percent fill without chrome', () => {
  const doc = load('blank.design.json');
  doc.state = [{ name: 'battery', type: 'int' }];
  doc.screens.w200.layers[0].items.push({
    kind: 'bar', box: { x: 10, y: 10, w: 100, h: 20 },
    value: '$battery', fill: '$battery_bar', track: '$battery_frame',
  });
  const out = new Emitter(doc, 'blank.design.json').generate();
  expect(out.source).toMatch(/_bar\(ctx, 10, 10, 100, 20,/);
  expect(out.source).toMatch(/\(w \* percent\) \/ 100/);
  expect(out.source).not.toMatch(/compact/);
});

test('unified text+pixelFont emits the same code as pixeltext kind', () => {
  const base = {
    schema: 1, name: 'u', constants: {},
    screens: { main: { w: 144, h: 168, layers: [] } },
    themes: [{ name: 'a', tokens: { background: 'GColorWhite', ink: 'GColorBlack' } }],
    state: [{ name: 'time_str', type: 'string' }],
    fonts: [], bitmaps: [],
    pixelFonts: { digits: { rows: 1, chars: { 0: ['11'], ':': ['00'] } } },
  };
  const mk = (kind) => {
    const doc = JSON.parse(JSON.stringify(base));
    doc.screens.main.layers.push({
      id: 'clock', kind,
      box: { x: 0, y: 0, w: 100, h: 40 },
      pixelFont: 'digits', fill: '$ink', text: '$time_str', scaleDivisor: 40,
    });
    return new Emitter(doc, 'u.design.json').generate();
  };
  const a = mk('text');
  const b = mk('pixeltext');
  expect(a.source).toBe(b.source);
});

test('resolveRoleLayers maps slots by binding, not by id', () => {
  const { resolveRoleLayers } = require('../tools/pebble-editor/generate-app');
  const manifests = {
    battery: { provides: [{ name: 'battery', type: 'int' }], requires: { layers: ['bars'] } },
    time: { provides: [{ name: 'time_str', type: 'string' }], requires: { layers: ['time'] } },
  };
  // Legacy face: same-named layers win.
  const legacy = load('neubrutalism-plus.design.json');
  expect(resolveRoleLayers(legacy, manifests)).toMatchObject({ bars: 'bars', time: 'time' });
  // Generic face: custom ids carrying the bindings win.
  const doc = load('blank.design.json');
  doc.widgets = ['battery'];
  doc.state = [{ name: 'battery', type: 'int' }];
  doc.screens.w200.layers.push({
    id: 'mymeters', kind: 'graphics',
    items: [{ kind: 'bar', box: { x: 0, y: 0, w: 10, h: 10 }, value: '$battery', fill: 'GColorBlack', track: 'GColorWhite' }],
  });
  expect(resolveRoleLayers(doc, manifests).bars).toBe('mymeters');
});
