/**
 * @file DistrictInsightsContext.tsx
 * @description React context for managing statewide and district-level summary insights.
 * @responsibility Fetches, caches, and provides access to aggregated insights (accident counts, fatalities, etc.) used primarily by tooltip cards on the statewide map.
 * @dependencies react (Context API), gujaratDashboardApi
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  fetchDistrictInsights,
  fetchGujaratOverviewInsights,
  type DistrictInsight,
  type GujaratWideSummary,
} from "../api/gujaratDashboardApi";

/**
 * Context interface defining the state and methods for accessing district insights.
 */
interface Ctx {
  /** True when the initial statewide overview payload is loading (blocks initial paint). */
  gujaratLoading: boolean;
  /** Becomes true once all district-level hover data is available. */
  districtsReady: boolean;
  /** True if the district-level data fetch failed. */
  districtsError: boolean;
  /** Error message string, if an error occurred during statewide fetching. */
  error: string | null;
  /** Cached statewide aggregated data. */
  gujarat: GujaratWideSummary | null;
  /** Name of the currently hovered district (used to sync hover state across UI components). */
  hoveredDistrict: string | null;
  /** Sets the currently hovered district. */
  setHoveredDistrict: (name: string | null) => void;
  /** 
   * Determines the data availability status for a specific district.
   * @param name The district name
   * @returns "found" (has data), "empty" (loaded but zero accidents), "pending" (still loading), or "unavailable" (fetch error)
   */
  getDistrictStatus: (name: string) => "found" | "empty" | "pending" | "unavailable";
  /** 
   * Retrieves specific insight data for a named district.
   * @param name The district name
   * @returns District data or undefined if not found.
   */
  getDistrict: (name: string) => DistrictInsight | undefined;
}

const DistrictInsightsContext = createContext<Ctx | undefined>(undefined);
const normalize = (name: string) => name.trim().toLowerCase();

/**
 * DistrictInsightsProvider Component
 * @component_responsibility Wrapper component that initiates parallel fetching of statewide overviews and detailed district records, managing their respective loading and error states.
 * @state_management Manages dictionaries of `DistrictInsight` objects mapped by district name.
 * @hooks_usage Uses `useEffect` for data fetching on mount. Uses `useMemo` to build O(1) lookup maps and stabilize the Context value to prevent unnecessary re-renders.
 */
export function DistrictInsightsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [gujarat, setGujarat] = useState<GujaratWideSummary | null>(null);
  const [gujaratLoading, setGujaratLoading] = useState(true);
  const [districts, setDistricts] = useState<Record<
    string,
    DistrictInsight
  > | null>(null);
  const [districtsReady, setDistrictsReady] = useState(false);
  const [districtsError, setDistrictsError] = useState(false); // ← new
  const [error, setError] = useState<string | null>(null);
  const [hoveredDistrict, setHoveredDistrict] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchGujaratOverviewInsights()
      .then((res) => {
        if (!active) return;
        setGujarat({
          total_accidents: res.summary.total_accidents,
          total_fatalities: res.summary.total_fatalities,
          total_grievous: res.summary.total_grievous,
          total_minor: res.summary.total_minor,
          districts_covered: res.summary.districts_covered,
          police_stations: res.summary.police_stations,
          severity: res.severity.map((s) => ({
            label: s.severity,
            count: s.count,
          })),
          dangerous: res.dangerous.map((d) => ({
            district: d.district,
            fatal_accidents: d.fatal_accidents,
            total_killed: d.total_killed,
          })),
        });
      })
      .catch(
        (err) =>
          active && setError(err?.message || "Failed to load Gujarat overview.")
      )
      .finally(() => active && setGujaratLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetchDistrictInsights()
      .then((res) => {
        if (!active) return;
        setDistricts(res.districts);
        setGujarat(res.gujarat);
      })
      .catch((err) => {
        // Surface it — this must never be silently swallowed again.
        console.error("Failed to load /district-insights:", err);
        if (active) setDistrictsError(true);
      })
      .finally(() => active && setDistrictsReady(true));
    return () => {
      active = false;
    };
  }, []);

  const lookup = useMemo(() => {
    const map = new Map<string, DistrictInsight>();
    if (!districts) return map;

    const normalizeDistrictName = (rawName: string) => {
      let name = rawName.trim().toLowerCase();
      name = name.replace(/\s+city$/, "").replace(/\s+rural$/, "").replace(/^wrly\s+/, "");
      if (name.includes("vav tharad") || name.includes("banaskantha")) return "banas kantha";
      if (name.includes("vadodara")) return "vadodara";
      if (name.includes("ahmedabad")) return "ahmadabad";
      if (name.includes("surat")) return "surat";
      if (name.includes("rajkot")) return "rajkot";
      if (name.includes("kachchh") || name.includes("kutchh")) return "kachchh";
      if (name.includes("panchmahal")) return "panch mahals";
      if (name.includes("sabarkantha")) return "sabar kantha";
      if (name.includes("chotaudepur")) return "chhotaudepur";
      if (name.includes("devbhumi dwrka")) return "devbhumi dwarka";
      if (name.includes("mahisagar")) return "mahisagar";
      if (name.includes("bhavanagar")) return "bhavnagar";
      return name;
    };

    Object.values(districts).forEach((d) => {
      const rootName = normalizeDistrictName(d.district);
      if (!map.has(rootName)) {
        const clone = JSON.parse(JSON.stringify(d)) as DistrictInsight;
        clone.district = rootName.toUpperCase();
        map.set(rootName, clone);
      } else {
        const existing = map.get(rootName)!;
        existing.total_accidents += d.total_accidents;
        existing.fatal_accidents += d.fatal_accidents;
        existing.fatalities += d.fatalities;
        existing.grievous_injuries += d.grievous_injuries;
        existing.minor_injuries += d.minor_injuries;
        existing.police_stations += d.police_stations;
        existing.blackspots_count += d.blackspots_count;

        existing.fatality_rate = existing.total_accidents > 0
          ? Number(((existing.fatal_accidents / existing.total_accidents) * 100).toFixed(2))
          : 0;

        // Keep the strings of the sub-district with more total accidents
        if (d.total_accidents > existing.total_accidents - d.total_accidents) {
          existing.most_affected_police_station = d.most_affected_police_station;
          existing.highest_accident_month = d.highest_accident_month;
          existing.peak_accident_time = d.peak_accident_time;
          existing.risk_level = d.risk_level;
        }

        const mergeNamedCounts = (arr1: any[], arr2: any[], key = "label") => {
           arr2.forEach(item2 => {
              const item1 = arr1.find(i => i[key] === item2[key]);
              if (item1) item1.count += item2.count;
              else arr1.push({ ...item2 });
           });
        };

        mergeNamedCounts(existing.severity, d.severity, "label");
        mergeNamedCounts(existing.monthly_trend, d.monthly_trend, "month_label");
        mergeNamedCounts(existing.time_of_day, d.time_of_day, "label");
        mergeNamedCounts(existing.weekday, d.weekday, "label");
        mergeNamedCounts(existing.road_type, d.road_type, "label");
        mergeNamedCounts(existing.collision_type, d.collision_type, "label");
      }
    });

    return map;
  }, [districts]);

  const value = useMemo<Ctx>(
    () => ({
      gujaratLoading,
      districtsReady,
      districtsError,
      error,
      gujarat,
      hoveredDistrict,
      setHoveredDistrict,
      getDistrict: (name: string) => lookup.get(normalize(name)),
      getDistrictStatus: (name: string) => {
        if (!districtsReady) return "pending";
        if (districtsError) return "unavailable"; // fetch failed — do NOT claim "no data"
        const d = lookup.get(normalize(name));
        return d && d.total_accidents > 0 ? "found" : "empty";
      },
    }),
    [
      gujaratLoading,
      districtsReady,
      districtsError,
      error,
      gujarat,
      hoveredDistrict,
      lookup,
    ]
  );

  return (
    <DistrictInsightsContext.Provider value={value}>
      {children}
    </DistrictInsightsContext.Provider>
  );
}

/**
 * Custom hook to consume the DistrictInsightsContext.
 * @returns {Ctx} The district insights context value.
 * @throws {Error} If called outside of a DistrictInsightsProvider tree.
 */
export function useDistrictInsights() {
  const ctx = useContext(DistrictInsightsContext);
  if (!ctx)
    throw new Error(
      "useDistrictInsights must be used within DistrictInsightsProvider"
    );
  return ctx;
}
