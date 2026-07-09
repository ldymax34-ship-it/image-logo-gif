# 一站式渠道素材辅助工具

纯离线本地工具，不联网、不调 API、不依赖 CDN。所有第三方库在 `assets/vendor/` 下。

## 页面

| 文件 | 功能 |
|------|------|
| `photo1.html` | 批量修改图片尺寸（Logo/水印排版、改色、裁切、压缩） |
| `video1.html` | 视频转 GIF 压缩（帧率选择、实时大小预估、ffmpeg.wasm 转码） |
| `test.html`   | 图片尺寸核对 |
| `suggest.html` | 本机使用回顾（统计与导出） |

## 离线硬约束

详见 `AGENTS.md`。核心规则：

- 禁止任何外部 URL / CDN / 远程 API
- 禁止 fetch / XHR / WebSocket / sendBeacon（`file://` 本地 fetch bridge 除外）
- 所有依赖必须本地引用 `assets/vendor/*`
- CSP 保持 `connect-src 'none'` 等离线策略
- 不得破坏现有离线功能

## 目录结构

```
├── assets/
│   ├── vendor/          # ffmpeg.wasm, jszip, lucide, tailwind, xlsx, html2canvas
│   ├── builtin-logos/   # 内置 Logo 数据
│   ├── ziti/            # 内置字体库
│   └── usage-tracker.js
├── photo1.html
├── video1.html
├── test.html
├── suggest.html
├── AGENTS.md            # 角色规则
├── TASKS.md             # 任务看板
├── CHANGELOG.md         # 改动流水
└── README.md            # 本文件
```

## 开发

用本地 HTTP server 打开（`file://` 下 ffmpeg.wasm 的 SAB 可能不可用）：

```bash
cd 渠道素材辅助工具-0.6.7
python3 -m http.server 8765
# 浏览器打开 http://localhost:8765/photo1.html
```
