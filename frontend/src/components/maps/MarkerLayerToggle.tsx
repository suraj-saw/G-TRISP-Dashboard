/**
 * @file MarkerLayerToggle.tsx
 * @description A floating toggle UI that lets users show/hide the accident markers overlay on top of any visualization.
 * @responsibility Provides a compact, glassmorphic toggle control positioned above the coordinate status bar. Only visible when markers are NOT the primary visualization.
 */
import { MapPin } from "lucide-react";

interface MarkerLayerToggleProps {
  /** Whether the marker overlay layer is currently active */
  enabled: boolean;
  /** Toggle handler */
  onToggle: () => void;
}

/**
 * MarkerLayerToggle — a floating map overlay toggle (similar to CoordinateStatusBar).
 * Allows users to layer accident markers on top of Blackspot, Heatmap, or any other
 * active visualization type.
 */
export default function MarkerLayerToggle({
  enabled,
  onToggle,
}: MarkerLayerToggleProps) {
  return (
    <div className="absolute bottom-8 left-2 z-10">
      <button
        type="button"
        onClick={onToggle}
        className={`
          group flex items-center gap-2
          rounded-lg px-3 py-1.5
          text-[11px] font-semibold
          shadow-md border
          backdrop-blur-sm
          transition-all duration-200 ease-in-out
          cursor-pointer select-none
          ${
            enabled
              ? "bg-[#1e3a8a]/95 text-white border-[#1e3a8a] shadow-[#1e3a8a]/25"
              : "bg-white/90 text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-white"
          }
        `}
        title={enabled ? "Hide markers overlay" : "Show markers overlay"}
      >
        {/* Status indicator dot */}
        <span
          className={`
            relative flex h-2 w-2 shrink-0
          `}
        >
          {enabled && (
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
          )}
          <span
            className={`
              relative inline-flex h-2 w-2 rounded-full
              ${enabled ? "bg-emerald-400" : "bg-slate-300 group-hover:bg-slate-400"}
              transition-colors duration-200
            `}
          />
        </span>

        <MapPin
          size={12}
          className={`shrink-0 transition-colors duration-200 ${
            enabled ? "text-white/90" : "text-slate-500 group-hover:text-slate-700"
          }`}
        />

        <span className="tracking-wide">Markers Layer</span>

        {/* Toggle pill */}
        <span
          className={`
            relative inline-flex h-4 w-7 shrink-0 items-center rounded-full
            transition-colors duration-200
            ${enabled ? "bg-emerald-400/80" : "bg-slate-200 group-hover:bg-slate-300"}
          `}
        >
          <span
            className={`
              inline-block h-3 w-3 rounded-full bg-white shadow-sm
              transition-transform duration-200
              ${enabled ? "translate-x-3.5" : "translate-x-0.5"}
            `}
          />
        </span>
      </button>
    </div>
  );
}
