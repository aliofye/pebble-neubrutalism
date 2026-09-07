// Host test for the steps widget: pure progress math, tick polling with
// dirty-on-change, goal validation + persist, inbox + sync.
#include <stdio.h>

#include <pebble.h>

#include "steps.h"

static int failures = 0;

static void check(const char *what, int cond) {
  if (!cond) {
    printf("FAIL: %s\n", what);
    failures++;
  }
}

int main(void) {
  check("zero steps is 0%", steps_widget_calc_percent(0, 10000) == 0);
  check("negative steps is 0%", steps_widget_calc_percent(-5, 10000) == 0);
  check("half goal is 50%", steps_widget_calc_percent(5000, 10000) == 50);
  check("over goal clamps to 100%", steps_widget_calc_percent(25000, 10000) == 100);
  check("exact goal is 100%", steps_widget_calc_percent(10000, 10000) == 100);
  check("zero goal is 0%", steps_widget_calc_percent(5000, 0) == 0);

  Layer bars;
  DictionaryIterator inbox;
  DictionaryIterator outbox;
  fake_layer_reset(&bars);
  fake_persist_reset();
  fake_health_set_steps(2500);

  PeFaceLayers layers;
  memset(&layers, 0, sizeof(layers));
  layers.bars = &bars;
  steps_widget_init(&layers);
  check("default goal", steps_widget_goal() == 10000);
  check("init polls percent", steps_widget_percent() == 25);

  fake_layer_reset(&bars);
  fake_health_set_steps(2500);
  steps_widget_tick(NULL, MINUTE_UNIT);
  check("unchanged steps do not dirty", fake_layer_dirty_count(&bars) == 0);

  fake_health_set_steps(5000);
  steps_widget_tick(NULL, MINUTE_UNIT);
  check("changed steps update + dirty once", steps_widget_percent() == 50 &&
        fake_layer_dirty_count(&bars) == 1);

  fake_dict_reset(&inbox);
  fake_dict_reset(&outbox);
  inbox.slots[0].used = true;
  inbox.slots[0].key = MESSAGE_KEY_DAILY_STEP_GOAL;
  inbox.slots[0].i32 = 20000;
  steps_widget_inbox(&inbox);
  check("inbox applies valid goal", steps_widget_goal() == 20000);
  check("goal persists", persist_read_int(4) == 20000);
  check("percent recomputes on goal change", steps_widget_percent() == 25);

  inbox.slots[0].i32 = 50;
  steps_widget_inbox(&inbox);
  check("inbox rejects out-of-range goal", steps_widget_goal() == 20000);

  steps_widget_sync(&outbox);
  {
    bool found = false;
    check("sync writes goal", fake_dict_get(&outbox, MESSAGE_KEY_DAILY_STEP_GOAL, &found) == 20000 && found);
  }

  steps_widget_deinit();
  fake_health_set_steps(9000);
  steps_widget_tick(NULL, MINUTE_UNIT);
  check("tick after deinit still polls (no layer to dirty is safe)",
        steps_widget_percent() == 45 && fake_layer_dirty_count(&bars) == 2);

  if (failures == 0) {
    printf("steps widget ok\n");
  }
  return failures != 0;
}
