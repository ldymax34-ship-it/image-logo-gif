#!/usr/bin/env bash
set -euo pipefail

# CNB release mirror preparation (safe dry-run only).
# It downloads public GitHub release assets, records hashes, and prepares local
# upload files. It never uploads, reads a token, or handles a Tauri private key.

GITHUB_RELEASE_REPO="${GITHUB_RELEASE_REPO:-ldymax34-ship-it/ldymax34-ship-it-brand-material-workbench-releases}"
GITHUB_TAG="${GITHUB_TAG:-preview}"
CNB_SLUG="${CNB_SLUG:-YTT_mgbox/brand-material-workbench-releases}"
VERSION="${VERSION:-$(node -p "require('./package.json').version" 2>/dev/null || echo '0.1.29')}"
OUTPUT_DIR="${OUTPUT_DIR:-$PWD/dist/cnb-mirror-${VERSION}}"

# Do not infer this from a CNB repository URL. Set it only after an actual
# anonymous CNB attachment URL has been verified for this repository.
CNB_RELEASE_DOWNLOAD_BASE="${CNB_RELEASE_DOWNLOAD_BASE:-}"
GITHUB_DOWNLOAD_BASE="https://github.com/${GITHUB_RELEASE_REPO}/releases/download/${GITHUB_TAG}"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "=== CNB mirror preparation (local dry-run) ==="
echo "Version: ${VERSION}"
echo "CNB repository slug: ${CNB_SLUG}"
echo "Verified CNB asset base: ${CNB_RELEASE_DOWNLOAD_BASE:-not supplied}"
echo ""

declare -A ASSETS=(
  ["latest-preview.json"]="${GITHUB_DOWNLOAD_BASE}/latest-preview.json"
  ["${VERSION}_darwin-aarch64_updater.tar.gz"]="${GITHUB_DOWNLOAD_BASE}/BrandMaterialWorkbench_${VERSION}_darwin-aarch64_updater.tar.gz"
  ["${VERSION}_darwin-aarch64_updater.tar.gz.sig"]="${GITHUB_DOWNLOAD_BASE}/BrandMaterialWorkbench_${VERSION}_darwin-aarch64_updater.tar.gz.sig"
  ["${VERSION}_windows-x86_64_updater.exe"]="${GITHUB_DOWNLOAD_BASE}/BrandMaterialWorkbench_${VERSION}_windows-x86_64_updater.exe"
  ["${VERSION}_windows-x86_64_updater.exe.sig"]="${GITHUB_DOWNLOAD_BASE}/BrandMaterialWorkbench_${VERSION}_windows-x86_64_updater.exe.sig"
  ["${VERSION}_macOS_arm64.dmg"]="${GITHUB_DOWNLOAD_BASE}/BrandMaterialWorkbench_${VERSION}_macOS_arm64.dmg"
  ["${VERSION}_Windows_x64_Setup.exe"]="${GITHUB_DOWNLOAD_BASE}/BrandMaterialWorkbench_${VERSION}_Windows_x64_Setup.exe"
)

echo "[1/4] Downloading public GitHub release assets..."
cd "$WORKDIR"
DOWNLOADED=()
for name in "${!ASSETS[@]}"; do
  printf '  %-50s ' "${name}..."
  if curl -fsSL -o "$name" "${ASSETS[$name]}" 2>/dev/null; then
    echo OK
    DOWNLOADED+=("$name")
  else
    echo 'not present (skipped)'
  fi
done

if [[ ! -f latest-preview.json ]]; then
  echo 'ERROR: latest-preview.json was not found in the public GitHub release.' >&2
  exit 1
fi

echo "[2/4] Recording SHA-256 hashes..."
mkdir -p "$OUTPUT_DIR"
for name in "${DOWNLOADED[@]}"; do
  shasum -a 256 "$name"
done | tee "$OUTPUT_DIR/SHA256SUMS"
cp "${DOWNLOADED[@]}" "$OUTPUT_DIR/"

echo "[3/4] Preparing manifest..."
if [[ -z "$CNB_RELEASE_DOWNLOAD_BASE" ]]; then
  rm -f "$OUTPUT_DIR/latest-preview.json"
  echo '  No verified CNB attachment base was supplied.'
  echo '  Assets and SHA256SUMS are prepared, but no CNB manifest was generated.'
  echo '  After verifying a real anonymous URL, rerun with CNB_RELEASE_DOWNLOAD_BASE=<verified-base>.'
else
  python3 - "$CNB_RELEASE_DOWNLOAD_BASE" "$WORKDIR/latest-preview.json" "$OUTPUT_DIR/latest-preview.json" <<'PY'
import json
import sys

base, source, destination = sys.argv[1].rstrip('/'), sys.argv[2], sys.argv[3]
with open(source, encoding='utf-8') as f:
    original = json.load(f)
manifest = json.loads(json.dumps(original))
for platform, filename in {
    'darwin-aarch64': 'darwin-aarch64_updater.tar.gz',
    'windows-x86_64': 'windows-x86_64_updater.exe',
}.items():
    if platform not in manifest.get('platforms', {}):
        raise SystemExit(f'manifest lacks platform: {platform}')
    manifest['platforms'][platform]['url'] = f"{base}/{manifest['version']}_{filename}"
    if manifest['platforms'][platform]['signature'] != original['platforms'][platform]['signature']:
        raise SystemExit(f'signature changed unexpectedly: {platform}')
with open(destination, 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
    f.write('\n')
print(f'  Wrote {destination}; signatures were preserved.')
PY
fi

echo "[4/4] Manual CNB checklist"
echo '  1. Initialize the release-only repository with README.md and any verified CNB config.'
echo "  2. Create the preview Release in CNB's Web UI (or use only documented CNB release tooling)."
echo "  3. Upload files from: $OUTPUT_DIR"
echo '  4. Verify actual anonymous asset links before configuring the application:'
echo "     curl -fsSIL '<actual latest-preview.json attachment URL>'"
echo "     curl -fsSIL -H 'Range: bytes=0-0' '<actual updater attachment URL>'"
echo '  5. Only then generate the CNB manifest by rerunning with the verified attachment base.'
echo ''
echo 'This script does not upload anything, call guessed APIs/CLI commands, read tokens, or expose signing keys.'
