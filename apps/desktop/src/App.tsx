import { useEffect, useState } from "react";
import { getInitialTelemetry, subscribeTelemetry, type Telemetry } from "./telemetry";
import "./styles.css";

const fallback: Telemetry = {
  ts: 0,
  altitude_m: 0,
  speed_mps: 0,
  fuel_pct: 0
};

export default function App() {
  const [telemetry, setTelemetry] = useState<Telemetry>(fallback);
  const [source, setSource] = useState<"tauri" | "browser-mock">("tauri");

  useEffect(() => {
    let timer: number | null = null;
    let unlisten: (() => void) | null = null;

    (async () => {
      try {
        setTelemetry(await getInitialTelemetry());
        unlisten = await subscribeTelemetry(setTelemetry);
      } catch {
        setSource("browser-mock");
        let tick = 0;
        timer = window.setInterval(() => {
          tick += 1;
          setTelemetry({
            ts: Math.floor(Date.now() / 1000),
            altitude_m: 1200 + Math.sin(tick / 4) * 25,
            speed_mps: 55 + Math.cos(tick / 7) * 2,
            fuel_pct: Math.max(10, 90 - tick * 0.1)
          });
        }, 1000);
      }
    })();

    return () => {
      if (timer !== null) {
        window.clearInterval(timer);
      }
      if (unlisten !== null) {
        unlisten();
      }
    };
  }, []);

  return (
    <div className="layout">
      <header className="topbar">
        <div className="logo">Mission Planner NG</div>
        <nav>
          <button>Flight Data</button>
          <button>Planner</button>
          <button>Setup</button>
          <button>Config</button>
        </nav>
      </header>

      <main className="main-grid">
        <aside className="left-panel">
          <h2>Flight Data</h2>
          <p className="source">Source: {source}</p>
          <div className="stat-card">
            <span>Altitude</span>
            <strong>{telemetry.altitude_m.toFixed(1)} m</strong>
          </div>
          <div className="stat-card">
            <span>Ground Speed</span>
            <strong>{telemetry.speed_mps.toFixed(1)} m/s</strong>
          </div>
          <div className="stat-card">
            <span>Fuel</span>
            <strong>{telemetry.fuel_pct.toFixed(1)} %</strong>
          </div>
        </aside>

        <section className="map-panel">
          <div className="map-placeholder">
            <h3>Map Placeholder</h3>
            <p>MapLibre integration planned in M1/M2.</p>
            <p>Telemetry timestamp: {telemetry.ts}</p>
          </div>
        </section>
      </main>
    </div>
  );
}
