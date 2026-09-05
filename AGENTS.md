---
alwaysApply: true
---

## Project Overview

Neubrutalism+ — a Pebble watchface written in C (Pebble SDK 3). Brutalist design:
thick black borders, offset hard shadows, flat saturated color blocks, pixel type.

## Watchface Design Notes

- Background: `GColorPastelYellow` window fill (theme-dependent, see themes).
- Core orange block: rect from `orange_rect()` in `layout.c` (`x=w/10, y=h/5,
  w=8w/10, h=h/3`) with outer black border (`ORANGE_STROKE = 3`) and a hard
  black shadow offset by `w/30` down-right.
- Date/weather tabs: white-filled (date) and condition-colored (weather)
  `GPath` polygons with axis-aligned black outlines (`prv_draw_axis_aligned_outline`,
  stroke 4 on both sizes). Points: `s_polygon_info_200` / `s_polygon_info_144`
  (+ `_weather` mirrors) in `neubrutalism.c`.
- Time: custom pixel glyphs (`glyphs.c`, string bitmaps) rendered in ink inside
  the orange block. Pixel scale `pix = screen_w / 40` (5 on 200px, 3 on 144px);
  hours 20–23 in 24h mode on 200px use `pix_h = 4` so the time fits.
- Date/weather text: Jersey10 font (`FONT_JERSEY_38` on 200px, `FONT_JERSEY_25`
  on 144px), vertically centered in their layer boxes. Date in theme ink,
  weather always black. Weather bubble fill follows the WMO code
  (`prv_weather_bubble_color`); hidden unless weather is enabled or BT is down.
- Metric bars (`prv_draw_metric_bar`): black shadow strip, ink outline box,
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

# JS unit tests (host-side logic: layout, time formatting)
npm test
```

If you need more information on the `pebble` command or a sub-command, append `--help`.

## Project Structure

```
src/c/           - C sources: neubrutalism.c (watchface), glyphs.c/h (pixel
                   digits), layout.c/h (orange_rect), time_util.c/h (formatting)
src/pkjs/        - Clay settings page: config.json, index.js, custom-clay.js
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
Clay page in `src/pkjs/`. `DEBUG_COLOR_CYCLE` in `neubrutalism.c` (default 0)
cycles weather/battery colors every 2s for visual development; never ship with
it on.

## Architecture

1. **Main entry**: `main()` in `neubrutalism.c` — init, service subscriptions,
   event loop. No button handling (watchface).
2. **Layers** (bottom to top): `s_background_layer` (static chrome: time box,
   tabs, weather bubble, BT icon — redrawn only on theme/weather/BT change),
   `s_bars_layer` (metric bars — redrawn on battery/step/theme/mode change),
   date + weather `TextLayer`s, `s_time_layer` (pixel glyphs — the only layer
   redrawn every minute). All three graphics layers are full-screen frames;
   drawing is done by **generated code** (see below), which uses absolute
   screen coordinates.
3. **Generated visuals**: `src/c/generated_design.c/h` (DO NOT EDIT) is
   produced from `tools/pebble-editor/examples/neubrutalism-plus.design.json`
   by `node tools/pebble-editor/generate.js`. It owns: theme tables, polygon
   data, all layer draw functions, text frames/fonts/colors, visibility
   rules. `neubrutalism.c` keeps services, state, settings, and layer/text
   lifecycle, and feeds a state struct to the generated draw calls. To change
   anything visual, edit the design (visually in the editor, or the JSON),
   regenerate, rebuild. Never hand-edit the generated files.
3. **Services**: minute tick, battery, bluetooth, health (step count, `PBL_HEALTH`
   only), AppMessage inbox for Clay settings with persist round-trip.
4. **Shared/host logic**: `layout.c` and `time_util.c` compile both on-watch
   and on-host (for jest tests).

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
- `src/c/generated_design.c/h` is build output. Regenerate; never edit.
- Run the full loop (edit → save → generate → build → screenshot-diff) for
  every visual change, and `npm test` for good measure.

## AI Interaction Guidelines

- When given an image of a watchface to replicate, describe the target watchface in precise detail. Note every visual element present, as well as size, alignment, font weight, spacing, and location.

## AI Code Review Guidelines

- Once you think you've fulfilled the user's request, ask yourself if you see any issues with the current screenshot, and if there are any differences between the screenshot and the reference image or the user's description. If so, fix them.
