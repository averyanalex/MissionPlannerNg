import { Shield } from "lucide-react";
import { cn } from "../lib/utils";

type ArmSliderProps = {
  connected: boolean;
  armed: boolean;
  onArm: (force: boolean) => void;
  onDisarm: (force: boolean) => void;
};

export function ArmSlider({ connected, armed, onArm, onDisarm }: ArmSliderProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-bg-primary p-3", !connected && "opacity-50")}>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
        <Shield className="h-3.5 w-3.5" />
        {armed ? "Armed" : "Disarmed"}
      </div>

      <div className="relative flex h-11 select-none rounded-full bg-bg-tertiary p-1">
        {/* Sliding background pill */}
        <div
          className={cn(
            "absolute inset-y-1 w-[calc(50%-4px)] rounded-full transition-all duration-200 ease-out",
            armed ? "left-[calc(50%+2px)] bg-danger/20" : "left-1 bg-bg-secondary"
          )}
        />

        <button
          type="button"
          disabled={!connected || !armed}
          onClick={() => onDisarm(false)}
          className={cn(
            "relative z-10 flex flex-1 items-center justify-center rounded-full text-sm font-medium transition-colors",
            armed
              ? "text-text-secondary active:text-text-primary"
              : "text-text-primary"
          )}
        >
          Disarm
        </button>

        <button
          type="button"
          disabled={!connected || armed}
          onClick={() => onArm(false)}
          className={cn(
            "relative z-10 flex flex-1 items-center justify-center rounded-full text-sm font-medium transition-colors",
            armed
              ? "text-danger"
              : "text-text-secondary active:text-text-primary"
          )}
        >
          Arm
        </button>
      </div>
    </div>
  );
}
