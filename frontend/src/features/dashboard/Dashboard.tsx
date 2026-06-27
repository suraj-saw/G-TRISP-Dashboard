// frontend/src/features/dashboard/Dashboard.tsx
import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import API from "../../api/axios";
import type { User } from "../../types/user";

import { VisualizationLayers } from "../../components/maps/VisualizationLayers";
import { DensityMapOverlays } from "../../components/maps/MapOverlays";
import TopBar from "../../components/layout/TopBar";
import FilterSelect from "../../components/layout/FilterSelect";
import ExportButton from "../../components/layout/ExportButton";

import {
  Filter,
  Layers,
  ChevronDown,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";

import { useDashboard } from "../../hooks/useDashboard";
import type { DashboardFilters, FilterOptions } from "../../types/dashboard";
import { fetchFilterOptions } from "../../api/dashboardApi";
import SuratBaseMap from "../../components/maps/SuratBaseMap";
import { MAP_STYLES } from "../../components/maps/mapStyles";
import TemporalAnalysis from "../../components/temporal/TemporalAnalysis";
import LocationMarkersInsights from "../../components/charts/LocationMarkersInsights";
import { ROUTES, DEFAULT_BASE_MAP } from "../../config/constants";
import {
  SIDEBAR_WIDTH_PX,
  TOPBAR_HEIGHT_PX,
  SIDEBAR_Z_INDEX,
  TOPBAR_Z_INDEX,
  SIDEBAR_TRANSITION,
} from "../../config/layout";
import {
  defaultFilters,
  getFilterConfig,
  VISUALIZATION_OPTIONS,
  type FilterId,
} from "./filterConfig";

export default function Dashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(
    null
  );
  const [openPanels, setOpenPanels] = useState({ map: true, data: true });

  const allDataFilters: DashboardFilters = defaultFilters;
  const { data: allData } = useDashboard(allDataFilters);
  const { data, loading, error } = useDashboard(filters);

  useEffect(() => {
    let active = true;
    API.get<User>("/auth/me")
      .then((res) => {
        if (!active) return;
        if (res.data.role === "admin") {
          navigate(ROUTES.ADMIN, { replace: true });
          return;
        }
        setUser(res.data);
      })
      .catch(() => navigate(ROUTES.LOGIN, { replace: true }))
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
      /* continue */
    }
    navigate(ROUTES.LOGIN, { replace: true });
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
    return [
      "all",
      ...allData.severity
        .map((s) => s.severity)
        .filter(Boolean)
        .sort(),
    ];
  }, [allData.severity]);

  const monthOptions = [
    { value: "all", label: "All months" },
    { value: "1", label: "January" },
    { value: "2", label: "February" },
    { value: "3", label: "March" },
    { value: "4", label: "April" },
    { value: "5", label: "May" },
    { value: "6", label: "June" },
    { value: "7", label: "July" },
    { value: "8", label: "August" },
    { value: "9", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
  ];

  const dayOptions = [
    { value: "all", label: "All days" },
    { value: "Monday", label: "Monday" },
    { value: "Tuesday", label: "Tuesday" },
    { value: "Wednesday", label: "Wednesday" },
    { value: "Thursday", label: "Thursday" },
    { value: "Friday", label: "Friday" },
    { value: "Saturday", label: "Saturday" },
    { value: "Sunday", label: "Sunday" },
  ];

  const timePeriodOptions = [
    { value: "all", label: "All periods" },
    { value: "Morning", label: "Morning" },
    { value: "Afternoon", label: "Afternoon" },
    { value: "Evening", label: "Evening" },
    { value: "Night", label: "Night" },
  ];

  const filterOptionsById: Record<
    FilterId,
    { value: string; label: string }[]
  > = {
    baseMap: MAP_STYLES.map((s) => ({ value: s.id, label: s.label })),
    visualization_type: VISUALIZATION_OPTIONS,
    year: years.map((y) => ({
      value: y,
      label: y === "all" ? "All years" : y,
    })),
    month: monthOptions,
    day: dayOptions,
    time_period: timePeriodOptions,
    district: [
      { value: "all", label: "All police stations" },
      ...(filterOptions?.police_stations || []).map((s) => ({
        value: s,
        label: s,
      })),
    ],
    severity: severities.map((s) => ({
      value: s,
      label: s === "all" ? "All severity" : s,
    })),
    road_classification: [
      { value: "all", label: "All road types" },
      ...(filterOptions?.road_classifications || []).map((r) => ({
        value: r,
        label: r,
      })),
    ],
    weather_condition: [
      { value: "all", label: "All weather" },
      ...(filterOptions?.weather_conditions || []).map((w) => ({
        value: w,
        label: w,
      })),
    ],
    light_condition: [
      { value: "all", label: "All conditions" },
      ...(filterOptions?.light_conditions || []).map((l) => ({
        value: l,
        label: l,
      })),
    ],
    collision_type: [
      { value: "all", label: "All types" },
      ...(filterOptions?.collision_types || []).map((c) => ({
        value: c,
        label: c,
      })),
    ],
  };

  const activeFilterConfig = getFilterConfig(filters.visualization_type);
  const isTemporalAnalysis = filters.visualization_type === "temporal_analysis";
  const isDensityHeatmap = filters.visualization_type === "density_heatmap";
  const isLocationMarkers =
    filters.visualization_type === "location_markers" ||
    !filters.visualization_type;

  // Build a human-readable subtitle for the overlay
  const overlaySubtitle = useMemo(() => {
    const parts: string[] = ["Surat"];
    if (filters.district && filters.district !== "all")
      parts.push(filters.district);
    if (filters.year && filters.year !== "all") parts.push(filters.year);
    if (filters.severity && filters.severity !== "all")
      parts.push(filters.severity);
    return parts.join(" · ");
  }, [filters.district, filters.year, filters.severity]);

  const renderFilter = (filter: (typeof activeFilterConfig)[number]) => {
    const value = String(filters[filter.id] ?? "all");
    const handleChange = (nextValue: string) => {
      setFilters((current) => {
        if (filter.id === "visualization_type") {
          return {
            ...current,
            visualization_type: nextValue,
            month: "all",
            day: "all",
            time_period: "all",
          };
        }
        return { ...current, [filter.id]: nextValue };
      });
    };
    return (
      <div key={filter.id} className="flex flex-col gap-1.5">
        <label className="px-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-[#6B7299]">
          {filter.icon === "layers" && (
            <Layers size={12} className="text-[#1e3a8a]" />
          )}
          {filter.label}
        </label>
        <FilterSelect
          value={value}
          options={filterOptionsById[filter.id]}
          onChange={handleChange}
        />
      </div>
    );
  };

  if (sessionChecking || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F1F4FB] text-sm font-semibold text-[#6B7299]">
        Checking session...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F1F4FB]">
      {/* TOPBAR */}
      <div className={`fixed left-0 right-0 top-0 ${TOPBAR_Z_INDEX}`}>
        <TopBar
          appName="G-TRISP"
          user={user}
          showNotificationBell={false}
          onLogout={logout}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />
      </div>

      {/* SIDEBAR */}
      <aside
        style={{
          top: `${TOPBAR_HEIGHT_PX}px`,
          width: `${SIDEBAR_WIDTH_PX}px`,
          height: `calc(100vh - ${TOPBAR_HEIGHT_PX}px)`,
        }}
        className={`
          fixed left-0 ${SIDEBAR_Z_INDEX}
          flex flex-col overflow-y-auto no-scrollbar
          border-r border-[#E4E8F4] bg-[#F1F4FB] shadow-lg
          will-change-transform ${SIDEBAR_TRANSITION}
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="flex-1 px-3 py-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <Filter size={13} className="text-[#1e3a8a]" />
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#1A1D2E]">
              Filters
            </span>
          </div>

          {(() => {
            const MAP_FILTER_IDS = ["baseMap", "visualization_type"];
            const mapFilters = activeFilterConfig.filter((f) =>
              MAP_FILTER_IDS.includes(f.id)
            );
            const dataFilters = activeFilterConfig.filter(
              (f) => !MAP_FILTER_IDS.includes(f.id)
            );
            const togglePanel = (key: "map" | "data") =>
              setOpenPanels((prev) => ({ ...prev, [key]: !prev[key] }));

            return (
              <>
                {mapFilters.length > 0 && (
                  <section className="rounded-xl border border-[#E4E8F4] bg-white shadow-sm overflow-hidden">
                    <button
                      type="button"
                      onClick={() => togglePanel("map")}
                      aria-expanded={openPanels.map}
                      className="flex w-full items-center gap-2 bg-[#1e3a8a] px-3.5 py-2.5 transition hover:bg-[#1c346f]"
                    >
                      <Layers size={13} className="text-white/75" />
                      <h2 className="flex-1 text-left text-[11px] font-bold uppercase tracking-wider text-white">
                        Map Settings
                      </h2>
                      <ChevronDown
                        size={15}
                        className={`text-white/75 transition-transform duration-200 ${openPanels.map ? "rotate-180" : ""}`}
                      />
                    </button>
                    {openPanels.map && (
                      <div className="flex flex-col gap-3 p-3">
                        {mapFilters.map(renderFilter)}
                      </div>
                    )}
                  </section>
                )}

                {dataFilters.length > 0 && (
                  <section className="rounded-xl border border-[#E4E8F4] bg-white shadow-sm overflow-hidden">
                    <button
                      type="button"
                      onClick={() => togglePanel("data")}
                      aria-expanded={openPanels.data}
                      className="flex w-full items-center gap-2 bg-[#1e3a8a] px-3.5 py-2.5 transition hover:bg-[#1c346f]"
                    >
                      <Filter size={13} className="text-white/75" />
                      <h2 className="flex-1 text-left text-[11px] font-bold uppercase tracking-wider text-white">
                        Data Filters
                      </h2>
                      <ChevronDown
                        size={15}
                        className={`text-white/75 transition-transform duration-200 ${openPanels.data ? "rotate-180" : ""}`}
                      />
                    </button>
                    {openPanels.data && (
                      <div className="flex flex-col gap-3 p-3">
                        {dataFilters.map(renderFilter)}
                      </div>
                    )}
                  </section>
                )}
              </>
            );
          })()}

          <ExportButton filters={filters} />

          <button
            onClick={() => setFilters(defaultFilters)}
            className="flex items-center justify-center gap-2 rounded-lg border border-[#E4E8F4] bg-white px-4 py-2.5 text-[12px] font-semibold text-[#6B7299] shadow-sm transition hover:border-[#1e3a8a] hover:text-[#1e3a8a] active:scale-[0.98]"
          >
            <RotateCcw size={13} />
            Reset filters
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main
        className="min-w-0 transition-[padding-left] duration-300 ease-in-out overflow-y-auto"
        style={{
          paddingTop: `${TOPBAR_HEIGHT_PX}px`,
          paddingLeft: sidebarOpen ? `${SIDEBAR_WIDTH_PX}px` : "0px",
          minHeight: "100vh",
        }}
      >
        <div className="flex flex-col gap-4 p-4">
          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-[#FECACA] bg-[#FFF5F5] px-4 py-3 text-sm text-[#B91C1C]">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Failed to load data</p>
                <p className="mt-0.5 text-xs text-[#DC2626]">{error}</p>
              </div>
            </div>
          )}

          {/* Map / Temporal area — always viewport height */}
          <motion.div
            className="w-full"
            style={{ height: `calc(100vh - ${TOPBAR_HEIGHT_PX}px - 2rem)` }}
            animate={{ opacity: loading ? 0.6 : 1 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            {isTemporalAnalysis ? (
              <TemporalAnalysis filters={filters} />
            ) : (
              <div className="h-full w-full rounded-2xl overflow-hidden shadow-xl border border-[#E4E8F4] relative">
                <SuratBaseMap
                  height="100%"
                  sidebarOpen={sidebarOpen}
                  baseMap={filters.baseMap || DEFAULT_BASE_MAP}
                  overlays={
                    isDensityHeatmap ? (
                      <DensityMapOverlays
                        data={data?.heatmap}
                        subtitle={overlaySubtitle}
                      />
                    ) : undefined
                  }
                >
                  <VisualizationLayers
                    key={filters.visualization_type || "location_markers"}
                    data={data?.heatmap}
                    type={filters.visualization_type || "location_markers"}
                    selectedSeverity={filters.severity}
                  />
                </SuratBaseMap>
              </div>
            )}
          </motion.div>

          {/* Charts panel — shown below map only for Location Markers */}
          {isLocationMarkers && data && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="pb-6"
            >
              <LocationMarkersInsights data={data} />
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
