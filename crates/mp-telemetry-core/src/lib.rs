use mavlink::common;
use mavlink::{connect, MavConnection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use std::thread::JoinHandle;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LinkEndpoint {
    Udp { bind_addr: String },
    Serial { port: String, baud: u32 },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LinkStatus {
    Connecting,
    Connected,
    Disconnected,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkStateEvent {
    pub session_id: String,
    pub status: LinkStatus,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryEvent {
    pub session_id: String,
    pub ts: u64,
    pub altitude_m: Option<f64>,
    pub speed_mps: Option<f64>,
    pub fuel_pct: Option<f64>,
    pub heading_deg: Option<f64>,
    pub fix_type: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectRequest {
    pub endpoint: LinkEndpoint,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectResponse {
    pub session_id: String,
}

#[derive(Debug, Clone)]
pub enum CoreEvent {
    Link(LinkStateEvent),
    Telemetry(TelemetryEvent),
}

struct SessionHandle {
    stop_flag: Arc<AtomicBool>,
    task: JoinHandle<()>,
}

#[derive(Default)]
pub struct LinkManager {
    sessions: HashMap<String, SessionHandle>,
}

impl LinkManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn connect(
        &mut self,
        request: ConnectRequest,
        event_tx: mpsc::Sender<CoreEvent>,
    ) -> ConnectResponse {
        let session_id = Uuid::new_v4().to_string();
        let endpoint = request.endpoint.clone();
        let stop_flag = Arc::new(AtomicBool::new(false));
        let stop_for_task = stop_flag.clone();
        let session_for_task = session_id.clone();

        let task = thread::spawn(move || {
            run_session(session_for_task, endpoint, event_tx, stop_for_task);
        });

        self.sessions
            .insert(session_id.clone(), SessionHandle { stop_flag, task });
        ConnectResponse { session_id }
    }

    pub fn disconnect(&mut self, session_id: &str) -> bool {
        if let Some(handle) = self.sessions.remove(session_id) {
            handle.stop_flag.store(true, Ordering::Relaxed);
            let _ = handle.task.join();
            return true;
        }
        false
    }

    pub fn disconnect_all(&mut self) {
        let ids: Vec<String> = self.sessions.keys().cloned().collect();
        for id in ids {
            let _ = self.disconnect(&id);
        }
    }
}

fn run_session(
    session_id: String,
    endpoint: LinkEndpoint,
    event_tx: mpsc::Sender<CoreEvent>,
    stop_flag: Arc<AtomicBool>,
) {
    emit_link(
        &event_tx,
        &session_id,
        LinkStatus::Connecting,
        Some(endpoint_label(&endpoint)),
    );

    let address = endpoint_address(&endpoint);
    let mut connection = match connect::<common::MavMessage>(&address) {
        Ok(connection) => connection,
        Err(err) => {
            emit_link(
                &event_tx,
                &session_id,
                LinkStatus::Error,
                Some(format!("connect failed: {err}")),
            );
            return;
        }
    };

    connection.set_allow_recv_any_version(true);

    emit_link(&event_tx, &session_id, LinkStatus::Connected, Some(address));

    let mut aggregate = TelemetryAggregate::default();
    let mut idle_loops = 0usize;

    while !stop_flag.load(Ordering::Relaxed) {
        match connection.try_recv() {
            Ok((_header, message)) => {
                idle_loops = 0;
                if aggregate.apply_message(message) {
                    emit_telemetry(&event_tx, &session_id, &aggregate);
                }
            }
            Err(err) => {
                if is_non_fatal_read_error(&err) {
                    idle_loops += 1;
                    if idle_loops > 10 {
                        thread::sleep(Duration::from_millis(10));
                        idle_loops = 0;
                    }
                    continue;
                }

                emit_link(
                    &event_tx,
                    &session_id,
                    LinkStatus::Error,
                    Some(format!("receive failed: {err}")),
                );
                return;
            }
        }
    }

    emit_link(&event_tx, &session_id, LinkStatus::Disconnected, None);
}

fn is_non_fatal_read_error(error: &mavlink::error::MessageReadError) -> bool {
    match error {
        mavlink::error::MessageReadError::Io(io_error) => {
            io_error.kind() == std::io::ErrorKind::WouldBlock
                || io_error.kind() == std::io::ErrorKind::TimedOut
        }
        _ => false,
    }
}

fn endpoint_address(endpoint: &LinkEndpoint) -> String {
    match endpoint {
        LinkEndpoint::Udp { bind_addr } => format!("udpin:{bind_addr}"),
        LinkEndpoint::Serial { port, baud } => format!("serial:{port}:{baud}"),
    }
}

fn endpoint_label(endpoint: &LinkEndpoint) -> String {
    match endpoint {
        LinkEndpoint::Udp { bind_addr } => format!("udp {bind_addr}"),
        LinkEndpoint::Serial { port, baud } => format!("serial {port}@{baud}"),
    }
}

fn emit_link(
    event_tx: &mpsc::Sender<CoreEvent>,
    session_id: &str,
    status: LinkStatus,
    detail: Option<String>,
) {
    let _ = event_tx.send(CoreEvent::Link(LinkStateEvent {
        session_id: session_id.to_string(),
        status,
        detail,
    }));
}

fn emit_telemetry(
    event_tx: &mpsc::Sender<CoreEvent>,
    session_id: &str,
    aggregate: &TelemetryAggregate,
) {
    let _ = event_tx.send(CoreEvent::Telemetry(TelemetryEvent {
        session_id: session_id.to_string(),
        ts: now_unix_secs(),
        altitude_m: aggregate.altitude_m,
        speed_mps: aggregate.speed_mps,
        fuel_pct: aggregate.fuel_pct,
        heading_deg: aggregate.heading_deg,
        fix_type: aggregate.fix_type,
    }));
}

fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[derive(Default)]
struct TelemetryAggregate {
    altitude_m: Option<f64>,
    speed_mps: Option<f64>,
    fuel_pct: Option<f64>,
    heading_deg: Option<f64>,
    fix_type: Option<u8>,
}

impl TelemetryAggregate {
    fn apply_message(&mut self, message: common::MavMessage) -> bool {
        match message {
            common::MavMessage::VFR_HUD(data) => {
                self.altitude_m = Some(data.alt as f64);
                self.speed_mps = Some(data.groundspeed as f64);
                self.heading_deg = Some(data.heading as f64);
                true
            }
            common::MavMessage::GLOBAL_POSITION_INT(data) => {
                self.altitude_m = Some(data.relative_alt as f64 / 1000.0);
                let vx = data.vx as f64 / 100.0;
                let vy = data.vy as f64 / 100.0;
                self.speed_mps = Some((vx * vx + vy * vy).sqrt());
                if data.hdg != u16::MAX {
                    self.heading_deg = Some(data.hdg as f64 / 100.0);
                }
                true
            }
            common::MavMessage::SYS_STATUS(data) => {
                if data.battery_remaining >= 0 {
                    self.fuel_pct = Some(data.battery_remaining as f64);
                }
                true
            }
            common::MavMessage::GPS_RAW_INT(data) => {
                self.fix_type = Some(data.fix_type as u8);
                true
            }
            _ => false,
        }
    }
}

pub fn list_serial_ports() -> Result<Vec<String>, String> {
    let ports = serialport::available_ports()
        .map_err(|err| format!("unable to list serial ports: {err}"))?;
    Ok(ports.into_iter().map(|p| p.port_name).collect())
}
