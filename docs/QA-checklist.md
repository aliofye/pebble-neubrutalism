# On-device QA checklist

The C watch code can't be unit-tested off-device, so verify these by hand on the
emulator and/or a real watch after any watch-side change.

## Clock
- [ ] Time renders in the pixel-style Jersey font inside the orange block; the thick
      black outline and the polygon accent look right on the platform you're testing.
- [ ] Switching the 12/24-hour setting in the phone app updates the time format on
      the next sync (no stale value left behind).
- [ ] The date updates at midnight, and the day/month flip independently.

## Progress bars
- [ ] With **Show = Battery & Steps**, the battery bar (top) and steps bar (bottom)
      render as two stacked bars.
- [ ] With **Show = Battery Only** or **Steps Only**, a single full-height bar is
      vertically centered in the space below the time box.
- [ ] The **battery** bar fills proportionally to battery level; in the
      neubrutalism theme it reads green (>= 50%), yellow (20-49%), and red (< 20%),
      and the bar is clear at 100%, mid, and low.
- [ ] The **daily steps** bar (bottom) fills white; progress = steps / step target,
      and with steps above the target the bar stays full (not overflowing).
- [ ] Changing the daily step target re-scales the bar; an out-of-range target sent
      from the phone is clamped (min 1,000 / max 100,000).

## Weather
- [ ] The weather bubble (left of the time box) shows the current temperature from
      the phone companion and updates on app launch; shows `--°F`/`--°C` before the
      first sync.
- [ ] In the neubrutalism theme the bubble fill follows the condition: yellow
      (clear), gray (partly cloudy/overcast/fog), light blue (drizzle/rain),
      vivid violet (thunder); snow and unknown stay white. Other themes keep a
      white bubble.
- [ ] Switching temperature units (F/C) in the phone app refetches and redraws the
      bubble with the new unit.
- [ ] On a real phone: location permission is granted and the temperature is
      reasonably current (hourly refresh).
- [ ] Turning **Show Weather** off hides the white bubble entirely and stops
      background location/weather requests; turning it back on restores the bubble
      and resumes the hourly refresh.

## Color themes
- [ ] Each theme (Neubrutalism, Game Boy Green, Ocean Blue, Amber LCD, Monochrome,
      Purple Pixel) renders with no black-on-black or white-on-white anywhere: clock,
      frame, polygon accent, and bars.
- [ ] Switching theme while the watchface is showing updates immediately on sync.

## Platforms
- [ ] Run on both a 200px (emery) and a 144px (basalt/aplite/diorite/flint) display:
      the time, date, bubbles, and bars are all positioned and sized correctly, with
      nothing clipped.

## Battery & wakeup
- [ ] The watchface wakes on the minute tick without draining battery noticeably.