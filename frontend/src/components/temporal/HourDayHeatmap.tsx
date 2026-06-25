import type { HourDayCount } from "../../types/dashboard";
import { WEEKDAY_ORDER } from "../../config/constants";

interface Props {
  data: HourDayCount[];
}

const hourLabel = (hour: number): string => {
  if (hour === 0) return "12a";
  if (hour === 12) return "12p";
  return hour < 12 ? `${hour}a` : `${hour - 12}p`;
};

// ---------------------------------------------------------------------------
// Colour scale for the heatmap cells — ordered low → high
// ---------------------------------------------------------------------------
const HEATMAP_COLORS = [
  { threshold: 0.82, color: "#B91C1C" },
  { threshold: 0.62, color: "#EF4444" },
  { threshold: 0.42, color: "#F97316" },
  { threshold: 0.22, color: "#F59E0B" },
] as const;

const HEATMAP_COLOR_LOW = "#FDE68A";
const HEATMAP_COLOR_EMPTY = "#F1F5F9";

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

export default function HourDayHeatmap({ data }: Props) {
  const lookup = new Map(
    data.map((item) => [`${item.day}-${item.hour}`, item.count])
  );
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
        <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400">
          <span>Low</span>
          <span className="h-2.5 w-5 rounded-sm bg-[#FDE68A]" />
          <span className="h-2.5 w-5 rounded-sm bg-[#F97316]" />
          <span className="h-2.5 w-5 rounded-sm bg-[#B91C1C]" />
          <span>High</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[820px]">
          <div className="grid grid-cols-[72px_repeat(24,minmax(22px,1fr))] gap-1">
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
