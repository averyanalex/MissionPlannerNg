import { useEffect, useState } from "react";
import { toast, Toaster } from "sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { TopBar } from "./components/TopBar";
import { BottomNav } from "./components/BottomNav";
import { Sidebar } from "./components/Sidebar";
import { MapPanel } from "./components/MapPanel";
import { TelemetryPanel } from "./components/TelemetryPanel";
import { HudPanel } from "./components/hud/HudPanel";
import { MissionPanel } from "./components/MissionPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { ConfigPanel } from "./components/ConfigPanel";
import { useVehicle } from "./hooks/use-vehicle";
import { useMission } from "./hooks/use-mission";
import { useSettings } from "./hooks/use-settings";
import { useParams } from "./hooks/use-params";
import { useBreakpoint } from "./hooks/use-breakpoint";
import { setTelemetryRate } from "./telemetry";
import { cn } from "./lib/utils";
import "./app.css";

type ActiveTab = "map" | "telemetry" | "hud" | "mission" | "config" | "settings";

function checkGpuRenderer() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (!gl) {
    console.warn("[GPU] WebGL not available");
    toast.error("WebGL is not available — 3D map will not work");
    return;
  }

  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  if (debugInfo) {
    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string;
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string;
    console.log(`[GPU] Vendor: ${vendor}`);
    console.log(`[GPU] Renderer: ${renderer}`);

    const isSoftware =
      renderer.includes("SwiftShader") ||
      renderer.includes("Software") ||
      renderer.includes("llvmpipe");
    if (isSoftware) {
      toast.error(
        `Software renderer detected (${renderer}). Performance will be severely degraded. Enable hardware acceleration in your system settings.`,
        { duration: 10000 },
      );
    } else {
      console.log("[GPU] Hardware accelerated");
    }
  } else {
    console.warn("[GPU] WEBGL_debug_renderer_info not available");
  }

  const loseExt = gl.getExtension("WEBGL_lose_context");
  if (loseExt) loseExt.loseContext();
}

function linkDotColor(state: ReturnType<typeof useVehicle>["linkState"]): string {
  if (state === "connected") return "bg-success";
  if (state === "connecting") return "bg-warning";
  if (state === null || state === "disconnected") return "bg-text-muted";
  return "bg-danger";
}

export default function App() {
  const vehicle = useVehicle();
  const mission = useMission(vehicle.connected, vehicle.telemetry, vehicle.homePosition);
  const params = useParams(vehicle.connected, vehicle.vehicleState?.vehicle_type);
  const { settings, updateSettings } = useSettings();
  const [activeTab, setActiveTab] = useState<ActiveTab>("map");
  const { isMobile } = useBreakpoint();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { checkGpuRenderer() }, []);

  // Apply saved telemetry rate on mount
  useEffect(() => {
    setTelemetryRate(settings.telemetryRateHz).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col bg-bg-primary text-text-primary">
        {/* Desktop: full top bar with tabs | Mobile: compact header */}
        {isMobile ? (
          <header className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-bg-secondary px-3">
            <span className="text-sm font-bold tracking-tight text-text-primary">MPNG</span>
            <div className={cn("h-2 w-2 rounded-full", linkDotColor(vehicle.linkState))} />
          </header>
        ) : (
          <TopBar activeTab={activeTab} onTabChange={setActiveTab} linkState={vehicle.linkState} />
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Desktop: static sidebar | Mobile: drawer overlay */}
          <Sidebar
            vehicle={vehicle}
            isMobile={isMobile}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />

          <main className="flex-1 overflow-hidden p-2 lg:p-3">
            {activeTab === "map" ? (
              <MapPanel vehicle={vehicle} mission={mission} />
            ) : activeTab === "telemetry" ? (
              <TelemetryPanel vehicle={vehicle} mission={mission} />
            ) : activeTab === "hud" ? (
              <HudPanel vehicle={vehicle} mission={mission} svsEnabled={settings.svsEnabled} />
            ) : activeTab === "mission" ? (
              <MissionPanel vehicle={vehicle} mission={mission} />
            ) : activeTab === "config" ? (
              <ConfigPanel params={params} connected={vehicle.connected} />
            ) : (
              <SettingsPanel settings={settings} updateSettings={updateSettings} />
            )}
          </main>
        </div>

        {/* Mobile: bottom nav | Desktop: nothing */}
        {isMobile && (
          <BottomNav
            activeTab={activeTab}
            onTabChange={setActiveTab}
            linkState={vehicle.linkState}
            onSidebarOpen={() => setSidebarOpen(true)}
          />
        )}

        <Toaster richColors position={isMobile ? "top-center" : "bottom-right"} theme="dark" />
      </div>
    </TooltipProvider>
  );
}
