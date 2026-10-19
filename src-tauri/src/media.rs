use std::{
    collections::{HashMap, HashSet, VecDeque},
    ffi::OsString,
    fs,
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Child, Command, ExitStatus, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Condvar, Mutex,
    },
    thread,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const MEDIA_EVENT: &str = "gif-media://task";
const WATERMARK_QUEUE_STATUS_EVENT: &str = "watermark-queue://status";
const WATERMARK_PREVIEW_STATUS_EVENT: &str = "watermark-preview://status";

/// `CREATE_NO_WINDOW` (Windows console API constant, `0x08000000`) prevents the
/// bundled FFmpeg/FFprobe sidecars from flashing a console window on release
/// builds. The standard library does not re-export the flag, so we declare the
/// documented value once and apply it through `std::os::windows::process::CommandExt`.
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Hard, non-negotiable ceiling for one exported GIF: 8,000,000 bytes, i.e. the
/// decimal 8 MB the product promises. Deliberately NOT 8 MiB (8,388,608 B) and
/// not a client-supplied value: the renderer enforces this itself so a caller
/// can never widen the limit by sending a different `targetBytes`.
const MAX_GIF_BYTES: u64 = 8_000_000;

/// 计算结果的临时目录名。目录与文件名都由后端创建和决定，前端只传 taskId 与
/// 编码参数，不能传入任意临时路径；保存阶段也只接受本工具登记过的 taskId。
const COMPUTED_GIF_DIR_NAME: &str = "brand-material-gif-preview";

/// 计算结果的最长保留时间。每次新的计算顺手清理更早的残留，避免临时目录
/// 随着反复计算无限增长；正在使用的结果不会被误删（刚写入，未过期）。
const COMPUTED_GIF_MAX_AGE: Duration = Duration::from_secs(24 * 60 * 60);

/// 用户主动取消计算时返回给前端的标志性消息。前端据此区分「取消」与「失败」，
/// 两者都不会产生可保存的结果。
const GIF_COMPUTE_CANCELLED: &str = "计算已取消";

/// How many *full* encodes one GIF task may spend. Aligned with the standalone
/// GIF tool's rule "首次完整编码 + 最多一次宽度校正". The short analysis sample is
/// not a full encode and is not counted here.
const MAX_GIF_FULL_ENCODES: u32 = 2;

/// Short analysis sample: never wider than this and never longer than
/// `GIF_SAMPLE_MAX_SECONDS`. Used only to pick the first full-encode width.
const GIF_SAMPLE_MAX_WIDTH: u32 = 320;
const GIF_SAMPLE_MAX_SECONDS: f64 = 2.0;

/// Progress share owned by the short analysis sample; the full encodes split
/// the remainder so the visible progress never moves backwards.
const GIF_SAMPLE_PROGRESS: f64 = 0.15;

/// Spread reported around a predicted size. The preview always shows a range:
/// a two-second sample cannot promise a byte-exact result for the whole segment.
const GIF_ESTIMATE_RANGE_RATIO: f64 = 0.2;

/// Shortest segment the UI allows; a "shorten the clip" suggestion never goes
/// below it.
const GIF_MIN_SEGMENT_SECONDS: f64 = 0.1;

/// The four product intents. This is the wire format shared with the UI; the
/// frame rate stays a user choice (two presets per intent) and is never changed
/// by compression.
const GIF_MODES: [&str; 4] = ["balanced", "fps", "quality", "custom"];

/// How aggressively the single width correction aims at the budget, per intent.
///
/// A larger factor keeps more resolution (aims closer to the budget); a smaller
/// one shrinks more so the budget is met with certainty. The frame rate is never
/// part of this decision: it stays the user's hard constraint.
fn gif_correction_safety(mode: &str) -> f64 {
    match mode {
        // 画质优先：保护输出尺寸与单帧细节。
        "quality" => 0.97,
        // 帧率优先：该倾向明确允许用宽度换体积。
        "fps" => 0.85,
        // 均衡 / 自定义。
        _ => 0.92,
    }
}

fn gif_mode_is_valid(mode: &str) -> bool {
    GIF_MODES.contains(&mode)
}

/// Accepts both JSON integers and JSON floats for a `u64` field.
///
/// Tauri commands deserialize through `serde_json`, which rejects a floating
/// point literal for a `u64` field with `invalid type: floating point`. The
/// byte budget used to be computed in JavaScript as `7.8 * 1024 * 1024`, which
/// serialized to `8178892.8` and failed request parsing outright. Rather than
/// trusting every caller to pre-round, the boundary now coerces explicitly.
fn flexible_u64<'de, D>(deserializer: D) -> Result<Option<u64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Raw {
        Int(i64),
        Float(f64),
    }

    let raw = Option::<Raw>::deserialize(deserializer)?;
    Ok(match raw {
        None => None,
        // Negative and non-finite values are meaningless as a byte budget; treat
        // them as "no budget supplied" instead of failing the whole request.
        Some(Raw::Int(value)) => u64::try_from(value).ok(),
        Some(Raw::Float(value)) if value.is_finite() && value >= 0.0 => Some(value.round() as u64),
        Some(Raw::Float(_)) => None,
    })
}

/// The byte budget one GIF attempt must respect to be publishable.
///
/// `target_bytes == 0` means "no client budget", in which case the decimal hard
/// ceiling is the whole budget. A client budget can only tighten it, never widen
/// it past `MAX_GIF_BYTES`.
fn gif_budget(target_bytes: u64) -> u64 {
    if target_bytes == 0 {
        MAX_GIF_BYTES
    } else {
        target_bytes.min(MAX_GIF_BYTES)
    }
}

/// Whether a finished GIF encode may be published as the user's output.
///
/// Deliberately independent of "how many attempts are left": exceeding the
/// budget forbids publishing, it does not by itself end the task.
fn gif_within_budget(actual_bytes: u64, target_bytes: u64) -> bool {
    actual_bytes > 0 && actual_bytes <= gif_budget(target_bytes)
}

/// What one finished GIF encode attempt means for the loop.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum GifStepOutcome {
    /// Under budget: publish the temp file to the destination and finish.
    Publish,
    /// Over budget but fixable: drop the temp file, shrink the width, try again.
    Retry,
    /// Unusable: drop the temp file and fail with the given reason.
    Fail(GifFailureReason),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum GifFailureReason {
    /// Every allowed full encode was used and the result was still over budget.
    BudgetUnreachable,
    /// The output width is already at the user's floor, so another encode
    /// cannot reduce the size any further.
    NoRoomToShrink,
}

/// Byte rate of the short sample, scaled from the sample width to `width`.
///
/// GIF size grows roughly with pixel area per second, so the sample yields
/// `sample_bytes / sample_seconds` bytes per second and another width scales
/// that by the area ratio. Pure so the estimate is testable without FFmpeg.
fn gif_bytes_per_second(
    sample_bytes: u64,
    sample_seconds: f64,
    sample_width: u32,
    width: u32,
) -> f64 {
    let seconds = sample_seconds.max(0.05);
    let sample_width = sample_width.max(1);
    let area = (width.max(1) as f64 / sample_width as f64).powi(2);
    (sample_bytes as f64 / seconds) * area
}

/// Estimated bytes for the *whole* selected segment at `width`.
///
/// The sample only covers `sample_seconds`, so its per-second rate must be
/// multiplied by the real segment duration. Treating the sample byte count as
/// the whole-clip size would badly under-estimate long segments.
fn gif_estimate_full_bytes(
    sample_bytes: u64,
    sample_seconds: f64,
    sample_width: u32,
    width: u32,
    duration_seconds: f64,
) -> u64 {
    let per_second = gif_bytes_per_second(sample_bytes, sample_seconds, sample_width, width);
    (per_second * duration_seconds.max(0.0)).round() as u64
}

/// Width the budget can afford for the *whole* segment, computed from the sample.
///
/// Closed form of `estimate_full_bytes(width) ≤ budget × safety` under the area
/// model: `w ≤ w_sample × sqrt(budget × safety × t_sample / (sample_bytes × T))`.
/// Clamped to `[floor, cap]`. Note the duration ratio: a 2 s sample of a 10 s
/// clip must aim roughly `sqrt(5)` narrower than the sample width.
fn fit_width_for_budget(
    sample_width: u32,
    sample_bytes: u64,
    sample_seconds: f64,
    budget: u64,
    safety_ratio: f64,
    floor: u32,
    cap: u32,
    duration_seconds: f64,
) -> Option<u32> {
    if sample_width == 0 || sample_bytes == 0 || budget == 0 || cap == 0 || duration_seconds <= 0.0
    {
        return None;
    }
    let sample_seconds = sample_seconds.max(0.05);
    let full_at_sample_width = (sample_bytes as f64 / sample_seconds) * duration_seconds;
    if full_at_sample_width <= 0.0 {
        return None;
    }
    let ratio = (budget as f64 * safety_ratio) / full_at_sample_width;
    let predicted = (sample_width as f64 * ratio.sqrt()).round() as u32;
    Some(predicted.clamp(floor.max(1).min(cap), cap))
}

/// Symmetric estimate range shown in the preview. Never a guarantee.
fn gif_estimate_range(estimate: u64) -> (u64, u64) {
    if estimate == 0 {
        return (0, 0);
    }
    let low = (estimate as f64 * (1.0 - GIF_ESTIMATE_RANGE_RATIO)).round() as u64;
    let high = (estimate as f64 * (1.0 + GIF_ESTIMATE_RANGE_RATIO)).round() as u64;
    (low.max(1), high)
}

/// What to suggest when the estimate is over budget.
///
/// First choice: a narrower width that fits. If even the user's floor width
/// cannot fit, suggest shortening the segment instead. Purely advisory: the
/// user's own width / range inputs are never rewritten behind their back.
#[allow(clippy::too_many_arguments)]
fn gif_analysis_advice(
    sample_width: u32,
    sample_bytes: u64,
    sample_seconds: f64,
    budget: u64,
    safety_ratio: f64,
    expected_width: u32,
    floor: u32,
    duration_seconds: f64,
) -> (Option<u32>, Option<f64>) {
    if sample_bytes == 0 || budget == 0 || duration_seconds <= 0.0 || expected_width == 0 {
        return (None, None);
    }
    let at_expected = gif_estimate_full_bytes(
        sample_bytes,
        sample_seconds,
        sample_width,
        expected_width,
        duration_seconds,
    );
    if at_expected <= budget {
        return (None, None);
    }
    let floor_width = floor.max(1).min(expected_width);
    let at_floor = gif_estimate_full_bytes(
        sample_bytes,
        sample_seconds,
        sample_width,
        floor_width,
        duration_seconds,
    );
    if at_floor > budget {
        // Even the floor is too large: suggest a shorter segment, rounded down to
        // 0.1 s and never below the minimum the UI allows.
        let ratio = budget as f64 / at_floor.max(1) as f64;
        let seconds = ((duration_seconds * ratio * 10.0).floor() / 10.0).max(0.0);
        if seconds >= GIF_MIN_SEGMENT_SECONDS && seconds < duration_seconds {
            return (None, Some(seconds));
        }
        return (None, None);
    }
    let fitted = fit_width_for_budget(
        sample_width,
        sample_bytes,
        sample_seconds,
        budget,
        safety_ratio,
        floor_width,
        expected_width,
        duration_seconds,
    )
    .unwrap_or(floor_width);
    if fitted < expected_width {
        (Some(fitted), None)
    } else {
        (None, None)
    }
}

/// The short analysis sample is the *same* encoder request as the real one —
/// same builder, same FPS, same palette/dither strategy — with only the width
/// and the trimmed duration reduced. Nothing else may diverge, otherwise the
/// prediction would not describe the real encode.
fn gif_sample_request(
    request: &GifMediaTaskRequest,
    sample_width: u32,
    sample_seconds: f64,
) -> GifMediaTaskRequest {
    let mut sample = request.clone();
    let start = sample.options.start_seconds.unwrap_or(0.0);
    sample.options.end_seconds = Some(start + sample_seconds.max(0.05));
    sample.options.width = Some(sample_width);
    sample
}

/// Width and duration of the analysis sample for a given segment.
///
/// Shared by the explicit analysis and the production run so both encode the
/// *same* short sample; that is what makes reusing a preview sample safe.
fn gif_sample_plan(cap: u32, segment_seconds: f64) -> (u32, f64) {
    let width = GIF_SAMPLE_MAX_WIDTH.min(cap.max(1)).max(1);
    let seconds = segment_seconds.max(0.05).min(GIF_SAMPLE_MAX_SECONDS);
    (width, seconds)
}

/// Identity of one short sample encoding.
///
/// Every input that changes the sample bytes is part of it (source identity and
/// length, frame rate, preset, segment start, sample geometry). The production
/// run recomputes it and only reuses a preview sample whose signature matches.
fn gif_sample_signature(
    input_path: &str,
    input_len: u64,
    fps: u32,
    preset: &str,
    start_seconds: f64,
    sample_width: u32,
    sample_seconds: f64,
) -> String {
    format!(
        "gif-sample-v1|{input_path}|{input_len}|{fps}|{preset}|{start_seconds:.6}|{sample_width}|{sample_seconds:.6}"
    )
}

fn gif_input_len(input_path: &str) -> u64 {
    std::fs::metadata(input_path)
        .map(|meta| meta.len())
        .unwrap_or(0)
}

/// User-facing explanation for a task that could not reach the budget. Pure so
/// the exact wording (decimal units, "已删除，未写入输出目录") is testable.
fn gif_failure_message(
    reason: GifFailureReason,
    last_bytes: u64,
    target_bytes: u64,
    fps: u32,
) -> String {
    let budget = gif_budget(target_bytes);
    let over_ceiling = last_bytes > MAX_GIF_BYTES;
    let head = match reason {
        GifFailureReason::BudgetUnreachable => format!(
            "已用完 {} 次完整编码，最后一次仍为 {}（{} 字节），超过目标 {} 字节。",
            MAX_GIF_FULL_ENCODES,
            format_file_size(last_bytes),
            last_bytes,
            budget
        ),
        GifFailureReason::NoRoomToShrink => format!(
            "输出宽度已到设定的下限，无法再通过缩小宽度降低体积。最后一次编码为 {}（{} 字节），超过目标 {} 字节。",
            format_file_size(last_bytes),
            last_bytes,
            budget
        ),
    };
    let ceiling = if over_ceiling {
        format!(
            "\n该结果同时超过绝对上限 {} 字节（{}），因此不会写入输出目录。",
            MAX_GIF_BYTES,
            format_file_size(MAX_GIF_BYTES)
        )
    } else {
        String::new()
    };
    format!(
        "{head}{ceiling}\n压缩只会缩小输出宽度，帧率始终保持你设定的 {fps} fps，截取时长也不会被改动。\n请缩短截取区间、降低帧率或调小输出宽度后重试。本次产物已删除，未写入输出目录。"
    )
}

/// Publishes a finished, budget-checked GIF without ever overwriting a file this
/// task did not create.
///
/// `next_available_path` only *predicts* a free name: between that check and the
/// publish, another task or the user can create the file. A plain `fs::rename`
/// would silently replace it on macOS/Linux, so the commit is a hard link
/// instead:
/// - the temp file already lives in the destination directory, so the link is
///   same-volume and creation is atomic;
/// - `hard_link` fails with `AlreadyExists` rather than replacing, so a
///   collision moves on to `_2`, `_3`, … and the other file is preserved;
/// - only after the link exists is the temp file removed.
///
/// Requirement: the destination filesystem must support hard links (APFS/HFS+,
/// NTFS, ext4 do; exFAT/FAT32 and some network mounts do not). On such a
/// filesystem the failure is reported explicitly instead of falling back to an
/// overwriting rename.
fn persist_gif_final(temp: &Path, preferred: &Path) -> Result<PathBuf, String> {
    let parent = preferred.parent().unwrap_or_else(|| Path::new("."));
    let stem = preferred
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("output");
    let ext = preferred
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("gif");
    let mut index = 1u32;
    loop {
        let candidate = if index == 1 {
            preferred.to_path_buf()
        } else {
            parent.join(format!("{stem}_{index}.{ext}"))
        };
        match fs::hard_link(temp, &candidate) {
            Ok(()) => {
                remove_incomplete_output(temp);
                return Ok(candidate);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                index += 1;
                continue;
            }
            Err(error) => {
                remove_incomplete_output(temp);
                return Err(format!(
                    "无法在不覆盖既有文件的前提下写入输出目录：{error}（该文件系统可能不支持硬链接）"
                ));
            }
        }
    }
}

/// 后端管理的计算结果目录（系统临时目录下固定名称）。
fn computed_gif_dir() -> PathBuf {
    std::env::temp_dir().join(COMPUTED_GIF_DIR_NAME)
}

/// 清理计算结果目录里超过 `max_age` 的 `.gif` 产物。
///
/// 只清理本目录内的 GIF 文件，不触碰用户目录；正在使用的结果刚写入，不会过期。
fn prune_computed_gifs(dir: &Path, max_age: Duration) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let now = std::time::SystemTime::now();
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if !metadata.is_file() {
            continue;
        }
        let is_gif = path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case("gif"));
        if !is_gif {
            continue;
        }
        let stale = metadata
            .modified()
            .ok()
            .and_then(|modified| now.duration_since(modified).ok())
            .is_some_and(|age| age > max_age);
        if stale {
            let _ = fs::remove_file(&path);
        }
    }
}

/// 删除某个计算结果及其所有中间产物（同目录下以同一 stem 开头的临时 GIF）。
///
/// 只作用于后端管理的结果目录；前缀来自本工具生成的唯一文件名，不会误删
/// 其他任务或用户文件。
fn cleanup_gif_artifacts(preferred: &Path) {
    remove_incomplete_output(preferred);
    let Some(parent) = preferred.parent() else {
        return;
    };
    let Some(stem) = preferred.file_stem().and_then(|value| value.to_str()) else {
        return;
    };
    let Ok(entries) = fs::read_dir(parent) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        let is_related = name.starts_with(&format!(".{stem}."))
            || name == format!("{stem}.gif")
            || name.starts_with(&format!("{stem}_"));
        let is_gif = name.ends_with(".gif");
        if is_related && is_gif {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// Sources the `{stem}_gif.gif` name used when the user saves a computed result.
fn gif_source_stem(input_path: &str) -> String {
    Path::new(input_path)
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("media")
        .to_string()
}

/// 保存阶段的临时文件：与目标目录同卷，隐藏且带进程号/序号，写入完成并同步后
/// 再走 `persist_gif_final` 的非覆盖硬链接发布。
fn save_gif_temp_path(directory: &Path, preferred_name: &str) -> PathBuf {
    static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let stem = Path::new(preferred_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("gif");
    let sequence = SEQUENCE.fetch_add(1, Ordering::Relaxed);
    directory.join(format!(
        ".{stem}.{}.{sequence}.save.tmp.gif",
        std::process::id()
    ))
}

/// 校验一个计算结果确实是 GIF（`GIF87a` / `GIF89a`），并返回真实字节数。
fn validate_computed_gif(path: &Path) -> Result<u64, String> {
    let metadata = fs::metadata(path).map_err(|error| format!("无法读取计算结果：{error}"))?;
    if !metadata.is_file() || metadata.len() == 0 {
        return Err("计算结果为空".into());
    }
    let mut header = [0u8; 6];
    {
        use std::io::Read;
        let mut file =
            fs::File::open(path).map_err(|error| format!("无法读取计算结果：{error}"))?;
        file.read_exact(&mut header)
            .map_err(|error| format!("无法读取计算结果：{error}"))?;
    }
    if &header[..3] != b"GIF" {
        return Err("计算结果不是有效的 GIF 文件".into());
    }
    if metadata.len() > MAX_GIF_BYTES {
        return Err(format!(
            "计算结果 {} 超过 {MAX_GIF_BYTES} 字节上限",
            metadata.len()
        ));
    }
    Ok(metadata.len())
}

/// Width-only compression step.
///
/// FPS is a user hard constraint in this tool and compression never changes it,
/// so width is the only knob. Returns the next width, strictly smaller than
/// `current_width` and never below `floor`; `None` means there is no room left
/// and the task must stop explicitly instead of re-encoding identical output.
fn next_gif_width(
    current_width: u32,
    floor: u32,
    safety_ratio: f64,
    actual_bytes: u64,
    budget: u64,
) -> Option<u32> {
    if actual_bytes == 0 || budget == 0 || current_width == 0 {
        return None;
    }
    let floor = floor.max(1);
    // Already at (or below) the user's floor: another encode would reproduce the
    // same picture, so the loop must stop explicitly instead of spinning.
    if current_width <= floor {
        return None;
    }
    let ratio = (budget as f64 * safety_ratio) / actual_bytes as f64;
    let scaled = (current_width as f64 * ratio.sqrt()).round() as u32;
    // Progress is measured in real width only: a step that does not reduce the
    // width would just re-encode the same picture.
    let candidate = scaled.clamp(floor, current_width.saturating_sub(1));
    (candidate < current_width).then_some(candidate)
}

/// Pure loop decision: the only place that decides whether one attempt's
/// artefact may reach the user's destination.
///
/// Rules (aligned with the standalone GIF tool's product rules):
/// - a result within budget is published;
/// - a result over budget — including one above the decimal hard ceiling —
///   keeps the task alive while a width correction is still possible;
/// - only when no correction is left does the task fail explicitly.
///
/// Extracted so the boundary cases are testable without spawning FFmpeg or
/// constructing a Tauri `AppHandle`.
fn gif_step_outcome(
    actual_bytes: u64,
    target_bytes: u64,
    can_shrink: bool,
    full_encodes_done: u32,
    max_full_encodes: u32,
) -> GifStepOutcome {
    if gif_within_budget(actual_bytes, target_bytes) {
        return GifStepOutcome::Publish;
    }
    if can_shrink && full_encodes_done < max_full_encodes {
        return GifStepOutcome::Retry;
    }
    if can_shrink {
        GifStepOutcome::Fail(GifFailureReason::BudgetUnreachable)
    } else {
        GifStepOutcome::Fail(GifFailureReason::NoRoomToShrink)
    }
}

/// Thin, unified spawn helper for every bundled FFmpeg/FFprobe subprocess
/// (encode, probe, hardware-capability check, preview, version read). On
/// Windows it adds `CREATE_NO_WINDOW` so no cmd/PowerShell/FFmpeg console window
/// appears; on all other platforms it returns the default `Command` unchanged.
/// Production sites must route through here; test fixtures may keep using
/// `std::process::Command` directly.
fn bundled_command(program: impl AsRef<Path>) -> Command {
    let mut command = Command::new(program.as_ref());
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GifMediaOptions {
    pub start_seconds: Option<f64>,
    pub end_seconds: Option<f64>,
    pub width: Option<u32>,
    pub fps: u32,
    pub preset: String,
    // Compute omits this field; direct export still requires a valid directory.
    #[serde(default)]
    pub output_directory: String,
    /// 目标文件体积（bytes），用于 8MB 自动收口。软预算；硬上限固定为
    /// `MAX_GIF_BYTES`（8,000,000 字节），不随本字段放大。
    #[serde(default, deserialize_with = "flexible_u64")]
    pub target_bytes: Option<u64>,
    /// 倾向（意图）：balanced / fps / quality / custom。只影响超限时宽度校正的
    /// 幅度，不会改变帧率或截取时长。
    #[serde(default)]
    pub mode: Option<String>,
    /// 最低允许输出宽度：宽度校正的下限。
    #[serde(default)]
    pub min_width: Option<u32>,
    /// 计算预览得到的有效短样本。正式生成只在签名完全一致时复用它，避免同一份
    /// 有效分析被重复编码；签名不匹配则自己重新采样。
    #[serde(default)]
    pub sample: Option<GifSampleHint>,
}

/// A short-sample measurement returned by `analyze_gif_media_task`.
///
/// The production run reuses it only when `signature` matches the sample it
/// would have produced itself, so a stale hint can never drive the estimate.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GifSampleHint {
    pub signature: String,
    pub width: u32,
    pub seconds: f64,
    pub bytes: u64,
}

/// Result of the explicit "计算预览" step: one real output frame plus a byte
/// estimate derived from a short sample of the very same encoder.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GifAnalysis {
    pub task_id: String,
    /// Real decoded frame at the chosen time, at the expected output width.
    pub frame_path: String,
    pub output_width: u32,
    pub output_height: u32,
    pub fps: u32,
    pub start_seconds: f64,
    pub end_seconds: f64,
    pub duration_seconds: f64,
    pub sample_width: u32,
    pub sample_seconds: f64,
    pub sample_bytes: u64,
    pub estimate_low_bytes: u64,
    pub estimate_bytes: u64,
    pub estimate_high_bytes: u64,
    pub budget_bytes: u64,
    /// Conservative verdict: the top of the estimate range still fits the budget.
    pub likely_fits: bool,
    /// Width the budget can afford, when it is narrower than the expected width.
    pub suggested_width: Option<u32>,
    /// Shorten-the-clip hint, used when even the floor width cannot fit.
    pub suggested_seconds: Option<f64>,
    /// Signature of the reused sample, passed back on the generation request.
    pub sample_signature: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GifMediaTaskRequest {
    pub task_id: String,
    pub input_path: String,
    pub options: GifMediaOptions,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatermarkOptions {
    pub kind: String,
    pub text: String,
    pub image_path: Option<String>,
    pub position: String,
    pub size_percent: u32,
    pub opacity: f64,
    #[serde(default)]
    pub pattern: Option<String>,
    #[serde(default)]
    pub density: Option<String>,
    #[serde(default)]
    pub angle: Option<i32>,
    #[serde(default)]
    pub dark_mode: Option<bool>,
    #[serde(default)]
    pub offset_x: Option<f64>,
    #[serde(default)]
    pub offset_y: Option<f64>,
    #[serde(default)]
    pub columns: Option<u32>,
    #[serde(default)]
    pub rows: Option<u32>,
    #[serde(default)]
    pub placements: Option<Vec<WatermarkPlacement>>,
    #[serde(default)]
    pub quality: Option<String>,
    #[serde(default)]
    pub prefer_hardware: Option<bool>,
    /// Text watermark style: `white` (default), `black`, or `outlined`
    /// (white fill + black stroke). Kept as an optional string so legacy queue
    /// snapshots and older callers default to the existing white behaviour.
    #[serde(default)]
    pub text_style: Option<String>,
    #[serde(default)]
    pub reserved_output_path: Option<String>,
    pub output_directory: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatermarkPlacement {
    pub x_percent: f64,
    pub y_percent: f64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatermarkMediaTaskRequest {
    pub task_id: String,
    pub input_path: String,
    pub options: WatermarkOptions,
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
pub enum MediaTaskEvent {
    Progress {
        task_id: String,
        progress: f64,
    },
    Completed {
        task_id: String,
        output_path: String,
        output_bytes: u64,
    },
    Failed {
        task_id: String,
        message: String,
    },
    Cancelled {
        task_id: String,
    },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaEngineStatus {
    pub ready: bool,
    pub message: String,
    pub ffmpeg_version: Option<String>,
    pub ffprobe_version: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EncoderCapabilityEntry {
    pub backend: String,
    pub backend_name: String,
    pub encoder: String,
    pub available: bool,
    pub reason: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatermarkEncoderCapability {
    pub hardware_available: bool,
    pub backend_name: String,
    pub reason: String,
    pub candidates: Vec<EncoderCapabilityEntry>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatermarkRecommendationRequest {
    pub input_path: String,
    pub kind: String,
    pub text: String,
    pub image_path: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoWatermarkRecommendation {
    pub size_percent: u32,
    pub density: String,
    pub columns: u32,
    pub rows: u32,
    pub spacing_x: f64,
    pub spacing_y: f64,
    pub opacity: f64,
    pub angle: i32,
    pub gutter_percent: u32,
    pub reason: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaTaskStarted {
    pub task_id: String,
    pub output_path: String,
}

/// 一次「计算 GIF」的真实产物。
///
/// `path` 位于后端管理的临时结果目录，尚未写入用户导出目录；`width/height/
/// bytes` 读取真实文件（FFprobe 失败时宽高为 0，由前端在图片加载后用
/// naturalWidth/naturalHeight 校正），`fps` 是本次请求的设置值而不是实测值。
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputedGifResult {
    pub task_id: String,
    pub path: String,
    pub bytes: u64,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub duration_seconds: f64,
    pub start_seconds: f64,
    pub end_seconds: f64,
}

/// 把已计算 GIF 写入用户导出目录的返回结果。
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedGifResult {
    pub path: String,
    pub bytes: u64,
}

#[derive(Clone, Debug)]
struct ComputedGifEntry {
    path: PathBuf,
    preferred_name: String,
}

/// 已计算结果的登记表：taskId → 临时文件与建议文件名。
///
/// 保存命令只接受 taskId，再从这里解析真实路径，因此不存在「前端传任意路径
/// 就复制」的宽泛接口。
#[derive(Default)]
pub struct ComputedGifRegistry {
    entries: Mutex<HashMap<String, ComputedGifEntry>>,
}

impl ComputedGifRegistry {
    fn insert(&self, task_id: String, path: PathBuf, preferred_name: String) {
        let mut entries = self.entries.lock().expect("computed gif registry poisoned");
        if let Some(previous) = entries.remove(&task_id) {
            cleanup_gif_artifacts(&previous.path);
        }
        entries.insert(
            task_id,
            ComputedGifEntry {
                path,
                preferred_name,
            },
        );
    }

    fn get(&self, task_id: &str) -> Option<ComputedGifEntry> {
        self.entries
            .lock()
            .expect("computed gif registry poisoned")
            .get(task_id)
            .cloned()
    }

    fn remove(&self, task_id: &str) -> Option<PathBuf> {
        self.entries
            .lock()
            .expect("computed gif registry poisoned")
            .remove(task_id)
            .map(|entry| entry.path)
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaProbeResult {
    pub duration: f64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub codec: String,
    pub has_audio: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewGifRequest {
    pub task_id: String,
    pub input_path: String,
    pub start_seconds: f64,
    pub end_seconds: f64,
    pub width: Option<u32>,
    pub fps: u32,
    pub preset: String,
    pub temp_dir: String,
}

#[derive(Default)]
pub struct MediaTaskRegistry {
    children: Mutex<HashMap<String, Arc<Mutex<Child>>>>,
    cancelled: Mutex<HashSet<String>>,
    cancel_tokens: Mutex<HashMap<String, Arc<std::sync::atomic::AtomicBool>>>,
    preview_tasks: Mutex<HashMap<String, Arc<Mutex<Child>>>>,
    preview_cancelled: Mutex<HashSet<String>>,
}

impl MediaTaskRegistry {
    fn insert(&self, task_id: String, child: Arc<Mutex<Child>>) {
        self.children
            .lock()
            .expect("media child registry poisoned")
            .insert(task_id, child);
    }

    fn remove(&self, task_id: &str) {
        self.children
            .lock()
            .expect("media child registry poisoned")
            .remove(task_id);
    }

    fn take_cancelled(&self, task_id: &str) -> bool {
        self.cancelled
            .lock()
            .expect("media child registry poisoned")
            .remove(task_id)
    }

    fn register_cancel_token(&self, task_id: &str, token: Arc<std::sync::atomic::AtomicBool>) {
        self.cancel_tokens
            .lock()
            .expect("media cancel token registry poisoned")
            .insert(task_id.to_string(), token);
    }

    fn remove_cancel_token(&self, task_id: &str) {
        self.cancel_tokens
            .lock()
            .expect("media cancel token registry poisoned")
            .remove(task_id);
    }

    fn cancel(&self, task_id: &str) -> Result<(), String> {
        if let Some(token) = self
            .cancel_tokens
            .lock()
            .expect("media cancel token registry poisoned")
            .get(task_id)
            .cloned()
        {
            token.store(true, std::sync::atomic::Ordering::SeqCst);
        }
        let child = self
            .children
            .lock()
            .expect("media child registry poisoned")
            .get(task_id)
            .cloned();
        let Some(child) = child else {
            if self
                .cancel_tokens
                .lock()
                .expect("media cancel token registry poisoned")
                .contains_key(task_id)
            {
                self.cancelled
                    .lock()
                    .expect("media child registry poisoned")
                    .insert(task_id.to_string());
                return Ok(());
            }
            return Err("未找到正在处理的媒体任务".into());
        };
        self.cancelled
            .lock()
            .expect("media child registry poisoned")
            .insert(task_id.to_string());
        child
            .lock()
            .map_err(|_| "无法终止媒体任务".to_string())?
            .kill()
            .map_err(|error| format!("无法终止媒体任务：{error}"))?;
        Ok(())
    }

    fn insert_preview(&self, task_id: String, child: Arc<Mutex<Child>>) {
        self.preview_tasks
            .lock()
            .expect("media preview registry poisoned")
            .insert(task_id, child);
    }

    fn remove_preview(&self, task_id: &str) {
        self.preview_tasks
            .lock()
            .expect("media preview registry poisoned")
            .remove(task_id);
    }

    fn cancel_preview(&self, task_id: &str) -> Result<(), String> {
        let child = self
            .preview_tasks
            .lock()
            .expect("media preview registry poisoned")
            .get(task_id)
            .cloned();
        let Some(child) = child else {
            return Err("未找到预览任务".into());
        };
        child
            .lock()
            .map_err(|_| "无法终止预览任务".to_string())?
            .kill()
            .map_err(|error| format!("无法终止预览：{error}"))?;
        self.preview_cancelled
            .lock()
            .expect("media preview registry poisoned")
            .insert(task_id.to_string());
        Ok(())
    }
}

fn target_sidecar_name(tool: &str) -> OsString {
    if cfg!(target_os = "windows") {
        OsString::from(format!("{tool}.exe"))
    } else {
        OsString::from(tool)
    }
}

pub fn sidecar_path(_app: &AppHandle, tool: &str) -> Result<PathBuf, String> {
    let exe_dir = std::env::current_exe()
        .map_err(|error| format!("无法定位应用可执行文件：{error}"))?
        .parent()
        .ok_or_else(|| "无法确定应用可执行文件目录".to_string())?
        .to_path_buf();
    let path = exe_dir.join(target_sidecar_name(tool));
    if !path.is_file() {
        return Err(format!("内置 {tool} 未找到（路径：{}）", path.display()));
    }
    Ok(path)
}

fn read_sidecar_version(path: &Path) -> Result<String, String> {
    let output = bundled_command(path)
        .arg("-version")
        .output()
        .map_err(|error| format!("无法启动内置工具：{error}"))?;
    if !output.status.success() {
        return Err("内置工具无法执行".into());
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .map(str::to_owned)
        .ok_or_else(|| "内置工具未返回版本信息".into())
}

pub fn engine_status(app: AppHandle) -> MediaEngineStatus {
    let ffmpeg_path = sidecar_path(&app, "ffmpeg");
    let ffprobe_path = sidecar_path(&app, "ffprobe");
    let ffmpeg = ffmpeg_path
        .as_ref()
        .ok()
        .and_then(|path| read_sidecar_version(path).ok());
    let ffprobe = ffprobe_path
        .as_ref()
        .ok()
        .and_then(|path| read_sidecar_version(path).ok());
    match (&ffmpeg, &ffprobe) {
        (Some(ffmpeg_version), Some(ffprobe_version)) => MediaEngineStatus {
            ready: true,
            message: "已就绪：仅使用应用内置 FFmpeg / FFprobe。".into(),
            ffmpeg_version: Some(ffmpeg_version.clone()),
            ffprobe_version: Some(ffprobe_version.clone()),
        },
        (None, _) => MediaEngineStatus {
            ready: false,
            message: format!(
                "{}",
                ffmpeg_path.err().unwrap_or_else(|| "FFmpeg 未找到".into())
            ),
            ffmpeg_version: None,
            ffprobe_version: ffprobe.clone(),
        },
        (_, None) => MediaEngineStatus {
            ready: false,
            message: format!(
                "{}",
                ffprobe_path
                    .err()
                    .unwrap_or_else(|| "FFprobe 未找到".into())
            ),
            ffmpeg_version: ffmpeg.clone(),
            ffprobe_version: None,
        },
    }
}

/// Everything a task needs regardless of whether it will write anything: used
/// by the explicit analysis (which only writes into the temp dir) as well as by
/// the production run.
fn validate_gif_inputs(request: &GifMediaTaskRequest) -> Result<(), String> {
    let input = Path::new(&request.input_path);
    if !input.is_file() {
        return Err("输入文件不存在或不可访问".into());
    }
    let extension = input
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase);
    if !matches!(extension.as_deref(), Some("mp4" | "mov")) {
        return Err("首版仅支持 MP4 或 MOV 输入".into());
    }
    if request.options.fps == 0 || request.options.fps > 60 {
        return Err("FPS 必须在 1 到 60 之间".into());
    }
    if let Some(mode) = request.options.mode.as_deref() {
        if !gif_mode_is_valid(mode) {
            return Err("不支持的输出倾向".into());
        }
    }
    if let Some(width) = request.options.width {
        if width == 0 || width > 8192 {
            return Err("期望宽度必须在 1 到 8192 之间".into());
        }
    }
    if let Some(min_width) = request.options.min_width {
        if min_width == 0 || min_width > 8192 {
            return Err("最低输出宽度必须在 1 到 8192 之间".into());
        }
        if let Some(width) = request.options.width.filter(|width| *width > 0) {
            if min_width > width {
                return Err("最低输出宽度不能大于期望宽度".into());
            }
        }
    }
    if request
        .options
        .end_seconds
        .zip(request.options.start_seconds)
        .is_some_and(|(end, start)| end <= start)
    {
        return Err("结束时间必须大于开始时间".into());
    }
    Ok(())
}

fn validate_request(request: &GifMediaTaskRequest) -> Result<(), String> {
    validate_gif_inputs(request)?;
    if !Path::new(&request.options.output_directory).is_dir() {
        return Err("输出文件夹不存在或不可访问".into());
    }
    Ok(())
}

fn media_extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
}

fn is_static_image(path: &Path) -> bool {
    matches!(
        media_extension(path).as_deref(),
        Some("png" | "jpg" | "jpeg" | "webp")
    )
}

fn is_video_media(path: &Path) -> bool {
    matches!(media_extension(path).as_deref(), Some("mp4" | "mov"))
}

fn validate_watermark_request(request: &WatermarkMediaTaskRequest) -> Result<(), String> {
    let input = Path::new(&request.input_path);
    let output_directory = Path::new(&request.options.output_directory);
    if !input.is_file() {
        return Err("输入文件不存在或不可访问".into());
    }
    if !matches!(
        media_extension(input).as_deref(),
        Some("png" | "jpg" | "jpeg" | "webp" | "gif" | "mp4" | "mov")
    ) {
        return Err("可见水印仅支持 PNG、JPG、WebP、GIF、MP4 或 MOV".into());
    }
    if !output_directory.is_dir() {
        return Err("输出文件夹不存在或不可访问".into());
    }
    if !matches!(request.options.kind.as_str(), "text" | "image") {
        return Err("水印类型无效".into());
    }
    if !matches!(
        request.options.position.as_str(),
        "top-left"
            | "top-center"
            | "top-right"
            | "middle-left"
            | "center"
            | "middle-right"
            | "bottom-left"
            | "bottom-center"
            | "bottom-right"
    ) {
        return Err("水印位置无效".into());
    }
    if request.options.size_percent == 0 || request.options.size_percent > 90 {
        return Err("水印大小必须在 1% 到 90% 之间".into());
    }
    if !(0.0..=1.0).contains(&request.options.opacity) {
        return Err("水印透明度必须在 0 到 1 之间".into());
    }
    if request.options.kind == "text" && request.options.text.trim().is_empty() {
        return Err("请输入文字水印内容".into());
    }
    if request.options.kind == "image" {
        let image = request.options.image_path.as_deref().map(Path::new);
        if !image.is_some_and(|path| {
            path.is_file()
                && matches!(
                    media_extension(path).as_deref(),
                    Some("png" | "jpg" | "jpeg" | "webp")
                )
        }) {
            return Err("请选择 PNG、JPG 或 WebP 图片水印".into());
        }
    }
    Ok(())
}

/// Concise, non-sensitive render parameters for production audit logs. The
/// watermark text, input/output paths and task ids are deliberately excluded;
/// only the numeric/layout parameters that determine the visual output are
/// included so a future render can be reconstructed and compared.
fn watermark_render_diagnostics(options: &WatermarkOptions) -> String {
    format!(
        "kind={} pattern={} density={} size_percent={} opacity={} angle={} placements={} text_style={}",
        options.kind,
        options.pattern.as_deref().unwrap_or("single"),
        options.density.as_deref().unwrap_or("none"),
        options.size_percent,
        options.opacity,
        options.angle.unwrap_or(0),
        options.placements.as_ref().map(Vec::len).unwrap_or(0),
        options.text_style.as_deref().unwrap_or("white"),
    )
}

fn next_available_path(directory: &Path, preferred_name: &str) -> PathBuf {
    let candidate = directory.join(preferred_name);
    if !candidate.exists() {
        return candidate;
    }
    let stem = Path::new(preferred_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("output");
    let extension = Path::new(preferred_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("gif");
    let mut index = 2;
    loop {
        let candidate = directory.join(format!("{stem}_{index}.{extension}"));
        if !candidate.exists() {
            return candidate;
        }
        index += 1;
    }
}

fn output_path(request: &GifMediaTaskRequest) -> PathBuf {
    let source_stem = Path::new(&request.input_path)
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("media");
    next_available_path(
        Path::new(&request.options.output_directory),
        &format!("{source_stem}_gif.gif"),
    )
}

fn watermark_output_path(request: &WatermarkMediaTaskRequest) -> PathBuf {
    next_available_path(
        Path::new(&request.options.output_directory),
        &watermark_preferred_name(request),
    )
}

fn watermark_preferred_name(request: &WatermarkMediaTaskRequest) -> String {
    let input = Path::new(&request.input_path);
    let source_stem = input
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("media");
    let extension = media_extension(input).unwrap_or_else(|| "png".into());
    format!("{source_stem}_watermarked.{extension}")
}

fn watermark_reserved_preferred_name(
    request: &WatermarkMediaTaskRequest,
    directory: &Path,
) -> String {
    request
        .options
        .reserved_output_path
        .as_deref()
        .and_then(|reserved| {
            let reserved = Path::new(reserved);
            (reserved.parent() == Some(directory))
                .then(|| reserved.file_name().and_then(|name| name.to_str()))
                .flatten()
                .map(ToOwned::to_owned)
        })
        .unwrap_or_else(|| watermark_preferred_name(request))
}

fn duration_seconds(app: &AppHandle, input: &Path) -> Result<f64, String> {
    let ffprobe = sidecar_path(app, "ffprobe")?;
    let output = bundled_command(ffprobe)
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
        ])
        .arg(input)
        .output()
        .map_err(|error| format!("无法读取媒体时长：{error}"))?;
    if !output.status.success() {
        return Err("FFprobe 无法读取媒体时长".into());
    }
    String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<f64>()
        .map_err(|_| "FFprobe 返回的媒体时长无效".into())
}

#[tauri::command]
pub fn probe_media(app: AppHandle, input_path: String) -> Result<MediaProbeResult, String> {
    let input = Path::new(&input_path);
    if !input.is_file() {
        return Err("输入文件不存在或不可访问".into());
    }
    // 原片预览走 Tauri 官方 asset 协议：只对用户本次选择（或拖入）的这一个文件
    // 追加运行时授权，不扩大 tauri.conf.json 的静态 scope。拖入的路径不会像
    // 文件选择器那样被 dialog 插件自动授权，所以必须在这里按文件放行。
    let _ = app.asset_protocol_scope().allow_file(input);
    let ffprobe = sidecar_path(&app, "ffprobe")?;
    let output = bundled_command(ffprobe)
        .args([
            "-v",
            "error",
            "-show_entries",
            "stream=codec_type,duration,width,height,r_frame_rate,codec_name:format=duration",
            "-of",
            "json",
        ])
        .arg(input)
        .output()
        .map_err(|error| format!("无法读取媒体信息：{error}"))?;
    if !output.status.success() {
        return Err("FFprobe 无法分析该媒体文件".into());
    }
    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|_| "FFprobe 返回数据无法解析".to_string())?;

    let streams = json["streams"].as_array().cloned().unwrap_or_default();
    let stream = streams
        .iter()
        .find(|stream| stream["codec_type"] == "video")
        .cloned()
        .ok_or_else(|| "媒体没有视频流".to_string())?;
    let has_audio = streams.iter().any(|stream| stream["codec_type"] == "audio");
    let format_duration = json["format"]["duration"]
        .as_str()
        .and_then(|v| v.parse::<f64>().ok());
    let stream_duration = stream["duration"]
        .as_str()
        .and_then(|v| v.parse::<f64>().ok());
    let duration = format_duration.or(stream_duration).unwrap_or(0.0);

    let (fps_num, fps_den) = stream["r_frame_rate"]
        .as_str()
        .and_then(|v| v.split_once('/'))
        .and_then(|(n, d)| Some((n.parse::<f64>().ok()?, d.parse::<f64>().ok()?)))
        .unwrap_or((25.0, 1.0));
    let fps = if fps_den > 0.0 {
        fps_num / fps_den
    } else {
        25.0
    };

    let width = stream["width"].as_u64().unwrap_or(0) as u32;
    let height = stream["height"].as_u64().unwrap_or(0) as u32;
    let codec = stream["codec_name"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();

    Ok(MediaProbeResult {
        duration,
        width,
        height,
        fps,
        codec,
        has_audio,
    })
}

#[tauri::command]
pub fn preview_gif_frame(
    app: AppHandle,
    registry: tauri::State<'_, MediaTaskRegistry>,
    request: PreviewGifRequest,
) -> Result<MediaTaskStarted, String> {
    let input = Path::new(&request.input_path);
    if !input.is_file() {
        return Err("输入文件不存在或不可访问".into());
    }
    let temp_dir = Path::new(&request.temp_dir);
    if !temp_dir.is_dir() {
        std::fs::create_dir_all(temp_dir).map_err(|e| format!("无法创建临时目录：{e}"))?;
    }
    // Cancel any existing preview with same task_id pattern
    let _ = registry.cancel_preview(&request.task_id);
    registry.remove_preview(&request.task_id);

    if !engine_status(app.clone()).ready {
        return Err("转换引擎不可用".into());
    }
    let ffmpeg = sidecar_path(&app, "ffmpeg")?;
    let output = temp_dir.join(format!("preview_{}.gif", request.task_id));

    let duration = request.end_seconds - request.start_seconds;
    if duration <= 0.0 {
        return Err("预览时长必须大于0".into());
    }

    let mut args = vec![
        OsString::from("-hide_banner"),
        OsString::from("-nostdin"),
        OsString::from("-y"),
        OsString::from("-ss"),
        OsString::from(request.start_seconds.to_string()),
        OsString::from("-t"),
        OsString::from(duration.min(3.0).to_string()),
        OsString::from("-i"),
        OsString::from(&request.input_path),
    ];

    let mut filters = Vec::new();
    if let Some(w) = request.width {
        filters.push(format!("scale={w}:-2:flags=lanczos"));
    }
    filters.push(format!("fps={}", request.fps));
    let filter = filters.join(",");
    let dither = if request.preset == "fast" {
        "bayer:bayer_scale=5"
    } else {
        "sierra2_4a"
    };
    let palette = format!(
        "{filter},split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither={dither}"
    );

    args.extend([
        OsString::from("-filter_complex"),
        OsString::from(palette),
        OsString::from("-loop"),
        OsString::from("0"),
        OsString::from("-nostats"),
        output.as_os_str().to_owned(),
    ]);

    let child = bundled_command(ffmpeg)
        .args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("无法生成预览：{error}"))?;

    let child = Arc::new(Mutex::new(child));
    registry.insert_preview(request.task_id.clone(), child.clone());

    let task_id = request.task_id.clone();
    let output_clone = output.clone();
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let status = child.lock().ok().and_then(|mut c| c.wait().ok());
        let registry = app_clone.state::<MediaTaskRegistry>();
        let cancelled = registry
            .preview_cancelled
            .lock()
            .expect("preview registry poisoned")
            .remove(&task_id);
        registry.remove_preview(&task_id);
        if cancelled {
            let _ = std::fs::remove_file(&output_clone);
            return;
        }
        if status.map_or(false, |s| s.success()) {
            if let Ok(meta) = std::fs::metadata(&output_clone) {
                emit(
                    &app_clone,
                    MediaTaskEvent::Completed {
                        task_id,
                        output_path: output_clone.to_string_lossy().into_owned(),
                        output_bytes: meta.len(),
                    },
                );
            }
        }
    });

    Ok(MediaTaskStarted {
        task_id: request.task_id,
        output_path: output.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn cancel_preview_task(
    registry: tauri::State<'_, MediaTaskRegistry>,
    task_id: String,
) -> Result<(), String> {
    registry.cancel_preview(&task_id)
}

fn filter_graph(options: &GifMediaOptions) -> String {
    let mut filters = Vec::new();
    if let Some(width) = options.width {
        filters.push(format!("scale={width}:-2:flags=lanczos"));
    }
    filters.push(format!("fps={}", options.fps));
    filters.join(",")
}

fn ffmpeg_args(request: &GifMediaTaskRequest, output: &Path) -> Vec<OsString> {
    let options = &request.options;
    let mut args = vec![
        OsString::from("-hide_banner"),
        OsString::from("-nostdin"),
        OsString::from("-y"), // -y for retry safety (prev output removed before encode)
    ];
    if let Some(start) = options.start_seconds {
        args.extend([OsString::from("-ss"), OsString::from(start.to_string())]);
    }
    args.extend([OsString::from("-i"), OsString::from(&request.input_path)]);
    if let Some(end) = options.end_seconds {
        let duration = end - options.start_seconds.unwrap_or(0.0);
        args.extend([OsString::from("-t"), OsString::from(duration.to_string())]);
    }
    let filter = filter_graph(options);
    let dither = if options.preset == "fast" {
        "bayer:bayer_scale=5"
    } else {
        "sierra2_4a"
    };
    let palette = format!("{filter},split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither={dither}");
    args.extend([
        OsString::from("-filter_complex"),
        OsString::from(palette),
        OsString::from("-loop"),
        OsString::from("0"), // always infinite loop
        OsString::from("-progress"),
        OsString::from("pipe:1"),
        OsString::from("-nostats"),
        output.as_os_str().to_owned(),
    ]);
    args
}

fn overlay_coordinates(position: &str) -> (&'static str, &'static str) {
    match position {
        "top-left" => ("20", "20"),
        "top-center" => ("(main_w-overlay_w)/2", "20"),
        "top-right" => ("main_w-overlay_w-20", "20"),
        "middle-left" => ("20", "(main_h-overlay_h)/2"),
        "center" => ("(main_w-overlay_w)/2", "(main_h-overlay_h)/2"),
        "middle-right" => ("main_w-overlay_w-20", "(main_h-overlay_h)/2"),
        "bottom-left" => ("20", "main_h-overlay_h-20"),
        "bottom-center" => ("(main_w-overlay_w)/2", "main_h-overlay_h-20"),
        _ => ("main_w-overlay_w-20", "main_h-overlay_h-20"),
    }
}

fn tiled_coordinates() -> [(&'static str, &'static str); 9] {
    [
        ("main_w*0.17-overlay_w/2", "main_h*0.17-overlay_h/2"),
        ("main_w*0.50-overlay_w/2", "main_h*0.17-overlay_h/2"),
        ("main_w*0.83-overlay_w/2", "main_h*0.17-overlay_h/2"),
        ("main_w*0.17-overlay_w/2", "main_h*0.50-overlay_h/2"),
        ("main_w*0.50-overlay_w/2", "main_h*0.50-overlay_h/2"),
        ("main_w*0.83-overlay_w/2", "main_h*0.50-overlay_h/2"),
        ("main_w*0.17-overlay_w/2", "main_h*0.83-overlay_h/2"),
        ("main_w*0.50-overlay_w/2", "main_h*0.83-overlay_h/2"),
        ("main_w*0.83-overlay_w/2", "main_h*0.83-overlay_h/2"),
    ]
}

/// Drawtext uses only w/h/text_w/text_h. It must not contain main_w / overlay_w / overlay_h.
fn drawtext_single_position(position: &str) -> (&'static str, &'static str) {
    match position {
        "top-left" => ("10", "10"),
        "top-center" => ("(w-text_w)/2", "10"),
        "top-right" => ("w-text_w-10", "10"),
        "middle-left" => ("10", "(h-text_h)/2"),
        "center" => ("(w-text_w)/2", "(h-text_h)/2"),
        "middle-right" => ("w-text_w-10", "(h-text_h)/2"),
        "bottom-left" => ("10", "h-text_h-10"),
        "bottom-center" => ("(w-text_w)/2", "h-text_h-10"),
        _ => ("w-text_w-10", "h-text_h-10"),
    }
}

/// Drawtext tiled uses only w/h/text_w/text_h. It must not contain main_w / overlay_w / overlay_h.
fn drawtext_tiled_coordinates() -> [(&'static str, &'static str); 9] {
    [
        ("w*0.17-text_w/2", "h*0.17-text_h/2"),
        ("w*0.50-text_w/2", "h*0.17-text_h/2"),
        ("w*0.83-text_w/2", "h*0.17-text_h/2"),
        ("w*0.17-text_w/2", "h*0.50-text_h/2"),
        ("w*0.50-text_w/2", "h*0.50-text_h/2"),
        ("w*0.83-text_w/2", "h*0.50-text_h/2"),
        ("w*0.17-text_w/2", "h*0.83-text_h/2"),
        ("w*0.50-text_w/2", "h*0.83-text_h/2"),
        ("w*0.83-text_w/2", "h*0.83-text_h/2"),
    ]
}

fn filter_number(value: f64) -> String {
    if value.fract() == 0.0 {
        format!("{}", value as i64)
    } else {
        format!("{value:.4}")
    }
}

fn filter_offset(value: Option<f64>) -> String {
    let value = value.filter(|value| value.is_finite()).unwrap_or(0.0);
    if value == 0.0 {
        String::new()
    } else if value.is_sign_negative() {
        format!("-{}", filter_number(value.abs()))
    } else {
        format!("+{}", filter_number(value))
    }
}

fn offset_filter_position(base: &str, offset: Option<f64>) -> String {
    format!("({base}){}", filter_offset(offset))
}

fn text_watermark_positions(
    pattern: &str,
    position: &str,
    density: Option<&str>,
    columns: Option<u32>,
    rows: Option<u32>,
    placements: Option<&[WatermarkPlacement]>,
    offset_x: Option<f64>,
    offset_y: Option<f64>,
) -> Vec<(String, String)> {
    if let Some(placements) = placements {
        return placements
            .iter()
            .map(|placement| {
                (
                    format!(
                        "(w-text_w)*{}{}",
                        (placement.x_percent / 100.0).clamp(0.0, 1.0),
                        filter_offset(offset_x)
                    ),
                    format!(
                        "(h-text_h)*{}{}",
                        (placement.y_percent / 100.0).clamp(0.0, 1.0),
                        filter_offset(offset_y)
                    ),
                )
            })
            .collect();
    }
    if pattern == "single" {
        let (x, y) = drawtext_single_position(position);
        return vec![(
            offset_filter_position(x, offset_x),
            offset_filter_position(y, offset_y),
        )];
    }
    let (cols, rows) = watermark_grid_dimensions(density, columns, rows);
    let mut positions = Vec::with_capacity(cols * rows);
    for row in 0..rows {
        for col in 0..cols {
            positions.push((
                format!(
                    "((w-text_w)*{}/{} ){}",
                    col * 2 + 1,
                    cols * 2,
                    filter_offset(offset_x)
                ),
                format!(
                    "((h-text_h)*{}/{} ){}",
                    row * 2 + 1,
                    rows * 2,
                    filter_offset(offset_y)
                ),
            ));
        }
    }
    positions
}

fn image_watermark_positions(
    pattern: &str,
    position: &str,
    density: Option<&str>,
    columns: Option<u32>,
    rows: Option<u32>,
    placements: Option<&[WatermarkPlacement]>,
    offset_x: Option<f64>,
    offset_y: Option<f64>,
) -> Vec<(String, String)> {
    if let Some(placements) = placements {
        return placements
            .iter()
            .map(|placement| {
                (
                    format!(
                        "(main_w-overlay_w)*{}{}",
                        (placement.x_percent / 100.0).clamp(0.0, 1.0),
                        filter_offset(offset_x)
                    ),
                    format!(
                        "(main_h-overlay_h)*{}{}",
                        (placement.y_percent / 100.0).clamp(0.0, 1.0),
                        filter_offset(offset_y)
                    ),
                )
            })
            .collect();
    }
    if pattern == "single" {
        let (x, y) = overlay_coordinates(position);
        return vec![(
            offset_filter_position(x, offset_x),
            offset_filter_position(y, offset_y),
        )];
    }
    let (cols, rows) = watermark_grid_dimensions(density, columns, rows);
    let mut positions = Vec::with_capacity(cols * rows);
    for row in 0..rows {
        for col in 0..cols {
            positions.push((
                format!(
                    "((main_w-overlay_w)*{}/{} ){}",
                    col * 2 + 1,
                    cols * 2,
                    filter_offset(offset_x)
                ),
                format!(
                    "((main_h-overlay_h)*{}/{} ){}",
                    row * 2 + 1,
                    rows * 2,
                    filter_offset(offset_y)
                ),
            ));
        }
    }
    positions
}

fn watermark_grid_dimensions(
    density: Option<&str>,
    columns: Option<u32>,
    rows: Option<u32>,
) -> (usize, usize) {
    if let (Some(columns), Some(rows)) = (columns, rows) {
        return (columns.clamp(1, 12) as usize, rows.clamp(1, 12) as usize);
    }
    match density.unwrap_or("medium") {
        "high" => (5, 3),
        "low" => (2, 2),
        _ => (3, 2),
    }
}

fn escape_filter_value(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace(':', "\\:")
        .replace('\'', "\\'")
        .replace(',', "\\,")
}

fn watermark_font_path(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .resource_dir()
        .map_err(|error| format!("无法定位应用资源目录：{error}"))?
        .join("resources/fonts/SourceHanSansSC-Regular.otf");
    if !path.is_file() {
        return Err("内置中文水印字体未找到".into());
    }
    Ok(path)
}

fn watermark_text_file(task_id: &str, text: &str) -> Result<PathBuf, String> {
    let path = std::env::temp_dir().join(format!("brand-material-watermark-{task_id}.txt"));
    fs::write(&path, text).map_err(|error| format!("无法准备水印文字：{error}"))?;
    Ok(path)
}

fn brick_coordinates(density: &str, count: usize) -> Vec<(&'static str, &'static str)> {
    let (cols, rows, x_step, y_step): (usize, usize, &str, &str) = match density {
        "high" => (5, 4, "main_w/5", "main_h/4"),
        "low" => (2, 2, "main_w/2", "main_h/2"),
        _ => (3, 3, "main_w/3", "main_h/3"),
    };
    let mut coords = Vec::new();
    for row in 0..rows {
        let offset = if row % 2 == 1 {
            format!("{x_step}/2")
        } else {
            "0".to_string()
        };
        for col in 0..(if row % 2 == 1 && cols > 0 {
            cols - 1
        } else {
            cols
        }) {
            let x = if row % 2 == 1 {
                format!("{x_step}*{col}+{x_step}/2-overlay_w/2")
            } else {
                format!("{x_step}*{col}+{x_step}/2-overlay_w/2")
            };
            let y = format!("{y_step}*{row}+{y_step}/2-overlay_h/2");
            // Leak these strings to static
            coords.push(("", ""));
        }
    }
    // Simplified: use tiled for now, diagonal/brick need complex FFmpeg
    tiled_coordinates().to_vec()
}

/// Explicit video encoder backend. Mirrors HandBrake/Jellyfin's separation of
/// concrete hardware encoders (NVENC/AMF/QSV/VideoToolbox) from software x264:
/// each backend maps to exactly one public FFmpeg encoder and carries its own
/// probe cache, never a single global "hardware available" bool.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EncoderBackend {
    Nvenc,
    Amf,
    Qsv,
    VideoToolbox,
    Cpu,
}

impl EncoderBackend {
    /// The public FFmpeg encoder name for this backend.
    fn encoder_name(self) -> &'static str {
        match self {
            EncoderBackend::Nvenc => "h264_nvenc",
            EncoderBackend::Amf => "h264_amf",
            EncoderBackend::Qsv => "h264_qsv",
            EncoderBackend::VideoToolbox => "h264_videotoolbox",
            EncoderBackend::Cpu => "libx264",
        }
    }

    /// Human-readable backend label surfaced to the capability UI.
    fn display_name(self) -> &'static str {
        match self {
            EncoderBackend::Nvenc => "NVENC",
            EncoderBackend::Amf => "AMF",
            EncoderBackend::Qsv => "QSV",
            EncoderBackend::VideoToolbox => "VideoToolbox",
            EncoderBackend::Cpu => "CPU",
        }
    }

    /// Wire identifier for the serialized capability entry.
    fn wire_name(self) -> &'static str {
        match self {
            EncoderBackend::Nvenc => "nvenc",
            EncoderBackend::Amf => "amf",
            EncoderBackend::Qsv => "qsv",
            EncoderBackend::VideoToolbox => "videotoolbox",
            EncoderBackend::Cpu => "cpu",
        }
    }

    fn is_hardware(self) -> bool {
        !matches!(self, EncoderBackend::Cpu)
    }

    fn is_cpu(self) -> bool {
        matches!(self, EncoderBackend::Cpu)
    }
}

/// Map a backend to the exact public FFmpeg video encoder name. Hardware video
/// encoders only change the video codec; filters stay on CPU.
fn video_encoder_name(backend: EncoderBackend) -> &'static str {
    backend.encoder_name()
}

/// The backend's input pixel format accepted by the selected encoder. The
/// Windows hardware encoders (NVENC/AMF/QSV) accept NV12 natively — QSV requires
/// it (`CODEC_PIXFMTS(AV_PIX_FMT_NV12, AV_PIX_FMT_QSV)` in FFmpeg's
/// `qsvenc_h264.c`) — while the bundled macOS VideoToolbox (FFmpeg 4.4) and
/// libx264 keep `yuv420p`. The produced H.264 stream still probes as `yuv420p`.
fn encoder_pixel_format(backend: EncoderBackend) -> &'static str {
    match backend {
        EncoderBackend::Nvenc | EncoderBackend::Amf | EncoderBackend::Qsv => "nv12",
        EncoderBackend::VideoToolbox | EncoderBackend::Cpu => "yuv420p",
    }
}

fn current_platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

/// Ordered candidate backends for a platform. Windows probes NVENC, then AMF,
/// then QSV, always ending on libx264; macOS has VideoToolbox + libx264; other
/// platforms are software-only. This order is the sole source of truth for
/// both selection and runtime fallback.
fn ordered_candidates(platform: &str) -> &'static [EncoderBackend] {
    match platform {
        "windows" => &[
            EncoderBackend::Nvenc,
            EncoderBackend::Amf,
            EncoderBackend::Qsv,
            EncoderBackend::Cpu,
        ],
        "macos" => &[EncoderBackend::VideoToolbox, EncoderBackend::Cpu],
        _ => &[EncoderBackend::Cpu],
    }
}

/// Respect an explicit CPU preference; otherwise use the already-selected
/// first-available backend (which is `Cpu` when no hardware candidate passed).
fn encoder_backend_for_request(
    prefer_hardware: Option<bool>,
    selected: EncoderBackend,
) -> EncoderBackend {
    if prefer_hardware == Some(false) {
        EncoderBackend::Cpu
    } else {
        selected
    }
}

/// Per-backend probe result (never persisted to disk). `reason` is either the
/// success note or the stderr summary of the failure, so callers can surface an
/// exact unavailable reason instead of swallowing the error.
#[derive(Clone, Debug)]
struct EncoderProbeResult {
    backend: EncoderBackend,
    available: bool,
    reason: String,
}

/// Concise, bounded tail of FFmpeg stderr: the last few non-empty lines joined,
/// truncated so the capability payload never balloons from a verbose failure.
fn stderr_summary(stderr: &str, max_chars: usize) -> String {
    let lines: Vec<&str> = stderr
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    let tail = if lines.len() > 3 {
        &lines[lines.len() - 3..]
    } else {
        &lines[..]
    };
    let summary = tail.join(" | ");
    let summary: String = summary.chars().take(max_chars).collect();
    if summary.is_empty() {
        "无错误输出".to_string()
    } else {
        summary
    }
}

/// Bounded hardware-probe subprocess timeouts. OBS probes each encoder with its
/// own finite deadline so a wedged driver init can never hang the whole
/// capability check or first video task; we mirror that with std-only polling.
const ENCODER_LIST_TIMEOUT: Duration = Duration::from_secs(10);
const ENCODER_PROBE_TIMEOUT: Duration = Duration::from_secs(30);
const ENCODER_VALIDATE_TIMEOUT: Duration = Duration::from_secs(10);

/// Captured output of a bounded subprocess. `status` is always `Some`; timeouts
/// and spawn failures surface as `Err` from `run_command_bounded`.
#[derive(Debug)]
struct BoundedOutput {
    status: Option<ExitStatus>,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

/// Run a child process with a bounded wall-clock deadline using only `std`.
/// Both pipes are drained on dedicated threads (so a full pipe can never
/// deadlock the child) while the parent polls `try_wait`. On timeout the child
/// is killed and reaped so no orphan remains, and a concrete reason is returned.
fn run_command_bounded(mut command: Command, timeout: Duration) -> Result<BoundedOutput, String> {
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| format!("无法启动进程：{error}"))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdout_handle = thread::spawn(move || {
        let mut buffer = Vec::new();
        if let Some(mut pipe) = stdout {
            let _ = pipe.read_to_end(&mut buffer);
        }
        buffer
    });
    let stderr_handle = thread::spawn(move || {
        let mut buffer = Vec::new();
        if let Some(mut pipe) = stderr {
            let _ = pipe.read_to_end(&mut buffer);
        }
        buffer
    });

    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = stdout_handle.join();
                    let _ = stderr_handle.join();
                    return Err(format!("探测超时（超过 {} 秒）", timeout.as_secs()));
                }
                thread::sleep(Duration::from_millis(20));
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_handle.join();
                let _ = stderr_handle.join();
                return Err(format!("等待进程退出失败：{error}"));
            }
        }
    };
    let stdout = stdout_handle.join().unwrap_or_default();
    let stderr = stderr_handle.join().unwrap_or_default();
    Ok(BoundedOutput {
        status: Some(status),
        stdout,
        stderr,
    })
}

/// Compile-capability layer (Jellyfin `EncoderValidator` style): an encoder is
/// a candidate only when the bundled FFmpeg actually lists it in `-encoders`.
/// This runs once per process and gates the expensive runtime probe.
fn encoder_is_compiled_in(ffmpeg: &Path, encoder: &str) -> bool {
    static COMPILED_ENCODERS: std::sync::OnceLock<Vec<String>> = std::sync::OnceLock::new();
    let encoders = COMPILED_ENCODERS.get_or_init(|| {
        let mut command = bundled_command(ffmpeg);
        command.args(["-hide_banner", "-encoders"]);
        run_command_bounded(command, ENCODER_LIST_TIMEOUT)
            .ok()
            .map(|out| String::from_utf8_lossy(&out.stdout).into_owned())
            .unwrap_or_default()
            .lines()
            .filter_map(|line| line.split_whitespace().nth(1).map(str::to_owned))
            .collect()
    });
    encoders.iter().any(|name| name == encoder)
}

/// Runtime-capability probe: a real 1280x720 @ 30fps, 120-frame encode using
/// the same encoder, quality arguments and pixel format as production export.
/// Every subprocess runs under a bounded deadline so a wedged driver init can
/// never hang the caller; the temp artifact is always cleaned up; and a zero
/// exit status is only trusted after the output is re-validated by FFprobe.
fn probe_encoder(ffmpeg: &Path, ffprobe: &Path, backend: EncoderBackend) -> EncoderProbeResult {
    let encoder = video_encoder_name(backend);
    if !encoder_is_compiled_in(ffmpeg, encoder) {
        return EncoderProbeResult {
            backend,
            available: false,
            reason: format!("内置 FFmpeg 未编译 {encoder} 编码器"),
        };
    }

    let temp = std::env::temp_dir().join(format!(
        ".bmw-hw-probe-{}-{}.mp4",
        std::process::id(),
        encoder
    ));
    let mut args = vec![
        OsString::from("-hide_banner"),
        OsString::from("-nostdin"),
        OsString::from("-y"),
        OsString::from("-f"),
        OsString::from("lavfi"),
        OsString::from("-i"),
        OsString::from("testsrc2=size=1280x720:rate=30"),
        OsString::from("-frames:v"),
        OsString::from("120"),
    ];
    // Reuse the production quality arguments and pixel format so the probe
    // exercises the same encoder path as a real export. Hardware backends feed
    // NV12 explicitly (matching the validated Windows smoke harness) so the
    // synthetic yuv420p lavfi source is converted before the encoder.
    let pixel_format = encoder_pixel_format(backend);
    if pixel_format == "nv12" {
        args.extend([OsString::from("-vf"), OsString::from("format=nv12")]);
    }
    args.extend(video_encoder_args(backend, Some("balanced")));
    args.extend([
        OsString::from("-pix_fmt"),
        OsString::from(pixel_format),
        OsString::from("-f"),
        OsString::from("mp4"),
    ]);
    args.push(temp.as_os_str().to_owned());

    let mut command = bundled_command(ffmpeg);
    command
        .args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let encode = run_command_bounded(command, ENCODER_PROBE_TIMEOUT);

    let encode_output = match encode {
        Ok(output) => output,
        Err(reason) => {
            let _ = fs::remove_file(&temp);
            return EncoderProbeResult {
                backend,
                available: false,
                reason: format!("{encoder} 编码探测失败：{reason}"),
            };
        }
    };

    if !encode_output.status.as_ref().is_some_and(|s| s.success()) {
        let stderr = String::from_utf8_lossy(&encode_output.stderr).into_owned();
        let _ = fs::remove_file(&temp);
        return EncoderProbeResult {
            backend,
            available: false,
            reason: stderr_summary(&stderr, 320),
        };
    }

    // Encode succeeded; a zero exit status is not enough — re-validate the
    // artifact decodes as the exact probe contract (h264 1280x720 yuv420p with
    // a readable frame count).
    let validation = validate_encoder_probe_output(ffprobe, &temp);
    let _ = fs::remove_file(&temp);
    match validation {
        Ok(()) => EncoderProbeResult {
            backend,
            available: true,
            reason: "已通过 720p/30fps/120 帧实机编码探测".to_string(),
        },
        Err(reason) => EncoderProbeResult {
            backend,
            available: false,
            reason,
        },
    }
}

/// FFprobe-validate a probe artifact under a bounded deadline: it must decode
/// as H.264, 1280x720, yuv420p with a readable frame count. A zero FFmpeg exit
/// status alone is never trusted as "available".
fn validate_encoder_probe_output(ffprobe: &Path, path: &Path) -> Result<(), String> {
    let mut command = bundled_command(ffprobe);
    command
        .args([
            "-v",
            "error",
            "-show_entries",
            "stream=codec_type,codec_name,pix_fmt,width,height,nb_frames",
            "-of",
            "json",
        ])
        .arg(path);
    let output = run_command_bounded(command, ENCODER_VALIDATE_TIMEOUT)
        .map_err(|reason| format!("验证探测产物失败：{reason}"))?;
    if !output.status.as_ref().is_some_and(|s| s.success()) {
        return Err("验证探测产物失败：FFprobe 无法解析输出".into());
    }
    validate_probe_json(&String::from_utf8_lossy(&output.stdout))
}

/// Pure validation of the FFprobe JSON contract, factored out so tests can
/// exercise exact codec/size/pixel-format/frame-count mismatches without a
/// subprocess. `nb_frames` is the mp4 container frame count and must be
/// readable and non-zero, not merely present in a codec-name string.
fn validate_probe_json(json: &str) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_str(json)
        .map_err(|_| "验证探测产物失败：FFprobe 返回数据无法解析".to_string())?;
    let streams = value["streams"].as_array().cloned().unwrap_or_default();
    let video = streams
        .iter()
        .find(|stream| stream["codec_type"] == "video")
        .ok_or_else(|| "验证探测产物失败：没有视频流".to_string())?;

    let codec = video["codec_name"].as_str().unwrap_or("");
    if codec != "h264" {
        return Err(format!("探测输出不是 H.264：{codec}"));
    }
    let width = video["width"].as_u64().unwrap_or(0) as u32;
    let height = video["height"].as_u64().unwrap_or(0) as u32;
    if width != 1280 || height != 720 {
        return Err(format!("探测输出尺寸 {width}x{height} 不是 1280x720"));
    }
    let pix_fmt = video["pix_fmt"].as_str().unwrap_or("");
    if pix_fmt != "yuv420p" {
        return Err(format!("探测输出像素格式 {pix_fmt} 不是 yuv420p"));
    }
    let nb_frames = video["nb_frames"]
        .as_str()
        .and_then(|v| v.parse::<u64>().ok())
        .or_else(|| video["nb_frames"].as_u64());
    if nb_frames.unwrap_or(0) == 0 {
        return Err("探测输出无法读取有效帧数".into());
    }
    Ok(())
}

/// Minimal injectable OnceLock wrapper so tests can assert a probe executor
/// runs exactly once across concurrent callers without touching disk state.
fn cached_probe<T, F>(cache: &std::sync::OnceLock<T>, probe: F) -> T
where
    T: Clone,
    F: FnOnce() -> T,
{
    cache.get_or_init(probe).clone()
}

/// Per-backend probe cache. Each backend gets its own `OnceLock`, so a passing
/// NVENC probe never masks an independent AMF/QSV result and a failed probe is
/// remembered per backend (never a single global bool).
#[derive(Default)]
struct EncoderProbeCache {
    nvenc: std::sync::OnceLock<EncoderProbeResult>,
    amf: std::sync::OnceLock<EncoderProbeResult>,
    qsv: std::sync::OnceLock<EncoderProbeResult>,
    videotoolbox: std::sync::OnceLock<EncoderProbeResult>,
    cpu: std::sync::OnceLock<EncoderProbeResult>,
}

impl EncoderProbeCache {
    fn cell(&self, backend: EncoderBackend) -> &std::sync::OnceLock<EncoderProbeResult> {
        match backend {
            EncoderBackend::Nvenc => &self.nvenc,
            EncoderBackend::Amf => &self.amf,
            EncoderBackend::Qsv => &self.qsv,
            EncoderBackend::VideoToolbox => &self.videotoolbox,
            EncoderBackend::Cpu => &self.cpu,
        }
    }
}

fn cached_encoder_probe(
    ffmpeg: &Path,
    ffprobe: &Path,
    backend: EncoderBackend,
) -> EncoderProbeResult {
    static CACHE: std::sync::OnceLock<EncoderProbeCache> = std::sync::OnceLock::new();
    let cache = CACHE.get_or_init(EncoderProbeCache::default);
    cached_probe(cache.cell(backend), || {
        probe_encoder(ffmpeg, ffprobe, backend)
    })
}

/// The selected backend plus the per-candidate probe results (used to surface
/// concrete backend names and unavailable reasons in the capability API).
#[derive(Clone, Debug)]
struct EncoderSelection {
    selected: EncoderBackend,
    results: Vec<EncoderProbeResult>,
}

/// Probe every hardware candidate (never stopping at the first pass), record
/// each pass/fail result, and select the first passing hardware backend (or
/// `Cpu` when none passes). Probing all candidates lets the runtime fallback
/// chain reuse the exact pass/fail set instead of blindly retrying backends
/// that were never verified. Results are reused from the per-backend cache, so
/// this is idempotent and cheap after the first call.
fn select_encoder(ffmpeg: &Path, ffprobe: &Path, platform: &str) -> EncoderSelection {
    let mut results = Vec::new();
    let mut selected = EncoderBackend::Cpu;
    for &candidate in ordered_candidates(platform) {
        if candidate.is_cpu() {
            break;
        }
        let result = cached_encoder_probe(ffmpeg, ffprobe, candidate);
        if result.available && selected.is_cpu() {
            selected = candidate;
        }
        results.push(result);
    }
    EncoderSelection { selected, results }
}

/// Errors that are never hardware device/driver/init failures. These guard the
/// fallback whitelist so a filter/path/disk/parameter failure can never trigger
/// a silent CPU retry even when the same stderr also mentions a device keyword.
///
/// `invalid argument` is deliberately NOT listed here: it is the generic EINVAL
/// string that NVENC (`OpenEncodeSessionEx failed: invalid argument`), AMF
/// (`AMF_ERROR_INVALID_ARG`) and QSV/MFX all surface for genuine device/session
/// init failures, so it must not blanket-block a real hardware fallback. A bare
/// "invalid argument" with no backend/device marker still does not fall back
/// because the backend whitelist below requires an explicit device/driver/init
/// context; specific parameter errors are caught by the other patterns here.
const NON_HARDWARE_FAILURE_PATTERNS: &[&str] = &[
    "no such filter",
    "error initializing filter",
    "filtergraph",
    "drawtext",
    "font",
    "no such file or directory",
    "permission denied",
    "error opening output",
    "error opening input",
    "is a directory",
    "no space left",
    "read-only",
    "read only",
    "does not exist",
    "option not found",
    "unrecognized option",
    "error parsing",
    "failed to set value",
    "unable to parse",
    "invalid option",
    "unknown option",
    "codec mismatch",
    "error validating",
    "finalize",
];

/// Backend-aware conservative whitelist of hardware device/driver/init errors
/// that justify falling back to the next candidate. Non-hardware failures are
/// terminal; a CPU backend never falls back.
fn is_hardware_fallback_error(stderr: &str, backend: EncoderBackend) -> bool {
    let lower = stderr.to_ascii_lowercase();
    if NON_HARDWARE_FAILURE_PATTERNS
        .iter()
        .any(|pattern| lower.contains(pattern))
    {
        return false;
    }
    let patterns: &[&str] = match backend {
        EncoderBackend::Nvenc => &[
            "nvenc",
            "cuda",
            "libcuda",
            "d3d11",
            "d3d12",
            "device",
            "driver",
            "openencodesession",
            "nvencodeapi",
            "cuinit",
            "failed to initialize",
            "encoder session",
            "could not create",
        ],
        EncoderBackend::Amf => &[
            "amf",
            "d3d11",
            "d3d12",
            "dxgi",
            "device",
            "driver",
            "amf_error",
            "amfcontext",
            "failed to initialize",
            "failed to create",
        ],
        EncoderBackend::Qsv => &[
            "qsv",
            "mfx",
            "vpl",
            "d3d11",
            "dxva2",
            "device",
            "driver",
            "mfxinit",
            "mfxsession",
            "failed to initialize",
            "session",
        ],
        EncoderBackend::VideoToolbox => &["videotoolbox", "device", "failed to initialize"],
        EncoderBackend::Cpu => &[],
    };
    patterns.iter().any(|pattern| lower.contains(pattern))
}

/// Build the runtime fallback chain from a completed selection: every hardware
/// backend that actually passed the startup probe (preserving platform order)
/// followed by the CPU encoder. A backend that failed — or was never probed —
/// is never retried at runtime, so a first-preference hardware failure falls
/// back to the other *verified* hardware backends and finally CPU.
fn fallback_chain_from_selection(selection: &EncoderSelection) -> Vec<EncoderBackend> {
    let mut chain: Vec<EncoderBackend> = selection
        .results
        .iter()
        .filter(|result| result.available && result.backend.is_hardware())
        .map(|result| result.backend)
        .collect();
    chain.push(EncoderBackend::Cpu);
    chain
}

/// Resolve the request's runtime chain. When the caller forced CPU (while a
/// hardware backend was selected), the chain is CPU-only; otherwise it is the
/// passed-hardware-plus-CPU chain from the selection.
fn runtime_fallback_chain(
    selection: &EncoderSelection,
    backend: EncoderBackend,
) -> Vec<EncoderBackend> {
    if backend.is_cpu() && selection.selected.is_hardware() {
        vec![EncoderBackend::Cpu]
    } else {
        fallback_chain_from_selection(selection)
    }
}

/// Attempt orchestration over an explicit candidate chain: try each backend in
/// order, and only on a hardware device/driver/init error fall through to the
/// next candidate (eventually the CPU encoder). Cancellation, success and every
/// non-hardware failure are terminal without fallback.
fn orchestrate_watermark_encode_chain<F>(
    candidates: &[EncoderBackend],
    mut run_attempt: F,
    on_fallback: &mut dyn FnMut(),
) -> MediaTerminal
where
    F: FnMut(EncoderBackend) -> (MediaTerminal, String),
{
    let last_index = candidates.len() - 1;
    for (index, &backend) in candidates.iter().enumerate() {
        let (terminal, stderr) = run_attempt(backend);
        match terminal {
            MediaTerminal::Completed { .. } | MediaTerminal::Cancelled => return terminal,
            MediaTerminal::Failed { message } => {
                if backend.is_hardware()
                    && index < last_index
                    && is_hardware_fallback_error(&stderr, backend)
                {
                    on_fallback();
                    continue;
                }
                return MediaTerminal::Failed { message };
            }
        }
    }
    // Unreachable: `Cpu` is always the final candidate and never falls back.
    MediaTerminal::Failed {
        message: "所有可用编码后端均失败".into(),
    }
}

/// Build the `-c:v <encoder>` plus backend-specific quality arguments for the
/// selected backend. Quality presets map to public, version-compatible FFmpeg
/// parameters verified against the bundled FFmpeg 9.x build:
/// - NVENC: HandBrake-style CQ (`-rc vbr -cq <v> -b:v 0`).
/// - AMF:   constant QP (`-rc cqp -qp_i/-qp_p/-qp_b <v>`).
/// - QSV:   intelligent constant quality (`-global_quality <v>`).
/// - VideoToolbox: bitrate-based (FFmpeg 4.4 sidecar has no CQ mode).
fn video_encoder_args(backend: EncoderBackend, quality: Option<&str>) -> Vec<OsString> {
    let encoder = video_encoder_name(backend);
    let mut args = vec![OsString::from("-c:v"), OsString::from(encoder)];
    match backend {
        EncoderBackend::Cpu => {
            let (crf, preset) = match quality.unwrap_or("high") {
                "compact" => ("28", "faster"),
                "balanced" => ("23", "medium"),
                _ => ("18", "slow"),
            };
            args.extend([
                OsString::from("-crf"),
                OsString::from(crf),
                OsString::from("-preset"),
                OsString::from(preset),
            ]);
        }
        EncoderBackend::Nvenc => {
            let (cq, preset) = match quality.unwrap_or("high") {
                "compact" => ("28", "p2"),
                "balanced" => ("23", "p4"),
                _ => ("18", "p6"),
            };
            args.extend([
                OsString::from("-rc"),
                OsString::from("vbr"),
                OsString::from("-cq"),
                OsString::from(cq),
                OsString::from("-b:v"),
                OsString::from("0"),
                OsString::from("-preset"),
                OsString::from(preset),
            ]);
        }
        EncoderBackend::Amf => {
            let qp = match quality.unwrap_or("high") {
                "compact" => "28",
                "balanced" => "23",
                _ => "18",
            };
            let amf_quality = match quality.unwrap_or("high") {
                "compact" => "speed",
                "balanced" => "balanced",
                _ => "quality",
            };
            args.extend([
                OsString::from("-usage"),
                OsString::from("transcoding"),
                OsString::from("-rc"),
                OsString::from("cqp"),
                OsString::from("-qp_i"),
                OsString::from(qp),
                OsString::from("-qp_p"),
                OsString::from(qp),
                OsString::from("-qp_b"),
                OsString::from(qp),
                OsString::from("-quality"),
                OsString::from(amf_quality),
            ]);
        }
        EncoderBackend::Qsv => {
            let global_quality = match quality.unwrap_or("high") {
                "compact" => "28",
                "balanced" => "23",
                _ => "18",
            };
            let preset = match quality.unwrap_or("high") {
                "compact" => "veryfast",
                "balanced" => "medium",
                _ => "veryslow",
            };
            args.extend([
                OsString::from("-global_quality"),
                OsString::from(global_quality),
                OsString::from("-preset"),
                OsString::from(preset),
            ]);
        }
        EncoderBackend::VideoToolbox => {
            let bitrate = match quality.unwrap_or("high") {
                "compact" => "2000k",
                "balanced" => "4000k",
                _ => "8000k",
            };
            args.extend([OsString::from("-b:v"), OsString::from(bitrate)]);
        }
    }
    args
}

/// Concrete integer drawtext `borderw` for the outlined style. The Canvas
/// preview (`resolveWatermarkTextVisual`) and FFmpeg share this single formula:
/// `round(font_px * 0.08)`, floored at 1px. `font_px` is the effective font
/// height in pixels, which must be resolved from the known source frame size
/// before the filter is built (drawtext `borderw` is an `int`, not an
/// expression — see FFmpeg `vf_drawtext.c`'s `AV_OPT_TYPE_INT` `borderw`).
fn outlined_border_width(font_px: f64) -> u32 {
    (font_px * 0.08).round().max(1.0) as u32
}

/// Maps the shared text watermark style to a drawtext `fontcolor` and any
/// extra options. `white` is the default (unchanged); `black` switches the
/// fill; `outlined` keeps a white fill and adds a black outline whose width is
/// the concrete integer resolved by the caller via `outlined_border_width`.
fn text_style_drawtext(style: Option<&str>, border_width: Option<u32>) -> (String, String) {
    match style.unwrap_or("white") {
        "black" => ("black".to_string(), String::new()),
        "outlined" => (
            "white".to_string(),
            format!(":bordercolor=black:borderw={}", border_width.unwrap_or(1)),
        ),
        _ => ("white".to_string(), String::new()),
    }
}

/// Builds the FFmpeg text watermark graph for the render-plan path, where
/// `placements` are absolute pre-rotated brick centers (percentages of the
/// source frame). The text is drawn once, centered on a transparent layer,
/// rotated once, split, and overlaid at each center. This keeps the rotation
/// semantics identical to the Canvas preview (one rotation around each center)
/// instead of rotating the whole lattice layer a second time.
fn text_watermark_sprite_filter(
    placements: &[WatermarkPlacement],
    font: &str,
    text_file_value: &str,
    font_size: &str,
    alpha: &str,
    style: Option<&str>,
    border_width: Option<u32>,
    angle: i32,
    angle_radians: f64,
    angle_sin: f64,
    angle_cos: f64,
    cleanup: Vec<PathBuf>,
) -> (String, Vec<PathBuf>) {
    let (font_color, style_extra) = text_style_drawtext(style, border_width);
    let mut graph = vec![
        "[0:v]split[base][text-source]".to_string(),
        "[text-source]format=rgba,colorchannelmixer=aa=0[text-base]".to_string(),
        format!(
            "[text-base]drawtext=fontfile='{font}':textfile='{text_file_value}':fontcolor={font_color}{style_extra}:fontsize={font_size}:x=(w-text_w)/2:y=(h-text_h)/2[text-centered]"
        ),
    ];
    // Draw the glyphs fully opaque first, then scale the sprite's alpha
    // channel once. Drawing with `alpha` directly would blend the text
    // against the video pixels already present in `text-base` and then
    // blend again at overlay time, yielding opacity ≈ α² instead of α.
    graph.push(format!(
        "[text-centered]colorchannelmixer=aa={alpha}[text-faded]"
    ));
    let text_label = if angle != 0 {
        graph.push(format!(
            "[text-faded]rotate={angle_radians:.8}:ow=iw*{angle_cos:.8}+ih*{angle_sin:.8}:oh=iw*{angle_sin:.8}+ih*{angle_cos:.8}:fillcolor=black@0[text-rotated]"
        ));
        "text-rotated"
    } else {
        "text-faded"
    };
    // `W`/`H` are the base dimensions and `w`/`h` the (rotated) sprite
    // dimensions; `x=p*W-w/2` centers the sprite on the placement center `p`.
    let positions: Vec<(String, String)> = placements
        .iter()
        .map(|placement| {
            let x = (placement.x_percent / 100.0).clamp(0.0, 1.0);
            let y = (placement.y_percent / 100.0).clamp(0.0, 1.0);
            (format!("{x}*W-w/2"), format!("{y}*H-h/2"))
        })
        .collect();
    if positions.len() == 1 {
        let (x, y) = &positions[0];
        graph.push(format!(
            "[base][{text_label}]overlay=x={x}:y={y}:format=auto[watermarked]"
        ));
    } else {
        let labels: Vec<String> = (0..positions.len())
            .map(|index| format!("wm{index}"))
            .collect();
        graph.push(format!(
            "[{text_label}]split={}[{}]",
            positions.len(),
            labels.join("][")
        ));
        let mut previous = "base".to_string();
        for (index, (x, y)) in positions.iter().enumerate() {
            let next = if index + 1 == positions.len() {
                "watermarked".to_string()
            } else {
                format!("tile{index}")
            };
            graph.push(format!(
                "[{previous}][{}]overlay=x={x}:y={y}:format=auto[{next}]",
                labels[index]
            ));
            previous = next;
        }
    }
    (graph.join(";"), cleanup)
}

fn watermark_filter_with_font(
    font_path: Option<&Path>,
    request: &WatermarkMediaTaskRequest,
    source_size: Option<(u32, u32)>,
) -> Result<(String, Vec<PathBuf>), String> {
    let options = &request.options;
    // Effective opacity is the user-visible config opacity. The legacy
    // `dark_mode` field is intentionally ignored: it used to force `0.06`,
    // which silently diverged the FFmpeg output from the preview. The field is
    // kept only for wire compatibility and no longer changes any render output.
    let alpha = options.opacity.to_string();
    let pattern = options.pattern.as_deref().unwrap_or("diagonal");
    let angle = options.angle.unwrap_or(0).clamp(-180, 180);
    let angle_radians = (angle as f64).to_radians();
    let angle_sin = angle_radians.sin().abs();
    let angle_cos = angle_radians.cos().abs();
    if options.kind == "text" {
        let font = escape_filter_value(
            &font_path
                .ok_or_else(|| "内置中文水印字体未找到".to_string())?
                .to_string_lossy(),
        );
        let text_file = watermark_text_file(&request.task_id, &options.text)?;
        let text_file_value = escape_filter_value(&text_file.to_string_lossy());
        let font_size = format!("h*{}/100", options.size_percent);
        // The render plan always ships absolute, pre-rotated brick centers as
        // `placements`. Draw the text once into a rotated sprite and overlay it
        // at each center so preview and FFmpeg share one rotation semantics
        // instead of double-rotating the whole lattice layer.
        if let Some(placements) = options.placements.as_deref() {
            // The render plan measures the font as a percentage of the short
            // frame edge (`min(w, h)`); using `h` alone would render portrait
            // videos with a larger watermark than the Canvas preview. The legacy
            // no-placements path keeps its frozen `h`-based rule for the older
            // media tools.
            let sprite_font_size = format!("min(w\\,h)*{}/100", options.size_percent);
            let border_width = source_size.map(|(width, height)| {
                outlined_border_width(
                    width.min(height) as f64 * options.size_percent as f64 / 100.0,
                )
            });
            if options.text_style.as_deref() == Some("outlined") && border_width.is_none() {
                let _ = fs::remove_file(&text_file);
                return Err("描边文字水印需要源视频尺寸".into());
            }
            return Ok(text_watermark_sprite_filter(
                placements,
                &font,
                &text_file_value,
                &sprite_font_size,
                &alpha,
                options.text_style.as_deref(),
                border_width,
                angle,
                angle_radians,
                angle_sin,
                angle_cos,
                vec![text_file],
            ));
        }
        // Legacy path (no explicit placements): grid/single positions are drawn
        // on one transparent layer and rotated once as a whole.
        let positions = text_watermark_positions(
            pattern,
            &options.position,
            options.density.as_deref(),
            options.columns,
            options.rows,
            None,
            options.offset_x,
            options.offset_y,
        );
        let mut graph = vec![
            "[0:v]split[base][text-source]".to_string(),
            "[text-source]format=rgba,colorchannelmixer=aa=0[text-base]".to_string(),
        ];
        let border_width = source_size.map(|(_, height)| {
            outlined_border_width(height as f64 * options.size_percent as f64 / 100.0)
        });
        if options.text_style.as_deref() == Some("outlined") && border_width.is_none() {
            let _ = fs::remove_file(&text_file);
            return Err("描边文字水印需要源视频尺寸".into());
        }
        let (font_color, style_extra) =
            text_style_drawtext(options.text_style.as_deref(), border_width);
        let mut previous = "text-base".to_string();
        for (index, (x, y)) in positions.iter().enumerate() {
            let next = if index + 1 == positions.len() {
                "text-complete".to_string()
            } else {
                format!("text{index}")
            };
            graph.push(format!("[{previous}]drawtext=fontfile='{font}':textfile='{text_file_value}':fontcolor={font_color}{style_extra}:fontsize={font_size}:x={x}:y={y}[{next}]"));
            previous = next;
        }
        graph.push(format!(
            "[{previous}]colorchannelmixer=aa={alpha}[text-faded]"
        ));
        let text_layer = if angle != 0 {
            graph.push(format!(
                "[text-faded]rotate={angle_radians:.8}:ow=iw*{angle_cos:.8}+ih*{angle_sin:.8}:oh=iw*{angle_sin:.8}+ih*{angle_cos:.8}:fillcolor=black@0[text-rotated]"
            ));
            "text-rotated"
        } else {
            // The final overlay must always reference the colorchannelmixer
            // output (`text-faded`), never `text-complete`: the latter was
            // already consumed as the colorchannelmixer input, so reusing it
            // makes FFmpeg fail with "Invalid stream specifier text-complete".
            "text-faded"
        };
        graph.push(format!(
            "[base][{text_layer}]overlay=(W-w)/2:(H-h)/2:format=auto[watermarked]"
        ));
        return Ok((graph.join(";"), vec![text_file]));
    }

    // image Logo overlay branch — uses overlay coordinates
    let positions = image_watermark_positions(
        pattern,
        &options.position,
        options.density.as_deref(),
        options.columns,
        options.rows,
        options.placements.as_deref(),
        options.offset_x,
        options.offset_y,
    );
    let mut graph = vec![
        format!("[1:v]format=rgba,colorchannelmixer=aa={alpha}[watermark-alpha]"),
        format!(
            "[watermark-alpha][0:v]scale2ref=w=main_w*{}/100:h=-1[watermark][base]",
            options.size_percent
        ),
    ];
    if angle != 0 {
        graph.push(format!(
            "[watermark]rotate={angle_radians:.8}:ow=iw*{angle_cos:.8}+ih*{angle_sin:.8}:oh=iw*{angle_sin:.8}+ih*{angle_cos:.8}:fillcolor=black@0[watermark-rotated]"
        ));
    }
    let watermark_label = if angle != 0 {
        "watermark-rotated"
    } else {
        "watermark"
    };
    if positions.len() == 1 {
        let (x, y) = &positions[0];
        graph.push(format!(
            "[base][{watermark_label}]overlay=x={x}:y={y}:format=auto[watermarked]"
        ));
    } else {
        let labels: Vec<String> = (0..positions.len())
            .map(|index| format!("wm{index}"))
            .collect();
        graph.push(format!(
            "[{watermark_label}]split={}[{}]",
            positions.len(),
            labels.join("][")
        ));
        let mut previous = "base".to_string();
        for (index, (x, y)) in positions.iter().enumerate() {
            let next = if index + 1 == positions.len() {
                "watermarked".to_string()
            } else {
                format!("tile{index}")
            };
            graph.push(format!(
                "[{previous}][{}]overlay=x={x}:y={y}:format=auto[{next}]",
                labels[index]
            ));
            previous = next;
        }
    }
    Ok((graph.join(";"), Vec::new()))
}

fn watermark_ffmpeg_args(
    app: &AppHandle,
    request: &WatermarkMediaTaskRequest,
    output: &Path,
    backend: EncoderBackend,
) -> Result<(Vec<OsString>, Vec<PathBuf>), String> {
    let font_path = if request.options.kind == "text" {
        Some(watermark_font_path(app)?)
    } else {
        None
    };
    watermark_ffmpeg_args_with_font(font_path.as_deref(), request, output, backend, None, None)
}

fn watermark_ffmpeg_args_with_font(
    font_path: Option<&Path>,
    request: &WatermarkMediaTaskRequest,
    output: &Path,
    backend: EncoderBackend,
    overlay_asset: Option<&Path>,
    source_size: Option<(u32, u32)>,
) -> Result<(Vec<OsString>, Vec<PathBuf>), String> {
    // Dense text-placements path: the caller already pre-rendered a single
    // full-resolution transparent PNG containing every static placement, so the
    // video encode overlays it once per frame instead of chaining N overlays.
    if let Some(overlay) = overlay_asset {
        if request.options.kind == "text" && !is_static_image(Path::new(&request.input_path)) {
            let mut args = vec![
                OsString::from("-hide_banner"),
                OsString::from("-nostdin"),
                OsString::from("-y"),
                OsString::from("-i"),
                OsString::from(&request.input_path),
                OsString::from("-i"),
                overlay.as_os_str().to_owned(),
                OsString::from("-filter_complex"),
                OsString::from(
                    "[0:v][1:v]overlay=0:0:format=auto:eof_action=repeat:repeatlast=1[watermarked]",
                ),
                OsString::from("-map"),
                OsString::from("[watermarked]"),
                OsString::from("-map"),
                OsString::from("0:a?"),
            ];
            args.extend(video_encoder_args(
                backend,
                request.options.quality.as_deref(),
            ));
            args.extend([
                OsString::from("-pix_fmt"),
                OsString::from(encoder_pixel_format(backend)),
                OsString::from("-movflags"),
                OsString::from("+faststart"),
                OsString::from("-c:a"),
                OsString::from("aac"),
                OsString::from("-progress"),
                OsString::from("pipe:1"),
                OsString::from("-nostats"),
                output.as_os_str().to_owned(),
            ]);
            return Ok((args, Vec::new()));
        }
    }
    let mut args = vec![
        OsString::from("-hide_banner"),
        OsString::from("-nostdin"),
        OsString::from("-i"),
        OsString::from(&request.input_path),
    ];
    if request.options.kind == "image" {
        args.extend([
            OsString::from("-i"),
            OsString::from(request.options.image_path.clone().unwrap_or_default()),
        ]);
    }
    let (filter, cleanup) = watermark_filter_with_font(font_path, request, source_size)?;
    args.extend([
        OsString::from("-filter_complex"),
        OsString::from(filter),
        OsString::from("-map"),
        OsString::from("[watermarked]"),
    ]);
    if is_static_image(Path::new(&request.input_path)) {
        args.extend([OsString::from("-frames:v"), OsString::from("1")]);
    } else {
        // Video watermark closure: backend encoder + AAC, backend pixel format,
        // faststart, and optional audio mapping so silent sources never fail.
        args.extend([OsString::from("-map"), OsString::from("0:a?")]);
        args.extend(video_encoder_args(
            backend,
            request.options.quality.as_deref(),
        ));
        args.extend([
            OsString::from("-pix_fmt"),
            OsString::from(encoder_pixel_format(backend)),
            OsString::from("-movflags"),
            OsString::from("+faststart"),
            OsString::from("-c:a"),
            OsString::from("aac"),
        ]);
    }
    args.extend([
        OsString::from("-progress"),
        OsString::from("pipe:1"),
        OsString::from("-nostats"),
        output.as_os_str().to_owned(),
    ]);
    Ok((args, cleanup))
}

fn parse_progress_line(line: &str, started_at: f64, duration: f64) -> Option<f64> {
    let timestamp = line.strip_prefix("out_time_ms=")?.parse::<f64>().ok()? / 1_000_000.0;
    Some(((timestamp - started_at) / duration.max(0.001)).clamp(0.0, 0.99))
}

fn remove_incomplete_output(path: &Path) {
    let _ = fs::remove_file(path);
}

/// Temp output for one GIF encode attempt.
///
/// Three things matter here:
/// 1. The muxer is selected from the output extension, so the temp name must
///    keep a real `.gif` suffix. The previous `.<stem>.gif.part` ending had no
///    recognisable extension and relied on FFmpeg guessing the format.
/// 2. `build_gif_encode_args` also passes an explicit `-f gif`, so the format is
///    stated rather than inferred. The suffix is a second, independent guarantee.
/// 3. The name carries a per-task `token` and an attempt `slot`. Two tasks that
///    target the same directory can therefore never share one temp file, and the
///    short-sample encode can never clobber a full-encode artefact.
///
/// Never equal to the final path: a caller must not be able to observe a
/// half-written or over-budget GIF at the user's destination.
fn gif_temp_output_path(final_output_path: &Path, token: &str, slot: &str) -> PathBuf {
    let stem = final_output_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("media");
    final_output_path.with_file_name(format!(".{stem}.{token}.{slot}.tmp.gif"))
}

/// Per-task token for GIF temp names. Unique across tasks and processes.
fn gif_temp_token(task_id: &str) -> String {
    static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let sanitized: String = task_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .take(32)
        .collect();
    let seq = SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    format!("{}-{}-{seq}", std::process::id(), sanitized)
}

/// Unique temp `.mp4` in the same directory as the final watermark output.
fn video_watermark_temp_path(final_output_path: &Path) -> PathBuf {
    let dir = final_output_path.parent().unwrap_or_else(|| Path::new("."));
    let stem = final_output_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("watermarked");
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    dir.join(format!(".{stem}.{nonce}.mp4"))
}

/// Unique temp path for the pre-rendered text watermark overlay PNG. Kept in
/// the OS temp dir so it never pollutes the user's chosen output directory and
/// can be removed safely after the encode.
fn text_watermark_overlay_temp_path() -> PathBuf {
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!(
        ".bmw-watermark-overlay-{}-{nonce}.png",
        std::process::id()
    ))
}

/// Pre-renders every static text placement into one transparent, full-source-
/// resolution PNG using the bundled FFmpeg `drawtext`/`rotate`/`overlay`
/// filters (no self-built font rendering, no new dependency). The main video
/// encode then overlays this asset once per frame, removing the ~N chained
/// overlay cost from the old sprite path. Reuses `watermark_filter_with_font`,
/// so rotation, opacity, white/black/outlined style, font size and placement
/// geometry stay byte-for-byte identical to the Canvas preview and the legacy
/// single-frame preview. A failed generation returns a clear error instead of
/// silently falling back to the slow N-overlay path.
fn generate_text_watermark_overlay(
    ffmpeg: &Path,
    ffprobe: &Path,
    request: &WatermarkMediaTaskRequest,
    font_path: Option<&Path>,
) -> Result<PathBuf, String> {
    let probe = probe_video(ffprobe, Path::new(&request.input_path))?;
    if probe.width == 0 || probe.height == 0 {
        return Err("无法读取视频尺寸以生成水印图层".into());
    }
    let (filter, mut cleanup) =
        watermark_filter_with_font(font_path, request, Some((probe.width, probe.height)))?;
    let overlay = text_watermark_overlay_temp_path();
    let color_source = format!(
        "color=c=black@0:size={}x{}:rate=1,format=rgba",
        probe.width, probe.height
    );
    let args = vec![
        OsString::from("-hide_banner"),
        OsString::from("-nostdin"),
        OsString::from("-y"),
        OsString::from("-f"),
        OsString::from("lavfi"),
        OsString::from("-i"),
        OsString::from(color_source),
        OsString::from("-frames:v"),
        OsString::from("1"),
        OsString::from("-filter_complex"),
        OsString::from(filter),
        OsString::from("-map"),
        OsString::from("[watermarked]"),
        OsString::from("-f"),
        OsString::from("image2"),
        overlay.as_os_str().to_owned(),
    ];
    let spawn_result = bundled_command(ffmpeg)
        .args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output();
    // The intermediate `textfile` temp file must be removed on every path:
    // successful spawn, non-zero exit, and spawn failure alike. Only the
    // generated overlay PNG survives on success (it is the caller's asset).
    for path in cleanup.drain(..) {
        let _ = fs::remove_file(path);
    }
    let result = match spawn_result {
        Ok(output) => output,
        Err(error) => {
            let _ = fs::remove_file(&overlay);
            return Err(format!("无法生成文字水印图层：{error}"));
        }
    };
    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr).into_owned();
        let _ = fs::remove_file(&overlay);
        return Err(format!(
            "水印图层生成失败：{}",
            ffmpeg_failure_message(&stderr)
        ));
    }
    if !overlay.is_file() || overlay.metadata().map(|m| m.len()).unwrap_or(0) == 0 {
        let _ = fs::remove_file(&overlay);
        return Err("水印图层生成失败：未找到输出文件".into());
    }
    Ok(overlay)
}

/// True when a text watermark ships more than one explicit placement, i.e. the
/// render-plan brick/tiled path where the old sprite filter chained one overlay
/// per placement (≈31 overlays on dense 1920×1080 frames). Single text and Logo
/// paths use one overlay already, so they keep the existing filter graph.
fn uses_dense_text_overlay(options: &WatermarkOptions) -> bool {
    options.kind == "text"
        && options
            .placements
            .as_ref()
            .is_some_and(|placements| placements.len() > 1)
}

/// Post-encode CPU validation. The exact video codec is `h264`, pixel format
/// `yuv420p`, and the format must be `mp4`; audio is optional and reported.
/// Lightweight ffprobe summary used by the CPU watermark validator.
#[derive(Debug, Clone, PartialEq)]
struct VideoProbe {
    width: u32,
    height: u32,
    duration: f64,
    has_audio: bool,
    codec: String,
    pix_fmt: String,
}

fn probe_video(ffprobe: &Path, path: &Path) -> Result<VideoProbe, String> {
    let out = bundled_command(ffprobe)
        .args([
            "-v",
            "error",
            "-show_entries",
            "stream=codec_type,codec_name,pix_fmt,width,height:format=format_name,duration",
            "-of",
            "json",
        ])
        .arg(path)
        .output()
        .map_err(|e| format!("无法启动 FFprobe：{e}"))?;
    if !out.status.success() {
        return Err("FFprobe 验证失败：文件不可解析".into());
    }
    let json: serde_json::Value =
        serde_json::from_slice(&out.stdout).map_err(|_| "FFprobe 返回数据无法解析".to_string())?;
    let streams = json["streams"].as_array().cloned().unwrap_or_default();
    let video = streams.iter().find(|s| s["codec_type"] == "video");
    let audio = streams.iter().find(|s| s["codec_type"] == "audio");
    let video = video.ok_or("输出没有视频流")?;
    let width = video["width"].as_u64().unwrap_or(0) as u32;
    let height = video["height"].as_u64().unwrap_or(0) as u32;
    let codec = video["codec_name"].as_str().unwrap_or("").to_string();
    let pix_fmt = video["pix_fmt"].as_str().unwrap_or("").to_string();
    let duration = json["format"]["duration"]
        .as_str()
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(0.0);
    Ok(VideoProbe {
        width,
        height,
        duration,
        has_audio: audio.is_some(),
        codec,
        pix_fmt,
    })
}

fn text_watermark_estimate_units(text: &str) -> (f64, f64) {
    let lines = text
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count()
        .max(1) as f64;
    let width_units = text
        .chars()
        .map(|character| {
            if character.is_ascii_whitespace() {
                0.30
            } else if character.is_ascii() {
                0.55
            } else {
                1.0
            }
        })
        .sum::<f64>()
        .max(1.0)
        + 0.8;
    (width_units, lines * 1.18 + 0.25)
}

fn rotated_bounding_box(width: f64, height: f64, angle_degrees: i32) -> (f64, f64) {
    let radians = (angle_degrees as f64).to_radians();
    let cosine = radians.cos().abs();
    let sine = radians.sin().abs();
    (
        width * cosine + height * sine,
        width * sine + height * cosine,
    )
}

struct WatermarkRecommendationEstimate {
    width_per_percent: f64,
    height_per_percent: f64,
}

fn watermark_recommendation_estimate(
    ffprobe: &Path,
    source_width: u32,
    source_height: u32,
    kind: &str,
    text: &str,
    image_path: Option<&Path>,
) -> Result<WatermarkRecommendationEstimate, String> {
    if kind == "image" {
        let logo = image_path.ok_or("Logo 推荐缺少图片素材")?;
        let probe = probe_video(ffprobe, logo)?;
        if probe.width == 0 || probe.height == 0 {
            return Err("无法读取 Logo 尺寸".into());
        }
        let width_per_percent = source_width as f64 / 100.0;
        let height_per_percent = width_per_percent * probe.height as f64 / probe.width as f64;
        return Ok(WatermarkRecommendationEstimate {
            width_per_percent,
            height_per_percent,
        });
    }
    let (width_units, height_units) = text_watermark_estimate_units(text);
    // The render plan measures the font against the short frame edge; keep the
    // recommendation on the same basis so portrait video sizes stay consistent
    // with the preview and the FFmpeg sprite filter.
    let font_height_per_percent = source_width.min(source_height) as f64 / 100.0;
    Ok(WatermarkRecommendationEstimate {
        width_per_percent: font_height_per_percent * width_units,
        height_per_percent: font_height_per_percent * height_units,
    })
}

#[derive(Clone, Copy)]
struct RecommendationGrid {
    density: &'static str,
    columns: u32,
    rows: u32,
}

fn recommendation_grids(width: u32, height: u32) -> Vec<RecommendationGrid> {
    let aspect = width as f64 / height.max(1) as f64;
    if aspect < 0.8 {
        vec![
            RecommendationGrid {
                density: "high",
                columns: 2,
                rows: 3,
            },
            RecommendationGrid {
                density: "medium",
                columns: 2,
                rows: 3,
            },
            RecommendationGrid {
                density: "low",
                columns: 2,
                rows: 2,
            },
            RecommendationGrid {
                density: "low",
                columns: 1,
                rows: 2,
            },
            RecommendationGrid {
                density: "low",
                columns: 1,
                rows: 1,
            },
        ]
    } else if aspect > 2.0 {
        vec![
            RecommendationGrid {
                density: "high",
                columns: 5,
                rows: 2,
            },
            RecommendationGrid {
                density: "medium",
                columns: 4,
                rows: 2,
            },
            RecommendationGrid {
                density: "low",
                columns: 3,
                rows: 2,
            },
            RecommendationGrid {
                density: "low",
                columns: 2,
                rows: 1,
            },
            RecommendationGrid {
                density: "low",
                columns: 1,
                rows: 1,
            },
        ]
    } else {
        vec![
            RecommendationGrid {
                density: "high",
                columns: 3,
                rows: 2,
            },
            RecommendationGrid {
                density: "medium",
                columns: 3,
                rows: 2,
            },
            RecommendationGrid {
                density: "low",
                columns: 3,
                rows: 2,
            },
            RecommendationGrid {
                density: "low",
                columns: 2,
                rows: 2,
            },
            RecommendationGrid {
                density: "low",
                columns: 2,
                rows: 1,
            },
            RecommendationGrid {
                density: "low",
                columns: 1,
                rows: 1,
            },
        ]
    }
}

fn first_frame_edge_density(ffmpeg: &Path, input: &Path, duration: f64) -> Option<f64> {
    let timestamp = (duration * 0.1).clamp(0.0, 1.0);
    let output = bundled_command(ffmpeg)
        .args(["-hide_banner", "-nostdin", "-ss"])
        .arg(timestamp.to_string())
        .args(["-i"])
        .arg(input)
        .args([
            "-vf",
            "scale=160:-2:flags=area,edgedetect=low=0.05:high=0.15,format=gray,signalstats,metadata=print:file=-",
            "-frames:v",
            "1",
            "-an",
            "-f",
            "null",
            "-",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    stdout
        .lines()
        .chain(stderr.lines())
        .find_map(|line| {
            line.strip_prefix("lavfi.signalstats.YAVG=")
                .and_then(|value| value.parse::<f64>().ok())
        })
        .filter(|value| value.is_finite())
}

fn max_recommended_size(
    estimate: &WatermarkRecommendationEstimate,
    source_width: u32,
    source_height: u32,
    grid: RecommendationGrid,
    min_size: u32,
    max_size: u32,
    angle: i32,
    area_ratio_limit: f64,
) -> Option<u32> {
    let cell_width = source_width as f64 / grid.columns as f64 * 0.82;
    let cell_height = source_height as f64 / grid.rows as f64 * 0.82;
    for percent in (min_size..=max_size).rev() {
        let width = estimate.width_per_percent * percent as f64;
        let height = estimate.height_per_percent * percent as f64;
        let (rotated_width, rotated_height) = rotated_bounding_box(width, height, angle);
        if rotated_width > cell_width || rotated_height > cell_height {
            continue;
        }
        let occupied_ratio =
            rotated_width * rotated_height * grid.columns as f64 * grid.rows as f64
                / (source_width as f64 * source_height as f64);
        if occupied_ratio > area_ratio_limit {
            continue;
        }
        return Some(percent);
    }
    None
}

#[tauri::command]
pub fn video_watermark_recommendation(
    app: AppHandle,
    request: WatermarkRecommendationRequest,
) -> Result<VideoWatermarkRecommendation, String> {
    let input = PathBuf::from(&request.input_path);
    if !is_video_media(&input) || !input.is_file() {
        return Err("推荐仅支持可访问的 MP4 或 MOV 视频".into());
    }
    if !matches!(request.kind.as_str(), "text" | "image") {
        return Err("推荐水印类型无效".into());
    }
    let ffmpeg = sidecar_path(&app, "ffmpeg")?;
    let ffprobe = sidecar_path(&app, "ffprobe")?;
    let probe = probe_video(&ffprobe, &input)?;
    if probe.width == 0 || probe.height == 0 {
        return Err("无法读取视频尺寸".into());
    }
    let estimate = watermark_recommendation_estimate(
        &ffprobe,
        probe.width,
        probe.height,
        &request.kind,
        &request.text,
        request.image_path.as_deref().map(Path::new),
    )?;
    let edge_density = first_frame_edge_density(&ffmpeg, &input, probe.duration);
    let fallback = edge_density.is_none();
    let edge = edge_density.unwrap_or(6.0);
    let preferred_density = if edge < 4.0 {
        0usize
    } else if edge > 12.0 {
        2usize
    } else {
        1usize
    };
    let grids = recommendation_grids(probe.width, probe.height);
    let min_size = 3;
    let max_size = if request.kind == "image" { 14 } else { 10 };
    let angle = 30;
    let area_ratio_limit = if edge > 12.0 { 0.18 } else { 0.24 };
    let mut selected = None;
    for index in preferred_density..grids.len() {
        let grid = grids[index];
        if let Some(size) = max_recommended_size(
            &estimate,
            probe.width,
            probe.height,
            grid,
            min_size,
            max_size,
            angle,
            area_ratio_limit,
        ) {
            selected = Some((grid, size));
            break;
        }
    }
    let (grid, size_percent) = selected
        .ok_or_else(|| "当前水印内容过长或画面尺寸过小，无法生成不重叠的推荐平铺".to_string())?;
    let opacity = if edge > 12.0 {
        0.56
    } else if edge < 4.0 {
        0.42
    } else {
        0.50
    };
    let aspect = probe.width as f64 / probe.height as f64;
    let orientation = if aspect < 0.8 {
        "竖屏"
    } else if aspect > 2.0 {
        "超宽"
    } else {
        "横屏"
    };
    let analysis = if fallback {
        "画面分析不可用，按尺寸与包围盒保守计算".to_string()
    } else {
        format!("画面复杂度 {edge:.1}")
    };
    let reason = format!(
        "{orientation} {analysis} · {cols}×{rows} 网格 · 字号 {size_percent}%",
        cols = grid.columns,
        rows = grid.rows
    );
    Ok(VideoWatermarkRecommendation {
        size_percent,
        density: grid.density.to_string(),
        columns: grid.columns,
        rows: grid.rows,
        spacing_x: 240.0,
        spacing_y: 180.0,
        opacity,
        angle,
        gutter_percent: 18,
        reason,
    })
}

fn validate_watermark_video(ffprobe: &Path, input: &Path, output: &Path) -> Result<(), String> {
    let expected = probe_video(ffprobe, input)?;
    let actual = probe_video(ffprobe, output)?;
    if actual.codec != "h264" {
        return Err(format!("输出视频编码不是 H.264：{}", actual.codec));
    }
    if actual.pix_fmt != "yuv420p" {
        return Err(format!("输出像素格式不是 yuv420p：{}", actual.pix_fmt));
    }
    if actual.width != expected.width || actual.height != expected.height {
        return Err(format!(
            "输出尺寸 {}x{} 与输入 {}x{} 不一致",
            actual.width, actual.height, expected.width, expected.height
        ));
    }
    let duration_tolerance = 0.35_f64.max(expected.duration * 0.15);
    if (actual.duration - expected.duration).abs() > duration_tolerance {
        return Err(format!(
            "输出时长 {:.2}s 与输入 {:.2}s 超出容差",
            actual.duration, expected.duration
        ));
    }
    if actual.has_audio != expected.has_audio {
        return Err(format!(
            "输出音频存在性({})与输入({})不一致",
            actual.has_audio, expected.has_audio
        ));
    }
    Ok(())
}

fn ffmpeg_failure_message(stderr: &str) -> String {
    let noise_patterns = &[
        "Conversion failed!",
        "Error while processing the decoded data for stream",
        "Cannot determine format of input",
    ];
    let detail = stderr
        .lines()
        .rev()
        .filter(|line| !line.trim().is_empty() && !noise_patterns.iter().any(|p| line.contains(p)))
        .next()
        .map(str::trim)
        .unwrap_or("未知 FFmpeg 错误");
    format!("FFmpeg 处理失败：{detail}")
}

fn event_kind(event: &MediaTaskEvent) -> &'static str {
    match event {
        MediaTaskEvent::Progress { .. } => "progress",
        MediaTaskEvent::Completed { .. } => "completed",
        MediaTaskEvent::Failed { .. } => "failed",
        MediaTaskEvent::Cancelled { .. } => "cancelled",
    }
}

fn event_task_id(event: &MediaTaskEvent) -> &str {
    match event {
        MediaTaskEvent::Progress { task_id, .. }
        | MediaTaskEvent::Completed { task_id, .. }
        | MediaTaskEvent::Failed { task_id, .. }
        | MediaTaskEvent::Cancelled { task_id } => task_id,
    }
}

fn emit(app: &AppHandle, event: MediaTaskEvent) {
    let kind = event_kind(&event);
    let task_id = event_task_id(&event).to_owned();
    if let Err(error) = app.emit(MEDIA_EVENT, event) {
        log::error!("MEDIA_TASK_EVENT_EMIT_FAILED task_id={task_id} kind={kind}: {error}");
    } else if matches!(kind, "completed" | "failed" | "cancelled") {
        log::info!("MEDIA_TASK_TERMINAL_EVENT_EMITTED task_id={task_id} kind={kind}");
    }
}

/// Typed finalize policy for media tasks that write to a temp file first.
/// When `Some`, `output` is a unique temp path, and on success the temp file is
/// optionally FFprobe-validated then atomically renamed into `final_output`.
/// Typed terminal outcome committed exactly once per task.
#[derive(Debug, Clone, PartialEq)]
enum MediaTerminal {
    Completed {
        output_path: String,
        output_bytes: u64,
    },
    Failed {
        message: String,
    },
    Cancelled,
}

/// AppHandle-free watermark process lifecycle: spawn, poll (honoring a cancel
/// token), wait for exit, validate + rename through the shared finalizer, and
/// return exactly one terminal outcome. The Tauri layer maps this to an event.
fn run_watermark_process(
    ffmpeg: &Path,
    ffprobe: &Path,
    args: &[OsString],
    temp_output: &Path,
    finalize: Option<&MediaFinalize>,
    cancel_token: &std::sync::atomic::AtomicBool,
) -> (MediaTerminal, String) {
    run_watermark_process_with_progress(
        ffmpeg,
        ffprobe,
        args,
        temp_output,
        finalize,
        cancel_token,
        None,
        &mut |_| {},
    )
}

/// Same lifecycle as `run_watermark_process`, additionally draining stdout
/// (FFmpeg writes `-progress` there) and forwarding parsed progress values to
/// `on_progress`. Draining both pipes prevents the child from deadlocking on a
/// full pipe for long-running encodes.
fn run_watermark_process_with_progress(
    ffmpeg: &Path,
    ffprobe: &Path,
    args: &[OsString],
    temp_output: &Path,
    finalize: Option<&MediaFinalize>,
    cancel_token: &std::sync::atomic::AtomicBool,
    progress_window: Option<(f64, f64)>,
    on_progress: &mut dyn FnMut(f64),
) -> (MediaTerminal, String) {
    run_watermark_process_with_hooks(
        ffmpeg,
        ffprobe,
        args,
        temp_output,
        finalize,
        cancel_token,
        progress_window,
        on_progress,
        &mut || {},
    )
}

/// Same as `run_watermark_process_with_progress`, plus a `before_finalize`
/// callback invoked immediately before the validated rename, so production can
/// surface the `Finalizing` lifecycle state.
fn run_watermark_process_with_hooks(
    ffmpeg: &Path,
    ffprobe: &Path,
    args: &[OsString],
    temp_output: &Path,
    finalize: Option<&MediaFinalize>,
    cancel_token: &std::sync::atomic::AtomicBool,
    progress_window: Option<(f64, f64)>,
    on_progress: &mut dyn FnMut(f64),
    before_finalize: &mut dyn FnMut(),
) -> (MediaTerminal, String) {
    let mut command = bundled_command(ffmpeg);
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            return (
                MediaTerminal::Failed {
                    message: format!("无法启动 FFmpeg：{error}"),
                },
                String::new(),
            )
        }
    };

    // Drain stdout concurrently; forward parsed progress over an mpsc channel
    // so the callback stays on the polling thread (dyn FnMut is not Send).
    let stdout = child.stdout.take();
    let (progress_tx, progress_rx) = std::sync::mpsc::channel::<f64>();
    let stdout_thread = thread::spawn(move || {
        if let Some(stdout) = stdout {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if let Some((started_at, duration)) = progress_window {
                    if let Some(progress) = parse_progress_line(&line, started_at, duration) {
                        let _ = progress_tx.send(progress);
                    }
                }
            }
        }
    });

    // Drain stderr concurrently so a full pipe cannot deadlock the child.
    let stderr = child.stderr.take();
    let stderr_thread = thread::spawn(move || {
        let mut buf = String::new();
        if let Some(mut stderr) = stderr {
            let _ = stderr.read_to_string(&mut buf);
        }
        buf
    });

    let status = loop {
        if cancel_token.load(std::sync::atomic::Ordering::SeqCst) {
            let _ = child.kill();
        }
        while let Ok(progress) = progress_rx.try_recv() {
            on_progress(progress);
        }
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => thread::sleep(std::time::Duration::from_millis(20)),
            Err(_) => break None,
        }
    };
    let _ = stdout_thread.join();
    while let Ok(progress) = progress_rx.try_recv() {
        on_progress(progress);
    }
    let stderr = stderr_thread.join().unwrap_or_default();

    if cancel_token.load(std::sync::atomic::Ordering::SeqCst) {
        remove_incomplete_output(temp_output);
        return (MediaTerminal::Cancelled, stderr.clone());
    }
    match status {
        Some(status) if status.success() => match finalize {
            Some(finalize) => {
                before_finalize();
                match finalize_media_output(ffprobe, temp_output, finalize) {
                    Ok(bytes) => (
                        MediaTerminal::Completed {
                            output_path: finalize.final_output.to_string_lossy().into_owned(),
                            output_bytes: bytes,
                        },
                        stderr.clone(),
                    ),
                    Err(message) => {
                        remove_incomplete_output(temp_output);
                        (MediaTerminal::Failed { message }, stderr.clone())
                    }
                }
            }
            None => match fs::metadata(temp_output) {
                Ok(meta) => (
                    MediaTerminal::Completed {
                        output_path: temp_output.to_string_lossy().into_owned(),
                        output_bytes: meta.len(),
                    },
                    stderr.clone(),
                ),
                Err(_) => {
                    remove_incomplete_output(temp_output);
                    (
                        MediaTerminal::Failed {
                            message: "FFmpeg 完成后未找到输出文件".into(),
                        },
                        stderr.clone(),
                    )
                }
            },
        },
        Some(_) => {
            remove_incomplete_output(temp_output);
            (
                MediaTerminal::Failed {
                    message: ffmpeg_failure_message(&stderr),
                },
                stderr.clone(),
            )
        }
        None => {
            remove_incomplete_output(temp_output);
            (
                MediaTerminal::Failed {
                    message: "无法读取 FFmpeg 任务状态".into(),
                },
                stderr.clone(),
            )
        }
    }
}
struct MediaFinalize {
    final_output: PathBuf,
    input: PathBuf,
    validate: bool,
}

/// Legacy immediate-spawn context for GIF watermark (kept distinct from the
/// FIFO queue so GIF/static behavior does not regress). Carries the resolved
/// fallback chain (verified hardware backends + CPU) so the runtime never
/// retries a backend that already failed the startup probe.
struct WatermarkEncodeContext {
    request: WatermarkMediaTaskRequest,
    fallback: Vec<EncoderBackend>,
}

/// AppHandle-free finalize used by both the production spawn path and tests.
/// Validates the temp file against the input, refuses to overwrite an existing
/// final target, then atomically renames the temp file into place. Returns the
/// final byte size on success.
fn finalize_media_output(
    ffprobe: &Path,
    temp_output: &Path,
    finalize: &MediaFinalize,
) -> Result<u64, String> {
    if finalize.validate {
        validate_watermark_video(ffprobe, &finalize.input, temp_output)?;
    }
    // Atomic non-overwrite finalization: hard_link creates `final` only when it
    // does not already exist (AlreadyExists otherwise) and never overwrites.
    // After a successful link, remove the temp link so only `final` remains.
    match fs::hard_link(temp_output, &finalize.final_output) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            remove_incomplete_output(temp_output);
            return Err(format!(
                "目标文件已存在，未覆盖：{}",
                finalize.final_output.to_string_lossy()
            ));
        }
        Err(error) => {
            remove_incomplete_output(temp_output);
            return Err(format!("无法创建最终文件：{error}"));
        }
    }
    let size = fs::metadata(&finalize.final_output)
        .map(|m| m.len())
        .map_err(|_| {
            remove_incomplete_output(temp_output);
            "创建最终文件后未找到输出".to_string()
        })?;
    // The final is already fully validated and linked; a temp-removal failure
    // must not delete the final, so only report it without corrupting output.
    if let Err(error) = fs::remove_file(temp_output) {
        log::warn!("移除临时水印文件失败（不影响已产出）：{error}");
    }
    Ok(size)
}

fn spawn_media_task(
    app: AppHandle,
    registry: tauri::State<'_, MediaTaskRegistry>,
    task_id: String,
    output: PathBuf,
    args: Vec<OsString>,
    progress_window: Option<(f64, f64)>,
    cleanup_paths: Vec<PathBuf>,
    finalize: Option<MediaFinalize>,
    encode: Option<WatermarkEncodeContext>,
) -> Result<MediaTaskStarted, String> {
    if !engine_status(app.clone()).ready {
        return Err("转换引擎不可用：无法使用应用内置 sidecar".into());
    }
    if registry
        .children
        .lock()
        .expect("media child registry poisoned")
        .contains_key(&task_id)
    {
        return Err("该媒体任务已在运行".into());
    }
    let ffmpeg = sidecar_path(&app, "ffmpeg")?;
    if let Some(finalize) = finalize {
        // Legacy immediate-spawn branch used only by GIF watermark. Video
        // (MP4/MOV) is handled by the FIFO queue instead.
        let encode = encode.expect("finalize watermark requires encode context");
        let ffprobe = sidecar_path(&app, "ffprobe")?;
        let token = Arc::new(std::sync::atomic::AtomicBool::new(false));
        registry.register_cancel_token(&task_id, token.clone());
        let app_for_task = app.clone();
        let task_id_for_thread = task_id.clone();
        let output_name = finalize
            .final_output
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or("unknown")
            .to_string();
        let finalize_for_task = finalize;
        let request_for_task = encode.request;
        let fallback_for_task = encode.fallback;
        let progress_window_for_task = progress_window;
        thread::spawn(move || {
            let mut collected_cleanup: Vec<PathBuf> = Vec::new();
            let terminal = orchestrate_watermark_encode_chain(
                &fallback_for_task,
                |attempt_backend| {
                    if token.load(std::sync::atomic::Ordering::SeqCst) {
                        return (MediaTerminal::Cancelled, String::new());
                    }
                    let temp = video_watermark_temp_path(&finalize_for_task.final_output);
                    match watermark_ffmpeg_args(
                        &app_for_task,
                        &request_for_task,
                        &temp,
                        attempt_backend,
                    ) {
                        Ok((args, cleanup)) => {
                            collected_cleanup.extend(cleanup);
                            run_watermark_process_with_progress(
                                &ffmpeg,
                                &ffprobe,
                                &args,
                                &temp,
                                Some(&finalize_for_task),
                                &token,
                                progress_window_for_task,
                                &mut |progress| {
                                    emit(
                                        &app_for_task,
                                        MediaTaskEvent::Progress {
                                            task_id: task_id_for_thread.clone(),
                                            progress,
                                        },
                                    );
                                },
                            )
                        }
                        Err(message) => (MediaTerminal::Failed { message }, String::new()),
                    }
                },
                &mut || {},
            );
            for path in collected_cleanup {
                let _ = fs::remove_file(path);
            }
            let registry = app_for_task.state::<MediaTaskRegistry>();
            registry.remove_cancel_token(&task_id_for_thread);
            registry.remove(&task_id_for_thread);
            match terminal {
                MediaTerminal::Completed {
                    output_path,
                    output_bytes,
                } => emit(
                    &app_for_task,
                    MediaTaskEvent::Completed {
                        task_id: task_id_for_thread,
                        output_path,
                        output_bytes,
                    },
                ),
                MediaTerminal::Failed { message } => emit(
                    &app_for_task,
                    MediaTaskEvent::Failed {
                        task_id: task_id_for_thread,
                        message,
                    },
                ),
                MediaTerminal::Cancelled => emit(
                    &app_for_task,
                    MediaTaskEvent::Cancelled {
                        task_id: task_id_for_thread,
                    },
                ),
            }
        });
        return Ok(MediaTaskStarted {
            task_id,
            output_path: output_name,
        });
    }
    let mut command = bundled_command(ffmpeg);
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let child = command
        .spawn()
        .map_err(|error| format!("无法启动应用内置 FFmpeg：{error}"))?;
    let child = Arc::new(Mutex::new(child));
    registry.insert(task_id.clone(), child.clone());
    let output_name = output
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("unknown");
    log::info!(
        "MEDIA_TASK_SPAWNED task_id={} output={output_name}",
        task_id
    );

    let app_for_task = app.clone();
    let output_for_task = output.clone();
    let task_id_for_thread = task_id.clone();
    thread::spawn(move || {
        let stderr = child.lock().ok().and_then(|mut child| child.stderr.take());
        let stderr_reader = thread::spawn(move || {
            let mut message = String::new();
            if let Some(mut stderr) = stderr {
                let _ = stderr.read_to_string(&mut message);
            }
            message
        });
        let stdout = child.lock().ok().and_then(|mut child| child.stdout.take());
        if let Some(stdout) = stdout {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if let Some((started_at, duration)) = progress_window {
                    if let Some(progress) = parse_progress_line(&line, started_at, duration) {
                        emit(
                            &app_for_task,
                            MediaTaskEvent::Progress {
                                task_id: task_id_for_thread.clone(),
                                progress,
                            },
                        );
                    }
                }
            }
        }
        let status = loop {
            let result = child
                .lock()
                .ok()
                .and_then(|mut child| child.try_wait().ok());
            match result {
                Some(Some(status)) => break Some(status),
                Some(None) => thread::sleep(std::time::Duration::from_millis(20)),
                None => break None,
            }
        };
        let stderr = stderr_reader.join().unwrap_or_default();
        match &status {
            Some(status) => log::info!(
                "MEDIA_TASK_CHILD_EXIT task_id={} status={status}",
                task_id_for_thread
            ),
            None => log::error!(
                "MEDIA_TASK_CHILD_EXIT_UNKNOWN task_id={}",
                task_id_for_thread
            ),
        }
        for path in cleanup_paths {
            let _ = fs::remove_file(path);
        }
        let registry = app_for_task.state::<MediaTaskRegistry>();
        let cancelled = registry.take_cancelled(&task_id_for_thread);
        registry.remove(&task_id_for_thread);
        if cancelled {
            remove_incomplete_output(&output_for_task);
            emit(
                &app_for_task,
                MediaTaskEvent::Cancelled {
                    task_id: task_id_for_thread,
                },
            );
            return;
        }
        match status {
            Some(status) if status.success() => match fs::metadata(&output_for_task) {
                Ok(metadata) => emit(
                    &app_for_task,
                    MediaTaskEvent::Completed {
                        task_id: task_id_for_thread,
                        output_path: output_for_task.to_string_lossy().into_owned(),
                        output_bytes: metadata.len(),
                    },
                ),
                Err(_) => emit(
                    &app_for_task,
                    MediaTaskEvent::Failed {
                        task_id: task_id_for_thread,
                        message: "FFmpeg 完成后未找到输出文件".into(),
                    },
                ),
            },
            Some(_) => {
                remove_incomplete_output(&output_for_task);
                emit(
                    &app_for_task,
                    MediaTaskEvent::Failed {
                        task_id: task_id_for_thread,
                        message: ffmpeg_failure_message(&stderr),
                    },
                );
            }
            None => {
                remove_incomplete_output(&output_for_task);
                emit(
                    &app_for_task,
                    MediaTaskEvent::Failed {
                        task_id: task_id_for_thread,
                        message: "无法读取 FFmpeg 任务状态".into(),
                    },
                );
            }
        }
    });
    Ok(MediaTaskStarted {
        task_id,
        output_path: output.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn media_engine_status(app: AppHandle) -> MediaEngineStatus {
    engine_status(app)
}

#[tauri::command]
pub fn watermark_encoder_capability(app: AppHandle) -> Result<WatermarkEncoderCapability, String> {
    let ffmpeg = sidecar_path(&app, "ffmpeg")?;
    let ffprobe = sidecar_path(&app, "ffprobe")?;
    let platform = current_platform();
    let selection = select_encoder(&ffmpeg, &ffprobe, platform);
    let backend_name = selection.selected.display_name().to_string();
    let hardware_available = selection.selected.is_hardware();
    let reason = if hardware_available {
        format!("{backend_name} 已通过 720p/30fps/120 帧实机编码探测")
    } else if selection.results.is_empty() {
        "当前平台未提供硬件编码候选，使用 CPU 兼容模式".to_string()
    } else {
        selection
            .results
            .iter()
            .map(|result| format!("{}：{}", result.backend.display_name(), result.reason))
            .collect::<Vec<_>>()
            .join("；")
    };
    let candidates = selection
        .results
        .iter()
        .map(|result| EncoderCapabilityEntry {
            backend: result.backend.wire_name().to_string(),
            backend_name: result.backend.display_name().to_string(),
            encoder: video_encoder_name(result.backend).to_string(),
            available: result.available,
            reason: result.reason.clone(),
        })
        .collect();
    Ok(WatermarkEncoderCapability {
        hardware_available,
        backend_name,
        reason,
        candidates,
    })
}

/// Side effects the GIF task loop needs from its host.
///
/// Production uses `AppGifHost` (Tauri `AppHandle` + `MediaTaskRegistry`); tests
/// pass a recorder, so the whole sample → first full encode → width correction →
/// publish sequence can be exercised with the real bundled FFmpeg and without
/// constructing an `AppHandle`.
trait GifTaskHost: Send + Sync {
    fn emit(&self, event: MediaTaskEvent);
    fn insert_child(&self, task_id: &str, child: Arc<Mutex<Child>>);
    fn take_cancelled(&self, task_id: &str) -> bool;
    fn remove_task(&self, task_id: &str);
    /// 允许 WebView 通过 asset 协议只读预览这一个已发布的文件。
    fn authorize_preview(&self, _path: &Path) {}
}

/// Why one GIF encode attempt stopped without a publishable artefact.
///
/// Cancellation is modelled explicitly rather than as a magic string: the encode
/// path consumed the registry's cancel flag itself, so the retry loop cannot
/// re-read it and would otherwise start another encode after a cancel, leaving
/// the UI stuck on a task whose terminal event was already sent.
enum GifEncodeError {
    Cancelled,
    Failed(String),
}

impl GifEncodeError {
    fn message(&self) -> String {
        match self {
            GifEncodeError::Cancelled => "已取消".to_string(),
            GifEncodeError::Failed(message) => message.clone(),
        }
    }
}

/// Appends the `-y` plus temp-path tail to a builder's arguments.
///
/// Extracted so a test can assert the resulting argument list contains exactly
/// one output path — the temp one — and never the user's destination.
fn gif_encode_args_with_temp(args: &[OsString], temp_output: &Path) -> Vec<OsString> {
    let mut args_temp: Vec<OsString> = args.to_vec();
    args_temp.push(OsString::from("-y"));
    args_temp.push(temp_output.as_os_str().to_owned());
    args_temp
}

/// Run FFmpeg synchronously for one GIF encode attempt and return the encoded
/// byte size. The caller owns publishing: this function never writes to the
/// user's destination, so a failed or over-budget attempt can never be observed
/// there. Does NOT hold the registry lock during wait().
fn run_gif_encode_with_progress(
    ffmpeg: &Path,
    args: &[OsString],
    temp_output: &Path,
    host: &Arc<dyn GifTaskHost>,
    task_id: &str,
    progress_step_base: f64, // 0.0 .. 1.0 base for this step
    progress_step_span: f64, // how much progress this step contributes
) -> Result<u64, GifEncodeError> {
    // `args` end with encoder options, not with a path, so appending the tail
    // yields exactly one output. The destination path is never handed to FFmpeg.
    let args_temp = gif_encode_args_with_temp(args, temp_output);

    let mut child = bundled_command(ffmpeg)
        .args(&args_temp)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| GifEncodeError::Failed(format!("无法启动 FFmpeg：{e}")))?;

    // Register child for cancellation (Arc<Mutex<Child>>)
    let child_arc = Arc::new(Mutex::new(child));
    host.insert_child(task_id, child_arc.clone());

    // Take stdout/stderr BEFORE anyone else locks
    let stdout = child_arc
        .lock()
        .map_err(|_| GifEncodeError::Failed("FFmpeg 进程锁失败".to_string()))?
        .stdout
        .take();
    let stderr = child_arc
        .lock()
        .map_err(|_| GifEncodeError::Failed("FFmpeg 进程锁失败".to_string()))?
        .stderr
        .take();

    // Spawn stderr consumer to prevent pipe deadlock
    let stderr_thread = thread::spawn(move || {
        let mut buf = String::new();
        if let Some(mut s) = stderr {
            let _ = s.read_to_string(&mut buf);
        }
        buf
    });

    // Spawn stdout progress parser
    let host_clone = host.clone();
    let tid = task_id.to_string();
    if let Some(stdout) = stdout {
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                // out_time_ms from -progress starts from 0 after -ss
                if let Some(frac) = parse_progress_line(&line, 0.0, progress_step_span) {
                    let p = progress_step_base + frac;
                    host_clone.emit(MediaTaskEvent::Progress {
                        task_id: tid.clone(),
                        progress: p.clamp(0.0, 0.99),
                    });
                }
            }
        });
    }

    // Poll without holding the mutex across the wait. Cancellation can acquire
    // the same mutex between polls and kill the child promptly.
    let status = loop {
        let result = {
            let mut child_guard = child_arc
                .lock()
                .map_err(|_| GifEncodeError::Failed("FFmpeg 进程锁失败".to_string()))?;
            child_guard
                .try_wait()
                .map_err(|e| GifEncodeError::Failed(format!("FFmpeg 等待失败：{e}")))?
        };
        if let Some(status) = result {
            break status;
        }
        thread::sleep(std::time::Duration::from_millis(20));
    };
    let _stderr_output = stderr_thread.join().unwrap_or_default();

    // Check cancellation (registry can now lock independently)
    if host.take_cancelled(task_id) {
        remove_incomplete_output(temp_output);
        host.emit(MediaTaskEvent::Cancelled {
            task_id: task_id.to_string(),
        });
        return Err(GifEncodeError::Cancelled);
    }

    if status.success() {
        match fs::metadata(temp_output) {
            Ok(meta) => {
                // Deliberately do NOT publish to the destination here. The caller
                // must first check the real encoded size against the budget;
                // publishing first is what used to strand an over-budget GIF at
                // the user's destination when every attempt was exhausted.
                Ok(meta.len())
            }
            Err(_) => {
                remove_incomplete_output(temp_output);
                Err(GifEncodeError::Failed("FFmpeg 完成后未找到输出文件".into()))
            }
        }
    } else {
        remove_incomplete_output(temp_output);
        Err(GifEncodeError::Failed("FFmpeg 编码失败".into()))
    }
}

/// Builds the encoder arguments for one GIF attempt.
///
/// Deliberately does **not** take an output path: the retry loop must never let
/// FFmpeg see the user's destination, otherwise a rejected attempt would already
/// have written (or half-written) a file there. `run_gif_encode_with_progress`
/// appends `-y` plus the temp path.
fn build_gif_encode_args(
    request: &GifMediaTaskRequest,
    fps: u32,
    width: Option<u32>,
) -> Vec<OsString> {
    let options = &request.options;
    let mut args = vec![
        OsString::from("-hide_banner"),
        OsString::from("-nostdin"),
        OsString::from("-y"), // -y for retry safety (prev output removed before encode)
    ];
    if let Some(start) = options.start_seconds {
        args.extend([OsString::from("-ss"), OsString::from(start.to_string())]);
    }
    args.extend([OsString::from("-i"), OsString::from(&request.input_path)]);
    if let Some(end) = options.end_seconds {
        let duration = end - options.start_seconds.unwrap_or(0.0);
        args.extend([OsString::from("-t"), OsString::from(duration.to_string())]);
    }

    let mut filters = Vec::new();
    if let Some(w) = width {
        filters.push(format!("scale={w}:-2:flags=lanczos"));
    }
    filters.push(format!("fps={fps}"));

    let filter = filters.join(",");
    let dither = if options.preset == "fast" {
        "bayer:bayer_scale=5"
    } else {
        "sierra2_4a"
    };
    let palette = format!("{filter},split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither={dither}");

    args.extend([
        OsString::from("-filter_complex"),
        OsString::from(palette),
        OsString::from("-loop"),
        OsString::from("0"), // always infinite loop
        // State the format instead of letting FFmpeg infer it from the output
        // name. `-f` is an output option and must precede the output path. This
        // is what makes the `.tmp.gif` retry target safe even if a temp name
        // ever loses its extension.
        OsString::from("-f"),
        OsString::from("gif"),
        OsString::from("-progress"),
        OsString::from("pipe:1"),
        OsString::from("-nostats"),
    ]);
    args
}

/// Production `GifTaskHost`: routes events, cancellation and child registration
/// through the Tauri app handle and the shared `MediaTaskRegistry`.
struct AppGifHost {
    app: AppHandle,
}

impl GifTaskHost for AppGifHost {
    fn emit(&self, event: MediaTaskEvent) {
        emit(&self.app, event);
    }

    fn insert_child(&self, task_id: &str, child: Arc<Mutex<Child>>) {
        self.app
            .state::<MediaTaskRegistry>()
            .insert(task_id.to_string(), child);
    }

    fn take_cancelled(&self, task_id: &str) -> bool {
        self.app
            .state::<MediaTaskRegistry>()
            .take_cancelled(task_id)
    }

    fn remove_task(&self, task_id: &str) {
        self.app.state::<MediaTaskRegistry>().remove(task_id);
    }

    fn authorize_preview(&self, path: &Path) {
        let _ = self.app.asset_protocol_scope().allow_file(path);
    }
}

/// Emits the single terminal `Failed` event for a task and deregisters it.
fn gif_emit_failed(host: &Arc<dyn GifTaskHost>, task_id: &str, message: String) {
    host.emit(MediaTaskEvent::Failed {
        task_id: task_id.to_string(),
        message,
    });
    host.remove_task(task_id);
}

/// One GIF task: short sample → first full encode → at most one width-only
/// correction → atomic, non-overwriting publish.
///
/// Product rules (aligned with the standalone GIF tool):
/// - FPS is the user's hard constraint; compression only shrinks the width.
/// - The trimmed duration is never changed by compression.
/// - At most `MAX_GIF_FULL_ENCODES` full encodes.
/// - The short sample and the full encode come from the same argument builder,
///   so the prediction describes the encode that is actually run.
/// - Nothing over budget is ever published, and each attempt's temp file is
///   removed before the next one starts.
///
/// Exactly one terminal event is emitted on every exit path.
fn run_gif_task_loop(
    ffmpeg: &Path,
    request: &GifMediaTaskRequest,
    preferred_output: &Path,
    target_bytes: u64,
    source_width: Option<u32>,
    source_duration: f64,
    host: &Arc<dyn GifTaskHost>,
    task_id: &str,
) {
    let budget = gif_budget(target_bytes);
    let fps = request.options.fps;
    let token = gif_temp_token(task_id);
    // Unknown mode falls back to the balanced behaviour instead of failing a
    // task that already passed validation.
    let mode = request.options.mode.as_deref().unwrap_or("balanced");
    let requested_width = request.options.width.filter(|width| *width > 0);
    let cap = match requested_width.or(source_width) {
        Some(width) if width > 0 => width,
        _ => {
            gif_emit_failed(
                host,
                task_id,
                "无法读取视频宽度，请在参数里手动填写输出宽度后重试".to_string(),
            );
            return;
        }
    };
    let floor = request.options.min_width.unwrap_or(160).max(64).min(cap);

    // ── Stage 0: short sample, built by the very same argument builder ──────
    let start_seconds = request.options.start_seconds.unwrap_or(0.0).max(0.0);
    let end_seconds = request
        .options
        .end_seconds
        .unwrap_or(source_duration)
        .min(source_duration.max(start_seconds + 0.05));
    let segment = (end_seconds - start_seconds).max(0.05);
    let (sample_width, sample_seconds) = gif_sample_plan(cap, segment);
    let sample_signature = gif_sample_signature(
        &request.input_path,
        gif_input_len(&request.input_path),
        fps,
        &request.options.preset,
        start_seconds,
        sample_width,
        sample_seconds,
    );
    // Reuse a still-valid analysis sample instead of encoding the same thing
    // twice. Only an exact signature match qualifies; anything else re-samples.
    let reused_sample = request.options.sample.as_ref().filter(|hint| {
        hint.bytes > 0
            && hint.width == sample_width
            && (hint.seconds - sample_seconds).abs() < 1e-6
            && hint.signature == sample_signature
    });
    let sample_bytes = match reused_sample {
        Some(hint) => hint.bytes,
        None => {
            let sample_request = gif_sample_request(request, sample_width, sample_seconds);
            let sample_temp = gif_temp_output_path(preferred_output, &token, "sample");
            let sample_args = build_gif_encode_args(&sample_request, fps, Some(sample_width));
            let bytes = match run_gif_encode_with_progress(
                ffmpeg,
                &sample_args,
                &sample_temp,
                host,
                task_id,
                0.0,
                GIF_SAMPLE_PROGRESS,
            ) {
                Ok(bytes) => bytes,
                Err(GifEncodeError::Cancelled) => {
                    host.remove_task(task_id);
                    return;
                }
                Err(error) => {
                    gif_emit_failed(host, task_id, error.message());
                    return;
                }
            };
            remove_incomplete_output(&sample_temp);
            bytes
        }
    };

    // ── Stage 1: first full encode, then at most one width-only correction ──
    // The prediction covers the *whole* segment, not just the sample window.
    let estimate = fit_width_for_budget(
        sample_width,
        sample_bytes,
        sample_seconds,
        budget,
        gif_correction_safety(mode),
        floor,
        cap,
        segment,
    )
    .unwrap_or(cap);
    let mut current_width = requested_width.unwrap_or(estimate).clamp(floor, cap);
    let mut encodes_done = 0u32;

    loop {
        if host.take_cancelled(task_id) {
            // Only our own temp artefacts may be removed here: the destination
            // is never written before the publish step.
            remove_incomplete_output(&gif_temp_output_path(preferred_output, &token, "first"));
            remove_incomplete_output(&gif_temp_output_path(preferred_output, &token, "correct"));
            host.emit(MediaTaskEvent::Cancelled {
                task_id: task_id.to_string(),
            });
            host.remove_task(task_id);
            return;
        }

        let slot = if encodes_done == 0 {
            "first"
        } else {
            "correct"
        };
        let temp = gif_temp_output_path(preferred_output, &token, slot);
        let args = build_gif_encode_args(request, fps, Some(current_width));
        // Full encodes own the progress range after the sample's share, so the
        // reported progress never jumps backwards between stages. When the
        // sample was reused there was no sample stage to spend.
        let progress_base = if reused_sample.is_some() {
            0.0
        } else {
            GIF_SAMPLE_PROGRESS
        };
        let encode_span = (1.0 - progress_base) / MAX_GIF_FULL_ENCODES as f64;
        let step = progress_base + encodes_done as f64 * encode_span;
        let bytes = match run_gif_encode_with_progress(
            ffmpeg,
            &args,
            &temp,
            host,
            task_id,
            step,
            encode_span,
        ) {
            Ok(bytes) => bytes,
            Err(GifEncodeError::Cancelled) => {
                // The encoder already emitted the single `Cancelled` event.
                host.remove_task(task_id);
                return;
            }
            Err(error) => {
                remove_incomplete_output(&temp);
                gif_emit_failed(host, task_id, error.message());
                return;
            }
        };
        encodes_done += 1;

        let next = next_gif_width(
            current_width,
            floor,
            gif_correction_safety(mode),
            bytes,
            budget,
        );
        match gif_step_outcome(
            bytes,
            target_bytes,
            next.is_some(),
            encodes_done,
            MAX_GIF_FULL_ENCODES,
        ) {
            GifStepOutcome::Publish => match persist_gif_final(&temp, preferred_output) {
                Ok(actual) => {
                    // Closing window: a cancel accepted while the publish was in
                    // flight must still produce a single, truthful `Cancelled`
                    // terminal state and leave no file behind.
                    if host.take_cancelled(task_id) {
                        remove_incomplete_output(&actual);
                        host.emit(MediaTaskEvent::Cancelled {
                            task_id: task_id.to_string(),
                        });
                        host.remove_task(task_id);
                        return;
                    }
                    // 预览最终 GIF 时只需要读取这一个已发布的文件；授权发生在
                    // 成功发布之后，失败/取消/超限路径仍然不会产生授权。
                    host.authorize_preview(&actual);
                    host.emit(MediaTaskEvent::Completed {
                        task_id: task_id.to_string(),
                        output_path: actual.to_string_lossy().into_owned(),
                        output_bytes: bytes,
                    });
                    host.remove_task(task_id);
                    return;
                }
                Err(message) => {
                    gif_emit_failed(host, task_id, message);
                    return;
                }
            },
            GifStepOutcome::Retry => {
                remove_incomplete_output(&temp);
                match next {
                    Some(width) => current_width = width,
                    None => {
                        gif_emit_failed(
                            host,
                            task_id,
                            gif_failure_message(
                                GifFailureReason::NoRoomToShrink,
                                bytes,
                                target_bytes,
                                fps,
                            ),
                        );
                        return;
                    }
                }
            }
            GifStepOutcome::Fail(reason) => {
                remove_incomplete_output(&temp);
                gif_emit_failed(
                    host,
                    task_id,
                    gif_failure_message(reason, bytes, target_bytes, fps),
                );
                return;
            }
        }
    }
}

/// Pixel size of the first video stream, via the bundled FFprobe.
fn video_size(app: &AppHandle, input: &Path) -> Result<(u32, u32), String> {
    let ffprobe = sidecar_path(app, "ffprobe")?;
    probe_video_size(&ffprobe, input)
}

/// 用给定的 FFprobe 读取第一路视频流的宽高（视频与 GIF 都适用）。
fn probe_video_size(ffprobe: &Path, input: &Path) -> Result<(u32, u32), String> {
    let output = bundled_command(ffprobe)
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "default=noprint_wrappers=1",
        ])
        .arg(input)
        .output()
        .map_err(|error| format!("无法读取视频尺寸：{error}"))?;
    if !output.status.success() {
        return Err("FFprobe 无法读取视频尺寸，请在参数里手动填写期望宽度".into());
    }
    let text = String::from_utf8_lossy(&output.stdout).into_owned();
    let read = |key: &str| {
        text.lines()
            .find_map(|line| line.strip_prefix(key))
            .and_then(|value| value.trim().parse::<u32>().ok())
            .filter(|value| *value > 0)
    };
    match (read("width="), read("height=")) {
        (Some(width), Some(height)) => Ok((width, height)),
        _ => Err("FFprobe 返回的视频尺寸无效，请在参数里手动填写期望宽度".into()),
    }
}

/// Output height the encoder would produce for `width` with `scale=w:-2`.
///
/// `-2` keeps the aspect ratio and rounds to an even number, so the preview can
/// show the exact geometry without probing the encoded file.
fn scaled_height(source_width: u32, source_height: u32, width: u32) -> u32 {
    if source_width == 0 {
        return 0;
    }
    let exact = source_height as f64 * width as f64 / source_width as f64;
    let even = (exact / 2.0).round() * 2.0;
    even.max(2.0) as u32
}

/// Marker returned when the user aborted the analysis; the command maps it to a
/// user-facing message and the UI discards it for stale generations anyway.
const GIF_ANALYSIS_CANCELLED: &str = "分析已取消";

/// Renders `value` into a safe file-name stem (no separators, bounded length).
fn sanitize_file_stem(value: &str) -> String {
    let mut stem: String = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .take(48)
        .collect();
    if stem.is_empty() {
        stem.push_str("analysis");
    }
    stem
}

/// Runs one blocking FFmpeg child for the analysis, registered for cancellation.
fn run_gif_analysis_command(
    ffmpeg: &Path,
    args: &[OsString],
    host: &Arc<dyn GifTaskHost>,
    task_id: &str,
    failure: &str,
) -> Result<(), String> {
    let child = bundled_command(ffmpeg)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("无法启动 FFmpeg：{error}"))?;
    let child = Arc::new(Mutex::new(child));
    host.insert_child(task_id, child.clone());
    let status = child
        .lock()
        .map_err(|_| "无法获取 FFmpeg 进程状态".to_string())?
        .wait();
    if host.take_cancelled(task_id) {
        return Err(GIF_ANALYSIS_CANCELLED.into());
    }
    match status {
        Ok(status) if status.success() => Ok(()),
        Ok(_) => Err(failure.to_string()),
        Err(error) => Err(format!("FFmpeg 进程异常：{error}")),
    }
}

/// The explicit "计算预览" job: one real output frame plus a byte estimate for
/// the whole segment, derived from a short sample of the very same encoder.
///
/// The single frame is for judging detail only; it can never prove the file size
/// or the smoothness of the animation. Size comes from the sample encode scaled
/// by the segment/sample duration ratio and the area ratio.
#[allow(clippy::too_many_arguments)]
fn run_gif_analysis(
    ffmpeg: &Path,
    request: &GifMediaTaskRequest,
    frame_at_seconds: Option<f64>,
    source_width: u32,
    source_height: u32,
    source_duration: f64,
    frame_output: &Path,
    sample_output: &Path,
    host: &Arc<dyn GifTaskHost>,
    task_id: &str,
) -> Result<GifAnalysis, String> {
    let fps = request.options.fps;
    let mode = request.options.mode.as_deref().unwrap_or("balanced");
    let expected_width = request
        .options
        .width
        .filter(|width| *width > 0)
        .unwrap_or(source_width)
        .max(1);
    let start_seconds = request.options.start_seconds.unwrap_or(0.0).max(0.0);
    let end_seconds = request
        .options
        .end_seconds
        .unwrap_or(source_duration)
        .min(source_duration.max(start_seconds + 0.05));
    let duration_seconds = (end_seconds - start_seconds).max(0.05);
    let floor = request
        .options
        .min_width
        .unwrap_or(160)
        .max(64)
        .min(expected_width);
    let budget = gif_budget(request.options.target_bytes.unwrap_or(0));

    // ── 1. Short sample through the production argument builder ────────────
    let (sample_width, sample_seconds) = gif_sample_plan(expected_width, duration_seconds);
    let sample_request = gif_sample_request(request, sample_width, sample_seconds);
    let sample_args = gif_encode_args_with_temp(
        &build_gif_encode_args(&sample_request, fps, Some(sample_width)),
        sample_output,
    );
    run_gif_analysis_command(
        ffmpeg,
        &sample_args,
        host,
        task_id,
        "短样本编码失败，请检查素材或参数",
    )?;
    let sample_bytes = std::fs::metadata(sample_output)
        .map(|meta| meta.len())
        .unwrap_or(0);
    remove_incomplete_output(sample_output);
    if sample_bytes == 0 {
        remove_incomplete_output(frame_output);
        return Err("短样本编码没有产出可测量的文件".into());
    }

    // Automatic size uses the same budget, floor and mode as the first full encode.
    let expected_width = if request.options.width.is_none() {
        fit_width_for_budget(
            sample_width,
            sample_bytes,
            sample_seconds,
            budget,
            gif_correction_safety(mode),
            floor,
            expected_width,
            duration_seconds,
        )
        .unwrap_or(expected_width)
    } else {
        expected_width
    };

    // ── 2. Real output frame at the chosen time ────────────────────────────
    let frame_at = frame_at_seconds
        .filter(|value| value.is_finite())
        .unwrap_or(start_seconds + (duration_seconds * 0.25).min(0.5))
        .clamp(start_seconds, (end_seconds - 0.05).max(start_seconds));
    // Same scale filter and same frame-rate grid as the encoder, so this is the
    // frame the GIF would show around that moment.
    let frame_args: Vec<OsString> = vec![
        OsString::from("-hide_banner"),
        OsString::from("-nostdin"),
        OsString::from("-y"),
        OsString::from("-ss"),
        OsString::from(frame_at.to_string()),
        OsString::from("-i"),
        OsString::from(&request.input_path),
        OsString::from("-frames:v"),
        OsString::from("1"),
        OsString::from("-vf"),
        OsString::from(format!("fps={fps},scale={expected_width}:-2:flags=lanczos")),
        frame_output.as_os_str().to_owned(),
    ];
    run_gif_analysis_command(
        ffmpeg,
        &frame_args,
        host,
        task_id,
        "无法从所选时间点提取单帧，请调整截取区间后重试",
    )?;

    // ── 3. Estimate for the whole segment + advisory suggestion ────────────
    let estimate = gif_estimate_full_bytes(
        sample_bytes,
        sample_seconds,
        sample_width,
        expected_width,
        duration_seconds,
    );
    let (estimate_low, estimate_high) = gif_estimate_range(estimate);
    let (suggested_width, suggested_seconds) = gif_analysis_advice(
        sample_width,
        sample_bytes,
        sample_seconds,
        budget,
        gif_correction_safety(mode),
        expected_width,
        floor,
        duration_seconds,
    );
    let sample_signature = gif_sample_signature(
        &request.input_path,
        gif_input_len(&request.input_path),
        fps,
        &request.options.preset,
        start_seconds,
        sample_width,
        sample_seconds,
    );

    Ok(GifAnalysis {
        task_id: task_id.to_string(),
        frame_path: frame_output.to_string_lossy().into_owned(),
        output_width: expected_width,
        output_height: scaled_height(source_width, source_height, expected_width),
        fps,
        start_seconds,
        end_seconds,
        duration_seconds,
        sample_width,
        sample_seconds,
        sample_bytes,
        estimate_low_bytes: estimate_low,
        estimate_bytes: estimate,
        estimate_high_bytes: estimate_high,
        budget_bytes: budget,
        likely_fits: estimate_high <= budget,
        suggested_width,
        suggested_seconds,
        sample_signature,
    })
}

/// Explicit analysis behind the "计算预览" button.
///
/// Only this command starts FFmpeg for a preview: changing parameters merely
/// invalidates the previous result. Runs on a blocking thread so the UI thread
/// stays responsive, and registers its children in the same registry as a
/// conversion, so the existing cancel command aborts it.
#[tauri::command]
pub async fn analyze_gif_media_task(
    app: AppHandle,
    request: GifMediaTaskRequest,
    frame_at_seconds: Option<f64>,
) -> Result<GifAnalysis, String> {
    validate_gif_inputs(&request)?;
    if !engine_status(app.clone()).ready {
        return Err("转换引擎不可用：无法使用应用内置 sidecar".into());
    }
    let input = PathBuf::from(&request.input_path);
    let source_duration = duration_seconds(&app, &input)?;
    let (source_width, source_height) = video_size(&app, &input)?;
    let ffmpeg = sidecar_path(&app, "ffmpeg")?;
    let task_id = request.task_id.clone();

    let analysis_dir = std::env::temp_dir().join("brand-material-gif-analysis");
    std::fs::create_dir_all(&analysis_dir)
        .map_err(|error| format!("无法创建分析临时目录：{error}"))?;
    let stem = sanitize_file_stem(&task_id);
    let frame_output = analysis_dir.join(format!("{stem}_frame.png"));
    let sample_output = analysis_dir.join(format!("{stem}_sample.gif"));
    remove_incomplete_output(&frame_output);
    remove_incomplete_output(&sample_output);
    // Let the webview display the frame through the asset protocol, without
    // widening the configured scope for anything else.
    let _ = app.asset_protocol_scope().allow_file(&frame_output);

    {
        let registry = app.state::<MediaTaskRegistry>();
        if registry
            .children
            .lock()
            .expect("media child registry poisoned")
            .contains_key(&task_id)
        {
            return Err("该任务已在分析中".into());
        }
        // A cancel token makes `cancel` succeed even in the gap between the two
        // FFmpeg children, so a fast parameter change really stops the work.
        registry.register_cancel_token(&task_id, Arc::new(AtomicBool::new(false)));
    }

    let host: Arc<dyn GifTaskHost> = Arc::new(AppGifHost { app: app.clone() });
    let request_for_job = request.clone();
    let task_id_for_job = task_id.clone();
    let frame_for_job = frame_output.clone();
    let sample_for_job = sample_output.clone();
    let joined = tauri::async_runtime::spawn_blocking(move || {
        run_gif_analysis(
            &ffmpeg,
            &request_for_job,
            frame_at_seconds,
            source_width,
            source_height,
            source_duration,
            &frame_for_job,
            &sample_for_job,
            &host,
            &task_id_for_job,
        )
    })
    .await
    .map_err(|error| format!("分析任务异常结束：{error}"));

    {
        let registry = app.state::<MediaTaskRegistry>();
        // Consume a late cancel flag so it cannot linger on this id forever.
        let _ = registry.take_cancelled(&task_id);
        registry.remove_cancel_token(&task_id);
        registry.remove(&task_id);
    }
    let result = match joined {
        Ok(inner) => inner,
        Err(message) => Err(message),
    };
    if result.is_err() {
        remove_incomplete_output(&frame_output);
        remove_incomplete_output(&sample_output);
    }
    result
}

#[tauri::command]
pub fn start_gif_media_task(
    app: AppHandle,
    registry: tauri::State<'_, MediaTaskRegistry>,
    request: GifMediaTaskRequest,
) -> Result<MediaTaskStarted, String> {
    validate_request(&request)?;
    let output = output_path(&request);
    let duration = duration_seconds(&app, Path::new(&request.input_path))?;

    if !engine_status(app.clone()).ready {
        return Err("转换引擎不可用：无法使用应用内置 sidecar".into());
    }
    if registry
        .children
        .lock()
        .expect("media child registry poisoned")
        .contains_key(&request.task_id)
    {
        return Err("该媒体任务已在运行".into());
    }

    let ffmpeg = sidecar_path(&app, "ffmpeg")?;
    let target_bytes = request.options.target_bytes.unwrap_or(0);
    // Probed only when the user did not pin an output width: the width sizes the
    // compression step and scales the analysis sample.
    let source_width = if request.options.width.filter(|width| *width > 0).is_some() {
        None
    } else {
        Some(video_size(&app, Path::new(&request.input_path))?.0)
    };

    let host: Arc<dyn GifTaskHost> = Arc::new(AppGifHost { app: app.clone() });
    let output_for_task = output.clone();
    let request_for_thread = request.clone();

    thread::spawn(move || {
        run_gif_task_loop(
            &ffmpeg,
            &request_for_thread,
            &output_for_task,
            target_bytes,
            source_width,
            duration,
            &host,
            &request_for_thread.task_id,
        );
    });

    Ok(MediaTaskStarted {
        task_id: request.task_id,
        output_path: output.to_string_lossy().into_owned(),
    })
}

/// 「计算 GIF」任务宿主：把事件、取消、子进程登记转到 AppHandle，同时记录
/// 终态事件，让命令可以把真实产物路径/字节/失败原因返回给前端。
struct ComputeGifHost {
    app: AppHandle,
    terminal: Arc<Mutex<Option<MediaTaskEvent>>>,
}

impl GifTaskHost for ComputeGifHost {
    fn emit(&self, event: MediaTaskEvent) {
        if matches!(
            event,
            MediaTaskEvent::Completed { .. }
                | MediaTaskEvent::Failed { .. }
                | MediaTaskEvent::Cancelled { .. }
        ) {
            if let Ok(mut slot) = self.terminal.lock() {
                *slot = Some(event.clone());
            }
        }
        emit(&self.app, event);
    }

    fn insert_child(&self, task_id: &str, child: Arc<Mutex<Child>>) {
        self.app
            .state::<MediaTaskRegistry>()
            .insert(task_id.to_string(), child);
    }

    fn take_cancelled(&self, task_id: &str) -> bool {
        self.app
            .state::<MediaTaskRegistry>()
            .take_cancelled(task_id)
    }

    fn remove_task(&self, task_id: &str) {
        self.app.state::<MediaTaskRegistry>().remove(task_id);
    }

    fn authorize_preview(&self, path: &Path) {
        let _ = self.app.asset_protocol_scope().allow_file(path);
    }
}

/// 计算一个可预览、可保存的真实 GIF：复用 `run_gif_task_loop` 的
/// 短样本预算 → 最多两次完整编码 → 校验 → 非覆盖发布，只是把发布目录换成
/// 后端管理的临时结果目录，绝不写用户导出目录。
///
/// 与直接导出共享同一条编码循环，不复制第二套参数构建或宽度校正逻辑。
#[allow(clippy::too_many_arguments)]
fn compute_gif_preview_file(
    ffmpeg: &Path,
    ffprobe: Option<&Path>,
    request: &GifMediaTaskRequest,
    results_dir: &Path,
    target_bytes: u64,
    source_width: Option<u32>,
    source_duration: f64,
    host: &Arc<dyn GifTaskHost>,
    terminal: &Arc<Mutex<Option<MediaTaskEvent>>>,
    task_id: &str,
) -> Result<ComputedGifResult, String> {
    fs::create_dir_all(results_dir).map_err(|error| format!("无法创建结果临时目录：{error}"))?;
    prune_computed_gifs(results_dir, COMPUTED_GIF_MAX_AGE);
    let preferred = results_dir.join(format!("{}.gif", sanitize_file_stem(task_id)));
    cleanup_gif_artifacts(&preferred);

    run_gif_task_loop(
        ffmpeg,
        request,
        &preferred,
        target_bytes,
        source_width,
        source_duration,
        host,
        task_id,
    );

    let terminal_event = terminal.lock().ok().and_then(|slot| slot.clone());
    let (path, event_bytes) = match terminal_event {
        Some(MediaTaskEvent::Completed {
            output_path,
            output_bytes,
            ..
        }) => (PathBuf::from(output_path), output_bytes),
        Some(MediaTaskEvent::Failed { message, .. }) => {
            cleanup_gif_artifacts(&preferred);
            return Err(message);
        }
        Some(MediaTaskEvent::Cancelled { .. }) | None => {
            cleanup_gif_artifacts(&preferred);
            return Err(GIF_COMPUTE_CANCELLED.into());
        }
        _ => {
            cleanup_gif_artifacts(&preferred);
            return Err("计算未产生结果".into());
        }
    };

    // 只信任后端临时目录里的产物；任何其他路径都视为异常。
    if !path.starts_with(results_dir) {
        cleanup_gif_artifacts(&preferred);
        return Err("计算结果路径异常".into());
    }
    let actual_bytes = match validate_computed_gif(&path) {
        Ok(bytes) => bytes,
        Err(message) => {
            cleanup_gif_artifacts(&preferred);
            return Err(message);
        }
    };
    if event_bytes != actual_bytes {
        log::warn!(
            "COMPUTED_GIF_BYTE_MISMATCH task_id={task_id} event={event_bytes} actual={actual_bytes}"
        );
    }
    let (width, height) = ffprobe
        .and_then(|ffprobe| probe_video_size(ffprobe, &path).ok())
        .unwrap_or((0, 0));

    let start_seconds = request.options.start_seconds.unwrap_or(0.0).max(0.0);
    let end_seconds = request
        .options
        .end_seconds
        .unwrap_or(source_duration)
        .max(start_seconds);
    Ok(ComputedGifResult {
        task_id: task_id.to_string(),
        path: path.to_string_lossy().into_owned(),
        bytes: actual_bytes,
        width,
        height,
        fps: request.options.fps,
        duration_seconds: (end_seconds - start_seconds).max(0.0),
        start_seconds,
        end_seconds,
    })
}

/// 「计算 GIF」：先做短样本预算，再完成所选片段的真实编码，结果留在后端
/// 管理的临时目录；不要求用户先选择导出目录，也不写任何用户文件。
///
/// 只登记本次结果文件到 asset 协议，供主预览读取。
#[tauri::command]
pub async fn compute_gif_media_preview(
    app: AppHandle,
    request: GifMediaTaskRequest,
) -> Result<ComputedGifResult, String> {
    validate_gif_inputs(&request)?;
    if !engine_status(app.clone()).ready {
        return Err("转换引擎不可用：无法使用应用内置 sidecar".into());
    }
    let input = PathBuf::from(&request.input_path);
    let source_duration = duration_seconds(&app, &input)?;
    let ffmpeg = sidecar_path(&app, "ffmpeg")?;
    let ffprobe = sidecar_path(&app, "ffprobe")?;
    let target_bytes = request.options.target_bytes.unwrap_or(0);
    let has_width = request.options.width.filter(|width| *width > 0).is_some();
    let source_width = if has_width {
        None
    } else {
        Some(probe_video_size(&ffprobe, &input)?.0)
    };
    let results_dir = computed_gif_dir();
    fs::create_dir_all(&results_dir).map_err(|error| format!("无法创建结果临时目录：{error}"))?;

    let task_id = request.task_id.clone();
    let terminal: Arc<Mutex<Option<MediaTaskEvent>>> = Arc::new(Mutex::new(None));
    let host: Arc<dyn GifTaskHost> = Arc::new(ComputeGifHost {
        app: app.clone(),
        terminal: terminal.clone(),
    });

    {
        let registry = app.state::<MediaTaskRegistry>();
        if registry
            .children
            .lock()
            .expect("media child registry poisoned")
            .contains_key(&task_id)
        {
            return Err("该任务已在计算中".into());
        }
        // 取消令牌让 `cancel` 在两次 FFmpeg 子进程的间隙也能成功。
        registry.register_cancel_token(&task_id, Arc::new(AtomicBool::new(false)));
    }

    let request_for_job = request.clone();
    let results_for_job = results_dir.clone();
    let host_for_job = host.clone();
    let terminal_for_job = terminal.clone();
    let task_id_for_job = task_id.clone();
    let joined = tauri::async_runtime::spawn_blocking(move || {
        compute_gif_preview_file(
            &ffmpeg,
            Some(&ffprobe),
            &request_for_job,
            &results_for_job,
            target_bytes,
            source_width,
            source_duration,
            &host_for_job,
            &terminal_for_job,
            &task_id_for_job,
        )
    })
    .await
    .map_err(|error| format!("计算任务异常结束：{error}"));

    // 取消可能在编码完成之后才被接受：先取标记，再决定是否登记结果。
    let cancelled = {
        let registry = app.state::<MediaTaskRegistry>();
        let cancelled = registry.take_cancelled(&task_id);
        registry.remove_cancel_token(&task_id);
        registry.remove(&task_id);
        cancelled
    };

    match joined {
        Ok(Ok(result)) => accept_computed_gif(
            &app.state::<ComputedGifRegistry>(),
            cancelled,
            result,
            format!("{}_gif.gif", gif_source_stem(&request.input_path)),
        ),
        Ok(Err(message)) => {
            cleanup_gif_artifacts(
                &results_dir.join(format!("{}.gif", sanitize_file_stem(&task_id))),
            );
            Err(message)
        }
        Err(message) => {
            cleanup_gif_artifacts(
                &results_dir.join(format!("{}.gif", sanitize_file_stem(&task_id))),
            );
            Err(message)
        }
    }
}

/// 最终登记计算结果前处理「已经接受的取消」。
///
/// 取消请求可能在编码刚完成时到达：此时结果文件已经生成，但绝不能登记为
/// 可保存结果、也不能向前端返回成功。清理文件后统一返回 `计算已取消`，
/// 让前端显示取消而不是失败。
fn accept_computed_gif(
    registry: &ComputedGifRegistry,
    cancelled: bool,
    result: ComputedGifResult,
    preferred_name: String,
) -> Result<ComputedGifResult, String> {
    if cancelled {
        cleanup_gif_artifacts(Path::new(&result.path));
        return Err(GIF_COMPUTE_CANCELLED.into());
    }
    registry.insert(
        result.task_id.clone(),
        PathBuf::from(&result.path),
        preferred_name,
    );
    Ok(result)
}

/// 保存已计算的 GIF：按 taskId 解析本工具生成的结果文件，复制到目标目录的
/// 唯一临时文件并同步，再复用既有的非覆盖硬链接发布（同名追加 `_2`、`_3`）。
///
/// 不会重新编码，也不接受前端传入的任意源路径。
#[tauri::command]
pub fn save_computed_gif(
    registry: tauri::State<'_, ComputedGifRegistry>,
    task_id: String,
    directory: String,
) -> Result<SavedGifResult, String> {
    let entry = registry
        .get(&task_id)
        .ok_or_else(|| "没有可保存的计算结果，请先计算 GIF".to_string())?;
    if !entry.path.is_file() {
        return Err("计算结果已被清理，请重新计算 GIF".into());
    }
    let directory = PathBuf::from(directory);
    if !directory.is_dir() {
        return Err("所选导出文件夹不存在或不可访问".into());
    }
    save_computed_gif_file(&entry.path, &entry.preferred_name, &directory)
}

/// 把结果文件复制到目标目录并做非覆盖发布。抽成自由函数，便于在不构造
/// `AppHandle`/`State` 的情况下用真实文件验证「不重编码、不覆盖、临时文件清理」。
fn save_computed_gif_file(
    source: &Path,
    preferred_name: &str,
    directory: &Path,
) -> Result<SavedGifResult, String> {
    let temp = save_gif_temp_path(directory, preferred_name);
    remove_incomplete_output(&temp);
    if let Err(error) = fs::copy(source, &temp) {
        remove_incomplete_output(&temp);
        return Err(format!("无法复制计算结果到导出目录：{error}"));
    }
    // 写入完成并落盘后再发布，避免发布出一份尚未同步完成的文件。
    match fs::File::open(&temp) {
        Ok(file) => {
            if let Err(error) = file.sync_all() {
                remove_incomplete_output(&temp);
                return Err(format!("无法同步导出文件：{error}"));
            }
        }
        Err(error) => {
            remove_incomplete_output(&temp);
            return Err(format!("无法打开导出临时文件：{error}"));
        }
    }
    let preferred = directory.join(preferred_name);
    let actual = persist_gif_final(&temp, &preferred)?;
    let bytes = fs::metadata(&actual)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    Ok(SavedGifResult {
        path: actual.to_string_lossy().into_owned(),
        bytes,
    })
}

/// 丢弃一份已计算结果及其临时文件（重新计算、换素材或卸载时调用）。
#[tauri::command]
pub fn discard_computed_gif(
    registry: tauri::State<'_, ComputedGifRegistry>,
    task_id: String,
) -> Result<(), String> {
    if let Some(path) = registry.remove(&task_id) {
        cleanup_gif_artifacts(&path);
    }
    Ok(())
}

/// Human-readable size for task messages.
///
/// Uses decimal units because the product limit is expressed in decimal MB
/// (`MAX_GIF_BYTES` = 8,000,000 B). Printing `8,000,000` as "7.6 MB" via 1024
/// arithmetic reads as a bug to the person looking at the failure message.
fn format_file_size(bytes: u64) -> String {
    if bytes < 1_000_000 {
        format!("{} KB", bytes / 1_000)
    } else {
        format!("{:.1} MB", bytes as f64 / 1_000_000.0)
    }
}

#[tauri::command]
pub fn start_watermark_media_task(
    app: AppHandle,
    registry: tauri::State<'_, MediaTaskRegistry>,
    queue: tauri::State<'_, WatermarkVideoQueueCore<WatermarkEncodePayload>>,
    request: WatermarkMediaTaskRequest,
) -> Result<MediaTaskStarted, String> {
    validate_watermark_request(&request)?;
    let task_id = request.task_id.clone();
    let is_video = is_video_media(Path::new(&request.input_path));
    // Static images and GIF keep the legacy immediate-spawn path. Only real
    // video (MP4/MOV) goes through the FIFO queue.
    if is_video {
        let ffmpeg = sidecar_path(&app, "ffmpeg")?;
        let ffprobe = sidecar_path(&app, "ffprobe")?;
        let selection = select_encoder(&ffmpeg, &ffprobe, current_platform());
        let backend =
            encoder_backend_for_request(request.options.prefer_hardware, selection.selected);
        let fallback = runtime_fallback_chain(&selection, backend);
        let font_path = if request.options.kind == "text" {
            Some(watermark_font_path(&app)?)
        } else {
            None
        };
        let progress_window = duration_seconds(&app, Path::new(&request.input_path))
            .ok()
            .map(|duration| (0.0, duration));
        let input_path = PathBuf::from(&request.input_path);
        let payload = WatermarkEncodePayload {
            request,
            fallback,
            font_path,
            ffmpeg,
            ffprobe,
            progress_window,
            input_path,
        };
        let directory = PathBuf::from(&payload.request.options.output_directory);
        let preferred_name = watermark_reserved_preferred_name(&payload.request, &directory);
        log::info!(
            "WATERMARK_ENQUEUE task_id={task_id} {}",
            watermark_render_diagnostics(&payload.request.options)
        );
        let final_output = queue
            .enqueue_with_reservation(task_id.clone(), payload, &directory, &preferred_name)
            .map_err(|error| match error {
                WatermarkQueueError::Shutdown => "水印队列已关闭".to_string(),
                other => format!("无法加入水印队列：{other:?}"),
            })?;
        return Ok(MediaTaskStarted {
            task_id,
            output_path: final_output.to_string_lossy().into_owned(),
        });
    }

    let final_output = watermark_output_path(&request);
    // GIF is not a static image; it keeps the legacy immediate orchestrate +
    // validate/finalize branch. Static images (PNG/JPG/WebP) use the plain
    // child path with a single frame.
    let legacy_is_video = !is_static_image(Path::new(&request.input_path));
    let (backend, fallback) = if legacy_is_video {
        let ffmpeg = sidecar_path(&app, "ffmpeg")?;
        let ffprobe = sidecar_path(&app, "ffprobe")?;
        let selection = select_encoder(&ffmpeg, &ffprobe, current_platform());
        (
            selection.selected,
            fallback_chain_from_selection(&selection),
        )
    } else {
        (EncoderBackend::Cpu, vec![EncoderBackend::Cpu])
    };
    if legacy_is_video {
        let progress = duration_seconds(&app, Path::new(&request.input_path))
            .ok()
            .map(|duration| (0.0, duration));
        spawn_media_task(
            app,
            registry,
            task_id,
            final_output.clone(),
            Vec::new(),
            progress,
            Vec::new(),
            Some(MediaFinalize {
                final_output,
                input: PathBuf::from(&request.input_path),
                validate: true,
            }),
            Some(WatermarkEncodeContext { request, fallback }),
        )
    } else {
        let (args, cleanup_paths) = watermark_ffmpeg_args(&app, &request, &final_output, backend)?;
        spawn_media_task(
            app,
            registry,
            task_id,
            final_output,
            args,
            None,
            cleanup_paths,
            None,
            None,
        )
    }
}

#[tauri::command]
pub fn cancel_gif_media_task(
    registry: tauri::State<'_, MediaTaskRegistry>,
    queue: tauri::State<'_, WatermarkVideoQueueCore<WatermarkEncodePayload>>,
    task_id: String,
) -> Result<(), String> {
    // Watermark video jobs live in the FIFO queue; waiting/status-tracking
    // tasks are cancelled there first, then fall back to the legacy registry.
    match queue.cancel(&task_id) {
        Ok(()) => return Ok(()),
        Err(WatermarkQueueError::TaskNotFound { .. }) => {}
        Err(error) => return Err(format!("无法取消水印任务：{error:?}")),
    }
    registry.cancel(&task_id)
}

// ---- 2C-1: AppHandle-free formal watermark video FIFO scheduler core ----
// Minimal business-specific scheduler. It owns no AppHandle, no FFmpeg, and no
// UI: callers inject a typed runner and a typed event sink. Concurrency is
// fixed at one running job; waiting jobs are strictly FIFO.

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum WatermarkJobStatus {
    Waiting,
    Probing,
    Processing,
    Fallback,
    Finalizing,
    Running,
    Completed,
    Failed,
    Cancelled,
}

/// Serializable lifecycle status emitted on `watermark-queue://status`. Kept
/// separate from `MediaTaskEvent` so GIF/legacy listeners stay unchanged.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatermarkQueueStatusEvent {
    pub task_id: String,
    pub status: WatermarkJobStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum WatermarkTerminal {
    Completed {
        output_path: String,
        output_bytes: u64,
    },
    Failed {
        message: String,
    },
    Cancelled,
}

#[derive(Clone, Debug, PartialEq)]
pub enum WatermarkQueueEvent {
    Status {
        task_id: String,
        status: WatermarkJobStatus,
        reason: Option<String>,
    },
    Progress {
        task_id: String,
        progress: f64,
    },
    Terminal {
        task_id: String,
        terminal: WatermarkTerminal,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum WatermarkQueueError {
    ReservedPathConflict { path: PathBuf },
    TaskNotFound { task_id: String },
    Shutdown,
}

#[derive(Clone, Debug)]
pub struct FrozenWatermarkJob<T> {
    pub task_id: String,
    pub payload: T,
    pub reserved_final: PathBuf,
    pub cancel: Arc<AtomicBool>,
}

/// Frozen production payload for one queued watermark video job. It carries
/// everything the worker needs to run FFmpeg without holding an `AppHandle`:
/// the full request (frozen), the resolved fallback chain (the selected backend
/// first, then the other verified hardware backends, then CPU), the resolved
/// sidecar and font paths, the input duration progress window, and the input
/// path used for output validation.
#[derive(Clone, Debug)]
pub struct WatermarkEncodePayload {
    pub request: WatermarkMediaTaskRequest,
    pub fallback: Vec<EncoderBackend>,
    pub font_path: Option<PathBuf>,
    pub ffmpeg: PathBuf,
    pub ffprobe: PathBuf,
    pub progress_window: Option<(f64, f64)>,
    pub input_path: PathBuf,
}

struct WatermarkQueueInner<T> {
    state: Mutex<WatermarkQueueState<T>>,
    condvar: Condvar,
}

struct WatermarkQueueState<T> {
    pending: VecDeque<FrozenWatermarkJob<T>>,
    states: HashMap<String, WatermarkJobStatus>,
    reserved: HashSet<PathBuf>,
    running_task_id: Option<String>,
    running_cancel: Option<Arc<AtomicBool>>,
    shutdown: bool,
}

/// The owned scheduler handle. The worker thread is spawned in
/// `start_watermark_video_queue` and lives until `shutdown`.
pub struct WatermarkVideoQueueCore<T> {
    inner: Arc<WatermarkQueueInner<T>>,
    sink: Arc<dyn Fn(WatermarkQueueEvent) + Send + Sync>,
    worker: Mutex<Option<std::thread::JoinHandle<()>>>,
    busy: Arc<AtomicBool>,
    before_start: Arc<Mutex<Option<Arc<dyn Fn() + Send + Sync>>>>,
}

pub fn start_watermark_video_queue<T, F>(
    sink: Arc<dyn Fn(WatermarkQueueEvent) + Send + Sync>,
    runner: F,
) -> WatermarkVideoQueueCore<T>
where
    T: Clone + Send + 'static,
    F: Fn(
            FrozenWatermarkJob<T>,
            Arc<dyn Fn(WatermarkQueueEvent) + Send + Sync>,
        ) -> WatermarkTerminal
        + Send
        + 'static,
{
    let inner = Arc::new(WatermarkQueueInner {
        state: Mutex::new(WatermarkQueueState {
            pending: VecDeque::new(),
            states: HashMap::new(),
            reserved: HashSet::new(),
            running_task_id: None,
            running_cancel: None,
            shutdown: false,
        }),
        condvar: Condvar::new(),
    });
    let busy = Arc::new(AtomicBool::new(false));
    let before_start = Arc::new(Mutex::new(None));

    let worker_inner = inner.clone();
    let worker_sink = sink.clone();
    let worker_busy = busy.clone();
    let worker_before_start = before_start.clone();
    let handle = std::thread::spawn(move || {
        run_watermark_queue_worker(
            worker_inner,
            worker_sink,
            worker_busy,
            worker_before_start,
            runner,
        )
    });

    WatermarkVideoQueueCore {
        inner,
        sink,
        worker: Mutex::new(Some(handle)),
        busy,
        before_start,
    }
}

fn run_watermark_queue_worker<T, F>(
    inner: Arc<WatermarkQueueInner<T>>,
    sink: Arc<dyn Fn(WatermarkQueueEvent) + Send + Sync>,
    busy: Arc<AtomicBool>,
    before_start: Arc<Mutex<Option<Arc<dyn Fn() + Send + Sync>>>>,
    runner: F,
) where
    T: Clone + Send + 'static,
    F: Fn(
        FrozenWatermarkJob<T>,
        Arc<dyn Fn(WatermarkQueueEvent) + Send + Sync>,
    ) -> WatermarkTerminal,
{
    loop {
        let job = {
            let mut state = inner.state.lock().expect("watermark queue poisoned");
            loop {
                if state.shutdown {
                    return;
                }
                if let Some(job) = state.pending.pop_front() {
                    state.running_task_id = Some(job.task_id.clone());
                    state.running_cancel = Some(job.cancel.clone());
                    state
                        .states
                        .insert(job.task_id.clone(), WatermarkJobStatus::Running);
                    break job;
                }
                state = inner.condvar.wait(state).expect("watermark queue poisoned");
            }
        };

        let task_id = job.task_id.clone();
        let reserved = job.reserved_final.clone();
        if let Some(before_start) = before_start
            .lock()
            .expect("watermark queue hook poisoned")
            .clone()
        {
            before_start();
        }
        busy.store(true, Ordering::SeqCst);
        (sink)(WatermarkQueueEvent::Status {
            task_id: task_id.clone(),
            status: WatermarkJobStatus::Running,
            reason: None,
        });

        let terminal = runner(job, sink.clone());
        let final_status = terminal_status(&terminal);

        {
            let mut state = inner.state.lock().expect("watermark queue poisoned");
            state.running_task_id = None;
            state.running_cancel = None;
            state.reserved.remove(&reserved);
            state.states.insert(task_id.clone(), final_status.clone());
            let has_pending = !state.pending.is_empty();
            busy.store(has_pending, Ordering::SeqCst);
        }
        inner.condvar.notify_all();
        (sink)(WatermarkQueueEvent::Terminal { task_id, terminal });
    }
}

fn terminal_status(terminal: &WatermarkTerminal) -> WatermarkJobStatus {
    match terminal {
        WatermarkTerminal::Completed { .. } => WatermarkJobStatus::Completed,
        WatermarkTerminal::Failed { .. } => WatermarkJobStatus::Failed,
        WatermarkTerminal::Cancelled => WatermarkJobStatus::Cancelled,
    }
}

impl<T: Clone + Send + 'static> WatermarkVideoQueueCore<T> {
    pub fn set_before_start_hook(&self, hook: Arc<dyn Fn() + Send + Sync>) {
        *self
            .before_start
            .lock()
            .expect("watermark queue hook poisoned") = Some(hook);
    }

    pub fn is_busy(&self) -> bool {
        self.busy.load(Ordering::SeqCst) || {
            let state = self.inner.state.lock().expect("watermark queue poisoned");
            !state.pending.is_empty() || state.running_task_id.is_some()
        }
    }

    pub fn busy_handle(&self) -> Arc<AtomicBool> {
        self.busy.clone()
    }

    /// Atomically pick a non-conflicting final output name and enqueue the job.
    /// The reserved set and the filesystem are both consulted while holding the
    /// queue lock, so two concurrent enqueues with the same basename get two
    /// distinct names and never overwrite each other.
    pub fn enqueue_with_reservation(
        &self,
        task_id: String,
        payload: T,
        directory: &Path,
        preferred_name: &str,
    ) -> Result<PathBuf, WatermarkQueueError> {
        let reserved_final = {
            let mut state = self.inner.state.lock().expect("watermark queue poisoned");
            if state.shutdown {
                return Err(WatermarkQueueError::Shutdown);
            }
            let stem = Path::new(preferred_name)
                .file_stem()
                .and_then(|v| v.to_str())
                .unwrap_or("watermarked");
            let extension = Path::new(preferred_name)
                .extension()
                .and_then(|v| v.to_str())
                .unwrap_or("mp4");
            let reserved_final = {
                let candidate = directory.join(preferred_name);
                if !candidate.exists() && !state.reserved.contains(&candidate) {
                    candidate
                } else {
                    let mut index = 2;
                    loop {
                        let candidate = directory.join(format!("{stem}_{index}.{extension}"));
                        if !candidate.exists() && !state.reserved.contains(&candidate) {
                            break candidate;
                        }
                        index += 1;
                    }
                }
            };
            state.reserved.insert(reserved_final.clone());
            self.busy.store(true, Ordering::SeqCst);
            state
                .states
                .insert(task_id.clone(), WatermarkJobStatus::Waiting);
            let job = FrozenWatermarkJob {
                task_id: task_id.clone(),
                payload: payload.clone(),
                reserved_final: reserved_final.clone(),
                cancel: Arc::new(AtomicBool::new(false)),
            };
            state.pending.push_back(job);
            reserved_final
        };
        self.inner.condvar.notify_one();
        (self.sink)(WatermarkQueueEvent::Status {
            task_id,
            status: WatermarkJobStatus::Waiting,
            reason: None,
        });
        Ok(reserved_final)
    }

    pub fn enqueue(
        &self,
        task_id: String,
        payload: T,
        reserved_final: PathBuf,
    ) -> Result<(), WatermarkQueueError> {
        let job = FrozenWatermarkJob {
            task_id: task_id.clone(),
            payload: payload.clone(),
            reserved_final: reserved_final.clone(),
            cancel: Arc::new(AtomicBool::new(false)),
        };
        {
            let mut state = self.inner.state.lock().expect("watermark queue poisoned");
            if state.shutdown {
                return Err(WatermarkQueueError::Shutdown);
            }
            if state.reserved.contains(&reserved_final) {
                return Err(WatermarkQueueError::ReservedPathConflict {
                    path: reserved_final,
                });
            }
            state.reserved.insert(reserved_final);
            self.busy.store(true, Ordering::SeqCst);
            state
                .states
                .insert(task_id.clone(), WatermarkJobStatus::Waiting);
            state.pending.push_back(job);
        }
        self.inner.condvar.notify_one();
        (self.sink)(WatermarkQueueEvent::Status {
            task_id,
            status: WatermarkJobStatus::Waiting,
            reason: None,
        });
        Ok(())
    }

    pub fn cancel(&self, task_id: &str) -> Result<(), WatermarkQueueError> {
        let mut state = self.inner.state.lock().expect("watermark queue poisoned");
        let current = state.states.get(task_id).cloned();
        let emit_cancelled = match current {
            None => {
                return Err(WatermarkQueueError::TaskNotFound {
                    task_id: task_id.to_string(),
                })
            }
            Some(
                WatermarkJobStatus::Completed
                | WatermarkJobStatus::Failed
                | WatermarkJobStatus::Cancelled,
            ) => false,
            Some(WatermarkJobStatus::Waiting) => {
                if let Some(pos) = state.pending.iter().position(|j| j.task_id == task_id) {
                    let job = state.pending.remove(pos).expect("job must exist");
                    state.reserved.remove(&job.reserved_final);
                    if state.pending.is_empty() && state.running_task_id.is_none() {
                        self.busy.store(false, Ordering::SeqCst);
                    }
                    state
                        .states
                        .insert(task_id.to_string(), WatermarkJobStatus::Cancelled);
                    true
                } else {
                    return Err(WatermarkQueueError::TaskNotFound {
                        task_id: task_id.to_string(),
                    });
                }
            }
            Some(
                WatermarkJobStatus::Running
                | WatermarkJobStatus::Probing
                | WatermarkJobStatus::Processing
                | WatermarkJobStatus::Fallback
                | WatermarkJobStatus::Finalizing,
            ) => {
                if let Some(cancel) = &state.running_cancel {
                    cancel.store(true, Ordering::SeqCst);
                }
                false
            }
        };
        drop(state);
        if emit_cancelled {
            self.inner.condvar.notify_all();
            (self.sink)(WatermarkQueueEvent::Terminal {
                task_id: task_id.to_string(),
                terminal: WatermarkTerminal::Cancelled,
            });
        }
        Ok(())
    }

    pub fn shutdown(&self) {
        let waiting = {
            let mut state = self.inner.state.lock().expect("watermark queue poisoned");
            state.shutdown = true;
            let mut waiting = Vec::new();
            while let Some(job) = state.pending.pop_front() {
                state.reserved.remove(&job.reserved_final);
                state
                    .states
                    .insert(job.task_id.clone(), WatermarkJobStatus::Cancelled);
                waiting.push(job.task_id.clone());
            }
            if let Some(cancel) = &state.running_cancel {
                cancel.store(true, Ordering::SeqCst);
            }
            waiting
        };
        self.inner.condvar.notify_all();
        for task_id in waiting {
            (self.sink)(WatermarkQueueEvent::Terminal {
                task_id,
                terminal: WatermarkTerminal::Cancelled,
            });
        }
        if let Some(handle) = self.worker.lock().expect("watermark queue poisoned").take() {
            let _ = handle.join();
        }
        self.busy.store(false, Ordering::SeqCst);
    }
}

// ---- 2C-3: independent low-priority single-frame video preview scheduler ----

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatermarkPreviewRequest {
    pub task_id: String,
    pub input_path: String,
    pub temp_directory: String,
    pub kind: String,
    pub text: String,
    pub image_path: Option<String>,
    pub position: String,
    pub size_percent: u32,
    pub opacity: f64,
    #[serde(default)]
    pub pattern: Option<String>,
    #[serde(default)]
    pub density: Option<String>,
    #[serde(default)]
    pub angle: Option<i32>,
    #[serde(default)]
    pub offset_x: Option<f64>,
    #[serde(default)]
    pub offset_y: Option<f64>,
    #[serde(default)]
    pub columns: Option<u32>,
    #[serde(default)]
    pub rows: Option<u32>,
    #[serde(default)]
    pub placements: Option<Vec<WatermarkPlacement>>,
    #[serde(default)]
    pub text_style: Option<String>,
    #[serde(default)]
    pub clean_frame: Option<bool>,
    pub timestamp_seconds: Option<f64>,
    pub width: Option<u32>,
    pub duration: Option<f64>,
    #[serde(skip)]
    pub ffmpeg_path: Option<PathBuf>,
    #[serde(skip)]
    pub ffprobe_path: Option<PathBuf>,
    #[serde(skip)]
    pub font_path: Option<PathBuf>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatermarkPreviewStarted {
    pub task_id: String,
    pub output_path: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WatermarkPreviewStatus {
    Waiting,
    Processing,
    Completed,
    Failed,
    Cancelled,
    RejectedBusy,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatermarkPreviewStatusEvent {
    pub task_id: String,
    pub status: WatermarkPreviewStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum WatermarkPreviewStartError {
    RejectedBusy,
    Shutdown,
    InvalidRequest(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum WatermarkPreviewTerminal {
    Completed { output_path: PathBuf },
    Failed { message: String },
    Cancelled,
}

#[derive(Clone, Debug)]
pub struct FrozenWatermarkPreviewJob {
    task_id: String,
    payload: WatermarkPreviewRequest,
    output_path: PathBuf,
    cancel: Arc<AtomicBool>,
}

#[derive(Default)]
struct WatermarkPreviewState {
    pending: Option<FrozenWatermarkPreviewJob>,
    running: Option<(String, Arc<AtomicBool>, PathBuf)>,
    statuses: HashMap<String, WatermarkPreviewStatus>,
    completed_path: Option<PathBuf>,
    shutdown: bool,
}

struct WatermarkPreviewInner {
    state: Mutex<WatermarkPreviewState>,
    condvar: Condvar,
}

pub struct WatermarkPreviewQueueCore {
    inner: Arc<WatermarkPreviewInner>,
    sink: Arc<dyn Fn(WatermarkPreviewStatusEvent) + Send + Sync>,
    worker: Mutex<Option<std::thread::JoinHandle<()>>>,
    formal_busy: Arc<AtomicBool>,
}

#[derive(Clone)]
pub struct WatermarkPreviewControl {
    inner: Arc<WatermarkPreviewInner>,
    sink: Arc<dyn Fn(WatermarkPreviewStatusEvent) + Send + Sync>,
}

pub fn start_watermark_preview_queue_with_runner(
    sink: Arc<dyn Fn(WatermarkPreviewStatusEvent) + Send + Sync>,
    runner: Arc<dyn Fn(FrozenWatermarkPreviewJob) -> WatermarkPreviewTerminal + Send + Sync>,
    formal_busy: Arc<AtomicBool>,
) -> WatermarkPreviewQueueCore {
    let inner = Arc::new(WatermarkPreviewInner {
        state: Mutex::new(WatermarkPreviewState::default()),
        condvar: Condvar::new(),
    });
    let worker_inner = inner.clone();
    let worker_sink = sink.clone();
    let worker_runner = runner.clone();
    let handle = std::thread::spawn(move || {
        run_watermark_preview_worker(worker_inner, worker_sink, worker_runner)
    });
    WatermarkPreviewQueueCore {
        inner,
        sink,
        worker: Mutex::new(Some(handle)),
        formal_busy,
    }
}

fn emit_preview_terminal(
    sink: &Arc<dyn Fn(WatermarkPreviewStatusEvent) + Send + Sync>,
    task_id: &str,
    terminal: &WatermarkPreviewTerminal,
) {
    let (status, output_path, message) = match terminal {
        WatermarkPreviewTerminal::Completed { output_path } => (
            WatermarkPreviewStatus::Completed,
            Some(output_path.to_string_lossy().into_owned()),
            None,
        ),
        WatermarkPreviewTerminal::Failed { message } => {
            (WatermarkPreviewStatus::Failed, None, Some(message.clone()))
        }
        WatermarkPreviewTerminal::Cancelled => (WatermarkPreviewStatus::Cancelled, None, None),
    };
    (sink)(WatermarkPreviewStatusEvent {
        task_id: task_id.to_string(),
        status,
        output_path,
        message,
    });
}

fn run_watermark_preview_worker(
    inner: Arc<WatermarkPreviewInner>,
    sink: Arc<dyn Fn(WatermarkPreviewStatusEvent) + Send + Sync>,
    runner: Arc<dyn Fn(FrozenWatermarkPreviewJob) -> WatermarkPreviewTerminal + Send + Sync>,
) {
    loop {
        let job = {
            let mut state = inner.state.lock().expect("watermark preview poisoned");
            loop {
                if state.shutdown {
                    return;
                }
                if let Some(job) = state.pending.take() {
                    state.running = Some((
                        job.task_id.clone(),
                        job.cancel.clone(),
                        job.output_path.clone(),
                    ));
                    state
                        .statuses
                        .insert(job.task_id.clone(), WatermarkPreviewStatus::Processing);
                    break job;
                }
                state = inner
                    .condvar
                    .wait(state)
                    .expect("watermark preview poisoned");
            }
        };

        (sink)(WatermarkPreviewStatusEvent {
            task_id: job.task_id.clone(),
            status: WatermarkPreviewStatus::Processing,
            output_path: None,
            message: None,
        });
        let terminal = runner(job.clone());
        let task_id = job.task_id.clone();
        let terminal_status = match &terminal {
            WatermarkPreviewTerminal::Completed { .. } => WatermarkPreviewStatus::Completed,
            WatermarkPreviewTerminal::Failed { .. } => WatermarkPreviewStatus::Failed,
            WatermarkPreviewTerminal::Cancelled => WatermarkPreviewStatus::Cancelled,
        };
        {
            let mut state = inner.state.lock().expect("watermark preview poisoned");
            state.running = None;
            state.statuses.insert(task_id.clone(), terminal_status);
            if let WatermarkPreviewTerminal::Completed { output_path } = &terminal {
                if state.shutdown {
                    let _ = fs::remove_file(output_path);
                } else if let Some(previous) = state.completed_path.replace(output_path.clone()) {
                    if previous != *output_path {
                        let _ = fs::remove_file(previous);
                    }
                }
            }
        }
        inner.condvar.notify_all();
        emit_preview_terminal(&sink, &task_id, &terminal);
    }
}

impl WatermarkPreviewQueueCore {
    pub fn control(&self) -> WatermarkPreviewControl {
        WatermarkPreviewControl {
            inner: self.inner.clone(),
            sink: self.sink.clone(),
        }
    }

    pub fn start(
        &self,
        request: WatermarkPreviewRequest,
    ) -> Result<WatermarkPreviewStarted, WatermarkPreviewStartError> {
        if self.formal_busy.load(Ordering::SeqCst) {
            (self.sink)(WatermarkPreviewStatusEvent {
                task_id: request.task_id.clone(),
                status: WatermarkPreviewStatus::RejectedBusy,
                output_path: None,
                message: Some("正式视频任务正在排队或处理".into()),
            });
            return Err(WatermarkPreviewStartError::RejectedBusy);
        }
        let output_path = preview_temp_path(&request)?;
        let job = FrozenWatermarkPreviewJob {
            task_id: request.task_id.clone(),
            payload: request.clone(),
            output_path: output_path.clone(),
            cancel: Arc::new(AtomicBool::new(false)),
        };
        let mut cancelled = None;
        {
            let mut state = self.inner.state.lock().expect("watermark preview poisoned");
            if state.shutdown {
                return Err(WatermarkPreviewStartError::Shutdown);
            }
            if let Some(previous) = state.pending.replace(job) {
                state
                    .statuses
                    .insert(previous.task_id.clone(), WatermarkPreviewStatus::Cancelled);
                let _ = fs::remove_file(previous.output_path);
                cancelled = Some(previous.task_id);
            }
            if let Some((_, cancel, _)) = &state.running {
                cancel.store(true, Ordering::SeqCst);
            }
            state
                .statuses
                .insert(request.task_id.clone(), WatermarkPreviewStatus::Waiting);
        }
        if let Some(task_id) = cancelled {
            (self.sink)(WatermarkPreviewStatusEvent {
                task_id,
                status: WatermarkPreviewStatus::Cancelled,
                output_path: None,
                message: None,
            });
        }
        (self.sink)(WatermarkPreviewStatusEvent {
            task_id: request.task_id.clone(),
            status: WatermarkPreviewStatus::Waiting,
            output_path: Some(output_path.to_string_lossy().into_owned()),
            message: None,
        });
        self.inner.condvar.notify_one();
        Ok(WatermarkPreviewStarted {
            task_id: request.task_id,
            output_path: output_path.to_string_lossy().into_owned(),
        })
    }

    pub fn cancel(&self, task_id: &str) -> Result<(), String> {
        self.control().cancel(task_id)
    }

    pub fn shutdown(&self) {
        self.control().shutdown();
        if let Some(handle) = self
            .worker
            .lock()
            .expect("watermark preview poisoned")
            .take()
        {
            let _ = handle.join();
        }
    }
}

impl WatermarkPreviewControl {
    pub fn cancel(&self, task_id: &str) -> Result<(), String> {
        let mut state = self.inner.state.lock().expect("watermark preview poisoned");
        if let Some((running_task, cancel, _)) = &state.running {
            if running_task == task_id {
                cancel.store(true, Ordering::SeqCst);
                return Ok(());
            }
        }
        if state
            .pending
            .as_ref()
            .is_some_and(|job| job.task_id == task_id)
        {
            let job = state.pending.take().expect("preview pending job exists");
            state
                .statuses
                .insert(task_id.to_string(), WatermarkPreviewStatus::Cancelled);
            drop(state);
            let _ = fs::remove_file(job.output_path);
            (self.sink)(WatermarkPreviewStatusEvent {
                task_id: task_id.to_string(),
                status: WatermarkPreviewStatus::Cancelled,
                output_path: None,
                message: None,
            });
            return Ok(());
        }
        if matches!(
            state.statuses.get(task_id),
            Some(WatermarkPreviewStatus::Completed)
                | Some(WatermarkPreviewStatus::Failed)
                | Some(WatermarkPreviewStatus::Cancelled)
        ) {
            return Ok(());
        }
        Err("未找到水印预览任务".into())
    }

    pub fn cancel_and_wait(&self) {
        let mut cancelled_pending = None;
        {
            let mut state = self.inner.state.lock().expect("watermark preview poisoned");
            if let Some(job) = state.pending.take() {
                state
                    .statuses
                    .insert(job.task_id.clone(), WatermarkPreviewStatus::Cancelled);
                cancelled_pending = Some(job.task_id);
            }
            if let Some((_, cancel, _)) = &state.running {
                cancel.store(true, Ordering::SeqCst);
            }
            while state.running.is_some() {
                state = self
                    .inner
                    .condvar
                    .wait(state)
                    .expect("watermark preview poisoned");
            }
        }
        if let Some(task_id) = cancelled_pending {
            (self.sink)(WatermarkPreviewStatusEvent {
                task_id,
                status: WatermarkPreviewStatus::Cancelled,
                output_path: None,
                message: None,
            });
        }
    }

    pub fn shutdown(&self) {
        let mut pending = None;
        let completed;
        {
            let mut state = self.inner.state.lock().expect("watermark preview poisoned");
            state.shutdown = true;
            if let Some(job) = state.pending.take() {
                state
                    .statuses
                    .insert(job.task_id.clone(), WatermarkPreviewStatus::Cancelled);
                pending = Some(job.task_id);
            }
            completed = state.completed_path.take();
            if let Some((_, cancel, _)) = &state.running {
                cancel.store(true, Ordering::SeqCst);
            }
            self.inner.condvar.notify_all();
        }
        if let Some(path) = completed {
            let _ = fs::remove_file(path);
        }
        if let Some(task_id) = pending {
            (self.sink)(WatermarkPreviewStatusEvent {
                task_id,
                status: WatermarkPreviewStatus::Cancelled,
                output_path: None,
                message: None,
            });
        }
    }
}

fn preview_temp_path(
    request: &WatermarkPreviewRequest,
) -> Result<PathBuf, WatermarkPreviewStartError> {
    let directory = Path::new(&request.temp_directory);
    if !directory.is_dir() {
        fs::create_dir_all(directory).map_err(|error| {
            WatermarkPreviewStartError::InvalidRequest(format!("无法创建预览临时目录：{error}"))
        })?;
    }
    let safe_id: String = request
        .task_id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect();
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    Ok(directory.join(format!("watermark-preview-{safe_id}-{nonce}.png")))
}

fn watermark_preview_args(
    font_path: Option<&Path>,
    request: &WatermarkPreviewRequest,
    output: &Path,
    source_size: Option<(u32, u32)>,
) -> Result<(Vec<OsString>, Vec<PathBuf>), String> {
    if request.clean_frame == Some(true) {
        let mut args = vec![
            OsString::from("-hide_banner"),
            OsString::from("-nostdin"),
            OsString::from("-y"),
        ];
        if let Some(timestamp) = request.timestamp_seconds {
            args.extend([
                OsString::from("-ss"),
                OsString::from(timestamp.max(0.0).to_string()),
            ]);
        }
        args.extend([OsString::from("-i"), OsString::from(&request.input_path)]);
        if let Some(width) = request.width.filter(|width| *width > 0) {
            args.extend([
                OsString::from("-vf"),
                OsString::from(format!("scale={width}:-2:flags=lanczos")),
            ]);
        }
        args.extend([
            OsString::from("-frames:v"),
            OsString::from("1"),
            OsString::from("-map"),
            OsString::from("0:v:0"),
            OsString::from("-f"),
            OsString::from("image2"),
            output.as_os_str().to_owned(),
        ]);
        return Ok((args, Vec::new()));
    }
    if request.kind != "text" && request.kind != "image" {
        return Err("水印预览仅支持文字或 Logo".into());
    }
    if request.pattern.as_deref() == Some("staggered") {
        return Err("视频预览暂不支持错位平铺".into());
    }
    let watermark_request = WatermarkMediaTaskRequest {
        task_id: request.task_id.clone(),
        input_path: request.input_path.clone(),
        options: WatermarkOptions {
            kind: request.kind.clone(),
            text: request.text.clone(),
            image_path: request.image_path.clone(),
            position: request.position.clone(),
            size_percent: request.size_percent,
            opacity: request.opacity,
            pattern: request.pattern.clone(),
            density: request.density.clone(),
            angle: request.angle,
            dark_mode: None,
            offset_x: request.offset_x,
            offset_y: request.offset_y,
            columns: request.columns,
            rows: request.rows,
            placements: request.placements.clone(),
            quality: None,
            prefer_hardware: None,
            text_style: request.text_style.clone(),
            reserved_output_path: None,
            output_directory: request.temp_directory.clone(),
        },
    };
    let (filter, cleanup) = watermark_filter_with_font(font_path, &watermark_request, source_size)?;
    let mut args = vec![
        OsString::from("-hide_banner"),
        OsString::from("-nostdin"),
        OsString::from("-y"),
    ];
    if let Some(timestamp) = request.timestamp_seconds {
        args.extend([
            OsString::from("-ss"),
            OsString::from(timestamp.max(0.0).to_string()),
        ]);
    }
    args.extend([OsString::from("-i"), OsString::from(&request.input_path)]);
    if request.kind == "image" {
        args.extend([
            OsString::from("-i"),
            OsString::from(request.image_path.clone().unwrap_or_default()),
        ]);
    }
    let mut filter = filter;
    if let Some(width) = request.width.filter(|width| *width > 0) {
        filter.push_str(&format!(
            ";[watermarked]scale={width}:-2:flags=lanczos[preview]"
        ));
    } else {
        filter.push_str(";[watermarked]null[preview]");
    }
    args.extend([
        OsString::from("-frames:v"),
        OsString::from("1"),
        OsString::from("-filter_complex"),
        OsString::from(filter),
        OsString::from("-map"),
        OsString::from("[preview]"),
        OsString::from("-f"),
        OsString::from("image2"),
        output.as_os_str().to_owned(),
    ]);
    Ok((args, cleanup))
}

fn run_watermark_preview_job(job: FrozenWatermarkPreviewJob) -> WatermarkPreviewTerminal {
    let input = PathBuf::from(&job.payload.input_path);
    if !is_video_media(&input) || !input.is_file() {
        return WatermarkPreviewTerminal::Failed {
            message: "预览输入必须是可访问的视频文件".into(),
        };
    }
    let ffmpeg = match job.payload.ffmpeg_path.clone() {
        Some(path) if path.is_file() => path,
        _ => {
            return WatermarkPreviewTerminal::Failed {
                message: "内置 ffmpeg 未找到".into(),
            }
        }
    };
    let ffprobe = match job.payload.ffprobe_path.clone() {
        Some(path) if path.is_file() => path,
        _ => {
            return WatermarkPreviewTerminal::Failed {
                message: "内置 ffprobe 未找到".into(),
            }
        }
    };
    let font = if job.payload.kind == "text" {
        job.payload.font_path.clone()
    } else {
        None
    };
    // Resolve the source frame size so the outlined text style can emit a
    // concrete integer drawtext `borderw` (drawtext `borderw` is an int, not an
    // expression). A probe failure keeps the preview working for the legacy
    // white/black styles, which need no border width.
    let source_size = if job.payload.kind == "text" {
        probe_video(&ffprobe, &input)
            .ok()
            .map(|probe| (probe.width, probe.height))
    } else {
        None
    };
    let (args, cleanup) = match watermark_preview_args(
        font.as_deref(),
        &job.payload,
        &job.output_path,
        source_size,
    ) {
        Ok(value) => value,
        Err(message) => return WatermarkPreviewTerminal::Failed { message },
    };
    let (terminal, _stderr) = run_watermark_process_with_hooks(
        &ffmpeg,
        &ffprobe,
        &args,
        &job.output_path,
        None,
        &job.cancel,
        None,
        &mut |_| {},
        &mut || {},
    );
    for path in cleanup {
        let _ = fs::remove_file(path);
    }
    match terminal {
        MediaTerminal::Cancelled => WatermarkPreviewTerminal::Cancelled,
        MediaTerminal::Failed { message } => WatermarkPreviewTerminal::Failed { message },
        MediaTerminal::Completed { .. } => {
            let probe = bundled_command(&ffprobe)
                .args([
                    "-v",
                    "error",
                    "-select_streams",
                    "v:0",
                    "-show_entries",
                    "stream=codec_name,width,height",
                    "-of",
                    "json",
                ])
                .arg(&job.output_path)
                .output();
            let is_png = matches!(probe, Ok(output) if output.status.success()
                && String::from_utf8_lossy(&output.stdout).contains("png"));
            if is_png {
                WatermarkPreviewTerminal::Completed {
                    output_path: job.output_path,
                }
            } else {
                remove_incomplete_output(&job.output_path);
                WatermarkPreviewTerminal::Failed {
                    message: "预览输出不是有效 PNG".into(),
                }
            }
        }
    }
}

pub fn start_watermark_preview_queue(
    app: AppHandle,
    formal_busy: Arc<AtomicBool>,
) -> WatermarkPreviewQueueCore {
    let app_for_sink = app.clone();
    let sink: Arc<dyn Fn(WatermarkPreviewStatusEvent) + Send + Sync> = Arc::new(move |event| {
        let _ = app_for_sink.emit(WATERMARK_PREVIEW_STATUS_EVENT, event);
    });
    start_watermark_preview_queue_with_runner(
        sink,
        Arc::new(run_watermark_preview_job),
        formal_busy,
    )
}

#[tauri::command]
pub fn start_watermark_preview(
    app: AppHandle,
    queue: tauri::State<'_, WatermarkPreviewQueueCore>,
    mut request: WatermarkPreviewRequest,
) -> Result<WatermarkPreviewStarted, String> {
    let input = Path::new(&request.input_path);
    if !is_video_media(input) || !input.is_file() {
        return Err("水印预览输入必须是可访问的 MP4 或 MOV 视频".into());
    }
    if request.kind == "image"
        && request
            .image_path
            .as_deref()
            .is_none_or(|path| path.is_empty())
    {
        return Err("Logo 预览缺少图片素材".into());
    }
    if !matches!(request.kind.as_str(), "text" | "image") {
        return Err("水印预览仅支持文字或 Logo".into());
    }
    let pattern = request.pattern.as_deref().unwrap_or("single");
    if !matches!(pattern, "single" | "tiled") {
        return Err("视频预览暂不支持错位平铺".into());
    }
    request.pattern = Some(pattern.to_string());
    if let Some(width) = request.width {
        request.width = Some(width.saturating_sub(width % 2).max(2));
    }
    if let Some(duration) = request
        .duration
        .filter(|duration| duration.is_finite() && *duration > 0.0)
    {
        request.timestamp_seconds = Some(
            request
                .timestamp_seconds
                .unwrap_or(0.0)
                .max(0.0)
                .min(duration),
        );
    }
    let preview_root = app
        .path()
        .resolve("watermark-preview", tauri::path::BaseDirectory::AppCache)
        .map_err(|error| format!("无法解析应用缓存目录：{error}"))?;
    fs::create_dir_all(&preview_root).map_err(|error| format!("无法创建预览缓存目录：{error}"))?;
    request.temp_directory = preview_root.to_string_lossy().into_owned();
    request.ffmpeg_path = Some(sidecar_path(&app, "ffmpeg")?);
    request.ffprobe_path = Some(sidecar_path(&app, "ffprobe")?);
    request.font_path = if request.kind == "text" {
        Some(watermark_font_path(&app)?)
    } else {
        None
    };
    queue.start(request).map_err(|error| match error {
        WatermarkPreviewStartError::RejectedBusy => "正式视频任务正在排队或处理".into(),
        WatermarkPreviewStartError::Shutdown => "水印预览队列已关闭".into(),
        WatermarkPreviewStartError::InvalidRequest(message) => message,
    })
}

#[tauri::command]
pub fn cancel_watermark_preview(
    queue: tauri::State<'_, WatermarkPreviewQueueCore>,
    task_id: String,
) -> Result<(), String> {
    queue.cancel(&task_id)
}

/// Production runner for the FIFO core: builds args for each backend, runs the
/// 2B orchestrator and 2A process/finalizer, and emits the full lifecycle
/// (Probing/Processing/Fallback/Finalizing/progress) through the typed sink.
fn run_watermark_production_job(
    job: FrozenWatermarkJob<WatermarkEncodePayload>,
    emit: Arc<dyn Fn(WatermarkQueueEvent) + Send + Sync>,
) -> WatermarkTerminal {
    let payload = &job.payload;
    let task_id = job.task_id.clone();
    log::info!(
        "WATERMARK_RUN task_id={task_id} {}",
        watermark_render_diagnostics(&payload.request.options)
    );
    (emit)(WatermarkQueueEvent::Status {
        task_id: task_id.clone(),
        status: WatermarkJobStatus::Probing,
        reason: None,
    });
    (emit)(WatermarkQueueEvent::Status {
        task_id: task_id.clone(),
        status: WatermarkJobStatus::Processing,
        reason: None,
    });

    let finalize = MediaFinalize {
        final_output: job.reserved_final.clone(),
        input: payload.input_path.clone(),
        validate: true,
    };
    let mut collected_cleanup: Vec<PathBuf> = Vec::new();
    let mut last_progress: f64 = 0.0;

    // Resolve the source frame size once so the outlined text style can emit a
    // concrete integer drawtext `borderw` (drawtext `borderw` is an int, not an
    // expression). The dense path pre-renders through
    // `generate_text_watermark_overlay`, which probes internally; this probe
    // covers the single/legacy text encodes that still build the filter graph
    // directly.
    let source_size = if payload.request.options.kind == "text"
        && !uses_dense_text_overlay(&payload.request.options)
    {
        probe_video(&payload.ffprobe, &payload.input_path)
            .ok()
            .map(|probe| (probe.width, probe.height))
    } else {
        None
    };

    // Dense text placements (brick/tiled, >1 placement) previously chained one
    // overlay per placement for every frame. Pre-render them once into a single
    // transparent PNG, then overlay it once per frame. Single text and Logo
    // paths stay on the existing filter graph. A failed pre-render is a hard
    // error — we never silently fall back to the N-overlay slow path.
    let overlay_asset = if uses_dense_text_overlay(&payload.request.options) {
        match generate_text_watermark_overlay(
            &payload.ffmpeg,
            &payload.ffprobe,
            &payload.request,
            payload.font_path.as_deref(),
        ) {
            Ok(path) => {
                collected_cleanup.push(path.clone());
                Some(path)
            }
            Err(message) => {
                return WatermarkTerminal::Failed { message };
            }
        }
    } else {
        None
    };

    let terminal = orchestrate_watermark_encode_chain(
        &payload.fallback,
        |backend| {
            if job.cancel.load(std::sync::atomic::Ordering::SeqCst) {
                return (MediaTerminal::Cancelled, String::new());
            }
            let temp = video_watermark_temp_path(&finalize.final_output);
            match watermark_ffmpeg_args_with_font(
                payload.font_path.as_deref(),
                &payload.request,
                &temp,
                backend,
                overlay_asset.as_deref(),
                source_size,
            ) {
                Ok((args, cleanup)) => {
                    collected_cleanup.extend(cleanup);
                    run_watermark_process_with_hooks(
                        &payload.ffmpeg,
                        &payload.ffprobe,
                        &args,
                        &temp,
                        Some(&finalize),
                        &job.cancel,
                        payload.progress_window,
                        &mut |p| {
                            let clamped = p.clamp(0.0, 0.99);
                            if clamped > last_progress {
                                last_progress = clamped;
                            }
                            (emit)(WatermarkQueueEvent::Progress {
                                task_id: task_id.clone(),
                                progress: last_progress,
                            });
                        },
                        &mut || {
                            (emit)(WatermarkQueueEvent::Status {
                                task_id: task_id.clone(),
                                status: WatermarkJobStatus::Finalizing,
                                reason: None,
                            });
                        },
                    )
                }
                Err(message) => (MediaTerminal::Failed { message }, String::new()),
            }
        },
        &mut || {
            (emit)(WatermarkQueueEvent::Status {
                task_id: task_id.clone(),
                status: WatermarkJobStatus::Fallback,
                reason: Some("硬件加速不可用，已切换兼容模式".to_string()),
            });
        },
    );

    for path in collected_cleanup {
        let _ = fs::remove_file(path);
    }

    match terminal {
        MediaTerminal::Completed {
            output_path,
            output_bytes,
        } => WatermarkTerminal::Completed {
            output_path,
            output_bytes,
        },
        MediaTerminal::Failed { message } => WatermarkTerminal::Failed { message },
        MediaTerminal::Cancelled => WatermarkTerminal::Cancelled,
    }
}

/// Build the application-wide watermark video queue. The returned handle is
/// Send + Sync and can be stored in Tauri managed state. The event sink adapts
/// queue lifecycle events to the existing `gif-media://task` protocol plus a
/// dedicated status channel for the richer Waiting/Probing/Processing/Fallback/
/// Finalizing lifecycle.
pub fn start_watermark_production_queue(
    app: AppHandle,
) -> WatermarkVideoQueueCore<WatermarkEncodePayload> {
    let app_for_sink = app.clone();
    let sink: Arc<dyn Fn(WatermarkQueueEvent) + Send + Sync> = Arc::new(move |event| match event {
        WatermarkQueueEvent::Progress { task_id, progress } => {
            emit(
                &app_for_sink,
                MediaTaskEvent::Progress { task_id, progress },
            );
        }
        WatermarkQueueEvent::Status {
            task_id,
            status,
            reason,
        } => {
            let _ = app_for_sink.emit(
                WATERMARK_QUEUE_STATUS_EVENT,
                WatermarkQueueStatusEvent {
                    task_id,
                    status,
                    reason,
                },
            );
        }
        WatermarkQueueEvent::Terminal { task_id, terminal } => match terminal {
            WatermarkTerminal::Completed {
                output_path,
                output_bytes,
            } => emit(
                &app_for_sink,
                MediaTaskEvent::Completed {
                    task_id,
                    output_path,
                    output_bytes,
                },
            ),
            WatermarkTerminal::Failed { message } => {
                emit(&app_for_sink, MediaTaskEvent::Failed { task_id, message })
            }
            WatermarkTerminal::Cancelled => {
                emit(&app_for_sink, MediaTaskEvent::Cancelled { task_id })
            }
        },
    });
    let runner = move |job: FrozenWatermarkJob<WatermarkEncodePayload>,
                       emit: Arc<dyn Fn(WatermarkQueueEvent) + Send + Sync>| {
        run_watermark_production_job(job, emit)
    };
    start_watermark_video_queue(sink, runner)
}

// ---- Chroma Key types (reserved for multi-language template) ----

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChromaKeyOptions {
    pub mode: String, // "disabled" | "green" | "blue" | "custom"
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub similarity: Option<f64>,
    #[serde(default)]
    pub blend: Option<f64>,
    #[serde(default)]
    pub invert: Option<bool>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateGifComposeRequest {
    pub task_id: String,
    pub video_path: String,
    pub template_paths: Vec<String>,
    pub output_directory: String,
    pub start_seconds: f64,
    pub end_seconds: f64,
    pub fit_mode: String, // "cover" | "contain"
    pub chroma_key: ChromaKeyOptions,
    pub compression: TemplateCompressionOptions,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateCompressionOptions {
    pub target_bytes: u64,
    pub preference: String,
    pub min_width: Option<u32>,
    pub min_fps: Option<u32>,
    pub allow_strong_compression: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateGifComposeResult {
    pub task_id: String,
    pub outputs: Vec<TemplateOutput>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateOutput {
    pub template_path: String,
    pub output_path: String,
    pub output_bytes: u64,
}

/// Build FFmpeg filter for chroma key compositing.
/// Inputs: [0:v] template PNG, [1:v] video
/// Output: composited frame with video in chroma key areas
fn chroma_key_filter(
    template_w: u32,
    template_h: u32,
    color_hex: &str,
    fit_mode: &str,
    similarity: f64,
    blend: f64,
) -> String {
    let color = color_hex.trim_start_matches('#');
    let fit = if fit_mode == "contain" {
        format!("scale={template_w}:{template_h}:force_original_aspect_ratio=decrease")
    } else {
        format!("scale={template_w}:{template_h}:force_original_aspect_ratio=increase,crop={template_w}:{template_h}")
    };

    format!(
        "[0:v]colorkey=0x{color}:{similarity}:{blend}[tk];         [tk]split[tm][ta];         [ta]alphaextract[mask];         [1:v]{fit}[vs];         [vs][mask]alphamerge[vid];         [tm][vid]overlay[out]"
    )
}

/// Build multi-video chroma key filter chain.
/// Each color slot maps to a different video input.
fn multi_chroma_filter(
    template_w: u32,
    template_h: u32,
    slots: &[(String, usize)],
    fit_mode: &str,
) -> String {
    let mut parts = Vec::new();
    parts.push(format!("[0:v]null[base]"));

    let fit = if fit_mode == "contain" {
        format!("scale={template_w}:{template_h}:force_original_aspect_ratio=decrease")
    } else {
        format!("scale={template_w}:{template_h}:force_original_aspect_ratio=increase,crop={template_w}:{template_h}")
    };

    for (i, (color, input_idx)) in slots.iter().enumerate() {
        let hex = color.trim_start_matches('#');
        let next = if i + 1 == slots.len() {
            "composited".to_string()
        } else {
            format!("step{i}")
        };
        parts.push(format!(
            "[base]colorkey=0x{hex}:0.1:0.02[tk{i}];             [tk{i}]split[tm{i}][ta{i}];             [ta{i}]alphaextract[mask{i}];             [{input_idx}:v]{fit}[vs{i}];             [vs{i}][mask{i}]alphamerge[vid{i}];             [tm{i}][vid{i}]overlay[{next}]"
        ));
        if i + 1 < slots.len() {
            parts.push(format!("[{next}]null[base]"));
        }
    }
    parts.join(";")
}

/// Generate a single template GIF with chroma key compositing.
/// Returns (output_path, file_size) or error.
fn compose_single_template_gif(
    ffmpeg: &Path,
    template_path: &Path,
    video_path: &Path,
    output_path: &Path,
    start_seconds: f64,
    duration: f64,
    color_hex: &str,
    fit_mode: &str,
    fps: u32,
    width: Option<u32>,
    target_bytes: u64,
) -> Result<(String, u64), String> {
    let template_w: u32;
    let template_h: u32;
    // Probe template dimensions
    {
        let output = bundled_command(ffmpeg)
            .args([
                "-hide_banner",
                "-v",
                "error",
                "-show_entries",
                "stream=width,height",
                "-of",
                "json",
            ])
            .arg(template_path)
            .output()
            .map_err(|e| format!("无法读取模板信息：{e}"))?;
        let json: serde_json::Value =
            serde_json::from_slice(&output.stdout).map_err(|_| "无法解析模板信息".to_string())?;
        template_w = json["streams"][0]["width"].as_u64().unwrap_or(1920) as u32;
        template_h = json["streams"][0]["height"].as_u64().unwrap_or(1080) as u32;
    }

    let filter = chroma_key_filter(template_w, template_h, color_hex, fit_mode, 0.1, 0.02);

    // Try encoding with different quality levels
    let mut current_fps = fps;
    let mut current_width = width;
    let max_retries = 8u32;

    for step in 0..max_retries {
        let mut filters = Vec::new();
        if let Some(w) = current_width {
            filters.push(format!("scale={w}:-2:flags=lanczos"));
        }
        filters.push(format!("fps={current_fps}"));
        let post_filter = filters.join(",");

        let palette = format!(
            "{filter}[out];[out]{post_filter},split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a"
        );

        let mut args = vec![
            OsString::from("-hide_banner"),
            OsString::from("-nostdin"),
            OsString::from("-y"),
            OsString::from("-i"),
            OsString::from(template_path.to_str().unwrap()),
            OsString::from("-ss"),
            OsString::from(start_seconds.to_string()),
            OsString::from("-t"),
            OsString::from(duration.to_string()),
            OsString::from("-i"),
            OsString::from(video_path.to_str().unwrap()),
            OsString::from("-filter_complex"),
            OsString::from(palette),
            OsString::from("-loop"),
            OsString::from("0"),
            output_path.as_os_str().to_owned(),
        ];

        let output = bundled_command(ffmpeg)
            .args(&args)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .output()
            .map_err(|e| format!("FFmpeg 执行失败：{e}"))?;

        if output.status.success() {
            if let Ok(meta) = fs::metadata(output_path) {
                let size = meta.len();
                if target_bytes == 0 || size <= target_bytes || step + 1 >= max_retries {
                    return Ok((output_path.to_string_lossy().into_owned(), size));
                }
                // Reduce params and retry
                current_fps = (current_fps - 2).max(6);
                if step > 2 {
                    current_width = current_width.map(|w| (w as f64 * 0.8) as u32);
                }
            } else {
                return Err("FFmpeg 完成后未找到输出文件".into());
            }
        } else {
            return Err(format!(
                "FFmpeg 合成失败：{}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
    }

    Err("压缩重试次数已用尽".into())
}

/// 多语言模板 GIF 合成（单视频 + 多模板）
#[tauri::command]
pub fn compose_template_gifs(
    app: AppHandle,
    request: TemplateGifComposeRequest,
) -> Result<TemplateGifComposeResult, String> {
    if !engine_status(app.clone()).ready {
        return Err("转换引擎不可用".into());
    }
    let ffmpeg = sidecar_path(&app, "ffmpeg")?;
    let output_dir = Path::new(&request.output_directory);
    if !output_dir.is_dir() {
        std::fs::create_dir_all(output_dir).map_err(|e| format!("无法创建输出目录：{e}"))?;
    }

    let duration = request.end_seconds - request.start_seconds;
    if duration <= 0.0 {
        return Err("截取区间无效".into());
    }

    let mut outputs = Vec::new();
    let target_bytes = request.compression.target_bytes;
    let fps = request.compression.min_fps.unwrap_or(24);
    let width = request.compression.min_width;

    for template_path in &request.template_paths {
        let template = Path::new(template_path);
        let stem = template
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("output");
        let output = output_dir.join(format!("{stem}.gif"));

        match compose_single_template_gif(
            &ffmpeg,
            template,
            Path::new(&request.video_path),
            &output,
            request.start_seconds,
            duration,
            &request.chroma_key.color.as_deref().unwrap_or("#00FF00"),
            &request.fit_mode,
            fps,
            width,
            target_bytes,
        ) {
            Ok((path, bytes)) => {
                outputs.push(TemplateOutput {
                    template_path: template_path.clone(),
                    output_path: path,
                    output_bytes: bytes,
                });
            }
            Err(e) => {
                log::error!("TEMPLATE_COMPOSE_FAILED {}: {}", template_path, e);
                // Continue with other templates even if one fails
            }
        }
    }

    Ok(TemplateGifComposeResult {
        task_id: request.task_id,
        outputs,
    })
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchComposeRequest {
    pub mode: String,
    pub template_paths: Vec<String>,
    pub output_directory: String,
    pub start_seconds: f64,
    pub end_seconds: f64,
    pub fit_mode: String,
    pub fps: u32,
    pub width: Option<u32>,
    pub compression_preference: String,
    pub target_bytes: u64,
    pub min_width: Option<u32>,
    pub min_fps: Option<u32>,
    pub allow_strong_compression: bool,
    pub single_video_path: Option<String>,
    pub video_slots: Vec<BatchVideoSlot>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchVideoSlot {
    pub color: String,
    pub video_path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchComposeResult {
    pub results: Vec<BatchTemplateOutput>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchTemplateOutput {
    pub template_path: String,
    pub template_name: String,
    pub output_path: String,
    pub output_bytes: u64,
    pub status: String,
    pub error: Option<String>,
}

/// Save job configuration as JSON to a file
#[tauri::command]
pub fn save_batch_job_json(directory: String, job_json: String) -> Result<(), String> {
    let dir = Path::new(&directory);
    if !dir.is_dir() {
        std::fs::create_dir_all(dir).map_err(|e| format!("无法创建目录：{e}"))?;
    }
    let path = dir.join("job.json");
    fs::write(&path, job_json).map_err(|e| format!("保存 job.json 失败：{e}"))?;
    Ok(())
}

/// Load job configuration from a JSON file
#[tauri::command]
pub fn load_batch_job_json(path: String) -> Result<String, String> {
    let file_path = Path::new(&path);
    if !file_path.is_file() {
        return Err("job.json 文件不存在".into());
    }
    fs::read_to_string(file_path).map_err(|e| format!("读取 job.json 失败：{e}"))
}

/// Batch compose: single video → multiple templates
#[tauri::command]
pub fn compose_batch_template_gifs(
    app: AppHandle,
    request: BatchComposeRequest,
) -> Result<BatchComposeResult, String> {
    if !engine_status(app.clone()).ready {
        return Err("转换引擎不可用".into());
    }
    let ffmpeg = sidecar_path(&app, "ffmpeg")?;
    let output_dir = Path::new(&request.output_directory);
    if !output_dir.is_dir() {
        std::fs::create_dir_all(output_dir).map_err(|e| format!("无法创建输出目录：{e}"))?;
    }

    let duration = request.end_seconds - request.start_seconds;
    if duration <= 0.0 {
        return Err("截取区间无效".into());
    }

    let video_path = request.single_video_path.as_deref().unwrap_or("");
    if video_path.is_empty() {
        return Err("未指定视频文件".into());
    }

    // Step 1: Try encoding the first template to find optimal params
    let mut best_fps = request.fps;
    let mut best_width = request.width;
    let prefer = request.compression_preference.as_str();

    if !request.template_paths.is_empty() {
        let first_tpl = &request.template_paths[0];
        let first_output = output_dir.join(format!(
            "{}.gif",
            Path::new(first_tpl)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("out")
        ));

        if let Ok((_, size)) = compose_single_template_gif(
            &ffmpeg,
            Path::new(first_tpl),
            Path::new(video_path),
            &first_output,
            request.start_seconds,
            duration,
            "#00FF00",
            &request.fit_mode,
            request.fps,
            request.width,
            request.target_bytes,
        ) {
            // If the first template needed retries, use those params for the batch
            if size > request.target_bytes && request.target_bytes > 0 {
                // Lower params for the batch
                best_fps = (request.fps - 2).max(request.min_fps.unwrap_or(6));
                if best_width.is_some() {
                    best_width = best_width.map(|w| (w as f64 * 0.85) as u32);
                }
            }
        }
    }

    // Step 2: Run the full batch with unified params
    let mut results = Vec::new();
    for template_path in &request.template_paths {
        let template = Path::new(template_path);
        let stem = template
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("output");
        let output = output_dir.join(format!("{stem}.gif"));
        let name = template
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();

        match compose_single_template_gif(
            &ffmpeg,
            template,
            Path::new(video_path),
            &output,
            request.start_seconds,
            duration,
            "#00FF00",
            &request.fit_mode,
            best_fps,
            best_width,
            request.target_bytes,
        ) {
            Ok((path, bytes)) => {
                results.push(BatchTemplateOutput {
                    template_path: template_path.clone(),
                    template_name: name,
                    output_path: path,
                    output_bytes: bytes,
                    status: "success".into(),
                    error: None,
                });
            }
            Err(e) => {
                log::error!("BATCH_COMPOSE_FAILED {}: {}", template_path, e);
                results.push(BatchTemplateOutput {
                    template_path: template_path.clone(),
                    template_name: name,
                    output_path: String::new(),
                    output_bytes: 0,
                    status: "failed".into(),
                    error: Some(e),
                });
            }
        }
    }

    Ok(BatchComposeResult { results })
}

/// Generate a single composite preview frame from template + video
#[tauri::command]
pub fn preview_template_frame(
    app: AppHandle,
    template_path: String,
    video_path: String,
    output_path: String,
    timestamp_seconds: f64,
    color_hex: String,
    fit_mode: String,
) -> Result<String, String> {
    if !engine_status(app.clone()).ready {
        return Err("转换引擎不可用".into());
    }
    let ffmpeg = sidecar_path(&app, "ffmpeg")?;
    let template = Path::new(&template_path);
    let video = Path::new(&video_path);
    let output = Path::new(&output_path);

    if !template.is_file() {
        return Err("模板文件不存在".into());
    }
    if !video.is_file() {
        return Err("视频文件不存在".into());
    }

    // Probe template size
    let probe_out = bundled_command(&ffmpeg)
        .args([
            "-hide_banner",
            "-v",
            "error",
            "-show_entries",
            "stream=width,height",
            "-of",
            "json",
        ])
        .arg(template)
        .output()
        .map_err(|e| format!("无法读取模板：{e}"))?;
    let json: serde_json::Value =
        serde_json::from_slice(&probe_out.stdout).map_err(|_| "无法解析模板信息".to_string())?;
    let tw = json["streams"][0]["width"].as_u64().unwrap_or(1920) as u32;
    let th = json["streams"][0]["height"].as_u64().unwrap_or(1080) as u32;

    let hex = color_hex.trim_start_matches('#');
    let fit = if fit_mode == "contain" {
        format!("scale={tw}:{th}:force_original_aspect_ratio=decrease")
    } else {
        format!("scale={tw}:{th}:force_original_aspect_ratio=increase,crop={tw}:{th}")
    };

    let filter = format!(
        "[0:v]colorkey=0x{hex}:0.1:0.02[tk];         [tk]split[tm][ta];         [ta]alphaextract[mask];         [1:v]{fit}[vs];         [vs][mask]alphamerge[vid];         [tm][vid]overlay[out]"
    );

    let args = [
        OsString::from("-hide_banner"),
        OsString::from("-nostdin"),
        OsString::from("-y"),
        OsString::from("-i"),
        OsString::from(template_path.clone()),
        OsString::from("-ss"),
        OsString::from(timestamp_seconds.to_string()),
        OsString::from("-i"),
        OsString::from(video_path.clone()),
        OsString::from("-vframes"),
        OsString::from("1"),
        OsString::from("-filter_complex"),
        OsString::from(filter),
        OsString::from(output_path.clone()),
    ];

    let result = bundled_command(&ffmpeg)
        .args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map_err(|e| format!("FFmpeg 预览生成失败：{e}"))?;

    if !result.status.success() {
        return Err(format!(
            "预览合成失败：{}",
            String::from_utf8_lossy(&result.stderr)
        ));
    }

    Ok(output_path)
}

/// Generate a single preview frame with watermark applied
#[tauri::command]
pub fn preview_watermark_frame(
    app: AppHandle,
    input_path: String,
    output_path: String,
    kind: String,
    text: String,
    image_path: Option<String>,
    position: String,
    size_percent: u32,
    opacity: f64,
    tiled: bool,
    timestamp_seconds: Option<f64>,
) -> Result<String, String> {
    if !engine_status(app.clone()).ready {
        return Err("转换引擎不可用".into());
    }
    let ffmpeg = sidecar_path(&app, "ffmpeg")?;
    let input = Path::new(&input_path);
    let output = Path::new(&output_path);
    if !input.is_file() {
        return Err("输入文件不存在".into());
    }

    let alpha = opacity.to_string();
    let font_size = format!("h*{size_percent}/100");

    let positions: Vec<(&str, &str)> = if tiled {
        drawtext_tiled_coordinates().to_vec()
    } else {
        vec![drawtext_single_position(&position)]
    };

    let filter: String;
    let mut cleanup_paths: Vec<PathBuf> = Vec::new();
    let has_second_input: bool;

    if kind == "text" {
        let font_path = watermark_font_path(&app)?;
        let text_file = watermark_text_file("preview", &text)?;
        let font = escape_filter_value(&font_path.to_string_lossy());
        let textfile = escape_filter_value(&text_file.to_string_lossy());
        cleanup_paths.push(text_file.clone());

        let mut parts = Vec::new();
        let mut prev = "0:v".to_string();
        for (i, (x, y)) in positions.iter().enumerate() {
            let next = if i + 1 == positions.len() {
                "out".to_string()
            } else {
                format!("t{i}")
            };
            parts.push(format!("[{prev}]drawtext=fontfile='{font}':textfile='{textfile}':fontcolor=white@{alpha}:fontsize={font_size}:x={x}:y={y}[{next}]"));
            prev = next;
        }
        filter = parts.join(";");
        has_second_input = false;
    } else {
        let img = image_path.as_deref().unwrap_or("");
        filter = format!(
            "[1:v]format=rgba,colorchannelmixer=aa={alpha}[wo];             [wo][0:v]scale2ref=w=main_w*{size_percent}/100:h=-1[wm][base];             [base][wm]overlay=x={}:y={}:format=auto[out]",
            positions[0].0, positions[0].1
        );
        has_second_input = true;
    }

    let mut args = vec![
        OsString::from("-hide_banner"),
        OsString::from("-nostdin"),
        OsString::from("-y"),
        OsString::from("-i"),
        OsString::from(input_path),
    ];
    if has_second_input {
        args.push(OsString::from("-i"));
        args.push(OsString::from(image_path.unwrap_or_default()));
    }
    if let Some(ts) = timestamp_seconds {
        args.push(OsString::from("-ss"));
        args.push(OsString::from(ts.to_string()));
    }
    args.extend([
        OsString::from("-vframes"),
        OsString::from("1"),
        OsString::from("-filter_complex"),
        OsString::from(filter),
        OsString::from("-map"),
        OsString::from("[out]"),
        OsString::from(output_path.clone()),
    ]);

    let result = bundled_command(&ffmpeg)
        .args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map_err(|e| format!("FFmpeg 水印预览失败：{e}"))?;

    for p in cleanup_paths {
        let _ = fs::remove_file(p);
    }

    if !result.status.success() {
        return Err(format!(
            "水印预览合成失败：{}",
            String::from_utf8_lossy(&result.stderr)
        ));
    }

    Ok(output_path)
}

#[cfg(test)]
mod tests {
    use super::{
        build_gif_encode_args, drawtext_single_position, drawtext_tiled_coordinates,
        escape_filter_value, event_kind, event_task_id, ffmpeg_args, fit_width_for_budget,
        format_file_size, gif_analysis_advice, gif_budget, gif_bytes_per_second,
        gif_correction_safety, gif_encode_args_with_temp, gif_estimate_full_bytes,
        gif_estimate_range, gif_failure_message, gif_mode_is_valid, gif_sample_plan,
        gif_sample_request, gif_sample_signature, gif_step_outcome, gif_temp_output_path,
        gif_temp_token, gif_within_budget, is_static_image, is_video_media, next_available_path,
        next_gif_width, output_path, overlay_coordinates, parse_progress_line, persist_gif_final,
        remove_incomplete_output, run_gif_analysis, run_gif_task_loop, run_watermark_preview_job,
        run_watermark_production_job, sanitize_file_stem, scaled_height,
        start_watermark_preview_queue_with_runner, start_watermark_video_queue,
        target_sidecar_name, tiled_coordinates, validate_gif_inputs, watermark_output_path,
        EncoderBackend, FrozenWatermarkJob, FrozenWatermarkPreviewJob, GifAnalysis,
        GifFailureReason, GifMediaOptions, GifMediaTaskRequest, GifSampleHint, GifStepOutcome,
        GifTaskHost, MediaTaskEvent, MediaTerminal, WatermarkEncodePayload, WatermarkJobStatus,
        WatermarkMediaTaskRequest, WatermarkOptions, WatermarkPreviewRequest,
        WatermarkPreviewStatus, WatermarkPreviewStatusEvent, WatermarkPreviewTerminal,
        WatermarkQueueError, WatermarkQueueEvent, WatermarkTerminal, GIF_MODES, MAX_GIF_BYTES,
        MAX_GIF_FULL_ENCODES,
    };
    use std::{
        ffi::OsString,
        fs,
        path::{Path, PathBuf},
        sync::{
            atomic::{AtomicBool, Ordering},
            mpsc, Arc, Mutex,
        },
        thread,
    };

    fn request() -> GifMediaTaskRequest {
        GifMediaTaskRequest {
            task_id: "task-1".into(),
            input_path: "/tmp/中文 空格/input.mp4".into(),
            options: GifMediaOptions {
                start_seconds: Some(1.0),
                end_seconds: Some(4.0),
                width: Some(640),
                fps: 12,
                preset: "fast".into(),
                output_directory: "/tmp/输出 文件夹".into(),
                target_bytes: None,
                mode: None,
                min_width: None,
                sample: None,
            },
        }
    }

    fn extract_filter(args: &[OsString]) -> String {
        let mut prev_was_filter = false;
        for item in args {
            if prev_was_filter {
                return item.to_string_lossy().into_owned();
            }
            if item == "-filter_complex" {
                prev_was_filter = true;
            }
        }
        panic!("-filter_complex argument not found in args")
    }

    fn test_watermark_args(
        request: &WatermarkMediaTaskRequest,
        output: &Path,
    ) -> (Vec<OsString>, Vec<PathBuf>) {
        let options = &request.options;
        let alpha = options.opacity.to_string();
        let (filter, cleanup) = if options.kind == "text" {
            let positions: Vec<(&str, &str)> = if options.pattern.as_deref() != Some("single") {
                drawtext_tiled_coordinates().to_vec()
            } else {
                vec![drawtext_single_position(&options.position)]
            };
            let font = escape_filter_value("/tmp/test-font.otf");
            let text_file_path = std::env::temp_dir()
                .join(format!("brand-material-watermark-{}.txt", request.task_id));
            fs::write(&text_file_path, &options.text).unwrap();
            let text_file_value = escape_filter_value(&text_file_path.to_string_lossy());
            let font_size = format!("h*{}/100", options.size_percent);
            let mut previous = "0:v".to_string();
            let mut graph = Vec::new();
            for (index, (x, y)) in positions.iter().enumerate() {
                let next = if index + 1 == positions.len() {
                    "watermarked".to_string()
                } else {
                    format!("text{index}")
                };
                graph.push(format!("[{previous}]drawtext=fontfile='{font}':textfile='{text_file_value}':fontcolor=white@{alpha}:fontsize={font_size}:x={x}:y={y}[{next}]"));
                previous = next;
            }
            (graph.join(";"), vec![text_file_path])
        } else {
            let positions: Vec<(&str, &str)> = if options.pattern.as_deref() != Some("single") {
                tiled_coordinates().to_vec()
            } else {
                vec![overlay_coordinates(&options.position)]
            };
            let mut graph = vec![
                format!("[1:v]format=rgba,colorchannelmixer=aa={alpha}[watermark-alpha]"),
                format!(
                    "[watermark-alpha][0:v]scale2ref=w=main_w*{}/100:h=-1[watermark][base]",
                    options.size_percent
                ),
            ];
            if positions.len() == 1 {
                let (x, y) = positions[0];
                graph.push(format!(
                    "[base][watermark]overlay=x={x}:y={y}:format=auto[watermarked]"
                ));
            } else {
                let labels: Vec<String> = (0..positions.len())
                    .map(|index| format!("wm{index}"))
                    .collect();
                graph.push(format!(
                    "[watermark]split={}[{}]",
                    positions.len(),
                    labels.join("][")
                ));
                let mut previous = "base".to_string();
                for (index, (x, y)) in positions.iter().enumerate() {
                    let next = if index + 1 == positions.len() {
                        "watermarked".to_string()
                    } else {
                        format!("tile{index}")
                    };
                    graph.push(format!(
                        "[{previous}][{}]overlay=x={x}:y={y}:format=auto[{next}]",
                        labels[index]
                    ));
                    previous = next;
                }
            }
            (graph.join(";"), Vec::new())
        };
        let mut args = vec![
            OsString::from("-hide_banner"),
            OsString::from("-nostdin"),
            OsString::from("-i"),
            OsString::from(&request.input_path),
        ];
        if request.options.kind == "image" {
            args.extend([
                OsString::from("-i"),
                OsString::from(request.options.image_path.clone().unwrap_or_default()),
            ]);
        }
        args.extend([
            OsString::from("-filter_complex"),
            OsString::from(filter),
            OsString::from("-map"),
            OsString::from("[watermarked]"),
        ]);
        if is_static_image(Path::new(&request.input_path)) {
            args.extend([OsString::from("-frames:v"), OsString::from("1")]);
        } else {
            args.extend([
                OsString::from("-map"),
                OsString::from("0:a?"),
                OsString::from("-c:v"),
                OsString::from("libx264"),
                OsString::from("-pix_fmt"),
                OsString::from("yuv420p"),
                OsString::from("-movflags"),
                OsString::from("+faststart"),
                OsString::from("-c:a"),
                OsString::from("aac"),
            ]);
        }
        args.extend([
            OsString::from("-progress"),
            OsString::from("pipe:1"),
            OsString::from("-nostats"),
            output.as_os_str().to_owned(),
        ]);
        (args, cleanup)
    }

    #[test]
    fn creates_structured_args_for_a_chinese_space_path() {
        let args = ffmpeg_args(&request(), Path::new("/tmp/输出 文件夹/input_gif.gif"));
        let values: Vec<_> = args
            .iter()
            .map(|value| value.to_string_lossy().into_owned())
            .collect();
        assert!(values.contains(&"/tmp/中文 空格/input.mp4".into()));
        assert!(values.contains(&"-progress".into()));
        assert!(values.contains(&"pipe:1".into()));
        assert!(!values.contains(&"/bin/sh".into()));
        assert!(!values.contains(&"-c".into()));
    }

    #[test]
    fn parses_ffmpeg_progress_without_path_or_network_fallbacks() {
        assert_eq!(
            parse_progress_line("out_time_ms=2500000", 1.0, 3.0),
            Some(0.5)
        );
        assert_eq!(parse_progress_line("progress=end", 1.0, 3.0), None);
    }

    #[test]
    fn keeps_the_last_ffmpeg_error_line_for_the_queue() {
        assert_eq!(
            super::ffmpeg_failure_message(
                "frame=1\nError opening output file denied.gif\nConversion failed!\n"
            ),
            "FFmpeg 处理失败：Error opening output file denied.gif"
        );
    }

    #[test]
    fn skips_generic_ffmpeg_tail_messages_and_returns_the_last_informative_error() {
        // The real RC4 stderr ended with "Undefined constant or missing '(' in 'overlay_w/2'"
        // followed by "Failed to parse expression: main_w*0.17-overlay_w/2" and then
        // "Conversion failed!". After the fix, the function should skip "Conversion failed!"
        // and return the expression parse error.
        assert_eq!(
            super::ffmpeg_failure_message(
                "Warning: data is not aligned! This can lead to a speed loss\n\
                 [Parsed_drawtext_0 @ 0x12345] Undefined constant or missing '(' in 'overlay_w/2'\n\
                 Failed to parse expression: main_w*0.17-overlay_w/2\n\
                 Conversion failed!\n"
            ),
            "FFmpeg 处理失败：Failed to parse expression: main_w*0.17-overlay_w/2"
        );
    }

    #[test]
    fn output_conflicts_receive_a_stable_suffix() {
        let directory =
            std::env::temp_dir().join(format!("brand-media-output-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join("clip_gif.gif"), b"existing").unwrap();
        assert_eq!(
            next_available_path(&directory, "clip_gif.gif"),
            directory.join("clip_gif_2.gif")
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn gif_temp_names_are_isolated_per_task_and_per_slot() {
        let final_path = Path::new("/tmp/中文 输出/片段.gif");
        let first_a = gif_temp_output_path(final_path, "123-taskA-0", "first");
        let first_b = gif_temp_output_path(final_path, "123-taskB-0", "first");
        let sample_a = gif_temp_output_path(final_path, "123-taskA-0", "sample");

        // Two tasks writing the same output directory must never share a temp
        // file, otherwise one task's attempt can be measured or deleted by the
        // other while it is still being encoded.
        assert_ne!(first_a, first_b);
        // The analysis sample must not clobber a full-encode artefact.
        assert_ne!(first_a, sample_a);
        assert_ne!(first_a, final_path);

        let name = first_a.file_name().unwrap().to_string_lossy().into_owned();
        assert!(name.starts_with('.'), "temp files stay hidden: {name}");
        assert!(
            name.ends_with(".tmp.gif"),
            "muxer suffix stays real: {name}"
        );
        assert!(name.contains("taskA"));
        assert_eq!(first_a.parent(), final_path.parent());
        assert!(
            !name.contains('/') && !name.contains('\\'),
            "a task id must never escape its directory: {name}"
        );
    }

    #[test]
    fn gif_encode_args_state_the_format_and_never_carry_an_output_path() {
        let args = build_gif_encode_args(&request(), 12, Some(640));
        let values: Vec<_> = args
            .iter()
            .map(|value| value.to_string_lossy().into_owned())
            .collect();

        let format_index = values
            .iter()
            .position(|value| value == "-f")
            .expect("-f must be present so FFmpeg does not infer the muxer");
        assert_eq!(values[format_index + 1], "gif");
        // The builder ends with encoder options, so the runner can append one
        // output path and only one.
        assert_eq!(values.last().unwrap(), "-nostats");
        assert!(
            !values.iter().any(|value| value.ends_with(".gif")),
            "the builder must not name any output file, got {values:?}"
        );
    }

    /// Regression: the loop used to hand FFmpeg the user's destination as a
    /// first output and then append the temp path as a second one. FFmpeg wrote
    /// the destination file unconditionally, and the second output had no
    /// duration limit, so the task hung or encoded far past the chosen segment.
    #[test]
    fn gif_attempt_args_expose_only_the_temp_path_to_ffmpeg() {
        let final_output = Path::new("/tmp/中文 输出/片段.gif");
        let temp_output = gif_temp_output_path(final_output, "123-task-0", "first");
        let args = build_gif_encode_args(&request(), 12, Some(640));
        let values: Vec<_> = gif_encode_args_with_temp(&args, &temp_output)
            .iter()
            .map(|value| value.to_string_lossy().into_owned())
            .collect();

        // Exactly one path argument, and it is the temp file.
        let path_like: Vec<&String> = values
            .iter()
            .filter(|value| value.ends_with(".gif"))
            .collect();
        assert_eq!(path_like.len(), 1, "expected one output, got {path_like:?}");
        assert_eq!(*path_like[0], temp_output.to_string_lossy());
        assert!(
            !values
                .iter()
                .any(|value| value == &final_output.to_string_lossy()),
            "the destination must never reach FFmpeg"
        );
        // `-f gif` still precedes that single output.
        let format_index = values.iter().position(|value| value == "-f").unwrap();
        let output_index = values
            .iter()
            .position(|value| value.ends_with(".gif"))
            .unwrap();
        assert!(format_index < output_index);
    }

    #[test]
    fn gif_target_bytes_accepts_float_json_without_failing_the_whole_request() {
        // Regression: the front end used to send `7.8 * 1024 * 1024`, which
        // serializes to 8178892.8. A plain `Option<u64>` rejects a JSON float
        // outright, so the task never started.
        let float_payload = r#"{
            "taskId": "task-float",
            "inputPath": "/tmp/中文 空格/input.mp4",
            "options": {
                "fps": 12,
                "preset": "high",
                "outputDirectory": "/tmp/输出 文件夹",
                "targetBytes": 8178892.8
            }
        }"#;
        let parsed: GifMediaTaskRequest = serde_json::from_str(float_payload)
            .expect("a floating point byte budget must not break request parsing");
        assert_eq!(parsed.options.target_bytes, Some(8_178_893));

        let int_payload = r#"{
            "taskId": "task-int",
            "inputPath": "/tmp/中文 空格/input.mp4",
            "options": {
                "fps": 12,
                "preset": "high",
                "outputDirectory": "/tmp/输出 文件夹",
                "targetBytes": 7800000
            }
        }"#;
        let parsed_int: GifMediaTaskRequest =
            serde_json::from_str(int_payload).expect("integer byte budget parses");
        assert_eq!(parsed_int.options.target_bytes, Some(7_800_000));

        // Omitting the field must stay valid (older clients).
        let omitted = r#"{
            "taskId": "task-none",
            "inputPath": "/tmp/中文 空格/input.mp4",
            "options": {
                "fps": 12,
                "preset": "high",
                "outputDirectory": "/tmp/输出 文件夹"
            }
        }"#;
        let parsed_none: GifMediaTaskRequest =
            serde_json::from_str(omitted).expect("missing byte budget parses");
        assert_eq!(parsed_none.options.target_bytes, None);
    }

    #[test]
    fn gif_budget_never_exceeds_the_decimal_megabyte_ceiling() {
        assert_eq!(MAX_GIF_BYTES, 8_000_000);
        assert_ne!(MAX_GIF_BYTES, 8 * 1024 * 1024);

        // No client budget: the decimal ceiling is the whole budget.
        assert_eq!(gif_budget(0), MAX_GIF_BYTES);
        // A tighter client budget is honoured…
        assert_eq!(gif_budget(7_800_000), 7_800_000);
        // …and a wider one can never raise the ceiling.
        assert_eq!(gif_budget(100_000_000), MAX_GIF_BYTES);

        // Exactly at the decimal limit is inside it; one byte over is not.
        assert!(gif_within_budget(8_000_000, 8_000_000));
        assert!(!gif_within_budget(8_000_001, 8_000_000));
        assert!(gif_within_budget(7_999_999, 0));
        assert!(!gif_within_budget(8_000_001, 0));
        assert!(gif_within_budget(7_800_000, 7_800_000));
        assert!(!gif_within_budget(7_800_001, 7_800_000));
        // A zero-byte result is a failed encode, never a success.
        assert!(!gif_within_budget(0, 8_000_000));
    }

    /// The rule the总控 review flagged: exceeding 8,000,000 B forbids publishing
    /// but must NOT end the task while a width correction can still help.
    #[test]
    fn gif_over_the_ceiling_keeps_compressing_while_a_width_step_remains() {
        let max = MAX_GIF_FULL_ENCODES;
        assert_eq!(max, 2, "complete encodes stay capped at two");

        // Under budget anywhere: publish.
        assert_eq!(
            gif_step_outcome(6_400_000, 7_800_000, true, 1, max),
            GifStepOutcome::Publish
        );

        // FIRST full encode over the decimal ceiling with a step left: retry,
        // not an immediate failure.
        assert_eq!(
            gif_step_outcome(MAX_GIF_BYTES + 1, 7_800_000, true, 1, max),
            GifStepOutcome::Retry
        );
        assert_eq!(
            gif_step_outcome(MAX_GIF_BYTES + 1, 0, true, 1, max),
            GifStepOutcome::Retry
        );
        assert_eq!(
            gif_step_outcome(9_500_000, 7_800_000, true, 1, max),
            GifStepOutcome::Retry
        );

        // Width is already at the user's floor: stop explicitly.
        assert_eq!(
            gif_step_outcome(MAX_GIF_BYTES + 1, 7_800_000, false, 1, max),
            GifStepOutcome::Fail(GifFailureReason::NoRoomToShrink)
        );

        // Both full encodes spent and still over budget: stop explicitly.
        assert_eq!(
            gif_step_outcome(7_900_000, 7_800_000, true, max, max),
            GifStepOutcome::Fail(GifFailureReason::BudgetUnreachable)
        );
        assert_eq!(
            gif_step_outcome(MAX_GIF_BYTES + 1, 7_800_000, true, max, max),
            GifStepOutcome::Fail(GifFailureReason::BudgetUnreachable)
        );

        // Boundary: exactly the ceiling is inside it.
        assert_eq!(
            gif_step_outcome(MAX_GIF_BYTES, MAX_GIF_BYTES, false, max, max),
            GifStepOutcome::Publish
        );
    }

    #[test]
    fn gif_width_correction_only_shrinks_and_respects_the_floor() {
        let budget = 7_800_000;

        let next = next_gif_width(1920, 160, 0.92, 12_000_000, budget)
            .expect("an over-budget encode has room to shrink");
        assert!(next < 1920, "correction must be strictly smaller: {next}");
        assert!(next >= 160, "correction must respect the floor: {next}");

        // The floor is honoured even when the formula wants to go far below it.
        let floored = next_gif_width(1920, 640, 0.92, 40_000_000, budget).unwrap();
        assert!((640..1920).contains(&floored), "got {floored}");

        // Already at the floor: no room left, so the loop must stop explicitly
        // instead of re-encoding identical output.
        assert!(next_gif_width(160, 160, 0.92, 9_000_000, budget).is_none());
        assert!(next_gif_width(200, 160, 0.92, 9_000_000, budget).unwrap() < 200);

        // Degenerate inputs never produce a "shrink".
        assert!(next_gif_width(1920, 160, 0.92, 0, budget).is_none());
        assert!(next_gif_width(0, 160, 0.92, 9_000_000, budget).is_none());
        assert!(next_gif_width(1920, 160, 0.92, 9_000_000, 0).is_none());
    }

    #[test]
    fn gif_sample_prediction_uses_the_area_model_and_respects_bounds() {
        // A 320px-, 2 s-sample of 2,000,000 B for a 2 s segment against a
        // 7,800,000 B budget: 320 * sqrt(0.92 * 7.8M / 2M) ≈ 606.
        let predicted =
            fit_width_for_budget(320, 2_000_000, 2.0, 7_800_000, 0.92, 160, 1920, 2.0).unwrap();
        assert!(
            (560..660).contains(&predicted),
            "area model prediction out of range: {predicted}"
        );

        // Never above the cap, never below the floor.
        assert_eq!(
            fit_width_for_budget(320, 10, 2.0, 7_800_000, 0.92, 160, 1920, 2.0),
            Some(1920)
        );
        assert_eq!(
            fit_width_for_budget(320, 900_000_000, 2.0, 7_800_000, 0.92, 160, 1920, 2.0),
            Some(160)
        );

        // Degenerate sample: no prediction.
        assert_eq!(
            fit_width_for_budget(0, 1, 2.0, 7_800_000, 0.92, 160, 1920, 2.0),
            None
        );
        assert_eq!(
            fit_width_for_budget(320, 0, 2.0, 7_800_000, 0.92, 160, 1920, 2.0),
            None
        );
        assert_eq!(
            fit_width_for_budget(320, 1, 2.0, 0, 0.92, 160, 1920, 2.0),
            None
        );
        assert_eq!(
            fit_width_for_budget(320, 1, 2.0, 7_800_000, 0.92, 160, 1920, 0.0),
            None
        );
    }

    /// The estimate must scale by the *segment-to-sample duration ratio*: the
    /// sample byte count is never the size of a longer clip. Same picture, same
    /// width, one 2 s segment and one 10 s segment.
    #[test]
    fn gif_estimate_scales_with_the_segment_to_sample_duration_ratio() {
        let sample_bytes = 400_000u64;
        let sample_seconds = 2.0;
        let sample_width = 320;
        let width = 640; // 2× the sample width → 4× the area.

        let two_seconds =
            gif_estimate_full_bytes(sample_bytes, sample_seconds, sample_width, width, 2.0);
        let ten_seconds =
            gif_estimate_full_bytes(sample_bytes, sample_seconds, sample_width, width, 10.0);

        // 400,000 B / 2 s = 200,000 B/s at 320px; ×4 area = 800,000 B/s at 640px.
        assert_eq!(
            gif_bytes_per_second(sample_bytes, sample_seconds, sample_width, width),
            800_000.0
        );
        assert_eq!(two_seconds, 1_600_000);
        assert_eq!(ten_seconds, 8_000_000);
        assert_eq!(
            ten_seconds,
            two_seconds * 5,
            "duration ratio must be linear"
        );

        // Therefore the width that fits the same budget must be ~sqrt(5) narrower
        // for the 10 s segment than for the 2 s one.
        let budget = 7_800_000;
        let w_short = fit_width_for_budget(
            sample_width,
            sample_bytes,
            sample_seconds,
            budget,
            1.0,
            160,
            1920,
            2.0,
        )
        .unwrap();
        let w_long = fit_width_for_budget(
            sample_width,
            sample_bytes,
            sample_seconds,
            budget,
            1.0,
            160,
            1920,
            10.0,
        )
        .unwrap();
        assert!(w_long < w_short, "{w_long} !< {w_short}");
        let ratio = w_short as f64 / w_long as f64;
        assert!(
            (ratio - 5f64.sqrt()).abs() < 0.05,
            "duration ratio should shrink the width by ~sqrt(5), got {ratio}"
        );
    }

    #[test]
    fn gif_estimate_range_is_a_marked_band_around_the_estimate() {
        assert_eq!(gif_estimate_range(0), (0, 0));
        let (low, high) = gif_estimate_range(1_000_000);
        assert_eq!(low, 800_000);
        assert_eq!(high, 1_200_000);
        // A tiny estimate never collapses to zero on the low side.
        let (low, _) = gif_estimate_range(1);
        assert_eq!(low, 1);
    }

    /// Advice never rewrites the user's own numbers: it only suggests a width
    /// that fits, or a shorter segment when even the floor width cannot.
    #[test]
    fn gif_analysis_advice_suggests_width_first_then_a_shorter_segment() {
        let sample_width = 320;
        let sample_seconds = 2.0;
        let budget = 7_800_000;

        // Comfortably inside the budget: no advice at all.
        let (width, seconds) = gif_analysis_advice(
            sample_width,
            200_000,
            sample_seconds,
            budget,
            0.92,
            640,
            160,
            2.0,
        );
        assert_eq!((width, seconds), (None, None));

        // Over budget at the expected width, but a narrower width fits.
        let (width, seconds) = gif_analysis_advice(
            sample_width,
            1_600_000,
            sample_seconds,
            budget,
            0.92,
            1280,
            160,
            2.0,
        );
        let width = width.expect("a width suggestion is expected");
        assert!(width < 1280 && width >= 160, "got {width}");
        assert_eq!(seconds, None);

        // Even the floor width cannot fit: suggest a shorter segment instead.
        let (width, seconds) = gif_analysis_advice(
            sample_width,
            8_000_000,
            sample_seconds,
            budget,
            0.92,
            640,
            320,
            10.0,
        );
        assert_eq!(width, None);
        let seconds = seconds.expect("a shorter-segment suggestion is expected");
        assert!(seconds > 0.1 && seconds < 10.0, "got {seconds}");

        // Degenerate inputs never panic or divide by zero.
        assert_eq!(
            gif_analysis_advice(0, 0, 2.0, budget, 0.92, 640, 160, 2.0),
            (None, None)
        );
        assert_eq!(
            gif_analysis_advice(320, 1_000, 2.0, 0, 0.92, 640, 160, 2.0),
            (None, None)
        );
    }

    /// The sample plan and its signature are shared by the preview and the
    /// production run: same inputs → same signature, any real change → new one.
    #[test]
    fn gif_sample_plan_and_signature_identify_one_sample() {
        assert_eq!(gif_sample_plan(1920, 10.0), (320, 2.0));
        assert_eq!(gif_sample_plan(200, 10.0), (200, 2.0));
        assert_eq!(gif_sample_plan(1920, 0.6), (320, 0.6));
        assert_eq!(gif_sample_plan(0, 0.0), (1, 0.05));

        let base = gif_sample_signature("/tmp/a.mp4", 1_000, 10, "fast", 0.0, 320, 2.0);
        assert_eq!(
            base,
            gif_sample_signature("/tmp/a.mp4", 1_000, 10, "fast", 0.0, 320, 2.0)
        );
        for changed in [
            gif_sample_signature("/tmp/b.mp4", 1_000, 10, "fast", 0.0, 320, 2.0),
            gif_sample_signature("/tmp/a.mp4", 1_001, 10, "fast", 0.0, 320, 2.0),
            gif_sample_signature("/tmp/a.mp4", 1_000, 15, "fast", 0.0, 320, 2.0),
            gif_sample_signature("/tmp/a.mp4", 1_000, 10, "high", 0.0, 320, 2.0),
            gif_sample_signature("/tmp/a.mp4", 1_000, 10, "fast", 0.5, 320, 2.0),
            gif_sample_signature("/tmp/a.mp4", 1_000, 10, "fast", 0.0, 160, 2.0),
            gif_sample_signature("/tmp/a.mp4", 1_000, 10, "fast", 0.0, 320, 1.5),
        ] {
            assert_ne!(base, changed, "signature must change with the sample");
        }
    }

    #[test]
    fn gif_modes_map_to_width_correction_safety_without_touching_fps() {
        assert_eq!(GIF_MODES, ["balanced", "fps", "quality", "custom"]);
        assert!(gif_mode_is_valid("balanced"));
        assert!(gif_mode_is_valid("fps"));
        assert!(gif_mode_is_valid("quality"));
        assert!(gif_mode_is_valid("custom"));
        assert!(!gif_mode_is_valid("clarity"));
        assert!(!gif_mode_is_valid(""));

        let balanced = gif_correction_safety("balanced");
        let quality = gif_correction_safety("quality");
        let fps = gif_correction_safety("fps");
        assert!(quality > balanced, "quality must protect resolution");
        assert!(fps < balanced, "fps mode may trade width for the budget");
        assert_eq!(gif_correction_safety("custom"), balanced);
        assert_eq!(gif_correction_safety("unknown"), balanced);

        // A more aggressive mode yields a smaller width for the same overshoot.
        let w_quality = next_gif_width(640, 160, quality, 21_000_000, 7_800_000).unwrap();
        let w_fps = next_gif_width(640, 160, fps, 21_000_000, 7_800_000).unwrap();
        assert!(w_fps < w_quality);
    }

    /// Real FFmpeg: the analysis step produces one real output frame plus an
    /// estimate for the whole segment, never a single-frame size guess.
    #[test]
    fn real_gif_analysis_reports_a_frame_and_a_segment_scaled_estimate() {
        let directory =
            std::env::temp_dir().join(format!("brand-media-实机-分析-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let ffprobe = bundled_test_sidecar("ffprobe");
        let mp4 = directory.join("分析 样例.mp4");
        create_large_fixture(&ffmpeg, &mp4);

        let request = gif_request(
            "real-analysis",
            &mp4,
            &directory,
            Some(480),
            15,
            None,
            Some(2.5),
            Some(7_800_000),
            Some(160),
            "balanced",
        );
        let frame_output = directory.join("frame.png");
        let sample_output = directory.join("sample.gif");
        let host = Arc::new(RecordingGifHost::default());
        let host_for_loop: Arc<dyn GifTaskHost> = host.clone();

        let analysis = run_gif_analysis(
            &ffmpeg,
            &request,
            Some(1.0),
            640,
            480,
            2.5,
            &frame_output,
            &sample_output,
            &host_for_loop,
            "real-analysis",
        )
        .expect("analysis must succeed on a valid fixture");

        // One real frame, at the expected output width, decoded from the source.
        assert!(frame_output.is_file(), "the preview frame must exist");
        let frame_bytes = fs::read(&frame_output).unwrap();
        assert_eq!(
            frame_bytes[..8],
            [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a],
            "the preview frame must be a real PNG"
        );
        assert_eq!(analysis.frame_path, frame_output.to_string_lossy());
        assert_eq!(analysis.output_width, 480);
        assert_eq!(analysis.output_height, 360); // 640×480 at 480 wide → 360
        assert_eq!(analysis.fps, 15);
        assert_eq!(analysis.duration_seconds, 2.5);
        assert_eq!(analysis.budget_bytes, 7_800_000);

        // Size comes from the sample encode, scaled to the whole segment.
        assert!(analysis.sample_bytes > 0);
        assert!(analysis.sample_width <= 320);
        assert!((analysis.sample_seconds - 2.0).abs() < 1e-9);
        assert!(
            analysis.estimate_bytes > analysis.sample_bytes,
            "the 2.5s estimate must exceed the 2s sample: {} vs {}",
            analysis.estimate_bytes,
            analysis.sample_bytes
        );
        assert!(analysis.estimate_low_bytes < analysis.estimate_bytes);
        assert!(analysis.estimate_high_bytes > analysis.estimate_bytes);
        assert_eq!(
            analysis.likely_fits,
            analysis.estimate_high_bytes <= analysis.budget_bytes
        );
        assert!(!analysis.sample_signature.is_empty());

        // The sampled GIF is an internal artefact: it must be gone, and the
        // analysis must never write into the user's output directory.
        assert!(!sample_output.exists(), "the sample must be cleaned up");
        let leftovers: Vec<_> = fs::read_dir(&directory)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.ends_with(".gif"))
            .collect();
        assert!(
            leftovers.is_empty(),
            "no GIF may be left behind: {leftovers:?}"
        );

        // The frame is a real decoded frame of the source, not a placeholder.
        let probe = std::process::Command::new(&ffprobe)
            .args([
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height",
                "-of",
                "csv=p=0",
            ])
            .arg(&frame_output)
            .output()
            .unwrap();
        assert_eq!(
            String::from_utf8_lossy(&probe.stdout).trim(),
            "480,360",
            "the frame must be scaled to the expected output size"
        );
    }

    #[test]
    fn real_gif_automatic_analysis_matches_the_first_encode_width() {
        let directory =
            std::env::temp_dir().join(format!("brand-auto-size-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let mp4 = directory.join("source.mp4");
        create_large_fixture(&ffmpeg, &mp4);
        let mut widths = Vec::new();
        for mode in ["quality", "balanced", "fps"] {
            let request = gif_request(
                mode,
                &mp4,
                &directory,
                None,
                15,
                None,
                Some(2.5),
                Some(1_000_000),
                Some(160),
                mode,
            );
            let host: Arc<dyn GifTaskHost> = Arc::new(RecordingGifHost::default());
            let frame = directory.join(format!("{mode}.png"));
            let analysis = run_gif_analysis(
                &ffmpeg,
                &request,
                Some(0.5),
                640,
                480,
                2.5,
                &frame,
                &directory.join("sample.gif"),
                &host,
                mode,
            )
            .unwrap();
            let expected = fit_width_for_budget(
                analysis.sample_width,
                analysis.sample_bytes,
                analysis.sample_seconds,
                1_000_000,
                gif_correction_safety(mode),
                160,
                640,
                2.5,
            )
            .unwrap();
            assert_eq!(analysis.output_width, expected);
            assert!(analysis.output_width < 640);
            let image = fs::read(frame).unwrap();
            assert_eq!(
                u32::from_be_bytes(image[16..20].try_into().unwrap()),
                expected
            );
            widths.push(expected);
            if mode == "balanced" {
                let run_host = Arc::new(RecordingGifHost::default());
                let run_host_dyn: Arc<dyn GifTaskHost> = run_host.clone();
                let preferred = directory.join("automatic.gif");
                run_gif_task_loop(
                    &ffmpeg,
                    &request,
                    &preferred,
                    1_000_000,
                    Some(640),
                    2.5,
                    &run_host_dyn,
                    mode,
                );
                let (output, bytes) = completed_output(&run_host);
                assert!(bytes <= 1_000_000);
                let gif = fs::read(output).unwrap();
                let actual_width = u16::from_le_bytes([gif[6], gif[7]]) as u32;
                assert!(actual_width <= expected && actual_width >= 160);
            }
        }
        assert!(widths[0] >= widths[1] && widths[1] >= widths[2]);
        fs::remove_dir_all(directory).unwrap();
    }

    /// Real FFmpeg: a still-valid analysis sample is reused by the production
    /// run (one short encode less), and a stale one is ignored.
    #[test]
    fn real_gif_loop_reuses_a_matching_analysis_sample_instead_of_re_encoding() {
        let directory =
            std::env::temp_dir().join(format!("brand-media-实机-复用-{}", std::process::id()));
        let output_directory = directory.join("输出");
        fs::create_dir_all(&output_directory).unwrap();
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let mp4 = directory.join("复用 样例.mp4");
        create_large_fixture(&ffmpeg, &mp4);

        let base = gif_request(
            "real-reuse",
            &mp4,
            &output_directory,
            Some(320),
            24,
            None,
            Some(2.5),
            Some(7_800_000),
            Some(160),
            "balanced",
        );

        // Analysis first, exactly like the UI's explicit "计算预览".
        let frame_output = directory.join("reuse-frame.png");
        let sample_output = directory.join("reuse-sample.gif");
        let analysis_host = Arc::new(RecordingGifHost::default());
        let analysis_host_dyn: Arc<dyn GifTaskHost> = analysis_host.clone();
        let analysis = run_gif_analysis(
            &ffmpeg,
            &base,
            None,
            640,
            480,
            2.5,
            &frame_output,
            &sample_output,
            &analysis_host_dyn,
            "real-reuse-analysis",
        )
        .expect("analysis must succeed");

        // Same parameters + the analysis sample: the loop must not re-sample.
        let mut reused_request = base.clone();
        reused_request.options.sample = Some(GifSampleHint {
            signature: analysis.sample_signature.clone(),
            width: analysis.sample_width,
            seconds: analysis.sample_seconds,
            bytes: analysis.sample_bytes,
        });
        let preferred = output_path(&reused_request);
        let host_reused = Arc::new(RecordingGifHost::default());
        let host_reused_dyn: Arc<dyn GifTaskHost> = host_reused.clone();
        run_gif_task_loop(
            &ffmpeg,
            &reused_request,
            &preferred,
            reused_request.options.target_bytes.unwrap_or(0),
            None,
            2.5,
            &host_reused_dyn,
            &reused_request.task_id,
        );
        let (_, reused_bytes) = completed_output(&host_reused);

        // Same parameters without the sample: one extra short encode.
        let plain_request = base.clone();
        let preferred_plain = output_path(&plain_request).with_file_name("复用 样例_2.gif");
        let host_plain = Arc::new(RecordingGifHost::default());
        let host_plain_dyn: Arc<dyn GifTaskHost> = host_plain.clone();
        run_gif_task_loop(
            &ffmpeg,
            &plain_request,
            &preferred_plain,
            plain_request.options.target_bytes.unwrap_or(0),
            None,
            2.5,
            &host_plain_dyn,
            &plain_request.task_id,
        );
        let (_, plain_bytes) = completed_output(&host_plain);

        assert_eq!(
            host_reused.encode_count() + 1,
            host_plain.encode_count(),
            "reuse must save exactly the short sample encode ({} vs {})",
            host_reused.encode_count(),
            host_plain.encode_count()
        );
        assert_eq!(
            reused_bytes, plain_bytes,
            "reusing the sample must not change the produced bytes"
        );

        // A stale hint (different FPS = different sample) must be ignored.
        let mut stale_request = base.clone();
        stale_request.options.fps = 15;
        stale_request.options.sample = Some(GifSampleHint {
            signature: analysis.sample_signature.clone(),
            width: analysis.sample_width,
            seconds: analysis.sample_seconds,
            bytes: analysis.sample_bytes,
        });
        let preferred_stale = output_path(&stale_request).with_file_name("复用 样例_3.gif");
        let host_stale = Arc::new(RecordingGifHost::default());
        let host_stale_dyn: Arc<dyn GifTaskHost> = host_stale.clone();
        run_gif_task_loop(
            &ffmpeg,
            &stale_request,
            &preferred_stale,
            stale_request.options.target_bytes.unwrap_or(0),
            None,
            2.5,
            &host_stale_dyn,
            &stale_request.task_id,
        );
        assert_eq!(
            host_stale.encode_count(),
            host_plain.encode_count(),
            "a stale sample hint must not be reused"
        );
    }

    /// The short sample must be the same request as the real encode except for
    /// its width and duration — same FPS, same trim start, same everything else.
    #[test]
    fn gif_sample_request_only_shortens_width_and_duration() {
        let mut base = request();
        base.options.start_seconds = Some(1.5);
        base.options.end_seconds = Some(6.5);
        base.options.width = Some(1280);
        base.options.fps = 24;

        let sample = gif_sample_request(&base, 320, 2.0);
        assert_eq!(sample.options.width, Some(320));
        assert_eq!(sample.options.start_seconds, Some(1.5));
        assert_eq!(sample.options.end_seconds, Some(3.5));
        assert_eq!(sample.options.fps, base.options.fps);
        assert_eq!(
            sample.options.output_directory,
            base.options.output_directory
        );
        assert_eq!(sample.input_path, base.input_path);
        // The original request is untouched.
        assert_eq!(base.options.width, Some(1280));
        assert_eq!(base.options.end_seconds, Some(6.5));

        // A sample of the whole video without an explicit end still ends at the
        // sample window, never at the file end.
        let mut open = request();
        open.options.start_seconds = None;
        open.options.end_seconds = None;
        let open_sample = gif_sample_request(&open, 320, 2.0);
        assert_eq!(open_sample.options.end_seconds, Some(2.0));
    }

    #[test]
    fn gif_failure_sizes_are_reported_in_decimal_units() {
        // 8,000,000 B must read as 8.0 MB, not 7.6 MB via 1024 arithmetic.
        assert_eq!(format_file_size(8_000_000), "8.0 MB");
        assert_eq!(format_file_size(7_800_000), "7.8 MB");
        assert_eq!(format_file_size(999_000), "999 KB");
    }

    #[test]
    fn gif_failure_message_states_units_fps_and_the_deleted_artefact() {
        let message = gif_failure_message(
            GifFailureReason::BudgetUnreachable,
            8_400_000,
            7_800_000,
            24,
        );
        assert!(message.contains("8.4 MB"), "{message}");
        assert!(message.contains("8400000"), "{message}");
        assert!(message.contains("7800000"), "{message}");
        // Over the absolute ceiling must be called out explicitly.
        assert!(message.contains("8000000"), "{message}");
        // FPS is the user's constraint and was not changed by compression.
        assert!(message.contains("24 fps"), "{message}");
        assert!(message.contains("已删除，未写入输出目录"), "{message}");

        // A result under the ceiling but over the soft budget must not claim the
        // absolute limit was exceeded.
        let soft = gif_failure_message(
            GifFailureReason::BudgetUnreachable,
            7_900_000,
            7_800_000,
            12,
        );
        assert!(!soft.contains("绝对上限"), "{soft}");

        let floor = gif_failure_message(GifFailureReason::NoRoomToShrink, 9_000_000, 0, 30);
        assert!(floor.contains("输出宽度已到设定的下限"), "{floor}");
        assert!(floor.contains("30 fps"), "{floor}");
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn registry_cancel_kills_registered_child_without_wait_lock_deadlock() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let mut child = std::process::Command::new(&ffmpeg)
            .args([
                "-hide_banner",
                "-nostdin",
                "-re",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=160x90:rate=15",
                "-t",
                "20",
                "-f",
                "null",
                "-",
            ])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        let registry = super::MediaTaskRegistry::default();
        let child = std::sync::Arc::new(std::sync::Mutex::new(child));
        registry.insert("cancel-registry".into(), child.clone());
        std::thread::sleep(std::time::Duration::from_millis(50));
        registry.cancel("cancel-registry").unwrap();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
        let status = loop {
            if let Some(status) = child.lock().unwrap().try_wait().unwrap() {
                break status;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "registered child did not terminate"
            );
            std::thread::sleep(std::time::Duration::from_millis(20));
        };
        assert!(!status.success());
        assert!(registry.take_cancelled("cancel-registry"));
        registry.remove("cancel-registry");
    }

    #[cfg(target_os = "macos")]
    fn bundled_test_sidecar(tool: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(format!("{tool}-aarch64-apple-darwin"))
    }

    #[cfg(target_os = "macos")]
    fn create_fixture(ffmpeg: &Path, path: &Path) {
        let status = std::process::Command::new(ffmpeg)
            .args([
                "-hide_banner",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=160x90:rate=15",
                "-t",
                "2",
                "-pix_fmt",
                "yuv420p",
                "-c:v",
                "libx264",
                "-y",
            ])
            .arg(path)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .unwrap();
        assert!(status.success());
    }

    fn watermark_request(
        tmp_dir: &Path,
        kind: &str,
        text: &str,
        image_path: Option<&str>,
        position: &str,
        size_percent: u32,
        opacity: f64,
        tiled: bool,
    ) -> WatermarkMediaTaskRequest {
        let input = tmp_dir.join("photo.jpg");
        fs::write(&input, b"fake-image-data").unwrap();
        WatermarkMediaTaskRequest {
            task_id: "wm-1".into(),
            input_path: input.to_string_lossy().into_owned(),
            options: WatermarkOptions {
                kind: kind.into(),
                text: text.into(),
                image_path: image_path.map(str::to_owned),
                position: position.into(),
                size_percent,
                opacity,
                pattern: Some(if tiled {
                    "tiled".into()
                } else {
                    "single".into()
                }),
                density: Some("medium".into()),
                angle: None,
                dark_mode: None,
                offset_x: None,
                offset_y: None,
                columns: None,
                rows: None,
                placements: None,
                quality: None,
                prefer_hardware: None,
                text_style: None,
                reserved_output_path: None,
                output_directory: tmp_dir.to_string_lossy().into_owned(),
            },
        }
    }

    #[test]
    fn rejects_watermark_requests_with_invalid_inputs() {
        let tmp = std::env::temp_dir().join(format!("brand-media-wm-valid-{}", std::process::id()));
        fs::create_dir_all(&tmp).unwrap();
        assert!(super::validate_watermark_request(&watermark_request(
            &tmp,
            "text",
            "测试",
            None,
            "bottom-right",
            10,
            0.5,
            false
        ))
        .is_ok());
        assert!(
            super::validate_watermark_request(&WatermarkMediaTaskRequest {
                task_id: "wm-2".into(),
                input_path: "/tmp/missing-file.jpg".into(),
                options: watermark_request(&tmp, "text", "x", None, "bottom-right", 10, 0.5, false)
                    .options
                    .clone(),
            })
            .is_err()
        );
        let mut req = watermark_request(&tmp, "text", "", None, "bottom-right", 10, 0.5, false);
        req.options.text = "".into();
        assert!(super::validate_watermark_request(&req).is_err());
        req.options.text = "中文".into();
        req.options.size_percent = 0;
        assert!(super::validate_watermark_request(&req).is_err());
        req.options.size_percent = 10;
        req.options.opacity = 1.5;
        assert!(super::validate_watermark_request(&req).is_err());
        req.options.opacity = 0.5;
        req.options.kind = "invalid".into();
        assert!(super::validate_watermark_request(&req).is_err());
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn creates_watermark_outputs_in_correct_paths() {
        let tmp = std::env::temp_dir().join(format!("brand-media-wm-out-{}", std::process::id()));
        fs::create_dir_all(&tmp).unwrap();
        let req = watermark_request(&tmp, "text", "水印", None, "bottom-right", 10, 0.5, false);
        let expected = tmp
            .join("photo_watermarked.jpg")
            .to_string_lossy()
            .into_owned();
        assert_eq!(watermark_output_path(&req).to_string_lossy(), expected);
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn watermark_reserved_name_only_accepts_same_directory() {
        let tmp =
            std::env::temp_dir().join(format!("brand-media-wm-reserved-{}", std::process::id()));
        fs::create_dir_all(&tmp).unwrap();
        let mut req = watermark_request(&tmp, "text", "水印", None, "bottom-right", 10, 0.5, false);
        req.options.reserved_output_path = Some(
            tmp.join("P6-GIF1_watermarked_2.mp4")
                .to_string_lossy()
                .into_owned(),
        );
        assert_eq!(
            super::watermark_reserved_preferred_name(&req, &tmp),
            "P6-GIF1_watermarked_2.mp4"
        );
        req.options.reserved_output_path = Some("/tmp/other/P6-GIF1_watermarked_2.mp4".into());
        assert_eq!(
            super::watermark_reserved_preferred_name(&req, &tmp),
            "photo_watermarked.jpg"
        );
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn overlay_coordinates_map_all_positions() {
        assert_eq!(overlay_coordinates("top-left"), ("20", "20"));
        assert_eq!(
            overlay_coordinates("top-center"),
            ("(main_w-overlay_w)/2", "20")
        );
        assert_eq!(
            overlay_coordinates("top-right"),
            ("main_w-overlay_w-20", "20")
        );
        assert_eq!(
            overlay_coordinates("bottom-left"),
            ("20", "main_h-overlay_h-20")
        );
        assert_eq!(
            overlay_coordinates("bottom-center"),
            ("(main_w-overlay_w)/2", "main_h-overlay_h-20")
        );
        assert_eq!(
            overlay_coordinates("bottom-right"),
            ("main_w-overlay_w-20", "main_h-overlay_h-20")
        );
    }

    #[test]
    fn tiled_coordinates_has_nine_positions() {
        assert_eq!(tiled_coordinates().len(), 9);
    }

    #[test]
    fn drawtext_coordinates_never_use_main_or_overlay_variables() {
        for pos in [
            "top-left",
            "top-center",
            "top-right",
            "bottom-left",
            "bottom-center",
            "bottom-right",
        ] {
            let (x, y) = drawtext_single_position(pos);
            for expr in [x, y] {
                assert!(
                    !expr.contains("main_w"),
                    "drawtext single {pos} contains main_w in {expr}"
                );
                assert!(
                    !expr.contains("main_h"),
                    "drawtext single {pos} contains main_h in {expr}"
                );
                assert!(
                    !expr.contains("overlay_w"),
                    "drawtext single {pos} contains overlay_w in {expr}"
                );
                assert!(
                    !expr.contains("overlay_h"),
                    "drawtext single {pos} contains overlay_h in {expr}"
                );
            }
        }
        for (x, y) in drawtext_tiled_coordinates() {
            for expr in [x, y] {
                assert!(
                    !expr.contains("main_w"),
                    "drawtext tiled contains main_w in {expr}"
                );
                assert!(
                    !expr.contains("main_h"),
                    "drawtext tiled contains main_h in {expr}"
                );
                assert!(
                    !expr.contains("overlay_w"),
                    "drawtext tiled contains overlay_w in {expr}"
                );
                assert!(
                    !expr.contains("overlay_h"),
                    "drawtext tiled contains overlay_h in {expr}"
                );
            }
            assert!(
                x.contains("text_w") || x.contains("w"),
                "drawtext tiled x must use w/text_w"
            );
            assert!(
                y.contains("text_h") || y.contains("h"),
                "drawtext tiled y must use h/text_h"
            );
        }
    }

    #[test]
    fn image_overlay_coordinates_still_use_main_overlay_variables() {
        let (x, y) = overlay_coordinates("bottom-right");
        assert!(
            x.contains("main_w") && x.contains("overlay_w"),
            "image overlay x must use main_w/overlay_w"
        );
        assert!(
            y.contains("main_h") && y.contains("overlay_h"),
            "image overlay y must use main_h/overlay_h"
        );
    }

    #[test]
    fn escape_filter_value_escapes_colons_and_commas() {
        let s = escape_filter_value("path:with,chars");
        assert_eq!(s, "path\\:with\\,chars");
    }

    #[test]
    fn watermark_args_are_structured_without_shell_concatenation() {
        let tmp = std::env::temp_dir().join(format!("brand-media-wm-args-{}", std::process::id()));
        fs::create_dir_all(&tmp).unwrap();
        let args = test_watermark_args(
            &watermark_request(
                &tmp,
                "text",
                "测试水印",
                None,
                "bottom-right",
                12,
                0.6,
                false,
            ),
            Path::new("/tmp/输出 文件夹/photo_watermarked.jpg"),
        );
        let values: Vec<_> = args
            .0
            .iter()
            .map(|value| value.to_string_lossy().into_owned())
            .collect();
        let input_path = tmp.join("photo.jpg").to_string_lossy().into_owned();
        assert!(values.contains(&input_path));
        assert!(values.contains(&"-progress".into()));
        assert!(values.contains(&"pipe:1".into()));
        assert!(values.contains(&"-filter_complex".into()));
        assert!(!values.contains(&"/bin/sh".into()));
        assert!(!values.contains(&"-c".into()));
        assert_eq!(args.1.len(), 1);
        // Lock filter-text: drawtext must use w/h/text_w/text_h, not overlay variables.
        let filter = extract_filter(&args.0);
        assert!(
            filter.contains("drawtext"),
            "text single filter must contain drawtext"
        );
        assert!(filter.contains("w"), "text single filter must use w");
        assert!(
            !filter.contains("main_w"),
            "text filter must not contain main_w"
        );
        assert!(
            !filter.contains("overlay_w"),
            "text filter must not contain overlay_w"
        );
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn encoder_selection_maps_concrete_backends_to_public_ffmpeg_encoders() {
        assert_eq!(
            super::video_encoder_name(super::EncoderBackend::Nvenc),
            "h264_nvenc"
        );
        assert_eq!(
            super::video_encoder_name(super::EncoderBackend::Amf),
            "h264_amf"
        );
        assert_eq!(
            super::video_encoder_name(super::EncoderBackend::Qsv),
            "h264_qsv"
        );
        assert_eq!(
            super::video_encoder_name(super::EncoderBackend::VideoToolbox),
            "h264_videotoolbox"
        );
        assert_eq!(
            super::video_encoder_name(super::EncoderBackend::Cpu),
            "libx264"
        );
    }

    #[test]
    fn ordered_candidates_probe_nvenc_amf_qsv_then_cpu_on_windows() {
        assert_eq!(
            super::ordered_candidates("windows"),
            &[
                super::EncoderBackend::Nvenc,
                super::EncoderBackend::Amf,
                super::EncoderBackend::Qsv,
                super::EncoderBackend::Cpu,
            ]
        );
        assert_eq!(
            super::ordered_candidates("macos"),
            &[
                super::EncoderBackend::VideoToolbox,
                super::EncoderBackend::Cpu
            ]
        );
        assert_eq!(
            super::ordered_candidates("linux"),
            &[super::EncoderBackend::Cpu]
        );
    }

    #[test]
    fn fallback_chain_from_selection_only_includes_verified_hardware_then_cpu() {
        use super::EncoderBackend::*;
        let selection = super::EncoderSelection {
            selected: Nvenc,
            results: vec![
                super::EncoderProbeResult {
                    backend: Nvenc,
                    available: true,
                    reason: "ok".into(),
                },
                super::EncoderProbeResult {
                    backend: Amf,
                    available: false,
                    reason: "no".into(),
                },
                super::EncoderProbeResult {
                    backend: Qsv,
                    available: true,
                    reason: "ok".into(),
                },
            ],
        };
        // AMF failed the startup probe and is never retried at runtime.
        assert_eq!(
            super::fallback_chain_from_selection(&selection),
            vec![Nvenc, Qsv, Cpu]
        );
    }

    #[test]
    fn fallback_chain_from_selection_is_cpu_only_when_no_hardware_passes() {
        use super::EncoderBackend::*;
        let selection = super::EncoderSelection {
            selected: Cpu,
            results: vec![
                super::EncoderProbeResult {
                    backend: Nvenc,
                    available: false,
                    reason: "no".into(),
                },
                super::EncoderProbeResult {
                    backend: Amf,
                    available: false,
                    reason: "no".into(),
                },
                super::EncoderProbeResult {
                    backend: Qsv,
                    available: false,
                    reason: "no".into(),
                },
            ],
        };
        assert_eq!(super::fallback_chain_from_selection(&selection), vec![Cpu]);
    }

    #[test]
    fn runtime_fallback_chain_forces_cpu_only_when_hardware_was_selected() {
        use super::EncoderBackend::*;
        let selection = super::EncoderSelection {
            selected: Nvenc,
            results: vec![super::EncoderProbeResult {
                backend: Nvenc,
                available: true,
                reason: "ok".into(),
            }],
        };
        // Forced CPU (prefer_hardware = false) must not retry any hardware.
        assert_eq!(super::runtime_fallback_chain(&selection, Cpu), vec![Cpu]);
        assert_eq!(
            super::runtime_fallback_chain(&selection, Nvenc),
            vec![Nvenc, Cpu]
        );
    }

    #[test]
    fn encoder_pixel_format_is_nv12_for_windows_hardware_and_yuv420p_elsewhere() {
        assert_eq!(
            super::encoder_pixel_format(super::EncoderBackend::Nvenc),
            "nv12"
        );
        assert_eq!(
            super::encoder_pixel_format(super::EncoderBackend::Amf),
            "nv12"
        );
        assert_eq!(
            super::encoder_pixel_format(super::EncoderBackend::Qsv),
            "nv12"
        );
        assert_eq!(
            super::encoder_pixel_format(super::EncoderBackend::VideoToolbox),
            "yuv420p"
        );
        assert_eq!(
            super::encoder_pixel_format(super::EncoderBackend::Cpu),
            "yuv420p"
        );
    }

    #[test]
    fn recommendation_grids_adapt_landscape_portrait_and_ultrawide_and_respect_the_maximum_count() {
        let landscape = super::recommendation_grids(3840, 2160);
        let portrait = super::recommendation_grids(1080, 1920);
        let ultrawide = super::recommendation_grids(3440, 1080);
        for grid in landscape
            .iter()
            .chain(portrait.iter())
            .chain(ultrawide.iter())
        {
            assert!(
                grid.columns * grid.rows <= 12,
                "too many watermarks: {}x{}",
                grid.columns,
                grid.rows
            );
        }
        assert_eq!((landscape[0].columns, landscape[0].rows), (3, 2));
        assert_eq!((portrait[0].columns, portrait[0].rows), (2, 3));
        assert_eq!((ultrawide[0].columns, ultrawide[0].rows), (5, 2));
    }

    #[test]
    fn recommendation_size_keeps_rotated_bounding_boxes_inside_cells_with_a_gutter() {
        for (width, height) in [(3840u32, 2160u32), (1920, 1080), (1080, 1920), (3440, 1080)] {
            let estimate = super::watermark_recommendation_estimate(
                Path::new("/unused/ffprobe"),
                width,
                height,
                "text",
                "©KURO GAMES ALL RIGHTS RESERVED",
                None,
            )
            .unwrap();
            let grids = super::recommendation_grids(width, height);
            let feasible = grids.iter().find_map(|grid| {
                super::max_recommended_size(&estimate, width, height, *grid, 1, 10, 30, 0.24)
                    .map(|size| (*grid, size))
            });
            let (grid, size) = feasible
                .unwrap_or_else(|| panic!("no feasible recommendation for {width}x{height}"));
            let percent = size as f64;
            let rotated = super::rotated_bounding_box(
                estimate.width_per_percent * percent,
                estimate.height_per_percent * percent,
                30,
            );
            assert!(rotated.0 <= width as f64 / grid.columns as f64 * 0.82);
            assert!(rotated.1 <= height as f64 / grid.rows as f64 * 0.82);
        }
    }

    #[test]
    fn encoder_quality_args_use_backend_specific_public_parameters() {
        let cpu_high = super::video_encoder_args(super::EncoderBackend::Cpu, Some("high"));
        let cpu_compact = super::video_encoder_args(super::EncoderBackend::Cpu, Some("compact"));
        assert!(cpu_high
            .iter()
            .any(|arg| arg == "-crf" && cpu_high.iter().any(|value| value == "18")));
        assert!(cpu_compact.iter().any(|value| value == "28"));

        // NVENC constant quality: -rc vbr -cq <v> -b:v 0.
        let nvenc_high = super::video_encoder_args(super::EncoderBackend::Nvenc, Some("high"));
        assert!(nvenc_high.iter().any(|arg| arg == "-rc"));
        assert!(nvenc_high.iter().any(|value| value == "vbr"));
        assert!(nvenc_high.iter().any(|arg| arg == "-cq"));
        assert!(nvenc_high.iter().any(|value| value == "18"));
        assert!(nvenc_high.iter().any(|arg| arg == "-b:v"));
        assert!(nvenc_high.iter().any(|value| value == "0"));

        // AMF constant QP: -rc cqp + per-frame QP.
        let amf_balanced = super::video_encoder_args(super::EncoderBackend::Amf, Some("balanced"));
        assert!(amf_balanced.iter().any(|arg| arg == "-rc"));
        assert!(amf_balanced.iter().any(|value| value == "cqp"));
        assert!(amf_balanced.iter().any(|arg| arg == "-qp_i"));
        assert!(amf_balanced.iter().any(|value| value == "23"));

        // QSV ICQ constant quality: -global_quality <v>.
        let qsv_compact = super::video_encoder_args(super::EncoderBackend::Qsv, Some("compact"));
        assert!(qsv_compact.iter().any(|arg| arg == "-global_quality"));
        assert!(qsv_compact.iter().any(|value| value == "28"));

        let videotoolbox_balanced =
            super::video_encoder_args(super::EncoderBackend::VideoToolbox, Some("balanced"));
        assert!(videotoolbox_balanced.iter().any(|arg| arg == "-b:v"));
        assert!(videotoolbox_balanced.iter().any(|value| value == "4000k"));
    }

    #[test]
    fn encoder_backend_request_respects_explicit_cpu_preference() {
        assert_eq!(
            super::encoder_backend_for_request(Some(false), super::EncoderBackend::Nvenc),
            super::EncoderBackend::Cpu
        );
        assert_eq!(
            super::encoder_backend_for_request(None, super::EncoderBackend::Nvenc),
            super::EncoderBackend::Nvenc
        );
        assert_eq!(
            super::encoder_backend_for_request(Some(true), super::EncoderBackend::Cpu),
            super::EncoderBackend::Cpu
        );
    }

    #[test]
    fn hardware_fallback_classifier_uses_conservative_backend_whitelist() {
        use super::EncoderBackend::*;
        assert!(super::is_hardware_fallback_error(
            "Cannot load nvenc library",
            Nvenc
        ));
        assert!(super::is_hardware_fallback_error(
            "Failed to initialize videotoolbox encoder",
            VideoToolbox
        ));
        assert!(super::is_hardware_fallback_error(
            "Failed to create MFX session",
            Qsv
        ));
        assert!(super::is_hardware_fallback_error(
            "Failed to create AMF context",
            Amf
        ));
        assert!(super::is_hardware_fallback_error(
            "device is not available",
            Nvenc
        ));
        assert!(super::is_hardware_fallback_error(
            "Cannot load nvcuda.dll",
            Nvenc
        ));
    }

    #[test]
    fn hardware_fallback_classifier_rejects_filter_path_disk_and_param_errors() {
        use super::EncoderBackend::*;
        for (stderr, backend) in [
            ("Invalid argument", Nvenc),
            ("Option not found", Nvenc),
            ("Unrecognized option 'preset'", Amf),
            ("No such file or directory", Qsv),
            ("Permission denied", Nvenc),
            ("Error opening output file denied.mp4", Amf),
            ("No space left on device", Qsv),
            ("No such filter: 'drawtext'", Nvenc),
            ("Error initializing filter 'scale'", VideoToolbox),
            ("Cannot open font file", Nvenc),
            ("Error validating output: codec mismatch", Nvenc),
            ("Failed to finalize output", Nvenc),
            (
                "Failed to set value 'x' for option 'preset': Invalid argument",
                Nvenc,
            ),
        ] {
            assert!(
                !super::is_hardware_fallback_error(stderr, backend),
                "must not fall back for: {stderr}"
            );
        }
    }

    #[test]
    fn hardware_fallback_classifier_does_not_let_generic_invalid_argument_mask_device_errors() {
        use super::EncoderBackend::*;
        // A generic EINVAL string must not override an explicit device/session
        // init failure for the same backend (public NVENC/AMF/QSV semantics).
        assert!(super::is_hardware_fallback_error(
            "[h264_nvenc @ 0x0] OpenEncodeSessionEx failed: invalid argument (4)",
            Nvenc
        ));
        assert!(super::is_hardware_fallback_error(
            "AMF_ERROR_INVALID_ARG creating encoder context",
            Amf
        ));
        assert!(super::is_hardware_fallback_error(
            "MFX init failed: invalid argument",
            Qsv
        ));
        // Without any backend/device marker a bare EINVAL stays terminal.
        assert!(!super::is_hardware_fallback_error(
            "invalid argument",
            Nvenc
        ));
    }

    #[test]
    fn validate_probe_json_accepts_exact_h264_1280x720_yuv420p_with_frames() {
        assert!(super::validate_probe_json(
            r#"{"streams":[{"codec_type":"video","codec_name":"h264","pix_fmt":"yuv420p","width":1280,"height":720,"nb_frames":"120"}]}"#
        )
        .is_ok());
    }

    #[test]
    fn validate_probe_json_rejects_mismatched_codec_size_pix_fmt_or_frames() {
        let cases = [
            r#"{"streams":[{"codec_type":"video","codec_name":"hevc","pix_fmt":"yuv420p","width":1280,"height":720,"nb_frames":"120"}]}"#,
            r#"{"streams":[{"codec_type":"video","codec_name":"h264","pix_fmt":"yuv420p","width":1920,"height":1080,"nb_frames":"120"}]}"#,
            r#"{"streams":[{"codec_type":"video","codec_name":"h264","pix_fmt":"nv12","width":1280,"height":720,"nb_frames":"120"}]}"#,
            r#"{"streams":[{"codec_type":"video","codec_name":"h264","pix_fmt":"yuv420p","width":1280,"height":720,"nb_frames":"0"}]}"#,
            r#"{"streams":[{"codec_type":"video","codec_name":"h264","pix_fmt":"yuv420p","width":1280,"height":720}]}"#,
        ];
        for json in cases {
            assert!(
                super::validate_probe_json(json).is_err(),
                "must reject: {json}"
            );
        }
    }

    #[test]
    fn validate_probe_json_rejects_missing_or_non_video_streams() {
        assert!(super::validate_probe_json(r#"{"streams":[]}"#).is_err());
        assert!(super::validate_probe_json(
            r#"{"streams":[{"codec_type":"audio","codec_name":"aac"}]}"#
        )
        .is_err());
    }

    #[test]
    fn bounded_command_captures_output_and_succeeds_within_the_deadline() {
        #[cfg(windows)]
        let mut command = std::process::Command::new("cmd");
        #[cfg(not(windows))]
        let mut command = std::process::Command::new("echo");
        #[cfg(windows)]
        command.args(["/C", "echo ok"]);
        #[cfg(not(windows))]
        command.arg("ok");
        let out = super::run_command_bounded(command, std::time::Duration::from_secs(5)).unwrap();
        assert!(out.status.is_some_and(|s| s.success()));
        let stdout = String::from_utf8_lossy(&out.stdout);
        assert!(stdout.contains("ok"), "stdout was: {stdout}");
    }

    #[test]
    #[cfg(unix)]
    fn bounded_command_kills_and_reports_a_timeout() {
        let start = std::time::Instant::now();
        let mut command = std::process::Command::new("sleep");
        command.arg("30");
        let result = super::run_command_bounded(command, std::time::Duration::from_millis(200));
        assert!(result.is_err(), "expected a timeout error");
        assert!(
            result.unwrap_err().contains("超时"),
            "timeout reason must be specific"
        );
        assert!(
            start.elapsed() < std::time::Duration::from_secs(5),
            "bounded command did not terminate promptly"
        );
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn session_probe_reports_videotoolbox_availability_without_temp_files() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let ffprobe = bundled_test_sidecar("ffprobe");
        // Real probe; on CI without VideoToolbox this legitimately returns false.
        let result = super::probe_encoder(&ffmpeg, &ffprobe, super::EncoderBackend::VideoToolbox);
        assert_eq!(result.backend, super::EncoderBackend::VideoToolbox);
        // Probe must not leave any temp file behind.
        let leftovers = std::fs::read_dir(std::env::temp_dir())
            .unwrap()
            .filter_map(Result::ok)
            .any(|e| e.file_name().to_string_lossy().contains("bmw-hw-probe"));
        assert!(!leftovers, "hardware probe left a temp file");
        // Cache must be stable across repeated calls (same result object).
        let cached =
            super::cached_encoder_probe(&ffmpeg, &ffprobe, super::EncoderBackend::VideoToolbox);
        assert_eq!(cached.available, result.available);
        let _ = result;
    }

    fn run_chain(
        chain: &[super::EncoderBackend],
        run: impl FnMut(super::EncoderBackend) -> (super::MediaTerminal, String),
    ) -> super::MediaTerminal {
        super::orchestrate_watermark_encode_chain(chain, run, &mut || {})
    }

    #[test]
    fn orchestrate_watermark_encode_falls_back_once_only_for_hardware_errors() {
        use super::EncoderBackend::*;
        let attempts = std::cell::RefCell::new(Vec::new());
        let run = |backend: super::EncoderBackend| {
            attempts.borrow_mut().push(backend);
            match backend {
                Nvenc => (
                    super::MediaTerminal::Failed {
                        message: "nvenc init failed".into(),
                    },
                    "Cannot load nvenc library".to_string(),
                ),
                Cpu => (
                    super::MediaTerminal::Completed {
                        output_path: "out.mp4".into(),
                        output_bytes: 1,
                    },
                    String::new(),
                ),
                _ => unreachable!(),
            }
        };
        let outcome = run_chain(&[Nvenc, Cpu], run);
        assert!(matches!(outcome, super::MediaTerminal::Completed { .. }));
        assert_eq!(*attempts.borrow(), vec![Nvenc, Cpu]);
    }

    #[test]
    fn orchestrate_watermark_encode_does_not_fallback_for_unknown_or_non_hardware_errors() {
        use super::EncoderBackend::*;
        for (stderr, expected_attempts) in [
            ("Invalid argument".to_string(), 1),
            ("Error opening output file denied.mp4".to_string(), 1),
            ("No such file or directory".to_string(), 1),
            ("Permission denied".to_string(), 1),
            ("No such filter: 'drawtext'".to_string(), 1),
            ("Cannot open font file".to_string(), 1),
            ("Error validating output: codec mismatch".to_string(), 1),
            ("Failed to finalize output".to_string(), 1),
        ] {
            let count = std::cell::RefCell::new(0);
            let run = |backend: super::EncoderBackend| {
                *count.borrow_mut() += 1;
                let _ = backend;
                (
                    super::MediaTerminal::Failed {
                        message: "failed".into(),
                    },
                    stderr.clone(),
                )
            };
            let outcome = run_chain(&[Nvenc, Cpu], run);
            assert!(matches!(outcome, super::MediaTerminal::Failed { .. }));
            assert_eq!(*count.borrow(), expected_attempts, "stderr={stderr}");
        }
    }

    #[test]
    fn orchestrate_watermark_encode_cancelled_does_not_fallback() {
        use super::EncoderBackend::*;
        let count = std::cell::RefCell::new(0);
        let run = |_: super::EncoderBackend| {
            *count.borrow_mut() += 1;
            (super::MediaTerminal::Cancelled, String::new())
        };
        let outcome = run_chain(&[Nvenc, Cpu], run);
        assert_eq!(outcome, super::MediaTerminal::Cancelled);
        assert_eq!(*count.borrow(), 1);
    }

    #[test]
    fn orchestrate_watermark_encode_hardware_success_runs_once() {
        use super::EncoderBackend::*;
        let attempts = std::cell::RefCell::new(Vec::new());
        let run = |backend: super::EncoderBackend| {
            attempts.borrow_mut().push(backend);
            (
                super::MediaTerminal::Completed {
                    output_path: "out.mp4".into(),
                    output_bytes: 1,
                },
                String::new(),
            )
        };
        let outcome = run_chain(&[Nvenc, Cpu], run);
        assert!(matches!(outcome, super::MediaTerminal::Completed { .. }));
        assert_eq!(*attempts.borrow(), vec![Nvenc]);
    }

    #[test]
    fn orchestrate_watermark_encode_hardware_then_cpu_failure_runs_twice_and_fails_once() {
        use super::EncoderBackend::*;
        let attempts = std::cell::RefCell::new(Vec::new());
        let run = |backend: super::EncoderBackend| {
            attempts.borrow_mut().push(backend);
            match backend {
                Nvenc => (
                    super::MediaTerminal::Failed {
                        message: "nvenc init failed".into(),
                    },
                    "Cannot load nvenc library".to_string(),
                ),
                Cpu => (
                    super::MediaTerminal::Failed {
                        message: "cpu failed".into(),
                    },
                    String::new(),
                ),
                _ => unreachable!(),
            }
        };
        let outcome = run_chain(&[Nvenc, Cpu], run);
        assert!(matches!(outcome, super::MediaTerminal::Failed { .. }));
        assert_eq!(*attempts.borrow(), vec![Nvenc, Cpu]);
    }

    #[test]
    fn orchestrate_watermark_encode_device_loss_whitelist_falls_back() {
        use super::EncoderBackend::*;
        let attempts = std::cell::RefCell::new(Vec::new());
        let run = |backend: super::EncoderBackend| {
            attempts.borrow_mut().push(backend);
            match backend {
                Nvenc => (
                    super::MediaTerminal::Failed {
                        message: "encoder lost".into(),
                    },
                    "device is not available".to_string(),
                ),
                Cpu => (
                    super::MediaTerminal::Completed {
                        output_path: "out.mp4".into(),
                        output_bytes: 1,
                    },
                    String::new(),
                ),
                _ => unreachable!(),
            }
        };
        let outcome = run_chain(&[Nvenc, Cpu], run);
        assert!(matches!(outcome, super::MediaTerminal::Completed { .. }));
        assert_eq!(*attempts.borrow(), vec![Nvenc, Cpu]);
    }

    #[test]
    fn orchestrate_watermark_encode_cpu_backend_never_falls_back_even_with_device_stderr() {
        use super::EncoderBackend::*;
        let attempts = std::cell::RefCell::new(Vec::new());
        let run = |backend: super::EncoderBackend| {
            attempts.borrow_mut().push(backend);
            (
                super::MediaTerminal::Failed {
                    message: "failed".into(),
                },
                "device is not available".to_string(),
            )
        };
        let outcome = run_chain(&[Cpu], run);
        assert!(matches!(outcome, super::MediaTerminal::Failed { .. }));
        assert_eq!(*attempts.borrow(), vec![Cpu]);
    }

    #[test]
    fn orchestrate_watermark_encode_tries_each_windows_hardware_candidate_then_cpu() {
        use super::EncoderBackend::*;
        let attempts = std::cell::RefCell::new(Vec::new());
        let run = |backend: super::EncoderBackend| {
            attempts.borrow_mut().push(backend);
            match backend {
                Nvenc => (
                    super::MediaTerminal::Failed {
                        message: "nvenc failed".into(),
                    },
                    "Cannot load nvenc library".to_string(),
                ),
                Amf => (
                    super::MediaTerminal::Failed {
                        message: "amf failed".into(),
                    },
                    "Failed to create AMF context".to_string(),
                ),
                Qsv => (
                    super::MediaTerminal::Failed {
                        message: "qsv failed".into(),
                    },
                    "Failed to create MFX session".to_string(),
                ),
                Cpu => (
                    super::MediaTerminal::Completed {
                        output_path: "out.mp4".into(),
                        output_bytes: 1,
                    },
                    String::new(),
                ),
                _ => unreachable!(),
            }
        };
        let outcome = run_chain(&[Nvenc, Amf, Qsv, Cpu], run);
        assert!(matches!(outcome, super::MediaTerminal::Completed { .. }));
        assert_eq!(*attempts.borrow(), vec![Nvenc, Amf, Qsv, Cpu]);
    }

    #[test]
    fn session_probe_cache_runs_once_under_concurrency() {
        let cache = std::sync::OnceLock::new();
        let calls = std::sync::atomic::AtomicUsize::new(0);
        std::thread::scope(|scope| {
            let mut handles = Vec::new();
            for _ in 0..8 {
                handles.push(scope.spawn(|| {
                    super::cached_probe(&cache, || {
                        calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                        true
                    })
                }));
            }
            for handle in handles {
                assert!(handle.join().unwrap());
            }
        });
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
        // The cached value is stable and the probe is not re-run.
        assert!(super::cached_probe(&cache, || {
            calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            false
        }));
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
    }

    #[test]
    fn session_probe_cache_retains_false_without_rerunning() {
        let cache = std::sync::OnceLock::new();
        let calls = std::sync::atomic::AtomicUsize::new(0);
        let first = super::cached_probe(&cache, || {
            calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            false
        });
        assert!(!first);
        let second = super::cached_probe(&cache, || {
            calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            true
        });
        assert!(!second);
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
    }

    #[test]
    fn video_watermark_args_lock_libx264_aac_yuv420p_faststart_and_optional_audio() {
        let tmp = std::env::temp_dir().join(format!("brand-media-wm-video-{}", std::process::id()));
        fs::create_dir_all(&tmp).unwrap();
        let mut req = watermark_request(
            &tmp,
            "text",
            "视频水印",
            None,
            "bottom-right",
            10,
            0.5,
            true,
        );
        let input = tmp.join("clip.mp4");
        fs::write(&input, b"fake-video").unwrap();
        req.input_path = input.to_string_lossy().into_owned();
        let (args, _cleanup) =
            test_watermark_args(&req, Path::new("/tmp/输出 文件夹/clip_watermarked.mp4"));
        let values: Vec<String> = args
            .iter()
            .map(|v| v.to_string_lossy().into_owned())
            .collect();
        assert!(values.contains(&"-c:v".into()));
        assert!(values.contains(&"libx264".into()));
        assert!(values.contains(&"-c:a".into()));
        assert!(values.contains(&"aac".into()));
        assert!(values.contains(&"-pix_fmt".into()));
        assert!(values.contains(&"yuv420p".into()));
        assert!(values.contains(&"-movflags".into()));
        assert!(values.contains(&"+faststart".into()));
        assert!(values.contains(&"0:a?".into()));
        assert!(
            !values.contains(&"-frames:v".into()),
            "video must not carry a static single-frame flag"
        );
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn text_watermark_default_tiled_filter_uses_drawtext_variables() {
        let tmp =
            std::env::temp_dir().join(format!("brand-media-wm-txt-tiled-{}", std::process::id()));
        fs::create_dir_all(&tmp).unwrap();
        let mut request =
            watermark_request(&tmp, "text", "水印", None, "bottom-right", 10, 0.5, true);
        request.options.pattern = Some("tiled".into());
        let (filter, cleanup) = super::watermark_filter_with_font(
            Some(Path::new("/tmp/test-font.otf")),
            &request,
            None,
        )
        .expect("production filter");
        for path in cleanup {
            let _ = fs::remove_file(path);
        }
        assert!(
            filter.contains("drawtext"),
            "text tiled filter must contain drawtext"
        );
        assert!(filter.contains("text_w"), "text tiled must contain text_w");
        assert!(
            !filter.contains("main_w"),
            "text tiled must not contain main_w"
        );
        assert!(
            !filter.contains("overlay_w"),
            "text tiled must not contain overlay_w"
        );
        assert!(
            filter.contains("((w-text_w)*1/6 )"),
            "unexpected filter: {filter}"
        );
        assert!(
            filter.contains("((w-text_w)*5/6 )"),
            "unexpected filter: {filter}"
        );
        assert!(
            filter.contains("((h-text_h)*1/4 )"),
            "unexpected filter: {filter}"
        );
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn explicit_render_plan_placements_override_legacy_grid_coordinates() {
        let tmp = std::env::temp_dir().join(format!("brand-media-wm-plan-{}", std::process::id()));
        fs::create_dir_all(&tmp).unwrap();
        let mut request = watermark_request(&tmp, "text", "水印", None, "center", 5, 0.5, true);
        request.options.placements = Some(vec![
            super::WatermarkPlacement {
                x_percent: 20.0,
                y_percent: 30.0,
            },
            super::WatermarkPlacement {
                x_percent: 80.0,
                y_percent: 70.0,
            },
        ]);
        request.options.columns = Some(9);
        request.options.rows = Some(9);
        let (filter, cleanup) = super::watermark_filter_with_font(
            Some(Path::new("/tmp/test-font.otf")),
            &request,
            None,
        )
        .expect("production filter");
        for path in cleanup {
            let _ = fs::remove_file(path);
        }
        // The render-plan path draws one centered text sprite and overlays it at
        // each pre-rotated placement center instead of emitting one drawtext per
        // grid cell.
        assert_eq!(filter.matches("drawtext=").count(), 1);
        assert!(filter.contains("x=(w-text_w)/2"));
        assert!(filter.contains("overlay=x=0.2*W-w/2:y=0.3*H-h/2"));
        assert!(filter.contains("overlay=x=0.8*W-w/2:y=0.7*H-h/2"));
        assert!(!filter.contains("(w-text_w)*0.2"));
        assert!(!filter.contains("((w-text_w)*1/18"));
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn render_plan_text_placements_rotate_once_without_double_rotating() {
        let tmp =
            std::env::temp_dir().join(format!("brand-media-wm-sprite-{}", std::process::id()));
        fs::create_dir_all(&tmp).unwrap();
        let mut request =
            watermark_request(&tmp, "text", "旋转水印", None, "center", 5, 0.56, true);
        request.options.placements = Some(vec![
            super::WatermarkPlacement {
                x_percent: 20.0,
                y_percent: 30.0,
            },
            super::WatermarkPlacement {
                x_percent: 80.0,
                y_percent: 70.0,
            },
        ]);
        request.options.angle = Some(45);
        let (filter, cleanup) = super::watermark_filter_with_font(
            Some(Path::new("/tmp/test-font.otf")),
            &request,
            None,
        )
        .expect("production filter");
        for path in cleanup {
            let _ = fs::remove_file(path);
        }
        // Exactly one rotation (the sprite), never a whole-layer rotate plus a
        // second rotation of already-rotated centers.
        assert_eq!(filter.matches("drawtext=").count(), 1);
        assert_eq!(filter.matches("rotate=").count(), 1);
        assert!(
            filter.contains("colorchannelmixer=aa=0.56"),
            "single application alpha, not drawtext alpha: {filter}"
        );
        assert!(
            !filter.contains("alpha=0.56"),
            "no double-blended drawtext alpha: {filter}"
        );
        assert!(filter.contains("rotate=0.78539816"));
        assert!(!filter.contains("overlay=(W-w)/2"));
        assert!(filter.contains("overlay=x=0.2*W-w/2:y=0.3*H-h/2"));
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn watermark_text_opacity_ignores_legacy_dark_mode_override() {
        let tmp =
            std::env::temp_dir().join(format!("brand-media-wm-opacity-{}", std::process::id()));
        fs::create_dir_all(&tmp).unwrap();
        let mut request = watermark_request(&tmp, "text", "水印", None, "center", 5, 0.56, true);
        request.options.placements = Some(vec![super::WatermarkPlacement {
            x_percent: 50.0,
            y_percent: 50.0,
        }]);
        request.options.dark_mode = Some(true);
        let (filter, cleanup) = super::watermark_filter_with_font(
            Some(Path::new("/tmp/test-font.otf")),
            &request,
            None,
        )
        .expect("production filter");
        for path in cleanup {
            let _ = fs::remove_file(path);
        }
        assert!(
            filter.contains("colorchannelmixer=aa=0.56"),
            "single application alpha: {filter}"
        );
        assert!(
            !filter.contains("alpha=0.56"),
            "no drawtext alpha double blend: {filter}"
        );
        assert!(
            !filter.contains("aa=0.06"),
            "dark mode override must stay ignored: {filter}"
        );
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn render_plan_placements_fit_inside_frame_and_do_not_overlap() {
        let text = "©KURO GAMES ALL RIGHTS RESERVED";
        let (width_units, height_units) = super::text_watermark_estimate_units(text);
        let font_height = 2160.0 * 0.03;
        let (bbox_width, bbox_height) =
            super::rotated_bounding_box(font_height * width_units, font_height * height_units, 30);
        let placements = vec![
            (
                508.5905593292539 / 3840.0 * 100.0,
                320.38468900814064 / 2160.0 * 100.0,
            ),
            (1920.0 / 3840.0 * 100.0, 320.38468900814064 / 2160.0 * 100.0),
            (
                3331.4094406707463 / 3840.0 * 100.0,
                320.38468900814064 / 2160.0 * 100.0,
            ),
            (
                508.5905593292539 / 3840.0 * 100.0,
                1839.6153109918594 / 2160.0 * 100.0,
            ),
            (50.0, 1839.6153109918594 / 2160.0 * 100.0),
            (
                3331.4094406707463 / 3840.0 * 100.0,
                1839.6153109918594 / 2160.0 * 100.0,
            ),
        ];
        for (index, (x_percent, y_percent)) in placements.iter().enumerate() {
            let cx = x_percent / 100.0 * 3840.0;
            let cy = y_percent / 100.0 * 2160.0;
            assert!(
                cx - bbox_width / 2.0 >= -0.01 && cx + bbox_width / 2.0 <= 3840.01,
                "placement {index} overflows horizontally"
            );
            assert!(
                cy - bbox_height / 2.0 >= -0.01 && cy + bbox_height / 2.0 <= 2160.01,
                "placement {index} overflows vertically"
            );
            for other in &placements[index + 1..] {
                let other_x = other.0 / 100.0 * 3840.0;
                let other_y = other.1 / 100.0 * 2160.0;
                let overlaps_x = (cx - other_x).abs() < bbox_width;
                let overlaps_y = (cy - other_y).abs() < bbox_height;
                assert!(
                    !(overlaps_x && overlaps_y),
                    "placement {index} overlaps another placement"
                );
            }
        }
    }

    #[test]
    fn image_watermark_filter_uses_overlay_variables() {
        let tmp =
            std::env::temp_dir().join(format!("brand-media-wm-img-overlay-{}", std::process::id()));
        fs::create_dir_all(&tmp).unwrap();
        let args = test_watermark_args(
            &watermark_request(
                &tmp,
                "image",
                "",
                Some("/tmp/logo.png"),
                "bottom-right",
                15,
                0.4,
                false,
            ),
            Path::new("/tmp/out.png"),
        );
        let filter = extract_filter(&args.0);
        assert!(
            filter.contains("overlay"),
            "image filter must contain overlay"
        );
        assert!(
            filter.contains("main_w"),
            "image filter must contain main_w"
        );
        assert!(
            filter.contains("overlay_w"),
            "image filter must contain overlay_w"
        );
        assert!(
            !filter.contains("text_w"),
            "image filter must not contain text_w"
        );
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn watermark_filter_consumes_angle_for_text_and_logo() {
        let tmp = std::env::temp_dir().join(format!("brand-media-wm-angle-{}", std::process::id()));
        fs::create_dir_all(&tmp).unwrap();
        let mut request =
            watermark_request(&tmp, "text", "旋转水印", None, "center", 10, 0.5, true);
        request.options.pattern = Some("single".into());
        request.options.angle = Some(45);
        let text =
            super::watermark_filter_with_font(Some(Path::new("/tmp/font.otf")), &request, None)
                .expect("text filter");
        assert!(text.0.contains("rotate=0.78539816"));
        assert!(!text.0.contains("[0:v]rotate="));
        assert!(text
            .0
            .contains("[base][text-rotated]overlay=(W-w)/2:(H-h)/2"));

        request.options.kind = "image".into();
        request.options.image_path = Some("/tmp/logo.png".into());
        let logo = super::watermark_filter_with_font(None, &request, None).expect("logo filter");
        let filter = logo.0;
        assert!(filter.contains("[watermark]rotate=0.78539816"));
        assert!(filter.contains("ow=iw*0.70710678+ih*0.70710678"));
        assert!(filter.contains("[watermark-rotated]overlay="));
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn legacy_text_filter_overlay_always_references_colorchannelmixer_output() {
        let tmp = std::env::temp_dir().join(format!(
            "brand-media-wm-overlay-label-{}",
            std::process::id()
        ));
        fs::create_dir_all(&tmp).unwrap();

        let build = |angle: i32| {
            let mut request =
                watermark_request(&tmp, "text", "水印", None, "bottom-right", 10, 0.5, true);
            request.options.pattern = Some("single".into());
            request.options.angle = Some(angle);
            let (filter, cleanup) =
                super::watermark_filter_with_font(Some(Path::new("/tmp/font.otf")), &request, None)
                    .expect("text filter");
            for path in cleanup {
                let _ = fs::remove_file(path);
            }
            filter
        };

        // angle == 0: the colorchannelmixer consumes `text-complete` and emits
        // `text-faded`; the final overlay must reference `text-faded`. The bug
        // this locks in made the overlay consume `text-complete` a second time,
        // which FFmpeg rejects with "Invalid stream specifier text-complete".
        let zero = build(0);
        assert!(
            zero.contains("[text-complete]colorchannelmixer=aa=0.5[text-faded]"),
            "colorchannelmixer must consume text-complete and emit text-faded: {zero}"
        );
        assert!(
            zero.contains("[base][text-faded]overlay=(W-w)/2:(H-h)/2"),
            "angle==0 overlay must reference text-faded, the colorchannelmixer output: {zero}"
        );
        assert!(
            !zero.contains("[base][text-complete]overlay"),
            "text-complete must not be consumed twice: {zero}"
        );
        assert_eq!(
            zero.matches("text-complete").count(),
            2,
            "text-complete appears exactly once as a drawtext output and once as the colorchannelmixer input: {zero}"
        );

        // angle != 0: the overlay references the rotate output instead.
        let rotated = build(45);
        assert!(
            rotated.contains("[base][text-rotated]overlay=(W-w)/2:(H-h)/2"),
            "angle!=0 overlay must reference text-rotated: {rotated}"
        );
        assert!(
            !rotated.contains("[base][text-complete]overlay"),
            "text-complete must never be the overlay input: {rotated}"
        );

        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn text_style_drawtext_maps_white_black_and_outlined() {
        assert_eq!(
            super::text_style_drawtext(None, None),
            ("white".to_string(), String::new())
        );
        assert_eq!(
            super::text_style_drawtext(Some("white"), None),
            ("white".to_string(), String::new())
        );
        assert_eq!(
            super::text_style_drawtext(Some("black"), None),
            ("black".to_string(), String::new())
        );
        let (color, extra) = super::text_style_drawtext(Some("outlined"), Some(4));
        assert_eq!(color, "white");
        assert!(extra.contains("bordercolor=black"), "extra: {extra}");
        // `borderw` must be the concrete integer passed in — never a
        // `max(1, ...)` / `min(w,h)` expression, because drawtext `borderw` is
        // an `int` and cannot evaluate filter expressions.
        assert_eq!(extra, ":bordercolor=black:borderw=4", "extra: {extra}");
    }

    #[test]
    fn outlined_border_width_rounds_and_floors_at_one() {
        // Matches the Canvas `max(1, round(fontPx * 0.08))` formula.
        assert_eq!(super::outlined_border_width(54.0), 4); // 4.32 -> 4
        assert_eq!(super::outlined_border_width(10.0), 1); // 0.80 -> 1
        assert_eq!(super::outlined_border_width(0.0), 1); // 0 -> floored at 1
        assert_eq!(super::outlined_border_width(13.0), 1); // 1.04 -> 1
        assert_eq!(super::outlined_border_width(60.0), 5); // 4.80 -> 5
    }

    #[test]
    fn outlined_text_watermark_filter_includes_scaled_border() {
        let tmp =
            std::env::temp_dir().join(format!("brand-media-wm-outline-{}", std::process::id()));
        fs::create_dir_all(&tmp).unwrap();
        let mut request = watermark_request(&tmp, "text", "描边水印", None, "center", 5, 0.5, true);
        request.options.placements = Some(vec![
            super::WatermarkPlacement {
                x_percent: 20.0,
                y_percent: 20.0,
            },
            super::WatermarkPlacement {
                x_percent: 80.0,
                y_percent: 80.0,
            },
        ]);
        request.options.text_style = Some("outlined".into());
        // 1920x1080 → short edge 1080 → font 1080*5/100 = 54 → border 4.
        let filter = super::watermark_filter_with_font(
            Some(Path::new("/tmp/font.otf")),
            &request,
            Some((1920, 1080)),
        )
        .expect("outlined filter")
        .0;
        assert!(
            filter.contains("bordercolor=black:borderw=4"),
            "outlined filter must carry a concrete integer border width: {filter}"
        );
        assert!(
            !filter.contains("borderw=max") && !filter.contains("borderw=min"),
            "borderw must be a literal integer, not an expression: {filter}"
        );
        assert!(
            !filter.contains("fontcolor=white:fontsize"),
            "outlined filter must not leave a bare white fontcolor: {filter}"
        );
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn outlined_text_watermark_requires_source_size() {
        let tmp = std::env::temp_dir().join(format!(
            "brand-media-wm-outline-nosize-{}",
            std::process::id()
        ));
        fs::create_dir_all(&tmp).unwrap();
        let mut request = watermark_request(&tmp, "text", "描边水印", None, "center", 5, 0.5, true);
        request.options.placements = Some(vec![
            super::WatermarkPlacement {
                x_percent: 20.0,
                y_percent: 20.0,
            },
            super::WatermarkPlacement {
                x_percent: 80.0,
                y_percent: 80.0,
            },
        ]);
        request.options.text_style = Some("outlined".into());
        let result =
            super::watermark_filter_with_font(Some(Path::new("/tmp/font.otf")), &request, None);
        assert!(
            result.is_err(),
            "outlined text without a source size must fail"
        );
        assert!(
            result.unwrap_err().contains("源视频尺寸"),
            "error must name the missing source size"
        );
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn dense_text_watermark_args_use_a_single_overlay_input() {
        let tmp = std::env::temp_dir().join(format!("brand-media-wm-dense-{}", std::process::id()));
        fs::create_dir_all(&tmp).unwrap();
        let mut request = watermark_request(&tmp, "text", "密集水印", None, "center", 5, 0.5, true);
        request.input_path = tmp.join("source.mp4").to_string_lossy().into_owned();
        request.options.placements = Some(vec![
            super::WatermarkPlacement {
                x_percent: 10.0,
                y_percent: 10.0,
            },
            super::WatermarkPlacement {
                x_percent: 50.0,
                y_percent: 50.0,
            },
            super::WatermarkPlacement {
                x_percent: 90.0,
                y_percent: 90.0,
            },
        ]);
        let overlay = tmp.join("overlay.png");
        let (args, cleanup) = super::watermark_ffmpeg_args_with_font(
            Some(Path::new("/tmp/font.otf")),
            &request,
            &tmp.join("out.mp4"),
            super::EncoderBackend::Cpu,
            Some(&overlay),
            None,
        )
        .unwrap();
        assert!(
            cleanup.is_empty(),
            "overlay path must be managed by the caller"
        );
        let values: Vec<String> = args
            .iter()
            .map(|v| v.to_string_lossy().into_owned())
            .collect();
        let input_count = values.iter().filter(|v| *v == "-i").count();
        assert_eq!(
            input_count, 2,
            "overlay path must use two inputs: {values:?}"
        );
        assert!(
            values.contains(&overlay.to_string_lossy().into_owned()),
            "overlay input missing: {values:?}"
        );
        let filter = extract_filter(&args);
        // The single-frame overlay PNG must repeat across the whole video via
        // the explicit overlay EOF defaults, so the dense path still applies
        // exactly one overlay (no sprite split, no chained overlays).
        assert_eq!(
            filter, "[0:v][1:v]overlay=0:0:format=auto:eof_action=repeat:repeatlast=1[watermarked]",
            "dense text path must collapse to a single repeating overlay"
        );
        assert!(
            !filter.contains("split="),
            "dense text path must not split the sprite"
        );
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn angle_text_rotates_watermark_without_rotating_background() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let dir = std::env::temp_dir().join(format!("品牌水印角度像素 {}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("source.mp4");
        create_mp4_fixture(&ffmpeg, &input, false);
        let font = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/fonts/SourceHanSansSC-Regular.otf");
        let text_file = dir.join("text.txt");
        fs::write(&text_file, "角度测试").unwrap();

        let run_angle = |angle: i32, output: &Path| {
            let request = WatermarkMediaTaskRequest {
                task_id: format!("angle-{angle}"),
                input_path: input.to_string_lossy().into_owned(),
                options: WatermarkOptions {
                    kind: "text".into(),
                    text: "角度测试".into(),
                    image_path: None,
                    position: "bottom-right".into(),
                    size_percent: 8,
                    opacity: 0.85,
                    pattern: Some("single".into()),
                    density: None,
                    angle: Some(angle),
                    dark_mode: None,
                    offset_x: None,
                    offset_y: None,
                    columns: None,
                    rows: None,
                    placements: None,
                    quality: None,
                    prefer_hardware: None,
                    text_style: None,
                    reserved_output_path: None,
                    output_directory: dir.to_string_lossy().into_owned(),
                },
            };
            let (filter, cleanup) =
                super::watermark_filter_with_font(Some(&font), &request, None).unwrap();
            let result = std::process::Command::new(&ffmpeg)
                .args(["-hide_banner", "-nostdin", "-ss", "0", "-i"])
                .arg(&input)
                .args([
                    "-filter_complex",
                    &filter,
                    "-map",
                    "[watermarked]",
                    "-frames:v",
                    "1",
                    "-y",
                ])
                .arg(output)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::piped())
                .output()
                .unwrap();
            for path in cleanup {
                let _ = fs::remove_file(path);
            }
            assert!(
                result.status.success(),
                "angle {angle} output failed: {}",
                String::from_utf8_lossy(&result.stderr)
            );
        };

        let zero = dir.join("zero.png");
        let forty_five = dir.join("forty-five.png");
        run_angle(0, &zero);
        run_angle(45, &forty_five);

        let background = std::process::Command::new(&ffmpeg)
            .args(["-hide_banner", "-nostdin", "-i"])
            .arg(&zero)
            .args(["-i"])
            .arg(&forty_five)
            .args([
                "-lavfi",
                "[0:v]crop=100:80:0:0[a];[1:v]crop=100:80:0:0[b];[a][b]psnr",
                "-frames:v",
                "1",
                "-f",
                "null",
                "-",
            ])
            .output()
            .unwrap();
        assert!(
            String::from_utf8_lossy(&background.stderr).contains("average:inf"),
            "background must not change between angles: {}",
            String::from_utf8_lossy(&background.stderr)
        );

        let watermark = std::process::Command::new(&ffmpeg)
            .args(["-hide_banner", "-nostdin", "-i"])
            .arg(&zero)
            .args(["-i"])
            .arg(&forty_five)
            .args([
                "-lavfi",
                "[0:v][1:v]psnr",
                "-frames:v",
                "1",
                "-f",
                "null",
                "-",
            ])
            .output()
            .unwrap();
        assert!(
            !String::from_utf8_lossy(&watermark.stderr).contains("average:inf"),
            "watermark region must change between angles"
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn render_plan_text_sprite_filter_produces_valid_output() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let dir = std::env::temp_dir().join(format!("品牌砖型同源 {}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("source.mp4");
        create_fixture(&ffmpeg, &input);
        let font = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/fonts/SourceHanSansSC-Regular.otf");
        let request = WatermarkMediaTaskRequest {
            task_id: "render-plan-sprite".into(),
            input_path: input.to_string_lossy().into_owned(),
            options: WatermarkOptions {
                kind: "text".into(),
                text: "©KURO GAMES ALL RIGHTS RESERVED".into(),
                image_path: None,
                position: "center".into(),
                size_percent: 5,
                opacity: 0.56,
                pattern: Some("tiled".into()),
                density: Some("high".into()),
                angle: Some(45),
                dark_mode: Some(true),
                offset_x: None,
                offset_y: None,
                columns: None,
                rows: None,
                placements: Some(vec![
                    super::WatermarkPlacement {
                        x_percent: 25.0,
                        y_percent: 35.0,
                    },
                    super::WatermarkPlacement {
                        x_percent: 75.0,
                        y_percent: 65.0,
                    },
                ]),
                quality: None,
                prefer_hardware: None,
                text_style: None,
                reserved_output_path: None,
                output_directory: dir.to_string_lossy().into_owned(),
            },
        };
        let (filter, cleanup) =
            super::watermark_filter_with_font(Some(&font), &request, None).expect("sprite filter");
        let output = dir.join("watermarked.png");
        let result = std::process::Command::new(&ffmpeg)
            .args(["-hide_banner", "-nostdin", "-i"])
            .arg(&input)
            .args([
                "-filter_complex",
                &filter,
                "-map",
                "[watermarked]",
                "-frames:v",
                "1",
                "-y",
            ])
            .arg(&output)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .output()
            .unwrap();
        for path in cleanup {
            let _ = fs::remove_file(path);
        }
        assert!(
            result.status.success(),
            "render-plan sprite filter failed: {}",
            String::from_utf8_lossy(&result.stderr)
        );
        assert!(output.is_file());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn generate_text_watermark_overlay_makes_alpha_png_and_single_overlay_video_encode() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let ffprobe = bundled_test_sidecar("ffprobe");
        let dir = std::env::temp_dir().join(format!("品牌文字图层资产 {}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("source.mp4");
        create_mp4_fixture(&ffmpeg, &input, false);
        let font = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/fonts/SourceHanSansSC-Regular.otf");
        let request = WatermarkMediaTaskRequest {
            task_id: "overlay-asset".into(),
            input_path: input.to_string_lossy().into_owned(),
            options: WatermarkOptions {
                kind: "text".into(),
                text: "图层验证".into(),
                image_path: None,
                position: "center".into(),
                size_percent: 8,
                opacity: 0.6,
                pattern: Some("tiled".into()),
                density: None,
                angle: Some(45),
                dark_mode: None,
                offset_x: None,
                offset_y: None,
                columns: None,
                rows: None,
                placements: Some(vec![
                    super::WatermarkPlacement {
                        x_percent: 25.0,
                        y_percent: 30.0,
                    },
                    super::WatermarkPlacement {
                        x_percent: 75.0,
                        y_percent: 70.0,
                    },
                ]),
                quality: None,
                prefer_hardware: Some(false),
                text_style: Some("outlined".into()),
                reserved_output_path: None,
                output_directory: dir.to_string_lossy().into_owned(),
            },
        };

        // 1) Real generation through the production helper (runs bundled FFmpeg).
        let overlay =
            super::generate_text_watermark_overlay(&ffmpeg, &ffprobe, &request, Some(&font))
                .expect("overlay generation");
        assert!(overlay.is_file(), "overlay PNG was not produced");
        let probe =
            super::probe_video(&ffprobe, &overlay).expect("overlay must be ffprobe-readable");
        assert_eq!(
            (probe.width, probe.height),
            (160, 90),
            "overlay must match the source frame size"
        );
        assert_eq!(probe.codec, "png", "overlay must be a real PNG");
        assert!(
            ["rgba", "bgra", "argb", "abgr", "gbrap"].contains(&probe.pix_fmt.as_str()),
            "overlay must carry an alpha channel, got pix_fmt={}",
            probe.pix_fmt
        );

        // 2) Encode a short video through the overlay_asset branch and confirm it
        // collapses to exactly one overlay filter.
        let output = dir.join("watermarked.mp4");
        let (args, cleanup) = super::watermark_ffmpeg_args_with_font(
            Some(&font),
            &request,
            &output,
            super::EncoderBackend::Cpu,
            Some(&overlay),
            None,
        )
        .unwrap();
        assert!(
            cleanup.is_empty(),
            "overlay asset is owned by the caller, not the args builder"
        );
        let filter = extract_filter(&args);
        assert_eq!(
            filter, "[0:v][1:v]overlay=0:0:format=auto:eof_action=repeat:repeatlast=1[watermarked]",
            "dense text path must stay a single overlay"
        );
        assert_eq!(
            filter.matches("overlay").count(),
            1,
            "exactly one overlay filter expected: {filter}"
        );
        let result = std::process::Command::new(&ffmpeg)
            .args(&args)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "overlay encode failed: {}",
            String::from_utf8_lossy(&result.stderr)
        );
        assert!(output.is_file(), "encoded video was not produced");
        let encoded = super::probe_video(&ffprobe, &output).expect("encoded video must probe");
        assert_eq!(
            (encoded.width, encoded.height),
            (160, 90),
            "encoded video geometry changed"
        );
        assert!(!encoded.has_audio, "fixture is silent");

        let _ = fs::remove_file(&overlay);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn text_watermark_parameters_change_real_pixels_without_changing_frame_geometry() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let dir = std::env::temp_dir().join(format!("品牌文字参数像素 {}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("source.mp4");
        create_fixture(&ffmpeg, &input);
        let font = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/fonts/SourceHanSansSC-Regular.otf");

        let base = || WatermarkOptions {
            kind: "text".into(),
            text: "A".into(),
            image_path: None,
            position: "bottom-right".into(),
            size_percent: 10,
            opacity: 0.5,
            pattern: Some("single".into()),
            density: Some("medium".into()),
            angle: Some(0),
            dark_mode: None,
            offset_x: None,
            offset_y: None,
            columns: None,
            rows: None,
            placements: None,
            quality: None,
            prefer_hardware: None,
            text_style: None,
            reserved_output_path: None,
            output_directory: dir.to_string_lossy().into_owned(),
        };

        let pairs = vec![
            ("text-content", base(), {
                let mut options = base();
                options.text = "B".into();
                options
            }),
            ("size", base(), {
                let mut options = base();
                options.size_percent = 18;
                options
            }),
            ("opacity", base(), {
                let mut options = base();
                options.opacity = 0.9;
                options
            }),
            ("angle", base(), {
                let mut options = base();
                options.angle = Some(45);
                options
            }),
            ("anchor", base(), {
                let mut options = base();
                options.position = "top-left".into();
                options
            }),
            (
                "density",
                {
                    let mut options = base();
                    options.pattern = Some("tiled".into());
                    options.density = Some("medium".into());
                    options
                },
                {
                    let mut options = base();
                    options.pattern = Some("tiled".into());
                    options.density = Some("high".into());
                    options
                },
            ),
        ];

        for (index, (name, first, second)) in pairs.into_iter().enumerate() {
            let first_output = dir.join(format!("{name}-first-{index}.png"));
            let second_output = dir.join(format!("{name}-second-{index}.png"));
            render_production_watermark_frame(&ffmpeg, &font, &input, &first, &first_output);
            render_production_watermark_frame(&ffmpeg, &font, &input, &second, &second_output);
            assert!(
                frames_differ(&ffmpeg, &first_output, &second_output),
                "{name} parameter did not change pixels"
            );
            for output in [&first_output, &second_output] {
                let probe = super::probe_video(&bundled_test_sidecar("ffprobe"), output).unwrap();
                assert_eq!(
                    (probe.width, probe.height),
                    (160, 90),
                    "{name} changed geometry"
                );
            }
        }
        fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn logo_watermark_parameters_change_real_pixels_and_angle_keeps_output_geometry() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let dir = std::env::temp_dir().join(format!("品牌Logo参数像素 {}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("source.mp4");
        let logo = dir.join("logo.png");
        create_fixture(&ffmpeg, &input);
        let logo_status = std::process::Command::new(&ffmpeg)
            .args([
                "-hide_banner",
                "-nostdin",
                "-f",
                "lavfi",
                "-i",
                "testsrc=size=48x24:rate=1",
                "-frames:v",
                "1",
                "-pix_fmt",
                "rgba",
                "-y",
            ])
            .arg(&logo)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .status()
            .unwrap();
        assert!(logo_status.success(), "logo fixture creation failed");

        let base = || WatermarkOptions {
            kind: "image".into(),
            text: String::new(),
            image_path: Some(logo.to_string_lossy().into_owned()),
            position: "bottom-right".into(),
            size_percent: 12,
            opacity: 0.5,
            pattern: Some("single".into()),
            density: Some("medium".into()),
            angle: Some(0),
            dark_mode: None,
            offset_x: None,
            offset_y: None,
            columns: None,
            rows: None,
            placements: None,
            quality: None,
            prefer_hardware: None,
            text_style: None,
            reserved_output_path: None,
            output_directory: dir.to_string_lossy().into_owned(),
        };

        let pairs = vec![
            ("size", base(), {
                let mut options = base();
                options.size_percent = 24;
                options
            }),
            ("opacity", base(), {
                let mut options = base();
                options.opacity = 0.9;
                options
            }),
            ("angle", base(), {
                let mut options = base();
                options.angle = Some(45);
                options
            }),
            ("anchor", base(), {
                let mut options = base();
                options.position = "top-left".into();
                options
            }),
            (
                "density",
                {
                    let mut options = base();
                    options.pattern = Some("tiled".into());
                    options.density = Some("medium".into());
                    options
                },
                {
                    let mut options = base();
                    options.pattern = Some("tiled".into());
                    options.density = Some("high".into());
                    options
                },
            ),
        ];

        for (index, (name, first, second)) in pairs.into_iter().enumerate() {
            let first_output = dir.join(format!("{name}-first-{index}.png"));
            let second_output = dir.join(format!("{name}-second-{index}.png"));
            render_production_watermark_frame(&ffmpeg, &logo, &input, &first, &first_output);
            render_production_watermark_frame(&ffmpeg, &logo, &input, &second, &second_output);
            assert!(
                frames_differ(&ffmpeg, &first_output, &second_output),
                "{name} logo parameter did not change pixels"
            );
            for output in [&first_output, &second_output] {
                let probe = super::probe_video(&bundled_test_sidecar("ffprobe"), output).unwrap();
                assert_eq!(
                    (probe.width, probe.height),
                    (160, 90),
                    "{name} changed geometry"
                );
            }
        }
        fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn preview_and_formal_watermark_frames_share_the_same_filter_contract() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let ffprobe = bundled_test_sidecar("ffprobe");
        let dir = std::env::temp_dir().join(format!("品牌预览正式同源 {}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("source.mp4");
        create_fixture(&ffmpeg, &input);
        let font = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/fonts/SourceHanSansSC-Regular.otf");
        let options = WatermarkOptions {
            kind: "text".into(),
            text: "同源验证".into(),
            image_path: None,
            position: "bottom-right".into(),
            size_percent: 10,
            opacity: 0.8,
            pattern: Some("single".into()),
            density: None,
            angle: Some(0),
            dark_mode: None,
            offset_x: None,
            offset_y: None,
            columns: None,
            rows: None,
            placements: None,
            quality: Some("high".into()),
            prefer_hardware: Some(false),
            text_style: None,
            reserved_output_path: None,
            output_directory: dir.to_string_lossy().into_owned(),
        };
        let formal_request = WatermarkMediaTaskRequest {
            task_id: "formal-same-source".into(),
            input_path: input.to_string_lossy().into_owned(),
            options: options.clone(),
        };
        let formal_output = dir.join("formal.mp4");
        let temp = super::video_watermark_temp_path(&formal_output);
        let (args, cleanup) = super::watermark_ffmpeg_args_with_font(
            Some(&font),
            &formal_request,
            &temp,
            EncoderBackend::Cpu,
            None,
            None,
        )
        .unwrap();
        let finalize = super::MediaFinalize {
            final_output: formal_output.clone(),
            input: input.clone(),
            validate: true,
        };
        let cancel = AtomicBool::new(false);
        let (terminal, stderr) = super::run_watermark_process_with_progress(
            &ffmpeg,
            &ffprobe,
            &args,
            &temp,
            Some(&finalize),
            &cancel,
            Some((0.0, 1.0)),
            &mut |_| {},
        );
        for path in cleanup {
            let _ = fs::remove_file(path);
        }
        assert!(
            matches!(terminal, MediaTerminal::Completed { .. }),
            "formal encode failed: {stderr}"
        );

        let formal_frame = dir.join("formal.png");
        let extraction = std::process::Command::new(&ffmpeg)
            .args(["-hide_banner", "-nostdin", "-ss", "0", "-i"])
            .arg(&formal_output)
            .args(["-frames:v", "1", "-y"])
            .arg(&formal_frame)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .status()
            .unwrap();
        assert!(extraction.success(), "formal frame extraction failed");

        let preview_request = WatermarkPreviewRequest {
            task_id: "preview-same-source".into(),
            input_path: input.to_string_lossy().into_owned(),
            temp_directory: dir.to_string_lossy().into_owned(),
            kind: "text".into(),
            text: options.text.clone(),
            image_path: None,
            position: options.position.clone(),
            size_percent: options.size_percent,
            opacity: options.opacity,
            pattern: options.pattern.clone(),
            density: Some("medium".into()),
            angle: options.angle,
            offset_x: options.offset_x,
            offset_y: options.offset_y,
            columns: None,
            rows: None,
            placements: None,
            text_style: None,
            clean_frame: None,
            timestamp_seconds: Some(0.0),
            width: Some(160),
            duration: Some(1.0),
            ffmpeg_path: Some(ffmpeg.clone()),
            ffprobe_path: Some(ffprobe.clone()),
            font_path: Some(font),
        };
        let preview_output = dir.join("preview.png");
        let (preview_args, preview_cleanup) = super::watermark_preview_args(
            preview_request.font_path.as_deref(),
            &preview_request,
            &preview_output,
            None,
        )
        .unwrap();
        let preview_result = std::process::Command::new(&ffmpeg)
            .args(&preview_args)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .output()
            .unwrap();
        for path in preview_cleanup {
            let _ = fs::remove_file(path);
        }
        assert!(
            preview_result.status.success(),
            "preview encode failed: {}",
            String::from_utf8_lossy(&preview_result.stderr)
        );
        assert!(
            average_psnr(&ffmpeg, &formal_frame, &preview_output) > 20.0,
            "preview and formal frame diverge"
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn first_frame_edge_density_detects_complexity_and_returns_none_on_failure() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let dir = std::env::temp_dir().join(format!("推荐复杂度 {}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let complex = dir.join("complex.mp4");
        let simple = dir.join("simple.mp4");
        create_fixture(&ffmpeg, &complex);
        let simple_status = std::process::Command::new(&ffmpeg)
            .args([
                "-hide_banner",
                "-f",
                "lavfi",
                "-i",
                "color=c=0x336699:s=160x90:r=15",
                "-t",
                "1",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-y",
            ])
            .arg(&simple)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .unwrap();
        assert!(simple_status.success(), "simple fixture failed");
        let complex_density = super::first_frame_edge_density(&ffmpeg, &complex, 1.0).unwrap();
        let simple_density = super::first_frame_edge_density(&ffmpeg, &simple, 1.0).unwrap();
        assert!(
            complex_density > simple_density,
            "complex {complex_density} simple {simple_density}"
        );
        assert!(
            super::first_frame_edge_density(&ffmpeg, Path::new("/missing/video.mp4"), 1.0)
                .is_none()
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn recommended_tiled_watermark_has_non_overlapping_contained_cells_in_real_pixels() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let ffprobe = bundled_test_sidecar("ffprobe");
        let dir = std::env::temp_dir().join(format!("推荐真实像素 {}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("source.mp4");
        let fixture_status = std::process::Command::new(&ffmpeg)
            .args([
                "-hide_banner",
                "-nostdin",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=640x360:rate=15",
                "-t",
                "1",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-y",
            ])
            .arg(&input)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .status()
            .unwrap();
        assert!(fixture_status.success(), "recommendation fixture failed");
        let font = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/fonts/SourceHanSansSC-Regular.otf");
        let text = "©KURO GAMES ALL RIGHTS RESERVED";
        let probe = super::probe_video(&ffprobe, &input).unwrap();
        let estimate = super::watermark_recommendation_estimate(
            &ffprobe,
            probe.width,
            probe.height,
            "text",
            text,
            None,
        )
        .unwrap();
        let edge = super::first_frame_edge_density(&ffmpeg, &input, probe.duration).unwrap_or(6.0);
        let grids = super::recommendation_grids(probe.width, probe.height);
        let preferred = if edge < 4.0 {
            0
        } else if edge > 12.0 {
            2
        } else {
            1
        };
        let (grid, size) = (preferred..grids.len())
            .find_map(|index| {
                let grid = grids[index];
                super::max_recommended_size(
                    &estimate,
                    probe.width,
                    probe.height,
                    grid,
                    1,
                    10,
                    30,
                    0.24,
                )
                .map(|size| (grid, size))
            })
            .expect("no feasible recommendation");
        assert!(grid.columns * grid.rows <= 12);
        let options = WatermarkOptions {
            kind: "text".into(),
            text: text.into(),
            image_path: None,
            position: "center".into(),
            size_percent: size,
            opacity: 0.5,
            pattern: Some("tiled".into()),
            density: Some(grid.density.into()),
            angle: Some(30),
            dark_mode: None,
            offset_x: None,
            offset_y: None,
            columns: Some(grid.columns),
            rows: Some(grid.rows),
            placements: None,
            quality: None,
            prefer_hardware: None,
            text_style: None,
            reserved_output_path: None,
            output_directory: dir.to_string_lossy().into_owned(),
        };
        let output = dir.join("recommended.png");
        let baseline = dir.join("baseline.png");
        let baseline_status = std::process::Command::new(&ffmpeg)
            .args(["-hide_banner", "-nostdin", "-ss", "0", "-i"])
            .arg(&input)
            .args(["-frames:v", "1", "-y"])
            .arg(&baseline)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .status()
            .unwrap();
        assert!(baseline_status.success(), "baseline frame failed");
        render_production_watermark_frame(&ffmpeg, &font, &input, &options, &output);
        assert!(
            frames_differ(&ffmpeg, &baseline, &output),
            "recommendation did not render"
        );
        let rendered = super::probe_video(&ffprobe, &output).unwrap();
        assert_eq!(
            (rendered.width, rendered.height),
            (probe.width, probe.height)
        );
        // Cell containment is proven numerically by the recommendation bbox
        // test; this real filter run verifies the same production builder.
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn watermark_image_args_use_two_inputs() {
        let tmp = std::env::temp_dir().join(format!("brand-media-wm-img-{}", std::process::id()));
        fs::create_dir_all(&tmp).unwrap();
        let args = test_watermark_args(
            &watermark_request(
                &tmp,
                "image",
                "",
                Some("/tmp/logo.png"),
                "top-left",
                15,
                0.4,
                false,
            ),
            Path::new("/tmp/output.png"),
        );
        let values: Vec<_> = args
            .0
            .iter()
            .map(|value| value.to_string_lossy().into_owned())
            .collect();
        assert!(values.contains(&"/tmp/logo.png".into()));
        assert_eq!(args.1.len(), 0);
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[cfg(target_os = "macos")]
    fn run_fixture_conversion(
        ffmpeg: &Path,
        request: &GifMediaTaskRequest,
        output: &Path,
    ) -> std::process::ExitStatus {
        std::process::Command::new(ffmpeg)
            .args(ffmpeg_args(request, output))
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .unwrap()
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn bundled_macos_sidecars_convert_mp4_and_mov_without_touching_inputs() {
        let directory =
            std::env::temp_dir().join(format!("brand-media-实机-{}", std::process::id()));
        let input_directory = directory.join("中文 空格 输入");
        let output_directory = directory.join("中文 输出");
        fs::create_dir_all(&input_directory).unwrap();
        fs::create_dir_all(&output_directory).unwrap();
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let ffprobe = bundled_test_sidecar("ffprobe");
        let mp4 = input_directory.join("样例 视频.mp4");
        let mov = input_directory.join("样例 视频.mov");
        create_fixture(&ffmpeg, &mp4);
        create_fixture(&ffmpeg, &mov);
        let mp4_before = fs::metadata(&mp4).unwrap();
        let mov_before = fs::metadata(&mov).unwrap();
        let options = GifMediaOptions {
            start_seconds: Some(0.25),
            end_seconds: Some(1.5),
            width: Some(120),
            fps: 12,
            preset: "fast".into(),
            output_directory: output_directory.to_string_lossy().into_owned(),
            target_bytes: None,
            mode: None,
            min_width: None,
            sample: None,
        };
        let mp4_request = GifMediaTaskRequest {
            task_id: "mp4".into(),
            input_path: mp4.to_string_lossy().into_owned(),
            options: options.clone(),
        };
        let mov_request = GifMediaTaskRequest {
            task_id: "mov".into(),
            input_path: mov.to_string_lossy().into_owned(),
            options,
        };
        let mp4_output = output_path(&mp4_request);
        assert!(run_fixture_conversion(&ffmpeg, &mp4_request, &mp4_output).success());
        let mov_output = output_path(&mov_request);
        assert!(run_fixture_conversion(&ffmpeg, &mov_request, &mov_output).success());
        assert_eq!(fs::read(&mp4_output).unwrap()[..6], *b"GIF89a");
        assert_eq!(fs::read(&mov_output).unwrap()[..6], *b"GIF89a");
        assert_eq!(fs::metadata(&mp4).unwrap().len(), mp4_before.len());
        assert_eq!(fs::metadata(&mov).unwrap().len(), mov_before.len());
        let probe = std::process::Command::new(ffprobe)
            .args([
                "-v",
                "error",
                "-show_entries",
                "format=format_name",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
            ])
            .arg(&mp4_output)
            .output()
            .unwrap();
        assert!(String::from_utf8_lossy(&probe.stdout).contains("gif"));
        fs::remove_dir_all(directory).unwrap();
    }

    /// Records everything the production GIF loop emits, and exposes the same
    /// cancellation lever `cancel_task` uses. Lets the whole sample → full
    /// encode → correction → publish sequence run with real FFmpeg while still
    /// being assertable.
    #[derive(Default)]
    struct RecordingGifHost {
        events: std::sync::Mutex<Vec<MediaTaskEvent>>,
        children: std::sync::Mutex<Vec<Arc<Mutex<std::process::Child>>>>,
        cancel: std::sync::atomic::AtomicBool,
        /// 可选择地把终态事件写进外部槽位，供 `compute_gif_preview_file` 使用。
        terminal: std::sync::Mutex<Option<Arc<std::sync::Mutex<Option<MediaTaskEvent>>>>>,
    }

    impl RecordingGifHost {
        fn events(&self) -> Vec<MediaTaskEvent> {
            self.events.lock().unwrap().clone()
        }

        /// Everything except progress: the terminal story of the task.
        fn terminal(&self) -> Vec<MediaTaskEvent> {
            self.events()
                .into_iter()
                .filter(|event| !matches!(event, MediaTaskEvent::Progress { .. }))
                .collect()
        }

        /// One registration per real FFmpeg encode (sample + full encodes).
        fn encode_count(&self) -> usize {
            self.children.lock().unwrap().len()
        }

        /// 创建/取得终态事件槽位：模拟生产 `ComputeGifHost` 的记录行为。
        fn terminal_slot(&self) -> Arc<std::sync::Mutex<Option<MediaTaskEvent>>> {
            let mut guard = self.terminal.lock().unwrap();
            if let Some(slot) = guard.as_ref() {
                return slot.clone();
            }
            let slot = Arc::new(std::sync::Mutex::new(None));
            *guard = Some(slot.clone());
            slot
        }

        /// Mirrors `cancel_task`: signal the flag and terminate the live child.
        fn cancel_and_kill(&self) {
            self.cancel.store(true, std::sync::atomic::Ordering::SeqCst);
            let children = self.children.lock().unwrap();
            for child in children.iter() {
                if let Ok(mut guard) = child.lock() {
                    let _ = guard.kill();
                }
            }
        }
    }

    impl GifTaskHost for RecordingGifHost {
        fn emit(&self, event: MediaTaskEvent) {
            if matches!(
                event,
                MediaTaskEvent::Completed { .. }
                    | MediaTaskEvent::Failed { .. }
                    | MediaTaskEvent::Cancelled { .. }
            ) {
                if let Some(slot) = self.terminal.lock().unwrap().as_ref() {
                    *slot.lock().unwrap() = Some(event.clone());
                }
            }
            self.events.lock().unwrap().push(event);
        }

        fn insert_child(&self, _task_id: &str, child: Arc<Mutex<std::process::Child>>) {
            self.children.lock().unwrap().push(child);
        }

        fn take_cancelled(&self, _task_id: &str) -> bool {
            self.cancel.swap(false, std::sync::atomic::Ordering::SeqCst)
        }

        fn remove_task(&self, _task_id: &str) {}
    }

    fn completed_output(host: &RecordingGifHost) -> (String, u64) {
        for event in host.terminal() {
            if let MediaTaskEvent::Completed {
                output_path,
                output_bytes,
                ..
            } = event
            {
                return (output_path, output_bytes);
            }
        }
        panic!(
            "expected a Completed terminal event, got {:?}",
            host.terminal()
        );
    }

    /// `"24000/1001"` → `23.976…`; malformed input → `0.0`.
    fn parse_rate(rate: &str) -> f64 {
        match rate.split_once('/') {
            Some((num, den)) => {
                let numerator = num.trim().parse::<f64>().unwrap_or(0.0);
                let denominator = den.trim().parse::<f64>().unwrap_or(0.0);
                if denominator == 0.0 {
                    0.0
                } else {
                    numerator / denominator
                }
            }
            None => rate.trim().parse::<f64>().unwrap_or(0.0),
        }
    }

    fn gif_frame_count(ffprobe: &Path, path: &Path) -> (String, u32) {
        let output = std::process::Command::new(ffprobe)
            .args([
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-count_frames",
                "-show_entries",
                "stream=avg_frame_rate,nb_read_frames",
                "-of",
                "default=noprint_wrappers=1",
            ])
            .arg(path)
            .output()
            .unwrap();
        let text = String::from_utf8_lossy(&output.stdout).into_owned();
        let rate = text
            .lines()
            .find_map(|line| line.strip_prefix("avg_frame_rate="))
            .unwrap_or("")
            .to_string();
        let frames = text
            .lines()
            .find_map(|line| line.strip_prefix("nb_read_frames="))
            .and_then(|value| value.trim().parse::<u32>().ok())
            .unwrap_or(0);
        (rate, frames)
    }

    /// A noisy 640×480 @ 24 fps fixture whose first 640px GIF encode is several
    /// times the decimal ceiling. Used to prove that exceeding 8,000,000 B does
    /// not end the task while a width correction is still available.
    fn create_large_fixture(ffmpeg: &Path, path: &Path) {
        let status = std::process::Command::new(ffmpeg)
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=640x480:rate=24",
                "-t",
                "2.5",
                "-vf",
                "noise=alls=35:allf=t",
                "-pix_fmt",
                "yuv420p",
                "-c:v",
                "libx264",
                "-crf",
                "20",
                "-y",
            ])
            .arg(path)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .unwrap();
        assert!(status.success(), "large fixture generation failed");
    }

    fn gif_request(
        task_id: &str,
        input: &Path,
        output_directory: &Path,
        width: Option<u32>,
        fps: u32,
        start: Option<f64>,
        end: Option<f64>,
        target_bytes: Option<u64>,
        min_width: Option<u32>,
        mode: &str,
    ) -> GifMediaTaskRequest {
        GifMediaTaskRequest {
            task_id: task_id.into(),
            input_path: input.to_string_lossy().into_owned(),
            options: GifMediaOptions {
                start_seconds: start,
                end_seconds: end,
                width,
                fps,
                preset: "fast".into(),
                output_directory: output_directory.to_string_lossy().into_owned(),
                target_bytes,
                mode: Some(mode.into()),
                min_width,
                sample: None,
            },
        }
    }

    /// Behaviour test for the whole production loop with real FFmpeg: an encode
    /// far above the decimal ceiling must trigger the width correction (not an
    /// immediate failure), the corrected encode must be published, and both the
    /// frame rate and the trimmed duration must survive compression unchanged.
    #[cfg(target_os = "macos")]
    #[test]
    fn real_gif_loop_compresses_over_the_ceiling_instead_of_failing_immediately() {
        let directory =
            std::env::temp_dir().join(format!("brand-media-实机-超限-{}", std::process::id()));
        let output_directory = directory.join("中文 输出");
        fs::create_dir_all(&output_directory).unwrap();
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let ffprobe = bundled_test_sidecar("ffprobe");
        let mp4 = directory.join("大体积 样例.mp4");
        create_large_fixture(&ffmpeg, &mp4);

        // The user pinned 640px/24fps for a 2.5s clip; the first full encode is
        // deliberately far over both the soft budget and the decimal ceiling.
        let request = gif_request(
            "real-over-ceiling",
            &mp4,
            &output_directory,
            Some(640),
            24,
            None,
            Some(2.5),
            Some(7_800_000),
            Some(160),
            "balanced",
        );
        let preferred = output_path(&request);
        let host = Arc::new(RecordingGifHost::default());
        let host_for_loop: Arc<dyn GifTaskHost> = host.clone();

        run_gif_task_loop(
            &ffmpeg,
            &request,
            &preferred,
            request.options.target_bytes.unwrap_or(0),
            None,
            2.5,
            &host_for_loop,
            &request.task_id,
        );

        let terminal = host.terminal();
        assert_eq!(
            terminal.len(),
            1,
            "exactly one terminal event is required, got {terminal:?}"
        );
        let (output_path, output_bytes) = completed_output(&host);
        assert!(
            output_bytes <= 7_800_000,
            "the published GIF must respect the budget, got {output_bytes}"
        );
        assert!(
            output_bytes <= MAX_GIF_BYTES,
            "the published GIF must respect the decimal ceiling, got {output_bytes}"
        );

        // One sample + at most two full encodes: the first full encode was over
        // the ceiling and the loop had to run the correction encode.
        assert_eq!(
            host.encode_count(),
            3,
            "expected sample + first full encode + one correction"
        );

        let published = Path::new(&output_path);
        assert!(published.exists());
        assert_eq!(fs::read(published).unwrap()[..6], *b"GIF89a");
        assert_eq!(fs::metadata(published).unwrap().len(), output_bytes);

        // FPS and trim survived compression untouched: 2.5s at 24 fps ≈ 60 frames.
        let (rate, frames) = gif_frame_count(&ffprobe, published);
        let effective_fps = parse_rate(&rate);
        assert!(
            (effective_fps - 24.0).abs() < 0.05,
            "compression must not change the frame rate, got {rate} ({effective_fps})"
        );
        assert!(
            (59..=61).contains(&frames),
            "the GIF must cover the 2.5s selection at 24 fps, got {frames} frames"
        );

        // No temp residue and only the published file in the output directory.
        let entries: Vec<_> = fs::read_dir(&output_directory)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            entries.len(),
            1,
            "only the published GIF may remain, found {entries:?}"
        );
        fs::remove_dir_all(directory).unwrap();
    }

    /// Behaviour test: a budget that this footage can never reach must fail
    /// explicitly after the allowed encodes, leaving the output directory empty.
    #[cfg(target_os = "macos")]
    #[test]
    fn real_gif_loop_unreachable_budget_fails_without_leaving_any_file() {
        let directory =
            std::env::temp_dir().join(format!("brand-media-实机-淘汰-{}", std::process::id()));
        let output_directory = directory.join("中文 输出");
        fs::create_dir_all(&output_directory).unwrap();
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let mp4 = directory.join("样例 视频.mp4");
        create_fixture(&ffmpeg, &mp4);

        let request = gif_request(
            "real-unreachable",
            &mp4,
            &output_directory,
            Some(320),
            15,
            Some(0.25),
            Some(1.5),
            Some(40_000),
            Some(160),
            "clarity",
        );
        let preferred = output_path(&request);
        let host = Arc::new(RecordingGifHost::default());
        let host_for_loop: Arc<dyn GifTaskHost> = host.clone();

        run_gif_task_loop(
            &ffmpeg,
            &request,
            &preferred,
            request.options.target_bytes.unwrap_or(0),
            None,
            2.0,
            &host_for_loop,
            &request.task_id,
        );

        let terminal = host.terminal();
        assert_eq!(
            terminal.len(),
            1,
            "an exhausted task must still end with exactly one event, got {terminal:?}"
        );
        match &terminal[0] {
            MediaTaskEvent::Failed { message, .. } => {
                assert!(message.contains("已删除，未写入输出目录"), "{message}");
                assert!(message.contains("15 fps"), "{message}");
                assert!(message.contains("40000"), "{message}");
            }
            other => panic!("expected Failed, got {other:?}"),
        }
        // At most two full encodes, plus the analysis sample.
        assert!(
            host.encode_count() <= 3,
            "complete encodes are capped at two, got {} encodes",
            host.encode_count()
        );
        assert!(!preferred.exists());
        let leftover: Vec<_> = fs::read_dir(&output_directory)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert!(
            leftover.is_empty(),
            "an exhausted task must not write to the output directory, found {leftover:?}"
        );
        fs::remove_dir_all(directory).unwrap();
    }

    /// Behaviour test for the non-overwriting publish: a file the user already
    /// owns at the preferred name must survive, and the task must land on a
    /// distinct name instead of replacing it.
    #[cfg(target_os = "macos")]
    #[test]
    fn real_gif_loop_never_overwrites_an_existing_output() {
        let directory =
            std::env::temp_dir().join(format!("brand-media-实机-同名-{}", std::process::id()));
        let output_directory = directory.join("中文 输出");
        fs::create_dir_all(&output_directory).unwrap();
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let mp4 = directory.join("样例 视频.mp4");
        create_fixture(&ffmpeg, &mp4);

        let request = gif_request(
            "real-no-overwrite",
            &mp4,
            &output_directory,
            Some(160),
            12,
            Some(0.25),
            Some(1.5),
            Some(7_800_000),
            Some(160),
            "balanced",
        );
        let preferred = output_path(&request);
        // A file that appeared after `next_available_path` picked this name —
        // exactly the race the earlier `fs::rename` publish lost.
        let owned = b"user-owned-content".to_vec();
        fs::write(&preferred, &owned).unwrap();

        let host = Arc::new(RecordingGifHost::default());
        let host_for_loop: Arc<dyn GifTaskHost> = host.clone();
        run_gif_task_loop(
            &ffmpeg,
            &request,
            &preferred,
            request.options.target_bytes.unwrap_or(0),
            None,
            2.0,
            &host_for_loop,
            &request.task_id,
        );

        let (output_path, output_bytes) = completed_output(&host);
        let published = PathBuf::from(&output_path);
        assert_ne!(
            published, preferred,
            "the publish must not take a name the user already owns"
        );
        assert_eq!(
            fs::read(&preferred).unwrap(),
            owned,
            "the pre-existing file must be byte-for-byte untouched"
        );
        assert!(published.exists());
        assert_eq!(fs::read(&published).unwrap()[..6], *b"GIF89a");
        assert_eq!(fs::metadata(&published).unwrap().len(), output_bytes);
        assert!(
            published
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("样例 视频_gif_2"),
            "expected the _2 fallback name, got {output_path}"
        );
        fs::remove_dir_all(directory).unwrap();
    }

    /// Behaviour test for two tasks racing for the same output name: both must
    /// publish distinct, valid files, and each temp file must stay private.
    #[cfg(target_os = "macos")]
    #[test]
    fn real_gif_loop_two_tasks_racing_for_one_name_both_survive() {
        let directory =
            std::env::temp_dir().join(format!("brand-media-实机-竞争-{}", std::process::id()));
        let output_directory = directory.join("中文 输出");
        fs::create_dir_all(&output_directory).unwrap();
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let mp4 = directory.join("样例 视频.mp4");
        create_fixture(&ffmpeg, &mp4);

        let make_request = |task_id: &str| {
            gif_request(
                task_id,
                &mp4,
                &output_directory,
                Some(160),
                12,
                Some(0.25),
                Some(1.5),
                Some(7_800_000),
                Some(160),
                "balanced",
            )
        };
        let request_a = make_request("race-a");
        let request_b = make_request("race-b");
        // Both tasks resolved the same preferred name before either published.
        let preferred = output_path(&request_a);

        let host_a = Arc::new(RecordingGifHost::default());
        let host_b = Arc::new(RecordingGifHost::default());
        let ffmpeg_a = ffmpeg.clone();
        let ffmpeg_b = ffmpeg.clone();
        let preferred_a = preferred.clone();
        let preferred_b = preferred.clone();
        let host_a_for_loop: Arc<dyn GifTaskHost> = host_a.clone();
        let host_b_for_loop: Arc<dyn GifTaskHost> = host_b.clone();

        let thread_a = std::thread::spawn(move || {
            run_gif_task_loop(
                &ffmpeg_a,
                &request_a,
                &preferred_a,
                7_800_000,
                None,
                2.0,
                &host_a_for_loop,
                "race-a",
            );
        });
        let thread_b = std::thread::spawn(move || {
            run_gif_task_loop(
                &ffmpeg_b,
                &request_b,
                &preferred_b,
                7_800_000,
                None,
                2.0,
                &host_b_for_loop,
                "race-b",
            );
        });
        thread_a.join().unwrap();
        thread_b.join().unwrap();

        let (path_a, bytes_a) = completed_output(&host_a);
        let (path_b, bytes_b) = completed_output(&host_b);
        assert_ne!(path_a, path_b, "two tasks must not publish the same file");
        for (path, bytes) in [(&path_a, bytes_a), (&path_b, bytes_b)] {
            let published = Path::new(path);
            assert!(published.exists(), "{path} must exist");
            assert_eq!(fs::read(published).unwrap()[..6], *b"GIF89a");
            assert_eq!(fs::metadata(published).unwrap().len(), bytes);
        }
        // Exactly the two published files: no temp file leaked from either task.
        let mut entries: Vec<_> = fs::read_dir(&output_directory)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        entries.sort();
        assert_eq!(entries.len(), 2, "unexpected residue: {entries:?}");
        fs::remove_dir_all(directory).unwrap();
    }

    /// Behaviour test for cancellation: the task must end with exactly one
    /// `Cancelled` event, produce no `Failed`/`Completed` event, and leave the
    /// output directory clean.
    #[cfg(target_os = "macos")]
    #[test]
    fn real_gif_loop_cancel_emits_exactly_one_terminal_state() {
        let directory =
            std::env::temp_dir().join(format!("brand-media-实机-取消-{}", std::process::id()));
        let output_directory = directory.join("中文 输出");
        fs::create_dir_all(&output_directory).unwrap();
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let mp4 = directory.join("大体积 样例.mp4");
        create_large_fixture(&ffmpeg, &mp4);

        let request = gif_request(
            "real-cancel",
            &mp4,
            &output_directory,
            Some(640),
            24,
            None,
            Some(2.5),
            Some(7_800_000),
            Some(160),
            "balanced",
        );
        let preferred = output_path(&request);
        let host = Arc::new(RecordingGifHost::default());
        let host_for_loop: Arc<dyn GifTaskHost> = host.clone();

        let ffmpeg_for_thread = ffmpeg.clone();
        let request_for_thread = request.clone();
        let preferred_for_thread = preferred.clone();
        let worker = std::thread::spawn(move || {
            run_gif_task_loop(
                &ffmpeg_for_thread,
                &request_for_thread,
                &preferred_for_thread,
                7_800_000,
                None,
                2.5,
                &host_for_loop,
                "real-cancel",
            );
        });

        // Wait until a real FFmpeg child is running, then cancel like the UI does.
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        while host.encode_count() == 0 {
            assert!(
                std::time::Instant::now() < deadline,
                "no FFmpeg child was registered in time"
            );
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        host.cancel_and_kill();
        worker.join().unwrap();

        let terminal = host.terminal();
        assert_eq!(
            terminal.len(),
            1,
            "a cancelled task must emit exactly one terminal event, got {terminal:?}"
        );
        assert!(
            matches!(terminal[0], MediaTaskEvent::Cancelled { .. }),
            "expected Cancelled, got {:?}",
            terminal[0]
        );
        assert!(!preferred.exists(), "a cancelled task must not publish");
        let leftover: Vec<_> = fs::read_dir(&output_directory)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert!(
            leftover.is_empty(),
            "a cancelled task must leave no residue, found {leftover:?}"
        );
        fs::remove_dir_all(directory).unwrap();
    }

    /// Documents the historical failure the explicit `-f gif` fixes: FFmpeg
    /// cannot pick the GIF muxer from a `.gif.part` output name.
    #[cfg(target_os = "macos")]
    #[test]
    fn ffmpeg_cannot_infer_the_muxer_from_a_part_suffix() {
        let directory =
            std::env::temp_dir().join(format!("brand-media-part-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        let ffmpeg = bundled_test_sidecar("ffmpeg");

        let legacy_output = directory.join(".片段.gif.part");
        let inferred = std::process::Command::new(&ffmpeg)
            .args([
                "-hide_banner",
                "-nostdin",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=80x60:rate=8",
                "-t",
                "0.5",
                "-y",
            ])
            .arg(&legacy_output)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .unwrap();
        assert!(
            !inferred.success(),
            "FFmpeg must not silently guess a muxer for a .gif.part name"
        );
        assert!(!legacy_output.exists());

        // The same name works once the format is stated explicitly.
        let explicit_output = directory.join(".片段.gif.part");
        let explicit = std::process::Command::new(&ffmpeg)
            .args([
                "-hide_banner",
                "-nostdin",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=80x60:rate=8",
                "-t",
                "0.5",
                "-f",
                "gif",
                "-y",
            ])
            .arg(&explicit_output)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .unwrap();
        assert!(
            explicit.success(),
            "-f gif makes the output independent of the name"
        );
        assert_eq!(fs::read(&explicit_output).unwrap()[..6], *b"GIF89a");
        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn bundled_sidecar_can_be_cancelled_and_a_failed_task_does_not_block_the_next_one() {
        let directory =
            std::env::temp_dir().join(format!("brand-media-cancel-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let fixture = directory.join("source.mp4");
        create_fixture(&ffmpeg, &fixture);
        let cancel_output = directory.join("cancelled.gif");
        let mut child = std::process::Command::new(&ffmpeg)
            .args([
                "-hide_banner",
                "-nostdin",
                "-re",
                "-stream_loop",
                "-1",
                "-i",
            ])
            .arg(&fixture)
            .args([
                "-t",
                "20",
                "-vf",
                "fps=15,scale=120:-2",
                "-progress",
                "pipe:1",
                "-nostats",
                "-n",
            ])
            .arg(&cancel_output)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .unwrap();
        std::thread::sleep(std::time::Duration::from_millis(150));
        child.kill().unwrap();
        assert!(!child.wait().unwrap().success());
        let _ = fs::remove_file(&cancel_output);
        assert!(!cancel_output.exists());

        let invalid = directory.join("broken.mp4");
        fs::write(&invalid, b"not-a-media-file").unwrap();
        let options = GifMediaOptions {
            start_seconds: None,
            end_seconds: None,
            width: None,
            fps: 12,
            preset: "high".into(),
            output_directory: directory.to_string_lossy().into_owned(),
            target_bytes: None,
            mode: None,
            min_width: None,
            sample: None,
        };
        let failed = GifMediaTaskRequest {
            task_id: "failed".into(),
            input_path: invalid.to_string_lossy().into_owned(),
            options: options.clone(),
        };
        let successful = GifMediaTaskRequest {
            task_id: "success".into(),
            input_path: fixture.to_string_lossy().into_owned(),
            options,
        };
        assert!(!run_fixture_conversion(&ffmpeg, &failed, &output_path(&failed)).success());
        let output = output_path(&successful);
        assert!(run_fixture_conversion(&ffmpeg, &successful, &output).success());
        assert_eq!(fs::read(output).unwrap()[..6], *b"GIF89a");
        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn parse_progress_with_zero_base_handles_ss_reset() {
        assert_eq!(
            parse_progress_line("out_time_ms=2000000", 0.0, 4.0),
            Some(0.5)
        );
        assert_eq!(
            parse_progress_line("out_time_ms=4000000", 0.0, 4.0),
            Some(0.99)
        ); // clamped
        assert_eq!(parse_progress_line("progress=continue", 0.0, 4.0), None);
    }

    /// The compression preference no longer touches FPS; it only scales how
    /// aggressively the single width correction aims at the budget.

    #[test]
    fn target_sidecar_name_uses_exe_extension_only_on_windows() {
        if cfg!(target_os = "windows") {
            assert_eq!(
                target_sidecar_name("ffmpeg").to_string_lossy(),
                "ffmpeg.exe"
            );
        } else {
            assert_eq!(target_sidecar_name("ffmpeg").to_string_lossy(), "ffmpeg");
        }
    }

    #[test]
    fn serializes_terminal_events_with_the_frontend_camel_case_contract() {
        let event = MediaTaskEvent::Completed {
            task_id: "task-1".into(),
            output_path: "/tmp/output.png".into(),
            output_bytes: 123,
        };
        assert_eq!(event_kind(&event), "completed");
        assert_eq!(event_task_id(&event), "task-1");
        assert_eq!(
            serde_json::to_value(event).unwrap(),
            serde_json::json!({
                "kind": "completed",
                "taskId": "task-1",
                "outputPath": "/tmp/output.png",
                "outputBytes": 123,
            })
        );
    }

    #[test]
    fn sidecar_path_resolves_from_exe_directory() {
        let exe = std::env::current_exe().unwrap();
        let exe_dir = exe.parent().unwrap();
        let expected = exe_dir.join(target_sidecar_name("ffmpeg"));
        if expected.exists() {
            assert!(expected.is_file());
        }
    }

    #[cfg(target_os = "macos")]
    #[cfg(target_os = "macos")]
    fn create_mp4_fixture(ffmpeg: &Path, path: &Path, audio: bool) {
        let mut cmd = std::process::Command::new(ffmpeg);
        cmd.args([
            "-hide_banner",
            "-nostdin",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=160x90:rate=15",
        ]);
        if audio {
            cmd.args(["-f", "lavfi", "-i", "sine=frequency=440:duration=1"]);
        }
        cmd.args(["-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p"]);
        if audio {
            cmd.args(["-c:a", "aac", "-shortest"]);
        }
        cmd.args(["-y"]).arg(path);
        let status = cmd
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .status()
            .unwrap();
        assert!(status.success(), "mp4 fixture creation failed");
    }

    #[cfg(target_os = "macos")]
    fn create_mov_pcm_fixture(ffmpeg: &Path, path: &Path) {
        let status = std::process::Command::new(ffmpeg)
            .args([
                "-hide_banner",
                "-nostdin",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=160x90:rate=15",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=1",
                "-t",
                "1",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "pcm_s16le",
                "-shortest",
                "-y",
            ])
            .arg(path)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .status()
            .unwrap();
        assert!(status.success(), "mov pcm fixture creation failed");
    }

    #[cfg(target_os = "macos")]
    fn run_video_watermark_to_mp4(
        ffmpeg: &Path,
        ffprobe: &Path,
        input: &Path,
        output: &Path,
        filter: &str,
        has_audio: bool,
    ) {
        let temp = super::video_watermark_temp_path(output);
        let mut args: Vec<OsString> = vec![
            OsString::from("-hide_banner"),
            OsString::from("-nostdin"),
            OsString::from("-i"),
            input.as_os_str().to_owned(),
            OsString::from("-filter_complex"),
            OsString::from(filter),
            OsString::from("-map"),
            OsString::from("[watermarked]"),
            OsString::from("-map"),
            OsString::from("0:a?"),
            OsString::from("-c:v"),
            OsString::from("libx264"),
            OsString::from("-pix_fmt"),
            OsString::from("yuv420p"),
            OsString::from("-movflags"),
            OsString::from("+faststart"),
            OsString::from("-c:a"),
            OsString::from("aac"),
            OsString::from("-y"),
            temp.as_os_str().to_owned(),
        ];
        let result = std::process::Command::new(ffmpeg)
            .args(&args)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .output()
            .unwrap();
        let stderr = String::from_utf8_lossy(&result.stderr);
        assert!(
            result.status.success(),
            "video watermark encode failed: {}",
            &stderr[stderr.len().saturating_sub(400)..]
        );
        let finalize = super::MediaFinalize {
            final_output: output.to_path_buf(),
            input: input.to_path_buf(),
            validate: true,
        };
        super::finalize_media_output(ffprobe, &temp, &finalize)
            .expect("production finalize must pass");
        assert!(!temp.exists(), "temp must be gone after rename");
        assert_frame_differs(ffmpeg, input, output);
        let probe = super::probe_video(ffprobe, output).unwrap();
        assert_eq!(probe.has_audio, has_audio, "audio presence mismatch");
    }

    #[cfg(target_os = "macos")]
    fn render_production_watermark_frame(
        ffmpeg: &Path,
        font: &Path,
        input: &Path,
        options: &WatermarkOptions,
        output: &Path,
    ) {
        let request = WatermarkMediaTaskRequest {
            task_id: output
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("frame")
                .to_string(),
            input_path: input.to_string_lossy().into_owned(),
            options: options.clone(),
        };
        let (filter, cleanup) = super::watermark_filter_with_font(Some(font), &request, None)
            .expect("production filter");
        let mut command = std::process::Command::new(ffmpeg);
        command
            .args(["-hide_banner", "-nostdin", "-ss", "0", "-i"])
            .arg(input);
        if options.kind == "image" {
            command
                .args(["-i"])
                .arg(options.image_path.as_deref().unwrap_or_default());
        }
        let result = command
            .args(["-filter_complex", &filter, "-map", "[watermarked]"])
            .args(["-frames:v", "1", "-y"])
            .arg(output)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .output()
            .unwrap();
        for path in cleanup {
            let _ = fs::remove_file(path);
        }
        assert!(
            result.status.success(),
            "production watermark frame failed: {}",
            String::from_utf8_lossy(&result.stderr)
        );
    }

    #[cfg(target_os = "macos")]
    fn frames_differ(ffmpeg: &Path, first: &Path, second: &Path) -> bool {
        let result = std::process::Command::new(ffmpeg)
            .args(["-hide_banner", "-nostdin", "-i"])
            .arg(first)
            .args(["-i"])
            .arg(second)
            .args([
                "-lavfi",
                "[0:v][1:v]psnr",
                "-frames:v",
                "1",
                "-f",
                "null",
                "-",
            ])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .output()
            .unwrap();
        assert!(result.status.success(), "psnr failed");
        !String::from_utf8_lossy(&result.stderr).contains("average:inf")
    }

    #[cfg(target_os = "macos")]
    fn average_psnr(ffmpeg: &Path, first: &Path, second: &Path) -> f64 {
        let result = std::process::Command::new(ffmpeg)
            .args(["-hide_banner", "-nostdin", "-i"])
            .arg(first)
            .args(["-i"])
            .arg(second)
            .args([
                "-lavfi",
                "[0:v][1:v]psnr",
                "-frames:v",
                "1",
                "-f",
                "null",
                "-",
            ])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .output()
            .unwrap();
        let stderr = String::from_utf8_lossy(&result.stderr);
        assert!(result.status.success(), "psnr failed: {stderr}");
        stderr
            .split("average:")
            .nth(1)
            .and_then(|tail| tail.split_whitespace().next())
            .and_then(|value| value.parse::<f64>().ok())
            .unwrap_or(f64::NEG_INFINITY)
    }

    #[cfg(target_os = "macos")]
    fn logo_overlay_filter(position: &str, size_percent: u32, tiled: bool) -> String {
        let alpha = "0.6";
        let mut graph = vec![
            format!("[1:v]format=rgba,colorchannelmixer=aa={alpha}[wa]"),
            format!("[wa][0:v]scale2ref=w=main_w*{size_percent}/100:h=-1[wm][base]"),
        ];
        if !tiled {
            let (x, y) = overlay_coordinates(position);
            graph.push(format!(
                "[base][wm]overlay=x={x}:y={y}:format=auto[watermarked]"
            ));
        } else {
            let positions = tiled_coordinates();
            let labels: Vec<String> = (0..positions.len()).map(|i| format!("wm{i}")).collect();
            graph.push(format!(
                "[wm]split={}[{}]",
                positions.len(),
                labels.join("][")
            ));
            let mut previous = "base".to_string();
            for (i, (x, y)) in positions.iter().enumerate() {
                let next = if i + 1 == positions.len() {
                    "watermarked".to_string()
                } else {
                    format!("t{i}")
                };
                graph.push(format!(
                    "[{previous}][{}]overlay=x={x}:y={y}:format=auto[{next}]",
                    labels[i]
                ));
                previous = next;
            }
        }
        graph.join(";")
    }

    #[cfg(target_os = "macos")]
    fn assert_frame_differs(ffmpeg: &Path, baseline: &Path, watermarked: &Path) {
        let run = std::process::Command::new(ffmpeg)
            .args(["-hide_banner", "-nostdin", "-i"])
            .arg(baseline)
            .args(["-i"])
            .arg(watermarked)
            .args([
                "-lavfi",
                "[0:v][1:v]psnr",
                "-frames:v",
                "1",
                "-f",
                "null",
                "-",
            ])
            .output()
            .unwrap();
        let stderr = String::from_utf8_lossy(&run.stderr);
        assert!(run.status.success(), "psnr compare failed: {stderr}");
        assert!(
            stderr.contains("average:"),
            "psnr did not report average: {stderr}"
        );
        assert!(
            !stderr.contains("average:inf"),
            "frames are identical; watermark missing: {stderr}"
        );
    }

    fn create_still_png_fixture(ffmpeg: &Path, path: &Path) {
        let status = std::process::Command::new(ffmpeg)
            .args([
                "-hide_banner",
                "-nostdin",
                "-f",
                "lavfi",
                "-i",
                "color=c=0x336699:s=320x240:r=1",
                "-frames:v",
                "1",
                "-pix_fmt",
                "rgba",
                "-y",
            ])
            .arg(path)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .status()
            .unwrap();
        assert!(status.success(), "fixture PNG creation failed");
    }

    #[cfg(target_os = "macos")]
    fn real_text_watermark_args(
        input: &Path,
        output: &Path,
        font: &Path,
        text: &str,
        size_percent: u32,
        opacity: f64,
    ) -> (Vec<OsString>, Vec<PathBuf>) {
        let alpha = opacity.to_string();
        let font_val = escape_filter_value(&font.to_string_lossy());
        let text_file = std::env::temp_dir().join(format!(
            "brand-media-ffmpeg-text-wm-{}.txt",
            std::process::id()
        ));
        fs::write(&text_file, text).unwrap();
        let text_file_val = escape_filter_value(&text_file.to_string_lossy());
        let font_size = format!("h*{}/100", size_percent);
        let positions = drawtext_tiled_coordinates();
        let mut previous = "0:v".to_string();
        let mut graph = Vec::new();
        for (index, (x, y)) in positions.iter().enumerate() {
            let next = if index + 1 == positions.len() {
                "watermarked".to_string()
            } else {
                format!("text{index}")
            };
            graph.push(format!(
                "[{previous}]drawtext=fontfile='{font_val}':textfile='{text_file_val}':fontcolor=white@{alpha}:fontsize={font_size}:x={x}:y={y}[{next}]"
            ));
            previous = next;
        }
        let filter = graph.join(";");
        let args = vec![
            OsString::from("-hide_banner"),
            OsString::from("-nostdin"),
            OsString::from("-y"),
            OsString::from("-i"),
            input.as_os_str().to_owned(),
            OsString::from("-filter_complex"),
            OsString::from(filter),
            OsString::from("-map"),
            OsString::from("[watermarked]"),
            OsString::from("-frames:v"),
            OsString::from("1"),
            output.as_os_str().to_owned(),
        ];
        (args, vec![text_file])
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn bundled_ffmpeg_text_watermark_export_succeeds() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let dir = std::env::temp_dir().join(format!("品牌水印 测试-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("source.png");
        let output = dir.join("result.png");
        create_still_png_fixture(&ffmpeg, &input);
        assert!(input.is_file() && input.metadata().unwrap().len() > 0);

        let font = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/fonts/SourceHanSansSC-Regular.otf");
        assert!(font.is_file(), "bundled font must exist");

        let (args, _cleanup) =
            real_text_watermark_args(&input, &output, &font, "品宣工作台", 10, 0.5);
        let result = std::process::Command::new(&ffmpeg)
            .args(&args)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .output()
            .unwrap();
        let stderr = String::from_utf8_lossy(&result.stderr);
        assert!(
            result.status.success(),
            "text watermark ffmpeg failed. stderr tail: {}",
            &stderr[stderr.len().saturating_sub(500)..]
        );
        assert!(output.metadata().unwrap().len() > 0, "output is empty");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn bundled_video_watermark_cpu_output_validates_with_ffprobe() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let ffprobe = bundled_test_sidecar("ffprobe");
        let dir = std::env::temp_dir().join(format!("品牌视频水印-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("source.mp4");
        let output = dir.join("source_watermarked.mp4");

        // Generate a short 160x90 H.264 video with a sine audio track.
        let fixture_status = std::process::Command::new(&ffmpeg)
            .args([
                "-hide_banner",
                "-nostdin",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=160x90:rate=15",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=1",
                "-t",
                "1",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-shortest",
                "-y",
            ])
            .arg(&input)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .status()
            .unwrap();
        assert!(fixture_status.success(), "video fixture creation failed");

        let font = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/fonts/SourceHanSansSC-Regular.otf");
        let alpha = "0.5";
        let font_val = escape_filter_value(&font.to_string_lossy());
        let text_file =
            std::env::temp_dir().join(format!("brand-media-video-wm-{}.txt", std::process::id()));
        fs::write(&text_file, "视频水印").unwrap();
        let text_file_val = escape_filter_value(&text_file.to_string_lossy());
        let positions = drawtext_tiled_coordinates();
        let mut previous = "0:v".to_string();
        let mut graph = Vec::new();
        for (index, (x, y)) in positions.iter().enumerate() {
            let next = if index + 1 == positions.len() {
                "watermarked".to_string()
            } else {
                format!("text{index}")
            };
            graph.push(format!("[{previous}]drawtext=fontfile='{font_val}':textfile='{text_file_val}':fontcolor=white@{alpha}:fontsize=h*10/100:x={x}:y={y}[{next}]"));
            previous = next;
        }
        let args = vec![
            OsString::from("-hide_banner"),
            OsString::from("-nostdin"),
            OsString::from("-i"),
            input.as_os_str().to_owned(),
            OsString::from("-filter_complex"),
            OsString::from(graph.join(";")),
            OsString::from("-map"),
            OsString::from("[watermarked]"),
            OsString::from("-map"),
            OsString::from("0:a?"),
            OsString::from("-c:v"),
            OsString::from("libx264"),
            OsString::from("-pix_fmt"),
            OsString::from("yuv420p"),
            OsString::from("-movflags"),
            OsString::from("+faststart"),
            OsString::from("-c:a"),
            OsString::from("aac"),
            OsString::from("-y"),
            output.as_os_str().to_owned(),
        ];
        let result = std::process::Command::new(&ffmpeg)
            .args(&args)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .output()
            .unwrap();
        let stderr = String::from_utf8_lossy(&result.stderr);
        assert!(
            result.status.success(),
            "video watermark encode failed: {}",
            &stderr[stderr.len().saturating_sub(500)..]
        );
        assert!(output.is_file() && output.metadata().unwrap().len() > 0);

        super::validate_watermark_video(&ffprobe, &input, &output)
            .expect("ffprobe validation must pass for CPU watermark output");

        // Audio must be present (AAC) for a sourced audio input.
        let probe = std::process::Command::new(&ffprobe)
            .args([
                "-v",
                "error",
                "-show_entries",
                "stream=codec_type,codec_name",
                "-of",
                "json",
            ])
            .arg(&output)
            .output()
            .unwrap();
        let raw = String::from_utf8_lossy(&probe.stdout);
        assert!(
            raw.contains("\"codec_type\": \"audio\"") && raw.contains("\"codec_name\": \"aac\""),
            "audio track missing: {raw}"
        );

        fs::remove_dir_all(&dir).unwrap();
        let _ = fs::remove_file(&text_file);
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn bundled_video_watermark_mov_pcm_transcodes_to_aac() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let ffprobe = bundled_test_sidecar("ffprobe");
        let dir = std::env::temp_dir().join(format!("品牌 MOV 水印 {}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("来源.mov");
        let output = dir.join("来源_watermarked.mp4");
        create_mov_pcm_fixture(&ffmpeg, &input);
        let font = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/fonts/SourceHanSansSC-Regular.otf");
        let text_file =
            std::env::temp_dir().join(format!("brand-mov-wm-{}.txt", std::process::id()));
        fs::write(&text_file, "MOV 水印").unwrap();
        let filter = format!(
            "[0:v]drawtext=fontfile='{}':textfile='{}':fontcolor=white@0.5:fontsize=h*10/100:x={}:y={}[watermarked]",
            escape_filter_value(&font.to_string_lossy()),
            escape_filter_value(&text_file.to_string_lossy()),
            drawtext_single_position("bottom-right").0,
            drawtext_single_position("bottom-right").1,
        );
        run_video_watermark_to_mp4(&ffmpeg, &ffprobe, &input, &output, &filter, true);
        // Output audio must be AAC (input was PCM).
        let probe = std::process::Command::new(&ffprobe)
            .args([
                "-v",
                "error",
                "-show_entries",
                "stream=codec_type,codec_name",
                "-of",
                "json",
            ])
            .arg(&output)
            .output()
            .unwrap();
        let raw = String::from_utf8_lossy(&probe.stdout);
        assert!(
            raw.contains("\"codec_name\": \"aac\""),
            "MOV PCM must become AAC: {raw}"
        );
        fs::remove_dir_all(&dir).unwrap();
        let _ = fs::remove_file(&text_file);
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn bundled_video_watermark_no_audio_succeeds_without_audio_stream() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let ffprobe = bundled_test_sidecar("ffprobe");
        let dir = std::env::temp_dir().join(format!("品牌 无声水印 {}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("silent.mp4");
        let output = dir.join("silent_watermarked.mp4");
        create_mp4_fixture(&ffmpeg, &input, false);
        let font = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/fonts/SourceHanSansSC-Regular.otf");
        let text_file =
            std::env::temp_dir().join(format!("brand-silent-wm-{}.txt", std::process::id()));
        fs::write(&text_file, "无声水印").unwrap();
        let positions = drawtext_tiled_coordinates();
        let mut previous = "0:v".to_string();
        let mut graph = Vec::new();
        for (i, (x, y)) in positions.iter().enumerate() {
            let next = if i + 1 == positions.len() {
                "watermarked".to_string()
            } else {
                format!("t{i}")
            };
            graph.push(format!("[{previous}]drawtext=fontfile='{}':textfile='{}':fontcolor=white@0.5:fontsize=h*10/100:x={x}:y={y}[{next}]", escape_filter_value(&font.to_string_lossy()), escape_filter_value(&text_file.to_string_lossy())));
            previous = next;
        }
        run_video_watermark_to_mp4(&ffmpeg, &ffprobe, &input, &output, &graph.join(";"), false);
        fs::remove_dir_all(&dir).unwrap();
        let _ = fs::remove_file(&text_file);
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn cpu_quality_presets_produce_valid_outputs_with_expected_size_direction() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let ffprobe = bundled_test_sidecar("ffprobe");
        let dir = std::env::temp_dir().join(format!("品牌质量预设 {}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("source.mp4");
        create_mp4_fixture(&ffmpeg, &input, false);
        let font = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/fonts/SourceHanSansSC-Regular.otf");
        let mut sizes = Vec::new();
        for quality in ["high", "balanced", "compact"] {
            let request = WatermarkMediaTaskRequest {
                task_id: format!("quality-{quality}"),
                input_path: input.to_string_lossy().into_owned(),
                options: WatermarkOptions {
                    kind: "text".into(),
                    text: "质量预设".into(),
                    image_path: None,
                    position: "bottom-right".into(),
                    size_percent: 10,
                    opacity: 0.5,
                    pattern: Some("tiled".into()),
                    density: None,
                    angle: None,
                    dark_mode: None,
                    offset_x: None,
                    offset_y: None,
                    columns: None,
                    rows: None,
                    placements: None,
                    quality: Some(quality.into()),
                    prefer_hardware: Some(false),
                    text_style: None,
                    reserved_output_path: None,
                    output_directory: dir.to_string_lossy().into_owned(),
                },
            };
            let output = dir.join(format!("{quality}.mp4"));
            let temp = super::video_watermark_temp_path(&output);
            let (args, cleanup) = super::watermark_ffmpeg_args_with_font(
                Some(&font),
                &request,
                &temp,
                super::EncoderBackend::Cpu,
                None,
                None,
            )
            .unwrap();
            let finalize = super::MediaFinalize {
                final_output: output.clone(),
                input: input.clone(),
                validate: true,
            };
            let cancel = std::sync::atomic::AtomicBool::new(false);
            let (terminal, stderr) = super::run_watermark_process_with_progress(
                &ffmpeg,
                &ffprobe,
                &args,
                &temp,
                Some(&finalize),
                &cancel,
                Some((0.0, 1.0)),
                &mut |_| {},
            );
            assert!(
                matches!(terminal, super::MediaTerminal::Completed { .. }),
                "quality {quality} failed: {stderr}"
            );
            for path in cleanup {
                let _ = fs::remove_file(path);
            }
            let probe = super::probe_video(&ffprobe, &output).unwrap();
            assert_eq!(probe.width, 160);
            assert_eq!(probe.height, 90);
            assert!(!probe.has_audio);
            sizes.push(fs::metadata(&output).unwrap().len());
        }
        assert!(
            sizes[0] >= sizes[2],
            "high should not be smaller than compact: {sizes:?}"
        );
        assert!(
            sizes[1] >= sizes[2],
            "balanced should not be smaller than compact: {sizes:?}"
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(target_os = "macos")]
    fn run_logo_watermark(
        ffmpeg: &Path,
        ffprobe: &Path,
        input: &Path,
        logo: &Path,
        output: &Path,
        filter: &str,
    ) {
        let temp = super::video_watermark_temp_path(output);
        let args = vec![
            OsString::from("-hide_banner"),
            OsString::from("-nostdin"),
            OsString::from("-i"),
            input.as_os_str().to_owned(),
            OsString::from("-i"),
            logo.as_os_str().to_owned(),
            OsString::from("-filter_complex"),
            OsString::from(filter),
            OsString::from("-map"),
            OsString::from("[watermarked]"),
            OsString::from("-map"),
            OsString::from("0:a?"),
            OsString::from("-c:v"),
            OsString::from("libx264"),
            OsString::from("-pix_fmt"),
            OsString::from("yuv420p"),
            OsString::from("-movflags"),
            OsString::from("+faststart"),
            OsString::from("-c:a"),
            OsString::from("aac"),
            OsString::from("-y"),
            temp.as_os_str().to_owned(),
        ];
        let result = std::process::Command::new(ffmpeg)
            .args(&args)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .output()
            .unwrap();
        let stderr = String::from_utf8_lossy(&result.stderr);
        assert!(
            result.status.success(),
            "logo watermark encode failed: {}",
            &stderr[stderr.len().saturating_sub(400)..]
        );
        let finalize = super::MediaFinalize {
            final_output: output.to_path_buf(),
            input: input.to_path_buf(),
            validate: true,
        };
        super::finalize_media_output(ffprobe, &temp, &finalize).expect("logo finalize");
        assert_frame_differs(ffmpeg, input, output);
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn bundled_video_watermark_logo_single_and_tiled_overlay() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let ffprobe = bundled_test_sidecar("ffprobe");
        let dir = std::env::temp_dir().join(format!("品牌 Logo 水印 {}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("source.mp4");
        let logo = dir.join("logo.png");
        create_mp4_fixture(&ffmpeg, &input, true);
        create_still_png_fixture(&ffmpeg, &logo);
        let single_out = dir.join("single.mp4");
        let tiled_out = dir.join("tiled.mp4");
        run_logo_watermark(
            &ffmpeg,
            &ffprobe,
            &input,
            &logo,
            &single_out,
            &logo_overlay_filter("bottom-right", 25, false),
        );
        run_logo_watermark(
            &ffmpeg,
            &ffprobe,
            &input,
            &logo,
            &tiled_out,
            &logo_overlay_filter("bottom-right", 25, true),
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn bundled_video_watermark_text_single_keeps_dimensions_and_duration() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let ffprobe = bundled_test_sidecar("ffprobe");
        let dir = std::env::temp_dir().join(format!("品牌 单水印 {}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("source.mp4");
        let output = dir.join("source_watermarked.mp4");
        create_mp4_fixture(&ffmpeg, &input, true);
        let font = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/fonts/SourceHanSansSC-Regular.otf");
        let text_file =
            std::env::temp_dir().join(format!("brand-single-wm-{}.txt", std::process::id()));
        fs::write(&text_file, "单水印").unwrap();
        let filter = format!(
            "[0:v]drawtext=fontfile='{}':textfile='{}':fontcolor=white@0.5:fontsize=h*10/100:x={}:y={}[watermarked]",
            escape_filter_value(&font.to_string_lossy()),
            escape_filter_value(&text_file.to_string_lossy()),
            drawtext_single_position("center").0,
            drawtext_single_position("center").1,
        );
        run_video_watermark_to_mp4(&ffmpeg, &ffprobe, &input, &output, &filter, true);
        fs::remove_dir_all(&dir).unwrap();
        let _ = fs::remove_file(&text_file);
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn watermark_process_bad_input_fails_once_without_residue() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let ffprobe = bundled_test_sidecar("ffprobe");
        let dir = std::env::temp_dir().join(format!("品牌 坏输入 {}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("missing.mp4");
        let final_out = dir.join("final.mp4");
        let temp = super::video_watermark_temp_path(&final_out);
        let args = vec![
            OsString::from("-hide_banner"),
            OsString::from("-nostdin"),
            OsString::from("-i"),
            input.as_os_str().to_owned(),
            OsString::from("-map"),
            OsString::from("0:v"),
            OsString::from("-c:v"),
            OsString::from("libx264"),
            OsString::from("-y"),
            temp.as_os_str().to_owned(),
        ];
        let finalize = super::MediaFinalize {
            final_output: final_out.clone(),
            input: input.clone(),
            validate: false,
        };
        let cancel = std::sync::atomic::AtomicBool::new(false);
        let outcome = (super::run_watermark_process(
            &ffmpeg,
            &ffprobe,
            &args,
            &temp,
            Some(&finalize),
            &cancel,
        ))
        .0;
        assert!(
            matches!(outcome, super::MediaTerminal::Failed { .. }),
            "expected Failed, got {outcome:?}"
        );
        assert!(!temp.exists(), "temp must be removed");
        assert!(!final_out.exists(), "final must not exist");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn watermark_process_rename_conflict_fails_once_and_preserves_target() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let ffprobe = bundled_test_sidecar("ffprobe");
        let dir = std::env::temp_dir().join(format!("品牌 冲突 {}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("source.mp4");
        create_mp4_fixture(&ffmpeg, &input, true);
        let final_out = dir.join("final.mp4");
        fs::write(&final_out, b"existing-target").unwrap();
        let temp = super::video_watermark_temp_path(&final_out);
        let args = vec![
            OsString::from("-hide_banner"),
            OsString::from("-nostdin"),
            OsString::from("-i"),
            input.as_os_str().to_owned(),
            OsString::from("-map"),
            OsString::from("0:v"),
            OsString::from("-c:v"),
            OsString::from("libx264"),
            OsString::from("-pix_fmt"),
            OsString::from("yuv420p"),
            OsString::from("-y"),
            temp.as_os_str().to_owned(),
        ];
        let finalize = super::MediaFinalize {
            final_output: final_out.clone(),
            input: input.clone(),
            validate: true,
        };
        let cancel = std::sync::atomic::AtomicBool::new(false);
        let outcome = (super::run_watermark_process(
            &ffmpeg,
            &ffprobe,
            &args,
            &temp,
            Some(&finalize),
            &cancel,
        ))
        .0;
        assert!(
            matches!(outcome, super::MediaTerminal::Failed { .. }),
            "expected Failed, got {outcome:?}"
        );
        assert!(!temp.exists(), "temp must be removed");
        assert_eq!(
            fs::read(&final_out).unwrap(),
            b"existing-target",
            "target must not be overwritten"
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn watermark_process_mid_run_cancel_returns_cancelled_once() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let ffprobe = bundled_test_sidecar("ffprobe");
        let dir = std::env::temp_dir().join(format!("品牌 取消 {}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let final_out = dir.join("final.mp4");
        let temp = super::video_watermark_temp_path(&final_out);
        // Long-running real FFmpeg child.
        let args = vec![
            OsString::from("-hide_banner"),
            OsString::from("-nostdin"),
            OsString::from("-f"),
            OsString::from("lavfi"),
            OsString::from("-re"),
            OsString::from("-i"),
            OsString::from("testsrc2=size=160x90:rate=15"),
            OsString::from("-t"),
            OsString::from("30"),
            OsString::from("-c:v"),
            OsString::from("libx264"),
            OsString::from("-y"),
            temp.as_os_str().to_owned(),
        ];
        let finalize = super::MediaFinalize {
            final_output: final_out.clone(),
            input: dir.join("unused.mp4"),
            validate: false,
        };
        let cancel = std::sync::atomic::AtomicBool::new(false);
        let child_cancel = std::sync::Arc::new(cancel);
        let handle = {
            let ffmpeg = ffmpeg.clone();
            let ffprobe = ffprobe.clone();
            let args = args.clone();
            let temp = temp.clone();
            let finalize = finalize;
            let cancel = child_cancel.clone();
            std::thread::spawn(move || {
                super::run_watermark_process(
                    &ffmpeg,
                    &ffprobe,
                    &args,
                    &temp,
                    Some(&finalize),
                    &cancel,
                )
            })
        };
        std::thread::sleep(std::time::Duration::from_millis(200));
        child_cancel.store(true, std::sync::atomic::Ordering::SeqCst);
        let (outcome, _stderr) = handle.join().unwrap();
        assert_eq!(
            outcome,
            super::MediaTerminal::Cancelled,
            "expected Cancelled once"
        );
        assert!(!temp.exists(), "temp must be removed after cancel");
        assert!(!final_out.exists(), "final must not exist after cancel");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn watermark_process_invalid_target_fails_once_without_residue() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let ffprobe = bundled_test_sidecar("ffprobe");
        let dir = std::env::temp_dir().join(format!("品牌 无效目标 {}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("source.mp4");
        create_mp4_fixture(&ffmpeg, &input, false);
        // Make the parent of the final output a regular file, so linking fails.
        let blocker = dir.join("blocker");
        fs::write(&blocker, b"file-not-dir").unwrap();
        let final_out = blocker.join("final.mp4");
        let temp = super::video_watermark_temp_path(&dir.join("final.mp4"));
        let args = vec![
            OsString::from("-hide_banner"),
            OsString::from("-nostdin"),
            OsString::from("-i"),
            input.as_os_str().to_owned(),
            OsString::from("-map"),
            OsString::from("0:v"),
            OsString::from("-c:v"),
            OsString::from("libx264"),
            OsString::from("-pix_fmt"),
            OsString::from("yuv420p"),
            OsString::from("-y"),
            temp.as_os_str().to_owned(),
        ];
        let finalize = super::MediaFinalize {
            final_output: final_out.clone(),
            input: input.clone(),
            validate: false,
        };
        let cancel = std::sync::atomic::AtomicBool::new(false);
        let outcome = (super::run_watermark_process(
            &ffmpeg,
            &ffprobe,
            &args,
            &temp,
            Some(&finalize),
            &cancel,
        ))
        .0;
        assert!(
            matches!(outcome, super::MediaTerminal::Failed { .. }),
            "expected Failed, got {outcome:?}"
        );
        assert!(!temp.exists(), "temp must be removed");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn watermark_process_validator_failure_fails_once_without_final() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let ffprobe = bundled_test_sidecar("ffprobe");
        let dir = std::env::temp_dir().join(format!("品牌 校验失败 {}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("source.mp4");
        create_mp4_fixture(&ffmpeg, &input, false);
        let final_out = dir.join("final.mp4");
        let temp = super::video_watermark_temp_path(&final_out);
        // Encode with mpeg4 (not h264) so validation must reject the output.
        let args = vec![
            OsString::from("-hide_banner"),
            OsString::from("-nostdin"),
            OsString::from("-i"),
            input.as_os_str().to_owned(),
            OsString::from("-c:v"),
            OsString::from("mpeg4"),
            OsString::from("-y"),
            temp.as_os_str().to_owned(),
        ];
        let finalize = super::MediaFinalize {
            final_output: final_out.clone(),
            input: input.clone(),
            validate: true,
        };
        let cancel = std::sync::atomic::AtomicBool::new(false);
        let outcome = (super::run_watermark_process(
            &ffmpeg,
            &ffprobe,
            &args,
            &temp,
            Some(&finalize),
            &cancel,
        ))
        .0;
        assert!(
            matches!(outcome, super::MediaTerminal::Failed { .. }),
            "expected Failed, got {outcome:?}"
        );
        assert!(
            !temp.exists(),
            "temp must be removed after validation failure"
        );
        assert!(
            !final_out.exists(),
            "final must not exist after validation failure"
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn watermark_process_hard_link_success_removes_temp_and_keeps_final() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let ffprobe = bundled_test_sidecar("ffprobe");
        let dir = std::env::temp_dir().join(format!("品牌 硬链接 {}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("source.mp4");
        create_mp4_fixture(&ffmpeg, &input, false);
        let final_out = dir.join("final.mp4");
        let temp = super::video_watermark_temp_path(&final_out);
        let args = vec![
            OsString::from("-hide_banner"),
            OsString::from("-nostdin"),
            OsString::from("-i"),
            input.as_os_str().to_owned(),
            OsString::from("-map"),
            OsString::from("0:v"),
            OsString::from("-c:v"),
            OsString::from("libx264"),
            OsString::from("-pix_fmt"),
            OsString::from("yuv420p"),
            OsString::from("-y"),
            temp.as_os_str().to_owned(),
        ];
        let finalize = super::MediaFinalize {
            final_output: final_out.clone(),
            input: input.clone(),
            validate: true,
        };
        let cancel = std::sync::atomic::AtomicBool::new(false);
        let outcome = (super::run_watermark_process(
            &ffmpeg,
            &ffprobe,
            &args,
            &temp,
            Some(&finalize),
            &cancel,
        ))
        .0;
        assert!(
            matches!(outcome, super::MediaTerminal::Completed { .. }),
            "expected Completed, got {outcome:?}"
        );
        assert!(!temp.exists(), "temp must be gone after hard_link success");
        assert!(
            final_out.exists() && final_out.metadata().unwrap().len() > 0,
            "final must exist with content"
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn bundled_ffmpeg_image_overlay_smoke_succeeds() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let dir = std::env::temp_dir().join(format!("品牌水印 图片logo-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("source.png");
        let logo = dir.join("logo.png");
        let output = dir.join("result.png");
        create_still_png_fixture(&ffmpeg, &input);
        // Tiny solid-colour logo
        let logo_status = std::process::Command::new(&ffmpeg)
            .args([
                "-hide_banner",
                "-nostdin",
                "-f",
                "lavfi",
                "-i",
                "color=c=0xFF6600:s=32x32:r=1",
                "-frames:v",
                "1",
                "-pix_fmt",
                "rgba",
                "-y",
            ])
            .arg(&logo)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .status()
            .unwrap();
        assert!(logo_status.success(), "logo fixture creation failed");

        let filter = format!(
            "[1:v]format=rgba,colorchannelmixer=aa=0.5[wo];             [wo][0:v]scale2ref=w=main_w*25/100:h=-1[wm][base];             [base][wm]overlay=x={}:y={}:format=auto[watermarked]",
            overlay_coordinates("bottom-right").0,
            overlay_coordinates("bottom-right").1,
        );
        let args = [
            OsString::from("-hide_banner"),
            OsString::from("-nostdin"),
            OsString::from("-y"),
            OsString::from("-i"),
            input.as_os_str().to_owned(),
            OsString::from("-i"),
            logo.as_os_str().to_owned(),
            OsString::from("-filter_complex"),
            OsString::from(filter),
            OsString::from("-map"),
            OsString::from("[watermarked]"),
            OsString::from("-frames:v"),
            OsString::from("1"),
            output.as_os_str().to_owned(),
        ];
        let result = std::process::Command::new(&ffmpeg)
            .args(&args)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "image overlay ffmpeg failed: {}",
            String::from_utf8_lossy(&result.stderr)
        );
        assert!(output.metadata().unwrap().len() > 0);
        fs::remove_dir_all(&dir).unwrap();
    }

    // ---- 2C-1 watermark FIFO core tests ----

    fn queue_sink() -> (
        Arc<dyn Fn(WatermarkQueueEvent) + Send + Sync>,
        mpsc::Receiver<WatermarkQueueEvent>,
    ) {
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn Fn(WatermarkQueueEvent) + Send + Sync> = Arc::new(move |event| {
            let _ = tx.send(event);
        });
        (sink, rx)
    }

    fn recording_sink() -> (
        Arc<dyn Fn(WatermarkQueueEvent) + Send + Sync>,
        Arc<Mutex<Vec<WatermarkQueueEvent>>>,
        mpsc::Receiver<WatermarkQueueEvent>,
    ) {
        let events = Arc::new(Mutex::new(Vec::new()));
        let (tx, rx) = mpsc::channel();
        let sink = {
            let events = events.clone();
            Arc::new(move |event: WatermarkQueueEvent| {
                events.lock().unwrap().push(event.clone());
                let _ = tx.send(event);
            }) as Arc<dyn Fn(WatermarkQueueEvent) + Send + Sync>
        };
        (sink, events, rx)
    }

    fn drain_until_terminal<F>(rx: &mpsc::Receiver<WatermarkQueueEvent>, predicate: F)
    where
        F: Fn(&WatermarkTerminal) -> bool,
    {
        loop {
            match rx.recv().expect("sink channel closed") {
                WatermarkQueueEvent::Terminal { terminal: got, .. } if predicate(&got) => return,
                _ => {}
            }
        }
    }

    fn terminal_completed(terminal: &WatermarkTerminal) -> bool {
        matches!(terminal, WatermarkTerminal::Completed { .. })
    }

    fn terminal_cancelled(terminal: &WatermarkTerminal) -> bool {
        matches!(terminal, WatermarkTerminal::Cancelled)
    }

    fn terminal_failed(terminal: &WatermarkTerminal) -> bool {
        matches!(terminal, WatermarkTerminal::Failed { .. })
    }

    fn preview_request(dir: &Path, task_id: &str) -> WatermarkPreviewRequest {
        WatermarkPreviewRequest {
            task_id: task_id.into(),
            input_path: dir.join("input.mp4").to_string_lossy().into_owned(),
            temp_directory: dir.to_string_lossy().into_owned(),
            kind: "text".into(),
            text: task_id.into(),
            image_path: None,
            position: "bottom-right".into(),
            size_percent: 10,
            opacity: 0.7,
            pattern: Some("single".into()),
            density: None,
            angle: None,
            offset_x: None,
            offset_y: None,
            columns: None,
            rows: None,
            placements: None,
            text_style: None,
            clean_frame: None,
            timestamp_seconds: Some(0.2),
            width: Some(160),
            duration: Some(1.0),
            ffmpeg_path: None,
            ffprobe_path: None,
            font_path: None,
        }
    }

    #[test]
    fn preview_temp_name_matches_app_cache_scope_without_hidden_components() {
        let dir = std::env::temp_dir().join(format!("bmw-preview-name-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = super::preview_temp_path(&preview_request(&dir, "job-1")).unwrap();
        let file_name = path.file_name().unwrap().to_string_lossy();
        assert!(
            file_name.starts_with("watermark-preview-"),
            "hidden file bypasses Tauri scope: {file_name}"
        );
        assert!(file_name.ends_with(".png"));
        assert!(path.starts_with(&dir));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn clean_frame_preview_uses_only_input_frame_and_does_not_apply_watermark_filter() {
        let dir = std::env::temp_dir().join(format!("clean-frame-preview-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let mut request = preview_request(&dir, "clean-frame");
        request.clean_frame = Some(true);
        let output = dir.join("clean.png");
        let (args, cleanup) =
            super::watermark_preview_args(None, &request, &output, None).expect("clean frame args");
        assert!(cleanup.is_empty());
        let values: Vec<_> = args
            .iter()
            .map(|value| value.to_string_lossy().into_owned())
            .collect();
        assert!(values.iter().any(|value| value == "-vf"));
        assert!(!values.iter().any(|value| value == "-filter_complex"));
        assert!(values.iter().any(|value| value == "0:v:0"));
        fs::remove_dir_all(&dir).unwrap();
    }

    fn preview_sink() -> (
        Arc<dyn Fn(WatermarkPreviewStatusEvent) + Send + Sync>,
        Arc<Mutex<Vec<WatermarkPreviewStatusEvent>>>,
        mpsc::Receiver<WatermarkPreviewStatusEvent>,
    ) {
        let events = Arc::new(Mutex::new(Vec::new()));
        let (tx, rx) = mpsc::channel();
        let sink = {
            let events = events.clone();
            Arc::new(move |event: WatermarkPreviewStatusEvent| {
                events.lock().unwrap().push(event.clone());
                let _ = tx.send(event);
            }) as Arc<dyn Fn(WatermarkPreviewStatusEvent) + Send + Sync>
        };
        (sink, events, rx)
    }

    fn wait_preview_status(
        rx: &mpsc::Receiver<WatermarkPreviewStatusEvent>,
        task_id: &str,
        expected: WatermarkPreviewStatus,
    ) -> WatermarkPreviewStatusEvent {
        loop {
            let event = rx.recv().expect("preview sink channel closed");
            if event.task_id == task_id && event.status == expected {
                return event;
            }
        }
    }

    #[test]
    fn watermark_preview_busy_rejects_without_running_runner() {
        let dir = std::env::temp_dir().join(format!("preview-busy-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let (sink, events, _rx) = preview_sink();
        let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let runner_calls = calls.clone();
        let runner: Arc<
            dyn Fn(FrozenWatermarkPreviewJob) -> WatermarkPreviewTerminal + Send + Sync,
        > = Arc::new(move |_| {
            runner_calls.fetch_add(1, Ordering::SeqCst);
            WatermarkPreviewTerminal::Failed {
                message: "unexpected".into(),
            }
        });
        let formal_busy = Arc::new(AtomicBool::new(true));
        let queue = start_watermark_preview_queue_with_runner(sink, runner, formal_busy);
        assert_eq!(
            queue.start(preview_request(&dir, "busy")).unwrap_err(),
            super::WatermarkPreviewStartError::RejectedBusy
        );
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        assert!(events
            .lock()
            .unwrap()
            .iter()
            .any(|event| event.status == WatermarkPreviewStatus::RejectedBusy));
        queue.shutdown();
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn watermark_preview_running_replacement_waits_for_cleanup_before_new_start() {
        let dir = std::env::temp_dir().join(format!("preview-replace-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let (sink, _events, rx) = preview_sink();
        let order = Arc::new(Mutex::new(Vec::new()));
        let order_for_runner = order.clone();
        let runner: Arc<
            dyn Fn(FrozenWatermarkPreviewJob) -> WatermarkPreviewTerminal + Send + Sync,
        > = Arc::new(move |job| {
            order_for_runner
                .lock()
                .unwrap()
                .push(format!("start:{}", job.task_id));
            if job.task_id == "old" {
                while !job.cancel.load(Ordering::SeqCst) {
                    thread::yield_now();
                }
                order_for_runner.lock().unwrap().push("end:old".into());
                WatermarkPreviewTerminal::Cancelled
            } else {
                order_for_runner.lock().unwrap().push("end:new".into());
                fs::write(&job.output_path, b"png").unwrap();
                WatermarkPreviewTerminal::Completed {
                    output_path: job.output_path,
                }
            }
        });
        let queue = start_watermark_preview_queue_with_runner(
            sink,
            runner,
            Arc::new(AtomicBool::new(false)),
        );
        queue.start(preview_request(&dir, "old")).unwrap();
        wait_preview_status(&rx, "old", WatermarkPreviewStatus::Processing);
        let new_started = queue.start(preview_request(&dir, "new")).unwrap();
        wait_preview_status(&rx, "old", WatermarkPreviewStatus::Cancelled);
        let completed = wait_preview_status(&rx, "new", WatermarkPreviewStatus::Completed);
        assert_eq!(completed.output_path, Some(new_started.output_path.clone()));
        assert_eq!(
            *order.lock().unwrap(),
            vec!["start:old", "end:old", "start:new", "end:new"]
        );
        queue.shutdown();
        assert!(!Path::new(&new_started.output_path).exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn watermark_preview_cancel_is_idempotent_and_payload_is_frozen() {
        let dir = std::env::temp_dir().join(format!("preview-cancel-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let (sink, events, rx) = preview_sink();
        let observed_text = Arc::new(Mutex::new(String::new()));
        let observed_for_runner = observed_text.clone();
        let runner: Arc<
            dyn Fn(FrozenWatermarkPreviewJob) -> WatermarkPreviewTerminal + Send + Sync,
        > = Arc::new(move |job| {
            *observed_for_runner.lock().unwrap() = job.payload.text.clone();
            while !job.cancel.load(Ordering::SeqCst) {
                thread::yield_now();
            }
            WatermarkPreviewTerminal::Cancelled
        });
        let queue = start_watermark_preview_queue_with_runner(
            sink,
            runner,
            Arc::new(AtomicBool::new(false)),
        );
        let mut request = preview_request(&dir, "cancel");
        request.text = "frozen text".into();
        queue.start(request.clone()).unwrap();
        request.text = "mutated after enqueue".into();
        wait_preview_status(&rx, "cancel", WatermarkPreviewStatus::Processing);
        queue.cancel("cancel").unwrap();
        queue.cancel("cancel").unwrap();
        wait_preview_status(&rx, "cancel", WatermarkPreviewStatus::Cancelled);
        assert_eq!(&*observed_text.lock().unwrap(), "frozen text");
        assert_eq!(
            events
                .lock()
                .unwrap()
                .iter()
                .filter(|event| event.task_id == "cancel"
                    && event.status == WatermarkPreviewStatus::Cancelled)
                .count(),
            1
        );
        queue.shutdown();
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn watermark_preview_shutdown_removes_completed_result() {
        let dir = std::env::temp_dir().join(format!("preview-shutdown-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let (sink, _events, rx) = preview_sink();
        let runner: Arc<
            dyn Fn(FrozenWatermarkPreviewJob) -> WatermarkPreviewTerminal + Send + Sync,
        > = Arc::new(|job| {
            fs::write(&job.output_path, b"png").unwrap();
            WatermarkPreviewTerminal::Completed {
                output_path: job.output_path,
            }
        });
        let queue = start_watermark_preview_queue_with_runner(
            sink,
            runner,
            Arc::new(AtomicBool::new(false)),
        );
        let started = queue.start(preview_request(&dir, "shutdown")).unwrap();
        wait_preview_status(&rx, "shutdown", WatermarkPreviewStatus::Completed);
        assert!(Path::new(&started.output_path).is_file());
        queue.shutdown();
        assert!(!Path::new(&started.output_path).exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn watermark_preview_success_replaces_and_removes_previous_result() {
        let dir =
            std::env::temp_dir().join(format!("preview-replace-result-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let (sink, _events, rx) = preview_sink();
        let runner: Arc<
            dyn Fn(FrozenWatermarkPreviewJob) -> WatermarkPreviewTerminal + Send + Sync,
        > = Arc::new(|job| {
            fs::write(&job.output_path, job.task_id.as_bytes()).unwrap();
            WatermarkPreviewTerminal::Completed {
                output_path: job.output_path,
            }
        });
        let queue = start_watermark_preview_queue_with_runner(
            sink,
            runner,
            Arc::new(AtomicBool::new(false)),
        );
        let first = queue.start(preview_request(&dir, "first")).unwrap();
        wait_preview_status(&rx, "first", WatermarkPreviewStatus::Completed);
        assert!(Path::new(&first.output_path).is_file());
        let second = queue.start(preview_request(&dir, "second")).unwrap();
        wait_preview_status(&rx, "second", WatermarkPreviewStatus::Completed);
        assert!(!Path::new(&first.output_path).exists());
        assert!(Path::new(&second.output_path).is_file());
        queue.shutdown();
        assert!(!Path::new(&second.output_path).exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn watermark_preview_is_cancelled_before_formal_queue_starts_next_job() {
        let dir = std::env::temp_dir().join(format!("preview-formal-coord-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let (preview_sink, _preview_events, preview_rx) = preview_sink();
        let order = Arc::new(Mutex::new(Vec::new()));
        let preview_order = order.clone();
        let preview_runner: Arc<
            dyn Fn(FrozenWatermarkPreviewJob) -> WatermarkPreviewTerminal + Send + Sync,
        > = Arc::new(move |job| {
            preview_order.lock().unwrap().push("preview-start".into());
            while !job.cancel.load(Ordering::SeqCst) {
                thread::yield_now();
            }
            preview_order.lock().unwrap().push("preview-cleanup".into());
            WatermarkPreviewTerminal::Cancelled
        });
        let preview = start_watermark_preview_queue_with_runner(
            preview_sink,
            preview_runner,
            Arc::new(AtomicBool::new(false)),
        );

        let formal_sink: Arc<dyn Fn(WatermarkQueueEvent) + Send + Sync> = Arc::new(|_| {});
        let formal_order = order.clone();
        let formal = start_watermark_video_queue::<String, _>(formal_sink, move |job, _| {
            formal_order.lock().unwrap().push("formal-start".into());
            assert_eq!(job.payload, "frozen".to_string());
            WatermarkTerminal::Completed {
                output_path: job.reserved_final.to_string_lossy().into_owned(),
                output_bytes: 0,
            }
        });
        let preview_control = Arc::new(preview.control());
        formal.set_before_start_hook(Arc::new(move || preview_control.cancel_and_wait()));

        preview
            .start(preview_request(&dir, "preview-running"))
            .unwrap();
        wait_preview_status(
            &preview_rx,
            "preview-running",
            WatermarkPreviewStatus::Processing,
        );
        formal
            .enqueue("formal-job".into(), "frozen".into(), dir.join("formal.mp4"))
            .unwrap();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
        while order.lock().unwrap().last().map(String::as_str) != Some("formal-start") {
            assert!(
                std::time::Instant::now() < deadline,
                "formal queue did not start"
            );
            thread::yield_now();
        }
        wait_preview_status(
            &preview_rx,
            "preview-running",
            WatermarkPreviewStatus::Cancelled,
        );
        assert_eq!(
            *order.lock().unwrap(),
            vec!["preview-start", "preview-cleanup", "formal-start"]
        );
        formal.shutdown();
        preview.shutdown();
        fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn bundled_watermark_preview_text_and_logo_produce_real_pngs_with_frame_diff() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let ffprobe = bundled_test_sidecar("ffprobe");
        let dir =
            std::env::temp_dir().join(format!("品牌 preview 中文 空格 {}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("输入 video.mp4");
        let logo = dir.join("logo.png");
        let baseline = dir.join("baseline.png");
        create_fixture(&ffmpeg, &input);
        create_still_png_fixture(&ffmpeg, &logo);
        let font = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/fonts/SourceHanSansSC-Regular.otf");
        let (sink, _events, rx) = preview_sink();
        let queue = start_watermark_preview_queue_with_runner(
            sink,
            Arc::new(run_watermark_preview_job),
            Arc::new(AtomicBool::new(false)),
        );

        let mut text_request = preview_request(&dir, "text-real");
        text_request.input_path = input.to_string_lossy().into_owned();
        text_request.temp_directory = dir.to_string_lossy().into_owned();
        text_request.ffmpeg_path = Some(ffmpeg.clone());
        text_request.ffprobe_path = Some(ffprobe.clone());
        text_request.font_path = Some(font);
        text_request.text = "真实预览".into();
        let text_started = queue.start(text_request).unwrap();
        let text_completed =
            wait_preview_status(&rx, "text-real", WatermarkPreviewStatus::Completed);
        assert_eq!(
            text_completed.output_path,
            Some(text_started.output_path.clone())
        );

        let baseline_status = std::process::Command::new(&ffmpeg)
            .args(["-hide_banner", "-nostdin", "-ss", "0.2", "-i"])
            .arg(&input)
            .args(["-frames:v", "1", "-y"])
            .arg(&baseline)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .unwrap();
        assert!(baseline_status.success());
        assert_frame_differs(&ffmpeg, &baseline, Path::new(&text_started.output_path));
        let text_probe = std::process::Command::new(&ffprobe)
            .args([
                "-v",
                "error",
                "-show_entries",
                "stream=codec_name,width,height",
                "-of",
                "json",
            ])
            .arg(&text_started.output_path)
            .output()
            .unwrap();
        let text_probe_text = String::from_utf8_lossy(&text_probe.stdout);
        assert!(
            text_probe.status.success(),
            "text ffprobe failed: {text_probe_text}"
        );
        assert!(
            text_probe_text.contains("png"),
            "text preview is not PNG: {text_probe_text}"
        );
        assert!(
            text_probe_text.contains("160"),
            "text preview width missing: {text_probe_text}"
        );

        let mut logo_request = preview_request(&dir, "logo-real");
        logo_request.input_path = input.to_string_lossy().into_owned();
        logo_request.temp_directory = dir.to_string_lossy().into_owned();
        logo_request.kind = "image".into();
        logo_request.image_path = Some(logo.to_string_lossy().into_owned());
        logo_request.pattern = Some("tiled".into());
        logo_request.ffmpeg_path = Some(ffmpeg.clone());
        logo_request.ffprobe_path = Some(ffprobe.clone());
        let logo_started = queue.start(logo_request).unwrap();
        let logo_completed =
            wait_preview_status(&rx, "logo-real", WatermarkPreviewStatus::Completed);
        assert_eq!(
            logo_completed.output_path,
            Some(logo_started.output_path.clone())
        );

        assert_frame_differs(&ffmpeg, &baseline, Path::new(&logo_started.output_path));

        let logo_probe = std::process::Command::new(&ffprobe)
            .args([
                "-v",
                "error",
                "-show_entries",
                "stream=codec_name,width,height",
                "-of",
                "json",
            ])
            .arg(&logo_started.output_path)
            .output()
            .unwrap();
        let logo_probe_text = String::from_utf8_lossy(&logo_probe.stdout);
        assert!(
            logo_probe.status.success(),
            "logo ffprobe failed: {logo_probe_text}"
        );
        assert!(
            logo_probe_text.contains("png"),
            "logo preview is not PNG: {logo_probe_text}"
        );
        assert!(
            logo_probe_text.contains("160"),
            "logo preview width missing: {logo_probe_text}"
        );
        queue.shutdown();
        assert!(!Path::new(&text_started.output_path).exists());
        assert!(!Path::new(&logo_started.output_path).exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn watermark_queue_fifo_runs_one_at_a_time_and_respects_order() {
        let (sink, rx) = queue_sink();
        let start_order = Arc::new(Mutex::new(Vec::new()));
        let active = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let max_active = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let first_started = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let release = Arc::new(std::sync::atomic::AtomicBool::new(false));

        let runner = {
            let start_order = start_order.clone();
            let active = active.clone();
            let max_active = max_active.clone();
            let first_started = first_started.clone();
            let release = release.clone();
            move |job: FrozenWatermarkJob<String>, _emit| {
                start_order.lock().unwrap().push(job.task_id.clone());
                let now = active.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
                max_active.fetch_max(now, std::sync::atomic::Ordering::SeqCst);
                if job.task_id == "first" {
                    first_started.store(true, std::sync::atomic::Ordering::SeqCst);
                    // Block deterministically until the main thread allows the
                    // first job to finish, proving the second does not start early.
                    while !release.load(std::sync::atomic::Ordering::SeqCst) {
                        std::thread::yield_now();
                    }
                }
                active.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
                WatermarkTerminal::Completed {
                    output_path: "/tmp/out.mp4".into(),
                    output_bytes: 1,
                }
            }
        };

        let queue = start_watermark_video_queue::<String, _>(sink, runner);
        queue
            .enqueue("first".into(), "one".into(), PathBuf::from("/tmp/a.mp4"))
            .unwrap();
        queue
            .enqueue("second".into(), "two".into(), PathBuf::from("/tmp/b.mp4"))
            .unwrap();

        // Wait until the first job has started.
        while !first_started.load(std::sync::atomic::Ordering::SeqCst) {
            std::thread::yield_now();
        }
        assert_eq!(*start_order.lock().unwrap(), vec!["first".to_string()]);
        // While first is blocked, second must not have started.
        assert_eq!(max_active.load(std::sync::atomic::Ordering::SeqCst), 1);

        release.store(true, std::sync::atomic::Ordering::SeqCst);
        drain_until_terminal(&rx, terminal_completed);
        drain_until_terminal(&rx, terminal_completed);
        queue.shutdown();

        assert_eq!(
            *start_order.lock().unwrap(),
            vec!["first".to_string(), "second".to_string()]
        );
        assert_eq!(max_active.load(std::sync::atomic::Ordering::SeqCst), 1);
    }

    #[test]
    fn watermark_queue_continues_after_a_failed_job() {
        let (sink, rx) = queue_sink();
        let ran = Arc::new(Mutex::new(Vec::new()));
        let runner = {
            let ran = ran.clone();
            move |job: FrozenWatermarkJob<String>, _emit| {
                ran.lock().unwrap().push(job.task_id.clone());
                if job.task_id == "first" {
                    WatermarkTerminal::Failed {
                        message: "boom".into(),
                    }
                } else {
                    WatermarkTerminal::Completed {
                        output_path: "/tmp/out.mp4".into(),
                        output_bytes: 1,
                    }
                }
            }
        };
        let queue = start_watermark_video_queue::<String, _>(sink, runner);
        queue
            .enqueue("first".into(), "a".into(), PathBuf::from("/tmp/a.mp4"))
            .unwrap();
        queue
            .enqueue("second".into(), "b".into(), PathBuf::from("/tmp/b.mp4"))
            .unwrap();
        drain_until_terminal(&rx, terminal_failed);
        drain_until_terminal(&rx, terminal_completed);
        queue.shutdown();
        assert_eq!(
            *ran.lock().unwrap(),
            vec!["first".to_string(), "second".to_string()]
        );
    }

    #[test]
    fn watermark_queue_finalizing_transitions_to_single_completed_terminal() {
        // Regression for the "stuck at 99%" lifecycle: a job that reaches 99%
        // and Finalizing must commit exactly one Completed terminal, with no
        // Progress (or any other event) replayed after the terminal.
        let (sink, events, rx) = recording_sink();
        let runner =
            move |job: FrozenWatermarkJob<String>,
                  emit: Arc<dyn Fn(WatermarkQueueEvent) + Send + Sync>| {
                (emit)(WatermarkQueueEvent::Status {
                    task_id: job.task_id.clone(),
                    status: WatermarkJobStatus::Processing,
                    reason: None,
                });
                (emit)(WatermarkQueueEvent::Progress {
                    task_id: job.task_id.clone(),
                    progress: 0.99,
                });
                (emit)(WatermarkQueueEvent::Status {
                    task_id: job.task_id.clone(),
                    status: WatermarkJobStatus::Finalizing,
                    reason: None,
                });
                WatermarkTerminal::Completed {
                    output_path: "/tmp/out.mp4".into(),
                    output_bytes: 1,
                }
            };
        let queue = start_watermark_video_queue::<String, _>(sink, runner);
        queue
            .enqueue("job".into(), "payload".into(), PathBuf::from("/tmp/a.mp4"))
            .unwrap();
        drain_until_terminal(&rx, terminal_completed);
        queue.shutdown();

        let recorded = events.lock().unwrap().clone();
        let mut saw_finalizing = false;
        let mut terminal_count = 0usize;
        let mut events_after_terminal = 0usize;
        for event in recorded.iter().filter(|e| {
            let id = match e {
                WatermarkQueueEvent::Status { task_id, .. }
                | WatermarkQueueEvent::Progress { task_id, .. }
                | WatermarkQueueEvent::Terminal { task_id, .. } => task_id,
            };
            id == "job"
        }) {
            if terminal_count > 0 {
                events_after_terminal += 1;
                continue;
            }
            match event {
                WatermarkQueueEvent::Status { status, .. }
                    if *status == WatermarkJobStatus::Finalizing =>
                {
                    saw_finalizing = true;
                }
                WatermarkQueueEvent::Terminal { terminal, .. } => {
                    assert!(matches!(terminal, WatermarkTerminal::Completed { .. }));
                    terminal_count += 1;
                }
                _ => {}
            }
        }
        assert!(saw_finalizing, "finalizing must precede the terminal");
        assert_eq!(terminal_count, 1, "terminal committed exactly once");
        assert_eq!(events_after_terminal, 0, "no events after the terminal");
    }

    #[test]
    fn watermark_queue_waiting_cancel_never_runs_and_commits_cancelled_once() {
        let (sink, rx) = queue_sink();
        let first_started = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let release = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let runner = {
            let first_started = first_started.clone();
            let release = release.clone();
            move |job: FrozenWatermarkJob<String>, _emit| {
                if job.task_id == "first" {
                    first_started.store(true, std::sync::atomic::Ordering::SeqCst);
                    while !release.load(std::sync::atomic::Ordering::SeqCst) {
                        std::thread::yield_now();
                    }
                    WatermarkTerminal::Completed {
                        output_path: "/tmp/out.mp4".into(),
                        output_bytes: 1,
                    }
                } else {
                    panic!("waiting job must not run");
                }
            }
        };
        let queue = start_watermark_video_queue::<String, _>(sink, runner);
        queue
            .enqueue("first".into(), "a".into(), PathBuf::from("/tmp/a.mp4"))
            .unwrap();
        queue
            .enqueue("second".into(), "b".into(), PathBuf::from("/tmp/b.mp4"))
            .unwrap();
        while !first_started.load(std::sync::atomic::Ordering::SeqCst) {
            std::thread::yield_now();
        }
        queue.cancel("second").unwrap();
        drain_until_terminal(&rx, terminal_cancelled);
        // Idempotent repeated cancel must not emit a second terminal.
        queue.cancel("second").unwrap();
        release.store(true, std::sync::atomic::Ordering::SeqCst);
        drain_until_terminal(&rx, terminal_completed);
        queue.shutdown();
    }

    #[test]
    fn watermark_queue_running_cancel_is_observed_before_next_starts() {
        let (sink, rx) = queue_sink();
        let second_started = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let first_cleanup_done = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let first_started = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let allow_first_return = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let runner = {
            let second_started = second_started.clone();
            let first_cleanup_done = first_cleanup_done.clone();
            let first_started = first_started.clone();
            let allow_first_return = allow_first_return.clone();
            move |job: FrozenWatermarkJob<String>, _emit| {
                if job.task_id == "first" {
                    first_started.store(true, std::sync::atomic::Ordering::SeqCst);
                    // Observe the cancel flag, then simulate cleanup before returning.
                    while !job.cancel.load(std::sync::atomic::Ordering::SeqCst) {
                        std::thread::yield_now();
                    }
                    first_cleanup_done.store(true, std::sync::atomic::Ordering::SeqCst);
                    // Hold the worker here so we can deterministically assert the
                    // second job has not started before this runner returns.
                    while !allow_first_return.load(std::sync::atomic::Ordering::SeqCst) {
                        std::thread::yield_now();
                    }
                    WatermarkTerminal::Cancelled
                } else {
                    second_started.store(true, std::sync::atomic::Ordering::SeqCst);
                    WatermarkTerminal::Completed {
                        output_path: "/tmp/out.mp4".into(),
                        output_bytes: 1,
                    }
                }
            }
        };
        let queue = start_watermark_video_queue::<String, _>(sink, runner);
        queue
            .enqueue("first".into(), "a".into(), PathBuf::from("/tmp/a.mp4"))
            .unwrap();
        queue
            .enqueue("second".into(), "b".into(), PathBuf::from("/tmp/b.mp4"))
            .unwrap();
        // Wait until the first job is actually running, then cancel it.
        while !first_started.load(std::sync::atomic::Ordering::SeqCst) {
            std::thread::yield_now();
        }
        queue.cancel("first").unwrap();
        while !first_cleanup_done.load(std::sync::atomic::Ordering::SeqCst) {
            std::thread::yield_now();
        }
        // Cleanup completed before the worker started the second job.
        assert!(!second_started.load(std::sync::atomic::Ordering::SeqCst));
        allow_first_return.store(true, std::sync::atomic::Ordering::SeqCst);
        drain_until_terminal(&rx, terminal_cancelled);
        drain_until_terminal(&rx, terminal_completed);
        queue.shutdown();
    }

    #[test]
    fn watermark_queue_frozen_payload_is_a_clone_snapshot() {
        let (sink, rx) = queue_sink();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let runner = {
            let seen = seen.clone();
            move |job: FrozenWatermarkJob<String>, _emit| {
                seen.lock().unwrap().push(job.payload.clone());
                WatermarkTerminal::Completed {
                    output_path: "/tmp/out.mp4".into(),
                    output_bytes: 1,
                }
            }
        };
        let queue = start_watermark_video_queue::<String, _>(sink, runner);
        let mut payload = String::from("original");
        queue
            .enqueue("t".into(), payload.clone(), PathBuf::from("/tmp/a.mp4"))
            .unwrap();
        payload.push_str("-mutated-after-enqueue");
        drain_until_terminal(&rx, terminal_completed);
        queue.shutdown();
        assert_eq!(*seen.lock().unwrap(), vec!["original".to_string()]);
    }

    #[test]
    fn watermark_queue_rejects_duplicate_reserved_path() {
        let (sink, rx) = queue_sink();
        let first_started = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let release = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let runner = {
            let first_started = first_started.clone();
            let release = release.clone();
            move |job: FrozenWatermarkJob<String>, _emit| {
                if job.task_id == "a" {
                    first_started.store(true, std::sync::atomic::Ordering::SeqCst);
                    while !release.load(std::sync::atomic::Ordering::SeqCst) {
                        std::thread::yield_now();
                    }
                }
                WatermarkTerminal::Completed {
                    output_path: "/tmp/out.mp4".into(),
                    output_bytes: 1,
                }
            }
        };
        let queue = start_watermark_video_queue::<String, _>(sink, runner);
        queue
            .enqueue("a".into(), "a".into(), PathBuf::from("/tmp/same.mp4"))
            .unwrap();
        while !first_started.load(std::sync::atomic::Ordering::SeqCst) {
            std::thread::yield_now();
        }
        assert_eq!(
            queue.enqueue("b".into(), "b".into(), PathBuf::from("/tmp/same.mp4")),
            Err(WatermarkQueueError::ReservedPathConflict {
                path: PathBuf::from("/tmp/same.mp4")
            })
        );
        release.store(true, std::sync::atomic::Ordering::SeqCst);
        drain_until_terminal(&rx, terminal_completed);
        queue.shutdown();
    }

    #[test]
    fn watermark_queue_shutdown_cancels_waiting_and_joins_worker() {
        let (sink, rx) = queue_sink();
        let first_started = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let runner = {
            let first_started = first_started.clone();
            move |job: FrozenWatermarkJob<String>, _emit| {
                if job.task_id == "first" {
                    first_started.store(true, std::sync::atomic::Ordering::SeqCst);
                    while !job.cancel.load(std::sync::atomic::Ordering::SeqCst) {
                        std::thread::yield_now();
                    }
                    WatermarkTerminal::Cancelled
                } else {
                    WatermarkTerminal::Completed {
                        output_path: "/tmp/out.mp4".into(),
                        output_bytes: 1,
                    }
                }
            }
        };
        let queue = start_watermark_video_queue::<String, _>(sink, runner);
        queue
            .enqueue("first".into(), "a".into(), PathBuf::from("/tmp/a.mp4"))
            .unwrap();
        queue
            .enqueue("waiting".into(), "b".into(), PathBuf::from("/tmp/b.mp4"))
            .unwrap();
        while !first_started.load(std::sync::atomic::Ordering::SeqCst) {
            std::thread::yield_now();
        }
        queue.shutdown();
        // shutdown must not deadlock: running job observes cancel and exits,
        // waiting jobs are cancelled, worker joins.
        let mut terminals = Vec::new();
        while let Ok(event) = rx.try_recv() {
            if let WatermarkQueueEvent::Terminal { task_id, terminal } = event {
                terminals.push((task_id, terminal));
            }
        }
        let cancelled = terminals
            .iter()
            .filter(|(_, t)| *t == WatermarkTerminal::Cancelled)
            .count();
        assert_eq!(cancelled, 2, "first and waiting both cancel: {terminals:?}");
    }

    #[test]
    fn watermark_queue_concurrent_same_basename_reserves_distinct_names() {
        let (sink, _rx) = queue_sink();
        let first_started = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let release = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let runner = {
            let first_started = first_started.clone();
            let release = release.clone();
            move |job: FrozenWatermarkJob<String>, _emit| {
                if job.task_id == "a" {
                    first_started.store(true, std::sync::atomic::Ordering::SeqCst);
                    while !release.load(std::sync::atomic::Ordering::SeqCst) {
                        std::thread::yield_now();
                    }
                }
                WatermarkTerminal::Completed {
                    output_path: "/tmp/out.mp4".into(),
                    output_bytes: 1,
                }
            }
        };
        let queue = start_watermark_video_queue::<String, _>(sink, runner);
        let dir = PathBuf::from("/tmp/品牌 并发");
        let a = queue
            .enqueue_with_reservation("a".into(), "a".into(), &dir, "同名单.mp4")
            .unwrap();
        let b = queue
            .enqueue_with_reservation("b".into(), "b".into(), &dir, "同名单.mp4")
            .unwrap();
        assert_ne!(a, b, "same basename must reserve two distinct names");
        // Explicit enqueue with an already-reserved path still conflicts.
        assert_eq!(
            queue.enqueue("c".into(), "c".into(), a.clone()),
            Err(WatermarkQueueError::ReservedPathConflict { path: a.clone() })
        );
        while !first_started.load(std::sync::atomic::Ordering::SeqCst) {
            std::thread::yield_now();
        }
        release.store(true, std::sync::atomic::Ordering::SeqCst);
        queue.shutdown();
    }

    #[test]
    fn is_video_media_distinguishes_video_from_static_and_gif() {
        assert!(is_video_media(Path::new("a.mp4")));
        assert!(is_video_media(Path::new("b.MOV")));
        assert!(!is_video_media(Path::new("c.png")));
        assert!(!is_video_media(Path::new("d.jpg")));
        assert!(!is_video_media(Path::new("e.webp")));
        assert!(!is_video_media(Path::new("f.gif")));
    }

    #[test]
    fn watermark_production_runner_emits_lifecycle_and_maps_terminal() {
        let events = Arc::new(Mutex::new(Vec::new()));
        let emit: Arc<dyn Fn(WatermarkQueueEvent) + Send + Sync> = {
            let events = events.clone();
            Arc::new(move |event| events.lock().unwrap().push(event))
        };
        let payload = WatermarkEncodePayload {
            request: WatermarkMediaTaskRequest {
                task_id: "job".into(),
                input_path: "/tmp/nope.mp4".into(),
                options: WatermarkOptions {
                    kind: "text".into(),
                    text: "水印".into(),
                    image_path: None,
                    position: "bottom-right".into(),
                    size_percent: 10,
                    opacity: 0.5,
                    pattern: None,
                    density: None,
                    angle: None,
                    dark_mode: None,
                    offset_x: None,
                    offset_y: None,
                    columns: None,
                    rows: None,
                    placements: None,
                    quality: None,
                    prefer_hardware: None,
                    text_style: None,
                    reserved_output_path: None,
                    output_directory: "/tmp".into(),
                },
            },
            fallback: vec![EncoderBackend::Cpu],
            font_path: Some(PathBuf::from("/nonexistent/font.otf")),
            ffmpeg: PathBuf::from("/nonexistent/ffmpeg"),
            ffprobe: PathBuf::from("/nonexistent/ffprobe"),
            progress_window: None,
            input_path: PathBuf::from("/tmp/nope.mp4"),
        };
        let job = FrozenWatermarkJob {
            task_id: "job".into(),
            payload,
            reserved_final: PathBuf::from("/tmp/out.mp4"),
            cancel: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        };
        let terminal = run_watermark_production_job(job, emit.clone());
        assert!(matches!(terminal, WatermarkTerminal::Failed { .. }));
        let events = events.lock().unwrap().clone();
        // Probing and Processing always come first (non-fallback, args building
        // fails before any FFmpeg child runs here).
        assert!(events.iter().any(|e| matches!(
            e,
            WatermarkQueueEvent::Status {
                status: WatermarkJobStatus::Probing,
                ..
            }
        )));
        assert!(events.iter().any(|e| matches!(
            e,
            WatermarkQueueEvent::Status {
                status: WatermarkJobStatus::Processing,
                ..
            }
        )));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn watermark_production_queue_runs_two_real_video_jobs_serially() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let ffprobe = bundled_test_sidecar("ffprobe");
        let dir = std::env::temp_dir().join(format!("品牌生产队列-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let input_a = dir.join("a.mp4");
        let input_b = dir.join("b.mp4");
        create_mp4_fixture(&ffmpeg, &input_a, false);
        create_mp4_fixture(&ffmpeg, &input_b, false);
        let font = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/fonts/SourceHanSansSC-Regular.otf");

        let (sink, events, rx) = recording_sink();
        let active = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let max_active = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let order = Arc::new(Mutex::new(Vec::new()));
        let runner = {
            let active = active.clone();
            let max_active = max_active.clone();
            let order = order.clone();
            move |job: FrozenWatermarkJob<WatermarkEncodePayload>,
                  emit: Arc<dyn Fn(WatermarkQueueEvent) + Send + Sync>| {
                order.lock().unwrap().push(job.task_id.clone());
                let now = active.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
                max_active.fetch_max(now, std::sync::atomic::Ordering::SeqCst);
                let terminal = run_watermark_production_job(job, emit);
                active.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
                terminal
            }
        };
        let queue = start_watermark_video_queue::<WatermarkEncodePayload, _>(sink, runner);

        let payload_a = WatermarkEncodePayload {
            request: WatermarkMediaTaskRequest {
                task_id: "a".into(),
                input_path: input_a.to_string_lossy().into_owned(),
                options: WatermarkOptions {
                    kind: "text".into(),
                    text: "水印A".into(),
                    image_path: None,
                    position: "bottom-right".into(),
                    size_percent: 10,
                    opacity: 0.5,
                    pattern: None,
                    density: None,
                    angle: None,
                    dark_mode: None,
                    offset_x: None,
                    offset_y: None,
                    columns: None,
                    rows: None,
                    placements: None,
                    quality: None,
                    prefer_hardware: None,
                    text_style: None,
                    reserved_output_path: None,
                    output_directory: dir.to_string_lossy().into_owned(),
                },
            },
            fallback: vec![EncoderBackend::Cpu],
            font_path: Some(font.clone()),
            ffmpeg: ffmpeg.clone(),
            ffprobe: ffprobe.clone(),
            progress_window: Some((0.0, 1.0)),
            input_path: input_a.clone(),
        };
        let payload_b = WatermarkEncodePayload {
            request: WatermarkMediaTaskRequest {
                task_id: "b".into(),
                input_path: input_b.to_string_lossy().into_owned(),
                options: WatermarkOptions {
                    kind: "text".into(),
                    text: "水印B".into(),
                    image_path: None,
                    position: "bottom-right".into(),
                    size_percent: 10,
                    opacity: 0.5,
                    pattern: None,
                    density: None,
                    angle: None,
                    dark_mode: None,
                    offset_x: None,
                    offset_y: None,
                    columns: None,
                    rows: None,
                    placements: None,
                    quality: None,
                    prefer_hardware: None,
                    text_style: None,
                    reserved_output_path: None,
                    output_directory: dir.to_string_lossy().into_owned(),
                },
            },
            fallback: vec![EncoderBackend::Cpu],
            font_path: Some(font.clone()),
            ffmpeg: ffmpeg.clone(),
            ffprobe: ffprobe.clone(),
            progress_window: Some((0.0, 1.0)),
            input_path: input_b.clone(),
        };
        queue
            .enqueue_with_reservation("a".into(), payload_a, &dir, "a_watermarked.mp4")
            .unwrap();
        queue
            .enqueue_with_reservation("b".into(), payload_b, &dir, "b_watermarked.mp4")
            .unwrap();

        drain_until_terminal(&rx, terminal_completed);
        drain_until_terminal(&rx, terminal_completed);
        queue.shutdown();

        assert_eq!(
            *order.lock().unwrap(),
            vec!["a".to_string(), "b".to_string()]
        );
        assert_eq!(max_active.load(std::sync::atomic::Ordering::SeqCst), 1);
        // Verify lifecycle status order and monotonic progress for both jobs.
        let events = events.lock().unwrap().clone();
        for task_id in ["a", "b"] {
            let mut last_progress = 0.0f64;
            let mut phase = 0u8;
            let mut terminal_count = 0;
            for event in events.iter().filter(|e| {
                let t = match e {
                    WatermarkQueueEvent::Status { task_id, .. }
                    | WatermarkQueueEvent::Progress { task_id, .. }
                    | WatermarkQueueEvent::Terminal { task_id, .. } => task_id,
                };
                t == task_id
            }) {
                match event {
                    WatermarkQueueEvent::Progress { progress, .. } => {
                        assert!(*progress >= last_progress, "progress not monotonic");
                        assert!((0.0..=1.0).contains(progress), "progress out of range");
                        last_progress = *progress;
                    }
                    WatermarkQueueEvent::Status { status, .. } => match status {
                        WatermarkJobStatus::Probing => {
                            assert!(phase == 0, "probing out of order");
                            phase = 1;
                        }
                        WatermarkJobStatus::Processing => {
                            assert!(phase >= 1, "processing before probing");
                            phase = 2;
                        }
                        WatermarkJobStatus::Finalizing => {
                            assert!(phase >= 2, "finalizing before processing");
                            phase = 3;
                        }
                        _ => {}
                    },
                    WatermarkQueueEvent::Terminal { .. } => terminal_count += 1,
                }
            }
            assert!(phase >= 3, "missing lifecycle status for {task_id}");
            assert_eq!(terminal_count, 1, "terminal once for {task_id}");
        }
        // Both outputs are valid H.264 MP4.
        for name in ["a_watermarked.mp4", "b_watermarked.mp4"] {
            let output = dir.join(name);
            let probe = std::process::Command::new(&ffprobe)
                .args([
                    "-v",
                    "error",
                    "-show_entries",
                    "stream=codec_name,pix_fmt",
                    "-of",
                    "json",
                ])
                .arg(&output)
                .output()
                .unwrap();
            let text = String::from_utf8_lossy(&probe.stdout);
            assert!(text.contains("\"codec_name\": \"h264\""), "h264: {text}");
            assert!(text.contains("\"pix_fmt\": \"yuv420p\""), "yuv420p: {text}");
        }
        fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn watermark_production_queue_failed_first_job_does_not_block_second() {
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let ffprobe = bundled_test_sidecar("ffprobe");
        let dir = std::env::temp_dir().join(format!("品牌生产队列失败-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let bad_input = dir.join("broken.mp4");
        fs::write(&bad_input, b"this is not a video").unwrap();
        let good_input = dir.join("good.mp4");
        create_mp4_fixture(&ffmpeg, &good_input, false);
        let font = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/fonts/SourceHanSansSC-Regular.otf");

        let (sink, rx) = queue_sink();
        let ran = Arc::new(Mutex::new(Vec::new()));
        let runner = {
            let ran = ran.clone();
            move |job: FrozenWatermarkJob<WatermarkEncodePayload>,
                  emit: Arc<dyn Fn(WatermarkQueueEvent) + Send + Sync>| {
                ran.lock().unwrap().push(job.task_id.clone());
                run_watermark_production_job(job, emit)
            }
        };
        let queue = start_watermark_video_queue::<WatermarkEncodePayload, _>(sink, runner);

        let make_payload = |task_id: &str, input: &Path| WatermarkEncodePayload {
            request: WatermarkMediaTaskRequest {
                task_id: task_id.into(),
                input_path: input.to_string_lossy().into_owned(),
                options: WatermarkOptions {
                    kind: "text".into(),
                    text: "水印".into(),
                    image_path: None,
                    position: "bottom-right".into(),
                    size_percent: 10,
                    opacity: 0.5,
                    pattern: None,
                    density: None,
                    angle: None,
                    dark_mode: None,
                    offset_x: None,
                    offset_y: None,
                    columns: None,
                    rows: None,
                    placements: None,
                    quality: None,
                    prefer_hardware: None,
                    text_style: None,
                    reserved_output_path: None,
                    output_directory: dir.to_string_lossy().into_owned(),
                },
            },
            fallback: vec![EncoderBackend::Cpu],
            font_path: Some(font.clone()),
            ffmpeg: ffmpeg.clone(),
            ffprobe: ffprobe.clone(),
            progress_window: Some((0.0, 1.0)),
            input_path: input.to_path_buf(),
        };
        queue
            .enqueue_with_reservation(
                "bad".into(),
                make_payload("bad", &bad_input),
                &dir,
                "bad_watermarked.mp4",
            )
            .unwrap();
        queue
            .enqueue_with_reservation(
                "good".into(),
                make_payload("good", &good_input),
                &dir,
                "good_watermarked.mp4",
            )
            .unwrap();

        drain_until_terminal(&rx, terminal_failed);
        drain_until_terminal(&rx, terminal_completed);
        queue.shutdown();

        assert_eq!(
            *ran.lock().unwrap(),
            vec!["bad".to_string(), "good".to_string()]
        );
        let output = dir.join("good_watermarked.mp4");
        let probe = std::process::Command::new(&ffprobe)
            .args([
                "-v",
                "error",
                "-show_entries",
                "stream=codec_name,pix_fmt",
                "-of",
                "json",
            ])
            .arg(&output)
            .output()
            .unwrap();
        let text = String::from_utf8_lossy(&probe.stdout);
        assert!(text.contains("\"codec_name\": \"h264\""), "h264: {text}");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn prune_computed_gifs_only_removes_expired_gif_results() {
        let dir = std::env::temp_dir().join(format!("brand-gif-prune-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let gif = dir.join("preview.gif");
        let png = dir.join("note.png");
        fs::write(&gif, b"GIF89a-prune").unwrap();
        fs::write(&png, b"png").unwrap();

        // 时间窗口足够大：刚写入的结果必须保留。
        super::prune_computed_gifs(&dir, std::time::Duration::from_secs(24 * 60 * 60));
        assert!(gif.exists(), "fresh result must be kept");

        // 零窗口：只清理 GIF，不动其他类型文件。
        super::prune_computed_gifs(&dir, std::time::Duration::ZERO);
        assert!(!gif.exists(), "expired result must be removed");
        assert!(png.exists(), "non-gif files are not pruned");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn validate_computed_gif_accepts_gif_and_rejects_other_bytes() {
        let dir = std::env::temp_dir().join(format!("brand-gif-validate-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let gif = dir.join("ok.gif");
        let png = dir.join("not-a-gif.gif");
        let empty = dir.join("empty.gif");
        fs::write(&gif, b"GIF89a-payload").unwrap();
        fs::write(&png, b"\x89PNG\r\n\x1a\n").unwrap();
        fs::write(&empty, b"").unwrap();
        assert_eq!(super::validate_computed_gif(&gif).unwrap(), 14);
        assert!(super::validate_computed_gif(&png).is_err());
        assert!(super::validate_computed_gif(&empty).is_err());
        assert!(super::validate_computed_gif(&dir.join("missing.gif")).is_err());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn save_computed_gif_file_appends_suffix_and_keeps_source() {
        let dir = std::env::temp_dir().join(format!("brand-gif-save-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let results = dir.join("results");
        let destination = dir.join("导出 目录");
        fs::create_dir_all(&results).unwrap();
        fs::create_dir_all(&destination).unwrap();
        let source = results.join("preview.gif");
        let payload = b"GIF89a-first".to_vec();
        fs::write(&source, &payload).unwrap();

        let first =
            super::save_computed_gif_file(&source, "素材 01_gif.gif", &destination).unwrap();
        let second =
            super::save_computed_gif_file(&source, "素材 01_gif.gif", &destination).unwrap();

        assert!(
            first.path.ends_with("素材 01_gif.gif"),
            "first save keeps the name"
        );
        assert!(
            second.path.ends_with("素材 01_gif_2.gif"),
            "second save appends a suffix"
        );
        assert_eq!(
            fs::read(&first.path).unwrap(),
            payload,
            "saved bytes are the computed bytes"
        );
        assert_eq!(fs::read(&second.path).unwrap(), payload);
        assert!(
            source.exists(),
            "saving must not remove the computed result"
        );
        let temp_leftovers: Vec<String> = fs::read_dir(&destination)
            .unwrap()
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.starts_with('.'))
            .collect();
        assert!(
            temp_leftovers.is_empty(),
            "temp files must be cleaned: {temp_leftovers:?}"
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn gif_compute_ipc_payload_accepts_omitted_export_directory() {
        let request: GifMediaTaskRequest = serde_json::from_value(serde_json::json!({
            "taskId": "gif-preview-1-2-1792410000000",
            "inputPath": "/素材/视频.mp4",
            "options": {
                "endSeconds": 15.1,
                "fps": 10,
                "preset": "high",
                "targetBytes": 7_800_000,
                "mode": "balanced"
            }
        }))
        .expect("compute IPC must not require an export directory");
        assert!(request.options.output_directory.is_empty());
        assert_eq!(request.options.width, None);
        assert_eq!(request.options.target_bytes, Some(7_800_000));
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn real_gif_compute_produces_a_preview_ready_gif_without_an_export_directory() {
        let dir = std::env::temp_dir().join(format!("brand-gif-compute-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let results = dir.join("results");
        fs::create_dir_all(&results).unwrap();
        let ffmpeg = bundled_test_sidecar("ffmpeg");
        let ffprobe = bundled_test_sidecar("ffprobe");
        let mp4 = dir.join("源 视频.mp4");
        create_mp4_fixture(&ffmpeg, &mp4, false);
        // Match the frontend IPC payload: compute omits outputDirectory entirely.
        let request: GifMediaTaskRequest = serde_json::from_value(serde_json::json!({
            "taskId": "real-compute",
            "inputPath": mp4.to_string_lossy(),
            "options": {
                "width": 160,
                "fps": 10,
                "startSeconds": 0.0,
                "endSeconds": 1.0,
                "preset": "high",
                "targetBytes": 7_800_000,
                "minWidth": 80,
                "mode": "balanced"
            }
        }))
        .unwrap();
        assert!(request.options.output_directory.is_empty());
        assert!(super::validate_gif_inputs(&request).is_ok());
        assert_eq!(
            super::validate_request(&request).unwrap_err(),
            "输出文件夹不存在或不可访问"
        );
        let host = Arc::new(RecordingGifHost::default());
        let terminal = host.terminal_slot();
        let host_dyn: Arc<dyn GifTaskHost> = host.clone();

        let result = super::compute_gif_preview_file(
            &ffmpeg,
            Some(&ffprobe),
            &request,
            &results,
            request.options.target_bytes.unwrap_or(0),
            None,
            1.0,
            &host_dyn,
            &terminal,
            &request.task_id,
        )
        .unwrap();

        let bytes = fs::read(&result.path).unwrap();
        println!(
            "computed gif: {}x{} {} bytes, file {}",
            result.width,
            result.height,
            result.bytes,
            result.path.rsplit('/').next().unwrap_or("")
        );
        assert_eq!(&bytes[..3], b"GIF", "preview result must be a real GIF");
        assert_eq!(bytes.len() as u64, result.bytes);
        assert!(
            result.bytes <= super::MAX_GIF_BYTES,
            "bytes: {}",
            result.bytes
        );
        assert!(
            result.width > 0 && result.height > 0,
            "real dims: {}x{}",
            result.width,
            result.height
        );
        assert!(
            result.path.starts_with(results.to_string_lossy().as_ref()),
            "result stays in the managed temp dir"
        );

        // 保存复用同一份字节，不重新编码。
        let destination = dir.join("导出 目录");
        fs::create_dir_all(&destination).unwrap();
        let encodes_before_save = host.encode_count();
        assert!(
            encodes_before_save >= 2,
            "sample + at least one full encode: {encodes_before_save}"
        );
        let saved =
            super::save_computed_gif_file(Path::new(&result.path), "源 视频_gif.gif", &destination)
                .unwrap();
        println!("saved gif: {} bytes at {}", saved.bytes, saved.path);
        assert_eq!(fs::read(&saved.path).unwrap(), bytes);
        assert_eq!(
            host.encode_count(),
            encodes_before_save,
            "saving must reuse the computed file without starting another encode"
        );

        super::cleanup_gif_artifacts(Path::new(&result.path));
        assert!(
            !Path::new(&result.path).exists(),
            "discard removes the temp result"
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn accepted_cancellation_discards_a_finished_result_before_registration() {
        let dir =
            std::env::temp_dir().join(format!("brand-gif-cancel-register-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let results = dir.join("results");
        fs::create_dir_all(&results).unwrap();
        let path = results.join("late.gif");
        fs::write(&path, b"GIF89a-late").unwrap();
        let result = super::ComputedGifResult {
            task_id: "late".into(),
            path: path.to_string_lossy().into_owned(),
            bytes: 12,
            width: 10,
            height: 10,
            fps: 10,
            duration_seconds: 1.0,
            start_seconds: 0.0,
            end_seconds: 1.0,
        };
        let registry = super::ComputedGifRegistry::default();

        // 取消已在编码完成后被接受：结果不得登记，文件必须清理。
        let error = super::accept_computed_gif(&registry, true, result.clone(), "a_gif.gif".into())
            .unwrap_err();
        assert_eq!(error, super::GIF_COMPUTE_CANCELLED);
        assert!(!path.exists(), "cancelled result file must be cleaned");
        assert!(
            registry.get("late").is_none(),
            "cancelled result must not be registered"
        );

        // 未取消时正常登记并保留文件，供保存阶段复用。
        fs::write(&path, b"GIF89a-late").unwrap();
        let accepted =
            super::accept_computed_gif(&registry, false, result, "a_gif.gif".into()).unwrap();
        assert!(path.exists());
        assert!(registry.get("late").is_some());
        assert_eq!(accepted.task_id, "late");
        super::cleanup_gif_artifacts(Path::new(&accepted.path));
        fs::remove_dir_all(&dir).unwrap();
    }
}
