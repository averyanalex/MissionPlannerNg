import { useEffect, useRef, useState } from "react";
import {
  connectLink,
  disconnectLink,
  listSerialPorts,
  subscribeLinkState,
  subscribeTelemetry,
  type ConnectRequest,
  type LinkStateEvent,
  type Telemetry
} from "./telemetry";
import "./styles.css";

const emptyTelemetry: Telemetry = {
  session_id: "",
  ts: 0
};

export default function App() {
  const [telemetry, setTelemetry] = useState<Telemetry>(emptyTelemetry);
  const [linkState, setLinkState] = useState<LinkStateEvent | null>(null);
  const [mode, setMode] = useState<"udp" | "serial">("udp");
  const [udpBind, setUdpBind] = useState("0.0.0.0:14550");
  const [serialPort, setSerialPort] = useState("");
  const [baud, setBaud] = useState(57600);
  const [serialPorts, setSerialPorts] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"tauri" | "browser-mock">("tauri");
  const browserMockTimer = useRef<number | null>(null);

  useEffect(() => {
    let stopTelemetry: (() => void) | null = null;
    let stopLinkState: (() => void) | null = null;

    (async () => {
      try {
        stopTelemetry = await subscribeTelemetry((event) => {
          if (sessionId !== null && event.session_id !== sessionId) {
            return;
          }
          setTelemetry(event);
        });

        stopLinkState = await subscribeLinkState((event) => {
          if (sessionId !== null && event.session_id !== sessionId) {
            return;
          }
          setLinkState(event);
        });
      } catch {
        setSource("browser-mock");
      }
    })();

    return () => {
      if (stopTelemetry) {
        stopTelemetry();
      }
      if (stopLinkState) {
        stopLinkState();
      }
      stopBrowserMock();
    };
  }, [sessionId]);

  async function refreshSerialPorts() {
    try {
      const ports = await listSerialPorts();
      setSerialPorts(ports);
      if (ports.length > 0 && serialPort === "") {
        setSerialPort(ports[0]);
      }
      setError(null);
    } catch (err) {
      setError(asErrorMessage(err));
    }
  }

  async function handleConnect() {
    setError(null);
    stopBrowserMock();

    const request: ConnectRequest =
      mode === "udp"
        ? { endpoint: { kind: "udp", bind_addr: udpBind } }
        : { endpoint: { kind: "serial", port: serialPort, baud } };

    try {
      const response = await connectLink(request);
      setSessionId(response.session_id);
      setSource("tauri");
    } catch (err) {
      if (source === "browser-mock") {
        startBrowserMock();
        return;
      }
      setError(asErrorMessage(err));
    }
  }

  async function handleDisconnect() {
    setError(null);
    if (sessionId === null) {
      stopBrowserMock();
      return;
    }

    try {
      await disconnectLink(sessionId);
      setSessionId(null);
    } catch (err) {
      setError(asErrorMessage(err));
    }
  }

  function startBrowserMock() {
    setSessionId("browser-mock");
    setLinkState({
      session_id: "browser-mock",
      status: "connected",
      detail: "mock stream"
    });

    let tick = 0;
    browserMockTimer.current = window.setInterval(() => {
      tick += 1;
      setTelemetry({
        session_id: "browser-mock",
        ts: Math.floor(Date.now() / 1000),
        altitude_m: 1200 + Math.sin(tick / 4) * 25,
        speed_mps: 55 + Math.cos(tick / 7) * 2,
        fuel_pct: Math.max(10, 90 - tick * 0.15),
        heading_deg: (tick * 4) % 360,
        fix_type: 3
      });
    }, 1000);
  }

  function stopBrowserMock() {
    if (browserMockTimer.current !== null) {
      window.clearInterval(browserMockTimer.current);
      browserMockTimer.current = null;
      setLinkState({
        session_id: "browser-mock",
        status: "disconnected",
        detail: "mock stopped"
      });
    }
  }

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

          <div className="connect-box">
            <div className="row">
              <label>Mode</label>
              <select value={mode} onChange={(event) => setMode(event.target.value as "udp" | "serial")}>
                <option value="udp">UDP</option>
                <option value="serial">Serial</option>
              </select>
            </div>

            {mode === "udp" ? (
              <div className="row">
                <label>Bind</label>
                <input value={udpBind} onChange={(event) => setUdpBind(event.target.value)} />
              </div>
            ) : (
              <>
                <div className="row">
                  <label>Port</label>
                  <select value={serialPort} onChange={(event) => setSerialPort(event.target.value)}>
                    {serialPorts.length === 0 ? <option value="">No ports</option> : null}
                    {serialPorts.map((port) => (
                      <option key={port} value={port}>
                        {port}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="row">
                  <label>Baud</label>
                  <input
                    type="number"
                    value={baud}
                    onChange={(event) => setBaud(Number(event.target.value) || 57600)}
                  />
                </div>
                <button className="secondary" onClick={refreshSerialPorts}>
                  Refresh Ports
                </button>
              </>
            )}

            <div className="actions">
              <button onClick={handleConnect}>Connect</button>
              <button className="secondary" onClick={handleDisconnect}>
                Disconnect
              </button>
            </div>
          </div>

          <div className="stat-card">
            <span>Status</span>
            <strong>{linkState?.status ?? "idle"}</strong>
          </div>

          <div className="stat-card">
            <span>Altitude</span>
            <strong>{formatMaybe(telemetry.altitude_m)} m</strong>
          </div>
          <div className="stat-card">
            <span>Ground Speed</span>
            <strong>{formatMaybe(telemetry.speed_mps)} m/s</strong>
          </div>
          <div className="stat-card">
            <span>Battery</span>
            <strong>{formatMaybe(telemetry.fuel_pct)} %</strong>
          </div>

          <div className="meta-list">
            <p>Session: {sessionId ?? "none"}</p>
            <p>Heading: {formatMaybe(telemetry.heading_deg)} deg</p>
            <p>GPS Fix: {telemetry.fix_type ?? 0}</p>
            {linkState?.detail ? <p>Link: {linkState.detail}</p> : null}
          </div>

          {error ? <p className="error">{error}</p> : null}
        </aside>

        <section className="map-panel">
          <div className="map-placeholder">
            <h3>Map Placeholder</h3>
            <p>M1 ships link/session + telemetry. Map moves to next slice.</p>
            <p>Telemetry timestamp: {telemetry.ts || 0}</p>
          </div>
        </section>
      </main>
    </div>
  );
}

function formatMaybe(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  return value.toFixed(1);
}

function asErrorMessage(error: unknown) {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "unexpected error";
}
