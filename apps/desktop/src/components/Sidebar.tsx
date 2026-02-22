import {
  Plane, Radio, Battery, Gauge, Compass, Navigation, Satellite,
  ArrowUp, RotateCcw, CircleDot, RefreshCw, Plug, Unplug, Loader2, X,
} from "lucide-react";
import { Button } from "./ui/button";
import { ArmSlider } from "./ArmSlider";
import { cn } from "../lib/utils";
import type { useVehicle } from "../hooks/use-vehicle";

type SidebarProps = {
  vehicle: ReturnType<typeof useVehicle>;
  isMobile: boolean;
  open: boolean;
  onClose: () => void;
};

function formatMaybe(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return value.toFixed(1);
}

export function Sidebar({ vehicle, isMobile, open, onClose }: SidebarProps) {
  // Mobile: drawer overlay
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        <div
          className={cn(
            "fixed inset-0 z-40 bg-black/50 transition-opacity duration-200",
            open ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          onClick={onClose}
        />
        {/* Drawer panel */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-72 flex-col gap-3 overflow-y-auto bg-bg-secondary px-3 pb-3 shadow-xl transition-transform duration-200",
            open ? "translate-x-0" : "-translate-x-full"
          )}
          style={{ paddingTop: "calc(var(--safe-area-top, 0px) + 0.75rem)" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-text-primary">Vehicle</span>
            <button onClick={onClose} className="rounded p-1 text-text-muted hover:text-text-primary">
              <X size={16} />
            </button>
          </div>
          <SidebarContent vehicle={vehicle} />
        </aside>
      </>
    );
  }

  // Desktop: static sidebar
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-bg-secondary p-3 xl:w-72">
      <SidebarContent vehicle={vehicle} />
    </aside>
  );
}

function SidebarContent({ vehicle }: { vehicle: ReturnType<typeof useVehicle> }) {
  const {
    telemetry, linkState, vehicleState, connected, connectionError,
    isConnecting, cancelConnect,
    connectionMode, setConnectionMode, udpBind, setUdpBind,
    serialPort, setSerialPort, baud, setBaud, serialPorts,
    takeoffAlt, setTakeoffAlt, availableModes,
    connect, disconnect, refreshSerialPorts,
    arm, disarm, setFlightMode, takeoff, findModeNumber,
  } = vehicle;

  const formLocked = isConnecting || connected;

  return (
    <>
      {/* Connection */}
      <section className="rounded-lg border border-border bg-bg-primary p-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
          <Radio className="h-3.5 w-3.5" /> Connection
        </h3>

        <div className="space-y-2">
          <select
            value={connectionMode}
            onChange={(e) => setConnectionMode(e.target.value as "udp" | "serial")}
            disabled={formLocked}
            className="w-full rounded-md border border-border bg-bg-input px-2.5 py-1.5 text-sm text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="udp">UDP</option>
            <option value="serial">Serial</option>
          </select>

          {connectionMode === "udp" ? (
            <input
              value={udpBind}
              onChange={(e) => setUdpBind(e.target.value)}
              placeholder="0.0.0.0:14550"
              disabled={formLocked}
              className="w-full rounded-md border border-border bg-bg-input px-2.5 py-1.5 text-sm text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
            />
          ) : (
            <>
              <div className="flex gap-1.5">
                <select
                  value={serialPort}
                  onChange={(e) => setSerialPort(e.target.value)}
                  disabled={formLocked}
                  className="flex-1 rounded-md border border-border bg-bg-input px-2.5 py-1.5 text-sm text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {serialPorts.length === 0 && <option value="">No ports</option>}
                  {serialPorts.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <Button variant="ghost" size="icon" onClick={refreshSerialPorts} disabled={formLocked}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
              <input
                type="number"
                value={baud}
                onChange={(e) => setBaud(Number(e.target.value) || 57600)}
                disabled={formLocked}
                className="w-full rounded-md border border-border bg-bg-input px-2.5 py-1.5 text-sm text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </>
          )}

          {isConnecting ? (
            <Button variant="secondary" size="sm" className="w-full" onClick={cancelConnect}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cancel
            </Button>
          ) : connected ? (
            <Button variant="secondary" size="sm" className="w-full" onClick={disconnect}>
              <Unplug className="h-3.5 w-3.5" /> Disconnect
            </Button>
          ) : (
            <Button size="sm" className="w-full" onClick={connect}>
              <Plug className="h-3.5 w-3.5" /> Connect
            </Button>
          )}

          {connectionError && (
            <p className="rounded-md bg-danger/10 px-2 py-1 text-xs text-danger">{connectionError}</p>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
          <div className={cn(
            "h-1.5 w-1.5 rounded-full",
            isConnecting ? "bg-warning animate-pulse" :
            connected ? "bg-success" :
            connectionError ? "bg-danger" :
            "bg-text-muted"
          )} />
          {isConnecting ? "Connecting..." :
           connected ? "Connected" :
           connectionError ? "Error" :
           "Idle"}
        </div>
      </section>

      {/* Vehicle Status */}
      <section className="rounded-lg border border-border bg-bg-primary p-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
          <Plane className="h-3.5 w-3.5" /> Vehicle
        </h3>

        <div className="grid grid-cols-2 gap-2">
          <StatusCard icon={<Plane className="h-3 w-3" />} label="State"
            value={vehicleState ? (vehicleState.armed ? "ARMED" : "DISARMED") : "--"}
            valueClass={vehicleState?.armed ? "text-danger" : ""}
          />
          <StatusCard icon={<Navigation className="h-3 w-3" />} label="Mode"
            value={vehicleState?.mode_name ?? "--"}
          />
          <StatusCard icon={<ArrowUp className="h-3 w-3" />} label="Alt"
            value={`${formatMaybe(telemetry.altitude_m)} m`}
          />
          <StatusCard icon={<Gauge className="h-3 w-3" />} label="Speed"
            value={`${formatMaybe(telemetry.speed_mps)} m/s`}
          />
          <StatusCard icon={<Battery className="h-3 w-3" />} label="Battery"
            value={`${formatMaybe(telemetry.battery_pct)}%`}
          />
          <StatusCard icon={<Compass className="h-3 w-3" />} label="Heading"
            value={`${formatMaybe(telemetry.heading_deg)}°`}
          />
        </div>

        <div className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
          <Satellite className="h-3 w-3" />
          GPS: {telemetry.gps_fix_type ?? "--"}
        </div>
      </section>

      {/* Flight Controls */}
      <section className="rounded-lg border border-border bg-bg-primary p-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
          <Navigation className="h-3.5 w-3.5" /> Controls
        </h3>

        <div className="space-y-2">
          <select
            value={vehicleState?.custom_mode ?? ""}
            onChange={(e) => setFlightMode(Number(e.target.value))}
            disabled={!connected || availableModes.length === 0}
            className="w-full rounded-md border border-border bg-bg-input px-2.5 py-1.5 text-sm text-text-primary disabled:opacity-50"
          >
            {availableModes.map((m) => (
              <option key={m.custom_mode} value={m.custom_mode}>{m.name}</option>
            ))}
          </select>

          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={takeoffAlt}
              onChange={(e) => setTakeoffAlt(e.target.value)}
              className="w-16 rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm text-text-primary"
            />
            <span className="text-xs text-text-muted">m</span>
            <Button variant="secondary" size="sm" className="flex-1" onClick={takeoff}
              disabled={!connected || !vehicleState?.armed || vehicleState?.mode_name?.toUpperCase() !== "GUIDED"}>
              Takeoff
            </Button>
          </div>
          {connected && vehicleState && (!vehicleState.armed || vehicleState.mode_name?.toUpperCase() !== "GUIDED") && (
            <p className="text-[10px] text-text-muted">
              {!vehicleState.armed ? "Arm vehicle" : "Switch to GUIDED"} to enable takeoff
            </p>
          )}

          <div className="flex gap-1.5">
            {findModeNumber("RTL") !== null && (
              <Button variant="secondary" size="sm" className="flex-1"
                onClick={() => setFlightMode(findModeNumber("RTL")!)} disabled={!connected}>
                <RotateCcw className="h-3 w-3" /> RTL
              </Button>
            )}
            {findModeNumber("LAND") !== null && (
              <Button variant="secondary" size="sm" className="flex-1"
                onClick={() => setFlightMode(findModeNumber("LAND")!)} disabled={!connected}>
                Land
              </Button>
            )}
            {findModeNumber("LOITER") !== null && (
              <Button variant="secondary" size="sm" className="flex-1"
                onClick={() => setFlightMode(findModeNumber("LOITER")!)} disabled={!connected}>
                <CircleDot className="h-3 w-3" /> Loiter
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Arm/Disarm */}
      <ArmSlider
        connected={connected}
        armed={vehicleState?.armed ?? false}
        onArm={(force) => arm(force)}
        onDisarm={(force) => disarm(force)}
      />
    </>
  );
}

function StatusCard({ icon, label, value, valueClass }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-md bg-bg-tertiary/50 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-muted">
        {icon} {label}
      </div>
      <div className={cn("mt-0.5 text-sm font-semibold transition-all duration-300", valueClass)}>
        {value}
      </div>
    </div>
  );
}
