# 媒体运行时来源（内部工具）

本文件记录 0.1.33 Stage 6B 采用的固定媒体 sidecar。项目是公司内部、本地运行工具；本记录用于维护和复核，不构成公开发布材料。

## 运行时规则

- 每个目标平台只随 Tauri bundle 带一份 `ffmpeg` 和一份 `ffprobe`。
- `src-tauri/tauri.conf.json` 用 `bundle.externalBin` 按 target triple 选取资源；运行时只通过 `AppHandle::path().resource_dir()` 解析 `ffmpeg` / `ffprobe`。
- 不搜索系统 PATH、不读取环境变量覆盖、不联网下载、不复制 FFUI 的 Rust 后端或下载器。
- 任务使用 `Command::args` 传入结构化参数，进度来自 `-progress pipe:1`，取消直接终止当前子进程；输出始终以新 GIF 名称写入选定目录。

## Sidecar 清单

| 目标 | 文件 | 上游包 / 固定版本 | 上游标识 | SHA-256 | 文件大小 |
|---|---|---|---|---|---:|
| macOS arm64 | `ffmpeg-aarch64-apple-darwin` | `@ffmpeg-installer/darwin-arm64@4.1.5` | FFmpeg `4.4`，`92718-g092cb17983` | `a2ad6f0fc42a3c8f5183ef1d53e906d6bb35478d14a6b67175c30ce6c17e9214` | 36,766,920 B |
| macOS arm64 | `ffprobe-aarch64-apple-darwin` | `@ffprobe-installer/darwin-arm64@5.0.1` | FFprobe `n4.4.1` | `c846d5db9d3b5bc33f987725e21f3ea14953931221c191575918e907ad6c18ff` | 18,187,448 B |
| Windows x64 | `ffmpeg-x86_64-pc-windows-msvc.exe` | `@ffmpeg-installer/win32-x64@4.1.0` | FFmpeg `20181217-f22fcd4` | `c8abc49e7be62dde8e12972af373959e0076a7b8dc8040eb45978e0608f8781e` | 64,458,752 B |
| Windows x64 | `ffprobe-x86_64-pc-windows-msvc.exe` | `@ffprobe-installer/win32-x64@5.1.0` | FFprobe `20230213-2296078` | `f28c4751e7367205267025aaf0fcfc921e34d9b7edaa46bd9c8abaf367fc9051` | 80,995,328 B |

上游包元数据与二进制版本在 2026-07-23 下载后复核；本仓库未保留临时 npm 包或下载器。后续替换必须同时更新本表、SHA-256、Tauri 包体审计及 macOS/Windows 实机回归。

## FFUI 前端适配

- 参考源：`muyuanjin/ffui`，固定提交 `4122222415bc209c711c7c166fc78d2d6d1dc139`，MIT。
- 仍只借鉴队列、空状态、参数分区、进度、取消、错误与结果的 Vue UX 结构；没有复制其源码、Rust/Tauri 壳、PATH 探测、自动下载、更新器或下载器。
- 当前仓库的 Vue 入口、队列状态和 Tauri IPC 均为最小适配，和 React Logo / 版式状态完全隔离。

## 验收边界

- macOS arm64：已在本机使用仓库内 sidecar 真实验证 MP4/MOV → GIF、中文+空格路径、输出 GIF 元数据、两任务顺序、运行中终止、失败后继续和输入文件不覆盖。
- Windows x64：已验证随包文件为 PE32+ x86-64，Tauri `externalBin` target-triple 命名正确；尚未完成 Windows 原生构建或交互式实机任务，不能宣称 Windows 实机通过。
