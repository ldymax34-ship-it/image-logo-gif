# 更新日志

## 0.92.1

- 发布 UI 收口与正式工具页减层版本：统一页头/工作区层级、Logo 设置区间距与轻量 section，同时保留导航保护、导出队列及自动更新链路。

## 2026-08-18

- Logo 与版式工作台收薄 UI 层级：移除重复的“返回工具箱”页内按钮，将“设媒 / 自定义”改为页头下紧凑二级 tab，去掉模块 glyph、状态点、tooltip 和多余卡片边框；保留 `requestModuleChange` 与未保存内容 navigation guard。
- 正式水印页与 Logo 左栏继续收薄：图片/视频水印页移除重复返回胶囊并改用平面页头，保留标题、状态、描述、更新日志及导航 guard；Logo/CPR 控制区补齐轻量 section 层级与 8/12/16px 间距节奏，未改导出、队列或业务逻辑。

## Unreleased

- 2026-08-18 全局侧栏与首页收尾：侧栏默认折叠但提供独立箭头展开入口，展开后按「工具箱首页 / 生产工具 / 设置」建立层级；左侧与首页均只展示三个正式工具，隐藏 GIF 压缩、批量模板 GIF 等未上线入口，旧历史缓存也会过滤未开放项。首页三个正式工具恢复仅作用于图标和悬停边缘的低饱和身份色，不对整卡着色；侧栏当前项取消强描边，仅保留轻背景与文字变化。视频水印移除局部黑白灰 token 和导出中心二次配色，统一继承应用全局交互色及成功/失败语义色。保留侧栏跳转的未保存/未输出保护、最近使用缓存、CNB 占位按钮与更新日志弹窗。

- 2026-08-18 Origin/shadcn 风格控件统一与点击反馈恢复：共享原生输入框、下拉菜单、滑块、复选框、焦点环、禁用/错误状态及上传拖放区统一为 36px/8px 默认控件与 32px/6px 紧凑控件；视频打水印输出位置、格式、质量、GPU 字段及队列操作基线同步对齐。恢复零依赖 2D Canvas `ClickSpark`，主按钮用纯 CSS 提供扫光、辉光与按压反馈并尊重 `prefers-reduced-motion`；不恢复 WebGL、`ogl` 或其他运行时依赖。React/Vue 上传空状态同步统一，原生 Tauri 最终视觉仍需手动验收。

- 2026-08-18 Logo 与版式批量导出收口到全局导出中心：(1) 点击最终导出、OS 输出目标选定且任务注册后立即关闭批量导出弹窗，并显式 `exportStatusStore.requestOpen()` 展开聚焦全局导出中心，后台进度无缝可见；(2) 批处理改为在弹窗卸载后继续异步运行，完成/失败通知与最终 `onExportingChange(false)` 由 `useBatchExportController` 兜底发出，不再依赖弹窗挂载，避免 MediaWorkbench 的 exporting 状态被搁置；(3) 仅 `desktop-directory` 目标把实际输出名（含空格/非 ASCII/碰撞重命名后的真实文件名）与目录拼成完整原生路径写入 `outputPath`，浏览器 File System Access 与 downloads 目标不再写入可定位路径；(4) 全局导出中心完成项新增「在文件夹中显示」操作，仅当任务为 completed 且 `outputPath` 为真实原生路径（含路径分隔符）时出现，点击用该任务自身 `outputPath` 调桌面 opener，绝不回退当前/全局目录。新增/更新聚焦测试：`fileSystem`（路径拼接/可定位判定）、`useBatchExportController`（关闭信号+显式展开先于批处理完成、后台生命周期、完整路径、downloads 无路径）、`ExportStatusPanel`（reveal 按钮仅 completed+原生路径出现且精确传路径、非原生无按钮）。未改 Rust、导出服务层 `saveBlobToOutputTarget` 返回语义、依赖或发布链路。

- 2026-08-18 工具箱首页视觉跟进与视频素材窄栏页头修复：(1) 「Logo 与版式 / 水印工具 / 视频水印」三个启用工具增加克制的低饱和身份色（`data-tone` 只作用于图标前景/背景/边框与悬停边缘，不整卡着色、不给规划中工具着色）；恢复中性白指针跟随高光（卡片内、CSS 变量跟随指针、仅启用卡片）、悬停边框/背景抬升、箭头位移、按下 `scale(0.98)`，动效 120–180ms 且 `prefers-reduced-motion` 禁用 transform/transition/高光；首页本地提高卡片表面亮度与背景分离（仅 `.toolbox-home` 作用域，不改全局 token/其他页面），保持 1280×720 / 1440×900 / 760 / 420 响应式，禁用卡片不再像启用卡片响应。(2) 视频水印窄素材栏页头改为「视频素材」标题独占一行、「选择 MP4 / MOV」按钮整行铺满并图标文字居中、`min-width:0`，不再溢出到预览栏；不改选择行为、缩略图、视频逻辑或其他面板页头。(3) 新增/更新测试：ToolboxHome 身份色与指针跟随结构、`components.css`/`watermarkWorkbench.css` 样式契约回归。未改媒体/Rust/导出生命周期文件、依赖或发布链路。
- 2026-08-18 视频水印预览/导出字号与导出中心收口：视频预览/placements/FFmpeg 共用同一 1% 短边字号契约（`videoWatermarkConfigForCanvas` 去掉 16px 下限，960×540 下 1% = 5.4px，与 FFmpeg `h*sizePercent/100` 一致）；视频页合并「输出配置 + 导出队列」为单一内嵌导出中心（输出位置/格式/预设 + 添加/启动/清除 + 任务进度 + 完成操作同面板），主操作「添加当前到队列」移出右侧可滚动设置区、始终可见；图片水印批量导出在 OS 输出选择器返回并注册任务后显式 `exportStatusStore.requestOpen()` 展开并聚焦全局导出中心，不再只依赖新批次隐式展开；保留输出目录打开、完成项定位/复制路径，以及视频页激活时全局面板隐藏视频任务、离开后恢复。新增/调整聚焦测试（1% 字号契约、单一导出中心、可见主操作、复制路径、显式展开、隐藏视频投影）。未改 Rust/FFmpeg、依赖或发布链路。
- 2026-08-18 视频水印页跟进修复：(1) 素材栏为每个已加载视频显示真实静帧缩略图（复用已抽取的无水印预览帧 object URL，按素材持有/替换/卸载安全回收，未抽取前保留 Film 占位），文件名干净截断、元信息可读换行；(2) 「启动队列」移入「输出与队列」标题栏右上、与队列计数并列，为独立 level-1 主 CTA（就绪时克制辉光/呼吸，尊重 `prefers-reduced-motion`），添加当前/全部添加/清除已完成降为下方次要控件，按钮补齐 aria-label/title 与图标文字居中；(3) 队列反馈复用全局导出中心语义色（进行中蓝 + spinner、完成绿、失败红、排队中性），进度条与任务行按 tone 平滑过渡；(4) 定位「任务卡在 99%」根因：`applyVideoMediaEvent` 在 reducer 内改写共享 `terminalIds` Set 使其非纯，React StrictMode 对 `setTasks` updater 的双重调用让 completed 迁移被第二次调用回退为 finalizing/99%；改为纯函数、终态只由任务自身状态判定，并新增 99/finalizing→completed 与终态单调性回归测试，另补 Rust 队列「finalizing→单次 completed 终态」回归测试；(5) 输出目录打开按钮目录选定后始终可见，完成行继续暴露「在文件夹中显示」与「复制输出路径」（title 保留完整路径、reveal 不依赖当前 outputDirectory）；(6) 修正图标/百分比/计数/复选框/按钮文字的横竖居中与 `tabular-nums` 数字对齐（含 99/100 与队列计数）。保留 1% 字号契约与单一内嵌导出中心架构，未改 Rust/FFmpeg 生产逻辑、依赖或发布链路。验证：`npm test`（60 files / 435 tests）、`npm run build`、`npm run verify:core`、`cargo test watermark`（新增队列终态回归通过）、`git diff --check` 通过；FFmpeg 像素对比类 Rust 测试（角度旋转/文字像素/预览正式契约）在脏工作树中为既有失败，与本次 UI/生命周期改动无关。
- 2026-08-17 dashboard 导出交互复盘收尾：全局主题切换为近黑 dashboard 层级与克制紫蓝主交互，成功/失败分别使用 mint/pink 语义色；全局导出中心调整为 420px 任务卡、统计卡与真实任务层级，并修复用户主动收起后同批次进度更新反复自动展开的问题（仅新批次或新失败重新展开）。
- 批量导出设置拆分为「文件命名 / 格式与体积 / 语种」三段卡片，命名与格式使用分段选择，体积策略和语种使用可访问 radio card；视频页底部拆分为「1 输出配置 / 2 导出队列」，输出目录置前并显示队列计数。通知由顶部胶囊改为右上角通知卡，包含状态图标、标题、正文与明确关闭按钮。
- 桌面 QA 修复批量导出弹窗与全局导出中心的层级冲突：导出弹窗现在位于任务中心之上，避免遮挡语种和结果摘要；通知卡仍保持在最上层。未改导出 store、Render Plan、路径分配、FFmpeg、质量参数或媒体处理逻辑，未新增依赖。
- 导出中心显示收口（最终独立复核落地）：(1) 全局 `ExportStatusPanel` 默认标题由「导出队列」改为「导出中心」，收起按钮 `aria-label` 改为「收起导出中心」；视频页本地「导出队列」标题与 `aria-label` 保持不变；(2) 视频任务镜像到共享导出中心时，`outputPath` 存在则用真实输出文件名（含真实扩展名）作为 `name`/`extension`，不再显示源文件名；`outputPath` 本身原样保留，`outputPath` 缺失时安全回退源文件名 + MP4。未改本地队列、路径、store API、导出逻辑、FFmpeg 或 CSS。新增/更新聚焦测试：`ExportStatusPanel`（默认标题「导出中心」与收起 `aria-label`「收起导出中心」）、`VideoWatermarkWorkspace`（输出路径以 `clip_watermarked.mp4` 结尾时，共享导出任务显示为 `clip_watermarked.mp4` 且不出现源文件名 `clip.mp4`）。
- 聚焦回归：`ExportStatusPanel.test.tsx`（12 tests）与 `VideoWatermarkWorkspace.test.tsx`（24 tests）共 36 tests / 2 files 全部通过。
- 修复 `ExportStatusPanel` 两处显示层边界：(1) `hiddenSources` 仍为显示层过滤——面板已打开时若 prop 变更导致全部任务被隐藏，不再渲染空浮层（`visibleTasks.length === 0` 时直接返回 null），来源恢复可见后任务重新出现并保留自动展开；(2) 页脚「清除已结束」改为只移除当前可见的终态任务（逐个 `remove` `completed/failed/cancelled`），不会删除 `hiddenSources` 中的终态任务。新增两条回归测试：先渲染可见再 rerender 为全隐藏、隐藏视频完成 + 可见媒体完成点击清除仅删可见项。未改 store 语义、任务更新、CSS 或其他文件。
- 2026-08-17 视频导出交互审查落地（`docs/VIDEO_EXPORT_UE_REVIEW_2026-08-17.md`）：视频页建立局部黑白灰 token（深工作区/面板/输入框、细低对比边界、近白正文；中性白/灰承担选中、进度与主操作，绿/红仅承担结果语义），全部作用域限定在 `.wm-video-workspace`，不改全局 `theme.css`/`tokens.css`/`components.css`/`styles.css`。
- 压缩视频页页头与面板 padding、收紧预览时间轴与队列区，网格改为「窄素材栏 + 宽预览 + 适中设置栏」；设置栏辅助文案收敛为单行短句并去掉胶囊套壳；视频页内滚动条缩窄并降低对比度（`scrollbar-width: thin` + 中性 thumb），维持 1180px/760px 响应式布局。
- 本地队列统一更名「导出队列」（`aria-label` 与标题），删除重复的「启动后才调用 FFmpeg」辅助文案（仅队列标题保留一处）；任务行重构为「输出文件名 + 状态 + 操作 / 进度 / 参数摘要」，行内只显示输出文件名，完整路径保留在 `title` 与「定位/复制」操作中（复制仍写完整路径）。
- `ExportStatusPanel` 新增 `hiddenSources?: ExportTaskSource[]` 显示层过滤：被隐藏来源不渲染、不计入胶囊与汇总，但不从 store 移除；`App` 在 `activeTool === 'video-watermark'` 时对全局导出中心隐藏 `video-watermark`，其他模块任务仍显示，离开视频页后视频任务恢复可见并继续更新（工作台保活）。
- 全局导出中心收起态胶囊由「导出队列」改为「导出中心」，避免与视频页本地「导出队列」同名。
- 新增/更新聚焦测试：`ExportStatusPanel`（来源过滤只影响显示、其他来源可见并计数、全隐藏时渲染空）、`VideoWatermarkWorkspace`（任务行只显示输出文件名、完整路径在 title/定位/复制）、`App`（视频工具激活时全局面板隐藏视频任务、返回后恢复）；未改 store 归属、导出逻辑、队列控制、FFmpeg、Render Plan、质量设置、路径或依赖。
- 验证：`npm run verify:core`、`npm test`、`npm run build` 通过（数字见交付说明）。未新增依赖与资源，预期包体无实质增量。

- 2026-08-17 导出中心评审落地（`docs/EXPORT_CENTER_UX_REVIEW_2026-08-17.md`）：`exportStatusStore` 收敛为按 `batchId/source` 归属的通用任务 API——移除全局 `replace/clear`，生产流程只使用 `upsert/patch/remove/syncBatch/clearBatch/clearFinished`（全局清理仅保留显式测试方法 `resetForTests()`）；`ExportTask` 增加 `batchId/source` 字段，状态收窄为 `queued | exporting | completed | failed | cancelled`（删除无真实暂停能力的 `paused`），并加入终态与进度保护（终态不会被后续旧事件改写，进度不倒退）。
- 服务层 `exportSequentially` 增加逐项生命周期回调 `onItemStart/onItemResult`，页面不再各自拼装循环；四条真实链路全部接入全局导出中心——图片水印批量（`WatermarkWorkbench`）、Logo/版式媒体批量（`useBatchExportController`）、自定义构图单张（`CustomWorkbench`）、视频水印队列（`VideoWatermarkWorkspace`，仅镜像到 store、控制仍在本地队列）。
- 面板改为紧凑黑白灰静态导出中心：`ExportSummary` 移除数字滚动、`ExportProgress` 移除进度扫光与不确定循环动效，仅成功/失败使用低饱和语义色；状态/进度/错误类名使用 `export-center-*` 前缀，避免污染既有批量导出弹窗；补充来源标签、失败胶囊和 `:focus-visible` 键盘焦点。
- 视频水印工作台首次打开后保活：切回工具箱或其他模块时只隐藏、不卸载，后端任务/队列监听继续更新全局导出中心；队列控制仍只存在于视频页。
- 删除纯装饰动效依赖：移除 `ClickSpark`、`SpecularButton` 及 `ogl` 直接依赖，四处导出主按钮（图片水印、Logo/版式、批量导出弹窗、自定义构图、视频队列）恢复项目既有 `.primary-button` 标准按钮。
- 新增/更新聚焦测试：`exportStatusStore`（终态保护、批次隔离、`syncBatch` 对账）、`exportSequentially` 生命周期事件、`useBatchExportController` 批量写库、视频队列镜像；`CustomExportControls` 断言恢复标准按钮。
- 验证：`npm run verify:core`、`npm test`、`npm run build` 通过（数字见交付说明）。未改 Render Plan、压缩、FFmpeg/Rust、全局主题与发布链路。

- 2026-08-17 导出状态面板改绑真实状态（本轮收尾）：移除 demo 模拟器（`advanceTasks`/`seedDemoTasks`/`initialTasks`/`demo` prop 全部删除），新增模块级单例 `components/export-status/exportStatusStore.ts`（`upsert/patch/remove/clear/replace/clearFinished/subscribe` + `formatExportSize`，与 `toastBus` 同款事件模式）；`ExportStatusPanel` 只订阅 store、有新任务自动展开、收起后右下角胶囊计数、清除已完成由 store 兜底；`ExportProgress` 为「导出中且 0%」增加不确定进度条扫光（供按文件粒度的批量导出使用）；`ExportTaskItem` 去掉暂停/继续按钮（真实链路暂不支持暂停）。App 常挂载 `<ExportStatusPanel />`（空任务渲染 null）。
- 配色退回 PS 蓝主按钮：4 处 `SpecularButton` 导出按钮由透明灰改为 `tint="#3572b0" tintOpacity={1}`（`--color-primary` 蓝底 + 白扫边高光），恢复 Photoshop 中性灰 + 蓝主色语言。
- ⚠️ 未完成：四个导出流程（图片水印批量 / 媒体批量 / 自定义构图单张 / 视频水印队列）尚未写入 store——面板当前不会显示真实任务，需后续在各流程进度回调处接线（`exportStatusStore.replace` 注册 + `patch` 更新状态/进度/大小/错误）。
- 回归：`npm run build`、`npm test`（58 files / 401 tests）通过；测试 `ExportStatusPanel.test.tsx` 改为 store 生命周期 + 面板渲染（需 `@vitest-environment jsdom`）。

- 2026-08-17 导出状态面板（原创，非 React Bits Pro）：新增 `components/export-status/` 组件族——`ExportStatusPanel`（容器 + 状态管理 + demo 模拟器）、`ExportSummary`（总数/处理中/已完成/失败 四项，数字变更时交叉滚动）、`ExportTaskItem`（文件 → 状态 → 进度 → 异常 信息层级）、`ExportProgress`（导出中进度条做微弱流动高光）、`ExportStatus`（状态徽标）、`ExportError`（失败详情）。任务状态 `queued | exporting | paused | completed | failed`，支持暂停/继续、清除已完成。
- 设计遵循「桌面生产工具的任务监视器」而非 SaaS Dashboard：面板沿用中性灰主题（`--color-panel` 底 / `--color-border` 边 / 8px 圆角 / 12px 正文 / 小间距），状态色走语义 token（排队灰、导出蓝 `--state-active`、暂停琥珀 `--state-warning`、完成绿 `--state-success`、失败红 `--state-danger`），动画小而克制。
- demo 模拟器仅开发模式启用：`App.tsx` 中 `import.meta.env.DEV` 才挂载 `<ExportStatusPanel demo />`；串行推进——每 500–900ms 随机 +1–4%，100% 后 `exporting → completed` 并自动把下一个 `queued → exporting`，`setTimeout` 链式调度、卸载即清理；正式接 API 后关掉 `demo` 改用 `initialTasks` 即可。未接入真实导出逻辑。
- 新增测试 `ExportStatusPanel.test.tsx`（`advanceTasks` 纯函数 + 面板渲染，共 4 条），无新增运行时依赖（`lucide-react` 已存在）。回归：`npm run build`、`npm test`（58 files / 403 tests）通过；CDP 冒烟确认面板渲染、模拟器持续推进（5%→17%）、进度条流动高光、状态徽标色正确、无横向溢出。视觉动效精细验收交由人工/codex 复核。

- 2026-08-17 导出按钮动效（React Bits 组件接入）：(1) 引入 `<SpecularButton>`（React Bits JS-CSS 版，WebGL 高光扫边按钮）并接线到全部导出/产出主按钮——图片水印「导出水印 / 批量导出 N 张」、Logo 与版式「批量导出」、批量导出弹窗「导出 N 个文件」、自定义构图「导出当前画板」、视频水印「启动队列」；统一 `size="sm" radius=8 baseColor #525252 / textColor #f5f5f5 / lineColor #ffffff`，保留 `disabled/onClick/aria-label` 语义；(2) 引入 `<ClickSpark>`（React Bits JS-CSS 版，零依赖点击火花）包裹整个应用内容区（`sparkColor #fff / sparkSize 10 / sparkRadius 15 / sparkCount 8 / duration 400`）。
- 唯一新增依赖 `ogl@^1.0.11`（SpecularButton 的 WebGL 库，源码 708KB、Rollup 树摇后增量极小）。两组件均做了测试环境降级守卫：无 WebGL / 无 ResizeObserver / 无 2d canvas context（jsdom / headless）时退化为普通样式按钮或被动透明层，不影响现有 399 个测试。放宽 `customWorkbenchUi.test.tsx` 一处 `>导出当前画板<` 精确匹配为 `导出当前画板`。
- `@reactbits-pro/integrations-6`（导出队列/状态一览）经探测确认属 React Bits Pro 付费组件，公开端点仅返回营销页、无法取源码；本轮按用户决定跳过。
- 回归：`npm run build`、`npm test`（57 files / 399 tests）通过；Chrome headless CDP 冒烟确认应用启动正常、ClickSpark 铺满视口无横向溢出、SpecularButton 渲染 WebGL canvas 且禁用态正确。视觉精细验收（高光/火花动效观感、密度）交由人工/codex 复核。

- 2026-08-17 UI 修复轮（六项）：(1) 删除首页页脚「3 个生产工具 · 2 个规划中 · 统一深色工作区 · 本地 FFmpeg 引擎」等计数废话，仅保留浏览器端的「视频 / GIF 仅支持桌面版」引导与顶部信任说明；(2) 修复视频水印文字/Logo 透明度导出：FFmpeg 精灵与多位置文字路径原先把 `drawtext` 的 `alpha` 直接叠加到已含视频像素的 `text-base` 上、再整体 overlay，导致有效不透明度 ≈ α²（0.5→0.25）；现改为字形全不透明绘制后，用 `colorchannelmixer=aa=α` 对整层 alpha 通道单次缩放，正式输出透明度严格等于用户配置值，新增/更新对应 Rust 断言；(3) 全应用配色切换为 Adobe Photoshop 2026 深色主题：无色相中性灰层级（工作区 `#282828`、主面板 `#545454`、次级 `#494949`/`#424242`/`#393939`、边界 `#696969`、主文字 `#E0E0E0`），仅以轻微明度差分层，accent 改为克制蓝 `#3572b0`/`#4b83c7` 且只用于选中、焦点、开关、进度与主按钮；(4) 视频水印交互重排：预览标题「源 / 输出预览」更正为「水印预览」，「添加当前到队列」主操作下沉到「水印设置」面板底部，队列头部仅保留「全部添加 / 启动队列 / 清除已完成」，空队列增加引导文案，任务行内新增每任务进度条，常驻提示精简合并；(5) 批量导出弹窗新增可视进度条（`role="progressbar"` + 百分比填充）；(6) 新增顶部居中胶囊通知系统 `ToastHost`/`toastBus`（success/error/info，自动消退、可点击关闭），图片/视频水印、批量导出的成功与失败结果改走顶部胶囊，不再显示在左下角。
- 通知改动范围：`MediaWorkbench` 通过 `publishMessage` 把操作结果同时推送到顶部胶囊；`useMediaAssetActions`/`useMediaSpecActions`/`useMediaBrandActions` 的 `setMessage` 形参由 `Dispatch<SetStateAction<string>>` 收窄为 `(message: string) => void`；`BatchExportDialog` 失败路径补 toast。`VideoWatermarkWorkspace` 移除页面底部 `wm-hint` 消息态，全部路由到通知。
- 回归：`npm run verify:core`、`npm test`（57 files / 399 tests）、`npm run build` 通过；Rust 透明度单测（`render_plan_text_placements_rotate_once_without_double_rotating`、`watermark_text_opacity_ignores_legacy_dark_mode_override`）通过；Chrome headless CDP 实测首页无横向溢出、无页脚、中性灰层级与胶囊样式符合新 Token。未新增依赖。视觉精细验收交由人工/codex 复核。
- 版本号维持 `0.92.0`（未提交、未打 tag、未触发发布链路）。

- 2026-08-17 UI Phase 1｜视觉基础收口（0.92 准备，已被本轮中性灰方案取代）：按用户确认的参考方案（Origin/Linear 式暖石墨灰 + 淡紫 accent）执行第一轮 UI 改造。全应用色温由冷蓝黑切换为暖石墨灰（`--color-app:#141413` 等），主按钮改为暖白底深色文字（`--color-primary:#e6e1d8` + `--color-primary-contrast`），accent 淡紫灰 `#c9bfd8` 仅用于焦点/选中/开关/进度等关键状态。
- `styles.css` 旧冷蓝调色板（#0d131b / #202a37 / #5b9bd5 等约 100 处硬编码）机械化迁移为暖调语义色；`components.css` 移除模块导航蓝色竖条与蓝色辉光、工具箱首页径向蓝光与网格装饰、卡片渐变与 glow；外壳/面板圆角统一回 8px Token。
- 选中态语义拆分：`.asset-row/.board-card/.section-header` 等选中由 `--color-primary` 迁移到 `--color-accent-border / --color-accent-soft`；ModuleNav active 改为中性微亮背景 + 弱边框，不再出现彩色竖条；胶囊返回按钮改中性胶囊。
- 水印工具、批量模板 GIF、GIF 媒体时间轴的填充态与 accent 文本全部迁移到 accent 语义（背景 accent + 深色文字），避免暖白主色导致白字不可见；Fabric 选框颜色同步为暖色 accent。功能链路、Render Plan、FFmpeg、导出与队列代码零改动。
- 工具箱首页重排：新增「生产工具 / 规划中」两组标题，3 个生产工具 + 2 个 disabled 占位卡（桌面端「GIF 压缩」、网页版「轻量 GIF 工具」），页脚计数改为「3 个生产工具 · 2 个规划中」；移除英文 eyebrow 与暗水印隐藏入口。
- 回归：`npm run verify:core`、`npm test`（57 files / 399 tests）、`npm run build` 通过；Chrome headless CDP 实测 1440×900 / 1280×720 / 1100×720 首页无横向溢出，Logo 与版式、设置弹窗、水印工具页关键计算样式符合新 Token（截图存 `/tmp/bmw-shots/`，未纳入仓库）。未新增依赖、字体或二进制。
- 版本号统一为 `0.92.0`（package.json / package-lock / Cargo.toml / tauri.conf.json / Cargo.lock 本包条目）；未打 tag、未触发发布链路。GitHub/CNB 仓库链接、文案统一与「水印与追溯」残留清理仍按约定放在最后的文案轮。
- 仍未验证：Tauri 桌面实机的高 DPI、系统字体、Fabric 选框与导出像素一致性；浏览器计算样式不替代桌面壳验收。

## 2026-08-17｜水印度量统一与预览刷新

- 2026-08-17 完成水印与 UI 迭代的只读筹备：确认“间距”被实现为中心步长、45° 仅旋转单个水印而未旋转砖型晶格、视频间距/密度/行列存在双真值，以及视频 Canvas 参数变化仍重复解码底帧。新增 `docs/WATERMARK_MEASUREMENT_UNIFICATION_PREP.md`，定义后续唯一度量、刷新语义和验收门禁。
- 新增 `docs/UI_ITERATION_PREP_2026-08-17.md` 与 `artifacts/ui-iteration-prep/2026-08-17/` 证据，记录首页、设置、图片/视频水印、App Shell、基础控件和 Token 的问题优先级；本轮未修改功能代码、CSS、依赖、Render Plan、FFmpeg 或导出链路。
- 阶段一完成图片水印收口：统一产品名「水印工具」、旧 `watermark-trace` 偏好迁移、文字/Logo 共用配置与 Render Plan、single/规则平铺/错位平铺、原图按住查看、输出格式与非覆盖命名保持一致。
- 阶段二完成同一「水印工具」的图片/视频模式：支持 MP4/MOV 选择、metadata 展示、文字/Logo 的 single/规则平铺、静帧预览、正式 FIFO 任务状态与真实进度。
- 视频模式进一步拆分为独立「视频水印」页面：图片页不再包含图片/视频 Tabs；新增时间轴 scrubber、零秒首帧预览、高质量/平衡/较小文件三档、GPU 硬件编码开关与 AME 式本地草稿队列。Add Queue 不调用后端，Start Queue 才按序提交 Rust FIFO。
- 编码参数按后端公开能力映射：libx264 使用 CRF/preset，NVENC 使用 CQ，VideoToolbox 使用公开 bitrate 策略；明确不宣称“无损/不压缩”。未开放 QSV/AMF、硬件解码、暂停/恢复、剪辑时间轴或源目录导出。
- 视频后端继续复用随包 FFmpeg/FFprobe 与 CPU drawtext/overlay 滤镜；Windows 默认优先尝试 `h264_nvenc`，macOS 优先尝试 `h264_videotoolbox`，失败时兼容模式回退到 `libx264`。当前未验证 Windows 性能收益。
- 本阶段仅新增 5 个 Radix 直接依赖（Collapsible、Select、Slider、Tabs、Tooltip），锁文件包条目约由 283 增至 328（约 +45 个传递条目）；视频 UI 未新增更多依赖。
- 本次提交快照构建实测：复用现有 `node_modules` 约 227 MB，`dist` 约 1.5 MB，最大 JavaScript chunk gzip 162.21 KB（`dist/assets` gzip 合计 323,225 bytes）。本轮未打包桌面安装包。
- 未开放剪辑/时间轴/QSV/AMF/硬件解码/拖入/持久队列或阶段三暗水印。
- 水印度量统一与预览刷新修复：图片预览/导出、视频 Canvas 预览与 FFmpeg 输出共用同一份 `WatermarkConfig → Render Plan` 纯几何布置（`pattern: single|brick`、`density: dense|standard|sparse`、`phaseOffset` 错位；间距 `inlineGap`/`rowGap` 以水印高度 h 为单位）。删除 `spacingX/spacingY` 中心步长语义及 `tileColumns/tileRows`/`boundingWidth/boundingHeight` 双真值，行列数一律由画布与内容盒推导。默认改为 45° 密集砖型（50% 错位），晶格方向随旋转角；`©KURO GAMES ALL RIGHTS RESERVED` 5% 在 1920×1080 上约 15 个实例，无叠加堆叠、无轮廓接触。视频 Canvas 底帧仅在素材/时间戳变化时解码，文字/字号/透明度/角度/密度/排列变化只重绘覆盖层，参数变化下一帧可见。新增/更新 `watermarkRenderPlan`、`videoWatermarkPlan`、`VideoWatermarkCanvas` 及适配器/工作台测试（含绘制级重绘与不重复解码测试）。
- 视频水印正式输出契约收口：有效透明度严格等于用户配置透明度（移除遗留的 `darkMode → 0.06` 隐藏覆盖）；FFmpeg 文字水印改为单次旋转的精灵叠加到 Render Plan 百分比 placements，不再对已旋转的砖型中心做整层二次旋转；队列草稿深拷贝冻结 placements 并逐行显示冻结摘要，避免实时控件误指已入队任务；入队与运行时记录非敏感渲染参数诊断日志。新增对应回归测试（0.56 贯通适配器/请求/滤镜、默认密集砖型 45°、队列快照不漂移、`dark_mode` 不覆盖透明度）。

## 2026-07-28｜0.9.0 品宣工具箱第一个可用生产版本

- 功能冻结：Logo 与版式保留图片导入、素材列表、Logo/CPR 配置、Render Plan、Canvas 预览和图片导出完整链路。
- 水印与追溯复用共享 `MaterialAsset`、图片列表、当前素材、Watermark Render Plan、Canvas 预览和批量导出；移除重复的静态图片加载、素材状态与独立导出链。
- 水印默认文案为 `©KURO GAMES ALL RIGHTS RESERVED`；默认单行，不按容器宽度自动换行，用户手动输入的换行在预览与导出中保留。
- 水印批量输出命名与设媒一致，提供原尺寸、大尺寸（75%）、中尺寸（50%）、小尺寸（25%）四档等比缩放，不裁切、不改变长宽比。
- FFmpeg 相关代码及既有 GIF/视频媒体链路完整保留，本版本不迁移、不重构、不扩展媒体能力。
- 正式应用名称恢复为“品宣物料工作台”，Bundle ID 恢复为 `com.kuro.internal.brandmaterialworkbench`；所有应用版本统一为 `0.9.0`。
- 本版本不包含 HeroUI、shadcn/ui、React/Tailwind 升级、UI 组件体系重构、暗水印/抗去除水印、新工具入口或复杂单图 Override。
- 后续 `v1.0` 在独立 `ui-refresh/v1.0` 分支推进，仅升级 Button、Dialog、Tooltip、Toast、Progress、Switch、Slider 等基础交互，不改变业务逻辑和 Render Plan。

## 2026-07-28｜0.1.35-rc.7 本地 macOS 验收候选（未发布）

- 水印文字预览使用 `white-space: pre`，不再按容器宽度自动折行；用户手动输入的换行仍由 Render Plan 原样保留并与导出一致。
- 水印输出命名复用设媒的 `buildOutputFileName` 规则，格式为“源文件名_宽x高.扩展名”，同名批量文件追加 `_2`、`_3`；移除水印专用 `_watermarked` 命名。
- 水印导出改为按共享素材列表顺序批量执行，继续复用统一输出目录、Canvas 导出与文件保存能力；单图位置/缩放可按图片比例同步至所有其他图片。
- 新增原尺寸、大尺寸（75%）、中尺寸（50%）、小尺寸（25%）输出选项，宽高使用同一缩放系数，不裁切、不改变长宽比；字号继续按输出图短边比例缩放，不再被 16px 下限放大。
- 水印工作台页头增加与首页入口一致的盾牌图标，帮助用户在工具切换后快速确认当前模块；沿用共用 `ToolPageHeader`，其他工具页默认行为不变。
- 架构收敛：MediaWorkbench 与 WatermarkWorkbench 共享素材状态；水印工作台复用 Logo 与版式的 assets/selectedAsset/selectedSpec/`assetId:specId` previewStates，并以同一 BoardCanvas 状态预览和 exportBoardImage 导出。删除水印模块内手写 createMaterialAsset→renderBoardToCanvas→canvasToBlob 的独立静态导出链。
- 新增 WatermarkOverride（offsetX/offsetY/scale）按素材 ID 隔离；全局 WatermarkConfig 负责默认值。
- 默认水印文字改为 ©KURO GAMES ALL RIGHTS RESERVED；字体固定思源黑体，颜色固定白色（内置默认，不再作为独立 UI/状态）。
- 水印配置简化为 text/fontSize/rotation/opacity/offsetX/offsetY/spacingX/spacingY/repeat；fontSize 为短边百分比（默认 5%），UI 提供字号滑块。
- 多行文字支持：手动换行在 Render Plan 中拆分为多个 text layer（lineHeight=1.2×fontSize），预览/导出同源。
- 移除 React 水印页的 GIF/视频入口；`src-tauri/src/media.rs`、`src/gif-media/**` 与 `src/watermark-tool/**` 的 FFmpeg 底层及既有调用代码完整保留、零改动。
- 移除描边/投影/暗水印控件、image Logo 水印种类、密度/排列选择、桌面桥初始化状态、FFmpeg 任务队列 UI、独立文件导入等冗余 UI/状态。
- 静态导出格式：PNG→PNG、JPEG→JPG、WebP→PNG，复用 exportBoardImage 管道。
- 主包体约 367.9 kB（gzip 117.4 kB）；零新增依赖。
- 已生成 Apple Silicon 本地验收 DMG（41.6 MiB），镜像校验与应用深度签名校验通过；使用 ad-hoc 签名、未公证，未配置发布用 updater 私钥，因此不生成可发布签名。
- 待桌面实机验证：字号合理、X/Y 滑块范围准确、多行文字预览/导出一致。

## 2026-07-28｜0.1.35-rc.6 本地 macOS 验收候选（未发布）

- 删除当前受限 Watermark Render Plan 未实现的文字描边与投影状态、默认值和 UI 控件，避免用户设置不会出现在预览或导出中的无效选项。
- 未新增依赖、运行时或资源，前端包体无增量；MaterialAsset → WatermarkConfig → BoardRenderPlan → Canvas 静态导出链路不变，GIF/视频/FFmpeg 流程未改。
- 自动验证覆盖水印 UI 无描边/投影、文字/图片、45°、透明度、平铺间距及预览/导出 Render Plan 同源；本轮 `npm test`、`npm run build` 与 `npm run verify:core` 通过。
- 本候选仅供本地 macOS 安装验收，未发布、未上传、未更新 updater 清单；仍待实机验证预览与导出视觉一致性。
- 本地候选产物为 Apple Silicon DMG（约 41.6 MiB）；应用使用 ad-hoc 签名、未公证，且未生成可发布的 updater `.sig`。

## 2026-07-27｜Phase 1.2a 图片水印 Render Plan（开发阶段，未发版）

- 静态 PNG/JPEG/WebP 水印预览与导出统一使用 `WatermarkConfig → BoardRenderPlan.watermarkLayers`；预览由 BoardCanvas 绘制，导出由同一 plan 绘制到 Canvas。
- 水印工作台移除 Fabric 画布；背景和图片 Logo 通过 MaterialAsset 管理 Blob URL 生命周期，替换、过期结果与卸载均显式释放。
- 静态图片在本地 Canvas 渲染后保存到已选目录；GIF、MP4、MOV 保留既有 FFmpeg/Rust 任务与事件监听流程，未修改其参数或实现。
- 保留原有描边、投影、暗水印控件及视频请求字段；Canvas 规则本轮仅覆盖受限 Render Plan 支持的基础文字/图片效果。
- 新增 Render Plan、Canvas 异常恢复、水印工作台无 Fabric 与 GIF 分流回归测试；未升版本、未打包，仍待桌面实机验收。

## 2026-07-27｜Phase 1.1 统一图片资源入口（开发阶段，未发版）

- Logo 与版式、水印工作台统一为 `ImageSource → MaterialAsset` 单一入口，不再保留水印专用 path→Blob loader。
- `createMaterialAsset({kind:'file'|'path'})` 统一走 Blob → Object URL → 解码 → MaterialAsset 管线；失败立即 revoke，不记录图片字节。
- 新增 `releaseMaterialAsset` 幂等释放（模块内部 WeakMap + WeakSet），`MaterialAsset` 保持纯数据对象，不影响可序列化字段和 ExportJob。
- 水印正式背景与 Logo 预览改由 `createMaterialAsset({kind:'path'})` 获得 MaterialAsset，`loadWatermarkPreview` 仅保留 generation/stale/error 编排与唯一释放。
- 删除 `localFilePreview.ts` / `localFilePreview.test.ts`；`fileUrlDiagnostic` 作为诊断旁路保留，不属于正式加载链。
- Logo 现有调用从 `createMaterialAsset(file)` 改为 `createMaterialAsset({kind:'file',file})`，所有 `URL.revokeObjectURL(asset.objectUrl)` 改为 `releaseMaterialAsset(asset)`，行为不变。
- 新增 `imageMeta.test.ts`；重写 `watermarkPreview.test.ts` 为 mock 编排测试；更新水印源文件契约断言。
- 本轮为开发阶段重构，未升版本、未打包；未触碰 Logo Render Plan、正式导出、GIF/批量模板/更新器。

## 2026-07-27｜0.1.35-rc.5 水印文字坐标修复（待验收）

- 修复实时文本水印在导出时 `Failed to parse expression: main_w*0.17-overlay_w/2` 错误。
- 根因：`drawtext` filter 不能使用 `main_w/overlay_w/overlay_h`（这些是 overlay filter 变量）；需使用 `w/h/text_w/text_h`。
- 新增 `drawtext_single_position` 与 `drawtext_tiled_coordinates` 函数，所有 drawtext 参数使用 w/h/text_w/text_h。
- 图片 Logo overlay 坐标保持不变，继续使用 main_w/main_h/overlay_w/overlay_h。
- `ffmpeg_failure_message` 跳过 "Conversion failed!" 等无信息尾部提示，优先返回最后一条有意义的错误行。
- 补 drawtext 坐标不含 overlay 变量、image 坐标仍含 overlay 变量的 Rust 回归测试。
  **仍待桌面实机验收**：PNG 文字水印导出成功、图片 Logo 导出成功、输出文件正常打开。

## 2026-07-27｜0.1.35-rc.4 水印导出任务事件修复（待验收）

- 修复 Rust 媒体任务事件字段仍以 `task_id` / `output_path` 序列化、前端却读取 `taskId` / `outputPath`，导致完成、失败和取消事件全部无法匹配的问题；使用 Serde 官方 `rename_all_fields = "camelCase"` 并增加完整 JSON 契约测试。
- 水印工作台改为在转换引擎可用且任务事件监听注册成功后才开放导出，避免快速静态图片在监听就绪前完成而丢失终态。
- 增加任务监听、启动接受、子进程退出与终态事件投递的脱敏日志；未修改 FFmpeg 水印算法、Blob 图片预览或自动更新清单。
- **仍待桌面实机验收**：PNG 导出成功、图片 Logo 导出成功、输出文件可正常打开。

## 2026-07-27｜0.1.35-rc.1 macOS 文件 URL 诊断候选（未验收）

- 仅在 Diagnostic RC 构建中增加水印本地文件 URL 的会话内诊断报告：dialog path、plugin-fs、`convertFileSrc`、HTMLImage、只读 fetch 与 Fabric 解码探针均带时间顺序和超时记录。
- 报告默认不落盘、不上传、不写应用日志；包含本机 path/URL 的完整版只在用户本机复制或手动选取。
- 使用独立 Bundle ID `com.kuro.internal.brandmaterialworkbench.diagnostic`，不与已安装正式候选共用应用数据。
- **本问题未修复、未通过验收**：仍等待安装后确认 PNG 显示、图片 Logo 显示和输出文件生成。

## 2026-07-27｜0.1.34 Fabric 生命周期与 DOM 所有权修复

- 修复 Fabric 7 将 React canvas 重挂到自身 wrapper 后，工具卸载可能触发 `NotFoundError` 的 DOM 所有权冲突。
- Focus Logo、自定义构图与水印统一改为 React 稳定空 host + effect 内创建 canvas。
- 增加 host epoch 与异步 dispose 清理保护，避免旧 Fabric 实例清理下一轮实例的 DOM。
- 水印初始化、图片加载和水印对象渲染拆分为独立 generation，避免首次挂载竞态。
- 新增真实 DOM reparent、StrictMode 与工具返回回归测试；未改 Render Plan、正式导出或业务能力。
- 修复水印卸载时 React ref 已清空而跳过 Fabric dispose 的资源泄漏风险。
- 修复水印桌面 bridge 初始化缺失：桌面可用时可导入；不可用或加载失败不再无限显示“初始化中”。

## 2026-07-27｜水印本地图片预览授权修复

- 启用 Tauri 2 asset protocol 与最小静态 scope；用户通过系统选择器选中的路径由 dialog 插件按运行期动态授权，不开放全盘 asset 读取。
- 水印原图和图片 Logo 合并为单一 asset URL / Fabric 解码结果链，避免两套异步验证互相覆盖状态。
- `convertFileSrc`、动态加载与 Fabric 解码错误都进入明确的可重试 UI 与脱敏诊断记录。
- MP4 / MOV 在水印页改为“无静态预览、可继续批处理”的明确提示，不再被误判为图片损坏。

## 2026-07-26｜P0 GIF 取消与重试返工

- 修复 FFmpeg worker 持有 child 锁等待导致取消阻塞的问题；改为可中断轮询。
- 并发消费 FFmpeg stdout/stderr，避免管道填满造成死锁。
- GIF 重试使用同目录 `.gif.part` 临时文件，成功后原子 rename，不删除既有输出。
- 强压缩现在会真实执行额外编码轮次，进度按跨轮真实编码范围单调推进。
- 增加 registry 取消终止与临时输出命名回归测试。

## 2026-07-26｜工具页壳与边距统一

- 四个工具页统一 16px 外部安全边距、12px 面板间距和深色 panel 边界。
- Logo 工作区内缩为同一套 header / module / content surfaces；批量模板与水印画布增加边界和内边距。
- GIF 与批量模板压缩偏好显示完整文案，未改媒体处理逻辑。

## 2026-07-26｜返回与离开保护

- GIF 返回按钮交由 Vue 内部状态判断，避免外层直接卸载正在运行的任务。
- 批量模板与水印增加未保存/运行中确认；水印取消失败时不会卸载工作区。
- 明确保留批量 Rust 命令缺少可取消 taskId 的遗留限制，不显示假取消结果。

## 2026-07-26｜工具箱首页重写与全工作区 UI 审计

### 首页
- 将原五图标悬浮 Dock 重写为 2×2 工作流启动台，补充每个工具的用途、可用/实验状态和明确进入动作。
- 设置移出生产工具列表，回到页头独立入口；新增“素材仅在本机处理”提示。
- 视觉沿用现有 `tokens.css` / `theme.css`：深色面板、统一边框与圆角、轻量蓝色层级，不新增图片、字体、网络或运行时依赖。
- 1280×720 实际浏览器检查四张卡片均为 474×148，无横向溢出；`git diff --check`、`npm run verify:core`、271 个前端测试和 `npm run build` 通过。

### 审计遗留
- 四个工作区普遍直接贴窗口边缘，工具页头、返回、状态徽标、空状态、面板边界和底部动作不一致；后续以新版首页为视觉基准分批统一。
- `af44e14` 的 GIF 取消/重试返工复核仍不通过：等待仍持有 child mutex、`.gif.tmp` 输出格式存在风险、强压缩额外轮未真实执行，且没有真实命令链集成测试。
- 批量模板 GIF 仍保留错误的模板尺寸探测、覆盖输出、同步阻塞、无取消/真实进度和未实现的多视频入口。


## 2026-07-24｜品宣工具箱返工 — 单窗口嵌入 + 批量模板合成器 + Fabric.js 水印

### 架构
- 去掉 GIF/水印独立 Tauri 窗口，全部嵌入主应用单窗口
- 工具箱从 4 入口扩展为 5 入口
- 新增 VueToolWrapper（GIF工具暂用）、水印工具重写为 React + Fabric.js
- CSS 对齐项目设计令牌 tokens.css + theme.css

### GIF 合成与压缩
- 8MB 自动收口：真实文件体积检测 → 按偏好降参数 → 最多8次重试
- 无限循环硬编码、时间轴掐头去尾

### 批量模板 GIF 合成器（新增）
- 单视频多模板 / 多视频颜色映射 双模式
- Rust 色键合成：colorkey + alphamerge + overlay
- 模板预览、视频微调(缩放/X/Y)、job.json 持久化
- 批量统一规格：首模板试跑 → 整批同参数 → 逐个8MB检查

### 水印与追溯
- Fabric.js 画布直接操作：拖动/旋转/四角等比缩放
- 文字效果：颜色/描边/投影/透明度
- 排列：单个/网格平铺/斜向45°砖形 + 暗水印模式
- 旋转吸附(0/45/90°) + 滑块双击复位

### 修复
- Fabric.js NotFoundError: mountedRef + genRef 竞态防护
- 全项目异步扫描：BatchTemplateGif / VueToolWrapper / setTimeout 清理
- 产品审计：14个aria-label、二次确认、错误重试、自动队列
- 设计审计：CSS 全部对齐项目令牌

### 提交 (16 commits)
```
fc6e71b docs: 四大工具总览
f8ba7d2 fix: 全项目异步竞态扫描修复
376ca31 fix: Fabric.js 竞态根因修复
f3a5c38 fix: Fabric.js NotFoundError
8717df7 refactor: 设计审计
3fc32b5 fix: 产品审计修复
ded9016 fix: Fabric内存泄漏修复
62b5f49 chore: 清理死代码
4cfa057 fix: 水印图片加载改用convertFileSrc
6766f7d refactor: 水印工具改为Fabric.js画布
de8b4fe feat: 水印暗水印模式
e5281fd feat: 水印预览功能
4bc3ef1 feat: 批量模板合成器预览优先布局
54288f7 feat: Rust色键合成 + job.json
1da902e feat: 单窗口嵌入式 + 批量模板合成器骨架
9dbc693 feat: GIF/水印工具拆分重构
```

### 验证
- 271 TS tests + 24 Rust tests 通过
- macOS .app (85MB) / .dmg (42MB) 构建通过


## 2026-07-24｜工具箱最终视觉与本地验证包

### 视觉
- 图标容器扩大至 56px，SVG 28px（lucide strokeWidth 1.4）；水平垂直居中。
- 默认图标容器 box-shadow: 0 2px 8px rgba(0,0,0,.12)；hover 增加弱蓝色外发光（0 0 14px rgba(61,131,213,.16)）与 scale(1.04)。
- 按钮整体约 106px 高（不硬卡 <90px）；grid 不拉伸。

### macOS 本地验证包
- `.app`：87,332 KB（含 FFmpeg/FFprobe + 思源黑体 15.8 MiB），codesign --verify 通过（ad-hoc）。
- `.dmg`：41.8 MB。
- 路径：`src-tauri/target/release/bundle/macos/品宣物料工作台.app` 和 `src-tauri/target/release/bundle/dmg/品宣物料工作台_0.1.33_aarch64.dmg`。
- 未生成 updater 签名产物。

### 门禁
- `git diff --check`、`npm run verify:core`、`npm test -- --run`（270）、`npm run build` 均通过；无 Rust 变更。
- 浏览器截图：`/private/tmp/brand-toolbox-final/toolbox-1440x900.png`、`toolbox-1100x720.png`。

## 2026-07-24｜工具箱视觉收尾修复（第二次追加）

### 修复
- .toolbox-tool-icon justify-content 从 flex-start 改为 center（SVG 现在视觉居中，offset ~13px）。
- 按钮垂直 padding 从 10px 8px 8px 收窄为 8px 6px 6px，gap 从 6px 收窄为 5px，实测 h < 90px。
- .toolbox-tool-dot 背景色从 --color-accent 改为 --color-primary（已有 token），追加 flex-shrink: 0。
- 删除 ToolboxHome.test.tsx 中虚假点击测试；真实点击由浏览器人工验收（Logo/设置/GIF/水印四个入口均已确认可进出）。
- 门禁：git diff --check、verify:core、npm test（271）、build 均通过；无 Rust 变更。

## 2026-07-24｜工具箱视觉收尾修复

### 修复
- 修复工具箱按钮因 grid `1fr` 行被拉伸（实际高约 503px），改为 `grid-template-rows: auto auto` 并固定按钮宽 80px。
- 修复 `.capsule-back-button` 被父级 flex 拉伸失去彩色胶囊效果，显式设 `height: 30px`、`line-height: 1`、`flex-shrink: 0`，追加 `.app-shell-header > .capsule-back-button` 隔离规则。
- 重写 ToolboxHome 测试：补充紧凑布局类名回归，callback 逐个验证。

## 2026-07-24｜Stage 6C｜首版可见水印

### 主要改动
- 同一媒体窗口新增 GIF/水印模式切换：文字水印（中文/英文，内置思源黑体 Regular SIL OFL 1.1）和图片/Logo 水印。
- 复用 Stage 6B 的同一 Vue 队列、Rust 任务引擎与唯一 FFmpeg/FFprobe sidecar。`drawtext` 通过 `textfile` 安全传递中文。
- Rust 新增 7 项测试（总 22 passed）；macOS 实机通过静态 PNG、GIF 文字与图片水印。

### 未完成
- Windows x64 未实机。隐形指纹不做。


# 更新日志

## 2026-07-23｜Stage 6B｜真实 GIF / 媒体处理

### 主要改动
- 用户将项目明确为内部本地工具，解除未来公开分发/完整许可证材料作为开发冻结条件；历史 `e021121` gate 保留，但不再阻断本阶段。
- 接入当前 Tauri 应用内的固定 FFmpeg / FFprobe sidecar 与隔离 Vue 队列：支持 MP4/MOV → GIF、起止时间、输出宽度、FPS、循环、高清/8MB 倾向/快速预览/原尺寸、批量顺序、真实进度、取消、失败与结果大小。
- Rust 后端只从 Tauri `resource_dir` 启动 `externalBin`，没有 PATH 探测、环境覆盖、运行时下载、shell 命令拼接或第二个 Tauri app。输出强制为新 GIF 名，重名确定性追加后缀。

### 验证方式
- macOS arm64 使用仓库内 sidecar 真实跑过 MP4/MOV → GIF、中文与空格路径、GIF 元数据、两任务、运行中子进程终止、受控失败后继续及输入文件不覆盖。
- Rust 定向实机回归覆盖上述受控任务；Vue 定向回归覆盖浏览器桌面降级与队列状态。完整门禁通过：`git diff --check`、`npm run verify:core`、`npm test -- --run`（271 tests / 40 files）、`npm run build`、`cargo fmt --check`、`cargo check` 与 `cargo test`（15 passed）。
- 以 `createUpdaterArtifacts=false` 完成本机 macOS `.app` bundle 检查，固定 sidecar 位于 `Contents/MacOS/` 且 `codesign --verify --deep --strict` 通过；未生成 Preview 发布物。

### 未完成 / 风险
- Windows x64 尚无原生构建或交互式实机；仅完成 PE x86-64 架构和 Tauri target-triple 资源规则复核。Stage 6C 可见水印尚未开始。

## 2026-07-23｜Stage 6B / 6C｜真实媒体后端与可见水印门禁复核

### 修改文件
- `docs/STAGE_6B_BACKEND_GATE.md`、`docs/STAGE_6A_GIF_MEDIA_POC_PLAN.md`
- `docs/TOOLBOX_EXECUTION_PLAN.md`、`docs/FFMPEG_GUI_CANDIDATE_AUDIT.md`、`docs/PACKAGE_SIZE_AUDIT.md`
- `TASKS.md`、`README.md`

### 主要改动
- 在用户授权继续真实媒体后端和首版可见水印后，先复核 FFUI 工具层、可分发 sidecar、开发机可用工具和中文字体资源；确认当前无法满足离线唯一 sidecar、双平台成对分发与可审计中文文字水印字体要求。
- FFUI 继续仅作为 Vue 前端 UX 参考：其现成 Rust 工具层包含 PATH 候选和自动下载，不能原样嵌入。未新增 FFmpeg / FFprobe、字体、sidecar、Rust command、队列执行、命令生成、转码或水印实现。
- 固定恢复条件：双平台成对来源、版本/许可证/SHA-256、构建注入、单份 sidecar、真实取消、包体审计及中文字体许可/校验策略。实验预览继续禁用开始处理，隐形指纹未实现。

### 验证方式
- 只读复核 FFUI 固定提交的工具命令、当前仓库的 sidecar/font 资源与开发机 `ffmpeg` / `ffprobe` 可用性；核对候选 npm 包许可证、安装行为和解包体积，以及 BtbN 当前资产列表。
- 本轮没有媒体或 Rust 代码变更；不宣称真实转码、取消、中文路径、中文水印或 Windows 实机已经验证。文档变更仅运行 `git diff --check`。

### 影响范围
- Stage 6B 后端与 Stage 6C 可见水印停止在实现前，不改变现有 GIF 实验预览、Logo / 版式工作台、Render Plan、静态导出、同步、Fabric、自动更新、发布或用户 artifacts。

### 未完成 / 风险
- 需要用户认可并固定可分发的 macOS arm64 / Windows x64 `ffmpeg` + `ffprobe` 来源和中文字体方案后，才能重新开始媒体后端与文字水印；随后仍需 macOS 真实任务与 Windows 构建/实机验证。

## 2026-07-23｜Stage 6B-UI Checkpoint｜GIF / 媒体工具实验预览

### 修改文件
- `gif-media.html`、`src/gif-media/`、`src/app/gifMediaLauncher.ts`
- `src/app/ToolboxHome.tsx`、`src/app/App.tsx`、`vite.config.ts`
- `src-tauri/capabilities/`、`THIRD_PARTY_NOTICES.md`
- `TASKS.md`、`README.md`、`docs/STAGE_6A_GIF_MEDIA_POC_PLAN.md`、`docs/TOOLBOX_EXECUTION_PLAN.md`、`docs/PACKAGE_SIZE_AUDIT.md`

### 主要改动
- 工具箱的 GIF / 媒体工具改为可点击的“实验预览”：浏览器进入独立 `gif-media.html`，Tauri 使用同一应用内 singleton WebviewWindow；主 React 工作台不持有 Vue 媒体任务状态。
- 预览按 FFUI 固定提交 `4122222415bc209c711c7c166fc78d2d6d1dc139` 的队列/参数 UX 结构做最小适配，保留来源和 MIT 声明；未复制 FFUI 源码，也未带入其 Rust 壳、下载器、ECharts、GSAP 或执行队列。
- 预览明确展示空队列、参数、预设和状态图例；没有可执行队列、假进度或假结果。开始处理禁用并显示“转换引擎尚未接入”。

### 影响范围
- 增加最小 Vue 多页面运行时与窗口创建能力；未加入 FFmpeg / FFprobe、sidecar、媒体二进制、命令、真实转码、自动更新变更或第二个 Tauri app。

### 验证方式
- 定向回归覆盖工具箱实验预览入口、浏览器 fallback、singleton 窗口创建/聚焦、关闭/返回、独立多页面入口、禁用开始按钮和未接入说明。
- 浏览器开发环境在 1440×900、1100×720 下验证工具箱与 GIF 页面入口、返回、禁用状态和无横向溢出；截图仅保存于 `/private/tmp/brand-material-workbench-stage6b-ui/`，不代替原生 Tauri 验证。
- `git diff --check`、`npm run verify:core`、`npm test -- --run`（269 tests / 39 files）、`npm run build`、`cargo fmt --check`、`cargo check` 与 `cargo test`（9 passed）均通过。

### 未完成 / 风险
- macOS/Windows 仍需实际验证 singleton 窗口创建/复用、关闭、权限 scope、系统缩放、键盘焦点以及主工作台未保存状态隔离。未获得新授权前，不开始 FFmpeg / FFprobe sidecar、命令生成、真实队列、进度、取消或转码。

## 2026-07-23｜Stage 6A｜GIF / 媒体工具与隔离 PoC 规划

### 修改文件
- `docs/STAGE_6A_GIF_MEDIA_POC_PLAN.md`、`docs/TOOLBOX_EXECUTION_PLAN.md`、`docs/FFMPEG_GUI_CANDIDATE_AUDIT.md`
- `TASKS.md`、`README.md`、`CHANGELOG.md`

### 主要改动
- 只定义 MP4/MOV→GIF、GIF 重新压缩、批量队列的首版产品范围、参数、状态、预设、隔离 PoC 边界和双平台验收矩阵。
- 将旧 FFmpeg GUI No-Go 保留为历史审计，改由 Stage 6A 规划约束未来 Stage 6B；本轮不接入 Vue、FFmpeg/FFprobe、sidecar、第二窗口、二进制或正式媒体模块。

### 影响范围
- 仅文档规划；不修改业务代码、依赖、Tauri 配置、发布链路或包体。

## 2026-07-23｜产品边界：取消当前专业静态编辑器路线

### 修改文件
- `AGENTS.md`、`README.md`、`TASKS.md`、`CHANGELOG.md`
- `docs/PRODUCT_BOUNDARIES.md`、`docs/TOOLBOX_EXECUTION_PLAN.md`、`docs/TOOLBOX_ROADMAP_FEASIBILITY_REVIEW.md`

### 产品决策
- miniPaint、Photopea / Canva / Photoshop 类专业静态编辑器与完整开源图片编辑器已取消当前路线；本项目当前不集成、分发或提供高级编辑入口。
- 复杂静态编辑当前由用户自行使用已有外部专业软件，本项目当前不负责集成、启动、同步、文件交接或分发；不为未确认需求主动搭建图层、插件、时间轴、通用文档模型或高级编辑入口。未来若其他已确认功能有真实需求，必须重新经过用户确认、边界审计、依赖/许可证与包体评估后再决定。

### 影响范围
- 仅更新产品边界和执行路线，不修改业务代码、依赖、Tauri 配置、发布链路或包体。

## 2026-07-23｜连续缩放双击复位

### 修改文件
- `src/components/brand/LogoGroupControls.tsx`、`src/components/brand/CprControls.tsx`
- `src/components/brand/CprControls.test.ts`
- `TASKS.md`、`CHANGELOG.md`

### 主要改动
- 设媒的 Logo 与 CPR“连续缩放”滑块支持双击恢复 100%，并提供可见的“双击复位”提示和准确 aria-label/title。
- 复位继续通过既有 `onChange` 更新链路写入当前画板状态，不绕开 dirty、同步或 Render Plan。

### 验证方式
- 组件行为回归先将两条滑块修改到非 1，再触发双击并确认分别经既有 `onChange` 回写为 1；同时锁定 aria-label/title。`git diff --check`、`npm run verify:core`、`npm test -- --run`（262 tests / 36 files）与 `npm run build` 均通过。未涉及 Rust/Tauri，未重复 Cargo 门禁。

### 影响范围
- 仅处理两处“连续缩放”滑块；不改变查看倍率、素材裁切、效果强度、语言校正、GIF 占位状态或 Stage 6 路线。

## 2026-07-23｜内置常用社媒规格名称修复

### 修改文件
- `src/core/spec/presetTemplates.ts`、`src/core/core.test.ts`
- `TASKS.md`、`CHANGELOG.md`

### 主要改动
- 将“常用社媒”的显示名从方图、竖版、横版前缀统一为纯尺寸：`1080x1080`、`1080x1920`、`1920x1080`。
- 保持 `social-common`、规格顺序、宽高与 JPG 格式不变；套用到尺寸草稿后继续直接显示纯尺寸。

### 验证方式
- 新增内置常用社媒模板回归，锁定三项名称、宽高、顺序、JPG 格式与草稿序列化结果；`git diff --check`、`npm run verify:core`、`npm test -- --run`（260 tests / 36 files）及 `npm run build` 均通过。未涉及 Rust/Tauri，未重复 Cargo 门禁。

### 影响范围
- 仅修复内置模板显示文本；不改变导出、Render Plan、同步、Fabric、更新或发布链路。

## 2026-07-23｜Stage 5B｜默认启动设置

### 修改文件
- `src/app/appPreferences.ts`、`src/app/appPreferences.test.ts`
- `src/app/ApplicationSettingsDialog.tsx`、`src/app/ApplicationSettingsDialog.test.tsx`
- `src/app/AppRuntimeProvider.tsx`、`src/app/App.tsx`、`src/styles/components.css`
- `TASKS.md`、`README.md`、`docs/PACKAGE_SIZE_AUDIT.md`

### 主要改动
- 新增独立、版本化的 `AppPreferencesV1` 与本地持久化键；偏好只保存启动入口和上次工具，不保存素材、画板、Logo 设置或任何未保存工作内容。
- 设置提供工具箱首页、Logo 与版式、GIF / 媒体工具、水印与追溯、上次使用的工具五个启动选择。
- 损坏 JSON、未知版本、未知值、未完成 GIF / 水印启动项或未完成 `lastTool` 都会安全回退到工具箱首页；当前不会创建空模块。

### 验证方式
- 定向回归覆盖默认/直接/上次启动、损坏 JSON、未知版本/值、未完成工具回退和设置选项；完整前端回归为 259 tests / 36 files，`git diff --check`、`npm run verify:core`、`npm run build`、`cargo fmt --check`、`cargo check` 与 `cargo test`（9 passed）均通过。
- 浏览器开发环境实际验证：选择 Logo 与版式后重载进入现有工作台；选择 GIF / 媒体工具后重载回退工具箱。完成后恢复工具箱首页启动项；截图只保存于 `/private/tmp/brand-material-workbench-stage5b-*.png`。

### 影响范围
- 仅应用级偏好和设置表面；不改变品牌设置、BoardDocument、工作台业务状态、Render Plan、导出、同步、Fabric、更新或发布链路。

### 未完成 / 风险
- 原生 Tauri/WebView 的持久化、桌面重启、系统字体与键盘焦点仍需 macOS/Windows 人工验证；浏览器重载和纯函数测试不替代该项。

### 下一步建议
- 历史建议：Stage 5A/5B 完成后曾要求停止。该建议现已由 Stage 6A 规划取代；Stage 6B FFUI 隔离 PoC 仍须新的明确批准。

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

---

## 四大工具总览 (v0.1.33)

### 1. Logo 与版式

设媒工作台，批量尺寸裁切 + Logo/CPR 组合导出。

| 项 | 说明 |
|----|------|
| 技术栈 | React + SVG Render Plan |
| 画布 | BoardCanvas (SVG) + CustomFabricOverlay (Fabric.js 透明交互层) |
| 核心能力 | 素材导入 / 社媒尺寸矩阵 / Logo组合(游戏+公司) / CPR / 连续缩放 / 批量PNG/JPG导出 |
| 交互 | 拖选画板 / 双击Focus / Logo拖缩 / 自定义构图 |
| 状态 | ✅ 生产可用 |

### 2. GIF 合成与压缩

视频转 GIF，掐头去尾 + 8MB 自动收口。

| 项 | 说明 |
|----|------|
| 技术栈 | Vue 3 (通过 VueToolWrapper 嵌入) + FFmpeg sidecar |
| 核心能力 | MP4/MOV 输入 / 时间轴截取 / 输出预览 / 无限循环 / 8MB 自动压缩重试 |
| 压缩策略 | 均衡 / 优先清晰 / 优先流畅 |
| 后端 | Rust `start_gif_media_task` → FFmpeg 同步重试循环 |
| 状态 | ✅ 可用 (Vue 组件，后续可迁移 React) |

### 3. 批量模板 GIF 合成器

Figma 模板 PNG + 视频 → 批量多语言 GIF。

| 项 | 说明 |
|----|------|
| 技术栈 | React + Rust FFmpeg 色键合成 |
| 模式 | 单视频多模板 / 多视频颜色映射 |
| 核心能力 | 色键抠像(colorkey) / 视频cover/contain适配 / 模板预览 / 视频微调(缩放/位移) / job.json 持久化 / 统一规格8MB批量输出 |
| 后端 | Rust `preview_template_frame` / `compose_batch_template_gifs` / `save_batch_job_json` |
| 状态 | ⚠️ 功能完整，待实机验证色键合成效果 |

### 4. 水印与追溯

文字/图片水印，画布直接操作。

| 项 | 说明 |
|----|------|
| 技术栈 | React + Fabric.js 画布 + FFmpeg 水印渲染 |
| 核心能力 | 文字水印(字体/颜色/描边/投影) / 图片Logo水印 / 画布拖动旋转缩放 / 单个/平铺/斜向砖形 / 暗水印 / 参数双向同步 |
| 交互 | Fabric.js 四角等比缩放 + 旋转手柄 / 滑块双击复位 / 0/45/90°吸附 |
| 后端 | Rust `start_watermark_media_task` / `preview_watermark_frame` |
| 生命周期 | mountedRef + genRef 竞态防护 / 22处 await后校验 |
| 状态 | ✅ 可用 (已修复 NotFoundError 竞态) |

### 共享底层

| 层 | 内容 |
|----|------|
| FFmpeg/FFprobe | arm64 macOS / x64 Windows sidecar |
| Rust 子进程 | MediaTaskRegistry / 进度事件 / 取消 / 8MB重试 |
| 设计令牌 | tokens.css + theme.css (颜色/间距/圆角/字号/控件高度统一) |
| 测试 | 271 TS + 24 Rust / verify:core OK |
