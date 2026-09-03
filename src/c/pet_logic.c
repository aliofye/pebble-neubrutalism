#include "pet_logic.h"

// Battery below this level plays the death animation regardless of weather.
#define PET_BATTERY_DEATH_PERCENT 10

PetAnimation pet_animation_for_conditions(int weather_code, int weather_available, int battery_percent) {
  if (battery_percent < PET_BATTERY_DEATH_PERCENT) {
    return PET_ANIM_DEATH;
  }
  if (!weather_available) {
    return PET_ANIM_IDLE;
  }
  switch (weather_code) {
    case 0:
    case 1:
      return PET_ANIM_GESTURE;
    case 51:
    case 53:
    case 55:
    case 56:
    case 57:
    case 61:
    case 63:
    case 65:
    case 66:
    case 67:
    case 80:
    case 81:
    case 82:
      return PET_ANIM_WALK;
    case 95:
    case 96:
    case 99:
      return PET_ANIM_ATTACK;
    default:
      return PET_ANIM_IDLE;
  }
}

int pet_frame_interval_ms(PetAnimation anim) {
  switch (anim) {
    case PET_ANIM_ATTACK:
      return 100;
    case PET_ANIM_IDLE:
    case PET_ANIM_GESTURE:
    case PET_ANIM_WALK:
    case PET_ANIM_DEATH:
    default:
      return 200;
  }
}
