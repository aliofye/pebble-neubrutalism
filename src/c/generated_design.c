/* DO NOT EDIT - generated from neubrutalism-plus.design.json by tools/pebble-editor/generate.js */
#include "generated_design.h"

#include <string.h>

#include "glyphs.h"

const NeubrutalismPlusTheme NEUBRUTALISM_PLUS_THEMES[6] = {
  { /* neubrutalism */
    .background = GColorPastelYellow,
    .body = GColorOrange,
    .accent = GColorChromeYellow,
    .battery_frame = GColorPastelYellow,
    .battery_bar = GColorLavenderIndigo,
    .ink = GColorBlack,
    .battery_low = GColorRed,
    .battery_mid = GColorChromeYellow,
    .battery_high = GColorMayGreen,
    .step_bar = GColorLavenderIndigo,
    .battery_status = true,
    .weather_condition_colors = true,
  },
  { /* game_boy_green */
    .background = GColorLightGray,
    .body = GColorMayGreen,
    .accent = GColorMintGreen,
    .battery_frame = GColorLightGray,
    .battery_bar = GColorDarkGreen,
    .ink = GColorBlack,
    .battery_low = GColorDarkGreen,
    .battery_mid = GColorDarkGreen,
    .battery_high = GColorDarkGreen,
    .step_bar = GColorMintGreen,
    .battery_status = false,
    .weather_condition_colors = false,
  },
  { /* ocean_blue */
    .background = GColorCeleste,
    .body = GColorPictonBlue,
    .accent = GColorElectricBlue,
    .battery_frame = GColorCeleste,
    .battery_bar = GColorCobaltBlue,
    .ink = GColorBlack,
    .battery_low = GColorCobaltBlue,
    .battery_mid = GColorCobaltBlue,
    .battery_high = GColorCobaltBlue,
    .step_bar = GColorElectricBlue,
    .battery_status = false,
    .weather_condition_colors = false,
  },
  { /* amber_lcd */
    .background = GColorPastelYellow,
    .body = GColorChromeYellow,
    .accent = GColorIcterine,
    .battery_frame = GColorPastelYellow,
    .battery_bar = GColorOrange,
    .ink = GColorBlack,
    .battery_low = GColorOrange,
    .battery_mid = GColorOrange,
    .battery_high = GColorOrange,
    .step_bar = GColorIcterine,
    .battery_status = false,
    .weather_condition_colors = false,
  },
  { /* monochrome */
    .background = GColorLightGray,
    .body = GColorWhite,
    .accent = GColorWhite,
    .battery_frame = GColorLightGray,
    .battery_bar = GColorDarkGray,
    .ink = GColorBlack,
    .battery_low = GColorDarkGray,
    .battery_mid = GColorDarkGray,
    .battery_high = GColorDarkGray,
    .step_bar = GColorWhite,
    .battery_status = false,
    .weather_condition_colors = false,
  },
  { /* purple_pixel */
    .background = GColorRichBrilliantLavender,
    .body = GColorLavenderIndigo,
    .accent = GColorBabyBlueEyes,
    .battery_frame = GColorRichBrilliantLavender,
    .battery_bar = GColorIndigo,
    .ink = GColorBlack,
    .battery_low = GColorIndigo,
    .battery_mid = GColorIndigo,
    .battery_high = GColorIndigo,
    .step_bar = GColorBabyBlueEyes,
    .battery_status = false,
    .weather_condition_colors = false,
  },
};

static void neubrutalism_plus_axis_outline(GContext *ctx, const GPoint *points, size_t count, int16_t stroke) {
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

static void neubrutalism_plus_meterbar(GContext *ctx, int16_t x, int16_t y, int16_t w, int16_t h,
    int16_t stroke, int16_t shdx, int16_t shdy, GColor ink_c, GColor frame_c, GColor core_c,
    GColor fill_c, int percent, int16_t inset, int16_t cmaxh, int16_t cstroke, int16_t cinset) {
  GRect strip = GRect(x + shdx, y + shdy, w + shdx, h);
  graphics_context_set_fill_color(ctx, ink_c);
  graphics_fill_rect(ctx, strip, 0, GCornerNone);
  graphics_context_set_fill_color(ctx, ink_c);
  graphics_fill_rect(ctx, GRect(x, y, w, h), 0, GCornerNone);
  const bool compact = h < cmaxh;
  const int16_t frame_stroke = compact ? cstroke : stroke * 2;
  const int16_t inner_inset = compact ? cinset : inset;
  GRect frame = GRect(x + frame_stroke, y + frame_stroke, w - 2 * frame_stroke, h - 2 * frame_stroke);
  graphics_context_set_fill_color(ctx, frame_c);
  graphics_fill_rect(ctx, frame, 0, GCornerNone);
  GRect core = GRect(frame.origin.x + inner_inset, frame.origin.y + inner_inset,
      frame.size.w - 2 * inner_inset, frame.size.h - 2 * inner_inset);
  graphics_context_set_fill_color(ctx, core_c);
  graphics_fill_rect(ctx, core, 0, GCornerNone);
  GRect bar = GRect(core.origin.x + inner_inset, core.origin.y + inner_inset,
      core.size.w - 2 * inner_inset, core.size.h - 2 * inner_inset);
  bar.size.w = (int16_t)((bar.size.w * percent) / 100);
  graphics_context_set_fill_color(ctx, fill_c);
  graphics_fill_rect(ctx, bar, 0, GCornerNone);
}

static const GPoint NEUBRUTALISM_PLUS_W200_BACKGROUND_POLY0_PTS[] = {
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
    {100, 45}
  };

static const GPathInfo NEUBRUTALISM_PLUS_W200_BACKGROUND_POLY0_INFO = { 13, (GPoint *)NEUBRUTALISM_PLUS_W200_BACKGROUND_POLY0_PTS };

static GPath *s_neubrutalism_plus_w200_background_p0;

static const GPoint NEUBRUTALISM_PLUS_W200_BACKGROUND_POLY1_PTS[] = {
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
    {100, 45}
  };

static const GPathInfo NEUBRUTALISM_PLUS_W200_BACKGROUND_POLY1_INFO = { 13, (GPoint *)NEUBRUTALISM_PLUS_W200_BACKGROUND_POLY1_PTS };

static GPath *s_neubrutalism_plus_w200_background_p1;

static const GPoint NEUBRUTALISM_PLUS_W144_BACKGROUND_POLY0_PTS[] = {
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
    {72, 33}
  };

static const GPathInfo NEUBRUTALISM_PLUS_W144_BACKGROUND_POLY0_INFO = { 13, (GPoint *)NEUBRUTALISM_PLUS_W144_BACKGROUND_POLY0_PTS };

static GPath *s_neubrutalism_plus_w144_background_p0;

static const GPoint NEUBRUTALISM_PLUS_W144_BACKGROUND_POLY1_PTS[] = {
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
    {72, 33}
  };

static const GPathInfo NEUBRUTALISM_PLUS_W144_BACKGROUND_POLY1_INFO = { 13, (GPoint *)NEUBRUTALISM_PLUS_W144_BACKGROUND_POLY1_PTS };

static GPath *s_neubrutalism_plus_w144_background_p1;

void neubrutalism_plus_w200_background_polygons_create(void) {
  s_neubrutalism_plus_w200_background_p0 = gpath_create(&NEUBRUTALISM_PLUS_W200_BACKGROUND_POLY0_INFO);
  s_neubrutalism_plus_w200_background_p1 = gpath_create(&NEUBRUTALISM_PLUS_W200_BACKGROUND_POLY1_INFO);
}

void neubrutalism_plus_w200_background_polygons_destroy(void) {
  if (s_neubrutalism_plus_w200_background_p0) { gpath_destroy(s_neubrutalism_plus_w200_background_p0); s_neubrutalism_plus_w200_background_p0 = NULL; }
  if (s_neubrutalism_plus_w200_background_p1) { gpath_destroy(s_neubrutalism_plus_w200_background_p1); s_neubrutalism_plus_w200_background_p1 = NULL; }
}

void neubrutalism_plus_w144_background_polygons_create(void) {
  s_neubrutalism_plus_w144_background_p0 = gpath_create(&NEUBRUTALISM_PLUS_W144_BACKGROUND_POLY0_INFO);
  s_neubrutalism_plus_w144_background_p1 = gpath_create(&NEUBRUTALISM_PLUS_W144_BACKGROUND_POLY1_INFO);
}

void neubrutalism_plus_w144_background_polygons_destroy(void) {
  if (s_neubrutalism_plus_w144_background_p0) { gpath_destroy(s_neubrutalism_plus_w144_background_p0); s_neubrutalism_plus_w144_background_p0 = NULL; }
  if (s_neubrutalism_plus_w144_background_p1) { gpath_destroy(s_neubrutalism_plus_w144_background_p1); s_neubrutalism_plus_w144_background_p1 = NULL; }
}

static GColor neubrutalism_plus_fill_0(const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st) {
  if (((th->weather_condition_colors == false))) return GColorWhite;
  if (((st->weather_available == false))) return GColorWhite;
  if (((st->weather_code == 0 || st->weather_code == 1))) return GColorChromeYellow;
  if (((st->weather_code == 2 || st->weather_code == 3 || st->weather_code == 45 || st->weather_code == 48))) return GColorLightGray;
  if (((st->weather_code == 51 || st->weather_code == 53 || st->weather_code == 55 || st->weather_code == 56 || st->weather_code == 57 || st->weather_code == 61 || st->weather_code == 63 || st->weather_code == 65 || st->weather_code == 66 || st->weather_code == 67 || st->weather_code == 80 || st->weather_code == 81 || st->weather_code == 82))) return GColorBabyBlueEyes;
  if (((st->weather_code == 95 || st->weather_code == 96 || st->weather_code == 99))) return GColorVividViolet;
  return GColorWhite;
}

void neubrutalism_plus_w200_background_draw(GContext *ctx, int16_t w, int16_t h, const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st, GBitmap *bmp_bt) {
  (void)w;
  (void)h;
  (void)th;
  (void)st;
  /* redraw on theme/weather/bluetooth change */
  graphics_context_set_fill_color(ctx, th->ink);
  graphics_fill_rect(ctx, GRect((w/10-NEUBRUTALISM_PLUS_ORANGE_STROKE+w/NEUBRUTALISM_PLUS_SHADOW_DIV), (h/5-NEUBRUTALISM_PLUS_ORANGE_STROKE+w/NEUBRUTALISM_PLUS_SHADOW_DIV), ((w*8)/10+2*NEUBRUTALISM_PLUS_ORANGE_STROKE), (h/3+2*NEUBRUTALISM_PLUS_ORANGE_STROKE)), 0, GCornerNone);
  graphics_context_set_fill_color(ctx, th->ink);
  graphics_fill_rect(ctx, GRect((w/10-NEUBRUTALISM_PLUS_ORANGE_STROKE), (h/5-NEUBRUTALISM_PLUS_ORANGE_STROKE), ((w*8)/10+2*NEUBRUTALISM_PLUS_ORANGE_STROKE), (h/3+2*NEUBRUTALISM_PLUS_ORANGE_STROKE)), 0, GCornerNone);
  graphics_context_set_fill_color(ctx, th->body);
  graphics_fill_rect(ctx, GRect((w/10+NEUBRUTALISM_PLUS_ORANGE_STROKE), (h/5+NEUBRUTALISM_PLUS_ORANGE_STROKE), ((w*8)/10-2*NEUBRUTALISM_PLUS_ORANGE_STROKE), (h/3-2*NEUBRUTALISM_PLUS_ORANGE_STROKE)), 0, GCornerNone);
  graphics_context_set_fill_color(ctx, GColorWhite);
  gpath_draw_filled(ctx, s_neubrutalism_plus_w200_background_p0);
  graphics_context_set_fill_color(ctx, th->ink);
  neubrutalism_plus_axis_outline(ctx, NEUBRUTALISM_PLUS_W200_BACKGROUND_POLY0_INFO.points, NEUBRUTALISM_PLUS_W200_BACKGROUND_POLY0_INFO.num_points, (NEUBRUTALISM_PLUS_OUTLINE_STROKE));
  if (((st->weather_enabled == true) || (st->bt == false))) {
    graphics_context_set_fill_color(ctx, neubrutalism_plus_fill_0(th, st));
    gpath_draw_filled(ctx, s_neubrutalism_plus_w200_background_p1);
    graphics_context_set_fill_color(ctx, th->ink);
    neubrutalism_plus_axis_outline(ctx, NEUBRUTALISM_PLUS_W200_BACKGROUND_POLY1_INFO.points, NEUBRUTALISM_PLUS_W200_BACKGROUND_POLY1_INFO.num_points, (NEUBRUTALISM_PLUS_OUTLINE_STROKE));
  }
  if (((st->bt == false))) {
    {
      GRect bbounds = gbitmap_get_bounds(bmp_bt);
      int16_t iw = bbounds.size.w;
      int16_t ih = bbounds.size.h;
      graphics_context_set_compositing_mode(ctx, GCompOpSet);
      graphics_draw_bitmap_in_rect(ctx, bmp_bt, GRect(55 - iw / 2, 28 - ih / 2, iw, ih));
      graphics_context_set_compositing_mode(ctx, GCompOpAssign);
    }
  }
}

static GColor neubrutalism_plus_fill_1(const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st) {
  if (((th->battery_status == false))) return th->battery_bar;
  if (((st->battery < 20))) return th->battery_low;
  if (((st->battery < 50))) return th->battery_mid;
  return th->battery_high;
}

static GColor neubrutalism_plus_fill_2(const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st) {
  if (((th->battery_status == false))) return th->battery_bar;
  if (((st->battery < 20))) return th->battery_low;
  if (((st->battery < 50))) return th->battery_mid;
  return th->battery_high;
}

void neubrutalism_plus_w200_bars_draw(GContext *ctx, int16_t w, int16_t h, const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st) {
  (void)w;
  (void)h;
  (void)th;
  (void)st;
  /* redraw on battery/step/theme/mode change */
  if (((st->bars_mode == 0))) {
    neubrutalism_plus_meterbar(ctx, 22, (h/5+h/3+NEUBRUTALISM_PLUS_ORANGE_STROKE+w/NEUBRUTALISM_PLUS_SHADOW_DIV+((h-(h/5+h/3+NEUBRUTALISM_PLUS_ORANGE_STROKE+w/NEUBRUTALISM_PLUS_SHADOW_DIV))-(2*32+8+NEUBRUTALISM_PLUS_METRIC_SHADOW))/2), 155, 32, (NEUBRUTALISM_PLUS_ORANGE_STROKE), 2, (NEUBRUTALISM_PLUS_METRIC_SHADOW), th->ink, th->battery_frame, th->ink, neubrutalism_plus_fill_1(th, st), st->battery, 3, 30, 3, 2);
  }
  if (((st->bars_mode == 0))) {
    neubrutalism_plus_meterbar(ctx, 22, ((h/5+h/3+NEUBRUTALISM_PLUS_ORANGE_STROKE+w/NEUBRUTALISM_PLUS_SHADOW_DIV+((h-(h/5+h/3+NEUBRUTALISM_PLUS_ORANGE_STROKE+w/NEUBRUTALISM_PLUS_SHADOW_DIV))-(2*32+8+NEUBRUTALISM_PLUS_METRIC_SHADOW))/2)+32+8), 155, 32, (NEUBRUTALISM_PLUS_ORANGE_STROKE), 2, (NEUBRUTALISM_PLUS_METRIC_SHADOW), th->ink, th->battery_frame, th->ink, th->step_bar, st->steps, 3, 30, 3, 2);
  }
  if (((st->bars_mode == 1))) {
    neubrutalism_plus_meterbar(ctx, 22, (h/5+h/3+NEUBRUTALISM_PLUS_ORANGE_STROKE+w/NEUBRUTALISM_PLUS_SHADOW_DIV+((h-(h/5+h/3+NEUBRUTALISM_PLUS_ORANGE_STROKE+w/NEUBRUTALISM_PLUS_SHADOW_DIV))-(45+NEUBRUTALISM_PLUS_METRIC_SHADOW))/2), 155, 45, (NEUBRUTALISM_PLUS_ORANGE_STROKE), 2, (NEUBRUTALISM_PLUS_METRIC_SHADOW), th->ink, th->battery_frame, th->ink, neubrutalism_plus_fill_2(th, st), st->battery, 3, 30, 3, 2);
  }
  if (((st->bars_mode == 2))) {
    neubrutalism_plus_meterbar(ctx, 22, (h/5+h/3+NEUBRUTALISM_PLUS_ORANGE_STROKE+w/NEUBRUTALISM_PLUS_SHADOW_DIV+((h-(h/5+h/3+NEUBRUTALISM_PLUS_ORANGE_STROKE+w/NEUBRUTALISM_PLUS_SHADOW_DIV))-(45+NEUBRUTALISM_PLUS_METRIC_SHADOW))/2), 155, 45, (NEUBRUTALISM_PLUS_ORANGE_STROKE), 2, (NEUBRUTALISM_PLUS_METRIC_SHADOW), th->ink, th->battery_frame, th->ink, th->step_bar, st->steps, 3, 30, 3, 2);
  }
}

GRect neubrutalism_plus_w200_date_frame(int16_t w, int16_t h) {
  (void)w;
  (void)h;
  return GRect(93, 0, 104, 40);
}

uint32_t neubrutalism_plus_w200_date_font(void) {
  return RESOURCE_ID_FONT_JERSEY_38;
}

GTextAlignment neubrutalism_plus_w200_date_align(void) {
  return GTextAlignmentCenter;
}

GColor neubrutalism_plus_w200_date_color(const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st) {
  (void)th;
  (void)st;
  return th->ink;
}

GRect neubrutalism_plus_w200_weather_frame(int16_t w, int16_t h) {
  (void)w;
  (void)h;
  return GRect(3, 0, 104, 40);
}

uint32_t neubrutalism_plus_w200_weather_font(void) {
  return RESOURCE_ID_FONT_JERSEY_38;
}

GTextAlignment neubrutalism_plus_w200_weather_align(void) {
  return GTextAlignmentCenter;
}

GColor neubrutalism_plus_w200_weather_color(const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st) {
  (void)th;
  (void)st;
  return GColorBlack;
}

bool neubrutalism_plus_w200_weather_visible(const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st) {
  (void)th;
  (void)st;
  return ((st->weather_enabled == true) || (st->bt == false));
}

void neubrutalism_plus_w200_time_draw(GContext *ctx, int16_t w, int16_t h, const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st) {
  (void)h;
  (void)th;
  (void)st;
  /* the only layer redrawn every minute */
  int16_t bx = (w/10+NEUBRUTALISM_PLUS_ORANGE_STROKE);
  int16_t by = (h/5+NEUBRUTALISM_PLUS_ORANGE_STROKE);
  int16_t bw = ((w*8)/10-2*NEUBRUTALISM_PLUS_ORANGE_STROKE);
  int16_t bh = (h/3-2*NEUBRUTALISM_PLUS_ORANGE_STROKE);
  const char *text = st->time_str;
  size_t text_len = strlen(text);
  int16_t pix_w = w / 40;
  int16_t pix_h = pix_w;
  if (((st->display_hour == 20 || st->display_hour == 21 || st->display_hour == 22 || st->display_hour == 23))) {
    pix_h = 4;
  }
  if (pix_w < 1) pix_w = 1;
  if (pix_h < 1) pix_h = 1;
  const int16_t glyph_height = 10 * pix_h;
  int16_t total_width = 0;
  for (size_t i = 0; i < text_len; i++) {
    const DigitGlyph *glyph = glyph_for_char(text[i]);
    total_width += glyph_width(glyph) * pix_w;
    if (i < text_len - 1) total_width += pix_w;
  }
  const int16_t start_x = (bw - total_width) / 2;
  const int16_t start_y = (bh - glyph_height) / 2;
  graphics_context_set_fill_color(ctx, th->ink);
  int16_t cursor_x = start_x;
  for (size_t i = 0; i < text_len; i++) {
    const DigitGlyph *glyph = glyph_for_char(text[i]);
    const int16_t glyph_w = glyph_width(glyph);
    if (!glyph) continue;
    for (int16_t row = 0; row < 10; row++) {
      const char *row_data = glyph->rows[row];
      for (int16_t col = 0; col < glyph_w; col++) {
        if (row_data[col] == '1') {
          GRect pixel_rect = GRect(bx + cursor_x + col * pix_w, by + start_y + row * pix_h, pix_w, pix_h);
          graphics_fill_rect(ctx, pixel_rect, 0, GCornerNone);
        }
      }
    }
    cursor_x += glyph_w * pix_w + pix_w;
  }
}

static GColor neubrutalism_plus_fill_3(const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st) {
  if (((th->weather_condition_colors == false))) return GColorWhite;
  if (((st->weather_available == false))) return GColorWhite;
  if (((st->weather_code == 0 || st->weather_code == 1))) return GColorChromeYellow;
  if (((st->weather_code == 2 || st->weather_code == 3 || st->weather_code == 45 || st->weather_code == 48))) return GColorLightGray;
  if (((st->weather_code == 51 || st->weather_code == 53 || st->weather_code == 55 || st->weather_code == 56 || st->weather_code == 57 || st->weather_code == 61 || st->weather_code == 63 || st->weather_code == 65 || st->weather_code == 66 || st->weather_code == 67 || st->weather_code == 80 || st->weather_code == 81 || st->weather_code == 82))) return GColorBabyBlueEyes;
  if (((st->weather_code == 95 || st->weather_code == 96 || st->weather_code == 99))) return GColorVividViolet;
  return GColorWhite;
}

void neubrutalism_plus_w144_background_draw(GContext *ctx, int16_t w, int16_t h, const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st, GBitmap *bmp_bt) {
  (void)w;
  (void)h;
  (void)th;
  (void)st;
  /* redraw on theme/weather/bluetooth change */
  graphics_context_set_fill_color(ctx, th->ink);
  graphics_fill_rect(ctx, GRect((w/10-NEUBRUTALISM_PLUS_ORANGE_STROKE+w/NEUBRUTALISM_PLUS_SHADOW_DIV), (h/5-NEUBRUTALISM_PLUS_ORANGE_STROKE+w/NEUBRUTALISM_PLUS_SHADOW_DIV), ((w*8)/10+2*NEUBRUTALISM_PLUS_ORANGE_STROKE), (h/3+2*NEUBRUTALISM_PLUS_ORANGE_STROKE)), 0, GCornerNone);
  graphics_context_set_fill_color(ctx, th->ink);
  graphics_fill_rect(ctx, GRect((w/10-NEUBRUTALISM_PLUS_ORANGE_STROKE), (h/5-NEUBRUTALISM_PLUS_ORANGE_STROKE), ((w*8)/10+2*NEUBRUTALISM_PLUS_ORANGE_STROKE), (h/3+2*NEUBRUTALISM_PLUS_ORANGE_STROKE)), 0, GCornerNone);
  graphics_context_set_fill_color(ctx, th->body);
  graphics_fill_rect(ctx, GRect((w/10+NEUBRUTALISM_PLUS_ORANGE_STROKE), (h/5+NEUBRUTALISM_PLUS_ORANGE_STROKE), ((w*8)/10-2*NEUBRUTALISM_PLUS_ORANGE_STROKE), (h/3-2*NEUBRUTALISM_PLUS_ORANGE_STROKE)), 0, GCornerNone);
  graphics_context_set_fill_color(ctx, GColorWhite);
  gpath_draw_filled(ctx, s_neubrutalism_plus_w144_background_p0);
  graphics_context_set_fill_color(ctx, th->ink);
  neubrutalism_plus_axis_outline(ctx, NEUBRUTALISM_PLUS_W144_BACKGROUND_POLY0_INFO.points, NEUBRUTALISM_PLUS_W144_BACKGROUND_POLY0_INFO.num_points, (NEUBRUTALISM_PLUS_OUTLINE_STROKE));
  if (((st->weather_enabled == true) || (st->bt == false))) {
    graphics_context_set_fill_color(ctx, neubrutalism_plus_fill_3(th, st));
    gpath_draw_filled(ctx, s_neubrutalism_plus_w144_background_p1);
    graphics_context_set_fill_color(ctx, th->ink);
    neubrutalism_plus_axis_outline(ctx, NEUBRUTALISM_PLUS_W144_BACKGROUND_POLY1_INFO.points, NEUBRUTALISM_PLUS_W144_BACKGROUND_POLY1_INFO.num_points, (NEUBRUTALISM_PLUS_OUTLINE_STROKE));
  }
  if (((st->bt == false))) {
    {
      GRect bbounds = gbitmap_get_bounds(bmp_bt);
      int16_t iw = bbounds.size.w;
      int16_t ih = bbounds.size.h;
      graphics_context_set_compositing_mode(ctx, GCompOpSet);
      graphics_draw_bitmap_in_rect(ctx, bmp_bt, GRect(39 - iw / 2, 25 - ih / 2, iw, ih));
      graphics_context_set_compositing_mode(ctx, GCompOpAssign);
    }
  }
}

static GColor neubrutalism_plus_fill_4(const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st) {
  if (((th->battery_status == false))) return th->battery_bar;
  if (((st->battery < 20))) return th->battery_low;
  if (((st->battery < 50))) return th->battery_mid;
  return th->battery_high;
}

static GColor neubrutalism_plus_fill_5(const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st) {
  if (((th->battery_status == false))) return th->battery_bar;
  if (((st->battery < 20))) return th->battery_low;
  if (((st->battery < 50))) return th->battery_mid;
  return th->battery_high;
}

void neubrutalism_plus_w144_bars_draw(GContext *ctx, int16_t w, int16_t h, const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st) {
  (void)w;
  (void)h;
  (void)th;
  (void)st;
  /* redraw on battery/step/theme/mode change */
  if (((st->bars_mode == 0))) {
    neubrutalism_plus_meterbar(ctx, 16, (h/5+h/3+NEUBRUTALISM_PLUS_ORANGE_STROKE+w/NEUBRUTALISM_PLUS_SHADOW_DIV+((h-(h/5+h/3+NEUBRUTALISM_PLUS_ORANGE_STROKE+w/NEUBRUTALISM_PLUS_SHADOW_DIV))-(2*24+6+NEUBRUTALISM_PLUS_METRIC_SHADOW))/2), 112, 24, (NEUBRUTALISM_PLUS_ORANGE_STROKE), 2, (NEUBRUTALISM_PLUS_METRIC_SHADOW), th->ink, th->battery_frame, th->ink, neubrutalism_plus_fill_4(th, st), st->battery, 3, 30, 3, 2);
  }
  if (((st->bars_mode == 0))) {
    neubrutalism_plus_meterbar(ctx, 16, ((h/5+h/3+NEUBRUTALISM_PLUS_ORANGE_STROKE+w/NEUBRUTALISM_PLUS_SHADOW_DIV+((h-(h/5+h/3+NEUBRUTALISM_PLUS_ORANGE_STROKE+w/NEUBRUTALISM_PLUS_SHADOW_DIV))-(2*24+6+NEUBRUTALISM_PLUS_METRIC_SHADOW))/2)+24+6), 112, 24, (NEUBRUTALISM_PLUS_ORANGE_STROKE), 2, (NEUBRUTALISM_PLUS_METRIC_SHADOW), th->ink, th->battery_frame, th->ink, th->step_bar, st->steps, 3, 30, 3, 2);
  }
  if (((st->bars_mode == 1))) {
    neubrutalism_plus_meterbar(ctx, 16, (h/5+h/3+NEUBRUTALISM_PLUS_ORANGE_STROKE+w/NEUBRUTALISM_PLUS_SHADOW_DIV+((h-(h/5+h/3+NEUBRUTALISM_PLUS_ORANGE_STROKE+w/NEUBRUTALISM_PLUS_SHADOW_DIV))-(38+NEUBRUTALISM_PLUS_METRIC_SHADOW))/2), 112, 38, (NEUBRUTALISM_PLUS_ORANGE_STROKE), 2, (NEUBRUTALISM_PLUS_METRIC_SHADOW), th->ink, th->battery_frame, th->ink, neubrutalism_plus_fill_5(th, st), st->battery, 3, 30, 3, 2);
  }
  if (((st->bars_mode == 2))) {
    neubrutalism_plus_meterbar(ctx, 16, (h/5+h/3+NEUBRUTALISM_PLUS_ORANGE_STROKE+w/NEUBRUTALISM_PLUS_SHADOW_DIV+((h-(h/5+h/3+NEUBRUTALISM_PLUS_ORANGE_STROKE+w/NEUBRUTALISM_PLUS_SHADOW_DIV))-(38+NEUBRUTALISM_PLUS_METRIC_SHADOW))/2), 112, 38, (NEUBRUTALISM_PLUS_ORANGE_STROKE), 2, (NEUBRUTALISM_PLUS_METRIC_SHADOW), th->ink, th->battery_frame, th->ink, th->step_bar, st->steps, 3, 30, 3, 2);
  }
}

GRect neubrutalism_plus_w144_date_frame(int16_t w, int16_t h) {
  (void)w;
  (void)h;
  return GRect(69, 3, 72, 28);
}

uint32_t neubrutalism_plus_w144_date_font(void) {
  return RESOURCE_ID_FONT_JERSEY_25;
}

GTextAlignment neubrutalism_plus_w144_date_align(void) {
  return GTextAlignmentCenter;
}

GColor neubrutalism_plus_w144_date_color(const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st) {
  (void)th;
  (void)st;
  return th->ink;
}

GRect neubrutalism_plus_w144_weather_frame(int16_t w, int16_t h) {
  (void)w;
  (void)h;
  return GRect(3, 3, 72, 28);
}

uint32_t neubrutalism_plus_w144_weather_font(void) {
  return RESOURCE_ID_FONT_JERSEY_25;
}

GTextAlignment neubrutalism_plus_w144_weather_align(void) {
  return GTextAlignmentCenter;
}

GColor neubrutalism_plus_w144_weather_color(const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st) {
  (void)th;
  (void)st;
  return GColorBlack;
}

bool neubrutalism_plus_w144_weather_visible(const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st) {
  (void)th;
  (void)st;
  return ((st->weather_enabled == true) || (st->bt == false));
}

void neubrutalism_plus_w144_time_draw(GContext *ctx, int16_t w, int16_t h, const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st) {
  (void)h;
  (void)th;
  (void)st;
  /* the only layer redrawn every minute */
  int16_t bx = (w/10+NEUBRUTALISM_PLUS_ORANGE_STROKE);
  int16_t by = (h/5+NEUBRUTALISM_PLUS_ORANGE_STROKE);
  int16_t bw = ((w*8)/10-2*NEUBRUTALISM_PLUS_ORANGE_STROKE);
  int16_t bh = (h/3-2*NEUBRUTALISM_PLUS_ORANGE_STROKE);
  const char *text = st->time_str;
  size_t text_len = strlen(text);
  int16_t pix_w = w / 40;
  int16_t pix_h = pix_w;
  if (pix_w < 1) pix_w = 1;
  if (pix_h < 1) pix_h = 1;
  const int16_t glyph_height = 10 * pix_h;
  int16_t total_width = 0;
  for (size_t i = 0; i < text_len; i++) {
    const DigitGlyph *glyph = glyph_for_char(text[i]);
    total_width += glyph_width(glyph) * pix_w;
    if (i < text_len - 1) total_width += pix_w;
  }
  const int16_t start_x = (bw - total_width) / 2;
  const int16_t start_y = (bh - glyph_height) / 2;
  graphics_context_set_fill_color(ctx, th->ink);
  int16_t cursor_x = start_x;
  for (size_t i = 0; i < text_len; i++) {
    const DigitGlyph *glyph = glyph_for_char(text[i]);
    const int16_t glyph_w = glyph_width(glyph);
    if (!glyph) continue;
    for (int16_t row = 0; row < 10; row++) {
      const char *row_data = glyph->rows[row];
      for (int16_t col = 0; col < glyph_w; col++) {
        if (row_data[col] == '1') {
          GRect pixel_rect = GRect(bx + cursor_x + col * pix_w, by + start_y + row * pix_h, pix_w, pix_h);
          graphics_fill_rect(ctx, pixel_rect, 0, GCornerNone);
        }
      }
    }
    cursor_x += glyph_w * pix_w + pix_w;
  }
}

