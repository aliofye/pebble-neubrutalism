#include "layout.h"

void orange_rect(int w, int h, int *x, int *y, int *rw, int *rh) {
  *x = w / 10;
  *y = h / 5;
  *rw = (w * 8) / 10;
  *rh = h / 3;
}