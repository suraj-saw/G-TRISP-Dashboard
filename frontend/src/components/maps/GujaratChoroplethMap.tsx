// frontend/src/components/maps/GujaratChoroplethMap.tsx
import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { geoMercator, geoPath } from "d3-geo";
import { scaleLinear } from "d3-scale";
import { Loader2, AlertCircle, MousePointerClick } from "lucide-react";
import { fetchAllGujaratDistricts } from "../../api/geoApi";
import { fetchGujaratDistrictSummary } from "../../api/gujaratDashboardApi";
import { buildDistrictDashboardPath } from "../../config/constants";

// Internal dimensions for the SVG viewBox
const SVG_W = 600;
const SVG_H = 650;

interface DistrictFeature {
  slug: string;
  name: string;
  count: number;
  d: string;
  fill: string;
}

export default function GujaratChoroplethMap() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hoveredSlugRef = useRef<string | null>(null);

  const [districts, setDistricts] = useState<DistrictFeature[]>([]);
  const [maxCount, setMaxCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Single state only for which slug is hovered (triggers SVG stroke re-render only)
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
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
      .then(([geoData, summary]) => {
        if (!active) return;
        if (!geoData?.features?.length) {
          setError("No district boundaries found.");
          return;
        }

        const countByName = new Map(
          summary.map((s) => [
            s.district.trim().toLowerCase(),
            s.accident_count,
          ])
        );
        const maxVal = Math.max(1, ...summary.map((s) => s.accident_count));

        const colorScale = scaleLinear<string>()
          .domain([0, maxVal * 0.5, maxVal])
          .range(["#EAF0FE", "#7AA6F7", "#1E3A8A"]);

        const reverseCoords = (coords: any[]): any[] => {
          if (typeof coords[0] === "number") return coords;
          if (typeof coords[0][0] === "number") return [...coords].reverse();
          return coords.map(reverseCoords);
        };

        const collection: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: geoData.features.map((f) => {
            const geom = f.geometry as any;
            const newCoords =
              geom.type === "Polygon" || geom.type === "MultiPolygon"
                ? reverseCoords(geom.coordinates)
                : geom.coordinates;
            return { ...f, geometry: { ...geom, coordinates: newCoords } };
          }),
        };

        const projection = geoMercator();
        projection.fitExtent(
          [
            [20, 20],
            [SVG_W - 20, SVG_H - 20],
          ],
          collection as any
        );
        const pathFn = geoPath(projection);

        const built: DistrictFeature[] = [];
        for (let i = 0; i < collection.features.length; i++) {
          const f = collection.features[i];
          const props = f.properties ?? {};
          const name = String(props.name ?? "Unknown");
          const slug = String(props.slug ?? "");
          const count = countByName.get(name.trim().toLowerCase()) ?? 0;
          const d = pathFn(f as any) ?? "";
          if (d) {
            built.push({ slug, name, count, d, fill: colorScale(count) });
          }
        }

        setDistricts(built);
        setMaxCount(maxVal);
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

  // Move tooltip via DOM ref — zero React re-renders
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGPathElement>, slug: string, name: string) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const tip = tooltipRef.current;
      if (!rect || !tip) return;

      tip.style.left = `${e.clientX - rect.left + 14}px`;
      tip.style.top = `${e.clientY - rect.top + 10}px`;
      tip.textContent = name;
      tip.style.opacity = "1";

      // Only trigger SVG re-render when slug actually changes
      if (hoveredSlugRef.current !== slug) {
        hoveredSlugRef.current = slug;
        setHoveredSlug(slug);
      }
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    const tip = tooltipRef.current;
    if (tip) tip.style.opacity = "0";
    hoveredSlugRef.current = null;
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

      {districts.length > 0 && !loading && (
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
          {districts.map((dist) => {
            const isHovered = hoveredSlug === dist.slug;
            return (
              <path
                key={dist.slug}
                d={dist.d}
                fill={dist.fill}
                stroke={isHovered ? "#1e3a8a" : "#FFFFFF"}
                strokeWidth={isHovered ? 3 : 1}
                style={{ cursor: "pointer" }}
                onMouseMove={(e) => handleMouseMove(e, dist.slug, dist.name)}
                onMouseLeave={handleMouseLeave}
                onClick={() => handleClick(dist.slug)}
              />
            );
          })}
        </svg>
      )}

      {/* Tooltip rendered via DOM ref — no React re-renders on mousemove */}
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute z-30 rounded-lg bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition-opacity duration-75"
        style={{ opacity: 0, left: 0, top: 0 }}
      />

      {!loading && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 rounded-full bg-white/90 border border-[#E4E8F4] px-3 py-1.5 text-[11px] font-medium text-slate-500 shadow-sm">
          <MousePointerClick size={12} className="text-[#1e3a8a]" />
          Click a district to explore detailed analytics
        </div>
      )}

      {districts.length > 0 && !loading && (
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
