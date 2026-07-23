请以当前 goal9-preview-updater 分支和 0.1.33 为基线，连续完成下面的后续路线。

参考已有审核文档：

TOOLBOX_ROADMAP_FEASIBILITY_REVIEW.md

该文档中的架构边界、状态隔离、双平台验证和第三方声明要求继续有效，但执行路线按本指令修正：停止 Shutter Encoder 路线，GIF、普通媒体处理和可见水印统一采用可嵌入的成熟 FFmpeg GUI + 一份 FFmpeg sidecar。水印与像素指纹使用同一个用户界面。

总执行规则

本次可以连续执行全部阶段，不需要每完成一个小阶段都等待确认，但必须：

严格按下面顺序执行。
每个阶段单独提交，不能把多个阶段混进同一提交。
每个阶段先验证再进入下一阶段。
只有出现真正阻断项时才停止：
双平台无法运行；
没有合适的成熟开源方案；
许可证明显无法接受；
包体或运行时异常膨胀；
会破坏现有 Render Plan、导出或更新链路。
除非当前阶段明确标为“仅规划”，候选方案明确可行时，应继续做隔离 PoC和最小正式接入。
不修改或删除用户已有的 artifacts/。
不使用 reset --hard、覆盖式 checkout或其他会丢失现有改动的操作。
不引入 Python、PyTorch、完整开发环境或重复媒体运行时。
Windows离线 WebView2约200MB是已接受的固定安装基线，不再使用统一10MB硬停止线。记录每项真实包体增量，异常增长时说明原因。
不自研编码、量化、水印、指纹、时间轴、图层或通用编辑器底层能力。
miniPaint、Photopea / Canva / Photoshop 类专业静态编辑器及完整开源图片编辑器已从当前产品路线取消；当前不以内嵌、可选安装包、独立子工具、项目内调用或兼容层方式进入本项目，也不为未确认需求主动预埋高级编辑架构。未来仅可在其他已确认功能出现真实需求后，重新完成用户确认、边界审计、依赖/许可证与包体评估。
阶段一：当前在途改动收口

先检查工作区已有的 UI、自定义构图、测试和文档改动。

完成：

判断每项未提交改动是否完整。
修复残留问题。
保留并整理当前 UI before截图。
运行完整验证。
单独提交为可信基线。

执行：

npm run verify:core
npm test
npm run build
cargo fmt --check
cargo check
cargo test

同时将用户提供的 OpenDesign参考文件固定保存到仓库，例如：

docs/references/Social-Media-Dashboard.html

不要继续依赖临时 /mnt/data 路径。

阶段二：真正可见的 UI规则统一

本阶段只处理 UI规则，不修改业务流程、Render Plan、导出、同步和整体页面结构。

参考优先级
Pencil / OpenPencil

作为 UI主参考：

属性面板
文字层级
标签与数值排布
控件高度
控件间距
默认、hover、active、selected、focus、disabled、warning、error状态
选框、控制点和对象标签

不是引入其源码或组件，只套用成熟设计工具的规则。

Figma

只参考画布行为：

适合窗口
实际尺寸100%
指针位置缩放
Space和中键平移
定位选中对象
缩小后自动居中
OpenDesign HTML

只参考：

深色层级
留白
面板、控件和画布的明暗关系

明确排除：

大范围辉光
重玻璃模糊
展示型 Dashboard卡片
过大的圆角
大面积渐变装饰
实施要求
保持当前左右面板结构和宽度。
保持模块导航结构。
统一设计 tokens，不继续堆叠临时 CSS override。
统一标题、分组标题、正文、标签、辅助文字和数值。
统一按钮、输入框、数字框、下拉框、滑块、分段控件和图标按钮。
减少卡片套卡片、重复边框和无意义背景块。
工程解释和长说明移入 tooltip或帮助入口。
tooltip不能承载完成任务必须知道的信息。
图标按钮必须有 aria-label、title 和足够点击区域。
默认面板、控件和选框不发光。
选中状态使用1px边框、轻微背景和文字变化。
保持深色主题和冷蓝主状态色。
截图要求

必须使用相同素材、相同窗口和相同状态生成 before/after：

artifacts/ui-rule-unification/before/
artifacts/ui-rule-unification/after/

至少包含：

总览 1440×900
总览 1100×720
聚焦画板 1440×900
聚焦画板 1100×720
自定义构图 1440×900

肉眼必须能看出变化，不能只新增少量 token。

阶段三：社媒聚焦画板 Logo Fabric操作

只处理社媒 Focus中的 Logo。

Fabric负责
准确命中
选中
拖动
四角等比缩放
边界约束
不同视图倍率下稳定的选框和控制点
Fabric不负责
正式渲染
正式导出
配色
图层系统
多选
旋转
复制
删除
通用对象模型

先只接 Logo，不同时改 CPR。

Fabric操作只写回现有：

manualOffset
现有 Logo 缩放状态

预览和正式导出继续使用 Render Plan。

验收：

25%、100%、300%稳定。
横、方、竖画板稳定。
语种或资源切换后位置不跳。
定位 Logo只修改视口。
保存、取消和草稿保护正常。
导出坐标与画布操作一致。
阶段四：共享画布基础能力收口

社媒 Focus和自定义构图只共享基础能力：

ViewportController
适合窗口
实际尺寸
定位对象
缩放和平移
Canvas与屏幕坐标转换
Fabric viewport映射
选框与控制点主题
固定对象边界约束

禁止共享：

Logo、CPR、游戏 Logo、公司 Logo的业务枚举
FocusSession和Custom状态
品牌同步范围
导出业务状态
通用图层树
通用编辑文档

本阶段不增加用户功能，只消除重复数学和交互规则。

阶段五 A：品宣工具箱启动器

目标是建立应用级工具入口，而不是新增编辑器或调整现有 Logo 工作台内部结构。

- 首页提供 Logo 与版式、GIF / 媒体工具、水印与追溯、设置四个入口。
- 当前版本只有 Logo 与版式与设置可用；未完成工具明确标记“即将开放 / 暂不可用”，不进入空白页。
- 现有设媒与自定义构图继续保留在 Logo 与版式工作区内；返回工具箱只切换应用入口，不改变 Render Plan、导出、同步、Fabric、模块导航或更新链路。
- 不引入 FFmpeg、Vue、独立 Tauri window 或第二套应用壳。

阶段五 B：默认启动设置

新增独立、版本化的应用偏好，不写入品牌设置或 `BoardDocument`：

```ts
type StartupTool = 'toolbox' | 'logo-layout' | 'gif-media' | 'watermark-trace' | 'last';

type AppPreferencesV1 = {
  version: 1;
  startupTool: StartupTool;
  lastTool: 'toolbox' | 'logo-layout' | 'gif-media' | 'watermark-trace';
};
```

- 本地持久化；损坏、未知版本和值均安全回退工具箱首页。
- 当前 GIF / 媒体工具和水印与追溯尚未实现；无论作为启动项或上次工具，均统一回退工具箱首页，不创建空模块。
- 只记录工具入口，不恢复未保存任务、工作台状态或素材。

阶段六 A：GIF / 媒体工具与隔离 PoC 规划（仅文档）

本阶段只执行 `docs/STAGE_6A_GIF_MEDIA_POC_PLAN.md` 所定义的产品、隔离和验收规划；不得接入 Vue、FFmpeg/FFprobe、sidecar、第二个 Tauri window 或任何二进制。

`a8e9ded` 与 `docs/FFMPEG_GUI_CANDIDATE_AUDIT.md` 的 No-Go 保留为旧路线的历史源码审计记录；它们已由 Stage 6A 的规划口径取代，不授权任何实现。

阶段六 B：FFUI 隔离 PoC（已授权，后端门禁阻断）

仅在用户明确批准 Stage 6B 后，才允许验证 FFUI Vue 前端能否作为当前 Tauri 应用的独立内部窗口/隔离前端入口运行，不带第二个 Tauri app、不要求用户额外安装。PoC 必须复用安装包内唯一 FFmpeg/FFprobe sidecar，并优先复用现成队列、进度、取消、错误和结果 UX；未通过前不得进入正式媒体模块。

2026-07-23 已完成 Stage 6B-UI Checkpoint：工具箱可打开 Vue 多页面的实验预览，并在当前 Tauri app 中创建 singleton 内部窗口。随后用户授权继续真实后端与首版可见水印，并明确覆盖内部工具的公开分发/许可证冻结条件。Stage 6B 以当前 Tauri 壳的唯一固定 sidecar 实施；来源、SHA-256、包体与运行时约束见 `docs/MEDIA_RUNTIME_SOURCES.md`。不允许 PATH、运行时下载、第二个 Tauri app、假进度、假结果或覆盖输入文件。

阶段六的候选条件

停止以下方案：

Shutter Encoder独立软件启动器
ScreenToGif
用户额外安装一个完整媒体软件
重新设计一套 FFmpeg操作界面

目标是：

找一个成熟开源的 Web、React、Vue、Svelte或普通 HTML FFmpeg GUI，复用其文件队列、参数组织、任务状态、进度、取消、错误处理和输出结果页面，再以隔离方式接入当前 Tauri应用。

候选条件

必须尽量满足：

可以嵌入 Tauri WebView。
UI源码可修改。
支持本地原生 FFmpeg，而非必须依赖服务器。
已有文件队列。
已有进度、取消和错误状态。
已有预设或参数管理。
Windows x64和macOS arm64可用。
可完全离线。
不强依赖 Electron运行时。
维护状态和代码质量可接受。
PoC必须验证
中文和空格路径。
MP4、MOV输入。
GIF输出。
起止时间。
尺寸。
帧率。
循环。
调色板和质量控制。
批量队列。
取消任务。
错误提示。
离线运行。
双平台 FFmpeg sidecar调用。
UI可裁剪和主题适配。
决策规则

候选明确可用时：

选定一个。
做隔离 PoC。
保留其核心 UX。
删除无关能力。
做中文化和现有主题适配。
不照着它重新写一套。

没有任何成熟候选满足时：

停止正式实现。
输出候选对比和失败原因。
不自行从零开发复杂 FFmpeg GUI。
阶段七：接入 GIF / 媒体工具

仅在阶段五选定成熟 GUI后执行。

当前状态：未开始。Stage 6B 后端门禁未通过，不能以 PATH、运行时下载、第二个 Tauri app 或自研队列绕过。

底层

全应用只分发一份平台对应的 FFmpeg sidecar。

它负责：

MP4 / MOV转GIF
GIF重新压缩
起止裁切
缩放
帧率
循环
调色板
批量任务
后续普通可见水印

不要重复打包多个 FFmpeg。

首版范围
文件选择和拖入
批量队列
起止时间
输出尺寸
帧率
循环
质量或体积倾向
输出目录
开始
取消
进度
成功和失败结果

可以提供组内预设，例如：

社媒动图·高清
社媒动图·8MB倾向
快速预览
原尺寸

“8MB倾向”不能写成“保证小于8MB”。

明确不做
逐帧编辑
多轨时间轴
关键帧
通用视频编辑
自研量化
自研编码
自研复杂预览播放器
阶段八：统一“水印与追溯”页面

当前状态：未开始。可见水印依赖 Stage 6B 的同一真实任务引擎；中文文字水印还依赖可审计的离线中文字体。隐形指纹继续不实现。

可见水印和像素指纹不要拆成两个模块。

用户看到一个统一页面：

水印与追溯
├─ 文件队列
├─ 可见水印
├─ 隐形指纹（实验性）
├─ 输出设置
├─ 任务进度
└─ 结果与记录清单

用户可以：

只开可见水印
只开隐形指纹
两项同时开启
一次批量导出

底层能力仍然隔离，不能为了统一 UI建立万能文档状态。

A. 可见水印

优先复用阶段五选定的成熟 FFmpeg GUI和同一份 FFmpeg sidecar。

支持：

文字水印
Logo / 图片水印
位置
大小
透明度
单个
平铺
批量
输出新目录
不覆盖原文件

首版不要：

多水印图层
富文本
路径文字
动画关键帧
视频剪辑
原文件覆盖

静态图、GIF和视频尽量使用同一成熟媒体处理方案。不要默认重新基于 Canvas开发完整水印工具。

只有在 FFmpeg方案对静态图明显不合适，且现有 Canvas可以用极小实现完成时，才允许增加单独静态适配层。

B. 隐形指纹

候选优先使用 Adobe TrustMark Rust + ONNX等成熟实现。

名称：

隐形指纹（实验性）

功能：

写入 record ID
检测指纹
读取 record ID
批量处理
接收方或用途
导出记录清单
失败和不确定结果

图片中只写短随机 ID，不写供应商、项目和任务明文。

本地记录包含：

record ID
接收方或用途
时间
原文件名
原文件哈希
输出文件哈希
应用版本
指纹参数
识别结果
文件类型行为

静态图片：

PNG / JPG / WebP
→ 可见水印可用
→ 隐形指纹可用

动态媒体：

GIF / MP4 / MOV
→ 可见水印可用
→ 隐形指纹首版禁用

禁用时显示简短原因，不跳转到其他页面。

处理顺序

不要预先硬编码：

水印 → 指纹

或：

指纹 → 水印

必须通过真实样本 PoC比较：

可见质量
平台压缩后的读取率
二次编码后的读取率
JPG / PNG / WebP差异
带透明通道素材
角色立绘、纯色、渐变和复杂背景

选择识别稳定性和画质更好的顺序。

TrustMark要求
使用 Rust、JS、ONNX等可离线实现。
不引入 Python或PyTorch。
模型固定版本并校验。
模型与ONNX Runtime进入第三方声明。
模型会话复用，不能每张图片重复加载。
批量任务串行或有限并发。
默认明确标记实验性。

产品说明必须明确：

用于普通转载、压缩或意外泄露后的辅助追溯，不保证对主动移除、覆盖、伪造、重绘或严重裁切仍然有效，不能单独作为法律级责任证明。

阶段九：第三方声明与发布收口

新增：

THIRD_PARTY_NOTICES.md
third-party-licenses/

记录每项：

项目名称
作者或组织
使用版本和commit
官方仓库
许可证
是否修改
分发方式
模型和二进制
更新责任

至少包含：

Fabric
选定的 FFmpeg GUI
FFmpeg
TrustMark
ONNX Runtime
其他随包分发的第三方依赖
发布验证
Windows x64
macOS arm64
离线运行
中文路径
空格路径
高 DPI
1100×720
1440×900
更新后设置保留
GIF转换
批量任务
可见水印
隐形指纹
原文件不被覆盖
失败任务不导致应用退出

记录：

前端dist增量
Windows安装包增量
macOS安装包增量
FFmpeg大小
GUI依赖大小
TrustMark模型大小
ONNX Runtime大小
峰值内存
典型任务耗时
最终禁止项

整个执行过程中禁止：

Shutter Encoder正式接入
ScreenToGif
用户额外安装独立媒体软件
从零设计复杂 FFmpeg GUI
自研 GIF编码或调色板
自研可见水印算法
自研隐形指纹算法
Python / PyTorch
通用图层系统
通用视频编辑器
通用图片编辑器
当前路线内的 miniPaint、Photopea / Canva / Photoshop 类专业静态编辑器
当前路线内的完整开源图片编辑器、独立静态编辑子工具、项目内外部软件调用或兼容层
多 Agent或额外服务
云端转码
首次使用联网下载模型
重复打包多个 FFmpeg
破坏现有 Render Plan和正式导出
最终提交要求

每阶段：

独立 commit。
更新 TASKS.md 和 CHANGELOG.md。
记录自动测试。
记录人工验证。
保留截图或真实产物。
清楚列出没有完成的内容。
不把浏览器开发环境验证冒充 Tauri实机验证。

所有阶段完成后，再统一生成 Preview安装包。不要中途频繁发布普通用户版本。
