// frontend/src/features/dashboard/DistrictDashboard.tsx
import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import API from "../../api/axios";
import type { User } from "../../types/user";
import {
  // AlertTriangle as NoDataIcon,
  MapPin,
} from "lucide-react";

import { VisualizationLayers } from "../../components/maps/VisualizationLayers";
import BlackspotDetectionLayers from "../../components/maps/BlackspotDetectionLayers";
import DbscanBlackspotDetectionLayers from "../../components/maps/DbscanBlackspotDetectionLayers";
import KdeHeatmapLayers from "../../components/maps/KdeHeatmapLayers";
import WeightedKdeHeatmapLayers from "../../components/maps/WeightedKdeHeatmapLayers";
// import DensityMapOverlays from "../../components/maps/DensityMapOverlays";
import SeverityLegend from "../../components/maps/SeverityLegend";
import TopBar from "../../components/layout/TopBar";
import FilterSelect from "../../components/layout/FilterSelect";
import DistrictBaseMap from "../../components/maps/DistrictBaseMap";
import type { DistrictBaseMapHandle } from "../../components/maps/DistrictBaseMap";
import TemporalAnalysis from "../../components/temporal/TemporalAnalysis";
import DistrictAnalysisTabs, {
  type AnalysisView,
} from "../../components/maps/Districtanalysistabs";
import DistrictStatisticalAnalysis from "../../components/dashboard/DistrictStatisticalAnalysis";
import { ExportProvider, useExportContext } from "../../context/ExportContext";
import { downloadGujaratExport } from "../../api/exportApi";

import {
  Filter,
  Layers,
  ChevronDown,
  RotateCcw,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";

import {
  fetchDistrictBoundaryBySlug,
  fetchTalukasForDistrict,
} from "../../api/geoApi";
import {
  fetchGujaratFilterOptions,
  fetchGujaratDashboardData,
  fetchGujaratBlackspots,
  fetchGujaratPedestrianBlackspots,
  fetchGujaratDbscanBlackspots,
  fetchGujaratTemporalAnalysis,
  fetchGujaratKdeHeatmap,
  fetchGujaratWeightedKdeHeatmap,
  exportGujaratBlackspotCrashes,
} from "../../api/gujaratDashboardApi";
import type {
  DashboardFilters,
  FilterOptions,
  DashboardData,
  HeatmapPoint,
} from "../../types/dashboard";
import { ROUTES, DEFAULT_BASE_MAP } from "../../config/constants";
import {
  SIDEBAR_WIDTH_PX,
  TOPBAR_HEIGHT_PX,
  SIDEBAR_Z_INDEX,
  TOPBAR_Z_INDEX,
  SIDEBAR_TRANSITION,
} from "../../config/layout";
import {
  VISUALIZATION_OPTIONS,
  VISUALIZATION_VARIANT_LABELS,
  VISUALIZATION_VARIANT_OPTIONS,
  hasVisualizationVariants,
} from "./filterConfig";
import { MAP_STYLES } from "../../components/maps/mapStyles";

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

const clampDateValue = (value: string, bounds: DateBounds): string => {
  if (!value) return "";
  if (bounds.min && value < bounds.min) return bounds.min;
  if (bounds.max && value > bounds.max) return bounds.max;
  return value;
};

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
      onChange={(event) => setDraft(event.target.value)}
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

// ---------------------------------------------------------------------------
// District-scoped filter config — no police-station/district filter, since
// the district is fixed by the route itself.
// ---------------------------------------------------------------------------

type FilterId =
  | "baseMap"
  | "visualization_type"
  | "visualization_variant"
  | "year"
  | "month"
  | "day"
  | "time_period"
  | "severity"
  | "road_classification"
  | "weather_condition"
  | "light_condition"
  | "collision_type"
  | "police_station" // NEW
  | "taluka"
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
  { id: "visualization_variant", label: "Visualization Variant" },
  { id: "date_from", label: "Start Date" },
  { id: "date_to", label: "End Date" },
  { id: "year", label: "Year" },
  { id: "taluka", label: "Taluka" }, // NEW
  { id: "police_station", label: "Police Station" }, // NEW
  { id: "severity", label: "Severity" },
  { id: "road_classification", label: "Road type" },
  { id: "weather_condition", label: "Weather" },
  { id: "light_condition", label: "Light condition" },
  { id: "collision_type", label: "Collision type" },
];

const TEMPORAL_FILTERS: FilterConfigItem[] = [
  { id: "baseMap", label: "Base Map", icon: "layers" },
  { id: "visualization_type", label: "Visualization Type" },
  { id: "visualization_variant", label: "Visualization Variant" },
  { id: "date_from", label: "Start Date" },
  { id: "date_to", label: "End Date" },
  { id: "year", label: "Year" },
  { id: "month", label: "Month" },
  { id: "day", label: "Day" },
  { id: "time_period", label: "Time Period" },
  { id: "taluka", label: "Taluka" }, // NEW
  { id: "police_station", label: "Police Station" },
  { id: "severity", label: "Severity" },
  { id: "weather_condition", label: "Weather Condition" },
  { id: "light_condition", label: "Light Condition" },
];

const DISTRICT_VISUALIZATION_OPTIONS = VISUALIZATION_OPTIONS.filter(
  (option) => option.value !== "temporal_analysis"
);

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
  police_station: [], // NEW
  taluka: [],
  date_from: "",
  date_to: "",
  baseMap: DEFAULT_BASE_MAP,
  visualization_type: "location_markers",
  visualization_variant: "accident",
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

function SpatialExportRegistrar({
  analysisView,
  isBlackspotDetection,
  isDbscanBlackspot,
  filters,
  districtName,
  // mapRef,
}: any) {
  const { registerExportHandler } = useExportContext();

  useEffect(() => {
    if (analysisView === "spatial") {
      if (isBlackspotDetection || isDbscanBlackspot) {
        registerExportHandler({
          supportedFormats: ["csv", "excel"],
          allowClusterSelection: true,
          onExport: async (format, options) => {
            if (format === "csv" || format === "excel") {
              const isBlackspot = isBlackspotDetection || isDbscanBlackspot;
              await downloadGujaratExport(
                filters,
                format,
                districtName,
                isBlackspot,
                options?.clusterId
              );
            }
          },
        });
      } else {
        registerExportHandler({
          supportedFormats: ["csv", "excel"],
          onExport: async (format) => {
            if (format === "csv" || format === "excel") {
              await downloadGujaratExport(filters, format, districtName);
            }
          },
        });
      }
    } else {
      registerExportHandler(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    analysisView,
    isBlackspotDetection,
    isDbscanBlackspot,
    filters,
    districtName,
    registerExportHandler,
  ]);

  return null;
}

export default function DistrictDashboard() {
  const [analysisView, setAnalysisView] = useState<AnalysisView>("spatial");
  const navigate = useNavigate();
  const mapRef = useRef<DistrictBaseMapHandle>(null);
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
  const [talukaOptions, setTalukaOptions] = useState<
    { value: string; label: string }[]
  >([]);
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

  // ── Filter dropdown options for this district ───────────────────────────
  useEffect(() => {
    if (!districtName) return;
    fetchGujaratFilterOptions(districtName)
      .then(setFilterOptions)
      .catch(() => {});
  }, [districtName]);

  useEffect(() => {
    if (!districtSlug) return;
    fetchTalukasForDistrict(districtSlug)
      .then((rows) =>
        setTalukaOptions(rows.map((r) => ({ value: r.name, label: r.name })))
      )
      .catch(() => setTalukaOptions([]));
  }, [districtSlug]);

  // ── Filtered data ─────────────────────────────────────────────────────────
  // Use a ref-based generation counter to cancel stale in-flight requests.
  const fetchGenRef = useRef(0);

  useEffect(() => {
    if (!districtName) return;
    const generation = ++fetchGenRef.current;
    setLoading(true);
    setError(null);
    fetchGujaratDashboardData(filters, districtName)
      .then((result) => {
        // Discard result if a newer request has been started
        if (generation !== fetchGenRef.current) return;
        setData(result);
      })
      .catch((err) => {
        if (generation !== fetchGenRef.current) return;
        setError(err.message || "Failed to fetch district data.");
      })
      .finally(() => {
        if (generation === fetchGenRef.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    districtName,
    filters.year,
    filters.severity,
    filters.road_classification,
    filters.weather_condition,
    filters.light_condition,
    filters.collision_type,
    filters.police_station,
    filters.taluka,
    filters.date_from,
    filters.date_to,
  ]);

  // Fetch unfiltered data for this district to populate the year and severity dropdowns
  useEffect(() => {
    if (!districtName) return;
    let active = true;
    fetchGujaratDashboardData(defaultDistrictFilters, districtName)
      .then((res) => {
        if (active) setAllData(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [districtName]);

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
    visualization_type: DISTRICT_VISUALIZATION_OPTIONS,
    visualization_variant: VISUALIZATION_VARIANT_OPTIONS,
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
    police_station: (filterOptions?.police_stations || []).map((p) => ({
      value: p,
      label: p,
    })), // NEW
    taluka: talukaOptions, // NEW
    date_from: [],
    date_to: [],
  };

  const activeFilterConfig =
    analysisView === "temporal" ? TEMPORAL_FILTERS : MAP_FILTERS;
  // const isDensityHeatmap = filters.visualization_type === "density_heatmap";
  const isBlackspotDetection = filters.visualization_type === "blackspot";
  const isPedestrianVariant = filters.visualization_variant === "pedestrian";
  const isPedestrianBlackspot = isBlackspotDetection && isPedestrianVariant;
  const isDbscanBlackspot = filters.visualization_type === "dbscan_blackspot";
  const isLocationMarkers =
    filters.visualization_type === "location_markers" ||
    !filters.visualization_type;
  const displayHeatmapData = isPedestrianVariant
    ? data.heatmap.filter(isPedestrianAccident)
    : data.heatmap;
  const isKdeHeatmap = filters.visualization_type === "kde_heatmap";
  const isWeightedKdeHeatmap =
    filters.visualization_type === "weighted_kde_heatmap";
  // const showDensityLegend = isDensityHeatmap || isKdeHeatmap || isWeightedKdeHeatmap;
  // const densityLegendTitle = isWeightedKdeHeatmap
  //   ? "Severity-Weighted KDE"
  //   : isKdeHeatmap
  //     ? "KDE Density"
  //     : "Accident Density";
  const visualizationLayerType =
    isLocationMarkers && isPedestrianVariant
      ? "pedestrian_accidents"
      : filters.visualization_type || "location_markers";

  // const overlaySubtitle = useMemo(() => {
  //   const parts: string[] = [districtName || "District"];
  //   if (filters.year?.length) parts.push(filters.year.join(", "));
  //   if (filters.severity?.length) parts.push(filters.severity.join(", "));
  //   return parts.join(" · ");
  // }, [districtName, filters.year, filters.severity]);

  const renderFilter = (filter: FilterConfigItem) => {
    const variantLabel =
      VISUALIZATION_VARIANT_LABELS[filters.visualization_type || ""];

    if (filter.id === "visualization_variant" && !variantLabel) {
      return null;
    }

    const value = filters[filter.id] ?? [];
    const isMultiSelect =
      filter.id !== "baseMap" &&
      filter.id !== "visualization_type" &&
      filter.id !== "visualization_variant";
    const isDateFilter = filter.id === "date_from" || filter.id === "date_to";

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
          };
        }
        return { ...current, [filter.id]: nextValue };
      });
    };

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
          {filter.icon === "layers" && (
            <Layers size={12} className="text-[#1e3a8a]" />
          )}
          {filter.id === "visualization_variant" ? variantLabel : filter.label}
        </label>
        {isDateFilter ? (
          <DateFilterInput
            value={(value as string) || ""}
            min={minDate}
            max={maxDate}
            onCommit={(nextValue) => handleChange(nextValue)}
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
    <ExportProvider>
      <SpatialExportRegistrar
        analysisView={analysisView}
        isBlackspotDetection={isBlackspotDetection}
        isDbscanBlackspot={isDbscanBlackspot}
        filters={filters}
        districtName={districtName}
        mapRef={mapRef}
      />
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
              const MAP_FILTER_IDS = [
                "baseMap",
                "visualization_type",
                "visualization_variant",
              ];
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
                  {analysisView === "spatial" && mapFilters.length > 0 && (
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

            <div
              className="flex w-full flex-col overflow-hidden rounded-2xl border border-[#E4E8F4] bg-white shadow-xl"
              style={{ height: `calc(100vh - ${TOPBAR_HEIGHT_PX}px - 2rem)` }}
            >
              <DistrictAnalysisTabs
                activeView={analysisView}
                onViewChange={setAnalysisView}
                filters={filters}
                districtName={districtName}
              />
              <motion.div
                className={`min-h-0 w-full flex-1 ${
                  analysisView !== "spatial"
                    ? "overflow-y-auto"
                    : "overflow-hidden"
                }`}
                animate={{ opacity: loading ? 0.6 : 1 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
              >
                {analysisView === "statistical" ? (
                  <DistrictStatisticalAnalysis
                    filters={{
                      district: districtName,
                      year: filters.year,
                      startDate: filters.date_from,
                      endDate: filters.date_to,
                      severity: filters.severity,
                      taluka: filters.taluka,
                      policeStation: filters.police_station,
                      roadClassification: filters.road_classification,
                      weatherCondition: filters.weather_condition,
                      lightCondition: filters.light_condition,
                      collisionType: filters.collision_type,
                    }}
                  />
                ) : analysisView === "temporal" ? (
                  <TemporalAnalysis
                    filters={filters}
                    fetchFn={(f) =>
                      fetchGujaratTemporalAnalysis(f, districtName)
                    }
                  />
                ) : (
                  <div className="h-full w-full overflow-hidden relative">
                    <DistrictBaseMap
                      ref={mapRef}
                      height="100%"
                      sidebarOpen={sidebarOpen}
                      baseMap={filters.baseMap || DEFAULT_BASE_MAP}
                      boundary={boundary}
                      boundaryLoading={boundaryLoading}
                      boundaryError={boundaryError}
                      loadingLabel={`Loading ${districtName || "district"}…`}
                      overlays={undefined}
                    >
                      {isPedestrianBlackspot ? (
                        <BlackspotDetectionLayers
                          key="pedestrian-blackspot"
                          filters={filters}
                          fetchFn={(f) =>
                            fetchGujaratPedestrianBlackspots(f, districtName)
                          }
                          exportFn={exportGujaratBlackspotCrashes}
                          heatmapData={data.heatmap.filter(
                            isPedestrianAccident
                          )}
                          analysisLabel="pedestrian greedy blackspot detection"
                          crashLabel="pedestrian crashes"
                        />
                      ) : isBlackspotDetection ? (
                        <BlackspotDetectionLayers
                          key="blackspot"
                          filters={filters}
                          fetchFn={(f) =>
                            fetchGujaratBlackspots(f, districtName)
                          }
                          exportFn={exportGujaratBlackspotCrashes}
                          heatmapData={data.heatmap}
                        />
                      ) : isDbscanBlackspot ? (
                        <DbscanBlackspotDetectionLayers
                          filters={filters}
                          heatmapData={data.heatmap}
                          fetchFn={(f) =>
                            fetchGujaratDbscanBlackspots(f, districtName)
                          }
                          exportFn={exportGujaratBlackspotCrashes}
                        />
                      ) : isKdeHeatmap ? (
                        <KdeHeatmapLayers
                          key={`kde-heatmap-${filters.visualization_variant || "accident"}`}
                          filters={filters}
                          accidentPoints={displayHeatmapData}
                          fetchFn={(f) =>
                            fetchGujaratKdeHeatmap(f, districtName)
                          }
                        />
                      ) : isWeightedKdeHeatmap ? (
                        <WeightedKdeHeatmapLayers
                          key="weighted-kde-heatmap"
                          filters={filters}
                          accidentPoints={displayHeatmapData}
                          fetchFn={(f) =>
                            fetchGujaratWeightedKdeHeatmap(f, districtName)
                          }
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
                    </DistrictBaseMap>
                    {!loading &&
                      !error &&
                      !boundaryLoading &&
                      data.summary.total_accidents === 0 &&
                      !filters.taluka?.length &&
                      !filters.police_station?.length &&
                      !filters.severity?.length &&
                      !filters.year?.length &&
                      !filters.road_classification?.length &&
                      !filters.weather_condition?.length &&
                      !filters.light_condition?.length &&
                      !filters.collision_type?.length &&
                      !filters.date_from &&
                      !filters.date_to && (
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
                                recorded accident records in the system yet. Try
                                a district with available data, such as Surat or
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
            </div>
          </div>
        </main>
      </div>
    </ExportProvider>
  );
}
