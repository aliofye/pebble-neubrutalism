# Custom Theme Design — Neubrutalism+

Date: 2026-09-10
Status: proposed, awaiting review
Approach: A (Custom theme + 6 flat colors + canvas preview)

## Goal

Add a 7th `Custom` color theme that unlocks 6 Clay `color` pickers plus a
live mini-watchface preview in the settings page.

## Non-goals

- No battery low/mid/high status colors in Custom (flat fill only).
- No weather condition colors in Custom (flat fill only).
- No changes to background, ink outlines, battery frame, or step overflow
  dark shade. Those stay on the Neubrutalism defaults when Custom is active.
- No changes to aplite-specific layout.

## Custom slots (6)

| # | Key | Maps to | Default (Neubrutalism parity) |
|---|-----|---------|-------------------------------|
| 1 | `CUSTOM_DATE` | date bubble fill (today hardcoded `GColorWhite`) | `0xFFFFFF` |
| 2 | `CUSTOM_WEATHER` | weather bubble fill (today condition-based) | `0xFFAA00` (ChromeYellow) |
| 3 | `CUSTOM_TIME` | time glyph color (today `theme->ink`) | `0x000000` |
| 4 | `CUSTOM_BODY` | time-box body (today `theme->body` = Orange) | `0xFF5500` |
| 5 | `CUSTOM_STEP` | step bar fill (today `theme->step_bar`) | `0xAA55FF` (LavenderIndigo) |
| 6 | `CUSTOM_BATTERY` | battery bar fill (today status-driven) | `0xAA55FF` (LavenderIndigo) |

Defaults are chosen so Custom-at-defaults is pixel-identical to
Neubrutalism with a sunny weather bubble.

## Architecture

```
Clay config page            Phone JS (index.js)            Watch (neubrutalism.c)
─────────────────           ───────────────────            ─────────────────────
select COLOR_THEME (0-6)
6x color pickers  ──change──▶ canvas preview repaint (local only)
Save ──webviewclosed──▶ coerce 6 HEX ints ──AppMessage──▶ inbox:
                                                         GColorFromHEX, persist,
                                                         mark all layers dirty
Config open ──SETTINGS_REQUEST──▶ prv_send_settings (theme + 6) ──▶ Clay pre-fill
```

## Changes

### package.json

- Append to `pebble.messageKeys`:
  `CUSTOM_DATE`, `CUSTOM_WEATHER`, `CUSTOM_TIME`, `CUSTOM_BODY`,
  `CUSTOM_STEP`, `CUSTOM_BATTERY`.
- Bump AppMessage buffers: `app_message_open(64, 64)` → `(256, 256)`.
  14 int keys fit comfortably; 256 is a safe Pebble-wide size.

### src/pkjs/config.json

- `COLOR_THEME` select gains `{ "label": "Custom", "value": 6 }`.
- New section `Custom Colors` (group `custom`, hidden unless theme == 6):
  6 items, each `{ "type": "color", "messageKey": <KEY>, "label": ...,
  "defaultValue": "0xXXXXXX", "layout": "COLOR" }`.
- One `generic` item with an HTML `<canvas id="custom-preview">` slot for
  the live mock.

### src/pkjs/custom-clay.js (currently a stub)

- Export the Clay custom function.
- On build + on `change:COLOR_THEME`: show group `custom` iff value == 6.
- On any of the 6 color changes: repaint the preview canvas.
- Preview renderer: port of the `design-sandbox/index.html` draw routines
  (background rect, date/weather bubbles, time box, two metric bars),
  simplified to one 200px-wide mock at 1x with hard-coded noon time,
  72° weather, 80% battery, 40% steps. No fonts required — bubbles are
  color swatches with labels, time box shows real glyph scale via fillRect.
- Keep under ~150 lines, no new npm dependencies.

### src/pkjs/index.js

- `webviewclosed`: coerce each `CUSTOM_*` via `Number()`, validate
  `0x000000–0xFFFFFF` integers, fall back to defaults on NaN/out-of-range,
  then `Pebble.sendAppMessage`.
- `appmessage` (settings sync from watch): `clay.setSettings()` for the 6
  keys so reopening config shows watch truth; extend the
  `UNKNOWN_KEY` early-return guard to include the 6 keys.
- No change to weather fetch scheduling.

### src/c/neubrutalism.c

- `THEME_CUSTOM = 6`, `THEME_COUNT 6 → 7`.
- 6 new persist keys (`PERSIST_KEY_CUSTOM_DATE = 10` … `= 15`), each an
  `int32` of 24-bit HEX.
- Static `int32_t s_custom_hex[6]` initialized from persist-or-defaults in
  `prv_init`; static `ColorTheme s_custom_theme` built by
  `prv_rebuild_custom_theme()`:
  - `background = GColorPastelYellow`, `ink = GColorBlack`,
    `battery_frame = GColorPastelYellow` (fixed Neubrutalism chrome),
  - `body = GColorFromHEX(s_custom_hex[BODY])`,
  - `step_bar = GColorFromHEX(s_custom_hex[STEP])`,
    `step_bar_dark =` same darkened? No — reuse `s_color_themes[0].step_bar_dark`
    (Indigo) so overflow shade stays readable on any custom step color.
  - `battery_bar = GColorFromHEX(s_custom_hex[BATTERY])`,
    `battery_status = false` (flat),
  - `weather_condition_colors = false` (flat),
  - date/weather/time colors held separately (see below) since the struct
    has no fields for them. Date AND weather text both follow the custom
    time color (amended post-testing; v1 black-text limitation dropped).
- Static `GColor s_custom_date, s_custom_weather, s_custom_time`, rebuilt
  alongside the theme.
- `prv_theme()` returns `&s_custom_theme` when
  `s_color_theme == THEME_CUSTOM`.
- Draw changes, Custom-only branches:
  - date bubble fill: `GColorWhite` → custom date when Custom.
  - weather bubble fill: `prv_weather_bubble_color()` → custom weather
    when Custom.
  - time glyphs: `theme->ink` → custom time when Custom.
  - date text color: `theme->ink` → custom time when Custom (keeps date
    legible on custom bubble); weather text stays `GColorBlack` unless the
    weather bubble is dark — v1 keeps black, documented limitation.
  - battery fill: `prv_battery_color()` already returns `battery_bar` when
    `battery_status == false`, so Custom is flat with no extra branch.
- `prv_inbox_received`: handle 6 new keys (validate range, persist,
  rebuild, mark background/bars/time layers dirty). Reject out-of-range
  theme values as today.
- `prv_send_settings`: also `dict_write_int32` the 6 HEX values.

## Aplite (B&W) behavior

`GColorFromHEX` snaps to the nearest supported color per platform; on
aplite custom colors dither to black/white. No crash path — same code as
all existing themes.

## Error handling

- Missing persist keys (upgrades): fall back to the defaults table.
- NaN / out-of-range HEX from JS: C clamps to `0x000000–0xFFFFFF`, JS
  pre-validates so this is defense-in-depth only.
- Config opened while watch unreachable: existing 1s-timeout fallback
  reuses last-saved Clay values, which now include the 6 customs.

## Testing

- `npm test` — new Jest cases: 6 keys pass through `webviewclosed` as
  numbers; invalid HEX falls back; `appmessage` sync sets all 6.
- `scripts/test-c.sh` — existing C unit tests still pass.
- `pebble build` — all 5 platforms.
- `pebble screenshot --scale 6` on basalt (color) and aplite (B&W):
  Custom-at-defaults matches Neubrutalism; changing each picker affects
  exactly its target element.
- Manual Clay check: selecting Custom reveals section + preview; any other
  theme hides it; preview repaints synchronously on picker input.

## Risks

- Clay `color` returns 24-bit ints; C must use `GColorFromHEX`, never a raw
  cast to `GColor8`. Covered in implementation plan as an explicit step.
- Inbox growth: 64-byte buffers would truncate; the 256 bump is required,
  not optional.
