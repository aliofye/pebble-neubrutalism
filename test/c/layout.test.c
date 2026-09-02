// Host-side test for layout.orange_rect. Compiles without the Pebble SDK (only
// libc): run via scripts/test-c.sh.
#include <stdio.h>
#include "layout.h"

static int failures = 0;

static void check(const char *what, int cond) {
  if (!cond) { printf("FAIL: %s\n", what); failures++; }
}

static void test(int w, int h, int ex, int ey, int ew, int eh) {
  int x, y, rw, rh;
  orange_rect(w, h, &x, &y, &rw, &rh);
  char msg[64];
  snprintf(msg, sizeof(msg), "%dx%d -> %d,%d %dx%d", w, h, x, y, rw, rh);
  check(msg, x == ex && y == ey && rw == ew && rh == eh);
}

int main(void) {
  test(200, 228, 20, 45, 160, 76);   // emery
  test(144, 168, 14, 33, 115, 56);   // aplite/basalt/diorite/flint
  test(10, 10, 1, 2, 8, 3);          // tiny bounds
  test(0, 0, 0, 0, 0, 0);            // degenerate bounds

  if (failures) { printf("%d FAILURE(S)\n", failures); return 1; }
  printf("layout: all ok\n");
  return 0;
}