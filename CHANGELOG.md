# 更新日志

## 0.1.16-preview.1

本轮目标：不修改现有工作台业务功能，为内部体验提供 Windows 与 macOS 的最小桌面封包路径。

主要改动：

1. [新需求-大] 接入 Tauri 2 桌面壳，使用系统标题栏、1440×900 默认窗口和 1100×720 最小窗口；保留 Vite 浏览器开发模式。
2. [功能调整-中] `src/platform/` 统一识别浏览器与 Tauri 环境：Tauri 使用原生目录选择器与最小范围文件写入，浏览器继续使用 File System Access API 或下载回退。
3. [问题修复-中] 桌面导出遇到同名文件自动追加 `_2`、`_3`，避免静默覆盖已存在文件。
4. [维护-大] 新增 Windows x64（NSIS / 离线 WebView2）和 macOS Apple Silicon 的 GitHub Actions Preview 构建矩阵、产物重命名、校验文件和预发布流程。
5. [维护-小] 使用无品牌争议的临时应用图标；Preview 阶段 macOS 使用 ad-hoc 签名，Windows 不配置正式代码签名。

验证方式：

- `npm run verify:core`
- `npm test`
- `npm run build`
- `npm run tauri:build -- --bundles app,dmg`（当前 macOS）

验证边界：

- Windows x64 由 GitHub Actions 原生 Runner 构建；Windows x64 和 macOS Apple Silicon 的真实导出回归需在 Release 前记录。

## 0.1.16

本轮目标：为固定 CPR 增加受控的独立位置与样式，并重新整理品牌面板的信息层级。

主要改动：

1. [CPR-高] 固定 SVG 新增左下、底部居中、右下三个位置，始终保持一格底部与侧边安全距离，不继承 Logo Group 的自由坐标。
2. [CPR-高] CPR 新增独立黑、白、原始色和描边、阴影、外发光设置；默认白色且所有效果关闭，预览与导出复用同一渲染计划。
3. [Logo-中] Logo 高级样式折叠区新增当前游戏 Logo 的单项实时预览。
4. [UI-高] 品牌面板整理为 Logo、CPR、辅助工具三个扁平分组，统一标题、标签宽度、分割线和间距。
5. [兼容-中] 旧 `cprAnchor` / `cprEffect` 状态可迁移为新的 CPR 独立状态，旧 localStorage 品牌设置通过默认值合并继续可读。

验证方式：

- `npm run verify:core`
- `npm test -- --run`：36 tests passed
- `npm run build`

开发调度说明：

- 本轮按默认流程调用 `.env` 配置的 `opencode CLI + GLM` 承担主要实现；GLM 产生了 core 类型、默认值与布局代码。由于 CLI 后台进程未及时退出并出现空会话消息，Codex 终止并发进程后完成去重、接线、测试与最终审查。

## 0.1.15

本轮目标：在封 preview 包前完成多素材总览、桌面工作台视觉收束，以及 Brand System 的位置交互闭环。

主要改动：

1. [总览-高] 新增按素材编组的全量画板总览，同时遍历全部素材与全部规格；选择、裁切和品牌状态继续使用 `assetId + specId` 联合键隔离。
2. [交互-高] 左侧素材点击改为滚动定位并高亮编组；单击画板选择，双击打开对应素材与规格的聚焦编辑器；选中编组在折叠状态下会自动展开。
3. [品牌-高] Logo Group 增加画板级状态、拖动吸附、最近一次明确水平对齐语义和同版型批量应用；固定 CPR 始终独立定位于底部，不继承 Logo 的自由纵向坐标。
4. [设置-中] 版本化品牌默认值接入新画板初始化，不静默覆盖已有画板。
5. [界面-高] 工作台从浅色 SaaS 风格收束为中性深灰桌面生产工具；画布区更深，面板取消悬浮卡片，统一 34px 控件、12px 面板内边距和低对比分割线。
6. [导出-中] 删除总预计容量与相关计算，保留逐文件预计大小、单文件超限提示、已选数量、格式、JPG 质量和导出进度。

验证方式：

- `npm run verify:core`
- `npm test -- --run`：35 tests passed
- `npm run build`
- `git diff --check`
- 桌面宽视口和 900px 视口视觉检查，900px 下无横向溢出

验证边界：

- 三素材乘三规格的联合键隔离与全量渲染由组件测试覆盖；浏览器自动化无法向系统文件选择器注入本地文件，因此真实三文件上传仍保留为 preview 封包前人工回归项。
- 本轮未生成 preview 包。

## 0.1.12

本轮目标：建立 Brand System 的纯函数地基，避免将品牌网格、固定 CPR 和组合规则继续写入页面组件。

主要改动：

1. [品牌-高] 新增 `src/core/brand/brandGrid.ts`：以画板宽度 / 32 计算正方形网格、半格、安全区域与辅助线数据；1920x1080 对应 60px 单元格。
2. [品牌-高] 新增固定 CPR 资产接口；本轮已由正式 SVG `public/brand-cpr/kuro-rights.svg` 取代字体文本方案，不内嵌字体也不依赖系统字体。
3. [品牌-高] 新增 `LogoGroupState`、品牌颜色、推荐位置、渲染计划和双 Logo 横向组合的纯数据模型。
4. [设置-中] 新增版本化 `BrandSettingsV1` 本地存储 API，默认规则不会静默覆盖现有画板。
5. [兼容-中] 旧 `BrandLayerState` 保持可用，并增加可选 Brand System 字段；现有裁切、预览和导出路径未删除或替换。

验证方式：

- `npm run verify:core`
- `npm test`：32 tests passed
- `npm run build`

未完成：

- 0.1.14 的拖动吸附与同版型应用。
- 0.1.15 的“默认值应用到新建画板”行为。

### CPR 规则修正

1. [CPR-高] 正式接入固定 SVG：`public/brand-cpr/kuro-rights.svg`。预览、单张 Canvas 导出和批量导出均复用该资产；不使用 `fillText`，不内嵌或依赖系统字体。
2. [CPR-高] CPR 改为底部固定组件：距离底边 1 个品牌网格单位，左 / 中 / 右只复用 Logo Group 的水平对齐语义，不继承 Logo 的垂直或自由坐标。
3. [CPR-高] 主界面移除 CPR 上传、资源选择、独立位置、独立尺寸和独立效果入口；仅保留显示开关。默认无描边、阴影和外发光。
4. [品牌-中] Logo Group 已接入预览、单张导出与批量导出；网格辅助层和设置对话框可用。拖动吸附与同版型批量套用仍待后续单独验收。

## 0.1.11

本轮目标：暂停新增业务能力，收束为一套稳定、克制、可维护的桌面应用 UI 基础层。

主要改动：

1. [规范-高] 新增 `docs/UI_GUIDE.md`，确定字体栈、14px 基础字号、行高、间距、圆角、边框、阴影、动效和响应式规则。
2. [样式-高] 新增 `src/styles/tokens.css`、`theme.css`、`components.css`，将基础色彩、间距、圆角、阴影和动效抽为 CSS Variables；工作区收束为浅灰背景、白色面板、极淡边框和克制冷蓝强调。
3. [架构-高] 新增 Button、Tabs、Modal、Select、Toggle、Panel、Toolbar、ConfirmDialog 基础组件，并抽出 WorkbenchHeader、AssetSidebar、BoardOverview、SpecPanel、BrandPanel、FocusEditor、ExportDialog 页面边界。
4. [交互-中] 弹窗统一为轻微位移与缩放进入动画，支持系统减少动效偏好；应用背景、三栏面板和画布不使用 `backdrop-filter`。
5. [范围-高] 未更改素材、规格、裁切、Logo / CPR、预览或批量导出的核心状态和数据结构，也未引入 Tauri、CDN 或远程依赖。

验证方式：

- `npm run verify:core`
- `npm test`
- `npm run build`
- 浏览器桌面宽视口与 `900px` 窄视口检查
- 样式静态检查与运行时检查均确认没有大面积 `backdrop-filter`

已知范围：

- 本轮先建立组件边界与基础样式层；后续业务迭代应继续将内部 UI 细节逐步从 `App.tsx` 迁入对应组件，避免为拆分而改动已验证的业务状态。

## 0.1.10

本轮目标：让工具可以被非开发同事直接启停，并完成接近 Photoshop“导出为”的批量出图闭环。

主要改动：

1. [启停-高] 增加 `npm start` / `npm stop`，首次启动会自动安装依赖，固定使用 `127.0.0.1:5173`，记录受控 PID 并防止重复启动。
2. [启停-高] 新增 macOS 双击“启动工作台 / 关闭工作台”脚本，并提供 Windows `.cmd` 对应入口。
3. [导出-高] 导出改为三栏总览：左侧文件清单与 MB 预估，中间大图检查，右侧统一设置 PNG / JPG、JPG 质量和 Logo / CPR 语种。
4. [导出-高] 支持全选或勾选部分画板，优先选择输出文件夹逐张写入；不支持文件夹 API 时回退为浏览器多文件下载。
5. [体积-中] 根据源图压缩密度、输出像素和 JPG 质量显示预计 MB，并标记可能超过规格限制的文件。
6. [范围-中] 取消压缩打包路线并移除未使用的 `jszip` 依赖，每张图保持独立输出。

验证方式：

- `npm run verify:core`
- `npm test`
- `npm run build`
- `npm start` 启动、重复启动保护、`npm stop` 停止
- 浏览器实测批量导出弹窗和宽 / 窄视口布局

未完成 / 风险：

- MB 为快速预估，实际大小仍会受画面细节和压缩率影响。
- 回退为浏览器多文件下载时，首次使用可能需要用户允许多文件下载。

## 0.1.9

本轮目标：让画板选择与聚焦调整符合直觉，并统一可能覆盖或删除状态的确认交互。

修改文件：

- `package.json`
- `src/core/spec/specParser.ts`
- `src/core/core.test.ts`
- `src/pages/App.tsx`
- `src/styles.css`
- `.gitignore`
- `.cursor/rules/changelog.mdc`（删除）
- `harness-crop-debug.txt`（删除）
- `README.md`
- `TASKS.md`
- `CHANGELOG.md`

主要改动：

1. [维护-中] 清理旧 HTML 备份、调试记录、过时 Cursor 规则、审计截图、构建产物与本地依赖缓存，并将本地项目目录统一为 `brand-material-workbench`。
2. [交互-高] 取消预览顶部的“总览 / 聚焦调整”页签；总览单击只选择画板，双击进入独立画板调整弹窗。
3. [交互-高] 聚焦调整使用草稿裁切状态，只有“保存并返回”才写回画板；右上角关闭和“取消”会在有改动时要求确认放弃。
4. [易用性-中] 增加 Enter 进入、Esc 退出、弹窗焦点循环和关闭后焦点返回；尺寸更新与删除套组也改为应用内确认弹窗。
5. [修复-高] 修复内置套组的名称和尺寸重复出现时，3 个预设尺寸被误解析成 5 个画板的问题，并清理被截断后的名称尾部分隔符。
6. [响应式-高] 聚焦弹窗在 900px 以下切换为上下布局，画布会按当前可用宽高计算，不再与控件重叠。

验证方式：

- `npm run verify:core`：通过
- `npm test`：通过，25 tests
- `npm run build`：通过
- 浏览器实测：套组 3 个尺寸生成 3 个画板；双击、Enter、Esc、应用内确认弹窗通过
- 视觉实测：默认桌面视口和 800px 窄视口通过，控制台无 error / warning

影响范围：

- 影响画板总览、裁切调整、尺寸更新、套组删除和尺寸套组解析。
- 不改变预览 / 导出的坐标合同，不引入运行时联网能力。

未完成 / 风险：

- 由于浏览器实测环境未上传真实主视觉，裁切拖动的图像感知验收仍需用真实物料再跑一轮。
- 当前聚焦弹窗只编辑图片裁切，单画板 Logo / CPR 覆盖仍未接入。

下一步建议：

- 0.1.10 做批量导出总览，同时保留当前画板弹窗作为单项异常调整入口。

## 0.1.8

本轮目标：把当前工作台从“只能预览”推进到“能导出当前画板”，并让预览与导出共用同一套渲染计划。

修改文件：

- `package.json`
- `src/core/image/exportImage.ts`
- `src/core/image/index.ts`
- `src/core/core.test.ts`
- `src/pages/App.tsx`
- `src/styles.css`
- `TASKS.md`
- `CHANGELOG.md`
- `README.md`

主要改动：

1. [导出-高] 新增 `src/core/image/exportImage.ts`，支持把当前素材裁切、Logo、CPR 绘制到 Canvas，并导出为 PNG / JPG。
2. [架构-高] 新增 `buildBoardRenderPlan`，让预览和单画板导出共用同一套图片 rect 与品牌层布局结果。
3. [体验-中] 预览区增加导出格式切换和“导出当前画板”按钮。
4. [样式-中] Canvas 导出近似复现改色、描边、外发光、阴影，不再完全依赖 CSS 预览效果。
5. [验证-中] 增加 render plan 和套组序列化相关测试。

验证方式：

- `npm run verify:core`：通过
- `npm test`：通过，24 tests
- `npm run build`：通过

影响范围：

- 影响导出能力、预览与导出的一致性、预览区顶部交互。
- 当时仍未引入批量导出、复核清单、远程 API 或运行时联网能力。

未完成 / 风险：

- 当前只支持单张当前画板导出。
- Canvas 对 Logo / CPR 样式的复现已经可用，但仍可能与 CSS 预览存在轻微像素级差异。

下一步建议：

- 0.1.9 继续收紧画板调整与导出入口。

## 0.1.7

本轮目标：把“无脑使用”再往前推一步，补齐常用尺寸套组、总览 / 聚焦双视图和品牌面板收束。

修改文件：

- `src/core/spec/presetTemplates.ts`
- `src/core/storage/localStore.ts`
- `src/core/storage/index.ts`
- `src/core/index.ts`
- `src/core/core.test.ts`
- `src/pages/App.tsx`
- `src/styles.css`
- `TASKS.md`
- `CHANGELOG.md`
- `README.md`

主要改动：

1. [体验-高] 接入内置尺寸套组，可一键替换填入或追加到尺寸草稿。
2. [体验-高] 支持把当前规格保存为本地自定义套组，并保存在浏览器 `localStorage`。
3. [体验-高] 预览区拆分为总览模式和 Focus Editor 聚焦调整模式，让批量检查和单画板微调各自回到合适的界面。
4. [信息架构-中] 品牌样式改为折叠的高级区域，主面板优先展示语种、启用、位置和大小。
5. [验证-中] 增加套组序列化、自定义套组支撑函数和稳定状态相关测试。

验证方式：

- `npm run verify:core`：通过
- `npm test`：通过
- `npm run build`：通过

影响范围：

- 影响尺寸输入入口、预览模式切换和品牌面板结构。
- 不影响离线边界，不新增远程依赖。

未完成 / 风险：

- 自定义套组目前只保存在本地浏览器存储，还没有项目文件层的持久化。
- Focus Editor 目前仍是轻量调整，不包含单画板品牌层覆盖。

下一步建议：

- 在聚焦调整的基础上补上单画板可信导出。

## 0.1.6

本轮目标：先修稳规格状态和品牌选择语义，避免继续在不稳定的画板状态上叠功能。

修改文件：

- `package.json`
- `src/core/spec/specParser.ts`
- `src/core/brand/brandAsset.ts`
- `src/core/image/imageMeta.ts`
- `src/core/core.test.ts`
- `src/pages/App.tsx`
- `src/styles.css`
- `TASKS.md`
- `CHANGELOG.md`
- `README.md`

主要改动：

1. [状态-高] 尺寸规格 ID 改为稳定生成，不再按行号编号；插入说明行或调整文案标签时，已存在画板的裁切状态不会被整串错位。
2. [交互-高] 尺寸矩阵从“实时破坏性解析”改为“草稿编辑 + 点击应用”，并提供恢复已应用内容，避免改文本时悄悄重建全部画板。
3. [体验-中] 新项目默认从空尺寸开始，不再预塞示例画板。
4. [品牌-高] Logo / CPR 语种下拉现在会真实切换当前预览资源；手动点选资源时也会反向同步语种状态。
5. [品牌-中] 接入全局 Logo / CPR 位置与大小控制，支持左上 / 右上 / 居中和小 / 标准 / 大。
6. [体验-中] 预览区拖拽改为按画板 ID 更新，未选中画板现在点击后可直接开始拖动。
7. [布局-小] 三栏桌面布局改为更窄时再折叠，减少笔记本视口过早变单栏。
8. [验证-中] 增加稳定规格 ID、重复规格唯一性、日文预置 Logo 资源等测试。

验证方式：

- `npm run verify:core`：通过
- `npm test`：通过，21 tests
- `npm run build`：通过

影响范围：

- 影响尺寸矩阵的生成与应用流程、画板状态保持方式、品牌资源选择语义和预览区交互。
- 不引入导出链路、远程 API、CDN 或运行时联网能力。

未完成 / 风险：

- 品牌层样式效果仍然主要是 CSS 预览，Canvas 导出尚未验证一致性。
- 当前位置 / 大小控制仍是批次级全局设置，单画板覆盖会放在后续 Focus Editor。

下一步建议：

- 0.1.7 先做常用尺寸套组、Focus Editor 和品牌面板收束，再进入单画板可信导出。

## 0.1.5

本轮目标：接入用户提供的公司 Logo / 鸣潮 Logo 静态资源，并补充 Logo 改色、描边、外发光、阴影。

修改文件：

- `package.json`
- `package-lock.json`
- `public/brand-logos/company/kuro-en-black.png`
- `public/brand-logos/company/kuro-en-white.png`
- `public/brand-logos/wuthering-waves/ww-zh-cn.png`
- `public/brand-logos/wuthering-waves/ww-zh-tw-ja.png`
- `public/brand-logos/wuthering-waves/ww-en.png`
- `public/brand-logos/wuthering-waves/ww-ko.png`
- `src/core/brand/brandAsset.ts`
- `src/core/brand/brandStore.ts`
- `src/pages/App.tsx`
- `src/styles.css`
- `src/core/core.test.ts`
- `scripts/verify-core.ts`
- `TASKS.md`
- `CHANGELOG.md`
- `README.md`

主要改动：

1. [资源-中] 从公司 Logo 文件夹的“标识静态素材（优先统一使用）”接入 KURO 英文标识黑 / 白 PNG。
2. [资源-中] 从鸣潮 Logo 的 PNG 文件夹接入简中、繁中 / 日文、英文、韩文 PNG。
3. [架构-中] `BrandAsset` 支持 `svg` / `image` 两种来源，默认 PNG 与用户上传 SVG 共用同一套布局和选择逻辑。
4. [新需求-中] Logo 支持改色、简单描边、外发光、阴影。
5. [新需求-小] CPR 复用同一套视觉效果状态，可继续调颜色、描边、外发光、阴影。
6. [体验-小] Logo 资源列表标注 PNG / SVG、语种和尺寸信息。

验证方式：

- `npm run verify:core`：通过
- `npm test`：通过
- `npm run build`：通过

影响范围：

- 影响品牌资源类型、Logo 资源列表和预览图层样式。
- 不接入动态素材，不扫描用户文件夹，不依赖运行时外部路径。
- 运行时仍使用本地静态资源，不引入远程 API / CDN。

未完成 / 风险：

- 描边基于 CSS `drop-shadow` 近似，适合预览和简单描边；后续 Canvas 导出需要用 Canvas/SVG 渲染逻辑复现。
- 鸣潮白色 PNG 源文件是 1920x1080 画布，容易影响比例判断，本轮未作为默认资源接入。

下一步建议：

- 0.1.6 做 Canvas 单画板导出，并同步复现 Logo / CPR 样式效果。

## 0.1.4

本轮目标：把预览区从单画板查看改为全画板总览，同时保留单个画板配置权限。

修改文件：

- `package.json`
- `package-lock.json`
- `src/pages/App.tsx`
- `src/styles.css`
- `TASKS.md`
- `CHANGELOG.md`
- `README.md`

主要改动：

1. [体验-中] 中间预览区默认展示所有画板缩略预览，减少逐个点击检查的低效操作。
2. [体验-中] 每个画板卡片都显示当前素材裁切、安全区、Logo / CPR 预览状态。
3. [体验-小] 点击任一画板后同步右侧尺寸矩阵选中态，并进入该画板的单独配置上下文。
4. [架构-小] 继续复用 `BoardPreviewState`，裁切 / 缩放仍只作用于当前素材 x 当前画板，不做全局假状态。

验证方式：

- `npm run verify:core`：通过
- `npm test`：通过
- `npm run build`：通过

影响范围：

- 影响中间预览区交互和样式。
- 不影响图片上传、SVG 资源管理、尺寸解析和核心布局函数。

未完成 / 风险：

- 总览卡片数量很多时仍需要滚动浏览；后续可增加筛选、排序或异常标记。
- 目前单画板配置入口是“点击卡片后用底部裁切控件配置”，还未做右键菜单或批量套用裁切。

下一步建议：

- 0.1.5 进入 Canvas 单画板导出，并考虑增加“将当前裁切套用到同版型画板”。

## 0.1.3

本轮目标：把 Logo / CPR 从占位层推进到真实 SVG 资源预览，并支持语种切换。

修改文件：

- `package.json`
- `package-lock.json`
- `src/core/brand/brandAsset.ts`
- `src/core/brand/brandStore.ts`
- `src/core/brand/index.ts`
- `src/core/index.ts`
- `src/pages/App.tsx`
- `src/styles.css`
- `src/core/core.test.ts`
- `scripts/verify-core.ts`
- `README.md`
- `TASKS.md`
- `CHANGELOG.md`

主要改动：

1. [新需求-中] 新增 Brand 资源模块，建立 `BrandLanguage`、`BrandAsset`、`BrandLayerState`。
2. [新需求-中] 支持上传多个 Logo SVG / CPR SVG，并给资源绑定简中、繁中、日文、韩文、英文、自定义语种标签。
3. [体验-中] 左侧新增 Logo / CPR 资源区，可启用 / 关闭品牌层，可选择当前 Logo / CPR SVG。
4. [体验-小] CPR 支持颜色选择与投影预览；当前颜色通过 CSS mask 做单色预览，不修改 SVG 文本。
5. [架构-中] 预览区继续复用 `renderBrandLayer`、`logoLayout`、`cprLayout` 计算位置、大小、边距和版型适配。
6. [安全-中] SVG 预览拦截 `script`、`foreignObject`、远程链接、协议相对链接、`data:` 引用、外部 CSS 引用。
7. [验证-中] 扩充 core 测试，覆盖 SVG viewBox、语种资源、外链拦截。

验证方式：

- `npm run verify:core`：通过
- `npm test`：通过，16 tests
- `npm run build`：通过
- 使用本地 `.env` + opencode CLI 做只读审查；采纳并修复 SVG 外链拦截和 Object URL 生命周期问题

影响范围：

- 影响主工作台 UI、品牌资源状态、SVG 预览安全策略。
- 不影响旧 HTML，因为旧入口已删除。
- 不引入运行时联网、远程 API 或 CDN。

未完成 / 风险：

- 不做复杂 SVG 编辑器。
- 不修改 SVG 内容；CPR 单色预览会丢失多色 SVG 的原始颜色。
- Canvas 导出尚未实现，品牌层导出需要在 0.1.4 复用当前状态和布局。

下一步建议：

- 0.1.4 优先做 Canvas 单画板导出，再扩展批量导出。

## 0.1.2

本轮目标：让每个素材 x 每个画板拥有独立裁切状态，并且状态能服务后续 Canvas 导出。

修改文件：

- `src/core/image/fit.ts`
- `src/core/image/crop.ts`
- `src/core/image/index.ts`
- `src/pages/App.tsx`
- `src/styles.css`
- `src/core/core.test.ts`
- `scripts/verify-core.ts`
- `TASKS.md`
- `CHANGELOG.md`

主要改动：

1. [新需求-中] 新增 `CropState`、`BoardPreviewState`、`getBoardPreviewKey`，以 `assetId:specId` 保存独立预览状态。
2. [新需求-中] 支持拖动画面位置，拖动位移按画布像素换算回原始裁切状态。
3. [新需求-中] 支持缩放画面，缩放以画布中心为焦点计算。
4. [新需求-小] 支持重置裁切、填满画布、适应画布。
5. [架构-中] 抽离 `createInitialCropState`、`computeCropTransform`、`clampCropState`、`panCropState`、`zoomCropState`。
6. [验证-中] 补充 cover / contain、裁切 key、裁切缩放和平移测试。

验证方式：

- `npm run verify:core`：通过
- `npm test`：通过
- `npm run build`：通过

影响范围：

- 影响预览画布交互和预览状态结构。
- 为后续 Canvas 导出提供可复用的 scale / offsetX / offsetY。

未完成 / 风险：

- 暂无键盘微调和数值输入。
- 尚未接 Canvas 导出，导出一致性需要 0.1.4 验证。

下一步建议：

- 结合品牌层状态实现单画板 Canvas 导出。

## 0.1.1

本轮目标：接入图片上传、素材列表和基于尺寸矩阵的画板预览。

修改文件：

- `src/core/image/imageMeta.ts`
- `src/core/image/fit.ts`
- `src/core/image/index.ts`
- `src/core/index.ts`
- `src/pages/App.tsx`
- `src/styles.css`
- `src/core/core.test.ts`
- `scripts/verify-core.ts`
- `TASKS.md`
- `CHANGELOG.md`

主要改动：

1. [新需求-中] 支持上传一张或多张图片，读取本地图片宽高、文件名、文件大小、MIME 类型。
2. [体验-中] 左侧素材列表显示缩略图、文件名、原图尺寸和文件大小。
3. [体验-中] 点击素材后设为当前素材，点击画板后切换当前画板。
4. [体验-中] 中间画布按目标尺寸比例显示，图片默认按 cover 模式填入画布，不变形。
5. [体验-小] 显示安全区。
6. [体验-小] 右侧显示当前画板宽高、格式、landscape / square / portrait 版型识别。
7. [架构-中] 建立 `MaterialAsset`、`WorkbenchState`、基础 `BoardPreviewState`。
8. [维护-小] 使用 Object URL 本地预览图片，并在应用卸载时释放。

验证方式：

- `npm run verify:core`：通过
- `npm test`：通过
- `npm run build`：通过

影响范围：

- 影响主工作台页面和核心图片模块。
- 不写死用户素材，不恢复旧 assets。

未完成 / 风险：

- 图片上传未设置硬性大小上限，后续可加大图软提示。
- 尚未支持删除单个素材；增加删除后需要同步释放 Object URL。

下一步建议：

- 继续推进 0.1.2 裁切交互与状态持久。

## 0.1.0

1. [重构-大] 新增 Vite + React + TypeScript 新应用骨架：`package.json`、`package-lock.json`、`index.html`、`vite.config.ts`、`tsconfig*.json`、`src/main.tsx`、`src/pages/App.tsx`、`src/styles.css`。
2. [新需求-中] 新增 `src/core/layout/layoutProfile.ts`、`logoLayout.ts`、`cprLayout.ts`、`brandLayer.ts`：实现 aspect 版型识别、短边 shortSide + clamp 的 Logo / CPR 尺寸和边距计算、左上 / 右上 / 居中锚点，以及统一 `renderBrandLayer` 结果。
3. [新需求-中] 新增 `src/core/spec/specParser.ts` 与 `presetTemplates.ts`：支持尺寸片段解析，不做整份需求文档语义识别。
4. [新需求-中] 新增 `src/core/export/fileNaming.ts`：实现跨平台文件名清理与输出命名，保留中文与 Unicode 字符。
5. [重构-中] 新增 `src/platform/` 抽象层占位，0.1.x 暂不接 Tauri。
6. [体验-中] 新应用首页提供最小工作台壳。
7. [维护-中] 新增 `scripts/verify-core.ts` 与 `src/core/core.test.ts`。

## 0.1.19

1. [新需求-大] `src/components/ModuleNav.tsx`、`src/components/BrandAssetWorkspace.tsx`、`src/pages/App.tsx`：新增“自定义构图”工作区，可导入单张本地图片、独立摆放游戏 / 公司 Logo、切换游戏语种、使用参考线与网格吸附，并直接导出 PNG / JPG。
2. [新需求-中] `src/components/brand/BrandResourceManager.tsx`、`src/components/brand/BrandSettingsDialog.tsx`：把品牌资源管理收拢至设置弹窗，支持按语种替换游戏 Logo、替换当前选中的公司 Logo、选择资源与恢复内置资源。
3. [功能调整-中] `src/core/brand/brandTypes.ts`、`src/core/brand/brandDefaults.ts`、`src/core/brand/brandLayout.ts`、`src/components/brand/LogoGroupControls.tsx`：新增特大 Logo 尺寸与公司 Logo 视觉比例控制；修复“仅公司 Logo”模式忽略公司比例预设的问题。
4. [问题修复-中] `src/components/BrandAssetWorkspace.tsx`：自定义构图导出在叠加公司 Logo 后重新执行 PNG / JPG 8MB 限制校验，JPG 会自动降质压缩，避免绕过导出限制。
5. [维护-小] `src/core/core.test.ts`：补充公司 Logo 单独模式的视觉比例回归测试。

验证方式：

- `npm run verify:core`：通过
- `npm test`：通过，45 tests
- `npm run build`：通过
- `git diff --check`：通过

## 0.1.20

1. [问题修复-大] `src/core/brand/brandLayout.ts`、`src/core/brand/brandTypes.ts`、`src/components/brand/LogoGroupControls.tsx`、`src/pages/App.tsx`：预设大小与连续缩放解耦；所有 Logo 缩放均使用同一几何公式，聚焦编辑与设媒面板支持连续 Logo 缩放，不再在阈值处跳变。
2. [新需求-大] `src/pages/App.tsx`、`src/core/brand/brandLayout.ts`、`src/components/brand/CprControls.tsx`、`src/components/overview/*`：CPR 状态按 `assetId:specId` 保存，支持当前画板独立位置、自定义拖动、底部微调，并在总览、聚焦编辑与导出使用同一状态。
3. [新需求-中] `src/core/export/batchExport.ts`、`src/pages/App.tsx`：批量导出新增“全部语种分别导出”，输出矩阵扩展为素材 × 画板 × 语种，文件名带语种后缀且缺失资源会明确报错。
4. [新需求-中] `src/components/BrandAssetWorkspace.tsx`：自定义构图接入游戏 Logo、公司 Logo 与 CPR 的高级效果；替换图片时立即释放旧 Object URL，坐标输入只显示格式化数值。
5. [维护-中] `.github/workflows/preview-release.yml`、`src/components/WorkbenchHeader.tsx`：统一页面版本为 0.1.19 Preview 2，并移除 Preview 工作流中硬编码的版本号，发布资源名改从 tag 推导。
6. [维护-小] `src/core/core.test.ts`：补充连续缩放、CPR 自定义边界和多语种导出矩阵回归测试。

验证方式：

- `npm run verify:core`：通过
- `npm test`：通过，48 tests
- `npm run build`：通过
- `git diff --check`：通过

## 0.1.20.1 → 0.1.22

1. [问题修复-大] CPR 改用推荐位置 + 相对偏移：默认底边距为 0.5U、最低安全边距为 0.25U，支持当前画板拖动、微调与恢复推荐位置。
2. [问题修复-大] 全语言导出固定为简中、繁中、日文、韩文、英文五种；缺少任何语言资源会明确阻止全语言导出，预览与输出严格使用当前导出项语言。
3. [重构-大] 新增 `BoardBrandStateMap` 与显式迁移函数，画板 Logo / CPR 状态收口为同一记录；旧拆分映射仅用于兼容派生读取。
4. [重构-中] 新增 `src/services/export/`：导出矩阵、严格资源解析、单画板导出与顺序批处理具备独立服务边界。
5. [重构-中] 新增 `src/app/` 与 GIF 模块占位；应用外壳接管模块导航，工具栏收紧，版本不再作为首页标题内容。
6. [维护-中] package、Cargo、Tauri 配置统一升级至 0.1.22；补充 CPR 相对偏移、五语种矩阵和品牌状态迁移测试。

验证方式：

- `npm run verify:core`：通过
- `npm test`：通过，51 tests
- `npm run build`：通过
- `git diff --check`：通过

自动更新保持未接入；后续 0.1.23 将基于已冻结的导出服务、画板品牌状态和公开二进制分发仓库实现。

## 0.1.23

1. [重构-大] 新增 `modules/media-workbench/boardBrandReducer.ts`；`boardBrandStates` 成为画板 Logo / CPR 状态的唯一可写入口，删除拆分 Map 的组件传递。
2. [重构-大] 将批量导出对话框移入 `modules/media-workbench/BatchExportDialog.tsx`，UI 不再包含导出循环；既有 `services/export` 边界保持不变。
3. [重构-中] 将设媒与自定义工作台迁移至 `modules/media-workbench`、`modules/custom-workbench`，`app/App.tsx` 缩减为模块组合入口。
4. [重构-中] 新增 `AppActivity`，汇总导出、聚焦编辑、设置和确认弹窗活动状态，作为后续 updater 安装守卫的只读基础。
5. [维护-中] 删除未调用的拆分 Map 初始化兼容代码，新增 `REFACTOR_FINDINGS.md`，并统一 package、Cargo、Tauri 版本为 0.1.23。

验证方式：

- `npm run verify:core`：通过
- `npm test -- --run`：通过，51 tests
- `npx tsc --noEmit -p tsconfig.app.json`：通过
- `npm run build`：通过
- `git diff --check`：通过

## 0.1.24

1. [重构-大] `boardBrandReducer` 新增增量 reconcile，保留现有画板品牌状态、初始化新画板、移除失效画板，并深拷贝可变嵌套状态；默认设置不再通过全量 replace 覆盖已有画板。
2. [重构-大] 画板品牌状态继续收口，预览、聚焦编辑与导出直接使用 `BoardBrandStateMap`。
3. [重构-大] 批量导出循环、逐项失败继续执行、进度和结构化信息结果进入 `services/export/exportBatch.ts`；对话框只保留导出 UI 与触发逻辑。
4. [重构-中] 新增媒体工作台 actions/selectors，继续按状态所有权拆分；AppActivity 聚合真实 exporting、编辑器和弹窗活动状态。
5. [维护-中] Cargo.lock 应用版本与 package、Cargo、Tauri 配置统一为 0.1.24；未接入更新器、未改变产品行为。
6. [重构-大] 完成收尾验收：移除运行期 `logoGroup` / `brandLayer.cprState` 双写，拆出 FocusEditor、确认弹窗、品牌控制、素材事件、规格事件和工作台状态 hook；MediaWorkbench 收敛为工作区组合层。
7. [重构-中] `useBatchExportController` 成为批量导出的唯一 UI 入口；新增 reducer、导出顺序/失败继续/结构化结果、单语/五语言矩阵、状态隔离与真实 activity 来源测试。
8. [重构-大] Goal 1：新增 `AppRuntimeProvider`，App 根层拥有模块切换、品牌资源、全局设置和 AppActivity；`AppShell` 只组合模块，MediaWorkbench 不再渲染自定义、GIF 或应用外壳。
9. [重构-中] Goal 1.1：新增 `GlobalDialogs`，设置弹层、品牌资源替换 / 恢复和 SVG 上传入口迁移至根层；根层直接聚合 settings activity，设媒仅汇报导出、聚焦和确认状态。
10. [验证-中] 根层集成与 AppActivity 聚合测试覆盖模块导航、全局设置入口以及 Custom、Focus、Export、Settings、确认弹窗的活动状态组合；当前专项共 63 项测试通过。
11. [重构-中] Goal 2：固定 `html/body/#root`、App 外壳与模块容器为桌面 `100dvh` 框架；顶栏统一为 48px、模块栏为 56px，各模块及三栏面板改为内部滚动并启用 `scrollbar-gutter: stable`，消除模块切换造成的外框高度抖动。
