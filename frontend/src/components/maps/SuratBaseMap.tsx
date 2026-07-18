/**
 * @file SuratBaseMap.tsx
 * @description The foundational map component for rendering spatial data specifically for the city of Surat.
 * @responsibility Manages the core Maplibre instance, handles viewport resizing, fetches the Surat city boundary, applies an inverted polygon mask, and exposes imperative map controls.
 */
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import type { ReactNode } from "react";
import Map, { Source, Layer, NavigationControl, Popup } from "react-map-gl/maplibre";
import type { MapRef, LngLatBoundsLike, MapLayerMouseEvent } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { Loader2, AlertCircle } from "lucide-react";
import { fetchSuratBoundary } from "../../api/geoApi";
import { getMapStyleUrl } from "./mapStyles";
import {
  SURAT_MAP_CENTER,
  SATELLITE_BASE_MAP_IDS,
} from "../../config/constants";
import {
  MAP_BOUNDS_PAD_DEGREES,
  MAP_MIN_ZOOM,
  MAP_FIT_MAX_ZOOM,
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

/**
 * Constructs an inverted polygon (mask) to obscure areas outside the Surat city boundary.
 * @business_rule Creates a massive outer bounding box (`WORLD_RING`) and subtracts the city geometries, creating a "hole".
 * @param {GeoJSON.FeatureCollection} fc - The feature collection representing the boundary.
 * @returns {GeoJSON.Feature<GeoJSON.Polygon>} The inverted polygon feature.
 */
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

/**
 * Calculates the bounding box (bbox) for a given FeatureCollection.
 * @param {GeoJSON.FeatureCollection} fc - The feature collection.
 * @returns {[number, number, number, number] | null} Bounding box as [minLng, minLat, maxLng, maxLat].
 */
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

const MASK_COLOR_SATELLITE = "#000000";
const MASK_OPACITY_SATELLITE = 0.65;
const MASK_COLOR_DEFAULT = "#F1F4FB";
const MASK_OPACITY_DEFAULT = 0.65;

export interface SuratBaseMapHandle {
  resize: () => void;
}

interface Props {
  height?: string;
  sidebarOpen?: boolean;
  baseMap?: string;
  /** MapLibre Source/Layer/Popup children rendered INSIDE <Map> */
  children?: ReactNode;
  /** Overlay UI rendered OUTSIDE <Map> but inside the relative wrapper (e.g. legend, stats badge) */
  overlays?: ReactNode;
}

/**
 * SuratBaseMap Component
 * @state_management Manages map loading, mask geometry, and error states.
 * @hooks_usage Uses `useCallback` for memoized bounds fitting, `useEffect` for data fetching and resize loops, and `useImperativeHandle` to expose `resize` to parent components.
 */
const SuratBaseMap = forwardRef<SuratBaseMapHandle, Props>(
  (
    {
      height = "calc(100vh - 80px)",
      sidebarOpen,
      baseMap = "positron",
      children,
      overlays,
    },
    ref
  ) => {
    const mapRef = useRef<MapRef | null>(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [boundary, setBoundary] = useState<GeoJSON.FeatureCollection | null>(
      null
    );
    const [mask, setMask] = useState<GeoJSON.Feature | null>(null);
    const [maxBounds, setMaxBounds] = useState<LngLatBoundsLike | undefined>(
      undefined
    );
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const bboxRef = useRef<[number, number, number, number] | null>(null);
    const [contextMenuCoords, setContextMenuCoords] = useState<{lat: number, lng: number} | null>(null);

    const isSatelliteMap = SATELLITE_BASE_MAP_IDS.has(baseMap ?? "");

    const fitToBounds = useCallback((duration: number) => {
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
          maxZoom: MAP_FIT_MAX_ZOOM,
        }
      );
    }, []);

    useImperativeHandle(ref, () => ({
      resize: () => {
        mapRef.current?.getMap()?.resize();
        fitToBounds(MAP_FIT_DURATION_MS);
      },
    }));

    useEffect(() => {
      fetchSuratBoundary()
        .then((fc) => {
          setBoundary(fc);
          setMask(buildMask(fc) as GeoJSON.Feature);
          const bbox = getBbox(fc);
          if (bbox) {
            bboxRef.current = bbox;
            const [w, s, e, n] = bbox;
            setMaxBounds([
              [w - MAP_BOUNDS_PAD_DEGREES, s - MAP_BOUNDS_PAD_DEGREES],
              [e + MAP_BOUNDS_PAD_DEGREES, n + MAP_BOUNDS_PAD_DEGREES],
            ]);
          }
        })
        .catch(() => setError("Could not load district boundary."))
        .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
      if (!mapLoaded || !boundary) return;
      fitToBounds(900);
    }, [mapLoaded, boundary, fitToBounds]);

    useEffect(() => {
      if (!mapLoaded) return;
      const start = performance.now();
      let frameId: number;

      const loop = (now: number) => {
        mapRef.current?.resize();
        if (now - start < MAP_RESIZE_LOOP_MS) {
          frameId = requestAnimationFrame(loop);
        } else {
          fitToBounds(MAP_FIT_DURATION_MS);
        }
      };
      frameId = requestAnimationFrame(loop);

      return () => cancelAnimationFrame(frameId);
    }, [sidebarOpen, mapLoaded, fitToBounds]);

    const handleMapLoad = useCallback(() => setMapLoaded(true), []);
    const mapStyleUrl = getMapStyleUrl(baseMap);

    const onContextMenu = useCallback((e: MapLayerMouseEvent) => {
      e.preventDefault();
      setContextMenuCoords({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    }, []);

    return (
      <div className="relative w-full overflow-hidden" style={{ height }}>
        {(loading || !mapLoaded) && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
            <Loader2 size={36} className="text-[#2C6EF2] animate-spin mb-3" />
            <p className="text-sm font-semibold text-slate-500">
              Loading Surat District…
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Fetching district boundary
            </p>
          </div>
        )}
        {error && !loading && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-4 py-2 shadow">
            <AlertCircle size={14} />
            {error}
          </div>
        )}
        <Map
          ref={mapRef}
          initialViewState={SURAT_MAP_CENTER}
          mapStyle={mapStyleUrl}
          style={{ width: "100%", height: "100%" }}
          onLoad={handleMapLoad}
          attributionControl={false}
          reuseMaps
          minZoom={MAP_MIN_ZOOM}
          maxBounds={maxBounds}
          onContextMenu={onContextMenu}
        >
          <NavigationControl position="top-right" showCompass />
          {boundary && (
            <Source id="surat-boundary" type="geojson" data={boundary}>
              <Layer
                id="surat-boundary-fill"
                type="fill"
                paint={{ "fill-color": "#2C6EF2", "fill-opacity": 0.05 }}
              />
              <Layer
                id="surat-boundary-glow"
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
                id="surat-boundary-line"
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
            <Source id="surat-mask" type="geojson" data={mask as any}>
              <Layer
                id="surat-mask-fill"
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
          {/* MapLibre children: Source / Layer / Popup etc. */}
          {children}
          {/* Coordinate Status Bar */}
          <CoordinateStatusBar />

          {contextMenuCoords && (
            <Popup
              longitude={contextMenuCoords.lng}
              latitude={contextMenuCoords.lat}
              closeButton={true}
              closeOnClick={true}
              onClose={() => setContextMenuCoords(null)}
              anchor="top"
              className="z-50"
            >
              <div className="p-1 text-xs font-semibold text-slate-800">
                <div>Lat: {contextMenuCoords.lat.toFixed(6)}</div>
                <div>Lng: {contextMenuCoords.lng.toFixed(6)}</div>
              </div>
            </Popup>
          )}
        </Map>

        {/* Overlay UI: legend, stats badge, title chip — rendered OUTSIDE <Map> */}
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

SuratBaseMap.displayName = "SuratBaseMap";
export default SuratBaseMap;
