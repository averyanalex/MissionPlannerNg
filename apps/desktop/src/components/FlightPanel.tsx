import { useState } from "react";
import { MissionMap } from "./MissionMap";
import type { useVehicle } from "../hooks/use-vehicle";
import type { useMission } from "../hooks/use-mission";

type FlightPanelProps = {
  vehicle: ReturnType<typeof useVehicle>;
  mission: ReturnType<typeof useMission>;
};

function fmt(value: number | undefined, decimals = 1): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return value.toFixed(decimals);
}

function fmtInt(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return Math.round(value).toString();
}

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-border-light bg-bg-tertiary/50 px-3 py-2">
      <span className="text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
      <span className="mt-0.5 text-base font-bold">
        {value}
        {unit && <span className="ml-0.5 text-xs font-normal text-text-muted">{unit}</span>}
      </span>
    </div>
  );
}

function SectionRow({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{title}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function ChannelBars({ label, values }: { label: string; values?: number[] }) {
  if (!values || values.length === 0) return <span className="text-xs text-text-muted">No data</span>;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {values.map((v, i) => {
        const pct = Math.max(0, Math.min(100, ((v - 1000) / 1000) * 100));
        return (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-5 text-right text-[10px] text-text-muted">
              {label}{i + 1}
            </span>
            <div className="h-2 w-16 overflow-hidden rounded-full bg-bg-secondary">
              <div className="h-full rounded-full bg-accent-blue" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-10 text-[10px] tabular-nums text-text-secondary">{v}</span>
          </div>
        );
      })}
    </div>
  );
}

export function FlightPanel({ vehicle, mission }: FlightPanelProps) {
  const { telemetry, vehicleState, vehiclePosition, followVehicle, setFollowVehicle, guidedGoto } = vehicle;
  const [showRcServos, setShowRcServos] = useState(false);

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Map */}
      <div className="relative min-h-0 flex-[3] overflow-hidden rounded-lg border border-border">
        <MissionMap
          missionItems={mission.items}
          homePosition={mission.missionType === "mission" ? mission.homePosition : null}
          selectedSeq={null}
          readOnly
          onRightClick={guidedGoto}
          vehiclePosition={vehiclePosition}
          currentMissionSeq={mission.missionState?.current_seq ?? null}
          followVehicle={followVehicle}
        />
        <button
          onClick={() => setFollowVehicle((v) => !v)}
          className="absolute bottom-3 left-3 z-10 rounded-md border border-border-light bg-bg-primary/85 px-3 py-1.5 text-xs font-medium text-text-primary backdrop-blur-sm transition-colors hover:bg-bg-tertiary"
        >
          {followVehicle ? "Following" : "Follow Vehicle"}
        </button>
      </div>

      {/* Telemetry groups */}
      <div className="flex min-h-0 flex-[2] flex-col gap-3 overflow-y-auto">
        {/* Row 1: Primary flight */}
        <SectionRow title="Flight">
          <Metric label="Mode" value={vehicleState?.mode_name ?? "--"} />
          <Metric
            label="Waypoint"
            value={
              mission.missionState
                ? `${mission.missionState.current_seq + 1} / ${mission.missionState.total_items}`
                : "--"
            }
          />
          <Metric label="Alt" value={fmt(telemetry.altitude_m)} unit="m" />
          <Metric label="Speed" value={fmt(telemetry.speed_mps)} unit="m/s" />
          <Metric label="V/S" value={fmt(telemetry.climb_rate_mps)} unit="m/s" />
          <Metric label="Heading" value={`${fmt(telemetry.heading_deg, 0)}°`} />
          <Metric label="Throttle" value={fmtInt(telemetry.throttle_pct)} unit="%" />
          <Metric label="Airspeed" value={fmt(telemetry.airspeed_mps)} unit="m/s" />
        </SectionRow>

        {/* Row 2: Navigation */}
        <SectionRow title="Navigation">
          <Metric label="WP Dist" value={fmt(telemetry.wp_dist_m, 0)} unit="m" />
          <Metric label="Nav Brg" value={`${fmt(telemetry.nav_bearing_deg, 0)}°`} />
          <Metric label="Tgt Brg" value={`${fmt(telemetry.target_bearing_deg, 0)}°`} />
          <Metric label="XTrack" value={fmt(telemetry.xtrack_error_m)} unit="m" />
        </SectionRow>

        {/* Row 3: Attitude */}
        <SectionRow title="Attitude">
          <Metric label="Roll" value={`${fmt(telemetry.roll_deg)}°`} />
          <Metric label="Pitch" value={`${fmt(telemetry.pitch_deg)}°`} />
          <Metric label="Yaw" value={`${fmt(telemetry.yaw_deg, 0)}°`} />
        </SectionRow>

        {/* Row 4: Battery & Power */}
        <SectionRow title="Battery & Power">
          <Metric label="Voltage" value={fmt(telemetry.battery_voltage_v, 2)} unit="V" />
          <Metric label="Current" value={fmt(telemetry.battery_current_a, 1)} unit="A" />
          <Metric label="Remaining" value={fmtInt(telemetry.battery_pct)} unit="%" />
          <Metric label="Energy" value={fmt(telemetry.energy_consumed_wh, 1)} unit="Wh" />
          <Metric
            label="Time Left"
            value={
              telemetry.battery_time_remaining_s != null
                ? `${Math.floor(telemetry.battery_time_remaining_s / 60)}m`
                : "--"
            }
          />
        </SectionRow>

        {/* Row 5: GPS & Terrain */}
        <SectionRow title="GPS & Terrain">
          <Metric label="Fix" value={telemetry.gps_fix_type ?? "--"} />
          <Metric label="Sats" value={telemetry.gps_satellites != null ? String(telemetry.gps_satellites) : "--"} />
          <Metric label="HDOP" value={fmt(telemetry.gps_hdop, 1)} />
          <Metric label="Terrain" value={fmt(telemetry.terrain_height_m, 0)} unit="m" />
          <Metric label="AGL" value={fmt(telemetry.height_above_terrain_m)} unit="m" />
        </SectionRow>

        {/* Row 6: RC & Servos (collapsible) */}
        <div>
          <button
            onClick={() => setShowRcServos((v) => !v)}
            className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted hover:text-text-secondary"
          >
            <span className={`inline-block transition-transform ${showRcServos ? "rotate-90" : ""}`}>&#9654;</span>
            RC & Servos
            {telemetry.rc_rssi != null && (
              <span className="ml-2 text-[10px] font-normal normal-case tracking-normal">
                RSSI {telemetry.rc_rssi}
              </span>
            )}
          </button>
          {showRcServos && (
            <div className="flex flex-col gap-3 rounded-lg border border-border-light bg-bg-tertiary/30 p-3">
              <div>
                <h4 className="mb-1 text-[10px] font-medium uppercase text-text-muted">RC Channels</h4>
                <ChannelBars label="CH" values={telemetry.rc_channels} />
              </div>
              <div>
                <h4 className="mb-1 text-[10px] font-medium uppercase text-text-muted">Servo Outputs</h4>
                <ChannelBars label="S" values={telemetry.servo_outputs} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
