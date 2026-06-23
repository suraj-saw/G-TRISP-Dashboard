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

type GeoFeature = Feature<Geometry, GeoJsonProperties>;
type GeoFeatureCollection = FeatureCollection<Geometry, GeoJsonProperties>;

type GujaratMapProps = {
  data: any[];
  metric: string;
};

const WIDTH = 420;
const HEIGHT = 260;

function normalizeName(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

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

export const GujaratMap = ({ data, metric }: GujaratMapProps) => {
  const [features, setFeatures] = useState<GeoFeature[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/gujarat.json")
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

  const maxValue = useMemo(() => {
    if (!data || data.length === 0) return 1;
    return Math.max(...data.map((d) => Number(d[metric]) || 0), 1);
  }, [data, metric]);

  const dataByDistrict = useMemo(() => {
    return new Map(data?.map((d) => [normalizeName(d.district), d]) ?? []);
  }, [data]);

  const colorScale = useMemo(
    () =>
      scaleLinear<string>().domain([0, maxValue]).range(["#EEF3FF", "#2C6EF2"]),
    [maxValue]
  );

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
