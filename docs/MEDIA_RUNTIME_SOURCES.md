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
| Windows x64 | `ffmpeg-x86_64-pc-windows-msvc.exe` | `BtbN/FFmpeg-Builds` `autobuild-2026-08-23-13-03` | FFmpeg `n9.0.1-6-g9d4ca21220` | `e3a2512b56eebc3b2b8c9e435ceb0fa055e003eee075d8a960a16ddfe9e0c933` | 144,862,208 B |
| Windows x64 | `ffprobe-x86_64-pc-windows-msvc.exe` | `BtbN/FFmpeg-Builds` `autobuild-2026-08-23-13-03` | FFprobe `n9.0.1-6-g9d4ca21220` | `5aa91156c5bc7e06b5682fc2a9ae2c52f52681ba8d951c207746739199e68d46` | 144,658,432 B |

Windows 压缩包于 2026-08-24 从 `BtbN/FFmpeg-Builds` 固定 GitHub Release `autobuild-2026-08-23-13-03` 下载；资产 `ffmpeg-n9.0.1-6-g9d4ca21220-win64-gpl-9.0.zip` 的 SHA-256 为 `2f388916565c44f6edcdddd7b01ccc73a2bbc7f107bd615b7247e9c9773f4a09`。二进制配置已复核包含 `--enable-gpl`、`--enable-ffnvcodec`、`--enable-amf`、`--enable-libvpl` 和 `--enable-libx264`，未包含 `--enable-nonfree`。Windows CI 在构建前运行 `scripts/install-windows-ffmpeg.ps1`，对压缩包和两个二进制分别校验 SHA-256 后注入 Tauri sidecar，避免 GitHub 普通 Git 的 100 MB 单文件限制。GPLv3 许可证文本随应用打包为 `resources/licenses/FFmpeg-GPL-3.0.txt`。

### 0.9.4 构建下载源修复（2026-09-14）

- 上游 README 的 Release Retention Policy 仅保留最近 14 份 daily build（每月最后一份另行保留）；上述 2026-08-23 下载地址现已返回 HTTP 404，导致首轮 0.9.4 Windows CI 在下载阶段失败。
- 将本机已审计的两份 sidecar 按上表 SHA-256 复核后原样重新压缩，附 GPL-3.0 许可证与来源说明，保存到既有二进制仓库的固定 `windows-ffmpeg-n9.0.1` Release。该归档是只含 sidecar 的重打包，不冒充原上游 ZIP。
- 固定资产：`https://github.com/ldymax34-ship-it/ldymax34-ship-it-brand-material-workbench-releases/releases/download/windows-ffmpeg-n9.0.1/ffmpeg-n9.0.1-6-g9d4ca21220-win64-gpl-9.0-sidecars.zip`。
- 新归档大小为 110,716,032 B，SHA-256 为 `7e8e99d2c548fa2a8ab54f3b0cdd43c99b7e3524d152059cd9029165382e503a`；两个解压后二进制的版本、大小和 SHA-256 均保持不变。
- 仅构建脚本的下载地址、归档名与归档哈希改变；仍校验归档和两个二进制，不使用浮动 `latest`，不新增客户端运行时下载。
- 方案来源：`https://github.com/BtbN/FFmpeg-Builds#release-retention-policy` 与 GitHub CLI 原生 Release 资产上传能力。

上游包元数据与二进制版本已复核；本仓库未保留临时压缩包或下载器。后续替换必须同时更新本表、SHA-256、Tauri 包体审计及 macOS/Windows 实机回归。

## FFUI 前端适配

- 参考源：`muyuanjin/ffui`，固定提交 `4122222415bc209c711c7c166fc78d2d6d1dc139`，MIT。
- 仍只借鉴队列、空状态、参数分区、进度、取消、错误与结果的 Vue UX 结构；没有复制其源码、Rust/Tauri 壳、PATH 探测、自动下载、更新器或下载器。
- 当前仓库的 Vue 入口、队列状态和 Tauri IPC 均为最小适配，和 React Logo / 版式状态完全隔离。

## 验收边界

- macOS arm64：已在本机使用仓库内 sidecar 真实验证 MP4/MOV → GIF、中文+空格路径、输出 GIF 元数据、两任务顺序、运行中终止、失败后继续和输入文件不覆盖。
- Windows x64：已验证随包文件为 PE32+ x86-64，Tauri `externalBin` target-triple 命名正确；尚未完成 Windows 原生构建或交互式实机任务，不能宣称 Windows 实机通过。


## 字体资源

| 文件 | 字体 | 版本/来源 | 许可证 | SHA-256 | 文件大小 |
|---|---|---|---|---:|
| `resources/fonts/SourceHanSansSC-Regular.otf` | 思源黑体 Regular | Adobe Source Han Sans 2.005R | SIL OFL 1.1 | `f1d8611151880c6c336aabeac4640ef434fa13cbfbf1ffe82d0a71b2a5637256` | 16,529,832 B |

字体只通过固定文件名/路径在 `watermark_font_path()` 中解析：Tauri 将其打包在 `bundle.resources`，运行时代码从 `app.path().resource_dir().join("resources/fonts/SourceHanSansSC-Regular.otf")` 加载；不搜索系统字体目录、不依赖 PATH 或联网下载。
