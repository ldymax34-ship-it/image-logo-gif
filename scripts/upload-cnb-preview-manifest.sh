#!/usr/bin/env bash
set -euo pipefail

MANIFEST_PATH="${1:-release/latest-preview.json}"
CNB_REPOSITORY="${CNB_REPOSITORY:-YTT_mgbox/brand-material-workbench-releases}"
CNB_RELEASE_ID="${CNB_RELEASE_ID:-2079774279952793600}"

: "${CNB_RELEASE_TOKEN:?CNB_RELEASE_TOKEN is required}"
test -f "$MANIFEST_PATH"

TICKET_FILE="$(mktemp)"
RESULT_FILE="$(mktemp)"
trap 'rm -f "$TICKET_FILE" "$RESULT_FILE"' EXIT

SIZE="$(wc -c < "$MANIFEST_PATH" | tr -d ' ')"
API_BASE="https://api.cnb.cool/${CNB_REPOSITORY}/-/releases/${CNB_RELEASE_ID}"

HTTP_STATUS="$(curl -sS -o "$TICKET_FILE" -w '%{http_code}' \
  -X POST \
  -H "Authorization: Bearer ${CNB_RELEASE_TOKEN}" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  --data "{\"asset_name\":\"latest-preview.json\",\"overwrite\":true,\"size\":${SIZE},\"ttl\":0}" \
  "${API_BASE}/asset-upload-url")"
test "$HTTP_STATUS" = 201

UPLOAD_URL="$(jq -er '.upload_url' "$TICKET_FILE")"
VERIFY_URL="$(jq -er '.verify_url' "$TICKET_FILE")"

HTTP_STATUS="$(curl -sS -o "$RESULT_FILE" -w '%{http_code}' \
  -X PUT \
  -H 'Content-Type: application/json' \
  --data-binary "@${MANIFEST_PATH}" \
  "$UPLOAD_URL")"
case "$HTTP_STATUS" in
  200|201|204) ;;
  *) exit 1 ;;
esac

case "$VERIFY_URL" in
  http*) ;;
  *) VERIFY_URL="https://api.cnb.cool${VERIFY_URL}" ;;
esac

HTTP_STATUS="$(curl -sS -o "$RESULT_FILE" -w '%{http_code}' \
  -X POST \
  -H "Authorization: Bearer ${CNB_RELEASE_TOKEN}" \
  -H 'Accept: application/json' \
  "$VERIFY_URL")"
case "$HTTP_STATUS" in
  200|201|204) ;;
  *) exit 1 ;;
esac

echo 'CNB Preview manifest mirror updated.'
