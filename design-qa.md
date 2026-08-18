# Design QA — dashboard 配色与通用导出体验

## 2026-08-18 控件统一补充检查

- Origin UI NG / shadcn 参考已落实到共享控件尺寸、圆角、焦点环、滑块和上传拖放区，不引入对应框架运行时。
- 视频“输出与队列”字段基线、按钮高度、状态色和输出文件夹入口已收口。
- ClickSpark 使用被动 2D Canvas；主按钮动效使用 CSS，WebGL / ogl 明确不纳入。
- 自动化构建与测试用于结构回归；原生 Tauri 视觉检查仍待用户在可执行版本中手动确认。

Date: 2026-08-17

## Evidence

- Source visual truth:
  - `artifacts/ui-reference-audit/2026-08-17/user-dashboard-reference.png`
  - `artifacts/ui-reference-audit/2026-08-17/user-notification-reference.png`
  - `artifacts/ui-reference-audit/2026-08-17/user-sidebar-reference.png`
- Rendered implementation:
  - `artifacts/design-qa/2026-08-17/final-home.png`
  - `artifacts/design-qa/2026-08-17/final-video-export-steps.png`
  - `artifacts/design-qa/2026-08-17/final-batch-export-dialog.png`
  - `artifacts/design-qa/2026-08-17/final-toast-card.png`
- Combined comparison inputs:
  - `artifacts/design-qa/2026-08-17/final-reference-vs-home.png`
  - `artifacts/design-qa/2026-08-17/final-reference-vs-toast.png`
- Runtime: independently bundled macOS Tauri QA app with Bundle ID `com.kuro.internal.brandmaterialworkbench.qa2`; browser preview was not used as acceptance evidence.
- Window: configured 1440 × 900 CSS px; macOS Computer Use captures are 1229 × 768 px.
- Source pixels: dashboard 1200 × 900; notification 1200 × 1195. Comparison images normalize each side into a 760 × 570 region while preserving aspect ratio and padding.
- State: empty video page, populated batch-export dialog, right-top notification, and a real 1280 × 720 three-second MP4 export with a long Chinese filename.

## Full-view comparison

The implementation carries over the references' reusable rules rather than cloning their content: near-black neutral surfaces, subtle one-pixel borders, compact dashboard cards, white/gray typography, restrained violet-blue interaction color, mint success, and pink failure. The production tool remains denser than the analytics reference because it must show source, preview, settings, and queue state together.

The home screen is intentionally quieter than the source dashboard. Tool cards provide the main grouping without decorative gradients or a persistent sidebar. No remote font, UI library, image asset, CSS artwork, or looping decorative animation was added.

## Focused component comparison

- Global export center: 420 px task center with four statistic cards, actual output filename, source, dimensions, size, terminal state, progress, and visible-only cleanup.
- Batch export: settings are divided into `文件命名`, `格式与体积`, and `语种`; segmented controls and native radio-card semantics are keyboard/assistive-technology readable.
- Video export: the lower area is visibly sequenced as `1 输出配置` then `2 导出队列`; directory selection precedes codec settings, and the queue exposes count, actions, empty state, frozen settings, progress, and output actions.
- Notification: right-top card with semantic icon, title, body, and an explicit close button. Status color is limited to the icon/border rather than filling the whole card.

## Required fidelity surfaces

- Fonts and typography: existing system/CJK stack retained; title, label, body, helper, and status weights are distinct. Long filenames truncate visually but remain complete in accessible labels and tooltips.
- Spacing and layout rhythm: low-radius cards, 8–16 px spacing, fine dividers, and compact controls are consistent. No horizontal overflow appeared in the QA window.
- Colors and tokens: near-black layered surfaces; violet-blue only for primary/selected/focus states; mint/pink/amber only for semantic states. Contrast remains readable without the previous gray-heavy oppressive blocks.
- Image quality and assets: existing Lucide icons and user-supplied content only; no fake logos, inline SVG artwork, remote assets, or placeholder art introduced.
- Copy and content: local queue is `导出队列`; cross-module monitor is `导出中心`; labels describe actual actions and avoid duplicate FFmpeg/helper copy.

## Primary interactions tested

1. Open the independently bundled Tauri QA app and inspect home palette — healthy.
2. Enter 视频水印 and inspect empty-state hierarchy — healthy.
3. Import `/private/tmp/bmw-qa-output/这是一个用于验证超长文件名和导出队列布局的测试视频_2026_08_17.mp4` — healthy; metadata and preview loaded.
4. Select output directory, add the current settings, and start the queue — healthy.
5. Complete a real VideoToolbox/FFmpeg export at 100% — healthy; output created as `..._watermarked_3.mp4`.
6. Use copy-output-path and inspect the right-top notification card — healthy; explicit close control exposed.
7. Return to the toolbox — healthy; the completed video remained visible in the global 导出中心 with the real output filename.
8. Import a PNG, create three boards, and open batch export — healthy; three setting cards and native radio semantics exposed.
9. Verify modal stacking — healthy after fix; the batch-export dialog stays above the global export center while notifications stay above the dialog.

## Comparison history

### Iteration 1

- P1: global export center could cover the lower-right settings and result area of the batch-export modal.
- Fix: raise `.export-backdrop` above the task center while keeping the notification layer above both.
- Post-fix evidence: `artifacts/design-qa/2026-08-17/final-batch-export-dialog.png`; no export-center card is visible over the modal.

### Iteration 2

- P2: toast remained a top-center clickable capsule with no explicit close affordance.
- Fix: replace it with a right-top card using existing Lucide status icons, title/body hierarchy, timer behavior, and an accessible close button without changing `toastBus` payloads.
- Post-fix evidence: `artifacts/design-qa/2026-08-17/final-toast-card.png` and `final-reference-vs-toast.png`.

### Final pass

No actionable P0, P1, or P2 findings remain for the chosen dashboard direction and export workflows.

## Follow-up polish

- P3: helper text at the smallest size is compact; a future accessibility-only pass could raise it by 1 px for low-DPI displays.
- P3: the dashboard reference uses larger editorial metrics; that scale is intentionally not copied into this dense production utility.

final result: passed

---

# Design QA — 视频水印队列跟进修复

Date: 2026-08-18

## Evidence

- Source visual truth:
  - `/var/folders/1l/dcl4bkj57732_fg00t62skrc0000gn/T/codex-clipboard-19f97861-c14c-4e93-b643-0822fc9d83aa.png`
  - `/var/folders/1l/dcl4bkj57732_fg00t62skrc0000gn/T/codex-clipboard-44b3c049-877f-4aeb-8f31-bcbbe2aad153.png`
- Rendered implementation: not captured after the 2026-08-18 changes.
- Intended viewport/state: macOS Tauri desktop, video loaded with a clean preview frame, one queued/running/completed export task.
- Automated evidence: 104 focused tests, 435 full tests, production frontend build, `verify:core`, exact Rust finalizing-to-completed regression, and `git diff --check` all passed.

## Findings

- Source-level fixes cover the reported P1 lifecycle issue (99%/finalizing), the header-level primary start action, per-asset frame thumbnail ownership, semantic queue states, output-directory opening, completed-file reveal/copy, and icon/numeric alignment.
- A post-change native screenshot at the same state is unavailable, so spacing, motion amplitude, thumbnail crop, status colors, and exact icon centering cannot be accepted from code/tests alone.

## Required follow-up

1. Open the Tauri desktop app and load at least one MP4/MOV.
2. Confirm the left asset row shows a real frame thumbnail and remains readable at the normal window minimum.
3. Add and start a task; confirm the header CTA glow/pressed response and blue running animation.
4. Confirm successful completion reaches 100%/green and both output-folder actions work.
5. Capture the same source/queue states and run a side-by-side visual comparison before marking this iteration passed.

final result: blocked

---

# Design QA — Logo 与版式导出中心接续

Date: 2026-08-18

## Verified in code and automated tests

- 输出目标确认且任务注册后，批量导出弹窗立即关闭，并显式展开/聚焦全局导出中心。
- 弹窗卸载后批处理仍继续，任务终态、完成通知和父工作台 `exporting=false` 回调均能正常收尾。
- 仅桌面目录任务保存由实际目录与碰撞改名后的真实文件名组成的绝对 `outputPath`；浏览器下载不伪造路径。
- 全局导出中心只为已完成且具有绝对原生路径的任务显示「在文件夹中显示」，并精确传递该任务自己的路径。
- 33 项聚焦测试、459 项全量前端测试、生产构建、`verify:core` 与 `git diff --check` 通过。

## Native follow-up

- 本轮未主动启动或打包 Tauri。需要手动确认系统文件选择器关闭后弹窗切换到导出中心的视觉连续性，以及 Finder 中定位实际碰撞改名文件的结果。

final result: code passed; native visual verification pending
