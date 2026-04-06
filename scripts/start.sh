#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_EXT_DIR="${ROOT_DIR}/.output/chrome-mv3"
CONFIG_DIR="${ROOT_DIR}/.docker/chromium-config"
RUNTIME_EXT_DIR="${ROOT_DIR}/.docker/chromium-extension"

if [[ ! -d "${BUILD_EXT_DIR}" ]]; then
  printf 'Chrome build output not found at %s\n' "${BUILD_EXT_DIR}" >&2
  printf 'Run pnpm run build first.\n' >&2
  exit 1
fi

mkdir -p "${CONFIG_DIR}"
mkdir -p "${RUNTIME_EXT_DIR}"

shopt -s dotglob nullglob
rm -rf "${RUNTIME_EXT_DIR}"/*
shopt -u dotglob nullglob

cp -a "${BUILD_EXT_DIR}/." "${RUNTIME_EXT_DIR}/"

export LANDSCAPE_UID="$(id -u)"
export LANDSCAPE_GID="$(id -g)"
export LANDSCAPE_EXT_DIR="${RUNTIME_EXT_DIR}"
export LANDSCAPE_CHROMIUM_CONFIG_DIR="${CONFIG_DIR}"

sudo --preserve-env=LANDSCAPE_UID,LANDSCAPE_GID,LANDSCAPE_EXT_DIR,LANDSCAPE_CHROMIUM_CONFIG_DIR,TZ \
  docker compose -f "${ROOT_DIR}/docker/chromium.compose.yml" up -d

printf '\nChromium container started.\n'
printf 'Web UI: https://127.0.0.1:3001/\n'
printf 'Accept the self-signed certificate warning once, then the app will load.\n'
printf 'Container name: landscape-router-chromium\n'
