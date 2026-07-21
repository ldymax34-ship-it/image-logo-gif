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
        "https://cnb.example.com/org/repo/-/releases/download/preview/latest-preview.json",
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

1. **CNB 仓库 URL**：如 `https://cnb.cool/org-name/repo-name`
2. **CNB 公开仓库 slug**：如 `org-name/repo-name`
3. **CNB Release 附件直链格式**：用于构建 `latest-preview.json` 中的 `url` 字段
4. **CNB API Token / Access Token**（Secrets 级别）：具备 Release 创建和附件上传权限
5. **CNB 匿名下载验证**：确认附件 URL 无需登录即可直接下载

建议在 CNB 上创建公开仓库，通过 CI 推送附件后，先用 curl 验证匿名下载是否正常。

## 发布工作流变更（0.1.30 过渡版）

0.1.30 仍由 GitHub 发布，但 `tauri.conf.json` 将 endpoints 改为 CNB-first：

```json
"endpoints": [
  "https://cnb.cool/<org>/<repo>/-/releases/download/preview/latest-preview.json",
  "https://github.com/ldymax34-ship-it/ldymax34-ship-it-brand-material-workbench-releases/releases/download/preview/latest-preview.json"
]
```

这样 0.1.29 用户升级到 0.1.30 后就获得了 CNB-first 配置。

## 发布脚本设计

`scripts/cnb-mirror-release.sh` 在本地或 CI 中运行，将已签名的 GitHub Release 资产同步到 CNB：

1. 从 GitHub Release 下载所有资产（updater tar.gz/exe、.sig、dmg、Setup.exe、latest-preview.json）
2. 验证 SHA-256 一致性
3. 将资产上传到 CNB Release
4. 修改 latest-preview.json 中的 url 字段为 CNB 直链
5. 上传修改后的 latest-preview.json 到 CNB
6. 验证 CNB 所有 URL 可匿名下载

## 安全边界

- **更新私钥**：`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` **只在 GitHub Actions Secrets** 中存在。
- **CNB Secrets**：只需 CNB API Token（具备 release 上传权限），不包含签名私钥。
- **公钥**：`tauri.conf.json` 中的 `pubkey` 公开不变。
- **签名文件**：`.sig` 文件从 GitHub Release 直接复制到 CNB，不重新生成。

## 未完成项清单

- [ ] 确认 CNB 仓库位置/URL
- [ ] 确认 CNB Release 附件直链格式
- [ ] 创建 CNB API Token 并加入 Secrets
- [ ] 验证匿名下载（curl 测试）
- [ ] 验证 Range 请求支持
- [ ] 将 CNB URL 写入 `tauri.conf.json` endpoints 首位
- [ ] 完整更新回归：从旧版 → 检测 CNB → 下载 → 签名验证 → 安装
- [ ] 回退测试：CNB 不可达时自动使用 GitHub
