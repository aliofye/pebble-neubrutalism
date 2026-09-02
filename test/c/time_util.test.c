// Host-side test for time_util.format_time / format_date_upper. Compiles without
// the Pebble SDK (only libc): run via scripts/test-c.sh.
// glibc (CI) hides setenv/tzset unless POSIX.1-2008 is requested.
#define _POSIX_C_SOURCE 200809L
#include <locale.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include "time_util.h"

static int failures = 0;

static void check(const char *what, int cond) {
  if (!cond) { printf("FAIL: %s\n", what); failures++; }
}

int main(void) {
  setlocale(LC_ALL, "C");   // keep strftime's %b in English on any host

  char buf[16];

  format_time(9, 5, true, buf, sizeof(buf));
  check("24h single-digit hour has no leading zero", strcmp(buf, "9:05") == 0);

  format_time(10, 5, true, buf, sizeof(buf));
  check("24h two-digit hour keeps both digits", strcmp(buf, "10:05") == 0);

  format_time(0, 0, true, buf, sizeof(buf));
  check("24h midnight is 0:00", strcmp(buf, "0:00") == 0);

  format_time(16, 46, false, buf, sizeof(buf));
  check("12h afternoon strips the leading 1", strcmp(buf, "4:46") == 0);

  format_time(12, 0, false, buf, sizeof(buf));
  check("12h noon keeps 12", strcmp(buf, "12:00") == 0);

  format_time(0, 5, false, buf, sizeof(buf));
  check("12h midnight maps to 12", strcmp(buf, "12:05") == 0);

  format_time(20, 0, false, buf, sizeof(buf));
  check("12h 8pm is 8:00", strcmp(buf, "8:00") == 0);

  struct tm t = { 0 };
  t.tm_year = 126; t.tm_mon = 8; t.tm_mday = 1;   // 2026-09-01
  format_date_upper(&t, buf, sizeof(buf));
  check("date uppercases month and day", strcmp(buf, "SEP 01") == 0);

  t.tm_mday = 5;
  format_date_upper(&t, buf, sizeof(buf));
  check("single-digit day keeps the leading zero", strcmp(buf, "SEP 05") == 0);

  if (failures) { printf("%d FAILURE(S)\n", failures); return 1; }
  printf("time_util: all ok\n");
  return 0;
}