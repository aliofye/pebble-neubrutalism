---
alwaysApply: true
---

## Project Overview

This is a Pebble smartwatch application written in C using the Pebble SDK.

## Watchface Design Notes

- Background: `GColorPastelYellow` window fill.
- Core orange block: centered rect from `prv_orange_rect_for_bounds` with outer black border (stroke 3) and chrome yellow polygon accent (`s_polygon_200` / `s_polygon_144`) outlined with axis-aligned fill.
- Time/date: pixel-glyph time rendered in black inside the orange block; date text layer centered near top using Jersey font (38 for 200px, 25 for 144px).
- Battery strip (200px): black base `GRect(26,170,160,29)` under a pastel-yellow framed module at `GRect(22,150,155,45)` with doubled stroke; inner black core inset 4px; lavender bar inset another 4px, width = battery %.
- Battery strip (144x168-ish): scaled positions — black base `GRect(19,128,115,24)`; pastel module `GRect(16,111,112,38)` with doubled stroke; inner black core inset ~3px; lavender bar inset another ~3px, width = battery %.
- Decorative outline: axis-aligned outline using `prv_draw_axis_aligned_outline`. 200px points: (150,140) → (186,140) → (186,215) → (100,215). 144px points: (108,103) → (134,103) → (134,166) → (72,166). Stroke 4 on 200px, 3 on 144px.

## Supported Platforms

The app targets the platforms in `package.json` (`pebble.targetPlatforms`):
- aplite (Pebble classic)
- basalt (Pebble Time)
- diorite (Pebble 2)
- emery (Pebble Time 2)
- flint (Pebble 2 Duo)

## Commands

```bash
# Build the app for all platforms
pebble build

# Clean build artifacts
pebble clean

# Install the app on specific emulator
pebble install --emulator basalt

# Screenshot the running emulator
pebble screenshot --scale 6 --no-open screenshot.png
```

If you need more information on the `pebble` command or a sub-command, append `--help`.

## Project Structure

```
src/c/           - C source files for the watchface (neubrutalism.c, layout, glyphs, time_util, steps_util)
src/pkjs/        - PebbleKitJS config + weather (index.js, config.json, custom-clay.js)
resources/       - Fonts (Jersey10) and images (bt_disconnect.png)
test/c/          - C unit tests (run via scripts/test-c.sh)
test/*.test.js   - JS unit tests (run via npm test / jest)
scripts/         - Build/test helpers (build-watch.sh, test-c.sh)
docs/            - Publishing notes, QA checklist, screenshots
design-sandbox/  - HTML preview sandbox
```

## SDK Documentation

The full Pebble SDK documentation is available at https://developer.repebble.com.

## Development Best Practices

- Whenever making changes, run `pebble screenshot --scale 6` and view the screenshot to make sure it's what the user requested. If not, make more changes until it does what it's supposed to.

## AI Interaction Guidelines

- When given an image of a watchface to replicate, describe the target watchface in precise detail. Note every visual element present, as well as size, alignment, font weight, spacing, and location.

## AI Code Review Guidelines

- Once you think you've fulfilled the user's request, ask yourself if you see any issues with the current screenshot, and if there are any differences between the screenshot and the reference image or the user's description. If so, fix them.
