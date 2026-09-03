#pragma once

#include <pebble.h>

#include "pet_logic.h"

// Debug review helper: set to 1 to cycle through every animation. Off for
// normal behavior.
#ifndef DEBUG_ANIM_CYCLE
#define DEBUG_ANIM_CYCLE 0
#endif

void pet_init(void);
void pet_deinit(void);

// Switch animations: unloads the resident frame set and loads the new one.
// Only one animation's frames stay in memory at a time.
void pet_set_animation(PetAnimation anim);

#if DEBUG_ANIM_CYCLE
// Advance to the next animation (debug review helper).
void pet_cycle_animation(void);
#endif

GSize pet_size(void);

// Draw the current animation's frame for this tick at origin.
void pet_draw(GContext *ctx, GPoint origin, uint32_t tick);
