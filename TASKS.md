# 任务看板

## 当前版本：0.1.3 SVG Logo / CPR 资源与语种预览

### 产品方向

当前项目为「品宣物料工作台」。

0.1.x 先完成 Vite + React + TypeScript Web 工作台闭环，0.2.x 再接 Tauri 做 macOS / Windows 桌面化。

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
- [x] 支持上传 / 管理多个 CPR SVG
- [x] 支持 SVG 语种标签：简中、繁中、日文、韩文、英文、自定义
- [x] 支持启用 / 关闭 Logo
- [x] 支持启用 / 关闭 CPR
- [x] 支持预览区切换 Logo / CPR 语种资源
- [x] 使用现有 `renderBrandLayer` 计算 Logo / CPR 位置
- [x] SVG 保留 viewBox 和原始比例，不修改 SVG 文本
- [x] SVG 预览拦截 script、foreignObject、远程 / 协议相对 / data 引用和外部 CSS 引用
- [x] 使用本地 `.env` + opencode CLI 做只读审查，由 Codex 总控筛选并修复高风险项

### 本轮验证记录

- [x] 0.1.1 完成后验证：`npm run verify:core`、`npm test`、`npm run build` 通过
- [x] 0.1.2 完成后验证：`npm run verify:core`、`npm test`、`npm run build` 通过
- [x] 0.1.3 完成后验证：`npm run verify:core`、`npm test`、`npm run build` 通过

### 第一阶段剩余目标

- [ ] 增加确认弹窗：解析预览确认后再生成尺寸矩阵和多个画板
- [ ] UI 默认只显示自动识别结果和推荐控制，高级参数折叠
- [ ] 支持导出时勾选是否添加 Logo / CPR
- [ ] 支持导出时选择 Logo 语种和 CPR 语种
- [ ] 建立 Canvas 导出模块 `src/core/image/exportImage.ts`
- [ ] 支持 JPG / PNG 批量导出
- [ ] 建立 ZIP 导出模块 `src/core/export/zipExport.ts`
- [ ] 建立复核清单模块 `src/core/export/reviewReport.ts`
- [ ] 支持 TXT / CSV 复核清单

### 暂不处理

- [ ] 不做视频 / GIF 新功能
- [ ] 不做整份需求文档语义识别
- [ ] 不在第一阶段内嵌完整思源黑体 / 思源宋体
- [ ] 不在 0.1.x 做 Tauri 打包、dmg、msi
- [ ] 不恢复旧 HTML / assets / vendor
- [ ] 不引入远程 API / CDN

### 已知风险 / 降级

- CPR 颜色当前通过 CSS mask 进行单色预览，适合单色 CPR；如果 CPR SVG 本身是多色图形，单色预览会丢失原多色细节。
- Logo / CPR 已使用 `renderBrandLayer` 统一计算预览位置；Canvas 导出尚未实现，0.1.4 需要直接复用同一套布局结果。
- 图片 Object URL 当前在应用卸载时统一释放；后续增加删除素材功能时，需要在删除单项时同步 revoke。
- SVG 校验已阻止常见外部引用，但复杂 SVG 安全策略仍建议在 0.1.4 导出前继续收紧。

### 下一步建议给 Codex：0.1.4

1. 建立 Canvas 导出基础：把素材裁切、Logo、CPR 安全绘制到 Canvas。
2. 导出设置区增加是否添加 Logo / CPR、选择语种、选择 JPG / PNG。
3. 先支持单张当前画板导出，再扩展批量导出。
4. 继续补充 SVG 到 Canvas 的离线渲染验证。
