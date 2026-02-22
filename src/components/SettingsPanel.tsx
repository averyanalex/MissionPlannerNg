import { useState } from "react";
import type { Settings } from "../hooks/use-settings";
import { setTelemetryRate } from "../telemetry";

type SettingsPanelProps = {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
};

export function SettingsPanel({ settings, updateSettings }: SettingsPanelProps) {
  const [rateSlider, setRateSlider] = useState(settings.telemetryRateHz);
  const [applying, setApplying] = useState(false);

  const rateChanged = rateSlider !== settings.telemetryRateHz;

  async function applyRate() {
    setApplying(true);
    try {
      await setTelemetryRate(rateSlider);
      updateSettings({ telemetryRateHz: rateSlider });
    } catch {
      // ignore — command may fail if not connected
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="flex h-full max-w-2xl flex-col gap-6 overflow-y-auto">
      <h2 className="text-lg font-semibold">Settings</h2>

      {/* Telemetry Rate */}
      <div className="rounded-lg border border-border bg-bg-secondary p-4">
        <h3 className="mb-3 text-sm font-semibold">Telemetry Update Rate</h3>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={1}
            max={20}
            step={1}
            value={rateSlider}
            onChange={(e) => setRateSlider(Number(e.target.value))}
            className="flex-1 accent-accent-blue"
          />
          <span className="w-14 text-right text-sm font-medium tabular-nums">{rateSlider} Hz</span>
          <button
            onClick={applyRate}
            disabled={!rateChanged || applying}
            className="rounded-md bg-accent-blue px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-40"
          >
            {applying ? "Applying…" : "Apply"}
          </button>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Controls how often telemetry data is forwarded from the backend. Lower values reduce CPU usage.
        </p>
      </div>

      {/* SVS Toggle */}
      <div className="rounded-lg border border-border bg-bg-secondary p-4">
        <h3 className="mb-3 text-sm font-semibold">Synthetic Vision (SVS)</h3>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings.svsEnabled}
            onChange={(e) => updateSettings({ svsEnabled: e.target.checked })}
            className="h-4 w-4 accent-accent-blue"
          />
          <span className="text-sm">
            Enable 3D terrain view behind HUD instruments when telemetry is available
          </span>
        </label>
      </div>
    </div>
  );
}
