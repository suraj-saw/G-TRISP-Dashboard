/**
 * @file VisualizationCategoryPanel.tsx
 * @description Simple cascading visualization picker.
 *   Row 1: three plain toggle chips (Blackspots / Hotspots / Test Visualization).
 *   Below: for each active category, a standard labeled filter row appears.
 */

import { useEffect, useState } from "react";
import FilterSelect from "../layout/FilterSelect";
import BlackspotYearRangeInlineCard from "./BlackspotYearRangeInlineCard";
import { isBlackspotVisualization } from "../../utils/dashboardFilters";
import {
  BLACKSPOT_OPTIONS,
  HOTSPOT_OPTIONS,
  TEST_VISUALIZATION_OPTIONS,
} from "../../features/dashboard/filterConfig";

type CategoryId = "blackspots" | "hotspots" | "test_visualization";

const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: "blackspots",        label: "Blackspots" },
  { id: "hotspots",          label: "Hotspots"   },
  { id: "test_visualization",label: "Test Viz"   },
];

const SUB_LABEL: Record<CategoryId, string> = {
  blackspots:         "Blackspot Method",
  hotspots:           "Hotspot Type",
  test_visualization: "Test Method",
};

const SUB_OPTIONS: Record<CategoryId, { value: string; label: string }[]> = {
  blackspots:         BLACKSPOT_OPTIONS,
  hotspots:           HOTSPOT_OPTIONS,
  test_visualization: TEST_VISUALIZATION_OPTIONS,
};

interface Props {
  blackspots: string[];
  hotspots: string[];
  testVisualization: string[];
  selectedYears: string[];
  availableYears: number[];
  onBlackspotsChange: (v: string[]) => void;
  onHotspotsChange: (v: string[]) => void;
  onTestVisualizationChange: (v: string[]) => void;
  onYearsChange: (years: string[]) => void;
}

function valuesFor(
  id: CategoryId,
  blackspots: string[],
  hotspots: string[],
  testViz: string[]
): string[] {
  if (id === "blackspots") return blackspots;
  if (id === "hotspots") return hotspots;
  return testViz;
}

export default function VisualizationCategoryPanel({
  blackspots,
  hotspots,
  testVisualization,
  selectedYears,
  availableYears,
  onBlackspotsChange,
  onHotspotsChange,
  onTestVisualizationChange,
  onYearsChange,
}: Props) {
  const [expanded, setExpanded] = useState<Set<CategoryId>>(() => {
    const s = new Set<CategoryId>();
    if (blackspots.length > 0) s.add("blackspots");
    if (hotspots.length > 0)   s.add("hotspots");
    if (testVisualization.length > 0) s.add("test_visualization");
    return s;
  });

  // Collapse when Reset Filters clears values externally
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      if (blackspots.length === 0 && next.has("blackspots"))         { next.delete("blackspots");         changed = true; }
      if (hotspots.length === 0 && next.has("hotspots"))             { next.delete("hotspots");           changed = true; }
      if (testVisualization.length === 0 && next.has("test_visualization")) { next.delete("test_visualization"); changed = true; }
      return changed ? next : prev;
    });
  }, [blackspots.length, hotspots.length, testVisualization.length]);

  const isExpanded = (id: CategoryId) =>
    expanded.has(id) || valuesFor(id, blackspots, hotspots, testVisualization).length > 0;

  const toggle = (id: CategoryId) => {
    if (isExpanded(id)) {
      setExpanded((p) => { const n = new Set(p); n.delete(id); return n; });
      if (id === "blackspots")         onBlackspotsChange([]);
      else if (id === "hotspots")       onHotspotsChange([]);
      else                              onTestVisualizationChange([]);
    } else {
      setExpanded((p) => new Set(p).add(id));
    }
  };

  const handleSubChange = (id: CategoryId, v: string | string[]) => {
    const arr = Array.isArray(v) ? v : v ? [v] : [];
    if (id === "blackspots")         onBlackspotsChange(arr);
    else if (id === "hotspots")       onHotspotsChange(arr);
    else                              onTestVisualizationChange(arr);
  };

  const hasActiveBlackspot = blackspots.some(isBlackspotVisualization);

  return (
    <div className="flex flex-col gap-3">
      {/* ── Category toggle chips ─────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <span className="px-0.5 text-[11px] font-bold uppercase tracking-wider text-[#1e3a8a]">
          Visualization
        </span>
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map(({ id, label }) => {
            const active = isExpanded(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition cursor-pointer
                  ${active
                    ? "border-[#1e3a8a] bg-[#1e3a8a] text-white"
                    : "border-[#E4E8F4] bg-[#F7F9FD] text-[#6B7299] hover:border-[#C9CEDF] hover:text-[#1A1D2E]"
                  }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Sub-option rows ───────────────────────────────────────── */}
      {CATEGORIES.map(({ id, label }) => {
        if (!isExpanded(id)) return null;
        const values = valuesFor(id, blackspots, hotspots, testVisualization);

        return (
          <div key={id} className="flex flex-col gap-1.5">
            {/* Label — identical style to every other filter label */}
            <label className="px-0.5 text-[11px] font-bold uppercase tracking-wider text-[#1e3a8a]">
              {SUB_LABEL[id]}
            </label>

            <FilterSelect
              key={`${id}-${values.length > 0 ? "active" : "empty"}`}
              value={values}
              options={SUB_OPTIONS[id]}
              onChange={(v) => handleSubChange(id, v)}
              multiSelect
            />

            {/* Year Range — only for Blackspots when a blackspot type is selected */}
            {id === "blackspots" && hasActiveBlackspot && (
              <BlackspotYearRangeInlineCard
                onConfirm={onYearsChange}
                availableYears={availableYears}
                selectedYears={selectedYears}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
