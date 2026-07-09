# 任务看板

## 当前版本：0.8.0 重构准备

### 产品方向

本仓库不新开新仓，直接从「渠道素材辅助工具」转向「品宣物料工作台」。

旧页面 `photo1.html` / `video1.html` / `test.html` / `suggest.html` 暂时作为 legacy 保留。新品宣能力不继续堆进旧单 HTML，而是逐步迁移为模块化前端应用。

跨平台桌面应用是中期目标：0.8.x 先完成 Vite + React + TypeScript Web 工作台闭环，0.9.x 再接 Tauri 做 macOS / Windows 桌面化。

### 已完成

- [x] `AGENTS.md` 从渠道工具维护规则改为品宣物料工作台重构规则
- [x] `AGENTS.md` 补充 Codex 总控规则：可读取本地 `.env` 中已配置的 API 密钥并按任务调度多个模型，密钥不得提交，工具运行时仍保持纯本地
- [x] `AGENTS.md` 明确不做整份需求文档语义识别，改为尺寸片段解析
- [x] `AGENTS.md` 明确 Logo / CPR 第一阶段按 SVG 资源处理，并支持语种版本选择、预览和导出勾选
- [x] `README.md` 更新为新品宣工具方向，明确 legacy 页面与新工具目标
- [x] 明确第一阶段范围：只做图片，不做视频 / GIF
- [x] 明确保留「版型适配规则」作为新工具核心模块

### 第一阶段目标

- [ ] 建立 Vite + React + TypeScript 项目结构
- [ ] 建立 `src/core/layout/layoutProfile.ts`
- [ ] 建立 `src/core/layout/logoLayout.ts`
- [ ] 建立 `src/core/layout/cprLayout.ts`
- [ ] 建立 `src/core/layout/brandLayer.ts`
- [ ] 迁移 / 重写尺寸片段解析能力到 `src/core/spec/specParser.ts`
- [ ] 建立常用物料尺寸模板 `src/core/spec/presetTemplates.ts`
- [ ] 建立文件命名模块 `src/core/export/fileNaming.ts`
- [ ] 建立图片裁切与导出模块 `src/core/image/`
- [ ] 建立 ZIP 导出模块 `src/core/export/zipExport.ts`
- [ ] 建立复核清单模块 `src/core/export/reviewReport.ts`
- [ ] 建立 `src/platform/` 抽象层，暂不接 Tauri
- [ ] 前端 UI 全部重写：顶部批次信息、左侧素材列表、中间预览区、右侧尺寸矩阵
- [ ] 支持上传一张或多张图片
- [ ] 支持粘贴尺寸片段并生成尺寸矩阵
- [ ] 支持从尺寸文本自动生成多个画板
- [ ] 支持每个尺寸独立裁切预览
- [ ] 支持安全区显示
- [ ] 支持 SVG Logo / CPR 上传或管理
- [ ] 支持 Logo / CPR 语种版本选择
- [ ] 支持预览时切换不同语种 Logo / CPR 效果
- [ ] 支持导出时勾选是否添加 Logo / CPR，并选择对应语种版本
- [ ] 支持 Logo / CPR 自动版型适配
- [ ] 支持 JPG / PNG 批量导出
- [ ] 支持 ZIP 打包
- [ ] 支持 TXT / CSV 复核清单

### 尺寸片段解析要求

- [ ] 不做整份需求文档语义识别
- [ ] 用户手动复制尺寸部分到「粘贴尺寸」弹窗
- [ ] 支持 `1080x1920`
- [ ] 支持 `1920*1080`
- [ ] 支持 `3840×2160`
- [ ] 支持 `900 383`
- [ ] 支持 `1:1 1024`
- [ ] 支持 `16:9 1920`
- [ ] 支持 `9:16 1080`
- [ ] 支持多行、逗号、空格、制表符、顿号、中文换行混排
- [ ] 解析后显示尺寸数量、画板列表、无法识别行
- [ ] 用户确认后生成尺寸矩阵和多个画板

### 版型适配规则要求

- [ ] 根据 aspect 自动识别版型族
  - `landscape`: aspect >= 1.25
  - `square`: 0.85 <= aspect < 1.25
  - `portrait`: aspect < 0.85
- [ ] Logo / CPR 计算基于短边 `shortSide`
- [ ] 使用 clamp 限制最小 / 最大视觉尺寸
- [ ] 支持左上 / 右上 / 居中锚点
- [ ] 支持小 / 标准 / 大三档推荐大小
- [ ] 预览和导出必须使用同一套计算函数
- [ ] UI 默认只显示自动识别结果和推荐控制，高级参数折叠

### SVG Logo / CPR 与语种版本要求

- [ ] Logo / CPR 第一阶段都按 SVG 资源处理
- [ ] 支持上传 / 管理多个 Logo SVG
- [ ] 支持上传 / 管理多个 CPR SVG
- [ ] SVG 保留 viewBox 和原始比例
- [ ] 版型适配只计算位置、宽度、边距、锚点，不修改 SVG 内容
- [ ] 预览和导出共用同一个 layout / renderBrandLayer 计算结果
- [ ] 预览区可以快速切换不同语种 Logo / CPR 效果
- [ ] 导出时可以勾选是否添加 Logo / CPR
- [ ] 导出时可以选择 Logo 语种和 CPR 语种
- [ ] 第一版不做复杂 SVG 编辑器

### 暂不处理

- [ ] 不优先清理旧 `video1.html` 深层水印 / Logo 死代码
- [ ] 不优先继续维护 `suggest.html`
- [ ] 不优先扩展 `test.html`
- [ ] 不把新品宣逻辑继续写进 `photo1.html`
- [ ] 不做视频 / GIF 新功能
- [ ] 不做整份需求文档语义识别
- [ ] 不在第一阶段内嵌完整思源黑体 / 思源宋体
- [ ] 不在 0.8.x 做 Tauri 打包、dmg、msi

### 已知风险

- 旧页面仍是单文件巨石结构，继续大改会增加维护成本
- 当前仓库运行方式仍以 legacy HTML 为主，新 Vite 应用建立后需补充启动方式
- 第三方依赖需要确认是否可以接受 npm 安装 + 本地构建，运行时仍需保持离线
- Codex 可在开发期调用 `.env` 中配置的模型，但不得将密钥、内部网关、模型名写进源码或提交记录
- 版型适配规则必须避免只在预览生效、导出不一致
- SVG 预览和 Canvas 导出需要确保比例、透明度、viewBox 一致

### 下一步建议给 Codex

1. 不要先删旧页面。
2. 先建立新应用骨架和核心纯函数模块。
3. 先做 layoutProfile / specParser / fileNaming 单元级验证。
4. 再做 UI。
5. 最后接预览和导出。

## 历史版本：0.7.4

### 已完成

- [x] `photo1.html` / `video1.html` / `test.html` / `suggest.html` 全站暗色模式：深色 token + 冷蓝/青主色（#38bdf8）+ scoped 浅色 Tailwind 类映射，主按钮不再桔红
- [x] `photo1.html` / `video1.html` / `suggest.html` 顶部 nav 移除「图片尺寸核对 / test.html」入口
- [x] `test.html` 首屏新增「已合并/弃用」提示横幅，文件保留可独立运行，不破坏其它文件
- [x] `photo1.html` 修复半删 Logo 库：重新加载 `assets/builtin-logos/builtin-data.js`，启动时从 IndexedDB 读取并在库空时播种内置素材；主界面右侧 Logo 栏与排版弹窗「从 Logo 库添加」恢复可用
- [x] `photo1.html`「直接输入配置」改为「尺寸脚本」方向：默认模板改为尺寸示例，新增 `parseSizeScript` 解析 `1080x1920` / `1920*1080` / `900 383` / `1:1 1024` / `16:9 1920` 等，自动生成配置行；仍兼容标准 TXT
- [x] `photo1.html` Logo 排版增强：推荐位置主按钮（左上/右上/居中）+ 自定义折叠为「高级选项」+ 预览区实时位置显示条（版型/模式/X%/Y%/宽度%/≈px）
- [x] `photo1.html` Logo 大小规则函数 `computeLogoSizeRule`：aspect 分类 landscape/square/portrait + shortSide 计算 + clamp（120-220 / 120-210 / 120-240），推荐位置应用该规则
- [x] `photo1.html` CPR 图层设置区（第一版）：开关/颜色/投影/位置，白色矩形占位预览 + `cprLayerState` 状态对象，不接入导出
- [x] 四页内联 JS 语法检查通过、`<div>` 开闭配平；无新增网络调用

### 已知风险

- `photo1.html` CPR 图层第一版仅预览 + 状态对象，未接入导出；后续应迁移到新 layout 模块，而不是继续补旧 HTML
- 暗色模式仍有少量历史浅色内联样式通过 scoped 覆盖兜底
- `video1.html` 仍有旧视频水印 / Logo 深层死代码
- `video1.html` GIF 压缩强依赖 ffmpeg.wasm，`file://` 下 SAB 可能不可用
