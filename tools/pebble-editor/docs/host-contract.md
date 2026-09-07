# Host contract

Generated code reads state; it never produces it. State comes from exactly
one of three places, and the validator enforces it: a widget `provides`
entry (live data: time, date, battery, steps, weather), a design `settings`
entry (persisted Clay options), or the generated app core (`bt` only).
There is no fourth place — faces add no hand-written state.

## State variables (`state[]`)

Every entry names its provider (widget, setting, or core):

| type     | C mapping              | example                              |
|----------|------------------------|--------------------------------------|
| `int`    | `int` (0–100 for bars) | `battery`, `weather_code`            |
| `bool`   | `bool`                 | `bt_connected`, `weather_enabled`    |
| `string` | `char[]`, NUL-terminated | `time_str` (`"9:41"`), `date_str`  |

Rules for hosts:

1. Declare every variable the design references in `state[]` with its type.
   Codegen turns these into `extern` reads (or accessor calls); a missing
   provider is a link error, by design.
2. Update values through the existing service callbacks (tick, battery,
   bluetooth, health, AppMessage) and mark the affected generated layers
   dirty. Generated draw code is pure: same state + theme ⇒ same pixels.
3. Derived display values (12/24h-adjusted hour, formatted strings,
   uppercase date) are computed inside the owning widget (`time`, `date`)
   and exposed as state. The schema has no date/time formatting primitives
   on purpose; faces never format clocks themselves.
4. `meterbar.value` variables must stay in 0–100. Clamp host-side.

## Layers

Codegen creates one Pebble `Layer` (or `TextLayer`) per `screens.<id>.layers[]`
entry, bottom to top, with the schema `id` as its C identifier. The host:

1. Creates/destroys them in window load/unload (generated helpers do this;
   the host calls the helpers).
2. Calls the generated `*_mark_dirty(id)` helper (or `layer_mark_dirty`)
   when state affecting that layer changes. Suggested policy, also recorded
   per layer in the optional `note` field:
   - static chrome (time box, tabs): theme / weather / bluetooth changes
   - metric bars: battery / steps / theme / bars-mode changes
   - pixel time: minute tick only
3. Honors `visibleWhen` by hiding/showing the layer (or skipping the item)
   and re-evaluates it whenever its referenced state changes.

## Themes

The active theme is host state (a setting). Generated code reads colors only
through the active theme's `tokens` and `flags`:

- Every `$token` used anywhere must exist in **every** theme (validator
  enforces this). There is no fallback color.
- Every `theme.<flag>` used in a condition must exist in **every** theme's
  `flags` (validator enforces this).
- Switching themes = set index + redraw all generated layers.

## Resources

`fonts[]` and `bitmaps[]` entries map 1:1 to `package.json` resource IDs
(`resource` field). The host loads them (generated helper) and unloads on
exit. `pixelFonts` are emitted as static C string tables — no loading needed.

## Expressions

`Dim` expressions (`"w/10"`, `"(w*8)/10"`) evaluate with C integer semantics
(truncation toward zero; operands here are non-negative). Codegen emits the
expression verbatim into C and evaluates it with the same semantics in the JS
preview — this is what keeps preview and device pixel-identical.
