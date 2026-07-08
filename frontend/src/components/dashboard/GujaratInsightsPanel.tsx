// frontend/src/components/dashboard/GujaratInsightsPanel.tsx
import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  Loader2, AlertCircle, Skull, Car, ShieldCheck, MapPinOff,
  Users, MapPinned,
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

const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  fontSize: 11,
  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
  background: "#fff",
};
const FADE = { duration: 0.22, ease: "easeInOut" as const };

// KPI tile
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

// Snapshot cell
function SnapshotCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 truncate">{label}</p>
      <p className="text-[11.5px] font-bold text-slate-700 truncate mt-0.5">{value}</p>
    </div>
  );
}

// Pie tooltip
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

// Main component
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

  const severityData = useMemo(() => {
    const raw = isDistrictView ? active!.severity : (gujarat?.severity ?? []);
    return raw.filter((s) => s.count > 0);
  }, [isDistrictView, active, gujarat]);

  const severityTotal = useMemo(
    () => severityData.reduce((sum, d) => sum + d.count, 0),
    [severityData]
  );

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

  // KPIs: both views show Accidents + Fatalities only
  const kpis = isDistrictView
    ? [
        { icon: <Car size={15} />,   label: "Accidents",  value: active!.total_accidents, tone: C.primary },
        { icon: <Skull size={15} />, label: "Fatalities", value: active!.fatalities,      tone: C.danger  },
      ]
    : [
        { icon: <Car size={15} />,   label: "Accidents",  value: gujarat.total_accidents,  tone: C.primary },
        { icon: <Skull size={15} />, label: "Fatalities", value: gujarat.total_fatalities,  tone: C.danger  },
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
            <div className="flex items-center gap-1.5 mb-0.5">
              {isDistrictView
                ? <MapPinned size={11} className="text-[#2C6EF2] shrink-0" />
                : <Users size={11} className="text-[#2C6EF2] shrink-0" />}
              <span className="text-[9px] font-bold uppercase tracking-widest text-[#2C6EF2]">
                {isDistrictView ? "District View" : "State Overview"}
              </span>
            </div>
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
          className="grid grid-cols-2 gap-2"
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
                      <span className="ml-auto font-bold text-slate-700 tabular-nums shrink-0">{pct}%</span>
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