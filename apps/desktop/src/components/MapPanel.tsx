import { MissionMap } from "./MissionMap";
import type { useVehicle } from "../hooks/use-vehicle";
import type { useMission } from "../hooks/use-mission";

type MapPanelProps = {
  vehicle: ReturnType<typeof useVehicle>;
  mission: ReturnType<typeof useMission>;
};

export function MapPanel({ vehicle, mission }: MapPanelProps) {
  const { vehiclePosition, followVehicle, setFollowVehicle, guidedGoto } = vehicle;

  return (
    <div className="relative h-full overflow-hidden rounded-lg border border-border">
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
  );
}
