'use strict';

const fs = require('fs');
const path = require('path');
const { Emitter } = require('../tools/pebble-editor/generate');
const { validateDesign } = require('../tools/pebble-editor/validate');
const { buildReplay } = require('../tools/pebble-editor/replay-neubrutalism');

const EX = path.join(__dirname, '..', 'tools', 'pebble-editor', 'examples');

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(EX, name), 'utf8'));
}

const canon = (o) => {
  if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']';
  if (o && typeof o === 'object') {
    return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}';
  }
  return JSON.stringify(o);
};

test('blank template validates and starts empty', () => {
  const blank = load('blank.design.json');
  expect(validateDesign(blank)).toEqual([]);
  expect(blank.widgets).toEqual([]);
  expect(blank.state).toEqual([]);
  expect(Object.keys(blank.screens).length).toBe(2);
});

test('replay rebuilds the reference face from blank via model ops', () => {
  const replay = buildReplay(load('blank.design.json'), load('neubrutalism-plus.design.json'));
  expect(validateDesign(replay)).toEqual([]);
  const ref = load('neubrutalism-plus.design.json');
  for (const sid of Object.keys(ref.screens)) {
    expect(canon(replay.screens[sid])).toBe(canon(ref.screens[sid]));
  }
  for (const k of ['name', 'constants', 'widgets', 'settings', 'themes', 'state', 'fonts', 'bitmaps', 'pixelFonts']) {
    expect(canon(replay[k])).toBe(canon(ref[k]));
  }
});

test('replay emits identical C to the reference face', () => {
  const ref = load('neubrutalism-plus.design.json');
  const replay = buildReplay(load('blank.design.json'), ref);
  const a = new Emitter(ref, 'neubrutalism-plus.design.json').generate();
  const b = new Emitter(replay, 'neubrutalism-plus.design.json').generate();
  expect(b.header).toBe(a.header);
  expect(b.source).toBe(a.source);
});

function recordDraw(design, screenId, state, layerId) {
  const calls = [];
  const ctx = {
    fillStyle: null,
    fillRect(x, y, w, h) { calls.push([this.fillStyle, x, y, w, h]); },
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {},
  };
  const pv = require('../tools/pebble-editor/app/preview');
  const sc = design.screens[screenId];
  const theme = design.themes[0];
  // Rasterize fillRect calls onto a device-pixel grid: the composed face
  // draws one redundant track rect over the core, so call streams differ
  // while final pixels must not.
  const grid = new Array(sc.w * sc.h).fill(null);
  const paint = (color, x, y, w, h) => {
    if (color === null || color === undefined) return;
    for (let yy = y; yy < y + h; yy++) {
      if (yy < 0 || yy >= sc.h) continue;
      for (let xx = x; xx < x + w; xx++) {
        if (xx < 0 || xx >= sc.w) continue;
        grid[yy * sc.w + xx] = color;
      }
    }
  };
  const rctx = {
    set fillStyle(v) { this._c = v; },
    get fillStyle() { return this._c; },
    fillRect(x, y, w, h) { paint(this._c, x, y, w, h); calls.push([this._c, x, y, w, h]); },
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {},
  };
  void ctx;
  for (const layer of sc.layers) {
    if (layer.kind !== 'graphics') continue;
    if (layerId && layer.id !== layerId) continue;
    pv.drawGraphicsLayer(rctx, layer, sc.w, sc.h, design.constants || {}, theme, state, {});
  }
  return grid.join('|');
}

test('composed bar+rects+groups draw identical pixels to meterbar', () => {
  const { buildCompositionFace } = require('../tools/pebble-editor/replay-neubrutalism');
  const ref = load('neubrutalism-plus.design.json');
  const composed = buildCompositionFace(ref);
  expect(validateDesign(composed)).toEqual([]);
  for (const themeIdx of [0, 1]) {
    // Theme 0 uses battery_status conditionals; theme 1 does not.
    const withTheme = JSON.parse(JSON.stringify(composed));
    const refThemed = JSON.parse(JSON.stringify(ref));
    withTheme.themes = [composed.themes[themeIdx]];
    refThemed.themes = [ref.themes[themeIdx]];
    for (const battery of [0, 17, 40, 100]) {
      for (const steps of [0, 73]) {
        const state = { battery, steps, bars_mode: 0, weather_code: 0, weather_available: true };
        for (const sid of ['w200', 'w144']) {
          // Bars layer only: the only layer composition touches. Compared
          // as rasterized pixels (the track rect is intentionally
          // redundant with the core — same pixels, one extra call).
          expect(recordDraw(refThemed, sid, state, 'bars')).toEqual(recordDraw(withTheme, sid, state, 'bars'));
        }
      }
    }
  }
});
