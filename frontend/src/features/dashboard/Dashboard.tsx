import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import AccidentGISMap from "../../components/maps/AccidentGISMap";
import AccidentHeatmap from "../../components/maps/AccidentHeatmap";
import DistrictHotspotMap from "../../components/maps/DistrictHotspotMap";
import AccidentMarkerMap from "../../components/maps/AccidentMarkerMap";
import BlackspotMap from "../../components/maps/BlackspotMap";

import {
  Activity,
  AlertTriangle,
  Car,
  Users,
  Building2,
  RadioTower,
  MapPin,
  ShieldAlert,
  CloudSun,
  Moon,
  Route,
  TrendingUp,
  Search,
  ChevronDown,
  RotateCcw,
  Filter,
  Sun,
} from "lucide-react";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

import { MetricCard } from "../../components/cards/MetricCard";
import { AccidentTrend } from "../../components/charts/AccidentTrend";
import { SeverityChart } from "../../components/charts/SeverityChart";
import { Panel } from "../../components/layout/Panel";
import { useDashboard } from "../../hooks/useDashboard";
import type { DashboardFilters, FilterOptions } from "../../types/dashboard";
import { GujaratMap } from "../../components/charts/GujaratMap";
import { fetchFilterOptions } from "../../api/dashboardApi";

function fmt(n: number) {
  return n.toLocaleString("en-IN");
}

const ViolationTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[#E4E8F4] bg-white px-3 py-2 shadow-lg text-xs">
      <p className="mb-1 font-semibold text-[#6B7299]">{label}</p>
      <p className="font-bold text-[#0891B2]">
        {payload[0].value.toLocaleString("en-IN")}
      </p>
    </div>
  );
};

export default function Dashboard() {
  const [filters, setFilters] = useState<DashboardFilters>({
    district: "all",
    year: "all",
    severity: "all",
    road_classification: "all",
    weather_condition: "all",
    light_condition: "all",
    collision_type: "all",
  });
  const [districtSearch, setDistrictSearch] = useState("");
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);

  const allDataFilters: DashboardFilters = {
    district: "all",
    year: "all",
    severity: "all",
    road_classification: "all",
    weather_condition: "all",
    light_condition: "all",
    collision_type: "all",
  };
  const { data: allData } = useDashboard(allDataFilters);

  useEffect(() => {
    fetchFilterOptions().then(setFilterOptions);
  }, []);

  const { data, loading, error } = useDashboard(filters);

  const years = useMemo(() => {
    if (!allData?.timeSeries) return ["all"];
    const unique = Array.from(
      new Set(allData.timeSeries.map((p) => String(p.year)))
    ).sort();
    return ["all", ...unique];
  }, [allData.timeSeries]);

  const severities = useMemo(() => {
    if (!allData?.severity) return ["all"];
    const labels = allData.severity
      .map((s) => s.severity)
      .filter(Boolean)
      .sort();
    return ["all", ...labels];
  }, [allData.severity]);

  const districts = useMemo(() => {
    if (!data?.districts) return ["all"];
    const names = data.districts.map((d) => d.district).filter(Boolean);
    return ["all", ...Array.from(new Set(names))];
  }, [data.districts]);

  const filteredDistricts = useMemo(
    () =>
      districts.filter((d) =>
        d.toLowerCase().includes(districtSearch.toLowerCase())
      ),
    [districts, districtSearch]
  );

  const topDangerous = data?.dangerous?.[0];
  const topViolations = data?.violations?.slice(0, 6) || [];
  const topRoads = data?.roads?.slice(0, 5) || [];

  const dangerousAsDistricts = useMemo(
    () =>
      data?.dangerous?.map((d) => ({
        district: d.district,
        accident_count: d.fatal_accidents,
        fatalities: d.total_killed,
      })) || [],
    [data.dangerous]
  );

  return (
    <div className="flex min-h-screen bg-[#F1F4FB]">
      <aside className="hidden xl:flex flex-col w-[260px] shrink-0 sticky top-0 h-screen bg-white border-r border-[#E4E8F4] overflow-y-auto">
        <div className="flex-1 px-4 py-5 flex flex-col gap-0">
          <div className="flex items-center gap-2 mb-4 px-1">
            <Filter size={13} className="text-[#9BA3C2]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#9BA3C2]">
              Filters
            </span>
          </div>

          <div className="mb-3 flex flex-col gap-1.5">
            <label className="px-1 text-[11px] font-semibold text-[#6B7299]">Year</label>
            <div className="relative">
              <select
                value={filters.year}
                onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value }))}
                className="w-full appearance-none rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-3 py-2 pr-8 text-[13px] text-[#1A1D2E] font-medium outline-none focus:border-[#2C6EF2] focus:ring-2 focus:ring-[#2C6EF2]/10 cursor-pointer transition"
              >
                {years.map((y) => <option key={y} value={y}>{y === "all" ? "All years" : y}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9BA3C2] pointer-events-none" />
            </div>
          </div>

          <div className="mb-3 flex flex-col gap-1.5">
            <label className="px-1 text-[11px] font-semibold text-[#6B7299]">District</label>
            <div className="relative">
              <select
                value={filters.district}
                onChange={(e) => setFilters((f) => ({ ...f, district: e.target.value }))}
                className="w-full appearance-none rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-3 py-2 pr-8 text-[13px] text-[#1A1D2E] font-medium outline-none focus:border-[#2C6EF2] focus:ring-2 focus:ring-[#2C6EF2]/10 cursor-pointer transition"
              >
                {filteredDistricts.map((d) => <option key={d} value={d}>{d === "all" ? "All districts" : d}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9BA3C2] pointer-events-none" />
            </div>
          </div>

          <div className="mb-5 flex flex-col gap-1.5">
            <label className="px-1 text-[11px] font-semibold text-[#6B7299]">Severity (map)</label>
            <div className="relative">
              <select
                value={filters.severity}
                onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}
                className="w-full appearance-none rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-3 py-2 pr-8 text-[13px] text-[#1A1D2E] font-medium outline-none focus:border-[#2C6EF2] focus:ring-2 focus:ring-[#2C6EF2]/10 cursor-pointer transition"
              >
                {severities.map((s) => <option key={s} value={s}>{s === "all" ? "All severity" : s}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9BA3C2] pointer-events-none" />
            </div>
          </div>

          <div className="mb-3 flex flex-col gap-1.5">
            <label className="px-1 text-[11px] font-semibold text-[#6B7299]">Road type</label>
            <div className="relative">
              <select
                value={filters.road_classification}
                onChange={(e) => setFilters((f) => ({ ...f, road_classification: e.target.value }))}
                className="w-full appearance-none rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-3 py-2 pr-8 text-[13px] text-[#1A1D2E] font-medium outline-none focus:border-[#2C6EF2] focus:ring-2 focus:ring-[#2C6EF2]/10 cursor-pointer transition"
              >
                <option value="all">All road types</option>
                {filterOptions?.road_classifications.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9BA3C2] pointer-events-none" />
            </div>
          </div>

          <div className="mb-3 flex flex-col gap-1.5">
            <label className="px-1 text-[11px] font-semibold text-[#6B7299]">Weather</label>
            <div className="relative">
              <select
                value={filters.weather_condition}
                onChange={(e) => setFilters((f) => ({ ...f, weather_condition: e.target.value }))}
                className="w-full appearance-none rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-3 py-2 pr-8 text-[13px] text-[#1A1D2E] font-medium outline-none focus:border-[#2C6EF2] focus:ring-2 focus:ring-[#2C6EF2]/10 cursor-pointer transition"
              >
                <option value="all">All weather</option>
                {filterOptions?.weather_conditions.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9BA3C2] pointer-events-none" />
            </div>
          </div>

          <div className="mb-3 flex flex-col gap-1.5">
            <label className="px-1 text-[11px] font-semibold text-[#6B7299]">Light condition</label>
            <div className="relative">
              <select
                value={filters.light_condition}
                onChange={(e) => setFilters((f) => ({ ...f, light_condition: e.target.value }))}
                className="w-full appearance-none rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-3 py-2 pr-8 text-[13px] text-[#1A1D2E] font-medium outline-none focus:border-[#2C6EF2] focus:ring-2 focus:ring-[#2C6EF2]/10 cursor-pointer transition"
              >
                <option value="all">All conditions</option>
                {filterOptions?.light_conditions.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9BA3C2] pointer-events-none" />
            </div>
          </div>

          <div className="mb-5 flex flex-col gap-1.5">
            <label className="px-1 text-[11px] font-semibold text-[#6B7299]">Collision type</label>
            <div className="relative">
              <select
                value={filters.collision_type}
                onChange={(e) => setFilters((f) => ({ ...f, collision_type: e.target.value }))}
                className="w-full appearance-none rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-3 py-2 pr-8 text-[13px] text-[#1A1D2E] font-medium outline-none focus:border-[#2C6EF2] focus:ring-2 focus:ring-[#2C6EF2]/10 cursor-pointer transition"
              >
                <option value="all">All types</option>
                {filterOptions?.collision_types.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9BA3C2] pointer-events-none" />
            </div>
          </div>

          <button
            onClick={() =>
              setFilters({
                district: "all",
                year: "all",
                severity: "all",
                road_classification: "all",
                weather_condition: "all",
                light_condition: "all",
                collision_type: "all",
              })
            }
            className="flex items-center justify-center gap-2 rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-4 py-2 text-[12px] font-semibold text-[#6B7299] transition hover:border-[#C9CEDF] hover:bg-[#EDF0F8] hover:text-[#1A1D2E] active:scale-[0.98]"
          >
            <RotateCcw size={13} />
            Reset filters
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 px-6 py-7 xl:px-8">
        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#FECACA] bg-[#FFF5F5] px-4 py-3 text-sm text-[#B91C1C]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Failed to load data</p>
              <p className="mt-0.5 text-xs text-[#DC2626]">{error}</p>
            </div>
          </div>
        )}

        <motion.div
          animate={{ opacity: loading ? 0.6 : 1 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          style={{ pointerEvents: loading ? "none" : "auto" }}
        >
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard
              icon={<Activity size={17} />}
              label="Total accidents"
              value={data.summary.total_accidents}
              variant="blue"
              loading={loading}
            />
            <MetricCard
              icon={<AlertTriangle size={17} />}
              label="Fatalities"
              value={data.summary.total_fatalities}
              variant="red"
              loading={loading}
            />
            <MetricCard
              icon={<Users size={17} />}
              label="Total injuries"
              value={data.summary.total_grievous + data.summary.total_minor}
              sub={`${fmt(data.summary.total_grievous)} grievous · ${fmt(data.summary.total_minor)} minor`}
              variant="amber"
              loading={loading}
            />
            <MetricCard
              icon={<Car size={17} />}
              label="Vehicles involved"
              value={data.summary.total_vehicles}
              variant="teal"
              loading={loading}
            />
          </div>

          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard
              icon={<ShieldAlert size={17} />}
              label="Damage only"
              value={data.summary.total_damage_only}
              variant="purple"
              loading={loading}
            />
            <MetricCard
              icon={<Building2 size={17} />}
              label="Districts covered"
              value={data.summary.districts_covered}
              variant="green"
              loading={loading}
            />
            <MetricCard
              icon={<RadioTower size={17} />}
              label="Police stations"
              value={data.summary.police_stations}
              variant="blue"
              loading={loading}
            />
            <MetricCard
              icon={<MapPin size={17} />}
              label="Mapped points"
              value={data.heatmap.length}
              variant="teal"
              loading={loading}
            />
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
            <Panel title="Accident trend over time" icon={<TrendingUp size={14} />} delay={0.05}>
              <AccidentTrend data={data.timeSeries} />
            </Panel>

            <Panel title="Severity distribution" icon={<AlertTriangle size={14} />} delay={0.1}>
              <SeverityChart data={data.severity} />
            </Panel>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel title="Accident Intensity by District" icon={<MapPin size={14} />} delay={0.12}>
              <GujaratMap data={data.districts} metric="accident_count" />
            </Panel>

            <Panel title="Fatality Intensity by District" icon={<AlertTriangle size={14} />} delay={0.14}>
              <GujaratMap data={data.districts} metric="fatalities" />
            </Panel>

            <Panel title="Fatal Accident Intensity" icon={<ShieldAlert size={14} />} delay={0.16}>
              <GujaratMap data={dangerousAsDistricts} metric="fatal_accidents" />
            </Panel>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel title="Casualty breakdown" icon={<Users size={14} />} delay={0.15}>
              <div className="flex flex-col gap-4">
                {data.casualty.map((c) => {
                  const total = c.killed + c.grievous + c.minor || 1;
                  const kPct = (c.killed / total) * 100;
                  const gPct = (c.grievous / total) * 100;
                  const mPct = (c.minor / total) * 100;
                  return (
                    <div key={c.category}>
                      <p className="mb-1.5 text-[12px] font-semibold text-[#6B7299]">{c.category}</p>
                      <div className="flex h-2.5 overflow-hidden rounded-full">
                        <div style={{ width: `${kPct}%`, background: "#E85D4A" }} />
                        <div style={{ width: `${gPct}%`, background: "#F5A623" }} />
                        <div style={{ width: `${mPct}%`, background: "#2C6EF2" }} />
                      </div>
                      <div className="mt-1.5 flex gap-3 text-[11px]">
                        <span className="text-[#E85D4A] font-medium">{fmt(c.killed)} killed</span>
                        <span className="text-[#D4891A] font-medium">{fmt(c.grievous)} grievous</span>
                        <span className="text-[#2C6EF2] font-medium">{fmt(c.minor)} minor</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel title="Conditions" icon={<CloudSun size={14} />} delay={0.18}>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-[#F7F9FD] p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#2C6EF2]">
                    <Sun size={12} /> Weather
                  </p>
                  {data.weather.slice(0, 4).map((w) => (
                    <div key={w.name} className="flex items-center justify-between border-b border-[#E4E8F4] py-1.5 last:border-0 text-xs">
                      <span className="text-[#6B7299] truncate mr-1 max-w-[70%]">{w.name}</span>
                      <b className="font-semibold text-[#1A1D2E] shrink-0">{fmt(w.count)}</b>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg bg-[#F7F9FD] p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#2C6EF2]">
                    <Moon size={12} /> Light
                  </p>
                  {data.light.slice(0, 4).map((l) => (
                    <div key={l.name} className="flex items-center justify-between border-b border-[#E4E8F4] py-1.5 last:border-0 text-xs">
                      <span className="text-[#6B7299] truncate mr-1 max-w-[70%]">{l.name}</span>
                      <b className="font-semibold text-[#1A1D2E] shrink-0">{fmt(l.count)}</b>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel title="Most dangerous & road types" icon={<ShieldAlert size={14} />} delay={0.2}>
              {topDangerous && (
                <div className="mb-4 rounded-xl p-4" style={{ background: "linear-gradient(135deg,#1A1D2E 0%,#7C1D1D 100%)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1">Highest fatal accident district</p>
                  <p className="text-base font-bold text-white mb-0.5">{topDangerous.district}</p>
                  <p className="text-[11px]" style={{ color: "rgba(255,160,140,0.9)" }}>
                    {fmt(topDangerous.fatal_accidents)} fatal accidents · {fmt(topDangerous.total_killed)} killed
                  </p>
                </div>
              )}
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#6B7299]">
                  <Route size={12} /> Road types
                </p>
                {topRoads.map((r, i) => (
                  <div key={r.road_classification} className="flex items-center gap-2 py-1.5 border-b border-[#F1F4FB] last:border-0">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-[#F1F4FB] text-[10px] font-bold text-[#6B7299] shrink-0">{i + 1}</span>
                    <span className="flex-1 text-xs text-[#1A1D2E] truncate">{r.road_classification || "Unknown"}</span>
                    <span className="text-xs font-semibold text-[#2C6EF2] shrink-0">{fmt(r.accident_count)}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          {topViolations.length > 0 && (
            <Panel title="Traffic violations" icon={<Route size={14} />} className="mb-4" delay={0.22}>
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topViolations} margin={{ top: 4, right: 10, left: -20, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF0F8" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9BA3C2" }} interval={0} angle={-30} textAnchor="end" />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9BA3C2" }} />
                    <Tooltip content={<ViolationTooltip />} />
                    <Bar dataKey="count" name="Count" radius={[6, 6, 0, 0]} maxBarSize={48}>
                      {topViolations.map((_, i) => <Cell key={i} fill={`rgba(8,145,178,${1 - i * 0.08})`} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          )}

          <div className="mb-4">
            <Panel title="Accident Density Heatmap" icon={<MapPin size={14} />}>
              <AccidentHeatmap />
            </Panel>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Accident Location Markers" icon={<MapPin size={14} />}>
              <AccidentMarkerMap />
            </Panel>
            <Panel title="GIS Accident Visualization" icon={<MapPin size={14} />}>
              <AccidentGISMap />
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="District Hotspot Map" icon={<MapPin size={14} />}>
              <DistrictHotspotMap />
            </Panel>
            <Panel title="Accident Blackspot Detection" icon={<MapPin size={14} />}>
              <BlackspotMap />
            </Panel>
          </div>

        </motion.div>
      </main>
    </div>
  );
}
