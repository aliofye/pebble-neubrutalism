#include <ctype.h>
#include <pebble.h>
#include <stdio.h>
#include <string.h>

#include "generated_design.h"
#include "message_keys.auto.h"
#include "time_util.h"

// TEMP: debug — cycle the weather bubble through every condition color and the
// battery bar through every status color, one step every 2 seconds.
// Set to 1 while developing, 0 for production builds.
#define DEBUG_COLOR_CYCLE 0

static Window *s_window;
static Layer *s_background_layer;
static Layer *s_bars_layer;
static Layer *s_time_layer;
static int16_t s_screen_w;
static TextLayer *s_date_layer;
static GFont s_date_font;
static char s_time_buffer[8];
static char s_date_buffer[8];
static int s_current_hour;
static int16_t s_screen_h;
static TextLayer *s_weather_layer;
static char s_weather_buffer[8];
static int s_weather_temp;
static int s_weather_code;
static uint8_t s_weather_units;
static bool s_weather_available;
static bool s_weather_enabled = true;
static bool s_bt_connected = true;
#if DEBUG_COLOR_CYCLE
static AppTimer *s_debug_cycle_timer;
static int s_debug_weather_index;
static int s_debug_battery_index;
static const int s_debug_weather_codes[] = {0, 3, 51, 71, 95};
static const int s_debug_battery_percents[] = {10, 35, 90};
#endif

static GBitmap *s_bt_icon_bitmap;
static int s_battery_percent = 100;
static int s_step_goal_percent;
static int32_t s_daily_step_goal;
static bool s_use_24_hour;
static uint8_t s_color_theme;
static uint8_t s_bars_mode;

enum {
  PERSIST_KEY_TIME_FORMAT = 1,
  PERSIST_KEY_COLOR_THEME = 2,
  PERSIST_KEY_DAILY_STEP_GOAL = 4,
  PERSIST_KEY_WEATHER_UNITS = 5,
  PERSIST_KEY_WEATHER_TEMP = 6,
  PERSIST_KEY_WEATHER_ENABLED = 7,
  PERSIST_KEY_BARS_MODE = 8,
  PERSIST_KEY_WEATHER_CODE = 9,
};

enum {
  BARS_BOTH = 0,
  BARS_BATTERY_ONLY,
  BARS_STEPS_ONLY,
  BARS_MODE_COUNT,
};

enum {
  WEATHER_UNITS_F = 0,
  WEATHER_UNITS_C,
};

enum {
  DAILY_STEP_GOAL_DEFAULT = 10000,
  DAILY_STEP_GOAL_MIN = 1000,
  DAILY_STEP_GOAL_MAX = 100000,
};

enum {
  THEME_NEUBRUTALISM = 0,
  THEME_GAME_BOY_GREEN,
  THEME_OCEAN_BLUE,
  THEME_AMBER_LCD,
  THEME_MONOCHROME,
  THEME_PURPLE_PIXEL,
  THEME_COUNT,
};

static const NeubrutalismPlusTheme *prv_theme(void) {
  return &NEUBRUTALISM_PLUS_THEMES[s_color_theme < THEME_COUNT ? s_color_theme : THEME_NEUBRUTALISM];
}

static void prv_fill_design_state(NeubrutalismPlusState *st) {
  st->time_str = s_time_buffer;
  st->date_str = s_date_buffer;
  st->display_hour = s_current_hour;
  st->weather_str = s_weather_buffer;
  st->battery = s_battery_percent;
  st->steps = s_step_goal_percent;
  st->weather_code = s_weather_code;
  st->weather_available = s_weather_available;
  st->weather_enabled = s_weather_enabled;
  st->bt = s_bt_connected;
  st->bars_mode = s_bars_mode;
}
static void prv_update_time(struct tm *tick_time) {
  const uint8_t hour = s_use_24_hour
      ? tick_time->tm_hour
      : (tick_time->tm_hour % 12 == 0 ? 12 : tick_time->tm_hour % 12);
  s_current_hour = hour;

  format_time(tick_time->tm_hour, tick_time->tm_min, s_use_24_hour,
              s_time_buffer, sizeof(s_time_buffer));
  format_date_upper(tick_time, s_date_buffer, sizeof(s_date_buffer));

  if (s_date_layer) {
    text_layer_set_text(s_date_layer, s_date_buffer);
  }

  if (s_time_layer) {
    layer_mark_dirty(s_time_layer);
  }
}

static void prv_update_time_now(void) {
  time_t now = time(NULL);
  prv_update_time(localtime(&now));
}

static void prv_update_weather_text(void) {
  if (!s_weather_layer) {
    return;
  }
  const char unit = s_weather_units == WEATHER_UNITS_C ? 'C' : 'F';
  if (s_weather_available) {
    snprintf(s_weather_buffer, sizeof(s_weather_buffer), "%d°%c", s_weather_temp, unit);
  } else {
    snprintf(s_weather_buffer, sizeof(s_weather_buffer), "--°%c", unit);
  }
  text_layer_set_text(s_weather_layer, s_weather_buffer);
}

static void prv_apply_weather_visibility(void) {
  if (s_weather_layer) {
    layer_set_hidden(text_layer_get_layer(s_weather_layer),
                     !s_weather_enabled || !s_bt_connected);
  }
  if (s_background_layer) {
    layer_mark_dirty(s_background_layer);
  }
}

static void prv_bt_handler(bool connected) {
  s_bt_connected = connected;
  if (s_weather_layer) {
    layer_set_hidden(text_layer_get_layer(s_weather_layer),
                     !s_weather_enabled || !s_bt_connected);
    if (s_bt_connected) {
      prv_update_weather_text();
    }
  }
  if (s_background_layer) {
    layer_mark_dirty(s_background_layer);
  }
}

#if DEBUG_COLOR_CYCLE
static void prv_debug_cycle_tick(void *data) {
  s_weather_code = s_debug_weather_codes[s_debug_weather_index];
  s_debug_weather_index = (s_debug_weather_index + 1) % ARRAY_LENGTH(s_debug_weather_codes);
  s_battery_percent = s_debug_battery_percents[s_debug_battery_index];
  s_debug_battery_index = (s_debug_battery_index + 1) % ARRAY_LENGTH(s_debug_battery_percents);
  if (s_background_layer) {
    layer_mark_dirty(s_background_layer);
  }
  if (s_bars_layer) {
    layer_mark_dirty(s_bars_layer);
  }
  s_debug_cycle_timer = app_timer_register(2000, prv_debug_cycle_tick, NULL);
}
#endif


static void prv_battery_handler(BatteryChargeState state) {
  s_battery_percent = state.charge_percent;
  if (s_bars_layer) {
    layer_mark_dirty(s_bars_layer);
  }
}

static void prv_update_step_progress(void) {
  int progress = 0;
#if defined(PBL_HEALTH)
  const HealthValue steps = health_service_sum_today(HealthMetricStepCount);
  if (steps > 0) {
    progress = steps >= s_daily_step_goal
        ? 100
        : (int)((steps * 100) / s_daily_step_goal);
  }
#endif

  if (s_step_goal_percent != progress) {
    s_step_goal_percent = progress;
    if (s_bars_layer) {
      layer_mark_dirty(s_bars_layer);
    }
  }
}

static void prv_tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  prv_update_time(tick_time);
  prv_update_step_progress();
}

static void prv_send_settings(void) {
  DictionaryIterator *iter;
  AppMessageResult result = app_message_outbox_begin(&iter);
  if (result != APP_MSG_OK) {
    APP_LOG(APP_LOG_LEVEL_WARNING, "Could not begin settings sync: %d", result);
    return;
  }

  dict_write_uint8(iter, MESSAGE_KEY_TIME_FORMAT, s_use_24_hour ? 1 : 0);
  dict_write_uint8(iter, MESSAGE_KEY_COLOR_THEME, s_color_theme);
  dict_write_int32(iter, MESSAGE_KEY_DAILY_STEP_GOAL, s_daily_step_goal);
  dict_write_uint8(iter, MESSAGE_KEY_BARS_MODE, s_bars_mode);
  dict_write_uint8(iter, MESSAGE_KEY_WEATHER_ENABLED, s_weather_enabled ? 1 : 0);
  dict_write_uint8(iter, MESSAGE_KEY_WEATHER_UNITS, s_weather_units);
  result = app_message_outbox_send();
  if (result != APP_MSG_OK) {
    APP_LOG(APP_LOG_LEVEL_WARNING, "Could not send settings sync: %d", result);
  }
}

static void prv_inbox_received(DictionaryIterator *iter, void *context) {
  Tuple *format_tuple = dict_find(iter, MESSAGE_KEY_TIME_FORMAT);
  if (format_tuple) {
    s_use_24_hour = format_tuple->value->int32 != 0;
    persist_write_bool(PERSIST_KEY_TIME_FORMAT, s_use_24_hour);
    prv_update_time_now();
  }

  Tuple *theme_tuple = dict_find(iter, MESSAGE_KEY_COLOR_THEME);
  if (theme_tuple) {
    uint8_t theme = (uint8_t)theme_tuple->value->int32;
    if (theme < THEME_COUNT) {
      s_color_theme = theme;
      persist_write_int(PERSIST_KEY_COLOR_THEME, s_color_theme);
      window_set_background_color(s_window, prv_theme()->background);
      text_layer_set_text_color(s_date_layer, prv_theme()->ink);
      if (s_background_layer) {
        layer_mark_dirty(s_background_layer);
      }
      if (s_bars_layer) {
        layer_mark_dirty(s_bars_layer);
      }
      if (s_time_layer) {
        layer_mark_dirty(s_time_layer);
      }
    }
  }

  Tuple *step_goal_tuple = dict_find(iter, MESSAGE_KEY_DAILY_STEP_GOAL);
  if (step_goal_tuple) {
    const int32_t step_goal = step_goal_tuple->value->int32;
    if (step_goal >= DAILY_STEP_GOAL_MIN && step_goal <= DAILY_STEP_GOAL_MAX) {
      s_daily_step_goal = step_goal;
      persist_write_int(PERSIST_KEY_DAILY_STEP_GOAL, s_daily_step_goal);
      prv_update_step_progress();
    }
  }

  Tuple *bars_mode_tuple = dict_find(iter, MESSAGE_KEY_BARS_MODE);
  if (bars_mode_tuple) {
    const uint8_t bars_mode = (uint8_t)bars_mode_tuple->value->int32;
    if (bars_mode < BARS_MODE_COUNT) {
      s_bars_mode = bars_mode;
      persist_write_int(PERSIST_KEY_BARS_MODE, s_bars_mode);
      if (s_bars_layer) {
        layer_mark_dirty(s_bars_layer);
      }
    }
  }

  Tuple *weather_units_tuple = dict_find(iter, MESSAGE_KEY_WEATHER_UNITS);
  if (weather_units_tuple) {
    const uint8_t units = (uint8_t)weather_units_tuple->value->int32;
    if (units == WEATHER_UNITS_F || units == WEATHER_UNITS_C) {
      s_weather_units = units;
      persist_write_int(PERSIST_KEY_WEATHER_UNITS, s_weather_units);
      prv_update_weather_text();
    }
  }

  Tuple *weather_enabled_tuple = dict_find(iter, MESSAGE_KEY_WEATHER_ENABLED);
  if (weather_enabled_tuple) {
    s_weather_enabled = weather_enabled_tuple->value->int32 != 0;
    persist_write_bool(PERSIST_KEY_WEATHER_ENABLED, s_weather_enabled);
    prv_apply_weather_visibility();
  }

  Tuple *weather_temp_tuple = dict_find(iter, MESSAGE_KEY_WEATHER_TEMP);
  if (weather_temp_tuple) {
    const int temp = weather_temp_tuple->value->int32;
    const bool changed = temp != s_weather_temp;
    s_weather_temp = temp;
    s_weather_available = true;
    if (changed) {
      persist_write_int(PERSIST_KEY_WEATHER_TEMP, s_weather_temp);
    }
    prv_update_weather_text();
  }

  Tuple *weather_code_tuple = dict_find(iter, MESSAGE_KEY_WEATHER_CODE);
  if (weather_code_tuple) {
    const int code = weather_code_tuple->value->int32;
    if (code != s_weather_code) {
      s_weather_code = code;
      persist_write_int(PERSIST_KEY_WEATHER_CODE, s_weather_code);
      if (s_background_layer) {
        layer_mark_dirty(s_background_layer);
      }
    }
  }

  if (dict_find(iter, MESSAGE_KEY_SETTINGS_REQUEST)) {
    prv_send_settings();
  }
}

// Static chrome: time box, polygons, weather bubble, BT icon. Redraws only on
// theme / weather / bluetooth changes, never on the minute tick.
// Visuals are generated from design.json (generated_design.c).
static void prv_background_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  const int16_t w = bounds.size.w;
  const int16_t h = bounds.size.h;
  const NeubrutalismPlusTheme *theme = prv_theme();
  NeubrutalismPlusState st;
  prv_fill_design_state(&st);
  if (w == 200) {
    neubrutalism_plus_w200_background_draw(ctx, w, h, theme, &st, s_bt_icon_bitmap);
  } else {
    neubrutalism_plus_w144_background_draw(ctx, w, h, theme, &st, s_bt_icon_bitmap);
  }
}

// Metric bars: either a single full-height bar or two stacked bars, vertically
// centered between the time box shadow and the screen bottom. This layer is
// full-screen and the generated draw code uses absolute screen coordinates;
// redraws only on battery/step/theme/bars-mode changes.
static void prv_bars_update_proc(Layer *layer, GContext *ctx) {
  (void)layer;
  const NeubrutalismPlusTheme *theme = prv_theme();
  NeubrutalismPlusState st;
  prv_fill_design_state(&st);
  if (s_screen_w == 200) {
    neubrutalism_plus_w200_bars_draw(ctx, s_screen_w, s_screen_h, theme, &st);
  } else {
    neubrutalism_plus_w144_bars_draw(ctx, s_screen_w, s_screen_h, theme, &st);
  }
}

// Time digits: pixel glyphs centered in the orange block. This layer is
// full-screen and the generated draw code uses absolute screen coordinates.
// This is the only layer redrawn on the minute tick.
static void prv_time_update_proc(Layer *layer, GContext *ctx) {
  (void)layer;
  const NeubrutalismPlusTheme *theme = prv_theme();
  NeubrutalismPlusState st;
  prv_fill_design_state(&st);
  if (s_screen_w == 200) {
    neubrutalism_plus_w200_time_draw(ctx, s_screen_w, s_screen_h, theme, &st);
  } else {
    neubrutalism_plus_w144_time_draw(ctx, s_screen_w, s_screen_h, theme, &st);
  }
}

static void prv_window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);

  const bool is_200 = bounds.size.w == 200;
  if (is_200) {
    neubrutalism_plus_w200_background_polygons_create();
  } else {
    neubrutalism_plus_w144_background_polygons_create();
  }

  s_screen_w = bounds.size.w;
  s_screen_h = bounds.size.h;

  // Static chrome: boxes, polygons, weather bubble, BT icon
  s_background_layer = layer_create(bounds);
  layer_set_update_proc(s_background_layer, prv_background_update_proc);
  layer_add_child(window_layer, s_background_layer);

  // Metric bars: full-screen layer, generated code draws at absolute screen
  // coordinates; redraws only on battery/step/theme/bars-mode changes
  s_bars_layer = layer_create(bounds);
  layer_set_update_proc(s_bars_layer, prv_bars_update_proc);
  layer_add_child(window_layer, s_bars_layer);

  const GRect date_frame = is_200
      ? neubrutalism_plus_w200_date_frame(bounds.size.w, bounds.size.h)
      : neubrutalism_plus_w144_date_frame(bounds.size.w, bounds.size.h);
  const GRect weather_frame = is_200
      ? neubrutalism_plus_w200_weather_frame(bounds.size.w, bounds.size.h)
      : neubrutalism_plus_w144_weather_frame(bounds.size.w, bounds.size.h);

  s_date_layer = text_layer_create(date_frame);
  text_layer_set_background_color(s_date_layer, GColorClear);
  text_layer_set_text_color(s_date_layer, prv_theme()->ink);
  text_layer_set_text_alignment(s_date_layer, is_200
      ? neubrutalism_plus_w200_date_align()
      : neubrutalism_plus_w144_date_align());

  // Weather bubble mirrors the date bubble on the left of the time box
  s_weather_layer = text_layer_create(weather_frame);
  text_layer_set_background_color(s_weather_layer, GColorClear);
  text_layer_set_text_color(s_weather_layer, GColorBlack);
  text_layer_set_text_alignment(s_weather_layer, is_200
      ? neubrutalism_plus_w200_weather_align()
      : neubrutalism_plus_w144_weather_align());

  const uint32_t font_res = is_200
      ? neubrutalism_plus_w200_date_font()
      : neubrutalism_plus_w144_date_font();
  if (!s_date_font) {
    s_date_font = fonts_load_custom_font(resource_get_handle(font_res));
  }
  text_layer_set_font(s_date_layer, s_date_font);
  layer_add_child(window_layer, text_layer_get_layer(s_date_layer));
  text_layer_set_font(s_weather_layer, s_date_font);
  layer_add_child(window_layer, text_layer_get_layer(s_weather_layer));

  // Time digits redraw every minute; full-screen layer, generated code draws
  // at absolute screen coordinates
  s_time_layer = layer_create(bounds);
  layer_set_update_proc(s_time_layer, prv_time_update_proc);
  layer_add_child(window_layer, s_time_layer);

  prv_update_time_now();
  prv_update_weather_text();
  prv_apply_weather_visibility();
  s_bt_icon_bitmap = gbitmap_create_with_resource(RESOURCE_ID_IMAGE_BT_DISCONNECT);
#if DEBUG_COLOR_CYCLE
  s_weather_available = true;
  prv_update_weather_text();
  s_debug_cycle_timer = app_timer_register(2000, prv_debug_cycle_tick, NULL);
#endif
}

static void prv_window_unload(Window *window) {
  (void)window;
  neubrutalism_plus_w200_background_polygons_destroy();
  neubrutalism_plus_w144_background_polygons_destroy();
  if (s_date_font) {
    fonts_unload_custom_font(s_date_font);
    s_date_font = NULL;
  }
  text_layer_destroy(s_date_layer);
  s_date_layer = NULL;
  text_layer_destroy(s_weather_layer);
  s_weather_layer = NULL;
  if (s_bt_icon_bitmap) {
    gbitmap_destroy(s_bt_icon_bitmap);
    s_bt_icon_bitmap = NULL;
  }
#if DEBUG_COLOR_CYCLE
  if (s_debug_cycle_timer) {
    app_timer_cancel(s_debug_cycle_timer);
    s_debug_cycle_timer = NULL;
  }
#endif
  if (s_background_layer) {
    layer_destroy(s_background_layer);
    s_background_layer = NULL;
  }
  if (s_bars_layer) {
    layer_destroy(s_bars_layer);
    s_bars_layer = NULL;
  }
  if (s_time_layer) {
    layer_destroy(s_time_layer);
    s_time_layer = NULL;
  }
}

static void prv_init(void) {
  s_use_24_hour = persist_exists(PERSIST_KEY_TIME_FORMAT)
      ? persist_read_bool(PERSIST_KEY_TIME_FORMAT)
      : clock_is_24h_style();
  s_color_theme = persist_exists(PERSIST_KEY_COLOR_THEME)
      ? (uint8_t)persist_read_int(PERSIST_KEY_COLOR_THEME)
      : THEME_NEUBRUTALISM;
  if (s_color_theme >= THEME_COUNT) {
    s_color_theme = THEME_NEUBRUTALISM;
  }
  s_daily_step_goal = persist_exists(PERSIST_KEY_DAILY_STEP_GOAL)
      ? persist_read_int(PERSIST_KEY_DAILY_STEP_GOAL)
      : DAILY_STEP_GOAL_DEFAULT;
  if (s_daily_step_goal < DAILY_STEP_GOAL_MIN || s_daily_step_goal > DAILY_STEP_GOAL_MAX) {
    s_daily_step_goal = DAILY_STEP_GOAL_DEFAULT;
  }
  s_bars_mode = persist_exists(PERSIST_KEY_BARS_MODE)
      ? (uint8_t)persist_read_int(PERSIST_KEY_BARS_MODE)
      : BARS_BOTH;
  if (s_bars_mode >= BARS_MODE_COUNT) {
    s_bars_mode = BARS_BOTH;
  }
  s_weather_units = persist_exists(PERSIST_KEY_WEATHER_UNITS)
      ? (uint8_t)persist_read_int(PERSIST_KEY_WEATHER_UNITS)
      : WEATHER_UNITS_F;
  if (s_weather_units != WEATHER_UNITS_F && s_weather_units != WEATHER_UNITS_C) {
    s_weather_units = WEATHER_UNITS_F;
  }
  if (persist_exists(PERSIST_KEY_WEATHER_TEMP)) {
    s_weather_temp = persist_read_int(PERSIST_KEY_WEATHER_TEMP);
    s_weather_available = true;
  }
  if (persist_exists(PERSIST_KEY_WEATHER_CODE)) {
    s_weather_code = persist_read_int(PERSIST_KEY_WEATHER_CODE);
  }
  s_weather_enabled = persist_exists(PERSIST_KEY_WEATHER_ENABLED)
      ? persist_read_bool(PERSIST_KEY_WEATHER_ENABLED)
      : true;
  s_bt_connected = bluetooth_connection_service_peek();

  s_window = window_create();
  window_set_background_color(s_window, prv_theme()->background);
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = prv_window_load,
    .unload = prv_window_unload,
  });
  const bool animated = true;
  window_stack_push(s_window, animated);

  BatteryChargeState state = battery_state_service_peek();
  s_battery_percent = state.charge_percent;
  battery_state_service_subscribe(prv_battery_handler);
  bluetooth_connection_service_subscribe(prv_bt_handler);
#if defined(PBL_HEALTH)
  prv_update_step_progress();
#endif
  tick_timer_service_subscribe(MINUTE_UNIT, prv_tick_handler);

  app_message_register_inbox_received(prv_inbox_received);
  app_message_open(64, 64);
}

static void prv_deinit(void) {
  bluetooth_connection_service_unsubscribe();
  battery_state_service_unsubscribe();
  tick_timer_service_unsubscribe();
  app_message_deregister_callbacks();
  window_destroy(s_window);
}

int main(void) {
  prv_init();

  APP_LOG(APP_LOG_LEVEL_DEBUG, "Done initializing, pushed window: %p", s_window);

  app_event_loop();
  prv_deinit();
}
