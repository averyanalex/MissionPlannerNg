import {
  Upload, Download, ShieldCheck, Trash2,
  Plus, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, X, SkipForward,
} from "lucide-react";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import type { useMission } from "../hooks/use-mission";
import type { MissionType } from "../mission";

type PlannerToolbarProps = {
  mission: ReturnType<typeof useMission>;
  connected: boolean;
};

function IconButton({ icon, label, onClick, disabled }: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={onClick} disabled={disabled}>
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function PlannerToolbar({ mission, connected }: PlannerToolbarProps) {
  const {
    items, selectedSeq, missionType, setMissionType,
    transferActive, progress, roundtripStatus,
    addWaypoint, insertBefore, insertAfter, deleteAt, moveUp, moveDown,
    validate, upload, download, verify, clear, cancel, setCurrent,
    updateHomeFromVehicle,
  } = mission;

  const hasProgress = progress && (progress.phase === "transfer_items" || progress.phase === "request_count");
  const progressPct = progress && progress.total_items > 0
    ? (progress.completed_items / progress.total_items) * 100
    : 0;

  return (
    <div className="space-y-2">
      {/* Primary actions */}
      <div className="flex items-center gap-1.5">
        <Button size="sm" disabled={transferActive || !connected} onClick={upload}>
          <Upload className="h-3.5 w-3.5" /> Write
        </Button>
        <Button size="sm" disabled={transferActive || !connected} onClick={download}>
          <Download className="h-3.5 w-3.5" /> Read
        </Button>
        <Button variant="secondary" size="sm" disabled={transferActive || !connected} onClick={verify}>
          <ShieldCheck className="h-3.5 w-3.5" /> Verify
        </Button>
        <Button variant="destructive" size="sm" disabled={transferActive || !connected} onClick={clear}>
          <Trash2 className="h-3.5 w-3.5" /> Clear
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        <IconButton icon={<Plus className="h-3.5 w-3.5" />} label="Add Waypoint" onClick={addWaypoint} />
        <IconButton icon={<ChevronLeft className="h-3.5 w-3.5" />} label="Insert Before"
          onClick={() => insertBefore(selectedSeq ?? items.length)} />
        <IconButton icon={<ChevronRight className="h-3.5 w-3.5" />} label="Insert After"
          onClick={() => insertAfter(selectedSeq ?? items.length - 1)} />
        <IconButton icon={<X className="h-3.5 w-3.5" />} label="Delete Selected"
          onClick={() => deleteAt(selectedSeq ?? items.length - 1)}
          disabled={items.length === 0} />
        <IconButton icon={<ArrowUp className="h-3.5 w-3.5" />} label="Move Up"
          onClick={() => { if (selectedSeq !== null) moveUp(selectedSeq); }}
          disabled={selectedSeq === null || selectedSeq <= 0} />
        <IconButton icon={<ArrowDown className="h-3.5 w-3.5" />} label="Move Down"
          onClick={() => { if (selectedSeq !== null) moveDown(selectedSeq); }}
          disabled={selectedSeq === null || selectedSeq >= Math.max(0, items.length - 1)} />

        <div className="mx-1 h-5 w-px bg-border" />

        <Button variant="ghost" size="sm" onClick={validate}>Validate</Button>
        <Button variant="ghost" size="sm" disabled={!connected || selectedSeq === null} onClick={setCurrent}>
          <SkipForward className="h-3.5 w-3.5" /> Set Current
        </Button>
        <Button variant="ghost" size="sm" disabled={missionType !== "mission"} onClick={updateHomeFromVehicle}>
          Home from Vehicle
        </Button>

        {transferActive && (
          <Button variant="ghost" size="sm" onClick={cancel}>Cancel</Button>
        )}
      </div>

      {/* Mission type + transfer progress */}
      <div className="flex items-center gap-3">
        <select
          value={missionType}
          onChange={(e) => setMissionType(e.target.value as MissionType)}
          className="rounded-md border border-border bg-bg-input px-2 py-1 text-sm text-text-primary"
        >
          <option value="mission">Mission</option>
          <option value="fence">Fence</option>
          <option value="rally">Rally</option>
        </select>

        {hasProgress && (
          <div className="flex flex-1 items-center gap-2">
            <Progress value={progressPct} className="flex-1" />
            <span className="text-xs text-text-secondary">
              {progress!.direction === "upload" ? "Uploading" : "Downloading"}{" "}
              {progress!.completed_items}/{progress!.total_items}
            </span>
          </div>
        )}

        {roundtripStatus && (
          <span className="text-xs text-text-muted">{roundtripStatus}</span>
        )}
      </div>
    </div>
  );
}
