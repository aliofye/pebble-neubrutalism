// Steps widget: daily step-goal progress.
// Policy: poll the cached health counter on the shared minute tick; dirty
// the bars layer solely on percent change. No health event subscription.
#pragma once

#include <pebble.h>

#include "../pe_layers.h"

#define STEPS_GOAL_DEFAULT 10000
#define STEPS_GOAL_MIN 1000
#define STEPS_GOAL_MAX 100000

void steps_widget_init(const PeFaceLayers *layers);
void steps_widget_tick(struct tm *tick_time, TimeUnits units_changed);
void steps_widget_inbox(DictionaryIterator *iter);
void steps_widget_sync(DictionaryIterator *out);
void steps_widget_deinit(void);

int steps_widget_percent(void);
int32_t steps_widget_goal(void);

// Pure progress math, host-testable.
int steps_widget_calc_percent(int32_t steps, int32_t goal);
