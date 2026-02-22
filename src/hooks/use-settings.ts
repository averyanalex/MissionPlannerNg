import { useState, useCallback } from "react";

export type Settings = {
  telemetryRateHz: number;
  svsEnabled: boolean;
};

const STORAGE_KEY = "mpng_settings";

const DEFAULTS: Settings = {
  telemetryRateHz: 5,
  svsEnabled: true,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      telemetryRateHz: parsed.telemetryRateHz ?? DEFAULTS.telemetryRateHz,
      svsEnabled: parsed.svsEnabled ?? DEFAULTS.svsEnabled,
    };
  } catch {
    return DEFAULTS;
  }
}

export function useSettings() {
  const [settings, setSettingsState] = useState<Settings>(loadSettings);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
