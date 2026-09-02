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

echo "All C tests passed"