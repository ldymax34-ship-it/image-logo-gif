# Stage 6B / 6C：真实媒体后端与可见水印门禁

日期：2026-07-23

## 历史结论与新决策

2026-07-23 用户新决策已覆盖本文件原先的“未来公开分发/完整许可证材料/统一公开供应链”阻断口径：本项目是公司内部本地工具，不公开、不售卖、不向组织外分发。许可证与公开分发材料不再阻止 Stage 6B 开发；只保留上游来源、固定版本、SHA-256 和必要修改记录。

原阻断结论保留为当时现场事实，**不再适用于当前内部开发路线**。当前 Stage 6B 的实际来源、二进制、哈希、运行时约束和验证边界见 `docs/MEDIA_RUNTIME_SOURCES.md`。

原记录中的公开分发和完整许可材料要求已解除；保留不变的硬条件是双平台固定 sidecar、无 PATH、无运行时下载、真实进度/取消、绝不覆盖原文件和不伪造结果。

本文件不再表示当前实现状态；Stage 6B 的代码和验证结果由 `TASKS.md`、`CHANGELOG.md` 与 `docs/MEDIA_RUNTIME_SOURCES.md` 记录。Stage 6C 的中文字体记录将在其独立阶段提交中补充。

## 已复核事实

### FFUI 只能作为前端 UX 参考，不能原样复用其工具层

- 审计固定提交：`muyuanjin/ffui` 的 `4122222415bc209c711c7c166fc78d2d6d1dc139`，MIT，已记录在 `THIRD_PARTY_NOTICES.md`。
- `/private/tmp/ffmpeg-gui-audit.ih0jW9/ffui/src-tauri/src/commands/tools.rs` 导入 `force_download_tool_binary`，并提供 `get_external_tool_candidates` 与 `download_external_tool_now`。后者实际调用自动下载逻辑；其候选语义也包含系统 PATH 与下载得到的二进制。
- 这与“唯一 bundled sidecar、无 PATH、无首次联网下载、无第二个 Tauri app”的要求冲突。直接带入该 Rust 工具层会违反边界；为满足边界而重写其执行、取消和结果核心又超出“复用成熟 UX、不从零重写”的允许范围。

### 当前仓库与开发机没有可用的替代物

- 当前仓库的 `public/` 与 `src-tauri/` 没有 `.ttf`、`.otf`、`.ttc`、`.woff` 或 `.woff2` 字体资源；本机没有可用的 `ffmpeg` 或 `ffprobe` 命令。
- 当前 Tauri 配置没有 sidecar 或媒体二进制打包声明。本次未依赖 PATH，也未把临时二进制加入仓库。
- `ffmpeg-static@5.3.0` 为 GPL-3.0-or-later，且 `install` 脚本会下载二进制；不能作为离线、可审计的分发注入方案。
- `ffprobe-static@3.1.0` 的 npm 解包体积约 351 MB；`ffmpeg-static-electron@2.0.3` 约 234 MB 且发行较旧。二者都不是已验证的 macOS arm64 + Windows x64 成对、单份注入方案。
- BtbN 的最新发布提供 Windows/Linux 资产，没有 macOS arm64 资产；不能单独承担双平台来源责任。

## 对 Stage 6C 的影响

可见水印必须复用已通过的真实队列和同一份 sidecar，因此 Stage 6B 被阻断时不能先行接入。尤其是文字水印必须先固定可分发的中文字体：来源、许可证、文件校验值、macOS/Windows 字体路径或打包策略均须可审计。不能退化为系统字体、PATH 字体、在线字体、乱码文字或未验证的替代实现。

图片 Logo 水印也不单独实施，以避免在没有统一任务、取消、结果和“永不覆盖原文件”保障的情况下形成第二套水印路径。隐形指纹仍未实现。

## 重新开启的前置条件

以下条件须全部具备，才可开始新的 Stage 6B 后端实现：

1. 用户认可一套固定的 `ffmpeg` + `ffprobe` 成对来源，覆盖 macOS arm64 与 Windows x64，并明确版本、许可证/归属、下载地址、SHA-256、发布保留策略、维护与更新责任。
2. 该资源能由可审计构建脚本注入当前 Tauri app；运行时不探测 PATH、不下载、不要求额外安装，并且每个平台只打包一份对应 sidecar。
3. 在不重写 FFUI 队列/取消/错误/结果 UX 的前提下，明确最小适配边界和真实进程终止策略；否则停止而不是把核心能力伪装成“现成复用”。
4. 获得可分发的中文字体或等价离线跨平台文字渲染方案，明确许可、字体文件校验、包体增量及 `drawtext` 的 macOS/Windows 路径策略。
5. 先完成 sidecar 与字体的真实包体审计，再用受控 MP4、MOV、GIF 与中文空格路径完成 macOS 实机任务；Windows 需至少有构建/CI 与后续交互式实机计划。通过前不得把实验预览标为可处理。

## 不做项

- 不用系统 PATH、首次联网下载、临时二进制或第二个 Tauri app 绕过门禁。
- 不实现假进度、假结果、假取消或 shell 字符串拼接。
- 不修改 Logo / 版式 Render Plan、静态导出、同步、Fabric、更新或发布链路。
- 不生成 Preview 安装包、不发布、不推送。
