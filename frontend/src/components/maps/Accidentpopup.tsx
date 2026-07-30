/**
 * @file Accidentpopup.tsx
 * @description Shared accident detail popup used across multiple map layers.
 * @responsibility Renders a map-anchored tooltip displaying detailed accident metadata in a sleek, compact layout.
 * @dependencies react-map-gl/maplibre, lucide-react
 */

import { Popup } from "react-map-gl/maplibre";
import { Calendar, X } from "lucide-react";

export interface AccidentPopupData {
  longitude: number;
  latitude: number;
  severity?: string; // e.g. "Fatal", "Grievous", "Simple", "Damage Only"
  accident_date?: string; // ISO or dd-mm-yyyy
  accident_date_time?: string | null;
  accident_id?: string | number;
  collision_type?: string | null;
  road_class?: string | null;
  road_classification?: string | null;
  police_station?: string | null;
}

interface Props {
  data: AccidentPopupData;
  onClose: () => void;
}

const NULL_TEXT_SENTINEL = "nan";
const UNKNOWN_LABEL = "Unknown";

function safeText(value?: string | null): string {
  if (!value || value === NULL_TEXT_SENTINEL) return UNKNOWN_LABEL;
  return value;
}

function formatDate(raw?: string | null): string {
  if (!raw) return UNKNOWN_LABEL;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getSeverityTheme(severity?: string | null) {
  const s = (severity || "").toLowerCase();
  if (s.includes("fatal")) {
    return {
      label: "FATAL",
      bg: "#FEF2F2",
      textColor: "text-slate-800",
      labelColor: "text-red-700 font-bold",
      borderColor: "border-red-200/90",
      ringColor: "ring-1 ring-red-500/20",
    };
  }
  if (s.includes("grievous")) {
    return {
      label: "GRIEVOUS",
      bg: "#FFF7ED",
      textColor: "text-slate-800",
      labelColor: "text-orange-700 font-bold",
      borderColor: "border-orange-200/90",
      ringColor: "ring-1 ring-orange-500/20",
    };
  }
  if (s.includes("non")) {
    return {
      label: "MINOR (NON-HOSP)",
      bg: "#F0F9FF",
      textColor: "text-slate-800",
      labelColor: "text-sky-700 font-bold",
      borderColor: "border-sky-200/90",
      ringColor: "ring-1 ring-sky-500/20",
    };
  }
  if (s.includes("hospitalized") || s.includes("hosp") || s.includes("minor")) {
    return {
      label: "MINOR (HOSPITALIZED)",
      bg: "#FEFCE8",
      textColor: "text-slate-800",
      labelColor: "text-yellow-700 font-bold",
      borderColor: "border-yellow-200/90",
      ringColor: "ring-1 ring-yellow-500/20",
    };
  }
  if (s.includes("no injury") || s.includes("damage")) {
    return {
      label: "NO INJURY / DAMAGE",
      bg: "#F0FDF4",
      textColor: "text-slate-800",
      labelColor: "text-emerald-700 font-bold",
      borderColor: "border-emerald-200/90",
      ringColor: "ring-1 ring-emerald-500/20",
    };
  }
  return {
    label: safeText(severity).toUpperCase(),
    bg: "#F8FAFC",
    textColor: "text-slate-800",
    labelColor: "text-slate-600 font-bold",
    borderColor: "border-slate-200/90",
    ringColor: "ring-1 ring-slate-400/20",
  };
}

/**
 * Compact Popup Body Component for individual accident point inspection
 */
export function CompactAccidentPopupBody({
  selected,
  onClose,
}: {
  selected: AccidentPopupData;
  onClose?: () => void;
}) {
  const theme = getSeverityTheme(selected.severity);
  const dateStr = formatDate(selected.accident_date_time || selected.accident_date);
  const roadClass = selected.road_classification || selected.road_class;

  return (
    <div
      className={`rounded-xl shadow-lg p-2.5 w-[190px] sm:w-[200px] ${theme.textColor} ${theme.ringColor} border ${theme.borderColor} font-sans tracking-tight leading-tight select-text transition-all`}
      style={{ backgroundColor: theme.bg }}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-slate-200/60">
        <span className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-700">
          <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
          {dateStr}
        </span>
        <div className="flex items-center gap-1 ml-auto">
          {selected.accident_id && (
            <span
              className="font-mono text-[9.5px] text-slate-400 truncate max-w-[85px]"
              title={`ID: ${selected.accident_id}`}
            >
              #{selected.accident_id}
            </span>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-0.5 rounded-full hover:bg-slate-200/80 text-slate-400 hover:text-slate-700 transition-colors ml-1 cursor-pointer"
              title="Close popup"
              type="button"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Details Grid */}
      <div className="mt-1.5 space-y-1 text-[10.5px]">
        {/* Severity Label */}
        <div className="flex items-baseline justify-between gap-1">
          <span className={`text-[9.5px] uppercase tracking-wider ${theme.labelColor} shrink-0`}>
            Severity
          </span>
          <span className="font-semibold text-slate-800 text-right truncate max-w-[110px]">
            {theme.label}
          </span>
        </div>

        {/* Collision Type */}
        <div className="flex items-baseline justify-between gap-1">
          <span className={`text-[9.5px] uppercase tracking-wider ${theme.labelColor} shrink-0`}>
            Collision
          </span>
          <span
            className="font-semibold text-slate-700 text-right truncate max-w-[110px]"
            title={safeText(selected.collision_type)}
          >
            {safeText(selected.collision_type)}
          </span>
        </div>

        {/* Coordinates */}
        <div className="flex items-baseline justify-between gap-1">
          <span className={`text-[9.5px] uppercase tracking-wider ${theme.labelColor} shrink-0`}>
            Coords
          </span>
          <span className="font-mono text-[10px] font-medium text-slate-600 text-right">
            {selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}
          </span>
        </div>

        {/* Road Class */}
        {roadClass && (
          <div className="flex items-baseline justify-between gap-1">
            <span className={`text-[9.5px] uppercase tracking-wider ${theme.labelColor} shrink-0`}>
              Road Class
            </span>
            <span
              className="font-medium text-slate-700 text-right truncate max-w-[105px]"
              title={safeText(roadClass)}
            >
              {safeText(roadClass)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * AccidentPopup Component
 */
export default function AccidentPopup({ data, onClose }: Props) {
  return (
    <Popup
      longitude={data.longitude}
      latitude={data.latitude}
      anchor="bottom"
      offset={[0, -10]}
      closeOnClick={false}
      onClose={onClose}
      className="accident-popup"
    >
      <CompactAccidentPopupBody selected={data} onClose={onClose} />
    </Popup>
  );
}
