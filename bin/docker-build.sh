#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
IMAGE_NAME="${IMAGE_NAME:-gitlab-watcher}"

docker build -t "$IMAGE_NAME" "$PROJECT_DIR"
