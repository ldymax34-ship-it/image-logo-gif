# 第三方声明

## Stage 6B-UI Checkpoint

### FFUI

- 来源：`muyuanjin/ffui`
- 固定提交：`4122222415bc209c711c7c166fc78d2d6d1dc139`
- 许可证：MIT，Copyright (c) 2025 muyuanjin
- 本检查点参考的来源文件：`src/components/panels/QueuePanel.vue`、`src/components/QueueItem.vue`、`src/composables/useDragAndDrop.ts`、`src/types/queue.ts`。
- 使用范围：仅借鉴队列空状态、参数分区、状态图例和拖入区的产品结构与交互语义；本仓库未复制 FFUI 源码，不引入其 Tauri/Rust 壳、自动下载器、ECharts、GSAP、VueUse、虚拟列表或队列执行代码。

### Vue

- `vue@3.5.26`：MIT；用于独立 `gif-media.html` 的隔离可视预览运行时。
- `@vitejs/plugin-vue@5.2.4`：MIT；仅用于当前 Vite 多页面构建。
- `@vue/server-renderer@3.5.26`：MIT；仅用于 Vue 预览组件的开发期渲染测试，不进入生产运行时入口。

### Stage 6B 媒体 sidecar

- `@ffmpeg-installer/darwin-arm64@4.1.5`、`@ffprobe-installer/darwin-arm64@5.0.1`
- Windows x64：`BtbN/FFmpeg-Builds` 固定发布 `autobuild-2026-08-23-13-03` 的 `ffmpeg-n9.0.1-6-g9d4ca21220-win64-gpl-9.0.zip`，压缩包 SHA-256 `2f388916565c44f6edcdddd7b01ccc73a2bbc7f107bd615b7247e9c9773f4a09`。
- Windows FFmpeg 构建启用 GPL 组件，按 GPLv3 分发；许可证原文随应用放在 `resources/licenses/FFmpeg-GPL-3.0.txt`。上游源码与构建配置：`https://github.com/BtbN/FFmpeg-Builds`。
- 使用范围：当前 Tauri app 内唯一的 MP4/MOV → GIF 运行时。仅从 bundle resource directory 启动，不探测 PATH、不联网下载、不启动第二个 Tauri app。
- 固定上游标识、SHA-256、文件大小、平台打包路径与维护说明见 `docs/MEDIA_RUNTIME_SOURCES.md`。

## 图片压缩（单图）前端编码器

- `@jsquash/jpeg@1.3.0`、`@jsquash/webp@1.5.0`、`@jsquash/oxipng@2.3.0`
- 来源：`https://github.com/jamsinclair/jSquash`，由 Squoosh codec 派生的预编译发布；上游为 `GoogleChromeLabs/squoosh` 固定提交 `e8d35e0fb66e`。
- 许可证：包本身 Apache-2.0；随包附带底层 codec 许可证原文：
  - MozJPEG / libjpeg-turbo：IJG License + Modified BSD（`resources/licenses/mozjpeg-IJG-BSD.txt`）。
  - libwebp：BSD-3-Clause（`resources/licenses/libwebp-BSD-3-Clause.txt`）。
  - oxipng：MIT（`resources/licenses/oxipng-MIT.txt`）。
  - `@jsquash` 包许可证：Apache-2.0（`resources/licenses/JSquash-Apache-2.0.txt`）。
- 使用范围：仅在 `src/image-tool/` 的 Web Worker 内本地编码 JPEG / WebP / PNG；不包含 Squoosh 的 Web 应用壳、Google Analytics、AVIF / JXL / 视觉对比等未采用模块，也不发起任何外部请求。
