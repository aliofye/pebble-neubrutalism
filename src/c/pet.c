#include "pet.h"

#include <pebble.h>

// Sprite-driven pet: 32x32 frame sequence loaded from PNG resources.
// Currently the idle animation from the Calciumtrice slime sprite sheet
// (CC-BY 3.0). Swap these resources to change the pet art.

#define PET_FRAME_COUNT 10
#define PET_FRAME_SIZE 64

static const uint32_t s_frame_resources[PET_FRAME_COUNT] = {
  RESOURCE_ID_PET_FRAME_00,
  RESOURCE_ID_PET_FRAME_01,
  RESOURCE_ID_PET_FRAME_02,
  RESOURCE_ID_PET_FRAME_03,
  RESOURCE_ID_PET_FRAME_04,
  RESOURCE_ID_PET_FRAME_05,
  RESOURCE_ID_PET_FRAME_06,
  RESOURCE_ID_PET_FRAME_07,
  RESOURCE_ID_PET_FRAME_08,
  RESOURCE_ID_PET_FRAME_09,
};

static GBitmap *s_frames[PET_FRAME_COUNT];
static bool s_loaded;

void pet_init(void) {
  for (int i = 0; i < PET_FRAME_COUNT; i++) {
    s_frames[i] = gbitmap_create_with_resource(s_frame_resources[i]);
  }
  s_loaded = true;
}

void pet_deinit(void) {
  for (int i = 0; i < PET_FRAME_COUNT; i++) {
    if (s_frames[i]) {
      gbitmap_destroy(s_frames[i]);
      s_frames[i] = NULL;
    }
  }
  s_loaded = false;
}

GSize pet_size(void) {
  return GSize(PET_FRAME_SIZE, PET_FRAME_SIZE);
}

void pet_draw(GContext *ctx, GPoint origin, PetMood mood, uint32_t tick) {
  if (!s_loaded) {
    return;
  }
  // Advance one frame per tick: 10-frame idle loop (~3s at 300ms ticks).
  const uint32_t idx = tick % PET_FRAME_COUNT;
  const GBitmap *frame = s_frames[idx];
  if (!frame) {
    return;
  }
  GRect dest = GRect(origin.x, origin.y, PET_FRAME_SIZE, PET_FRAME_SIZE);
  graphics_draw_bitmap_in_rect(ctx, frame, dest);
}