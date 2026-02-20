import { invoke } from "@tauri-apps/api/core";

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

export async function validateMissionPlan(plan: MissionPlan): Promise<MissionIssue[]> {
  return invoke<MissionIssue[]>("mission_validate_plan", { plan });
}
