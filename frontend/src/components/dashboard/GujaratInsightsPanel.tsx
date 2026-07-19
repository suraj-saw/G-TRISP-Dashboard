/**
 * @file GujaratInsightsPanel.tsx
 * @description Renders a high-level summary panel for the map view, dynamically switching between statewide aggregates and specific district data based on user hover/selection.
 * @responsibility Consumes the global DistrictInsightsContext, aggregates severity and high-risk zone data, and renders animated KPI tiles and charts.
 * @dependencies framer-motion (animations), recharts (charting), lucide-react (icons), useDistrictInsights (context).
 */
import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  Loader2, AlertCircle, Skull, Car, ShieldCheck, MapPinOff, Activity
} from "lucide-react";
import { useDistrictInsights } from "../../context/DistrictInsightsContext";
import { useCountUp } from "../../hooks/useCountUp";

const C = {
  primary: "#1e3a8a",
  secondary: "#2C6EF2",
  danger: "#ef4444",
  success: "#10b981",
  neutral: "#94a3b8",
};

const SEVERITY_COLORS: Record<string, string> = {
  Fatal: "#ef4444",
  "Grievous Injury": "#f97316",
  "Minor Injury": "#f59e0b",
  "Minor Injury Non Hospitalized": "#eab308",
  "Minor Injury Hospitalized": "#f59e0b",
  "Damage Only": "#94a3b8",
  "No Injury": "#94a3b8",
};

const RISK_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  Low:         { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  Moderate:    { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-500"   },
  High:        { bg: "bg-orange-50",  text: "text-orange-700",  dot: "bg-orange-500"  },
  "Very High": { bg: "bg-red-50",     text: "text-red-700",     dot: "bg-red-500"     },
};

/**
 * Define explicit sort order for severity levels in the legend and pie chart
 */
const SEVERITY_ORDER = [
  "Fatal",
  "Grievous Injury",
  "Minor Injury Hospitalized",
  "Minor Injury Non Hospitalized",
  "No Injury",
];

const getSeverityRank = (label: string) => {
  const idx = SEVERITY_ORDER.indexOf(label);
  return idx === -1 ? 99 : idx;
};

const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  fontSize: 11,
  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
  background: "#fff",
};
const FADE = { duration: 0.22, ease: "easeInOut" as const };

/**
 * Renders an individual KPI tile with an animated counting number effect.
 * @param {Object} props - KPI properties.
 * @param {React.ReactNode} props.icon - Lucide icon.
 * @param {string} props.label - KPI title.
 * @param {number} props.value - The raw number to animate up to.
 * @param {string} props.tone - Base color string applied to the icon background and text.
 */
function KpiTile({ icon, label, value, tone }: {
  icon: React.ReactNode; label: string; value: number; tone: string;
}) {
  const animated = useCountUp(value, 300);
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3 flex items-center gap-2.5 shadow-sm">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${tone}18`, color: tone }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[15px] font-extrabold text-slate-800 tabular-nums leading-none">
          {animated.toLocaleString("en-IN")}
        </p>
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-1 truncate">
          {label}
        </p>
      </div>
    </div>
  );
}

/**
 * Small informational cell used within the District Snapshot block.
 */
function SnapshotCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 truncate">{label}</p>
      <p className="text-[11.5px] font-bold text-slate-700 truncate mt-0.5">{value}</p>
    </div>
  );
}

/**
 * Custom Recharts tooltip for the Severity Pie chart, displaying percentages relative to the total.
 */
function SeverityTooltip({ active, payload, total }: {
  active?: boolean;
  payload?: { name: string; value: number }[];
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
  return (
    <div style={tooltipStyle} className="px-3 py-2 text-[11px]">
      <p className="font-bold text-slate-700">{name}</p>
      <p className="text-slate-400 mt-0.5">
        {value.toLocaleString("en-IN")} <span className="font-black text-slate-700">&bull; {pct}%</span>
      </p>
    </div>
  );
}

/**
 * GujaratInsightsPanel Component
 * @responsibility Manages the display of aggregated insights. Toggles between whole-state data and single-district data based on the map interaction context.
 * @state_management Relies entirely on `useDistrictInsights` context. Extracts hover state (`hoveredDistrict`) and fetched geographic aggregates (`gujarat`, `active`).
 * @data_flow District hover triggers re-render -> contextual data (state vs district) is selected -> passed to memoized chart data generators -> rendered.
 * @rendering_flow Handles 4 main views: Loading, Error/Unavailable, Empty District, and Populated Data (Statewide or District-specific). Animations handled by Framer Motion's AnimatePresence.
 */
export default function GujaratInsightsPanel() {
  const {
    gujaratLoading, districtsReady, error, gujarat,
    hoveredDistrict, getDistrict, getDistrictStatus,
  } = useDistrictInsights();

  const status  = hoveredDistrict ? getDistrictStatus(hoveredDistrict) : null;
  const active  = hoveredDistrict && status === "found" ? getDistrict(hoveredDistrict) : undefined;
  const isDistrictView    = Boolean(active);
  const isEmptyDistrict   = status === "empty";
  const isPendingDistrict = status === "pending";
  const isUnavailable     = status === "unavailable";

  const title = isDistrictView
    ? `${active!.district} Insights`
    : isEmptyDistrict || isPendingDistrict
      ? `${hoveredDistrict} Insights`
      : "Gujarat Accident Insights";

  /** 
   * Determines which dataset (state vs district) to use for the pie chart, filtering out zeroes.
   * [MODIFICATION] Added sorting based on custom SEVERITY_ORDER for consistent visual layout.
   */
  const severityData = useMemo(() => {
    const raw = isDistrictView ? active!.severity : (gujarat?.severity ?? []);
    return raw
      .filter((s) => s.count > 0)
      .sort((a, b) => getSeverityRank(a.label) - getSeverityRank(b.label));
  }, [isDistrictView, active, gujarat]);

  /** Calculates total severity for percentage calculations in the pie chart legend and tooltip. */
  const severityTotal = useMemo(
    () => severityData.reduce((sum, d) => sum + d.count, 0),
    [severityData]
  );

  /** 
   * Aggregates the most dangerous zones specifically for the statewide view.
   * @formatting Removes 'Police Station' text from labels to prevent truncation in the small Y-axis.
   */
  const topDangerous = useMemo(
    () => (gujarat?.dangerous || [])
      .filter((d) => d.fatal_accidents > 0)
      .map((d) => ({
        name: d.district.replace(/ Police Station$/i, "").trim(),
        fatal: d.fatal_accidents,
      })),
    [gujarat]
  );

  if (gujaratLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <Loader2 size={24} className="animate-spin text-[#2C6EF2]" />
        <p className="text-sm font-semibold text-slate-400">Loading insights...</p>
      </div>
    );
  }
  if (error || !gujarat) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-red-500">
        <AlertCircle size={22} />
        <p className="text-sm font-semibold">{error || "No data available"}</p>
      </div>
    );
  }
  if (isPendingDistrict) {
    return (
      <div className="flex flex-col gap-2 h-full min-h-0">
        <h2 className="text-sm font-bold text-slate-700">{hoveredDistrict}</h2>
        <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
          <Loader2 size={11} className="animate-spin text-[#2C6EF2]" />
          Preparing district insights...
        </p>
      </div>
    );
  }
  if (isEmptyDistrict) {
    return (
      <div className="flex flex-col gap-2 h-full min-h-0">
        <h2 className="text-sm font-bold text-slate-700">{title}</h2>
        <div className="flex-1 flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6">
          <MapPinOff size={26} className="text-slate-300 mb-2" />
          <p className="text-sm font-bold text-slate-500">No accident data</p>
          <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">No recorded accidents for {hoveredDistrict}.</p>
        </div>
      </div>
    );
  }
  if (isUnavailable) {
    return (
      <div className="flex flex-col gap-2 h-full min-h-0">
        <h2 className="text-sm font-bold text-slate-700">{hoveredDistrict}</h2>
        <div className="flex-1 flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-amber-200 bg-amber-50/50 p-6">
          <AlertCircle size={26} className="text-amber-400 mb-2" />
          <p className="text-sm font-bold text-slate-500">District unavailable</p>
          <p className="text-[10px] text-slate-400 mt-1">Try refreshing the page.</p>
        </div>
      </div>
    );
  }

  /**
   * Calculate the total number of crashes with "Fatal" or "Grievous Injury" severity.
   * Note: We intentionally avoid wrapping this in a `useMemo` hook because this code
   * executes AFTER several early `return` statements (for loading/error states). 
   * Calling a hook after an early return violates React's "Rules of Hooks" and crashes the app.
   * This array operation is very fast on a small (~6 elements) array, so memoization isn't necessary.
   */
  const fatalGrievousCrashes = severityData
    .filter((s) => s.label === "Fatal" || s.label === "Grievous Injury")
    .reduce((sum, s) => sum + s.count, 0);

  /**
   * Calculate the total number of crashes with any kind of "Minor" severity.
   * This aggregates all three variations of minor injuries defined in the system.
   * As above, no `useMemo` is used to prevent hooks violation after early returns.
   */
  const minorCrashes = severityData
    .filter(
      (s) =>
        s.label === "Minor Injury" ||
        s.label === "Minor Injury Hospitalized" ||
        s.label === "Minor Injury Non Hospitalized"
    )
    .reduce((sum, s) => sum + s.count, 0);

  /**
   * Define the three KPI cards to be displayed in the insights panel.
   * Automatically switches between district-level (active) and state-level (gujarat) data 
   * for the "Accidents" total based on the `isDistrictView` flag.
   */
  const kpis = [
    {
      icon: <Car size={15} />,
      label: "Accidents",
      value: isDistrictView ? active!.total_accidents : gujarat.total_accidents,
      tone: C.primary,
    },
    {
      icon: <Skull size={15} />,
      label: "Fatal & Grievous",
      value: fatalGrievousCrashes,
      tone: C.danger,
    },
    {
      icon: <Activity size={15} />,
      label: "Minor Injuries",
      value: minorCrashes,
      tone: "#f59e0b",
    },
  ];

  const risk = active ? (RISK_STYLES[active.risk_level] ?? RISK_STYLES.Low) : null;

  return (
    <div className="flex h-full flex-col gap-2.5">

      {/* Header */}
      <AnimatePresence mode="wait">
        <motion.div
          key={title}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={FADE}
          className="flex items-start justify-between gap-2"
        >
          <div className="min-w-0">
            {/* <div className="flex items-center gap-1.5 mb-0.5">
              {isDistrictView
                ? <MapPinned size={11} className="text-[#2C6EF2] shrink-0" />
                : <Users size={11} className="text-[#2C6EF2] shrink-0" />}
              <span className="text-[9px] font-bold uppercase tracking-widest text-[#2C6EF2]">
                {isDistrictView ? "District View" : "State Overview"}
              </span>
            </div> */}
            <h2 className="text-[14px] font-black text-slate-800 leading-tight truncate">{title}</h2>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {isDistrictView ? "District-level summary" : "State-wide summary across all districts"}
            </p>
          </div>
          {risk && (
            <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${risk.bg} ${risk.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${risk.dot}`} />
              {active!.risk_level} Risk
            </span>
          )}
        </motion.div>
      </AnimatePresence>

      {/* KPI tiles */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`kpi-${title}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={FADE}
          className="grid grid-cols-3 gap-2"
        >
          {kpis.map((k) => <KpiTile key={k.label} {...k} />)}
        </motion.div>
      </AnimatePresence>

      {/* District Snapshot */}
      <AnimatePresence mode="wait">
        {isDistrictView && (
          <motion.div
            key={`snap-${active!.district}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
            className="rounded-xl border border-slate-100 bg-slate-50/80 p-3"
          >
            <p className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5 mb-2 uppercase tracking-wider">
              <ShieldCheck size={11} className="text-[#1e3a8a]" />
              District Snapshot
            </p>
            <div className="grid grid-cols-2 gap-2">
              <SnapshotCell label="Fatality rate" value={`${active!.fatality_rate}%`} />
              <SnapshotCell label="Peak time"     value={active!.peak_accident_time} />
              <SnapshotCell label="Top station"   value={active!.most_affected_police_station} />
              <SnapshotCell label="Peak month"    value={active!.highest_accident_month} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Severity Distribution */}
      <div className="rounded-xl border border-slate-100 bg-white p-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[11.5px] font-bold text-slate-700">Severity Distribution</p>
          <span className="text-[9.5px] text-slate-400 font-semibold">
            {isDistrictView ? `In ${active!.district}` : "Statewide"}
          </span>
        </div>
        <AnimatePresence mode="wait">
          {severityData.length > 0 ? (
            <motion.div
              key={`sev-${title}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE}
              className="flex items-center gap-3"
              style={{ height: 160 }}
            >
              {/* Donut — explicit pixel dimensions so ResponsiveContainer works */}
              <div style={{ width: "44%", height: 160 }} className="shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={severityData}
                      dataKey="count"
                      nameKey="label"
                      cx="50%" cy="50%"
                      innerRadius="50%" outerRadius="82%"
                      paddingAngle={2}
                      stroke="none"
                    >
                      {severityData.map((e) => (
                        <Cell key={e.label} fill={SEVERITY_COLORS[e.label] || C.neutral} />
                      ))}
                    </Pie>
                    <Tooltip content={<SeverityTooltip total={severityTotal} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Legend */}
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                {severityData.map((d) => {
                  const pct = severityTotal > 0
                    ? ((d.count / severityTotal) * 100).toFixed(1)
                    : "0.0";
                  return (
                    <div key={d.label} className="flex items-center gap-1.5 text-[10.5px] text-slate-600 min-w-0">
                      <span className="w-2 h-2 rounded-sm shrink-0"
                        style={{ background: SEVERITY_COLORS[d.label] || C.neutral }} />
                      <span className="truncate">{d.label}</span>
                      {/* Show raw count alongside percentage */}
                      <div className="ml-auto flex items-center gap-1.5 shrink-0 tabular-nums">
                        <span className="font-bold text-slate-700">
                          {d.count.toLocaleString("en-IN")}
                        </span>
                        <span className="text-slate-400 font-semibold text-[9.5px]">
                          ({pct}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ) : (
            <div className="flex items-center justify-center py-8 text-xs text-slate-400">No data</div>
          )}
        </AnimatePresence>
      </div>

      {/* Most Fatal Districts — Gujarat view only */}
      {!isDistrictView && (
        <div className="rounded-xl border border-slate-100 bg-white p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11.5px] font-bold text-slate-700">Most Fatal Districts</p>
            <span className="text-[9.5px] text-slate-400 font-semibold">by fatal accidents</span>
          </div>
          {topDangerous.length > 0 ? (
            /* Explicit pixel height — required for ResponsiveContainer height="100%" */
            <div style={{ height: 170 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topDangerous}
                  layout="vertical"
                  margin={{ left: 4, right: 40, top: 2, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={76}
                    tick={{ fontSize: 10, fill: "#334155" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f8fafc" }}
                    formatter={(v: any) => [v.toLocaleString("en-IN"), "Fatal accidents"]} />
                  <Bar dataKey="fatal" name="Fatal accidents" fill="#ef4444"
                    radius={[0, 4, 4, 0]} barSize={10}
                    label={{ position: "right", fontSize: 10, fontWeight: 700, fill: "#ef4444",
                      formatter: (v: any) => v.toLocaleString("en-IN") }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-xs text-slate-400">No data</div>
          )}
        </div>
      )}

      {!districtsReady && (
        <p className="text-center text-[9px] text-slate-300 shrink-0">Preparing district data...</p>
      )}
    </div>
  );
}