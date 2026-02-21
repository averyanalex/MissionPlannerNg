import { useEffect, useState } from "react";
import { toast, Toaster } from "sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { FlightPanel } from "./components/FlightPanel";
import { PlannerPanel } from "./components/PlannerPanel";
import { useVehicle } from "./hooks/use-vehicle";
import { useMission } from "./hooks/use-mission";
import "./app.css";

type ActiveTab = "flight" | "planner";

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

export default function App() {
  const vehicle = useVehicle();
  const mission = useMission(vehicle.connected, vehicle.telemetry, vehicle.homePosition);
  const [activeTab, setActiveTab] = useState<ActiveTab>("flight");

  useEffect(() => { checkGpuRenderer() }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col bg-bg-primary text-text-primary">
        <TopBar activeTab={activeTab} onTabChange={setActiveTab} linkState={vehicle.linkState} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar vehicle={vehicle} />
          <main className="flex-1 overflow-hidden p-3">
            {activeTab === "flight" ? (
              <FlightPanel vehicle={vehicle} mission={mission} />
            ) : (
              <PlannerPanel vehicle={vehicle} mission={mission} />
            )}
          </main>
        </div>
        <Toaster richColors position="bottom-right" theme="dark" />
      </div>
    </TooltipProvider>
  );
}
