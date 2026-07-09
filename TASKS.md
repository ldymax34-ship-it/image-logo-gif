# 任务看板

## 当前版本：0.7.4

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

### 验证完成

- [x] 四页桌面/移动浏览器加载验证：无 JS 页面错误、无横向溢出
- [x] `photo1.html` / `video1.html` / `test.html` / `suggest.html` 均不再出现 `test.html` 导航入口
- [x] 旧橙红视觉 token / `bg-orange-*` / `text-orange-*` 已清理为暗色青蓝体系
- [x] `test.html` 弃用横幅显示正常且功能未坏
- [x] CPR 图层当前确认仅为预览状态对象与占位层，未接入导出画布

### 已知风险

- `photo1.html` CPR 图层第一版仅预览 + 状态对象，未接入导出；后续需接 SVG/文字绘制并写入 canvas
- 暗色模式仍有少量历史浅色内联样式通过 scoped 覆盖兜底，若后续新增模块需继续按暗色 token 收敛
- `video1.html` 仍有旧视频水印/Logo 深层死代码（与 0.7.3 一致，未处理）
- `video1.html` GIF 压缩强依赖 ffmpeg.wasm，`file://` 下 SAB 可能不可用（与 0.7.3 一致）

### 下一步建议

- 浏览器实打开四页做暗色 + 新功能回归
- CPR 图层接入导出：在 `processImage` 绘制阶段按 `cprLayerState` 绘制矩形/文字
- 清理 `video1.html` 深层 Logo/水印死代码（小步验证）
- 暗色模式下逐页复查未覆盖的浅色 Tailwind 类，按需补充 scoped 覆盖

## 历史版本：0.7.3

### 已完成

- [x] 调用 `opencode run` 做只读副审计，主控采纳其中 test UI 割裂、video Logo 死功能空跑等结论
- [x] `test.html` 首屏上传区翻新为工作台式双任务卡：统一白色面板、细边框、橙色主按钮、移动端单列
- [x] `test.html` 移除顶部 AI/提示词话术，导航文案统一为「视频转 GIF」，修复 H1 双 `style` 属性
- [x] `video1.html` 移除裁剪弹窗里的「水印 / Logo」入口与事件绑定
- [x] `video1.html` 停止加载 `assets/builtin-logos/builtin-data.js`，停止页面启动时播种/刷新 Logo 库
- [x] `assets/usage-tracker.js` / `suggest.html` 移除视频工具的 Logo 统计字段展示
- [x] 全站视觉方向从 Wireframe 手绘稿收敛为「离线素材工作台」：浅灰背景、白色面板、细边框、橙色主操作、系统字体
- [x] `photo1.html` / `video1.html` 移动端 header 与主体改为纵向工作流，修复标题和按钮被挤成竖排的问题
- [x] `video1.html` 清理视频水印移除后的 JS 残留：`initResultsGridActionDelegation`、`logoZone` 拖拽引用
- [x] 修复 `photo1.html` / `video1.html` 多处拼接错误的 Tailwind class
- [x] 使用 Product Design / Creative Production 视角复盘全站 UI，确认 Template Creator 不适用于本轮 HTML 工具改造
- [x] `photo1.html` / `video1.html` / `test.html` 移除「直接输入配置」里的复制 AI 指令按钮、函数、事件绑定
- [x] `suggest.html` 改为纯本机使用回顾页，移除提建议 / 反馈表单 / 建议结果页逻辑
- [x] `assets/usage-tracker.js` 移除反馈草稿 API 与 AI 指令统计入口
- [x] `photo1.html` Logo 布局模态框左侧栏重构：改色 + 阴影合并为「图片样式」面板，统一边框
- [x] `photo1.html` 顶部 header 右侧操作区重构：拆分设置行与操作行
- [x] `video1.html` 移除视频打水印 / Logo 排版功能
- [x] `video1.html` 新增视频转 GIF 压缩工具：帧率选择、宽度选择、实时大小预估、ffmpeg.wasm 转码、进度反馈、下载
- [x] 新增 `README.md` / `AGENTS.md` / `TASKS.md` 项目文档

### 待验证

- [ ] `video1.html` GIF 压缩实际运行验证（浏览器打开，选视频→调帧率→看预估→压缩→下载）
- [ ] `video1.html` ffmpeg.wasm 在 `http://localhost` 下 SAB 可用性确认
- [ ] `video1.html` `file://` 直接打开时 ffmpeg 加载失败是否有友好提示
- [ ] `photo1.html` Logo 布局模态框「图片样式」面板选中图片 logo 后是否正常显示
- [x] 四个页面桌面 / 手机首屏截图验证：无 JS 错误、无横向溢出

### 已知风险

- `video1.html` CSS `.logo-watermark-mock` 块已无对应 HTML，是死代码（不影响功能）
- `video1.html` 仍有旧视频水印 / Logo 的深层死代码：`transcodeVideoNative`、Logo IndexedDB 管道、`if (false)` 残留占位等；目前已切断可见入口和启动空跑，物理删除需单独做小步验证
- `video1.html` GIF 压缩强依赖 ffmpeg.wasm，`file://` 下 SAB 可能不可用
- Playwright 默认内置 Chromium 未安装；当前已改用本机 Google Chrome 完成截图验证

### 下一步建议

- 浏览器实际打开 `http://localhost:8765/video1.html` 验证 GIF 压缩全流程
- 小步清理 `video1.html` 深层 Logo / 水印死代码，每删一组跑 JS 语法和 Chrome 加载验证
- 给 GIF 压缩加 `file://` 环境下的 fallback 提示（ffmpeg 不可用时告知用户用本地 server）
- 继续精修结果表格和压缩结果区，让核对完成后的状态也和新工作台风格一致
