use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager, State};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

const SESSION_FILE: &str = "diagnostics-session.json";
const CURRENT_LOG: &str = "app.log";
const MAX_EXPORT_LOG_BYTES: u64 = 512 * 1024;
const RECENT_ERROR_LIMIT: usize = 10;

pub struct DiagnosticsState {
    pub session_id: String,
    pub previous_session_unclean: bool,
    pub logging_available: bool,
    pub log_dir: PathBuf,
}

#[derive(Serialize)]
pub struct DiagnosticsInfo {
    pub session_id: String,
    pub app_version: String,
    pub log_dir: String,
    pub logging_available: bool,
    pub previous_session_unclean: bool,
    pub recent_errors: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct SessionMarker {
    session_id: String,
    app_version: String,
    started_at: String,
    clean_shutdown: bool,
}

fn now_rfc3339() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "unknown-time".to_string())
}

fn new_session_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or_default();
    format!("s-{:x}-{:x}", nanos, std::process::id())
}

/// Removes URLs, absolute paths, secrets and e-mails from a message before it is
/// persisted or exported. Every diagnostics entry point must route through this.
pub fn sanitize_message(input: &str) -> String {
    static URL: OnceLock<Regex> = OnceLock::new();
    static PATH: OnceLock<Regex> = OnceLock::new();
    static EMAIL: OnceLock<Regex> = OnceLock::new();
    static SECRET: OnceLock<Regex> = OnceLock::new();
    let url = URL.get_or_init(|| {
        Regex::new(r#"(?i)https?://[^\s"'`]+"#).expect("valid diagnostics URL regex")
    });
    let path = PATH.get_or_init(|| {
        Regex::new(r#"(?:[A-Za-z]:[\\/]|/Users/|/home/|/Volumes/|/private/)[^\s"'`]*"#)
            .expect("valid diagnostics path regex")
    });
    let email = EMAIL.get_or_init(|| {
        Regex::new(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
            .expect("valid diagnostics email regex")
    });
    let secret = SECRET.get_or_init(|| Regex::new(r"(?i)\b(authorization|cookie|token|api[_-]?key|password|private[_-]?key|secret)\b(\s*[:=]\s*)([^\s,;]+)").expect("valid diagnostics secret regex"));
    let cleaned = url.replace_all(input, "[URL]");
    let cleaned = path.replace_all(&cleaned, "[PATH]");
    let cleaned = email.replace_all(&cleaned, "[EMAIL]");
    let cleaned = secret.replace_all(&cleaned, "$1$2[REDACTED]");
    let mut result = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    const MAX_LEN: usize = 240;
    if result.chars().count() > MAX_LEN {
        result = result.chars().take(MAX_LEN).collect::<String>();
        result.push_str("...");
    }
    result
}

fn read_marker(log_dir: &Path) -> Option<SessionMarker> {
    let content = fs::read_to_string(log_dir.join(SESSION_FILE)).ok()?;
    serde_json::from_str(&content).ok()
}

fn write_marker(log_dir: &Path, marker: &SessionMarker) -> std::io::Result<()> {
    let content = serde_json::to_string_pretty(marker).unwrap_or_default();
    fs::write(log_dir.join(SESSION_FILE), content)
}

/// Establishes the current session marker and reports whether the previous
/// session ended without a clean shutdown record.
pub fn initialize(app: &AppHandle, logger_initialized: bool) -> DiagnosticsState {
    let log_dir = app
        .path()
        .app_log_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    let logging_available = logger_initialized && fs::create_dir_all(&log_dir).is_ok();
    let previous_session_unclean = read_marker(&log_dir)
        .map(|marker| !marker.clean_shutdown)
        .unwrap_or(false);
    let marker = SessionMarker {
        session_id: new_session_id(),
        app_version: app.package_info().version.to_string(),
        started_at: now_rfc3339(),
        clean_shutdown: false,
    };
    if logging_available {
        let _ = write_marker(&log_dir, &marker);
    }
    log::info!(
        "session started version={} platform={} previous_unclean={}",
        marker.app_version,
        std::env::consts::OS,
        previous_session_unclean
    );
    DiagnosticsState {
        session_id: marker.session_id,
        previous_session_unclean,
        logging_available,
        log_dir,
    }
}

pub fn mark_clean_shutdown(app: &AppHandle) {
    let log_dir = match app.path().app_log_dir() {
        Ok(dir) => dir,
        Err(_) => return,
    };
    if let Some(mut marker) = read_marker(&log_dir) {
        marker.clean_shutdown = true;
        let _ = write_marker(&log_dir, &marker);
    }
    log::info!("session clean shutdown");
}

pub fn install_panic_hook() {
    std::panic::set_hook(Box::new(|info| {
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|value| *value)
            .or_else(|| info.payload().downcast_ref::<String>().map(String::as_str))
            .unwrap_or("unknown panic");
        let location = info
            .location()
            .map(|location| format!("{}:{}", location.file(), location.line()))
            .unwrap_or_default();
        log::error!(
            "RUST_PANIC {}",
            sanitize_message(&format!("{payload} at {location}"))
        );
    }));
}

fn recent_error_lines(log_dir: &Path) -> Vec<String> {
    let content = match fs::read_to_string(log_dir.join(CURRENT_LOG)) {
        Ok(content) => content,
        Err(_) => return Vec::new(),
    };
    content
        .lines()
        .filter(|line| {
            line.contains("[ERROR]") || line.contains("RUST_PANIC") || line.contains("FATAL")
        })
        .rev()
        .take(RECENT_ERROR_LIMIT)
        .map(|line| sanitize_message(line))
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect()
}

fn rotated_log_files(log_dir: &Path) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = fs::read_dir(log_dir)
        .map(|entries| {
            entries
                .filter_map(|entry| entry.ok())
                .map(|entry| entry.path())
                .filter(|path| {
                    path.extension().and_then(|ext| ext.to_str()) == Some("log")
                        && path.file_name().and_then(|name| name.to_str()) != Some(CURRENT_LOG)
                })
                .collect()
        })
        .unwrap_or_default();
    files.sort_by_key(|path| fs::metadata(path).and_then(|meta| meta.modified()).ok());
    files.reverse();
    files
}

fn read_tail(path: &Path, max_bytes: u64) -> Vec<u8> {
    let mut file = match fs::File::open(path) {
        Ok(file) => file,
        Err(_) => return Vec::new(),
    };
    let size = file.metadata().map(|meta| meta.len()).unwrap_or(0);
    if size > max_bytes {
        let _ = file.seek(SeekFrom::End(-(max_bytes as i64)));
    }
    let mut buffer = Vec::new();
    let _ = file.read_to_end(&mut buffer);
    buffer
}

fn read_sanitized_tail(path: &Path, max_bytes: u64) -> Vec<u8> {
    String::from_utf8_lossy(&read_tail(path, max_bytes))
        .lines()
        .map(sanitize_message)
        .collect::<Vec<_>>()
        .join("\n")
        .into_bytes()
}

fn write_diagnostics_zip(
    destination: &Path,
    log_dir: &Path,
    session_id: &str,
    previous_session_unclean: bool,
) -> Result<(), String> {
    let file = fs::File::create(destination).map_err(|error| format!("无法创建诊断包：{error}"))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    let summary = serde_json::json!({
        "appVersion": env!("CARGO_PKG_VERSION"),
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "sessionId": session_id,
        "previousSessionUnclean": previous_session_unclean,
        "exportedAt": now_rfc3339(),
        "recentErrors": recent_error_lines(log_dir),
        "privacy": "诊断信息仅保存在本机，除非你主动发送。日志不含素材内容、凭据或完整路径。"
    });
    zip.start_file("diagnostics-summary.json", options)
        .map_err(|error| format!("无法创建诊断摘要：{error}"))?;
    zip.write_all(
        serde_json::to_string_pretty(&summary)
            .unwrap_or_default()
            .as_bytes(),
    )
    .map_err(|error| format!("无法写入诊断摘要：{error}"))?;

    let current = log_dir.join(CURRENT_LOG);
    if current.exists() {
        zip.start_file("logs/app.log", options)
            .map_err(|error| format!("无法创建当前日志条目：{error}"))?;
        zip.write_all(&read_sanitized_tail(&current, MAX_EXPORT_LOG_BYTES))
            .map_err(|error| format!("无法写入当前日志：{error}"))?;
    }
    for (index, path) in rotated_log_files(log_dir).into_iter().take(2).enumerate() {
        let name = format!("logs/rotated-{}.log", index + 1);
        zip.start_file(name, options)
            .map_err(|error| format!("无法创建历史日志条目：{error}"))?;
        zip.write_all(&read_sanitized_tail(&path, MAX_EXPORT_LOG_BYTES))
            .map_err(|error| format!("无法写入历史日志：{error}"))?;
    }
    zip.finish()
        .map_err(|error| format!("无法完成诊断包：{error}"))?;
    Ok(())
}

#[tauri::command]
pub fn diagnostics_info(state: State<'_, DiagnosticsState>) -> DiagnosticsInfo {
    DiagnosticsInfo {
        session_id: state.session_id.clone(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        log_dir: state.log_dir.to_string_lossy().into_owned(),
        logging_available: state.logging_available,
        previous_session_unclean: state.previous_session_unclean,
        recent_errors: recent_error_lines(&state.log_dir),
    }
}

#[tauri::command]
pub fn diagnostics_recent_errors(state: State<'_, DiagnosticsState>) -> Vec<String> {
    recent_error_lines(&state.log_dir)
}

#[tauri::command]
pub fn diagnostics_open_log_dir(state: State<'_, DiagnosticsState>) -> Result<(), String> {
    let dir = state.log_dir.clone();
    #[cfg(target_os = "macos")]
    let command = ("open", dir);
    #[cfg(target_os = "windows")]
    let command = ("explorer", dir);
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let command = ("xdg-open", dir);
    std::process::Command::new(command.0)
        .arg(&command.1)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("无法打开日志目录：{error}"))
}

#[tauri::command]
pub fn diagnostics_export_zip(
    dest_path: String,
    state: State<'_, DiagnosticsState>,
) -> Result<String, String> {
    let destination = PathBuf::from(&dest_path);
    if destination.extension().and_then(|value| value.to_str()) != Some("zip")
        || destination.parent().is_none_or(|parent| !parent.is_dir())
    {
        log::error!("DIAGNOSTICS_EXPORT_FAILED invalid destination");
        return Err("诊断包目标位置无效".into());
    }
    write_diagnostics_zip(
        &destination,
        &state.log_dir,
        &state.session_id,
        state.previous_session_unclean,
    )?;
    log::info!("diagnostics package exported");
    Ok(destination
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("diagnostics.zip")
        .to_string())
}

#[tauri::command]
pub fn diagnostics_clear_old(state: State<'_, DiagnosticsState>) -> Result<u32, String> {
    let mut removed = 0;
    for path in rotated_log_files(&state.log_dir) {
        if fs::remove_file(path).is_ok() {
            removed += 1;
        }
    }
    log::info!("old diagnostic logs cleared count={removed}");
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::{sanitize_message, write_diagnostics_zip, SessionMarker};
    use std::io::Read;

    #[test]
    fn strips_urls_and_query_strings() {
        let out = sanitize_message(
            "failed to fetch https://example.com/preview/latest.json?token=abc123&x=1",
        );
        assert!(!out.contains("token"));
        assert!(!out.contains("abc123"));
        assert!(out.contains("[URL]"));
    }

    #[test]
    fn strips_user_paths() {
        let out = sanitize_message("cannot write /Users/alice/Documents/work/output.png");
        assert!(!out.contains("alice"));
        assert!(out.contains("[PATH]"));
        let win = sanitize_message("cannot write C:\\Users\\bob\\Desktop\\out.png");
        assert!(!win.contains("bob"));
    }

    #[test]
    fn strips_secrets() {
        let out =
            sanitize_message("request failed authorization=xyz789 cookie=session-1 api_key=key-2");
        assert!(!out.contains("xyz789"));
        assert!(!out.contains("session-1"));
        assert!(!out.contains("key-2"));
        assert!(out.contains("[REDACTED]"));
    }

    #[test]
    fn truncates_long_messages() {
        let out = sanitize_message(&"x".repeat(1000));
        assert!(out.chars().count() <= 243);
    }

    #[test]
    fn detects_unclean_session_marker_shape() {
        let marker: SessionMarker = serde_json::from_str(
            r#"{"session_id":"s-test","app_version":"1.0.0","started_at":"now","clean_shutdown":false}"#,
        )
        .expect("marker should deserialize");
        assert!(!marker.clean_shutdown);
    }

    #[test]
    fn diagnostics_zip_contains_only_sanitized_bounded_files() {
        let root = std::env::temp_dir().join(format!(
            "brand-workbench-diagnostics-test-{}",
            std::process::id()
        ));
        let logs = root.join("logs");
        std::fs::create_dir_all(&logs).unwrap();
        std::fs::write(
            logs.join("app.log"),
            "2026-01-01 [ERROR] token=private /Users/alice/file.png https://host/path?q=secret",
        )
        .unwrap();
        std::fs::write(logs.join("unrelated.txt"), "must not be exported").unwrap();
        let destination = root.join("diagnostics.zip");
        write_diagnostics_zip(&destination, &logs, "s-test", true).unwrap();

        let mut archive = zip::ZipArchive::new(std::fs::File::open(&destination).unwrap()).unwrap();
        assert_eq!(archive.len(), 2);
        let mut log = String::new();
        archive
            .by_name("logs/app.log")
            .unwrap()
            .read_to_string(&mut log)
            .unwrap();
        assert!(!log.contains("private"));
        assert!(!log.contains("alice"));
        assert!(!log.contains("?q="));
        assert!(archive.by_name("logs/unrelated.txt").is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
