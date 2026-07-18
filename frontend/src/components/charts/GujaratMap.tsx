/**
 * @file GujaratMap.tsx
 * @description Renders a choropleth map of Gujarat districts, dynamically colored based on a specified statistical metric (e.g., accidents or fatalities).
 * @responsibility Loads TopoJSON/GeoJSON district boundaries, scales data into a color gradient, and projects the geometry onto an SVG.
 * @dependencies d3-geo (projection), d3-scale (color mapping), topojson-client (parsing map files).
 */
import { useEffect, useMemo, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { scaleLinear } from "d3-scale";
import { feature } from "topojson-client";
import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
} from "geojson";
import { GUJARAT_DISTRICTS_GEOJSON_PATH } from "../../config/constants";

type GeoFeature = Feature<Geometry, GeoJsonProperties>;
type GeoFeatureCollection = FeatureCollection<Geometry, GeoJsonProperties>;

/**
 * Props for the GujaratMap component.
 * @property {any[]} data - The dataset containing district-level statistics.
 * @property {string} metric - The specific property key in `data` to use for color scaling (e.g., "accidents", "fatalities").
 */
type GujaratMapProps = {
  data: any[];
  metric: string;
};

const WIDTH = 420;
const HEIGHT = 260;

/**
 * Normalizes string names for robust matching between data arrays and GeoJSON properties.
 * @param {unknown} value - The name to normalize.
 * @returns {string} Lowercase, trimmed string.
 */
function normalizeName(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

/**
 * Type guard to check if an object is a valid GeoJSON FeatureCollection.
 * @param {unknown} value - The object to test.
 * @returns {boolean} True if valid.
 */
function isFeatureCollection(value: unknown): value is GeoFeatureCollection {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as GeoFeatureCollection).type === "FeatureCollection" &&
    Array.isArray((value as GeoFeatureCollection).features)
  );
}

function isFeature(value: unknown): value is GeoFeature {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as GeoFeature).type === "Feature"
  );
}

/**
 * Converts raw map topology (TopoJSON or GeoJSON) into a standard GeoJSON FeatureCollection.
 * @business_rule Allows the component to flexibly accept both raw GeoJSON and compressed TopoJSON formats.
 * @param {unknown} raw - The raw JSON loaded from the map file.
 * @returns {GeoFeatureCollection} A normalized FeatureCollection.
 */
function toFeatureCollection(raw: unknown): GeoFeatureCollection {
  if (isFeatureCollection(raw)) {
    return raw;
  }

  const maybeTopology = raw as {
    type?: string;
    objects?: Record<string, unknown>;
  };

  if (maybeTopology.type === "Topology" && maybeTopology.objects) {
    const firstObject = Object.values(maybeTopology.objects)[0];
    const converted = feature(
      maybeTopology as any,
      firstObject as any
    ) as unknown;

    if (isFeatureCollection(converted)) {
      return converted;
    }

    if (isFeature(converted)) {
      return {
        type: "FeatureCollection",
        features: [converted],
      };
    }
  }

  return {
    type: "FeatureCollection",
    features: [],
  };
}

/**
 * GujaratMap Component
 * @responsibility Fetches geographic boundaries, calculates data domains, and renders a choropleth map using D3 primitives within React SVG.
 * @state_management Manages the loaded GeoJSON features and potential loading failures.
 * @data_flow Map JSON fetched -> Extracted into features -> Data array mapped by district -> Color scales computed -> SVG paths drawn.
 * @hooks_usage Uses `useEffect` for async fetching, and `useMemo` heavily to prevent recalculating geographic projections and color scales on unnecessary renders.
 * @rendering_flow Displays a loading/error state if map file fails, otherwise iterates through features generating `<path>` elements with calculated `d` and `fill` attributes.
 */
export const GujaratMap = ({ data, metric }: GujaratMapProps) => {
  const [features, setFeatures] = useState<GeoFeature[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  /**
   * Fetches the TopoJSON/GeoJSON map file on mount.
   * Uses an abort flag (`cancelled`) to prevent state updates if the component unmounts during the fetch.
   */
  useEffect(() => {
    let cancelled = false;

    fetch(GUJARAT_DISTRICTS_GEOJSON_PATH)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load Gujarat map");
        return res.json();
      })
      .then((raw) => {
        if (!cancelled) {
          setFeatures(toFeatureCollection(raw).features);
          setLoadFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFeatures([]);
          setLoadFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Calculates the maximum value for the current metric to define the upper bound of the color scale.
   * Defaults to 1 to prevent division by zero in d3 scales if data is empty.
   */
  const maxValue = useMemo(() => {
    if (!data || data.length === 0) return 1;
    return Math.max(...data.map((d) => Number(d[metric]) || 0), 1);
  }, [data, metric]);

  /**
   * Indexes the dataset by normalized district name for O(1) lookup during rendering.
   */
  const dataByDistrict = useMemo(() => {
    return new Map(data?.map((d) => [normalizeName(d.district), d]) ?? []);
  }, [data]);

  /**
   * Defines a linear color scale mapping values from 0 to maxValue into a blue gradient.
   */
  const colorScale = useMemo(
    () =>
      scaleLinear<string>().domain([0, maxValue]).range(["#EEF3FF", "#2C6EF2"]),
    [maxValue]
  );

  /**
   * Generates a geographic path generator configured with a Mercator projection,
   * automatically fitted to the defined WIDTH and HEIGHT dimensions.
   */
  const path = useMemo(() => {
    const collection: GeoFeatureCollection = {
      type: "FeatureCollection",
      features,
    };

    const projection = geoMercator();
    projection.fitSize([WIDTH, HEIGHT], collection);

    return geoPath(projection);
  }, [features]);

  if (loadFailed) {
    return (
      <div className="flex h-[260px] w-full items-center justify-center rounded-lg bg-[#F7F9FD] text-xs font-semibold text-[#9BA3C2]">
        Gujarat map file not found
      </div>
    );
  }

  return (
    <div className="h-[260px] w-full">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-full w-full"
        role="img"
        aria-label="Gujarat district intensity map"
      >
        {features.map((geo, index) => {
          const properties = geo.properties ?? {};
          // Fallbacks for various common property keys found in Indian geographic datasets
          const districtName =
            properties.dtname ||
            properties.DTNAME ||
            properties.district ||
            properties.name ||
            properties.NAME;

          const matchedData = dataByDistrict.get(normalizeName(districtName));
          const value = matchedData ? Number(matchedData[metric]) || 0 : 0;

          return (
            <path
              key={`${geo.id ?? districtName ?? index}`}
              d={path(geo) ?? ""}
              fill={matchedData ? colorScale(value) : "#F1F4FB"}
              stroke="#FFFFFF"
              strokeWidth={0.5}
              className="transition-colors duration-150 hover:fill-[#1A1D2E]"
            >
              <title>
                {districtName
                  ? `${districtName}: ${value.toLocaleString("en-IN")}`
                  : "District"}
              </title>
            </path>
          );
        })}
      </svg>
    </div>
  );
};
