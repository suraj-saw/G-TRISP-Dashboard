/**
 * @file Dashboard.tsx
 * @description Main dashboard orchestrator for the Surat mapping application.
 * @responsibility Manages the layout, data fetching, filter state, and rendering of the central map (with various heatmap/blackspot layers) and temporal/insight panels.
 * @dependencies framer-motion, react-router-dom, react
 */
import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import API from "../../api/axios";
import type { User } from "../../types/user";

import { VisualizationLayers } from "../../components/maps/VisualizationLayers";
import BlackspotDetectionLayers from "../../components/maps/BlackspotDetectionLayers";
import IrcBlackspotDetectionLayers from "../../components/maps/IrcBlackspotDetectionLayers";

import TopBar from "../../components/layout/TopBar";
import FilterSelect from "../../components/layout/FilterSelect";
import ExportButton from "../../components/layout/ExportButton";
import DbscanBlackspotDetectionLayers from "../../components/maps/DbscanBlackspotDetectionLayers";
import BlackspotExportButton from "../../components/layout/BlackspotExportButton";
// import KdeHeatmapLayers from "../../components/maps/KdeHeatmapLayers";
// import WeightedKdeHeatmapLayers from "../../components/maps/WeightedKdeHeatmapLayers";

import {
  Filter,
  Layers,
  ChevronDown,
  RotateCcw,
  AlertTriangle,
  Calendar,
  MapPin,
  AlertCircle,
  Cloud,
} from "lucide-react";

// import {
//   Filter,
//   Layers,
//   ChevronDown,
//   RotateCcw,
//   AlertTriangle,
// } from "lucide-react";

import { useDashboard } from "../../hooks/useDashboard";
import type {
  DashboardFilters,
  FilterOptions,
  HeatmapPoint,
} from "../../types/dashboard";
import {
  fetchFilterOptions,
  fetchBlackspots,
  fetchPedestrianBlackspots,
  fetchDbscanBlackspots,
  fetchPedestrianDbscanBlackspots,
  exportBlackspotCrashes,
  fetchIrcGreedyBlackspots,
  fetchIrcGreedyBlackspots,
  fetchIrcGridBlackspots,
  fetchPedestrianIrcGreedyBlackspots,
  fetchPedestrianIrcGridBlackspots,
} from "../../api/dashboardApi";
import SuratBaseMap from "../../components/maps/SuratBaseMap";
import SeverityLegend from "../../components/maps/SeverityLegend";
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
  VISUALIZATION_VARIANT_LABELS,
  VISUALIZATION_VARIANT_OPTIONS,
  hasVisualizationVariants,
  type FilterId,
} from "./filterConfig";
import { isBlackspotVisualization } from "../../utils/dashboardFilters";

const pedestrianCasualtyTotal = (point: HeatmapPoint): number =>
  (Number(point.pedestrian_killed) || 0) +
  (Number(point.pedestrian_grievous_injury) || 0) +
  (Number(point.pedestrian_minor_injury) || 0);

const isPedestrianAccident = (point: HeatmapPoint): boolean =>
  pedestrianCasualtyTotal(point) > 0;

type DateBounds = {
  min?: string;
  max?: string;
};

// const toDateInputValue = (value?: string | null): string | null => {
//   if (!value) return null;
//   if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
//   if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);

//   const date = new Date(value);
//   if (Number.isNaN(date.getTime())) return null;
//   return date.toISOString().slice(0, 10);
// };

// const getDatasetDateBounds = (points?: HeatmapPoint[]): DateBounds => {
//   const dates =
//     points
//       ?.map((point) => toDateInputValue(point.accident_date_time))
//       .filter((value): value is string => Boolean(value))
//       .sort() || [];

//   return {
//     min: dates[0],
//     max: dates[dates.length - 1],
//   };
// };

/**
 * Ensures a given date string falls within the specified min/max bounds.
 * @param {string} value - The input date string (YYYY-MM-DD).
 * @param {DateBounds} bounds - The minimum and maximum allowed dates.
 * @returns {string} The clamped date string.
 */
const clampDateValue = (value: string, bounds: DateBounds): string => {
  if (!value) return "";
  if (bounds.min && value < bounds.min) return bounds.min;
  if (bounds.max && value > bounds.max) return bounds.max;
  return value;
};

/**
 * A controlled date input component that handles local draft state and commits on blur/enter.
 * @param {Object} props - Component props.
 * @param {string} props.value - The current committed date value.
 * @param {string} [props.min] - The minimum allowed date.
 * @param {string} [props.max] - The maximum allowed date.
 * @param {(value: string) => void} props.onCommit - Callback fired when the user commits a date.
 * @param {string} props.className - CSS classes for styling.
 * @returns {JSX.Element} The date input element.
 */
function DateFilterInput({
  value,
  min,
  max,
  onCommit,
  className,
}: {
  value: string;
  min?: string;
  max?: string;
  onCommit: (value: string) => void;
  className: string;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    const next = clampDateValue(draft, { min, max });
    setDraft(next);
    if (next !== value) onCommit(next);
  };

  return (
    <input
      type="date"
      value={draft}
      min={min}
      max={max}
      onChange={(event) => {
        const next = clampDateValue(event.target.value, { min, max });
        setDraft(next);
        if (next !== value) onCommit(next);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
}

/**
 * Dashboard Component (Surat Specific)
 * @component_responsibility Orchestrates the Surat map dashboard, synchronizing global filters with map layers and temporal charts.
 * @state_management Manages a complex `filters` object encompassing spatial, temporal, and categorical parameters, and manages sidebar visibility.
 * @hooks_usage Uses custom `useDashboard` hook for data fetching. Uses `useMemo` extensively to derive options from data (e.g., available years/severities).
 * @returns {JSX.Element} The rendered Surat dashboard layout.
 */
export default function Dashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(
    null
  );
  const [openPanels, setOpenPanels] = useState({ 
    map: true, 
    time: true, 
    location: true, 
    incident: false, 
    environment: false 
  });

  const allDataFilters: DashboardFilters = defaultFilters;
  const { data: allData } = useDashboard(allDataFilters);
  const { data, loading, error } = useDashboard(filters);

  useEffect(() => {
    let active = true;
    API.get<User>("/auth/me")
      .then((res) => {
        if (!active) return;
        if (res.data.role === "admin" || res.data.role === "superadmin") {
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
    if (!allData?.timeSeries) return [];
    const unique = Array.from(
      new Set(allData.timeSeries.map((t) => t.year))
    ).sort((a, b) => b - a);
    return unique;
  }, [allData]);

  const datasetDateBounds = useMemo(() => {
    return {
      min: filterOptions?.min_date || "",
      max: filterOptions?.max_date || "",
    };
  }, [filterOptions]);

  useEffect(() => {
    if (!datasetDateBounds.min && !datasetDateBounds.max) return;

    setFilters((current) => {
      const nextFrom = clampDateValue(current.date_from || "", {
        min: datasetDateBounds.min,
        max: current.date_to || datasetDateBounds.max,
      });
      const nextTo = clampDateValue(current.date_to || "", {
        min: nextFrom || datasetDateBounds.min,
        max: datasetDateBounds.max,
      });

      if (
        nextFrom === (current.date_from || "") &&
        nextTo === (current.date_to || "")
      ) {
        return current;
      }

      return {
        ...current,
        date_from: nextFrom,
        date_to: nextTo,
      };
    });
  }, [datasetDateBounds.min, datasetDateBounds.max]);

  const severities = useMemo(() => {
    if (!allData?.severity) return [];
    return allData.severity.map((s) => s.severity);
  }, [allData]);

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
    { value: "Monday", label: "Monday" },
    { value: "Tuesday", label: "Tuesday" },
    { value: "Wednesday", label: "Wednesday" },
    { value: "Thursday", label: "Thursday" },
    { value: "Friday", label: "Friday" },
    { value: "Saturday", label: "Saturday" },
    { value: "Sunday", label: "Sunday" },
  ];

  const timePeriodOptions = [
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
    visualization_variant: VISUALIZATION_VARIANT_OPTIONS,
    year: years.map((y) => ({
      value: String(y),
      label: String(y),
    })),
    month: monthOptions,
    day: dayOptions,
    time_period: timePeriodOptions,
    district: (filterOptions?.police_stations || []).map((s) => ({
      value: s,
      label: s,
    })),
    severity: severities.map((s) => ({
      value: s,
      label: s,
    })),
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

  const activeFilterConfig = getFilterConfig(filters.visualization_type);

  const visualizationType = filters.visualization_type || "location_markers";

  const isTemporalAnalysis = visualizationType === "temporal_analysis";

  // const isDensityHeatmap = visualizationType === "density_heatmap";
  // const showDensityLegend = isDensityHeatmap || isKdeHeatmap || isWeightedKdeHeatmap;
  // const densityLegendTitle = isWeightedKdeHeatmap
  //   ? "Severity-Weighted KDE"
  //   : isKdeHeatmap
  //     ? "KDE Density"
  //     : "Accident Density";

  const isBlackspotDetection = visualizationType === "blackspot";
  const isPedestrianVariant = filters.visualization_variant === "pedestrian";
  const isPedestrianBlackspot = isBlackspotDetection && isPedestrianVariant;
  const isDbscanBlackspot = visualizationType === "dbscan_blackspot";
  const isIrcGreedyBlackspot = visualizationType === "irc_greedy_blackspot";
  const isIrcGridBlackspot = visualizationType === "irc_grid_blackspot";

  const isLocationMarkers = visualizationType === "location_markers";
  const displayHeatmapData = isPedestrianVariant
    ? data?.heatmap.filter(isPedestrianAccident)
    : data?.heatmap;

  const visualizationLayerType =
    isLocationMarkers && isPedestrianVariant
      ? "pedestrian_accidents"
      : visualizationType;

  // Build a human-readable subtitle for the overlay
  // const overlaySubtitle = useMemo(() => {
  //   const parts: string[] = ["Surat"];
  //   if (filters.district?.length) parts.push(filters.district.join(", "));
  //   if (filters.year?.length) parts.push(filters.year.join(", "));
  //   if (filters.severity?.length) parts.push(filters.severity.join(", "));
  //   return parts.join(" · ");
  // }, [filters.district, filters.year, filters.severity]);

  const renderFilter = (filter: (typeof activeFilterConfig)[number]) => {
    const isDateFilter = filter.id === "date_from" || filter.id === "date_to";
    const variantLabel =
      VISUALIZATION_VARIANT_LABELS[filters.visualization_type || ""];

    if (filter.id === "visualization_variant" && !variantLabel) {
      return null;
    }

    if (isDateFilter) {
      const value = (filters[filter.id] as string | undefined) ?? "";
      const minDate =
        filter.id === "date_to"
          ? filters.date_from || datasetDateBounds.min
          : datasetDateBounds.min;
      const maxDate =
        filter.id === "date_from"
          ? filters.date_to || datasetDateBounds.max
          : datasetDateBounds.max;

      return (
        <div key={filter.id} className="flex flex-col gap-1.5">
          <label className="px-0.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#1e3a8a]">
            {filter.label}
          </label>
          <DateFilterInput
            value={value}
            min={minDate}
            max={maxDate}
            onCommit={(nextValue) =>
              setFilters((current) => {
                const newFilters = { ...current, [filter.id]: nextValue };
                if (nextValue) newFilters.year = [];
                return newFilters;
              })
            }
            className="w-full rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-3 py-2 text-[13px] font-medium text-[#1A1D2E] outline-none transition hover:border-[#C9CEDF] focus:border-[#1e3a8a] focus:bg-white focus:ring-2 focus:ring-[#1e3a8a]/10"
          />
        </div>
      );
    }

    const value = filters[filter.id] ?? [];
    const isMultiSelect =
      filter.id !== "baseMap" &&
      filter.id !== "visualization_type" &&
      filter.id !== "visualization_variant";

    const handleChange = (nextValue: string | string[]) => {
      setFilters((current) => {
        if (filter.id === "visualization_type") {
          const visualizationType = nextValue as string;
          return {
            ...current,
            visualization_type: visualizationType,
            visualization_variant: hasVisualizationVariants(visualizationType)
              ? current.visualization_variant || "accident"
              : "accident",
            month: [],
            day: [],
            time_period: [],
            severity: isBlackspotVisualization(visualizationType)
              ? []
              : current.severity,
          };
        }
        
        const newFilters = { ...current, [filter.id]: nextValue };
        if (filter.id === "year" && Array.isArray(nextValue) && nextValue.length > 0) {
          newFilters.date_from = "";
          newFilters.date_to = "";
        }
        
        return newFilters;
      });
    };

    return (
      <div key={filter.id} className="flex flex-col gap-1.5">
        <label className="px-0.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#1e3a8a]">
          {filter.icon === "layers" && (
            <Layers size={12} className="text-[#1e3a8a]" />
          )}
          {filter.id === "visualization_variant" ? variantLabel : filter.label}
        </label>
        <FilterSelect
          value={value as string | string[]}
          options={filterOptionsById[filter.id]}
          onChange={handleChange}
          multiSelect={isMultiSelect}
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
          fixed right-0 ${SIDEBAR_Z_INDEX}
          flex flex-col overflow-y-auto no-scrollbar
          border-l border-[#E4E8F4] bg-[#F1F4FB] shadow-lg
          will-change-transform ${SIDEBAR_TRANSITION}
          ${sidebarOpen ? "translate-x-0" : "translate-x-full"}
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
            const MAP_FILTER_IDS = ["baseMap", "visualization_type", "visualization_variant"];
            const TIME_FILTER_IDS = ["date_from", "date_to", "year", "month", "day", "time_period"];
            const LOCATION_FILTER_IDS = ["district", "taluka", "police_station"];
            const INCIDENT_FILTER_IDS = ["severity", "collision_type"];
            const ENVIRONMENT_FILTER_IDS = ["road_classification", "weather_condition", "light_condition"];

            const mapFilters = activeFilterConfig.filter((f) => MAP_FILTER_IDS.includes(f.id));
            const timeFilters = activeFilterConfig.filter((f) => TIME_FILTER_IDS.includes(f.id));
            const locationFilters = activeFilterConfig.filter((f) => LOCATION_FILTER_IDS.includes(f.id));
            const incidentFilters = activeFilterConfig.filter((f) => INCIDENT_FILTER_IDS.includes(f.id));
            const environmentFilters = activeFilterConfig.filter((f) => ENVIRONMENT_FILTER_IDS.includes(f.id));

            const togglePanel = (key: keyof typeof openPanels) =>
              setOpenPanels((prev) => ({ ...prev, [key]: !prev[key] }));

            const renderAccordion = (
              key: keyof typeof openPanels,
              title: string,
              filters: typeof activeFilterConfig,
              IconComponent: React.ElementType
            ) => {
              if (filters.length === 0) return null;
              return (
                <section className="rounded-xl border border-[#E4E8F4] bg-white shadow-sm overflow-hidden">
                  <button
                    type="button"
                    onClick={() => togglePanel(key)}
                    aria-expanded={openPanels[key]}
                    className="flex w-full items-center gap-2 bg-[#1e3a8a] px-3.5 py-2.5 transition hover:bg-[#1c346f]"
                  >
                    <IconComponent size={13} className="text-white/75" />
                    <h2 className="flex-1 text-left text-[11px] font-bold uppercase tracking-wider text-white">
                      {title}
                    </h2>
                    <ChevronDown
                      size={15}
                      className={`text-white/75 transition-transform duration-200 ${openPanels[key] ? "rotate-180" : ""}`}
                    />
                  </button>
                  {openPanels[key] && (
                    <div className="flex flex-col gap-3 p-3">
                      {filters.map(renderFilter)}
                    </div>
                  )}
                </section>
              );
            };

            return (
              <div className="flex flex-col gap-3">
                {renderAccordion("map", "Map Settings", mapFilters, Layers)}
                {renderAccordion("time", "Time Period", timeFilters, Calendar)}
                {renderAccordion("location", "Location & Admin", locationFilters, MapPin)}
                {renderAccordion("incident", "Incident Details", incidentFilters, AlertCircle)}
                {renderAccordion("environment", "Environment", environmentFilters, Cloud)}
              </div>
            );
          })()}

          <ExportButton filters={filters} />
          {(isBlackspotDetection || isDbscanBlackspot || isIrcGreedyBlackspot || isIrcGridBlackspot) && (
            <BlackspotExportButton
              filters={filters}
              algorithm={
                isDbscanBlackspot ? "dbscan" : 
                isIrcGreedyBlackspot ? "irc_greedy" : 
                isIrcGridBlackspot ? "irc_grid" : "greedy"
              }
              isSurat={true}
            />
          )}

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
        className="min-w-0 transition-[padding-right] duration-300 ease-in-out overflow-y-auto"
        style={{
          paddingTop: `${TOPBAR_HEIGHT_PX}px`,
          paddingRight: sidebarOpen ? `${SIDEBAR_WIDTH_PX}px` : "0px",
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
                  overlays={undefined}
                >
                  {isPedestrianBlackspot ? (
                    <BlackspotDetectionLayers
                      key="pedestrian-blackspot"
                      filters={filters}
                      fetchFn={fetchPedestrianBlackspots}
                      exportFn={exportBlackspotCrashes}
                      heatmapData={data?.heatmap.filter(isPedestrianAccident)}
                      analysisLabel="Pedestrian MoRTH Blackspot (Greedy)"
                      crashLabel="pedestrian crashes"
                    />
                  ) : isBlackspotDetection ? (
                    <BlackspotDetectionLayers
                      key="blackspot"
                      filters={filters}
                      fetchFn={fetchBlackspots}
                      exportFn={exportBlackspotCrashes}
                      heatmapData={data?.heatmap}
                    />
                  ) : isDbscanBlackspot && isPedestrianVariant ? (
                    <DbscanBlackspotDetectionLayers
                      key="pedestrian-dbscan-blackspot"
                      filters={filters}
                      heatmapData={data?.heatmap.filter(isPedestrianAccident)}
                      fetchFn={fetchPedestrianDbscanBlackspots}
                      exportFn={exportBlackspotCrashes}
                      analysisLabel="Pedestrian MoRTH Blackspot (DBSCAN)"
                      crashLabel="pedestrian crashes"
                    />
                  ) : isDbscanBlackspot ? (
                    <DbscanBlackspotDetectionLayers
                      key="dbscan-blackspot"
                      filters={filters}
                      heatmapData={data?.heatmap}
                      fetchFn={fetchDbscanBlackspots}
                      exportFn={exportBlackspotCrashes}
                    />
                  ) : isIrcGreedyBlackspot && isPedestrianVariant ? (
                    <IrcBlackspotDetectionLayers
                      key="pedestrian-irc-greedy-blackspot"
                      filters={filters}
                      heatmapData={data?.heatmap.filter(isPedestrianAccident)}
                      fetchFn={fetchPedestrianIrcGreedyBlackspots}
                      exportFn={exportBlackspotCrashes}
                      analysisLabel="Pedestrian IRC 131 Blackspot (Greedy)"
                      crashLabel="pedestrian crashes"
                    />
                  ) : isIrcGreedyBlackspot ? (
                    <IrcBlackspotDetectionLayers
                      key="irc-greedy-blackspot"
                      filters={filters}
                      heatmapData={data?.heatmap}
                      fetchFn={fetchIrcGreedyBlackspots}
                      exportFn={exportBlackspotCrashes}
                      analysisLabel="IRC 131 Blackspot (Greedy)"
                    />
                  ) : isIrcGridBlackspot && isPedestrianVariant ? (
                    <IrcBlackspotDetectionLayers
                      key="pedestrian-irc-grid-blackspot"
                      filters={filters}
                      heatmapData={data?.heatmap.filter(isPedestrianAccident)}
                      fetchFn={fetchPedestrianIrcGridBlackspots}
                      exportFn={exportBlackspotCrashes}
                      analysisLabel="Pedestrian IRC 131 Blackspot (Grid)"
                      crashLabel="pedestrian crashes"
                    />
                  ) : isIrcGridBlackspot ? (
                    <IrcBlackspotDetectionLayers
                      key="irc-grid-blackspot"
                      filters={filters}
                      heatmapData={data?.heatmap}
                      fetchFn={fetchIrcGridBlackspots}
                      exportFn={exportBlackspotCrashes}
                      analysisLabel="IRC 131 Blackspot (Grid)"
                    />
                  ) : (
                    <VisualizationLayers
                      key={`${visualizationLayerType}-${filters.visualization_variant || "accident"}`}
                      data={displayHeatmapData}
                      type={visualizationLayerType}
                      selectedSeverity={filters.severity}
                    />
                  )}
                  <SeverityLegend
                    visualizationLayerType={visualizationLayerType}
                  />
                </SuratBaseMap>
              </div>
            )}
          </motion.div>

          {/* Charts panel — shown below map only for Location Markers */}
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
