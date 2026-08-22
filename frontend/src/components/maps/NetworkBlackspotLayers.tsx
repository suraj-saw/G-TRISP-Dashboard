import { useEffect, useState, useRef } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import { Loader2, AlertCircle } from "lucide-react";
import type { DashboardFilters, SnappedHeatmapPoint } from "../../types/dashboard";
import CompactBlackspotPopup from "./CompactBlackspotPopup";

const SEVERITY_COLORS = {
  Fatal: "#78350F",
  "Grievous Injury": "#EA580C",
  "Minor Injury Hospitalized": "#EAB308",
  "Minor Injury Non Hospitalized": "#0284C7",
  "No Injury": "#16A34A",
  default: "#64748B",
} as const;

const severityColorExpression = [
  "case",
  ["in", "fatal", ["downcase", ["coalesce", ["get", "severity"], ""]]],
  SEVERITY_COLORS.Fatal,
  ["in", "grievous", ["downcase", ["coalesce", ["get", "severity"], ""]]],
  SEVERITY_COLORS["Grievous Injury"],
  [
    "in",
    "minor injury hospitalized",
    ["downcase", ["coalesce", ["get", "severity"], ""]],
  ],
  SEVERITY_COLORS["Minor Injury Hospitalized"],
  [
    "in",
    "minor injury non",
    ["downcase", ["coalesce", ["get", "severity"], ""]],
  ],
  SEVERITY_COLORS["Minor Injury Non Hospitalized"],
  [
    "any",
    ["in", "no injury", ["downcase", ["coalesce", ["get", "severity"], ""]]],
    ["in", "damage only", ["downcase", ["coalesce", ["get", "severity"], ""]]],
  ],
  SEVERITY_COLORS["No Injury"],
  SEVERITY_COLORS.default,
] as const;

interface Props {
  filters: DashboardFilters;
  fetchFn: (filters: DashboardFilters) => Promise<unknown>;
  fetchSnappedPointsFn?: (filters: DashboardFilters) => Promise<{ total: number; data: SnappedHeatmapPoint[] }>;
  analysisLabel?: string;
  crashLabel?: string;
}




interface HoveredSegment {
  longitude: number;
  latitude: number;
  road_id: string;
  start_m: number;
  end_m: number;
  score: number;
  accident_count: number;
  priority_label?: string;
  priority_color?: string;
  qualifying_count?: number;
  fatal_count?: number;
  grievous_count?: number;
  minor_hospitalized_count?: number;
  minor_non_hospitalized_count?: number;
  vehicle_count?: number;
}

export default function NetworkBlackspotLayers({
  filters,
  fetchFn,
  fetchSnappedPointsFn,
  analysisLabel = "Network-Constrained Blackspots",
  crashLabel: _crashLabel = "crashes",
}: Props) {
  const { current: mapRef } = useMap();
  
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<HoveredSegment | null>(null);
  const isOverPopupRef = useRef(false);






  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchFn(filters);
        if (mounted) {
          setData(result as GeoJSON.FeatureCollection);
        }
      } catch (err: unknown) {
        if (mounted) {
          console.error("Failed to load network blackspots:", err);
          const error = err as { response?: { status?: number; data?: { detail?: string } }; message?: string };
          setError(
            error?.response?.status
              ? `Request failed (${error.response.status}): ${error.response.data?.detail || error.message}`
              : error?.message || "Failed to analyze network blackspots."
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [filters, fetchFn]);

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;

    const onMove = (e: import("react-map-gl/maplibre").MapLayerMouseEvent) => {
      if (isOverPopupRef.current) return;
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["network-blackspot-line"],
      });
      if (features.length > 0) {
        map.getCanvas().style.cursor = "pointer";
        const f = features[0];
        setHovered({
          longitude: e.lngLat.lng,
          latitude: e.lngLat.lat,
          road_id: f.properties?.road_id,
          start_m: f.properties?.start_m,
          end_m: f.properties?.end_m,
          score: f.properties?.score,
          accident_count: f.properties?.accident_count,
          priority_label: f.properties?.priority_label,
          priority_color: f.properties?.priority_color,
          qualifying_count: f.properties?.qualifying_count,
          fatal_count: f.properties?.fatal_count,
          grievous_count: f.properties?.grievous_count,
          minor_hospitalized_count: f.properties?.minor_hospitalized_count,
          minor_non_hospitalized_count: f.properties?.minor_non_hospitalized_count,
          vehicle_count: f.properties?.vehicle_count,
        });
      } else {
        map.getCanvas().style.cursor = "";
        setHovered(null);
      }
    };

    const onLeave = () => {
      map.getCanvas().style.cursor = "";
      setHovered(null);
    };

    map.on("mousemove", onMove);
    map.on("mouseout", onLeave);

    return () => {
      map.off("mousemove", onMove);
      map.off("mouseout", onLeave);
      map.getCanvas().style.cursor = "";
    };
  }, [mapRef]);

  const StatusBadge = ({ children }: { children: React.ReactNode }) => (
    <div className="pointer-events-none absolute top-4 left-4 z-20">
      <div className="pointer-events-auto rounded-full border border-slate-200/50 bg-white/90 px-3 py-2 shadow-xl backdrop-blur-md text-[11px] font-medium text-slate-700 flex items-center gap-2 transition-all duration-300 hover:bg-white/95">
        {children}
      </div>
    </div>
  );

  if (loading) {
    return (
      <StatusBadge>
        <Loader2 size={14} className="animate-spin text-indigo-500" />
        Running {analysisLabel}…
      </StatusBadge>
    );
  }

  if (error) {
    return (
      <StatusBadge>
        <AlertCircle size={14} className="text-red-500" />
        <span className="text-red-600 font-semibold">{error}</span>
      </StatusBadge>
    );
  }

  if (!data || data.features?.length === 0) {
    return (
      <StatusBadge>
        <AlertCircle size={14} className="text-amber-500" />
        <span>
          No network segments found for the given criteria.
        </span>
      </StatusBadge>
    );
  }

  return (
    <>
      <Source id="network-blackspots-source" type="geojson" data={data}>
        <Layer
          id="network-blackspot-line-bg"
          type="line"
          paint={{
            "line-color": "#FFFFFF",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 6, 15, 14],
            "line-opacity": 0.8,
            "line-blur": 1,
          }}
        />
        <Layer
          id="network-blackspot-line"
          type="line"
          paint={{
            "line-color": ["coalesce", ["get", "priority_color"], "#DC2626"],
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 15, 6],
            "line-opacity": 1.0,
          }}
        />
      </Source>




      {hovered && (
        <Popup
          longitude={hovered.longitude}
          latitude={hovered.latitude}
          closeButton={false}
          closeOnClick={false}
          offset={14}
          className="z-50 accident-popup"
        >
          <CompactBlackspotPopup
            data={{
              ...hovered,
              bs_id: "Segment",
              priority_label:
                hovered.priority_label?.replace(/Blackspot/gi, "Segment") ??
                "Unknown Segment",
            }}
            segmentM={
              hovered.end_m && hovered.start_m
                ? hovered.end_m - hovered.start_m
                : undefined
            }
            onMouseEnter={() => {
              isOverPopupRef.current = true;
            }}
            onMouseLeave={() => {
              isOverPopupRef.current = false;
              setHovered(null);
            }}
          />
        </Popup>
      )}
    </>
  );
}
