// frontend/src/components/maps/SuratBaseMap.tsx
import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import type { ReactNode } from "react";
import Map, {
  Source,
  Layer,
  NavigationControl,
} from "react-map-gl/maplibre";
import type { MapRef, LngLatBoundsLike } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { Loader2, AlertCircle } from "lucide-react";
import { fetchSuratBoundary } from "../../api/geoApi";
import { getMapStyleUrl } from "./mapStyles";

const SURAT_CENTER = { longitude: 72.83, latitude: 21.17, zoom: 10 };
const BOUNDS_PAD = 0.05;
const MIN_ZOOM = 9;
const WORLD_RING: GeoJSON.Position[] = [
  [-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90],
];

function buildMask(fc: GeoJSON.FeatureCollection): GeoJSON.Feature<GeoJSON.Polygon> {
  const innerRings: GeoJSON.Position[][] = [];
  for (const feature of fc.features) {
    const geom = feature.geometry;
    if (geom.type === "Polygon") innerRings.push(geom.coordinates[0]);
    else if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates) innerRings.push(poly[0]);
    }
  }
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [WORLD_RING, ...innerRings] }, properties: {} };
}

function getBbox(fc: GeoJSON.FeatureCollection): [number, number, number, number] | null {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
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

export interface SuratBaseMapHandle {
  resize: () => void;
}

interface Props {
  height?: string;
  sidebarOpen?: boolean;
  baseMap?: string;
  children?: ReactNode;
}

const SuratBaseMap = forwardRef<SuratBaseMapHandle, Props>(
  ({ height = "calc(100vh - 80px)", sidebarOpen, baseMap = "positron", children }, ref) => {
    const mapRef = useRef<MapRef>(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [boundary, setBoundary] = useState<GeoJSON.FeatureCollection | null>(null);
    const [mask, setMask] = useState<GeoJSON.Feature | null>(null);
    const [maxBounds, setMaxBounds] = useState<LngLatBoundsLike | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const bboxRef = useRef<[number, number, number, number] | null>(null);

    useImperativeHandle(ref, () => ({
      resize: () => {
        const map = mapRef.current?.getMap();
        if (!map) return;
        map.resize();
        if (bboxRef.current) {
          const [w, s, e, n] = bboxRef.current;
          mapRef.current?.fitBounds([[w, s], [e, n]], { padding: 120, duration: 400, maxZoom: 12 });
        }
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
            setMaxBounds([[w - BOUNDS_PAD, s - BOUNDS_PAD], [e + BOUNDS_PAD, n + BOUNDS_PAD]]);
          }
        })
        .catch(() => setError("Could not load district boundary."))
        .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
      if (!mapLoaded || !boundary) return;
      const bbox = getBbox(boundary);
      if (!bbox) return;
      mapRef.current?.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 120, duration: 900, maxZoom: 12 });
    }, [mapLoaded, boundary]);

    useEffect(() => {
      if (!mapLoaded) return;
      let start = performance.now();
      let frameId: number;

      const loop = (now: number) => {
        if (now - start < 350) {
          mapRef.current?.resize();
          frameId = requestAnimationFrame(loop);
        }
      };
      frameId = requestAnimationFrame(loop);

      return () => cancelAnimationFrame(frameId);
    }, [sidebarOpen, mapLoaded]);

    const handleMapLoad = useCallback(() => setMapLoaded(true), []);
    const mapStyleUrl = getMapStyleUrl(baseMap);

    return (
      <div className="relative w-full overflow-hidden" style={{ height }}>
        {(loading || !mapLoaded) && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
            <Loader2 size={36} className="text-[#2C6EF2] animate-spin mb-3" />
            <p className="text-sm font-semibold text-slate-500">Loading Surat District…</p>
            <p className="text-xs text-slate-400 mt-1">Fetching district boundary</p>
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
          initialViewState={SURAT_CENTER}
          mapStyle={mapStyleUrl}
          style={{ width: "100%", height: "100%" }}
          onLoad={handleMapLoad}
          attributionControl={false}
          reuseMaps
          minZoom={MIN_ZOOM}
          maxBounds={maxBounds}
        >
          <NavigationControl position="top-right" showCompass />
          {boundary && (
            <Source id="surat-boundary" type="geojson" data={boundary}>
              <Layer id="surat-boundary-fill" type="fill" paint={{ "fill-color": "#2C6EF2", "fill-opacity": 0.05 }} />
              <Layer id="surat-boundary-glow" type="line" paint={{ "line-color": "#93C5FD", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 6, 13, 10], "line-opacity": 0.3, "line-blur": 4 }} />
              <Layer id="surat-boundary-line" type="line" paint={{ "line-color": "#2C6EF2", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.5, 13, 2.5], "line-opacity": 0.85 }} />
            </Source>
          )}
          {mask && (
            <Source id="surat-mask" type="geojson" data={mask as any}>
              <Layer
                id="surat-mask-fill"
                type="fill"
                paint={{
                  "fill-color": baseMap === "satellite" ? "#000000" : "#F1F4FB",
                  "fill-opacity": baseMap === "satellite" ? 0.65 : 0.80,
                }}
              />
            </Source>
          )}
          {children}
        </Map>
        <div className="absolute bottom-1 right-2 z-10 text-[10px] text-slate-400" style={{ pointerEvents: "none" }}>
          © MapLibre · © CARTO · © OpenStreetMap
        </div>
      </div>
    );
  }
);

SuratBaseMap.displayName = "SuratBaseMap";
export default SuratBaseMap;