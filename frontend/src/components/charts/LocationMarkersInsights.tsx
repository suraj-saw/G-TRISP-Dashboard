// frontend/src/components/charts/LocationMarkersInsights.tsx
import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  Treemap,
} from "recharts";
import type { DashboardData } from "../../types/dashboard";

/* ═══════════════════════════════════════════════════════════════════════════
   DESIGN SYSTEM
   A clean, modern, white-space heavy design for premium analytics.
   ═══════════════════════════════════════════════════════════════════════════ */

const C = {
  primary:   "#4f46e5", // Indigo 600
  secondary: "#818cf8", // Indigo 400
  success:   "#10b981", // Emerald 500
  warning:   "#f59e0b", // Amber 500
  danger:    "#ef4444", // Red 500
  neutral:   "#64748b", // Slate 500
  ink:       "#0f172a", // Slate 900
  body:      "#334155", // Slate 700
  sub:       "#94a3b8", // Slate 400
  grid:      "#f1f5f9", // Slate 100
  axis:      "#e2e8f0", // Slate 200
  axisTx:    "#94a3b8", // Slate 400
};

const SEVERITY_COLORS: Record<string, string> = {
  "Fatal":                          "#ef4444",
  "Grievous Injury":                "#f97316",
  "Minor Injury":                   "#f59e0b",
  "Minor Injury Hospitalized":      "#f59e0b",
  "Minor Injury Non Hospitalized":  "#fbbf24",
  "Damage Only":                    "#94a3b8",
  "No Injury":                      "#10b981",
};

const TREEMAP_COLORS = [
  "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe", "#dbeafe", "#eff6ff"
];

const CASUALTY_COLORS = { killed: "#ef4444", grievous: "#f97316", minor: "#f59e0b" };

const TOOLTIP_WRAPPER = { zIndex: 60, pointerEvents: "none" as const, outline: "none" };

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #f1f5f9",
        borderRadius: "8px",
        padding: "12px 16px",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)",
        animation: "tipIn 150ms ease-out",
      }}
    >
      {label && (
        <p style={{ color: C.ink, fontSize: "13px", margin: "0 0 8px", fontWeight: 600 }}>
          {label}
        </p>
      )}
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color || p.payload?.fill, display: "inline-block" }} />
          <span style={{ color: C.body, fontSize: "12px", flex: 1, paddingRight: 12 }}>{p.name}:</span>
          <span style={{ color: C.ink, fontSize: "12px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{Number(p.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function Card({ title, subtitle, children, className = "" }: {
  title: string; subtitle?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`flex flex-col bg-white rounded-2xl border border-slate-100 shadow-sm ${className}`}>
      <div className="px-6 pt-6 pb-4">
        <h3 className="text-base font-semibold text-slate-800 leading-tight">{title}</h3>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      <div className="px-5 pb-6 flex-1">{children}</div>
    </div>
  );
}

function LegendRow({ items }: { items: { color: string; label: string; value?: number }[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 pt-6">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2 whitespace-nowrap">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: it.color }} />
          <span className="text-[13px] font-medium text-slate-600">{it.label}</span>
          {it.value != null && (
            <span className="text-[13px] font-bold text-slate-800 tabular-nums">{it.value.toLocaleString()}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function KpiCard({ label, value, highlightColor }: {
  label: string; value: number; highlightColor: string;
}) {
  return (
    <div className="bg-white rounded-2xl px-5 py-6 border border-slate-100 shadow-sm flex flex-col relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-1 h-full transition-all duration-300 opacity-80" style={{ backgroundColor: highlightColor }} />
      <span className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-2 pl-2">
        {label}
      </span>
      <span className="text-[32px] font-extrabold text-slate-800 tabular-nums leading-none pl-2 transition-transform duration-300 group-hover:scale-[1.02] origin-left">
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function TreemapContent({ x, y, width, height, name, count, fill }: any) {
  if (width < 20 || height < 20) return null;

  const showText = width > 70 && height > 45;
  const fontSize = Math.min(13, Math.max(10, Math.min(width, height) / 5));

  return (
    <g>
      <rect
        x={x} y={y}
        width={width} height={height}
        fill={fill}
        stroke="#ffffff"
        strokeWidth={2}
        rx={6}
      />
      {showText && (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 - 4}
            textAnchor="middle" fill="#ffffff" fontSize={fontSize} fontWeight={600}>
            {name}
          </text>
          <text
            x={x + width / 2}
            y={y + height / 2 + 12}
            textAnchor="middle" fill="rgba(255,255,255,0.85)"
            fontSize={fontSize - 2} fontWeight={500}>
            {Number(count).toLocaleString()}
          </text>
        </>
      )}
    </g>
  );
}

export default function LocationMarkersInsights({ data }: { data: DashboardData }) {
  const s = data.summary;

  const severityData = useMemo(() =>
    (data.severity || []).filter(d => d.count > 0), [data.severity]);

  const severityTotal = useMemo(() =>
    severityData.reduce((acc, d) => acc + d.count, 0), [severityData]);

  const topDangerous = useMemo(() =>
    [...(data.dangerous || [])]
      .sort((a, b) => b.fatal_accidents - a.fatal_accidents)
      .slice(0, 8) // Limit to 8 for cleaner look
      .map(d => ({
        name: String(d.district || "").replace(/ Police Station$/i, "").trim(),
        fatal: d.fatal_accidents,
        killed: d.total_killed,
      })),
    [data.dangerous]);

  const roadData = useMemo(() =>
    [...(data.roads || [])].sort((a, b) => b.accident_count - a.accident_count),
    [data.roads]);

  const weatherData = useMemo(() =>
    [...(data.weather || [])]
      .filter(w => w.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6) // Focus on top 6 for cleaner spacing
      .map(w => ({
        name: String(w.name || w.weather_condition || "").replace(/\//g, "/ "),
        count: w.count,
      })),
    [data.weather]);

  const lightData = useMemo(() =>
    [...(data.light || [])]
      .filter(l => l.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .map(l => ({ name: l.name || l.light_condition || "", count: l.count })),
    [data.light]);

  const collisionData = useMemo(() =>
    (data.violations || [])
      .filter(v => v.count > 0)
      .map(v => ({
        subject: String(v.name || v.traffic_violation || "")
          .replace("Vehicle to ", "V→")
          .replace("Fallen down while ", "Fall: ")
          .slice(0, 14),
        count: v.count,
      })),
    [data.violations]);

  const casualtyData = useMemo(() =>
    (data.casualty || []).filter(c => c.killed + c.grievous + c.minor > 0),
    [data.casualty]);

  const roadTreemap = useMemo(() =>
    roadData.map((r, i) => ({
      name: r.road_classification || "Unknown",
      count: r.accident_count,
      fill: TREEMAP_COLORS[Math.min(i, TREEMAP_COLORS.length - 1)],
    })),
    [roadData]);

  return (
    <div className="flex flex-col gap-6 p-2 rounded-2xl bg-slate-50/50">
      <style>{`
        @keyframes tipIn { from { opacity: 0; transform: translateY(8px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <linearGradient id="gradPrimary" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4f46e5" />
            <stop offset="100%" stopColor="#818cf8" />
          </linearGradient>
          <linearGradient id="radarGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.05} />
          </linearGradient>
        </defs>
      </svg>

      <div className="px-2 pt-2 pb-2">
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Accident Insights</h2>
        <p className="text-sm text-slate-500 mt-1">Detailed analysis based on current active map filters</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard label="Accidents" value={s.total_accidents} highlightColor={C.primary} />
        <KpiCard label="Fatalities" value={s.total_fatalities} highlightColor={C.danger} />
        <KpiCard label="Grievous" value={s.total_grievous} highlightColor={C.warning} />
        <KpiCard label="Minor Injured" value={s.total_minor} highlightColor="#fbbf24" />
        <KpiCard label="Damage Only" value={s.total_damage_only} highlightColor={C.neutral} />
        <KpiCard label="Vehicles" value={s.total_vehicles} highlightColor={C.secondary} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Severity Distribution" subtitle="Proportion of accident outcomes">
          {severityData.length > 0 ? (
            <>
              <div className="relative">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={severityData} dataKey="count" nameKey="severity"
                      cx="50%" cy="50%" outerRadius={100} innerRadius={70}
                      paddingAngle={4} stroke="none" cornerRadius={6}
                      animationDuration={800}>
                      {severityData.map(e => (
                        <Cell key={e.severity} fill={SEVERITY_COLORS[e.severity] || C.neutral} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} wrapperStyle={TOOLTIP_WRAPPER} />
                  </PieChart>
                </ResponsiveContainer>
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none"
                  style={{ height: 260 }}
                >
                  <span className="text-[32px] font-bold text-slate-800 leading-none tabular-nums tracking-tight">
                    {severityTotal.toLocaleString()}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mt-2">Total</span>
                </div>
              </div>
              <LegendRow items={severityData.map(d => ({
                color: SEVERITY_COLORS[d.severity] || C.neutral,
                label: d.severity,
                value: d.count,
              }))} />
            </>
          ) : (
            <div className="flex items-center justify-center h-[260px] text-sm text-slate-400">No data available</div>
          )}
        </Card>

        <Card title="High Risk Zones" subtitle="Areas with highest fatal accidents">
          {topDangerous.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={topDangerous} layout="vertical"
                  margin={{ left: 0, right: 10, top: 10, bottom: 0 }} barGap={2} barCategoryGap={12}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: C.axisTx }} axisLine={{ stroke: C.axis }} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: C.body, fontWeight: 500 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} wrapperStyle={TOOLTIP_WRAPPER} cursor={{ fill: C.grid }} />
                  <Bar dataKey="fatal" name="Fatal Accidents" fill={C.danger} radius={[0, 4, 4, 0]} barSize={8} animationDuration={800} />
                  <Bar dataKey="killed" name="Total Killed" fill="#fca5a5" radius={[0, 4, 4, 0]} barSize={8} animationDuration={800} />
                </BarChart>
              </ResponsiveContainer>
              <LegendRow items={[
                { color: C.danger, label: "Fatal Accidents" },
                { color: "#fca5a5", label: "Total Killed" },
              ]} />
            </>
          ) : (
            <div className="flex items-center justify-center h-[260px] text-sm text-slate-400">No data available</div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Road Classification" subtitle="Accident distribution by road type">
          {roadTreemap.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <Treemap data={roadTreemap} dataKey="count" nameKey="name"
                stroke="none" animationDuration={800} content={<TreemapContent />}>
                <Tooltip content={<ChartTooltip />} wrapperStyle={TOOLTIP_WRAPPER} />
              </Treemap>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-sm text-slate-400">No data available</div>
          )}
        </Card>

        <Card title="Weather Conditions" subtitle="Accident frequency by weather">
          {weatherData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={weatherData} layout="vertical"
                margin={{ left: 0, right: 10, top: 10, bottom: 0 }} barCategoryGap={16}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: C.axisTx }} axisLine={{ stroke: C.axis }} tickLine={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: C.body, fontWeight: 500 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} wrapperStyle={TOOLTIP_WRAPPER} cursor={{ fill: C.grid }} />
                <Bar dataKey="count" name="Accidents" fill="url(#gradPrimary)" radius={[0, 4, 4, 0]} barSize={14} animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-sm text-slate-400">No data available</div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Light Conditions" subtitle="Visibility at time of accident">
          {lightData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={lightData} layout="vertical"
                margin={{ left: 0, right: 10, top: 10, bottom: 0 }} barCategoryGap={16}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: C.axisTx }} axisLine={{ stroke: C.axis }} tickLine={false} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12, fill: C.body, fontWeight: 500 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} wrapperStyle={TOOLTIP_WRAPPER} cursor={{ fill: C.grid }} />
                <Bar dataKey="count" name="Accidents" fill={C.secondary} radius={[0, 4, 4, 0]} barSize={14} animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-sm text-slate-400">No data available</div>
          )}
        </Card>

        <Card title="Collision Patterns" subtitle="Distribution of collision types">
          {collisionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={collisionData} cx="50%" cy="50%" outerRadius="75%"
                margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                <PolarGrid stroke={C.grid} />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: C.body, fontWeight: 500 }} />
                <PolarRadiusAxis tick={{ fontSize: 9, fill: C.sub }} axisLine={false} stroke={C.axis} />
                <Radar name="Accidents" dataKey="count"
                  stroke={C.primary} fill="url(#radarGrad)" strokeWidth={2}
                  dot={{ r: 3, fill: C.primary, strokeWidth: 0 }} animationDuration={800} />
                <Tooltip content={<ChartTooltip />} wrapperStyle={TOOLTIP_WRAPPER} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-sm text-slate-400">No data available</div>
          )}
        </Card>
      </div>

      {casualtyData.length > 0 ? (
        <Card title="Casualty Breakdown" subtitle="Killed, grievous & minor injuries by victim type">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={casualtyData} margin={{ left: 0, right: 10, top: 10, bottom: 20 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
              <XAxis dataKey="category" tick={{ fontSize: 12, fill: C.body, fontWeight: 500 }}
                interval={0} axisLine={{ stroke: C.axis }} tickLine={false} dy={8} />
              <YAxis tick={{ fontSize: 11, fill: C.axisTx }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} wrapperStyle={TOOLTIP_WRAPPER} cursor={{ fill: C.grid }} />
              <Bar dataKey="killed"   fill={CASUALTY_COLORS.killed}   name="Killed"   radius={[4, 4, 0, 0]} barSize={20} animationDuration={800} />
              <Bar dataKey="grievous" fill={CASUALTY_COLORS.grievous} name="Grievous" radius={[4, 4, 0, 0]} barSize={20} animationDuration={800} />
              <Bar dataKey="minor"    fill={CASUALTY_COLORS.minor}    name="Minor"    radius={[4, 4, 0, 0]} barSize={20} animationDuration={800} />
            </BarChart>
          </ResponsiveContainer>
          <LegendRow items={[
            { color: CASUALTY_COLORS.killed,   label: "Killed" },
            { color: CASUALTY_COLORS.grievous, label: "Grievous" },
            { color: CASUALTY_COLORS.minor,    label: "Minor" },
          ]} />
        </Card>
      ) : (
        <Card title="Casualty Breakdown" subtitle="Killed, grievous & minor injuries by victim type">
          <div className="flex items-center justify-center h-[300px] text-sm text-slate-400">No data available</div>
        </Card>
      )}
    </div>
  );
}
