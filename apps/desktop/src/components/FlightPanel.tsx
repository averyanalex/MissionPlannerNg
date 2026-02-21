import { MissionMap } from "./MissionMap";
import type { useVehicle } from "../hooks/use-vehicle";
import type { useMission } from "../hooks/use-mission";

type FlightPanelProps = {
  vehicle: ReturnType<typeof useVehicle>;
  mission: ReturnType<typeof useMission>;
};

function formatMaybe(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return value.toFixed(1);
}

export function FlightPanel({ vehicle, mission }: FlightPanelProps) {
  const { telemetry, vehicleState, vehiclePosition, followVehicle, setFollowVehicle, guidedGoto } = vehicle;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="relative flex-1 overflow-hidden rounded-lg border border-border">
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

      <div className="flex gap-2">
        {[
          { label: "Mode", value: vehicleState?.mode_name ?? "--" },
          {
            label: "Waypoint",
            value: mission.missionState
              ? `${mission.missionState.current_seq + 1} / ${mission.missionState.total_items}`
              : "--",
          },
          { label: "Alt", value: `${formatMaybe(telemetry.altitude_m)} m` },
          { label: "Speed", value: `${formatMaybe(telemetry.speed_mps)} m/s` },
          { label: "Heading", value: `${formatMaybe(telemetry.heading_deg)}°` },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-1 flex-col items-center rounded-lg border border-border-light bg-bg-tertiary/50 px-3 py-2.5">
            <span className="text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
            <span className="mt-0.5 text-base font-bold transition-all duration-300">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
