# 任务看板

## 当前版本：0.8.0 重构准备

### 产品方向

本仓库不新开新仓，直接从「渠道素材辅助工具」转向「品宣物料工作台」。

旧页面 `photo1.html` / `video1.html` / `test.html` / `suggest.html` 暂时作为 legacy 保留。新品宣能力不继续堆进旧单 HTML，而是逐步迁移为模块化前端应用。

### 已完成

- [x] `AGENTS.md` 从渠道工具维护规则改为品宣物料工作台重构规则
- [x] `AGENTS.md` 补充 Codex 总控规则：可读取本地 `.env` 中已配置的 API 密钥并按任务调度多个模型，密钥不得提交，工具运行时仍保持纯本地
- [x] `README.md` 更新为新品宣工具方向，明确 legacy 页面与新工具目标
- [x] 明确第一阶段范围：只做图片，不做视频 / GIF
- [x] 明确保留「版型适配规则」作为新工具核心模块

### 第一阶段目标

- [ ] 建立 Vite + React + TypeScript 项目结构
- [ ] 建立 `src/core/layout/layoutProfile.ts`
- [ ] 建立 `src/core/layout/logoLayout.ts`
- [ ] 建立 `src/core/layout/cprLayout.ts`
- [ ] 迁移 / 重写尺寸解析能力到 `src/core/spec/specParser.ts`
- [ ] 建立常用物料尺寸模板 `src/core/spec/presetTemplates.ts`
- [ ] 建立图片裁切与导出模块 `src/core/image/`
- [ ] 建立 ZIP 导出模块 `src/core/export/zipExport.ts`
- [ ] 建立复核清单模块 `src/core/export/reviewReport.ts`
- [ ] 搭建基础 UI：顶部批次信息、左侧素材列表、中间预览区、右侧尺寸矩阵
- [ ] 支持上传一张或多张图片
- [ ] 支持粘贴尺寸脚本并生成尺寸矩阵
- [ ] 支持每个尺寸独立裁切预览
- [ ] 支持安全区显示
- [ ] 支持 Logo / CPR 自动版型适配
- [ ] 支持 JPG / PNG 批量导出
- [ ] 支持 ZIP 打包
- [ ] 支持 TXT / CSV 复核清单

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

### 暂不处理

- [ ] 不优先清理旧 `video1.html` 深层水印 / Logo 死代码
- [ ] 不优先继续维护 `suggest.html`
- [ ] 不优先扩展 `test.html`
- [ ] 不把新品宣逻辑继续写进 `photo1.html`
- [ ] 不做视频 / GIF 新功能

### 已知风险

- 旧页面仍是单文件巨石结构，继续大改会增加维护成本
- 当前仓库运行方式仍以 legacy HTML 为主，新 Vite 应用建立后需补充启动方式
- 第三方依赖需要确认是否可以接受 npm 安装 + 本地构建，运行时仍需保持离线
- Codex 可在开发期调用 `.env` 中配置的模型，但不得将密钥、内部网关、模型名写进源码或提交记录
- 版型适配规则必须避免只在预览生效、导出不一致

### 下一步建议给 Codex

1. 不要先删旧页面。
2. 先建立新应用骨架和核心纯函数模块。
3. 先做 layoutProfile / specParser 单元级验证。
4. 再做 UI。
5. 最后接导出。

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
