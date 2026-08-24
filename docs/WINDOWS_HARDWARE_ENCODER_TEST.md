# Windows 视频水印与硬件编码测试

## 目标

确认 Windows 测试包能静默完成首次环境检测，正确识别 NVIDIA NVENC、AMD AMF 或 Intel QSV，并验证新的单层水印合成、三种文字样式与完整导出链路。

## 测试素材

- 安装包：`BrandMaterialWorkbench_0.9.2_windows-x64_watermark-test.exe`
- 真实视频：`哀莫cg0821_lo_r.mp4`（6 分 38 秒，2340×1080，30 fps）
- 可选脚本：`windows-hardware-encoder-smoke.ps1`

## 1. 首次启动与静默检测

1. 如已安装旧测试版，先正常卸载，再安装新包。
2. 首次启动应只看到应用内的「正在检查本机环境」Loading 页。
3. 检查启动和检测期间是否出现 CMD、PowerShell、FFmpeg 或 FFprobe 黑窗/弹窗。
4. 检测成功后应自动进入工具箱；关闭并再次启动，不应重复显示 Loading 页。
5. 在「设置 → 重新检测」中手动启动一次检测，确认当前工具内容不会被清空。

## 2. 文字水印样式

1. 进入「视频水印」并导入测试视频。
2. 依次选择「白色」、「黑色」、「描边」，确认预览立即变化。
3. 「描边」应为白色填充＋黑色边线，不应出现空心、错位或字体异常。
4. 每种样式至少导出一段短测试，确认输出与预览一致。

## 3. 密集水印性能

1. 使用默认「密集」平铺、硬件优先和高质量开始完整导出。
2. 记录导出用时、界面显示的编码后端和任务管理器的 GPU Video Encode 占用。
3. 新版会先生成一张完整透明水印层，视频每帧只叠加一次；导出速度应明显优于上一版约 31 层 overlay 的实现。
4. 确认进度持续前进，不长时停留在 99%，全程不出现控制台窗口。
5. 完成后使用「在文件夹中显示」，播放完整输出，检查时长、声音、画面和水印。

## 自动 smoke test

1. 找到安装目录中随应用分发的 `ffmpeg.exe` 和 `ffprobe.exe`。
2. 在 PowerShell 执行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\windows-hardware-encoder-smoke.ps1 `
  -FfmpegPath "C:\path\to\ffmpeg.exe" `
  -FfprobePath "C:\path\to\ffprobe.exe" `
  -InputPath "C:\path\to\哀莫cg0821_lo_r.mp4"
```

脚本会分别对 `h264_nvenc`、`h264_amf`、`h264_qsv` 执行 `1280x720 / 30 fps / 120 帧` 真实编码，保存驱动信息、FFmpeg 构建信息、完整 stderr 和 `ffprobe` 结果。如果某个后端可用，再对真实素材执行 30 秒带可见水印滤镜的转码。

## 通过标准

- 首启只显示一次应用内检测页，无外部命令行弹窗。
- N 卡机器首选 NVENC；A 卡机器可选 AMF；Intel 核显机器可选 QSV。
- 可用后端导出成功，输出可被 `ffprobe` 读取。
- 硬件不可用时可回退 CPU，界面保留具体原因。
- 白色、黑色、描边三种文字样式的预览与输出一致。
- 密集水印完整导出无黑窗、无 99% 卡死、无 `signal 15`。
- 不得再出现无原因的“硬件编码不支持”或 `signal 15` 作为唯一错误信息。
