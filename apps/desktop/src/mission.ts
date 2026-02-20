import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type MissionType = "mission" | "fence" | "rally";

export type MissionFrame =
  | "mission"
  | "global_int"
  | "global_relative_alt_int"
  | "global_terrain_alt_int"
  | "local_ned"
  | "other";

export type MissionItem = {
  seq: number;
  command: number;
  frame: MissionFrame;
  current: boolean;
  autocontinue: boolean;
  param1: number;
  param2: number;
  param3: number;
  param4: number;
  x: number;
  y: number;
  z: number;
};

export type HomePosition = {
  latitude_deg: number;
  longitude_deg: number;
  altitude_m: number;
};

export type MissionPlan = {
  mission_type: MissionType;
  home: HomePosition | null;
  items: MissionItem[];
};

export type MissionIssue = {
  code: string;
  message: string;
  seq?: number;
  severity: "error" | "warning";
};

export type TransferDirection = "upload" | "download";
export type TransferPhase =
  | "idle"
  | "request_count"
  | "transfer_items"
  | "await_ack"
  | "completed"
  | "failed"
  | "cancelled";

export type TransferProgress = {
  direction: TransferDirection;
  mission_type: MissionType;
  phase: TransferPhase;
  completed_items: number;
  total_items: number;
  retries_used: number;
};

export type TransferError = {
  code: string;
  message: string;
};

export type MissionState = {
  session_id: string;
  current_seq: number;
  total_items: number;
  mission_state: string;
  mission_mode: number;
  mission_id: number;
  fence_id: number;
  rally_points_id: number;
};

export async function validateMissionPlan(plan: MissionPlan): Promise<MissionIssue[]> {
  return invoke<MissionIssue[]>("mission_validate_plan", { plan });
}

export async function uploadMissionPlan(sessionId: string, plan: MissionPlan): Promise<void> {
  await invoke("mission_upload_plan", { sessionId, plan });
}

export async function downloadMissionPlan(sessionId: string, missionType: MissionType): Promise<MissionPlan> {
  return invoke<MissionPlan>("mission_download_plan", { sessionId, missionType });
}

export async function clearMissionPlan(sessionId: string, missionType: MissionType): Promise<void> {
  await invoke("mission_clear_plan", { sessionId, missionType });
}

export async function verifyMissionRoundtrip(sessionId: string, plan: MissionPlan): Promise<boolean> {
  return invoke<boolean>("mission_verify_roundtrip", { sessionId, plan });
}

export async function setCurrentMissionItem(sessionId: string, seq: number): Promise<void> {
  await invoke("mission_set_current", { sessionId, seq });
}

export async function subscribeMissionProgress(cb: (event: TransferProgress) => void): Promise<UnlistenFn> {
  return listen<TransferProgress>("mission.progress", (event) => cb(event.payload));
}

export async function subscribeMissionError(cb: (event: TransferError) => void): Promise<UnlistenFn> {
  return listen<TransferError>("mission.error", (event) => cb(event.payload));
}

export async function subscribeMissionState(cb: (event: MissionState) => void): Promise<UnlistenFn> {
  return listen<MissionState>("mission.state", (event) => cb(event.payload));
}
