import { Map, Activity, Crosshair, Route, Sliders, Settings } from "lucide-react";
import { cn } from "../lib/utils";

type ActiveTab = "map" | "telemetry" | "hud" | "mission" | "config" | "settings";

type BottomNavProps = {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  isConnecting: boolean;
  connected: boolean;
  connectionError: string | null;
  onSidebarOpen: () => void;
};

const TABS: { id: ActiveTab; label: string; Icon: typeof Map }[] = [
  { id: "map", label: "Map", Icon: Map },
  { id: "telemetry", label: "Telem", Icon: Activity },
  { id: "hud", label: "HUD", Icon: Crosshair },
  { id: "mission", label: "Mission", Icon: Route },
  { id: "config", label: "Config", Icon: Sliders },
  { id: "settings", label: "Settings", Icon: Settings },
];

export function BottomNav({ activeTab, onTabChange, isConnecting, connected, connectionError, onSidebarOpen }: BottomNavProps) {
  return (
    <nav
      className="flex shrink-0 items-center justify-around border-t border-border bg-bg-secondary"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Connection dot — opens sidebar drawer */}
      <button
        onClick={onSidebarOpen}
        className="flex flex-col items-center justify-center gap-0.5 px-2 py-2"
        aria-label="Vehicle panel"
      >
        <div className={cn(
          "h-3 w-3 rounded-full",
          isConnecting ? "bg-warning animate-pulse" :
          connected ? "bg-success" :
          connectionError ? "bg-danger" :
          "bg-text-muted"
        )} />
        <span className="text-[10px] text-text-muted">Vehicle</span>
      </button>

      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 px-2 py-2 transition-colors",
            activeTab === id
              ? "text-accent"
              : "text-text-muted"
          )}
        >
          <Icon size={18} />
          <span className="text-[10px]">{label}</span>
        </button>
      ))}
    </nav>
  );
}
