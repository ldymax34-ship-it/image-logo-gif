# GitHub Release 自动更新规划

## 目标

让已安装的桌面客户端在公司、家中或其他可访问 GitHub Release 的网络环境中检查和获取更新；应用运行时仍只在本地处理素材，不上传图片、规格、裁切数据或品牌资源。

更新包必须发布到 GitHub Release Asset，不能提交到 Git 历史。这样源码仓库不会被大体积二进制拖慢，首次完整安装包与后续更新资源也能独立管理。

## 发布结构

每个正式版本使用一个 Git tag 和一个 GitHub Release：

```text
vX.Y.Z
  ├─ latest.json
  ├─ Windows x64 updater bundle + 签名
  ├─ macOS Apple Silicon updater bundle + 签名
  ├─ SHA-256 校验文件
  └─ 可选：首次安装用的完整离线 Windows NSIS 包
```

`latest.json` 是更新客户端读取的唯一远端元数据。它只包含版本号、发布日期、说明、平台下载地址和签名，不包含任何用户数据。

## 签名与密钥

自动更新使用 Tauri Updater 的专用更新密钥：

- 私钥只作为 GitHub Actions Secret 保存，用于 Release 构建时为更新包签名。
- 客户端只内置对应公钥，用于验证下载包。
- 私钥、签名密码、GitHub Token、Apple 凭据和 Windows 证书不得写入源码、日志、Release 文案或示例配置。
- 更新签名与 Windows Authenticode、macOS Developer ID / 公证是不同层级的机制；三者都应在正式发布前配置。

## 客户端行为

默认采用“提示更新，不强制中断”：

1. 启动后延迟检查一次更新。
2. 检测到新版时显示版本号和 Release 说明。
3. 用户选择下载并重启后才安装。
4. 导出进行中、裁切编辑弹窗有未保存草稿时不弹出强制更新。
5. 更新检查、下载、验签或安装失败时保留当前版本可继续使用，并给出简洁可读的失败提示。
6. 不在运行时请求公司 API、素材服务或 CDN；仅访问配置好的 GitHub Release 更新端点。

## 分平台策略

### Windows

Windows 先行启用自动更新。

- 首次安装继续提供内置离线 WebView2 的完整 NSIS 包，保证无网络依赖的安装兜底。
- 后续更新可提供较小的 updater bundle，减少每次重复分发约 200MB 的完整离线运行时。
- 当设备没有 WebView2 时，轻量安装包应明确提示需要联网安装运行时；完整离线包始终作为备用下载。

### macOS

macOS 在具备正式签名条件后启用自动更新。

- 需要 Developer ID Application 签名、Apple 公证和稳定的更新包格式。
- 现有 ad-hoc Preview 包仅用于内部安装与功能验证，不作为自动更新通道。
- Apple Silicon 先行，Intel 仅在实际需求与构建验证明确后再加入。

## 实施阶段

### 阶段 A：规划与 Release 规范

- [x] GitHub Preview Release 已构建 Windows x64 和 macOS Apple Silicon 包。
- [x] 将更新资源固定为 GitHub Release Asset，而不是 Git 二进制提交。
- [ ] 生成专用更新密钥并把私钥安全放入 GitHub Actions Secret。
- [ ] 选择更新资源仓库：代码仓库公开 Release 或独立公开 Release 仓库。

### 阶段 B：Windows 内部更新通道

- [ ] 接入 `tauri-plugin-updater` 和客户端公钥。
- [ ] GitHub Actions 生成 Windows updater bundle、签名和 `latest.json`。
- [ ] 在真实 Windows 设备验证：检测、下载、验签、重启安装、失败回退与离线完整包兜底。

### 阶段 C：macOS 正式更新通道

- [ ] 配置 Developer ID、App-specific signing 与公证。
- [ ] 生成并验证 macOS updater bundle 与签名。
- [ ] 在干净 Apple Silicon 设备验证更新与回退。

## 发布检查

启用自动更新后的每次 Release 至少确认：

- 更新清单指向正确的 tag、平台和版本。
- 每个平台下载地址可访问且签名匹配。
- Windows 完整离线安装包与轻量更新包标识清楚。
- 更新前后均可正常导入、编辑、导出。
- 更新失败不会影响本地素材和当前工作台状态。
- Release 不包含 API key、私钥、用户素材或内部路径。
