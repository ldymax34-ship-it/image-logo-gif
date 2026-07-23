默认规则文件：AGENTS / TASKS / CHANGELOG / README

# 为什么需要这几个文件

AI coding 最大的问题不是“写不出来”，而是：

- 容易忘记上下文。
- 容易越改越偏。
- 容易不知道自己上一轮改了什么。
- 不同 AI 接力时容易互相覆盖。

所以每个项目都默认放一组规则文件。

# 推荐目录

```
ProjectName/
├─ README.md
│
├─ 00_PROJECT_RULES/
│  ├─ AGENTS.md
│  ├─ TASKS.md
│  └─ CHANGELOG.md
│
├─ 01_INPUT/
│  ├─ briefs/
│  ├─ references/
│  ├─ source_files/
│  └─ raw_notes/
│
├─ 02_OUTPUT/
│  ├─ docs/
│  ├─ code/
│  ├─ design/
│  └─ exports/
│
├─ 03_WORKSPACE/
│  ├─ temp/
│  ├─ sandbox/
│  └─ logs/
│
└─ 04_ARCHIVE/
   ├─ old_versions/
   ├─ discarded/
   └─ backups/
```

# README.md

## 作用

给人和 AI 快速理解项目。

## 应包含

```
项目是什么
解决什么问题
当前版本做到哪
如何启动
核心文件在哪里
不要改什么
下一步做什么
```

# AGENTS.md

## 作用

规定不同 AI 的职责边界。

## 应包含

```
项目背景
角色分工
允许修改范围
禁止修改范围
每轮结束必须更新什么
出现冲突时听谁的
```

## 可直接用的规则

```
你必须遵守本项目范围，不得擅自扩大功能。
你必须优先保持现有功能可运行。
你不能删除已有文件，除非任务明确要求。
你不能新增复杂依赖，除非说明原因并得到确认。
每轮完成后必须更新 CHANGELOG.md。
每轮完成后必须说明修改文件、验证方式、风险点。
```

# TASKS.md

## 作用

记录当前任务，不让 AI 跑偏。

## 推荐结构

```
# 当前目标

# 本轮任务

# 待办列表

# 暂不处理

# 已完成

# 风险 / 待确认
```

# CHANGELOG.md

## 作用

记录每轮到底改了什么。

## 推荐格式

```
## YYYY-MM-DD HH:mm｜工具名｜本轮目标

### 修改文件
- xxx

### 主要改动
- xxx

### 验证方式
- xxx

### 影响范围
- xxx

### 未完成 / 风险
- xxx

### 下一步建议
- xxx
```

# 最低要求

每个项目至少保留：

```
README.md
00_PROJECT_RULES/AGENTS.md
00_PROJECT_RULES/TASKS.md
00_PROJECT_RULES/CHANGELOG.md
```
