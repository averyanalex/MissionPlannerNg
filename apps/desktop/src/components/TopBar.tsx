import { cn } from "../lib/utils";
import type { LinkState } from "../telemetry";

type ActiveTab = "flight" | "planner";

type TopBarProps = {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  linkState: LinkState | null;
};

function linkDotColor(state: LinkState | null): string {
  if (state === "connected") return "bg-success";
  if (state === "connecting") return "bg-warning";
  if (state === null || state === "disconnected") return "bg-text-muted";
  return "bg-danger";
}

export function TopBar({ activeTab, onTabChange, linkState }: TopBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-bg-secondary px-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold tracking-tight text-text-primary">Mission Planner NG</span>
        <div className={cn("h-2 w-2 rounded-full", linkDotColor(linkState))} />
      </div>
      <nav className="flex gap-1">
        {(["flight", "planner"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === tab
                ? "bg-bg-tertiary text-text-primary"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/50"
            )}
          >
            {tab === "flight" ? "Flight Data" : "Planner"}
          </button>
        ))}
      </nav>
    </header>
  );
}
