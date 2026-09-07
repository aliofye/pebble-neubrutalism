// Shared layer-role contract between generated apps and widgets.
// A generated app fills one of these at window load and hands it to every
// widget init. Roles a face does not implement stay NULL; widgets must
// NULL-check before use. Lives with the widget registry so it travels with
// the editor; codegen copies it into each generated app as src/c/pe_layers.h.
#pragma once

#include <pebble.h>

typedef struct {
  Layer *background;
  Layer *bars;
  TextLayer *date;
  TextLayer *weather;
  Layer *time;
} PeFaceLayers;
