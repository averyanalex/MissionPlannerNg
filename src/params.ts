import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type ParamType = "uint8" | "int8" | "uint16" | "int16" | "uint32" | "int32" | "real32";

export type Param = {
  name: string;
  value: number;
  param_type: ParamType;
  index: number;
};

export type ParamStore = {
  params: Record<string, Param>;
  expected_count: number;
};

export type ParamTransferPhase = "idle" | "downloading" | "completed" | "failed";

export type ParamProgress = {
  phase: ParamTransferPhase;
  received: number;
  expected: number;
};

export async function downloadAllParams(): Promise<ParamStore> {
  return invoke<ParamStore>("param_download_all");
}

export async function writeParam(name: string, value: number): Promise<Param> {
  return invoke<Param>("param_write", { name, value });
}

export async function parseParamFile(contents: string): Promise<Record<string, number>> {
  return invoke<Record<string, number>>("param_parse_file", { contents });
}

export async function formatParamFile(store: ParamStore): Promise<string> {
  return invoke<string>("param_format_file", { store });
}

export async function subscribeParamStore(cb: (store: ParamStore) => void): Promise<UnlistenFn> {
  return listen<ParamStore>("param://store", (event) => cb(event.payload));
}

export async function subscribeParamProgress(cb: (progress: ParamProgress) => void): Promise<UnlistenFn> {
  return listen<ParamProgress>("param://progress", (event) => cb(event.payload));
}
