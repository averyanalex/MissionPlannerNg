import { MissionMap } from "./MissionMap";
import { MissionTable } from "./MissionTable";
import { PlannerToolbar } from "./PlannerToolbar";
import { MapContextMenu } from "./MapContextMenu";
import type { useVehicle } from "../hooks/use-vehicle";
import type { useMission } from "../hooks/use-mission";
import type { HomePosition, MissionItem } from "../mission";
import { useState, useCallback, useRef } from "react";

type MissionPanelProps = {
  vehicle: ReturnType<typeof useVehicle>;
  mission: ReturnType<typeof useMission>;
};

type ContextMenuState = {
  x: number;
  y: number;
  lat: number;
  lng: number;
  nearestSeq: number | null;
} | null;

function findNearestWaypoint(items: MissionItem[], lat: number, lng: number): number | null {
  let nearest: number | null = null;
  let minDist = Infinity;
  for (const item of items) {
    const d = Math.hypot(item.x / 1e7 - lat, item.y / 1e7 - lng);
    if (d < minDist && d < 0.001) {
      minDist = d;
      nearest = item.seq;
    }
  }
  return nearest;
}

export function MissionPanel({ vehicle, mission }: MissionPanelProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback(
    (lat: number, lng: number, screenX: number, screenY: number) => {
      const rect = mapContainerRef.current?.getBoundingClientRect();
      const x = rect ? screenX - rect.left : screenX;
      const y = rect ? screenY - rect.top : screenY;
      const nearestSeq = findNearestWaypoint(mission.items, lat, lng);
      setContextMenu({ x, y, lat, lng, nearestSeq });
    },
    [mission.items]
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  return (
    <div className="flex h-full flex-col gap-3">
      <PlannerToolbar mission={mission} connected={vehicle.connected} />

      {/* Home position info */}
      {mission.missionType === "mission" && (
        <div className="flex flex-wrap items-center gap-2 text-xs lg:gap-3">
          <span className="text-text-muted">Home:</span>
          {mission.homePosition ? (
            <span className="text-text-secondary">
              {mission.homePosition.latitude_deg.toFixed(6)}, {mission.homePosition.longitude_deg.toFixed(6)}, alt {mission.homePosition.altitude_m.toFixed(1)}m
              {mission.homeSource ? ` (${mission.homeSource})` : ""}
            </span>
          ) : (
            <span className="text-text-muted">Not set</span>
          )}
          <div className="flex items-center gap-1.5 ml-auto">
            <input
              type="number" step="0.000001" placeholder="Lat"
              value={mission.homeLatInput}
              onChange={(e) => mission.setHomeLatInput(e.target.value)}
              className="w-24 rounded border border-border bg-bg-input px-1.5 py-0.5 text-xs text-text-primary"
            />
            <input
              type="number" step="0.000001" placeholder="Lon"
              value={mission.homeLonInput}
              onChange={(e) => mission.setHomeLonInput(e.target.value)}
              className="w-24 rounded border border-border bg-bg-input px-1.5 py-0.5 text-xs text-text-primary"
            />
            <input
              type="number" step="0.1" placeholder="Alt"
              value={mission.homeAltInput}
              onChange={(e) => mission.setHomeAltInput(e.target.value)}
              className="w-16 rounded border border-border bg-bg-input px-1.5 py-0.5 text-xs text-text-primary"
            />
            <button
              onClick={mission.setArbitraryHome}
              className="rounded bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              Set
            </button>
          </div>
        </div>
      )}

      {/* Map + Table split */}
      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[minmax(300px,44%)_1fr]">
        <div ref={mapContainerRef} className="relative h-64 overflow-hidden rounded-lg border border-border sm:h-80 lg:h-auto">
          <MissionMap
            missionItems={mission.items}
            homePosition={mission.missionType === "mission" ? mission.homePosition : null}
            selectedSeq={mission.selectedSeq}
            onAddWaypoint={mission.addWaypointAt}
            onSelectSeq={mission.setSelectedSeq}
            onMoveWaypoint={mission.moveWaypointOnMap}
            onContextMenu={handleContextMenu}
          />
          {contextMenu && (
            <MapContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              lat={contextMenu.lat}
              lng={contextMenu.lng}
              nearestSeq={contextMenu.nearestSeq}
              mode="planner"
              missionType={mission.missionType}
              onAddWaypoint={(lat, lng) => { mission.addWaypointAt(lat, lng); closeContextMenu(); }}
              onSetHome={(lat, lng) => { mission.setHomeFromMap(lat, lng); closeContextMenu(); }}
              onDeleteWaypoint={(seq) => { mission.deleteAt(seq); closeContextMenu(); }}
              onClose={closeContextMenu}
            />
          )}
        </div>

        <MissionTable mission={mission} />
      </div>

      {/* Validation issues */}
      {mission.issues.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
          <h4 className="mb-1 font-semibold text-warning">
            Validation Issues ({mission.issues.length})
          </h4>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-text-secondary">
            {mission.issues.map((issue, i) => (
              <li key={`${issue.code}-${i}`}>
                <span className={issue.severity === "error" ? "text-danger" : "text-warning"}>
                  [{issue.severity}]
                </span>{" "}
                {issue.code}
                {typeof issue.seq === "number" ? ` @seq ${issue.seq}` : ""}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
