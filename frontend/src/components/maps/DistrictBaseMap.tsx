// frontend/src/components/maps/DistrictBaseMap.tsx
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import type { ReactNode } from "react";
import Map, { Source, Layer, NavigationControl } from "react-map-gl/maplibre";
import type { MapRef, LngLatBoundsLike } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { Loader2, AlertCircle } from "lucide-react";
import { getMapStyleUrl } from "./mapStyles";
import {
  GUJARAT_MAP_CENTER,
  SATELLITE_BASE_MAP_IDS,
} from "../../config/constants";
import {
  // MAP_BOUNDS_PAD_DEGREES,
  MAP_MIN_ZOOM,
  // MAP_FIT_MAX_ZOOM,
  MAP_FIT_DURATION_MS,
  MAP_FIT_PADDING_PX,
  MAP_RESIZE_LOOP_MS,
} from "../../config/layout";
import CoordinateStatusBar from "./CoordinateStatusBar";

const WORLD_RING: GeoJSON.Position[] = [
  [-180, -90],
  [180, -90],
  [180, 90],
  [-180, 90],
  [-180, -90],
];

function buildMask(
  fc: GeoJSON.FeatureCollection
): GeoJSON.Feature<GeoJSON.Polygon> {
  const innerRings: GeoJSON.Position[][] = [];
  for (const feature of fc.features) {
    const geom = feature.geometry;
    if (geom.type === "Polygon") innerRings.push(geom.coordinates[0]);
    else if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates) innerRings.push(poly[0]);
    }
  }
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [WORLD_RING, ...innerRings] },
    properties: {},
  };
}

function getBbox(
  fc: GeoJSON.FeatureCollection
): [number, number, number, number] | null {
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  const scan = (coords: GeoJSON.Position[]) => {
    for (const [lng, lat] of coords) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  };
  for (const f of fc.features) {
    const g = f.geometry;
    if (g.type === "Polygon") scan(g.coordinates[0]);
    if (g.type === "MultiPolygon") g.coordinates.forEach((p) => scan(p[0]));
  }
  return isFinite(minLng) ? [minLng, minLat, maxLng, maxLat] : null;
}

function maxZoomForBbox(bbox: [number, number, number, number]): number {
  const [w, s, e, n] = bbox;

  const spanDeg = Math.max(e - w, n - s);

  if (spanDeg < 0.25) return 13.5;
  if (spanDeg < 0.5) return 13;
  if (spanDeg < 1) return 12;
  if (spanDeg < 2) return 10.5;

  return 9;
}

const MASK_COLOR_SATELLITE = "#000000";
const MASK_OPACITY_SATELLITE = 0.65;
const MASK_COLOR_DEFAULT = "#F1F4FB";
const MASK_OPACITY_DEFAULT = 0.65;

export interface DistrictBaseMapHandle {
  resize: () => void;
  getMap: () => MapRef | null;
}

interface Props {
  height?: string;
  sidebarOpen?: boolean;
  baseMap?: string;
  /** Boundary GeoJSON, fetched by the parent (e.g. DistrictDashboard). */
  boundary: GeoJSON.FeatureCollection | null;
  boundaryLoading?: boolean;
  boundaryError?: string | null;
  loadingLabel?: string;
  children?: ReactNode;
  overlays?: ReactNode;
}

const DistrictBaseMap = forwardRef<DistrictBaseMapHandle, Props>(
  (
    {
      height = "calc(100vh - 80px)",
      sidebarOpen,
      baseMap = "positron",
      boundary,
      boundaryLoading = false,
      boundaryError = null,
      loadingLabel = "Loading district…",
      children,
      overlays,
    },
    ref
  ) => {
    const mapRef = useRef<MapRef | null>(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [mask, setMask] = useState<GeoJSON.Feature | null>(null);
    const [maxBounds, setMaxBounds] = useState<LngLatBoundsLike | undefined>(
      undefined
    );
    const bboxRef = useRef<[number, number, number, number] | null>(null);

    const isSatelliteMap = SATELLITE_BASE_MAP_IDS.has(baseMap ?? "");

    const applyMaxBounds = useCallback(
      (bbox: [number, number, number, number] | null) => {
        const map = mapRef.current?.getMap();
        if (!map) return;
        if (!bbox) {
          map.setMaxBounds(undefined);
          return;
        }
        const [w, s, e, n] = bbox;
        const container = map.getContainer();
        const aspect =
          container && container.clientHeight > 0
            ? container.clientWidth / container.clientHeight
            : 2.0;

        const dw = e - w;
        const dh = n - s;
        // Ensure maxBounds has at least the aspect ratio of the screen to prevent forced zooming
        const target_w = Math.max(dw, dh * aspect);
        const target_h = Math.max(dh, dw / aspect);

        // 0.1 degrees padding (~11km) for a tiny bit of breathing room
        const pad_w = (target_w - dw) / 2 + 0.1;
        const pad_h = (target_h - dh) / 2 + 0.1;

        map.setMaxBounds([
          [w - pad_w, s - pad_h],
          [e + pad_w, n + pad_h],
        ]);
      },
      []
    );

    const fitToBounds = useCallback(
      (duration: number, onSettled?: () => void) => {
        if (!bboxRef.current) return;
        const [w, s, e, n] = bboxRef.current;
        mapRef.current?.fitBounds(
          [
            [w, s],
            [e, n],
          ],
          {
            padding: MAP_FIT_PADDING_PX,
            duration,
            maxZoom: maxZoomForBbox(bboxRef.current),
          }
        );
        if (onSettled) {
          const map = mapRef.current?.getMap();
          if (map) map.once("moveend", onSettled);
          else setTimeout(onSettled, duration + 50);
        }
      },
      []
    );

    useImperativeHandle(ref, () => ({
      resize: () => {
        mapRef.current?.getMap()?.resize();
        fitToBounds(MAP_FIT_DURATION_MS);
      },
      getMap: () => mapRef.current,
    }));

    // React to a new boundary (e.g. navigating between districts, or the
    // async fetch resolving after the map has already mounted).
    useEffect(() => {
      if (!boundary) {
        setMask(null);
        bboxRef.current = null;
        setMaxBounds(undefined);
        mapRef.current?.getMap()?.setMaxBounds(undefined);
        return;
      }
      setMask(buildMask(boundary) as GeoJSON.Feature);
      const bbox = getBbox(boundary);
      if (bbox) {
        bboxRef.current = bbox;
        // We defer applying the strict maxBounds until AFTER the map has smoothly
        // zoomed to fit the district. This prevents clipping/snapping.
        mapRef.current?.getMap()?.setMaxBounds(undefined);
        setMaxBounds(undefined);
      }
      if (mapLoaded) {
        fitToBounds(900, () => applyMaxBounds(bboxRef.current));
      }
    }, [boundary, mapLoaded, fitToBounds, applyMaxBounds]);

    useEffect(() => {
      if (!mapLoaded) return;
      const start = performance.now();
      let frameId: number;

      const loop = (now: number) => {
        mapRef.current?.resize();
        if (now - start < MAP_RESIZE_LOOP_MS) {
          frameId = requestAnimationFrame(loop);
        } else {
          fitToBounds(MAP_FIT_DURATION_MS, () =>
            applyMaxBounds(bboxRef.current)
          );
        }
      };
      frameId = requestAnimationFrame(loop);

      return () => cancelAnimationFrame(frameId);
    }, [sidebarOpen, mapLoaded, fitToBounds, applyMaxBounds]);

    const handleMapLoad = useCallback(() => setMapLoaded(true), []);
    const mapStyleUrl = getMapStyleUrl(baseMap);

    return (
      <div className="relative w-full overflow-hidden" style={{ height }}>
        {(boundaryLoading || !mapLoaded) && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
            <Loader2 size={36} className="text-[#2C6EF2] animate-spin mb-3" />
            <p className="text-sm font-semibold text-slate-500">
              {loadingLabel}
            </p>
          </div>
        )}
        {boundaryError && !boundaryLoading && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-4 py-2 shadow">
            <AlertCircle size={14} />
            {boundaryError}
          </div>
        )}
        <Map
          ref={mapRef}
          initialViewState={GUJARAT_MAP_CENTER}
          mapStyle={mapStyleUrl}
          style={{ width: "100%", height: "100%" }}
          onLoad={handleMapLoad}
          attributionControl={false}
          reuseMaps
          minZoom={MAP_MIN_ZOOM}
          maxBounds={maxBounds}
        >
          <NavigationControl position="top-right" showCompass />
          {boundary && (
            <Source id="district-boundary" type="geojson" data={boundary}>
              <Layer
                id="district-boundary-fill"
                type="fill"
                paint={{ "fill-color": "#2C6EF2", "fill-opacity": 0.05 }}
              />
              <Layer
                id="district-boundary-glow"
                type="line"
                paint={{
                  "line-color": "#93C5FD",
                  "line-width": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    8,
                    6,
                    13,
                    10,
                  ],
                  "line-opacity": 0.3,
                  "line-blur": 4,
                }}
              />
              <Layer
                id="district-boundary-line"
                type="line"
                paint={{
                  "line-color": "#2C6EF2",
                  "line-width": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    8,
                    1.5,
                    13,
                    2.5,
                  ],
                  "line-opacity": 0.85,
                }}
              />
            </Source>
          )}
          {mask && (
            <Source id="district-mask" type="geojson" data={mask as any}>
              <Layer
                id="district-mask-fill"
                type="fill"
                paint={{
                  "fill-color": isSatelliteMap
                    ? MASK_COLOR_SATELLITE
                    : MASK_COLOR_DEFAULT,
                  "fill-opacity": isSatelliteMap
                    ? MASK_OPACITY_SATELLITE
                    : MASK_OPACITY_DEFAULT,
                }}
              />
            </Source>
          )}
          {children}
          {/* Coordinate Status Bar */}
          <CoordinateStatusBar />
        </Map>

        {overlays}

        <div
          className="absolute bottom-1 right-2 z-10 text-[10px] text-slate-400"
          style={{ pointerEvents: "none" }}
        >
          © MapLibre · © CARTO · © OpenStreetMap
        </div>
      </div>
    );
  }
);

DistrictBaseMap.displayName = "DistrictBaseMap";
export default DistrictBaseMap;
