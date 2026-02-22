use mavkit::{
    format_param_file, parse_param_file, validate_plan, FlightMode, HomePosition, LinkState,
    MissionIssue, MissionPlan, MissionType, Param, ParamProgress, ParamStore, Telemetry,
    TransferProgress, Vehicle, VehicleState,
};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri::Emitter;

static TELEMETRY_INTERVAL_MS: AtomicU64 = AtomicU64::new(200);

struct AppState {
    vehicle: tokio::sync::Mutex<Option<Vehicle>>,
    connect_abort: tokio::sync::Mutex<Option<tokio::task::AbortHandle>>,
}

#[derive(Deserialize)]
struct ConnectRequest {
    endpoint: LinkEndpoint,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum LinkEndpoint {
    Udp { bind_addr: String },
    #[cfg(not(target_os = "android"))]
    Serial { port: String, baud: u32 },
}

// ---------------------------------------------------------------------------
// Connection commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn connect_link(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    request: ConnectRequest,
) -> Result<(), String> {
    // Abort any in-flight connect attempt so its socket is released
    if let Some(handle) = state.connect_abort.lock().await.take() {
        handle.abort();
    }

    // Disconnect any existing vehicle
    {
        let prev = state.vehicle.lock().await.take();
        if let Some(v) = prev {
            let _ = v.disconnect().await;
        }
    }

    let address = match &request.endpoint {
        LinkEndpoint::Udp { bind_addr } => format!("udpin:{bind_addr}"),
        #[cfg(not(target_os = "android"))]
        LinkEndpoint::Serial { port, baud } => format!("serial:{port}:{baud}"),
    };

    // Spawn as abortable task so cancel/reconnect can kill it
    let task = tokio::spawn(async move { Vehicle::connect(&address).await });
    *state.connect_abort.lock().await = Some(task.abort_handle());

    let vehicle = task
        .await
        .map_err(|e| {
            if e.is_cancelled() {
                "connection cancelled".to_string()
            } else {
                e.to_string()
            }
        })?
        .map_err(|e| e.to_string())?;

    // Clear abort handle now that connect completed
    *state.connect_abort.lock().await = None;

    spawn_event_bridges(&app, &vehicle);

    *state.vehicle.lock().await = Some(vehicle);
    Ok(())
}

#[tauri::command]
async fn disconnect_link(state: tauri::State<'_, AppState>) -> Result<(), String> {
    // Abort any in-flight connect attempt
    if let Some(handle) = state.connect_abort.lock().await.take() {
        handle.abort();
    }

    let vehicle = state.vehicle.lock().await.take();
    if let Some(v) = vehicle {
        v.disconnect().await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Pure commands (no connection needed)
// ---------------------------------------------------------------------------

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn list_serial_ports_cmd() -> Result<Vec<String>, String> {
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;
    Ok(ports.into_iter().map(|p| p.port_name).collect())
}

#[tauri::command]
fn mission_validate_plan(plan: MissionPlan) -> Vec<MissionIssue> {
    validate_plan(&plan)
}

// ---------------------------------------------------------------------------
// Vehicle commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn arm_vehicle(state: tauri::State<'_, AppState>, force: bool) -> Result<(), String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle.arm(force).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn disarm_vehicle(state: tauri::State<'_, AppState>, force: bool) -> Result<(), String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle.disarm(force).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_flight_mode(
    state: tauri::State<'_, AppState>,
    custom_mode: u32,
) -> Result<(), String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle.set_mode(custom_mode).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn vehicle_takeoff(
    state: tauri::State<'_, AppState>,
    altitude_m: f32,
) -> Result<(), String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle.takeoff(altitude_m).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn vehicle_guided_goto(
    state: tauri::State<'_, AppState>,
    lat_deg: f64,
    lon_deg: f64,
    alt_m: f32,
) -> Result<(), String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle.goto(lat_deg, lon_deg, alt_m).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_available_modes(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<FlightMode>, String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    Ok(vehicle.available_modes())
}

// ---------------------------------------------------------------------------
// Settings commands
// ---------------------------------------------------------------------------

#[tauri::command]
fn set_telemetry_rate(rate_hz: u32) -> Result<(), String> {
    if rate_hz == 0 || rate_hz > 20 {
        return Err("rate_hz must be between 1 and 20".into());
    }
    TELEMETRY_INTERVAL_MS.store(1000 / rate_hz as u64, Ordering::Relaxed);
    Ok(())
}

// ---------------------------------------------------------------------------
// Mission commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn mission_upload_plan(
    state: tauri::State<'_, AppState>,
    plan: MissionPlan,
) -> Result<(), String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle.mission().upload(plan).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn mission_download_plan(
    state: tauri::State<'_, AppState>,
    mission_type: MissionType,
) -> Result<MissionPlan, String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle
        .mission()
        .download(mission_type)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn mission_clear_plan(
    state: tauri::State<'_, AppState>,
    mission_type: MissionType,
) -> Result<(), String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle
        .mission()
        .clear(mission_type)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn mission_verify_roundtrip(
    state: tauri::State<'_, AppState>,
    plan: MissionPlan,
) -> Result<bool, String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle
        .mission()
        .verify_roundtrip(plan)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn mission_set_current(
    state: tauri::State<'_, AppState>,
    seq: u16,
) -> Result<(), String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle
        .mission()
        .set_current(seq)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn mission_cancel(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle.mission().cancel_transfer();
    Ok(())
}

// ---------------------------------------------------------------------------
// Parameter commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn param_download_all(state: tauri::State<'_, AppState>) -> Result<ParamStore, String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle.params().download_all().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn param_write(
    state: tauri::State<'_, AppState>,
    name: String,
    value: f32,
) -> Result<Param, String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle.params().write(name, value).await.map_err(|e| e.to_string())
}

#[tauri::command]
fn param_parse_file(contents: String) -> Result<HashMap<String, f32>, String> {
    parse_param_file(&contents)
}

#[tauri::command]
fn param_format_file(store: ParamStore) -> String {
    format_param_file(&store)
}

// ---------------------------------------------------------------------------
// Watch → Tauri event bridges
// ---------------------------------------------------------------------------

fn spawn_event_bridges(app: &tauri::AppHandle, vehicle: &Vehicle) {
    // Telemetry — throttled by TELEMETRY_INTERVAL_MS (re-read each loop for live rate changes)
    {
        let mut rx = vehicle.telemetry();
        let handle = app.clone();
        tokio::spawn(async move {
            loop {
                let ms = TELEMETRY_INTERVAL_MS.load(Ordering::Relaxed);
                tokio::time::sleep(Duration::from_millis(ms)).await;
                match rx.has_changed() {
                    Ok(true) => {
                        let t: Telemetry = rx.borrow_and_update().clone();
                        let _ = handle.emit("telemetry://tick", &t);
                    }
                    Ok(false) => {}
                    Err(_) => break,
                }
            }
        });
    }

    // VehicleState
    {
        let mut rx = vehicle.state();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let s: VehicleState = rx.borrow().clone();
                let _ = handle.emit("vehicle://state", &s);
            }
        });
    }

    // HomePosition
    {
        let mut rx = vehicle.home_position();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let hp: Option<HomePosition> = rx.borrow().clone();
                if let Some(hp) = hp {
                    let _ = handle.emit("home://position", &hp);
                }
            }
        });
    }

    // MissionState
    {
        let mut rx = vehicle.mission_state();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let ms = rx.borrow().clone();
                let _ = handle.emit("mission.state", &ms);
            }
        });
    }

    // LinkState
    {
        let mut rx = vehicle.link_state();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let ls: LinkState = rx.borrow().clone();
                let _ = handle.emit("link://state", &ls);
            }
        });
    }

    // MissionProgress
    {
        let mut rx = vehicle.mission_progress();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let mp: Option<TransferProgress> = rx.borrow().clone();
                if let Some(mp) = mp {
                    let _ = handle.emit("mission.progress", &mp);
                }
            }
        });
    }

    // ParamStore
    {
        let mut rx = vehicle.param_store();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let ps: ParamStore = rx.borrow().clone();
                let _ = handle.emit("param://store", &ps);
            }
        });
    }

    // ParamProgress
    {
        let mut rx = vehicle.param_progress();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let pp: ParamProgress = rx.borrow().clone();
                let _ = handle.emit("param://progress", &pp);
            }
        });
    }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState {
        vehicle: tokio::sync::Mutex::new(None),
        connect_abort: tokio::sync::Mutex::new(None),
    };

    let mut builder = tauri::Builder::default()
        .manage(state)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init());

    #[cfg(not(target_os = "android"))]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
            connect_link,
            disconnect_link,
            list_serial_ports_cmd,
            mission_validate_plan,
            mission_upload_plan,
            mission_download_plan,
            mission_clear_plan,
            mission_verify_roundtrip,
            mission_set_current,
            mission_cancel,
            arm_vehicle,
            disarm_vehicle,
            set_flight_mode,
            vehicle_takeoff,
            vehicle_guided_goto,
            get_available_modes,
            set_telemetry_rate,
            param_download_all,
            param_write,
            param_parse_file,
            param_format_file
        ]);
    }

    #[cfg(target_os = "android")]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
            connect_link,
            disconnect_link,
            mission_validate_plan,
            mission_upload_plan,
            mission_download_plan,
            mission_clear_plan,
            mission_verify_roundtrip,
            mission_set_current,
            mission_cancel,
            arm_vehicle,
            disarm_vehicle,
            set_flight_mode,
            vehicle_takeoff,
            vehicle_guided_goto,
            get_available_modes,
            set_telemetry_rate,
            param_download_all,
            param_write,
            param_parse_file,
            param_format_file
        ]);
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
