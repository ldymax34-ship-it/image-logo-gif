# 更新日志

## 0.1.1

1. [维护-中] `README.md` / `AGENTS.md` / `TASKS.md` 清理旧项目与旧页面保留描述，文档入口统一聚焦「品宣物料工作台」。
2. [维护-中] 删除旧 HTML 入口文件：`photo1.html`、`video1.html`、`test.html`、`suggest.html`；后续只维护 Vite + React + TypeScript 新应用入口。
3. [功能调整-小] `TASKS.md` 将当前阶段调整为 0.1.1：优先接入图片上传、素材列表、画板预览、裁切状态和后续可复用的数据结构。
4. [维护-小] `CHANGELOG.md` 从 0.1.x 新应用阶段重新记录，移除历史旧工具流水，避免后续任务理解偏移。
5. [维护-中] 全仓扫描确认新 Vite 应用与剩余源码无 `assets/` 引用后，删除旧资源目录 `assets/`（旧内置 Logo、旧 vendor、旧字体、旧统计/解析脚本），减轻仓库体积并避免误以为旧 HTML 资源仍被维护。

## 0.1.0

1. [重构-大] 新增 Vite + React + TypeScript 新应用骨架：`package.json`、`package-lock.json`、`index.html`、`vite.config.ts`、`tsconfig*.json`、`src/main.tsx`、`src/pages/App.tsx`、`src/styles.css`。
2. [新需求-中] 新增 `src/core/layout/layoutProfile.ts`、`logoLayout.ts`、`cprLayout.ts`、`brandLayer.ts`：实现 aspect 版型识别（landscape / square / portrait）、短边 shortSide + clamp 的 Logo / CPR 尺寸和边距计算、左上 / 右上 / 居中锚点，以及统一 `renderBrandLayer` 结果，供预览和后续导出共用。
3. [新需求-中] 新增 `src/core/spec/specParser.ts` 与 `presetTemplates.ts`：支持尺寸片段解析，不做整份需求文档语义识别；已支持 `1080x1920`、`1920*1080`、`3840×2160`、`900 383`、`1:1 1024`、`16:9 1920`、`9:16 1080`、逗号 / 顿号 / 多行 / 表格粘贴、JPG / PNG、KB / MB 大小限制。
4. [新需求-中] 新增 `src/core/export/fileNaming.ts`：实现跨平台文件名清理与输出命名，保留中文与 Unicode 字符，替换 Windows 非法字符，移除前导 / 尾随点空格，处理 Windows 保留名，避免 `../` 路径段残留。
5. [重构-中] 新增 `src/platform/` 抽象层占位（`fileSystem.ts` / `dialog.ts` / `path.ts` / `desktopBridge.ts`），0.1.x 暂不接 Tauri，但为后续 macOS / Windows 桌面化保留边界。
6. [体验-中] 新应用首页提供最小工作台壳：顶部批次操作、左侧素材占位、中间画板预览 / 安全区 / Logo / CPR 占位、右侧「粘贴尺寸」文本框与解析列表，用真实核心函数驱动画板数量、版型识别和品牌层位置。
7. [维护-中] 新增 `scripts/verify-core.ts` 与 `src/core/core.test.ts`，覆盖尺寸解析、版型识别、品牌层布局不出界、短边一致性、文件名安全等验证。
