'use strict';

// One-way codegen: design.json -> generated Pebble C (a face's visuals only).
// Usage: node generate.js <design.json> --out-dir <dir>
// Refuses to emit when validation fails. Overwrites generated_design.c/h.
//
// Conventions (mirror the hand-written reference face):
// - meterbar shadow strip + outline box, and polygon outlines, render in the
//   theme's `ink` token. Every theme should therefore define `ink`.
// - Pixel-text inter-glyph gap is fixed at 1 pixel unit.

const fs = require('fs');
const path = require('path');
const { validateDesign } = require('./validate');

function parseArgs(argv) {
  const args = { file: null, outDir: null };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--out-dir') {
      args.outDir = rest[++i];
    } else if (!args.file) {
      args.file = rest[i];
    } else {
      throw new Error('unexpected argument ' + rest[i]);
    }
  }
  if (!args.file) throw new Error('usage: node generate.js <design.json> --out-dir <dir>');
  if (!args.outDir) {
    args.outDir = path.join(path.dirname(args.file), 'generated');
  }
  return args;
}

function ident(name) {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

function camel(name) {
  return name.split(/[^a-zA-Z0-9]+/).filter(Boolean)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

function dimToC(dim, up, consts) {
  if (typeof dim === 'number') return String(dim);
  const out = dim.replace(/[a-z][a-z0-9_]*/g, m => {
    if (m === 'w' || m === 'h') return m;
    if (consts.has(m)) return up + '_' + ident(m);
    throw new Error('unknown name in expression: ' + m);
  });
  return '(' + out + ')';
}

function valueToC(v) {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  throw new Error('unsupported test value ' + JSON.stringify(v));
}

function testToC(t, th, st) {
  const ref = t.var.startsWith('theme.') ? th + '->' + t.var.slice(6) : st + '->' + t.var;
  switch (t.op) {
    case 'eq':
      if (typeof t.value === 'string') return '(strcmp(' + ref + ', ' + JSON.stringify(t.value) + ') == 0)';
      return '(' + ref + ' == ' + valueToC(t.value) + ')';
    case 'lt': return '(' + ref + ' < ' + valueToC(t.value) + ')';
    case 'lte': return '(' + ref + ' <= ' + valueToC(t.value) + ')';
    case 'gt': return '(' + ref + ' > ' + valueToC(t.value) + ')';
    case 'gte': return '(' + ref + ' >= ' + valueToC(t.value) + ')';
    case 'in':
      return '(' + t.value.map(v => ref + ' == ' + valueToC(v)).join(' || ') + ')';
    default: throw new Error('unknown op ' + t.op);
  }
}

function condToC(cond, th, st) {
  if (!cond) return 'true';
  const tests = Array.isArray(cond) ? cond : (cond.any || [cond]);
  const parts = tests.map(t => testToC(t, th, st));
  return '(' + parts.join(cond.any ? ' || ' : ' && ') + ')';
}

function fillColor(fill, th) {
  if (typeof fill !== 'string') throw new Error('fillColor needs a plain color');
  return fill.startsWith('$') ? th + '->' + fill.slice(1) : fill;
}

class Emitter {
  constructor(doc, sourceFile) {
    this.doc = doc;
    this.sourceFile = sourceFile;
    this.up = ident(doc.name);
    this.camel = camel(doc.name);
    this.p = doc.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    this.consts = new Set(Object.keys(doc.constants || {}));
    this.statics = [];
    this.functions = [];
    this.decls = [];
    this.fillHelperCount = 0;
    this.usedOutline = false;
    this.usedMeterbar = false;
  }

  decl(ret, name, params) {
    this.decls.push(ret + ' ' + name + '(' + params + ');');
  }

  dim(d) {
    return dimToC(d, this.up, this.consts);
  }

  cond(c) {
    return condToC(c, 'th', 'st');
  }

  // Ordered conditional fill -> static file-local helper, returns call expr.
  fillHelper(fill) {
    const id = this.fillHelperCount++;
    const fname = this.p + '_fill_' + id;
    const th = this.camel + 'Theme', st = this.camel + 'State';
    let body = '';
    for (const c of fill.cases) {
      body += '  if (' + condToC(c.when, 'th', 'st') + ') return ' + fillColor(c.fill, 'th') + ';\n';
    }
    body += '  return ' + fillColor(fill.default, 'th') + ';\n';
    this.functions.push('static GColor ' + fname + '(const ' + th + ' *th, const ' + st + ' *st) {\n' + body + '}\n');
    return fname + '(th, st)';
  }

  fillExpr(fill) {
    if (typeof fill !== 'string') return this.fillHelper(fill);
    return fillColor(fill, 'th');
  }

  boxArgs(box) {
    return [this.dim(box.x), this.dim(box.y), this.dim(box.w), this.dim(box.h)];
  }

  emitRect(item) {
    const [x, y, w, h] = this.boxArgs(item.box);
    return '  graphics_context_set_fill_color(ctx, ' + this.fillExpr(item.fill) + ');\n' +
      '  graphics_fill_rect(ctx, GRect(' + x + ', ' + y + ', ' + w + ', ' + h + '), 0, GCornerNone);\n';
  }

  emitPolygon(item, screen, layerId, polyIdx) {
    const base = this.up + '_' + ident(screen) + '_' + ident(layerId) + '_POLY' + polyIdx;
    for (const pt of item.points) {
      for (const d of pt) {
        if (typeof d !== 'number') {
          throw new Error('polygon points must be integer literals in v1 (got ' + JSON.stringify(d) + ')');
        }
      }
    }
    const pts = item.points.map(pt => '    {' + pt[0] + ', ' + pt[1] + '}').join(',\n');
    const gvar = 's_' + this.p + '_' + screen + '_' + layerId + '_p' + polyIdx;
    this.statics.push('static const GPoint ' + base + '_PTS[] = {\n' + pts + '\n  };');
    this.statics.push('static const GPathInfo ' + base + '_INFO = { ' +
      item.points.length + ', (GPoint *)' + base + '_PTS };');
    this.statics.push('static GPath *' + gvar + ';');
    const creator = this.p + '_' + screen + '_' + layerId;
    if (!this.polyOwners) this.polyOwners = {};
    if (!this.polyOwners[creator]) this.polyOwners[creator] = [];
    this.polyOwners[creator].push({ gvar, info: base + '_INFO' });

    let s = '';
    if (item.visibleWhen) s += '  if (' + this.cond(item.visibleWhen) + ') {\n';
    const ind = item.visibleWhen ? '  ' : '';
    s += ind + '  graphics_context_set_fill_color(ctx, ' + this.fillExpr(item.fill) + ');\n';
    s += ind + '  gpath_draw_filled(ctx, ' + gvar + ');\n';
    s += ind + '  graphics_context_set_fill_color(ctx, th->ink);\n';
    if (item.outline) {
      this.usedOutline = true;
      s += ind + '  ' + this.p + '_axis_outline(ctx, ' + base + '_INFO.points, ' +
        base + '_INFO.num_points, ' + this.dim(item.outline.stroke) + ');\n';
    }
    if (item.visibleWhen) s += '  }\n';
    return s;
  }

  emitMeterbar(item) {
    this.usedMeterbar = true;
    const [x, y, w, h] = this.boxArgs(item.box);
    let s = '  ' + this.p + '_meterbar(ctx, ' + [
      x, y, w, h,
      this.dim(item.stroke),
      this.dim(item.shadow.dx), this.dim(item.shadow.dy),
      'th->ink',
      this.fillExpr(item.frame),
      this.fillExpr(item.core),
      this.fillExpr(item.fill),
      'st->' + item.value.slice(1),
      item.inset, item.compact.maxH, item.compact.stroke, item.compact.inset,
    ].join(', ') + ');\n';
    if (item.visibleWhen) {
      s = '  if (' + this.cond(item.visibleWhen) + ') {\n' +
        s.split('\n').map(l => l ? '  ' + l : l).join('\n') + '  }\n';
    }
    return s;
  }

  emitBar(item) {
    this.usedBar = true;
    const [x, y, w, h] = this.boxArgs(item.box);
    let s = '  ' + this.p + '_bar(ctx, ' + [
      x, y, w, h,
      this.fillExpr(item.track),
      this.fillExpr(item.fill),
      'st->' + item.value.slice(1),
    ].join(', ') + ');\n';
    if (item.visibleWhen) {
      s = '  if (' + this.cond(item.visibleWhen) + ') {\n' +
        s.split('\n').map(l => l ? '  ' + l : l).join('\n') + '  }\n';
    }
    return s;
  }

  emitBitmap(item) {
    let s = '';
    if (item.visibleWhen) s += '  if (' + this.cond(item.visibleWhen) + ') {\n';
    const ind = item.visibleWhen ? '  ' : '';
    const cx = this.dim(item.center[0]), cy = this.dim(item.center[1]);
    s += ind + '  {\n';
    s += ind + '    GRect bbounds = gbitmap_get_bounds(bmp_' + item.id + ');\n';
    s += ind + '    int16_t iw = bbounds.size.w;\n';
    s += ind + '    int16_t ih = bbounds.size.h;\n';
    s += ind + '    graphics_context_set_compositing_mode(ctx, GCompOpSet);\n';
    s += ind + '    graphics_draw_bitmap_in_rect(ctx, bmp_' + item.id +
      ', GRect(' + cx + ' - iw / 2, ' + cy + ' - ih / 2, iw, ih));\n';
    s += ind + '    graphics_context_set_compositing_mode(ctx, GCompOpAssign);\n';
    s += ind + '  }\n';
    if (item.visibleWhen) s += '  }\n';
    return s;
  }

  drawParams(layer) {
    const th = this.camel + 'Theme', st = this.camel + 'State';
    let params = 'GContext *ctx, int16_t w, int16_t h, const ' + th + ' *th, const ' + st + ' *st';
    const bitmaps = [];
    for (const item of layer.items || []) {
      if (item.kind === 'bitmap' && !bitmaps.includes(item.id)) bitmaps.push(item.id);
    }
    if (bitmaps.length) params += bitmaps.map(b => ', GBitmap *bmp_' + b).join('');
    return params;
  }

  emitGraphicsLayer(screen, layer) {
    const fname = this.p + '_' + screen + '_' + layer.id + '_draw';
    let body = '  (void)w;\n  (void)h;\n  (void)th;\n  (void)st;\n';
    if (layer.note) body += '  /* ' + layer.note + ' */\n';
    let polyIdx = 0;
    for (const item of layer.items) {
      if (item.kind === 'rect') body += this.emitRect(item);
      else if (item.kind === 'polygon') body += this.emitPolygon(item, screen, layer.id, polyIdx++);
      else if (item.kind === 'meterbar') body += this.emitMeterbar(item);
      else if (item.kind === 'bar') body += this.emitBar(item);
      else if (item.kind === 'bitmap') body += this.emitBitmap(item);
    }
    const params = this.drawParams(layer);
    this.functions.push('void ' + fname + '(' + params + ') {\n' + body + '}\n');
    this.decl('void', fname, params);
    if (layer.visibleWhen) this.emitLayerVisible(screen, layer);
  }

  emitLayerVisible(screen, layer) {
    const fname = this.p + '_' + screen + '_' + layer.id + '_visible';
    const th = this.camel + 'Theme', st = this.camel + 'State';
    const params = 'const ' + th + ' *th, const ' + st + ' *st';
    this.functions.push(
      'bool ' + fname + '(' + params + ') {\n' +
      '  (void)th;\n  (void)st;\n' +
      '  return ' + this.cond(layer.visibleWhen) + ';\n}\n');
    this.decl('bool', fname, params);
  }

  emitTextLayer(screen, layer) {
    const p = this.p, th = this.camel + 'Theme', st = this.camel + 'State';
    const [x, y, w, h] = this.boxArgs(layer.box);
    const frameFn = p + '_' + screen + '_' + layer.id + '_frame';
    this.functions.push(
      'GRect ' + frameFn + '(int16_t w, int16_t h) {\n' +
      '  (void)w;\n  (void)h;\n' +
      '  return GRect(' + x + ', ' + y + ', ' + w + ', ' + h + ');\n}\n');
    this.decl('GRect', frameFn, 'int16_t w, int16_t h');
    const fontRes = this.doc.fonts.find(f => f.id === layer.font).resource;
    const fontFn = p + '_' + screen + '_' + layer.id + '_font';
    this.functions.push(
      'uint32_t ' + fontFn + '(void) {\n' +
      '  return RESOURCE_ID_' + fontRes + ';\n}\n');
    this.decl('uint32_t', fontFn, 'void');
    const align = { left: 'GTextAlignmentLeft', center: 'GTextAlignmentCenter', right: 'GTextAlignmentRight' }[layer.align || 'left'];
    const alignFn = p + '_' + screen + '_' + layer.id + '_align';
    this.functions.push(
      'GTextAlignment ' + alignFn + '(void) {\n' +
      '  return ' + align + ';\n}\n');
    this.decl('GTextAlignment', alignFn, 'void');
    const colorFn = p + '_' + screen + '_' + layer.id + '_color';
    this.functions.push(
      'GColor ' + colorFn + '(const ' + th + ' *th, const ' + st + ' *st) {\n' +
      '  (void)th;\n  (void)st;\n  return ' + this.fillExpr(layer.fill) + ';\n}\n');
    this.decl('GColor', colorFn, 'const ' + th + ' *th, const ' + st + ' *st');
    if (layer.visibleWhen) this.emitLayerVisible(screen, layer);
  }

  emitPixelLayer(screen, layer) {
    const p = this.p, th = this.camel + 'Theme', st = this.camel + 'State';
    const fname = p + '_' + screen + '_' + layer.id + '_draw';
    const [bx, by, bw, bh] = this.boxArgs(layer.box);
    // Glyph tables are emitted from design.json: self-contained, no host
    // glyph module needed. Row count is baked per font.
    const glyphs = this.doc.pixelFonts[layer.pixelFont];
    const grows = glyphs.rows;
    if (!this.emittedGlyphFonts) this.emittedGlyphFonts = new Set();
    const gtype = this.up + '_' + ident(layer.pixelFont) + '_Glyph';
    const gbase = this.up + '_' + ident(layer.pixelFont);
    if (!this.emittedGlyphFonts.has(layer.pixelFont)) {
      this.emittedGlyphFonts.add(layer.pixelFont);
      const entries = Object.entries(glyphs.chars);
      entries.forEach(([ch, rows], i) => {
        if (ch.length !== 1 || ch === "'" || ch === '\\') {
          throw new Error('unsupported glyph char ' + JSON.stringify(ch));
        }
        this.statics.push('static const char * const ' + gbase + '_R' + i + '[] = {\n' +
          rows.map(r => '    "' + r + '"').join(',\n') + '\n  };');
      });
      this.statics.push('typedef struct { char ch; uint8_t w; const char * const *rows; } ' + gtype + ';');
      this.statics.push('static const ' + gtype + ' ' + gbase + '_GLYPHS[] = {\n' +
        entries.map(([ch, rows], i) => '    {\'' + ch + '\', ' + rows[0].length + ', ' + gbase + '_R' + i + '}').join(',\n') +
        '\n  };');
      this.statics.push('static const size_t ' + gbase + '_COUNT = ' + entries.length + ';');
    }
    const gfn = p + '_' + layer.pixelFont + '_glyph';
    const gwfn = p + '_' + layer.pixelFont + '_glyph_width';
    if (!this.emittedGlyphFns) this.emittedGlyphFns = new Set();
    if (!this.emittedGlyphFns.has(layer.pixelFont)) {
      this.emittedGlyphFns.add(layer.pixelFont);
      this.functions.push(
        'static const ' + gtype + ' *' + gfn + '(char c) {\n' +
        '  for (size_t i = 0; i < ' + gbase + '_COUNT; i++) {\n' +
        '    if (' + gbase + '_GLYPHS[i].ch == c) return &' + gbase + '_GLYPHS[i];\n' +
        '  }\n' +
        '  return NULL;\n}\n');
      this.functions.push(
        'static int ' + gwfn + '(const ' + gtype + ' *g) {\n' +
        '  return g ? g->w : 0;\n}\n');
    }
    let body = '  (void)h;\n  (void)th;\n  (void)st;\n';
    if (layer.note) body += '  /* ' + layer.note + ' */\n';
    body += '  int16_t bx = ' + bx + ';\n';
    body += '  int16_t by = ' + by + ';\n';
    body += '  int16_t bw = ' + bw + ';\n';
    body += '  int16_t bh = ' + bh + ';\n';
    body += '  const char *text = st->' + layer.text.slice(1) + ';\n';
    body += '  size_t text_len = strlen(text);\n';
    body += '  int16_t pix_w = w / ' + layer.scaleDivisor + ';\n';
    body += '  int16_t pix_h = pix_w;\n';
    for (const o of layer.scaleOverride || []) {
      body += '  if (' + condToC(o.when, 'th', 'st') + ') {\n';
      if (o.x !== undefined) body += '    pix_w = ' + this.dim(o.x) + ';\n';
      if (o.y !== undefined) body += '    pix_h = ' + this.dim(o.y) + ';\n';
      body += '  }\n';
    }
    body += '  if (pix_w < 1) pix_w = 1;\n';
    body += '  if (pix_h < 1) pix_h = 1;\n';
    body += '  const int16_t glyph_height = ' + grows + ' * pix_h;\n';
    body += '  int16_t total_width = 0;\n';
    body += '  for (size_t i = 0; i < text_len; i++) {\n';
    body += '    const ' + gtype + ' *glyph = ' + gfn + '(text[i]);\n';
    body += '    total_width += ' + gwfn + '(glyph) * pix_w;\n';
    body += '    if (i < text_len - 1) total_width += pix_w;\n';
    body += '  }\n';
    body += '  const int16_t start_x = (bw - total_width) / 2;\n';
    body += '  const int16_t start_y = (bh - glyph_height) / 2;\n';
    body += '  graphics_context_set_fill_color(ctx, ' + this.fillExpr(layer.fill) + ');\n';
    body += '  int16_t cursor_x = start_x;\n';
    body += '  for (size_t i = 0; i < text_len; i++) {\n';
    body += '    const ' + gtype + ' *glyph = ' + gfn + '(text[i]);\n';
    body += '    const int16_t glyph_w = ' + gwfn + '(glyph);\n';
    body += '    if (!glyph) continue;\n';
    body += '    for (int16_t row = 0; row < ' + grows + '; row++) {\n';
    body += '      const char *row_data = glyph->rows[row];\n';
    body += '      for (int16_t col = 0; col < glyph_w; col++) {\n';
    body += '        if (row_data[col] == \'1\') {\n';
    body += '          GRect pixel_rect = GRect(bx + cursor_x + col * pix_w, by + start_y + row * pix_h, pix_w, pix_h);\n';
    body += '          graphics_fill_rect(ctx, pixel_rect, 0, GCornerNone);\n';
    body += '        }\n';
    body += '      }\n';
    body += '    }\n';
    body += '    cursor_x += glyph_w * pix_w + pix_w;\n';
    body += '  }\n';
    const params = 'GContext *ctx, int16_t w, int16_t h, const ' + th + ' *th, const ' + st + ' *st';
    this.functions.push('void ' + fname + '(' + params + ') {\n' + body + '}\n');
    this.decl('void', fname, params);
    if (layer.visibleWhen) this.emitLayerVisible(screen, layer);
  }

  sharedHelpers() {
    const p = this.p;
    let s = '';
    if (this.usedOutline) {
      s += 'static void ' + p + '_axis_outline(GContext *ctx, const GPoint *points, size_t count, int16_t stroke) {\n';
      s += '  for (size_t i = 0; i < count; i++) {\n';
      s += '    GPoint p1 = points[i];\n';
      s += '    GPoint p2 = points[(i + 1) % count];\n';
      s += '    if (p1.y == p2.y) {\n';
      s += '      int16_t x0 = p1.x < p2.x ? p1.x : p2.x;\n';
      s += '      int16_t x1 = p1.x < p2.x ? p2.x : p1.x;\n';
      s += '      GRect seg = GRect(x0 - stroke / 2, p1.y - stroke / 2, (x1 - x0) + stroke, stroke);\n';
      s += '      graphics_fill_rect(ctx, seg, 0, GCornerNone);\n';
      s += '    } else if (p1.x == p2.x) {\n';
      s += '      int16_t y0 = p1.y < p2.y ? p1.y : p2.y;\n';
      s += '      int16_t y1 = p1.y < p2.y ? p2.y : p1.y;\n';
      s += '      GRect seg = GRect(p1.x - stroke / 2, y0 - stroke / 2, stroke, (y1 - y0) + stroke);\n';
      s += '      graphics_fill_rect(ctx, seg, 0, GCornerNone);\n';
      s += '    }\n';
      s += '  }\n';
      s += '}\n\n';
    }
    if (this.usedMeterbar) {
      s += 'static void ' + p + '_meterbar(GContext *ctx, int16_t x, int16_t y, int16_t w, int16_t h,\n';      s += '    int16_t stroke, int16_t shdx, int16_t shdy, GColor ink_c, GColor frame_c, GColor core_c,\n';
      s += '    GColor fill_c, int percent, int16_t inset, int16_t cmaxh, int16_t cstroke, int16_t cinset) {\n';
      s += '  GRect strip = GRect(x + shdx, y + shdy, w + shdx, h);\n';
      s += '  graphics_context_set_fill_color(ctx, ink_c);\n';
      s += '  graphics_fill_rect(ctx, strip, 0, GCornerNone);\n';
      s += '  graphics_context_set_fill_color(ctx, ink_c);\n';
      s += '  graphics_fill_rect(ctx, GRect(x, y, w, h), 0, GCornerNone);\n';
      s += '  const bool compact = h < cmaxh;\n';
      s += '  const int16_t frame_stroke = compact ? cstroke : stroke * 2;\n';
      s += '  const int16_t inner_inset = compact ? cinset : inset;\n';
      s += '  GRect frame = GRect(x + frame_stroke, y + frame_stroke, w - 2 * frame_stroke, h - 2 * frame_stroke);\n';
      s += '  graphics_context_set_fill_color(ctx, frame_c);\n';
      s += '  graphics_fill_rect(ctx, frame, 0, GCornerNone);\n';
      s += '  GRect core = GRect(frame.origin.x + inner_inset, frame.origin.y + inner_inset,\n';
      s += '      frame.size.w - 2 * inner_inset, frame.size.h - 2 * inner_inset);\n';
      s += '  graphics_context_set_fill_color(ctx, core_c);\n';
      s += '  graphics_fill_rect(ctx, core, 0, GCornerNone);\n';
      s += '  GRect bar = GRect(core.origin.x + inner_inset, core.origin.y + inner_inset,\n';
      s += '      core.size.w - 2 * inner_inset, core.size.h - 2 * inner_inset);\n';
      s += '  bar.size.w = (int16_t)((bar.size.w * percent) / 100);\n';
      s += '  graphics_context_set_fill_color(ctx, fill_c);\n';
      s += '  graphics_fill_rect(ctx, bar, 0, GCornerNone);\n';
      s += '}\n\n';
    }
    if (this.usedBar) {
      s += 'static void ' + p + '_bar(GContext *ctx, int16_t x, int16_t y, int16_t w, int16_t h,\n';
      s += '    GColor track_c, GColor fill_c, int percent) {\n';
      s += '  if (percent < 0) percent = 0;\n';
      s += '  if (percent > 100) percent = 100;\n';
      s += '  graphics_context_set_fill_color(ctx, track_c);\n';
      s += '  graphics_fill_rect(ctx, GRect(x, y, w, h), 0, GCornerNone);\n';
      s += '  graphics_context_set_fill_color(ctx, fill_c);\n';
      s += '  graphics_fill_rect(ctx, GRect(x, y, (int16_t)((w * percent) / 100), h), 0, GCornerNone);\n';
      s += '}\n\n';
    }
    return s;
  }

  generate() {
    const doc = this.doc;
    this.statics = [];
    this.functions = [];
    this.decls = [];
    this.polyOwners = {};

    for (const [screen, sc] of Object.entries(doc.screens)) {
      for (const layer of sc.layers) {
        if (layer.kind === 'graphics') this.emitGraphicsLayer(screen, layer);
        else if (layer.kind === 'text') {
          // Unified text: pixelFont present → pixel glyphs, else vector font.
          // kind pixeltext (deprecated) always takes the pixel path.
          if (layer.pixelFont) this.emitPixelLayer(screen, layer);
          else this.emitTextLayer(screen, layer);
        }
        else if (layer.kind === 'pixeltext') this.emitPixelLayer(screen, layer);
      }
    }

    const up = this.up, camel = this.camel, p = this.p;
    const sourceName = path.basename(this.sourceFile || 'design.json');

    let h = '/* DO NOT EDIT - generated from ' + sourceName + ' by tools/pebble-editor/generate.js */\n';
    h += '#pragma once\n\n#include <pebble.h>\n#include <stdbool.h>\n\n';
    for (const [k, v] of Object.entries(doc.constants || {})) {
      h += '#define ' + up + '_' + ident(k) + ' ' + v + '\n';
    }
    if (Object.keys(doc.constants || {}).length) h += '\n';

    const tokenNames = [];
    for (const t of doc.themes) {
      for (const k of Object.keys(t.tokens)) {
        if (!tokenNames.includes(k)) tokenNames.push(k);
      }
    }
    const flagNames = [];
    for (const t of doc.themes) {
      for (const k of Object.keys(t.flags || {})) {
        if (!flagNames.includes(k)) flagNames.push(k);
      }
    }
    h += 'typedef struct {\n';
    for (const k of tokenNames) h += '  GColor ' + k + ';\n';
    for (const k of flagNames) h += '  bool ' + k + ';\n';
    h += '} ' + camel + 'Theme;\n\n';

    h += 'typedef struct {\n';
    for (const s of doc.state) {
      const ty = s.type === 'int' ? 'int' : (s.type === 'bool' ? 'bool' : 'const char *');
      h += '  ' + ty + ' ' + s.name + ';' + (s.desc ? ' /* ' + s.desc + ' */' : '') + '\n';
    }
    h += '} ' + camel + 'State;\n\n';

    h += '#define ' + up + '_THEME_COUNT ' + doc.themes.length + '\n';
    h += 'extern const ' + camel + 'Theme ' + up + '_THEMES[' + doc.themes.length + '];\n\n';
    for (const d of this.decls) h += d + '\n';
    for (const key of Object.keys(this.polyOwners)) {
      h += 'void ' + key + '_polygons_create(void);\n';
      h += 'void ' + key + '_polygons_destroy(void);\n';
    }
    h += '\n';

    let c = '/* DO NOT EDIT - generated from ' + sourceName + ' by tools/pebble-editor/generate.js */\n';
    c += '#include "generated_design.h"\n\n#include <string.h>\n\n';
    c += 'const ' + camel + 'Theme ' + up + '_THEMES[' + doc.themes.length + '] = {\n';
    for (const t of doc.themes) {
      c += '  { /* ' + t.name + ' */\n';
      for (const k of tokenNames) {
        c += '    .' + k + ' = ' + (t.tokens[k] || 'GColorBlack') + ',\n';
      }
      for (const k of flagNames) {
        const v = (t.flags || {})[k];
        c += '    .' + k + ' = ' + (v ? 'true' : 'false') + ',\n';
      }
      c += '  },\n';
    }
    c += '};\n\n';

    c += this.sharedHelpers();
    for (const s of this.statics) c += s + '\n\n';
    for (const [key, vars] of Object.entries(this.polyOwners)) {
      c += 'void ' + key + '_polygons_create(void) {\n';
      for (const v of vars) {
        c += '  ' + v.gvar + ' = gpath_create(&' + v.info + ');\n';
      }
      c += '}\n\n';
      c += 'void ' + key + '_polygons_destroy(void) {\n';
      for (const v of vars) {
        c += '  if (' + v.gvar + ') { gpath_destroy(' + v.gvar + '); ' + v.gvar + ' = NULL; }\n';
      }
      c += '}\n\n';
    }
    for (const fn of this.functions) c += fn + '\n';

    return { header: h, source: c };
  }
}

function main() {
  const args = parseArgs(process.argv);
  const doc = JSON.parse(fs.readFileSync(args.file, 'utf8'));
  const errors = validateDesign(doc);
  if (errors.length) {
    for (const e of errors) console.error(args.file + ': ' + e.path + ': ' + e.message);
    process.exit(1);
  }
  const em = new Emitter(doc, args.file);
  const out = em.generate();
  fs.mkdirSync(args.outDir, { recursive: true });
  fs.writeFileSync(path.join(args.outDir, 'generated_design.c'), out.source);
  fs.writeFileSync(path.join(args.outDir, 'generated_design.h'), out.header);
  console.log('wrote ' + path.join(args.outDir, 'generated_design.c'));
  console.log('wrote ' + path.join(args.outDir, 'generated_design.h'));
}

module.exports = { Emitter, parseArgs };

if (require.main === module) {
  main();
}
