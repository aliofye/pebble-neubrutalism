#include <ctype.h>
#include <pebble.h>
#include <string.h>

#include "glyphs.h"
#include "layout.h"
#include "message_keys.auto.h"
#include "time_util.h"

static Window *s_window;
static Layer *s_canvas_layer;
static TextLayer *s_date_layer;
static GFont s_date_font;
static char s_time_buffer[8];
static char s_date_buffer[8];
static int s_current_hour;
static GPath *s_polygon_200;
static GPath *s_polygon_144;
static int s_battery_percent = 100;
static int s_step_goal_percent;
static int32_t s_daily_step_goal;
static bool s_use_24_hour;
static uint8_t s_color_theme;
static uint8_t s_bottom_bar_metric;

enum {
  PERSIST_KEY_TIME_FORMAT = 1,
  PERSIST_KEY_COLOR_THEME = 2,
  PERSIST_KEY_BOTTOM_BAR_METRIC = 3,
  PERSIST_KEY_DAILY_STEP_GOAL = 4,
};

enum {
  BOTTOM_BAR_BATTERY = 0,
  BOTTOM_BAR_DAILY_STEPS,
  BOTTOM_BAR_METRIC_COUNT,
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

typedef struct {
  GColor background;
  GColor body;
  GColor accent;
  GColor battery_frame;
  GColor battery_bar;
  GColor ink;
} ColorTheme;

static const ColorTheme s_color_themes[THEME_COUNT] = {
  [THEME_NEUBRUTALISM] = {
    GColorPastelYellow, GColorOrange, GColorChromeYellow,
    GColorPastelYellow, GColorLavenderIndigo, GColorBlack,
  },
  [THEME_GAME_BOY_GREEN] = {
    GColorLightGray, GColorMayGreen, GColorMintGreen,
    GColorLightGray, GColorDarkGreen, GColorBlack,
  },
  [THEME_OCEAN_BLUE] = {
    GColorCeleste, GColorPictonBlue, GColorElectricBlue,
    GColorCeleste, GColorCobaltBlue, GColorBlack,
  },
  [THEME_AMBER_LCD] = {
    GColorPastelYellow, GColorChromeYellow, GColorIcterine,
    GColorPastelYellow, GColorOrange, GColorBlack,
  },
  [THEME_MONOCHROME] = {
    GColorLightGray, GColorWhite, GColorWhite,
    GColorLightGray, GColorDarkGray, GColorBlack,
  },
  [THEME_PURPLE_PIXEL] = {
    GColorRichBrilliantLavender, GColorLavenderIndigo, GColorBabyBlueEyes,
    GColorRichBrilliantLavender, GColorIndigo, GColorBlack,
  },
};

static const ColorTheme *prv_theme(void) {
  return &s_color_themes[s_color_theme < THEME_COUNT ? s_color_theme : THEME_NEUBRUTALISM];
}

static const int16_t ORANGE_STROKE = 3;

static const GPathInfo s_polygon_info_200 = {
  .num_points = 13,
  .points = (GPoint[]) {
    {100, 12},
    {190, 12},
    {190, 45},
    {187, 45},
    {187, 48},
    {184, 48},
    {184, 51},
    {181, 51},
    {181, 55},
    {175, 55},
    {175, 45},
    {175, 45},
    {100, 45},
  },
};

static const GPathInfo s_polygon_info_144 = {
  .num_points = 13,
  .points = (GPoint[]) {
    {72, 9},
    {137, 9},
    {137, 33},
    {135, 33},
    {135, 35},
    {132, 35},
    {132, 38},
    {130, 38},
    {130, 41},
    {126, 41},
    {126, 33},
    {126, 33},
    {72, 33},
  },
};

static void prv_draw_axis_aligned_outline(GContext *ctx, const GPoint *points, size_t count, int16_t stroke) {
  // Draw straight-edged outline by filling thin rects along each axis-aligned segment
  for (size_t i = 0; i < count; i++) {
    GPoint p1 = points[i];
    GPoint p2 = points[(i + 1) % count];
    if (p1.y == p2.y) {
      int16_t x0 = p1.x < p2.x ? p1.x : p2.x;
      int16_t x1 = p1.x < p2.x ? p2.x : p1.x;
      GRect seg = GRect(x0 - stroke / 2, p1.y - stroke / 2, (x1 - x0) + stroke, stroke);
      graphics_fill_rect(ctx, seg, 0, GCornerNone);
    } else if (p1.x == p2.x) {
      int16_t y0 = p1.y < p2.y ? p1.y : p2.y;
      int16_t y1 = p1.y < p2.y ? p2.y : p1.y;
      GRect seg = GRect(p1.x - stroke / 2, y0 - stroke / 2, stroke, (y1 - y0) + stroke);
      graphics_fill_rect(ctx, seg, 0, GCornerNone);
    }
  }
}
static void prv_update_time(void) {
  time_t now = time(NULL);
  struct tm *tick_time = localtime(&now);

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

  if (s_canvas_layer) {
    layer_mark_dirty(s_canvas_layer);
  }
}


static void prv_battery_handler(BatteryChargeState state) {
  s_battery_percent = state.charge_percent;
  if (s_canvas_layer) {
    layer_mark_dirty(s_canvas_layer);
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
    if (s_canvas_layer && s_bottom_bar_metric == BOTTOM_BAR_DAILY_STEPS) {
      layer_mark_dirty(s_canvas_layer);
    }
  }
}

#if defined(PBL_HEALTH)
static void prv_health_handler(HealthEventType event, void *context) {
  if (event == HealthEventMovementUpdate || event == HealthEventSignificantUpdate) {
    prv_update_step_progress();
  }
}
#endif

static GRect prv_orange_rect_for_bounds(GRect bounds) {
  int x, y, rw, rh;
  orange_rect(bounds.size.w, bounds.size.h, &x, &y, &rw, &rh);
  return GRect(x, y, rw, rh);
}

static void prv_tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  prv_update_time();
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
  dict_write_uint8(iter, MESSAGE_KEY_BOTTOM_BAR_METRIC, s_bottom_bar_metric);
  dict_write_int32(iter, MESSAGE_KEY_DAILY_STEP_GOAL, s_daily_step_goal);
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
    prv_update_time();
  }

  Tuple *theme_tuple = dict_find(iter, MESSAGE_KEY_COLOR_THEME);
  if (theme_tuple) {
    uint8_t theme = (uint8_t)theme_tuple->value->int32;
    if (theme < THEME_COUNT) {
      s_color_theme = theme;
      persist_write_int(PERSIST_KEY_COLOR_THEME, s_color_theme);
      window_set_background_color(s_window, prv_theme()->background);
      text_layer_set_text_color(s_date_layer, prv_theme()->ink);
      layer_mark_dirty(s_canvas_layer);
    }
  }

  Tuple *step_goal_tuple = dict_find(iter, MESSAGE_KEY_DAILY_STEP_GOAL);
  if (step_goal_tuple) {
    const int32_t step_goal = step_goal_tuple->value->int32;
    if (step_goal >= DAILY_STEP_GOAL_MIN && step_goal <= DAILY_STEP_GOAL_MAX) {
      s_daily_step_goal = step_goal;
      persist_write_int(PERSIST_KEY_DAILY_STEP_GOAL, s_daily_step_goal);
      if (s_bottom_bar_metric == BOTTOM_BAR_DAILY_STEPS) {
        prv_update_step_progress();
      }
    }
  }

  Tuple *bar_metric_tuple = dict_find(iter, MESSAGE_KEY_BOTTOM_BAR_METRIC);
  if (bar_metric_tuple) {
    const uint8_t bar_metric = (uint8_t)bar_metric_tuple->value->int32;
    if (bar_metric < BOTTOM_BAR_METRIC_COUNT) {
      s_bottom_bar_metric = bar_metric;
      persist_write_int(PERSIST_KEY_BOTTOM_BAR_METRIC, s_bottom_bar_metric);
      if (s_bottom_bar_metric == BOTTOM_BAR_DAILY_STEPS) {
        prv_update_step_progress();
      }
      layer_mark_dirty(s_canvas_layer);
    }
  }

  if (dict_find(iter, MESSAGE_KEY_SETTINGS_REQUEST)) {
    prv_send_settings();
  }
}

static void prv_canvas_update(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  const int16_t w = bounds.size.w;
  const int16_t stroke = ORANGE_STROKE;
  const ColorTheme *theme = prv_theme();
  const int bar_percent = s_bottom_bar_metric == BOTTOM_BAR_DAILY_STEPS
      ? s_step_goal_percent
      : s_battery_percent;

  // Keep the inner orange area centered and expand the border outward
  GRect base_rect = prv_orange_rect_for_bounds(bounds);
  GRect inner_rect = base_rect;
  inner_rect.origin.x += stroke;
  inner_rect.origin.y += stroke;
  inner_rect.size.w -= 2 * stroke;
  inner_rect.size.h -= 2 * stroke;

  GRect outer_rect = base_rect;
  outer_rect.origin.x -= stroke;
  outer_rect.origin.y -= stroke;
  outer_rect.size.w += 2 * stroke;
  outer_rect.size.h += 2 * stroke;

  GRect shadow_rect = outer_rect;
  shadow_rect.origin.x += w / 30;
  shadow_rect.origin.y += w / 30;
  graphics_context_set_fill_color(ctx, theme->ink);
  graphics_fill_rect(ctx, shadow_rect, 0, GCornerNone);

  // Fill border with straight edges, then overlay inner orange body
  graphics_context_set_fill_color(ctx, theme->ink);
  graphics_fill_rect(ctx, outer_rect, 0, GCornerNone);

  graphics_context_set_fill_color(ctx, theme->body);
  graphics_fill_rect(ctx, inner_rect, 0, GCornerNone);

  // Polygon for 200px wide canvases
  if (w == 200 && s_polygon_200) {
    graphics_context_set_fill_color(ctx, theme->accent);
    gpath_draw_filled(ctx, s_polygon_200);
    graphics_context_set_fill_color(ctx, theme->ink);
    prv_draw_axis_aligned_outline(ctx, s_polygon_info_200.points, s_polygon_info_200.num_points, 4);

    // Base black strip behind the pastel rectangle
    graphics_context_set_fill_color(ctx, theme->ink);
    graphics_fill_rect(ctx, GRect(26, 170, 160, 29), 0, GCornerNone);

    // Pastel yellow box with the same bold outline treatment as the orange rect
    GRect pastel_rect = GRect(22, 150, 155, 45);
    graphics_context_set_fill_color(ctx, theme->ink);
    graphics_fill_rect(ctx, pastel_rect, 0, GCornerNone);

    const int16_t pastel_stroke = stroke * 2;
    GRect pastel_inner = pastel_rect;
    pastel_inner.origin.x += pastel_stroke;
    pastel_inner.origin.y += pastel_stroke;
    pastel_inner.size.w -= 2 * pastel_stroke;
    pastel_inner.size.h -= 2 * pastel_stroke;
    graphics_context_set_fill_color(ctx, theme->battery_frame);
    graphics_fill_rect(ctx, pastel_inner, 0, GCornerNone);

    GRect pastel_core = pastel_inner;
    pastel_core.origin.x += 4;
    pastel_core.origin.y += 4;
    pastel_core.size.w -= 8;
    pastel_core.size.h -= 8;
    graphics_context_set_fill_color(ctx, theme->ink);
    graphics_fill_rect(ctx, pastel_core, 0, GCornerNone);

    GRect bar_bounds = pastel_core;
    bar_bounds.origin.x += 4;
    bar_bounds.origin.y += 4;
    bar_bounds.size.w -= 8;
    bar_bounds.size.h -= 8;
    GRect bar_rect = bar_bounds;
    bar_rect.size.w = (int16_t)((bar_bounds.size.w * bar_percent) / 100);
    graphics_context_set_fill_color(ctx, theme->battery_bar);
    graphics_fill_rect(ctx, bar_rect, 0, GCornerNone);

    // Decorative right-angled outline
    const GPoint deco_points[] = {
      {150, 140},
      {186, 140},
      {186, 213},
      {100, 213},
    };
    graphics_context_set_fill_color(ctx, theme->ink);
    prv_draw_axis_aligned_outline(ctx, deco_points, ARRAY_LENGTH(deco_points), 4);
  } else if (s_polygon_144) {
    graphics_context_set_fill_color(ctx, theme->accent);
    gpath_draw_filled(ctx, s_polygon_144);
    graphics_context_set_fill_color(ctx, theme->ink);
    prv_draw_axis_aligned_outline(ctx, s_polygon_info_144.points, s_polygon_info_144.num_points, 4);

    // Base black strip behind the pastel rectangle (scaled for 144x168)
    graphics_context_set_fill_color(ctx, theme->ink);
    graphics_fill_rect(ctx, GRect(19, 128, 115, 24), 0, GCornerNone);

    // Scaled pastel yellow box with the same outline treatment
    GRect pastel_rect = GRect(16, 111, 112, 38);
    graphics_context_set_fill_color(ctx, theme->ink);
    graphics_fill_rect(ctx, pastel_rect, 0, GCornerNone);

    const int16_t pastel_stroke = stroke * 2;
    GRect pastel_inner = pastel_rect;
    pastel_inner.origin.x += pastel_stroke;
    pastel_inner.origin.y += pastel_stroke;
    pastel_inner.size.w -= 2 * pastel_stroke;
    pastel_inner.size.h -= 2 * pastel_stroke;
    graphics_context_set_fill_color(ctx, theme->battery_frame);
    graphics_fill_rect(ctx, pastel_inner, 0, GCornerNone);

    GRect pastel_core = pastel_inner;
    pastel_core.origin.x += 3;
    pastel_core.origin.y += 3;
    pastel_core.size.w -= 6;
    pastel_core.size.h -= 6;
    graphics_context_set_fill_color(ctx, theme->ink);
    graphics_fill_rect(ctx, pastel_core, 0, GCornerNone);

    GRect bar_bounds = pastel_core;
    bar_bounds.origin.x += 3;
    bar_bounds.origin.y += 3;
    bar_bounds.size.w -= 6;
    bar_bounds.size.h -= 6;
    GRect bar_rect = bar_bounds;
    bar_rect.size.w = (int16_t)((bar_bounds.size.w * bar_percent) / 100);
    graphics_context_set_fill_color(ctx, theme->battery_bar);
    graphics_fill_rect(ctx, bar_rect, 0, GCornerNone);

    // Decorative right-angled outline scaled for 144x168
    const GPoint deco_points[] = {
      {108, 103},
      {134, 103},
      {134, 160},
      {72, 160},
    };
    graphics_context_set_fill_color(ctx, theme->ink);
    prv_draw_axis_aligned_outline(ctx, deco_points, ARRAY_LENGTH(deco_points), 3);
  }

  const size_t time_len = strlen(s_time_buffer);

  int16_t pix_w = bounds.size.w / 40;
  int16_t pix_h = pix_w;
  if (pix_w == 5 && s_current_hour >= 20 && s_current_hour < 24) {
    pix_h = 4;
  }
  if (pix_w < 1) {
    pix_w = 1;
  }
  if (pix_h < 1) {
    pix_h = 1;
  }
  const int16_t glyph_height = 10 * pix_h;

  // Calculate total width with spacing of one pix_w between glyphs
  int16_t total_width = 0;
  for (size_t i = 0; i < time_len; i++) {
    const DigitGlyph *glyph = glyph_for_char(s_time_buffer[i]);
    total_width += glyph_width(glyph) * pix_w;
    if (i < time_len - 1) {
      total_width += pix_w;
    }
  }

  const int16_t start_x = inner_rect.origin.x + (inner_rect.size.w - total_width) / 2;
  const int16_t start_y = inner_rect.origin.y + (inner_rect.size.h - glyph_height) / 2;

  graphics_context_set_fill_color(ctx, theme->ink);

  int16_t cursor_x = start_x;
  for (size_t i = 0; i < time_len; i++) {
    const DigitGlyph *glyph = glyph_for_char(s_time_buffer[i]);
    const int16_t glyph_w = glyph_width(glyph);
    if (!glyph) {
      continue;
    }
    for (int16_t row = 0; row < 10; row++) {
      const char *row_data = glyph->rows[row];
      for (int16_t col = 0; col < glyph_w; col++) {
        if (row_data[col] == '1') {
          GRect pixel_rect = GRect(cursor_x + col * pix_w, start_y + row * pix_h, pix_w, pix_h);
          graphics_fill_rect(ctx, pixel_rect, 0, GCornerNone);
        }
      }
    }
    cursor_x += glyph_w * pix_w + pix_w;
  }
}

static void prv_window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);

  if (bounds.size.w == 200) {
    s_polygon_200 = gpath_create(&s_polygon_info_200);
  } else {
    s_polygon_144 = gpath_create(&s_polygon_info_144);
  }

  s_canvas_layer = layer_create(bounds);
  layer_set_update_proc(s_canvas_layer, prv_canvas_update);
  layer_add_child(window_layer, s_canvas_layer);

  const bool is_200 = bounds.size.w == 200;
  const int16_t center_x = is_200 ? 145 : 105;
  const int16_t date_w = is_200 ? 104 : 72;
  const int16_t date_h = is_200 ? 40 : 28;
  const int16_t date_x = center_x - date_w / 2;
  const int16_t date_y = is_200 ? 0 : 3;

  s_date_layer = text_layer_create(GRect(date_x, date_y, date_w, date_h));
  text_layer_set_background_color(s_date_layer, GColorClear);
  text_layer_set_text_color(s_date_layer, prv_theme()->ink);
  text_layer_set_text_alignment(s_date_layer, GTextAlignmentCenter);

  const uint32_t font_res = is_200 ? RESOURCE_ID_FONT_JERSEY_38 : RESOURCE_ID_FONT_JERSEY_25;
  if (!s_date_font) {
    s_date_font = fonts_load_custom_font(resource_get_handle(font_res));
  }
  text_layer_set_font(s_date_layer, s_date_font);
  layer_add_child(window_layer, text_layer_get_layer(s_date_layer));

  prv_update_time();
}

static void prv_window_unload(Window *window) {
  if (s_polygon_200) {
    gpath_destroy(s_polygon_200);
    s_polygon_200 = NULL;
  }
  if (s_polygon_144) {
    gpath_destroy(s_polygon_144);
    s_polygon_144 = NULL;
  }
  if (s_date_font) {
    fonts_unload_custom_font(s_date_font);
    s_date_font = NULL;
  }
  text_layer_destroy(s_date_layer);
  s_date_layer = NULL;
  layer_destroy(s_canvas_layer);
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
  s_bottom_bar_metric = persist_exists(PERSIST_KEY_BOTTOM_BAR_METRIC)
      ? (uint8_t)persist_read_int(PERSIST_KEY_BOTTOM_BAR_METRIC)
      : BOTTOM_BAR_BATTERY;
  if (s_bottom_bar_metric >= BOTTOM_BAR_METRIC_COUNT) {
    s_bottom_bar_metric = BOTTOM_BAR_BATTERY;
  }
  s_daily_step_goal = persist_exists(PERSIST_KEY_DAILY_STEP_GOAL)
      ? persist_read_int(PERSIST_KEY_DAILY_STEP_GOAL)
      : DAILY_STEP_GOAL_DEFAULT;
  if (s_daily_step_goal < DAILY_STEP_GOAL_MIN || s_daily_step_goal > DAILY_STEP_GOAL_MAX) {
    s_daily_step_goal = DAILY_STEP_GOAL_DEFAULT;
  }

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
#if defined(PBL_HEALTH)
  prv_update_step_progress();
  health_service_events_subscribe(prv_health_handler, NULL);
#endif
  tick_timer_service_subscribe(MINUTE_UNIT, prv_tick_handler);

  app_message_register_inbox_received(prv_inbox_received);
  app_message_open(64, 64);
}

static void prv_deinit(void) {
  battery_state_service_unsubscribe();
#if defined(PBL_HEALTH)
  health_service_events_unsubscribe();
#endif
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
