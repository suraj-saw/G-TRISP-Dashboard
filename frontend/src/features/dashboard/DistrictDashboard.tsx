// frontend/src/features/dashboard/DistrictDashboard.tsx
import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import API from "../../api/axios";
import type { User } from "../../types/user";
import { AlertTriangle as NoDataIcon, MapPin } from "lucide-react";

import { VisualizationLayers } from "../../components/maps/VisualizationLayers";
import BlackspotDetectionLayers from "../../components/maps/BlackspotDetectionLayers";
import DbscanBlackspotDetectionLayers from "../../components/maps/DbscanBlackspotDetectionLayers";
import AccidentDensityHeatmapLayers from "../../components/maps/AccidentDensityHeatmapLayers";
import { DensityMapOverlays } from "../../components/maps/MapOverlays";
import TopBar from "../../components/layout/TopBar";
import FilterSelect from "../../components/layout/FilterSelect";
import DistrictBaseMap from "../../components/maps/DistrictBaseMap";
import TemporalAnalysis from "../../components/temporal/TemporalAnalysis";
import LocationMarkersInsights from "../../components/charts/LocationMarkersInsights";

import {
  Filter,
  Layers,
  ChevronDown,
  RotateCcw,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";

import { fetchDistrictBoundaryBySlug } from "../../api/geoApi";
import {
  fetchGujaratFilterOptions,
  fetchGujaratDashboardData,
  fetchGujaratBlackspots,
  fetchGujaratDbscanBlackspots,
  fetchGujaratKdeHeatmap,
  fetchGujaratTemporalAnalysis,
} from "../../api/gujaratDashboardApi";
import type {
  DashboardFilters,
  FilterOptions,
  DashboardData,
} from "../../types/dashboard";
import { ROUTES, DEFAULT_BASE_MAP } from "../../config/constants";
import {
  SIDEBAR_WIDTH_PX,
  TOPBAR_HEIGHT_PX,
  SIDEBAR_Z_INDEX,
  TOPBAR_Z_INDEX,
  SIDEBAR_TRANSITION,
} from "../../config/layout";
import { VISUALIZATION_OPTIONS } from "./filterConfig";
import { MAP_STYLES } from "../../components/maps/mapStyles";

// ---------------------------------------------------------------------------
// District-scoped filter config — no police-station/district filter, since
// the district is fixed by the route itself.
// ---------------------------------------------------------------------------

type FilterId =
  | "baseMap"
  | "visualization_type"
  | "year"
  | "month"
  | "day"
  | "time_period"
  | "severity"
  | "road_classification"
  | "weather_condition"
  | "light_condition"
  | "collision_type"
  | "date_from"
  | "date_to";

interface FilterConfigItem {
  id: FilterId;
  label: string;
  icon?: "layers";
}

const MAP_FILTERS: FilterConfigItem[] = [
  { id: "baseMap", label: "Base Map", icon: "layers" },
  { id: "visualization_type", label: "Visualization Type" },
  { id: "date_from", label: "Start Date" },
  { id: "date_to", label: "End Date" },
  { id: "year", label: "Year" },
  { id: "severity", label: "Severity" },
  { id: "road_classification", label: "Road type" },
  { id: "weather_condition", label: "Weather" },
  { id: "light_condition", label: "Light condition" },
  { id: "collision_type", label: "Collision type" },
];

const TEMPORAL_FILTERS: FilterConfigItem[] = [
  { id: "visualization_type", label: "Visualization Type" },
  { id: "date_from", label: "Start Date" },
  { id: "date_to", label: "End Date" },
  { id: "year", label: "Year" },
  { id: "month", label: "Month" },
  { id: "day", label: "Day" },
  { id: "time_period", label: "Time Period" },
  { id: "severity", label: "Severity" },
  { id: "weather_condition", label: "Weather Condition" },
  { id: "light_condition", label: "Light Condition" },
];

const getDistrictFilterConfig = (
  visualizationType?: string
): FilterConfigItem[] =>
  visualizationType === "temporal_analysis" ? TEMPORAL_FILTERS : MAP_FILTERS;

const defaultDistrictFilters: DashboardFilters = {
  district: [],
  year: [],
  month: [],
  day: [],
  time_period: [],
  severity: [],
  road_classification: [],
  weather_condition: [],
  light_condition: [],
  collision_type: [],
  date_from: "",
  date_to: "",
  baseMap: DEFAULT_BASE_MAP,
  visualization_type: "location_markers",
};

const emptyDashboardData: DashboardData = {
  summary: {
    total_accidents: 0,
    total_fatalities: 0,
    total_grievous: 0,
    total_minor: 0,
    total_damage_only: 0,
    total_vehicles: 0,
    districts_covered: 0,
    police_stations: 0,
  },
  timeSeries: [],
  severity: [],
  districts: [],
  heatmap: [],
  casualty: [],
  weather: [],
  light: [],
  dangerous: [],
  roads: [],
  violations: [],
};

export default function DistrictDashboard() {
  const navigate = useNavigate();
  const { districtSlug = "" } = useParams<{ districtSlug: string }>();

  const [user, setUser] = useState<User | null>(null);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [boundary, setBoundary] = useState<GeoJSON.FeatureCollection | null>(
    null
  );
  const [boundaryLoading, setBoundaryLoading] = useState(true);
  const [boundaryError, setBoundaryError] = useState<string | null>(null);
  const [districtName, setDistrictName] = useState<string>("");

  const [filters, setFilters] = useState<DashboardFilters>(
    defaultDistrictFilters
  );
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(
    null
  );
  const [openPanels, setOpenPanels] = useState({ map: true, data: true });

  const [allData, setAllData] = useState<DashboardData>(emptyDashboardData);
  const [data, setData] = useState<DashboardData>(emptyDashboardData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Auth check ──────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    API.get<User>("/auth/me")
      .then((res) => {
        if (!active) return;
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

  // ── Resolve district boundary + display name from the URL slug ──────────
  useEffect(() => {
    if (!districtSlug) return;
    let active = true;
    setBoundaryLoading(true);
    setBoundaryError(null);
    setDistrictName("");

    fetchDistrictBoundaryBySlug(districtSlug)
      .then((fc) => {
        if (!active) return;
        setBoundary(fc);
        setDistrictName(String(fc.features?.[0]?.properties?.name ?? ""));
      })
      .catch(() => {
        if (active) setBoundaryError("Could not load district boundary.");
      })
      .finally(() => {
        if (active) setBoundaryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [districtSlug]);

  // ── Global filter dropdown options ───────────────────────────────────────
  useEffect(() => {
    fetchGujaratFilterOptions()
      .then(setFilterOptions)
      .catch(() => {});
  }, []);

  // ── Unfiltered data for this district — powers year/severity dropdowns ──
  useEffect(() => {
    if (!districtName) return;
    let active = true;
    fetchGujaratDashboardData(defaultDistrictFilters, districtName)
      .then((result) => {
        if (active) setAllData(result);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [districtName]);

  // ── Filtered data ─────────────────────────────────────────────────────────
  const filterKey = useMemo(
    () =>
      JSON.stringify({
        year: filters.year,
        severity: filters.severity,
        road_classification: filters.road_classification,
        weather_condition: filters.weather_condition,
        light_condition: filters.light_condition,
        collision_type: filters.collision_type,
        date_from: filters.date_from,
        date_to: filters.date_to,
      }),
    [filters]
  );

  const loadData = useCallback(() => {
    if (!districtName) return;
    setLoading(true);
    setError(null);
    fetchGujaratDashboardData(filters, districtName)
      .then(setData)
      .catch((err) => setError(err.message || "Failed to fetch district data."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districtName, filterKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const logout = async () => {
    try {
      await API.post("/auth/logout");
    } catch {
      /* continue */
    }
    navigate(ROUTES.LOGIN, { replace: true });
  };

  const years = useMemo(
    () =>
      Array.from(new Set(allData.timeSeries.map((t) => t.year))).sort(
        (a, b) => b - a
      ),
    [allData]
  );
  const severities = useMemo(
    () => allData.severity.map((s) => s.severity),
    [allData]
  );

  const monthOptions = [
    { value: "01", label: "January" },
    { value: "02", label: "February" },
    { value: "03", label: "March" },
    { value: "04", label: "April" },
    { value: "05", label: "May" },
    { value: "06", label: "June" },
    { value: "07", label: "July" },
    { value: "08", label: "August" },
    { value: "09", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
  ];
  const dayOptions = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ].map((d) => ({ value: d, label: d }));
  const timePeriodOptions = ["Morning", "Afternoon", "Evening", "Night"].map(
    (p) => ({
      value: p,
      label: p,
    })
  );

  const filterOptionsById: Record<
    FilterId,
    { value: string; label: string }[]
  > = {
    baseMap: MAP_STYLES.map((s) => ({ value: s.id, label: s.label })),
    visualization_type: VISUALIZATION_OPTIONS,
    year: years.map((y) => ({ value: String(y), label: String(y) })),
    month: monthOptions,
    day: dayOptions,
    time_period: timePeriodOptions,
    severity: severities.map((s) => ({ value: s, label: s })),
    road_classification: (filterOptions?.road_classifications || []).map(
      (r) => ({
        value: r,
        label: r,
      })
    ),
    weather_condition: (filterOptions?.weather_conditions || []).map((w) => ({
      value: w,
      label: w,
    })),
    light_condition: (filterOptions?.light_conditions || []).map((l) => ({
      value: l,
      label: l,
    })),
    collision_type: (filterOptions?.collision_types || []).map((c) => ({
      value: c,
      label: c,
    })),
    date_from: [],
    date_to: [],
  };

  const activeFilterConfig = getDistrictFilterConfig(
    filters.visualization_type
  );
  const isTemporalAnalysis = filters.visualization_type === "temporal_analysis";
  const isDensityHeatmap = filters.visualization_type === "density_heatmap";
  const isBlackspotDetection = filters.visualization_type === "blackspot";
  const isDbscanBlackspot = filters.visualization_type === "dbscan_blackspot";
  const isKdeDensityHeatmap =
    filters.visualization_type === "kde_density_heatmap";
  const isLocationMarkers =
    filters.visualization_type === "location_markers" ||
    !filters.visualization_type;

  const overlaySubtitle = useMemo(() => {
    const parts: string[] = [districtName || "District"];
    if (filters.year?.length) parts.push(filters.year.join(", "));
    if (filters.severity?.length) parts.push(filters.severity.join(", "));
    return parts.join(" · ");
  }, [districtName, filters.year, filters.severity]);

  const renderFilter = (filter: FilterConfigItem) => {
    const value = filters[filter.id] ?? [];
    const isMultiSelect =
      filter.id !== "baseMap" && filter.id !== "visualization_type";

    const handleChange = (nextValue: string | string[]) => {
      setFilters((current) => {
        if (filter.id === "visualization_type") {
          return {
            ...current,
            visualization_type: nextValue as string,
            month: [],
            day: [],
            time_period: [],
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
        {filter.id === "date_from" || filter.id === "date_to" ? (
          <input
            type="date"
            value={(value as string) || ""}
            max={
              filter.id === "date_from"
                ? filters.date_to || undefined
                : undefined
            }
            min={
              filter.id === "date_to"
                ? filters.date_from || undefined
                : undefined
            }
            onChange={(e) => handleChange(e.target.value)}
            className="w-full rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-3 py-2 text-[13px] font-medium text-[#1A1D2E] outline-none transition focus:border-[#1e3a8a] focus:bg-white focus:ring-2 focus:ring-[#1e3a8a]/10 hover:border-[#C9CEDF]"
          />
        ) : (
          <FilterSelect
            value={value as string | string[]}
            options={filterOptionsById[filter.id]}
            onChange={handleChange}
            multiSelect={isMultiSelect}
          />
        )}
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
      <div className={`fixed left-0 right-0 top-0 ${TOPBAR_Z_INDEX}`}>
        <TopBar
          appName={`G-TRISP · ${districtName || "District"}`}
          user={user}
          showNotificationBell={false}
          onLogout={logout}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />
      </div>

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
          <button
            onClick={() => navigate(ROUTES.DASHBOARD)}
            className="flex items-center gap-2 rounded-lg border border-[#E4E8F4] bg-white px-3 py-2 text-[12px] font-semibold text-[#1e3a8a] shadow-sm hover:bg-[#EEF2FB] transition"
          >
            <ArrowLeft size={13} />
            Back to Gujarat map
          </button>

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

          <button
            onClick={() => setFilters(defaultDistrictFilters)}
            className="flex items-center justify-center gap-2 rounded-lg border border-[#E4E8F4] bg-white px-4 py-2.5 text-[12px] font-semibold text-[#6B7299] shadow-sm transition hover:border-[#1e3a8a] hover:text-[#1e3a8a] active:scale-[0.98]"
          >
            <RotateCcw size={13} />
            Reset filters
          </button>
        </div>
      </aside>

      <main
        className="min-w-0 transition-[padding-left] duration-300 ease-in-out overflow-y-auto"
        style={{
          paddingTop: `${TOPBAR_HEIGHT_PX}px`,
          paddingLeft: sidebarOpen ? `${SIDEBAR_WIDTH_PX}px` : "0px",
          minHeight: "100vh",
        }}
      >
        <div className="flex flex-col gap-4 p-4">
          {(error || boundaryError) && (
            <div className="flex items-start gap-3 rounded-xl border border-[#FECACA] bg-[#FFF5F5] px-4 py-3 text-sm text-[#B91C1C]">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Failed to load data</p>
                <p className="mt-0.5 text-xs text-[#DC2626]">
                  {error || boundaryError}
                </p>
              </div>
            </div>
          )}

          <motion.div
            className="w-full"
            style={{ height: `calc(100vh - ${TOPBAR_HEIGHT_PX}px - 2rem)` }}
            animate={{ opacity: loading ? 0.6 : 1 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            {isTemporalAnalysis ? (
              <TemporalAnalysis
                filters={filters}
                fetchFn={(f) => fetchGujaratTemporalAnalysis(f, districtName)}
              />
            ) : (
              <div className="h-full w-full rounded-2xl overflow-hidden shadow-xl border border-[#E4E8F4] relative">
                <DistrictBaseMap
                  height="100%"
                  sidebarOpen={sidebarOpen}
                  baseMap={filters.baseMap || DEFAULT_BASE_MAP}
                  boundary={boundary}
                  boundaryLoading={boundaryLoading}
                  boundaryError={boundaryError}
                  loadingLabel={`Loading ${districtName || "district"}…`}
                  overlays={
                    isDensityHeatmap ? (
                      <DensityMapOverlays
                        data={data.heatmap}
                        subtitle={overlaySubtitle}
                      />
                    ) : undefined
                  }
                >
                  {isBlackspotDetection ? (
                    <BlackspotDetectionLayers
                      filters={filters}
                      fetchFn={(f) => fetchGujaratBlackspots(f, districtName)}
                    />
                  ) : isDbscanBlackspot ? (
                    <DbscanBlackspotDetectionLayers
                      filters={filters}
                      fetchFn={(f) =>
                        fetchGujaratDbscanBlackspots(f, districtName)
                      }
                    />
                  ) : isKdeDensityHeatmap ? (
                    <AccidentDensityHeatmapLayers
                      filters={filters}
                      fetchFn={(f) => fetchGujaratKdeHeatmap(f, districtName)}
                    />
                  ) : (
                    <VisualizationLayers
                      key={filters.visualization_type || "location_markers"}
                      data={data.heatmap}
                      type={filters.visualization_type || "location_markers"}
                      selectedSeverity={filters.severity}
                    />
                  )}
                </DistrictBaseMap>
                {!loading &&
                  !error &&
                  !boundaryLoading &&
                  data.summary.total_accidents === 0 && (
                    <div className="absolute inset-0 z-30 flex items-center justify-center p-6 bg-slate-900/10 backdrop-blur-[2px] rounded-2xl pointer-events-none">
                      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/95 p-8 shadow-2xl border border-slate-200 text-center max-w-sm pointer-events-auto">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 border border-amber-100">
                          <MapPin size={26} className="text-amber-500" />
                        </div>
                      <div>
                        <p className="text-base font-bold text-slate-800">
                          No accident data available yet
                        </p>
                        <p className="mt-1 max-w-sm text-sm text-slate-500">
                          {districtName || "This district"} doesn't have
                          recorded accident records in the system yet. Try a
                          district with available data, such as Surat or
                          Bhavnagar.
                        </p>
                      </div>
                      <button
                        onClick={() => navigate(ROUTES.DASHBOARD)}
                        className="mt-1 rounded-lg bg-[#1e3a8a] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#17337b]"
                      >
                        Back to Gujarat map
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>

          {isLocationMarkers && data && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: loading ? 0.6 : 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-6 space-y-6"
            >
              <LocationMarkersInsights data={data} />
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
