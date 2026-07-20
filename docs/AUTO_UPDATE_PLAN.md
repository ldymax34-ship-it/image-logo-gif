# Preview 自动更新发布与签名边界

## 当前频道

客户端当前只读取 Preview：

```text
https://github.com/ldymax34-ship-it/ldymax34-ship-it-brand-material-workbench-releases/releases/download/preview/latest-preview.json
```

不会读取 `latest.json`；Stable 频道尚未启用。源码仓库保持私有，公开仓库只存安装包、updater artifacts、`.sig`、清单和 Release notes。

## 签名边界

Tauri Updater 使用独立更新密钥：客户端内置公钥，构建时以 `TAURI_SIGNING_PRIVATE_KEY` 和 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 签名更新包。私钥、密码、PAT、用户素材和内部配置不得进入源码、日志、Release 或 JSON。

Updater 签名只验证更新包的完整性和来源；它**不是** Windows Authenticode，也不是 macOS Developer ID 或 Apple 公证。Preview 未配置这些平台级商业签名时，Windows SmartScreen 或 macOS 安全提示仍可能出现。

## 发布流程

1. 在私有源码仓库触发 `Publish signed Preview updater`。
2. 构建 `darwin-aarch64` 和 `windows-x86_64`，并生成签名 updater artifact、`.sig` 与人工安装包。
3. 用 `.sig` 的实际文本生成 `latest-preview.json`。
4. 以固定 tag `preview` 覆盖公开二进制仓库 Release。
5. 发布前 Actions 必须拥有：
   - `TAURI_SIGNING_PRIVATE_KEY`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
   - `RELEASE_REPOSITORY_TOKEN`

`RELEASE_REPOSITORY_TOKEN` 必须是 fine-grained PAT，只授权公开二进制仓库 `ldymax34-ship-it/ldymax34-ship-it-brand-material-workbench-releases` 的 **Contents: Read and write**。

## 清单规范

Preview 清单仅有两个平台：

```json
{
  "version": "0.1.27",
  "notes": "Preview 0.1.27",
  "pub_date": "ISO-8601",
  "platforms": {
    "darwin-aarch64": { "signature": "actual .sig text", "url": "https://…" },
    "windows-x86_64": { "signature": "actual .sig text", "url": "https://…" }
  }
}
```

不得包含 Intel macOS、Linux、`latest.json` 或签名 URL。发布后必须匿名验证清单和所有资产 URL。

## 客户端行为

- 仅桌面 Tauri 运行时启用；Web 开发模式不加载 Updater。
- 首屏后延迟约 10 秒检查，不阻塞启动；自动检查失败静默降级。
- 用户主动下载；不自动下载、安装或重启。
- 安装前重新检查 `AppActivity`：导出、聚焦编辑、未保存草稿、设置未保存状态和确认弹窗都会阻止安装。
- 允许安装时仍需二次确认，然后才调用安装与重启。

## 实机回归状态

- macOS Apple Silicon：已完成 `0.1.26 → 0.1.27` 的发现、提示、下载、签名包、安装和重启验证。
- Windows x64：CI 构建、Preview 资产/清单和 `0.1.26` 测试基线包均已验证；仍需在真实 Windows 设备执行完整更新回归，步骤见 [Windows updater test](WINDOWS_UPDATER_TEST.md)。
