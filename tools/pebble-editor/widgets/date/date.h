// Date widget: date-line state for the face's date tab.
// Policy: formats from the shared minute tick, writes the date TextLayer
// solely when the formatted date changes (text_layer_set_text would mark
// dirty unconditionally). No settings, no timers, no phone traffic.
#pragma once

#include <pebble.h>

#include "../pe_layers.h"

void date_widget_init(const PeFaceLayers *layers);
void date_widget_tick(struct tm *tick_time, TimeUnits units_changed);
void date_widget_inbox(DictionaryIterator *iter);
void date_widget_sync(DictionaryIterator *out);
void date_widget_deinit(void);

const char *date_widget_text(void);
