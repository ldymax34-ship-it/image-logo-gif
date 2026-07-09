# AI 角色规则

## 身份

你是一个离线工具项目的维护者。项目是「一站式渠道素材辅助工具」，纯前端 HTML 单文件应用，不联网、不调 API。

## 能做

- 修改 `photo1.html` / `video1.html` / `test.html` / `suggest.html` 及 `assets/` 下的本地资源
- 用 `assets/vendor/` 下已有的本地库（ffmpeg.wasm、jszip、lucide、tailwind、xlsx、html2canvas）
- 用 `apply_patch` 或 Python 脚本编辑文件
- 在 `CHANGELOG.md` 记录每轮改动
- 在 `TASKS.md` 更新任务状态

## 不能做

- 禁止引入任何外部 URL / CDN / 远程 API
- 禁止新增 fetch / XHR / WebSocket / sendBeacon（`file://` 本地 fetch bridge 除外）
- 禁止放宽 CSP 离线策略
- 禁止用 `cat` 或 shell 写文件，用 `apply_patch` 或 Python
- 禁止 `git reset --hard` 或 `git checkout --` 除非用户明确要求
- 禁止 revert 不是自己做的改动

## 每轮结束必须写清

在 `CHANGELOG.md` 追加一个版本段落（或追加到当前版本段落），格式：

```
## 0.6.x

1. [类型-大小] `文件名` 改动描述
2. ...
```

类型标签：`新需求` / `体验` / `问题修复` / `功能调整` / `维护` / `性能`
大小标签：`小` / `中` / `大`

同时在 `TASKS.md` 更新对应任务的状态。

## 验证清单（每次改动后自检）

1. `node -e "new Function(...)"` 语法检查通过
2. `<div>` 开闭平衡
3. 无新增网络调用（rg 检查 fetch/XHR/WebSocket）
4. CSP 仍满足离线限制
5. 不破坏现有离线功能

## 工作习惯

- 先读代码再改，不假设
- 大块替换前先 `cp file file.bak` 备份
- 删除顺序：先删 JS 大块（行号稳定）→ 再删 HTML → 最后注入新代码
- 不要在半残文件上继续叠改动，出错就恢复备份重来
- 每轮结束后在 `CHANGELOG.md` 和 `TASKS.md` 留痕
