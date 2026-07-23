import { useEffect, useState } from "react";
import { useMap } from "react-map-gl/maplibre";

const PRIORITY_LEGEND_ITEMS = [
  { label: "Critical Blackspot", color: "#4C1D1D", score: "≥ 200" },
  { label: "Very High Risk", color: "#7F1D1D", score: "140 - 199" },
  { label: "High Risk", color: "#DC2626", score: "90 - 139" },
  { label: "Medium Risk", color: "#EA580C", score: "60 - 89" },
  { label: "Low Risk", color: "#F97316", score: "30 - 59" },
  { label: "Identified Blackspot", color: "#FBBF24", score: "< 30" },
];

interface PriorityLegendProps {
  visualizationLayerType?: string;
}

export default function PriorityLegend({
  visualizationLayerType,
}: PriorityLegendProps) {
  const { current: map } = useMap();
  const [zoom, setZoom] = useState(map?.getZoom() || 0);

  useEffect(() => {
    if (!map) return;
    const onZoom = () => setZoom(map.getZoom());
    map.on("zoom", onZoom);
    setZoom(map.getZoom());
    return () => {
      map.off("zoom", onZoom);
    };
  }, [map]);

  const type = visualizationLayerType || "";
  let isVisible = false;

  if (type.includes("network_blackspot")) {
    isVisible = true;
  } else if (type.includes("blackspot")) {
    isVisible = true; // Show for other blackspots as well
  }

  if (!isVisible) return null;

  return (
    <div className="absolute bottom-6 right-3 z-20 bg-white/95 backdrop-blur-sm border border-slate-200 shadow-lg rounded-xl px-4 py-3 pointer-events-auto">
      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
        Blackspot Priority
      </h4>
      <div className="flex flex-col gap-2">
        {PRIORITY_LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <div
              className="w-4 h-1.5 rounded-sm shrink-0 shadow-sm"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-[11px] font-medium text-slate-600 flex-1 whitespace-nowrap">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
