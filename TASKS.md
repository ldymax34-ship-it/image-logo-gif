# 任务看板

## 当前版本：0.1.19-preview.1 桌面 Preview 封包

### 产品方向

当前项目为「品宣物料工作台」。

0.1.x 先完成 Vite + React + TypeScript Web 工作台闭环，0.2.x 再接 Tauri 做 macOS / Windows 桌面化。

### 已完成

- [x] 建立 Vite + React + TypeScript 项目结构
- [x] 建立 `src/core/layout/layoutProfile.ts`
- [x] 建立 `src/core/layout/logoLayout.ts`
- [x] 建立 `src/core/layout/cprLayout.ts`
- [x] 建立 `src/core/layout/brandLayer.ts`
- [x] 迁移 / 重写尺寸片段解析能力到 `src/core/spec/specParser.ts`
- [x] 建立常用物料尺寸模板 `src/core/spec/presetTemplates.ts`
- [x] 建立文件命名模块 `src/core/export/fileNaming.ts`
- [x] 建立 `src/platform/` 抽象层，暂不接 Tauri
- [x] 删除旧 HTML 入口文件，仓库只保留新应用入口
- [x] 全仓扫描确认无 `assets/` 引用后，删除旧资源目录 `assets/`
- [x] 前端 UI 调整为暗色三栏工作台：素材 / 预览 / 尺寸矩阵
- [x] 支持粘贴尺寸片段并生成尺寸矩阵
- [x] 支持上传一张或多张图片
- [x] 左侧素材列表显示缩略图、文件名、原图宽高、文件大小
- [x] 点击素材后进入当前素材预览
- [x] 点击画板后，中间预览区显示对应尺寸画布
- [x] 图片按 cover 模式填入画布，不变形
- [x] 支持安全区显示
- [x] 右侧显示当前画板宽高、格式、landscape / square / portrait 版型识别
- [x] 建立 `MaterialAsset` / `WorkbenchState` / `BoardPreviewState` / `CropState`
- [x] 支持拖动画面位置
- [x] 支持缩放画面
- [x] 支持重置裁切
- [x] 支持填满画布 / 适应画布策略
- [x] 每个素材 x 每个画板保存独立裁切状态
- [x] 抽离 `src/core/image/fit.ts`、`crop.ts`、`imageMeta.ts`
- [x] 支持上传 / 管理多个 Logo SVG
- [x] 支持 SVG 语种标签：简中、繁中、日文、韩文、英文、自定义
- [x] 支持启用 / 关闭 Logo
- [x] 支持启用 / 关闭 CPR
- [x] 支持预览区切换 Logo / CPR 语种资源
- [x] 使用现有 `renderBrandLayer` 计算 Logo / CPR 位置
- [x] SVG 保留 viewBox 和原始比例，不修改 SVG 文本
- [x] SVG 预览拦截 script、foreignObject、远程 / 协议相对 / data 引用和外部 CSS 引用
- [x] 使用本地 `.env` + opencode CLI 做只读审查，由 Codex 总控筛选并修复高风险项
- [x] 中间预览区默认展示所有画板缩略预览
- [x] 总览中的每个画板都显示当前素材裁切、安全区、Logo / CPR 状态
- [x] 点击任一画板后保留单个画板配置权限，裁切 / 缩放只作用于当前素材 x 当前画板
- [x] 接入公司常用 Logo 静态 PNG：`KURO 英文标识 黑色 / 白色`
- [x] 接入鸣潮 Logo 静态 PNG：简中、繁中 / 日文、英文、韩文
- [x] 默认 Logo 资源来自用户提供文件夹中的静态优先资源，不接入动态素材
- [x] Logo 支持改色、简单描边、外发光、阴影
- [x] PNG Logo 和上传 SVG 共用 `BrandAsset`、`BrandLayerState` 和 `renderBrandLayer`
- [x] 规格 ID 改为稳定生成，插入 / 上移无关行时不再按行号串裁切
- [x] 尺寸矩阵改为草稿编辑 + 手动应用，避免实时解析直接破坏已调好的画板
- [x] 新项目默认不再注入示例尺寸，首屏从空状态开始
- [x] Logo 语种下拉会真实切换当前预览资源，不再只影响下一次上传
- [x] Logo Group 支持组合、位置与大小控制；CPR 固定为底部 SVG 组件
- [x] 总览中单击画板只负责选择，双击才进入裁切调整，避免缩略图误拖
- [x] 三栏桌面布局延后到更窄断点再折叠，减少笔记本桌面视图过早单栏化
- [x] 接入内置尺寸套组，一键替换填入或追加到尺寸草稿
- [x] 支持把当前规格保存为本地自定义常用套组，并可删除
- [x] 画板聚焦调整改为双击进入独立弹窗，可通过右上角关闭、取消或保存并返回
- [x] 聚焦弹窗使用本地草稿裁切状态，未保存时关闭会要求确认放弃
- [x] 支持 Enter 进入画板调整、Esc 返回、弹窗焦点循环与返回后恢复原焦点
- [x] 尺寸矩阵更新和自定义套组删除使用应用内确认弹窗
- [x] 修复套组名称重复尺寸文本时一行生成多个画板的问题
- [x] 聚焦弹窗在 900px 以下改为上下布局，画布和控件不再重叠
- [x] 删除旧 HTML 备份、视频调试记录、过时 Cursor 规则与本地生成缓存
- [x] 本地项目目录由历史名称改为 `brand-material-workbench`
- [x] 品牌高级样式折叠，主交互优先展示语种、启用、位置、大小
- [x] 建立预览 / 导出共用 `buildBoardRenderPlan`
- [x] 建立 `src/core/image/exportImage.ts`
- [x] 支持单张当前画板导出 PNG / JPG
- [x] 支持 `npm start` 启动、`npm stop` 停止，并记录受控 PID
- [x] 支持 macOS 双击“启动工作台 / 关闭工作台”脚本
- [x] 提供 Windows 启动 / 停止 `.cmd` 脚本
- [x] 新增 Photoshop 式三栏批量导出窗口
- [x] 左侧逐文件显示名称、尺寸、预计 MB 与超限风险
- [x] 中间展示当前选中画面及 Logo / CPR 效果
- [x] 右侧统一设置 PNG / JPG、JPG 质量、Logo / CPR 开关和语种
- [x] 支持勾选部分或全部画板批量导出
- [x] 优先选择文件夹逐张写入，不打包
- [x] 新增 `docs/UI_GUIDE.md`，明确桌面工具排版、间距、控件、动效与模糊边界
- [x] 新增 CSS Design Tokens：`src/styles/tokens.css`、`theme.css`、`components.css`
- [x] 建立统一 Button、Tabs、Modal、Select、Toggle、Panel、Toolbar、ConfirmDialog 基础组件
- [x] 将 App Shell 拆为 WorkbenchHeader、AssetSidebar、BoardOverview、SpecPanel、BrandPanel、FocusEditor、ExportDialog 组件边界
- [x] 浅色面板、14px 基础排版、轻量弹窗动效完成；运行时不使用 backdrop blur
- [x] 新增以 1920×1080 的 32×18 为参考、按短边等比缩放的品牌网格、半格、安全区与辅助线数据
- [x] 新增固定 CPR SVG 预设：保留 viewBox 与原始比例，尺寸与底部位置由品牌网格计算
- [x] 新增 Logo Group、位置、颜色和 Brand Render Plan 数据结构
- [x] 新增版本化 BrandSettings 本地读取、写入及恢复默认值 API
- [x] 接入固定 CPR SVG；CPR 固定于画板底部并仅复用 Logo Group 的水平对齐语义
- [x] 移除 CPR 上传、替换、独立坐标、尺寸和效果入口；不使用 Canvas fillText 或字体文件
- [x] 总览按全部素材分组，并在每组内展示全部规格画板；选择状态使用 `assetId + specId`
- [x] 左侧素材点击滚动定位并高亮对应编组，不隐藏其他素材；画板双击进入正确裁切状态
- [x] 工作台统一为中性深灰桌面面板规范，画布区更深，控件高度、间距和交互状态统一
- [x] 导出窗口移除总预计容量，仅保留逐文件预计大小、超限提示、数量、格式、质量和进度
- [x] Logo Group 支持画板内拖动、参考线吸附与自定义位置；CPR 仍固定在底部
- [x] 支持把 Logo Group 状态应用到所有同版型画板，不覆盖图片裁切
- [x] 品牌默认设置会应用到新画板，并通过版本化 localStorage 保存
- [x] CPR 支持独立底部左 / 中 / 右位置，不继承 Logo Group 自定义坐标
- [x] CPR 支持独立黑 / 白 / 原始色以及描边、阴影、外发光，默认全部效果关闭
- [x] Logo 高级样式加入独立单项实时预览
- [x] 品牌面板整理为 Logo、CPR、辅助工具三个扁平分组
- [x] 接入 Tauri 2 桌面壳，保留浏览器开发模式
- [x] Tauri 模式使用系统原生目录选择器，并在用户选择的目录内逐张写入导出文件
- [x] Tauri 导出遇到同名文件时自动追加 `_2`、`_3`，不静默覆盖
- [x] 新增 Windows x64、macOS Apple Silicon 的 GitHub Actions Preview 构建矩阵
- [x] Windows NSIS Preview 使用离线 WebView2；macOS Preview 使用 ad-hoc 签名
- [x] 总览缩略图使用固定预览舞台；极端宽高比规格按舞台内适配显示，不再撑破卡片或展示编辑参考线
- [x] 常见横版、方图、竖版缩略图继续响应网格、安全区与参考线开关；仅超窄 / 超高诊断规格静默辅助层
- [x] 桌面端导出改为 Tauri 原生命令写入用户选择的目录，并覆盖同名避让、非法路径和真实写入验证
- [x] 品牌设置“恢复默认”只修改弹窗草稿，取消不会泄漏设置；固定 CPR 的新默认位置为右下
- [x] 自动更新规划固定为 GitHub Release 资源、签名验证与提示式更新；不向 Git 历史提交安装包

### 本轮验证记录

- [x] 0.1.1 完成后验证：`npm run verify:core`、`npm test`、`npm run build` 通过
- [x] 0.1.2 完成后验证：`npm run verify:core`、`npm test`、`npm run build` 通过
- [x] 0.1.3 完成后验证：`npm run verify:core`、`npm test`、`npm run build` 通过
- [x] 0.1.4 完成后验证：`npm run verify:core`、`npm test`、`npm run build` 通过
- [x] 0.1.5 完成后验证：`npm run verify:core`、`npm test`、`npm run build` 通过
- [x] 0.1.6 完成后验证：`npm run verify:core`、`npm test`、`npm run build` 通过
- [x] 0.1.7 完成后验证：`npm run verify:core`、`npm test`、`npm run build` 通过
- [x] 0.1.8 完成后验证：`npm run verify:core`、`npm test`、`npm run build` 通过
- [x] 0.1.9 完成后验证：`npm run verify:core`、`npm test`、`npm run build` 通过，25 tests
- [x] 0.1.11 完成后验证：`npm run verify:core`、`npm test`、`npm run build`、桌面 / 900px 视口与无大面积 blur 检查；27 tests，桌面与 900px 均无横向溢出，运行时 backdrop-filter 为 0
- [x] 0.1.12 品牌核心与固定 CPR SVG 验证：`npm run verify:core`、`npm test`、`npm run build` 通过；32 tests
- [x] 0.1.15 多素材总览、深灰工作台、吸附、同版型应用与默认设置验证：`npm run verify:core`、`npm test`、`npm run build` 通过；35 tests；桌面与 900px 视口无横向溢出
- [x] 0.1.16 CPR 独立样式、位置与品牌面板整理验证：`npm run verify:core`、`npm test`、`npm run build` 通过；36 tests

### 第一阶段剩余目标

- [x] 增加确认流程：解析结果经用户点击“应用尺寸”后再更新画板
- [ ] UI 默认只显示自动识别结果和推荐控制，高级参数折叠
- [x] 支持导出时通过当前品牌状态决定是否添加 Logo / CPR
- [x] 支持导出时沿用当前 Logo 语种和 CPR 语种
- [x] 建立 Canvas 导出模块 `src/core/image/exportImage.ts`
- [x] 支持 JPG / PNG 批量导出
- [ ] 建立复核清单模块 `src/core/export/reviewReport.ts`
- [ ] 支持 TXT / CSV 复核清单
- [x] 支持单画板品牌层覆盖和恢复推荐位置
- [x] 支持将当前品牌设置批量套用到同版型画板
- [ ] 支持删除 / 替换素材并在单项删除时释放 Object URL

### 暂不处理

- [ ] 不做视频 / GIF 新功能
- [ ] 不做整份需求文档语义识别
- [ ] 不在第一阶段内嵌完整思源黑体 / 思源宋体
- [x] 用户已明确授权：在 0.1.16-preview.1 提前接入 Tauri 封包；仅限桌面壳、原生目录选择、本地写入和构建，不扩展业务功能
- [ ] 不恢复旧 HTML / assets / vendor
- [ ] 不引入远程 API / CDN
- [ ] 自动更新器待独立更新密钥、Windows 实机回归、macOS 正式签名与公证齐备后启用

### 已知风险 / 降级

- 固定 CPR SVG 当前为单色路径，黑 / 白模式通过同一图层渲染；若未来正式资产改为多色资源，应保持资源原始颜色而不是强制改色。
- Logo Group 与固定 CPR 已使用 `buildBoardRenderPlan` 统一计算预览、单画板和批量导出位置。
- 图片 Object URL 当前在应用卸载时统一释放；后续增加删除素材功能时，需要在删除单项时同步 revoke。
- SVG 校验已阻止常见外部引用，但复杂 SVG 安全策略仍建议在批量导出前继续收紧。
- Logo / CPR 样式的 Canvas 复现已覆盖改色、描边、外发光、阴影近似效果，但与 CSS 预览仍可能有细微像素差异。
- macOS Apple Silicon 本机构建与实测、Windows x64 实机导出需在 Preview Release 前分别记录；CI 构建成功不等同于实机回归。

### 下一步建议给 Codex

1. 用真实物料校准 PNG / JPG 预估大小和超限提示。
2. 增加删除 / 替换素材与单项 Object URL 回收。
3. 按 [自动更新规划](docs/AUTO_UPDATE_PLAN.md) 先完成 Windows 的 GitHub Release 更新通道，再准备 macOS 正式签名与公证。
