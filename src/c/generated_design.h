/* DO NOT EDIT - generated from neubrutalism-plus.design.json by tools/pebble-editor/generate.js */
#pragma once

#include <pebble.h>
#include <stdbool.h>

#define NEUBRUTALISM_PLUS_ORANGE_STROKE 3
#define NEUBRUTALISM_PLUS_METRIC_SHADOW 3
#define NEUBRUTALISM_PLUS_SHADOW_DIV 30
#define NEUBRUTALISM_PLUS_OUTLINE_STROKE 4

typedef struct {
  GColor background;
  GColor body;
  GColor accent;
  GColor battery_frame;
  GColor battery_bar;
  GColor ink;
  GColor battery_low;
  GColor battery_mid;
  GColor battery_high;
  GColor step_bar;
  bool battery_status;
  bool weather_condition_colors;
} NeubrutalismPlusTheme;

typedef struct {
  const char * time_str; /* formatted time, host-side 12/24h handling */
  const char * date_str; /* uppercased date, host formatted */
  int display_hour; /* displayed hour, drives pixel squash quirk */
  const char * weather_str; /* formatted temp+units or placeholder */
  int battery; /* battery percent 0-100 */
  int steps; /* step-goal percent 0-100 */
  int weather_code; /* WMO weather code */
  bool weather_available;
  bool weather_enabled;
  bool bt; /* bluetooth connected */
  int bars_mode; /* 0 both, 1 battery, 2 steps */
} NeubrutalismPlusState;

#define NEUBRUTALISM_PLUS_THEME_COUNT 6
extern const NeubrutalismPlusTheme NEUBRUTALISM_PLUS_THEMES[6];

void neubrutalism_plus_w200_background_draw(GContext *ctx, int16_t w, int16_t h, const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st, GBitmap *bmp_bt);
void neubrutalism_plus_w200_bars_draw(GContext *ctx, int16_t w, int16_t h, const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st);
GRect neubrutalism_plus_w200_date_frame(int16_t w, int16_t h);
uint32_t neubrutalism_plus_w200_date_font(void);
GTextAlignment neubrutalism_plus_w200_date_align(void);
GColor neubrutalism_plus_w200_date_color(const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st);
GRect neubrutalism_plus_w200_weather_frame(int16_t w, int16_t h);
uint32_t neubrutalism_plus_w200_weather_font(void);
GTextAlignment neubrutalism_plus_w200_weather_align(void);
GColor neubrutalism_plus_w200_weather_color(const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st);
bool neubrutalism_plus_w200_weather_visible(const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st);
void neubrutalism_plus_w200_time_draw(GContext *ctx, int16_t w, int16_t h, const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st);
void neubrutalism_plus_w144_background_draw(GContext *ctx, int16_t w, int16_t h, const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st, GBitmap *bmp_bt);
void neubrutalism_plus_w144_bars_draw(GContext *ctx, int16_t w, int16_t h, const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st);
GRect neubrutalism_plus_w144_date_frame(int16_t w, int16_t h);
uint32_t neubrutalism_plus_w144_date_font(void);
GTextAlignment neubrutalism_plus_w144_date_align(void);
GColor neubrutalism_plus_w144_date_color(const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st);
GRect neubrutalism_plus_w144_weather_frame(int16_t w, int16_t h);
uint32_t neubrutalism_plus_w144_weather_font(void);
GTextAlignment neubrutalism_plus_w144_weather_align(void);
GColor neubrutalism_plus_w144_weather_color(const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st);
bool neubrutalism_plus_w144_weather_visible(const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st);
void neubrutalism_plus_w144_time_draw(GContext *ctx, int16_t w, int16_t h, const NeubrutalismPlusTheme *th, const NeubrutalismPlusState *st);
void neubrutalism_plus_w200_background_polygons_create(void);
void neubrutalism_plus_w200_background_polygons_destroy(void);
void neubrutalism_plus_w144_background_polygons_create(void);
void neubrutalism_plus_w144_background_polygons_destroy(void);

