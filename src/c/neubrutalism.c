#include <ctype.h>
#include <pebble.h>
#include <stdio.h>
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
static GPath *s_polygon_200_weather;
static GPath *s_polygon_144_weather;
static TextLayer *s_weather_layer;
static char s_weather_buffer[8];
static int s_weather_temp;
static uint8_t s_weather_units;
static bool s_weather_available;
static int s_battery_percent = 100;
static int s_step_goal_percent;
static int32_t s_daily_step_goal;
static bool s_use_24_hour;
static uint8_t s_color_theme;

enum {
  PERSIST_KEY_TIME_FORMAT = 1,
  PERSIST_KEY_COLOR_THEME = 2,
  PERSIST_KEY_DAILY_STEP_GOAL = 4,
  PERSIST_KEY_WEATHER_UNITS = 5,
  PERSIST_KEY_WEATHER_TEMP = 6,
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

typedef struct {
  GColor background;
  GColor body;
  GColor accent;
  GColor battery_frame;
  GColor battery_bar;
  GColor ink;
  bool battery_status;
  GColor battery_low;
  GColor battery_mid;
  GColor battery_high;
} ColorTheme;

static const ColorTheme s_color_themes[THEME_COUNT] = {
  [THEME_NEUBRUTALISM] = {
    .background = GColorPastelYellow,
    .body = GColorOrange,
    .accent = GColorChromeYellow,
    .battery_frame = GColorPastelYellow,
    .battery_bar = GColorLavenderIndigo,
    .ink = GColorBlack,
    .battery_status = true,
    .battery_low = GColorRed,
    .battery_mid = GColorChromeYellow,
    .battery_high = GColorMayGreen,
  },
  [THEME_GAME_BOY_GREEN] = {
    .background = GColorLightGray,
    .body = GColorMayGreen,
    .accent = GColorMintGreen,
    .battery_frame = GColorLightGray,
    .battery_bar = GColorDarkGreen,
    .ink = GColorBlack,
  },
  [THEME_OCEAN_BLUE] = {
    .background = GColorCeleste,
    .body = GColorPictonBlue,
    .accent = GColorElectricBlue,
    .battery_frame = GColorCeleste,
    .battery_bar = GColorCobaltBlue,
    .ink = GColorBlack,
  },
  [THEME_AMBER_LCD] = {
    .background = GColorPastelYellow,
    .body = GColorChromeYellow,
    .accent = GColorIcterine,
    .battery_frame = GColorPastelYellow,
    .battery_bar = GColorOrange,
    .ink = GColorBlack,
  },
  [THEME_MONOCHROME] = {
    .background = GColorLightGray,
    .body = GColorWhite,
    .accent = GColorWhite,
    .battery_frame = GColorLightGray,
    .battery_bar = GColorDarkGray,
    .ink = GColorBlack,
  },
  [THEME_PURPLE_PIXEL] = {
    .background = GColorRichBrilliantLavender,
    .body = GColorLavenderIndigo,
    .accent = GColorBabyBlueEyes,
    .battery_frame = GColorRichBrilliantLavender,
    .battery_bar = GColorIndigo,
    .ink = GColorBlack,
  },
};

static const ColorTheme *prv_theme(void) {
  return &s_color_themes[s_color_theme < THEME_COUNT ? s_color_theme : THEME_NEUBRUTALISM];
}

static const int16_t ORANGE_STROKE = 3;
static const int16_t METRIC_SHADOW_OFFSET = 3;

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

static const GPathInfo s_polygon_info_200_weather = {
  .num_points = 13,
  .points = (GPoint[]) {
    {100, 12},
    {10, 12},
    {10, 45},
    {13, 45},
    {13, 48},
    {16, 48},
    {16, 51},
    {19, 51},
    {19, 55},
    {25, 55},
    {25, 45},
    {25, 45},
    {100, 45},
  },
};

static const GPathInfo s_polygon_info_144_weather = {
  .num_points = 13,
  .points = (GPoint[]) {
    {72, 9},
    {7, 9},
    {7, 33},
    {9, 33},
    {9, 35},
    {12, 35},
    {12, 38},
    {14, 38},
    {14, 41},
    {18, 41},
    {18, 33},
    {18, 33},
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
    if (s_canvas_layer) {
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
  dict_write_int32(iter, MESSAGE_KEY_DAILY_STEP_GOAL, s_daily_step_goal);
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
      prv_update_step_progress();
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

  Tuple *weather_temp_tuple = dict_find(iter, MESSAGE_KEY_WEATHER_TEMP);
  if (weather_temp_tuple) {
    s_weather_temp = weather_temp_tuple->value->int32;
    s_weather_available = true;
    persist_write_int(PERSIST_KEY_WEATHER_TEMP, s_weather_temp);
    prv_update_weather_text();
  }

  if (dict_find(iter, MESSAGE_KEY_SETTINGS_REQUEST)) {
    prv_send_settings();
  }
}

static void prv_draw_metric_bar(GContext *ctx, const ColorTheme *theme, GRect box,
                                int16_t stroke, int16_t percent, GColor fill) {
  // Black base/shadow strip behind the pastel box, poking out right and below
  GRect strip = box;
  strip.origin.x += 2;
  strip.origin.y += METRIC_SHADOW_OFFSET;
  strip.size.w += 2;
  graphics_context_set_fill_color(ctx, theme->ink);
  graphics_fill_rect(ctx, strip, 0, GCornerNone);

  // Ink outline box
  graphics_context_set_fill_color(ctx, theme->ink);
  graphics_fill_rect(ctx, box, 0, GCornerNone);

  // Pastel frame inset
  const int16_t frame_stroke = stroke * 2;
  GRect frame = box;
  frame.origin.x += frame_stroke;
  frame.origin.y += frame_stroke;
  frame.size.w -= 2 * frame_stroke;
  frame.size.h -= 2 * frame_stroke;
  graphics_context_set_fill_color(ctx, theme->battery_frame);
  graphics_fill_rect(ctx, frame, 0, GCornerNone);

  // Black core
  GRect core = frame;
  core.origin.x += 3;
  core.origin.y += 3;
  core.size.w -= 6;
  core.size.h -= 6;
  graphics_context_set_fill_color(ctx, theme->ink);
  graphics_fill_rect(ctx, core, 0, GCornerNone);

  // Colored progress bar
  GRect bar = core;
  bar.origin.x += 3;
  bar.origin.y += 3;
  bar.size.w -= 6;
  bar.size.h -= 6;
  bar.size.w = (int16_t)((bar.size.w * percent) / 100);
  graphics_context_set_fill_color(ctx, fill);
  graphics_fill_rect(ctx, bar, 0, GCornerNone);
}

static GColor prv_battery_color(const ColorTheme *theme, int percent) {
  if (!theme->battery_status) {
    return theme->battery_bar;
  }
  if (percent < 20) {
    return theme->battery_low;
  }
  if (percent < 50) {
    return theme->battery_mid;
  }
  return theme->battery_high;
}

static void prv_canvas_update(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  const int16_t w = bounds.size.w;
  const int16_t stroke = ORANGE_STROKE;
  const ColorTheme *theme = prv_theme();

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

  // Bottom of the time box including its shadow
  const int16_t time_bottom = outer_rect.origin.y + outer_rect.size.h + w / 30;

  // Polygon for 200px wide canvases
  if (w == 200 && s_polygon_200) {
    graphics_context_set_fill_color(ctx, theme->accent);
    gpath_draw_filled(ctx, s_polygon_200);
    graphics_context_set_fill_color(ctx, theme->ink);
    prv_draw_axis_aligned_outline(ctx, s_polygon_info_200.points, s_polygon_info_200.num_points, 4);

    // Weather bubble: white fill, black border, mirrors the date bubble
    graphics_context_set_fill_color(ctx, GColorWhite);
    gpath_draw_filled(ctx, s_polygon_200_weather);
    graphics_context_set_fill_color(ctx, theme->ink);
    prv_draw_axis_aligned_outline(ctx, s_polygon_info_200_weather.points, s_polygon_info_200_weather.num_points, 4);

    // Battery bar (top) and step-goal bar (bottom), stacked and vertically
    // centered between the time box shadow and the bottom of the screen
    const int16_t bar_h = 32;
    const int16_t bar_gap = 8;
    const int16_t stack_h = bar_h * 2 + bar_gap + METRIC_SHADOW_OFFSET;
    const int16_t avail_h = bounds.size.h - time_bottom;
    const int16_t stack_top = time_bottom + (avail_h - stack_h) / 2;
    prv_draw_metric_bar(ctx, theme, GRect(22, stack_top, 155, bar_h), stroke, s_battery_percent,
                        prv_battery_color(theme, s_battery_percent));
    prv_draw_metric_bar(ctx, theme, GRect(22, stack_top + bar_h + bar_gap, 155, bar_h),
                        stroke, s_step_goal_percent, GColorWhite);
  } else if (s_polygon_144) {
    graphics_context_set_fill_color(ctx, theme->accent);
    gpath_draw_filled(ctx, s_polygon_144);
    graphics_context_set_fill_color(ctx, theme->ink);
    prv_draw_axis_aligned_outline(ctx, s_polygon_info_144.points, s_polygon_info_144.num_points, 4);

    // Weather bubble: white fill, black border, mirrors the date bubble
    graphics_context_set_fill_color(ctx, GColorWhite);
    gpath_draw_filled(ctx, s_polygon_144_weather);
    graphics_context_set_fill_color(ctx, theme->ink);
    prv_draw_axis_aligned_outline(ctx, s_polygon_info_144_weather.points, s_polygon_info_144_weather.num_points, 4);

    // Battery bar (top) and step-goal bar (bottom), stacked and vertically
    // centered between the time box shadow and the bottom of the screen
    const int16_t bar_h = 24;
    const int16_t bar_gap = 6;
    const int16_t stack_h = bar_h * 2 + bar_gap + METRIC_SHADOW_OFFSET;
    const int16_t avail_h = bounds.size.h - time_bottom;
    const int16_t stack_top = time_bottom + (avail_h - stack_h) / 2;
    prv_draw_metric_bar(ctx, theme, GRect(16, stack_top, 112, bar_h), stroke, s_battery_percent,
                        prv_battery_color(theme, s_battery_percent));
    prv_draw_metric_bar(ctx, theme, GRect(16, stack_top + bar_h + bar_gap, 112, bar_h),
                        stroke, s_step_goal_percent, GColorWhite);
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
    s_polygon_200_weather = gpath_create(&s_polygon_info_200_weather);
  } else {
    s_polygon_144 = gpath_create(&s_polygon_info_144);
    s_polygon_144_weather = gpath_create(&s_polygon_info_144_weather);
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

  // Weather bubble mirrors the date bubble on the left of the time box
  const int16_t weather_x = is_200 ? 3 : 3;
  const int16_t weather_y = is_200 ? 0 : 3;
  s_weather_layer = text_layer_create(GRect(weather_x, weather_y, date_w, date_h));
  text_layer_set_background_color(s_weather_layer, GColorClear);
  text_layer_set_text_color(s_weather_layer, GColorBlack);
  text_layer_set_text_alignment(s_weather_layer, GTextAlignmentCenter);

  const uint32_t font_res = is_200 ? RESOURCE_ID_FONT_JERSEY_38 : RESOURCE_ID_FONT_JERSEY_25;
  if (!s_date_font) {
    s_date_font = fonts_load_custom_font(resource_get_handle(font_res));
  }
  text_layer_set_font(s_date_layer, s_date_font);
  layer_add_child(window_layer, text_layer_get_layer(s_date_layer));
  text_layer_set_font(s_weather_layer, s_date_font);
  layer_add_child(window_layer, text_layer_get_layer(s_weather_layer));

  prv_update_time();
  prv_update_weather_text();
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
  if (s_polygon_200_weather) {
    gpath_destroy(s_polygon_200_weather);
    s_polygon_200_weather = NULL;
  }
  if (s_polygon_144_weather) {
    gpath_destroy(s_polygon_144_weather);
    s_polygon_144_weather = NULL;
  }
  if (s_date_font) {
    fonts_unload_custom_font(s_date_font);
    s_date_font = NULL;
  }
  text_layer_destroy(s_date_layer);
  s_date_layer = NULL;
  text_layer_destroy(s_weather_layer);
  s_weather_layer = NULL;
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
  s_daily_step_goal = persist_exists(PERSIST_KEY_DAILY_STEP_GOAL)
      ? persist_read_int(PERSIST_KEY_DAILY_STEP_GOAL)
      : DAILY_STEP_GOAL_DEFAULT;
  if (s_daily_step_goal < DAILY_STEP_GOAL_MIN || s_daily_step_goal > DAILY_STEP_GOAL_MAX) {
    s_daily_step_goal = DAILY_STEP_GOAL_DEFAULT;
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
