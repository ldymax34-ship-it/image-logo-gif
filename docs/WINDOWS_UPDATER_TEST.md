# Windows x64 Preview 自动更新实机验证

本说明只用于 Preview 自动更新测试。请使用安装包，不要从共享盘运行源码、BAT、`npm dev` 或 `npm start`。

## 测试材料

- Preview Release：<https://github.com/ldymax34-ship-it/ldymax34-ship-it-brand-material-workbench-releases/releases/tag/preview>
- Preview 清单：<https://github.com/ldymax34-ship-it/ldymax34-ship-it-brand-material-workbench-releases/releases/download/preview/latest-preview.json>
- 基线客户端：`BrandMaterialWorkbench_0.1.26_windows-x86_64_test-baseline.exe`
- 当前完整安装包：`BrandMaterialWorkbench_0.1.27_Windows_x64_Setup.exe`

先把基线安装包复制到 **Windows 本地磁盘**，从本地安装和启动；共享盘只能用来传输文件。

## A. 正常更新

1. 安装并启动 `0.1.26` 测试基线客户端。
2. 确认首屏正常出现；启动不应被检查更新阻塞。
3. 等待约 10 秒，或在设置中点击“检查更新”。
4. 确认出现 `0.1.27` Preview：版本号、发布日期、主要变化、“稍后”和“下载更新”均可见。
5. 点击“下载更新”。已知总大小时确认显示百分比；未知总大小时应显示不确定下载状态。
6. 下载完成后确认**不会**自动安装或重启。
7. 点击“安装并重启”，确认出现二次确认：应用将关闭，临时状态可能丢失。
8. 确认后二次点击安装，等待应用重启；在设置“关于”确认版本为 `0.1.27`。

## B. 安装门禁

分别下载完成后尝试安装，确认会被阻止且当前工作不丢失：

- 正在批量导出；
- 聚焦编辑器打开；
- 聚焦编辑有未保存的裁切或品牌修改；
- 自定义构图有未保存内容；
- 设置有未保存内容；
- 确认类弹窗仍打开。

门禁仅限制安装：检查和下载仍可用，应用不应崩溃。

## C. 异常降级

分别验证断网、GitHub 不可达、清单 404、错误 JSON、签名错误、下载失败和下载取消：

- 应用仍正常启动、导入、编辑和导出；
- 自动检查静默结束；
- 手动检查可给出简洁错误；
- 下载取消或失败绝不能进入安装；
- 当前已安装版本不应损坏。

## D. 无更新

在 `0.1.27` 中手动检查：确认显示当前已是最新版，不显示下载/安装按钮，也不反复弹窗。

## SmartScreen 边界

Preview 尚未配置 Windows Authenticode 时，Windows 可能显示 SmartScreen、未知发布者或公司安全软件提示。这不等于 Tauri Updater 签名失败：Updater 签名只验证更新包完整性与来源，不能替代 Authenticode；本测试不得关闭 Updater 签名验证来绕过系统提示。

## 回归记录模板

| 项目 | 结果 | 备注 |
| --- | --- | --- |
| 基线版本与本地安装 | ☐ 通过 / ☐ 失败 | |
| 非阻塞检查与发现更新 | ☐ 通过 / ☐ 失败 | |
| 下载进度与下载完成不自动安装 | ☐ 通过 / ☐ 失败 | |
| 二次确认、安装、重启与版本核验 | ☐ 通过 / ☐ 失败 | |
| 导出中门禁 | ☐ 通过 / ☐ 失败 | |
| 未保存聚焦修改门禁 | ☐ 通过 / ☐ 失败 | |
| 设置 / 确认弹窗门禁 | ☐ 通过 / ☐ 失败 | |
| 断网 / 404 / JSON / 签名 / 下载失败降级 | ☐ 通过 / ☐ 失败 | |
| 最新版无更新 | ☐ 通过 / ☐ 失败 | |

记录 Windows 版本、安装包文件名、测试时间和失败截图；不要记录 token、私钥、签名密码或用户素材。
