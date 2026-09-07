// Host-side test for steps_util.step_goal_percent / overflow_flame_tier.
// Compiles without the Pebble SDK (only libc): run via scripts/test-c.sh.
#include <stdint.h>
#include <stdio.h>
#include "steps_util.h"

static int failures = 0;

static void check(const char *what, int cond) {
  if (!cond) { printf("FAIL: %s\n", what); failures++; }
}

int main(void) {
  check("zero steps is zero percent", step_goal_percent(0, 10000) == 0);
  check("negative steps clamp to zero", step_goal_percent(-5, 10000) == 0);
  check("half goal is 50 percent", step_goal_percent(5000, 10000) == 50);
  check("exact goal is 100 percent", step_goal_percent(10000, 10000) == 100);

  // Overflow must survive: the bar clamps the fill, the flame reads the rest.
  check("over goal is not capped at 100", step_goal_percent(12500, 10000) == 125);
  check("double goal is 200 percent", step_goal_percent(20000, 10000) == 200);
  check("huge counts clamp instead of overflowing",
        step_goal_percent(INT32_MAX, 1000) == STEP_PERCENT_MAX);

  check("non-positive goal is zero percent", step_goal_percent(5000, 0) == 0);

  check("at goal there is no overwrite", overflow_overwrite_width(100, 100) == 0);
  check("below goal there is no overwrite", overflow_overwrite_width(100, 42) == 0);
  check("125 percent overwrites a quarter", overflow_overwrite_width(100, 125) == 25);
  check("150 percent overwrites half", overflow_overwrite_width(120, 150) == 60);
  check("200 percent overwrites everything", overflow_overwrite_width(100, 200) == 100);
  check("past 200 percent clamps to full", overflow_overwrite_width(100, 350) == 100);

  if (failures) { printf("%d FAILURE(S)\n", failures); return 1; }
  printf("steps_util: all ok\n");
  return 0;
}
