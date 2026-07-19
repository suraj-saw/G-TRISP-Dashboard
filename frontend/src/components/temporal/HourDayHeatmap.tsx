
/**
 * @file HourDayHeatmap.tsx
 * @description Renders a dense 24x7 heatmap visualization of accident frequency by hour and day of the week.
 * @responsibility Maps 2D temporal data (hour vs day) into a color-scaled CSS grid, ensuring consistent weekday ordering.
 */
import type { HourDayCount } from "../../types/dashboard";
import { WEEKDAY_ORDER } from "../../config/constants";

interface Props {
  data: HourDayCount[];
}

/**
 * Formats a 24-hour integer into a compact 12-hour string (e.g., 0 -> "12a", 13 -> "1p").
 * @param {number} hour - Integer from 0 to 23.
 */
const hourLabel = (hour: number): string => {
  if (hour === 0) return "12a";
  if (hour === 12) return "12p";
  return hour < 12 ? `${hour}a` : `${hour - 12}p`;
};

// ---------------------------------------------------------------------------
// Colour scale for the heatmap cells — ordered low → high
// ---------------------------------------------------------------------------
// [MODIFICATION] Updated to a professional, low-contrast ColorBrewer-inspired scale 
// (Light Green -> Yellow -> Red) for a smoother, less jarring visual gradient.
const HEATMAP_COLORS = [
  { threshold: 0.82, color: "#e31a1c" }, // Strong Red (Peak)
  { threshold: 0.62, color: "#fdae61" }, // Soft Orange
  { threshold: 0.42, color: "#fee08b" }, // Soft Yellow
  { threshold: 0.22, color: "#a1d99b" }, // Soft Green
] as const;

const HEATMAP_COLOR_LOW = "#e5f5e0"; // Very Light Green
const HEATMAP_COLOR_EMPTY = "#F1F5F9";

/**
 * Determines the cell color based on the ratio of its count to the global maximum.
 * @business_rule Scales colors relative to the dataset's peak, ensuring the heatmap highlights relative severity regardless of absolute volume.
 * @param {number} count - Accident count for the specific cell.
 * @param {number} max - Maximum accident count across all cells in the current dataset.
 */
const colorFor = (count: number, max: number): string => {
  if (!count || !max) return HEATMAP_COLOR_EMPTY;
  const ratio = count / max;
  for (const { threshold, color } of HEATMAP_COLORS) {
    if (ratio > threshold) return color;
  }
  return HEATMAP_COLOR_LOW;
};

// How frequently to render an hour label (every N hours)
const HOUR_LABEL_INTERVAL = 3;

/**
 * HourDayHeatmap Component
 * @param {Object} props - Component properties.
 * @param {HourDayCount[]} props.data - Array of accident counts mapped to a specific day and hour.
 */
export default function HourDayHeatmap({ data }: Props) {
  /** 
   * Pre-computes a O(1) lookup map for fast grid rendering.
   * Key format: "DayName-Hour" (e.g., "Monday-14").
   */
  const lookup = new Map(
    data.map((item) => [`${item.day}-${item.hour}`, item.count])
  );
  
  /** Computes the global maximum to calibrate the color scale. */
  const max = Math.max(0, ...data.map((item) => item.count));

  return (
    <div className="rounded-xl border border-[#E4E8F4] bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-bold text-slate-900">
            Hour vs Day Heatmap
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Accident concentration by weekday and hour
          </p>
        </div>
        {/* [MODIFICATION] Updated legend swatches to reflect the smoother Green-Yellow-Red scale */}
        <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400">
          <span>Low</span>
          <span className="h-2.5 w-5 rounded-sm bg-[#a1d99b]" />
          <span className="h-2.5 w-5 rounded-sm bg-[#fee08b]" />
          <span className="h-2.5 w-5 rounded-sm bg-[#e31a1c]" />
          <span>High</span>
        </div>
      </div>

      <div className="w-full">
        <div className="w-full">
          <div className="grid grid-cols-[72px_repeat(24,minmax(0,1fr))] gap-1">
            {/* Hour header row */}
            <div />
            {Array.from({ length: 24 }, (_, hour) => (
              <div
                key={hour}
                className="text-center text-[10px] font-semibold text-slate-400"
              >
                {hour % HOUR_LABEL_INTERVAL === 0 ? hourLabel(hour) : ""}
              </div>
            ))}

            {/* Day rows — driven by WEEKDAY_ORDER so order is consistent with backend */}
            {WEEKDAY_ORDER.map((day) => (
              <>
                <div
                  key={`${day}-label`}
                  className="flex items-center text-[11px] font-semibold text-slate-500"
                >
                  {day.slice(0, 3)}
                </div>
                {Array.from({ length: 24 }, (_, hour) => {
                  const count = lookup.get(`${day}-${hour}`) || 0;
                  return (
                    <div
                      key={`${day}-${hour}`}
                      title={`${day}, ${hour}:00 — ${count} accident${count !== 1 ? "s" : ""}`}
                      className="h-7 rounded-[5px] border border-white transition hover:scale-110 hover:ring-2 hover:ring-[#2C6EF2]/20"
                      style={{ backgroundColor: colorFor(count, max) }}
                    />
                  );
                })}
              </>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


