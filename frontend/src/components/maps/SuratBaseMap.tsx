// frontend/src/components/maps/SuratBaseMap.tsx
/**
 * Hero map — Surat District only.
 *
 * Changes vs previous version:
 *  - Removed bottom-centre info card
 *  - Removed top-left style switcher card
 *  - Removed city-centre blue dot
 *  - Added minZoom so user cannot zoom out past district level
 *  - Added maxBounds (derived from the real boundary bbox + padding)
 *    so the district can never be panned fully out of view
 */

import { useEffect, useRef, useState, useCallback } from "react";
import Map, {
  Source,
  Layer,
  NavigationControl,
//   ScaleControl,
} from "react-map-gl/maplibre";
import type { MapRef, LngLatBoundsLike } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { Loader2, AlertCircle } from "lucide-react";
import { fetchSuratBoundary } from "../../api/geoApi";

// ── Map style ────────────────────────────────────────────────────────────────
const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// ── Fallback centre while boundary loads ─────────────────────────────────────
const SURAT_CENTER = { longitude: 72.83, latitude: 21.17, zoom: 10 };

// ── How many degrees of padding to add around the bbox for maxBounds ─────────
const BOUNDS_PAD = 0.4; // ~40 km buffer — user can pan a little outside edge

// ── Minimum zoom allowed (prevents zooming out to see all of India) ──────────
const MIN_ZOOM = 9;

// ── World ring for mask polygon ───────────────────────────────────────────────
const WORLD_RING: GeoJSON.Position[] = [
  [-180, -90],
  [180, -90],
  [180, 90],
  [-180, 90],
  [-180, -90],
];

/** Invert boundary → world polygon with district cut out as a hole */
function buildMask(
  fc: GeoJSON.FeatureCollection
): GeoJSON.Feature<GeoJSON.Polygon> {
  const innerRings: GeoJSON.Position[][] = [];

  for (const feature of fc.features) {
    const geom = feature.geometry;
    if (geom.type === "Polygon") {
      innerRings.push(geom.coordinates[0]);
    } else if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates) innerRings.push(poly[0]);
    }
  }

  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [WORLD_RING, ...innerRings],
    },
    properties: {},
  };
}

/** Extract [minLng, minLat, maxLng, maxLat] from a FeatureCollection */
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

interface Props {
  height?: string;
}

export default function SuratBaseMap({ height = "calc(100vh - 80px)" }: Props) {
  const mapRef = useRef<MapRef>(null);
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

  // ── 1. Fetch boundary on mount ─────────────────────────────────────────────
  useEffect(() => {
    fetchSuratBoundary()
      .then((fc) => {
        setBoundary(fc);
        setMask(buildMask(fc) as GeoJSON.Feature);

        // Derive maxBounds with generous padding so district stays anchored
        const bbox = getBbox(fc);
        if (bbox) {
          const [w, s, e, n] = bbox;
          setMaxBounds([
            [w - BOUNDS_PAD, s - BOUNDS_PAD], // SW corner
            [e + BOUNDS_PAD, n + BOUNDS_PAD], // NE corner
          ]);
        }
      })
      .catch(() => setError("Could not load district boundary."))
      .finally(() => setLoading(false));
  }, []);

  // ── 2. Fit map to exact boundary extents once both are ready ───────────────
  useEffect(() => {
    if (!mapLoaded || !boundary) return;

    const bbox = getBbox(boundary);
    if (!bbox) return;

    mapRef.current?.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
      { padding: 40, duration: 900, maxZoom: 12 }
    );
  }, [mapLoaded, boundary]);

  const handleMapLoad = useCallback(() => setMapLoaded(true), []);

  return (
    <div className="relative w-full overflow-hidden" style={{ height }}>
      {/* ── Loading overlay ── */}
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

      {/* ── Error banner ── */}
      {error && !loading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-4 py-2 shadow">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* ── Map ── */}
      <Map
        ref={mapRef}
        initialViewState={SURAT_CENTER}
        mapStyle={MAP_STYLE}
        style={{ width: "100%", height: "100%" }}
        onLoad={handleMapLoad}
        attributionControl={false}
        reuseMaps
        /* ── Zoom & pan constraints ── */
        minZoom={MIN_ZOOM} // cannot zoom out past district-level view
        maxBounds={maxBounds} // cannot pan district fully out of view
      >
        <NavigationControl position="top-right" showCompass />
        {/* <ScaleControl position="bottom-left" unit="metric" /> */}

        {/* ── District boundary fill (very light blue tint inside) ── */}
        {boundary && (
          <Source id="surat-boundary" type="geojson" data={boundary}>
            <Layer
              id="surat-boundary-fill"
              type="fill"
              paint={{
                "fill-color": "#2C6EF2",
                "fill-opacity": 0.05,
              }}
            />
            {/* Glowing outer stroke */}
            <Layer
              id="surat-boundary-glow"
              type="line"
              paint={{
                "line-color": "#93C5FD", // lighter blue halo
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
            {/* Sharp inner stroke */}
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

        {/* ── World mask — dims everything outside Surat ── */}
        {mask && (
          <Source id="surat-mask" type="geojson" data={mask as any}>
            <Layer
              id="surat-mask-fill"
              type="fill"
              paint={{
                "fill-color": "#F1F4FB",
                "fill-opacity": 0.8,
              }}
            />
          </Source>
        )}
      </Map>

      {/* ── Minimal attribution ── */}
      <div
        className="absolute bottom-1 right-2 z-10 text-[10px] text-slate-400"
        style={{ pointerEvents: "none" }}
      >
        © MapLibre · © CARTO · © OpenStreetMap
      </div>
    </div>
  );
}
