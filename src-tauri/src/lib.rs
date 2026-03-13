use std::env;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: "
            PRAGMA journal_mode=WAL;
            PRAGMA foreign_keys=ON;

            CREATE TABLE IF NOT EXISTS anom_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                site_type TEXT,
                was_ded_escalation INTEGER DEFAULT 0 CHECK (was_ded_escalation IN (0, 1)),
                was_occ_mine_escalation INTEGER DEFAULT 0 CHECK (was_occ_mine_escalation IN (0, 1)),
                was_cap_stag_escalation INTEGER DEFAULT 0 CHECK (was_cap_stag_escalation IN (0, 1)),
                was_shld_starb_escalation INTEGER DEFAULT 0 CHECK (was_shld_starb_escalation IN (0, 1)),
                was_attack_site_escalation INTEGER DEFAULT 0 CHECK (was_attack_site_escalation IN (0, 1)),
                was_faction_npc_spawn INTEGER DEFAULT 0 CHECK (was_faction_npc_spawn IN (0, 1)),
                was_capital_spawn INTEGER DEFAULT 0 CHECK (was_capital_spawn IN (0, 1)),
                was_faction_capital_spawn INTEGER DEFAULT 0 CHECK (was_faction_capital_spawn IN (0, 1)),
                was_titan_spawn INTEGER DEFAULT 0 CHECK (was_titan_spawn IN (0, 1))
            );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_location_columns",
            sql: "
            ALTER TABLE anom_logs ADD COLUMN location_region TEXT;
            ALTER TABLE anom_logs ADD COLUMN location_system TEXT;
            ALTER TABLE anom_logs ADD COLUMN location_security TEXT;
            ",
            kind: MigrationKind::Up,
        }
    ]
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn apply_window_settings(window: tauri::Window, always_on_top: bool, scale: f64, width: f64, height: f64) {
    let _ = window.set_always_on_top(always_on_top);
    let _ = window.set_size(tauri::LogicalSize::new(width * scale, height * scale));
}

/// Returns the OS short date format string (e.g. "dd.MM.yyyy", "M/d/yyyy")
/// On Windows reads from registry: HKCU\Control Panel\International -> sShortDate
/// Falls back to ISO on other platforms or on error.
#[tauri::command]
fn get_system_date_format() -> String {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;
        
        // CREATE_NO_WINDOW flag
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        // Use PowerShell for cleaner registry access
        let output = Command::new("powershell")
            .creation_flags(CREATE_NO_WINDOW)
            .args([
                "-NoProfile",
                "-Command",
                "Get-ItemPropertyValue 'HKCU:\\Control Panel\\International' -Name sShortDate"
            ])
            .output();
        if let Ok(out) = output {
            let fmt = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !fmt.is_empty() {
                return fmt;
            }
        }
    }
    "yyyy-MM-dd".to_string()
}

fn get_settings_file_path() -> PathBuf {
    let mut path = env::current_exe().expect("Failed to get current exe path");
    path.pop(); // Remove the .exe name
    path.push("data"); 
    if !path.exists() {
        fs::create_dir_all(&path).expect("Failed to create data directory");
    }
    path.push("settings.json");
    path
}

#[tauri::command]
fn load_settings() -> String {
    let path = get_settings_file_path();
    if path.exists() {
        fs::read_to_string(path).unwrap_or_else(|_| "{}".to_string())
    } else {
        "{}".to_string()
    }
}

#[tauri::command]
fn save_settings(settings: String) -> Result<(), String> {
    let path = get_settings_file_path();
    fs::write(path, settings).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    let path = std::path::Path::new(&path);
    if !path.exists() {
        return Err("Path does not exist".to_string());
    }
    
    // If it's a file, open its parent directory
    let folder_path = if path.is_file() {
        path.parent().unwrap_or(path)
    } else {
        path
    };

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("explorer")
            .arg(folder_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        Command::new("open")
            .arg(folder_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        Command::new("xdg-open")
            .arg(folder_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn get_db_file_path() -> PathBuf {
    let mut path = env::current_exe().expect("Failed to get current exe path");
    path.pop(); // Remove the .exe name
    path.push("data"); // Put it in a data subfolder to prevent accidental overwrites
    if !path.exists() {
        fs::create_dir_all(&path).expect("Failed to create data directory");
    }
    path.push("anomtracker.db");
    path
}

#[tauri::command]
fn get_db_path() -> String {
    format!("sqlite:{}", get_db_file_path().to_string_lossy())
}

#[tauri::command]
fn get_data_dir() -> String {
    let mut path = env::current_exe().expect("Failed to get current exe path");
    path.pop();
    path.push("data");
    path.to_string_lossy().to_string()
}

#[tauri::command]
fn join_paths(base: String, sub: String) -> String {
    let mut path = PathBuf::from(base);
    path.push(sub);
    path.to_string_lossy().to_string()
}

#[tauri::command]
fn create_backup_zip(src_files: Vec<String>, dest_zip: String) -> Result<(), String> {
    let path = std::path::Path::new(&dest_zip);
    
    // Ensure the destination directory exists
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    let file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);

    for src in src_files {
        let src_path = std::path::Path::new(&src);
        if !src_path.exists() {
            continue;
        }
        
        let name = src_path.file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| format!("Invalid filename for path: {}", src))?;
            
        zip.start_file(name, options).map_err(|e| e.to_string())?;
        let mut f = std::fs::File::open(src_path).map_err(|e| e.to_string())?;
        let mut buffer = Vec::new();
        f.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
        zip.write_all(&buffer).map_err(|e| e.to_string())?;
    }
    
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_url = format!("sqlite:{}", get_db_file_path().to_string_lossy());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations(&db_url, get_migrations())
                .build(),
        )
        .setup(|app| {
            // Read saved settings and apply correct window size BEFORE showing,
            // to eliminate the portrait-to-landscape flicker on startup.
            let window = app.get_webview_window("main").unwrap();

            let settings_path = get_settings_file_path();
            if settings_path.exists() {
                if let Ok(json) = fs::read_to_string(&settings_path) {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&json) {
                        let orientation = parsed["orientation"].as_str().unwrap_or("portrait");
                        let always_on_top = parsed["alwaysOnTop"].as_bool().unwrap_or(false);
                        let scale = parsed["globalScale"].as_f64().unwrap_or(1.0);

                        let (width, height) = if orientation == "landscape" {
                            (700.0_f64, 450.0_f64)
                        } else {
                            (360.0_f64, 725.0_f64)
                        };

                        let _ = window.set_size(tauri::LogicalSize::new(
                            (width * scale) as u32,
                            (height * scale) as u32,
                        ));
                        let _ = window.set_always_on_top(always_on_top);
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet, 
            get_db_path, 
            get_data_dir,
            join_paths,
            create_backup_zip,
            open_folder,
            apply_window_settings, 
            load_settings, 
            save_settings,
            get_system_date_format
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
