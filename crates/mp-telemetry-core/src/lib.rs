use mavlink::common;
use mavlink::{connect, MavConnection, MavHeader};
use mp_mission_core::{
    normalize_for_compare, plans_equivalent, CompareTolerance, MissionFrame, MissionItem,
    MissionPlan, MissionTransferMachine, MissionType, RetryPolicy, TransferError, TransferProgress,
};
use num_traits::FromPrimitive;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use std::thread::JoinHandle;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const GCS_SYSTEM_ID: u8 = 255;
const GCS_COMPONENT_ID: u8 = 190;
const MISSION_TIMEOUT_ERROR: &str = "mission operation timeout";

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
    MissionProgress(TransferProgress),
    MissionError(TransferError),
}

struct SessionHandle {
    stop_flag: Arc<AtomicBool>,
    task: JoinHandle<()>,
    command_tx: mpsc::Sender<SessionCommand>,
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
        let (command_tx, command_rx) = mpsc::channel();

        let task = thread::spawn(move || {
            run_session(
                session_for_task,
                endpoint,
                event_tx,
                stop_for_task,
                command_rx,
            );
        });

        self.sessions.insert(
            session_id.clone(),
            SessionHandle {
                stop_flag,
                task,
                command_tx,
            },
        );
        ConnectResponse { session_id }
    }

    pub fn disconnect(&mut self, session_id: &str) -> bool {
        if let Some(handle) = self.sessions.remove(session_id) {
            handle.stop_flag.store(true, Ordering::Relaxed);
            let _ = handle.command_tx.send(SessionCommand::Shutdown);
            let _ = handle.task.join();
            return true;
        }
        false
    }

    pub fn mission_upload(&self, session_id: &str, plan: MissionPlan) -> Result<(), String> {
        let handle = self
            .sessions
            .get(session_id)
            .ok_or_else(|| String::from("session not found"))?;
        let (reply_tx, reply_rx) = mpsc::channel();
        handle
            .command_tx
            .send(SessionCommand::Upload { plan, reply_tx })
            .map_err(|_| String::from("mission session offline"))?;
        reply_rx
            .recv_timeout(Duration::from_secs(30))
            .map_err(|_| String::from("mission upload timed out"))?
    }

    pub fn mission_download(
        &self,
        session_id: &str,
        mission_type: MissionType,
    ) -> Result<MissionPlan, String> {
        let handle = self
            .sessions
            .get(session_id)
            .ok_or_else(|| String::from("session not found"))?;
        let (reply_tx, reply_rx) = mpsc::channel();
        handle
            .command_tx
            .send(SessionCommand::Download {
                mission_type,
                reply_tx,
            })
            .map_err(|_| String::from("mission session offline"))?;
        reply_rx
            .recv_timeout(Duration::from_secs(30))
            .map_err(|_| String::from("mission download timed out"))?
    }

    pub fn mission_clear(&self, session_id: &str, mission_type: MissionType) -> Result<(), String> {
        let handle = self
            .sessions
            .get(session_id)
            .ok_or_else(|| String::from("session not found"))?;
        let (reply_tx, reply_rx) = mpsc::channel();
        handle
            .command_tx
            .send(SessionCommand::Clear {
                mission_type,
                reply_tx,
            })
            .map_err(|_| String::from("mission session offline"))?;
        reply_rx
            .recv_timeout(Duration::from_secs(10))
            .map_err(|_| String::from("mission clear timed out"))?
    }

    pub fn mission_verify_roundtrip(
        &self,
        session_id: &str,
        plan: MissionPlan,
    ) -> Result<bool, String> {
        self.mission_upload(session_id, plan.clone())?;
        let readback = self.mission_download(session_id, plan.mission_type)?;
        let lhs = normalize_for_compare(&plan);
        let rhs = normalize_for_compare(&readback);
        Ok(plans_equivalent(&lhs, &rhs, CompareTolerance::default()))
    }

    pub fn disconnect_all(&mut self) {
        let ids: Vec<String> = self.sessions.keys().cloned().collect();
        for id in ids {
            let _ = self.disconnect(&id);
        }
    }
}

enum SessionCommand {
    Upload {
        plan: MissionPlan,
        reply_tx: mpsc::Sender<Result<(), String>>,
    },
    Download {
        mission_type: MissionType,
        reply_tx: mpsc::Sender<Result<MissionPlan, String>>,
    },
    Clear {
        mission_type: MissionType,
        reply_tx: mpsc::Sender<Result<(), String>>,
    },
    Shutdown,
}

fn run_session(
    session_id: String,
    endpoint: LinkEndpoint,
    event_tx: mpsc::Sender<CoreEvent>,
    stop_flag: Arc<AtomicBool>,
    command_rx: mpsc::Receiver<SessionCommand>,
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
    let mut vehicle_target: Option<VehicleTarget> = None;

    while !stop_flag.load(Ordering::Relaxed) {
        if let Ok(command) = command_rx.try_recv() {
            handle_session_command(
                command,
                &session_id,
                &event_tx,
                &mut connection,
                &mut aggregate,
                &mut vehicle_target,
                &stop_flag,
            );
            continue;
        }

        match connection.try_recv() {
            Ok((header, message)) => {
                update_vehicle_target(&mut vehicle_target, &header, &message);
                if aggregate.apply_message(message) {
                    emit_telemetry(&event_tx, &session_id, &aggregate);
                }
            }
            Err(err) => {
                if is_non_fatal_read_error(&err) {
                    thread::sleep(Duration::from_millis(8));
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

fn handle_session_command(
    command: SessionCommand,
    session_id: &str,
    event_tx: &mpsc::Sender<CoreEvent>,
    connection: &mut impl MavConnection<common::MavMessage>,
    aggregate: &mut TelemetryAggregate,
    vehicle_target: &mut Option<VehicleTarget>,
    stop_flag: &Arc<AtomicBool>,
) {
    match command {
        SessionCommand::Upload { plan, reply_tx } => {
            let result = mission_upload_internal(
                session_id,
                event_tx,
                connection,
                aggregate,
                vehicle_target,
                stop_flag,
                plan,
            );
            let _ = reply_tx.send(result);
        }
        SessionCommand::Download {
            mission_type,
            reply_tx,
        } => {
            let result = mission_download_internal(
                session_id,
                event_tx,
                connection,
                aggregate,
                vehicle_target,
                stop_flag,
                mission_type,
            );
            let _ = reply_tx.send(result);
        }
        SessionCommand::Clear {
            mission_type,
            reply_tx,
        } => {
            let result = mission_clear_internal(
                session_id,
                event_tx,
                connection,
                aggregate,
                vehicle_target,
                stop_flag,
                mission_type,
            );
            let _ = reply_tx.send(result);
        }
        SessionCommand::Shutdown => {}
    }
}

fn mission_upload_internal(
    session_id: &str,
    event_tx: &mpsc::Sender<CoreEvent>,
    connection: &mut impl MavConnection<common::MavMessage>,
    aggregate: &mut TelemetryAggregate,
    vehicle_target: &mut Option<VehicleTarget>,
    stop_flag: &Arc<AtomicBool>,
    plan: MissionPlan,
) -> Result<(), String> {
    let issues = mp_mission_core::validate_plan(&plan);
    if let Some(issue) = issues
        .iter()
        .find(|issue| issue.severity == mp_mission_core::IssueSeverity::Error)
    {
        let err = TransferError {
            code: issue.code.clone(),
            message: issue.message.clone(),
        };
        let _ = event_tx.send(CoreEvent::MissionError(err.clone()));
        return Err(format!("{}: {}", issue.code, issue.message));
    }

    let target = vehicle_target
        .as_ref()
        .ok_or_else(|| String::from("vehicle target unknown: wait for heartbeat"))?
        .clone();

    let mut machine = MissionTransferMachine::new_upload(&plan, RetryPolicy::default());
    emit_mission_progress(event_tx, machine.progress());
    let mav_mission_type = to_mav_mission_type(plan.mission_type);

    let send_count = |connection: &mut dyn MavConnection<common::MavMessage>| {
        send_message(
            connection,
            common::MavMessage::MISSION_COUNT(common::MISSION_COUNT_DATA {
                count: plan.items.len() as u16,
                target_system: target.system_id,
                target_component: target.component_id,
                mission_type: mav_mission_type,
                opaque_id: 0,
            }),
        )
    };

    send_count(connection)?;

    if plan.items.is_empty() {
        loop {
            match wait_for_ack(
                session_id,
                event_tx,
                connection,
                aggregate,
                vehicle_target,
                stop_flag,
                plan.mission_type,
                machine.timeout_ms(),
            ) {
                Ok(()) => {
                    machine.on_ack_success();
                    emit_mission_progress(event_tx, machine.progress());
                    return Ok(());
                }
                Err(err) if err == MISSION_TIMEOUT_ERROR => {
                    machine_on_timeout(&mut machine, event_tx)?;
                    emit_mission_progress(event_tx, machine.progress());
                    send_count(connection)?;
                }
                Err(err) => return Err(err),
            }
        }
    }

    let mut acknowledged = HashSet::<u16>::new();

    while machine.progress().phase != mp_mission_core::TransferPhase::AwaitAck {
        let timeout = machine.timeout_ms();
        let message = match wait_for_message(
            session_id,
            event_tx,
            connection,
            aggregate,
            vehicle_target,
            stop_flag,
            Duration::from_millis(timeout),
            |msg| {
                matches!(
                    msg,
                    common::MavMessage::MISSION_REQUEST_INT(_)
                        | common::MavMessage::MISSION_REQUEST(_)
                        | common::MavMessage::MISSION_ACK(_)
                )
            },
        ) {
            Ok(message) => message,
            Err(err) if err == MISSION_TIMEOUT_ERROR => {
                machine_on_timeout(&mut machine, event_tx)?;
                emit_mission_progress(event_tx, machine.progress());
                send_count(connection)?;
                continue;
            }
            Err(err) => return Err(err),
        };

        match message {
            common::MavMessage::MISSION_REQUEST_INT(data) => {
                if data.mission_type != mav_mission_type {
                    continue;
                }
                send_requested_item(connection, &plan, target, plan.mission_type, data.seq)?;
                if acknowledged.insert(data.seq) {
                    machine.on_item_transferred();
                    emit_mission_progress(event_tx, machine.progress());
                }
            }
            common::MavMessage::MISSION_REQUEST(data) => {
                if data.mission_type != mav_mission_type {
                    continue;
                }
                send_requested_item(connection, &plan, target, plan.mission_type, data.seq)?;
                if acknowledged.insert(data.seq) {
                    machine.on_item_transferred();
                    emit_mission_progress(event_tx, machine.progress());
                }
            }
            common::MavMessage::MISSION_ACK(data) => {
                if data.mission_type != mav_mission_type {
                    continue;
                }
                if data.mavtype == common::MavMissionResult::MAV_MISSION_ACCEPTED {
                    machine.on_ack_success();
                    emit_mission_progress(event_tx, machine.progress());
                    return Ok(());
                }
                return emit_and_fail_mission(
                    event_tx,
                    "transfer.ack_error",
                    &format!("MISSION_ACK error: {:?}", data.mavtype),
                );
            }
            _ => {}
        }
    }

    loop {
        match wait_for_ack(
            session_id,
            event_tx,
            connection,
            aggregate,
            vehicle_target,
            stop_flag,
            plan.mission_type,
            machine.timeout_ms(),
        ) {
            Ok(()) => {
                machine.on_ack_success();
                emit_mission_progress(event_tx, machine.progress());
                return Ok(());
            }
            Err(err) if err == MISSION_TIMEOUT_ERROR => {
                machine_on_timeout(&mut machine, event_tx)?;
                emit_mission_progress(event_tx, machine.progress());
                send_count(connection)?;
            }
            Err(err) => return Err(err),
        }
    }
}

fn mission_download_internal(
    session_id: &str,
    event_tx: &mpsc::Sender<CoreEvent>,
    connection: &mut impl MavConnection<common::MavMessage>,
    aggregate: &mut TelemetryAggregate,
    vehicle_target: &mut Option<VehicleTarget>,
    stop_flag: &Arc<AtomicBool>,
    mission_type: MissionType,
) -> Result<MissionPlan, String> {
    let target = vehicle_target
        .as_ref()
        .ok_or_else(|| String::from("vehicle target unknown: wait for heartbeat"))?
        .clone();

    let mut machine = MissionTransferMachine::new_download(mission_type, RetryPolicy::default());
    emit_mission_progress(event_tx, machine.progress());
    let mav_mission_type = to_mav_mission_type(mission_type);

    let send_request_list = |connection: &mut dyn MavConnection<common::MavMessage>| {
        send_message(
            connection,
            common::MavMessage::MISSION_REQUEST_LIST(common::MISSION_REQUEST_LIST_DATA {
                target_system: target.system_id,
                target_component: target.component_id,
                mission_type: mav_mission_type,
            }),
        )
    };

    send_request_list(connection)?;

    let count_message = loop {
        match wait_for_message(
            session_id,
            event_tx,
            connection,
            aggregate,
            vehicle_target,
            stop_flag,
            Duration::from_millis(machine.timeout_ms()),
            |msg| {
                matches!(
                    msg,
                    common::MavMessage::MISSION_COUNT(data) if data.mission_type == mav_mission_type
                )
            },
        ) {
            Ok(message) => break message,
            Err(err) if err == MISSION_TIMEOUT_ERROR => {
                machine_on_timeout(&mut machine, event_tx)?;
                emit_mission_progress(event_tx, machine.progress());
                send_request_list(connection)?;
            }
            Err(err) => return Err(err),
        }
    };

    let count = match count_message {
        common::MavMessage::MISSION_COUNT(data) => data.count,
        _ => 0,
    };

    machine.set_download_total(count);
    emit_mission_progress(event_tx, machine.progress());

    let mut items = Vec::with_capacity(count as usize);
    for seq in 0..count {
        let send_request_item = |connection: &mut dyn MavConnection<common::MavMessage>| {
            send_message(
                connection,
                common::MavMessage::MISSION_REQUEST_INT(common::MISSION_REQUEST_INT_DATA {
                    seq,
                    target_system: target.system_id,
                    target_component: target.component_id,
                    mission_type: mav_mission_type,
                }),
            )
        };

        send_request_item(connection)?;

        let item_message = loop {
            match wait_for_message(
                session_id,
                event_tx,
                connection,
                aggregate,
                vehicle_target,
                stop_flag,
                Duration::from_millis(machine.timeout_ms()),
                |msg| {
                    matches!(
                        msg,
                        common::MavMessage::MISSION_ITEM_INT(data)
                            if data.seq == seq && data.mission_type == mav_mission_type
                    )
                },
            ) {
                Ok(message) => break message,
                Err(err) if err == MISSION_TIMEOUT_ERROR => {
                    machine_on_timeout(&mut machine, event_tx)?;
                    emit_mission_progress(event_tx, machine.progress());
                    send_request_item(connection)?;
                }
                Err(err) => return Err(err),
            }
        };

        if let common::MavMessage::MISSION_ITEM_INT(data) = item_message {
            items.push(from_mission_item_data(data));
            machine.on_item_transferred();
            emit_mission_progress(event_tx, machine.progress());
        }
    }

    loop {
        match wait_for_ack(
            session_id,
            event_tx,
            connection,
            aggregate,
            vehicle_target,
            stop_flag,
            mission_type,
            machine.timeout_ms(),
        ) {
            Ok(()) => {
                machine.on_ack_success();
                emit_mission_progress(event_tx, machine.progress());
                break;
            }
            Err(err) if err == MISSION_TIMEOUT_ERROR => {
                machine_on_timeout(&mut machine, event_tx)?;
                emit_mission_progress(event_tx, machine.progress());
                if count == 0 {
                    send_request_list(connection)?;
                } else {
                    let last_seq = count - 1;
                    send_message(
                        connection,
                        common::MavMessage::MISSION_REQUEST_INT(common::MISSION_REQUEST_INT_DATA {
                            seq: last_seq,
                            target_system: target.system_id,
                            target_component: target.component_id,
                            mission_type: mav_mission_type,
                        }),
                    )?;
                }
            }
            Err(err) => return Err(err),
        }
    }

    Ok(MissionPlan {
        mission_type,
        items,
    })
}

fn mission_clear_internal(
    session_id: &str,
    event_tx: &mpsc::Sender<CoreEvent>,
    connection: &mut impl MavConnection<common::MavMessage>,
    aggregate: &mut TelemetryAggregate,
    vehicle_target: &mut Option<VehicleTarget>,
    stop_flag: &Arc<AtomicBool>,
    mission_type: MissionType,
) -> Result<(), String> {
    let target = vehicle_target
        .as_ref()
        .ok_or_else(|| String::from("vehicle target unknown: wait for heartbeat"))?
        .clone();

    let mut machine = MissionTransferMachine::new_upload(
        &MissionPlan {
            mission_type,
            items: Vec::new(),
        },
        RetryPolicy::default(),
    );
    emit_mission_progress(event_tx, machine.progress());
    let mav_mission_type = to_mav_mission_type(mission_type);

    let send_clear = |connection: &mut dyn MavConnection<common::MavMessage>| {
        send_message(
            connection,
            common::MavMessage::MISSION_CLEAR_ALL(common::MISSION_CLEAR_ALL_DATA {
                target_system: target.system_id,
                target_component: target.component_id,
                mission_type: mav_mission_type,
            }),
        )
    };

    send_clear(connection)?;

    loop {
        match wait_for_ack(
            session_id,
            event_tx,
            connection,
            aggregate,
            vehicle_target,
            stop_flag,
            mission_type,
            RetryPolicy::default().request_timeout_ms,
        ) {
            Ok(()) => {
                machine.on_ack_success();
                emit_mission_progress(event_tx, machine.progress());
                return Ok(());
            }
            Err(err) if err == MISSION_TIMEOUT_ERROR => {
                machine_on_timeout(&mut machine, event_tx)?;
                emit_mission_progress(event_tx, machine.progress());
                send_clear(connection)?;
            }
            Err(err) => return Err(err),
        }
    }
}

fn wait_for_ack(
    session_id: &str,
    event_tx: &mpsc::Sender<CoreEvent>,
    connection: &mut impl MavConnection<common::MavMessage>,
    aggregate: &mut TelemetryAggregate,
    vehicle_target: &mut Option<VehicleTarget>,
    stop_flag: &Arc<AtomicBool>,
    mission_type: MissionType,
    timeout_ms: u64,
) -> Result<(), String> {
    let mav_mission_type = to_mav_mission_type(mission_type);
    let message = wait_for_message(
        session_id,
        event_tx,
        connection,
        aggregate,
        vehicle_target,
        stop_flag,
        Duration::from_millis(timeout_ms),
        |msg| matches!(msg, common::MavMessage::MISSION_ACK(_)),
    )?;

    if let common::MavMessage::MISSION_ACK(data) = message {
        if data.mission_type != mav_mission_type {
            return Err(String::from("mission ack type mismatch"));
        }
        if data.mavtype == common::MavMissionResult::MAV_MISSION_ACCEPTED {
            return Ok(());
        }

        return emit_and_fail_mission(
            event_tx,
            "transfer.ack_error",
            &format!("MISSION_ACK error: {:?}", data.mavtype),
        );
    }

    emit_and_fail_mission(event_tx, "transfer.ack_missing", "Missing MISSION_ACK")
}

fn send_requested_item(
    connection: &mut impl MavConnection<common::MavMessage>,
    plan: &MissionPlan,
    target: VehicleTarget,
    mission_type: MissionType,
    seq: u16,
) -> Result<(), String> {
    let item = plan
        .items
        .get(seq as usize)
        .ok_or_else(|| format!("requested mission item {seq} out of range"))?;

    let command = common::MavCmd::from_u16(item.command)
        .ok_or_else(|| format!("unsupported MAV_CMD value {}", item.command))?;
    let frame = to_mav_frame(item.frame);

    send_message(
        connection,
        common::MavMessage::MISSION_ITEM_INT(common::MISSION_ITEM_INT_DATA {
            param1: item.param1,
            param2: item.param2,
            param3: item.param3,
            param4: item.param4,
            x: item.x,
            y: item.y,
            z: item.z,
            seq: item.seq,
            command,
            target_system: target.system_id,
            target_component: target.component_id,
            frame,
            current: u8::from(item.current),
            autocontinue: u8::from(item.autocontinue),
            mission_type: to_mav_mission_type(mission_type),
        }),
    )
}

fn wait_for_message<F>(
    session_id: &str,
    event_tx: &mpsc::Sender<CoreEvent>,
    connection: &mut impl MavConnection<common::MavMessage>,
    aggregate: &mut TelemetryAggregate,
    vehicle_target: &mut Option<VehicleTarget>,
    stop_flag: &Arc<AtomicBool>,
    timeout: Duration,
    mut predicate: F,
) -> Result<common::MavMessage, String>
where
    F: FnMut(&common::MavMessage) -> bool,
{
    let started = Instant::now();
    while started.elapsed() <= timeout {
        if stop_flag.load(Ordering::Relaxed) {
            return Err(String::from("session stopped"));
        }

        match connection.try_recv() {
            Ok((header, message)) => {
                update_vehicle_target(vehicle_target, &header, &message);
                if aggregate.apply_message(message.clone()) {
                    emit_telemetry(event_tx, session_id, aggregate);
                }
                if predicate(&message) {
                    return Ok(message);
                }
            }
            Err(err) => {
                if is_non_fatal_read_error(&err) {
                    thread::sleep(Duration::from_millis(10));
                    continue;
                }
                return Err(format!("receive failed: {err}"));
            }
        }
    }

    Err(String::from(MISSION_TIMEOUT_ERROR))
}

fn machine_on_timeout(
    machine: &mut MissionTransferMachine,
    event_tx: &mpsc::Sender<CoreEvent>,
) -> Result<(), String> {
    if let Some(error) = machine.on_timeout() {
        let _ = event_tx.send(CoreEvent::MissionError(error.clone()));
        Err(format!("{}: {}", error.code, error.message))
    } else {
        Ok(())
    }
}

fn emit_and_fail_mission(
    event_tx: &mpsc::Sender<CoreEvent>,
    code: &str,
    message: &str,
) -> Result<(), String> {
    let error = TransferError {
        code: code.to_string(),
        message: message.to_string(),
    };
    let _ = event_tx.send(CoreEvent::MissionError(error.clone()));
    Err(format!("{code}: {message}"))
}

fn emit_mission_progress(event_tx: &mpsc::Sender<CoreEvent>, progress: TransferProgress) {
    let _ = event_tx.send(CoreEvent::MissionProgress(progress));
}

fn send_message(
    connection: &mut (impl MavConnection<common::MavMessage> + ?Sized),
    message: common::MavMessage,
) -> Result<(), String> {
    connection
        .send(
            &MavHeader {
                system_id: GCS_SYSTEM_ID,
                component_id: GCS_COMPONENT_ID,
                sequence: 0,
            },
            &message,
        )
        .map(|_| ())
        .map_err(|err| format!("send failed: {err}"))
}

#[derive(Debug, Clone, Copy)]
struct VehicleTarget {
    system_id: u8,
    component_id: u8,
}

fn update_vehicle_target(
    vehicle_target: &mut Option<VehicleTarget>,
    header: &MavHeader,
    message: &common::MavMessage,
) {
    if header.system_id == 0 {
        return;
    }

    if matches!(message, common::MavMessage::HEARTBEAT(_)) {
        *vehicle_target = Some(VehicleTarget {
            system_id: header.system_id,
            component_id: header.component_id,
        });
    } else if vehicle_target.is_none() {
        *vehicle_target = Some(VehicleTarget {
            system_id: header.system_id,
            component_id: header.component_id,
        });
    }
}

fn to_mav_frame(frame: MissionFrame) -> common::MavFrame {
    match frame {
        MissionFrame::Mission => common::MavFrame::MAV_FRAME_MISSION,
        MissionFrame::GlobalInt => common::MavFrame::MAV_FRAME_GLOBAL_INT,
        MissionFrame::GlobalRelativeAltInt => common::MavFrame::MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
        MissionFrame::GlobalTerrainAltInt => common::MavFrame::MAV_FRAME_GLOBAL_TERRAIN_ALT_INT,
        MissionFrame::LocalNed => common::MavFrame::MAV_FRAME_LOCAL_NED,
        MissionFrame::Other => common::MavFrame::MAV_FRAME_MISSION,
    }
}

fn from_mission_item_data(data: common::MISSION_ITEM_INT_DATA) -> MissionItem {
    MissionItem {
        seq: data.seq,
        command: data.command as u16,
        frame: from_mav_frame(data.frame),
        current: data.current > 0,
        autocontinue: data.autocontinue > 0,
        param1: data.param1,
        param2: data.param2,
        param3: data.param3,
        param4: data.param4,
        x: data.x,
        y: data.y,
        z: data.z,
    }
}

fn from_mav_frame(frame: common::MavFrame) -> MissionFrame {
    match frame {
        common::MavFrame::MAV_FRAME_MISSION => MissionFrame::Mission,
        common::MavFrame::MAV_FRAME_GLOBAL_INT => MissionFrame::GlobalInt,
        common::MavFrame::MAV_FRAME_GLOBAL_RELATIVE_ALT_INT => MissionFrame::GlobalRelativeAltInt,
        common::MavFrame::MAV_FRAME_GLOBAL_TERRAIN_ALT_INT => MissionFrame::GlobalTerrainAltInt,
        common::MavFrame::MAV_FRAME_LOCAL_NED => MissionFrame::LocalNed,
        _ => MissionFrame::Other,
    }
}

fn to_mav_mission_type(mission_type: MissionType) -> common::MavMissionType {
    match mission_type {
        MissionType::Mission => common::MavMissionType::MAV_MISSION_TYPE_MISSION,
        MissionType::Fence => common::MavMissionType::MAV_MISSION_TYPE_FENCE,
        MissionType::Rally => common::MavMissionType::MAV_MISSION_TYPE_RALLY,
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use mavlink::error::{MessageReadError, MessageWriteError};
    use mavlink::{MAVLinkMessageRaw, MavFrame, MavlinkVersion};
    use std::collections::VecDeque;
    use std::sync::Mutex;

    struct MockConnection {
        protocol_version: Mutex<MavlinkVersion>,
        allow_any: Mutex<bool>,
        incoming: Mutex<VecDeque<(MavHeader, common::MavMessage)>>,
        sent: Mutex<Vec<common::MavMessage>>,
    }

    impl MockConnection {
        fn new(messages: Vec<common::MavMessage>) -> Self {
            let header = MavHeader {
                sequence: 1,
                system_id: 1,
                component_id: 1,
            };
            Self {
                protocol_version: Mutex::new(MavlinkVersion::V2),
                allow_any: Mutex::new(true),
                incoming: Mutex::new(messages.into_iter().map(|m| (header, m)).collect()),
                sent: Mutex::new(Vec::new()),
            }
        }

        fn sent_messages(&self) -> Vec<common::MavMessage> {
            self.sent.lock().expect("sent lock").clone()
        }
    }

    impl MavConnection<common::MavMessage> for MockConnection {
        fn recv(&self) -> Result<(MavHeader, common::MavMessage), MessageReadError> {
            self.try_recv()
        }

        fn recv_raw(&self) -> Result<MAVLinkMessageRaw, MessageReadError> {
            Err(MessageReadError::Io(std::io::ErrorKind::WouldBlock.into()))
        }

        fn try_recv(&self) -> Result<(MavHeader, common::MavMessage), MessageReadError> {
            if let Some(message) = self.incoming.lock().expect("incoming lock").pop_front() {
                Ok(message)
            } else {
                Err(MessageReadError::Io(std::io::ErrorKind::WouldBlock.into()))
            }
        }

        fn send(
            &self,
            _header: &MavHeader,
            data: &common::MavMessage,
        ) -> Result<usize, MessageWriteError> {
            self.sent.lock().expect("sent lock").push(data.clone());
            Ok(1)
        }

        fn set_protocol_version(&mut self, version: MavlinkVersion) {
            *self.protocol_version.lock().expect("protocol lock") = version;
        }

        fn protocol_version(&self) -> MavlinkVersion {
            *self.protocol_version.lock().expect("protocol lock")
        }

        fn set_allow_recv_any_version(&mut self, allow: bool) {
            *self.allow_any.lock().expect("allow lock") = allow;
        }

        fn allow_recv_any_version(&self) -> bool {
            *self.allow_any.lock().expect("allow lock")
        }

        fn send_frame(
            &self,
            frame: &MavFrame<common::MavMessage>,
        ) -> Result<usize, MessageWriteError> {
            self.send(&frame.header, &frame.msg)
        }
    }

    fn sample_item(seq: u16) -> MissionItem {
        MissionItem {
            seq,
            command: 16,
            frame: MissionFrame::GlobalRelativeAltInt,
            current: seq == 0,
            autocontinue: true,
            param1: 0.0,
            param2: 0.0,
            param3: 0.0,
            param4: 0.0,
            x: 473_977_420,
            y: 85_455_970,
            z: 25.0,
        }
    }

    fn accepted_ack(mission_type: MissionType) -> common::MavMessage {
        common::MavMessage::MISSION_ACK(common::MISSION_ACK_DATA {
            target_system: 255,
            target_component: 190,
            mavtype: common::MavMissionResult::MAV_MISSION_ACCEPTED,
            mission_type: to_mav_mission_type(mission_type),
            opaque_id: 0,
        })
    }

    fn mission_item_int(seq: u16, mission_type: MissionType) -> common::MavMessage {
        common::MavMessage::MISSION_ITEM_INT(common::MISSION_ITEM_INT_DATA {
            param1: 0.0,
            param2: 0.0,
            param3: 0.0,
            param4: 0.0,
            x: 473_977_420,
            y: 85_455_970,
            z: 30.0,
            seq,
            command: common::MavCmd::MAV_CMD_NAV_WAYPOINT,
            target_system: 255,
            target_component: 190,
            frame: common::MavFrame::MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
            current: 0,
            autocontinue: 1,
            mission_type: to_mav_mission_type(mission_type),
        })
    }

    fn base_inputs() -> (TelemetryAggregate, Option<VehicleTarget>, Arc<AtomicBool>) {
        (
            TelemetryAggregate::default(),
            Some(VehicleTarget {
                system_id: 1,
                component_id: 1,
            }),
            Arc::new(AtomicBool::new(false)),
        )
    }

    #[test]
    fn upload_ignores_duplicate_request_progress() {
        let messages = vec![
            common::MavMessage::MISSION_REQUEST_INT(common::MISSION_REQUEST_INT_DATA {
                seq: 0,
                target_system: 255,
                target_component: 190,
                mission_type: common::MavMissionType::MAV_MISSION_TYPE_MISSION,
            }),
            common::MavMessage::MISSION_REQUEST_INT(common::MISSION_REQUEST_INT_DATA {
                seq: 0,
                target_system: 255,
                target_component: 190,
                mission_type: common::MavMissionType::MAV_MISSION_TYPE_MISSION,
            }),
            common::MavMessage::MISSION_REQUEST_INT(common::MISSION_REQUEST_INT_DATA {
                seq: 1,
                target_system: 255,
                target_component: 190,
                mission_type: common::MavMissionType::MAV_MISSION_TYPE_MISSION,
            }),
            accepted_ack(MissionType::Mission),
        ];
        let mut connection = MockConnection::new(messages);
        let plan = MissionPlan {
            mission_type: MissionType::Mission,
            items: vec![sample_item(0), sample_item(1)],
        };
        let (mut aggregate, mut vehicle_target, stop_flag) = base_inputs();
        let (event_tx, event_rx) = mpsc::channel();

        let result = mission_upload_internal(
            "session-1",
            &event_tx,
            &mut connection,
            &mut aggregate,
            &mut vehicle_target,
            &stop_flag,
            plan,
        );

        assert!(result.is_ok());

        let progress_events: Vec<TransferProgress> = event_rx
            .try_iter()
            .filter_map(|event| match event {
                CoreEvent::MissionProgress(progress) => Some(progress),
                _ => None,
            })
            .collect();

        let max_completed = progress_events
            .iter()
            .map(|progress| progress.completed_items)
            .max()
            .unwrap_or(0);
        assert_eq!(max_completed, 2);

        let sent_count = connection
            .sent_messages()
            .into_iter()
            .filter(|message| matches!(message, common::MavMessage::MISSION_ITEM_INT(_)))
            .count();
        assert_eq!(sent_count, 3);
    }

    #[test]
    fn download_success_requests_each_item() {
        let messages = vec![
            common::MavMessage::MISSION_COUNT(common::MISSION_COUNT_DATA {
                count: 2,
                target_system: 255,
                target_component: 190,
                mission_type: common::MavMissionType::MAV_MISSION_TYPE_MISSION,
                opaque_id: 0,
            }),
            mission_item_int(0, MissionType::Mission),
            mission_item_int(1, MissionType::Mission),
            accepted_ack(MissionType::Mission),
        ];
        let mut connection = MockConnection::new(messages);
        let (mut aggregate, mut vehicle_target, stop_flag) = base_inputs();
        let (event_tx, _event_rx) = mpsc::channel();

        let downloaded = mission_download_internal(
            "session-1",
            &event_tx,
            &mut connection,
            &mut aggregate,
            &mut vehicle_target,
            &stop_flag,
            MissionType::Mission,
        )
        .expect("download should succeed");

        assert_eq!(downloaded.items.len(), 2);

        let sent = connection.sent_messages();
        assert!(matches!(
            sent.first(),
            Some(common::MavMessage::MISSION_REQUEST_LIST(_))
        ));
        let request_items = sent
            .iter()
            .filter(|message| matches!(message, common::MavMessage::MISSION_REQUEST_INT(_)))
            .count();
        assert_eq!(request_items, 2);
    }

    #[test]
    fn clear_success_sends_clear_all() {
        let mut connection = MockConnection::new(vec![accepted_ack(MissionType::Mission)]);
        let (mut aggregate, mut vehicle_target, stop_flag) = base_inputs();
        let (event_tx, _event_rx) = mpsc::channel();

        let result = mission_clear_internal(
            "session-1",
            &event_tx,
            &mut connection,
            &mut aggregate,
            &mut vehicle_target,
            &stop_flag,
            MissionType::Mission,
        );
        assert!(result.is_ok());

        let sent = connection.sent_messages();
        assert!(sent
            .iter()
            .any(|message| matches!(message, common::MavMessage::MISSION_CLEAR_ALL(_))));
    }

    #[test]
    fn download_supports_non_mission_types() {
        let messages = vec![
            common::MavMessage::MISSION_COUNT(common::MISSION_COUNT_DATA {
                count: 1,
                target_system: 255,
                target_component: 190,
                mission_type: common::MavMissionType::MAV_MISSION_TYPE_FENCE,
                opaque_id: 0,
            }),
            mission_item_int(0, MissionType::Fence),
            accepted_ack(MissionType::Fence),
        ];
        let mut connection = MockConnection::new(messages);
        let (mut aggregate, mut vehicle_target, stop_flag) = base_inputs();
        let (event_tx, _event_rx) = mpsc::channel();

        let downloaded = mission_download_internal(
            "session-1",
            &event_tx,
            &mut connection,
            &mut aggregate,
            &mut vehicle_target,
            &stop_flag,
            MissionType::Fence,
        )
        .expect("fence download should succeed");

        assert_eq!(downloaded.mission_type, MissionType::Fence);
        assert_eq!(downloaded.items.len(), 1);
    }

    #[test]
    fn download_timeout_exhaustion_returns_transfer_timeout() {
        let mut connection = MockConnection::new(vec![common::MavMessage::MISSION_COUNT(
            common::MISSION_COUNT_DATA {
                count: 1,
                target_system: 255,
                target_component: 190,
                mission_type: common::MavMissionType::MAV_MISSION_TYPE_MISSION,
                opaque_id: 0,
            },
        )]);
        let (mut aggregate, mut vehicle_target, stop_flag) = base_inputs();
        let (event_tx, event_rx) = mpsc::channel();

        let result = mission_download_internal(
            "session-1",
            &event_tx,
            &mut connection,
            &mut aggregate,
            &mut vehicle_target,
            &stop_flag,
            MissionType::Mission,
        );

        assert!(result.is_err());
        let message = result.expect_err("timeout expected");
        assert!(message.contains("transfer.timeout"));

        let mission_errors: Vec<TransferError> = event_rx
            .try_iter()
            .filter_map(|event| match event {
                CoreEvent::MissionError(error) => Some(error),
                _ => None,
            })
            .collect();
        assert!(mission_errors
            .iter()
            .any(|error| error.code == "transfer.timeout"));
    }
}
