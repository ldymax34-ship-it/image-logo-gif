# 任务看板

## 当前版本：0.8.1 清理与图片预览闭环

### 产品方向

当前项目为「品宣物料工作台」。

0.8.x 先完成 Vite + React + TypeScript Web 工作台闭环，0.9.x 再接 Tauri 做 macOS / Windows 桌面化。

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
- [x] 前端 UI 全部重写：顶部批次信息、左侧素材列表、中间预览区、右侧尺寸矩阵（当前为最小工作台壳）
- [x] 支持粘贴尺寸片段并生成尺寸矩阵（首版内存态）
- [x] 支持从尺寸文本自动生成多个画板（首版内存态）
- [x] 支持安全区显示（首版预览壳）
- [x] 支持 Logo / CPR 自动版型适配（首版核心函数 + 预览占位）
- [x] 删除旧 HTML 入口文件，仓库只保留新应用入口
- [x] README / AGENTS / TASKS 去掉旧项目与旧页面保留描述

### 0.8.1 目标

- [ ] 支持上传一张或多张图片
- [ ] 左侧素材列表显示已上传图片缩略图、名称、尺寸
- [ ] 点击素材后进入当前素材预览
- [ ] 点击画板后，中间预览区显示对应尺寸画布
- [ ] 图片按 cover 模式填入画布
- [ ] 支持拖动画面位置
- [ ] 支持缩放画面
- [ ] 每个画板保存独立裁切状态
- [ ] 显示安全区
- [ ] 右侧显示当前画板的版型识别、宽高、格式
- [ ] 状态结构为后续 Canvas 导出复用，不做 UI 假状态

### 第一阶段剩余目标

- [ ] 建立图片裁切与导出模块 `src/core/image/`
- [ ] 建立 ZIP 导出模块 `src/core/export/zipExport.ts`
- [ ] 建立复核清单模块 `src/core/export/reviewReport.ts`
- [ ] 支持 SVG Logo / CPR 上传或管理
- [ ] 支持 Logo / CPR 语种版本选择
- [ ] 支持预览时切换不同语种 Logo / CPR 效果
- [ ] 支持导出时勾选是否添加 Logo / CPR，并选择对应语种版本
- [ ] 支持 JPG / PNG 批量导出
- [ ] 支持 ZIP 打包
- [ ] 支持 TXT / CSV 复核清单

### 尺寸片段解析要求

- [x] 不做整份需求文档语义识别
- [x] 用户手动复制尺寸部分到「粘贴尺寸」弹窗
- [x] 支持 `1080x1920`
- [x] 支持 `1920*1080`
- [x] 支持 `3840×2160`
- [x] 支持 `900 383`
- [x] 支持 `1:1 1024`
- [x] 支持 `16:9 1920`
- [x] 支持 `9:16 1080`
- [x] 支持多行、逗号、空格、制表符、顿号、中文换行混排
- [x] 解析后显示尺寸数量、画板列表、无法识别行
- [ ] 增加确认弹窗：解析预览确认后再生成尺寸矩阵和多个画板

### 版型适配规则要求

- [x] 根据 aspect 自动识别版型族
  - `landscape`: aspect >= 1.25
  - `square`: 0.85 <= aspect < 1.25
  - `portrait`: aspect < 0.85
- [x] Logo / CPR 计算基于短边 `shortSide`
- [x] 使用 clamp 限制最小 / 最大视觉尺寸
- [x] 支持左上 / 右上 / 居中锚点
- [x] 支持小 / 标准 / 大三档推荐大小
- [x] 预览和导出必须使用同一套计算函数（已建立 `renderBrandLayer`，导出接入后继续复用）
- [ ] UI 默认只显示自动识别结果和推荐控制，高级参数折叠

### SVG Logo / CPR 与语种版本要求

- [x] Logo / CPR 第一阶段都按 SVG 资源处理（核心类型已按 SVG asset / viewBox 建模）
- [ ] 支持上传 / 管理多个 Logo SVG
- [ ] 支持上传 / 管理多个 CPR SVG
- [x] SVG 保留 viewBox 和原始比例
- [x] 版型适配只计算位置、宽度、边距、锚点，不修改 SVG 内容
- [x] 预览和导出共用同一个 layout / renderBrandLayer 计算结果（导出接入后继续复用）
- [ ] 预览区可以快速切换不同语种 Logo / CPR 效果
- [ ] 导出时可以勾选是否添加 Logo / CPR
- [ ] 导出时可以选择 Logo 语种和 CPR 语种
- [ ] 第一版不做复杂 SVG 编辑器

### 暂不处理

- [ ] 不做视频 / GIF 新功能
- [ ] 不做整份需求文档语义识别
- [ ] 不在第一阶段内嵌完整思源黑体 / 思源宋体
- [ ] 不在 0.8.x 做 Tauri 打包、dmg、msi

### 已知风险

- 新 Vite 应用已建立，但上传、裁切、真实 SVG 管理和导出闭环还未接入
- 第三方依赖需要确认是否可以接受 npm 安装 + 本地构建，运行时仍需保持离线
- Codex 可在开发期调用 `.env` 中配置的模型，但不得将密钥、内部网关、模型名写进源码或提交记录
- 版型适配规则必须避免只在预览生效、导出不一致
- SVG 预览和 Canvas 导出需要确保比例、透明度、viewBox 一致
- 当前 `src/pages/App.tsx` 是工程验证壳，不是最终高保真 UI；后续应基于明确视觉目标继续设计

### 下一步建议给 Codex

1. 接入上传图片与素材列表。
2. 建立 `src/core/image/`：裁切框、缩放、Canvas 导出基础函数。
3. 建立真实 SVG Logo / CPR 资源管理与语种切换。
4. 继续扩充 `specParser` 的表格 / TXT 兼容测试。
5. 最后接 ZIP 导出和复核清单。
