/**
 * @file AccidentManagement.tsx
 * @description Enterprise-grade data management table for accident records.
 * @responsibility Provides a comprehensive data table with column visibility toggling, advanced column-specific filtering, global search, pagination, and bulk actions (edit/delete).
 * @dependencies framer-motion, lucide-react, react
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  AlertCircle,
  FileSpreadsheet,
  Columns3,
  X,
  Filter,
  ChevronDown,
  Layers,
  HelpCircle,
  Tags,
  Check,
  CheckSquare,
  CheckCheck,
} from "lucide-react";
import {
  adminAccidentsApi,
  type AccidentRecord,
  type AccidentFilters,
  type AccidentFilterOptions,
} from "../../api/adminAccidentsApi";
import AccidentFormModal from "../../components/admin/AccidentFormModal";
import ConfirmDialog from "../../components/common/ConfirmDialog";

// ── Column definitions (order matches database model) ──────────────────────

interface ColumnDef {
  key: string;
  label: string;
  group: string;
  defaultVisible: boolean;
  width: number; // min-width in px
  filterable?: boolean; // if the column supports backend ilike filter
  type?: "text" | "number" | "datetime" | "severity";
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: "status", label: "Status", group: "Identification", defaultVisible: true, width: 155, filterable: false, type: "text" },
  { key: "accident_id", label: "Accident ID", group: "Identification", defaultVisible: true, width: 180, filterable: false, type: "text" },
  { key: "district", label: "District", group: "Identification", defaultVisible: true, width: 120, filterable: true, type: "text" },
  { key: "police_station", label: "Police Station", group: "Identification", defaultVisible: true, width: 160, filterable: true, type: "text" },
  { key: "accident_date_time", label: "Date & Time", group: "Identification", defaultVisible: true, width: 170, filterable: false, type: "datetime" },
  { key: "latitude", label: "Latitude", group: "Location", defaultVisible: false, width: 110, type: "number" },
  { key: "longitude", label: "Longitude", group: "Location", defaultVisible: false, width: 110, type: "number" },
  { key: "road_name", label: "Road Name", group: "Location", defaultVisible: true, width: 180, filterable: true, type: "text" },
  { key: "road_classification", label: "Road Classification", group: "Location", defaultVisible: false, width: 160, filterable: true, type: "text" },
  { key: "accident_location", label: "Accident Location", group: "Location", defaultVisible: false, width: 180, filterable: false, type: "text" },
  { key: "landmark_name", label: "Landmark Name", group: "Location", defaultVisible: false, width: 160, filterable: false, type: "text" },
  { key: "severity", label: "Severity", group: "Characteristics", defaultVisible: true, width: 130, filterable: true, type: "severity" },
  { key: "number_of_vehicles", label: "Vehicles", group: "Characteristics", defaultVisible: true, width: 90, type: "number" },
  { key: "driver_killed", label: "Driver Killed", group: "Driver Casualties", defaultVisible: false, width: 110, type: "number" },
  { key: "driver_grievous_injury", label: "Driver Grievous", group: "Driver Casualties", defaultVisible: false, width: 130, type: "number" },
  { key: "driver_minor_injury", label: "Driver Minor", group: "Driver Casualties", defaultVisible: false, width: 110, type: "number" },
  { key: "passenger_killed", label: "Passenger Killed", group: "Passenger Casualties", defaultVisible: false, width: 140, type: "number" },
  { key: "passenger_grievous_injury", label: "Passenger Grievous", group: "Passenger Casualties", defaultVisible: false, width: 150, type: "number" },
  { key: "passenger_minor_injury", label: "Passenger Minor", group: "Passenger Casualties", defaultVisible: false, width: 130, type: "number" },
  { key: "pedestrian_killed", label: "Pedestrian Killed", group: "Pedestrian Casualties", defaultVisible: false, width: 140, type: "number" },
  { key: "pedestrian_grievous_injury", label: "Pedestrian Grievous", group: "Pedestrian Casualties", defaultVisible: false, width: 150, type: "number" },
  { key: "pedestrian_minor_injury", label: "Pedestrian Minor", group: "Pedestrian Casualties", defaultVisible: false, width: 130, type: "number" },
  { key: "type_of_collision", label: "Collision Type", group: "Collision", defaultVisible: false, width: 150, filterable: true, type: "text" },
  { key: "collision_feature", label: "Collision Feature", group: "Collision", defaultVisible: false, width: 160, filterable: true, type: "text" },
  { key: "weather_condition", label: "Weather", group: "Environment", defaultVisible: false, width: 130, filterable: true, type: "text" },
  { key: "light_condition", label: "Light Condition", group: "Environment", defaultVisible: false, width: 200, filterable: true, type: "text" },
  { key: "visibility", label: "Visibility", group: "Environment", defaultVisible: false, width: 110, filterable: true, type: "text" },
  { key: "traffic_violation", label: "Traffic Violation", group: "Violation", defaultVisible: false, width: 160, filterable: true, type: "text" },
  { key: "accident_description", label: "Accident Description", group: "Miscellaneous", defaultVisible: false, width: 260, filterable: false, type: "text" },
];

const SEVERITY_STYLES: Record<string, string> = {
  Fatal: "bg-rose-100 text-rose-700",
  "Grievous Injury": "bg-orange-100 text-orange-700",
  "Minor Injury": "bg-amber-100 text-amber-700",
  "Damage Only": "bg-slate-100 text-slate-600",
};

const TEXT_FILTER_KEYS = new Set([
  "road_name",
  "road_classification",
  "collision_feature",
  "traffic_violation",
]);

const FILTER_OPTION_KEY: Partial<
  Record<keyof AccidentFilters, keyof AccidentFilterOptions>
> = {
  district: "districts",
  police_station: "police_stations",
  severity: "severities",
  type_of_collision: "collision_types",
  weather_condition: "weather_conditions",
  light_condition: "light_conditions",
  visibility: "visibilities",
};

/**
 * Returns a short badge label for an invalidation reason.
 * The full reason is shown in the tooltip.
 */
function getShortReason(reason: string | null | undefined): string {
  if (!reason) return "Review";
  const r = reason.toLowerCase();
  if (r.includes("duplicate")) return "Duplicate";
  if (r.includes("outside gujarat") || r.includes("outside state")) return "Outside State";
  if (r.includes("district mismatch")) return "District Mismatch";
  if (r.includes("invalid coord")) return "Invalid Coords";
  // For any other reason, truncate at 20 chars
  return reason.length > 20 ? reason.slice(0, 18) + "…" : reason;
}

/**
 * Detects and returns names of columns that contain multiple categories.
 */
function getMultiCategoryColumns(acc: AccidentRecord): string[] {
  if (acc.multi_category_columns && acc.multi_category_columns.length > 0) {
    return acc.multi_category_columns;
  }
  const cols: string[] = [];
  const check = (val: string | null | undefined, name: string) => {
    if (val && val.includes(",")) cols.push(name);
  };
  check(acc.type_of_collision, "Collision Type");
  check(acc.collision_feature, "Collision Feature");
  check(acc.weather_condition, "Weather Condition");
  check(acc.traffic_violation, "Traffic Violation");
  return cols;
}

const BLANK_COLUMNS_CONFIG: { key: keyof AccidentRecord; label: string }[] = [
  { key: "police_station", label: "Police Station" },
  { key: "accident_date_time", label: "Date & Time" },
  { key: "road_name", label: "Road Name" },
  { key: "road_classification", label: "Road Classification" },
  { key: "landmark_name", label: "Landmark Name" },
  { key: "type_of_collision", label: "Collision Type" },
  { key: "collision_feature", label: "Collision Nature" },
  { key: "weather_condition", label: "Weather" },
  { key: "light_condition", label: "Light Condition" },
  { key: "visibility", label: "Visibility" },
  { key: "traffic_violation", label: "Traffic Violation" },
];

function isBlankField(val: any): boolean {
  if (val === null || val === undefined) return true;
  if (Array.isArray(val)) {
    const cleaned = val.filter(
      (x) => x !== null && x !== undefined && String(x).trim() !== "" && String(x).trim() !== "-"
    );
    return cleaned.length === 0;
  }
  const s = String(val).trim();
  return s === "" || s === "-" || s.toLowerCase() === "nan" || s.toLowerCase() === "null";
}

function getBlankColumns(acc: AccidentRecord): string[] {
  if (acc.blank_columns && acc.blank_columns.length > 0) {
    return acc.blank_columns;
  }
  return BLANK_COLUMNS_CONFIG
    .filter((col) => isBlankField(acc[col.key]))
    .map((col) => col.label);
}

interface StatusBadgeInfo {
  label: string;
  tooltip: string;
  isAttention: boolean;
  type: "valid" | "multi_category" | "blank_fields" | "multi_status" | "attention";
}

function getRecordStatusInfo(acc: AccidentRecord): StatusBadgeInfo {
  const activeStatuses: { title: string; detail?: string; isAttention: boolean }[] = [];

  // 1. Attention / Invalidation reasons
  if (acc.requires_attention) {
    activeStatuses.push({
      title: getShortReason(acc.invalidation_reasons),
      detail: acc.invalidation_reasons || "Requires Review",
      isAttention: true,
    });
  }

  // 2. Multiple categories
  const multiCols = getMultiCategoryColumns(acc);
  if (multiCols.length > 0) {
    activeStatuses.push({
      title: "Multi Category",
      detail: `Multiple categories in: ${multiCols.join(", ")}`,
      isAttention: false,
    });
  }

  // 3. Blank fields in specified 11 columns
  const blankCols = getBlankColumns(acc);
  if (blankCols.length > 0) {
    activeStatuses.push({
      title: "Blank Fields",
      detail: `Blank in: ${blankCols.join(", ")}`,
      isAttention: false,
    });
  }

  if (activeStatuses.length === 0) {
    return {
      label: "Valid",
      tooltip: "Valid record (included in visualizations)",
      isAttention: false,
      type: "valid",
    };
  }

  if (activeStatuses.length === 1) {
    const s = activeStatuses[0];
    let type: StatusBadgeInfo["type"] = "attention";
    if (s.title === "Multi Category") type = "multi_category";
    else if (s.title === "Blank Fields") type = "blank_fields";

    return {
      label: s.title,
      tooltip: s.detail || s.title,
      isAttention: s.isAttention,
      type,
    };
  }

  // Multiple statuses active
  const hasAttention = activeStatuses.some((s) => s.isAttention);
  const tooltipDetails = activeStatuses
    .map((s) => (s.detail ? s.detail : s.title))
    .join(" • ");

  return {
    label: "Multi Status",
    tooltip: `Multiple statuses active: ${tooltipDetails}`,
    isAttention: hasAttention,
    type: "multi_status",
  };
}

/**
 * AccidentManagement Component
 * @component_responsibility Manages the state and rendering of the primary accident data table, including fetching data, filtering, column visibility, and row selection.
 * @state_management Uses complex local state for pagination, debounced search, active filters, selected rows, and visible columns.
 * @hooks_usage Uses `useEffect` for data loading and debouncing, and `useCallback` to memoize the data fetch routine.
 * @returns {JSX.Element} The rendered data table and toolbars.
 */
export default function AccidentManagement() {
  const [accidents, setAccidents] = useState<AccidentRecord[]>([]);
  const [activeFilterCount, setActiveFilterCount] = useState(0);

  // Status Filter for requires_attention, blanks & category cardinality
  const [statusFilter, setStatusFilter] = useState<
    "all" | "valid" | "multiple_categories" | "blank_fields" | "multi_status" | "duplicate" | "district_mismatch" | "outside_state"
  >("all");

  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [skip, setSkip] = useState(0);
  const [limit] = useState(50);

  // Search & Filters
  const [globalSearch, setGlobalSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<AccidentFilters>({});
  const [filterOptions, setFilterOptions] = useState<AccidentFilterOptions>({
    severities: [],
    police_stations: [],
    districts: [],
    road_names: [],
    collision_types: [],
    collision_features: [],
    weather_conditions: [],
    light_conditions: [],
    visibilities: [],
  });
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    const s = new Set<string>();
    ALL_COLUMNS.forEach((c) => {
      if (c.defaultVisible) s.add(c.key);
    });
    return s;
  });
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const columnMenuRef = useRef<HTMLDivElement>(null);

  // Modals & selection
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [selectedAccident, setSelectedAccident] = useState<AccidentRecord | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<number[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const [selectionMenuOpen, setSelectionMenuOpen] = useState(false);
  const selectionMenuRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Debounce global search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(globalSearch);
      setSkip(0);
    }, 400);
    return () => clearTimeout(handler);
  }, [globalSearch]);

  // Close menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) {
        setColumnMenuOpen(false);
      }
      if (selectionMenuRef.current && !selectionMenuRef.current.contains(e.target as Node)) {
        setSelectionMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    const count = Object.values(columnFilters).filter((val) => val && val.trim() !== "").length + (statusFilter !== "all" ? 1 : 0);
    setActiveFilterCount(count);

    let recordStatusQuery: string | undefined = undefined;
    if (statusFilter !== "all") {
      recordStatusQuery = statusFilter;
    }

    try {
      const res = await adminAccidentsApi.getAccidents(skip, limit, debouncedSearch, { ...columnFilters, record_status: recordStatusQuery });
      setAccidents(res.data);
      setTotal(res.total);
    } catch {
      setError("Failed to load accident records.");
    } finally {
      setLoading(false);
    }
  }, [skip, limit, debouncedSearch, columnFilters, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [debouncedSearch, columnFilters, statusFilter]);

  useEffect(() => {
    adminAccidentsApi.getFilterOptions().then(setFilterOptions).catch(() => {
      // Text filters remain available when option loading fails.
    });
  }, []);

  const handleEdit = (record: AccidentRecord) => {
    setSelectedAccident(record);
    setFormModalOpen(true);
  };

  const handleDeleteRequest = (ids: number[]) => {
    setPendingDeleteIds(ids);
    setConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (pendingDeleteIds.length === 0) return;
    try {
      if (pendingDeleteIds.length === 1) {
        await adminAccidentsApi.deleteAccident(pendingDeleteIds[0]);
      } else {
        await adminAccidentsApi.bulkDeleteAccidents(pendingDeleteIds);
      }
      setSelectedIds(new Set());
      loadData();
    } catch {
      alert("Failed to delete record(s).");
    } finally {
      setConfirmOpen(false);
      setPendingDeleteIds([]);
    }
  };

  const pageIds = accidents.map((acc) => acc.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id));
  const selectedOnPageCount = pageIds.filter((id) => selectedIds.has(id)).length;
  const selectedOnOtherPages = selectedIds.size - selectedOnPageCount;
  const isAllMatchingSelected = total > 0 && selectedIds.size >= total;

  useEffect(() => {
    if (selectAllRef.current) {
      if (isAllMatchingSelected) {
        selectAllRef.current.indeterminate = false;
      } else {
        selectAllRef.current.indeterminate =
          (somePageSelected && !allPageSelected) ||
          (selectedIds.size > 0 && !allPageSelected);
      }
    }
  }, [somePageSelected, allPageSelected, isAllMatchingSelected, selectedIds.size]);

  const handleSelectAllMatching = async () => {
    if (total === 0) return;
    setIsSelectingAll(true);
    try {
      let recordStatusQuery: string | undefined = undefined;
      if (statusFilter !== "all") {
        recordStatusQuery = statusFilter;
      }
      const res = await adminAccidentsApi.getAccidentIds(debouncedSearch, {
        ...columnFilters,
        record_status: recordStatusQuery,
      });
      setSelectedIds(new Set(res.ids));
    } catch {
      alert("Failed to select all records.");
    } finally {
      setIsSelectingAll(false);
    }
  };

  const toggleSelectAll = () => {
    if (isAllMatchingSelected) {
      setSelectedIds(new Set());
    } else if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const toggleSelectRow = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleFormSuccess = () => {
    setFormModalOpen(false);
    loadData();
  };

  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const showAllColumns = () => {
    setVisibleColumns(new Set(ALL_COLUMNS.map((c) => c.key)));
  };

  const resetColumns = () => {
    const s = new Set<string>();
    ALL_COLUMNS.forEach((c) => {
      if (c.defaultVisible) s.add(c.key);
    });
    setVisibleColumns(s);
  };

  const updateFilter = (key: string, value: string) => {
    setColumnFilters((prev) => ({ ...prev, [key]: value }));
    setSkip(0);
  };

  const clearFilters = () => {
    setColumnFilters({});
    setStatusFilter("all");
    setSkip(0);
  };

  const visibleCols = ALL_COLUMNS.filter((c) => visibleColumns.has(c.key));
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(skip / limit) + 1;

  const [pageInput, setPageInput] = useState<string>(String(currentPage));

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const handlePageInputCommit = () => {
    const pageNum = parseInt(pageInput, 10);
    if (isNaN(pageNum) || pageNum < 1) {
      setPageInput(String(currentPage));
      return;
    }
    const maxPage = Math.max(1, totalPages);
    const targetPage = Math.min(Math.max(1, pageNum), maxPage);
    setPageInput(String(targetPage));
    setSkip((targetPage - 1) * limit);
  };

  const formatCellValue = (col: ColumnDef, value: any): React.ReactNode => {
    if (value === null || value === undefined || value === "") return <span className="text-slate-300">—</span>;

    if (col.type === "datetime") {
      try {
        return new Date(value).toLocaleString(undefined, {
          year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        });
      } catch { return String(value); }
    }

    if (col.type === "severity") {
      const style = SEVERITY_STYLES[value] || "bg-slate-100 text-slate-600";
      return (
        <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold ${style}`}>
          {value}
        </span>
      );
    }

    return String(value);
  };

  // Group columns for the visibility menu
  const columnGroups = ALL_COLUMNS.reduce<Record<string, ColumnDef[]>>((acc, col) => {
    if (!acc[col.group]) acc[col.group] = [];
    acc[col.group].push(col);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="p-3 border-b border-slate-200 bg-slate-50/80 flex flex-col gap-2">
        {/* Row 1: Search + Column Toggle + Filter Toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Global search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search across ID, District, Station, Road..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
            />
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setFilterPanelOpen(!filterPanelOpen)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
              filterPanelOpen || activeFilterCount > 0
                ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Column visibility */}
          <div className="relative" ref={columnMenuRef}>
            <button
              onClick={() => setColumnMenuOpen(!columnMenuOpen)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
            >
              <Columns3 className="w-4 h-4" />
              Columns
              <span className="text-xs text-slate-400">
                ({visibleColumns.size}/{ALL_COLUMNS.length})
              </span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            <AnimatePresence>
              {columnMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl border border-slate-200 shadow-xl z-30 max-h-80 overflow-y-auto"
                >
                  <div className="p-2 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Toggle Columns</span>
                    <div className="flex gap-1">
                      <button onClick={showAllColumns} className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium">
                        All
                      </button>
                      <button onClick={resetColumns} className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium">
                        Default
                      </button>
                    </div>
                  </div>
                  <div className="p-2 space-y-2">
                    {Object.entries(columnGroups).map(([group, cols]) => (
                      <div key={group}>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 px-1">{group}</p>
                        {cols.map((col) => (
                          <label
                            key={col.key}
                            className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={visibleColumns.has(col.key)}
                              onChange={() => toggleColumn(col.key)}
                              className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20"
                            />
                            <span className="text-xs text-slate-700">{col.label}</span>
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Row 2: Column filters (collapsible) */}
        <AnimatePresence>
          {filterPanelOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-start gap-2 flex-wrap pt-1 pb-1">
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Record Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="w-40 px-2 py-1.5 bg-white border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-400"
                  >
                    <option value="all">All Records</option>
                    <option value="valid">Valid Records</option>
                    <option value="multiple_categories">Multiple Categories</option>
                    <option value="blank_fields">Blank Fields</option>
                    <option value="multi_status">Multi Status</option>
                    <option value="duplicate">Duplicate</option>
                    <option value="district_mismatch">District Mismatch</option>
                    <option value="outside_state">Outside State</option>
                  </select>
                </div>
                {ALL_COLUMNS.filter((c) => c.filterable).map((col) => {
                  const filterKey = col.key as keyof AccidentFilters;
                  const filterValue = columnFilters[filterKey] || "";
                  const optionKey = FILTER_OPTION_KEY[filterKey];
                  const options = optionKey ? filterOptions[optionKey] : [];

                  return (
                    <div key={col.key} className="flex flex-col gap-0.5">
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{col.label}</label>
                      {TEXT_FILTER_KEYS.has(col.key) ? (
                        <input
                          type="text"
                          placeholder={`Filter ${col.label.toLowerCase()}...`}
                          value={typeof filterValue === "string" ? filterValue : ""}
                          onChange={(e) => updateFilter(col.key, e.target.value)}
                          className="w-32 px-2 py-1.5 bg-white border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-400"
                        />
                      ) : (
                        <select
                          value={typeof filterValue === "string" ? filterValue : ""}
                          onChange={(e) => updateFilter(col.key, e.target.value)}
                          className="w-40 max-w-[12rem] px-2 py-1.5 bg-white border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-400 truncate"
                        >
                          <option value="">All {col.label.toLowerCase()}s</option>
                          {options.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="self-end flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Clear all
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between gap-3 flex-wrap px-3 py-2 bg-indigo-50/90 border border-indigo-200 rounded-xl shadow-xs">
            <div className="flex items-center gap-2.5 flex-wrap text-xs">
              <span className="font-bold text-indigo-900">
                {isAllMatchingSelected ? (
                  <span className="inline-flex items-center gap-1.5 text-indigo-950 font-bold">
                    <CheckCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                    All {total.toLocaleString()} {activeFilterCount > 0 || debouncedSearch ? "filtered " : ""}records selected
                  </span>
                ) : (
                  <span>
                    <span className="text-indigo-950">{selectedIds.size.toLocaleString()} selected</span>
                    {selectedOnOtherPages > 0 ? (
                      <span className="font-normal text-indigo-600 ml-1">
                        ({selectedOnPageCount} on this page, {selectedOnOtherPages.toLocaleString()} on other pages)
                      </span>
                    ) : (
                      selectedOnPageCount === pageIds.length && total > pageIds.length && (
                        <span className="font-normal text-indigo-600 ml-1">
                          (all {pageIds.length} on this page)
                        </span>
                      )
                    )}
                  </span>
                )}
              </span>

              {/* One-click button to select all records across all pages */}
              {!isAllMatchingSelected && total > selectedIds.size && (
                <button
                  type="button"
                  onClick={handleSelectAllMatching}
                  disabled={isSelectingAll}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold text-indigo-700 bg-white hover:bg-indigo-100/70 border border-indigo-300 shadow-xs hover:text-indigo-900 transition-all cursor-pointer"
                >
                  {isSelectingAll ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  ) : (
                    <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                  )}
                  Select all {total.toLocaleString()} {activeFilterCount > 0 || debouncedSearch ? "filtered " : ""}records
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDeleteRequest(Array.from(selectedIds))}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-xs transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete selected ({selectedIds.size.toLocaleString()})
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-indigo-100/60 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Clear selection
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Error State ── */}
      {error && (
        <div className="m-3 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-700">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
          <button onClick={loadData} className="ml-auto text-sm font-semibold underline hover:text-rose-800">
            Retry
          </button>
        </div>
      )}

      {/* ── Data Table ── */}
      <div className="flex-1 overflow-auto relative bg-white">
        {loading && (
          <div className="absolute inset-0 z-10 bg-white/50 backdrop-blur-sm flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
        )}

        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="bg-slate-100/80 text-slate-600 font-semibold uppercase text-[11px] tracking-wider sticky top-0 z-20">
            <tr>
              <th className="py-2.5 px-3 border-b border-slate-200 w-14 sticky left-0 bg-slate-100/90 z-30">
                <div className="relative inline-flex items-center gap-0.5" ref={selectionMenuRef}>
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={isAllMatchingSelected || allPageSelected}
                    onChange={toggleSelectAll}
                    disabled={accidents.length === 0}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 cursor-pointer"
                    title={
                      isAllMatchingSelected
                        ? "All matching records selected (click to clear)"
                        : allPageSelected
                        ? "All on page selected (click to deselect page)"
                        : "Select all on this page"
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setSelectionMenuOpen(!selectionMenuOpen)}
                    className="p-0.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200 transition-colors cursor-pointer"
                    title="Selection options"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>

                  {selectionMenuOpen && (
                    <div className="absolute left-0 top-full mt-1 w-52 bg-white rounded-lg border border-slate-200 shadow-xl z-40 p-1 text-xs normal-case tracking-normal">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            pageIds.forEach((id) => next.add(id));
                            return next;
                          });
                          setSelectionMenuOpen(false);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 flex items-center justify-between font-medium cursor-pointer"
                      >
                        <span>Select this page</span>
                        <span className="text-[11px] text-slate-400">({pageIds.length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          handleSelectAllMatching();
                          setSelectionMenuOpen(false);
                        }}
                        disabled={isSelectingAll || total === 0}
                        className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 flex items-center justify-between font-medium cursor-pointer"
                      >
                        <span>Select all matching</span>
                        <span className="text-[11px] text-indigo-600 font-semibold">({total.toLocaleString()})</span>
                      </button>

                      {selectedIds.size > 0 && (
                        <>
                          <div className="my-1 border-t border-slate-100" />
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedIds(new Set());
                              setSelectionMenuOpen(false);
                            }}
                            className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-rose-50 text-rose-600 font-medium cursor-pointer"
                          >
                            Clear selection
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </th>
              {visibleCols.map((col) => (
                <th
                  key={col.key}
                  className="py-2.5 px-3 border-b border-slate-200"
                  style={{ minWidth: col.width }}
                >
                  {col.label}
                </th>
              ))}
              <th className="py-2.5 px-3 border-b border-slate-200 text-right sticky right-0 bg-slate-100/90 shadow-[-4px_0_12px_rgba(0,0,0,0.03)]" style={{ minWidth: 80 }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {accidents.length === 0 && !loading && !error && (
              <tr>
                <td colSpan={visibleCols.length + 2} className="py-16 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center">
                    <FileSpreadsheet className="w-12 h-12 text-slate-200 mb-3" />
                    <p className="font-medium text-slate-600">No records found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Try adjusting your search or filters.
                    </p>
                  </div>
                </td>
              </tr>
            )}
            {accidents.map((acc) => (
              <tr
                key={acc.id}
                className={`transition-colors group ${
                  selectedIds.has(acc.id)
                    ? "bg-indigo-50/70 hover:bg-indigo-50"
                    : "hover:bg-indigo-50/40"
                }`}
              >
                <td
                  className={`py-2 px-3 sticky left-0 transition-colors ${
                    selectedIds.has(acc.id)
                      ? "bg-indigo-50/70"
                      : "bg-white group-hover:bg-indigo-50/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(acc.id)}
                    onChange={() => toggleSelectRow(acc.id)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20"
                    aria-label={`Select accident ${acc.accident_id}`}
                  />
                </td>
                {visibleCols.map((col) => (
                  <td
                    key={col.key}
                    className={`py-2 px-3 text-slate-600 ${
                      col.key === "accident_id" ? "font-medium text-slate-800" : ""
                    }`}
                    style={{ minWidth: col.width, maxWidth: col.width + 60 }}
                    title={String((acc as any)[col.key] ?? "")}
                  >
                    <div className="truncate flex items-center gap-2">
                      {col.key === "status" ? (() => {
                        const info = getRecordStatusInfo(acc);
                        if (info.isAttention) {
                          return (
                            <div
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-200 shadow-sm cursor-help w-full"
                              title={info.tooltip}
                            >
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              <span className="truncate">{info.label}</span>
                            </div>
                          );
                        }

                        // Valid records (used in visualization) styled in green
                        let Icon = Check;
                        if (info.type === "multi_category") Icon = Layers;
                        else if (info.type === "blank_fields") Icon = HelpCircle;
                        else if (info.type === "multi_status") Icon = Tags;

                        return (
                          <div
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm ${
                              info.label !== "Valid" ? "cursor-help" : ""
                            } w-full`}
                            title={info.tooltip}
                          >
                            <Icon className="w-3 h-3 shrink-0 text-emerald-600" />
                            <span className="truncate">{info.label}</span>
                          </div>
                        );
                      })() : (
                        formatCellValue(col, (acc as any)[col.key])
                      )}
                    </div>
                  </td>
                ))}
                <td className="py-1.5 px-3 text-right sticky right-0 bg-white group-hover:bg-indigo-50/40 shadow-[-4px_0_12px_rgba(0,0,0,0.03)] transition-colors">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => handleEdit(acc)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Edit Record"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteRequest([acc.id])}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Delete Record"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination Footer ── */}
      <div className="p-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 text-sm text-slate-600">
        <div className="text-xs">
          <span className="font-bold text-slate-800">{Math.min(skip + 1, total)}</span>
          –
          <span className="font-bold text-slate-800">{Math.min(skip + limit, total)}</span>
          {" "}of{" "}
          <span className="font-bold text-slate-800">{total.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setSkip(0)}
              disabled={skip === 0}
              title="First page"
              className="p-1.5 rounded-md hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent text-slate-600 transition-colors cursor-pointer"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => skip >= limit && setSkip(skip - limit)}
              disabled={skip === 0}
              title="Previous page"
              className="p-1.5 rounded-md hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent text-slate-600 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
            <span>Page</span>
            <input
              type="number"
              min={1}
              max={Math.max(1, totalPages)}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handlePageInputCommit();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              onBlur={handlePageInputCommit}
              aria-label="Direct page number input"
              title="Type a page number and press Enter"
              className="w-12 px-1.5 py-1 text-center bg-white border border-slate-300 rounded-md text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-slate-500">of {Math.max(1, totalPages)}</span>
          </div>

          <div className="flex items-center gap-0.5">
            <button
              onClick={() => skip + limit < total && setSkip(skip + limit)}
              disabled={skip + limit >= total}
              title="Next page"
              className="p-1.5 rounded-md hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent text-slate-600 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSkip((Math.max(1, totalPages) - 1) * limit)}
              disabled={skip + limit >= total}
              title="Last page"
              className="p-1.5 rounded-md hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent text-slate-600 transition-colors cursor-pointer"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      <AccidentFormModal
        open={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        onSuccess={handleFormSuccess}
        initialData={selectedAccident}
      />

      <ConfirmDialog
        open={confirmOpen}
        title={pendingDeleteIds.length > 1 ? "Delete Accident Records" : "Delete Accident Record"}
        message={
          pendingDeleteIds.length > 1
            ? `Are you sure you want to permanently delete ${pendingDeleteIds.length} accident records? This action cannot be undone.`
            : "Are you sure you want to permanently delete this accident record? This action cannot be undone."
        }
        confirmText={pendingDeleteIds.length > 1 ? `Delete ${pendingDeleteIds.length}` : "Delete"}
        cancelText="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setConfirmOpen(false);
          setPendingDeleteIds([]);
        }}
        danger={true}
      />
    </div>
  );
}
