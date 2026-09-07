#include <ctype.h>
#include <pebble.h>
#include <stdio.h>
#include <string.h>

#include "glyphs.h"
#include "layout.h"
#include "message_keys.auto.h"
#include "steps_util.h"
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
static GPath *s_polygon_200;
static GPath *s_polygon_144;
static GPath *s_polygon_200_weather;
static GPath *s_polygon_144_weather;
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
  bool weather_condition_colors;
  GColor step_bar;
  GColor step_bar_dark;
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
    .weather_condition_colors = true,
    .step_bar = GColorLavenderIndigo,
    .step_bar_dark = GColorIndigo,
  },
  [THEME_GAME_BOY_GREEN] = {
    .background = GColorLightGray,
    .body = GColorMayGreen,
    .accent = GColorMintGreen,
    .battery_frame = GColorLightGray,
    .battery_bar = GColorDarkGreen,
    .ink = GColorBlack,
    .step_bar = GColorMintGreen,
    .step_bar_dark = GColorMediumSpringGreen,
  },
  [THEME_OCEAN_BLUE] = {
    .background = GColorCeleste,
    .body = GColorPictonBlue,
    .accent = GColorElectricBlue,
    .battery_frame = GColorCeleste,
    .battery_bar = GColorCobaltBlue,
    .ink = GColorBlack,
    .step_bar = GColorElectricBlue,
    .step_bar_dark = GColorCobaltBlue,
  },
  [THEME_AMBER_LCD] = {
    .background = GColorPastelYellow,
    .body = GColorChromeYellow,
    .accent = GColorIcterine,
    .battery_frame = GColorPastelYellow,
    .battery_bar = GColorOrange,
    .ink = GColorBlack,
    .step_bar = GColorIcterine,
    .step_bar_dark = GColorChromeYellow,
  },
  [THEME_MONOCHROME] = {
    .background = GColorLightGray,
    .body = GColorWhite,
    .accent = GColorWhite,
    .battery_frame = GColorLightGray,
    .battery_bar = GColorDarkGray,
    .ink = GColorBlack,
    .step_bar = GColorWhite,
    .step_bar_dark = GColorLightGray,
  },
  [THEME_PURPLE_PIXEL] = {
    .background = GColorRichBrilliantLavender,
    .body = GColorLavenderIndigo,
    .accent = GColorBabyBlueEyes,
    .battery_frame = GColorRichBrilliantLavender,
    .battery_bar = GColorIndigo,
    .ink = GColorBlack,
    .step_bar = GColorBabyBlueEyes,
    .step_bar_dark = GColorIndigo,
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
    // Uncapped on purpose: the bar fill clamps at full, the overflow
    // overwrite reads the remainder.
    progress = step_goal_percent(steps, s_daily_step_goal);
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

static GRect prv_orange_rect_for_bounds(GRect bounds) {
  int x, y, rw, rh;
  orange_rect(bounds.size.w, bounds.size.h, &x, &y, &rw, &rh);
  return GRect(x, y, rw, rh);
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

  // Pastel frame inset. Short boxes (144px stacked bars) use single-stroke
  // framing and 2px inner insets so the colored fill keeps visible height.
  const bool compact = box.size.h < 30;
  const int16_t frame_stroke = compact ? stroke : stroke * 2;
  const int16_t inner_inset = compact ? 2 : 3;
  GRect frame = box;
  frame.origin.x += frame_stroke;
  frame.origin.y += frame_stroke;
  frame.size.w -= 2 * frame_stroke;
  frame.size.h -= 2 * frame_stroke;
  graphics_context_set_fill_color(ctx, theme->battery_frame);
  graphics_fill_rect(ctx, frame, 0, GCornerNone);

  // Black core
  GRect core = frame;
  core.origin.x += inner_inset;
  core.origin.y += inner_inset;
  core.size.w -= 2 * inner_inset;
  core.size.h -= 2 * inner_inset;
  graphics_context_set_fill_color(ctx, theme->ink);
  graphics_fill_rect(ctx, core, 0, GCornerNone);

  // Colored progress bar. Percent may exceed 100 (step-goal overflow);
  // the fill clamps at full and the overflow overwrite shows the rest.
  GRect bar = core;
  bar.origin.x += inner_inset;
  bar.origin.y += inner_inset;
  bar.size.w -= 2 * inner_inset;
  bar.size.h -= 2 * inner_inset;
  const int16_t clamped = percent > 100 ? 100 : percent;
  bar.size.w = (int16_t)((bar.size.w * clamped) / 100);
  graphics_context_set_fill_color(ctx, fill);
  graphics_fill_rect(ctx, bar, 0, GCornerNone);

  // Overflow overwrite: the same region redrawn in the theme's darker step
  // shade, growing left-to-right with overflow (100->200% rescaled across
  // the fill). The leading edge dissolves into the base fill with a
  // checkerboard dither fade (flat pixels only: no gradients, still
  // axis-aligned). Under 100% this block never runs, so normal bars are
  // pixel-identical to before.
  if (percent > 100) {
    const int16_t ow = (int16_t)overflow_overwrite_width(bar.size.w, percent);
    const int16_t y = bar.origin.y;
    const int16_t h = bar.size.h;
    const int16_t end = bar.origin.x + ow;
    const int16_t fade_w = ow < 8 ? ow : 8;
    const int16_t solid_end = end - fade_w;
    graphics_context_set_fill_color(ctx, theme->step_bar_dark);
    graphics_fill_rect(ctx, GRect(bar.origin.x, y, solid_end - bar.origin.x, h),
                       0, GCornerNone);
    for (int16_t dx = 0; dx < fade_w; dx += 2) {
      for (int16_t dy = 0; dy < h; dy += 2) {
        if ((((solid_end + dx) >> 1) + ((y + dy) >> 1)) & 1) {
          continue;
        }
        int16_t cw = 2;
        if (dx + cw > fade_w) {
          cw = fade_w - dx;
        }
        int16_t ch = 2;
        if (dy + ch > h) {
          ch = h - dy;
        }
        graphics_fill_rect(ctx, GRect(solid_end + dx, y + dy, cw, ch), 0, GCornerNone);
      }
    }
  }
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

static GColor prv_weather_bubble_color(const ColorTheme *theme, bool available) {
  if (!available || !theme->weather_condition_colors) {
    return GColorWhite;
  }
  switch (s_weather_code) {
    case 0:
    case 1:
      return GColorChromeYellow;
    case 2:
    case 3:
    case 45:
    case 48:
      return GColorLightGray;
    case 51:
    case 53:
    case 55:
    case 56:
    case 57:
    case 61:
    case 63:
    case 65:
    case 66:
    case 67:
    case 80:
    case 81:
    case 82:
      return GColorBabyBlueEyes;
    case 95:
    case 96:
    case 99:
      return GColorVividViolet;
    default:
      return GColorWhite; // snow (71-77, 85-86) and unknown
  }
}

// Static chrome: time box, polygons, weather bubble, BT icon. Redraws only on
// theme / weather / bluetooth changes, never on the minute tick.
static void prv_background_update_proc(Layer *layer, GContext *ctx) {
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

  // Polygon for 200px wide canvases
  if (w == 200 && s_polygon_200) {
    graphics_context_set_fill_color(ctx, GColorWhite);
    gpath_draw_filled(ctx, s_polygon_200);
    graphics_context_set_fill_color(ctx, theme->ink);
    prv_draw_axis_aligned_outline(ctx, s_polygon_info_200.points, s_polygon_info_200.num_points, 4);

    // Weather bubble: condition-colored fill, black border, mirrors the date bubble
    if (s_weather_enabled || !s_bt_connected) {
      graphics_context_set_fill_color(ctx, prv_weather_bubble_color(theme, s_weather_available));
      gpath_draw_filled(ctx, s_polygon_200_weather);
      graphics_context_set_fill_color(ctx, theme->ink);
      prv_draw_axis_aligned_outline(ctx, s_polygon_info_200_weather.points, s_polygon_info_200_weather.num_points, 4);
    }
  } else if (s_polygon_144) {
    graphics_context_set_fill_color(ctx, GColorWhite);
    gpath_draw_filled(ctx, s_polygon_144);
    graphics_context_set_fill_color(ctx, theme->ink);
    prv_draw_axis_aligned_outline(ctx, s_polygon_info_144.points, s_polygon_info_144.num_points, 4);

    // Weather bubble: condition-colored fill, black border, mirrors the date bubble
    if (s_weather_enabled || !s_bt_connected) {
      graphics_context_set_fill_color(ctx, prv_weather_bubble_color(theme, s_weather_available));
      gpath_draw_filled(ctx, s_polygon_144_weather);
      graphics_context_set_fill_color(ctx, theme->ink);
      prv_draw_axis_aligned_outline(ctx, s_polygon_info_144_weather.points, s_polygon_info_144_weather.num_points, 4);
    }
  }

  if (!s_bt_connected && s_bt_icon_bitmap) {
    const GRect bounds_icon = gbitmap_get_bounds(s_bt_icon_bitmap);
    const int16_t iw = bounds_icon.size.w;
    const int16_t ih = bounds_icon.size.h;
    const GPoint center = w == 200 ? GPoint(55, 28) : GPoint(39, 25);
    graphics_context_set_compositing_mode(ctx, GCompOpSet);
    graphics_draw_bitmap_in_rect(ctx, s_bt_icon_bitmap,
                                 GRect(center.x - iw / 2, center.y - ih / 2, iw, ih));
    graphics_context_set_compositing_mode(ctx, GCompOpAssign);
  }
}

// Metric bars: either a single full-height bar or two stacked bars, vertically
// centered between the time box shadow and the screen bottom. This layer's
// frame starts at the bottom of the time box shadow, so coordinates here are
// relative to it; redraws only on battery/step/theme/bars-mode changes.
static void prv_bars_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  const int16_t stroke = ORANGE_STROKE;
  const ColorTheme *theme = prv_theme();
  const bool is_200 = bounds.size.w == 200;
  const int16_t bar_x = is_200 ? 22 : 16;
  const int16_t bar_w = is_200 ? 155 : 112;

  const int16_t avail_h = bounds.size.h;
  if (s_bars_mode == BARS_BATTERY_ONLY || s_bars_mode == BARS_STEPS_ONLY) {
    const int16_t bar_h = is_200 ? 45 : 38;
    const int16_t bar_top = (avail_h - (bar_h + METRIC_SHADOW_OFFSET)) / 2;
    const int percent = s_bars_mode == BARS_BATTERY_ONLY
        ? s_battery_percent
        : s_step_goal_percent;
    const GColor fill = s_bars_mode == BARS_BATTERY_ONLY
        ? prv_battery_color(theme, s_battery_percent)
        : theme->step_bar;
    prv_draw_metric_bar(ctx, theme, GRect(bar_x, bar_top, bar_w, bar_h), stroke, percent, fill);
  } else {
    const int16_t bar_h = is_200 ? 32 : 24;
    const int16_t bar_gap = is_200 ? 8 : 6;
    const int16_t stack_h = bar_h * 2 + bar_gap + METRIC_SHADOW_OFFSET;
    const int16_t stack_top = (avail_h - stack_h) / 2;
    prv_draw_metric_bar(ctx, theme, GRect(bar_x, stack_top, bar_w, bar_h), stroke,
                        s_battery_percent, prv_battery_color(theme, s_battery_percent));
    prv_draw_metric_bar(ctx, theme, GRect(bar_x, stack_top + bar_h + bar_gap, bar_w, bar_h),
                        stroke, s_step_goal_percent, theme->step_bar);
  }
}

// Time digits: this layer's frame is the inner (orange) area of the time box,
// so glyphs are centered within the layer bounds. Pixel scale derives from the
// full screen width, not the layer width. This is the only layer redrawn on
// the minute tick.
static void prv_time_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  const ColorTheme *theme = prv_theme();

  const size_t time_len = strlen(s_time_buffer);

  int16_t pix_w = s_screen_w / 40;
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

  const int16_t start_x = (bounds.size.w - total_width) / 2;
  const int16_t start_y = (bounds.size.h - glyph_height) / 2;

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

  s_screen_w = bounds.size.w;

  // Static chrome: boxes, polygons, weather bubble, BT icon
  s_background_layer = layer_create(bounds);
  layer_set_update_proc(s_background_layer, prv_background_update_proc);
  layer_add_child(window_layer, s_background_layer);

  // Metric bars live below the time box shadow and redraw only on
  // battery/step/theme/bars-mode changes
  const GRect base_rect = prv_orange_rect_for_bounds(bounds);
  const int16_t time_bottom = base_rect.origin.y + base_rect.size.h + ORANGE_STROKE + s_screen_w / 30;
  s_bars_layer = layer_create(GRect(0, time_bottom, bounds.size.w, bounds.size.h - time_bottom));
  layer_set_update_proc(s_bars_layer, prv_bars_update_proc);
  layer_add_child(window_layer, s_bars_layer);

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

  // Time digits redraw every minute; the layer is exactly the orange area
  GRect time_frame = base_rect;
  time_frame.origin.x += ORANGE_STROKE;
  time_frame.origin.y += ORANGE_STROKE;
  time_frame.size.w -= 2 * ORANGE_STROKE;
  time_frame.size.h -= 2 * ORANGE_STROKE;
  s_time_layer = layer_create(time_frame);
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
