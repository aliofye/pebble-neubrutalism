// The pixel-style digit glyphs used to draw the clock. Pure C: no Pebble SDK
// types here, so the module compiles on the host for unit tests (test-c.sh).
#pragma once
#include <stddef.h>

typedef struct {
  const char *rows[10];
} DigitGlyph;

// Glyph for '0'-'9' and ':', NULL for anything else.
const DigitGlyph *glyph_for_char(char c);

// Width (in glyph columns) of a glyph; 0 for NULL.
int glyph_width(const DigitGlyph *glyph);