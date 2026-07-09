# 品宣物料工作台

本仓库原为「一站式渠道素材辅助工具」，现转向为「品宣物料工作台」。

目标是做一个纯本地运行的设计生产工具，用于品宣 / 市场平面物料的批量适配、裁切、导出和复核。

## 当前状态

仓库仍保留旧页面：

| 文件 | 当前定位 |
|------|----------|
| `photo1.html` | legacy 图片批量处理页，后续只做必要修复 |
| `video1.html` | legacy 视频转 GIF 页，第一阶段不继续扩展 |
| `test.html` | legacy 图片尺寸核对页，已弱化 / 弃用 |
| `suggest.html` | legacy 本机使用回顾页，后续不作为重点 |

后续新品宣能力不再继续写进单个 HTML 文件，而是逐步迁移到模块化前端应用。

## 新工具目标

核心工作流：

```txt
新建批次
↓
上传主视觉 / 已设计图
↓
选择或粘贴物料尺寸矩阵
↓
逐尺寸预览、裁切、安全区检查
↓
批量导出 JPG / PNG
↓
生成复核清单
```

第一阶段只做图片，不做视频 / GIF。

## 核心能力

### 1. 尺寸矩阵

支持：

- 手动新增尺寸
- 粘贴尺寸脚本
- 粘贴表格
- TXT 配置
- 常用预设模板

示例：

```txt
1080x1920
1920*1080
900 383
1:1 1024
16:9 1920
9:16 1080
```

### 2. 版型适配规则

Logo / CPR 不按单张图片宽度简单等比缩放，而是先识别版型族，再按规则计算视觉尺寸和位置。

版型族：

```txt
landscape: aspect >= 1.25
square:    0.85 <= aspect < 1.25
portrait:  aspect < 0.85
```

计算基准：

```txt
shortSide = Math.min(width, height)
logoWidth = clamp(shortSide * ratio, min, max)
margin = clamp(shortSide * marginRatio, min, max)
```

目标：

- 21:9、16:9、4:3 等横版 Logo / CPR 视觉一致
- 9:16、9:21、3:4 等竖版 Logo / CPR 视觉一致
- 同批物料的品牌元素位置和大小稳定
- 预览与导出使用同一套计算函数

### 3. 批量导出

支持：

- JPG / PNG
- ZIP 打包
- 文件大小检查
- 命名规则
- TXT / CSV 复核清单

## 推荐目录结构

```txt
src/
  core/
    image/
      crop.ts
      resize.ts
      exportImage.ts
    layout/
      layoutProfile.ts
      logoLayout.ts
      cprLayout.ts
    spec/
      specParser.ts
      presetTemplates.ts
    export/
      zipExport.ts
      reviewReport.ts
    storage/
      localStore.ts
  components/
  pages/
  App.tsx
```

## 离线硬约束

- 运行时不联网
- 不调用远程 API
- 不依赖 CDN
- 不上传用户素材
- 第三方依赖必须本地化或通过项目依赖随构建产物打包

## Legacy 运行方式

旧页面仍可用本地 HTTP server 打开：

```bash
python3 -m http.server 8765
# 浏览器打开 http://localhost:8765/photo1.html
```

后续新工具启动方式以实际 Vite / 构建配置为准。
