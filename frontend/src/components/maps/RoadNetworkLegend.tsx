import { useEffect, useState } from "react";
import { useMap } from "react-map-gl/maplibre";

const ROAD_NETWORK_LEGEND_ITEMS = [
  { label: "Arterial Road", color: "#DB2777" },
  { label: "Collector Road", color: "#D97706" },
  { label: "Expressway", color: "#4C1D95" },
  { label: "Local Road", color: "#14B8A6" },
  { label: "Major District Road", color: "#2563EB" },
  { label: "National Highway", color: "#DC2626" },
  { label: "Other District Road", color: "#0891B2" },
  { label: "State Highway", color: "#F97316" },
  { label: "Sub-Arterial Road", color: "#F43F5E" },
  { label: "Village Road", color: "#16A34A" },
  { label: "Unknown", color: "#9CA3AF" },
];

interface RoadNetworkLegendProps {
  isVisible: boolean;
}

export default function RoadNetworkLegend({ isVisible }: RoadNetworkLegendProps) {
  if (!isVisible) return null;

  return (
    <div className="absolute bottom-6 right-3 z-20 bg-white/95 backdrop-blur-sm border border-slate-200 shadow-lg rounded-xl px-4 py-3 pointer-events-auto">
      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
        Road Network
      </h4>
      <div className="flex flex-col gap-2">
        {ROAD_NETWORK_LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div
              className="w-4 h-1 shrink-0 shadow-sm rounded-sm"
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
