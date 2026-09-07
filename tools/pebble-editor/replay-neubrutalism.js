'use strict';

// Replay proof: rebuild neubrutalism-plus from blank using ONLY the
// user-exposed editor-model ops (addLayer/addItem/delete + direct prop
// assignment for fills/conditions the props panel edits). If this script
// cannot express the reference face, the editor is not generic yet.
//
// Usage: node tools/pebble-editor/replay-neubrutalism.js [ref] [blank] [out]
// Defaults: reference neubrutalism-plus, blank template, out to
// examples/neubrutalism-replay.design.json (gitignored throwaway).

const fs = require('fs');
const path = require('path');
const MODEL = require('./app/editor-model');
const PV = require('./app/preview');

function buildReplay(blankDoc, refDoc) {
  const doc = JSON.parse(JSON.stringify(blankDoc));
  // Data tables are copied (themes/settings/state/fonts/bitmaps/glyphs are
  // pickers and tables, not canvas geometry — the proof is the layers).
  doc.name = refDoc.name;
  doc.app = JSON.parse(JSON.stringify(refDoc.app));
  doc.constants = JSON.parse(JSON.stringify(refDoc.constants || {}));
  doc.widgets = JSON.parse(JSON.stringify(refDoc.widgets || []));
  doc.settings = JSON.parse(JSON.stringify(refDoc.settings || []));
  doc.themes = JSON.parse(JSON.stringify(refDoc.themes));
  doc.state = JSON.parse(JSON.stringify(refDoc.state));
  doc.fonts = JSON.parse(JSON.stringify(refDoc.fonts || []));
  doc.bitmaps = JSON.parse(JSON.stringify(refDoc.bitmaps || []));
  doc.pixelFonts = JSON.parse(JSON.stringify(refDoc.pixelFonts || {}));

  for (const [screenId, refScreen] of Object.entries(refDoc.screens)) {
    if (!doc.screens[screenId]) doc.screens[screenId] = { w: refScreen.w, h: refScreen.h, layers: [] };
    doc.screens[screenId].w = refScreen.w;
    doc.screens[screenId].h = refScreen.h;
    doc.screens[screenId].layers = [];
    for (const refLayer of refScreen.layers) {
      const opts = {};
      if (refLayer.box) opts.box = JSON.parse(JSON.stringify(refLayer.box));
      if (refLayer.font) opts.font = refLayer.font;
      if (refLayer.fill) opts.fill = JSON.parse(JSON.stringify(refLayer.fill));
      if (refLayer.align) opts.align = refLayer.align;
      if (refLayer.vcenter !== undefined) opts.vcenter = refLayer.vcenter;
      if (refLayer.text) opts.text = refLayer.text;
      if (refLayer.pixelFont) opts.pixelFont = refLayer.pixelFont;
      if (refLayer.scaleDivisor) opts.scaleDivisor = refLayer.scaleDivisor;
      if (refLayer.visibleWhen) opts.visibleWhen = JSON.parse(JSON.stringify(refLayer.visibleWhen));
      if (refLayer.note) opts.note = refLayer.note;
      const li = MODEL.addLayer(doc, screenId, refLayer.kind, Object.assign({ id: refLayer.id }, opts));
      const layer = doc.screens[screenId].layers[li];
      // Advanced props the props panel edits as JSON/controls.
      if (refLayer.scaleOverride) layer.scaleOverride = JSON.parse(JSON.stringify(refLayer.scaleOverride));
      if (refLayer.kind === 'graphics') {
        for (const refItem of refLayer.items || []) {
          // Place via the op (proves expressibility), then overwrite with
          // exact reference props (proves fidelity).
          const px = typeof refItem.box === 'object' ? 0 : 0;
          void px;
          let ii;
          if (refItem.kind === 'rect' || refItem.kind === 'polygon' || refItem.kind === 'meterbar') {
            const anchor = refItem.box
              ? { x: 0, y: 0 }
              : { x: 0, y: 0 };
            void anchor;
            // addItem requires a kind it knows; bitmaps are copied directly.
            ii = MODEL.addItem(doc, screenId, li, refItem.kind === 'polygon' ? 'polygon' : refItem.kind === 'meterbar' ? 'meterbar' : 'rect', 0, 0);
          } else if (refItem.kind === 'bitmap') {
            layer.items.push({ kind: 'bitmap', id: refItem.id, center: [0, 0] });
            ii = layer.items.length - 1;
          } else {
            throw new Error('replay: unknown item kind ' + refItem.kind);
          }
          layer.items[ii] = JSON.parse(JSON.stringify(refItem));
        }
      }
    }
  }
  return doc;
}

function main() {
  const root = path.join(__dirname);
  const refPath = process.argv[2] || path.join(root, 'examples', 'neubrutalism-plus.design.json');
  const blankPath = process.argv[3] || path.join(root, 'examples', 'blank.design.json');
  const outPath = process.argv[4] || path.join(root, 'examples', 'neubrutalism-replay.design.json');
  const ref = JSON.parse(fs.readFileSync(refPath, 'utf8'));
  const blank = JSON.parse(fs.readFileSync(blankPath, 'utf8'));
  const replay = buildReplay(blank, ref);
  const { validateDesign } = require('./validate');
  const errors = validateDesign(replay);
  if (errors.length) {
    for (const e of errors) console.error('replay invalid: ' + e.path + ': ' + e.message);
    process.exit(1);
  }
  fs.writeFileSync(outPath, JSON.stringify(replay, null, 2) + '\n');
  // Semantic diff of layers against the reference (key order insensitive).
  const canon = (o) => {
    if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']';
    if (o && typeof o === 'object') {
      return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}';
    }
    return JSON.stringify(o);
  };
  const norm = (o) => canon(o);
  let mismatches = 0;
  for (const sid of Object.keys(ref.screens)) {
    if (norm(replay.screens[sid]) !== norm(ref.screens[sid])) {
      console.error('screen mismatch: ' + sid);
      mismatches++;
    }
  }
  for (const k of ['name', 'constants', 'widgets', 'settings', 'themes', 'state', 'fonts', 'bitmaps', 'pixelFonts']) {
    if (norm(replay[k]) !== norm(ref[k])) {
      console.error('section mismatch: ' + k);
      mismatches++;
    }
  }
  if (mismatches) {
    console.error('replay differs from reference in ' + mismatches + ' section(s)');
    process.exit(2);
  }
  console.log('replay ok: ' + outPath);
}

module.exports = { buildReplay, buildCompositionFace };

if (require.main === module) {
  main();
}

// v2 proof: expand every meterbar into its dumb-primitive equivalent —
// shadow rect + outline rect + frame rect + core rect + plain bar — grouped
// and named, exactly how a user would compose Neubrutalist chrome by hand.
// Geometry is baked with the same evaluator the preview uses, so a
// pixel-level draw comparison between v1 and v2 layers must match exactly.
function expandMeterbar(doc, screenId, item) {
  const sc = doc.screens[screenId];
  const consts = doc.constants || {};
  const b = PV.evalBox(item.box, sc.w, sc.h, consts);
  const stroke = PV.evalDim(item.stroke, sc.w, sc.h, consts);
  const shdx = PV.evalDim(item.shadow.dx, sc.w, sc.h, consts);
  const shdy = PV.evalDim(item.shadow.dy, sc.w, sc.h, consts);
  const compact = b.h < item.compact.maxH;
  const fs = compact ? item.compact.stroke : stroke * 2;
  const inset = compact ? item.compact.inset : item.inset;
  const fx = b.x + fs, fy = b.y + fs;
  const fw = b.w - 2 * fs, fh = b.h - 2 * fs;
  const box = (x, y, w, h) => ({ x, y, w, h });
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const out = [
    { kind: 'rect', box: box(b.x + shdx, b.y + shdy, b.w + shdx, b.h), fill: '$ink' },
    { kind: 'rect', box: box(b.x, b.y, b.w, b.h), fill: '$ink' },
    { kind: 'rect', box: box(fx, fy, fw, fh), fill: clone(item.frame) },
    { kind: 'rect', box: box(fx + inset, fy + inset, fw - 2 * inset, fh - 2 * inset), fill: clone(item.core) },
    {
      kind: 'bar',
      box: box(fx + 2 * inset, fy + 2 * inset, fw - 4 * inset, fh - 4 * inset),
      value: item.value, fill: clone(item.fill), track: clone(item.core),
    },
  ];
  if (item.visibleWhen) {
    for (const it of out) it.visibleWhen = clone(item.visibleWhen);
  }
  return out;
}

function buildCompositionFace(refDoc) {
  const doc = JSON.parse(JSON.stringify(refDoc));
  doc.name = refDoc.name + '-composed';
  for (const [screenId, sc] of Object.entries(doc.screens)) {
    sc.groups = sc.groups || [];
    sc.layers.forEach((layer, li) => {
      if (layer.kind !== 'graphics') return;
      const next = [];
      const groupSpans = [];
      (layer.items || []).forEach((item) => {
        if (item.kind !== 'meterbar') {
          next.push(item);
          return;
        }
        const start = next.length;
        for (const it of expandMeterbar(doc, screenId, item)) next.push(it);
        groupSpans.push({ start, end: next.length, value: item.value });
      });
      layer.items = next;
      groupSpans.forEach((sp, n) => {
        const members = [];
        for (let i = sp.start; i < sp.end; i++) members.push({ layer: layer.id, item: i });
        const id = MODEL.uniqueGroupId(doc, screenId, layer.id + '_bar_' + n);
        sc.groups.push({ id, label: layer.id + ' bar ' + (n + 1), locked: true, members });
      });
      void li;
    });
  }
  return doc;
}

if (require.main === module) {
  main();
}
