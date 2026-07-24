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
    pub loop_playback: bool,
    pub preset: String,
    pub output_directory: String,
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
    pub tiled: bool,
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
        OsString::from(if options.loop_playback { "0" } else { "-1" }),
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

fn watermark_filter(
    app: &AppHandle,
    request: &WatermarkMediaTaskRequest,
) -> Result<(String, Vec<PathBuf>), String> {
    let options = &request.options;
    let alpha = options.opacity.to_string();
    let positions = if options.tiled {
        tiled_coordinates().to_vec()
    } else {
        vec![overlay_coordinates(&options.position)]
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
    let relevant_duration = (end_at - started_at).max(0.001);
    let args = ffmpeg_args(&request, &output);
    spawn_media_task(
        app,
        registry,
        request.task_id,
        output.clone(),
        args,
        Some((started_at, relevant_duration)),
        Vec::new(),
    )
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
                loop_playback: true,
                preset: "fast".into(),
                output_directory: "/tmp/输出 文件夹".into(),
            },
        }
    }

    fn test_watermark_args(
        request: &WatermarkMediaTaskRequest,
        output: &Path,
    ) -> (Vec<OsString>, Vec<PathBuf>) {
        let options = &request.options;
        let alpha = options.opacity.to_string();
        let positions = if options.tiled {
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
                tiled,
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
            loop_playback: true,
            preset: "fast".into(),
            output_directory: output_directory.to_string_lossy().into_owned(),
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
            loop_playback: true,
            preset: "high".into(),
            output_directory: directory.to_string_lossy().into_owned(),
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
