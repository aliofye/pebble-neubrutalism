// Layout math shared by the watchface drawing code. Pure C: no Pebble SDK types
// here, so the module compiles on the host for unit tests (scripts/test-c.sh).
#pragma once

// The orange body rect that anchors the clock: (w/10, h/5) at (8w/10) x (h/3).
// Returns the rect as four ints so the caller can build an SDK GRect.
void orange_rect(int w, int h, int *x, int *y, int *rw, int *rh);