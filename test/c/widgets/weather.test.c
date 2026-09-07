// Host test for the weather widget: pure formatting, persist round-trip,
// inbox application with dirty scoping, sync payload.
#include <stdio.h>
#include <string.h>

#include <pebble.h>

#include "weather.h"

static int failures = 0;

static void check(const char *what, int cond) {
  if (!cond) {
    printf("FAIL: %s\n", what);
    failures++;
  }
}

static void inbox_int(DictionaryIterator *iter, uint32_t key, int32_t value) {
  fake_dict_reset(iter);
  iter->slots[0].used = true;
  iter->slots[0].key = key;
  iter->slots[0].i32 = value;
}

int main(void) {
  char buf[8];

  weather_widget_format(21, false, true, buf, sizeof(buf));
  check("formats F", strcmp(buf, "21°F") == 0);
  weather_widget_format(-3, true, true, buf, sizeof(buf));
  check("formats negative C", strcmp(buf, "-3°C") == 0);
  weather_widget_format(0, false, false, buf, sizeof(buf));
  check("unavailable placeholder keeps units", strcmp(buf, "--°F") == 0);

  Layer background;
  TextLayer weather_text;
  DictionaryIterator inbox;
  DictionaryIterator outbox;
  fake_layer_reset(&background);
  fake_layer_reset(&weather_text);
  fake_persist_reset();

  PeFaceLayers layers;
  memset(&layers, 0, sizeof(layers));
  layers.background = &background;
  layers.weather = &weather_text;

  weather_widget_init(&layers);
  check("defaults: F, disabled reading, enabled bubble",
        strcmp(weather_widget_text(), "--°F") == 0 &&
        !weather_widget_available() && weather_widget_enabled());
  check("init pushes placeholder to text layer",
        strcmp(weather_text.text, "--°F") == 0);

  inbox_int(&inbox, MESSAGE_KEY_WEATHER_TEMP, 18);
  weather_widget_inbox(&inbox);
  check("temp arrives + formats", strcmp(weather_widget_text(), "18°F") == 0 &&
        weather_widget_available());
  check("temp persists on change", persist_read_int(6) == 18);

  fake_layer_reset(&background);
  inbox_int(&inbox, MESSAGE_KEY_WEATHER_TEMP, 18);
  weather_widget_inbox(&inbox);
  check("same temp still reformats text", strcmp(weather_text.text, "18°F") == 0);

  fake_layer_reset(&background);
  inbox_int(&inbox, MESSAGE_KEY_WEATHER_CODE, 3);
  weather_widget_inbox(&inbox);
  check("code applies + persists", weather_widget_code() == 3 && persist_read_int(9) == 3);
  check("code change dirties background", fake_layer_dirty_count(&background) == 1);

  fake_layer_reset(&background);
  inbox_int(&inbox, MESSAGE_KEY_WEATHER_CODE, 3);
  weather_widget_inbox(&inbox);
  check("same code does not dirty", fake_layer_dirty_count(&background) == 0);

  inbox_int(&inbox, MESSAGE_KEY_WEATHER_UNITS, 1);
  weather_widget_inbox(&inbox);
  check("units switch reformats", strcmp(weather_widget_text(), "18°C") == 0);

  inbox_int(&inbox, MESSAGE_KEY_WEATHER_UNITS, 9);
  weather_widget_inbox(&inbox);
  check("bogus units rejected", strcmp(weather_widget_text(), "18°C") == 0);

  inbox_int(&inbox, MESSAGE_KEY_WEATHER_ENABLED, 0);
  weather_widget_inbox(&inbox);
  check("disable applies + persists", !weather_widget_enabled() && persist_read_bool(7) == false);
  check("disable dirties background", fake_layer_dirty_count(&background) == 1);

  fake_dict_reset(&outbox);
  weather_widget_sync(&outbox);
  {
    bool found = false;
    check("sync writes units", fake_dict_get(&outbox, MESSAGE_KEY_WEATHER_UNITS, &found) == 1 && found);
    check("sync writes enabled", fake_dict_get(&outbox, MESSAGE_KEY_WEATHER_ENABLED, &found) == 0 && found);
  }

  weather_widget_deinit();
  inbox_int(&inbox, MESSAGE_KEY_WEATHER_CODE, 95);
  weather_widget_inbox(&inbox);
  check("inbox after deinit is safe (no layer to dirty)", weather_widget_code() == 95);

  if (failures == 0) {
    printf("weather widget ok\n");
  }
  return failures != 0;
}
