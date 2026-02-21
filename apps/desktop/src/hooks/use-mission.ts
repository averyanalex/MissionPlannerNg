import { useEffect, useState, useCallback } from "react";
import {
  cancelMissionTransfer,
  clearMissionPlan,
  downloadMissionPlan,
  subscribeMissionState,
  setCurrentMissionItem,
  subscribeMissionProgress,
  uploadMissionPlan,
  validateMissionPlan,
  verifyMissionRoundtrip,
  type HomePosition,
  type MissionState,
  type MissionIssue,
  type MissionItem,
  type MissionPlan,
  type MissionType,
  type TransferProgress,
} from "../mission";
import type { Telemetry } from "../telemetry";
import { toast } from "sonner";

function asErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "unexpected error";
}

type HomeSource = "vehicle" | "user" | "download" | null;

function createWaypoint(seq: number, latDeg: number, lonDeg: number, altitudeM: number): MissionItem {
  return {
    seq,
    command: 16,
    frame: "global_relative_alt_int",
    current: seq === 0,
    autocontinue: true,
    param1: 0,
    param2: 1,
    param3: 0,
    param4: 0,
    x: Math.round(latDeg * 1e7),
    y: Math.round(lonDeg * 1e7),
    z: altitudeM,
  };
}

function resequence(items: MissionItem[]): MissionItem[] {
  return items.map((item, index) => ({ ...item, seq: index, current: index === 0 }));
}

export function useMission(connected: boolean, telemetry: Telemetry, vehicleHomePosition: HomePosition | null) {
  const [items, setItems] = useState<MissionItem[]>([]);
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const [missionType, setMissionType] = useState<MissionType>("mission");
  const [homePosition, setHomePosition] = useState<HomePosition | null>(null);
  const [homeSource, setHomeSource] = useState<HomeSource>(null);
  const [homeLatInput, setHomeLatInput] = useState("");
  const [homeLonInput, setHomeLonInput] = useState("");
  const [homeAltInput, setHomeAltInput] = useState("");
  const [issues, setIssues] = useState<MissionIssue[]>([]);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [missionState, setMissionState] = useState<MissionState | null>(null);
  const [roundtripStatus, setRoundtripStatus] = useState<string>("");

  const transferActive =
    progress?.phase === "request_count" ||
    progress?.phase === "transfer_items" ||
    progress?.phase === "await_ack";

  // Sync home position from vehicle (unless user has set a custom one)
  useEffect(() => {
    if (vehicleHomePosition && homeSource !== "user") {
      setHomePosition(vehicleHomePosition);
      setHomeLatInput(vehicleHomePosition.latitude_deg.toFixed(6));
      setHomeLonInput(vehicleHomePosition.longitude_deg.toFixed(6));
      setHomeAltInput(vehicleHomePosition.altitude_m.toFixed(2));
      setHomeSource("vehicle");
    }
  }, [vehicleHomePosition]);

  // Subscribe to mission progress + state events
  useEffect(() => {
    let stopProgress: (() => void) | null = null;
    let stopState: (() => void) | null = null;

    (async () => {
      stopProgress = await subscribeMissionProgress(setProgress);
      stopState = await subscribeMissionState(setMissionState);
    })();

    return () => {
      stopProgress?.();
      stopState?.();
    };
  }, []);

  function buildPlan(): MissionPlan {
    return {
      mission_type: missionType,
      home: missionType === "mission" ? homePosition : null,
      items: resequence(items),
    };
  }

  const addWaypoint = useCallback(() => {
    setItems((prev) => {
      const seq = prev.length;
      const base = prev[prev.length - 1];
      if (!base) return [createWaypoint(0, 0, 0, 25)];
      return [...prev, createWaypoint(seq, base.x / 1e7 + 0.0004, base.y / 1e7 + 0.0004, base.z)];
    });
    setSelectedSeq(items.length);
  }, [items.length]);

  const addWaypointAt = useCallback(
    (latDeg: number, lonDeg: number) => {
      setItems((prev) => {
        const alt = prev[prev.length - 1]?.z ?? 25;
        return [...prev, createWaypoint(prev.length, latDeg, lonDeg, alt)];
      });
      setSelectedSeq(items.length);
    },
    [items.length]
  );

  const insertBefore = useCallback(
    (index: number) => {
      setItems((prev) => {
        if (prev.length === 0) return [createWaypoint(0, 0, 0, 25)];
        const insertAt = Math.max(0, Math.min(index, prev.length));
        const before = prev[insertAt - 1];
        const after = prev[insertAt];
        const seed = before ?? after;
        if (!seed) return [createWaypoint(0, 0, 0, 25)];

        let lat = seed.x / 1e7, lon = seed.y / 1e7, alt = seed.z;
        if (before && after) {
          lat = (before.x + after.x) / 2 / 1e7;
          lon = (before.y + after.y) / 2 / 1e7;
          alt = (before.z + after.z) / 2;
        } else if (before) {
          lat += 0.0004;
          lon += 0.0004;
        } else {
          lat -= 0.0004;
          lon -= 0.0004;
        }

        const next = [...prev];
        next.splice(insertAt, 0, createWaypoint(0, lat, lon, alt));
        return resequence(next);
      });
      setSelectedSeq(index);
    },
    []
  );

  const insertAfter = useCallback(
    (index: number) => {
      insertBefore(index + 1);
    },
    [insertBefore]
  );

  const deleteAt = useCallback(
    (index: number) => {
      setItems((prev) => {
        if (index < 0 || index >= prev.length) return prev;
        const next = [...prev];
        next.splice(index, 1);
        return resequence(next);
      });
      setSelectedSeq((current) => {
        if (current === null) return null;
        const newLen = Math.max(0, items.length - 1);
        if (newLen === 0) return null;
        return Math.min(current, newLen - 1);
      });
    },
    [items.length]
  );

  const moveUp = useCallback(
    (index: number) => {
      if (index <= 0) return;
      setItems((prev) => {
        const next = [...prev];
        const [moved] = next.splice(index, 1);
        if (!moved) return prev;
        next.splice(index - 1, 0, moved);
        return resequence(next);
      });
      setSelectedSeq(index - 1);
    },
    []
  );

  const moveDown = useCallback(
    (index: number) => {
      setItems((prev) => {
        if (index >= prev.length - 1) return prev;
        const next = [...prev];
        const [moved] = next.splice(index, 1);
        if (!moved) return prev;
        next.splice(index + 1, 0, moved);
        return resequence(next);
      });
      setSelectedSeq(index + 1);
    },
    []
  );

  const updateField = useCallback(
    (index: number, field: "command" | "z" | "param1" | "param2", value: number) => {
      setItems((prev) =>
        prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
      );
    },
    []
  );

  const updateCoordinate = useCallback(
    (index: number, field: "x" | "y", valueDeg: number) => {
      const encoded = Math.round(valueDeg * 1e7);
      setItems((prev) =>
        prev.map((item, i) => (i === index ? { ...item, [field]: encoded } : item))
      );
    },
    []
  );

  const moveWaypointOnMap = useCallback(
    (seq: number, latDeg: number, lonDeg: number) => {
      setItems((prev) =>
        prev.map((item) =>
          item.seq === seq
            ? { ...item, x: Math.round(latDeg * 1e7), y: Math.round(lonDeg * 1e7) }
            : item
        )
      );
    },
    []
  );

  const validate = useCallback(async () => {
    try {
      const result = await validateMissionPlan(buildPlan());
      setIssues(result);
      if (result.length === 0) toast.success("Plan valid");
    } catch (err) {
      toast.error("Validation failed", { description: asErrorMessage(err) });
    }
  }, [missionType, homePosition, items]);

  const upload = useCallback(async () => {
    if (!connected) { toast.error("Connect to vehicle before upload"); return; }
    setProgress(null);
    try {
      await uploadMissionPlan(buildPlan());
      toast.success("Mission uploaded", { description: `${items.length} waypoints` });
    } catch (err) {
      toast.error("Upload failed", { description: asErrorMessage(err) });
    }
  }, [connected, missionType, homePosition, items]);

  const download = useCallback(async () => {
    if (!connected) { toast.error("Connect to vehicle before download"); return; }
    setProgress(null);
    try {
      const plan = await downloadMissionPlan(missionType);
      setItems(plan.items);
      if (plan.home) {
        setHomePosition(plan.home);
        setHomeLatInput(plan.home.latitude_deg.toFixed(6));
        setHomeLonInput(plan.home.longitude_deg.toFixed(6));
        setHomeAltInput(plan.home.altitude_m.toFixed(2));
        setHomeSource("download");
      }
      setSelectedSeq(null);
      setIssues([]);
      setRoundtripStatus("Downloaded");
      toast.success("Mission downloaded", { description: `${plan.items.length} waypoints` });
    } catch (err) {
      toast.error("Download failed", { description: asErrorMessage(err) });
    }
  }, [connected, missionType]);

  const clear = useCallback(async () => {
    if (!connected) { toast.error("Connect to vehicle before clear"); return; }
    setProgress(null);
    try {
      await clearMissionPlan(missionType);
      setItems([]);
      setHomePosition(null);
      setHomeSource(null);
      setHomeLatInput("");
      setHomeLonInput("");
      setHomeAltInput("");
      setSelectedSeq(null);
      setIssues([]);
      setRoundtripStatus("Cleared");
      toast.success("Mission cleared");
    } catch (err) {
      toast.error("Clear failed", { description: asErrorMessage(err) });
    }
  }, [connected, missionType]);

  const verify = useCallback(async () => {
    if (!connected) { toast.error("Connect to vehicle before verify"); return; }
    setProgress(null);
    setRoundtripStatus("Verifying...");
    try {
      const ok = await verifyMissionRoundtrip(buildPlan());
      setRoundtripStatus(ok ? "Roundtrip: pass" : "Roundtrip: fail");
      if (ok) toast.success("Roundtrip verified");
      else toast.warning("Roundtrip mismatch");
    } catch (err) {
      setRoundtripStatus("Verify failed");
      toast.error("Verify failed", { description: asErrorMessage(err) });
    }
  }, [connected, missionType, homePosition, items]);

  const cancel = useCallback(async () => {
    if (!connected) return;
    try {
      await cancelMissionTransfer();
    } catch (err) {
      toast.error("Cancel failed", { description: asErrorMessage(err) });
    }
  }, [connected]);

  const setCurrent = useCallback(async () => {
    if (!connected) { toast.error("Connect first"); return; }
    if (selectedSeq === null) { toast.error("Select a waypoint first"); return; }
    try {
      await setCurrentMissionItem(selectedSeq);
    } catch (err) {
      toast.error("Set current failed", { description: asErrorMessage(err) });
    }
  }, [connected, selectedSeq]);

  const updateHomeFromVehicle = useCallback(() => {
    if (missionType !== "mission") return;
    const lat = telemetry.latitude_deg;
    const lon = telemetry.longitude_deg;
    if (typeof lat !== "number" || typeof lon !== "number" || Number.isNaN(lat) || Number.isNaN(lon)) {
      toast.error("Vehicle position unavailable");
      return;
    }
    const altitude = typeof telemetry.altitude_m === "number" && !Number.isNaN(telemetry.altitude_m) ? telemetry.altitude_m : 0;
    setHomePosition({ latitude_deg: lat, longitude_deg: lon, altitude_m: altitude });
    setHomeSource("vehicle");
    setHomeLatInput(lat.toFixed(6));
    setHomeLonInput(lon.toFixed(6));
    setHomeAltInput(altitude.toFixed(2));
  }, [missionType, telemetry]);

  const setArbitraryHome = useCallback(() => {
    if (missionType !== "mission") return;
    const lat = Number(homeLatInput);
    const lon = Number(homeLonInput);
    const alt = Number(homeAltInput || "0");
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(alt)) {
      toast.error("Home inputs must be valid numbers");
      return;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      toast.error("Home coordinates out of range");
      return;
    }
    setHomePosition({ latitude_deg: lat, longitude_deg: lon, altitude_m: alt });
    setHomeSource("user");
  }, [missionType, homeLatInput, homeLonInput, homeAltInput]);

  const setHomeFromMap = useCallback(
    (latDeg: number, lonDeg: number) => {
      if (missionType !== "mission") return;
      const alt = homePosition?.altitude_m ?? 0;
      setHomePosition({ latitude_deg: latDeg, longitude_deg: lonDeg, altitude_m: alt });
      setHomeSource("user");
      setHomeLatInput(latDeg.toFixed(6));
      setHomeLonInput(lonDeg.toFixed(6));
      setHomeAltInput(alt.toFixed(2));
    },
    [missionType, homePosition?.altitude_m]
  );

  return {
    items,
    selectedSeq,
    setSelectedSeq,
    missionType,
    setMissionType,
    homePosition,
    homeSource,
    homeLatInput, setHomeLatInput,
    homeLonInput, setHomeLonInput,
    homeAltInput, setHomeAltInput,
    issues,
    progress,
    transferActive,
    missionState,
    roundtripStatus,
    // Actions
    addWaypoint,
    addWaypointAt,
    insertBefore,
    insertAfter,
    deleteAt,
    moveUp,
    moveDown,
    updateField,
    updateCoordinate,
    moveWaypointOnMap,
    validate,
    upload,
    download,
    clear,
    verify,
    cancel,
    setCurrent,
    updateHomeFromVehicle,
    setArbitraryHome,
    setHomeFromMap,
  };
}
