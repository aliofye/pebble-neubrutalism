#include <ctype.h>
#include <pebble.h>
#include <string.h>

static Window *s_window;
static Layer *s_canvas_layer;
static TextLayer *s_date_layer;
static GFont s_date_font;
static char s_time_buffer[6];
static char s_date_buffer[9];
static int s_current_hour;
static GPath *s_polygon_200;
static GPath *s_polygon_144;

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

typedef struct {
  const char *rows[10];
} DigitGlyph;

static const DigitGlyph s_digit_glyphs[] = {
  // 0
  { .rows = {
      "011110",
      "110011",
      "110011",
      "110011",
      "110011",
      "110011",
      "110011",
      "110011",
      "110011",
      "011110",
    } },
  // 1
  { .rows = {
      "111",
      "111",
      "011",
      "011",
      "011",
      "011",
      "011",
      "011",
      "011",
      "011",
    } },
  // 2
  { .rows = {
      "0111110",
      "1111111",
      "1100011",
      "0000111",
      "0001110",
      "0011100",
      "0111000",
      "1110000",
      "1111111",
      "1111111",
    } },
  // 3
  { .rows = {
      "0111110",
      "1111111",
      "1100011",
      "0000011",
      "0011110",
      "0011110",
      "0000011",
      "1100011",
      "1111111",
      "0111110",
    } },
  // 4
  { .rows = {
      "000011",
      "000111",
      "001111",
      "011011",
      "110011",
      "110011",
      "111111",
      "111111",
      "000011",
      "000011",
    } },
  // 5
  { .rows = {
      "111111",
      "111111",
      "110000",
      "110000",
      "111110",
      "011111",
      "000011",
      "110011",
      "111111",
      "011110",
    } },
  // 6
  { .rows = {
      "0111110",
      "1111111",
      "1100011",
      "1100000",
      "1111110",
      "1111111",
      "1100011",
      "1100011",
      "1111111",
      "0111110",
    } },
  // 7
  { .rows = {
      "111111",
      "111111",
      "000011",
      "000011",
      "000111",
      "001110",
      "001110",
      "001100",
      "001100",
      "001100",
    } },
  // 8
  { .rows = {
      "0111110",
      "1111111",
      "1100011",
      "1100011",
      "0111110",
      "1111111",
      "1100011",
      "1100011",
      "1111111",
      "0111110",
    } },
  // 9
  { .rows = {
      "0111110",
      "1111111",
      "1100011",
      "1100011",
      "1111111",
      "0111111",
      "0000011",
      "1100011",
      "1111111",
      "0111110",
    } },
  // :
  { .rows = {
      "00",
      "00",
      "11",
      "11",
      "00",
      "00",
      "00",
      "00",
      "11",
      "11",
    } },
};

static const DigitGlyph *prv_glyph_for_char(char c) {
  if (c >= '0' && c <= '9') {
    return &s_digit_glyphs[c - '0'];
  }
  if (c == ':') {
    return &s_digit_glyphs[10];
  }
  return NULL;
}

static int16_t prv_glyph_width(const DigitGlyph *glyph) {
  return glyph ? (int16_t)strlen(glyph->rows[0]) : 0;
}

static void prv_update_time(void) {
  time_t now = time(NULL);
  struct tm *tick_time = localtime(&now);

  const int hour = tick_time->tm_hour;
  const int minute = tick_time->tm_min;
  s_current_hour = hour;

  if (hour < 10) {
    snprintf(s_time_buffer, sizeof(s_time_buffer), "%d:%02d", hour, minute);
  } else {
    snprintf(s_time_buffer, sizeof(s_time_buffer), "%02d:%02d", hour, minute);
  }

  strftime(s_date_buffer, sizeof(s_date_buffer), "%b %d", tick_time);
  for (size_t i = 0; s_date_buffer[i]; i++) {
    s_date_buffer[i] = (char)toupper((unsigned char)s_date_buffer[i]);
  }
  if (s_date_layer) {
    text_layer_set_text(s_date_layer, s_date_buffer);
  }

  if (s_canvas_layer) {
    layer_mark_dirty(s_canvas_layer);
  }
}

static GRect prv_orange_rect_for_bounds(GRect bounds) {
  const int16_t w = bounds.size.w;
  const int16_t h = bounds.size.h;
  return GRect(w / 10, h / 5, (w * 8) / 10, h / 3);
}

static void prv_tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  prv_update_time();
}

static void prv_canvas_update(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  const int16_t w = bounds.size.w;
  const int16_t stroke = ORANGE_STROKE;

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
  graphics_context_set_fill_color(ctx, GColorBlack);
  graphics_fill_rect(ctx, shadow_rect, 0, GCornerNone);

  // Fill border with straight edges, then overlay inner orange body
  graphics_context_set_fill_color(ctx, GColorBlack);
  graphics_fill_rect(ctx, outer_rect, 0, GCornerNone);

  graphics_context_set_fill_color(ctx, GColorOrange);
  graphics_fill_rect(ctx, inner_rect, 0, GCornerNone);

  // Polygon for 200px wide canvases
  if (w == 200 && s_polygon_200) {
    graphics_context_set_fill_color(ctx, GColorChromeYellow);
    gpath_draw_filled(ctx, s_polygon_200);
    graphics_context_set_fill_color(ctx, GColorBlack);
    prv_draw_axis_aligned_outline(ctx, s_polygon_info_200.points, s_polygon_info_200.num_points, 4);
  } else if (s_polygon_144) {
    graphics_context_set_fill_color(ctx, GColorChromeYellow);
    gpath_draw_filled(ctx, s_polygon_144);
    graphics_context_set_fill_color(ctx, GColorBlack);
    prv_draw_axis_aligned_outline(ctx, s_polygon_info_144.points, s_polygon_info_144.num_points, 4);
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
    const DigitGlyph *glyph = prv_glyph_for_char(s_time_buffer[i]);
    total_width += prv_glyph_width(glyph) * pix_w;
    if (i < time_len - 1) {
      total_width += pix_w;
    }
  }

  const int16_t start_x = inner_rect.origin.x + (inner_rect.size.w - total_width) / 2;
  const int16_t start_y = inner_rect.origin.y + (inner_rect.size.h - glyph_height) / 2;

  graphics_context_set_fill_color(ctx, GColorBlack);

  int16_t cursor_x = start_x;
  for (size_t i = 0; i < time_len; i++) {
    const DigitGlyph *glyph = prv_glyph_for_char(s_time_buffer[i]);
    const int16_t glyph_w = prv_glyph_width(glyph);
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
  const int16_t center_y = is_200 ? 20 : 17;
  const int16_t date_w = is_200 ? 90 : 72;
  const int16_t date_h = is_200 ? 40 : 28;
  s_date_layer = text_layer_create(GRect(center_x - date_w / 2, center_y - date_h / 2, date_w, date_h));
  text_layer_set_background_color(s_date_layer, GColorClear);
  text_layer_set_text_color(s_date_layer, GColorBlack);
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
  s_window = window_create();
  window_set_background_color(s_window, GColorPastelYellow);
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = prv_window_load,
    .unload = prv_window_unload,
  });
  const bool animated = true;
  window_stack_push(s_window, animated);

  tick_timer_service_subscribe(MINUTE_UNIT, prv_tick_handler);
}

static void prv_deinit(void) {
  tick_timer_service_unsubscribe();
  window_destroy(s_window);
}

int main(void) {
  prv_init();

  APP_LOG(APP_LOG_LEVEL_DEBUG, "Done initializing, pushed window: %p", s_window);

  app_event_loop();
  prv_deinit();
}
