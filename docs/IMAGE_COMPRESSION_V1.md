# 图片压缩（单图）接入记录

本轮只做一件事：把 Squoosh 的图片编码能力接成「图片压缩」独立入口。GIF 预览修正属于下一个独立改动，本文件不涉及。

## 交互审查结论

### 用户真实任务链

```txt
选择一张图片
→ 选输出格式（JPEG / WebP / PNG）
→ 调质量或 PNG 优化级别、按需改输出宽度
→ 拖动分割线对比压缩前后、看体积变化
→ 另存为新文件（不覆盖原图）
```

### 当前主要问题（改前）

1. 「图片压缩」只存在于文档计划里：没有入口、没有页面、没有任何编码依赖，用户无法完成一次压缩。
2. 照搬 Squoosh 官方 Web 应用不行：它在 `src/client/initial-app/index.tsx:43` 注入 `https://www.google-analytics.com/analytics.js`，并带 Preact 应用壳与全部 codec（AVIF 8.4 MB、JXL 5.8 MB 等），与「纯本地、不联网」和包体规则冲突。
3. 自己实现压缩算法不行：`AGENTS.md` 明确禁止自研图片编解码与颜色量化。
4. 只靠 `canvas.toBlob()` 也不行：只有浏览器默认编码器，没有 mozjpeg / 无损 PNG 优化的压缩率，PNG 基本无法变小。

### 建议删除

- Squoosh 的 Preact 应用壳、Google Analytics、AVIF / JXL / 视觉对比图 / HQX 等本轮未确认的 codec。
- 批量、模板、颜色槽、格式转换矩阵、EXIF 编辑、裁剪旋转。

### 建议保留

- 单图导入、JPEG / WebP / PNG 三种格式、质量（PNG 为无损优化级别）、输出宽度、前后对比分割线、原图/输出体积、另存且不覆盖。

### 交给成熟库的部分

- 编码：Squoosh codec 的预编译发布 `@jsquash/jpeg@1.3.0`（MozJPEG）、`@jsquash/webp@1.5.0`、`@jsquash/oxipng@2.3.0`，均为 Apache-2.0；底层分别为 IJG/BSD、BSD-3-Clause、MIT。
- 解码与缩放：WebView 原生 `createImageBitmap` + Canvas 2D 高质量重采样，不自研重采样算法。
- 本地保存：复用 `src/platform/fileSystem.ts`（`chooseOutputTarget` / `saveBlobToOutputTarget`）；桌面端由 `save_export_file` 写入并自动追加序号，浏览器端走 File System Access 或下载。
- 文件选择：原生 `<input type="file">`。

### 最小修改方案

- 新增 `src/image-tool/`：Vue 3 SFC（与 `gif-tool` / `watermark-tool` 同一挂载方式）+ 编码 worker + 纯函数参数层。
- 新增工具键 `image-compress`，复用现有首页卡片、侧栏、启动设置、最近使用与 `VueToolWrapper`，不新建导航体系。
- CSP 最小放开（Tauri 官方文档要求）：`script-src` 增加 `'wasm-unsafe-eval'`；`img-src` / `media-src` 增加 `asset:` 与 `http://asset.localhost`；`connect-src` 由 `'none'` 改为 `'self'`，仅允许取本包内的 wasm 资源，仍不放开外网。
- 后端不改代码；`tauri.conf.json` 只增加 4 份许可证资源。

### 明确不做

- 不做批量、拖拽排序、模板、颜色槽、格式转换矩阵、EXIF/裁剪/旋转/滤镜。
- 不做「自动选最佳质量」或按目标体积反推质量；质量由用户决定并实时看到结果。
- 不引入 AVIF / JXL / 视觉差异对比。
- 不修正 GIF 预览（下一独立改动）。

### 包体影响

| 项 | 实测 |
| --- | --- |
| 前端 `dist` | 25 文件 / 1,679,093 B → 32 文件 / 2,466,007 B，**+786,914 B** |
| wasm 资源 | mozjpeg 269,882 B + webp 281,261 B + oxipng 164,172 B = 715,315 B |
| worker 脚本 | 45,819 B |
| 新增 CSS | 5,975 B |
| 组件与入口 JS | 余量（约 16 KB） |
| 许可证资源 | 4 份文本合计约 19 KB（`src-tauri/resources/licenses/`） |
| `node_modules` | `@jsquash` 2.1 MB + `wasm-feature-detect` 48 KB（只用于构建，未整包进前端） |
| 安装包（NSIS / DMG / `.app`） | **本轮未构建，待实测**；预期 DMG 增量接近前端 +787 KB 与许可证文本 |

## 实现要点

- 编码 worker（`src/image-tool/codecs.worker.ts`）用 `new URL(..., import.meta.url)` 把三个 wasm 交给 Vite 当同源资源：开发期直接取 `node_modules` 里的真实文件，构建期与 codec 胶水里的同类引用共用同一份 hashed 资源（实测没有重复打包），再用 `WebAssembly.compile` 本地编译。MozJPEG 走 Emscripten `instantiateWasm`、WebP 用同一机制注入已编译模块、PNG 用 `oxipng` 的 `optimise_raw`（无损重编码，不降色）。不发起任何外部请求。没有采用 `?url` 导入，是因为 Vite 开发服务器对 worker 内 `?url` 的改写会返回 wasm 原始字节而不是 URL 模块，页面在 `npm start` 下会直接失效。
- 主线程只做 `createImageBitmap` 解码 + Canvas 2D 缩放 + `getImageData`，像素通过 `postMessage` transfer 进 worker，编码在 worker 内完成，不阻塞界面。
- 参数变化 200 ms 去抖后重编；每次变化递增代次，晚到的旧结果直接丢弃（更换图片、切换格式、改质量/宽度、卸载同一条规则）。
- **旧结果不可保存**：格式、质量、PNG 级别或尺寸一变就立刻把上一份结果标记为失效——覆盖去抖等待、编码进行中、编码失败三个阶段；预览可以继续看，但保存按钮禁用并提示「参数已变化，上一份结果不可保存」，只有新编码成功后才恢复。
- **保存的文件名与内容同源**：保存用的扩展名取自那份结果实际使用的格式（结果里记录 `format`），不读当前格式选择器；点击保存时固定素材名、字节、MIME 与格式快照，目录弹窗等待期间如果换了图片或改了参数，本次保存直接取消并提示重新保存，不混用新旧数据。
- 输出体积始终显示「原图 → 输出（变化百分比）」，对比分割线可拖动、可用左右方向键微调。
- 保存默认文件名为 `原名-compressed.扩展名`；桌面端同名自动追加序号，不覆盖原图；「显示位置」只在拿到真实原生路径时出现。目录选择只在**成功**后缓存，用户取消后再点保存会重新弹出选择器（不缓存 `cancelled`）。
- 超过 5000px 最长边的图会先等比缩到 5000px 内并显式提示（RGBA 内存保护），不是压缩策略。
- 尺寸换算不强制偶数高度：不调整宽度时原样保留原始宽高；调整宽度时按原比例四舍五入取整、最小 1（例如 1000×333 缩到宽 500 → 高 167），JPEG / WebP / PNG 一致。静态图片没有视频编码器的偶数约束。

## 验证

| 项 | 结果 |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.app.json` | 通过 |
| `npm test` | **89 files / 583 tests 通过**（新增 `src/image-tool/types.test.ts` 8 条、`src/image-tool/ImageTool.test.ts` 12 条、`src/image-tool/codecAssets.test.ts` 5 条，并在既有首页/侧栏/启动/最近使用测试里补入口断言） |
| `npm run build` | 通过，worker 与 3 个 wasm 正确产出 |
| `npm run verify:core` | `verify-core: OK` |
| codec 真实编码（Node 实测） | 同一张 320×200 RGBA 渐变：JPEG 2,348 B（`ff d8`）、WebP 954 B（`RIFF…WEBP`）、PNG 728 B（`89 50 4e 47`），三种格式均通过魔数校验 |

编码 worker 的浏览器内行为（Worker + wasm + CSP 组合）属于桌面实测项，见下方未验证项。

## 采用的官方文档 / 上游来源

- Squoosh（Apache-2.0）：`GoogleChromeLabs/squoosh`，固定提交 `e8d35e0fb66e`（2024-08-19）；本仓库没有复制其应用代码，只使用其 codec 的预编译发布。
- `@jsquash/jpeg@1.3.0`、`@jsquash/webp@1.5.0`、`@jsquash/oxipng@2.3.0`（Apache-2.0）：npm 固定版本，wasm 与许可证随包。
- Tauri 2 CSP 文档：前端使用 WebAssembly 需要在 `script-src` 增加 `'wasm-unsafe-eval'`；asset 协议需要在 `img-src`/`media-src` 放开对应 scheme。
- Vite 文档：`new Worker(new URL(...), { type: 'module' })` 与 `?url` 资源引用。

## 代码审查修复（2026-10-19）

只修三个审查问题，不扩展功能、不改 GIF 模块：

1. **旧编码结果可保存**：新增 `outputStale` 标记，参数/尺寸变化时立即置为不可保存（去抖、编码中、失败三个阶段），新结果回来才解除；结果记录产生它的格式，文件名扩展名与 MIME 都取自该结果；保存前固定素材/结果/格式快照，目录弹窗等待期间素材或参数变化则取消本次保存。
2. **取消目录选择后无法再次保存**：只缓存成功的输出位置，`cancelled` 不缓存；取消后再次保存会重新弹出选择器；同名自动序号与不覆盖行为不变。
3. **删除静态图片偶数高度限制**：`evenHeight` 换为 `scaledImageHeight` —— 不缩放时保留原始宽高，缩放时按比例四舍五入、最小 1，不再强制偶数；5000px 上限与提示保留。

回归测试：`ImageTool.test.ts` 新增 6 条（去抖期间旧 JPEG 不可保存 → PNG 新结果的文件内容/MIME/扩展名一致；编码失败后仍不可保存；目录弹窗等待期间改格式/换图不写文件；取消后再次保存会重新弹窗并写入；101×101 与 1×1 原尺寸、1000×333 缩到宽 500 得高 167），类型测试同步改为比例取整断言，原有同名不覆盖用例继续通过。反向验证：分别把三处旧逻辑改回去，对应回归用例 2 / 3 / 2 条立即失败，恢复后全绿。

验证：`npx tsc --noEmit -p tsconfig.app.json` 通过；`npm test` **90 files / 595 tests** 通过；`npm run verify:core` 通过；`npm run build` 通过；`cargo test --lib` 142 passed；`git diff --check` 通过；`dist` 2,472,751 B → 2,474,741 B（+1,990 B）。按用户要求**未重新打包**，等 Codex 复核后再出测试包。

## 未验证项 / 风险

- 未在 macOS Release 窗口内实测：Worker + WebAssembly 在 WKWebView 的实际运行、`'wasm-unsafe-eval'` 是否被当前 macOS 版本接受、保存对话框与 `save_export_file` 的真实写入。已产出测试包（`artifacts/local-packages/2026-10-19/品宣物料工作台_0.9.4_图片压缩与GIF预览_2026-10-19_aarch64.dmg`），并确认 32 个前端资源（含 3 个 wasm 与 worker）全部内嵌进主程序；但按用户指示本轮不在窗口内逐项点验。
- Windows 未验证（NSIS 安装包、安装目录增量、WebView2 行为）。
- 接近 5000px 的大图在真实窗口中的编码耗时未测量；超限提示与降级路径只有单元测试覆盖。
- 安装包体积增量（DMG / NSIS / 安装后目录）待打包机实测后补录。
- 本轮不构成可发布结论。
