# FFmpeg GUI 候选审计（Stage 5）

日期：2026-07-23
结论（历史记录）：**在当时审计条件下，没有可在当前仓库中安全嵌入的成熟候选；停止旧 Stage 5 正式接入。**

> 2026-07-23 更新：本文件保留为旧路线源码审计。后续媒体工作的执行口径已由 `docs/STAGE_6A_GIF_MEDIA_POC_PLAN.md` 取代；Stage 6B 是否开始仍须用户明确批准。本记录不授权实现，也不单独否决后续按新门禁进行的隔离 PoC。

## 固定边界

- 当前产品是 React 18 + Tauri 2，已有自己的 Rust 壳、更新协议与模块导航。
- 候选必须复用成熟 GUI 的文件队列、预设、进度、取消、错误和结果 UX；不能把其行为重新手写成一套新媒体工具。
- 运行时只允许一份随包分发、离线可用的 FFmpeg sidecar；不允许首次使用下载二进制、额外独立软件、Python、WASM 或第二套媒体运行时。
- 必须能覆盖 MP4/MOV、GIF 输出、起止时间、尺寸、帧率、循环、调色板/质量、批量、取消、中文/空格路径和 Windows x64/macOS arm64。

## 候选与结果

| 候选 | 审计版本 | 可用部分 | 阻断原因 | 结论 |
|---|---|---|---|---|
| [`bennypepper/FFmpeg-UI`](https://github.com/bennypepper/FFmpeg-UI) | `16daf6b3260c180e364e0b526d908eef97fb479d`（2026-04-26） | MIT；React；Tauri 2；`ffmpeg-sidecar`；媒体队列；GIF、帧率、尺寸、循环等命令模型 | 独立 desktop app 采用 React 19/workspace；默认 `ffmpeg-sidecar::download::auto_download()`；desktop `cancel_job` 当前为空实现；desktop 测试目录为空。引入其 UI/后端会带入第二套应用壳、依赖与下载模型，修正取消则变成接管其核心实现。 | 不采用 |
| [`muyuanjin/ffui`](https://github.com/muyuanjin/ffui) | `4122222415bc209c711c7c166fc78d2d6d1dc139`（2026-05-22） | MIT；Tauri 2；成熟队列、暂停/取消/恢复、进度、预设与跨平台 workflow；Rust 核心测试较完整 | 完整 Vue 3 + 独立 Rust/Tauri 运行时，并携带 Vue/ECharts/GSAP 等独立 UI 栈；工具解析会从 PATH 或自动下载 FFmpeg/ffprobe。嵌入当前 React 产品将引入第二套应用内核，剥离/移植其队列又等于重写核心。 | 不采用 |
| [`puzzithinker/ffmpeg-gui`](https://github.com/puzzithinker/ffmpeg-gui) | `803bd426440d88d44bfe28aeefafa7f610bf0860`（2026-07-17） | React 18 + Tauri；单任务处理、实时进度、进程取消；有 Rust/React 定向测试 | 使用系统 PATH 的 FFmpeg/ffprobe，不提供单一随包 sidecar；功能是单视频裁切/字幕，未提供 GIF 输出或可复用的批量队列；根目录缺少实际 `LICENSE` 文件，只有 package 元数据声明 MIT，分发许可不能据此确认。 | 不采用 |

## 已核对的源码事实

### FFmpeg-UI

- `apps/desktop/src-tauri/Cargo.toml` 依赖 `ffmpeg-sidecar`；README 明确首次启动可自动下载二进制。
- `apps/desktop/src-tauri/src/commands.rs` 的 `download_ffmpeg()` 调用 `ffmpeg_sidecar::download::auto_download()`；`cancel_job()` 仅返回 `Ok(())`，没有终止子进程。
- `packages/core` 支持 `gif` 模式和帧率；`packages/ui` 有队列和设置表面，但实际可用的 desktop 取消是门禁项，不能以 UI 文案代替。

### FFUI

- README 和 `src-tauri/src/commands/queue.rs` 表明存在成熟的队列、取消、暂停、恢复和持久化机制。
- `package.json` 使用 Vue 3、ECharts、GSAP、Vue UI 库；`src-tauri/Cargo.toml` 与当前应用的 Rust 壳完全独立。
- `ffui_core/tools/download` 明确提供 FFmpeg/FFprobe 的自动下载、网络请求和自定义路径解析；与本项目“单一内置 sidecar、首次使用不联网”的规则冲突。

### FFmpeg GUI - Tauri Edition

- README 声明必须使用系统 PATH 的 FFmpeg/FFprobe；与随包 sidecar 目标不符。
- README 和源码范围为裁切、字幕和单任务处理，未提供 GIF 输出、调色板/质量控制、批量队列或可嵌入的结果页。
- 根目录没有 `LICENSE` 文件，不能只依据 `package.json` 的 `license: MIT` 完成第三方分发声明。

## 停止理由与下一步条件

本阶段没有进行 PoC、没有增加 FFmpeg 依赖、没有改 Tauri 配置，也没有创建 GIF/媒体模块。继续实现将不可避免地落入以下任一禁止路径：

1. 把候选的队列/进度/取消逻辑在当前项目重写；
2. 导入 Vue 或第二套 React/Tauri 应用内核；
3. 接受首次运行自动下载、系统 PATH、Python 或 WASM 运行时；
4. 以未实现或未验证的取消逻辑承诺媒体任务安全性。

后续是否进行隔离 PoC，按 `docs/STAGE_6A_GIF_MEDIA_POC_PLAN.md` 的用户批准、许可证、唯一 sidecar、队列/取消、双平台、离线和包体门禁决定；本历史审计不单独授权或阻断 Stage 6B。
