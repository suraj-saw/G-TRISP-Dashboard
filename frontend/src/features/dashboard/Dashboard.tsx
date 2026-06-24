import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import API from "../../api/axios";
import type { User } from "../../types/user";

import { VisualizationLayers } from "../../components/maps/VisualizationLayers";
import TopBar from "../../components/layout/TopBar";

import {
  MapPin,
  Filter,
  Layers,
  ChevronDown,
  RotateCcw,
  AlertTriangle
} from "lucide-react";


import { useDashboard } from "../../hooks/useDashboard";
import type { DashboardFilters, FilterOptions } from "../../types/dashboard";
import { fetchFilterOptions } from "../../api/dashboardApi";
import SuratBaseMap from "../../components/maps/SuratBaseMap";
import { MAP_STYLES } from "../../components/maps/mapStyles";
export default function Dashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [filters, setFilters] = useState<DashboardFilters>({
    district: "all",
    year: "all",
    severity: "all",
    road_classification: "all",
    weather_condition: "all",
    light_condition: "all",
    collision_type: "all",
    baseMap: "google-streets",
    visualization_type: "location_markers",
  });

  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(
    null
  );

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
  const { data, loading, error } = useDashboard(filters);

  useEffect(() => {
    let active = true;

    API.get<User>("/auth/me")
      .then((res) => {
        if (!active) return;

        if (res.data.role === "admin") {
          navigate("/admin/dashboard", { replace: true });
          return;
        }

        setUser(res.data);
      })
      .catch(() => {
        navigate("/login", { replace: true });
      })
      .finally(() => {
        if (active) setSessionChecking(false);
      });

    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    fetchFilterOptions().then(setFilterOptions);
  }, []);

  const logout = async () => {
    try {
      await API.post("/auth/logout");
    } catch {
      // Continue to login even if logout request fails.
    }

    navigate("/login", { replace: true });
  };

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



  if (sessionChecking || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F1F4FB] text-sm font-semibold text-[#6B7299]">
        Checking session...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F1F4FB]">
      {/* ── TOPBAR — always full viewport width ── */}
      <div className="fixed left-0 right-0 top-0 z-50">
        <TopBar
          appName="G-TRISP"
          user={user}
          notificationCount={0}
          onLogout={logout}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />
      </div>

      {/* ── SIDEBAR — slides in/out below the TopBar ── */}
      <aside
        className={`
          fixed left-0 top-[80px] z-40
          h-[calc(100vh-80px)] w-[260px]
          flex flex-col
          overflow-y-auto
          border-r border-[#E4E8F4] bg-white
          shadow-lg
          will-change-transform
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="flex-1 px-4 py-5 flex flex-col gap-0">
          <div className="flex items-center gap-2 mb-4 px-1">
            <Filter size={13} className="text-[#9BA3C2]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#9BA3C2]">
              Filters
            </span>
          </div>

          <div className="mb-3 flex flex-col gap-1.5">
            <label className="px-1 flex items-center gap-1.5 text-[11px] font-semibold text-[#6B7299]">
              <Layers size={12} className="text-[#2C6EF2]" />
              Base Map
            </label>
            <div className="relative">
              <select
                value={filters.baseMap || "google-streets"}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, baseMap: e.target.value }))
                }
                className="w-full appearance-none rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-3 py-2 pr-8 text-[13px] text-[#1A1D2E] font-medium outline-none focus:border-[#2C6EF2] focus:ring-2 focus:ring-[#2C6EF2]/10 cursor-pointer transition"
              >
                {MAP_STYLES.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9BA3C2] pointer-events-none"
              />
            </div>
          </div>

          <div className="mb-3 flex flex-col gap-1.5">
            <label className="px-1 text-[11px] font-semibold text-[#6B7299]">
              Visualization Type
            </label>
            <div className="relative">
              <select
                value={filters.visualization_type || "location_markers"}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, visualization_type: e.target.value }))
                }
                className="w-full appearance-none rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-3 py-2 pr-8 text-[13px] text-[#1A1D2E] font-medium outline-none focus:border-[#2C6EF2] focus:ring-2 focus:ring-[#2C6EF2]/10 cursor-pointer transition"
              >
                <option value="location_markers">Location Markers</option>
                <option value="density_heatmap">Density Heatmap</option>
                <option value="blackspot">Blackspot Detection</option>
                <option value="gis">GIS Visualization</option>
                <option value="district_hotspot">District Hotspot</option>
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9BA3C2] pointer-events-none"
              />
            </div>
          </div>

          <div className="mb-3 flex flex-col gap-1.5">
            <label className="px-1 text-[11px] font-semibold text-[#6B7299]">
              Year
            </label>
            <div className="relative">
              <select
                value={filters.year}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, year: e.target.value }))
                }
                className="w-full appearance-none rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-3 py-2 pr-8 text-[13px] text-[#1A1D2E] font-medium outline-none focus:border-[#2C6EF2] focus:ring-2 focus:ring-[#2C6EF2]/10 cursor-pointer transition"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y === "all" ? "All years" : y}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9BA3C2] pointer-events-none"
              />
            </div>
          </div>

          <div className="mb-3 flex flex-col gap-1.5">
            <label className="px-1 text-[11px] font-semibold text-[#6B7299]">
              Police Station
            </label>
            <div className="relative">
              <select
                value={filters.district}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, district: e.target.value }))
                }
                className="w-full appearance-none rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-3 py-2 pr-8 text-[13px] text-[#1A1D2E] font-medium outline-none focus:border-[#2C6EF2] focus:ring-2 focus:ring-[#2C6EF2]/10 cursor-pointer transition"
              >
                <option value="all">All police stations</option>
                {filterOptions?.police_stations?.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9BA3C2] pointer-events-none"
              />
            </div>
          </div>

          <div className="mb-5 flex flex-col gap-1.5">
            <label className="px-1 text-[11px] font-semibold text-[#6B7299]">
              Severity
            </label>
            <div className="relative">
              <select
                value={filters.severity}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, severity: e.target.value }))
                }
                className="w-full appearance-none rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-3 py-2 pr-8 text-[13px] text-[#1A1D2E] font-medium outline-none focus:border-[#2C6EF2] focus:ring-2 focus:ring-[#2C6EF2]/10 cursor-pointer transition"
              >
                {severities.map((s) => (
                  <option key={s} value={s}>
                    {s === "all" ? "All severity" : s}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9BA3C2] pointer-events-none"
              />
            </div>
          </div>

          <div className="mb-3 flex flex-col gap-1.5">
            <label className="px-1 text-[11px] font-semibold text-[#6B7299]">
              Road type
            </label>
            <div className="relative">
              <select
                value={filters.road_classification}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    road_classification: e.target.value,
                  }))
                }
                className="w-full appearance-none rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-3 py-2 pr-8 text-[13px] text-[#1A1D2E] font-medium outline-none focus:border-[#2C6EF2] focus:ring-2 focus:ring-[#2C6EF2]/10 cursor-pointer transition"
              >
                <option value="all">All road types</option>
                {filterOptions?.road_classifications.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9BA3C2] pointer-events-none"
              />
            </div>
          </div>

          <div className="mb-3 flex flex-col gap-1.5">
            <label className="px-1 text-[11px] font-semibold text-[#6B7299]">
              Weather
            </label>
            <div className="relative">
              <select
                value={filters.weather_condition}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    weather_condition: e.target.value,
                  }))
                }
                className="w-full appearance-none rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-3 py-2 pr-8 text-[13px] text-[#1A1D2E] font-medium outline-none focus:border-[#2C6EF2] focus:ring-2 focus:ring-[#2C6EF2]/10 cursor-pointer transition"
              >
                <option value="all">All weather</option>
                {filterOptions?.weather_conditions.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9BA3C2] pointer-events-none"
              />
            </div>
          </div>

          <div className="mb-3 flex flex-col gap-1.5">
            <label className="px-1 text-[11px] font-semibold text-[#6B7299]">
              Light condition
            </label>
            <div className="relative">
              <select
                value={filters.light_condition}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    light_condition: e.target.value,
                  }))
                }
                className="w-full appearance-none rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-3 py-2 pr-8 text-[13px] text-[#1A1D2E] font-medium outline-none focus:border-[#2C6EF2] focus:ring-2 focus:ring-[#2C6EF2]/10 cursor-pointer transition"
              >
                <option value="all">All conditions</option>
                {filterOptions?.light_conditions.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9BA3C2] pointer-events-none"
              />
            </div>
          </div>

          <div className="mb-5 flex flex-col gap-1.5">
            <label className="px-1 text-[11px] font-semibold text-[#6B7299]">
              Collision type
            </label>
            <div className="relative">
              <select
                value={filters.collision_type}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    collision_type: e.target.value,
                  }))
                }
                className="w-full appearance-none rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-3 py-2 pr-8 text-[13px] text-[#1A1D2E] font-medium outline-none focus:border-[#2C6EF2] focus:ring-2 focus:ring-[#2C6EF2]/10 cursor-pointer transition"
              >
                <option value="all">All types</option>
                {filterOptions?.collision_types.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9BA3C2] pointer-events-none"
              />
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
                baseMap: "google-streets",
                visualization_type: "location_markers",
              })
            }
            className="flex items-center justify-center gap-2 rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-4 py-2 text-[12px] font-semibold text-[#6B7299] transition hover:border-[#C9CEDF] hover:bg-[#EDF0F8] hover:text-[#1A1D2E] active:scale-[0.98]"
          >
            <RotateCcw size={13} />
            Reset filters
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT — shrinks/grows when sidebar toggles ── */}
      <main
        className="min-w-0 pb-7 pt-[104px] transition-[padding-left] duration-300 ease-in-out"
        style={{
          paddingLeft: sidebarOpen ? `calc(260px + 1.5rem)` : `1.5rem`,
          paddingRight: `1.5rem`,
        }}
      >
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
          {/* <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
              sub={`${fmt(data.summary.total_grievous)} grievous - ${fmt(data.summary.total_minor)} minor`}
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
          </div> */}

          {/* <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          </div> */}

          {/* <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
            <Panel
              title="Accident trend over time"
              icon={<TrendingUp size={14} />}
              delay={0.05}
            >
              <AccidentTrend data={data.timeSeries} />
            </Panel>

            <Panel
              title="Severity distribution"
              icon={<AlertTriangle size={14} />}
              delay={0.1}
            >
              <SeverityChart data={data.severity} />
            </Panel>
          </div> */}

          {/* <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel
              title="Accident Intensity by District"
              icon={<MapPin size={14} />}
              delay={0.12}
            >
              <GujaratMap data={data.districts} metric="accident_count" />
            </Panel>

            <Panel
              title="Fatality Intensity by District"
              icon={<AlertTriangle size={14} />}
              delay={0.14}
            >
              <GujaratMap data={data.districts} metric="fatalities" />
            </Panel>

            <Panel
              title="Fatal Accident Intensity"
              icon={<ShieldAlert size={14} />}
              delay={0.16}
            >
              <GujaratMap
                data={dangerousAsDistricts}
                metric="fatal_accidents"
              />
            </Panel>
          </div> */}

          {/* <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel
              title="Casualty breakdown"
              icon={<Users size={14} />}
              delay={0.15}
            >
              <div className="flex flex-col gap-4">
                {data.casualty.map((c) => {
                  const total = c.killed + c.grievous + c.minor || 1;
                  const kPct = (c.killed / total) * 100;
                  const gPct = (c.grievous / total) * 100;
                  const mPct = (c.minor / total) * 100;

                  return (
                    <div key={c.category}>
                      <p className="mb-1.5 text-[12px] font-semibold text-[#6B7299]">
                        {c.category}
                      </p>
                      <div className="flex h-2.5 overflow-hidden rounded-full">
                        <div
                          style={{ width: `${kPct}%`, background: "#E85D4A" }}
                        />
                        <div
                          style={{ width: `${gPct}%`, background: "#F5A623" }}
                        />
                        <div
                          style={{ width: `${mPct}%`, background: "#2C6EF2" }}
                        />
                      </div>
                      <div className="mt-1.5 flex gap-3 text-[11px]">
                        <span className="text-[#E85D4A] font-medium">
                          {fmt(c.killed)} killed
                        </span>
                        <span className="text-[#D4891A] font-medium">
                          {fmt(c.grievous)} grievous
                        </span>
                        <span className="text-[#2C6EF2] font-medium">
                          {fmt(c.minor)} minor
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel
              title="Conditions"
              icon={<CloudSun size={14} />}
              delay={0.18}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-[#F7F9FD] p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#2C6EF2]">
                    <Sun size={12} /> Weather
                  </p>
                  {data.weather.slice(0, 4).map((w) => (
                    <div
                      key={w.name}
                      className="flex items-center justify-between border-b border-[#E4E8F4] py-1.5 last:border-0 text-xs"
                    >
                      <span className="text-[#6B7299] truncate mr-1 max-w-[70%]">
                        {w.name}
                      </span>
                      <b className="font-semibold text-[#1A1D2E] shrink-0">
                        {fmt(w.count)}
                      </b>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg bg-[#F7F9FD] p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#2C6EF2]">
                    <Moon size={12} /> Light
                  </p>
                  {data.light.slice(0, 4).map((l) => (
                    <div
                      key={l.name}
                      className="flex items-center justify-between border-b border-[#E4E8F4] py-1.5 last:border-0 text-xs"
                    >
                      <span className="text-[#6B7299] truncate mr-1 max-w-[70%]">
                        {l.name}
                      </span>
                      <b className="font-semibold text-[#1A1D2E] shrink-0">
                        {fmt(l.count)}
                      </b>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel
              title="Most dangerous & road types"
              icon={<ShieldAlert size={14} />}
              delay={0.2}
            >
              {topDangerous && (
                <div
                  className="mb-4 rounded-xl p-4"
                  style={{
                    background:
                      "linear-gradient(135deg,#1A1D2E 0%,#7C1D1D 100%)",
                  }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1">
                    Highest fatal accident district
                  </p>
                  <p className="text-base font-bold text-white mb-0.5">
                    {topDangerous.district}
                  </p>
                  <p
                    className="text-[11px]"
                    style={{ color: "rgba(255,160,140,0.9)" }}
                  >
                    {fmt(topDangerous.fatal_accidents)} fatal accidents -{" "}
                    {fmt(topDangerous.total_killed)} killed
                  </p>
                </div>
              )}

              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#6B7299]">
                  <Route size={12} /> Road types
                </p>
                {topRoads.map((r, i) => (
                  <div
                    key={r.road_classification}
                    className="flex items-center gap-2 py-1.5 border-b border-[#F1F4FB] last:border-0"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-[#F1F4FB] text-[10px] font-bold text-[#6B7299] shrink-0">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-xs text-[#1A1D2E] truncate">
                      {r.road_classification || "Unknown"}
                    </span>
                    <span className="text-xs font-semibold text-[#2C6EF2] shrink-0">
                      {fmt(r.accident_count)}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          </div> */}

          {/* {topViolations.length > 0 && (
            <Panel
              title="Traffic violations"
              icon={<Route size={14} />}
              className="mb-4"
              delay={0.22}
            >
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topViolations}
                    margin={{ top: 4, right: 10, left: -20, bottom: 30 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#EDF0F8"
                    />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#9BA3C2" }}
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "#9BA3C2" }}
                    />
                    <Tooltip content={<ViolationTooltip />} />
                    <Bar
                      dataKey="count"
                      name="Count"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={48}
                    >
                      {topViolations.map((_, i) => (
                        <Cell
                          key={i}
                          fill={`rgba(8,145,178,${1 - i * 0.08})`}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          )} */}

          {/* ── HERO SURAT MAP WITH VISUALIZATIONS ── */}
          <div className="mb-6 w-full rounded-2xl overflow-hidden shadow-xl border border-[#E4E8F4] relative">
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-white/90 backdrop-blur-sm border border-white/50 rounded-xl px-4 py-2.5 shadow-lg">
              <div className="h-7 w-7 rounded-lg bg-[radial-gradient(circle_at_top_left,#2C6EF2,#1e3a8a)] flex items-center justify-center shrink-0">
                <MapPin size={13} className="text-white" />
              </div>
              <div>
                <p className="text-[13px] font-bold text-slate-800 leading-none">
                  Surat District
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Road Safety Dashboard
                </p>
              </div>
            </div>
            
            <SuratBaseMap height="calc(100vh - 80px)" sidebarOpen={sidebarOpen} baseMap={filters.baseMap || "osm"}>
              <VisualizationLayers 
                data={data?.heatmap} 
                type={filters.visualization_type || "location_markers"} 
              />
            </SuratBaseMap>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
