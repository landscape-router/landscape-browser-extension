#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${ROOT_DIR}"

if command -v pnpm >/dev/null 2>&1; then
  pnpm run build
else
  npx pnpm run build
fi

"${ROOT_DIR}/scripts/sync.sh"
"${ROOT_DIR}/scripts/stop.sh"
"${ROOT_DIR}/scripts/start.sh"

printf '\nExtension files rebuilt and synced into the Docker preview mount.\n'
printf 'Chromium preview has been restarted with the latest unpacked extension.\n'
printf 'You can also open the popup directly via chrome-extension://olfdmmddmbenbackdbhnbafbkhohfloe/popup.html\n'
