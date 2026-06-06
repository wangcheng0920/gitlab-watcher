#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
IMAGE_NAME="${IMAGE_NAME:-gitlab-watcher}"
CONTAINER_NAME="${CONTAINER_NAME:-gitlab-watcher}"
PORT="${PORT:-3099}"

docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

docker run -d \
  --name "$CONTAINER_NAME" \
  -p "$PORT:3099" \
  -v "$PROJECT_DIR/tasks:/app/tasks" \
  --env-file "$PROJECT_DIR/.env" \
  "$IMAGE_NAME"
