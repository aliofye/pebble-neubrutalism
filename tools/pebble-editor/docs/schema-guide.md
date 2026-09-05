# Schema guide (v1)

How to write a `design.json` by hand (phase 2 does this for real faces;
this is the reference). Validate with
`node tools/pebble-editor/validate.js file.json`.

## Minimal face

```json
{
  "schema": 1,
  "name": "fixture",
  "screens": {
    "main": {
      "w": 144, "h": 168,
      "layers": [
        {
          "id": "background", "kind": "graphics",
          "items": [
            { "kind": "rect",
              "box": { "x": 0, "y": 0, "w": "w", "h": "h" },
              "fill": "$background" }
          ]
        },
        {
          "id": "time", "kind": "pixeltext",
          "box": { "x": 14, "y": 33, "w": 115, "h": 56 },
          "pixelFont": "digits", "fill": "$ink",
          "text": "$time_str", "scaleDivisor": 40
        }
      ]
    }
  },
  "themes": [
    { "name": "a",
      "tokens": { "background": "GColorPastelYellow", "ink": "GColorBlack" } }
  ],
  "state": [{ "name": "time_str", "type": "string" }],
  "fonts": [],
  "bitmaps": [],
  "pixelFonts": {
    "digits": { "rows": 2, "chars": { "0": ["11", "11"] } }
  }
}
```

## Dimensions

Integers are device pixels. Strings are expressions over `w`/`h`/named
constants with `+ - * /` and parentheses, integer division: `"w/10"`,
`"(w*8)/10"`, `"h/3"`, `"w-2*stroke"`. Anything else is rejected.
`constants` are plain integers shared across the file (strokes, divisors);
`w`/`h` may not be redefined as constants.

## Ink convention

Meterbar shadow strips + outline boxes, and polygon outlines, always render
in the theme's `ink` token (mirrors the reference face). Every theme should
define `ink`. Fills themselves may be literals, `$tokens`, or conditionals.

## Fills

- `"GColorOrange"` — literal Pebble color.
- `"$ink"` — theme token. Must exist in **every** theme.
- Conditional (first match wins):
  ```json
  { "cases": [
      { "when": { "var": "battery", "op": "lt", "value": 20 },
        "fill": "$battery_low" } ],
    "default": "$battery_bar" }
  ```
  `when` is one test, a list (AND), or `{"any": [...]}` (OR).
  Ops: `eq lt lte gt gte in`. `var` is a state name or `theme.<flag>`.

## Visibility

Any layer or graphics item takes `visibleWhen` with the same condition
shape, e.g. a Bluetooth icon only when disconnected:

```json
{ "kind": "bitmap", "id": "bt", "center": [39, 25],
  "visibleWhen": { "any": [{ "var": "bt", "op": "eq", "value": false }] } }
```

## Meter bars

The composite bar (shadow strip, ink box, pastel frame, black core,
percentage fill) from the reference face, parameterized:

```json
{ "kind": "meterbar",
  "box": { "x": 16, "y": 111, "w": 112, "h": 38 },
  "stroke": 3, "shadow": { "dx": 2, "dy": 3 },
  "frame": "$battery_frame", "core": "$ink",
  "value": "$battery", "fill": "$battery_bar",
  "inset": 3, "compact": { "maxH": 30, "stroke": 1, "inset": 2 } }
```

`value` must reference an `int` state var (0–100, clamped host-side).
Boxes shorter than `compact.maxH` use the compact stroke/inset.

## Pixel text

Renders `text` (a `$string` state var) centered in `box` using a
`pixelFonts` bitmap set. Pixel size = `floor(screen_w / scaleDivisor)`;
`scaleOverride` conditionally replaces the x/y pixel size (e.g. squashed
digits for wide hours):

```json
"scaleOverride": [{ "when": { "var": "hour", "op": "in", "value": [20,21,22,23] }, "y": 4 }]
```

Glyph tables: `rows` strings of `0`/`1` per char, consistent width per
char (ragged glyphs are rejected).

## Text layers

```json
{ "id": "date", "kind": "text",
  "box": { "x": 69, "y": 3, "w": 72, "h": 28 },
  "font": "jersey", "fill": "$ink",
  "align": "center", "vcenter": true, "text": "$date_str" }
```

`font` references `fonts[]` by id (maps to a `package.json` resource);
`text` references a `$string` state var — all formatting happens
host-side. `vcenter` mirrors `TextLayer` vertical centering.

## Polygons

Point lists of dimensions; `outline.stroke` draws the axis-aligned
straight-edge outline. Deliberately, closing segments that are diagonal
are skipped — the same trick the reference face uses for open outlines.
