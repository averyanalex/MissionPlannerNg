import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type LinkEndpoint =
  | { kind: "udp"; bind_addr: string }
  | { kind: "serial"; port: string; baud: number };

export type ConnectRequest = {
  endpoint: LinkEndpoint;
};

export type LinkState = "connecting" | "connected" | "disconnected" | { error: string };

export type Telemetry = {
  altitude_m?: number;
  speed_mps?: number;
  heading_deg?: number;
  latitude_deg?: number;
  longitude_deg?: number;
  battery_pct?: number;
  gps_fix_type?: string;
};

export type VehicleState = {
  armed: boolean;
  custom_mode: number;
  mode_name: string;
  system_status: string;
  vehicle_type: string;
  autopilot: string;
};

export type HomePosition = {
  latitude_deg: number;
  longitude_deg: number;
  altitude_m: number;
};

export type FlightModeEntry = {
  custom_mode: number;
  name: string;
};

export async function connectLink(request: ConnectRequest): Promise<void> {
  await invoke("connect_link", { request });
}

export async function disconnectLink(): Promise<void> {
  await invoke("disconnect_link");
}

export async function listSerialPorts(): Promise<string[]> {
  return invoke<string[]>("list_serial_ports_cmd");
}

export async function subscribeTelemetry(cb: (telemetry: Telemetry) => void): Promise<UnlistenFn> {
  return listen<Telemetry>("telemetry://tick", (event) => cb(event.payload));
}

export async function subscribeLinkState(cb: (state: LinkState) => void): Promise<UnlistenFn> {
  return listen<LinkState>("link://state", (event) => cb(event.payload));
}

export async function subscribeHomePosition(cb: (hp: HomePosition) => void): Promise<UnlistenFn> {
  return listen<HomePosition>("home://position", (event) => cb(event.payload));
}

export async function subscribeVehicleState(cb: (state: VehicleState) => void): Promise<UnlistenFn> {
  return listen<VehicleState>("vehicle://state", (event) => cb(event.payload));
}

export async function armVehicle(force: boolean): Promise<void> {
  await invoke("arm_vehicle", { force });
}

export async function disarmVehicle(force: boolean): Promise<void> {
  await invoke("disarm_vehicle", { force });
}

export async function setFlightMode(customMode: number): Promise<void> {
  await invoke("set_flight_mode", { customMode });
}

export async function vehicleTakeoff(altitudeM: number): Promise<void> {
  await invoke("vehicle_takeoff", { altitudeM });
}

export async function vehicleGuidedGoto(latDeg: number, lonDeg: number, altM: number): Promise<void> {
  await invoke("vehicle_guided_goto", { latDeg, lonDeg, altM });
}

export async function getAvailableModes(): Promise<FlightModeEntry[]> {
  return invoke<FlightModeEntry[]>("get_available_modes");
}
