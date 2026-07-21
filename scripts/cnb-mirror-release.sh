#!/usr/bin/env bash
set -euo pipefail

# ── CNB 国内更新镜像发布脚本 ──
# 用途：将已签名的 GitHub Preview Release 资产同步到 CNB 公开仓库
# 前置条件：
#   1. GitHub Release（tag: preview）已包含所有资产
#   2. CNB 仓库已创建且为公开
#   3. CNB_API_TOKEN 环境变量已设置
#   4. CNB_REPO_ORG、CNB_REPO_NAME 环境变量已设置

# ── 配置（通过环境变量覆盖）──
GITHUB_RELEASE_REPO="${GITHUB_RELEASE_REPO:-ldymax34-ship-it/ldymax34-ship-it-brand-material-workbench-releases}"
GITHUB_TAG="${GITHUB_TAG:-preview}"
CNB_REPO_ORG="${CNB_REPO_ORG:-}"      # 例如：my-org
CNB_REPO_NAME="${CNB_REPO_NAME:-}"    # 例如：brand-material-updates
CNB_BASE="${CNB_BASE:-https://cnb.cool}"  # CNB 实例基础 URL
CNB_API_TOKEN="${CNB_API_TOKEN:-}"
VERSION="${VERSION:-$(node -p "require('./package.json').version" 2>/dev/null || echo '0.1.29')}"

# ── 验证必需参数 ──
if [[ -z "$CNB_REPO_ORG" || -z "$CNB_REPO_NAME" ]]; then
  echo "错误：请设置 CNB_REPO_ORG 和 CNB_REPO_NAME 环境变量"
  echo "示例：CNB_REPO_ORG=my-org CNB_REPO_NAME=my-repo ./scripts/cnb-mirror-release.sh"
  exit 1
fi

if [[ -z "$CNB_API_TOKEN" ]]; then
  echo "错误：请设置 CNB_API_TOKEN 环境变量"
  exit 1
fi

CNB_RELEASE_DOWNLOAD_BASE="${CNB_BASE}/${CNB_REPO_ORG}/${CNB_REPO_NAME}/-/releases/download/preview"
GITHUB_DOWNLOAD_BASE="https://github.com/${GITHUB_RELEASE_REPO}/releases/download/${GITHUB_TAG}"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "=== CNB 镜像发布 ==="
echo "版本: ${VERSION}"
echo "GitHub: ${GITHUB_DOWNLOAD_BASE}"
echo "CNB:    ${CNB_RELEASE_DOWNLOAD_BASE}"
echo ""

# ── 1. 下载 GitHub Release 资产 ──
echo "[1/5] 从 GitHub 下载资产..."
cd "$WORKDIR"

declare -A ASSETS=(
  ["latest-preview.json"]="${GITHUB_DOWNLOAD_BASE}/latest-preview.json"
  ["${VERSION}_darwin-aarch64_updater.tar.gz"]="${GITHUB_DOWNLOAD_BASE}/BrandMaterialWorkbench_${VERSION}_darwin-aarch64_updater.tar.gz"
  ["${VERSION}_darwin-aarch64_updater.tar.gz.sig"]="${GITHUB_DOWNLOAD_BASE}/BrandMaterialWorkbench_${VERSION}_darwin-aarch64_updater.tar.gz.sig"
  ["${VERSION}_windows-x86_64_updater.exe"]="${GITHUB_DOWNLOAD_BASE}/BrandMaterialWorkbench_${VERSION}_windows-x86_64_updater.exe"
  ["${VERSION}_windows-x86_64_updater.exe.sig"]="${GITHUB_DOWNLOAD_BASE}/BrandMaterialWorkbench_${VERSION}_windows-x86_64_updater.exe.sig"
  ["${VERSION}_macOS_arm64.dmg"]="${GITHUB_DOWNLOAD_BASE}/BrandMaterialWorkbench_${VERSION}_macOS_arm64.dmg"
  ["${VERSION}_Windows_x64_Setup.exe"]="${GITHUB_DOWNLOAD_BASE}/BrandMaterialWorkbench_${VERSION}_Windows_x64_Setup.exe"
)

for name in "${!ASSETS[@]}"; do
  url="${ASSETS[$name]}"
  echo "  下载 ${name}..."
  curl -fsSL -o "$name" "$url" || { echo "  警告：${name} 下载失败（可能不存在），跳过"; continue; }
done

# ── 2. 验证 SHA-256 ──
echo ""
echo "[2/5] 验证 SHA-256..."
for name in "${!ASSETS[@]}"; do
  if [[ -f "$name" ]]; then
    shasum -a 256 "$name"
  fi
done

# ── 3. 修改 latest-preview.json 的 URL 指向 CNB ──
echo ""
echo "[3/5] 修改 manifest URL 指向 CNB..."
if [[ -f "latest-preview.json" ]]; then
  # 用 Python 精确替换 URL
  python3 -c "
import json, sys

with open('latest-preview.json', 'r') as f:
    manifest = json.load(f)

cnb_base = '${CNB_RELEASE_DOWNLOAD_BASE}'
version = '${VERSION}'

# 更新各平台 URL
manifest['platforms']['darwin-aarch64']['url'] = f'{cnb_base}/{version}_darwin-aarch64_updater.tar.gz'
manifest['platforms']['windows-x86_64']['url'] = f'{cnb_base}/{version}_windows-x86_64_updater.exe'

with open('latest-preview-cnb.json', 'w') as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)
    f.write('\n')

print('CNB manifest 已生成: latest-preview-cnb.json')
"
  mv latest-preview-cnb.json latest-preview.json
else
  echo "错误：未找到 latest-preview.json"
  exit 1
fi

# ── 4. 上传到 CNB ──
echo ""
echo "[4/5] 上传资产到 CNB..."

# CNB API 端点（根据 CNB 实际 API 调整）
CNB_API="${CNB_BASE}/api/v1"

upload_to_cnb() {
  local file="$1"
  local filename="$2"
  echo "  上传 ${filename}..."

  # 注意：以下 curl 命令是模板，实际参数取决于 CNB API 规范
  # 常见 CNB（如 cnb.cool）使用类 GitLab API 或自有 API
  curl -sS -X POST \
    -H "Authorization: Bearer ${CNB_API_TOKEN}" \
    -H "Content-Type: multipart/form-data" \
    -F "file=@${file}" \
    "${CNB_API}/repos/${CNB_REPO_ORG}/${CNB_REPO_NAME}/releases/preview/assets" \
    || echo "  警告：${filename} 上传失败，CNB API 格式可能需要调整"
}

for name in "${!ASSETS[@]}"; do
  if [[ -f "$name" ]]; then
    upload_to_cnb "$name" "$name"
  fi
done

# ── 5. 验证匿名下载 ──
echo ""
echo "[5/5] 验证 CNB 匿名下载..."
echo "  请手动验证以下 URL 可匿名访问："
echo ""
for name in "${!ASSETS[@]}"; do
  if [[ -f "$name" ]]; then
    echo "  ${CNB_RELEASE_DOWNLOAD_BASE}/${name}"
  fi
done
echo ""
echo "  验证命令示例："
echo "  curl -I ${CNB_RELEASE_DOWNLOAD_BASE}/latest-preview.json"
echo "  curl -o /dev/null -w '%{http_code}' ${CNB_RELEASE_DOWNLOAD_BASE}/latest-preview.json"

echo ""
echo "=== CNB 镜像发布完成 ==="
echo "下一步："
echo "1. 验证所有 URL 可匿名下载（返回 200）"
echo "2. 验证 latest-preview.json 内容正确（url 字段指向 CNB）"
echo "3. 将 CNB URL 加入 tauri.conf.json 的 endpoints 首位"
echo "4. 构建 0.1.30 过渡版并在 GitHub 发布"
