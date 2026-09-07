// Weather widget implementation. See widget.json for the policy.
#include "weather.h"

#include <stdio.h>

// Persist keys. Allocated once per widget; collisions across widgets are
// rejected by the codegen validator. Values match the reference face so
// upgrading faces keep their stored settings. Message keys come from the
// generated message_keys.auto.h, never hardcoded here.
enum {
  PERSIST_KEY_WEATHER_UNITS = 5,
  PERSIST_KEY_WEATHER_TEMP = 6,
  PERSIST_KEY_WEATHER_ENABLED = 7,
  PERSIST_KEY_WEATHER_CODE = 9,
};

static Layer *s_background_layer;
static TextLayer *s_weather_text_layer;
static char s_text[8];
static int s_temp;
static int s_code;
static uint8_t s_units = WEATHER_UNITS_F;
static bool s_available;
static bool s_enabled = true;

void weather_widget_format(int temp, bool celsius, bool available,
                           char *out, size_t outlen) {
  const char unit = celsius ? 'C' : 'F';
  if (available) {
    snprintf(out, outlen, "%d°%c", temp, unit);
  } else {
    snprintf(out, outlen, "--°%c", unit);
  }
}

static void prv_refresh_text(void) {
  weather_widget_format(s_temp, s_units == WEATHER_UNITS_C, s_available,
                        s_text, sizeof(s_text));
  if (s_weather_text_layer) {
    text_layer_set_text(s_weather_text_layer, s_text);
  }
}

void weather_widget_init(const PeFaceLayers *layers) {
  s_background_layer = layers ? layers->background : NULL;
  s_weather_text_layer = layers ? layers->weather : NULL;
  if (persist_exists(PERSIST_KEY_WEATHER_UNITS)) {
    const int units = (int)persist_read_int(PERSIST_KEY_WEATHER_UNITS);
    s_units = (units == WEATHER_UNITS_F || units == WEATHER_UNITS_C)
        ? (uint8_t)units
        : WEATHER_UNITS_F;
  }
  if (persist_exists(PERSIST_KEY_WEATHER_TEMP)) {
    s_temp = (int)persist_read_int(PERSIST_KEY_WEATHER_TEMP);
    s_available = true;
  }
  if (persist_exists(PERSIST_KEY_WEATHER_CODE)) {
    s_code = (int)persist_read_int(PERSIST_KEY_WEATHER_CODE);
  }
  if (persist_exists(PERSIST_KEY_WEATHER_ENABLED)) {
    s_enabled = persist_read_bool(PERSIST_KEY_WEATHER_ENABLED);
  }
  prv_refresh_text();
}

void weather_widget_tick(struct tm *tick_time, TimeUnits units_changed) {
  (void)tick_time;
  (void)units_changed;
}

void weather_widget_inbox(DictionaryIterator *iter) {
  Tuple *units_tuple = dict_find(iter, MESSAGE_KEY_WEATHER_UNITS);
  if (units_tuple) {
    const uint8_t units = (uint8_t)units_tuple->value->int32;
    if ((units == WEATHER_UNITS_F || units == WEATHER_UNITS_C) && units != s_units) {
      s_units = units;
      persist_write_int(PERSIST_KEY_WEATHER_UNITS, s_units);
      prv_refresh_text();
    }
  }

  Tuple *enabled_tuple = dict_find(iter, MESSAGE_KEY_WEATHER_ENABLED);
  if (enabled_tuple) {
    const bool enabled = enabled_tuple->value->int32 != 0;
    if (enabled != s_enabled) {
      s_enabled = enabled;
      persist_write_bool(PERSIST_KEY_WEATHER_ENABLED, s_enabled);
      if (s_background_layer) {
        layer_mark_dirty(s_background_layer);
      }
    }
  }

  Tuple *temp_tuple = dict_find(iter, MESSAGE_KEY_WEATHER_TEMP);
  if (temp_tuple) {
    const int temp = (int)temp_tuple->value->int32;
    const bool changed = temp != s_temp;
    s_temp = temp;
    s_available = true;
    if (changed) {
      persist_write_int(PERSIST_KEY_WEATHER_TEMP, s_temp);
    }
    prv_refresh_text();
  }

  Tuple *code_tuple = dict_find(iter, MESSAGE_KEY_WEATHER_CODE);
  if (code_tuple) {
    const int code = (int)code_tuple->value->int32;
    if (code != s_code) {
      s_code = code;
      persist_write_int(PERSIST_KEY_WEATHER_CODE, s_code);
      if (s_background_layer) {
        layer_mark_dirty(s_background_layer);
      }
    }
  }
}

void weather_widget_sync(DictionaryIterator *out) {
  dict_write_uint8(out, MESSAGE_KEY_WEATHER_UNITS, s_units);
  dict_write_uint8(out, MESSAGE_KEY_WEATHER_ENABLED, s_enabled ? 1 : 0);
}

void weather_widget_deinit(void) {
  s_background_layer = NULL;
  s_weather_text_layer = NULL;
}

const char *weather_widget_text(void) {
  return s_text;
}

int weather_widget_code(void) {
  return s_code;
}

bool weather_widget_available(void) {
  return s_available;
}

bool weather_widget_enabled(void) {
  return s_enabled;
}
