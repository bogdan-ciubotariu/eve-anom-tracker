use std::env;
use std::fs;
use std::path::PathBuf;
use tauri_plugin_sql::{Migration, MigrationKind};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_url = format!("sqlite:{}", get_db_file_path().to_string_lossy());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations(&db_url, get_migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            greet, 
            get_db_path, 
            apply_window_settings, 
            load_settings, 
            save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
