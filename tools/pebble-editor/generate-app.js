'use strict';

// Full-app codegen: design.json -> a complete buildable Pebble watchface
// scaffold (C core + widgets, Clay page, package.json, resources).
// Usage: node generate-app.js <design.json> --out-dir <dir> [--widgets-dir <dir>]
//
// The face owns zero hand-written code: visuals come from generate.js,
// logic comes from widget modules + the generated core below, settings UI
// from assembled Clay config. See docs/widget-guide.md.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { validateDesign } = require('./validate');
const { Emitter } = require('./generate');

const CORE_MSG_KEYS = ['SETTINGS_REQUEST', 'COLOR_THEME'];
const CORE_PERSIST = { COLOR_THEME: 2 };

function parseArgs(argv) {
  const args = { file: null, outDir: null, widgetsDir: null };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--out-dir') args.outDir = rest[++i];
    else if (rest[i] === '--widgets-dir') args.widgetsDir = rest[++i];
    else if (!args.file) args.file = rest[i];
    else throw new Error('unexpected argument ' + rest[i]);
  }
  if (!args.file || !args.outDir) {
    throw new Error('usage: node generate-app.js <design.json> --out-dir <dir> [--widgets-dir <dir>]');
  }
  if (!args.widgetsDir) args.widgetsDir = path.join(__dirname, 'widgets');
  return args;
}

function loadManifests(widgetsDir, names) {
  const out = {};
  for (const name of names || []) {
    out[name] = JSON.parse(fs.readFileSync(path.join(widgetsDir, name, 'widget.json'), 'utf8'));
  }
  return out;
}

function loadResourcesMap(designFile) {
  const sibling = designFile.replace(/\.design\.json$/, '.resources.json');
  if (fs.existsSync(sibling)) {
    return JSON.parse(fs.readFileSync(sibling, 'utf8'));
  }
  return {};
}

function resolveSourceFile(p, designFile) {
  const cands = [p, path.join(process.cwd(), p.replace(/^\//, '')),
    path.join(path.dirname(designFile), p)];
  for (const c of cands) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  throw new Error('resource file not found: ' + p);
}

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function kebab(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function messageKeys(doc, manifests) {
  const keys = [...CORE_MSG_KEYS];
  for (const w of doc.widgets || []) {
    const m = manifests[w];
    for (const k of (m.inbox || []).concat(m.sync || [])) {
      if (!keys.includes(k)) keys.push(k);
    }
  }
  for (const se of doc.settings || []) {
    if (!keys.includes(se.key)) keys.push(se.key);
  }
  return keys;
}

function fontSizeOf(resource) {
  const m = /_(\d+)$/.exec(resource);
  if (!m) throw new Error('font resource needs a trailing _NN size: ' + resource);
  return parseInt(m[1], 10);
}

function emitPackageJson(doc, manifests, resMap, outDir) {
  const media = [];
  for (const f of doc.fonts || []) {
    media.push({
      type: 'font', name: f.resource,
      file: 'resources/' + resMap[f.resource].replace(/^\//, '').replace(/^resources\//, ''),
      size: fontSizeOf(f.resource),
    });
  }
  for (const b of doc.bitmaps || []) {
    media.push({
      type: 'png', name: b.resource,
      file: 'resources/' + resMap[b.resource].replace(/^\//, '').replace(/^resources\//, ''),
    });
  }
  const pkg = {
    name: kebab(doc.app.displayName),
    author: doc.app.author || 'pebble-editor',
    version: doc.app.version || '1.0.0',
    private: true,
    dependencies: { '@rebble/clay': '^1.0.10' },
    pebble: {
      displayName: doc.app.displayName,
      uuid: doc.app.uuid,
      sdkVersion: '3',
      enableMultiJS: true,
      targetPlatforms: doc.app.targets || ['aplite', 'basalt', 'diorite', 'emery', 'flint'],
      watchapp: { watchface: true },
      messageKeys: messageKeys(doc, manifests),
      resources: { media },
    },
  };
  fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  return media;
}

function emitClayConfig(doc, manifests) {
  const items = [];
  items.push({ type: 'heading', defaultValue: doc.app.displayName });
  items.push({ type: 'heading', defaultValue: 'Display' });
  items.push({
    type: 'select', messageKey: 'COLOR_THEME', label: 'Color Theme',
    defaultValue: 0,
    options: doc.themes.map((t, i) => ({ label: t.name, value: i })),
  });
  for (const w of doc.widgets || []) {
    const m = manifests[w];
    if (!(m.clay || []).length) continue;
    items.push({ type: 'heading', defaultValue: m.name.charAt(0).toUpperCase() + m.name.slice(1) });
    for (const c of m.clay) items.push(JSON.parse(JSON.stringify(c)));
  }
  if ((doc.settings || []).length) {
    items.push({ type: 'heading', defaultValue: 'Face Options' });
    for (const se of doc.settings) {
      const frag = JSON.parse(JSON.stringify(se.clay));
      frag.messageKey = se.key;
      items.push(frag);
    }
  }
  return [{ type: 'section', items }];
}

function coerceTable(doc, manifests) {
  const table = [
    { key: 'COLOR_THEME', kind: 'int' },
  ];
  const widgetKind = (frag) => {
    if (frag.type === 'toggle') return 'bool';
    return 'int';
  };
  for (const w of doc.widgets || []) {
    const m = manifests[w];
    for (const c of m.clay || []) {
      if (!table.some(t => t.key === c.messageKey)) {
        table.push({ key: c.messageKey, kind: widgetKind(c) });
      }
    }
  }
  for (const se of doc.settings || []) {
    if (!table.some(t => t.key === se.key)) {
      table.push({ key: se.key, kind: se.kind });
    }
  }
  return table;
}

function emitPkjsIndex(doc, manifests) {
  const hooks = (doc.widgets || []).filter(w => manifests[w].js).map(w => './' + manifests[w].js.replace(/\.js$/, ''));
  const lines = [];
  lines.push("var Clay = require('@rebble/clay');");
  lines.push("var clayConfig = require('./config.json');");
  lines.push("var customClay = require('./custom-clay');");
  lines.push("var messageKeys = require('message_keys');");
  lines.push("var clay = new Clay(clayConfig, customClay, { autoHandleEvents: false });");
  lines.push('');
  lines.push('var COERCE = ' + JSON.stringify(Object.fromEntries(coerceTable(doc, manifests).map(t => [t.key, t.kind]))) + ';');
  lines.push('');
  lines.push('function parseBool(value) {');
  lines.push('  return value === true || value === \'true\' || value === 1 || value === \'1\' || value === \'on\';');
  lines.push('}');
  lines.push('');
  lines.push('function coerce(key, value) {');
  lines.push('  if (COERCE[key] === \'bool\') return parseBool(value) ? 1 : 0;');
  lines.push('  var n = Number(value);');
  lines.push('  return isFinite(n) ? Math.round(n) : 0;');
  lines.push('}');
  lines.push('');
  for (const h of hooks) {
    lines.push('var hook_' + hooks.indexOf(h) + ' = require(\'' + h + '\');');
  }
  lines.push('var HOOKS = [' + hooks.map((_, i) => 'hook_' + i).join(', ') + '];');
  lines.push('');
  lines.push('function callHooks(name, a, b) {');
  lines.push('  for (const h of HOOKS) { if (h && typeof h[name] === \'function\') { h[name](a, b); } }');
  lines.push('}');
  lines.push('');
  lines.push('function requestWatchSettings() {');
  lines.push('  var request = {};');
  lines.push('  request[messageKeys.SETTINGS_REQUEST] = 1;');
  lines.push('  Pebble.sendAppMessage(request, function() {}, function(error) {');
  lines.push('    console.log(\'Could not request watch settings: \' + JSON.stringify(error));');
  lines.push('  });');
  lines.push('}');
  lines.push('');
  lines.push('var configurationPending = false;');
  lines.push('var configurationTimeout = null;');
  lines.push('');
  lines.push('function openConfiguration() {');
  lines.push('  configurationPending = false;');
  lines.push('  if (configurationTimeout !== null) { clearTimeout(configurationTimeout); configurationTimeout = null; }');
  lines.push('  Pebble.openURL(clay.generateUrl());');
  lines.push('}');
  lines.push('');
  lines.push('Pebble.addEventListener(\'ready\', function() {');
  lines.push('  requestWatchSettings();');
  lines.push('  callHooks(\'onReady\', { messageKeys: messageKeys, Pebble: Pebble, clay: clay });');
  lines.push('});');
  lines.push('');
  lines.push('Pebble.addEventListener(\'appmessage\', function(event) {');
  lines.push('  var payload = event.payload || {};');
  lines.push('  var seen = false;');
  lines.push('  for (const key of Object.keys(COERCE)) {');
  lines.push('    var v = payload[key] !== undefined ? payload[key] : payload[messageKeys[key]];');
  lines.push('    if (v !== undefined) { seen = true; clay.setSettings(key, COERCE[key] === \'bool\' ? !!coerce(key, v) : coerce(key, v)); }');
  lines.push('  }');
  lines.push('  if (!seen) return;');
  lines.push('  callHooks(\'onWatchSettings\', payload, { messageKeys: messageKeys, Pebble: Pebble, clay: clay });');
  lines.push('  if (configurationPending) openConfiguration();');
  lines.push('});');
  lines.push('');
  lines.push('Pebble.addEventListener(\'showConfiguration\', function() {');
  lines.push('  configurationPending = true;');
  lines.push('  requestWatchSettings();');
  lines.push('  configurationTimeout = setTimeout(openConfiguration, 1000);');
  lines.push('});');
  lines.push('');
  lines.push('Pebble.addEventListener(\'webviewclosed\', function(event) {');
  lines.push('  if (!event || !event.response) return;');
  lines.push('  var settings = clay.getSettings(event.response);');
  lines.push('  var out = {};');
  lines.push('  for (const key of Object.keys(COERCE)) {');
  lines.push('    if (settings[key] !== undefined) out[messageKeys[key]] = coerce(key, settings[key]);');
  lines.push('    else if (settings[messageKeys[key]] !== undefined) out[messageKeys[key]] = coerce(key, settings[messageKeys[key]]);');
  lines.push('  }');
  lines.push('  callHooks(\'onPhoneSettings\', out, { messageKeys: messageKeys, Pebble: Pebble, clay: clay });');
  lines.push('  Pebble.sendAppMessage(out, function() {');
  lines.push('    console.log(\'Settings synchronized with watch\');');
  lines.push('  }, function(error) {');
  lines.push('    console.log(\'Could not synchronize settings: \' + JSON.stringify(error));');
  lines.push('  });');
  lines.push('});');
  lines.push('');
  return lines.join('\n');
}

function cIdent(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

// Role slots widgets dirty (see widgets/pe_layers.h). Resolved by BINDING,
// not by name: a slot maps to the first layer containing a binding provided
// by a widget that requires the slot. Legacy faces keep working because
// their bindings live in same-named layers, which still match first.
const ROLE_SLOTS = ['background', 'bars', 'date', 'weather', 'time'];
// Handle type per slot: text slots read TextLayer handles, the rest read
// plain Layer handles (graphics AND pixeltext layers both create Layers).
const ROLE_KIND = { background: 'layer', bars: 'layer', time: 'layer', date: 'text', weather: 'text' };
const layerHandleKind = (kind) => kind === 'text' ? 'text' : 'layer';

function resolveRoleLayers(doc, manifests) {
  const firstId = Object.keys(doc.screens)[0];
  const layers = doc.screens[firstId].layers;
  const byId = {};
  for (const l of layers) byId[l.id] = l;
  const resolved = {};
  for (const slot of ROLE_SLOTS) {
    if (byId[slot] && layerHandleKind(byId[slot].kind) === ROLE_KIND[slot]) {
      resolved[slot] = slot;
      continue;
    }
    let found = null;
    for (const w of doc.widgets || []) {
      const m = manifests[w];
      if (!m || !((m.requires || {}).layers || []).includes(slot)) continue;
      const provided = new Set((m.provides || []).map(p => '$' + p.name));
      if (!provided.size) continue;
      const hit = layers.find(l =>
        layerHandleKind(l.kind) === ROLE_KIND[slot] && (
          (l.text && provided.has(l.text)) ||
          ((l.items || []).some(it => it.value && provided.has(it.value)))));
      if (hit) { found = hit.id; break; }
    }
    resolved[slot] = found;
  }
  return resolved;
}

function collectInventory(doc) {
  const roleLayers = {};
  for (const sid of Object.keys(doc.screens)) {
    for (const l of doc.screens[sid].layers) roleLayers[l.id] = l.kind;
  }
  const fontIds = [];
  const bitmapIds = [];
  for (const sid of Object.keys(doc.screens)) {
    for (const l of doc.screens[sid].layers) {
      if (l.kind === 'text' && !fontIds.includes(l.font)) fontIds.push(l.font);
      for (const item of l.items || []) {
        if (item.kind === 'bitmap' && !bitmapIds.includes(item.id)) bitmapIds.push(item.id);
      }
    }
  }
  return { roleLayers, fontIds, bitmapIds };
}

function emitMainC(doc, manifests, em) {
  const p = em.p, camel = em.camel, up = em.up;
  const L = [];
  const screenIds = Object.keys(doc.screens);
  const { roleLayers } = collectInventory(doc);
  const isText = (id) => roleLayers[id] === 'text';
  const dispatch = (sid) => 's_screen_w == ' + doc.screens[sid].w;

  L.push('/* DO NOT EDIT - generated full app core for ' + doc.name + ' by tools/pebble-editor/generate-app.js */');
  L.push('#include <pebble.h>');
  L.push('#include <string.h>');
  L.push('#include <time.h>');
  L.push('');
  L.push('#include "generated_design.h"');
  L.push('#include "pe_layers.h"');
  for (const w of doc.widgets || []) {
    L.push('#include "widgets/' + w + '/' + w + '.h"');
  }
  L.push('');
  L.push('enum {');
  L.push('  PERSIST_KEY_COLOR_THEME = 2,');
  for (const se of doc.settings || []) {
    L.push('  PERSIST_KEY_' + se.key + ' = ' + se.persist + ',');
  }
  L.push('};');
  L.push('');
  L.push('static Window *s_window;');
  for (const [id, kind] of Object.entries(roleLayers)) {
    L.push(kind === 'text'
      ? 'static TextLayer *s_tlayer_' + id + ';'
      : 'static Layer *s_layer_' + id + ';');
  }
  const { fontIds, bitmapIds } = collectInventory(doc);
  for (const f of fontIds) L.push('static GFont s_font_' + f + ';');
  for (const b of bitmapIds) L.push('static GBitmap *s_bitmap_' + b + ';');
  L.push('static uint8_t s_color_theme;');
  L.push('static bool s_bt_connected = true;');
  for (const se of doc.settings || []) {
    const dflt = se.kind === 'bool' ? (se.default ? 'true' : 'false') : se.default;
    L.push((se.kind === 'bool' ? 'static bool s_' : 'static int s_') + se.var + ' = ' + dflt + ';');
  }
  L.push('static int16_t s_screen_w;');
  L.push('static int16_t s_screen_h;');
  L.push('');

  L.push('static const ' + camel + 'Theme *prv_theme(void) {');
  L.push('  return &' + up + '_THEMES[s_color_theme < ' + up + '_THEME_COUNT ? s_color_theme : 0];');
  L.push('}');
  L.push('');

  const providers = {};
  for (const w of doc.widgets || []) {
    for (const pv of ((manifests[w] || {}).provides || [])) providers[pv.name] = pv.getter + '()';
  }
  L.push('static void prv_fill_state(' + camel + 'State *st) {');
  L.push('  st->bt = s_bt_connected;');
  for (const s of doc.state) {
    if (['bt'].includes(s.name)) continue;
    if (providers[s.name]) {
      L.push('  st->' + s.name + ' = ' + providers[s.name] + ';');
    } else {
      L.push('  st->' + s.name + ' = s_' + s.name + ';');
    }
  }
  L.push('}');
  L.push('');

  for (const sid of screenIds) {
    for (const layer of doc.screens[sid].layers) {
      if (layer.kind !== 'graphics' && layer.kind !== 'pixeltext') continue;
      const fn = p + '_' + sid + '_' + layer.id + '_draw';
      const bmaps = [];
      for (const item of layer.items || []) {
        if (item.kind === 'bitmap' && !bmaps.includes(item.id)) bmaps.push(item.id);
      }
      L.push('static void prv_' + sid + '_' + layer.id + '_update(Layer *layer, GContext *ctx) {');
      L.push('  GRect bounds = layer_get_bounds(layer);');
      L.push('  const ' + camel + 'Theme *theme = prv_theme();');
      L.push('  ' + camel + 'State st;');
      L.push('  prv_fill_state(&st);');
      const callArgs = ['ctx', 'bounds.size.w', 'bounds.size.h', 'theme', '&st']
        .concat(bmaps.map(b => 's_bitmap_' + b)).join(', ');
      L.push('  ' + fn + '(' + callArgs + ');');
      L.push('}');
      L.push('');
    }
  }

  L.push('static void prv_apply_visibility(void) {');
  L.push('  const ' + camel + 'Theme *theme = prv_theme();');
  L.push('  ' + camel + 'State st;');
  L.push('  prv_fill_state(&st);');
  screenIds.forEach((sid, i) => {
    const parts = [];
    for (const layer of doc.screens[sid].layers) {
      if (!layer.visibleWhen) continue;
      const vis = p + '_' + sid + '_' + layer.id + '_visible';
      const handle = isText(layer.id)
        ? 'text_layer_get_layer(s_tlayer_' + layer.id + ')'
        : 's_layer_' + layer.id;
      parts.push('    if (' + handle + ') layer_set_hidden(' + handle + ', !' + vis + '(theme, &st));');
    }
    if (parts.length) {
      L.push('  ' + (i === 0 ? 'if' : 'else if') + ' (' + dispatch(sid) + ') {');
      L.push(...parts);
      L.push('  }');
    }
  });
  L.push('}');
  L.push('');

  L.push('static void prv_dirty_all(void) {');
  for (const id of Object.keys(roleLayers)) {
    L.push(isText(id)
      ? '  if (s_tlayer_' + id + ') layer_mark_dirty(text_layer_get_layer(s_tlayer_' + id + '));'
      : '  if (s_layer_' + id + ') layer_mark_dirty(s_layer_' + id + ');');
  }
  L.push('}');
  L.push('');

  L.push('static void prv_apply_text_colors(void) {');
  L.push('  const ' + camel + 'Theme *theme = prv_theme();');
  L.push('  ' + camel + 'State st;');
  L.push('  prv_fill_state(&st);');
  {
    const done = new Set();
    for (const sid of screenIds) {
      for (const layer of doc.screens[sid].layers) {
        if (layer.kind !== 'text' || done.has(layer.id)) continue;
        done.add(layer.id);
        const colorFn = p + '_' + sid + '_' + layer.id + '_color';
        L.push('  if (s_tlayer_' + layer.id + ') text_layer_set_text_color(s_tlayer_' + layer.id +
          ', ' + colorFn + '(theme, &st));');
      }
    }
  }
  L.push('}');
  L.push('');

  L.push('static void prv_tick_handler(struct tm *tick_time, TimeUnits units_changed) {');
  for (const w of doc.widgets || []) {
    L.push('  ' + w + '_widget_tick(tick_time, units_changed);');
  }
  L.push('  prv_apply_visibility();');
  L.push('}');
  L.push('');

  L.push('static void prv_bt_handler(bool connected) {');
  L.push('  s_bt_connected = connected;');
  L.push('  prv_apply_visibility();');
  L.push('  if (s_layer_background) layer_mark_dirty(s_layer_background);');
  L.push('}');
  L.push('');

  L.push('static void prv_sync_settings(void) {');
  L.push('  DictionaryIterator *iter;');
  L.push('  if (app_message_outbox_begin(&iter) != APP_MSG_OK) return;');
  L.push('  dict_write_uint8(iter, MESSAGE_KEY_COLOR_THEME, s_color_theme);');
  for (const se of doc.settings || []) {
    if (se.kind === 'bool') {
      L.push('  dict_write_uint8(iter, MESSAGE_KEY_' + se.key + ', s_' + se.var + ' ? 1 : 0);');
    } else {
      L.push('  dict_write_int32(iter, MESSAGE_KEY_' + se.key + ', s_' + se.var + ');');
    }
  }
  for (const w of doc.widgets || []) {
    L.push('  ' + w + '_widget_sync(iter);');
  }
  L.push('  app_message_outbox_send();');
  L.push('}');
  L.push('');

  L.push('static void prv_inbox_received(DictionaryIterator *iter, void *context) {');
  L.push('  (void)context;');
  L.push('  Tuple *theme_tuple = dict_find(iter, MESSAGE_KEY_COLOR_THEME);');
  L.push('  if (theme_tuple) {');
  L.push('    const uint8_t theme = (uint8_t)theme_tuple->value->int32;');
  L.push('    if (theme < ' + up + '_THEME_COUNT) {');
  L.push('      s_color_theme = theme;');
  L.push('      persist_write_int(PERSIST_KEY_COLOR_THEME, s_color_theme);');
  L.push('      window_set_background_color(s_window, prv_theme()->background);');
  L.push('      prv_apply_text_colors();');
  L.push('      prv_dirty_all();');
  L.push('    }');
  L.push('  }');
  for (const se of doc.settings || []) {
    L.push('  {');
    L.push('    Tuple *t = dict_find(iter, MESSAGE_KEY_' + se.key + ');');
    L.push('    if (t) {');
    if (se.kind === 'bool') {
      L.push('      const bool v = t->value->int32 != 0;');
      L.push('      if (v != s_' + se.var + ') {');
      L.push('        s_' + se.var + ' = v;');
      L.push('        persist_write_bool(PERSIST_KEY_' + se.key + ', v);');
      L.push('        prv_apply_visibility();');
      L.push('        prv_dirty_all();');
      L.push('      }');
    } else {
      const lo = se.min !== undefined ? ' && v >= ' + se.min : '';
      const hi = se.max !== undefined ? ' && v <= ' + se.max : '';
      L.push('      const int v = (int)t->value->int32;');
      L.push('      if (v != s_' + se.var + lo + hi + ') {');
      L.push('        s_' + se.var + ' = v;');
      L.push('        persist_write_int(PERSIST_KEY_' + se.key + ', v);');
      L.push('        prv_apply_visibility();');
      L.push('        prv_dirty_all();');
      L.push('      }');
    }
    L.push('    }');
    L.push('  }');
  }
  for (const w of doc.widgets || []) {
    L.push('  ' + w + '_widget_inbox(iter);');
  }
  L.push('  prv_apply_visibility();');
  L.push('  if (dict_find(iter, MESSAGE_KEY_SETTINGS_REQUEST)) {');
  L.push('    prv_sync_settings();');
  L.push('  }');
  L.push('}');
  L.push('');

  const hasPolygons = (layer) => layer.kind === 'graphics' &&
    (layer.items || []).some(it => it.kind === 'polygon');
  const emitLayersFor = (sid) => {
    for (const layer of doc.screens[sid].layers) {
      if (layer.kind === 'graphics' || layer.kind === 'pixeltext') {
        L.push('    s_layer_' + layer.id + ' = layer_create(bounds);');
        L.push('    layer_set_update_proc(s_layer_' + layer.id + ', prv_' + sid + '_' + layer.id + '_update);');
        L.push('    layer_add_child(window_layer, s_layer_' + layer.id + ');');
        if (hasPolygons(layer)) {
          L.push('    ' + p + '_' + sid + '_' + layer.id + '_polygons_create();');
        }
      } else {
        const frameFn = p + '_' + sid + '_' + layer.id + '_frame';
        const alignFn = p + '_' + sid + '_' + layer.id + '_align';
        const colorFn = p + '_' + sid + '_' + layer.id + '_color';
        L.push('    s_tlayer_' + layer.id + ' = text_layer_create(' + frameFn + '(bounds.size.w, bounds.size.h));');
        L.push('    text_layer_set_background_color(s_tlayer_' + layer.id + ', GColorClear);');
        L.push('    text_layer_set_text_color(s_tlayer_' + layer.id + ', GColorBlack);');
        L.push('    text_layer_set_text_alignment(s_tlayer_' + layer.id + ', ' + alignFn + '());');
        L.push('    text_layer_set_font(s_tlayer_' + layer.id + ', s_font_' + layer.font + ');');
        L.push('    layer_add_child(window_layer, text_layer_get_layer(s_tlayer_' + layer.id + '));');
      }
    }
  };

  L.push('static void prv_window_load(Window *window) {');
  L.push('  Layer *window_layer = window_get_root_layer(window);');
  L.push('  GRect bounds = layer_get_bounds(window_layer);');
  L.push('  s_screen_w = bounds.size.w;');
  L.push('  s_screen_h = bounds.size.h;');
  for (const f of fontIds) {
    const res = (doc.fonts || []).find(x => x.id === f).resource;
    L.push('  s_font_' + f + ' = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_' + res + '));');
  }
  for (const b of bitmapIds) {
    const res = (doc.bitmaps || []).find(x => x.id === b).resource;
    L.push('  s_bitmap_' + b + ' = gbitmap_create_with_resource(RESOURCE_ID_' + res + ');');
  }
  screenIds.forEach((sid, i) => {
    L.push('  ' + (i === 0 ? 'if' : 'else if') + ' (' + dispatch(sid) + ') {');
    emitLayersFor(sid);
    L.push('  }');
  });
  L.push('  else {');
  emitLayersFor(screenIds[0]);
  L.push('  }');
  L.push('  {');
  L.push('    PeFaceLayers face;');
  L.push('    face.background = NULL; face.bars = NULL; face.date = NULL; face.weather = NULL; face.time = NULL;');
  const roleMap = resolveRoleLayers(doc, manifests);
  const invKinds = collectInventory(doc).roleLayers;
  for (const slot of ROLE_SLOTS) {
    const id = roleMap[slot];
    if (!id) continue;
    // Text slots read TextLayer handles; graphics slots read Layer handles.
    // A legacy layer whose id matches a slot of the other kind keeps the
    // old behavior (skipped here only when the kinds mismatch AND the id
    // differs — exact-id legacy faces always match kinds).
    if (layerHandleKind(invKinds[id]) !== ROLE_KIND[slot]) continue;
    L.push(ROLE_KIND[slot] === 'text'
      ? '    face.' + slot + ' = s_tlayer_' + id + ';'
      : '    face.' + slot + ' = s_layer_' + id + ';');
  }
  for (const w of doc.widgets || []) {
    L.push('    ' + w + '_widget_init(&face);');
  }
  L.push('  }');
  L.push('  prv_apply_text_colors();');
  L.push('  prv_apply_visibility();');
  L.push('}');
  L.push('');

  return L.join('\n');
}

function emitInitDeinit(doc, manifests, em) {
  const p = em.p;
  const L = [];
  const { roleLayers: rl2, fontIds: fi2, bitmapIds: bi2 } = collectInventory(doc);
  L.push('static void prv_window_unload(Window *window) {');
  L.push('  (void)window;');
  for (const w of doc.widgets || []) {
    L.push('  ' + w + '_widget_deinit();');
  }
  L.push('  bluetooth_connection_service_unsubscribe();');
  L.push('  tick_timer_service_unsubscribe();');
  L.push('  app_message_deregister_callbacks();');
  for (const [id, kind] of Object.entries(rl2)) {
    L.push(kind === 'text'
      ? '  text_layer_destroy(s_tlayer_' + id + '); s_tlayer_' + id + ' = NULL;'
      : '  layer_destroy(s_layer_' + id + '); s_layer_' + id + ' = NULL;');
  }
  for (const sid of Object.keys(doc.screens)) {
    for (const layer of doc.screens[sid].layers) {
      if (layer.kind === 'graphics' && (layer.items || []).some(it => it.kind === 'polygon')) {
        L.push('  ' + p + '_' + sid + '_' + layer.id + '_polygons_destroy();');
      }
    }
  }
  for (const f of fi2) {
    L.push('  if (s_font_' + f + ') { fonts_unload_custom_font(s_font_' + f + '); s_font_' + f + ' = NULL; }');
  }
  for (const b of bi2) {
    L.push('  if (s_bitmap_' + b + ') { gbitmap_destroy(s_bitmap_' + b + '); s_bitmap_' + b + ' = NULL; }');
  }
  L.push('  window_destroy(s_window);');
  L.push('  s_window = NULL;');
  L.push('}');
  L.push('');
  L.push('static void prv_deinit(void) {');
  L.push('  bluetooth_connection_service_unsubscribe();');
  L.push('  tick_timer_service_unsubscribe();');
  L.push('  app_message_deregister_callbacks();');
  L.push('  window_destroy(s_window);');
  L.push('}');
  L.push('');
  L.push('static void prv_init(void) {');
  L.push('  s_color_theme = persist_exists(PERSIST_KEY_COLOR_THEME)');
  L.push('      ? (uint8_t)persist_read_int(PERSIST_KEY_COLOR_THEME)');
  L.push('      : 0;');
  L.push('  if (s_color_theme >= ' + em.up + '_THEME_COUNT) s_color_theme = 0;');
  for (const se of doc.settings || []) {
    if (se.kind === 'bool') {
      L.push('  s_' + se.var + ' = persist_exists(PERSIST_KEY_' + se.key + ')');
      L.push('      ? persist_read_bool(PERSIST_KEY_' + se.key + ')');
      L.push('      : ' + (se.default ? 'true' : 'false') + ';');
    } else {
      L.push('  s_' + se.var + ' = persist_exists(PERSIST_KEY_' + se.key + ')');
      L.push('      ? (int)persist_read_int(PERSIST_KEY_' + se.key + ')');
      L.push('      : ' + se.default + ';');
      if (se.min !== undefined || se.max !== undefined) {
        const conds = [];
        if (se.min !== undefined) conds.push('s_' + se.var + ' < ' + se.min);
        if (se.max !== undefined) conds.push('s_' + se.var + ' > ' + se.max);
        L.push('  if (' + conds.join(' || ') + ') s_' + se.var + ' = ' + se.default + ';');
      }
    }
  }
  L.push('  s_bt_connected = bluetooth_connection_service_peek();');
  L.push('  s_window = window_create();');
  L.push('  window_set_background_color(s_window, prv_theme()->background);');
  L.push('  window_set_window_handlers(s_window, (WindowHandlers) {');
  L.push('    .load = prv_window_load,');
  L.push('    .unload = prv_window_unload,');
  L.push('  });');
  L.push('  window_stack_push(s_window, true);');
  L.push('  bluetooth_connection_service_subscribe(prv_bt_handler);');
  L.push('  tick_timer_service_subscribe(MINUTE_UNIT, prv_tick_handler);');
  L.push('  app_message_register_inbox_received(prv_inbox_received);');
  L.push('  app_message_open(64, 64);');
  L.push('}');
  L.push('');
  L.push('int main(void) {');
  L.push('  prv_init();');
  L.push('  app_event_loop();');
  L.push('  prv_deinit();');
  L.push('}');
  L.push('');
  return L.join('\n');
}

module.exports = { messageKeys, coerceTable, emitClayConfig, emitPkjsIndex, emitMainC, collectInventory, resolveRoleLayers, ROLE_SLOTS };

function main() {
  const args = parseArgs(process.argv);
  const { validateDesign: vd } = require('./validate');
  const { Emitter } = require('./generate');
  const doc = JSON.parse(fs.readFileSync(args.file, 'utf8'));
  const widgetsDir = args.widgetsDir;
  const errors = vd(doc, widgetsDir ? { widgetsDir } : undefined);
  if (errors.length) {
    for (const e of errors) console.error(args.file + ': ' + e.path + ': ' + e.message);
    process.exit(1);
  }
  if (!doc.app) {
    console.error(args.file + ': full-app codegen needs the app block');
    process.exit(1);
  }
  const manifests = loadManifests(widgetsDir, doc.widgets);
  const resMap = loadResourcesMap(args.file);
  const TOOLS = __dirname;
  const out = args.outDir;
  const mkdir = (d) => fs.mkdirSync(d, { recursive: true });
  mkdir(out);
  mkdir(path.join(out, 'src', 'c'));
  mkdir(path.join(out, 'src', 'pkjs'));

  const pkg = emitPackageJsonFull(doc, manifests, resMap);
  fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify(pkg.json, null, 2) + '\n');
  fs.copyFileSync(path.join(TOOLS, 'templates', 'wscript'), path.join(out, 'wscript'));
  fs.copyFileSync(path.join(TOOLS, 'templates', 'gitignore'), path.join(out, '.gitignore'));
  fs.copyFileSync(path.join(TOOLS, 'templates', 'custom-clay.js'), path.join(out, 'src', 'pkjs', 'custom-clay.js'));

  const em = new Emitter(doc, args.file);
  const visual = em.generate();
  fs.writeFileSync(path.join(out, 'src', 'c', 'generated_design.c'), visual.source);
  fs.writeFileSync(path.join(out, 'src', 'c', 'generated_design.h'), visual.header);
  fs.writeFileSync(path.join(out, 'src', 'c', 'main.c'), emitMainC(doc, manifests, em) + emitInitDeinit(doc, manifests, em));
  copyFile(path.join(TOOLS, 'widgets', 'pe_layers.h'), path.join(out, 'src', 'c', 'pe_layers.h'));
  copyFile(path.join(TOOLS, 'widgets', 'pe_layers.h'), path.join(out, 'src', 'c', 'widgets', 'pe_layers.h'));
  // Shared helper modules live beside the widgets that use them: the SDK
  // build does not put src/c on the include path for subdirectories, so a
  // widget's #include "time_util.h" resolves to a header copied into its own
  // dir (host tests resolve the same include via -I templates). The single
  // .c compiles via the src/c/**/*.c glob; the header declares only.
  let needTimeUtil = false;
  for (const w of doc.widgets || []) {
    mkdir(path.join(out, 'src', 'c', 'widgets', w));
    const src = fs.readFileSync(path.join(widgetsDir, w, w + '.c'), 'utf8');
    copyFile(path.join(widgetsDir, w, w + '.c'), path.join(out, 'src', 'c', 'widgets', w, w + '.c'));
    copyFile(path.join(widgetsDir, w, w + '.h'), path.join(out, 'src', 'c', 'widgets', w, w + '.h'));
    if (src.includes('#include "time_util.h"')) {
      needTimeUtil = true;
      copyFile(path.join(TOOLS, 'templates', 'time_util.h'),
               path.join(out, 'src', 'c', 'widgets', w, 'time_util.h'));
    }
    const m = manifests[w];
    if (m.js) {
      copyFile(path.join(widgetsDir, w, m.js), path.join(out, 'src', 'pkjs', m.js));
    }
  }
  if (needTimeUtil) {
    copyFile(path.join(TOOLS, 'templates', 'time_util.c'),
             path.join(out, 'src', 'c', 'widgets', 'time_util.c'));
    copyFile(path.join(TOOLS, 'templates', 'time_util.h'),
             path.join(out, 'src', 'c', 'widgets', 'time_util.h'));
  }
  fs.writeFileSync(path.join(out, 'src', 'pkjs', 'index.js'), emitPkjsIndex(doc, manifests));
  fs.writeFileSync(path.join(out, 'src', 'pkjs', 'config.json'), JSON.stringify(emitClayConfig(doc, manifests), null, 2) + '\n');

  for (const dest of pkg.mediaFiles) {
    const src = resolveSourceFile(dest.src, args.file);
    copyFile(src, path.join(out, dest.dst));
  }
  console.log('wrote scaffold to ' + out);
}

function emitPackageJsonFull(doc, manifests, resMap) {
  const media = [];
  const mediaFiles = [];
  const destFor = (resource) => {
    const mapped = resMap[resource];
    if (!mapped) throw new Error('no resources.json entry for ' + resource);
    // package.json resource paths are relative to resources/ itself
    const rel = mapped.replace(/^\//, '').replace(/^resources\//, '');
    return { src: mapped, file: rel, dst: 'resources/' + rel };
  };
  for (const f of doc.fonts || []) {
    const d = destFor(f.resource);
    media.push({ type: 'font', name: f.resource, file: d.file, size: fontSizeOf(f.resource) });
    mediaFiles.push(d);
  }
  for (const b of doc.bitmaps || []) {
    const d = destFor(b.resource);
    media.push({ type: 'png', name: b.resource, file: d.file });
    mediaFiles.push(d);
  }
  const json = {
    name: kebab(doc.app.displayName),
    author: doc.app.author || 'pebble-editor',
    version: doc.app.version || '1.0.0',
    private: true,
    dependencies: { '@rebble/clay': '^1.0.10' },
    pebble: {
      displayName: doc.app.displayName,
      uuid: doc.app.uuid,
      sdkVersion: '3',
      enableMultiJS: true,
      targetPlatforms: doc.app.targets || ['aplite', 'basalt', 'diorite', 'emery', 'flint'],
      watchapp: { watchface: true },
      messageKeys: messageKeys(doc, manifests),
      resources: { media },
    },
  };
  return { json, mediaFiles };
}

if (require.main === module) {
  main();
}
