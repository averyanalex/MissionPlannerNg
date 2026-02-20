use mp_mission_core::{
    normalize_for_compare, plans_equivalent, CompareTolerance, MissionFrame, MissionItem,
    MissionPlan, MissionType,
};
use mp_telemetry_core::{ConnectRequest, CoreEvent, LinkEndpoint, LinkManager, LinkStatus};
use std::sync::mpsc;
use std::time::{Duration, Instant};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);

#[test]
#[ignore = "requires ArduPilot SITL endpoint"]
fn sitl_roundtrip_mission_type_mission() {
    run_roundtrip_case(sample_plan_mission(MissionType::Mission));
}

#[test]
#[ignore = "requires ArduPilot SITL endpoint"]
fn sitl_roundtrip_mission_type_fence() {
    run_roundtrip_case(MissionPlan {
        mission_type: MissionType::Fence,
        items: Vec::new(),
    });
}

#[test]
#[ignore = "requires ArduPilot SITL endpoint"]
fn sitl_roundtrip_mission_type_rally() {
    run_roundtrip_case(MissionPlan {
        mission_type: MissionType::Rally,
        items: Vec::new(),
    });
}

fn run_roundtrip_case(plan: MissionPlan) {
    let bind_addr =
        std::env::var("MP_SITL_UDP_BIND").unwrap_or_else(|_| String::from("0.0.0.0:14550"));
    let (event_tx, event_rx) = mpsc::channel();
    let mut manager = LinkManager::new();

    let session = manager.connect(
        ConnectRequest {
            endpoint: LinkEndpoint::Udp { bind_addr },
        },
        event_tx,
    );

    wait_for_connected(&event_rx, &session.session_id);

    manager
        .mission_clear(&session.session_id, plan.mission_type)
        .unwrap_or_else(|err| {
            panic!(
                "failed to clear before upload for {:?}: {err}",
                plan.mission_type
            )
        });

    manager
        .mission_upload(&session.session_id, plan.clone())
        .unwrap_or_else(|err| panic!("failed to upload {:?} plan: {err}", plan.mission_type));

    let downloaded = manager
        .mission_download(&session.session_id, plan.mission_type)
        .unwrap_or_else(|err| panic!("failed to download {:?} plan: {err}", plan.mission_type));

    let expected = normalize_for_compare(&plan);
    let got = normalize_for_compare(&downloaded);
    assert!(
        plans_equivalent(&expected, &got, CompareTolerance::default()),
        "readback mismatch for {:?}: expected {:?}, got {:?}",
        plan.mission_type,
        expected,
        got
    );

    manager
        .mission_clear(&session.session_id, plan.mission_type)
        .unwrap_or_else(|err| {
            panic!(
                "failed to clear after roundtrip for {:?}: {err}",
                plan.mission_type
            )
        });

    manager.disconnect_all();
}

fn wait_for_connected(event_rx: &mpsc::Receiver<CoreEvent>, session_id: &str) {
    let deadline = Instant::now() + CONNECT_TIMEOUT;
    while Instant::now() < deadline {
        let remaining = deadline.saturating_duration_since(Instant::now());
        let event = event_rx
            .recv_timeout(remaining)
            .unwrap_or_else(|err| panic!("timed out waiting for link state: {err}"));

        if let CoreEvent::Link(link) = event {
            if link.session_id != session_id {
                continue;
            }

            if link.status == LinkStatus::Connected {
                return;
            }

            if link.status == LinkStatus::Error {
                panic!("SITL link error: {:?}", link.detail);
            }
        }
    }

    panic!("timed out waiting for SITL connection state");
}

fn sample_plan_mission(mission_type: MissionType) -> MissionPlan {
    MissionPlan {
        mission_type,
        items: vec![
            waypoint(0, 47.397742, 8.545594, 25.0),
            waypoint(1, 47.398100, 8.546100, 30.0),
            waypoint(2, 47.398450, 8.546500, 28.0),
        ],
    }
}

fn waypoint(seq: u16, lat: f64, lon: f64, alt: f32) -> MissionItem {
    MissionItem {
        seq,
        frame: MissionFrame::GlobalRelativeAltInt,
        command: 16,
        current: seq == 0,
        autocontinue: true,
        param1: 0.0,
        param2: 0.0,
        param3: 0.0,
        param4: 0.0,
        x: (lat * 1e7) as i32,
        y: (lon * 1e7) as i32,
        z: alt,
    }
}
