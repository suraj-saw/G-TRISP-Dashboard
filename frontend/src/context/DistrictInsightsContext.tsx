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

/** Context interface for district insights data */
interface Ctx {
  gujaratLoading: boolean; // blocks initial paint only — should be fast
  districtsReady: boolean; // becomes true once hover data is available
  districtsError: boolean;
  error: string | null;
  gujarat: GujaratWideSummary | null;
  hoveredDistrict: string | null;
  setHoveredDistrict: (name: string | null) => void;
  /** "found" = has data, "empty" = loaded but zero accidents, "pending" = still loading */
  getDistrictStatus: (name: string) => "found" | "empty" | "pending" | "unavailable";
  getDistrict: (name: string) => DistrictInsight | undefined;
}

const DistrictInsightsContext = createContext<Ctx | undefined>(undefined);
const normalize = (name: string) => name.trim().toLowerCase();

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
    if (districts) {
      Object.values(districts).forEach((d) =>
        map.set(normalize(d.district), d)
      );
    }
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

export function useDistrictInsights() {
  const ctx = useContext(DistrictInsightsContext);
  if (!ctx)
    throw new Error(
      "useDistrictInsights must be used within DistrictInsightsProvider"
    );
  return ctx;
}
