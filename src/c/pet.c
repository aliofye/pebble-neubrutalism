#include "pet.h"

#include <pebble.h>

// Sprite-driven pet: 32x32 frame sequence loaded from PNG resources.
// Currently the Calciumtrice slime sprite sheet (CC-BY 3.0). Swap these
// resources to change the pet art.
//
// Sprite sheet layout: 10 frames per animation, 5 animations per color.
// Color 1 animations, in sheet row order: idle, gesture, attack, walk, death.
// DEBUG_ANIM_CYCLE comes from pet.h.

#define PET_FRAME_COUNT 10
#define PET_FRAME_SIZE 64

static const uint32_t s_frame_resources[PET_ANIM_COUNT][PET_FRAME_COUNT] = {
  { RESOURCE_ID_PET_FRAME_00, RESOURCE_ID_PET_FRAME_01, RESOURCE_ID_PET_FRAME_02,
    RESOURCE_ID_PET_FRAME_03, RESOURCE_ID_PET_FRAME_04, RESOURCE_ID_PET_FRAME_05,
    RESOURCE_ID_PET_FRAME_06, RESOURCE_ID_PET_FRAME_07, RESOURCE_ID_PET_FRAME_08,
    RESOURCE_ID_PET_FRAME_09 },  // idle
  { RESOURCE_ID_PET_FRAME_10, RESOURCE_ID_PET_FRAME_11, RESOURCE_ID_PET_FRAME_12,
    RESOURCE_ID_PET_FRAME_13, RESOURCE_ID_PET_FRAME_14, RESOURCE_ID_PET_FRAME_15,
    RESOURCE_ID_PET_FRAME_16, RESOURCE_ID_PET_FRAME_17, RESOURCE_ID_PET_FRAME_18,
    RESOURCE_ID_PET_FRAME_19 },  // gesture
  { RESOURCE_ID_PET_FRAME_20, RESOURCE_ID_PET_FRAME_21, RESOURCE_ID_PET_FRAME_22,
    RESOURCE_ID_PET_FRAME_23, RESOURCE_ID_PET_FRAME_24, RESOURCE_ID_PET_FRAME_25,
    RESOURCE_ID_PET_FRAME_26, RESOURCE_ID_PET_FRAME_27, RESOURCE_ID_PET_FRAME_28,
    RESOURCE_ID_PET_FRAME_29 },  // attack
  { RESOURCE_ID_PET_FRAME_30, RESOURCE_ID_PET_FRAME_31, RESOURCE_ID_PET_FRAME_32,
    RESOURCE_ID_PET_FRAME_33, RESOURCE_ID_PET_FRAME_34, RESOURCE_ID_PET_FRAME_35,
    RESOURCE_ID_PET_FRAME_36, RESOURCE_ID_PET_FRAME_37, RESOURCE_ID_PET_FRAME_38,
    RESOURCE_ID_PET_FRAME_39 },  // walk
  { RESOURCE_ID_PET_FRAME_40, RESOURCE_ID_PET_FRAME_41, RESOURCE_ID_PET_FRAME_42,
    RESOURCE_ID_PET_FRAME_43, RESOURCE_ID_PET_FRAME_44, RESOURCE_ID_PET_FRAME_45,
    RESOURCE_ID_PET_FRAME_46, RESOURCE_ID_PET_FRAME_47, RESOURCE_ID_PET_FRAME_48,
    RESOURCE_ID_PET_FRAME_49 },  // death
};

static GBitmap *s_frames[PET_FRAME_COUNT];
static PetAnimation s_current = PET_ANIM_IDLE;
static bool s_resident;

static void prv_unload_frames(void) {
  if (!s_resident) {
    return;
  }
  for (int i = 0; i < PET_FRAME_COUNT; i++) {
    if (s_frames[i]) {
      gbitmap_destroy(s_frames[i]);
      s_frames[i] = NULL;
    }
  }
  s_resident = false;
}

static void prv_load_frames(PetAnimation anim) {
  if (s_resident && s_current == anim) {
    return;
  }
  prv_unload_frames();
  for (int i = 0; i < PET_FRAME_COUNT; i++) {
    s_frames[i] = gbitmap_create_with_resource(s_frame_resources[anim][i]);
  }
  s_current = anim;
  s_resident = true;
}

void pet_init(void) {
  prv_load_frames(s_current);
}

void pet_deinit(void) {
  prv_unload_frames();
}

void pet_set_animation(PetAnimation anim) {
  prv_load_frames(anim);
}

#if DEBUG_ANIM_CYCLE
// Advance to the next animation (called periodically by the debug timer).
void pet_cycle_animation(void) {
  prv_load_frames((s_current + 1) % PET_ANIM_COUNT);
}
#endif

GSize pet_size(void) {
  return GSize(PET_FRAME_SIZE, PET_FRAME_SIZE);
}

void pet_draw(GContext *ctx, GPoint origin, uint32_t tick) {
  if (!s_resident) {
    return;
  }
  // Advance one frame per tick: 10-frame loop.
  const GBitmap *frame = s_frames[tick % PET_FRAME_COUNT];
  if (!frame) {
    return;
  }
  GRect dest = GRect(origin.x, origin.y, PET_FRAME_SIZE, PET_FRAME_SIZE);
  graphics_draw_bitmap_in_rect(ctx, frame, dest);
}
