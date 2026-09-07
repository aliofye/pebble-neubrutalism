// Fake Pebble SDK for host unit tests of widget modules.
// Provides in-memory behavior for: persist store, battery service,
// health service, bluetooth peek, layers (dirty counting), and a minimal
// AppMessage dictionary. Linked only by test/c tests, never on-watch.
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>
#include <time.h>

/* ---------- time (struct tm comes from libc time.h on the host) ---------- */

typedef int TimeUnits;
#define SECOND_UNIT 1
#define MINUTE_UNIT 2

bool clock_is_24h_style(void);
void fake_clock_set_24h(bool h24);

/* ---------- persist ---------- */

#define FAKE_PERSIST_SLOTS 16

typedef struct {
  bool used;
  uint32_t key;
  bool is_bool;
  int32_t i32;
  bool b;
} FakePersistSlot;

extern FakePersistSlot fake_persist_store[FAKE_PERSIST_SLOTS];

bool persist_exists(uint32_t key);
int32_t persist_read_int(uint32_t key);
void persist_write_int(uint32_t key, int32_t value);
bool persist_read_bool(uint32_t key);
void persist_write_bool(uint32_t key, bool value);
void fake_persist_reset(void);

/* ---------- battery ---------- */

typedef struct {
  uint8_t charge_percent;
  bool is_charging;
  bool is_plugged;
} BatteryChargeState;

typedef void (*BatteryHandler)(BatteryChargeState);

BatteryChargeState battery_state_service_peek(void);
void battery_state_service_subscribe(BatteryHandler handler);
void battery_state_service_unsubscribe(void);
void fake_battery_inject(uint8_t percent);

/* ---------- health ---------- */

#define PBL_HEALTH 1

typedef int32_t HealthValue;
typedef int HealthMetric;
#define HealthMetricStepCount 1

typedef void (*HealthHandler)(int event, void *context);

HealthValue health_service_sum_today(HealthMetric metric);
void fake_health_set_steps(HealthValue steps);

/* ---------- bluetooth ---------- */

bool bluetooth_connection_service_peek(void);
void bluetooth_connection_service_subscribe(void (*handler)(bool connected));
void bluetooth_connection_service_unsubscribe(void);
void fake_bluetooth_set(bool connected);

/* ---------- layers ---------- */

typedef struct FakeLayer FakeLayer;
typedef FakeLayer Layer;
typedef FakeLayer TextLayer;

struct FakeLayer {
  int dirty_count;
  bool hidden;
  char text[16];
};

void layer_mark_dirty(Layer *layer);
void layer_set_hidden(Layer *layer, bool hidden);
void text_layer_set_text(TextLayer *layer, const char *text);
int fake_layer_dirty_count(Layer *layer);
void fake_layer_reset(Layer *layer);

/* ---------- AppMessage dictionary (minimal) ---------- */

#define FAKE_DICT_SLOTS 16

typedef struct {
  bool used;
  uint32_t key;
  int32_t i32;
} FakeDictSlot;

typedef struct {
  FakeDictSlot slots[FAKE_DICT_SLOTS];
} DictionaryIterator;

typedef struct {
  int32_t int32;
} TupleValue;

typedef struct {
  uint32_t key;
  TupleValue *value;
  TupleValue storage;
} Tuple;

/* Message keys for tests. On-watch these come from the generated
   message_keys.auto.h (package.json order); test values only need to be
   distinct within the fake dictionary. */
#define MESSAGE_KEY_SETTINGS_REQUEST 100
#define MESSAGE_KEY_TIME_FORMAT 101
#define MESSAGE_KEY_COLOR_THEME 102
#define MESSAGE_KEY_DAILY_STEP_GOAL 104
#define MESSAGE_KEY_WEATHER_UNITS 105
#define MESSAGE_KEY_WEATHER_TEMP 106
#define MESSAGE_KEY_WEATHER_ENABLED 107
#define MESSAGE_KEY_BARS_MODE 108
#define MESSAGE_KEY_WEATHER_CODE 109

Tuple *dict_find(DictionaryIterator *iter, uint32_t key);
void dict_write_uint8(DictionaryIterator *iter, uint32_t key, uint8_t value);
void dict_write_int32(DictionaryIterator *iter, uint32_t key, int32_t value);
void fake_dict_reset(DictionaryIterator *iter);
int32_t fake_dict_get(DictionaryIterator *iter, uint32_t key, bool *found);
