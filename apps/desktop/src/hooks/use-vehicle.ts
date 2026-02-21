import { useEffect, useState, useCallback, useMemo } from "react";
import {
  armVehicle,
  connectLink,
  disarmVehicle,
  disconnectLink,
  getAvailableModes,
  listSerialPorts,
  setFlightMode,
  subscribeLinkState,
  subscribeHomePosition,
  subscribeTelemetry,
  subscribeVehicleState,
  vehicleGuidedGoto,
  vehicleTakeoff,
  type ConnectRequest,
  type FlightModeEntry,
  type LinkState,
  type Telemetry,
  type VehicleState,
} from "../telemetry";
import type { HomePosition } from "../mission";
import { toast } from "sonner";

function asErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "unexpected error";
}

export function useVehicle() {
  const [telemetry, setTelemetry] = useState<Telemetry>({});
  const [linkState, setLinkState] = useState<LinkState | null>(null);
  const [vehicleState, setVehicleState] = useState<VehicleState | null>(null);
  const [homePosition, setHomePosition] = useState<HomePosition | null>(null);
  const [availableModes, setAvailableModes] = useState<FlightModeEntry[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Connection form state
  const [mode, setMode] = useState<"udp" | "serial">("udp");
  const [udpBind, setUdpBind] = useState("0.0.0.0:14550");
  const [serialPort, setSerialPort] = useState("");
  const [baud, setBaud] = useState(57600);
  const [serialPorts, setSerialPorts] = useState<string[]>([]);
  const [takeoffAlt, setTakeoffAlt] = useState("10");
  const [followVehicle, setFollowVehicle] = useState(true);

  const connected = linkState === "connected";

  const vehiclePosition = useMemo(() => {
    if (
      telemetry.latitude_deg != null &&
      telemetry.longitude_deg != null &&
      isFinite(telemetry.latitude_deg) &&
      isFinite(telemetry.longitude_deg)
    ) {
      return {
        latitude_deg: telemetry.latitude_deg,
        longitude_deg: telemetry.longitude_deg,
        heading_deg: telemetry.heading_deg ?? 0,
      };
    }
    return null;
  }, [telemetry.latitude_deg, telemetry.longitude_deg, telemetry.heading_deg]);

  // Subscribe to telemetry events
  useEffect(() => {
    let stopTelemetry: (() => void) | null = null;
    let stopLinkState: (() => void) | null = null;
    let stopHome: (() => void) | null = null;
    let stopVehicleState: (() => void) | null = null;

    (async () => {
      stopTelemetry = await subscribeTelemetry(setTelemetry);
      stopLinkState = await subscribeLinkState(setLinkState);
      stopHome = await subscribeHomePosition(setHomePosition);
      stopVehicleState = await subscribeVehicleState(setVehicleState);
    })();

    return () => {
      stopTelemetry?.();
      stopLinkState?.();
      stopHome?.();
      stopVehicleState?.();
    };
  }, []);

  // Fetch available modes when connected
  useEffect(() => {
    if (connected && vehicleState) {
      getAvailableModes().then(setAvailableModes).catch(() => {});
    } else {
      setAvailableModes([]);
    }
  }, [connected, vehicleState?.autopilot, vehicleState?.vehicle_type]);

  const connect = useCallback(async () => {
    setConnectionError(null);
    const request: ConnectRequest =
      mode === "udp"
        ? { endpoint: { kind: "udp", bind_addr: udpBind } }
        : { endpoint: { kind: "serial", port: serialPort, baud } };
    try {
      await connectLink(request);
    } catch (err) {
      const msg = asErrorMessage(err);
      setConnectionError(msg);
      toast.error("Connection failed", { description: msg });
    }
  }, [mode, udpBind, serialPort, baud]);

  const disconnect = useCallback(async () => {
    try {
      await disconnectLink();
    } catch (err) {
      toast.error("Disconnect failed", { description: asErrorMessage(err) });
    }
  }, []);

  const refreshSerialPorts = useCallback(async () => {
    try {
      const ports = await listSerialPorts();
      setSerialPorts(ports);
      if (ports.length > 0 && serialPort === "") setSerialPort(ports[0]);
    } catch (err) {
      toast.error("Failed to list serial ports", { description: asErrorMessage(err) });
    }
  }, [serialPort]);

  const arm = useCallback(
    async (force = false) => {
      if (!connected) { toast.error("Connect first"); return; }
      try {
        await armVehicle(force);
        toast.success("Vehicle armed");
      } catch (err) {
        toast.error("Failed to arm", { description: asErrorMessage(err) });
      }
    },
    [connected]
  );

  const disarm = useCallback(
    async (force = false) => {
      if (!connected) { toast.error("Connect first"); return; }
      try {
        await disarmVehicle(force);
        toast.success("Vehicle disarmed");
      } catch (err) {
        toast.error("Failed to disarm", { description: asErrorMessage(err) });
      }
    },
    [connected]
  );

  const setModeCmd = useCallback(
    async (customMode: number) => {
      if (!connected) { toast.error("Connect first"); return; }
      try {
        await setFlightMode(customMode);
      } catch (err) {
        toast.error("Failed to set mode", { description: asErrorMessage(err) });
      }
    },
    [connected]
  );

  const takeoff = useCallback(async () => {
    if (!connected) { toast.error("Connect first"); return; }
    const alt = Number(takeoffAlt);
    if (!Number.isFinite(alt) || alt <= 0) { toast.error("Invalid takeoff altitude"); return; }
    try {
      await vehicleTakeoff(alt);
      toast.success(`Takeoff to ${alt}m`);
    } catch (err) {
      toast.error("Takeoff failed", { description: asErrorMessage(err) });
    }
  }, [connected, takeoffAlt]);

  const guidedGoto = useCallback(
    async (latDeg: number, lonDeg: number) => {
      if (!connected) { toast.error("Connect first"); return; }
      const alt = telemetry.altitude_m ?? 25;
      try {
        await vehicleGuidedGoto(latDeg, lonDeg, alt);
        toast.success("Flying to location");
      } catch (err) {
        toast.error("Guided goto failed", { description: asErrorMessage(err) });
      }
    },
    [connected, telemetry.altitude_m]
  );

  const findModeNumber = useCallback(
    (name: string): number | null => {
      const entry = availableModes.find((m) => m.name.toUpperCase() === name.toUpperCase());
      return entry?.custom_mode ?? null;
    },
    [availableModes]
  );

  return {
    telemetry,
    linkState,
    vehicleState,
    homePosition,
    vehiclePosition,
    availableModes,
    connected,
    connectionError,
    // Connection form
    connectionMode: mode, setConnectionMode: setMode,
    udpBind, setUdpBind,
    serialPort, setSerialPort,
    baud, setBaud,
    serialPorts,
    takeoffAlt, setTakeoffAlt,
    followVehicle, setFollowVehicle,
    // Actions
    connect,
    disconnect,
    refreshSerialPorts,
    arm,
    disarm,
    setFlightMode: setModeCmd,
    takeoff,
    guidedGoto,
    findModeNumber,
  };
}
