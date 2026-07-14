# 品宣物料工作台

本仓库目标是做一个纯本地运行的设计生产工具，用于品宣 / 市场平面物料的批量适配、裁切、导出和复核。

## 当前状态

当前项目已推进到 0.1.19，使用 Vite + React + TypeScript 搭建模块化前端应用。桌面 Preview 封包已接入 Tauri 2，并通过 GitHub Actions 构建 Windows x64 与 macOS Apple Silicon 产物。

当前已建立：

- 新应用工程骨架
- 尺寸片段解析
- 版型适配规则
- Logo / CPR 品牌层 layout
- 文件命名清理
- 中性深灰三栏工作台与统一桌面 UI 基础层
- [UI 规范](docs/UI_GUIDE.md)、CSS Design Tokens 与基础 UI 组件
- 图片上传与素材列表
- 按素材编组、同时展示全部素材与全部规格的画板总览
- 每个素材 x 每个画板独立裁切状态
- SVG Logo 上传、语种标签与预览切换
- 默认公司 KURO / 鸣潮 Logo 静态 PNG 资源
- Logo 改色、描边、外发光、阴影预览
- CPR 固定 SVG 支持独立的左下 / 底部居中 / 右下位置与黑白、原始色和高级效果
- Logo 高级样式提供独立单项实时预览
- 尺寸草稿与确认应用流程，避免实时改文本破坏画板状态
- Logo / CPR 真实语种切换与位置 / 大小基础控制
- 内置尺寸套组与本地自定义常用套组
- 总览单击选择，双击画板进入独立调整弹窗
- 画板调整使用草稿状态，支持取消、放弃修改与保存并返回
- 尺寸更新和删除套组使用应用内确认弹窗
- 内置套组中重复尺寸文本不再重复生成画板
- 当前画板单张导出 PNG / JPG
- Photoshop 式批量导出总览：文件列表、大图预览、格式与品牌设置
- 直接选择文件夹逐张导出，不生成压缩包
- `npm start` / `npm stop` 以及 macOS / Windows 双击启停脚本
- 浏览器 / Tauri 共用的 `platform/` 文件选择和文件写入适配层
- Tauri 2 Preview 封包与 Windows、macOS 多平台构建工作流

待继续接入：

- 更完整的单画板品牌层覆盖与批量套用
- 更准确的文件体积校验和超限提示

## 启动与停止

macOS 用户可以直接双击：

- `启动工作台.command`
- `关闭工作台.command`

Windows 用户可以直接双击：

- `start-workbench.cmd`
- `stop-workbench.cmd`

开发者也可以使用：

```bash
npm start
npm stop
```

首次启动如果缺少依赖，启动脚本会自动执行本地安装。服务固定运行在 `http://127.0.0.1:5173/`。

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
直接写入输出文件夹
```

第一阶段只做图片，不做视频 / GIF。

跨平台桌面应用已进入内部 Preview 封包阶段：

- 0.1.x：先完成 Vite + React + TypeScript Web 工作台闭环
- 当前：Tauri 2 桌面壳、原生目录选择和本地文件写入
- Preview 构建：Windows 10/11 x64（NSIS）、macOS Apple Silicon（DMG / App）
- Preview 阶段不含正式代码签名或自动更新；自动更新将使用 GitHub Release 资源，详见 [自动更新规划](docs/AUTO_UPDATE_PLAN.md)

## 桌面 Preview 封包

桌面包仍然完全本地运行：不上传素材、不调用远程 API、不依赖 CDN。

### 开发与本机构建

```bash
npm install
npm run tauri:dev

# 依次完成核心验证、测试、前端构建和当前平台的 Tauri 构建
npm run package:preview
```

`npm run dev`、`npm start` 和浏览器模式仍可继续使用。

### 平台产物

GitHub Actions 在 Preview tag（例如 `v0.1.19-preview.1`）上构建：

- Windows 10/11 x64：NSIS Setup EXE，内置离线 WebView2。
- macOS Apple Silicon：arm64 DMG 与 App ZIP。

Preview 包未使用正式商业签名：Windows 可能显示 SmartScreen，macOS Apple Silicon 首次启动可能要求在“系统设置 → 隐私与安全性”中手动允许。不要关闭系统安全机制或运行绕过脚本。

## 自动更新规划

后续正式版本计划使用 GitHub Release 作为跨网络更新源：客户端只读取版本清单与平台更新包，所有素材处理仍然完全在本地完成。更新不会把安装包提交到 Git 历史，也不会上传图片或工作台数据。

Windows 将先接入提示式更新，完整离线 WebView2 安装包保留为首次安装和无网络环境兜底。macOS 需要先完成 Developer ID 签名和公证后再启用更新通道。完整实施步骤、签名边界和发布检查见 [自动更新规划](docs/AUTO_UPDATE_PLAN.md)。

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
- 直接选择输出文件夹
- 文件大小检查
- 命名规则
- 导出前清单总览
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
      batchExport.ts
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
