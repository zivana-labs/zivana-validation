#!/usr/bin/env bash
set -euo pipefail

if ! command -v openssl >/dev/null 2>&1; then
  echo "generate-seed.sh: openssl not found on PATH. Install openssl, or use generate-seed.js instead." >&2
  exit 1
fi

openssl rand -hex 64