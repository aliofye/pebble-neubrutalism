'use strict';

const pv = require('../tools/pebble-editor/app/preview');

test('evalDim integers and expressions', () => {
  expect(pv.evalDim(5, 200, 228, {})).toBe(5);
  expect(pv.evalDim('w', 200, 228, {})).toBe(200);
  expect(pv.evalDim('w/10', 200, 228, {})).toBe(20);
  expect(pv.evalDim('(w*8)/10', 200, 228, {})).toBe(160);
  expect(pv.evalDim('h/5+h/3+3+200/30', 200, 228, {})).toBe(45 + 76 + 3 + 6);
  expect(pv.evalDim('w-2*stroke', 200, 228, { stroke: 3 })).toBe(194);
  expect(pv.evalDim('-w', 200, 228, {})).toBe(-200);
});

test('evalDim truncates division like C', () => {
  expect(pv.evalDim('7/2', 0, 0, {})).toBe(3);
  expect(pv.evalDim('0-7/2', 0, 0, {})).toBe(-3);
});

test('evalDim rejects bad input', () => {
  expect(() => pv.evalDim('w/0', 10, 10, {})).toThrow('division by zero');
  expect(() => pv.evalDim('w-nope', 10, 10, {})).toThrow('unknown name');
  expect(() => pv.evalDim(1.5, 10, 10, {})).toThrow('non-integer');
});

test('evalCond covers ops and any/or', () => {
  const theme = { tokens: {}, flags: { f: true } };
  const state = { b: 10, s: 'x' };
  expect(pv.evalCond({ var: 'b', op: 'lt', value: 20 }, theme, state)).toBe(true);
  expect(pv.evalCond({ var: 'b', op: 'in', value: [5, 10] }, theme, state)).toBe(true);
  expect(pv.evalCond({ var: 'theme.f', op: 'eq', value: true }, theme, state)).toBe(true);
  expect(pv.evalCond([
    { var: 'b', op: 'lt', value: 20 },
    { var: 'b', op: 'gt', value: 50 },
  ], theme, state)).toBe(false);
  expect(pv.evalCond({ any: [
    { var: 'b', op: 'gt', value: 50 },
    { var: 's', op: 'eq', value: 'x' },
  ] }, theme, state)).toBe(true);
  expect(pv.evalCond(undefined, theme, state)).toBe(true);
});

test('resolveFill picks first match then default', () => {
  const theme = { tokens: { lo: 'GColorRed', hi: 'GColorMayGreen' }, flags: {} };
  const fill = {
    cases: [{ when: { var: 'b', op: 'lt', value: 20 }, fill: '$lo' }],
    default: '$hi',
  };
  expect(pv.resolveFill(fill, theme, { b: 10 })).toBe('#FF0000');
  expect(pv.resolveFill(fill, theme, { b: 90 })).toBe('#55AA55');
  expect(pv.resolveFill('GColorWhite', theme, {})).toBe('#FFFFFF');
  expect(pv.resolveFill('GColorClear', theme, {})).toBe(null);
});

test('palette sanity', () => {
  expect(pv.GCOLORS.Black).toBe('#000000');
  expect(pv.GCOLORS.White).toBe('#FFFFFF');
  expect(pv.GCOLORS.Clear).toBe(null);
  expect(Object.keys(pv.GCOLORS).length).toBe(65);
});

test('drawBarItem paints track then percent fill', () => {
  const calls = [];
  const ctx = { fillStyle: null, fillRect(x, y, w, h) { calls.push([this.fillStyle, x, y, w, h]); } };
  const theme = { tokens: {} };
  const item = { kind: 'bar', box: { x: 0, y: 0, w: 100, h: 20 }, value: '$battery', fill: 'GColorBlack', track: 'GColorWhite' };
  pv.drawBarItem(ctx, item, 200, 228, {}, theme, { battery: 40 });
  expect(calls).toEqual([
    ['#FFFFFF', 0, 0, 100, 20],
    ['#000000', 0, 0, 40, 20],
  ]);
});

test('unified text+pixelFont renders exactly like pixeltext kind', () => {
  const mkCtx = () => {
    const calls = [];
    return {
      ctx: { fillStyle: null, fillRect(x, y, w, h) { calls.push([this.fillStyle, x, y, w, h]); } },
      calls,
    };
  };
  const theme = { tokens: {} };
  const state = { t: '1' };
  const pixelFonts = { digits: { rows: 1, chars: { 1: ['1'] } } };
  const base = { box: { x: 0, y: 0, w: 100, h: 20 }, pixelFont: 'digits', fill: 'GColorBlack', text: '$t', scaleDivisor: 50 };
  const a = mkCtx();
  pv.drawPixelLayer(a.ctx, { ...base, id: 'a', kind: 'text' }, 100, 100, {}, theme, state, pixelFonts);
  const b = mkCtx();
  pv.drawPixelLayer(b.ctx, { ...base, id: 'b', kind: 'pixeltext' }, 100, 100, {}, theme, state, pixelFonts);
  expect(a.calls.length).toBeGreaterThan(0);
  expect(a.calls).toEqual(b.calls);
});
