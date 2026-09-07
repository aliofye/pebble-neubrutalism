/* DO NOT EDIT - generated full app core for neubrutalism-plus by tools/pebble-editor/generate-app.js */
#include <pebble.h>
#include <string.h>
#include <time.h>

#include "generated_design.h"
#include "pe_layers.h"
#include "widgets/time/time.h"
#include "widgets/date/date.h"
#include "widgets/battery/battery.h"
#include "widgets/steps/steps.h"
#include "widgets/weather/weather.h"

enum {
  PERSIST_KEY_COLOR_THEME = 2,
  PERSIST_KEY_BARS_MODE = 8,
};

static Window *s_window;
static Layer *s_layer_background;
static Layer *s_layer_bars;
static TextLayer *s_tlayer_date;
static TextLayer *s_tlayer_weather;
static Layer *s_layer_time;
static GFont s_font_jersey38;
static GFont s_font_jersey25;
static GBitmap *s_bitmap_bt;
static uint8_t s_color_theme;
static bool s_bt_connected = true;
static int s_bars_mode = 0;
static int16_t s_screen_w;
static int16_t s_screen_h;

static const NeubrutalismPlusTheme *prv_theme(void) {
  return &NEUBRUTALISM_PLUS_THEMES[s_color_theme < NEUBRUTALISM_PLUS_THEME_COUNT ? s_color_theme : 0];
}

static void prv_fill_state(NeubrutalismPlusState *st) {
  st->bt = s_bt_connected;
  st->time_str = time_widget_text();
  st->date_str = date_widget_text();
  st->display_hour = time_widget_display_hour();
  st->weather_str = weather_widget_text();
  st->battery = battery_widget_percent();
  st->steps = steps_widget_percent();
  st->weather_code = weather_widget_code();
  st->weather_available = weather_widget_available();
  st->weather_enabled = weather_widget_enabled();
  st->bars_mode = s_bars_mode;
}

static void prv_w200_background_update(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  const NeubrutalismPlusTheme *theme = prv_theme();
  NeubrutalismPlusState st;
  prv_fill_state(&st);
  neubrutalism_plus_w200_background_draw(ctx, bounds.size.w, bounds.size.h, theme, &st, s_bitmap_bt);
}

static void prv_w200_bars_update(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  const NeubrutalismPlusTheme *theme = prv_theme();
  NeubrutalismPlusState st;
  prv_fill_state(&st);
  neubrutalism_plus_w200_bars_draw(ctx, bounds.size.w, bounds.size.h, theme, &st);
}

static void prv_w200_time_update(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  const NeubrutalismPlusTheme *theme = prv_theme();
  NeubrutalismPlusState st;
  prv_fill_state(&st);
  neubrutalism_plus_w200_time_draw(ctx, bounds.size.w, bounds.size.h, theme, &st);
}

static void prv_w144_background_update(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  const NeubrutalismPlusTheme *theme = prv_theme();
  NeubrutalismPlusState st;
  prv_fill_state(&st);
  neubrutalism_plus_w144_background_draw(ctx, bounds.size.w, bounds.size.h, theme, &st, s_bitmap_bt);
}

static void prv_w144_bars_update(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  const NeubrutalismPlusTheme *theme = prv_theme();
  NeubrutalismPlusState st;
  prv_fill_state(&st);
  neubrutalism_plus_w144_bars_draw(ctx, bounds.size.w, bounds.size.h, theme, &st);
}

static void prv_w144_time_update(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  const NeubrutalismPlusTheme *theme = prv_theme();
  NeubrutalismPlusState st;
  prv_fill_state(&st);
  neubrutalism_plus_w144_time_draw(ctx, bounds.size.w, bounds.size.h, theme, &st);
}

static void prv_apply_visibility(void) {
  const NeubrutalismPlusTheme *theme = prv_theme();
  NeubrutalismPlusState st;
  prv_fill_state(&st);
  if (s_screen_w == 200) {
    if (text_layer_get_layer(s_tlayer_weather)) layer_set_hidden(text_layer_get_layer(s_tlayer_weather), !neubrutalism_plus_w200_weather_visible(theme, &st));
  }
  else if (s_screen_w == 144) {
    if (text_layer_get_layer(s_tlayer_weather)) layer_set_hidden(text_layer_get_layer(s_tlayer_weather), !neubrutalism_plus_w144_weather_visible(theme, &st));
  }
}

static void prv_dirty_all(void) {
  if (s_layer_background) layer_mark_dirty(s_layer_background);
  if (s_layer_bars) layer_mark_dirty(s_layer_bars);
  if (s_tlayer_date) layer_mark_dirty(text_layer_get_layer(s_tlayer_date));
  if (s_tlayer_weather) layer_mark_dirty(text_layer_get_layer(s_tlayer_weather));
  if (s_layer_time) layer_mark_dirty(s_layer_time);
}

static void prv_apply_text_colors(void) {
  const NeubrutalismPlusTheme *theme = prv_theme();
  NeubrutalismPlusState st;
  prv_fill_state(&st);
  if (s_tlayer_date) text_layer_set_text_color(s_tlayer_date, neubrutalism_plus_w200_date_color(theme, &st));
  if (s_tlayer_weather) text_layer_set_text_color(s_tlayer_weather, neubrutalism_plus_w200_weather_color(theme, &st));
}

static void prv_tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  time_widget_tick(tick_time, units_changed);
  date_widget_tick(tick_time, units_changed);
  battery_widget_tick(tick_time, units_changed);
  steps_widget_tick(tick_time, units_changed);
  weather_widget_tick(tick_time, units_changed);
  prv_apply_visibility();
}

static void prv_bt_handler(bool connected) {
  s_bt_connected = connected;
  prv_apply_visibility();
  if (s_layer_background) layer_mark_dirty(s_layer_background);
}

static void prv_sync_settings(void) {
  DictionaryIterator *iter;
  if (app_message_outbox_begin(&iter) != APP_MSG_OK) return;
  dict_write_uint8(iter, MESSAGE_KEY_COLOR_THEME, s_color_theme);
  dict_write_int32(iter, MESSAGE_KEY_BARS_MODE, s_bars_mode);
  time_widget_sync(iter);
  date_widget_sync(iter);
  battery_widget_sync(iter);
  steps_widget_sync(iter);
  weather_widget_sync(iter);
  app_message_outbox_send();
}

static void prv_inbox_received(DictionaryIterator *iter, void *context) {
  (void)context;
  Tuple *theme_tuple = dict_find(iter, MESSAGE_KEY_COLOR_THEME);
  if (theme_tuple) {
    const uint8_t theme = (uint8_t)theme_tuple->value->int32;
    if (theme < NEUBRUTALISM_PLUS_THEME_COUNT) {
      s_color_theme = theme;
      persist_write_int(PERSIST_KEY_COLOR_THEME, s_color_theme);
      window_set_background_color(s_window, prv_theme()->background);
      prv_apply_text_colors();
      prv_dirty_all();
    }
  }
  {
    Tuple *t = dict_find(iter, MESSAGE_KEY_BARS_MODE);
    if (t) {
      const int v = (int)t->value->int32;
      if (v != s_bars_mode && v >= 0 && v <= 2) {
        s_bars_mode = v;
        persist_write_int(PERSIST_KEY_BARS_MODE, v);
        prv_apply_visibility();
        prv_dirty_all();
      }
    }
  }
  time_widget_inbox(iter);
  date_widget_inbox(iter);
  battery_widget_inbox(iter);
  steps_widget_inbox(iter);
  weather_widget_inbox(iter);
  prv_apply_visibility();
  if (dict_find(iter, MESSAGE_KEY_SETTINGS_REQUEST)) {
    prv_sync_settings();
  }
}

static void prv_window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);
  s_screen_w = bounds.size.w;
  s_screen_h = bounds.size.h;
  s_font_jersey38 = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_JERSEY_38));
  s_font_jersey25 = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_JERSEY_25));
  s_bitmap_bt = gbitmap_create_with_resource(RESOURCE_ID_IMAGE_BT_DISCONNECT);
  if (s_screen_w == 200) {
    s_layer_background = layer_create(bounds);
    layer_set_update_proc(s_layer_background, prv_w200_background_update);
    layer_add_child(window_layer, s_layer_background);
    neubrutalism_plus_w200_background_polygons_create();
    s_layer_bars = layer_create(bounds);
    layer_set_update_proc(s_layer_bars, prv_w200_bars_update);
    layer_add_child(window_layer, s_layer_bars);
    s_tlayer_date = text_layer_create(neubrutalism_plus_w200_date_frame(bounds.size.w, bounds.size.h));
    text_layer_set_background_color(s_tlayer_date, GColorClear);
    text_layer_set_text_color(s_tlayer_date, GColorBlack);
    text_layer_set_text_alignment(s_tlayer_date, neubrutalism_plus_w200_date_align());
    text_layer_set_font(s_tlayer_date, s_font_jersey38);
    layer_add_child(window_layer, text_layer_get_layer(s_tlayer_date));
    s_tlayer_weather = text_layer_create(neubrutalism_plus_w200_weather_frame(bounds.size.w, bounds.size.h));
    text_layer_set_background_color(s_tlayer_weather, GColorClear);
    text_layer_set_text_color(s_tlayer_weather, GColorBlack);
    text_layer_set_text_alignment(s_tlayer_weather, neubrutalism_plus_w200_weather_align());
    text_layer_set_font(s_tlayer_weather, s_font_jersey38);
    layer_add_child(window_layer, text_layer_get_layer(s_tlayer_weather));
    s_layer_time = layer_create(bounds);
    layer_set_update_proc(s_layer_time, prv_w200_time_update);
    layer_add_child(window_layer, s_layer_time);
  }
  else if (s_screen_w == 144) {
    s_layer_background = layer_create(bounds);
    layer_set_update_proc(s_layer_background, prv_w144_background_update);
    layer_add_child(window_layer, s_layer_background);
    neubrutalism_plus_w144_background_polygons_create();
    s_layer_bars = layer_create(bounds);
    layer_set_update_proc(s_layer_bars, prv_w144_bars_update);
    layer_add_child(window_layer, s_layer_bars);
    s_tlayer_date = text_layer_create(neubrutalism_plus_w144_date_frame(bounds.size.w, bounds.size.h));
    text_layer_set_background_color(s_tlayer_date, GColorClear);
    text_layer_set_text_color(s_tlayer_date, GColorBlack);
    text_layer_set_text_alignment(s_tlayer_date, neubrutalism_plus_w144_date_align());
    text_layer_set_font(s_tlayer_date, s_font_jersey25);
    layer_add_child(window_layer, text_layer_get_layer(s_tlayer_date));
    s_tlayer_weather = text_layer_create(neubrutalism_plus_w144_weather_frame(bounds.size.w, bounds.size.h));
    text_layer_set_background_color(s_tlayer_weather, GColorClear);
    text_layer_set_text_color(s_tlayer_weather, GColorBlack);
    text_layer_set_text_alignment(s_tlayer_weather, neubrutalism_plus_w144_weather_align());
    text_layer_set_font(s_tlayer_weather, s_font_jersey25);
    layer_add_child(window_layer, text_layer_get_layer(s_tlayer_weather));
    s_layer_time = layer_create(bounds);
    layer_set_update_proc(s_layer_time, prv_w144_time_update);
    layer_add_child(window_layer, s_layer_time);
  }
  else {
    s_layer_background = layer_create(bounds);
    layer_set_update_proc(s_layer_background, prv_w200_background_update);
    layer_add_child(window_layer, s_layer_background);
    neubrutalism_plus_w200_background_polygons_create();
    s_layer_bars = layer_create(bounds);
    layer_set_update_proc(s_layer_bars, prv_w200_bars_update);
    layer_add_child(window_layer, s_layer_bars);
    s_tlayer_date = text_layer_create(neubrutalism_plus_w200_date_frame(bounds.size.w, bounds.size.h));
    text_layer_set_background_color(s_tlayer_date, GColorClear);
    text_layer_set_text_color(s_tlayer_date, GColorBlack);
    text_layer_set_text_alignment(s_tlayer_date, neubrutalism_plus_w200_date_align());
    text_layer_set_font(s_tlayer_date, s_font_jersey38);
    layer_add_child(window_layer, text_layer_get_layer(s_tlayer_date));
    s_tlayer_weather = text_layer_create(neubrutalism_plus_w200_weather_frame(bounds.size.w, bounds.size.h));
    text_layer_set_background_color(s_tlayer_weather, GColorClear);
    text_layer_set_text_color(s_tlayer_weather, GColorBlack);
    text_layer_set_text_alignment(s_tlayer_weather, neubrutalism_plus_w200_weather_align());
    text_layer_set_font(s_tlayer_weather, s_font_jersey38);
    layer_add_child(window_layer, text_layer_get_layer(s_tlayer_weather));
    s_layer_time = layer_create(bounds);
    layer_set_update_proc(s_layer_time, prv_w200_time_update);
    layer_add_child(window_layer, s_layer_time);
  }
  {
    PeFaceLayers face;
    face.background = NULL; face.bars = NULL; face.date = NULL; face.weather = NULL; face.time = NULL;
    face.background = s_layer_background;
    face.bars = s_layer_bars;
    face.date = s_tlayer_date;
    face.weather = s_tlayer_weather;
    face.time = s_layer_time;
    time_widget_init(&face);
    date_widget_init(&face);
    battery_widget_init(&face);
    steps_widget_init(&face);
    weather_widget_init(&face);
  }
  prv_apply_text_colors();
  prv_apply_visibility();
}
static void prv_window_unload(Window *window) {
  (void)window;
  time_widget_deinit();
  date_widget_deinit();
  battery_widget_deinit();
  steps_widget_deinit();
  weather_widget_deinit();
  bluetooth_connection_service_unsubscribe();
  tick_timer_service_unsubscribe();
  app_message_deregister_callbacks();
  layer_destroy(s_layer_background); s_layer_background = NULL;
  layer_destroy(s_layer_bars); s_layer_bars = NULL;
  text_layer_destroy(s_tlayer_date); s_tlayer_date = NULL;
  text_layer_destroy(s_tlayer_weather); s_tlayer_weather = NULL;
  layer_destroy(s_layer_time); s_layer_time = NULL;
  neubrutalism_plus_w200_background_polygons_destroy();
  neubrutalism_plus_w144_background_polygons_destroy();
  if (s_font_jersey38) { fonts_unload_custom_font(s_font_jersey38); s_font_jersey38 = NULL; }
  if (s_font_jersey25) { fonts_unload_custom_font(s_font_jersey25); s_font_jersey25 = NULL; }
  if (s_bitmap_bt) { gbitmap_destroy(s_bitmap_bt); s_bitmap_bt = NULL; }
  window_destroy(s_window);
  s_window = NULL;
}

static void prv_deinit(void) {
  bluetooth_connection_service_unsubscribe();
  tick_timer_service_unsubscribe();
  app_message_deregister_callbacks();
  window_destroy(s_window);
}

static void prv_init(void) {
  s_color_theme = persist_exists(PERSIST_KEY_COLOR_THEME)
      ? (uint8_t)persist_read_int(PERSIST_KEY_COLOR_THEME)
      : 0;
  if (s_color_theme >= NEUBRUTALISM_PLUS_THEME_COUNT) s_color_theme = 0;
  s_bars_mode = persist_exists(PERSIST_KEY_BARS_MODE)
      ? (int)persist_read_int(PERSIST_KEY_BARS_MODE)
      : 0;
  if (s_bars_mode < 0 || s_bars_mode > 2) s_bars_mode = 0;
  s_bt_connected = bluetooth_connection_service_peek();
  s_window = window_create();
  window_set_background_color(s_window, prv_theme()->background);
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = prv_window_load,
    .unload = prv_window_unload,
  });
  window_stack_push(s_window, true);
  bluetooth_connection_service_subscribe(prv_bt_handler);
  tick_timer_service_subscribe(MINUTE_UNIT, prv_tick_handler);
  app_message_register_inbox_received(prv_inbox_received);
  app_message_open(64, 64);
}

int main(void) {
  prv_init();
  app_event_loop();
  prv_deinit();
}
