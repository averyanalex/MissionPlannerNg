import { useEffect, useRef, useState } from "react";
import {
  cancelMissionTransfer,
  clearMissionPlan,
  downloadMissionPlan,
  subscribeMissionError,
  subscribeMissionState,
  setCurrentMissionItem,
  subscribeMissionProgress,
  type HomePosition,
  type MissionState,
  uploadMissionPlan,
  validateMissionPlan,
  verifyMissionRoundtrip,
  type MissionIssue,
  type MissionItem,
  type MissionPlan,
  type MissionType,
  type TransferError,
  type TransferProgress
} from "./mission";
import {
  connectLink,
  disconnectLink,
  listSerialPorts,
  subscribeLinkState,
  subscribeHomePosition,
  subscribeTelemetry,
  type ConnectRequest,
  type LinkStateEvent,
  type Telemetry
} from "./telemetry";
import { MissionMap } from "./components/MissionMap";
import "./styles.css";

const emptyTelemetry: Telemetry = {
  session_id: "",
  ts: 0
};

type ActiveTab = "flight" | "planner";
type HomeSource = "vehicle" | "user" | "download" | null;

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("flight");
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
  const [missionItems, setMissionItems] = useState<MissionItem[]>([
    createWaypoint(0, 47.397742, 8.545594, 25),
    createWaypoint(1, 47.3984, 8.5461, 30)
  ]);
  const [missionIssues, setMissionIssues] = useState<MissionIssue[]>([]);
  const [missionType, setMissionType] = useState<MissionType>("mission");
  const [selectedMissionSeq, setSelectedMissionSeq] = useState<number | null>(null);
  const [roundtripStatus, setRoundtripStatus] = useState<string>("Not checked");
  const [missionProgress, setMissionProgress] = useState<TransferProgress | null>(null);
  const [missionTransferError, setMissionTransferError] = useState<TransferError | null>(null);
  const [missionState, setMissionState] = useState<MissionState | null>(null);
  const [homePosition, setHomePosition] = useState<HomePosition | null>(null);
  const [homeSource, setHomeSource] = useState<HomeSource>(null);
  const [homeLatInput, setHomeLatInput] = useState("");
  const [homeLonInput, setHomeLonInput] = useState("");
  const [homeAltInput, setHomeAltInput] = useState("");
  const [followVehicle, setFollowVehicle] = useState(true);
  const browserMockTimer = useRef<number | null>(null);

  const transferActive =
    missionProgress?.phase === "request_count" ||
    missionProgress?.phase === "transfer_items" ||
    missionProgress?.phase === "await_ack";

  const vehiclePosition =
    telemetry.latitude_deg != null && telemetry.longitude_deg != null &&
    isFinite(telemetry.latitude_deg) && isFinite(telemetry.longitude_deg)
      ? {
          latitude_deg: telemetry.latitude_deg,
          longitude_deg: telemetry.longitude_deg,
          heading_deg: telemetry.heading_deg ?? 0,
        }
      : null;

  useEffect(() => {
    let stopTelemetry: (() => void) | null = null;
    let stopLinkState: (() => void) | null = null;
    let stopHome: (() => void) | null = null;

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

        stopHome = await subscribeHomePosition((event) => {
          if (sessionId !== null && event.session_id !== sessionId) {
            return;
          }
          setHomeSource((current) => {
            if (current === "user") {
              return current;
            }
            const hp: HomePosition = {
              latitude_deg: event.latitude_deg,
              longitude_deg: event.longitude_deg,
              altitude_m: event.altitude_m
            };
            setHomePosition(hp);
            setHomeLatInput(event.latitude_deg.toFixed(6));
            setHomeLonInput(event.longitude_deg.toFixed(6));
            setHomeAltInput(event.altitude_m.toFixed(2));
            return "vehicle";
          });
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
      if (stopHome) {
        stopHome();
      }
      stopBrowserMock();
    };
  }, [sessionId]);

  useEffect(() => {
    let stopProgress: (() => void) | null = null;
    let stopError: (() => void) | null = null;
    let stopState: (() => void) | null = null;

    (async () => {
      stopProgress = await subscribeMissionProgress(setMissionProgress);
      stopError = await subscribeMissionError(setMissionTransferError);
      stopState = await subscribeMissionState((event) => {
        if (sessionId === null || event.session_id === sessionId) {
          setMissionState(event);
        }
      });
    })();

    return () => {
      if (stopProgress) {
        stopProgress();
      }
      if (stopError) {
        stopError();
      }
      if (stopState) {
        stopState();
      }
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

  function buildMissionPlan(): MissionPlan {
    return {
      mission_type: missionType,
      home: missionType === "mission" ? homePosition : null,
      items: resequence(missionItems)
    };
  }

  async function handleValidateMission() {
    setError(null);
    try {
      const issues = await validateMissionPlan(buildMissionPlan());
      setMissionIssues(issues);
    } catch (err) {
      setError(asErrorMessage(err));
    }
  }

  async function handleSimulateMissionUpload() {
    setMissionTransferError(null);
    setMissionProgress(null);
    if (sessionId === null) {
      setError("connect to vehicle before mission write");
      return;
    }
    try {
      await uploadMissionPlan(sessionId, buildMissionPlan());
    } catch (err) {
      setError(asErrorMessage(err));
    }
  }

  async function handleSimulateMissionDownload() {
    setMissionTransferError(null);
    setMissionProgress(null);
    if (sessionId === null) {
      setError("connect to vehicle before mission read");
      return;
    }
    try {
      const downloaded = await downloadMissionPlan(sessionId, missionType);
      setMissionItems(downloaded.items);
      if (downloaded.home) {
        setHomePosition(downloaded.home);
        setHomeLatInput(downloaded.home.latitude_deg.toFixed(6));
        setHomeLonInput(downloaded.home.longitude_deg.toFixed(6));
        setHomeAltInput(downloaded.home.altitude_m.toFixed(2));
        setHomeSource("download");
      }
      setSelectedMissionSeq(null);
      setMissionIssues([]);
      setRoundtripStatus("Downloaded sample plan");
    } catch (err) {
      setError(asErrorMessage(err));
    }
  }

  async function handleSimulateMissionClear() {
    setMissionTransferError(null);
    setMissionProgress(null);
    if (sessionId === null) {
      setError("connect to vehicle before mission clear");
      return;
    }
    try {
      await clearMissionPlan(sessionId, missionType);
      setMissionItems([]);
      setHomePosition(null);
      setHomeSource(null);
      setHomeLatInput("");
      setHomeLonInput("");
      setHomeAltInput("");
      setSelectedMissionSeq(null);
      setMissionIssues([]);
      setRoundtripStatus("Cleared");
    } catch (err) {
      setError(asErrorMessage(err));
    }
  }

  async function handleVerifyRoundtrip() {
    if (sessionId === null) {
      setError("connect to vehicle before verify");
      return;
    }
    setMissionTransferError(null);
    setMissionProgress(null);
    setRoundtripStatus("Verifying...");
    try {
      const ok = await verifyMissionRoundtrip(sessionId, buildMissionPlan());
      setRoundtripStatus(ok ? "Roundtrip compare: pass" : "Roundtrip compare: fail");
    } catch (err) {
      setRoundtripStatus("Verify failed");
      setError(asErrorMessage(err));
    }
  }

  async function handleCancelTransfer() {
    if (sessionId === null) {
      return;
    }
    try {
      await cancelMissionTransfer(sessionId);
      setMissionTransferError(null);
    } catch (err) {
      setError(asErrorMessage(err));
    }
  }

  async function handleSetCurrentMissionItem() {
    if (sessionId === null) {
      setError("connect to vehicle before set current");
      return;
    }
    if (selectedMissionSeq === null) {
      setError("select a mission row before set current");
      return;
    }

    try {
      await setCurrentMissionItem(sessionId, selectedMissionSeq);
      setError(null);
    } catch (err) {
      setError(asErrorMessage(err));
    }
  }

  function updateMissionField(index: number, field: "command" | "z" | "param1" | "param2", value: number) {
    setMissionItems((items) =>
      items.map((item, current) =>
        current === index
          ? {
              ...item,
              [field]: value
            }
          : item
      )
    );
  }

  function updateMissionCoordinate(index: number, field: "x" | "y", valueDeg: number) {
    const encoded = Math.round(valueDeg * 1e7);
    setMissionItems((items) =>
      items.map((item, current) => (current === index ? { ...item, [field]: encoded } : item))
    );
  }

  function addWaypoint() {
    let nextSelected = 0;
    setMissionItems((items) => {
      const nextSeq = items.length;
      nextSelected = nextSeq;
      const base = items[items.length - 1];
      if (!base) {
        return [createWaypoint(0, 47.397742, 8.545594, 25)];
      }
      return [...items, createWaypoint(nextSeq, base.x / 1e7 + 0.0004, base.y / 1e7 + 0.0004, base.z)];
    });
    setSelectedMissionSeq(nextSelected);
  }

  function addWaypointAt(latDeg: number, lonDeg: number) {
    let nextSelected = 0;
    setMissionItems((items) => {
      const nextSeq = items.length;
      nextSelected = nextSeq;
      const altitude = items[items.length - 1]?.z ?? 25;
      return [...items, createWaypoint(nextSeq, latDeg, lonDeg, altitude)];
    });
    setSelectedMissionSeq(nextSelected);
  }

  function removeLastWaypoint() {
    setMissionItems((items) => resequence(items.slice(0, -1)));
    setSelectedMissionSeq((current) => {
      if (current === null) {
        return null;
      }
      const nextLength = Math.max(0, missionItems.length - 1);
      if (nextLength === 0) {
        return null;
      }
      return Math.min(current, nextLength - 1);
    });
  }

  function insertWaypointAt(index: number) {
    let nextSelected = 0;
    setMissionItems((items) => {
      if (items.length === 0) {
        nextSelected = 0;
        return [createWaypoint(0, 47.397742, 8.545594, 25)];
      }

      const insertIndex = Math.max(0, Math.min(index, items.length));
      nextSelected = insertIndex;
      const before = items[insertIndex - 1];
      const after = items[insertIndex];
      const seed = before ?? after;
      if (!seed) {
        return [createWaypoint(0, 47.397742, 8.545594, 25)];
      }

      let lat = seed.x / 1e7;
      let lon = seed.y / 1e7;
      let alt = seed.z;
      if (before && after) {
        lat = (before.x + after.x) / 2 / 1e7;
        lon = (before.y + after.y) / 2 / 1e7;
        alt = (before.z + after.z) / 2;
      } else if (before && !after) {
        lat += 0.0004;
        lon += 0.0004;
      } else if (!before && after) {
        lat -= 0.0004;
        lon -= 0.0004;
      }

      const next = [...items];
      next.splice(insertIndex, 0, createWaypoint(0, lat, lon, alt));
      return resequence(next);
    });
    setSelectedMissionSeq(nextSelected);
  }

  function handleUpdateHomeFromVehicle() {
    if (missionType !== "mission") {
      return;
    }

    const lat = telemetry.latitude_deg;
    const lon = telemetry.longitude_deg;
    if (typeof lat !== "number" || typeof lon !== "number" || Number.isNaN(lat) || Number.isNaN(lon)) {
      setError("vehicle position unavailable; wait for GPS telemetry before updating home");
      return;
    }

    const altitude =
      typeof telemetry.altitude_m === "number" && !Number.isNaN(telemetry.altitude_m)
        ? telemetry.altitude_m
        : 0;

    setHomePosition({ latitude_deg: lat, longitude_deg: lon, altitude_m: altitude });
    setHomeSource("vehicle");
    setHomeLatInput(lat.toFixed(6));
    setHomeLonInput(lon.toFixed(6));
    setHomeAltInput(altitude.toFixed(2));
    setError(null);
  }

  function handleSetArbitraryHome() {
    if (missionType !== "mission") {
      return;
    }
    const lat = Number(homeLatInput);
    const lon = Number(homeLonInput);
    const alt = Number(homeAltInput || "0");
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(alt)) {
      setError("home inputs must be valid numbers");
      return;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setError("home coordinates out of range");
      return;
    }
    setHomePosition({ latitude_deg: lat, longitude_deg: lon, altitude_m: alt });
    setHomeSource("user");
    setError(null);
  }

  function deleteWaypointAt(index: number) {
    setMissionItems((items) => {
      if (index < 0 || index >= items.length) {
        return items;
      }
      const next = [...items];
      next.splice(index, 1);
      return resequence(next);
    });
    setSelectedMissionSeq((current) => {
      if (current === null) {
        return null;
      }
      if (missionItems.length <= 1) {
        return null;
      }
      return Math.min(current, missionItems.length - 2);
    });
  }

  function moveWaypoint(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) {
      return;
    }
    setMissionItems((items) => {
      if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) {
        return items;
      }
      const next = [...items];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) {
        return items;
      }
      next.splice(toIndex, 0, moved);
      return resequence(next);
    });
    setSelectedMissionSeq(toIndex);
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
        fix_type: 3,
        latitude_deg: 47.397742 + 0.002 * Math.sin(tick * 4 * Math.PI / 180),
        longitude_deg: 8.545594 + 0.002 * Math.cos(tick * 4 * Math.PI / 180)
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
          <button className={activeTab === "flight" ? "nav-active" : ""} onClick={() => setActiveTab("flight")}>
            Flight Data
          </button>
          <button className={activeTab === "planner" ? "nav-active" : ""} onClick={() => setActiveTab("planner")}>
            Planner
          </button>
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
          {activeTab === "flight" ? (
            <div className="flight-surface">
              <div className="flight-map-container">
                <MissionMap
                  missionItems={missionItems}
                  homePosition={missionType === "mission" ? homePosition : null}
                  selectedSeq={null}
                  readOnly
                  vehiclePosition={vehiclePosition}
                  currentMissionSeq={missionState?.current_seq ?? null}
                  followVehicle={followVehicle}
                />
                <button className="follow-toggle" onClick={() => setFollowVehicle(v => !v)}>
                  {followVehicle ? "Following" : "Follow Vehicle"}
                </button>
              </div>
              <div className="flight-status-bar">
                <div className="flight-status-item">
                  <span className="flight-status-label">Mode</span>
                  <span className="flight-status-value">{missionState?.mission_state ?? "unknown"}</span>
                </div>
                <div className="flight-status-item">
                  <span className="flight-status-label">Waypoint</span>
                  <span className="flight-status-value">
                    {missionState ? `${missionState.current_seq + 1} / ${missionState.total_items}` : "--"}
                  </span>
                </div>
                <div className="flight-status-item">
                  <span className="flight-status-label">Alt</span>
                  <span className="flight-status-value">{formatMaybe(telemetry.altitude_m)} m</span>
                </div>
                <div className="flight-status-item">
                  <span className="flight-status-label">Speed</span>
                  <span className="flight-status-value">{formatMaybe(telemetry.speed_mps)} m/s</span>
                </div>
                <div className="flight-status-item">
                  <span className="flight-status-label">Heading</span>
                  <span className="flight-status-value">{formatMaybe(telemetry.heading_deg)}&deg;</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="planner-surface">
              <h3>Mission Planner MVP</h3>
              <div className="planner-actions">
                <button onClick={addWaypoint}>Add Waypoint</button>
                <button className="secondary" onClick={removeLastWaypoint}>
                  Remove Last
                </button>
                <button
                  className="secondary"
                  onClick={() => insertWaypointAt(selectedMissionSeq ?? missionItems.length)}
                >
                  Insert Before Selected
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    insertWaypointAt(selectedMissionSeq === null ? missionItems.length : selectedMissionSeq + 1)
                  }
                >
                  Insert After Selected
                </button>
                <button
                  className="secondary"
                  onClick={() => deleteWaypointAt(selectedMissionSeq ?? missionItems.length - 1)}
                >
                  Delete Selected
                </button>
                <button
                  className="secondary"
                  disabled={selectedMissionSeq === null || selectedMissionSeq <= 0}
                  onClick={() => {
                    if (selectedMissionSeq !== null) {
                      moveWaypoint(selectedMissionSeq, selectedMissionSeq - 1);
                    }
                  }}
                >
                  Move Up
                </button>
                <button
                  className="secondary"
                  disabled={
                    selectedMissionSeq === null || selectedMissionSeq >= Math.max(0, missionItems.length - 1)
                  }
                  onClick={() => {
                    if (selectedMissionSeq !== null) {
                      moveWaypoint(selectedMissionSeq, selectedMissionSeq + 1);
                    }
                  }}
                >
                  Move Down
                </button>
                <button onClick={handleValidateMission}>Validate Plan</button>
                <button disabled={transferActive} onClick={handleSimulateMissionUpload}>Write</button>
                <button disabled={transferActive} onClick={handleSimulateMissionDownload}>Read</button>
                <button disabled={transferActive} onClick={handleVerifyRoundtrip}>Verify</button>
                <button
                  className="secondary"
                  disabled={missionType !== "mission"}
                  onClick={handleUpdateHomeFromVehicle}
                >
                  Update Home from Vehicle
                </button>
                <button className="secondary" disabled={transferActive} onClick={handleSimulateMissionClear}>
                  Clear
                </button>
                <button
                  className="secondary"
                  disabled={transferActive || sessionId === null || selectedMissionSeq === null}
                  onClick={handleSetCurrentMissionItem}
                >
                  Set Current
                </button>
                {transferActive ? (
                  <button className="secondary" onClick={handleCancelTransfer}>
                    Cancel Transfer
                  </button>
                ) : null}
              </div>

              <div className="planner-actions">
                <label className="inline-label">Type</label>
                <select value={missionType} onChange={(event) => setMissionType(event.target.value as MissionType)}>
                  <option value="mission">Mission</option>
                  <option value="fence">Fence</option>
                  <option value="rally">Rally</option>
                </select>
                {missionType === "mission" ? (
                  <>
                    <label className="inline-label">Home Lat</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={homeLatInput}
                      onChange={(event) => setHomeLatInput(event.target.value)}
                    />
                    <label className="inline-label">Home Lon</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={homeLonInput}
                      onChange={(event) => setHomeLonInput(event.target.value)}
                    />
                    <label className="inline-label">Home Alt</label>
                    <input
                      type="number"
                      step="0.1"
                      value={homeAltInput}
                      onChange={(event) => setHomeAltInput(event.target.value)}
                    />
                    <button className="secondary" onClick={handleSetArbitraryHome}>
                      Set Arbitrary Home
                    </button>
                  </>
                ) : null}
                <span className="roundtrip-status">{roundtripStatus}</span>
              </div>

              {missionType === "mission" && homePosition ? (
                <div className="home-info">
                  Home: {homePosition.latitude_deg.toFixed(6)}, {homePosition.longitude_deg.toFixed(6)}, alt {homePosition.altitude_m.toFixed(1)}m
                  {homeSource ? ` (${homeSource})` : ""}
                </div>
              ) : null}

              <div className="planner-workspace">
                <MissionMap
                  missionItems={missionItems}
                  homePosition={missionType === "mission" ? homePosition : null}
                  selectedSeq={selectedMissionSeq}
                  onAddWaypoint={addWaypointAt}
                  onSelectSeq={setSelectedMissionSeq}
                />

                <div className="mission-table-wrap">
                  <table className="mission-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Cmd</th>
                        <th>Lat</th>
                        <th>Lon</th>
                        <th>Alt</th>
                        <th>Hold</th>
                        <th>Accept</th>
                      </tr>
                    </thead>
                    <tbody>
                      {missionItems.map((item, index) => (
                        <tr
                          key={item.seq}
                          className={selectedMissionSeq === item.seq ? "is-selected" : ""}
                          onClick={() => setSelectedMissionSeq(item.seq)}
                        >
                          <td>{item.seq + 1}</td>
                          <td>
                            <input
                              type="number"
                              value={item.command}
                              onChange={(event) => updateMissionField(index, "command", Number(event.target.value) || 16)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.000001"
                              value={(item.x / 1e7).toFixed(6)}
                              onChange={(event) => updateMissionCoordinate(index, "x", Number(event.target.value) || 0)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.000001"
                              value={(item.y / 1e7).toFixed(6)}
                              onChange={(event) => updateMissionCoordinate(index, "y", Number(event.target.value) || 0)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={item.z}
                              onChange={(event) => updateMissionField(index, "z", Number(event.target.value) || 0)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={item.param1}
                              onChange={(event) => updateMissionField(index, "param1", Number(event.target.value) || 0)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={item.param2}
                              onChange={(event) => updateMissionField(index, "param2", Number(event.target.value) || 0)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mission-issues">
                <h4>Validation Issues ({missionIssues.length})</h4>
                {missionIssues.length === 0 ? (
                  <p>No validation issues.</p>
                ) : (
                  <ul>
                    {missionIssues.map((issue, index) => (
                      <li key={`${issue.code}-${index}`}>
                        [{issue.severity}] {issue.code}
                        {typeof issue.seq === "number" ? ` @seq ${issue.seq}` : ""}: {issue.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mission-transfer">
                <h4>Transfer Status</h4>
                {missionProgress ? (
                  <p>
                    {missionProgress.phase} - {missionProgress.completed_items}/{missionProgress.total_items} items
                    (retries: {missionProgress.retries_used})
                  </p>
                ) : (
                  <p>No transfer yet.</p>
                )}
                {missionTransferError ? (
                  <p className="error-inline">
                    {missionTransferError.code}: {missionTransferError.message}
                  </p>
                ) : null}
                {missionState ? (
                  <p>
                    Current seq: {missionState.current_seq} / total: {missionState.total_items} (state: {missionState.mission_state})
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function createWaypoint(seq: number, latDeg: number, lonDeg: number, altitudeM: number): MissionItem {
  return {
    seq,
    command: 16,
    frame: "global_relative_alt_int",
    current: seq === 0,
    autocontinue: true,
    param1: 0,
    param2: 1,
    param3: 0,
    param4: 0,
    x: Math.round(latDeg * 1e7),
    y: Math.round(lonDeg * 1e7),
    z: altitudeM
  };
}

function resequence(items: MissionItem[]): MissionItem[] {
  return items.map((item, index) => ({ ...item, seq: index, current: index === 0 }));
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
