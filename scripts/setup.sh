#!/usr/bin/env bash
# One-shot environment setup for agents and CI (Codex cloud setup script, GitHub Actions, a fresh Mac).
# Installs dependencies, the headless Chromium used by tools/*.mjs, and proves the build with `npm run check`.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== node $(node -v), npm $(npm -v)"
if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Headless browser for screenshots/clips/smoke. On Linux as root, --with-deps installs the system libraries.
if [ "${SKIP_BROWSER:-0}" != "1" ]; then
  if [ "$(uname -s)" = "Linux" ] && [ "$(id -u)" = "0" ]; then
    npx playwright install --with-deps chromium
  else
    npx playwright install chromium
  fi
fi

npm run check
echo "== setup complete"
