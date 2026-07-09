# 品宣物料工作台

本仓库目标是做一个纯本地运行的设计生产工具，用于品宣 / 市场平面物料的批量适配、裁切、导出和复核。

## 当前状态

当前项目已推进到 0.1.4，使用 Vite + React + TypeScript 搭建模块化前端应用。

当前已建立：

- 新应用工程骨架
- 尺寸片段解析
- 版型适配规则
- Logo / CPR 品牌层 layout
- 文件命名清理
- 暗色三栏工作台
- 图片上传与素材列表
- 全画板总览预览
- 每个素材 x 每个画板独立裁切状态
- SVG Logo / CPR 上传、语种标签与预览切换
- `platform/` 抽象层占位

待继续接入：

- Canvas 导出
- ZIP 打包
- TXT / CSV 复核清单

## 新工具目标

核心工作流：

```txt
新建批次
↓
上传主视觉 / 已设计图
↓
粘贴尺寸片段或选择物料尺寸矩阵
↓
逐尺寸预览、裁切、安全区检查
↓
选择 Logo / CPR 语种版本并预览
↓
批量导出 JPG / PNG
↓
生成 ZIP 与复核清单
```

第一阶段只做图片，不做视频 / GIF。

跨平台桌面应用是中期目标：

- 0.1.x：先完成 Vite + React + TypeScript Web 工作台闭环
- 0.2.x：再接 Tauri，做 macOS / Windows 双平台桌面化
- 0.1.x 可预留 `platform/` 抽象层，但不做 `.dmg` / `.msi` / Tauri 打包

## UI 方向

前端 UI 全部重写。

新品宣工作台建议结构：

```txt
顶部：批次信息 / 导入 / 导出
左侧：素材列表
中间：预览画布 / 裁切 / 安全区 / Logo CPR 预览
右侧：尺寸矩阵 / 版型识别 / 品牌元素设置 / 导出状态
```

## 核心能力

### 1. 尺寸片段解析

目标不是识别整份需求文档。用户会手动把「需求尺寸」或相关尺寸片段复制到弹窗里，工具负责自动提取尺寸并生成多个画板。

支持：

- 手动新增尺寸
- 粘贴尺寸片段
- 粘贴表格
- TXT 配置
- 常用预设模板
- JPG / PNG
- KB / MB 大小限制

示例：

```txt
1080x1920
1920*1080
3840×2160
900 383
1:1 1024
16:9 1920
9:16 1080
```

弹窗建议：

```txt
按钮：粘贴尺寸
标题：从尺寸文本生成画板
左侧：文本框，粘贴尺寸列表 / 表格 / TXT 片段
右侧：解析预览，展示尺寸数量、画板列表、无法识别行
确认后：生成尺寸矩阵和多个画板
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

### 3. SVG Logo / CPR 与语种版本

Logo 和 CPR 第一阶段都按 SVG 资源处理，用于保证跨尺寸、跨平台的视觉一致性。

支持：

- 上传 / 管理多个 Logo SVG
- 上传 / 管理多个 CPR SVG
- SVG 保留 viewBox 和原始比例
- 预览区快速切换不同语种 Logo / CPR 效果
- 导出时勾选是否添加 Logo / CPR
- 导出时选择 Logo 语种和 CPR 语种

规则：

- 版型适配只负责计算位置、宽度、边距和锚点，不修改 SVG 内容
- 预览和导出必须共用同一个 layout / renderBrandLayer 计算结果
- 第一版不做复杂 SVG 编辑器

### 4. 批量导出

支持：

- JPG / PNG
- ZIP 打包
- 文件大小检查
- 命名规则
- TXT / CSV 复核清单
- UTF-8
- CSV 可选 BOM
- 中文文件名
- Windows 非法字符清理

### 5. 字体和全球字符

第一阶段先降级处理，不做完整字体系统，不内嵌完整思源黑体 / 思源宋体。

0.1.x 先保证：

- UTF-8
- CSV 可选 BOM
- 中文文件名
- Windows 非法字符清理
- 基础文件名长度控制

`fontRegistry.ts` / `textMeasure.ts` / `unicode.ts` 可后置或先留模块壳。

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
      brandLayer.ts
    spec/
      specParser.ts
      presetTemplates.ts
    export/
      zipExport.ts
      reviewReport.ts
      fileNaming.ts
    storage/
      localStore.ts
  platform/
    fileSystem.ts
    dialog.ts
    path.ts
    desktopBridge.ts
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

开发期 Codex 可以按 `AGENTS.md` 读取本地 `.env` 里配置的模型能力辅助开发，但工具运行时仍必须纯本地。

## 开发方式

0.1.x 新应用使用 Vite + React + TypeScript：

```bash
npm install
npm run dev
# 浏览器打开 http://127.0.0.1:5173/
```

核心验证：

```bash
npm run verify:core
npm test
npm run build
```
