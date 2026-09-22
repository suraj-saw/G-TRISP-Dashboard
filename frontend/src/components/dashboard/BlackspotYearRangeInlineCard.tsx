/**
 * @file BlackspotYearRangeInlineCard.tsx
 * @description Simple inline year-range selector that appears below the blackspot filter.
 *   Looks and behaves like any other filter row — just a label + a dropdown.
 *   Auto-confirms when the user picks a year range (no explicit Apply button needed).
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

interface BlackspotYearRangeInlineCardProps {
  onConfirm: (selectedYears: string[]) => void;
  availableYears: number[];
  selectedYears?: string[];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  visualizationType?: string;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  visualizationLabel?: string;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onClose?: () => void;
}

const EXACT_YEAR_SPAN = 3;

interface YearRangeOption {
  value: string;
  label: string;
  years: string[];
}

function buildOptions(availableYears: number[]): YearRangeOption[] {
  const valid = Array.from(new Set(availableYears.filter((y) => !isNaN(y) && y > 1900))).sort(
    (a, b) => a - b
  );

  if (valid.length < EXACT_YEAR_SPAN) {
    const max = valid.length > 0 ? valid[valid.length - 1] : 2026;
    const start = max - EXACT_YEAR_SPAN + 1;
    const years: string[] = [];
    for (let y = start; y <= max; y++) years.push(String(y));
    return [{ value: `${start}-${max}`, label: `${start} – ${max}`, years }];
  }

  const maxYear = valid[valid.length - 1];
  const options: YearRangeOption[] = valid
    .filter((y) => y + EXACT_YEAR_SPAN - 1 <= maxYear)
    .map((start) => {
      const end = start + EXACT_YEAR_SPAN - 1;
      const years: string[] = [];
      for (let y = start; y <= end; y++) years.push(String(y));
      return { value: `${start}-${end}`, label: `${start} – ${end}`, years };
    });

  // Latest first
  options.sort((a, b) => parseInt(b.value) - parseInt(a.value));
  return options;
}

export default function BlackspotYearRangeInlineCard({
  onConfirm,
  availableYears,
  selectedYears = [],
}: BlackspotYearRangeInlineCardProps) {
  const options = useMemo(() => buildOptions(availableYears), [availableYears]);

  const initialValue = useMemo(() => {
    if (selectedYears.length === EXACT_YEAR_SPAN) {
      const sorted = [...selectedYears].sort();
      const candidate = `${sorted[0]}-${sorted[sorted.length - 1]}`;
      if (options.some((o) => o.value === candidate)) return candidate;
    }
    return options[0]?.value ?? "";
  }, [selectedYears, options]);

  const [value, setValue] = useState(initialValue);

  // Auto-confirm on mount only when no valid 3-year range is already selected.
  // This fires when a blackspot is newly added; skips if the user already has years set.
  useEffect(() => {
    if (selectedYears.length === EXACT_YEAR_SPAN) return; // already set — don't overwrite
    const opt = options.find((o) => o.value === initialValue) ?? options[0];
    if (opt) onConfirm(opt.years);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    setValue(next);
    const opt = options.find((o) => o.value === next);
    if (opt) onConfirm(opt.years);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* Label — same style as every other filter label */}
      <label className="px-0.5 text-[11px] font-bold uppercase tracking-wider text-[#1e3a8a]">
        Year Range
      </label>

      {/* Styled native select — matches the sidebar's look */}
      <div className="relative">
        <select
          value={value}
          onChange={handleChange}
          className="w-full appearance-none rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] py-2 pl-3 pr-8 text-[13px] font-medium text-[#1A1D2E] outline-none transition hover:border-[#C9CEDF] focus:border-[#1e3a8a] focus:bg-white focus:ring-2 focus:ring-[#1e3a8a]/10 cursor-pointer"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6B7299]"
        />
      </div>
    </div>
  );
}
