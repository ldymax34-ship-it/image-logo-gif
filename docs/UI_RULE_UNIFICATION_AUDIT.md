# UI 规则统一：交互审查结论

## 审查范围与证据

- 产品表面：设媒总览、社媒 Focus、自定义构图。
- 当前证据：`artifacts/ui-rule-unification/before/` 中五张同素材、同窗口、同状态截图。
- 本地实现：现有 React 组件、`src/styles/tokens.css`、`theme.css`、`components.css`、`styles.css` 与相关静态回归测试。
- 主参考：OpenPencil `8561d73` 的 panel field、panel section、input、select、number field、segmented control、icon button 与 toolbar 规则；只提取通用规则，不引入源码或 Vue 运行时。
- 次参考：`docs/references/Social-Media-Dashboard.html` 的深色背景层级与留白；明确排除其 24–48px 辉光、20–40px 模糊、展示型卡片和装饰渐变。
- 画布行为：继续采用现有 Figma 类适合窗口、实际尺寸、指针缩放、Space/中键平移与定位对象语义；本阶段不改行为实现。

## 用户真实任务链

1. 导入一张或多张底图。
2. 应用尺寸套组或自定义画布尺寸。
3. 在总览中选择画板，必要时进入 Focus。
4. 调整裁切、Logo 与 CPR，确认选中对象和当前状态。
5. 检查画布结果。
6. 单张或批量导出。

## 对象能力表

| 对象 | 可见 | 可选中 | 可拖动 | 等比缩放 | 旋转 | 新增/删除 |
|---|---:|---:|---:|---:|---:|---:|
| Focus 底图 | 是 | 裁切工具内 | 是 | 通过素材缩放 | 否 | 仅替换素材 |
| Focus Logo | 是 | 是 | 是 | 现有业务缩放；Fabric 留待阶段 3 | 否 | 否 |
| Focus CPR | 是 | 是 | 是 | 现有业务缩放 | 否 | 否 |
| 自定义底图 | 是 | 裁切模式内 | 是 | 通过素材缩放 | 否 | 仅替换 |
| 自定义游戏 Logo | 是 | 是 | 是 | 是 | 否 | 否 |
| 自定义公司 Logo | 是 | 是 | 是 | 是 | 否 | 否 |
| 自定义 CPR | 是 | 是 | 是 | 是 | 否 | 否 |

## 当前主要问题

1. 面板、分组、字段和选中项的明暗差距偏小。总览与 Focus 截图里多个层级都落在相近灰度，用户需要靠边框逐个辨认。
2. 基础控件仍混用 30、32、34px，高度、字号和圆角没有完全收敛；普通字段边框偏重，连续多行时形成“表格框墙”。
3. Logo/CPR 分组继续同时使用卡片背景、完整边框、分割线和状态头，视觉表达重复；自定义构图也存在相同的卡片套分组感。
4. 默认、hover、selected、focus、disabled 已有部分规则，但 warning/error 和数据字段 invalid 状态没有形成完整 token 契约；部分 selected 仍主要依赖蓝色。
5. 应用标题、面板标题、分组标题、字段标签和辅助说明之间的字号/字重跨度不稳定，长说明与主操作竞争注意力。
6. Focus 提示栏和右侧说明对熟练用户长期常驻；它们应保留必要动作，工程解释通过 `title`/tooltip 补充，但不能隐藏完成任务必需的信息。
7. 旧 `styles.css` 仍包含硬编码基础控件声明，`components.css` 后置覆盖。继续添加第三层 override 会让状态再次分叉。

## 建议删除

- 分组中重复的完整卡片背景或完整四边框，只保留一种分组边界。
- 默认控件的装饰性高亮、选框微光和非必要阴影。
- 与可见标签重复的常驻工程说明。
- 新增第三套 CSS override 文件或页面局部颜色常量。

## 建议保留

- 72px 模块导航、现有左右面板结构与宽度。
- Focus 右侧查看倍率和命令位置。
- Logo、CPR、辅助工具的现有业务分组与同步入口。
- 自定义构图固定三对象、固定标题行导出入口和单层高级样式 disclosure。
- 现有冷蓝主状态色、深色主题、Render Plan、同步和导出链路。

## 交给成熟库的部分

- 自定义构图的命中、选框、拖动与四角等比缩放继续由 Fabric.js 负责。
- Focus Logo 的 Fabric 交互属于阶段 3，本阶段只统一其未来可复用的选框视觉 token，不提前接入行为。
- 浏览器原生 button/input/select/details 语义继续承载键盘与禁用状态；不新增通用组件运行时。

## 最小修改方案

1. 先更新 `docs/UI_GUIDE.md` 与唯一 token 表，定义排版、控件、间距、圆角、层级和状态。
2. 修改现有 `tokens.css`、`theme.css` 与 `components.css`；能安全移除的旧基础声明从 `styles.css` 删除，不增加新 override 文件。
3. 统一总览、Focus、自定义构图的标题、属性行、字段、分段控件、图标按钮、选中态、焦点态、禁用态、warning/error。
4. 缩短常驻说明，完整解释放入 `title`；关键动作和结果仍直接可见。
5. 用现有测试锁定状态和可访问标签；使用同素材、同窗口、同状态生成 after 截图并逐张与 before 比较。

## Token 决策表

| 项目 | 唯一规则 |
|---|---|
| 应用标题 | 16px / 600 |
| 页面标题 | 14px / 650 |
| 分组标题 | 12px / 650 |
| 正文 | 13px / 1.45 |
| 属性标签、辅助说明 | 12px；辅助说明使用 muted，不低于可读对比 |
| 数值 | 12px，`tabular-nums` |
| 默认控件 | 32px 高 |
| 紧凑控件、图标按钮 | 28px；可点击区域不得小于 28×28px |
| 属性行 | 最小 32px；标签列 52px；8px 列间距 |
| 间距 | 4 / 6 / 8 / 12 / 16 / 24px |
| 圆角 | 控件 4px，分组 4px，弹窗 8px，状态 pill 才使用全圆角 |
| 边框 | 默认透明或低对比 1px；hover 加深；selected/focus 使用 1px 主色，不改变布局 |
| 背景 | app < canvas < panel < field/hover，保持明确但低强度的深色层级 |
| selected | 1px 主色边框 + 轻微主色背景 + 文字变化；不能只依赖颜色点 |
| focus | 1px 主色 ring/outline + 1px offset；键盘可见，鼠标点击不常驻 |
| disabled | 降低文字/边框/背景对比并保持 `not-allowed`，不只使用透明度 |
| warning/error | 独立边框、轻背景和文字；字段 invalid 不使用 glow |
| 选框 | 主色 1px；控制点 10px 方形、浅色填充和主色边框；无辉光 |

## 明确不做

- 不重排或折叠左右面板，不移动查看倍率，不改模块导航和全局信息区域。
- 不新增图层系统、通用文档模型、通用编辑器或新设置页。
- 不改 Focus 视口数学、Fabric 手势、同步、Render Plan、导出、更新和发布链路。
- 不引入 OpenPencil 源码、Vue、外部组件库、字体、图标包或运行时。
- 不复刻 OpenDesign 的辉光、玻璃模糊、渐变装饰、大圆角和 Dashboard 卡片。

## 包体影响

- 预计仅 CSS、文案、现有 React 标记和测试变化，不新增运行时依赖。
- 前端 `dist` 只应出现 CSS/JS 文本级小幅变化；Windows/macOS 安装包无新增二进制或资源。

## 验收场景

1. 1440×900 与 1100×720：总览、Focus、自定义构图均无横向溢出，关键操作可达。
2. default / hover / active / selected / focus / disabled / warning / error 可区分，布局不跳动。
3. 选中态同时具有边框、背景和文字变化；键盘焦点清晰。
4. Logo/CPR 与自定义对象分组减少重复边框和卡片背景，画布仍是视觉中心。
5. 图标按钮具备 `aria-label`、`title` 和至少 28×28px 点击区域。
6. after 五张截图与 before 肉眼可见层级和密度变化，页面结构和面板宽度保持不变。
7. 自动测试、生产构建和 Rust 基础门禁全部通过；浏览器验证不冒充 Tauri 双平台实机验证。

## 证据限制

- 截图只能确认可见层级、密度和响应式结果，不能证明完整 WCAG 对比度、屏幕阅读器语义、键盘遍历顺序或原生 WebView 高 DPI 行为。
- hover、focus、disabled、warning/error 需结合 DOM/CSS 回归和人工交互检查；macOS/Windows Tauri 仍需后续实机复核。
