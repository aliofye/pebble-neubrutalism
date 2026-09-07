---
alwaysApply: true
---

## Project Overview

Neubrutalism+ — a Pebble watchface written in C (Pebble SDK 3). Brutalist design:
thick black borders, offset hard shadows, flat saturated color blocks, pixel type.

## Watchface Design Notes

- Background: `GColorPastelYellow` window fill (theme-dependent, see themes).
- Core orange block: rect from `orange_rect()` in the design
  (`x=w/10, y=h/5, w=8w/10, h=h/3`) with outer black border
  (`ORANGE_STROKE = 3`) and a hard black shadow offset by `w/30` down-right.
- Date/weather tabs: white-filled (date) and condition-colored (weather)
  `GPath` polygons with axis-aligned black outlines, stroke 4 on both sizes.
- Time: custom pixel glyphs (string bitmaps in the design's `pixelFonts`)
  rendered in ink inside the orange block. Pixel scale `pix = screen_w / 40`
  (5 on 200px, 3 on 144px); hours 20–23 in 24h mode on 200px use `pix_h = 4`
  so the time fits.
- Date/weather text: Jersey10 font (`FONT_JERSEY_38` on 200px, `FONT_JERSEY_25`
  on 144px), vertically centered in their layer boxes. Date in theme ink,
  weather always black. Weather bubble fill follows the WMO code
  (conditional fill cases in the design); hidden unless weather is enabled
  or BT is down.
- Metric bars: black shadow strip, ink outline box,
  pastel frame, black core, colored fill. Three modes (`BARS_BOTH` stacked,
  `BARS_BATTERY_ONLY`, `BARS_STEPS_ONLY`); positions derive from `timeBottom`
  (bottom of the time-box shadow), vertically centered in the remaining space.
  Battery fill is status-colored in themes with `battery_status` (<20 low,
  <50 mid, else high); step fill is `theme->step_bar`.
- Color themes: 6 entries in `s_color_themes` (Neubrutalism, Game Boy Green,
  Ocean Blue, Amber LCD, Monochrome, Purple Pixel). Only Neubrutalism enables
  `battery_status` and `weather_condition_colors`.
- **Neubrutalism rules (all changes must obey):** hard black borders on every
  shape; solid offset shadows, never blurred; flat color blocks; chunky pixel
  type; axis-aligned geometry only (no diagonals, no rounded corners, no
  gradients). Flag and push back on anything that violates this.

## Supported Platforms

Targets from `package.json` (`aplite`, `basalt`, `diorite`, `emery`, `flint`).
Two layouts, chosen by screen width: 144×168 (aplite/basalt/diorite) and
200×228 (emery). No chalk target.

## Commands

```bash
# Build the app for all platforms
pebble build

# Clean build artifacts
pebble clean

# Install the app on specific emulator
pebble install --emulator basalt

# Screenshot the running emulator (no --scale flag in this SDK)
pebble screenshot --emulator basalt --no-correction --no-open shot-basalt.png

# JS unit tests (host-side logic: layout, time formatting) + C widget tests
npm test
./scripts/test-c.sh
```

If you need more information on the `pebble` command or a sub-command, append `--help`.

## Project Structure

```
src/c/           - GENERATED app core (DO NOT EDIT, DO NOT ADD FILES): main.c,
                   generated_design.c/h, pe_layers.h, widgets/ (time, date,
                   battery, steps, weather + shared time_util) — all produced
                   from tools/pebble-editor/examples/neubrutalism-plus.design.json
src/pkjs/        - GENERATED Clay page (DO NOT EDIT): config.json, index.js,
                   widget_weather.js; custom-clay.js template copy
resources/       - fonts/Jersey10-Regular.ttf, images/bt_disconnect.png
design-sandbox/  - UNCOMMITTED throwaway visual sandbox (single HTML file).
                   Superseded by the editor below; kept for quick throwaway
                   experiments only.
tools/pebble-editor/ - Visual editor + one-way C codegen (schema, validator,
                   generate.js, stub syntax-check, web editor app, serve.js).
                   Designs live in tools/pebble-editor/examples/*.design.json.
                   See tools/pebble-editor/README.md for phases and workflow.
```

## Configuration

Watchface (`"watchface": true` in package.json). Settings sync via AppMessage
`messageKeys` (time format, theme, step goal, bars mode, weather) driven by the
generated Clay page in `src/pkjs/`. There is no hand-written face code left:
every behavior lives in a widget module under `tools/pebble-editor/widgets/`
(time, date, battery, steps, weather) or the generated core. The old
`DEBUG_COLOR_CYCLE` dev hook is gone with `neubrutalism.c`.

## Architecture

1. **Source of truth**: `tools/pebble-editor/examples/neubrutalism-plus.design.json`
   + `neubrutalism-plus.resources.json`. Everything under `src/c/` and the
   Clay trio (`src/pkjs/index.js`, `config.json`, `widget_weather.js`) is
   generated — never edited, never extended by hand.
2. **Layers** (bottom to top): background (static chrome: time box, tabs,
   weather bubble, BT icon — redrawn only on theme/weather/BT change), bars
   (metric bars — redrawn on battery/step/theme/mode change), date + weather
   `TextLayer`s, time (pixel glyphs — the only layer redrawn every minute).
   All three graphics layers are full-screen frames drawn with absolute
   screen coordinates.
3. **Codegen** (two steps, both required):
   - visuals: `node tools/pebble-editor/generate.js <design> --out-dir src/c`
     → `generated_design.c/h` (theme tables, polygon data + create/destroy
     lifecycle, draw functions, text frames/fonts/colors, visibility rules).
     The generated `main.c` calls each screen's `*_polygons_create()` on
     window load and `*_polygons_destroy()` on unload — without them polygon
     fills silently vanish (outlines still draw; proven by the migration
     parity gate).
   - full app: `node tools/pebble-editor/generate-app.js <design> --out-dir .`
     writes `src/c/main.c`, `src/c/pe_layers.h`, `src/c/widgets/`,
     `src/pkjs/*`, and the `pebble.messageKeys`/`resources` sections of
     `package.json` (order matters; keep the generated order).
   To change anything — visual or behavioral — edit the design or a widget
   module, regenerate both, rebuild. Never hand-edit the generated files.
4. **Services** (all owned by widgets/core, none by face code): minute tick
   (shared; time/date/steps poll it), battery events, bluetooth, health step
   count (`PBL_HEALTH` only), AppMessage inbox for Clay settings with
   persist round-trip (persist keys are part of the widget manifests and the
   design's `settings`; never reuse a number).
5. **Shared/host logic**: `tools/pebble-editor/templates/time_util.c`
   (formatting) compiles on-watch (copied into `src/c/widgets/`) and
   on-host (widget unit tests via `scripts/test-c.sh`).

## SDK Documentation

The full Pebble SDK documentation is available at https://developer.repebble.com.

Main Categories:
- Tutorials - Step-by-step learning (C watchface tutorial in 5 parts, advanced topics)
- Developer Guides - Comprehensive reference organized by topic

Key Sections:
- App Resources - Images, fonts, vector graphics, 256 resource limit
- User Interfaces - Layer hierarchy, TextLayer, MenuLayer, round vs rectangular displays
- Events & Services - Buttons, accelerometer, compass, health data, background workers
- Communication - Bluetooth AppMessage, PebbleKit JS/Android/iOS integration
- Graphics & Animations - Drawing APIs, property animations, vector graphics
- Debugging - App logs, GDB, common errors and solutions
- Best Practices - Multi-platform support, battery conservation, modular architecture
- Design & Interaction - Glance-first design, one-click actions, platform guidelines
- App Store Publishing - Submission requirements, assets, analytics

Key Entry Points:
- https://developer.repebble.com/tutorials/watchface-tutorial/part1 - C development start
- https://developer.repebble.com/guides/events-and-services/buttons - Button handling
- https://developer.repebble.com/guides/user-interfaces/layers - UI foundations

## Development Best Practices

- Visual changes go through the editor, never hand-edited C:
  1. `node tools/pebble-editor/serve.js . 8137` → open the printed URL,
     pick the face, drag/resize/edit, Save (server validates on write).
  2. Generate C: editor "Generate C" button (or
     `node tools/pebble-editor/generate.js <design> --out-dir src/c`).
  3. `pebble build` + `pebble screenshot --emulator <basalt|emery> --no-open`
     for both screen sizes; pixel-compare against the editor preview
     (mask the time digits — minutes elapse between shots). Any other
     difference means schema/codegen/preview drift: fix the tooling, not
     the generated files.
- `src/c/` and the Clay trio are build output. Regenerate (both steps);
  never edit, never add files there.
- Run the full loop (edit → save → generate → build → screenshot-diff) for
  every visual change, and `npm test` for good measure.

## AI Interaction Guidelines

- When given an image of a watchface to replicate, describe the target watchface in precise detail. Note every visual element present, as well as size, alignment, font weight, spacing, and location.

## AI Code Review Guidelines

- Once you think you've fulfilled the user's request, ask yourself if you see any issues with the current screenshot, and if there are any differences between the screenshot and the reference image or the user's description. If so, fix them.
