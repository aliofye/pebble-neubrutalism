// Host test for the date widget: init primes the tab, ticks update the
// TextLayer solely on date change, inbox/sync are inert, deinit is safe.
#include <stdio.h>
#include <string.h>

#include <pebble.h>

#include "date.h"

static int failures = 0;

static void check(const char *what, int cond) {
  if (!cond) {
    printf("FAIL: %s\n", what);
    failures++;
  }
}

static void make_date(struct tm *t, int mon, int mday) {
  memset(t, 0, sizeof(*t));
  t->tm_mon = mon;
  t->tm_mday = mday;
}

int main(void) {
  TextLayer date_layer;
  DictionaryIterator inbox;
  DictionaryIterator outbox;
  struct tm t;
  PeFaceLayers layers;

  fake_layer_reset(&date_layer);
  memset(date_layer.text, 0, sizeof(date_layer.text));
  memset(&layers, 0, sizeof(layers));
  layers.date = &date_layer;
  date_widget_init(&layers);
  check("init primes a non-empty date", date_widget_text()[0] != '\0');
  check("init writes the tab", strcmp(date_layer.text, date_widget_text()) == 0);

  make_date(&t, 8, 5);
  date_widget_tick(&t, MINUTE_UNIT);
  check("Sep 5 formats SEP 05", strcmp(date_widget_text(), "SEP 05") == 0);
  check("tab follows the tick", strcmp(date_layer.text, "SEP 05") == 0);

  date_widget_tick(&t, MINUTE_UNIT);
  check("same date keeps text", strcmp(date_layer.text, "SEP 05") == 0);

  make_date(&t, 8, 6);
  date_widget_tick(&t, MINUTE_UNIT);
  check("new date updates tab", strcmp(date_widget_text(), "SEP 06") == 0 &&
        strcmp(date_layer.text, "SEP 06") == 0);

  date_widget_tick(NULL, MINUTE_UNIT);
  check("null tick is safe", strcmp(date_widget_text(), "SEP 06") == 0);

  fake_dict_reset(&inbox);
  fake_dict_reset(&outbox);
  date_widget_inbox(&inbox);
  date_widget_sync(&outbox);
  check("inbox/sync send nothing", fake_dict_get(&outbox, MESSAGE_KEY_TIME_FORMAT, NULL) == 0);

  date_widget_deinit();
  make_date(&t, 0, 1);
  date_widget_tick(&t, MINUTE_UNIT);
  check("tick after deinit recomputes without touching the tab",
        strcmp(date_widget_text(), "JAN 01") == 0 && strcmp(date_layer.text, "SEP 06") == 0);

  if (failures == 0) {
    printf("date widget ok\n");
  }
  return failures != 0;
}
