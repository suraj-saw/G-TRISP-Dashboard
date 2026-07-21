import { useEffect, useState } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import { Loader2 } from "lucide-react";
import type { DashboardFilters } from "../../types/dashboard";

interface Props {
  filters: DashboardFilters;
  fetchFn: (filters: DashboardFilters) => Promise<any>;
  analysisLabel?: string;
}

interface HoveredSegment {
  longitude: number;
  latitude: number;
  road_id: string;
  start_m: number;
  end_m: number;
  score: number;
  accident_count: number;
}

export default function NetworkBlackspotLayers({
  filters,
  fetchFn,
  analysisLabel = "Network-Constrained Blackspots",
}: Props) {
  const { current: mapRef } = useMap();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<HoveredSegment | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchFn(filters);
        if (mounted) {
          setData(result);
        }
      } catch (err) {
        if (mounted) {
          console.error("Failed to load network blackspots:", err);
          setError("Failed to analyze network blackspots.");
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

    const onMove = (e: any) => {
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

  if (loading) {
    return (
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg border border-slate-200 flex items-center space-x-2 z-50">
        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
        <span className="text-sm font-medium text-slate-700">
          Computing network blackspots...
        </span>
      </div>
    );
  }

  if (error || !data) return null;

  return (
    <>
      <Source id="network-blackspots-source" type="geojson" data={data}>
        <Layer
          id="network-blackspot-line-bg"
          type="line"
          paint={{
            "line-color": "#FFFFFF",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 15, 10],
            "line-opacity": 0.8,
            "line-blur": 2,
          }}
        />
        <Layer
          id="network-blackspot-line"
          type="line"
          paint={{
            "line-color": "#DC2626", // Red
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 15, 6],
            "line-opacity": 0.9,
          }}
        />
      </Source>

      {hovered && (
        <Popup
          longitude={hovered.longitude}
          latitude={hovered.latitude}
          anchor="bottom"
          closeButton={false}
          closeOnClick={false}
          offset={12}
          className="accident-popup"
        >
          <div className="bg-white rounded-lg shadow-xl overflow-hidden" style={{ minWidth: 200, fontFamily: "inherit" }}>
            <div className="bg-red-600 text-white px-3 py-1.5 text-xs font-bold uppercase tracking-wide">
              {analysisLabel}
            </div>
            <div className="p-3 text-sm text-slate-700 space-y-2">
              <div>
                <span className="font-bold text-lg text-red-600 leading-none">{hovered.accident_count}</span>
                <span className="text-slate-500 ml-1 text-xs uppercase tracking-wide">crashes in segment</span>
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-2 border-t border-slate-100">
                <div className="text-slate-500 text-xs">Road ID</div>
                <div className="font-medium text-right text-xs truncate">{hovered.road_id}</div>
                <div className="text-slate-500 text-xs">Length</div>
                <div className="font-medium text-right text-xs">{(hovered.end_m - hovered.start_m).toFixed(0)}m</div>
                <div className="text-slate-500 text-xs">Severity Score</div>
                <div className="font-medium text-right text-xs">{hovered.score}</div>
              </div>
            </div>
          </div>
        </Popup>
      )}
    </>
  );
}
