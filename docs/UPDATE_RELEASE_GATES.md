# Preview 自动更新发布门禁

## 强制平台顺序：macOS 先行，Windows 后放

CI 可以并行构建并签名 macOS Apple Silicon 与 Windows x64 产物，但**客户端可见的更新不得同时放行**。此规则适用于 `0.1.30` 及之后所有 Preview 自动更新。

### 阶段 1：macOS 候选验证

1. CI 同时生成两个平台的已签名 updater 包、`.sig` 和人工安装包，但不覆盖公共 `preview/latest-preview.json`。
2. 使用独立的 macOS 候选清单或候选 Release，只向隔离的 macOS `0.1.29` 测试副本提供候选更新。
3. 在真实或隔离 macOS Apple Silicon 上完整验证：检查、下载、签名校验、安装、关闭、重启、版本为目标版本、更新公告与核心导入/编辑/导出功能。
4. 记录测试时间、基线版本、候选 Release、日志摘要与结论；不得记录私钥、密码、token 或用户素材。

### 阶段 2：正式 Preview 放行与 Windows 验证

1. 只有 macOS 候选实机验证通过后，才生成/覆盖公共 `preview/latest-preview.json`。
2. 正式 Preview 清单只包含实际支持的 `darwin-aarch64` 和 `windows-x86_64` 两个平台；每个 `signature` 字段必须是对应 `.sig` 文件的实际文本，不得是 URL。
3. Windows 条目必须在放行时指向本次构建的 Windows x64 updater 包及其匹配签名；不得使用旧版、占位包或错误签名。
4. Windows 用户在阶段 1 不得看到可安装的目标版本；阶段 2 放行后，再在真实 Windows `0.1.29` 基线上完成检查、下载、签名校验、安装、重启与版本核验。

## 清单与桥接规则

- `0.1.30` 是 GitHub 桥接版本：`0.1.29` 必须从 GitHub manifest 发现更新，并从 GitHub 下载、校验和安装 `0.1.30`。
- `0.1.30` 客户端内置的 updater endpoint 才是“已验证 CNB manifest 在前、GitHub manifest 回退在后”。
- `0.1.31` 才允许首次通过 CNB 下载 updater 包；在此前必须完成 CNB 大附件、匿名下载、Range 和签名一致性验收。
- 若 CNB endpoint 未通过真实 HTTP 200、JSON、匿名稳定访问门禁，禁止将其写入任何发布版客户端配置。

## 发布门禁

在推送目标 tag 或创建/覆盖公共 Release 前，必须通过：

- `npm test -- --run`
- `npm run verify:core`
- `npm run build`
- `cargo fmt --check`、`cargo check`、`cargo test`
- `git diff --check`
- updater single-flight、pubkey、manifest 两个平台和 `.sig` 内容核验
- 阶段 1 macOS 实机更新验证

不得为绕过平台分阶段而从公共清单删除某一平台字段；应使用候选清单/候选 Release，将公共正式清单保持为完整且一致的双平台结构。
