#!/usr/bin/env bash
# Local regenerate: rebuilds from a local aiclothswap checkout, then commit & push.
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/generate.mjs --src "${1:-${AICLOTHSWAP_DIR:-/Volumes/li2/aiclothswap-mvp}}"
