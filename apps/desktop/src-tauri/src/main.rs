#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

#[derive(Debug, Clone, Serialize)]
struct Telemetry {
    ts: u64,
    altitude_m: f64,
    speed_mps: f64,
    fuel_pct: f64,
}

#[tauri::command]
fn get_mock_telemetry() -> Telemetry {
    Telemetry {
        ts: now_unix_secs(),
        altitude_m: 1212.0,
        speed_mps: 54.8,
        fuel_pct: 89.0,
    }
}

fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut t = 0.0f64;
                loop {
                    let payload = Telemetry {
                        ts: now_unix_secs(),
                        altitude_m: 1212.0 + (t.sin() * 16.0),
                        speed_mps: 54.8 + (t.cos() * 2.2),
                        fuel_pct: (89.0 - (t / 60.0)).max(10.0),
                    };

                    if app_handle.emit("telemetry://tick", payload).is_err() {
                        break;
                    }

                    t += 0.3;
                    std::thread::sleep(Duration::from_secs(1));
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_mock_telemetry])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
