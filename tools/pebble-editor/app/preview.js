'use strict';

// Schema-driven Pebble preview renderer (canvas 2D, device pixels).
// Consumes design.json directly: same file the C codegen consumes, so preview
// and device agree by construction. Works in browser and Node (no DOM use
// except through injected ctx/font/bitmap registries).

const GCOLORS = {
  ArmyGreen: '#555500', BabyBlueEyes: '#AAAAFF', Black: '#000000',
  Blue: '#0000FF', BlueMoon: '#0055FF', Brass: '#AAAA55',
  BrightGreen: '#55FF00', BrilliantRose: '#FF55AA', BulgarianRose: '#550000',
  CadetBlue: '#55AAAA', Celeste: '#AAFFFF', ChromeYellow: '#FFAA00',
  Clear: null, CobaltBlue: '#0055AA', Cyan: '#00FFFF',
  DarkCandyAppleRed: '#AA0000', DarkGray: '#555555', DarkGreen: '#005500',
  DukeBlue: '#0000AA', ElectricBlue: '#55FFFF',
  ElectricUltramarine: '#5500FF', FashionMagenta: '#FF00AA',
  Folly: '#FF0055', Green: '#00FF00', Icterine: '#FFFF55',
  ImperialPurple: '#550055', Inchworm: '#AAFF55', Indigo: '#5500AA',
  IslamicGreen: '#00AA00', JaegerGreen: '#00AA55', JazzberryJam: '#AA0055',
  KellyGreen: '#55AA00', LavenderIndigo: '#AA55FF', Liberty: '#5555AA',
  LightGray: '#AAAAAA', Limerick: '#AAAA00', Magenta: '#FF00FF',
  Malachite: '#00FF55', MayGreen: '#55AA55', MediumAquamarine: '#55FFAA',
  MediumSpringGreen: '#00FFAA', Melon: '#FFAAAA', MidnightGreen: '#005555',
  MintGreen: '#AAFFAA', Orange: '#FF5500', OxfordBlue: '#000055',
  PastelYellow: '#FFFFAA', PictonBlue: '#55AAFF', Purple: '#AA00AA',
  Purpureus: '#AA55AA', Rajah: '#FFAA55', Red: '#FF0000',
  RichBrilliantLavender: '#FFAAFF', RoseVale: '#AA5555',
  ScreaminGreen: '#55FF55', ShockingPink: '#FF55FF', SpringBud: '#AAFF00',
  SunsetOrange: '#FF5555', TiffanyBlue: '#00AAAA', VeryLightBlue: '#5555FF',
  VividCerulean: '#00AAFF', VividViolet: '#AA00FF', White: '#FFFFFF',
  WindsorTan: '#AA5500', Yellow: '#FFFF00',
};

// Browser rasterization of pixel TTFs differs slightly from the watch's
// FreeType output; per-resource calibration measured against emulator shots.
const FONT_CALIBRATION = {
  FONT_JERSEY_38: { x: 0.99, y: 0.93 },
  FONT_JERSEY_25: { x: 0.98, y: 0.85 },
};

function tokenizeExpr(src) {
  const tokens = src.match(/[0-9]+|[a-z][a-z0-9_]*|[+\-*/()]/g) || [];
  if (tokens.join('') !== src) throw new Error('bad expression ' + JSON.stringify(src));
  return tokens;
}

function evalDim(expr, w, h, consts) {
  if (typeof expr === 'number') {
    if (!Number.isInteger(expr)) throw new Error('non-integer dim ' + expr);
    return expr;
  }
  const tokens = tokenizeExpr(String(expr).replace(/\s/g, ''));
  const vals = [];
  const ops = [];
  const prec = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const apply = () => {
    const op = ops.pop();
    const b = vals.pop(), a = vals.pop();
    if (op === '+') vals.push(a + b);
    else if (op === '-') vals.push(a - b);
    else if (op === '*') vals.push(a * b);
    else if (op === '/') {
      if (b === 0) throw new Error('division by zero');
      vals.push(Math.trunc(a / b));
    }
  };
  let prev = 'op';
  for (const t of tokens) {
    if (/^\d+$/.test(t)) {
      vals.push(parseInt(t, 10));
      prev = 'num';
    } else if (t === 'w') { vals.push(w); prev = 'num'; }
    else if (t === 'h') { vals.push(h); prev = 'num'; }
    else if (/^[a-z][a-z0-9_]*$/.test(t)) {
      if (!(t in (consts || {}))) throw new Error('unknown name ' + t);
      vals.push(consts[t]);
      prev = 'num';
    } else if (t === '(') { ops.push(t); prev = 'op'; }
    else if (t === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') apply();
      ops.pop();
      prev = 'num';
    } else {
      if (t === '-' && prev === 'op') vals.push(0);
      while (ops.length && ops[ops.length - 1] !== '(' &&
             prec[ops[ops.length - 1]] >= prec[t]) apply();
      ops.push(t);
      prev = 'op';
    }
    void prev;
  }
  while (ops.length) apply();
  if (vals.length !== 1) throw new Error('bad expression ' + JSON.stringify(expr));
  return vals[0];
}

function evalTest(t, theme, state) {
  const v = t.var.startsWith('theme.') ? (theme.flags || {})[t.var.slice(6)] : state[t.var];
  switch (t.op) {
    case 'eq': return v === t.value;
    case 'lt': return v < t.value;
    case 'lte': return v <= t.value;
    case 'gt': return v > t.value;
    case 'gte': return v >= t.value;
    case 'in': return t.value.includes(v);
    default: throw new Error('unknown op ' + t.op);
  }
}

function evalCond(cond, theme, state) {
  if (!cond) return true;
  const tests = Array.isArray(cond) ? cond : (cond.any || [cond]);
  return cond.any
    ? tests.some(t => evalTest(t, theme, state))
    : tests.every(t => evalTest(t, theme, state));
}

function resolveColor(str, theme) {
  if (typeof str !== 'string') return null;
  if (str.startsWith('$')) {
    const tok = theme.tokens[str.slice(1)];
    if (tok === undefined) throw new Error('unknown token ' + str);
    return GCOLORS[tok.slice(6)] !== undefined ? GCOLORS[tok.slice(6)] : null;
  }
  if (!str.startsWith('GColor')) throw new Error('bad color ' + str);
  const hex = GCOLORS[str.slice(6)];
  if (hex === undefined) throw new Error('unknown GColor ' + str);
  return hex;
}

function resolveFill(fill, theme, state) {
  if (typeof fill === 'string') return resolveColor(fill, theme);
  for (const c of fill.cases) {
    if (evalCond(c.when, theme, state)) return resolveFill(c.fill, theme, state);
  }
  return resolveFill(fill.default, theme, state);
}

function fillRect(ctx, x, y, w, h, color) {
  if (color === null || color === undefined) return;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function drawAxisOutline(ctx, points, stroke, color) {
  if (color === null || color === undefined) return;
  const half = Math.floor(stroke / 2);
  ctx.fillStyle = color;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i], p2 = points[(i + 1) % points.length];
    if (p1[1] === p2[1]) {
      const x0 = Math.min(p1[0], p2[0]), x1 = Math.max(p1[0], p2[0]);
      ctx.fillRect(x0 - half, p1[1] - half, (x1 - x0) + stroke, stroke);
    } else if (p1[0] === p2[0]) {
      const y0 = Math.min(p1[1], p2[1]), y1 = Math.max(p1[1], p2[1]);
      ctx.fillRect(p1[0] - half, y0 - half, stroke, (y1 - y0) + stroke);
    }
  }
}

function evalBox(box, w, h, consts) {
  return {
    x: evalDim(box.x, w, h, consts),
    y: evalDim(box.y, w, h, consts),
    w: evalDim(box.w, w, h, consts),
    h: evalDim(box.h, w, h, consts),
  };
}

function drawRectItem(ctx, item, w, h, consts, theme, state) {
  const b = evalBox(item.box, w, h, consts);
  fillRect(ctx, b.x, b.y, b.w, b.h, resolveFill(item.fill, theme, state));
}

function drawPolygonItem(ctx, item, w, h, consts, theme, state) {
  const pts = item.points.map(pt => [evalDim(pt[0], w, h, consts), evalDim(pt[1], w, h, consts)]);
  const color = resolveFill(item.fill, theme, state);
  if (color !== null && color !== undefined) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
  }
  if (item.outline) {
    const s = evalDim(item.outline.stroke, w, h, consts);
    drawAxisOutline(ctx, pts, s, resolveColor('$ink', theme));
  }
}

function drawMeterbarItem(ctx, item, w, h, consts, theme, state) {
  const b = evalBox(item.box, w, h, consts);
  const stroke = evalDim(item.stroke, w, h, consts);
  const shdx = evalDim(item.shadow.dx, w, h, consts);
  const shdy = evalDim(item.shadow.dy, w, h, consts);
  const ink = resolveColor('$ink', theme);
  const frameC = resolveFill(item.frame, theme, state);
  const coreC = resolveFill(item.core, theme, state);
  const fillC = resolveFill(item.fill, theme, state);
  const pct = state[item.value.slice(1)];
  const compact = b.h < item.compact.maxH;
  const frameStroke = compact ? item.compact.stroke : stroke * 2;
  const inset = compact ? item.compact.inset : item.inset;
  fillRect(ctx, b.x + shdx, b.y + shdy, b.w + shdx, b.h, ink);
  fillRect(ctx, b.x, b.y, b.w, b.h, ink);
  const fx = b.x + frameStroke, fy = b.y + frameStroke;
  const fw = b.w - 2 * frameStroke, fh = b.h - 2 * frameStroke;
  fillRect(ctx, fx, fy, fw, fh, frameC);
  fillRect(ctx, fx + inset, fy + inset, fw - 2 * inset, fh - 2 * inset, coreC);
  const barW = Math.floor((fw - 4 * inset) * pct / 100);
  fillRect(ctx, fx + 2 * inset, fy + 2 * inset, barW, fh - 4 * inset, fillC);
}

function drawBarItem(ctx, item, w, h, consts, theme, state) {
  // Dumb primitive: track rect with a plain percent-width fill. No shadow,
  // no frame, no chrome — composition (extra rects + groups) is the user's
  // job, not the primitive's.
  const b = evalBox(item.box, w, h, consts);
  fillRect(ctx, b.x, b.y, b.w, b.h, resolveFill(item.track, theme, state));
  const pct = Math.max(0, Math.min(100, state[item.value.slice(1)] || 0));
  const barW = Math.floor(b.w * pct / 100);
  fillRect(ctx, b.x, b.y, barW, b.h, resolveFill(item.fill, theme, state));
}

function drawBitmapItem(ctx, item, w, h, consts, bitmaps) {  const img = (bitmaps || {})[item.id];
  if (!img || !img.width) return;
  const cx = evalDim(item.center[0], w, h, consts);
  const cy = evalDim(item.center[1], w, h, consts);
  ctx.drawImage(img, cx - img.width / 2, cy - img.height / 2);
}

function itemVisible(item, theme, state) {
  return evalCond(item.visibleWhen, theme, state);
}

function drawGraphicsLayer(ctx, layer, w, h, consts, theme, state, bitmaps) {
  for (const item of layer.items) {
    if (!itemVisible(item, theme, state)) continue;
    if (item.kind === 'rect') drawRectItem(ctx, item, w, h, consts, theme, state);
    else if (item.kind === 'polygon') drawPolygonItem(ctx, item, w, h, consts, theme, state);
    else if (item.kind === 'meterbar') drawMeterbarItem(ctx, item, w, h, consts, theme, state);
    else if (item.kind === 'bar') drawBarItem(ctx, item, w, h, consts, theme, state);
    else if (item.kind === 'bitmap') drawBitmapItem(ctx, item, w, h, consts, bitmaps);
  }
}

function fontPxSize(resource) {
  const m = /_(\d+)$/.exec(resource || '');
  return m ? parseInt(m[1], 10) : 16;
}

function drawTextLayer(ctx, layer, w, h, consts, theme, state, fonts) {
  const b = evalBox(layer.box, w, h, consts);
  const font = (fonts || {})[layer.font] || {};
  const size = fontPxSize(font.resource);
  const color = resolveFill(layer.fill, theme, state);
  const text = state[layer.text.slice(1)];
  if (color === null || color === undefined || text === undefined) return;
  const cal = FONT_CALIBRATION[font.resource] || { x: 1, y: 1 };
  ctx.font = size + 'px ' + (font.family || 'monospace');
  ctx.textAlign = layer.align || 'left';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(text);
  const asc = m.actualBoundingBoxAscent || size * 0.8;
  const desc = m.actualBoundingBoxDescent || 0;
  const y = b.y + (b.h - (asc + desc)) / 2 + asc;
  let x = b.x;
  if (layer.align === 'center') x = b.x + b.w / 2;
  else if (layer.align === 'right') x = b.x + b.w;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(cal.x, cal.y);
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawPixelLayer(ctx, layer, w, h, consts, theme, state, pixelFonts) {
  const b = evalBox(layer.box, w, h, consts);
  const glyphs = (pixelFonts || {})[layer.pixelFont];
  const color = resolveFill(layer.fill, theme, state);
  const text = state[layer.text.slice(1)];
  if (!glyphs || color === null || color === undefined || text === undefined) return;
  let pixW = Math.floor(w / layer.scaleDivisor);
  let pixH = pixW;
  for (const o of layer.scaleOverride || []) {
    if (evalCond(o.when, theme, state)) {
      if (o.x !== undefined) pixW = evalDim(o.x, w, h, consts);
      if (o.y !== undefined) pixH = evalDim(o.y, w, h, consts);
    }
  }
  if (pixW < 1) pixW = 1;
  if (pixH < 1) pixH = 1;
  const rows = glyphs.rows;
  let totalW = 0;
  for (let i = 0; i < text.length; i++) {
    const g = glyphs.chars[text[i]];
    if (!g) continue;
    totalW += g[0].length * pixW;
    if (i < text.length - 1) totalW += pixW;
  }
  const startX = Math.floor((b.w - totalW) / 2);
  const startY = Math.floor((b.h - rows * pixH) / 2);
  ctx.fillStyle = color;
  let cx = startX;
  for (let i = 0; i < text.length; i++) {
    const g = glyphs.chars[text[i]];
    if (!g) continue;
    const gw = g[0].length;
    for (let row = 0; row < rows; row++) {
      const rd = g[row] || '';
      for (let col = 0; col < gw; col++) {
        if (rd[col] === '1') ctx.fillRect(b.x + cx + col * pixW, b.y + startY + row * pixH, pixW, pixH);
      }
    }
    cx += gw * pixW + pixW;
  }
}

function layerVisible(layer, theme, state) {
  return evalCond(layer.visibleWhen, theme, state);
}

function drawScreen(ctx, design, screenId, opts) {
  const sc = design.screens[screenId];
  const consts = design.constants || {};
  const theme = design.themes[opts.themeIdx || 0];
  const state = opts.state || {};
  const hidden = opts.hidden || {};
  ctx.imageSmoothingEnabled = false;
  fillRect(ctx, 0, 0, sc.w, sc.h, resolveColor('$background', theme));
  for (const layer of sc.layers) {
    if (hidden[layer.id] || !layerVisible(layer, theme, state)) continue;
    if (layer.kind === 'graphics') {
      drawGraphicsLayer(ctx, layer, sc.w, sc.h, consts, theme, state, opts.bitmaps);
    } else if (layer.kind === 'text') {
      // Unified text: pixelFont present → pixel glyphs, else vector font.
      if (layer.pixelFont) drawPixelLayer(ctx, layer, sc.w, sc.h, consts, theme, state, design.pixelFonts);
      else drawTextLayer(ctx, layer, sc.w, sc.h, consts, theme, state, opts.fonts);
    } else if (layer.kind === 'pixeltext') {
      drawPixelLayer(ctx, layer, sc.w, sc.h, consts, theme, state, design.pixelFonts);
    }
  }
}

const PEPreview = {
  GCOLORS, FONT_CALIBRATION, evalDim, evalTest, evalCond,
  resolveColor, resolveFill, evalBox, layerVisible,
  drawScreen, drawGraphicsLayer, drawTextLayer, drawPixelLayer, drawBarItem,
};
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PEPreview;
} else if (typeof window !== 'undefined') {
  window.PEPreview = PEPreview;
}
