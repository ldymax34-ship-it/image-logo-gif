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

本检查点未加入 FFmpeg / FFprobe、sidecar、媒体二进制、第二个 Tauri app 或联网下载器。后续任何正式 PoC 或分发前，须复核许可证文本、归属和实际打包清单。
