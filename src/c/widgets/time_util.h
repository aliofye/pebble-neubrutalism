// Pure time/date helpers for the watchface clock. No Pebble SDK types here so
// the module compiles on the host for unit tests (scripts/test-c.sh).
#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <time.h>

// The watch SDK suppresses libc's <time.h>, so pebble.h is what defines struct
// tm on-device. Forward-declare it so the header parses before pebble.h.
struct tm;

// Format an hour/minute into the pixel-clock buffer: single-digit hours render
// as "H:MM", two-digit as "HH:MM". In 12h mode midnight/noon map to 12.
void format_time(uint8_t hour, uint8_t minute, bool h24, char *out, size_t outlen);

// strftime "%b %d" uppercased (e.g. "SEP 01").
void format_date_upper(const struct tm *t, char *out, size_t outlen);