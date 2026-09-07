# pebble-editor

Visual editor + one-way C codegen for Pebble watchfaces. Lives here under
`tools/` for now; designed to move to its own repo later — nothing in here
may assume this repo's layout. The codegen takes input/output paths as
arguments, faces are loaded by path, and the schema is versioned.

## Layout

```
tools/pebble-editor/
  schema/design.schema.json   v1 spec (machine-readable source of truth)
  validate.js                 validator CLI + requireable module
  docs/host-contract.md       what hand-written host code must provide
  docs/schema-guide.md        human guide to writing design.json
  examples/                   (phase 2) extracted faces as design.json
```

## Invariants

1. `design.json` is the sole source of visual truth. Generated C is
   read-only (marked region). Hand-written logic lives outside it.
2. Schema is Pebble-only and versioned. v1 covers: rect, axis-aligned
   polygon, meter bar, bitmap, system/custom text, pixel text, theme
   tokens + flags, ordered conditions on host-provided state. New
   primitives arrive as v2+; v1 files keep validating.
3. Preview renderer and C codegen consume the same file — fidelity by
   construction, enforced by screenshot-diff (phase 3+).
4. Validator gates everything: structure (JSON Schema via ajv) plus
   semantics (every `$token`/`theme.flag`/`$state`/`font`/`bitmap`/
   `pixelFont` reference resolves; expressions parse; glyphs are
   consistent; every theme defines every used token and flag).

## Commands

```bash
node tools/pebble-editor/validate.js path/to/design.json
npm run design:validate -- path/to/design.json
```

## Phases

1. Schema + validator + host contract. DONE.
2. Hand-extract faces into `design.json` (reference face + minimal fixture).
   DONE (`examples/`).
3. Codegen emitting pixel-identical C (screenshot-diff gate). DONE
   (`generate.js`; reference face wired in and verified identical on both
   screen sizes; `stub/` syntax-checks output under `-Wall -Wextra -Werror`).
4. Editor: direct manipulation, rules + state simulator. DONE (`app/` +
   `serve.js`; manipulation = select/move/resize/vertex/nudge/layer-reorder/
   snap/undo, simulator = theme + typed state controls + live clock; save
   validates server-side). Blank-first authoring: the editor opens on
   `examples/blank.design.json` (white watch, no widgets); toolbar
   click-places rect/polygon/meterbar/text/pixeltext and graphics/text
   layers on both sizes (proportional mirror), Delete removes on both sizes
   with widget auto-prune, TTF upload extends `fonts[]`, Duplicate/New
   manage faces, and `neubrutalism-plus` is a frozen reference. Parity
   proof: `replay-neubrutalism.js` rebuilds the reference from blank using
   only editor-model ops (covered by `test/design-replay.test.js`, including
   identical generated C). Size toggles (144 / 200): the 200 canvas plus
   144 color and 144 B&W preview canvases (monochrome is a CSS grayscale
   approximation); selection persists per face. Validator requires every
   `app.targets` entry to dims-match a screen. Widget bindings:
   text/pixeltext layers and
   meterbar values get a source picker fed by `GET /api/widgets`
   (providers grouped by type with owning widget); picking one rewrites the
   `$ref` and auto-adds the widget to the face, layers list shows
   `$var ⇐ widget` badges (`⚠` when the provider is missing or off),
   per-item rows under graphics layers, layer/item delete (Del key) on both
   sizes. Face management: Duplicate/New via `POST /api/face`, TTF upload
   via `POST /api/font`.

## UI shell (v2)

The user-facing shell is a React + Vite app in `ui/` (dark instrument
theme: neutrals + one signal blue, Lucide icons, no gradients). It imports
the framework-free engine (`app/preview.js` + `app/editor-model.js`) via a
prebuild esbuild bundle (`ui/scripts/bundle-engine.cjs`, output
`ui/src/gen/`, gitignored) — the engine files stay untouched CJS so jest
keeps requiring them directly.

```bash
cd tools/pebble-editor/ui && npm install && npm run build
node tools/pebble-editor/serve.js . 8137
# → http://localhost:8137/app/?face=tools/pebble-editor/examples/blank.design.json
```

`serve.js` serves the built shell from `app-dist/` at `/app/` (falls back
to the legacy vanilla shell in `app/` when no build exists; legacy stays
available at `/app-legacy/`). Dumb primitives only (rect, polygon, bar,
text, pixeltext, bitmap): drag-to-size placement mirrored to both sizes,
Shift+click multi-select, one-level named/lockable groups, provider
pickers that auto-add widgets + state, fills/fonts/visibility mirrored
across sizes (geometry stays per-screen). Verified end-to-end with
headless Chromium flows (place → bind → group → save → validate).
5. CI gate: validate → generate → build → screenshot-diff. TODO.
6. Reusable widget modules (`widgets/`: battery, steps, weather +
   `pe_layers.h`; host-tested via `scripts/test-c.sh`). DONE.
7. Full-app scaffold codegen (`generate-app.js` + `templates/`): emits a
   complete watchface (appinfo, resources, settings, Clay config, host
   `main.c`) from a design with `app`/`widgets`/`settings`/`constants`
   blocks — zero hand-written code. DONE, proven by a second face:
   `examples/starter.design.json` validates, builds for all targets, and
   renders its own cobalt design on fresh basalt (144×168) and emery
   (200×228) emulators (no crash, no fallback to the previous face).
   Lesson: a stale emulator flash keeps the previously active face, so
   emulator proof must kill stale qemu processes (and wipe the platform
   flash if installs stop landing) before install + screenshot.
   Widget guide + perf-cost docs: TODO.
