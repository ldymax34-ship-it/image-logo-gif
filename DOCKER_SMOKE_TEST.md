# Docker Web Lite 打包与冒烟指南

本包是「品宣物料工作台」的 **Web Lite 静态服务器版本**。图片处理全部在访问者浏览器内完成，Docker 容器只分发 `HTML/JS/CSS`，不参与计算、不接收素材上传、不内置 FFmpeg。

---

## 0. 这个包是什么

- `Dockerfile`、`nginx.conf`、`.dockerignore`：Docker 构建与 Nginx 配置。
- 前端源码 + `package.json` + `package-lock.json`：`docker build` 时在容器内执行 `npm ci && npm run build`。
- `DOCKER_SMOKE_TEST.md`：本指南。

**这不是 `docker image` 成品**，而是**构建上下文**。你需要在本机跑一次 `docker build` 才会生成镜像。

---

## 1. 前置条件（先确认，否则 build/run 会失败）

- Docker Desktop 已安装并正常，`docker run hello-world` 成功。
- 80 端口已被占用时，本包统一使用 **8080**。
- 构建机能访问 `registry.npmjs.org`（`npm ci` 需要）。若公司内网访问不了，见「故障排查 §8.1」。

验证：

```powershell
docker version
docker run hello-world
```

---

## 2. 快速开始

```powershell
# 解压（假设包名是 brand-material-web-docker.tar.gz）
mkdir brand-material-web
tar -xzf brand-material-web-docker.tar.gz -C brand-material-web
cd brand-material-web

# 构建镜像
docker build -t brand-material-web .

# 启动容器（后台，映射 8080）
docker run -d --name brand-material-web -p 8080:8080 brand-material-web

# 本机访问
start http://localhost:8080
```

内网同事访问（本机内网 IP 示例）：

```text
http://10.100.41.9:8080
```

停止 / 清理：

```powershell
docker stop brand-material-web
docker rm brand-material-web
```

---

## 3. 包内容清单

```text
Dockerfile
nginx.conf
.dockerignore
package.json
package-lock.json
index.html
vite.config.ts
tsconfig.json
tsconfig.app.json
tsconfig.node.json
public/
src/
DOCKER_SMOKE_TEST.md
```

（不包含：`node_modules/`、`dist/`、`.git/`、`src-tauri/`——这些由 Docker 重新构建或本就不需要。）

---

## 4. 冒烟测试（最快版，10 分钟）

按顺序做，任何一步失败都先停在那一格，不要继续。

| # | 操作 | 预期结果 | 通过 |
|---|---|---|---|
| S1 | 浏览器打开 `http://localhost:8080` | 出现「品宣工具箱」首页，深色界面 | ☐ |
| S2 | 看首页底部 | 显示「素材仅在本机浏览器处理」（**不是**「本地 FFmpeg 引擎」） | ☐ |
| S3 | 看首页工具区 | 有「Logo 与版式」「水印与追溯」；无可用视频/GIF 入口 | ☐ |
| S4 | 看首页提示条 | 出现「视频 / GIF 处理仅支持桌面版，请使用品宣物料工作台客户端。」 | ☐ |
| S5 | 打开「设置」 | 启动时打开的下拉里**没有**「GIF / 媒体工具」 | ☐ |
| S6 | F12 → Network → 勾选 Fetch/XHR | 打开首页后无任何 `POST` 上传请求 | ☐ |

---

## 5. 详细测试用例

### TC-01 网页端环境判定正确

- **前置**：无 Tauri，普通浏览器打开 `http://localhost:8080`。
- **步骤**：进入首页，检查底部文案与提示条。
- **预期**：底部「素材仅在本机浏览器处理」；出现「视频/GIF 仅桌面版」提示。
- **判定**：同时满足 → 通过。

### TC-02 导入本地 PNG/JPG

- **步骤**：进入「Logo 与版式」→ 导入一张本地 PNG 和一张 JPG。
- **预期**：图片出现在画板/画布，无卡死、无报错。
- **判定**：两张都能正常显示 → 通过。

### TC-03 尺寸适配 / 裁切

- **步骤**：选择常用画板尺寸，触发适配。
- **预期**：预览按目标尺寸正确裁切/留白。
- **判定**：预览符合所选尺寸 → 通过。

### TC-04 Logo / CPR 叠加

- **步骤**：在版式里启用 Logo 与 CPR，调整位置/缩放。
- **预期**：叠加层跟随调整实时更新。
- **判定**：视觉与参数一致 → 通过。

### TC-05 水印与追溯

- **步骤**：打开「水印与追溯」，调整文字水印参数，预览。
- **预期**：水印按参数渲染在图片上。
- **判定**：预览正确 → 通过。

### TC-06 导出 PNG/JPG（Chromium）

- **步骤**：批量导出 PNG 和 JPG。
- **预期**：Chromium 弹出目录选择器（`showDirectoryPicker`），文件写入你选的本地目录。
- **判定**：文件落到所选目录、内容正确 → 通过。

### TC-07 导出 PNG/JPG（非 Chromium / 降级）

- **步骤**：在 Firefox 或 Safari 导出。
- **预期**：改为逐个浏览器下载；批量时浏览器提示允许多文件下载。
- **判定**：文件正常下载 → 通过。

### TC-08 无素材上传请求

- **步骤**：导入 → 编辑 → 导出全程开着 DevTools Network，过滤 Fetch/XHR。
- **预期**：只有静态资源 GET，没有任何向服务器 `POST/PUT` 素材的请求。
- **判定**：零上传请求 → 通过。

### TC-09 GIF / 媒体入口在浏览器禁用

- **步骤**：在首页和设置里寻找视频/GIF 工具。
- **预期**：找不到可用入口，且看到「仅桌面版」提示。
- **判定**：无可用入口 → 通过。

### TC-10 SPA 路由回退

- **步骤**：直接访问 `http://localhost:8080/some/deep/route`。
- **预期**：返回 200 并渲染首页（`index.html`）。
- **判定**：200 + 正常页面 → 通过。

### TC-11 Docker 容器内复测

- **步骤**：在容器运行状态下重复 TC-01、TC-02、TC-06、TC-08。
- **预期**：与宿主浏览器结果一致。
- **判定**：一致 → 通过。

### TC-12 内网另一台电脑访问

- **步骤**：另一台内网电脑访问 `http://10.100.41.9:8080`。
- **预期**：能打开并完成 TC-01/02/06。
- **判定**：可访问 → 通过；访问不到见 §8.4。

### TC-13 设置持久化

- **步骤**：设置「启动时打开」分别为工具箱首页 / Logo 与版式 / 水印与追溯 / 上次使用的工具，刷新页面。
- **预期**：刷新后按所选工具启动；浏览器里始终没有「GIF / 媒体工具」选项。
- **判定**：行为一致 → 通过。

---

## 6. 自动化冒烟（可选）

### PowerShell（Windows 宿主机）

```powershell
$base = "http://localhost:8080"

foreach ($u in @("$base/", "$base/some/deep/route")) {
  try {
    $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 10
    Write-Output ("[PASS] {0} -> {1} {2}" -f $u, $r.StatusCode, $r.Headers['Content-Type'])
  } catch {
    Write-Output ("[FAIL] {0} -> {1}" -f $u, $_.Exception.Message)
  }
}

$html = (Invoke-WebRequest -Uri "$base/" -UseBasicParsing).Content
$asset = [regex]::Match($html, '/assets/[^"]+\.js').Value
if ($asset) {
  $ar = Invoke-WebRequest -Uri "$base$asset" -UseBasicParsing -TimeoutSec 10
  Write-Output ("[PASS] entry {0} -> {1} {2}" -f $asset, $ar.StatusCode, $ar.Headers['Content-Type'])
}
```

### bash / WSL（Ubuntu）

```bash
BASE=http://localhost:8080
for path in / /some/deep/route; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$path")
  echo "index $path -> $code"
done
html=$(curl -s "$BASE/")
asset=$(printf '%s' "$html" | grep -oE '/assets/[^"]+\.js' | head -1)
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$asset")
echo "entry $asset -> $code"
```

预期：首页与回退都是 `200`，入口 JS 是 `200`。

---

## 7. 故障排查

### 7.1 `docker build` 卡在 `npm ci` 或报 registry 错误

构建机访问不了 `registry.npmjs.org`。在解压后的目录新建 `.npmrc`（不要提交到公开仓库）：

```text
registry=https://你的内网npm镜像地址/
```

然后重新 `docker build`。

### 7.2 端口 8080 被占用

```powershell
docker ps
netstat -ano | findstr :8080
```

换端口运行：

```powershell
docker run -d --name brand-material-web -p 9090:8080 brand-material-web
```

访问 `http://localhost:9090`。

### 7.3 本机能访问、内网访问不到

大概率是 Windows 防火墙没放行。新建入站规则：

- 协议/端口：TCP 8080
- 范围：仅公司内网网段（不要选「任何地址」）
- 动作：允许

确认后再测 TC-12。

### 7.4 批量下载被浏览器拦截

浏览器会拦多文件下载。允许该站点下载多个文件即可；或改用 Chrome/Edge 走目录选择器导出。

### 7.5 页面白屏 / 控制台报错

F12 看 Console。把报错和 `docker logs brand-material-web` 一起留存，便于回传定位。

---

## 8. 安全边界（务必遵守）

- 不要给容器加后端上传接口、数据库或素材存储。
- 不要把 FFmpeg 放进镜像来处理上传视频。
- 不要让网页执行本地 `ffmpeg.exe`。
- 不要把 `.env`、密钥、字体授权资源放进镜像或公开仓库。
- `public/brand-cpr`、`public/brand-logos` 是应用自带的默认 Logo/CPR 素材，若属公司内部敏感资源，发布镜像前请自行确认是否允许随网页分发。
- 只对内网开放，不要暴露公网。
