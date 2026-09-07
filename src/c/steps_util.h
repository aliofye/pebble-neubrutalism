// Step-goal progress helpers. Pure C, no Pebble SDK types, so the module
// compiles on the host for unit tests (scripts/test-c.sh) and on-watch.
#pragma once
#include <stdint.h>

// Upper clamp for step_goal_percent: keeps absurd counts drawable.
#define STEP_PERCENT_MAX 999

// Uncapped step-goal percent (0..STEP_PERCENT_MAX). Values over 100 are
// overflow: the bar fill clamps at full, the overwrite reads the remainder.
int step_goal_percent(int32_t steps, int32_t goal);

// Width in pixels of the overflow overwrite region inside a fill of
// fill_width pixels: 0 at/below goal, growing 100->200% across the fill,
// clamped at full width beyond. Integer math rounds down.
int overflow_overwrite_width(int fill_width, int percent);
