// Minimal Pebble SDK stub for SYNTAX-CHECKING generated code only.
// Never compiled into the app. Provides declarations (no bodies) for every
// symbol tools/pebble-editor/generate.js can emit, plus the GColor palette
// and RESOURCE_IDs referenced by checked-in example faces.

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct {
  uint8_t argb;
} GColor;

#define GColorBabyBlueEyes ((GColor){0})
#define GColorBlack ((GColor){0})
#define GColorCeleste ((GColor){0})
#define GColorChromeYellow ((GColor){0})
#define GColorCobaltBlue ((GColor){0})
#define GColorDarkGray ((GColor){0})
#define GColorDarkGreen ((GColor){0})
#define GColorElectricBlue ((GColor){0})
#define GColorIcterine ((GColor){0})
#define GColorIndigo ((GColor){0})
#define GColorLavenderIndigo ((GColor){0})
#define GColorLightGray ((GColor){0})
#define GColorMayGreen ((GColor){0})
#define GColorMintGreen ((GColor){0})
#define GColorOrange ((GColor){0})
#define GColorPastelYellow ((GColor){0})
#define GColorPictonBlue ((GColor){0})
#define GColorRed ((GColor){0})
#define GColorRichBrilliantLavender ((GColor){0})
#define GColorVividViolet ((GColor){0})
#define GColorWhite ((GColor){0})

typedef struct {
  int16_t x;
  int16_t y;
} GPoint;

typedef struct {
  int16_t w;
  int16_t h;
} GSize;

typedef struct {
  GPoint origin;
  GSize size;
} GRect;

#define GRect(x, y, w, h) ((GRect){{(x), (y)}, {(w), (h)}})

typedef enum {
  GCornerNone = 0
} GCorner;

typedef struct {
  uint16_t num_points;
  GPoint *points;
} GPathInfo;

typedef struct GPath GPath;
typedef struct GContext GContext;
typedef struct GBitmap GBitmap;

typedef enum {
  GTextAlignmentLeft = 0,
  GTextAlignmentCenter,
  GTextAlignmentRight
} GTextAlignment;

typedef enum {
  GCompOpAssign = 0,
  GCompOpSet
} GCompOp;

void graphics_context_set_fill_color(GContext *ctx, GColor color);
void graphics_fill_rect(GContext *ctx, GRect rect, uint16_t radius, GCorner corners);
void graphics_context_set_compositing_mode(GContext *ctx, GCompOp mode);
void graphics_draw_bitmap_in_rect(GContext *ctx, const GBitmap *bitmap, GRect rect);
GRect gbitmap_get_bounds(const GBitmap *bitmap);
GPath *gpath_create(const GPathInfo *info);
void gpath_destroy(GPath *path);
void gpath_draw_filled(GContext *ctx, GPath *path);

#define RESOURCE_ID_FONT_JERSEY_38 1
#define RESOURCE_ID_FONT_JERSEY_25 2
#define RESOURCE_ID_IMAGE_BT_DISCONNECT 3

/* Pixel glyphs come from the host app (src/c/glyphs.h), not from here. */
