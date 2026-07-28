#!/usr/bin/env bash
set -euo pipefail

MANIFEST_PATH="${1:-release/latest-preview.json}"
ASSET_DIR="${2:-$(dirname "$MANIFEST_PATH")}"
CNB_REPOSITORY="${CNB_REPOSITORY:-YTT_mgbox/brand-material-workbench-releases}"
CNB_RELEASE_ID="${CNB_RELEASE_ID:-2079774279952793600}"
CNB_RELEASE_DOWNLOAD_BASE="${CNB_RELEASE_DOWNLOAD_BASE:-https://cnb.cool/YTT_mgbox/brand-material-workbench-releases/-/releases/download/preview}"

: "${CNB_RELEASE_TOKEN:?CNB_RELEASE_TOKEN is required}"
test -f "$MANIFEST_PATH"
test -d "$ASSET_DIR"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

VERSION="$(jq -er '.version' "$MANIFEST_PATH")"
CNB_MANIFEST="$WORK_DIR/latest-preview.json"
API_BASE="https://api.cnb.cool/${CNB_REPOSITORY}/-/releases/${CNB_RELEASE_ID}"

MAC_UPDATER="BrandMaterialWorkbench_${VERSION}_darwin-aarch64_updater.tar.gz"
MAC_SIGNATURE="${MAC_UPDATER}.sig"
MAC_INSTALLER="BrandMaterialWorkbench_${VERSION}_macOS_arm64.dmg"
WINDOWS_UPDATER="BrandMaterialWorkbench_${VERSION}_windows-x86_64_updater.exe"
WINDOWS_SIGNATURE="${WINDOWS_UPDATER}.sig"
WINDOWS_INSTALLER="BrandMaterialWorkbench_${VERSION}_Windows_x64_Setup.exe"

for asset_name in \
  "$MAC_UPDATER" \
  "$MAC_SIGNATURE" \
  "$MAC_INSTALLER" \
  "$WINDOWS_UPDATER" \
  "$WINDOWS_SIGNATURE" \
  "$WINDOWS_INSTALLER"; do
  test -f "$ASSET_DIR/$asset_name"
done

jq \
  --arg base "$CNB_RELEASE_DOWNLOAD_BASE" \
  --arg mac "$MAC_UPDATER" \
  --arg windows "$WINDOWS_UPDATER" \
  '.platforms["darwin-aarch64"].url = ($base + "/" + $mac)
   | .platforms["windows-x86_64"].url = ($base + "/" + $windows)' \
  "$MANIFEST_PATH" > "$CNB_MANIFEST"

jq -e \
  --arg base "$CNB_RELEASE_DOWNLOAD_BASE" \
  '(.platforms | keys | sort) == ["darwin-aarch64", "windows-x86_64"]
   and ([.platforms[].url | startswith($base + "/")] | all)
   and ([.platforms[].signature | (length > 0 and (startswith("http") | not))] | all)' \
  "$CNB_MANIFEST" > /dev/null

upload_asset() {
  local asset_path="$1"
  local asset_name="$2"
  local content_type="$3"
  local ticket_file="$WORK_DIR/ticket.json"
  local result_file="$WORK_DIR/result.json"
  local size upload_url verify_url http_status

  size="$(wc -c < "$asset_path" | tr -d ' ')"
  http_status="$(curl -sS -o "$ticket_file" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${CNB_RELEASE_TOKEN}" \
    -H 'Accept: application/json' \
    -H 'Content-Type: application/json' \
    --data "{\"asset_name\":\"${asset_name}\",\"overwrite\":true,\"size\":${size},\"ttl\":0}" \
    "${API_BASE}/asset-upload-url")"
  test "$http_status" = 201

  upload_url="$(jq -er '.upload_url' "$ticket_file")"
  verify_url="$(jq -er '.verify_url' "$ticket_file")"

  http_status="$(curl -sS -o "$result_file" -w '%{http_code}' \
    -X PUT \
    -H "Content-Type: ${content_type}" \
    --data-binary "@${asset_path}" \
    "$upload_url")"
  case "$http_status" in
    200|201|204) ;;
    *) exit 1 ;;
  esac

  case "$verify_url" in
    http*) ;;
    *) verify_url="https://api.cnb.cool${verify_url}" ;;
  esac

  http_status="$(curl -sS -o "$result_file" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${CNB_RELEASE_TOKEN}" \
    -H 'Accept: application/json' \
    "$verify_url")"
  case "$http_status" in
    200|201|204) ;;
    *) exit 1 ;;
  esac
}

# Upload immutable signed packages and installers first. Publishing the
# manifest last prevents clients from seeing URLs whose assets are incomplete.
for asset_name in \
  "$MAC_UPDATER" \
  "$MAC_SIGNATURE" \
  "$MAC_INSTALLER" \
  "$WINDOWS_UPDATER" \
  "$WINDOWS_SIGNATURE" \
  "$WINDOWS_INSTALLER"; do
  upload_asset "$ASSET_DIR/$asset_name" "$asset_name" 'application/octet-stream'
done
upload_asset "$CNB_MANIFEST" 'latest-preview.json' 'application/json'

curl -fsSIL -H 'Range: bytes=0-0' "${CNB_RELEASE_DOWNLOAD_BASE}/${MAC_UPDATER}" > /dev/null
curl -fsSIL -H 'Range: bytes=0-0' "${CNB_RELEASE_DOWNLOAD_BASE}/${WINDOWS_UPDATER}" > /dev/null
curl -fsSL "${CNB_RELEASE_DOWNLOAD_BASE}/latest-preview.json" \
  | jq -e --arg version "$VERSION" --arg base "$CNB_RELEASE_DOWNLOAD_BASE" \
      '.version == $version and ([.platforms[].url | startswith($base + "/")] | all)' > /dev/null

echo 'CNB Preview assets and domestic manifest mirror updated.'
