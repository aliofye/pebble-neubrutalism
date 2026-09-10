# Custom Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 7th `Custom` theme with 6 user-configurable flat colors and a live mini-preview in the settings page.

**Architecture:** Watch holds 6 persisted HEX ints, rebuilds a runtime `ColorTheme` + 3 extra `GColor`s via `GColorFromHEX`, and takes Custom-only draw branches for date bubble, weather bubble, and time glyphs. Phone passes 6 ints through Clay `color` pickers; `custom-clay.js` shows/hides the section and repaints a canvas mock.

**Tech Stack:** Pebble C SDK3 + Rebble Clay (`color` type, custom function via `.toString()` injection), PebbleKitJS, Jest, `pebble build`.

**Spec:** `docs/superpowers/specs/2026-09-10-custom-theme-design.md`

## Global Constraints

- Custom exposes exactly 6 slots: `CUSTOM_DATE`, `CUSTOM_WEATHER`, `CUSTOM_TIME`, `CUSTOM_BODY`, `CUSTOM_STEP`, `CUSTOM_BATTERY` — nothing else becomes configurable.
- Custom-at-defaults is pixel-identical to Neubrutalism with a sunny bubble: date `0xFFFFFF`, weather `0xFFAA00`, time `0x000000`, body `0xFF5500`, step `0xAA55FF`, battery `0xAA55FF`.
- Custom battery is flat (`battery_status = false`); Custom weather is flat (`weather_condition_colors = false`).
- C converts phone HEX ints with `GColorFromHEX`, never a raw cast to `GColor8`.
- `app_message_open(64, 64)` becomes `app_message_open(256, 256)` — required, not optional.
- `custom-clay.js` is injected via `.toString()` — no `require`, no closures over module scope; everything lives in the function body.
- Chrome stays fixed in Custom: background `GColorPastelYellow`, outlines `GColorBlack`, battery frame `GColorPastelYellow`, step overflow dark reuses Neubrutalism Indigo.
- Weather text stays `GColorBlack` in v1 (documented limitation).

---

## File map

- Modify: `package.json` — append 6 messageKeys.
- Modify: `src/c/neubrutalism.c` — theme enum, persist, rebuild, inbox/send, draw branches, buffer bump.
- Modify: `src/pkjs/config.json` — `Custom` select option, 6 `color` items, 1 preview `text` item.
- Modify: `src/pkjs/index.js` — validate/coerce + sync 6 keys.
- Modify: `src/pkjs/custom-clay.js` — show/hide + canvas repaint.
- Modify: `test/index.test.js` — passthrough/validation cases for 6 keys.
- Modify: `test/custom-clay.test.js` — AFTER_BUILD/show-hide/repaint cases (existing "registers nothing" test is replaced).
- No new files. C custom logic is Pebble-SDK-bound (`GColor`) so it is verified by `pebble build` + screenshots, not `scripts/test-c.sh`.

---

### Task 1: Watch-side Custom theme core (C)

**Files:**
- Modify: `src/c/neubrutalism.c`
- Modify: `package.json` (messageKeys only; full key list shown in Step 3)

**Interfaces:**
- Consumes: `MESSAGE_KEY_CUSTOM_DATE … MESSAGE_KEY_CUSTOM_BATTERY` (auto-generated `message_keys.auto.h` from `package.json`, `int32` HEX).
- Produces: `prv_is_custom()` → `bool`; runtime `s_custom_theme` (`ColorTheme`) + `s_custom_date/s_custom_weather/s_custom_time` (`GColor`); persist keys 10–15. Later tasks (JS) rely on these exact key names.

**Steps:**

- [ ] **Step 1: Append the 6 messageKeys**

In `package.json`, extend `pebble.messageKeys` (order matters — append only):

```json
"messageKeys": [
  "TIME_FORMAT",
  "SETTINGS_REQUEST",
  "COLOR_THEME",
  "DAILY_STEP_GOAL",
  "BARS_MODE",
  "WEATHER_ENABLED",
  "WEATHER_TEMP",
  "WEATHER_UNITS",
  "WEATHER_CODE",
  "CUSTOM_DATE",
  "CUSTOM_WEATHER",
  "CUSTOM_TIME",
  "CUSTOM_BODY",
  "CUSTOM_STEP",
  "CUSTOM_BATTERY"
]
```

- [ ] **Step 2: Build once to confirm codegen still passes (red state for C)**

Run: `pebble build 2>&1 | tail -5`
Expected: BUILD succeeds (new keys generate, nothing consumes them yet).

- [ ] **Step 3: Implement the Custom core in `src/c/neubrutalism.c`**

3a. Theme enum — add `THEME_CUSTOM = 6`, bump count:

```c
enum {
  THEME_NEUBRUTALISM = 0,
  THEME_GAME_BOY_GREEN,
  THEME_OCEAN_BLUE,
  THEME_AMBER_LCD,
  THEME_MONOCHROME,
  THEME_PURPLE_PIXEL,
  THEME_CUSTOM,
  THEME_COUNT,
};
```

3b. Persist keys + defaults — extend both enums:

```c
enum {
  PERSIST_KEY_TIME_FORMAT = 1,
  PERSIST_KEY_COLOR_THEME = 2,
  PERSIST_KEY_DAILY_STEP_GOAL = 4,
  PERSIST_KEY_WEATHER_UNITS = 5,
  PERSIST_KEY_WEATHER_TEMP = 6,
  PERSIST_KEY_WEATHER_ENABLED = 7,
  PERSIST_KEY_BARS_MODE = 8,
  PERSIST_KEY_WEATHER_CODE = 9,
  PERSIST_KEY_CUSTOM_DATE = 10,
  PERSIST_KEY_CUSTOM_WEATHER = 11,
  PERSIST_KEY_CUSTOM_TIME = 12,
  PERSIST_KEY_CUSTOM_BODY = 13,
  PERSIST_KEY_CUSTOM_STEP = 14,
  PERSIST_KEY_CUSTOM_BATTERY = 15,
};

enum {
  CUSTOM_DATE_DEFAULT = 0xFFFFFF,
  CUSTOM_WEATHER_DEFAULT = 0xFFAA00,
  CUSTOM_TIME_DEFAULT = 0x000000,
  CUSTOM_BODY_DEFAULT = 0xFF5500,
  CUSTOM_STEP_DEFAULT = 0xAA55FF,
  CUSTOM_BATTERY_DEFAULT = 0xAA55FF,
};
```

3c. Runtime state — after `static uint8_t s_color_theme;` add:

```c
static int32_t s_custom_hex[6];
static ColorTheme s_custom_theme;
static GColor s_custom_date;
static GColor s_custom_weather;
static GColor s_custom_time;

static bool prv_is_custom(void) {
  return s_color_theme == THEME_CUSTOM;
}

static int32_t prv_clamp_hex(int32_t v) {
  if (v < 0x000000 || v > 0xFFFFFF) {
    return 0x000000;
  }
  return v;
}

static void prv_rebuild_custom_theme(void) {
  s_custom_theme.background = GColorPastelYellow;
  s_custom_theme.body = GColorFromHEX((uint32_t)s_custom_hex[3]);
  s_custom_theme.accent = GColorFromHEX((uint32_t)s_custom_hex[0]);
  s_custom_theme.battery_frame = GColorPastelYellow;
  s_custom_theme.battery_bar = GColorFromHEX((uint32_t)s_custom_hex[5]);
  s_custom_theme.ink = GColorBlack;
  s_custom_theme.battery_status = false;
  s_custom_theme.battery_low = GColorBlack;
  s_custom_theme.battery_mid = GColorBlack;
  s_custom_theme.battery_high = GColorBlack;
  s_custom_theme.weather_condition_colors = false;
  s_custom_theme.step_bar = GColorFromHEX((uint32_t)s_custom_hex[4]);
  s_custom_theme.step_bar_dark = s_color_themes[THEME_NEUBRUTALISM].step_bar_dark;
  s_custom_date = GColorFromHEX((uint32_t)s_custom_hex[0]);
  s_custom_weather = GColorFromHEX((uint32_t)s_custom_hex[1]);
  s_custom_time = GColorFromHEX((uint32_t)s_custom_hex[2]);
}
```

Slot order in `s_custom_hex`: `[0]=DATE, [1]=WEATHER, [2]=TIME, [3]=BODY, [4]=STEP, [5]=BATTERY`.

3d. `prv_theme()` — return custom first so index 6 never hits the 6-entry table:

```c
static const ColorTheme *prv_theme(void) {
  if (prv_is_custom()) {
    return &s_custom_theme;
  }
  return &s_color_themes[s_color_theme < THEME_COUNT ? s_color_theme : THEME_NEUBRUTALISM];
}
```

3e. `prv_init()` — after the `s_color_theme` clamp block, load customs:

```c
  static const int32_t custom_defaults[6] = {
    CUSTOM_DATE_DEFAULT, CUSTOM_WEATHER_DEFAULT, CUSTOM_TIME_DEFAULT,
    CUSTOM_BODY_DEFAULT, CUSTOM_STEP_DEFAULT, CUSTOM_BATTERY_DEFAULT,
  };
  static const int custom_persist_keys[6] = {
    PERSIST_KEY_CUSTOM_DATE, PERSIST_KEY_CUSTOM_WEATHER, PERSIST_KEY_CUSTOM_TIME,
    PERSIST_KEY_CUSTOM_BODY, PERSIST_KEY_CUSTOM_STEP, PERSIST_KEY_CUSTOM_BATTERY,
  };
  for (int i = 0; i < 6; i++) {
    s_custom_hex[i] = persist_exists(custom_persist_keys[i])
        ? prv_clamp_hex(persist_read_int(custom_persist_keys[i]))
        : custom_defaults[i];
  }
  prv_rebuild_custom_theme();
```

3f. `prv_send_settings()` — append before `app_message_outbox_send()`:

```c
  dict_write_int32(iter, MESSAGE_KEY_CUSTOM_DATE, s_custom_hex[0]);
  dict_write_int32(iter, MESSAGE_KEY_CUSTOM_WEATHER, s_custom_hex[1]);
  dict_write_int32(iter, MESSAGE_KEY_CUSTOM_TIME, s_custom_hex[2]);
  dict_write_int32(iter, MESSAGE_KEY_CUSTOM_BODY, s_custom_hex[3]);
  dict_write_int32(iter, MESSAGE_KEY_CUSTOM_STEP, s_custom_hex[4]);
  dict_write_int32(iter, MESSAGE_KEY_CUSTOM_BATTERY, s_custom_hex[5]);
```

3g. `prv_inbox_received()` — after the theme block, handle the 6 keys with one table loop:

```c
  static const uint32_t custom_keys[6] = {
    MESSAGE_KEY_CUSTOM_DATE, MESSAGE_KEY_CUSTOM_WEATHER, MESSAGE_KEY_CUSTOM_TIME,
    MESSAGE_KEY_CUSTOM_BODY, MESSAGE_KEY_CUSTOM_STEP, MESSAGE_KEY_CUSTOM_BATTERY,
  };
  static const int custom_persist[6] = {
    PERSIST_KEY_CUSTOM_DATE, PERSIST_KEY_CUSTOM_WEATHER, PERSIST_KEY_CUSTOM_TIME,
    PERSIST_KEY_CUSTOM_BODY, PERSIST_KEY_CUSTOM_STEP, PERSIST_KEY_CUSTOM_BATTERY,
  };
  bool custom_changed = false;
  for (int i = 0; i < 6; i++) {
    Tuple *t = dict_find(iter, custom_keys[i]);
    if (t) {
      const int32_t v = prv_clamp_hex(t->value->int32);
      if (v != s_custom_hex[i]) {
        s_custom_hex[i] = v;
        persist_write_int(custom_persist[i], v);
        custom_changed = true;
      }
    }
  }
  if (custom_changed) {
    prv_rebuild_custom_theme();
    if (prv_is_custom()) {
      window_set_background_color(s_window, prv_theme()->background);
      text_layer_set_text_color(s_date_layer, s_custom_time);
      if (s_background_layer) {
        layer_mark_dirty(s_background_layer);
      }
      if (s_bars_layer) {
        layer_mark_dirty(s_bars_layer);
      }
      if (s_time_layer) {
        layer_mark_dirty(s_time_layer);
      }
    }
  }
```

3h. Draw branches (Custom-only, all other themes pixel-identical):
- Date bubble fill (`prv_background_update_proc`, both `w == 200` and `144` branches): `graphics_context_set_fill_color(ctx, GColorWhite)` → `graphics_context_set_fill_color(ctx, prv_is_custom() ? s_custom_date : GColorWhite)`.
- Weather bubble fill (both branches): `prv_weather_bubble_color(theme, s_weather_available)` → `(prv_is_custom() ? s_custom_weather : prv_weather_bubble_color(theme, s_weather_available))`.
- Time glyphs (`prv_time_update_proc`): `graphics_context_set_fill_color(ctx, theme->ink)` → `graphics_context_set_fill_color(ctx, prv_is_custom() ? s_custom_time : theme->ink)`.
- Date text: in the theme-change handler `text_layer_set_text_color(s_date_layer, prv_theme()->ink)` → `text_layer_set_text_color(s_date_layer, prv_is_custom() ? s_custom_time : prv_theme()->ink)`, and same in `prv_window_load` where the date layer is created.
- Body/step/battery need no branch: they flow through `s_custom_theme.body/step_bar/battery_bar`, and `prv_battery_color()` already returns flat `battery_bar` when `battery_status == false`.

3i. Buffer bump: `app_message_open(64, 64)` → `app_message_open(256, 256)`.

- [ ] **Step 4: Verify — build all platforms**

Run: `pebble build 2>&1 | tail -8`
Expected: success for aplite, basalt, diorite, emery (flint follows the same 144px path).

- [ ] **Step 5: Verify — Custom-at-defaults matches Neubrutalism**

Run: `pebble install --emulator basalt` (set theme Custom via test hook or temporarily default `s_color_theme`), then `pebble screenshot --scale 6 --no-open /tmp/custom.png`, view the screenshot.
Expected: orange body, white date bubble, black digits, lavender bars — identical to theme 0 with clear weather.

- [ ] **Step 6: Commit**

```bash
git add package.json src/c/neubrutalism.c
git commit -m "feat: custom theme core with 6 persisted colors"
```

---

### Task 2: Config surface — Custom option, 6 pickers, preview slot

**Files:**
- Modify: `src/pkjs/config.json`
- Test: ad-hoc node check (no Jest file for JSON; exact command in Step 2)

**Interfaces:**
- Consumes: the 6 `messageKey` names from Task 1.
- Produces: `COLOR_THEME` option value `6`; color items with `messageKey`s `CUSTOM_DATE/WATHER…` (exact), `group: "customColors"`; preview item `id: "custom-preview"`. Task 3/4 rely on these names.

- [ ] **Step 1: Edit `src/pkjs/config.json`**

Add `{ "label": "Custom", "value": 6 }` to the `COLOR_THEME` options, then insert a new section after the Time Display section and before Weather:

```json
{
  "type": "section",
  "items": [
    {
      "type": "heading",
      "defaultValue": "Custom Colors"
    },
    {
      "type": "text",
      "id": "custom-preview",
      "defaultValue": "<canvas id=\"custom-preview-canvas\" width=\"200\" height=\"60\" style=\"width:100%;image-rendering:pixelated;border:1px solid #888\"></canvas>"
    },
    {
      "type": "color",
      "messageKey": "CUSTOM_DATE",
      "label": "Date Bubble",
      "defaultValue": "FFFFFF",
      "description": "Fill of the date bubble.",
      "group": "customColors"
    },
    {
      "type": "color",
      "messageKey": "CUSTOM_WEATHER",
      "label": "Weather Bubble",
      "defaultValue": "FFAA00",
      "description": "Flat fill of the weather bubble.",
      "group": "customColors"
    },
    {
      "type": "color",
      "messageKey": "CUSTOM_TIME",
      "label": "Time Digits",
      "defaultValue": "000000",
      "description": "Color of the time digits and date text.",
      "group": "customColors"
    },
    {
      "type": "color",
      "messageKey": "CUSTOM_BODY",
      "label": "Time Background",
      "defaultValue": "FF5500",
      "description": "Background block behind the time.",
      "group": "customColors"
    },
    {
      "type": "color",
      "messageKey": "CUSTOM_STEP",
      "label": "Step Bar",
      "defaultValue": "AA55FF",
      "group": "customColors"
    },
    {
      "type": "color",
      "messageKey": "CUSTOM_BATTERY",
      "label": "Battery Bar",
      "defaultValue": "AA55FF",
      "description": "Flat fill, no low/mid/high stages in Custom.",
      "group": "customColors"
    }
  ]
}
```

Keep `sunlight` unset (Clay default `true`) and `layout` unset (auto per watch).

- [ ] **Step 2: Validate JSON + key names**

Run: `node -e "const c=require('./src/pkjs/config.json'); const items=c.flatMap(s=>s.items||[]); const colors=items.filter(i=>i.type==='color'); console.log('colors:', colors.map(i=>i.messageKey).join(',')); const theme=items.find(i=>i.messageKey==='COLOR_THEME'); console.log('hasCustom:', theme.options.some(o=>o.value===6)); if(colors.length!==6||!theme.options.some(o=>o.value===6)) process.exit(1);"`
Expected: `colors: CUSTOM_DATE,CUSTOM_WEATHER,CUSTOM_TIME,CUSTOM_BODY,CUSTOM_STEP,CUSTOM_BATTERY` and `hasCustom: true`.

- [ ] **Step 3: Commit**

```bash
git add src/pkjs/config.json
git commit -m "feat: custom colors section in config"
```

---

### Task 3: Phone JS passthrough + validation

**Files:**
- Modify: `src/pkjs/index.js`
- Test: `test/index.test.js`

**Interfaces:**
- Consumes: Clay settings for the 6 keys (ints, e.g. `16777215` for white); watch `appmessage` payload with the same keys.
- Produces: validated ints `0x000000–0xFFFFFF` sent via `Pebble.sendAppMessage`; `clay.setSettings()` sync on inbound. Task 4 reads the same settings via Clay items.

- [ ] **Step 1: Write the failing tests** (append to the `describe('index')` block in `test/index.test.js`)

```js
it('passes custom colors through as numbers', () => {
  fire('webviewclosed', {
    response: JSON.stringify({
      COLOR_THEME: '6',
      CUSTOM_DATE: '16777215',
      CUSTOM_WEATHER: '16711680',
      CUSTOM_TIME: '0',
      CUSTOM_BODY: '16733440',
      CUSTOM_STEP: '11184639',
      CUSTOM_BATTERY: '11184639',
    }),
  });
  expect(Pebble.sendAppMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      COLOR_THEME: 6,
      CUSTOM_DATE: 16777215,
      CUSTOM_WEATHER: 16711680,
      CUSTOM_TIME: 0,
      CUSTOM_BODY: 16733440,
      CUSTOM_STEP: 11184639,
      CUSTOM_BATTERY: 11184639,
    }),
    expect.any(Function),
    expect.any(Function)
  );
});

it('falls back to defaults for invalid custom colors', () => {
  fire('webviewclosed', {
    response: JSON.stringify({ CUSTOM_DATE: 'not-a-color', CUSTOM_BODY: '-5' }),
  });
  expect(Pebble.sendAppMessage).toHaveBeenCalledWith(
    expect.objectContaining({ CUSTOM_DATE: 0xFFFFFF, CUSTOM_BODY: 0xFF5500 }),
    expect.any(Function),
    expect.any(Function)
  );
});

it('syncs custom colors from watch appmessage into clay', () => {
  fire('appmessage', { payload: { CUSTOM_DATE: 16777215, CUSTOM_STEP: 11184639 } });
  expect(clayInstance.setSettings).toHaveBeenCalledWith('CUSTOM_DATE', 16777215);
  expect(clayInstance.setSettings).toHaveBeenCalledWith('CUSTOM_STEP', 11184639);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest test/index.test.js 2>&1 | tail -15`
Expected: 3 FAILs (`CUSTOM_DATE` never sent / never set).

- [ ] **Step 3: Implement in `src/pkjs/index.js`**

3a. Top of file, after the interval constants, add:

```js
var CUSTOM_DEFAULTS = {
  CUSTOM_DATE: 0xFFFFFF,
  CUSTOM_WEATHER: 0xFFAA00,
  CUSTOM_TIME: 0x000000,
  CUSTOM_BODY: 0xFF5500,
  CUSTOM_STEP: 0xAA55FF,
  CUSTOM_BATTERY: 0xAA55FF,
};

function coerceColor(value, fallback) {
  var n = Number(value);
  if (!isFinite(n)) {
    return fallback;
  }
  n = Math.round(n);
  if (n < 0x000000 || n > 0xFFFFFF) {
    return fallback;
  }
  return n;
}
```

3b. In the `appmessage` handler: extend the known-keys guard and sync. Change the guard condition to also require the 6 customs to be undefined before early-return, i.e. add:

```js
var customDate = event.payload.CUSTOM_DATE;
if (customDate === undefined) {
  customDate = event.payload[messageKeys.CUSTOM_DATE];
}
// repeat for CUSTOM_WEATHER, CUSTOM_TIME, CUSTOM_BODY, CUSTOM_STEP, CUSTOM_BATTERY
```

and include all six in the `if (... === undefined && ...)` early-return, then after the `WEATHER_UNITS` block add:

```js
var customs = {
  CUSTOM_DATE: customDate,
  CUSTOM_WEATHER: customWeather,
  CUSTOM_TIME: customTime,
  CUSTOM_BODY: customBody,
  CUSTOM_STEP: customStep,
  CUSTOM_BATTERY: customBattery,
};
Object.keys(customs).forEach(function(key) {
  if (customs[key] !== undefined) {
    clay.setSettings(key, coerceColor(customs[key], CUSTOM_DEFAULTS[key]));
  }
});
```

3c. In `webviewclosed`, after the `BARS_MODE` coercion, add:

```js
Object.keys(CUSTOM_DEFAULTS).forEach(function(key) {
  if (settings[key] !== undefined || settings[messageKeys[key]] !== undefined) {
    var raw = settings[key] !== undefined ? settings[key] : settings[messageKeys[key]];
    var coerced = coerceColor(Number(raw), CUSTOM_DEFAULTS[key]);
    settings[key] = coerced;
    if (messageKeys[key] !== undefined && messageKeys[key] !== key) {
      settings[messageKeys[key]] = coerced;
    }
  }
});
```

Note: the existing test mock sets `messageKeys.X === 'X'`, so both branches collapse to the same key in tests and the real build maps names to numbers.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest test/index.test.js 2>&1 | tail -6`
Expected: all PASS (existing 13 + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/pkjs/index.js test/index.test.js
git commit -m "feat: pass custom colors through phone JS"
```

---

### Task 4: Settings-page show/hide + live preview

**Files:**
- Modify: `src/pkjs/custom-clay.js`
- Test: `test/custom-clay.test.js`

**Interfaces:**
- Consumes: Clay items `COLOR_THEME` (messageKey), the 6 custom color items (messageKeys), preview item `custom-preview` (id); canvas `#custom-preview-canvas` in the page.
- Produces: section visible iff theme == 6; canvas repainted on any custom color change. No imports; runs with `this` = ClayConfig, first arg = minified.

- [ ] **Step 1: Replace `test/custom-clay.test.js`** with show/hide + repaint tests

```js
const customClay = require('../src/pkjs/custom-clay');

function makeItem(value) {
  return {
    _value: value,
    get: jest.fn(function() { return this._value; }),
    set: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    on: jest.fn(),
  };
}

function makeConfig(themeValue) {
  const themeItem = makeItem(themeValue);
  const colorItems = {
    CUSTOM_DATE: makeItem(0xffffff),
    CUSTOM_WEATHER: makeItem(0xffaa00),
    CUSTOM_TIME: makeItem(0x000000),
    CUSTOM_BODY: makeItem(0xff5500),
    CUSTOM_STEP: makeItem(0xaa55ff),
    CUSTOM_BATTERY: makeItem(0xaa55ff),
  };
  const previewItem = makeItem(null);
  const handlers = {};
  const config = {
    EVENTS: { AFTER_BUILD: 'afterBuild' },
    getItemByMessageKey: jest.fn((key) => {
      if (key === 'COLOR_THEME') return themeItem;
      return colorItems[key];
    }),
    getItemById: jest.fn(() => previewItem),
    on: jest.fn((event, cb) => { handlers[event] = cb; }),
  };
  return { config, handlers, themeItem, colorItems, previewItem };
}

describe('custom-clay', () => {
  it('is a factory function', () => {
    expect(typeof customClay).toBe('function');
  });

  it('shows custom section when theme is Custom after build', () => {
    const { config, handlers, colorItems, previewItem } = makeConfig(6);
    customClay.call(config, {});
    handlers.afterBuild();
    Object.values(colorItems).forEach((item) => {
      expect(item.show).toHaveBeenCalled();
    });
    expect(previewItem.show).toHaveBeenCalled();
  });

  it('hides custom section when theme is not Custom after build', () => {
    const { config, handlers, colorItems, previewItem } = makeConfig(0);
    customClay.call(config, {});
    handlers.afterBuild();
    Object.values(colorItems).forEach((item) => {
      expect(item.hide).toHaveBeenCalled();
    });
    expect(previewItem.hide).toHaveBeenCalled();
  });

  it('toggles on theme change and repaints on color change', () => {
    const { config, handlers, themeItem, colorItems } = makeConfig(0);
    customClay.call(config, {});
    handlers.afterBuild();
    expect(themeItem.on).toHaveBeenCalledWith('change', expect.any(Function));
    expect(colorItems.CUSTOM_BODY.on).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest test/custom-clay.test.js 2>&1 | tail -10`
Expected: FAIL — `handlers.afterBuild` is undefined (stub registers nothing).

- [ ] **Step 3: Implement `src/pkjs/custom-clay.js`**

```js
module.exports = function(minified) {
  var clayConfig = this;
  var CUSTOM_KEYS = ['CUSTOM_DATE', 'CUSTOM_WEATHER', 'CUSTOM_TIME', 'CUSTOM_BODY', 'CUSTOM_STEP', 'CUSTOM_BATTERY'];

  function css(n) {
    var v = Math.round(Number(n));
    if (!isFinite(v) || v < 0) v = 0;
    if (v > 0xffffff) v = 0xffffff;
    var h = v.toString(16);
    while (h.length < 6) h = '0' + h;
    return '#' + h;
  }

  function setCustomVisible(visible) {
    var i, item;
    for (i = 0; i < CUSTOM_KEYS.length; i++) {
      item = clayConfig.getItemByMessageKey(CUSTOM_KEYS[i]);
      if (item) {
        if (visible) item.show(); else item.hide();
      }
    }
    var preview = clayConfig.getItemById('custom-preview');
    if (preview) {
      if (visible) preview.show(); else preview.hide();
    }
  }

  function readColors() {
    var out = {};
    var i, item;
    for (i = 0; i < CUSTOM_KEYS.length; i++) {
      item = clayConfig.getItemByMessageKey(CUSTOM_KEYS[i]);
      out[CUSTOM_KEYS[i]] = item ? item.get() : 0;
    }
    return out;
  }

  function repaint() {
    if (typeof document === 'undefined' || !document.getElementById) return;
    var canvas = document.getElementById('custom-preview-canvas');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var c = readColors();
    ctx.fillStyle = '#FFFFAA';
    ctx.fillRect(0, 0, 200, 60);
    ctx.fillStyle = '#000000';
    ctx.fillRect(17, 2, 166, 30);
    ctx.fillStyle = css(c.CUSTOM_BODY);
    ctx.fillRect(20, 5, 160, 24);
    ctx.fillStyle = css(c.CUSTOM_DATE);
    ctx.fillRect(120, 5, 60, 14);
    ctx.fillStyle = css(c.CUSTOM_WEATHER);
    ctx.fillRect(20, 5, 60, 14);
    ctx.fillStyle = css(c.CUSTOM_TIME);
    ctx.fillRect(70, 12, 60, 10);
    ctx.fillStyle = '#000000';
    ctx.fillRect(20, 38, 160, 8);
    ctx.fillStyle = css(c.CUSTOM_BATTERY);
    ctx.fillRect(23, 40, 128, 4);
    ctx.fillStyle = '#000000';
    ctx.fillRect(20, 49, 160, 8);
    ctx.fillStyle = css(c.CUSTOM_STEP);
    ctx.fillRect(23, 51, 64, 4);
  }

  clayConfig.on(clayConfig.EVENTS.AFTER_BUILD, function() {
    var themeItem = clayConfig.getItemByMessageKey('COLOR_THEME');
    function sync() {
      var v = Number(themeItem.get());
      setCustomVisible(v === 6);
    }
    sync();
    themeItem.on('change', sync);
    var i;
    for (i = 0; i < CUSTOM_KEYS.length; i++) {
      var item = clayConfig.getItemByMessageKey(CUSTOM_KEYS[i]);
      if (item) item.on('change', repaint);
    }
    repaint();
  });
};
```

Constraints honored: no `require`, only `clayConfig` + `document` (guarded for Node tests), `minified` unused but accepted.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest test/custom-clay.test.js test/index.test.js 2>&1 | tail -6`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pkjs/custom-clay.js test/custom-clay.test.js
git commit -m "feat: custom section toggle and live preview"
```

---

### Task 5: End-to-end verification + docs

**Files:**
- Modify: `docs/QA-checklist.md` (add Custom rows — exact lines in Step 3)
- Test: full suite + builds + screenshots

**Interfaces:**
- Consumes: Tasks 1–4 output.
- Produces: green suite, 5-platform build, 2 screenshots, QA rows.

- [ ] **Step 1: Run the full test suites**

Run: `npm test 2>&1 | tail -6`
Expected: all suites PASS.

Run: `bash scripts/test-c.sh 2>&1 | tail -3`
Expected: `All C tests passed` (unchanged — Custom logic is SDK-bound).

- [ ] **Step 2: Build + screenshot both display classes**

Run: `pebble build 2>&1 | tail -8`
Expected: success all platforms.

Run: `pebble install --emulator basalt && pebble screenshot --scale 6 --no-open /tmp/custom-basalt.png`
Expected: open `/tmp/custom-basalt.png` and confirm Custom-at-defaults equals Neubrutalism.

Run: `pebble install --emulator aplite && pebble screenshot --scale 6 --no-open /tmp/custom-aplite.png`
Expected: open `/tmp/custom-aplite.png` and confirm legible B&W dither, no missing bars.

Per AGENTS.md, keep iterating on the C draw branches until the screenshots match the request; each iteration ends with a fresh screenshot view.

- [ ] **Step 3: Extend the QA checklist**

Append to `docs/QA-checklist.md`:

```markdown
- [ ] Custom theme at defaults matches Neubrutalism (basalt screenshot)
- [ ] Each of the 6 pickers recolors exactly its target, nothing else
- [ ] Custom section hides for themes 0-5, shows for Custom
- [ ] Preview canvas repaints on picker input without saving
- [ ] Aplite screenshot legible (B&W dither, bars visible)
- [ ] Upgrade from old install keeps working (missing persist keys → defaults)
```

- [ ] **Step 4: Commit**

```bash
git add docs/QA-checklist.md
git commit -m "docs: QA rows for custom theme"
```

---

## Self-review

- Spec coverage: 6 slots + defaults table (Tasks 1–3); flat battery/weather (Task 1 `false` flags); show/hide + mini mock (Task 4); buffer bump (Task 1 Step 3i); aplite/B&W (Task 5 screenshots); persist/upgrade + unreachable-watch fallback (Tasks 1/3, existing 1s-timeout untouched); testing (Tasks 3–5). No spec section lacks a task.
- Placeholder scan: no TBD/TODO; every code step shows exact code; no "similar to Task N" references; validation/clamping spelled out in both JS (`coerceColor`) and C (`prv_clamp_hex`).
- Type consistency: phone ints are 24-bit `0x000000–0xFFFFFF` everywhere; C stores `int32_t`, converts with `GColorFromHEX((uint32_t)…)`; key names `CUSTOM_DATE…CUSTOM_BATTERY` identical across `package.json`, `config.json`, `index.js`, `custom-clay.js`, C `MESSAGE_KEY_*`; `s_custom_hex` index order `[DATE, WEATHER, TIME, BODY, STEP, BATTERY]` defined once in Task 1 and reused.
