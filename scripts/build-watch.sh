#!/usr/bin/env bash
# Build the watchapp .pbw with the Pebble SDK. Requires pebble-tool + node on
# PATH. Run by CI (ci.yml) and by the release workflow.
set -euo pipefail
cd "$(dirname "$0")/.."
pebble build