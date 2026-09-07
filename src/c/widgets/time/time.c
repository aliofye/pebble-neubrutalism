// Time widget implementation. See widget.json for the policy.
#include "time.h"

// Shared time/date formatters. Resolved by -I in host tests; generate-app
// copies time_util.h next to the app sources so on-watch builds find it.
#include "time_util.h"

// Persist key. Allocated once per widget; collisions across widgets are
// rejected by the codegen validator. Value matches the reference face so
// upgrading faces keep their stored settings. Message keys come from the
// generated message_keys.auto.h (package.json order), never hardcoded here.
enum {
  PERSIST_KEY_TIME_FORMAT = 1,
};

static Layer *s_time_layer;
static char s_time_str[8];
static int s_display_hour;
static bool s_use_24_hour = true;

static void prv_recompute(const struct tm *t) {
  format_time((uint8_t)t->tm_hour, (uint8_t)t->tm_min, s_use_24_hour,
              s_time_str, sizeof(s_time_str));
  s_display_hour = s_use_24_hour
      ? t->tm_hour
      : (t->tm_hour % 12 == 0 ? 12 : t->tm_hour % 12);
}

static void prv_mark_dirty(void) {
  if (s_time_layer) {
    layer_mark_dirty(s_time_layer);
  }
}

static void prv_recompute_now(void) {
  const time_t now = time(NULL);
  const struct tm *t = localtime(&now);
  if (t) {
    prv_recompute(t);
  }
}

void time_widget_init(const PeFaceLayers *layers) {
  s_time_layer = layers ? layers->time : NULL;
  s_use_24_hour = persist_exists(PERSIST_KEY_TIME_FORMAT)
      ? persist_read_bool(PERSIST_KEY_TIME_FORMAT)
      : clock_is_24h_style();
  prv_recompute_now();
}

void time_widget_tick(struct tm *tick_time, TimeUnits units_changed) {
  (void)units_changed;
  if (!tick_time) {
    return;
  }
  char old_str[sizeof(s_time_str)];
  memcpy(old_str, s_time_str, sizeof(old_str));
  const int old_hour = s_display_hour;
  prv_recompute(tick_time);
  if (old_hour != s_display_hour || strcmp(old_str, s_time_str) != 0) {
    prv_mark_dirty();
  }
}

void time_widget_inbox(DictionaryIterator *iter) {
  Tuple *format_tuple = dict_find(iter, MESSAGE_KEY_TIME_FORMAT);
  if (format_tuple) {
    const bool h24 = format_tuple->value->int32 != 0;
    if (h24 != s_use_24_hour) {
      s_use_24_hour = h24;
      persist_write_bool(PERSIST_KEY_TIME_FORMAT, s_use_24_hour);
      prv_recompute_now();
      prv_mark_dirty();
    }
  }
}

void time_widget_sync(DictionaryIterator *out) {
  dict_write_uint8(out, MESSAGE_KEY_TIME_FORMAT, s_use_24_hour ? 1 : 0);
}

void time_widget_deinit(void) {
  s_time_layer = NULL;
}

const char *time_widget_text(void) {
  return s_time_str;
}

int time_widget_display_hour(void) {
  return s_display_hour;
}
