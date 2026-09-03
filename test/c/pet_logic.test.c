// Host-side test for pet_logic. Compiles without the Pebble SDK (only libc):
// run via scripts/test-c.sh.
#include <stdio.h>
#include "pet_logic.h"

static int failures = 0;

static void check(const char *what, int cond) {
  if (!cond) { printf("FAIL: %s\n", what); failures++; }
}

int main(void) {
  // Clear weather -> happy -> gesture bounce
  check("code 0 is gesture", pet_animation_for_conditions(0, 1, 80) == PET_ANIM_GESTURE);
  check("code 1 is gesture", pet_animation_for_conditions(1, 1, 80) == PET_ANIM_GESTURE);

  // Clouds / fog / snow / unknown -> calm idle
  check("code 2 is idle", pet_animation_for_conditions(2, 1, 80) == PET_ANIM_IDLE);
  check("code 3 is idle", pet_animation_for_conditions(3, 1, 80) == PET_ANIM_IDLE);
  check("code 45 is idle", pet_animation_for_conditions(45, 1, 80) == PET_ANIM_IDLE);
  check("code 48 is idle", pet_animation_for_conditions(48, 1, 80) == PET_ANIM_IDLE);
  check("code 71 is idle", pet_animation_for_conditions(71, 1, 80) == PET_ANIM_IDLE);
  check("code 85 is idle", pet_animation_for_conditions(85, 1, 80) == PET_ANIM_IDLE);
  check("unknown code is idle", pet_animation_for_conditions(999, 1, 80) == PET_ANIM_IDLE);

  // Drizzle / rain -> trudging walk
  check("code 51 is walk", pet_animation_for_conditions(51, 1, 80) == PET_ANIM_WALK);
  check("code 63 is walk", pet_animation_for_conditions(63, 1, 80) == PET_ANIM_WALK);
  check("code 67 is walk", pet_animation_for_conditions(67, 1, 80) == PET_ANIM_WALK);
  check("code 80 is walk", pet_animation_for_conditions(80, 1, 80) == PET_ANIM_WALK);
  check("code 82 is walk", pet_animation_for_conditions(82, 1, 80) == PET_ANIM_WALK);

  // Thunder -> scared attack (freaking out)
  check("code 95 is attack", pet_animation_for_conditions(95, 1, 80) == PET_ANIM_ATTACK);
  check("code 96 is attack", pet_animation_for_conditions(96, 1, 80) == PET_ANIM_ATTACK);
  check("code 99 is attack", pet_animation_for_conditions(99, 1, 80) == PET_ANIM_ATTACK);

  // No weather data -> neutral idle
  check("unavailable weather is idle", pet_animation_for_conditions(0, 0, 80) == PET_ANIM_IDLE);
  check("unavailable thunder is idle", pet_animation_for_conditions(95, 0, 80) == PET_ANIM_IDLE);

  // Dying battery -> death overrides everything
  check("low battery overrides clear", pet_animation_for_conditions(0, 1, 9) == PET_ANIM_DEATH);
  check("low battery overrides thunder", pet_animation_for_conditions(95, 1, 5) == PET_ANIM_DEATH);
  check("low battery overrides unavailable", pet_animation_for_conditions(0, 0, 1) == PET_ANIM_DEATH);
  check("10 percent is not death", pet_animation_for_conditions(0, 1, 10) == PET_ANIM_GESTURE);

  // Per-animation frame intervals: 200ms base, 100ms for the frantic attack
  check("idle interval is 200ms", pet_frame_interval_ms(PET_ANIM_IDLE) == 200);
  check("gesture interval is 200ms", pet_frame_interval_ms(PET_ANIM_GESTURE) == 200);
  check("walk interval is 200ms", pet_frame_interval_ms(PET_ANIM_WALK) == 200);
  check("attack interval is 100ms", pet_frame_interval_ms(PET_ANIM_ATTACK) == 100);
  check("death interval is 200ms", pet_frame_interval_ms(PET_ANIM_DEATH) == 200);

  if (failures) { printf("%d FAILURE(S)\n", failures); return 1; }
  printf("pet_logic: all ok\n");
  return 0;
}
