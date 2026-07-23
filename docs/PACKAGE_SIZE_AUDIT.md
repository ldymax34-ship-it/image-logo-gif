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
- 只内置已确认需要的字体资源；当前水印字体边界为思源黑体 Regular。
- 审计结果必须进入提交记录或构建说明，不能只留在聊天中。

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
