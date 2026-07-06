// frontend/src/components/dashboard/GujaratInsightsPanel.tsx
import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  Loader2,
  AlertCircle,
  Skull,
  ShieldAlert,
  Activity,
  Car,
  MapPinned,
  Building2,
  Flame,
  ShieldCheck,
  MapPinOff,
} from "lucide-react";
import { useDistrictInsights } from "../../context/DistrictInsightsContext";
import { useCountUp } from "../../hooks/useCountUp";

const C = {
  primary: "#1e3a8a",
  secondary: "#2C6EF2",
  danger: "#ef4444",
  warning: "#f59e0b",
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
  Low: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  Moderate: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  High: { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
  "Very High": { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
};

const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid #E4E8F4",
  fontSize: 11,
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
};
const FADE = { duration: 0.25, ease: "easeInOut" as const };

function KpiTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
}) {
  const animated = useCountUp(value, 250);
  return (
    <div className="rounded-xl border border-[#E4E8F4] bg-white p-3 shadow-sm flex items-center gap-2.5 min-w-0">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${tone}1A`, color: tone }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-base font-extrabold text-slate-800 leading-none tabular-nums truncate">
          {animated.toLocaleString("en-IN")}
        </p>
        <p className="mt-1 text-[9.5px] font-semibold uppercase tracking-wide text-slate-400 truncate">
          {label}
        </p>
      </div>
    </div>
  );
}

function SnapshotCell({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400 truncate">
        {label}
      </p>
      <p className="text-[12px] font-bold text-slate-800 truncate mt-0.5">
        {value}
      </p>
    </div>
  );
}

export default function GujaratInsightsPanel() {
  const {
    gujaratLoading,
    districtsReady,
    error,
    gujarat,
    hoveredDistrict,
    getDistrict,
    getDistrictStatus,
  } = useDistrictInsights();

  const status = hoveredDistrict ? getDistrictStatus(hoveredDistrict) : null;
  const active =
    hoveredDistrict && status === "found"
      ? getDistrict(hoveredDistrict)
      : undefined;
  const isDistrictView = Boolean(active);
  const isEmptyDistrict = status === "empty";
  const isPendingDistrict = status === "pending";
  const isUnavailable = status === "unavailable";

  const title = isDistrictView
    ? `${active!.district} Accident Insights`
    : isEmptyDistrict || isPendingDistrict
      ? `${hoveredDistrict} Accident Insights`
      : "Gujarat Accident Insights";

  const severityData = useMemo(() => {
    const raw = isDistrictView ? active!.severity : (gujarat?.severity ?? []);
    return raw.filter((s) => s.count > 0);
  }, [isDistrictView, active, gujarat]);

  const topDangerous = useMemo(
    () =>
      (gujarat?.dangerous || []).map((d) => ({
        name: d.district.replace(/ Police Station$/i, "").trim(),
        fatal: d.fatal_accidents,
      })),
    [gujarat]
  );

  // Only the very first paint (fast aggregate fetch) shows a spinner.
  if (gujaratLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-slate-400">
        <Loader2 size={26} className="animate-spin mb-3 text-[#2C6EF2]" />
        <p className="text-sm font-semibold">Loading Gujarat insights…</p>
      </div>
    );
  }

  if (error || !gujarat) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-red-500 gap-2">
        <AlertCircle size={22} />
        <p className="text-sm font-semibold">{error || "No data available"}</p>
      </div>
    );
  }

  // Hovering a district before background data is ready — keep Gujarat KPIs
  // visible underneath, just flag that district detail is on its way.
  if (isPendingDistrict) {
    return (
      <div className="flex flex-col gap-3 h-full min-h-0 opacity-90">
        <div>
          <h2 className="text-base font-bold text-slate-800">
            {hoveredDistrict}
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
            <Loader2 size={11} className="animate-spin text-[#2C6EF2]" />
            Preparing district insights…
          </p>
        </div>
      </div>
    );
  }

  // Genuinely no accident records for this district.
  if (isEmptyDistrict) {
    return (
      <div className="flex flex-col gap-3 h-full min-h-0">
        <div>
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            District-level summary
          </p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-[#E4E8F4] bg-[#FAFBFE] p-6">
          <MapPinOff size={28} className="text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-600">
            No accident data available
          </p>
          <p className="text-[11px] text-slate-400 mt-1 max-w-[220px]">
            There are no recorded accidents for {hoveredDistrict} in the current
            dataset.
          </p>
        </div>
      </div>
    );
  }

  // Bulk fetch genuinely failed — say so honestly instead of "no data".
  if (isUnavailable) {
    return (
      <div className="flex flex-col gap-3 h-full min-h-0">
        <div>
          <h2 className="text-base font-bold text-slate-800">
            {hoveredDistrict}
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            District-level summary
          </p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-amber-200 bg-amber-50/50 p-6">
          <AlertCircle size={28} className="text-amber-400 mb-3" />
          <p className="text-sm font-bold text-slate-600">
            District insights unavailable
          </p>
          <p className="text-[11px] text-slate-400 mt-1 max-w-[220px]">
            Couldn't load detailed data for {hoveredDistrict} right now. Try
            refreshing the page.
          </p>
        </div>
      </div>
    );
  }

  const kpis = isDistrictView
    ? [
        {
          icon: <Car size={14} />,
          label: "Accidents",
          value: active!.total_accidents,
          tone: C.primary,
        },
        {
          icon: <Skull size={14} />,
          label: "Fatalities",
          value: active!.fatalities,
          tone: C.danger,
        },
        {
          icon: <ShieldAlert size={14} />,
          label: "Grievous",
          value: active!.grievous_injuries,
          tone: C.warning,
        },
        {
          icon: <Activity size={14} />,
          label: "Minor",
          value: active!.minor_injuries,
          tone: C.secondary,
        },
        {
          icon: <Building2 size={14} />,
          label: "Stations",
          value: active!.police_stations,
          tone: C.neutral,
        },
        {
          icon: <Flame size={14} />,
          label: "Blackspots",
          value: active!.blackspots_count,
          tone: "#DC2626",
        },
      ]
    : [
        {
          icon: <Car size={14} />,
          label: "Accidents",
          value: gujarat.total_accidents,
          tone: C.primary,
        },
        {
          icon: <Skull size={14} />,
          label: "Fatalities",
          value: gujarat.total_fatalities,
          tone: C.danger,
        },
        {
          icon: <ShieldAlert size={14} />,
          label: "Grievous",
          value: gujarat.total_grievous,
          tone: C.warning,
        },
        {
          icon: <Activity size={14} />,
          label: "Minor",
          value: gujarat.total_minor,
          tone: C.secondary,
        },
        {
          icon: <MapPinned size={14} />,
          label: "Districts",
          value: gujarat.districts_covered,
          tone: C.success,
        },
        {
          icon: <Building2 size={14} />,
          label: "Stations",
          value: gujarat.police_stations,
          tone: C.neutral,
        },
      ];

  const risk = active
    ? (RISK_STYLES[active.risk_level] ?? RISK_STYLES.Low)
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <AnimatePresence mode="wait">
        <motion.div
          key={title}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={FADE}
          className="flex items-center justify-between gap-2"
        >
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-800 truncate">
              {title}
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {isDistrictView
                ? "Live district-level summary"
                : "State-wide summary across all districts"}
            </p>
          </div>
          {risk && (
            <span
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${risk.bg} ${risk.text}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${risk.dot}`} />
              {active!.risk_level} Risk
            </span>
          )}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.div
          key={`kpi-${title}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={FADE}
          className="grid grid-cols-3 gap-2"
        >
          {kpis.map((k) => (
            <KpiTile key={k.label} {...k} />
          ))}
        </motion.div>
      </AnimatePresence>

      {/* Compact snapshot — replaces the taller vertical list, same footprint on both views */}
      <AnimatePresence mode="wait">
        {isDistrictView ? (
          <motion.div
            key={`snap-${active!.district}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
            className="rounded-2xl border border-[#E4E8F4] bg-white shadow-sm p-3.5"
          >
            <p className="text-[12px] font-bold text-slate-800 flex items-center gap-1.5 mb-2">
              <ShieldCheck size={12} className="text-[#1e3a8a]" />
              District Snapshot
            </p>
            <div className="grid grid-cols-2 gap-y-2.5 gap-x-3">
              <SnapshotCell
                label="Fatality rate"
                value={`${active!.fatality_rate}%`}
              />
              <SnapshotCell
                label="Peak time"
                value={active!.peak_accident_time}
              />
              <SnapshotCell
                label="Top station"
                value={active!.most_affected_police_station}
              />
              <SnapshotCell
                label="Peak month"
                value={active!.highest_accident_month}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Severity Distribution — the ONLY chart, sized to always fit */}
      <div className="rounded-2xl border border-[#E4E8F4] bg-white shadow-sm p-3.5 min-h-[250px] flex flex-col">
        <p className="text-[13px] font-bold text-slate-800">
          Severity Distribution
        </p>
        <p className="text-[10.5px] text-slate-400 mt-0.5">
          {isDistrictView
            ? `Accident outcomes in ${active!.district}`
            : "Share of accident outcomes statewide"}
        </p>
        <AnimatePresence mode="wait">
          {severityData.length > 0 ? (
            <motion.div
              key={`sev-${title}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE}
              className="h-[180px] flex items-center gap-3 mt-1"
            >
              <div className="w-[50%] h-[170px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={severityData}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius="55%"
                      outerRadius="85%"
                      paddingAngle={3}
                      stroke="none"
                    >
                      {severityData.map((e) => (
                        <Cell
                          key={e.label}
                          fill={SEVERITY_COLORS[e.label] || C.neutral}
                        />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-1.5 flex-1 min-w-0 overflow-y-auto no-scrollbar max-h-[130px]">
                {severityData.map((d) => (
                  <div
                    key={d.label}
                    className="flex items-center gap-1.5 text-[11px] text-slate-600 min-w-0"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        background: SEVERITY_COLORS[d.label] || C.neutral,
                      }}
                    />
                    <span className="truncate">{d.label}</span>
                    <span className="ml-auto font-semibold text-slate-800 tabular-nums">
                      {d.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
              No data
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Most Fatal Districts — Gujarat view only, hidden while a district is active to preserve height parity */}
      {!isDistrictView && (
        <div className="rounded-2xl border border-[#E4E8F4] bg-white shadow-sm p-3.5 flex-1 min-h-0 flex flex-col">
          <p className="text-[13px] font-bold text-slate-800">
            Most Fatal Districts
          </p>
          <p className="text-[10.5px] text-slate-400 mt-0.5">
            Top 6 by fatal accident count
          </p>
          {topDangerous.length > 0 ? (
            <div className="h-[170px] mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topDangerous}
                  layout="vertical"
                  margin={{ left: 0, right: 12, top: 4, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#F1F5F9"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 9.5, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={72}
                    tick={{ fontSize: 10.5, fill: "#334155" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: "#F1F5F9" }}
                  />
                  <Bar
                    dataKey="fatal"
                    name="Fatal accidents"
                    fill={C.danger}
                    radius={[0, 4, 4, 0]}
                    barSize={9}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
              No data
            </div>
          )}
        </div>
      )}

      {!districtsReady && (
        <p className="text-center text-[10px] text-slate-300">
          Preparing district hover data…
        </p>
      )}
    </div>
  );
}
