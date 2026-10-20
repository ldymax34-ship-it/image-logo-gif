# 安装包体积审计

## 目的

Windows 离线 WebView2 约 200MB 是已接受的固定安装基线。新增依赖仍须先找出真实占用来源并记录各平台增量，不得通过猜测或只看 `node_modules` 判断。

## 审计对象

分别记录：

| 平台 | 构建产物 | 压缩体积 | 安装后体积 | 备注 |
|---|---|---:|---:|---|
| Windows x64 | NSIS 安装包 | 待测 | 待测 | |
| Windows x64 | 安装目录 | - | 待测 | |
| macOS arm64 | DMG | 待测 | 待测 | |
| macOS arm64 | `.app` | - | 待测 | |

不要混淆 DMG/EXE 压缩体积与安装后应用目录体积。

## 必查来源

按体积从大到小列出应用包内部文件，重点检查：

- Tauri sidecar 二进制
- Python、Node 或其他运行环境
- FFmpeg、ImageMagick 等工具
- 模型权重
- 字体
- 重复图片、测试素材、source map
- 未使用的前端资源
- updater 产物或旧安装包是否被误打包
- macOS Frameworks / Resources
- Windows resources / binaries

## 输出格式

```txt
当前基线
- Windows NSIS：
- Windows 安装后：
- macOS DMG：
- macOS .app：

前 10 个体积来源
1.
2.
...

确认必须保留
-

可以移除或改为可选
-

无法确认
-

本次新增依赖预计增量
-

建议
- 保留 / 移除 / 可选组件 / 暂缓
```

## 规则

- 先审计，后添加 Fabric.js 或其他依赖。
- 不使用统一 10MB 自动停止线；出现无法解释的异常增长、重复运行时或明显超出功能价值的增量时，停止并向用户报告。
- 不为未来功能打包运行时。
- 实验功能依赖大型环境时，必须独立分发或暂缓。
- 只内置已确认需要的字体资源；文字水印在获得来源、许可证、校验与双平台策略之前不得假定可使用任何中文字体。
- 审计结果必须进入提交记录或构建说明，不能只留在聊天中。

## 0.9.4 自定义构图独立入口 macOS 验证包（2026-09-14）

本地验证包

- Windows NSIS：本地未构建，最终 CI 数据见下方。
- Windows 安装后：本轮未验证。
- macOS DMG：43,920,775 B（约 41.89 MiB）。
- macOS `.app`：88,264 KiB（约 86.20 MiB）。

与最近可用的 0.9.2 arm64 本地产物比较

- DMG：43,918,953 B → 43,920,775 B，增加 1,822 B。
- `.app`：88,272 KiB → 88,264 KiB，减少 8 KiB。
- 本轮没有新增 npm、Rust、sidecar、字体、模型或运行时依赖；体积变化属于现有前端与主程序代码变化，没有发现新的大型资源。

主要体积来源

1. `Contents/MacOS/ffmpeg`：35,716 KiB。
2. `Contents/MacOS/brand_material_workbench`：18,628 KiB。
3. `Contents/MacOS/ffprobe`：17,676 KiB。
4. `Contents/Resources/resources/fonts/SourceHanSansSC-Regular.otf`：16,144 KiB。
5. 其余图标、许可证、签名与 `Info.plist` 合计不足 100 KiB。

构建与签名

- 产物架构为 Mach-O arm64，版本 0.9.4。
- `.app` 使用 ad-hoc 签名；`codesign --verify --deep --strict` 通过，DMG 的 `hdiutil verify` 校验通过。
- 修复后包内 `ffmpeg` 与 `ffprobe` 均为 `0755`，并分别实际执行 `-version` 成功；两份源 sidecar 的 Git 模式记录为 `100755`，避免后续打包再次丢失执行权限。
- 本机没有 Apple Developer ID 与公证凭据，`spctl` 会拒绝该本地包；它仅用于本机验证，不是可直接对外分发的公证包。
- 仓库默认开启 updater 产物，首次构建因没有 `TAURI_SIGNING_PRIVATE_KEY` 在生成 `.app`、DMG 后返回失败；随后通过命令行临时覆盖 `createUpdaterArtifacts=false` 重新构建 `.app + .dmg` 并成功退出，未修改签名、更新或发布配置。

### 0.9.4 Preview 最终 CI 包体与验证

构建标签 `v0.9.4-preview.3`，源码提交 `dbc809151a6ccdcd3448ae581037889312e67964`。GitHub Actions run `34825106428` 的 Windows x64 与 macOS arm64 构建均成功，两端各通过 82 个测试文件 / 533 条测试。本地 `verify:core`、生产构建以及此前的 Rust 120 条测试、格式检查和 `cargo check` 均通过。

| 产物 | 大小 | 相比 0.9.3 公共包 | SHA-256 |
|---|---:|---:|---|
| Windows NSIS / updater `.exe`（同一文件内容） | 312,640,908 B（298.16 MiB） | 减少 291,685 B | `4113a641ebd12d82567c0deba2522dd5fda0599fc2081a145aeea8fece8b0513` |
| macOS arm64 DMG | 43,925,294 B（41.89 MiB） | 增加 12,108 B | `c890afc220dd1991ef30aaac9d48f0ccb28197bd44201f46f7bf9c277a1ccf85` |
| macOS arm64 updater `.tar.gz` | 45,181,869 B（43.09 MiB） | 增加 10,169 B | `fb932f8f5fa39bed36907d1133686207c0303f5ede076263a90972745d968882` |

- CI macOS `.app` 解包占用 88,276 KiB；主程序为 19,083,504 B，FFmpeg 为 36,571,296 B，FFprobe 为 18,099,872 B，三者权限均为 `0755`。
- Windows NSIS 内嵌离线 WebView2 安装器为 212,745,424 B；主程序、字体、许可证与两份 sidecar 合计 324,275,605 B。这是安装包内容审计，未在本机执行 Windows 安装，不能视作实测安装目录大小。
- 两个 Windows sidecar 从最终 NSIS 解包后的 SHA-256 与 `MEDIA_RUNTIME_SOURCES.md` 完全一致。构建下载镜像修复不升级引擎、不增加 npm/Rust 或客户端运行时依赖。
- 从 GitHub 下载的两个 updater 包均使用应用配置中的公钥和同版 `minisign-verify` 验证签名成功。CI Mac 包另外通过 `codesign --verify --deep --strict`、版本 `0.9.4`、sidecar 实际执行及 `hdiutil verify`。
- CNB 的两个 updater 包已匿名完整下载，SHA-256 分别与上述 GitHub 包一致；Range 请求均返回 `206` 且总字节数匹配。Windows 主程序 PE 文件版本为 `0.9.4.0`。
- 2026-09-14 17:35（Asia/Shanghai）确认 run `34825106428` 的 prepare、双平台 build、release、cleanup 全部成功。GitHub 与 CNB 公共 `latest-preview.json` 均为 `0.9.4`，各自包含且仅包含 `darwin-aarch64` 和 `windows-x86_64`；两个源的内联签名相同并与 `.sig` 资产匹配。CNB Windows 手动安装包也已匿名 Range 验证成功。
- macOS 仍为 ad-hoc 签名、未 Apple 公证；Windows 交互式安装与实机硬件编码仍需 Windows 实机验收，不以 CI 构建和离线签名校验替代。

## 0.1.33 Stage 5A 工具箱启动器审计（2026-07-23）

- 新增依赖：无。未新增 npm、Rust crate、sidecar、字体、模型、Vue、FFmpeg 或第二个 Tauri window。
- 前端 `dist`：1,184 KB；相对 Stage 4 记录的 1,172 KB 约 +12 KB，来自 React/TypeScript/CSS 入口和文档无关的构建文本变化。
- Windows NSIS、Windows 安装目录、macOS DMG、macOS `.app`：本阶段未生成，不能据此前端构建结果推断平台包体增量。
- 结论：无新增运行时和二进制包体风险；平台安装包的真实增量继续留待后续实机构建审计。

## 0.1.33 Stage 5B 默认启动设置审计（2026-07-23）

- 新增依赖：无。偏好模型、`localStorage` 键与设置控件均使用既有 React/TypeScript 和浏览器能力。
- 前端 `dist`：1,188 KB，较 Stage 5A 的 1,184 KB 约 +4 KB；未新增 Rust crate、sidecar、字体、模型、Vue、FFmpeg 或第二个 Tauri window。
- Windows NSIS、Windows 安装目录、macOS DMG、macOS `.app`：本阶段未生成，不能据此前端构建结果推断平台包体增量。
- 结论：无新增运行时和二进制包体风险；平台安装包的真实增量继续留待后续实机构建审计。

## 0.1.33 Stage 6B-UI Checkpoint 审计（2026-07-23）

- 新增 npm 依赖：`vue@3.5.26`、`@vitejs/plugin-vue@5.2.4`；`@vue/server-renderer@3.5.26` 仅作为开发期 Vue 渲染测试依赖。FFUI 来源为 MIT 的 `4122222415bc209c711c7c166fc78d2d6d1dc139`，只参考队列和参数 UX 结构，未复制源码，也未引入 FFUI 的 ECharts、GSAP、VueUse、虚拟列表、自动下载器或 Rust/Tauri 壳。
- 前端 `dist`：1,292 KB，较 Stage 5B 的 1,188 KB 约 +104 KB。新增可交付资源包括 `gif-media.html`、6.67 KB CSS（gzip 1.86 KB）、62.09 KB Vue 预览 JS（gzip 25.20 KB）以及按需加载的 17.77 KB Tauri WebviewWindow API JS（gzip 3.78 KB）。
- 未新增 Rust crate、FFmpeg / FFprobe、sidecar、字体、模型、第二个 Tauri app 或媒体二进制。`src-tauri/capabilities/` 仅增加主窗口创建 singleton 内部窗口所需的最小 core window/webview 权限，并为预览窗口仅授予 `core:default` 与 close。
- Windows NSIS、Windows 安装目录、macOS DMG、macOS `.app`：本阶段未生成，不能据此前端构建结果推断平台安装包增量。原生 singleton 窗口权限和关闭语义也仍待双平台实机确认。
- 结论：前端增量与隔离可视预览相称；任何 FFmpeg / FFprobe sidecar、真实队列、媒体命令或转码接入前，必须重新执行平台包体与运行时审计。

## 0.1.33 Stage 6B 后端 / Stage 6C 可见水印门禁复核（2026-07-23）

- 本轮未新增 npm、Rust crate、FFmpeg / FFprobe、sidecar、字体、模型或媒体二进制；前端 `dist` 不因这次文档复核而重新计量。
- `ffprobe-static@3.1.0` npm 解包体积约 351 MB，`ffmpeg-static-electron@2.0.3` 约 234 MB；二者均不是已验证的 macOS arm64 + Windows x64 单份成对 sidecar 注入方案。`ffmpeg-static@5.3.0` 依赖安装时下载且为 GPL-3.0-or-later，不能作为当前离线注入方案。
- 当前仓库没有可打包的中文字体资源，不能估算文字水印字体的前端、macOS 或 Windows 包体增量。
- 结论：未选择 sidecar 或字体，也未生成平台安装包；在固定来源、SHA-256、许可证、每平台资源清单和字体策略得到确认前，真实媒体后端与文字水印维持阻断。详见 `docs/STAGE_6B_BACKEND_GATE.md`。

## 0.1.33 Stage 6B 真实 GIF 后端审计（2026-07-23）

- 用户明确将本项目限定为内部本地工具，公开分发级许可证和供应链材料不再作为开发阻断；仍固定记录上游、版本、SHA-256、文件大小与修改范围。
- 新增平台 sidecar：macOS arm64 的 `ffmpeg` + `ffprobe` 合计 54,954,368 B（约 52.4 MiB）；Windows x64 合计 145,454,080 B（约 138.7 MiB）。构建时每个平台只随 `bundle.externalBin` 选择本平台的成对工具，不会将两套平台二进制同时放进同一安装包。
- 前端 `dist`：1,312 KB，较 Stage 6B-UI Checkpoint 的 1,292 KB 约 +20 KB，来自真实队列、参数、进度、错误和取消 UI；没有新增第二个前端框架或独立 Tauri app。
- macOS `.app`：本机以 `createUpdaterArtifacts=false` 构建为 71,112 KB（约 69.4 MiB），其中固定 macOS sidecar 约 52.4 MiB；已确认 bundle 内只有 `Contents/MacOS/ffmpeg` 与 `ffprobe` 两个媒体二进制。未生成 DMG、Windows NSIS 或 Windows 安装目录，不能据此宣称跨平台安装包增量。
- 资源文件、SHA-256、来源与运行时单份约束见 `docs/MEDIA_RUNTIME_SOURCES.md`。Stage 6C 的中文字体包体单独记录，不混入本阶段。

## 0.1.32 Fabric.js 接入审计（2026-07-22）

### 当前基线与增量

- Windows NSIS：本机没有可比较的 0.1.32 构建产物，待 Windows 实机构建后补录。
- Windows 安装后：本机无法验证，待 Windows 实机安装后补录。
- macOS DMG：仅发现历史 `0.1.19` DMG，3.3 MB；不可与 0.1.32 比较，不能作为发布结论。
- macOS `.app`：仅发现历史 `0.1.19` `.app`，17.0 MB；主占用为 17.0 MB Rust 主二进制，不能作为发布结论。
- 前端 `dist`（可复现基线）：Fabric 接入前 856 KB，接入后 1,140 KB，增加约 284 KB。
- 新增动态前端 chunk：Fabric 交互层约 282.9 KB（gzip 88.8 KB）。主应用 JS 从约 296.6 KB 到 302.3 KB，约增加 5.7 KB。

### 依赖审计

- 新增 `fabric@7.4.0`，MIT 许可证，本地 npm 依赖；不使用 CDN、远程 API、sidecar 或额外运行时。
- Fabric 仅在自定义构图加载后动态导入，负责透明命中框、选中、拖动和四角等比缩放；不参与正式渲染或导出。
- `npm audit --omit=dev` 报告的 Vite/esbuild 开发服务器问题为已有依赖链问题，Fabric 依赖链未出现单独审计项；本轮不顺带升级 Vite 主版本。

### 结论

- 已验证的前端增量远低于 10 MB 门槛。
- 正式 macOS/Windows 安装包与安装后目录增量仍待发布前平台构建和实机审计；在完成前不得以本段作为发行包体结论。

## 0.1.33 UI 规则统一审计（2026-07-23）

- 前端 `dist`：1,140 KB → 1,172 KB，约 +32 KB；本阶段仅变更 CSS、现有 React 文案和静态测试，构建输出显示主 JS 约 315 KB、CSS 约 55 KB。
- 未新增 npm、Rust、sidecar、字体、模型或二进制依赖；未生成新的 Windows NSIS、macOS DMG 或 `.app`，因此不能据此推断平台安装包增量。
- 结论：前端增量与 UI 规则统一相称；双平台安装包、安装目录与高 DPI WebView 的实际影响继续留待后续平台构建审计。

## 0.1.33 Focus Logo Fabric 审计（2026-07-23）

- 未新增第三方依赖或额外 Fabric runtime；复用现有本地 `fabric@7.4.0` 的动态导入与同一控制点主题。
- 前端主 JS 从 UI 规则统一后的约 315 KB 变为约 320 KB（gzip 约 100 KB → 102 KB）；增量为 Focus Logo 的交互适配和测试所需代码，未打包第二份 Fabric chunk。
- 未生成新的 Windows NSIS、macOS DMG 或 `.app`；平台安装包与安装后目录增量仍需在后续平台构建中记录。

## 2026-10 图片压缩（单图）前端编码器接入

本轮只新增前端编码器依赖，Rust、sidecar、字体、模型与运行时均未变化。

前端构建产物（`npm run build` 实测）

- `dist`：25 文件 / 1,679,093 B → 32 文件 / 2,466,007 B，增加 **786,914 B**。
- 新增 wasm：mozjpeg 269,882 B、webp 281,261 B、oxipng 164,172 B，合计 715,315 B；与 codec 胶水里的 wasm 引用共用同一份 hashed 资源，构建产物中每个 wasm 只有一份。
- 新增 worker 脚本：45,819 B；新增图片压缩 CSS：5,975 B；组件与入口 JS 约 16 KB。
- 新增许可证资源 4 份，合计约 19 KB（`src-tauri/resources/licenses/`）。

依赖占用（`node_modules`，构建期）

- `@jsquash`：2.1 MB。
- `wasm-feature-detect`：48 KB（`@jsquash/webp`、`@jsquash/oxipng` 的传递依赖，本仓库改用显式 wasm 注入，未打进前端产物）。

安装包增量

- Windows NSIS：本地未构建，待实测。
- Windows 安装后目录：本轮未验证。
- macOS DMG / `.app`：本轮未构建，待打包机实测；预期增量接近前端 +787 KB 与约 19 KB 许可证文本。
- 本轮不包含图片素材或模型权重，未发现重复运行时或未使用资源被打包。

### 2026-10-19 GIF 预览修正（无新增依赖）

- 前端 `dist`：2,466,007 B / 32 文件 → 2,472,751 B / 32 文件，增加 **6,744 B**（仅 `GifTool.vue` / `gifTool.css` / 新 `assetUrl.ts` 与模板的小改动），没有新增 npm、Rust、sidecar、字体或模型依赖。
- Rust 侧只增加 `asset_protocol_scope().allow_file()` 的运行时调用，二进制增量未单独测量（属既有依赖内的代码变化）；安装包增量待打包实测。

### 2026-10-19 图片压缩 + GIF 预览修正 macOS 测试包（含两个新入口）

| 项 | 实测 |
| --- | --- |
| macOS DMG | 44,186,461 B（42.14 MiB）；比上一版 GIF 测试包 +271,402 B |
| macOS `.app` | 88,628 KiB（86.55 MiB）；比上一版 +272 KiB |
| 主程序二进制 | 19,446,432 B |
| 新增前端资源 | 32 个 dist 文件名全部内嵌进主程序（含 `codecs.worker-*.js`、3 个 wasm，共 715,315 B 原始字节）；无独立前端目录 |
| 许可证资源 | `Contents/Resources/resources/licenses/` 内新增 4 份 codec 许可证文本（约 19 KB） |
| Windows NSIS | 本地未构建，未实测 |
| Windows 安装后目录 | 未验证 |

- 体积增量与前端 `dist` 增量（图片压缩 +786,914 B、GIF 预览 +6,744 B）量级一致，未发现异常膨胀或重复资源；wasm 在包内是压缩内嵌，不是独立文件。
- 构建命令：`npx tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'`（仅本次禁用 updater 产物，未改配置）。
- 签名：ad-hoc（`codesign --verify --deep --strict` 通过）；未公证；`hdiutil verify` 通过。

## 2026-10-19 GIF 单页工作区复核测试包

DMG 44,218,664 B（42.17 MiB），较上一份交互修正与拖动预览包 +74,570 B；`.app` 88,736 KiB，主程序 19,557,920 B；前端 33 文件 / 2,491,372 B，全部资源文件名内嵌主程序。复用既有媒体 sidecar，无新增依赖。构建仅临时关闭 updater 产物；签名与 DMG 完整性通过，ad-hoc 未公证。Windows 包体及窗口内功能未验证。详见 CHANGELOG 同日独立复核条目。

## 2026-10-19 0.9.5 签名候选包

CI 39274314082 生成：Windows NSIS 314,404,210 B（较 0.9.4 的 312,640,908 B 增加 1,763,302 B）；Mac DMG 44,280,635 B（较 0.9.4 的 43,925,294 B 增加 355,341 B），Mac updater tar.gz 45,536,262 B。两端 updater 公钥签名校验通过，Mac codesign/DMG 完整性通过。无新增运行时依赖；Windows 增量未见异常。安装包与 SHA256SUMS-0.9.5.txt 留在 artifacts/local-packages/2026-10-19，不提交 Git。当前因 Mac 锁屏缺实际升级安装/重启证据，未切换公共更新；Windows 实机交互未验证。

## 2026-10-20 0.9.6 已发布签名包

Windows NSIS/updater 均为 314,409,080 B，较 0.9.5 候选 +4,870 B；Mac DMG 44,281,669 B（+1,034 B），Mac updater 45,536,547 B。两端既有公钥验签通过，Mac DMG 完整性与安装后 codesign 通过。Mac 包内版本 0.9.6、两份媒体 sidecar 与四份 codec 许可证齐全。GitHub 两处发行资产服务端大小/摘要匹配；GitHub/CNB 清单 0.9.6 与匿名 Range 读取均通过。安装包和 SHA256SUMS-0.9.6.txt 保存在 artifacts/local-packages/2026-10-20/，不进入 Git 历史。Windows 实机验收未完成。
