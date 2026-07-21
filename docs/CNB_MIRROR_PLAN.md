# CNB 国内更新镜像方案

## 目标架构

```
用户（国内）→ CNB 公开仓库 Release（主源）
                ↓ 失败时回退
用户（国内）→ GitHub 公开仓库 Release（回退源）

用户（海外）→ GitHub 公开仓库 Release（主源/回退均可）
```

## Tauri Updater 多 endpoint 行为

Tauri v2 updater 在 `tauri.conf.json` 的 `plugins.updater.endpoints` 中按数组顺序尝试：

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://cnb.cool/org/repo/-/releases/download/preview/latest-preview.json",
        "https://github.com/ldymax34-ship-it/ldymax34-ship-it-brand-material-workbench-releases/releases/download/preview/latest-preview.json"
      ]
    }
  }
}
```

- **顺序回退**：第一个 endpoint 不可达/返回非 200/JSON 无效/超时 → 自动尝试下一个。
- **不并行下载**：不会同时对两个 endpoint 发起并发请求。
- **签名不变**：公钥、签名机制完全不变，CNB 只是又一个 HTTP 文件源。
- **超时**：`check({ timeout: 12000 })` 对每个 endpoint 独立生效（在 Rust 侧实现）。

## CNB 验收标准

| 项目 | 要求 |
|------|------|
| 匿名下载 | 未登录状态下可下载所有 release 资产 |
| 大文件 | 约 200MB 的 updater tar.gz/exe 正常下载 |
| Range 请求 | 支持 HTTP Range / 断点续传 |
| URL 稳定性 | 不含短期 token 或临时签名参数 |
| Manifest 格式 | 与 GitHub 的 latest-preview.json 完全一致（SHA-256 相同） |
| 404/无效 JSON | CNB manifest 404 或无效 JSON → 自动回退 GitHub |
| 超时 | CNB 超时 → 自动回退 GitHub |
| 签名 | 公钥和签名机制保持不变 |

## 需要用户提供的最小信息

在 CNB 脚本和 CI 可执行之前，需要确认以下信息：

1. **CNB 仓库 URL**：如 `https://cnb.cool/YTT_mgbox/brand-material-workbench-releases`
2. **CNB 公开仓库 slug**：如 `YTT_mgbox/brand-material-workbench-releases`
3. **实际 CNB Release 附件匿名直链**：不能由仓库 URL 推导；确认后才可用于构建 `latest-preview.json` 中的 `url` 字段
4. **CNB 匿名下载验证**：确认 manifest 和所有附件 URL 无需登录即可直接下载

如未来需要自动上传，先依据 CNB 官方文档确认发布能力和认证范围；不要在本项目中保存 token，也不需要上传 Tauri 私钥。

## 后续发布工作流（待直链验证）

在 CNB 的实际匿名附件直链和 Range 支持都验证前，**不要**修改 `tauri.conf.json`。以下仅是获得已验证 URL 后的配置形态，URL 不是可执行的 CNB 路径猜测：

```json
"endpoints": [
  "<verified-CNB-anonymous-manifest-URL>",
  "https://github.com/ldymax34-ship-it/ldymax34-ship-it-brand-material-workbench-releases/releases/download/preview/latest-preview.json"
]
```

只有后续版本经过完整更新回归后，才可采用 CNB-first 配置；本次不 bump、不 tag、不发布 0.1.30。

## 发布脚本设计

`scripts/cnb-mirror-release.sh` 是本地 dry-run 脚本，安全完成以下步骤：

1. 从 GitHub Release 下载所有已签名资产（updater tar.gz/exe、.sig、dmg、Setup.exe、latest-preview.json）
2. 验证 SHA-256 一致性
3. 仅在传入已验证的 `CNB_RELEASE_DOWNLOAD_BASE` 后生成 CNB 版 `latest-preview.json`（只改 URL，签名保持不变）
4. 输出完整的手动上传指引和匿名验证命令

脚本不包含任何未经验证的网络上传调用、猜测 API 路径或 CLI 命令。CNB 上传须通过 Web UI 或经过官方文档确认的 API 操作。
CNB 仓库当前未初始化，需要先完成仓库初始化（至少一个初始提交）后才能在 web UI 创建 Release 和上传附件。

## 安全边界

- **更新私钥**：`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` **只在 GitHub Actions Secrets** 中存在。
- **CNB 凭据**：若未来自动上传确有必要，应只在 CNB 的受控 Secrets 中配置最小权限凭据；本仓库不读取、打印或提交它们。
- **公钥**：`tauri.conf.json` 中的 `pubkey` 公开不变。
- **签名文件**：`.sig` 文件从 GitHub Release 直接复制到 CNB，不重新生成。

## 未完成项清单

- [ ] 确认 CNB 仓库位置/URL
- [ ] 确认 CNB Release 附件直链格式
- [ ] 验证匿名下载（curl 测试）
- [ ] 验证 Range 请求支持
- [ ] 将 CNB URL 写入 `tauri.conf.json` endpoints 首位
- [ ] 完整更新回归：从旧版 → 检测 CNB → 下载 → 签名验证 → 安装
- [ ] 回退测试：CNB 不可达时自动使用 GitHub
