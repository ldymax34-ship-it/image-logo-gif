# 任务看板

## 当前版本：0.1.10 本地启停与 Photoshop 式批量导出

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
- [x] 支持上传 / 管理多个 CPR SVG
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
- [x] CPR 样式控制复用同一套改色、描边、外发光、阴影状态结构
- [x] PNG Logo 和上传 SVG 共用 `BrandAsset`、`BrandLayerState` 和 `renderBrandLayer`
- [x] 规格 ID 改为稳定生成，插入 / 上移无关行时不再按行号串裁切
- [x] 尺寸矩阵改为草稿编辑 + 手动应用，避免实时解析直接破坏已调好的画板
- [x] 新项目默认不再注入示例尺寸，首屏从空状态开始
- [x] Logo / CPR 语种下拉会真实切换当前预览资源，不再只影响下一次上传
- [x] Logo / CPR 增加全局位置与大小控制：左上 / 右上 / 居中，小 / 标准 / 大
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

### 第一阶段剩余目标

- [x] 增加确认流程：解析结果经用户点击“应用尺寸”后再更新画板
- [ ] UI 默认只显示自动识别结果和推荐控制，高级参数折叠
- [x] 支持导出时通过当前品牌状态决定是否添加 Logo / CPR
- [x] 支持导出时沿用当前 Logo 语种和 CPR 语种
- [x] 建立 Canvas 导出模块 `src/core/image/exportImage.ts`
- [x] 支持 JPG / PNG 批量导出
- [ ] 建立复核清单模块 `src/core/export/reviewReport.ts`
- [ ] 支持 TXT / CSV 复核清单
- [ ] 支持单画板品牌层覆盖和恢复自动规则
- [ ] 支持将当前裁切 / 品牌设置批量套用到同版型画板
- [ ] 支持删除 / 替换素材并在单项删除时释放 Object URL

### 暂不处理

- [ ] 不做视频 / GIF 新功能
- [ ] 不做整份需求文档语义识别
- [ ] 不在第一阶段内嵌完整思源黑体 / 思源宋体
- [ ] 不在 0.1.x 做 Tauri 打包、dmg、msi
- [ ] 不恢复旧 HTML / assets / vendor
- [ ] 不引入远程 API / CDN

### 已知风险 / 降级

- CPR 颜色当前通过 CSS mask 进行单色预览，适合单色 CPR；如果 CPR SVG 本身是多色图形，单色预览会丢失原多色细节。
- Logo / CPR 已使用 `buildBoardRenderPlan` 统一计算预览、单画板和批量导出位置。
- 图片 Object URL 当前在应用卸载时统一释放；后续增加删除素材功能时，需要在删除单项时同步 revoke。
- SVG 校验已阻止常见外部引用，但复杂 SVG 安全策略仍建议在批量导出前继续收紧。
- Logo / CPR 样式的 Canvas 复现已覆盖改色、描边、外发光、阴影近似效果，但与 CSS 预览仍可能有细微像素差异。

### 下一步建议给 Codex：0.1.11

1. 用真实物料校准 PNG / JPG 预估大小和超限提示。
2. 增加删除 / 替换素材与单项 Object URL 回收。
3. 考虑同版型批量套用裁切和品牌设置。
