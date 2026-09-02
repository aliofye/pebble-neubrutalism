// Host-side test for glyphs.glyph_for_char / glyph_width. Compiles without the
// Pebble SDK (only libc): run via scripts/test-c.sh.
#include <stdio.h>
#include <string.h>
#include "glyphs.h"

static int failures = 0;

static void check(const char *what, int cond) {
  if (!cond) { printf("FAIL: %s\n", what); failures++; }
}

int main(void) {
  check("all digits have glyphs", glyph_for_char('0') && glyph_for_char('5') && glyph_for_char('9'));
  check("colon has a glyph", glyph_for_char(':') != NULL);
  check("unknown char has no glyph", glyph_for_char('a') == NULL);
  check("null glyph has zero width", glyph_width(NULL) == 0);

  check("0 is 6 wide", glyph_width(glyph_for_char('0')) == 6);
  check("1 is 3 wide", glyph_width(glyph_for_char('1')) == 3);
  check("2 is 7 wide", glyph_width(glyph_for_char('2')) == 7);
  check("5 is 6 wide", glyph_width(glyph_for_char('5')) == 6);
  check("9 is 7 wide", glyph_width(glyph_for_char('9')) == 7);
  check("colon is 2 wide", glyph_width(glyph_for_char(':')) == 2);

  check("0 row0 is 011110", strcmp(glyph_for_char('0')->rows[0], "011110") == 0);
  check("0 row9 is 011110", strcmp(glyph_for_char('0')->rows[9], "011110") == 0);
  check("1 row0 is 111", strcmp(glyph_for_char('1')->rows[0], "111") == 0);
  check("colon row0 is 00", strcmp(glyph_for_char(':')->rows[0], "00") == 0);
  check("colon row2 is 11", strcmp(glyph_for_char(':')->rows[2], "11") == 0);

  if (failures) { printf("%d FAILURE(S)\n", failures); return 1; }
  printf("glyphs: all ok\n");
  return 0;
}