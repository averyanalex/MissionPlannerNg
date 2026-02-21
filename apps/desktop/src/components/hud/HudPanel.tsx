import { useRef, useEffect, useState } from "react";
import type { useVehicle } from "../../hooks/use-vehicle";
import type { useMission } from "../../hooks/use-mission";
import { TapeGauge } from "./TapeGauge";
import { ArtificialHorizon } from "./ArtificialHorizon";
import { MissionMap } from "../MissionMap";
import "./hud.css";

type HudPanelProps = {
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

/** Battery bar SVG */
function BatteryIcon({ pct }: { pct: number | undefined }) {
  const level = typeof pct === "number" ? Math.max(0, Math.min(100, pct)) : 0;
  const hasPct = pct !== undefined;
  const color = !hasPct ? "#12b9ff" : level > 30 ? "#57e38b" : level > 15 ? "#ffb020" : "#ff4444";
  return (
    <svg width={28} height={14} viewBox="0 0 28 14">
      <rect x={0} y={1} width={24} height={12} rx={2} fill="none" stroke={color} strokeWidth={1} />
      <rect x={24} y={4} width={3} height={6} rx={1} fill={color} opacity={0.5} />
      {hasPct && (
        <rect x={2} y={3} width={Math.round(level * 0.2)} height={8} rx={1} fill={color} opacity={0.7} />
      )}
    </svg>
  );
}

export function HudPanel({ vehicle, mission }: HudPanelProps) {
  const { telemetry, vehicleState, vehiclePosition } = vehicle;
  const horizonRef = useRef<HTMLDivElement>(null);
  const [horizonSize, setHorizonSize] = useState({ width: 400, height: 300 });

  // Measure the center cell for the artificial horizon
  useEffect(() => {
    const el = horizonRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setHorizonSize({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const armed = vehicleState?.armed ?? false;
  const modeName = vehicleState?.mode_name ?? "--";
  const missionState = mission.missionState;

  return (
    <div className="hud-panel h-full w-full rounded-lg">
      {/* Background layers */}
      <div className="hud-grid-bg" />
      <div className="hud-scanlines" />

      {/* Main grid */}
      <div className="hud-grid">
        {/* Row 1 — top bar */}
        {/* Top-left: waypoint info */}
        <div className="flex items-center justify-center px-1">
          <div className="hud-font text-center text-[10px] opacity-70">
            <div className="text-[9px] opacity-50">WPT</div>
            <div>
              {missionState
                ? `${missionState.current_seq + 1}/${missionState.total_items}`
                : "--/--"}
            </div>
            {telemetry.wp_dist_m !== undefined && (
              <div className="text-[9px]">{fmtInt(telemetry.wp_dist_m)}m</div>
            )}
          </div>
        </div>

        {/* Top-center: heading tape */}
        <div className="flex items-end justify-center overflow-hidden">
          <TapeGauge
            value={telemetry.heading_deg}
            orientation="horizontal"
            visibleRange={90}
            majorTickInterval={10}
            minorTicksPerMajor={2}
            size={{ width: Math.min(horizonSize.width, 600), height: 52 }}
            circular
            circularRange={360}
          />
        </div>

        {/* Top-right: GPS info */}
        <div className="flex items-center justify-center px-1">
          <div className="hud-font text-center text-[10px] opacity-70">
            <div className="text-[9px] opacity-50">GPS</div>
            <div>{telemetry.gps_fix_type ?? "--"}</div>
            <div className="text-[9px]">
              {telemetry.gps_satellites != null ? `${telemetry.gps_satellites} sat` : "-- sat"}
              {telemetry.gps_hdop != null && ` ${fmt(telemetry.gps_hdop, 1)}`}
            </div>
          </div>
        </div>

        {/* Row 2 — main instruments */}
        {/* Left: speed tape */}
        <div className="flex items-center justify-center overflow-hidden">
          <TapeGauge
            value={telemetry.speed_mps}
            orientation="vertical"
            visibleRange={40}
            majorTickInterval={5}
            minorTicksPerMajor={5}
            size={{ width: 90, height: Math.min(horizonSize.height, 500) }}
            unit="m/s"
            label="GS"
            bugValue={telemetry.airspeed_mps}
          />
        </div>

        {/* Center: artificial horizon */}
        <div ref={horizonRef} className="relative overflow-hidden">
          <ArtificialHorizon
            pitch={telemetry.pitch_deg}
            roll={telemetry.roll_deg}
            size={horizonSize}
          />
        </div>

        {/* Right: altitude tape */}
        <div className="flex items-center justify-center overflow-hidden">
          <TapeGauge
            value={telemetry.altitude_m}
            orientation="vertical"
            visibleRange={200}
            majorTickInterval={20}
            minorTicksPerMajor={4}
            size={{ width: 90, height: Math.min(horizonSize.height, 500) }}
            unit="m"
            label="ALT"
            trendValue={telemetry.climb_rate_mps}
          />
        </div>

        {/* Row 3 — bottom bar */}
        {/* Bottom-left: mode / armed */}
        <div className="flex items-center justify-center px-1">
          <div className="hud-font text-center">
            <div
              className={`text-xs font-bold ${armed ? "hud-glow-danger" : "hud-glow-green"}`}
              style={{ color: armed ? "#ff4444" : "#57e38b" }}
            >
              {armed ? "ARMED" : "SAFE"}
            </div>
          </div>
        </div>

        {/* Bottom-center: mode + throttle */}
        <div className="flex items-center justify-between px-4">
          <div className="hud-font flex items-center gap-3">
            <div>
              <span className="text-[9px] opacity-50">MODE </span>
              <span className="text-xs font-bold">{modeName}</span>
            </div>
            <div>
              <span className="text-[9px] opacity-50">THR </span>
              <span className="text-xs">{fmtInt(telemetry.throttle_pct)}%</span>
            </div>
          </div>
          <div className="hud-font flex items-center gap-3">
            <div>
              <span className="text-[9px] opacity-50">V/S </span>
              <span className="text-xs">{fmt(telemetry.climb_rate_mps)} m/s</span>
            </div>
            <div>
              <span className="text-[9px] opacity-50">HDG </span>
              <span className="text-xs">{fmtInt(telemetry.heading_deg)}°</span>
            </div>
          </div>
        </div>

        {/* Bottom-right: battery */}
        <div className="flex items-center justify-center px-1">
          <div className="hud-font flex flex-col items-center gap-0.5">
            <BatteryIcon pct={telemetry.battery_pct} />
            <span className="text-[10px]">{fmtInt(telemetry.battery_pct)}%</span>
            <span className="text-[9px] opacity-50">{fmt(telemetry.battery_voltage_v, 1)}V</span>
          </div>
        </div>
      </div>

      {/* Mini-map overlay */}
      <div className="hud-minimap">
        <MissionMap
          missionItems={mission.items}
          homePosition={mission.missionType === "mission" ? mission.homePosition : null}
          selectedSeq={null}
          readOnly
          vehiclePosition={vehiclePosition}
          currentMissionSeq={missionState?.current_seq ?? null}
          followVehicle
        />
      </div>
    </div>
  );
}
