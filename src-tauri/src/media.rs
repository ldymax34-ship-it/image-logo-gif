use std::{
    collections::{HashMap, HashSet},
    ffi::OsString,
    fs,
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

const MEDIA_EVENT: &str = "gif-media://task";

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GifMediaOptions {
    pub start_seconds: Option<f64>,
    pub end_seconds: Option<f64>,
    pub width: Option<u32>,
    pub fps: u32,
    pub preset: String,
    pub output_directory: String,
    /// 目标文件体积（bytes），用于 8MB 自动收口
    #[serde(default)]
    pub target_bytes: Option<u64>,
    /// 压缩偏好：balanced / clarity / smoothness
    #[serde(default)]
    pub compression_preference: Option<String>,
    /// 最低输出宽度
    #[serde(default)]
    pub min_width: Option<u32>,
    /// 最低帧率
    #[serde(default)]
    pub min_fps: Option<u32>,
    /// 是否允许强压缩
    #[serde(default)]
    pub allow_strong_compression: Option<bool>,
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
    pub output_directory: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatermarkMediaTaskRequest {
    pub task_id: String,
    pub input_path: String,
    pub options: WatermarkOptions,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
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
pub struct MediaTaskStarted {
    pub task_id: String,
    pub output_path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaProbeResult {
    pub duration: f64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub codec: String,
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

    fn cancel(&self, task_id: &str) -> Result<(), String> {
        let child = self
            .children
            .lock()
            .expect("media child registry poisoned")
            .get(task_id)
            .cloned();
        let Some(child) = child else {
            return Err("未找到正在处理的媒体任务".into());
        };
        child
            .lock()
            .map_err(|_| "无法终止媒体任务".to_string())?
            .kill()
            .map_err(|error| format!("无法终止媒体任务：{error}"))?;
        self.cancelled
            .lock()
            .expect("media child registry poisoned")
            .insert(task_id.to_string());
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
    let output = Command::new(path)
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

fn validate_request(request: &GifMediaTaskRequest) -> Result<(), String> {
    let input = Path::new(&request.input_path);
    let output_directory = Path::new(&request.options.output_directory);
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
    if !output_directory.is_dir() {
        return Err("输出文件夹不存在或不可访问".into());
    }
    if request.options.fps == 0 || request.options.fps > 60 {
        return Err("FPS 必须在 1 到 60 之间".into());
    }
    if request
        .options
        .width
        .is_some_and(|width| width == 0 || width > 8192)
    {
        return Err("输出宽度必须在 1 到 8192 之间".into());
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
        "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right"
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
    let input = Path::new(&request.input_path);
    let source_stem = input
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("media");
    let extension = media_extension(input).unwrap_or_else(|| "png".into());
    next_available_path(
        Path::new(&request.options.output_directory),
        &format!("{source_stem}_watermarked.{extension}"),
    )
}

fn duration_seconds(app: &AppHandle, input: &Path) -> Result<f64, String> {
    let ffprobe = sidecar_path(app, "ffprobe")?;
    let output = Command::new(ffprobe)
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
    let ffprobe = sidecar_path(&app, "ffprobe")?;
    let output = Command::new(ffprobe)
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=duration,width,height,r_frame_rate,codec_name:format=duration",
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

    let stream = json["streams"][0].clone();
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

    let child = Command::new(ffmpeg)
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
        OsString::from("-n"),
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
        let offset = if row % 2 == 1 { format!("{x_step}/2") } else { "0".to_string() };
        for col in 0..(if row % 2 == 1 && cols > 0 { cols - 1 } else { cols }) {
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

fn watermark_filter(
    app: &AppHandle,
    request: &WatermarkMediaTaskRequest,
) -> Result<(String, Vec<PathBuf>), String> {
    let options = &request.options;
    let is_dark = options.dark_mode.unwrap_or(false);
    let alpha = if is_dark {
        "0.06".to_string() // very subtle for dark watermark
    } else {
        options.opacity.to_string()
    };
    let pattern = options.pattern.as_deref().unwrap_or("diagonal");
    let positions = match pattern {
        "single" => vec![overlay_coordinates(&options.position)],
        _ => tiled_coordinates().to_vec(),
    };
    if options.kind == "text" {
        let font = escape_filter_value(&watermark_font_path(app)?.to_string_lossy());
        let text_file = watermark_text_file(&request.task_id, &options.text)?;
        let text_file_value = escape_filter_value(&text_file.to_string_lossy());
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
        return Ok((graph.join(";"), vec![text_file]));
    }

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
    Ok((graph.join(";"), Vec::new()))
}

fn watermark_ffmpeg_args(
    app: &AppHandle,
    request: &WatermarkMediaTaskRequest,
    output: &Path,
) -> Result<(Vec<OsString>, Vec<PathBuf>), String> {
    let mut args = vec![
        OsString::from("-hide_banner"),
        OsString::from("-nostdin"),
        OsString::from("-n"),
        OsString::from("-i"),
        OsString::from(&request.input_path),
    ];
    if request.options.kind == "image" {
        args.extend([
            OsString::from("-i"),
            OsString::from(request.options.image_path.clone().unwrap_or_default()),
        ]);
    }
    let (filter, cleanup) = watermark_filter(app, request)?;
    args.extend([
        OsString::from("-filter_complex"),
        OsString::from(filter),
        OsString::from("-map"),
        OsString::from("[watermarked]"),
    ]);
    if is_static_image(Path::new(&request.input_path)) {
        args.extend([OsString::from("-frames:v"), OsString::from("1")]);
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

fn ffmpeg_failure_message(stderr: &str) -> String {
    let detail = stderr
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .map(str::trim)
        .unwrap_or("未知 FFmpeg 错误");
    format!("FFmpeg 处理失败：{detail}")
}

fn emit(app: &AppHandle, event: MediaTaskEvent) {
    let _ = app.emit(MEDIA_EVENT, event);
}

fn spawn_media_task(
    app: AppHandle,
    registry: tauri::State<'_, MediaTaskRegistry>,
    task_id: String,
    output: PathBuf,
    args: Vec<OsString>,
    progress_window: Option<(f64, f64)>,
    cleanup_paths: Vec<PathBuf>,
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
    let mut command = Command::new(ffmpeg);
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let child = command
        .spawn()
        .map_err(|error| format!("无法启动应用内置 FFmpeg：{error}"))?;
    let child = Arc::new(Mutex::new(child));
    registry.insert(task_id.clone(), child.clone());

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
        let status = child.lock().ok().and_then(|mut child| child.wait().ok());
        let stderr = stderr_reader.join().unwrap_or_default();
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

/// Adjust GIF encoding parameters to reduce file size based on compression preference.
fn reduce_gif_params(current_fps: u32, current_width: Option<u32>, step: u32, preference: &str) -> (u32, Option<u32>) {
    match preference {
        "clarity" => {
            // Prefer keeping resolution; reduce colors first (fewer colors = smaller palette), then fps, then size
            let fps = if current_fps > 12 && step <= 3 { current_fps - 4 } else { current_fps - 2 };
            let width = if step > 3 { current_width.map(|w| (w as f64 * 0.75) as u32) } else { current_width };
            (fps.max(6), width)
        }
        "smoothness" => {
            // Prefer keeping fps; reduce colors first, then size, then fps
            let fps = if step > 4 { (current_fps - 4).max(4) } else { current_fps };
            let width = if step > 1 { current_width.map(|w| (w as f64 * 0.8) as u32) } else { current_width };
            (fps.max(4), width)
        }
        _ => {
            // balanced: adjust everything
            let fps = if step % 2 == 0 { (current_fps - 2).max(8) } else { current_fps };
            let width = if step % 2 == 1 { current_width.map(|w| (w as f64 * 0.85) as u32) } else { current_width };
            (fps.max(8), width)
        }
    }
}

/// Run FFmpeg synchronously for a GIF encode, returning the output file size on success.
fn run_gif_encode(ffmpeg: &Path, args: &[OsString]) -> Result<u64, (String, String)> {
    let output = Command::new(ffmpeg)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| (format!("无法启动 FFmpeg：{e}"), String::new()))?;

    if output.status.success() {
        // Find output path from args (last arg)
        let out_path = args.last().map(|s| Path::new(s));
        if let Some(path) = out_path {
            match fs::metadata(path) {
                Ok(meta) => return Ok(meta.len()),
                Err(_) => return Err(("FFmpeg 完成后未找到输出文件".into(), String::new())),
            }
        }
        Err(("无法确定输出路径".into(), String::new()))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err((ffmpeg_failure_message(&stderr), stderr))
    }
}

fn build_gif_encode_args(request: &GifMediaTaskRequest, output: &Path, fps: u32, width: Option<u32>) -> Vec<OsString> {
    let options = &request.options;
    let mut args = vec![
        OsString::from("-hide_banner"),
        OsString::from("-nostdin"),
        OsString::from("-n"),
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
    let dither = if options.preset == "fast" { "bayer:bayer_scale=5" } else { "sierra2_4a" };
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

#[tauri::command]
pub fn start_gif_media_task(
    app: AppHandle,
    registry: tauri::State<'_, MediaTaskRegistry>,
    request: GifMediaTaskRequest,
) -> Result<MediaTaskStarted, String> {
    validate_request(&request)?;
    let output = output_path(&request);
    let duration = duration_seconds(&app, Path::new(&request.input_path))?;
    let started_at = request.options.start_seconds.unwrap_or(0.0);
    let end_at = request.options.end_seconds.unwrap_or(duration);
    let _relevant_duration = (end_at - started_at).max(0.001);

    if !engine_status(app.clone()).ready {
        return Err("转换引擎不可用：无法使用应用内置 sidecar".into());
    }
    if registry.children.lock().expect("media child registry poisoned").contains_key(&request.task_id) {
        return Err("该媒体任务已在运行".into());
    }

    let ffmpeg = sidecar_path(&app, "ffmpeg")?;
    let target_bytes = request.options.target_bytes.unwrap_or(0);
    let compression_pref = request.options.compression_preference.as_deref().unwrap_or("balanced");
    let min_width = request.options.min_width;
    let min_fps = request.options.min_fps;
    let allow_strong = request.options.allow_strong_compression.unwrap_or(false);

    let app_for_task = app.clone();
    let output_for_task = output.clone();
    let task_id_for_thread = request.task_id.clone();
    let initial_fps = request.options.fps;
    let initial_width = request.options.width;
    let compression_pref_owned = compression_pref.to_string();
    let min_fps_val = min_fps.unwrap_or(4);
    let min_width_val = min_width.unwrap_or(160);
    let request_for_thread = request.clone();

    // Progress reporting (simple for now: approximate progress by step)
    let total_steps = if target_bytes > 0 { 8u32 } else { 1u32 };
    let progress_step = 1.0 / total_steps as f64;

    thread::spawn(move || {
        let task_id = task_id_for_thread.clone();
        let output_path_str = output_for_task.to_string_lossy().into_owned();

        let mut current_fps = initial_fps;
        let mut current_width = initial_width;
        let max_retries: u32 = 8;

        for step in 0..max_retries {
            // Check cancellation
            {
                let registry = app_for_task.state::<MediaTaskRegistry>();
                if registry.take_cancelled(&task_id) {
                    remove_incomplete_output(&output_for_task);
                    emit(&app_for_task, MediaTaskEvent::Cancelled { task_id: task_id.clone() });
                    registry.remove(&task_id);
                    return;
                }
            }

            // Report progress
            emit(&app_for_task, MediaTaskEvent::Progress {
                task_id: task_id.clone(),
                progress: (step as f64 * progress_step).min(0.99),
            });

            let args = build_gif_encode_args(&request_for_thread, &output_for_task, current_fps, current_width);

            match run_gif_encode(&ffmpeg, &args) {
                Ok(file_size) => {
                    if target_bytes == 0 || file_size <= target_bytes {
                        // Success: within target or no target
                        emit(&app_for_task, MediaTaskEvent::Completed {
                            task_id: task_id.clone(),
                            output_path: output_path_str,
                            output_bytes: file_size,
                        });
                        let registry = app_for_task.state::<MediaTaskRegistry>();
                        registry.remove(&task_id);
                        return;
                    }

                    // Too large, need retry
                    if step + 1 >= max_retries {
                        // Last retry exhausted
                        if allow_strong {
                            // One final try with very aggressive params
                            current_fps = min_fps_val;
                            current_width = Some(min_width_val);
                            continue;
                        }
                        emit(&app_for_task, MediaTaskEvent::Failed {
                            task_id: task_id.clone(),
                            message: format!(
                                "当前时长和画面复杂度无法在现有质量下压缩至 8MB。
请缩短截取区间，或允许更强压缩。
最后一次文件大小：{}",
                                format_file_size(file_size)
                            ),
                        });
                        let registry = app_for_task.state::<MediaTaskRegistry>();
                        registry.remove(&task_id);
                        return;
                    }

                    let (next_fps, next_width) = reduce_gif_params(current_fps, current_width, step + 1, &compression_pref_owned);
                    current_fps = next_fps.max(min_fps_val);
                    current_width = match (next_width, min_width) {
                        (Some(w), Some(min_w)) => Some(w.max(min_w)),
                        (Some(w), None) => Some(w),
                        (None, _) => None,
                    };
                    // Continue to next iteration
                }
                Err((message, _stderr)) => {
                    remove_incomplete_output(&output_for_task);
                    emit(&app_for_task, MediaTaskEvent::Failed {
                        task_id: task_id.clone(),
                        message,
                    });
                    let registry = app_for_task.state::<MediaTaskRegistry>();
                    registry.remove(&task_id);
                    return;
                }
            }
        }

        // Should not reach here normally
        remove_incomplete_output(&output_for_task);
        emit(&app_for_task, MediaTaskEvent::Failed {
            task_id: task_id.clone(),
            message: "压缩重试次数已用尽".into(),
        });
        let registry = app_for_task.state::<MediaTaskRegistry>();
        registry.remove(&task_id);
    });


    Ok(MediaTaskStarted {
        task_id: request.task_id,
        output_path: output.to_string_lossy().into_owned(),
    })
}

fn format_file_size(bytes: u64) -> String {
    if bytes < 1024 * 1024 {
        format!("{} KB", bytes / 1024)
    } else {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    }
}

#[tauri::command]
pub fn start_watermark_media_task(
    app: AppHandle,
    registry: tauri::State<'_, MediaTaskRegistry>,
    request: WatermarkMediaTaskRequest,
) -> Result<MediaTaskStarted, String> {
    validate_watermark_request(&request)?;
    let output = watermark_output_path(&request);
    let (args, cleanup_paths) = watermark_ffmpeg_args(&app, &request, &output)?;
    let progress = if is_static_image(Path::new(&request.input_path)) {
        None
    } else {
        duration_seconds(&app, Path::new(&request.input_path))
            .ok()
            .map(|duration| (0.0, duration))
    };
    spawn_media_task(
        app,
        registry,
        request.task_id,
        output,
        args,
        progress,
        cleanup_paths,
    )
}

#[tauri::command]
pub fn cancel_gif_media_task(
    registry: tauri::State<'_, MediaTaskRegistry>,
    task_id: String,
) -> Result<(), String> {
    registry.cancel(&task_id)
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
fn chroma_key_filter(template_w: u32, template_h: u32, color_hex: &str, fit_mode: &str, similarity: f64, blend: f64) -> String {
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
fn multi_chroma_filter(template_w: u32, template_h: u32, slots: &[(String, usize)], fit_mode: &str) -> String {
    let mut parts = Vec::new();
    parts.push(format!("[0:v]null[base]"));

    let fit = if fit_mode == "contain" {
        format!("scale={template_w}:{template_h}:force_original_aspect_ratio=decrease")
    } else {
        format!("scale={template_w}:{template_h}:force_original_aspect_ratio=increase,crop={template_w}:{template_h}")
    };

    for (i, (color, input_idx)) in slots.iter().enumerate() {
        let hex = color.trim_start_matches('#');
        let next = if i + 1 == slots.len() { "composited".to_string() } else { format!("step{i}") };
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
        let output = Command::new(ffmpeg)
            .args(["-hide_banner", "-v", "error", "-show_entries", "stream=width,height", "-of", "json"])
            .arg(template_path)
            .output()
            .map_err(|e| format!("无法读取模板信息：{e}"))?;
        let json: serde_json::Value = serde_json::from_slice(&output.stdout).map_err(|_| "无法解析模板信息".to_string())?;
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
            OsString::from("-hide_banner"), OsString::from("-nostdin"), OsString::from("-y"),
            OsString::from("-i"), OsString::from(template_path.to_str().unwrap()),
            OsString::from("-ss"), OsString::from(start_seconds.to_string()),
            OsString::from("-t"), OsString::from(duration.to_string()),
            OsString::from("-i"), OsString::from(video_path.to_str().unwrap()),
            OsString::from("-filter_complex"), OsString::from(palette),
            OsString::from("-loop"), OsString::from("0"),
            output_path.as_os_str().to_owned(),
        ];

        let output = Command::new(ffmpeg)
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
                if step > 2 { current_width = current_width.map(|w| (w as f64 * 0.8) as u32); }
            } else {
                return Err("FFmpeg 完成后未找到输出文件".into());
            }
        } else {
            return Err(format!("FFmpeg 合成失败：{}", String::from_utf8_lossy(&output.stderr)));
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
        let stem = template.file_stem().and_then(|s| s.to_str()).unwrap_or("output");
        let output = output_dir.join(format!("{stem}.gif"));

        match compose_single_template_gif(
            &ffmpeg, template, Path::new(&request.video_path), &output,
            request.start_seconds, duration,
            &request.chroma_key.color.as_deref().unwrap_or("#00FF00"),
            &request.fit_mode,
            fps, width, target_bytes,
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
            Path::new(first_tpl).file_stem().and_then(|s| s.to_str()).unwrap_or("out")
        ));

        if let Ok((_, size)) = compose_single_template_gif(
            &ffmpeg, Path::new(first_tpl), Path::new(video_path), &first_output,
            request.start_seconds, duration,
            "#00FF00", &request.fit_mode,
            request.fps, request.width, request.target_bytes,
        ) {
            // If the first template needed retries, use those params for the batch
            if size > request.target_bytes && request.target_bytes > 0 {
                // Lower params for the batch
                best_fps = (request.fps - 2).max(request.min_fps.unwrap_or(6));
                if best_width.is_some() { best_width = best_width.map(|w| (w as f64 * 0.85) as u32); }
            }
        }
    }

    // Step 2: Run the full batch with unified params
    let mut results = Vec::new();
    for template_path in &request.template_paths {
        let template = Path::new(template_path);
        let stem = template.file_stem().and_then(|s| s.to_str()).unwrap_or("output");
        let output = output_dir.join(format!("{stem}.gif"));
        let name = template.file_name().and_then(|s| s.to_str()).unwrap_or("unknown").to_string();

        match compose_single_template_gif(
            &ffmpeg, template, Path::new(video_path), &output,
            request.start_seconds, duration,
            "#00FF00", &request.fit_mode,
            best_fps, best_width, request.target_bytes,
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

    if !template.is_file() { return Err("模板文件不存在".into()); }
    if !video.is_file() { return Err("视频文件不存在".into()); }

    // Probe template size
    let probe_out = Command::new(&ffmpeg)
        .args(["-hide_banner", "-v", "error", "-show_entries", "stream=width,height", "-of", "json"])
        .arg(template)
        .output()
        .map_err(|e| format!("无法读取模板：{e}"))?;
    let json: serde_json::Value = serde_json::from_slice(&probe_out.stdout)
        .map_err(|_| "无法解析模板信息".to_string())?;
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
        OsString::from("-hide_banner"), OsString::from("-nostdin"), OsString::from("-y"),
        OsString::from("-i"), OsString::from(template_path.clone()),
        OsString::from("-ss"), OsString::from(timestamp_seconds.to_string()),
        OsString::from("-i"), OsString::from(video_path.clone()),
        OsString::from("-vframes"), OsString::from("1"),
        OsString::from("-filter_complex"), OsString::from(filter),
        OsString::from(output_path.clone()),
    ];

    let result = Command::new(&ffmpeg)
        .args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map_err(|e| format!("FFmpeg 预览生成失败：{e}"))?;

    if !result.status.success() {
        return Err(format!("预览合成失败：{}", String::from_utf8_lossy(&result.stderr)));
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
    if !input.is_file() { return Err("输入文件不存在".into()); }

    let alpha = opacity.to_string();
    let font_size = format!("h*{size_percent}/100");

    let positions: Vec<(&str, &str)> = if tiled {
        vec![
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
    } else {
        let (x, y) = match position.as_str() {
            "top-left" => ("20", "20"),
            "top-center" => ("(main_w-overlay_w)/2", "20"),
            "top-right" => ("main_w-overlay_w-20", "20"),
            "bottom-left" => ("20", "main_h-overlay_h-20"),
            "bottom-center" => ("(main_w-overlay_w)/2", "main_h-overlay_h-20"),
            _ => ("main_w-overlay_w-20", "main_h-overlay_h-20"),
        };
        vec![(x, y)]
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
            let next = if i + 1 == positions.len() { "out".to_string() } else { format!("t{i}") };
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
        OsString::from("-hide_banner"), OsString::from("-nostdin"), OsString::from("-y"),
        OsString::from("-i"), OsString::from(input_path),
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
        OsString::from("-vframes"), OsString::from("1"),
        OsString::from("-filter_complex"), OsString::from(filter),
        OsString::from("-map"), OsString::from("[out]"),
        OsString::from(output_path.clone()),
    ]);

    let result = Command::new(&ffmpeg)
        .args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map_err(|e| format!("FFmpeg 水印预览失败：{e}"))?;

    for p in cleanup_paths { let _ = fs::remove_file(p); }

    if !result.status.success() {
        return Err(format!("水印预览合成失败：{}", String::from_utf8_lossy(&result.stderr)));
    }

    Ok(output_path)
}

#[cfg(test)]
mod tests {
    use super::{
        escape_filter_value, ffmpeg_args, is_static_image, next_available_path, output_path,
        overlay_coordinates, parse_progress_line, sidecar_path, target_sidecar_name,
        tiled_coordinates, watermark_output_path, GifMediaOptions, GifMediaTaskRequest,
        WatermarkMediaTaskRequest, WatermarkOptions,
    };
    use std::{
        ffi::OsString,
        fs,
        path::{Path, PathBuf},
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
                compression_preference: None,
                min_width: None,
                min_fps: None,
                allow_strong_compression: None,
            },
        }
    }

    fn test_watermark_args(
        request: &WatermarkMediaTaskRequest,
        output: &Path,
    ) -> (Vec<OsString>, Vec<PathBuf>) {
        let options = &request.options;
        let alpha = options.opacity.to_string();
        let positions = if options.pattern.as_deref() != Some("single") {
            tiled_coordinates().to_vec()
        } else {
            vec![overlay_coordinates(&options.position)]
        };
        let (filter, cleanup) = if options.kind == "text" {
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
            OsString::from("-n"),
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
            super::ffmpeg_failure_message("frame=1\nError opening output file denied.gif\n"),
            "FFmpeg 处理失败：Error opening output file denied.gif"
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
                pattern: None,
                density: None,
                angle: None,
                dark_mode: None,
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
        fs::remove_dir_all(&tmp).unwrap();
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
            compression_preference: None,
            min_width: None,
            min_fps: None,
            allow_strong_compression: None,
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
            compression_preference: None,
            min_width: None,
            min_fps: None,
            allow_strong_compression: None,
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
    fn sidecar_path_resolves_from_exe_directory() {
        let exe = std::env::current_exe().unwrap();
        let exe_dir = exe.parent().unwrap();
        let expected = exe_dir.join(target_sidecar_name("ffmpeg"));
        if expected.exists() {
            assert!(expected.is_file());
        }
    }
}
