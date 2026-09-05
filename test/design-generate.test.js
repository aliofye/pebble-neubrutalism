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
  for (const f of ['neubrutalism-plus.design.json', 'fixture.design.json']) {
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
