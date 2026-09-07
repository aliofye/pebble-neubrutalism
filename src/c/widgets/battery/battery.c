// Battery widget implementation. See widget.json for the policy.
#include "battery.h"

static Layer *s_bars_layer;
static int s_percent = 100;

static void prv_mark_dirty(void) {
  if (s_bars_layer) {
    layer_mark_dirty(s_bars_layer);
  }
}

static void prv_handler(BatteryChargeState state) {
  const int percent = (int)state.charge_percent;
  if (percent != s_percent) {
    s_percent = percent;
    prv_mark_dirty();
  }
}

void battery_widget_init(const PeFaceLayers *layers) {
  s_bars_layer = layers ? layers->bars : NULL;
  s_percent = (int)battery_state_service_peek().charge_percent;
  battery_state_service_subscribe(prv_handler);
}

void battery_widget_tick(struct tm *tick_time, TimeUnits units_changed) {
  (void)tick_time;
  (void)units_changed;
}

void battery_widget_inbox(DictionaryIterator *iter) {
  (void)iter;
}

void battery_widget_sync(DictionaryIterator *out) {
  (void)out;
}

void battery_widget_deinit(void) {
  battery_state_service_unsubscribe();
  s_bars_layer = NULL;
}

int battery_widget_percent(void) {
  return s_percent;
}
