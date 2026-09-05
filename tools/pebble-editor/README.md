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
   validates server-side). Creation wizard (blank-face authoring): TODO —
   today a new face starts as JSON loaded by path.
5. CI gate: validate → generate → build → screenshot-diff. TODO.
