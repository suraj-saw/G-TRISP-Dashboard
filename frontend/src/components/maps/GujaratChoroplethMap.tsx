/**
 * @file GujaratChoroplethMap.tsx
 * @description A D3-based interactive choropleth map of Gujarat districts.
 * @responsibility Fetches district boundaries (GeoJSON) and summary accident counts, renders them as SVG paths, and scales their fill color proportionally to the accident counts. Handles routing to specific district dashboards on click.
 * @dependencies d3-geo (projection/path), d3-scale (color scaling), lucide-react (status indicators).
 */

import { useEffect, useState, useRef, useCallback } from "react";

import { useNavigate } from "react-router-dom";

import { geoMercator, geoPath } from "d3-geo";

import { scaleSqrt } from "d3-scale";

import { Loader2, AlertCircle } from "lucide-react";

import { fetchAllGujaratDistricts } from "../../api/geoApi";

import { fetchGujaratDistrictSummary } from "../../api/gujaratDashboardApi";

import { buildDistrictDashboardPath } from "../../config/constants";

import { useDistrictInsights } from "../../context/DistrictInsightsContext";

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



/**
 * GujaratChoroplethMap Component
 * @state_management Manages data arrays (`districts`), UI state (`loading`, `error`), and `hoveredSlug` for localized DOM updates.
 * @hooks_usage Heavy use of `useEffect` for data fetching + geometry normalizing (D3 winding rules), and `useCallback` for event handlers.
 */
export default function GujaratChoroplethMap() {

  const navigate = useNavigate();

  const { setHoveredDistrict } = useDistrictInsights();

  const containerRef = useRef<HTMLDivElement>(null);

  const tooltipRef = useRef<HTMLDivElement>(null);

  const hoveredSlugRef = useRef<string | null>(null);



  const [districts, setDistricts] = useState<DistrictFeature[]>([]);

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



        const colorScale = scaleSqrt<string>()

          .domain([0, maxVal])

          .range(["#EAF0FE", "#1E3A8A"]);



        // D3's spherical projections require clockwise exterior rings and

        // counter-clockwise holes. The legacy data had the opposite winding,

        // while the SOI data is already clockwise; blindly reversing every

        // ring therefore makes D3 draw the complement of Gujarat (a world-

        // sized rectangle). Normalize by signed area instead.

        /**
         * Calculates the signed area of a GeoJSON coordinate ring using the shoelace formula.
         * @param {GeoJSON.Position[]} ring - Array of coordinate pairs.
         * @returns {number} Signed area (negative indicates clockwise winding).
         */
        const signedArea = (ring: GeoJSON.Position[]) => {

          let area = 0;

          for (let i = 0; i < ring.length; i++) {

            const current = ring[i];

            const next = ring[(i + 1) % ring.length];

            area += current[0] * next[1] - next[0] * current[1];

          }

          return area / 2;

        };



        /**
         * Enforces strict winding rules for a ring based on D3's expectations.
         * @param {GeoJSON.Position[]} ring - The coordinate ring.
         * @param {boolean} clockwise - Target winding direction.
         * @returns {GeoJSON.Position[]} Oriented ring.
         */
        const orientRing = (

          ring: GeoJSON.Position[],

          clockwise: boolean

        ): GeoJSON.Position[] => {

          const isClockwise = signedArea(ring) < 0;

          return isClockwise === clockwise ? ring : [...ring].reverse();

        };



        const orientPolygon = (rings: GeoJSON.Position[][]) =>

          rings.map((ring, index) => orientRing(ring, index === 0));



        /**
         * Recursively normalizes Polygon/MultiPolygon winding to fix the "inverse world mask" bug in D3 spherical projections.
         * @business_rule D3 requires exterior rings to be clockwise and interior holes counter-clockwise.
         * @param {GeoJSON.Geometry} geometry - Original geometry.
         * @returns {GeoJSON.Geometry} Properly oriented geometry.
         */
        const orientGeometry = (geometry: GeoJSON.Geometry): GeoJSON.Geometry => {

          if (geometry.type === "Polygon") {

            return { ...geometry, coordinates: orientPolygon(geometry.coordinates) };

          }

          if (geometry.type === "MultiPolygon") {

            return {

              ...geometry,

              coordinates: geometry.coordinates.map(orientPolygon),

            };

          }

          return geometry;

        };



        const collection: GeoJSON.FeatureCollection = {

          type: "FeatureCollection",

          features: geoData.features.map((feature) => ({

            ...feature,

            geometry: orientGeometry(feature.geometry),

          })),

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



      // Offset the tooltip slightly more so it doesn't block the cursor

      tip.style.left = `${e.clientX - rect.left + 20}px`;

      tip.style.top = `${e.clientY - rect.top + 20}px`;



      // Improved Tooltip UI using Tailwind classes directly in innerHTML

      tip.innerHTML = `

      <div class="flex flex-col gap-0.5">

        <span class="text-[13px] font-bold text-slate-800">${name}</span>

        

      </div>

    `;

      tip.style.opacity = "1";



      if (hoveredSlugRef.current !== slug) {

        hoveredSlugRef.current = slug;

        setHoveredSlug(slug);

        setHoveredDistrict(name);

      }

    },

    [setHoveredDistrict]

  );



  const handleMouseLeave = useCallback(() => {

    const tip = tooltipRef.current;

    if (tip) tip.style.opacity = "0";

    hoveredSlugRef.current = null;

    setHoveredSlug(null);

    setHoveredDistrict(null);

  }, [setHoveredDistrict]);



  const handleClick = useCallback(

    (slug: string) => {

      if (slug) navigate(buildDistrictDashboardPath(slug));

    },

    [navigate]

  );



  return (

    <div

      ref={containerRef}

      // Color Theory: Radial gradient focuses attention on the center map

      className="absolute inset-0 flex items-center justify-center overflow-hidden"

      style={{

        backgroundImage:

          "radial-gradient(circle at center, #FFFFFF 0%, #F1F5F9 100%)",

      }}

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

          style={{

            display: "block",

            width: "100%",

            height: "100%",

            maxWidth: "100%",

            maxHeight: "100%",

            // Add a very subtle drop shadow to the entire map shape

            filter: "drop-shadow(0px 10px 15px rgba(30, 58, 138, 0.08))",

          }}

        >

          {/* Layer 1: Base Map */}

          {districts.map((dist) => {

            return (

              <path

                key={dist.slug}

                d={dist.d}

                fill={dist.fill}

                stroke="#CBD5E1" // Soft slate border for un-hovered districts

                strokeWidth={0.75}

                style={{ cursor: "pointer", transition: "fill 0.3s ease" }}

                onMouseMove={(e) => handleMouseMove(e, dist.slug, dist.name)}

                onMouseLeave={handleMouseLeave}

                onClick={() => handleClick(dist.slug)}

              />

            );

          })}



          {/* Layer 2: Highlight Overlay (Drawn last, so it stays perfectly on top) */}

          {hoveredSlug && (

            <path

              d={districts.find((d) => d.slug === hoveredSlug)?.d || ""}

              fill="rgba(255, 255, 255, 0.2)" // Slightly higher brightness bump on hover

              stroke="#1E293B" // Deep, crisp slate/navy border instead of orange

              strokeWidth={2.5}

              className="pointer-events-none transition-all duration-200"

            />

          )}

        </svg>

      )}



      {/* Updated Tooltip UI styling */}

      <div

        ref={tooltipRef}

        className="pointer-events-none absolute z-30 rounded-xl bg-white/95 px-3 py-2 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)] border border-slate-100 backdrop-blur-sm transition-opacity duration-150"

        style={{ opacity: 0, left: 0, top: 0 }}

      />



      {/* {!loading && (

        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 rounded-full bg-white/90 border border-[#E4E8F4] px-3 py-1.5 text-[11px] font-medium text-slate-500 shadow-sm">

          <MousePointerClick size={12} className="text-[#1e3a8a]" />

          Click a district to explore detailed analytics

        </div>

      )} */}



      {/* {districts.length > 0 && !loading && (

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

      )} */}

    </div>

  );

} 

