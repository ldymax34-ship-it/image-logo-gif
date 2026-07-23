# 品宣物料工作台

本仓库是一个纯本地运行的桌面设计生产工具，用于把市场平面素材批量适配到不同尺寸，完成裁切、Logo / CPR 版式、导出与复核。

它解决的是“同一套素材在多尺寸、多语种交付时，如何稳定保留版式规则并直接落盘”的日常生产问题；当前不是通用图片编辑器、视频剪辑器或云端处理服务，也不包含专业静态编辑器路线。

## 当前状态

当前项目已推进到 0.1.33，使用 Vite + React + TypeScript 搭建模块化前端应用。桌面 Preview 封包已接入 Tauri 2，并已发布 Windows x64 与 macOS Apple Silicon 的 `0.1.33` 签名更新产物。

首次启动默认进入“品宣工具箱”：Logo 与版式可用，GIF / 媒体工具提供内部实验性 MP4/MOV → GIF 队列，水印与追溯尚未开放；设置可选择下次启动打开工具箱首页、Logo 与版式、GIF / 媒体工具、水印与追溯或上次使用的工具。进入 Logo 与版式后，原有设媒与自定义构图工作流、模块导航与导出行为保持不变，并可随时返回工具箱。

当前处于正式产品收束路线：应用根层统一管理模块切换、全局品牌资源、全局设置与活动状态；设媒、自定义和 GIF 媒体窗口仍为独立模块。Preview 提示式自动更新已接入；2026-07-22 已完成隔离 macOS Apple Silicon `0.1.29 → 0.1.33` 更新 E2E。GIF 工具当前只处理 MP4/MOV → GIF；水印与追溯和隐形指纹尚未实现。

当前正式工作流已收束为：固定桌面应用框架、按画板独立保存品牌状态、统一解析预览 / 聚焦 / 导出的语言资源、工作区内聚焦草稿、连续 Logo / CPR 缩放、画板级 Logo 极限构图边界、聚焦视图滚轮缩放与平移，以及“每画板自身语种 + 追加语种 / 全语种”的批量导出。PNG 超限会明确失败，JPG 可按现有策略自动压缩；导出窗口会保留逐项结果与平台实际落盘文件名。

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
- 各语种 Logo 独立视觉倍率，多语种预览与导出自动应用语种校正
- 导出文件名使用 `zh / tw / en / ja / ko / de / fr / es / th / PT` 语言缩写
- 当前实际支持 5 种语言（简中 zh-CN / 繁中 zh-TW / 日文 ja-JP / 韩文 ko-KR / 英文 en-US）。德/法/西/泰/葡仅有命名码映射，不在无资源时硬扩功能。
- 内置尺寸套组与本地自定义常用套组
- 总览单击选择，双击画板进入工作区内聚焦调整
- 聚焦调整使用 `FocusSession` 草稿状态，支持取消、放弃修改与保存并返回
- 尺寸更新和删除套组使用应用内确认弹窗
- 内置套组中重复尺寸文本不再重复生成画板
- 当前画板单张导出 PNG / JPG
- 批量导出总览：文件列表、大图预览、格式、每画板自身语种 / 追加 / 全语种选择、源图片名 / 自定义名称、体积策略与逐项结果
- 直接选择文件夹逐张导出，不生成压缩包
- `npm start` / `npm stop` 以及 macOS / Windows 双击启停脚本
- 浏览器 / Tauri 共用的 `platform/` 文件选择和文件写入适配层
- Tauri 2 Preview 封包与 Windows、macOS 多平台构建工作流
- 自定义构图默认以原图自然像素作为画布与输出尺寸；可显式切换手动规格，并保留底图裁切、固定对象直接操作与正式 Render Plan 导出

## 自定义构图交互与依赖

自定义构图固定为一张底图、游戏 Logo、公司 Logo 与 CPR。默认“原图尺寸（跟随底图）”使用当前图片的自然宽高；`1920×1080` 等仅在用户主动选择时作为手动输出尺寸，替换底图不会覆盖既有手动选择。画布支持“适合画布 / 填满画布”、拖动底图调整、素材缩放和裁切复位；这些裁切状态与正式导出共用同一 Render Plan。

游戏 Logo、公司 Logo、CPR 只支持固定对象的选中、拖动和四角等比缩放；X/Y 数值显示实际画布位置。对象没有固定倍率上限，唯一上限是保持完整位于当前画布内的几何边界，放大时会自动收回位置。标准设媒 CPR 保持安全边距，自定义构图的 CPR 可贴画布边但不越界；不提供旋转、多选、图层、文字、额外图片、复制粘贴或工程文件。

交互层使用本地 `fabric@7.4.0`（MIT）提供透明命中框和选框，并随资源/语种与 Render Plan bounds 同步。Fabric 不渲染正式视觉、不读取或修改颜色/效果状态，也不参与导出；若交互层加载失败，正式预览与导出仍继续由现有 Render Plan 和 Canvas 流程完成，不使用 CDN 或远程 API。

## 不做什么

miniPaint、Photopea / Canva / Photoshop 类专业静态编辑器与完整开源图片编辑器已从当前路线取消，不会在当前版本以内嵌、可选安装包、独立子工具、项目内调用或兼容层方式加入。文字排版、多图层、蒙版、滤镜、选区、画笔、路径和复杂合成当前属于范围外；用户可自行使用已有外部专业软件，但本项目当前不负责集成、启动、同步、文件交接或分发。

当前不为未确认需求主动搭建图层、插件、时间轴、通用文档模型或高级编辑入口。未来若其他已确认功能有真实需求，必须重新经过用户确认、边界审计、依赖/许可证与包体评估后再决定。

待继续接入：

- GIF / 媒体工具（内部实验性）支持 MP4/MOV → GIF：可选择或拖入文件、设置起止时间/宽度/FPS/循环/预设与输出目录，按队列顺序真实处理并显示进度、取消、失败、实际输出路径和大小。浏览器模式明确显示“真实转换仅桌面可用”，不会伪造任务。工具只调用随当前 Tauri app 打包的 FFmpeg / FFprobe，不搜索系统 PATH、不联网下载、不覆盖原文件；固定来源与 SHA-256 见 `docs/MEDIA_RUNTIME_SOURCES.md`。水印与追溯和隐形指纹仍不实现。

## 启动与停止

macOS 用户可以直接双击：

- `启动工作台.command`
- `关闭工作台.command`

Windows 用户可以直接双击：

- `start-windows-preview.bat`（共享盘测试推荐，会先同步到 Windows 本机缓存）
- `start-workbench.cmd`
- `stop-workbench.cmd`

开发者也可以使用：

```bash
npm start
npm stop
```

首次启动如果缺少依赖，启动脚本会自动执行本地安装。服务固定运行在 `http://127.0.0.1:5173/`。

`start-windows-preview.bat` 需要 Windows 电脑预先安装 Node.js LTS。它不会直接使用共享盘里可能由 macOS 产生的 `node_modules`，而是将源码同步到 `%LOCALAPPDATA%\BrandMaterialWorkbench\preview` 后再启动。

## 核心文件与边界

- `src/app/App.tsx`、`src/app/AppRuntimeProvider.tsx`：应用级工具入口、工作区切换与全局状态。
- `src/modules/media-workbench/`：设媒与多画板导出工作流。
- `src/modules/custom-workbench/`：固定对象的自定义构图。
- `src/core/`：规格、Logo / CPR、Render Plan、导出与本地存储。
- `AGENTS.md`、`TASKS.md`、`CHANGELOG.md`：协作规则、当前任务和历史记录的权威入口；参考原文位于 `docs/references/AI开发规则推荐默认规则文件.md`。

不要修改：自动更新、签名、Preview 发布和 CNB/GitHub 分发链路；不要删除用户素材或未跟踪 `artifacts/`；不要把 Render Plan、同步、正式导出交给 Fabric；GIF 工具不得搜索 PATH、运行时下载、启动第二个 Tauri app、覆盖输入文件或伪造进度/结果。

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
- Preview 阶段使用 Tauri Updater 签名验证，不包含 Windows Authenticode、macOS Developer ID 或公证；更新资源由 CNB Preview manifest 优先、GitHub Preview manifest 回退，详见 [自动更新规划](docs/AUTO_UPDATE_PLAN.md)

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

GitHub Actions 在 Preview tag（例如 `v0.1.27-preview.1`）上构建：

- Windows 10/11 x64：NSIS Setup EXE，内置离线 WebView2。
- macOS Apple Silicon：arm64 DMG 与 App ZIP。

Preview 包未使用正式商业签名：Windows 可能显示 SmartScreen，macOS Apple Silicon 首次启动可能要求在“系统设置 → 隐私与安全性”中手动允许。不要关闭系统安全机制或运行绕过脚本。

## Preview 自动更新

桌面客户端只读取公开二进制分发仓库的 Preview 清单 `latest-preview.json`，使用 Tauri Updater 的独立签名验证更新包；素材处理仍完全在本地完成。更新不会将安装包提交到 Git 历史，也不会上传图片或工作台数据。

更新为提示式流程：首屏后延迟检查，用户主动下载；安装前检查导出、聚焦编辑、未保存设置和确认弹窗等活动状态，并要求二次确认。当前不会读取 Stable `latest.json`。Updater 签名不等同于 Windows Authenticode、macOS Developer ID 或公证。

发布到公开二进制仓库的 Actions 需要 `RELEASE_REPOSITORY_TOKEN`：该 token 必须是仅对分发仓库授予 Contents 读写权限的 fine-grained PAT。完整发布和 Windows 实机步骤见 [自动更新说明](docs/AUTO_UPDATE_PLAN.md) 与 [Windows 测试说明](docs/WINDOWS_UPDATER_TEST.md)。

`0.1.33` 已完成 macOS 候选先行门禁和正式双平台 Preview 分发。仍需在交互式 macOS/Windows 桌面会话中人工回归底图裁切手势、三个固定对象的选中/拖动/缩放、四种配色的目视效果以及 PNG/JPG 导出位置；CI、Render Plan 与 updater E2E 不能替代这些视觉与手势验收。

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

**多语言导出语义**

- 默认：每画板使用自身已保存的 Logo 语种导出；A/300 日语、A/600 简中、B/300 韩语会分别导出为 ja / zh / ko。
- 追加：在每画板自身语种上追加所选语种并自动去重。
- 全语言：每画板展开为全部已支持语种（zh-CN / zh-TW / ja-JP / ko-KR / en-US）。
- 缺资源或解析到的 Logo 语种与请求不一致时，对应行会被标记为缺失并阻止导出，不再静默回退。

**命名规则**

- 默认文件名格式：`源图片名_ja_300x300.png`。
- 提供“源图片名 / 自定义名称”模式；自定义名称会替代源图片名，而不是作为额外前缀。
- 默认不再加入序号、material 批次前缀、规格名称。
- 语言码只在 Logo 有实际语种含义时输出（Logo 关闭或仅公司 Logo 时不伪造语种）。
- 多素材自定义名各不相同时直接使用自定义名；仅当计划文件名真实冲突时才追加 `_2`、`_3` 确定性避让，不无条件追加源图片名。
- Logo 关闭或仅公司 Logo（company-only）时，追加/全语言模式收敛为每画板一个任务，文件名不带语言码。
- 导出后 UI 从 `BatchItemOutcome.actualFileName` 展示平台实际落盘名称，不修改不可变 ExportJob。
- 桌面端由 Tauri 原生命令写入，遇到同名文件自动追加 `_2`、`_3`，不覆盖。

### 5. 画板同步

**Logo / CPR 同步**

- 同尺寸：按 `width × height` 匹配所有其他画板，不受格式、大小限制或 specId 影响；包括其他素材的同名尺寸，也包括同素材中重复的同尺寸规格。
- 同素材：当前素材的其他尺寸。
- 同步前会冻结来源快照与目标集合，并提示真实目标数量；目标未初始化时阻止整次操作。
- Logo 同步覆盖：组合、语种、资源、位置、大小、边界模式、显示状态、高级效果。
- CPR 同步覆盖：开关、位置、偏移、大小、颜色、高级效果。
- 同素材跨尺寸同步 Logo/CPR 自定义位置时，按源/目标画板归一化映射（偏移量按尺寸比例缩放），保持相对构图一致并满足各自边界约束；非自定义锚点保持语义锚点不变。

**裁切同步**

- 聚焦工作区裁切工具面板提供“同素材·同尺寸”入口。
- 只对 assetId 相同且 width×height 相同的其他画板复制 fitMode 与 crop 快照。
- 不复制到不同素材，也不把横版裁切直接复制到竖版。

### 6. Logo 极限构图边界

- 每画板 LogoGroupState 拥有 `constraintMode`：`safe-area`（默认，兼容旧画板）或 `canvas`（可越安全线，但 Logo 完整留在画布内）。
- 自定义位置时 UI 显示当前“位置边界：[安全区内/画布内]”。
- 超出安全区时保留虚线并轻微提示，不阻止保存；切回安全区时收回最近合法位置。
- 支持方向键 1px、Shift+方向键 10px 微调 Logo 自定义位置。
- 吸附与位置边界独立，两种模式下吸附开关均正确。
- CPR 仍保持禁止越界。

### 7. 聚焦视图手势

- 聚焦标题下方有单行操作提示栏，随当前工具（裁切 / Logo / CPR）显示对应操作快捷键和手势说明。
- 保留 25%～300% 查看倍率滑块、加减按钮与"适合窗口 / 100%"。
- 鼠标滚轮围绕指针缩放查看视图。
- Space + 左键拖动 或 鼠标中键拖动 平移视口；不使用 Ctrl+左键作为默认平移。
- 设置中可调整"聚焦滚轮缩放灵敏度"：低 / 标准 / 高。
- 查看倍率与视口平移只影响查看，不产生 dirty，也不影响裁切、Logo/CPR 位置或导出结果。

### 8. Logo / CPR 控制面板

- Logo 与 CPR 为两个同级独立 section 卡片，各自包含开关、基础控件、高级效果和应用范围。
- 用户可见文案统一使用 Logo / CPR / 素材等直接名称（软件标题"品宣物料工作台"除外）。

### 9. 字体和全球字符

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

开发期 Codex 按 `AGENTS.md` 直接基于仓库事实完成实现与审查；工具运行时仍必须纯本地。

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
