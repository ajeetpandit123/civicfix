#!/usr/bin/env bash
# Verifies the development PostgreSQL is up and reachable via DATABASE_URL.
set -euo pipefail
cd "$(dirname "$0")/.."
exec node scripts/verify-db.mjs
