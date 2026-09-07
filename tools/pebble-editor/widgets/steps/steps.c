// Steps widget implementation. See widget.json for the policy.
#include "steps.h"

// Persist key. Allocated once per widget; collisions across widgets are
// rejected by the codegen validator. Value matches the reference face so
// upgrading faces keep their stored settings. Message keys come from the
// generated message_keys.auto.h (package.json order), never hardcoded here.
enum {
  PERSIST_KEY_DAILY_STEP_GOAL = 4,
};

static Layer *s_bars_layer;
static int s_percent;
static int32_t s_goal = STEPS_GOAL_DEFAULT;

int steps_widget_calc_percent(int32_t steps, int32_t goal) {
  if (goal <= 0) {
    return 0;
  }
  if (steps <= 0) {
    return 0;
  }
  if (steps >= goal) {
    return 100;
  }
  return (int)((steps * 100) / goal);
}

static void prv_mark_dirty(void) {
  if (s_bars_layer) {
    layer_mark_dirty(s_bars_layer);
  }
}

static void prv_poll(void) {
  int progress = 0;
#if defined(PBL_HEALTH)
  progress = steps_widget_calc_percent(health_service_sum_today(HealthMetricStepCount), s_goal);
#endif
  if (progress != s_percent) {
    s_percent = progress;
    prv_mark_dirty();
  }
}

void steps_widget_init(const PeFaceLayers *layers) {
  s_bars_layer = layers ? layers->bars : NULL;
  s_goal = persist_exists(PERSIST_KEY_DAILY_STEP_GOAL)
      ? persist_read_int(PERSIST_KEY_DAILY_STEP_GOAL)
      : STEPS_GOAL_DEFAULT;
  if (s_goal < STEPS_GOAL_MIN || s_goal > STEPS_GOAL_MAX) {
    s_goal = STEPS_GOAL_DEFAULT;
  }
  s_percent = 0;
  prv_poll();
}

void steps_widget_tick(struct tm *tick_time, TimeUnits units_changed) {
  (void)tick_time;
  (void)units_changed;
  prv_poll();
}

void steps_widget_inbox(DictionaryIterator *iter) {
  Tuple *goal_tuple = dict_find(iter, MESSAGE_KEY_DAILY_STEP_GOAL);
  if (goal_tuple) {
    const int32_t goal = goal_tuple->value->int32;
    if (goal >= STEPS_GOAL_MIN && goal <= STEPS_GOAL_MAX && goal != s_goal) {
      s_goal = goal;
      persist_write_int(PERSIST_KEY_DAILY_STEP_GOAL, s_goal);
      prv_poll();
    }
  }
}

void steps_widget_sync(DictionaryIterator *out) {
  dict_write_int32(out, MESSAGE_KEY_DAILY_STEP_GOAL, s_goal);
}

void steps_widget_deinit(void) {
  s_bars_layer = NULL;
}

int steps_widget_percent(void) {
  return s_percent;
}

int32_t steps_widget_goal(void) {
  return s_goal;
}
