// frontend/src/features/dashboard/district/YearRangeFilter.tsx

/**
 * @file YearRangeFilter.tsx
 * @description A dual-dropdown year range selector that enforces a minimum 3-year span.
 * @responsibility Replaces date_from/date_to pickers for blackspot visualizations,
 *   emitting an array of year strings covering the selected range.
 */

import { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, CalendarRange } from "lucide-react";

const MIN_YEAR_SPAN = 3; // Minimum number of years in the range (inclusive)

interface YearRangeFilterProps {
  /** All available year values, e.g. [2019, 2020, 2021, 2022, 2023, 2024] */
  availableYears: number[];
  /** Currently selected years as an array of strings e.g. ["2020","2021","2022"] */
  selectedYears: string[];
  /** Callback when the year range changes */
  onChange: (years: string[]) => void;
}

// ── Portaled year dropdown ──────────────────────────────────────────────────

const MENU_MAX_HEIGHT = 220;
const VIEWPORT_MARGIN = 12;
const TRIGGER_GAP = 6;

type MenuPos =
  | { openUp: false; top: number; left: number; width: number; maxHeight: number }
  | { openUp: true; bottom: number; left: number; width: number; maxHeight: number };

function YearDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number | null;
  options: number[];
  onChange: (year: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;
    const openUp = spaceBelow < MENU_MAX_HEIGHT && spaceAbove > spaceBelow;
    const available = openUp ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(96, Math.min(MENU_MAX_HEIGHT, available - TRIGGER_GAP));

    if (openUp) {
      setPos({
        openUp: true,
        bottom: window.innerHeight - rect.top + TRIGGER_GAP,
        left: rect.left,
        width: rect.width,
        maxHeight,
      });
    } else {
      setPos({
        openUp: false,
        top: rect.bottom + TRIGGER_GAP,
        left: rect.left,
        width: rect.width,
        maxHeight,
      });
    }
  };

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const reposition = () => updatePosition();
    document.addEventListener("mousedown", handlePointer);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7299]">
        {label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium text-[#1A1D2E] outline-none transition cursor-pointer ${
          open
            ? "border-[#1e3a8a] ring-2 ring-[#1e3a8a]/10 bg-white"
            : "border-[#E4E8F4] bg-[#F7F9FD] hover:border-[#C9CEDF]"
        }`}
      >
        <span className="truncate">{value ?? "Select"}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-[#9BA3C2] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open &&
        pos &&
        createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            style={{
              position: "fixed",
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
              zIndex: 9999,
              ...(pos.openUp ? { bottom: pos.bottom } : { top: pos.top }),
            }}
            className="overflow-y-auto no-scrollbar rounded-xl border border-[#E4E8F4] bg-white p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.18)]"
          >
            {options.map((year) => {
              const isSelected = year === value;
              return (
                <li key={year} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(year);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition ${
                      isSelected
                        ? "bg-[#1e3a8a] font-semibold text-white"
                        : "font-medium text-[#3A4060] hover:bg-[#EEF2FB] hover:text-[#1e3a8a]"
                    }`}
                  >
                    <span className="truncate">{year}</span>
                    {isSelected && <Check size={14} className="ml-auto shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body
        )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

/**
 * Builds a sorted ascending array of year strings from startYear to endYear (inclusive).
 */
function buildYearRange(startYear: number, endYear: number): string[] {
  const years: string[] = [];
  for (let y = startYear; y <= endYear; y++) {
    years.push(String(y));
  }
  return years;
}

export default function YearRangeFilter({
  availableYears,
  selectedYears,
  onChange,
}: YearRangeFilterProps) {
  const sortedYears = useMemo(
    () => [...availableYears].sort((a, b) => a - b),
    [availableYears]
  );

  // Derive current start/end from the selected years array
  const currentStart = useMemo(() => {
    if (selectedYears.length === 0) return null;
    return Math.min(...selectedYears.map(Number));
  }, [selectedYears]);

  const currentEnd = useMemo(() => {
    if (selectedYears.length === 0) return null;
    return Math.max(...selectedYears.map(Number));
  }, [selectedYears]);

  // Valid start years: any year where start + MIN_YEAR_SPAN - 1 <= max available year
  const startYearOptions = useMemo(() => {
    if (sortedYears.length < MIN_YEAR_SPAN) return sortedYears;
    const maxYear = sortedYears[sortedYears.length - 1];
    return sortedYears.filter((y) => y + MIN_YEAR_SPAN - 1 <= maxYear);
  }, [sortedYears]);

  // Valid end years: must be >= start + MIN_YEAR_SPAN - 1
  const endYearOptions = useMemo(() => {
    if (sortedYears.length < MIN_YEAR_SPAN) return sortedYears;
    const minStart = currentStart !== null ? currentStart : sortedYears[0];
    return sortedYears.filter((y) => y >= minStart + MIN_YEAR_SPAN - 1);
  }, [sortedYears, currentStart]);

  const handleStartChange = (year: number) => {
    let endYear = currentEnd;
    // If no end selected, or if current end is too close, auto-adjust
    if (endYear === null || endYear - year < MIN_YEAR_SPAN - 1) {
      endYear = year + MIN_YEAR_SPAN - 1;
      // Clamp to max available year
      const maxAvailable = sortedYears[sortedYears.length - 1];
      if (endYear > maxAvailable) endYear = maxAvailable;
    }
    onChange(buildYearRange(year, endYear));
  };

  const handleEndChange = (year: number) => {
    let startYear = currentStart;
    // If no start selected, or if current start is too close, auto-adjust
    if (startYear === null || year - startYear < MIN_YEAR_SPAN - 1) {
      startYear = year - MIN_YEAR_SPAN + 1;
      // Clamp to min available year
      const minAvailable = sortedYears[0];
      if (startYear < minAvailable) startYear = minAvailable;
    }
    onChange(buildYearRange(startYear, year));
  };

  // Range info
  const rangeSpan =
    currentStart !== null && currentEnd !== null
      ? currentEnd - currentStart + 1
      : 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Header with icon */}
      <div className="flex items-center gap-1.5">
        <CalendarRange size={12} className="text-[#6B7299]" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7299]">
          Year Range (min. {MIN_YEAR_SPAN} years)
        </span>
      </div>

      {/* Two dropdowns side by side */}
      <div className="grid grid-cols-2 gap-2">
        <YearDropdown
          label="From"
          value={currentStart}
          options={startYearOptions}
          onChange={handleStartChange}
        />
        <YearDropdown
          label="To"
          value={currentEnd}
          options={endYearOptions}
          onChange={handleEndChange}
        />
      </div>

      {/* Range indicator */}
      {rangeSpan > 0 && (
        <div className="flex items-center gap-1.5 rounded-lg bg-[#EEF2FB] px-2.5 py-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-[#1e3a8a]" />
          <span className="text-[11px] font-medium text-[#1e3a8a]">
            {currentStart}–{currentEnd} · {rangeSpan} year{rangeSpan !== 1 ? "s" : ""} selected
          </span>
        </div>
      )}
    </div>
  );
}
