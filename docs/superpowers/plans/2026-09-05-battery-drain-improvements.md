# Battery Drain Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut watchface battery drain on both the watch (C) and phone (JS) sides without any visual change.

**Architecture:** Four independent changes: (1) reduce JS weather fetch frequency and GPS cache strictness, (2) replace per-movement health-event wakeups with per-minute polling, (3) use the tick's `tm` and skip redundant persist writes, (4) split the single full-screen canvas into three dirty-tracked layers (static chrome / bars / time digits).

**Tech Stack:** Pebble SDK 3 (C), PebbleKit JS + Clay, Jest.

**Spec:** Investigation findings from 2026-09-05 session: hourly GPS + weather fetch drain the phone battery (src/pkjs/index.js); full-window canvas redraw every minute, per-movement health wakeups, and redundant persist writes drain the watch (src/c/neubrutalism.c).

## Global Constraints

- Target platforms: aplite, basalt, diorite, emery, flint (no chalk — unchanged).
- Visual output must remain **pixel-identical** on 200px and 144px platforms (verify via `pebble screenshot`).
- No new dependencies. No behavior changes beyond update frequency.
- Verify after each task: `pebble build`; JS task: `npm test`.

---

### Task 1: JS weather/GPS tuning

**Files:**
- Modify: `src/pkjs/index.js`
- Test: `test/index.test.js`
- Modify: `docs/QA-checklist.md`

- [ ] **Step 1: Add failing tests** to `test/index.test.js`:

```js
it('schedules weather fetches every 3 hours', () => {
  fire('appmessage', { payload: { WEATHER_ENABLED: 0 } }); // stop any timer
  const spy = jest.spyOn(global, 'setInterval');
  fire('appmessage', { payload: { WEATHER_ENABLED: 1 } });
  expect(spy).toHaveBeenCalledWith(expect.any(Function), 3 * 60 * 60 * 1000);
  spy.mockRestore();
});

it('accepts a 30 minute old cached location', () => {
  const getCurrentPosition = jest.fn((success, error) => error({}));
  global.navigator = { geolocation: { getCurrentPosition } };
  fire('appmessage', { payload: { WEATHER_ENABLED: 0 } });
  fire('appmessage', { payload: { WEATHER_ENABLED: 1 } }); // triggers immediate fetch
  expect(getCurrentPosition).toHaveBeenCalledWith(
    expect.any(Function), expect.any(Function),
    { timeout: 15000, maximumAge: 30 * 60 * 1000 }
  );
});
```

- [ ] **Step 2:** `npm test` → both new tests FAIL.
- [ ] **Step 3:** In `src/pkjs/index.js`, add constants and use them (interval 3h, maximumAge 30min).
- [ ] **Step 4:** `npm test` → all PASS. Update QA-checklist "hourly refresh" wording.
- [ ] **Step 5:** Commit: `perf: fetch weather every 3h with 30min location cache`

### Task 2: Throttle health updates (C)

**Files:**
- Modify: `src/c/neubrutalism.c`

- [ ] **Step 1:** Delete `prv_health_handler`; poll steps in `prv_tick_handler`.
- [ ] **Step 2:** Remove health subscribe in `prv_init`, unsubscribe in `prv_deinit`.
- [ ] **Step 3:** `pebble build` → succeeds.
- [ ] **Step 4:** Commit: `perf: poll step progress on minute tick instead of health events`

### Task 3: Minor C items

**Files:**
- Modify: `src/c/neubrutalism.c`

- [ ] **Step 1:** `prv_update_time(struct tm *tick_time)` + `prv_update_time_now()` wrapper.
- [ ] **Step 2:** Gate weather temp/code persist writes on change.
- [ ] **Step 3:** `pebble build` → succeeds.
- [ ] **Step 4:** Commit: `perf: use tick tm and skip unchanged weather persist writes`

### Task 4: Split canvas into three layers

**Files:**
- Modify: `src/c/neubrutalism.c`

**Interfaces:** produces `s_background_layer`, `s_bars_layer`, `s_time_layer` + `prv_background_update_proc`, `prv_bars_update_proc`, `prv_time_update_proc`.

- [ ] **Step 1:** Replace `s_canvas_layer` with three layer statics + `s_screen_w`.
- [ ] **Step 2:** Split `prv_canvas_update` into background/time/bars update procs.
- [ ] **Step 3:** Create layers in `prv_window_load` with correct frames.
- [ ] **Step 4:** Retarget all `layer_mark_dirty` call sites.
- [ ] **Step 5:** Destroy all three layers in `prv_window_unload`.
- [ ] **Step 6:** `pebble build` → succeeds.
- [ ] **Step 7:** Screenshot verification on 200px (emery) + 144px (basalt) emulators vs `docs/screenshots/`.
- [ ] **Step 8:** Commit: `perf: split canvas into background/bars/time layers to cut per-minute redraw`

### Task 5: Final verification

- [ ] `pebble clean && pebble build`; `npm test`; screenshots on 200px + 144px; walk `docs/QA-checklist.md`.
