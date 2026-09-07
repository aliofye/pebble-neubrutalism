// Weather widget: temperature bubble state fed by the phone.
// Policy: no on-watch timers or polling. Phone pushes temp/code via
// AppMessage; the watch persists each value solely on change, reformats the
// bubble text on temp/units change, and dirties exactly the affected layer.
#pragma once

#include <pebble.h>

#include "../pe_layers.h"

#define WEATHER_UNITS_F 0
#define WEATHER_UNITS_C 1

void weather_widget_init(const PeFaceLayers *layers);
void weather_widget_tick(struct tm *tick_time, TimeUnits units_changed);
void weather_widget_inbox(DictionaryIterator *iter);
void weather_widget_sync(DictionaryIterator *out);
void weather_widget_deinit(void);

const char *weather_widget_text(void);
int weather_widget_code(void);
bool weather_widget_available(void);
bool weather_widget_enabled(void);

// Pure bubble text formatting, host-testable.
// out must hold at least 8 bytes.
void weather_widget_format(int temp_c_or_f, bool celsius, bool available,
                           char *out, size_t outlen);
