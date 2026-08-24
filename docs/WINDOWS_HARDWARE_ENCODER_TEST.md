# Windows 硬件编码测试

## 目标

确认测试包能正确识别 NVIDIA NVENC、AMD AMF 或 Intel QSV，并在硬件后端失败时只回退到 CPU，不把素材、路径、滤镜或磁盘错误当成显卡错误。

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

## 应用内验收

1. 启动应用，进入视频水印，确认界面显示具体后端，例如 `NVENC`，而不是笼统的“硬件编码”。
2. 导入 `哀莫cg0821_lo_r.mp4`（6 分 38 秒，2340×1080，30 fps），使用上次失败时相同的水印、质量和输出目录。
3. 开始导出，确认进度持续前进，不长时停留在 99%，且队列中的其他任务不会被自动取消。
4. 导出后使用“打开输出文件夹”，播放完整视频，确认时长、声音、画面和水印都正常。
5. 记录导出总用时、界面显示的编码后端，以及 Windows 任务管理器“GPU → Video Encode”是否有负载。

## 通过标准

- N 卡机器首选 NVENC；A 卡机器可选 AMF；Intel 核显机器可选 QSV。
- 可用后端导出成功，输出可被 `ffprobe` 读取。
- 硬件不可用时可回退 CPU，界面保留具体原因。
- 不得再出现无原因的“硬件编码不支持”或 `signal 15` 作为唯一错误信息。
