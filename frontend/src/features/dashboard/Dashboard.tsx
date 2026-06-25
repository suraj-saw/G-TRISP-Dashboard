// frontend/src/features/dashboard/Dashboard.tsx
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
  AlertTriangle,
} from "lucide-react";

import { useDashboard } from "../../hooks/useDashboard";
import type { DashboardFilters, FilterOptions } from "../../types/dashboard";
import { fetchFilterOptions } from "../../api/dashboardApi";
import SuratBaseMap from "../../components/maps/SuratBaseMap";
import { MAP_STYLES } from "../../components/maps/mapStyles";
import TemporalAnalysis from "../../components/temporal/TemporalAnalysis";
import { ROUTES } from "../../config/constants";
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

  const allDataFilters: DashboardFilters = defaultFilters;

  const { data: allData } = useDashboard(allDataFilters);
  const { data, loading, error } = useDashboard(filters);

  useEffect(() => {
    let active = true;

    API.get<User>("/auth/me")
      .then((res) => {
        if (!active) return;

        if (res.data.role === "admin") {
          // Use the canonical ROUTES constant — not a hardcoded string
          navigate(ROUTES.ADMIN, { replace: true });
          return;
        }

        setUser(res.data);
      })
      .catch(() => {
        navigate(ROUTES.LOGIN, { replace: true });
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
    const labels = allData.severity
      .map((s) => s.severity)
      .filter(Boolean)
      .sort();
    return ["all", ...labels];
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
    baseMap: MAP_STYLES.map((style) => ({
      value: style.id,
      label: style.label,
    })),
    visualization_type: VISUALIZATION_OPTIONS,
    year: years.map((year) => ({
      value: year,
      label: year === "all" ? "All years" : year,
    })),
    month: monthOptions,
    day: dayOptions,
    time_period: timePeriodOptions,
    district: [
      { value: "all", label: "All police stations" },
      ...(filterOptions?.police_stations || []).map((station) => ({
        value: station,
        label: station,
      })),
    ],
    severity: severities.map((severity) => ({
      value: severity,
      label: severity === "all" ? "All severity" : severity,
    })),
    road_classification: [
      { value: "all", label: "All road types" },
      ...(filterOptions?.road_classifications || []).map((road) => ({
        value: road,
        label: road,
      })),
    ],
    weather_condition: [
      { value: "all", label: "All weather" },
      ...(filterOptions?.weather_conditions || []).map((weather) => ({
        value: weather,
        label: weather,
      })),
    ],
    light_condition: [
      { value: "all", label: "All conditions" },
      ...(filterOptions?.light_conditions || []).map((light) => ({
        value: light,
        label: light,
      })),
    ],
    collision_type: [
      { value: "all", label: "All types" },
      ...(filterOptions?.collision_types || []).map((collision) => ({
        value: collision,
        label: collision,
      })),
    ],
  };

  const activeFilterConfig = getFilterConfig(filters.visualization_type);
  const isTemporalAnalysis = filters.visualization_type === "temporal_analysis";

  const renderFilter = (filter: (typeof activeFilterConfig)[number]) => {
    const value = String(filters[filter.id] ?? "all");

    return (
      <div key={filter.id} className="mb-3 flex flex-col gap-1.5">
        <label className="px-1 flex items-center gap-1.5 text-[11px] font-semibold text-[#6B7299]">
          {filter.icon === "layers" && (
            <Layers size={12} className="text-[#2C6EF2]" />
          )}
          {filter.label}
        </label>
        <div className="relative">
          <select
            value={value}
            onChange={(e) => {
              const nextValue = e.target.value;
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
                return {
                  ...current,
                  [filter.id]: nextValue,
                };
              });
            }}
            className="w-full appearance-none rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-3 py-2 pr-8 text-[13px] text-[#1A1D2E] font-medium outline-none focus:border-[#2C6EF2] focus:ring-2 focus:ring-[#2C6EF2]/10 cursor-pointer transition"
          >
            {filterOptionsById[filter.id].map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9BA3C2] pointer-events-none"
          />
        </div>
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

      {/* ── SIDEBAR ── */}
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

          {activeFilterConfig.map(renderFilter)}

          <button
            onClick={() => setFilters(defaultFilters)}
            className="flex items-center justify-center gap-2 rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-4 py-2 text-[12px] font-semibold text-[#6B7299] transition hover:border-[#C9CEDF] hover:bg-[#EDF0F8] hover:text-[#1A1D2E] active:scale-[0.98]"
          >
            <RotateCcw size={13} />
            Reset filters
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
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
          {isTemporalAnalysis ? (
            <TemporalAnalysis filters={filters} />
          ) : (
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

              <SuratBaseMap
                height="calc(100vh - 80px)"
                sidebarOpen={sidebarOpen}
                baseMap={filters.baseMap || "osm"}
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
      </main>
    </div>
  );
}
