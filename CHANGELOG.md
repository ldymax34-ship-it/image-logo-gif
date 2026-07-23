# 更新日志

## 2026-07-23｜Stage 5A｜品宣工具箱启动器

### 修改文件
- `docs/references/AI开发规则推荐默认规则文件.md`
- `AGENTS.md`、`TASKS.md`、`README.md`、`docs/TOOLBOX_EXECUTION_PLAN.md`
- `src/app/`、`src/components/ModuleNav.tsx`、`src/modules/media-workbench/MediaWorkbench.tsx`、`src/styles/components.css`

### 主要改动
- 新增应用级品宣工具箱入口；Logo 与版式保持使用现有工作台，GIF / 媒体工具和水印与追溯只显示“暂不可用 / 即将开放”。
- 当前工作台顶部新增“返回工具箱”；工作台在入口切换时保持挂载，原有内存状态、模块导航、Render Plan、导出、同步、Fabric 和更新链路均未变更。
- 设置入口提供轻量应用级说明表面；未写入品牌设置、画板或未保存任务，启动偏好留待 Stage 5B。
- 固定用户提供的默认规则原文到 `docs/references/`，将适用的范围、依赖、文档和冲突优先级规则并入根目录权威文件。旧 Stage 5 No-Go 审计保留为历史记录，正式路线调整为 5A 工具箱、5B 启动偏好、6 FFUI 隔离 PoC。

### 验证方式
- `git diff --check`、`npm run verify:core`、`npm test -- --run`（255 tests / 34 files）、`npm run build`、`cargo fmt --check` / `cargo check` / `cargo test`（9 passed）通过。
- 浏览器开发环境在 1440×900、1100×720 下检查工具箱、Logo 与版式、返回路径和设置路径：无横向溢出，未完成入口禁用。截图只保存于 `/private/tmp/brand-material-workbench-stage5a/`。

### 影响范围
- 仅应用级入口与文档；不改变现有工作台内部模块、Render Plan、导出、同步、Fabric、自动更新或发布链路。

### 未完成 / 风险
- macOS/Windows 原生 Tauri 的初始工具箱、返回动作、系统字体和键盘焦点仍需人工实机验证；浏览器检查不能替代该项。Stage 5B 尚未开始。

### 下一步建议
- 完成 Stage 5B 的版本化启动偏好、失效数据回退与独立门禁；不开始 Stage 6。

## 0.1.33（自定义构图原图画布、裁切与几何缩放）

1. [体验-大] 自定义构图默认画布改为“原图尺寸（跟随底图）”：首次导入、替换横图/竖图/方图时保持底图自然像素尺寸与比例；`1920×1080` 改为用户主动选择的手动规格，切换回原图尺寸立即恢复当前底图尺寸。
2. [兼容-中] 缺少尺寸模式的旧自定义构图状态安全迁移为“原图尺寸”；只有明确保存的手动规格才保留手动意图，避免旧的隐式 `1920×1080` 继续锁定新任务。
3. [体验-大] 自定义构图恢复底图“适合画布 / 填满画布”、拖动调整、等比素材缩放与裁切复位；复用现有 `createInitialCropState`、`panCropState`、`zoomCropState` 和 `BoardCanvas`/Render Plan 路径，底图不进入 Fabric。
4. [修复-大] 游戏 Logo、公司 Logo、CPR 移除固定倍率上限；四角拖拽与数值精调共用画布几何约束，允许对象在保持等比、完整位于画布内的前提下放大到边缘，角落放大时会自动重约束位置。
5. [一致性-高] 尺寸模式、裁切、Fabric 交互层、Render Plan 和正式导出统一使用同一 `MaterialSpec`；切换尺寸或替换底图后，三个固定对象重新约束到新画布内。配色模式和正式渲染/导出边界保持不变。
6. [测试-中] 新增原图/手动尺寸、旧状态迁移、横竖方画布、共享裁切、全局几何缩放与角落放大回归；总测试数 201 → 214（29 files）。
7. [发布-中] 2026-07-22 完成 macOS Apple Silicon 隔离 `0.1.29 → 0.1.33` updater E2E（检查、下载、签名校验、安装、重启、版本核验），随后正式 Preview 双平台工作流 `29930982002` 成功发布 macOS arm64 与 Windows x64 的 `0.1.33` 签名产物及双平台 manifest。CNB 优先清单镜像可匿名读取，继续保持 GitHub 签名资产回退；交互式 macOS/Windows 核心功能和导出目视回归仍为发布后人工待办。
8. [体验-大] 聚焦画板查看视口改为真实倍率模型：适合窗口完整居中且随容器变化重新适配；实际尺寸 `100%` 不再与适合窗口混用；缩小画板自动居中，放大平移保留最小可见区域。
9. [体验-中] 聚焦右栏新增紧凑的“适合 / 100% / 定位”查看命令；定位 Logo 仅改变本地 `ViewportState`，不写入 Logo 业务坐标、Render Plan 或导出结果。滚轮围绕指针缩放，连续事件以舞台中心与最新 viewport 计算，避免旧倍率造成漂移。
10. [体验-小] 聚焦提示栏改为固定三行布局的一部分，1440×900 与 1100×720 下均保持可见；CPR 配色控件改为四等列单行，原色/白色/黑色/自定义不再逐字换行。
11. [测试-中] 扩展 `focusCoords.test.ts`：适合/100% 分离、缩小重居中、平移边界、Logo 视口定位、连续缩放与合并滚轮事件；`CprControls.test.ts` 约束专属四列配色组。当前全量测试为 220 tests / 29 files。
12. [边界-中] 本轮没有修改 Fabric 固定对象交互、同步、Render Plan 或正式导出；原生 Tauri 下的横/竖/方交互与预览/导出像素一致性仍需人工复核。
13. [UI-中] 以 OpenPencil 的属性面板规则收口现有 Logo/CPR、聚焦右栏与自定义构图控件：属性行统一 32px 高、12px 标签、低对比 surface 层级；active 同时使用边框、背景与文本，不只依赖颜色。
14. [UI-中] 聚焦选择框移除微光，改为干净的主色 1px 描边与低强调标签；Fabric 固定对象选框改为白底、主色边框、10px 方形控制点，保留现有四角等比缩放与命中逻辑。
15. [UI-小] 缩短 Logo/CPR 面板的重复说明，将完整含义放入可访问 tooltip；没有采用 Dashboard 卡片化、玻璃模糊、金青光晕、发光文字或大范围阴影。
16. [测试-中] 扩展 `customFabricState.test.ts` 和 `uiPolish.test.tsx`，锁定选框样式参数及属性提示 tooltip；总测试数 `220 → 222`（29 files）。浏览器开发环境已检查 1440×900、1100×720；原生 Tauri/WebView 的高 DPI 视觉效果仍待人工验证。
17. [体验-中] 自定义构图增加“自定义尺寸”选项，可在宽、高均为有效整数后保存任意画布规格；显式自定义尺寸在更换底图后保持，只有切换“原图尺寸（跟随底图）”才恢复随底图尺寸变化。预览、Fabric、Render Plan 与导出继续共用同一规格解析。
18. [体验-中] 自定义构图的 PNG/JPG 与“导出当前画板”移至固定标题行；无图片时禁用，导出状态/错误显示在同一区域，1440×900 与 1100×720 均无需滚动即可访问。
19. [修复-中] 自定义构图的游戏 Logo、公司 Logo、CPR 高级样式只保留一个展开层；效果摘要与控件同属一个 summary/disclosure，首次点击即可显示实际控件，不再生成嵌套 `<details>`。
20. [测试-中] 扩展自定义画布纯函数与新增自定义工作区静态 DOM 回归，覆盖任意尺寸、无效输入、替换底图、Render Plan/Fabric 一致性、导出入口、三类高级样式和无嵌套 disclosure；全量测试由 `222` 增至 `234`（30 files）。浏览器开发环境另核对 1440×900、1100×720 布局。原生 Tauri 文件选择、保存与公司 Logo 资源仍需人工复核。
21. [路线-中] 固定 `docs/TOOLBOX_EXECUTION_PLAN.md` 作为后续工具箱执行路线，继续沿用可行性审核中的架构边界、状态隔离、双平台验证与第三方声明要求；停止 Shutter Encoder / ScreenToGif，媒体能力改为筛选可嵌入的成熟 FFmpeg GUI 与单一 FFmpeg sidecar。
22. [参考-小] 将用户提供的 OpenDesign HTML 固定保存到 `docs/references/Social-Media-Dashboard.html`；UI 阶段只参考深色层级和留白，明确排除大范围辉光、重模糊和展示型 Dashboard 卡片。
23. [维护-中] `AGENTS.md`、包体审计与交互审查规则统一改为记录各平台真实增量；Windows 离线 WebView2 约 200MB 作为已接受固定基线，不再使用统一 10MB 自动停止线，异常增长和重复运行时仍为阻断项。
24. [证据-中] 以同一测试素材和状态建立 `artifacts/ui-rule-unification/before/`：总览/聚焦各含 1440×900、1100×720，自定义构图含 1440×900。阶段 1 完整门禁通过：234 tests / 30 files，Rust 9 tests；浏览器截图不替代 Tauri 双平台实机验证。
25. [UI-中] 统一 0.1.33 的设计工具规则：正文/标签/标题、32px 常规控件与 28px 紧凑控件、属性行、深色 surface、选中/焦点/禁用/错误状态均收敛到同一 CSS token 契约；保持现有三栏结构和模块导航，不引入卡片化、玻璃模糊、渐变或默认 glow。
26. [UI-中] 总览、聚焦与自定义构图减少重复边框和工程说明；短提示直接保留，完整解释通过可访问 `title` 提供。聚焦与 Fabric 选框维持清晰主色 1px 描边和 10px 方形控制点，未改变命中、拖动、缩放或状态写回。
27. [验证-中] 以与 before 相同的测试素材和状态生成 `artifacts/ui-rule-unification/after/`：总览/聚焦各含 1440×900、1100×720，自定义构图含 1440×900（另附 1100×720 响应式检查）。浏览器检查无横向溢出；完整门禁通过：239 tests / 31 files、Rust 9 tests。浏览器证据不替代 macOS/Windows Tauri 高 DPI 与系统控件实机验证。
28. [包体-小] 前端 `dist` 为 1,172 KB，相较 Fabric 阶段记录的约 1,140 KB 增加约 32 KB，主要来自 CSS/JS 文本；本阶段未构建新的 Windows/macOS 安装包，安装包增量仍待平台审计。
29. [交互-大] 社媒聚焦画板的 Logo 组合增加透明 Fabric 操作层：点击选中、拖动、四角等比缩放与现有安全区/画布边界约束。操作只写入当前草稿的 Logo 自定义位置和连续缩放；CPR、旋转、多选、图层、复制和删除均不在范围内。
30. [一致性-高] Focus Fabric 对象始终由当前 Render Plan 的 `logoGroupRect` 驱动；手势冻结起始几何，防止 React 重渲染造成连续缩放累积。正式预览和导出继续仅消费 `BoardCanvas + Render Plan`，Fabric 不负责颜色或导出。
31. [测试-中] 新增 Focus Logo Fabric 几何与草稿/正式 Render Plan 回归，覆盖 25%/100%/300% 查看倍率、横方竖边界、资源/语种切换、缩放 baseline 与保存前草稿隔离；全量测试 `239 → 251`（32 files），Rust 9 tests 通过。浏览器开发环境确认选框与拖动；macOS/Windows Tauri 实机仍待复核。
32. [维护-中] Focus 与自定义构图共享画布基础能力：适合窗口、实际倍率、指针缩放、平移边界、Canvas/Fabric 坐标换算、手势 baseline、选框和控制点主题收敛到 `components/canvas` 纯模块。两处业务状态、同步和导出模型保持隔离。
33. [测试-小] 新增共享交互基础回归，验证两个编辑器使用同一 Fabric 选择 token、stage 缩放数学与高 DPI 逻辑坐标；全量测试 `251 → 254`（33 files），Rust 9 tests 通过。
34. [路线-中] 完成可嵌入 FFmpeg GUI 的源码与许可证筛选；没有候选可同时满足当前 React/Tauri 可嵌入性、可靠批量取消、单一离线 sidecar和无需首次联网下载的条件。因此没有接入 GIF/媒体处理、FFmpeg、Python 或 WASM 运行时，后续媒体阶段保持停止。

## 0.1.32（默认横版规格名称精简）

1. [体验-小] `src/core/spec/presetTemplates.ts`：“横版投放”内置套组的三个名称精简为 `1920x1080`、`2560x1097`、`1600x1200`；套用后草稿中每行也只显示尺寸，不再附加比例、基准宽度前缀或 JPG 文字。
2. [兼容-小] 规格宽高、JPG 格式与稳定套组 ID 保持不变；未改动导出和自动更新架构。
3. [修复-大] `src/core/brand/brandDefaults.ts`：新增 `resolveColorEffect(colorMode, effect)`、`deriveBrandColorMode(effect)` 与运行时模式校验，统一配色解析；`BrandColorMode` 扩展为 `white / black / original / custom` 四种。旧 JSON 缺失或非法 `colorMode` 时按 effect 推导，非黑白自定义色正确解析为 `custom`。Logo 与 CPR 共用同一解析入口，禁止各写一套分支。
4. [修复-大] `src/core/brand/brandLayout.ts`：`buildBrandRenderPlan` 对 Logo 和 CPR 均使用 `resolveColorEffect` 产生最终 `BrandEffectState`；`buildCprItem` 不再二次覆盖颜色。
5. [修复-大] `src/core/image/exportImage.ts`：`buildBoardRenderPlan` 不再手动覆盖 `colorEnabled`/`color`，改为传递原始 effect 给 `buildBrandRenderPlan` 解析；Logo 层消费 `item.effect`，CPR 层消费 `grouped.cpr.effect`；旧路径（无 logoGroup）也改用 `resolveColorEffect`。
6. [体验-中] `LogoGroupControls`、`CprControls`：配色选项增加"自定义"；选择后显示颜色选择器并直接更新 `effect.color`；切换原色/白色/黑色只改变模式，不丢失已保存的自定义色；`BrandEffectControls` 新增 `hideColorControls` prop，Logo/CPR 不再重复显示"改色"开关和颜色输入（描边、发光、阴影保留）。
7. [修复-中] `BrandControlsPanel`：Logo 单项样式预览改为使用按当前 `colorMode` 解析后的最终 effect，白色/原色/自定义预览与画布 Render Plan 一致。
8. [兼容-中] `CustomWorkbench`：Logo 组和 CPR 的 `colorMode` 从硬编码 `'white'` 改为 `deriveBrandColorMode(effect)` 动态推导，保留其 BrandEffectControls 独立改色能力。
9. [测试-中] 新增 `src/core/brand/colorResolve.test.ts`（22 tests）与 `CprControls.test.ts`（3 tests），并扩展 `uiPolish.test.tsx`：覆盖四模式、缺失 `colorMode` 的旧 JSON、CPR 自定义色往返、Logo 样式预览与 Render Plan 一致性，以及 Logo/CPR 统一的“原色/白色/黑色/自定义”选项顺序；总测试数 153 → 181（新增 28 tests）。
10. [测试-小] 增加内置横版规格的名称与 JPG 格式回归测试，并将应用版本统一更新为 0.1.32。
11. [交互-大] 自定义构图接入本地 `fabric@7.4.0`（MIT）透明交互层：仅支持游戏 Logo、公司 Logo、CPR 的选中、拖动、四角等比缩放与画布边界约束；移除手写 Pointer 拖动与固定 `128×80` 命中框，命中 bounds 改由实际 Render Plan layer.rect 提供。
12. [交互-中] 自定义构图属性区收为当前选中对象：保留显示、语种（游戏 Logo）、X/Y/缩放数值精调、复位和既有高级样式；CPR 增加独立 offset / scale、拖动、缩放和复位。
13. [边界-高] Fabric 不负责最终视觉、改色/描边/发光/阴影或导出；正式预览与导出继续使用 `BoardCanvas`、Render Plan 与既有 Canvas 导出流程。旋转、多选、图层、文字、额外图片、复制粘贴、工程文件等仍未实现。
14. [维护-中] 完成 Fabric 接入前后前端包体审计：`dist` 856 KB → 1,140 KB（约 +284 KB），Fabric 动态 chunk 282.9 KB（gzip 88.8 KB）；历史 macOS 0.1.19 产物不可作为 0.1.32 发布包体结论，双平台正式产物待发布前实机审计。
15. [稳定性-高] Fabric 手势在 `before:transform` 冻结完整 Render Plan baseline，缩放中即使 React 已更新 rect/scale，后续事件仍按手势起点计算；固定对象会随资源或语种变化增删和更新 bounds，隐藏仅释放选框而不丢失状态。
16. [边界-中] 自定义构图 X/Y 数值显示实际 Render Plan 坐标，并与 Fabric 共用按实际尺寸计算的画布边界约束；CPR 新增兼容边界模式，标准画板保持安全边距，只有自定义构图可贴画布边但不越界。
17. [兼容-中] Fabric 动态加载失败会显示非阻塞提示，正式预览和导出仍继续使用 Render Plan；不依赖 Fabric 导出。
18. [测试-中] 扩展 Fabric 纯函数/状态测试，覆盖缩放 baseline、reconcile 增删/隐藏、资源 rect 替换、数值右下边界和 CPR 安全区/画布边界；总测试数 181 → 201（新增 20 tests）。

## 0.1.31（画板状态、同步与正式导出模型收口）

### 导出模型
1. [重构-大] `src/services/export/exportJob.ts`：建立不可变 ExportJob 模型，默认导出按每画板自身已保存语种展开；追加/全语言模式也在每画板自身语种基础上展开并去重。
2. [问题修复-大] `src/modules/media-workbench/BatchExportDialog.tsx`：修复“当前画板 baseLanguage 覆盖全部画板”问题；requestedLanguage 与 resolvedLogoLanguage 不一致或缺资源时阻止导出，不再静默回退。
3. [功能调整-中] `src/core/export/fileNaming.ts`：默认文件名改为 `源图片名_ja_300x300.png`；新增源图片名 / 自定义名称模式、disambiguation 避让；语言码只在 Logo 有实际语种含义时输出。
4. [体验-中] `src/services/export/exportBatch.ts`：导出结果通过 `BatchItemOutcome.actualFileName` 记录平台实际落盘名称，UI 从 outcome 读取展示，不写回不可变 ExportJob。

### 同步引擎
5. [重构-大] `src/modules/media-workbench/syncScope.ts`：抽出纯目标解析函数；“同尺寸”改为按 width×height 匹配，忽略格式与 specId；“同素材”保持当前素材的其他尺寸。
6. [重构-大] `src/modules/media-workbench/boardBrandReducer.ts`：新增单一原子 dispatch `sync-logo-scope` / `sync-cpr-scope`，一次完成来源与目标写入。
7. [新需求-中] `src/modules/media-workbench/mediaWorkbenchActions.ts`：新增 `applyCropScope`，支持“同素材·同尺寸”裁切同步，仅复制 fitMode 与 crop 快照。
8. [体验-中] `src/modules/media-workbench/MediaWorkbench.tsx`：同步确认前冻结目标集合，提示真实 applied / missing 数；Logo 同步覆盖组合/位置/大小/边界模式/显示/效果，CPR 同步覆盖开关/位置/偏移/大小/颜色/效果。

### Logo 极限构图边界
9. [重构-大] `src/core/brand/brandLayout.ts`：统一安全区与画布边界为 `getLogoPlacementBounds`；`placeGroup` 按 constraintMode 约束自定义位置。
10. [修复-中] `src/components/canvas/BoardCanvas.tsx`、`src/components/canvas/BrandOverlay.tsx`：删除 CSS 8% 旧安全区入口，改从 `plan.safeArea`（核心 1U）统一渲染，消除双框。
11. [修复-大] `src/modules/media-workbench/FocusWorkspace.tsx`、`src/modules/media-workbench/focusCoords.ts`：抽出可测试坐标纯函数，修复 pan/zoom 坐标系问题；采用 BoardCanvas 自身 rect（含 place-items:center 居中偏移），不再以 stage-frame 左上角为画布原点。
12. [修复-中] `src/services/export/exportJob.ts`：多素材不同自定义名不再追加源图名；仅真实冲突时追加 `_2`、`_3` 确定性避让。
13. [修复-中] `src/services/export/exportJob.ts`：Logo 关闭或 company-only 时 append/all 收敛为每画板一个任务，文件名不带语言码。
14. [修复-中] `src/services/export/exportJob.ts`、`exportBatch.ts`：ExportJob 删除可写 `actualFileName`，移入 `BatchItemOutcome`；`exportMediaBatch` 不再修改输入 job。
15. [修复-大] `src/modules/media-workbench/syncScope.ts`、`boardBrandReducer.ts`：resolveCropSyncScope 改用 previewStates 判断初始化；same-asset 跨尺寸同步 Logo/CPR 自定义位置按归一化映射，保持相对构图一致并满足各自边界。
16. [文档-中] TASKS/CHANGELOG/README 修正：当前实际支持 5 种语言（zh-CN/zh-TW/ja-JP/ko-KR/en-US），德/法/西/泰/葡仅命名码映射；删除未使用变量 `requestedGameLogo`。
17. [新需求-中] `src/core/brand/brandTypes.ts`、`src/core/brand/brandDefaults.ts`：LogoGroupState 新增 `constraintMode`（safe-area / canvas），旧数据默认 safe-area。
18. [体验-中] `src/components/brand/LogoGroupControls.tsx`：自定义位置时显示位置边界切换（安全区内 / 画布内）。
19. [体验-中] `src/modules/media-workbench/FocusWorkspace.tsx`：聚焦选择框旁显示当前位置边界；支持方向键 1px、Shift+方向键 10px 微调 Logo。

### 聚焦视图滚轮缩放与平移
20. [新需求-大] `src/modules/media-workbench/FocusWorkspace.tsx`：新增 ViewportState，支持滚轮围绕指针缩放、Space+左键/中键拖动平移；视口状态不影响 BoardDocument dirty。
21. [新需求-中] `src/core/brand/brandDefaults.ts`、`src/components/brand/BrandSettingsDialog.tsx`：设置中新增“聚焦滚轮缩放灵敏度”选项（低/标准/高）。
22. [体验-中] `src/components/canvas/BoardCanvas.tsx`：传递 onWheel 事件以支持聚焦滚轮缩放。

### 工程与文档
23. [维护-中] `AGENTS.md`：清理失效的 .env/模型调度规则，明确本仓库不再依赖外部模型或远程 API。
24. [维护-中] `TASKS.md`、`CHANGELOG.md`、`README.md`：同步本轮产品与行为变更。
25. [维护-小] `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`：版本统一为 0.1.31。
26. [测试-中] 新增 `focusCoords.test.ts`（9 tests，含居中布局模拟）、exportJob 命名/语言收敛/不可变测试（7 tests）、syncScope 归一化/文案测试（8 tests）；总测试数 122 → 146。
27. [测试-中] 新增 `uiPolish.test.tsx`（6 tests：聚焦操作提示文案、Logo/CPR 独立 section、用户可见文案无品牌/品宣）；总测试数 146 → 152。

### UI 收口（发布前轻量优化）
28. [体验-中] `FocusWorkspace.tsx`：聚焦标题与操作按钮之间新增单行低强调度操作提示栏（32–40px），随当前工具（裁切/Logo/CPR）动态切换文案，容器尺寸固定不抖动；左侧小型线性 SVG 帮助图标，`aria-hidden`；提示容器 `aria-label="聚焦操作提示"`。
29. [体验-中] `BrandControlsPanel`：Logo 与 CPR 改为同级独立 section 卡片（轻微背景差 + 1px 低对比边线 + 4px 圆角），区块间 14px 间距、区块内 8px gap、10–12px 内边距；不使用大阴影或嵌套卡片堆叠。
30. [文案-中] 全量清理用户可见文案中的"品牌"/"品宣"：BrandPanel aria-label 改为"Logo 与 CPR 设置"；CPR 描述改为"固定 SVG 图层"；资源管理器标题改为"Logo 资源"；设置弹窗标题改为"Logo 设置"；网格开关改为"构图网格"；同步提示、删除确认和聚焦说明统一使用 Logo/CPR 直接名称。仅保留软件标题"品宣物料工作台"。仅修改面向用户文字，不重命名 Brand* 类型、变量或领域模型。
## 0.1.30 (UI 收口 + CNB 桥接)

1. [UI-中] 正式化模块导航、状态点、功能区层级、设置分类和自定义构图空状态，并补齐全局键盘焦点反馈。
2. [交互-中] 聚焦工作区增加 25%～300% 查看倍率、加减按钮与适合窗口入口；只放大合成画板视图，不修改裁切、Logo、CPR 或导出结果。
3. [验证-中] CPR 换色、位置、描边、阴影与外发光进入共享 Render Plan 回归，普通预览、聚焦预览和导出继续复用同一参数来源。
4. [更新-高] 客户端更新端点改为已验证的 CNB Preview 清单优先、GitHub Preview 清单回退；0.1.30 本身仍由 GitHub 完整交付，0.1.31 才首次验证 CNB updater 包下载。
5. [发布-高] Preview 发布采用 macOS 候选先行门禁：Mac 完成真实 0.1.29 → 0.1.30 更新后，才允许 Windows 进入公共 Preview 清单。

## 0.1.29
## 0.1.29 (UI 正式化 + CNB 镜像准备)

### UI 正式化

1. [UI-大] 模块导航改为 72px 固定宽，带语义状态点（蓝=激活/灰=就绪/黄=警告/红=错误），切换模块不改变布局尺寸。
2. [UI-中] SectionHeader 使用 data-section-state 驱动状态点颜色，Logo/CPR 启用时点为蓝色，不依赖 focus-within。
3. [UI-大] 设置弹窗改为 5 个 tab 分类：常规、品牌与语种、CPR与辅助、更新、诊断。切换 tab 不改变弹窗尺寸，底部固定保存栏。
4. [UI-中] 自定义工作台：未导入图片时仅显示模块说明和导入按钮；导入后按五个 section 组织控制项。
5. [UI-小] 缩放显示为 1.00× 格式，坐标显示整数或一位小数；高级样式显示轻量摘要。
6. [UI-中] 消除设置和自定义面板的横向滚动条与内容宽度溢出。
7. [UI-小] prefers-reduced-motion 禁用所有 CSS 过渡动画。

### CNB 国内更新镜像

8. [维护-中] 创建 CNB 镜像方案文档 `docs/CNB_MIRROR_PLAN.md`，定义多 endpoint 回退行为、验收标准和外部信息清单。
9. [维护-中] 创建 CNB 镜像发布脚本 `scripts/cnb-mirror-release.sh`，支持资产同步和 manifest URL 替换。
10. [维护-小] 确认 Tauri Updater v2 按 endpoints 数组顺序回退，不产生并发请求。


1. [更新-高] 自动检查、手动检查、下载和安装统一由 single-flight coordinator 管理；重复点击和并发入口复用同一任务，不再产生重复下载或安装调用。
2. [更新-中] 下载窗口关闭后明确转入后台，任务与进度由 Provider 持有；失败重试先释放旧 updater handle，并以 `UPD_*` 错误码标记检查、清单、下载、签名和安装阶段。
3. [诊断-高] 新增本地轮转日志、Rust panic、前端未处理异常、React Error Boundary、异常退出标记、诊断摘要与脱敏 ZIP 导出；诊断数据默认只保存在本机，不自动上传。
4. [问题修复-中] 手动检查没有新版本时显示“已是最新版”和明确关闭按钮；启动后台检查失败保持静默降级，同时写入本地诊断日志。
5. [验证-中] macOS arm64 已完成本地 `.app` 启动、日志目录、诊断导出、正常退出、强制终止后提示和最新版检查实测；Windows x64 需在签名产物发布后继续实机回归。

## 0.1.28

1. [更新-高] 修复 Windows Preview 下载进度文本因百分比、KB/MB 位数和高频事件触发的视觉抖动：数值区域改为固定宽度等宽数字，进度展示轻量节流且始终保留最终完成状态。
2. [更新-高] 下载与安装失败按检查、下载、安装阶段给出非敏感诊断；重试会释放旧 updater handle 并重新检查，不复用旧下载资源。
3. [更新-高] 修复安装二次确认的首次点击未立即执行问题；确认按钮单击即同步锁定，快速重复点击只允许一次 install/relaunch，失败后可安全重试。
4. [验证-中] macOS arm64 的 `0.1.26 → 0.1.27` 实机升级已完成；Windows x64 的 `0.1.28` 修复版实机回归待验证。

## 0.1.27

1. [更新-大] 接入 Tauri 官方 Updater 与 Process 插件；仅读取 Preview `latest-preview.json`，公钥固定在 Tauri 配置，私钥仅存 GitHub Actions Secrets。
2. [更新-中] 新增提示式更新检查、下载、失败重试、安装二次确认与 AppActivity 门禁；Web 开发模式不加载 Tauri Updater。
3. [发布-中] Preview 工作流构建 darwin-aarch64 与 windows-x86_64 的签名 updater artifacts，并生成/校验双平台 `latest-preview.json`。
4. [发布-中] 正式 Preview 已发布到独立公开二进制仓库固定 `preview` Release；清单只含 macOS arm64 与 Windows x64，签名字段使用实际 `.sig` 内容。
5. [验证-中] macOS arm64 已完成 `0.1.26 → 0.1.27` 实机升级；Windows x64 已完成 CI 签名构建，并提供明确标识的 `0.1.26` 测试基线安装包，实机升级待验证。


## 0.1.25 补充收口

本轮目标：补齐 Windows 共享盘测试入口、画板同步确认和多语种 Logo 视觉尺寸规则。

主要改动：

1. [Windows-中] 新增 `start-windows-preview.bat`，共享盘源码会同步到 Windows 本机缓存后启动，避免 UNC 路径和跨平台 `node_modules` 干扰。
2. [交互-中] 修正当前操作区状态点，同尺寸 / 同素材按钮增加低面积强调色，同步前会明确确认受影响画板与覆盖内容。
3. [Logo-高] 品牌设置新增简中、繁中、英文、日文、韩文独立 Logo 视觉倍率；切换与多语种导出会保留画板手动缩放并应用语种校正。
4. [自定义-中] 自定义构图中游戏 Logo 和公司 Logo 最大缩放放宽到 3 倍。
5. [导出-中] 文件名语言后缀统一为 `zh / tw / en / ja / ko / de / fr / es / th / PT`。

验证方式：

- `npm run verify:core`
- `npm test`：76 tests passed
- `npm run build`
- 浏览器检查设置弹窗无横向溢出，自定义 Logo 数值上限为 3，控制台无警告 / 错误

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

## 0.1.25

5. [修复-高] 聚焦会话在模块切换时由根层导航守卫处理：无修改自动关闭，有未保存修改时提供保存 / 放弃 / 取消；非设媒模块不会再渲染 FocusWorkspace。
6. [体验-中] 聚焦左侧恢复同尺寸 / 同素材应用范围，直接使用 focus draft；应用后仅重建对应 Logo 或 CPR 小节基线，其他草稿继续保留。


1. [体验-大] Goal 8：聚焦画布支持图片 / Logo / CPR 直接命中、拖动、对象选中框与拖动反馈；右侧仅在裁切时显示裁切参数与复位。
2. [体验-大] 画板品牌状态新增 Logo 显示与高级效果，缩略图、聚焦和导出使用相同画板状态；同尺寸 / 同素材批量应用同步复制位置、大小、显示状态和效果。
3. [导出-中] 当前画板语种锁定为基础语种，追加语种支持单选、全选、清空且去重；超限项目才显示警告，JPG 明示压缩目标。
4. [维护-中] 清理聚焦测试结构，补充画布命中、作用域效果、连续缩放回归；package、Cargo、Cargo.lock、Tauri 版本统一为 0.1.25。

## 0.1.24

1. [重构-大] `boardBrandReducer` 新增增量 reconcile，保留现有画板品牌状态引用、初始化新画板时深拷贝可变嵌套状态、移除失效画板；默认设置不再通过全量 replace 覆盖已有画板。
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
12. [体验-中] Goal 3：新增语义状态 token 与 `SectionHeader`；圆点区分空闲、当前编辑、警告和禁用，启用状态仍由 Toggle 文案表达，状态变化使用既有 180ms 动效且不只依赖颜色。
13. [重构-大] Goal 4：新增 `resolveBoardBrandAssets`，总览缩略图、聚焦画布、批量导出预览与实际导出均按画板状态 / 显式语言覆写解析 Logo、公司 Logo 和 CPR；游戏 Logo 不再跨语种静默回退。
14. [重构-大] Goal 5：退役遮罩式 `FocusEditorModal`，新增工作区内 `FocusSession` / `FocusWorkspace`。裁切、Logo、CPR 在聚焦期间只写 draft；左侧复用原品牌控件，保存后一次性提交，取消或 Esc 在 dirty 时要求确认放弃。
15. [功能调整-中] Goal 6：CPR 新增与 Logo 一致的连续缩放，并接入预览 / 聚焦 / 导出同一布局计算；品牌控制新增明确的同尺寸、同素材应用命令，画板位置与大小仍保持独立保存。
16. [重构-大] Goal 7：导出模型新增基础语种 + 追加语种选择、默认 / 自定义 / 不限制体积策略与结构化逐项结果；保持原有 PNG 超限、JPG 自动压缩和平台文件写入实现不变。
17. [修复-高] Goal 7.1：聚焦状态将 Logo 显示与效果纳入 draft，Esc 使用最新 dirty 状态；点击画布品牌元素可直接选中拖动，批量应用范围改为同尺寸 / 同素材。
18. [重构-中] Goal 7.1：导出基础语种锁定为当前画板语种；渲染、写入、失败继续与结果汇总收口至 `services/export/exportBatch.ts` 和 controller，Dialog 仅保留 UI。
