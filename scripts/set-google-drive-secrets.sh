#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_REF="${SUPABASE_PROJECT_REF:-tgvhaogebiapygjmxhyt}"

if [[ -n "${1:-}" ]]; then
  ENV_FILE="$1"
elif [[ -f "$ROOT_DIR/.env.local" ]]; then
  ENV_FILE="$ROOT_DIR/.env.local"
elif [[ -f "$ROOT_DIR/.env" ]]; then
  ENV_FILE="$ROOT_DIR/.env"
else
  echo "Missing .env.local or .env"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

REDIRECT_URI="${GOOGLE_DRIVE_REDIRECT_URI:-https://${PROJECT_REF}.supabase.co/functions/v1/google_drive_oauth_callback}"

if [[ -z "${GOOGLE_DRIVE_CLIENT_ID:-}" || -z "${GOOGLE_DRIVE_CLIENT_SECRET:-}" ]]; then
  echo "Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET in $ENV_FILE first."
  exit 1
fi

echo "Setting Google Drive secrets on Supabase project ${PROJECT_REF}..."

if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  export REDIRECT_URI
  RESPONSE=$(curl -sS -w "\n%{http_code}" -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$(python3 - <<'PY'
import json, os
print(json.dumps([
  {"name": "GOOGLE_DRIVE_CLIENT_ID", "value": os.environ["GOOGLE_DRIVE_CLIENT_ID"]},
  {"name": "GOOGLE_DRIVE_CLIENT_SECRET", "value": os.environ["GOOGLE_DRIVE_CLIENT_SECRET"]},
  {"name": "GOOGLE_DRIVE_REDIRECT_URI", "value": os.environ["REDIRECT_URI"]},
] + ([{"name": "GOOGLE_DRIVE_STATE_SECRET", "value": os.environ["GOOGLE_DRIVE_STATE_SECRET"]}] if os.environ.get("GOOGLE_DRIVE_STATE_SECRET") else [])))
PY
)")
  HTTP_CODE="${RESPONSE##*$'\n'}"
  BODY="${RESPONSE%$'\n'*}"
  if [[ "$HTTP_CODE" != "201" && "$HTTP_CODE" != "200" ]]; then
    echo "Failed to set secrets (HTTP ${HTTP_CODE}): ${BODY}"
    exit 1
  fi
  echo "Done via Management API."
  exit 0
fi

if ! supabase secrets set \
  GOOGLE_DRIVE_CLIENT_ID="$GOOGLE_DRIVE_CLIENT_ID" \
  GOOGLE_DRIVE_CLIENT_SECRET="$GOOGLE_DRIVE_CLIENT_SECRET" \
  GOOGLE_DRIVE_REDIRECT_URI="$REDIRECT_URI"; then
  echo
  echo "Supabase secrets requires a classic personal access token (sbp_...)."
  echo "Browser 'supabase login' is not enough for secrets."
  echo
  echo "1. Create a token at https://supabase.com/dashboard/account/tokens"
  echo "   Use 'Generate new token' (classic), not experimental sbp_v0_ tokens."
  echo "2. Add it to .env.local as SUPABASE_ACCESS_TOKEN=sbp_..."
  echo "3. Re-run: bash scripts/set-google-drive-secrets.sh"
  exit 1
fi

if [[ -n "${GOOGLE_DRIVE_STATE_SECRET:-}" ]]; then
  supabase secrets set GOOGLE_DRIVE_STATE_SECRET="$GOOGLE_DRIVE_STATE_SECRET"
fi

echo "Done via Supabase CLI."
