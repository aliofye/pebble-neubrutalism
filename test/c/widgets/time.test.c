// Host test for the time widget: tick formatting (24h/12h), display_hour,
// dirty-on-change, 24h inbox + persist, sync, deinit safety.
#include <stdio.h>
#include <string.h>

#include <pebble.h>

#include "time.h"

static int failures = 0;

static void check(const char *what, int cond) {
  if (!cond) {
    printf("FAIL: %s\n", what);
    failures++;
  }
}

static void make_tm(struct tm *t, int hour, int min) {
  memset(t, 0, sizeof(*t));
  t->tm_hour = hour;
  t->tm_min = min;
}

int main(void) {
  Layer time_layer;
  DictionaryIterator inbox;
  DictionaryIterator outbox;
  struct tm t;
  PeFaceLayers layers;

  fake_persist_reset();
  fake_clock_set_24h(true);
  fake_layer_reset(&time_layer);
  memset(&layers, 0, sizeof(layers));
  layers.time = &time_layer;
  time_widget_init(&layers);

  make_tm(&t, 17, 26);
  time_widget_tick(&t, MINUTE_UNIT);
  check("24h formats 17:26", strcmp(time_widget_text(), "17:26") == 0);
  check("24h display hour is 17", time_widget_display_hour() == 17);
  check("changed time dirties once", fake_layer_dirty_count(&time_layer) == 1);

  time_widget_tick(&t, MINUTE_UNIT);
  check("same minute does not dirty", fake_layer_dirty_count(&time_layer) == 1);

  make_tm(&t, 17, 27);
  time_widget_tick(&t, MINUTE_UNIT);
  check("new minute updates + dirties", strcmp(time_widget_text(), "17:27") == 0 &&
        fake_layer_dirty_count(&time_layer) == 2);

  make_tm(&t, 5, 5);
  time_widget_tick(&t, MINUTE_UNIT);
  check("single-digit hour renders H:MM", strcmp(time_widget_text(), "5:05") == 0);

  time_widget_tick(NULL, MINUTE_UNIT);
  check("null tick is safe", strcmp(time_widget_text(), "5:05") == 0 &&
        fake_layer_dirty_count(&time_layer) == 3);

  fake_dict_reset(&inbox);
  inbox.slots[0].used = true;
  inbox.slots[0].key = MESSAGE_KEY_TIME_FORMAT;
  inbox.slots[0].i32 = 0;
  time_widget_inbox(&inbox);
  check("12h flag persists", persist_exists(1) && persist_read_bool(1) == false);

  make_tm(&t, 17, 26);
  time_widget_tick(&t, MINUTE_UNIT);
  check("12h converts 17 to 5", strcmp(time_widget_text(), "5:26") == 0 &&
        time_widget_display_hour() == 5);

  make_tm(&t, 0, 5);
  time_widget_tick(&t, MINUTE_UNIT);
  check("12h midnight maps to 12", strcmp(time_widget_text(), "12:05") == 0 &&
        time_widget_display_hour() == 12);

  fake_dict_reset(&outbox);
  time_widget_sync(&outbox);
  {
    bool found = false;
    check("sync writes 12h flag", fake_dict_get(&outbox, MESSAGE_KEY_TIME_FORMAT, &found) == 0 && found);
  }

  time_widget_deinit();
  make_tm(&t, 9, 41);
  time_widget_tick(&t, MINUTE_UNIT);
  check("tick after deinit recomputes without dirtying",
        strcmp(time_widget_text(), "9:41") == 0);

  // Persisted flag wins over the system 24h style on next init.
  fake_clock_set_24h(true);
  time_widget_init(&layers);
  make_tm(&t, 17, 26);
  time_widget_tick(&t, MINUTE_UNIT);
  check("persisted 12h survives reinit", strcmp(time_widget_text(), "5:26") == 0);
  time_widget_deinit();

  if (failures == 0) {
    printf("time widget ok\n");
  }
  return failures != 0;
}
