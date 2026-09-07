// Time widget: minute-tick clock state plus the 24-hour setting.
// Policy: no timer of its own (rides the shared minute tick), formats from
// the tick time, dirties the time layer solely when the visible time
// changes. The 24h flag persists and syncs with the phone Clay page.
#pragma once

#include <pebble.h>

#include "../pe_layers.h"

void time_widget_init(const PeFaceLayers *layers);
void time_widget_tick(struct tm *tick_time, TimeUnits units_changed);
void time_widget_inbox(DictionaryIterator *iter);
void time_widget_sync(DictionaryIterator *out);
void time_widget_deinit(void);

const char *time_widget_text(void);
int time_widget_display_hour(void);
