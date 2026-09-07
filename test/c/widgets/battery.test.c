// Host test for the battery widget: event-driven updates, dirty-on-change.
#include <stdio.h>

#include <pebble.h>

#include "battery.h"

static int failures = 0;

static void check(const char *what, int cond) {
  if (!cond) {
    printf("FAIL: %s\n", what);
    failures++;
  }
}

int main(void) {
  Layer bars;
  fake_layer_reset(&bars);

  fake_battery_inject(100);
  PeFaceLayers layers;
  memset(&layers, 0, sizeof(layers));
  layers.bars = &bars;
  battery_widget_init(&layers);
  check("init peeks current percent", battery_widget_percent() == 100);
  check("init does not dirty", fake_layer_dirty_count(&bars) == 0);

  fake_battery_inject(99);
  check("event updates percent", battery_widget_percent() == 99);
  check("change dirties once", fake_layer_dirty_count(&bars) == 1);

  fake_battery_inject(99);
  check("same value does not dirty again", fake_layer_dirty_count(&bars) == 1);

  battery_widget_deinit();
  fake_battery_inject(50);
  check("deinit unsubscribes", battery_widget_percent() == 99);
  check("deinit does not dirty", fake_layer_dirty_count(&bars) == 1);

  if (failures == 0) {
    printf("battery widget ok\n");
  }
  return failures != 0;
}
