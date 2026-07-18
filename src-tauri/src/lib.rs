use std::path::{Component, Path, PathBuf};

fn is_safe_file_name(file_name: &str) -> bool {
    let path = Path::new(file_name);
    path.components().count() == 1
        && matches!(path.components().next(), Some(Component::Normal(_)))
        && !file_name.trim().is_empty()
        && !file_name.contains(['/', '\\', ':'])
}

fn split_file_name(file_name: &str) -> (&str, &str) {
    match file_name.rfind('.') {
        Some(index) if index > 0 => (&file_name[..index], &file_name[index..]),
        _ => (file_name, ""),
    }
}

fn next_available_path(directory: &Path, file_name: &str) -> PathBuf {
    let candidate = directory.join(file_name);
    if !candidate.exists() {
        return candidate;
    }

    let (base, extension) = split_file_name(file_name);
    let mut index = 2;
    loop {
        let candidate = directory.join(format!("{base}_{index}{extension}"));
        if !candidate.exists() {
            return candidate;
        }
        index += 1;
    }
}

#[tauri::command]
fn save_export_file(directory: String, file_name: String, bytes: Vec<u8>) -> Result<String, String> {
    if !is_safe_file_name(&file_name) {
        return Err("导出文件名无效".into());
    }

    let directory = PathBuf::from(directory);
    if !directory.is_dir() {
        return Err("所选导出文件夹不存在或不可访问".into());
    }

    let output_path = next_available_path(&directory, &file_name);
    std::fs::write(&output_path, bytes).map_err(|error| error.to_string())?;
    output_path
        .file_name()
        .and_then(|value| value.to_str())
        .map(str::to_owned)
        .ok_or_else(|| "无法确定导出文件名".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![save_export_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{is_safe_file_name, next_available_path};

    #[test]
    fn rejects_path_like_export_file_names() {
        assert!(is_safe_file_name("output.png"));
        assert!(!is_safe_file_name("../output.png"));
        assert!(!is_safe_file_name("nested/output.png"));
        assert!(!is_safe_file_name("nested\\output.png"));
        assert!(!is_safe_file_name("C:\\output.png"));
        assert!(!is_safe_file_name(""));
    }

    #[test]
    fn adds_a_suffix_without_overwriting() {
        let directory = std::env::temp_dir().join(format!("brand-workbench-test-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        std::fs::write(directory.join("output.png"), b"existing").unwrap();
        assert_eq!(next_available_path(&directory, "output.png"), directory.join("output_2.png"));
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn writes_the_export_to_the_selected_directory() {
        let directory = std::env::temp_dir().join(format!("brand-workbench-write-test-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        let name = super::save_export_file(directory.to_string_lossy().into_owned(), "export.png".into(), vec![1, 2, 3]).unwrap();
        assert_eq!(name, "export.png");
        assert_eq!(std::fs::read(directory.join(name)).unwrap(), vec![1, 2, 3]);
        std::fs::remove_dir_all(directory).unwrap();
    }
}
