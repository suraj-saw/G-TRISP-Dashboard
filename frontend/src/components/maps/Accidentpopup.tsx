// frontend/src/components/maps/AccidentPopup.tsx
// Shared accident detail popup used by AccidentMarkerMap, BlackspotDetectionLayers,
// DbscanBlackspotDetectionLayers, and WeightedKdeHeatmapLayers.

import { Popup } from "react-map-gl/maplibre";

export interface AccidentPopupData {
  longitude: number;
  latitude: number;
  severity: string; // e.g. "Fatal", "Grievous", "Simple", "Damage Only"
  accident_date: string; // ISO or dd-mm-yyyy
  accident_id: string | number;
  collision_type?: string;
  road_class?: string;
}

interface Props {
  data: AccidentPopupData;
  onClose: () => void;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function severityLabel(raw: string): string {
  const map: Record<string, string> = {
    fatal: "FATAL",
    grievous: "GRIEVOUS",
    simple: "SIMPLE",
    "damage only": "DAMAGE ONLY",
  };
  return map[raw?.toLowerCase()] ?? raw?.toUpperCase() ?? "UNKNOWN";
}

function severityColor(raw: string): string {
  switch (raw?.toLowerCase()) {
    case "fatal":
      return "bg-red-100 text-red-700 border border-red-300";
    case "grievous":
      return "bg-orange-100 text-orange-700 border border-orange-300";
    case "simple":
      return "bg-yellow-100 text-yellow-700 border border-yellow-300";
    case "damage only":
      return "bg-blue-100 text-blue-700 border border-blue-300";
    default:
      return "bg-gray-100 text-gray-700 border border-gray-300";
  }
}

function formatDate(raw: string): string {
  if (!raw) return "—";
  // Handle ISO: "2025-08-12T..."
  if (raw.includes("T") || raw.includes("-")) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
  }
  return raw;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function AccidentPopup({ data, onClose }: Props) {
  const {
    longitude,
    latitude,
    severity,
    accident_date,
    accident_id,
    collision_type,
    road_class,
  } = data;

  return (
    <Popup
      longitude={longitude}
      latitude={latitude}
      anchor="bottom"
      offset={[0, -10] as [number, number]}
      closeOnClick={false}
      onClose={onClose}
      maxWidth="300px"
      className="accident-popup"
    >
      {/* Override maplibre popup padding via inline style on the wrapper */}
      <div className="bg-white rounded-lg shadow-xl p-4 min-w-[240px] font-sans">
        {/* ── header row ── */}
        <div className="flex items-center justify-between mb-3">
          <span
            className={`text-xs font-bold px-2 py-1 rounded ${severityColor(severity)}`}
          >
            {severityLabel(severity)}
          </span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* ── date + id ── */}
        <p className="text-sm text-gray-500 mb-3">
          {formatDate(accident_date)}
          {accident_id && (
            <>
              <span className="mx-2 text-gray-300">•</span>
              <span>ID: {accident_id}</span>
            </>
          )}
        </p>

        {/* ── collision type ── */}
        {collision_type && (
          <div className="mb-3">
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-0.5">
              Collision Type
            </p>
            <p className="text-sm font-semibold text-gray-800">
              {collision_type}
            </p>
          </div>
        )}

        {/* ── coordinates + road class ── */}
        <div className="grid grid-cols-2 gap-3 mt-1">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-0.5">
              Coordinates
            </p>
            <p className="text-sm font-semibold text-gray-800">
              {latitude.toFixed(4)}, {longitude.toFixed(4)}
            </p>
          </div>
          {road_class && (
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400 mb-0.5">
                Road Class
              </p>
              <p className="text-sm font-semibold text-gray-800">
                {road_class}
              </p>
            </div>
          )}
        </div>
      </div>
    </Popup>
  );
}
