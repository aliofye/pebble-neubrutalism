'use strict';

const { validateDesign } = require('../tools/pebble-editor/validate');

function makeValid() {
  return {
    schema: 1,
    name: 'fixture',
    screens: {
      main: {
        w: 144,
        h: 168,
        layers: [
          {
            id: 'background',
            kind: 'graphics',
            items: [
              { kind: 'rect', box: { x: 0, y: 0, w: 'w', h: 'h' }, fill: '$background' },
              {
                kind: 'polygon',
                points: [[10, 10], [50, 10], [50, 30]],
                fill: 'GColorWhite',
                outline: { stroke: 3 }
              },
              {
                kind: 'bitmap',
                id: 'bt',
                center: [39, 25],
                visibleWhen: { any: [{ var: 'bt', op: 'eq', value: false }] }
              }
            ]
          },
          {
            id: 'bars',
            kind: 'graphics',
            items: [
              {
                kind: 'meterbar',
                box: { x: 16, y: 111, w: 112, h: 38 },
                stroke: 3,
                shadow: { dx: 2, dy: 3 },
                frame: '$battery_frame',
                core: '$ink',
                value: '$battery',
                fill: {
                  cases: [
                    { when: { var: 'battery', op: 'lt', value: 20 }, fill: '$battery_low' }
                  ],
                  default: '$battery_bar'
                },
                inset: 3,
                compact: { maxH: 30, stroke: 1, inset: 2 }
              },
            ]
          },
          {
            id: 'date',
            kind: 'text',
            box: { x: 69, y: 3, w: 72, h: 28 },
            font: 'jersey',
            fill: '$ink',
            align: 'center',
            vcenter: true,
            text: '$date_str'
          },
          {
            id: 'time',
            kind: 'pixeltext',
            box: { x: 14, y: 33, w: 115, h: 56 },
            pixelFont: 'digits',
            fill: '$ink',
            text: '$time_str',
            scaleDivisor: 40,
            scaleOverride: [
              { when: { var: 'theme.battery_status', op: 'eq', value: true }, y: 4 }
            ]
          }
        ]
      }
    },
    themes: [
      {
        name: 'a',
        tokens: {
          background: 'GColorPastelYellow',
          ink: 'GColorBlack',
          battery_frame: 'GColorPastelYellow',
          battery_bar: 'GColorLavenderIndigo',
          battery_low: 'GColorRed'
        },
        flags: { battery_status: true }
      },
      {
        name: 'b',
        tokens: {
          background: 'GColorLightGray',
          ink: 'GColorBlack',
          battery_frame: 'GColorLightGray',
          battery_bar: 'GColorDarkGreen',
          battery_low: 'GColorBlack'
        },
        flags: { battery_status: false }
      }
    ],
    widgets: ['time', 'date', 'battery'],
    state: [
      { name: 'battery', type: 'int' },
      { name: 'bt', type: 'bool' },
      { name: 'date_str', type: 'string' },
      { name: 'time_str', type: 'string' }
    ],
    fonts: [{ id: 'jersey', resource: 'FONT_JERSEY_25' }],
    bitmaps: [{ id: 'bt', resource: 'IMAGE_BT_DISCONNECT' }],
    pixelFonts: {
      digits: {
        rows: 2,
        chars: {
          0: ['11', '11'],
          ':': ['00', '11']
        }
      }
    }
  };
}

test('accepts a minimal valid design', () => {
  expect(validateDesign(makeValid())).toEqual([]);
});

test('accepts unified text layers with a pixelFont and no font', () => {
  const d = makeValid();
  d.screens.main.layers.push({
    id: 'clock', kind: 'text',
    box: { x: 0, y: 0, w: 100, h: 40 },
    pixelFont: 'digits', fill: '$ink', text: '$time_str', scaleDivisor: 40,
  });
  expect(validateDesign(d)).toEqual([]);
});

test('rejects text layers with neither font nor pixelFont', () => {
  const d = makeValid();
  d.screens.main.layers.push({
    id: 'clock', kind: 'text',
    box: { x: 0, y: 0, w: 100, h: 40 },
    fill: '$ink', text: '$time_str',
  });
  expect(validateDesign(d).length).toBeGreaterThan(0);
});

test('rejects unified text with unknown pixelFont', () => {
  const d = makeValid();
  d.screens.main.layers.push({
    id: 'clock', kind: 'text',
    box: { x: 0, y: 0, w: 100, h: 40 },
    pixelFont: 'nope', fill: '$ink', text: '$time_str', scaleDivisor: 40,
  });
  expect(validateDesign(d).some(e => e.message.includes('unknown pixelFont'))).toBe(true);
});

test('rejects unknown schema version', () => {
  const d = makeValid();
  d.schema = 2;
  expect(validateDesign(d).length).toBeGreaterThan(0);
});

test('rejects token missing from one theme', () => {
  const d = makeValid();
  delete d.themes[1].tokens.battery_low;
  const errs = validateDesign(d);
  expect(errs.some(e => e.message.includes('missing token $battery_low'))).toBe(true);
});

test('rejects unknown $token reference', () => {
  const d = makeValid();
  d.screens.main.layers[0].items[0].fill = '$nope';
  const errs = validateDesign(d);
  expect(errs.some(e => e.message.includes('missing token $nope'))).toBe(true);
});

test('rejects bad GColor literal', () => {
  const d = makeValid();
  d.screens.main.layers[0].items[1].fill = 'red';
  expect(validateDesign(d).length).toBeGreaterThan(0);
});

test('rejects unknown state var in test', () => {
  const d = makeValid();
  d.screens.main.layers[1].items[0].fill.cases[0].when.var = 'frobnicate';
  const errs = validateDesign(d);
  expect(errs.some(e => e.message.includes('unknown state var'))).toBe(true);
});

test('rejects numeric test on bool state', () => {
  const d = makeValid();
  d.screens.main.layers[1].items[0].fill.cases[0].when = { var: 'bt', op: 'lt', value: 5 };
  const errs = validateDesign(d);
  expect(errs.some(e => e.message.includes('needs int'))).toBe(true);
});

test('rejects unknown theme flag', () => {
  const d = makeValid();
  d.screens.main.layers[3].scaleOverride[0].when.var = 'theme.nope';
  const errs = validateDesign(d);
  expect(errs.some(e => e.message.includes('missing flag nope'))).toBe(true);
});

test('rejects malformed expressions', () => {
  for (const bad of ['w//2', 'foo', '(w+2', 'w 2', 'w+', '2**w', '']) {
    const d = makeValid();
    d.screens.main.layers[0].items[0].box.w = bad;
    expect(validateDesign(d).length).toBeGreaterThan(0, bad);
  }
});

test('accepts valid expressions', () => {
  for (const good of ['w', 'w/10', '(w*8)/10', 'h/3', 'w - 2*3', '100']) {
    const d = makeValid();
    d.screens.main.layers[0].items[0].box.w = good === '100' ? 100 : good;
    expect(validateDesign(d)).toEqual([], good);
  }
});

test('rejects unknown font, bitmap, pixelFont', () => {
  let d = makeValid();
  d.screens.main.layers[2].font = 'nope';
  expect(validateDesign(d).some(e => e.message.includes('unknown font'))).toBe(true);
  d = makeValid();
  d.screens.main.layers[0].items[2].id = 'nope';
  expect(validateDesign(d).some(e => e.message.includes('unknown bitmap'))).toBe(true);
  d = makeValid();
  d.screens.main.layers[3].pixelFont = 'nope';
  expect(validateDesign(d).some(e => e.message.includes('unknown pixelFont'))).toBe(true);
});

test('rejects ragged glyph and wrong row count', () => {
  let d = makeValid();
  d.pixelFonts.digits.chars['0'] = ['111', '11'];
  expect(validateDesign(d).some(e => e.message.includes('ragged'))).toBe(true);
  d = makeValid();
  d.pixelFonts.digits.chars['0'] = ['11', '11', '11'];
  expect(validateDesign(d).some(e => e.message.includes('expected 2 rows'))).toBe(true);
});

test('rejects duplicate layer ids', () => {
  const d = makeValid();
  d.screens.main.layers.push({ ...d.screens.main.layers[0] });
  expect(validateDesign(d).some(e => e.message.includes('duplicate layer id'))).toBe(true);
});

test('rejects meterbar value bound to non-int state', () => {
  const d = makeValid();
  d.screens.main.layers[1].items[0].value = '$date_str';
  const errs = validateDesign(d);
  expect(errs.some(e => e.message.includes('expected int'))).toBe(true);
});

test('accepts expressions using declared constants', () => {
  const d = makeValid();
  d.constants = { stroke: 3 };
  d.screens.main.layers[0].items[0].box.w = 'w-2*stroke';
  expect(validateDesign(d)).toEqual([]);
});

test('rejects unknown names in expressions', () => {
  const d = makeValid();
  d.constants = { stroke: 3 };
  d.screens.main.layers[0].items[0].box.w = 'w-2*nope';
  const errs = validateDesign(d);
  expect(errs.some(e => e.message.includes('unknown name'))).toBe(true);
});

const path = require('path');
const REGISTRY = path.join(__dirname, '..', 'tools', 'pebble-editor', 'widgets');

function makeWidgetDoc() {
  return {
    schema: 1,
    name: 'wface',
    screens: {
      main: {
        w: 144, h: 168,
        layers: [
          {
            id: 'bars', kind: 'graphics', items: [
              {
                kind: 'meterbar',
                box: { x: 16, y: 111, w: 112, h: 38 },
                stroke: 3, shadow: { dx: 2, dy: 3 },
                frame: 'GColorBlack', core: 'GColorBlack',
                value: '$battery', fill: 'GColorBlack',
                inset: 3, compact: { maxH: 30, stroke: 3, inset: 2 },
              },
            ]
          },
        ]
      }
    },
    themes: [{ name: 'a', tokens: { x: 'GColorBlack' } }],
    state: [{ name: 'battery', type: 'int' }],
    widgets: ['battery'],
  };
}

test('accepts widget-provided state with real registry', () => {
  expect(validateDesign(makeWidgetDoc(), { widgetsDir: REGISTRY })).toEqual([]);
});

test('rejects unknown widget', () => {
  const d = makeWidgetDoc();
  d.widgets = ['nope'];
  const errs = validateDesign(d, { widgetsDir: REGISTRY });
  expect(errs.some(e => e.message.includes('cannot load manifest'))).toBe(true);
});

test('rejects state var without provider', () => {
  const d = makeWidgetDoc();
  d.state.push({ name: 'mystery', type: 'int' });
  const errs = validateDesign(d, { widgetsDir: REGISTRY });
  expect(errs.some(e => e.message.includes('no provider'))).toBe(true);
});

test('accepts custom layer ids carrying the widget binding', () => {
  const d = makeWidgetDoc();
  d.screens.main.layers[0].id = 'mymeters';
  expect(validateDesign(d, { widgetsDir: REGISTRY })).toEqual([]);
});

test('tolerates listed-but-unused widgets (pruning is the editor job)', () => {
  const d = makeWidgetDoc();
  d.screens.main.layers[0].items = [];
  expect(validateDesign(d, { widgetsDir: REGISTRY })).toEqual([]);
});

test('rejects persist key collisions', () => {
  const d = makeWidgetDoc();
  d.widgets = ['steps'];
  d.state.push({ name: 'steps', type: 'int' });
  d.settings = [
    { var: 'a', key: 'A', kind: 'int', default: 1, persist: 4, clay: { type: 'slider', messageKey: 'A' } },
  ];
  const errs = validateDesign(d, { widgetsDir: REGISTRY });
  expect(errs.some(e => e.message.includes('persist key 4'))).toBe(true);
});

test('rejects clay messageKey mismatch', () => {
  const d = makeWidgetDoc();
  d.state.push({ name: 'mode', type: 'int' });
  d.settings = [
    { var: 'mode', key: 'BARS_MODE', kind: 'int', default: 0, persist: 8, clay: { type: 'select', messageKey: 'WRONG' } },
  ];
  const errs = validateDesign(d, { widgetsDir: REGISTRY });
  expect(errs.some(e => e.message.includes('must equal key'))).toBe(true);
});

test('rejects duplicate message keys', () => {
  const d = makeWidgetDoc();
  d.state.push({ name: 'mode', type: 'int' });
  d.settings = [
    { var: 'mode', key: 'BARS_MODE', kind: 'int', default: 0, persist: 8, clay: { type: 'select', messageKey: 'BARS_MODE' } },
    { var: 'mode2', key: 'BARS_MODE', kind: 'int', default: 0, persist: 10, clay: { type: 'select', messageKey: 'BARS_MODE' } },
  ];
  d.state.push({ name: 'mode2', type: 'int' });
  const errs = validateDesign(d, { widgetsDir: REGISTRY });
  expect(errs.some(e => e.message.includes('declared by both'))).toBe(true);
});

test('rejects setting var/type mismatch with state', () => {
  const d = makeWidgetDoc();
  d.state.push({ name: 'mode', type: 'string' });
  d.settings = [
    { var: 'mode', key: 'BARS_MODE', kind: 'int', default: 0, persist: 8, clay: { type: 'select', messageKey: 'BARS_MODE' } },
  ];
  const errs = validateDesign(d, { widgetsDir: REGISTRY });
  expect(errs.some(e => e.message.includes('provides int'))).toBe(true);
});

test('rejects app block with bad uuid', () => {
  const d = makeWidgetDoc();
  d.app = { displayName: 'X', uuid: 'not-a-uuid' };
  const errs = validateDesign(d, { widgetsDir: REGISTRY });
  expect(errs.length).toBeGreaterThan(0);
});

test('accepts a valid face setting', () => {
  const d = makeWidgetDoc();
  d.state.push({ name: 'mode', type: 'int' });
  d.settings = [
    { var: 'mode', key: 'BARS_MODE', kind: 'int', default: 0, persist: 8, clay: { type: 'select', messageKey: 'BARS_MODE' } },
  ];
  expect(validateDesign(d, { widgetsDir: REGISTRY })).toEqual([]);
});

test('rejects structural errors (missing required)', () => {
  const d = makeValid();
  delete d.themes;
  expect(validateDesign(d).length).toBeGreaterThan(0);
});

function makeAppDoc(targets) {
  const d = makeWidgetDoc();
  d.app = {
    displayName: 'T',
    uuid: '12345678-1234-1234-1234-1234567890ab',
    targets,
  };
  return d;
}

test('accepts build targets dims-matched to a screen', () => {
  expect(validateDesign(makeAppDoc(['basalt']), { widgetsDir: REGISTRY })).toEqual([]);
});

test('rejects build targets with no dims-matching screen', () => {
  const errs = validateDesign(makeAppDoc(['basalt', 'emery']), { widgetsDir: REGISTRY });
  expect(errs.some(e => e.message.includes('no 200×228 screen for emery'))).toBe(true);
});

test('rejects build targets outside the platform registry', () => {
  // chalk passes the schema enum but has no rectangular screen mapping yet.
  const errs = validateDesign(makeAppDoc(['chalk']), { widgetsDir: REGISTRY });
  expect(errs.some(e => e.message.includes('unknown platform chalk'))).toBe(true);
});
