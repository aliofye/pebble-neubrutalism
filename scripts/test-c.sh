#!/usr/bin/env bash
# Compile + run the host-side C tests (no Pebble SDK needed — these modules are
# pure C). Each test/c/<name>.test.c is paired with src/c/<name>.c.
set -euo pipefail
cd "$(dirname "$0")/.."

shopt -s nullglob   # no test/c/*.test.c yet -> loop runs zero times, still passes

out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT

for test in test/c/*.test.c; do
  base="$(basename "$test" .test.c)"
  cc -std=c11 -Wall -Wextra -Werror -I src/c "$test" "src/c/$base.c" -o "$out/$base.test"
  "$out/$base.test"
  echo "PASS $base"
done

# Widget modules (tools/pebble-editor/widgets/<name>/<name>.c) compile against
# the fake Pebble SDK in test/c/fake. Each test/c/widgets/<name>.test.c pairs
# with its widget module plus the fake implementations.
for test in test/c/widgets/*.test.c; do
  base="$(basename "$test" .test.c)"
  # The time/date widgets reuse the shared time_util template (the same file
  # generate-app copies into each scaffold), so their tests link it too.
  extra=""
  extra_inc=""
  if [ "$base" = "time" ] || [ "$base" = "date" ]; then
    extra="tools/pebble-editor/templates/time_util.c"
    extra_inc="-I tools/pebble-editor/templates"
  fi
  # -iquote (not -I) for the widget dir: widget headers are always
  # quoted-included, and -I would let widgets/time/time.h shadow libc <time.h>.
  # shellcheck disable=SC2086
  cc -std=c11 -Wall -Wextra -Werror -iquote "tools/pebble-editor/widgets/$base" -I test/c/fake \
    $extra_inc "$test" "tools/pebble-editor/widgets/$base/$base.c" test/c/fake/fake.c \
    $extra -o "$out/$base.test"
  "$out/$base.test"
  echo "PASS widget/$base"
done

echo "All C tests passed"