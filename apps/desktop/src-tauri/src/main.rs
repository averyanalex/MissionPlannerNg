#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use mp_mission_core::{
    normalize_for_compare, plans_equivalent, validate_plan, CompareTolerance, MissionFrame,
    MissionIssue, MissionItem, MissionPlan, MissionTransferMachine, MissionType, RetryPolicy,
    TransferError,
};
use mp_telemetry_core::{
    list_serial_ports, ConnectRequest, ConnectResponse, CoreEvent, LinkManager, LinkStateEvent,
    TelemetryEvent,
};
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Emitter;

struct AppState {
    manager: Mutex<LinkManager>,
    event_tx: mpsc::Sender<CoreEvent>,
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
    Ok(manager.connect(request, state.event_tx.clone()))
}

#[tauri::command]
fn disconnect_link(state: tauri::State<'_, AppState>, session_id: String) -> Result<(), String> {
    let mut manager = state
        .manager
        .lock()
        .map_err(|_| String::from("failed to lock link manager"))?;
    if manager.disconnect(&session_id) {
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
fn mission_simulate_upload(app_handle: tauri::AppHandle, plan: MissionPlan) -> Result<(), String> {
    let issues = validate_plan(&plan);
    if let Some(issue) = issues
        .iter()
        .find(|issue| issue.severity == mp_mission_core::IssueSeverity::Error)
    {
        let payload = TransferError {
            code: issue.code.clone(),
            message: issue.message.clone(),
        };
        let _ = app_handle.emit("mission.error", payload);
        return Err(String::from("mission validation failed"));
    }

    std::thread::spawn(move || {
        let mut machine = MissionTransferMachine::new_upload(&plan, RetryPolicy::default());
        let _ = app_handle.emit("mission.progress", machine.progress());

        if plan.items.is_empty() {
            machine.on_ack_success();
            let _ = app_handle.emit("mission.progress", machine.progress());
            return;
        }

        for _ in &plan.items {
            std::thread::sleep(Duration::from_millis(150));
            machine.on_item_transferred();
            let _ = app_handle.emit("mission.progress", machine.progress());
        }

        std::thread::sleep(Duration::from_millis(120));
        machine.on_ack_success();
        let _ = app_handle.emit("mission.progress", machine.progress());
    });

    Ok(())
}

#[tauri::command]
fn mission_simulate_download(
    app_handle: tauri::AppHandle,
    mission_type: MissionType,
) -> Result<MissionPlan, String> {
    let plan = sample_mission_plan(mission_type);
    let mut machine = MissionTransferMachine::new_download(mission_type, RetryPolicy::default());
    machine.set_download_total(plan.items.len() as u16);

    let _ = app_handle.emit("mission.progress", machine.progress());
    for _ in &plan.items {
        std::thread::sleep(Duration::from_millis(120));
        machine.on_item_transferred();
        let _ = app_handle.emit("mission.progress", machine.progress());
    }

    machine.on_ack_success();
    let _ = app_handle.emit("mission.progress", machine.progress());
    Ok(plan)
}

#[tauri::command]
fn mission_simulate_clear(app_handle: tauri::AppHandle, mission_type: MissionType) {
    let plan = MissionPlan {
        mission_type,
        items: Vec::new(),
    };
    let mut machine = MissionTransferMachine::new_upload(&plan, RetryPolicy::default());
    let _ = app_handle.emit("mission.progress", machine.progress());
    machine.on_ack_success();
    let _ = app_handle.emit("mission.progress", machine.progress());
}

#[tauri::command]
fn mission_verify_roundtrip(plan: MissionPlan) -> bool {
    let lhs = normalize_for_compare(&plan);
    let mut rhs = normalize_for_compare(&plan);

    if let Some(first) = rhs.items.first_mut() {
        first.param2 += 0.00005;
        first.z += 0.005;
    }

    plans_equivalent(&lhs, &rhs, CompareTolerance::default())
}

fn main() {
    let (event_tx, event_rx) = mpsc::channel::<CoreEvent>();
    let state = AppState {
        manager: Mutex::new(LinkManager::new()),
        event_tx,
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
            mission_simulate_upload,
            mission_simulate_download,
            mission_simulate_clear,
            mission_verify_roundtrip
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

fn sample_mission_plan(mission_type: MissionType) -> MissionPlan {
    MissionPlan {
        mission_type,
        items: vec![
            sample_item(0, 47.397742, 8.545594, 25.0),
            sample_item(1, 47.398400, 8.546100, 30.0),
            sample_item(2, 47.399050, 8.546550, 35.0),
        ],
    }
}

fn sample_item(seq: u16, lat_deg: f64, lon_deg: f64, alt_m: f32) -> MissionItem {
    MissionItem {
        seq,
        command: 16,
        frame: MissionFrame::GlobalRelativeAltInt,
        current: seq == 0,
        autocontinue: true,
        param1: 0.0,
        param2: 1.0,
        param3: 0.0,
        param4: 0.0,
        x: (lat_deg * 1e7) as i32,
        y: (lon_deg * 1e7) as i32,
        z: alt_m,
    }
}
