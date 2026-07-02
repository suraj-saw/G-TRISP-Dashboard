// frontend/src/components/maps/GujaratChoroplethMap.tsx
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { geoMercator, geoPath } from "d3-geo";
import { scaleLinear } from "d3-scale";
import { Loader2, AlertCircle, MousePointerClick } from "lucide-react";
import { fetchAllGujaratDistricts } from "../../api/geoApi";
import { fetchGujaratDistrictSummary } from "../../api/gujaratDashboardApi";
import { buildDistrictDashboardPath } from "../../config/constants";

interface HoverInfo {
  x: number;
  y: number;
  name: string;
}

// Internal dimensions for the SVG viewBox — abstract, does not dictate pixel size.
const SVG_W = 600;
const SVG_H = 650;

export default function GujaratChoroplethMap() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<HoverInfo | null>(null);
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    // Safety timeout
    const timeout = setTimeout(() => {
      if (active && loading) {
        setLoading(false);
        setError("Request timed out. Please refresh the page.");
      }
    }, 15_000);

    Promise.all([
      fetchAllGujaratDistricts(),
      fetchGujaratDistrictSummary().catch(() => []),
    ])
      .then(([districts, summary]) => {
        if (!active) return;

        if (
          !districts ||
          !districts.features ||
          districts.features.length === 0
        ) {
          setError("No district boundaries found.");
          return;
        }

        const countByName = new Map(
          summary.map((s) => [
            s.district.trim().toLowerCase(),
            s.accident_count,
          ])
        );

        const withCounts: GeoJSON.FeatureCollection = {
          ...districts,
          features: districts.features.map((f) => {
            const name = String(f.properties?.name ?? "")
              .trim()
              .toLowerCase();

            // CRITICAL FIX: D3-geo expects Clockwise (CW) outer rings because it models
            // spherical geometry. GeoJSON standards (and PostGIS) output CCW outer rings.
            // If we don't reverse the coordinates, D3 paints the polygon as "the entire
            // rest of the world", resulting in a giant solid square.
            const reverseCoords = (coords: any[]): any[] => {
              if (typeof coords[0] === "number") return coords;
              if (typeof coords[0][0] === "number")
                return [...coords].reverse();
              return coords.map(reverseCoords);
            };

            const geom = f.geometry as any;
            let newCoords = geom.coordinates;

            if (geom.type === "Polygon" || geom.type === "MultiPolygon") {
              newCoords = reverseCoords(geom.coordinates);
            }

            return {
              ...f,
              geometry: {
                ...geom,
                coordinates: newCoords,
              },
              properties: {
                ...f.properties,
                accident_count: countByName.get(name) ?? 0,
              },
            };
          }),
        };
        setGeojson(withCounts);
      })
      .catch((err) => {
        if (active)
          setError(
            err?.message || "Could not load Gujarat district boundaries."
          );
      })
      .finally(() => {
        clearTimeout(timeout);
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxCount = useMemo(() => {
    if (!geojson) return 1;
    return Math.max(
      1,
      ...geojson.features.map((f) => Number(f.properties?.accident_count) || 0)
    );
  }, [geojson]);

  const colorScale = useMemo(
    () =>
      scaleLinear<string>()
        .domain([0, maxCount * 0.5, maxCount])
        .range(["#EAF0FE", "#7AA6F7", "#1E3A8A"]),
    [maxCount]
  );

  const path = useMemo(() => {
    if (!geojson) return null;
    const projection = geoMercator();
    projection.fitExtent(
      [
        [20, 20],
        [SVG_W - 20, SVG_H - 20],
      ],
      geojson as any
    );
    return geoPath(projection);
  }, [geojson]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent, name: string, slug: string) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setHoveredSlug(slug);
      setHovered({ x: e.clientX - rect.left, y: e.clientY - rect.top, name });
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    setHovered(null);
    setHoveredSlug(null);
  }, []);

  const handleClick = useCallback(
    (slug: string) => {
      if (slug) navigate(buildDistrictDashboardPath(slug));
    },
    [navigate]
  );

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 flex items-center justify-center overflow-hidden bg-gradient-to-br from-white to-slate-50"
    >
      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
          <Loader2 size={32} className="text-[#2C6EF2] animate-spin mb-3" />
          <p className="text-sm font-semibold text-slate-500">
            Loading Gujarat districts…
          </p>
        </div>
      )}

      {error && !loading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-4 py-2 shadow">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {geojson && path && !loading && (
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Gujarat district accident choropleth map"
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            maxWidth: "100%",
            maxHeight: "100%",
          }}
        >
          {geojson.features.map((feature, idx) => {
            const props = feature.properties ?? {};
            const name = String(props.name ?? "Unknown");
            const slug = String(props.slug ?? "");
            const count = Number(props.accident_count) || 0;
            const isHovered = hoveredSlug === slug;
            return (
              <path
                key={slug || idx}
                d={path(feature as any) ?? ""}
                fill={colorScale(count)}
                stroke={isHovered ? "#F59E0B" : "#FFFFFF"}
                strokeWidth={isHovered ? 2.5 : 1}
                className="transition-all duration-150 cursor-pointer"
                style={{ filter: isHovered ? "brightness(1.05)" : undefined }}
                onMouseMove={(e) => handleMouseMove(e, name, slug)}
                onMouseLeave={handleMouseLeave}
                onClick={() => handleClick(slug)}
              />
            );
          })}
        </svg>
      )}

      {hovered && (
        <div
          className="pointer-events-none absolute z-30 rounded-lg bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
          style={{ left: hovered.x + 14, top: hovered.y + 10 }}
        >
          {hovered.name}
        </div>
      )}

      {!loading && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 rounded-full bg-white/90 border border-[#E4E8F4] px-3 py-1.5 text-[11px] font-medium text-slate-500 shadow-sm">
          <MousePointerClick size={12} className="text-[#1e3a8a]" />
          Click a district to explore detailed analytics
        </div>
      )}

      {geojson && !loading && (
        <div className="pointer-events-none absolute top-3 right-3 z-10 rounded-xl border border-[#E4E8F4] bg-white/90 px-3 py-2.5 shadow-sm">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Accidents
          </p>
          <div className="h-2 w-28 rounded-full bg-gradient-to-r from-[#EAF0FE] via-[#7AA6F7] to-[#1E3A8A]" />
          <div className="mt-1 flex justify-between text-[9px] font-medium text-slate-400">
            <span>0</span>
            <span>{maxCount.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}
