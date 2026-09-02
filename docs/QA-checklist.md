# On-device QA checklist

The C watch code can't be unit-tested off-device, so verify these by hand on the
emulator and/or a real watch after any watch-side change.

## Clock
- [ ] Time renders in the pixel-style Jersey font inside the orange block; the thick
      black outline and the polygon accent look right on the platform you're testing.
- [ ] Switching the 12/24-hour setting in the phone app updates the time format on
      the next sync (no stale value left behind).
- [ ] The date updates at midnight, and the day/month flip independently.

## Bottom progress bar
- [ ] **Battery** mode: the lavender bar fills proportionally to battery level, and
      the bar reads clearly at 100%, mid, and low.
- [ ] **Daily steps** mode: progress = steps / step target; with steps above the
      target the bar stays full (not overflowing the frame).
- [ ] Switching the metric from the phone app updates the watch on the next sync.
- [ ] Changing the daily step target re-scales the bar; an out-of-range target sent
      from the phone is clamped (min 1,000 / max 100,000).

## Color themes
- [ ] Each theme (Neubrutalism, Game Boy Green, Ocean Blue, Amber LCD, Monochrome,
      Purple Pixel) renders with no black-on-black or white-on-white anywhere: clock,
      frame, polygon accent, and bar.
- [ ] Switching theme while the watchface is showing updates immediately on sync.

## Platforms
- [ ] Run on both a 200px (emery) and a 144px (basalt/aplite/diorite/flint) display:
      the time, date, outline, and bar are all positioned and sized correctly, with
      nothing clipped.

## Battery & wakeup
- [ ] The watchface wakes on the minute tick without draining battery noticeably.