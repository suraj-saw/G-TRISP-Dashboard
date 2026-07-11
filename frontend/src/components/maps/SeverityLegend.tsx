import React, { useEffect, useState } from "react";
import { useMap } from "react-map-gl/maplibre";

const SEVERITY_LEGEND_ITEMS = [
  { label: "Fatal", color: "#B91C1C" },
  { label: "Grievous Injury", color: "#EA580C" },
  { label: "Minor Injury Hospitalized", color: "#F59E0B" },
  { label: "Minor Injury Non Hospitalized", color: "#FBBF24" },
  { label: "No Injury / Damage Only", color: "#65A30D" },
];

interface SeverityLegendProps {
  visualizationLayerType?: string;
}

export default function SeverityLegend({
  visualizationLayerType,
}: SeverityLegendProps) {
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

  if (type === "location_markers" || type === "clusters") {
    isVisible = true;
  } else if (type === "density_heatmap" || type.includes("blackspot")) {
    // Show legend only when zoom is 12 or greater (when individual points start showing)
    isVisible = zoom >= 12;
  }

  if (!isVisible) return null;

  return (
    <div className="absolute bottom-6 right-3 z-20 bg-white/95 backdrop-blur-sm border border-slate-200 shadow-lg rounded-xl px-4 py-3 pointer-events-auto">
      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
        Accident Severity
      </h4>
      <div className="flex flex-col gap-2">
        {SEVERITY_LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full shrink-0 shadow-sm"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-[11px] font-medium text-slate-600">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
