// Battery widget: event-driven battery percent state.
// Policy: peek once at init, then update on battery service events only.
// The bars layer is dirtied solely when the percent value changes.
#pragma once

#include <pebble.h>

#include "../pe_layers.h"

void battery_widget_init(const PeFaceLayers *layers);
void battery_widget_tick(struct tm *tick_time, TimeUnits units_changed);
void battery_widget_inbox(DictionaryIterator *iter);
void battery_widget_sync(DictionaryIterator *out);
void battery_widget_deinit(void);

int battery_widget_percent(void);
