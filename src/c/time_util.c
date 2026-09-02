#include "time_util.h"
#include <ctype.h>
#include <stdio.h>

// The Pebble SDK compiles with -D_TIME_H_, which suppresses libc's <time.h>;
// pebble.h carries the time declarations on the watch. The host has libc.
#ifdef PBL_SDK_3
#include <pebble.h>
#else
#include <time.h>
#endif

void format_time(uint8_t hour, uint8_t minute, bool h24, char *out, size_t outlen) {
  const uint8_t h = h24 ? hour : (hour % 12 == 0 ? 12 : hour % 12);
  snprintf(out, outlen, h < 10 ? "%u:%02u" : "%02u:%02u", h, minute);
}

void format_date_upper(const struct tm *t, char *out, size_t outlen) {
  strftime(out, outlen, "%b %d", t);
  for (size_t i = 0; out[i]; i++) {
    out[i] = (char)toupper((unsigned char)out[i]);
  }
}