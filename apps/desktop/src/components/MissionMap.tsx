import { useEffect, useMemo, useRef } from "react";
import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
  type MapMouseEvent
} from "maplibre-gl";
import type { MissionItem } from "../mission";

const DEFAULT_CENTER: [number, number] = [8.545594, 47.397742];
const DEFAULT_ZOOM = 13;
const MAP_STYLE_URL = "https://demotiles.maplibre.org/style.json";

const SOURCE_ID = "mission-items";
const LINE_LAYER_ID = "mission-line";
const POINT_LAYER_ID = "mission-points";

type MissionMapProps = {
  missionItems: MissionItem[];
  selectedSeq: number | null;
  onAddWaypoint: (latDeg: number, lonDeg: number) => void;
  onSelectSeq: (seq: number | null) => void;
};

export function MissionMap({ missionItems, selectedSeq, onAddWaypoint, onSelectSeq }: MissionMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const hasSetInitialViewport = useRef(false);
  const onAddWaypointRef = useRef(onAddWaypoint);
  const onSelectSeqRef = useRef(onSelectSeq);
  const missionGeoJsonRef = useRef<any>({
    type: "FeatureCollection",
    features: []
  });

  useEffect(() => {
    onAddWaypointRef.current = onAddWaypoint;
    onSelectSeqRef.current = onSelectSeq;
  }, [onAddWaypoint, onSelectSeq]);

  const missionGeoJson = useMemo(() => {
    const pointFeatures = missionItems.map((item) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [item.y / 1e7, item.x / 1e7]
      },
      properties: {
        seq: item.seq,
        selected: selectedSeq === item.seq
      }
    }));

    const lineCoordinates = missionItems.map((item) => [item.y / 1e7, item.x / 1e7]);
    const features: any[] = [...pointFeatures];

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
  }, [missionItems, selectedSeq]);

  useEffect(() => {
    missionGeoJsonRef.current = missionGeoJson;
  }, [missionGeoJson]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");

    map.on("load", () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: []
        }
      });

      map.addLayer({
        id: LINE_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        filter: ["==", ["geometry-type"], "LineString"],
        paint: {
          "line-color": "#5ac8ff",
          "line-width": 3
        }
      });

      map.addLayer({
        id: POINT_LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": ["case", ["get", "selected"], 8, 6],
          "circle-color": ["case", ["get", "selected"], "#ffb020", "#4da3ff"],
          "circle-stroke-color": "#0c1623",
          "circle-stroke-width": 2
        }
      });

      const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      if (source) {
        source.setData(missionGeoJsonRef.current);
      }
    });

    map.on("click", (event: MapMouseEvent) => {
      const renderedFeatures = map.queryRenderedFeatures(event.point, {
        layers: [POINT_LAYER_ID]
      });
      if (renderedFeatures.length > 0) {
        const seq = renderedFeatures[0].properties?.seq;
        const numericSeq = typeof seq === "number" ? seq : Number(seq);
        if (Number.isFinite(numericSeq)) {
          onSelectSeqRef.current(numericSeq);
          return;
        }
      }

      onAddWaypointRef.current(event.lngLat.lat, event.lngLat.lng);
    });

    mapRef.current = map;

    return () => {
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || hasSetInitialViewport.current || missionItems.length === 0) {
      return;
    }

    const bounds = new maplibregl.LngLatBounds();
    for (const item of missionItems) {
      bounds.extend([item.y / 1e7, item.x / 1e7]);
    }

    map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });
    hasSetInitialViewport.current = true;
  }, [missionItems]);

  return <div className="mission-map" ref={containerRef} />;
}
