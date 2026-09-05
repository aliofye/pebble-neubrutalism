'use strict';

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const SCHEMA_PATH = path.join(__dirname, 'schema', 'design.schema.json');

function loadSchema() {
  return JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
}

function newAjv() {
  return new Ajv({ allErrors: true, strict: false });
}

function isExprString(v) {
  return typeof v === 'string';
}

function checkExpr(expr, at, errors, consts) {
  const known = consts || new Set();
  if (typeof expr === 'number') {
    if (!Number.isInteger(expr)) {
      errors.push({ path: at, message: 'dimension must be an integer, got ' + expr });
    }
    return;
  }
  if (typeof expr !== 'string' || expr.trim() === '') {
    errors.push({ path: at, message: 'dimension must be an integer or expression string' });
    return;
  }
  const src = expr.trim();
  if (!/^[0-9wh\s+\-*/()a-z_]+$/.test(src)) {
    errors.push({ path: at, message: 'expression uses illegal characters: ' + JSON.stringify(expr) });
    return;
  }
  const tokens = src.match(/[0-9]+|[a-z][a-z0-9_]*|[\+\-\*\/()]/g) || [];
  if (tokens.join('').replace(/\s/g, '') !== src.replace(/\s/g, '')) {
    errors.push({ path: at, message: 'expression has invalid tokens: ' + JSON.stringify(expr) });
    return;
  }
  let depth = 0;
  let prev = 'op';
  for (const t of tokens) {
    if (t === '(') {
      if (prev === 'num' || prev === 'var') {
        errors.push({ path: at, message: 'missing operator before ( in ' + JSON.stringify(expr) });
        return;
      }
      depth++;
      prev = 'op';
    } else if (t === ')') {
      depth--;
      if (depth < 0 || prev === 'op') {
        errors.push({ path: at, message: 'mismatched parenthesis in ' + JSON.stringify(expr) });
        return;
      }
      prev = 'num';
    } else if (/^[+\-*/]$/.test(t)) {
      if (prev === 'op' && t !== '-') {
        errors.push({ path: at, message: 'misplaced operator in ' + JSON.stringify(expr) });
        return;
      }
      prev = 'op';
    } else if (/^\d+$/.test(t)) {
      if (prev === 'num' || prev === 'var') {
        errors.push({ path: at, message: 'missing operator in ' + JSON.stringify(expr) });
        return;
      }
      prev = 'num';
    } else {
      if (t !== 'w' && t !== 'h' && !known.has(t)) {
        errors.push({ path: at, message: 'unknown name ' + JSON.stringify(t) + ' in ' + JSON.stringify(expr) });
        return;
      }
      if (prev === 'num' || prev === 'var') {
        errors.push({ path: at, message: 'missing operator in ' + JSON.stringify(expr) });
        return;
      }
      prev = 'var';
    }
  }
  if (depth !== 0 || prev === 'op') {
    errors.push({ path: at, message: 'malformed expression: ' + JSON.stringify(expr) });
  }
}

function walkFill(fill, at, errors, checkColor, onTest) {
  if (typeof fill === 'string') {
    checkColor(fill, at, errors);
    return;
  }
  if (fill && typeof fill === 'object') {
    for (let i = 0; i < (fill.cases || []).length; i++) {
      const c = fill.cases[i];
      walkCondition(c.when, at + '.cases[' + i + '].when', errors);
      if (onTest) onTest(c.when, at + '.cases[' + i + '].when');
      walkFill(c.fill, at + '.cases[' + i + '].fill', errors, checkColor, onTest);
    }
    if (typeof fill.default === 'string') {
      checkColor(fill.default, at + '.default', errors);
    }
    return;
  }
  errors.push({ path: at, message: 'fill must be a color string or {cases,default}' });
}

function walkCondition(cond, at, errors) {
  if (!cond) return;
  const tests = Array.isArray(cond) ? cond : (cond.any || [cond]);
  if (!Array.isArray(tests)) {
    errors.push({ path: at, message: 'condition must be a test, a list of tests, or {any:[...]}' });
    return;
  }
  tests.forEach((t, i) => {
    const p = at + '[' + i + ']';
    if (!t || typeof t !== 'object' || typeof t.var !== 'string') {
      errors.push({ path: p, message: 'test needs {var, op, value}' });
      return;
    }
    if (!['eq', 'lt', 'lte', 'gt', 'gte', 'in'].includes(t.op)) {
      errors.push({ path: p, message: 'unknown op ' + JSON.stringify(t.op) });
    }
    if ((t.op === 'lt' || t.op === 'lte' || t.op === 'gt' || t.op === 'gte') &&
        typeof t.value !== 'number') {
      errors.push({ path: p, message: 'op ' + t.op + ' needs a numeric value' });
    }
    if (t.op === 'in' && !Array.isArray(t.value)) {
      errors.push({ path: p, message: 'op in needs an array value' });
    }
  });
}

function validateDesign(doc) {
  const errors = [];
  for (const k of Object.keys((doc && doc.constants) || {})) {
    if (k === 'w' || k === 'h') {
      errors.push({ path: 'constants.' + k, message: 'reserved name, cannot redefine ' + k });
    }
  }
  const ajv = newAjv();
  const valid = ajv.validate(loadSchema(), doc);
  if (!valid) {
    for (const e of ajv.errors || []) {
      errors.push({ path: e.instancePath || '(root)', message: e.message });
    }
    return errors;
  }

  const stateByName = {};
  for (const s of doc.state || []) stateByName[s.name] = s.type;
  const fontIds = new Set((doc.fonts || []).map(f => f.id));
  const bitmapIds = new Set((doc.bitmaps || []).map(b => b.id));
  const pixelFontIds = new Set(Object.keys(doc.pixelFonts || {}));
  const usedTokens = new Set();
  const usedFlags = new Set();

  const checkColor = (str, at, errs) => {
    if (typeof str !== 'string') {
      errs.push({ path: at, message: 'color must be a string' });
      return;
    }
    if (str.startsWith('$')) {
      const name = str.slice(1);
      if (!/^[a-z][a-z0-9_]*$/.test(name)) {
        errs.push({ path: at, message: 'bad token reference ' + JSON.stringify(str) });
      } else {
        usedTokens.add(name);
      }
      return;
    }
    if (!/^GColor[A-Z][A-Za-z0-9]*$/.test(str)) {
      errs.push({ path: at, message: 'color must be a GColor literal or $token, got ' + JSON.stringify(str) });
    }
  };

  const checkVarRef = (str, at, errs, wantType) => {
    if (typeof str !== 'string' || !str.startsWith('$')) {
      errs.push({ path: at, message: 'expected $state_var reference, got ' + JSON.stringify(str) });
      return;
    }
    const name = str.slice(1);
    if (!(name in stateByName)) {
      errs.push({ path: at, message: 'unknown state var ' + JSON.stringify(str) });
      return;
    }
    if (wantType && stateByName[name] !== wantType) {
      errs.push({ path: at, message: '$' + name + ' is ' + stateByName[name] + ', expected ' + wantType });
    }
  };

  const checkTestVars = (cond, at, errs) => {
    if (!cond) return;
    const tests = Array.isArray(cond) ? cond : (cond.any || [cond]);
    (Array.isArray(tests) ? tests : []).forEach((t, i) => {
      if (!t || typeof t.var !== 'string') return;
      const p = at + '[' + i + ']';
      if (t.var.startsWith('theme.')) {
        const flag = t.var.slice('theme.'.length);
        if (!/^[a-z][a-z0-9_]*$/.test(flag)) {
          errs.push({ path: p, message: 'bad theme flag reference ' + JSON.stringify(t.var) });
        } else {
          usedFlags.add(flag);
        }
        return;
      }
      if (!(t.var in stateByName)) {
        errs.push({ path: p, message: 'unknown state var ' + JSON.stringify(t.var) });
        return;
      }
      const ty = stateByName[t.var];
      if (['lt', 'lte', 'gt', 'gte'].includes(t.op) && ty !== 'int') {
        errs.push({ path: p, message: t.var + ' is ' + ty + ', numeric test needs int' });
      }
      if (t.op === 'in' && ty !== 'int' && ty !== 'string') {
        errs.push({ path: p, message: t.var + ' has unsupported type for in' });
      }
    });
  };

  const consts = new Set(Object.keys(doc.constants || {}));
  const checkBox = (box, at, errs) => {
    for (const k of ['x', 'y', 'w', 'h']) checkExpr(box[k], at + '.' + k, errs, consts);
  };

  const checkPrimitive = (item, at, errs) => {
    const onTest = (cond, p) => checkTestVars(cond, p, errs);
    if (item.visibleWhen) {
      walkCondition(item.visibleWhen, at + '.visibleWhen', errs);
      checkTestVars(item.visibleWhen, at + '.visibleWhen', errs);
    }
    if (item.kind === 'rect') {
      checkBox(item.box, at + '.box', errs);
      walkFill(item.fill, at + '.fill', errs, checkColor, onTest);
    } else if (item.kind === 'polygon') {
      item.points.forEach((pt, i) => {
        checkExpr(pt[0], at + '.points[' + i + '][0]', errs, consts);
        checkExpr(pt[1], at + '.points[' + i + '][1]', errs, consts);
      });
      walkFill(item.fill, at + '.fill', errs, checkColor, onTest);
      if (item.outline) {
        checkExpr(item.outline.stroke, at + '.outline.stroke', errs, consts);
      }
    } else if (item.kind === 'meterbar') {
      checkBox(item.box, at + '.box', errs);
      checkExpr(item.stroke, at + '.stroke', errs, consts);
      checkExpr(item.shadow.dx, at + '.shadow.dx', errs, consts);
      checkExpr(item.shadow.dy, at + '.shadow.dy', errs, consts);
      walkFill(item.frame, at + '.frame', errs, checkColor, onTest);
      walkFill(item.core, at + '.core', errs, checkColor, onTest);
      walkFill(item.fill, at + '.fill', errs, checkColor, onTest);
      checkVarRef(item.value, at + '.value', errs, 'int');
    } else if (item.kind === 'bitmap') {
      if (!bitmapIds.has(item.id)) {
        errs.push({ path: at + '.id', message: 'unknown bitmap ' + JSON.stringify(item.id) });
      }
      checkExpr(item.center[0], at + '.center[0]', errs, consts);
      checkExpr(item.center[1], at + '.center[1]', errs, consts);
    }
  };

  for (const [screenId, screen] of Object.entries(doc.screens)) {
    const seen = new Set();
    screen.layers.forEach((layer, li) => {
      const at = 'screens.' + screenId + '.layers[' + li + ']';
      const onTest = (cond, p) => checkTestVars(cond, p, errors);
      if (seen.has(layer.id)) {
        errors.push({ path: at + '.id', message: 'duplicate layer id ' + JSON.stringify(layer.id) });
      }
      seen.add(layer.id);
      if (layer.visibleWhen) {
        walkCondition(layer.visibleWhen, at + '.visibleWhen', errors);
        checkTestVars(layer.visibleWhen, at + '.visibleWhen', errors);
      }
      if (layer.kind === 'graphics') {
        (layer.items || []).forEach((item, ii) => checkPrimitive(item, at + '.items[' + ii + ']', errors));
      } else if (layer.kind === 'text') {
        checkBox(layer.box, at + '.box', errors);
        if (!fontIds.has(layer.font)) {
          errors.push({ path: at + '.font', message: 'unknown font ' + JSON.stringify(layer.font) });
        }
        walkFill(layer.fill, at + '.fill', errors, checkColor, onTest);
        checkVarRef(layer.text, at + '.text', errors, 'string');
      } else if (layer.kind === 'pixeltext') {
        checkBox(layer.box, at + '.box', errors);
        if (!pixelFontIds.has(layer.pixelFont)) {
          errors.push({ path: at + '.pixelFont', message: 'unknown pixelFont ' + JSON.stringify(layer.pixelFont) });
        }
        walkFill(layer.fill, at + '.fill', errors, checkColor, onTest);
        checkVarRef(layer.text, at + '.text', errors, 'string');
        for (let i = 0; i < (layer.scaleOverride || []).length; i++) {
          const o = layer.scaleOverride[i];
          const p = at + '.scaleOverride[' + i + ']';
          walkCondition(o.when, p + '.when', errors);
          checkTestVars(o.when, p + '.when', errors);
          if (o.x !== undefined) checkExpr(o.x, p + '.x', errors, consts);
          if (o.y !== undefined) checkExpr(o.y, p + '.y', errors, consts);
        }
      }
    });
  }

  for (const [id, pf] of Object.entries(doc.pixelFonts || {})) {
    const widths = new Set();
    for (const [ch, rows] of Object.entries(pf.chars)) {
      const at = 'pixelFonts.' + id + '.chars[' + JSON.stringify(ch) + ']';
      if (rows.length !== pf.rows) {
        errors.push({ path: at, message: 'expected ' + pf.rows + ' rows, got ' + rows.length });
      }
      for (const r of rows) widths.add(ch + ':' + r.length);
    }
    const byChar = {};
    for (const [ch, rows] of Object.entries(pf.chars)) {
      const ws = new Set(rows.map(r => r.length));
      if (ws.size > 1) {
        errors.push({
          path: 'pixelFonts.' + id + '.chars[' + JSON.stringify(ch) + ']',
          message: 'ragged glyph rows'
        });
      }
      byChar[ch] = true;
    }
    void byChar;
    void widths;
  }

  for (const theme of doc.themes) {
    for (const tok of usedTokens) {
      if (!(tok in (theme.tokens || {}))) {
        errors.push({ path: 'themes[' + theme.name + ']', message: 'missing token $' + tok });
      }
    }
    for (const flag of usedFlags) {
      if (!(flag in (theme.flags || {}))) {
        errors.push({ path: 'themes[' + theme.name + ']', message: 'missing flag ' + flag });
      }
    }
  }

  return errors;
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node validate.js <design.json>');
    process.exit(2);
  }
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(file + ': invalid JSON: ' + e.message);
    process.exit(1);
  }
  const errors = validateDesign(doc);
  if (errors.length === 0) {
    console.log(file + ': valid');
    return;
  }
  for (const e of errors) {
    console.log(file + ': ' + e.path + ': ' + e.message);
  }
  process.exit(1);
}

module.exports = { validateDesign, loadSchema };

if (require.main === module) {
  main();
}
