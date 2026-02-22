import { fetch } from "@tauri-apps/plugin-http";

export type ParamMeta = {
  humanName: string;
  description: string;
  range?: { min: number; max: number };
  increment?: number;
  units?: string;
  unitText?: string;
  values?: { code: number; label: string }[];
  bitmask?: { bit: number; label: string }[];
  rebootRequired?: boolean;
};

export type ParamMetadataMap = Map<string, ParamMeta>;

const SLUG_MAP: Record<string, string> = {
  quadrotor: "ArduCopter",
  hexarotor: "ArduCopter",
  octorotor: "ArduCopter",
  tricopter: "ArduCopter",
  helicopter: "ArduCopter",
  coaxial: "ArduCopter",
  fixed_wing: "ArduPlane",
  ground_rover: "Rover",
};

const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function vehicleTypeToSlug(vehicleType: string): string | null {
  return SLUG_MAP[vehicleType] ?? null;
}

export function parseMetadataXml(xml: string): ParamMetadataMap {
  const map: ParamMetadataMap = new Map();
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");

  const params = doc.querySelectorAll("param");
  for (const el of params) {
    const rawName = el.getAttribute("name") ?? "";
    // Strip vehicle prefix (e.g. "ArduCopter:PILOT_THR_FILT" -> "PILOT_THR_FILT")
    const name = rawName.includes(":") ? rawName.split(":")[1] : rawName;
    if (!name) continue;

    const meta: ParamMeta = {
      humanName: el.getAttribute("humanName") ?? "",
      description: el.getAttribute("documentation") ?? "",
    };

    // Parse <field> children
    const fields = el.querySelectorAll("field");
    for (const field of fields) {
      const fieldName = field.getAttribute("name");
      const text = field.textContent?.trim() ?? "";
      switch (fieldName) {
        case "Range": {
          const parts = text.split(/\s+/);
          if (parts.length >= 2) {
            const min = parseFloat(parts[0]);
            const max = parseFloat(parts[1]);
            if (Number.isFinite(min) && Number.isFinite(max)) {
              meta.range = { min, max };
            }
          }
          break;
        }
        case "Increment": {
          const inc = parseFloat(text);
          if (Number.isFinite(inc)) meta.increment = inc;
          break;
        }
        case "Units":
          meta.units = text;
          break;
        case "UnitText":
          meta.unitText = text;
          break;
        case "RebootRequired":
          meta.rebootRequired = text.toLowerCase() === "true";
          break;
      }
    }

    // Parse <values> -> <value code="N">Label</value>
    const valueEls = el.querySelectorAll("values > value");
    if (valueEls.length > 0) {
      meta.values = [];
      for (const v of valueEls) {
        const code = parseInt(v.getAttribute("code") ?? "", 10);
        const label = v.textContent?.trim() ?? "";
        if (Number.isFinite(code) && label) {
          meta.values.push({ code, label });
        }
      }
      if (meta.values.length === 0) delete meta.values;
    }

    // Parse <bitmask> -> <bit code="N">Label</bit>
    const bitEls = el.querySelectorAll("bitmask > bit");
    if (bitEls.length > 0) {
      meta.bitmask = [];
      for (const b of bitEls) {
        const bit = parseInt(b.getAttribute("code") ?? "", 10);
        const label = b.textContent?.trim() ?? "";
        if (Number.isFinite(bit) && label) {
          meta.bitmask.push({ bit, label });
        }
      }
      if (meta.bitmask.length === 0) delete meta.bitmask;
    }

    // Don't overwrite — first occurrence wins (vehicle params over library params)
    if (!map.has(name)) {
      map.set(name, meta);
    }
  }

  return map;
}

export async function fetchParamMetadata(
  vehicleType: string,
): Promise<ParamMetadataMap | null> {
  const slug = vehicleTypeToSlug(vehicleType);
  if (!slug) return null;

  const cacheKey = `param_meta_${slug}`;
  const tsKey = `param_meta_${slug}_ts`;

  // Check localStorage cache
  try {
    const cached = localStorage.getItem(cacheKey);
    const ts = localStorage.getItem(tsKey);
    if (cached && ts) {
      const age = Date.now() - parseInt(ts, 10);
      if (age < CACHE_MAX_AGE_MS) {
        return parseMetadataXml(cached);
      }
    }
  } catch {
    // localStorage unavailable — continue to fetch
  }

  // Fetch from ArduPilot
  try {
    const url = `https://autotest.ardupilot.org/Parameters/${slug}/apm.pdef.xml`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`[param-metadata] fetch failed: ${resp.status}`);
      return null;
    }
    const xml = await resp.text();

    // Cache raw XML
    try {
      localStorage.setItem(cacheKey, xml);
      localStorage.setItem(tsKey, String(Date.now()));
    } catch {
      // localStorage full or unavailable
    }

    return parseMetadataXml(xml);
  } catch (err) {
    console.warn("[param-metadata] fetch error:", err);
    return null;
  }
}
