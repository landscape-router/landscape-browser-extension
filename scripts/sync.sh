#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_EXT_DIR="${ROOT_DIR}/.output/chrome-mv3"
RUNTIME_EXT_DIR="${ROOT_DIR}/.docker/chromium-extension"

if [[ ! -d "${BUILD_EXT_DIR}" ]]; then
  printf 'Chrome build output not found at %s\n' "${BUILD_EXT_DIR}" >&2
  printf 'Run pnpm run build first.\n' >&2
  exit 1
fi

mkdir -p "${RUNTIME_EXT_DIR}"

shopt -s dotglob nullglob
rm -rf "${RUNTIME_EXT_DIR}"/*
shopt -u dotglob nullglob

cp -a "${BUILD_EXT_DIR}/." "${RUNTIME_EXT_DIR}/"

printf 'Synced preview extension files to %s\n' "${RUNTIME_EXT_DIR}"
