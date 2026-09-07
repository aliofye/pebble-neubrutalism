// Date widget implementation. See widget.json for the policy.
#include "date.h"

// Shared time/date formatters. Resolved by -I in host tests; generate-app
// copies time_util.h next to the app sources so on-watch builds find it.
#include "time_util.h"

static TextLayer *s_date_layer;
static char s_date_str[8];

static void prv_recompute(const struct tm *t) {
  format_date_upper(t, s_date_str, sizeof(s_date_str));
}

void date_widget_init(const PeFaceLayers *layers) {
  s_date_layer = layers ? layers->date : NULL;
  const time_t now = time(NULL);
  const struct tm *t = localtime(&now);
  if (t) {
    prv_recompute(t);
    if (s_date_layer) {
      text_layer_set_text(s_date_layer, s_date_str);
    }
  }
}

void date_widget_tick(struct tm *tick_time, TimeUnits units_changed) {
  (void)units_changed;
  if (!tick_time) {
    return;
  }
  char old_str[sizeof(s_date_str)];
  memcpy(old_str, s_date_str, sizeof(old_str));
  prv_recompute(tick_time);
  if (strcmp(old_str, s_date_str) != 0 && s_date_layer) {
    text_layer_set_text(s_date_layer, s_date_str);
  }
}

void date_widget_inbox(DictionaryIterator *iter) {
  (void)iter;
}

void date_widget_sync(DictionaryIterator *out) {
  (void)out;
}

void date_widget_deinit(void) {
  s_date_layer = NULL;
}

const char *date_widget_text(void) {
  return s_date_str;
}
