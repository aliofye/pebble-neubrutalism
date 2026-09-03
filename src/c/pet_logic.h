#pragma once

typedef enum {
  PET_ANIM_IDLE = 0,
  PET_ANIM_GESTURE,
  PET_ANIM_ATTACK,
  PET_ANIM_WALK,
  PET_ANIM_DEATH,
  PET_ANIM_COUNT,
} PetAnimation;

// Pick the animation from current conditions: weather code (WMO), whether
// weather data is available, and battery percent (0-100).
PetAnimation pet_animation_for_conditions(int weather_code, int weather_available, int battery_percent);

// Frame duration for an animation, in milliseconds.
int pet_frame_interval_ms(PetAnimation anim);
