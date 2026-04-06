#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export LANDSCAPE_UID="$(id -u)"
export LANDSCAPE_GID="$(id -g)"
export LANDSCAPE_EXT_DIR="${ROOT_DIR}/.output/chrome-mv3"
export LANDSCAPE_CHROMIUM_CONFIG_DIR="${ROOT_DIR}/.docker/chromium-config"

sudo --preserve-env=LANDSCAPE_UID,LANDSCAPE_GID,LANDSCAPE_EXT_DIR,LANDSCAPE_CHROMIUM_CONFIG_DIR,TZ \
  docker compose -f "${ROOT_DIR}/docker/chromium.compose.yml" down
