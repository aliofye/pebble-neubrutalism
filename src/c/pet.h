#pragma once

#include <pebble.h>

typedef enum {
  PET_MOOD_NEUTRAL = 0,
  PET_MOOD_HAPPY,
  PET_MOOD_SAD,
  PET_MOOD_SCARED,
  PET_MOOD_COUNT,
} PetMood;

void pet_init(void);
void pet_deinit(void);
GSize pet_size(void);
void pet_draw(GContext *ctx, GPoint origin, PetMood mood, uint32_t tick);