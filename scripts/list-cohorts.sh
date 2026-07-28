#!/usr/bin/env bash
# Quick smoke check against the live API (no Next.js required).
set -euo pipefail

: "${PROJEX_API_KEY:?Set PROJEX_API_KEY}"
BASE="${PROJEX_API_URL:-https://app.projex.ai}"
BASE="${BASE%/}"

echo "→ GET $BASE/api/v1/cohorts?status=live"
curl -sS "$BASE/api/v1/cohorts?status=live" \
  -H "Authorization: Bearer $PROJEX_API_KEY" \
  -H "Accept: application/json" | jq .
