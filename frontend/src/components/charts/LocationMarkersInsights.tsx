// frontend/src/components/charts/LocationMarkersInsights.tsx
import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  Treemap,
} from "recharts";
import type { DashboardData } from "../../types/dashboard";

/* ═══════════════════════════════════════════════════════════════════════════
   DESIGN TOKENS
   ═══════════════════════════════════════════════════════════════════════════ */

const SEVERITY_COLORS: Record<string, string> = {
  "Fatal":                          "#991b1b",
  "Grievous Injury":                "#dc2626",
  "Minor Injury":                   "#f59e0b",
  "Minor Injury Hospitalized":      "#ea580c",
  "Minor Injury Non Hospitalized":  "#fb923c",
  "Damage Only":                    "#64748b",
  "No Injury":                      "#10b981",
};

const BLUE_SCALE = ["#0c2461","#1e3a8a","#1d4ed8","#2563eb","#3b82f6","#60a5fa","#93c5fd","#bfdbfe","#a5b4fc","#818cf8"];
const WARM_SCALE = ["#1e3a8a","#7c3aed","#db2777","#e11d48","#ea580c","#d97706","#059669","#0d9488","#0284c7","#6366f1"];
const DANGER_GRADIENT = ["#7f1d1d","#991b1b","#b91c1c","#dc2626","#ef4444","#f87171","#fca5a5","#fecaca","#fee2e2","#fff5f5"];
const CASUALTY_COLORS = { killed: "#991b1b", grievous: "#ea580c", minor: "#f59e0b" };

/* ═══════════════════════════════════════════════════════════════════════════
   CUSTOM TOOLTIP
   ═══════════════════════════════════════════════════════════════════════════ */

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12, padding: "10px 14px",
      boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
      backdropFilter: "blur(12px)",
    }}>
      {label && <p style={{ color: "#94a3b8", fontSize: 11, margin: "0 0 6px", fontWeight: 600 }}>{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, display: "inline-block" }} />
          <span style={{ color: "#cbd5e1", fontSize: 12 }}>{p.name}:</span>
          <span style={{ color: "#f1f5f9", fontSize: 12, fontWeight: 700 }}>{Number(p.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CARD WRAPPER
   ═══════════════════════════════════════════════════════════════════════════ */

function Card({ title, subtitle, accent, children }: {
  title: string; subtitle?: string; accent?: string; children: React.ReactNode;
}) {
  return (
    <div className="relative bg-white rounded-2xl border border-[#e2e8f0] overflow-hidden"
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 6px 24px rgba(0,0,0,0.03)" }}>
      {/* top accent line */}
      <div className="h-[3px] w-full" style={{ background: accent || "linear-gradient(90deg, #1e3a8a 0%, #3b82f6 100%)" }} />
      <div className="px-5 pt-4 pb-1">
        <h3 className="text-[14px] font-bold text-[#0f172a] tracking-[-0.01em]">{title}</h3>
        {subtitle && <p className="text-[11px] text-[#94a3b8] mt-0.5 font-medium">{subtitle}</p>}
      </div>
      <div className="px-4 pb-5 pt-1">{children}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   KPI CARD
   ═══════════════════════════════════════════════════════════════════════════ */

function KpiCard({ label, value, icon, gradient }: {
  label: string; value: number; icon: string; gradient: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl p-4" style={{
      background: gradient,
      boxShadow: "0 2px 8px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.15)",
    }}>
      {/* decorative circle */}
      <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full opacity-[0.08] bg-white" />
      <div className="absolute -right-1 -bottom-4 w-10 h-10 rounded-full opacity-[0.05] bg-white" />
      <div className="relative z-10">
        <span className="text-[13px] opacity-80">{icon}</span>
        <p className="text-[24px] font-extrabold text-white leading-none mt-1 tracking-tight">
          {value.toLocaleString()}
        </p>
        <p className="text-[10px] font-semibold text-white/70 uppercase tracking-wider mt-1">{label}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CUSTOM PIE LABEL
   ═══════════════════════════════════════════════════════════════════════════ */

function renderPieLabel({ cx, cy, midAngle, outerRadius, name, percent }: any) {
  if (percent < 0.03) return null;
  const RADIAN = Math.PI / 180;
  const r = outerRadius + 20;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  const label = name.length > 10 ? name.split(" ")[0] : name;
  return (
    <text x={x} y={y} fill="#475569" textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central" fontSize={11} fontWeight={600}>
      {label} {(percent * 100).toFixed(0)}%
    </text>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CUSTOM TREEMAP CONTENT
   ═══════════════════════════════════════════════════════════════════════════ */

function TreemapContent({ x, y, width, height, name, count, fill }: any) {
  if (width < 40 || height < 30) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={6}
        fill={fill} stroke="#fff" strokeWidth={2} style={{ filter: "brightness(1.05)" }} />
      {width > 55 && height > 36 && (
        <>
          <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle"
            fill="#fff" fontSize={Math.min(11, width / 8)} fontWeight={700}
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>
            {name?.slice(0, Math.floor(width / 7)) || ""}
          </text>
          <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle"
            fill="rgba(255,255,255,0.8)" fontSize={Math.min(10, width / 9)} fontWeight={600}>
            {Number(count).toLocaleString()}
          </text>
        </>
      )}
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function LocationMarkersInsights({ data }: { data: DashboardData }) {
  const s = data.summary;

  const severityData = useMemo(() =>
    (data.severity || []).filter(d => d.count > 0), [data.severity]);

  const topDangerous = useMemo(() =>
    [...(data.dangerous || [])]
      .sort((a, b) => b.fatal_accidents - a.fatal_accidents)
      .slice(0, 10)
      .map(d => ({
        name: d.district.replace(/ Police Station$/i, "").trim(),
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
      .slice(0, 8)
      .map((w, i) => ({
        name: (w.name || w.weather_condition).replace(/\//g, "/ "),
        count: w.count,
        fill: WARM_SCALE[i % WARM_SCALE.length],
      })),
    [data.weather]);

  const lightData = useMemo(() =>
    [...(data.light || [])]
      .filter(l => l.count > 0)
      .sort((a, b) => b.count - a.count)
      .map(l => ({ name: l.name || l.light_condition, count: l.count })),
    [data.light]);

  const collisionData = useMemo(() =>
    (data.violations || [])
      .filter(v => v.count > 0)
      .map(v => ({
        subject: (v.name || v.traffic_violation || "")
          .replace("Vehicle to ", "V→")
          .replace("Fallen down while ", "Fall: ")
          .slice(0, 16),
        count: v.count,
        fullCount: v.count,
      })),
    [data.violations]);

  const casualtyData = useMemo(() =>
    (data.casualty || []).filter(c => c.killed + c.grievous + c.minor > 0),
    [data.casualty]);

  // Treemap for road classification
  const roadTreemap = useMemo(() =>
    roadData.map((r, i) => ({
      name: r.road_classification,
      count: r.accident_count,
      fill: BLUE_SCALE[i % BLUE_SCALE.length],
    })),
    [roadData]);

  return (
    <div className="flex flex-col gap-5">
      {/* ── Section header ── */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl"
          style={{ background: "linear-gradient(135deg, #1e3a8a, #3b82f6)" }}>
          <span className="text-white text-sm">📊</span>
        </div>
        <div>
          <h2 className="text-[17px] font-extrabold text-[#0f172a] tracking-tight">Accident Analytics</h2>
          <p className="text-[11px] text-[#94a3b8] font-medium">Insights from current filters · Location Markers</p>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Accidents" value={s.total_accidents} icon="🚨"
          gradient="linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)" />
        <KpiCard label="Fatalities" value={s.total_fatalities} icon="💀"
          gradient="linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)" />
        <KpiCard label="Grievous" value={s.total_grievous} icon="🏥"
          gradient="linear-gradient(135deg, #9f1239 0%, #e11d48 100%)" />
        <KpiCard label="Minor Injured" value={s.total_minor} icon="🩹"
          gradient="linear-gradient(135deg, #c2410c 0%, #ea580c 100%)" />
        <KpiCard label="Damage Only" value={s.total_damage_only} icon="🚗"
          gradient="linear-gradient(135deg, #475569 0%, #64748b 100%)" />
        <KpiCard label="Vehicles" value={s.total_vehicles} icon="🛣️"
          gradient="linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%)" />
      </div>

      {/* ── Row 1: Severity donut + Top dangerous ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Severity Distribution" subtitle="Proportion of accident outcomes"
          accent="linear-gradient(90deg, #991b1b, #f59e0b)">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={severityData} dataKey="count" nameKey="severity"
                cx="50%" cy="48%" outerRadius={95} innerRadius={52}
                paddingAngle={3} label={renderPieLabel} labelLine={false}
                stroke="#fff" strokeWidth={2.5}>
                {severityData.map(e => (
                  <Cell key={e.severity} fill={SEVERITY_COLORS[e.severity] || "#94a3b8"}
                    style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.12))" }} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend iconType="circle" iconSize={8}
                wrapperStyle={{ fontSize: 11, paddingTop: 8, color: "#64748b" }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Top Dangerous Areas" subtitle="Ranked by fatal accidents & total killed"
          accent="linear-gradient(90deg, #7f1d1d, #ef4444)">
          {topDangerous.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topDangerous} layout="vertical"
                margin={{ left: 4, right: 20, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                <YAxis type="category" dataKey="name" width={95}
                  tick={{ fontSize: 10, fill: "#334155", fontWeight: 600 }}
                  axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="fatal" name="Fatal Accidents" radius={[0, 6, 6, 0]} barSize={10}>
                  {topDangerous.map((_, i) => (
                    <Cell key={i} fill={DANGER_GRADIENT[i]} />
                  ))}
                </Bar>
                <Bar dataKey="killed" fill="#fca5a5" name="Total Killed" radius={[0, 6, 6, 0]} barSize={10} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#64748b" }} iconType="circle" iconSize={8} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-sm text-[#94a3b8] font-medium">
              No data available for current filters
            </div>
          )}
        </Card>
      </div>

      {/* ── Row 2: Road type treemap + Weather ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Road Classification" subtitle="Accident distribution by road type"
          accent="linear-gradient(90deg, #1e3a8a, #60a5fa)">
          <ResponsiveContainer width="100%" height={280}>
            <Treemap data={roadTreemap} dataKey="count" nameKey="name"
              stroke="#fff" animationDuration={600}
              content={<TreemapContent />}>
              <Tooltip content={<ChartTooltip />} />
            </Treemap>
          </ResponsiveContainer>
        </Card>

        <Card title="Weather Conditions" subtitle="Top conditions during accidents"
          accent="linear-gradient(90deg, #7c3aed, #06b6d4)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={weatherData} layout="vertical"
              margin={{ left: 4, right: 20, top: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
              <YAxis type="category" dataKey="name" width={110}
                tick={{ fontSize: 10, fill: "#334155", fontWeight: 500 }}
                axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Accidents" radius={[0, 8, 8, 0]} barSize={14}>
                {weatherData.map((w, i) => <Cell key={i} fill={w.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* ── Row 3: Light conditions + Collision radar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Light Conditions" subtitle="Visibility at time of accident"
          accent="linear-gradient(90deg, #0369a1, #38bdf8)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={lightData} layout="vertical"
              margin={{ left: 4, right: 20, top: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
              <YAxis type="category" dataKey="name" width={130}
                tick={{ fontSize: 10, fill: "#334155", fontWeight: 500 }}
                axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Accidents" radius={[0, 8, 8, 0]} barSize={14}>
                {lightData.map((_, i) => <Cell key={i} fill={BLUE_SCALE[i % BLUE_SCALE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {collisionData.length > 0 && (
          <Card title="Collision Patterns" subtitle="Distribution of collision types"
            accent="linear-gradient(90deg, #4338ca, #a78bfa)">
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={collisionData} cx="50%" cy="50%" outerRadius="65%">
                <PolarGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <PolarAngleAxis dataKey="subject"
                  tick={{ fontSize: 9, fill: "#64748b", fontWeight: 500 }} />
                <PolarRadiusAxis tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} />
                <Radar name="Accidents" dataKey="count"
                  stroke="#4338ca" fill="url(#radarGrad)" strokeWidth={2} dot={{ r: 3, fill: "#4338ca" }} />
                <Tooltip content={<ChartTooltip />} />
                <defs>
                  <linearGradient id="radarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4338ca" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.08} />
                  </linearGradient>
                </defs>
              </RadarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      {/* ── Row 4: Casualty breakdown ── */}
      {casualtyData.length > 0 && (
        <Card title="Casualty Breakdown" subtitle="Killed, grievous & minor injuries by victim type"
          accent="linear-gradient(90deg, #991b1b, #f59e0b)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={casualtyData} margin={{ left: -4, right: 12, top: 8, bottom: 32 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="category" tick={{ fontSize: 10, fill: "#64748b", fontWeight: 500 }}
                angle={-20} textAnchor="end" interval={0}
                axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="killed"   fill={CASUALTY_COLORS.killed}   name="Killed"   radius={[6, 6, 0, 0]} barSize={20} />
              <Bar dataKey="grievous" fill={CASUALTY_COLORS.grievous} name="Grievous" radius={[6, 6, 0, 0]} barSize={20} />
              <Bar dataKey="minor"    fill={CASUALTY_COLORS.minor}    name="Minor"    radius={[6, 6, 0, 0]} barSize={20} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#64748b", paddingTop: 4 }}
                iconType="circle" iconSize={8} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}
