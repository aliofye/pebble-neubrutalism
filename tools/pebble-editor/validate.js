'use strict';

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const { PLATFORMS } = require('./app/editor-model');

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

// State provided by generated core for every face (no widget needed).
const CORE_STATE = { bt: 'bool' };
const CORE_MSG_KEYS = ['SETTINGS_REQUEST', 'COLOR_THEME'];
const CORE_PERSIST = { 2: 'core:COLOR_THEME' };

function defaultWidgetsDir() {
  return path.join(__dirname, 'widgets');
}

function loadManifests(widgetsDir, names, errors) {
  const manifests = {};
  for (const name of names || []) {
    const file = path.join(widgetsDir, name, 'widget.json');
    try {
      const m = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!m || m.name !== name) {
        errors.push({ path: 'widgets', message: name + ': manifest name mismatch in ' + file });
        continue;
      }
      manifests[name] = m;
    } catch (e) {
      errors.push({ path: 'widgets', message: name + ': cannot load manifest: ' + e.message });
    }
  }
  return manifests;
}

function validateDesign(doc, opts) {
  const errors = [];
  for (const k of Object.keys((doc && doc.constants) || {})) {
    if (k === 'w' || k === 'h') {
      errors.push({ path: 'constants.' + k, message: 'reserved name, cannot redefine ' + k });
    }
  }
  const widgetsDir = (opts && opts.widgetsDir) || defaultWidgetsDir();
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
    } else if (item.kind === 'bar') {
      checkBox(item.box, at + '.box', errs);
      walkFill(item.track, at + '.track', errs, checkColor, onTest);
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

  const seenWidths = {};
  for (const [screenId, screen] of Object.entries(doc.screens)) {
    if (seenWidths[screen.w]) {
      errors.push({ path: 'screens.' + screenId, message: 'duplicate screen width ' + screen.w + ' (runtime dispatch needs unique widths)' });
    } else {
      seenWidths[screen.w] = screenId;
    }
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
        if (layer.pixelFont) {
          if (!pixelFontIds.has(layer.pixelFont)) {
            errors.push({ path: at + '.pixelFont', message: 'unknown pixelFont ' + JSON.stringify(layer.pixelFont) });
          }
          if (layer.font && !fontIds.has(layer.font)) {
            errors.push({ path: at + '.font', message: 'unknown font ' + JSON.stringify(layer.font) });
          }
        } else if (!fontIds.has(layer.font)) {
          errors.push({ path: at + '.font', message: 'unknown font ' + JSON.stringify(layer.font) });
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

  // Widget + settings coverage: every declared state var needs a provider
  // (generated core, a listed widget, or a face setting), every widget needs
  // its required layers, and persist/message-key namespaces must not collide.
  const manifests = loadManifests(widgetsDir, doc.widgets, errors);
  const provided = {};
  for (const [k, v] of Object.entries(CORE_STATE)) provided[k] = 'core:' + k;
  for (const [wname, m] of Object.entries(manifests)) {
    for (const p of m.provides || []) {
      if (provided[p.name] && provided[p.name] !== 'core:' + p.name) {
        errors.push({ path: 'widgets', message: p.name + ' provided by both ' + provided[p.name] + ' and ' + wname });
      } else if (!provided[p.name]) {
        provided[p.name] = wname;
      }
      if (!['int', 'bool', 'string'].includes(p.type)) {
        errors.push({ path: 'widgets', message: wname + ' declares bad type for ' + p.name });
      }
      if (typeof p.getter !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(p.getter)) {
        errors.push({ path: 'widgets', message: wname + ' needs a getter fn for ' + p.name });
      }
    }
  }
  const settingsVars = {};
  for (let i = 0; i < (doc.settings || []).length; i++) {
    const se = doc.settings[i];
    const at = 'settings[' + i + ']';
    if (provided[se.var]) {
      errors.push({ path: at, message: se.var + ' already provided by ' + provided[se.var] });
    } else {
      provided[se.var] = 'setting:' + se.key;
    }
    settingsVars[se.var] = se.kind;
    if (se.kind === 'int' && typeof se.default !== 'number') {
      errors.push({ path: at, message: 'int setting needs a numeric default' });
    }
    if (se.kind === 'int' && typeof se.default === 'number') {
      if (se.min !== undefined && se.default < se.min) {
        errors.push({ path: at, message: 'default below min' });
      }
      if (se.max !== undefined && se.default > se.max) {
        errors.push({ path: at, message: 'default above max' });
      }
      if (se.min !== undefined && se.max !== undefined && se.min > se.max) {
        errors.push({ path: at, message: 'min above max' });
      }
    }
    if (se.kind === 'bool' && typeof se.default !== 'boolean') {
      errors.push({ path: at, message: 'bool setting needs a boolean default' });
    }
    if (se.clay && se.clay.messageKey !== se.key) {
      errors.push({ path: at, message: 'clay.messageKey must equal key ' + se.key });
    }
  }
  for (const s of doc.state || []) {
    if (!(s.name in provided)) {
      errors.push({ path: 'state', message: '$' + s.name + ' has no provider (core, widget, or setting)' });
      continue;
    }
    const want = settingsVars[s.name];
    if (want && want !== s.type) {
      errors.push({ path: 'state', message: '$' + s.name + ' is ' + s.type + ' but setting provides ' + want });
    }
    if (CORE_STATE[s.name] && CORE_STATE[s.name] !== s.type) {
      errors.push({ path: 'state', message: '$' + s.name + ' is ' + s.type + ' but core provides ' + CORE_STATE[s.name] });
    }
    for (const [wname, m] of Object.entries(manifests)) {
      for (const p of m.provides || []) {
        if (p.name === s.name && p.type !== s.type) {
          errors.push({ path: 'state', message: '$' + s.name + ' is ' + s.type + ' but ' + wname + ' provides ' + p.type });
        }
      }
    }
  }

  // Widget role layers: the C widgets dirty hardcoded PeFaceLayers slots
  // (bars/time/date/weather/background — see widgets/*/widget.json and
  // generate-app.js face wiring). A listed widget only needs its role
  // layer when one of its provided vars is actually referenced by the
  // design; unused widgets must have been pruned by the editor. Custom
  // layer ids are always allowed — bindings outside a widget's role layer
  // still validate here but may not dirty correctly on-device (the editor
  // badges these).
  function docRefsVar(doc, name) {
    const ref = '$' + name;
    for (const screen of Object.values(doc.screens || {})) {
      for (const layer of screen.layers || []) {
        if (layer.text === ref) return true;
        const condHas = (c) => {
          if (!c) return false;
          const tests = Array.isArray(c) ? c : (c.any || [c]);
          return (Array.isArray(tests) ? tests : []).some(t => t && t.var === name);
        };
        if (condHas(layer.visibleWhen)) return true;
        const fillHas = (f) => {
          if (!f || typeof f === 'string') return false;
          return (f.cases || []).some(c => condHas(c.when) || fillHas(c.fill));
        };
        if (fillHas(layer.fill)) return true;
        for (const o of layer.scaleOverride || []) if (condHas(o.when)) return true;
        for (const item of layer.items || []) {
          if (item.value === ref) return true;
          if (condHas(item.visibleWhen)) return true;
          if (fillHas(item.fill) || fillHas(item.frame) || fillHas(item.core)) return true;
        }
      }
    }
    return false;
  }

  for (const [wname, m] of Object.entries(manifests)) {
    const used = (m.provides || []).some(p => docRefsVar(doc, p.name));
    if (!used) continue;
    // Binding-based roles: some layer must CONTAIN the binding. The legacy
    // literal role ids (bars/time/...) still satisfy this when the binding
    // lives in them, but any layer id works — generate-app wires the
    // containing layers into the widget's dirty slots.
    const provided = new Set((m.provides || []).map(p => '$' + p.name));
    for (const [screenId, screen] of Object.entries(doc.screens)) {
      let contained = false;
      for (const layer of screen.layers || []) {
        if (layer.text && provided.has(layer.text)) { contained = true; break; }
        for (const item of layer.items || []) {
          if (item.value && provided.has(item.value)) { contained = true; break; }
        }
        if (contained) break;
      }
      if (!contained) {
        const names = (m.provides || []).map(p => '$' + p.name).join(', ');
        errors.push({ path: 'widgets', message: wname + ' is used (' + names + ') but no layer in screen ' + screenId + ' contains its binding' });
      }
    }
  }

  // Groups: unique ids per screen, members resolve, no double membership.
  for (const [screenId, screen] of Object.entries(doc.screens)) {
    const seenG = new Set();
    const memberOf = new Map();
    const layerIds = new Set((screen.layers || []).map(l => l.id));
    (screen.groups || []).forEach((g, gi) => {
      const at = 'screens.' + screenId + '.groups[' + gi + ']';
      if (seenG.has(g.id)) {
        errors.push({ path: at + '.id', message: 'duplicate group id ' + JSON.stringify(g.id) });
      }
      seenG.add(g.id);
      (g.members || []).forEach((mb, mi) => {
        const mat = at + '.members[' + mi + ']';
        const layer = (screen.layers || []).find(l => l.id === mb.layer);
        if (!layer) {
          errors.push({ path: mat, message: 'unknown layer ' + JSON.stringify(mb.layer) });
          return;
        }
        if (mb.item !== undefined) {
          if (layer.kind !== 'graphics' || !layer.items || mb.item < 0 || mb.item >= layer.items.length) {
            errors.push({ path: mat, message: 'bad item index ' + mb.item + ' in layer ' + JSON.stringify(mb.layer) });
            return;
          }
        }
        const key = mb.layer + ':' + (mb.item !== undefined ? mb.item : '*');
        if (memberOf.has(key)) {
          errors.push({ path: mat, message: 'member already in group ' + JSON.stringify(memberOf.get(key)) });
        } else {
          memberOf.set(key, g.id);
        }
        void layerIds;
      });
    });
  }

  // Build targets: every listed platform must be known and have a
  // dims-matching screen, otherwise the face cannot render there.
  for (const target of ((doc.app || {}).targets || [])) {
    const plat = PLATFORMS[target];
    if (!plat) {
      errors.push({ path: 'app.targets', message: 'unknown platform ' + target });
      continue;
    }
    const ok = Object.values(doc.screens || {}).some(s => s.w === plat.w && s.h === plat.h);
    if (!ok) {
      errors.push({ path: 'app.targets', message: 'no ' + plat.w + '×' + plat.h + ' screen for ' + target });
    }
  }

  const persistOwners = {};
  for (const [num, owner] of Object.entries(CORE_PERSIST)) persistOwners[num] = owner;
  const claimPersist = (num, owner, at) => {
    if (persistOwners[num]) {
      errors.push({ path: at, message: 'persist key ' + num + ' already owned by ' + persistOwners[num] });
    } else {
      persistOwners[num] = owner;
    }
  };
  for (const [wname, m] of Object.entries(manifests)) {
    for (const [kname, num] of Object.entries(m.persist || {})) claimPersist(num, wname + ':' + kname, 'widgets');
  }
  for (let i = 0; i < (doc.settings || []).length; i++) {
    claimPersist(doc.settings[i].persist, 'setting:' + doc.settings[i].key, 'settings[' + i + ']');
  }

  const knownKeys = new Set(CORE_MSG_KEYS);
  for (const m of Object.values(manifests)) {
    for (const k of (m.inbox || []).concat(m.sync || [])) knownKeys.add(k);
  }
  for (const se of doc.settings || []) knownKeys.add(se.key);
  const keyOwners = {};
  const claimKey = (k, owner, at) => {
    if (keyOwners[k] && keyOwners[k] !== owner) {
      errors.push({ path: at, message: 'message key ' + k + ' declared by both ' + keyOwners[k] + ' and ' + owner });
    } else {
      keyOwners[k] = owner;
    }
  };
  CORE_MSG_KEYS.forEach(k => claimKey(k, 'core', 'widgets'));
  for (const [wname, m] of Object.entries(manifests)) {
    for (const k of (m.inbox || []).concat(m.sync || [])) claimKey(k, wname, 'widgets');
    for (const c of m.clay || []) {
      if (!c.messageKey || typeof c.type !== 'string') {
        errors.push({ path: 'widgets', message: wname + ' has a malformed clay fragment' });
      } else if (!knownKeys.has(c.messageKey)) {
        errors.push({ path: 'widgets', message: wname + ' clay references unknown key ' + c.messageKey });
      }
    }
  }
  for (let i = 0; i < (doc.settings || []).length; i++) {
    claimKey(doc.settings[i].key, 'settings[' + i + ']', 'settings[' + i + ']');
  }

  return errors;
}

function main() {
  const argv = process.argv.slice(2);
  const file = argv.find(a => !a.startsWith('--'));
  const wdirFlag = argv.findIndex(a => a === '--widgets-dir');
  const widgetsDir = wdirFlag >= 0 ? argv[wdirFlag + 1] : undefined;
  if (!file) {
    console.error('usage: node validate.js <design.json> [--widgets-dir <dir>]');
    process.exit(2);
  }
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(file + ': invalid JSON: ' + e.message);
    process.exit(1);
  }
  const errors = validateDesign(doc, widgetsDir ? { widgetsDir } : undefined);
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
