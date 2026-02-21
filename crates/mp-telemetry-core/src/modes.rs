use mavlink::common::{MavAutopilot, MavType};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VehicleClass {
    Copter,
    Plane,
    Rover,
    Unknown,
}

pub fn vehicle_class(vehicle_type: MavType) -> VehicleClass {
    match vehicle_type {
        MavType::MAV_TYPE_QUADROTOR
        | MavType::MAV_TYPE_HEXAROTOR
        | MavType::MAV_TYPE_OCTOROTOR
        | MavType::MAV_TYPE_TRICOPTER
        | MavType::MAV_TYPE_COAXIAL
        | MavType::MAV_TYPE_HELICOPTER => VehicleClass::Copter,
        MavType::MAV_TYPE_FIXED_WING => VehicleClass::Plane,
        MavType::MAV_TYPE_GROUND_ROVER => VehicleClass::Rover,
        _ => VehicleClass::Unknown,
    }
}

const COPTER_MODES: &[(u32, &str)] = &[
    (0, "STABILIZE"),
    (1, "ACRO"),
    (2, "ALT_HOLD"),
    (3, "AUTO"),
    (4, "GUIDED"),
    (5, "LOITER"),
    (6, "RTL"),
    (7, "CIRCLE"),
    (9, "LAND"),
    (11, "DRIFT"),
    (13, "SPORT"),
    (15, "AUTOTUNE"),
    (16, "POSHOLD"),
    (17, "BRAKE"),
    (18, "THROW"),
    (21, "SMART_RTL"),
];

const PLANE_MODES: &[(u32, &str)] = &[
    (0, "MANUAL"),
    (1, "CIRCLE"),
    (2, "STABILIZE"),
    (3, "TRAINING"),
    (4, "ACRO"),
    (5, "FLY_BY_WIRE_A"),
    (6, "FLY_BY_WIRE_B"),
    (7, "CRUISE"),
    (8, "AUTOTUNE"),
    (10, "AUTO"),
    (11, "RTL"),
    (12, "LOITER"),
    (15, "GUIDED"),
    (17, "QSTABILIZE"),
    (18, "QHOVER"),
    (19, "QLOITER"),
    (20, "QLAND"),
    (21, "QRTL"),
];

const ROVER_MODES: &[(u32, &str)] = &[
    (0, "MANUAL"),
    (1, "ACRO"),
    (3, "STEERING"),
    (4, "HOLD"),
    (5, "LOITER"),
    (6, "FOLLOW"),
    (7, "SIMPLE"),
    (10, "AUTO"),
    (11, "RTL"),
    (12, "SMART_RTL"),
    (15, "GUIDED"),
];

fn mode_table(autopilot: MavAutopilot, vehicle_type: MavType) -> &'static [(u32, &'static str)] {
    if !matches!(autopilot, MavAutopilot::MAV_AUTOPILOT_ARDUPILOTMEGA) {
        return &[];
    }
    match vehicle_class(vehicle_type) {
        VehicleClass::Copter | VehicleClass::Unknown => COPTER_MODES,
        VehicleClass::Plane => PLANE_MODES,
        VehicleClass::Rover => ROVER_MODES,
    }
}

pub fn mode_name(autopilot: MavAutopilot, vehicle_type: MavType, custom_mode: u32) -> String {
    if !matches!(autopilot, MavAutopilot::MAV_AUTOPILOT_ARDUPILOTMEGA) {
        return format!("MODE({custom_mode})");
    }
    let table = mode_table(autopilot, vehicle_type);
    for &(num, name) in table {
        if num == custom_mode {
            return name.to_string();
        }
    }
    format!("UNKNOWN({custom_mode})")
}

pub fn mode_number(autopilot: MavAutopilot, vehicle_type: MavType, name: &str) -> Option<u32> {
    let table = mode_table(autopilot, vehicle_type);
    let upper = name.to_uppercase();
    for &(num, mode_name) in table {
        if mode_name == upper {
            return Some(num);
        }
    }
    None
}

pub fn available_modes(autopilot: MavAutopilot, vehicle_type: MavType) -> Vec<(u32, String)> {
    mode_table(autopilot, vehicle_type)
        .iter()
        .map(|&(num, name)| (num, name.to_string()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copter_guided_name() {
        assert_eq!(
            mode_name(MavAutopilot::MAV_AUTOPILOT_ARDUPILOTMEGA, MavType::MAV_TYPE_QUADROTOR, 4),
            "GUIDED"
        );
    }

    #[test]
    fn copter_guided_number_case_insensitive() {
        assert_eq!(
            mode_number(MavAutopilot::MAV_AUTOPILOT_ARDUPILOTMEGA, MavType::MAV_TYPE_QUADROTOR, "guided"),
            Some(4)
        );
    }

    #[test]
    fn plane_rtl_name() {
        assert_eq!(
            mode_name(MavAutopilot::MAV_AUTOPILOT_ARDUPILOTMEGA, MavType::MAV_TYPE_FIXED_WING, 11),
            "RTL"
        );
    }

    #[test]
    fn unknown_mode_number() {
        assert_eq!(
            mode_name(MavAutopilot::MAV_AUTOPILOT_ARDUPILOTMEGA, MavType::MAV_TYPE_QUADROTOR, 999),
            "UNKNOWN(999)"
        );
    }

    #[test]
    fn available_modes_copter_length() {
        let modes = available_modes(MavAutopilot::MAV_AUTOPILOT_ARDUPILOTMEGA, MavType::MAV_TYPE_QUADROTOR);
        assert_eq!(modes.len(), COPTER_MODES.len());
    }

    #[test]
    fn non_ardupilot_returns_mode_n() {
        assert_eq!(
            mode_name(MavAutopilot::MAV_AUTOPILOT_GENERIC, MavType::MAV_TYPE_QUADROTOR, 4),
            "MODE(4)"
        );
    }

    #[test]
    fn non_ardupilot_available_modes_empty() {
        let modes = available_modes(MavAutopilot::MAV_AUTOPILOT_GENERIC, MavType::MAV_TYPE_QUADROTOR);
        assert!(modes.is_empty());
    }

    #[test]
    fn rover_guided_number() {
        assert_eq!(
            mode_number(MavAutopilot::MAV_AUTOPILOT_ARDUPILOTMEGA, MavType::MAV_TYPE_GROUND_ROVER, "GUIDED"),
            Some(15)
        );
    }
}
