/**
 * @file SeverityLegend.tsx
 * @description Map overlay component that displays a legend for accident severity colors.
 * @responsibility Automatically shows or hides itself based on the current map zoom level and the active visualization layer type to prevent cluttering overview maps.
 */
import { useEffect, useState } from "react";
import { useMap } from "react-map-gl/maplibre";
import { SEVERITY_LEGEND_PALETTE as SEVERITY_LEGEND_ITEMS } from "../../config/themeConfig";

interface SeverityLegendProps {
  visualizationLayerType?: string;
  showMarkers?: boolean;
}

/**
 * SeverityLegend Component
 * @state_management Tracks the map's current `zoom` level to evaluate visibility logic.
 * @hooks_usage Uses `useMap` to access Maplibre, and `useEffect` to listen to native "zoom" events.
 * @param {Object} props - Component properties.
 * @param {string} [props.visualizationLayerType] - The active map layer type (e.g., "clusters", "density_heatmap", "blackspot_greedy").
 */
export default function SeverityLegend({
  visualizationLayerType,
  showMarkers,
}: SeverityLegendProps) {
  const { current: map } = useMap();

  const type = visualizationLayerType || "";

  let isVisible = !!showMarkers;

  if (
    type === "clusters" ||
    type === "snapped_accidents"
  ) {
    isVisible = true;
  }

  if (!isVisible) return null;

  return (
    <div className="absolute bottom-7 right-3 z-20 bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-lg rounded-xl p-2.5 pointer-events-auto">
      <h4 className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
        Accident Severity
      </h4>
      <div className="flex flex-col gap-1.5">
        {SEVERITY_LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm ring-1 ring-black/10"
              style={{ backgroundColor: item.color }}
            />
            <span className="font-medium text-slate-700 text-[10.5px] leading-tight">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
