import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type Telemetry = {
  ts: number;
  altitude_m: number;
  speed_mps: number;
  fuel_pct: number;
};

export async function getInitialTelemetry(): Promise<Telemetry> {
  return invoke<Telemetry>("get_mock_telemetry");
}

export async function subscribeTelemetry(cb: (telemetry: Telemetry) => void): Promise<UnlistenFn> {
  return listen<Telemetry>("telemetry://tick", (event) => cb(event.payload));
}
