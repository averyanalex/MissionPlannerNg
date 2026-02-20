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

export type MissionPlan = {
  mission_type: MissionType;
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

export async function validateMissionPlan(plan: MissionPlan): Promise<MissionIssue[]> {
  return invoke<MissionIssue[]>("mission_validate_plan", { plan });
}

export async function simulateMissionUpload(plan: MissionPlan): Promise<void> {
  await invoke("mission_simulate_upload", { plan });
}

export async function simulateMissionDownload(missionType: MissionType): Promise<MissionPlan> {
  return invoke<MissionPlan>("mission_simulate_download", { missionType });
}

export async function simulateMissionClear(missionType: MissionType): Promise<void> {
  await invoke("mission_simulate_clear", { missionType });
}

export async function verifyMissionRoundtrip(plan: MissionPlan): Promise<boolean> {
  return invoke<boolean>("mission_verify_roundtrip", { plan });
}

export async function subscribeMissionProgress(cb: (event: TransferProgress) => void): Promise<UnlistenFn> {
  return listen<TransferProgress>("mission.progress", (event) => cb(event.payload));
}

export async function subscribeMissionError(cb: (event: TransferError) => void): Promise<UnlistenFn> {
  return listen<TransferError>("mission.error", (event) => cb(event.payload));
}
