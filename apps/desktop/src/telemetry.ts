import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type LinkEndpoint =
  | { kind: "udp"; bind_addr: string }
  | { kind: "serial"; port: string; baud: number };

export type ConnectRequest = {
  endpoint: LinkEndpoint;
};

export type ConnectResponse = {
  session_id: string;
};

export type LinkStatus = "connecting" | "connected" | "disconnected" | "error";

export type LinkStateEvent = {
  session_id: string;
  status: LinkStatus;
  detail?: string;
};

export type Telemetry = {
  session_id: string;
  ts: number;
  altitude_m?: number;
  speed_mps?: number;
  fuel_pct?: number;
  heading_deg?: number;
  fix_type?: number;
  latitude_deg?: number;
  longitude_deg?: number;
};

export async function connectLink(request: ConnectRequest): Promise<ConnectResponse> {
  return invoke<ConnectResponse>("connect_link", { request });
}

export async function disconnectLink(sessionId: string): Promise<void> {
  await invoke("disconnect_link", { sessionId });
}

export async function listSerialPorts(): Promise<string[]> {
  return invoke<string[]>("list_serial_ports_cmd");
}

export async function subscribeTelemetry(cb: (telemetry: Telemetry) => void): Promise<UnlistenFn> {
  return listen<Telemetry>("telemetry://tick", (event) => cb(event.payload));
}

export async function subscribeLinkState(cb: (event: LinkStateEvent) => void): Promise<UnlistenFn> {
  return listen<LinkStateEvent>("link://state", (event) => cb(event.payload));
}

export type HomePositionEvent = {
  session_id: string;
  latitude_deg: number;
  longitude_deg: number;
  altitude_m: number;
};

export async function subscribeHomePosition(cb: (event: HomePositionEvent) => void): Promise<UnlistenFn> {
  return listen<HomePositionEvent>("home://position", (event) => cb(event.payload));
}
