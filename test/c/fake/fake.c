// In-memory fakes backing test/c/fake/pebble.h. Host-only.
#include <pebble.h>

FakePersistSlot fake_persist_store[FAKE_PERSIST_SLOTS];

static FakePersistSlot *persist_slot(uint32_t key, bool create) {
  for (int i = 0; i < FAKE_PERSIST_SLOTS; i++) {
    if (fake_persist_store[i].used && fake_persist_store[i].key == key) {
      return &fake_persist_store[i];
    }
  }
  if (!create) {
    return NULL;
  }
  for (int i = 0; i < FAKE_PERSIST_SLOTS; i++) {
    if (!fake_persist_store[i].used) {
      fake_persist_store[i].used = true;
      fake_persist_store[i].key = key;
      return &fake_persist_store[i];
    }
  }
  return NULL;
}

bool persist_exists(uint32_t key) {
  return persist_slot(key, false) != NULL;
}

int32_t persist_read_int(uint32_t key) {
  FakePersistSlot *s = persist_slot(key, false);
  return s ? s->i32 : 0;
}

void persist_write_int(uint32_t key, int32_t value) {
  FakePersistSlot *s = persist_slot(key, true);
  if (s) {
    s->is_bool = false;
    s->i32 = value;
  }
}

bool persist_read_bool(uint32_t key) {
  FakePersistSlot *s = persist_slot(key, false);
  return s ? s->b : false;
}

void persist_write_bool(uint32_t key, bool value) {
  FakePersistSlot *s = persist_slot(key, true);
  if (s) {
    s->is_bool = true;
    s->b = value;
  }
}

void fake_persist_reset(void) {
  memset(fake_persist_store, 0, sizeof(fake_persist_store));
}

static bool s_fake_24h = true;

bool clock_is_24h_style(void) {
  return s_fake_24h;
}

void fake_clock_set_24h(bool h24) {
  s_fake_24h = h24;
}

static uint8_t s_fake_battery = 100;
static BatteryHandler s_battery_handler = NULL;

BatteryChargeState battery_state_service_peek(void) {
  BatteryChargeState s;
  s.charge_percent = s_fake_battery;
  s.is_charging = false;
  s.is_plugged = false;
  return s;
}

void battery_state_service_subscribe(BatteryHandler handler) {
  s_battery_handler = handler;
}

void battery_state_service_unsubscribe(void) {
  s_battery_handler = NULL;
}

void fake_battery_inject(uint8_t percent) {
  s_fake_battery = percent;
  if (s_battery_handler) {
    s_battery_handler(battery_state_service_peek());
  }
}

static HealthValue s_fake_steps = 0;

HealthValue health_service_sum_today(HealthMetric metric) {
  (void)metric;
  return s_fake_steps;
}

void fake_health_set_steps(HealthValue steps) {
  s_fake_steps = steps;
}

static bool s_fake_bt = true;
static void (*s_bt_handler)(bool) = NULL;

bool bluetooth_connection_service_peek(void) {
  return s_fake_bt;
}

void bluetooth_connection_service_subscribe(void (*handler)(bool connected)) {
  s_bt_handler = handler;
}

void bluetooth_connection_service_unsubscribe(void) {
  s_bt_handler = NULL;
}

void fake_bluetooth_set(bool connected) {
  s_fake_bt = connected;
  if (s_bt_handler) {
    s_bt_handler(connected);
  }
}

void layer_mark_dirty(Layer *layer) {
  if (layer) {
    layer->dirty_count++;
  }
}

void layer_set_hidden(Layer *layer, bool hidden) {
  if (layer) {
    layer->hidden = hidden;
  }
}

void text_layer_set_text(TextLayer *layer, const char *text) {
  if (layer && text) {
    strncpy(layer->text, text, sizeof(layer->text) - 1);
    layer->text[sizeof(layer->text) - 1] = '\0';
  }
}

int fake_layer_dirty_count(Layer *layer) {
  return layer ? layer->dirty_count : 0;
}

void fake_layer_reset(Layer *layer) {
  if (layer) {
    layer->dirty_count = 0;
    layer->hidden = false;
  }
}

#define FAKE_TUPLE_POOL 4

static Tuple s_tuple_pool[FAKE_TUPLE_POOL];
static int s_tuple_next = 0;

Tuple *dict_find(DictionaryIterator *iter, uint32_t key) {
  for (int i = 0; i < FAKE_DICT_SLOTS; i++) {
    if (iter->slots[i].used && iter->slots[i].key == key) {
      Tuple *t = &s_tuple_pool[s_tuple_next];
      s_tuple_next = (s_tuple_next + 1) % FAKE_TUPLE_POOL;
      t->key = key;
      t->storage.int32 = iter->slots[i].i32;
      t->value = &t->storage;
      return t;
    }
  }
  return NULL;
}

static void dict_write(DictionaryIterator *iter, uint32_t key, int32_t value) {
  for (int i = 0; i < FAKE_DICT_SLOTS; i++) {
    if (iter->slots[i].used && iter->slots[i].key == key) {
      iter->slots[i].i32 = value;
      return;
    }
  }
  for (int i = 0; i < FAKE_DICT_SLOTS; i++) {
    if (!iter->slots[i].used) {
      iter->slots[i].used = true;
      iter->slots[i].key = key;
      iter->slots[i].i32 = value;
      return;
    }
  }
}

void dict_write_uint8(DictionaryIterator *iter, uint32_t key, uint8_t value) {
  dict_write(iter, key, (int32_t)value);
}

void dict_write_int32(DictionaryIterator *iter, uint32_t key, int32_t value) {
  dict_write(iter, key, value);
}

void fake_dict_reset(DictionaryIterator *iter) {
  memset(iter, 0, sizeof(*iter));
}

int32_t fake_dict_get(DictionaryIterator *iter, uint32_t key, bool *found) {
  for (int i = 0; i < FAKE_DICT_SLOTS; i++) {
    if (iter->slots[i].used && iter->slots[i].key == key) {
      if (found) {
        *found = true;
      }
      return iter->slots[i].i32;
    }
  }
  if (found) {
    *found = false;
  }
  return 0;
}
