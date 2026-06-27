// frontend/src/components/maps/MapOverlays.tsx
//
// Floating GIS-style overlays for the density heatmap:
//   - DensityLegend   : gradient color bar (Low -> High accident density)
//   - MapStatsBadge   : total incidents + fatal count for the active filters
//   - MapTitleChip    : map title + active filter summary
//
// All are absolutely positioned and pointer-events friendly, so they sit on
// top of the map without blocking pan/zoom. Drop them inside the same relative
// container that wraps your <Map> (a sibling of <VisualizationLayers />).

import type { HeatmapPoint } from "../../types/dashboard";
import { HEATMAP_LEGEND_GRADIENT } from "../../config/Heapmapconfig";

// ---------------------------------------------------------------------------
// Density legend
// ---------------------------------------------------------------------------

export function DensityLegend() {
  return (
    <div className="pointer-events-none absolute bottom-6 left-4 z-10 select-none">
      <div className="rounded-xl border border-[#E4E8F4] bg-white/90 px-4 py-3 shadow-lg backdrop-blur-sm">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Accident Density
        </p>
        <div
          className="h-2.5 w-44 rounded-full"
          style={{ background: HEATMAP_LEGEND_GRADIENT }}
        />
        <div className="mt-1.5 flex justify-between text-[10px] font-medium text-slate-500">
          <span>Low</span>
          <span>Moderate</span>
          <span>High</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats badge
// ---------------------------------------------------------------------------

const isFatal = (severity?: string | null) =>
  (severity || "").toLowerCase().includes("fatal");

function formatNumber(n: number): string {
  return n.toLocaleString("en-IN");
}

export function MapStatsBadge({ data }: { data?: HeatmapPoint[] }) {
  const total = data?.length ?? 0;
  const fatal =
    data?.reduce((acc, p) => acc + (isFatal(p.severity) ? 1 : 0), 0) ?? 0;

  return (
    <div className="pointer-events-none absolute right-4 top-4 z-10 select-none">
      <div className="flex items-stretch gap-3 rounded-xl border border-[#E4E8F4] bg-white/90 px-4 py-2.5 shadow-lg backdrop-blur-sm">
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Accidents
          </span>
          <span className="text-lg font-bold leading-tight text-slate-800">
            {formatNumber(total)}
          </span>
        </div>
        <div className="w-px bg-[#E4E8F4]" />
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Fatal
          </span>
          <span className="text-lg font-bold leading-tight text-[#dc2626]">
            {formatNumber(fatal)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Title chip
// ---------------------------------------------------------------------------

export function MapTitleChip({
  title = "Accident Density",
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="pointer-events-none absolute left-4 top-4 z-10 select-none">
      <div className="rounded-xl border border-[#E4E8F4] bg-white/90 px-4 py-2.5 shadow-lg backdrop-blur-sm">
        <p className="text-sm font-bold leading-tight text-slate-800">
          {title}
        </p>
        {subtitle && (
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Convenience bundle — render all three for the density heatmap view.
// ---------------------------------------------------------------------------

export function DensityMapOverlays({
  data,
  subtitle,
}: {
  data?: HeatmapPoint[];
  subtitle?: string;
}) {
  return (
    <>
      <MapTitleChip title="Accident Density" subtitle={subtitle} />
      <MapStatsBadge data={data} />
      <DensityLegend />
    </>
  );
}
