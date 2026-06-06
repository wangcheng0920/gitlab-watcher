#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE_NAME="${IMAGE_NAME:-gitlab-watcher}"

if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  "$SCRIPT_DIR/docker-build.sh"
fi

"$SCRIPT_DIR/docker-start.sh"
