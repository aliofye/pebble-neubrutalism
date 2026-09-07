#include "steps_util.h"

int step_goal_percent(int32_t steps, int32_t goal) {
  if (steps <= 0 || goal <= 0) {
    return 0;
  }
  const int64_t percent = ((int64_t)steps * 100) / goal;
  return percent > STEP_PERCENT_MAX ? STEP_PERCENT_MAX : (int)percent;
}

int overflow_overwrite_width(int fill_width, int percent) {
  if (fill_width <= 0 || percent <= 100) {
    return 0;
  }
  if (percent >= 200) {
    return fill_width;
  }
  return (fill_width * (percent - 100)) / 100;
}
