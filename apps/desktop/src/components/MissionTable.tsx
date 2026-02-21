import { Trash2 } from "lucide-react";
import { commandName, MAV_CMD } from "../lib/mav-commands";
import { cn } from "../lib/utils";
import type { useMission } from "../hooks/use-mission";

type MissionTableProps = {
  mission: ReturnType<typeof useMission>;
};

export function MissionTable({ mission }: MissionTableProps) {
  const { items, selectedSeq, setSelectedSeq, updateField, updateCoordinate, deleteAt } = mission;

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border-light p-8">
        <p className="text-center text-sm text-text-muted">
          No waypoints. Click the map or press <kbd className="rounded bg-bg-tertiary px-1.5 py-0.5 text-xs">+</kbd> to create your first waypoint.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-tertiary/50">
            <th className="px-2 py-1.5 text-left text-xs font-semibold text-text-muted">#</th>
            <th className="px-2 py-1.5 text-left text-xs font-semibold text-text-muted">Command</th>
            <th className="px-2 py-1.5 text-left text-xs font-semibold text-text-muted">Latitude</th>
            <th className="px-2 py-1.5 text-left text-xs font-semibold text-text-muted">Longitude</th>
            <th className="px-2 py-1.5 text-left text-xs font-semibold text-text-muted">Alt (m)</th>
            <th className="px-2 py-1.5 text-left text-xs font-semibold text-text-muted">Hold (s)</th>
            <th className="px-2 py-1.5 text-left text-xs font-semibold text-text-muted">Radius (m)</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr
              key={item.seq}
              onClick={() => setSelectedSeq(item.seq)}
              className={cn(
                "cursor-pointer border-b border-border/50 transition-colors",
                selectedSeq === item.seq
                  ? "bg-accent/10"
                  : "hover:bg-bg-tertiary/30"
              )}
            >
              <td className="px-2 py-1 text-text-muted">{item.seq + 1}</td>
              <td className="px-2 py-1">
                <select
                  value={item.command}
                  onChange={(e) => updateField(index, "command", Number(e.target.value) || 16)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded border border-border bg-bg-input px-1.5 py-0.5 text-xs text-text-primary"
                >
                  <option value={item.command}>{commandName(item.command)}</option>
                  {Object.entries(MAV_CMD)
                    .filter(([k]) => Number(k) !== item.command)
                    .map(([k, v]) => (
                      <option key={k} value={k}>{v.short}</option>
                    ))}
                </select>
              </td>
              <td className="px-2 py-1">
                <input
                  type="number"
                  step="0.000001"
                  value={(item.x / 1e7).toFixed(6)}
                  onChange={(e) => updateCoordinate(index, "x", Number(e.target.value) || 0)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded border border-border bg-bg-input px-1.5 py-0.5 text-xs text-text-primary"
                />
              </td>
              <td className="px-2 py-1">
                <input
                  type="number"
                  step="0.000001"
                  value={(item.y / 1e7).toFixed(6)}
                  onChange={(e) => updateCoordinate(index, "y", Number(e.target.value) || 0)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded border border-border bg-bg-input px-1.5 py-0.5 text-xs text-text-primary"
                />
              </td>
              <td className="px-2 py-1">
                <input
                  type="number"
                  value={item.z}
                  onChange={(e) => updateField(index, "z", Number(e.target.value) || 0)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-20 rounded border border-border bg-bg-input px-1.5 py-0.5 text-xs text-text-primary"
                />
              </td>
              <td className="px-2 py-1">
                <input
                  type="number"
                  value={item.param1}
                  onChange={(e) => updateField(index, "param1", Number(e.target.value) || 0)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-16 rounded border border-border bg-bg-input px-1.5 py-0.5 text-xs text-text-primary"
                />
              </td>
              <td className="px-2 py-1">
                <input
                  type="number"
                  value={item.param2}
                  onChange={(e) => updateField(index, "param2", Number(e.target.value) || 0)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-16 rounded border border-border bg-bg-input px-1.5 py-0.5 text-xs text-text-primary"
                />
              </td>
              <td className="px-2 py-1">
                <button
                  onClick={(e) => { e.stopPropagation(); deleteAt(index); }}
                  className="rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 [tr:hover_&]:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
