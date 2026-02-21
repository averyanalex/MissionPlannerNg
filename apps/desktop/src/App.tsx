import { useState } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { FlightPanel } from "./components/FlightPanel";
import { PlannerPanel } from "./components/PlannerPanel";
import { useVehicle } from "./hooks/use-vehicle";
import { useMission } from "./hooks/use-mission";
import "./app.css";

type ActiveTab = "flight" | "planner";

export default function App() {
  const vehicle = useVehicle();
  const mission = useMission(vehicle.connected, vehicle.telemetry, vehicle.homePosition);
  const [activeTab, setActiveTab] = useState<ActiveTab>("flight");

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
