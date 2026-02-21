#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use mp_mission_core::{
    validate_plan, MissionIssue, MissionPlan, MissionType, TransferError, TransferProgress,
};
use mp_telemetry_core::{
    list_serial_ports, ConnectRequest, ConnectResponse, CoreEvent, HomePositionEvent, LinkManager,
    LinkStateEvent, MissionStateEvent, TelemetryEvent, VehicleStateEvent,
};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use tauri::Emitter;

struct AppState {
    manager: Mutex<LinkManager>,
    event_tx: mpsc::Sender<CoreEvent>,
    cancel_flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[tauri::command]
fn connect_link(
    state: tauri::State<'_, AppState>,
    request: ConnectRequest,
) -> Result<ConnectResponse, String> {
    let mut manager = state
        .manager
        .lock()
        .map_err(|_| String::from("failed to lock link manager"))?;
    let (response, cancel_flag) = manager.connect(request, state.event_tx.clone());
    state
        .cancel_flags
        .lock()
        .map_err(|_| String::from("failed to lock cancel flags"))?
        .insert(response.session_id.clone(), cancel_flag);
    Ok(response)
}

#[tauri::command]
fn disconnect_link(state: tauri::State<'_, AppState>, session_id: String) -> Result<(), String> {
    let mut manager = state
        .manager
        .lock()
        .map_err(|_| String::from("failed to lock link manager"))?;
    if manager.disconnect(&session_id) {
        let _ = state
            .cancel_flags
            .lock()
            .map(|mut flags| flags.remove(&session_id));
        Ok(())
    } else {
        Err(String::from("session not found"))
    }
}

#[tauri::command]
fn list_serial_ports_cmd() -> Result<Vec<String>, String> {
    list_serial_ports()
}

#[tauri::command]
fn mission_validate_plan(plan: MissionPlan) -> Vec<MissionIssue> {
    validate_plan(&plan)
}

#[tauri::command]
fn mission_upload_plan(
    state: tauri::State<'_, AppState>,
    session_id: String,
    plan: MissionPlan,
) -> Result<(), String> {
    let manager = state
        .manager
        .lock()
        .map_err(|_| String::from("failed to lock link manager"))?;
    manager.mission_upload(&session_id, plan)
}

#[tauri::command]
fn mission_download_plan(
    state: tauri::State<'_, AppState>,
    session_id: String,
    mission_type: MissionType,
) -> Result<MissionPlan, String> {
    let manager = state
        .manager
        .lock()
        .map_err(|_| String::from("failed to lock link manager"))?;
    manager.mission_download(&session_id, mission_type)
}

#[tauri::command]
fn mission_clear_plan(
    state: tauri::State<'_, AppState>,
    session_id: String,
    mission_type: MissionType,
) -> Result<(), String> {
    let manager = state
        .manager
        .lock()
        .map_err(|_| String::from("failed to lock link manager"))?;
    manager.mission_clear(&session_id, mission_type)
}

#[tauri::command]
fn mission_verify_roundtrip(
    state: tauri::State<'_, AppState>,
    session_id: String,
    plan: MissionPlan,
) -> Result<bool, String> {
    let manager = state
        .manager
        .lock()
        .map_err(|_| String::from("failed to lock link manager"))?;
    manager.mission_verify_roundtrip(&session_id, plan)
}

#[tauri::command]
fn mission_set_current(
    state: tauri::State<'_, AppState>,
    session_id: String,
    seq: u16,
) -> Result<(), String> {
    let manager = state
        .manager
        .lock()
        .map_err(|_| String::from("failed to lock link manager"))?;
    manager.mission_set_current(&session_id, seq)
}

#[tauri::command]
fn mission_cancel(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    let flags = state
        .cancel_flags
        .lock()
        .map_err(|_| String::from("failed to lock cancel flags"))?;
    let flag = flags
        .get(&session_id)
        .ok_or_else(|| String::from("session not found"))?;
    flag.store(true, Ordering::Relaxed);
    Ok(())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct FlightModeEntry {
    custom_mode: u32,
    name: String,
}

#[tauri::command]
fn arm_vehicle(
    state: tauri::State<'_, AppState>,
    session_id: String,
    force: bool,
) -> Result<(), String> {
    let manager = state
        .manager
        .lock()
        .map_err(|_| String::from("failed to lock link manager"))?;
    manager.arm_vehicle(&session_id, force)
}

#[tauri::command]
fn disarm_vehicle(
    state: tauri::State<'_, AppState>,
    session_id: String,
    force: bool,
) -> Result<(), String> {
    let manager = state
        .manager
        .lock()
        .map_err(|_| String::from("failed to lock link manager"))?;
    manager.disarm_vehicle(&session_id, force)
}

#[tauri::command]
fn set_flight_mode(
    state: tauri::State<'_, AppState>,
    session_id: String,
    custom_mode: u32,
) -> Result<(), String> {
    let manager = state
        .manager
        .lock()
        .map_err(|_| String::from("failed to lock link manager"))?;
    manager.set_flight_mode(&session_id, custom_mode)
}

#[tauri::command]
fn vehicle_takeoff(
    state: tauri::State<'_, AppState>,
    session_id: String,
    altitude_m: f32,
) -> Result<(), String> {
    let manager = state
        .manager
        .lock()
        .map_err(|_| String::from("failed to lock link manager"))?;
    manager.takeoff(&session_id, altitude_m)
}

#[tauri::command]
fn vehicle_guided_goto(
    state: tauri::State<'_, AppState>,
    session_id: String,
    lat_deg: f64,
    lon_deg: f64,
    alt_m: f32,
) -> Result<(), String> {
    let manager = state
        .manager
        .lock()
        .map_err(|_| String::from("failed to lock link manager"))?;
    let lat_e7 = (lat_deg * 1e7) as i32;
    let lon_e7 = (lon_deg * 1e7) as i32;
    manager.guided_goto(&session_id, lat_e7, lon_e7, alt_m)
}

#[tauri::command]
fn get_available_modes(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<Vec<FlightModeEntry>, String> {
    let manager = state
        .manager
        .lock()
        .map_err(|_| String::from("failed to lock link manager"))?;
    let modes = manager.get_available_modes(&session_id)?;
    Ok(modes
        .into_iter()
        .map(|(custom_mode, name)| FlightModeEntry { custom_mode, name })
        .collect())
}

fn main() {
    let (event_tx, event_rx) = mpsc::channel::<CoreEvent>();
    let state = AppState {
        manager: Mutex::new(LinkManager::new()),
        event_tx,
        cancel_flags: Mutex::new(HashMap::new()),
    };

    tauri::Builder::default()
        .manage(state)
        .setup(move |app| {
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                while let Ok(event) = event_rx.recv() {
                    match event {
                        CoreEvent::Link(payload) => {
                            let _ = emit_link_event(&app_handle, payload);
                        }
                        CoreEvent::Telemetry(payload) => {
                            let _ = emit_telemetry_event(&app_handle, payload);
                        }
                        CoreEvent::MissionProgress(payload) => {
                            let _ = emit_mission_progress_event(&app_handle, payload);
                        }
                        CoreEvent::MissionError(payload) => {
                            let _ = emit_mission_error_event(&app_handle, payload);
                        }
                        CoreEvent::MissionState(payload) => {
                            let _ = emit_mission_state_event(&app_handle, payload);
                        }
                        CoreEvent::HomePosition(payload) => {
                            let _ = emit_home_position_event(&app_handle, payload);
                        }
                        CoreEvent::VehicleState(payload) => {
                            let _ = emit_vehicle_state_event(&app_handle, payload);
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
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
            get_available_modes
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}

fn emit_link_event(
    app_handle: &tauri::AppHandle,
    payload: LinkStateEvent,
) -> Result<(), tauri::Error> {
    app_handle.emit("link://state", payload)
}

fn emit_telemetry_event(
    app_handle: &tauri::AppHandle,
    payload: TelemetryEvent,
) -> Result<(), tauri::Error> {
    app_handle.emit("telemetry://tick", payload)
}

fn emit_mission_progress_event(
    app_handle: &tauri::AppHandle,
    payload: TransferProgress,
) -> Result<(), tauri::Error> {
    app_handle.emit("mission.progress", payload)
}

fn emit_mission_error_event(
    app_handle: &tauri::AppHandle,
    payload: TransferError,
) -> Result<(), tauri::Error> {
    app_handle.emit("mission.error", payload)
}

fn emit_mission_state_event(
    app_handle: &tauri::AppHandle,
    payload: MissionStateEvent,
) -> Result<(), tauri::Error> {
    app_handle.emit("mission.state", payload)
}

fn emit_home_position_event(
    app_handle: &tauri::AppHandle,
    payload: HomePositionEvent,
) -> Result<(), tauri::Error> {
    app_handle.emit("home://position", payload)
}

fn emit_vehicle_state_event(
    app_handle: &tauri::AppHandle,
    payload: VehicleStateEvent,
) -> Result<(), tauri::Error> {
    app_handle.emit("vehicle://state", payload)
}
