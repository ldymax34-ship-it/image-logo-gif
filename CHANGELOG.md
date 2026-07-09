# 更新日志

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
