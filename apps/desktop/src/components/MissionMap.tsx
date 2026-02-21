import { useEffect, useMemo, useRef } from "react";
import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
  type Marker,
  type MapMouseEvent
} from "maplibre-gl";
import type { HomePosition, MissionItem } from "../mission";

const DEFAULT_CENTER: [number, number] = [8.545594, 47.397742];
const DEFAULT_ZOOM = 13;
const BASE_STYLE_URL = "https://tiles.openfreemap.org/styles/bright";
const SATELLITE_TILE_URL =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg";
const DEM_TILESET_URL = "https://demotiles.maplibre.org/terrain-tiles/tiles.json";

const SOURCE_ID = "mission-items";
const LINE_LAYER_ID = "mission-line";

type MissionMapProps = {
  missionItems: MissionItem[];
  homePosition: HomePosition | null;
  selectedSeq: number | null;
  onAddWaypoint?: (latDeg: number, lonDeg: number) => void;
  onSelectSeq?: (seq: number | null) => void;
  onRightClick?: (latDeg: number, lonDeg: number) => void;
  readOnly?: boolean;
  vehiclePosition?: { latitude_deg: number; longitude_deg: number; heading_deg: number } | null;
  currentMissionSeq?: number | null;
  followVehicle?: boolean;
};

export function MissionMap({ missionItems, homePosition, selectedSeq, onAddWaypoint, onSelectSeq, onRightClick, readOnly, vehiclePosition, currentMissionSeq, followVehicle }: MissionMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<number, Marker>>(new Map());
  const homeMarkerRef = useRef<Marker | null>(null);
  const vehicleMarkerRef = useRef<Marker | null>(null);
  const hasSetInitialViewport = useRef(false);
  const onAddWaypointRef = useRef(onAddWaypoint);
  const onSelectSeqRef = useRef(onSelectSeq);
  const onRightClickRef = useRef(onRightClick);
  const readOnlyRef = useRef(readOnly);
  const missionGeoJsonRef = useRef<any>({
    type: "FeatureCollection",
    features: []
  });

  useEffect(() => {
    onAddWaypointRef.current = onAddWaypoint;
    onSelectSeqRef.current = onSelectSeq;
    onRightClickRef.current = onRightClick;
    readOnlyRef.current = readOnly;
  }, [onAddWaypoint, onSelectSeq, onRightClick, readOnly]);

  const missionGeoJson = useMemo(() => {
    const lineCoordinates: [number, number][] = [];

    if (homePosition) {
      lineCoordinates.push([homePosition.longitude_deg, homePosition.latitude_deg]);
    }

    for (const item of missionItems) {
      lineCoordinates.push([item.y / 1e7, item.x / 1e7]);
    }

    const features: any[] = [];

    if (lineCoordinates.length >= 2) {
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: lineCoordinates
        },
        properties: {
          kind: "mission-line"
        }
      });
    }

    return {
      type: "FeatureCollection" as const,
      features
    };
  }, [missionItems, homePosition]);

  useEffect(() => {
    missionGeoJsonRef.current = missionGeoJson;
  }, [missionGeoJson]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: 60,
      maxPitch: 85
    });

    map.setStyle(BASE_STYLE_URL, {
      transformStyle: (_previousStyle, nextStyle) => {
        const style = nextStyle as any;
        style.projection = { type: "globe" };
        style.sources = {
          ...style.sources,
          satelliteSource: {
            type: "raster",
            tiles: [SATELLITE_TILE_URL],
            tileSize: 256
          },
          terrainSource: {
            type: "raster-dem",
            url: DEM_TILESET_URL,
            tileSize: 256
          },
          hillshadeSource: {
            type: "raster-dem",
            url: DEM_TILESET_URL,
            tileSize: 256
          }
        };
        style.terrain = {
          source: "terrainSource",
          exaggeration: 1.25
        };
        style.sky = {
          "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 2, 0]
        };

        style.layers.push({
          id: "hills",
          type: "hillshade",
          source: "hillshadeSource",
          layout: { visibility: "visible" },
          paint: { "hillshade-shadow-color": "#473B24" }
        });

        const firstNonFillLayer = style.layers.find(
          (layer: any) => layer.type !== "fill" && layer.type !== "background"
        );
        if (firstNonFillLayer) {
          style.layers.splice(style.layers.indexOf(firstNonFillLayer), 0, {
            id: "satellite",
            type: "raster",
            source: "satelliteSource",
            layout: { visibility: "visible" },
            paint: { "raster-opacity": 1 }
          });
        }

        return style;
      }
    });

    map.addControl(
      new maplibregl.NavigationControl({
        showZoom: true,
        showCompass: true,
        visualizePitch: true
      }),
      "top-right"
    );
    map.addControl(new maplibregl.GlobeControl(), "top-right");
    map.addControl(
      new maplibregl.TerrainControl({
        source: "terrainSource",
        exaggeration: 1.25
      }),
      "top-right"
    );

    map.on("style.load", () => {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: []
          }
        });
      }

      if (!map.getLayer(LINE_LAYER_ID)) {
        map.addLayer({
          id: LINE_LAYER_ID,
          type: "line",
          source: SOURCE_ID,
          filter: ["==", ["geometry-type"], "LineString"],
          paint: {
            "line-color": "#78d6ff",
            "line-width": 4
          }
        });
      }

      const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      if (source) {
        source.setData(missionGeoJsonRef.current);
      }
    });

    map.on("click", (event: MapMouseEvent) => {
      if (readOnlyRef.current) return;
      onAddWaypointRef.current?.(event.lngLat.lat, event.lngLat.lng);
    });

    map.on("contextmenu", (event: MapMouseEvent) => {
      onRightClickRef.current?.(event.lngLat.lat, event.lngLat.lng);
    });

    mapRef.current = map;

    return () => {
      for (const marker of markersRef.current.values()) {
        marker.remove();
      }
      markersRef.current.clear();
      if (homeMarkerRef.current) {
        homeMarkerRef.current.remove();
        homeMarkerRef.current = null;
      }
      if (vehicleMarkerRef.current) {
        vehicleMarkerRef.current.remove();
        vehicleMarkerRef.current = null;
      }
      map.remove();
      mapRef.current = null;
      hasSetInitialViewport.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      return;
    }

    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) {
      return;
    }
    source.setData(missionGeoJson);
  }, [missionGeoJson]);

  // Update home marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (homePosition) {
      const lngLat: [number, number] = [homePosition.longitude_deg, homePosition.latitude_deg];

      if (homeMarkerRef.current) {
        homeMarkerRef.current.setLngLat(lngLat);
      } else {
        const markerEl = document.createElement("button");
        markerEl.type = "button";
        markerEl.className = "mission-pin is-home";
        markerEl.textContent = "H";
        markerEl.addEventListener("click", (event) => {
          event.stopPropagation();
        });

        homeMarkerRef.current = new maplibregl.Marker({
          element: markerEl,
          anchor: "bottom"
        })
          .setLngLat(lngLat)
          .addTo(map);
      }
    } else if (homeMarkerRef.current) {
      homeMarkerRef.current.remove();
      homeMarkerRef.current = null;
    }
  }, [homePosition]);

  // Update waypoint markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const nextSeqs = new Set(missionItems.map((item) => item.seq));
    for (const [seq, marker] of markersRef.current.entries()) {
      if (!nextSeqs.has(seq)) {
        marker.remove();
        markersRef.current.delete(seq);
      }
    }

    for (const item of missionItems) {
      const existing = markersRef.current.get(item.seq);
      const lngLat: [number, number] = [item.y / 1e7, item.x / 1e7];

      if (existing) {
        existing.setLngLat(lngLat);
      } else {
        const markerEl = document.createElement("button");
        markerEl.type = "button";
        markerEl.className = "mission-pin";
        if (!readOnly) {
          markerEl.addEventListener("click", (event) => {
            event.stopPropagation();
            onSelectSeqRef.current?.(item.seq);
          });
        }

        const marker = new maplibregl.Marker({
          element: markerEl,
          anchor: "bottom"
        })
          .setLngLat(lngLat)
          .addTo(map);

        markersRef.current.set(item.seq, marker);
      }

      const markerElement = markersRef.current.get(item.seq)?.getElement();
      if (markerElement) {
        markerElement.textContent = String(item.seq + 1);
        if (readOnly) {
          markerElement.classList.toggle("is-current", currentMissionSeq === item.seq);
        } else {
          markerElement.classList.toggle("is-selected", selectedSeq === item.seq);
        }
      }
    }
  }, [missionItems, selectedSeq, readOnly, currentMissionSeq]);

  // Vehicle marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (vehiclePosition) {
      const lngLat: [number, number] = [vehiclePosition.longitude_deg, vehiclePosition.latitude_deg];

      if (vehicleMarkerRef.current) {
        vehicleMarkerRef.current.setLngLat(lngLat);
        const svg = vehicleMarkerRef.current.getElement().querySelector("svg");
        if (svg) {
          svg.style.transform = `rotate(${vehiclePosition.heading_deg}deg)`;
        }
      } else {
        const el = document.createElement("div");
        el.className = "vehicle-marker";
        el.innerHTML = `<svg width="32" height="32" viewBox="0 0 32 32" style="transform: rotate(${vehiclePosition.heading_deg}deg)"><polygon points="16,4 26,28 16,22 6,28" fill="#ff4444" stroke="#fff" stroke-width="1.5"/></svg>`;

        vehicleMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat(lngLat)
          .addTo(map);
      }

      if (followVehicle) {
        map.easeTo({ center: lngLat, duration: 500 });
      }
    } else if (vehicleMarkerRef.current) {
      vehicleMarkerRef.current.remove();
      vehicleMarkerRef.current = null;
    }
  }, [vehiclePosition, followVehicle]);

  // Fit bounds on initial load
  useEffect(() => {
    const map = mapRef.current;
    if (!map || hasSetInitialViewport.current) {
      return;
    }

    const hasItems = missionItems.length > 0 || homePosition !== null;
    if (!hasItems) {
      return;
    }

    const bounds = new maplibregl.LngLatBounds();
    if (homePosition) {
      bounds.extend([homePosition.longitude_deg, homePosition.latitude_deg]);
    }
    for (const item of missionItems) {
      bounds.extend([item.y / 1e7, item.x / 1e7]);
    }

    map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });
    hasSetInitialViewport.current = true;
  }, [missionItems, homePosition]);

  return <div className="mission-map" ref={containerRef} />;
}
