# 组内循环工具箱：可行性验证与分阶段执行方案

> 状态：待审核
> 基准版本：`0.1.33` / `goal9-preview-updater`
> 外部方案核验日期：2026-07-23
> 文档目的：只定义可行性、阶段边界、执行顺序和验收门禁；本文件不授权立即实现。
> 本轮未修改业务代码、依赖、Tauri 配置、发布或更新链路。

> 执行路线更新：本文件的架构边界、状态隔离、双平台验证和第三方声明要求继续有效；具体执行顺序与媒体工具路线以 `TOOLBOX_EXECUTION_PLAN.md` 为准。Shutter Encoder 与 ScreenToGif 路线已停止，后续 GIF、普通媒体处理和可见水印仅评估可嵌入的成熟 FFmpeg GUI，并复用一份 FFmpeg sidecar。

## 1. 结论摘要

整体路线可行，但不能把所有阶段理解成同一种“接入”：

| 阶段 | 可行性 | 推荐方式 | 关键限制 |
|---|---|---|---|
| UI 规则统一 | 可行 | 修改现有 React/CSS 与设计 tokens | 必须先合并当前在途 UI 改动；不重排面板 |
| 社媒 Logo Fabric 操作 | 可行 | 仅替换 Focus 中的命中、拖动、等比缩放 | Fabric 不接管 Render Plan 和正式导出 |
| 共享画布基础 | 可行 | 共享视口、坐标、选框基础，不共享业务状态 | 禁止演化成通用图层系统 |
| Shutter Encoder | 有条件可行 | 独立安装、独立窗口、传文件路径启动 | 无稳定公开的一键预设 API；不保证 GIF 严格小于 8MB |
| 默认启动模块 | 可行 | 新增独立的版本化应用偏好 | 默认打开应用内模块入口，不自动拉起外部程序 |
| 可见水印 | 可行 | 静态图复用现有 Canvas；动态媒体优先交给成熟媒体工具 | 独立状态，不污染 Brand/Render Plan |
| 像素隐形指纹 | 有条件可行 | Adobe TrustMark Rust + ONNX 隔离 PoC | 实验性辅助追溯，不是不可移除或法律级防伪 |
| 高级静态编辑 | 暂不进入近期路线 | 最后再评估独立外部工具 | 不进入当前核心程序 |

推荐总顺序不变：

```text
当前在途改动收口与视口实机验收
→ UI 规则统一
→ 社媒 Logo Fabric 操作
→ 画布基础能力收口
→ Shutter Encoder 隔离 PoC
→ GIF / 媒体工具入口
→ 默认启动模块设置
→ 可见水印
→ TrustMark 像素指纹隔离 PoC
→ 像素指纹正式入口
→ 根据反馈补批量能力
→ 最后再评估高级静态编辑
```

## 2. 执行前必须处理的事实与冲突

### 2.1 当前工作区不是干净基线

当前分支存在尚未提交的 UI、自定义构图和测试改动，主要涉及：

- `src/styles/tokens.css`
- `src/styles/components.css`
- `src/modules/custom-workbench/CustomWorkbench.tsx`
- `src/modules/custom-workbench/CustomFabricOverlay.tsx`
- `src/components/brand/*Controls.tsx`
- `TASKS.md`
- `CHANGELOG.md`
- 未跟踪的 `artifacts/`
- 未跟踪的 `src/modules/custom-workbench/customWorkbenchUi.test.tsx`

这些改动已经包含部分 UI token、属性行、选框和自定义工作台工具栏调整。

执行任何新阶段前必须：

1. 由当前执行者完成、提交或明确放弃这批改动。
2. 禁止使用 `reset --hard`、覆盖式 checkout 或删除 `artifacts/`。
3. UI 阶段从“评估当前在途改动还缺什么”开始，不从 `HEAD` 重新做一遍。

### 2.2 OpenDesign 参考文件当前不可访问

需求指定：

```text
/mnt/data/Social-Media-Dashboard.html
```

当前环境未找到此文件。因此本次没有重新检查其颜色、间距、辉光和模糊参数。

UI 阶段开始前必须把文件复制到可访问路径，例如：

```text
docs/references/Social-Media-Dashboard.html
```

或者重新附加文件。文件缺失时只能执行 OpenPencil/Pencil 与现有 UI 规范，不能声称已匹配 OpenDesign。

### 2.3 包体规则与最新产品决策冲突

`AGENTS.md` 当前仍规定：

> 单项预计增加超过 10MB 必须停止。

但最新确认是：

- Windows 离线 WebView2 约 200MB 视为稳定安装的固定成本。
- 包体是观察项，不再作为普通依赖接入的硬阻断。
- 仍需防止无必要地打包 Python、PyTorch、完整模型环境或重复运行时。

后续真正实施前，应先把规则改为：

> 记录各平台包体增量；出现异常增长时说明来源并由用户决策，不设置统一的 10MB 自动停止线。

本审核文档不直接修改 `AGENTS.md`。

## 3. 当前架构可承接程度

### 3.1 已有模块边界

当前应用已经存在：

```text
AppShell / AppRuntimeProvider
├─ media：设媒工作台
├─ custom：自定义构图
└─ gif：占位模块
```

关键文件：

- 模块壳：`src/app/App.tsx`
- 运行时与模块切换：`src/app/AppRuntimeProvider.tsx`
- 模块导航：`src/components/ModuleNav.tsx`
- 设媒：`src/modules/media-workbench/`
- 自定义：`src/modules/custom-workbench/`
- GIF 占位：`src/modules/gif-compressor/`
- 桌面桥接：`src/platform/`
- Tauri：`src-tauri/`

因此不需要重做应用壳，也不需要引入路由库。

### 3.2 必须继续维持的状态所有权

- 设媒状态继续归 `MediaWorkbench`。
- 自定义状态继续归 `CustomWorkbench`。
- GIF / 媒体工具只保存外部工具路径、入口状态和必要的启动结果。
- 水印使用独立 module state，不写入 `BrandLayerState`。
- 像素指纹使用独立实验模块和记录模型，不写入品牌设置。
- 不建立能够统一图片、视频、GIF、Fabric、Shutter 和 TrustMark 的“万能文档状态”。

## 4. 阶段 A：当前在途改动收口与视口验收

### 目标

建立后续 UI 阶段的可信基线，不继续增加功能。

### 执行步骤

1. 检查当前未提交 diff，确认每项改动的来源和完成状态。
2. 运行：

   ```bash
   npm run verify:core
   npm test
   npm run build
   ```

3. 实机验证现有 Focus 视口：
   - 适合窗口
   - 实际尺寸 100%
   - 指针位置缩放
   - Space / 中键平移
   - 定位 Logo
   - 缩小后居中
   - 导出坐标不受查看视口影响
4. 保留当前截图为 UI `before` 基线，不能覆盖原文件。
5. 将当前在途改动整理为独立提交后，再进入 UI 阶段。

### 验收矩阵

- Windows x64 / macOS arm64
- 1440×900 / 1100×720
- 横版 / 方图 / 竖版
- 100% / 适合窗口 / 300%

### 禁止

- 不顺手改发布、更新、导出或品牌规则。
- 不把本阶段变成新的 UI 重构。

## 5. 阶段 B：真正可见的 UI 规则统一

### 目标

保持页面结构和面板宽度不变，系统性统一桌面设计工具的文字、控件、分组、状态和选框视觉。

### 参考优先级

1. OpenPencil / Pencil：属性面板、文字层级、属性行、控件尺寸、状态、选框与控制点。
2. Figma：只用于画布交互语义，不用于视觉复刻。
3. OpenDesign HTML：只用于深色层级与留白；排除大辉光、重玻璃和 Dashboard 卡片。

### UI token 决策先行

开始改页面前，先完成一张 token 审核表：

| 项目 | 需要确定的唯一规则 |
|---|---|
| 标题 | 应用标题 / 页面标题 / 分组标题 |
| 正文 | 主正文 / 标签 / 辅助说明 / 数值 |
| 控件高度 | 默认 / 紧凑 / 图标按钮 |
| 间距 | 属性行 / 组内 / 大分组 / 面板内边距 |
| 圆角 | 控件 / 弹窗 / 选框标签 |
| 边框 | 默认 / hover / selected / focus / error |
| 背景 | 应用 / 面板 / 分组 / 控件 / 画布 |
| 状态 | default / hover / active / selected / focus / disabled / warning / error |
| 选框 | 边框、控制点、标签、不同倍率下的屏幕尺寸 |

### 主要实施文件

- `docs/UI_GUIDE.md`
- `src/styles/tokens.css`
- `src/styles/theme.css`
- `src/styles/components.css`
- `src/styles.css`
- `src/components/ui/*`
- `src/components/overview/*`
- `src/modules/media-workbench/BrandControlsPanel.tsx`
- `src/modules/media-workbench/FocusWorkspace.tsx`
- `src/modules/custom-workbench/CustomWorkbench.tsx`
- `src/modules/custom-workbench/CustomFabricOverlay.tsx`

### 特别风险：旧 CSS 与后置覆盖

当前 `src/styles.css` 仍有大量旧硬编码，`components.css` 又通过后置加载覆盖它。实施时不能只增加更多覆盖层。

处理原则：

1. 先定位重复声明。
2. 规则能安全迁移时，删除旧声明并使用 token。
3. 不为追求“零重复”进行大规模无关 CSS 重构。
4. 禁止继续添加第三层临时 override 文件。

### 文案与 tooltip

1. 界面保留动作与结果：`适合窗口`、`实际尺寸`、`定位 Logo`、`裁切复位`。
2. 工程解释、坐标原理、同步范围等长说明移入 tooltip 或帮助入口。
3. tooltip 不得承载完成任务所必需的关键信息。
4. 图标按钮必须有 `aria-label`、`title` 和足够点击区域。

### 视觉约束

- 默认控件、面板、选框不发光。
- 选中状态使用 1px 边框、轻微背景和文字变化。
- 不使用大范围 glow。
- 不使用大面积 `backdrop-filter`。
- 不增加展示型 Dashboard 卡片。
- 保持现有深色主题和冷蓝主状态色。

### 截图交付

必须使用相同数据、相同窗口尺寸、相同页面状态生成：

```text
artifacts/ui-rule-unification/before/
artifacts/ui-rule-unification/after/
```

至少包含：

- 总览 1440×900
- 总览 1100×720
- 聚焦画板 1440×900
- 聚焦画板 1100×720
- 自定义构图 1440×900

每组截图必须并排审阅，不能只提交 after。

### 验收标准

- 肉眼可见层级变化，而不是只新增少量 token。
- 页面结构、左右面板宽度和业务内容没有变化。
- 总览、Focus、自定义使用同一套控件状态。
- 选中状态不只依赖颜色。
- 1100×720 无横向溢出和不可触达操作。
- 键盘焦点可见。
- 自动测试、构建和双平台冒烟通过。

## 6. 阶段 C：社媒 Focus Logo Fabric 操作

### 目标

只替换社媒聚焦画板中 Logo 的手写矩形命中、拖动和缩放交互。

### 当前接入点

- Focus UI：`src/modules/media-workbench/FocusWorkspace.tsx`
- 视口纯函数：`src/modules/media-workbench/focusCoords.ts`
- 草稿事务：`src/modules/media-workbench/focusSession.ts`
- 现有 Render Plan：`buildBrandRenderPlan()` / `BoardCanvas`
- 自定义 Fabric 参考实现：`src/modules/custom-workbench/CustomFabricOverlay.tsx`

### 推荐实施

新增 Focus 专用交互层，例如：

```text
src/modules/media-workbench/FocusFabricOverlay.tsx
src/modules/media-workbench/focusFabricCoords.ts
src/modules/media-workbench/focusFabricState.ts
```

不能直接复用 `CustomFabricOverlay` 的业务对象模型，因为后者绑定游戏 Logo、公司 Logo、CPR 三个对象。

可以共享：

- Fabric Canvas 生命周期
- 选框和控制点视觉 token
- viewport/frame 坐标转换
- 边界约束辅助函数

### 执行步骤

1. 先只接 Logo，不同时改 CPR。
2. Fabric 中只建立一个 Logo 交互代理对象。
3. 禁止旋转、自由拉伸、多选、复制、删除。
4. Fabric 消费与底图、安全区、选框相同的 viewport。
5. 对象操作结束后只写回现有：

   ```text
   manualOffset
   scale / sizePreset 对应的业务缩放状态
   ```

6. 保存继续经过 `FocusSession` 草稿事务。
7. 正式预览和导出继续使用现有 Render Plan。
8. Logo 验收通过后，另开小阶段决定 CPR 是否接入相同交互层。

### 关键测试

- 25% / 100% / 300% 下选框屏幕尺寸稳定。
- 指针命中与视觉 Logo 基本一致。
- 拖动后业务坐标不漂移。
- 四角只能等比缩放。
- 语种切换后位置和缩放不跳变。
- 定位 Logo 只改视口。
- 保存、取消、模块切换草稿保护不退化。
- 导出结果与操作后位置一致。

## 7. 阶段 D：共享画布基础能力收口

### 目标

减少 Focus 与 Custom 的重复数学和交互外观，但不合并两边业务。

### 允许共享

- ViewportController
- 适合窗口 / 实际尺寸 / 定位对象
- 指针缩放和平移规则
- Canvas 与屏幕坐标转换
- Fabric viewport 映射
- 选框与控制点主题
- 固定对象边界约束工具

### 禁止共享

- Logo / CPR / game / company 业务对象枚举
- FocusSession 与 Custom state
- 品牌同步范围
- 导出业务状态
- 通用图层树或通用编辑文档

### 验收

- Windows 与 macOS 行为一致。
- 高 DPI 下命中与拖动无明显偏差。
- 横、方、竖画板稳定。
- 修复视口基础时只需改一份实现。
- 不新增用户可见功能。

## 8. 阶段 E：Shutter Encoder 隔离 PoC

### 可行性结论

Shutter Encoder 能覆盖多数需求：

- Windows / macOS
- MP4 / MOV 输入
- GIF 输出
- 入点 / 出点
- 缩放、裁切、帧率
- 批处理和队列
- 预设
- 图片或视频水印
- 简体中文与繁体中文资源

但存在四个不能忽略的限制：

1. 官方程序约 160–185MB，并带自定义 Java Runtime、FFmpeg 和多种工具。
2. 主项目为 GPL-3.0；内部使用不等于可以删除许可证和来源说明。
3. 启动参数可传入文件路径，但没有公开稳定的完整 CLI / IPC。
4. 不能预先承诺通过工作台自动设置尺寸、帧率、预设并自动开始，也不能承诺 GIF 必定小于 8MB。

### 推荐集成形态

第一选择：Shutter Encoder 独立安装。

```text
品宣物料工作台
→ GIF / 媒体工具
→ 检测 Shutter Encoder
→ 传入用户选中的文件路径并启动独立窗口
→ 用户在 Shutter 中使用保存的组内预设
```

不推荐第一版将 Shutter 整体捆进当前 Tauri 安装包，原因：

- 安装包直接增加约 160–185MB。
- 重复 JRE、FFmpeg 和多个第三方二进制。
- 双平台签名、公证、更新责任变复杂。
- Shutter 自身存在更新与网络行为。
- 当前 Tauri updater 不应负责更新 Shutter。

### PoC 必须回答的问题

1. Windows x64 与 macOS arm64 能否从命令行传入含中文、空格的 MP4/MOV 路径。
2. 启动后文件是否稳定出现在任务列表。
3. 用户保存 GIF 预设后，重启是否稳定保持。
4. 能否通过启动预设缩短到“选文件 → 核对 → 开始”。
5. 是否仍必须手工点击开始。
6. MP4/MOV → GIF 的裁切、尺寸、帧率、质量和批处理是否满足组内场景。
7. GIF 循环行为是否满足需求；当前应按“无限循环”为默认预期。
8. 8MB 需求能否靠预设稳定达到；若不能，界面不得写“保证 8MB”。
9. 图片/视频水印是否满足位置、尺寸、透明度和批量要求。
10. 断网时启动、处理、退出是否正常。
11. 是否有更新、yt-dlp 等出站尝试；这些尝试是否影响离线使用。
12. 中文 UI、中文路径、中文输出名是否正常。

### PoC 方式

- 不改主项目。
- 不把 Shutter 复制进仓库。
- 用独立测试记录保存两个平台的版本、路径、操作步骤、截图、结果和失败点。
- 必要时制作一份 `.enc` 预设，但不能把它当成稳定 API，除非双平台实测通过。

### Go 条件

- 两个平台可稳定传文件路径启动。
- 常见 MP4/MOV 能完成 GIF 转换。
- 中文路径正常。
- 组内预设能显著缩短操作。
- 无网环境仍可完成核心处理。
- 许可和第三方声明可接受。

### No-Go 条件

- 必须做到无人工操作的一键转码。
- 必须严格保证 GIF 小于指定体积。
- 必须严格零出站且不允许配置或修改 Shutter。
- 必须把 Shutter UI 内嵌到当前窗口。
- 不能接受用户额外安装一个独立工具。

任一 No-Go 条件成立时，停止 Shutter 集成，改为评估成熟的 Web / Electron FFmpeg GUI；仍然不从零设计。

## 9. 阶段 F：GIF / 媒体工具正式入口

仅在 Shutter PoC 通过后实施。

### 最小功能

- 模块名称：`GIF / 媒体工具`
- 检测 Shutter 是否可用。
- 允许用户选择或修正程序路径。
- 从工作台选择一个或多个文件。
- 通过受控 Tauri command 启动外部程序并传入文件路径。
- 提供简短中文说明和组内预设使用说明。
- Shutter 不可用时显示安装/定位指引。

### 安全边界

- 不允许前端提交任意可执行命令。
- Rust 侧只允许启动已确认的 Shutter 可执行文件。
- 参数只允许规范化后的用户所选文件路径。
- 不引入通用 shell 权限。
- 不让 Shutter 的错误导致主工作台退出。

### 明确不做

- 不复制 Shutter UI。
- 不从源码抽取 Java 面板。
- 不由当前 updater 更新 Shutter。
- 不承诺自动点击开始。
- 不承诺目标体积。
- 不把 Shutter 任务队列同步回当前 React 状态。

## 10. 阶段 G：默认启动模块设置

### 可行性结论

当前 `AppRuntimeProvider` 将模块固定初始化为 `media`，可以通过独立的版本化应用偏好扩展，不应塞进品牌设置。

### 建议数据结构

```ts
type StartupModule = 'media' | 'custom' | 'gif' | 'last';

type AppPreferencesV1 = {
  version: 1;
  startupModule: StartupModule;
  lastModule: 'media' | 'custom' | 'gif';
};
```

### 实施步骤

1. 新增独立 `AppPreferencesV1` 与 localStorage key。
2. 应用启动时解析并校验。
3. `last` 使用最近一次成功进入的模块。
4. 模块不可用、外部工具路径失效或数据损坏时回退 `media`。
5. 每次成功切换模块后记录 `lastModule`。
6. 设置中增加“启动时打开”。
7. 升级迁移时默认保持 `media`，不突然改变现有用户启动行为。

### 重要语义

选择 `GIF / 媒体工具` 表示启动后打开应用内 GIF 模块入口，不表示自动启动 Shutter 外部进程。

### 不在本阶段处理

- 不把 Custom/GIF 改成永久挂载。
- 不恢复上次未保存任务。
- 不新增工具箱首页。

## 11. 阶段 H：可见水印

### 目标边界

- 文字水印
- Logo / 图片水印
- 位置、尺寸、透明度
- 单个或平铺
- 批量处理
- 输出新目录，不覆盖原文件

### 推荐分流

```text
静态 PNG/JPG/WebP
→ 现有 Canvas / 独立 Watermark Render Adapter

GIF / MP4 / MOV
→ Shutter Encoder 或已验证的同一成熟媒体工具
```

### 架构要求

- 新建独立水印模块状态。
- 不复用或扩展 `BrandLayerState`。
- 不把普通水印写入设媒 BoardBrandState。
- 只共享文件选择、输出目录、任务进度和错误提示。
- 静态水印渲染器与动态媒体工具相互独立。

### 第一版不做

- 多水印图层。
- 富文本。
- 路径文字。
- 动画关键帧。
- 视频剪辑。
- 原文件覆盖。
- 自研媒体处理内核。

### 实施门禁

若 Shutter 的水印工作流无法满足组内操作效率，应先评估其他成熟工具，不得立刻改为自研 FFmpeg UI。

## 12. 阶段 I：像素隐形指纹 PoC

### 首选候选

Adobe TrustMark 官方 Rust + ONNX 实现。

### 可行性

- MIT 许可。
- Rust 支持二进制载荷编码与解码。
- 使用 ONNX Runtime。
- 支持 Windows 10/11 和 macOS。
- 可完全本地运行。
- 不需要 Python 或 PyTorch。

### 需要接受的成本

- 官方模型默认不随源码提供，必须在构建阶段固定版本、下载、校验并随安装包分发。
- Q encoder + decoder 约 61.7 MiB；C 约 37.9 MiB。
- 还需 ONNX Runtime，最终包体必须以双平台 release build 为准。
- 它不是简单 UI 适配，还需要接收方记录、载荷映射、批处理、检测和记录清单。

### 正确定位

产品名称：

```text
像素隐形指纹（实验性）
```

说明：

> 为文件写入可读取的隐形编号，用于常规转载、压缩或意外泄露后的辅助追溯。它不能保证对主动移除、覆盖、伪造、重绘或严重裁切仍然有效，也不能单独作为法律级证据。

### 载荷设计

图片中只嵌入 opaque record ID，不嵌入供应商名称、任务名或其他明文。

```text
图片载荷：短随机 ID / 二进制编号
本地记录：供应商、任务、时间、原文件哈希、输出哈希、应用版本、TrustMark 参数
```

Rust 当前只接受二进制字符串，这与 opaque ID 设计兼容。

### 推荐 PoC 配置

同时评估：

- Q + BCH_5：鲁棒性优先。
- C + BCH_5：包体与速度对照。

### PoC 样本矩阵

- JPG / PNG / WebP
- 透明图
- 150px 小图
- 1080p / 4K / 超大图
- 横版 / 竖版 / 超宽 / 超长
- 角色立绘、纯色、渐变、复杂背景
- 平台二压
- 截图
- 缩放
- 约 20% 裁切
- 强 JPEG 压缩
- 轻度调色

### 必须记录

- 冷启动模型加载时间
- CPU 单张耗时
- 批量 10 / 50 张耗时
- 峰值内存
- 包体增量
- 可见纹波和颜色变化
- 各种处理后的识别率
- Windows / macOS 差异

### Go 条件

- Rust crate 与当前 Tauri 依赖树可稳定构建。
- ONNX Runtime 能稳定打包。
- 公司真实样本的画质可接受。
- 真实渠道处理后的识别率达到内部约定阈值。
- 批处理性能可接受。
- 记录清单与编号校验能排除随机误读。

### No-Go 条件

- 要求恶意攻击者无法移除或伪造。
- 要求单张图片本身构成法律级证据。
- ONNX Runtime 或模型无法稳定进入双平台发布链。
- 画质变化不可接受。
- 真实渠道压缩后的识别率过低。

## 13. 阶段 J：像素隐形指纹正式入口

仅在 PoC 通过后实施：

- 写入指纹
- 检测指纹
- 读取 record ID
- 批量处理
- 接收方表
- 导出记录清单
- 失败与不确定结果

### 模块隔离

- Tauri Rust 负责模型和图片处理。
- React 只负责文件、接收方、任务、进度和结果。
- 模型会话复用，不能每张图片重复加载。
- 批量任务串行或有限并发。
- 默认关闭并明确标记实验性。

## 14. 统一第三方接入与许可清单

新增任何第三方工具前建立：

```text
THIRD_PARTY_NOTICES.md
third-party-licenses/
```

每项记录：

- 项目名称
- 作者/组织
- 使用版本与 commit
- 官方仓库
- 许可证
- 修改说明
- 分发方式
- 包含的模型或二进制
- 更新责任

### Shutter Encoder

- GPL-3.0。
- 推荐独立安装，不与当前安装包合并。
- 保留名称、作者、许可证和源码入口。
- 若发给供应商、外包或其他法人主体，重新做合规评估。

### TrustMark

- MIT。
- 保留版权与许可证。
- 模型、ONNX Runtime 和 Rust 依赖分别进入第三方声明。

## 15. 发布与阶段门禁

每个阶段必须独立完成：

1. 只读现状确认。
2. 最小实现或隔离 PoC。
3. 自动测试。
4. Windows x64 验证。
5. macOS arm64 验证。
6. 截图或真实产物对比。
7. 失败项和已知限制。
8. 用户审核。
9. 审核通过后才进入下一阶段。

不得同时开启 UI、Focus Fabric、Shutter 和 TrustMark 四个大阶段。

## 16. 建议的版本切分

版本号仅为建议，实际应以当前在途提交完成后的版本为准：

| 建议阶段 | 内容 |
|---|---|
| `0.1.34` | UI 规则统一与截图对比 |
| `0.1.35` | 社媒 Focus Logo Fabric 操作 |
| `0.1.36` | 共享画布基础与双平台收口 |
| `0.1.37-poc` | Shutter Encoder 隔离验证，不发布给普通用户 |
| `0.1.37` | GIF / 媒体工具入口 |
| `0.1.38` | 默认启动模块设置 |
| `0.1.39` | 可见水印 |
| `0.1.40-poc` | TrustMark 隔离验证 |
| `0.1.40` | 像素隐形指纹实验入口 |

## 17. 本次审核需要用户确认的决策

### 决策 1：Shutter 的集成形态

推荐：用户独立安装 Shutter，工作台检测并启动它。

需要确认是否接受：

- 用户需要额外安装一次 Shutter Encoder。
- 工作台不能可靠自动设置全部参数并自动开始。
- 组内预设主要由 Shutter 自己管理。
- 第一版不保证 GIF 严格小于 8MB。

如果不能接受，Shutter 应判定 No-Go，转而评估另一套成熟的可嵌入 FFmpeg GUI。

### 决策 2：默认启动 GIF 的含义

推荐定义：启动应用后打开 GIF / 媒体工具入口页，不自动拉起外部 Shutter。

### 决策 3：TrustMark 的能力边界

需要接受：

- 它可以辅助追溯普通转载或意外泄露。
- 知道算法的恶意使用者可能移除、覆盖或伪造指纹。
- 指纹结果必须结合本地记录和文件哈希，不能单独作为责任证明。

### 决策 4：包体规则

推荐取消统一 10MB 停止线，改为记录实际增量、说明来源、由用户审核异常增长。

### 决策 5：OpenDesign 参考文件

UI 阶段前需要重新提供可访问文件；否则该参考只能从本轮实施范围中暂时移除。

## 18. 审核通过后的第一条执行指令建议

本计划审核通过后，不要直接启动所有阶段。第一条执行指令应仅为：

```text
按 docs/TOOLBOX_ROADMAP_FEASIBILITY_REVIEW.md 执行“阶段 A：当前在途改动收口与视口验收”。

只处理当前未提交改动的收口、自动验证、双平台视口人工验证和 before 截图基线。
不要开始 UI 规则统一，不要接 Focus Fabric，不要评估或接入 Shutter/TrustMark，不要修改发布与自动更新链路。

完成后提交阶段报告并等待审核。
```

## 19. 官方资料与核验来源

本节仅列一手来源。许可证判断用于工程规划，不替代公司法务意见。

### Shutter Encoder

- 官方仓库与功能说明：`https://github.com/paulpacifico/shutter-encoder`
- 官方 GPL-3.0 许可证：`https://github.com/paulpacifico/shutter-encoder/blob/master/LICENSE.txt`
- 官方文档：`https://www.shutterencoder.com/documentation/`
- 官方下载：`https://www.shutterencoder.com/#downloads`
- GNU GPL FAQ：`https://www.gnu.org/licenses/gpl-faq.html`

仓库源码核验点：

- `src/shutterencoder/ui/main/Shutter.java`：启动参数作为输入文件路径处理。
- `src/shutterencoder/utils/Utils.java`：`.enc` 预设保存与加载。
- `src/shutterencoder/functions/Picture.java`：图片/GIF 处理链。
- `Languages/zh_CN.properties`、`Languages/zh_TW.properties`：中文资源。

### Adobe TrustMark

- 官方仓库：`https://github.com/adobe/trustmark`
- 官方 Rust 说明：`https://github.com/adobe/trustmark/blob/main/rust/README.md`
- 官方 JS 说明：`https://github.com/adobe/trustmark/blob/main/js/README.md`
- 官方 FAQ：`https://github.com/adobe/trustmark/blob/main/FAQ.md`
- CAI 官方文档：`https://opensource.contentauthenticity.org/docs/trustmark/`
- Adobe Research 论文页：`https://research.adobe.com/publication/trustmark-robust-watermarking-and-watermark-removal-for-arbitrary-resolution-images/`

### UI 参考

- OpenPencil / Pencil：实施前需锁定用户认可的具体页面或截图，避免把“参考”解释成整站复刻。
- Figma：只采用画布交互语义，不复制整体产品结构。
- OpenDesign：等待重新提供 `Social-Media-Dashboard.html` 可访问副本。
