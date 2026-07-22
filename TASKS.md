# 任务看板

## 当前版本：0.1.33 自定义构图原图画布、裁切与几何缩放

### 0.1.33｜自定义构图原图画布、裁切与几何缩放
- [x] 默认尺寸模式改为“原图尺寸（跟随底图）”；当前底图的自然宽高作为画布、预览、Fabric 和正式导出的统一 `MaterialSpec`。
- [x] `1920×1080` 保留为显式手动规格；手动选择在同一/替换底图时保持，切回原图尺寸立即使用当前底图自然尺寸。
- [x] 缺失尺寸模式或旧隐式 `1920×1080` 状态安全迁移为原图尺寸；只有明确手动尺寸字段才保留手动意图。
- [x] 自定义构图复用核心裁切纯函数 `createInitialCropState`、`panCropState`、`zoomCropState`：支持适合、填满、底图拖动、缩放和复位；底图不进入 Fabric。
- [x] 游戏 Logo、公司 Logo、CPR 去除固定倍率上限；Fabric 与数值精调共用基于对象原始 rect 和当前画布的几何上限，角落放大自动重约束到画布内。
- [x] 尺寸模式变化后三个对象复用既有 Render Plan/Fabric 约束路径重新收敛；原色/白色/黑色/自定义配色不被 Fabric 读取或改变。
- [x] 新增/扩展纯函数回归：原图横/竖/方、手动规格保持、回切原图、共享 crop、全局放大几何边界、角落放大、Render Plan/Fabric 尺寸一致。
- [x] 自动验证：`git diff --check`、`npm run verify:core`、`npm test -- --run`（214 tests / 29 files）、`npm run build`、`cargo fmt --check` / `cargo check` / `cargo test`（9 passed）。
- [x] macOS Apple Silicon 隔离 updater E2E：`0.1.29 → 0.1.33` candidate 经真实 Tauri Updater 完成检查、下载、签名校验、安装、关闭/重启与版本核验；过程日志只保存在系统临时目录，未使用用户素材。
- [x] 正式 Preview 双平台分发：`Publish signed Preview updater` workflow `29930982002` 成功；公共 Preview manifest 为 `0.1.33`，含 macOS arm64 与 Windows x64 两个实际签名条目；CNB 优先 manifest 镜像匿名 HTTP 200，保持 GitHub 签名资产 URL。
- [ ] 仍需人工实机：macOS/Windows 的原图/手动尺寸切换、底图裁切手势、三对象几何极限缩放、隐藏/资源/语种切换、原色/白色/黑色/自定义目视效果，以及 PNG/JPG 导出位置与像素尺寸一致性。当前无交互桌面会话，未将自动/纯函数验证表述为该项通过。

- [x] “横版投放”内置套组的三个规格名称改为纯尺寸：`1920x1080`、`2560x1097`、`1600x1200`。
- [x] 保留原有套组 ID、宽高和 JPG 格式，不改动已保存配置与导出/更新架构。
- [x] 增加内置横版规格回归测试。
- [x] 完成 Preview 发布门禁与双平台分发；未触碰用户原有未跟踪 `artifacts/`。

### 阶段 A｜修复 Logo / CPR 自定义改色无效
- [x] `BrandColorMode` 统一为四种：`original / white / black / custom`。
- [x] 新增 `resolveColorEffect(colorMode, effect)` 纯函数，Logo 与 CPR 共用同一解析入口。
- [x] `buildBrandRenderPlan` 产生最终 `BrandEffectState`；`buildBoardRenderPlan` 只消费 `item.effect`，不再二次覆盖颜色。
- [x] original：`colorEnabled=false`，保留素材原色；white：`#ffffff`；black：`#000000`；custom：保留 `effect.color`。
- [x] `LogoGroupControls`、`CprControls` 配色选项增加"自定义"，选择后显示颜色选择器并直接更新 `effect.color`。
- [x] `BrandEffectControls` 新增 `hideColorControls` prop，删除 Logo/CPR 重复的"改色"开关和颜色输入（描边、发光、阴影保留）。
- [x] `CustomWorkbench`：`colorMode` 从硬编码 `'white'` 改为 `deriveBrandColorMode(effect)` 动态推导，保留其独立改色能力。
- [x] 旧数据兼容：`deriveBrandColorMode` 对非黑白自定义色返回 `custom`；运行时旧 JSON 缺失或非法 `colorMode` 时，由 effect 明确推导安全模式。
- [x] CPR 配色模式切换不再重写 `effect.color`；从自定义色切换白色/原色后回到自定义，仍保留原色值。
- [x] Logo 单项样式预览使用按 `colorMode` 解析后的 effect，与画布 Render Plan 一致。
- [x] 预览、聚焦预览、缩略图、单张导出、批量导出共用同一 Render Plan。
- [x] 未修改 updater、导出压缩、Logo/CPR 布局、同步范围。

### 阶段 A 验证记录
- [x] `git diff --check`：通过。
- [x] `npm run verify:core`：通过。
- [x] `npm test -- --run`：通过，181 tests / 25 files（原 153 → 181，新增 28 tests）。
- [x] `npm run build`：通过。
- [x] `cargo fmt --check` / `cargo check` / `cargo test`：通过（Rust 无改动，发布前一致性检查）。
- [ ] Logo / CPR 四模式配色（original / white / black / custom）需在 Tauri 桌面端实机目视确认渲染效果。
- [ ] CustomWorkbench 现有改色路径需在自定义构图模块实机确认。
- [x] 阶段 B（Fabric.js 固定对象交互）已按固定对象边界完成代码接入，待总控与桌面实机验收。

### 阶段 B｜Fabric.js 固定对象交互
- [x] 阶段 A checkpoint：`e1869cb fix: unify logo and cpr color modes`；提交后工作区仅保留用户 `artifacts/`。
- [x] 新增本地 `fabric@7.4.0`（MIT）；仅动态加载在自定义构图交互层，不使用 CDN、远程 API、sidecar 或额外运行时。
- [x] Fabric 仅创建游戏 Logo、公司 Logo、CPR 三个透明固定对象；底图与裁切不进入 Fabric。
- [x] Fabric 对象 bounds 直接来自 `buildBoardRenderPlan().layers[].rect`，不再使用固定 `128×80` 命中框；隐藏对象保留位置/scale 状态与 bounds。
- [x] 禁用旋转、多选与边中控制柄，仅保留四角等比缩放；点击空白取消选择。
- [x] 删除自定义构图的手写 Pointer capture 与 `custom-drag-layer`；位置日常由画布操作完成，属性区仅显示当前对象的 X/Y/缩放、显示、复位和既有高级样式。
- [x] CPR 增加自由拖动、等比缩放、X/Y/scale 与复位，写回最小 `cprOffset / cprScale` 状态；游戏/公司 Logo 继续写回既有 offset / scale。
- [x] 手势转换冻结完整 baseline（初始 rect / scale / 范围 / 画布 / previewScale）；缩放中 React 更新 Render Plan 后，后续 Fabric 事件仍按初始手势计算，避免累计缩放。
- [x] 固定对象 reconciliation 按每次 Render Plan 更新创建缺失对象、更新资源替换后的 rect、移除真正失效对象；隐藏仅释放 Fabric 选框并保留领域状态。
- [x] X/Y 输入显示实际 Render Plan rect，缩放与数值精调共享 canvas 边界约束和状态写回；不再使用硬编码坐标上限。
- [x] CPR 新增兼容 `constraintMode`：标准画板与旧数据默认 `safe-area`；仅自定义构图使用 `canvas`，可贴画布边但不越界。
- [x] Fabric 动态导入失败捕获为非阻塞状态提示，预览与正式导出仍不依赖 Fabric。
- [x] Fabric 不读取/修改 `colorMode` 或 effect；正式预览与导出仍走 `BoardCanvas + Render Plan + renderBoardToCanvas/exportBoardImageWithinLimit`，未使用 Fabric 导出 API。
- [x] 新增纯函数与状态测试：25/100/300% previewScale、高 DPI、边界 clamp、三对象状态写回、四角限制/禁用多选、隐藏状态、Render Plan bounds、语种切换位置稳定、Fabric 回写到 Render Plan。
- [x] 前端 `dist`：856 KB → 1,140 KB（约 +284 KB）；Fabric 动态 chunk 282.9 KB（gzip 88.8 KB）。正式 macOS/Windows 包体差值待平台构建。
- [x] 阶段 B 自动验证：`git diff --check`、`npm run verify:core`、`npm test -- --run`（201 tests / 28 files）、`npm run build`、`cargo fmt --check` / `cargo check` / `cargo test`（9 passed）均通过。
- [ ] Tauri macOS/Windows 实机：三对象选中/拖动/缩放、空白取消、隐藏再显示、资源/语种替换后的选框、数值精调/右下边界、CPR 四边贴合、动态加载失败降级与导出位置一致性待验收。
- [ ] 不提交阶段 B 改动，等待总控验收。

## 当前版本：0.1.31 画板状态、同步与正式导出模型收口

### Goal 1｜逐画板语言与不可变 ExportJob 模型
- [x] 默认导出按每画板自身已保存语种展开，不再被当前选中画板语种覆盖。
- [x] 追加语种：在各画板自身语种上追加并去重。
- [x] 全语言：每画板展开为全部已支持语种（当前 5 种：zh-CN / zh-TW / ja-JP / ko-KR / en-US）。德/法/西/泰/葡仅有命名码映射，不在无资源时硬扩功能。
- [x] 建立不可变 ExportJob 模型，冻结 boardKey、画板快照、requestedLanguage、resolvedLogoLanguage、resolvedLogoAssetId、计划文件名；`actualFileName` 不在 ExportJob 上，由 BatchItemOutcome 携带。
- [x] requestedLanguage 与 resolvedLogoLanguage 不一致或缺资源时阻止导出，禁止静默回退。
- [x] 导出预览和最终渲染消费同一份解析结果。
- [x] 聚焦草稿只有保存后才进入导出；放弃后仍导出旧快照。
- [x] 新增回归测试：services/export/exportJob.test.ts。

### Goal 2｜正式命名
- [x] 提供“源图片名 / 自定义名称”模式；自定义名称替代源名，不是额外前缀。
- [x] 默认去掉序号、material 批次前缀、规格名称。
- [x] 语言码取最终实际解析语种；无语言含义（Logo 关闭或仅公司 Logo）时不伪造语种。
- [x] 多素材自定义名各不相同时不追加源图片名；仅当计划文件名真实冲突时才追加 `_2`、`_3` 确定性避让。
- [x] 记录并展示平台实际落盘名称 actualFileName：由 `exportMediaBatch` 写入 `BatchItemOutcome`，UI 从 outcome 读取，不写回 ExportJob。
- [x] 桌面端真重名时仍由 Tauri save_export_file 稳定追加 _2、_3，禁止覆盖。

### Goal 3｜统一 Logo/CPR 同步引擎
- [x] “同尺寸”语义改为按 width×height 匹配，不受格式、大小限制、specId 影响。
- [x] “同素材”语义保持为当前素材的其他尺寸。
- [x] 抽出纯目标解析函数 modules/media-workbench/syncScope.ts。
- [x] 打开确认时冻结来源快照与目标集合；确认后使用单一原子 dispatch（sync-logo-scope / sync-cpr-scope）完成来源/目标写入。
- [x] 目标未初始化时阻止整次操作并提示真实缺失数。
- [x] Logo 同步覆盖：语种、资源、组合、位置、大小、边界模式、显示、高级效果。
- [x] CPR 同步覆盖：开关、位置、偏移、大小、颜色、高级效果。
- [x] 聚焦 rebase 只在同步成功后发生。
- [x] focusEditorDirty 改为从 focusSession.dirty 派生，移除独立状态。
- [x] 确认文案明确目标范围和会覆盖的内容。
- [x] 新增回归测试：modules/media-workbench/syncScope.test.ts、boardBrandReducer 同步测试。

### Goal 4｜图片裁切同步
- [x] 新增“同素材·同尺寸”裁切同步入口（聚焦工作区裁切工具面板）。
- [x] 只对 assetId 相同且 width×height 相同的其他画板复制 fitMode 与 crop 快照。
- [x] 不把裁切同步到不同素材或不同版型。
- [x] 多语言 ExportJob 天然复用所属画板同一份裁切。
- [x] 操作需要二次确认、真实目标数量及原子更新。

### Goal 5｜Logo 极限构图边界
- [x] 统一安全区定义：brandLayout.getLogoPlacementBounds 与 placeGroup 共用同一 bounds。
- [x] 返工：删除 BoardCanvas CSS `.safe-area` 的 `inset: 8%`，改为从 `plan.safeArea`（核心 1U）渲染；BrandOverlay 不再重复绘制安全区。
- [x] LogoGroupState 增加 constraintMode：safe-area（默认，兼容旧画板）/ canvas（可越安全线，但 Logo 完整留在画布内）。
- [x] UI 在自定义位置附近显示“位置边界：[安全区内/画布内]”。
- [x] 超出安全区时保留虚线并轻微提示，不阻止保存。
- [x] 切回安全区时通过重新 placeGroup 收回最近合法位置。
- [x] 支持方向键 1px、Shift+方向键 10px 微调 Logo 自定义位置。
- [x] 吸附与位置边界独立；两种模式下吸附开关均正确。
- [x] 预览、聚焦选择框、最终导出共用同一 Render Plan（buildBrandRenderPlan）。
- [x] CPR 越界仍保持禁止。
- [x] 新增回归测试：modules/media-workbench/focusBounds.test.ts。

### Goal 6｜聚焦视图滚轮缩放与平移
- [x] 保留 25%-300% 查看倍率滑块、加减按钮、适合窗口。
- [x] 增加鼠标滚轮围绕指针缩放查看视图。
- [x] 增加 Space+左键拖动和鼠标中键拖动平移视口。
- [x] 不使用 Ctrl+左键作为默认平移。
- [x] 设置中增加滚轮缩放灵敏度：低/标准/高。
- [x] ViewportState（zoom/pan）独立于 BoardDocument/FocusSession dirty；只影响查看，不影响裁切和导出。
- [x] UI 文案区分“查看倍率/视口平移”与“素材缩放/裁切位移”。
- [x] 放大后能平移到四角检查 Logo/CPR。
- [x] 保留可键盘操作的按钮/滑块。

### 本轮验证记录
- [x] 0.1.31 返工后验证：npm run verify:core、npm test、npm run build 均通过；152 tests / 23 files。
- [ ] Tauri 桌面端实机导出、同名避让、聚焦滚轮/平移手势需在 Preview 发布前实机回归。
- [ ] 多素材自定义名与同尺寸裁切同步需在真实物料上人工复核。

### 0.1.31 UI 收口（发布前轻量优化）
- [x] 聚焦顶部操作提示：标题与操作按钮之间新增单行低强调度提示栏（36px），随 session.tool 动态切换裁切/Logo/CPR 文案，容器固定不抖动；小型 SVG 帮助图标 aria-hidden；aria-label="聚焦操作提示"。
- [x] Logo/CPR 分区：改为同级独立 section 卡片（轻微背景差 + 1px 边线 + 4px 圆角），区块间 14px 间距、区块内 8px gap、10–12px 内边距；无大阴影或嵌套卡片。
- [x] 文案统一：除软件标题"品宣物料工作台"外，用户可见文案不再出现"品牌/品宣"，统一使用 Logo/CPR/素材直接名称；仅修改面向用户文字，不重命名类型或领域模型。
- [x] 补 `uiPolish.test.tsx`（6 tests）：三种工具提示文案、Logo/CPR 独立 section、用户可见文案无品牌/品宣。
- [x] git diff --check、verify:core、npm test（152/152）、npm run build 均通过。
- [ ] 1100×720 实机视觉检查：顶部提示不挤压保存按钮、长文不换行不抖动、Logo/CPR 分区明显但不厚重。

### 0.1.31 返工（定向修复验收项）
- [x] 安全区双框：删除 BoardCanvas CSS 8%，改用 plan.safeArea 统一渲染；BrandOverlay 不再重复绘制。
- [x] 聚焦 pan/zoom 坐标：抽出 `focusCoords.ts` 纯函数（pointerToCanvasPoint / computeZoomViewport），改用 stage-frame 稳定坐标系；补无 pan/有 pan/缩放/连续滚轮不漂移测试。
- [x] 自定义导出命名：多素材不同自定义名不追加源图名；仅真实冲突时 `_2` 确定性避让；补不同名/同名测试。
- [x] 无语种意义收敛：Logo 关闭或 company-only 时 append/all 每画板只生成一个任务且文件名不带语言码；补 disabled / company-only 测试。
- [x] ExportJob 不可变：删除 ExportJob.actualFileName，移入 BatchItemOutcome；exportMediaBatch 不再写 job；补不可变测试。
- [x] 同步模型收口：resolveCropSyncScope 改用 previewStates 判断初始化；same-size 文案改为"所有其他同尺寸画板"；same-asset 跨尺寸同步 Logo/CPR 自定义位置按源/目标画板归一化映射；补横→竖/不同分辨率/边界 clamp 测试。
- [x] 语言范围与文档：明确当前实际支持 5 种语言（简中/繁中/日/韩/英），德/法/西/泰/葡仅命名码映射；修正 TASKS/CHANGELOG/README 描述与代码一致。
- [x] 清理：删除 exportJob.ts 未使用的 requestedGameLogo；保留 artifacts/。

### 待继续（未进入）
- [ ] 自动更新、GIF、视频、AI 等新业务功能保持冻结。
- [ ] 复核清单模块 reviewReport.ts 与 TXT/CSV 导出后续专项补齐。

## 历史版本：0.1.30 Goal 9 Preview 自动更新桥接版

### 自动更新发布门禁（强制）

- [x] `0.1.30` 采用 GitHub 桥接：`0.1.29` 的 manifest 与安装包均由 GitHub 提供；`0.1.30` 内置已验证 CNB manifest first、GitHub fallback。
- [ ] CI 可并行构建 macOS arm64 / Windows x64，但发布必须先完成 macOS 候选实机更新验证；Windows 在此之前不得出现在公共 Preview 清单中。
- [ ] macOS 候选通过后，才生成含两个真实平台条目的公共 Preview 清单，并继续完成 Windows 真实 `0.1.29 → 0.1.30` 验证。
- [ ] 发布细则见 `docs/UPDATE_RELEASE_GATES.md`；不得用删平台字段、旧版包或占位包绕过阶段门禁。

### UI 正式化（已完成）
1. [UI-大] 模块导航改为 72px 固定宽，带语义状态点（蓝=激活/绿=就绪/黄=警告/红=错误/灰=未启用），切换模块不改变布局尺寸。
2. [UI-中] SectionHeader 使用 data-section-state 驱动状态点颜色，Logo/CPR 启用时点为蓝色。
3. [UI-大] 设置弹窗改为 5 个 tab 分类：常规、品牌与语种、CPR与辅助、更新、诊断。切换 tab 不改变弹窗尺寸，底部固定保存栏。
4. [UI-中] 自定义工作台：未导入图片时仅显示模块说明和导入按钮；导入后按游戏 Logo、公司 Logo、CPR、辅助显示、导出五个 section 组织。
5. [UI-小] 缩放显示为 1.00× 格式，坐标显示整数或一位小数；高级样式显示轻量摘要（描边关·阴影开）。
6. [UI-中] 设置与自定义面板消除横向滚动条与内容宽度溢出。
7. [UI-小] prefers-reduced-motion 禁用所有过渡动画。

### CNB 国内更新镜像（准备中）
8. [维护-中] 创建 CNB 镜像方案文档 `docs/CNB_MIRROR_PLAN.md`，包含：多 endpoint 回退行为、验收标准、所需外部信息清单。
9. [维护-中] 创建 CNB 镜像准备脚本 `scripts/cnb-mirror-release.sh`，仅下载 GitHub 已签名资产、记录哈希、在已验证 CNB 附件基址后生成 manifest；不猜测上传 API、不读取 token、不上传私钥。
10. [维护-小] 确认 Tauri Updater v2.10.1 在 `endpoints` 数组中按顺序回退：第一个不可达/非 200/无效 JSON/超时 → 自动尝试下一个，不产生并发下载。

### 正式产品路线

- [ ] Goal 9｜Preview 自动更新：官方 Tauri Updater/Process、Preview-only manifest、提示式下载和 AppActivity 安装门禁已完成；0.1.29 统一自动/手动检查与下载 single-flight，补齐后台下载语义、本地诊断日志、异常退出提示和诊断导出。macOS arm64 本地构建已验证，Windows x64 签名产物与实机更新待发布后回归。

- [x] Goal 1｜App 根层所有权：`AppRuntimeProvider` 在根层持有当前模块、全局品牌资源、全局品牌设置与 `AppActivity`；`AppShell` 只负责模块导航和出口，`MediaWorkbench` 只负责设媒。
- [x] Goal 1.1｜全局设置收口：设置弹层、品牌资源替换 / 恢复和 SVG 上传入口由 `GlobalDialogs` 托管；根层直接汇总设置活动状态。
- [x] Goal 2｜固定桌面应用框架：根元素、应用外壳和模块容器固定为 `100dvh`，工作区与面板改为内部滚动并使用稳定滚动条槽位。
- [x] Goal 3｜语义 UI 状态：统一 `SectionHeader`、状态 token 与动态圆点；蓝色只表达当前编辑 / 焦点，启用状态仍由 Toggle 文案共同表达。
- [x] Goal 4｜品牌资源唯一解析器：缩略图、聚焦画布与批量导出预览 / 实际导出均通过 `resolveBoardBrandAssets` 解析画板资源；多语种导出使用覆写语言且不修改工作区语种。
- [x] Goal 5｜工作区内聚焦模式：显式 `FocusSession` 管理裁切与画板品牌 draft，双击画板进入同一应用框架内的聚焦工作区；保存一次提交、取消丢弃草稿，左侧复用 Logo / CPR 控件。
- [x] Goal 6｜Logo / CPR 操作完善：Logo 与 CPR 均支持 0.5～2 的连续缩放；画板状态保存独立位置 / 大小，并通过明确的同尺寸、同素材命令应用，不隐式覆盖其他画板。
- [x] Goal 7｜正式导出模型：基础语种取当前画板语种并锁定，可追加语种或一键五语种；体积策略支持规格 / 默认 8MB、自定义与不限制；批处理保留逐项成功、压缩与失败结果。
- [x] Goal 7.1｜交互与状态补漏：聚焦全量 draft 回滚、画布元素直接选中拖动、增量 reconcile 引用稳定性、导出执行服务化完成；未进入 Goal 8。
- [x] Goal 8｜正式产品体验收口：聚焦模块切换守卫与聚焦内作用域应用补充完成；聚焦画布直接选中与选中反馈、画板级 Logo 视觉状态、同尺寸 / 同素材批量应用与二次确认、多语言追加操作、语种 Logo 视觉倍率、导出语言缩写与超限提示完成；未进入自动更新。

自动更新、GIF、视频、AI 等新业务功能保持冻结，待 Goal 8 通过后再进入独立专项。

### 产品方向

当前项目为「品宣物料工作台」。

当前已接入 Tauri 2 桌面壳与本地文件写入；正式产品路线优先收束应用状态、交互与导出，再进入自动更新专项。

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

## 0.1.19

1. [新需求-大] `src/components/ModuleNav.tsx`、`src/components/BrandAssetWorkspace.tsx`、`src/pages/App.tsx` 新增自定义构图模块：本地单图导入、游戏 / 公司 Logo 独立摆放、语种切换、网格吸附与 PNG / JPG 导出。
2. [新需求-中] `src/components/brand/BrandResourceManager.tsx`、`src/components/brand/BrandSettingsDialog.tsx` 整合品牌资源管理：可替换指定语种资源、替换当前公司 Logo、选择与恢复内置资源。
3. [功能调整-中] `src/core/brand/brandLayout.ts`、`src/components/brand/LogoGroupControls.tsx` 支持特大 Logo 与公司 Logo 比例；仅公司 Logo 模式现正确应用比例预设。
4. [问题修复-中] `src/components/BrandAssetWorkspace.tsx` 在公司 Logo 叠加后的最终输出上执行 8MB 限制校验与 JPG 自动压缩。
5. [维护-小] `src/core/core.test.ts` 补充公司 Logo 比例回归测试。

### 本轮验证记录

- [x] 0.1.19 完成后验证：`npm run verify:core`、`npm test`、`npm run build`、`git diff --check` 通过；45 tests。

## 0.1.20

1. [问题修复-大] 预设大小与连续缩放解耦，消除自定义模块 1.20 → 1.21 及公司 Logo 阈值跳变；设媒聚焦编辑新增连续 Logo 缩放。
2. [新需求-大] CPR 改为 `assetId:specId` 画板级状态，支持画板独立位置、拖动、微调并贯通预览和导出。
3. [新需求-中] 批量导出支持“全部语种分别导出”，增加资源缺失检查和语种文件名后缀。
4. [新需求-中] 自定义构图接入高级效果，替换图片释放旧 Object URL，数值输入格式化展示。
5. [维护-中] 统一页面版本显示，Preview Release 工作流从 tag 动态生成版本化文件名。
6. [维护-小] 新增缩放连续性、CPR 自定义边界、多语言导出矩阵测试。

### 本轮验证记录

- [x] 0.1.20 完成后验证：`npm run verify:core`、`npm test`、`npm run build`、`git diff --check` 通过；48 tests。

## 0.1.20.1 → 0.1.22

1. [问题修复-大] CPR 使用相对偏移、0.5U 推荐底边距和 0.25U 安全边距，支持画板级拖动与恢复推荐位置。
2. [问题修复-大] 五语言导出固定且严格校验资源，无跨语言静默回退；导出计数、预览和语言文件名一致。
3. [重构-大] 品牌状态迁移至 `BoardBrandStateMap`，画板级 Logo / CPR 由同一状态记录派生。
4. [重构-中] 建立 `services/export` 服务边界，建立 app 外壳与 GIF 模块占位。
5. [维护-中] 版本统一为 0.1.22；新增 CPR、语言矩阵、状态迁移测试；自动更新仍未启用。

### 本轮验证记录

- [x] 0.1.22 完成后验证：`npm run verify:core`、`npm test`、`npm run build`、`git diff --check` 通过；51 tests。

## 0.1.23

1. [重构-大] `boardBrandStates` 成为唯一画板品牌可写状态；移除 Logo / CPR 双 Map 组件传递。
2. [重构-大] `BatchExportDialog` 与导出编排移出应用组合文件；导出循环不在 App UI 层。
3. [重构-中] 建立媒体、自定义、GIF 模块边界与 app 组合入口。
4. [重构-中] 新增 `AppActivity` 聚合导出与对话框活动状态；自动更新仍未接入。
5. [维护-中] 版本统一为 0.1.23，记录纯重构发现，不修复产品行为。

### 本轮验证记录

- [x] 0.1.23 每个阶段均执行 `npm run verify:core`、`npm test -- --run`、`npx tsc --noEmit -p tsconfig.app.json`、`npm run build`、`git diff --check`。
- [x] 最终验证：51 tests 通过。

## 0.1.24

1. [重构-大] 画板品牌状态 reconcile 单源化，默认值不会覆盖已有画板；预览、聚焦编辑与导出继续直接使用 `BoardBrandStateMap`。
2. [重构-大] 批量导出编排移入导出服务，进度、失败与压缩信息结构化返回；对话框只保留导出 UI 与触发逻辑。
3. [重构-中] 建立媒体 actions/selectors、FocusEditor、确认弹窗和品牌控制边界；`boardBrandStates` 成为 Logo / CPR 的唯一画板可写状态。
4. [重构-大] 建立 `AppRuntimeProvider`：App 根层拥有模块切换、品牌资源、全局设置和 AppActivity；`MediaWorkbench` 不再托管自定义、GIF 或应用外壳。
5. [重构-中] 设置弹层、品牌资源替换 / 恢复和隐藏 SVG 上传入口迁移至 `GlobalDialogs`；根层直接聚合 settings activity，设媒模块只汇报导出、聚焦与确认状态。
6. [维护-中] package、Cargo、Cargo.lock、Tauri 版本统一为 0.1.24；Tauri 2 桌面壳已经接入，自动更新仍未接入。
7. [验证-中] AppActivity、根层设置入口、模块切换和状态聚合由专项测试覆盖；不修改产品行为。
