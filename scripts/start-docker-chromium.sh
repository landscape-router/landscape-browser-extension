#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_DIR="${ROOT_DIR}/.output/chrome-mv3"
CONFIG_DIR="${ROOT_DIR}/.docker/chromium-config"

if [[ ! -d "${EXT_DIR}" ]]; then
  printf 'Chrome build output not found at %s\n' "${EXT_DIR}" >&2
  printf 'Run npm run build first.\n' >&2
  exit 1
fi

mkdir -p "${CONFIG_DIR}"

export LANDSCAPE_UID="$(id -u)"
export LANDSCAPE_GID="$(id -g)"
export LANDSCAPE_EXT_DIR="${EXT_DIR}"
export LANDSCAPE_CHROMIUM_CONFIG_DIR="${CONFIG_DIR}"

sudo --preserve-env=LANDSCAPE_UID,LANDSCAPE_GID,LANDSCAPE_EXT_DIR,LANDSCAPE_CHROMIUM_CONFIG_DIR,TZ \
  docker compose -f "${ROOT_DIR}/docker/chromium.compose.yml" up -d

printf '\nChromium container started.\n'
printf 'Web UI: https://127.0.0.1:3001/\n'
printf 'Accept the self-signed certificate warning once, then the app will load.\n'
printf 'Container name: landscape-router-chromium\n'
